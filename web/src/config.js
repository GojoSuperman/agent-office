// ============================================================================
// 사무실 정적 설정 — 배치·에이전트 정의·상수. 로직 없음(순수 데이터).
// 역할 id 는 백엔드 server/src/roles.mjs 와 반드시 일치해야 한다.
// ============================================================================

export const TILE_W = 64;
export const TILE_H = 32;
export const GRID_W = 11;
export const GRID_H = 9;
export const WALL_H = 52;

// 책상: furniture(막힘) 타일 + seat(에이전트가 앉는 옆칸)
export const DESKS = {
  pm:        { furn: [3, 1], seat: [3, 2] },
  dev:       { furn: [5, 1], seat: [5, 2] },
  designer:  { furn: [7, 1], seat: [7, 2] },
  architect: { furn: [9, 1], seat: [9, 2] },
  qa:        { furn: [1, 4], seat: [2, 4] },
  writer:    { furn: [1, 6], seat: [2, 6] },
};

// 회의실: 러그 영역 + 테이블(막힘) + 착석 위치(6명)
export const MEETING = {
  rug: [[6,5],[7,5],[8,5],[6,6],[7,6],[8,6],[6,7],[7,7],[8,7]],
  table: [7, 6],
  seats: [[6,5],[7,5],[8,5],[6,7],[7,7],[8,7]],
};

export const PLANTS = [[0, 8], [10, 3], [0, 2]];

// 대표실(사장실): 우하단 코너. carpet=바닥 영역, desk=중역 책상(막힘),
// seat=대표가 서 있는 자리(책상 뒤), report=담당자가 보고하러 서는 자리.
export const CEO_ROOM = {
  carpet: [[9, 7], [10, 7], [9, 8], [10, 8]],
  desk: [10, 8],
  seat: [10, 7],
  report: [9, 8],
};

// 대표 캐릭터 정의(백엔드 역할 아님 — AGENT_DEFS 와 분리 유지). home=기본 위치.
export const CEO_DEF = { id: 'ceo', name: '대표님', role: '대표이사 · CEO', color: '#e0b64d', hair: '#2b2620', boss: true, home: [10, 7] };

// 에이전트 정의(정적). 런타임 상태(pos/status 등)는 Agent 인스턴스가 가짐.
export const AGENT_DEFS = [
  { id: 'pm',        name: '김기획', role: 'PM · 프로젝트 매니저', color: '#ff6b81', hair: '#3a2723' },
  { id: 'architect', name: '정설계', role: '아키텍트',            color: '#ff9f43', hair: '#33291b' },
  { id: 'dev',       name: '이개발', role: '개발자',              color: '#5b8cff', hair: '#20242e' },
  { id: 'designer',  name: '박디자', role: '디자이너',            color: '#c78bff', hair: '#43304e' },
  { id: 'qa',        name: '최검수', role: 'QA 엔지니어',         color: '#42d392', hair: '#2a2f26' },
  { id: 'writer',    name: '윤문서', role: '테크라이터',          color: '#26c6da', hair: '#20323a' },
];

// 프로젝트 보드 단계와 각 단계 담당 역할 (백엔드 PIPELINE 과 정합)
export const STAGES = ['기획', '설계', '디자인', '개발', 'QA', '문서', '완료'];
export const STAGE_OWNER = {
  '기획': 'pm', '설계': 'architect', '디자인': 'designer',
  '개발': 'dev', 'QA': 'qa', '문서': 'writer',
};

export const STATUS = {
  working: { label: '작업중', color: '#42d392', icon: '💻' },
  walking: { label: '이동중', color: '#ffce54', icon: '🚶' },
  meeting: { label: '회의중', color: '#5b8cff', icon: '💬' },
  idle:    { label: '대기',   color: '#8a97ad', icon: '☕' },
  blocked: { label: '막힘',   color: '#ff5d5d', icon: '⚠️' },
};

// 연출용 대사 풀 (모든 역할 id 에 항목이 있어야 함 — 앰비언트에서 참조)
export const WORK_LINES = {
  pm: ['일정 정리 중 🗂️', '요구사항 검토', '로드맵 업데이트'],
  architect: ['구조 설계 중 🏗️', '인터페이스 정의', '트레이드오프 검토'],
  dev: ['코딩 중... ⌨️', '버그 잡는 중 🐛', 'API 연결 완료'],
  designer: ['시안 작업 🎨', '컬러 조정 중', '레이아웃 확정'],
  qa: ['테스트 실행 ✅', '엣지 케이스 확인', '리그레션 체크'],
  writer: ['문서 작성 ✍️', '예제 정리', 'README 다듬는 중'],
};
export const TALK_LINES = ['이거 어떻게 생각해요?', '리뷰 부탁해요 🙏', '여기 확인!', '좋은데요? 👍'];

// 대표(꼰대) 대사 풀 — 재미용. 순수 연출이라 라이브/오프라인 모두 사용.
export const BOSS_LINES = [
  '나 때는 말이야~ 🎩', '요즘 젊은 친구들은 패기가 없어~', '주인의식! 주인의식을 가져!',
  '이거 내가 하면 5분이면 해 😤', '열정이 부족해, 열정이! 🔥', '보고는 두괄식! 결론부터!',
  '커피 마실 시간에 일을 해야지 ☕', '아이디어는 좋은데... 내 생각은 좀 달라',
  '이게 그렇게 어렵나? 🤨', '주말에 잠깐 나와서 하면 안 되나~', '문제가 있으면 답도 있는 거야, 알지?',
];
export const BOSS_REACTIONS = ['네, 대표님... 😅', '아 넵! 💦', '명심하겠습니다 🫡', '(또 시작이네) 😑', '넵넵 🙇', '하하... 네 😓'];
export const BOSS_APPROVAL_LINES = ['어디 보자~ 🧐', '음, 이걸로 되겠어?', '설명해봐, 두괄식으로!', '나 때는 이런 거 하루면 끝냈어'];
export const BOSS_GRANT_LINES = ['좋아, 통과! 👍', '그래, 진행해!', '이번엔 봐준다~', '오케이, 화이팅! 🔥'];
export const BOSS_REJECT_LINES = ['다시 해와! 🙅', '이게 최선이야?', '반려! 다시 생각해봐 🤔'];

// 커피 브레이크(유휴 시 테이블 잡담/커피) 대사 풀
export const BREAK_LINES = [
  '커피 한 잔 할래요? ☕', '주말에 뭐 했어요?', '이 카페인 없으면 못 살아 😅', '아 피곤하다~ 🥱',
  '점심 뭐 먹지 🍜', '그 드라마 봤어요?', '오늘 날씨 좋네요 ☀️', '잠깐 쉬었다 해요 😌',
  '요즘 어때요?', '이번 프로젝트 재밌네요 😆', '리필 좀 하고 올게요 ☕',
];

// 도구 호출 이벤트를 말풍선 문구로
export const TOOL_LABELS = {
  write_file: '파일 작성 ✍️',
  read_file: '코드 읽는 중 📖',
  run_tests: '테스트 실행 ✅',
  search: '검색 중 🔎',
  design: '시안 그리는 중 🎨',
  spec: '설계 정리 🏗️',
};

export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
