// Готовит картинки для витрины ВК: иконку, сниппет и скриншоты. Результат в docs/store/vk/.
// Запуск: npm run build, npm run preview (в другом окне), затем node scripts/store.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL ?? 'http://127.0.0.1:4191/';
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'docs/store/vk';
mkdirSync(OUT, { recursive: true });

const COLORS = { r: '#ff4d5e', k: '#ff7ac0', w: '#f4f1ff', y: '#ffd23f', g: '#4cd471', b: '#4a8dff', o: '#ff9a3d' };
const HEART = ['.rr..rr.', 'rkkrrrrr', 'rkwrrrrr', 'rrrrrrrr', '.rrrrrr.', '..rrrr..', '...rr...'];

/** Пиксельная картинка из блоков в виде SVG. */
function art(rows, u) {
  let out = '';
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const c = COLORS[ch];
      out += `<rect x="${x * u + u * 0.05}" y="${y * u + u * 0.05}" width="${u * 0.9}" height="${u * 0.9}" rx="${u * 0.2}" fill="${c}"/>`;
      out += `<rect x="${x * u + u * 0.17}" y="${y * u + u * 0.13}" width="${u * 0.66}" height="${u * 0.2}" rx="${u * 0.1}" fill="#fff" opacity=".4"/>`;
    });
  });
  return `<svg width="${rows[0].length * u}" height="${rows.length * u}" viewBox="0 0 ${rows[0].length * u} ${rows.length * u}">${out}</svg>`;
}

/** Пушка: круг со стволом вверх и числом зарядов. */
function gun(r, color, dark, label, ink = '#fff') {
  return `<svg width="${r * 2}" height="${r * 2.5}" viewBox="${-r} ${-r * 1.5} ${r * 2} ${r * 2.5}">
    <rect x="${-r * 0.3}" y="${-r * 1.35}" width="${r * 0.6}" height="${r}" rx="${r * 0.12}" fill="${dark}"/>
    <circle r="${r}" fill="${dark}"/><circle r="${r * 0.84}" fill="${color}"/>
    <ellipse cx="${-r * 0.25}" cy="${-r * 0.42}" rx="${r * 0.42}" ry="${r * 0.2}" fill="#fff" opacity=".35" transform="rotate(-28)"/>
    <text y="${r * 0.36}" text-anchor="middle" font-family="Segoe UI, system-ui, sans-serif" font-weight="900" font-size="${r}" fill="${ink}">${label}</text></svg>`;
}

const BG = 'linear-gradient(170deg,#1d1147 0%,#43208a 52%,#9a2d8e 100%)';
const page = (body, w, h) => `<html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif;color:#fff;background:${BG}">${body}</body></html>`;

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

async function html(name, w, h, body) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(page(body, w, h));
  await p.screenshot({ path: `${OUT}/${name}.png` });
  await p.close();
}

const icon = (s) => `<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${s * 0.03}px">
  ${art(HEART, s * 0.085)}
  <div style="display:flex;gap:${s * 0.05}px;align-items:flex-end">
    ${gun(s * 0.085, '#4a8dff', '#3260b0', '', '#fff')}${gun(s * 0.115, '#ff4d5e', '#ad3440', '7')}${gun(s * 0.085, '#ffd23f', '#ad8f2b', '', '#2a1846')}
  </div></div>`;
await html('icon-576', 576, 576, icon(576));
await html('icon-278', 278, 278, icon(278));
await html('icon-150', 150, 150, icon(150));
await html('favicon-32', 32, 32, `<div style="height:100%;display:grid;place-items:center">${art(HEART, 3.6)}</div>`);
await html('snippet-1120x630', 1120, 630, `<div style="height:100%;display:flex;align-items:center;justify-content:center;gap:70px">
  <div style="padding:26px;border-radius:44px;background:rgba(14,8,48,.5);border:4px solid rgba(255,255,255,.25);transform:rotate(-4deg)">${art(HEART, 40)}</div>
  <div style="display:flex;flex-direction:column;gap:22px">
    <div style="font-size:98px;font-weight:900;line-height:1;text-shadow:0 6px 0 rgba(20,8,60,.55)">Цветной<br>залп</div>
    <div style="font-size:34px;font-weight:600;opacity:.9;max-width:520px">Расстреляй картину цветными залпами</div>
    <div style="display:flex;gap:18px;align-items:flex-end">${gun(40, '#ff4d5e', '#ad3440', '12')}${gun(40, '#ffd23f', '#ad8f2b', '8', '#2a1846')}${gun(40, '#4cd471', '#33904d', '5')}${gun(40, '#4a8dff', '#3260b0', '9')}</div>
  </div></div>`);

// Скриншоты из настоящей игры: подкладываем сохранение и открываем нужный экран.
const day = Math.floor((Date.now() + 3 * 3600e3) / 864e5);
const stars = {};
for (let i = 0; i < 23; i++) stars[i] = i % 4 === 2 ? 2 : 3;
const save = {
  v: 1, savedAt: Date.now(), hints: 4, sound: false, unlocked: 23, stars, shots: 1830, daily: null,
  streak: 5, lastDailyDay: day - 1, bestStreak: 7, bestDaily: 96,
  history: [{ day: day - 2, time: 121, peak: 2 }, { day: day - 1, time: 96, peak: 1 }], tips: { tray: true }, favAsked: true,
};

async function game(name, w, h, steps, scale = 1) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  const p = await ctx.newPage();
  await p.addInitScript((s) => localStorage.setItem('zalp.save', s), JSON.stringify(save));
  await p.goto(URL + '?test=slow');
  await p.waitForSelector('.menu');
  await steps(p);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  await ctx.close();
}

/** Запускает несколько пушек настоящими нажатиями и ждёт, пока они разъедутся по дорожке. */
async function volley(p, rounds) {
  await p.waitForSelector('canvas.stage');
  await p.waitForTimeout(900);
  const box = await p.locator('canvas.stage').boundingBox();
  for (let i = 0; i < rounds; i++) {
    const r = await p.evaluate(() => window.__bot());
    if (r !== 'move' && r !== 'wait') break;
    // ждём, пока пушка проедет весь круг
    for (let k = 0; k < 200 && (await p.evaluate(() => window.__stage().busy)) > 0; k++) await p.waitForTimeout(100);
  }
  // финальный залп: передние пушки всех колонок сразу
  const fronts = await p.evaluate(() => {
    const st = window.__stage();
    return st.game.cols.map((c, i) => (c.length ? { x: st.frontPos(i).x, y: st.frontPos(i).y } : null)).filter(Boolean);
  });
  for (const f of fronts) {
    await p.mouse.click(box.x + f.x, box.y + f.y);
    await p.waitForTimeout(420);
  }
  await p.waitForTimeout(1500);
}

for (const [suffix, w, h, scale] of [['1200x600', 1200, 600, 1], ['phone', 390, 844, 2], ['1080x1920', 360, 640, 3]]) {
  await game(`screen-1-level-${suffix}`, w, h, async (p) => {
    await p.getByText('Уровни', { exact: true }).click();
    await p.locator('.lvl', { hasText: /^13$/ }).click();
    await volley(p, 2);
  }, scale);
  await game(`screen-2-daily-${suffix}`, w, h, async (p) => {
    await p.getByText('Картина дня').click();
    await volley(p, 3);
  }, scale);
  await game(`screen-3-menu-${suffix}`, w, h, async (p) => p.waitForTimeout(400), scale);
  await game(`screen-4-levels-${suffix}`, w, h, async (p) => {
    await p.getByText('Уровни', { exact: true }).click();
    await p.waitForTimeout(300);
  }, scale);
}
await browser.close();
console.log('готово:', OUT);
