# Wetwire

A modern take on Syndicate (1993) in the browser: pixel-art 3D city (Three.js r149, WebGL2), real-time
squad tactics, a hacking network layer, territory and taxes. The 1993 game is the reference for feel;
when in doubt, ask "how did Syndicate do it?" before inventing a new system.

The plan for growing this into a six hour game (story, contracts, progression, difficulty, order of work) is in `docs/GAME_PLAN.md`.

## Commands

- `npm run dev`: Vite dev server on http://localhost:8765.
- `npm run build`: writes one self-contained `dist/index.html` (Three.js included) and copies `audio/export/*.ogg` to `dist/audio/`.
- `npm run typecheck`: `tsc --noEmit`. Keep it at zero errors.
- `npm run combat`: combat simulator from the shell, every squad preset against every enemy mix. In the game, type `sim` at the terminal. It runs real fights through `step()`, so check it after changing weapons, armour or enemy AI.
- `npm test`: typecheck, build, then headless smoke tests. `node tests/run.mjs squad traffic` runs only those scenarios. Screenshots go to `tests/shots/`; look at them after UI or rendering changes.

## How the code fits together

- TypeScript ES modules, bundled by Vite into ONE page. `index.html` holds the markup and game CSS, and `src/main.ts` is the entry.
- Types are loose so far: `strict` is off and most game code is implicitly `any`. Tighten file by file; new code gets real types (see `src/terminal/`).
- Load order matters. Top-level `const`s and statements run in module order, so a module pulled in early through an import cycle can hit a not-yet-initialized `const` from a later one. Keep the world layer (up to `engine.ts`) free of imports from the game layer, and only import `main.ts` from nowhere. `main.ts` also imports the modules that register themselves as they load (`levels`, `levels2`, `missions`).
- Imported `let`s are read-only, so a `let` written from another file has a setter beside it (`heat` and `setHeat`). Reads stay plain.
- `window.__wetwire` (end of `src/main.ts`) exposes internals for tests and debugging. Add anything a test needs there.
- The menus are one immediate-mode screen: each frame `pages.ts` redraws from the save, so handlers only change state. Tests click by region id (`w.term.click('buy')`) and read the screen with `w.term.screenText()`. The mission HUD stays DOM, in `index.html`, and follows the phosphor through CSS variables set by `applyPhosphor`.
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
| `campaign.ts` | campaign data: `WEAPONS`, `GEAR`, `RESEARCH`, `MISSIONS`, mods; save files and agent looks |
| `setup.ts` | mission state and setup, spawning, driving |
| `sim.ts` | agents, NPC AI, police, combat, hacking, vehicles |
| `chaos.ts` | fire, explosive barrels, panic; the scanner |
| `missions.ts` | per-mission scripts (`SCRIPTS[id]`), territory and taxes, intel |
| `icons.ts` | generated weapon icon images; never edit by hand |
| `flow.ts`, `commands.ts`, `input.ts` | mission flow and debrief data, squad orders, mouse and keyboard |
| `hud.ts`, `tactical.ts` | mission HUD, lab panel; tactical pause, field tips, vision cones |
| `pages.ts` | the company terminal: title, file select, login, contracts, territory, squad, research, system, debrief, typed commands |
| `maps.ts` | contract and territory maps, drawn as vectors into a bitmap with colours in the CRT's channels |
| `present.ts` | per-frame instance upload and the 2D overlay |
| `main.ts` | frame loop, startup, `window.__wetwire` |
| `combatsim.ts` | the combat simulator: arena, squad bot, batch runner and its tool page |
| `terminal/term.ts` | immediate-mode character grid and WebGL CRT pass. `tick()` runs from the game's frame loop while the terminal is on screen |
| `terminal/doll.ts` | the agent figure as pixels, built from an `AgentLook` (face, hair, skin, mods) |
| `terminal/art.ts`, `terminal/logo.ts` | weapon icons to phosphor bitmap; the spinning Kessel logo, shown when logging in |
| `terminal/wordmark.ts` | the animated WETWIRE wordmark, and its intro: the self-routing circuit board, letter tracing and sparks |

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

Commit the exported `.ogg` files; the build only copies them. Sound made elsewhere goes in `audio/generated/`, which Bleepkit never touches: the theme (`theme.ogg`) is an ElevenLabs track, leveled to about -18 LUFS like the rest of the music, looping 7 to 164s, with its end blended into the opening (`SONGS` in `src/engine.ts`). The owner wants it slow, cold and synth-led, changing through arrangement rather than energy: a short repeating drum loop got grating, and bright, busy drums made it sound like a rock song. A new sound also needs its name in `SFXN`
in `src/engine.ts`. The owner dislikes bell-like and laser-like timbres in music, and constant beeps.

## Art

Weapon and gear icons: `python3 scripts/icons.py add <image.png> <id>` imports upscaled pixel art (e.g.
512x256 at 4x on transparency) as icon `<id>` and regenerates `src/icons.ts`. `<id>` is the `WEAPONS` or
`GEAR` key. The agent figure is pixel data in `art/doll/m.px` and `f.px`: one character per pixel, space for transparent, 0 to 5 for brightness. Edit those directly; `node scripts/doll.mjs` regenerates them from the PNGs and overwrites edits. `src/terminal/doll.ts` draws the face, hair and cyborg mods over the body from an `AgentLook`, so add options there. Never convert images to characters: ASCII is only for things drawn as ASCII, like the logo.

## Conventions

- Never use em dashes anywhere: code, comments, UI text, docs, commit messages. Use commas or hyphens.
- UI copy is minimal: no taglines, helper text or secondary labels. If a screen needs them, fix the layout.
- Prefer showing over telling: one clear on-screen cue beats several log messages.
- Keep the style of the surrounding code: compact, plain functions, comments only where intent is not obvious.
- After a change: `npm test`, look at the relevant screenshots, then publish.
