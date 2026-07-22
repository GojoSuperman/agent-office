// ============================================================================
// UI — 사이드바(프로젝트 보드 · 팀 명단 · 모델 사용량) DOM 갱신. 월드를 읽기만 한다.
// ============================================================================
import { STAGES, STATUS } from './config.js';

let boardEl, rosterEl, usageEl, world;

// 모델 id → 짧은 표시 이름
const MODEL_LABELS = {
  'claude-opus-4-8': 'Opus 4.8',
  'claude-sonnet-5': 'Sonnet 5',
  'claude-haiku-4-5': 'Haiku 4.5',
};
const modelLabel = (m) => MODEL_LABELS[m] || (m || '').replace('claude-', '');
const fmt = (n) => (n || 0).toLocaleString();

export function initUI(board, roster, usage, w) {
  boardEl = board; rosterEl = roster; usageEl = usage; world = w;
  renderBoard();
  renderRoster();
  renderUsage();
}

export function renderBoard() {
  boardEl.innerHTML = STAGES.map((s, i) => {
    const items = world.tasks.filter((t) => t.stage === i);
    return `<div class="col"><div class="col-title"><span>${s}</span><span>${items.length}</span></div>${
      items.map((t) => `<div class="task">${escapeHtml(t.name)}</div>`).join('')}</div>`;
  }).join('');
  renderProgress();
}

// 진행률 상태바 — 전체 = 작업 수 × 단계 수. 각 작업의 현재 단계 인덱스 합으로 계산.
function renderProgress() {
  const wrap = document.getElementById('progress');
  if (!wrap) return;
  const tasks = world.tasks;
  if (!tasks.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  const last = STAGES.length - 1; // '완료' 인덱스
  const done = tasks.filter((t) => t.stage === last).length;
  const pct = Math.round(tasks.reduce((s, t) => s + t.stage, 0) / (tasks.length * last) * 100);
  const active = tasks.find((t) => t.stage < last);
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-label').textContent =
    `${pct}% · 완료 ${done}/${tasks.length}` + (active ? ` · 진행 중: ${STAGES[active.stage]} — ${active.name}` : ' · 🎉 전체 완료!');
}

export function renderRoster() {
  rosterEl.innerHTML = world.agents.map((a) => {
    const st = STATUS[a.status];
    return `<div class="agent-row"><span class="dot" style="background:${a.color}"></span>` +
      `<div class="agent-info"><div class="name">${escapeHtml(a.name)}</div><div class="role">${escapeHtml(a.role)}</div></div>` +
      `<div class="agent-status" style="color:${st.color}">${st.icon} ${st.label}</div></div>`;
  }).join('');
}

export function renderUsage() {
  if (!usageEl) return;
  const rows = [...world.usage.entries()];
  if (!rows.length) {
    usageEl.innerHTML = `<div class="usage-empty">아직 사용량 없음 — 프로젝트를 시작하면 집계됩니다.</div>`;
    return;
  }
  let ti = 0, to = 0, tc = 0;
  const body = rows.map(([model, u]) => {
    ti += u.input; to += u.output; tc += u.cost;
    return `<div class="usage-row">
      <div class="usage-model">${escapeHtml(modelLabel(model))} <span class="usage-calls">·${u.calls}회</span></div>
      <div class="usage-tok"><span>▲${fmt(u.input)}</span><span>▼${fmt(u.output)}</span>${u.cost > 0 ? `<span class="usage-cost">$${u.cost.toFixed(4)}</span>` : ''}</div>
    </div>`;
  }).join('');
  const total = `<div class="usage-row usage-total">
    <div class="usage-model">합계</div>
    <div class="usage-tok"><span>▲${fmt(ti)}</span><span>▼${fmt(to)}</span>${tc > 0 ? `<span class="usage-cost">$${tc.toFixed(4)}</span>` : ''}</div>
  </div>`;
  usageEl.innerHTML = body + total + `<div class="usage-legend">▲ 입력 토큰 · ▼ 출력 토큰${tc > 0 ? ' · $ API 기준 비용' : ' · 구독 모드(비용 미표시)'}</div>`;
}

// ── 산출물 패널 ────────────────────────────────────────────────────────
// 최신 프로젝트의 파일 목록을 링크로 표시. index.html 이 있으면 "결과물 열어보기" 버튼 강조.
let artifactsBase = '';
export function initArtifacts(baseUrl) {
  artifactsBase = baseUrl;
  document.getElementById('artifacts-sec').hidden = false;
}

export function renderArtifacts(projects) {
  const el = document.getElementById('artifacts');
  if (!el) return;
  const p = projects?.[0]; // 최신 프로젝트
  if (!p || !p.files?.length) {
    el.innerHTML = `<div class="usage-empty">아직 산출물 없음 — 에이전트가 파일을 만들면 여기 표시됩니다.</div>`;
    return;
  }
  const fileUrl = (f) => `${artifactsBase}/artifacts/${encodeURIComponent(p.id)}/${f.path.split('/').map(encodeURIComponent).join('/')}`;
  const entry = p.files.find((f) => f.path === 'index.html');
  const openBtn = entry
    ? `<a class="artifact-open" href="${fileUrl(entry)}" target="_blank" rel="noopener">🔍 결과물 열어보기</a>`
    : '';
  const rows = p.files.map((f) =>
    `<a class="artifact-row" href="${fileUrl(f)}" target="_blank" rel="noopener">
      <span class="artifact-name">${escapeHtml(f.path)}</span>
      <span class="artifact-size">${fmtSize(f.size)}</span>
    </a>`).join('');
  el.innerHTML = `<div class="artifact-proj">${escapeHtml(p.id)} · ${p.files.length}개 파일</div>` + openBtn + rows;
}

function fmtSize(n) {
  if (n < 1024) return n + 'B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + 'KB';
  return (n / 1024 / 1024).toFixed(1) + 'MB';
}

// ── 결재 패널(승인 게이트) ─────────────────────────────────────────────
// onDecision(approved: boolean, feedback: string) — 버튼 클릭 시 호출(전송은 호출측 몫)
export function initApproval(onDecision) {
  const overlay = document.getElementById('approval');
  const feedbackEl = document.getElementById('approval-feedback');
  document.getElementById('btn-approve').onclick = () => {
    hideApproval();
    onDecision(true, '');
  };
  document.getElementById('btn-reject').onclick = () => {
    const feedback = feedbackEl.value.trim();
    if (!feedback) { feedbackEl.focus(); feedbackEl.placeholder = '반려하려면 사유를 입력해주세요'; return; }
    hideApproval();
    onDecision(false, feedback);
  };
  overlay.hidden = true;
}

export function showApproval({ plan, revision }) {
  document.getElementById('approval-plan').textContent = plan || '(플랜 내용 없음)';
  document.getElementById('approval-rev').textContent = revision > 1 ? `· ${revision}차 재상신` : '';
  document.getElementById('approval-feedback').value = '';
  document.getElementById('approval').hidden = false;
}

export function hideApproval() {
  document.getElementById('approval').hidden = true;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
