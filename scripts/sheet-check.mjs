// Usage: node scripts/sheet-check.mjs out/bed-1.svg — pairwise overlap and minimum gap between cut outlines.
import fs from 'node:fs';
const s = fs.readFileSync(process.argv[2], 'utf8');
const items = [];
for (const m of s.matchAll(/<g transform="translate\(([-\d.]+),([-\d.]+)\)(?: rotate\((\d+)\))?">\s*<path d="([^"]*)"[^>]*stroke="#ff0000"/g)) {
  const [, tx, ty, rot, d] = m;
  const A = (+rot || 0) / 90, c = [1, 0, -1, 0][A], sn = [0, 1, 0, -1][A];
  const rings = d.split('M').filter(Boolean).map((r) => [...r.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((a) => [+tx + a[1] * c - a[2] * sn, +ty + a[1] * sn + a[2] * c]));
  items.push(rings[0]);
}
const dense = (p) => { const o = []; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1)); for (let t = 0; t < n; t++) o.push([a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n]); } return o; };
const inside = ([x, y], p) => { let c = false; for (let k = 0, n = p.length, m = n - 1; k < n; m = k++) { const [xi, yi] = p[k], [xj, yj] = p[m]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const D = items.map(dense); let minGap = Infinity, overlaps = 0, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
for (const p of items) for (const [x, y] of p) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
  const bi = [Math.min(...D[i].map(p => p[0])), Math.max(...D[i].map(p => p[0])), Math.min(...D[i].map(p => p[1])), Math.max(...D[i].map(p => p[1]))];
  const bj = [Math.min(...D[j].map(p => p[0])), Math.max(...D[j].map(p => p[0])), Math.min(...D[j].map(p => p[1])), Math.max(...D[j].map(p => p[1]))];
  if (bi[1] + 8 < bj[0] || bj[1] + 8 < bi[0] || bi[3] + 8 < bj[2] || bj[3] + 8 < bi[2]) continue;
  if (D[i].some((p) => inside(p, items[j])) || D[j].some((p) => inside(p, items[i]))) overlaps++;
  for (const a of D[i]) for (const b of D[j]) { const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d < minGap) minGap = d; }
}
console.log({ items: items.length, overlaps, minGap: +minGap.toFixed(2), extent: [minX, minY, maxX, maxY].map((v) => +v.toFixed(0)) });
