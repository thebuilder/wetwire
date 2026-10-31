# Wetwire

A modern take on Syndicate (1993) in the browser: pixel-art 3D city (Three.js r149, WebGL2), real-time
squad tactics, a hacking network layer, territory and taxes. The 1993 game is the reference for feel;
when in doubt, ask "how did Syndicate do it?" before inventing a new system.

## Commands

- `npm run build`: writes `dist/index.html` and copies `audio/export/*.ogg` to `dist/audio/`. Fails on syntax errors and on duplicate top-level names.
- `npm run dev`: build, then serve `dist/` on http://localhost:8765.
- `npm test`: build, then headless smoke tests. `node tests/run.mjs squad traffic` runs only those scenarios. Screenshots go to `tests/shots/`; look at them after UI or rendering changes.

## How the code fits together

- The game is ONE page. `scripts/build.mjs` concatenates `src/*.js` in the `ORDER` list inside a single IIFE, after `src/head.html` (markup and all CSS). Every file shares one scope: no imports, no modules. Add a new file by adding it to `ORDER`.
- Because scope is shared, two top-level functions or consts with the same name silently override each other. The build refuses duplicates; pick distinctive names (`genAirTerminal`, not `genTerminal`).
- `window.__wetwire` (end of `src/game3.js`) exposes internals for tests and debugging. Add anything a test needs there.
- Simulation runs through `step(dt)`; tests drive it directly (`for (...) w.step(1 / 30)`) instead of waiting in real time.

| File | Holds |
| --- | --- |
| `core.js` | renderer, shaders (MRT, reflections, palette, CRT), uniforms |
| `world_head.js`, `city_fns.js`, `world_build.js` | world grid, ground height, building and prop generators |
| `layout.js` | level framework: `defineLevel`, zones, fillers, features, road graph `RN`, sidewalks `PEDS` |
| `levels.js`, `levels2.js` | the levels (downtown, docks, campus, warrens, airfield) and their generators |
| `models.js` | instanced meshes: people, cars, turrets, barrels, rain |
| `world_load.js` | `loadWorld`: builds a level into the scene |
| `engine.js` | routing (Dijkstra on `RN`), ground queries, audio loading and `sfx()` |
| `game1.js` | campaign data: `WEAPONS`, `GEAR`, `RESEARCH`, `MISSIONS`, mods; mission setup |
| `game2.js` | agents, NPC AI, police, combat, hacking, vehicles |
| `chaos.js` | fire, explosive barrels, panic; the scanner |
| `missions.js` | per-mission scripts (`SCRIPTS[id]`), territory and taxes, intel |
| `icons.js` | generated weapon icon images; never edit by hand |
| `game3.js` | mission flow, HUD, terminal pages (contracts, territory, squad, research, system), debrief, input |

## Publishing

The playable build is the claude.ai artifact https://claude.ai/artifact/WZcg36zpguErNPFAa81ZGa. Publish
`dist/index.html` with that url. The page loads audio from `audio/<name>.ogg`, so pass any changed audio as
files, e.g. `{"audio/pistol.ogg": "dist/audio/pistol.ogg"}`.

## Audio

`audio/` is a Bleepkit project (https://github.com/thebuilder/bleep-kit): songs, instruments and sfx are
JSON. With bleep-kit cloned next to this repo:

```sh
node ../bleep-kit/packages/cli/src/index.ts analyze <id> --project audio   # render and measure
node ../bleep-kit/packages/cli/src/index.ts export --project audio          # writes audio/export/*.ogg
```

Commit the exported `.ogg` files; the build only copies them. A new sound also needs its name in `SFXN`
in `src/engine.js`. The owner dislikes bell-like and laser-like timbres in music, and constant beeps.

## Art

Weapon and gear icons: `python3 scripts/icons.py add <image.png> <id>` imports upscaled pixel art (e.g.
512x256 at 4x on transparency) as icon `<id>` and regenerates `src/icons.js`. `<id>` is the `WEAPONS` or
`GEAR` key. Sources for the agent figure are in `art/doll/`.

## Conventions

- Never use em dashes anywhere: code, comments, UI text, docs, commit messages. Use commas or hyphens.
- UI copy is minimal: no taglines, helper text or secondary labels. If a screen needs them, fix the layout.
- Prefer showing over telling: one clear on-screen cue beats several log messages.
- Keep the style of the surrounding code: compact, plain functions, comments only where intent is not obvious.
- After a change: `npm test`, look at the relevant screenshots, then publish.
