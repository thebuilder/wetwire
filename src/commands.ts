import { $, Rr } from './core';
import { WORLD, barrels, cellOk } from './world_head';
import { groundY } from './layout';
import { spawnP } from './models';
import { DPR, findPath, groundAt, nearestNode, nearestOpen, sfx, toScreen } from './engine';
import { MS, abortT, agents, cars, driveTo, hackOn, moveMarks, people, pickups, selected, setAbortT, setHackOn, spawnCiv, state, target, time, turrets } from './setup';
import { addHeat, agentWeapon, deckOf, dropLink, say, squadCenter, startReload } from './sim';
import { endMission } from './flow';
import { hover, setHover } from './input';
import { hudSquad } from './hud';

/* ================================================================ commands */
export function selAlive() { return [...selected].filter((a) => !a.dead); }
export function freeAgent(a) { if (a.link) dropLink(a.link, false); a.jackTo = null; a.pickTarget = null; }
/* a watchtower drawn under the cursor: test the cursor ray at platform, mid and leg height */
export function towerUnder(px, py) {
  for (const t of WORLD.towers) for (const y of [t.y + 1.2, t.y * 0.66, t.y * 0.33]) { const g = groundAt(px, py, y); if (Math.abs(g[0] - t.x) < t.half + 0.3 && Math.abs(g[1] - t.z) < t.half + 0.3) return t; }
  return null;
}
export function cmdMove(x, z, run) {
  const sel = selAlive(); if (!sel.length) return;
  const car = sel.find((a) => a.inCar)?.inCar;
  if (car) { const pt = driveTo(car, x, z); car.cruise = run ? 17 : car.model === 'police' ? 14 : car.model === 'truck' ? 10 : 12; moveMarks.push({ x: pt[0], z: pt[1], t: 0.7, c: 'p' }); sfx('ack', null, null, 1, run ? 1.25 : 1); return; }
  const offs = [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]];
  // a click on a cleared watchtower sends the squad up its ladder (it takes two)
  const tw = WORLD.towers.find((t) => Math.abs(x - t.x) < t.half + 0.6 && Math.abs(z - t.z) < t.half + 0.6);
  const twFree = tw && !people.some((p) => p.tower === tw && !p.dead);
  if (tw && !twFree) say('THE TOWER IS STILL MANNED', 'warn');
  let up = 0;
  sel.forEach((a, i) => {
    freeAgent(a);
    const o = sel.length > 1 ? offs[i % 4] : [0, 0];
    const t = cellOk(x + o[0], z + o[1]) ? [x + o[0], z + o[1]] : [x, z];
    const climb = twFree && up < 2 && a.onTower !== tw ? tw : null; if (climb || a.onTower === tw) up++;
    a.ftarget = null; a.fpoint = null; a.auto = null; a.run = !!run;
    if (a.onTower === tw && tw) return;
    if (a.onTower || a.climb) {   // come down first, then go
      const from = a.onTower || a.climb.t, k = a.climb ? a.climb.k : 1;
      a.climb = { t: from, k, dir: -1, then: [t[0], t[1], !!run, climb] }; a.onTower = null; a.climbTo = null; a.path = null; return;
    }
    a.climbTo = climb;
    a.path = climb ? findPath(a.x, a.z, climb.ladder[0], climb.ladder[1]) : findPath(a.x, a.z, t[0], t[1]);
  });
  moveMarks.push({ x, z, t: 0.7, c: 'p' });
  sfx('ack', null, null, 1, run ? 1.25 : 1);
}
export function pickEntity(px, py, rad) {
  let best = null, bd = rad * DPR; const s = [0, 0, 0];
  for (const p of people) {
    if (p.dead || p.inCar) continue;
    toScreen(p.x, (p.elev || groundY(p.x, p.z)) + 1, p.z, s); const d = Math.hypot(s[0] - px, s[1] - py); if (d < bd) { bd = d; best = p; }
  }
  for (const c of cars) { if (c.wreck || c.gone) continue; toScreen(c.x, 0.8, c.z, s); const d = Math.hypot(s[0] - px, s[1] - py) - 6 * DPR; if (d < bd) { bd = d; best = c; } }
  for (const t of turrets) { if (t.dead) continue; toScreen(t.x, 1.2, t.z, s); const d = Math.hypot(s[0] - px, s[1] - py); if (d < bd) { bd = d; best = t; } }
  for (const b of barrels) { if (b.dead) continue; toScreen(b.x, b.big ? 3.5 : 0.6, b.z, s); const d = Math.hypot(s[0] - px, s[1] - py) - (b.big ? 10 : 2) * DPR; if (d < bd) { bd = d; best = b; } }
  return best;
}
export function pickPickup(px, py, rad) {
  let best = null, bd = rad * DPR; const s = [0, 0, 0];
  for (const it of pickups) { toScreen(it.x, groundY(it.x, it.z) + 0.3, it.z, s); const d = Math.hypot(s[0] - px, s[1] - py); if (d < bd) { bd = d; best = it; } }
  return best;
}
export const isJack = (a) => { const w = agentWeapon(a); return !!w && w.kind === 'jack'; };
/* where a fire order under the cursor really points: snap to whoever is under it (height aware, so a guard
   up a tower counts), then raised platforms, then the ground */
export let aimLock = null;
export function setAimLock(v: typeof aimLock) { return aimLock = v; }
export function aimAt(px, py) {
  const e = pickEntity(px, py, 16);
  if (e && e.kind !== 'agent' && e.fac !== 'follower') { aimLock = e; return [e.x, e.z]; }
  aimLock = null;
  for (const t of WORLD.towers) { const g = groundAt(px, py, t.y + 1); if (Math.abs(g[0] - t.x) < t.half && Math.abs(g[1] - t.z) < t.half) return g; }
  return groundAt(px, py);
}
export function cmdAttack(px, py) {
  const sel = selAlive().filter((a) => !a.inCar && !a.link && !a.jackTo); if (!sel.length) return;
  const e = pickEntity(px, py, 22);
  if (e && e.kind !== 'agent' && !(e.fac === 'follower' && sel.every(isJack))) {
    for (const a of sel) { if (isJack(a) && !e.kind) continue; a.ftarget = e; a.fpoint = null; a.path = null; a.jackT = 0; a.pickTarget = null; }
    moveMarks.push({ ent: e, t: 0.7, c: 's' });
  } else {
    const g = aimAt(px, py);
    for (const a of sel) { if (isJack(a)) continue; a.fpoint = g; a.fpointT = time + 0.9; a.ftarget = null; a.path = null; }
    moveMarks.push({ x: g[0], z: g[1], t: 0.6, c: 's' });
  }
}
export function setSlot(i) {
  const sel = selAlive(); if (!sel.length) return;
  let any = false;
  for (const a of sel) { if (!a.slots[i] || a.cur === i) continue; a.cur = i; a.ftarget = null; a.fpoint = null; a.jackT = 0; a.reloadT = 0; any = true; }
  if (any) sfx('ui', null, null, 0.4, 1.3);
  hudSquad();
}
export function cmdReload() { for (const a of selAlive()) startReload(a); hudSquad(); }
export function cmdMedikit() {
  let used = false;
  for (const a of selAlive()) {
    if (a.gear !== 'medikit' || a.gearUsed || a.hp >= a.maxHp) continue;
    a.gearUsed = true; a.healT = 2; used = true; say(a.name + ' USED A MEDIKIT', '');
    for (let i = 0; i < 10; i++) spawnP(a.x, 1.2, a.z, Rr(-1, 1), Rr(0.5, 2), Rr(-1, 1), [0.5, 2.2, 1.8], 0.1, 0.6);
  }
  if (used) sfx('ui', null, null, 0.6, 0.8);
  else say('NO MEDIKIT TO USE // OR ALREADY HEALTHY', 'warn');
  hudSquad();
}
export function toggleCar() {
  const sel = selAlive(); if (!sel.length) return;
  const inside = sel.filter((a) => a.inCar);
  if (inside.length) {
    const c = inside[0].inCar;
    c.occ.forEach((a, i) => { const sp = nearestOpen(c.x + Math.cos(c.yaw) * 1.8 * (i % 2 ? 1 : -1), c.z - Math.sin(c.yaw) * 1.8 * (i % 2 ? 1 : -1), 4) || [c.x, c.z]; a.inCar = null; a.x = sp[0]; a.z = sp[1]; a.path = null; });
    c.occ = []; c.driver = 'none'; c.parked = true; c.route = null;
    say('SQUAD ON FOOT', ''); sfx('door', c.x, c.z, 0.7); hudSquad(); return;
  }
  const [cx, cz] = squadCenter();
  let best = null, bd = 9;
  for (const c of cars) {
    if (c.wreck || c.gone || c === target || c.driver === 'script' || c.driver === 'target') continue;
    if (c.occ && c.occ.some((p) => p.kind !== 'agent')) continue;
    const d = Math.hypot(c.x - cx, c.z - cz); if (d < bd) { bd = d; best = c; }
  }
  if (!best) { say('NO VEHICLE IN REACH // GET WITHIN 9M', 'warn'); return; }
  const riders = sel.filter((a) => !a.link && Math.hypot(a.x - best.x, a.z - best.z) < 10);
  if (!riders.length) { say('NO VEHICLE IN REACH // GET WITHIN 9M', 'warn'); return; }
  if (best.driver === 'civ' && WORLD.kind === 'city') { const sp = nearestOpen(best.x + 2, best.z, 4) || [best.x, best.z]; const v = spawnCiv(); v.x = sp[0]; v.z = sp[1]; v.state = 'flee'; v.fx = best.x; v.fz = best.z; v.t = 8; }
  if (best.driver === 'police') addHeat(6);
  best.node = nearestNode(best.x, best.z); best.next = null; best.driver = 'player'; best.occ = riders; best.parked = false; best.route = []; best.idle = true;
  best.cruise = best.model === 'police' ? 14 : 12; best.speed = 0; best.roam = false;
  for (const a of riders) { freeAgent(a); a.inCar = best; a.path = null; a.ftarget = null; }
  say((best === MS.van ? 'SQUAD IN THE VAN' : 'VEHICLE TAKEN') + ' // CLICK TO DRIVE, F TO LEAVE', ''); sfx('door', best.x, best.z, 0.8); hudSquad();
}
export function setHack(on) {
  if (on === hackOn) return;
  setHackOn(on); $('#banner').hidden = !on; $('#bHack').classList.toggle('on', on); setHover(null);
  if (on && state === 'play' && !agents.some((a) => !a.dead && deckOf(a))) say('NO DECK IN THE SQUAD // VIEW ONLY', 'warn');
  sfx('zap', null, null, 0.6, on ? 1 : 0.7);
}
export function tryAbort() {
  if (state !== 'play') return;
  const now = performance.now();
  if (now - abortT < 2500) { setAbortT(0); endMission('abort'); }
  else { setAbortT(now); say('PRESS ESC AGAIN TO ABORT // NO FEE', 'warn'); }
}
