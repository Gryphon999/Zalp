// Звуки синтезируются на лету через WebAudio: никаких аудиофайлов и вопросов с лицензиями.

let ctx: AudioContext | null = null;
let enabled = true;

export function setSound(on: boolean): void {
  enabled = on;
}

function tone(freq: number, at: number, dur: number, type: OscillatorType, vol: number, slideTo?: number): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  const t = ctx.currentTime + at;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const SOUNDS = {
  tap: () => tone(520, 0, 0.06, 'triangle', 0.08),
  launch: () => tone(260, 0, 0.16, 'triangle', 0.1, 620),
  park: () => [392, 330].forEach((f, i) => tone(f, i * 0.07, 0.12, 'sine', 0.1)),
  empty: () => tone(880, 0, 0.12, 'sine', 0.07, 1320),
  crumble: () => tone(120, 0, 0.2, 'sawtooth', 0.06, 60),
  bad: () => tone(170, 0, 0.16, 'sine', 0.12),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.32, 'triangle', 0.13)),
  lose: () => [330, 262, 196].forEach((f, i) => tone(f, i * 0.14, 0.3, 'sine', 0.13)),
  star: () => [784, 988, 1175].forEach((f, i) => tone(f, i * 0.06, 0.25, 'sine', 0.1)),
};

function ready(): boolean {
  if (!enabled || document.hidden) return false;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return true;
  } catch {
    return false; // звук не критичен
  }
}

export function play(name: keyof typeof SOUNDS): void {
  if (ready()) SOUNDS[name]();
}

let lastShot = 0;

/** Выстрел: чем длиннее серия попаданий, тем выше тон. */
export function shot(combo: number): void {
  if (!ready() || !ctx) return;
  // При очень частых выстрелах не накладываем десятки звуков друг на друга.
  if (ctx.currentTime - lastShot < 0.03) return;
  lastShot = ctx.currentTime;
  const step = Math.min(combo, 30);
  const freq = 330 * Math.pow(2, step / 12);
  tone(freq, 0, 0.09, 'triangle', 0.09);
  tone(freq * 2, 0, 0.05, 'sine', 0.035);
}
