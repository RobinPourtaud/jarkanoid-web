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

Tracker modules are rendered using libopenmpt and encoded with FFmpeg. MIDI note timing, pitch, and velocity are decoded with `@tonejs/midi`; playback uses Web Audio oscillators. MIDI instrument timbres therefore differ from the Windows synthesizer. Sound-event assignments and some music transition behavior are adaptations rather than fully traced native behavior.

## Native functions used to reconstruct behavior

Run `npm run analyze` after asset setup. It writes full native disassembly, the retained module list, and these individual function bodies into `research/`. Addresses are virtual addresses for the pinned `JIII.exe`, not file offsets.

The dispatcher at `0x4298a0` tests bonus indices 0–21 and calls the following functions:

| Index | Native address | Port behavior            |
| ----- | -------------- | ------------------------ |
| 0     | `0x430170`     | Add one ball             |
| 1     | `0x430500`     | Add nine balls           |
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

## What is and is not reproduced

Recovered exactly from resources: all 110 level grids, per-cell source artwork, tiled backgrounds, source sprite frames, sampled sounds, tracker compositions, and MIDI note data.

Reimplemented in TypeScript: ball motion, paddle collision/steering, brick collision/damage, hidden/explosive bricks, 100-ball capacity, all 22 bonus categories, scoring, lives, level progression, pause, settings, and browser persistence.

Adapted or approximate: continuous physics and acceleration, power durations and eligibility/weights, rain and lightning targeting/visuals, bat size limits, original settings semantics, audio-event mapping, music transitions, and chain-reaction timing. The new engine uses a 120 Hz fixed timestep and substeps to avoid tunneling; it is not a literal translation of every native collision routine.

Not reproduced: the original Direct3D intro/outro/win cinematics, full native menu/high-score UI, and every cosmetic reflection/rotation effect. Original Windows gameplay was not run side-by-side, so full behavioral equivalence is **not verified**. No physical iPhone testing was performed; touch input was exercised in a narrow Chromium viewport on the physical Mac.

This is a working resource-backed preservation port, with partial reverse engineering of executable behavior. It is not the original VB6 source restored in full.

## References

- [Official site](http://www.jarkanoid.com/) and [official download](http://www.jarkanoid.com/download.htm).
- [python-vb](https://github.com/williballenthin/python-vb): reference for VB6 executable header and object-table layouts. The small local parser follows those documented structures; no third-party parser source is shipped.
- [libopenmpt C API](https://lib.openmpt.org/doc/group__libopenmpt__c.html): tracker module decoding.
