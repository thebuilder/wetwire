// The agent figure as real pixels: body data from art/doll/*.px, with the face, hair and cyborg mods drawn
// on top by rule. Every pixel is a brightness level and a hue, so features stay readable on the tube
// and an agent's look is plain data that can be saved and edited.
import type { Hue } from './term';
import femPx from '../../art/doll/f.px?raw';
import malePx from '../../art/doll/m.px?raw';

export type Sex = 'm' | 'f';
export const HAIRS = ['bald', 'crop', 'slick', 'mohawk', 'bob'] as const;
export const BROWS = ['flat', 'angry', 'raised', 'none'] as const;
export const MOUTHS = ['line', 'grim', 'smirk', 'lips'] as const;
export const SKINS = [0, 1, 2] as const;
export const MOD_PARTS = ['arms', 'legs', 'chest', 'eyes', 'heart', 'brain'] as const;
export type ModPart = typeof MOD_PARTS[number];
export interface AgentLook {
  sex: Sex;
  skin: typeof SKINS[number];
  hair: typeof HAIRS[number];
  brow: typeof BROWS[number];
  mouth: typeof MOUTHS[number];
  scar: boolean;
  mods: Record<ModPart, number>;
}

/** Where each figure's features sit. x is mirrored around the gap between columns 32 and 33. */
const FRAME: Record<Sex, { armL: number; armR: number; legY: number; handL: number; handR: number; browY: number; eyeY: number; noseY: number; mouthY: number; hairY: number; clear: [number, number] }> = {
  m: { armL: 19, armR: 46, legY: 66, handL: 15, handR: 50, browY: 9, eyeY: 11, noseY: 14, mouthY: 16, hairY: 8, clear: [9, 17] },
  f: { armL: 20, armR: 44, legY: 64, handL: 14, handR: 51, browY: 9, eyeY: 11, noseY: 15, mouthY: 17, hairY: 8, clear: [10, 18] },
};
const W = 66, H = 137;
/** Brightness per level. The steps are wide so a one-level difference still shows through the CRT. */
const GLOW = [0.1, 0.24, 0.4, 0.56, 0.76, 1];

const parse = (text: string) => {
  const rows = text.split('\n'), lv = new Int8Array(W * H).fill(-1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = (rows[y] || '')[x]; if (c && c !== ' ') lv[y * W + x] = +c; }
  return lv;
};
const BODY: Record<Sex, Int8Array> = { m: parse(malePx), f: parse(femPx) };

function partAt(sex: Sex, x: number, y: number): ModPart | 'head' {
  const F = FRAME[sex];
  if (y < 22) return 'head';
  if (y < F.legY) return x <= F.armL || x >= F.armR ? 'arms' : 'chest';
  return y <= 84 && (x <= F.handL || x >= F.handR) ? 'arms' : 'legs';
}

export function buildDoll(look: AgentLook) {
  const { sex, mods } = look, F = FRAME[sex], base = BODY[sex];
  const lv = new Int8Array(base), hu = new Uint8Array(W * H);
  const at = (x: number, y: number) => y * W + x;
  const set = (x: number, y: number, l: number, hue: Hue = 0) => { if (x < 0 || y < 0 || x >= W || y >= H) return; lv[at(x, y)] = l; hu[at(x, y)] = hue; };
  /** Sets a pixel only where the body already has one. */
  const on = (x: number, y: number, l: number, hue: Hue = 0) => { if (x >= 0 && y >= 0 && x < W && y < H && lv[at(x, y)] >= 0) set(x, y, l, hue); };
  /** Sets a pixel and its mirror image. k counts outward from the figure's centre line. */
  const both = (k: number, y: number, l: number, hue: Hue = 0) => { set(32 - k, y, l, hue); set(33 + k, y, l, hue); };

  // a clean face to draw on: the sprite's features are replaced, not patched
  for (let y = F.clear[0]; y < F.clear[1]; y++) for (let x = 29; x <= 36; x++) if (lv[at(x, y)] >= 0) lv[at(x, y)] = 5;
  // the side of the skull in shadow, so a bald head is not a flat blob
  for (let y = 0; y < 22; y++) {
    let r = -1;
    for (let x = W - 1; x >= 0; x--) if (lv[at(x, y)] >= 3) { r = x; break; }
    if (r > 33 && y < F.browY) on(r, y, 4);
  }

  // skin tone: darker skin drops the head one or two levels, keeping the outline
  if (look.skin) for (let y = 0; y < 22; y++) for (let x = 0; x < W; x++) { const l = lv[at(x, y)]; if (l >= 2) lv[at(x, y)] = Math.max(2, l - look.skin); }
  const skin = 5 - look.skin, dark = (n: number) => Math.max(0, skin - n);

  /* ---------------------------------------------------------------- hair */
  const row = (y: number): [number, number] | null => {
    let a = -1, b = -1;
    for (let x = 0; x < W; x++) if (base[at(x, y)] >= 0) { if (a < 0) a = x; b = x; }
    return a < 0 ? null : [a, b];
  };
  if (look.hair === 'crop' || look.hair === 'slick' || look.hair === 'bob') {
    for (let y = 0; y <= F.hairY; y++) {
      const s = row(y); if (!s) continue;
      for (let x = s[0]; x <= s[1]; x++) {
        if (look.hair === 'crop') set(x, y, (x + y) % 2 ? 2 : 1);
        else set(x, y, (x + y) % 7 === 0 ? 2 : 1);
      }
    }
    // the hairline comes down at the temples, staying inside the head's outline
    for (const k of [5, 6]) { on(32 - k, F.hairY + 1, 1); on(33 + k, F.hairY + 1, 1); }
  }
  if (look.hair === 'mohawk') {
    for (let y = 0; y <= F.hairY; y++) { const s = row(y); if (s) for (let x = s[0]; x <= s[1]; x++) if (lv[at(x, y)] > 2) set(x, y, dark(2)); }
    const top = (row(0) ? 0 : row(1) ? 1 : row(2) ? 2 : 3) - 3;
    for (let y = Math.max(0, top); y <= F.hairY - 1; y++) { for (const k of [0, 1]) both(k, y, y % 3 ? 5 : 4); both(2, y, 1); }
  }
  if (look.hair === 'bob') {
    // hair falls straight from the cap to the jaw, covering the ears and touching the cheek
    let outer = 0;
    for (let y = F.hairY - 2; y < 21; y++) {
      const s = row(y); if (s) outer = Math.max(outer, s[1] - 33 + 1);
      const inner = y <= F.hairY ? outer : y < F.eyeY ? 4 : 5;
      for (let k = inner; k <= outer; k++) both(k, y, k === outer ? 0 : (y + k) % 4 === 0 ? 3 : 1);
    }
  }

  /* ---------------------------------------------------------------- face */
  const eye = F.eyeY;
  if (look.brow !== 'none') {
    const by = look.brow === 'raised' ? F.browY - 1 : F.browY;
    for (const k of [1, 2, 3, 4]) both(k, look.brow === 'angry' ? by + (k <= 2 ? 1 : 0) : by, dark(sex === 'm' ? 5 : 4));
  }
  // eyes: dark socket, pupil, then a lower lid
  for (const k of [1, 2, 3]) both(k, eye, k === 2 ? 0 : dark(4));
  both(2, eye + 1, dark(2));
  // nose: a shadow under the bridge
  both(0, F.noseY, dark(2));
  // mouth: always a dark line, the one feature that must survive the tube
  const my = F.mouthY;
  for (const k of [0, 1]) both(k, my, 1);
  if (look.mouth === 'grim') both(2, my + 1, dark(3));
  else if (look.mouth === 'smirk') { both(2, my, 1); set(35, my - 1, dark(3)); }
  else if (look.mouth === 'lips') { both(0, my - 1, dark(2)); both(0, my + 1, dark(2)); both(2, my, dark(3)); }
  else { both(2, my, dark(3)); both(0, my + 1, dark(1)); }
  if (look.scar) for (let i = 0; i < 7; i++) on(36 - Math.floor(i / 3), eye - 3 + i, dark(3));

  /* ---------------------------------------------------------------- cyborg mods */
  const glow: Hue[] = [0, 0, 2, 1];
  for (const part of ['arms', 'legs', 'chest'] as const) {
    const v = mods[part]; if (!v) continue;
    for (let y = 22; y < H; y++) {
      let x = 0;
      while (x < W) {
        if (lv[at(x, y)] < 0 || partAt(sex, x, y) !== part) { x++; continue; }
        let e = x; while (e + 1 < W && lv[at(e + 1, y)] >= 0 && partAt(sex, e + 1, y) === part) e++;
        const len = e - x + 1;
        if (len >= 4) {
          if (v === 1) { if (y % 9 === 4 && len >= 5) { set(x + 1, y, 5); set(e - 1, y, 5); } }
          else if (part === 'chest') { if (y % 2 === 0 && y > 26 && y < 56) { set(x + Math.floor(len * 0.25), y, 5, glow[v]); set(e - Math.floor(len * 0.25), y, 5, glow[v]); } }
          else if (y % 2 === 0 && (part !== 'legs' || y >= F.legY + 10)) set(x + Math.floor(len / 2), y, 5, glow[v]);
        }
        x = e + 1;
      }
    }
  }
  if (mods.eyes === 1) for (const k of [1, 2]) both(k, eye, 5, 1);
  else if (mods.eyes >= 2) {
    const hue: Hue = mods.eyes === 2 ? 2 : 1;
    for (let k = 0; k <= 5; k++) { both(k, eye, 2, hue); both(k, eye + 1, 0); }
    for (const k of [1, 2]) both(k, eye, 5, hue);
  }
  if (mods.brain) { const hue = glow[mods.brain]; for (let k = 0; k < 5; k += 2) both(k, F.hairY - 2, 5, hue); if (mods.brain > 1) both(0, F.hairY - 5, 5, hue); }
  if (mods.heart) { for (let y = 30; y <= 35; y++) for (let x = 35; x <= 40; x++) set(x, y, x === 35 || x === 40 || y === 30 || y === 35 ? 0 : 2); const hue = glow[Math.max(2, mods.heart)]; for (const [x, y] of [[37, 32], [38, 32], [37, 33], [38, 33]]) set(x, y, mods.heart === 1 ? 4 : 5, mods.heart === 1 ? 0 : hue); }

  return { lv, hu };
}

const cache = new Map<string, HTMLCanvasElement>();
/** The look as a bitmap with its brightness in each pixel's hue channel, ready for Term.pixels(). */
export function dollBitmap(look: AgentLook) {
  const key = JSON.stringify(look);
  const hit = cache.get(key); if (hit) return hit;
  const { lv, hu } = buildDoll(look);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!, im = g.createImageData(W, H), o = im.data;
  for (let i = 0; i < W * H; i++) {
    if (lv[i] < 0) continue;
    o[i * 4 + (hu[i] === 1 ? 1 : hu[i] === 2 ? 2 : 0)] = Math.round(GLOW[lv[i]] * 255);
    o[i * 4 + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  if (cache.size > 64) cache.clear();
  cache.set(key, c);
  return c;
}
