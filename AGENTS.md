# Lasercutter — working notes for the next agent

Laser-cut terrain model of Havsudden / Ukintie (stacked plywood plates) plus a
table-top e-paper housing and keyrings, all nested onto one 1200 × 900 mm sheet for
the Epilog Fusion Pro at Deichman Folkeverksted. Repo: github.com/niba-dips-no/lasercutter
(branch `master`, local dir `~/projects/lasercutter` is now `lasercutter`, was `laserkutter`).
README.md is the user-facing description; this file is the state of play.

## Run it

```sh
npm run build                         # → out/ (index.html, bed-1.svg/.dxf, housing.md, plate-N.svg, ...)
node lasercut.mjs --area ukintie      # the wider Ukintie area (1:4250, 6 mm board were its old defaults)
node lasercut.mjs --gap 3 --keyrings 10 --thickness 4 --scale 5000
node lasercut.mjs --base              # also cut the base / sea plate
node lasercut.mjs --no-notes --no-housing
node lasercut.mjs --scale one         # biggest model that nests on one sheet (about 1:2950; slow-ish, ~4 s)
```
Reads `../havsudden-3d/public/data` (heightmap.bin/json, osm.json). Defaults: `--area havsudden`
(peninsula only, cut at the user's red line, plus two islets; coast `--sea 0.1` m) at 1:2000 (frame 476 × 432 mm), 12 land plates (2 m/plate, ~3× vertical exaggeration; true scale would be ~4), 3 mm board, smoothing `--smooth 1` cell, gap 4 mm, edge margin 10 mm,
12 keyrings, housing on. `out/` is generated and git-ignored.

## Files

- `lasercut.mjs` — CLI: DEM → model → writes `out/`. Inlines `lib/core.js` and `lib/housing.js` into
  `lib/viewer.html` (placeholders `/*__CORE__*/`, `/*__HOUSING__*/`, `/*__DATA__*/`; `export ` is stripped,
  housing goes in its own function scope so helper names can't clash).
- `lib/core.js` — everything geometric: contours, `buildModel`, `etchDetails` (roads/paths/houses),
  `landMask` (peninsula), piece items, **nesting** (`nest`, `layout`, cached per model in a WeakMap),
  `bedSheetsSVG` / `bedSheetsDXF` (built by parsing the SVG), `sheetSpace` (free-block readout),
  `fitScale`, `lineLengths`, `baseGuideSVG`, keyring generation.
- `lib/housing.js` — pure parameter-driven generator of the housing's flat parts (`housingParts`,
  `housingInfo`, `housingModel`, `HOUSING_DEFAULTS`). The page's Housing 3D tab builds meshes from the same parts.
- `lib/viewer.html` — the page: 3D model tab, Housing 3D tab (Explode slider), Cutting sheet tab (inline SVG,
  zoom, green free-space overlay). Loads Three.js from a CDN.
- `scripts/` — `housing-check.mjs` (3-D tab-vs-slot agreement, window size, pin geometry, no panel overlap at
  6/4/3 mm), `slot-check.mjs` (USB slot shape), `sheet-check.mjs out/bed-1.svg` (overlaps, min gap, extent).
  Run all three after touching housing or nesting. Expected: ALL PASS, overlaps 0, minGap ≥ gap.

## Conventions

- Colours: red `#ff0000` cut, blue `#0000ff` score + labels, black `#000000` etch, green `#00a000` operator notes
  (DXF layers CUT / SCORE / ETCH / NOTES). Bed files use 0.025 mm hairlines; plate/A3 files 0.05.
  **Roads are the exception**: one 0.8 mm wide black stroke (`ROAD_W`), paths stay dashed hairlines, houses outlines.
- Number + north arrow on a piece sit where the *next plate up covers them* (pole of the biggest piece on top).
  Pieces with nothing on top (all top-plate pieces, many plate-3) get neither: matched by shape to the blue outline.
- Blue outline on a piece = exact footprint of the piece that is glued there (same polygon as its red cut).
- Plates are nested terraces: plate k = land ≥ level k; lower pieces are solid, upper ones sit on top.
- Base / sea plate is bought separately (not on the sheet unless `--base`); `base-guide.svg` shows its outline
  and where plate 1 goes.
- Sheet notes (green text) go bottom-left of the largest free block; `--no-notes` / page checkbox turns them off.

## Nesting (core.js)

Raster nesting on a grid of R = clamp(gap/2, 1.5, 3) mm: each piece rasterised in rotations 0/90/180/270
(cells the outline touches count as filled), placed first-fit top-left; placed shapes are grown by `ceil(gap/R)`
cells so the real gap is ≥ the asked gap. Largest first; housing parts are ordinary items; keyrings are
`fill` items placed last into leftovers (never open a new sheet). `fitScale` uses R = 4 and rotations 0/1 only
(~1.5 s per call, so it is only run from the button / `--scale one`, not on every stats refresh).
SVG groups carry `translate(..) rotate(0|90|180|270)`; the DXF writer re-derives geometry by parsing them.

## Peninsula mode

The default area. `AREAS.havsudden` in `lasercut.mjs` holds a `cut` line (lat/lon of the red line's ends; kept side = Havsudden's), `islets` (Havsuddshället, one NW rock; islet cells are mask value 2 and lifted to sea+0.05 because smoothing blurs them away) and `sea: 0.1`. With a cut, `landMask` floods all land down to `sea` instead of stopping at the 2 m neck. The old description below applies to the no-cut case.

`landMask`: flood-fill land ≥ `join` (2 m) from Havsudden, then grow over land ≥ 0.5 m by true distance
(Dijkstra, 12 cells = 48 m). The old ring-by-ring growth cut diamond-shaped corners on flat shore (the user's
"lower-right corner differs between views" report). Peninsula-only also changes the top height, so plate levels
differ from the whole-area view (6.5 m vs 7.5 m steps).

## Forest hatching

Forest on the peninsula is marked with 45° etched hairlines (off by default: `--hatch` or `--hatch 2.5` mm spacing on the CLI, "Hatch the forest" checkbox on the page; at 2.5 mm it adds ~17 m of etch). `--dots [3]` / "Dot the forest" is the second, independent style: one 0.3 mm stroke per dot (one laser segment, faster than a ring) on a staggered grid, only where the whole dot sits on one plate; both can be on; bare rock, shore, roads
and house outlines stay blank. OSM can't give this (it maps the whole interior as one `bare_rock` polygon), so
`data/forest.json` is a 1-bit raster classified from a Google satellite screenshot by
`node scripts/forest-mask.mjs "<screenshot.png>"` (dark non-blue pixels = forest; placed by a Web-Mercator fit matched to
the OSM roads). `lasercut.mjs` lays it on the grid with an affine, `etchDetails` → `forestHatch` marches the lines in mm and
sorts them onto plates like roads; `pieceItems` clips them to each piece. Only the visible terrace band of each plate gets hatch.

## Keyring

The keyring is the helicopter tag from `assets/keyring.svg` (35 mm wide × 39.6 mm tall: disc + rounded tab, Ø5.25 mm punch hole with 2.6 mm of
wood above it, for a split ring). `node scripts/keyring-art.mjs` turns it into `data/keyring.json` (outline, hole, etch hatch
segments); `lasercut.mjs` passes it to core as `BED.keyringArt` and the page gets it as `DATA.keyringArt`. Plywood only has
burnt / not burnt, so tone = line density on the one ETCH pen: black → 0.25 mm hatch, ochre → 0.5 mm, cream and white → bare
wood (the current art is black only; the script also handles strokes). Art stays 0.6 mm off the edge and hole. Without `data/keyring.json` the keyrings fall back to land-shaped tags.

## Housing (lib/housing.js)

The housing parts are on the cutting sheet but carry no H1–H7 labels and the sheet notes don't mention them (the user can puzzle them together); the ids below are for `housing.md` and the 3D tab.

Wedge leaning back 12°, window exactly 165 × 100 mm, 6 mm board by default (params scale to 3/4 mm).
Outside ≈ 207 × 70 × 151 mm (223 mm wide with ear tips). Parts: H1 Front (window, pinned ears), H2 Back (pinned
ears, plain), H3 Side, H4 Side (USB), H5 Top, H6 Bottom (press-fit tabs), H7 Glass & screen frame (ring glued to the
Front's inner face; window = glass pocket; layers = ceil((glass + module thickness)/board)). Four 3 mm pins ~16 mm
lock the ears; pull the pins on one side and slide that side off to open it. Sides are cut identically except H4's
USB-C slot (8 × 14 mm tall, 25 mm up, 9 mm in front of the Back; the ESP32 board is meant to lie against the Back
on ~5 mm of foam). `usbBack: true` re-adds a back slot. Front/Back/Top/Bottom corner gaps: ~1.6 mm wedge, hidden inside.
The face is two flat cuts glued (H1 + H7) — that is by design; a laser can't cut a floored pocket.

## Unverified assumptions (check before trusting)

- Screen module 175 × 110 mm, ~1 mm thick; cover glass 175 × 110 × 1.5 mm (all user-reported, not measured).
- FireBeetle ESP32-E (DFRobot; user's docs in `../ukeplan` confirm USB-C charging) assumed ~58 × 26 mm; RS PRO
  1.8 Ah LiPo assumed 50 × 34 × 8 mm — both guesses; 1.8 Ah packs are often 8–10 mm thick.
- Slot clearance 0.1 mm and kerf ~0.15 mm are untested: do a test cut of one joint; tune `clearance`.
- Epilog behaviour for the 0.8 mm road strokes (may raster-fill thick strokes) and for DXF line widths: not
  confirmed with the workshop; DXF never opened in CAD. Laser time (≈ 23 min, range 16–35) comes from a crude
  formula in `viewer.html` (cut 40/thickness mm/s, etch 60 mm/s), not Epilog data; the user has one hour booked.
- USB-C slot 8 × 14 vs a standard plug body (~12 × 6.5 mm, from memory): measure the user's cable.
- Nothing has been physically cut yet.

## Ideas offered, not done

- Write each upper piece's number inside its blue outline on the lower piece (hidden once glued) so unnumbered
  pieces are identifiable.
- Ring alignment tabs (slots at the Front's top/bottom edges only, not through the face).
- Peninsula low-neck "tail" (48 m reach) might want trimming; reach is `grow` in `landMask`.
- Stability of the 66 mm deep housing if it feels tippy: raise `topDepth` (18 mm) or add weight.

## Testing / verifying visually

Headless Chrome works with software WebGL:
`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars --window-size=1500,900 --virtual-time-budget=30000 --screenshot=OUT.png "file://$PWD/out/index.html#housing-45"`
Hashes: `#sheet`, `#housing`, `#housing-N` (explode N mm). Clicking page controls from an injected script must wait ~6 s
(the module waits for the Three.js CDN). Flat SVGs: render with Chrome the same way and Read the PNG; the bed SVG
needs `stroke-width` replaced to be visible. Known test-only quirk: in `viewer.html`, `schedule()` cancels a
pending geometry rebuild if a non-geometry control changes in the same frame.

## User preferences

English. Commits/pushes only when asked ("commit, push"); commit messages end with the
`Co-Authored-By: Claude ...` line the harness specifies. They review by screenshot, give short corrections,
and want honest "not verified" flags rather than guesses stated as facts.

State at time of writing: everything is committed and pushed (see `git log`).
