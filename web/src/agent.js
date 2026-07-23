// ============================================================================
// Agent — 한 캐릭터의 런타임 상태와 물리적 이동. "무엇을 할지"는 모른다(수동적).
// 이동 목표(goTo)와 상태(status)는 Choreographer 가 지시한다.
// ============================================================================
import { DESKS } from './config.js';
import { findPath } from './pathfinding.js';
import { clock } from './clock.js';
import { audio } from './audio.js';

export class Agent {
  constructor(def) {
    Object.assign(this, def);           // id, name, role, color, hair
    this.home = def.home || DESKS[this.id].seat; // 기본 위치(책상 없는 CEO 는 def.home)
    this.pos = [...this.home];           // 부동 타일 좌표
    this.path = [];                      // 남은 경유 타일들
    this.status = 'working';
    this.speech = null;                  // { text, until }
    this.nextThink = 0;                  // 앰비언트 행동 쿨다운
    this.bob = Math.random() * Math.PI * 2;
    this.onArrive = null;                // 도착 콜백
    this._seed = String(this.id).split('').reduce((s, c) => s + c.charCodeAt(0), 0); // 캐릭터별 음높이
  }

  goTo(tile) {
    this.path = findPath(this.pos, tile).slice(1); // 현재 칸 제외
    if (this.path.length) this.status = 'walking';
  }

  say(text, dur = 2.4) {
    this.speech = { text, until: clock.t + dur };
    audio.blip(this._seed);
  }

  get atSeat() {
    const s = this.home;
    return this.pos[0] === s[0] && this.pos[1] === s[1];
  }

  update(dt) {
    this.bob += dt * 4;
    if (this.speech && clock.t > this.speech.until) this.speech = null;
    if (!this.path.length) return;
    const [tx, ty] = this.path[0];
    const dx = tx - this.pos[0], dy = ty - this.pos[1];
    const dist = Math.hypot(dx, dy);
    const step = 2.6 * dt; // 초당 2.6타일
    if (dist <= step) {
      this.pos = [tx, ty];
      this.path.shift();
      if (!this.path.length && this.onArrive) { const cb = this.onArrive; this.onArrive = null; cb(); }
    } else {
      this.pos[0] += (dx / dist) * step;
      this.pos[1] += (dy / dist) * step;
    }
  }

  depth() { return this.pos[0] + this.pos[1]; }
}
