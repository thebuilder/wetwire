import { $, R, Rpick, clamp, lerp } from './core';
import { GW, WORLD } from './world_head';
import { LEVEL, RN, inPlay } from './layout';
import { loadWorld } from './world_load';
import { camT, playMusic } from './engine';
import { NAMES, RESEARCH, SAVE, WEAPONS, mkRec, store } from './campaign';
import { MS, agents, clearMission, heatPeak, lastCombat, missionT, mkCar, setAgents, setMS, setMissionT, setObj, setState, setTarget, spawnCiv, spawnFlyers, state, stats, target, time } from './setup';
import { squadCenter } from './sim';
import { settleTerritory } from './missions';
import { setHack } from './commands';
import { holdFire, setHoldFire } from './input';
import { locatorPos } from './hud';
import { DEBRIEF, planDef, setDEBRIEF, setPlanDef, showTerminal, tStatus } from './pages';
import { setPause } from './tactical';

/* ================================================================ mission flow */
export function updateMission(dt) {
  setMissionT(missionT + (dt));
  const alive = agents.filter((a) => !a.dead);
  if (!alive.length) { endMission('dead'); return; }
  const k = MS.objs[0];
  if (k.st !== 'open') {
    let at;
    if (WORLD.kind === 'city') { const [px, pz] = WORLD.padC; at = alive.every((a) => !a.inCar && Math.abs(a.x - px) < 5.5 && Math.abs(a.z - pz) < 5.5);
      if (at && MS.def.id === 'halden' && k.st === 'done' && !(target && !target.dead && target.fac === 'follower' && Math.abs(target.x - px) < 6.5 && Math.abs(target.z - pz) < 6.5)) at = false; }
    else { const v = MS.van; at = alive.every((a) => a.inCar === v || (!a.inCar && Math.hypot(a.x - v.x, a.z - v.z) < 6.5)); }
    if (at) { setObj('out', k.st === 'done' ? 'done' : 'fail'); endMission(k.st === 'done' ? 'win' : 'fail'); return; }
  }
  // locator: the target (then the extraction point) pulses on the scanner, faster as the squad closes in
  const lp = locatorPos();
  if (lp) {
    MS.pingT = (MS.pingT == null ? 0.6 : MS.pingT) - dt;
    if (MS.pingT <= 0) { const sc = squadCenter(), d = Math.hypot(lp.p[0] - sc[0], lp.p[1] - sc[1]); MS.pingT = clamp(1.1 + d / 32, 1.1, 4.5); MS.pingAt = time; }
  }
  const combat = time - lastCombat < 8;
  playMusic(combat ? 'danger' : 'infiltration', combat ? 0.4 : 2.5);
}
export function endMission(res) {
  if (state !== 'play') return;
  setPause(false); $('#tip').hidden = true;
  setState(res === 'win' ? 'won' : 'lost');
  setHack(false); setHoldFire(false);
  playMusic(res === 'win' ? 'complete' : 'failed', 0.3);
 
  const L = settle(res);
  setTimeout(() => showEnd(res, L), res === 'win' ? 1400 : res === 'abort' ? 400 : 2200);
}
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
export function freeName() { return NAMES.find((n) => !SAVE.agents.some((r) => r.name === n)) || 'AGENT ' + (SAVE.agents.length + 1); }
function settle(res) {
  const def = MS.def, rows = [];
  let total = 0;
  const add = (t, v) => { rows.push([t, v]); total += v; };
  if (res === 'win') {
    const repeat = !!SAVE.done[def.id];
    add(repeat ? 'Contract fee (repeat, half rate)' : 'Contract fee', Math.round(def.reward * (repeat ? 0.5 : 1)));
    if (WORLD.kind === 'compound' && MS.alarm < 2) add('Silent bonus // no alarm', 2500);
    if (WORLD.kind === 'city' && LEVEL.police !== false && heatPeak < 20) add('Low profile bonus // police never alerted', 3000);
    if (WORLD.kind === 'city' && LEVEL.police === false && stats.civ === 0) add('Clean job // no civilian casualties', 2500);
  }
  if (stats.civ > 0) add('Civilian casualties x' + stats.civ + ' // cleanup', -150 * stats.civ);
  if (stats.cops > 0) add('Officers down x' + stats.cops + ' // settlements', -400 * stats.cops);
  const lost = [];
  for (const a of agents) {
    const r = a.rec;
    if (a.dead) { r.alive = false; r.deploy = false; lost.push(r.name); continue; }
    r.slots = a.slots.slice();
    const am: any = {}; for (const id of r.slots) if (id && a.ammo[id]) { const w = WEAPONS[id], mx = w.mag * (w.mags || 1); am[id] = { mag: Math.min(a.ammo[id].mag, w.mag), res: Math.max(0, Math.min(a.ammo[id].res, mx - Math.min(a.ammo[id].mag, w.mag))) }; } r.ammo = am;
    r.charges = a.charges; r.kills += a.kills || 0; r.missions++;
    if (r.gear === 'medikit' && a.gearUsed) r.gear = null;
  }
  if (res === 'win') SAVE.done[def.id] = true;
  if (res === 'win' && def.unlock && !SAVE.avail.includes(def.unlock)) { SAVE.avail.push(def.unlock); MS.captured.push(def.unlock); }
  settleTerritory(res, add, rows);
  const R0 = SAVE.res || (SAVE.res = { done: {}, active: null, left: 0 });
  if (R0.active && res !== 'abort') {
    R0.left--;
    if (R0.left <= 0) { const x = RESEARCH.find((y) => y.id === R0.active); R0.done[x.id] = true; R0.active = null; if (x.unlock && !SAVE.avail.includes(x.unlock)) SAVE.avail.push(x.unlock); rows.push(['Research complete // ' + x.name, 0]); MS.researched = x.name; }
  }
  SAVE.cash = Math.max(0, SAVE.cash + total);
  if (!SAVE.agents.some((r) => r.alive)) { SAVE.agents.push(mkRec(freeName(), R() < 0.5 ? 'm' : 'f')); rows.push(['Company replacement // one agent, pistol', 0]); }
  store();
  return { rows, total, lost, captured: MS.captured.slice() };
}
function showEnd(res, L) {
  $('#hud').hidden = true;
  const t = Math.floor(missionT);
  const rows = [['Time', Math.floor(t / 60) + 'm ' + (t % 60) + 's'], ['Agents lost', L.lost.length + ' / ' + agents.length], ['Hostiles down', stats.hostiles], ['Civilian casualties', stats.civ]];
  if (WORLD.kind === 'city') rows.push(['Officers down', stats.cops], ['Peak heat', Math.round(heatPeak)]);
  else rows.push(['Alarm raised', MS.alarm >= 2 ? 'YES' : 'NO'], ['Reinforcements', MS.reinfSent ? 'YES' : 'NO']);
  rows.push(['Minds jacked', stats.jacked], ['Network hacks', stats.hacks], ['Shots fired', stats.shots]);
  const bits = [];
  if (res === 'win' && MS.def.win) bits.push(MS.def.win);
  else if (res === 'win') bits.push({ compound: 'Rusk is dead and the north road is quiet.', courier: 'The case is ours. Meridian\'s limo specs show a military-grade exploit in their armour systems.', halden: 'Dr. Halden is in a Kessel lab. Her optics work is already on the bench.', varga: 'Varga is gone. Meridian will need a new executive.' }[MS.def.id]);
  if (res === 'fail' && MS.def.fail) bits.push(MS.def.fail);
  else if (res === 'fail') bits.push(MS.def.id === 'halden' ? 'Dr. Halden did not make it. No fee.' : MS.def.id === 'courier' ? 'The data reached Meridian. No fee, but the squad came home.' : 'The target got away. No fee, but the squad came home.');
  if (res === 'abort') bits.push('Recalled before the job was done. Ammunition spent stays spent.');
  if (res === 'dead') bits.push('Every agent flatlined. Their gear is gone with them.');
  if (L.lost.length && res !== 'dead') bits.push('Lost: ' + L.lost.join(', ') + '. Their weapons and mods are gone.');
  if (MS.researched) bits.push('<span class="capt">Research complete: ' + MS.researched + '.</span>');
  if (L.captured.length) bits.push('<span class="capt">Captured tech, now in the armoury: ' + L.captured.map((id) => WEAPONS[id].name).join(', ') + '.</span>');
  if (res === 'win' && MS.def.id === 'compound') bits.push('<span class="capt">Unlocked: version 2 cyborg mods and the MK2 deck.</span>');
  setDEBRIEF({ res, title: { win: 'Contract complete', fail: 'Target escaped', dead: 'Squad flatlined', abort: 'Contract aborted' }[res], sub: 'Contract ' + MS.def.code + ' // ' + MS.def.region,
    rows, ledger: L.rows.length ? L.rows : [['No fee', 0]], total: L.total, text: bits.join(' ') });
  if (res === 'win' && planDef === MS.def) setPlanDef(null);
  setupAttract();
  tStatus(res === 'win' ? 'TEAM RECOVERED // FEE PAID' : 'TEAM RECOVERED', res === 'win' ? '' : 'warn');
  showTerminal('debrief');
}

/* ================================================================ attract mode (behind the menus) */
export function setupAttract() {
  setMS({ def: null, objs: [{ id: 'kill', st: 'open' }], captured: [], ledger: [], alarm: 0 });
  clearMission(); setAgents([]); setTarget(null);
  loadWorld('downtown', 'smog');
  for (let i = 0; i < 130; i++) spawnCiv();
  const carNodes = RN.nodes.map((n, i) => i).filter((i) => RN.nodes[i].adj.length && inPlay(RN.nodes[i].x, RN.nodes[i].z, -20));
  for (let i = 0; i < 20; i++) { const c = mkCar(R() < 0.18 ? 'van' : 'sedan', Rpick(carNodes)); c.x = lerp(c.x, c.tx, R()); c.z = lerp(c.z, c.tz, R()); }
  spawnFlyers(16);
  camT.set(GW * 0.45, 0, GW * 0.55);
  setState('menu');
}
