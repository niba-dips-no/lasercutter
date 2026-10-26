// Keyring artwork → data/keyring.json.
//   node scripts/keyring-art.mjs [assets/keyring.svg]
// The SVG is a tag (white disc + rounded tab on top, a black circle where the punch hole goes)
// with a helicopter drawn in white / cream / ochre / black. Plywood only has "burnt" and "not burnt",
// so the tones become line density on the one existing ETCH pen (black hairlines, 45°):
//   black  → dense lines   (0.25 mm apart, reads solid)
//   ochre  → medium lines  (0.5 mm, a lighter shade)
//   cream  → bare wood     (plywood is already cream; sparse lines just look like scratches)
//   white  → bare wood
// The file is painted in order (later shapes cover earlier ones) onto a 0.04 mm raster, then each tone's
// region is hatched. Art stays 0.6 mm off the cut edge and the hole. Output is in mm, origin top-left of the tag.
import fs from 'node:fs';

const SRC = process.argv[2] ?? 'assets/keyring.svg';
const TAG_MM = 65;                 // height of the tag, tab to bottom
const PX = 0.04;                   // mm per raster pixel
const SPACING = { 3: 0.25, 2: 0.5 }; // tone → line spacing, mm; tones not listed stay bare
const MARGIN = 0.6;                // art keeps this far from the cut edge / hole, mm
const TONE = { '#ffffff': 0, white: 0, '#fee9c3': 1, '#e7b45f': 2, '#000000': 3, black: 3 };

const svg = fs.readFileSync(SRC, 'utf8');
const [vbW, vbH] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).slice(1).map(Number);
const U = TAG_MM / vbH; // mm per svg unit
const num = (el, k) => +el.match(new RegExp(`\\s${k}="([^"]*)"`))?.[1];
const attr = (el, k) => el.match(new RegExp(`\\s${k}="([^"]*)"`))?.[1];

const els = [...svg.matchAll(/<(circle|path|ellipse|rect)\b([^>]*?)\/?>/g)].map(([, tag, a]) => ({ tag, a }));
const ellipsePts = (cx, cy, rx, ry, rot = 0, n = 160) => Array.from({ length: n }, (_, k) => {
  const t = (k / n) * 2 * Math.PI, x = rx * Math.cos(t), y = ry * Math.sin(t), c = Math.cos(rot), s = Math.sin(rot);
  return [cx + x * c - y * s, cy + x * s + y * c];
});
const rectPts = (x, y, w, h, r) => {
  const pts = [];
  for (const [cx, cy, a0] of [[x + w - r, y + r, -90], [x + w - r, y + h - r, 0], [x + r, y + h - r, 90], [x + r, y + r, 180]]) {
    for (let k = 0; k <= 12; k++) { const a = ((a0 + (k / 12) * 90) * Math.PI) / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  }
  return pts;
};
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

// structure: disc, tab, then art (paths / ellipse), the hole circle last
const disc = els[0], tab = els.find((e) => e.tag === 'rect'), holeEl = els.at(-1);
if (disc.tag !== 'circle' || !tab || holeEl.tag !== 'circle') throw new Error('expected: disc circle, art, tab rect, hole circle');
const art = els.slice(1).filter((e) => e !== tab && e !== holeEl).map((e) => ({
  tone: TONE[attr(e.a, 'fill').toLowerCase()],
  polys: e.tag === 'path' ? pathPolys(attr(e.a, 'd'))
    : [ellipsePts(num(e.a, 'cx'), num(e.a, 'cy'), num(e.a, 'rx'), num(e.a, 'ry'), (+attr(e.a, 'transform').match(/rotate\(([-\d.]+)/)[1] * Math.PI) / 180)],
}));
if (art.some((a) => a.tone === undefined)) throw new Error('unknown fill colour');

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
for (const a of art) fill(cls, a.polys, a.tone);

// the cut outline: disc ∪ tab, as a polygon in mm; the hole
const cx = num(disc.a, 'cx'), cy = num(disc.a, 'cy'), R = num(disc.a, 'r');
const tx = num(tab.a, 'x'), ty = num(tab.a, 'y') || 0, // y is left out of the SVG when it is 0
   tw = num(tab.a, 'width'), th = num(tab.a, 'height'), tr = num(tab.a, 'rx');
const sideY = cy - Math.sqrt(R * R - (cx - tx) ** 2); // where the tab's straight sides meet the disc
const aSide = Math.atan2(sideY - cy, tx + tw - cx);   // angle of the right-hand junction (negative, near −90°)
const outline = [];
outline.push([tx, sideY]);
for (const [ccx, ccy, a0] of [[tx + tr, ty + tr, 180], [tx + tw - tr, ty + tr, 270]]) {
  for (let k = 0; k <= 12; k++) { const a = ((a0 + (k / 12) * 90) * Math.PI) / 180; outline.push([ccx + tr * Math.cos(a), ccy + tr * Math.sin(a)]); }
}
outline.push([tx + tw, sideY]);
const steps = 240, a1 = aSide; // from the right junction clockwise round the bottom to the left one
const aLeft = Math.atan2(sideY - cy, tx - cx) + 2 * Math.PI;
for (let k = 1; k < steps; k++) { const a = a1 + ((aLeft - a1) * k) / steps; outline.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
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
fs.writeFileSync('data/keyring.json', JSON.stringify(out));
console.log(`data/keyring.json  ${out.w} × ${out.h} mm · hole Ø${r2(hole.r * 2)} mm, ${r2(hole.c[1] - hole.r)} mm of wood above it`);
console.log(`  etch: ${etch.length} lines · black ${r2(lens[3])} mm · ochre ${r2(lens[2])} mm per tag · ${(fs.statSync('data/keyring.json').size / 1024).toFixed(0)} KB`);
