/**
 * Laser-cut contour model of Havsudden, from the baked DEM.
 *
 *   node lasercut.mjs [--area ukintie|havsudden|all] [--plates 4]
 *                             [--thickness 6] [--scale one|N] [--margin 40] [--gap 4] [--base] [--no-notes] [--hatch [2.5]] [--dots [3]] [--keyrings 12] [--dogs 1] [--no-housing] [--housings 2]
 *
 * Reads the baked DEM and OSM from havsudden-3d (--data, default
 * ../havsudden-3d/public/data — run `npm run bake` there first). Writes to out/:
 *   index.html        interactive: pick the area on a map, set plate count,
 *                     thickness and scale, orbit the stacked model, download SVGs
 *   overview-a3.svg   tinted map of the default model on A3
 *   plates-a3.svg     every plate packed onto one A3 sheet (scaled)
 *   plate-N.svg       each plate at true scale, full frame so the stack registers
 *   bed-N.svg         every piece at true scale, packed on 1200 × 900 mm laser-bed
 *                     sheets (Epilog Fusion Pro, Deichman Folkeverksted). Without
 *                     --base the base / sea plate is left off — buy it separately
 *   bed-N.dxf         the same sheets as DXF (layers CUT / SCORE / ETCH), if the
 *                     shop's software wants that instead of SVG
 *   1-etch-bed-N.svg  the same sheets split by laser job (+ .dxf, + .ai for Illustrator): 1 = etch and score, run first;
 *   2-cut-bed-N.svg   2 = cut. Same size and coordinates, grey registration crosses in both
 *   laser-bed-N.svg   ONE flat file per sheet (+ .ai): etch black + cut red, three compound paths, no groups/text
 *   base-guide.svg   the base plate's outline and where plate 1 goes, true scale
 *
 * Roads, paths and houses from the baked OSM are etched (black) on the plate
 * each one ends up visible on. `--area havsudden` is the peninsula alone, cut
 * off at its low marsh neck at Ulkolahti (flood-filled above --join metres).
 * Geometry lives in lib/core.js, shared with the page.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { demPixelToWorld, latLonToWorld } from './vendor/projection.js';
import { WAYPOINTS } from './vendor/waypoints.js';
import { housingInfo, housingParts } from './lib/housing.js';
import { baseGuideSVG, bedSheetsAI, bedSheetsFlat, bedSheetsDXF, bedSheetsSVG, blur, buildModel, fitScale, landMask, lineLengths, overviewA3SVG, platesA3SVG, plateSVG, sheetSpace } from './lib/core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean).map((s) => {
    const [k, ...v] = s.trim().split(/\s+/);
    return [k, v.join(' ')];
  }),
);
// Named areas. A bbox is [south, west, north, east] in WGS84; a peninsula is
// a waypoint whose land is cut off at its neck (see landMask).
const AREAS = {
  // Ukintie and the Nyberga headland down to the Havsudden peninsula — traced
  // from the user's OSM screenshot. The north edge is clipped to the DEM.
  // 1:4250 is what fitted one sheet with the base plate on it; the base is bought
  // separately now, so `--scale one` would make the model bigger.
  ukintie: { bbox: [60.2109, 25.5901, 60.2346, 25.6247], scale: 4250 },
  // Cut along the user's red line across the neck (lat/lon of its two ends; override with
  // --cut "lat0,lon0,lat1,lon1"), plus Havsuddshället (the lighthouse islet, south-west) and the
  // half-submerged rock north-west of the point (the DEM has only one rock there).
  havsudden: { peninsula: 'havsudden', scale: 2000, sea: 0.1, cut: [60.217327, 25.620161, 60.211276, 25.621645], islets: [[60.21208319407668, 25.60948210416495], [60.21829930538976, 25.606072791182974]] },
  all: { scale: 5000 },
};
const AREA = args.area ?? 'havsudden';
if (!AREAS[AREA]) throw new Error(`unknown --area ${AREA}; one of ${Object.keys(AREAS).join(', ')}`);
const PLATES = +(args.plates ?? 12);
const THICK = +(args.thickness ?? 3);
// A number, or 'one': the biggest 1:N at which every piece fits one bed sheet.
const SCALE_ARG = args.scale ?? AREAS[AREA].scale;
const MARGIN_M = +(args.margin ?? 40);
// gap: mm between pieces on the bed sheet; base: also cut the base / sea plate (--base);
// notes: laser instructions written into the sheet's free space (--no-notes to leave them off)
// The designed keyring (scripts/keyring-art.mjs makes it from assets/keyring.svg); without the file the keyrings are land-shaped tags.
const KEYRING_FILE = path.resolve(HERE, args['keyring-art'] ?? 'data/keyring.json');
const KEYRING_ART = fs.existsSync(KEYRING_FILE) ? JSON.parse(fs.readFileSync(KEYRING_FILE, 'utf8')) : null;
// The dog disc (scripts/dog-art.mjs makes data/dog.json from a picture); only used with --dogs N.
const DOG_FILE = path.resolve(HERE, args['dog-art'] ?? 'data/dog.json');
const DOG_ART = fs.existsSync(DOG_FILE) ? JSON.parse(fs.readFileSync(DOG_FILE, 'utf8')) : null;
if (+(args.dogs ?? 0) > 0 && !DOG_ART) throw new Error(`--dogs needs ${DOG_FILE} (node scripts/dog-art.mjs <dog.png>)`);
const BED = { gap: +(args.gap ?? 4), base: 'base' in args, notes: !('no-notes' in args), thick: THICK, keyrings: +(args.keyrings ?? 12), keyringArt: KEYRING_ART, dogs: Math.max(0, Math.round(+(args.dogs ?? 0))), dogArt: DOG_ART, housings: Math.max(1, Math.round(+(args.housings ?? 1))), housing: 'no-housing' in args ? null : housingParts({ thickness: THICK }) };
const JOIN = +(args.join ?? 2);
// Height of the lowest plate's outline (the coast), m. The peninsula goes as low as the smoothed DEM allows.
const SEA = +(args.sea ?? AREAS[AREA].sea ?? 0.5);
const CELL = 2;    // 2 m DEM pixels → 4 m cells
const SIGMA = +(args.smooth ?? 1); // smoothing, cells (--smooth) — keeps cut lines from following every boulder; lower keeps steep spots sharper
const OUT = args.out ?? path.join(HERE, 'out');
const DATA = args.data ?? path.join(HERE, '../havsudden-3d/public/data');
const CREDIT = 'Elevation: NLS Finland korkeusmalli 2 m (CC BY 4.0)';

// ---------------------------------------------------------------- DEM

const meta = JSON.parse(fs.readFileSync(path.join(DATA, 'heightmap.json'), 'utf8'));
const buf = fs.readFileSync(path.join(DATA, 'heightmap.bin'));
const dem = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
const W = Math.floor(meta.width / CELL);
const H = Math.floor(meta.height / CELL);
const cellM = meta.pixelSize * CELL;

let grid = new Float32Array(W * H);
for (let j = 0; j < H; j++) {
  for (let i = 0; i < W; i++) {
    let s = 0;
    for (let dj = 0; dj < CELL; dj++) {
      for (let di = 0; di < CELL; di++) s += Math.max(0, dem[(j * CELL + dj) * meta.width + i * CELL + di]);
    }
    grid[j * W + i] = s / (CELL * CELL);
  }
}
grid = blur(grid, W, H, SIGMA);

// Waypoints in grid coordinates (cell centres at integers), through projection.js.
const origin = demPixelToWorld(0, 0, meta);
const toGrid = (lat, lon) => {
  const w = latLonToWorld(lat, lon);
  return [(w.x - origin.x) / cellM - 0.5, (w.z - origin.z) / cellM - 0.5];
};
const places = ['havsudden', 'strandstugan', 'bykstranden', 'nyberga', 'ithaka']
  .filter((k) => WAYPOINTS[k])
  .map((k) => {
    const [gi, gj] = toGrid(WAYPOINTS[k].lat, WAYPOINTS[k].lon);
    return { name: k[0].toUpperCase() + k.slice(1), gi: +gi.toFixed(2), gj: +gj.toFixed(2) };
  });

// ---------------------------------------------------------------- default area

let rect = { i0: 0, j0: 0, i1: W, j1: H };
let mask = null;
// The peninsula toggle in the page always floods from Havsudden.
const seed = toGrid(WAYPOINTS.havsudden.lat, WAYPOINTS.havsudden.lon).map(Math.round);
const { bbox, peninsula } = AREAS[AREA];
const llCut = args.cut ? args.cut.split(',').map(Number) : AREAS.havsudden.cut;
const cut = [...toGrid(llCut[0], llCut[1]), ...toGrid(llCut[2], llCut[3])];
const islets = AREAS.havsudden.islets.map(([lat, lon]) => toGrid(lat, lon).map(Math.round));
if (bbox) {
  const [s0, w0, n0, e0] = bbox;
  const [i0, j0] = toGrid(n0, w0), [i1, j1] = toGrid(s0, e0);
  rect = { i0: Math.max(0, Math.floor(i0)), j0: Math.max(0, Math.floor(j0)), i1: Math.min(W, Math.ceil(i1)), j1: Math.min(H, Math.ceil(j1)) };
} else if (peninsula) {
  const [si, sj] = toGrid(WAYPOINTS[peninsula].lat, WAYPOINTS[peninsula].lon).map(Math.round);
  const land = landMask(grid, W, H, si, sj, { join: JOIN, sea: SEA, cut, islets });
  if (!land) throw new Error(`${peninsula} is below the ${JOIN} m flood threshold`);
  ({ mask } = land);
  const { i0: x0, j0: y0, i1: x1, j1: y1 } = land.box;
  const mg = Math.ceil(MARGIN_M / cellM);
  rect = { i0: Math.max(0, x0 - mg), j0: Math.max(0, y0 - mg), i1: Math.min(W, x1 + mg + 1), j1: Math.min(H, y1 + mg + 1) };
}

// ---------------------------------------------------------------- etched detail

// Roads, paths and houses from the baked OSM, in full-grid coordinates.
const osm = JSON.parse(fs.readFileSync(path.join(DATA, 'osm.json'), 'utf8'));
const PATHS = new Set(['path', 'footway', 'track', 'cycleway', 'steps', 'bridleway']);
const features = { roads: [], paths: [], houses: [] };
// Forest hatching: the raster from scripts/forest-mask.mjs, laid on the grid by three corner points.
// Off unless --hatch (45° lines, optional spacing in mm, default 2.5) and/or --dots (rings, spacing default 3) are given: they add a lot of etch time.
// The raster always goes to the page so its checkbox can switch hatching on. Only the peninsula is covered.
const HATCH_MM = +args.hatch || 2.5, HATCH = 'hatch' in args ? HATCH_MM : 0;
const DOTS_MM = +args.dots || 3, DOTS = 'dots' in args ? DOTS_MM : 0;
const forestFile = path.join(HERE, 'data/forest.json');
if (fs.existsSync(forestFile)) {
  const fo = JSON.parse(fs.readFileSync(forestFile, 'utf8'));
  const at = (x, y) => {
    const m = fo.merc0 + y * fo.mercStep;
    return toGrid((Math.atan(Math.sinh((m * Math.PI) / 180)) * 180) / Math.PI, fo.lon0 + x * fo.lonStep);
  };
  const g0 = at(0, 0), g1 = at(fo.w, 0), g2 = at(0, fo.h);
  const ax = (g1[0] - g0[0]) / fo.w, ay = (g1[1] - g0[1]) / fo.w, bx = (g2[0] - g0[0]) / fo.h, by = (g2[1] - g0[1]) / fo.h;
  const det = ax * by - bx * ay; // grid = g0 + [ax bx; ay by]·(x, y); invert
  const a = by / det, b = -bx / det, d = -ay / det, e = ax / det;
  features.forest = { w: fo.w, h: fo.h, bits: fo.bits, to: [a, b, -(a * g0[0] + b * g0[1]), d, e, -(d * g0[0] + e * g0[1])] };
  features.hatch = HATCH;
  features.dots = DOTS;
}
for (const way of osm.ways) {
  const t = way.tags ?? {};
  const kind = t.building ? 'houses' : t.highway ? (PATHS.has(t.highway) ? 'paths' : 'roads') : null;
  if (!kind || !way.geometry?.length) continue;
  const g = way.geometry;
  const flat = (kind === 'houses' && g.length > 1 && g[0][0] === g.at(-1)[0] && g[0][1] === g.at(-1)[1] ? g.slice(0, -1) : g)
    .flatMap(([lat, lon]) => toGrid(lat, lon).map((v) => Math.round(v * 10) / 10));
  features[kind].push(flat);
}

// ---------------------------------------------------------------- model

const w = rect.i1 - rect.i0, h = rect.j1 - rect.j0;
const sub = new Float32Array(w * h);
for (let j = 0; j < h; j++) {
  for (let i = 0; i < w; i++) {
    const k = (j + rect.j0) * W + i + rect.i0;
    sub[j * w + i] = !mask || mask[k] ? (mask?.[k] === 2 ? Math.max(grid[k], SEA + 0.05) : grid[k]) : 0; // past the neck is sea
  }
}
const build = (scale) => buildModel(sub, w, h, { cellM, scale, sea: SEA, plates: PLATES, tol: 0.15, minArea: 6, features, offset: [rect.i0, rect.j0] });
const SCALE = SCALE_ARG === 'one' ? fitScale(build(7000), { one: true, ...BED }) : +SCALE_ARG;
const model = build(SCALE);

console.log(`${AREA}: ${w * cellM} × ${h * cellM} m · top ${model.elevMax.toFixed(1)} m · 1:${SCALE} → ${Math.round(model.frameW)} × ${Math.round(model.frameH)} mm`);
console.log(`  plate 0  base / sea`);
for (const l of model.layers) console.log(`  plate ${l.n}  ≥ ${l.level.toFixed(1).padStart(4)} m  ${l.pieces.length} piece${l.pieces.length === 1 ? '' : 's'}`);
console.log(`  ${model.layers.length + 1} plates × ${THICK} mm = ${(model.layers.length + 1) * THICK} mm tall · vertical exaggeration ${((THICK * SCALE) / 1000 / model.step).toFixed(1)}×`);

// ---------------------------------------------------------------- write

fs.mkdirSync(OUT, { recursive: true });
for (const old of fs.readdirSync(OUT)) if (/\.(svg|html|dxf)$/.test(old)) fs.rmSync(path.join(OUT, old));
const write = (name, s) => { fs.writeFileSync(path.join(OUT, name), s); console.log(`  ${path.join(OUT, name)}  ${(s.length / 1024).toFixed(0)} KB`); };

const placesMM = places
  .map((p) => ({ name: p.name, at: [model.mm((p.gi - rect.i0 + 0.5) * cellM), model.mm((p.gj - rect.j0 + 0.5) * cellM)] }))
  .filter(({ at: [x, y] }) => x > 0 && y > 0 && x < model.frameW && y < model.frameH);
write('overview-a3.svg', overviewA3SVG(model, placesMM, CREDIT));
write('plates-a3.svg', platesA3SVG(model));
for (let k = 0; k <= model.layers.length; k++) write(`plate-${k}.svg`, plateSVG(model, k));
// Epilog Fusion Pro at Deichman Folkeverksted: 1200 × 900 mm bed.
const bed = bedSheetsSVG(model, BED);
bed.sheets.forEach((sv, k) => write(`bed-${k + 1}.svg`, sv));
bedSheetsDXF(model, BED).sheets.forEach((dx, k) => write(`bed-${k + 1}.dxf`, dx));
// The two laser jobs as separate files, in running order: 1 = etch (black etch + blue score), 2 = cut (red).
for (const [n, pass] of [[1, 'etch'], [2, 'cut']]) {
  bedSheetsSVG(model, { ...BED, pass }).sheets.forEach((sv, k) => write(`${n}-${pass}-bed-${k + 1}.svg`, sv));
  bedSheetsDXF(model, { ...BED, pass }).sheets.forEach((dx, k) => write(`${n}-${pass}-bed-${k + 1}.dxf`, dx));
  bedSheetsAI(model, { ...BED, pass }).sheets.forEach((ai, k) => write(`${n}-${pass}-bed-${k + 1}.ai`, ai));
}
// The one flat file for Illustrator: two colours, three compound paths, no groups or text.
const flat = bedSheetsFlat(model, BED);
flat.svg.forEach((sv, k) => write(`laser-bed-${k + 1}.svg`, sv));
flat.ai.forEach((ai, k) => write(`laser-bed-${k + 1}.ai`, ai));
write('base-guide.svg', baseGuideSVG(model));
if (BED.housing) {
  const hi = housingInfo({ thickness: THICK });
  write('housing.md', [`# E-paper housing (${THICK} mm board)${BED.housings > 1 ? ` — ${BED.housings} housings` : ''}`, '',
    `Outside ${hi.outside.w} × ${hi.outside.d} × ${hi.outside.h} mm (width × depth × height), ${hi.outside.wWithEars} mm wide with the ear tips. Window ${hi.window[0]} × ${hi.window[1]} mm for a ${hi.module[0]} × ${hi.module[1]} mm module.`,
    `Inside: ${hi.inside.w} mm wide, ${hi.inside.depthBottom} mm deep at the bottom, ${hi.inside.depthTop} mm at the top, ${hi.inside.screenClear} mm clear height for the screen.`,
    `Pins: ${hi.pins.note}, ${hi.pins.diameter} mm thick (skewers or dowel).${BED.housings > 1 ? ` Quantities below are for all ${BED.housings} housings; ${hi.pins.count * BED.housings} pins in total.` : ''}`, '', '## Parts',
    ...hi.parts.map((q) => `- ${q.id} ${q.name} ×${q.qty * BED.housings} — ${q.w} × ${q.h} mm`), '', '## Assembly',
    ...hi.steps.map((t, i) => `${i + 1}. ${t}`), '', ...(hi.warnings.length ? ['## Warnings', ...hi.warnings.map((w) => `- ${w}`), ''] : [])].join('\n'));
}
const len = lineLengths(model, BED);
console.log(`  bed 1200×900: ${bed.sheets.length} sheet${bed.sheets.length === 1 ? '' : 's'}${bed.tooBig.length ? ` · too big for the bed: ${bed.tooBig.join(', ')}` : ''} · all pieces on one sheet from 1:${fitScale(model, { one: true, ...BED })}`);
const space = sheetSpace(model, BED).at(-1);
if (space) console.log(`  sheet: pieces use ${space.materialPct.toFixed(0)}% of the plywood · free for other cuts: ${space.free.w} × ${space.free.h} mm largest block, ${space.freePct.toFixed(0)}% of the sheet`);
console.log(`  lines: cut ${(len.cut / 1000).toFixed(1)} m · score ${(len.score / 1000).toFixed(1)} m · etch ${(len.etch / 1000).toFixed(1)} m`);

// The page gets the whole smoothed grid (centimetres, Uint16) so any area can be picked.
const cm = Uint16Array.from(grid, (v) => Math.round(Math.max(0, v) * 100));
const data = { housings: BED.housings, keyrings: BED.keyrings, dogs: BED.dogs, dogArt: DOG_ART, hatchMM: HATCH_MM, dotsMM: DOTS_MM, keyringArt: KEYRING_ART, W, H, cellM, places, features, rect, seed, join: JOIN, sea: SEA, cut, islets, only: !!mask, plates: PLATES, thick: THICK, scale: SCALE, grid: Buffer.from(cm.buffer).toString('base64') };
const core = fs.readFileSync(path.join(HERE, 'lib/core.js'), 'utf8').replace(/^export /gm, '');
// housing.js goes in as a function scope of its own so its helper names can't clash with core's.
const housingSrc = '(() => {\n' + fs.readFileSync(path.join(HERE, 'lib/housing.js'), 'utf8').replace(/^export /gm, '') + '\nreturn { housingParts, housingInfo, housingModel, HOUSING_DEFAULTS };\n})()';
const html = fs.readFileSync(path.join(HERE, 'lib/viewer.html'), 'utf8')
  .replace('/*__HOUSING__*/', () => housingSrc)
  .replace('/*__CORE__*/', () => core)
  .replace('/*__DATA__*/', () => JSON.stringify(data));
write('index.html', html);
