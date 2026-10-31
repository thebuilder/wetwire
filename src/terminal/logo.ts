// The Kessel Co. logo: a solid K inside a ring, raymarched into characters and spun on the spot.
import type { Hue, Rect, Term } from './term';

const RAMP = '.,-:;=!*#$@';
type V3 = [number, number, number];

const capsule2 = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
  const px = x - ax, py = y - ay, dx = bx - ax, dy = by - ay;
  const h = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - dx * h, py - dy * h);
};
function logoSdf(x: number, y: number, z: number) {
  // the K, as three bars extruded along z
  const d2 = Math.min(
    capsule2(x, y, -0.34, -0.72, -0.34, 0.72),
    capsule2(x, y, -0.3, -0.04, 0.42, 0.72),
    capsule2(x, y, -0.12, 0.14, 0.46, -0.72),
  ) - 0.13;
  const dz = Math.abs(z) - 0.2;
  const k = Math.min(Math.max(d2, dz), 0) + Math.hypot(Math.max(d2, 0), Math.max(dz, 0));
  // the ring around it
  const ring = Math.hypot(Math.hypot(x, y) - 1.22, z) - 0.11;
  return Math.min(k, ring);
}

/** Draws the spinning logo into r. `angle` is the spin, in radians. */
export function drawLogo(t: Term, r: Rect, angle: number, hue: Hue = 0, b = 1) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2, aspect = t.ch / t.cw;
  const scale = Math.min(r.w / aspect, r.h) / 3;
  const c = Math.cos(angle), s = Math.sin(angle), tilt = 0.28, ct = Math.cos(tilt), st = Math.sin(tilt);
  // camera space to logo space: tilt, then spin
  const toObj = (x: number, y: number, z: number): V3 => {
    const y1 = y * ct - z * st, z1 = y * st + z * ct;
    return [x * c + z1 * s, y1, -x * s + z1 * c];
  };
  const L: V3 = [-0.45, 0.62, -0.64];
  for (let cy0 = 0; cy0 < r.h; cy0++) for (let cx0 = 0; cx0 < r.w; cx0++) {
    const px = (r.x + cx0 + 0.5 - cx) / aspect / scale, py = -(r.y + cy0 + 0.5 - cy) / scale;
    if (px * px + py * py > 1.6 * 1.6) continue;
    let z = -1.7, hit = false;
    for (let i = 0; i < 26 && z < 1.7; i++) {
      const [ox, oy, oz] = toObj(px, py, z), d = logoSdf(ox, oy, oz);
      if (d < 0.012) { hit = true; break; }
      z += d;
    }
    if (!hit) continue;
    const e = 0.02, f = (dx: number, dy: number, dz: number) => { const [ox, oy, oz] = toObj(px + dx, py + dy, z + dz); return logoSdf(ox, oy, oz); };
    let nx = f(e, 0, 0) - f(-e, 0, 0), ny = f(0, e, 0) - f(0, -e, 0), nz = f(0, 0, e) - f(0, 0, -e);
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const v = Math.max(0.06, Math.min(1, 0.16 + 0.84 * Math.max(0, nx * L[0] + ny * L[1] + nz * L[2])));
    t.cell(r.x + cx0, r.y + cy0, RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))], { b: (0.28 + v * 0.72) * b, hue });
  }
}

/* A chunky block font, just the letters the title needs. */
const LETTERS: Record<string, string[]> = {
  K: ['█  █', '█ █ ', '██  ', '█ █ ', '█  █'],
  E: ['████', '█   ', '███ ', '█   ', '████'],
  S: [' ███', '█   ', ' ██ ', '   █', '███ '],
  L: ['█   ', '█   ', '█   ', '█   ', '████'],
};
export function bigText(t: Term, text: string, x: number, y: number, hue: Hue = 0, b = 1) {
  let cx = x;
  for (const ch of text) {
    const g = LETTERS[ch];
    if (!g) { cx += 3; continue; }
    g.forEach((row, j) => { [...row].forEach((c, i) => { if (c === '█') { t.cell(cx + i * 2, y + j, '█', { b, hue }); t.cell(cx + i * 2 + 1, y + j, '█', { b, hue }); } }); });
    cx += g[0].length * 2 + 2;
  }
  return cx - x - 2;
}
export const bigWidth = (text: string) => [...text].reduce((n, c) => n + (LETTERS[c] ? LETTERS[c][0].length * 2 + 2 : 3), 0) - 2;
