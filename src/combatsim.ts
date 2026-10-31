// Combat simulator: real fights through the game's own step(), thousands at a time, to measure what a loadout can
// handle. Nothing is modelled separately, so balance changes show up here automatically. A small bot plays the squad,
// so results sit below what a good player manages: it never uses stealth, hacks, cover or the pause.
// Opened from the terminal with the `sim` command. From a shell: npm run combat. It never touches the save.
import { $, K, Rpick, Rr } from './core';
import { G, blockCells, cellOk } from './world_head';
import { addLight, solid } from './city_fns';
import { defineLevel } from './layout';
import { loadWorld } from './world_load';
import { camT, nearestOpen } from './engine';
import { CAP, GEAR, MOD_COST, MOD_ORDER, SAVE, WEAPONS, derive, fullAmmo } from './campaign';
import { agents, clearMission, makeAgent, militia, mkPerson, people, pickups, setAgents, setMS, setSelected, setState, state, stats, time, turrets } from './setup';
import { setQuietLog } from './sim';
import { setupAttract } from './flow';


export interface AgentSpec { w1: string; w2: string | null; gear: string | null; mods: Record<string, number> }
export interface FightCfg { squad: AgentSpec[]; enemy: string; count: number; layout: string; light: string; dist: number; alert: boolean; push: boolean }
export interface BatchResult { runs: number; wins: number; winPct: number; margin: number; timeouts: number; time: number; lost: number; hp: number; shots: number; ms: number }

const mods = (arms = 0, legs = 0, chest = 0, eyes = 0, heart = 0, brain = 0) => ({ arms, legs, chest, eyes, heart, brain });
const agent = (w1: string, w2: string | null, m: Record<string, number> = mods(), gear: string | null = null): AgentSpec => ({ w1, w2, gear, mods: m });
const four = (a: AgentSpec, b = a, c = a, d = a) => [a, b, c, d];

/* Squads you might plausibly field at each stage of the campaign. See docs/GAME_PLAN.md. */
export const SQUADS: { id: string; name: string; agents: AgentSpec[] }[] = [
  { id: 'starter', name: 'Starter: pistols', agents: four(agent('pistol', null)) },
  { id: 'act1', name: 'Act 1: uzis and a rifle', agents: four(agent('uzi', 'pistol'), agent('uzi', 'pistol'), agent('shotgun', 'pistol'), agent('rifle', 'pistol')) },
  { id: 'act1b', name: 'Act 1 end: first mods', agents: four(agent('uzi', 'pistol', mods(1, 0, 1)), agent('uzi', 'pistol', mods(1, 0, 1)), agent('shotgun', 'uzi', mods(1, 1, 1)), agent('rifle', 'uzi', mods(1, 0, 1, 1))) },
  { id: 'act2', name: 'Act 2: launcher and V1 mods', agents: four(agent('launcher', 'uzi', mods(1, 1, 1, 1)), agent('uzi', 'shotgun', mods(1, 1, 1, 1), 'medikit'), agent('rifle', 'uzi', mods(1, 1, 1, 1)), agent('flamer', 'uzi', mods(1, 1, 1, 1))) },
  { id: 'act3', name: 'Act 3: lasers and V2 mods', agents: four(agent('laser', 'uzi', mods(2, 2, 2, 2, 1, 1), 'medikit'), agent('laser', 'launcher', mods(2, 2, 2, 2, 1, 1)), agent('minigun', 'shotgun', mods(2, 1, 2, 1, 1, 1)), agent('rifle', 'launcher', mods(2, 2, 2, 2, 1, 1))) },
  { id: 'late', name: 'Late: V3 specialists', agents: four(agent('minigun', 'launcher', mods(3, 2, 3, 2, 2, 1), 'medikit'), agent('laser', 'launcher', mods(3, 3, 3, 3, 2, 1), 'medikit'), agent('laser', 'minigun', mods(3, 3, 3, 3, 2, 1)), agent('rifle', 'laser', mods(3, 3, 3, 3, 2, 1))) },
];
/* Enemy mixes from the real contracts. A count larger than the list cycles through it. */
export const ENEMIES: { id: string; name: string; units: string[] }[] = [
  { id: 'militia', name: 'Militia', units: ['militia:pistol', 'militia:pistol', 'militia:shotgun', 'militia:uzi', 'militia:pistol', 'militia:rifle'] },
  { id: 'police', name: 'Police', units: ['cop:pistol', 'cop:pistol', 'cop:shotgun'] },
  { id: 'gang', name: 'Gang crew', units: ['gang:uzi', 'gang:shotgun', 'gang:flamer', 'gang:uzi'] },
  { id: 'corp', name: 'Meridian security', units: ['corp:corprifle'] },
  { id: 'turret', name: 'Sentry turrets', units: ['turret:turret'] },
];

/* ---------------------------------------------------------------- the arena */
const AX0 = 66, AX1 = 160, CX = 113, CZ = 113;
let arena = { layout: 'open', light: 'lit' };
function genArena() {
  const ext = 300;
  G.quad([-ext, 0, 226 + ext], [226 + ext, 0, 226 + ext], [226 + ext, 0, -ext], [-ext, 0, -ext], [0, 1, 0], [0.42, 0.42, 0.44], [K.DIRT, 0, 0, 0]);
  const wall = (x0: number, z0: number, x1: number, z1: number, h: number) => { solid(x0, 0, z0, x1, h, z1, [0.2, 0.21, 0.24], [K.BASIC, 0, 0, 0]); blockCells(x0, z0, x1, z1, false); };
  if (arena.layout === 'cover') {
    // scattered walls, about shoulder high: breaks up lines of fire without funnelling anybody
    for (let z = 76; z < 152; z += 15) for (let x = 72; x < 156; x += 16) {
      const hx = ((x * 7 + z * 13) % 5) - 2, hz = ((x * 11 + z * 3) % 5) - 2, flat = (x + z) % 2 === 0;
      wall(x + hx, z + hz, x + hx + (flat ? 6 : 1.4), z + hz + (flat ? 1.4 : 6), 1.6);
    }
  } else if (arena.layout === 'street') {
    // a street with side alleys: long sightlines down the middle, ambushes from the sides
    for (let z = 70; z < 156; z += 22) { wall(82, z, 103, z + 16, 8); wall(123, z, 144, z + 16, 8); }
  }
  if (arena.light === 'lit') for (let z = 72; z < 158; z += 16) for (let x = 72; x < 158; x += 16) addLight(x, 7, z, 14, [1, 0.95, 0.85], 'lamp');
}
defineLevel('arena', { kind: 'arena', name: 'Arena', bounds: [AX0, AX0, AX1, AX1], police: false, custom: genArena });

let simStep: (dt: number) => void = () => {};
export function setCombatStep(fn: (dt: number) => void) { simStep = fn; }
let open = false, prevState = 'boot', loadedKey = '';
function enter() { if (open) return; open = true; prevState = state; setState('sim'); setQuietLog(true); loadedKey = ''; }
function leave() {
  if (!open) return; open = false;
  clearMission(); setAgents([]); setupAttract(); setState(prevState); setQuietLog(false);
}
function loadArena(cfg: FightCfg) {
  const key = cfg.layout + '|' + cfg.light;
  if (key === loadedKey) return;
  arena = { layout: cfg.layout, light: cfg.light };
  loadWorld('arena', 'clear'); loadedKey = key;
}

const GANG = [[0.35, 0.1, 0.1], [0.2, 0.25, 0.1], [0.1, 0.15, 0.3], [0.3, 0.2, 0.05]];
function spawnEnemy(spec: string, x0: number, z0: number, alert: boolean) {
  // never inside a wall, where nobody could reach them and the fight could only time out
  const [x, z] = nearestOpen(x0, z0, 8) || [x0, z0], [kind, weapon] = spec.split(':'), w = WEAPONS[weapon] as any, tx = CX, tz = z + 40;
  const o: any = alert ? { alerted: true, state: 'hunt', lastKnown: [tx, tz] } : { postYaw: Math.PI, yaw: Math.PI };
  if (kind === 'turret') {
    // turrets don't come to you, so one hard against a wall can't be reached and only measures bad placement
    let tx2 = x0, tz2 = z0;
    for (let tries = 0; tries < 40; tries++) {
      let clear = true;
      for (let j = -3; j <= 3 && clear; j++) for (let i = -3; i <= 3; i++) if (!cellOk(tx2 + i, tz2 + j)) { clear = false; break; }
      if (clear) break;
      tx2 = x0 + Rr(-8, 8); tz2 = z0 + Rr(-8, 8);
    }
    turrets.push({ x: tx2, z: tz2, yaw: 0, hp: 160, maxHp: 160, dead: false, friendly: 0, cd: 0, flash: 0, kind: 'turret', alerted: true, fac: 'corp' }); return;
  }
  if (kind === 'militia') militia(x, z, weapon, o);
  else if (kind === 'gang') militia(x, z, weapon, { color: Rpick(GANG), rim: [1, 0.55, 0.15], coat: 1, ...o });
  else if (kind === 'cop') mkPerson({ kind: 'cop', fac: 'law', x, z, speed: 1.4, hp: 70, maxHp: 70, color: [0.06, 0.09, 0.22], rim: [0.2, 0.45, 1], coat: 1, armed: 1, weapon, mag: w.mag || 12, state: 'post', ...o });
  else mkPerson({ kind: 'corp', fac: 'corp', x, z, hp: 180, maxHp: 180, color: [0.55, 0.55, 0.6], skin: [0.2, 0.2, 0.22], rim: [1, 0.3, 0.55], coat: 2, armed: 1, weapon: 'corprifle', mag: 99, scale: 1.08, state: 'post', ...o });
}
function setupFight(cfg: FightCfg) {
  clearMission();
  setMS({ def: null, objs: [{ id: 'kill', st: 'open' }], captured: [], ledger: [], alarm: 2 });
  const units = ENEMIES.find((e) => e.id === cfg.enemy)!.units;
  const zS = CZ + cfg.dist / 2, zE = CZ - cfg.dist / 2;
  setAgents(cfg.squad.map((s, i) => {
    const slots = [s.w1, s.w2], ammo: any = {};
    for (const id of slots) if (id) { const a = fullAmmo(id); if (a) ammo[id] = a; }
    const rec = { name: 'SIM ' + (i + 1), sex: i % 2 ? 'f' : 'm', mods: s.mods, slots, gear: s.gear, ammo, charges: 0 };
    return makeAgent(rec, i, CX - 2 + (i % 2) * 4, zS + Math.floor(i / 2) * 2, Math.PI);
  }));
  setSelected(new Set(agents));
  for (let i = 0; i < cfg.count; i++) {
    const across = Math.ceil(Math.sqrt(cfg.count * 2)), col = i % across, row = Math.floor(i / across);
    spawnEnemy(units[i % units.length], CX + (col - (across - 1) / 2) * 3 + Rr(-0.4, 0.4), zE - row * 3, cfg.alert);
  }
}
const liveEnemies = () => people.filter((p) => !p.dead && p.fac !== 'player' && p.fac !== 'civ' && p.fac !== 'follower');
const enemiesLeft = () => liveEnemies().length + turrets.filter((t) => !t.dead).length;

/* ---------------------------------------------------------------- the squad bot */
function weaponValue(a: any, id: string | null, dist: number) {
  if (!id) return -1;
  const w = WEAPONS[id] as any;
  if (w.kind === 'jack') return -1;
  if (w.energy != null ? a.cell < w.energy : !(a.ammo[id] && a.ammo[id].mag + a.ammo[id].res > 0)) return -1;
  if (w.kind === 'rocket' && dist < 7) return 0;
  const reach = w.range * a.d.range;
  return w.dmg * (w.pellets || 1) * w.rof * (dist <= reach ? 1 : 0.25);
}
function botThink(cfg: FightCfg) {
  const foes: any[] = [...liveEnemies(), ...turrets.filter((t) => !t.dead)];
  for (const a of agents) {
    if (a.dead) continue;
    if (a.gear === 'medikit' && !a.gearUsed && a.hp < a.maxHp * 0.45) { a.gearUsed = true; a.healT = 2; }
    let near = null, nd = 1e9;
    for (const f of foes) { const d = Math.hypot(f.x - a.x, f.z - a.z); if (d < nd) { nd = d; near = f; } }
    if (!near) continue;
    const best = weaponValue(a, a.slots[1], nd) > weaponValue(a, a.slots[0], nd) ? 1 : 0;
    if (best !== a.cur && a.slots[best] && (a.swapT || 0) < time) { a.cur = best; a.reloadT = 0; a.swapT = time + 1; }
    const inReach = nd <= (WEAPONS[a.slots[a.cur]]?.range || 8) * a.d.range;
    // pushing chases the nearest enemy; holding only shoots what comes into reach
    a.ftarget = cfg.push || inReach ? near : null;
    if (a.ftarget && !cfg.push) a.path = null;
    if (cfg.push && !a.path && !inReach) a.run = true;
  }
}

const DT = 1 / 30, LIMIT = 180;
function runFight(cfg: FightCfg) {
  setupFight(cfg);
  let t = 0, think = 0;
  while (t < LIMIT) {
    pickups.length = 0; // no looting: nothing a fight drops should reach the real armoury
    if (t >= think) { botThink(cfg); think = t + 0.25; }
    simStep(DT); t += DT;
    if (!enemiesLeft() || agents.every((a) => a.dead)) break;
  }
  const alive = agents.filter((a) => !a.dead);
  return { win: !enemiesLeft() && alive.length > 0, timeout: t >= LIMIT, t, lost: agents.length - alive.length, hp: alive.reduce((s, a) => s + a.hp / a.maxHp, 0) / agents.length, shots: stats.shots };
}

const breathe = () => new Promise<void>((r) => setTimeout(r, 0));
/** Runs a batch of fights. Keeps the page alive between slices; pass onProgress to follow along. */
export async function runBatch(cfg: FightCfg, runs: number, onProgress?: (done: number) => void): Promise<BatchResult> {
  const self = !open; if (self) enter();
  loadArena(cfg);
  const t0 = performance.now(); let wins = 0, timeouts = 0, tt = 0, lost = 0, hp = 0, shots = 0, slice = t0;
  for (let i = 0; i < runs; i++) {
    const r = runFight(cfg);
    if (r.win) wins++; if (r.timeout) timeouts++;
    tt += r.t; lost += r.lost; hp += r.hp; shots += r.shots;
    if (performance.now() - slice > 40) { if (onProgress) onProgress(i + 1); await breathe(); slice = performance.now(); }
  }
  const p = wins / runs;
  const res = { runs, wins, winPct: Math.round(p * 100), margin: Math.round(196 * Math.sqrt((p * (1 - p)) / runs)), timeouts, time: Math.round(tt / runs), lost: +(lost / runs).toFixed(2), hp: Math.round((hp / runs) * 100), shots: Math.round(shots / runs), ms: Math.round(performance.now() - t0) };
  if (self) leave();
  return res;
}
/** The most enemies this squad reliably beats (at least 80% of fights). */
export async function findLimit(cfg: FightCfg, runs = 100, onProgress?: (n: number) => void) {
  const self = !open; if (self) enter();
  const beats = async (n: number) => { if (onProgress) onProgress(n); return (await runBatch({ ...cfg, count: n }, runs)).winPct >= 80; };
  let lo = 0, hi = 1;
  while (hi <= 48 && await beats(hi)) { lo = hi; hi *= 2; }
  while (hi - lo > 1 && lo < 48) { const mid = (lo + hi) >> 1; if (await beats(mid)) lo = mid; else hi = mid; }
  if (self) leave();
  return lo;
}
/** What a squad costs to put in the field, at current prices. */
export function squadValue(squad: AgentSpec[]) {
  let v = 0;
  for (const a of squad) {
    for (const id of [a.w1, a.w2]) if (id) v += (WEAPONS[id] as any).cost || 0;
    if (a.gear) v += GEAR[a.gear].cost;
    for (const k of MOD_ORDER) for (let i = 1; i <= a.mods[k]; i++) v += MOD_COST[i];
  }
  return v;
}
/** Every squad against every enemy: the most of them each squad reliably beats. */
export async function runMatrix(base: Omit<FightCfg, 'squad' | 'enemy' | 'count'>, runs = 100, onProgress?: (msg: string) => void) {
  enter();
  const rows = [];
  for (const s of SQUADS) {
    const limits: Record<string, number> = {};
    for (const e of ENEMIES) { if (onProgress) onProgress(s.name + ' vs ' + e.name); limits[e.id] = await findLimit({ ...base, squad: s.agents, enemy: e.id, count: 1 }, runs); }
    rows.push({ id: s.id, name: s.name, value: squadValue(s.agents), limits });
  }
  leave();
  return rows;
}

/* ---------------------------------------------------------------- watching one fight */
let watching = false;
function watchFight(cfg: FightCfg, done: (msg: string) => void) {
  enter(); loadArena(cfg); setupFight(cfg);
  $('#termS').hidden = true; $('#simTool').hidden = true; $('#simBack').hidden = false;
  camT.set(CX, 0, CZ);
  watching = true;
  let last = performance.now(), t = 0, think = 0;
  const finish = (msg: string) => {
    watching = false; $('#simBack').hidden = true; $('#simTool').hidden = false; $('#termS').hidden = false;
    done(msg);
  };
  ($('#simBack') as HTMLElement).onclick = () => finish('Stopped');
  const tick = (now: number) => {
    if (!watching) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    pickups.length = 0;
    if (t >= think) { botThink(cfg); think = t + 0.25; }
    simStep(dt);
    const s = agents.filter((a) => !a.dead);
    if (s.length) { camT.x += (s.reduce((n, a) => n + a.x, 0) / s.length - camT.x) * dt; camT.z += (s.reduce((n, a) => n + a.z, 0) / s.length - camT.z) * dt; }
    if (!enemiesLeft() || !s.length || t > LIMIT) { setTimeout(() => finish(enemiesLeft() ? 'Squad lost' : 'Squad won in ' + Math.round(t) + 's, ' + (agents.length - s.length) + ' lost'), 1200); watching = false; return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------------------------------------------------------------- the tool itself: a dev page over the terminal */
const CSS = `
#simTool{position:absolute;inset:0;z-index:6;overflow:auto;background:#000;color:var(--text);font:20px/1.25 VT323,monospace;padding:14px 18px 40px}
#simTool h2{font-size:26px;font-weight:400;color:var(--teal);margin:0 0 2px}#simTool h3{font-size:20px;font-weight:400;color:var(--amber);margin:14px 0 6px}
#simTool select,#simTool input{font:inherit;color:var(--teal);background:#031210;border:1px solid var(--hi);padding:1px 3px;max-width:100%}
#simTool button{font:inherit;color:var(--teal);border:1px solid var(--edge);padding:3px 12px;margin:0 6px 6px 0;background:#031210}
#simTool button:hover{background:var(--teal);color:#000}#simTool button.go{background:var(--amber);color:#000;border-color:var(--amber)}
#simTool table{border-collapse:collapse;margin:0 0 6px}#simTool td,#simTool th{padding:1px 8px;text-align:left;font-weight:400;border-bottom:1px solid #0d2622;white-space:nowrap}#simTool th{color:var(--dim)}
#simTool .cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,720px),1fr));gap:0 26px}
#simTool .bad{color:var(--pink)}#simTool .ok{color:var(--amber)}#simTool .dim{color:var(--dim)}#simTool .sc{overflow-x:auto}
#simBack{position:absolute;right:16px;top:14px;z-index:6;font:20px VT323,monospace;color:#000;background:var(--amber);padding:4px 14px}
`;
const weaponIds = () => Object.keys(WEAPONS).filter((k) => !(WEAPONS[k] as any).npc && (WEAPONS[k] as any).kind !== 'jack');
const opts = (list: [string, string][], v: string | null) => list.map(([k, n]) => '<option value="' + k + '"' + (k === (v || '') ? ' selected' : '') + '>' + n + '</option>').join('');
let squad: AgentSpec[] = JSON.parse(JSON.stringify(SQUADS[0].agents));
const history: string[] = [];
function mySquad(): AgentSpec[] {
  return SAVE.agents.filter((r) => r.alive && r.deploy).slice(0, 4).map((r) => ({ w1: r.slots[0] && (WEAPONS[r.slots[0]] as any).kind !== 'jack' ? r.slots[0] : 'pistol', w2: r.slots[1] && (WEAPONS[r.slots[1]] as any).kind !== 'jack' ? r.slots[1] : null, gear: r.gear === 'medikit' ? 'medikit' : null, mods: { ...r.mods } }));
}
function readCfg(): FightCfg {
  const v = (id: string) => ($('#sim-' + id) as HTMLInputElement).value;
  return { squad, enemy: v('enemy'), count: Math.max(1, +v('count') || 1), layout: v('layout'), light: v('light'), dist: +v('dist'), alert: v('stance') === 'alert', push: v('doctrine') === 'push' };
}
function renderSquad() {
  const wl: [string, string][] = weaponIds().map((k) => [k, (WEAPONS[k] as any).name]), wn: [string, string][] = [['', '--'], ...wl], gl: [string, string][] = [['', '--'], ['medikit', 'MEDIKIT']];
  const lv: [string, string][] = [['0', '-'], ['1', '1'], ['2', '2'], ['3', '3']];
  $('#sim-squad').innerHTML = '<table><tr><th>#</th><th>Slot 1</th><th>Slot 2</th><th>Gear</th>' + MOD_ORDER.map((m) => '<th>' + m.slice(0, 3).toUpperCase() + '</th>').join('') + '<th>Carry</th></tr>'
    + squad.map((a, i) => {
      const load = [a.w1, a.w2].reduce((n, id) => n + (id ? (WEAPONS[id] as any).w : 0), a.gear ? GEAR[a.gear].w : 0), cap = CAP[a.mods.arms];
      return '<tr><td>' + (i + 1) + '</td><td><select data-a="' + i + '" data-k="w1">' + opts(wl, a.w1) + '</select></td><td><select data-a="' + i + '" data-k="w2">' + opts(wn, a.w2) + '</select></td><td><select data-a="' + i + '" data-k="gear">' + opts(gl, a.gear) + '</select></td>'
        + MOD_ORDER.map((m) => '<td><select data-a="' + i + '" data-m="' + m + '">' + opts(lv, String(a.mods[m])) + '</select></td>').join('') + '<td class="' + (load > cap ? 'bad' : '') + '">' + load + '/' + cap + '</td></tr>';
    }).join('') + '</table><div class="dim">Value ' + squadValue(squad).toLocaleString('en-US') + ' CR. Over the carry limit an agent moves at 65%.</div>';
  $('#sim-squad').querySelectorAll('select').forEach((el: HTMLSelectElement) => el.addEventListener('change', () => {
    const a = squad[+el.dataset.a!];
    if (el.dataset.m) a.mods[el.dataset.m] = +el.value; else (a as any)[el.dataset.k!] = el.value || null;
    renderSquad();
  }));
}
function describe(cfg: FightCfg) { return cfg.layout + ', ' + cfg.light + ', ' + cfg.dist + 'm, ' + (cfg.alert ? 'alerted' : 'unaware') + ', ' + (cfg.push ? 'push' : 'hold'); }
function report(html: string) { history.unshift(html); history.length = Math.min(history.length, 12); $('#sim-out').innerHTML = history.join(''); }
function busy(msg: string) { $('#sim-busy').textContent = msg; }
async function guarded(fn: () => Promise<void>) {
  $('#simTool').querySelectorAll('button').forEach((b: HTMLButtonElement) => { if (b.id !== 'sim-close') b.disabled = true; });
  try { await fn(); } finally { busy(''); $('#simTool').querySelectorAll('button').forEach((b: HTMLButtonElement) => { b.disabled = false; }); }
}
function buildTool() {
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const el = document.createElement('div'); el.id = 'simTool'; el.hidden = true;
  const sel = (id: string, list: [string, string][], v?: string) => '<label>' + id.toUpperCase() + ' <select id="sim-' + id + '">' + opts(list, v || list[0][0]) + '</select></label> ';
  el.innerHTML = '<h2>Combat simulator</h2><div class="dim">Real fights, played by a simple bot: no stealth, hacks or cover use. A good player beats these numbers.</div>'
    + '<div class="cols"><div><h3>Squad</h3><label>PRESET <select id="sim-preset">' + opts([...SQUADS.map((s) => [s.id, s.name] as [string, string]), ['mine', 'My squad']], 'starter') + '</select></label><div id="sim-squad" class="sc" style="margin-top:6px"></div></div>'
    + '<div><h3>Scenario</h3>' + sel('enemy', ENEMIES.map((e) => [e.id, e.name])) + '<label>COUNT <input id="sim-count" type="number" min="1" max="60" value="6" style="width:60px"></label><br>'
    + sel('layout', [['cover', 'Scattered cover'], ['open', 'Open ground'], ['street', 'Street and alleys']]) + sel('light', [['lit', 'Lit'], ['dark', 'Dark']]) + '<br>'
    + sel('dist', [['30', '30 m'], ['15', '15 m'], ['50', '50 m']]) + sel('stance', [['alert', 'Enemies alerted'], ['unaware', 'Enemies unaware']]) + sel('doctrine', [['push', 'Push'], ['hold', 'Hold']]) + '<br>'
    + '<label>FIGHTS <input id="sim-runs" type="number" min="1" max="20000" value="1000" style="width:74px"></label></div></div>'
    + '<h3>Run</h3><button class="go" id="sim-run">RUN FIGHTS</button><button id="sim-limit">FIND LIMIT</button><button id="sim-matrix">ALL SQUADS VS ALL ENEMIES</button><button id="sim-watch">WATCH ONE</button><button id="sim-close">CLOSE</button> <span id="sim-busy" class="ok"></span>'
    + '<div id="sim-out" class="sc" style="margin-top:8px"></div>';
  $('#app').appendChild(el);
  const back = document.createElement('button'); back.id = 'simBack'; back.hidden = true; back.textContent = 'STOP WATCHING'; $('#app').appendChild(back);
  $('#sim-preset').addEventListener('change', (e: Event) => {
    const v = (e.target as HTMLSelectElement).value;
    squad = v === 'mine' ? mySquad() : JSON.parse(JSON.stringify(SQUADS.find((s) => s.id === v)!.agents));
    if (!squad.length) squad = JSON.parse(JSON.stringify(SQUADS[0].agents));
    renderSquad();
  });
  $('#sim-close').addEventListener('click', closeCombatSim);
  $('#sim-run').addEventListener('click', () => guarded(async () => {
    const cfg = readCfg(), runs = Math.max(1, +($('#sim-runs') as HTMLInputElement).value || 1), name = ENEMIES.find((e) => e.id === cfg.enemy)!.name;
    const r = await runBatch(cfg, runs, (d) => busy(d + ' / ' + runs));
    report('<table><tr><th>' + cfg.count + ' ' + name + ' // ' + describe(cfg) + '</th><th>Win</th><th>Time</th><th>Agents lost</th><th>Squad HP left</th><th>Shots</th><th>Timeouts</th></tr><tr><td class="dim">' + r.runs + ' fights in ' + (r.ms / 1000).toFixed(1) + 's</td><td class="' + (r.winPct >= 80 ? 'ok' : r.winPct < 40 ? 'bad' : '') + '">' + r.winPct + '% ±' + r.margin + '</td><td>' + r.time + 's</td><td>' + r.lost + ' / ' + cfg.squad.length + '</td><td>' + r.hp + '%</td><td>' + r.shots + '</td><td>' + r.timeouts + '</td></tr></table>');
  }));
  $('#sim-limit').addEventListener('click', () => guarded(async () => {
    const cfg = readCfg(), n = await findLimit(cfg, Math.max(50, Math.min(400, +($('#sim-runs') as HTMLInputElement).value)), (k) => busy('Trying ' + k + '...'));
    report('<div>Reliably beats <span class="ok">' + n + ' ' + ENEMIES.find((e) => e.id === cfg.enemy)!.name + '</span> <span class="dim">(80% of fights) // ' + describe(cfg) + '</span></div>');
  }));
  $('#sim-matrix').addEventListener('click', () => guarded(async () => {
    const cfg = readCfg(), rows = await runMatrix({ layout: cfg.layout, light: cfg.light, dist: cfg.dist, alert: cfg.alert, push: cfg.push }, 100, busy);
    report('<table><tr><th>Most enemies each squad reliably beats // ' + describe(cfg) + '</th><th>Value</th>' + ENEMIES.map((e) => '<th>' + e.name + '</th>').join('') + '</tr>' + rows.map((r) => '<tr><td>' + r.name + '</td><td class="dim">' + r.value.toLocaleString('en-US') + '</td>' + ENEMIES.map((e) => '<td class="ok">' + r.limits[e.id] + '</td>').join('') + '</tr>').join('') + '</table>');
  }));
  $('#sim-watch').addEventListener('click', () => { const cfg = readCfg(); watchFight(cfg, (msg) => report('<div>' + msg + ' <span class="dim">// ' + cfg.count + ' ' + ENEMIES.find((e) => e.id === cfg.enemy)!.name + ', ' + describe(cfg) + '</span></div>')); });
  renderSquad();
}
export function openCombatSim() {
  if (!$('#simTool')) buildTool();
  $('#simTool').hidden = false;
}
export function closeCombatSim() {
  $('#simTool').hidden = true;
  if (open) leave();
}
export const combatApi = { SQUADS, ENEMIES, runBatch, findLimit, runMatrix, squadValue, openCombatSim, closeCombatSim };
