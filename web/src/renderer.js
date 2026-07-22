// ============================================================================
// Renderer — 월드 상태를 아이소메트릭 캔버스로 그린다. 상태를 바꾸지 않음(순수).
// ============================================================================
import { TILE_W, TILE_H, GRID_W, GRID_H, WALL_H, DESKS, MEETING, PLANTS, STATUS, CEO_ROOM } from './config.js';

let canvas, ctx, world;
const view = { originX: 0, originY: 0, w: 0, h: 0 };
// 카메라: 월드를 화면에 얹기 전 적용하는 배율/이동. (x,y는 CSS 픽셀 단위 팬 오프셋)
const camera = { scale: 1, x: 0, y: 0 };
const ZOOM_MIN = 0.45, ZOOM_MAX = 3.5;

export function initRenderer(cv, w) {
  canvas = cv;
  ctx = cv.getContext('2d');
  world = w;
  resize();
  window.addEventListener('resize', resize);
  setupCameraControls();
}

function resetCamera() { camera.scale = 1; camera.x = 0; camera.y = 0; }

// 화면 좌표(CSS px) → 캔버스 내 상대 좌표
function pointerPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// 커서 위치를 기준으로 배율 변경(그 지점의 월드가 화면에서 고정되도록 팬 보정)
function zoomAt(px, py, factor) {
  const s0 = camera.scale;
  const s1 = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s0 * factor));
  if (s1 === s0) return;
  camera.x = px - (s1 / s0) * (px - camera.x);
  camera.y = py - (s1 / s0) * (py - camera.y);
  camera.scale = s1;
}

function setupCameraControls() {
  canvas.style.touchAction = 'none';   // 브라우저 기본 스크롤/제스처 억제(포인터 이벤트용)
  canvas.style.cursor = 'grab';

  // 휠: 커서 기준 확대/축소
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const { x, y } = pointerPos(e);
    zoomAt(x, y, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  // 포인터(마우스/터치) 드래그: 이동 / 두 손가락: 핀치 줌
  const pointers = new Map();
  let pinchDist = 0;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, pointerPos(e));
    if (pointers.size === 1) canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const cur = pointerPos(e);
    pointers.set(e.pointerId, cur);

    if (pointers.size === 1) {
      // 이동(팬)
      camera.x += cur.x - prev.x;
      camera.y += cur.y - prev.y;
    } else if (pointers.size === 2) {
      // 핀치 줌 — 두 손가락 거리 변화로 배율, 중점 기준
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinchDist > 0) zoomAt(mid.x, mid.y, dist / pinchDist);
      pinchDist = dist;
    }
  });

  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (pointers.size === 0) canvas.style.cursor = 'grab';
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  // 더블클릭: 시점 초기화
  canvas.addEventListener('dblclick', (e) => { e.preventDefault(); resetCamera(); });
}

export function resize() {
  const stage = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;
  const w = stage.clientWidth, h = stage.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  view.w = w; view.h = h;
  view.originX = w / 2 + 20;
  view.originY = h / 2 - (GRID_W + GRID_H) * TILE_H / 4 + 20;
}

function isoToScreen(tx, ty) {
  return { x: view.originX + (tx - ty) * (TILE_W / 2), y: view.originY + (tx + ty) * (TILE_H / 2) };
}
function fillPoly(pts, fill, stroke) {
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, r + amt * 255));
  g = Math.max(0, Math.min(255, g + amt * 255));
  b = Math.max(0, Math.min(255, b + amt * 255));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawBackground() {
  const g = ctx.createRadialGradient(view.w / 2, view.h * 0.32, 60, view.w / 2, view.h * 0.4, view.h);
  g.addColorStop(0, '#151b29'); g.addColorStop(1, '#0c101a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, view.w, view.h);
}

function drawWalls() {
  const A = isoToScreen(0, 0), B = isoToScreen(GRID_W, 0), D = isoToScreen(0, GRID_H);
  const up = p => ({ x: p.x, y: p.y - WALL_H });
  fillPoly([up(A), up(B), B, A], '#2f3648'); // 북동 벽
  const wbcx = (A.x + B.x) / 2 + 40, wbcy = (A.y + B.y) / 2 - WALL_H + 14;
  ctx.fillStyle = '#e9edf2'; roundRect(wbcx - 34, wbcy, 68, 30, 3); ctx.fill();
  ctx.strokeStyle = '#aeb6c2'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(wbcx - 26, wbcy + 9); ctx.lineTo(wbcx + 18, wbcy + 9);
  ctx.moveTo(wbcx - 26, wbcy + 16); ctx.lineTo(wbcx + 8, wbcy + 16);
  ctx.moveTo(wbcx - 26, wbcy + 23); ctx.lineTo(wbcx + 22, wbcy + 23); ctx.stroke();
  // 북동 벽 소품(디자인안 4-A): 벽시계 + 액자 2개 (벽 기울기를 따라 배치)
  const ne = (t, dy) => ({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t - WALL_H + dy });
  const ck = ne(0.72, 20);
  ctx.fillStyle = '#e9edf2'; ctx.beginPath(); ctx.arc(ck.x, ck.y, 9, 0, 7); ctx.fill();
  ctx.strokeStyle = '#8a97ad'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ck.x, ck.y, 9, 0, 7); ctx.stroke();
  ctx.strokeStyle = '#1a2233'; ctx.lineWidth = 1.4; ctx.beginPath();
  ctx.moveTo(ck.x, ck.y); ctx.lineTo(ck.x, ck.y - 5.5); ctx.moveTo(ck.x, ck.y); ctx.lineTo(ck.x + 4, ck.y + 2); ctx.stroke();
  const frame = (t, dy, col) => {
    const f = ne(t, dy);
    ctx.fillStyle = '#1d2431'; roundRect(f.x - 8, f.y, 16, 13, 1.5); ctx.fill();
    ctx.fillStyle = col; roundRect(f.x - 6, f.y + 2, 12, 9, 1); ctx.fill();
  };
  frame(0.80, 30, '#42d392'); frame(0.88, 36, '#c78bff');

  fillPoly([up(A), up(D), D, A], '#272d3d'); // 북서 벽
  // 큰 창(디자인안 4-A): 프레임 + 하늘 그라데이션 + 창살 + 구름
  const nw = (t, dy) => ({ x: A.x + (D.x - A.x) * t, y: A.y + (D.y - A.y) * t - WALL_H + dy });
  fillPoly([nw(0.26, 6), nw(0.64, 6), nw(0.64, 48), nw(0.26, 48)], '#1d2431'); // 프레임
  const g1 = nw(0.29, 10), g2 = nw(0.61, 44);
  const sky = ctx.createLinearGradient(0, g1.y, 0, g2.y);
  sky.addColorStop(0, '#6fa3d8'); sky.addColorStop(1, '#3d5a86');
  fillPoly([nw(0.29, 10), nw(0.61, 10), nw(0.61, 44), nw(0.29, 44)], null);
  ctx.fillStyle = sky; ctx.fill();
  ctx.strokeStyle = '#1d2431'; ctx.lineWidth = 2; ctx.beginPath();
  const v1 = nw(0.45, 10), v2 = nw(0.45, 44), h1 = nw(0.29, 27), h2 = nw(0.61, 27);
  ctx.moveTo(v1.x, v1.y); ctx.lineTo(v2.x, v2.y);
  ctx.moveTo(h1.x, h1.y); ctx.lineTo(h2.x, h2.y); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  const c1 = nw(0.36, 18), c2 = nw(0.53, 33);
  ctx.beginPath(); ctx.ellipse(c1.x, c1.y, 7, 2.8, 0.42, 0, 7); ctx.ellipse(c2.x, c2.y, 8, 3, 0.42, 0, 7); ctx.fill();
}

function drawTile(cx, cy, fill, stroke) {
  fillPoly([{ x: cx, y: cy }, { x: cx + TILE_W / 2, y: cy + TILE_H / 2 }, { x: cx, y: cy + TILE_H }, { x: cx - TILE_W / 2, y: cy + TILE_H / 2 }], fill, stroke);
}
function drawFloor() {
  for (let ty = 0; ty < GRID_H; ty++) {
    for (let tx = 0; tx < GRID_W; tx++) {
      const p = isoToScreen(tx, ty);
      const isRug = MEETING.rug.some(([rx, ry]) => rx === tx && ry === ty);
      const isCeo = CEO_ROOM.carpet.some(([rx, ry]) => rx === tx && ry === ty);
      // 딥틸 체커 + 회의 민트 러그 + 대표실 버건디 카펫
      let fill = (tx + ty) % 2 ? '#1e2c31' : '#233439', stroke = '#2b4148';
      if (isRug) { fill = '#2c5a52'; stroke = '#3f8577'; }
      if (isCeo) { fill = '#4a2836'; stroke = '#7a4258'; }
      drawTile(p.x, p.y, fill, stroke);
    }
  }
}

// 대표실 뒤편 요소: 유리 파티션 + 명패 + 중역 의자(대표 뒤에 그려져 가려짐 방지)
function drawCeoRoom() {
  const L = (gx, gy) => isoToScreen(gx, gy); // 격자 꼭짓점(타일 top 코너)
  const PH = 26;
  // 유리 파티션 패널 하나
  const panel = (a, b) => {
    fillPoly([a, b, { x: b.x, y: b.y - PH }, { x: a.x, y: a.y - PH }], 'rgba(150,200,230,0.13)', '#43566a');
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(a.x, a.y - PH + 4); ctx.lineTo(b.x, b.y - PH + 4); ctx.stroke();
  };
  panel(L(9, 7), L(11, 7));  // 북쪽 파티션(뒤 벽)
  panel(L(9, 7), L(9, 8));   // 서쪽 파티션 (y=8 은 출입구로 비움)
  // 중역 의자(대표 자리 뒤 하이백)
  const s = L(CEO_ROOM.seat[0], CEO_ROOM.seat[1]);
  const chx = s.x, chy = s.y + TILE_H / 2;
  ctx.fillStyle = '#241a12'; roundRect(chx - 9, chy - 34, 18, 26, 5); ctx.fill();
  ctx.fillStyle = '#3a2a1c'; roundRect(chx - 7, chy - 31, 14, 20, 4); ctx.fill();
  // 명패("대표실") — 북쪽 파티션 위 금색 플라크
  const np = L(10, 7);
  ctx.fillStyle = '#c9a13b'; roundRect(np.x - 20, np.y - PH - 12, 40, 13, 2); ctx.fill();
  ctx.fillStyle = '#2b2008'; ctx.font = '700 9px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('대표실', np.x, np.y - PH - 2.5);
}

// 중역 책상(일반 책상보다 크고 어두운 우드) + 서류/네임택
function drawCeoDesk() {
  const d = CEO_ROOM.desk, deskH = 18;
  drawBox(d[0], d[1], deskH, '#6b4c34', '#4a3527', 1);
  const p = isoToScreen(d[0], d[1]);
  const cx = p.x, topY = p.y + TILE_H / 2 - deskH;
  ctx.fillStyle = '#efe6d0'; roundRect(cx - 10, topY + 4, 13, 9, 1); ctx.fill(); // 서류
  ctx.strokeStyle = '#c9b896'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(cx - 7, topY + 7); ctx.lineTo(cx + 0, topY + 7); ctx.moveTo(cx - 7, topY + 10); ctx.lineTo(cx - 1, topY + 10); ctx.stroke();
  ctx.fillStyle = '#2a2f3a'; roundRect(cx + 4, topY + 6, 9, 5, 1); ctx.fill(); // 골드 네임택 받침
  ctx.fillStyle = '#e0b64d'; roundRect(cx + 5, topY + 7, 7, 3, 0.5); ctx.fill();
}

function drawBox(tx, ty, h, topColor, sideColor, inset = 0) {
  const p = isoToScreen(tx, ty);
  const cx = p.x, top = p.y - h;
  const hw = TILE_W / 2 - inset, hh = TILE_H / 2 - inset * 0.5;
  const T = { x: cx, y: top + inset * 0.5 }, R = { x: cx + hw, y: top + hh }, Bt = { x: cx, y: top + 2 * hh }, L = { x: cx - hw, y: top + hh };
  fillPoly([{ x: L.x, y: L.y }, { x: Bt.x, y: Bt.y }, { x: Bt.x, y: Bt.y + h }, { x: L.x, y: L.y + h }], shade(sideColor, -0.12));
  fillPoly([{ x: R.x, y: R.y }, { x: Bt.x, y: Bt.y }, { x: Bt.x, y: Bt.y + h }, { x: R.x, y: R.y + h }], sideColor);
  fillPoly([T, R, Bt, L], topColor);
}

function drawMonitor(cx, baseY, accent) {
  ctx.fillStyle = '#20242e'; ctx.fillRect(cx - 4, baseY - 3, 8, 4); ctx.fillRect(cx - 2, baseY - 8, 4, 6);
  ctx.fillStyle = '#14171d'; roundRect(cx - 14, baseY - 25, 28, 19, 3); ctx.fill();
  ctx.fillStyle = accent; ctx.globalAlpha = 0.55; roundRect(cx - 11, baseY - 22, 22, 13, 2); ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(cx - 9, baseY - 20, 12, 2); ctx.fillRect(cx - 9, baseY - 16, 16, 1.5);
}

function drawDesk(id) {
  // 디자인안 2-B: 모니터 + 열린 노트북 + 스탠드 조명(따뜻한 빛)
  const d = DESKS[id], a = world.byId[id], deskH = 15;
  drawBox(d.furn[0], d.furn[1], deskH, '#cdd2db', '#a9afbb', 3);
  const p = isoToScreen(d.furn[0], d.furn[1]);
  const cx = p.x, topY = p.y + TILE_H / 2 - deskH;
  drawMonitor(cx - 8, topY + 5, a.color);
  // 노트북 (역할색 화면, 열린 각도)
  ctx.fillStyle = '#20242e'; fillPoly([{ x: cx + 6, y: topY + 13 }, { x: cx + 22, y: topY + 9 }, { x: cx + 24, y: topY + 13 }, { x: cx + 8, y: topY + 17 }]);
  ctx.fillStyle = '#14171d'; fillPoly([{ x: cx + 6, y: topY + 13 }, { x: cx + 22, y: topY + 9 }, { x: cx + 21, y: topY + 1 }, { x: cx + 5, y: topY + 5 }]);
  ctx.fillStyle = a.color; ctx.globalAlpha = 0.5;
  fillPoly([{ x: cx + 7.5, y: topY + 11.5 }, { x: cx + 20, y: topY + 8 }, { x: cx + 19.4, y: topY + 2.5 }, { x: cx + 7, y: topY + 6 }]);
  ctx.globalAlpha = 1;
  // 스탠드 조명 + 은은한 빛
  ctx.strokeStyle = '#6b7482'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - 18, topY + 12); ctx.lineTo(cx - 18, topY - 2); ctx.lineTo(cx - 12, topY - 6); ctx.stroke();
  ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(cx - 11, topY - 5.4, 2.6, 0, 7); ctx.fill();
  const g = ctx.createRadialGradient(cx - 11, topY - 4, 1, cx - 11, topY + 4, 15);
  g.addColorStop(0, 'rgba(255,210,122,0.34)'); g.addColorStop(1, 'rgba(255,210,122,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx - 11, topY + 2, 15, 0, 7); ctx.fill();
}

function drawTable() {
  // 디자인안 3-A: 넓은 타원형 우드 테이블 + 노트북 3대 + 회의 스피커
  const t = MEETING.table, h = 13;
  const p = isoToScreen(t[0], t[1]);
  const cx = p.x, top = p.y - h + TILE_H / 2;
  ctx.fillStyle = '#4a3527'; ctx.fillRect(cx - 34, top + 6, 4, h); ctx.fillRect(cx + 30, top + 6, 4, h); // 다리
  ctx.fillStyle = '#5c4229'; ctx.beginPath(); ctx.ellipse(cx, top + 9, 42, 19, 0, 0, 7); ctx.fill();   // 옆면
  ctx.fillStyle = '#7a5a3c'; ctx.beginPath(); ctx.ellipse(cx, top + 5, 42, 19, 0, 0, 7); ctx.fill();   // 상판
  ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.beginPath(); ctx.ellipse(cx - 8, top + 1, 22, 8, 0, 0, 7); ctx.fill();
  const laptop = (lx, ly, flip) => {
    const s = flip ? -1 : 1;
    ctx.fillStyle = '#20242e'; fillPoly([{ x: cx + lx, y: top + ly }, { x: cx + lx + 12 * s, y: top + ly - 3 }, { x: cx + lx + 13 * s, y: top + ly }, { x: cx + lx + 1 * s, y: top + ly + 3 }]);
    ctx.fillStyle = '#14171d'; fillPoly([{ x: cx + lx, y: top + ly }, { x: cx + lx + 12 * s, y: top + ly - 3 }, { x: cx + lx + 11 * s, y: top + ly - 9 }, { x: cx + lx - 1 * s, y: top + ly - 6 }]);
    ctx.fillStyle = '#5b8cff'; ctx.globalAlpha = 0.5;
    fillPoly([{ x: cx + lx + 1 * s, y: top + ly - 1.4 }, { x: cx + lx + 10.4 * s, y: top + ly - 3.6 }, { x: cx + lx + 9.8 * s, y: top + ly - 8 }, { x: cx + lx + 0.6 * s, y: top + ly - 5.6 }]);
    ctx.globalAlpha = 1;
  };
  laptop(-30, 4, false); laptop(18, 10, true); laptop(6, -6, false);
  ctx.fillStyle = '#2a2f3a'; ctx.beginPath(); ctx.ellipse(cx - 2, top + 6, 5.5, 3, 0, 0, 7); ctx.fill(); // 스피커
  ctx.fillStyle = '#42d392'; ctx.beginPath(); ctx.arc(cx - 2, top + 5.4, 1.2, 0, 7); ctx.fill();
}

function drawPlant([tx, ty]) {
  // 키 큰 고무나무(디자인안 1-B): 모던 화분 + 줄기 + 좌우로 갈라지는 잎
  const p = isoToScreen(tx, ty), cx = p.x, base = p.y + TILE_H / 2 - 2;
  ctx.fillStyle = '#5b6472'; fillPoly([{ x: cx - 8, y: base - 16 }, { x: cx + 8, y: base - 16 }, { x: cx + 6, y: base }, { x: cx - 6, y: base }]);
  ctx.fillStyle = '#6b7482'; roundRect(cx - 9, base - 19, 18, 4.5, 2); ctx.fill();
  ctx.strokeStyle = '#5c4229'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, base - 17); ctx.quadraticCurveTo(cx + 2, base - 40, cx - 1, base - 58); ctx.stroke();
  const leaf = (lx, ly, rot, s, col) => {
    ctx.save(); ctx.translate(cx + lx, base + ly); ctx.rotate(rot);
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, 8 * s, 4.6 * s, 0, 0, 7); ctx.fill(); ctx.restore();
  };
  leaf(-8, -28, -0.5, 1, '#2f8f5b'); leaf(9, -34, 0.5, 1.05, '#37a067');
  leaf(-7, -44, -0.45, 0.95, '#3fae7a'); leaf(8, -50, 0.42, 0.9, '#2f8f5b');
  leaf(0, -60, -0.05, 0.85, '#45b985');
}

function drawAgentBody(a) {
  const p = isoToScreen(a.pos[0], a.pos[1]);
  const bob = Math.sin(a.bob) * (a.status === 'walking' ? 2.5 : 0.8);
  const cx = p.x, ground = p.y + TILE_H / 2 + 4, cy = ground - 6 + bob;
  ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(cx, ground, 13, 6.5, 0, 0, 7); ctx.fill();
  ctx.save(); ctx.shadowColor = STATUS[a.status].color; ctx.shadowBlur = 8;
  ctx.strokeStyle = STATUS[a.status].color; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(cx, ground, 15, 7.5, 0, 0, 7); ctx.stroke(); ctx.restore();
  ctx.fillStyle = shade(a.color, -0.12);
  roundRect(cx - 13, cy - 13, 5, 18, 2.5); ctx.fill(); roundRect(cx + 8, cy - 13, 5, 18, 2.5); ctx.fill();
  const top = cy - 16, bot = cy + 9;
  ctx.fillStyle = a.color;
  ctx.beginPath();
  ctx.moveTo(cx - 11, top + 5); ctx.quadraticCurveTo(cx - 12, top, cx - 7, top);
  ctx.lineTo(cx + 7, top); ctx.quadraticCurveTo(cx + 12, top, cx + 11, top + 5);
  ctx.lineTo(cx + 9, bot); ctx.quadraticCurveTo(cx, bot + 3, cx - 9, bot);
  ctx.closePath(); ctx.fill();
  const hx = cx, hy = cy - 25;
  ctx.fillStyle = '#f2d0b8'; ctx.beginPath(); ctx.arc(hx, hy, 8.5, 0, 7); ctx.fill();
  ctx.fillStyle = a.hair; ctx.beginPath(); ctx.arc(hx, hy, 8.5, Math.PI * 0.92, Math.PI * 2.08); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3a2e2e';
  ctx.beginPath(); ctx.arc(hx - 3, hy + 1.5, 1.1, 0, 7); ctx.arc(hx + 3, hy + 1.5, 1.1, 0, 7); ctx.fill();
  if (a.boss) { // 대표: 금색 왕관
    const cyv = hy - 7.5;
    ctx.fillStyle = '#f4c542';
    ctx.beginPath();
    ctx.moveTo(hx - 6, cyv); ctx.lineTo(hx - 6, cyv - 5); ctx.lineTo(hx - 3, cyv - 1.5);
    ctx.lineTo(hx, cyv - 6); ctx.lineTo(hx + 3, cyv - 1.5); ctx.lineTo(hx + 6, cyv - 5);
    ctx.lineTo(hx + 6, cyv); ctx.closePath(); ctx.fill();
  }
}

function drawAgentLabel(a) {
  const p = isoToScreen(a.pos[0], a.pos[1]);
  const bob = Math.sin(a.bob) * (a.status === 'walking' ? 2.5 : 0.8);
  const cx = p.x, headTop = p.y + TILE_H / 2 + 4 - 6 + bob - 33;
  ctx.font = '600 11px sans-serif'; ctx.textAlign = 'left';
  const nameW = ctx.measureText(a.name).width;
  const tagW = nameW + 22, tagX = cx - tagW / 2, tagY = headTop - 16;
  ctx.fillStyle = 'rgba(12,16,26,0.9)'; roundRect(tagX, tagY, tagW, 16, 8); ctx.fill();
  ctx.fillStyle = a.color; ctx.beginPath(); ctx.arc(tagX + 9, tagY + 8, 3.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#e6ecf5'; ctx.fillText(a.name, tagX + 16, tagY + 11.5);
  if (a.speech) {
    ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    const w = ctx.measureText(a.speech.text).width + 18, by = tagY - 30;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffffff'; roundRect(cx - w / 2, by, w, 23, 9); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(cx - 5, by + 23); ctx.lineTo(cx + 5, by + 23); ctx.lineTo(cx, by + 31); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1a2233'; ctx.fillText(a.speech.text, cx, by + 15.5);
  }
}

export function render() {
  ctx.clearRect(0, 0, view.w, view.h);
  drawBackground();                 // 배경은 화면 고정(줌/팬 영향 없음)
  ctx.save();
  ctx.translate(camera.x, camera.y);
  ctx.scale(camera.scale, camera.scale);
  drawWalls();
  drawFloor();
  drawCeoRoom();                    // 파티션·의자·명패(대표/책상 뒤에 위치)
  const items = [];
  Object.keys(DESKS).forEach(id => items.push({ depth: DESKS[id].furn[0] + DESKS[id].furn[1], draw: () => drawDesk(id) }));
  items.push({ depth: MEETING.table[0] + MEETING.table[1], draw: drawTable });
  items.push({ depth: CEO_ROOM.desk[0] + CEO_ROOM.desk[1], draw: drawCeoDesk });
  PLANTS.forEach(pl => items.push({ depth: pl[0] + pl[1], draw: () => drawPlant(pl) }));
  world.agents.forEach(a => items.push({ depth: a.depth(), draw: () => drawAgentBody(a) }));
  items.push({ depth: world.ceo.depth(), draw: () => drawAgentBody(world.ceo) });
  items.sort((x, y) => x.depth - y.depth).forEach(it => it.draw());
  // 라벨/말풍선은 맨 위 오버레이 (가려짐 방지)
  const labeled = [...world.agents, world.ceo].sort((x, y) => x.depth() - y.depth());
  labeled.forEach(a => drawAgentLabel(a));
  ctx.restore();
}
