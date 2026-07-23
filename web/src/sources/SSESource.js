// ============================================================================
// SSESource — 3단계 실시간 이벤트 소스. 백엔드(SSE)에서 의미 이벤트를 수신한다.
// ScriptedSource 와 동일한 EventSource 인터페이스라, main 에서 소스만 바꾸면 됨.
// (브라우저 전역 EventSource 를 사용 — 우리 추상 베이스는 SourceBase 로 별칭)
// ============================================================================
import { EventSource as SourceBase } from './EventSource.js';
import { validate } from '../protocol.js';

export class SSESource extends SourceBase {
  constructor(baseUrl = 'http://localhost:8787') {
    super();
    this.baseUrl = baseUrl;
    this.es = null;
  }

  start() {
    this.es = new window.EventSource(this.baseUrl + '/events');
    this.es.onmessage = (e) => {
      let ev;
      try { ev = JSON.parse(e.data); } catch { return; }
      const errs = validate(ev);
      if (errs.length) { console.warn('⚠️ 잘못된 이벤트 무시:', ev, errs); return; }
      this.emit(ev);
    };
    // 연결 오류 시 브라우저가 자동 재연결(retry) 한다.
  }

  // 사용자가 입력한 주제로 프로젝트 시작 요청
  // opts: { name, description }(새 프로젝트 — 선택한 영문명) 또는 { revisionOf }(수정 의뢰)
  async startProject(topic, opts = {}) {
    const r = await fetch(this.baseUrl + '/project', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic, ...opts }),
    });
    return r.json().catch(() => ({}));
  }

  // 의뢰 내용 분석 → 영문 프로젝트명 후보 3개 + 한글 설명 (시작 전 선택용)
  async suggestNames(topic) {
    try {
      const r = await fetch(this.baseUrl + '/project/names', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      return await r.json();
    } catch { return { candidates: [], description: '' }; }
  }

  // 최고 승인자(사용자)의 결재 결과 전송 → 백엔드 파이프라인 재개
  async sendApproval(approved, feedback = '') {
    const r = await fetch(this.baseUrl + '/approval', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approved, feedback }),
    });
    return r.json().catch(() => ({}));
  }

  // 현재 실행 상태 조회 (새로고침 복원용)
  async state() {
    try { return await (await fetch(this.baseUrl + '/state')).json(); }
    catch { return {}; }
  }

  // 산출물 목록 조회 (프로젝트 + 파일)
  async artifacts() {
    try { return await (await fetch(this.baseUrl + '/artifacts')).json(); }
    catch { return { projects: [] }; }
  }

  async health() {
    try { return await (await fetch(this.baseUrl + '/health')).json(); }
    catch { return null; }
  }

  stop() { this.es?.close(); }
  update() {} // push 기반 — 프레임 구동 불필요
}
