// Сборка уровней по номеру. Один и тот же номер всегда даёт один и тот же уровень.
// Каждый расклад проверяется ботом: непроходимые перегенерируются.
import { ARTS, COLOR_COUNT, mirror, recolor, upscale, usedColors, type Pic } from './arts';
import { lap, solve } from './bot';
import { STONE, countColored, dropLonelyStones, type GunDef } from './game';
import { int, mulberry, shuffle, type Rnd } from './rng';

export const LEVELS = 240;

export type Intro = 'first' | 'second' | 'third' | 'hidden' | 'stone' | null;

export interface LevelDef {
  name: string;
  w: number;
  h: number;
  /** Поле уровня (с камнями). */
  grid: Uint8Array;
  /** Исходная картинка без камней — для карточки и экрана победы. */
  picture: Uint8Array;
  cols: GunDef[][];
  /** Сколько мест лотка понадобилось боту. */
  botPeak: number;
  intro: Intro;
}

interface Params {
  merge: number;
  swap: number;
  hidden: number;
  stones: number;
  maxPeak: number;
  /** Во сколько раз крупнее делать пушки (меньше пушек на уровне). */
  big: number;
}

export const HIDDEN_FROM = 8;
export const STONE_FROM = 15;

/** Идеальная последовательность: пушки, которые по одной расстреливают всю картину без лотка. */
function plan(grid: Uint8Array, w: number, h: number, rnd: Rnd, capMin: number, capMax: number): GunDef[] | null {
  const board = grid.slice();
  const colors = usedColors(board);
  const seq: GunDef[] = [];
  let left = countColored(board);
  while (left > 0) {
    const opts: { color: number; hits: number }[] = [];
    for (const color of colors) {
      const hits = lap(board.slice(), w, h, color, 9999);
      if (hits > 0) opts.push({ color, hits });
    }
    if (opts.length === 0) return null; // всё открытое закрыто камнями
    const top = Math.max(...opts.map((o) => o.hits));
    const good = opts.filter((o) => o.hits >= Math.min(3, top));
    let roll = rnd() * good.reduce((s, o) => s + o.hits * o.hits, 0);
    let pick = good[0];
    for (const o of good) {
      roll -= o.hits * o.hits;
      if (roll <= 0) {
        pick = o;
        break;
      }
    }
    const ammo = Math.min(pick.hits, capMin + int(rnd, capMax - capMin + 1));
    lap(board, w, h, pick.color, ammo);
    seq.push({ color: pick.color, ammo, hidden: false });
    left -= ammo;
  }
  return seq;
}

function build(pic: Pic, seed: number, p: Params, intro: Intro): LevelDef {
  const { w, h } = pic;
  const blocks = countColored(pic.cells);
  const capMax = Math.min(28, Math.max(6, Math.round((blocks / 6) * p.big)));
  const capMin = Math.max(3, Math.round(capMax / 3));
  for (let a = 0; a < 40; a++) {
    const rnd = mulberry(seed * 7919 + a * 104729 + 17);
    const scale = Math.max(0, 1 - a / 8);
    const grid = pic.cells.slice();

    const stones = Math.round(p.stones * scale);
    for (let s = 0, tries = 0; s < stones && tries < stones * 20; tries++) {
      const cell = int(rnd, grid.length);
      if (grid[cell] === 0 || grid[cell] === STONE) continue;
      grid[cell] = STONE;
      s++;
    }
    dropLonelyStones(grid, w, h);

    const seq = plan(grid, w, h, rnd, capMin, capMax);
    if (!seq) continue;

    // Слияние: одна пушка получает заряды двух и вынуждена ждать в лотке.
    for (let i = 0; i < seq.length; i++) {
      if (rnd() >= p.merge * scale) continue;
      for (let j = i + 1; j < Math.min(seq.length, i + 7); j++) {
        if (seq[j].color === seq[i].color && seq[i].ammo + seq[j].ammo <= 60) {
          seq[i].ammo += seq[j].ammo;
          seq.splice(j, 1);
          break;
        }
      }
    }

    const k = seq.length <= 9 ? 3 : 4;
    const cols: GunDef[][] = Array.from({ length: k }, () => []);
    for (const gun of seq) {
      const min = Math.min(...cols.map((c) => c.length));
      const open = cols.filter((c) => c.length <= min + 1);
      open[int(rnd, open.length)].push(gun);
    }
    for (const col of cols) {
      for (let i = 0; i + 1 < col.length; i++) {
        if (rnd() < p.swap * scale) [col[i], col[i + 1]] = [col[i + 1], col[i]];
      }
      for (let i = 1; i < col.length; i++) col[i].hidden = rnd() < p.hidden;
    }
    if (intro === 'hidden') cols.forEach((col) => col[1] && (col[1].hidden = true));

    const res = solve({ w, h, grid, cols, tray: [null, null, null, null, null] }, 800);
    if (!res) continue;
    if (scale > 0 && res.peak > p.maxPeak) continue;
    if (intro === 'stone' && scale > 0 && !grid.includes(STONE)) continue;
    return { name: pic.name, w, h, grid, picture: pic.cells, cols, botPeak: res.peak, intro };
  }
  throw new Error(`уровень не собрался: ${pic.name}, зерно ${seed}`);
}

/** Симметричный узор: кольца, ромбы, кресты, шахматные клетки. */
export function pattern(rnd: Rnd, n: number, k: number): Pic {
  const all = shuffle(rnd, Array.from({ length: COLOR_COUNT - 1 }, (_, i) => i + 1)); // без графита
  const colors = all.slice(0, k);
  const type = int(rnd, 5);
  const band = 1 + int(rnd, 2);
  const cut = rnd() < 0.5;
  const cells = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const a = Math.min(x, n - 1 - x);
      const b = Math.min(y, n - 1 - y);
      if (cut && a + b < Math.floor(n / 5)) continue;
      const v =
        type === 0 ? Math.min(a, b)
        : type === 1 ? a + b
        : type === 2 ? Math.max(a, b)
        : type === 3 ? Math.floor(a / band) + Math.floor(b / band) * 2
        : Math.abs(a - b);
      cells[y * n + x] = colors[Math.floor(v / band) % k];
    }
  }
  return { name: 'Узор', w: n, h: n, cells };
}

const FIRST = ['Сердце', 'Гриб', 'Улыбка'];
const REST = ARTS.filter((a) => !FIRST.includes(a.name));

function pictureFor(i: number, rnd: Rnd): Pic {
  if (i < FIRST.length) return ARTS.find((a) => a.name === FIRST[i])!;
  if (i >= 24 && i % 3 === 2) {
    const n = Math.min(16, 10 + Math.floor((i - 24) / 24) + int(rnd, 2));
    return pattern(rnd, n, 3 + int(rnd, 3));
  }
  // Номер среди уровней с картинками (узоры пропускаем).
  const j = i - FIRST.length - (i >= 24 ? Math.floor((i - 24) / 3) : 0);
  const pass = Math.floor(j / REST.length);
  const order = pass === 0 ? REST : shuffle(mulberry(pass * 31 + 5), REST.slice());
  let pic = order[j % REST.length];
  if (pass % 2 === 1) pic = mirror(pic);
  if (pass >= 2) pic = recolor(pic, shuffle(rnd, [0, 1, 2, 3, 4, 5]));
  if (Math.max(pic.w, pic.h) <= 8 && (pass >= 1 || (i >= 40 && rnd() < 0.5))) pic = upscale(pic);
  return pic;
}

const cache = new Map<number, LevelDef>();

export function makeLevel(i: number): LevelDef {
  const hit = cache.get(i);
  if (hit) return hit;
  const rnd = mulberry(i * 2654435761 + 99);
  const pic = pictureFor(i, rnd);
  const t = Math.min(1, i / 150);
  const blocks = countColored(pic.cells);
  const intro: Intro = i === 0 ? 'first' : i === 1 ? 'second' : i === 2 ? 'third' : i === HIDDEN_FROM ? 'hidden' : i === STONE_FROM ? 'stone' : null;
  const stonesOn = i === STONE_FROM || (i > STONE_FROM && i % 2 === 1);
  const def = build(pic, i + 1, {
    merge: i === 0 ? 0.9 : i === 1 ? 0.5 : 0.2 + 0.5 * t,
    swap: i < 2 ? 0 : 0.15 + 0.45 * t,
    hidden: i < HIDDEN_FROM ? 0 : i === HIDDEN_FROM ? 0.3 : 0.12 + 0.2 * t,
    stones: stonesOn ? Math.max(3, Math.round(blocks * (0.02 + 0.03 * t))) : 0,
    maxPeak: i === 0 ? 0 : i < 12 ? 2 : 3,
    big: i < 3 ? 1.6 : 1,
  }, intro);
  cache.set(i, def);
  return def;
}

const SMALL = ARTS.filter((a) => Math.max(a.w, a.h) <= 9);

/** Картина дня: одна большая картина на всех. */
export function makeDaily(day: number): LevelDef {
  const hit = cache.get(-day);
  if (hit) return hit;
  const rnd = mulberry(day * 48271 + 7);
  const round = Math.floor(day / SMALL.length);
  const order = shuffle(mulberry(round * 131 + 3), SMALL.slice());
  const pic = day % 2 === 0 ? upscale(order[day % SMALL.length]) : pattern(rnd, 18, 5);
  const def = build(pic, day * 13 + 5, { merge: 0.3, swap: 0.25, hidden: 0.2, stones: Math.round(countColored(pic.cells) * 0.03), maxPeak: 3, big: 1 }, null);
  cache.set(-day, def);
  return def;
}
