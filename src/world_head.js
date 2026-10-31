/* ================================================================ world grids */
const GW = 226, M = GW;   // play grid is GW x GW metres, one walk cell per metre
const walk = new Uint8Array(GW * GW).fill(1);
const opq = new Uint8Array(GW * GW);
function blockCells(x0, z0, x1, z1, seeThrough) {
  const ax = Math.max(0, Math.floor(x0)), az = Math.max(0, Math.floor(z0)), bx = Math.min(GW, Math.ceil(x1)), bz = Math.min(GW, Math.ceil(z1));
  for (let z = az; z < bz; z++) for (let x = ax; x < bx; x++) { walk[z * GW + x] = 0; if (!seeThrough) opq[z * GW + x] = 1; }
}
function openCells(x0, z0, x1, z1) {
  const ax = Math.max(0, Math.floor(x0)), az = Math.max(0, Math.floor(z0)), bx = Math.min(GW, Math.ceil(x1)), bz = Math.min(GW, Math.ceil(z1));
  for (let z = az; z < bz; z++) for (let x = ax; x < bx; x++) { walk[z * GW + x] = 1; opq[z * GW + x] = 0; }
}
function cellOk(x, z) { const ix = Math.floor(x), iz = Math.floor(z); return ix >= 0 && iz >= 0 && ix < GW && iz < GW && walk[iz * GW + ix] === 1; }
let WORLD = null;
function groundY(x, z) { return WORLD.kind === 'city' ? ghAt(x, z) : 0; }
function newWorld(kind) { return { kind, lights: [], edges: [], solids: [], boards: [], cams: [], vents: [], turretSpots: [], padC: [0, 0], corpC: [0, 0], uplinks: [], nodes: [], gates: [], towers: [], links: [], van: null, rail: 0, fences: [] }; }
let G = new Geo();
const NEONS = [[1,0.25,0.5],[0.3,1,0.85],[1,0.62,0.18],[0.66,0.32,1],[1,0.18,0.12],[0.45,1,0.35],[0.3,0.55,1]];
const BCOLS = [[0.13,0.14,0.17],[0.16,0.13,0.15],[0.11,0.14,0.15],[0.17,0.15,0.12],[0.12,0.12,0.13],[0.15,0.16,0.19]];
const DARK = [0.16, 0.16, 0.18], AB = [K.BASIC, 0, 0, 0];
