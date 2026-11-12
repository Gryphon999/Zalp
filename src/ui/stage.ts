// Игровая сцена на одном холсте: картина, дорожка, лоток и очереди пушек.
// Правила считает core/game.ts, здесь только рисование, анимация и нажатия.
import { suggest, type Move } from '../core/bot';
import {
  STONE, busy, idle, launchCol, launchTray, newGame, rescue, side, stations, tick,
  type Ev, type Game, type Gun, type LostBy,
} from '../core/game';
import type { LevelDef } from '../core/levels';
import { UNKNOWN, toneOf, type Tone } from './palette';
import { play, shot } from './sound';

export interface StageHooks {
  onProgress(left: number, total: number): void;
  onPark(): void;
  onEnd(status: 'won' | 'lost', by: LostBy | null): void;
  onRefuse(reason: 'busy' | 'guide'): void;
}

export interface StageOptions {
  /** Ускоренный режим для автоматической проверки. */
  fast: boolean;
  /** Обучение: рука показывает нужную пушку, остальные не нажимаются. */
  guide: boolean;
  hooks: StageHooks;
}

interface Vis {
  x: number;
  y: number;
  r: number;
  dx: number;
  dy: number;
  kick: number;
  shake: number;
}

interface Shard {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string; rot: number; vr: number; grav: number;
}

interface Bolt {
  x0: number; y0: number; x1: number; y1: number;
  t: number; dur: number; cell: number; color: number;
}

interface Pt {
  x: number;
  y: number;
}

const HAND = new Path2D('M9 2a2 2 0 0 1 2 2v7l5 1.2a3 3 0 0 1 2.3 3.4l-.8 4.4a3 3 0 0 1-3 2.5H10a3 3 0 0 1-2.5-1.3L3.5 15a1.8 1.8 0 0 1 2.7-2.3L7 13.5V4a2 2 0 0 1 2-2z');
const UP: Pt = { x: 0, y: -1 };
const SIDE_DIR: Pt[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];

export class Stage {
  readonly game: Game;
  /** Время игры в миллисекундах (идёт с первого запуска пушки, стоит на паузе вне игры). */
  time = 0;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly ro: ResizeObserver;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private readonly tickMs: number;
  private started = false;
  private ended = false;
  private age = 0;
  private dead = false;

  // раскладка (в пикселях холста, без учёта плотности)
  private W = 0;
  private H = 0;
  private dpr = 1;
  private u = 20;
  private R = 12;
  private m = 18;
  private bx = 0;
  private by = 0;
  private trayY = 0;
  private slot = 48;
  private colW = 80;
  private RF = 26;
  private frontY = 0;

  private readonly vis = new Map<number, Vis>();
  private readonly shards: Shard[] = [];
  private readonly bolts: Bolt[] = [];
  /** Блоки, в которые ещё летит снаряд: по правилам их уже нет, но на экране они стоят до попадания. */
  private readonly ghosts = new Map<number, { color: number; t: number }>();
  private combo = 0;
  private comboAt = -9999;
  /** Последняя «круглая» серия (10, 20, 30…) и момент, когда она случилась: её показываем крупно. */
  private comboMark = 0;
  private comboMarkAt = -9999;
  private shakeT = 0;
  private hintMove: Move | null = null;
  private hintUntil = 0;
  private guideMove: Move | null = null;
  private trayFlash = 0;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly def: LevelDef, private readonly opt: StageOptions) {
    this.game = newGame(def.w, def.h, def.grid, def.cols);
    this.ctx = canvas.getContext('2d')!;
    // Круг по дорожке занимает около 4,5 секунды на любом размере картины.
    this.tickMs = opt.fast ? 6 : Math.max(55, Math.min(130, 4500 / stations(def.w, def.h)));
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(canvas);
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    this.layout();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
  }

  /** Подсветить лучшую пушку. false — подсказывать нечего (надо подождать). */
  hint(): boolean {
    const m = suggest(this.game);
    if (!m) return false;
    this.hintMove = m;
    this.hintUntil = this.age + 6000;
    return true;
  }

  /** Продолжить после проигрыша с дополнительным местом в лотке. */
  rescue(): void {
    rescue(this.game);
    this.ended = false;
    this.acc = 0;
    this.layout();
  }

  /** Один ход бота (для автоматической проверки). */
  botStep(): string {
    if (this.game.status !== 'play') return this.game.status;
    if (!idle(this.game)) return 'wait';
    const m = suggest(this.game);
    if (!m) return 'none';
    this.apply(m);
    return 'move';
  }

  // ---------- раскладка ----------

  private layout(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    this.W = rect.width;
    this.H = rect.height;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    const { w, h } = this.game;
    const trayH = 62;
    // Сначала считаем картину под самый тесный случай (очереди занимают минимум места),
    // потом лишнюю высоту делим: часть сверху, остальное — очередям, чтобы было видно больше пушек.
    const boardH = this.H - trayH - 112;
    let R = 12;
    let u = 20;
    for (let i = 0; i < 3; i++) {
      u = Math.min(46, (this.W - 4 * R - 14) / w, (boardH - 4 * R - 14) / h);
      R = Math.max(12, Math.min(22, u * 0.72));
    }
    this.u = u;
    this.R = R;
    this.m = R + 6;
    const need = h * u + 2 * (this.m + R) + 10;
    const top = Math.max(0, boardH - need) * 0.35;
    const bottom = top + need;
    this.bx = (this.W - w * u) / 2;
    this.by = top + (need - h * u) / 2;
    this.trayY = bottom + trayH / 2;
    this.slot = Math.min(50, (this.W - 20) / this.game.tray.length - 6);
    const k = this.game.cols.length;
    this.colW = Math.min(96, (this.W - 12) / k);
    this.RF = Math.min(28, this.colW / 2 - 7);
    this.frontY = bottom + trayH + this.RF + 8;
  }

  private station(p: number): Pt {
    const { w, h } = this.game;
    const { bx, by, u, m } = this;
    if (p < 0 || p >= stations(w, h)) return { x: bx + w * u + m, y: by + h * u + m };
    if (p < w) return { x: bx + (w - 1 - p + 0.5) * u, y: by + h * u + m };
    if (p < w + h) return { x: bx - m, y: by + (h - 1 - (p - w) + 0.5) * u };
    if (p < 2 * w + h) return { x: bx + (p - w - h + 0.5) * u, y: by - m };
    return { x: bx + w * u + m, y: by + (p - 2 * w - h + 0.5) * u };
  }

  private corner(s: number): Pt {
    const { w, h } = this.game;
    const { bx, by, u, m } = this;
    if (s === 0) return { x: bx - m, y: by + h * u + m };
    if (s === 1) return { x: bx - m, y: by - m };
    if (s === 2) return { x: bx + w * u + m, y: by - m };
    return { x: bx + w * u + m, y: by + h * u + m };
  }

  /** Точка дорожки между остановками i и i+1; углы обходятся по ломаной. */
  private trackPoint(i: number, frac: number): Pt {
    const { w, h } = this.game;
    const n = stations(w, h);
    const a = this.station(i);
    const b = this.station(i + 1);
    if (i + 1 >= n || side(w, h, i) === side(w, h, i + 1)) return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
    const c = this.corner(side(w, h, i));
    const l1 = Math.hypot(c.x - a.x, c.y - a.y);
    const l2 = Math.hypot(b.x - c.x, b.y - c.y);
    const d = frac * (l1 + l2);
    if (d <= l1) return { x: a.x + ((c.x - a.x) * d) / l1, y: a.y + ((c.y - a.y) * d) / l1 };
    const f = (d - l1) / l2;
    return { x: c.x + (b.x - c.x) * f, y: c.y + (b.y - c.y) * f };
  }

  private frontPos(c: number): Pt {
    const k = this.game.cols.length;
    return { x: this.W / 2 + (c - (k - 1) / 2) * this.colW, y: this.frontY };
  }

  private slotPos(i: number): Pt {
    const n = this.game.tray.length;
    return { x: this.W / 2 + (i - (n - 1) / 2) * (this.slot + 6), y: this.trayY };
  }

  private movePos(m: Move): Pt {
    return m.from === 'col' ? this.frontPos(m.index) : this.slotPos(m.index);
  }

  // ---------- нажатия ----------

  private hit(e: PointerEvent): Move | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    for (let c = 0; c < this.game.cols.length; c++) {
      const p = this.frontPos(c);
      if (this.game.cols[c].length && Math.hypot(x - p.x, y - p.y) < this.RF + 10) return { from: 'col', index: c };
    }
    for (let i = 0; i < this.game.tray.length; i++) {
      const p = this.slotPos(i);
      if (this.game.tray[i] && Math.abs(x - p.x) < this.slot / 2 + 3 && Math.abs(y - p.y) < this.slot / 2 + 5) return { from: 'tray', index: i };
    }
    return null;
  }

  private readonly onMove = (e: PointerEvent): void => {
    this.canvas.style.cursor = this.game.status === 'play' && this.hit(e) ? 'pointer' : 'default';
  };

  private readonly onDown = (e: PointerEvent): void => {
    if (this.game.status !== 'play') return;
    const m = this.hit(e);
    if (!m) return;
    if (this.opt.guide) {
      const g = this.guideMove;
      if (!g) return; // пушка ещё едет — в обучении ждём
      if (g.from !== m.from || g.index !== m.index) {
        this.wobble(m);
        play('bad');
        this.opt.hooks.onRefuse('guide');
        return;
      }
    }
    if (!this.apply(m)) {
      this.wobble(m);
      play('bad');
      this.opt.hooks.onRefuse('busy');
    }
  };

  private gunAt(m: Move): Gun | null {
    return m.from === 'col' ? this.game.cols[m.index][0] ?? null : this.game.tray[m.index];
  }

  private wobble(m: Move): void {
    const gun = this.gunAt(m);
    const v = gun && this.vis.get(gun.id);
    if (v) v.shake = 1;
  }

  private apply(m: Move): boolean {
    const ok = m.from === 'col' ? launchCol(this.game, m.index) : launchTray(this.game, m.index);
    if (!ok) return false;
    this.started = true;
    this.hintMove = null;
    this.guideMove = null;
    play('launch');
    return true;
  }

  // ---------- такт и события ----------

  private handle(events: Ev[]): void {
    const fast = this.opt.fast;
    for (const e of events) {
      if (e.t === 'shot') {
        const v = this.vis.get(e.gun.id);
        const from = v ?? this.station(e.pos);
        const to = this.cellCenter(e.cell);
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        const dur = fast ? 4 : Math.min(150, 50 + dist * 0.35);
        this.bolts.push({ x0: from.x, y0: from.y, x1: to.x, y1: to.y, t: 0, dur, cell: e.cell, color: e.color });
        this.ghosts.set(e.cell, { color: e.color, t: dur });
        if (v) v.kick = this.R * 0.45;
        this.combo = this.age - this.comboAt < 900 ? this.combo + 1 : 1;
        this.comboAt = this.age;
        if (this.combo % 10 === 0) {
          this.comboMark = this.combo;
          this.comboMarkAt = this.age;
        }
        shot(this.combo);
      } else if (e.t === 'crumble') {
        this.ghosts.set(e.cell, { color: STONE, t: fast ? 4 : 220 });
      } else if (e.t === 'empty') {
        const v = this.vis.get(e.gun.id);
        if (v) this.burst(v.x, v.y, toneOf(e.gun.color).light, 8, 1.3);
        play('empty');
      } else if (e.t === 'park') {
        play('park');
        this.trayFlash = 1;
        this.opt.hooks.onPark();
      } else if (e.t === 'won') {
        play('win');
        this.confetti();
      } else if (e.t === 'lost') {
        play('lose');
        this.shakeT = 450;
      }
    }
    if (events.some((e) => e.t === 'shot')) this.opt.hooks.onProgress(this.game.left, this.game.total);
  }

  private cellCenter(cell: number): Pt {
    const x = cell % this.game.w;
    const y = (cell - x) / this.game.w;
    return { x: this.bx + (x + 0.5) * this.u, y: this.by + (y + 0.5) * this.u };
  }

  private burst(x: number, y: number, color: string, n: number, power: number): void {
    if (this.shards.length > 500) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.05 + Math.random() * 0.16) * power * (this.u / 22);
      this.shards.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.04,
        life: 0, max: 320 + Math.random() * 260, size: this.u * (0.16 + Math.random() * 0.18),
        color, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.02, grav: 0.0005,
      });
    }
  }

  private confetti(): void {
    const colors = [1, 2, 3, 4, 5, 6, 7, 8].map((c) => toneOf(c).base);
    for (let i = 0; i < 110; i++) {
      this.shards.push({
        x: Math.random() * this.W, y: -20 - Math.random() * this.H * 0.4,
        vx: (Math.random() - 0.5) * 0.12, vy: 0.12 + Math.random() * 0.2,
        life: 0, max: 2600 + Math.random() * 900, size: 6 + Math.random() * 7,
        color: colors[i % colors.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.02, grav: 0.00012,
      });
    }
  }

  // ---------- кадр ----------

  private readonly frame = (now: number): void => {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(50, this.last ? now - this.last : 16);
    this.last = now;
    this.age += dt;
    const g = this.game;

    if (g.status === 'play' && !document.hidden) {
      if (this.started) this.time += dt;
      this.acc += dt;
      let guard = 0;
      while (this.acc >= this.tickMs && g.status === 'play' && guard++ < 12) {
        this.acc -= this.tickMs;
        this.handle(tick(g));
      }
      if (g.status !== 'play') this.acc = 0;
    }
    if (g.status !== 'play' && !this.ended) {
      this.ended = true;
      const status = g.status;
      const by = g.lostBy;
      setTimeout(() => !this.dead && this.opt.hooks.onEnd(status, by), this.opt.fast ? 30 : status === 'won' ? 900 : 650);
    }
    if (this.opt.guide && g.status === 'play' && idle(g) && !this.guideMove) this.guideMove = suggest(g);
    if (this.hintMove && (this.age > this.hintUntil || !this.gunAt(this.hintMove))) this.hintMove = null;

    this.update(dt);
    this.draw();
  };

  /** Плавно подтягивает каждую пушку к месту, где она должна стоять по правилам. */
  private update(dt: number): void {
    const g = this.game;
    const live = new Set<number>();
    const frac = g.status === 'play' ? Math.min(1, this.acc / this.tickMs) : 1;
    const place = (gun: Gun, p: Pt, r: number, dir: Pt, rate: number, spawn: Pt) => {
      live.add(gun.id);
      let v = this.vis.get(gun.id);
      if (!v) {
        v = { x: spawn.x, y: spawn.y, r, dx: dir.x, dy: dir.y, kick: 0, shake: 0 };
        this.vis.set(gun.id, v);
      }
      const k = 1 - Math.exp(-dt * rate);
      v.x += (p.x - v.x) * k;
      v.y += (p.y - v.y) * k;
      v.r += (r - v.r) * k;
      v.dx += (dir.x - v.dx) * k;
      v.dy += (dir.y - v.dy) * k;
      v.kick *= Math.exp(-dt * 0.02);
      v.shake = Math.max(0, v.shake - dt / 350);
    };
    const rb = this.RF * 0.6;
    g.cols.forEach((col, c) => {
      const f = this.frontPos(c);
      col.forEach((gun, j) => {
        const p = j === 0 ? f : { x: f.x, y: f.y + this.RF + 6 + rb + (j - 1) * (rb * 2 + 5) };
        place(gun, p, j === 0 ? this.RF : rb, UP, 0.018, { x: p.x, y: p.y + 30 });
      });
    });
    g.tray.forEach((gun, i) => gun && place(gun, this.slotPos(i), this.slot * 0.4, UP, 0.016, this.slotPos(i)));
    const gate = this.station(-1);
    g.gate.forEach((gun, i) => place(gun, { x: gate.x, y: gate.y + i * 7 }, this.R, UP, 0.02, gate));
    const n = stations(g.w, g.h);
    for (const r of g.track) {
      const p = this.trackPoint(r.pos, frac);
      const s = side(g.w, g.h, Math.min(n - 1, r.pos));
      place(r.gun, p, this.R, SIDE_DIR[s], 0.045, gate);
    }
    for (const id of this.vis.keys()) if (!live.has(id)) this.vis.delete(id);

    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      if (b.t >= b.dur) this.bolts.splice(i, 1);
    }
    for (const [cell, gh] of this.ghosts) {
      gh.t -= dt;
      if (gh.t <= 0) {
        this.ghosts.delete(cell);
        const c = this.cellCenter(cell);
        if (gh.color === STONE) {
          this.burst(c.x, c.y, toneOf(STONE).base, 7, 0.8);
          play('crumble');
        } else {
          this.burst(c.x, c.y, toneOf(gh.color).base, 5, 1);
          this.burst(c.x, c.y, toneOf(gh.color).light, 2, 0.7);
        }
      }
    }
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.life += dt;
      s.vy += s.grav * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vr * dt;
      if (s.life >= s.max) this.shards.splice(i, 1);
    }
    this.shakeT = Math.max(0, this.shakeT - dt);
    this.trayFlash = Math.max(0, this.trayFlash - dt / 500);
  }

  private draw(): void {
    const { ctx, W, H } = this;
    const g = this.game;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (this.shakeT > 0) {
      const a = (this.shakeT / 450) * 7;
      ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
    }
    this.drawTrack();
    this.drawBoard();
    this.drawTray();
    this.drawQueues();

    // пушки в лотке, у въезда и на дорожке
    for (const gun of g.tray) if (gun) this.drawGun(gun);
    for (const gun of g.gate) this.drawGun(gun);
    for (const r of g.track) this.drawGun(r.gun);

    // снаряды
    for (const b of this.bolts) {
      const f = b.t / b.dur;
      const tone = toneOf(b.color);
      const x = b.x0 + (b.x1 - b.x0) * f;
      const y = b.y0 + (b.y1 - b.y0) * f;
      const f0 = Math.max(0, f - 0.35);
      ctx.strokeStyle = tone.light;
      ctx.lineWidth = Math.max(2.5, this.u * 0.16);
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(b.x0 + (b.x1 - b.x0) * f0, b.y0 + (b.y1 - b.y0) * f0);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2.2, this.u * 0.13), 0, Math.PI * 2);
      ctx.fill();
    }

    // осколки и конфетти
    for (const s of this.shards) {
      ctx.globalAlpha = Math.min(1, (1 - s.life / s.max) * 1.6);
      ctx.fillStyle = s.color;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.fillRect(-s.size / 2, -s.size / 2, s.size, s.size * 0.7);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    this.drawCombo();
    this.drawPointer();
  }

  private drawTrack(): void {
    const { ctx, bx, by, u, m, R } = this;
    const { w, h } = this.game;
    const x = bx - m;
    const y = by - m;
    const tw = w * u + 2 * m;
    const th = h * u + 2 * m;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,.09)';
    ctx.lineWidth = R * 2 + 6;
    ctx.beginPath();
    ctx.roundRect(x, y, tw, th, R * 0.9);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.2)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 7]);
    ctx.lineDashOffset = -(this.age / 60) % 10; // пунктир бежит по ходу движения
    ctx.beginPath();
    // Обход по часовой стрелке, как едут пушки: от правого нижнего угла влево.
    ctx.moveTo(x + tw, y + th);
    ctx.lineTo(x, y + th);
    ctx.lineTo(x, y);
    ctx.lineTo(x + tw, y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    // стрелки направления посередине каждой стороны
    ctx.fillStyle = 'rgba(255,255,255,.34)';
    const a = Math.max(4, R * 0.42);
    const marks: [number, number, number][] = [
      [x + tw / 2, y + th, Math.PI], [x, y + th / 2, -Math.PI / 2], [x + tw / 2, y, 0], [x + tw, y + th / 2, Math.PI / 2],
    ];
    for (const [mx, my, rot] of marks) {
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.moveTo(a, 0);
      ctx.lineTo(-a * 0.7, -a * 0.8);
      ctx.lineTo(-a * 0.7, a * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private drawBlock(px: number, py: number, s: number, tone: Tone, stone: boolean): void {
    const { ctx } = this;
    ctx.fillStyle = tone.dark;
    ctx.beginPath();
    ctx.roundRect(px, py, s, s, s * 0.2);
    ctx.fill();
    ctx.fillStyle = tone.base;
    ctx.beginPath();
    ctx.roundRect(px, py, s, s - Math.max(1.5, s * 0.1), s * 0.2);
    ctx.fill();
    if (stone) {
      ctx.strokeStyle = tone.dark;
      ctx.lineWidth = Math.max(1, s * 0.07);
      ctx.beginPath();
      ctx.moveTo(px + s * 0.25, py + s * 0.2);
      ctx.lineTo(px + s * 0.48, py + s * 0.45);
      ctx.lineTo(px + s * 0.36, py + s * 0.72);
      ctx.moveTo(px + s * 0.48, py + s * 0.45);
      ctx.lineTo(px + s * 0.74, py + s * 0.55);
      ctx.stroke();
    } else {
      ctx.fillStyle = tone.light;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.roundRect(px + s * 0.14, py + s * 0.1, s * 0.72, s * 0.2, s * 0.1);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private drawBoard(): void {
    const { ctx, bx, by, u } = this;
    const g = this.game;
    const { w, h } = g;
    ctx.fillStyle = 'rgba(14,8,48,.5)';
    ctx.beginPath();
    ctx.roundRect(bx - 4, by - 4, w * u + 8, h * u + 8, 8);
    ctx.fill();
    const gap = Math.max(0.6, u * 0.04);
    const s = u - gap * 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const cell = y * w + x;
        const v = g.grid[cell] || this.ghosts.get(cell)?.color || 0;
        const px = bx + x * u + gap;
        const py = by + y * u + gap;
        if (!v) {
          // след сбитого блока: бледный отпечаток исходной картины
          const was = this.def.picture[cell];
          if (was) {
            ctx.globalAlpha = 0.1;
            ctx.fillStyle = toneOf(was).base;
            ctx.beginPath();
            ctx.roundRect(px, py, s, s, s * 0.2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          continue;
        }
        // блоки «вырастают» волной в начале уровня
        const grow = Math.min(1, Math.max(0, (this.age - (x + y) * 22) / 180));
        if (grow <= 0) continue;
        const k = grow < 1 ? 0.3 + 0.7 * grow * (2 - grow) : 1;
        const off = (s * (1 - k)) / 2;
        this.drawBlock(px + off, py + off, s * k, toneOf(v), v === STONE);
      }
    }
  }

  private drawTray(): void {
    const { ctx, slot } = this;
    const g = this.game;
    const used = g.tray.filter((t) => t !== null).length;
    const danger = used >= g.tray.length - 1;
    g.tray.forEach((gun, i) => {
      const p = this.slotPos(i);
      const bonus = i >= 5;
      ctx.fillStyle = gun ? 'rgba(255,255,255,.14)' : 'rgba(14,8,48,.34)';
      ctx.beginPath();
      ctx.roundRect(p.x - slot / 2, p.y - slot / 2, slot, slot, 12);
      ctx.fill();
      const pulse = danger ? 0.55 + 0.35 * Math.sin(this.age / 160) : 0.28 + this.trayFlash * 0.5;
      ctx.strokeStyle = bonus ? `rgba(255,210,63,${0.8})` : danger ? `rgba(255,122,92,${pulse})` : `rgba(255,255,255,${pulse})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  private drawQueues(): void {
    const { ctx, RF, colW } = this;
    const g = this.game;
    const rb = RF * 0.6;
    g.cols.forEach((col, c) => {
      const f = this.frontPos(c);
      const top = f.y - RF - 5;
      ctx.fillStyle = 'rgba(14,8,48,.3)';
      ctx.beginPath();
      ctx.roundRect(f.x - colW / 2 + 4, top, colW - 8, this.H - top + 20, 16);
      ctx.fill();
      // рисуем с конца, чтобы передняя пушка была поверх
      let hiddenCount = 0;
      for (let j = col.length - 1; j >= 0; j--) {
        const v = this.vis.get(col[j].id);
        if (!v) continue;
        if (j > 0 && v.y + rb > this.H - 3) {
          hiddenCount++;
          continue;
        }
        this.drawGun(col[j]);
      }
      if (hiddenCount > 0) {
        ctx.fillStyle = 'rgba(255,255,255,.8)';
        ctx.font = '700 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        const shown = col.length - hiddenCount;
        const y = shown <= 1 ? f.y + RF + 22 : Math.min(this.H - 5, f.y + RF + 6 + (shown - 1) * (rb * 2 + 5) + 15);
        if (y <= this.H - 3) ctx.fillText(`+${hiddenCount}`, f.x, y);
      }
    });
  }

  private drawGun(gun: Gun): void {
    const v = this.vis.get(gun.id);
    if (!v) return;
    const { ctx } = this;
    const tone = gun.hidden ? UNKNOWN : toneOf(gun.color);
    const r = v.r;
    const len = Math.hypot(v.dx, v.dy) || 1;
    const dx = v.dx / len;
    const dy = v.dy / len;
    const sx = v.shake > 0 ? Math.sin(v.shake * 28) * 5 * v.shake : 0;
    const x = v.x - dx * v.kick + sx;
    const y = v.y - dy * v.kick;
    // ствол
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = tone.dark;
    ctx.beginPath();
    ctx.roundRect(r * 0.3, -r * 0.3, r * 0.98, r * 0.6, r * 0.14);
    ctx.fill();
    ctx.fillStyle = tone.light;
    ctx.beginPath();
    ctx.roundRect(r * 1.02, -r * 0.3, r * 0.26, r * 0.6, r * 0.1);
    ctx.fill();
    ctx.restore();
    // корпус
    ctx.fillStyle = 'rgba(10,4,40,.35)';
    ctx.beginPath();
    ctx.arc(x, y + r * 0.14, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tone.dark;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tone.base;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.84, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tone.light;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.ellipse(x - r * 0.25, y - r * 0.42, r * 0.42, r * 0.2, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // заряды
    const label = gun.hidden ? '?' : String(gun.ammo);
    const size = Math.max(13, Math.round(r * (label.length > 1 ? 0.92 : 1.1)));
    ctx.font = `800 ${size}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = tone.ink;
    ctx.fillText(label, x, y + size * 0.06);
  }

  private drawCombo(): void {
    const since = this.age - this.comboMarkAt;
    if (since > 1100) return;
    const { ctx } = this;
    const pop = Math.min(1, since / 120);
    const size = Math.min(44, 26 + this.comboMark * 0.3) * (1.3 - 0.3 * pop);
    ctx.globalAlpha = Math.min(0.92, (1100 - since) / 400);
    ctx.font = `900 ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const x = this.W / 2;
    const y = this.by + this.game.h * this.u * 0.5;
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(30,12,80,.75)';
    ctx.strokeText(`×${this.comboMark}`, x, y);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(`×${this.comboMark}`, x, y);
    ctx.globalAlpha = 1;
  }

  /** Кольцо подсказки и рука-указатель обучения. */
  private drawPointer(): void {
    const g = this.game;
    if (g.status !== 'play') return;
    const { ctx } = this;
    const m = this.opt.guide ? this.guideMove : this.hintMove;
    if (!m || !this.gunAt(m)) return;
    const p = this.movePos(m);
    const r = (m.from === 'col' ? this.RF : this.slot * 0.4) + 6 + Math.sin(this.age / 180) * 3;
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    if (!this.opt.guide) return;
    const s = 2;
    const bob = Math.abs(Math.sin(this.age / 260)) * 9;
    ctx.save();
    const pr = m.from === 'col' ? this.RF : this.slot * 0.4;
    ctx.translate(p.x - 9 * s + pr * 0.45, p.y + pr * 0.5 + bob);
    ctx.scale(s, s);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#2a1846';
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.fill(HAND);
    ctx.stroke(HAND);
    ctx.restore();
  }

  /** Сколько пушек сейчас в пути (для подсказки «дорожка занята»). */
  get busy(): number {
    return busy(this.game);
  }
}
