// Картинка-карточка с результатом картины дня: для истории ВКонтакте или сохранения.
import { formatTime } from '../core/save';
import { drawPicture } from './picture';

export interface CardData {
  cells: Uint8Array;
  w: number;
  h: number;
  day: number;
  time: number;
  peak: number;
  streak: number;
}

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10;
  const t = n % 100;
  if (d === 1 && t !== 11) return one;
  if (d >= 2 && d <= 4 && (t < 12 || t > 14)) return few;
  return many;
}

export const daysWord = (n: number): string => plural(n, 'день', 'дня', 'дней');

/** Рисует карточку 1080×1920 и возвращает её в виде data URL. */
export function makeCard(d: CardData): string {
  const c = document.createElement('canvas');
  c.width = 1080;
  c.height = 1920;
  const ctx = c.getContext('2d')!;
  const bg = ctx.createLinearGradient(0, 0, 0, 1920);
  bg.addColorStop(0, '#1d1147');
  bg.addColorStop(0.55, '#4a2194');
  bg.addColorStop(1, '#a12d8c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1080, 1920);

  // россыпь цветных квадратиков
  const dots = ['#ff4d5e', '#ffd23f', '#4cd471', '#2fd0d8', '#4a8dff', '#ff7ac0'];
  for (let i = 0; i < 46; i++) {
    const x = (i * 397) % 1080;
    const y = (i * 761) % 1920;
    const s = 18 + ((i * 53) % 34);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = dots[i % dots.length];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(i);
    ctx.beginPath();
    ctx.roundRect(-s / 2, -s / 2, s, s, s * 0.22);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = `900 112px ${FONT}`;
  ctx.fillText('Цветной залп', 540, 250);
  ctx.font = `700 52px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,.82)';
  ctx.fillText(`Картина дня № ${d.day}`, 540, 336);

  // рамка с картиной
  ctx.fillStyle = 'rgba(14,8,48,.55)';
  ctx.beginPath();
  ctx.roundRect(150, 420, 780, 780, 56);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.28)';
  ctx.lineWidth = 5;
  ctx.stroke();
  drawPicture(ctx, d.cells, d.w, d.h, 200, 470, 680);

  ctx.fillStyle = '#ffd23f';
  ctx.font = `900 150px ${FONT}`;
  ctx.fillText(formatTime(d.time), 540, 1400);
  ctx.fillStyle = '#fff';
  ctx.font = `700 54px ${FONT}`;
  ctx.fillText(`Собрано залпами за это время`, 540, 1480);
  ctx.fillStyle = 'rgba(255,255,255,.82)';
  ctx.font = `600 48px ${FONT}`;
  const tray = d.peak === 0 ? 'Лоток не понадобился' : `Мест лотка занято: ${d.peak}`;
  const streak = d.streak > 1 ? `   ·   ${d.streak} ${daysWord(d.streak)} подряд` : '';
  ctx.fillText(tray + streak, 540, 1560);

  ctx.fillStyle = '#ffb02e';
  ctx.beginPath();
  ctx.roundRect(190, 1660, 700, 130, 65);
  ctx.fill();
  ctx.fillStyle = '#2a1846';
  ctx.font = `900 58px ${FONT}`;
  ctx.fillText('А ты быстрее?', 540, 1745);
  return c.toDataURL('image/png');
}
