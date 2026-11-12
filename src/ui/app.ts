// Экраны игры: меню, уровень, результат, список уровней, картина дня, рекорды.
import { starsFor, type LostBy } from '../core/game';
import { LEVELS, makeDaily, makeLevel, type LevelDef } from '../core/levels';
import { today } from '../core/rng';
import { HISTORY_MAX, formatTime, nextStreak, totalStars, type Save } from '../core/save';
import { saveLocal, type Platform } from '../platform/platform';
import { daysWord, makeCard } from './card';
import { diag, toggleDiag } from './diag';
import { btn, h, icon, type IconName } from './dom';
import { pictureCanvas } from './picture';
import { play, setSound } from './sound';
import { Stage } from './stage';

type Mode = { kind: 'level'; index: number } | { kind: 'daily'; day: number };

/** С этого дня идёт нумерация картин дня. */
const DAY_ZERO = 20760;
const AD_GAP_MS = 150_000;
const AD_FROM_LEVEL = 3;

const TIPS: Record<string, string> = {
  first: 'Нажми на пушку: она объедет картину и собьёт блоки своего цвета',
  second: 'Выбирай пушку, цвет которой виден с края картины',
  third: 'На дорожке помещается до 5 пушек сразу. Не обязательно ждать!',
  hidden: 'Пушка-загадка покажет цвет, когда станет первой в колонке',
  stone: 'Камень не сбить. Он рассыплется сам, когда рядом не останется цветных блоков',
  tray: 'Остались заряды: пушка ждёт в лотке. Нажми на неё, когда её цвет откроется',
  busy: 'На дорожке уже 5 пушек. Подожди, пока место освободится',
  guide: 'Сейчас нужна пушка, на которую показывает рука',
  wait: 'Подсказывать пока нечего: дождись, пока пушки доедут',
};

export class App {
  private stage: Stage | null = null;
  private timer = 0;
  private lastAd = Date.now();
  private titleTaps = 0;
  private readonly test = new URLSearchParams(location.search).has('test');

  constructor(private readonly root: HTMLElement, private readonly platform: Platform, private readonly save: Save) {
    setSound(save.sound);
    if (this.test) {
      const w = window as unknown as Record<string, unknown>;
      w.__bot = () => this.stage?.botStep() ?? 'nostage';
    }
    if (save.unlocked === 0 && !save.stars['0']) this.play({ kind: 'level', index: 0 });
    else this.menu();
  }

  private persist(): void {
    this.save.savedAt = Date.now();
    const json = JSON.stringify(this.save);
    saveLocal(json);
    void this.platform.save(json);
  }

  private show(screen: HTMLElement): void {
    this.stage?.destroy();
    this.stage = null;
    clearInterval(this.timer);
    this.root.replaceChildren(screen);
  }

  private soundButton(): HTMLButtonElement {
    const b = btn('round', '', this.save.sound ? 'soundOn' : 'soundOff', () => {
      this.save.sound = !this.save.sound;
      setSound(this.save.sound);
      this.persist();
      b.replaceChildren(icon(this.save.sound ? 'soundOn' : 'soundOff'));
      play('tap');
    });
    b.title = 'Звук';
    b.setAttribute('aria-label', 'Звук');
    return b;
  }

  private top(title: string, right: HTMLElement | null, onBack: () => void): HTMLElement {
    const back = btn('ghost', '', 'back', () => {
      play('tap');
      onBack();
    });
    back.setAttribute('aria-label', 'Назад');
    return h('div', { class: 'top' }, back, h('h2', { text: title }), right ?? h('span', { class: 'top-gap' }));
  }

  private dailyDone(): boolean {
    return this.save.daily?.day === today();
  }

  // ---------- меню ----------

  menu(): void {
    const s = this.save;
    const cur = Math.min(s.unlocked, LEVELS - 1);
    const def = makeLevel(cur);
    const fresh = s.unlocked === 0 && !s.stars['0'];
    const title = h('h1', {
      text: 'Цветной залп',
      onclick: () => {
        if (++this.titleTaps % 5 === 0) this.diagnostics();
      },
    });
    const daily = h('button', {
      class: 'btn secondary wide daily',
      onclick: () => {
        play('tap');
        if (this.dailyDone()) this.dailyResult();
        else this.play({ kind: 'daily', day: today() });
      },
    },
      icon('image', 'big'),
      h('span', { class: 'two' },
        h('b', { text: 'Картина дня' }),
        h('small', { text: this.dailyDone() ? `Собрана за ${formatTime(s.daily!.time)}` : 'Новая картина ждёт. Одна на всех!' }),
      ),
      s.streak > 0 && s.lastDailyDay >= today() - 1 ? h('span', { class: 'chip' }, icon('flame'), h('span', { text: String(s.streak) })) : null,
    );
    const screen = h('div', { class: 'screen menu' },
      h('div', { class: 'top' }, h('span', { class: 'chip stars-chip' }, icon('star'), h('span', { text: String(totalStars(s)) })), h('span', { class: 'grow' }), this.soundButton()),
      h('div', { class: 'hero' },
        h('div', { class: 'frame' }, pictureCanvas(def.picture, def.w, def.h, 132)),
        title,
        h('p', { text: 'Расстреляй картину цветными залпами' }),
      ),
      btn('primary wide', fresh ? 'Играть' : `Уровень ${cur + 1}`, 'play', () => {
        play('tap');
        this.play({ kind: 'level', index: cur });
      }),
      daily,
      h('div', { class: 'row' },
        btn('secondary grow', 'Уровни', 'grid', () => {
          play('tap');
          this.levels();
        }),
        btn('secondary grow', 'Рекорды', 'trophy', () => {
          play('tap');
          this.records();
        }),
      ),
    );
    this.show(screen);
  }

  private diagnostics(): void {
    const p = this.platform;
    toggleDiag([
      { label: 'ролик', run: () => void p.showRewarded().then((ok) => diag('проверка ролика', String(ok))) },
      { label: 'между уровнями', run: () => void p.showInterstitial() },
      { label: 'история', run: () => void p.shareStory(this.card(makeDaily(today()), 95, 1)) },
      { label: 'рейтинг', run: () => void p.leaderboard(totalStars(this.save)) },
      {
        label: 'открыть уровни',
        run: () => {
          this.save.unlocked = LEVELS - 1;
          this.persist();
          this.menu();
        },
      },
    ]);
  }

  // ---------- список уровней ----------

  private levels(): void {
    const s = this.save;
    const grid = h('div', { class: 'levels' });
    for (let i = 0; i < LEVELS; i++) {
      const open = i <= s.unlocked;
      const stars = s.stars[i] ?? 0;
      const b = h('button', { class: `lvl${open ? '' : ' locked'}${i === s.unlocked ? ' current' : ''}` });
      if (open) {
        b.append(h('b', { text: String(i + 1) }));
        const row = h('span', { class: 'mini-stars' });
        for (let k = 0; k < 3; k++) row.append(icon('star', k < stars ? 'on' : 'off'));
        b.append(row);
        b.addEventListener('click', () => {
          play('tap');
          this.play({ kind: 'level', index: i });
        });
      } else {
        b.append(icon('lock'));
        b.disabled = true;
        b.setAttribute('aria-label', `Уровень ${i + 1} закрыт`);
      }
      grid.append(b);
    }
    const chip = h('span', { class: 'chip stars-chip' }, icon('star'), h('span', { text: String(totalStars(s)) }));
    const screen = h('div', { class: 'screen' }, this.top('Уровни', chip, () => this.menu()), grid);
    this.show(screen);
    grid.querySelector('.current')?.scrollIntoView({ block: 'center' });
  }

  // ---------- рекорды ----------

  private records(): void {
    const s = this.save;
    const done = Object.keys(s.stars).length;
    const tile = (ic: IconName, value: string, label: string) =>
      h('div', { class: 'tile' }, icon(ic), h('b', { text: value }), h('small', { text: label }));
    const list = h('div', { class: 'history' });
    if (s.history.length === 0) {
      list.append(h('p', { text: 'Собери картину дня, и здесь появятся твои результаты.' }));
    } else {
      list.append(h('div', { class: 'hrow head' }, h('span', { text: 'Картина' }), h('span', { text: 'Время' }), h('span', { text: 'Лоток' })));
      for (const r of s.history.slice(-7).reverse()) {
        list.append(h('div', { class: 'hrow' },
          h('span', { text: `№ ${this.dayNo(r.day)}` }),
          h('span', { text: formatTime(r.time) }),
          h('span', { text: String(r.peak) }),
        ));
      }
    }
    const screen = h('div', { class: 'screen records' },
      this.top('Рекорды', null, () => this.menu()),
      h('div', { class: 'tiles' },
        tile('grid', `${done} из ${LEVELS}`, 'уровней пройдено'),
        tile('star', String(totalStars(s)), 'звёзд собрано'),
        tile('clock', s.bestDaily ? formatTime(s.bestDaily) : '—', 'лучшее время картины дня'),
        tile('flame', `${s.bestStreak}`, `${daysWord(s.bestStreak)} подряд: лучшая серия`),
      ),
      h('h3', { text: 'Картины дня' }),
      list,
      this.platform.name === 'vk'
        ? btn('secondary wide', 'Рейтинг друзей', 'trophy', () => void this.platform.leaderboard(totalStars(s)))
        : null,
    );
    this.show(screen);
  }

  private dayNo(day: number): number {
    return day > DAY_ZERO ? day - DAY_ZERO : day;
  }

  // ---------- игра ----------

  private play(mode: Mode): void {
    const s = this.save;
    const def = mode.kind === 'level' ? makeLevel(mode.index) : makeDaily(mode.day);
    const guide = mode.kind === 'level' && mode.index === 0 && !s.stars['0'];
    let rescued = false;

    const canvas = h('canvas', { class: 'stage' });
    const bar = h('i');
    const hud = h('span', { class: 'hud-text', text: '' });
    const tip = h('div', { class: 'tip' });
    let tipTimer = 0;
    const baseTip = def.intro ? TIPS[def.intro] : `Картина: «${def.name}»`;
    const setTip = (text: string, important: boolean) => {
      tip.textContent = text;
      tip.classList.toggle('hot', important);
    };
    const flashTip = (key: string) => {
      setTip(TIPS[key], true);
      clearTimeout(tipTimer);
      tipTimer = window.setTimeout(() => setTip(baseTip, def.intro !== null), 3200);
    };
    setTip(baseTip, def.intro !== null);

    const badge = h('span', { class: 'badge' });
    const hintBtn = btn('round', '', 'bulb', () => void useHint());
    hintBtn.setAttribute('aria-label', 'Подсказка');
    hintBtn.title = 'Подсказка';
    hintBtn.append(badge);
    const paintHints = () => {
      badge.textContent = s.hints > 0 ? String(s.hints) : '+2';
      badge.classList.toggle('plus', s.hints === 0);
    };
    paintHints();
    const useHint = async () => {
      if (!this.stage) return;
      if (s.hints === 0) {
        if (await this.platform.showRewarded()) {
          s.hints += 2;
          this.persist();
          play('star');
        }
      } else if (this.stage.hint()) {
        s.hints--;
        this.persist();
        play('tap');
      } else {
        flashTip('wait');
      }
      paintHints();
    };

    const setHud = () => {
      if (!this.stage) return;
      const g = this.stage.game;
      bar.style.width = `${Math.round((1 - g.left / g.total) * 100)}%`;
      hud.textContent = mode.kind === 'daily' ? formatTime(this.stage.time / 1000) : `Осталось: ${g.left}`;
    };

    const title = mode.kind === 'level' ? `Уровень ${mode.index + 1}` : 'Картина дня';
    const screen = h('div', { class: 'screen play' },
      this.top(title, guide ? null : hintBtn, () => this.menu()),
      h('div', { class: 'hud' }, h('div', { class: 'bar' }, bar), hud),
      tip,
      h('div', { class: 'stagewrap' }, canvas),
    );
    this.show(screen);

    this.stage = new Stage(canvas, def, {
      fast: this.test,
      guide,
      hooks: {
        onProgress: setHud,
        onPark: () => {
          if (!s.tips.tray) {
            s.tips.tray = true;
            flashTip('tray');
          }
        },
        onRefuse: (reason) => flashTip(reason),
        onEnd: (status, by) => {
          if (status === 'won') this.won(mode, def);
          else this.lost(mode, by, rescued, () => {
            rescued = true;
          });
        },
      },
    });
    setHud();
    this.timer = window.setInterval(setHud, 250);
  }

  private modal(...kids: (Node | null)[]): HTMLElement {
    const m = h('div', { class: 'modal' }, h('div', { class: 'sheet' }, ...kids));
    this.root.append(m);
    return m;
  }

  private won(mode: Mode, def: LevelDef): void {
    const s = this.save;
    const stage = this.stage!;
    const g = stage.game;
    s.shots += g.shots;
    if (mode.kind === 'daily') {
      const rec = { day: mode.day, time: Math.max(1, Math.round(stage.time / 1000)), peak: g.peak };
      s.streak = nextStreak(s.streak, s.lastDailyDay, mode.day);
      s.lastDailyDay = mode.day;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      s.bestDaily = s.bestDaily ? Math.min(s.bestDaily, rec.time) : rec.time;
      s.daily = rec;
      s.history = [...s.history.filter((r) => r.day !== rec.day), rec].slice(-HISTORY_MAX);
      this.persist();
      this.dailyResult();
      return;
    }
    const i = mode.index;
    const stars = starsFor(g.peak);
    const first = !s.stars[i];
    s.stars[i] = Math.max(s.stars[i] ?? 0, stars);
    s.unlocked = Math.max(s.unlocked, Math.min(i + 1, LEVELS - 1));
    const gift = first && (i + 1) % 5 === 0;
    if (gift) s.hints++;
    this.persist();

    const row = h('div', { class: 'stars3' });
    for (let k = 0; k < 3; k++) {
      const st = icon('star', k < stars ? 'on' : 'off');
      st.style.animationDelay = `${0.15 + k * 0.18}s`;
      row.append(st);
    }
    setTimeout(() => play('star'), 250);
    const last = i + 1 >= LEVELS;
    const next = async () => {
      play('tap');
      if (i >= AD_FROM_LEVEL && Date.now() - this.lastAd > AD_GAP_MS) {
        this.lastAd = Date.now();
        await this.platform.showInterstitial();
      }
      if (i >= 4 && !s.favAsked) {
        s.favAsked = true;
        this.persist();
        void this.platform.addToFavorites();
      }
      if (last) this.menu();
      else this.play({ kind: 'level', index: i + 1 });
    };
    this.modal(
      row,
      h('h2', { text: 'Картина собрана!' }),
      h('div', { class: 'frame small' }, pictureCanvas(def.picture, def.w, def.h, 104)),
      h('p', { text: g.peak === 0 ? `«${def.name}». Лоток не понадобился!` : `«${def.name}». Мест лотка занято: ${g.peak}` }),
      stars < 3 ? h('p', { class: 'note', text: 'Три звезды — если занять не больше двух мест лотка' }) : null,
      gift ? h('p', { class: 'note gold', text: 'Подарок за пять уровней: +1 подсказка' }) : null,
      btn('primary wide next', last ? 'В меню' : 'Дальше', last ? 'home' : 'next', () => void next()),
      h('div', { class: 'row' },
        btn('secondary grow', 'Ещё раз', 'retry', () => {
          play('tap');
          this.play(mode);
        }),
        last ? null : btn('secondary grow', 'В меню', 'home', () => {
          play('tap');
          this.menu();
        }),
      ),
    );
  }

  private lost(mode: Mode, by: LostBy | null, rescued: boolean, markRescued: () => void): void {
    const text = by === 'stuck'
      ? 'Ни одна пушка не достаёт свой цвет, а лоток полон.'
      : 'Пушке с остатком зарядов не хватило места. Запускай сначала те, чей цвет виден с края.';
    const m = this.modal(
      h('h2', { text: by === 'stuck' ? 'Тупик' : 'Лоток переполнен' }),
      h('p', { text }),
      rescued ? null : btn('primary wide rescue', 'Ещё одно место в лотке', 'film', () => {
        void this.platform.showRewarded().then((ok) => {
          if (!ok || !this.stage) return;
          markRescued();
          m.remove();
          this.stage.rescue();
          play('star');
        });
      }),
      btn(rescued ? 'primary wide' : 'secondary wide', 'Заново', 'retry', () => {
        play('tap');
        this.play(mode);
      }),
      btn('ghost wide', 'В меню', 'home', () => {
        play('tap');
        this.menu();
      }),
    );
  }

  // ---------- картина дня ----------

  private card(def: LevelDef, time: number, peak: number): string {
    return makeCard({ cells: def.picture, w: def.w, h: def.h, day: this.dayNo(today()), time, peak, streak: this.save.streak });
  }

  private dailyResult(): void {
    const s = this.save;
    const rec = s.daily!;
    const def = makeDaily(rec.day);
    const time = formatTime(rec.time);
    const screen = h('div', { class: 'screen result' },
      this.top('Картина дня', null, () => this.menu()),
      h('div', { class: 'result-card' },
        h('div', { class: 'frame' }, pictureCanvas(def.picture, def.w, def.h, 150)),
        h('h3', { text: `№ ${this.dayNo(rec.day)} · «${def.name}»` }),
        h('div', { class: 'big-time', text: time }),
        h('p', { text: rec.peak === 0 ? 'Лоток не понадобился!' : `Мест лотка занято: ${rec.peak}` }),
        s.streak > 1 ? h('p', { class: 'streak' }, icon('flame'), h('span', { text: `${s.streak} ${daysWord(s.streak)} подряд` })) : null,
      ),
      btn('primary wide', 'Поделиться в истории', 'share', () => void this.platform.shareStory(this.card(def, rec.time, rec.peak))),
      h('div', { class: 'row' },
        btn('secondary grow', 'На стену', 'post', () =>
          void this.platform.shareWall(`Картина дня в «Цветном залпе» собрана за ${time}. А ты быстрее?`)),
        btn('secondary grow', 'Позвать друзей', 'users', () => void this.platform.invite()),
      ),
      h('p', { class: 'note center', text: 'Новая картина появится в полночь по московскому времени' }),
      btn('ghost wide', 'В меню', 'home', () => {
        play('tap');
        this.menu();
      }),
    );
    this.show(screen);
  }
}
