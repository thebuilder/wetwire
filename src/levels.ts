import { K, TAU, clamp, lerp, pick, rng, rr } from './core';
import { AB, DARK, G, GW, NEONS, WORLD, addBarrel, blockCells, cellOk } from './world_head';
import { CONT_COLS, addLight, bench, cbox, floodTall, genBuilding, genCampusLab, genCorp, genDorm, genField, genGreen, genMarket, genPark, genParking, genPlaza, genYard, lampPost, lawn, path, solid } from './city_fns';
import { fenceRun, flowerBed, genCompound, hedge, leafTree, tree } from './world_build';
import { CTX, C_ROAD, C_VOID, FEATURES, FILLERS, LE, LEVEL, RN, ZONES, coverRects, defineLevel, lci } from './layout';

/* ================================================================ level content
   Generators register by name and levels refer to them as data:
     ZONES[type](x0, z0, x1, z1, zone)   a set piece filling a rect the level places
     FILLERS[name](x0, z0, x1, z1, o)    whatever is left between roads (o.inside, o.dist, o.open {w,e,n,s})
     FEATURES[type](feature)             one-off pieces: water, cranes, ships, a monorail
   A new level is a defineLevel call at the bottom of this file. */

/* ---------------------------------------------------------------- small props */
function dumpster(x, z, ax) {
  const w = ax ? 1.8 : 1.1, d = ax ? 1.1 : 1.8, c = pick([[0.12, 0.2, 0.14], [0.22, 0.12, 0.08], [0.1, 0.12, 0.2]]);
  G.box(x - w / 2, 0.15, z - d / 2, x + w / 2, 1.3, z + d / 2, c, AB); G.box(x - w / 2 - 0.05, 1.3, z - d / 2 - 0.05, x + w / 2 + 0.05, 1.38, z + d / 2 + 0.05, c.map((v) => v * 0.7), AB);
  blockCells(x - w / 2, z - d / 2, x + w / 2, z + d / 2, true);
}
export function crate(x, z, s?) { s = s || rr(0.9, 1.4); G.box(x - s / 2, 0.15, z - s / 2, x + s / 2, 0.15 + s * 0.8, z + s / 2, [0.24, 0.2, 0.13], AB); blockCells(x - s / 2, z - s / 2, x + s / 2, z + s / 2, true); }
/* facade bounds for genBuilding: only sides that face a street get shopfronts and signs */
const facadeB = (x0, z0, x1, z1, o) => [o.open.w ? x0 : x0 - 1, o.open.n ? z0 : z0 - 1, o.open.e ? x1 : x1 + 1, o.open.s ? z1 : z1 + 1];
/* oriented box: u runs along the axis, v across it */
export function obox(ax, u0, y0, v0, u1, y1, v1, c, a) { if (ax === 'x') G.box(Math.min(u0, u1), y0, Math.min(v0, v1), Math.max(u0, u1), y1, Math.max(v0, v1), c, a); else G.box(Math.min(v0, v1), y0, Math.min(u0, u1), Math.max(v0, v1), y1, Math.max(u0, u1), c, a); }
export const opt = (ax, u, v) => ax === 'x' ? [u, v] : [v, u];

/* ---------------------------------------------------------------- warehouses */
const WH_COLS = [[0.2, 0.21, 0.22], [0.24, 0.2, 0.16], [0.16, 0.2, 0.22], [0.22, 0.22, 0.19], [0.26, 0.15, 0.12]];
export function ridgeRoof(x0, z0, x1, z1, h, rh, col) {
  const alongX = x1 - x0 >= z1 - z0, xm = (x0 + x1) / 2, zm = (z0 + z1) / 2, IN = [xm, h - 1, zm];
  if (alongX) {
    G.poly([[x0, h, z0], [x1, h, z0], [x1, h + rh, zm], [x0, h + rh, zm]], col, AB, IN);
    G.poly([[x0, h, z1], [x1, h, z1], [x1, h + rh, zm], [x0, h + rh, zm]], col.map((v) => v * 0.8), AB, IN);
    G.poly([[x0, h, z0], [x0, h, z1], [x0, h + rh, zm]], col, AB, IN); G.poly([[x1, h, z0], [x1, h, z1], [x1, h + rh, zm]], col, AB, IN);
  } else {
    G.poly([[x0, h, z0], [x0, h, z1], [xm, h + rh, z1], [xm, h + rh, z0]], col, AB, IN);
    G.poly([[x1, h, z0], [x1, h, z1], [xm, h + rh, z1], [xm, h + rh, z0]], col.map((v) => v * 0.8), AB, IN);
    G.poly([[x0, h, z0], [x1, h, z0], [xm, h + rh, z0]], col, AB, IN); G.poly([[x0, h, z1], [x1, h, z1], [xm, h + rh, z1]], col, AB, IN);
  }
}
export function genWarehouse(x0, z0, x1, z1, o, h) {
  h = h || Math.round(rr(6, 9));
  const col = pick(WH_COLS).map((v) => v * rr(0.85, 1.1));
  solid(x0, 0, z0, x1, h, z1, col, AB); blockCells(x0, z0, x1, z1);
  G.box(x0 - 0.05, h - 1.2, z0 - 0.05, x1 + 0.05, h - 0.9, z1 + 0.05, col.map((v) => v * 0.6), AB);
  ridgeRoof(x0, z0, x1, z1, h, Math.min(2.4, Math.min(x1 - x0, z1 - z0) * 0.18), col.map((v) => v * 0.75));
  if (!o || !o.inside) return;
  const sides = [];
  if (o.open.n) sides.push(['x', z0, -1, x0, x1]); if (o.open.s) sides.push(['x', z1, 1, x0, x1]);
  if (o.open.w) sides.push(['z', x0, -1, z0, z1]); if (o.open.e) sides.push(['z', x1, 1, z0, z1]);
  for (const [ax, c, s, a0, a1] of sides) {
    for (let a = a0 + 3; a + 4 < a1 - 1; a += rr(7, 11)) {
      obox(ax, a, 0, c - 0.02 * s, a + 4, 4, c + 0.08 * s, [0.07, 0.07, 0.08], AB);
      for (let y = 0.4; y < 4; y += 0.5) obox(ax, a, y, c + 0.08 * s, a + 4, y + 0.06, c + 0.1 * s, [0.13, 0.13, 0.14], AB);
      obox(ax, a + 1.6, 4.3, c, a + 2.4, 4.6, c + 0.3 * s, [1, 0.72, 0.38], [K.LAMP, 2.6, 0, 0]);
      if (rng() < 0.5) { const p = opt(ax, a + 2, c + 1.6 * s); addLight(p[0], 3.8, p[1], 7.5, [1.3, 0.85, 0.45], 'street'); }
    }
    if (rng() < 0.4 && a1 - a0 > 10) { const a = rr(a0 + 2, a1 - 8), nc = pick(NEONS); obox(ax, a, h - 2.6, c, a + 6, h - 1.4, c + 0.15 * s, nc, [K.NEON, 2.2, rng(), 1]); const p = opt(ax, a + 3, c + 1.5 * s); addLight(p[0], h - 2, p[1], 9, nc.map((v) => v * 1.4), 'neon'); }
  }
}

/* ---------------------------------------------------------------- factory */
function genFactory(x0, z0, x1, z1, zn) {
  const W = x1 - x0;
  G.box(x0, 0.15, z0, x1, 0.16, z1, [0.11, 0.105, 0.1], [K.WALK, 0, 0, 0]);
  // sawtooth hall
  const hx0 = x0 + 3, hx1 = x0 + Math.round(W * 0.55), hz0 = z0 + 3, hz1 = z1 - 5, h = 8, col = [0.21, 0.19, 0.17];
  solid(hx0, 0, hz0, hx1, h, hz1, col, [K.BLDG, 0, 0.41, 3]); blockCells(hx0, hz0, hx1, hz1);
  const IN = [(hx0 + hx1) / 2, h - 2, (hz0 + hz1) / 2];
  for (let x = hx0; x < hx1 - 0.5; x += 4) {
    const xb = Math.min(x + 4, hx1), top = h + 2.4;
    G.poly([[x, h, hz0], [x, h, hz1], [xb, top, hz1], [xb, top, hz0]], col.map((v) => v * 0.85), AB, [x + 2, h - 3, IN[2]]);
    G.poly([[x, h, hz0], [xb, h, hz0], [xb, top, hz0]], col, AB, [x + 2, h, IN[2]]); G.poly([[x, h, hz1], [xb, h, hz1], [xb, top, hz1]], col, AB, [x + 2, h, IN[2]]);
    G.box(xb - 0.1, h + 0.2, hz0 + 0.3, xb, top - 0.2, hz1 - 0.3, [1, 0.72, 0.38], [K.LAMP, 0.7, 0, 0]);
  }
  // loading bays on the hall's south face
  for (let x = hx0 + 3; x + 4 < hx1 - 2; x += 8) {
    G.box(x, 0, hz1 - 0.02, x + 4, 4.2, hz1 + 0.1, [0.07, 0.07, 0.08], AB);
    G.box(x + 1.5, 4.5, hz1, x + 2.5, 4.8, hz1 + 0.35, [1, 0.62, 0.18], [K.LAMP, 2.6, 0, 0]);
    addLight(x + 2, 3.8, hz1 + 2, 8, [1.3, 0.75, 0.3], 'street');
    G.box(x - 0.15, 0.15, hz1 + 0.1, x + 0.15, 1.1, hz1 + 1.2, [0.9, 0.62, 0.15], AB); blockCells(x - 0.2, hz1 + 0.1, x + 0.2, hz1 + 1.2, true);
  }
  // sign
  G.box(hx0 + 2, h - 3.5, hz1 + 0.1, hx0 + 12, h - 1.5, hz1 + 0.25, [1, 0.45, 0.12], [K.NEON, 2.6, 0.33, 1]);
  addLight(hx0 + 7, h - 2.5, hz1 + 2, 12, [1.6, 0.6, 0.2], 'neon');
  // chimneys with smoke
  const cxs = [hx1 + 4, hx1 + 9];
  cxs.forEach((cx, i) => {
    const cz = z0 + 6 + i * 3, H = 26 + i * 6;
    G.prism(cx, cz, 0, H, 3, 3, 2, 2, 10, [0.25, 0.23, 0.22], AB);
    for (const y of [H - 5, H - 2.2]) G.prism(cx, cz, y, y + 1.1, 2.25 - (y - H + 5) * 0.03, 2.25, 2.1, 2.1, 10, [0.6, 0.12, 0.1], AB);
    G.box(cx - 0.2, H - 0.2, cz - 0.2, cx + 0.2, H + 0.25, cz + 0.2, [1, 0.1, 0.08], [K.NEON, 3, 0.5 + i * 0.2, 0]);
    blockCells(cx - 1.5, cz - 1.5, cx + 1.5, cz + 1.5); WORLD.edges.push([cx - 1.5, 0, cz - 1.5, cx + 1.5, H, cz + 1.5]);
    WORLD.vents.push([cx, cz, H + 0.5, 1]);
  });
  // tanks and a pipe rack back to the hall
  const tz = z1 - 12, tx0 = hx1 + 4;
  for (let tx = tx0; tx + 4 < x1 - 2; tx += 9) {
    G.prism(tx + 3.5, tz, 0, 7, 7, 7, 7, 7, 12, [0.34, 0.35, 0.33], AB);
    G.prism(tx + 3.5, tz, 7, 8.2, 7, 7, 3, 3, 12, [0.3, 0.31, 0.29], AB);
    G.box(tx + 0.3, 3, tz - 0.4, tx + 0.5, 7, tz + 0.4, [0.9, 0.62, 0.15], AB);
    blockCells(tx, tz - 3.5, tx + 7, tz + 3.5); WORLD.edges.push([tx, 0, tz - 3.5, tx + 7, 8.2, tz + 3.5]);
  }
  drumCluster(hx1 + 2.5, tz + 5.5, 4); drumCluster(x1 - 5, tz + 5.5, 3);
  G.box(hx1, 5.2, tz - 0.3, x1 - 3, 5.7, tz + 0.3, [0.42, 0.3, 0.16], AB); G.box(hx1, 4.4, tz + 0.6, x1 - 3, 4.8, tz + 1, [0.28, 0.3, 0.32], AB);
  for (let x = hx1 + 2; x < x1 - 3; x += 6) { G.box(x - 0.12, 0.15, tz - 0.12, x + 0.12, 5.2, tz + 0.12, DARK, AB); blockCells(x - 0.2, tz - 0.2, x + 0.2, tz + 0.2, true); }
  // perimeter fence with a gate gap facing each street
  const gap = (a0, a1, open) => open ? [[a0, (a0 + a1) / 2 - 5], [(a0 + a1) / 2 + 5, a1]] : [[a0, a1]];
  const op = zn.open || {};
  for (const [a, b] of gap(x0, x1, op.n)) fenceRun('x', z0 + 0.6, a, b);
  for (const [a, b] of gap(x0, x1, op.s)) fenceRun('x', z1 - 0.6, a, b);
  for (const [a, b] of gap(z0, z1, op.w)) fenceRun('z', x0 + 0.6, a, b);
  for (const [a, b] of gap(z0, z1, op.e)) fenceRun('z', x1 - 0.6, a, b);
  floodTall(x0 + 2, z0 + 2, 9, [1, 0.62, 0.25]); floodTall(x1 - 2, z1 - 2, 9, [1, 0.62, 0.25]); floodTall(x1 - 2, z0 + 2, 9, [1, 0.62, 0.25]);
}

/* ---------------------------------------------------------------- container terminal */
function straddle(x, z, ax) {
  const L = 3.6, Wd = 1.8, H = 7, c = [0.75, 0.5, 0.08];
  const P = ax === 'x' ? [[x - L, z - Wd], [x + L, z - Wd], [x - L, z + Wd], [x + L, z + Wd]] : [[x - Wd, z - L], [x + Wd, z - L], [x - Wd, z + L], [x + Wd, z + L]];
  for (const [px, pz] of P) { G.box(px - 0.18, 0.15, pz - 0.18, px + 0.18, H, pz + 0.18, c, AB); blockCells(px - 0.25, pz - 0.25, px + 0.25, pz + 0.25); }
  if (ax === 'x') { G.box(x - L - 0.2, H, z - Wd - 0.3, x + L + 0.2, H + 0.6, z - Wd + 0.3, c, AB); G.box(x - L - 0.2, H, z + Wd - 0.3, x + L + 0.2, H + 0.6, z + Wd + 0.3, c, AB); G.box(x + L - 1.2, H + 0.6, z - Wd, x + L + 0.2, H + 1.8, z + Wd, [0.2, 0.2, 0.22], AB); }
  else { G.box(x - Wd - 0.3, H, z - L - 0.2, x - Wd + 0.3, H + 0.6, z + L + 0.2, c, AB); G.box(x + Wd - 0.3, H, z - L - 0.2, x + Wd + 0.3, H + 0.6, z + L + 0.2, c, AB); G.box(x - Wd, H + 0.6, z + L - 1.2, x + Wd, H + 1.8, z + L + 0.2, [0.2, 0.2, 0.22], AB); }
  G.box(x - 0.2, H + 0.6, z - 0.2, x + 0.2, H + 0.9, z + 0.2, [1, 0.62, 0.18], [K.NEON, 2.5, rng(), 0]);
  WORLD.edges.push([x - (ax === 'x' ? L : Wd), 0, z - (ax === 'x' ? Wd : L), x + (ax === 'x' ? L : Wd), H + 0.6, z + (ax === 'x' ? Wd : L)]);
}
function genTerminal(x0, z0, x1, z1, zn) {
  G.quad([x0, 0.155, z1], [x1, 0.155, z1], [x1, 0.155, z0], [x0, 0.155, z0], [0, 1, 0], [1, 1, 1], [K.RROAD, 0, 0, -1]);
  // painted lanes
  for (let z = z0 + 2; z < z1 - 1; z += 13) G.box(x0 + 2, 0.155, z, x1 - 2, 0.16, z + 0.15, [0.6, 0.45, 0.1], AB);
  // stacks: blocks of two rows separated by straddle aisles, turned in one corner for variety
  const turn = [x0 + (x1 - x0) * 0.55, z0 + (z1 - z0) * 0.5];
  for (let z = z0 + 4; z + 5 < z1 - 3; z += 13) for (let x = x0 + 4; x + 6 < x1 - 3; x += 6.6) {
    if (x > turn[0] && z > turn[1]) continue;
    if (rng() < 0.16) continue;
    for (let r = 0; r < 2; r++) { const n = rng() < 0.2 ? 0 : 1 + Math.floor(rng() * 3); for (let k = 0; k < n; k++) cbox(x + 3, z + 1.2 + r * 2.5, 6, 2.4, pick(CONT_COLS), 0.15 + k * 2.62); if (n) blockCells(x, z + r * 2.5, x + 6, z + 2.4 + r * 2.5); }
  }
  for (let x = turn[0] + 2; x + 5 < x1 - 3; x += 13) for (let z = turn[1] + 3; z + 6 < z1 - 3; z += 6.6) {
    if (rng() < 0.16) continue;
    for (let r = 0; r < 2; r++) { const n = rng() < 0.2 ? 0 : 1 + Math.floor(rng() * 3); for (let k = 0; k < n; k++) cbox(x + 1.2 + r * 2.5, z + 3, 2.4, 6, pick(CONT_COLS), 0.15 + k * 2.62); if (n) blockCells(x + r * 2.5, z, x + 2.4 + r * 2.5, z + 6); }
  }
  straddle(x0 + 20, z0 + 10.5, 'x'); straddle(x0 + 40, z0 + 36.5, 'x'); straddle(turn[0] + 8.5, turn[1] + 14, 'z');
  for (const [x, z] of [[x0 + 1.5, z0 + 1.5], [x1 - 1.5, z0 + 1.5], [x0 + 1.5, z1 - 1.5], [x1 - 1.5, z1 - 1.5], [turn[0], turn[1]]]) floodTall(x, z, 12, [1, 0.8, 0.5]);
  // gatehouse with a barrier by the entrance
  const gx = x0 + 2, gz = z1 - 6;
  G.box(gx, 0, gz, gx + 3, 2.8, gz + 3, [0.3, 0.3, 0.32], AB); G.box(gx - 0.2, 2.8, gz - 0.2, gx + 3.2, 3, gz + 3.2, [0.18, 0.18, 0.2], AB);
  G.box(gx + 0.4, 1.2, gz + 3, gx + 2.6, 2.2, gz + 3.05, [0.6, 0.9, 1], [K.LAMP, 1.2, 0, 0]); blockCells(gx, gz, gx + 3, gz + 3); WORLD.edges.push([gx, 0, gz, gx + 3, 3, gz + 3]);
  addLight(gx + 1.5, 2.5, gz + 4.5, 7, [0.6, 0.9, 1.1], 'neon');
}

/* ---------------------------------------------------------------- harbour pieces */
function quayCrane(x, z, ax, dir) {
  // ax: axis the boom runs along; dir: +1/-1, which way the water is. (x,z) is the landside leg line.
  const col = [0.7, 0.45, 0.08], u = ax === 'x' ? x : z, v = ax === 'x' ? z : x, s = dir;
  for (const du of [0, 11]) for (const dv of [-3, 3]) { const p = opt(ax, u + du * s, v + dv); G.box(p[0] - 0.35, 0, p[1] - 0.35, p[0] + 0.35, 24, p[1] + 0.35, col, AB); blockCells(p[0] - 0.4, p[1] - 0.4, p[0] + 0.4, p[1] + 0.4); }
  obox(ax, u - 7 * s, 24, v - 1, u + 26 * s, 25.4, v + 1, col, AB);
  obox(ax, u - 0.5 * s, 25.4, v - 1.6, u + 3.5 * s, 28, v + 1.6, [0.2, 0.2, 0.22], AB);
  obox(ax, u + 0.2 * s, 26.2, v + 1.6, u + 3 * s, 27.4, v + 1.62, [1, 0.8, 0.4], [K.LAMP, 2, 0, 0]);
  obox(ax, u + 25.6 * s, 25.4, v - 0.25, u + 26 * s, 25.8, v + 0.25, [1, 0.1, 0.08], [K.NEON, 3, 0.4, 0]);
  obox(ax, u + 15 * s, 9, v - 0.1, u + 15.1 * s, 24, v + 0.1, DARK, AB); obox(ax, u + 13.5 * s, 7, v - 1.3, u + 16.6 * s, 9, v + 1.3, CONT_COLS[0], AB);
  const L = opt(ax, u + 1.5 * s, v); addLight(L[0], 22, L[1], 26, [1.3, 0.9, 0.45], 'flood');
  const a = opt(ax, u - 7 * s, v - 1), b = opt(ax, u + 26 * s, v + 1);
  WORLD.edges.push([Math.min(a[0], b[0]), 24, Math.min(a[1], b[1]), Math.max(a[0], b[0]), 25.4, Math.max(a[1], b[1])]);
}
function ship(x0, z0, x1, z1, col) {
  const ax = x1 - x0 > z1 - z0 ? 'x' : 'z', u0 = ax === 'x' ? x0 : z0, u1 = ax === 'x' ? x1 : z1, v0 = ax === 'x' ? z0 : x0, v1 = ax === 'x' ? z1 : x1;
  solid(x0, -1, z0, x1, 4.5, z1, col, AB);
  obox(ax, u0 + 2, 4.5, v0 + 1, u1 - 2, 4.7, v1 - 1, [0.2, 0.18, 0.16], AB);
  obox(ax, u1 - 14, 4.7, v0 + 3, u1 - 4, 12, v1 - 3, [0.75, 0.74, 0.7], [K.BLDG, 0, 0.55, 0]);
  const b = opt(ax, u1 - 9, (v0 + v1) / 2); addLight(b[0], 10, b[1], 16, [1.1, 1, 0.8], 'flood');
  for (let u = u0 + 6; u < u1 - 18; u += 6.4) for (let v = v0 + 2.5; v < v1 - 5; v += 2.6) if (rng() < 0.8) obox(ax, u, 4.7, v, u + 6, 4.7 + 2.6 * (1 + Math.floor(rng() * 2)), v + 2.4, pick(CONT_COLS), AB);
}
FEATURES.water = (f) => {
  const WA = [K.WATER, 0, 0, 0], y = 0.04, a0 = -LE, a1 = GW + LE;
  coverRects((i) => CTX[i] === C_VOID, 80, 80, (x0, z0, x1, z1) => G.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], [1, 1, 1], WA));
  // the sea carries on beyond the raster
  for (const v of LEVEL.voids || []) {
    const F = 500, r = [v[0] < a0 ? -F : v[0], v[1] < a0 ? -F : v[1], v[2] > a1 ? a1 + F : v[2], v[3] > a1 ? a1 + F : v[3]];
    for (const c of [[r[0], r[1], r[2], a0], [r[0], a1, r[2], r[3]], [r[0], Math.max(r[1], a0), a0, Math.min(r[3], a1)], [a1, Math.max(r[1], a0), r[2], Math.min(r[3], a1)]]) {
      const q = [Math.max(c[0], r[0]), Math.max(c[1], r[1]), Math.min(c[2], r[2]), Math.min(c[3], r[3])];
      if (q[2] - q[0] > 0.1 && q[3] - q[1] > 0.1) G.quad([q[0], y, q[3]], [q[2], y, q[3]], [q[2], y, q[1]], [q[0], y, q[1]], [0, 1, 0], [1, 1, 1], WA);
    }
  }
  // quay lips, bollards, and rails where a road runs out over the water
  const isV = (x, z) => { const i = lci(x + 0.5, z + 0.5); return i >= 0 && CTX[i] === C_VOID; };
  let k = 0;
  for (let z = -LE; z < GW + LE; z++) for (let x = -LE; x < GW + LE; x++) {
    const i = lci(x + 0.5, z + 0.5); if (CTX[i] === C_VOID) continue;
    const road = CTX[i] === C_ROAD;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!isV(x + dx, z + dz)) continue;
      const bx0 = dx > 0 ? x + 0.8 : dx < 0 ? x : x, bx1 = dx > 0 ? x + 1 : dx < 0 ? x + 0.2 : x + 1, bz0 = dz > 0 ? z + 0.8 : dz < 0 ? z : z, bz1 = dz > 0 ? z + 1 : dz < 0 ? z + 0.2 : z + 1;
      if (road) { G.box(bx0, 0, bz0, bx1, 0.9, bz1, [0.22, 0.22, 0.24], AB); continue; }
      G.box(bx0, 0.15, bz0, bx1, 0.2, bz1, [0.9, 0.62, 0.15], AB);
      if (++k % 6 === 0) G.box(x + 0.3, 0.15, z + 0.3, x + 0.7, 0.75, z + 0.7, [0.14, 0.14, 0.15], AB);
    }
  }
};
FEATURES.crane = (f) => quayCrane(f.x, f.z, f.ax, f.dir);
/* fuel drums (small, in clusters) and fuel tanks (big) that explode when shot */
FEATURES.drums = (f) => { for (const p of f.pts) { if (f.big) addBarrel(p[0], p[1], true); else drumCluster(p[0], p[1], f.n || 3); } };
export function drumCluster(x, z, n) { for (let i = 0; i < n; i++) { const a = i * 2.1 + rng(), d = i ? 0.95 : 0; const bx = x + Math.sin(a) * d, bz = z + Math.cos(a) * d; if (cellOk(bx, bz)) addBarrel(bx, bz, false); } }
FEATURES.ship = (f) => ship(f.rect[0], f.rect[1], f.rect[2], f.rect[3], f.col || [0.32, 0.08, 0.07]);

/* ---------------------------------------------------------------- elevated monorail above a street */
FEATURES.monorail = (f) => {
  const tx = f.x, z0 = -LE - 60, z1 = GW + LE + 60;
  G.box(tx - 1.2, 8.2, z0, tx + 1.2, 8.8, z1, [0.14, 0.14, 0.16], AB);
  G.box(tx - 1.25, 8.8, z0, tx - 1.1, 9.0, z1, [0.3, 1, 0.85], [K.NEON, 1.2, 0.4, 0]);
  G.box(tx + 1.1, 8.8, z0, tx + 1.25, 9.0, z1, [0.3, 1, 0.85], [K.NEON, 1.2, 0.4, 0]);
  WORLD.edges.push([tx - 1.2, 8.2, z0, tx + 1.2, 8.8, z1]);
  for (let z = z0; z < z1; z += 14) {
    if (RN.nodes.some((n) => Math.abs(n.z - z) < n.r + 3 && Math.abs(n.x - tx) < n.r + 3)) continue;
    G.box(tx - 0.45, 0, z - 0.45, tx + 0.45, 8.2, z + 0.45, [0.13, 0.13, 0.15], AB); blockCells(tx - 0.45, z - 0.45, tx + 0.45, z + 0.45);
  }
  WORLD.rail = tx;
};

/* ---------------------------------------------------------------- zones */
ZONES.plaza = (x0, z0, x1, z1) => genPlaza(x0, z0, x1, z1);
ZONES.tower = (x0, z0, x1, z1) => genCorp(x0, z0, x1, z1);
ZONES.market = (x0, z0) => genMarket(x0, z0);
/* a park that scales: tree clumps along the edges, a pond, a pavilion, lamps and benches along the paths */
function genBigPark(x0, z0, x1, z1) {
  if (x1 - x0 < 34 || z1 - z0 < 30) return genPark(x0, z0, x1, z1, 0, 0);
  lawn(x0, z0, x1, z1);
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  path(x0 + 1, mz - 1.1, x1 - 1, mz + 1.1); path(mx - 1.1, z0 + 1, mx + 1.1, z1 - 1);
  // pond in one quadrant with a stone rim
  const px0 = x0 + 5, pz0 = z0 + 4, px1 = mx - 5, pz1 = mz - 4;
  G.box(px0 - 0.6, 0.15, pz0 - 0.6, px1 + 0.6, 0.24, pz1 + 0.6, [0.2, 0.2, 0.21], AB);
  G.box(px0, 0.15, pz0, px1, 0.25, pz1, [1, 1, 1], [K.WATER, 0, 0, 0]);
  blockCells(px0 - 0.6, pz0 - 0.6, px1 + 0.6, pz1 + 0.6, true);
  for (let i = 0; i < 3; i++) { const lx = rr(px0 + 1, px1 - 1), lz = rr(pz0 + 1, pz1 - 1); G.box(lx - 0.15, 0.25, lz - 0.15, lx + 0.15, 0.32, lz + 0.15, [0.4, 0.9, 1], [K.LAMP, 1.2, 0, 0]); }
  addLight((px0 + px1) / 2, 1, (pz0 + pz1) / 2, 10, [0.35, 0.8, 1], 'neon');
  // pavilion in the opposite quadrant
  const vx = (mx + x1) / 2, vz = (mz + z1) / 2;
  G.box(vx - 4, 0.15, vz - 4, vx + 4, 0.35, vz + 4, [0.22, 0.22, 0.24], AB);
  for (const [dx, dz] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) { G.box(vx + dx - 0.15, 0.35, vz + dz - 0.15, vx + dx + 0.15, 3.4, vz + dz + 0.15, DARK, AB); blockCells(vx + dx - 0.2, vz + dz - 0.2, vx + dx + 0.2, vz + dz + 0.2, true); }
  G.prism(vx, vz, 3.4, 4.8, 9.5, 9.5, 0.6, 0.6, 4, [0.16, 0.17, 0.19], AB);
  G.box(vx - 4.2, 3.3, vz - 4.2, vx + 4.2, 3.45, vz + 4.2, [0.85, 0.95, 1], [K.NEON, 1.1, 0.6, 0]);
  addLight(vx, 2.6, vz, 9, [0.8, 0.95, 1.1], 'neon'); WORLD.edges.push([vx - 4, 0, vz - 4, vx + 4, 4.8, vz + 4]);
  // tree clumps hugging the edges, leaving the middle open
  for (let i = 0; i < Math.floor((x1 - x0) * (z1 - z0) / 140); i++) {
    const e = Math.floor(rng() * 4), t = rng();
    let x = e < 2 ? lerp(x0 + 2, x1 - 2, t) : (e === 2 ? x0 + rr(1.5, 6) : x1 - rr(1.5, 6)), z = e >= 2 ? lerp(z0 + 2, z1 - 2, t) : (e === 0 ? z0 + rr(1.5, 6) : z1 - rr(1.5, 6));
    if (Math.abs(x - mx) < 3 || Math.abs(z - mz) < 3) continue;
    if (x > px0 - 2 && x < px1 + 2 && z > pz0 - 2 && z < pz1 + 2) continue;
    if (Math.abs(x - vx) < 6 && Math.abs(z - vz) < 6) continue;
    tree(x, z, rr(0.9, 1.3));
  }
  hedge(mx + 3, mz - 6, mx + 4, mz - 3); hedge(mx - 4, mz + 3, mx - 3, mz + 6);
  for (const t of [0.22, 0.5, 0.78]) { lampPost(lerp(x0, x1, t), mz - 2.2); lampPost(mx + 2.2, lerp(z0, z1, t)); }
  for (const t of [0.32, 0.68]) { bench(lerp(x0, x1, t), mz + 1.9, true); bench(mx - 1.9, lerp(z0, z1, t), false); }
}
ZONES.park = genBigPark;
ZONES.green = (x0, z0, x1, z1) => genGreen(x0, z0, x1, z1);
ZONES.field = (x0, z0, x1, z1) => genField(x0, z0, x1, z1);
ZONES.parking = (x0, z0, x1, z1) => genParking(x0, z0, x1, z1);
ZONES.dorm = (x0, z0, x1, z1) => genDorm(x0, z0, x1, z1);
ZONES.lab = (x0, z0, x1, z1) => genCampusLab(x0, z0, x1, z1);
ZONES.yard = (x0, z0, x1, z1) => genYard(x0, z0, x1, z1);
ZONES.factory = genFactory;
ZONES.terminal = genTerminal;

/* ---------------------------------------------------------------- fillers */
FILLERS.downtown = (x0, z0, x1, z1, o) => {
  const w = x1 - x0, d = z1 - z0;
  if (w < 4 || d < 4) { if (o.inside && w * d >= 4 && rng() < 0.3) { if (rng() < 0.3 && w >= 2.5 && d >= 2.5) drumCluster((x0 + x1) / 2, (z0 + z1) / 2, 2); else dumpster((x0 + x1) / 2, (z0 + z1) / 2, w > d); } return; }
  const core = 1 - clamp(o.dist / 150, 0, 1);
  let h = rng() < 0.4 ? rr(6, 11) : rr(10, 16 + 36 * core * core);
  if (w * d < 50) h = Math.min(h, rr(5, 9));
  if (!o.inside) h = rr(12, 26 + 30 * core);
  const b = facadeB(x0, z0, x1, z1, o);
  genBuilding(x0, z0, x1, z1, b[0], b[1], b[2], b[3], !o.inside, Math.round(h));
};
FILLERS.docks = (x0, z0, x1, z1, o) => {
  const w = x1 - x0, d = z1 - z0;
  if (w < 5 || d < 5) { if (o.inside && w >= 3 && d >= 3 && rng() < 0.3) { drumCluster((x0 + x1) / 2, (z0 + z1) / 2, 3); return; } if (o.inside && w * d >= 3) for (let i = 0; i < Math.min(3, w * d / 8); i++) crate(rr(x0 + 0.8, x1 - 0.8), rr(z0 + 0.8, z1 - 0.8)); return; }
  if (w >= 16 && d >= 14 && rng() < 0.3) { genYard(x0, z0, x1, z1); return; }
  genWarehouse(x0 + 0.5, z0 + 0.5, x1 - 0.5, z1 - 0.5, o, !o.inside ? Math.round(rr(7, 12)) : 0);
};
FILLERS.campus = (x0, z0, x1, z1, o) => {
  const w = x1 - x0, d = z1 - z0;
  lawn(x0, z0, x1, z1);
  if (w < 6 || d < 6) { if (w * d > 16 && rng() < 0.5) tree((x0 + x1) / 2, (z0 + z1) / 2, rr(0.6, 0.9)); return; }
  if (o.inside && w >= 19 && d >= 19 && rng() < 0.7) { genCampusLab(x0 - 2, z0 - 2, x1 + 2, z1 + 2); return; }
  if (w >= 10 && d >= 10 && rng() < 0.55) {
    const b = facadeB(x0 + 2, z0 + 2, x1 - 2, z1 - 2, o);
    genBuilding(x0 + 2, z0 + 2, x1 - 2, z1 - 2, b[0], b[1], b[2], b[3], !o.inside, Math.round(rng() < 0.25 ? rr(16, 24) : rr(6, 11)));
    return;
  }
  // open lots: a mix of hedged gardens, a few shade trees with benches, flower beds, or plain lawn
  const r = rng(), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  if (r < 0.3 && w >= 8 && d >= 8) {
    if (o.open.n) hedge(x0 + 1, z0 + 0.5, x1 - 1, z0 + 1.1); if (o.open.s) hedge(x0 + 1, z1 - 1.1, x1 - 1, z1 - 0.5);
    flowerBed(mx - 1.5, mz - 1, mx + 1.5, mz + 1);
    if (w > 12) { leafTree(x0 + 3, mz, 0.9); leafTree(x1 - 3, mz, 0.9); }
  } else if (r < 0.7) {
    const n = Math.min(3, Math.floor(w * d / 90) + 1);
    for (let i = 0; i < n; i++) tree(rr(x0 + 2, x1 - 2), rr(z0 + 2, z1 - 2), rr(0.8, 1.15));
  } else if (r < 0.85 && w >= 6 && d >= 6) flowerBed(mx - Math.min(3, w / 3), mz - 0.8, mx + Math.min(3, w / 3), mz + 0.8);
  if (o.inside && w > 8 && rng() < 0.4) bench((x0 + x1) / 2, (z0 + z1) / 2, w > d);
};

/* ================================================================ levels
   roads: polylines [[x,z],...] with an asphalt width w; kind 'alley' (people only, narrow) or 'path' (footpath).
   Roads should run past the play bounds so traffic and police can enter and leave.
   zones: { type, rect: [x0,z0,x1,z1] }. A tower needs a street along its +z side (the door).
   spots: named points the missions use (start, limo, van, halden). */
const ring = (cx, cz, r, n) => Array.from({ length: n + 1 }, (_, i) => { const a = i / n * TAU; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r]; });

defineLevel('compound', { kind: 'compound', name: 'Kessel outskirts', bounds: [0, 0, 226, 226], custom: () => genCompound() });

defineLevel('downtown', {
  kind: 'city', name: 'Sector 9', style: 'downtown', fill: 'downtown', seed: 41017, bounds: [0, 0, 226, 226], lotMax: 20, core: [120, 100],
  roads: [
    { name: 'The Spine', pts: [[62, 62], [196, 196]], w: 14 },
    { name: 'North Blvd', pts: [[-60, 36], [286, 36]], w: 12 },
    { name: 'West St', pts: [[62, -60], [62, 286]], w: 10 },
    { name: 'Meridian Row', pts: [[131, 131], [286, 131]], w: 10 },
    { name: 'East St', pts: [[196, 36], [196, 286]], w: 10 },
    { name: 'Canal St', pts: [[-60, 150], [150, 150]], w: 10 },
    { name: 'Ash St', pts: [[-60, 104], [62, 104]], w: 8 },
    { name: 'Lantern St', pts: [[84, 84], [196, 84]], w: 8 },
    { name: 'Neon St', pts: [[128, 36], [128, 84]], w: 8 },
    { name: 'Gutter Ln', pts: [[62, 176], [176, 176]], w: 8 },
    { name: 'Kiln Rd', pts: [[-60, 200], [110, 200], [160, 224], [286, 224]], w: 10 },
    { pts: [[150, 36], [150, 84]], w: 4, kind: 'alley' },
    { pts: [[182, 84], [182, 131]], w: 4, kind: 'alley' },
    { pts: [[62, 116], [116, 116]], w: 4, kind: 'alley' },
    { pts: [[20, 104], [20, 150]], w: 4, kind: 'alley' },
    { pts: [[100, 150], [100, 176]], w: 4, kind: 'alley' },
  ],
  zones: [
    { type: 'plaza', rect: [184, 1, 210, 27] },
    { type: 'tower', rect: [150, 94, 176, 120] },
    { type: 'market', rect: [26, 160, 52, 186] },
  ],
  features: [{ type: 'monorail', x: 62 }],
  spots: { start: [40, 143], limo: [128, 36] },
  flyLanes: [[true, 36], [true, 131], [false, 196], [true, 200], [false, 128]],
  traffic: 22, civs: 150,
});

defineLevel('docks', {
  kind: 'city', name: 'Harrow Bay docks', style: 'docks', fill: 'docks', seed: 52031, bounds: [0, 0, 226, 226], lotMax: 24, core: [140, 90],
  voids: [[196, -200, 420, 420], [112, 195, 420, 420]],
  roads: [
    { name: 'Quay Rd', pts: [[187, -60], [187, 164], [165, 186], [60, 186], [30, 216], [30, 290]], w: 12 },
    { name: 'Harbour St', pts: [[-60, 40], [187, 40]], w: 10 },
    { name: 'Foundry Rd', pts: [[100, 40], [100, 186]], w: 10 },
    { name: 'Terminal Rd', pts: [[-60, 134], [187, 134]], w: 10 },
    { name: 'Haul Rd', pts: [[-60, 104], [20, 96], [60, 90], [100, 90]], w: 12 },
    { name: 'Gate Rd', pts: [[60, 40], [60, -60]], w: 8 },
    { name: 'Slipway', pts: [[100, 156], [70, 186]], w: 8 },
    { name: 'Pier 4', pts: [[150, 186], [150, 216]], w: 10 },
    { pts: [[20, 134], [20, 186]], w: 4, kind: 'alley' },
    { pts: [[130, 134], [130, 186]], w: 4, kind: 'alley' },
  ],
  zones: [
    { type: 'plaza', rect: [150, 4, 176, 30] },
    { type: 'tower', rect: [60, 100, 86, 126] },
    { type: 'terminal', rect: [112, 52, 176, 126] },
    { type: 'factory', rect: [8, 50, 90, 80], open: { n: true, s: true, e: true } },
  ],
  features: [
    { type: 'water' },
    { type: 'crane', x: 194, z: 66, ax: 'x', dir: 1 }, { type: 'crane', x: 194, z: 104, ax: 'x', dir: 1 }, { type: 'crane', x: 194, z: 142, ax: 'x', dir: 1 },
    { type: 'crane', x: 178, z: 193, ax: 'z', dir: 1 },
    { type: 'ship', rect: [214, 30, 236, 170], col: [0.32, 0.08, 0.07] },
    { type: 'ship', rect: [160, 206, 250, 224], col: [0.1, 0.16, 0.24] },
  ],
  spots: { start: [40, 127], van: [187, 40] },
  traffic: 14, civs: 70,
});

defineLevel('campus', {
  kind: 'city', name: 'Meridian research campus', style: 'campus', fill: 'campus', seed: 63389, bounds: [0, 0, 226, 226], lotMax: 22, core: [113, 118], lampGap: 22,
  roads: [
    { name: 'Ring Rd', pts: ring(113, 118, 72, 24), w: 10 },
    { name: 'Founders Ave', pts: [[113, -60], [113, 46]], w: 10 },
    { name: 'Founders Way', pts: [[47, 90], [179, 90]], w: 8 },
    { name: 'Lab Row', pts: [[113, 190], [113, 290]], w: 10 },
    { name: 'Dorm Rd', pts: [[-60, 140], [44, 140]], w: 8 },
    { name: 'Quarry Rd', pts: [[184, 112], [286, 112]], w: 10 },
    { name: 'Gate Ln', pts: [[150, 56], [150, -60]], w: 8 },
    { pts: [[200, 112], [200, 62]], w: 8 },
    { pts: [[24, 140], [24, 196]], w: 8 },
    { pts: [[113, 20], [64, 20]], w: 8 },
    { pts: [[113, 212], [170, 212]], w: 8 },
    { pts: [[113, 150], [113, 190]], w: 3, kind: 'path' },
    { pts: [[76, 125], [41, 125]], w: 3, kind: 'path' },
    { pts: [[150, 125], [185, 125]], w: 3, kind: 'path' },
    { pts: [[76, 100], [76, 150], [150, 150], [150, 100], [76, 100]], w: 3, kind: 'path' },
  ],
  zones: [
    { type: 'plaza', rect: [160, 4, 186, 30] },
    { type: 'tower', rect: [100, 56, 126, 82] },
    { type: 'park', rect: [79, 103, 147, 147] },
    { type: 'field', rect: [192, 122, 222, 152] },
    { type: 'parking', rect: [12, 48, 36, 72] },
  ],
  spots: { start: [119.5, 214], halden: [113, 160] },
  traffic: 12, civs: 90,
});
