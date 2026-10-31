import { $, R, Rpick, Rr, TAU, U, angDiff, clamp, lerp } from './core';
import { GW, WORLD, barrels, cellOk, opq } from './world_head';
import { CX0, CX1, CZ0, CZ1, ROADX } from './world_build';
import { LEVEL, PEDS, RN, groundY, nearestPed, pedPos } from './layout';
import { parts, spawnP, tracer, tracers } from './models';
import { setGateCells } from './world_load';
import { camT, findPath, nearestNode, nearestOpen, roadRoute, setShake, sfx, shake } from './engine';
import { GEAR, SAVE, WEAPONS, resDone } from './campaign';
import { MS, SKINS, agents, beams, blackouts, cars, corpWaves, decals, dispatchT, driveTo, dyn, flyers, hackJob, heat, heatPeak, lastCombat, lastLoud, militia, missionT, mkCar, mkCarAt, mkPerson, moveMarks, people, pickNext, pickups, rockets, selected, setBlackouts, setCorpWaves, setDispatchT, setHackJob, setHeat, setHeatPeak, setLastCombat, setLastLoud, setObj, setSpotLogT, spotLogT, stats, target, time, train, turrets } from './setup';
import { addFire, burnTick, flameShot, hurtBarrel, ignite, panic } from './chaos';
import { SCRIPTS, updateChairman } from './missions';
import { selAlive } from './commands';
import { hudSquad } from './hud';
import { addNoise } from './tactical';

/* ================================================================ combat helpers */
export const group = (p) => p.fac === 'player' || p.fac === 'follower' ? 'P' : p.fac === 'law' ? 'L' : p.fac === 'corp' ? 'C' : 'N';
function hostile(a, b) {
  const ga = group(a), gb = group(b);
  if (ga === gb || ga === 'N' || gb === 'N') return false;
  if ((ga === 'L' && gb === 'C') || (ga === 'C' && gb === 'L')) return false;
  if (ga === 'P') return !!b.alerted;
  return !!a.alerted;
}
export function wallDist(x0, z0, dx, dz, max) {
  for (let t = 0.5; t < max; t += 0.3) { const x = x0 + dx * t, z = z0 + dz * t; if (x < 0 || z < 0 || x >= GW || z >= GW) return max; if (opq[Math.floor(z) * GW + Math.floor(x)]) return t; }
  return max;
}
function rayCircle(x0, z0, dx, dz, cx, cz, r) {
  const ox = cx - x0, oz = cz - z0, t = ox * dx + oz * dz; if (t < 0) return -1;
  const px = ox - dx * t, pz = oz - dz * t, d2 = px * px + pz * pz; if (d2 > r * r) return -1;
  return t - Math.sqrt(r * r - d2);
}
function hasLOS(a, b) { const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz); if (d < 0.01) return true; return wallDist(a.x, a.z, dx / d, dz / d, d) >= d - 0.6; }
function trace(shooter, x0, z0, dx, dz, range, pierce) {
  const wall = wallDist(x0, z0, dx, dz, range);
  const hits = [], sg = shooter ? group(shooter) : null;
  for (const p of people) {
    if (p.dead || p === shooter || p.inCar) continue;
    if (sg && group(p) === sg) continue;
    const t = rayCircle(x0, z0, dx, dz, p.x, p.z, 0.42 * p.scale); if (t >= 0 && t < wall) hits.push({ t, p });
  }
  for (const c of cars) {
    if (sg === 'P' && c.driver === 'player') continue;
    if (c.alt > 3 || c.gone) continue;
    if (c.occ && c.occ.includes(shooter)) continue;
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    let best = -1;
    for (const o of [-1.4, 0, 1.4]) { const t = rayCircle(x0, z0, dx, dz, c.x + fx * o, c.z + fz * o, 1.05); if (t >= 0 && (best < 0 || t < best)) best = t; }
    if (best >= 0 && best < wall) hits.push({ t: best, c });
  }
  for (const tu of turrets) {
    if (tu.dead) continue;
    if (sg === 'C' && !tu.friendly) continue; if (sg === 'P' && tu.friendly) continue;
    const t = rayCircle(x0, z0, dx, dz, tu.x, tu.z, 0.75); if (t >= 0 && t < wall) hits.push({ t, tu });
  }
  for (const b of barrels) { if (b.dead) continue; const t = rayCircle(x0, z0, dx, dz, b.x, b.z, b.r); if (t >= 0 && t < wall) hits.push({ t, b }); }
  hits.sort((a, b) => a.t - b.t);
  if (!pierce) return hits.length ? { end: hits[0].t, hits: [hits[0]] } : { end: wall, hits: [] };
  const stop = hits.find((h) => h.c || h.tu || h.b);
  return stop ? { end: stop.t, hits: hits.filter((h) => h.t <= stop.t) } : { end: wall, hits };
}
function addDecal(x, z, s, col, ty?) { decals.push({ x, z, s, col, ty: ty || 0, seed: R(), yaw: R() * TAU, y: groundY(x, z) + 0.03 + decals.length * 0.0004 }); if (decals.length > 96) decals.shift(); }
export function addDyn(x, y, z, r, c, life) { dyn.push({ x, y, z, r, c, life, max: life }); if (dyn.length > 40) dyn.shift(); }
export function addHeat(v) { if (WORLD.kind !== 'city') return; setHeat(clamp(heat + v, 0, 100)); setHeatPeak(Math.max(heatPeak, heat)); }
function hearShot(src, r, x, z) {
  if (!r) return;
  const g = group(src);
  if (g === 'P') { setLastLoud(time); stats.shots++; if (src.kind === 'agent' && time - (src.noiseT || -9) > 0.35) { src.noiseT = time; addNoise(x, z, r); } }
  for (const p of people) {
    if (p.dead) continue;
    const d = Math.hypot(p.x - x, p.z - z); if (d > r) continue;
    if (p.fac === 'civ') { if (p.stun <= 0) { p.state = 'flee'; p.fx = x; p.fz = z; p.t = Rr(5, 9); } }
    else if (g === 'P' && (p.fac === 'law' || p.fac === 'corp')) alertNpc(p, src.x, src.z, 'heard');
  }
  if (WORLD.kind === 'city' && g === 'P' && target && target.model && !target.wreck && Math.hypot(target.x - x, target.z - z) < r + 6) spookVarga();
}
export function alertNpc(p, x, z, why) {
  if (p.dead || p.fac === 'follower') return;
  p.lastKnown = [x, z];
  if (p.alerted) return;
  p.alerted = true; p.sus = 1; p.path = null;
  if (p.kind === 'colonel') { colonelFlee(); return; }
  p.state = 'hunt';
  if (p.kind === 'cop') { p.armed = 1; addHeat(7); if (time - (MS.copSaid || -99) > 6) { MS.copSaid = time; say('OFFICER ALERTED // HEAT RISING', 'warn'); } }
  if (p.kind === 'militia') {
    p.shoutT = 0.8;
    if (!MS.firstAlert) { MS.firstAlert = time; say(why === 'body' ? 'A GUARD FOUND A BODY' : why === 'light' ? 'SEARCHLIGHT CONTACT' : why === 'heard' ? 'GUARDS HEARD GUNFIRE' : 'A GUARD SPOTTED THE SQUAD', 'warn'); }
  }
}
export function hurt(p, dmg, src) {
  if (p.dead) return;
  if (p.kind === 'agent') { dmg *= p.d.armor; p.lastHit = time; setLastCombat(time); }
  p.hp -= dmg; p.flash = 0.12;
  if (src && group(src) === 'P' && (p.fac === 'law' || p.fac === 'corp')) { setLastCombat(time); if (!p.alerted) alertNpc(p, src.x, src.z, 'hit'); }
  if (p.hp <= 0) kill(p, src);
  else if (p.fac === 'civ') { p.state = 'flee'; p.fx = src ? src.x : p.x; p.fz = src ? src.z : p.z; p.t = 8; }
}
function dropWeapon(p) {
  let id = p.weapon; if (!id || !WEAPONS[id]) return;
  if (WEAPONS[id].drop) id = WEAPONS[id].drop;
  const w = WEAPONS[id]; if (!w || w.npc) return;
  const sp = nearestOpen(p.x + Rr(-0.5, 0.5), p.z + Rr(-0.5, 0.5), 5) || [p.x, p.z];
  pickups.push({ id, x: sp[0], z: sp[1], mag: w.energy != null ? 0 : w.mag, res: 0, spin: R() * 6 });
}
/* someone killed up on a watchtower topples over the railing, away from the shooter, onto open ground */
function towerAt(x, z) { return WORLD.towers.find((t) => Math.abs(x - t.x) < t.half + 0.2 && Math.abs(z - t.z) < t.half + 0.2); }
function fallFromTower(p, src) {
  const t = p.tower || p.onTower || towerAt(p.x, p.z);
  p.elev = 0; p.onTower = null; p.climb = null;
  if (!t) { const sp = nearestOpen(p.x, p.z, 4); if (sp) { p.x = sp[0]; p.z = sp[1]; } return; }
  let dx = p.x - (src ? src.x : t.x + 1), dz = p.z - (src ? src.z : t.z); const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  const sp = nearestOpen(t.x + dx * (t.half + 1.6), t.z + dz * (t.half + 1.6), 5) || [t.x + dx * 3.5, t.z + dz * 3.5];
  p.x = sp[0]; p.z = sp[1];
  for (let i = 0; i < 6; i++) spawnP(p.x, 0.3, p.z, Rr(-2, 2), Rr(1, 2.5), Rr(-2, 2), [0.12, 0.11, 0.1], 0.2, 0.6, 6);
}
function kill(p, src) {
  p.dead = true; p.hp = 0; p.deadT = 0; p.aim = 0; p.walk = 0; p.umb = 0;
  if (p.elev) fallFromTower(p, src);
  else if (src && src.x != null) { const dx = p.x - src.x, dz = p.z - src.z, dl = Math.hypot(dx, dz) || 1, k = Rr(0.5, 1.1); if (cellOk(p.x + dx / dl * k, p.z + dz / dl * k)) { p.x += dx / dl * k; p.z += dz / dl * k; } p.yaw = Math.atan2(-dx, -dz); }
  if (p.burnT > 0) { p.burnT = 0; p.color = [0.05, 0.045, 0.04]; p.skin = [0.07, 0.05, 0.04]; p.rim = [0, 0, 0]; p.umb = 0; }
  addDecal(p.x, p.z, Rr(0.9, 1.4), [0.22, 0.02, 0.03]);
  for (let i = 0; i < 8; i++) spawnP(p.x, 1.1, p.z, Rr(-2, 2), Rr(1, 3), Rr(-2, 2), [0.5, 0.02, 0.04], 0.14, 0.5, 9);
  const byP = src && group(src) === 'P';
  if (byP && src.kind === 'agent') src.kills = (src.kills || 0) + 1;
  if (p.kind === 'civ' && byP) { stats.civ++; addHeat(p.fac === 'follower' ? 2 : 5); }
  if (p.kind === 'cop' && byP) { stats.cops++; addHeat(12); }
  if ((p.kind === 'corp' || p.kind === 'militia' || p.kind === 'colonel') && byP) stats.hostiles++;
  if (p.armed && p.kind !== 'agent') dropWeapon(p);
  if (p.kind === 'agent') {
    stats.lost++; say('AGENT ' + p.name + ' FLATLINED', 'bad'); selected.delete(p); sfx('alarm', p.x, p.z, 0.5);
    for (const id of p.slots) if (id && WEAPONS[id].kind !== 'jack') { const am = p.ammo[id] || { mag: 0, res: 0 }; pickups.push({ id, x: p.x + Rr(-0.6, 0.6), z: p.z + Rr(-0.6, 0.6), mag: am.mag, res: am.res, spin: 0 }); }
    if (p.link) dropLink(p.link, false);
  }
  if (p === target || (MS.vargaP && p === MS.vargaP)) targetDown();
  if (p.kind === 'courier' && !p.escaped) dropCase(p.x, p.z);
  hearShot(p, 8, p.x, p.z);
}
function dropCase(x, z) {
  if (MS.caseDropped) return;
  MS.caseDropped = true;
  const sp = nearestOpen(x, z, 4) || [x, z];
  pickups.push({ id: 'case', x: sp[0], z: sp[1], mag: 0, res: 0, spin: 0 });
  say('DATA CASE ON THE GROUND // PICK IT UP', 'warn');
}
function targetDown() {
  if (MS.objs[0].st !== 'open') return;
  if (MS.def.id === 'courier') { dropCase(target.x, target.z); return; }
  if (MS.def.id === 'halden') { setObj('kill', 'fail'); say('DR. HALDEN IS DEAD // CONTRACT LOST, GET OUT', 'bad'); return; }
  setObj('kill', 'done');
  say(MS.def.killMsg || (MS.def.id === 'varga' ? 'EXEC. VARGA ELIMINATED' : 'COLONEL RUSK ELIMINATED'), '');
  say(MS.def.extractMsg || (MS.def.world === 'city' ? 'EXTRACT AT THE NE PLAZA' : 'GET EVERYONE BACK TO THE VAN'), 'warn');
  if (MS.def.world === 'city') U.uPad.value = 1;
}
export function damageCar(c, dmg, src, type) {
  if (c.wreck) return;
  if (c.armor && !(c.armorOff > 0)) dmg *= c.armor[type || 'bullet'] ?? 1;
  c.hp -= dmg; c.flash = 0.1;
  if (src && group(src) === 'P') setLastCombat(time);
  if (c === target) spookVarga();
  if (c === MS.jeep && target && target.inCar === c && src && group(src) === 'P') {}
  if (c.hp <= 0) destroyCar(c, src);
}
function destroyCar(c, src) {
  if (c.wreck) return;
  c.wreck = 1; c.burn = 14; c.smoke = 45; c.speed = 0; c.wp = Rr(-0.07, 0.07); c.wr = Rr(-0.13, 0.13); c.yaw += Rr(-0.35, 0.35);
  for (let i = 0; i < 12; i++) { const a = R() * TAU, s = Rr(3, 8); spawnP(c.x, 1, c.z, Math.cos(a) * s, Rr(3, 7), Math.sin(a) * s, [0.08, 0.08, 0.09], Rr(0.12, 0.22), Rr(0.8, 1.4), 14, 0.2); }
  explode(c.x, c.z, c.fuel ? 9 : 5.5, c.fuel ? 220 : 110, src, true);
  addFire(c.x, c.z, c.fuel ? 5 : 2.4, c.fuel ? 16 : 12, src);
  for (const a of c.occ) { if (a.inCar !== c) continue; a.inCar = null; a.x = c.x + Rr(-1.5, 1.5); a.z = c.z + Rr(-1.5, 1.5); hurt(a, a.kind === 'agent' ? 90 : 400, src); }
  c.occ = [];
  if (c === target && !(MS.def.id === 'courier' && MS.courierOut) && !(MS.vargaP && !MS.vargaP.inCar && !MS.vargaP.dead)) targetDown();
  if (c === target && MS.vargaP && !MS.vargaP.inCar && !MS.vargaP.dead) { MS.vpanic = true; say('THE LIMO IS GONE // VARGA RUNS FOR THE TOWER DOOR', 'bad'); }
  if (src && group(src) === 'P') addHeat(c.driver === 'police' ? 8 : 4);
}
export function explode(x, z, r, dmg, src, big) {
  for (let i = 0; i < (big ? 70 : 45); i++) { const a = R() * TAU, s = Rr(2, 9); spawnP(x, Rr(0.3, 1.5), z, Math.cos(a) * s, Rr(1, 7), Math.sin(a) * s, R() < 0.5 ? [3.2, 1.4, 0.35] : [3.4, 2.6, 1.0], Rr(0.35, 0.8), Rr(0.3, 0.7), 2, 2.5); }
  for (let i = 0; i < 30; i++) { const a = R() * TAU, s = Rr(0.5, 3); spawnP(x, Rr(0.5, 2), z, Math.cos(a) * s, Rr(1, 3), Math.sin(a) * s, [0.12, 0.09, 0.14], Rr(0.8, 1.6), Rr(1.2, 2.4), -0.5, 0.8); }
  for (let i = 0; i < 26; i++) { const a = R() * TAU, s = Rr(6, 16); spawnP(x, 0.8, z, Math.cos(a) * s, Rr(3, 9), Math.sin(a) * s, [4, 3, 1.5], 0.1, Rr(0.3, 0.8), 18, 0.5); }
  addDyn(x, 2.5, z, big ? 26 : 20, [6, 3.2, 1.2], 0.9);
  setShake(Math.max(shake, big ? 0.9 : 0.6));
  addDecal(x, z, r * (big ? 1.25 : 1.05), [0.02, 0.02, 0.025], 1);
  sfx('explosion', x, z, big ? 1 : 0.85, big ? 0.85 : 1);
  for (const p of people) { if (p.dead || p.inCar) continue; const d = Math.hypot(p.x - x, p.z - z); if (d < r) hurt(p, dmg * Math.pow(1 - d / r, 0.7), src); }
  for (const c of cars) { if (c.wreck) continue; const d = Math.hypot(c.x - x, c.z - z); if (d < r + 1.5) damageCar(c, dmg * 0.9 * (1 - d / (r + 1.5)), src, 'blast'); }
  for (const b of barrels) { if (b.dead) continue; const d = Math.hypot(b.x - x, b.z - z); if (d < r + b.r) hurtBarrel(b, dmg * (1 - d / (r + b.r)) + 1, src); }
  for (const p of people) { if (p.dead || p.inCar || p.elev) continue; if (Math.hypot(p.x - x, p.z - z) < r * 0.55 && R() < 0.5) ignite(p, src); }
  if (big) addFire(x, z, r * 0.4, Rr(5, 8), src);
  panic(x, z, big ? 32 : 22);
  for (const t of turrets) { if (t.dead) continue; const d = Math.hypot(t.x - x, t.z - z); if (d < r + 0.5) hurtTurret(t, dmg * (1 - d / (r + 0.5)), src); }
  hearShot(src || { x, z, fac: 'civ' }, 50, x, z);
  if (src && group(src) === 'P') { setLastLoud(time); setLastCombat(time); }
}
function hurtTurret(t, dmg, src) {
  if (t.dead) return; t.hp -= dmg; t.flash = 0.1;
  if (t.hp <= 0) { t.dead = true; explode(t.x, t.z, 3, 60, src, false); say('SENTRY DESTROYED', ''); }
}
/* past a weapon's effective range shots keep flying but lose punch, down to 35% at the far end */
const reach = (w, range) => range * (w.kind === 'shot' ? 1.7 : w.kind === 'beam' ? 1.6 : 2.6);
const falloff = (d, range, far) => d <= range ? 1 : Math.max(0.35, 1 - 0.65 * (d - range) / Math.max(1, far - range));
function applyHits(shooter, res, dmg, kind, range, far) {
  for (const h of res.hits) {
    if (h.b) { hurtBarrel(h.b, dmg, shooter); continue; }
    const o = h.p || h.c || h.tu, dm = range && o ? dmg * falloff(Math.hypot(o.x - shooter.x, o.z - shooter.z), range, far) : dmg;
    if (h.p) hurt(h.p, dm, shooter);
    else if (h.c) damageCar(h.c, kind === 'beam' ? dm * 0.8 : dm * 0.55, shooter, kind);
    else if (h.tu) hurtTurret(h.tu, dm * 0.7, shooter);
  }
}
function darkAt(x, z) {
  for (const b of blackouts) if (Math.hypot(b.x - x, b.z - z) < b.r) return true;
  return false;
}
function litAt(x, z) {
  if (darkAt(x, z)) return false;
  for (const L of WORLD.lights) { if (L.off > 0) continue; const dx = L.x - x, dz = L.z - z, rr2 = L.r * 0.55; if (dx * dx + dz * dz < rr2 * rr2) return true; }
  for (const t of WORLD.towers) { if (t.spotOn && Math.hypot(t.spot[0] - x, t.spot[1] - z) < 3.6) return true; }
  return false;
}
function fire(sh, wname, tx, tz, extraSpread?) {
  const w = WEAPONS[wname];
  const yaw = Math.atan2(tx - sh.x, tz - sh.z);
  const sc = sh.scale || 1;
  const baseY = sh.elev || (sh.y != null ? sh.y : groundY(sh.x, sh.z));
  const mx = sh.x + Math.sin(yaw) * 0.75 * sc + Math.cos(yaw) * 0.3 * sc, mz = sh.z + Math.cos(yaw) * 0.75 * sc - Math.sin(yaw) * 0.3 * sc, my = baseY + 1.3 * sc;
  const per = sh.dose ? sh.dose.per : 0, crash = sh.crash > 0 ? 2.2 : 1;
  const d = sh.d || null;
  let range = w.range * (1 + 0.4 * per) * (d ? d.range : 1) * (sh.elev ? 1.3 : 1);
  let spread = (w.spread || 0) * (1 - 0.6 * per) * crash * (d ? d.aim * d.steady : 1) + (extraSpread || 0);
  if (d && !d.night && !litAt(tx, tz)) { spread *= 1.5; }
  const far = reach(w, range);
  sh.yaw = yaw; sh.aim = 1;
  const dropY = sh.elev ? -sh.elev * 0.8 : -0.15;
  if (w.kind === 'bullet' || w.kind === 'shot') {
    const n = w.kind === 'shot' ? w.pellets : 1;
    let ex = mx, ez = mz;
    for (let k = 0; k < n; k++) {
      const a = yaw + Rr(-spread, spread), dx = Math.sin(a), dz = Math.cos(a);
      const res = trace(sh, mx, mz, dx, dz, far, false);
      applyHits(sh, res, w.dmg, w.kind === 'shot' ? 'shot' : 'bullet', range, far);
      ex = mx + dx * res.end; ez = mz + dz * res.end;
      const h0 = res.hits[0], ho = h0 && (h0.p || h0.c || h0.tu);
      const miss = res.end >= far - 0.05, ey = miss ? groundY(ex, ez) + 0.05 : ho && ho.elev ? ho.elev + 1.1 : ho && sh.elev ? groundY(ex, ez) + 1.1 : my + dropY;   // a miss runs out into the ground
      tracer(mx, my, mz, ex, ey, ez, wname === 'turret' ? [3, 0.6, 0.4] : wname === 'rifle' ? [3, 3, 2.4] : [2.6, 1.9, 0.9], w.kind === 'shot' ? 0.04 : 0.05);
      if (k < 3) for (let i = 0; i < 2; i++) spawnP(ex, miss ? ey + 0.05 : my - 0.2, ez, Rr(-3, 3), Rr(0, 4), Rr(-3, 3), [3, 2, 0.8], 0.09, 0.18, 10);
    }
    spawnP(mx, my, mz, 0, 0, 0, [4, 2.8, 1.2], w.kind === 'shot' ? 0.6 : 0.35, 0.05);
    spawnP(mx - Math.sin(yaw) * 0.4, my - 0.1, mz - Math.cos(yaw) * 0.4, Math.cos(yaw) * Rr(1.2, 2.2), Rr(1.5, 2.5), -Math.sin(yaw) * Rr(1.2, 2.2), [1.5, 1.1, 0.35], 0.07, 0.55, 9);
    addDyn(mx, my, mz, 6, [2.2, 1.5, 0.7], 0.06);
    sfx(wname === 'minigun' || wname === 'turret' || wname === 'uzi' ? 'minigun' : wname === 'shotgun' ? 'impact' : 'pistol', mx, mz, wname === 'uzi' ? 0.45 : wname === 'silenced' ? 0.2 : 0.7, wname === 'rifle' ? 0.7 : wname === 'shotgun' ? 0.6 : wname === 'silenced' ? 1.8 : 1);
  } else if (w.kind === 'beam') {
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    const res = trace(sh, mx, mz, dx, dz, far, true);
    applyHits(sh, res, w.dmg, 'beam', range, far);
    const ex = mx + dx * res.end, ez = mz + dz * res.end;
    const col = sh.fac === 'corp' ? [3.6, 0.6, 1.4] : [3.2, 0.7, 1.6];
    tracer(mx, my, mz, ex, my, ez, col, 0.14); tracer(mx, my + 0.08, mz, ex, my + 0.08, ez, col.map((v) => v * 0.5), 0.1);
    for (let t = 0; t < res.end; t += 0.9) spawnP(mx + dx * t, my, mz + dz * t, Rr(-0.3, 0.3), Rr(0, 0.6), Rr(-0.3, 0.3), col.map((v) => v * 0.5), 0.12, Rr(0.15, 0.35));
    addDyn(mx, my, mz, 9, [2.5, 0.6, 1.3], 0.12);
    sfx('laser', mx, mz, 0.7, sh.fac === 'corp' ? 0.8 : 1);
  } else if (w.kind === 'flame') {
    flameShot(sh, w, yaw, range, mx, my, mz);
  } else if (w.kind === 'rocket') {
    const dd = Math.hypot(tx - mx, tz - mz) || 1;
    rockets.push({ x: mx, y: my, z: mz, vx: (tx - mx) / dd * 24, vz: (tz - mz) / dd * 24, life: Math.min(range * 1.6, dd) / 24, owner: sh });
    sfx('rocket', mx, mz, 0.9); addDyn(mx, my, mz, 8, [3, 1.5, 0.6], 0.1);
  }
  hearShot(sh, w.noise, sh.x, sh.z);
}
export function agentWeapon(a) { const id = a.slots[a.cur]; return id ? WEAPONS[id] : null; }
function agentDrawn(a) { return !a.dead && !!a.slots[a.cur] && (time - a.lastShot < 5 || !!a.ftarget || (a.fpoint && time < a.fpointT) || a.reloadT > 0 || time - a.lastHit < 3); }
function hasAmmo(a, id) { const w = WEAPONS[id]; if (!w) return false; if (w.energy != null) return true; const am = a.ammo[id]; return !!am && am.mag + am.res > 0; }
export function startReload(a) {
  const id = a.slots[a.cur]; if (!id) return; const w = WEAPONS[id]; const am = a.ammo[id];
  if (!am || w.energy != null || am.mag >= w.mag || a.reloadT > 0) return;
  if (am.res <= 0) {
    if (am.mag <= 0) {
      const other = a.slots[1 - a.cur];
      if (other && hasAmmo(a, other)) { a.cur = 1 - a.cur; say(a.name + ': ' + w.name + ' DRY // SWITCHING', 'warn'); hudSquad(); }
      else if (!a.drySaid || time - a.drySaid > 4) { say(a.name + ': OUT OF AMMO', 'bad'); a.drySaid = time; }
    }
    return;
  }
  a.reloadT = w.reload; sfx('ui', a.x, a.z, 0.5, 0.6);
}
function agentFire(a, tx, tz) {
  const id = a.slots[a.cur]; if (!id || a.reloadT > 0) return false;
  const w = WEAPONS[id];
  if (w.energy != null) {
    if (a.cell < w.energy) { if (!a.lowSaid || time - a.lowSaid > 3) { say(a.name + ': POWER CELL LOW', 'warn'); a.lowSaid = time; } return false; }
    a.cell -= w.energy;
  } else {
    const am = a.ammo[id]; if (!am || am.mag <= 0) { startReload(a); return false; }
    am.mag--;
  }
  a.lastShot = time;
  fire(a, id, tx, tz);
  const am = a.ammo[id]; if (am && am.mag <= 0) startReload(a);
  return true;
}
function npcFire(p, tx, tz, extra?) {
  const w = WEAPONS[p.weapon];
  if (p.reloadT > 0) return;
  if (w.mag && w.mag < 90) { if (p.mag <= 0) { p.reloadT = (w.reload || 1.5) * 1.3; p.mag = w.mag; return; } p.mag--; }
  fire(p, p.weapon, tx, tz, extra);
}

/* ================================================================ log */
let quietLog = false;
export function setQuietLog(v) { quietLog = v; }
export function say(msg, cls) {
  if (quietLog) return;
  const el = document.createElement('div'); el.textContent = '> ' + msg; if (cls) el.className = cls;
  const log = $('#log'); log.appendChild(el);
  while (log.children.length > 5) log.removeChild(log.firstChild);
  setTimeout(() => el.classList.add('old'), 6000); setTimeout(() => el.remove(), 6800);
}

/* ================================================================ simulation */
export function moveToward(p, tx, tz, spd, dt) {
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d < 0.05) return d;
  const st = Math.min(d, spd * dt), mx = dx / d * st, mz = dz / d * st;
  const nx = p.x + mx, nz = p.z + mz;
  if (cellOk(nx, nz)) { p.x = nx; p.z = nz; }
  else if (cellOk(nx, p.z)) p.x = nx;
  else if (cellOk(p.x, nz)) p.z = nz;
  p.yaw += angDiff(p.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 12);
  const hit = pushOutOfCars(p);
  if (hit && p.path && p.path.length && (p.detour !== hit || time - p.detourT > 2)) detourAround(p, hit);
  return d;
}
function detourAround(p, c) {
  const h = CAR_HALF[c.model] || CAR_HALF.sedan, sn = Math.sin(c.yaw), cs = Math.cos(c.yaw);
  const loc = (x, z) => { const dx = x - c.x, dz = z - c.z; return [dx * cs - dz * sn, dx * sn + dz * cs]; };
  const wld = (s, f) => ({ x: c.x + s * cs + f * sn, z: c.z - s * sn + f * cs });
  const [ps, pf] = loc(p.x, p.z), goal = p.path[0], [ts, tf] = loc(goal.x, goal.z);
  const side = Math.abs(ps) > 0.3 ? Math.sign(ps) : (Math.sign(ts) || 1), off = h[0] + 1.0, end = h[1] + 1.0;
  const w1 = wld(side * off, clamp(pf, -end, end)), w2 = wld(side * off, Math.sign(tf - pf || 1) * end);
  const pts = [w1, w2].filter((w) => cellOk(w.x, w.z));
  if (pts.length) { p.path.unshift(...pts); p.detour = c; p.detourT = time; }
}
const CAR_HALF = { sedan: [1.0, 2.2], police: [1.0, 2.2], van: [1.05, 2.4], limo: [1.0, 3.2], jeep: [1.0, 2.1], truck: [1.25, 3.45], spinner: [1.0, 2.2] };
function pushOutOfCars(p) {
  for (const c of cars) {
    if (c.gone) continue;
    const dx = p.x - c.x, dz = p.z - c.z; if (dx * dx + dz * dz > 16) continue;
    const h = CAR_HALF[c.model] || CAR_HALF.sedan, sn = Math.sin(c.yaw), cs = Math.cos(c.yaw);
    let s = dx * cs - dz * sn, f = dx * sn + dz * cs;
    const hw = h[0] + 0.32, hl = h[1] + 0.32;
    if (Math.abs(s) >= hw || Math.abs(f) >= hl) continue;
    if (hw - Math.abs(s) < hl - Math.abs(f)) s = (Math.sign(s) || 1) * hw; else f = (Math.sign(f) || 1) * hl;
    const nx = c.x + s * cs + f * sn, nz = c.z - s * sn + f * cs;
    if (cellOk(nx, nz)) { p.x = nx; p.z = nz; }
    return c;
  }
  return null;
}
export function followPath(p, spd, dt) {
  if (!p.path || !p.path.length) return false;
  const w = p.path[0], d = moveToward(p, w.x, w.z, spd, dt);
  if (d < 0.2) p.path.shift();
  return true;
}
function findHostile(p, range) {
  let best = null, bd = range;
  for (const o of people) {
    if (o.dead || o.inCar || o === p || !hostile(p, o)) continue;
    const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < bd && hasLOS(p, o)) { bd = d; best = o; }
  }
  if (group(p) === 'P') for (const t of turrets) { if (t.dead || t.friendly) continue; const d = Math.hypot(t.x - p.x, t.z - p.z); if (d < bd && hasLOS(p, t)) { bd = d; best = t; } }
  if (group(p) !== 'P' && p.alerted) for (const c of cars) { if (c.driver !== 'player' || c.wreck) continue; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; best = c; } }
  return best;
}
function tryPickup(a, it, forced) {
  if (it.id === 'case') { MS.hasCase = true; setObj('kill', 'done'); U.uPad.value = 1; say(a.name + ' HAS THE DATA CASE // EXTRACT AT THE NE PLAZA', 'warn'); sfx('zap', a.x, a.z, 0.6, 1.3); return true; }
  const w = WEAPONS[it.id];
  capture(it.id);
  const si = a.slots.indexOf(it.id);
  if (si >= 0) {
    if (w.energy == null) { const am = a.ammo[it.id] || (a.ammo[it.id] = { mag: 0, res: 0 }); const room = Math.max(0, w.mag * w.mags - am.mag - am.res), n = Math.min(room, it.mag + it.res); am.res += n; if (n) say(a.name + ': ' + w.name + ' AMMO +' + n, ''); else return false; }
    else a.cell = 100;
    sfx('ui', a.x, a.z, 0.5, 1.4); return true;
  }
  const empty = a.slots.indexOf(null), cur = a.slots.reduce((s, id) => s + (id ? WEAPONS[id].w : 0), 0) + (a.gear ? GEAR[a.gear].w : 0);
  if (empty >= 0) {
    if (cur + w.w > a.d.cap + 3) { if (forced) say(a.name + ': ' + w.name + ' TOO HEAVY // NEEDS STRONGER ARMS', 'warn'); return false; }
    if (cur + w.w > a.d.cap && !forced) return false;
    a.slots[empty] = it.id; a.ammo[it.id] = { mag: it.mag, res: it.res }; a.cur = empty;
    say(a.name + ' TOOK THE ' + w.name + (agentLoad(a) > a.d.cap ? ' // OVERLOADED, MOVING SLOWER' : ''), agentLoad(a) > a.d.cap ? 'warn' : ''); sfx('ui', a.x, a.z, 0.6, 1.4); hudSquad(); return true;
  }
  if (!forced) return false;
  const old = a.slots[a.cur], ow = old ? WEAPONS[old].w : 0;
  if (cur - ow + w.w > a.d.cap + 3) { say(a.name + ': ' + w.name + ' TOO HEAVY // NEEDS STRONGER ARMS', 'warn'); return false; }
  if (old) { const am = a.ammo[old] || { mag: 0, res: 0 }; pickups.push({ id: old, x: a.x + 0.7, z: a.z + 0.3, mag: am.mag, res: am.res, spin: 0, cool: 2 }); delete a.ammo[old]; }
  a.slots[a.cur] = it.id; a.ammo[it.id] = { mag: it.mag, res: it.res };
  say(a.name + ' SWAPPED FOR THE ' + w.name + (agentLoad(a) > a.d.cap ? ' // OVERLOADED, MOVING SLOWER' : ''), agentLoad(a) > a.d.cap ? 'warn' : ''); sfx('ui', a.x, a.z, 0.6, 1.4); hudSquad(); return true;
}
function agentLoad(a) { return a.slots.reduce((s, id) => s + (id ? WEAPONS[id].w : 0), 0) + (a.gear ? GEAR[a.gear].w : 0); }
function capture(id) {
  if (id === 'case' || SAVE.avail.includes(id) || !WEAPONS[id] || WEAPONS[id].npc) return;
  SAVE.avail.push(id); MS.captured.push(id);
  say('TECH CAPTURED: ' + WEAPONS[id].name + ' // NOW IN THE ARMOURY', 'warn');
}
function updateAgent(a, dt) {
  if (a.dead) { a.deadT = Math.min(1, a.deadT + dt * 3); return; }
  if (a.inCar) { a.x = a.inCar.x; a.z = a.inCar.z; return; }
  const d = a.d, crash = a.crash > 0 ? 0.55 : 1;
  const dsum = a.dose.adr + a.dose.per + a.dose.int;
  if (a.crash > 0) { a.crash -= dt; if (a.crash <= 0) a.sync = 0.5; }
  else if (dsum > 0.05) { a.sync -= dsum * 0.018 * d.drain * dt; if (a.sync <= 0) { a.sync = 0; a.crash = 8; a.dose = { adr: 0, per: 0, int: 0 }; say('AGENT ' + a.name + ': NEURAL CRASH', 'bad'); } }
  else a.sync = Math.min(1, a.sync + 0.04 * d.rec * dt);
  if (a.healT > 0) { a.healT -= dt; a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.3 * dt); }
  if (d.regen && time - a.lastHit > 5) a.hp = Math.min(a.maxHp, a.hp + a.maxHp * d.regen * dt);
  a.cell = Math.min(100, a.cell + 5 * (resDone('cells') ? 1.6 : 1) * dt);
  const id = a.slots[a.cur], w = id ? WEAPONS[id] : null;
  if (a.reloadT > 0) { a.reloadT -= dt; if (a.reloadT <= 0) { a.reloadT = 0; const am = a.ammo[id]; if (am) { const take = Math.min(w.mag - am.mag, am.res); am.mag += take; am.res -= take; } } }
  const speed = (a.run ? 5.4 : 2.9) * d.speed * (1 + 0.6 * a.dose.adr) * crash * (agentLoad(a) > d.cap ? 0.65 : 1);
  const rof = (1 + 0.6 * a.dose.adr) * crash;
  // uplink connection
  if (a.jackTo) {
    const u = a.jackTo, dd = Math.hypot(u.x - a.x, u.z - a.z);
    if (dd < 1.7) {
      a.path = null; a.walk = lerp(a.walk, 0, Math.min(1, dt * 8));
      a.linkT += dt * d.hack; a.yaw += angDiff(a.yaw, Math.atan2(u.x - a.x, u.z - a.z - 0.9)) * Math.min(1, dt * 8);
      if (a.linkT >= 3) { a.jackTo = null; a.link = u; u.agent = a; say('UPLINK CONNECTED // ' + u.label, ''); sfx('hack', null, null, 0.7, 0.8); }
      return;
    } else if (!a.path || !a.path.length) { a.path = findPath(a.x, a.z, u.x, u.z); if (!a.path) a.jackTo = null; }
  }
  if (a.link) { a.walk = lerp(a.walk, 0, Math.min(1, dt * 8)); a.aim = 0; return; }
  // watchtower ladder: walk to its foot, climb, and fight from the platform until ordered down
  if (a.climbTo && !a.climb && (!a.path || !a.path.length)) {
    const t = a.climbTo, lad = t.ladder;
    if (Math.hypot(lad[0] - a.x, lad[1] - a.z) < 0.9) { a.climb = { t, k: 0, dir: 1 }; a.climbTo = null; a.x = lad[0]; a.z = t.z + t.half + 0.25; a.yaw = Math.PI; }
    else { a.path = findPath(a.x, a.z, lad[0], lad[1]); if (!a.path) a.climbTo = null; }
  }
  if (a.climb) {
    const c = a.climb, t = c.t; c.k = clamp(c.k + c.dir * dt / 2.2, 0, 1);
    a.elev = c.k * t.y; a.walk = 0.5; a.phase += dt * 4; a.aim = 0; a.yaw = Math.PI;
    if (c.dir > 0 && c.k >= 1) {
      const n = agents.filter((o) => o !== a && o.onTower === t).length, slot = [[-0.7, 0.3], [0.7, 0.3], [-0.7, -0.6], [0.7, -0.6]][n % 4];
      a.climb = null; a.onTower = t; a.elev = t.y; a.x = t.x + slot[0]; a.z = t.z + slot[1]; a.path = null;
      say(a.name + ': ON THE TOWER // RANGE UP', '');
    } else if (c.dir < 0 && c.k <= 0) {
      a.climb = null; a.elev = 0; a.x = t.ladder[0]; a.z = t.ladder[1];
      if (c.then) { a.path = findPath(a.x, a.z, c.then[0], c.then[1]); a.run = c.then[2]; if (c.then[3]) a.climbTo = c.then[3]; }
    }
    return;
  }
  if (a.onTower) { a.path = null; a.elev = a.onTower.y; }
  let tgt = a.ftarget;
  if (tgt && (tgt.dead || tgt.wreck || (tgt.fac === 'follower' && w && w.kind === 'jack'))) { tgt = a.ftarget = null; }
  const moving = followPath(a, speed, dt);
  if (!moving) a.run = false;
  a.walk = lerp(a.walk, moving ? (a.run ? 1.3 : 1) : 0, Math.min(1, dt * 10));
  if (moving) a.phase += dt * speed * (a.run ? 2.2 : 3.0);
  for (let i = pickups.length - 1; i >= 0 && !a.onTower; i--) {
    const it = pickups[i]; if (it.cool > 0) continue;
    if (Math.hypot(it.x - a.x, it.z - a.z) > 1.2) continue;
    if (tryPickup(a, it, a.pickTarget === it)) { pickups.splice(i, 1); if (a.pickTarget === it) a.pickTarget = null; }
    else if (a.pickTarget === it) a.pickTarget = null;
  }
  a.cd -= dt * rof;
  a.armed = agentDrawn(a) ? 1 : 0;
  if (!w) { a.aim = Math.max(0, a.aim - dt * 3); return; }
  const range = (w.range || 8) * (1 + 0.4 * a.dose.per) * d.range;
  if (w.kind === 'jack') {
    a.aim = Math.max(0, a.aim - dt * 3);
    if (tgt && tgt.kind) {
      const dd = Math.hypot(tgt.x - a.x, tgt.z - a.z);
      if (dd > range) { if (!a.path || !a.path.length || a.repath < time) { a.path = findPath(a.x, a.z, tgt.x, tgt.z); a.repath = time + 1; } a.jackT = 0; }
      else {
        a.path = null; a.yaw += angDiff(a.yaw, Math.atan2(tgt.x - a.x, tgt.z - a.z)) * Math.min(1, dt * 10); a.aim = 0.6;
        const need = tgt.kind === 'cop' ? 2 : tgt.kind === 'corp' || tgt.kind === 'militia' ? 6 : tgt.kind === 'colonel' || tgt.kind === 'exec' ? 99 : 0;
        const fol = people.filter((p) => !p.dead && p.fac === 'follower').length;
        if (fol < need) { if (!a.needSaid || time - a.needSaid > 4) { say(need > 50 ? 'THE COLONEL IS TOO STRONG-WILLED' : 'MIND-JACK NEEDS ' + need + ' FOLLOWERS FOR THAT TARGET', 'warn'); a.needSaid = time; } a.ftarget = null; }
        else if (a.jackT === 0 && a.cell < w.energy) { if (!a.lowSaid || time - a.lowSaid > 3) { say(a.name + ': POWER CELL LOW', 'warn'); a.lowSaid = time; } }
        else {
          if (a.jackT === 0) { a.cell -= w.energy; sfx('mindjack', a.x, a.z, 0.8); }
          a.jackT += dt * (1 + a.dose.int) * d.hack;
          beams.push([a, tgt]); tgt.stun = Math.max(tgt.stun, 0.2);
          if (a.jackT >= w.chan * (tgt.kind === 'civ' ? 1 : 2.2)) { persuade(tgt); a.jackT = 0; a.ftarget = null; }
        }
      }
    } else a.jackT = 0;
    return;
  }
  a.react -= dt;
  if (!tgt && a.fpoint && time < a.fpointT) {
    a.yaw = Math.atan2(a.fpoint[0] - a.x, a.fpoint[1] - a.z); a.aim = 1;
    if (a.cd <= 0) { if (agentFire(a, a.fpoint[0], a.fpoint[1])) a.cd = 1 / w.rof; if (w.kind === 'rocket') a.fpoint = null; }
    return;
  }
  if (!tgt && a.react <= 0) { a.auto = findHostile(a, range); a.react = 0.55 * (1 - 0.8 * a.dose.int) * d.react; }
  if (!tgt && a.auto && (a.auto.dead || a.auto.wreck)) a.auto = null;
  const T = tgt || a.auto;
  if (T) {
    const dd = Math.hypot(T.x - a.x, T.z - a.z);
    if (dd > range) { a.aim = Math.max(0, a.aim - dt * 3); if (tgt && (!a.path || !a.path.length || a.repath < time)) { a.path = findPath(a.x, a.z, T.x, T.z); a.repath = time + 1; a.run = true; } if (!tgt) a.auto = null; return; }
    if (tgt && !hasLOS(a, T)) { if (!a.path || !a.path.length || a.repath < time) { a.path = findPath(a.x, a.z, T.x, T.z); a.repath = time + 1; a.run = true; } }
    else if (tgt && a.path && a.path.length) a.path = null;
    a.yaw = Math.atan2(T.x - a.x, T.z - a.z); a.aim = 1;
    if (a.cd <= 0 && hasLOS(a, T)) { if (agentFire(a, T.x, T.z)) { a.cd = 1 / w.rof; setLastCombat(time); } }
  } else a.aim = Math.max(0, a.aim - dt * 2);
}
function persuade(p) {
  if (p.dead) return;
  p.fac = 'follower'; p.state = 'follow'; p.umb = 0; p.coat = Math.max(p.coat, 1); p.rim = [0.3, 1, 0.85]; p.stun = 0; p.path = null; p.alerted = false;
  p.leader = agents.filter((a) => !a.dead)[0] || null; p.slot = Math.floor(R() * 12);
  stats.jacked++; addHeat(1);
  if (p.kind === 'courier') { dropCase(p.x, p.z); say('THE COURIER DROPPED THE CASE', ''); }
  if (p === target && MS.def.id === 'halden') { setObj('kill', 'done'); U.uPad.value = 1; say('DR. HALDEN IS WITH US // WALK HER TO THE NE PLAZA', 'warn'); for (const g of people) if (g.guard === p && !g.dead) alertNpc(g, p.x, p.z, 'seen'); }
  for (let i = 0; i < 14; i++) spawnP(p.x, 1.7, p.z, Rr(-1.5, 1.5), Rr(0.5, 2.5), Rr(-1.5, 1.5), [0.6, 2.4, 2.0], 0.12, 0.5);
  say((p.kind === 'civ' ? 'CIVILIAN' : p.kind === 'cop' ? 'OFFICER' : 'GUARD') + ' JACKED // FOLLOWING SQUAD', '');
}
/* walk the sidewalk graph: at a segment end turn the corner (or now and then cross the street) */
function pedArrive(p, end) {
  const g = PEDS[p.seg], links = g.links[end].filter(([si]) => PEDS[si].inside), node = RN.nodes[end ? g.nb : g.na];
  if (!links.length) { p.dir = -p.dir; return; }
  // links are sorted nearest first: the nearest is the same pavement round the corner, the rest cross a road
  let pick = links[0];
  if (links.length > 1 && node.deg > 2 && R() < (p.state === 'patrol' ? 0.3 : 0.35)) pick = Rpick(links.slice(1));
  const [si, se] = pick, dest = se ? PEDS[si].p1 : PEDS[si].p0, d = Math.hypot(dest[0] - p.x, dest[1] - p.z);
  const nd = se ? -1 : 1;
  if (d < 2.2) { p.seg = si; p.s = se ? PEDS[si].len : 0; p.dir = nd; return; }
  p.cstate = p.state; p.state = 'cross'; p.nseg = si; p.ns = se ? PEDS[si].len : 0; p.ndir = nd; p.tx = dest[0]; p.tz = dest[1];
}
function updateCivLike(p, dt) {
  if (p.state === 'walk' || p.state === 'patrol') {
    if (WORLD.kind !== 'city' || !PEDS || p.seg == null) { p.walk = 0; return; }
    const g = PEDS[p.seg];
    p.s += p.dir * p.speed * dt;
    if (p.s > g.len) { p.s = g.len; pedArrive(p, 1); } else if (p.s < 0) { p.s = 0; pedArrive(p, 0); }
    if (p.state !== 'cross') {
      const pp = pedPos(p.seg, p.s), lat = p.lat || 0;
      p.x = pp[0] - pp[3] * lat; p.z = pp[1] + pp[2] * lat;
      p.yaw += angDiff(p.yaw, Math.atan2(pp[2] * p.dir, pp[3] * p.dir)) * Math.min(1, dt * 8);
    }
    p.walk = 1; p.phase += dt * p.speed * 3.2;
  } else if (p.state === 'cross') {
    const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
    if (d < 0.25) { p.state = p.cstate || 'walk'; p.seg = p.nseg; p.s = p.ns; p.dir = p.ndir; }
    else { p.x += dx / d * p.speed * dt; p.z += dz / d * p.speed * dt; p.yaw += angDiff(p.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 8); }
    p.walk = 1; p.phase += dt * p.speed * 3.2;
  } else if (p.state === 'flee') {
    p.t -= dt;
    let dx = p.x - p.fx, dz = p.z - p.fz; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const a = Math.atan2(dx, dz) + Math.sin(time * 2 + p.id) * 0.5;
    moveToward(p, p.x + Math.sin(a) * 3, p.z + Math.cos(a) * 3, 4.3, dt);
    p.walk = 1; p.phase += dt * 4.3 * 2.6;
    if (p.t <= 0) startReturn(p);
  } else if (p.state === 'return') {
    if (!followPath(p, p.speed * 1.3, dt) || time > p.t) { p.seg = p.rseg; p.s = p.rs; p.lat = 0; p.state = p.kind === 'cop' ? 'patrol' : 'walk'; }
    p.walk = 1; p.phase += dt * p.speed * 3.4;
  }
}
function startReturn(p) {
  if (WORLD.kind !== 'city' || !PEDS) { p.state = 'walk'; return; }
  const [seg, s0] = nearestPed(p.x, p.z, true), lp = pedPos(seg, s0);
  p.path = findPath(p.x, p.z, lp[0], lp[1]) || [{ x: lp[0], z: lp[1] }];
  p.rseg = seg; p.rs = s0; p.state = 'return'; p.t = time + 20;
}
function perceive(p, dt) {
  let best = 0, who = null;
  for (const a of agents) {
    if (a.dead || a.inCar) continue;
    const dx = a.x - p.x, dz = a.z - p.z, d = Math.hypot(dx, dz);
    const drawn = a.armed;
    if (p.kind === 'cop' && !drawn) continue;
    let range = p.kind === 'cop' ? 14 : (a.lit ? 15 : 6.5);
    if (p.elev) range += 6;
    if (d > range) continue;
    if (d > 2.5 && Math.abs(angDiff(p.yaw, Math.atan2(dx, dz))) > 1.0) continue;
    if (!hasLOS(p, a)) continue;
    const rate = (p.kind === 'cop' ? 2.5 : 1.1) * (1 + (range - d) / range * 2) * (drawn ? 1.6 : 1);
    if (rate > best) { best = rate; who = a; }
  }
  if (!who && p.kind !== 'cop') for (const q of people) {
    if (!q.dead || q.seen || !(q.kind === 'militia' || q.kind === 'colonel')) continue;
    const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
    if (d < 9 && Math.abs(angDiff(p.yaw, Math.atan2(dx, dz))) < 1.0 && hasLOS(p, q)) { q.seen = true; alertNpc(p, q.x, q.z, 'body'); return; }
  }
  if (who) { p.sus = Math.min(1, p.sus + best * dt); p.susAt = [who.x, who.z]; if (p.sus >= 1) alertNpc(p, who.x, who.z, 'seen'); }
  else p.sus = Math.max(0, p.sus - 0.2 * dt);
}
export function updatePerson(p, dt) {
  if (p.flash > 0) p.flash -= dt;
  if (p.dead) { p.deadT = Math.min(1, p.deadT + dt * 3); return; }
  if (p.burnT > 0 && !p.inCar && burnTick(p, dt)) return;
  if (p.kind === 'agent') return updateAgent(p, dt);
  if (p.inCar) { p.x = p.inCar.x; p.z = p.inCar.z; return; }
  if (p.stun > 0) { p.stun -= dt; p.walk = lerp(p.walk, 0, Math.min(1, dt * 8)); return; }
  if (p.fac === 'follower') return updateFollower(p, dt);
  if (p.kind === 'civ') return updateCivLike(p, dt);
  return updateHostile(p, dt);
}
function updateFollower(p, dt) {
  if (!p.leader || p.leader.dead) p.leader = agents.filter((a) => !a.dead)[0];
  const L = p.leader; if (!L) { p.walk = 0; return; }
  // unarmed followers grab guns lying nearby, as persuaded crowds did in Syndicate
  if (!p.weapon && !p.grabT) {
    const it = pickups.find((q) => q.id !== 'case' && WEAPONS[q.id] && WEAPONS[q.id].kind !== 'jack' && !q.claim && Math.hypot(q.x - p.x, q.z - p.z) < 8);
    if (it) { it.claim = p; p.grab = it; p.path = findPath(p.x, p.z, it.x, it.z); }
    p.grabT = 1;
  }
  if (p.grabT) p.grabT = Math.max(0, p.grabT - dt);
  if (p.grab) {
    const it = p.grab;
    if (!pickups.includes(it)) p.grab = null;
    else if (Math.hypot(it.x - p.x, it.z - p.z) < 1.1) {
      const w = WEAPONS[it.id]; p.weapon = it.id; p.armed = 1; p.mag = w.mag || 99; pickups.splice(pickups.indexOf(it), 1); p.grab = null;
      say('FOLLOWER PICKED UP A ' + w.name, ''); sfx('ui', p.x, p.z, 0.4, 0.7);
    } else { if (!followPath(p, 3.6, dt)) moveToward(p, it.x, it.z, 3.6, dt); p.walk = 1; p.phase += dt * 3.6 * 2.8; return; }
  }
  if (p.weapon && p.armed) {
    p.cd -= dt; p.react -= dt; if (p.reloadT > 0) p.reloadT -= dt;
    if (p.react <= 0) { p.auto = findHostile(p, WEAPONS[p.weapon].range); p.react = 0.6; }
    if (p.auto && !p.auto.dead && !p.auto.wreck) {
      p.yaw = Math.atan2(p.auto.x - p.x, p.auto.z - p.z); p.aim = 1;
      if (p.cd <= 0 && hasLOS(p, p.auto)) { npcFire(p, p.auto.x, p.auto.z); p.cd = 1 / WEAPONS[p.weapon].rof; }
    } else p.aim = Math.max(0, p.aim - dt * 2);
  }
  const lx = L.inCar ? L.inCar.x : L.x, lz = L.inCar ? L.inCar.z : L.z;
  const a = p.slot / 12 * TAU, tx = lx + Math.sin(a) * (1.8 + (p.slot % 3) * 0.8), tz = lz + Math.cos(a) * (1.8 + (p.slot % 3) * 0.8);
  const d = Math.hypot(tx - p.x, tz - p.z);
  if (d > 1.2) {
    if (d > 6 && (!p.path || !p.path.length || p.repath < time)) { p.path = findPath(p.x, p.z, tx, tz); p.repath = time + 1.5; }
    const spd = d > 4 ? 4.6 : 3;
    if (!followPath(p, spd, dt)) moveToward(p, tx, tz, spd, dt);
    p.walk = 1; p.phase += dt * spd * 2.8;
  } else p.walk = lerp(p.walk, 0, Math.min(1, dt * 6));
}
function colonelFlee() {
  const c = target; if (!c || c.dead || c.state === 'flee' || c.inCar) return;
  c.alerted = true; c.state = 'flee';
  const j = MS.jeep;
  if (j && !j.wreck) c.path = findPath(c.x, c.z, j.x - 1.6, j.z);
  say('THE COLONEL IS RUNNING FOR HIS JEEP', 'bad');
  for (const g of people) if (g.guard === c && !g.dead) { g.alerted = true; g.state = 'hunt'; }
}
function updateColonel(p, dt) {
  if (p.state === 'flee') {
    const j = MS.jeep;
    if (!j || j.wreck) { p.state = 'hunt'; return updateHostile(p, dt, true); }
    if (Math.hypot(j.x - p.x, j.z - p.z) < 2.6) {
      p.inCar = j; j.occ = [p]; j.driver = 'script'; j.parked = false; j.roam = false; j.cruise = 9;
      j.route = [{ pt: [140, 64] }, { pt: [124, 62] }, { pt: [ROADX, 58] }, { pt: [ROADX, 40] }, { pt: [ROADX, -14] }];
      j.onArrive = () => { if (target && !target.dead && target.inCar === j) { setObj('kill', 'fail'); say('THE COLONEL ESCAPED', 'bad'); j.parked = true; j.gone = true; } };
      pickNext(j); say('THE COLONEL IS IN HIS JEEP // NORTH GATE', 'bad'); sfx('door', j.x, j.z, 0.8);
      return;
    }
    if (!p.path || !p.path.length) p.path = findPath(p.x, p.z, j.x - 1.6, j.z);
    if (followPath(p, 4.2, dt)) { p.walk = 1.2; p.phase += dt * 4.2 * 2.4; }
    p.aim = 0; return;
  }
  return updateHostile(p, dt, true);
}
function updateCourier(p, dt) {
  if (p.wait > 0) { p.wait -= dt; p.walk = 0; return; }   // grabbing the case out of the van
  const [cx, cz] = WORLD.corpC, tx = cx, tz = cz + 9.5;
  if (!p.path || !p.path.length || p.repath < time) { p.path = findPath(p.x, p.z, tx, tz); p.repath = time + 2; }
  if (followPath(p, 3.9, dt)) { p.walk = 1.2; p.phase += dt * 3.9 * 2.4; }
  if (Math.hypot(p.x - tx, p.z - tz) < 2.2) enterTower(p, 'THE COURIER IS AT THE TOWER DOOR', 'THE COURIER GOT INSIDE WITH THE CASE // DATA LOST');
}
const towerDoor = (): [number, number] => [WORLD.corpC[0], WORLD.corpC[1] + 8.2];
function updateVarga(dt) {
  const V = MS.vargaP, c = target; if (!V || V.dead || !c) return;
  if (MS.vphase === 'roam' && missionT > MS.stopAt && !MS.spooked && !c.wreck && !c.gone && c.stall <= 0) {
    MS.vphase = 'drive'; c.roam = false; c.cruise = 6.5;
    const [dx, dz] = towerDoor(); driveTo(c, dx, dz + 4);
    c.onArrive = (car) => {
      if (MS.vphase !== 'drive' || car.wreck) return;
      MS.vphase = 'out'; car.parked = true; car.speed = 0; MS.waitT = 14;
      for (const p of car.occ.slice()) { if (p.inCar !== car) continue; p.inCar = null; const sp = nearestOpen(car.x + Rr(-1.5, 1.5), car.z + Rr(-2, 2), 4) || [car.x, car.z]; p.x = sp[0]; p.z = sp[1]; }
      car.occ = [];
      V.path = findPath(V.x, V.z, ...towerDoor()); say('VARGA STEPPED OUT AT THE MERIDIAN TOWER', 'warn');
    };
  }
}
function updateExec(p, dt) {
  if (p.inCar) return;
  const c = target, car = c && !c.wreck && !c.gone ? c : null;
  const go = (x, z, spd) => { if (!p.path || !p.path.length || p.repath < time) { p.path = findPath(p.x, p.z, x, z); p.repath = time + 1.5; } if (followPath(p, spd, dt)) { p.walk = spd > 2 ? 1.2 : 1; p.phase += dt * spd * (spd > 2 ? 2.4 : 3.2); return Math.hypot(p.x - x, p.z - z); } p.walk = lerp(p.walk, 0, Math.min(1, dt * 6)); return Math.hypot(p.x - x, p.z - z); };
  const [dx, dz] = towerDoor();
  if (!car) MS.vpanic = true;
  if (MS.vpanic && !car) { if (go(dx, dz, 4) < 1.5) enterTower(p, 'VARGA IS AT THE TOWER DOOR', 'VARGA MADE IT INSIDE THE TOWER'); return; }
  if (MS.vpanic || MS.waitT <= 0) {
    if (go(car.x, car.z, MS.vpanic ? 4 : 1.4) < 2) {
      p.inCar = car; p.path = null; car.occ = [p];
      for (const g of people) if (g.guard === p && !g.dead && !g.alerted) { g.inCar = car; car.occ.push(g); }
      car.parked = false; car.idle = true; car.route = null; car.node = nearestNode(car.x, car.z); car.onArrive = null;
      MS.vphase = 'roam'; MS.stopAt = missionT + 110;
      if (MS.vpanic) { MS.vpanic = false; MS.spooked = false; spookVarga(); } else { car.roam = true; pickNext(car); }
    }
    return;
  }
  if (go(dx, dz, 1.4) < 0.8) { MS.waitT -= dt; p.yaw += angDiff(p.yaw, 0) * Math.min(1, dt * 3); }
}
/* walk through the tower's glass door: the door lights up, they step inside and the building hides them */
export function enterTower(p, atMsg, inMsg) {
  if (p.state === 'entering') return;
  const d = WORLD.door || { x: WORLD.corpC[0], z: WORLD.corpC[1] + 6.5, n: [0, 1] }, tx = -d.n[1], tz = d.n[0], o = clamp((p.x - d.x) * tx + (p.z - d.z) * tz, -1.2, 1.2);
  p.state = 'entering'; p.path = null; p.enterMsg = inMsg; p.enterI = 0;
  p.enterPts = [[d.x + tx * o + d.n[0] * 0.9, d.z + tz * o + d.n[1] * 0.9], [d.x + tx * o * 0.5 - d.n[0] * 3, d.z + tz * o * 0.5 - d.n[1] * 3]];
  addDyn(d.x + d.n[0] * 0.7, 1.8, d.z + d.n[1] * 0.7, 9, [0.8, 2.2, 2.6], 1.6); sfx('door', d.x, d.z, 1);
  say(atMsg, 'bad');
}
export function updateEntering(p, dt) {
  const t = p.enterPts[p.enterI], dx = t[0] - p.x, dz = t[1] - p.z, d = Math.hypot(dx, dz), sp = 2.6;
  if (p.enterI === 1 && R() < dt * 6 && WORLD.door) addDyn(WORLD.door.x + WORLD.door.n[0] * 0.5, 1.6, WORLD.door.z + WORLD.door.n[1] * 0.5, 6, [0.5, 1.6, 1.9], 0.25);
  if (d < 0.2) {
    if (++p.enterI >= p.enterPts.length) { p.escaped = true; p.dead = true; p.x = -999; setObj('kill', 'fail'); say(p.enterMsg, 'bad'); }
    return;
  }
  p.x += dx / d * Math.min(d, sp * dt); p.z += dz / d * Math.min(d, sp * dt);
  p.yaw = Math.atan2(dx, dz); p.walk = 1; p.phase += dt * sp * 3; p.aim = 0;
}
function updateHostile(p, dt, skipColonel?) {
  if (p.kind === 'colonel' && !skipColonel) return updateColonel(p, dt);
  if (p.state === 'entering') return updateEntering(p, dt);
  if (p.kind === 'chairman') return updateChairman(p, dt);
  if (p.kind === 'courier') return updateCourier(p, dt);
  if (p.kind === 'exec') return updateExec(p, dt);
  if (p.reloadT > 0) p.reloadT -= dt;
  if (!p.alerted) {
    p.perc = (p.perc || 0) - dt;
    if (p.perc <= 0) { perceive(p, 0.2 + Math.max(0, -p.perc)); p.perc = 0.2; }
    if (p.alerted) return;
    if (p.kind === 'cop' || p.kind === 'civ' || (p.walker && (p.state === 'patrol' || p.state === 'cross'))) { updateCivLike(p, dt); return; }
    if (p.sus > 0.25 && p.susAt) { p.yaw += angDiff(p.yaw, Math.atan2(p.susAt[0] - p.x, p.susAt[1] - p.z)) * Math.min(1, dt * 4); p.walk = lerp(p.walk, 0, Math.min(1, dt * 6)); return; }
    if (p.state === 'patrol' && p.wp) {
      const w = p.wp[p.wi];
      if (moveToward(p, w[0], w[1], 1.3, dt) < 0.3) p.wi = (p.wi + 1) % p.wp.length;
      p.walk = 1; p.phase += dt * 1.3 * 3.2; return;
    }
    if (p.guard && p.state === 'escort') {
      const g = p.guard;
      if (g.inCar && !g.dead) { p.inCar = g.inCar; if (!g.inCar.occ.includes(p)) g.inCar.occ.push(p); return; }
      if (g.dead || g.fac === 'follower') { alertNpc(p, g.x, g.z, 'seen'); return; }
      const tx = g.x + p.goff[0], tz = g.z + p.goff[1], d = Math.hypot(tx - p.x, tz - p.z);
      if (d > 0.4) { const spd = d > 3 ? 3.6 : 1.5; if (d > 8 && (!p.path || !p.path.length || p.repath < time)) { p.path = findPath(p.x, p.z, tx, tz); p.repath = time + 1; } if (!followPath(p, spd, dt)) moveToward(p, tx, tz, spd, dt); p.walk = 1; p.phase += dt * spd * 3; }
      else { p.walk = lerp(p.walk, 0, Math.min(1, dt * 6)); p.yaw += angDiff(p.yaw, g.yaw) * Math.min(1, dt * 3); }
      return;
    }
    if (p.kind === 'corp' && !p.alerted) { p.walk = 0; return; }
    p.walk = lerp(p.walk, 0, Math.min(1, dt * 6));
    p.yaw = (p.postYaw || 0) + Math.sin(time * 0.4 + p.id) * 0.6;
    return;
  }
  if (p.shoutT > 0) { p.shoutT -= dt; if (p.shoutT <= 0) for (const o of people) if (!o.dead && !o.alerted && o.fac === p.fac && o !== p && Math.hypot(o.x - p.x, o.z - p.z) < 18) alertNpc(o, p.lastKnown[0], p.lastKnown[1], 'shout'); }
  if (p.state !== 'hunt') { p.state = 'hunt'; p.path = null; }
  const w = WEAPONS[p.weapon] || WEAPONS.pistol;
  p.cd -= dt; p.react -= dt;
  const range = w.range * (p.elev ? 1.4 : 1);
  if (p.react <= 0) { p.auto = findHostile(p, range); p.react = p.kind === 'corp' ? 0.4 : 0.7; }
  const T = p.auto && !p.auto.dead && !p.auto.wreck ? p.auto : null;
  if (T) {
    p.path = null; p.yaw = Math.atan2(T.x - p.x, T.z - p.z); p.aim = 1; p.walk = lerp(p.walk, 0, Math.min(1, dt * 8));
    p.lastKnown = [T.x, T.z];
    if (p.cd <= 0) {
      const dark = darkAt(p.x, p.z) || (T.kind === 'agent' && !T.lit);
      npcFire(p, T.x, T.z, (dark ? 0.3 : 0) + (p.kind === 'militia' ? 0.05 : 0)); p.cd = 1 / w.rof * Rr(0.9, 1.4);
      if (T.kind === 'agent' || T.fac === 'follower' || T.driver === 'player') setLastCombat(time);
    }
    return;
  }
  p.aim = Math.max(0, p.aim - dt * 2);
  if (p.elev) { if (p.lastKnown) p.yaw += angDiff(p.yaw, Math.atan2(p.lastKnown[0] - p.x, p.lastKnown[1] - p.z)) * Math.min(1, dt * 3); return; }
  if (p.guard && !p.guard.dead && p.guard.state === 'flee' && !p.guard.inCar) {
    const g = p.guard; if (Math.hypot(g.x - p.x, g.z - p.z) > 2.5) { if (!p.path || !p.path.length || p.repath < time) { p.path = findPath(p.x, p.z, g.x, g.z); p.repath = time + 1; } }
    if (followPath(p, 4.2, dt)) { p.walk = 1.2; p.phase += dt * 4.2 * 2.4; } return;
  }
  if (!p.path || !p.path.length || p.repath < time) {
    let goal = p.lastKnown;
    if (MS.alarm >= 2 || p.kind === 'corp' || p.kind === 'cop') {
      let bd = 1e9;
      for (const a of agents) { if (a.dead) continue; const ax = a.inCar ? a.inCar.x : a.x, az = a.inCar ? a.inCar.z : a.z; const d = Math.hypot(ax - p.x, az - p.z); if (d < bd) { bd = d; goal = [ax, az]; } }
    }
    if (goal) p.path = findPath(p.x, p.z, goal[0], goal[1]);
    p.repath = time + Rr(1.5, 2.5);
  }
  const spd = p.kind === 'corp' ? 3.9 : 3.3;
  if (followPath(p, spd, dt)) { p.walk = 1; p.phase += dt * spd * 2.8; }
  else { p.walk = lerp(p.walk, 0, Math.min(1, dt * 6)); p.yaw += dt * 0.8; }
}
function carBlockedAhead(c, hx, hz) {
  for (const gt of WORLD.gates) {
    if (gt.open > 0.95) continue;
    const ax = c.x + hx * 3.2, az = c.z + hz * 3.2;
    if (ax > gt.x0 - 1 && ax < gt.x1 + 1 && Math.abs(az - gt.z) < 1.4) return gt;
  }
  return null;
}
export function updateCar(c, dt) {
  if (c.flash > 0) c.flash -= dt;
  if (c.armorOff > 0) c.armorOff -= dt;
  if (c.wreck) {
    if (c.burn > 0) {
      c.burn -= dt;
      if (R() < dt * 30) spawnP(c.x + Rr(-0.8, 0.8), 1.2, c.z + Rr(-1, 1), Rr(-0.3, 0.3), Rr(1.5, 3), Rr(-0.3, 0.3), R() < 0.6 ? [2.6, 1.1, 0.25] : [0.1, 0.08, 0.12], Rr(0.3, 0.7), Rr(0.4, 1), -0.5, 0.5);
      if (R() < dt * 4) addDyn(c.x, 1.5, c.z, 9, [2, 0.9, 0.3], 0.3);
    } else if (c.smoke > 0) {
      c.smoke -= dt;
      if (R() < dt * 6 * (c.smoke / 45)) spawnP(c.x + Rr(-0.6, 0.6), 1.1, c.z + Rr(-0.8, 0.8), Rr(-0.2, 0.2), Rr(0.8, 1.6), Rr(-0.2, 0.2), [0.07, 0.065, 0.08], Rr(0.5, 0.9), Rr(1.6, 2.8), -0.15, 0.3);
    }
    return;
  }
  if (c.gone) return;
  if (c.hackT > 0) { c.hackT -= dt; if (R() < dt * 20) spawnP(c.x, 1.2, c.z, Rr(-2, 2), Rr(1, 3), Rr(-2, 2), [0.6, 2.2, 1.9], 0.1, 0.3, 8); if (c.hackT <= 0) destroyCar(c, agents[0]); }
  if (c === target && MS.def.id === 'courier' && !MS.courierOut && (c.stall > 0 || (darkAt(c.x, c.z) && c.speed < 0.5) || c.hp < c.maxHp * 0.45)) {
    MS.stopT = (MS.stopT || 0) + dt;
    if (MS.stopT > 1.6) courierBail(c, 'THE COURIER BAILED OUT WITH THE CASE // HEADING FOR THE TOWER');
  }
  if (c.driver === 'police' && !c.parked && !c.idle) { c.sirenT = (c.sirenT || 0) - dt; if (c.sirenT <= 0) { c.sirenT = 2.05; sfx('siren', c.x, c.z, 0.9); } }
  if (c.parked || c.idle) { c.speed = Math.max(0, c.speed - dt * 20); if (c.idle && c.route && c.route.length) pickNext(c); return; }
  let dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
  if (d < 0.8) {
    c.prev = c.node; c.node = c.next; pickNext(c);
    if (c.idle) { if (c.driver === 'police') policeArrive(c); return; }
    dx = c.tx - c.x; dz = c.tz - c.z; d = Math.hypot(dx, dz) || 1;
  }
  const hx = dx / d, hz = dz / d;
  let want = c.stall > 0 ? 0 : c.cruise;
  if (c.stall > 0) c.stall -= dt;
  if (c.driver !== 'player' && darkAt(c.x, c.z) && WORLD.kind === 'city') want = 0;
  const gt = carBlockedAhead(c, hx, hz);
  if (gt) { if (gt.lockT > 0 || c.driver === 'player') want = 0; else gt.want = true; if (gt.open < 0.95) want = 0; }
  const look = 3.4 + c.speed * 0.45;
  if (c.driver === 'player') for (const o of cars) {
    if (o === c || o.gone) continue;
    const rx = o.x - c.x, rz = o.z - c.z, d2 = rx * rx + rz * rz;
    if (d2 < 2.6 * 2.6 && d2 > 0.01) {
      const dd = Math.sqrt(d2), push = (2.6 - dd) * 0.5;
      if (!o.wreck) { o.x += rx / dd * push; o.z += rz / dd * push; damageCar(o, 25 * dt * Math.min(1, c.speed / 6), c.occ[0], 'blast'); }
      c.speed *= Math.pow(0.4, dt);
    }
  }
  else if (c.ignoreT <= 0) for (const o of cars) {
    if (o === c || o.gone) continue;
    const rx = o.x - c.x, rz = o.z - c.z; if (Math.abs(rx) > 10 || Math.abs(rz) > 10) continue;
    const al = rx * hx + rz * hz, lat = Math.abs(rx * hz - rz * hx);
    if (al > 0 && al < look && lat < 1.8) want = Math.min(want, al < 3.2 ? 0 : c.cruise * 0.35);
  }
  for (const p of people) {
    if (p.dead || p.inCar || p.elev) continue;
    const rx = p.x - c.x, rz = p.z - c.z; if (Math.abs(rx) > 8 || Math.abs(rz) > 8) continue;
    const al = rx * hx + rz * hz, lat = Math.abs(rx * hz - rz * hx);
    if (c.driver === 'player' || c.driver === 'script') { if (al > -0.5 && al < 2.6 && lat < 1.15 && c.speed > 3 && !(c.driver === 'script' && group(p) !== 'P')) { hurt(p, 400, c.occ[0]); for (let i = 0; i < 4; i++) spawnP(p.x, 0.6, p.z, hx * 6 + Rr(-2, 2), Rr(2, 4), hz * 6 + Rr(-2, 2), [0.5, 0.02, 0.04], 0.16, 0.5, 9); } }
    else if (al > 0.3 && al < look && lat < 1.4) want = 0;
  }
  c.speed = c.speed < want ? Math.min(want, c.speed + 6 * dt) : Math.max(want, c.speed - 20 * dt);
  c.x += hx * c.speed * dt; c.z += hz * c.speed * dt;
  c.yaw += angDiff(c.yaw, Math.atan2(hx, hz)) * Math.min(1, dt * 7);
  if (c.speed < 0.3 && want === 0) c.stopT += dt; else c.stopT = 0;
  if (c.stopT > 2.5) { c.ignoreT = 1.4; c.stopT = 0; }
  if (c.ignoreT > 0) c.ignoreT -= dt;
}
/* the courier leaves the van with the case and runs for the tower door; shared by a stopped van and one that reached the tower */
function courierBail(c, msg) {
  if (MS.courierOut) return;
  const sp = nearestOpen(c.x + Math.cos(c.yaw) * 1.8, c.z - Math.sin(c.yaw) * 1.8, 4) || [c.x, c.z];
  MS.courierOut = mkPerson({ kind: 'courier', fac: 'corp', state: 'run', alerted: true, x: sp[0], z: sp[1], hp: 80, maxHp: 80, weapon: 'pistol', mag: 13, armed: 1, color: [0.12, 0.12, 0.14], skin: Rpick(SKINS), rim: [1, 0.3, 0.55], coat: 1, speed: 3.9, wait: 1.6 });
  c.driver = 'none'; c.parked = true; c.route = null; c.speed = 0; c.onArrive = null;
  say(msg, 'bad'); sfx('door', c.x, c.z, 0.8);
}
function policeArrive(c) {
  c.parked = true; c.speed = 0;
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1, x = c.x + Math.cos(c.yaw) * 1.6 * side, z = c.z - Math.sin(c.yaw) * 1.6 * side;
    const sp = nearestOpen(x, z, 3) || [c.x, c.z];
    mkPerson({ kind: 'cop', fac: 'law', state: 'hunt', alerted: true, x: sp[0], z: sp[1], speed: 1.4, hp: 70, maxHp: 70, color: [0.06, 0.09, 0.22], rim: [0.2, 0.45, 1], coat: 1, armed: 1, weapon: R() < 0.4 ? 'shotgun' : 'pistol', mag: 12, yaw: c.yaw });
  }
  sfx('door', c.x, c.z, 0.7);
}
export function squadCenter(): [number, number] {
  let x = 0, z = 0, n = 0;
  for (const a of agents) { if (a.dead) continue; x += a.inCar ? a.inCar.x : a.x; z += a.inCar ? a.inCar.z : a.z; n++; }
  return n ? [x / n, z / n] : [camT.x, camT.z];
}
export function dispatchPolice(at?) {
  if (!RN || !RN.exits.length) return;
  const sc = at || squadCenter();
  const far = RN.exits.filter((i) => Math.hypot(RN.nodes[i].x - sc[0], RN.nodes[i].z - sc[1]) > 55);
  const from = Rpick(far.length ? far : RN.exits), to = nearestNode(sc[0], sc[1]);
  const c = mkCar('police', from, { driver: 'police', roam: false, cruise: 13, hp: 160, maxHp: 160, color: [0.85, 0.87, 0.9], glow: [0.3, 0.5, 1] });
  c.route = roadRoute(from, to); pickNext(c);
  say('HBPD DISPATCH // 2 OFFICERS INBOUND', 'warn');
}
export function spawnCorp(n) {
  const [cx, cz] = WORLD.corpC;
  for (let i = 0; i < n; i++) {
    const sp = nearestOpen(cx + Rr(-3, 3), cz + 9, 4) || [cx, cz + 9];
    mkPerson({ kind: 'corp', fac: 'corp', state: 'hunt', alerted: true, x: sp[0], z: sp[1], hp: 180, maxHp: 180, color: [0.55, 0.55, 0.6], skin: [0.2, 0.2, 0.22], rim: [1, 0.3, 0.55], coat: 2, armed: 1, weapon: 'corprifle', mag: 99, scale: 1.08 });
  }
  say('MERIDIAN SECURITY DEPLOYED // ' + n + ' OPERATIVES', 'bad');
  sfx('alarm', null, null, 0.5);
}
export function spookVarga() {
  if (MS.spooked || !target || !target.model || target.wreck || WORLD.kind !== 'city') return;
  if (MS.vargaP && !MS.vargaP.inCar && !MS.vargaP.dead) { if (!MS.vpanic) { MS.vpanic = true; say('VARGA IS SPOOKED // RUNNING BACK TO THE LIMO', 'bad'); } return; }
  if (MS.def.id === 'courier') {
    if (MS.courierOut || target.driver !== 'target') return;
    MS.spooked = true; target.cruise = 12; target.roam = false;
    const [cx, cz] = WORLD.corpC; driveTo(target, cx, cz + 11);
    target.onArrive = (c) => { if (!c.wreck && !MS.courierOut) courierBail(c, 'THE VAN PULLED UP AT THE TOWER // STOP THE COURIER BEFORE THE DOOR'); };
    say('COURIER SPOOKED // RACING FOR THE MERIDIAN TOWER', 'bad'); return;
  }
  MS.spooked = true;
  const sc = squadCenter(); let best = RN.exits[0], bd = -1;
  for (const i of RN.exits) { const n = RN.nodes[i], d = Math.hypot(n.x - sc[0], n.z - sc[1]); if (d > bd) { bd = d; best = i; } }
  const en = RN.nodes[best], inner = RN.nodes[en.adj[0]], ol = Math.hypot(en.x - inner.x, en.z - inner.z) || 1, out = [en.x + (en.x - inner.x) / ol * 40, en.z + (en.z - inner.z) / ol * 40];
  let from = target.node, r = roadRoute(from, best); if (!r.length && from !== best) { from = nearestNode(target.x, target.z); r = roadRoute(from, best); }
  target.roam = false; target.cruise = 11.5; target.route = [from, ...r, { pt: out }];
  target.onArrive = (c) => { if (!c.wreck) { c.gone = true; setObj('kill', 'fail'); say('VARGA LEFT THE SECTOR', 'bad'); } };
  pickNext(target);
  say('VARGA IS SPOOKED // RUNNING FOR THE SECTOR EDGE', 'bad');
}
export function raiseAlarm() {
  if (MS.alarm >= 2) return;
  MS.alarm = 2; sfx('alarm', null, null, 0.8);
  say('COMPOUND ALARM', 'bad');
  for (const p of people) if (!p.dead && p.fac === 'corp' && !p.alerted) alertNpc(p, ...squadCenter(), 'alarm');
  colonelFlee();
  if (!MS.reinfSent) { MS.reinfT = 50; say('RADIO: REINFORCEMENTS IN 50 SECONDS', 'warn'); }
}
function sendReinforcements() {
  MS.reinfSent = true; MS.reinfT = -1;
  const t = mkCarAt('truck', ROADX - 2.5, -30, 0, { color: [0.22, 0.25, 0.14], glow: [1, 0.6, 0.2], hp: 260, maxHp: 260, driver: 'script', parked: false, cruise: 11 });
  t.route = [{ pt: [ROADX - 2.5, 44] }, { pt: [ROADX - 2.5, 84] }];
  t.onArrive = (c) => {
    c.parked = true;
    for (let i = 0; i < 4; i++) { const sp = nearestOpen(c.x + (i % 2 ? 2 : -2), c.z - 3 + i, 3) || [c.x, c.z]; militia(sp[0], sp[1], i === 0 ? 'uzi' : i === 1 ? 'shotgun' : 'pistol', { state: 'hunt', alerted: true }); }
    say('MILITIA REINFORCEMENTS HAVE ARRIVED', 'bad'); sfx('door', c.x, c.z, 0.8);
  };
  pickNext(t); say('MILITIA TRUCK ON THE NORTH ROAD', 'bad');
}
export function updateDirector(dt) {
  for (const b of blackouts) b.t -= dt;
  setBlackouts(blackouts.filter((b) => b.t > 0));
  for (const L of WORLD.lights) if (L.off > 0) L.off -= dt;
  for (const n of WORLD.nodes) if (n.cd > 0) n.cd -= dt;
  for (const it of pickups) { it.spin += dt; if (it.cool > 0) it.cool -= dt; }
  MS.litT = (MS.litT || 0) - dt;
  if (MS.litT <= 0) { MS.litT = 0.25; for (const a of agents) if (!a.dead) a.lit = litAt(a.x, a.z); }
  if (MS.def && SCRIPTS[MS.def.id]) SCRIPTS[MS.def.id].update(dt);
  if (WORLD.kind === 'city') {
    const pol = LEVEL.police !== false;
    if (time - lastLoud > 10) setHeat(Math.max(0, heat - 0.45 * dt));
    const tier = heat < 20 ? 0 : heat < 50 ? 1 : heat < 85 ? 2 : 3;
    if (tier >= 1 && pol) {
      setDispatchT(dispatchT - (dt));
      const cops = people.filter((p) => !p.dead && p.kind === 'cop' && p.fac === 'law').length;
      if (dispatchT <= 0) { if (cops < 3 + tier * 2) dispatchPolice(); setDispatchT(tier === 1 ? 24 : tier === 2 ? 17 : 12); }
    }
    if (tier >= 2 && pol) { for (const p of people) if (p.kind === 'cop' && !p.dead && !p.alerted && p.fac === 'law') { p.alerted = true; p.armed = 1; p.state = 'hunt'; } spookVarga(); }
    if (tier >= 2 && pol && corpWaves < 1) { setCorpWaves(1); spawnCorp(3); }
    if (tier >= 3 && pol && corpWaves < 2) { setCorpWaves(2); spawnCorp(4); }
    for (const c of WORLD.cams) {
      if (c.off > 0) { c.off -= dt; continue; }
      c.yaw = c.base + Math.sin(time * 0.45 + c.ph) * 0.75; c.spot = 0;
      for (const a of agents) {
        if (a.dead || a.inCar || !a.armed) continue;
        const dx = a.x - c.x, dz = a.z - c.z, d = Math.hypot(dx, dz);
        if (d < 15 && Math.abs(angDiff(c.yaw, Math.atan2(dx, dz))) < 0.5 && hasLOS({ x: c.x, z: c.z }, a)) { c.spot = 1; break; }
      }
      if (c.spot && pol) { addHeat(3.5 * dt); if (time - spotLogT > 8) { setSpotLogT(time); say('CCTV // ARMED SQUAD ON CAMERA', 'warn'); } }
    }
  } else {
    if (MS.radioJam > 0) MS.radioJam -= dt;
    const anyAlert = people.some((p) => !p.dead && p.fac === 'corp' && p.alerted);
    if (anyAlert && MS.alarm < 2) {
      if (MS.alertSince < 0) MS.alertSince = time;
      if (time - MS.alertSince > 3 && MS.radioJam <= 0) raiseAlarm();
      MS.alarm = Math.max(MS.alarm, 1);
    } else if (!anyAlert && MS.alarm === 1) { MS.alarm = 0; MS.alertSince = -1; }
    if (MS.reinfT > 0) { MS.reinfT -= dt; if (MS.reinfT <= 0) { if (MS.radioJam > 0) { MS.reinfT = 8; } else sendReinforcements(); } }
    for (const gt of WORLD.gates) {
      if (gt.lockT > 0) gt.lockT -= dt;
      const goal = gt.lockT > 0 ? gt.lockState : gt.want ? 1 : 0;
      const prev = gt.open; gt.open = clamp(gt.open + (goal > gt.open ? 1 : -1) * dt * 0.6, 0, 1);
      if ((prev > 0.5) !== (gt.open > 0.5)) setGateCells(gt);
      if (gt.name === 'N' && gt.lockT <= 0 && !cars.some((c) => !c.wreck && !c.gone && Math.abs(c.x - ROADX) < 8 && Math.abs(c.z - gt.z) < 14 && !c.parked)) gt.want = false;
    }
    for (const t of WORLD.towers) {
      if (t.off > 0) t.off -= dt;
      t.spotOn = t.off <= 0 && !darkAt(t.x, t.z);
      if (!t.spotOn) continue;
      const a = t.base + Math.sin(time * 0.33 + t.sweep) * 0.75, r = 15 + 7 * Math.sin(time * 0.21 + t.sweep * 2);
      t.spot[0] = t.x + Math.sin(a) * r; t.spot[1] = t.z + Math.cos(a) * r;
      for (const ag of agents) {
        if (ag.dead || ag.inCar) continue;
        if (Math.hypot(ag.x - t.spot[0], ag.z - t.spot[1]) < 3.4) {
          let near = null, nd = 1e9;
          for (const p of people) { if (p.dead || p.fac !== 'corp' || p.alerted) continue; const d = Math.hypot(p.x - ag.x, p.z - ag.z); if (d < nd) { nd = d; near = p; } }
          if (near) alertNpc(near, ag.x, ag.z, 'light');
        }
      }
    }
  }
  if (MS.def && MS.def.id === 'varga') updateVarga(dt);
  updateHacking(dt);
}
export function updateTurret(t, dt) {
  if (t.dead) return; if (t.flash > 0) t.flash -= dt;
  if (t.friendly > 0) t.friendly -= dt;
  t.cd -= dt;
  let best = null, bd = WEAPONS.turret.range;
  for (const p of people) {
    if (p.dead || p.inCar) continue;
    const g = group(p); const ok = t.friendly > 0 ? (g === 'C' || (g === 'L' && p.alerted)) : g === 'P';
    if (!ok) continue; const d = Math.hypot(p.x - t.x, p.z - t.z); if (d < bd && hasLOS(t, p)) { bd = d; best = p; }
  }
  if (best) {
    t.yaw += angDiff(t.yaw, Math.atan2(best.x - t.x, best.z - t.z)) * Math.min(1, dt * 6);
    if (t.cd <= 0 && Math.abs(angDiff(t.yaw, Math.atan2(best.x - t.x, best.z - t.z))) < 0.2) {
      const sh = { x: t.x, z: t.z, y: 0.2, fac: t.friendly > 0 ? 'player' : 'corp', scale: 1, kind: 'turret' };
      fire(sh, 'turret', best.x, best.z); t.cd = 1 / WEAPONS.turret.rof;
      if (best.fac === 'player' || best.fac === 'follower') setLastCombat(time);
    }
  } else t.yaw += dt * 0.4;
}
export function updateRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    const nx = r.x + r.vx * dt, nz = r.z + r.vz * dt;
    r.life -= dt;
    spawnP(r.x, r.y, r.z, Rr(-0.4, 0.4), Rr(0, 0.6), Rr(-0.4, 0.4), [0.25, 0.2, 0.25], Rr(0.3, 0.6), Rr(0.5, 1), -0.3, 0.6);
    spawnP(r.x, r.y, r.z, 0, 0, 0, [3.5, 2, 0.8], 0.3, 0.06);
    let hit = r.life <= 0 || (nx >= 0 && nz >= 0 && nx < GW && nz < GW && opq[Math.floor(nz) * GW + Math.floor(nx)]);
    if (!hit) for (const p of people) { if (p.dead || p.inCar || p === r.owner || group(p) === group(r.owner)) continue; if (Math.hypot(p.x - nx, p.z - nz) < 0.6) { hit = true; break; } }
    if (!hit) for (const c of cars) { if (c.wreck || c.gone) continue; if (Math.hypot(c.x - nx, c.z - nz) < 1.8) { hit = true; break; } }
    r.x = nx; r.z = nz;
    if (hit) { explode(r.x, r.z, WEAPONS.launcher.radius, WEAPONS.launcher.dmg, r.owner, false); rockets.splice(i, 1); }
  }
}
export function updateParticles(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt;
    if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
    p.vy -= p.grav * dt; const dr = Math.max(0, 1 - p.drag * dt); p.vx *= dr; p.vy *= dr; p.vz *= dr;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; }
  }
  for (let i = tracers.length - 1; i >= 0; i--) { tracers[i].life -= dt; if (tracers[i].life <= 0) tracers.splice(i, 1); }
  for (let i = dyn.length - 1; i >= 0; i--) { dyn[i].life -= dt; if (dyn[i].life <= 0) dyn.splice(i, 1); }
  for (let i = moveMarks.length - 1; i >= 0; i--) { moveMarks[i].t -= dt; if (moveMarks[i].t <= 0) moveMarks.splice(i, 1); }
  for (const [x, z, y, big] of WORLD.vents) if (R() < dt * (big ? 6 : 2.2)) spawnP(x + Rr(-0.4, 0.4), y || 0.3, z + Rr(-0.4, 0.4), Rr(-0.2, 0.2) + (big ? 0.8 : 0), Rr(0.8, 1.6) * (big ? 1.6 : 1), Rr(-0.2, 0.2), big ? [0.09, 0.08, 0.1] : [0.07, 0.06, 0.09], Rr(0.8, 1.5) * (big ? 2.4 : 1), Rr(2, 3.5) * (big ? 2 : 1), -0.05, 0.3);
}
export function updateAmbient(dt) {
  for (const f of flyers) { f.pos += f.speed * dt; if (f.pos > GW + 70) f.pos = -70; if (f.pos < -70) f.pos = GW + 70; }
  if (WORLD.rail) { if (train.wait > 0) train.wait -= dt; else { train.z += train.speed * dt; if (train.z > GW + 90) { train.z = -90; train.wait = Rr(4, 10); } } }
}

/* ================================================================ hacking */
export const HLEVEL = { civil: { dur: 1.2, trace: 9, cost: 1 }, sec: { dur: 2.6, trace: 17, cost: 1 }, mil: { dur: 4.5, trace: 18, cost: 2 } };
export function deckOf(a) { return a && a.gear && GEAR[a.gear].charges ? GEAR[a.gear] : null; }
function nodesInRange(u) { return u ? hackables().filter((n) => Math.hypot(n.x - u.x, n.z - u.z) <= u.r) : []; }
export function hackables() {
  const list = WORLD.nodes.filter((n) => !(n.type === 'turret' && n.ref.dead));
  for (const c of cars) {
    if (c.wreck || c.gone || c.driver === 'player' || c === MS.van) continue;
    if (c.model === 'vtol') { if (!(c.alt > 3)) list.push({ type: 'vtol', level: 'mil', x: c.x, y: 3, z: c.z, ref: c, cd: c.hackCd || 0, patched: c.patched || 0, label: 'MERIDIAN VTOL' }); continue; }
    if (WORLD.kind === 'city' && c.driver === 'civ' && Math.hypot(c.x - camT.x, c.z - camT.z) > 80) continue;
    const cour = c === target && MS.def && MS.def.id === 'courier';
    const lv = cour ? 'sec' : c === target || c.model === 'jeep' || c.model === 'truck' ? 'mil' : 'sec';
    list.push({ type: cour ? 'stall' : c === target ? 'limo' : c.model === 'police' ? 'police' : c.model === 'jeep' || c.model === 'truck' ? 'stall' : 'car', level: lv, x: c.x, y: 1.4, z: c.z, ref: c, cd: c.hackCd || 0, patched: c.patched || 0,
      label: cour ? 'COURIER VAN' : c === target ? 'VARGA LIMO' : c.model === 'police' ? 'HBPD UNIT ' + (c.id * 37 % 900 + 100) : c.model === 'jeep' ? 'COLONEL JEEP' : c.model === 'truck' ? 'MILITIA TRUCK' : 'VEHICLE ' + (c.id * 37 % 900 + 100) });
  }
  return list;
}
export function connectedUplinkFor(n) { return WORLD.uplinks.find((u) => u.agent && !u.agent.dead && u.agent.link === u && Math.hypot(n.x - u.x, n.z - u.z) <= u.r); }
export function dropLink(u, burned) {
  if (u.agent) { u.agent.link = null; u.agent.linkT = 0; }
  if (hackJob && hackJob.u === u) setHackJob(null);
  u.agent = null;
  if (burned) u.burn = 40;
}
export function orderJack(u) {
  if (u.burn > 0) { say(u.label + ' IS BURNED // ' + Math.ceil(u.burn) + 'S', 'warn'); return; }
  if (u.agent && !u.agent.dead) { say(u.label + ' ALREADY CONNECTED', ''); return; }
  let cand = selAlive().filter((a) => deckOf(a) && !a.inCar);
  if (!cand.length) cand = agents.filter((a) => !a.dead && !a.inCar && deckOf(a));
  if (!cand.length) { say('NO AGENT CARRIES A DECK // EQUIP ONE IN THE ARMOURY', 'warn'); return; }
  cand.sort((a, b) => Math.hypot(a.x - u.x, a.z - u.z) - Math.hypot(b.x - u.x, b.z - u.z));
  const a = cand[0];
  if (a.link) dropLink(a.link, false);
  a.jackTo = u; a.linkT = 0; a.path = findPath(a.x, a.z, u.x, u.z); a.ftarget = null; a.fpoint = null;
  say(a.name + ' MOVING TO ' + u.label, ''); sfx('ack', null, null, 1);
}
export function startHack(n) {
  const u = connectedUplinkFor(n);
  if (!u) { say('OUT OF RANGE // CONNECT A NEARER UPLINK', 'warn'); return; }
  const a = u.agent, deck = deckOf(a), L = HLEVEL[n.level];
  if ((n.cd || 0) > 0) { say(n.label + ' IS ALREADY COMPROMISED', 'warn'); return; }
  if (a.charges < L.cost) { say('DECK EMPTY // ' + L.cost + ' CHARGE' + (L.cost > 1 ? 'S' : '') + ' NEEDED', 'warn'); return; }
  if (hackJob) { say('DECK BUSY', 'warn'); return; }
  setHackJob({ n, u, a, t: 0, dur: L.dur * (1 + 0.4 * (n.patched || 0)) / a.d.hack, rate: L.trace * deck.trace * a.d.traceMul * (resDone('firmware') ? 0.8 : 1) * (1 + 0.5 * (n.patched || 0)) });
  sfx('hack', null, null, 0.6);
}
function updateHacking(dt) {
  for (const u of WORLD.uplinks) {
    if (u.burn > 0) u.burn -= dt;
    if (u.agent && (u.agent.dead || u.agent.link !== u)) u.agent = null;
    if (!hackJob || hackJob.u !== u) u.trace = Math.max(0, u.trace - 3 * dt);
  }
  if (!hackJob) return;
  const j = hackJob;
  if (j.a.dead || j.a.link !== j.u) { setHackJob(null); return; }
  j.t += dt; j.u.trace += j.rate * dt;
  if (j.u.trace >= 100) {
    const a = j.a; dropLink(j.u, true); a.sync = 0; a.crash = 6; j.u.trace = 60;
    say('TRACE COMPLETE // ' + a.name + ' THROWN OUT OF THE NETWORK', 'bad'); sfx('alarm', null, null, 0.5);
    if (WORLD.kind === 'city') { addHeat(12); dispatchPolice([j.u.x, j.u.z]); }
    else for (const p of people) if (!p.dead && p.fac === 'corp' && Math.hypot(p.x - j.u.x, p.z - j.u.z) < 45) alertNpc(p, j.u.x, j.u.z, 'trace');
    return;
  }
  if (j.t >= j.dur) { setHackJob(null); applyHack(j.n, j.a); }
}
function applyHack(n, a) {
  a.charges -= HLEVEL[n.level].cost; stats.hacks++;
  if (n.ref && n.ref.wreck !== undefined) { n.ref.patched = (n.ref.patched || 0) + 1; } else n.patched = (n.patched || 0) + 1;
  sfx('zap', null, null, 0.7);
  const setCd = (t) => { if (n.ref && n.ref.wreck !== undefined) n.ref.hackCd = t; else n.cd = t; };
  if (n.onHack) { n.onHack(n, a); setCd(n.cd0 || 120); return; }
  switch (n.type) {
    case 'grid': blackouts.push({ x: n.x, z: n.z, r: 26, t: 25 }); for (const L of WORLD.lights) if (L.kind !== 'pad' && Math.hypot(L.x - n.x, L.z - n.z) < 26) L.off = 25; say(n.label + ' // BLACKOUT 25S, TRAFFIC STOPPED', ''); setCd(30); break;
    case 'board': { const b = n.ref; addDyn(b.x, b.y, b.z, 24, [5, 5, 5], 0.6); for (const p of people) { if (p.dead || p.fac === 'follower' || p.kind === 'agent') continue; if (Math.hypot(p.x - b.x, p.z - b.z) < 18) { p.stun = p.kind === 'corp' ? 3 : 6; p.yaw = Math.atan2(b.x - p.x, b.z - p.z); } } say(n.label + ' // STROBE FLASH, CROWD STUNNED', ''); setCd(20); break; }
    case 'cam': n.ref.off = 45; say(n.label + ' // FEED LOOPED 45S', ''); setCd(45); break;
    case 'turret': n.ref.friendly = 30; say(n.label + ' // IFF REWRITTEN 30S', ''); setCd(35); break;
    case 'limo': n.ref.armorOff = 20; n.ref.stall = 8; spookVarga(); say('LIMO ARMOUR CRASHED 20S // ENGINE DOWN 8S', 'warn'); setCd(40); break;
    case 'car': n.ref.hackT = 1.4; n.ref.stall = 5; say('VEHICLE CORE OVERLOADED', ''); addHeat(4); setCd(99); break;
    case 'police': case 'stall': n.ref.stall = 25; say(n.label + ' // ENGINE KILLED 25S', ''); setCd(30); break;
    case 'gate': { const g = n.ref; const shut = g.lockT > 0 ? g.lockState === 0 : g.open < 0.5; g.lockState = shut ? 1 : 0; g.lockT = 45; say(n.label + (g.lockState ? ' // FORCED OPEN 45S' : ' // LOCKED SHUT 45S'), ''); break; }
    case 'search': n.ref.off = 40; say(n.label + ' // OFF 40S', ''); setCd(40); break;
    case 'gen': blackouts.push({ x: (CX0 + CX1) / 2, z: (CZ0 + CZ1) / 2, r: 80, t: 35 }); for (const L of WORLD.lights) L.off = 35; for (const t of WORLD.towers) t.off = 35; say('GENERATOR TRIPPED // COMPOUND DARK 35S', ''); setCd(40); break;
    case 'vtol': n.ref.stall = 25; say('VTOL FLIGHT SYSTEMS REBOOTING // GROUNDED 25S', ''); setCd(40); break;
    case 'radio': MS.radioJam = 45; say('RADIO JAMMED 45S // NO ALARM, NO REINFORCEMENTS', ''); setCd(45); break;
  }
}
