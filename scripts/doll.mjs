// Converts the agent sprites (art/doll/*_px.png) to editable pixel data (art/doll/*.px): one line per row,
// one character per pixel, a space for transparent and 0 (darkest) to 5 (brightest) otherwise.
// The .px files are the source the terminal draws from, so running this overwrites any edits to them.
// Usage: node scripts/doll.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'art', 'doll');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [png, out] of [['base_px.png', 'm.px'], ['fem_px.png', 'f.px']]) {
  const src = 'data:image/png;base64,' + readFileSync(join(dir, png)).toString('base64');
  const rows = await page.evaluate(async (src) => {
    const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, out = [];
    for (let y = 0; y < c.height; y++) {
      let s = '';
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4, l = d[i] * 0.3 + d[i + 1] * 0.55 + d[i + 2] * 0.15;
        s += d[i + 3] < 128 ? ' ' : String(Math.min(5, Math.floor(l / 28)));
      }
      out.push(s);
    }
    return out;
  }, src);
  writeFileSync(join(dir, out), rows.join('\n') + '\n');
  console.log(out + ': ' + rows[0].length + ' x ' + rows.length);
}
await browser.close();
