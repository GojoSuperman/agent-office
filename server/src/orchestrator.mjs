// ============================================================================
// 실제 오케스트레이터 — 프로젝트 상태 머신 (Claude Agent SDK 백엔드).
// PM 분해 → 단계별 역할 에이전트 → 핸드오프 → QA(반려 시 1회 재작업) → 완료.
// 각 단계에서 의미 이벤트를 방출. 에이전트 실행은 agents.mjs(구독 인증)가 담당.
// ============================================================================
import { Events } from './protocol.mjs';
import { PIPELINE } from './roles.mjs';
import { planTasks, runRole, runQA } from './agents.mjs';

export async function runLive(topic, emit, signal, gate) {
  const alive = () => !signal?.aborted;
  const projectId = 'p' + Date.now();

  // ── 기획 + 결재 게이트: PM 플랜 → 최고 승인자(사용자) 승인 후에만 진행. 반려 시 피드백 반영 재작성 ──
  emit(Events.meetingStart('킥오프 · ' + topic));
  let names;
  let feedback = '';
  for (let revision = 1; ; revision++) {
    const r = await planTasks({ topic, projectId, emit, feedback });
    names = r.names;
    if (!alive()) return;
    if (revision === 1) emit(Events.meetingEnd());
    if (!gate) break; // 게이트 미지원 호출(하위 호환) → 종전처럼 즉시 진행
    emit(Events.approvalRequest(r.plan, revision));
    const d = await gate.wait();
    if (!alive()) return;
    if (d.approved) { emit(Events.approvalGranted()); break; }
    feedback = d.feedback || '';
    emit(Events.approvalRejected(feedback));
  }

  let seq = 1;
  const tasks = names.map((name) => ({ id: seq++, name }));
  for (const t of tasks) emit(Events.taskCreate(t.id, t.name, '기획'));

  for (const t of tasks) {
    if (!alive()) return;
    let prev = 'pm';
    for (const { stage, owner } of PIPELINE) {
      if (!alive()) return;
      emit(Events.taskHandoff(t.id, prev, owner));
      emit(Events.taskAdvance(t.id, stage, owner));

      if (owner === 'qa') {
        const v = await runQA({ taskId: t.id, taskName: t.name, projectId, emit });
        if (!v.pass) {
          // 반려 → 개발자에게 되돌려 1회 재작업 후 재검수
          emit(Events.taskRejected(t.id, 'qa', 'dev'));
          emit(Events.taskAdvance(t.id, '개발', 'dev'));
          await runRole({ roleId: 'dev', taskId: t.id, taskName: t.name + ' (수정)', projectId, emit });
          emit(Events.taskHandoff(t.id, 'dev', 'qa'));
          emit(Events.taskAdvance(t.id, 'QA', 'qa'));
          await runQA({ taskId: t.id, taskName: t.name, projectId, emit });
        }
      } else {
        await runRole({ roleId: owner, taskId: t.id, taskName: t.name, projectId, emit });
      }
      prev = owner;
    }
    emit(Events.taskAdvance(t.id, '완료', undefined));
    emit(Events.output('qa', t.id, t.name));
  }
}
