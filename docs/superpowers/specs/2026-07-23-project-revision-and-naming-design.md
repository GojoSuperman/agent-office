# 완성 프로젝트 수정 의뢰 + 프로젝트명 제안 — 설계 스펙

날짜: 2026-07-23 · 상태: 사용자 승인됨(채팅) · 대상: web/ + server/

## 목표

1. **수정 의뢰**: 완성된 프로젝트를 산출물 패널에서 선택해 수정 요청을 입력하면,
   에이전트들이 **경량 사이클**로 기존 산출물을 제자리 수정한다.
2. **프로젝트명**: 새 프로젝트 시작 시 의뢰 내용을 분석해 **영문 프로젝트명 후보 3개 + 한글 설명**을
   제안하고, 사용자가 선택한 이름을 폴더명(projectId)으로 사용한다. (기존 `p1784…` 타임스탬프 대체)

## 결정 사항

| 항목 | 결정 |
|---|---|
| 수정 파이프라인 | 경량: PM 수정계획 → 결재 → 개발 → QA(반려 1회) → 문서 갱신 |
| 원본 보존 | 제자리 수정 + 시작 전 `workspace/<id>/.rev/rev-N/` 자동 스냅샷 |
| 프로젝트명 | 영문 kebab-case, 후보 3개 중 사용자 선택, 한글 설명(주석) 함께 저장 |
| 메타데이터 | `workspace/<id>/.office.json` — {name, description, topic, createdAt} (숨김 파일이라 산출물 목록 미노출) |
| 이벤트 프로토콜 | 변경 없음 (기존 task.*·approval.* 재사용) |
| mock 모드 | 두 기능 모두 동일 흐름 지원(무료 테스트) — 이름 후보는 휴리스틱 |

## API 변경

- `POST /project/names` `{topic}` → `{candidates:[영문명×3], description:한글설명}`
  - live: Haiku 단발 쿼리(JSON 응답), mock/실패 시: 휴리스틱 폴백
- `POST /project` 본문 확장: `{topic, name?, description?, revisionOf?}`
  - `name`: sanitize(`[a-z0-9-]`, 2~40자) + 폴더 충돌 시 `-2`,`-3`… 부여
  - `revisionOf`: 존재하는 프로젝트 id면 수정 사이클 실행(이름 제안 생략)
- `GET /artifacts`: 각 프로젝트에 `description` 포함(.office.json에서)

## 서버 흐름 (수정 사이클, live)

```
snapshotProject(id)  →  .rev/rev-N/ 백업
PM: 기존 파일 Read + 수정 요청 → plan.md(수정 계획) + tasks.json(1~3개)
→ 결재 게이트(기존 gate 재사용, 반려 시 재작성)
→ 각 작업: 개발(Read/Write/Edit, 최소 변경) → QA(수정 반영 검수, 반려 시 1회 재작업) → 문서(README 갱신)
```

STAGES 문자열은 기존 그대로 사용(기획→개발→QA→문서→완료로 점프, 보드 자동 호환).

## 프런트 흐름

- **새 프로젝트**: ▶ 시작 → `/project/names` 호출 → 이름 선택 모달(라디오 3개 + 한글 설명 수정 가능)
  → 확정 시 `/project` POST. 모달에서 취소 가능.
- **수정 의뢰**: 산출물 패널에서 프로젝트 선택 → "✏️ 이 프로젝트 수정 의뢰" 버튼 →
  상단 입력바가 수정 모드로 전환(대상 배지 + ✕취소, 버튼 "▶ 수정 시작") → 입력 후 시작 시
  `{topic, revisionOf}` POST (이름 모달 생략).
- **산출물 목록**: `📁 <name>` + 한글 설명 표시(설명 없는 구 프로젝트는 기존처럼 id·날짜).

## 파일별 변경

- `server/src/workspace.mjs`: `snapshotProject`, `writeMeta`/`readMeta`, listProjects에 description
- `server/src/naming.mjs`(신규): 이름 후보 생성(live LLM + 휴리스틱 폴백)
- `server/src/orchestrator.mjs`: `runLive(topic, emit, signal, gate, opts)` — opts.name / opts.revisionOf 분기
- `server/src/agents.mjs`: `planRevision`, runRole/runQA 수정 컨텍스트 프롬프트
- `server/src/mock.mjs`: `runMock(..., opts)` 수정 사이클 목 흐름
- `server/src/index.mjs`: `/project/names` 추가, `/project` 본문 확장, 이름 sanitize/충돌 처리
- `web/src/sources/SSESource.js`: `suggestNames()`, startProject 확장
- `web/index.html` + `styles.css`: 이름 선택 모달, 수정 모드 배지
- `web/src/ui.js`: 수정 의뢰 버튼 + 설명 표시, `web/src/main.js`: 흐름 배선

## 테스트

- `node --check` 전 파일 · mock 모드 end-to-end: `/project/names` 응답 확인 →
  이름 지정 프로젝트 생성 → 폴더명 확인 → `revisionOf`로 수정 사이클 이벤트 수집(SSE) → `.office.json`/`.rev` 확인.
- 시각(모달·배지·목록)은 사용자 브라우저 확인.
