// ============================================================================
// main — 부트스트랩. 소스만 갈아끼우면 나머지는 그대로(하이브리드의 핵심).
//
//   기본             : ScriptedSource (스크립트 이벤트, 오프라인)
//   ?live 쿼리 붙이면 : SSESource (백엔드에서 실제/목 이벤트 수신)
//
// 흐름: 소스 ──의미 이벤트──▶ [검증] ──▶ EventQueue ──▶ Choreographer ──▶ World ──▶ Renderer/UI
// ============================================================================
import { clock } from './clock.js';
import { World } from './world.js';
import { Choreographer } from './choreographer.js';
import { EventQueue } from './eventQueue.js';
import { ScriptedSource } from './sources/ScriptedSource.js';
import { SSESource } from './sources/SSESource.js';
import { validate } from './protocol.js';
import { initRenderer, render } from './renderer.js';
import { initUI, renderBoard, renderRoster, renderUsage, initApproval, showApproval, initArtifacts, renderArtifacts } from './ui.js';

const LIVE = new URLSearchParams(location.search).has('live');

const world = new World();
initRenderer(document.getElementById('office'), world);
initUI(document.getElementById('board'), document.getElementById('roster'), document.getElementById('usage'), world);

const choreo = new Choreographer(world, {
  onTaskChange: renderBoard,
  onApproval: (ev) => showApproval(ev), // 결재 요청 → 결재 패널 표시
  quiet: LIVE, // 라이브: 가짜 앰비언트 대사 끔 — 실제 작업 내용만 말풍선으로
});
const queue = new EventQueue({ minGap: LIVE ? 0.5 : 0.4 });

// ── 이벤트 소스 선택 ──
const source = LIVE ? new SSESource() : new ScriptedSource();
// 산출물 목록 새로고침(디바운스) — 파일이 생겼을 법한 이벤트마다 잠시 후 1회 조회
let artifactsTimer = 0;
function refreshArtifacts() {
  if (!LIVE) return;
  clearTimeout(artifactsTimer);
  artifactsTimer = setTimeout(async () => {
    const { projects } = await source.artifacts();
    renderArtifacts(projects);
  }, 1200);
}

source.onEvent((ev) => {
  const errs = validate(ev);
  if (errs.length) { console.warn('⚠️ 잘못된 이벤트 무시:', ev, errs); return; }
  // 사용량은 연출/큐를 거치지 않고 바로 집계·표시(데이터성 이벤트)
  if (ev.type === 'agent.usage') {
    world.addUsage(ev.model, ev.input, ev.output, ev.costUsd);
    renderUsage();
    return;
  }
  if (ev.type === 'agent.output' || ev.type === 'approval.request' || ev.type === 'task.advance') refreshArtifacts();
  ev.ts = clock.t;
  queue.push(ev);
});
source.start();

// ── 라이브 모드 UI(프로젝트 주제 입력) ──
if (LIVE) {
  const bar = document.getElementById('topicbar');
  bar.hidden = false;
  const input = document.getElementById('topic');
  const startBtn = document.getElementById('btn-start');
  const modeEl = document.getElementById('mode');
  source.health().then((h) => {
    modeEl.textContent = h
      ? `백엔드: ${h.mode} 모드${h.account?.label ? ` · 🔑 ${h.account.label}` : ''}`
      : '백엔드 미연결 (node server/src/index.mjs)';
  });
  const start = async () => {
    const topic = input.value.trim();
    if (!topic) return;
    startBtn.disabled = true;
    await source.startProject(topic);
    setTimeout(() => { startBtn.disabled = false; }, 1500);
  };
  startBtn.onclick = start;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
  // 결재 패널: 승인/반려 결정을 백엔드로 전송 → 파이프라인 재개(승인) 또는 PM 재작성(반려)
  initApproval((approved, feedback) => source.sendApproval(approved, feedback));
  // 산출물 패널: 초기 1회 + 파일 생성 이벤트마다 갱신
  initArtifacts(source.baseUrl);
  refreshArtifacts();
  // 새로고침 복원: 백엔드의 현재 상태(작업/사용량)를 받아 보드·사용량·진행률 재구성
  source.state().then((s) => {
    if (!s?.tasks?.length) return;
    for (const t of s.tasks) world.addTask(t.id, t.name, t.stage);
    for (const [model, u] of Object.entries(s.usage || {})) {
      world.addUsage(model, u.input, u.output, u.cost);
      const cur = world.usage.get(model); if (cur) cur.calls = u.calls; // 호출 수 보정
    }
    renderBoard(); renderUsage();
    if (s.topic) input.value = input.value || s.topic;
  });
}

// ── 메인 루프 ──
let paused = false, last = 0, rosterT = 0;
function loop(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000 || 0);
  last = ts;
  if (!paused) {
    clock.t += dt;
    source.update(dt);                       // 스크립트 소스만 시간 구동(SSE는 no-op)
    queue.tick(dt, (ev) => choreo.handle(ev));
    choreo.updateAmbient(dt);
    world.update(dt);
    rosterT += dt;
    if (rosterT > 0.25) { renderRoster(); rosterT = 0; }
  }
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ── 버튼(스크립트 모드에서만 회의 소집 동작) ──
document.getElementById('btn-meeting').onclick = () => source.triggerMeeting?.();
document.getElementById('btn-pause').onclick = (e) => {
  paused = !paused;
  e.target.textContent = paused ? '▶ 재생' : '⏸ 일시정지';
};

window.__office = { world, source, queue, choreo, live: LIVE };
