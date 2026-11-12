// Живой фон: цветные квадратики медленно всплывают и вращаются, иногда вспыхивает салют.
// Холст на всё окно, плотность пикселей не выше 1,5 — чтобы не грузить телефон.
import { toneOf } from './palette';

interface Bit {
  x: number; y: number; size: number; speed: number; rot: number; vr: number; color: string; alpha: number;
}

interface Spark {
  x: number; y: number; vx: number; vy: number; life: number; max: number; color: string;
}

export function startBackdrop(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  let w = 0;
  let h = 0;
  let dpr = 1;
  const bits: Bit[] = [];
  const sparks: Spark[] = [];
  const color = () => toneOf(1 + Math.floor(Math.random() * 8)).base;

  const resize = () => {
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const want = Math.round(Math.min(46, (w * h) / 16000));
    while (bits.length < want) {
      bits.push({
        x: Math.random() * w, y: Math.random() * h, size: 8 + Math.random() * 20, speed: 0.006 + Math.random() * 0.014,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.0006, color: color(), alpha: 0.07 + Math.random() * 0.11,
      });
    }
    bits.length = want;
  };
  resize();
  window.addEventListener('resize', resize);

  let last = 0;
  let nextBurst = 1500;
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = Math.min(50, last ? now - last : 16);
    last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (const b of bits) {
      b.y -= b.speed * dt;
      b.rot += b.vr * dt;
      if (b.y < -40) {
        b.y = h + 40;
        b.x = Math.random() * w;
      }
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.globalAlpha = b.alpha;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.roundRect(-b.size / 2, -b.size / 2, b.size, b.size, b.size * 0.22);
      ctx.fill();
      ctx.restore();
    }
    nextBurst -= dt;
    if (nextBurst <= 0) {
      nextBurst = 2600 + Math.random() * 3200;
      const x = w * (0.1 + Math.random() * 0.8);
      const y = h * (0.08 + Math.random() * 0.4);
      const c = color();
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        const sp = 0.05 + Math.random() * 0.06;
        sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 900 + Math.random() * 400, color: c });
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life += dt;
      if (s.life >= s.max) {
        sparks.splice(i, 1);
        continue;
      }
      s.vy += 0.00005 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      ctx.globalAlpha = (1 - s.life / s.max) * 0.5;
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  };
  requestAnimationFrame(frame);
}
