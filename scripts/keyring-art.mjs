// Keyring artwork → data/keyring.json.
//   node scripts/keyring-art.mjs [assets/keyring.svg] [--black 0.5] [--out data/keyring-coarse.json]
//   (--black: spacing of the black hatch in mm, default 0.25; --out: output file, default data/keyring.json)
// The SVG is a tag (an outline path: disc + rounded tab on top; a black circle where the punch hole goes)
// with a helicopter drawn in black (and optionally white / cream / ochre; fills and strokes both work). Plywood only has "burnt" and "not burnt",
// so the tones become line density on the one existing ETCH pen (black hairlines, 45°):
//   black  → dense lines   (0.25 mm apart, reads solid)
//   ochre  → medium lines  (0.5 mm, a lighter shade)
//   cream  → bare wood     (plywood is already cream; sparse lines just look like scratches)
//   white  → bare wood
// The file is painted in order (later shapes cover earlier ones) onto a 0.04 mm raster, then each tone's
// region is hatched. Art stays 0.6 mm off the cut edge and the hole. Output is in mm, origin top-left of the tag.
import fs from 'node:fs';

const argv = process.argv.slice(2), opt = (k) => { const i = argv.indexOf(`--${k}`); return i < 0 ? undefined : argv[i + 1]; };
const SRC = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'assets/keyring.svg';
const OUT = opt('out') ?? 'data/keyring.json';
const TAG_W_MM = 35;               // width of the tag; the height follows
const PX = 0.04;                   // mm per raster pixel
const SPACING = { 3: +(opt('black') ?? 0.25), 2: 0.5 }; // tone → line spacing, mm; tones not listed stay bare
const MARGIN = 0.6;                // art keeps this far from the cut edge / hole, mm
const TONE = { '#ffffff': 0, white: 0, '#fee9c3': 1, '#e7b45f': 2, '#000000': 3, black: 3 };

const svg = fs.readFileSync(SRC, 'utf8');
const [vbW, vbH] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).slice(1).map(Number);
const U = TAG_W_MM / vbW; // mm per svg unit
const num = (el, k) => +el.match(new RegExp(`\\s${k}="([^"]*)"`))?.[1];
const attr = (el, k) => el.match(new RegExp(`\\s${k}="([^"]*)"`))?.[1];

const els = [...svg.matchAll(/<(circle|path|ellipse|rect)\b([^>]*?)\/?>/g)].map(([, tag, a]) => ({ tag, a }));
const ellipsePts = (cx, cy, rx, ry, rot = 0, n = 160) => Array.from({ length: n }, (_, k) => {
  const t = (k / n) * 2 * Math.PI, x = rx * Math.cos(t), y = ry * Math.sin(t), c = Math.cos(rot), s = Math.sin(rot);
  return [cx + x * c - y * s, cy + x * s + y * c];
});
function pathPolys(d) {
  const polys = [], t = d.match(/[MLHVCZ]|-?[\d.]+(?:e-?\d+)?/g);
  let i = 0, cur = null, x = 0, y = 0, sx = 0, sy = 0;
  const n = () => +t[i++];
  while (i < t.length) {
    const c = t[i++];
    if (c === 'M') { cur = [[(x = n()), (y = n())]]; polys.push(cur); sx = x; sy = y; }
    else if (c === 'L') cur.push([(x = n()), (y = n())]);
    else if (c === 'H') cur.push([(x = n()), y]);
    else if (c === 'V') cur.push([x, (y = n())]);
    else if (c === 'C') {
      const [x1, y1, x2, y2, x3, y3] = [n(), n(), n(), n(), n(), n()];
      for (let k = 1; k <= 24; k++) {
        const u = k / 24, v = 1 - u;
        cur.push([v ** 3 * x + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u ** 3 * x3, v ** 3 * y + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u ** 3 * y3]);
      }
      x = x3; y = y3;
    } else if (c === 'Z') { cur.push([sx, sy]); x = sx; y = sy; }
    else throw new Error(`path command ${c} not supported`);
  }
  return polys;
}

// structure: the cut outline is the one path with an id (it lives in <defs>); the punch hole is the one circle
// (black); a path with a mask is only the drawn border of the outline. Everything else is art.
const outlineEl = els.find((e) => e.tag === 'path' && attr(e.a, 'id')), holeEl = els.find((e) => e.tag === 'circle');
if (!outlineEl || !holeEl) throw new Error('expected an outline path with an id and one hole circle');
const toneOf = (c) => (c && c !== 'none' ? TONE[c.toLowerCase()] : undefined);
// a shape has a fill and/or a stroke (stroke-width, in svg units); no fill attribute = no fill
const art = els.filter((e) => e !== outlineEl && e !== holeEl && !attr(e.a, 'mask')).map((e) => ({
  tone: toneOf(attr(e.a, 'fill')), stroke: toneOf(attr(e.a, 'stroke')), sw: num(e.a, 'stroke-width') || 1,
  polys: e.tag === 'path' ? pathPolys(attr(e.a, 'd'))
    : [ellipsePts(num(e.a, 'cx'), num(e.a, 'cy'), num(e.a, 'rx'), num(e.a, 'ry'), (+attr(e.a, 'transform').match(/rotate\(([-\d.]+)/)[1] * Math.PI) / 180)],
}));
if (art.some((a) => a.tone === undefined && a.stroke === undefined)) throw new Error('shape with an unknown fill / stroke colour');

const RW = Math.ceil((vbW * U) / PX), RH = Math.ceil((vbH * U) / PX);
const sc = U / PX; // px per svg unit
const fill = (grid, polys, value) => {
  for (let py = 0; py < RH; py++) {
    const y = py + 0.5, xs = [];
    for (const p of polys) {
      for (let k = 0; k < p.length; k++) {
        const [ax, ay] = [p[k][0] * sc, p[k][1] * sc], [bx, by] = [p[(k + 1) % p.length][0] * sc, p[(k + 1) % p.length][1] * sc];
        if (ay <= y !== by <= y) xs.push([ax + ((y - ay) / (by - ay)) * (bx - ax), by > ay ? 1 : -1]);
      }
    }
    xs.sort((a, b) => a[0] - b[0]);
    let wind = 0;
    for (let k = 0; k < xs.length - 1; k++) {
      wind += xs[k][1];
      if (wind !== 0) for (let px = Math.max(0, Math.round(xs[k][0])); px < Math.min(RW, Math.round(xs[k + 1][0])); px++) grid[py * RW + px] = value;
    }
  }
};
const cls = new Uint8Array(RW * RH);
// Strokes are stamped as discs along the outline (round joins and caps).
const stroke = (grid, polys, value, sw) => {
  const r = (sw * sc) / 2;
  for (const p of polys) {
    for (let k = 0; k < p.length - 1; k++) {
      const [ax, ay] = [p[k][0] * sc, p[k][1] * sc], [bx, by] = [p[k + 1][0] * sc, p[k + 1][1] * sc];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5));
      for (let t = 0; t <= n; t++) {
        const x = ax + ((bx - ax) * t) / n, y = ay + ((by - ay) * t) / n;
        for (let py = Math.max(0, Math.floor(y - r)); py <= Math.min(RH - 1, Math.ceil(y + r)); py++) {
          for (let px = Math.max(0, Math.floor(x - r)); px <= Math.min(RW - 1, Math.ceil(x + r)); px++) {
            if ((px + 0.5 - x) ** 2 + (py + 0.5 - y) ** 2 <= r * r) grid[py * RW + px] = value;
          }
        }
      }
    }
  }
};
for (const a of art) {
  if (a.tone !== undefined) fill(cls, a.polys, a.tone);
  if (a.stroke !== undefined) stroke(cls, a.polys, a.stroke, a.sw);
}

// the cut outline (flattened) and the hole, in svg units
const outline = pathPolys(attr(outlineEl.a, 'd'))[0];
if (outline.at(-1)[0] === outline[0][0] && outline.at(-1)[1] === outline[0][1]) outline.pop(); // closing point repeats the first
const hole = { c: [num(holeEl.a, 'cx') * U, num(holeEl.a, 'cy') * U], r: num(holeEl.a, 'r') * U };

// keep art off the edge and the hole: erode the "inside the tag" mask
const inside = new Uint8Array(RW * RH);
fill(inside, [outline], 1);
let er = inside;
for (let pass = 0; pass < Math.round(MARGIN / PX); pass++) {
  const next = new Uint8Array(RW * RH);
  for (let y = 1; y < RH - 1; y++) for (let x = 1; x < RW - 1; x++) {
    const i = y * RW + x;
    next[i] = er[i] && er[i - 1] && er[i + 1] && er[i - RW] && er[i + RW] ? 1 : 0;
  }
  er = next;
}
const hx = hole.c[0] / PX, hy = hole.c[1] / PX, hr = (hole.r + MARGIN) / PX;
for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) if (!er[y * RW + x] || (x - hx) ** 2 + (y - hy) ** 2 < hr * hr) cls[y * RW + x] = 0;

// hatch each tone: lines y = x − c at 45°, runs where the raster has that tone
const etch = [];
const lens = { 2: 0, 3: 0 };
const toneAt = (xmm, ymm) => { const x = Math.floor(xmm / PX), y = Math.floor(ymm / PX); return x < 0 || y < 0 || x >= RW || y >= RH ? 0 : cls[y * RW + x]; };
const wmm = RW * PX, hmm = RH * PX, r2 = (v) => Math.round(v * 100) / 100;
for (const tone of [2, 3]) {
  for (let c = -hmm; c < wmm; c += SPACING[tone] * Math.SQRT2) {
    let a = null, b = null;
    const flush = () => { if (a && Math.hypot(b[0] - a[0], b[1] - a[1]) >= 0.15) { etch.push([r2(a[0]), r2(a[1]), r2(b[0]), r2(b[1])]); lens[tone] += Math.hypot(b[0] - a[0], b[1] - a[1]); } a = b = null; };
    for (let x = Math.max(0, c); x <= Math.min(wmm, hmm + c); x += PX) {
      const y = x - c;
      if (toneAt(x, y) === tone) { if (!a) a = [x, y]; b = [x, y]; } else flush();
    }
    flush();
  }
}
if (outline.some((p) => !p.every(Number.isFinite))) throw new Error('outline has a non-finite point');
const out = {
  note: 'Keyring tag from assets/keyring.svg via scripts/keyring-art.mjs. mm, origin top-left. outline = cut, hole = punch hole, etch = [x1, y1, x2, y2] hatch segments (tone = line density).',
  w: r2(vbW * U), h: r2(vbH * U),
  outline: outline.map(([x, y]) => [r2(x * U), r2(y * U)]),
  hole: { c: hole.c.map(r2), r: r2(hole.r) },
  etch,
};
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`${OUT}  ${out.w} × ${out.h} mm · hole Ø${r2(hole.r * 2)} mm, ${r2(hole.c[1] - hole.r)} mm of wood above it`);
console.log(`  etch: ${etch.length} lines · black ${r2(lens[3])} mm · ochre ${r2(lens[2])} mm per tag · ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
