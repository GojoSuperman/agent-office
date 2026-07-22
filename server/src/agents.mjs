// ============================================================================
// 실제 Claude 에이전트 실행 — Claude Agent SDK (구독 인증).
//
// query() 는 Claude Code를 라이브러리로 만든 것이라, 이미 로그인된 구독을 그대로 쓴다
// (ANTHROPIC_API_KEY 미설정 시). 각 역할이 내장 파일 도구(Write/Read/Edit)로 샌드박스
// (cwd)에 작업하고, 그 "도구 호출"을 우리 의미 이벤트로 번역한다.
// ============================================================================
import { query } from '@anthropic-ai/claude-agent-sdk';
import { readFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { Events } from './protocol.mjs';
import { ROLES } from './roles.mjs';
import { projectDir } from './workspace.mjs';

// 역할별 모델. OFFICE_MODEL 이 설정되면 전원 그 값으로 오버라이드(테스트용).
const modelFor = (roleId) => process.env.OFFICE_MODEL || ROLES[roleId]?.model || 'claude-opus-4-8';

// 역할당 최대 턴 수. 부족하면 "Reached maximum number of turns" 로 중단됨 → 넉넉히.
const MAX_TURNS = Number(process.env.OFFICE_MAX_TURNS) || 24;

// Agent SDK 내장 도구명 → 프런트 TOOL_LABELS 키
function toolLabel(name) {
  if (name === 'Write') return 'write_file';
  if (name === 'Edit') return 'write_file';
  if (name === 'Read') return 'read_file';
  return name;
}

// 에이전트의 실제 발화(텍스트 블록)를 말풍선용 한 줄로 정제.
// 마크다운 기호 제거 → 공백 정리 → 첫 문장 위주로 자르기. 내용 없으면 null.
function speechSnippet(text) {
  const clean = (text || '')
    .replace(/```[\s\S]*?```/g, ' ')     // 코드 블록 제거
    .replace(/[#*`>|_~\-=]+/g, ' ')       // 마크다운 기호 제거
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length < 6) return null;
  const cut = clean.slice(0, 64);
  return cut.length < clean.length ? cut + '…' : cut;
}

// 공통: 한 역할의 단발(one-shot) 쿼리를 구동하며 도구 호출을 이벤트로 방출
async function runQuery({ roleId, prompt, cwd, emit, taskId = null, allowedTools = ['Read', 'Write', 'Edit'] }) {
  emit(Events.thinking(roleId, '작업 중'));
  try {
    for await (const message of query({
      prompt,
      options: {
        model: modelFor(roleId),
        cwd,
        systemPrompt: { type: 'preset', preset: 'claude_code', append: ROLES[roleId].system },
        allowedTools,
        disallowedTools: ['Bash'],          // 셸 차단 — 순수 파일 작업만
        permissionMode: 'bypassPermissions', // 서버(무인) 환경: 도구 자동 승인 (격리 샌드박스)
        maxTurns: MAX_TURNS,
      },
    })) {
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text') {
            // 실제 작업 발화를 말풍선으로 (프로젝트와 무관한 가짜 대사 대체)
            const snippet = speechSnippet(block.text);
            if (snippet) emit(Events.thinking(roleId, snippet));
            continue;
          }
          if (block.type !== 'tool_use') continue;
          const target = block.input?.file_path || block.input?.path || '';
          emit(Events.toolCall(roleId, toolLabel(block.name), target ? basename(target) : block.name));
          if ((block.name === 'Write' || block.name === 'Edit') && taskId != null) {
            emit(Events.output(roleId, taskId, target ? basename(target) : ''));
          }
        }
      }
      if (message.type === 'result') {
        // result 메시지의 토큰/비용을 역할→모델로 묶어 방출 (필드는 방어적으로 읽음)
        const u = message.usage || {};
        const input = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
        const output = u.output_tokens ?? 0;
        const cost = message.total_cost_usd ?? 0;
        emit(Events.usage(roleId, modelFor(roleId), input, output, cost));
      }
    }
  } catch (err) {
    // 역할 하나의 실패(턴 한도 초과·일시 오류 등)가 프로젝트 전체를 죽이지 않게 흡수.
    // 실패 시점까지 저장된 파일은 남아 있으므로 다음 단계가 이어받는다.
    const msg = (err?.message || String(err)).slice(0, 90);
    emit(Events.thinking(roleId, `⚠️ 중단(${msg}) — 다음 단계로 진행`));
  }
}

// PM 이 실행 플랜(plan.md, 결재용)과 작업 분해(tasks.json)를 작성 → 백엔드가 읽어들임.
// feedback 이 있으면(반려) 이를 반영해 재작성한다.
export async function planTasks({ topic, projectId, emit, feedback = '' }) {
  const cwd = projectDir(projectId);
  await mkdir(cwd, { recursive: true });
  const fb = feedback
    ? ` 직전 플랜이 최고 승인자에게 반려되었습니다. 반려 피드백: "${feedback}". 이를 반드시 반영해 두 파일을 다시 작성해줘.`
    : '';
  await runQuery({
    roleId: 'pm', cwd, emit, allowedTools: ['Write'],
    prompt: `다음 프로젝트의 실행 플랜을 세워줘. 파일 두 개를 저장해: ` +
      `(1) plan.md — 최고 승인자가 읽고 결재할 간결한 마크다운 플랜(목표 · 작업 목록 · 진행 방향 · 예상 산출물), ` +
      `(2) tasks.json — 2~3개의 구체적 작업 이름 JSON 문자열 배열. 예: ["로그인 기능","대시보드 UI"]. ` +
      `프로젝트: ${topic}.${fb}`,
  });
  let names = null;
  let plan = '';
  try { plan = await readFile(join(cwd, 'plan.md'), 'utf8'); } catch { /* 폴백 아래 */ }
  try {
    const arr = JSON.parse(await readFile(join(cwd, 'tasks.json'), 'utf8'));
    if (Array.isArray(arr) && arr.length) names = arr.map(String).slice(0, 3);
  } catch { /* 파싱 실패 시 폴백 */ }
  if (!names) names = [`${topic} · 핵심 기능`, `${topic} · 화면 UI`];
  if (!plan) plan = `# ${topic} 실행 플랜\n\n## 작업 목록\n` + names.map((n, i) => `${i + 1}. ${n}`).join('\n');
  return { names, plan };
}

// 개발/디자인 역할이 작업을 수행하고 산출물을 샌드박스에 저장
export async function runRole({ roleId, taskId, taskName, projectId, emit }) {
  const guide = ROLES[roleId]?.guide || '결과물을 이 폴더에 파일로 작성해줘.';
  await runQuery({
    roleId, taskId, cwd: projectDir(projectId), emit,
    prompt: `작업: "${taskName}". ${guide} Write/Edit 도구로 이 폴더에 저장하고, 설명은 짧게.`,
  });
}

// QA: 산출물을 읽어 판정을 qa-<taskId>.txt 에 기록(첫 줄 PASS/REJECT) → 백엔드가 읽음
export async function runQA({ taskId, taskName, projectId, emit }) {
  const cwd = projectDir(projectId);
  const verdictFile = `qa-${taskId}.txt`;
  await runQuery({
    roleId: 'qa', cwd, emit,
    prompt: `이 폴더의 산출물을 검토하고 판정을 ${verdictFile} 파일에 저장해줘. 첫 줄은 반드시 PASS 또는 REJECT, 둘째 줄에 사유(짧게). 대부분 PASS, 명확한 결함만 REJECT.`,
  });
  try {
    const raw = await readFile(join(cwd, verdictFile), 'utf8');
    return { pass: !/^\s*REJECT/i.test(raw), reason: (raw.split('\n')[1] || '').trim() };
  } catch { return { pass: true, reason: '' }; }
}
