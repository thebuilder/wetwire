/* ================================================================ level framework
   A level is data: a road network (polylines with widths), zones (rects handed to named zone
   generators), features (named set pieces), spots (named points missions refer to) and a lot
   filler (fills every leftover lot between roads). The engine turns that into geometry, a car
   graph, a sidewalk graph for pedestrians, a ground height raster and the walk grid.
   To add a level: defineLevel('id', { ... }) in levels.js, reusing or registering generators. */
const LEVELS = {}, ZONES = {}, FILLERS = {}, FEATURES = {};
const AIR = { runway: 1, taxi: 1 };   // paved for aircraft: no traffic, no pavements, no street lamps
function defineLevel(id, def) { def.id = id; LEVELS[id] = def; }
const LE = 56, LS = GW + 2 * LE;               // the raster extends LE metres beyond the play area on every side
const C_LOT = 0, C_ROAD = 1, C_WALK = 2, C_ZONE = 3, C_VOID = 4, C_USED = 5;
let CTX = new Uint8Array(LS * LS), GHX = new Float32Array(LS * LS);
let RN = null, PEDS = null, LEVEL = null;
const lci = (x, z) => { const ix = Math.floor(x) + LE, iz = Math.floor(z) + LE; return ix < 0 || iz < 0 || ix >= LS || iz >= LS ? -1 : iz * LS + ix; };
function ghAt(x, z) { const i = lci(x, z); return i < 0 ? 0 : GHX[i]; }
function setGround(x0, z0, x1, z1, h) { for (let z = Math.floor(z0); z < Math.ceil(z1); z++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) { const i = lci(x + 0.5, z + 0.5); if (i >= 0) GHX[i] = h; } }
function inPlay(x, z, m) { const b = LEVEL ? LEVEL.bounds : [0, 0, GW, GW]; m = m || 0; return x >= b[0] + m && z >= b[1] + m && x <= b[2] - m && z <= b[3] - m; }
/* tilted quad helper: centre, length along dir, width, angle */
function rquad(cx, cz, len, wid, th, y, col, aux) {
  const dx = Math.cos(th), dz = Math.sin(th), nx = -dz, nz = dx, hl = len / 2, hw = wid / 2;
  const p = (a, b) => [cx + dx * a + nx * b, y, cz + dz * a + nz * b];
  G.quad(p(-hl, hw), p(hl, hw), p(hl, -hw), p(-hl, -hw), [0, 1, 0], col, aux);
}

/* ---------------------------------------------------------------- road network */
function segHit(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-6) return null;
  const qp = [c[0] - a[0], c[1] - a[1]], t = (qp[0] * s[1] - qp[1] * s[0]) / den, u = (qp[0] * r[1] - qp[1] * r[0]) / den;
  const e = 1e-4; if (t < -e || t > 1 + e || u < -e || u > 1 + e) return null;
  return { t: clamp(t, 0, 1), u: clamp(u, 0, 1), p: [a[0] + r[0] * t, a[1] + r[1] * t] };
}
function buildRoadNet(roads) {
  const segs = [];
  for (const r of roads) for (let i = 0; i < r.pts.length - 1; i++) segs.push({ a: r.pts[i], b: r.pts[i + 1], w: r.w, kind: r.kind || 'street', cuts: [0, 1] });
  // snap endpoints that stop just short of (or just past) another road onto it, so authors can be sloppy
  for (const s of segs) for (const k of ['a', 'b']) {
    const p = s[k]; let best = null, bd = 2.5;
    for (const o of segs) {
      if (o === s) continue;
      const dx = o.b[0] - o.a[0], dz = o.b[1] - o.a[1], l2 = dx * dx + dz * dz, t = ((p[0] - o.a[0]) * dx + (p[1] - o.a[1]) * dz) / l2;
      if (t < 0.02 || t > 0.98) continue;
      const q = [o.a[0] + dx * t, o.a[1] + dz * t], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < bd) { bd = d; best = q; }
    }
    if (best) { const q = [best[0], best[1]]; if (k === 'a') s.a = q; else s.b = q; }
  }
  // split at crossings and T-junctions (an endpoint lying on another segment)
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const h = segHit(segs[i].a, segs[i].b, segs[j].a, segs[j].b); if (!h) continue;
    segs[i].cuts.push(h.t); segs[j].cuts.push(h.u);
  }
  const nodes = [], findNode = (p) => { for (let k = 0; k < nodes.length; k++) if (Math.hypot(nodes[k].x - p[0], nodes[k].z - p[1]) < 1.2) return k; nodes.push({ x: p[0], z: p[1], adj: [], padj: [], r: 0, edges: [] }); return nodes.length - 1; };
  const edges = [];
  for (const s of segs) {
    const cuts = [...new Set(s.cuts.map((t) => Math.round(t * 1e4) / 1e4))].sort((x, y) => x - y);
    for (let k = 0; k < cuts.length - 1; k++) {
      const pa = [lerp(s.a[0], s.b[0], cuts[k]), lerp(s.a[1], s.b[1], cuts[k])], pb = [lerp(s.a[0], s.b[0], cuts[k + 1]), lerp(s.a[1], s.b[1], cuts[k + 1])];
      if (Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) < 1) continue;
      const a = findNode(pa), b = findNode(pb); if (a === b) continue;
      if (edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))) continue;
      const len = Math.hypot(nodes[b].x - nodes[a].x, nodes[b].z - nodes[a].z), th = Math.atan2(nodes[b].z - nodes[a].z, nodes[b].x - nodes[a].x);
      const e = { a, b, w: s.w, kind: s.kind, len, th, id: edges.length }; edges.push(e);
      for (const [n, o] of [[a, b], [b, a]]) { nodes[n].padj.push(o); nodes[n].edges.push(e); if (!AIR[s.kind] && s.kind !== 'alley' && s.kind !== 'path') nodes[n].adj.push(o); nodes[n].r = Math.max(nodes[n].r, s.w / 2); }
    }
  }
  for (const n of nodes) n.deg = n.padj.length;
  // how far each edge stops short of a junction: enough to clear the crossing road at its real angle
  const street = (e) => e.kind !== 'alley' && e.kind !== 'path' && !AIR[e.kind], SWO = (e) => e.kind === 'path' ? 0 : e.kind === 'alley' ? 0.5 : AIR[e.kind] ? e.w / 2 : e.w / 2 + 1.5;
  for (const e of edges) { e.trim = [0, 0]; e.ptrim = [0, 0]; }
  nodes.forEach((n, ni) => {
    if (n.deg < 3) return;
    for (const e of n.edges) {
      const end = e.a === ni ? 0 : 1, u = end ? [-Math.cos(e.th), -Math.sin(e.th)] : [Math.cos(e.th), Math.sin(e.th)];
      let tr = 0, tp = 0;
      for (const f of n.edges) {
        if (f === e) continue;
        const v = f.a === ni ? [Math.cos(f.th), Math.sin(f.th)] : [-Math.cos(f.th), -Math.sin(f.th)];
        const c = Math.abs(u[0] * v[0] + u[1] * v[1]), sn = Math.abs(u[0] * v[1] - u[1] * v[0]);
        if (sn < 0.3) continue;
        if (f.kind !== 'path' && (street(f) || !street(e))) tr = Math.max(tr, (f.w / 2) / sn + (e.w / 2) * c / sn + 0.3);
        tp = Math.max(tp, SWO(f) / sn + SWO(e) * c / sn);
      }
      e.trim[end] = Math.min(tr, e.len / 2 - 0.5); e.ptrim[end] = Math.min(tp, e.len / 2 - 0.5);
    }
    n.streets = n.edges.filter(street).length;
  });
  const exits = nodes.map((n, i) => i).filter((i) => nodes[i].adj.length === 1 && !inPlay(nodes[i].x, nodes[i].z, -4));
  return { nodes, edges, exits };
}
const edgeOf = (a, b) => RN.nodes[a].edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));

/* ---------------------------------------------------------------- rasterize roads, sidewalks, zones, voids */
function rasterize(L) {
  CTX.fill(C_LOT); GHX.fill(0.15);
  const SWW = (e) => e.kind === 'alley' ? 0.8 : e.kind === 'path' || AIR[e.kind] ? 0 : 3;
  for (const e of RN.edges) {
    const A = RN.nodes[e.a], Bn = RN.nodes[e.b], pad = e.w / 2 + SWW(e) + 1;
    const x0 = Math.floor(Math.min(A.x, Bn.x) - pad), x1 = Math.ceil(Math.max(A.x, Bn.x) + pad), z0 = Math.floor(Math.min(A.z, Bn.z) - pad), z1 = Math.ceil(Math.max(A.z, Bn.z) + pad);
    const dx = Bn.x - A.x, dz = Bn.z - A.z, l2 = dx * dx + dz * dz;
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      const i = lci(x + 0.5, z + 0.5); if (i < 0) continue;
      const tu = ((x + 0.5 - A.x) * dx + (z + 0.5 - A.z) * dz) / l2;
      if ((tu < 0 && A.deg > 2) || (tu > 1 && Bn.deg > 2)) continue;   // flat ends into junctions, round ends at bends and dead ends
      const t = clamp(tu, 0, 1), d = Math.hypot(A.x + dx * t - x - 0.5, A.z + dz * t - z - 0.5);
      if (e.kind === 'path') { if (d <= e.w / 2 && CTX[i] !== C_ROAD) CTX[i] = C_WALK; continue; }
      if (d <= e.w / 2) CTX[i] = C_ROAD; else if (d <= e.w / 2 + SWW(e) && CTX[i] !== C_ROAD) CTX[i] = C_WALK;
    }
  }
  for (const n of RN.nodes) {
    if (!(n.deg === 1 && n.adj.length && inPlay(n.x, n.z, 4))) continue;
    const R = n.r + 2.5; n.cul = R;
    for (let z = Math.floor(n.z - R - 3); z < n.z + R + 3; z++) for (let x = Math.floor(n.x - R - 3); x < n.x + R + 3; x++) {
      const i = lci(x + 0.5, z + 0.5); if (i < 0) continue; const d = Math.hypot(x + 0.5 - n.x, z + 0.5 - n.z);
      if (d <= R) CTX[i] = C_ROAD; else if (d <= R + 3 && CTX[i] === C_LOT) CTX[i] = C_WALK;
    }
  }
  for (const v of L.voids || []) for (let z = Math.floor(v[1]); z < v[3]; z++) for (let x = Math.floor(v[0]); x < v[2]; x++) { const i = lci(x + 0.5, z + 0.5); if (i >= 0 && CTX[i] === C_LOT) CTX[i] = C_VOID; }
  for (const zn of L.zones || []) { const r = zn.rect; for (let z = Math.floor(r[1]); z < r[3]; z++) for (let x = Math.floor(r[0]); x < r[2]; x++) { const i = lci(x + 0.5, z + 0.5); if (i >= 0 && CTX[i] === C_LOT) CTX[i] = C_ZONE; } }
  for (let i = 0; i < LS * LS; i++) if (CTX[i] === C_ROAD || CTX[i] === C_VOID) GHX[i] = 0;
  if (L.raster) L.raster();
}
/* greedy rectangle cover of cells matching a test; calls fn(x0,z0,x1,z1) in world metres */
function coverRects(test, maxW, maxH, fn, mark) {
  const used = new Uint8Array(LS * LS);
  for (let iz = 0; iz < LS; iz++) for (let ix = 0; ix < LS; ix++) {
    const i = iz * LS + ix; if (used[i] || !test(i)) continue;
    let w = 1; while (ix + w < LS && w < maxW && !used[i + w] && test(i + w)) w++;
    let h = 1; grow: while (iz + h < LS && h < maxH) { for (let k = 0; k < w; k++) { const j = (iz + h) * LS + ix + k; if (used[j] || !test(j)) break grow; } h++; }
    for (let a = 0; a < h; a++) for (let k = 0; k < w; k++) used[(iz + a) * LS + ix + k] = 1;
    if (mark) for (let a = 0; a < h; a++) for (let k = 0; k < w; k++) CTX[(iz + a) * LS + ix + k] = mark;
    fn(ix - LE, iz - LE, ix - LE + w, iz - LE + h);
  }
}

/* ---------------------------------------------------------------- sidewalk graph for pedestrians */
function buildPeds() {
  const segs = [], ends = [];
  for (const e of RN.edges) {
    const A = RN.nodes[e.a], Bn = RN.nodes[e.b], d = [Math.cos(e.th), Math.sin(e.th)], n = [-d[1], d[0]];
    const ta = e.ptrim[0], tb = e.len - e.ptrim[1]; if (tb - ta < 2) continue;
    if (AIR[e.kind]) continue;
    const offs = e.kind === 'alley' || e.kind === 'path' ? [0] : [e.w / 2 + 1.5, -(e.w / 2 + 1.5)];
    for (const o of offs) {
      const p0 = [A.x + d[0] * ta + n[0] * o, A.z + d[1] * ta + n[1] * o], p1 = [A.x + d[0] * tb + n[0] * o, A.z + d[1] * tb + n[1] * o];
      const s = { p0, p1, len: Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), links: [[], []], na: e.a, nb: e.b, side: o, inside: inPlay(p0[0], p0[1], 2) && inPlay(p1[0], p1[1], 2) };
      segs.push(s); ends.push({ s: segs.length - 1, end: 0, node: e.a, p: p0 }, { s: segs.length - 1, end: 1, node: e.b, p: p1 });
    }
  }
  const byNode = {};
  for (const en of ends) (byNode[en.node] = byNode[en.node] || []).push(en);
  for (const k in byNode) {
    const g = byNode[k];
    for (const en of g) {
      const cand = g.filter((o) => o.s !== en.s).map((o) => ({ o, d: Math.hypot(o.p[0] - en.p[0], o.p[1] - en.p[1]) })).sort((x, y) => x.d - y.d).slice(0, 3);
      for (const c of cand) segs[en.s].links[en.end].push([c.o.s, c.o.end]);
      if (!cand.length) { const twin = segs.findIndex((s, i) => i !== en.s && s.na === segs[en.s].na && s.nb === segs[en.s].nb); if (twin >= 0) segs[en.s].links[en.end].push([twin, en.end]); }
    }
  }
  return segs;
}
function pedPos(seg, s) { const g = PEDS[seg], f = clamp(s / g.len, 0, 1); return [lerp(g.p0[0], g.p1[0], f), lerp(g.p0[1], g.p1[1], f), (g.p1[0] - g.p0[0]) / g.len, (g.p1[1] - g.p0[1]) / g.len]; }
function nearestPed(x, z, insideOnly) {
  let best = -1, bd = 1e9, bs = 0;
  PEDS.forEach((g, i) => {
    if (insideOnly && !g.inside) return;
    const dx = g.p1[0] - g.p0[0], dz = g.p1[1] - g.p0[1], t = clamp(((x - g.p0[0]) * dx + (z - g.p0[1]) * dz) / (g.len * g.len), 0, 1);
    const d = Math.hypot(g.p0[0] + dx * t - x, g.p0[1] + dz * t - z); if (d < bd) { bd = d; best = i; bs = t * g.len; }
  });
  return [best, bs];
}
function randomPed() { const ins = PEDS.map((g, i) => i).filter((i) => PEDS[i].inside); const i = Rpick(ins); return [i, R() * PEDS[i].len]; }

/* ---------------------------------------------------------------- geometry for roads */
function drawRoads(L) {
  const PA = [K.RROAD, 0, 0, -1], a0 = -LE, a1 = GW + LE, F = 500;
  coverRects((i) => CTX[i] === C_ROAD, 60, 60, (x0, z0, x1, z1) => G.quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], [0, 1, 0], [1, 1, 1], PA));
  for (const [x0, z0, x1, z1] of [[-F, -F, a1 + F, a0], [-F, a1, a1 + F, a1 + F], [-F, a0, a0, a1], [a1, a0, a1 + F, a1]]) G.quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], [0, 1, 0], [1, 1, 1], PA);
  for (const n of RN.nodes) if (n.cul) G.prism(n.x, n.z, 0.006, 0.012, n.cul * 2, n.cul * 2, n.cul * 2, n.cul * 2, 12, [1, 1, 1], PA);
  for (const e of RN.edges) {
    if (e.kind === 'path') continue;
    const A = RN.nodes[e.a], Bn = RN.nodes[e.b], d = [Math.cos(e.th), Math.sin(e.th)], n = [-d[1], d[0]];
    const ta = e.trim[0], tb = e.len - e.trim[1]; if (tb <= ta) continue;
    const cx = A.x + d[0] * (ta + tb) / 2, cz = A.z + d[1] * (ta + tb) / 2, thr = ((e.th % Math.PI) + Math.PI) % Math.PI, c = -A.x * Math.sin(thr) + A.z * Math.cos(thr);
    rquad(cx, cz, tb - ta, e.w, e.th, 0.012 + (e.id % 4) * 0.002, [1, 1, 1], [K.RROAD, e.kind === 'alley' ? 0.01 : e.w / 2, c, 2 + thr]);
    if (e.kind === 'alley' || AIR[e.kind]) continue;
    for (const [nd, t, s] of [[A, ta, 1], [Bn, tb, -1]]) {
      if ((nd.streets || 0) < 3 || !inPlay(nd.x, nd.z, -10)) continue;
      for (let k = -e.w / 2 + 0.7; k < e.w / 2 - 0.5; k += 1.1) rquad(A.x + d[0] * (t + s * 1.2) + n[0] * k, A.z + d[1] * (t + s * 1.2) + n[1] * k, 1.8, 0.5, e.th, 0.02, [0.55, 0.56, 0.58], AB);
    }
  }
  // walkable ground: sidewalks, lots and zones as merged boxes
  coverRects((i) => CTX[i] === C_WALK || CTX[i] === C_LOT || CTX[i] === C_ZONE, 40, 40, (x0, z0, x1, z1) => G.box(x0, 0, z0, x1, 0.15, z1, [0.12, 0.12, 0.14], [K.WALK, 0, 0, 0]));
  // street lamps along roads, alternating sides
  for (const e of RN.edges) {
    if (e.kind === 'alley' || e.kind === 'path' || AIR[e.kind] || e.len < 14) continue;
    const A = RN.nodes[e.a], d = [Math.cos(e.th), Math.sin(e.th)], n = [-d[1], d[0]];
    let side = 1;
    for (let t = Math.max(8, e.trim[0] + 3); t < e.len - Math.max(6, e.trim[1] + 3); t += L.lampGap || 18) {
      const o = (e.w / 2 + 0.7) * side, x = A.x + d[0] * t + n[0] * o, z = A.z + d[1] * t + n[1] * o;
      const i = lci(x, z); if (i >= 0 && CTX[i] === C_WALK) pole(x, z, -n[0] * side, -n[1] * side);
      side = -side;
    }
  }
}
function placeUplinks(L) {
  let k = 0;
  const cand = RN.nodes.map((n, i) => i).filter((i) => RN.nodes[i].deg >= 3 && inPlay(RN.nodes[i].x, RN.nodes[i].z, 8));
  cand.forEach((ni, idx) => {
    if (idx % 2) return;
    const g = PEDS.find((s) => s.na === ni || s.nb === ni); if (!g) return;
    const p = g.na === ni ? g.p0 : g.p1, n = RN.nodes[ni], dd = Math.hypot(p[0] - n.x, p[1] - n.z) || 1, ox = (p[0] - n.x) / dd, oz = (p[1] - n.z) / dd;
    const x = p[0] + ox * 1.2, z = p[1] + oz * 1.2;
    G.box(x - 0.25, 0.15, z - 0.25, x + 0.25, 1.9, z + 0.25, [0.18, 0.19, 0.22], AB);
    G.box(x - 0.18, 1.2, z - 0.27, x + 0.18, 1.6, z + 0.27, [0.3, 1, 0.85], [K.LAMP, 1.6, 0, 0]);
    blockCells(x - 0.25, z - 0.25, x + 0.25, z + 0.25);
    WORLD.uplinks.push({ x: x - ox * 0.9, z: z - oz * 0.9, r: 42, label: (L.uplinkName || 'PAYPHONE') + ' ' + (110 + k++), trace: 0, burn: 0, agent: null });
  });
  cand.forEach((ni, i) => { const n = RN.nodes[ni]; WORLD.nodes.push({ type: 'grid', level: 'civil', x: n.x, y: 5.5, z: n.z, label: 'GRID LUM-' + (10 + i) }); });
}

/* ---------------------------------------------------------------- build */
function buildLevel(L) {
  LEVEL = L; DISTRICT = L.style || 'downtown'; SEED = L.seed || 1;
  RN = buildRoadNet(L.roads);
  rasterize(L);
  PEDS = buildPeds();
  drawRoads(L);
  // which sides of a rect face a street or sidewalk
  const openOf = (x0, z0, x1, z1) => {
    const hit = (x, z) => { const i = lci(x, z); return i >= 0 && (CTX[i] === C_WALK || CTX[i] === C_ROAD); };
    const any = (f, n) => { for (let k = 0; k < n; k++) if (f(k + 0.5)) return true; return false; };
    return { w: any((k) => hit(x0 - 0.5, z0 + k), z1 - z0), e: any((k) => hit(x1 + 0.5, z0 + k), z1 - z0), n: any((k) => hit(x0 + k, z0 - 0.5), x1 - x0), s: any((k) => hit(x0 + k, z1 + 0.5), x1 - x0) };
  };
  for (const zn of L.zones || []) { const r = zn.rect, f = ZONES[zn.type]; zn.open = Object.assign(openOf(r[0], r[1], r[2], r[3]), zn.open || {}); if (f) f(r[0], r[1], r[2], r[3], zn); }
  const fill = FILLERS[L.fill] || FILLERS.downtown, b = L.bounds;
  const core = L.core || [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  coverRects((i) => CTX[i] === C_LOT, L.lotMax || 22, L.lotMax || 22, (x0, z0, x1, z1) => {
    const inside = x1 > b[0] && x0 < b[2] && z1 > b[1] && z0 < b[3];
    fill(x0, z0, x1, z1, { inside, dist: Math.hypot((x0 + x1) / 2 - core[0], (z0 + z1) / 2 - core[1]), w: x1 - x0, d: z1 - z0, open: openOf(x0, z0, x1, z1) });
  }, C_USED);
  for (const ft of L.features || []) { const f = FEATURES[ft.type]; if (f) f(ft); }
  // copy ground and void cells into the play grid; everything outside the bounds is out of reach
  for (let z = 0; z < GW; z++) for (let x = 0; x < GW; x++) {
    const i = lci(x + 0.5, z + 0.5), g = z * GW + x;
    if (CTX[i] === C_VOID || !inPlay(x + 0.5, z + 0.5)) { walk[g] = 0; }
  }
  placeUplinks(L);
  for (const b of WORLD.boards) WORLD.nodes.push({ type: 'board', level: 'civil', x: b.x, y: b.y, z: b.z, ref: b, label: 'ADNET ' + Math.floor(b.seed * 900 + 100) });
  WORLD.cams.forEach((c, i) => WORLD.nodes.push({ type: 'cam', level: 'sec', x: c.x, y: c.y, z: c.z, ref: c, label: 'CCTV-' + (i + 10) }));
}
