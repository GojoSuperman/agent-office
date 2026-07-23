// ============================================================================
// 샌드박스 파일 저장 (결정사항 #2). 프로젝트별 격리 폴더에만 쓰고,
// 경로 탈출(../ 등)을 차단한다.
// ============================================================================
import { resolve, join, dirname, sep, relative } from 'node:path';
import { mkdir, writeFile, readdir, stat, readFile, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// 기본: <클론 위치>/server/workspace/ — OFFICE_WORKSPACE 환경 변수로 임의 폴더 지정 가능(README '산출물 폴더')
const ROOT = process.env.OFFICE_WORKSPACE
  ? resolve(process.env.OFFICE_WORKSPACE)
  : resolve(HERE, '..', 'workspace');

export function projectDir(projectId) {
  return join(ROOT, projectId);
}

// 프로젝트 폴더 밖으로 나가는 경로를 거부
function safeTarget(projectId, rel) {
  const base = projectDir(projectId);
  const target = resolve(base, rel);
  if (target !== base && !target.startsWith(base + sep)) {
    throw new Error('경로 탈출 차단: ' + rel);
  }
  return target;
}

export async function writeArtifact(projectId, rel, content) {
  const target = safeTarget(projectId, rel);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content ?? '', 'utf8');
  return target;
}

// ── 프로젝트 메타(.office.json) — 영문 프로젝트명 + 한글 설명(주석) ──────
// 숨김 파일이라 산출물 목록(listFiles)에는 노출되지 않는다.
export async function writeMeta(projectId, meta) {
  await mkdir(projectDir(projectId), { recursive: true });
  await writeFile(join(projectDir(projectId), '.office.json'), JSON.stringify(meta, null, 2), 'utf8');
}
export async function readMeta(projectId) {
  try { return JSON.parse(await readFile(join(projectDir(projectId), '.office.json'), 'utf8')); }
  catch { return null; }
}

// ── 수정 의뢰 전 스냅샷 — 현재 산출물을 .rev/rev-N/ 에 백업(복원용) ──────
export async function snapshotProject(projectId) {
  const base = projectDir(projectId);
  if (!existsSync(base)) return null;
  let n = 1;
  while (existsSync(join(base, '.rev', 'rev-' + n))) n++;
  const dest = join(base, '.rev', 'rev-' + n);
  await mkdir(dest, { recursive: true });
  // 항목별 복사(.rev 자신 제외 — cp는 자기 하위 폴더로의 복사를 거부하므로 통째로 못 쓴다)
  for (const name of await readdir(base)) {
    if (name === '.rev') continue;
    await cp(join(base, name), join(dest, name), { recursive: true });
  }
  return 'rev-' + n;
}

// ── 산출물 열람 (읽기 전용 API 용) ──────────────────────────────────────

// 프로젝트 목록 (최신순) — .office.json 이 있으면 한글 설명(description) 포함
export async function listProjects() {
  let names = [];
  try { names = await readdir(ROOT); } catch { return []; }
  const out = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    try {
      const s = await stat(join(ROOT, name));
      if (!s.isDirectory()) continue;
      const meta = await readMeta(name);
      out.push({ id: name, mtime: s.mtimeMs, description: meta?.description || '', topic: meta?.topic || '' });
    } catch {}
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

// 한 프로젝트의 파일 목록 (숨김 파일 제외, 깊이 제한)
export async function listFiles(projectId, depth = 3) {
  const base = projectDir(projectId);
  if (relative(ROOT, base).includes('..')) return []; // 방어
  const files = [];
  async function walk(dir, d) {
    if (d > depth) return;
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full, d + 1);
      else {
        try {
          const s = await stat(full);
          files.push({ path: relative(base, full).split(sep).join('/'), size: s.size, mtime: s.mtimeMs });
        } catch {}
      }
    }
  }
  await walk(base, 0);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

// 파일 제공용 안전 경로 해석 (프로젝트 폴더 밖 접근 차단). 실패 시 null.
export function safeReadTarget(projectId, rel) {
  try { return safeTarget(projectId, rel); } catch { return null; }
}
