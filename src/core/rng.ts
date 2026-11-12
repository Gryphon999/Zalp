// Генератор случайных чисел с зерном: один и тот же номер уровня всегда даёт один и тот же уровень.
export type Rnd = () => number;

export function mulberry(seed: number): Rnd {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const int = (rnd: Rnd, n: number): number => Math.floor(rnd() * n);

export function shuffle<T>(rnd: Rnd, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = int(rnd, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Номер дня по московскому времени: испытание дня меняется в полночь по Москве. */
export const today = (now = Date.now()): number => Math.floor((now + 3 * 3600e3) / 864e5);
