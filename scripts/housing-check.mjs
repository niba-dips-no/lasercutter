// Numeric consistency checks for lib/housing.js at 6, 4 and 3 mm board: node scripts/housing-check.mjs
import { housingParts, housingInfo, housingModel, HOUSING_DEFAULTS } from '../lib/housing.js';
let fails = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fails++; };
const inside = ([x, y], p) => { let c = false; for (let k = 0, n = p.length, m = n - 1; k < n; m = k++) { const [xi, yi] = p[k], [xj, yj] = p[m]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const bnd = (p) => ({ x0: Math.min(...p.map((q) => q[0])), x1: Math.max(...p.map((q) => q[0])), y0: Math.min(...p.map((q) => q[1])), y1: Math.max(...p.map((q) => q[1])) });
const area = (p) => Math.abs(p.reduce((s, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return s + x * y2 - x2 * y; }, 0)) / 2;

for (const T of [6, 4, 3]) {
  console.log(`--- thickness ${T}`);
  const M = housingModel({ thickness: T }), parts = Object.fromEntries(housingParts({ thickness: T }).map((q) => [q.id, q]));
  const { Wi, Hf, Hb, a, sin, cos, Ub, ub0, ut0, vT1, vT0, m, Pob, dir, inward, sideH, c } = M;
  // window
  const wb = bnd(parts.H1.holes[0]);
  ok(`T${T} window 165 x 100`, Math.abs(wb.x1 - wb.x0 - 165) < 1e-6 && Math.abs(wb.y1 - wb.y0 - 100) < 1e-6, `${(wb.x1 - wb.x0).toFixed(2)} x ${(wb.y1 - wb.y0).toFixed(2)}`);
  // window centred on the body: body spans x from E to E+Wi in the flat part
  const fb = bnd(parts.H1.outer);
  const bodyX0 = (fb.x1 - fb.x0 - Wi) / 2;
  ok(`T${T} window centred across`, Math.abs((wb.x0 + wb.x1) / 2 - (bodyX0 + Wi / 2)) < 1e-6);
  // 3-D placement of each panel's tabs, projected into the side plane, must sit inside the side's slots.
  const side = parts.H3; // flat (x,y): u = x, v = sideH - y (outline min is 0,0)
  const slotUV = side.holes.map((h) => h.map(([x, y]) => [x, sideH - y]));
  const cover = (poly) => slotUV.some((s) => poly.every((q) => inside(q, s)));
  // flat panel coordinates: x across (0..Wi body), s along (y down => s = L - y). Recover tab rectangles from outline.
  const tabsOf = (part, L) => { // ears on the right edge, as (s0, len): runs of outline points beyond the body edge
    const pts = part.outer, bb = bnd(pts), off = (bb.x1 - bb.x0 - Wi) / 2, n = pts.length, edge = off + Wi;
    const out = [];
    for (let k = 0; k < n; k++) {
      const beyond = (q) => q[0] > edge + 1e-6;
      if (beyond(pts[k]) && !beyond(pts[(k + n - 1) % n])) {
        let e = k; while (beyond(pts[(e + 1) % n])) e = (e + 1) % n;
        const s0 = L - pts[(k + n - 1) % n][1], s1 = L - pts[(e + 1) % n][1];
        out.push([Math.min(s0, s1), Math.abs(s1 - s0)]);
      }
    }
    return out;
  };
  const place = {
    H1: (s, t) => [Pob[0] + s * dir[0] + t * inward[0], Pob[1] + s * dir[1] + t * inward[1]],
    H2: (s, t) => [Ub + t, m + s],
    H6: (s, t) => [ub0 + s, m + t],
    H5: (s, t) => [ut0 + s, vT0 + t],
  };
  const lens = { H1: Hf, H2: Hb, H6: M.Lb, H5: M.Lt };
  for (const id of ['H1', 'H2', 'H6', 'H5']) {
    const ears = tabsOf(parts[id], lens[id]);
    ok(`T${T} ${id} has ears/tabs`, ears.length >= 1, `${ears.length}`);
    for (const [s0, len] of ears) {
      // the chamfered ear is narrower at the tip, so test the body-edge extent (s0..s0+len) at both faces
      const quad = [place[id](s0, 0), place[id](s0 + len, 0), place[id](s0 + len, T), place[id](s0, T)];
      ok(`T${T} ${id} tab at s=${s0.toFixed(1)} len ${len.toFixed(1)} sits in a side slot`, cover(quad));
    }
  }
  // ear protrusion beyond the side's outer face
  const eb = bnd(parts.H1.outer);
  ok(`T${T} front ear reaches ${(M.E).toFixed(1)} mm out (side ${T} + ${M.P.toFixed(1)} protrusion)`, Math.abs((eb.x1 - eb.x0 - Wi) / 2 - M.E) < 1e-6);
  // pin hole: lies fully outside the side's outer face, with >= 3 mm of ear beyond it
  const h = bnd(parts.H1.holes[1]), edgeRight = bodyX0 + Wi;
  ok(`T${T} pin hole clear of the side (inner edge at ${(h.x0 - edgeRight).toFixed(2)} mm >= ${T - 0.3})`, h.x0 - edgeRight >= T - 0.3 && h.x0 - edgeRight <= T + 0.0);
  ok(`T${T} >= 3 mm of ear beyond the pin hole`, (edgeRight + M.E) - h.x1 >= 3, `${((edgeRight + M.E) - h.x1).toFixed(2)} mm`);
  // panels do not overlap in the side plane (sampled)
  const bands = {
    front: [place.H1(0, 0), place.H1(Hf, 0), place.H1(Hf, T), place.H1(0, T)],
    back: [[Ub, m], [Ub + T, m], [Ub + T, vT1], [Ub, vT1]],
    bottom: [[ub0, m], [Ub, m], [Ub, m + T], [ub0, m + T]],
    top: [[ut0, vT0], [Ub, vT0], [Ub, vT1], [ut0, vT1]],
  };
  let worst = 0;
  const names = Object.keys(bands);
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    let hit = 0; const bi = bnd(bands[names[i]]);
    for (let x = bi.x0; x <= bi.x1; x += 0.25) for (let y = bi.y0; y <= bi.y1; y += 0.25) if (inside([x, y], bands[names[i]]) && inside([x, y], bands[names[j]])) hit += 0.0625;
    worst = Math.max(worst, hit);
    if (hit > 0.5) console.log(`   overlap ${names[i]}/${names[j]} ${hit.toFixed(2)} mm2`);
  }
  ok(`T${T} panels do not overlap in the side plane`, worst < 0.5, `worst ${worst.toFixed(2)} mm2`);
  // everything inside the side outline
  const sideOutline = [[0, 0], [M.sideD, 0], [M.sideD, sideH], [sideH * M.tan, sideH]];
  ok(`T${T} all slots inside the side outline`, slotUV.every((s) => s.every((q) => inside(q, sideOutline))));
  // slots do not touch each other or the outline edges (bridges)
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  let minBridge = Infinity;
  for (let i = 0; i < slotUV.length; i++) for (let j = i + 1; j < slotUV.length; j++) for (const p of slotUV[i]) for (const q of slotUV[j]) { const dd = dist(p, q); if (dd < minBridge) { minBridge = dd; var pair = [i, j, p.map((v) => +v.toFixed(1)), q.map((v) => +v.toFixed(1))]; } }
  ok(`T${T} slot-to-slot corner distance >= 5 mm`, minBridge >= 5, `${minBridge.toFixed(1)} mm ${JSON.stringify(pair)}`);
  // interior stack-up
  const info = housingInfo({ thickness: T });
  ok(`T${T} bottom depth >= 25 mm for Nano + battery + charger`, info.inside.depthBottom >= 25, `${info.inside.depthBottom} mm`);
  ok(`T${T} screen clear height >= 112`, info.inside.screenClear >= 112, `${info.inside.screenClear} mm`);
  // USB slots present
  ok(`T${T} USB slot in one side only (none in the back)`, parts.H2.holes.length === 2 && parts.H4.holes.length === parts.H3.holes.length + 1);
  if (T === 6) console.log(JSON.stringify(info, null, 1).slice(0, 1400));
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
