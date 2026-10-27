// Dog disc artwork → data/dog.json.
//   node scripts/dog-art.mjs <dog.png> [--diameter 90] [--spacing 0.3] [--bold 0.15] [--hole 5.25] [--out data/dog.json]
// The PNG is black line art on white (1-bit, as drawn by the image tool). The laser can only burn or not burn,
// so the drawing is etched as 45° hairline hatching where the picture is black (same idea as scripts/keyring-art.mjs).
//   --diameter  disc size in mm (default 90)
//   --spacing   hatch line spacing in mm (default 0.3; the keyring uses 0.25)
//   --hole      punch hole for a split ring / string, Ø mm, at the top with 2.6 mm of wood above it (default 5.25; 0 = no hole)
//   --bold      the strokes are fattened by this many mm on each side so thin ink lines still burn visibly (default 0.15)
// The dog is centred in its smallest enclosing circle, 4 mm inside the disc's edge, and shrunk further if needed to keep 1 mm clear of the hole.
// Output is in mm, origin top-left of the disc: { w, h, outline (circle polygon), hole: { c, r } | null, etch: [x1, y1, x2, y2] }.
import fs from 'node:fs';
import zlib from 'node:zlib';

const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const SRC = argv[0];
if (!SRC || SRC.startsWith('--')) throw new Error('usage: node scripts/dog-art.mjs <dog.png> [--diameter 90] [--spacing 0.3] [--bold 0.15] [--hole 5.25] [--out data/dog.json]');
const OUT = opt('out', 'data/dog.json'), D = +opt('diameter', 90), SPACING = +opt('spacing', 0.3), BOLD = +opt('bold', 0.15), HOLE_D = +opt('hole', 5.25);
const EDGE = 4, PX = 0.04; // mm: gap between the art and the cut edge; mm per raster pixel

// --- minimal PNG reader: non-interlaced, 8- or 1-bit grayscale (all this needs)
const buf = fs.readFileSync(SRC);
if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
let sw, sh, depth, ctype, idat = [];
for (let p = 8; p < buf.length;) {
  const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
  if (type === 'IHDR') { sw = data.readUInt32BE(0); sh = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; if (data[12]) throw new Error('interlaced PNG not supported'); }
  if (type === 'IDAT') idat.push(data);
  p += 12 + len;
}
if (ctype !== 0 || (depth !== 1 && depth !== 8)) throw new Error(`need grayscale PNG, 1 or 8 bit (got colour type ${ctype}, depth ${depth})`);
const raw = zlib.inflateSync(Buffer.concat(idat)), stride = Math.ceil((sw * depth) / 8), bpp = Math.max(1, depth / 8);
const lines = new Uint8Array(stride * sh);
for (let y = 0; y < sh; y++) {
  const ft = raw[y * (stride + 1)], o = y * stride, prev = o - stride;
  for (let i = 0; i < stride; i++) {
    const x = raw[y * (stride + 1) + 1 + i], a = i >= bpp ? lines[o + i - bpp] : 0, b = y ? lines[prev + i] : 0, c = y && i >= bpp ? lines[prev + i - bpp] : 0;
    const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
    lines[o + i] = (x + (ft === 0 ? 0 : ft === 1 ? a : ft === 2 ? b : ft === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
  }
}
const ink = new Uint8Array(sw * sh); // 1 = black
for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
  ink[y * sw + x] = depth === 1 ? (((lines[y * stride + (x >> 3)] >> (7 - (x & 7))) & 1) ? 0 : 1) : lines[y * stride + x] < 128 ? 1 : 0;
}

// --- smallest circle around the ink (Badoiu–Clarkson on the ink's convex-ish extremes), in source pixels
const pts = [];
for (let y = 0; y < sh; y += 2) for (let x = 0; x < sw; x += 2) if (ink[y * sw + x]) pts.push([x, y]);
let cx = pts.reduce((t, p) => t + p[0], 0) / pts.length, cy = pts.reduce((t, p) => t + p[1], 0) / pts.length;
for (let it = 1; it <= 3000; it++) {
  let far = pts[0], fd = -1;
  for (const p of pts) { const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2; if (d > fd) { fd = d; far = p; } }
  cx += (far[0] - cx) / (it + 1); cy += (far[1] - cy) / (it + 1);
}
const rad = Math.sqrt(Math.max(...pts.map((p) => (p[0] - cx) ** 2 + (p[1] - cy) ** 2))) + 2;
const hole = HOLE_D > 0 ? { c: [D / 2, 2.6 + HOLE_D / 2], r: HOLE_D / 2 } : null;
let mmPerSrc = (D / 2 - EDGE) / rad; // mm per source pixel
if (hole) { // shrink until no ink comes within 1 mm of the hole
  const clear = (m) => pts.every((p) => Math.hypot(D / 2 + (p[0] - cx) * m - hole.c[0], D / 2 + (p[1] - cy) * m - hole.c[1]) > hole.r + 1 + BOLD);
  while (!clear(mmPerSrc)) mmPerSrc *= 0.99;
}

// --- raster the disc at PX mm per pixel, fatten the strokes, hatch
const N = Math.ceil(D / PX), cls = new Uint8Array(N * N);
for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
  const sx = Math.round(cx + ((px + 0.5) * PX - D / 2) / mmPerSrc), sy = Math.round(cy + ((py + 0.5) * PX - D / 2) / mmPerSrc);
  if (sx >= 0 && sy >= 0 && sx < sw && sy < sh && ink[sy * sw + sx]) cls[py * N + px] = 1;
}
const grow = Math.round(BOLD / PX);
if (grow > 0) { // square dilation, two passes
  const tmp = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) { const row = y * N; let last = -1e9; for (let x = 0; x < N; x++) { if (cls[row + x]) last = x; if (x - last <= grow) tmp[row + x] = 1; } last = 1e9; for (let x = N - 1; x >= 0; x--) { if (cls[row + x]) last = x; if (last - x <= grow) tmp[row + x] = 1; } }
  cls.fill(0);
  for (let x = 0; x < N; x++) { let last = -1e9; for (let y = 0; y < N; y++) { if (tmp[y * N + x]) last = y; if (y - last <= grow) cls[y * N + x] = 1; } last = 1e9; for (let y = N - 1; y >= 0; y--) { if (tmp[y * N + x]) last = y; if (last - y <= grow) cls[y * N + x] = 1; } }
}
const r2 = (v) => Math.round(v * 100) / 100;
const etch = [];
let len = 0;
const at = (xmm, ymm) => { const x = Math.floor(xmm / PX), y = Math.floor(ymm / PX); return x < 0 || y < 0 || x >= N || y >= N ? 0 : cls[y * N + x]; };
for (let c = -D; c < D; c += SPACING * Math.SQRT2) {
  let a = null, b = null;
  const flush = () => { if (a && Math.hypot(b[0] - a[0], b[1] - a[1]) >= 0.15) { etch.push([r2(a[0]), r2(a[1]), r2(b[0]), r2(b[1])]); len += Math.hypot(b[0] - a[0], b[1] - a[1]); } a = b = null; };
  for (let x = Math.max(0, c); x <= Math.min(D, D + c); x += PX) {
    if (at(x, x - c)) { if (!a) a = [x, x - c]; b = [x, x - c]; } else flush();
  }
  flush();
}
const outline = Array.from({ length: 180 }, (_, k) => [r2(D / 2 + (D / 2) * Math.cos((k / 180) * 2 * Math.PI)), r2(D / 2 + (D / 2) * Math.sin((k / 180) * 2 * Math.PI))]);
const out = { note: 'Dog disc from scripts/dog-art.mjs. mm, origin top-left. outline = cut circle, hole = punch hole (or null), etch = [x1, y1, x2, y2] hatch segments.', w: D, h: D, outline, hole, etch };
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`${OUT}  Ø${D} mm · art scale ${r2(mmPerSrc * 1000)} µm/px (stroke ~${r2(mmPerSrc * 6 + 2 * BOLD)} mm)`);
console.log(`  etch: ${etch.length} lines · ${r2(len / 1000)} m · ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
