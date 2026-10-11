# Recovery and fidelity notes

## Input and provenance

The supplied URL, `http://www.jarkanoid.com/aboutjb.htm`, is the author’s biography. The actual game is linked from the official [download page](http://www.jarkanoid.com/download.htm).

Input: `http://www.jarkanoid.com/Downloads/JARKANOID3.exe`, retrieved for this port on 2026-10-12 (Asia/Tokyo).

| Binary                        | SHA-256                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| Official Inno Setup installer | `ec788786aa8578c7c1bef527a24df6266595dd7450f99b44e9bd174bc29a7736` |
| Extracted `JIII.exe`          | `ed134d176b1751783230f53b5c85483c619db8d9e2f379e6cc2c279e5e319c54` |

`JIII.exe` is a native x86 Visual Basic 6 executable, version 1.00.1952, importing `MSVBVM60.DLL`. Its retained names include `CHARGEMENT_DU_NIVEAU`, `MOUVEMENT_DE_LA_BALLE`, `COLLISIONS_BAT_BALLES`, `DESTRUCTION_DES_BRIQUES`, and `COLLISION_BAT_BONUS0` through `21`. The VB header is at virtual address `0x406bd0`; 89 object/module descriptors survive.

The three pack executables are PE resource containers. Pack0 and Pack1 contain 30 levels each; Pack2 contains 50. No Windows executable was launched during recovery. `innoextract` extracts the installer, `pefile` reads the PE resource tree, Pillow decodes images, and Capstone disassembles x86 code. The pack hashes are recorded in the generated `public/assets/manifest.json`.

## Recovered data formats

### Levels

Each `CODE/101`… resource begins with **1,054 little-endian signed 16-bit integers**, totaling 2,108 bytes. This is a row-major **31-column × 34-row** grid. Some resources have trailing padding, which the game’s loader does not read.

The loader at `0x417f40` loops through index `0x41d` inclusive, reads a two-byte value with `__vbaGet3`, and records nonzero cells plus separate counts for `-1` and `-2`. The paired `LEVEL` resource is a **1023 × 680 JPEG**, so each grid cell maps directly to a **33 × 20** rectangle of the artwork. `TILES` supplies the tiled background revealed when bricks disappear.

| Value         | Recovered behavior                                                    |
| ------------- | --------------------------------------------------------------------- |
| `0`           | Empty cell                                                            |
| `1`, `2`, `3` | Remaining hits                                                        |
| `-1`          | Hidden brick; contact reveals it with one hit remaining               |
| `-2`          | Explosive cell; destruction can propagate to adjacent explosive cells |

At `0x42fe20`, a `-1` cell becomes `2` and is decremented to `1`. A `-2` cell becomes `1`, is marked for explosion, and is decremented to `0`. In `0x42dee0`, the explosion pass marks neighboring `-2` cells, including diagonals. The hidden-brick helper at `0x448430` reveals hidden cells when the remaining wall contains only hidden bricks. The port uses an explicit queue for explosive chains instead of frame-by-frame native bookkeeping.

The recovered grid value sets and counts were checked across all 110 levels. Tests compare the loaded TypeScript cells with every extracted grid and decode all level and background images in Chromium.

### Sprites

Sprite resources are complete BMP files, including their headers and palettes. They include 36 ball and bat animation frames, 22 bonus icons, bullets, collision/explosion effects, and eight water frames. The extractor converts these into one transparent PNG atlas per pack, preserving dimensions and frame order. Near-black pixels that quantize to RGB565 zero become transparent.

The normal bat comprises 9 × 21 left/right pieces and an 89 × 21 center; the port stretches the center for bat-size changes. The ball source image is 15 × 15. Bonus images are 33 × 33.

### Sound and music

`SOUNDS` resources are RIFF/WAVE containers with MP3-compressed audio. The extractor copies their `data` chunks into `.mp3` files. `MUSICS` resources can contain the same RIFF format, Standard MIDI files, or short resource-reference records. A four-byte record beginning with `B` references a tracker module (`MODULES`, ID `100 + byte[1]`); `A` references another music entry. The port uses the nearest preceding music entry for a level, offset past the three intro/outro/win entries.

Tracker modules are rendered using libopenmpt and encoded with FFmpeg. MIDI note timing, pitch, and velocity are decoded with `@tonejs/midi`; playback uses Web Audio oscillators. MIDI instrument timbres therefore differ from the Windows synthesizer. Bonus sound IDs are now traced through the native handlers and loader; music transitions and a few generic collision sound triggers remain adapted.

## Native functions used to reconstruct behavior

Run `npm run analyze` after asset setup. It writes full native disassembly, the retained module list, and these individual function bodies into `research/`. Addresses are virtual addresses for the pinned `JIII.exe`, not file offsets.

The dispatcher at `0x4298a0` tests bonus indices 0–21 and calls the following functions:

| Index | Native address | Port behavior            |
| ----- | -------------- | ------------------------ |
| 0     | `0x430170`     | Double existing balls    |
| 1     | `0x430500`     | Multiply ball count by 10|
| 2     | `0x4308f0`     | Enlarge bat              |
| 3     | `0x430ba0`     | Piercing balls           |
| 4     | `0x430de0`     | Descend wall             |
| 5     | `0x431320`     | Explosive balls          |
| 6     | `0x431560`     | Power balls              |
| 7     | `0x4317a0`     | Laser bat                |
| 8     | `0x431ea0`     | Lightning                |
| 9     | `0x4326a0`     | Sticky bat               |
| 10    | `0x432b00`     | Shrink bat               |
| 11    | `0x432db0`     | Enlarge balls            |
| 12    | `0x433080`     | Shrink balls             |
| 13    | `0x4332f0`     | Fast balls               |
| 14    | `0x433550`     | Slow balls               |
| 15    | `0x4337b0`     | Lose a life              |
| 16    | `0x435210`     | Extra life               |
| 17    | `0x435440`     | Detonate explosive cells |
| 18    | `0x4359f0`     | Rain / reveal            |
| 19    | `0x4444a0`     | Skip level, +1,000       |
| 20    | `0x448660`     | +5,000                   |
| 21    | `0x448880`     | −5,000                   |

Recovered score logic, expressed as pseudocode:

```text
0x42f270: score += 10; remaining_bricks -= 1
ordinary bonus handlers: score += 20
0x444543: score += 0x3e8; request_next_level = true
0x448703: score += 0x1388
0x448923: score -= 0x1388
score display logic clamps negative scores to zero
```

The default life count is set to `3` at `0x40f1ad`. Ball storage is initialized for `100` balls at `0x42d417`. Several powers set a native counter to `0xe10` (3,600); translating those counters to 30 seconds is a port choice, not a verified measurement of the Windows game.

## Second recovery pass

### Bonus probability, eligibility, and sizes

The initial port selected each type uniformly with a separate 16% drop test. That was incorrect. `0x429200` uses one random draw for both occurrence and type. Native initialization `0x40e4e1` sets frequency to 5; `0x40f21e–0x40f236` calculates `denominator = (17 - frequency) * 100`. The native range is 1–9. The port additionally supports 0 to turn drops off.

The draw is `__vbaFpI2(Rnd * denominator)`, rounding to nearest even. Values above 165 produce no candidate. These are candidate probabilities per destroyed brick at default frequency 5, **before** eligibility, the screen limit, and cooldown:

| Bonus index / category | Integer range | Default candidate chance |
| --- | --- | --- |
| 0, double balls | 0–14 | 14.5 / 1200 = 1.2083% |
| 1, tenfold balls | 15–29 | 15 / 1200 = 1.25% |
| 2–14, each type | successive 7-value ranges, 30–120 | 7 / 1200 = 0.5833% |
| 15, lose life | 121–135 | 15 / 1200 = 1.25% |
| 16, extra life | 136 | 1 / 1200 = 0.0833% |
| 17, detonate | 137–143 | 7 / 1200 = 0.5833% |
| 18, rain | 144–150 | 7 / 1200 = 0.5833% |
| 19, next level | 151 | 1 / 1200 = 0.0833% |
| 20, +5000 | 152–158 | 7 / 1200 = 0.5833% |
| 21, −5000 | 159–165 | 7 / 1200 = 0.5833% |

The zero endpoint has a half-width rounding interval. Total default candidate probability is **165.5/1200 = 13.7917%**. A rejected candidate is discarded, not rerolled or redistributed among eligible types. `0x429627` suppresses next-level drops when the denominator is below 1200 (frequency above 5).

`0x40eae8` supplies a default screen limit of **3**, not the first port's 6. The counter at `0x474d7a` must reach **40 native updates** between drops (`0x42925d`, increment at `0x4189cd`). The browser maps that to 40/60 seconds; the Windows runtime's actual wall-clock cadence has not been measured. Tests enumerate every draw range and 120,000 stratified default draws, then check exclusions separately.

Eligibility rejects duplicates on screen, mutually pending multiball types, already active powers, oversized/undersized bats or balls, power-ball drops without armored bricks, rain without hidden bricks, detonation without explosive bricks, and lives beyond 100. Multiball eligibility allows at most 50 existing balls for doubling and 10 for tenfold. The handlers snapshot existing balls: index 0 clones **each** original ball once; index 1 clones **each** nine times in 36-degree directions. Both preserve source speed. This corrects the first port's global +1/+9 behavior.

Reset routine `0x42d471` sets ball **diameter 10**, with size steps 5 and eligible diameters 5/10/15. `0x42d47a` sets bat width **87**, with steps 20 and bounds 27/247. The source sprites are larger than the default rendered sizes. The browser now uses those recovered values.

Rain handler `0x4359f0` reveals hidden bricks and enables the original ten-frame RAIN overlay. It does not create projectiles. The animation counter runs 20 cycles of ten frames, advancing every four updates (`0x42ec3a`); the browser maps this to 800/60 seconds. Native hidden-brick restoration bookkeeping remains incompletely understood, so the port retains revealed cells.

### Recovered sound routing

The loader `0x444a60` associates `\FILE1` through `\FILE35` with DirectSound objects. Bonus handlers set flags consumed by `0x442d70`. Matching flags to loaded objects yields these `SOUNDS` resource indices (subtract 100 from PE resource IDs):

```text
bonus index:  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21
sound index:  3 21  7 22 19 23 20  9  1 24 17 25 26  8  4 27 12  2 11 33 34 35
```

Normal/sticky bat contacts use 13/14, ball loss 16, laser firing 18, explosive-ball impacts 15, explosive chains 5, and revealing hidden bricks 6. These are now separately routed. MIDI synthesis remains approximate.

### Cinematic mesh and script formats

`OBJECTS_INTRO`, `OBJECTS_OUTRO`, and `OBJECTS_YOUWON` contain triangle lists of **32-byte D3DVERTEX records**: eight little-endian float32 values (`x,y,z,nx,ny,nz,u,v`). Every resource size is divisible by 96. `IND/101`, `102`, `103` contain twenty int16 texture numbers, resolving to `TILES/(100 + number)`. Extraction preserves every vertex byte and converts texture images to PNG.

`J3S_*` begins with twenty 9-float object states: position XYZ, scale XYZ, rotation XYZ in degrees. Then `[-10, duration]` starts a segment. Triplets `[object (1-based), channel (-1…-9), velocity]` add a per-frame velocity for the corresponding state component. Velocities reset between segments. This interpretation is verified against the loader at `0x43e390`, decoder `0x43fb50`, channel handlers starting `0x4401f0`, integration loop `0x43f412`, and reset at `0x43f883`.

The native world transform scales, rotates X/Y/Z, and translates (`0x436fb0`). Camera setup at `0x43c58b` uses eye `(0,0,-20)`, target `(0,0,0)`, up `(0,1,0)`. Projection setup at `0x43c485` supplies near 1, far 300, and field of view π/2. The WebGL shader implements this geometry; shading is a browser approximation rather than an emulation of Direct3D 7.

| Pack | Intro models / frames | Outro models / frames | Victory models / frames |
| --- | --- | --- | --- |
| Original | 13 / 5166 | 1 / 842 | 2 / 3301 |
| Pack 2 | 7 / 2654 | 2 / 555 | 7 / 2263 |
| Pack 3 | 15 / 7184 | 3 / 1753 | 6 / 3811 |

The Original intro has 60 trailing bytes that do not decode as complete commands; Pack 2 victory has 288. The extractor retains the valid prefix and reports `trailingBytes`; it does not invent missing commands. These are observed undecodable records, not proof of how the original runtime handled them. The other seven scripts decode to the end. Native LIGHT resources are not yet emulated. Playback uses 60 frames/second with a seekable timeline; the source scripts store frame counts, not timestamps. Scene music comes from entries 101–103.

The viewer loads these sequences on demand, pauses gameplay underneath, frees GPU objects on close, and returns to the same game state. Browser tests load all nine, seek several points, and inspect actual WebGL framebuffer pixels and errors. Firefox was also visually checked on the physical Mac.

## What is and is not reproduced

Recovered exactly from resources: all 110 level grids, per-cell source artwork, tiled backgrounds, source sprite frames, sampled sounds, tracker compositions, MIDI note data, 56 D3D meshes, their texture indices, and the valid transform records of nine cinematic scripts.

Reimplemented in TypeScript: ball motion, paddle collision/steering, brick collision/damage, hidden/explosive bricks, 100-ball capacity, all 22 bonus categories, scoring, lives, level progression, pause, settings, and browser persistence.

Adapted or approximate: continuous physics and acceleration, power durations, fast/slow eligibility details, rain lifetime/hidden-state restoration, lightning targeting, some settings semantics, generic collision sound triggers, music transitions, cinematic lighting, and chain-reaction timing. The new engine uses a 120 Hz fixed timestep and substeps to avoid tunneling; it is not a literal translation of every native collision routine.

Not reproduced: complete native lighting scripts, undecoded cinematic tail records, full native menu/high-score UI, and every cosmetic reflection/rotation effect. Original Windows gameplay was not run side-by-side, so full behavioral equivalence is **not verified**. No physical iPhone testing was performed; touch input was exercised in a narrow Chromium viewport on the physical Mac.

This is a working resource-backed preservation port, with partial reverse engineering of executable behavior. It is not the original VB6 source restored in full.

## References

- [Official site](http://www.jarkanoid.com/) and [official download](http://www.jarkanoid.com/download.htm).
- [python-vb](https://github.com/williballenthin/python-vb): reference for VB6 executable header and object-table layouts. The small local parser follows those documented structures; no third-party parser source is shipped.
- [libopenmpt C API](https://lib.openmpt.org/doc/group__libopenmpt__c.html): tracker module decoding.

- [Microsoft Direct3D vertex formats](https://learn.microsoft.com/en-us/windows/win32/direct3d9/d3dfvf) and [transform conventions](https://github.com/MicrosoftDocs/win32/blob/docs/desktop-src/direct3d9/transforms.md).
