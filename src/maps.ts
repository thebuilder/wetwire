// The contract and territory maps, drawn as vectors into a bitmap with each colour's brightness in the
// channel the CRT reads for its hue: red for phosphor, green for alert, blue for accent.
import { TAU } from './core';
import { GW } from './world_head';
import { CX0, CX1, CZ0, CZ1, ROADX } from './world_build';
import { LEVEL, LEVELS, buildRoadNet, setLEVEL } from './layout';
import { MISSIONS, SAVE } from './campaign';
import { TERR, hasIntel, terrOf } from './missions';

const cache = new Map<string, HTMLCanvasElement>();
function cached(key: string, w: number, h: number, draw: (c: HTMLCanvasElement) => void) {
  const k = key + '|' + w + 'x' + h; let c = cache.get(k);
  if (!c) { if (cache.size > 32) cache.clear(); c = document.createElement('canvas'); c.width = w; c.height = h; draw(c); cache.set(k, c); }
  return c;
}
export const briefBitmap = (def, w: number, h: number) => cached('brief:' + def.id + ':' + hasIntel(def), w, h, (c) => drawBriefMap(c, def));
/* Owned districts change as the game goes on, and a revolt blinks, so the key carries the map's whole state. */
export function terrBitmap(w: number, h: number) {
  const blink = Math.floor(performance.now() / 500) % 2, state = Object.keys(TERR).map((id) => { const t = terrOf(id), m = MISSIONS.find((q) => q.id === id); return t ? (t.revolt ? 'r' + blink : 'o' + t.tax) : m && !(m.need && !SAVE.done[m.need]) ? 'c' : '-'; }).join();
  return cached('terr:' + state, w, h, drawTerrMap);
}

/* ================================================================ briefing map (vector schematic per contract) */
function drawBriefMap(cv, def) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), CW = cv.width / dpr, CH = cv.height / dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, CW, CH);
  const comp = def.world === 'compound';
  const bx0 = comp ? 36 : -6, bx1 = comp ? 190 : GW + 6, bz0 = comp ? 22 : -6, bz1 = comp ? 212 : GW + 6;
  const k = Math.min((CW - 16) / (bx1 - bx0), (CH - 16) / (bz1 - bz0)), ox = (CW - (bx1 - bx0) * k) / 2, oz = (CH - (bz1 - bz0) * k) / 2;
  const X = (x) => Math.round(ox + (x - bx0) * k) + 0.5, Z = (z) => Math.round(oz + (z - bz0) * k) + 0.5;
  const C = { grid: 'rgba(255,0,0,0.10)', line: 'rgba(255,0,0,0.55)', dim: 'rgba(255,0,0,0.25)', fill: 'rgba(255,0,0,0.07)', tgt: '#00ff00', up: '#ff0000', ex: '#0000ff', gd: '#0000ff', txt: '#cc0000' };
  g.lineWidth = 1; g.font = '15px VT323, monospace'; g.textBaseline = 'middle';
  g.strokeStyle = C.grid; g.beginPath();
  for (let x = Math.ceil(bx0 / 10) * 10; x < bx1; x += 10) { g.moveTo(X(x), 0); g.lineTo(X(x), CH); }
  for (let z = Math.ceil(bz0 / 10) * 10; z < bz1; z += 10) { g.moveTo(0, Z(z)); g.lineTo(CW, Z(z)); }
  g.stroke();
  const rect = (x0, z0, x1, z1, st, fl, dash?) => { g.beginPath(); g.rect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0)); if (fl) { g.fillStyle = fl; g.fill(); } if (st) { g.strokeStyle = st; if (dash) g.setLineDash(dash); g.stroke(); g.setLineDash([]); } };
  const seg = (x0, z0, x1, z1, st, dash?) => { g.beginPath(); g.moveTo(X(x0), Z(z0)); g.lineTo(X(x1), Z(z1)); g.strokeStyle = st; if (dash) g.setLineDash(dash); g.stroke(); g.setLineDash([]); };
  const circ = (x, z, r, st, dash) => { g.beginPath(); g.arc(X(x), Z(z), r * k, 0, TAU); g.strokeStyle = st; if (dash) g.setLineDash(dash); g.stroke(); g.setLineDash([]); };
  const dot = (x, z, s, col) => { g.fillStyle = col; g.fillRect(Math.round(X(x) - s / 2), Math.round(Z(z) - s / 2), s, s); };
  const diamond = (x, z, s, col) => { g.beginPath(); g.moveTo(X(x), Z(z) - s); g.lineTo(X(x) + s, Z(z)); g.lineTo(X(x), Z(z) + s); g.lineTo(X(x) - s, Z(z)); g.closePath(); g.strokeStyle = col; g.stroke(); };
  const cross = (x, z, col) => { const px = X(x), pz = Z(z); g.strokeStyle = col; g.beginPath(); g.arc(px, pz, 6, 0, TAU); g.moveTo(px - 10, pz); g.lineTo(px - 3, pz); g.moveTo(px + 3, pz); g.lineTo(px + 10, pz); g.moveTo(px, pz - 10); g.lineTo(px, pz - 3); g.moveTo(px, pz + 3); g.lineTo(px, pz + 10); g.stroke(); };
  const text = (t, x, z, col, dx, dz, al?) => { g.fillStyle = col; g.textAlign = al || 'left'; g.fillText(t, Math.round(X(x) + (dx || 0)), Math.round(Z(z) + (dz || 0))); };
  const uplink = (x, z, r, lab?) => { if (r) circ(x, z, r, 'rgba(255,0,0,0.16)', [2, 4]); g.strokeStyle = C.up; g.strokeRect(Math.round(X(x) - 3) + 0.5, Math.round(Z(z) - 3) + 0.5, 6, 6); if (lab) text(lab, x, z, C.up, 6, 0); };
  if (comp) {
    rect(ROADX - 4, bz0, ROADX + 4, bz1, null, 'rgba(255,0,0,0.07)');
    rect(CX0, CZ0, CX1, CZ1, null, 'rgba(255,0,0,0.04)');
    for (const [a, b] of [[[CX0, CZ0], [108, CZ0]], [[118, CZ0], [CX1, CZ0]], [[CX0, CZ1], [108, CZ1]], [[118, CZ1], [CX1, CZ1]], [[CX0, CZ0], [CX0, 95]], [[CX0, 100], [CX0, CZ1]], [[CX1, CZ0], [CX1, CZ1]]]) seg(a[0], a[1], b[0], b[1], C.line);
    for (const b of [[98, 58, 128, 70], [70, 80, 92, 90], [134, 80, 156, 90], [76, 108, 96, 118], [70, 58, 77, 64], [136, 56, 158, 72]]) rect(b[0], b[1], b[2], b[3], C.dim, C.fill);
    for (const [x, z] of [[66, 56], [160, 56], [66, 144], [160, 144]]) rect(x - 2, z - 2, x + 2, z + 2, C.gd, C.gd);
    if (hasIntel(def)) { cross(113, 73.6, C.tgt); text('RUSK', 113, 73.6, C.tgt, 12, -6); uplink(120, 160.9, 0); uplink(54, 100.9, 0); uplink(80, 67.9, 0); uplink(134, 76.9, 0); }
    else text('TARGET LOCATION: BUY INTEL', 113, 40, C.tgt, 0, 0, 'center');
    rect(113, 193, 116, 199, C.ex, 'rgba(0,0,255,0.35)'); text('VAN', 114.5, 196, C.ex, 8, 0);
  } else {
    const L = LEVELS[def.level], net = briefNet(L);
    for (const v of L.voids || []) rect(v[0], v[1], v[2], v[3], null, 'rgba(255,0,0,0.2)');
    g.lineCap = 'butt';
    for (const r of L.roads) {
      g.beginPath(); r.pts.forEach((p, i) => i ? g.lineTo(X(p[0]), Z(p[1])) : g.moveTo(X(p[0]), Z(p[1])));
      if (r.kind === 'path') { g.strokeStyle = 'rgba(255,0,0,0.18)'; g.lineWidth = 1; g.setLineDash([2, 3]); g.stroke(); g.setLineDash([]); }
      else { g.strokeStyle = r.kind === 'alley' ? 'rgba(255,0,0,0.08)' : 'rgba(255,0,0,0.13)'; g.lineWidth = Math.max(2, (r.w + (r.kind === 'alley' ? 1.6 : 6)) * k); g.stroke(); }
    }
    g.lineWidth = 1;
    for (const n of net.nodes) if (n.cul) { g.beginPath(); g.arc(X(n.x), Z(n.z), (n.r + 5) * k, 0, TAU); g.fillStyle = 'rgba(255,0,0,0.13)'; g.fill(); }
    const ZL = { market: 'MARKET', factory: 'FOUNDRY', terminal: 'CONTAINER YARD', park: 'PARK', field: 'FIELD', parking: 'PARKING', den: 'DEN', apron: 'APRON // VTOL', terminal_air: 'TERMINAL', ctower: 'CONTROL', hangar: 'HANGAR', fuelfarm: 'FUEL FARM' };
    for (const zn of L.zones) {
      const [x0, z0, x1, z1] = zn.rect, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (zn.type === 'plaza') { rect(x0, z0, x1, z1, C.ex, 'rgba(0,0,255,0.12)'); text('EXTRACT', cx, cz, C.ex, 0, 0, 'center'); }
      else if (zn.type === 'tower') { rect(x0, z0, x1, z1, C.tgt, 'rgba(0,255,0,0.1)'); text(def.id === 'courier' ? 'FREIGHT OFFICE' : def.id === 'halden' ? 'MERIDIAN HQ' : 'TOWER', cx, cz, C.tgt, 0, 0, 'center'); }
      else { rect(x0, z0, x1, z1, C.dim, zn.type === 'park' || zn.type === 'field' ? 'rgba(255,0,0,0.18)' : C.fill); if (ZL[zn.type]) text(ZL[zn.type], cx, cz, C.dim, 0, 0, 'center'); }
    }
    const b = L.bounds; rect(b[0], b[1], b[2], b[3], 'rgba(0,255,0,0.35)', null, [4, 4]);
    if (hasIntel(def)) for (const u of net.uplinks) { g.strokeStyle = 'rgba(255,0,0,0.6)'; g.strokeRect(Math.round(X(u[0]) - 2) + 0.5, Math.round(Z(u[1]) - 2) + 0.5, 4, 4); }
    const st = L.spots.start;
    rect(st[0] - 3, st[1] - 3, st[0] + 3, st[1] + 3, C.ex, 'rgba(0,0,255,0.35)'); text('START', st[0], st[1], C.ex, 9, 0);
    const tp = def.spot ? [def.spotLabel, L.spots[def.spot]] : def.id === 'varga' ? ['LIMO', L.spots.limo] : def.id === 'courier' ? ['VAN', L.spots.van] : def.id === 'halden' ? ['HALDEN', L.spots.halden] : null;
    if (tp && hasIntel(def)) { cross(tp[1][0], tp[1][1], C.tgt); text(tp[0], tp[1][0], tp[1][1], C.tgt, -13, 0, 'right'); }
    if (!hasIntel(def)) text('TARGET LOCATION: BUY INTEL', (b[0] + b[2]) / 2, b[3] - 6, C.tgt, 0, 0, 'center');
  }
}
/* road net and payphones for a level without building it, for the briefing map */
const BRIEF: any = {};
function briefNet(L) {
  if (BRIEF[L.id]) return BRIEF[L.id];
  const keep = LEVEL; setLEVEL(L); const net = buildRoadNet(L.roads); setLEVEL(keep);
  for (const n of net.nodes) if (n.deg === 1 && n.adj.length && inPlayB(L, n.x, n.z, 4)) n.cul = 1;
  const cand = net.nodes.filter((n) => n.deg >= 3 && inPlayB(L, n.x, n.z, 8));
  return (BRIEF[L.id] = { nodes: net.nodes, uplinks: cand.filter((n, i) => i % 2 === 0).map((n) => [n.x, n.z]) });
}
const inPlayB = (L, x, z, m) => x >= L.bounds[0] + m && z >= L.bounds[1] + m && x <= L.bounds[2] - m && z <= L.bounds[3] - m;


function drawTerrMap(cv) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.width / dpr, H = cv.height / dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const k = Math.min(W / 100, H / 100), ox = (W - 100 * k) / 2, oy = (H - 100 * k) / 2;
  g.fillStyle = 'rgba(255,0,0,0.05)'; g.fillRect(ox + 72 * k, oy + 60 * k, 28 * k, 40 * k); g.fillRect(ox, oy + 96 * k, 100 * k, 4 * k);
  g.strokeStyle = 'rgba(255,0,0,0.07)'; g.beginPath(); for (let i = 0; i <= 100; i += 5) { g.moveTo(ox + i * k, oy); g.lineTo(ox + i * k, oy + 100 * k); g.moveTo(ox, oy + i * k); g.lineTo(ox + 100 * k, oy + i * k); } g.stroke();
  g.font = '15px VT323, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const id in TERR) {
    const T = TERR[id], [x, y, w, h] = T.r, t = terrOf(id), m = MISSIONS.find((q) => q.id === id), open = !t && m && !(m.need && !SAVE.done[m.need]);
    const px = ox + x * k, py = oy + y * k, pw = w * k, ph = h * k;
    g.fillStyle = t ? (t.revolt ? (Math.floor(performance.now() / 500) % 2 ? 'rgba(0,255,0,0.35)' : 'rgba(0,255,0,0.18)') : 'rgba(255,0,0,0.35)') : 'rgba(255,0,0,0.04)';
    g.fillRect(px + 1, py + 1, pw - 2, ph - 2);
    g.strokeStyle = t ? (t.revolt ? '#00ff00' : '#ff0000') : open ? '#0000ff' : 'rgba(255,0,0,0.2)'; g.lineWidth = 1; g.strokeRect(px + 1.5, py + 1.5, pw - 3, ph - 3);
    const lab = t || open ? T.name.toUpperCase() : 'UNKNOWN'; let fs = 15; g.font = fs + 'px VT323, monospace'; while (fs > 10 && g.measureText(lab).width > pw - 8) { fs--; g.font = fs + 'px VT323, monospace'; }
    g.fillStyle = t ? '#cc0000' : open ? '#0000ff' : 'rgba(255,0,0,0.35)'; g.fillText(lab, px + pw / 2, py + ph / 2 - 6);
    g.fillStyle = 'rgba(255,0,0,0.5)'; g.fillText(t ? (t.revolt ? 'REVOLT' : t.tax + '% TAX') : open ? 'CONTRACT ' + m.code : '', px + pw / 2, py + ph / 2 + 9);
  }
}
