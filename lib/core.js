/**
 * Contour-model geometry, shared by lasercut.mjs (Node) and the
 * generated viewer page (browser). No imports — the script inlines this file
 * into the HTML with the `export` keywords stripped.
 *
 * Model units are millimetres at model scale; SVG y points south.
 */

export function blur(src, W, H, sigma) {
  if (sigma <= 0) return src;
  const r = Math.ceil(sigma * 3);
  const k = [];
  let ks = 0;
  for (let t = -r; t <= r; t++) { const v = Math.exp(-(t * t) / (2 * sigma * sigma)); k.push(v); ks += v; }
  for (let t = 0; t < k.length; t++) k[t] /= ks;
  const tmp = new Float32Array(W * H);
  const dst = new Float32Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      let s = 0;
      for (let t = -r; t <= r; t++) s += k[t + r] * src[j * W + Math.min(W - 1, Math.max(0, i + t))];
      tmp[j * W + i] = s;
    }
  }
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      let s = 0;
      for (let t = -r; t <= r; t++) s += k[t + r] * tmp[Math.min(H - 1, Math.max(0, j + t)) * W + i];
      dst[j * W + i] = s;
    }
  }
  return dst;
}

// Marching squares on a grid padded with a low border, so every contour is a
// closed loop — land that runs off the grid edge is closed along the frame.
// Segments are oriented with "inside" on one consistent side, then chained.
// Returns loops in grid coordinates (cell centres at integers).
const T = 0, R = 1, B = 2, L = 3;
const CASES = {
  1: [[L, B]], 2: [[B, R]], 4: [[R, T]], 8: [[T, L]],
  14: [[B, L]], 13: [[R, B]], 11: [[T, R]], 7: [[L, T]],
  3: [[L, R]], 12: [[R, L]], 6: [[B, T]], 9: [[T, B]],
  15: [], 0: [],
};

export function contour(grid, W, H, level) {
  const PW = W + 2, PH = H + 2;
  const v = (i, j) => (i <= 0 || j <= 0 || i >= PW - 1 || j >= PH - 1 ? -1 : grid[(j - 1) * W + (i - 1)]);
  const next = new Map();
  const pos = new Map();
  const eid = (i, j, e) => {
    if (e === T) return 2 * (j * PW + i);
    if (e === B) return 2 * ((j + 1) * PW + i);
    if (e === L) return 2 * (j * PW + i) + 1;
    return 2 * (j * PW + i + 1) + 1;
  };
  const lerp = (a, b) => (level - a) / (b - a);
  const point = (i, j, e, tl, tr, br, bl) => {
    let x, y;
    if (e === T) { x = i + lerp(tl, tr); y = j; }
    else if (e === B) { x = i + lerp(bl, br); y = j + 1; }
    else if (e === L) { x = i; y = j + lerp(tl, bl); }
    else { x = i + 1; y = j + lerp(tr, br); }
    // back to unpadded grid coordinates, clamped onto the frame
    return [Math.min(W - 1, Math.max(0, x - 1)), Math.min(H - 1, Math.max(0, y - 1))];
  };
  for (let j = 0; j < PH - 1; j++) {
    for (let i = 0; i < PW - 1; i++) {
      const tl = v(i, j), tr = v(i + 1, j), br = v(i + 1, j + 1), bl = v(i, j + 1);
      const c = (tl >= level ? 8 : 0) | (tr >= level ? 4 : 0) | (br >= level ? 2 : 0) | (bl >= level ? 1 : 0);
      let segs = CASES[c];
      if (c === 5 || c === 10) {
        const centre = (tl + tr + br + bl) / 4 >= level;
        if (c === 5) segs = centre ? [[L, T], [R, B]] : [[L, B], [R, T]];
        else segs = centre ? [[B, L], [T, R]] : [[T, L], [B, R]];
      }
      for (const [a, b] of segs) {
        const ea = eid(i, j, a), eb = eid(i, j, b);
        next.set(ea, eb);
        if (!pos.has(ea)) pos.set(ea, point(i, j, a, tl, tr, br, bl));
        if (!pos.has(eb)) pos.set(eb, point(i, j, b, tl, tr, br, bl));
      }
    }
  }
  const loops = [];
  const seen = new Set();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let e = start;
    while (e !== undefined && !seen.has(e)) {
      seen.add(e);
      loop.push(pos.get(e));
      e = next.get(e);
    }
    if (loop.length > 2) loops.push(loop);
  }
  return loops;
}

export function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-9;
    let best = -1, bi = -1;
    for (let k = a + 1; k < b; k++) {
      const d = Math.abs(dy * (pts[k][0] - ax) - dx * (pts[k][1] - ay)) / len;
      if (d > best) { best = d; bi = k; }
    }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, k) => keep[k]);
}

// A ring can't go through Douglas–Peucker as-is (first = last gives a zero
// base line), so split it at the point farthest from its start.
function simplifyRing(p, tol) {
  let far = 0, fd = -1;
  p.forEach(([x, y], k) => { const dd = (x - p[0][0]) ** 2 + (y - p[0][1]) ** 2; if (dd > fd) { fd = dd; far = k; } });
  const a = simplify(p.slice(0, far + 1), tol);
  const b = simplify([...p.slice(far), p[0]], tol);
  return [...a, ...b.slice(1, -1)];
}

export const area = (p) => {
  let s = 0;
  for (let k = 0, n = p.length; k < n; k++) { const [x0, y0] = p[k], [x1, y1] = p[(k + 1) % n]; s += x0 * y1 - x1 * y0; }
  return s / 2;
};
export const inside = ([x, y], p) => {
  let c = false;
  for (let k = 0, n = p.length, m = n - 1; k < n; m = k++) {
    const [xi, yi] = p[k], [xj, yj] = p[m];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
export const bbox = (p) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
};

/**
 * Everything at or above `level` as pieces: an outer ring (land) and its holes.
 * `toMM` maps grid coordinates to model millimetres.
 */
export function buildLayer(grid, W, H, level, toMM, { tol = 0.15, minArea = 12 } = {}) {
  const loops = contour(grid, W, H, level)
    .map((p) => simplifyRing(p.map(([x, y]) => toMM(x, y)), tol))
    .filter((p) => p.length >= 3 && Math.abs(area(p)) >= minArea)
    .map((p) => ({ pts: p, box: bbox(p), area: Math.abs(area(p)) }));
  for (const a of loops) {
    a.depth = 0;
    for (const b of loops) {
      if (a === b || b.area <= a.area) continue;
      const { x0, y0, x1, y1 } = b.box;
      if (a.box.x0 < x0 || a.box.x1 > x1 || a.box.y0 < y0 || a.box.y1 > y1) continue;
      if (inside(a.pts[0], b.pts)) a.depth++;
    }
  }
  const pieces = loops.filter((l) => l.depth % 2 === 0).map((o) => ({ outer: o, holes: [] }));
  for (const h of loops.filter((l) => l.depth % 2 === 1)) {
    const owner = pieces
      .filter((p) => p.outer.depth === h.depth - 1 && inside(h.pts[0], p.outer.pts))
      .sort((a, b) => a.outer.area - b.outer.area)[0];
    if (owner) owner.holes.push(h);
  }
  return pieces;
}

/**
 * The whole model. `plates` counts land plates; the base (sea) plate is extra.
 * Levels: the coastline, then even steps up to the top, rounded to 0.5 m.
 */
export function buildModel(grid, W, H, { cellM, scale, sea = 0.5, plates = 4, interval, tol, minArea, features, offset = [0, 0] }) {
  let elevMax = 0;
  for (const v of grid) elevMax = Math.max(elevMax, v);
  const step = interval || Math.max(0.5, Math.round((elevMax / plates) * 2) / 2);
  const levels = [sea];
  for (let k = 1; k < plates && k * step < elevMax; k++) levels.push(k * step);
  const mm = (m) => (m * 1000) / scale;
  const toMM = (gi, gj) => [mm((gi + 0.5) * cellM), mm((gj + 0.5) * cellM)];
  const layers = levels.map((level, k) => ({ n: k + 1, level, pieces: buildLayer(grid, W, H, level, toMM, { tol, minArea }) }));
  const model = { scale, sea, step, elevMax, levels, layers, frameW: mm(W * cellM), frameH: mm(H * cellM), mm };
  if (features) model.details = etchDetails(grid, W, H, levels, features, offset, toMM);
  return model;
}

/**
 * Roads, paths and houses, sorted onto the plate whose top they end up on.
 * `features` are in full-grid coordinates ({ roads, paths, houses }: arrays of
 * flat [gi, gj, gi, gj, ...]); `offset` is the crop corner. A road that climbs
 * the hill is split wherever it steps onto the next plate. Paths come back
 * already cut into dashes (1.2 mm on, 0.8 mm off) — laser software tends to
 * ignore stroke-dasharray. Returns per plate { roads, paths, houses } in mm.
 */
export function etchDetails(grid, W, H, levels, features, [oi, oj], toMM) {
  const sample = (x, y) => {
    if (x < 0 || y < 0 || x > W - 1 || y > H - 1) return -1;
    const i = Math.min(W - 2, Math.floor(x)), j = Math.min(H - 2, Math.floor(y)), u = x - i, v = y - j;
    const h = grid[j * W + i] * (1 - u) * (1 - v) + grid[j * W + i + 1] * u * (1 - v)
      + grid[(j + 1) * W + i] * (1 - u) * v + grid[(j + 1) * W + i + 1] * u * v;
    return levels.filter((l) => h >= l).length; // 0 = base plate
  };
  const out = Array.from({ length: levels.length + 1 }, () => ({ roads: [], paths: [], houses: [] }));
  const runs = (flat) => {
    const res = [];
    let cur = null;
    for (let k = 0; k + 3 < flat.length; k += 2) {
      const ax = flat[k] - oi, ay = flat[k + 1] - oj, bx = flat[k + 2] - oi, by = flat[k + 3] - oj;
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2)); // half-cell steps
      for (let t = k ? 1 : 0; t <= n; t++) {
        const x = ax + ((bx - ax) * t) / n, y = ay + ((by - ay) * t) / n, p = sample(x, y);
        if (!cur || cur.plate !== p) {
          if (cur && cur.pts.length > 1) res.push(cur);
          cur = { plate: p, pts: cur ? [cur.pts[cur.pts.length - 1]] : [] };
        }
        cur.pts.push([x, y]);
      }
    }
    if (cur && cur.pts.length > 1) res.push(cur);
    return res.filter((r) => r.plate >= 0).map((r) => ({ plate: r.plate, pts: simplify(r.pts.map(([x, y]) => toMM(x, y)), 0.05) }));
  };
  const dashes = (pts, on = 1.2, off = 0.8) => {
    const res = [];
    let drawing = true, left = on, cur = [pts[0]];
    for (let k = 1; k < pts.length; k++) {
      let [ax, ay] = pts[k - 1];
      const [bx, by] = pts[k];
      let seg = Math.hypot(bx - ax, by - ay);
      while (seg > left) {
        const t = left / seg;
        ax += (bx - ax) * t; ay += (by - ay) * t; seg -= left;
        if (drawing) { cur.push([ax, ay]); res.push(cur); } else cur = [[ax, ay]];
        drawing = !drawing; left = drawing ? on : off;
      }
      left -= seg;
      if (drawing) cur.push([bx, by]);
    }
    if (drawing && cur.length > 1) res.push(cur);
    return res;
  };
  for (const f of features.roads) for (const r of runs(f)) out[r.plate].roads.push(r.pts);
  for (const f of features.paths) for (const r of runs(f)) out[r.plate].paths.push(...dashes(r.pts));
  for (const f of features.houses) {
    let cx = 0, cy = 0;
    const n = f.length / 2;
    for (let k = 0; k < f.length; k += 2) { cx += f[k] - oi; cy += f[k + 1] - oj; }
    const p = sample(cx / n, cy / n);
    if (p < 0) continue;
    const pts = [];
    for (let k = 0; k < f.length; k += 2) pts.push(toMM(f[k] - oi, f[k + 1] - oj));
    out[p].houses.push(pts);
  }
  return out;
}

// Rough pole of inaccessibility: where a label has the most room.
export function labelPoint(piece) {
  const { x0, y0, x1, y1 } = piece.outer.box;
  const segDist = (px, py, pts) => {
    let best = Infinity;
    for (let k = 0, n = pts.length; k < n; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[(k + 1) % n];
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
    }
    return best;
  };
  let best = { d: -1, x: 0, y: 0 };
  const N = 24;
  for (let a = 0; a <= N; a++) {
    for (let b = 0; b <= N; b++) {
      const x = x0 + ((x1 - x0) * a) / N, y = y0 + ((y1 - y0) * b) / N;
      if (!inside([x, y], piece.outer.pts) || piece.holes.some((h) => inside([x, y], h.pts))) continue;
      let d = segDist(x, y, piece.outer.pts);
      for (const h of piece.holes) d = Math.min(d, segDist(x, y, h.pts));
      if (d > best.d) best = { d, x, y };
    }
  }
  return best;
}

// ---------------------------------------------------------------- SVG
//
// Laser convention: red #ff0000 = cut, blue #0000ff = score (the outline of
// the plate above, so you know where to glue it, plus labels), black #000000 =
// etched detail (roads, paths, houses) — separate colour so it gets its own power.

const f = (n) => +n.toFixed(3);
const ringD = (pts, dx = 0, dy = 0) => 'M' + pts.map(([x, y]) => `${f(x + dx)},${f(y + dy)}`).join('L') + 'Z';
const pieceD = (p, dx, dy) => [p.outer, ...p.holes].map((l) => ringD(l.pts, dx, dy)).join('');
export const layerD = (lay, dx = 0, dy = 0) => lay.pieces.map((p) => pieceD(p, dx, dy)).join('');
const HAIR = 0.05;
const CUT = `fill="none" stroke="#ff0000" stroke-width="${HAIR}"`;
const SCORE = `fill="none" stroke="#0000ff" stroke-width="${HAIR}"`;
const ETCH = `fill="none" stroke="#000000" stroke-width="${HAIR}"`;
const lineD = (pts, dx = 0, dy = 0) => 'M' + pts.map(([x, y]) => `${f(x + dx)},${f(y + dy)}`).join('L');
/** Etched roads, paths and houses for plate k, as one path's d. */
export function detailsD(model, k, dx = 0, dy = 0) {
  const d = model.details?.[k];
  if (!d) return '';
  return d.roads.map((p) => lineD(p, dx, dy)).join('') + d.paths.map((p) => lineD(p, dx, dy)).join('') + d.houses.map((p) => ringD(p, dx, dy)).join('');
}
const FONT = 'font-family="Helvetica, Arial, sans-serif"';
const TEXT = `${FONT} fill="#0000ff"`;

const svgDoc = (w, h, body) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}mm" height="${f(h)}mm" viewBox="0 0 ${f(w)} ${f(h)}">\n${body}\n</svg>\n`;

const plateName = (model, k) => `Plate ${k} · ${k ? model.layers[k - 1].level.toFixed(1) + ' m' : 'base / sea'}`;

function labels(model, k, dx, dy) {
  const lay = k ? model.layers[k - 1] : null;
  if (!lay) return `<text x="${f(dx + 4)}" y="${f(dy + model.frameH - 4)}" font-size="4" ${TEXT}>0</text>`;
  let s = '';
  lay.pieces.forEach((p, i) => {
    const lp = labelPoint(p);
    const size = Math.min(4, lp.d * 0.9);
    if (size < 1.2) return;
    s += `<text x="${f(lp.x + dx)}" y="${f(lp.y + dy + size * 0.35)}" font-size="${f(size)}" text-anchor="middle" ${TEXT}>${k}${lay.pieces.length > 1 ? '.' + (i + 1) : ''}</text>`;
  });
  return s;
}

function plateBody(model, k, dx, dy) {
  const lay = k ? model.layers[k - 1] : null;
  const above = model.layers[k];
  let s = lay
    ? `<path d="${layerD(lay, dx, dy)}" ${CUT}/>`
    : `<rect x="${f(dx)}" y="${f(dy)}" width="${f(model.frameW)}" height="${f(model.frameH)}" ${CUT}/>`;
  if (above) s += `<path d="${layerD(above, dx, dy)}" ${SCORE}/>`;
  const etch = detailsD(model, k, dx, dy);
  if (etch) s += `<path d="${etch}" ${ETCH}/>`;
  return s + labels(model, k, dx, dy);
}

/** One plate, true scale, full frame — every plate registers on the same frame. */
export function plateSVG(model, k) {
  const pad = 10;
  return svgDoc(model.frameW + 2 * pad, model.frameH + 2 * pad,
    `<text x="${pad}" y="${pad * 0.7}" font-size="5" ${TEXT}>${plateName(model, k)}</text>` + plateBody(model, k, pad, pad));
}

/** Every plate cropped to its extent and packed onto one A3 sheet (scaled). */
export function platesA3SVG(model) {
  const gap = 8, head = 7;
  const items = [{ k: 0, box: { x0: 0, y0: 0, x1: model.frameW, y1: model.frameH } }];
  for (const lay of model.layers) {
    if (!lay.pieces.length) continue;
    const bs = lay.pieces.map((p) => p.outer.box);
    items.push({ k: lay.n, box: {
      x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)),
      x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)),
    } });
  }
  // Try a few row widths, keep the packing that lands biggest on A3 landscape.
  let best = null;
  for (let cols = 1; cols <= items.length; cols++) {
    const maxW = model.frameW * cols + gap * (cols + 1);
    let x = gap, y = gap, rowH = 0, width = 0, body = '';
    for (const it of items) {
      const w = it.box.x1 - it.box.x0, h = it.box.y1 - it.box.y0 + head;
      if (x + w + gap > maxW + 0.01 && x > gap) { x = gap; y += rowH + gap; rowH = 0; }
      const dx = x - it.box.x0, dy = y + head - it.box.y0;
      body += `<text x="${f(x)}" y="${f(y + head * 0.7)}" font-size="5" ${TEXT}>${plateName(model, it.k)}</text>`;
      body += plateBody(model, it.k, dx, dy);
      x += w + gap;
      rowH = Math.max(rowH, h);
      width = Math.max(width, x);
    }
    const height = y + rowH + gap;
    const s = Math.min((420 - 16) / width, (297 - 22) / height);
    if (!best || s > best.s) best = { s, width, height, body };
  }
  const { s, width, body } = best;
  const thin = body.replaceAll(`stroke-width="${HAIR}"`, 'stroke-width="0.25" vector-effect="non-scaling-stroke"');
  return svgDoc(420, 297,
    `<text x="8" y="9" font-size="3.6" ${FONT} fill="#222">Havsudden contour model — ${model.layers.length + 1} plates, one every ${model.step} m (coast at ${model.sea} m)</text>` +
    `<text x="8" y="14" font-size="2.6" ${FONT} fill="#555">Drawn at 1:${model.scale}, shown at ${f(s * 100)}% (1:${Math.round(model.scale / s).toLocaleString('en')}). Red = cut · blue = score: where the plate above is glued.</text>` +
    `<g transform="translate(${f((420 - width * s) / 2)},18) scale(${f(s)})">${thin}</g>`);
}

/**
 * Every piece of every plate as its own item, with what gets scored and
 * etched on it: the pieces of the plate above that sit on it (blue), the
 * roads/paths/houses on its top (black), and its number.
 */
export function pieceItems(model) {
  const items = [];
  const frame = [[0, 0], [model.frameW, 0], [model.frameW, model.frameH], [0, model.frameH]];
  for (let k = 0; k <= model.layers.length; k++) {
    const lay = k ? model.layers[k - 1] : null;
    const pieces = lay ? lay.pieces : [{ outer: { pts: frame, box: bbox(frame) }, holes: [] }];
    const above = model.layers[k]?.pieces ?? [];
    const det = model.details?.[k] ?? { roads: [], paths: [], houses: [] };
    const inPiece = (piece, pt) => inside(pt, piece.outer.pts) && !piece.holes.some((h) => inside(pt, h.pts));
    // Etching is sorted onto plates by the elevation grid, but cut by the
    // simplified contour; clip lines to the piece so nothing runs off its edge.
    const clip = (piece, pts) => {
      const runs = [];
      let cur = [];
      for (let k = 0; k < pts.length; k++) {
        const [ax, ay] = pts[Math.max(0, k - 1)], [bx, by] = pts[k];
        const n = k ? Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5)) : 1;
        for (let t = k ? 1 : n; t <= n; t++) {
          const q = [ax + ((bx - ax) * t) / n, ay + ((by - ay) * t) / n];
          if (inPiece(piece, q)) cur.push(q);
          else if (cur.length) { runs.push(cur); cur = []; }
        }
      }
      if (cur.length) runs.push(cur);
      return runs.filter((r) => r.length > 1).map((r) => simplify(r, 0.05));
    };
    const centroid = (pts) => pts.reduce(([x, y], [a, b]) => [x + a / pts.length, y + b / pts.length], [0, 0]);
    pieces.forEach((piece, i) => {
      const lines = (list) => (lay ? list.flatMap((p) => clip(piece, p)) : list);
      items.push({
        k, i, piece, box: piece.outer.box,
        name: `${k}${pieces.length > 1 ? '.' + (i + 1) : ''}`,
        above: above.filter((a) => !lay || inside(a.outer.pts[0], piece.outer.pts)),
        roads: lines(det.roads), paths: lines(det.paths),
        houses: det.houses.filter((h) => !lay || inPiece(piece, centroid(h))),
      });
    });
  }
  return items;
}

function pieceBody(it, dx, dy) {
  let s = `<path d="${pieceD(it.piece, dx, dy)}" ${CUT}/>`;
  if (it.above.length) s += `<path d="${it.above.map((a) => pieceD(a, dx, dy)).join('')}" ${SCORE}/>`;
  const etch = it.roads.map((p) => lineD(p, dx, dy)).join('') + it.paths.map((p) => lineD(p, dx, dy)).join('') + it.houses.map((p) => ringD(p, dx, dy)).join('');
  if (etch) s += `<path d="${etch}" ${ETCH}/>`;
  if (it.k === 0) {
    s += northArrow(dx + it.box.x0 + 14, dy + it.box.y0 + 8, 20, 5);
    return s + `<text x="${f(dx + it.box.x0 + 4)}" y="${f(dy + it.box.y1 - 4)}" font-size="4" ${TEXT}>0</text>`;
  }
  // The number and arrow are put where the next plate up will cover them, at the
  // roomiest point of the biggest piece sitting on this one. A piece with nothing
  // on top is exposed in the finished model, so it gets no number or arrow.
  const lp = it.above.map((a) => labelPoint(a)).sort((a, b) => b.d - a.d)[0];
  if (!lp) return s;
  // Pieces with room get a north arrow over their label, so each one can be
  // turned the right way before gluing; the arrow rotates with the piece on the sheet.
  if (lp.d >= ARROW_MIN_D) {
    const size = Math.min(3, lp.d * 0.4), len = Math.min(12, lp.d * 0.9);
    const top = lp.y + dy - (len + 1 + size) / 2;
    return s + northArrow(lp.x + dx, top, len, size * 0.8) +
      `<text x="${f(lp.x + dx)}" y="${f(top + len + 1 + size * 0.8)}" font-size="${f(size)}" text-anchor="middle" ${TEXT}>${it.name}</text>`;
  }
  const size = Math.min(4, lp.d * 0.9);
  if (size >= 1.2) s += `<text x="${f(lp.x + dx)}" y="${f(lp.y + dy + size * 0.35)}" font-size="${f(size)}" text-anchor="middle" ${TEXT}>${it.name}</text>`;
  return s;
}

const ARROW_MIN_D = 5; // mm: inscribed radius a piece needs before it gets a north arrow

/** Etched north arrow, tip at (x, top), `len` mm long, with an N above when `n` > 0 (font size). Model north is up. */
function northArrow(x, top, len, n = 0) {
  const h = Math.min(len * 0.4, 5), w = h * 0.35, tail = top + len;
  let s = `<path d="M${f(x)},${f(tail)}L${f(x)},${f(top + h)}M${f(x)},${f(top)}L${f(x + w)},${f(top + h)}L${f(x - w)},${f(top + h)}Z" ${ETCH}/>`;
  if (n >= 3.5) s += `<text x="${f(x)}" y="${f(top - 1.2)}" font-size="${f(n)}" text-anchor="middle" ${TEXT}>N</text>`;
  return s;
}

const ringLen = (pts, closed) => {
  let s = 0;
  for (let k = 1; k < pts.length + (closed ? 1 : 0); k++) { const a = pts[k - 1], b = pts[k % pts.length]; s += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  return s;
};

// The base / sea plate is plain board, bought and cut to the frame separately,
// so it's only laid out for the laser when asked for (`base: true`).
const cutItems = (model, base) => pieceItems(model).filter((it) => base || it.k > 0);

/** Total cut / score / etch line length in mm — what the laser time scales with. */
export function lineLengths(model, { base = false } = {}) {
  const out = { cut: 0, score: 0, etch: 0 };
  for (const it of cutItems(model, base)) {
    for (const r of [it.piece.outer, ...it.piece.holes]) out.cut += ringLen(r.pts, true);
    for (const a of it.above) for (const r of [a.outer, ...a.holes]) out.score += ringLen(r.pts, true);
    for (const p of [...it.roads, ...it.paths]) out.etch += ringLen(p, false);
    for (const p of it.houses) out.etch += ringLen(p, true);
  }
  return out;
}

// Shelf packing, tallest first; an item is turned 90° when it lies better wide
// side down or that's the only way it fits. Sizes in, placements out.
function pack(sizes, { bedW, bedH, margin, gap }) {
  const usableW = bedW - 2 * margin, usableH = bedH - 2 * margin;
  const placed = [], tooBig = [];
  const items = sizes.map(([w0, h0], idx) => {
    let w = w0, h = h0, rot = false;
    if ((h > w && h <= usableW && w <= usableH) || ((w > usableW || h > usableH) && h <= usableW && w <= usableH)) { [w, h] = [h, w]; rot = true; }
    return { idx, w, h, rot };
  }).filter((it) => (it.w <= usableW && it.h <= usableH) || (tooBig.push(it.idx), false)).sort((a, b) => b.h - a.h);
  let sheet = -1, x = 0, y = 0, rowH = 0;
  for (const it of items) {
    if (sheet < 0) sheet = 0;
    if (x + it.w > usableW) { x = 0; y += rowH + gap; rowH = 0; }
    if (y + it.h > usableH) { sheet++; x = 0; y = 0; rowH = 0; }
    placed.push({ ...it, sheet, X: margin + x, Y: margin + y });
    x += it.w + gap;
    rowH = Math.max(rowH, it.h);
  }
  return { placed, sheets: sheet + 1, tooBig };
}

const BED = { bedW: 1200, bedH: 900, margin: 10, gap: 4, base: false, notes: true };

const NOTES_COLOR = '#00a000';
// Instructions for whoever runs the laser, written into the free space of each sheet.
function sheetNotes(opt, k, n) {
  return [
    'LASER NOTES - green text is not part of the job: skip it (0% power) or delete it before cutting.',
    `Sheet ${opt.bedW} x ${opt.bedH} mm, drawn 1:1${opt.thick ? `, ${opt.thick} mm board` : ''}, ${opt.gap} mm between pieces. Check the size after opening the file.`,
    'RED = CUT through.  BLUE = SCORE (shallow guide lines and piece numbers).  BLACK = ETCH (roads, paths, houses, north arrows).',
    'Order: BLACK and BLUE first, RED (cut) last, so loose pieces do not shift.',
    'Number = plate.piece (2.1 = plate 2, piece 1), marked where the next plate covers it. Pieces with no number are the top ones: match their shape to a blue outline.',
    'Glue each piece inside its blue outline on the plate below, etched side up, arrow pointing the same way as the arrow on that plate.',
    `Sheet ${k + 1} of ${n}`,
  ];
}

/**
 * The base / sea plate at true scale, for marking up the board you buy for it:
 * its outline (red), where the lowest land pieces go (blue), the north arrow.
 */
export function baseGuideSVG(model) {
  const pad = 10;
  return svgDoc(model.frameW + 2 * pad, model.frameH + 2 * pad,
    `<text x="${pad}" y="${pad * 0.7}" font-size="5" ${TEXT}>Base plate ${Math.round(model.frameW)} × ${Math.round(model.frameH)} mm · red = board edge · blue = where plate 1 is glued</text>` +
    pieceBody(pieceItems(model)[0], pad, pad));
}

/**
 * True-scale pieces packed onto laser-bed sheets (default: Epilog Fusion Pro
 * 48, 1200 × 900 mm). Strokes are 0.025 mm — the Epilog driver only
 * vector-cuts lines of 0.001″ or thinner, anything wider gets rastered.
 * Returns { sheets: [svg], tooBig: [names] }.
 */
export function bedSheetsSVG(model, bed = {}) {
  const opt = { ...BED, ...bed };
  const items = cutItems(model, opt.base);
  const { placed, sheets, tooBig } = pack(items.map((it) => [it.box.x1 - it.box.x0, it.box.y1 - it.box.y0]), opt);
  const bodies = Array.from({ length: sheets }, () => '');
  for (const p of placed) {
    const it = items[p.idx];
    const inner = pieceBody(it, -it.box.x0, -it.box.y0);
    bodies[p.sheet] += p.rot
      ? `<g transform="translate(${f(p.X + p.w)},${f(p.Y)}) rotate(90)">${inner}</g>`
      : `<g transform="translate(${f(p.X)},${f(p.Y)})">${inner}</g>`;
  }
  if (opt.notes) {
    const spaces = sheetSpace(model, opt);
    bodies.forEach((_, k) => {
      const lines = sheetNotes(opt, k, sheets), { x, y, w, h } = spaces[k].free;
      const size = Math.min(5, w / (Math.max(...lines.map((l) => l.length)) * 0.55));
      if (size < 2.5 || h < lines.length * size * 1.5 + 8) return; // no room: leave the sheet clean
      const y0 = y + h - 4 - (lines.length - 1) * size * 1.5;
      bodies[k] += `<g transform="translate(0,0)">${lines.map((l, i) =>
        `<text x="${f(x + 4)}" y="${f(y0 + i * size * 1.5)}" font-size="${f(size)}" ${FONT} fill="${NOTES_COLOR}">${l}</text>`).join('')}</g>`;
    });
  }
  // `screen`: visible lines for looking at the sheet in a browser; the default is the cutter's hairline.
  const thin = (b) => b.replaceAll(`stroke-width="${HAIR}"`, opt.screen ? 'stroke-width="1.4" vector-effect="non-scaling-stroke"' : 'stroke-width="0.025"');
  return { sheets: bodies.map((b) => svgDoc(opt.bedW, opt.bedH, thin(b))), tooBig: tooBig.map((i) => items[i].name) };
}

/**
 * The bed sheets as DXF (R12 ASCII, mm, Y up) for shops whose software wants DXF.
 * Layers CUT / SCORE / ETCH (red / blue / black). Built from the SVG sheets, so
 * placement, rotation and labels are identical. Returns { sheets: [dxf], tooBig }.
 */
export function bedSheetsDXF(model, bed = {}) {
  const opt = { ...BED, ...bed };
  const { sheets, tooBig } = bedSheetsSVG(model, opt);
  const LAYER = { '#ff0000': ['CUT', 1], '#0000ff': ['SCORE', 5], '#000000': ['ETCH', 7], [NOTES_COLOR]: ['NOTES', 3] };
  const n = (v) => +v.toFixed(4);
  const out = (codes) => codes.map(([c, v]) => `${c}\n${v}`).join('\n') + '\n';
  return {
    tooBig,
    sheets: sheets.map((svg) => {
      let ents = '';
      for (const [, tx, ty, rot, inner] of svg.matchAll(/<g transform="translate\(([-\d.]+),([-\d.]+)\)( rotate\(90\))?">([\s\S]*?)<\/g>/g)) {
        // SVG is y-down and turns rotate(90) clockwise; DXF is y-up, so flip y and turn -90°.
        const at = (x, y) => { if (rot) [x, y] = [-y, x]; return [n(+tx + x), n(opt.bedH - (+ty + y))]; };
        for (const [, d, color] of inner.matchAll(/<path d="([^"]+)"[^>]*stroke="(#[0-9a-f]{6})"/g)) {
          const layer = LAYER[color][0];
          for (const sub of d.split('M').filter(Boolean)) {
            const pts = [...sub.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => at(+m[1], +m[2]));
            if (pts.length < 2) continue;
            ents += out([[0, 'POLYLINE'], [8, layer], [66, 1], [70, sub.endsWith('Z') ? 1 : 0]]);
            for (const [x, y] of pts) ents += out([[0, 'VERTEX'], [8, layer], [10, x], [20, y]]);
            ents += out([[0, 'SEQEND'], [8, layer]]);
          }
        }
        for (const [, x, y, size, attrs, text] of inner.matchAll(/<text x="([-\d.]+)" y="([-\d.]+)" font-size="([\d.]+)"([^>]*)>([^<]*)<\/text>/g)) {
          const [px, py] = at(+x, +y), centre = attrs.includes('text-anchor="middle"');
          const layer = LAYER[attrs.match(/fill="(#[0-9a-f]{6})"/)?.[1]]?.[0] ?? 'SCORE';
          ents += out([[0, 'TEXT'], [8, layer], [10, px], [20, py], [40, size], [1, text.replace(/[^\x20-\x7e]/g, '-')], [50, rot ? 270 : 0],
            ...(centre ? [[72, 1], [11, px], [21, py]] : [])]);
        }
      }
      const layers = Object.values(LAYER).map(([name, col]) => out([[0, 'LAYER'], [2, name], [70, 0], [62, col], [6, 'CONTINUOUS']])).join('');
      return out([[0, 'SECTION'], [2, 'HEADER'], [9, '$ACADVER'], [1, 'AC1009'], [9, '$INSUNITS'], [70, 4], [0, 'ENDSEC'],
        [0, 'SECTION'], [2, 'TABLES'], [0, 'TABLE'], [2, 'LTYPE'], [70, 1], [0, 'LTYPE'], [2, 'CONTINUOUS'], [70, 0], [3, 'Solid line'], [72, 65], [73, 0], [40, 0], [0, 'ENDTAB'],
        [0, 'TABLE'], [2, 'LAYER'], [70, 4]]) + layers + out([[0, 'ENDTAB'], [0, 'ENDSEC'], [0, 'SECTION'], [2, 'ENTITIES']]) + ents + out([[0, 'ENDSEC'], [0, 'EOF']]);
    }),
  };
}

const ringArea = (pts) => Math.abs(pts.reduce((s, [x, y], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; return s + x * y2 - x2 * y; }, 0)) / 2;

/**
 * What's left on each bed sheet once the pieces are placed: plywood the pieces
 * use, area still free, and the biggest empty rectangle for other cuts (keyrings
 * and the like) — inside the edge margin and clear of every piece by the gap.
 * Pieces are treated as their bounding boxes, as the packer does, so the free
 * numbers are on the cautious side. Sizes in mm, one entry per sheet.
 */
export function sheetSpace(model, bed = {}) {
  const opt = { ...BED, ...bed };
  const items = cutItems(model, opt.base);
  const { placed, sheets } = pack(items.map((it) => [it.box.x1 - it.box.x0, it.box.y1 - it.box.y0]), opt);
  const R = 2; // mm per cell
  const cols = Math.floor(opt.bedW / R), rows = Math.floor(opt.bedH / R);
  return Array.from({ length: sheets }, (_, s) => {
    const occ = new Uint8Array(cols * rows);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if (i * R < opt.margin || (i + 1) * R > opt.bedW - opt.margin || j * R < opt.margin || (j + 1) * R > opt.bedH - opt.margin) occ[j * cols + i] = 1;
      }
    }
    let material = 0;
    for (const p of placed.filter((q) => q.sheet === s)) {
      const it = items[p.idx];
      material += ringArea(it.piece.outer.pts) - it.piece.holes.reduce((t, h) => t + ringArea(h.pts), 0);
      const i0 = Math.max(0, Math.floor((p.X - opt.gap) / R)), i1 = Math.min(cols, Math.ceil((p.X + p.w + opt.gap) / R));
      const j0 = Math.max(0, Math.floor((p.Y - opt.gap) / R)), j1 = Math.min(rows, Math.ceil((p.Y + p.h + opt.gap) / R));
      for (let j = j0; j < j1; j++) occ.fill(1, j * cols + i0, j * cols + i1);
    }
    // Biggest empty rectangle: column heights per row, then the classic stack scan.
    let best = { a: 0, i: 0, j: 0, w: 0, h: 0 }, free = 0;
    const hts = new Int32Array(cols + 1);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const open = !occ[j * cols + i];
        hts[i] = open ? hts[i] + 1 : 0;
        if (open) free++;
      }
      const stack = [];
      for (let i = 0; i <= cols; i++) {
        let start = i;
        while (stack.length && stack.at(-1)[1] >= hts[i]) {
          const [st, h] = stack.pop();
          if (h * (i - st) > best.a) best = { a: h * (i - st), i: st, j: j - h + 1, w: i - st, h };
          start = st;
        }
        stack.push([start, hts[i]]);
      }
    }
    const total = opt.bedW * opt.bedH;
    return {
      sheet: s, materialPct: (material / total) * 100, freePct: ((free * R * R) / total) * 100,
      free: { x: best.i * R, y: best.j * R, w: best.w * R, h: best.h * R },
    };
  });
}

/**
 * Biggest model, as a tidy 1:N (steps of 50), that still fits the sheets:
 * `one: true` → every piece on a single sheet, otherwise just the base plate
 * on one sheet. Packing is re-run on piece sizes scaled from this model.
 */
export function fitScale(model, { one = false, ...bed } = {}) {
  const opt = { ...BED, ...bed };
  const metres = (one ? cutItems(model, opt.base).map((it) => it.box) : [{ x0: 0, y0: 0, x1: model.frameW, y1: model.frameH }])
    .map((b) => [((b.x1 - b.x0) * model.scale) / 1000, ((b.y1 - b.y0) * model.scale) / 1000]);
  const fits = (N) => {
    const r = pack(metres.map(([w, h]) => [(w * 1000) / N, (h * 1000) / N]), opt);
    return r.sheets <= 1 && !r.tooBig.length;
  };
  let lo = 50, hi = 50;
  while (!fits(hi)) { lo = hi; hi *= 2; }
  while (hi - lo > 50) { const mid = Math.round((lo + hi) / 100) * 50; if (fits(mid)) hi = mid; else lo = mid; }
  return hi;
}

// Tint ramp: shore green → granite → pale summit.
function tint(t) {
  const stops = [[0, [196, 214, 160]], [0.35, [168, 190, 128]], [0.7, [190, 168, 120]], [1, [236, 226, 208]]];
  let k = 0;
  while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
  const [t0, c0] = stops[k], [t1, c1] = stops[k + 1];
  const u = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  return `rgb(${c0.map((c, i) => Math.round(c + (c1[i] - c) * u)).join(',')})`;
}

/** Tinted map of the model on A3 portrait — the one to look at. */
export function overviewA3SVG(model, places = [], credit = '') {
  const pageW = 297, pageH = 420, m = 14, titleH = 22;
  const { frameW: FW, frameH: FH, layers } = model;
  const s = Math.min((pageW - 2 * m) / FW, (pageH - 2 * m - titleH - 30) / FH);
  const ox = (pageW - FW * s) / 2, oy = m + titleH + 6;
  const fsz = 4.2;
  let body = `<rect width="100%" height="100%" fill="#fbfaf6"/>`;
  body += `<text x="${f(ox)}" y="${f(m + fsz)}" font-size="${f(fsz * 1.6)}" ${FONT} font-weight="bold" fill="#222">Havsudden · Meriniemi, Emäsalo</text>`;
  body += `<text x="${f(ox)}" y="${f(m + fsz * 2.8)}" font-size="${f(fsz * 0.75)}" ${FONT} fill="#555">Contour model · ${layers.length + 1} plates · one every ${model.step} m (coast at ${model.sea} m) · top ${model.elevMax.toFixed(1)} m · drawn 1:${model.scale}, ${Math.round(FW)} × ${Math.round(FH)} mm</text>`;
  body += `<g transform="translate(${f(ox)},${f(oy)}) scale(${f(s)})">`;
  body += `<rect width="${f(FW)}" height="${f(FH)}" fill="#c9dbe3"/>`;
  for (const lay of layers) {
    body += `<path d="${layerD(lay)}" fill="${tint((lay.n - 1) / Math.max(1, layers.length - 1))}" fill-rule="evenodd" stroke="#3a3a32" stroke-width="0.15" vector-effect="non-scaling-stroke"/>`;
  }
  const etch = model.layers.map((_, k) => detailsD(model, k)).join('') + detailsD(model, model.layers.length);
  if (etch) body += `<path d="${etch}" fill="none" stroke="#4a4038" stroke-width="0.12" vector-effect="non-scaling-stroke"/>`;
  body += `<rect width="${f(FW)}" height="${f(FH)}" fill="none" stroke="#222" stroke-width="0.3" vector-effect="non-scaling-stroke"/>`;
  const r = 1.2 / s;
  for (const p of places) {
    body += `<circle cx="${f(p.at[0])}" cy="${f(p.at[1])}" r="${f(r)}" fill="#b0302a"/>`;
    body += `<text x="${f(p.at[0] + r * 1.8)}" y="${f(p.at[1] + r)}" font-size="${f((fsz * 0.7) / s)}" ${FONT} fill="#222">${p.name}</text>`;
  }
  body += `</g>`;
  // legend, top-left inside the frame
  const lx = ox + fsz, ly = oy + fsz;
  layers.forEach((lay, k) => {
    const y = ly + (layers.length - 1 - k) * fsz * 0.9;
    body += `<rect x="${f(lx)}" y="${f(y)}" width="${f(fsz * 0.8)}" height="${f(fsz * 0.7)}" fill="${tint(k / Math.max(1, layers.length - 1))}" stroke="#3a3a32" stroke-width="0.1"/>`;
    body += `<text x="${f(lx + fsz * 1.2)}" y="${f(y + fsz * 0.62)}" font-size="${f(fsz * 0.65)}" ${FONT} fill="#222">Plate ${lay.n} · ${lay.level.toFixed(1)} m</text>`;
  });
  // scale bar + north arrow
  const by = oy + FH * s + 8;
  const metres = [50, 100, 200, 250, 500, 1000].find((x) => model.mm(x) * s >= (FW * s) / 5) ?? 1000;
  const len = model.mm(metres) * s, q = len / 4;
  for (let k = 0; k < 4; k++) body += `<rect x="${f(ox + k * q)}" y="${f(by)}" width="${f(q)}" height="1.8" fill="${k % 2 ? '#fff' : '#222'}" stroke="#222" stroke-width="0.2"/>`;
  body += `<text x="${f(ox)}" y="${f(by + 6)}" font-size="3" ${FONT} fill="#222">0</text>`;
  body += `<text x="${f(ox + len)}" y="${f(by + 6)}" font-size="3" text-anchor="middle" ${FONT} fill="#222">${metres} m</text>`;
  const nx = ox + FW * s - 4, ny = by + 4;
  body += `<path d="M${f(nx)},${f(ny - 5)}L${f(nx + 1.8)},${f(ny + 2.5)}L${f(nx)},${f(ny + 1.2)}L${f(nx - 1.8)},${f(ny + 2.5)}Z" fill="#222"/>`;
  body += `<text x="${f(nx)}" y="${f(ny - 6)}" font-size="3" text-anchor="middle" ${FONT} fill="#222">N</text>`;
  if (credit) body += `<text x="${f(pageW - m)}" y="${f(pageH - 6)}" text-anchor="end" font-size="2.2" ${FONT} fill="#777">${credit}</text>`;
  return svgDoc(pageW, pageH, body);
}

/**
 * The land connected to a seed cell, for cutting a peninsula off at its neck.
 * Flood-fills cells at or above `join` metres (a low neck stops it), then grows
 * `grow` cells back out through the shore belt (sea..join) so the coastline
 * itself isn't shaved off. Returns a Uint8Array mask and its bounding box.
 */
export function landMask(grid, W, H, si, sj, { join = 2, sea = 0.5, grow = 4 } = {}) {
  const mask = new Uint8Array(W * H);
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let front = [sj * W + si];
  if (grid[front[0]] < join) return null;
  mask[front[0]] = 1;
  const box = { i0: si, j0: sj, i1: si, j1: sj };
  const visit = (pass) => {
    const next = [];
    while (front.length) {
      const c = front.pop(), i = c % W, j = (c - i) / W;
      box.i0 = Math.min(box.i0, i); box.i1 = Math.max(box.i1, i); box.j0 = Math.min(box.j0, j); box.j1 = Math.max(box.j1, j);
      for (const [di, dj] of N4) {
        const ni = i + di, nj = j + dj, n = nj * W + ni;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H || mask[n]) continue;
        if (pass === 'flood' ? grid[n] < join : grid[n] < sea) continue;
        mask[n] = 1;
        (pass === 'flood' ? front : next).push(n);
      }
    }
    return next;
  };
  visit('flood');
  // Seed the growth from every masked cell, then grow ring by ring.
  for (let k = 0; k < W * H; k++) if (mask[k]) front.push(k);
  for (let g = 0; g < grow; g++) front = visit('grow');
  return { mask, box };
}
