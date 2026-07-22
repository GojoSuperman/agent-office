# 에이전트 사무실 — 모듈판 (2단계)

1단계 단일 파일(`../index.html`)을 **모듈 구조 + 이벤트 프로토콜**로 재구성한 버전.

## 실행

ES 모듈은 `file://` 로 못 열고 http 서버가 필요합니다. 의존성 0 서버를 넣어놨습니다.

```bash
node web/serve.mjs
# → http://localhost:5173 접속
```

> 대안: `cd web && python3 -m http.server 5173`

## 구조 (이벤트 흐름 순)

```
ScriptedSource ──emit──▶ [protocol.validate] ──▶ EventQueue ──(완급)──▶ Choreographer
   의미 이벤트                                                              │
                                                            World(상태) ◀───┘
                                                              │
                                                   Renderer / UI (읽기 전용)
```

| 파일 | 역할 |
|---|---|
| `src/protocol.js` | **이벤트 계약**. 타입·팩토리·검증. 프런트/백 유일한 접점 |
| `src/sources/EventSource.js` | 소스 인터페이스(추상) |
| `src/sources/ScriptedSource.js` | 1단계 이벤트 소스(백엔드 스탠드인). 의미 이벤트만 방출 |
| `src/eventQueue.js` | 완급 조절 큐 (LLM 타이밍 평탄화) |
| `src/choreographer.js` | 의미 이벤트 → 이동/상태/말풍선 번역 + 앰비언트 |
| `src/world.js` | 단일 상태 저장소 (agents, tasks) |
| `src/agent.js` | 캐릭터 이동/상태 (수동적) |
| `src/pathfinding.js` | BFS 경로탐색 |
| `src/renderer.js` | 아이소메트릭 캔버스 렌더러 (읽기 전용) |
| `src/ui.js` | 사이드바 보드·명단 DOM |
| `src/config.js` | 배치·에이전트·상수 (순수 데이터) |
| `src/main.js` | 부트스트랩(위 조각 연결) |

## 핵심 원칙

**소스만 교체하면 나머지는 그대로.** 3단계에서 `ScriptedSource` 자리에
`WebSocketSource`(실제 Claude 에이전트 백엔드 수신)를 끼우면, 큐·연출·월드·렌더러는
한 줄도 바꾸지 않고 실제 작업이 화면에 반영된다.

## 콘솔에서 이벤트 직접 쏘기

```js
// 개발자 도구 콘솔
__office.source.emit(__office.source.constructor)   // (예시)
// 또는 protocol 팩토리로:
import('./src/protocol.js').then(({Events}) =>
  __office.queue.push(Events.meetingStart('임시 회의')));
```
