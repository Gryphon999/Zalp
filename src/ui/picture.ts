// Рисует пиксельную картинку на любом холсте: в меню, на экране победы и на карточке для истории.
import { toneOf } from './palette';

export function drawPicture(
  ctx: CanvasRenderingContext2D, cells: Uint8Array, w: number, h: number,
  x: number, y: number, size: number,
): void {
  const u = size / Math.max(w, h);
  const ox = x + (size - w * u) / 2;
  const oy = y + (size - h * u) / 2;
  const gap = Math.max(0.5, u * 0.05);
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const v = cells[cy * w + cx];
      if (!v) continue;
      const t = toneOf(v);
      const px = ox + cx * u + gap;
      const py = oy + cy * u + gap;
      const s = u - gap * 2;
      ctx.fillStyle = t.base;
      ctx.beginPath();
      ctx.roundRect(px, py, s, s, s * 0.2);
      ctx.fill();
      ctx.fillStyle = t.light;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.roundRect(px + s * 0.12, py + s * 0.1, s * 0.76, s * 0.22, s * 0.11);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

/** Небольшой холст с картинкой для вставки в разметку. */
export function pictureCanvas(cells: Uint8Array, w: number, h: number, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = Math.round(size * dpr);
  c.style.width = c.style.height = `${size}px`;
  c.className = 'pic';
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  drawPicture(ctx, cells, w, h, 0, 0, size);
  return c;
}
