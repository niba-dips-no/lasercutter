# Laserkutter — Havsudden contour model

Laser-cut terrain model of Havsudden and Ukintie: plywood plates, one per
contour level, stacked and glued. Roads, paths and houses are etched on the
plate they end up visible on.

Reads the baked DEM and OSM from the sibling `havsudden-3d` repo
(`../havsudden-3d/public/data`, override with `--data`). Run `npm run bake`
there first if that folder is empty.

```sh
npm install
npm run build                      # → out/
node lasercut.mjs --plates 3 --thickness 4 --scale 5000
node lasercut.mjs --area havsudden # the peninsula alone, cut at its neck
```

`out/index.html` is the interactive version: pick the area on the map, set the
plate count, thickness and scale, orbit the stack, download SVGs. It loads
Three.js from a CDN, so it needs a connection.

## Files in `out/`

| | |
|---|---|
| `bed-N.svg` | **for the cutter** — every piece at true scale on a 1200 × 900 mm sheet (Epilog Fusion Pro, Deichman Folkeverksted), 0.025 mm lines so the Epilog vector-cuts them |
| `plates-a3.svg` | all plates on one A3, scaled — for looking at |
| `overview-a3.svg` | tinted map of the model on A3 |
| `plate-N.svg` | each plate at true scale on the full frame |

Colours: **red** cut · **blue** score (outline of the plate above — where it's
glued) · **black** etched roads, paths, houses.

Elevation: NLS Finland korkeusmalli 2 m (CC BY 4.0). Map data © OpenStreetMap
contributors (ODbL).
