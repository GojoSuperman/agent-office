// ============================================================================
// EventSource — 이벤트 소스 추상 인터페이스.
//
// "무슨 일이 일어났나"를 protocol.js 스키마의 이벤트로 방출하는 무언가.
// 구현체를 갈아끼우는 것이 이 프로젝트의 핵심(하이브리드):
//   - ScriptedSource   : 1단계, 스크립트가 이벤트 생성
//   - WebSocketSource  : 3단계, 실제 에이전트 백엔드에서 수신 (동일 인터페이스)
//
// 계약:
//   onEvent(fn)  : 이벤트 구독
//   start()      : 방출 시작
//   stop()       : 정지
//   update(dt)   : (선택) 프레임 기반 소스가 시간을 진행시킬 때 사용.
//                  WebSocket 처럼 push 기반 소스는 비워둔다.
// ============================================================================

export class EventSource {
  constructor() { this._handlers = []; }

  onEvent(fn) { this._handlers.push(fn); return this; }

  emit(ev) { for (const h of this._handlers) h(ev); }

  start() {}
  stop() {}
  update(_dt) {}
}
