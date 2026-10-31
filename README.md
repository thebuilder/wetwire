# Wetwire

A modern take on Syndicate (1993): real-time cyberpunk squad tactics in the browser. Pixel-art 3D city,
a vector network layer for hacking, 90s mood. Four cyborg agents, contracts across a corporate city,
territory to tax and hold.

Built with Three.js (r149) as one self-contained page. Music and sound effects are made with
[Bleepkit](https://github.com/thebuilder/bleep-kit).

## Run it

```sh
npm install
npm run dev        # builds dist/ and serves it on http://localhost:8765
npm test           # builds, then runs the headless smoke tests
```

## Layout

| Path | What |
| --- | --- |
| `src/` | Game source. `head.html` is the markup and CSS; the `.js` files are joined in order into one script. |
| `scripts/` | `build.mjs` (dist), `serve.mjs`, `icons.py` (weapon icon import) |
| `tests/` | Playwright smoke tests: `run.mjs` and one file per scenario in `tests/scenarios/` |
| `audio/` | Bleepkit project: songs, instruments, sfx as JSON, plus the exported `.ogg` files the game loads |
| `art/` | Source art: weapon icons and the agent figure |
