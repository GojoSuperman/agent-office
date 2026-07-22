// 전역 시뮬레이션 시계. 메인 루프가 매 프레임 t를 누적한다.
// 여러 모듈(agent, choreographer)이 "지금 시각"을 공유하기 위한 최소 장치.
export const clock = { t: 0 };
