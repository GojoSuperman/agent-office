// ============================================================================
// 프로젝트명 제안 — 의뢰 내용을 분석해 영문 kebab-case 후보 3개 + 한글 설명 생성.
// live: Haiku 단발 쿼리(JSON 응답). mock/실패 시: 휴리스틱 폴백.
// ============================================================================

import { reportLimit, clearLimit } from './limits.mjs';

const NAME_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

// 폴더명으로 안전한 kebab-case 로 정제. 부적합하면 null.
export function sanitizeName(raw) {
  const s = String(raw || '').toLowerCase().trim()
    .replace(/[_\s]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return NAME_RE.test(s) ? s : null;
}

// 휴리스틱 폴백 — 주제의 영문 단어가 있으면 활용, 없으면 범용 이름.
// fallback:true 로 표시해 프런트가 "AI 제안 실패, 직접 입력 권장" 경고를 띄운다.
function fallbackNames(topic) {
  const ascii = sanitizeName((topic.match(/[a-zA-Z0-9 _-]+/g) || []).join(' '));
  const base = ascii || 'new-project';
  const candidates = [...new Set([base, `${base}-app`, `${base}-web`])];
  while (candidates.length < 3) candidates.push(`project-${candidates.length + 1}`);
  return { candidates: candidates.slice(0, 3), description: topic.slice(0, 120), fallback: true };
}

export async function suggestNames(topic, live) {
  if (!live) return fallbackNames(topic);
  try {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    let text = '';
    for await (const message of query({
      prompt: `다음 프로젝트 의뢰를 분석해 JSON 하나만 출력해줘(설명·마크다운 금지). ` +
        `형식: {"candidates":["영문-케밥-케이스-이름 3개 — 짧고 내용이 드러나게"],"description":"어떤 작업인지 한 줄 한글 설명"} ` +
        `의뢰: ${topic}`,
      options: {
        model: process.env.OFFICE_MODEL || 'claude-haiku-4-5',
        allowedTools: [], disallowedTools: ['Bash'],
        permissionMode: 'bypassPermissions', maxTurns: 1,
      },
    })) {
      if (message.type === 'result' && typeof message.result === 'string') text = message.result;
    }
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : text);
    const candidates = (parsed.candidates || []).map(sanitizeName).filter(Boolean).slice(0, 3);
    if (!candidates.length) throw new Error('후보 없음');
    clearLimit(); // 정상 실행 = 한도 아님 → 표시 해제
    const fb = fallbackNames(topic);
    while (candidates.length < 3) candidates.push(fb.candidates[candidates.length]);
    return { candidates: [...new Set(candidates)], description: String(parsed.description || topic).slice(0, 120), fallback: false };
  } catch (e) {
    reportLimit(e?.message); // 구독 한도 메시지면 /health 에 리셋 시각 노출
    return fallbackNames(topic); // LLM 실패해도 시작은 막지 않는다
  }
}
