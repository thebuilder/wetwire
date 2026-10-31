import * as THREE from 'three';
import { $, BLUR_FS, BRIGHT_FS, CFG, COMP_FS, COPY_FS, FINAL_FS, PAL, QUAD_VS, REDUCED, Rr, TAU, U, ZOOMS, clamp, glCanvas, hex3, ov, renderer } from './core';
import { GW, cellOk, walk } from './world_head';
import { AIR, RN, edgeOf } from './layout';
import { HK, vecScene } from './world_load';

export const VN_MAX = 600;
export const vnGeo = new THREE.BufferGeometry();
export const vnPos = new Float32Array(VN_MAX * 3), vnCol = new Float32Array(VN_MAX * 3), vnSize = new Float32Array(VN_MAX), vnShape = new Float32Array(VN_MAX);
vnGeo.setAttribute('position', new THREE.BufferAttribute(vnPos, 3).setUsage(THREE.DynamicDrawUsage));
vnGeo.setAttribute('aCol', new THREE.BufferAttribute(vnCol, 3).setUsage(THREE.DynamicDrawUsage));
vnGeo.setAttribute('aSize', new THREE.BufferAttribute(vnSize, 1).setUsage(THREE.DynamicDrawUsage));
vnGeo.setAttribute('aShape', new THREE.BufferAttribute(vnShape, 1).setUsage(THREE.DynamicDrawUsage));
const vnMat = new THREE.ShaderMaterial({ uniforms: { uHack: HK, uDpr: { value: 1 } },
  vertexShader: 'attribute vec3 aCol; attribute float aSize; attribute float aShape; uniform float uDpr; varying vec3 vC; varying float vS; void main(){ vC = aCol; vS = aShape; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_PointSize = aSize*uDpr; }',
  fragmentShader: 'uniform float uHack; varying vec3 vC; varying float vS; void main(){ vec2 q = abs(gl_PointCoord - 0.5); float a = 0.; if (vS < 0.5) { float d = q.x + q.y; a = max(step(0.36, d)*step(d, 0.5), step(d, 0.12)); } else { float d = max(q.x, q.y); a = vS < 1.5 ? step(0.38, d)*step(d, 0.5) : step(d, 0.5); } if (a < 0.5) discard; gl_FragColor = vec4(vC, uHack); }',
  transparent: true, depthWrite: false, depthTest: false });
const vnPoints = new THREE.Points(vnGeo, vnMat); vnPoints.renderOrder = 10; vnPoints.frustumCulled = false; vecScene.add(vnPoints);

/* ================================================================ render targets and passes */
const quadScene = new THREE.Scene(), quadCam = new THREE.Camera();
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false; quadScene.add(quad);
const qm = (fs, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VS, fragmentShader: fs, depthTest: false, depthWrite: false });
export const M_BR = qm(BRIGHT_FS, { tC: { value: null }, uTh: { value: 1.0 } });
export const M_BLUR = qm(BLUR_FS, { tI: { value: null }, uDir: { value: new THREE.Vector2() } });
export const M_COPY = qm(COPY_FS, { tI: { value: null } });
const palVec = Array.from({ length: 48 }, (_, i) => { const c = hex3(PAL[Math.min(i, PAL.length - 1)]); return new THREE.Vector3(c[0], c[1], c[2]); });
export const M_COMP = qm(COMP_FS, {
  tC: { value: null }, tN: { value: null }, tD: { value: null }, uRes: { value: new THREE.Vector2() }, uFr: { value: new THREE.Vector4() },
  uNear: { value: 1 }, uFar: { value: 600 }, uVI: { value: new THREE.Matrix4() }, uTime: U.uTime, uOut: { value: 1 }, uRefl: { value: 0.85 },
  uDith: { value: 0.55 }, uQ: { value: 1 }, uLevels: { value: 6 }, uHack: { value: 0 }, uExp: { value: 1 }, uPal: { value: palVec }, uPalN: { value: PAL.length },
  uFog: U.uFog, uUpV: { value: new THREE.Vector3() },
});
export const M_FIN = qm(FINAL_FS, { tP: { value: null }, tB1: { value: null }, tB2: { value: null }, uLow: { value: new THREE.Vector2() }, uS: { value: 3 }, uOff: { value: new THREE.Vector2() },
  uM: { value: 2 }, uScreen: { value: new THREE.Vector2() }, uBloom: { value: 0.85 }, uCrt: { value: 0.5 }, uFlash: { value: 0 }, uHack: { value: 0 } });
export function pass(mat, rt) { quad.material = mat; renderer.setRenderTarget(rt); renderer.render(quadScene, quadCam); }

export const MG = 2;
export let SW = 0, SH = 0, DPR = 1, S = 3, LW = 0, LH = 0, PPU = 10;
export const RT: any = {};
function mkRT(w, h, filter, type?) { return new THREE.WebGLRenderTarget(w, h, { minFilter: filter, magFilter: filter, type: type || THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: false }); }
export function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(DPR);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  SW = glCanvas.width; SH = glCanvas.height;
  ov.width = SW; ov.height = SH;
  S = CFG.scale || Math.max(2, Math.round(SH / 330));
  LW = Math.ceil(SW / S) + MG * 2; LH = Math.ceil(SH / S) + MG * 2;
  let z = CFG.zoom; PPU = ZOOMS[z];
  while (z > 0 && (SW / S) / PPU < 34) { z--; PPU = ZOOMS[z]; }
  for (const k in RT) RT[k].dispose();
  const mrt = new THREE.WebGLMultipleRenderTargets(LW, LH, 2);
  for (const t of mrt.texture) { t.minFilter = t.magFilter = THREE.NearestFilter; t.type = THREE.HalfFloatType; t.generateMipmaps = false; }
  const mrtDepth = (mrt as any).depthTexture = new THREE.DepthTexture(LW, LH); mrtDepth.type = THREE.UnsignedIntType;
  mrtDepth.minFilter = mrtDepth.magFilter = THREE.NearestFilter;
  RT.scene = mrt;
  RT.pix = mkRT(LW, LH, THREE.NearestFilter);
  const bw = Math.max(2, LW >> 1), bh = Math.max(2, LH >> 1);
  RT.b1 = mkRT(bw, bh, THREE.LinearFilter, THREE.HalfFloatType); RT.b2 = mkRT(bw, bh, THREE.LinearFilter, THREE.HalfFloatType);
  RT.b3 = mkRT(Math.max(2, bw >> 1), Math.max(2, bh >> 1), THREE.LinearFilter, THREE.HalfFloatType); RT.b4 = mkRT(Math.max(2, bw >> 1), Math.max(2, bh >> 1), THREE.LinearFilter, THREE.HalfFloatType);
  vnMat.uniforms.uDpr.value = DPR;
  U.uPPU.value = PPU;
  labSync();
}

/* ================================================================ cameras */
export const vecCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 600);
export const snapCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 600);
export const camT = new THREE.Vector3(41, 0, 182);
export let camYaw = Math.PI / 4, camYawTo = Math.PI / 4;
export function setCamYaw(v: typeof camYaw) { return camYaw = v; }
export function setCamYawTo(v: typeof camYawTo) { return camYawTo = v; }
export const PITCH = Math.PI / 6, CAMD = 230;
export const OFF = new THREE.Vector2();
export const _v = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3();
export let shake = 0;
export function setShake(v: typeof shake) { return shake = v; }
export function computeCams() {
  const sx = shake > 0 && !REDUCED ? Rr(-1, 1) * shake * 0.6 : 0, sz = shake > 0 && !REDUCED ? Rr(-1, 1) * shake * 0.6 : 0;
  _v.set(Math.sin(camYaw) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(camYaw) * Math.cos(PITCH)).multiplyScalar(CAMD);
  const tx = camT.x + sx, tz = camT.z + sz;
  vecCam.position.set(tx + _v.x, _v.y, tz + _v.z); vecCam.up.set(0, 1, 0); vecCam.lookAt(tx, 0, tz);
  const hw = SW / S / 2 / PPU, hh = SH / S / 2 / PPU;
  vecCam.left = -hw; vecCam.right = hw; vecCam.bottom = -hh; vecCam.top = hh; vecCam.near = 1; vecCam.far = 600;
  vecCam.updateProjectionMatrix(); vecCam.updateMatrixWorld();
  _r.set(1, 0, 0).applyQuaternion(vecCam.quaternion); _u.set(0, 1, 0).applyQuaternion(vecCam.quaternion);
  const tr = vecCam.position.dot(_r), tu = vecCam.position.dot(_u);
  const dr = Math.round(tr * PPU) / PPU - tr, du = Math.round(tu * PPU) / PPU - tu;
  snapCam.quaternion.copy(vecCam.quaternion);
  snapCam.position.copy(vecCam.position).addScaledVector(_r, dr).addScaledVector(_u, du);
  snapCam.left = -(SW / S / 2 + MG) / PPU; snapCam.right = snapCam.left + LW / PPU;
  snapCam.bottom = -(SH / S / 2 + MG) / PPU; snapCam.top = snapCam.bottom + LH / PPU;
  snapCam.near = 1; snapCam.far = 600; snapCam.updateProjectionMatrix(); snapCam.updateMatrixWorld();
  OFF.set(-dr * PPU, -du * PPU);
  _f.set(0, 0, -1).applyQuaternion(vecCam.quaternion);
  U.uViewDir.value.copy(_f);
  U.uFogNear.value = CAMD - 8;
  U.uCenter.value.set(camT.x, 0, camT.z);
}
export function toScreen(x, y, z, out) {
  _v.set(x, y, z).project(vecCam);
  out[0] = (_v.x * 0.5 + 0.5) * SW; out[1] = (1 - (_v.y * 0.5 + 0.5)) * SH; out[2] = _v.z;
  return out;
}
export function groundAt(px, py, y?) {
  const nx = px / SW * 2 - 1, ny = 1 - py / SH * 2;
  const o = new THREE.Vector3(nx, ny, -1).unproject(vecCam);
  const t = ((y || 0) - o.y) / _f.y;
  return [o.x + _f.x * t, o.z + _f.z * t];
}

/* ================================================================ pathfinding */
const gS = new Float32Array(GW * GW), came = new Int32Array(GW * GW), stampO = new Uint32Array(GW * GW), stampC = new Uint32Array(GW * GW);
let stamp = 0;
const hI = new Int32Array(GW * GW * 4), hF = new Float32Array(GW * GW * 4); let hn = 0;
function hpush(i, f) { let k = hn++; while (k > 0) { const p = (k - 1) >> 1; if (hF[p] <= f) break; hI[k] = hI[p]; hF[k] = hF[p]; k = p; } hI[k] = i; hF[k] = f; }
function hpop() { const top = hI[0]; const li = hI[--hn], lf = hF[hn]; let k = 0; for (;;) { let c = k * 2 + 1; if (c >= hn) break; if (c + 1 < hn && hF[c + 1] < hF[c]) c++; if (hF[c] >= lf) break; hI[k] = hI[c]; hF[k] = hF[c]; k = c; } hI[k] = li; hF[k] = lf; return top; }
export function nearestOpen(x, z, rad) {
  if (cellOk(x, z)) return [x, z];
  for (let r = 1; r <= rad; r++) for (let a = 0; a < 16; a++) { const xx = x + Math.cos(a / 16 * TAU) * r, zz = z + Math.sin(a / 16 * TAU) * r; if (cellOk(xx, zz)) return [Math.floor(xx) + 0.5, Math.floor(zz) + 0.5]; }
  return null;
}
function losWalk(ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.35);
  for (let i = 1; i <= n; i++) { const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n; if (!cellOk(x + 0.22, z + 0.22) || !cellOk(x - 0.22, z - 0.22) || !cellOk(x + 0.22, z - 0.22) || !cellOk(x - 0.22, z + 0.22)) return false; }
  return true;
}
export function findPath(sx, sz, tx, tz) {
  const s0 = nearestOpen(sx, sz, 4), t0 = nearestOpen(tx, tz, 8);
  if (!s0 || !t0) return null;
  if (losWalk(sx, sz, t0[0], t0[1])) return [{ x: t0[0], z: t0[1] }];
  const si = Math.floor(s0[1]) * GW + Math.floor(s0[0]), ti = Math.floor(t0[1]) * GW + Math.floor(t0[0]);
  const tcx = ti % GW, tcz = (ti / GW) | 0;
  stamp++; hn = 0; gS[si] = 0; stampO[si] = stamp; came[si] = -1; hpush(si, 0);
  let found = false, exp = 0;
  while (hn > 0 && exp < 60000) {
    const c = hpop(); if (stampC[c] === stamp) continue; stampC[c] = stamp; exp++;
    if (c === ti) { found = true; break; }
    const cx = c % GW, cz = (c / GW) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= GW || nz >= GW) continue;
      const ni = nz * GW + nx; if (!walk[ni] || stampC[ni] === stamp) continue;
      if (dx && dz && (!walk[cz * GW + nx] || !walk[nz * GW + cx])) continue;
      const g = gS[c] + (dx && dz ? 1.4142 : 1);
      if (stampO[ni] !== stamp || g < gS[ni]) {
        stampO[ni] = stamp; gS[ni] = g; came[ni] = c;
        const ax = Math.abs(nx - tcx), az = Math.abs(nz - tcz);
        hpush(ni, g + (ax + az) + (1.4142 - 2) * Math.min(ax, az));
      }
    }
  }
  if (!found) return null;
  const pts = []; let c = ti;
  while (c !== -1) { pts.push({ x: (c % GW) + 0.5, z: ((c / GW) | 0) + 0.5 }); c = came[c]; }
  pts.reverse(); pts[pts.length - 1] = { x: t0[0], z: t0[1] };
  const out = []; let ax = sx, az = sz, i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !losWalk(ax, az, pts[j].x, pts[j].z)) j--;
    out.push(pts[j]); ax = pts[j].x; az = pts[j].z; i = j;
  }
  if (!out.length) out.push(pts[pts.length - 1]);
  return out;
}
/* shortest drive over the road graph (node ids); returns the nodes after "from", ending with "to" */
export function roadRoute(from, to) {
  if (!RN || from === to || from == null || to == null) return [];
  const n = RN.nodes.length, dist = new Float64Array(n).fill(1e9), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  dist[from] = 0;
  for (;;) {
    let u = -1, bd = 1e9; for (let i = 0; i < n; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
    if (u < 0 || u === to) break; done[u] = 1;
    for (const v of RN.nodes[u].adj) { const e = edgeOf(u, v), d = bd + e.len; if (d < dist[v]) { dist[v] = d; prev[v] = u; } }
  }
  const out = []; let c = to;
  while (c >= 0 && c !== from) { out.push(c); c = prev[c]; }
  return c === from ? out.reverse() : [];
}
export function routeLen(from, r) { let l = 0, a = from; for (const b of r) { l += Math.hypot(RN.nodes[b].x - RN.nodes[a].x, RN.nodes[b].z - RN.nodes[a].z); a = b; } return l; }
export function nearestNode(x, z) {
  if (!RN) return 0;
  let best = 0, bd = 1e9;
  RN.nodes.forEach((n, i) => { if (!n.adj.length) return; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = i; } });
  return best;
}
/* nearest point on a drivable edge */
export function nearestRoad(x, z) {
  let best = null, bd = 1e9;
  for (const e of RN.edges) {
    if (e.kind === 'alley' || e.kind === 'path' || AIR[e.kind]) continue;
    const A = RN.nodes[e.a], Bn = RN.nodes[e.b], dx = Bn.x - A.x, dz = Bn.z - A.z, t = clamp(((x - A.x) * dx + (z - A.z) * dz) / (e.len * e.len), 0, 1);
    const px = A.x + dx * t, pz = A.z + dz * t, d = Math.hypot(px - x, pz - z);
    if (d < bd) { bd = d; best = { e, t, x: px, z: pz }; }
  }
  return best;
}

/* ================================================================ audio */
export const AU = { ctx: null, master: null, music: null, sfx: null, buf: {}, on: false, cur: null, src: null, gain: null, pending: null, loaded: false, act: {} };
export const SONGS = {
  theme: { g: 1.2, ls: 50, le: 110 }, infiltration: { g: 1.35, ls: 38.4, le: 76.8 },
  danger: { g: 1.0, ls: 25.6, le: 51.2 }, complete: { g: 1.15 }, failed: { g: 1.8 },
};
const SFXN = ['ack', 'siren', 'minigun', 'pistol', 'laser', 'rocket', 'explosion', 'mindjack', 'hack', 'ui', 'alarm', 'zap', 'impact', 'door', 'scream', 'flame', 'ignite'];
export function audioInit() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
  AU.ctx = new C();
  AU.master = AU.ctx.createGain(); AU.master.gain.value = 0.9; AU.master.connect(AU.ctx.destination);
  AU.music = AU.ctx.createGain(); AU.music.gain.value = 0.5; AU.music.connect(AU.master);
  AU.sfx = AU.ctx.createGain(); AU.sfx.gain.value = 0.75; AU.sfx.connect(AU.master);
  const names = Object.keys(SONGS).concat(SFXN);
  Promise.all(names.map((n) => fetch('audio/' + n + '.ogg').then((r) => { if (!r.ok) throw new Error(n); return r.arrayBuffer(); })
    .then((ab) => AU.ctx.decodeAudioData(ab)).then((b) => { AU.buf[n] = b; if (AU.pending === n) { AU.cur = null; playMusic(n); } }).catch(() => {})))
    .then(() => { AU.loaded = true; });
}
export function setSound(on) {
  AU.on = on;
  if (on) audioInit();
  if (AU.master) AU.master.gain.setTargetAtTime(on ? 0.9 : 0, AU.ctx.currentTime, 0.05);
  $('#sndBtn').textContent = on ? 'SOUND: ON' : 'SOUND: OFF'; $('#sndBtn').classList.toggle('on', on);
  $('#bSnd').classList.toggle('on', !on);
}
export function playMusic(name, fade?) {
  if (!AU.ctx || AU.cur === name) return;
  fade = fade == null ? 1.2 : fade;
  const t = AU.ctx.currentTime;
  if (AU.src) { const g = AU.gain, s = AU.src; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade); s.stop(t + fade + 0.05); AU.src = null; }
  AU.cur = name;
  const b = AU.buf[name]; if (!b) { AU.pending = name; return; }
  AU.pending = null;
  const s = AU.ctx.createBufferSource(); s.buffer = b;
  const sg = SONGS[name];
  if (sg.ls != null) { s.loop = true; s.loopStart = sg.ls; s.loopEnd = sg.le; }
  const g = AU.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(sg.g, t + Math.max(0.05, fade * 0.6));
  s.connect(g); g.connect(AU.music); s.start(t);
  AU.src = s; AU.gain = g;
}
export function sfx(name, x, z, vol, rate?) {
  if (!AU.ctx || !AU.on) return; const b = AU.buf[name]; if (!b) return;
  let att = 1;
  if (x != null) { const d = Math.hypot(x - camT.x, z - camT.z); att = clamp(1 - (d - 12) / 55, 0, 1); }
  if (att < 0.03) return;
  if ((AU.act[name] || 0) > 5) return;
  if (name === 'ui') {
    const t = AU.ctx.currentTime, o = AU.ctx.createOscillator(), g = AU.ctx.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(520 * (rate || 1), t); o.frequency.exponentialRampToValueAtTime(260 * (rate || 1), t + 0.03);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06 * (vol == null ? 1 : vol), t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    o.connect(g); g.connect(AU.sfx); o.start(t); o.stop(t + 0.04); return;
  }
  const s = AU.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = (rate || 1) * (name === 'siren' ? 1 : 0.94 + Math.random() * 0.12);
  const g = AU.ctx.createGain(); g.gain.value = (vol == null ? 1 : vol) * att;
  s.connect(g); g.connect(AU.sfx); s.start();
  AU.act[name] = (AU.act[name] || 0) + 1; s.onended = () => { AU.act[name]--; };
}
function labSync() { $('#vScale').textContent = CFG.scale ? CFG.scale + 'x' : 'auto ' + S + 'x'; $('#vZoom').textContent = PPU + ' px/m'; }
