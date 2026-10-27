# Workshop files

Two jobs for the laser, run in this order (each as SVG, DXF or AI, whichever the software takes; the AI files are PDF inside, with one layer per pen, and open in Illustrator):

1. `1-etch-bed-1` — etching: black etch (roads, paths, houses, forest dots, dog and keyring art) and blue score (outlines where plates are glued, piece numbers).
2. `2-cut-bed-1` — cutting: red lines only, every piece, the housing parts, keyring and dog discs and their holes.

Both are the same 1200 × 900 mm sheet at true scale (mm), same coordinates, 0.025 mm hairlines (roads are 0.8 mm strokes). Each has two small grey registration crosses (1 mm in from the top-left and bottom-right corners): import both files the same way and the crosses must land on top of each other; do not cut or etch them (grey, DXF layer REGISTER). Etch first so the loose pieces don't shift.

Built with: `node lasercut.mjs --plates 12 --thickness 3 --dots --housings 2 --keyrings 12 --dogs 2 --no-notes`
(Havsudden peninsula 1:2000, 12 land plates, 3 mm board, forest dots, 2 housings, 12 keyrings, 2 dog discs, no operator notes.)

`dog-test.svg` (310 × 110 mm) is a separate test burn: the dog disc at 0.25 / 0.3 / 0.4 mm hatch spacing, left to right. Run it on a scrap first; the sheet uses 0.3.
