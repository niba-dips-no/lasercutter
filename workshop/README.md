# Workshop files

`bed-1.svg` and `bed-1.dxf` are the same sheet: 1200 × 900 mm, true scale (mm), red cut, blue score, black etch.
0.025 mm hairlines; roads are 0.8 mm strokes.

Built with: `node lasercut.mjs --plates 12 --thickness 3 --dots --housings 2 --keyrings 12 --dogs 2 --no-notes`
(Havsudden peninsula 1:2000, 12 land plates, 3 mm board, forest dots, 2 housings, 12 keyrings, 2 dog discs, no operator notes.)

`dog-test.svg` (310 × 110 mm) is a separate test burn: the dog disc at 0.25 / 0.3 / 0.4 mm hatch spacing, left to right. Run it on a scrap first; the sheet uses 0.3.
