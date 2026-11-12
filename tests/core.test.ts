import { describe, expect, it } from 'vitest';
import { ARTS, mirror, upscale, usedColors } from '../src/core/arts';
import { lap, solve, suggest } from '../src/core/bot';
import { STONE, TRAY_CAP, countColored, crumble, firstBlock, idle, launchCol, launchTray, newGame, rescue, starsFor, stations, tick, type Game } from '../src/core/game';
import { HIDDEN_FROM, LEVELS, STONE_FROM, makeDaily, makeLevel, type LevelDef } from '../src/core/levels';
import { newSave, newer, nextStreak, parseSave } from '../src/core/save';

/** Играет уровень настоящими правилами по ходам бота. */
function playByBot(def: LevelDef): Game {
  const g = newGame(def.w, def.h, def.grid, def.cols);
  for (let guard = 0; guard < 200000 && g.status === 'play'; guard++) {
    if (idle(g)) {
      const m = suggest(g);
      if (!m) break;
      if (m.from === 'col') launchCol(g, m.index);
      else launchTray(g, m.index);
    }
    tick(g);
  }
  return g;
}

describe('картинки', () => {
  it('их не меньше 40, в каждой от 3 до 6 цветов', () => {
    expect(ARTS.length).toBeGreaterThanOrEqual(40);
    for (const a of ARTS) {
      const n = usedColors(a.cells).length;
      expect(n, a.name).toBeGreaterThanOrEqual(3);
      expect(n, a.name).toBeLessThanOrEqual(6);
      expect(Math.max(a.w, a.h), a.name).toBeLessThanOrEqual(12);
    }
  });
  it('увеличение и отражение сохраняют цвета', () => {
    const a = ARTS[0];
    expect(countColored(upscale(a).cells)).toBe(countColored(a.cells) * 4);
    expect(countColored(mirror(a).cells)).toBe(countColored(a.cells));
  });
});

describe('правила', () => {
  // Поле 2×2: верх красный (1), низ синий (2).
  const grid = () => Uint8Array.from([1, 1, 2, 2]);

  it('остановки обходят поле по часовой стрелке от правого нижнего угла', () => {
    expect(stations(2, 2)).toBe(8);
    const g = grid();
    expect(firstBlock(g, 2, 2, 0)).toBe(3); // низ, правый столбец
    expect(firstBlock(g, 2, 2, 2)).toBe(2); // лево, нижний ряд
    expect(firstBlock(g, 2, 2, 4)).toBe(0); // верх, левый столбец
    expect(firstBlock(g, 2, 2, 7)).toBe(3); // право, нижний ряд
  });

  it('пушка сбивает только свой цвет и исчезает без зарядов', () => {
    const g = newGame(2, 2, grid(), [[{ color: 2, ammo: 2, hidden: false }], [{ color: 1, ammo: 2, hidden: false }]]);
    expect(launchCol(g, 0)).toBe(true);
    tick(g);
    while (!idle(g)) tick(g);
    expect(g.left).toBe(2);
    expect(g.tray.every((t) => t === null)).toBe(true);
    launchCol(g, 1);
    while (g.status === 'play') tick(g);
    expect(g.status).toBe('won');
    expect(starsFor(g.peak)).toBe(3);
  });

  it('пушка с остатком зарядов встаёт в лоток и запускается снова', () => {
    const g = newGame(2, 2, Uint8Array.from([2, 2, 2, 2]), [[{ color: 1, ammo: 1, hidden: false }, { color: 2, ammo: 4, hidden: true }]]);
    launchCol(g, 0);
    expect(g.cols[0][0].hidden).toBe(false);
    tick(g);
    while (!idle(g)) tick(g);
    expect(g.tray[0]?.color).toBe(1);
    expect(g.peak).toBe(1);
    expect(launchTray(g, 0)).toBe(true);
  });

  it('переполнение лотка — проигрыш, спасение добавляет место', () => {
    const cols = [Array.from({ length: 6 }, () => ({ color: 1, ammo: 1, hidden: false })), [{ color: 2, ammo: 4, hidden: false }]];
    const g = newGame(2, 2, Uint8Array.from([2, 2, 2, 2]), cols);
    for (let i = 0; i < 6 && g.status === 'play'; i++) {
      launchCol(g, 0);
      tick(g);
      while (g.status === 'play' && !idle(g)) tick(g);
    }
    expect(g.status).toBe('lost');
    expect(g.lostBy).toBe('tray');
    rescue(g);
    expect(g.status).toBe('play');
    expect(g.tray.length).toBe(TRAY_CAP + 1);
    expect(g.tray.every((t) => t !== null)).toBe(true);
  });

  it('камень рассыпается, когда рядом нет цветных блоков', () => {
    const g = Uint8Array.from([1, STONE, 0, 0]);
    expect(lap(g, 2, 2, 1, 5)).toBe(1);
    expect(Array.from(g)).toEqual([0, 0, 0, 0]);
    const g2 = Uint8Array.from([0, STONE, 2, 0]);
    expect(crumble(g2, 2, 2, 0)).toEqual([1]);
  });

  it('решатель находит путь и считает лоток', () => {
    const res = solve({ w: 2, h: 2, grid: Uint8Array.from([1, 1, 2, 2]), cols: [[{ color: 1, ammo: 2 }, { color: 2, ammo: 2 }]], tray: [null, null] });
    expect(res).not.toBeNull();
    expect(res!.peak).toBe(0);
  });
});

describe('уровни', () => {
  it('все 240 уровней проходимы ботом по настоящим правилам', () => {
    let hidden = 0;
    let stones = 0;
    for (let i = 0; i < LEVELS; i++) {
      const def = makeLevel(i);
      const guns = def.cols.flat();
      // Зарядов каждого цвета ровно столько, сколько блоков.
      for (const c of usedColors(def.grid)) {
        const blocks = def.grid.reduce((n, v) => n + Number(v === c), 0);
        const ammo = guns.filter((g) => g.color === c).reduce((n, g) => n + g.ammo, 0);
        expect(ammo, `уровень ${i + 1}, цвет ${c}`).toBe(blocks);
      }
      expect(usedColors(def.grid).length, `уровень ${i + 1}`).toBeLessThanOrEqual(6);
      expect(Math.max(def.w, def.h)).toBeLessThanOrEqual(18);
      const g = playByBot(def);
      expect(g.status, `уровень ${i + 1} (${def.name})`).toBe('won');
      if (guns.some((x) => x.hidden)) hidden++;
      if (def.grid.includes(STONE)) stones++;
    }
    expect(hidden).toBeGreaterThan(100);
    expect(stones).toBeGreaterThan(50);
  }, 120000);

  it('обучение простое, новые механики вводятся по одной', () => {
    expect(makeLevel(0).botPeak).toBe(0);
    for (let i = 0; i < HIDDEN_FROM; i++) expect(makeLevel(i).cols.flat().some((g) => g.hidden)).toBe(false);
    expect(makeLevel(HIDDEN_FROM).cols.flat().some((g) => g.hidden)).toBe(true);
    for (let i = 0; i < STONE_FROM; i++) expect(makeLevel(i).grid.includes(STONE)).toBe(false);
    expect(makeLevel(STONE_FROM).grid.includes(STONE)).toBe(true);
  });

  it('уровень по номеру всегда один и тот же', () => {
    const a = makeLevel(37);
    expect(a.cols.flat().length).toBeGreaterThan(3);
    expect(makeDaily(20500).cols).toEqual(makeDaily(20500).cols);
  });

  it('картины дня проходимы на месяц вперёд', () => {
    for (let d = 20400; d < 20430; d++) {
      const def = makeDaily(d);
      expect(Math.max(def.w, def.h)).toBeLessThanOrEqual(18);
      expect(playByBot(def).status, `день ${d}`).toBe('won');
    }
  }, 120000);
});

describe('сохранение', () => {
  it('берётся более свежее, битое отбрасывается', () => {
    const a = { ...newSave(), savedAt: 5 };
    const b = { ...newSave(), savedAt: 9 };
    expect(newer(a, b)).toBe(b);
    expect(parseSave('{oops')).toBeNull();
    expect(parseSave(JSON.stringify(a))?.savedAt).toBe(5);
  });
  it('серия дней растёт подряд и сбрасывается после пропуска', () => {
    expect(nextStreak(3, 10, 11)).toBe(4);
    expect(nextStreak(3, 9, 11)).toBe(1);
    expect(nextStreak(3, 11, 11)).toBe(3);
  });
});
