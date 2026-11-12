// Цвета блоков и пушек. Номер цвета — позиция буквы в core/arts.ts (LETTERS).
import { STONE } from '../core/game';

const BASE = ['', '#ff4d5e', '#ff9a3d', '#ffd23f', '#4cd471', '#2fd0d8', '#4a8dff', '#a66bff', '#ff7ac0', '#f4f1ff', '#b9773f', '#6b6690'];
const STONE_COLOR = '#8a8799';

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

export interface Tone {
  base: string;
  dark: string;
  light: string;
  /** Цвет цифры поверх: на светлых пушках тёмная, на тёмных белая. */
  ink: string;
}

const make = (hex: string, lightInk: boolean): Tone => ({
  base: hex,
  dark: shade(hex, -0.32),
  light: shade(hex, 0.38),
  ink: lightInk ? '#ffffff' : '#2a1846',
});

const TONES: Tone[] = BASE.map((hex, i) => (hex ? make(hex, ![3, 5, 9].includes(i)) : make('#000000', true)));
const STONE_TONE = make(STONE_COLOR, true);
export const UNKNOWN: Tone = make('#7d78a8', true);

export const toneOf = (color: number): Tone => (color === STONE ? STONE_TONE : TONES[color] ?? UNKNOWN);
