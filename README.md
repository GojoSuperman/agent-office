# 🏢 에이전트 사무실 (Agent Office)

여러 AI 에이전트에게 **직함과 역할**을 부여하고, 한 프로젝트를 **협업으로 완성**시키되
그 과정을 아이소메트릭 사무실에서 **캐릭터가 움직이는 모습**으로 실시간 시각화하는 웹 앱.

- **프런트엔드**: 의존성 0 · 아이소메트릭 2.5D 캔버스 (코드로 그린 도형)
- **백엔드**: 실제 Claude 에이전트 6명(PM·아키텍트·개발자·디자이너·QA·테크라이터)이 작업 → 의미 이벤트를 SSE로 방출
- **핵심 원칙**: 이벤트 소스만 바꾸면 시각화는 그대로 — 스크립트(오프라인) ↔ 실제 에이전트 전환

> 설계 전문은 [`에이전트 사무실 설계도.md`](./에이전트%20사무실%20설계도.md) 참고.

---

## 빠른 시작 (오프라인, 무료)

로그인 없이 **스크립트 모드**로 바로 볼 수 있습니다.

```bash
node web/serve.mjs        # http://localhost:5173
```

브라우저에서 http://localhost:5173 열기 → 캐릭터가 스크립트 이벤트로 움직입니다.

---

## 실제 Claude 에이전트로 실행하기

실제 에이전트가 코드/문서를 만들며 사무실이 움직이게 하려면 **본인 계정으로 로그인**해야 합니다.

### 사전 준비
- **Node.js 18+**
- 아래 인증 중 **하나**:
  - **Claude 구독** (Pro / Max / Team / Enterprise) — 추천
  - 또는 **Anthropic API 키** (종량제, https://platform.claude.com )

### 1) 백엔드 의존성 설치
```bash
cd server
npm install
```

### 2) 로그인 (셋 중 하나)

**A. 구독 로그인 (권장)**
```bash
claude          # 브라우저가 열리며 본인 Claude 구독으로 로그인
```
자격증명이 `~/.claude/.credentials.json` 에 저장됩니다. (Claude Code 미설치 시: `npm i -g @anthropic-ai/claude-code`)

**B. 헤드리스/서버 (브라우저 없이)**
```bash
claude setup-token                       # 1년짜리 OAuth 토큰 발급(구독 필요)
export CLAUDE_CODE_OAUTH_TOKEN=<발급된 토큰>
```

**C. API 키 (종량제)**
```bash
export ANTHROPIC_API_KEY=sk-ant-...       # Console에서 발급
```

> ⚠️ 구독을 쓰려면 `ANTHROPIC_API_KEY` 를 **설정하지 마세요** — API 키가 우선순위가 높아 구독보다 먼저 사용됩니다.
> Agent SDK는 필요한 바이너리를 **번들**하므로, 실행에 별도 CLI 설치는 필요 없습니다(로그인 단계에만 `claude` 사용).

### 계정 확인 · 다른 계정으로 전환

- **지금 누구로 로그인됐는지**는 앱 상단바(`백엔드: live 모드 · 🔑 이메일 · 구독`)와 `GET /health` 의 `account` 필드에서 확인할 수 있습니다.
- **앱 안에서 계정 전환은 불가**합니다 — 구독 로그인은 Claude Code가 진행하는 브라우저 OAuth 과정이라 앱이 대신할 수 없습니다. 전환은 아래처럼 터미널에서 합니다.

**다른 계정으로 바꾸기** (로그인 정보는 프로젝트가 아니라 PC의 `~/.claude` 에 저장됩니다)
```bash
claude /logout    # 현재 계정 로그아웃
claude            # 다시 실행 → 브라우저에서 다른 계정으로 로그인
```
자격증명은 쿼리 시점마다 읽으므로 **백엔드 재시작 없이** 다음 프로젝트부터 새 계정이 적용됩니다(상단바 라벨은 페이지 새로고침 시 갱신).

**여러 계정을 번갈아 쓰기** (프로필 분리)
```bash
# 계정 B를 별도 프로필 폴더에 한 번만 로그인해 두면
CLAUDE_CONFIG_DIR=~/.claude-b claude

# 이후 서버 시작 시 환경 변수로 계정을 선택
OFFICE_LIVE=1 node server/src/index.mjs                                  # 기본(~/.claude) 계정
CLAUDE_CONFIG_DIR=~/.claude-b OFFICE_LIVE=1 node server/src/index.mjs    # 계정 B
```

### 3) 실행
```bash
# 터미널 1 — 백엔드 (구독/토큰/키 자동 감지)
OFFICE_LIVE=1 node server/src/index.mjs      # 포트 8787

# 터미널 2 — 프런트엔드
node web/serve.mjs                            # 포트 5173
```
브라우저에서 **http://localhost:5173/?live** → 상단에 프로젝트 주제 입력 → **▶ 프로젝트 시작**

킥오프 후 PM이 실행 플랜을 올리면 **결재 모달**이 뜹니다 — 최고 승인자(당신)가 **승인**해야 다음 단계로 진행하고,
**반려**(사유 입력) 시 PM이 피드백을 반영해 재상신합니다.

`http://localhost:8787/health` 로 현재 모드/인증 상태를 확인할 수 있습니다.

---

## 환경 변수

| 변수 | 설명 | 기본값 |
|---|---|---|
| `OFFICE_LIVE` | `1`이면 실제 에이전트 실행, 미설정이면 mock(무료) | 미설정 |
| `OFFICE_MODEL` | 설정 시 **전원** 이 모델로 오버라이드(테스트용). 미설정 시 역할별 기본 사용 | 역할별(아래) |
| `OFFICE_WORKSPACE` | 산출물 저장 폴더 지정(아래 '산출물 폴더' 참고) | `server/workspace/` |
| `CLAUDE_CODE_OAUTH_TOKEN` | 헤드리스 로그인 토큰 | — |
| `ANTHROPIC_API_KEY` | API 키 모드(설정 시 구독보다 우선) | — |
| `CLAUDE_CONFIG_DIR` | 특정 Claude 로그인 디렉터리 지정 | `~/.claude` |
| `PORT` | 백엔드 포트 | `8787` |

**역할별 기본 모델** (`server/src/roles.mjs`):

| 역할 | 담당 | 모델 |
|---|---|---|
| PM(김기획) | 요구사항 분해·총괄 | `claude-opus-4-8` |
| 아키텍트(정설계) | 기술 설계 | `claude-opus-4-8` |
| 개발자(이개발) | 구현 | `claude-opus-4-8` |
| 디자이너(박디자) | UI/UX 스펙 | `claude-sonnet-5` |
| QA(최검수) | 검수·판정 | `claude-sonnet-5` |
| 테크라이터(윤문서) | 문서 | `claude-sonnet-5` |

파이프라인: 기획(PM) → 🔏 사용자 결재(승인/반려) → 설계 → 디자인 → 개발 → QA → 문서 → 완료 (QA 반려 시 개발로 1회 재작업)

`server/.env.example` 를 `server/.env` 로 복사해 채워도 됩니다. (`.env` 는 커밋되지 않음)

---

## 산출물 폴더 (에이전트가 만든 파일이 저장되는 곳)

에이전트들이 만드는 플랜·설계서·코드·QA 판정·문서는 프로젝트마다 격리된 폴더에 저장됩니다.

```
server/workspace/
└── p<타임스탬프>/      ← 프로젝트 1회 실행당 폴더 하나 (예: p1784706657834)
    ├── plan.md         ← PM의 결재용 플랜
    ├── tasks.json      ← 작업 분해 목록
    ├── design.md …     ← 이후 단계 산출물
    └── qa-1.txt …      ← QA 판정
```

- **기본 위치는 클론한 폴더 기준 상대 경로**(`server/workspace/`)입니다. 어느 PC에 어디로 클론하든
  별도 설정 없이 그 클론 안에 저장됩니다 (커밋되지 않음 — `.gitignore` 로 제외).
- **다른 폴더에 모으고 싶으면** `OFFICE_WORKSPACE` 로 지정하세요:
  ```bash
  OFFICE_WORKSPACE=~/agent-outputs OFFICE_LIVE=1 node server/src/index.mjs
  ```
- 어디를 지정하든 에이전트는 **그 폴더 안에서만** 파일을 쓸 수 있습니다(경로 탈출 차단).
- WSL 사용자는 `/mnt/c/...` 같은 Windows 경로보다 WSL 네이티브 경로(`~/...`)가 파일 I/O가 훨씬 빠릅니다.

---

## 구조

```
소스(ScriptedSource | SSESource) ──의미 이벤트──▶ EventQueue ──▶ Choreographer ──▶ World ──▶ Renderer/UI
web/  프런트엔드(ES 모듈)   ·   server/  백엔드(SSE + Claude Agent SDK)
```

| 경로 | 역할 |
|---|---|
| `web/` | 아이소메트릭 렌더러 · 이벤트 큐 · 연출 · 소스 추상화 ([`web/README.md`](./web/README.md)) |
| `server/src/index.mjs` | HTTP + SSE 서버 (`/events`, `/project`, `/approval`, `/health`) |
| `server/src/orchestrator.mjs` | 프로젝트 상태 머신 (기획→개발→디자인→QA→완료) |
| `server/src/agents.mjs` | Claude Agent SDK로 각 역할 실행, 도구 호출을 이벤트로 번역 |
| `server/src/workspace.mjs` | 산출물 샌드박스(경로 탈출 차단) |
| `index.html` | 1단계 단일 파일 프로토타입(참고용) |

---

## 보안

- API 키·토큰·자격증명은 **저장소에 커밋되지 않습니다** (`.gitignore` 로 `.env`, `*.credentials.json`, `node_modules/`, `server/workspace/` 제외).
- 로그인 자격증명은 저장소 밖(`~/.claude`)에 저장됩니다.
- 에이전트 파일 쓰기는 `server/workspace/<projectId>/` 로 제한되고 상위 경로 탈출을 차단합니다.
- 실행은 격리 샌드박스 가정하에 도구를 자동 승인(`bypassPermissions`)합니다. 신뢰할 수 없는 환경에서 임의 코드를 실행하지 않도록 주의하세요.

## 라이선스

[MIT](./LICENSE)
