// The company terminal: everything between missions, drawn on the CRT grid. Title, save file select, the Kessel
// login, then the pages. Immediate mode: each frame redraws from the save, so handlers only change state.
import { $, R, REDUCED, clamp, glCanvas } from './core';
import { WEATHER } from './world_load';
import { AU, audioInit, playMusic, setSound, sfx } from './engine';
import { CAP, GEAR, MISSIONS, MOD_COST, MOD_NEED, MOD_ORDER, MOD_TXT, RESEARCH, SAVE, SAVE_FILES, WEAPONS, ammoCost, chargeCost, derive, fileInfo, freshSave, fullAmmo, lookOf, mkRec, openFile, recWeight, refill, saveFile, setSAVE, store } from './campaign';
import { startMission } from './setup';
import { openCombatSim } from './combatsim';
import { TAX_FAIR, TERR, hasIntel, intelCost, taxIncome, terrOf } from './missions';
import { briefBitmap, terrBitmap } from './maps';
import { ICON_IMG } from './icons';
import { fmt, freeName } from './flow';
import { type Luma, drawArt, loadImage, toLuma } from './terminal/art';
import { BROWS, HAIRS, type ModPart, MOUTHS, SKINS, dollBitmap } from './terminal/doll';
import { bigText, bigWidth, drawLogo } from './terminal/logo';
import { INTRO_END, type MarkPlace, circuitBitmap, introGlitch, wordmarkBitmap } from './terminal/wordmark';
import { type Hue, PALETTES, type Rect, type Style, Term } from './terminal/term';

export let planDef = null, DEBRIEF = null;
export function setPlanDef(v: typeof planDef) { return planDef = v; }
export function setDEBRIEF(v: typeof DEBRIEF) { return DEBRIEF = v; }
/* Kept for callers that change game state: the next frame redraws from it anyway. */
export function renderPage() {}

const PAGES = ['contracts', 'territory', 'squad', 'research', 'system'];
const BOOT = ['KESSEL CO. MU-7 ROM 4.1', 'RAM 640K .......... OK', 'CRYO LINK ......... OK', 'UPLINK HARROW BAY .. OK', 'OPERATOR FILE ...... OK'];
const LOGIN_TIME = 2.8;
const FILE_NAMES = ['NODE 7', 'NODE 3', 'NODE 12'];
const LOOK_ROWS = ['skin', 'hair', 'brow', 'mouth', 'scar'];
const LOOK_OPTS = { skin: SKINS, hair: HAIRS, brow: BROWS, mouth: MOUTHS };
const MANUAL = [
  ['LMB', 'Select an agent, or move. Double-click to run. Drag to box-select.'], ['RMB', 'Click a target to attack. Hold to fire at the ground.'],
  ['SPACE', 'Pause. You can give orders while paused.'], ['1-4 / 0', 'Select an agent or the whole team. Press twice to centre.'], ['Z X R G', 'Weapon slot 1 or 2, reload, medikit.'],
  ['H', 'Network view. Click an uplink to send a deck carrier, then click nodes in its range.'], ['F', 'Take the nearest vehicle, or get out.'],
  ['WASD Q E', 'Pan, rotate. Wheel zooms.'], ['ESC ESC', 'Abort the contract.'],
  ['STEALTH', 'Guards see further in light. Searchlights expose you. An alarm only goes off if an alerted guard stays alive for 3 seconds.'],
  ['AMMO', 'Limited per contract. Dead enemies drop weapons: walk over them for ammo, click to swap.'],
  ['FIRE', 'Explosions, wrecks and the flamer leave fire. Anyone in it catches alight. Fuel drums blow up when shot.'],
  ['TOWERS', 'Clear a watchtower, then click it to send two agents up the ladder for extra range.'],
];
const PREFS_KEY = 'wetwire.term';
const prefs = (() => { try { return { phosphor: 'teal', crt: 0.3, ...JSON.parse(localStorage.getItem(PREFS_KEY)) }; } catch (e) { return { phosphor: 'teal', crt: 0.3 }; } })();
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {} };

const UI = {
  screen: 'title', screenT: performance.now(), powerT: performance.now(), page: 'contracts', fileSel: saveFile,
  conSel: null, armSel: 0, slotSel: 0, shopSel: null, sqTab: 'gear', modSel: 0, lookSel: 0, terrSel: 0, resSel: 0, wipeArm: 0,
  glide: false, titleAge: 0, leftTitle: 0, cmd: '', msg: 'READY', msgHue: 0 as Hue, msgT: 0, woke: false, scroll: {} as Record<string, number>,
};

/* ---------------------------------------------------------------- small helpers */
const ui = (vol = 0.4, rate = 1) => sfx('ui', null, null, vol, rate);
const deployedAlive = () => SAVE.agents.filter((r) => r.alive && r.deploy);
const aliveIdx = (): number[] => SAVE.agents.map((r, i) => (r.alive ? i : -1)).filter((i) => i >= 0);
const missionOf = (id) => MISSIONS.find((m) => m.id === id);
const lockedM = (m) => m.need && !SAVE.done[m.need];
const clock = () => { const d = new Date(); return '2093-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + d.toTimeString().slice(0, 5); };
export function tStatus(msg, cls?) { UI.msg = String(msg); UI.msgHue = cls === 'bad' ? 1 : cls === 'warn' ? 2 : 0; UI.msgT = performance.now(); }

const hex = (c: number[]) => '#' + c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
/* The mission HUD is DOM, so it follows the phosphor through CSS variables. */
function applyPhosphor() {
  const P = PALETTES[prefs.phosphor] || PALETTES.teal, s = document.documentElement.style;
  s.setProperty('--teal', hex(P.phosphor)); s.setProperty('--teal-d', hex(P.phosphor.map((v) => v * 0.55))); s.setProperty('--text', hex(P.phosphor.map((v) => v * 0.85))); s.setProperty('--dim', hex(P.phosphor.map((v) => v * 0.6)));
  s.setProperty('--mute', hex(P.phosphor.map((v) => v * 0.38))); s.setProperty('--hi', hex(P.phosphor.map((v) => v * 0.32))); s.setProperty('--edge', hex(P.phosphor.map((v) => v * 0.45)));
  s.setProperty('--plate2', hex(P.phosphor.map((v) => v * 0.08))); s.setProperty('--amber', hex(P.accent)); s.setProperty('--amber-d', hex(P.accent.map((v) => v * 0.6))); s.setProperty('--pink', hex(P.alert));
}

/* The first key or click after load is what browsers require before sound can start. */
function wake() {
  if (UI.woke) return; UI.woke = true;
  if (!AU.ctx) setSound(true); else audioInit();
  playMusic('theme', 1.5);
}

/* ---------------------------------------------------------------- weapon and gear icons */
const icons: Record<string, Luma> = {};
for (const id of Object.keys(ICON_IMG)) loadImage('data:image/png;base64,' + ICON_IMG[id]).then((im) => { icons[id] = toLuma(im, im.width, im.height); });

/* ---------------------------------------------------------------- lines: wrapped, scrollable, with buttons */
interface Seg { t: string; s?: Style; on?: () => void; id?: string; x?: number }
type Line = Seg[];
const seg = (t: string, b = 0.7, hue: Hue = 0): Seg => ({ t, s: { b, hue } });
function btn(t: string, id: string, on: (() => void) | null, primary = false): Seg {
  return on ? { t: ' ' + t + ' ', id, on, s: { b: primary ? 1 : 0.85, hue: primary ? 2 : 0, inv: primary } } : { t: ' ' + t + ' ', s: { b: 0.32 } };
}
/* Wraps text, drawing *starred* words in the accent colour. */
function wrapMark(text: string, w: number, b = 0.72, indent = ''): Line[] {
  const out: Line[] = []; let line: Line = [], n = 0, hot = false;
  const flush = () => { out.push(line); line = []; n = 0; };
  for (const raw of String(text).split(/\s+/)) {
    if (!raw) continue;
    const parts = raw.split('*'), word = parts.join('');
    if (n && n + 1 + word.length > w) flush();
    if (!n && out.length && indent) { line.push(seg(indent)); n = indent.length; }
    if (n && line.length && !(line.length === 1 && indent && out.length)) { line.push(seg(' ', b)); n++; }
    parts.forEach((p, i) => { if (i) hot = !hot; if (p) { line.push(seg(p, hot ? 1 : b, hot ? 2 : 0)); n += p.length; } });
  }
  if (line.length) flush();
  return out;
}
function drawLineAt(t: Term, x: number, y: number, L: Line) {
  let cx = x;
  for (const s of L) {
    if (s.x != null) cx = x + s.x;
    cx += s.on ? t.button(cx, y, s.t, s.id!, s.on, s.s) : t.put(cx, y, s.t, s.s);
  }
}
function drawLines(t: Term, r: Rect, lines: Line[], key: string) {
  const max = Math.max(0, lines.length - r.h), top = clamp(UI.scroll[key] || 0, 0, max); UI.scroll[key] = top;
  t.clip(r);
  lines.slice(top, top + r.h).forEach((L, i) => drawLineAt(t, r.x, r.y + i, L));
  t.clip(null);
  if (max) {
    t.wheel(r, 'scroll-' + key, (d) => { UI.scroll[key] = clamp(top + d * 2, 0, max); });
    const bar = Math.max(1, Math.round((r.h * r.h) / lines.length)), by = r.y + Math.round((top / max) * (r.h - bar));
    for (let i = 0; i < r.h; i++) t.cell(r.x + r.w, r.y + i, '│', { b: i + r.y >= by && i + r.y < by + bar ? 0.85 : 0.18 });
  }
}
function drawBar(t: Term, x: number, y: number, w: number, v: number, max: number, b = 0.85, hue: Hue = 0) {
  const n = Math.round(clamp(v / max, 0, 1) * w);
  for (let i = 0; i < w; i++) t.cell(x + i, y, '▬', { b: i < n ? b : b * 0.16, hue });
}
/* A row in a selectable list. The whole row is clickable. */
function listRow(t: Term, r: Rect, y: number, id: string, on: boolean, left: string, right: string, dim = false, rightHue: Hue = 0, pick?: () => void) {
  t.region({ x: r.x, y, w: r.w, h: 1 }, id, pick);
  const hot = on || t.hover === id, b = dim ? (hot ? 0.6 : 0.34) : hot ? 1 : 0.65;
  t.put(r.x, y, on ? '>' : ' ', { b: 1, hue: 2 });
  t.clip({ x: r.x, y, w: r.w - [...right].length - 1, h: 1 }); t.put(r.x + 2, y, left, { b, hue: on ? 2 : 0 }); t.clip(null);
  t.right(r.x + r.w, y, right, { b: dim ? 0.3 : 0.55, hue: rightHue });
}

/* ---------------------------------------------------------------- boot, logo, file select */
function go(screen: string) { UI.screen = screen; UI.screenT = performance.now(); }
const FULL = (t: Term): Rect => ({ x: 0, y: 0, w: t.cols, h: t.rows });
/* The wordmark keeps one rectangle size on both screens, so it holds its scale while it glides between them. */
const fileBoxH = () => 2 + SAVE_FILES * 3 + 1;
const markRows = (t: Term) => t.rows - fileBoxH() - 4;
const titleY = (t: Term) => Math.max(1, Math.floor((t.rows - markRows(t)) / 2) - 1);
const easeInOut = (x: number) => { const k = clamp(x, 0, 1); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
function toSelect() { UI.glide = !REDUCED; UI.leftTitle = UI.titleAge; go('select'); }
/* Where the wordmark lands on the title, for the board to route around. Matches what Term.pixels() does with its rectangle. */
function markPlace(t: Term): MarkPlace {
  const screenW = t.cols * t.cw * t.dpr, screenH = t.rows * t.ch * t.dpr, rw = screenW, rh = markRows(t) * t.ch * t.dpr, W = 356, H = 76;
  const scale = Math.max(1, Math.floor(Math.min(rw / W, rh / H)));
  return { screenW, screenH, scale, markX: (rw - W * scale) / 2, markY: titleY(t) * t.ch * t.dpr + (rh - H * scale) / 2 };
}
function advanceTitle() {
  // the first press during the intro only skips it
  if (UI.titleAge < INTRO_END) { UI.screenT -= 60000; ui(0.3, 1.2); } else toSelect();
}
function drawTitle(t: Term, now: number) {
  const y = titleY(t), h = markRows(t), el = (now - UI.screenT) / 1000;
  UI.titleAge = el;
  t.pixels({ x: 0, y, w: t.cols, h }, wordmarkBitmap(now, el));
  t.pixels(FULL(t), circuitBitmap(now, el, markPlace(t)));
  t.glitch = introGlitch(el);
  if (el > INTRO_END && Math.floor(now / 600) % 2 === 0) t.center(FULL(t), y + h, '[ PRESS ANY KEY ]', { b: 0.7 });
  t.region(FULL(t), 'next', advanceTitle);
}
/* Logging in: the file is the player's, the machine it runs on is Kessel's. */
function drawLogin(t: Term, now: number) {
  const el = (now - UI.screenT) / 1000, logoH = t.rows - 11;
  drawLogo(t, { x: 0, y: 0, w: t.cols, h: logoH }, REDUCED ? 0.5 : el * 1.4 + 0.5, 0, REDUCED ? 1 : Math.min(1, el / 0.4));
  bigText(t, 'KESSEL', Math.floor((t.cols - bigWidth('KESSEL')) / 2), logoH, 2, REDUCED ? 1 : Math.min(1, el * 3));
  const y = t.rows - 4, bw = Math.min(46, t.cols - 8), x = Math.floor((t.cols - bw) / 2), pct = clamp(el / LOGIN_TIME, 0, 1), line = BOOT[Math.min(BOOT.length - 1, Math.floor(pct * BOOT.length))];
  t.put(x, y, line, { b: 0.7 });
  drawBar(t, x, y + 1, bw, pct, 1, 0.9, 2);
  t.region(FULL(t), 'skip', finishLogin);
  if (pct >= 1) finishLogin();
}
function finishLogin() {
  tStatus('LOGGED IN // ' + SAVE.agents.filter((r) => r.alive).length + ' AGENTS IN CRYO');
  UI.screen = 'page'; openPage('contracts');
}
function enterFile(i: number) {
  wake(); openFile(i); UI.fileSel = i; planDefReset(); ui(0.6, 1.2);
  if (REDUCED) finishLogin(); else go('login');
}
function planDefReset() { planDef = null; UI.conSel = null; UI.armSel = 0; UI.slotSel = 0; UI.shopSel = null; UI.wipeArm = 0; }
function drawSelect(t: Term, now: number) {
  // arriving from the title: the wordmark glides up, the box opens from its middle, then the files fade in in turn
  const el = UI.glide ? (now - UI.screenT) / 1000 : 9, w = Math.min(84, t.cols - 8), x = Math.floor((t.cols - w) / 2), boxH = fileBoxH(), markH = markRows(t);
  t.pixels({ x: 0, y: 1, w: t.cols, h: markH }, wordmarkBitmap(now), false, (titleY(t) - 1) * t.ch * (1 - easeInOut(el / 0.75)));
  if (el < 0.5) t.pixels(FULL(t), circuitBitmap(now, UI.leftTitle, markPlace(t), 1 - el / 0.5));
  const open = easeInOut((el - 0.35) / 0.4), mid = markH + 2 + Math.floor(boxH / 2), shownH = Math.max(0, Math.round(boxH * open));
  if (shownH < 2) return;
  const box = { x, y: mid - Math.floor(shownH / 2), w, h: shownH };
  t.box(box, shownH > 3 ? 'OPERATOR FILE' : '');
  t.clip({ x: box.x + 1, y: box.y + 1, w: box.w - 2, h: Math.max(0, box.h - 2) });
  for (let i = 0; i < SAVE_FILES; i++) {
    const s = fileInfo(i), y = markH + 4 + i * 3, sel = UI.fileSel === i, id = 'file' + i, fade = clamp((el - 0.65 - i * 0.1) / 0.3, 0, 1);
    t.region({ x: x + 2, y, w: w - 4, h: 2 }, id, () => enterFile(i));
    const hot = sel || t.hover === id, b = (hot ? 1 : 0.6) * fade;
    t.put(x + 2, y, (hot ? '> ' : '  ') + (i + 1), { b, hue: hot ? 2 : 0 });
    if (s) {
      t.put(x + 7, y, FILE_NAMES[i], { b });
      t.right(x + w - 3, y, fmt(s.cash) + ' CR', { b, hue: 2 });
      t.put(x + 7, y + 1, s.done + ' CONTRACTS // ' + s.agents + ' AGENTS', { b: b * 0.65 });
      if (s.when) t.right(x + w - 3, y + 1, s.when.slice(0, 10).replace(/^\d+/, '2093') + ' ' + s.when.slice(11, 16), { b: b * 0.65 });
    } else t.put(x + 7, y, 'EMPTY // NEW FILE', { b: b * 0.65 });
  }
  t.clip(null);
}

/* ---------------------------------------------------------------- page chrome */
function drawChrome(t: Term, now: number) {
  t.put(2, 0, 'KESSEL CO.', { b: 1, hue: 2 });
  t.put(13, 0, '// FIELD OPERATIONS // ' + FILE_NAMES[saveFile], { b: 0.5 });
  t.right(t.cols - 2, 0, clock() + '  ' + fmt(SAVE.cash) + ' CR', { b: 0.9, hue: 2 });
  t.hline(0, 1, t.cols, '═', { b: 0.45 });
  let x = 2;
  const locked = UI.page === 'debrief';
  PAGES.forEach((p, i) => {
    const on = p === UI.page, label = ' ' + (i + 1) + ' ' + p.toUpperCase() + ' ';
    x += (locked ? t.put(x, 2, label, { b: 0.25 }) : t.button(x, 2, label, 'page-' + p, () => { ui(0.4, 1.4); openPage(p); }, { inv: on, b: on ? 1 : 0.7 })) + 1;
  });
  if (!locked) drawDeployBar(t, t.rows - 4);
  t.hline(0, t.rows - 3, t.cols, '─', { b: 0.3 });
  const n = t.put(2, t.rows - 2, '> ' + UI.cmd, { b: 0.95 });
  if (Math.floor(now / 530) % 2 === 0) t.cell(2 + n, t.rows - 2, '█', { b: 0.9 });
  const shown = REDUCED ? UI.msg.length : Math.min(UI.msg.length, Math.floor((now - UI.msgT) / 12));
  t.clip({ x: 2 + n + 2, y: t.rows - 2, w: t.cols - n - 6, h: 1 });
  t.right(t.cols - 2, t.rows - 2, UI.msg.slice(0, shown).padStart(UI.msg.length), { b: 0.8, hue: UI.msgHue });
  t.clip(null);
}
function deployBlock() {
  const dep = deployedAlive(), max = planDef ? planDef.max : 4;
  if (!planDef) return 'PICK A CONTRACT';
  if (!dep.length) return 'MARK AGENTS IN SQUAD';
  if (dep.length > max) return 'TOO MANY AGENTS MARKED';
  if (planDef.requires && !dep.slice(0, max).some((r) => r.slots.includes(planDef.requires))) return 'NEEDS A ' + WEAPONS[planDef.requires].name + ' IN THE TEAM';
  return null;
}
export function deploy() {
  if (deployBlock()) { tStatus(deployBlock(), 'bad'); return; }
  store(); sfx('zap', null, null, 0.6, 0.7); tStatus('DEPLOYING TEAM // CONTRACT ' + planDef.code);
  $('#termS').hidden = true; startMission(planDef); glCanvas.focus();
}
function drawDeployBar(t: Term, y: number) {
  const dep = deployedAlive(), max = planDef ? planDef.max : 4;
  let x = 2;
  x += t.put(x, y, 'CONTRACT ', { b: 0.45 });
  x += t.put(x, y, planDef ? planDef.code + ' ' + planDef.title.toUpperCase() : '--', { b: planDef ? 0.95 : 0.35, hue: planDef ? 2 : 0 }) + 3;
  x += t.put(x, y, 'TEAM ' + Math.min(dep.length, max) + '/' + max + ' ', { b: 0.45 });
  const block = deployBlock(), label = ' DEPLOY ', bx = t.cols - 2 - label.length;
  t.clip({ x, y, w: bx - x - (block ? block.length + 3 : 2), h: 1 });
  t.put(x, y, dep.slice(0, max).map((r) => r.name).join(' ') || '--', { b: 0.7 });
  t.clip(null);
  if (block) { t.right(bx - 2, y, block, { b: 0.7, hue: 2 }); t.put(bx, y, label, { b: 0.32 }); }
  else t.button(bx, y, label, 'deploy', deploy, { inv: true, b: 1, hue: 2 });
}
const contentRect = (t: Term): Rect => ({ x: 1, y: 3, w: t.cols - 2, h: t.rows - 8 });
const inner = (r: Rect): Rect => ({ x: r.x + 2, y: r.y + 1, w: r.w - 4, h: r.h - 2 });

/* ---------------------------------------------------------------- contracts */
function currentContract() {
  if (!UI.conSel) UI.conSel = planDef || MISSIONS.find((m) => !SAVE.done[m.id] && !lockedM(m)) || MISSIONS[0];
  return UI.conSel;
}
const contractAction = (m) => (lockedM(m) ? null : m === planDef ? () => openPage('squad') : () => { planDef = m; tStatus('CONTRACT ' + m.code + ' SELECTED // MARK UP TO ' + m.max + ' AGENTS IN SQUAD'); ui(0.6, 1.2); openPage('squad'); });
function drawContracts(t: Term, c: Rect) {
  const lw = Math.min(40, Math.floor(c.w * 0.3)), L = { x: c.x, y: c.y, w: lw, h: c.h }, D = { x: c.x + lw, y: c.y, w: c.w - lw, h: c.h }, m = currentContract(), lk = lockedM(m);
  t.box(L, 'CONTRACTS');
  const lr = inner(L);
  MISSIONS.forEach((q, i) => {
    const qlk = lockedM(q), tr = terrOf(q.id), st = tr && tr.revolt ? 'REVOLT' : SAVE.done[q.id] ? 'DONE' : qlk ? 'LOCKED' : q === planDef ? 'SELECTED' : 'OPEN';
    listRow(t, lr, lr.y + i, 'con-' + q.id, q === m, q.code + ' ' + (qlk ? 'CLASSIFIED' : q.title.toUpperCase()), st, !!qlk, st === 'REVOLT' ? 1 : st === 'SELECTED' ? 2 : 0, () => { if (UI.conSel !== q) UI.scroll.con = 0; UI.conSel = q; ui(); });
  });
  t.box(D, lk ? m.code + ' // CLASSIFIED' : m.code + ' // ' + m.title.toUpperCase());
  const ir = inner(D);
  if (lk) { t.put(ir.x, ir.y, 'KESSEL HAS NOT CLEARED THIS FILE FOR YOUR DEPARTMENT.', { b: 0.5 }); t.put(ir.x, ir.y + 2, 'COMPLETE ' + missionOf(m.need).title.toUpperCase() + ' TO UNLOCK IT.', { b: 0.8, hue: 2 }); return; }
  const mapW = ir.w >= 74 ? Math.floor(ir.w * 0.42) : 0, tw = ir.w - (mapW ? mapW + 3 : 1), lab = 11;
  const lines: Line[] = [[seg(m.region.toUpperCase(), 0.5)], [], ...wrapMark(m.brief, tw, 0.8), []];
  const meta = (k: string, v: string) => { const ws = wrapMark(v, tw - lab, 0.8); ws.forEach((l, i) => lines.push([{ ...seg(i ? '' : k, 0.45), x: 0 }, { t: '', x: lab }, ...l])); };
  meta('FEE', fmt(m.reward) + ' CR' + (SAVE.done[m.id] ? ' (REPEAT PAYS HALF)' : ''));
  meta('CONDITIONS', WEATHER[m.weather].name.toUpperCase());
  meta('TEAM', 'UP TO ' + m.max + ' AGENTS');
  meta('THREAT', m.threat);
  m.intel.forEach((x, i) => {
    const open = hasIntel(m) || i < 2, ws = open ? wrapMark(x, tw - lab - 2, 0.8) : [[seg(x.replace(/[^ ]/g, '/').slice(0, Math.min(42, tw - lab - 2)), 0.28)]];
    ws.forEach((l, j) => lines.push([{ ...seg(!i && !j ? 'INTEL' : '', 0.45), x: 0 }, { ...seg(j ? '' : '- ', 0.5), x: lab }, { t: '', x: lab + 2 }, ...l]));
  });
  if (!hasIntel(m)) lines.push([], [btn('BUY FULL INTEL + TARGET LOCATION ' + fmt(intelCost(m)) + ' CR', 'intel', SAVE.cash >= intelCost(m) ? () => { SAVE.cash -= intelCost(m); SAVE.intel = SAVE.intel || {}; SAVE.intel[m.id] = true; store(); tStatus('INTEL PURCHASED // ' + m.code); ui(0.6, 1.3); } : null)]);
  drawLines(t, { x: ir.x, y: ir.y, w: tw, h: ir.h - 2 }, lines, 'con');
  const act = contractAction(m);
  if (act) drawLineAt(t, ir.x, ir.y + ir.h - 1, [m === planDef ? btn('ASSEMBLE SQUAD', 'next', act) : btn('SELECT CONTRACT', 'pick', act, true)]);
  if (mapW) {
    const mr = { x: ir.x + tw + 2, y: ir.y, w: mapW, h: ir.h - 1 };
    t.pixels(mr, briefBitmap(m, Math.round(mr.w * t.cw * t.dpr), Math.round(mr.h * t.ch * t.dpr)));
    let lx = mr.x; const leg = (c: string, s: string, hue: Hue) => { t.cell(lx, mr.y + mr.h, c, { b: 1, hue }); lx += 2; lx += t.put(lx, mr.y + mr.h, s, { b: 0.55 }) + 2; };
    leg('+', 'TARGET', 1); leg('□', 'UPLINK', 0); leg('■', 'START, EXTRACT', 2);
  }
}

/* ---------------------------------------------------------------- territory */
function drawTerritory(t: Term, c: Rect) {
  const mw = Math.floor(c.w * 0.42), M = { x: c.x, y: c.y, w: mw, h: c.h }, D = { x: c.x + mw, y: c.y, w: c.w - mw, h: c.h };
  const owned = Object.keys(TERR).filter((id) => terrOf(id)), total = owned.reduce((s, id) => s + taxIncome(id), 0);
  t.box(M, 'HARROW BAY');
  const mi = inner(M), map = { x: mi.x, y: mi.y, w: mi.w, h: mi.h };
  t.pixels(map, terrBitmap(Math.round(map.w * t.cw * t.dpr), Math.round(map.h * t.ch * t.dpr)));
  t.box(D, 'DISTRICTS // ' + fmt(total) + ' CR PER CONTRACT');
  const ir = inner(D), lines: Line[] = [];
  if (!owned.length) lines.push([seg('NO DISTRICTS YET.', 0.5)]);
  UI.terrSel = clamp(UI.terrSel, 0, Math.max(0, owned.length - 1));
  owned.forEach((id, i) => {
    const T = terrOf(id), u = Math.round(T.unrest), on = i === UI.terrSel;
    const tax = (d: number) => () => { UI.terrSel = i; T.tax = clamp(T.tax + d, 0, 60); store(); ui(0.4, 1.2); };
    lines.push([{ ...seg(on ? '>' : ' ', 1, 2), x: 0 }, { ...seg(TERR[id].name.toUpperCase(), on ? 1 : 0.8, on ? 2 : 0), x: 2 }, { ...btn('-', 'tax-' + id, T.revolt || T.tax <= 0 ? null : tax(-5)), x: 30 }, { ...seg(String(T.tax).padStart(3) + '%', 0.95), x: 34 }, { ...btn('+', 'tax+' + id, T.revolt || T.tax >= 60 ? null : tax(5)), x: 39 }]);
    lines.push([{ ...seg(T.revolt ? 'IN REVOLT // RETAKE IT: REPLAY CONTRACT ' + missionOf(id).code : 'POP ' + TERR[id].pop + 'K // PAYS ' + fmt(taxIncome(id)) + ' CR', 0.5, T.revolt ? 1 : 0), x: 2 }]);
    lines.push([{ ...seg('UNREST', 0.45), x: 2 }, { t: '', x: 9, s: {}, id: 'u' + u }]);
    lines.push([]);
  });
  lines.push(...wrapMark('ABOVE ' + TAX_FAIR + '% UNREST GROWS AFTER EVERY CONTRACT. AT FULL UNREST A DISTRICT REVOLTS UNTIL A TEAM RETAKES IT.', ir.w - 1, 0.42));
  drawLines(t, ir, lines, 'terr');
  // unrest bars sit on their own rows, drawn over the scrolled lines
  const top = UI.scroll.terr || 0;
  lines.forEach((L, i) => { const m = L[1] && L[1].id && L[1].id.startsWith('u') ? +L[1].id.slice(1) : -1, y = ir.y + i - top; if (m >= 0 && y >= ir.y && y < ir.y + ir.h) drawBar(t, ir.x + 9, y, Math.min(30, ir.w - 11), m, 100, 0.85, m > 70 ? 1 : m > 40 ? 2 : 0); });
}

/* ---------------------------------------------------------------- squad */
const selectedRec = () => { const r = SAVE.agents[UI.armSel]; if (r && r.alive) return r; UI.armSel = Math.max(0, SAVE.agents.findIndex((x) => x.alive)); return SAVE.agents[UI.armSel]; };
function toggleDeploy(i: number) {
  const x = SAVE.agents[i], max = planDef ? planDef.max : 4;
  if (!x.deploy && deployedAlive().length >= max) { tStatus('ONLY ' + max + ' AGENTS CAN DEPLOY', 'bad'); return; }
  x.deploy = !x.deploy; store(); ui();
}
function recruit() {
  if (SAVE.cash < 3000 || aliveIdx().length >= 8) return;
  SAVE.cash -= 3000; const n = mkRec(freeName(), R() < 0.5 ? 'm' : 'f'); n.deploy = deployedAlive().length < (planDef ? planDef.max : 4); SAVE.agents.push(n); UI.armSel = SAVE.agents.length - 1;
  store(); ui(0.6, 1.2); tStatus(n.name + ' RECRUITED // PISTOL ISSUED' + (n.deploy ? ' // MARKED TO DEPLOY' : ' // TEAM FULL, IN RESERVE'));
}
function drawRoster(t: Term, r: Rect) {
  const alive = aliveIdx(), lost = SAVE.agents.length - alive.length;
  t.box(r, lost ? 'SQUAD // ' + lost + ' LOST' : 'SQUAD');
  const two = alive.length <= 5, step = two ? 2 : 1;
  alive.forEach((i, row) => {
    const a = SAVE.agents[i], y = r.y + 1 + row * step, on = UI.armSel === i, id = 'ag' + i;
    t.region({ x: r.x + 1, y, w: r.w - 2, h: step }, id, () => { if (UI.armSel !== i) { UI.armSel = i; UI.shopSel = null; ui(); } });
    const hot = on || t.hover === id;
    t.button(r.x + 2, y, a.deploy ? '[x]' : '[ ]', 'dep' + i, () => toggleDeploy(i), { b: a.deploy ? 0.9 : 0.4 });
    t.clip({ x: r.x + 6, y, w: r.w - 8, h: step });
    t.put(r.x + 6, y, a.name, { b: hot ? 1 : 0.7, inv: on });
    if (two) t.put(r.x + 6, y + 1, a.slots.filter(Boolean).map((s) => WEAPONS[s].name).join(' ') || 'UNARMED', { b: 0.5 });
    t.clip(null);
  });
  if (alive.length < 8) drawLineAt(t, r.x + 2, r.y + r.h - 2, [btn('+ RECRUIT 3,000 CR', 'recruit', SAVE.cash >= 3000 ? recruit : null)]);
}
function drawFigure(t: Term, r: Rect, a: any) {
  t.box(r, a.name);
  t.pixels({ x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, dollBitmap(lookOf(a), UI.sqTab === 'mods' ? MOD_ORDER[UI.modSel] as ModPart : undefined));
}
function drawStats(t: Term, r: Rect, a: any) {
  t.box(r, 'STATS');
  const d = derive(a.mods), ir = inner(r), wt = recWeight(a);
  const rows: [string, string, boolean][] = [
    ['CONTRACTS', String(a.missions), false], ['KILLS', String(a.kills), false], ['CARRY', wt + ' / ' + d.cap, d.cap > CAP[0]],
    ['SPEED', Math.round(d.speed * 100) + '%', d.speed > 1], ['ARMOUR', d.armor < 1 ? Math.round((1 - d.armor) * 100) + '%' : 'NONE', d.armor < 1],
    ['HACK', Math.round(d.hack * 100) + '%', d.hack > 1], ['TRACE', Math.round(d.traceMul * 100) + '%', d.traceMul < 1],
  ];
  rows.forEach(([k, v, up], i) => { if (i < ir.h) { t.put(ir.x, ir.y + i, k, { b: 0.45 }); t.right(ir.x + ir.w, ir.y + i, v, { b: up ? 1 : 0.8, hue: up ? 2 : 0 }); } });
}
const slotName = (r, i) => (i < 2 ? (r.slots[i] ? WEAPONS[r.slots[i]].name : '-- EMPTY --') : r.gear ? GEAR[r.gear].name : '-- EMPTY --');
function slotSub(r, i) {
  if (i < 2) {
    const id = r.slots[i]; if (!id) return '';
    const w = WEAPONS[id]; if (w.energy != null) return 'POWER CELL';
    const am = r.ammo[id] || { mag: 0, res: 0 };
    return Math.min(am.mag + am.res, w.mag * w.mags) + '/' + w.mag * w.mags + ' RDS';
  }
  if (!r.gear) return '';
  return GEAR[r.gear].charges ? r.charges + '/' + GEAR[r.gear].charges + ' CHARGES' : 'ONE USE';
}
const shopIds = () => (UI.slotSel < 2 ? SAVE.avail.filter((id) => WEAPONS[id] && !WEAPONS[id].npc) : Object.keys(GEAR));
function shopItem() {
  const ids = shopIds(), r = selectedRec(), cur = UI.slotSel < 2 ? r.slots[UI.slotSel] : r.gear;
  if (!UI.shopSel || !ids.includes(UI.shopSel)) UI.shopSel = cur && ids.includes(cur) ? cur : ids[0];
  return UI.slotSel < 2 ? WEAPONS[UI.shopSel] : GEAR[UI.shopSel];
}
/* What the buy button does for the selected item: a label, and a handler unless it can't be done. */
function shopAction(r): { label: string; on: (() => void) | null } {
  const it = shopItem(), isW = UI.slotSel < 2, slot = UI.slotSel, id = UI.shopSel, cap = CAP[r.mods.arms];
  const curW = isW ? (r.slots[slot] ? WEAPONS[r.slots[slot]].w : 0) : r.gear ? GEAR[r.gear].w : 0, nw = recWeight(r) - curW + it.w;
  if (!isW && it.need && !SAVE.done[it.need]) return { label: 'LOCKED // AFTER ' + missionOf(it.need).title.toUpperCase(), on: null };
  if ((isW && r.slots[slot] === id) || (!isW && r.gear === id)) return { label: 'EQUIPPED', on: null };
  if (isW && r.slots[1 - slot] === id) return { label: 'ALREADY IN SLOT ' + (2 - slot), on: null };
  if (nw > cap) return { label: 'TOO HEAVY // ' + nw + '/' + cap, on: null };
  const label = (it.cost ? 'BUY ' + fmt(it.cost) + ' CR' : 'TAKE') + ' // ' + (isW ? 'SLOT ' + (slot + 1) : 'GEAR');
  if (SAVE.cash < it.cost) return { label, on: null };
  return { label, on: () => {
    if (isW) {
      const old = r.slots[slot];
      SAVE.cash -= it.cost; if (old) { SAVE.cash += Math.floor(WEAPONS[old].cost * 0.5); delete r.ammo[old]; }
      r.slots[slot] = id; const fa = fullAmmo(id); if (fa) r.ammo[id] = fa;
    } else { SAVE.cash -= it.cost; if (r.gear) SAVE.cash += Math.floor(GEAR[r.gear].cost * 0.5); r.gear = id; r.charges = it.charges || 0; }
    store(); sfx('door', null, null, 0.5, 1.4); tStatus(r.name + ' // ' + it.name + (isW ? ' IN SLOT ' + (slot + 1) : ' FITTED'));
  } };
}
function drawGearTab(t: Term, c: Rect, r: any) {
  const cap = CAP[r.mods.arms], wt = recWeight(r), slot = UI.slotSel, sid = slot < 2 ? r.slots[slot] : r.gear;
  for (let i = 0; i < 3; i++) listRow(t, { x: c.x, y: c.y, w: c.w, h: 1 }, c.y + i, 'slot' + i, i === slot, (i < 2 ? 'SLOT ' + (i + 1) : 'GEAR  ').padEnd(8) + slotName(r, i), slotSub(r, i), !(i < 2 ? r.slots[i] : r.gear), 0, () => { UI.slotSel = i; UI.shopSel = null; ui(); });
  let y = c.y + 3;
  t.put(c.x + 2, y, 'CARRY', { b: 0.45 }); drawBar(t, c.x + 8, y, Math.min(22, c.w - 44), wt, cap, 0.85, wt >= cap ? 2 : 0); t.put(c.x + 9 + Math.min(22, c.w - 44), y, wt + '/' + cap, { b: 0.7 });
  const rc = sid ? (slot < 2 ? ammoCost(r, sid) : chargeCost(r)) : 0, sellV = sid ? Math.floor((slot < 2 ? WEAPONS[sid].cost : GEAR[sid].cost) * 0.5) : 0;
  let all = 0; for (const a of deployedAlive()) { for (const id of a.slots) if (id) all += ammoCost(a, id); all += chargeCost(a); }
  const acts: Line = [];
  if (sid && rc > 0) acts.push(btn('REFILL ' + fmt(rc), 'refill', SAVE.cash >= rc ? () => { SAVE.cash -= rc; if (slot < 2) refill(r, sid); else r.charges = GEAR[r.gear].charges; store(); ui(0.5); tStatus(r.name + ' // ' + (slot < 2 ? WEAPONS[sid].name + ' REFILLED' : 'DECK RECHARGED')); } : null), seg(' '));
  if (sid) acts.push(btn('REMOVE' + (sellV ? ' +' + fmt(sellV) : ''), 'sell', () => { SAVE.cash += sellV; if (slot < 2) { delete r.ammo[sid]; r.slots[slot] = null; } else { r.gear = null; r.charges = 0; } store(); ui(0.5); tStatus(r.name + ' // ITEM REMOVED' + (sellV ? ', ' + fmt(sellV) + ' CR BACK' : '')); }), seg(' '));
  acts.push(btn(all ? 'REFILL TEAM ' + fmt(all) : 'TEAM STOCKED', 'refillall', all && SAVE.cash >= all ? () => {
    for (const a of deployedAlive()) { for (const id of a.slots) if (id) { const k = ammoCost(a, id); if (k && SAVE.cash >= k) { SAVE.cash -= k; refill(a, id); } } const cc = chargeCost(a); if (cc && SAVE.cash >= cc) { SAVE.cash -= cc; a.charges = GEAR[a.gear].charges; } }
    store(); ui(0.6); tStatus('TEAM RESTOCKED');
  } : null));
  const aw = acts.reduce((n, s) => n + s.t.length, 0);
  drawLineAt(t, c.x + c.w - aw, y, acts);
  y += 2;
  const ids = shopIds(), it = shopItem(), lw = 28, list = { x: c.x, y, w: lw, h: c.h - 5 };
  ids.forEach((id, i) => {
    const x = slot < 2 ? WEAPONS[id] : GEAR[id], lk = slot >= 2 && x.need && !SAVE.done[x.need], eq = slot < 2 ? r.slots.includes(id) : r.gear === id;
    if (i < list.h) listRow(t, list, y + i, 'pick-' + id, id === UI.shopSel, x.name, eq ? 'EQUIPPED' : lk ? 'LOCKED' : x.cost ? fmt(x.cost) : 'FREE', !!lk, eq ? 2 : 0, () => { UI.shopSel = id; ui(); });
  });
  const dx = c.x + lw + 2, dw = c.w - lw - 2, icon = icons[UI.shopSel], statX = dx + Math.min(26, Math.floor(dw * 0.5));
  if (icon) drawArt(t, icon, { x: dx, y, w: Math.min(25, Math.floor(dw * 0.5) - 1), h: 5 }, 2, true);
  const stats: [string, number, number, string][] = slot >= 2 ? [['WEIGHT', it.w, 6, String(it.w)], ...(it.charges ? [['CHARGES', it.charges, 5, String(it.charges)], ['TRACE', it.trace, 1, Math.round(it.trace * 100) + '%']] as [string, number, number, string][] : [])]
    : it.kind === 'jack' ? [['RANGE', it.range, 28, it.range + 'M'], ['CHANNEL', 1, 2, it.chan + 'S'], ['NOISE', 1, 44, 'NONE'], ['WEIGHT', it.w, 6, String(it.w)]]
    : [['DAMAGE', it.dmg * (it.pellets || 1), 160, it.dmg + (it.pellets ? 'X' + it.pellets : '')], ['RANGE', it.range, 28, it.range + 'M'], ['RATE', it.rof, 15, it.rof + '/S'], ['NOISE', it.noise, 44, it.noise + 'M'], ['WEIGHT', it.w, 6, String(it.w)]];
  const barW = Math.max(4, c.x + c.w - statX - 14);
  stats.forEach(([k, v, m, s], i) => { t.put(statX, y + i, k, { b: 0.45 }); drawBar(t, statX + 8, y + i, barW, v, m, 0.85, 2); t.right(c.x + c.w, y + i, s, { b: 0.75 }); });
  const lines = [...wrapMark(it.desc, dw - 1, 0.75)];
  if (slot < 2 && it.kind !== 'jack') lines.push([seg(it.energy != null ? 'POWER CELL, ' + it.energy + '% PER SHOT, RECHARGES' : it.mag + ' ROUND MAG X ' + it.mags + ' // REFILL ' + fmt(it.ammo || 0) + ' CR', 0.42)]);
  drawLines(t, { x: dx, y: y + 6, w: dw - 1, h: Math.max(1, c.y + c.h - y - 8) }, lines, 'shop');
  const act = shopAction(r);
  drawLineAt(t, dx, c.y + c.h - 1, [btn(act.label, 'buy', act.on, true)]);
}
function buyMod(r: any, k: string) {
  const nv = r.mods[k] + 1;
  if (nv > 3 || (MOD_NEED[nv] && !SAVE.done[MOD_NEED[nv]]) || SAVE.cash < MOD_COST[nv]) return;
  SAVE.cash -= MOD_COST[nv]; r.mods[k] = nv; store(); sfx('zap', null, null, 0.6, 1.2); tStatus(r.name + ' // ' + k.toUpperCase() + ' V' + nv + ' INSTALLED');
}
/* What each version of a mod changes, for the detail pane. */
const MOD_STAT: Record<string, [string, (d: any) => string]> = {
  arms: ['CARRY', (d) => String(d.cap)],
  legs: ['SPEED', (d) => Math.round(d.speed * 100) + '%'],
  chest: ['DAMAGE TAKEN', (d) => Math.round(d.armor * 100) + '%'],
  eyes: ['RANGE', (d) => Math.round(d.range * 100) + '%'],
  heart: ['HEALING', (d) => (d.regen ? '+' + (d.regen * 100).toFixed(1) + '%/S' : 'NONE')],
  brain: ['HACK SPEED', (d) => Math.round(d.hack * 100) + '%'],
};
const modAt = (k: string, v: number) => derive({ arms: 0, legs: 0, chest: 0, eyes: 0, heart: 0, brain: 0, [k]: v });
function modAction(r: any, k: string): { label: string; on: (() => void) | null } {
  const nv = r.mods[k] + 1;
  if (nv > 3) return { label: 'FULLY UPGRADED', on: null };
  if (MOD_NEED[nv] && !SAVE.done[MOD_NEED[nv]]) return { label: 'V' + nv + ' LOCKED // AFTER ' + missionOf(MOD_NEED[nv]).title.toUpperCase(), on: null };
  const label = 'INSTALL V' + nv + ' // ' + fmt(MOD_COST[nv]) + ' CR';
  return { label, on: SAVE.cash >= MOD_COST[nv] ? () => buyMod(r, k) : null };
}
function drawModsTab(t: Term, c: Rect, r: any) {
  const lw = 20, list = { x: c.x, y: c.y, w: lw, h: c.h };
  MOD_ORDER.forEach((k, i) => {
    const v = r.mods[k];
    listRow(t, list, c.y + i * 2, 'mod-' + k, UI.modSel === i, k.toUpperCase(), [1, 2, 3].map((n) => (v >= n ? '■' : '□')).join(''), false, v ? 2 : 0, () => { UI.modSel = i; ui(); });
  });
  const k = MOD_ORDER[UI.modSel], dx = c.x + lw + 3, dw = c.w - lw - 3, [stat, val] = MOD_STAT[k], cur = r.mods[k];
  t.put(dx, c.y, k.toUpperCase(), { b: 1, hue: 2 });
  const blurb = wrapMark(MOD_TXT[k].split('. ')[0] + '.', dw - 1, 0.75);
  blurb.forEach((l, i) => drawLineAt(t, dx, c.y + 1 + i, l));
  const ty = c.y + 2 + blurb.length;
  t.put(dx + 9, ty, stat, { b: 0.45 });
  for (let v = 0; v <= 3; v++) {
    const y = ty + 1 + v, on = v === cur, have = v <= cur, locked = v > 0 && MOD_NEED[v] && !SAVE.done[MOD_NEED[v]];
    const b = on ? 1 : have ? 0.55 : locked ? 0.3 : 0.75, hue: Hue = on ? 2 : 0;
    t.put(dx, y, on ? '>' : ' ', { b: 1, hue: 2 });
    t.put(dx + 2, y, v ? 'V' + v : '--', { b, hue });
    t.put(dx + 9, y, val(modAt(k, v)), { b, hue });
    t.right(dx + dw, y, on ? 'INSTALLED' : have ? '' : locked ? 'LOCKED' : fmt(MOD_COST[v]) + ' CR', { b, hue });
  }
  const a = modAction(r, k);
  drawLineAt(t, dx, c.y + c.h - 1, [btn(a.label, 'install', a.on, true)]);
}
function stepLook(r: any, key: string, d: number) {
  lookOf(r);
  if (key === 'scar') r.look.scar = !r.look.scar;
  else { const a = LOOK_OPTS[key] as readonly (string | number)[]; r.look[key] = a[(a.indexOf(r.look[key]) + d + a.length) % a.length]; }
  store(); ui(0.3, 1.2);
}
function drawLookTab(t: Term, c: Rect, r: any) {
  lookOf(r);
  LOOK_ROWS.forEach((key, i) => {
    const y = c.y + i, on = UI.lookSel === i, v = key === 'scar' ? (r.look.scar ? 'YES' : 'NO') : String(r.look[key]).toUpperCase();
    t.region({ x: c.x, y, w: c.w, h: 1 }, 'lookrow-' + key, () => { UI.lookSel = i; });
    t.put(c.x, y, on ? '>' : ' ', { b: 1, hue: 2 });
    t.put(c.x + 2, y, key.toUpperCase().padEnd(8), { b: on ? 1 : 0.5 });
    t.button(c.x + 11, y, ' < ', 'look-' + key, () => { UI.lookSel = i; stepLook(r, key, -1); }, { b: 0.75 });
    t.put(c.x + 15, y, v.padEnd(8), { b: 0.95, hue: on ? 2 : 0 });
    t.button(c.x + 24, y, ' > ', 'look+' + key, () => { UI.lookSel = i; stepLook(r, key, 1); }, { b: 0.75 });
  });
}
function drawSquad(t: Term, c: Rect) {
  const rw = 28, fw = 28, r = selectedRec(), sh = 9;
  drawRoster(t, { x: c.x, y: c.y, w: rw, h: c.h - sh });
  if (!r || !r.alive) return;
  drawStats(t, { x: c.x, y: c.y + c.h - sh, w: rw, h: sh }, r);
  drawFigure(t, { x: c.x + rw, y: c.y, w: fw, h: c.h }, r);
  const P = { x: c.x + rw + fw, y: c.y, w: c.w - rw - fw, h: c.h }, ir = inner(P);
  t.box(P, 'AGENT FILE');
  let x = ir.x;
  for (const [id, label] of [['gear', 'LOADOUT'], ['mods', 'CYBORG MODS'], ['look', 'LOOK']]) x += t.button(x, ir.y, ' ' + label + ' ', 'tab-' + id, () => { UI.sqTab = id; ui(0.4, 1.2); }, { inv: UI.sqTab === id, b: UI.sqTab === id ? 1 : 0.7 }) + 1;
  const body = { x: ir.x, y: ir.y + 2, w: ir.w, h: ir.h - 2 };
  if (UI.sqTab === 'gear') drawGearTab(t, body, r);
  else if (UI.sqTab === 'mods') drawModsTab(t, body, r);
  else drawLookTab(t, body, r);
}

/* ---------------------------------------------------------------- research */
function researchState() { return SAVE.res || (SAVE.res = { done: {}, active: null, left: 0 }); }
function researchAction(x): { label: string; on: (() => void) | null } {
  const R0 = researchState();
  if (R0.done[x.id]) return { label: 'COMPLETE', on: null };
  if (R0.active === x.id) return { label: 'IN PROGRESS', on: null };
  if (x.need && !SAVE.done[x.need]) return { label: 'LOCKED // ' + missionOf(x.need).title.toUpperCase(), on: null };
  const label = 'FUND ' + fmt(x.cost) + ' CR';
  return { label, on: R0.active || SAVE.cash < x.cost ? null : () => { SAVE.cash -= x.cost; R0.active = x.id; R0.left = x.jobs; store(); sfx('zap', null, null, 0.6, 1.2); tStatus('RESEARCH FUNDED // ' + x.name.toUpperCase()); } };
}
function drawResearch(t: Term, c: Rect) {
  const lw = Math.min(46, Math.floor(c.w * 0.36)), L = { x: c.x, y: c.y, w: lw, h: c.h }, D = { x: c.x + lw, y: c.y, w: c.w - lw, h: c.h }, R0 = researchState();
  UI.resSel = clamp(UI.resSel, 0, RESEARCH.length - 1);
  t.box(L, 'PROJECTS');
  const lr = inner(L);
  RESEARCH.forEach((x, i) => {
    const lk = x.need && !SAVE.done[x.need], done = R0.done[x.id], on = R0.active === x.id;
    listRow(t, lr, lr.y + i, 'res-' + x.id, i === UI.resSel, x.name.toUpperCase(), done ? 'DONE' : on ? 'ACTIVE' : lk ? 'LOCKED' : fmt(x.cost), !!lk, on ? 2 : 0, () => { UI.resSel = i; ui(); });
  });
  const act0 = RESEARCH.find((x) => x.id === R0.active);
  if (act0) {
    const y = lr.y + lr.h - 2;
    t.put(lr.x, y, act0.name.toUpperCase(), { b: 0.9, hue: 2 }); t.right(lr.x + lr.w, y, R0.left + ' TO GO', { b: 0.55 });
    drawBar(t, lr.x, y + 1, lr.w, act0.jobs - R0.left, act0.jobs, 0.85, 2);
  }
  const x = RESEARCH[UI.resSel];
  t.box(D, x.name.toUpperCase());
  const ir = inner(D), icon = icons[x.icon];
  if (icon) drawArt(t, icon, { x: ir.x, y: ir.y, w: Math.min(40, ir.w), h: 9 }, 2, true);
  const lines = [...wrapMark(x.desc, ir.w - 1, 0.8), [], [seg('TAKES ' + x.jobs + ' CONTRACT' + (x.jobs > 1 ? 'S' : ''), 0.45)]];
  drawLines(t, { x: ir.x, y: ir.y + 10, w: ir.w - 1, h: Math.max(1, ir.h - 12) }, lines, 'res');
  const a = researchAction(x);
  drawLineAt(t, ir.x, ir.y + ir.h - 1, [btn(a.label, 'fund', a.on, true)]);
}

/* ---------------------------------------------------------------- system */
function logOut() { store(); ui(); UI.fileSel = saveFile; UI.glide = false; go('select'); }
function wipeCampaign() {
  if (!UI.wipeArm) { UI.wipeArm = 1; return; }
  setSAVE(freshSave()); store(); planDefReset(); tStatus('NEW CAMPAIGN STARTED', 'warn'); openPage('contracts');
}
function drawSystem(t: Term, c: Rect) {
  const lw = Math.min(46, Math.floor(c.w * 0.36)), L = { x: c.x, y: c.y, w: lw, h: c.h }, D = { x: c.x + lw, y: c.y, w: c.w - lw, h: c.h };
  t.box(L, 'SETTINGS');
  const ir = inner(L), PH = Object.keys(PALETTES);
  const row = (i: number, label: string, value: string, on: () => void, id: string) => { t.put(ir.x, ir.y + i, label, { b: 0.5 }); t.button(ir.x + 13, ir.y + i, ' ' + value + ' ', id, on, { b: 0.85 }); };
  row(0, 'SOUND', AU.on ? 'ON' : 'OFF', () => { setSound(!AU.on); if (AU.on) playMusic('theme', 1.5); }, 'set-sound');
  row(1, 'PHOSPHOR', prefs.phosphor.toUpperCase(), () => { prefs.phosphor = PH[(PH.indexOf(prefs.phosphor) + 1) % PH.length]; applyPhosphor(); savePrefs(); ui(); }, 'set-phosphor');
  row(2, 'CRT', Math.round(prefs.crt * 100) + '%', () => { prefs.crt = prefs.crt >= 0.6 ? 0 : Math.round((prefs.crt + 0.15) * 100) / 100; savePrefs(); ui(); }, 'set-crt');
  row(3, 'FIELD TIPS', SAVE.tipsOn === false ? 'OFF' : 'ON', () => { SAVE.tipsOn = SAVE.tipsOn === false; store(); ui(); }, 'set-tips');
  drawLineAt(t, ir.x, ir.y + 5, [btn('REPLAY TIPS', 'set-tipr', () => { SAVE.tips = {}; SAVE.tipsOn = true; store(); tStatus('FIELD TIPS WILL SHOW AGAIN'); })]);
  drawLineAt(t, ir.x, ir.y + 6, [btn('COMBAT SIMULATOR', 'set-sim', openCombatSim)]);
  drawLineAt(t, ir.x, ir.y + ir.h - 3, [btn('LOG OUT', 'logout', logOut)]);
  drawLineAt(t, ir.x, ir.y + ir.h - 1, [UI.wipeArm ? { ...btn('CLICK AGAIN TO WIPE ' + FILE_NAMES[saveFile], 'wipe', wipeCampaign), s: { b: 1, hue: 1, inv: true } } : btn('NEW CAMPAIGN', 'wipe', wipeCampaign)]);
  t.box(D, 'FIELD MANUAL');
  const mr = inner(D), lines: Line[] = [];
  for (const [k, v] of MANUAL) wrapMark(v, mr.w - 12, 0.72).forEach((l, i) => lines.push([{ ...seg(i ? '' : k, 0.95, 2), x: 0 }, { t: '', x: 10 }, ...l]));
  drawLines(t, { x: mr.x, y: mr.y, w: mr.w - 1, h: mr.h }, lines, 'man');
}

/* ---------------------------------------------------------------- debrief */
function drawDebrief(t: Term, c: Rect) {
  const D = DEBRIEF; if (!D) { openPage('contracts'); return; }
  const win = D.res === 'win', mid = Math.floor(c.w / 2), A = { x: c.x, y: c.y, w: mid, h: c.h }, B = { x: c.x + mid, y: c.y, w: c.w - mid, h: c.h };
  t.box(A, D.title.toUpperCase(), { b: 0.6, hue: win ? 2 : 1 });
  const a = inner(A);
  t.put(a.x, a.y, D.sub.toUpperCase(), { b: 0.5 });
  D.rows.forEach((x, i) => { t.put(a.x, a.y + 2 + i, String(x[0]).toUpperCase(), { b: 0.5 }); t.right(a.x + a.w, a.y + 2 + i, String(x[1]), { b: 0.9 }); });
  t.box(B, 'LEDGER');
  const b = inner(B), lines: Line[] = [];
  const amt = (v: number, unit = '') => (v > 0 ? '+' : '') + fmt(v) + unit;
  const row = (k: string, v: string, neg = false, br = 0.85) => { const room = b.w - v.length - 1, ws = wrapMark(k.toUpperCase(), room, 0.6); ws.forEach((l, i) => lines.push(i === ws.length - 1 ? [...l, { ...seg(v, br, neg ? 1 : 0), x: b.w - v.length - 1 }] : l)); };
  for (const x of D.ledger) row(String(x[0]), x[1] ? amt(x[1]) : '', x[1] < 0);
  lines.push([]);
  row('NET', amt(D.total, ' CR'), D.total < 0, 1);
  row('ACCOUNT', fmt(SAVE.cash) + ' CR', false, 1);
  lines.push([], ...wrapMark(D.text, b.w - 1, 0.75));
  drawLines(t, { x: b.x, y: b.y, w: b.w - 1, h: b.h - 2 }, lines, 'deb');
  drawLineAt(t, b.x, b.y + b.h - 1, [btn('CONTINUE', 'continue', continueDebrief, true)]);
}
function continueDebrief() { DEBRIEF = null; ui(); openPage('contracts'); }

/* ---------------------------------------------------------------- the frame */
function draw(t: Term, now: number) {
  t.palette = PALETTES[prefs.phosphor] || PALETTES.teal; t.crt = prefs.crt; t.glitch = 0;
  t.power = REDUCED ? 1 : Math.min(1, (now - UI.powerT) / 450);
  if (UI.screen === 'title') return drawTitle(t, now);
  if (UI.screen === 'login') return drawLogin(t, now);
  if (UI.screen === 'select') return drawSelect(t, now);
  drawChrome(t, now);
  const c = contentRect(t);
  ({ contracts: drawContracts, territory: drawTerritory, squad: drawSquad, research: drawResearch, system: drawSystem, debrief: drawDebrief })[UI.page](t, c);
}
export const term = new Term($('#glass'), $('#crt'), draw);
term.onPress = wake;
applyPhosphor();

export function showTerminal(p) {
  $('#hud').hidden = true;
  const was = $('#termS').hidden;
  $('#termS').hidden = false;
  if (was) { term.resize(); UI.powerT = performance.now(); }
  UI.screen = 'page';
  if (planDef && lockedM(planDef)) planDef = null;
  openPage(p || UI.page);
  playMusic('theme', 1.5);
}
export function openPage(p) {
  if (UI.page !== p) UI.wipeArm = 0;
  UI.page = p; UI.cmd = '';
}
/* Skips straight to the file select. */
export function skipBoot() { UI.glide = false; go('select'); }
export const termShown = () => !$('#termS').hidden;
export { UI as termUI };

/* ---------------------------------------------------------------- keyboard and commands */
const HELP = 'CONTRACTS TERRITORY SQUAD RESEARCH SYSTEM // SELECT DEPLOY MARK BUY GEAR MODS LOOK REFILL SOUND LOGOUT';
function primaryAction() {
  if (UI.page === 'debrief') return continueDebrief();
  if (UI.page === 'contracts') { const a = contractAction(currentContract()); if (a) a(); return; }
  if (UI.page === 'research') { const a = researchAction(RESEARCH[UI.resSel]); if (a.on) a.on(); return; }
  if (UI.page === 'squad') {
    const r = selectedRec(); if (!r) return;
    if (UI.sqTab === 'gear') { const a = shopAction(r); if (a.on) a.on(); }
    else if (UI.sqTab === 'mods') { const a = modAction(r, MOD_ORDER[UI.modSel]); if (a.on) a.on(); }
  }
}
function moveList(d: number) {
  if (UI.page === 'contracts') { const i = MISSIONS.indexOf(currentContract()); UI.conSel = MISSIONS[clamp(i + d, 0, MISSIONS.length - 1)]; UI.scroll.con = 0; }
  else if (UI.page === 'territory') UI.terrSel = Math.max(0, UI.terrSel + d);
  else if (UI.page === 'research') UI.resSel = clamp(UI.resSel + d, 0, RESEARCH.length - 1);
  else if (UI.page === 'squad') {
    if (UI.sqTab === 'gear') { const ids = shopIds(); shopItem(); UI.shopSel = ids[clamp(ids.indexOf(UI.shopSel) + d, 0, ids.length - 1)]; }
    else if (UI.sqTab === 'mods') UI.modSel = clamp(UI.modSel + d, 0, MOD_ORDER.length - 1);
    else UI.lookSel = clamp(UI.lookSel + d, 0, LOOK_ROWS.length - 1);
  }
}
function moveSide(d: number) {
  if (UI.page === 'territory') { const id = Object.keys(TERR).filter((k) => terrOf(k))[UI.terrSel], T = id && terrOf(id); if (T && !T.revolt) { T.tax = clamp(T.tax + d * 5, 0, 60); store(); ui(0.4, 1.2); } return; }
  if (UI.page !== 'squad') return;
  if (UI.sqTab === 'look') { const r = selectedRec(); if (r) stepLook(r, LOOK_ROWS[UI.lookSel], d); return; }
  const a = aliveIdx(); if (!a.length) return;
  UI.armSel = a[(a.indexOf(UI.armSel) + d + a.length) % a.length]; UI.shopSel = null;
}
function runCommand(raw: string) {
  const [c, arg] = raw.trim().toLowerCase().split(/\s+/);
  if (!c) return;
  UI.msg = ''; UI.msgHue = 0;
  if (UI.page === 'debrief') { if (c === 'continue') continueDebrief(); return; }
  const agent = SAVE.agents.findIndex((a) => a.alive && a.name.toLowerCase() === (c === 'mark' ? arg : c));
  if (PAGES.includes(c)) { ui(0.4, 1.4); openPage(c); }
  else if (c === 'mark' && agent >= 0) { toggleDeploy(agent); openPage('squad'); }
  else if (agent >= 0) { UI.armSel = agent; UI.shopSel = null; openPage('squad'); }
  else if (c === 'deploy') deploy();
  else if (c === 'select' || c === 'pick' || c === 'buy' || c === 'fund') primaryAction();
  else if (c === 'gear' || c === 'loadout' || c === 'mods' || c === 'look') { UI.sqTab = c === 'loadout' ? 'gear' : c; openPage('squad'); }
  else if (c === 'refill') term.click('refillall');
  else if (c === 'recruit') { openPage('squad'); recruit(); }
  else if (c === 'sound') { setSound(!AU.on); if (AU.on) playMusic('theme', 1.5); tStatus('SOUND ' + (AU.on ? 'ON' : 'OFF')); }
  else if (c === 'phosphor' && PALETTES[arg]) { prefs.phosphor = arg; applyPhosphor(); savePrefs(); }
  else if (c === 'logout') logOut();
  else if (c === 'sim') openCombatSim();
  else if (c === 'help') tStatus(HELP);
  else tStatus('UNKNOWN COMMAND: ' + c.toUpperCase() + ' // TRY HELP', 'bad');
}
window.addEventListener('keydown', (e) => {
  if (!termShown() || e.metaKey || e.ctrlKey || e.altKey) return;
  if ($('#simTool') && !$('#simTool').hidden) return;
  wake();
  if (UI.screen === 'title') { advanceTitle(); return; }
  if (UI.screen === 'login') { finishLogin(); return; }
  if (UI.screen === 'select') {
    if (/^[1-3]$/.test(e.key)) enterFile(+e.key - 1);
    else if (e.key === 'ArrowDown') UI.fileSel = Math.min(SAVE_FILES - 1, UI.fileSel + 1);
    else if (e.key === 'ArrowUp') UI.fileSel = Math.max(0, UI.fileSel - 1);
    else if (e.key === 'Enter') enterFile(UI.fileSel);
    return;
  }
  const locked = UI.page === 'debrief', scrollKey = { contracts: 'con', territory: 'terr', squad: 'shop', research: 'res', system: 'man', debrief: 'deb' }[UI.page];
  if (e.key === 'Enter') { const c = UI.cmd; UI.cmd = ''; if (c.trim()) runCommand(c); else primaryAction(); return; }
  if (e.key === 'Backspace') { UI.cmd = UI.cmd.slice(0, -1); return; }
  if (e.key === 'Escape') { UI.cmd = ''; return; }
  if (e.key === 'PageDown' || e.key === 'PageUp') { UI.scroll[scrollKey] = Math.max(0, (UI.scroll[scrollKey] || 0) + (e.key === 'PageDown' ? 6 : -6)); return; }
  if (e.key === 'Tab') { e.preventDefault(); if (UI.page === 'squad') { const tabs = ['gear', 'mods', 'look']; UI.sqTab = tabs[(tabs.indexOf(UI.sqTab) + (e.shiftKey ? 2 : 1)) % 3]; ui(0.4, 1.2); } return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); moveList(e.key === 'ArrowDown' ? 1 : -1); return; }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { moveSide(e.key === 'ArrowRight' ? 1 : -1); return; }
  if (locked) return;
  if (!UI.cmd && /^[1-5]$/.test(e.key)) { ui(0.4, 1.4); openPage(PAGES[+e.key - 1]); return; }
  if (e.key === ' ' && !UI.cmd) { e.preventDefault(); if (UI.page === 'squad' && selectedRec()) toggleDeploy(UI.armSel); return; }
  if (e.key.length === 1 && UI.cmd.length < 60) UI.cmd += e.key;
});
