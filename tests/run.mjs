// Headless smoke tests. Builds nothing: run `npm run build` first (npm test does both).
// Usage: node tests/run.mjs [scenario ...]   (default: every file in tests/scenarios)
// Each scenario exports default async ({ page, ev, shot, log, expect }) and throws on failure.
// Screenshots land in tests/shots/ (ignored by git).
import { createServer } from 'node:http';
import { readFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist'), shots = join(root, 'tests', 'shots');
if (!existsSync(join(dist, 'index.html'))) { console.error('dist/index.html missing: run npm run build'); process.exit(1); }
mkdirSync(shots, { recursive: true });

const TYPES = { '.html': 'text/html', '.ogg': 'audio/ogg', '.js': 'text/javascript', '.png': 'image/png' };
const server = createServer((req, res) => {
  const p = join(dist, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(dist) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
}).listen(0);
const base = 'http://localhost:' + server.address().port + '/';

const names = process.argv.slice(2).length ? process.argv.slice(2)
  : readdirSync(join(root, 'tests', 'scenarios')).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4)).sort();
const W = +(process.env.W || 1280), H = +(process.env.H || 720);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });

let failed = 0;
for (const name of names) {
  const t0 = Date.now(), page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 400)); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const lines = [];
  const ctx = {
    page,
    ev: (f, a) => page.evaluate(f, a),
    shot: (n) => page.screenshot({ path: join(shots, name + '-' + n + '.png'), timeout: 150000 }),
    log: (...a) => lines.push(a.join(' ')),
    expect: (cond, msg) => { if (!cond) throw new Error('expected: ' + msg); },
  };
  try {
    await page.goto(base);
    await page.waitForFunction(() => window.__wetwire, null, { timeout: 30000 });
    await ctx.ev(() => { const w = window.__wetwire; if (w.endIntro) w.endIntro(); });
    const mod = await import(pathToFileURL(join(root, 'tests', 'scenarios', name + '.mjs')).href);
    await mod.default(ctx);
    if (errs.length) throw new Error('page errors:\n    ' + errs.slice(0, 5).join('\n    '));
    console.log('ok   ' + name + ' (' + ((Date.now() - t0) / 1000).toFixed(0) + 's)');
  } catch (e) {
    failed++; console.log('FAIL ' + name + ': ' + e.message);
  }
  for (const l of lines) console.log('     ' + l);
  await page.close();
}
await browser.close(); server.close();
console.log(failed ? failed + ' of ' + names.length + ' failed' : 'all ' + names.length + ' passed');
process.exit(failed ? 1 : 0);
