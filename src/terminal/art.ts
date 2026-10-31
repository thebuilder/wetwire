// Turns source art into a dithered phosphor bitmap the terminal can show, so game art needs no redraw.
import type { Hue, Rect, Term } from './term';

export interface Luma { w: number; h: number; l: Float32Array; a: Float32Array }

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

/** Luminance and coverage per pixel, stretched so dark art still fills the tube's brightness range. */
export function toLuma(src: CanvasImageSource, w: number, h: number, gamma = 0.7): Luma {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(src, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, l = new Float32Array(w * h), a = new Float32Array(w * h);
  let lo = 1, hi = 0;
  for (let i = 0; i < w * h; i++) {
    a[i] = d[i * 4 + 3] / 255;
    l[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.55 + d[i * 4 + 2] * 0.15) / 255;
    if (a[i] > 0.5) { lo = Math.min(lo, l[i]); hi = Math.max(hi, l[i]); }
  }
  const span = Math.max(0.01, hi - lo);
  for (let i = 0; i < w * h; i++) l[i] = Math.pow(Math.min(1, Math.max(0, (l[i] - lo) / span)), gamma);
  return { w, h, l, a };
}

/** A dithered bitmap with the brightness in the hue's colour channel, ready for Term.pixels(). */
export function phosphorBitmap(m: Luma, hue: Hue = 0, levels = 5) {
  const c = document.createElement('canvas'); c.width = m.w; c.height = m.h;
  const g = c.getContext('2d')!, im = g.createImageData(m.w, m.h), o = im.data;
  const ch = hue === 1 ? 1 : hue === 2 ? 2 : 0;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const i = y * m.w + x;
    if (m.a[i] < 0.5) continue;
    const d = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5;
    const v = Math.max(0, Math.min(1, Math.round((m.l[i] * 0.92 + 0.08) * (levels - 1) + d) / (levels - 1)));
    o[i * 4 + ch] = Math.round(v * 255); o[i * 4 + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return c;
}

/** Draws art inside an area, centred or against its top. Bitmaps are cached on the Luma, one per hue. */
const cache = new WeakMap<Luma, Partial<Record<Hue, HTMLCanvasElement>>>();
export function drawArt(t: Term, m: Luma, area: Rect, hue: Hue = 0, top = false) {
  let by = cache.get(m);
  if (!by) cache.set(m, by = {});
  t.pixels(area, by[hue] || (by[hue] = phosphorBitmap(m, hue)), top);
}
