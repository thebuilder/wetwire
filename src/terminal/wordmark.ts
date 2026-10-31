// The WETWIRE wordmark as live pixels: letters built from circuit traces, with pulses running along their
// wires, a rim light sweeping the edges, pixels bleeding and dripping off the bottoms, and the odd glitch.
// Brightness goes in the colour channel the CRT reads for each hue: WET in phosphor, WIRE in alert, the rim in accent.
// On the title it also has an intro: a circuit board routes itself across the screen, current reaches the word and
// traces each letter, and WET and WIRE meet in the middle in a flash of sparks.

type Pt = [number, number];
const STROKE = 6, GAP = 7, MX = 42, TOP = 7, LETTER_H = 37, W = 356, H = 76;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
/* The intro timeline, in seconds. */
const WIRES_AT = 1.35, FLASH_AT = 2.85;
export const INTRO_END = 3.5;
/* When each letter starts tracing and how long it takes: WET from the left, WIRE from the right, meeting in the middle. */
const LETTER_T: [number, number][] = [[1.7, 0.42], [1.98, 0.4], [2.26, 0.4], [2.34, 0.42], [2.2, 0.2], [1.92, 0.4], [1.68, 0.42]];

/* Each letter is a few polylines, stamped with a square brush so diagonals come out as chamfered traces. */
const GLYPHS: Record<string, { w: number; lines: Pt[][]; pads?: Pt[] }> = {
  W: { w: 32, lines: [[[0, 0], [0, 24], [7, 31], [15, 23], [15, 11]], [[15, 23], [23, 31], [30, 24], [30, 0]]] },
  E: { w: 26, lines: [[[24, 0], [6, 0], [0, 6], [0, 25], [6, 31], [24, 31]], [[0, 15], [13, 15]]], pads: [[19, 15]] },
  T: { w: 28, lines: [[[0, 0], [26, 0]], [[13, 0], [13, 25], [19, 31]]], pads: [[24, 31]] },
  I: { w: 6, lines: [[[0, 9], [0, 31]]], pads: [[0, 0]] },
  R: { w: 26, lines: [[[0, 31], [0, 0], [18, 0], [24, 6], [24, 10], [18, 16], [0, 16]], [[11, 16], [24, 31]]] },
};
const WORD: [string, number][] = [['W', 0], ['E', 0], ['T', 0], ['W', 1], ['I', 1], ['R', 1], ['E', 1]];

const mask = new Int8Array(W * H).fill(-1);
/* When each pixel gets traced, and where the current is at any moment, for the intro's sparks. */
const reveal = new Float32Array(W * H).fill(1e9);
const heads: { x: number; y: number; t: number; hue: number }[] = [];
const idx = (x: number, y: number) => y * W + x;
function stamp(x: number, y: number, size: number, hue: number, when: number) {
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) { const px = x + i, py = y + j; if (px >= 0 && py >= 0 && px < W && py < H) { const k = idx(px, py); mask[k] = hue; reveal[k] = Math.min(reveal[k], when); } }
}
function line(a: Pt, b: Pt, visit: (x: number, y: number) => void) {
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  for (let i = 0; i <= n; i++) visit(Math.round(a[0] + ((b[0] - a[0]) * i) / (n || 1)), Math.round(a[1] + ((b[1] - a[1]) * i) / (n || 1)));
}
const totalW = WORD.reduce((n, [c]) => n + GLYPHS[c].w + STROKE + GAP, -GAP);
{
  let cx = Math.round((W - totalW) / 2);
  WORD.forEach(([c, hue], n) => {
    const g = GLYPHS[c], [start, dur] = LETTER_T[n];
    const pts: Pt[] = [];
    for (const L of g.lines) for (let i = 1; i < L.length; i++) line(L[i - 1], L[i], (x, y) => pts.push([x, y]));
    pts.forEach(([x, y], i) => {
      const when = start + (i / pts.length) * dur;
      stamp(cx + x, TOP + y, STROKE, hue, when);
      if (i % 2 === 0) heads.push({ x: cx + x + 3, y: TOP + y + 3, t: when, hue });
    });
    for (const p of g.pads || []) stamp(cx + p[0], TOP + p[1], STROKE, hue, start + dur);
    cx += g.w + STROKE + GAP;
  });
  heads.sort((a, b) => a.t - b.t);
}

interface Px { x: number; y: number; hue: number; edge: boolean }
const body: Px[] = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const hue = mask[idx(x, y)]; if (hue < 0) continue;
  const open = (dx: number, dy: number) => { const nx = x + dx, ny = y + dy; return nx < 0 || ny < 0 || nx >= W || ny >= H || mask[idx(nx, ny)] < 0; };
  body.push({ x, y, hue, edge: open(1, 0) || open(-1, 0) || open(0, 1) || open(0, -1) });
}
const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

/* Drips hang from the undersides of the letters, stretch, then let go. */
const drips: { x: number; y: number; hue: number; period: number; phase: number; len: number }[] = [];
{
  let lastX = -99;
  for (let x = 0; x < W; x++) {
    let y = H - 1; while (y >= 0 && mask[idx(x, y)] < 0) y--;
    if (y < 0 || x - lastX < 5 || hash(x, 3) > 0.42) continue;
    drips.push({ x, y, hue: mask[idx(x, y)], period: 3 + hash(x, 5) * 5, phase: hash(x, 7), len: 3 + Math.floor(hash(x, 11) * 13) });
    lastX = x;
  }
}

/* Wires leaving the word on both sides, each ending in a pad. Pulses travel out along them. */
const traces: { pts: Pt[]; hue: number; period: number; phase: number }[] = [];
function addTrace(hue: number, period: number, phase: number, ...L: Pt[]) {
  const pts: Pt[] = [];
  for (let i = 1; i < L.length; i++) line(L[i - 1], L[i], (x, y) => { const l = pts[pts.length - 1]; if (!l || l[0] !== x || l[1] !== y) pts.push([x, y]); });
  traces.push({ pts, hue, period, phase });
}
{
  const left = Math.round((W - totalW) / 2), right = left + totalW;
  addTrace(0, 2.6, 0.1, [left, TOP + 8], [left - 18, TOP + 8], [left - 26, TOP + 16], [left - 36, TOP + 16]);
  addTrace(0, 3.4, 0.6, [left, TOP + 25], [left - 12, TOP + 25], [left - 20, TOP + 33], [left - 30, TOP + 33]);
  addTrace(1, 2.9, 0.3, [right - 1, TOP + 3], [right + 12, TOP + 3], [right + 20, TOP + 11], [right + 34, TOP + 11]);
  addTrace(1, 3.8, 0.8, [right - 1, TOP + 34], [right + 16, TOP + 34], [right + 24, TOP + 26], [right + 36, TOP + 26]);
}

const WIRE_ENDS: Pt[] = traces.map((w) => w.pts[w.pts.length - 1]);

const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
const ctx = canvas.getContext('2d')!, image = ctx.createImageData(W, H), buf = new Float32Array(W * H * 3);
const shift = new Int16Array(H);
let lastNow = -1;

/** Renders the wordmark for this moment and returns its bitmap, ready for Term.pixels(). intro is the seconds since
 *  its intro began; leave it out once the intro is over. */
export function wordmarkBitmap(now: number, intro = 1e9) {
  if (now === lastNow) return canvas;
  lastNow = now;
  const t = REDUCED ? 2.2 : now / 1000, it = REDUCED ? 1e9 : intro, settled = it > FLASH_AT;
  const flash = settled ? Math.exp(-(it - FLASH_AT) / 0.28) : 0;
  buf.fill(0);
  // a glitch every few seconds: slices of the word slide sideways and the two colours swap
  const beat = Math.floor(t / 4.3), inGlitch = !REDUCED && it > INTRO_END + 1 && t / 4.3 - beat < 0.035 && hash(beat, 1) > 0.25;
  shift.fill(0);
  if (inGlitch) for (let i = 0; i < 4; i++) {
    const y0 = Math.floor(hash(beat, i + 2) * H), h = 2 + Math.floor(hash(beat, i + 9) * 8), dx = Math.round((hash(beat + Math.floor(t * 40), i) - 0.5) * 18);
    for (let y = y0; y < Math.min(H, y0 + h); y++) shift[y] = dx;
  }
  const add = (x: number, y: number, hue: number, v: number) => {
    if (y < 0 || y >= H) return;
    const px = x + shift[y]; if (px < 0 || px >= W) return;
    const h = inGlitch && hue < 2 ? 1 - hue : hue, i = idx(px, y) * 3 + h;
    buf[i] = Math.max(buf[i], v);
  };
  // the rim light crosses the word every few seconds, leaning with the letters
  const sweep = ((t * 0.27) % 1) * (W + 160) - 80, sweep2 = (((t * 0.27 + 0.55) % 1) * (W + 160) - 80);
  for (let n = 0; n < body.length; n++) {
    const p = body[n], age = it - reveal[idx(p.x, p.y)];
    if (age < 0) continue;
    if (!settled) {
      // being traced: a white-hot head that cools to the outline, with the core filling in just behind it
      const hot = Math.exp(-age / 0.13);
      if (p.edge) { add(p.x, p.y, p.hue, Math.min(1, 0.62 + hot)); add(p.x, p.y, 2, hot); }
      else if (age > 0.06) add(p.x, p.y, p.hue, Math.min(0.5, (age - 0.06) * 2.6) + hot * 0.5);
      else add(p.x, p.y, 2, hot);
      continue;
    }
    if (flash > 0.02) add(p.x, p.y, 2, flash * (p.edge ? 1 : 0.8));
    const pos = p.x + p.y * 0.7, d1 = (pos - sweep) / 12, d2 = (pos - sweep2) / 26, band = it < INTRO_END ? 0 : Math.exp(-d1 * d1), soft = it < INTRO_END ? 0 : Math.exp(-d2 * d2) * 0.45;
    if (p.edge) {
      add(p.x, p.y, p.hue, Math.min(1, 0.62 + band * 0.7 + soft + flash));
      if (band > 0.25) add(p.x, p.y, 2, band * 0.85);
    } else {
      // current running through the core of each trace
      const flow = (p.x + p.y * 2 + Math.floor(t * 34)) % 23 < 2 ? 0.32 : 0;
      add(p.x, p.y, p.hue, 0.34 - (p.y / H) * 0.14 + flow + band * 0.22 + hash(n, Math.floor(t * 9)) * 0.05);
    }
    if (p.edge) {
      // loose pixels leak off the edges: a few fixed ones, and some that spark and vanish
      if (hash(n, 1) < 0.05) add(p.x + (hash(n, 2) < 0.5 ? -2 : 2), p.y + 2, p.hue, 0.22);
      if (!REDUCED && hash(n, Math.floor(t * 7)) < 0.009) add(p.x + Math.round((hash(n, 3) - 0.5) * 7), p.y + Math.round((hash(n, 4) - 0.3) * 7), p.hue, 0.7);
    }
  }
  // drips only start once the word exists: each one begins from nothing after the flash
  if (settled) for (const d of drips) {
    const since = it - FLASH_AT;
    const q = since < d.period ? (since / d.period) * 0.72 : (t / d.period + d.phase) % 1;
    if (q < 0.72) {
      const len = Math.round(d.len * Math.pow(q / 0.72, 1.6));
      for (let i = 1; i <= len; i++) add(d.x, d.y + i, d.hue, 0.56 - (i / (d.len + 1)) * 0.34);
      if (len) add(d.x, d.y + len, d.hue, 0.72);
    } else {
      const f = (q - 0.72) / 0.28, tail = Math.round(d.len * (1 - f));
      for (let i = 1; i <= tail; i++) add(d.x, d.y + i, d.hue, 0.34 * (1 - f));
      const fall = d.y + d.len + Math.round(f * f * (H - d.y - d.len));
      add(d.x, fall, d.hue, 0.8 * (1 - f * 0.7));
    }
  }
  for (const w of traces) {
    const n = w.pts.length, head = ((t / w.period + w.phase) % 1) * (n + 18);
    // in the intro current comes in from the pad, so these wires light from their far end towards the word
    const wired = it - WIRES_AT;
    if (wired < 0) continue;
    const reach = settled ? n : n - (wired / 0.35) * n;
    w.pts.forEach(([x, y], i) => {
      if (i < reach && !settled) return;
      const back = head - i, lead = settled ? 0 : Math.exp(-(i - reach) / 8);
      add(x, y, w.hue, 0.2 + lead + (settled && back >= 0 && back < 9 ? (1 - back / 9) * 0.8 : 0));
    });
    const [ex, ey] = w.pts[n - 1], lit = (settled && head > n && head < n + 9) || (!settled && wired < 0.25);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) add(ex + i, ey + j, w.hue, lit ? 1 : i || j ? 0.42 : 0.1);
  }
  const o = image.data;
  for (let i = 0; i < W * H; i++) {
    const r = buf[i * 3], g = buf[i * 3 + 1], b = buf[i * 3 + 2];
    o[i * 4] = r * 255; o[i * 4 + 1] = g * 255; o[i * 4 + 2] = b * 255; o[i * 4 + 3] = r || g || b ? 255 : 0;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/* ---------------------------------------------------------------- the circuit board behind the word */
/** Where the wordmark sits, so the board can route around it and feed its wires. */
export interface MarkPlace { screenW: number; screenH: number; markX: number; markY: number; scale: number }
interface Trace { pts: Pt[]; start: number; speed: number; hue: number; via: boolean; pulse: number }
interface Board { w: number; h: number; ox: number; oy: number; traces: Trace[]; chips: { x: number; y: number; w: number; h: number; t: number; hue: number }[]; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; image: ImageData }
const DIRS: Pt[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
let board: Board | null = null, boardKey = '';

function makeBoard(P: MarkPlace): Board {
  const w = Math.floor(P.screenW / P.scale), h = Math.floor(P.screenH / P.scale), bx = (P.screenW - w * P.scale) / 2, by = (P.screenH - h * P.scale) / 2;
  const ox = Math.round((P.markX - bx) / P.scale), oy = Math.round((P.markY - by) / P.scale);
  const used = new Uint8Array(w * h);
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !used[y * w + x];
  const claim = (x: number, y: number, r = 2) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const px = x + i, py = y + j; if (px >= 0 && py >= 0 && px < w && py < h) used[py * w + px] = 1; } };
  // the word and its breathing room are off limits
  for (let y = oy - 4; y < oy + H; y++) for (let x = ox; x < ox + W; x++) claim(x, y, 0);
  let seed = 7331; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const hueAt = (x: number) => (x < w / 2 ? 0 : 1);
  const raster = (L: Pt[]) => { const pts: Pt[] = []; for (let i = 1; i < L.length; i++) line(L[i - 1], L[i], (x, y) => { const l = pts[pts.length - 1]; if (!l || l[0] !== x || l[1] !== y) pts.push([x, y]); }); return pts; };
  const traces: Trace[] = [];
  // feeders first: they carry the current in from the screen edges to the word's own wire pads
  for (const wire of WIRE_ENDS) {
    const px = ox + wire[0], py = oy + wire[1], left = wire[0] < W / 2, edge = left ? 0 : w - 1, bend = py + (py < oy + H / 2 ? -1 : 1) * Math.round(6 + rnd() * 12), mid = left ? px - Math.abs(bend - py) : px + Math.abs(bend - py);
    const pts = raster([[edge, bend], [mid, bend], [px, py]]);
    for (const [x, y] of pts) claim(x, y);
    traces.push({ pts, start: 0.15, speed: pts.length / (WIRES_AT - 0.15), hue: left ? 0 : 1, via: false, pulse: 0.5 + rnd() });
  }
  // a few chips for the traces to run up against
  const chips: Board['chips'] = [];
  for (let n = 0, tries = 0; n < 5 && tries < 60; tries++) {
    const cw = 22 + Math.floor(rnd() * 22), ch = 12 + Math.floor(rnd() * 10), x = 12 + Math.floor(rnd() * Math.max(1, w - cw - 24)), y = 8 + Math.floor(rnd() * Math.max(1, h - ch - 16));
    let ok = true;
    for (let j = -5; j < ch + 5 && ok; j++) for (let i = -5; i < cw + 5; i++) if (!free(x + i, y + j)) { ok = false; break; }
    if (!ok) continue;
    for (let j = -2; j < ch + 2; j++) for (let i = -2; i < cw + 2; i++) claim(x + i, y + j, 0);
    chips.push({ x, y, w: cw, h: ch, t: 0.4 + rnd() * 0.9, hue: hueAt(x) }); n++;
  }
  // then bundles of parallel traces, routed inwards at 45 degree turns until they run out of room
  const want = Math.min(46, Math.round((w * h) / 2600));
  for (let b = 0; b < want; b++) {
    const side = Math.floor(rnd() * 4), wide = 1 + Math.floor(rnd() * 3.6);
    let d = side === 0 ? 0 : side === 1 ? 4 : side === 2 ? 2 : 6;
    let sx = side === 0 ? 0 : side === 1 ? w - 1 : Math.floor(rnd() * w), sy = side === 2 ? 0 : side === 3 ? h - 1 : Math.floor(rnd() * h);
    sx -= sx % 4; sy -= sy % 4;
    const turns: [number, number][] = []; let segs = 2 + Math.floor(rnd() * 4);
    while (segs--) { turns.push([8 + Math.floor(rnd() * 44), rnd() < 0.5 ? 1 : -1]); }
    const start = 0.05 + rnd() * 1.15, speed = 110 + rnd() * 170;
    for (let c = 0; c < wide; c++) {
      const perp = DIRS[(d + 2) % 8];
      let x = sx + perp[0] * c * 4, y = sy + perp[1] * c * 4, dir = d;
      const pts: Pt[] = []; let stop = false;
      for (const [len, turn] of turns) {
        const v = DIRS[dir];
        for (let i = 0; i < len; i++) {
          if (pts.length && !free(x, y)) { stop = true; break; }
          pts.push([x, y]); x += v[0]; y += v[1];
        }
        if (stop) break;
        dir = (dir + turn + 8) % 8;
      }
      if (pts.length < 14) continue;
      for (const [px, py] of pts) claim(px, py, 1);
      traces.push({ pts, start: start + c * 0.03, speed, hue: hueAt(pts[0][0]), via: true, pulse: rnd() });
    }
  }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx2 = c.getContext('2d')!;
  return { w, h, ox, oy, traces, chips, canvas: c, ctx: ctx2, image: ctx2.createImageData(w, h) };
}

interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; hue: number }
let sparks: Spark[] = [], lastSpark = 0, headIdx = 0, burstDone = false, nextPop = 0;
function spawn(x: number, y: number, hue: number, n: number, force: number) {
  for (let i = 0; i < n && sparks.length < 420; i++) {
    const a = Math.random() * Math.PI * 2, v = force * (0.3 + Math.random());
    const max = 0.22 + Math.random() * 0.55;
    sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - force * 0.3, life: max, max, hue });
  }
}

/** Draws the board for this moment of the intro, sized to the screen, with sparks flying over the word. fade takes it
 *  away when the title moves on. */
export function circuitBitmap(now: number, intro: number, P: MarkPlace, fade = 1) {
  const key = [P.screenW, P.screenH, P.markX, P.markY, P.scale].join();
  if (!board || boardKey !== key) { board = makeBoard(P); boardKey = key; }
  const B = board, o = B.image.data, it = REDUCED ? 1e9 : intro, dt = Math.min(0.05, (now - lastSpark) / 1000 || 0.016);
  lastSpark = now;
  o.fill(0);
  const put = (x: number, y: number, ch: number, v: number) => { if (x < 0 || y < 0 || x >= B.w || y >= B.h) return; const i = (y * B.w + x) * 4; const n = Math.min(255, v * fade * 255); if (n > o[i + ch]) { o[i + ch] = n; o[i + 3] = 255; } };
  // the board dims as the word takes over, leaving a faint ghost of itself behind the title
  const base = it < FLASH_AT ? 0.3 : Math.max(0.075, 0.3 - (it - FLASH_AT) * 0.35), t = now / 1000, live = it < FLASH_AT;
  for (const tr of B.traces) {
    const n = tr.pts.length, head = (it - tr.start) * tr.speed;
    if (head <= 0) continue;
    const reach = Math.min(n, Math.floor(head));
    for (let i = 0; i < reach; i++) {
      const back = (head - i) / tr.speed;
      put(tr.pts[i][0], tr.pts[i][1], tr.hue, base + Math.exp(-back / 0.16) * 0.9);
      if (back < 0.09) put(tr.pts[i][0], tr.pts[i][1], 2, Math.exp(-back / 0.05));
    }
    if (live && reach < n && Math.random() < 0.32) spawn(tr.pts[reach][0], tr.pts[reach][1], tr.hue, 1, 46);
    if (tr.via && reach >= n) {
      const [ex, ey] = tr.pts[n - 1], age = (head - n) / tr.speed, pop = Math.exp(-age / 0.15);
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (Math.max(Math.abs(i), Math.abs(j)) === 2 || (!i && !j)) put(ex + i, ey + j, tr.hue, base * 1.5 + pop);
    }
    // once settled, a slow pulse wanders along some of the traces
    if (!live && it > INTRO_END && tr.pulse < 0.32) {
      const p = ((t / (3 + tr.pulse * 9) + tr.pulse * 3) % 1.6) * n;
      for (let i = Math.max(0, Math.floor(p) - 10); i < Math.min(n, p); i++) put(tr.pts[i][0], tr.pts[i][1], tr.hue, 0.34 * (1 - (p - i) / 10));
    }
  }
  for (const c of B.chips) {
    if (it < c.t) continue;
    const age = it - c.t, v = base * 1.1 + Math.exp(-age / 0.18) * 0.8;
    for (let i = 0; i < c.w; i++) { put(c.x + i, c.y, c.hue, v); put(c.x + i, c.y + c.h - 1, c.hue, v); if (i % 4 === 1) { put(c.x + i, c.y - 2, c.hue, v); put(c.x + i, c.y - 1, c.hue, v); put(c.x + i, c.y + c.h, c.hue, v); put(c.x + i, c.y + c.h + 1, c.hue, v); } }
    for (let j = 0; j < c.h; j++) { put(c.x, c.y + j, c.hue, v); put(c.x + c.w - 1, c.y + j, c.hue, v); }
  }
  if (!REDUCED) {
    // sparks follow the current through the letters
    if (it < 0.2) { headIdx = 0; burstDone = false; sparks = []; }
    while (headIdx < heads.length && heads[headIdx].t <= it) { const h = heads[headIdx++]; if (it - h.t < 0.1 && headIdx % 2 === 0) spawn(B.ox + h.x, B.oy + h.y, h.hue, 1 + Math.floor(Math.random() * 3), 62); }
    // the two currents meet: everything goes up at once
    if (it >= FLASH_AT && !burstDone) {
      burstDone = true;
      const mid = B.ox + W / 2, midY = B.oy + TOP + LETTER_H / 2;
      spawn(mid, midY, 2, 90, 150);
      for (let i = 0; i < 130; i++) { const k = Math.random(), px = B.ox + MX + k * (W - MX * 2); spawn(px, B.oy + TOP + Math.random() * LETTER_H, k < 0.5 ? 0 : 1, 1, 100); }
    }
    // and now and then a loose connection throws a few more
    if (it > INTRO_END + 1 && now > nextPop) {
      nextPop = now + 1400 + Math.random() * 3200;
      const p = body[Math.floor(Math.random() * body.length)];
      spawn(B.ox + p.x, B.oy + p.y, p.hue, 3 + Math.floor(Math.random() * 7), 55);
    }
    for (const s of sparks) {
      s.life -= dt; s.vy += 170 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      const k = Math.max(0, s.life / s.max), x = Math.round(s.x), y = Math.round(s.y), tx = Math.round(s.x - s.vx * 0.022), ty = Math.round(s.y - s.vy * 0.022);
      put(x, y, s.hue, k); put(x, y, 2, k * k);
      put(tx, ty, s.hue, k * 0.45);
    }
    sparks = sparks.filter((s) => s.life > 0);
  }
  B.ctx.putImageData(B.image, 0, 0);
  return B.canvas;
}
/** How strongly the CRT should shudder at this moment of the intro. */
export const introGlitch = (intro: number) => (REDUCED || intro < FLASH_AT ? 0 : Math.exp(-(intro - FLASH_AT) / 0.16) * 0.7);
