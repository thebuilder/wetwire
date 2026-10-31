import { $, TAU, ctx } from './core';
import { WORLD } from './world_head';
import { groundY } from './layout';
import { DPR, sfx, toScreen } from './engine';
import { SAVE, WEAPONS, store } from './campaign';
import { MS, agents, cars, missionT, people, pickups, state, target, time, turrets } from './setup';
import { deckOf, wallDist } from './sim';
import { selAlive } from './commands';
import { groundRing, label } from './present';

/* ================================================================ tactical pause, field tips, guard cones */
export let paused = false;
export function setPause(on) {
  if (state !== 'play') on = false;
  if (on === paused) return;
  paused = on; $('#pauseB').hidden = !on; $('#bPause').classList.toggle('on', on);
  sfx('ui', null, null, 0.6, on ? 0.8 : 1.2);
}
const TIPS = {
  start: 'Click to move, double-click to run, drag to box-select. SPACE pauses the game, and you can still give orders while paused.',
  stealth: 'A guard is getting suspicious (?). Guards see much further when you stand in light. Back off into the dark or take them down fast.',
  uplink: 'An uplink is close. Press H for the network view, click the uplink to connect your deck carrier, then click nodes in its range.',
  light: 'You are in a searchlight. Anyone near the beam will spot you. Move out of the light circle.',
  ammo: 'Ammo is limited per contract. Dead enemies drop weapons: walk over them for ammo, or click one to swap. R reloads.',
  pickup: 'A dropped weapon glows on the ground. Amber means new tech: carry it home and it is added to your armoury.',
  alarm: 'The alarm is up. The colonel runs for his jeep and a truck of reinforcements is on the way. Stop the jeep or block the north gate with a hack.',
  extract: 'Target down. Get every surviving agent to the extraction point to finish the contract.',
  car: 'You are close to a vehicle. Press F to get in with the selected agents, click to drive, F again to get out.',
};
let tipEl = null, tipT = 0;
function tip(id) {
  if (!SAVE.tipsOn && SAVE.tipsOn !== undefined) return;
  SAVE.tips = SAVE.tips || {};
  if (SAVE.tips[id] || state !== 'play') return;
  if (tipT > 0 && id !== 'start') return;
  SAVE.tips[id] = 1; store();
  $('#tipT').textContent = TIPS[id]; $('#tip').hidden = false; tipT = 10;
}
$('#tipX').addEventListener('click', () => { $('#tip').hidden = true; tipT = 0; });
export function tipTick(dt) {
  if (tipT > 0) { tipT -= dt; if (tipT <= 0) $('#tip').hidden = true; }
  if (state !== 'play' || !MS || !MS.def) return;
  if (missionT > 1.5) tip('start');
  const live = agents.filter((a) => !a.dead);
  if (people.some((p) => !p.dead && (p.fac === 'corp' || p.fac === 'law') && !p.alerted && p.sus > 0.3)) tip('stealth');
  if (live.some((a) => deckOf(a) && WORLD.uplinks.some((u) => Math.hypot(u.x - a.x, u.z - a.z) < 9))) tip('uplink');
  if (WORLD.towers.some((t) => t.spotOn && live.some((a) => Math.hypot(a.x - t.spot[0], a.z - t.spot[1]) < 3.4))) tip('light');
  if (live.some((a) => { const id = a.slots[a.cur], w = id && WEAPONS[id]; if (!w || w.energy != null) return false; const am = a.ammo[id]; return am && am.mag + am.res < w.mag * w.mags * 0.3; })) tip('ammo');
  if (pickups.some((it) => live.some((a) => Math.hypot(a.x - it.x, a.z - it.z) < 14))) tip('pickup');
  if (MS.alarm >= 2) tip('alarm');
  if (MS.objs[0] && MS.objs[0].st === 'done') tip('extract');
  if (cars.some((c) => !c.wreck && !c.gone && c !== target && c.driver !== 'script' && live.some((a) => !a.inCar && Math.hypot(a.x - c.x, a.z - c.z) < 6))) tip('car');
}
const noiseRings = [];
export function addNoise(x, z, r) { if (noiseRings.length > 12) noiseRings.shift(); noiseRings.push({ x, z, r, t: 0 }); }
export function drawCones(PH, SG, AM) {
  const s0 = [0, 0, 0];
  const sel = selAlive(); if (!sel.length) return;
  // sentry turrets: a range ring on the ground once the squad is anywhere near
  for (const t of turrets) {
    if (t.dead || !sel.some((a) => Math.hypot(a.x - t.x, a.z - t.z) < 34)) continue;
    const R = WEAPONS.turret.range, fr = t.friendly > 0, y = groundY(t.x, t.z) + 0.05;
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) { const a = i / 48 * TAU; toScreen(t.x + Math.sin(a) * R, y, t.z + Math.cos(a) * R, s0); if (i) ctx.lineTo(s0[0], s0[1]); else ctx.moveTo(s0[0], s0[1]); }
    ctx.setLineDash([6 * DPR, 6 * DPR]); ctx.lineWidth = 1.5 * DPR; ctx.strokeStyle = fr ? 'rgba(134,250,221,0.45)' : 'rgba(255,70,90,' + (0.4 + 0.2 * Math.sin(time * 5)) + ')'; ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
    toScreen(t.x, y + 2.6, t.z, s0); label(fr ? 'SENTRY // OURS' : 'SENTRY', s0[0], s0[1] - 8 * DPR, fr ? 'rgba(134,250,221,0.95)' : 'rgba(255,91,130,0.95)');
  }
  const anyArmed = agents.some((a) => !a.dead && a.armed);
  for (const p of people) {
    if (p.dead || p.inCar || p.alerted || p.stun > 0) continue;
    if (!(p.fac === 'corp' || (p.fac === 'law' && anyArmed))) continue;
    if (p.kind === 'courier' || p.kind === 'exec') continue;
    if (!sel.some((a) => Math.hypot(a.x - p.x, a.z - p.z) < 38)) continue;
    const y = (p.elev || groundY(p.x, p.z)) + 0.08;
    const far = p.kind === 'cop' ? 14 : 15 + (p.elev ? 6 : 0), near = p.kind === 'cop' ? 14 : 6.5 + (p.elev ? 6 : 0);
    const susp = p.sus > 0.05;
    const ray = (a, r) => { const dx = Math.sin(a), dz = Math.cos(a); const d = p.elev ? r : Math.min(r, wallDist(p.x, p.z, dx, dz, r)); return [p.x + dx * d, p.z + dz * d]; };
    const poly = (r) => { const pts = [[p.x, p.z]]; for (let k = -8; k <= 8; k++) pts.push(ray(p.yaw + k / 8 * 1.0, r)); return pts; };
    const path = (pts) => { ctx.beginPath(); pts.forEach(([x, z], i) => { toScreen(x, y, z, s0); if (i) ctx.lineTo(s0[0], s0[1]); else ctx.moveTo(s0[0], s0[1]); }); ctx.closePath(); };
    path(poly(near)); ctx.fillStyle = susp ? 'rgba(255,196,107,0.16)' : 'rgba(255,91,130,0.09)'; ctx.fill();
    if (far > near) { path(poly(far)); ctx.setLineDash([3 * DPR, 4 * DPR]); ctx.strokeStyle = susp ? AM + '0.5)' : SG + '0.28)'; ctx.stroke(); ctx.setLineDash([]); }
  }
  for (const n of noiseRings) { const f = 1 - n.t / 0.7; if (f > 0) groundRing(n.x, n.z, n.r * Math.min(1, n.t / 0.35 + 0.15), PH + (0.55 * f).toFixed(2) + ')', null, 0.15); }
}
export function noiseTick(dt) { for (const n of noiseRings) n.t += dt; while (noiseRings.length && noiseRings[0].t > 0.7) noiseRings.shift(); }
