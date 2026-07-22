// ============================================================================
// 격자 경로탐색 (BFS, 4방향). 걷기 가능 판정은 config 배치에서 파생.
// ============================================================================
import { GRID_W, GRID_H, DESKS, MEETING, PLANTS } from './config.js';

const blocked = new Set();
const key = (x, y) => x + ',' + y;
Object.values(DESKS).forEach(d => blocked.add(key(d.furn[0], d.furn[1])));
blocked.add(key(MEETING.table[0], MEETING.table[1]));
PLANTS.forEach(p => blocked.add(key(p[0], p[1])));

export function walkable(x, y) {
  return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H && !blocked.has(key(x, y));
}

export function findPath(from, to) {
  const start = [Math.round(from[0]), Math.round(from[1])];
  const goal = [Math.round(to[0]), Math.round(to[1])];
  const q = [start];
  const came = new Map();
  came.set(key(start[0], start[1]), null);
  while (q.length) {
    const [cx, cy] = q.shift();
    if (cx === goal[0] && cy === goal[1]) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!walkable(nx, ny) || came.has(key(nx, ny))) continue;
      came.set(key(nx, ny), [cx, cy]);
      q.push([nx, ny]);
    }
  }
  const path = [];
  let cur = goal;
  if (!came.has(key(goal[0], goal[1]))) return [to]; // 도달 불가 시 직행
  while (cur) { path.push(cur); cur = came.get(key(cur[0], cur[1])); }
  return path.reverse();
}

// 특정 타일의 인접 걷기가능 칸 하나
export function neighborTile([x, y]) {
  const opts = [[x+1,y],[x-1,y],[x,y+1],[x,y-1]].filter(([a, b]) => walkable(a, b));
  return opts.length ? opts[Math.floor(Math.random() * opts.length)] : [x, y];
}
