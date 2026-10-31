import * as THREE from 'three';
import { Geo, K, MAT, RAIN_FS, RAIN_VS, SPL_FS, SPL_VS, U, fxLMat, fxPMat } from './core';
import { AB } from './world_head';

export const scene = new THREE.Scene();
/* ================================================================ dynamic models */
function personGeo() {
  const g = new Geo(); const C = [1, 1, 1], PANTS = [0.07, 0.07, 0.09], BOOT = [0.035, 0.035, 0.04], HAIR = [0.05, 0.04, 0.04], GUN = [0.11, 0.11, 0.12];
  const A = (z, part) => [K.BASIC, 0, z, part];
  for (const [sx, part] of [[-0.1, 2], [0.1, 3]]) {
    g.prism(sx, 0, 0.1, 0.88, 0.11, 0.12, 0.17, 0.17, 6, PANTS, A(0, part));
    g.prism(sx, 0.03, 0, 0.13, 0.15, 0.25, 0.13, 0.2, 4, BOOT, A(0, part));
  }
  g.prism(0, 0, 0.8, 0.97, 0.33, 0.2, 0.35, 0.21, 6, C, A(1, 0));
  g.prism(0, 0, 0.95, 1.44, 0.32, 0.19, 0.44, 0.24, 6, C, A(1, 0));
  g.prism(0, 0, 1.42, 1.53, 0.46, 0.24, 0.3, 0.19, 6, C, A(1, 0));
  g.prism(0, 0, 1.5, 1.6, 0.09, 0.09, 0.09, 0.09, 6, C, A(2, 1));
  g.prism(0, 0.01, 1.58, 1.82, 0.19, 0.21, 0.2, 0.21, 8, C, A(2, 1));
  g.prism(0, -0.015, 1.77, 1.9, 0.22, 0.23, 0.15, 0.16, 8, HAIR, A(0, 1));
  for (const [sx, part] of [[-0.29, 4], [0.29, 5]]) {
    g.prism(sx, 0, 1.12, 1.5, 0.1, 0.11, 0.13, 0.13, 6, C, A(1, part));
    g.prism(sx * 1.03, 0.01, 0.9, 1.14, 0.08, 0.09, 0.1, 0.11, 6, C, A(1, part));
    g.prism(sx * 1.03, 0.02, 0.8, 0.9, 0.07, 0.08, 0.08, 0.09, 4, C, A(2, part));
  }
  g.box(0.26, 0.5, -0.05, 0.34, 0.86, 0.08, GUN, A(0, 6));
  g.box(0.28, 0.3, -0.02, 0.32, 0.5, 0.02, GUN, A(0, 6));
  g.box(0.27, 0.62, 0.08, 0.33, 0.74, 0.16, GUN, A(0, 6));
  g.prism(-0.15, 0.05, 1.98, 2.2, 1.12, 1.12, 0.06, 0.06, 8, C, A(0, 7));
  g.box(-0.32, 1.0, 0.0, -0.28, 2.02, 0.04, [0.2, 0.2, 0.2], A(0, 8));
  g.prism(0, -0.01, 0.34, 0.98, 0.58, 0.4, 0.38, 0.25, 6, C, A(1, 9));
  g.prism(0, -0.02, 1.4, 1.53, 0.56, 0.27, 0.5, 0.25, 6, C, A(1, 9));
  g.prism(0, -0.03, 1.5, 1.66, 0.3, 0.25, 0.27, 0.22, 6, C, A(1, 9));
  g.box(-0.11, 1.68, 0.1, 0.11, 1.73, 0.135, C, A(0, 10));
  return g.geometry();
}
const PAINT = [K.BASIC, 0, 1, 0], GLOW = [K.BASIC, 0, 2, 0], POL = [K.BASIC, 0, 3, 0], GLS = [K.GLASS, 0, 0, 0];
const HEAD = [K.LAMP, 3.4, 0, 0], TAIL = [K.LAMP, 2.6, 0, 0];
function carGeo(type) {
  const g = new Geo(), W = [1, 1, 1];
  if (type === 'van') {
    g.box(-1.0, 0.35, -2.3, 1.0, 1.9, 2.3, W, PAINT);
    g.box(-0.92, 1.1, 1.6, 0.92, 1.75, 2.34, [0.1, 0.12, 0.16], GLS);
    g.box(-0.95, 0.55, 2.3, -0.55, 0.72, 2.36, [1, 0.95, 0.85], HEAD); g.box(0.55, 0.55, 2.3, 0.95, 0.72, 2.36, [1, 0.95, 0.85], HEAD);
    g.box(-0.95, 0.6, -2.36, -0.6, 0.85, -2.3, [1, 0.1, 0.1], TAIL); g.box(0.6, 0.6, -2.36, 0.95, 0.85, -2.3, [1, 0.1, 0.1], TAIL);
    g.box(-0.8, 0.2, -1.8, 0.8, 0.32, 1.8, W, GLOW);
    g.box(-1.02, 1.0, -2.0, -1.0, 1.15, 1.2, W, GLOW); g.box(1.0, 1.0, -2.0, 1.02, 1.15, 1.2, W, GLOW);
    return g.geometry();
  }
  if (type === 'jeep') {
    const D = [0.07, 0.07, 0.08];
    g.box(-0.95, 0.4, -1.9, 0.95, 0.95, 1.2, W, PAINT);
    g.box(-0.9, 0.4, 1.2, 0.9, 0.85, 2.05, W, PAINT);
    g.box(-0.85, 0.95, 1.05, 0.85, 1.55, 1.12, [0.1, 0.12, 0.16], GLS);
    g.box(-0.85, 0.95, -0.5, -0.75, 1.75, -0.4, D, AB); g.box(0.75, 0.95, -0.5, 0.85, 1.75, -0.4, D, AB); g.box(-0.85, 1.65, -0.5, 0.85, 1.75, -0.4, D, AB);
    g.box(-0.6, 0.95, -1.3, 0.6, 1.25, -0.9, [0.05, 0.05, 0.06], AB);
    g.box(-0.45, 0.55, -2.15, 0.45, 1.25, -1.9, D, AB);
    for (const [wx, wz] of [[-0.98, 1.3], [0.98, 1.3], [-0.98, -1.25], [0.98, -1.25]]) g.box(wx - 0.14, 0, wz - 0.36, wx + 0.14, 0.62, wz + 0.36, D, AB);
    g.box(-0.85, 0.6, 2.05, -0.5, 0.75, 2.1, [1, 0.95, 0.85], HEAD); g.box(0.5, 0.6, 2.05, 0.85, 0.75, 2.1, [1, 0.95, 0.85], HEAD);
    g.box(-0.95, 0.6, -1.95, -0.7, 0.75, -1.9, [1, 0.1, 0.1], TAIL); g.box(0.7, 0.6, -1.95, 0.95, 0.75, -1.9, [1, 0.1, 0.1], TAIL);
    g.box(-0.1, 1.75, -0.48, 0.1, 1.85, -0.42, W, GLOW);
    return g.geometry();
  }
  if (type === 'truck') {
    const D = [0.07, 0.07, 0.08];
    g.box(-1.15, 0.5, 1.6, 1.15, 2.3, 3.3, W, PAINT);
    g.box(-1.05, 1.5, 3.3, 1.05, 2.15, 3.36, [0.1, 0.12, 0.16], GLS);
    g.box(-1.2, 0.5, -3.4, 1.2, 1.0, 1.5, W, PAINT);
    g.box(-1.2, 1.0, -3.4, 1.2, 2.9, 1.4, [0.24, 0.24, 0.17], AB);
    for (let z = -3.0; z < 1.4; z += 1.1) g.box(-1.24, 1.0, z, 1.24, 3.0, z + 0.08, [0.18, 0.18, 0.13], AB);
    for (const wz of [2.5, -0.6, -2.4]) for (const wx of [-1.1, 1.1]) g.box(wx - 0.18, 0, wz - 0.45, wx + 0.18, 0.85, wz + 0.45, D, AB);
    g.box(-1.0, 0.75, 3.3, -0.6, 0.95, 3.38, [1, 0.95, 0.85], HEAD); g.box(0.6, 0.75, 3.3, 1.0, 0.95, 3.38, [1, 0.95, 0.85], HEAD);
    g.box(-1.1, 0.7, -3.46, -0.8, 0.9, -3.4, [1, 0.1, 0.1], TAIL); g.box(0.8, 0.7, -3.46, 1.1, 0.9, -3.4, [1, 0.1, 0.1], TAIL);
    g.box(-0.9, 2.3, 2.3, 0.9, 2.38, 2.6, W, GLOW);
    return g.geometry();
  }
  const L = type === 'limo' ? 3.1 : 2.1;
  g.box(-0.95, 0.35, -L, 0.95, 0.85, L, W, PAINT);
  g.box(-0.85, 0.85, -L * 0.52, 0.85, 1.32, L * 0.38, [0.1, 0.12, 0.16], GLS);
  g.box(-0.8, 1.32, -L * 0.48, 0.8, 1.38, L * 0.34, W, PAINT);
  g.box(-0.88, 0.5, L, -0.48, 0.66, L + 0.06, [1, 0.95, 0.85], HEAD); g.box(0.48, 0.5, L, 0.88, 0.66, L + 0.06, [1, 0.95, 0.85], HEAD);
  g.box(-0.92, 0.55, -L - 0.06, -0.42, 0.7, -L, [1, 0.08, 0.1], TAIL); g.box(0.42, 0.55, -L - 0.06, 0.92, 0.7, -L, [1, 0.08, 0.1], TAIL);
  g.box(-0.72, 0.18, -L + 0.4, 0.72, 0.3, L - 0.4, W, GLOW);
  if (type === 'police') { g.box(-0.6, 1.38, -0.25, 0.6, 1.55, 0.05, W, POL); }
  if (type === 'limo') { g.box(-0.97, 0.7, -L + 0.3, -0.95, 0.76, L - 0.3, [0.8, 0.8, 0.85], [K.LAMP, 0.6, 0, 0]); g.box(0.95, 0.7, -L + 0.3, 0.97, 0.76, L - 0.3, [0.8, 0.8, 0.85], [K.LAMP, 0.6, 0, 0]); }
  if (type === 'spinner') {
    g.box(-1.5, 0.6, -1.6, -0.95, 0.7, -0.6, W, PAINT); g.box(0.95, 0.6, -1.6, 1.5, 0.7, -0.6, W, PAINT);
    g.box(-1.5, 0.55, -1.65, -1.2, 0.75, -1.5, W, GLOW); g.box(1.2, 0.55, -1.65, 1.5, 0.75, -1.5, W, GLOW);
  }
  return g.geometry();
}
function trainGeo() {
  const g = new Geo();
  g.box(-1.25, 0, -5.4, 1.25, 2.6, 5.4, [0.55, 0.57, 0.6], AB);
  g.box(-1.27, 1.3, -4.8, 1.27, 1.9, 4.8, [0.3, 1, 0.85], [K.LAMP, 1.8, 0, 0]);
  g.box(-1.1, 2.6, -4, 1.1, 2.85, 4, [0.3, 0.32, 0.35], AB);
  g.box(-1.0, 0.6, 5.4, 1.0, 1.0, 5.5, [1, 0.95, 0.85], [K.LAMP, 3, 0, 0]);
  g.box(-1.0, 0.6, -5.5, 1.0, 1.0, -5.4, [1, 0.1, 0.1], [K.LAMP, 2.5, 0, 0]);
  return g.geometry();
}
function turretGeo() {
  const g = new Geo();
  g.box(-0.55, 0, -0.55, 0.55, 1.1, 0.55, [0.22, 0.22, 0.25], AB);
  g.box(-0.45, 1.1, -0.5, 0.45, 1.65, 0.5, [1, 1, 1], PAINT);
  g.box(-0.08, 1.28, 0.5, 0.08, 1.42, 1.5, [0.12, 0.12, 0.13], AB);
  g.box(-0.3, 1.38, 0.5, 0.3, 1.5, 0.54, [1, 1, 1], GLOW);
  // faction band round the head and a sensor eye: red while hostile, teal once hacked
  g.box(-0.47, 1.5, -0.52, 0.47, 1.58, 0.52, [1, 1, 1], GLOW);
  g.box(-0.16, 1.22, 0.5, 0.16, 1.36, 0.58, [1, 1, 1], GLOW);
  g.box(-0.04, 1.65, -0.04, 0.04, 2.3, 0.04, [0.12, 0.12, 0.13], AB); g.box(-0.09, 2.3, -0.09, 0.09, 2.42, 0.09, [1, 1, 1], GLOW);
  return g.geometry();
}
function decalGeo() {
  const g = new Geo(); g.quad([-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 0, -0.5], [-0.5, 0, -0.5], [0, 1, 0], [1, 1, 1], [K.DECAL, 0, 0, 0]);
  for (let i = 0; i < 6; i++) { g.a[i * 4 + 2] = g.p[i * 3]; g.a[i * 4 + 3] = g.p[i * 3 + 2]; }
  return g.geometry();
}
function itemGeo() {
  const g = new Geo(), D = [0.1, 0.1, 0.11];
  g.box(-0.42, 0.05, -0.1, 0.32, 0.2, 0.1, W1, PAINT);
  g.box(-0.16, -0.12, -0.05, -0.04, 0.05, 0.05, D, AB);
  g.box(0.32, 0.1, -0.035, 0.6, 0.16, 0.035, D, AB);
  g.box(-0.4, 0.2, -0.04, 0.2, 0.24, 0.04, [1, 1, 1], GLOW);
  return g.geometry();
}
const W1 = [1, 1, 1];

function instanced(geo, mat, max, attrs) {
  for (const [name, size] of attrs) { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * size), size); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); }
  const m = new THREE.InstancedMesh(geo, mat, max); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0; scene.add(m); return m;
}
export const PMAX = 340;
export const peopleMesh = instanced(personGeo(), MAT.people, PMAX, [['iColor', 3], ['iSkin', 3], ['iAnim', 4], ['iRim', 3], ['iMisc', 4]]);
export const CARM: any = {};
for (const t of ['sedan', 'van', 'police', 'limo', 'spinner', 'jeep', 'truck']) CARM[t] = instanced(carGeo(t), MAT.tinted, t === 'jeep' || t === 'truck' ? 24 : 48, [['iColor', 3], ['iAnim', 4]]);
function vtolGeo() {
  const g = new Geo(), W = [1, 1, 1];
  g.box(-1.3, 1.0, -4.2, 1.3, 3.0, 3.6, W, PAINT);
  g.box(-1.0, 2.2, 3.6, 1.0, 3.0, 5.4, [0.06, 0.09, 0.13], GLS); g.box(-1.0, 1.0, 3.6, 1.0, 2.2, 5.6, W, PAINT);
  g.box(-0.3, 3.0, -4.2, 0.3, 5.2, -2.4, W, PAINT); g.box(-2.4, 4.6, -4.2, 2.4, 4.9, -3.0, W, PAINT);
  g.box(-5.6, 2.4, -0.8, 5.6, 2.7, 1.4, W, PAINT);
  for (const x of [-5.2, 5.2]) for (const z of [-3.2, 3.0]) { g.prism(x, z, 2.0, 3.0, 2.4, 2.4, 2.4, 2.4, 10, [0.2, 0.21, 0.23], AB); g.prism(x, z, 2.2, 2.25, 2.2, 2.2, 2.2, 2.2, 10, [1, 1, 1], GLOW); }
  for (const x of [-5.2, 5.2]) g.box(x - 0.25, 2.4, -3.2, x + 0.25, 2.7, 3.0, [0.2, 0.21, 0.23], AB);
  for (const x of [-1.1, 1.1]) g.box(x - 0.1, 0, -3, x + 0.1, 1.0, 3, [0.15, 0.15, 0.16], AB);
  g.box(-1.32, 1.6, -3.6, -1.3, 1.9, 3.4, [1, 1, 1], GLOW); g.box(1.3, 1.6, -3.6, 1.32, 1.9, 3.4, [1, 1, 1], GLOW);
  return g.geometry();
}
CARM.vtol = instanced(vtolGeo(), MAT.tinted, 2, [['iColor', 3], ['iAnim', 4]]);
export const itemMesh = instanced(itemGeo(), MAT.tinted, 40, [['iColor', 3], ['iAnim', 4]]);
export const shadowMesh = instanced(decalGeo(), MAT.tinted, 24, [['iColor', 3], ['iAnim', 4]]);
export const turretMesh = instanced(turretGeo(), MAT.tinted, 12, [['iColor', 3], ['iAnim', 4]]);
/* fuel drums and tanks that blow up when shot */
function barrelGeo(big) {
  const g = new Geo(), r = big ? 3.4 : 0.42, h = big ? 6.5 : 1.05;
  g.prism(0, 0, 0, h, r * 2, r * 2, r * 2, r * 2, big ? 14 : 10, [1, 1, 1], PAINT);
  for (const y of big ? [1.6, 4.4] : [0.3, 0.75]) g.prism(0, 0, y, y + (big ? 0.18 : 0.07), r * 2.06, r * 2.06, r * 2.06, r * 2.06, big ? 14 : 10, [0.25, 0.25, 0.27], AB);
  g.prism(0, 0, h, h + 0.04, r * 1.9, r * 1.9, r * 1.6, r * 1.6, big ? 14 : 10, [0.3, 0.3, 0.32], AB);
  g.box(-r * 0.5, h * 0.42, r * 0.97, r * 0.5, h * 0.58, r * 1.02, [1, 1, 1], GLOW);
  return g.geometry();
}
export const barrelMesh = instanced(barrelGeo(false), MAT.tinted, 96, [['iColor', 3], ['iAnim', 4]]);
export const tankMesh = instanced(barrelGeo(true), MAT.tinted, 24, [['iColor', 3], ['iAnim', 4]]);
export const decalMesh = instanced(decalGeo(), MAT.tinted, 96, [['iColor', 3], ['iAnim', 4]]);
export const trainCars = [];
{ const tg = trainGeo(); for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(tg, MAT.dyn); m.frustumCulled = false; scene.add(m); trainCars.push(m); } }

/* fx: particles, tracers, rain. Rain draws in its own pass after the reflections so puddles never mirror it */
export const fxScene = new THREE.Scene();
export const PART_MAX = 3000;
export const partGeo = new THREE.BufferGeometry();
export const partPos = new Float32Array(PART_MAX * 3), partCol = new Float32Array(PART_MAX * 3), partSize = new Float32Array(PART_MAX);
partGeo.setAttribute('position', new THREE.BufferAttribute(partPos, 3).setUsage(THREE.DynamicDrawUsage));
partGeo.setAttribute('aCol', new THREE.BufferAttribute(partCol, 3).setUsage(THREE.DynamicDrawUsage));
partGeo.setAttribute('aSize', new THREE.BufferAttribute(partSize, 1).setUsage(THREE.DynamicDrawUsage));
const partPoints = new THREE.Points(partGeo, fxPMat); partPoints.frustumCulled = false; scene.add(partPoints);
export const parts = [];
export function spawnP(x, y, z, vx, vy, vz, c, size, life, grav?, drag?) {
  if (parts.length >= PART_MAX) return;
  parts.push({ x, y, z, vx, vy, vz, c, size, life, max: life, grav: grav || 0, drag: drag || 0 });
}
export const TR_MAX = 600;
export const trGeo = new THREE.BufferGeometry();
export const trPos = new Float32Array(TR_MAX * 6), trCol = new Float32Array(TR_MAX * 6);
trGeo.setAttribute('position', new THREE.BufferAttribute(trPos, 3).setUsage(THREE.DynamicDrawUsage));
trGeo.setAttribute('aCol', new THREE.BufferAttribute(trCol, 3).setUsage(THREE.DynamicDrawUsage));
const trLines = new THREE.LineSegments(trGeo, fxLMat); trLines.frustumCulled = false; scene.add(trLines);
export const tracers = [];
export function tracer(x0, y0, z0, x1, y1, z1, c, life) { if (tracers.length < TR_MAX) tracers.push({ x0, y0, z0, x1, y1, z1, c, life, max: life }); }
{
  const RN = 2600, seeds = new Float32Array(RN * 2 * 4), pos = new Float32Array(RN * 2 * 3);
  for (let i = 0; i < RN; i++) { const s = [Math.random(), Math.random(), Math.random(), Math.random()]; for (let k = 0; k < 2; k++) seeds.set(s, (i * 2 + k) * 4); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  const m = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: U, vertexShader: RAIN_VS, fragmentShader: RAIN_FS, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true });
  const rain = new THREE.LineSegments(g, m); rain.frustumCulled = false; fxScene.add(rain);
  const SN = 700, ss = new Float32Array(SN * 4), sp = new Float32Array(SN * 3);
  for (let i = 0; i < SN * 4; i++) ss[i] = Math.random();
  const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(sp, 3)); g2.setAttribute('seed', new THREE.BufferAttribute(ss, 4));
  const m2 = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: U, vertexShader: SPL_VS, fragmentShader: SPL_FS, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true });
  const spl = new THREE.Points(g2, m2); spl.frustumCulled = false; fxScene.add(spl);
}
