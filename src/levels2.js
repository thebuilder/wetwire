/* ================================================================ more levels: the Warrens (shanty slum) and the Meridian airfield */

/* ---------------------------------------------------------------- the Warrens: shacks, wires, a gang den */
const SHACK_COLS = [[0.42, 0.2, 0.1], [0.18, 0.32, 0.3], [0.4, 0.34, 0.2], [0.2, 0.26, 0.36], [0.45, 0.14, 0.1], [0.3, 0.22, 0.34], [0.36, 0.34, 0.18], [0.16, 0.34, 0.26], [0.3, 0.3, 0.32]];
const ROOF_COLS = [[0.45, 0.22, 0.1], [0.2, 0.36, 0.34], [0.5, 0.3, 0.12], [0.3, 0.3, 0.32], [0.55, 0.15, 0.12], [0.36, 0.34, 0.3]];
const TARPS = [[0.55, 0.12, 0.1], [0.1, 0.3, 0.45], [0.5, 0.42, 0.1], [0.15, 0.4, 0.25], [0.45, 0.2, 0.4]];
function leanRoof(x0, z0, x1, z1, y, rise, col) {
  const o = 0.3, IN = [(x0 + x1) / 2, y - 1, (z0 + z1) / 2];
  G.poly([[x0 - o, y, z0 - o], [x1 + o, y, z0 - o], [x1 + o, y + rise, z1 + o], [x0 - o, y + rise, z1 + o]], col, AB, IN);
  G.poly([[x0, y, z0], [x0, y, z1], [x0, y + rise, z1]], col.map((v) => v * 0.8), AB, IN);
  G.poly([[x1, y, z0], [x1, y, z1], [x1, y + rise, z1]], col.map((v) => v * 0.8), AB, IN);
}
function shack(x0, z0, x1, z1, o) {
  let y = 0, bx0 = x0, bz0 = z0, bx1 = x1, bz1 = z1;
  const stories = 1 + (rng() < 0.55 ? 1 : 0) + (rng() < 0.22 ? 1 : 0);
  for (let s = 0; s < stories; s++) {
    const h = rr(2.5, 3.1), col = pick(SHACK_COLS).map((v) => v * rr(0.8, 1.15));
    solid(bx0, y, bz0, bx1, y + h, bz1, col, AB);
    for (let x = bx0 + 0.5; x < bx1; x += 0.9) G.box(x, y + 0.2, bz1, x + 0.08, y + h - 0.2, bz1 + 0.03, col.map((v) => v * 0.7), AB);
    y += h;
    if (s < stories - 1) {
      const w = bx1 - bx0, d = bz1 - bz0; if (w < 3.2 || d < 3.2) break;
      const nw = rr(2.6, w), nd = rr(2.6, d), nx = bx0 + rr(0, w - nw), nz = bz0 + rr(0, d - nd);
      G.box(bx0 - 0.1, y - 0.15, bz0 - 0.1, bx1 + 0.1, y, bz1 + 0.1, [0.12, 0.11, 0.1], AB);
      bx0 = nx; bz0 = nz; bx1 = nx + nw; bz1 = nz + nd;
    }
  }
  leanRoof(bx0, bz0, bx1, bz1, y, rr(0.3, 0.7), pick(ROOF_COLS));
  if (rng() < 0.3) { const tx = rr(bx0 + 0.8, bx1 - 0.8), tz = rr(bz0 + 0.8, bz1 - 0.8); G.prism(tx, tz, y, y + 1.4, 1.2, 1.2, 1.2, 1.2, 8, [0.2, 0.25, 0.3], AB); }
  if (rng() < 0.25) { const ax = rr(bx0 + 0.4, bx1 - 0.4), az = rr(bz0 + 0.4, bz1 - 0.4); G.box(ax - 0.04, y, az - 0.04, ax + 0.04, y + rr(2, 4), az + 0.04, DARK, AB); }
  blockCells(x0, z0, x1, z1);
  if (!o || !o.inside) return;
  const sides = [];
  if (o.open.n) sides.push(['x', z0, -1, x0, x1]); if (o.open.s) sides.push(['x', z1, 1, x0, x1]);
  if (o.open.w) sides.push(['z', x0, -1, z0, z1]); if (o.open.e) sides.push(['z', x1, 1, z0, z1]);
  for (const [ax, c, s, a0, a1] of sides) {
    if (a1 - a0 < 2.4) continue;
    const a = rr(a0 + 0.4, a1 - 1.6);
    obox(ax, a, 0, c - 0.02 * s, a + 1, 2.1, c + 0.05 * s, [0.05, 0.05, 0.06], AB);
    if (rng() < 0.6) { const wa = a1 - a > 2.4 ? a + 1.4 : a0 + 0.3; obox(ax, wa, 1.1, c, wa + 0.8, 1.7, c + 0.04 * s, [1, 0.72, 0.38], [K.LAMP, 0.9 + rng(), 0, 0]); }
    if (rng() < 0.5) { const t = pick(TARPS); obox(ax, a0 + 0.2, 2.25, c, a1 - 0.2, 2.32, c + 1.1 * s, t, AB); }
    if (rng() < 0.18) { const nc = pick(NEONS), sa = rr(a0 + 0.3, Math.max(a0 + 0.4, a1 - 2.2)); obox(ax, sa, 2.6, c, sa + 1.8, 3.2, c + 0.12 * s, nc, [K.NEON, 2.2, rng(), 1]); const p = opt(ax, sa + 0.9, c + 1.2 * s); addLight(p[0], 2.9, p[1], 6, nc.map((v) => v * 1.3), 'neon'); }
  }
}
FILLERS.warrens = (x0, z0, x1, z1, o) => {
  const w = x1 - x0, d = z1 - z0;
  if (w < 2.6 || d < 2.6) { if (o.inside && w * d > 3 && rng() < 0.35) { if (rng() < 0.4) drumCluster((x0 + x1) / 2, (z0 + z1) / 2, 2); else crate((x0 + x1) / 2, (z0 + z1) / 2); } return; }
  if (!o.inside) { shack(x0, z0, x1, z1, o); return; }
  // break long lots into a row of shacks with slivers between them
  const along = w >= d, len = along ? w : d; let a = along ? x0 : z0; const end = a + len;
  while (a < end - 0.5) {
    const seg = Math.min(end - a, rr(3.4, 6.5)), b = end - (a + seg) < 2.5 ? end : a + seg;
    if (along) shack(a, z0, b, z1, Object.assign({}, o, { open: { n: o.open.n, s: o.open.s, w: a === x0 && o.open.w, e: b === end && o.open.e } }));
    else shack(x0, a, x1, b, Object.assign({}, o, { open: { w: o.open.w, e: o.open.e, n: a === z0 && o.open.n, s: b === end && o.open.s } }));
    a = b + (rng() < 0.35 ? 0.5 : 0);
  }
};
/* power lines and strings of lanterns sagging across the lanes */
FEATURES.wires = (f) => {
  let lit = 0;
  const ribbon = (ax, ay, az, bx, by, bz, col, aux) => { G.poly([[ax, ay, az], [bx, by, bz], [bx, by + 0.09, bz], [ax, ay + 0.09, az]], col, aux || AB, [(ax + bx) / 2 + 0.01, (ay + by) / 2 - 3, (az + bz) / 2 + 0.01]); };
  for (const e of RN.edges) {
    if (e.kind !== 'alley' && e.w > 9) continue;
    const A = RN.nodes[e.a], d = [Math.cos(e.th), Math.sin(e.th)], n = [-d[1], d[0]], h = e.w / 2 + 1.4;
    for (let t = 3; t < e.len - 3; t += rr(5, 9)) {
      const px = A.x + d[0] * t, pz = A.z + d[1] * t, y = rr(4, 5.6), sag = rr(0.3, 0.8);
      const a = [px + n[0] * h, y, pz + n[1] * h], b = [px - n[0] * h + d[0] * rr(-2, 2), y + rr(-0.6, 0.6), pz - n[1] * h + d[1] * rr(-2, 2)], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - sag, (a[2] + b[2]) / 2];
      ribbon(a[0], a[1], a[2], m[0], m[1], m[2], [0.11, 0.11, 0.13]); ribbon(m[0], m[1], m[2], b[0], b[1], b[2], [0.11, 0.11, 0.13]);
      if (rng() < 0.32 && lit < (f.max || 70)) {
        lit++; const nc = rng() < 0.6 ? [1, 0.62, 0.25] : pick(NEONS);
        for (const k of [0.3, 0.5, 0.7]) { const q = [lerp(a[0], b[0], k), lerp(a[1], b[1], k) - sag * (1 - Math.abs(k - 0.5) * 2) - 0.25, lerp(a[2], b[2], k)]; G.box(q[0] - 0.12, q[1] - 0.18, q[2] - 0.12, q[0] + 0.12, q[1], q[2] + 0.12, nc, [K.LAMP, 2, 0, 0]); }
        addLight(m[0], m[1] - 0.3, m[2], 7, nc.map((v) => v * 1.2), 'neon');
      }
    }
  }
};
/* a junk bridge over the canal to make the lanes cross it */
FEATURES.bridges = (f) => { for (const [x, z0, z1] of f.at) { G.box(x - 1.6, 0.05, z0, x + 1.6, 0.35, z1, [0.22, 0.17, 0.12], AB); for (const s of [-1, 1]) { G.box(x + s * 1.6 - 0.06, 0.35, z0, x + s * 1.6 + 0.06, 1.1, z1, [0.18, 0.14, 0.1], AB); blockCells(x + s * 1.6 - 0.2, z0, x + s * 1.6 + 0.2, z1, true); } } };
function genDen(x0, z0, x1, z1) {
  const cx = (x0 + x1) / 2, wallC = [0.24, 0.24, 0.23], WT = 0.45, H = 2.6;
  const wall = (a0, b0, a1, b1) => { solid(a0, 0, b0, a1, H, b1, wallC, AB); blockCells(a0, b0, a1, b1); };
  wall(x0, z0, x1, z0 + WT); wall(x0, z0, x0 + WT, z1); wall(x1 - WT, z0, x1, z1);
  wall(x0, z1 - WT, cx - 3.5, z1); wall(cx + 3.5, z1 - WT, x1, z1);
  for (let x = x0 + 1; x < x1 - 1; x += 1.1) G.box(x, H, z0, x + 0.06, H + 0.5, z0 + 0.06, [0.4, 0.38, 0.35], AB);
  // the bunker: two storeys of poured concrete with a water tank on stilts
  const b0 = x0 + 6, b1 = x1 - 6, bz0 = z0 + 3, bz1 = z0 + 13;
  solid(b0, 0, bz0, b1, 6.5, bz1, [0.2, 0.19, 0.18], [K.BLDG, 0, 0.83, 3]); blockCells(b0, bz0, b1, bz1);
  G.box(cx - 1.6, 0, bz1 - 0.02, cx + 1.6, 2.6, bz1 + 0.1, [0.05, 0.05, 0.06], AB);
  G.box(cx - 3, 3.2, bz1, cx + 3, 4.2, bz1 + 0.18, [1, 0.25, 0.2], [K.NEON, 2.6, 0.62, 1]); addLight(cx, 3.6, bz1 + 2, 10, [1.6, 0.35, 0.3], 'neon');
  const tx = b1 - 3, tz = bz0 + 4;
  for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) G.box(tx + dx - 0.1, 6.5, tz + dz - 0.1, tx + dx + 0.1, 9, tz + dz + 0.1, DARK, AB);
  G.prism(tx, tz, 9, 12, 3.6, 3.6, 3.6, 3.6, 10, [0.28, 0.3, 0.32], AB); G.prism(tx, tz, 12, 12.8, 3.6, 3.6, 0.4, 0.4, 10, [0.22, 0.24, 0.26], AB);
  WORLD.edges.push([tx - 1.8, 9, tz - 1.8, tx + 1.8, 12.8, tz + 1.8]);
  // courtyard: cover, fuel, a burn barrel
  sandbags(cx - 6, z1 - 6, cx - 2, z1 - 5.2); sandbags(cx + 2, z1 - 6, cx + 6, z1 - 5.2);
  drumCluster(x0 + 2.5, z1 - 3, 4); drumCluster(x1 - 2.5, bz1 + 3, 3);
  G.prism(x0 + 3, bz1 + 3, 0.15, 1, 0.8, 0.8, 0.8, 0.8, 8, [0.3, 0.2, 0.12], AB); G.box(x0 + 2.75, 1, bz1 + 2.75, x0 + 3.25, 1.1, bz1 + 3.25, [1, 0.5, 0.15], [K.LAMP, 3, 0, 0]);
  addLight(x0 + 3, 1.6, bz1 + 3, 8, [1.8, 0.8, 0.3], 'flood'); WORLD.vents.push([x0 + 3, bz1 + 3, 1.1]); blockCells(x0 + 2.6, bz1 + 2.6, x0 + 3.4, bz1 + 3.4, true);
  floodPole(x0 + 1.2, z0 + 1.2, 6, [1, 0.62, 0.3]); floodPole(x1 - 1.2, z1 - 1.2, 6, [1, 0.62, 0.3]);
  WORLD.den = { boss: [cx, bz1 + 2.2], posts: [[cx - 4, z1 - 7], [cx + 4, z1 - 7], [cx - 2.5, z1 + 1.5], [cx + 2.5, z1 + 1.5], [x0 + 2, bz1 + 5], [x1 - 2, bz1 + 1.5]] };
  WORLD.door = { x: cx, z: bz1, n: [0, 1] };
}
ZONES.den = genDen;

defineLevel('warrens', {
  kind: 'city', name: 'The Warrens', style: 'warrens', fill: 'warrens', seed: 73117, bounds: [0, 0, 226, 226], lotMax: 14, core: [112, 110], lampGap: 26, police: false,
  voids: [[-200, 174, 430, 190]],
  roads: [
    { name: 'Overpass Rd', pts: [[-60, 20], [286, 20]], w: 14 },
    { name: 'Market Rd', pts: [[110, 20], [110, 60], [104, 84]], w: 8 },
    { name: 'Canal Rd', pts: [[-60, 206], [286, 206]], w: 8 },
    { pts: [[-30, 46], [20, 44], [48, 50], [84, 46], [120, 52], [160, 46], [200, 50], [250, 46]], w: 3.5, kind: 'alley' },
    { pts: [[-30, 90], [28, 94], [62, 88], [88, 94], [132, 90], [170, 96], [250, 92]], w: 3.5, kind: 'alley' },
    { pts: [[-30, 140], [36, 136], [70, 142], [110, 138], [150, 144], [196, 138], [250, 142]], w: 3.5, kind: 'alley' },
    { pts: [[24, 27], [20, 60], [28, 100], [22, 166]], w: 3, kind: 'alley' },
    { pts: [[64, 27], [60, 70], [68, 118], [62, 166]], w: 3, kind: 'alley' },
    { pts: [[150, 27], [146, 66], [154, 110], [148, 166]], w: 3, kind: 'alley' },
    { pts: [[196, 27], [200, 80], [192, 130], [198, 166]], w: 3, kind: 'alley' },
    { pts: [[120, 52], [146, 66]], w: 3, kind: 'alley' },
    { pts: [[112, 139], [112, 128]], w: 3, kind: 'alley' },
    { pts: [[85, 48], [85, 56]], w: 3, kind: 'alley' }, { pts: [[85, 82], [85, 91]], w: 3, kind: 'alley' },
    { pts: [[173, 47], [173, 58]], w: 3, kind: 'alley' }, { pts: [[173, 84], [173, 94]], w: 3, kind: 'alley' },
    { pts: [[-30, 166], [250, 166]], w: 3, kind: 'path' },
    { pts: [[40, 166], [40, 202]], w: 2.5, kind: 'path' }, { pts: [[120, 166], [120, 202]], w: 2.5, kind: 'path' }, { pts: [[190, 166], [190, 202]], w: 2.5, kind: 'path' },
  ],
  zones: [
    { type: 'plaza', rect: [160, 58, 186, 84] },
    { type: 'market', rect: [72, 56, 98, 82] },
    { type: 'den', rect: [96, 100, 128, 126] },
  ],
  features: [{ type: 'water' }, { type: 'wires' }, { type: 'bridges', at: [[40, 172, 192], [120, 172, 192], [190, 172, 192]] }],
  spots: { start: [30, 200.5], boss: [112, 115] },
  traffic: 8, civs: 130,
});

/* ---------------------------------------------------------------- Meridian airfield */
function plane(x, z, along, s, col) {
  // a parked jet: fuselage, wings, tail, engines. along: 'x' or 'z' nose direction axis
  const c = col || [0.72, 0.73, 0.76], L = 18 * s, Wg = 16 * s, f = 1.3 * s;
  const B = (u0, y0, v0, u1, y1, v1, cc, aux) => along === 'x' ? G.box(x + u0, y0, z + v0, x + u1, y1, z + v1, cc, aux || AB) : G.box(x + v0, y0, z + u0, x + v1, y1, z + u1, cc, aux || AB);
  B(-L / 2, 1.2, -f, L / 2, 1.2 + 2 * f, f, c);
  B(L / 2, 1.5, -f * 0.7, L / 2 + 1.2 * s, 1.2 + 1.6 * f, f * 0.7, c);
  B(L / 2 - 0.2, 2.2 * s + 0.6, -f * 0.75, L / 2 + 0.6, 2.5 * s + 0.8, f * 0.75, [0.05, 0.08, 0.12]);
  B(-2 * s, 1.6, -Wg / 2, 2 * s, 1.85, Wg / 2, c.map((v) => v * 0.9));
  B(-L / 2 + 0.3, 2.4 * s, -0.12, -L / 2 + 3 * s, 2.4 * s + 3.4 * s, 0.12, c.map((v) => v * 0.85));
  B(-L / 2 + 0.3, 2.6 * s, -3 * s, -L / 2 + 2 * s, 2.75 * s, 3 * s, c.map((v) => v * 0.9));
  for (const v of [-Wg * 0.28, Wg * 0.28]) B(-0.8 * s, 0.7, v - 0.6 * s, 2.2 * s, 1.6, v + 0.6 * s, [0.3, 0.31, 0.33]);
  B(-L / 2 + 1, 1.4, -f - 0.02, L / 2 - 1, 1.55, -f, [1, 0.3, 0.55], [K.NEON, 1.2, 0.4, 0]);
  B(-0.1, 1.85, Wg / 2 - 0.2, 0.3, 2, Wg / 2, [0.2, 1, 0.3], [K.LAMP, 3, 0, 0]); B(-0.1, 1.85, -Wg / 2, 0.3, 2, -Wg / 2 + 0.2, [1, 0.15, 0.1], [K.LAMP, 3, 0, 0]);
  const e = along === 'x' ? [x - L / 2, z - Wg / 2, x + L / 2, z + Wg / 2] : [x - Wg / 2, z - L / 2, x + Wg / 2, z + L / 2];
  WORLD.edges.push([e[0], 1.2, e[1], e[2], 1.2 + 2 * f, e[3]]);
  if (along === 'x') blockCells(x - L / 2, z - f, x + L / 2, z + f); else blockCells(x - f, z - L / 2, x + f, z + L / 2);
}
function genApron(x0, z0, x1, z1, zn) {
  G.quad([x0, 0.152, z1], [x1, 0.152, z1], [x1, 0.152, z0], [x0, 0.152, z0], [0, 1, 0], [1, 1, 1], [K.RROAD, 0, 0, -1]);
  const Y = [0.75, 0.6, 0.12];
  for (let x = x0 + 4; x < x1 - 4; x += 3) G.box(x, 0.152, z0 + 3, x + 1.8, 0.16, z0 + 3.2, Y, AB);
  for (let z = z0 + 4; z < z1 - 4; z += 3) { G.box(x0 + 12, 0.152, z, x0 + 12.2, 0.16, z + 1.8, Y, AB); G.box(x1 - 12.2, 0.152, z, x1 - 12, 0.16, z + 1.8, Y, AB); }
  // VTOL pad: ring, H, edge lights
  const [px, pz] = zn.pad; WORLD.pad = [px, pz];
  G.prism(px, pz, 0.152, 0.17, 19, 19, 19, 19, 20, [0.14, 0.15, 0.16], AB);
  G.prism(px, pz, 0.17, 0.175, 15, 15, 15, 15, 20, [0.08, 0.09, 0.1], AB);
  G.box(px - 3, 0.175, pz - 0.4, px + 3, 0.18, pz + 0.4, [0.85, 0.85, 0.88], AB); G.box(px - 3, 0.175, pz - 3, px - 2.2, 0.18, pz + 3, [0.85, 0.85, 0.88], AB); G.box(px + 2.2, 0.175, pz - 3, px + 3, 0.18, pz + 3, [0.85, 0.85, 0.88], AB);
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, lx = px + Math.cos(a) * 9.2, lz = pz + Math.sin(a) * 9.2; G.box(lx - 0.15, 0.17, lz - 0.15, lx + 0.15, 0.32, lz + 0.15, [0.3, 1, 0.85], [K.LAMP, 2.4, 0, 0]); }
  addLight(px, 2, pz, 14, [0.4, 1.2, 1.1], 'pad');
  for (const [dx, dz] of [[-12, -10], [12, -10], [-12, 10], [12, 10]]) WORLD.turretSpots.push([px + dx, pz + dz]);
  // parked aircraft and ground clutter
  plane(x0 + 26, z0 + 15, 'x', 1, [0.75, 0.76, 0.8]); plane(x1 - 24, z0 + 15, 'x', 0.9, [0.3, 0.32, 0.36]);
  for (let i = 0; i < 5; i++) { const bx = x0 + 18 + i * 3.2, bz = z1 - 8; G.box(bx, 0.15, bz, bx + 2.4, 1.1, bz + 1.4, [0.5, 0.42, 0.12], AB); blockCells(bx, bz, bx + 2.4, bz + 1.4, true); }
  drumCluster(px + 18, pz + 6, 4); drumCluster(px - 18, pz - 4, 3);
  for (let x = x0 + 1.5; x <= x1 - 1; x += (x1 - x0 - 3) / 4) for (const lz of [z0 + 1.5, z1 - 1.5]) floodTall(x, lz, 14, [0.95, 0.9, 0.8]);
}
function genAirTerminal(x0, z0, x1, z1) {
  const h = 9, cx = (x0 + x1) / 2, col = [0.2, 0.22, 0.26];
  solid(x0, 0, z0 + 2, x1, h, z1, col, [K.BLDG, 0, 0.27, 1]); blockCells(x0, z0 + 2, x1, z1);
  G.box(x0, 0.15, z0 + 1.9, x1, h - 1, z0 + 2.02, [0.05, 0.07, 0.1], [K.GLASS, 0, 0, 0]);
  for (let x = x0 + 4; x < x1; x += 4) G.box(x - 0.1, 0.15, z0 + 1.85, x + 0.1, h, z0 + 2.05, col.map((v) => v * 0.8), AB);
  G.box(x0 - 0.5, h, z0 + 0.5, x1 + 0.5, h + 0.6, z1 + 0.5, col.map((v) => v * 0.7), AB);
  G.box(x0 - 1, h - 0.6, z0, x1 + 1, h - 0.3, z0 + 2, [0.16, 0.17, 0.19], AB);
  G.box(cx - 8, h + 0.6, z0 + 1, cx + 8, h + 2.4, z0 + 1.3, [1, 0.3, 0.55], [K.NEON, 2.6, 0.18, 1]); addLight(cx, h + 1.5, z0 - 1, 16, [1.6, 0.5, 0.85], 'neon');
  G.box(cx - 2.5, 0.15, z0 + 1.8, cx + 2.5, 3.2, z0 + 2.1, [0.6, 0.9, 1], [K.LAMP, 1.6, 0, 0]); addLight(cx, 2.5, z0, 10, [0.6, 0.9, 1.1], 'neon');
  WORLD.corpC = [cx, z0 - 11]; WORLD.door = { x: cx, z: z0 + 2, n: [0, -1] };
  WORLD.cams.push({ x: x0 + 1, y: 6, z: z0 + 1.5, base: Math.PI * 0.85, yaw: Math.PI * 0.85, off: 0, ph: rng() * 6, spot: 0 }, { x: x1 - 1, y: 6, z: z0 + 1.5, base: -Math.PI * 0.85, yaw: -Math.PI * 0.85, off: 0, ph: rng() * 6, spot: 0 });
}
function genCtower(x0, z0, x1, z1) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, H = 26;
  G.box(x0 + 1, 0, z0 + 1, x1 - 1, 4, z1 - 1, [0.2, 0.21, 0.23], AB); blockCells(x0 + 1, z0 + 1, x1 - 1, z1 - 1);
  G.prism(cx, cz, 4, H, 5, 5, 3.6, 3.6, 8, [0.26, 0.27, 0.3], AB);
  G.prism(cx, cz, H, H + 3, 7.5, 7.5, 9, 9, 8, [0.06, 0.1, 0.14], [K.GLASS, 0, 0, 0]);
  G.prism(cx, cz, H + 3, H + 3.6, 9.4, 9.4, 7, 7, 8, [0.2, 0.21, 0.23], AB);
  G.box(cx - 0.1, H + 3.6, cz - 0.1, cx + 0.1, H + 7, cz + 0.1, DARK, AB); G.box(cx - 0.25, H + 7, cz - 0.25, cx + 0.25, H + 7.4, cz + 0.25, [1, 0.1, 0.08], [K.NEON, 3, 0.7, 0]);
  addLight(cx, H + 1.5, cz, 14, [0.5, 1.1, 1.2], 'neon'); WORLD.edges.push([cx - 4.5, H, cz - 4.5, cx + 4.5, H + 3.6, cz + 4.5]);
  WORLD.nodes.push({ type: 'ctower', level: 'sec', x: cx, y: H + 1.5, z: cz, label: 'CONTROL TOWER', fx: 'GROUND STOP, DELAYS THE VTOL 60S', onHack: (n) => { if (MS.groundStop) return; MS.groundStop = 60; say('CONTROL TOWER // GROUND STOP ISSUED, VTOL HELD 60S', ''); } });
}
function genHangar(x0, z0, x1, z1, zn) {
  const col = [0.24, 0.25, 0.27], h = 9, open = zn.door || 'e';
  solid(x0 + 1, 0, z0 + 1, x1 - 1, h, z1 - 1, col, AB); blockCells(x0 + 1, z0 + 1, x1 - 1, z1 - 1);
  ridgeRoof(x0 + 1, z0 + 1, x1 - 1, z1 - 1, h, 4, col.map((v) => v * 0.8));
  const dx = open === 'e' ? x1 - 1 : x0 + 1, s = open === 'e' ? 1 : -1;
  G.box(dx - 0.05 * s, 0.15, z0 + 4, dx + 0.1 * s, h - 1.5, z1 - 4, [0.05, 0.05, 0.06], AB);
  G.box(dx, h - 1.3, z0 + 4, dx + 0.2 * s, h - 1, z1 - 4, [1, 0.62, 0.18], [K.NEON, 1.6, 0.4, 0]); addLight(dx + 3 * s, h - 2, (z0 + z1) / 2, 14, [1.4, 0.9, 0.4], 'flood');
}
function genFuelFarm(x0, z0, x1, z1) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (const [dx, dz] of [[-9.5, -7.5], [9.5, -7.5], [-9.5, 7.5], [9.5, 7.5]]) addBarrel(cx + dx, cz + dz, true);
  G.box(cx - 9, 0.8, cz - 0.25, cx + 9, 1.2, cz + 0.25, [0.42, 0.3, 0.16], AB); G.box(cx - 0.25, 0.8, cz - 8, cx + 0.25, 1.2, cz + 8, [0.42, 0.3, 0.16], AB);
  drumCluster(x0 + 3, z1 - 3, 4); drumCluster(x1 - 3, z0 + 3, 3);
  fenceRun('x', z0 + 0.6, x0, cx - 4); fenceRun('x', z0 + 0.6, cx + 4, x1); fenceRun('x', z1 - 0.6, x0, x1); fenceRun('z', x0 + 0.6, z0, z1); fenceRun('z', x1 - 0.6, z0, z1);
  G.box(cx - 3, 2.4, z0 + 0.5, cx + 3, 3.2, z0 + 0.7, [1, 0.62, 0.18], [K.NEON, 1.6, 0.1, 1]);
}
ZONES.apron = genApron; ZONES.terminal_air = genAirTerminal; ZONES.ctower = genCtower; ZONES.hangar = genHangar; ZONES.fuelfarm = genFuelFarm;
FILLERS.airfield = (x0, z0, x1, z1, o) => {
  const w = x1 - x0, d = z1 - z0;
  lawn(x0, z0, x1, z1);
  if (!o.inside || w < 6 || d < 6) return;
  const r = rng();
  if (r < 0.12) { const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2; G.box(mx - 0.2, 0.15, mz - 0.2, mx + 0.2, 5, mz + 0.2, DARK, AB); G.prism(mx, mz, 5, 5.8, 3, 3, 0.4, 0.4, 10, [0.7, 0.72, 0.75], AB); blockCells(mx - 0.3, mz - 0.3, mx + 0.3, mz + 0.3); }
  else if (r < 0.3 && w >= 8 && d >= 8) genWarehouse(x0 + 1.5, z0 + 1.5, Math.min(x1 - 1.5, x0 + 12), Math.min(z1 - 1.5, z0 + 9), o, 5);
};
/* edge lights along runways and taxiways */
FEATURES.runwayLights = () => {
  for (const e of RN.edges) {
    if (!AIR[e.kind]) continue;
    const A = RN.nodes[e.a], d = [Math.cos(e.th), Math.sin(e.th)], n = [-d[1], d[0]], col = e.kind === 'runway' ? [0.9, 0.95, 1] : [0.3, 0.5, 1];
    for (let t = 2; t < e.len; t += e.kind === 'runway' ? 10 : 7) for (const s of [-1, 1]) {
      const x = A.x + d[0] * t + n[0] * (e.w / 2 + 0.4) * s, z = A.z + d[1] * t + n[1] * (e.w / 2 + 0.4) * s;
      G.box(x - 0.15, 0, z - 0.15, x + 0.15, 0.4, z + 0.15, col, [K.LAMP, 2.6, 0, 0]);
    }
    if (e.kind === 'runway') for (const t of [8, e.len - 8]) for (let k = -e.w / 2 + 2; k < e.w / 2 - 1; k += 2.2) rquad(A.x + d[0] * t + n[0] * k, A.z + d[1] * t + n[1] * k, 7, 1, e.th, 0.03, [0.85, 0.86, 0.88], AB);
  }
};

defineLevel('airfield', {
  kind: 'city', name: 'Meridian airfield', style: 'airfield', fill: 'airfield', seed: 80021, bounds: [0, 0, 226, 226], lotMax: 24, core: [120, 120], lampGap: 24, police: false,
  roads: [
    { name: 'Runway 09', pts: [[-90, 40], [316, 40]], w: 28, kind: 'runway' },
    { pts: [[80, 40], [80, 92]], w: 12, kind: 'taxi' }, { pts: [[170, 40], [170, 92]], w: 12, kind: 'taxi' },
    { name: 'Service Rd', pts: [[-60, 200], [286, 200]], w: 8 },
    { name: 'Apron Rd', pts: [[44, 150], [286, 150]], w: 8 },
    { pts: [[44, 150], [44, 200]], w: 8 },
    { pts: [[145, 157], [145, 196]], w: 3, kind: 'alley' },
  ],
  zones: [
    { type: 'apron', rect: [40, 92, 200, 144], pad: [120, 118] },
    { type: 'terminal_air', rect: [56, 156, 140, 184] },
    { type: 'ctower', rect: [150, 158, 170, 178] },
    { type: 'hangar', rect: [4, 94, 36, 142], door: 'e' },
    { type: 'hangar', rect: [204, 94, 236, 142], door: 'w' },
    { type: 'fuelfarm', rect: [180, 160, 222, 192] },
    { type: 'plaza', rect: [8, 158, 34, 184] },
  ],
  features: [{ type: 'runwayLights' }],
  spots: { start: [62, 194.5], target: [98, 151] },
  flyLanes: [[true, 40]],
  traffic: 6, civs: 40,
});
