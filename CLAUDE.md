# 에이전트 사무실 (Agent Office) — 프로젝트 안내 · 이관 문서

> **이 파일은 저장소를 여는 Claude Code가 자동으로 읽습니다.** 다른 Claude Code로 이관해 이어서 작업할 때,
> 이 문서 하나로 전체 맥락·결정·실행법·남은 일을 파악할 수 있도록 자립적으로 작성했습니다.
> 더 자세한 설계는 [`에이전트 사무실 설계도.md`](./에이전트%20사무실%20설계도.md), 사용자용 안내는 [`README.md`](./README.md) 참고.

> **저장소(SSOT)**: https://github.com/GojoSuperman/agent-office — 두 PC는 push/pull로 동기화. **commit ≠ push, 자리 뜨기 전 push!**

## 한 줄 요약

여러 Claude 에이전트에게 직함·역할을 주고 한 프로젝트를 협업 완성시키되, 그 과정을 아이소메트릭 사무실에서
캐릭터가 움직이는 모습으로 실시간 시각화하는 웹 앱. 프런트(의존성 0 캔버스) + 백엔드(SSE + Claude Agent SDK).

## 현재 상태 (2026-07-23 기준)

- ✅ **1단계** 시각화 프로토타입 (단일 파일 `index.html` — 참고용)
- ✅ **2단계** 모듈 리팩터링 + 이벤트 프로토콜 (`web/`)
- ✅ **3단계** 실제 Claude 에이전트 백엔드 (`server/`, Claude Agent SDK, 구독 인증)
- ✅ 6역할 확장 + 역할별 프롬프트/도구/산출물/모델
- ✅ 모델별 토큰 사용량 표시
- ✅ 승인 게이트(기획 후 사용자 결재) + 계정 표시 + 산출물 열람/미리보기 + 진행률 바 + 새로고침 복원 + 실작업 말풍선
- ✅ **라이브 실제 실행 검증 완료** (구구단 게임 1사이클: 결재→QA 반려·재작업→산출물 8개, 토큰 집계 정상)
- ✅ GitHub 공개 (`agent-office`, MIT)
- ✅ **원클릭 실행 스크립트**(`scripts/office-start.sh`) + 바탕화면 단축키 — **사용자 실환경 검증 완료(2026-07-23)**
- ⏳ **남은 일**: 아래 "다음 작업" 참고

## 빠르게 실행

**오프라인(mock, 무료 · 로그인 불필요)**
```bash
node web/serve.mjs                 # http://localhost:5173  (스크립트 이벤트)
```

**실제 Claude 에이전트 (본인 구독 사용)**
```bash
# 1) 백엔드 의존성
cd server && npm install
# 2) 로그인 (셋 중 하나) — 자세한 건 README
claude                              # 구독 로그인(브라우저). Claude Code 없으면: npm i -g @anthropic-ai/claude-code
# 3) 실행 (별도 터미널 2개)
OFFICE_LIVE=1 node server/src/index.mjs     # 백엔드 :8787 (구독 자동 감지)
node web/serve.mjs                          # 프런트 :5173
```
→ 브라우저 **http://localhost:5173/?live** → 주제 입력 → ▶ 프로젝트 시작. `/?live` 없으면 오프라인 스크립트 모드.

> `http://localhost:8787/health` 로 `mode`(mock/live)·`auth` 상태 확인.

## 아키텍처 — "이벤트 스트림 분리" (프로젝트의 핵심 원칙)

```
[이벤트 소스] ──의미 이벤트──▶ [검증] ──▶ EventQueue(완급) ──▶ Choreographer ──▶ World(상태) ──▶ Renderer/UI
 ScriptedSource(오프라인)                                        (의미→이동/상태/말풍선 번역)
 SSESource(?live) ← 백엔드 SSE ← Orchestrator ← Claude Agent SDK(역할 에이전트들)
```

**소스만 바꾸면 나머지는 그대로.** 프런트 `main.js`에서 `?live`면 `SSESource`(백엔드 SSE 수신), 아니면 `ScriptedSource`.
백엔드는 `protocol` 스키마의 **의미 이벤트만** 방출한다(타일/이동/말풍선은 프런트 Choreographer의 몫).

## 디렉터리 / 파일 맵

```
web/                      프런트엔드 (ES 모듈, 의존성 0, http로 서빙 필요)
  serve.mjs               의존성 0 정적 dev 서버(:5173)
  index.html · styles.css 마크업/스타일 (사이드바: 보드·명단·모델 사용량, 상단 주제 입력바)
  src/
    config.js             ★ 사무실 배치·에이전트 6명·책상·단계·대사. 역할 id가 백엔드와 일치해야 함
    protocol.js           ★ 이벤트 계약(스키마+검증+팩토리). server/src/protocol.mjs 와 동기화
    world.js              단일 상태(agents, tasks, usage)
    agent.js              캐릭터 이동/상태(수동적)
    pathfinding.js        BFS
    choreographer.js      의미 이벤트 → 이동/상태/말풍선 + 앰비언트 행동
    eventQueue.js         완급 조절 큐
    renderer.js           아이소메트릭 캔버스 렌더러(벽·책상·캐릭터·라벨 오버레이)
    ui.js                 사이드바 DOM(보드·명단·사용량)
    main.js               부트스트랩(소스 선택 ?live, 사용량 이벤트 라우팅)
    sources/
      EventSource.js      소스 추상 인터페이스
      ScriptedSource.js   1단계 스크립트 소스(오프라인)
      SSESource.js        3단계 실시간 소스(브라우저 EventSource로 백엔드 구독)
server/                   백엔드 (Node ESM)
  package.json            dep: @anthropic-ai/claude-agent-sdk
  .env.example            OFFICE_LIVE / 로그인 옵션 (복사 → .env, 커밋 금지)
  src/
    index.mjs             HTTP+SSE 서버. GET /events · POST /project · POST /approval(결재) · GET /health. 인증 감지 + 안내
    protocol.mjs          이벤트 팩토리 (web/src/protocol.js 와 동기화)
    roles.mjs             ★ 6역할 정의(모델·시스템 프롬프트·산출물 guide) + PIPELINE
    agents.mjs            Claude Agent SDK query()로 역할 실행 → 도구 호출/사용량을 이벤트로 번역
    orchestrator.mjs      실제 파이프라인 상태 머신(runLive)
    mock.mjs              키 없이 파이프라인 검증용 목 소스
    workspace.mjs         산출물 샌드박스(server/workspace/<projectId>/, 경로 탈출 차단)
index.html · office-artifact.html   1단계 단일 파일 프로토타입/아티팩트 (4명, 참고용 — web/ 이 본체)
에이전트 사무실 설계도.md            마스터 플랜(단계·결정·로드맵)
README.md                            사용자용 안내(로그인·실행·보안)
```

## 역할 · 모델 · 파이프라인

| id | 캐릭터 | 담당 · 산출물 | 모델 |
|---|---|---|---|
| pm | 김기획 | 요구사항 분해·총괄 (tasks.json) | claude-opus-4-8 |
| architect | 정설계 | 기술 설계 (design.md) | claude-opus-4-8 |
| dev | 이개발 | 구현 (코드 파일) | claude-opus-4-8 |
| designer | 박디자 | UI/UX (ui-spec) | claude-sonnet-5 |
| qa | 최검수 | 검수·판정 (qa-<id>.txt) | claude-sonnet-5 |
| writer | 윤문서 | 문서 (README 등) | claude-sonnet-5 |

파이프라인: **기획(PM) → 🔏 사용자 결재(승인 게이트) → 설계 → 디자인 → 개발 → QA → 문서 → 완료** (QA 반려 시 개발로 1회 재작업).
승인 게이트: PM이 `plan.md`(결재용)+`tasks.json` 작성 → `approval.request` 방출 후 파이프라인 정지 →
프런트 결재 패널에서 사용자가 승인(`POST /approval {approved:true}`) 시 진행, 반려(+피드백) 시 PM이 피드백 반영해 재작성·재상신(횟수 무제한).
mock 모드도 동일 흐름(가짜 플랜)이라 무료로 결재 UI 테스트 가능.
모델은 `roles.mjs`의 `model` 필드. 환경변수 `OFFICE_MODEL` 설정 시 전원 오버라이드(테스트용).

## 이벤트 프로토콜 (계약)

의미 이벤트 타입: `task.create` `task.advance` `task.assigned` `task.handoff` `task.rejected`
`agent.thinking` `agent.tool_call` `agent.output` `agent.usage` `meeting.start` `meeting.end`
`approval.request` `approval.granted` `approval.rejected`.
각 이벤트는 `{ v:1, type, ts, ...payload }`. 프런트 `protocol.js`가 검증(`validate`).
**`agent.usage {agentId, model, input, output, costUsd}`** 는 연출 큐를 거치지 않고 바로 모델별로 집계·표시.

## 확정된 설계 결정 (WHY)

1. **하이브리드(단계적)**: 시각화 먼저 → 실제 에이전트 연결. → 이벤트 소스만 교체.
2. **아이소메트릭 2.5D · 코드로 그린 도형**(외부 에셋 0). → 의존성/에셋 관리 부담 제거.
3. **전송: WebSocket 대신 SSE**. 이벤트는 서버→클라 단방향이라 SSE가 정확히 맞고 브라우저 내장 `EventSource`로 의존성 0.
4. **인증: Claude API 키 대신 Claude Agent SDK(구독)**. 채팅/Claude Code 구독은 Messages API(종량제 키)와 별개 시스템 →
   구독으로 프로그래밍하려면 Agent SDK(=Claude Code 라이브러리)가 정답. `ANTHROPIC_API_KEY` 미설정 시 `~/.claude` 구독 자동 사용.
   - ⚠️ 구독 쓰려면 `ANTHROPIC_API_KEY`를 **설정하지 말 것**(키가 우선순위 높음). API 키를 설정하면 종량제 모드로 전환.
   - Agent SDK 사용법: `query({prompt, options:{model, cwd, systemPrompt:{type:'preset',preset:'claude_code',append},`
     `allowedTools:['Read','Write','Edit'], disallowedTools:['Bash'], permissionMode:'bypassPermissions', maxTurns}})`.
     for await 메시지: `assistant` 의 `message.content` 에서 `tool_use` 블록(name/input.file_path) 읽어 이벤트화, `result` 타입이 종료(usage/total_cost_usd 포함).
5. **비용 안전장치**: 기본 mock(무료). `OFFICE_LIVE=1` 일 때만 실제 실행.
6. **산출물 = 샌드박스 폴더** `server/workspace/<projectId>/`(경로 탈출 차단). `OFFICE_WORKSPACE` 환경 변수로 임의 폴더 지정 가능.
7. **완급 조절 큐**: LLM의 불규칙한 이벤트 타이밍을 화면 속도로 평탄화.
8. **역할별 모델**: 판단 무거운 PM·아키텍트·개발=Opus, 산출 위주 디자이너·QA·라이터=Sonnet.

## 검증 방법 (이 환경엔 헤드리스 브라우저가 없음)

- 문법: 모든 파일 `node --check`.
- 정합성: 프런트 `config.js` 에이전트 id == 책상 키 == 백엔드 `roles.mjs` 역할 id (교차검증 스크립트로 확인).
- 파이프라인: 백엔드를 **mock 모드**로 띄우고 `curl -N /events` 로 SSE 수집 → 이벤트 타입/단계/역할/사용량 집계.
  - 예: `node server/src/index.mjs` 후 `curl -sN localhost:8787/events` 와 `curl -X POST localhost:8787/project -d '{"topic":"..."}'`.
- 로직만 검증하는 헤드리스 시뮬레이션도 가능(`src/` 모듈은 DOM 없이 import 됨; renderer/ui/main만 DOM 의존).
- **시각(레이아웃) 검증은 사람 눈 필요** — 6명 책상 배치·라벨 겹침 등은 브라우저에서 확인해야 함.

## 다음 작업 (남은 일)

- [ ] **오늘(2026-07-22) 비주얼 변경 사용자 확인**: 디자인 5종(고무나무 화분·노트북 책상·우드 회의 테이블·큰 창+시계·딥틸 바닥),
      진행률 바, 산출물 패널, 실작업 말풍선 — 브라우저에서 확인 후 어색한 것 조정.
- [ ] **실패(반려) 연출 강화**: 좌절 애니메이션·재작업 왕복 시각화.
- [ ] **README에 스크린샷/GIF** 추가.
- [ ] (선택) 시각화 데모 정적 배포(GitHub Pages — `?live` 없는 스크립트 모드) 후 README에 링크.
- [ ] (선택) 팀 8명 확장, 카메라 이동/줌, 결재 이력 표시.

완료된 것: 라이브 검증·산출물 열람 UI·화분 개선·LICENSE·git 공개 (위 "현재 상태" 참고).
막판 수정 이력: 역할 실패 시 파이프라인 전체가 죽던 버그 수정(턴 한도 24, `OFFICE_MAX_TURNS`),
보드 stage 문자열/인덱스 불일치 버그 수정, 라이브 앰비언트 가짜 대사 침묵(quiet).

**2026-07-23 작업 (원클릭 실행 · 계정 · 문서)**:
- `office-start.sh`: 바탕화면 단축키 실행 시 nvm 미로드로 `node: command not found` 나던 문제 수정
  (nvm.sh 로드 → 실패 시 `~/.nvm/versions/node/*/bin` 최신 버전을 PATH에 추가 → 없으면 안내 후 종료).
  브라우저 자동 열기에 macOS 폴백 추가: `explorer.exe`(WSL) → `open`(macOS) → `xdg-open`(리눅스).
- **계정 프로필 분리**: 특정 Claude 계정으로 에이전트를 돌리려면 `scripts/office-start.local.sh`(커밋 안 됨,
  `.gitignore` 제외)에서 `export CLAUDE_CONFIG_DIR=...` 지정. `office-start.sh`가 있으면 소싱함.
  파일 없으면 표준 `~/.claude` 사용. (이 PC는 교육용 `~/.claude-edu` = chungwonjoung@gmail.com 로 지정해 둠.)
- **README 하이브리드 재구성**: '이미 Claude Code 사용 중' 빠른 실행을 상단에, 사전준비·로그인 상세는
  `<details>` 접기로 초심자용. '바탕화면 단축키 만들기'(.bat→.lnk 아이콘 `docs/office.ico`→실행) 섹션 추가.

## 주의사항 · 함정

- **역할 id는 프런트(`config.js`)·백엔드(`roles.mjs`)가 반드시 일치.** 추가/변경 시 양쪽 + `DESKS`·`WORK_LINES`·`STAGE_OWNER` 동기화.
- **`protocol.js` ↔ `protocol.mjs` 동기화** (이벤트 계약).
- **`index.html`(로컬)·`office-artifact.html`(아티팩트)는 1단계 단일 파일 프로토타입(4명)** — 본체는 `web/`(6명). 혼동 주의.
- **시크릿**: `.env`·`*.credentials.json`·`node_modules/`·`server/workspace/`·`scripts/office-start.local.sh` 는 `.gitignore` 로 제외됨. 키/토큰을 코드·문서에 넣지 말 것.
- **`office-start.local.sh` 는 커밋 안 됨(PC별 개인 설정).** 다른 PC/사람에겐 없으므로 표준 `~/.claude` 로 폴백함 — 계정 프로필 하드코딩을 스크립트 본체에 다시 넣지 말 것.
- **Agent SDK는 바이너리 번들** → 실행에 별도 CLI 설치 불필요(로그인 단계에만 `claude` 사용).
- 아티팩트 URL(1단계 게시본): https://claude.ai/code/artifact/e9708aaa-73a4-4cdc-90e8-dbb115150560 (소유자만 갱신 가능).

## 이관 체크리스트

1. 다른 Claude Code에서 이 폴더(`agent-office`)를 연다 → 이 `CLAUDE.md` 자동 로드.
2. 실제 실행하려면 그 환경에서 본인 Claude 구독으로 `claude` 로그인(또는 API 키).
3. `cd server && npm install` 후 위 "빠르게 실행" 따라 실행.
4. "다음 작업"에서 이어서 진행.
