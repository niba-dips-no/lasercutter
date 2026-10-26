/**
 * Flat parts for a table-top e-paper housing: a wedge that leans back, with a
 * 165 × 100 mm window. All dimensions in millimetres, 1:1, y pointing down.
 *
 * Side view, in (u, v): u runs back from the front foot, v runs up. Four panels
 * stand between two side plates, each held by tabs that go through slots in the sides:
 *   Front   leans back by `tiltDeg`; carries the window; pinned ears
 *   Back    vertical; pinned ears; USB-C slot
 *   Bottom, Top   horizontal, between Front and Back; plain tabs, press fit
 * The ears of Front and Back pass right through the sides and stick out `pin + 5` mm;
 * a small stick (the pin) through the hole in each ear locks it. Pull the pins on one
 * side and that side slides off, which opens the whole box.
 * A frame ring glues to the inside of the Front; its window is the pocket for the glass and screen.
 *
 * The slot width is thickness + clearance; the laser cuts on the line, so tabs come out
 * about a kerf (≈0.15 mm) smaller and slots a kerf bigger. Test-cut a joint first and
 * tune `clearance` (negative values tighten it) to the board you really have.
 */
export const HOUSING_DEFAULTS = {
  thickness: 6,        // board thickness
  clearance: 0.1,      // added to slot width and length
  opening: [165, 100], // window in the face plate
  openingOffset: 0,    // mm the window sits above centre
  module: [175, 110],  // the screen module behind it
  moduleFit: 2,        // slack around the glass and module (total, across and down)
  moduleThickness: 1,  // the screen module's thickness (about 1 mm or less; measure yours)
  glass: null,         // cover glass [w, h]; default is the module size
  glassThickness: 1.5, // cover glass, sits behind the window in front of the screen
  frameWall: 9,        // width of the frame ring that holds the glass and screen: the bezel and the tape area
  tiltDeg: 12,         // lean back from vertical
  pin: 3,              // stick diameter for the ears
  usb: [14, 8],        // USB-C slot, long × short: a standard plug's overmould is about 12 × 6.5, this leaves ~1 mm to spare
  usbBack: false,      // also cut a USB-C slot in the Back (off: the cable uses the side slot only)
  usbHeight: 25,       // centre of the USB-C slots above the bottom of the housing
  usbDepth: 9,         // side slot: centre this far in front of the Back's inner face (the board sits on the Back)
  foot: 5,             // side material around the panels
  topDepth: 18,        // clear depth under the top panel, front plate to back panel
  earLength: 40,       // along the Front / Back edge
  tabLength: 12,       // Top / Bottom tabs, at most
};

const rad = (d) => (d * Math.PI) / 180;

/** Everything derived from the options: key lengths and the panel placements in the side plane. */
export function housingModel(o = {}) {
  const p = { ...HOUSING_DEFAULTS, ...o };
  const { thickness: T, clearance: c, foot: m, pin: d } = p;
  if (!(T > 0)) throw new Error('thickness must be > 0');
  if (!(p.tiltDeg >= 0 && p.tiltDeg < 45)) throw new Error('tiltDeg must be in [0, 45)');
  if (!(d > 0 && d < T + 6)) throw new Error('pin diameter looks wrong');
  const a = rad(p.tiltDeg), sin = Math.sin(a), cos = Math.cos(a), tan = Math.tan(a);
  const glass = p.glass ?? p.module;
  const pocket = [Math.max(glass[0], p.module[0]) + p.moduleFit, Math.max(glass[1], p.module[1]) + p.moduleFit]; // window of the frame ring
  const railLayers = Math.max(1, Math.ceil((p.glassThickness + p.moduleThickness) / T - 1e-9)); // ring layers: pocket depth in boards
  const Wi = pocket[0] + 2 * p.frameWall;                                  // between the sides
  const frameH = pocket[1] + 2 * p.frameWall;
  const Hf = frameH + 2 + (T * (2 - sin)) / cos;                           // face plate height along the slope
  if (p.opening[0] > Wi - 12 || p.opening[1] > Hf - 12) throw new Error('window is too big for the plate');
  const P = d + 5;                                                         // ear protrusion beyond the side
  const E = T + P;                                                         // ear length from the body edge
  const uFi = (v) => v * tan + (m + T) / cos;                              // inner face of the Front
  const vT1 = m + T * sin + Hf * cos;                                      // top of the loop
  const vT0 = vT1 - T;
  const Ub = uFi(vT0) + p.topDepth;                                        // back panel's front face
  const Hb = vT1 - m;
  const ub0 = uFi(m + T), ut0 = uFi(vT1 - T * sin);
  const Pob = [uFi(m) - T * cos, m + T * sin];                             // Front: outer bottom corner
  const dir = [sin, cos], inward = [cos, -sin];
  const sideH = vT1 + m, sideD = Ub + T + m;
  return { p, glass, pocket, frameH, railLayers, T, c, m, d, a, sin, cos, tan, Wi, Hf, Hb, P, E, uFi, vT0, vT1, Ub, ub0, ut0, Pob, dir, inward, sideH, sideD,
    Lb: Ub - ub0, Lt: Ub - ut0 };
}

// ---------------------------------------------------------------- helpers

const bounds = (pts) => ({ x0: Math.min(...pts.map((q) => q[0])), y0: Math.min(...pts.map((q) => q[1])), x1: Math.max(...pts.map((q) => q[0])), y1: Math.max(...pts.map((q) => q[1])) });
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const circle = (cx, cy, r, n = 20) => Array.from({ length: n }, (_, k) => [cx + r * Math.cos((k / n) * 2 * Math.PI), cy + r * Math.sin((k / n) * 2 * Math.PI)]);
/** Rounded slot (stadium) w × h centred on (cx, cy). */
const stadium = (cx, cy, w, h, n = 8) => {
  const r = Math.min(w, h) / 2, pts = [];
  const horizontal = w >= h, half = (Math.max(w, h) - 2 * r) / 2;
  for (const sgn of [1, -1]) {
    for (let k = 0; k <= n; k++) {
      const t = (k / n) * Math.PI - Math.PI / 2 + (sgn === 1 ? 0 : Math.PI) + (horizontal ? 0 : Math.PI / 2); // tall slots turn the caps to the ends
      const ox = horizontal ? sgn * half : 0, oy = horizontal ? 0 : sgn * half;
      pts.push([cx + ox + r * Math.cos(t), cy + oy + r * Math.sin(t)]);
    }
  }
  return pts;
};

/** A body W wide and L long (x across, s along, both from 0) with ears/tabs of length E on both edges. */
function withEars(W, L, ears, E, chamfer) {
  const right = [], left = [];
  for (const [s0, len] of ears) {
    right.push([W, s0], [W + E - chamfer, s0], [W + E, s0 + chamfer], [W + E, s0 + len - chamfer], [W + E - chamfer, s0 + len], [W, s0 + len]);
    left.unshift([0, s0 + len], [-E + chamfer, s0 + len], [-E, s0 + len - chamfer], [-E, s0 + chamfer], [-E + chamfer, s0], [0, s0]);
  }
  return [[0, 0], [W, 0], ...right, [W, L], [0, L], ...left];
}

/** Ear positions along a panel edge: n of them, evenly spread between lo and hi. */
function spread(lo, hi, n, len) {
  const out = [];
  for (let k = 0; k < n; k++) out.push([lo + ((hi - lo - len) * (n === 1 ? 0.5 : k / (n - 1))), len]);
  return out;
}

// ---------------------------------------------------------------- layout of tabs and slots

function tabs(M) {
  const { p, T, Hf, Hb, Wi, Lb, Lt, sin, cos } = M;
  const edge = 8; // bridge of side material kept between slots and corners
  // Front: along the slope from its bottom end, clear of the bottom / top panels.
  const fLo = T / cos + edge, fHi = Hf - (T * (1 - sin)) / cos - edge;
  const front = spread(fLo, fHi, 1, Math.min(p.earLength, fHi - fLo));
  const back = spread(T + edge, Hb - T - edge, 1, Math.min(p.earLength, Hb - 2 * T - 2 * edge));
  const count = (L) => (L > 70 ? 3 : L >= 34 ? 2 : 1);
  const len = (L, n, e) => Math.max(4, Math.min(p.tabLength, (L - 2 * e - (n - 1) * 6) / n));
  const mk = (L) => { const n = count(L), e = Math.min(edge, L / 4); return spread(e, L - e, n, len(L, n, e)); };
  const bottom = mk(Lb), top = mk(Lt);
  return { front, back, bottom, top, Wi };
}

/** Side plane slots as (u, v) polygons, plus the USB slot, from the same tab list. */
function slots(M, tb) {
  const { T, c, m, Ub, ub0, ut0, Pob, dir, inward, vT1, tan } = M;
  const out = [];
  for (const [y, len] of tb.bottom) out.push(rect(ub0 + y - c / 2, m - c / 2, ub0 + y + len + c / 2, m + T + c / 2));
  for (const [y, len] of tb.top) out.push(rect(ut0 + y - c / 2, vT1 - T - c / 2, ut0 + y + len + c / 2, vT1 + c / 2));
  for (const [y, len] of tb.back) out.push(rect(Ub - c / 2, m + y - c / 2, Ub + T + c / 2, m + y + len + c / 2));
  for (const [s, len] of tb.front) {
    const at = (ss, t) => [Pob[0] + ss * dir[0] + t * inward[0], Pob[1] + ss * dir[1] + t * inward[1]];
    out.push([at(s - c / 2, -c / 2), at(s + len + c / 2, -c / 2), at(s + len + c / 2, T + c / 2), at(s - c / 2, T + c / 2)]);
  }
  return out;
}

// ---------------------------------------------------------------- parts

function finish(name, id, outer, holes, note, qty = 1) {
  const { x0, y0 } = bounds(outer);
  const sh = (poly) => poly.map(([x, y]) => [+(x - x0).toFixed(3), +(y - y0).toFixed(3)]);
  return { id, name, qty, outer: sh(outer), holes: holes.map(sh), note };
}

export function housingParts(o = {}) {
  const M = housingModel(o), { p, T, c, m, d, Wi, Hf, Hb, E, P, Ub, vT1, sideH, sideD, tan } = M;
  const tb = tabs(M);
  const flipY = (L) => (poly) => poly.map(([x, s]) => [x, L - s]);
  const pinHole = (L, s0, len, side) => { // hole in the ear, seen in flat (x, s) coordinates
    const hx = T + d / 2 - 0.15, cx = side > 0 ? Wi + hx : -hx;
    return circle(cx, s0 + len / 2, (d + 0.2) / 2, 16);
  };
  const earHoles = (list) => list.flatMap(([s0, len]) => [pinHole(0, s0, len, 1), pinHole(0, s0, len, -1)]);

  // Front: window centred across, `openingOffset` above centre along the slope.
  const [ow, oh] = p.opening;
  const ocy = Hf / 2 + p.openingOffset;
  const front = finish('Front', 'H1', flipY(Hf)(withEars(Wi, Hf, tb.front, E, 1.5)),
    [flipY(Hf)(rect(Wi / 2 - ow / 2, ocy - oh / 2, Wi / 2 + ow / 2, ocy + oh / 2)), ...earHoles(tb.front).map(flipY(Hf))],
    'Window 165 × 100. Ears go through the sides; a pin in each ear locks it.');

  // Back: USB-C slot low on the right.
  const usbBack = stadium(Wi - 25, p.usbHeight - m, p.usb[0], p.usb[1]);
  const back = finish('Back', 'H2', flipY(Hb)(withEars(Wi, Hb, tb.back, E, 1.5)),
    [...(p.usbBack ? [flipY(Hb)(usbBack)] : []), ...earHoles(tb.back).map(flipY(Hb))], p.usbBack ? `USB-C slot ${p.usbHeight} mm above the bottom, toward the right.` : 'Plain: the USB-C cable uses the side slot.');

  const bottom = finish('Bottom', 'H6', flipY(M.Lb)(withEars(Wi, M.Lb, tb.bottom, T - 0.3, 0)), [], 'Press-fit tabs. Rests on the sides.');
  const top = finish('Top', 'H5', flipY(M.Lt)(withEars(Wi, M.Lt, tb.top, T - 0.3, 0)), [], 'Press-fit tabs.');

  // Sides: trapezoid, front edge leaning back. y down: y = sideH - v.
  const toXY = (poly) => poly.map(([u, v]) => [u, sideH - v]);
  const outline = toXY([[0, 0], [sideD, 0], [sideD, sideH], [sideH * tan, sideH]]);
  const slotPolys = slots(M, tb).map(toXY);
  // The ESP32 board lies against the Back with its port facing the right side, so its wide side is vertical.
  const usbSide = toXY(stadium(Ub - p.usbDepth, p.usbHeight, p.usb[1], p.usb[0]));
  // Normalisation must not move the side (slots are in its own frame), so shift by the outline min (0, 0).
  const sidePlain = finish('Side', 'H3', outline, slotPolys, 'Plain side. Cut two sides; one with the USB-C slot.');
  const sideUsb = finish('Side (USB)', 'H4', outline, [...slotPolys, usbSide], `USB-C slot ${p.usbDepth} mm in front of the Back, ${p.usbHeight} mm up, tall for a board lying against the Back.`);

  // Frame ring: glued inside the Front, it makes the pocket that holds the glass and the screen on all four sides.
  const ringW = Wi - 0.6, ringH = M.frameH, [pw, ph] = M.pocket;
  const rail = finish('Glass & screen frame', 'H7', rect(0, 0, ringW, ringH), [rect((ringW - pw) / 2, (ringH - ph) / 2, (ringW + pw) / 2, (ringH + ph) / 2)],
    M.railLayers > 1 ? `Glue ${M.railLayers} layers together, then to the inside of the Front, to make the pocket deep enough for glass and screen.` : 'Glue to the inside of the Front. The glass and screen sit in its window.', M.railLayers);
  return [front, back, sidePlain, sideUsb, top, bottom, rail];
}

/** Dimensions and words for a human. */
export function housingInfo(o = {}) {
  const M = housingModel(o), { p, T, Wi, Hf, E, P, Ub, sideH, sideD, vT0, vT1, m, tan, cos, sin } = M;
  const parts = housingParts(o);
  const bb = (part) => bounds(part.outer);
  const areaOf = (poly) => Math.abs(poly.reduce((s, [x, y], i) => { const [x2, y2] = poly[(i + 1) % poly.length]; return s + x * y2 - x2 * y; }, 0)) / 2;
  const material = parts.reduce((t, part) => t + part.qty * (areaOf(part.outer) - part.holes.reduce((s, h) => s + areaOf(h), 0)), 0);
  const stack = { module: p.module[1], esp32: 12, battery: 8 };
  const depthBottom = Ub - M.ub0, depthTop = Ub - M.uFi(vT0);
  const warnings = [];
  if (depthTop - T < 8) warnings.push('Little room above the screen for the flat cables; raise topDepth.');
  warnings.push('Sizes of the FireBeetle ESP32-E board (assumed about 58 × 26 mm) and the RS PRO 1.8 Ah battery (assumed 50 × 34 × 8 mm) are guesses: measure both. A 1.8 Ah pack is often 8-10 mm thick.');
  if (depthBottom < 25) warnings.push('Bottom depth is tight for the ESP32 board and battery.');
  return {
    outside: { w: +(Wi + 2 * T).toFixed(1), wWithEars: +(Wi + 2 * T + 2 * P).toFixed(1), d: +sideD.toFixed(1), h: +sideH.toFixed(1) },
    inside: { w: Wi, depthBottom: +depthBottom.toFixed(1), depthTop: +depthTop.toFixed(1), screenClear: +(Hf - (T * (2 - sin)) / cos).toFixed(1) },
    window: p.opening, module: p.module,
    pins: { count: 4, diameter: p.pin, length: T + 10, note: `cut four sticks about ${T + 10} mm long` },
    glass: { size: M.glass, thickness: p.glassThickness, pocket: M.railLayers * T, window: M.pocket, stackNeeded: p.glassThickness + p.moduleThickness },
    stack,
    usb: { slot: p.usb, height: p.usbHeight, depth: p.usbDepth },
    cornerGap: +(T * tan).toFixed(1),
    parts: parts.map((q) => ({ id: q.id, name: q.name, qty: q.qty, w: +(bb(q).x1 - bb(q).x0).toFixed(1), h: +(bb(q).y1 - bb(q).y0).toFixed(1) })),
    materialAreaMm2: Math.round(material),
    steps: [
      `Glue the frame ring (H7${M.railLayers > 1 ? `, ${M.railLayers} layers glued together` : ''}) to the inside of the Front (H1), centred on the window.`,
      `Lay the cover glass (${M.glass[0]} × ${M.glass[1]} × ${p.glassThickness} mm) in the ring's ${M.pocket[0]} × ${M.pocket[1]} mm window, against the Front. Stick it down with clear double-sided tape or a thin bead of silicone on the ${((M.glass[0] - p.opening[0]) / 2).toFixed(1)} mm border around the window only, never over the window. Then put the screen in behind it, a pad of foam behind that.`,
      'Lay the Side (USB) (H4) flat, outside face down, so the slots point up.',
      'Stand Bottom (H6), Top (H5), Back (H2) and Front (H1) in their slots. The ears of Front and Back go all the way through.',
      `Run the screen's flat cable back, and stick the ESP32 board to the inside of the Back with its USB-C port facing the slot in the Side (USB): about ${p.usbDepth} mm in front of the Back and ${p.usbHeight} mm up, so use roughly ${Math.max(0, p.usbDepth - 4)} mm of foam or spacers behind it. The board charges the battery itself. Put the battery on the Bottom.`,
      'Lower the other Side (H3) onto all the tabs and press it home.',
      `Push a pin (${p.pin} mm stick) through the hole in each of the four ears. Glue is optional.`,
      'To open it: pull the pins on one side and slide that side off.',
    ],
    warnings,
  };
}
