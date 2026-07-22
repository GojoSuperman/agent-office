#!/usr/bin/env bash
# ============================================================================
# 에이전트 사무실 원클릭 실행 (WSL)
#   백엔드(:8787, 라이브) + 프런트(:5173) 를 띄우고 기본 브라우저를 연다.
#   이미 떠 있는 서버는 재사용. 이 창을 닫으면 여기서 띄운 서버는 함께 종료.
#   바탕화면 배치 파일(에이전트 사무실.bat)이 이 스크립트를 호출한다.
# ============================================================================
set -u
cd "$(dirname "$0")/.."

# ---------------------------------------------------------------------------
# node PATH 확보: 바탕화면 단축키로 실행하면 nvm 이 로드되지 않아 `node` 를
# 못 찾는 경우가 있다. nvm 을 직접 로드하고, 안 되면 설치된 최신 버전을 PATH 에 추가.
# ---------------------------------------------------------------------------
if ! command -v node > /dev/null 2>&1; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # 1) nvm 스크립트 로드 시도
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh" > /dev/null 2>&1
  fi
  # 2) 그래도 없으면 설치된 node 버전 중 최신 것을 PATH 에 직접 추가
  if ! command -v node > /dev/null 2>&1; then
    node_bin="$(ls -d "$NVM_DIR"/versions/node/*/bin 2>/dev/null | sort -V | tail -n 1)"
    [ -n "$node_bin" ] && export PATH="$node_bin:$PATH"
  fi
fi

if ! command -v node > /dev/null 2>&1; then
  echo "❌ node 를 찾을 수 없습니다. WSL 터미널에서 'node -v' 로 설치를 확인하세요." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 로컬 개인 설정(커밋 안 됨): 같은 폴더에 office-start.local.sh 가 있으면 불러온다.
# 특정 Claude 계정 프로필을 쓰려면 그 파일에서
#   export CLAUDE_CONFIG_DIR="$HOME/.claude-edu"
# 처럼 지정한다. 파일이 없으면 Claude Code 표준 기본값(~/.claude)을 사용.
# ---------------------------------------------------------------------------
_local_cfg="$(dirname "$0")/office-start.local.sh"
if [ -f "$_local_cfg" ]; then
  # shellcheck disable=SC1090
  . "$_local_cfg"
fi

PIDS=()
if curl -s -m 1 localhost:8787/health > /dev/null 2>&1; then
  echo "· 백엔드(:8787) 이미 실행 중 — 재사용"
else
  echo "· 백엔드(:8787) 시작 (live 모드)"
  OFFICE_LIVE=1 node server/src/index.mjs &
  PIDS+=($!)
fi

if curl -s -m 1 -o /dev/null localhost:5173 2>&1; then
  echo "· 프런트(:5173) 이미 실행 중 — 재사용"
else
  echo "· 프런트(:5173) 시작"
  node web/serve.mjs &
  PIDS+=($!)
fi

# 프런트가 응답할 때까지 최대 10초 대기 후 브라우저 오픈
for _ in $(seq 1 20); do
  curl -s -m 1 -o /dev/null localhost:5173 2>/dev/null && break
  sleep 0.5
done

if [ "${OFFICE_NO_BROWSER:-}" != "1" ]; then
  if command -v explorer.exe > /dev/null 2>&1; then
    explorer.exe "http://localhost:5173/?live"   # WSL → Windows 기본 브라우저
  else
    xdg-open "http://localhost:5173/?live" 2>/dev/null || true
  fi
fi

echo ""
echo "🏢 에이전트 사무실 실행 중 — http://localhost:5173/?live"
echo "   이 창을 닫으면 서버가 종료됩니다."
if [ ${#PIDS[@]} -gt 0 ]; then wait; fi
