import { $, R, Rpick, Rr, SEED, lerp, setSEED } from './core';
import { GW, NEONS, WORLD, setBarrels } from './world_head';
import { CONT_COLS } from './city_fns';
import { ROADX } from './world_build';
import { LEVEL, LEVELS, PEDS, RN, edgeOf, inPlay, nearestPed, pedPos, randomPed } from './layout';
import { parts, tracers } from './models';
import { loadWorld } from './world_load';
import { camT, camYaw, camYawTo, findPath, nearestNode, nearestOpen, nearestRoad, playMusic, roadRoute, routeLen, setCamYaw, setCamYawTo } from './engine';
import { SAVE, WEAPONS, derive } from './campaign';
import { say } from './sim';
import { fires, setFires } from './chaos';
import { SCRIPTS } from './missions';
import { buildSquadRows } from './hud';

/* ================================================================ mission state */
export const SKINS = [[0.85, 0.66, 0.52], [0.72, 0.52, 0.38], [0.55, 0.38, 0.27], [0.38, 0.26, 0.19], [0.9, 0.76, 0.64]];
const JACKETS = [[0.25, 0.07, 0.07], [0.17, 0.17, 0.19], [0.3, 0.21, 0.11], [0.07, 0.13, 0.2], [0.36, 0.3, 0.05], [0.05, 0.21, 0.21], [0.38, 0.38, 0.4], [0.2, 0.05, 0.2], [0.12, 0.1, 0.09]];
const CAR_COLS = [[0.7, 0.7, 0.72], [0.14, 0.14, 0.16], [0.5, 0.08, 0.08], [0.1, 0.22, 0.4], [0.75, 0.6, 0.2], [0.2, 0.35, 0.3], [0.45, 0.45, 0.5]];
export let MS = null;
export function setMS(v: typeof MS) { return MS = v; }
export let people = [], agents = [], cars = [], rockets = [], dyn = [], decals = [], turrets = [], flyers = [], pickups = [], train = { z: -80, speed: 20, wait: 0 };
export function setAgents(v: typeof agents) { return agents = v; }
export let blackouts = [], moveMarks = [], beams = [], stats: any = {}, heat = 0, heatPeak = 0, lastLoud = -99, lastCombat = -99, dispatchT = 0, corpWaves = 0;
export function setBlackouts(v: typeof blackouts) { return blackouts = v; }
export function setBeams(v: typeof beams) { return beams = v; }
export function setHeat(v: typeof heat) { return heat = v; }
export function setHeatPeak(v: typeof heatPeak) { return heatPeak = v; }
export function setLastLoud(v: typeof lastLoud) { return lastLoud = v; }
export function setLastCombat(v: typeof lastCombat) { return lastCombat = v; }
export function setDispatchT(v: typeof dispatchT) { return dispatchT = v; }
export function setCorpWaves(v: typeof corpWaves) { return corpWaves = v; }
export let time = 0, missionT = 0, state = 'boot', target = null, hackOn = false, hackT = 0, timeScale = 1, fireMode = false, nextId = 1, selected = new Set<any>();
export function setTime(v: typeof time) { return time = v; }
export function setMissionT(v: typeof missionT) { return missionT = v; }
export function setState(v: typeof state) { return state = v; }
export function setTarget(v: typeof target) { return target = v; }
export function setHackOn(v: typeof hackOn) { return hackOn = v; }
export function setHackT(v: typeof hackT) { return hackT = v; }
export function setTimeScale(v: typeof timeScale) { return timeScale = v; }
export function setFireMode(v: typeof fireMode) { return fireMode = v; }
export function setSelected(v: typeof selected) { return selected = v; }
export let spotLogT = -99, lastKeyT = 0, lastKey = '', hackJob = null, abortT = -1e9;
export function setSpotLogT(v: typeof spotLogT) { return spotLogT = v; }
export function setLastKeyT(v: typeof lastKeyT) { return lastKeyT = v; }
export function setLastKey(v: typeof lastKey) { return lastKey = v; }
export function setHackJob(v: typeof hackJob) { return hackJob = v; }
export function setAbortT(v: typeof abortT) { return abortT = v; }

export function mkPerson(o) {
  const p = Object.assign({ id: nextId++, x: 0, z: 0, yaw: 0, elev: 0, hp: 100, maxHp: 100, dead: false, deadT: 0, phase: R() * 6, walk: 0, aim: 0, flash: 0,
    color: [0.3, 0.3, 0.3], skin: Rpick(SKINS), rim: [0, 0, 0], umb: 0, armed: 0, coat: 0, scale: 1, state: 'walk', speed: 1.4, path: null,
    cd: 0, t: 0, kind: 'civ', fac: 'civ', stun: 0, inCar: null, jackT: 0, react: 0, dir: 1, bi: 0, bj: 0, s: 0, alerted: false, sus: 0, mag: 0, reloadT: 0 }, o);
  people.push(p); return p;
}
/* pedestrians walk sidewalk segments of the level's street graph (PEDS); seg + s (metres along it) + dir */
export function spawnCiv(seg?, s?) {
  if (seg == null) [seg, s] = randomPed();
  const pp = pedPos(seg, s), lat = Rr(-0.7, 0.7), nx = -pp[3], nz = pp[2];
  const c = mkPerson({ kind: 'civ', fac: 'civ', seg, s, lat, dir: R() < 0.5 ? 1 : -1, x: pp[0] + nx * lat, z: pp[1] + nz * lat, speed: Rr(1.1, 1.7), color: Rpick(JACKETS), umb: R() < 0.38 ? 1 : 0, hp: 40, maxHp: 40, scale: Rr(0.93, 1.05) });
  if (c.umb) c.rim = Rpick(NEONS);
  return c;
}
/* cars drive node to node over the road graph (RN); route items are node ids or { pt: [x, z] } */
export function mkCar(model, ni, o?) {
  const n = RN ? RN.nodes[ni] : { x: 0, z: 0 };
  const c = Object.assign({ id: nextId++, model, x: n.x, z: n.z, yaw: 0, speed: 0, cruise: Rr(7, 9.5), hp: 120, maxHp: 120, wreck: 0, burn: 0,
    node: ni, prev: null, next: null, tx: n.x, tz: n.z, route: null, driver: 'civ', roam: true, occ: [], color: Rpick(CAR_COLS), glow: Rpick(NEONS),
    stopT: 0, ignoreT: 0, parked: false, idle: false, hackT: 0, stall: 0, armor: null }, o);
  if (!c.parked) pickNext(c);
  if (c.next != null && !c.parked) c.yaw = Math.atan2(c.tx - c.x, c.tz - c.z);
  cars.push(c); return c;
}
export function mkCarAt(model, x, z, yaw, o) {
  const c = mkCar(model, 0, Object.assign({ parked: true, idle: true, roam: false, driver: 'none' }, o));
  c.x = x; c.z = z; c.tx = x; c.tz = z; c.yaw = yaw; c.node = nearestNode(x, z);
  return c;
}
const laneOf = (a, b) => { const e = RN && edgeOf(a, b); return e ? e.w / 4 : 2.5; };
export function pickNext(c) {
  let nxt;
  if (c.route && c.route.length) nxt = c.route.shift();
  else {
    if (!c.roam || !RN) { c.idle = true; if (c.onArrive) { const f = c.onArrive; c.onArrive = null; f(c); } return; }
    // civilian traffic that reaches the edge of the world re-enters somewhere else
    if (c.driver === 'civ' && RN.exits.includes(c.node) && c.prev != null && RN.exits.length > 1 && Math.hypot(c.x - camT.x, c.z - camT.z) > 110) {
      const ex = Rpick(RN.exits.filter((i) => i !== c.node)), n = RN.nodes[ex];
      c.x = n.x; c.z = n.z; c.node = ex; c.prev = null;
    }
    const adj = RN.nodes[c.node].adj, opts = adj.filter((n) => n !== c.prev);
    nxt = opts.length ? Rpick(opts) : (c.prev != null ? c.prev : adj[0]);
  }
  c.idle = false;
  if (nxt.pt) { c.next = c.node; c.tx = nxt.pt[0]; c.tz = nxt.pt[1]; return; }
  c.next = nxt;
  const np = RN.nodes[nxt], from = RN.nodes[c.node] || np, ddx = np.x - from.x, ddz = np.z - from.z, dl = Math.hypot(ddx, ddz) || 1, hx = ddx / dl, hz = ddz / dl, ln = laneOf(c.node, nxt);
  c.tx = np.x - hz * ln; c.tz = np.z + hx * ln;
}
export function driveTo(c, x, z) {
  if (WORLD.kind !== 'city' || !RN) {
    const path = findPath(c.x, c.z, x, z);
    if (!path) return [c.x, c.z];
    c.route = path.map((p) => ({ pt: [p.x, p.z] })); c.idle = false; c.parked = false; pickNext(c);
    const l = path[path.length - 1]; return [l.x, l.z];
  }
  const rp = nearestRoad(x, z);
  const starts = [nearestNode(c.x, c.z)]; if (c.node != null) starts.push(c.node); if (c.next != null && typeof c.next === 'number') starts.push(c.next);
  let best = null, bc = 1e9;
  for (const s0 of starts) for (const e of [rp.e.a, rp.e.b]) {
    const r = roadRoute(s0, e), sp = RN.nodes[s0], ep = RN.nodes[e];
    if (s0 !== e && !r.length) continue;
    const cost = Math.hypot(sp.x - c.x, sp.z - c.z) + routeLen(s0, r) + Math.hypot(ep.x - rp.x, ep.z - rp.z);
    if (cost < bc) { bc = cost; best = { s0, r, e }; }
  }
  if (!best) return [c.x, c.z];
  // stop in the right-hand lane for the direction we arrive from
  const ep = RN.nodes[best.e], dx = rp.x - ep.x, dz = rp.z - ep.z, dl = Math.hypot(dx, dz);
  let hx, hz; if (dl > 0.5) { hx = dx / dl; hz = dz / dl; } else { const o = RN.nodes[best.e === rp.e.a ? rp.e.b : rp.e.a]; const l2 = Math.hypot(o.x - ep.x, o.z - ep.z) || 1; hx = (o.x - ep.x) / l2; hz = (o.z - ep.z) / l2; }
  const ln = rp.e.w / 4, pt = [rp.x - hz * ln, rp.z + hx * ln];
  c.route = [best.s0, ...best.r, { pt }]; c.idle = false; c.parked = false; pickNext(c);
  return pt;
}

/* ---------------------------------------------------------------- mission setup */
export function clearMission() {
  nextId = 1; people = []; cars = []; rockets = []; dyn = []; decals = []; turrets = []; flyers = []; pickups = []; parts.length = 0; tracers.length = 0;
  blackouts = []; moveMarks = []; beams = []; hackJob = null; setFires([]); setBarrels([]);
  stats = { civ: 0, cops: 0, hostiles: 0, jacked: 0, hacks: 0, lost: 0, shots: 0 };
  heat = 0; heatPeak = 0; lastLoud = -99; lastCombat = -99; dispatchT = 6; corpWaves = 0;
  time = 0; missionT = 0; hackOn = false; hackT = 0; timeScale = 1; fireMode = false; selected = new Set<any>(); spotLogT = -99; target = null;
  train = { z: -80, speed: 20, wait: 0 };
}
export function makeAgent(r, i, x, z, yaw) {
    const d = derive(r.mods);
    const sp = nearestOpen(x, z, 5) || [x, z];
    return mkPerson({ kind: 'agent', fac: 'player', idx: i, rec: r, name: r.name, x: sp[0], z: sp[1], hp: 200, maxHp: 200,
      color: r.sex === 'f' ? [0.16, 0.15, 0.2] : [0.15, 0.17, 0.21], skin: SKINS[[0, 2, 1, 3][i % 4]], rim: [0.25, 1, 0.85], coat: 2, armed: 0, scale: r.sex === 'f' ? 1.06 : 1.12,
      slots: r.slots.slice(), cur: r.slots[0] ? 0 : 1, ammo: JSON.parse(JSON.stringify(r.ammo)), cell: 100, gear: r.gear, gearUsed: false, charges: r.charges || 0, d,
      dose: { adr: 0, per: 0, int: 0 }, sync: 1, crash: 0, lastHit: -99, lastShot: -99, ftarget: null, fpoint: null, fpointT: 0, yaw, link: null, linkT: 0, healT: 0, kills: 0 });
}
function spawnAgents(x, z, yaw) {
  const recs = SAVE.agents.filter((r) => r.alive && r.deploy).slice(0, MS.def.max);
  agents = recs.map((r, i) => makeAgent(r, i, x - 1 + (i % 2) * 1.6, z + Math.floor(i / 2) * 1.6, yaw));
  selected = new Set(agents);
}
export function militia(x, z, weapon, o) {
  const w = WEAPONS[weapon];
  return mkPerson(Object.assign({ kind: 'militia', fac: 'corp', state: 'post', x, z, postX: x, postZ: z, yaw: 0, postYaw: 0, hp: 60, maxHp: 60, weapon, mag: w.mag || 99,
    color: [0.15, 0.17, 0.09], skin: Rpick(SKINS), rim: [0.6, 0.3, 0.08], coat: 0, armed: 1, speed: 1.4, scale: Rr(0.98, 1.06) }, o));
}
function setupCompound() {
  const vx = WORLD.van[0], vz = WORLD.van[1];
  spawnAgents(ROADX - 3, vz - 8, Math.PI);
  MS.van = mkCarAt('van', vx, vz, Math.PI, { color: [0.12, 0.13, 0.15], glow: [0.3, 1, 0.85], hp: 200, maxHp: 200 });
  MS.jeep = mkCarAt('jeep', 147, 64, Math.PI, { color: [0.24, 0.27, 0.15], glow: [1, 0.6, 0.2], hp: 160, maxHp: 160 });
  mkCarAt('truck', 140, 112, 0, { color: [0.22, 0.25, 0.14], glow: [1, 0.6, 0.2], hp: 260, maxHp: 260 });
  const wr = mkCarAt('sedan', ROADX + 6, 178, 0.3, { color: [0.3, 0.2, 0.15] }); wr.wreck = 1;
  const tw = WORLD.towers;
  militia(110, 146, 'pistol', { yaw: 0, postYaw: 0 });
  militia(116.5, 146, 'shotgun', { yaw: 0, postYaw: 0 });
  militia(tw[2].x, tw[2].z, 'rifle', { elev: tw[2].y, yaw: tw[2].base, postYaw: tw[2].base, tower: tw[2] });
  militia(tw[3].x, tw[3].z, 'uzi', { elev: tw[3].y, yaw: tw[3].base, postYaw: tw[3].base, tower: tw[3] });
  militia(96, 100, 'uzi', { state: 'patrol', wp: [[96, 100], [130, 98], [131, 128], [95, 130]], wi: 0 });
  militia(72, 96, 'shotgun', { state: 'patrol', wp: [[72, 96], [72, 74], [96, 77], [97, 96]], wi: 0 });
  militia(141, 66, 'pistol', { yaw: Math.PI * 0.2, postYaw: Math.PI * 0.2 });
  militia(113, 54, 'pistol', { yaw: Math.PI, postYaw: Math.PI });
  const col = mkPerson({ kind: 'colonel', fac: 'corp', state: 'post', x: 113, z: 73.6, postX: 113, postZ: 73.6, yaw: 0, postYaw: 0, hp: 120, maxHp: 120, weapon: 'pistol', mag: 13,
    color: [0.22, 0.19, 0.12], skin: SKINS[1], rim: [1, 0.2, 0.15], coat: 2, armed: 1, speed: 1.4, scale: 1.08 });
  target = col;
  militia(109, 74.2, 'shotgun', { yaw: 0.2, postYaw: 0.2, guard: col, hp: 80, maxHp: 80 });
  militia(117, 74.2, 'shotgun', { yaw: -0.2, postYaw: -0.2, guard: col, hp: 80, maxHp: 80 });
  MS.objs = [{ id: 'kill', text: 'Eliminate Colonel Rusk', st: 'open' }, { id: 'out', text: 'Return to the van', st: 'open' }];
  MS.alarm = 0; MS.radioJam = 0; MS.reinfT = -1; MS.reinfSent = false; MS.firstAlert = 0; MS.alertSince = -1;
  pickups.push({ id: 'launcher', x: 152.5, z: 75, mag: 1, res: 2, spin: 0, glow: true });
  camT.set(ROADX, 0, vz - 18); setCamYaw(setCamYawTo(Math.PI / 4));
}
function setupCity(def) {
  const L = LEVEL, SP = L.spots, start = SP.start;
  spawnAgents(start[0], start[1], Math.PI);
  setSEED(99 + Math.floor(Math.random() * 1000));
  const HIVIS = [[0.6, 0.3, 0.04], [0.5, 0.45, 0.04], [0.2, 0.2, 0.22], [0.12, 0.2, 0.3]], LAB = [[0.78, 0.8, 0.84], [0.2, 0.22, 0.28], [0.3, 0.3, 0.32], [0.7, 0.72, 0.75]];
  const near = PEDS.map((g, i) => i).filter((i) => PEDS[i].inside && Math.hypot((PEDS[i].p0[0] + PEDS[i].p1[0]) / 2 - start[0], (PEDS[i].p0[1] + PEDS[i].p1[1]) / 2 - start[1]) < 50);
  for (let i = 0; i < (L.civs || 120); i++) {
    const seg = i < 30 && near.length ? Rpick(near) : null;
    const c = seg != null ? spawnCiv(seg, R() * PEDS[seg].len) : spawnCiv();
    if (L.style === 'docks') { c.color = Rpick(HIVIS); c.umb = 0; c.rim = [0, 0, 0]; } else if (L.style === 'campus') { c.color = Rpick(LAB); c.umb = 0; c.rim = [0, 0, 0]; }
  }
  for (let i = 0; i < (L.police === false ? 0 : 4); i++) {
    const c = spawnCiv(); Object.assign(c, { kind: 'cop', fac: 'law', state: 'patrol', speed: 1.3, hp: 70, maxHp: 70, color: [0.06, 0.09, 0.22], rim: [0.2, 0.45, 1], umb: 0, coat: 1, armed: 0, weapon: 'pistol', mag: 13, scale: 1 });
  }
  const carNodes = RN.nodes.map((n, i) => i).filter((i) => RN.nodes[i].adj.length && inPlay(RN.nodes[i].x, RN.nodes[i].z, -20));
  for (let i = 0; i < (L.traffic || 16); i++) {
    const c = mkCar(L.style === 'docks' && R() < 0.4 ? 'truck' : R() < 0.18 ? 'van' : 'sedan', Rpick(carNodes));
    if (c.model === 'truck') { c.color = Rpick(CONT_COLS); c.cruise = 6; }
    c.x = lerp(c.x, c.tx, R()); c.z = lerp(c.z, c.tz, R());
  }
  for (const [x, z] of WORLD.turretSpots) turrets.push({ x, z, yaw: 0, hp: 160, maxHp: 160, dead: false, friendly: 0, cd: 0, flash: 0, kind: 'turret', alerted: true, fac: 'corp' });
  turrets.forEach((t, i) => WORLD.nodes.push({ type: 'turret', level: 'mil', x: t.x, y: 1.5, z: t.z, ref: t, label: 'SENTRY-' + (i + 1) }));
  spawnFlyers(18);
  if (def.id === 'varga') {
    target = mkCar('limo', nearestNode(...(SP.limo as [number, number])), { cruise: 6.5, hp: 520, maxHp: 520, driver: 'target', color: [0.06, 0.06, 0.07], glow: [1, 0.25, 0.5], armor: { bullet: 0.2, shot: 0.15, beam: 0.6, blast: 1 } });
    const V = MS.vargaP = mkPerson({ kind: 'exec', fac: 'corp', state: 'ride', inCar: target, x: target.x, z: target.z, hp: 90, maxHp: 90, color: [0.5, 0.08, 0.24], skin: SKINS[4], rim: [1, 0.3, 0.55], coat: 2, scale: 1.02 });
    target.occ = [V];
    for (const off of [[-1.5, -1.0], [1.5, -1.0]]) target.occ.push(mkPerson({ kind: 'corp', fac: 'corp', state: 'escort', guard: V, goff: off, inCar: target, x: target.x, z: target.z, hp: 150, maxHp: 150, weapon: 'corprifle', mag: 99,
      color: [0.55, 0.55, 0.6], skin: [0.2, 0.2, 0.22], rim: [1, 0.3, 0.55], coat: 2, armed: 1, scale: 1.08 }));
    MS.vphase = 'roam'; MS.stopAt = 55;
    MS.objs = [{ id: 'kill', text: 'Eliminate Exec. Varga', st: 'open' }, { id: 'out', text: 'Reach the NE plaza', st: 'open' }];
  } else if (def.id === 'courier') {
    target = mkCar('van', nearestNode(...(SP.van as [number, number])), { cruise: 7.5, hp: 300, maxHp: 300, driver: 'target', color: [0.1, 0.1, 0.12], glow: [1, 0.3, 0.55], armor: { bullet: 0.45, shot: 0.35, beam: 0.8, blast: 1 } });
    MS.objs = [{ id: 'kill', text: 'Recover the data case', st: 'open' }, { id: 'out', text: 'Reach the NE plaza', st: 'open' }];
  } else if (def.id === 'halden') {
    const [seg, s0] = nearestPed(SP.halden[0], SP.halden[1], true), lp = pedPos(seg, s0);
    target = mkPerson({ kind: 'civ', fac: 'civ', sci: true, seg, s: s0, lat: 0, dir: 1, x: lp[0], z: lp[1], speed: 1.15, hp: 60, maxHp: 60, color: [0.78, 0.8, 0.84], skin: SKINS[0], rim: [1, 0.62, 0.18], coat: 2, scale: 1.0 });
    for (const off of [[-1.4, -1.2], [1.4, -1.2]]) mkPerson({ kind: 'corp', fac: 'corp', state: 'escort', guard: target, goff: off, x: lp[0] + off[0], z: lp[1] + off[1], hp: 120, maxHp: 120, weapon: 'uzi', mag: 50,
      color: [0.1, 0.1, 0.12], skin: Rpick(SKINS), rim: [1, 0.3, 0.55], coat: 1, armed: 1, speed: 1.4, scale: 1.08 });
    MS.objs = [{ id: 'kill', text: 'Persuade Dr. Halden', st: 'open' }, { id: 'out', text: 'Walk her to the NE plaza', st: 'open' }];
  }
  if (SCRIPTS[def.id]) SCRIPTS[def.id].setup(def, L);
  MS.spooked = false;
  camT.set(start[0] + 4, 0, start[1] + 2); setCamYaw(setCamYawTo(Math.PI / 4));
}
/* flying cars cruise high straight lanes the level names (downtown only) */
export function spawnFlyers(n) {
  const lanes = LEVEL && LEVEL.flyLanes; if (!lanes) return;
  for (let i = 0; i < n; i++) { const [ax, l] = Rpick(lanes); flyers.push({ ax, lane: l + (R() < 0.5 ? -3 : 3), pos: Rr(-60, GW + 60), y: Rr(24, 42), speed: Rr(9, 16) * (R() < 0.5 ? -1 : 1), color: Rpick(CAR_COLS), glow: Rpick(NEONS), ph: R() * 6 }); }
}
export function startMission(def) {
  MS = { def, objs: [], captured: [], ledger: [] };
  clearMission();
  loadWorld(def.level, def.weather);
  for (const n of WORLD.nodes) { n.cd = 0; n.patched = 0; }
  if (def.world === 'compound') setupCompound(); else setupCity(def);
  $('#cTitle').textContent = 'Contract ' + def.code;
  $('#mName').textContent = def.world === 'city' ? (LEVELS[def.level].police === false ? 'Alert' : 'Heat') : 'Compound';
  $('#log').innerHTML = '';
  buildSquadRows(); renderObjs();
  state = 'play';
  $('#termS').hidden = true;
  $('#hud').hidden = false;
  playMusic('infiltration', 2);
  say('SQUAD DEPLOYED // ' + def.region.toUpperCase(), '');
  say(def.targetMsg || { varga: 'TARGET: PINK UNDERGLOW LIMO // ARMOURED', courier: 'TARGET: BLACK MERIDIAN VAN // DATA CASE ON BOARD', halden: 'TARGET: DR. HALDEN // WHITE COAT, TWO GUARDS', compound: 'TARGET: COLONEL RUSK // HQ VERANDA, NORTH' }[def.id], 'warn');
}
export function renderObjs() {
  $('#objs').innerHTML = MS.objs.map((o) => '<li class="' + (o.st === 'done' ? 'done' : o.st === 'fail' ? 'hot' : '') + '"><span class="m">' + (o.st === 'done' ? '[x]' : o.st === 'fail' ? '[!]' : '[ ]') + '</span><span>' + o.text + (o.st === 'fail' ? ' // FAILED' : '') + '</span><span class="num lbl" id="od-' + o.id + '"></span></li>').join('');
}
export function setObj(id, st) { const o = MS.objs.find((x) => x.id === id); if (o && o.st !== st) { o.st = st; renderObjs(); } }
