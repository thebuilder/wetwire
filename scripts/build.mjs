// Builds dist/index.html: the game is one self-contained page, made by concatenating src/ in order
// inside a single IIFE. Also copies the exported audio next to it and checks the result.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => readFileSync(join(root, 'src', f), 'utf8');

// Order matters: later files use what earlier ones define, and everything shares one scope.
export const ORDER = [
  'core.js', 'world_head.js', 'city_fns.js', 'world_build.js', 'layout.js', 'levels.js', 'levels2.js',
  'models.js', 'world_load.js', 'engine.js', 'game1.js', 'game2.js', 'chaos.js', 'missions.js', 'icons.js', 'game3.js',
];
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js';

const fail = (msg) => { console.error('build failed: ' + msg); process.exit(1); };

// 1. every top-level name must be unique, since all files share one scope
const seen = new Map(), dupes = [];
for (const f of ORDER) {
  src(f).split('\n').forEach((line, i) => {
    const m = line.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/);
    if (!m) return;
    const name = m[1] || m[2], at = f + ':' + (i + 1);
    if (seen.has(name)) dupes.push(name + ' (' + seen.get(name) + ' and ' + at + ')'); else seen.set(name, at);
  });
}
if (dupes.length) fail('duplicate top-level names:\n  ' + dupes.join('\n  '));

// 2. concatenate
const body = '(() => {\n' + ORDER.map((f) => '/* ---- ' + f + ' ---- */\n' + src(f)).join('\n') + '\n})();\n';
try { new vm.Script(body, { filename: 'game.js' }); } catch (e) { fail('syntax error: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')); }
const html = src('head.html') + '\n<script src="' + THREE_URL + '"></script>\n<script>\n' + body + '</script>\n';

// 3. write dist
const dist = join(root, 'dist');
mkdirSync(join(dist, 'audio'), { recursive: true });
writeFileSync(join(dist, 'index.html'), html);
const ex = join(root, 'audio', 'export');
let n = 0;
if (existsSync(ex)) for (const f of readdirSync(ex)) if (f.endsWith('.ogg')) { copyFileSync(join(ex, f), join(dist, 'audio', f)); n++; }
console.log('dist/index.html ' + (html.length / 1024).toFixed(0) + ' KB, ' + html.split('\n').length + ' lines, ' + n + ' audio files');
