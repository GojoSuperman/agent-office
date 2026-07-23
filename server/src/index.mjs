// ============================================================================
// 서버 진입점 — 의존성 0 HTTP + SSE.
//   GET  /events        : 의미 이벤트 SSE 스트림 (프런트 SSESource 가 구독)
//   POST /project {topic}: 프로젝트 시작 (mock 또는 live 오케스트레이터 구동)
//   GET  /health        : 상태 + 현재 모드
//
// 비용 안전장치: 기본은 mock(무료). OFFICE_LIVE=1 이고 SDK 설치 시에만 실제 호출.
// ============================================================================
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createReadStream } from 'node:fs';
import { runMock } from './mock.mjs';
import { listProjects, listFiles, safeReadTarget, projectDir } from './workspace.mjs';
import { suggestNames, sanitizeName } from './naming.mjs';
import { limitNotice } from './limits.mjs';

const PORT = process.env.PORT || 8787;

// 어떤 인증이 잡히는지 최선 추정 (실제 검증은 첫 쿼리 때 SDK가 함)
function authStatus() {
  if (process.env.ANTHROPIC_API_KEY) return { source: 'api-key', ok: true };
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return { source: 'oauth-token', ok: true };
  const dir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  if (existsSync(join(dir, '.credentials.json'))) return { source: 'subscription', ok: true };
  return { source: 'none', ok: false }; // macOS는 Keychain 저장이라 파일이 없을 수 있음(오탐 가능)
}

// 어느 계정으로 로그인됐는지 표시용 라벨 (~/.claude.json 의 oauthAccount 메타데이터 — 토큰 아님)
function accountInfo() {
  const a = authStatus();
  if (a.source === 'api-key') return { label: 'API 키 · 종량제' };
  try {
    // CLAUDE_CONFIG_DIR 프로필 분리 사용 시 그 폴더의 설정을 읽는다 (README '계정 전환' 참고)
    const cfgPath = process.env.CLAUDE_CONFIG_DIR
      ? join(process.env.CLAUDE_CONFIG_DIR, '.claude.json')
      : join(homedir(), '.claude.json');
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    const acc = cfg.oauthAccount;
    if (acc?.emailAddress) return { label: `${acc.emailAddress} · 구독`, email: acc.emailAddress, org: acc.organizationName || '' };
  } catch { /* 파일 없음/파싱 실패 → 아래 폴백 */ }
  return a.ok ? { label: '구독 (계정 정보 없음)' } : { label: '미로그인' };
}

// --- 실제 모드 가능 여부 판정 ---
let liveOk = false;
if (process.env.OFFICE_LIVE === '1') {
  try {
    await import('@anthropic-ai/claude-agent-sdk');
    liveOk = true;
  } catch {
    console.warn('⚠️ OFFICE_LIVE=1 이지만 @anthropic-ai/claude-agent-sdk 미설치 → mock 모드. (server 폴더에서 npm install)');
  }
}
const MODE = liveOk ? 'live' : 'mock';

// --- SSE 클라이언트 집합 + 브로드캐스트 ---
const clients = new Set();
function broadcast(ev) {
  ev.ts = Date.now();
  const line = 'data: ' + JSON.stringify(ev) + '\n\n';
  for (const res of clients) { try { res.write(line); } catch {} }
}

// --- 현재 실행 제어(중복 실행 방지) + 결재 게이트 ---
// 결재 게이트: 오케스트레이터가 gate.wait()로 멈추면, POST /approval 이 그 Promise를
// {approved, feedback} 로 resolve 해 파이프라인을 재개시킨다. 새 프로젝트 시작(abort) 시 자동 해제.
let current = null; // { controller, resolveApproval }

// 현재 실행 상태 거울 — 프런트가 새로고침해도 GET /state 로 보드/사용량을 복원한다.
let runState = null; // { topic, startedAt, tasks:[{id,name,stage}], usage:{model:{input,output,cost,calls}} }
function trackState(ev) {
  if (!runState) return;
  if (ev.type === 'task.create') runState.tasks.push({ id: ev.taskId, name: ev.name, stage: ev.stage });
  if (ev.type === 'task.advance') {
    const t = runState.tasks.find((t) => t.id === ev.taskId);
    if (t) t.stage = ev.stage;
  }
  if (ev.type === 'agent.usage') {
    const u = runState.usage[ev.model] || (runState.usage[ev.model] = { input: 0, output: 0, cost: 0, calls: 0 });
    u.input += ev.input || 0; u.output += ev.output || 0; u.cost += ev.costUsd || 0; u.calls += 1;
  }
}

async function startProject(topic, opts = {}) {
  if (current) current.controller.abort();
  const controller = new AbortController();
  const me = { controller, resolveApproval: null };
  current = me;
  runState = { topic, startedAt: Date.now(), tasks: [], usage: {} };
  const gate = {
    wait: () => new Promise((resolve) => {
      me.resolveApproval = resolve;
      controller.signal.addEventListener('abort', () => resolve({ approved: false }), { once: true });
    }),
  };
  const emit = (ev) => { trackState(ev); broadcast(ev); };
  try {
    if (MODE === 'live') {
      const { runLive } = await import('./orchestrator.mjs');
      await runLive(topic, emit, controller.signal, gate, opts);
    } else {
      await runMock(topic, emit, controller.signal, gate, opts);
    }
  } catch (err) {
    console.error('오케스트레이터 오류:', err);
    emit({ v: 1, type: 'agent.thinking', ts: Date.now(), agentId: 'pm', summary: '오류: ' + (err?.message || err) });
  } finally {
    if (current?.controller === controller) current = null;
  }
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const server = createServer((req, res) => {
  cors(res);
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, mode: MODE, auth: authStatus().source, account: accountInfo(), clients: clients.size, pendingApproval: !!current?.resolveApproval, limit: limitNotice() }));
    return;
  }

  if (url.pathname === '/state' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(runState || {}));
    return;
  }

  if (url.pathname === '/events' && req.method === 'GET') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write('retry: 3000\n\n');
    res.write('data: ' + JSON.stringify({ v: 1, type: 'agent.thinking', ts: Date.now(), agentId: 'pm', summary: `연결됨 (${MODE})` }) + '\n\n');
    clients.add(res);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 15000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  // 프로젝트명 제안 — 의뢰 내용 분석 → 영문 후보 3개 + 한글 설명 (시작 전 사용자 선택용)
  if (url.pathname === '/project/names' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', async () => {
      let topic = '';
      try { topic = (JSON.parse(body || '{}').topic || '').toString().slice(0, 500); } catch {}
      if (!topic) { res.writeHead(400, { 'content-type': 'application/json' }); res.end('{"error":"topic 필요"}'); return; }
      const r = await suggestNames(topic, MODE === 'live');
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(r));
    });
    return;
  }

  if (url.pathname === '/project' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      let topic = '', name = null, description = '', revisionOf = null;
      try {
        const p = JSON.parse(body || '{}');
        topic = (p.topic || '').toString().slice(0, 500);
        name = sanitizeName(p.name);
        description = (p.description || '').toString().slice(0, 120);
        revisionOf = (p.revisionOf || '').toString() || null;
      } catch {}
      if (!topic) { res.writeHead(400, { 'content-type': 'application/json' }); res.end('{"error":"topic 필요"}'); return; }
      if (revisionOf) {
        // 수정 의뢰: 대상 프로젝트 폴더가 실제로 있어야 한다 (경로 문자는 sanitize 없이 존재 검증만)
        if (revisionOf.startsWith('.') || revisionOf.includes('/') || revisionOf.includes('\\') || !existsSync(projectDir(revisionOf))) {
          res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
          res.end('{"error":"수정 대상 프로젝트가 없습니다"}'); return;
        }
        startProject(topic, { revisionOf });
      } else {
        // 새 프로젝트: 선택된 영문명 사용, 폴더 충돌 시 -2, -3… 부여
        if (name) { let n = name, i = 2; while (existsSync(projectDir(n))) n = `${name}-${i++}`; name = n; }
        startProject(topic, { name, description });
      }
      res.writeHead(202, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ started: true, mode: MODE, topic, name, revisionOf }));
    });
    return;
  }

  if (url.pathname === '/approval' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      let approved = false, feedback = '';
      try {
        const p = JSON.parse(body || '{}');
        approved = !!p.approved;
        feedback = (p.feedback || '').toString().slice(0, 2000);
      } catch {}
      const resolve = current?.resolveApproval;
      if (!resolve) {
        res.writeHead(409, { 'content-type': 'application/json; charset=utf-8' });
        res.end('{"error":"대기 중인 결재가 없습니다"}');
        return;
      }
      current.resolveApproval = null;
      resolve({ approved, feedback });
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, approved }));
    });
    return;
  }

  // ── 산출물 열람 (읽기 전용) ──
  //   GET /artifacts                          : 프로젝트 목록 + 각 파일 목록 (최신 20개)
  //   GET /artifacts/<projectId>/<파일경로>    : 파일 제공 (HTML 산출물은 브라우저에서 바로 동작)
  if (url.pathname === '/artifacts' && req.method === 'GET') {
    (async () => {
      const projects = (await listProjects()).slice(0, 20);
      for (const p of projects) p.files = await listFiles(p.id);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ projects }));
    })().catch(() => { res.writeHead(500); res.end('{}'); });
    return;
  }
  if (url.pathname.startsWith('/artifacts/') && req.method === 'GET') {
    const parts = url.pathname.slice('/artifacts/'.length).split('/').map(decodeURIComponent);
    const projectId = parts.shift() || '';
    const rel = parts.join('/');
    const target = projectId && rel && !projectId.startsWith('.') ? safeReadTarget(projectId, rel) : null;
    if (!target || !existsSync(target)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('산출물 없음'); return;
    }
    const TYPES = {
      html: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript',
      json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
    };
    const ext = target.split('.').pop().toLowerCase();
    res.writeHead(200, { 'content-type': `${TYPES[ext] || 'text/plain'}; charset=utf-8` });
    createReadStream(target).pipe(res);
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`▶ 에이전트 사무실 백엔드(${MODE}): http://localhost:${PORT}`);
  console.log(`   SSE: GET /events   시작: POST /project {"topic":"..."}`);
  if (MODE === 'mock') {
    console.log('   (실제 에이전트: server 폴더에서 npm install 후 OFFICE_LIVE=1 로 실행 — 구독 인증 사용, API 키 불필요)');
  } else {
    const a = authStatus();
    if (a.ok) {
      console.log(`   인증: ${a.source} 감지됨 ✓`);
    } else {
      console.log('   ⚠️ 인증이 감지되지 않았습니다. 아래 중 하나로 로그인하세요:');
      console.log('      • 구독:   claude            (브라우저 로그인)');
      console.log('      • 헤드리스: claude setup-token → export CLAUDE_CODE_OAUTH_TOKEN=...');
      console.log('      • API 키:  export ANTHROPIC_API_KEY=...');
      console.log('     (Claude Code 미설치 시: npm i -g @anthropic-ai/claude-code)');
    }
  }
});
