/* ---------------------------------------------------------------- compound (mission 1) */
const CX0 = 60, CX1 = 166, CZ0 = 50, CZ1 = 150, ROADX = 113;
function rroad(x0, z0, x1, z1, center, axis) { G.quad([x0, 0.02, z1], [x1, 0.02, z1], [x1, 0.02, z0], [x0, 0.02, z0], [0, 1, 0], [1, 1, 1], [K.RROAD, 0, center, axis]); }
function fenceRun(ax, c, a0, a1) {
  // ax 'x': runs along x at z=c; ax 'z': runs along z at x=c
  const H = 2.6, T = 0.05;
  if (ax === 'x') { G.box(a0, 0, c - T, a1, H, c + T, [1, 1, 1], [K.FENCE, 0, 0, 0]); G.box(a0, H, c - 0.04, a1, H + 0.06, c + 0.04, [0.3, 0.3, 0.33], AB); G.box(a0, H + 0.1, c - 0.12, a1, H + 0.32, c + 0.12, [0.12, 0.12, 0.13], AB); blockCells(a0, c - 0.5, a1, c + 0.5, true); }
  else { G.box(c - T, 0, a0, c + T, H, a1, [1, 1, 1], [K.FENCE, 0, 0, 0]); G.box(c - 0.04, H, a0, c + 0.04, H + 0.06, a1, [0.3, 0.3, 0.33], AB); G.box(c - 0.12, H + 0.1, a0, c + 0.12, H + 0.32, a1, [0.12, 0.12, 0.13], AB); blockCells(c - 0.5, a0, c + 0.5, a1, true); }
  for (let a = a0; a <= a1 + 0.01; a += 3) { if (ax === 'x') G.box(a - 0.07, 0, c - 0.07, a + 0.07, H + 0.4, c + 0.07, [0.22, 0.22, 0.24], AB); else G.box(c - 0.07, 0, a - 0.07, c + 0.07, H + 0.4, a + 0.07, [0.22, 0.22, 0.24], AB); }
  WORLD.edges.push(ax === 'x' ? [a0, 0, c, a1, H, c] : [c, 0, a0, c, H, a1]);
}
function floodPole(x, z, h, col) {
  G.box(x - 0.1, 0, z - 0.1, x + 0.1, h, z + 0.1, DARK, AB);
  G.box(x - 0.4, h, z - 0.25, x + 0.4, h + 0.3, z + 0.25, col, [K.LAMP, 3, 0, 0]);
  blockCells(x - 0.2, z - 0.2, x + 0.2, z + 0.2);
  return addLight(x, h - 0.4, z, 17, col.map((v) => v * 1.35), 'flood');
}
function container(x, z, w, d, col) { const h = 2.6; solid(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, col, AB); G.box(x - w / 2 - 0.02, 0.2, z - d / 2 + 0.2, x + w / 2 + 0.02, h - 0.2, z + d / 2 - 0.2, col.map((v) => v * 0.8), AB); blockCells(x - w / 2, z - d / 2, x + w / 2, z + d / 2); }
function sandbags(x0, z0, x1, z1) { G.box(x0, 0, z0, x1, 0.9, z1, [0.22, 0.2, 0.15], AB); blockCells(x0, z0, x1, z1, true); }
/* campus and park trees are broadleaf, with the odd tall cypress; pines stay in the compound's woods */
function tree(x, z, s) { if (DISTRICT === 'campus' || DISTRICT === 'downtown') { if (rng() < 0.82) return leafTree(x, z, s); return cypress(x, z, s); } pine(x, z, s); }
function leafTree(x, z, s) {
  s *= rr(0.85, 1.15);
  G.box(x - 0.13 * s, 0.15, z - 0.13 * s, x + 0.13 * s, 1.9 * s, z + 0.13 * s, [0.1, 0.07, 0.05], AB);
  const r = rng(), c = r < 0.12 ? [0.16, 0.07, 0.1] : r < 0.22 ? [0.14, 0.12, 0.05] : [0.06 + rng() * 0.03, 0.11 + rng() * 0.04, 0.06];
  const ox = rr(-0.3, 0.3) * s, oz = rr(-0.3, 0.3) * s, w = rr(2.6, 3.4) * s;
  G.prism(x, z, 1.5 * s, 2.7 * s, w * 0.55, w * 0.55, w, w, 7, c, AB);
  G.prism(x, z, 2.7 * s, 4.0 * s, w, w, w * 0.45, w * 0.45, 7, c.map((v) => v * 1.12), AB);
  G.prism(x + ox, z + oz, 3.6 * s, 4.6 * s, w * 0.6, w * 0.6, w * 0.2, w * 0.2, 6, c.map((v) => v * 1.25), AB);
  if (rng() < 0.12) { const gl = pick([[0.4, 1, 0.85], [1, 0.4, 0.75]]); G.box(x - 0.1, 3.1 * s, z + w * 0.5 - 0.05, x + 0.1, 3.3 * s, z + w * 0.5 + 0.1, gl, [K.LAMP, 1.4, 0, 0]); }
  blockCells(x - 0.3, z - 0.3, x + 0.3, z + 0.3, true);
}
function cypress(x, z, s) {
  const c = [0.03, 0.06, 0.04];
  G.box(x - 0.1 * s, 0.15, z - 0.1 * s, x + 0.1 * s, 0.8 * s, z + 0.1 * s, [0.09, 0.06, 0.04], AB);
  G.prism(x, z, 0.6 * s, 3.2 * s, 1.1 * s, 1.1 * s, 1.3 * s, 1.3 * s, 6, c, AB);
  G.prism(x, z, 3.2 * s, 5.4 * s, 1.3 * s, 1.3 * s, 0.1, 0.1, 6, c.map((v) => v * 1.2), AB);
  blockCells(x - 0.3, z - 0.3, x + 0.3, z + 0.3, true);
}
function hedge(x0, z0, x1, z1) { G.box(x0, 0.15, z0, x1, 1.0, z1, [0.035, 0.07, 0.04], AB); G.box(x0 + 0.05, 1.0, z0 + 0.05, x1 - 0.05, 1.12, z1 - 0.05, [0.045, 0.085, 0.05], AB); blockCells(x0, z0, x1, z1, true); }
function flowerBed(x0, z0, x1, z1) {
  G.box(x0, 0.15, z0, x1, 0.35, z1, [0.2, 0.2, 0.21], AB); G.box(x0 + 0.15, 0.35, z0 + 0.15, x1 - 0.15, 0.4, z1 - 0.15, [0.06, 0.05, 0.04], AB);
  const cols = [[0.55, 0.12, 0.3], [0.6, 0.45, 0.1], [0.3, 0.12, 0.5]];
  for (let x = x0 + 0.4; x < x1 - 0.3; x += 0.6) for (let z = z0 + 0.4; z < z1 - 0.3; z += 0.6) if (rng() < 0.6) G.box(x - 0.12, 0.4, z - 0.12, x + 0.12, 0.6, z + 0.12, pick(cols), AB);
  blockCells(x0, z0, x1, z1, true);
}
function pine(x, z, s) {
  G.box(x - 0.15 * s, 0, z - 0.15 * s, x + 0.15 * s, 1.4 * s, z + 0.15 * s, [0.09, 0.06, 0.04], AB);
  const c = [0.035 + rng() * 0.02, 0.06 + rng() * 0.025, 0.045];
  G.prism(x, z, 1.0 * s, 3.0 * s, 2.6 * s, 2.6 * s, 1.2 * s, 1.2 * s, 6, c, AB);
  G.prism(x, z, 2.4 * s, 4.4 * s, 2.0 * s, 2.0 * s, 0.8 * s, 0.8 * s, 6, c.map((v) => v * 1.1), AB);
  G.prism(x, z, 3.8 * s, 5.8 * s, 1.3 * s, 1.3 * s, 0.1, 0.1, 6, c.map((v) => v * 1.2), AB);
  blockCells(x - 0.3, z - 0.3, x + 0.3, z + 0.3, true);
}
function watchtower(x, z, manned, base) {
  const L = 1.5, H = 6.4;
  for (const [dx, dz] of [[-L, -L], [L, -L], [-L, L], [L, L]]) G.box(x + dx - 0.12, 0, z + dz - 0.12, x + dx + 0.12, H, z + dz + 0.12, [0.2, 0.17, 0.13], AB);
  G.box(x - L - 0.3, H, z - L - 0.3, x + L + 0.3, H + 0.3, z + L + 0.3, [0.24, 0.2, 0.15], AB);
  for (const [a, b, c2, d] of [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]]) {
    const xa = x + a * (L + 0.3), za = z + b * (L + 0.3), xb = x + c2 * (L + 0.3), zb = z + d * (L + 0.3);
    G.box(Math.min(xa, xb) - 0.05, H + 0.3, Math.min(za, zb) - 0.05, Math.max(xa, xb) + 0.05, H + 1.2, Math.max(za, zb) + 0.05, [0.2, 0.17, 0.13], AB);
  }
  for (const [dx, dz] of [[-L, -L], [L, -L], [-L, L], [L, L]]) G.box(x + dx - 0.08, H + 0.3, z + dz - 0.08, x + dx + 0.08, H + 2.3, z + dz + 0.08, [0.2, 0.17, 0.13], AB);
  G.box(x - L - 0.5, H + 2.3, z - L - 0.5, x + L + 0.5, H + 2.5, z + L + 0.5, [0.16, 0.14, 0.12], AB);
  G.box(x - 0.3, H + 1.2, z - 0.3, x + 0.3, H + 1.6, z + 0.3, [0.85, 0.9, 1], [K.LAMP, 2.5, 0, 0]);
  blockCells(x - L - 0.3, z - L - 0.3, x + L + 0.3, z + L + 0.3, true);
  WORLD.edges.push([x - L - 0.3, 0, z - L - 0.3, x + L + 0.3, H + 2.5, z + L + 0.3]);
  // ladder on the south face, which agents can climb once the tower is clear
  for (const lx of [x - 0.32, x + 0.32]) G.box(lx - 0.05, 0, z + L + 0.1, lx + 0.05, H + 0.4, z + L + 0.2, [0.3, 0.26, 0.2], AB);
  for (let y = 0.4; y < H; y += 0.45) G.box(x - 0.32, y, z + L + 0.12, x + 0.32, y + 0.06, z + L + 0.18, [0.3, 0.26, 0.2], AB);
  const t = { x, z, y: H + 0.32, half: L + 0.3, ladder: [x, z + L + 0.9], lamp: [x, H + 1.4, z], manned, base, sweep: rng() * 6, spot: [x, z], off: 0, lightOff: 0 };
  WORLD.towers.push(t);
  return t;
}
function genCompound() {
  SEED = 7123;
  const ext = 400;
  G.quad([-ext, 0, M + ext], [M + ext, 0, M + ext], [M + ext, 0, -ext], [-ext, 0, -ext], [0, 1, 0], [1, 1, 1], [K.DIRT, 0, 0, 0]);
  G.box(CX0, 0, CZ0, CX1, 0.03, CZ1, [0.11, 0.11, 0.12], [K.WALK, 0, 0, 0]);
  rroad(ROADX - 4, -ext, ROADX + 4, CZ0, ROADX, 0);
  rroad(ROADX - 4, CZ1, ROADX + 4, M + ext, ROADX, 0);
  // fences: north and south with gate gaps, west with a breach
  fenceRun('x', CZ0, CX0, 108); fenceRun('x', CZ0, 118, CX1);
  fenceRun('x', CZ1, CX0, 108); fenceRun('x', CZ1, 118, CX1);
  fenceRun('z', CX0, CZ0, 95); fenceRun('z', CX0, 100, CZ1);
  fenceRun('z', CX1, CZ0, CZ1);
  G.box(CX0 - 1.4, 0, 96, CX0 - 0.2, 0.12, 99.5, [1, 1, 1], [K.FENCE, 0, 0, 0]);
  for (const [gz, name] of [[CZ0, 'N'], [CZ1, 'S']]) {
    G.box(107.6, 0, gz - 0.3, 108.2, 3.4, gz + 0.3, [0.25, 0.25, 0.27], AB); G.box(117.8, 0, gz - 0.3, 118.4, 3.4, gz + 0.3, [0.25, 0.25, 0.27], AB);
    G.box(107.6, 3.2, gz - 0.2, 118.4, 3.4, gz + 0.2, [0.25, 0.25, 0.27], AB);
    G.box(110.5, 3.4, gz - 0.12, 115.5, 4.0, gz + 0.12, [1, 0.62, 0.18], [K.NEON, 1.4, 0.3, 1]);
    blockCells(107.6, gz - 0.3, 108.2, gz + 0.3); blockCells(117.8, gz - 0.3, 118.4, gz + 0.3);
    WORLD.gates.push({ name, x0: 108.2, x1: 117.8, z: gz, open: name === 'S' ? 1 : 0, want: name === 'S', lockT: 0 });
  }
  sandbags(102, CZ1 + 2, 107, CZ1 + 3); sandbags(119, CZ1 + 2, 124, CZ1 + 3);
  sandbags(102, CZ1 - 4, 106, CZ1 - 3);
  // watchtowers
  watchtower(66, 56, false, Math.PI * 0.75); watchtower(160, 56, false, -Math.PI * 0.75);
  watchtower(66, 144, true, Math.PI * 0.25); watchtower(160, 144, true, -Math.PI * 0.25);
  // HQ with veranda (target)
  solid(98, 0, 58, 128, 7, 70, [0.16, 0.15, 0.14], [K.BLDG, 0, 0.31, 3]); blockCells(98, 58, 128, 70);
  solid(104, 7, 60, 122, 9.5, 68, [0.15, 0.14, 0.13], [K.BLDG, 0, 0.62, 3]);
  G.box(100, 3.2, 70, 126, 3.45, 76, [0.18, 0.17, 0.16], AB);
  for (const px of [100.3, 106, 113, 120, 125.7]) { G.box(px - 0.12, 0, 75.6, px + 0.12, 3.2, 75.9, DARK, AB); blockCells(px - 0.2, 75.5, px + 0.2, 76); }
  for (const px of [104, 113, 122]) { G.box(px - 0.3, 3.05, 72.6, px + 0.3, 3.2, 73.4, [1, 0.8, 0.5], [K.LAMP, 2.4, 0, 0]); addLight(px, 2.8, 73, 7.5, [1.3, 0.95, 0.55], 'flood'); }
  G.box(108, 0.6, 69.9, 118, 2.6, 70.05, [0.3, 1, 0.85], [K.NEON, 0.7, 0.8, 1]);
  // barracks
  solid(70, 0, 80, 92, 4.5, 90, [0.17, 0.16, 0.13], [K.BLDG, 0, 0.13, 0]); blockCells(70, 80, 92, 90);
  solid(134, 0, 80, 156, 4.5, 90, [0.17, 0.16, 0.13], [K.BLDG, 0, 0.47, 0]); blockCells(134, 80, 156, 90);
  solid(76, 0, 108, 96, 4, 118, [0.15, 0.15, 0.14], [K.BLDG, 0, 0.71, 0]); blockCells(76, 108, 96, 118);
  // motor pool shed
  G.box(136, 4.0, 56, 158, 4.3, 72, [0.2, 0.19, 0.17], AB);
  for (const [px, pz] of [[136.3, 56.3], [157.7, 56.3], [136.3, 71.7], [157.7, 71.7], [147, 56.3], [147, 71.7]]) { G.box(px - 0.15, 0, pz - 0.15, px + 0.15, 4.0, pz + 0.15, DARK, AB); blockCells(px - 0.2, pz - 0.2, px + 0.2, pz + 0.2); }
  G.box(146, 3.7, 63.6, 148, 3.95, 64.4, [1, 0.8, 0.5], [K.LAMP, 2.2, 0, 0]); addLight(147, 3.4, 64, 10, [1.2, 0.9, 0.55], 'flood');
  // weapons crates outside the shed (launcher pickup sits on the open one)
  G.box(150.6, 0, 74, 154.4, 0.12, 76, [0.22, 0.25, 0.14], AB); G.box(155, 0, 73.6, 157.4, 1.1, 75.4, [0.22, 0.25, 0.14], AB); G.box(155.2, 1.1, 73.8, 157.2, 1.15, 75.2, [1, 0.62, 0.18], [K.NEON, 0.6, 0.2, 0]); blockCells(155, 73.6, 157.4, 75.4, true);
  // generator and radio mast
  solid(70, 0, 58, 77, 3, 64, [0.18, 0.18, 0.17], [K.BLDG, 0, 0.9, 3]); blockCells(70, 58, 77, 64);
  G.box(72, 3, 60, 73, 4.6, 61, DARK, AB); WORLD.vents.push([72.5, 60.5]);
  G.box(77, 1.6, 60.2, 77.05, 2.2, 61.4, [1, 0.62, 0.18], [K.NEON, 1.6, 0.21, 0]);
  G.box(87.6, 0, 63.6, 88.4, 20, 64.4, [0.25, 0.24, 0.24], AB); blockCells(87.6, 63.6, 88.4, 64.4);
  for (let y = 2; y < 20; y += 3) G.box(86.8, y, 62.8, 89.2, y + 0.12, 65.2, [0.25, 0.24, 0.24], AB);
  G.box(87.7, 20, 63.7, 88.3, 20.4, 64.3, [1, 0.1, 0.08], [K.NEON, 3, 0.6, 0]);
  WORLD.edges.push([87.6, 0, 63.6, 88.4, 20, 64.4]);
  // containers and cover
  const CC = [[0.32, 0.12, 0.08], [0.12, 0.22, 0.24], [0.26, 0.26, 0.24], [0.3, 0.24, 0.1], [0.1, 0.16, 0.1]];
  for (const [x, z, w, d] of [[124, 100, 6, 2.4], [124, 103, 6, 2.4], [100, 128, 2.4, 6], [134, 124, 6, 2.4], [140, 124, 6, 2.4], [84, 136, 6, 2.4], [150, 108, 2.4, 6], [104, 98, 2.4, 6]]) container(x, z, w, d, pick(CC));
  for (const [x, z, w, d] of [[40, 160, 6, 2.4], [180, 70, 2.4, 6], [186, 74, 2.4, 6], [30, 70, 6, 2.4]]) container(x, z, w, d, pick(CC));
  // floodlights
  for (const [x, z] of [[100, 140], [126, 140], [113, 94], [82, 100], [146, 100], [100, 52.5], [126, 52.5]]) floodPole(x, z, 7, [1, 0.72, 0.38]);
  // forest
  let placed = 0;
  for (let i = 0; i < 900 && placed < 240; i++) {
    const x = rr(-30, M + 30), z = rr(-30, M + 30);
    if (x > CX0 - 7 && x < CX1 + 7 && z > CZ0 - 7 && z < CZ1 + 7) continue;
    if (Math.abs(x - ROADX) < 9) continue;
    if (Math.abs(x - 54) < 4 && Math.abs(z - 100) < 6) continue;
    if (Math.hypot(x - ROADX, z - 194) < 16) continue;
    tree(x, z, rr(0.8, 1.35)); placed++;
  }
  // power poles along the road, with a junction box (uplinks)
  for (let z = -30; z < M + 30; z += 24) { if (z > CZ0 - 2 && z < CZ1 + 2) continue; G.box(ROADX + 6 - 0.12, 0, z - 0.12, ROADX + 6 + 0.12, 8, z + 0.12, [0.2, 0.17, 0.13], AB); G.box(ROADX + 4.8, 7.4, z - 0.08, ROADX + 7.2, 7.55, z + 0.08, [0.2, 0.17, 0.13], AB); blockCells(ROADX + 5.8, z - 0.2, ROADX + 6.2, z + 0.2); }
  const ubox = (x, z, label, r) => {
    G.box(x - 0.35, 0, z - 0.25, x + 0.35, 1.5, z + 0.25, [0.24, 0.25, 0.27], AB);
    G.box(x - 0.2, 1.0, z + 0.25, x + 0.2, 1.25, z + 0.27, [0.3, 1, 0.85], [K.LAMP, 1.8, 0, 0]);
    blockCells(x - 0.35, z - 0.25, x + 0.35, z + 0.25);
    WORLD.uplinks.push({ x, z: z + 0.9, r: r || 48, label, trace: 0, burn: 0, agent: null });
  };
  ubox(120, 160, 'ROADSIDE JUNCTION'); ubox(54, 100, 'POWER POLE 7'); ubox(80, 67, 'GENERATOR PANEL'); ubox(134, 76, 'MOTOR POOL TERMINAL');
  // van (start and extraction)
  WORLD.van = [ROADX + 1.5, 196];
  // camp lamps on the road outside
  floodPole(ROADX - 6, 166, 6, [1, 0.72, 0.38]); floodPole(ROADX - 6, 34, 6, [1, 0.72, 0.38]);
  // nodes
  const tw = WORLD.towers;
  WORLD.nodes.push({ type: 'gate', level: 'sec', x: ROADX, y: 3, z: CZ1, ref: WORLD.gates[1], label: 'SOUTH GATE' });
  WORLD.nodes.push({ type: 'gate', level: 'sec', x: ROADX, y: 3, z: CZ0, ref: WORLD.gates[0], label: 'NORTH GATE' });
  ['NW', 'NE', 'SW', 'SE'].forEach((n, i) => WORLD.nodes.push({ type: 'search', level: 'sec', x: tw[i].x, y: tw[i].y + 1.2, z: tw[i].z, ref: tw[i], label: 'SEARCHLIGHT ' + n }));
  WORLD.nodes.push({ type: 'gen', level: 'sec', x: 73, y: 3, z: 61, label: 'GENERATOR' });
  WORLD.nodes.push({ type: 'radio', level: 'sec', x: 88, y: 4, z: 64, label: 'RADIO MAST' });
}
