// ============================================================================
// 구독 한도 감지 — 공식 조회 API가 없으므로(개인 구독 비공개), 에이전트 실행 실패
// 메시지("You've hit your session limit · resets 7:10pm")에서 리셋 시각을 추출해 보관.
// /health 로 프런트에 노출되고, 리셋 시각 경과 또는 실행 성공 시 자동 해제된다.
// ============================================================================

let notice = null; // { kind, resetText, expiresAt }

// "resets 7:10pm (Asia/Seoul)" 류에서 자동 해제 시각 계산. 파싱 불가 시 6시간 뒤.
function parseExpiry(resetText) {
  const m = String(resetText).match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!m) return Date.now() + 6 * 3600e3;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === 'pm') h += 12;
  const d = new Date();
  d.setHours(h, Number(m[2]), 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1); // 이미 지난 시각이면 내일
  return d.getTime() + 60e3; // 1분 여유
}

// 에러 메시지에서 한도 안내를 발견하면 기록. 아니면 무시.
export function reportLimit(errText) {
  const m = String(errText || '').match(/hit your (.+?limit)\s*·\s*resets\s*(.+)/i);
  if (!m) return;
  notice = { kind: m[1].trim(), resetText: m[2].trim(), expiresAt: parseExpiry(m[2]) };
}

export function clearLimit() { notice = null; }

export function limitNotice() {
  if (notice && Date.now() > notice.expiresAt) notice = null;
  return notice;
}
