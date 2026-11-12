// Сохранение игрока. Хранится строкой JSON на устройстве и в облаке площадки.

export interface DailyRecord {
  day: number;
  /** Время сборки в секундах. */
  time: number;
  /** Сколько мест лотка понадобилось. */
  peak: number;
}

export const HISTORY_MAX = 30;

export interface Save {
  v: 1;
  savedAt: number;
  hints: number;
  sound: boolean;
  /** Номер самого дальнего открытого уровня (с нуля). */
  unlocked: number;
  /** Звёзды по уровням: номер уровня → 1..3. */
  stars: Record<string, number>;
  shots: number;
  daily: DailyRecord | null;
  streak: number;
  lastDailyDay: number;
  bestStreak: number;
  /** Лучшее время картины дня в секундах, 0 — ещё нет. */
  bestDaily: number;
  history: DailyRecord[];
  /** Какие подсказки-баннеры игрок уже видел. */
  tips: Record<string, boolean>;
  favAsked: boolean;
}

export function newSave(): Save {
  return {
    v: 1, savedAt: 0, hints: 3, sound: true, unlocked: 0, stars: {}, shots: 0, daily: null,
    streak: 0, lastDailyDay: -1, bestStreak: 0, bestDaily: 0, history: [], tips: {}, favAsked: false,
  };
}

export function parseSave(raw: string | null): Save | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || obj.v !== 1) return null;
    return { ...newSave(), ...obj };
  } catch {
    return null;
  }
}

/** Из двух сохранений (устройство и облако) берём более свежее. */
export function newer(a: Save | null, b: Save | null): Save | null {
  if (!a) return b;
  if (!b) return a;
  return b.savedAt > a.savedAt ? b : a;
}

/** Серия дней после сборки картины дня. */
export function nextStreak(streak: number, lastDay: number, today: number): number {
  if (lastDay === today) return streak;
  return lastDay === today - 1 ? streak + 1 : 1;
}

export const totalStars = (s: Save): number => Object.values(s.stars).reduce((a, b) => a + b, 0);

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
