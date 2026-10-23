// Copied from havsudden-3d/src — keep in step with it; that repo is the source of truth.
/**
 * Coordinate projection: WGS84 ↔ EPSG:3067 (TM35FIN) ↔ Three.js world space.
 *
 * World origin = Havsudden hamlet node (OSM 1921919297):
 *   lat 60.2155624, lon 25.6132720
 *   → TM35FIN E 423159.068, N 6676225.388
 *
 * Three.js convention: +X = east, +Z = south, +Y = up.
 * All distances in metres.
 */

import proj4 from 'proj4';

// EUREF-FIN / TM35FIN  (EPSG:3067)
const EPSG3067 = '+proj=tmerc +lat_0=0 +lon_0=27 +k=0.9996 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
const WGS84 = 'EPSG:4326';

// World origin pinned to verified Overpass coordinates for node 1921919297.
const ORIGIN_LAT = 60.2155624;
const ORIGIN_LON = 25.6132720;
const [ORIGIN_E, ORIGIN_N] = proj4(WGS84, EPSG3067, [ORIGIN_LON, ORIGIN_LAT]);

/**
 * WGS84 → Three.js world (x, z). Y must be set by the caller (terrain height).
 */
export function latLonToWorld(lat, lon) {
  const [e, n] = proj4(WGS84, EPSG3067, [lon, lat]);
  return { x: e - ORIGIN_E, z: ORIGIN_N - n };
}

/** Fixed metre frame for authored scenery, independent of review cameras. */
export function localFrame(lat, lon, bearing) {
  const origin = latLonToWorld(lat, lon);
  const angle = bearing * Math.PI / 180;
  const fx = Math.sin(angle), fz = -Math.cos(angle);
  const rx = Math.cos(angle), rz = Math.sin(angle);
  return {
    origin, bearing,
    point(along, across) {
      return { x: origin.x + fx * along + rx * across, z: origin.z + fz * along + rz * across };
    },
    local(x, z) {
      const dx = x - origin.x, dz = z - origin.z;
      return { along: dx * fx + dz * fz, across: dx * rx + dz * rz };
    },
  };
}

/**
 * TM35FIN easting/northing → Three.js world (x, z).
 */
export function tm35finToWorld(e, n) {
  return { x: e - ORIGIN_E, z: ORIGIN_N - n };
}

/**
 * DEM pixel (col, row) → Three.js world (x, z).
 * Uses the GeoTIFF origin and pixel size from heightmap.json metadata.
 */
export function demPixelToWorld(col, row, demMeta) {
  const e = demMeta.originE + col * demMeta.pixelSize;
  const n = demMeta.originN - row * demMeta.pixelSize; // pixel Y is south
  return tm35finToWorld(e, n);
}

/**
 * Three.js world (x, z) → WGS84 (lat, lon).
 */
export function worldToLatLon(x, z) {
  const e = x + ORIGIN_E;
  const n = ORIGIN_N - z;
  const [lon, lat] = proj4(EPSG3067, WGS84, [e, n]);
  return { lat, lon };
}

export { ORIGIN_E, ORIGIN_N, ORIGIN_LAT, ORIGIN_LON, EPSG3067, WGS84 };
