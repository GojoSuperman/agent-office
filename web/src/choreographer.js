// ============================================================================
// Choreographer — "무슨 일이 일어났나(의미 이벤트)"를 "어떻게 보여줄까(연출)"로 번역.
//
// 이 계층만이 타일 좌표·이동·말풍선을 안다. 소스(백엔드)는 이걸 몰라도 된다.
// 또한 이벤트가 없을 때의 앰비언트 행동(자리 복귀·잡담·커피)도 여기서 만든다.
// ============================================================================
import { DESKS, MEETING, STAGE_OWNER, WORK_LINES, TALK_LINES, TOOL_LABELS, CEO_ROOM,
  BOSS_LINES, BOSS_REACTIONS, BOSS_APPROVAL_LINES, BOSS_GRANT_LINES, BOSS_REJECT_LINES, pick } from './config.js';
import { neighborTile } from './pathfinding.js';
import { clock } from './clock.js';

export class Choreographer {
  constructor(world, { onTaskChange, onApproval, quiet = false } = {}) {
    this.world = world;
    this.onTaskChange = onTaskChange || (() => {}); // 보드 갱신 콜백
    this.onApproval = onApproval || (() => {});     // 결재 요청 → UI 패널 표시 콜백
    this.quiet = quiet; // true(라이브): 앰비언트 가짜 대사 끔 — 실제 작업 이벤트 말풍선만 표시
    this.approvalPending = false; // 결재 대기 중이면 대표는 방에서 담당자 보고를 받는다
  }

  // --- 의미 이벤트 처리 ---
  handle(ev) {
    const w = this.world;
    switch (ev.type) {
      case 'task.create': {
        w.addTask(ev.taskId, ev.name, ev.stage);
        this.onTaskChange();
        break;
      }
      case 'task.advance': {
        w.setTaskStage(ev.taskId, ev.stage);
        this.onTaskChange();
        const ownerId = ev.ownerId || STAGE_OWNER[ev.stage];
        if (ownerId && w.byId[ownerId]) {
          const t = w.findTask(ev.taskId);
          this._sendToDesk(ownerId, t ? `"${t.name}" 맡았어요!` : '맡았어요!');
        }
        break;
      }
      case 'task.assigned': {
        this._sendToDesk(ev.agentId, '맡았어요!');
        break;
      }
      case 'agent.thinking': {
        const a = w.byId[ev.agentId];
        if (a) { a.status = 'working'; a.say('💭 ' + ev.summary, 4.5); } // 실제 발화는 길게 표시
        break;
      }
      case 'agent.tool_call': {
        const a = w.byId[ev.agentId];
        if (a) {
          a.status = 'working';
          const label = TOOL_LABELS[ev.tool] || ev.tool;
          a.say(ev.target ? `${label} · ${ev.target}` : label);
        }
        break;
      }
      case 'agent.output': {
        const a = w.byId[ev.agentId];
        if (a) a.say('완료했어요! ✅');
        break;
      }
      case 'task.handoff': {
        this._handoff(ev.from, ev.to, '리뷰 부탁해요 🙏');
        break;
      }
      case 'task.rejected': {
        // QA(from)가 담당자(to)에게 반려 → 담당자 잠시 '막힘' 후 재작업
        this._handoff(ev.from, ev.to, '여기 다시 봐주세요 🙁');
        const owner = w.byId[ev.to];
        if (owner) {
          owner.status = 'blocked';
          owner.say('앗, 반려됐네요 😢');
          setTimeout(() => { if (owner.status === 'blocked') { owner.status = 'working'; owner.say('다시 해볼게요 💪'); } }, 2600);
        }
        break;
      }
      case 'approval.request': {
        // PM이 대표에게 플랜 결재 상신 → PM이 대표실로 보고하러 입장. 패널 표시는 main의 콜백.
        this.approvalPending = true;
        this._sendPmToReport();
        this.onApproval(ev);
        break;
      }
      case 'approval.granted': {
        this.approvalPending = false;
        const pm = w.byId.pm, ceo = w.ceo;
        if (ceo) ceo.say(pick(BOSS_GRANT_LINES), 3);
        if (pm) pm.say('감사합니다! 진행하겠습니다 🚀', 3);
        setTimeout(() => this._sendToDesk('pm'), 1200); // 인사 후 자리 복귀
        break;
      }
      case 'approval.rejected': {
        this.approvalPending = false;
        const pm = w.byId.pm, ceo = w.ceo;
        if (ceo) ceo.say(pick(BOSS_REJECT_LINES), 3);
        if (pm) {
          pm.status = 'blocked';
          pm.say('죄송합니다... 다시 정리하겠습니다 😢', 3);
          setTimeout(() => { this._sendToDesk('pm'); pm.status = 'working'; }, 1600);
        }
        break;
      }
      case 'meeting.start': {
        this._startMeeting(ev.topic);
        break;
      }
      case 'meeting.end': {
        this._endMeeting();
        break;
      }
    }
  }

  // --- 앰비언트(이벤트 없을 때의 생동감) ---
  updateAmbient(dt) {
    const w = this.world;
    this.updateCeo(dt); // 대표는 회의/결재와 무관하게 항상 갱신
    if (w.meetingActive) return;
    for (const a of w.agents) {
      if (a.path.length) continue;
      if (this.approvalPending && a.id === 'pm') continue; // 결재 보고 중인 PM 은 방에서 대기
      if (a.status === 'blocked' || a.status === 'meeting') continue;
      if (clock.t < a.nextThink) continue;
      a.nextThink = clock.t + 3 + Math.random() * 4;
      const roll = Math.random();
      // 라이브(quiet): 자리 복귀·기지개 정도만, 가짜 대사 없음 — 말풍선은 실제 이벤트 전용
      if (this.quiet) {
        if (!a.atSeat) this._sendToDesk(a.id);
        else if (roll < 0.1 && !a.speech) { a.status = 'idle'; a.say('☕'); }
        continue;
      }
      if (!a.atSeat) {
        this._sendToDesk(a.id);
      } else if (roll < 0.28) {
        const other = pick(w.agents.filter(x => x !== a));
        a.goTo(neighborTile(DESKS[other.id].seat));
        a.onArrive = () => { a.status = 'idle'; a.say(pick(TALK_LINES)); };
      } else if (roll < 0.4) {
        a.status = 'idle'; a.say(pick(['커피 한 잔 ☕', '음... 🤔', '거의 다 됐어요']));
      } else {
        a.status = 'working';
        if (Math.random() < 0.25) a.say(pick(WORK_LINES[a.id]));
      }
    }
  }

  // --- 대표(CEO) 앰비언트: 방에서 대기하다 가끔 나와 꼰대 한마디 ---
  updateCeo(dt) {
    const ceo = this.world.ceo;
    if (!ceo || ceo.path.length) return; // 이동 중이면 대기
    const home = CEO_ROOM.seat;
    const atHome = Math.round(ceo.pos[0]) === home[0] && Math.round(ceo.pos[1]) === home[1];

    // 회의 중이거나 결재 대기 중이면 방을 지킨다(결재 땐 가끔 담당자에게 한마디)
    if (this.world.meetingActive || this.approvalPending) {
      if (!atHome) { this._ceoHome(); return; }
      ceo.status = 'idle';
      if (this.approvalPending && clock.t >= ceo.nextThink) {
        ceo.nextThink = clock.t + 5 + Math.random() * 5;
        if (Math.random() < 0.6) ceo.say(pick(BOSS_APPROVAL_LINES), 3);
      }
      return;
    }

    if (clock.t < ceo.nextThink) return;
    ceo.nextThink = clock.t + 14 + Math.random() * 16;
    if (!atHome) { this._ceoHome(); return; } // 밖에 있었으면 방으로 복귀

    // 방에 있음 → 70% 확률로 직원 자리로 출동해 잔소리
    if (Math.random() < 0.7) {
      const target = pick(this.world.agents.filter(a => a.atSeat)) || pick(this.world.agents);
      ceo.status = 'walking';
      ceo.goTo(neighborTile(DESKS[target.id].seat));
      ceo.onArrive = () => {
        ceo.status = 'idle';
        ceo.say(pick(BOSS_LINES), 3.6);
        setTimeout(() => { if (target) target.say(pick(BOSS_REACTIONS), 2.8); }, 700);
        ceo.nextThink = clock.t + 4 + Math.random() * 3; // 잠깐 서 있다 복귀
      };
    }
  }

  _ceoHome() {
    const ceo = this.world.ceo, home = CEO_ROOM.seat;
    if (ceo.path.length) return;
    if (Math.round(ceo.pos[0]) === home[0] && Math.round(ceo.pos[1]) === home[1]) { ceo.status = 'idle'; return; }
    ceo.status = 'walking';
    ceo.goTo(home);
    ceo.onArrive = () => { ceo.status = 'idle'; };
  }

  _sendPmToReport() {
    const pm = this.world.byId.pm, ceo = this.world.ceo;
    if (!pm) return;
    pm.onArrive = null;
    pm.goTo(CEO_ROOM.report);
    pm.onArrive = () => {
      pm.status = 'idle';
      pm.say('대표님, 결재 부탁드립니다! 📋', 3.5);
      if (ceo) setTimeout(() => ceo.say(pick(BOSS_APPROVAL_LINES), 3.2), 900);
    };
  }

  // --- 내부 헬퍼 ---
  _sendToDesk(agentId, arriveLine) {
    const a = this.world.byId[agentId];
    if (!a) return;
    a.goTo(DESKS[agentId].seat);
    a.onArrive = () => {
      a.status = 'working';
      if (arriveLine) a.say(arriveLine);
      else if (!this.quiet && Math.random() < 0.35) a.say(pick(WORK_LINES[agentId]));
    };
  }

  _handoff(fromId, toId, line) {
    const from = this.world.byId[fromId];
    if (!from) return;
    from.goTo(neighborTile(DESKS[toId].seat));
    from.onArrive = () => {
      from.status = 'idle';
      from.say(line);
      // 잠시 후 자기 자리로 복귀
      setTimeout(() => this._sendToDesk(fromId), 1800);
    };
  }

  _startMeeting(topic) {
    const w = this.world;
    w.meetingActive = true;
    w.agents.forEach((a, i) => {
      a.onArrive = null;
      a.goTo(MEETING.seats[i % MEETING.seats.length]);
      a.onArrive = () => { a.status = 'meeting'; };
    });
    if (w.byId.pm) w.byId.pm.say(topic ? `${topic} 시작할게요 📋` : '회의 시작할게요 📋');
  }

  _endMeeting() {
    const w = this.world;
    w.meetingActive = false;
    w.agents.forEach(a => { a.onArrive = null; this._sendToDesk(a.id); });
  }
}
