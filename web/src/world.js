// ============================================================================
// World — 단일 상태 저장소. 에이전트 + 태스크 + 회의 여부.
// 상태를 "바꾸는" 것은 Choreographer 뿐이고, Renderer/UI 는 "읽기"만 한다.
// 태스크의 진실 원천은 소스(백엔드)이며, 여기 tasks 는 이벤트로 채워지는 거울이다.
// ============================================================================
import { Agent } from './agent.js';
import { AGENT_DEFS, STAGES } from './config.js';

// 이벤트의 stage(이름 문자열 또는 인덱스)를 보드 인덱스로 정규화
function stageIndex(stage) {
  if (typeof stage === 'number') return stage;
  const i = STAGES.indexOf(stage);
  return i >= 0 ? i : 0;
}

export class World {
  constructor() {
    this.agents = AGENT_DEFS.map(def => new Agent(def));
    this.byId = Object.fromEntries(this.agents.map(a => [a.id, a]));
    this.tasks = [];          // { id, name, stage }
    this.meetingActive = false;
    this.usage = new Map();   // model → { input, output, cost, calls }
  }

  // 모델별 토큰/비용 누적 (agent.usage 이벤트로 갱신)
  addUsage(model, input = 0, output = 0, cost = 0) {
    const cur = this.usage.get(model) || { input: 0, output: 0, cost: 0, calls: 0 };
    cur.input += input || 0; cur.output += output || 0; cur.cost += cost || 0; cur.calls += 1;
    this.usage.set(model, cur);
  }

  // --- 태스크(이벤트로만 갱신). stage 는 이름/인덱스 모두 허용 → 인덱스로 정규화 ---
  addTask(id, name, stage) {
    if (this.tasks.some(t => t.id === id)) return;
    this.tasks.push({ id, name, stage: stageIndex(stage) });
  }
  setTaskStage(id, stage) {
    const t = this.tasks.find(t => t.id === id);
    if (t) t.stage = stageIndex(stage);
  }
  findTask(id) { return this.tasks.find(t => t.id === id); }

  update(dt) { this.agents.forEach(a => a.update(dt)); }
}
