# Wetwire

A modern take on Syndicate (1993): real-time cyberpunk squad tactics in the browser. Pixel-art 3D city,
a vector network layer for hacking, 90s mood. Four cyborg agents, contracts across a corporate city,
territory to tax and hold.

Built with TypeScript, Vite and Three.js (r149) as one self-contained page. Music and sound effects are made with
[Bleepkit](https://github.com/thebuilder/bleep-kit).

## Run it

```sh
npm install
npm run dev        # dev server on http://localhost:8765
npm run build      # writes dist/index.html and dist/audio
npm test           # typecheck, build, then the headless smoke tests
```

## Layout

| Path | What |
| --- | --- |
| `index.html` | Page markup and game CSS |
| `src/` | Game source as TypeScript modules; `src/main.ts` is the entry, `src/pages.ts` the company terminal and `src/terminal/` its CRT renderer |
| `scripts/` | `icons.py` (weapon icon import) |
| `tests/` | Playwright smoke tests: `run.mjs` and one file per scenario in `tests/scenarios/` |
| `audio/` | Bleepkit project: songs, instruments, sfx as JSON, plus the exported `.ogg` files the game loads |
| `art/` | Source art: weapon icons and the agent figure |
