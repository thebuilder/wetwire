import { SCAN } from './world_load';
import { $, R, Rr, TAU, angDiff, pick } from './core';
import { GW, WORLD, barrels, blockCells, openCells, walk } from './world_head';
import { ROADX } from './world_build';
import { CTX, C_ROAD, C_VOID, RN, groundY, lci } from './layout';
import { spawnP } from './models';
import { camT, camYaw, setShake, sfx, shake } from './engine';
import { MS, agents, cars, people, pickups, selected, time, turrets } from './setup';
import { addDyn, damageCar, explode, group, hurt, moveToward, say, squadCenter, wallDist } from './sim';
import { extractPos, locatorPos, targetPos } from './hud';

/* ================================================================ chaos: fire, fuel drums, panic, the scanner
   Fire is a list of burning patches. People who stand in one catch fire, run screaming and spread it.
   Explosions, wrecks, the flamer and fuel drums all leave fire behind, so fights snowball the way
   they did in Syndicate. */
export let fires = [], screamT = -9;
export function setFires(v: typeof fires) { return fires = v; }

function scream(x, z, force?) { if (!force && time - screamT < 0.4) return; screamT = time; sfx('scream', x, z, 0.5, Rr(0.78, 1.3)); }
/* crowds near an explosion or a burning body bolt, and some scream as they go */
export function panic(x, z, r) {
  let n = 0;
  for (const p of people) {
    if (p.dead || p.fac !== 'civ' || p.inCar || p.state === 'entering') continue;
    const d = Math.hypot(p.x - x, p.z - z); if (d > r) continue;
    if (p.state !== 'flee' && n++ < 3 && R() < 0.5) scream(p.x, p.z);
    p.state = 'flee'; p.fx = x; p.fz = z; p.t = Rr(6, 11);
  }
}
export function addFire(x, z, r, life, src) {
  if (fires.length > 48) fires.shift();
  fires.push({ x, z, r, life, max: life, src, emit: 0 });
}
export function ignite(p, src) {
  if (p.dead || p.inCar || p.elev || p.burnT > 0 || p.state === 'entering') return;
  p.burnT = p.kind === 'agent' ? 2.2 : Rr(4, 6); p.burnSrc = src; p.bdir = R() * TAU;
  sfx('ignite', p.x, p.z, 0.6);
  if (p.kind !== 'agent') { scream(p.x, p.z, true); panic(p.x, p.z, 10); }
  else say(p.name + ' IS ON FIRE', 'bad');
}
/* returns true when burning takes over the person's behaviour (everyone but agents) */
export function burnTick(p, dt) {
  p.burnT -= dt;
  if (R() < dt * 22) spawnP(p.x + Rr(-0.3, 0.3), (p.elev || 0) + Rr(0.3, 1.7), p.z + Rr(-0.3, 0.3), Rr(-0.3, 0.3), Rr(1.2, 2.6), Rr(-0.3, 0.3), R() < 0.5 ? [3.4, 1.4, 0.3] : [3.2, 2.3, 0.7], Rr(0.2, 0.38), Rr(0.3, 0.6), -1, 1);
  if (R() < dt * 3) spawnP(p.x, 1.8, p.z, Rr(-0.2, 0.2), Rr(1, 2), Rr(-0.2, 0.2), [0.08, 0.07, 0.08], Rr(0.4, 0.7), Rr(1, 1.8), -0.3, 0.4);
  hurt(p, (p.kind === 'agent' ? 12 : 18) * dt, p.burnSrc);
  if (p.dead) return true;
  for (const o of people) { if (o === p || o.dead || o.burnT > 0 || o.inCar) continue; if (Math.abs(o.x - p.x) < 0.9 && Math.abs(o.z - p.z) < 0.9 && R() < dt * 0.8) ignite(o, p.burnSrc); }
  if (p.kind === 'agent') return false;
  if (R() < dt * 0.9) scream(p.x, p.z);
  p.bdir += Rr(-3, 3) * dt; p.path = null; p.aim = 0;
  const before = [p.x, p.z]; moveToward(p, p.x + Math.sin(p.bdir) * 3, p.z + Math.cos(p.bdir) * 3, 4.2, dt);
  if (Math.hypot(p.x - before[0], p.z - before[1]) < 0.02) p.bdir += Math.PI * 0.7;
  p.walk = 1.3; p.phase += dt * 4.2 * 2.4;
  if (p.burnT <= 0 && p.fac === 'civ') { p.state = 'flee'; p.fx = p.x; p.fz = p.z; p.t = 4; }
  return p.burnT > 0;
}
export function updateFires(dt) {
  for (let i = fires.length - 1; i >= 0; i--) {
    const f = fires[i]; f.life -= dt;
    if (f.life <= 0) { fires.splice(i, 1); continue; }
    const k = Math.min(1, f.life / 2.5), r = f.r * (0.6 + 0.4 * k);
    f.emit += dt * r * r * 9 * k;
    while (f.emit > 1) {
      f.emit--;
      const a = R() * TAU, d = Math.sqrt(R()) * r;
      spawnP(f.x + Math.sin(a) * d, groundY(f.x, f.z) + 0.15, f.z + Math.cos(a) * d, Rr(-0.3, 0.3), Rr(1.2, 3.2), Rr(-0.3, 0.3), R() < 0.45 ? [3.6, 1.3, 0.25] : R() < 0.8 ? [3.4, 2.2, 0.6] : [3.6, 3.1, 1.6], Rr(0.25, 0.5) * (0.6 + r * 0.25), Rr(0.35, 0.75), -1.6, 1.2);
    }
    if (R() < dt * r * 1.6) spawnP(f.x + Rr(-r, r) * 0.5, 2, f.z + Rr(-r, r) * 0.5, Rr(-0.3, 0.3) + 0.4, Rr(1, 2), Rr(-0.3, 0.3), [0.07, 0.06, 0.07], Rr(0.7, 1.3), Rr(1.5, 3), -0.2, 0.3);
    for (const p of people) { if (p.dead || p.burnT > 0 || p.inCar || p.elev) continue; if (Math.hypot(p.x - f.x, p.z - f.z) < r && R() < dt * 3) ignite(p, f.src); }
    for (const c of cars) { if (c.wreck || c.gone) continue; if (Math.hypot(c.x - f.x, c.z - f.z) < r + 1.4) damageCar(c, 14 * dt, f.src, 'blast'); }
    for (const b of barrels) { if (b.dead) continue; if (Math.hypot(b.x - f.x, b.z - f.z) < r + b.r) hurtBarrel(b, 10 * dt, f.src); }
  }
}
/* ---------------------------------------------------------------- fuel drums and tanks */
export function hurtBarrel(b, dmg, src) {
  if (b.dead) return;
  b.hp -= dmg; b.src = src || b.src; b.flash = 0.1;
  if (b.hp <= b.maxHp * 0.5 && !b.fuse) { b.fuse = b.big ? 3.2 : 1.8; sfx('ignite', b.x, b.z, 0.5); }
  if (b.hp <= 0) blowBarrel(b);
}
function blowBarrel(b) {
  if (b.dead) return;
  b.dead = true; openCells(b.x - b.r, b.z - b.r, b.x + b.r, b.z + b.r);
  explode(b.x, b.z, b.big ? 12 : 4.5, b.big ? 240 : 130, b.src, true);
  addFire(b.x, b.z, b.big ? 4.5 : 2.2, b.big ? 16 : 9, b.src);
  if (b.big) for (let i = 0; i < 4; i++) { const a = R() * TAU; addFire(b.x + Math.sin(a) * Rr(3, 6), b.z + Math.cos(a) * Rr(3, 6), Rr(1.2, 2), Rr(5, 9), b.src); }
  setShake(Math.max(shake, b.big ? 1.4 : 0.8));
}
export function updateBarrels(dt) {
  for (const b of barrels) {
    if (b.dead) continue;
    if (b.flash > 0) b.flash -= dt;
    if (b.fuse > 0) {
      b.fuse -= dt;
      if (R() < dt * 30) spawnP(b.x + Rr(-b.r, b.r) * 0.6, (b.big ? 3.2 : 1.05) + 0.1, b.z + Rr(-b.r, b.r) * 0.6, Rr(-0.3, 0.3), Rr(1.5, 3), Rr(-0.3, 0.3), R() < 0.5 ? [3.6, 1.4, 0.3] : [3.4, 2.4, 0.7], Rr(0.2, 0.4) * (b.big ? 2 : 1), Rr(0.3, 0.6), -1.5, 1);
      if (b.fuse <= 0) blowBarrel(b);
    }
  }
}
/* ---------------------------------------------------------------- flamer */
export function flameShot(sh, w, yaw, range, mx, my, mz) {
  const dx = Math.sin(yaw), dz = Math.cos(yaw), wd = wallDist(mx, mz, dx, dz, range), reach = Math.min(range, wd + 0.4), sg = group(sh);
  for (let i = 0; i < 7; i++) {
    const a = yaw + Rr(-0.2, 0.2), s = Rr(8, 12), life = reach / s * Rr(0.8, 1.1);
    spawnP(mx, my - 0.15, mz, Math.sin(a) * s, Rr(-0.4, 0.8), Math.cos(a) * s, R() < 0.5 ? [3.6, 1.5, 0.3] : [3.4, 2.5, 0.8], Rr(0.22, 0.42), life, -1.2, 0.6);
  }
  const hitCone = (x, z, pad) => { const ox = x - mx, oz = z - mz, d = Math.hypot(ox, oz); return d < reach + pad && Math.abs(angDiff(yaw, Math.atan2(ox, oz))) < 0.28 + 0.6 / Math.max(d, 1.2); };
  for (const p of people) {
    if (p.dead || p === sh || p.inCar || p.elev) continue;
    if (sg !== 'N' && group(p) === sg) continue;
    if (!hitCone(p.x, p.z, 0.3)) continue;
    hurt(p, w.dmg, sh); if (R() < 0.4) ignite(p, sh);
  }
  for (const c of cars) { if (c.wreck || c.gone || c.occ.includes(sh)) continue; if (hitCone(c.x, c.z, 1.4)) damageCar(c, w.dmg * 0.7, sh, 'blast'); }
  for (const b of barrels) { if (!b.dead && hitCone(b.x, b.z, b.r)) hurtBarrel(b, w.dmg * 0.8, sh); }
  if (R() < 0.3) { const d = reach * Rr(0.55, 1); addFire(mx + dx * d, mz + dz * d, Rr(0.9, 1.4), Rr(2.5, 4), sh); }
  addDyn(mx + dx * reach * 0.5, 1.2, mz + dz * reach * 0.5, 9, [3, 1.4, 0.4], 0.12);
  if (time - (sh.flameSfx || -9) > 0.28) { sh.flameSfx = time; sfx('flame', mx, mz, 0.7, Rr(0.9, 1.1)); }
}
/* ================================================================ scanner: rotating top-down view, bottom left, like 1993 */
function buildScanMap() {
  const c = document.createElement('canvas'); c.width = GW; c.height = GW;
  const g = c.getContext('2d'), im = g.createImageData(GW, GW), d = im.data;
  for (let z = 0; z < GW; z++) for (let x = 0; x < GW; x++) {
    const i = z * GW + x, j = i * 4; let col;
    const ci = RN ? lci(x + 0.5, z + 0.5) : -1, ct = ci >= 0 ? CTX[ci] : -1;
    if (ct === C_VOID) col = [8, 34, 44];
    else if (!walk[i]) col = [10, 18, 22];
    else if (ct === C_ROAD) col = [28, 64, 62];
    else col = [18, 38, 40];
    if (!RN && Math.abs(x + 0.5 - ROADX) < 4) col = [28, 64, 62];
    d[j] = col[0]; d[j + 1] = col[1]; d[j + 2] = col[2]; d[j + 3] = 255;
  }
  g.putImageData(im, 0, 0); SCAN.img = c;
}
function scanXY(x, z, cx, cz, k) { const dx = x - cx, dz = z - cz, c = Math.cos(camYaw), s = Math.sin(camYaw); return [(dx * c - dz * s) * k, (dx * s + dz * c) * k]; }
export function drawScanner() {
  const cv = $('#scan'); if (!cv || !WORLD) return;
  const W = cv.clientWidth || 184, dpr = Math.min(2, window.devicePixelRatio || 1), P = Math.round(W * dpr);
  if (cv.width !== P) { cv.width = P; cv.height = P; }
  if (!SCAN.img) buildScanMap();
  const g = cv.getContext('2d'), k = (P / 2) / SCAN.R, h = P / 2;
  const sc = agents.some((a) => !a.dead) ? squadCenter() : [camT.x, camT.z], cx = sc[0], cz = sc[1];
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#05080b'; g.fillRect(0, 0, P, P);
  g.save(); g.translate(h, h); g.rotate(camYaw); g.scale(k, k); g.translate(-cx, -cz); g.imageSmoothingEnabled = false; g.drawImage(SCAN.img, 0, 0); g.restore();
  // view footprint and sweep
  const sw = (time * 1.4) % TAU; g.strokeStyle = 'rgba(134,250,221,0.10)'; g.lineWidth = dpr; g.beginPath(); g.moveTo(h, h); g.lineTo(h + Math.cos(sw) * h * 1.5, h + Math.sin(sw) * h * 1.5); g.stroke();
  const dot = (x, z, s, col, edge?) => {
    let [px, py] = scanXY(x, z, cx, cz, k); const m = h - 3 * dpr, out = Math.abs(px) > m || Math.abs(py) > m;
    if (out) { if (!edge) return; const f = m / Math.max(Math.abs(px), Math.abs(py)); px *= f; py *= f; }
    g.fillStyle = col; const ss = s * dpr; g.fillRect(Math.round(h + px - ss / 2), Math.round(h + py - ss / 2), ss, ss); return out;
  };
  for (const c of cars) if (!c.gone) dot(c.x, c.z, 4, c.wreck ? '#3a2a20' : c.driver === 'police' ? '#5a7cff' : c.driver === 'player' ? '#86fadd' : '#8c9bb0');
  for (const p of people) {
    if (p.dead || p.inCar || p.kind === 'agent') continue;
    const g2 = group(p), col = p.burnT > 0 ? '#ffb347' : g2 === 'P' ? '#2f9a8a' : g2 === 'L' ? (p.alerted ? '#7aa0ff' : '#3c5bb0') : g2 === 'C' ? (p.alerted ? '#ff5b82' : '#a33a58') : '#4a5868';
    dot(p.x, p.z, g2 === 'N' ? 2 : 3, col);
  }
  for (const t of turrets) if (!t.dead) dot(t.x, t.z, 3, t.friendly > 0 ? '#86fadd' : '#ff5b82');
  for (const b of barrels) if (!b.dead) dot(b.x, b.z, b.big ? 4 : 2, '#c07a20');
  for (const f of fires) dot(f.x, f.z, 3, Math.floor(time * 8 + f.x) % 2 ? '#ff8a2a' : '#ffd060');
  for (const it of pickups) dot(it.x, it.z, 2, it.id === 'case' ? '#ffc46b' : '#d9a441');
  // locator line: squad to target (or extraction), with a sonar ring on each ping
  const lp = MS && MS.def ? locatorPos() : null;
  if (lp) {
    let [px, py] = scanXY(lp.p[0], lp.p[1], cx, cz, k); const m = h - 3 * dpr;
    if (Math.abs(px) > m || Math.abs(py) > m) { const f = m / Math.max(Math.abs(px), Math.abs(py)); px *= f; py *= f; }
    const c = lp.col.join(','), age = MS.pingAt != null ? time - MS.pingAt : 9, flash = Math.max(0, 1 - age / 0.6);
    g.strokeStyle = 'rgba(' + c + ',' + (0.28 + 0.5 * flash).toFixed(2) + ')'; g.lineWidth = (1 + flash) * dpr;
    g.beginPath(); g.moveTo(h, h); g.lineTo(h + px, h + py); g.stroke();
    if (age < 1.1) { const f = age / 1.1; g.strokeStyle = 'rgba(' + c + ',' + (0.8 * (1 - f)).toFixed(2) + ')'; g.lineWidth = 1.5 * dpr; g.beginPath(); g.arc(h + px, h + py, (3 + f * 16) * dpr, 0, TAU); g.stroke(); }
  }
  const ex = typeof extractPos === 'function' ? extractPos() : null;
  if (ex && MS && MS.objs && MS.objs[0] && MS.objs[0].st !== 'open') dot(ex[0], ex[1], 6, Math.floor(time * 3) % 2 ? '#b4f06a' : '#5a7a30', true);
  const tp = typeof targetPos === 'function' ? targetPos() : null;
  if (tp && MS.objs[0].st === 'open') { const on = Math.floor(time * 4) % 2; dot(tp[0], tp[1], on ? 7 : 5, on ? '#ff5b82' : '#ffd0dc', true); }
  for (const a of agents) if (!a.dead) dot(a.inCar ? a.inCar.x : a.x, a.inCar ? a.inCar.z : a.z, 4, selected.has(a) ? '#ffffff' : '#86fadd');
  g.strokeStyle = 'rgba(134,250,221,0.25)'; g.lineWidth = dpr; g.strokeRect(0.5 * dpr, 0.5 * dpr, P - dpr, P - dpr);
}
export function scanClick(e) {
  const cv = $('#scan'), r = cv.getBoundingClientRect(), W = r.width, k = (W / 2) / SCAN.R;
  const px = (e.clientX - r.left - W / 2) / k, py = (e.clientY - r.top - W / 2) / k, c = Math.cos(camYaw), s = Math.sin(camYaw);
  const sc = agents.some((a) => !a.dead) ? squadCenter() : [camT.x, camT.z];
  camT.x = sc[0] + px * c + py * s; camT.z = sc[1] - px * s + py * c;
  e.stopPropagation(); e.preventDefault();
}
