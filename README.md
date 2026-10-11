# Jarkanoid 3 — browser preservation port

A playable TypeScript/Canvas/WebGL port of Jérôme Barjot’s **Jarkanoid 3**, built by analyzing the original VB6 executable and extracting its resources. All **110 original levels** across three packs are available, with the original artwork, sprites, sound effects, and music. A WebGL player also brings back **nine intro/end sequences and 56 original 3D models**, using recovered transform scripts.

The engine is reimplemented; this is **not a complete decompilation of the original source** or an exact physics replica. See [reverse engineering notes](docs/reverse-engineering.md) for evidence, recovered formats, and the remaining differences.

Play at **https://jarkanoid.pourtaud.dev/**. Everything runs in the browser; no installation, account, plugin, or game server is required.

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

- Mouse, touch, or **← / → / A / D**: move the bat. On phones, use the thumb slider below the field to keep your finger off the ball.
- **Expand game** fills the available browser viewport, including iPhone Safari. Rotate to landscape for a larger field with controls alongside it; **Exit view** returns to the page. The browser address bar may remain visible.
- The phone **Launch / fire** button launches/releases balls and fires lasers while held; **Pause / Resume** is available beside it.
- Click or **Space**: launch/release a ball; hold to fire with the laser bonus.
- **P / Escape**: pause. **M**: mute. **F**: fullscreen.
- Choose a level to explore any of the 110 original walls. Game Over restarts at level 1 of the current pack.
- **Original 3D scenes** opens the recovered cinematic player, with pack/scene selection, pause, replay, and a seekable timeline.
- Settings control starting/maximum ball speed, speed gained per collision, bonus frequency, falling-object gravity, bonus count, volume, and music. Bonus frequency uses the native 1–9 scale (default 5); 0 disables drops. Types use the recovered unequal weights and eligibility rules, with a default limit of three falling bonuses. Drops inherit impact velocity; lightning targets one brick; rain reveals bricks temporarily; lasers damage armor one hit at a time. The default serve is slower than the initial port and speeds up on collisions, following the recovered rules.
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

Tests cover all 110 level grids, collisions at high speed, fixed timestep movement, paddle angles, multiball/life handling, all bonuses, explosive chains, hidden bricks, progression, browser controls, settings persistence, asset decoding, a narrow viewport, all nine 3D scenes with actual framebuffer checks, native bonus draw ranges, collision acceleration, projectile gravity, timed chains, rain restoration, sticky release, settings migration, and Game Over progression. Descended brick pixels are compared directly with their source artwork. Browser tests run one worker to limit memory usage. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to reuse an existing Chromium executable.

## Project

- `src/engine.ts`: deterministic game model and fixed timestep physics, independent of the DOM.
- `src/renderer.ts`: Canvas renderer using extracted sprite atlases and level artwork.
- `src/cinematics.ts`: WebGL playback of recovered D3D meshes and J3S scripts.
- `src/sound-map.ts`: bonus and gameplay sound IDs traced to native handlers.
- `src/audio.ts`: original sampled/tracker audio and MIDI note playback.
- `src/main.ts`: browser controls, level browser, settings, and session UI.
- `tools/`: reproducible extraction, audio conversion, and native binary analysis.
- `docs/reverse-engineering.md`: format specifications, native addresses, and fidelity limitations.

Downloaded binaries, raw analysis output, and extracted game assets are intentionally excluded from Git. `npm run setup:assets` recreates them from the official download. Do not run extraction while a game session is using those files.

## Credits and rights

Original game and assets © Jérôme Barjot / ElitzaSoftware. [Original website](http://www.jarkanoid.com/) · [About the author](http://www.jarkanoid.com/aboutjb.htm).

The official site describes the game as freeware; that is not an open-source license. No license or ownership claim over the original game, graphics, levels, or music is made here. This repository is an unofficial preservation project, not endorsed by the original author.

Personal bird logo and its greeting animation come from Robin Pourtaud’s Pond design reference, used only in the bottom “port by” credit. Reduced motion disables the greeting.

Fonts: Barlow Condensed, DM Sans, IBM Plex Mono, and Quicksand, distributed under the accompanying SIL Open Font Licenses in `public/fonts/`.

Between levels, the recovered squeeze-and-mirror transition now plays automatically before the next serve. Score and lives carry over; pack completion keeps the next-pack choice.

## Hosting

Cloudflare serves the static `dist/` directory at `jarkanoid.pourtaud.dev`. Wrangler is a development/deployment dependency only; it is never downloaded or needed by players. No Worker application code or backend runs the game. Keep extracted game assets local and run asset setup before building a new checkout.

With Cloudflare credentials supplied through the environment, run `npm run build`, then `npx wrangler deploy`. The account needs permission to deploy Workers and attach the configured custom domain. Never put credentials in the public directory or repository. For content-only updates with restricted zone permissions, `npx wrangler versions upload` followed by `npx wrangler versions deploy <returned-version-id>@100 --yes` preserves the existing domain binding.
