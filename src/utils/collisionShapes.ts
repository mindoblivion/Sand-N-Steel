/**
 * collisionShapes.ts — Centralized collision registry and geometry for the
 * Sand & Steel city hub.
 *
 * All collision shapes are derived from VERIFIED world positions and physical
 * footprints read directly from the 3D building source files
 * (src/components/3d/city/*). They do NOT use HUB_LOCATIONS interaction radii.
 *
 * Geometry functions are pure 2D math (circle vs rect / circle / segment) with
 * no three.js or React dependency, making them trivially unit-testable.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Player collision radius in world units. Single tuning constant. */
export const PLAYER_RADIUS = 0.4;

// ─────────────────────────────────────────────────────────────────────────────
// Collider Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RectCollider {
  type: 'rect';
  id: string;
  cx: number; // center X (world)
  cz: number; // center Z (world)
  hw: number; // half-width  (X)
  hd: number; // half-depth  (Z)
}

export interface CircleCollider {
  type: 'circle';
  id: string;
  cx: number;
  cz: number;
  r: number; // obstacle radius
}

export interface SegmentCollider {
  type: 'segment';
  id: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

export type Collider = RectCollider | CircleCollider | SegmentCollider;

// ─────────────────────────────────────────────────────────────────────────────
// Geometry Tests — pure functions, no side effects
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Circle (player) vs axis-aligned rectangle.
 * Returns true when the circle overlaps or penetrates the rectangle.
 */
export function collidesRect(
  px: number, pz: number, r: number, rect: RectCollider,
): boolean {
  const closestX = Math.max(rect.cx - rect.hw, Math.min(px, rect.cx + rect.hw));
  const closestZ = Math.max(rect.cz - rect.hd, Math.min(pz, rect.cz + rect.hd));
  const dx = px - closestX;
  const dz = pz - closestZ;
  return dx * dx + dz * dz < r * r;
}

/**
 * Circle (player) vs circle obstacle.
 * Returns true when the two circles overlap.
 */
export function collidesCircle(
  px: number, pz: number, r: number, c: CircleCollider,
): boolean {
  const dx = px - c.cx;
  const dz = pz - c.cz;
  const combined = r + c.r;
  return dx * dx + dz * dz < combined * combined;
}

/**
 * Circle (player) vs finite line segment, including endpoints.
 * Finds the closest point on the segment to the circle center and
 * compares the distance to the radius.
 */
export function collidesSegment(
  px: number, pz: number, r: number, s: SegmentCollider,
): boolean {
  const dx = s.x2 - s.x1;
  const dz = s.z2 - s.z1;
  const lenSq = dx * dx + dz * dz;
  let t = 0;
  if (lenSq > 1e-10) {
    t = ((px - s.x1) * dx + (pz - s.z1) * dz) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }
  const cx = s.x1 + t * dx;
  const cz = s.z1 + t * dz;
  const ddx = px - cx;
  const ddz = pz - cz;
  return ddx * ddx + ddz * ddz < r * r;
}

/**
 * Test a player circle against an array of colliders.
 * Returns true as soon as any collider is hit (early exit).
 */
export function collidesWith(
  px: number, pz: number, r: number, colliders: readonly Collider[],
): boolean {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.type === 'rect') {
      if (collidesRect(px, pz, r, c)) return true;
    } else if (c.type === 'circle') {
      if (collidesCircle(px, pz, r, c)) return true;
    } else {
      if (collidesSegment(px, pz, r, c)) return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Penetration Depth — how deep a circle penetrates a single collider.
//
// Returns 0 when there is no overlap.  Higher values = deeper penetration.
// The score is continuous: it increases as the circle center moves deeper
// into the obstacle and decreases as it moves toward the boundary, reaching
// 0 when the circle just separates.
//
// For rects, when the center is *inside* the rect the closest-point
// distance is 0, which would always give penetration = r regardless of how
// deep the center is.  To distinguish depth we add the distance from the
// center to the nearest rect edge (the "escape distance"), so a center at
// the middle of a large rect scores higher than one near the edge.
//
// This function is the foundation of safe collision recovery: when the
// player is already inside a collider, resolveCityMovement only permits
// movement that *reduces* the total penetration score, guiding the player
// out without allowing them to walk through the opposite wall.
// ─────────────────────────────────────────────────────────────────────────────

export function penetrationDepth(
  px: number, pz: number, r: number, c: Collider,
): number {
  if (c.type === 'rect') {
    const closestX = Math.max(c.cx - c.hw, Math.min(px, c.cx + c.hw));
    const closestZ = Math.max(c.cz - c.hd, Math.min(pz, c.cz + c.hd));
    const dx = px - closestX;
    const dz = pz - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq >= r * r) return 0;
    const dist = Math.sqrt(distSq);
    if (dist < 1e-10) {
      // Center is inside the rect — sum the distance to the nearest edge on
      // each axis independently.  This ensures movement on EITHER axis
      // changes the score: when the nearest edge is on the Z axis, moving in
      // X still reduces the X-axis contribution, so the player can always
      // make progress toward the nearest exit instead of being locked to one
      // axis by a global minimum.
      const distX = Math.min(
        px - (c.cx - c.hw),
        (c.cx + c.hw) - px,
      );
      const distZ = Math.min(
        pz - (c.cz - c.hd),
        (c.cz + c.hd) - pz,
      );
      return r + Math.max(0, distX) + Math.max(0, distZ);
    }
    return r - dist;
  }
  if (c.type === 'circle') {
    const dx = px - c.cx;
    const dz = pz - c.cz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const combined = r + c.r;
    if (dist >= combined) return 0;
    return combined - dist;
  }
  // segment
  const sdx = c.x2 - c.x1;
  const sdz = c.z2 - c.z1;
  const lenSq = sdx * sdx + sdz * sdz;
  let t = 0;
  if (lenSq > 1e-10) {
    t = ((px - c.x1) * sdx + (pz - c.z1) * sdz) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }
  const cx = c.x1 + t * sdx;
  const cz = c.z1 + t * sdz;
  const ddx = px - cx;
  const ddz = pz - cz;
  const distSq = ddx * ddx + ddz * ddz;
  if (distSq >= r * r) return 0;
  return r - Math.sqrt(distSq);
}

/**
 * Returns the IDs of all colliders that the circle overlaps at (px, pz).
 * Used by the recovery fallback to detect when a candidate move would enter
 * a NEW collider that the player was not previously overlapping.
 */
export function overlappingColliderIds(
  px: number, pz: number, r: number,
  colliders: readonly Collider[],
): Set<string> {
  const ids = new Set<string>();
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.type === 'rect') {
      if (collidesRect(px, pz, r, c)) ids.add(c.id);
    } else if (c.type === 'circle') {
      if (collidesCircle(px, pz, r, c)) ids.add(c.id);
    } else {
      if (collidesSegment(px, pz, r, c)) ids.add(c.id);
    }
  }
  return ids;
}

/**
 * Maximum individual penetration depth across all colliders.
 * Lower = closer to being free from the deepest collider.
 *
 * Used as a secondary score in the recovery fallback: even when total
 * penetration is constant (a saddle point), reducing the max penetration
 * makes progress toward exiting at least one collider.
 */
export function maxPenetration(
  px: number, pz: number, r: number,
  colliders: readonly Collider[],
): number {
  let max = 0;
  for (let i = 0; i < colliders.length; i++) {
    const d = penetrationDepth(px, pz, r, colliders[i]);
    if (d > max) max = d;
  }
  return max;
}

/**
 * Total penetration score — sum of penetration depths against all colliders
 * that the circle overlaps.  Lower = closer to being free.  0 = no collision.
 *
 * Used by resolveCityMovement to decide whether a proposed move from an
 * already-overlapping position is reducing penetration (allowed) or not
 * (blocked, fail safe).
 */
export function totalPenetration(
  px: number, pz: number, r: number,
  colliders: readonly Collider[],
): number {
  let total = 0;
  for (let i = 0; i < colliders.length; i++) {
    const d = penetrationDepth(px, pz, r, colliders[i]);
    if (d > 0) total += d;
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// Arc Segment Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate line-segment colliders approximating a circular arc.
 * @param thetaStart  start angle (inclusive)
 * @param thetaEnd    end angle (inclusive)
 * @param count       number of segments
 * @param idPrefix    id prefix for each segment
 * @param pointFn     maps an angle to a world [x, z] point
 */
function arcSegments(
  thetaStart: number,
  thetaEnd: number,
  count: number,
  idPrefix: string,
  pointFn: (theta: number) => [number, number],
): SegmentCollider[] {
  const out: SegmentCollider[] = [];
  const dTheta = (thetaEnd - thetaStart) / count;
  for (let i = 0; i < count; i++) {
    const t1 = thetaStart + i * dTheta;
    const t2 = thetaStart + (i + 1) * dTheta;
    const [x1, z1] = pointFn(t1);
    const [x2, z2] = pointFn(t2);
    out.push({ type: 'segment', id: `${idPrefix}-${i}`, x1, z1, x2, z2 });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Building Footprint Rectangles
//
// Each rectangle uses the BuildingFoundation's lower-step dimensions
// (foundationWidth + 2 * projection) / 2, etc., centered at the building's
// verified world root position.  Source files are cited per entry.
// ─────────────────────────────────────────────────────────────────────────────

const RECT: (id: string, cx: number, cz: number, w: number, d: number) => RectCollider =
  (id, cx, cz, w, d) => ({ type: 'rect', id, cx, cz, hw: w / 2, hd: d / 2 });

const buildingRects: RectCollider[] = [
  // Ishtar Gatehouse — root [0, 0, 24]
  // Central: foundation [14.2, 4.8], proj 0.25 → 14.7 × 5.3
  RECT('ishtar-central', 0, 24, 14.7, 5.3),
  // Left tower: local [-8.5, 0], foundation [4.4, 5.4], proj 0.25 → 4.9 × 5.9
  RECT('ishtar-tower-l', -8.5, 24, 4.9, 5.9),
  // Right tower: local [8.5, 0], same dimensions
  RECT('ishtar-tower-r', 8.5, 24, 4.9, 5.9),

  // SmithingForge — root [18, 0, 2], foundation [9.5, 7.5], proj 0.25 → 10.0 × 8.0
  // Phase C-8.10: width narrowed 10.0 → 9.5 to align east edge with wall face
  // at X≈22.75, opening the intended passage to the ArmorLeatherWorkshop.
  RECT('smithing-forge', 18, 2, 9.5, 8.0),

  // CityTavern — root [-16, 0, 14], foundation [8.4, 7.2], proj 0.25 → 9.4 × 7.7
  RECT('city-tavern', -16, 14, 9.4, 7.7),

  // GeneralStore — root [22, 0, -5], foundation [7.2, 5.8], proj 0.25 → 7.7 × 6.3
  RECT('general-store', 22, -5, 7.7, 6.3),

  // CaravanseraiInn — root [16, 0, 14], foundation [8.6, 7.6], proj 0.25 → 9.6 × 8.1
  RECT('caravanserai', 16, 14, 9.6, 8.1),

  // MerchantHouse — root [26, 0, -12], foundation [7.2, 6.5], proj 0.25 → 7.7 × 7.0
  RECT('merchant-house', 26, -12, 7.7, 7.0),

  // ArmorLeatherWorkshop — root [28.2, 0, 1], foundation [8.4, 5.2] proj 0.25
  // offset [0, 0, 0.15] → center [28.2, 1.15], footprint 8.9 × 5.7
  RECT('armor-workshop', 28.2, 1.15, 8.9, 5.7),

  // Stable — root [26, 0, 15], foundation [7.0, 7.2], proj 0.25 → 7.5 × 7.7
  RECT('stable', 26, 15, 7.5, 7.7),

  // GladiatorAcademy — root [30.5, 0, -27], foundation [7.2, 6.8], proj 0.25 → 7.7 × 7.3
  RECT('gladiator-academy', 30.5, -27, 7.7, 7.3),

  // DoctoreHouse — root [28, 0, -17], foundation [5.5, 5.0], proj 0.25 → 6.0 × 5.5
  RECT('doctore-house', 28, -17, 6.0, 5.5),

  // RecordsLibrary — root [24, 0, -30], foundation [6.0, 5.2], proj 0.25 → 6.5 × 5.7
  RECT('records-library', 24, -30, 6.5, 5.7),

  // PublicBathhouse — root [-26, 0, 25], foundation [7.5, 6.5], proj 0.25 → 8.0 × 7.0
  RECT('bathhouse', -26, 25, 8.0, 7.0),

  // RomanShrine — root [-27, 0, 11], foundation [5.8, 5.0], proj 0.25 → 6.3 × 5.5
  RECT('roman-shrine', -27, 11, 6.3, 5.5),

  // BountyHall — root [-15, 0, 26], foundation [6.5, 5.5], proj 0.25 → 7.0 × 6.0
  RECT('bounty-hall', -15, 26, 7.0, 6.0),

  // GladiatorBarracks — root [-27, 0, -14], foundation [6.6, 5.6], proj 0.25 → 7.1 × 6.1
  RECT('gladiator-barracks', -27, -14, 7.1, 6.1),

  // VeteranGladiatorHall — root [-24, 0, -25], custom plinth [6.6, 6.1] → 6.6 × 6.1
  RECT('veteran-hall', -24, -25, 6.6, 6.1),

  // ArenaMedicalHouse — root [-29, 0, -5], foundation [4.9, 4.9], proj 0.3 → 5.5 × 5.5
  RECT('arena-medical', -29, -5, 5.5, 5.5),
];

// ─────────────────────────────────────────────────────────────────────────────
// Fountain — central plaza, ProcessionAvenue.tsx root [0, 0, 0]
// Tier 1 outer basin: cylinderGeometry [3.2, 3.6, 0.7] → outer radius 3.6
// ─────────────────────────────────────────────────────────────────────────────

const fountainCircle: CircleCollider = {
  type: 'circle',
  id: 'fountain',
  cx: 0,
  cz: 0,
  r: 3.6,
};

// ─────────────────────────────────────────────────────────────────────────────
// Colosseum Curved Exterior Wall — GrandColosseum.tsx, root [0, 0, -25]
//
// Convention: X = R·sin(θ), Z = R·cos(θ) - 25
// R_FACADE = 19.3 (outer wall face)
// Arc spans θ ∈ [-0.85π, 0.85π] (306°), with entrance gap θ ∈ [-0.43, 0.43]
// Two arc segments: left [-0.85π, -0.43] and right [0.43, 0.85π], 8 segs each.
// Sagitta per segment ≈ 0.19 < player radius 0.4 → no squeeze-through.
// ─────────────────────────────────────────────────────────────────────────────

const COLOSSEUM_R = 19.3;
const COLOSSEUM_ROOT_Z = -25;
const COLO_THETA_START = -Math.PI * 0.85;
const COLO_THETA_END = Math.PI * 0.85; // -0.85π + 1.7π
const COLO_ENTRANCE_MIN = -0.43;
const COLO_ENTRANCE_MAX = 0.43;

function coloPoint(theta: number): [number, number] {
  return [
    COLOSSEUM_R * Math.sin(theta),
    COLOSSEUM_R * Math.cos(theta) + COLOSSEUM_ROOT_Z,
  ];
}

const colosseumWallSegments: SegmentCollider[] = [
  ...arcSegments(COLO_THETA_START, COLO_ENTRANCE_MIN, 8, 'colo-wall-l', coloPoint),
  ...arcSegments(COLO_ENTRANCE_MAX, COLO_THETA_END, 8, 'colo-wall-r', coloPoint),
];

// Colosseum Portal Piers — GrandColosseum.tsx
// Portal group at local [0, 0, 15.2] → world [0, 0, -9.8]
// Piers at local [±3.925, 4.4, 0], size [2.65, 8.8, 3.4]
// World centers: [±3.925, -9.8], half-width 1.325, half-depth 1.7
const colosseumPiers: RectCollider[] = [
  RECT('colo-pier-l', -3.925, -9.8, 2.65, 3.4),
  RECT('colo-pier-r', 3.925, -9.8, 2.65, 3.4),
];

// ─────────────────────────────────────────────────────────────────────────────
// Training Yard Curved Enclosure Wall — TrainingYard.tsx, root [-18, 0, 0]
//
// Convention: X = R·cos(θ) - 18, Z = R·sin(θ)
// WALL_RADIUS = 7.0, ENTRANCE_CHORD = 2.5
// ENTRANCE_HALF_ANGLE = asin(2.5 / 14) ≈ 0.1794 rad
// Wall spans θ ∈ [0.1794, 2π - 0.1794], 14 segments.
// Entrance gap at θ = 0 faces +X (world), width ≈ 2.5 at wall radius.
// Sagitta per segment ≈ 0.16 < player radius 0.4.
// ─────────────────────────────────────────────────────────────────────────────

const YARD_R = 7.0;
const YARD_ROOT_X = -18;
const YARD_ENTRANCE_HALF = Math.asin(2.5 / (2 * YARD_R));

function yardPoint(theta: number): [number, number] {
  return [
    YARD_R * Math.cos(theta) + YARD_ROOT_X,
    YARD_R * Math.sin(theta),
  ];
}

const yardWallSegments: SegmentCollider[] = arcSegments(
  YARD_ENTRANCE_HALF,
  2 * Math.PI - YARD_ENTRANCE_HALF,
  14,
  'yard-wall',
  yardPoint,
);

// ─────────────────────────────────────────────────────────────────────────────
// Training Yard Boundary StreetWalls — CityStreets.tsx
//
// Two axis-aligned parallel walls at X = -13.5:
//   North wall: center [-13.5, 3.05], size [0.6, _, 3.1]
//   South wall: center [-13.5, -3.05], size [0.6, _, 3.1]
//
// Two 45° mitred return walls (rotated, represented as segments):
//   North return: center [-13.854, 4.954], rotation -π/4, length 1.249
//   South return: center [-13.854, -4.954], rotation -3π/4, length 1.249
// ─────────────────────────────────────────────────────────────────────────────

const streetWallRects: RectCollider[] = [
  RECT('street-wall-n', -13.5, 3.05, 0.6, 3.1),
  RECT('street-wall-s', -13.5, -3.05, 0.6, 3.1),
];

// Rotated return walls as centerline segments.
// Rotation -π/4 → long-axis direction (-√2/2, +√2/2)
// Rotation -3π/4 → long-axis direction (-√2/2, -√2/2)
const SQRT2_HALF = Math.SQRT1_2; // ≈ 0.7071
const returnHalfLen = (1.0 + 0.6 * Math.tan(Math.PI / 8)) / 2; // ≈ 0.624
const returnCenterX = -13.5 - SQRT2_HALF / 2; // ≈ -13.854
const northReturnCenterZ = 4.6 + SQRT2_HALF / 2; // ≈ 4.954
const southReturnCenterZ = -4.6 - SQRT2_HALF / 2; // ≈ -4.954

const streetWallSegments: SegmentCollider[] = [
  {
    type: 'segment',
    id: 'street-return-n',
    // direction (-0.7071, +0.7071), start = center - half * dir, end = center + half * dir
    x1: returnCenterX + returnHalfLen * SQRT2_HALF,
    z1: northReturnCenterZ - returnHalfLen * SQRT2_HALF,
    x2: returnCenterX - returnHalfLen * SQRT2_HALF,
    z2: northReturnCenterZ + returnHalfLen * SQRT2_HALF,
  },
  {
    type: 'segment',
    id: 'street-return-s',
    // direction (-0.7071, -0.7071)
    x1: returnCenterX + returnHalfLen * SQRT2_HALF,
    z1: southReturnCenterZ + returnHalfLen * SQRT2_HALF,
    x2: returnCenterX - returnHalfLen * SQRT2_HALF,
    z2: southReturnCenterZ - returnHalfLen * SQRT2_HALF,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Northern Fortress Walls — NorthernFortress.tsx, root [0, 4.72, -71.5]
//
// The fortress model (Z-up, 70×70 ground footprint) is rotated [-π/2, 0, 0]
// (Z-up → Y-up) and scaled 0.30, giving a 21×21 world footprint centered
// at [0, -71.5] on the motte summit (Y=4.72).  After rotation, the model's
// Y axis maps to world -Z, so:
//   South face (model Y = -35) → world Z = -71.5 + 10.5 = -61.0 (toward city)
//   North face (model Y = +35) → world Z = -71.5 - 10.5 = -82.0
//   East face  (model X = +35)  → world X = +10.5
//   West face  (model X = -35)  → world X = -10.5
//
// The visual gate (model X ±2.25, Y ≈ -28.5) is 1.35 units wide at this
// scale.  The collision gap is widened to ±1.0 world units (2.0 total)
// so the player can pass through with comfortable clearance.
//
// Wall thickness 1.2 world units (≈ 4 model units at scale 0.30).  Corner
// overlaps between adjacent wall rects are intentional and harmless.
//
// Phase 34G: colliders shifted north by 8.5 world units (Z: -59.5 → -68)
// to match the new fortress position on the motte summit.
// Phase 35F.5: complex shifted north by 3.5 units (Z: -68 → -71.5).
// ─────────────────────────────────────────────────────────────────────────────

const fortressWallRects: RectCollider[] = [
  // South wall — split at gate gap X ∈ [-1.0, 1.0]
  RECT('fortress-south-l', -5.75, -61.0, 9.5, 1.2),
  RECT('fortress-south-r', 5.75, -61.0, 9.5, 1.2),
  // North wall — full width
  RECT('fortress-north', 0, -82.0, 21.0, 1.2),
  // East / West walls — full depth
  RECT('fortress-east', 10.5, -71.5, 1.2, 21.0),
  RECT('fortress-west', -10.5, -71.5, 1.2, 21.0),
];

// ─────────────────────────────────────────────────────────────────────────────
// Northern Motte Perimeter — NorthernMotte.tsx, center [0, 0, -71.5]
//
// The motte is a raised earth mound with a moat ring at model radius ~70
// (world radius ≈22).  Collision segments around this perimeter prevent
// the player from walking onto the mound sides; the only access is the
// south-facing ramp.
//
// Convention: X = R·sin(θ), Z = R·cos(θ) + centerZ
// θ=0 → south (toward city +Z), θ=π → north
// Opening at θ=0 aligned with the ramp (world X ±2.83, half-angle ≈0.15 rad).
//
// 20 segments over the full arc; sagitta per segment ≈ 0.25 < player radius
// 0.4 → no squeeze-through.
// ─────────────────────────────────────────────────────────────────────────────

const MOTTE_R = 22.0;
const MOTTE_CENTER_Z = -71.5;
const RAMP_HALF_W = 9 * 0.3145; // 2.8305
const MOTTE_OPENING_HALF = Math.atan((RAMP_HALF_W + 0.4) / MOTTE_R); // ≈ 0.146 rad

function mottePoint(theta: number): [number, number] {
  return [
    MOTTE_R * Math.sin(theta),
    MOTTE_R * Math.cos(theta) + MOTTE_CENTER_Z,
  ];
}

const mottePerimeterSegments: SegmentCollider[] = arcSegments(
  MOTTE_OPENING_HALF,
  2 * Math.PI - MOTTE_OPENING_HALF,
  20,
  'motte-wall',
  mottePoint,
);

// ─────────────────────────────────────────────────────────────────────────────
// Master Registry
// ─────────────────────────────────────────────────────────────────────────────

export const CITY_COLLIDERS: Collider[] = [
  ...buildingRects,
  ...colosseumPiers,
  fountainCircle,
  ...colosseumWallSegments,
  ...yardWallSegments,
  ...streetWallRects,
  ...streetWallSegments,
  ...fortressWallRects,
  ...mottePerimeterSegments,
];
