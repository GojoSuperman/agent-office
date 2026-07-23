// ============================================================================
// Audio — Web Audio API 로 소리를 "합성"한다(오디오 파일 0, 라이브러리 0).
//   · 말풍선 블립 + 이벤트 효과음(완료/승인/반려/커피/대표/회의)
//   · 잔잔한 생성형 앰비언트 BGM(패드 + 아르페지오)
// 자동재생 정책 때문에 사용자가 🔊 토글(클릭)로 켜야 소리가 난다. 기본 꺼짐.
// 헤드리스(Node)에서 import 돼도 안전하도록 window/AudioContext 는 함수 안에서만 참조.
// ============================================================================

let ctx = null, master = null, musicGain = null, sfxGain = null;
let enabled = false, musicTimer = 0, lastBlip = 0;

// BGM 코드 진행: Am → F → C → G (루프). 각 코드의 구성음에서 멜로디를 고른다.
const CHORDS = [
  [220.0, 261.63, 329.63, 440.0],   // Am: A3 C4 E4 A4
  [174.61, 220.0, 261.63, 349.23],  // F : F3 A3 C4 F4
  [261.63, 329.63, 392.0, 523.25],  // C : C4 E4 G4 C5
  [196.0, 246.94, 293.66, 392.0],   // G : G3 B3 D4 G4
];

function ensureCtx() {
  if (ctx) return ctx;
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 1.0; master.connect(ctx.destination);
  musicGain = ctx.createGain(); musicGain.gain.value = 0.0001; musicGain.connect(master);
  sfxGain = ctx.createGain(); sfxGain.gain.value = 1.0; sfxGain.connect(master);
  return ctx;
}

// 한 음(짧은 엔벨로프). dest 기본 = 효과음 버스.
function tone({ freq = 440, dur = 0.15, type = 'sine', gain = 0.3, attack = 0.006, glide = 0, dest = null }) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator(); osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(dest || sfxGain);
  osc.start(t0); osc.stop(t0 + dur + 0.03);
}

// --- 생성형 BGM: 지속 패드 없이(저음 드론이 거슬림) 코드 진행 따라 랜덤 아르페지오 ---
// 8음마다 코드 전환(Am→F→C→G). 옥타브 점프·5도 화음·쉼표를 랜덤으로 섞어 반복감을 줄인다.
function startMusic() {
  if (!ctx) return;
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setValueAtTime(Math.max(0.0001, musicGain.gain.value), ctx.currentTime);
  musicGain.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 1.2);
  clearInterval(musicTimer);
  let step = 0, prevIdx = -1;
  musicTimer = setInterval(() => {
    if (!enabled || !ctx) return;
    step++;
    if (Math.random() < 0.12) return;                    // 가끔 쉼표(숨 쉴 틈)
    const chord = CHORDS[Math.floor(step / 8) % CHORDS.length];
    let idx = Math.floor(Math.random() * chord.length);
    if (idx === prevIdx) idx = (idx + 1) % chord.length; // 같은 음 연타 방지
    prevIdx = idx;
    let f = chord[idx];
    if (Math.random() < 0.22) f *= 2;                    // 가끔 옥타브 위로 반짝
    const g = 0.16 + Math.random() * 0.08;               // 음마다 세기 변화
    tone({ freq: f, dur: 1.0, type: 'triangle', gain: g, attack: 0.04, dest: musicGain });
    if (Math.random() < 0.3) {                           // 가끔 5도 화음을 살짝 얹기
      tone({ freq: f * 1.5, dur: 0.9, type: 'sine', gain: g * 0.45, attack: 0.05, dest: musicGain });
    }
  }, 460);
}
function stopMusic() {
  if (!ctx) return;
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setValueAtTime(Math.max(0.0001, musicGain.gain.value), ctx.currentTime);
  musicGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 1);
  clearInterval(musicTimer); musicTimer = 0;
}

export const audio = {
  get enabled() { return enabled; },

  // 🔊 토글(사용자 클릭에서 호출 → 자동재생 정책 통과). 켜짐 여부 반환.
  toggle() {
    ensureCtx();
    if (!ctx) return false;
    if (ctx.state === 'suspended') ctx.resume();
    enabled = !enabled;
    if (enabled) startMusic(); else stopMusic();
    return enabled;
  },

  // 말풍선이 뜰 때(짧은 블립, 과다 방지용 스로틀 + 캐릭터별 음높이)
  blip(seed = 0) {
    if (!enabled || !ctx) return;
    const now = ctx.currentTime * 1000;
    if (now - lastBlip < 70) return;
    lastBlip = now;
    const f = 360 + (Math.abs(seed) % 6) * 45 + Math.random() * 25;
    tone({ freq: f, dur: 0.07, type: 'triangle', gain: 0.22, attack: 0.004 });
  },

  // 이벤트 효과음
  event(name) {
    if (!enabled || !ctx) return;
    switch (name) {
      case 'complete': // 완료: 밝은 2음 상승
        tone({ freq: 523.25, dur: 0.12, type: 'sine', gain: 0.18 });
        setTimeout(() => tone({ freq: 659.25, dur: 0.16, type: 'sine', gain: 0.18 }), 90);
        break;
      case 'grant': // 승인: 도장 쾅! 3음 상승
        tone({ freq: 392, dur: 0.1, type: 'square', gain: 0.12 });
        setTimeout(() => tone({ freq: 523.25, dur: 0.1, type: 'square', gain: 0.12 }), 80);
        setTimeout(() => tone({ freq: 783.99, dur: 0.2, type: 'sine', gain: 0.18 }), 170);
        break;
      case 'reject': // 반려: 낮은 하강 버즈
        tone({ freq: 220, dur: 0.28, type: 'sawtooth', gain: 0.14, glide: 0.6 });
        break;
      case 'coffee': // 커피: 부드러운 팝
        tone({ freq: 660, dur: 0.09, type: 'sine', gain: 0.12, glide: 1.4 });
        break;
      case 'boss': // 대표 등장: 익살스러운 2음 하강(에헴~)
        tone({ freq: 300, dur: 0.14, type: 'sawtooth', gain: 0.12 });
        setTimeout(() => tone({ freq: 233, dur: 0.2, type: 'sawtooth', gain: 0.12 }), 120);
        break;
      case 'meeting': // 회의 소집: 종
        tone({ freq: 880, dur: 0.35, type: 'sine', gain: 0.16 });
        break;
    }
  },
};
