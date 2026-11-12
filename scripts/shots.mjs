// Проходит игру в невидимом Chrome и снимает экраны в папку shots/.
// Запуск: npm run build, npm run preview (в другом окне), затем node scripts/shots.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL ?? 'http://127.0.0.1:4191/';
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
mkdirSync('shots', { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const errors = [];

/** Играет ботом до конца уровня. Возвращает итог: won или lost. */
export async function finish(page, max = 4000) {
  for (let i = 0; i < max; i++) {
    const r = await page.evaluate(() => window.__bot());
    if (r === 'won' || r === 'lost') return r;
    if (r === 'none' || r === 'nostage') throw new Error(`бот остановился: ${r}`);
    await page.waitForTimeout(r === 'move' ? 5 : 15);
  }
  throw new Error('уровень не закончился');
}

/** Делает несколько ходов бота и ждёт, чтобы на снимке была игра в разгаре. */
async function moves(page, n) {
  for (let done = 0, i = 0; done < n && i < 2000; i++) {
    const r = await page.evaluate(() => window.__bot());
    if (r === 'move') done++;
    if (r === 'won' || r === 'lost') return;
    await page.waitForTimeout(8);
  }
}

async function run(name, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, acceptDownloads: true });
  const page = await ctx.newPage();
  // В невидимом Chrome нет системного окна «Поделиться», проверяем запасной путь: скачивание картинки.
  await page.addInitScript(() => { navigator.canShare = () => false; });
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  const shot = (n) => page.screenshot({ path: `shots/${name}-${n}.png` });

  // Первый вход: сразу обучение на уровне 1.
  await page.goto(URL + '?test=1');
  await page.waitForSelector('canvas.stage');
  await page.waitForTimeout(700);
  await shot('01-tutorial-start');
  await moves(page, 2);
  await shot('02-tutorial-mid');
  if ((await finish(page)) !== 'won') throw new Error('уровень 1 не пройден');
  await page.waitForSelector('.modal .next');
  await page.waitForTimeout(900);
  await shot('03-win');

  // Уровень 2 и 3.
  await page.locator('.modal .next').click();
  await page.waitForSelector('canvas.stage');
  await page.waitForTimeout(500);
  await shot('04-level-2');
  await finish(page);
  await page.waitForSelector('.modal .next');
  await page.locator('.modal .next').click();
  await page.waitForSelector('canvas.stage');
  await moves(page, 3);
  await shot('05-level-3-mid');
  await page.locator('.top .btn.ghost').click();
  await page.waitForSelector('.menu');
  await page.waitForTimeout(300);
  await shot('06-menu');

  // Уровни.
  await page.getByText('Уровни', { exact: true }).click();
  await page.waitForSelector('.levels');
  await shot('07-levels');
  await page.locator('.top .btn.ghost').click();

  // Проигрыш: открываем уровень и нарочно забиваем лоток бесполезными пушками.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('zalp.save'));
    s.unlocked = 40;
    s.savedAt = Date.now();
    localStorage.setItem('zalp.save', JSON.stringify(s));
  });
  await page.reload();
  await page.waitForSelector('.menu');
  await page.getByText('Уровни', { exact: true }).click();
  await page.locator('.lvl', { hasText: /^16$/ }).click();
  await page.waitForSelector('canvas.stage');
  await page.waitForTimeout(500);
  await shot('08-level-16-stones');
  // Нарочно забиваем лоток и запускаем пушку, которой не хватит блоков: она вернётся, а места нет.
  const k = await page.evaluate(() => {
    const g = window.__stage().game;
    g.tray = g.tray.map((t, i) => t ?? { id: 900 + i, color: 7, ammo: 2, hidden: false });
    g.cols[0][0].ammo = 99;
    return g.cols.length;
  });
  await page.waitForTimeout(200);
  const box = await page.locator('canvas.stage').boundingBox();
  const front = await page.evaluate(() => {
    const st = window.__stage();
    return { x: st.frontPos(0).x, y: st.frontPos(0).y };
  });
  await page.mouse.click(box.x + front.x, box.y + front.y);
  await page.waitForSelector('.modal .rescue');
  await page.waitForTimeout(500);
  await shot('09-lost');
  await page.locator('.modal .rescue').click();
  await page.waitForTimeout(300);
  if (k < 3) throw new Error('мало колонок');
  await shot('10-rescued');
  await page.goto(URL + '?test=1');
  await page.waitForSelector('.menu');

  // Картина дня до результата.
  await page.getByText('Картина дня').click();
  await page.waitForSelector('canvas.stage');
  await moves(page, 4);
  await shot('11-daily-mid');
  if ((await finish(page, 20000)) !== 'won') throw new Error('картина дня не пройдена');
  await page.waitForSelector('.result-card');
  await page.waitForTimeout(300);
  await shot('12-daily-result');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByText('Поделиться в истории').click()]);
  await download.saveAs(`shots/${name}-13-story-card.png`);
  await page.getByText('В меню').click();
  await page.waitForSelector('.menu');
  await shot('14-menu-after-daily');
  await page.getByText('Рекорды', { exact: true }).click();
  await page.waitForSelector('.records');
  await shot('15-records');
  console.log(name, 'ok');
  await ctx.close();
}

await run('phone', { width: 390, height: 844 });
await run('desktop', { width: 1000, height: 700 });
await run('small', { width: 360, height: 600 });
await browser.close();
if (errors.length) {
  console.error('ОШИБКИ:\n' + errors.join('\n'));
  process.exit(1);
}
