# Jarkanoid 3 — browser preservation port

A playable TypeScript/Canvas port of Jérôme Barjot’s **Jarkanoid 3**, built by analyzing the original VB6 executable and extracting its resources. All **110 original levels** across three packs are available, with the original artwork, sprites, sound effects, and music.

The engine is reimplemented; this is **not a complete decompilation of the original source** or an exact physics replica. See [reverse engineering notes](docs/reverse-engineering.md) for evidence, recovered formats, and the remaining differences.

## Run locally

Requires Node.js 22.12+ and Python 3.10+. Asset preparation additionally uses `innoextract`, `ffmpeg`, and `libopenmpt`.

```sh
# macOS, once
brew install innoextract ffmpeg libopenmpt
npm ci
npm run setup:assets
npm run dev
```

Open the local URL printed by Vite. The setup command downloads the [official installer](http://www.jarkanoid.com/Downloads/JARKANOID3.exe), verifies its SHA-256, and extracts resources. **It never executes any Windows binary.** It renders the tracker music to MP3 using libopenmpt. Later runs reuse the downloaded installer and rendered tracks.

On Linux, install the corresponding `innoextract`, `ffmpeg`, and `libopenmpt0` packages before setup. Windows users can use WSL. The browser game itself has no operating-system dependencies.

## Play

- Mouse, touch, or **← / → / A / D**: move the bat.
- Click or **Space**: launch/release a ball; hold to fire with the laser bonus.
- **P / Escape**: pause. **M**: mute. **F**: fullscreen.
- Choose a level to explore any of the 110 original walls.
- Settings control ball speed, acceleration, bonus frequency, falling speed, bonus count, volume, and music.
- Best score, selected level, completed levels, and settings persist in local storage. A page reload starts a fresh session on the selected level; in-flight game state is not saved.

## Build and verify

```sh
npm run build
npm run preview
npm test
npx playwright install chromium
npm run test:browser
```

`dist/` is a standalone static site with locally hosted assets and fonts. Serve it over HTTP; opening `index.html` via `file://` does not support module/data loading. For hosting in a subdirectory, use `npm run build -- --base=/your-path/`.

Tests cover all 110 level grids, collisions at high speed, fixed timestep movement, paddle angles, multiball/life handling, all bonuses, explosive chains, hidden bricks, progression, browser controls, settings persistence, asset decoding, and a narrow viewport. Browser tests run one worker to limit memory usage. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to reuse an existing Chromium executable.

## Project

- `src/engine.ts`: deterministic game model and fixed timestep physics, independent of the DOM.
- `src/renderer.ts`: Canvas renderer using extracted sprite atlases and level artwork.
- `src/audio.ts`: original sampled/tracker audio and MIDI note playback.
- `src/main.ts`: browser controls, level browser, settings, and session UI.
- `tools/`: reproducible extraction, audio conversion, and native binary analysis.
- `docs/reverse-engineering.md`: format specifications, native addresses, and fidelity limitations.

Downloaded binaries, raw analysis output, and extracted game assets are intentionally excluded from Git. `npm run setup:assets` recreates them from the official download. Do not run extraction while a game session is using those files.

## Credits and rights

Original game and assets © Jérôme Barjot / ElitzaSoftware. [Original website](http://www.jarkanoid.com/) · [About the author](http://www.jarkanoid.com/aboutjb.htm).

The official site describes the game as freeware; that is not an open-source license. No license or ownership claim over the original game, graphics, levels, or music is made here. This repository is an unofficial preservation project, not endorsed by the original author.

Fonts: Barlow Condensed, DM Sans, and IBM Plex Mono, distributed under the accompanying SIL Open Font Licenses in `public/fonts/`.
