// Combat simulator from the shell: every squad preset against every enemy mix, through the built game.
// Usage: node scripts/combat.mjs [fights per test] [layout] [light] [push|hold]
//   e.g. node scripts/combat.mjs 40 cover lit push
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (!existsSync(join(dist, 'index.html'))) { console.error('dist/index.html missing: run npm run build'); process.exit(1); }
const [runs = '200', layout = 'cover', light = 'lit', doctrine = 'push'] = process.argv.slice(2);
const server = createServer((req, res) => {
  const p = join(dist, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : 'audio/ogg' }); res.end(readFileSync(p));
}).listen(0);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('page error: ' + e.message));
await page.goto('http://localhost:' + server.address().port + '/');
await page.waitForFunction(() => window.__wetwire);
const t0 = Date.now();
const out = await page.evaluate(async ([runs, layout, light, doctrine]) => {
  const c = window.__wetwire.combat;
  return { rows: await c.runMatrix({ layout, light, dist: 30, alert: true, push: doctrine === 'push' }, +runs), enemies: c.ENEMIES.map((e) => [e.id, e.name]) };
}, [runs, layout, light, doctrine]);
const pad = (s, n) => String(s).padEnd(n), lpad = (s, n) => String(s).padStart(n);
console.log('Most enemies each squad beats in at least 80% of ' + runs + ' fights // ' + [layout, light, doctrine, '30m, alerted'].join(', '));
console.log(pad('', 32) + lpad('VALUE', 9) + out.enemies.map(([, n]) => lpad(n.split(' ').pop().toUpperCase(), 10)).join(''));
for (const r of out.rows) console.log(pad(r.name, 32) + lpad(r.value.toLocaleString('en-US'), 9) + out.enemies.map(([id]) => lpad(r.limits[id] >= 48 ? '48+' : r.limits[id], 10)).join(''));
console.log('took ' + Math.round((Date.now() - t0) / 1000) + 's');
await browser.close(); server.close();
