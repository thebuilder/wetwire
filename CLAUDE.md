# Wetwire

A modern take on Syndicate (1993) in the browser: pixel-art 3D city (Three.js r149, WebGL2), real-time
squad tactics, a hacking network layer, territory and taxes. The 1993 game is the reference for feel;
when in doubt, ask "how did Syndicate do it?" before inventing a new system.

## Commands

- `npm run dev`: Vite dev server on http://localhost:8765. The terminal mockup is at `/mockups/terminal.html`.
- `npm run build`: writes one self-contained `dist/index.html` (Three.js included) and copies `audio/export/*.ogg` to `dist/audio/`.
- `npm run typecheck`: `tsc --noEmit`. Keep it at zero errors.
- `npm test`: typecheck, build, then headless smoke tests. `node tests/run.mjs squad traffic` runs only those scenarios. Screenshots go to `tests/shots/`; look at them after UI or rendering changes.

## How the code fits together

- TypeScript ES modules, bundled by Vite into ONE page. `index.html` holds the markup and game CSS, and `src/main.ts` is the entry.
- Types are loose so far: `strict` is off and most game code is implicitly `any`. Tighten file by file; new code gets real types (see `src/terminal/`).
- Load order matters. Top-level `const`s and statements run in module order, so a module pulled in early through an import cycle can hit a not-yet-initialized `const` from a later one. Keep the world layer (up to `engine.ts`) free of imports from the game layer, and only import `main.ts` from nowhere. `main.ts` also imports the modules that register themselves as they load (`levels`, `levels2`, `missions`).
- Imported `let`s are read-only, so a `let` written from another file has a setter beside it (`heat` and `setHeat`). Reads stay plain.
- `window.__wetwire` (end of `src/main.ts`) exposes internals for tests and debugging. Add anything a test needs there.
- Simulation runs through `step(dt)`; tests drive it directly (`for (...) w.step(1 / 30)`) instead of waiting in real time.

| File | Holds |
| --- | --- |
| `core.ts` | renderer, shaders (MRT, reflections, palette, CRT), uniforms |
| `world_head.ts`, `city_fns.ts`, `world_build.ts` | world grid, barrels, building and prop generators |
| `layout.ts` | level framework: `defineLevel`, zones, fillers, features, ground height, road graph `RN`, sidewalks `PEDS` |
| `levels.ts`, `levels2.ts` | the levels (downtown, docks, campus, warrens, airfield) and their generators |
| `models.ts` | instanced meshes: people, cars, turrets, barrels, rain |
| `world_load.ts` | `loadWorld`: builds a level into the scene |
| `engine.ts` | routing (Dijkstra on `RN`), ground queries, audio loading and `sfx()` |
| `campaign.ts` | campaign data: `WEAPONS`, `GEAR`, `RESEARCH`, `MISSIONS`, mods; the save |
| `setup.ts` | mission state and setup, spawning, driving |
| `sim.ts` | agents, NPC AI, police, combat, hacking, vehicles |
| `chaos.ts` | fire, explosive barrels, panic; the scanner |
| `missions.ts` | per-mission scripts (`SCRIPTS[id]`), territory and taxes, intel |
| `icons.ts` | generated weapon icon images; never edit by hand |
| `flow.ts`, `commands.ts`, `input.ts` | mission flow and debrief data, squad orders, mouse and keyboard |
| `hud.ts`, `tactical.ts` | mission HUD, lab panel; tactical pause, field tips, vision cones |
| `pages.ts` | current DOM company terminal (contracts, territory, squad, research, system), to be replaced |
| `present.ts` | per-frame instance upload and the 2D overlay |
| `main.ts` | frame loop, opening sequence, boot, `window.__wetwire` |
| `terminal/term.ts` | new terminal: immediate-mode character grid and WebGL CRT pass |
| `terminal/art.ts`, `terminal/logo.ts` | game art to phosphor bitmap; the spinning Kessel logo |

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

Commit the exported `.ogg` files; the build only copies them. Sound made elsewhere goes in `audio/generated/`, which Bleepkit never touches: the theme (`theme.ogg`) is an ElevenLabs track, leveled to about -18 LUFS like the rest of the music, with its 50s intro played once and 50 to 110s looped (`SONGS` in `src/engine.ts`). A new sound also needs its name in `SFXN`
in `src/engine.ts`. The owner dislikes bell-like and laser-like timbres in music, and constant beeps.

## Art

Weapon and gear icons: `python3 scripts/icons.py add <image.png> <id>` imports upscaled pixel art (e.g.
512x256 at 4x on transparency) as icon `<id>` and regenerates `src/icons.ts`. `<id>` is the `WEAPONS` or
`GEAR` key. Sources for the agent figure are in `art/doll/`.

## Conventions

- Never use em dashes anywhere: code, comments, UI text, docs, commit messages. Use commas or hyphens.
- UI copy is minimal: no taglines, helper text or secondary labels. If a screen needs them, fix the layout.
- Prefer showing over telling: one clear on-screen cue beats several log messages.
- Keep the style of the surrounding code: compact, plain functions, comments only where intent is not obvious.
- After a change: `npm test`, look at the relevant screenshots, then publish.
