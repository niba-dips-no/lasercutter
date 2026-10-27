// Test-burn sheet for the dog disc: the same disc at several hatch spacings, side by side, 1:1 in mm.
//   node scripts/dog-test.mjs <dog.png> [0.25 0.3 0.4] [--out out/dog-test.svg]
// Runs scripts/dog-art.mjs once per spacing (into a temp dir), then lays the discs out left to right.
// Red = cut (disc + hole), black = etch; 0.025 mm hairlines like the bed files. No labels: left to right = the spacings given.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2), oi = argv.indexOf('--out');
const OUT = oi < 0 ? 'out/dog-test.svg' : argv[oi + 1];
const rest = oi < 0 ? argv : argv.filter((a, i) => i !== oi && i !== oi + 1);
const png = rest[0], spacings = rest.slice(1).map(Number).filter((v) => v > 0);
if (!png) throw new Error('usage: node scripts/dog-test.mjs <dog.png> [0.25 0.3 0.4] [--out out/dog-test.svg]');
if (!spacings.length) spacings.push(0.25, 0.3, 0.4);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dogtest-'));
const here = path.dirname(new URL(import.meta.url).pathname);
const f = (v) => +v.toFixed(3);
const ring = (pts, dx) => 'M' + pts.map(([x, y]) => `${f(x + dx)},${f(y)}`).join('L') + 'Z';
let body = '', x0 = 10, H = 0;
for (const sp of spacings) {
  const file = path.join(tmp, `dog-${sp}.json`);
  execFileSync('node', [path.join(here, 'dog-art.mjs'), png, '--spacing', String(sp), '--out', file], { stdio: 'ignore' });
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const hole = d.hole ? ring(Array.from({ length: 36 }, (_, k) => [d.hole.c[0] + d.hole.r * Math.cos((k / 18) * Math.PI), d.hole.c[1] + d.hole.r * Math.sin((k / 18) * Math.PI)]), x0 - 0) : '';
  const etch = d.etch.map(([a, b, c, e]) => `M${f(a + x0)},${f(b + 10)}L${f(c + x0)},${f(e + 10)}`).join('');
  body += `<g transform="translate(0,10)"><path d="${ring(d.outline, x0)}${hole}" fill="none" stroke="#ff0000" stroke-width="0.025"/></g>`;
  body += `<path d="${etch}" fill="none" stroke="#000000" stroke-width="0.025"/>`;
  x0 += d.w + 10; H = d.h;
}
const W = x0, svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H + 20}mm" viewBox="0 0 ${W} ${H + 20}">\n${body}\n</svg>\n`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, svg);
console.log(`${OUT}  ${W} × ${H + 20} mm · discs at ${spacings.join(' / ')} mm spacing, left to right`);
