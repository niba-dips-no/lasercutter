// Copied from havsudden-3d/src — keep in step with it; that repo is the source of truth.
/**
 * Named waypoints for the review matrix and the screenshot tool.
 * Coordinates are WGS84, taken from the archive place records and OSM.
 *
 *   yaw    compass bearing the camera faces (degrees, 0 = north)
 *   eye    eye height above ground (metres) — 1.68 is the standing player
 *   alt    optional: absolute altitude instead of eye height (aerial views)
 *   pitch  optional: camera pitch in degrees, negative looks down
 *   fov    optional: vertical field of view for a photo review (degrees)
 */

export const WAYPOINTS = {
  // Reference-photo positions; viewing bearings are authored, not surveyed.
  'evening-rocks': {
    label: 'Evening rocks — west-facing shore',
    lat: 60.2150444444, lon: 25.6091666667, yaw: 310, eye: 1.68, pitch: -7,
  },
  'forest-light': {
    label: 'Forest light — the mossy stones beyond the clearing',
    // Owner-confirmed NNE; lens/crop and pitch remain estimates.
    lat: 60.2154527778, lon: 25.6112888889, yaw: 22.5, eye: 1.68, pitch: -5.5, fov: 64,
  },
  // Aerial validation views — these exist to prove the DEM, the projection and
  // the world origin agree. Not player-facing.
  overview: {
    label: 'Aerial — the whole cape from the south',
    lat: 60.2000, lon: 25.6133, alt: 900, yaw: 0, pitch: -22,
  },
  'overview-top': {
    label: 'Aerial — plan view of the DEM extent',
    lat: 60.2164, lon: 25.6110, alt: 2600, yaw: 0, pitch: -89,
  },

  havsudden: {
    label: 'Havsudden / Meriniemi — the hamlet centre',
    lat: 60.2155624, lon: 25.6132720, yaw: 200, eye: 1.68,
  },
  strandstugan: {
    label: 'Strandstugan — shore cottage, west side',
    lat: 60.2176841, lon: 25.6077420, yaw: 250, eye: 1.68,
  },
  'stora-villan': {
    label: 'Stora Villan — the big villa',
    lat: 60.2171110, lon: 25.6088300, yaw: 160, eye: 1.68,
  },
  bykstranden: {
    label: 'Bykstranden — the washing shore, water\'s edge',
    lat: 60.2169334, lon: 25.6159586, yaw: 90, eye: 1.68,
  },
  'cape-tip': {
    label: 'Southern tip — exposed granite and the lower leading mark',
    // On the crest, not behind it. Thirty metres north of here the ground is
    // 1.3 m lower, and a rise that shallow is enough to hide the entire sea
    // from a standing eye — the view was nothing but ground and sky.
    lat: 60.2125622, lon: 25.6145725, yaw: 180, eye: 1.68,
  },
  nyberga: {
    label: 'Nyberga — northern, inland',
    lat: 60.2218940, lon: 25.6017660, yaw: 120, eye: 1.68,
  },
  ithaka: {
    label: 'Ithaka — southern house',
    lat: 60.2124840, lon: 25.6156120, yaw: 300, eye: 1.68,
  },
  tennisplan: {
    label: 'Tennisplan — open clearing',
    lat: 60.2167930, lon: 25.6084530, yaw: 45, eye: 1.68,
  },
};

export const WAYPOINT_NAMES = Object.keys(WAYPOINTS);
