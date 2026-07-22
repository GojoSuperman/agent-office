// ============================================================================
// 목(Mock) 오케스트레이터 — API 키 없이 SSE 파이프라인을 검증하기 위한 스탠드인.
// 실제 LLM 없이, 주제에 맞춰 "그럴듯한 프로젝트 진행"을 의미 이벤트로 방출한다.
// (프런트 ScriptedSource 의 백엔드 버전)
// ============================================================================
import { Events } from './protocol.mjs';
import { ROLES, PIPELINE } from './roles.mjs';

const TOOLS = {
  architect: ['spec', 'write_file'],
  dev: ['write_file', 'run_tests'],
  designer: ['design', 'write_file'],
  writer: ['write_file', 'read_file'],
  qa: ['run_tests'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 역할→모델 기준 그럴듯한 토큰 사용량(가짜). cost 0 = 구독 느낌.
function fakeUsage(owner, emit) {
  const m = ROLES[owner]?.model || 'claude-opus-4-8';
  const big = m.includes('opus');
  const input = (big ? 2500 : 1500) + Math.floor(Math.random() * (big ? 2500 : 1500));
  const output = (big ? 500 : 300) + Math.floor(Math.random() * (big ? 900 : 600));
  emit(Events.usage(owner, m, input, output, 0));
}

// 주제에서 작업 이름 몇 개를 만들어냄(가짜)
function deriveTasks(topic) {
  const base = (topic || '새 프로젝트').trim();
  return [
    { id: 1, name: `${base} · 핵심 기능` },
    { id: 2, name: `${base} · 화면 UI` },
  ];
}

// 결재용 가짜 플랜 문서(마크다운). live의 plan.md 스탠드인.
function fakePlan(topic, tasks, feedback, revision) {
  const base = (topic || '새 프로젝트').trim();
  return [
    `# ${base} — 실행 플랜(안) v${revision}`,
    '',
    `**목표**: ${base}의 핵심 가치를 최소 범위로 빠르게 구현합니다.`,
    '',
    '## 작업 목록',
    ...tasks.map((t, i) => `${i + 1}. ${t.name}`),
    '',
    '## 진행 방향',
    '- 설계 → 디자인 → 개발 → QA → 문서 순으로 진행',
    '- QA 반려 시 개발 1회 재작업 후 재검수',
    feedback ? `\n> 반영한 피드백: ${feedback}` : '',
  ].join('\n');
}

export async function runMock(topic, emit, signal, gate) {
  const alive = () => !signal?.aborted;

  emit(Events.meetingStart('킥오프 · ' + (topic || '새 프로젝트')));
  await wait(2500); if (!alive()) return;
  emit(Events.meetingEnd());

  emit(Events.thinking('pm', '요구사항 분해 중'));
  await wait(1500); if (!alive()) return;

  // ── 결재 게이트: PM 플랜 → 사용자 승인 후에만 진행. 반려 시 피드백 반영 재작성 ──
  const tasks = deriveTasks(topic);
  let feedback = '';
  for (let revision = 1; gate; revision++) {
    emit(Events.approvalRequest(fakePlan(topic, tasks, feedback, revision), revision));
    fakeUsage('pm', emit);
    const d = await gate.wait();
    if (!alive()) return;
    if (d.approved) { emit(Events.approvalGranted()); break; }
    feedback = d.feedback || '';
    emit(Events.approvalRejected(feedback));
    await wait(1200); if (!alive()) return;
    emit(Events.thinking('pm', '피드백 반영해 플랜 수정 중'));
    await wait(1800); if (!alive()) return;
  }

  for (const t of tasks) { emit(Events.taskCreate(t.id, t.name, '기획')); await wait(600); }
  fakeUsage('pm', emit);

  for (const t of tasks) {
    let prev = 'pm';
    for (const { stage, owner } of PIPELINE) {
      if (!alive()) return;
      emit(Events.taskHandoff(t.id, prev, owner));
      await wait(900);
      emit(Events.taskAdvance(t.id, stage, owner));
      await wait(800);

      if (owner === 'qa') {
        emit(Events.thinking('qa', `${t.name} 검수 중`));
        await wait(1000);
        emit(Events.toolCall('qa', 'run_tests', t.name));
        await wait(1000);
        fakeUsage('qa', emit);
        // 30% 확률로 한 번 반려 후 재작업
        if (Math.random() < 0.3) {
          emit(Events.taskRejected(t.id, 'qa', 'dev'));
          await wait(2600);
          emit(Events.toolCall('dev', 'write_file', `${t.name} 수정`));
          await wait(1200);
          emit(Events.output('dev', t.id, `${t.name}.fix`));
          fakeUsage('dev', emit);
          await wait(800);
          emit(Events.taskAdvance(t.id, 'QA', 'qa'));
          await wait(900);
        }
      } else {
        emit(Events.thinking(owner, `${t.name} 작업 중`));
        await wait(1200);
        emit(Events.toolCall(owner, pick(TOOLS[owner]), t.name));
        await wait(1400);
        emit(Events.output(owner, t.id, `${t.name}.out`));
        fakeUsage(owner, emit);
        await wait(700);
      }
      prev = owner;
    }
    emit(Events.taskAdvance(t.id, '완료', undefined));
    emit(Events.output('qa', t.id, t.name));
    await wait(700);
  }
}
