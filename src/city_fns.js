let DISTRICT = 'downtown';
function addLight(x, y, z, r, c, kind) { const L = { x, y, z, r, c, kind, off: 0 }; WORLD.lights.push(L); return L; }
function solid(x0, y0, z0, x1, y1, z1, col, aux) { G.box(x0, y0, z0, x1, y1, z1, col, aux); WORLD.edges.push([x0, y0, z0, x1, y1, z1]); WORLD.solids.push([x0, y0, z0, x1, y1, z1]); }
function sbox(sd, a0, a1, o0, o1, y0, y1, col, aux) {
  if (sd.ax === 'x') { const xa = sd.s > 0 ? sd.c + o0 : sd.c - o1, xb = sd.s > 0 ? sd.c + o1 : sd.c - o0; G.box(xa, y0, a0, xb, y1, a1, col, aux); }
  else { const za = sd.s > 0 ? sd.c + o0 : sd.c - o1, zb = sd.s > 0 ? sd.c + o1 : sd.c - o0; G.box(a0, y0, za, a1, y1, zb, col, aux); }
}
const sidePt = (sd, a, o, y) => sd.ax === 'x' ? [sd.c + sd.s * o, y, a] : [a, y, sd.c + sd.s * o];

function genBuilding(x0, z0, x1, z1, bx0, bz0, bx1, bz1, outer, hOver) {
  let h = hOver || (outer ? rr(12, 34) : (rng() < 0.45 ? rr(5, 9) : rng() < 0.85 ? rr(10, 16) : rr(18, 28)));
  h = Math.round(h);
  const br = rr(0.8, 1.2), base = pick(DISTRICT === 'campus' ? CAMPUS_COLS : BCOLS).map((v) => v * br);
  const style = ri(0, 3), sd = rng();
  let h1 = (h > 16 && rng() < 0.6) ? Math.max(8, Math.round(h * rr(0.5, 0.72))) : h;
  solid(x0, 0, z0, x1, h1, z1, base, [K.BLDG, 0, sd, style]);
  if (!outer) blockCells(x0, z0, x1, z1);
  const roofs = [[x0, z0, x1, z1, h1]];
  if (h1 < h) {
    const ins = rr(1, 2.5), ux0 = x0 + ins, uz0 = z0 + ins, ux1 = x1 - ins, uz1 = z1 - ins;
    if (ux1 - ux0 > 3 && uz1 - uz0 > 3) { solid(ux0, h1, uz0, ux1, h, uz1, base.map((v) => v * 0.92), [K.BLDG, 0, (sd + 0.37) % 1, style]); roofs.push([ux0, uz0, ux1, uz1, h]); }
  }
  for (const [rx0, rz0, rx1, rz1, ry] of roofs) {
    const n = ri(1, 3);
    for (let i = 0; i < n; i++) {
      const w = rr(0.8, 1.8), d = rr(0.8, 1.8), hh = rr(0.5, 1.3);
      if (rx1 - rx0 < w * 2 + 0.5 || rz1 - rz0 < d * 2 + 0.5) continue;
      const cx = rr(rx0 + w, rx1 - w), cz = rr(rz0 + d, rz1 - d);
      G.box(cx - w / 2, ry, cz - d / 2, cx + w / 2, ry + hh, cz + d / 2, [0.19, 0.2, 0.22], AB);
    }
  }
  const top = roofs[roofs.length - 1];
  if (rng() < 0.45) {
    const ax = (top[0] + top[2]) / 2 + rr(-1, 1), az = (top[1] + top[3]) / 2 + rr(-1, 1), ah = rr(3, 8);
    G.box(ax - 0.08, top[4], az - 0.08, ax + 0.08, top[4] + ah, az + 0.08, [0.22, 0.22, 0.24], AB);
    G.box(ax - 0.16, top[4] + ah, az - 0.16, ax + 0.16, top[4] + ah + 0.28, az + 0.16, [1, 0.1, 0.08], [K.NEON, 3, rng(), 0]);
  }
  if (outer) return;
  const sides = [];
  if (x0 <= bx0 + 0.01) sides.push({ ax: 'x', c: x0, s: -1, a0: z0, a1: z1 });
  if (x1 >= bx1 - 0.01) sides.push({ ax: 'x', c: x1, s: 1, a0: z0, a1: z1 });
  if (z0 <= bz0 + 0.01) sides.push({ ax: 'z', c: z0, s: -1, a0: x0, a1: x1 });
  if (z1 >= bz1 - 0.01) sides.push({ ax: 'z', c: z1, s: 1, a0: x0, a1: x1 });
  for (const s of sides) {
    const len = s.a1 - s.a0;
    if (rng() < 0.45 && len > 5) {
      const a = rr(s.a0 + 0.5, s.a1 - 4.5), l = Math.min(rr(3, 6), s.a1 - 0.5 - a), nc = pick(NEONS);
      sbox(s, a, a + l, 0, 1.5, 2.7, 2.85, [0.07, 0.07, 0.09], AB);
      sbox(s, a, a + l, 1.42, 1.56, 2.55, 2.85, nc, [K.NEON, 1.8, rng(), 0]);
      const p = sidePt(s, a + l / 2, 1.9, 2.3); addLight(p[0], p[1], p[2], 6.5, nc.map((v) => v * 1.25), 'neon');
    }
    if (rng() < 0.62 && len > 3 && h1 > 6) {
      const nc = pick(NEONS), seed = rng();
      if (rng() < 0.55) {
        const a = rr(s.a0 + 0.8, s.a1 - 0.8), y0 = rr(3.2, 4.6), sl = Math.min(rr(3, 8), h1 - y0 - 0.5);
        if (sl > 1.5) {
          sbox(s, a - 0.13, a + 0.13, 0.1, 1.3, y0, y0 + sl, nc, [K.NEON, 2.8, seed, 1]);
          const p = sidePt(s, a, 1.7, y0 + sl / 2); addLight(p[0], p[1], p[2], 8.5, nc.map((v) => v * 1.7), 'neon');
        }
      } else {
        const w = rr(2, Math.min(6, len - 1)), a = rr(s.a0 + 0.5, s.a1 - 0.5 - w), y0 = rr(3.4, 6), hh = Math.min(rr(1, 2.2), h1 - y0 - 0.5);
        if (hh > 0.6) {
          sbox(s, a, a + w, 0, 0.22, y0, y0 + hh, nc, [K.NEON, 2.6, seed, 1]);
          const p = sidePt(s, a + w / 2, 1.5, y0 + hh / 2); addLight(p[0], p[1], p[2], 8.5, nc.map((v) => v * 1.6), 'neon');
        }
      }
    }
    if (rng() < 0.1 && WORLD.cams.length < 14 && h1 > 6) {
      const a = rng() < 0.5 ? s.a0 + 0.3 : s.a1 - 0.3, p = sidePt(s, a, 0.35, 4.6);
      sbox(s, a - 0.2, a + 0.2, 0, 0.5, 4.4, 4.75, [0.25, 0.25, 0.28], AB);
      const yaw = s.ax === 'x' ? (s.s > 0 ? Math.PI / 2 : -Math.PI / 2) : (s.s > 0 ? 0 : Math.PI);
      WORLD.cams.push({ x: p[0], y: 4.6, z: p[2], base: yaw, yaw, off: 0, ph: rng() * 6, spot: 0 });
    }
  }
  if (sides.length && h1 < 26 && rng() < 0.24) {
    const s = sides[0], len = s.a1 - s.a0;
    if (len > 6.5) {
      const w = Math.min(rr(5, 8), len - 1), a = (s.a0 + s.a1) / 2 - w / 2, y0 = h1 + 1.2, bh = rr(2.6, 3.6);
      sbox(s, a + 0.6, a + 0.9, -1.2, -0.9, h1, y0, DARK, AB);
      sbox(s, a + w - 0.9, a + w - 0.6, -1.2, -0.9, h1, y0, DARK, AB);
      const seed = rng(); sbox(s, a, a + w, -1.25, -0.85, y0, y0 + bh, [1, 1, 1], [K.BOARD, 0, seed, 0]);
      const p = sidePt(s, a + w / 2, 1.6, y0 + bh / 2);
      const L = addLight(p[0], p[1], p[2], 13, seed < 0.33 ? [1.4, 0.4, 0.8] : seed < 0.66 ? [0.4, 1.3, 1.1] : [1.4, 0.8, 0.3], 'board');
      WORLD.boards.push({ x: p[0], y: p[1], z: p[2], light: L, seed });
    }
  }
}
function genPlaza(x0, z0, x1, z1) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2 + 2; WORLD.padC = [cx, cz];
  G.box(cx - 5, 0.15, cz - 5, cx + 5, 0.22, cz + 5, [0.1, 0.11, 0.12], [K.PAD, 0, 0, 0]);
  for (const [dx, dz] of [[-6.5, -6.5], [6.5, -6.5], [-6.5, 6.5], [6.5, 6.5]]) {
    G.box(cx + dx - 0.1, 0.15, cz + dz - 0.1, cx + dx + 0.1, 3.5, cz + dz + 0.1, DARK, AB);
    G.box(cx + dx - 0.22, 3.5, cz + dz - 0.22, cx + dx + 0.22, 3.8, cz + dz + 0.22, [0.4, 1, 0.85], [K.LAMP, 3, 0, 0]);
    addLight(cx + dx, 3.3, cz + dz, 9, [0.3, 1.0, 0.85], 'pad'); blockCells(cx + dx - 0.2, cz + dz - 0.2, cx + dx + 0.2, cz + dz + 0.2);
  }
  genBuilding(x0 + 3, z0 + 3, x0 + 10, z0 + 7, x0 + 3, z0 + 3, x1 - 3, z1 - 3, false, 7);
  genBuilding(x1 - 10, z0 + 3, x1 - 3, z0 + 7, x0 + 3, z0 + 3, x1 - 3, z1 - 3, false, 10);
}
function genCorp(x0, z0, x1, z1) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2 - 2; WORLD.corpC = [cx, cz];
  let y = 0; const col = DISTRICT === 'campus' ? [0.16, 0.2, 0.24] : [0.09, 0.1, 0.13];
  const tiers = DISTRICT === 'docks' ? [[6.5, 11], [5.2, 19]] : DISTRICT === 'campus' ? [[6.5, 18], [5.2, 32], [4.2, 44]] : [[6.5, 30], [5.2, 52], [4.2, 72]];
  for (const [hw, top] of tiers) { solid(cx - hw, y, cz - hw, cx + hw, top, cz + hw, col, [K.BLDG, 0, 0.77, 2]); y = top; }
  blockCells(cx - 6.5, cz - 6.5, cx + 6.5, cz + 6.5);
  tiers.forEach(([hw, top], i) => { const nc = i === 0 ? [0.3, 1, 0.85] : [1, 0.3, 0.55], na = [K.NEON, 2.2 + i, 0.2 + i * 0.3, 0], o = hw + 0.2, y0 = top - 0.7;
    G.box(cx - o, y0, cz - o, cx + o, top, cz - o + 0.3, nc, na); G.box(cx - o, y0, cz + o - 0.3, cx + o, top, cz + o, nc, na);
    G.box(cx - o, y0, cz - o, cx - o + 0.3, top, cz + o, nc, na); G.box(cx + o - 0.3, y0, cz - o, cx + o, top, cz + o, nc, na); });
  G.box(cx - 3, 13, cz + 6.5, cx + 3, 21, cz + 6.75, [1, 0.3, 0.55], [K.NEON, 3, 0.9, 1]);
  addLight(cx, 17, cz + 9, 15, [1.7, 0.5, 0.85], 'neon');
  G.box(cx - 2, 0.15, cz + 6.5, cx + 2, 3.2, cz + 6.6, [0.6, 0.9, 1], [K.LAMP, 1.4, 0, 0]);
  addLight(cx, 2.5, cz + 8.5, 9, [0.6, 0.9, 1.1], 'neon');
  for (const [dx, dz] of [[-9, 9], [9, 9], [-9, -9], [9, -9]]) {
    G.box(cx + dx - 1.2, 0.15, cz + dz - 1.2, cx + dx + 1.2, 0.9, cz + dz + 1.2, [0.14, 0.15, 0.16], AB);
    G.box(cx + dx - 1, 0.9, cz + dz - 1, cx + dx + 1, 1.0, cz + dz + 1, [0.25, 1, 0.5], [K.NEON, 0.8, 0.3, 0]);
    blockCells(cx + dx - 1.2, cz + dz - 1.2, cx + dx + 1.2, cz + dz + 1.2);
  }
  WORLD.turretSpots.push([cx - 5, cz + 10], [cx + 5, cz + 10]);
  WORLD.door = { x: cx, z: cz + 6.5, n: [0, 1] };
  for (const [dx, dz, yaw] of [[-6.6, 6.6, -Math.PI / 4], [6.6, 6.6, Math.PI / 4]]) {
    WORLD.cams.push({ x: cx + dx, y: 5, z: cz + dz, base: yaw, yaw, off: 0, ph: rng() * 6, spot: 0 });
    G.box(cx + dx - 0.25, 4.8, cz + dz - 0.25, cx + dx + 0.25, 5.2, cz + dz + 0.25, [0.25, 0.25, 0.28], AB);
  }
}
function genMarket(x0, z0) {
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    if (i === 1 && j === 1) continue;
    const sx = x0 + 4 + i * 7, sz = z0 + 4 + j * 7, nc = pick(NEONS);
    G.box(sx + 0.6, 0.15, sz + 0.6, sx + 3.4, 1.1, sz + 3.4, [0.2, 0.16, 0.12], AB);
    for (const [px, pz] of [[0, 0], [4, 0], [0, 4], [4, 4]]) G.box(sx + px - 0.06, 0.15, sz + pz - 0.06, sx + px + 0.06, 2.4, sz + pz + 0.06, DARK, AB);
    G.box(sx - 0.2, 2.4, sz - 0.2, sx + 4.2, 2.55, sz + 4.2, nc.map((v) => v * 0.3 + 0.04), [K.NEON, 0.3, rng(), 0]);
    G.box(sx + 1.2, 1.1, sz + 1.2, sx + 2.8, 1.5, sz + 2.8, nc, [K.NEON, 1.6, rng(), 1]);
    addLight(sx + 2, 2.1, sz + 2, 6.5, nc.map((v) => v * 1.4), 'neon');
    blockCells(sx + 0.6, sz + 0.6, sx + 3.4, sz + 3.4, true);
  }
  const cx = x0 + 13, cz = z0 + 13;
  G.box(cx - 1.5, 0.15, cz - 1.5, cx + 1.5, 5, cz + 1.5, [0.12, 0.12, 0.14], AB);
  G.box(cx - 1.55, 3.5, cz - 1.55, cx + 1.55, 4.8, cz + 1.55, [1, 1, 1], [K.BOARD, 0, 0.71, 0]);
  addLight(cx, 4, cz, 10, [1.2, 0.5, 1], 'board');
  WORLD.boards.push({ x: cx, y: 4.2, z: cz, light: WORLD.lights[WORLD.lights.length - 1], seed: 0.71 });
  blockCells(cx - 1.5, cz - 1.5, cx + 1.5, cz + 1.5);
}
const CAMPUS_COLS = [[0.3, 0.31, 0.33], [0.26, 0.28, 0.3], [0.33, 0.32, 0.3], [0.22, 0.25, 0.27]];
const CONT_COLS = [[0.32, 0.12, 0.08], [0.12, 0.22, 0.24], [0.26, 0.26, 0.24], [0.3, 0.24, 0.1], [0.1, 0.16, 0.1], [0.08, 0.14, 0.28], [0.3, 0.16, 0.05]];
function cbox(x, z, w, d, col, y0) {
  const h = 2.6; y0 = y0 || 0.15;
  solid(x - w / 2, y0, z - d / 2, x + w / 2, y0 + h, z + d / 2, col, AB);
  G.box(x - w / 2 - 0.02, y0 + 0.25, z - d / 2 + 0.25, x + w / 2 + 0.02, y0 + h - 0.25, z + d / 2 - 0.25, col.map((v) => v * 0.78), AB);
}
function floodTall(x, z, h, col) {
  G.box(x - 0.12, 0.15, z - 0.12, x + 0.12, h, z + 0.12, DARK, AB);
  G.box(x - 0.6, h, z - 0.3, x + 0.6, h + 0.35, z + 0.3, col, [K.LAMP, 3, 0, 0]);
  addLight(x, h - 0.5, z, 18, col.map((v) => v * 1.3), 'flood'); blockCells(x - 0.2, z - 0.2, x + 0.2, z + 0.2, true);
}
function genYard(x0, z0, x1, z1) {
  for (let z = z0 + 4; z + 2.4 < z1 - 3; z += 5.6) for (let x = x0 + 3; x + 6 < x1 - 2; x += 6.8) {
    if (rng() < 0.24) continue;
    cbox(x + 3, z + 1.2, 6, 2.4, pick(CONT_COLS)); blockCells(x, z, x + 6, z + 2.4);
    if (rng() < 0.45) cbox(x + 3, z + 1.2, 6, 2.4, pick(CONT_COLS), 2.78);
  }
  floodTall(x0 + 1.5, z0 + 1.5, 9, [1, 0.62, 0.25]);
}
function genLab(x0, z0, x1, z1, outer) {
  G.box(x0 + 3, 0.15, z0 + 3, x1 - 3, 0.17, z1 - 3, [1, 1, 1], [K.DIRT, 0, 0, 0]);
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  G.box(mx - 1, 0.15, z0 + 3, mx + 1, 0.19, z1 - 3, [0.14, 0.14, 0.15], [K.WALK, 0, 0, 0]);
  G.box(x0 + 3, 0.15, mz - 1, x1 - 3, 0.19, mz + 1, [0.14, 0.14, 0.15], [K.WALK, 0, 0, 0]);
  const q = [[x0 + 4, z0 + 4, mx - 2, mz - 2], [mx + 2, z0 + 4, x1 - 4, mz - 2], [x0 + 4, mz + 2, mx - 2, z1 - 4], [mx + 2, mz + 2, x1 - 4, z1 - 4]];
  q.forEach((r, i) => {
    if (!outer && rng() < 0.55) genBuilding(r[0], r[1], r[2], r[3], x0 + 3, z0 + 3, x1 - 3, z1 - 3, false, rr(5, 10));
    else for (let k = 0; k < 2; k++) tree(rr(r[0] + 1.5, r[2] - 1.5), rr(r[1] + 1.5, r[3] - 1.5), rr(0.6, 0.95));
  });
  if (rng() < 0.5) { G.box(mx - 0.25, 0.15, mz - 0.25, mx + 0.25, 3.6, mz + 0.25, DARK, AB); G.box(mx - 0.35, 3.6, mz - 0.35, mx + 0.35, 3.8, mz + 0.35, [0.85, 0.95, 1], [K.LAMP, 2.4, 0, 0]); addLight(mx, 3.3, mz, 9, [0.8, 0.95, 1.1], 'street'); blockCells(mx - 0.3, mz - 0.3, mx + 0.3, mz + 0.3, true); }
}
function pole(x, z, dx, dz) {
  G.box(x - 0.09, 0.15, z - 0.09, x + 0.09, 5.6, z + 0.09, DARK, AB);
  const ax = x + dx * 1.3, az = z + dz * 1.3;
  G.box(Math.min(x, ax) - 0.06, 5.5, Math.min(z, az) - 0.06, Math.max(x, ax) + 0.06, 5.62, Math.max(z, az) + 0.06, DARK, AB);
  G.box(ax - 0.22, 5.3, az - 0.22, ax + 0.22, 5.5, az + 0.22, [1, 0.72, 0.38], [K.LAMP, 3.2, 0, 0]);
  addLight(ax, 5.0, az, 12.5, [1.3, 0.64, 0.27], 'street');
  blockCells(x - 0.2, z - 0.2, x + 0.2, z + 0.2, true);
}

/* ---------------------------------------------------------------- research campus (hand-planned block layout) */
function lawn(x0, z0, x1, z1) { G.box(x0, 0.15, z0, x1, 0.17, z1, [1, 1, 1], [K.DIRT, 0, 0, 0]); setGround(x0, z0, x1, z1, 0.18); }
function path(x0, z0, x1, z1) { G.box(x0, 0.15, z0, x1, 0.19, z1, [0.15, 0.15, 0.16], [K.WALK, 0, 0, 0]); setGround(x0, z0, x1, z1, 0.195); }
function lampPost(x, z, col) { G.box(x - 0.08, 0.15, z - 0.08, x + 0.08, 3.4, z + 0.08, DARK, AB); G.box(x - 0.22, 3.4, z - 0.22, x + 0.22, 3.6, z + 0.22, col || [0.85, 0.95, 1], [K.LAMP, 2.4, 0, 0]); addLight(x, 3.1, z, 8, (col || [0.85, 0.95, 1]).map((v) => v * 1.1), 'street'); blockCells(x - 0.15, z - 0.15, x + 0.15, z + 0.15, true); }
function bench(x, z, ax) { if (ax) G.box(x - 0.9, 0.15, z - 0.25, x + 0.9, 0.6, z + 0.25, [0.22, 0.16, 0.1], AB); else G.box(x - 0.25, 0.15, z - 0.9, x + 0.25, 0.6, z + 0.9, [0.22, 0.16, 0.1], AB); }
function genPark(x0, z0, x1, z1, bi, bj) {
  lawn(x0 + 1, z0 + 1, x1 - 1, z1 - 1);
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  path(x0 + 1, mz - 0.9, x1 - 1, mz + 0.9); path(mx - 0.9, z0 + 1, mx + 0.9, z1 - 1);
  if ((bi + bj) % 2 === 0) {
    const r = 5.2; G.box(mx - r, 0.15, mz - r, mx + r, 0.2, mz + r, [0.18, 0.18, 0.19], AB);
    G.box(mx - r + 0.6, 0.2, mz - r + 0.6, mx + r - 0.6, 0.21, mz + r - 0.6, [1, 1, 1], [K.WATER, 0, 0, 0]);
    G.box(mx - 0.4, 0.2, mz - 0.4, mx + 0.4, 1.4, mz + 0.4, [0.5, 0.52, 0.55], AB); G.box(mx - 0.15, 1.4, mz - 0.15, mx + 0.15, 1.7, mz + 0.15, [0.4, 0.9, 1], [K.LAMP, 1.6, 0, 0]);
    addLight(mx, 1.5, mz, 7, [0.4, 0.9, 1.1], 'neon');
    blockCells(mx - r, mz - r, mx + r, mz + r, true);
  }
  for (const [qx, qz] of [[x0 + 4, z0 + 4], [x1 - 4, z0 + 4], [x0 + 4, z1 - 4], [x1 - 4, z1 - 4]]) for (let k = 0; k < 2; k++) tree(qx + rr(-2, 2), qz + rr(-2, 2), rr(0.7, 1.05));
  bench(mx - 4, mz - 1.6, true); bench(mx + 4, mz + 1.6, true);
  lampPost(mx - 2.2, z0 + 3); lampPost(mx + 2.2, z1 - 3);
}
function genGreen(x0, z0, x1, z1) {
  lawn(x0 + 1, z0 + 1, x1 - 1, z1 - 1);
  path(x0 + 1, z0 + 1, x1 - 1, z0 + 2.6); path(x0 + 1, z1 - 2.6, x1 - 1, z1 - 1);
  for (let i = 0; i < 9; i++) tree(rr(x0 + 3, x1 - 3), rr(z0 + 4, z1 - 4), rr(0.75, 1.15));
  lampPost((x0 + x1) / 2, (z0 + z1) / 2);
}
function genCampusLab(x0, z0, x1, z1) {
  const ix0 = x0 + 3, iz0 = z0 + 3, ix1 = x1 - 3, iz1 = z1 - 3, h = Math.round(rr(8, 13)), w = 6.5, col = pick(CAMPUS_COLS), sd = rng();
  const open = Math.floor(rng() * 4);
  lawn(ix0 + w, iz0 + w, ix1 - w, iz1 - w); tree((ix0 + ix1) / 2, (iz0 + iz1) / 2, 0.9);
  const wings = [[ix0, iz0, ix1, iz0 + w], [ix0, iz1 - w, ix1, iz1], [ix0, iz0 + w, ix0 + w, iz1 - w], [ix1 - w, iz0 + w, ix1, iz1 - w]];
  wings.forEach((b, i) => { if (i === open) return; const hh = i < 2 ? h : h - 2; solid(b[0], 0, b[1], b[2], hh, b[3], col, [K.BLDG, 0, (sd + i * 0.13) % 1, 1]); blockCells(b[0], b[1], b[2], b[3]); G.box(b[0], hh, b[1], b[2], hh + 0.35, b[3], col.map((v) => v * 0.7), AB); });
  const sx = open === 2 ? ix0 - 0.05 : open === 3 ? ix1 + 0.05 : (ix0 + ix1) / 2, sz = open === 0 ? iz0 - 0.05 : open === 1 ? iz1 + 0.05 : (iz0 + iz1) / 2;
  if (open < 2) G.box(ix0 + 1, 2.4, sz - 0.08, ix1 - 1, 2.8, sz + 0.08, [0.85, 0.95, 1], [K.NEON, 1.4, sd, 0]); else G.box(sx - 0.08, 2.4, iz0 + 1, sx + 0.08, 2.8, iz1 - 1, [0.85, 0.95, 1], [K.NEON, 1.4, sd, 0]);
  addLight((ix0 + ix1) / 2, 3, (iz0 + iz1) / 2, 12, [0.8, 0.95, 1.1], 'neon');
}
function genDorm(x0, z0, x1, z1) {
  lawn(x0 + 1, z0 + 1, x1 - 1, z1 - 1);
  const mx = (x0 + x1) / 2;
  genBuilding(x0 + 3, z0 + 3, mx - 1.5, z1 - 3, x0 + 3, z0 + 3, x1 - 3, z1 - 3, false, rr(18, 26));
  genBuilding(mx + 1.5, z0 + 3, x1 - 3, z1 - 3, x0 + 3, z0 + 3, x1 - 3, z1 - 3, false, rr(14, 22));
}
function genParking(x0, z0, x1, z1) {
  const ix0 = x0 + 3, iz0 = z0 + 3, ix1 = x1 - 3, iz1 = z1 - 3, col = [0.22, 0.22, 0.24];
  for (let lv = 1; lv <= 3; lv++) { const y = lv * 3; G.box(ix0, y - 0.3, iz0, ix1, y, iz1, col, AB); G.box(ix0, y, iz0, ix1, y + 0.9, iz0 + 0.2, col, AB); G.box(ix0, y, iz1 - 0.2, ix1, y + 0.9, iz1, col, AB); G.box(ix0 + 0.2, y - 0.45, iz0 + 0.3, ix1 - 0.2, y - 0.3, iz0 + 0.45, [1, 0.62, 0.18], [K.NEON, 0.9, 0.3, 0]); }
  for (let x = ix0; x <= ix1 + 0.01; x += (ix1 - ix0) / 4) for (let z = iz0; z <= iz1 + 0.01; z += (iz1 - iz0) / 3) { G.box(x - 0.3, 0, z - 0.3, x + 0.3, 9, z + 0.3, col.map((v) => v * 0.8), AB); blockCells(x - 0.35, z - 0.35, x + 0.35, z + 0.35); }
  for (let lv = 0; lv <= 3; lv++) for (let i = 0; i < 5; i++) { if (rng() < 0.4) continue; const x = ix0 + 2 + i * (ix1 - ix0 - 4) / 4, z = rng() < 0.5 ? iz0 + 3 : iz1 - 3, y = lv * 3 + (lv ? 0 : 0.15); G.box(x - 0.9, y + 0.3, z - 2, x + 0.9, y + 1.1, z + 2, pick(CAR_COLS_S), AB); G.box(x - 0.8, y + 1.1, z - 1, x + 0.8, y + 1.5, z + 1, [0.08, 0.1, 0.13], AB); }
  WORLD.edges.push([ix0, 0, iz0, ix1, 9, iz1]); WORLD.solids.push([ix0, 2.7, iz0, ix1, 9, iz1]);
  addLight((ix0 + ix1) / 2, 2.4, (iz0 + iz1) / 2, 12, [1.2, 0.85, 0.45], 'flood');
}
const CAR_COLS_S = [[0.6, 0.6, 0.62], [0.14, 0.14, 0.16], [0.45, 0.08, 0.08], [0.1, 0.2, 0.38], [0.18, 0.3, 0.26]];
function genField(x0, z0, x1, z1) {
  lawn(x0 + 1, z0 + 1, x1 - 1, z1 - 1);
  const W = [0.8, 0.82, 0.84], a = x0 + 4, b = x1 - 4, c = z0 + 4, d = z1 - 4, mz = (z0 + z1) / 2;
  for (const [p, q, r, s] of [[a, c, b, c + 0.12], [a, d - 0.12, b, d], [a, c, a + 0.12, d], [b - 0.12, c, b, d], [a, mz - 0.06, b, mz + 0.06]]) G.box(p, 0.17, q, r, 0.18, s, W, AB);
  for (const [x, z] of [[a - 1.5, c - 1.5], [b + 1.5, c - 1.5], [a - 1.5, d + 1.5], [b + 1.5, d + 1.5]]) floodPole(x, z, 9, [0.9, 0.95, 1]);
  G.box((a + b) / 2 - 1.8, 0.17, c, (a + b) / 2 + 1.8, 2.2, c + 0.1, [0.85, 0.85, 0.88], AB); G.box((a + b) / 2 - 1.8, 0.17, d - 0.1, (a + b) / 2 + 1.8, 2.2, d, [0.85, 0.85, 0.88], AB);
}
