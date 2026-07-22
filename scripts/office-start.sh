#!/usr/bin/env bash
# ============================================================================
# 에이전트 사무실 원클릭 실행 (WSL)
#   백엔드(:8787, 라이브) + 프런트(:5173) 를 띄우고 기본 브라우저를 연다.
#   이미 떠 있는 서버는 재사용. 이 창을 닫으면 여기서 띄운 서버는 함께 종료.
#   바탕화면 배치 파일(에이전트 사무실.bat)이 이 스크립트를 호출한다.
# ============================================================================
set -u
cd "$(dirname "$0")/.."

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
