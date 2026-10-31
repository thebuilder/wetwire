// Mockup of the new company terminal: boot, spinning logo, save select and the Squad page, with
// the agent as a phosphor image or a hand-drawn ASCII figure. The data is made up; nothing here touches the game.
// Keys: ` switches the agent view, Tab shows both at once, 1-4 or left/right pick an agent, up/down a weapon.
// Type: view ascii|image, phosphor teal|amber|green, compare, logout, or an agent's name.
import { ICON_IMG } from '../src/icons';
import { type Luma, drawArt, loadImage, toLuma } from '../src/terminal/art';
import { bigText, bigWidth, drawLogo } from '../src/terminal/logo';
import { type Hue, PALETTES, type Rect, Term } from '../src/terminal/term';
import dollM from '../art/doll/base_px.png';
import dollF from '../art/doll/fem_px.png';

const AGENTS = [
  { name: 'KESTREL', sex: 'm', deploy: true, hp: 100, kills: 14, missions: 3, slots: ['PISTOL', 'RIFLE'], gear: 'DECK', mods: { ARMS: 1, LEGS: 2, CHEST: 0, EYES: 1, HEART: 0, BRAIN: 1 } },
  { name: 'ODA', sex: 'f', deploy: true, hp: 100, kills: 9, missions: 3, slots: ['PISTOL', 'UZI'], gear: null, mods: { ARMS: 0, LEGS: 1, CHEST: 1, EYES: 2, HEART: 0, BRAIN: 0 } },
  { name: 'VANCE', sex: 'm', deploy: true, hp: 62, kills: 6, missions: 2, slots: ['SHOTGUN', null], gear: 'MEDIKIT', mods: { ARMS: 2, LEGS: 0, CHEST: 1, EYES: 0, HEART: 1, BRAIN: 0 } },
  { name: 'SAINT', sex: 'f', deploy: false, hp: 100, kills: 2, missions: 1, slots: ['PISTOL', null], gear: null, mods: { ARMS: 0, LEGS: 0, CHEST: 0, EYES: 0, HEART: 0, BRAIN: 0 } },
];
const ARMOURY = [
  { id: 'pistol', name: 'PISTOL', cost: 0, dmg: 24, range: 12, rate: 2.4, noise: 13, desc: 'Accurate and quiet. Free to buy and reload.' },
  { id: 'uzi', name: 'UZI', cost: 750, dmg: 8, range: 13, rate: 11, noise: 24, desc: 'Fast, loud and wasteful. 50 rounds a magazine.' },
  { id: 'shotgun', name: 'SHOTGUN', cost: 250, dmg: 84, range: 7.5, rate: 1.2, noise: 26, desc: 'Devastating up close. Even the pistol outranges it.' },
  { id: 'rifle', name: 'LONG RIFLE', cost: 1000, dmg: 75, range: 28, rate: 0.8, noise: 30, desc: 'Single shots at long range. Captured from the militia.' },
  { id: 'jack', name: 'MIND-JACK', cost: 5000, dmg: 0, range: 8, rate: 0.5, noise: 2, desc: 'Takes over one person. They fight for you until the link drops.' },
];
const SLOTS = [
  { file: 'NODE 7', cash: 19250, done: 3, agents: 4, when: '2093-10-31 20:36' },
  { file: 'NODE 3', cash: 3000, done: 0, agents: 4, when: '2093-10-29 11:02' },
  null,
];
const BOOT = ['KESSEL CO. MU-7 ROM 4.1', 'RAM 640K .......... OK', 'CRYO LINK ......... OK', 'UPLINK HARROW BAY .. OK', 'NODE 7'];
const PAGES = ['CONTRACTS', 'TERRITORY', 'SQUAD', 'RESEARCH', 'SYSTEM'];
type ArtMode = 'image' | 'ascii';
const MODES: ArtMode[] = ['image', 'ascii'];
// Drawn by hand, as ASCII art should be: a schematic of an agent, not a copy of the portrait.
const ASCII_AGENT = [
  '      .-----.      ',
  '     /  ___  \\     ',
  '     | [o o] |     ',
  '     |   =   |     ',
  "      '-._.-'      ",
  '     ___| |___     ',
  '   /`  \\___/  `\\   ',
  '  / /|  [#]  |\\ \\  ',
  ' / / |  ===  | \\ \\ ',
  '[_]  |  ===  |  [_]',
  ' ||  |_______|  || ',
  ' ##   /  |  \\   ## ',
  '     /  /|\\  \\     ',
  '    /__/ | \\__\\    ',
  '    |  | | |  |    ',
  '    |==| | |==|    ',
  '    |  | | |  |    ',
  '    |__| | |__|    ',
  '    [__]   [__]    ',
];
const fmt = (n: number) => n.toLocaleString('en-US');

const params = new URLSearchParams(location.search);
const st = {
  screen: params.get('screen') || 'boot',
  t0: performance.now(), screenT: performance.now(),
  agent: 1, weapon: 1, mode: (params.get('mode') as ArtMode) || 'image', compare: params.has('compare'),
  phosphor: params.get('phosphor') || 'teal', cmd: '', msg: '', slot: 0,
};
const dolls: Record<string, Luma> = {};
const icons: Record<string, Luma> = {};

function go(screen: string) { st.screen = screen; st.screenT = performance.now(); }

function drawBoot(t: Term, now: number) {
  const el = (now - st.screenT) / 1000;
  t.power = Math.min(1, el / 0.45);
  let n = Math.floor((el - 0.5) * 42), y = 2;
  for (const line of BOOT) {
    if (n <= 0) break;
    t.put(3, y++, line.slice(0, n), { b: 0.85 });
    n -= line.length + 8;
  }
  if (Math.floor(now / 480) % 2 === 0) t.cell(3, y, '█', { b: 0.9 });
  if (el > 2.6) go('logo');
}

function drawLogoScreen(t: Term, now: number) {
  const el = (now - st.screenT) / 1000, fade = Math.min(1, el / 0.7);
  const bw = bigWidth('KESSEL'), logoH = t.rows - 11, area = { x: 0, y: 1, w: t.cols, h: logoH };
  drawLogo(t, area, el * 1.1 + 0.5, 0, fade);
  if (el > 0.7) bigText(t, 'KESSEL', Math.floor((t.cols - bw) / 2), logoH + 2, 2, Math.min(1, (el - 0.7) * 2));
  if (el > 1.4) {
    const s = 'FIELD OPERATIONS // HARROW BAY // 2093';
    t.center({ x: 0, y: 0, w: t.cols, h: 0 }, logoH + 8, s, { b: 0.55 });
    if (Math.floor(now / 600) % 2 === 0) t.center({ x: 0, y: 0, w: t.cols, h: 0 }, t.rows - 2, '[ PRESS ANY KEY ]', { b: 0.7 });
  }
  t.region({ x: 0, y: 0, w: t.cols, h: t.rows }, 'next', () => go('select'));
}

function drawSelect(t: Term, now: number) {
  const el = (now - st.screenT) / 1000, logo = { x: 2, y: 1, w: 50, h: t.rows - 2 };
  drawLogo(t, logo, el * 0.8 + 2, 0, 0.8);
  const x = logo.x + logo.w + 3, w = t.cols - x - 3;
  bigText(t, 'KESSEL', x, 5, 2);
  t.box({ x, y: 12, w, h: 12 }, 'OPERATOR FILE');
  SLOTS.forEach((s, i) => {
    const y = 14 + i * 3, sel = st.slot === i, id = 'slot' + i;
    t.region({ x: x + 2, y, w: w - 4, h: 2 }, id, () => { st.slot = i; go('squad'); });
    const hot = sel || t.hover === id, b = hot ? 1 : 0.6;
    t.put(x + 2, y, (hot ? '> ' : '  ') + (i + 1), { b, hue: hot ? 2 : 0 });
    if (s) {
      t.put(x + 7, y, s.file, { b });
      t.right(x + w - 3, y, fmt(s.cash) + ' CR', { b, hue: 2 });
      t.put(x + 7, y + 1, s.done + ' CONTRACTS // ' + s.agents + ' AGENTS', { b: b * 0.65 });
      t.right(x + w - 3, y + 1, s.when, { b: b * 0.65 });
    } else t.put(x + 7, y, 'EMPTY // NEW FILE', { b: b * 0.65 });
  });
}

function drawBar(t: Term, x: number, y: number, w: number, v: number, max: number, b: number, hue: Hue = 0) {
  const n = Math.round(Math.min(1, v / max) * w);
  for (let i = 0; i < w; i++) t.cell(x + i, y, '▬', { b: i < n ? b : b * 0.16, hue });
}

function drawChrome(t: Term, now: number) {
  t.put(2, 0, 'KESSEL CO.', { b: 1, hue: 2 });
  t.put(13, 0, '// FIELD OPERATIONS // NODE 7', { b: 0.5 });
  t.right(t.cols - 2, 0, '2093-10-31 20:36  ' + fmt(SLOTS[st.slot]?.cash ?? 3000) + ' CR', { b: 0.9, hue: 2 });
  t.hline(0, 1, t.cols, '═', { b: 0.45 });
  let x = 2;
  PAGES.forEach((p, i) => {
    const on = p === 'SQUAD';
    x += t.button(x, 2, ' ' + (i + 1) + ' ' + p + ' ', 'page' + i, () => { st.msg = on ? '' : p + ' IS NOT IN THIS MOCKUP'; }, { inv: on, b: on ? 1 : 0.7 }) + 1;
  });
  t.hline(0, t.rows - 3, t.cols, '─', { b: 0.3 });
  promptLine(t, now, 2, t.rows - 2);
}

function promptLine(t: Term, now: number, x: number, y: number) {
  const p = '> ' + st.cmd, n = t.put(x, y, p, { b: 0.95 });
  if (Math.floor(now / 530) % 2 === 0) t.cell(x + n, y, '█', { b: 0.9 });
  if (st.msg) t.right(t.cols - 2, y, st.msg, { b: 0.75, hue: 2 });
}

function drawRoster(t: Term, r: Rect) {
  t.box(r, 'SQUAD');
  AGENTS.forEach((a, i) => {
    const y = r.y + 1 + i * 4, on = st.agent === i, id = 'ag' + i;
    t.region({ x: r.x + 1, y, w: r.w - 2, h: 3 }, id, () => { st.agent = i; });
    const hot = on || t.hover === id;
    t.put(r.x + 2, y, (a.deploy ? '[x] ' : '[ ] '), { b: a.deploy ? 0.9 : 0.4 });
    t.put(r.x + 6, y, a.name, { b: hot ? 1 : 0.7, inv: on });
    t.right(r.x + r.w - 2, y, String(i + 1), { b: 0.4 });
    t.put(r.x + 6, y + 1, a.slots.filter(Boolean).join(' '), { b: 0.5 });
    const low = a.hp < 70;
    drawBar(t, r.x + 6, y + 2, r.w - 9, a.hp, 100, low ? 0.9 : 0.6, low ? 1 : 0);
  });
  t.button(r.x + 2, r.y + r.h - 2, '+ RECRUIT 3,000 CR', 'recruit', () => { st.msg = 'NOT IN THIS MOCKUP'; }, { b: 0.7 });
}

function drawAgentArt(t: Term, r: Rect, mode: ArtMode, d?: Luma) {
  if (mode === 'image') { if (d) drawArt(t, d, r, 0); return; }
  const y0 = r.y + Math.floor((r.h - ASCII_AGENT.length) / 2);
  ASCII_AGENT.forEach((l, i) => t.center(r, y0 + i, l, { b: 0.85 }));
}

function drawFigure(t: Term, r: Rect, a: typeof AGENTS[number]) {
  t.box(r, a.name);
  const d = dolls[a.sex];
  drawAgentArt(t, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 4 }, st.mode, d);
  t.center(r, r.y + r.h - 3, a.missions + ' CONTRACTS // ' + a.kills + ' KILLS', { b: 0.55 });
  let x = r.x + 2;
  for (const m of MODES) x += t.button(x, r.y + r.h - 2, ' ' + m.toUpperCase() + ' ', 'mode' + m, () => { st.mode = m; }, { inv: st.mode === m, b: 0.8 }) + 1;
}

function drawLoadout(t: Term, r: Rect, a: typeof AGENTS[number]) {
  t.box(r, 'LOADOUT');
  const col = r.x + 2, w = r.w - 4, rows: [string, string | null][] = [['SLOT 1', a.slots[0]], ['SLOT 2', a.slots[1]], ['GEAR', a.gear]];
  rows.forEach(([k, v], i) => {
    t.put(col, r.y + 1 + i, k.padEnd(8), { b: 0.45 });
    t.put(col + 8, r.y + 1 + i, v || '-- EMPTY --', { b: v ? 0.9 : 0.35 });
  });
  const mods = Object.entries(a.mods), mx = col + Math.floor(w / 2);
  mods.forEach(([k, v], i) => {
    const x = mx + (i % 2) * 13, y = r.y + 1 + Math.floor(i / 2);
    t.put(x, y, k.padEnd(6), { b: 0.45 });
    t.put(x + 6, y, v ? 'V' + v : '--', { b: v ? 0.9 : 0.3, hue: v ? 2 : 0 });
  });
}

function drawArmoury(t: Term, r: Rect) {
  t.box(r, 'ARMOURY');
  const list = { x: r.x + 2, y: r.y + 1, w: 26 };
  ARMOURY.forEach((w, i) => {
    const y = list.y + i, on = st.weapon === i, id = 'wp' + i;
    t.region({ x: list.x, y, w: list.w, h: 1 }, id, () => { st.weapon = i; });
    const hot = on || t.hover === id;
    t.put(list.x, y, (on ? '> ' : '  ') + w.name, { b: hot ? 1 : 0.6, hue: on ? 2 : 0 });
    t.right(list.x + list.w, y, w.cost ? fmt(w.cost) : 'FREE', { b: 0.5 });
  });
  const w = ARMOURY[st.weapon], x = list.x + list.w + 3, W = r.x + r.w - x - 2, icon = icons[w.id], iw = Math.min(W, 40);
  if (icon) drawArt(t, icon, { x, y: r.y + 1, w: iw, h: 9 }, 2);
  const sx = x + iw + 2, sw = r.x + r.w - sx - 2;
  if (sw > 14) ([['DAMAGE', w.dmg, 90], ['RANGE', w.range, 30], ['RATE', w.rate, 12], ['NOISE', w.noise, 32]] as [string, number, number][]).forEach(([k, v, max], i) => {
    t.put(sx, r.y + 1 + i, k.padEnd(7), { b: 0.45 });
    drawBar(t, sx + 7, r.y + 1 + i, sw - 7, v, max, 0.85, 2);
  });
  const dy = r.y + 11, a = AGENTS[st.agent], owned = a.slots.includes(w.name);
  t.wrap(w.desc, r.w - 4).slice(0, 3).forEach((l, i) => t.put(r.x + 2, dy + i, l, { b: 0.7 }));
  t.button(r.x + 2, r.y + r.h - 2, owned ? ' EQUIPPED ' : w.cost ? ' BUY ' + fmt(w.cost) + ' CR ' : ' EQUIP ', 'buy', () => { st.msg = 'NOT IN THIS MOCKUP'; }, { inv: !owned, b: owned ? 0.4 : 0.9, hue: 2 });
}

function drawSquad(t: Term, now: number) {
  drawChrome(t, now);
  const a = AGENTS[st.agent], top = 3, H = t.rows - 6, rw = 28, fw = Math.min(40, Math.floor((t.cols - rw) * 0.36));
  drawRoster(t, { x: 1, y: top, w: rw, h: H });
  if (st.compare) {
    const each = Math.floor((t.cols - rw - 2) / MODES.length), d = dolls[a.sex];
    MODES.forEach((m, i) => {
      const r = { x: rw + 1 + i * each, y: top, w: each, h: H };
      t.box(r, m.toUpperCase());
      drawAgentArt(t, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, m, d);
    });
    return;
  }
  drawFigure(t, { x: rw + 1, y: top, w: fw, h: H }, a);
  const x = rw + fw + 1, W = t.cols - x - 1;
  drawLoadout(t, { x, y: top, w: W, h: 5 }, a);
  drawArmoury(t, { x, y: top + 5, w: W, h: H - 5 });
}

const term = new Term(document.getElementById('glass')!, document.getElementById('crt') as HTMLCanvasElement, (t, now) => {
  t.palette = PALETTES[st.phosphor]; t.power = 1;
  if (st.screen === 'boot') drawBoot(t, now);
  else if (st.screen === 'logo') drawLogoScreen(t, now);
  else if (st.screen === 'select') drawSelect(t, now);
  else drawSquad(t, now);
});

function runCommand(raw: string) {
  const [c, arg] = raw.trim().toLowerCase().split(/\s+/);
  st.msg = '';
  const i = AGENTS.findIndex((a) => a.name.toLowerCase() === c);
  if (i >= 0) st.agent = i;
  else if (c === 'view' && MODES.includes(arg as ArtMode)) st.mode = arg as ArtMode;
  else if (c === 'compare') st.compare = !st.compare;
  else if (c === 'phosphor' && PALETTES[arg]) st.phosphor = arg;
  else if (c === 'logout') go('logo');
  else if (c) st.msg = 'UNKNOWN COMMAND: ' + c.toUpperCase();
}

addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey) return;
  if (st.screen === 'boot') { go('logo'); return; }
  if (st.screen === 'logo') { go('select'); return; }
  if (st.screen === 'select') {
    if (/^[1-3]$/.test(e.key)) st.slot = +e.key - 1;
    else if (e.key === 'ArrowDown') st.slot = Math.min(2, st.slot + 1);
    else if (e.key === 'ArrowUp') st.slot = Math.max(0, st.slot - 1);
    else if (e.key === 'Enter') go('squad');
    return;
  }
  if (e.key === 'Enter') { runCommand(st.cmd); st.cmd = ''; return; }
  if (e.key === 'Backspace') { st.cmd = st.cmd.slice(0, -1); return; }
  if (e.key === 'Tab') { e.preventDefault(); st.compare = !st.compare; return; }
  if (e.key === 'ArrowDown') { st.weapon = Math.min(ARMOURY.length - 1, st.weapon + 1); return; }
  if (e.key === 'ArrowUp') { st.weapon = Math.max(0, st.weapon - 1); return; }
  if (e.key === 'ArrowRight') { st.agent = (st.agent + 1) % AGENTS.length; return; }
  if (e.key === 'ArrowLeft') { st.agent = (st.agent + AGENTS.length - 1) % AGENTS.length; return; }
  if (!st.cmd) {
    if (/^[1-4]$/.test(e.key)) { st.agent = +e.key - 1; return; }
    if (e.key === '`') { st.mode = MODES[(MODES.indexOf(st.mode) + 1) % MODES.length]; return; }
  }
  if (e.key.length === 1) st.cmd += e.key;
});

(async () => {
  const [m, f] = await Promise.all([loadImage(dollM), loadImage(dollF)]);
  dolls.m = toLuma(m, m.width, m.height); dolls.f = toLuma(f, f.width, f.height);
  await Promise.all(ARMOURY.map(async (w) => {
    const b64 = (ICON_IMG as Record<string, string>)[w.id];
    if (!b64) return;
    const im = await loadImage('data:image/png;base64,' + b64);
    icons[w.id] = toLuma(im, im.width, im.height);
  }));
})();

(window as unknown as { __term: Term }).__term = term;
