// Forest mask for the peninsula, read off a Google Maps satellite screenshot.
//   node scripts/forest-mask.mjs "<screenshot.png>"   → data/forest.json
// OSM can't be used: it maps the whole peninsula interior as one bare_rock polygon.
// Dark, non-blue pixels (blurred) are forest; bright grey-pink granite, roads, lawns and water are not.
// The screenshot is placed by a Web-Mercator fit (below) that was found by matching the OSM road
// network onto the grey road pixels (Meriniementie, Vidavyntie, Majdalintie line up within a few m).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FIT = { s: 114772.5, ox: 10.4, oy: 2101.4, lon0: 25.6, lat0: 60.21 }; // px = ox + s·(lon − lon0), py = oy − s·(merc(lat) − merc(lat0))
const D = 3;                          // keep every 3rd pixel (≈ 1.4 m)
const CROP = { x0: 420, x1: 2520, y0: 60, y1: 1760 }; // screenshot px: the peninsula and a bit of its neck
const LUM_MAX = 92, BLUE_MAX = 9;     // forest: blurred luminance below, blurred (blue − green) below

const src = process.argv[2];
if (!src) throw new Error('usage: node scripts/forest-mask.mjs <screenshot.png>');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forest-'));
const bmpFile = path.join(tmp, 'shot.bmp');
execFileSync('sips', ['-s', 'format', 'bmp', src, '--out', bmpFile], { stdio: 'ignore' });

const b = fs.readFileSync(bmpFile);
const off = b.readUInt32LE(10), w = b.readInt32LE(18), hRaw = b.readInt32LE(22), bytes = b.readUInt16LE(28) / 8;
const h = Math.abs(hRaw), row = Math.ceil((w * bytes) / 4) * 4;
const lum = new Float32Array(w * h), blue = new Float32Array(w * h);
for (let y = 0; y < h; y++) {
  const sy = hRaw < 0 ? y : h - 1 - y;
  for (let x = 0; x < w; x++) {
    const o = off + sy * row + x * bytes, B = b[o], G = b[o + 1], R = b[o + 2];
    const red = R > 220 && G < 90 && B < 70; // the user's red line
    lum[y * w + x] = red ? 255 : (R + G + B) / 3;
    blue[y * w + x] = red ? 0 : B - G;
  }
}
const blur = (src, r) => {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = 0; x < w; x++) { s += src[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + s; }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      out[y * w + x] = (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
};
const L = blur(lum, 5), Bl = blur(blue, 5);
const dark = new Float32Array(w * h);
for (let i = 0; i < w * h; i++) dark[i] = Bl[i] <= BLUE_MAX && L[i] < LUM_MAX ? 1 : 0;
const forest = blur(blur(dark, 3), 3); // majority, so single trees and gaps don't speckle

const cw = Math.floor((CROP.x1 - CROP.x0) / D), ch = Math.floor((CROP.y1 - CROP.y0) / D);
const bits = Buffer.alloc(Math.ceil((cw * ch) / 8));
let on = 0;
for (let y = 0; y < ch; y++) {
  for (let x = 0; x < cw; x++) {
    if (forest[(CROP.y0 + y * D) * w + CROP.x0 + x * D] > 0.5) { const i = y * cw + x; bits[i >> 3] |= 1 << (i & 7); on++; }
  }
}
const merc = (lat) => (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI;
const out = {
  note: 'Forest (1) / not forest (0) raster, row-major, LSB first, base64. Pixel (x, y) is at lon = lon0 + x·lonStep and Mercator-degrees m = merc0 + y·mercStep (lat = atan(sinh(m·π/180))·180/π). Made by scripts/forest-mask.mjs from a satellite screenshot.',
  w: cw, h: ch,
  lon0: FIT.lon0 + (CROP.x0 - FIT.ox) / FIT.s, lonStep: D / FIT.s,
  merc0: merc(FIT.lat0) + (FIT.oy - CROP.y0) / FIT.s, mercStep: -D / FIT.s,
  bits: bits.toString('base64'),
};
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/forest.json', JSON.stringify(out));
console.log(`data/forest.json  ${cw} × ${ch} px · ${((100 * on) / (cw * ch)).toFixed(0)}% forest · ${(fs.statSync('data/forest.json').size / 1024).toFixed(0)} KB`);
fs.rmSync(tmp, { recursive: true });
