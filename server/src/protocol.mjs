// ============================================================================
// 이벤트 프로토콜 (백엔드) — web/src/protocol.js 와 동일 계약. 둘은 동기화 유지.
// 백엔드는 여기의 팩토리로 "의미 이벤트"만 만들어 SSE로 방출한다.
// ============================================================================
export const PROTOCOL_VERSION = 1;

export function event(type, payload = {}) {
  return { v: PROTOCOL_VERSION, type, ts: 0, ...payload };
}

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
