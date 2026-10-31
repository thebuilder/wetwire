import * as THREE from 'three';
import { CFG, NL, Rr, TAU, U, clamp, ctx, lerp } from './core';
import { WORLD, barrels } from './world_head';
import { groundY } from './layout';
import { CARM, PART_MAX, PMAX, TR_MAX, barrelMesh, decalMesh, itemMesh, partCol, partGeo, partPos, partSize, parts, peopleMesh, shadowMesh, tankMesh, trCol, trGeo, trPos, tracers, trainCars, turretMesh } from './models';
import { DPR, LH, LW, PPU, SH, SW, VN_MAX, _v, camT, snapCam, toScreen, vnCol, vnGeo, vnPos, vnShape, vnSize } from './engine';
import { SAVE, WEAPONS } from './campaign';
import { MS, agents, beams, blackouts, cars, decals, dyn, flyers, hackJob, hackOn, hackT, moveMarks, people, pickups, selected, state, target, time, train, turrets } from './setup';
import { connectedUplinkFor, group, squadCenter } from './sim';
import { fires } from './chaos';
import { aimLock } from './commands';
import { holdFire, hover, mouse, ptr } from './input';
import { extractPos, targetPos } from './hud';
import { drawCones } from './tactical';

/* ================================================================ per-frame upload */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0), _e = new THREE.Euler(0, 0, 0, 'YXZ');
function setInst(mesh, i, x, y, z, yaw, sc) { _q.setFromAxisAngle(_y, yaw); _s.set(sc, sc, sc); _p.set(x, y, z); _m.compose(_p, _q, _s); mesh.setMatrixAt(i, _m); }
function setInstR(mesh, i, x, y, z, yaw, pitch, roll) { _e.set(pitch, yaw, roll, 'YXZ'); _q.setFromEuler(_e); _s.set(1, 1, 1); _p.set(x, y, z); _m.compose(_p, _q, _s); mesh.setMatrixAt(i, _m); }
export function uploadPeople() {
  const ac = peopleMesh.geometry.attributes;
  let n = 0;
  for (const p of people) {
    if (p.inCar || n >= PMAX) continue;
    setInst(peopleMesh, n, p.x, p.elev || groundY(p.x, p.z), p.z, p.yaw, p.scale);
    ac.iColor.setXYZ(n, p.color[0], p.color[1], p.color[2]);
    ac.iSkin.setXYZ(n, p.skin[0], p.skin[1], p.skin[2]);
    ac.iAnim.setXYZW(n, p.phase, p.walk, p.aim, p.dead ? p.deadT : 0);
    let rim = p.rim;
    if (p.kind === 'cop' && p.fac === 'law' && p.alerted) rim = Math.floor(time * 4 + p.id) % 2 ? [1, 0.15, 0.2] : [0.2, 0.4, 1];
    if (p.stun > 0 && !p.dead) rim = [1, 1, 1];
    if (p.burnT > 0 && !p.dead) { const f = 0.7 + 0.3 * Math.sin(time * 31 + p.id); rim = [2.4 * f, 0.9 * f, 0.15 * f]; }
    ac.iRim.setXYZ(n, rim[0], rim[1], rim[2]);
    ac.iMisc.setXYZW(n, p.umb, p.armed, p.coat, p.flash > 0 ? 1 : 0);
    n++;
  }
  peopleMesh.count = n; peopleMesh.instanceMatrix.needsUpdate = true;
  for (const k of ['iColor', 'iSkin', 'iAnim', 'iRim', 'iMisc']) ac[k].needsUpdate = true;
}
function uploadTinted(mesh, list, fn) {
  const ac = mesh.geometry.attributes; let n = 0;
  for (const it of list) { if (n >= mesh.instanceMatrix.count) break; fn(it, n, ac); n++; }
  mesh.count = n; mesh.instanceMatrix.needsUpdate = true; ac.iColor.needsUpdate = true; ac.iAnim.needsUpdate = true;
}
const CAR_TYPES = ['sedan', 'van', 'police', 'limo', 'spinner', 'jeep', 'truck', 'vtol'];
const WHEELED = { jeep: 1, truck: 1 };
export function uploadCars() {
  const by: any = {}; for (const t of CAR_TYPES) by[t] = [];
  for (const c of cars) if (!c.gone) by[c.model].push(c);
  for (const t of CAR_TYPES) {
    if (t === 'spinner') continue;
    uploadTinted(CARM[t], by[t], (c, i, ac) => {
      if (c.wreck && c.wp == null) { c.wp = Rr(-0.07, 0.07); c.wr = Rr(-0.13, 0.13); }
      const y = c.wreck ? (WHEELED[t] ? -0.14 : -0.3) : WHEELED[t] ? 0 : 0.08 + Math.sin(time * 3 + c.id) * 0.03;
      setInstR(CARM[t], i, c.x, y + (c.alt || 0), c.z, c.yaw, c.wreck ? c.wp : 0, c.wreck ? c.wr : 0);
      const f = c.flash > 0 ? 2.5 : 1; ac.iColor.setXYZ(i, c.color[0] * f, c.color[1] * f, c.color[2] * f);
      const g = c.hackT > 0 ? [0.4, 2, 1.7] : c.stall > 0 && !c.wreck ? [0.15, 0.15, 0.15] : c.glow;
      ac.iAnim.setXYZW(i, g[0], g[1], g[2], c.wreck ? 1 + clamp(c.burn / 14, 0, 1) : 0);
    });
  }
  uploadTinted(CARM.spinner, flyers, (f, i, ac) => {
    const x = f.ax ? f.pos : f.lane, z = f.ax ? f.lane : f.pos, yaw = f.ax ? (f.speed > 0 ? Math.PI / 2 : -Math.PI / 2) : (f.speed > 0 ? 0 : Math.PI);
    setInst(CARM.spinner, i, x, f.y + Math.sin(time + f.ph) * 0.3, z, yaw, 1);
    ac.iColor.setXYZ(i, f.color[0], f.color[1], f.color[2]); ac.iAnim.setXYZW(i, f.glow[0], f.glow[1], f.glow[2], 0);
  });
  uploadTinted(shadowMesh, flyers, (f, i, ac) => {
    const x = f.ax ? f.pos : f.lane, z = f.ax ? f.lane : f.pos;
    setInst(shadowMesh, i, x, groundY(x, z) + 0.02, z, f.ax ? Math.PI / 2 : 0, 3.4 - f.y * 0.03);
    ac.iColor.setXYZ(i, 0, 0, 0); ac.iAnim.setXYZW(i, 1, f.ph, 0, 0);
  });
  const drum = (b, i, ac, mesh) => {
    setInst(mesh, i, b.x, groundY(b.x, b.z), b.z, 0, 1);
    const f = b.flash > 0 ? 2.2 : 1; ac.iColor.setXYZ(i, b.col[0] * f, b.col[1] * f, b.col[2] * f);
    const blink = b.fuse > 0 ? (Math.floor(time * 10) % 2 ? 1 : 0.2) : 0.35; ac.iAnim.setXYZW(i, 1.8 * blink, 0.35 * blink, 0.05, 0);
  };
  uploadTinted(barrelMesh, barrels.filter((b) => !b.dead && !b.big), (b, i, ac) => drum(b, i, ac, barrelMesh));
  uploadTinted(tankMesh, barrels.filter((b) => !b.dead && b.big), (b, i, ac) => drum(b, i, ac, tankMesh));
  uploadTinted(turretMesh, turrets, (t, i, ac) => {
    setInst(turretMesh, i, t.x, 0.15, t.z, t.yaw, 1);
    const f = t.flash > 0 ? 2 : 1; ac.iColor.setXYZ(i, 0.35 * f, 0.36 * f, 0.4 * f);
    const pulse = 0.75 + 0.25 * Math.sin(time * 6 + t.x), g = t.friendly > 0 ? [0.3 * pulse * 2, 1 * pulse * 2, 0.85 * pulse * 2] : [2.2 * pulse, 0.15, 0.25]; ac.iAnim.setXYZW(i, g[0], g[1], g[2], t.dead ? 1 : 0);
  });
  uploadTinted(decalMesh, decals, (d, i, ac) => { setInst(decalMesh, i, d.x, d.y, d.z, d.yaw, d.s); ac.iColor.setXYZ(i, d.col[0], d.col[1], d.col[2]); ac.iAnim.setXYZW(i, d.ty || 0, d.seed || 0, 0, 0); });
  uploadTinted(itemMesh, pickups, (it, i, ac) => {
    setInst(itemMesh, i, it.x, groundY(it.x, it.z) + 0.35 + Math.sin(time * 2.5 + it.spin) * 0.06, it.z, it.spin * 0.8, it.id === 'launcher' || it.id === 'minigun' ? 1.8 : 1.4);
    ac.iColor.setXYZ(i, 0.3, 0.31, 0.34);
    const g = SAVE.avail.includes(it.id) ? [0.3, 1, 0.85] : [1, 0.62, 0.18]; ac.iAnim.setXYZW(i, g[0], g[1], g[2], 0);
  });
  trainCars.forEach((m, i) => { m.position.set(WORLD.rail, 9.0, train.z - i * 11.2); m.updateMatrixWorld(); });
  for (const gt of WORLD.gates) if (gt.mesh) { gt.mesh.position.set(gt.x0 + gt.open * (gt.x1 - gt.x0) * 0.92, 0, gt.z); gt.mesh.updateMatrixWorld(); }
}
export function uploadFX() {
  const n = Math.min(parts.length, PART_MAX);
  for (let i = 0; i < n; i++) {
    const p = parts[i], f = p.life / p.max;
    partPos[i * 3] = p.x; partPos[i * 3 + 1] = p.y; partPos[i * 3 + 2] = p.z;
    partCol[i * 3] = p.c[0] * f; partCol[i * 3 + 1] = p.c[1] * f; partCol[i * 3 + 2] = p.c[2] * f;
    partSize[i] = p.size * (0.5 + 0.5 * f);
  }
  partGeo.setDrawRange(0, n);
  partGeo.attributes.position.needsUpdate = true; partGeo.attributes.aCol.needsUpdate = true; partGeo.attributes.aSize.needsUpdate = true;
  let m = 0;
  const line = (x0, y0, z0, x1, y1, z1, c) => { if (m >= TR_MAX) return; trPos.set([x0, y0, z0, x1, y1, z1], m * 6); trCol.set([c[0], c[1], c[2], c[0], c[1], c[2]], m * 6); m++; };
  for (const t of tracers) { const f = t.life / t.max; line(t.x0, t.y0, t.z0, t.x1, t.y1, t.z1, [t.c[0] * f, t.c[1] * f, t.c[2] * f]); }
  for (const t of WORLD.towers) {
    if (!t.spotOn) continue;
    const [lx, ly, lz] = t.lamp, bc = [0.16, 0.17, 0.2];
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; line(lx, ly, lz, t.spot[0] + Math.cos(a) * 2.6, 0.1, t.spot[1] + Math.sin(a) * 2.6, bc); }
    line(lx, ly, lz, t.spot[0], 0.1, t.spot[1], [0.3, 0.32, 0.36]);
  }
  trGeo.setDrawRange(0, m * 2); trGeo.attributes.position.needsUpdate = true; trGeo.attributes.aCol.needsUpdate = true;
}
const lightList = [];
export function uploadLights() {
  lightList.length = 0;
  const cx = camT.x, cz = camT.z;
  for (const a of agents) { if (a.dead || a.inCar) continue; lightList.push([a.x, (a.elev || 0) + 2.6, a.z + 0.4, 4, 0.5, 0.52, 0.56, -0.5]); }
  for (const t of turrets) { if (t.dead) continue; const dx = t.x - cx, dz = t.z - cz, k = 0.7 + 0.3 * Math.sin(time * 6 + t.x); lightList.push(t.friendly > 0 ? [t.x, 2.2, t.z, 5, 0.3 * k, 1.1 * k, 0.95 * k, dx * dx + dz * dz - 300] : [t.x, 2.2, t.z, 5.5, 1.8 * k, 0.15 * k, 0.2 * k, dx * dx + dz * dz - 300]); }
  for (const f of fires) { const dx = f.x - cx, dz = f.z - cz, k = clamp(f.life / 2.5, 0, 1) * (0.8 + 0.2 * Math.sin(time * 19 + f.x)); lightList.push([f.x, 1.4, f.z, 4 + f.r * 2.5, 2.6 * k, 1.1 * k, 0.3 * k, dx * dx + dz * dz - 600]); }
  for (const p of people) if (p.burnT > 0 && !p.dead) { const dx = p.x - cx, dz = p.z - cz; lightList.push([p.x, 1.4, p.z, 5, 2.2, 0.9, 0.25, dx * dx + dz * dz - 500]); }
  for (const d of dyn) { const f = d.life / d.max; lightList.push([d.x, d.y, d.z, d.r, d.c[0] * f, d.c[1] * f, d.c[2] * f, -1]); }
  for (const it of pickups) { const dx = it.x - cx, dz = it.z - cz, d2 = dx * dx + dz * dz; if (d2 > 45 * 45) continue; const nw = it.id === 'case' || !SAVE.avail.includes(it.id), k = 0.55 + 0.25 * Math.sin(time * 4 + it.spin); lightList.push([it.x, 0.9, it.z, 3.2, (nw ? 1.4 : 0.3) * k, (nw ? 0.85 : 1.1) * k, (nw ? 0.25 : 0.95) * k, d2 - 200]); }
  for (const t of WORLD.towers) if (t.spotOn) { const dx = t.spot[0] - cx, dz = t.spot[1] - cz; lightList.push([t.spot[0], 2.4, t.spot[1], 7.5, 2.2, 2.3, 2.5, -0.8]); lightList.push([t.lamp[0], t.lamp[1], t.lamp[2], 5, 1.2, 1.25, 1.35, dx * dx + dz * dz]); }
  for (const L of WORLD.lights) {
    if (L.off > 0) continue;
    const dx = L.x - cx, dz = L.z - cz, d2 = dx * dx + dz * dz; if (d2 > 70 * 70) continue;
    let k = 1; if (L.kind === 'neon' && Math.sin(time * 23 + L.x) > 0.995) k = 0.3;
    lightList.push([L.x, L.y, L.z, L.r, L.c[0] * k, L.c[1] * k, L.c[2] * k, d2]);
  }
  for (const c of cars) {
    if (c.gone) continue;
    const dx = c.x - cx, dz = c.z - cz, d2 = dx * dx + dz * dz; if (d2 > 50 * 50) continue;
    if (c.wreck) { if (c.burn > 0) { const f = clamp(c.burn / 6, 0, 1) * (0.75 + 0.25 * Math.sin(time * 17 + c.id)); lightList.push([c.x, 1.6, c.z, 10, 2.2 * f, 0.95 * f, 0.25 * f, d2 - 50]); } continue; }
    if (c.parked && c.driver !== 'player') continue;
    if (c.stall > 0) continue;
    lightList.push([c.x + Math.sin(c.yaw) * 3.5, 0.9, c.z + Math.cos(c.yaw) * 3.5, 7, 0.75, 0.7, 0.55, d2 + 300]);
    if (c.model === 'police') { const b = Math.floor(time * 5) % 2; lightList.push([c.x, 2, c.z, 9, b ? 1.6 : 0.2, 0.2, b ? 0.3 : 1.8, d2 + 100]); }
  }
  if (WORLD.kind === 'city') for (const t of trainCars) { const dz = t.position.z - cz, dx = t.position.x - cx; if (dx * dx + dz * dz < 60 * 60) lightList.push([t.position.x, 8.5, t.position.z, 10, 0.3, 1, 0.85, dx * dx + dz * dz]); }
  lightList.sort((a, b) => a[7] - b[7]);
  const n = Math.min(NL, lightList.length);
  for (let i = 0; i < n; i++) { const l = lightList[i]; U.uLP.value[i].set(l[0], l[1], l[2], l[3]); U.uLC.value[i].set(l[4], l[5], l[6]); }
  U.uLN.value = n;
  for (let i = 0; i < 4; i++) { const b = blackouts[i]; if (b) U.uBlack.value[i].set(b.x, b.z, b.r, clamp(b.t, 0, 1)); else U.uBlack.value[i].set(0, 0, 0, 0); }
}
export function uploadCut() {
  let n = 0;
  if (CFG.cut) for (const a of agents) {
    if (a.dead || a.inCar || n >= 4) continue;
    _v.set(a.x, 1.0, a.z).project(snapCam);
    _p.set(a.x, 1.0, a.z).applyMatrix4(snapCam.matrixWorldInverse);
    U.uCut.value[n].set((_v.x * 0.5 + 0.5) * LW, (_v.y * 0.5 + 0.5) * LH, -_p.z, 4.2 * PPU * 0.55 + 10);
    n++;
  }
  for (; n < 4; n++) U.uCut.value[n].set(0, 0, 0, 0);
}
const LVC = { civil: [0.53, 0.98, 0.87], sec: [1, 0.77, 0.42], mil: [1, 0.36, 0.51] };
export let hackList = [];
export function setHackList(v: typeof hackList) { return hackList = v; }
export function uploadVec() {
  let n = 0;
  const put = (x, y, z, c, s, sh) => { if (n >= VN_MAX) return; vnPos[n * 3] = x; vnPos[n * 3 + 1] = y; vnPos[n * 3 + 2] = z; vnCol[n * 3] = c[0]; vnCol[n * 3 + 1] = c[1]; vnCol[n * 3 + 2] = c[2]; vnSize[n] = s; vnShape[n] = sh; n++; };
  for (const u of WORLD.uplinks) {
    const hv = hover && hover.uplink === u;
    put(u.x, 1.2, u.z, u.burn > 0 ? [0.5, 0.12, 0.18] : u.agent ? [1, 1, 1] : [0.53, 0.98, 0.87], hv ? 24 : u.agent ? 18 : 14, 1);
  }
  for (const nd of hackList) {
    const hv = hover && !hover.uplink && hover.label === nd.label;
    const inR = !!connectedUplinkFor(nd);
    let c = (nd.cd || 0) > 0 ? [0.3, 0.4, 0.4] : LVC[nd.level];
    if (!inR) c = c.map((v) => v * 0.4);
    put(nd.x, nd.y, nd.z, c, hv ? 22 : nd.type === 'car' ? 10 : 13, 0);
  }
  for (const p of people) {
    if (p.dead || p.inCar) continue;
    const g = group(p); const c = p.kind === 'agent' ? [0.6, 1, 0.92] : g === 'P' ? [0.4, 0.9, 0.8] : g === 'L' ? [0.4, 0.6, 1] : g === 'C' ? [1, 0.36, 0.51] : [0.2, 0.45, 0.4];
    put(p.x, (p.elev || 0) + 1, p.z, c, p.kind === 'agent' ? 9 : g === 'N' ? 4 : 7, p.kind === 'agent' ? 1 : 2);
  }
  vnGeo.setDrawRange(0, n);
  for (const k of ['position', 'aCol', 'aSize', 'aShape']) vnGeo.attributes[k].needsUpdate = true;
}

/* ================================================================ overlay (2D vector UI) */
function bracket(x, y, w, h, l, col) {
  ctx.strokeStyle = col; ctx.beginPath();
  const L = l * DPR, x0 = Math.round(x - w / 2) + 0.5, y0 = Math.round(y - h / 2) + 0.5, x1 = Math.round(x + w / 2) + 0.5, y1 = Math.round(y + h / 2) + 0.5;
  ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0); ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
  ctx.moveTo(x1, y1 - L); ctx.lineTo(x1, y1); ctx.lineTo(x1 - L, y1); ctx.moveTo(x0 + L, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - L); ctx.stroke();
}
export function label(t, x, y, col, align?) { ctx.fillStyle = col; ctx.textAlign = align || 'center'; ctx.fillText(t, Math.round(x), Math.round(y)); }
export function groundRing(x, z, r, col, dash, y?) {
  const s = [0, 0, 0]; ctx.strokeStyle = col; if (dash) ctx.setLineDash(dash); ctx.beginPath();
  for (let k = 0; k <= 32; k++) { const a = k / 32 * TAU; toScreen(x + Math.cos(a) * r, y || 0.1, z + Math.sin(a) * r, s); if (k) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }
  ctx.stroke(); if (dash) ctx.setLineDash([]);
}
export function drawOverlay() {
  ctx.clearRect(0, 0, SW, SH);
  if (!MS || !MS.def) return;
  ctx.lineWidth = Math.max(1, Math.round(DPR)); ctx.font = '600 ' + (12 * DPR) + 'px "Chakra Petch", system-ui, sans-serif'; ctx.textBaseline = 'middle';
  const PH = 'rgba(134,250,221,', SG = 'rgba(255,91,130,', AM = 'rgba(255,196,107,';
  const s0 = [0, 0, 0], s1 = [0, 0, 0];
  const camsVisible = hackT > 0.05 || WORLD.cams.some((c) => c.spot);
  if (camsVisible) for (const c of WORLD.cams) {
    if (c.off > 0 && hackT < 0.05) continue;
    if (!c.spot && hackT < 0.05) continue;
    const col = c.off > 0 ? PH + (0.15 * hackT) + ')' : c.spot ? SG + '0.75)' : PH + (0.45 * hackT) + ')';
    ctx.strokeStyle = col; ctx.beginPath();
    toScreen(c.x, 0.2, c.z, s0); ctx.moveTo(s0[0], s0[1]);
    for (let k = -4; k <= 4; k++) { const a = c.yaw + k / 4 * 0.5; toScreen(c.x + Math.sin(a) * 15, 0.2, c.z + Math.cos(a) * 15, s1); ctx.lineTo(s1[0], s1[1]); }
    ctx.closePath(); ctx.stroke();
  }
  for (const t of WORLD.towers) if (t.spotOn) groundRing(t.spot[0], t.spot[1], 3.4, AM + '0.35)', [3 * DPR, 3 * DPR]);
  if (state === 'play') drawCones(PH, SG, AM);
  if (hackT > 0.05) {
    for (const u of WORLD.uplinks) {
      const on = u.agent && !u.agent.dead;
      groundRing(u.x, u.z, u.r, (on ? PH + (0.55 * hackT) : u.burn > 0 ? SG + (0.25 * hackT) : PH + (0.16 * hackT)) + ')', [5 * DPR, 5 * DPR]);
      toScreen(u.x, 1.2, u.z, s0);
      label(u.label + (u.burn > 0 ? ' // BURNED' : on ? ' // ' + u.agent.name : ''), s0[0], s0[1] + 16 * DPR, (u.burn > 0 ? SG : PH) + (0.9 * hackT) + ')');
      if (on || u.trace > 0.5) {
        const w = 44 * DPR; ctx.fillStyle = SG + (0.25 * hackT) + ')'; ctx.fillRect(s0[0] - w / 2, s0[1] + 24 * DPR, w, 3 * DPR);
        ctx.fillStyle = SG + (0.95 * hackT) + ')'; ctx.fillRect(s0[0] - w / 2, s0[1] + 24 * DPR, w * clamp(u.trace / 100, 0, 1), 3 * DPR);
      }
    }
  }
  if (hackJob) {
    const j = hackJob; toScreen(j.n.ref && j.n.ref.wreck !== undefined ? j.n.ref.x : j.n.x, j.n.y, j.n.ref && j.n.ref.wreck !== undefined ? j.n.ref.z : j.n.z, s0);
    ctx.strokeStyle = PH + '0.95)'; ctx.lineWidth = 2 * DPR; ctx.beginPath(); ctx.arc(s0[0], s0[1], 14 * DPR, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(j.t / j.dur, 0, 1)); ctx.stroke(); ctx.lineWidth = Math.max(1, Math.round(DPR));
    toScreen(j.a.x, 2.3, j.a.z, s1);
    ctx.strokeStyle = PH + '0.5)'; ctx.setLineDash([2 * DPR, 4 * DPR]); ctx.beginPath(); ctx.moveTo(s1[0], s1[1]); ctx.lineTo(s0[0], s0[1]); ctx.stroke(); ctx.setLineDash([]);
  }
  for (const [a, t] of beams) {
    toScreen(a.x, 1.4, a.z, s0); toScreen(t.x, 1.6, t.z, s1);
    ctx.strokeStyle = SG + '0.95)'; ctx.beginPath(); ctx.moveTo(s0[0], s0[1]);
    for (let k = 1; k < 8; k++) { const f = k / 8; ctx.lineTo(lerp(s0[0], s1[0], f) + Rr(-4, 4) * DPR, lerp(s0[1], s1[1], f) + Rr(-4, 4) * DPR); }
    ctx.lineTo(s1[0], s1[1]); ctx.stroke();
    bracket(s1[0], s1[1], 18 * DPR, 18 * DPR, 4, SG + '0.95)');
  }
  for (const p of people) {
    if (p.dead || p.inCar) continue;
    const gy = p.elev || groundY(p.x, p.z);
    if (p.fac === 'follower') { toScreen(p.x, gy + 2.2, p.z, s0); ctx.strokeStyle = PH + '0.8)'; ctx.beginPath(); ctx.moveTo(s0[0] - 3 * DPR, s0[1] - 2 * DPR); ctx.lineTo(s0[0], s0[1] + 1 * DPR); ctx.lineTo(s0[0] + 3 * DPR, s0[1] - 2 * DPR); ctx.stroke(); continue; }
    if (p.fac !== 'corp' && p.fac !== 'law') continue;
    toScreen(p.x, gy + 2.3, p.z, s0);
    if (p.alerted) {
      ctx.font = (20 * DPR) + 'px "Jersey 10", monospace'; label('!', s0[0], s0[1] - 4 * DPR, SG + '0.95)'); ctx.font = '600 ' + (12 * DPR) + 'px "Chakra Petch", system-ui, sans-serif';
    } else if (p.sus > 0.04) {
      ctx.font = (20 * DPR) + 'px "Jersey 10", monospace'; label('?', s0[0], s0[1] - 4 * DPR, AM + (0.4 + 0.6 * p.sus) + ')'); ctx.font = '600 ' + (12 * DPR) + 'px "Chakra Petch", system-ui, sans-serif';
      const w = 12 * DPR; ctx.fillStyle = AM + '0.25)'; ctx.fillRect(s0[0] - w / 2, s0[1] + 5 * DPR, w, 2 * DPR); ctx.fillStyle = AM + '0.95)'; ctx.fillRect(s0[0] - w / 2, s0[1] + 5 * DPR, w * p.sus, 2 * DPR);
    }
    if (p.hp < p.maxHp && p !== target) { const w = 16 * DPR; ctx.fillStyle = SG + '0.25)'; ctx.fillRect(s0[0] - w / 2, s0[1] + 9 * DPR, w, 2 * DPR); ctx.fillStyle = SG + '0.9)'; ctx.fillRect(s0[0] - w / 2, s0[1] + 9 * DPR, w * p.hp / p.maxHp, 2 * DPR); }
  }
  for (const it of pickups) {
    toScreen(it.x, groundY(it.x, it.z) + 0.3, it.z, s0);
    if (s0[0] < 0 || s0[1] < 0 || s0[0] > SW || s0[1] > SH) continue;
    const nw = it.id === 'case' || !SAVE.avail.includes(it.id), col = (nw ? AM : PH) + '0.85)';
    label(it.id === 'case' ? 'DATA CASE' : WEAPONS[it.id].name + (nw ? ' // NEW' : ''), s0[0], s0[1] - 12 * DPR, col);
  }
  for (const a of agents) {
    if (a.dead) continue;
    const ax = a.inCar ? a.inCar.x : a.x, az = a.inCar ? a.inCar.z : a.z, gy = a.elev || groundY(ax, az);
    toScreen(ax, gy, az, s0); toScreen(ax, gy + 2.1 * a.scale, az, s1);
    const h = Math.abs(s0[1] - s1[1]), cx = s0[0], cy = (s0[1] + s1[1]) / 2;
    const sel = selected.has(a);
    if (sel) bracket(cx, cy, h * 0.75 + 6 * DPR, h + 6 * DPR, 4, PH + '0.95)');
    const segs = 10, sw = 2 * DPR, gap = 1 * DPR, tot = segs * sw + (segs - 1) * gap, fill = Math.ceil(a.hp / a.maxHp * segs);
    for (let i = 0; i < segs; i++) { ctx.fillStyle = i < fill ? (a.hp / a.maxHp < 0.3 ? SG + '0.95)' : PH + (sel ? '0.95)' : '0.55)')) : 'rgba(134,250,221,0.12)'; ctx.fillRect(Math.round(cx - tot / 2 + i * (sw + gap)), Math.round(s1[1] - 7 * DPR), sw, 3 * DPR); }
    if (a.reloadT > 0) { const w = WEAPONS[a.slots[a.cur]]; ctx.fillStyle = AM + '0.9)'; ctx.fillRect(Math.round(cx - tot / 2), Math.round(s1[1] - 3 * DPR), tot * (1 - a.reloadT / w.reload), 1 * DPR); }
    if (sel) label(String(a.idx + 1), cx, s1[1] - 15 * DPR, PH + '0.95)');
    if (a.link) label('UPLINK', cx, s0[1] + 9 * DPR, PH + '0.9)');
    else if (a.jackTo && a.linkT > 0) label('CONNECTING ' + Math.round(a.linkT / 3 * 100) + '%', cx, s0[1] + 9 * DPR, PH + '0.9)');
    if (a.ftarget && !a.ftarget.dead && !a.ftarget.wreck) {
      const t = a.ftarget; toScreen(t.x, 1, t.z, s0);
      ctx.save(); ctx.translate(s0[0], s0[1]); ctx.rotate(time * 2); ctx.strokeStyle = SG + '0.9)'; ctx.strokeRect(-6 * DPR, -6 * DPR, 12 * DPR, 12 * DPR); ctx.restore();
    }
  }
  for (const m of moveMarks) {
    const f = m.t / 0.7;
    if (m.ent) { toScreen(m.ent.x, 1, m.ent.z, s0); } else toScreen(m.x, groundY(m.x, m.z), m.z, s0);
    const r = (6 + 14 * f) * DPR;
    ctx.strokeStyle = (m.c === 's' ? SG : PH) + f.toFixed(2) + ')';
    ctx.beginPath(); ctx.moveTo(s0[0], s0[1] - r); ctx.lineTo(s0[0] + r, s0[1]); ctx.lineTo(s0[0], s0[1] + r); ctx.lineTo(s0[0] - r, s0[1]); ctx.closePath(); ctx.stroke();
  }
  const edge = (x, y, col, txt) => {
    const mm = 40 * DPR, cx = SW / 2, cy = SH / 2;
    if (x > mm && x < SW - mm && y > mm && y < SH - mm) return false;
    const dx = x - cx, dy = y - cy, k = Math.min((SW / 2 - mm) / Math.abs(dx || 1), (SH / 2 - mm) / Math.abs(dy || 1));
    const ex = cx + dx * k, ey = cy + dy * k, a = Math.atan2(dy, dx);
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(a); ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(-8 * DPR, -6 * DPR); ctx.lineTo(4 * DPR, 0); ctx.lineTo(-8 * DPR, 6 * DPR); ctx.stroke(); ctx.restore();
    label(txt, ex - Math.cos(a) * 26 * DPR, ey - Math.sin(a) * 14 * DPR, col);
    return true;
  };
  const sc = squadCenter(), k = MS.objs[0];
  const tp = targetPos();
  if (k.st === 'open' && tp && !(target.gone)) {
    const ty = target.inCar ? 1 : (target.elev || 0) + 1;
    toScreen(tp[0], ty, tp[1], s0); const d = Math.round(Math.hypot(tp[0] - sc[0], tp[1] - sc[1]));
    const nm = MS.def.id === 'courier' ? (pickups.some((p) => p.id === 'case') ? 'DATA CASE' : MS.courierOut ? 'COURIER' : 'COURIER VAN') : MS.def.id === 'halden' ? 'HALDEN' : MS.def.spotLabel ? (target && target.inCar && target.inCar.model === 'vtol' ? MS.def.spotLabel + ' // IN VTOL' : MS.def.spotLabel) : WORLD.kind === 'city' ? 'VARGA' : 'RUSK';
    if (!edge(s0[0], s0[1], SG + '0.95)', 'TGT ' + d + 'M')) {
      const big = (!!target.model && !MS.courierOut && !MS.caseDropped && !(MS.vargaP && !MS.vargaP.inCar)) || target.inCar;
      bracket(s0[0], s0[1], (big ? 46 : 26) * DPR, (big ? 30 : 34) * DPR, 6, SG + '0.95)'); label('TGT // ' + nm + (target.armorOff > 0 ? ' // ARMOUR DOWN ' + Math.ceil(target.armorOff) + 'S' : '') + '  ' + d + 'M', s0[0], s0[1] - 24 * DPR, SG + '0.95)');
      const w = 40 * DPR, hp = target.hp / target.maxHp; ctx.fillStyle = SG + '0.25)'; ctx.fillRect(s0[0] - w / 2, s0[1] + 20 * DPR, w, 2 * DPR); ctx.fillStyle = SG + '0.95)'; ctx.fillRect(s0[0] - w / 2, s0[1] + 20 * DPR, w * hp, 2 * DPR);
    }
  } else if (k.st !== 'open' && state === 'play') {
    const [px, pz] = extractPos(); toScreen(px, 0.3, pz, s0);
    const d = Math.round(Math.hypot(px - sc[0], pz - sc[1]));
    if (!edge(s0[0], s0[1], PH + '0.95)', 'EXTRACT ' + d + 'M')) {
      if (WORLD.kind === 'city') {
        ctx.strokeStyle = PH + '0.9)'; ctx.beginPath();
        for (const [dx, dz] of [[-5, -5], [5, -5], [5, 5], [-5, 5]]) { toScreen(px + dx, 0.3, pz + dz, s1); ctx.lineTo(s1[0], s1[1]); }
        ctx.closePath(); ctx.stroke();
      } else groundRing(px, pz, 6.5, PH + '0.8)', [6 * DPR, 4 * DPR]);
      label(WORLD.kind === 'city' ? 'EXTRACT' : 'EXTRACT // VAN', s0[0], s0[1] - 30 * DPR, PH + '0.95)');
    }
  }
  if (hackT > 0.05 && hover) {
    toScreen(hover.x, hover.y, hover.z, s0);
    bracket(s0[0], s0[1], 30 * DPR, 30 * DPR, 6, 'rgba(255,255,255,' + hackT + ')');
    label(hover.uplink ? hover.uplink.label : hover.label, s0[0] + 22 * DPR, s0[1] - 10 * DPR, 'rgba(255,255,255,' + hackT + ')', 'left');
  }
  if (holdFire) {
    const mx = Math.round(mouse[0]) + 0.5, my = Math.round(mouse[1]) + 0.5, r = 9 * DPR;
    ctx.strokeStyle = SG + '0.95)'; ctx.beginPath();
    ctx.moveTo(mx - r * 1.8, my); ctx.lineTo(mx - r * 0.6, my); ctx.moveTo(mx + r * 0.6, my); ctx.lineTo(mx + r * 1.8, my);
    ctx.moveTo(mx, my - r * 1.8); ctx.lineTo(mx, my - r * 0.6); ctx.moveTo(mx, my + r * 0.6); ctx.lineTo(mx, my + r * 1.8); ctx.stroke();
    ctx.strokeRect(mx - r, my - r, r * 2, r * 2);
    if (aimLock && !aimLock.dead && !aimLock.wreck) { const s1 = [0, 0, 0]; toScreen(aimLock.x, (aimLock.elev || groundY(aimLock.x, aimLock.z)) + 1, aimLock.z, s1); bracket(s1[0], s1[1], 22 * DPR, 30 * DPR, 6, SG + '0.95)'); }
  }
  if (ptr && ptr.drag && !ptr.touch && ptr.b === 0 && !hackOn) {
    ctx.strokeStyle = PH + '0.9)'; ctx.setLineDash([4 * DPR, 3 * DPR]);
    ctx.strokeRect(Math.min(ptr.x0, ptr.x) + 0.5, Math.min(ptr.y0, ptr.y) + 0.5, Math.abs(ptr.x - ptr.x0), Math.abs(ptr.y - ptr.y0)); ctx.setLineDash([]);
  }
}
