// Правила игры без графики. Время идёт «тактами»: за такт каждая пушка на дорожке
// проезжает одну остановку (напротив ряда или столбца) и, если видит свой цвет, стреляет.

export const STONE = 15;
export const TRACK_CAP = 5;
export const TRAY_CAP = 5;
/** Сколько остановок должно быть свободно у въезда, чтобы выпустить следующую пушку. */
export const GAP = 2;

export interface Gun {
  id: number;
  color: number;
  ammo: number;
  hidden: boolean;
}

export interface Rider {
  gun: Gun;
  pos: number;
}

export type LostBy = 'tray' | 'stuck';

export interface Game {
  w: number;
  h: number;
  grid: Uint8Array;
  /** Колонки очереди; первая в массиве — передняя, её можно запускать. */
  cols: Gun[][];
  tray: (Gun | null)[];
  /** Пушки, которые уже запущены, но ждут свободного въезда. */
  gate: Gun[];
  track: Rider[];
  status: 'play' | 'won' | 'lost';
  lostBy: LostBy | null;
  /** Пушка, которой не хватило места в лотке. */
  overflow: Gun | null;
  /** Наибольшее число занятых мест лотка за игру. */
  peak: number;
  left: number;
  total: number;
  shots: number;
  ticks: number;
}

export type Ev =
  | { t: 'enter'; gun: Gun }
  | { t: 'shot'; gun: Gun; pos: number; cell: number; color: number }
  | { t: 'crumble'; cell: number }
  | { t: 'empty'; gun: Gun }
  | { t: 'park'; gun: Gun; slot: number }
  | { t: 'lost'; by: LostBy }
  | { t: 'won' };

export const stations = (w: number, h: number): number => 2 * (w + h);

/** Сторона остановки: 0 низ, 1 лево, 2 верх, 3 право. Пушки едут по часовой стрелке, въезд справа снизу. */
export function side(w: number, h: number, p: number): number {
  if (p < w) return 0;
  if (p < w + h) return 1;
  if (p < 2 * w + h) return 2;
  return 3;
}

/** Ближайший к остановке блок её ряда или столбца. -1, если линия пуста. */
export function firstBlock(grid: Uint8Array, w: number, h: number, p: number): number {
  if (p < w) {
    const x = w - 1 - p;
    for (let y = h - 1; y >= 0; y--) if (grid[y * w + x]) return y * w + x;
  } else if (p < w + h) {
    const y = h - 1 - (p - w);
    for (let x = 0; x < w; x++) if (grid[y * w + x]) return y * w + x;
  } else if (p < 2 * w + h) {
    const x = p - w - h;
    for (let y = 0; y < h; y++) if (grid[y * w + x]) return y * w + x;
  } else {
    const y = p - 2 * w - h;
    for (let x = w - 1; x >= 0; x--) if (grid[y * w + x]) return y * w + x;
  }
  return -1;
}

const isColor = (v: number): boolean => v > 0 && v !== STONE;

function hasColorNear(grid: Uint8Array, w: number, h: number, cell: number): boolean {
  const x = cell % w;
  const y = (cell - x) / w;
  return (
    (x > 0 && isColor(grid[cell - 1])) ||
    (x < w - 1 && isColor(grid[cell + 1])) ||
    (y > 0 && isColor(grid[cell - w])) ||
    (y < h - 1 && isColor(grid[cell + w]))
  );
}

/** Камень рассыпается, когда рядом с ним не осталось цветных блоков. Возвращает рассыпавшиеся клетки. */
export function crumble(grid: Uint8Array, w: number, h: number, cell: number, out: number[] = []): number[] {
  const x = cell % w;
  const y = (cell - x) / w;
  const near = [x > 0 ? cell - 1 : -1, x < w - 1 ? cell + 1 : -1, y > 0 ? cell - w : -1, y < h - 1 ? cell + w : -1];
  for (const n of near) {
    if (n >= 0 && grid[n] === STONE && !hasColorNear(grid, w, h, n)) {
      grid[n] = 0;
      out.push(n);
    }
  }
  return out;
}

/** Убирает камни, у которых с самого начала нет цветных соседей. */
export function dropLonelyStones(grid: Uint8Array, w: number, h: number): void {
  for (let i = 0; i < grid.length; i++) if (grid[i] === STONE && !hasColorNear(grid, w, h, i)) grid[i] = 0;
}

export function countColored(grid: Uint8Array): number {
  let n = 0;
  for (const v of grid) if (isColor(v)) n++;
  return n;
}

export interface GunDef {
  color: number;
  ammo: number;
  hidden: boolean;
}

export function newGame(w: number, h: number, grid: Uint8Array, cols: GunDef[][]): Game {
  let id = 0;
  const g: Game = {
    w, h,
    grid: grid.slice(),
    cols: cols.map((col) => col.map((d) => ({ id: ++id, color: d.color, ammo: d.ammo, hidden: d.hidden }))),
    tray: Array.from({ length: TRAY_CAP }, () => null),
    gate: [], track: [], status: 'play', lostBy: null, overflow: null,
    peak: 0, left: 0, total: 0, shots: 0, ticks: 0,
  };
  g.left = g.total = countColored(g.grid);
  for (const col of g.cols) if (col[0]) col[0].hidden = false;
  return g;
}

export const busy = (g: Game): number => g.track.length + g.gate.length;
export const idle = (g: Game): boolean => busy(g) === 0;

export function launchCol(g: Game, c: number): boolean {
  const col = g.cols[c];
  if (g.status !== 'play' || !col || col.length === 0 || busy(g) >= TRACK_CAP) return false;
  g.gate.push(col.shift()!);
  if (col[0]) col[0].hidden = false;
  return true;
}

export function launchTray(g: Game, slot: number): boolean {
  const gun = g.tray[slot];
  if (g.status !== 'play' || !gun || busy(g) >= TRACK_CAP) return false;
  g.tray[slot] = null;
  g.gate.push(gun);
  return true;
}

/** Цвета, по которым сейчас можно попасть хоть с одной остановки. */
export function exposed(grid: Uint8Array, w: number, h: number): Set<number> {
  const set = new Set<number>();
  const n = stations(w, h);
  for (let p = 0; p < n; p++) {
    const cell = firstBlock(grid, w, h, p);
    if (cell >= 0 && grid[cell] !== STONE) set.add(grid[cell]);
  }
  return set;
}

/** Тупик: лоток полон (или очереди кончились), и ни одна доступная пушка не достаёт свой цвет. */
function stuck(g: Game): boolean {
  if (!idle(g)) return false;
  const full = g.tray.every((t) => t !== null);
  const colsEmpty = g.cols.every((c) => c.length === 0);
  if (!full && !colsEmpty) return false;
  const open = exposed(g.grid, g.w, g.h);
  for (const t of g.tray) if (t && open.has(t.color)) return false;
  for (const c of g.cols) if (c[0] && open.has(c[0].color)) return false;
  return true;
}

export function tick(g: Game): Ev[] {
  const ev: Ev[] = [];
  if (g.status !== 'play') return ev;
  g.ticks++;
  const n = stations(g.w, g.h);

  // 1. Все едут на одну остановку вперёд; кто прошёл круг — встаёт в лоток.
  for (const r of g.track) r.pos++;
  const done = g.track.filter((r) => r.pos >= n);
  g.track = g.track.filter((r) => r.pos < n);
  for (const r of done) {
    const slot = g.tray.indexOf(null);
    if (slot < 0) {
      g.status = 'lost';
      g.lostBy = 'tray';
      g.overflow = r.gun;
      ev.push({ t: 'lost', by: 'tray' });
      return ev;
    }
    g.tray[slot] = r.gun;
    g.peak = Math.max(g.peak, g.tray.filter((t) => t !== null).length);
    ev.push({ t: 'park', gun: r.gun, slot });
  }

  // 2. Въезд свободен — выпускаем следующую.
  if (g.gate.length > 0 && g.track.every((r) => r.pos >= GAP)) {
    const gun = g.gate.shift()!;
    g.track.push({ gun, pos: 0 });
    ev.push({ t: 'enter', gun });
  }

  // 3. Выстрелы: сначала те, кто уехал дальше.
  const order = g.track.slice().sort((a, b) => b.pos - a.pos);
  for (const r of order) {
    const cell = firstBlock(g.grid, g.w, g.h, r.pos);
    if (cell < 0 || g.grid[cell] !== r.gun.color) continue;
    g.grid[cell] = 0;
    g.left--;
    g.shots++;
    r.gun.ammo--;
    ev.push({ t: 'shot', gun: r.gun, pos: r.pos, cell, color: r.gun.color });
    for (const c of crumble(g.grid, g.w, g.h, cell)) ev.push({ t: 'crumble', cell: c });
    if (r.gun.ammo <= 0) {
      g.track = g.track.filter((x) => x !== r);
      ev.push({ t: 'empty', gun: r.gun });
    }
  }

  if (g.left === 0) {
    g.status = 'won';
    ev.push({ t: 'won' });
  } else if (stuck(g)) {
    g.status = 'lost';
    g.lostBy = 'stuck';
    ev.push({ t: 'lost', by: 'stuck' });
  }
  return ev;
}

/** Вторая попытка после проигрыша: в лотке появляется дополнительное место. */
export function rescue(g: Game): void {
  if (g.status !== 'lost') return;
  g.tray.push(g.overflow);
  g.overflow = null;
  g.status = 'play';
  g.lostBy = null;
  g.peak = Math.max(g.peak, g.tray.filter((t) => t !== null).length);
}

/** Звёзды за уровень: чем меньше мест лотка понадобилось, тем лучше. */
export function starsFor(peak: number): number {
  if (peak <= 2) return 3;
  if (peak <= 4) return 2;
  return 1;
}
