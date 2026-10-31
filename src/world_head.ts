import { Geo, K, pick } from './core';

/* ================================================================ world grids */
export const GW = 226, M = GW;   // play grid is GW x GW metres, one walk cell per metre
export const walk = new Uint8Array(GW * GW).fill(1);
export const opq = new Uint8Array(GW * GW);
export function blockCells(x0, z0, x1, z1, seeThrough?) {
  const ax = Math.max(0, Math.floor(x0)), az = Math.max(0, Math.floor(z0)), bx = Math.min(GW, Math.ceil(x1)), bz = Math.min(GW, Math.ceil(z1));
  for (let z = az; z < bz; z++) for (let x = ax; x < bx; x++) { walk[z * GW + x] = 0; if (!seeThrough) opq[z * GW + x] = 1; }
}
export function openCells(x0, z0, x1, z1) {
  const ax = Math.max(0, Math.floor(x0)), az = Math.max(0, Math.floor(z0)), bx = Math.min(GW, Math.ceil(x1)), bz = Math.min(GW, Math.ceil(z1));
  for (let z = az; z < bz; z++) for (let x = ax; x < bx; x++) { walk[z * GW + x] = 1; opq[z * GW + x] = 0; }
}
export function cellOk(x, z) { const ix = Math.floor(x), iz = Math.floor(z); return ix >= 0 && iz >= 0 && ix < GW && iz < GW && walk[iz * GW + ix] === 1; }
export let WORLD = null;
export function setWORLD(v: typeof WORLD) { return WORLD = v; }
export function newWorld(kind) { return { kind, lights: [], edges: [], solids: [], boards: [], cams: [], vents: [], turretSpots: [], padC: [0, 0], corpC: [0, 0], uplinks: [], nodes: [], gates: [], towers: [], links: [], van: null, rail: 0, fences: [] }; }
export let G = new Geo();
export function setG(v: typeof G) { return G = v; }
export const NEONS = [[1,0.25,0.5],[0.3,1,0.85],[1,0.62,0.18],[0.66,0.32,1],[1,0.18,0.12],[0.45,1,0.35],[0.3,0.55,1]];
export const BCOLS = [[0.13,0.14,0.17],[0.16,0.13,0.15],[0.11,0.14,0.15],[0.17,0.15,0.12],[0.12,0.12,0.13],[0.15,0.16,0.19]];
export const DARK = [0.16, 0.16, 0.18], AB = [K.BASIC, 0, 0, 0];
export let barrels = [];
export function setBarrels(v: typeof barrels) { return barrels = v; }
export function addBarrel(x, z, big, col?) {
  const b = { x, z, big: !!big, r: big ? 3.4 : 0.42, hp: big ? 160 : 45, maxHp: big ? 160 : 45, dead: false, fuse: 0, col: col || (big ? [0.75, 0.74, 0.7] : pick([[0.6, 0.12, 0.08], [0.7, 0.5, 0.05], [0.15, 0.3, 0.5]])) };
  barrels.push(b); blockCells(x - b.r, z - b.r, x + b.r, z + b.r, true);
  return b;
}
