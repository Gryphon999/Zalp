// Свои пиксельные картинки. Каждая буква — цвет из общей палитры, точка — пусто.
// r красный, o оранжевый, y жёлтый, g зелёный, t бирюзовый, b синий,
// p фиолетовый, k розовый, w белый, n коричневый, d графит.

export const LETTERS = '.roygtbpkwnd';
export const COLOR_COUNT = LETTERS.length - 1;

export interface Pic {
  name: string;
  w: number;
  h: number;
  cells: Uint8Array;
}

const RAW: [string, string][] = [
  ['Сердце', `
.rr..rr.
rkkrrrrr
rkwrrrrr
rrrrrrrr
.rrrrrr.
..rrrr..
...rr...`],
  ['Гриб', `
..rrrr..
.rwrrwr.
rrrrrrrr
rwrrrwrr
rrrrrrrr
..yyyy..
..ywwy..
..yyyy..`],
  ['Улыбка', `
.yyyyyy.
yyyyyyyy
yydyydyy
yydyydyy
yyyyyyyy
ydyyyydy
yyrrrryy
.yyyyyy.`],
  ['Яблоко', `
....n...
...ng...
.rrnrr..
rrwrrrr.
rwrrrrr.
rrrrrrr.
rrrrrrr.
.rrrrr..`],
  ['Утка', `
..yyy....
.yydyo...
.yyyyoo..
..yy.....
yyyyyyy..
yyyyyyyy.
.yyyyyy..
bbbbbbbbb`],
  ['Кот', `
o.......o
oo.....oo
ooooooooo
odoooodoo
ooookoooo
owwkkkwwo
oowwwwwoo
.ooooooo.`],
  ['Ракета', `
...r...
..rrr..
..www..
.wwbww.
.wbbbw.
.wwbww.
.wwwww.
rwwwwwr
rr.o.rr
..oyo..`],
  ['Дом', `
....r....
...rrr...
..rrrrr..
.rrrrrrr.
.yyyyyyy.
.ybbynny.
.ybbynny.
.yyyynny.
ggggggggg`],
  ['Цветок', `
..kk.kk..
.kkkkkkk.
.kkyyykk.
..kyyyk..
.kkyyykk.
.kkkkkkk.
..kkgkk..
.gg.g....
..ggg....`],
  ['Рыба', `
..oooo...o
.oooooo.oo
oodooooooo
ooooowoooo
.oooooo.oo
..oooo...o
bbbbbbbbbb`],
  ['Корона', `
y...y...y
yy.yyy.yy
yyyyyyyyy
yryybyyry
yyyyyyyyy
ooooooooo
ooooooooo`],
  ['Яблоня', `
...ggg...
..ggggg..
.ggrgggg.
.ggggrgg.
ggggggggg
gggrggggg
.ggggggg.
...nnn...
...nnn...
..nnnnn..`],
  ['Солнце', `
bbbbobbbb
bobbobbob
bbyyyyybb
bbyyyyybb
ooyyyyyoo
bbyyyyybb
bbyyyyybb
bobbobbob
bbbbobbbb`],
  ['Радуга', `
..rrrrrr..
.rroooorr.
rrooyyoorr
rooyggyoor
royg..gyor
ww......ww`],
  ['Мороженое', `
...r...
..kkk..
.kkkkk.
.kwkkk.
.kkkkk.
wwwwwww
.nynyn.
.nnynn.
..nyn..
...n...`],
  ['Арбуз', `
gggggggggg
wwwwwwwwww
.rrdrrdrr.
.rrrrrrrr.
..rrdrrr..
...rrrr...`],
  ['Снеговик', `
..ddd..
..ddd..
.ddddd.
..www..
..wow..
.rrrrr.
.wwwww.
wwwdwww
wwwdwww
.wwwww.`],
  ['Звезда', `
bbbbybbbb
bbbyyybbb
bbbyyybbb
yyyyyyyyy
byyyoyyyb
bbyyoyybb
bbyyyyybb
byyybyyyb
byybbbyyb`],
  ['Машина', `
..rrrrr...
.rrbbrbr..
rrrbbrbrr.
rrrrrrrrry
rrrrrrrrrr
.dd....dd.
.dd....dd.`],
  ['Бабочка', `
pp.....pp
ppp.d.ppp
pkppdppkp
pkkpdpkkp
.pppdppp.
.yypdpyy.
yyy.d.yyy
.y.....y.`],
  ['Вишня', `
....gg..
...ngg..
..n.n...
.n...n..
rrr.rrr.
rwr.rwr.
rrr.rrr.
.r...r..`],
  ['Чашка', `
..t..t...
.t..t....
bbbbbbb..
bnnnnnbbb
bbbbbbb.b
bbbbbbbbb
.bbbbb...
wwwwwwwww`],
  ['Привидение', `
..wwww..
.wwwwww.
wwdwwdww
wwdwwdww
wwwwwwww
wkwwwwkw
wwwppwww
wwwwwwww
w.ww.w.w`],
  ['Зонт', `
....n....
..rryrr..
.rryyyrr.
rrryyyrrr
rryyyyyrr
....n....
....n....
..b.n....
..bnn....`],
  ['Тыква', `
....g....
...gg....
.ooooooo.
ooodoodoo
ooooooooo
ooydydyoo
ooooooooo
.ooooooo.`],
  ['Пингвин', `
..dddd..
.dddddd.
.dwddwd.
.ddoodd.
ddwwwwdd
ddwwwwdd
ddwwwwdd
.dwwwwd.
.oo..oo.`],
  ['Клубника', `
..g.gg..
.gggggg.
.rrggrr.
rryrrryr
rrrryrrr
ryrrrryr
.rrryrr.
..rrrr..
...rr...`],
  ['Планета', `
...pppp...
..pppppp..
.pppkpppp.
oooooooooo
.ppppppkp.
.pppppppp.
..pppppp..
...pppp...`],
  ['Робот', `
...yy...
.tttttt.
.twttwt.
.tttttt.
.trrrrt.
..dddd..
tttttttt
t.tttt.t
..d..d..`],
  ['Шарик', `
..bbb..
.bwbbb.
bwbbbbb
bbbbbbb
bbbbbbb
.bbbbb.
..bbb..
...r...
...d...
..d....`],
  ['Торт', `
....y....
....r....
.wwwwwww.
.kkwkkwk.
.kkkkkkk.
wwwwwwwww
nnnnnnnnn
nnnnnnnnn`],
  ['Божья коровка', `
..d...d..
...ddd...
..dwdwd..
.rrrdrrr.
rdrrdrrdr
rrrrdrrrr
rdrrdrrdr
.rrrdrrr.`],
  ['Ключ', `
.yyy......
yybyy.....
ybbbyyyyyy
yybyy.yoyo
.yyy..o.o.`],
  ['Подарок', `
..yy.yy..
..yyyyy..
rrrryrrrr
rrrryrrrr
yyyyyyyyy
ggggygggg
ggggygggg
ggggygggg
ggggygggg`],
  ['Якорь', `
...ttt...
...t.t...
...ttt...
.bbbbbbb.
....b....
w...b...w
ww..b..ww
.wwwbwww.
..wwwww..`],
  ['Гроза', `
..wwww...
.wwwwwww.
wwwwwwwww
wwwwwwwww
.ddyyddd.
...yy....
..yyyy...
....yy...
b..yy..b.`],
  ['Кораблик', `
....n.....
....nww...
....nwww..
....nwwww.
....n.....
rrrrrrrrrr
.rrrrrrrr.
bbbbbbbbbb`],
  ['Конфета', `
y..kkkk..y
yy.kwkk.yy
yyykkwkyyy
yyykwkkyyy
yy.kkwk.yy
y..kkkk..y`],
  ['Сова', `
n......n
nn.nn.nn
nwwnnwwn
nwdnnwdn
nnnoonnn
nyynnyyn
nnyyyynn
.nnnnnn.`],
  ['Кактус', `
...kk...
...gg...
g..gg...
g..gg..g
gggggg.g
...ggggg
...gg...
.nnnnnn.
..nnnn..`],
  ['Ночь', `
bbwbbbbbb
bbbbyyybb
bbbyyybbw
bbyyybbbb
bbyyybbbb
wbyyybbbb
bbbyyybbb
bbbbyyypp
ppppppppp`],
  ['Леденец', `
..rrr..
.rwwrr.
rwrrwrr
rwrwwrr
rrwrrwr
.rrwwr.
..rrr..
...n...
...n...
...n...`],
  ['Алмаз', `
..ttttt..
.twwtttt.
ttwtttbtt
.ttttbbb.
..tttbb..
...tbb...
....b....`],
];

function parse(name: string, text: string): Pic {
  const rows = text.split('\n').map((r) => r.trim()).filter((r) => r.length > 0);
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const cells = new Uint8Array(w * h);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) cells[y * w + x] = Math.max(0, LETTERS.indexOf(row[x]));
  });
  return { name, w, h, cells };
}

export const ARTS: Pic[] = RAW.map(([name, text]) => parse(name, text));

/** Увеличение вдвое: маленькая картинка превращается в большую «крупными мазками». */
export function upscale(p: Pic): Pic {
  const w = p.w * 2;
  const h = p.h * 2;
  const cells = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells[y * w + x] = p.cells[(y >> 1) * p.w + (x >> 1)];
  return { name: p.name, w, h, cells };
}

export function mirror(p: Pic): Pic {
  const cells = new Uint8Array(p.cells.length);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) cells[y * p.w + x] = p.cells[y * p.w + (p.w - 1 - x)];
  return { ...p, cells };
}

/** Перекраска: цвета картинки меняются местами между собой. */
export function recolor(p: Pic, perm: number[]): Pic {
  const used = usedColors(p.cells);
  const map = new Map(used.map((c, i) => [c, used[perm[i] % used.length]]));
  return { ...p, cells: p.cells.map((c) => (c ? map.get(c) ?? c : 0)) };
}

export function usedColors(cells: Uint8Array): number[] {
  const seen = new Set<number>();
  for (const c of cells) if (c > 0 && c <= COLOR_COUNT) seen.add(c);
  return [...seen].sort((a, b) => a - b);
}
