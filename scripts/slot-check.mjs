import { housingParts } from '../lib/housing.js';
const area = (p) => Math.abs(p.reduce((s, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return s + x * y2 - x2 * y; }, 0)) / 2;
const bb = (p) => { const x = p.map((q) => q[0]), y = p.map((q) => q[1]); return [Math.max(...x) - Math.min(...x), Math.max(...y) - Math.min(...y)]; };
const parts = Object.fromEntries(housingParts().map((q) => [q.id, q]));
const expect = (w, h) => w * h - (4 - Math.PI) * Math.min(w, h) ** 2 / 4;
for (const [id, hole, w, h] of [['H4', parts.H4.holes.at(-1), 8, 14]]) {
  const [bw, bh] = bb(hole);
  const ok = Math.abs(bw - w) < 0.2 && Math.abs(bh - h) < 0.2 && Math.abs(area(hole) - expect(w, h)) < 2;
  console.log(ok ? 'PASS' : 'FAIL', id, 'slot bbox', bw.toFixed(2), 'x', bh.toFixed(2), 'area', area(hole).toFixed(1), 'expected', expect(w, h).toFixed(1));
}
