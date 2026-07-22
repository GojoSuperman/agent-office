// ============================================================================
// ScriptedSource — 1단계 이벤트 소스. 실제 에이전트 없이 "그럴듯한 프로젝트
// 진행"을 의미 이벤트로 방출한다. 백엔드의 스탠드인(stand-in) 역할.
//
// 중요: 이 소스는 타일/이동/말풍선을 전혀 모른다. 오직 프로젝트 수준의 사건
// (태스크 생성/진행/핸드오프/회의/반려)만 방출한다. 그 번역은 Choreographer 몫.
// 이 소스는 태스크의 "진실 원천"이다(3단계의 오케스트레이터와 같은 위치).
// ============================================================================
import { EventSource } from './EventSource.js';
import { Events } from '../protocol.js';
import { STAGES, STAGE_OWNER, pick } from '../config.js';

const TASK_POOL = ['로그인 기능', '대시보드 UI', '결제 모듈', '알림 센터', '검색 개선', '프로필 편집'];
const TOOLS = { dev: ['write_file', 'read_file', 'run_tests'], designer: ['design'], pm: ['search'], qa: ['run_tests', 'read_file'] };

export class ScriptedSource extends EventSource {
  constructor() {
    super();
    this.t = 0;
    this.seq = 1;
    this.tasks = [];          // 소스가 소유하는 진실 태스크 목록
    this.nextAdvance = 4;
    this.nextTool = 2;
    this.nextMeeting = 30;
    this.meetingUntil = 0;
    this.inMeeting = false;
  }

  start() {
    // 초기 태스크 두 개
    this._newTask();
    this._newTask();
  }

  _newTask() {
    const id = this.seq++;
    const name = pick(TASK_POOL);
    const t = { id, name, stage: 0 };
    this.tasks.push(t);
    this.emit(Events.taskCreate(id, name, STAGES[0]));
    return t;
  }

  // 사용자가 "회의 소집" 버튼을 눌렀을 때. 소스가 회의 상태의 진실을 유지.
  triggerMeeting() {
    if (this.inMeeting) return;
    this.inMeeting = true;
    this.meetingUntil = this.t + 8;
    this.emit(Events.meetingStart('긴급 회의'));
  }

  update(dt) {
    this.t += dt;

    // 회의 종료 체크
    if (this.inMeeting && this.t >= this.meetingUntil) {
      this.inMeeting = false;
      this.nextMeeting = this.t + 35 + Math.random() * 15;
      this.emit(Events.meetingEnd());
    }
    if (this.inMeeting) return; // 회의 중엔 작업 이벤트 멈춤

    // 주기적 회의
    if (this.t >= this.nextMeeting) {
      this.inMeeting = true;
      this.meetingUntil = this.t + 8;
      this.emit(Events.meetingStart('데일리 스탠드업'));
      return;
    }

    // 도구 호출(작업 중 티내기)
    if (this.t >= this.nextTool) {
      this.nextTool = this.t + 2 + Math.random() * 3;
      const active = this.tasks.filter(t => t.stage > 0 && t.stage < STAGES.length - 1);
      if (active.length) {
        const t = pick(active);
        const ownerId = STAGE_OWNER[STAGES[t.stage]];
        const tools = TOOLS[ownerId] || ['search'];
        if (Math.random() < 0.3) this.emit(Events.thinking(ownerId, `${t.name} 설계 중`));
        else this.emit(Events.toolCall(ownerId, pick(tools), t.name));
      }
    }

    // 태스크 진행
    if (this.t >= this.nextAdvance) {
      this.nextAdvance = this.t + 5 + Math.random() * 3;
      this._advance();
    }
  }

  _advance() {
    const movable = this.tasks.filter(t => t.stage < STAGES.length - 1);
    if (!movable.length) { this._newTask(); return; }
    const t = pick(movable);
    const prevOwner = STAGE_OWNER[STAGES[t.stage]];

    // 가끔 QA 단계에서 반려(막힘 연출)
    if (STAGES[t.stage] === 'QA' && Math.random() < 0.35) {
      const to = 'dev';
      this.emit(Events.taskRejected(t.id, 'qa', to));
      t.stage = STAGES.indexOf('개발'); // 개발로 되돌림
      this.emit(Events.taskAdvance(t.id, STAGES[t.stage], to));
      return;
    }

    t.stage++;
    const stageName = STAGES[t.stage];
    const owner = STAGE_OWNER[stageName];
    if (prevOwner && owner && prevOwner !== owner) {
      this.emit(Events.taskHandoff(t.id, prevOwner, owner));
    }
    this.emit(Events.taskAdvance(t.id, stageName, owner));
    if (stageName === '완료') this.emit(Events.output(prevOwner || 'qa', t.id, t.name));
  }
}
