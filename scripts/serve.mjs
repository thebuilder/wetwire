// Serves dist/ on http://localhost:8765 (PORT to change). Rebuild with npm run build.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const TYPES = { '.html': 'text/html', '.ogg': 'audio/ogg', '.js': 'text/javascript', '.png': 'image/png' };
const port = +(process.env.PORT || 8765);
createServer((req, res) => {
  const p = join(dist, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(dist) || !existsSync(p)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(readFileSync(p));
}).listen(port, () => console.log('wetwire on http://localhost:' + port));
