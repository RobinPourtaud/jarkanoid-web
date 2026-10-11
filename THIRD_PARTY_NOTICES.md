# Third-party and artwork notices

The root MIT license covers Robin Pourtaud’s new browser implementation, tools, tests, and documentation. It does not grant rights to the materials below.

## Original Jarkanoid 3 materials

Jarkanoid 3 and its original artwork, level designs, sprites, sounds, music, meshes, and cinematic data are © Jérôme Barjot / ElitzaSoftware. The official game was distributed as freeware, not under this repository’s MIT license.

Original installers, executables, and extracted resources are not tracked in this repository. `npm run setup:assets` downloads the official installer and prepares local resources without executing the Windows binary. Screenshots under `docs/screenshots/` depict original game artwork and retain its attribution.

- [Original website](http://www.jarkanoid.com/)
- [About the original author](http://www.jarkanoid.com/aboutjb.htm)

This is an unofficial preservation port, not endorsed by the original author.

## Fonts

Barlow Condensed, DM Sans, IBM Plex Mono, and Quicksand retain their SIL Open Font Licenses. The complete notices are distributed alongside the fonts in `public/fonts/`.

## Personal artwork

The bird artwork in `src/robin.svg` is Robin Pourtaud’s personal identity artwork and is not covered by the code’s MIT license. Forks may remove or replace the personal credit component.

## Dependencies

Third-party software dependencies retain their own licenses and notices, distributed with their packages. They are recorded in `package.json`, `package-lock.json`, and `tools/requirements.txt`.
