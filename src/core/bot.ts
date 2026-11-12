// Бот-решатель. Им проверяется проходимость каждого уровня, он же даёт подсказки игроку.
// Бот играет «по одной»: запускает пушку, ждёт конца её круга, потом выбирает следующую.
import { STONE, crumble, firstBlock, stations, type Game } from './game';

export interface Move {
  from: 'col' | 'tray';
  index: number;
}

/** Один круг одинокой пушки по дорожке. Меняет поле, возвращает число попаданий. */
export function lap(grid: Uint8Array, w: number, h: number, color: number, ammo: number): number {
  const n = stations(w, h);
  let hits = 0;
  for (let p = 0; p < n && hits < ammo; p++) {
    const cell = firstBlock(grid, w, h, p);
    if (cell < 0 || grid[cell] !== color) continue;
    grid[cell] = 0;
    hits++;
    crumble(grid, w, h, cell);
  }
  return hits;
}

interface Item {
  color: number;
  ammo: number;
  /** Номер места в настоящем лотке; -1 для пушек, попавших в лоток уже во время поиска. */
  slot: number;
}

export interface Position {
  w: number;
  h: number;
  grid: Uint8Array;
  cols: { color: number; ammo: number }[][];
  tray: ({ color: number; ammo: number } | null)[];
}

export interface Solution {
  first: Move;
  /** Наибольшее заполнение лотка на найденном пути. */
  peak: number;
  moves: number;
}

function colored(grid: Uint8Array): number {
  let n = 0;
  for (const v of grid) if (v && v !== STONE) n++;
  return n;
}

/** Поиск в глубину с возвратом. limit ограничивает число просмотренных позиций. */
export function solve(pos: Position, limit = 800): Solution | null {
  const { w, h } = pos;
  const cap = pos.tray.length;
  let nodes = 0;
  let first: Move | null = null;
  let moves = 0;

  const dfs = (grid: Uint8Array, ptr: number[], tray: Item[], left: number, peak: number, depth: number): number => {
    if (left === 0) {
      moves = depth;
      return peak;
    }
    if (++nodes > limit) return -1;
    interface Cand {
      move: Move;
      grid: Uint8Array;
      hits: number;
      rest: number;
      trayIndex: number;
      item: Item;
    }
    const cands: Cand[] = [];
    const seen = new Set<number>();
    tray.forEach((it, i) => {
      const key = it.color * 1000 + it.ammo;
      if (seen.has(key)) return;
      seen.add(key);
      const g2 = grid.slice();
      const hits = lap(g2, w, h, it.color, it.ammo);
      if (hits > 0) cands.push({ move: { from: 'tray', index: it.slot }, grid: g2, hits, rest: it.ammo - hits, trayIndex: i, item: it });
    });
    for (let c = 0; c < pos.cols.length; c++) {
      const gun = pos.cols[c][ptr[c]];
      if (!gun) continue;
      const g2 = grid.slice();
      const hits = lap(g2, w, h, gun.color, gun.ammo);
      const rest = gun.ammo - hits;
      if (rest > 0 && tray.length >= cap) continue; // вернуться ей будет некуда
      cands.push({ move: { from: 'col', index: c }, grid: g2, hits, rest, trayIndex: -1, item: { color: gun.color, ammo: gun.ammo, slot: -1 } });
    }
    // Сначала те, кто расстреляет всё и не займёт лоток, потом пушки из лотка, потом самые меткие.
    cands.sort((a, b) =>
      Number(a.rest > 0) - Number(b.rest > 0) ||
      Number(a.hits === 0) - Number(b.hits === 0) ||
      Number(a.trayIndex < 0) - Number(b.trayIndex < 0) ||
      b.hits - a.hits,
    );
    for (const c of cands) {
      const tray2 = c.trayIndex >= 0 ? tray.filter((_, i) => i !== c.trayIndex) : tray.slice();
      if (c.rest > 0) tray2.push({ color: c.item.color, ammo: c.rest, slot: -1 });
      const ptr2 = c.trayIndex >= 0 ? ptr : ptr.map((p, i) => (i === c.move.index ? p + 1 : p));
      const res = dfs(c.grid, ptr2, tray2, left - c.hits, Math.max(peak, tray2.length), depth + 1);
      if (res >= 0) {
        if (depth === 0) first = c.move;
        return res;
      }
      if (nodes > limit) return -1;
    }
    return -1;
  };

  const tray: Item[] = [];
  pos.tray.forEach((t, slot) => {
    if (t) tray.push({ color: t.color, ammo: t.ammo, slot });
  });
  const peak = dfs(pos.grid, pos.cols.map(() => 0), tray, colored(pos.grid), tray.length, 0);
  return peak >= 0 && first ? { first, peak, moves } : null;
}

/** Запасной выбор, когда полный поиск не нашёл пути: пушка с наибольшим числом попаданий за круг. */
export function greedy(pos: Position): Move | null {
  let best: Move | null = null;
  let bestHits = 0;
  const tryGun = (move: Move, color: number, ammo: number) => {
    const hits = lap(pos.grid.slice(), pos.w, pos.h, color, ammo);
    if (hits > bestHits) {
      bestHits = hits;
      best = move;
    }
  };
  pos.tray.forEach((t, i) => t && tryGun({ from: 'tray', index: i }, t.color, t.ammo));
  pos.cols.forEach((c, i) => c[0] && tryGun({ from: 'col', index: i }, c[0].color, c[0].ammo));
  if (!best && pos.tray.some((t) => t === null)) {
    const i = pos.cols.findIndex((c) => c.length > 0);
    if (i >= 0) best = { from: 'col', index: i };
  }
  return best;
}

export const snapshot = (g: Game): Position => ({ w: g.w, h: g.h, grid: g.grid, cols: g.cols, tray: g.tray });

/** Лучший ход в текущей позиции игры. */
export function suggest(g: Game): Move | null {
  const pos = snapshot(g);
  return solve(pos, 600)?.first ?? greedy(pos);
}
