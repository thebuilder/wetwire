// The game ships as one self-contained page (dist/index.html) with the exported audio next to it.
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Bleepkit owns audio/export, so sound generated elsewhere (ElevenLabs) lives in its own folder.
const AUDIO = [join(__dirname, 'audio', 'export'), join(__dirname, 'audio', 'generated')];

function gameAudio(): Plugin {
  return {
    name: 'wetwire-audio',
    configureServer(server) {
      server.middlewares.use('/audio', (req, res, next) => {
        const name = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '');
        const f = AUDIO.map((d) => join(d, name)).find((p, i) => p.endsWith('.ogg') && p.startsWith(AUDIO[i]) && existsSync(p));
        if (!f) return next();
        res.setHeader('content-type', 'audio/ogg');
        createReadStream(f).pipe(res);
      });
    },
    closeBundle() {
      const out = join(__dirname, 'dist', 'audio');
      mkdirSync(out, { recursive: true });
      for (const d of AUDIO) if (existsSync(d)) for (const f of readdirSync(d)) if (f.endsWith('.ogg')) copyFileSync(join(d, f), join(out, f));
    },
  };
}

export default defineConfig({
  base: './',
  publicDir: false,
  server: { port: 8765 },
  preview: { port: 8765 },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  plugins: [viteSingleFile(), gameAudio()],
});
