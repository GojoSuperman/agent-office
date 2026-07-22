// ============================================================================
// 이벤트 프로토콜 — 프런트엔드/백엔드 사이의 "유일한 계약".
//
// 여기 정의된 "의미(Semantic) 이벤트"만 소스가 방출한다.
//   - 1단계: ScriptedSource 가 생성
//   - 3단계: 실제 에이전트 백엔드(WebSocket)가 동일 스키마로 전송
// 소스가 무엇이든 Choreographer 이하는 이 스키마만 알면 된다.
//
// 연출 명령(move/status/say)은 프로토콜에 없다 — 그건 Choreographer 내부 관심사.
// ============================================================================

export const PROTOCOL_VERSION = 1;

// 이벤트 타입별 필수 필드(런타임 검증용)
const SCHEMA = {
  'task.create':    ['taskId', 'name', 'stage'],
  'task.advance':   ['taskId', 'stage'],          // ownerId 선택
  'task.assigned':  ['taskId', 'agentId'],
  'task.handoff':   ['taskId', 'from', 'to'],
  'task.rejected':  ['taskId', 'from', 'to'],      // QA 반려
  'agent.thinking': ['agentId', 'summary'],
  'agent.tool_call':['agentId', 'tool'],           // target 선택
  'agent.output':   ['agentId', 'taskId'],
  'meeting.start':  ['topic'],
  'meeting.end':    [],
  'agent.usage':    ['agentId', 'model'],          // input/output/costUsd 선택
  'approval.request':  ['plan'],                   // PM 플랜 결재 요청. revision 선택
  'approval.granted':  [],                         // 최고 승인자 승인 → 파이프라인 진행
  'approval.rejected': [],                         // 반려. feedback 선택 → PM 재작성
};

export const EVENT_TYPES = Object.keys(SCHEMA);

// 이벤트 생성 헬퍼. ts 는 소스/큐가 채운다(기본 0).
export function event(type, payload = {}) {
  return { v: PROTOCOL_VERSION, type, ts: 0, ...payload };
}

// 자주 쓰는 이벤트 팩토리(오타 방지)
export const Events = {
  taskCreate:   (taskId, name, stage) => event('task.create', { taskId, name, stage }),
  taskAdvance:  (taskId, stage, ownerId) => event('task.advance', { taskId, stage, ownerId }),
  taskAssigned: (taskId, agentId) => event('task.assigned', { taskId, agentId }),
  taskHandoff:  (taskId, from, to) => event('task.handoff', { taskId, from, to }),
  taskRejected: (taskId, from, to) => event('task.rejected', { taskId, from, to }),
  thinking:     (agentId, summary) => event('agent.thinking', { agentId, summary }),
  toolCall:     (agentId, tool, target) => event('agent.tool_call', { agentId, tool, target }),
  output:       (agentId, taskId, artifact) => event('agent.output', { agentId, taskId, artifact }),
  meetingStart: (topic) => event('meeting.start', { topic }),
  meetingEnd:   () => event('meeting.end', {}),
  usage:        (agentId, model, input, output, costUsd) => event('agent.usage', { agentId, model, input, output, costUsd }),
  approvalRequest:  (plan, revision) => event('approval.request', { plan, revision }),
  approvalGranted:  () => event('approval.granted', {}),
  approvalRejected: (feedback) => event('approval.rejected', { feedback }),
};

// 수신 이벤트 검증 → 문제 없으면 [], 있으면 오류 메시지 배열
export function validate(ev) {
  const errors = [];
  if (!ev || typeof ev !== 'object') return ['이벤트가 객체가 아님'];
  if (ev.v !== PROTOCOL_VERSION) errors.push(`프로토콜 버전 불일치: ${ev.v} (기대 ${PROTOCOL_VERSION})`);
  const required = SCHEMA[ev.type];
  if (!required) { errors.push(`알 수 없는 이벤트 타입: ${ev.type}`); return errors; }
  for (const f of required) {
    if (ev[f] === undefined || ev[f] === null) errors.push(`${ev.type}: 필수 필드 누락 '${f}'`);
  }
  return errors;
}
