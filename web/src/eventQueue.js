// ============================================================================
// EventQueue — 이벤트 완급 조절(결정사항 #3).
//
// 실제 LLM 에이전트는 이벤트를 몰아서(또는 뜸하게) 방출한다. 그대로 연출하면
// 캐릭터가 순간이동하거나 멈춰 보인다. 이 큐가 수신 이벤트를 버퍼링해
// 일정 간격(minGap)으로 하나씩 흘려보내 화면 속도를 평탄화한다.
//
// 이 큐가 곧 "소스 ↔ 연출" 사이의 아키텍처 이음새다. 3단계에서 WebSocket
// 소스로 바뀌어도 이 큐는 그대로 재사용된다.
// ============================================================================

export class EventQueue {
  constructor({ minGap = 0.4, maxBuffer = 200 } = {}) {
    this.q = [];
    this.timer = 0;
    this.minGap = minGap;     // 이벤트 사이 최소 간격(초)
    this.maxBuffer = maxBuffer;
  }

  push(ev) {
    if (this.q.length >= this.maxBuffer) this.q.shift(); // 폭주 방어
    this.q.push(ev);
  }

  // 매 프레임 호출. 간격이 지났고 대기 이벤트가 있으면 하나 배달.
  tick(dt, deliver) {
    this.timer -= dt;
    if (this.timer <= 0 && this.q.length) {
      deliver(this.q.shift());
      this.timer = this.minGap;
    }
  }

  get size() { return this.q.length; }
}
