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

import { MOTTE_CENTER_Z } from './terrainHeight';

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

  // SmithingForge — Phase C-8.19 root [18, 0, 2.6], foundation [9.5, 7.5],
  // proj 0.25 → 10.0 × 8.0, centred at Z = 2.6.
  // Phase C-8.10: width narrowed 10.0 → 9.5 to align east edge with wall face
  // at X≈22.75, opening the intended passage to the ArmorLeatherWorkshop.
  // Phase C-8.43: this 9.5 width is deliberately NOT the rendered lower-step
  // footprint here — it stays below the 10.0 the C-8.19 dimensions derive, by the
  // C-8.10 passage-clearance decision above.  Only city-tavern and caravanserai
  // were reconciled in this phase.
  // Phase C-8.19: Z centre 2 → 2.6 (same dimensions).  The south edge follows
  // the rendered footprint to Z = 2.6 - 4.0 = -1.4, which turns the former
  // 0.15-unit overlap with the GeneralStore (north edge Z = -1.85) into a
  // 0.45-unit gap.  X is unchanged, so the C-8.10 passage is preserved.
  RECT('smithing-forge', 18, 2.6, 9.5, 8.0),

  // CityTavern — root [-16, 0, 14], foundation [8.4, 7.2], proj 0.25 → 8.9 × 7.7
  // Phase C-8.43: width corrected 9.4 → 8.9 so the collider matches the rendered
  // ground-level lower-step footprint (BuildingFoundation lowerWidth = 8.4 + 2 × 0.25
  // = 8.9).  Depth 7.7 and centre (-16, 14) are unchanged; no mesh or building
  // position moved.
  RECT('city-tavern', -16, 14, 8.9, 7.7),

  // GeneralStore — root [22, 0, -5], foundation [7.2, 5.8], proj 0.25 → 7.7 × 6.3
  RECT('general-store', 22, -5, 7.7, 6.3),

  // CaravanseraiInn — root [16, 0, 14], foundation [8.6, 7.6], proj 0.25 → 9.1 × 8.1
  // Phase C-8.43: width corrected 9.6 → 9.1 so the collider matches the rendered
  // ground-level lower-step footprint (BuildingFoundation lowerWidth = 8.6 + 2 × 0.25
  // = 9.1).  Depth 8.1 and centre (16, 14) are unchanged; no mesh or building
  // position moved.
  RECT('caravanserai', 16, 14, 9.1, 8.1),

  // MerchantHouse — root [26, 0, -13], foundation [7.2, 6.5], proj 0.25 → 7.7 × 7.0
  // Phase C-8.12: shifted south 1.0 (Z: -12 → -13) to open the Via Mercatoria
  // route between the GeneralStore (south edge Z=-8.15) and the MerchantHouse
  // north edge (Z=-9.5) — a 1.35 unit gap / 0.55 unit player-center corridor.
  RECT('merchant-house', 26, -13, 7.7, 7.0),

  // ArmorLeatherWorkshop — root [28.2, 0, 1], foundation [8.4, 5.2] proj 0.25
  // offset [0, 0, 0.15] → center [28.2, 1.15], footprint 8.9 × 5.7
  RECT('armor-workshop', 28.2, 1.15, 8.9, 5.7),

  // Stable — root [26, 0, 15], foundation [7.0, 7.2], proj 0.25 → 7.5 × 7.7
  RECT('stable', 26, 15, 7.5, 7.7),

  // GladiatorAcademy — root [30.5, 0, -27], foundation [7.2, 6.8], proj 0.25 → 7.7 × 7.3
  RECT('gladiator-academy', 30.5, -27, 7.7, 7.3),

  // DoctoreHouse — root [28, 0, -18.875], foundation [5.5, 3.25], proj 0.25 → 6.0 × 3.75
  // Phase C-8.19: depth cut 5.0 → 3.25 (plinth 5.5 → 3.75) with the north
  // foundation face pinned at Z = -20.75, which removes the 1.25-unit Z
  // interpenetration with the MerchantHouse (south face Z = -16.5) and leaves a
  // 0.50-unit plinth gap — narrower than the 0.80 player diameter, so no
  // walkable passage opens between the two buildings. Width 6.0 (X[25, 31]) is
  // unchanged.
  RECT('doctore-house', 28, -18.875, 6.0, 3.75),

  // RecordsLibrary — root [23.10, 0, -30], foundation [6.0, 5.2], proj 0.25 → 6.5 × 5.7
  // Phase C-8.18: root shifted 0.90 west (X 24 → 23.10).  The plinth's east
  // face moves from X = 27.25 to X = 26.35, which clears the Gladiator Academy
  // footprint (west face X = 26.65) by 0.30 and removes the plinth/marble
  // platform interpenetration with the academy's west doorway and column bases.
  RECT('records-library', 23.10, -30, 6.5, 5.7),

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

  // TrainingHall — TrainingYard.tsx mounts it at yard-local [-12.35, 0, 3.00]
  // inside that file's root group [-18, 0, 0] with yaw +π/2, so its world root
  // is [-30.35, 0, 3.00].  Its BuildingFoundation lower step is
  // (HALL_W + 2 × projection) × (HALL_D + 2 × projection) = (7 + 0.5) × (2.2 + 0.5)
  // = 7.5 (component-local X) × 2.7 (component-local Z); the π/2 yaw puts the
  // 2.7 on world X and the 7.5 on world Z, i.e. X [-31.70, -29.00], Z [-0.75, 6.75].
  // Phase C-8.45: the rendered building had no collider at all (C-8.44's only
  // unregistered rendered building), so the player could walk straight through
  // it.  This rectangle matches that rendered lower-step footprint only — the
  // veranda/posts, like every other building's props, are not collidable.  No
  // geometry, transform, neighbour or other collider moved.
  RECT('training-hall', -30.35, 3.00, 2.7, 7.5),
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
//
// Phase C-8.31 — the drum is complete.  It ran over a 306° arc
// (θ ∈ [-0.85π, 0.85π]) and was cut at exactly two places: the monumental
// entrance, θ ∈ [-0.43, 0.43], and the rear axial gate, θ = π ± GATE_HALF —
// the Northern Motte bridge axis, which until this phase had no stone in it at
// all and let the player walk in and out of the arena around the building.
// The registry is built exactly like the render: the two original 8-segment
// arcs are UNCHANGED (same endpoints, same subdivision, so every measured
// clearance in the other suites still holds), and the 0.331-radian rear flanks
// are appended as two short polylines on the same radius.  The gate is left
// clear between them.
//
// Sagitta per segment: 0.19 (front arcs, 8 segs each) and 0.07 (rear flanks,
// 2 segs each) — both < player radius 0.4 → no squeeze-through.
// ─────────────────────────────────────────────────────────────────────────────

const COLOSSEUM_R = 19.3;
const COLOSSEUM_ROOT_Z = -25;
const COLO_THETA_START = -Math.PI * 0.85;
const COLO_THETA_END = Math.PI * 0.85; // -0.85π + 1.7π — the drum's rear seam
const COLO_ENTRANCE_MIN = -0.43;
const COLO_ENTRANCE_MAX = 0.43;

/** Rear axial gate half-width at R_FACADE — GrandColosseum.tsx GATE_HALF_W. */
const COLO_GATE_HALF_W = 2.7;
const COLO_GATE_HALF = Math.asin(COLO_GATE_HALF_W / COLOSSEUM_R); // ≈ 0.1402 rad (8.03°)

function coloPoint(theta: number): [number, number] {
  return [
    COLOSSEUM_R * Math.sin(theta),
    COLOSSEUM_R * Math.cos(theta) + COLOSSEUM_ROOT_Z,
  ];
}

const colosseumWallSegments: SegmentCollider[] = [
  // The original 306° drum (C-8.27), split at the monumental entrance.
  ...arcSegments(COLO_THETA_START, COLO_ENTRANCE_MIN, 8, 'colo-wall-l', coloPoint),
  ...arcSegments(COLO_ENTRANCE_MAX, COLO_THETA_END, 8, 'colo-wall-r', coloPoint),
  // Phase C-8.31: the rear drum, east then west of the gate.
  ...arcSegments(COLO_THETA_END, Math.PI - COLO_GATE_HALF, 2, 'colo-rearwall-r', coloPoint),
  ...arcSegments(Math.PI + COLO_GATE_HALF, Math.PI * 1.15, 2, 'colo-rearwall-l', coloPoint),
  // …and the gate's own jambs are the flanking bays' end piers, which the
  // rendered arcade places flush with the opening (GrandColosseum.tsx
  // DRUM_E_END / DRUM_W_START), so nothing further is needed at the mouth.
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
// Phase C-8.27 — Portal flank closures
//
// The facade-wall arc stops at the entrance-gap edge θ = COLO_ENTRANCE_MAX,
// i.e. at (±8.0456, -7.4570) (radius 19.3 about the root [0, -25]); the portal
// piers stop at their outer faces, X = ±5.25, and front (south, +Z) plane
// Z = -8.1.  Nothing collidable bridged that 2.796-unit strip, so the player
// could walk north from Z ≈ -7 to Z ≈ -16 at X ≈ 5.65 … 7.60 (and the mirror
// on the west) and stand inside the arena without ever passing through the
// portal doorway — the C-8.27 reproduction (see src/utils/phaseC8_27.test.ts).
//
// These two rects close exactly that strip, spanning the portal's own front
// plane (Z = -8.1) through to the facade opening's edge line (Z = -7.457).
// They are the ground-level continuation of the facade wall across the
// entrance flanks: the strip they cover is the facade wall's own radial band
// (radius 17.70 … 19.30) and is already occupied on the ground by the
// ceremonial steps (steps 2 and 1, X ±6 / ±7) and the flanking spectator
// bench (X 5.8 … 7.8, Z -7.925 … -7.275).  Neither rect reaches the doorway
// corridor (player centres |X| ≤ 2.2), the pier approach or any other path.
const COLO_GAP_EDGE = coloPoint(COLO_ENTRANCE_MAX);   // [8.0456, -7.4570]
const COLO_PIER_FRONT_Z = -9.8 + 3.4 / 2;             // -8.10 — pier outer (+Z) face
const COLO_FLANK_INNER_X = 3.925 + 2.65 / 2;          // 5.25 — pier outer face
const COLO_FLANK_W = COLO_GAP_EDGE[0] - COLO_FLANK_INNER_X;        // 2.7956
const COLO_FLANK_D = COLO_GAP_EDGE[1] - COLO_PIER_FRONT_Z;         // 0.6430
const COLO_FLANK_CX = (COLO_FLANK_INNER_X + COLO_GAP_EDGE[0]) / 2; // 6.6478
const COLO_FLANK_CZ = (COLO_PIER_FRONT_Z + COLO_GAP_EDGE[1]) / 2;  // -7.7785

const colosseumFlanks: RectCollider[] = [
  RECT('colo-flank-l', -COLO_FLANK_CX, COLO_FLANK_CZ, COLO_FLANK_W, COLO_FLANK_D),
  RECT('colo-flank-r', COLO_FLANK_CX, COLO_FLANK_CZ, COLO_FLANK_W, COLO_FLANK_D),
];

// ─────────────────────────────────────────────────────────────────────────────
// Phase C-8.28 — Arena podium (the boundary wall between sand and seating)
//
// GrandColosseum.tsx section 4a renders the podium as a 1.2-unit-high
// cylinder at R_ARENA_WALL = 15.3 about the root [0, −25] (world Y 0.05 …
// 1.25), spanning the same 306° arc as the facade.  Nothing collided with it.
// With the real resolver (C-8.28 audit, before this fix) a radial push from
// the arena centre walked straight through the podium, through the rendered
// cavea (seating radius 15.3 … 17.8) and came to rest inside the facade wall
// band (radius 18.0 … 19.3): east/west ended at r = 18.62, the diagonals at
// 18.81 — i.e. the player stood inside the rendered stone, having crossed two
// rendered surfaces on the way.
//
// This polyline puts the podium on its rendered radius.  It stops at the
// monumental entrance passage, exactly where the render now stops: the bowl
// is cut over the portal's own 5.2-unit opening, |X| ≤ 2.6 at the podium
// (GRANDCOLOSSEUM's PORTAL_PASSAGE_HALF_W — the lintel half-width and the
// piers' inner faces).  The cut end (2.6, −9.925) therefore sits ON the
// pier's inner-face line, so the passage has no corner to snag on.
//
// Sagitta per segment (8 per side, as on the facade) ≈ 0.186 < player radius
// 0.4 → no squeeze-through; the entrance gap and the rear arc ends mirror the
// rendered bowl, so the collider and the visible stone agree everywhere.
//
// Phase C-8.31: the drum is now complete, so the podium ring is too, and it is
// cut at BOTH axial openings — each on that same 5.2-unit passage line (the
// rear gate's cut is congruent with the doorway's, on its own π ± GAP seam).
// The gate's clear width (COLO_GATE_HALF, 8.03°) is narrower than its own
// passage, exactly as the monumental doorway is far wider than its own: the
// passage is set by the structure the player walks through, not by the outer
// opening.  The two original 8-segment front arcs are untouched; the rear
// quadrants are appended as short polylines on the same radius.
const COLO_PODIUM_R = 15.3;                     // R_ARENA_WALL — rendered podium radius
const COLO_PODIUM_PASSAGE_HALF_W = 2.6;         // portal lintel half-width = pier inner face |X|
const COLO_PODIUM_GAP = Math.asin(COLO_PODIUM_PASSAGE_HALF_W / COLO_PODIUM_R); // ≈ 0.1716 rad

function podiumPoint(theta: number): [number, number] {
  return [
    COLO_PODIUM_R * Math.sin(theta),
    COLO_PODIUM_R * Math.cos(theta) + COLOSSEUM_ROOT_Z,
  ];
}

const colosseumPodium: SegmentCollider[] = [
  ...arcSegments(COLO_THETA_START, -COLO_PODIUM_GAP, 8, 'colo-podium-l', podiumPoint),
  ...arcSegments(COLO_PODIUM_GAP, COLO_THETA_END, 8, 'colo-podium-r', podiumPoint),
  // Phase C-8.31: the two rear quadrants, east then west of the gate passage.
  ...arcSegments(COLO_THETA_END, Math.PI - COLO_PODIUM_GAP, 2, 'colo-rearpodium-r', podiumPoint),
  ...arcSegments(Math.PI + COLO_PODIUM_GAP, Math.PI * 1.15, 2, 'colo-rearpodium-l', podiumPoint),
];

// ─────────────────────────────────────────────────────────────────────────────
// Phase C-8.33 — Rear gate lateral seals
//
// C-8.31 gave the drum its rear axial gate (θ = π ± GATE_HALF on the facade,
// the podium ring cut on the doorway's own 5.2-unit passage line), and the two
// openings became the arena's only ways through the stone ring.  The gate's
// *sides*, however, were never collidable.
//
// Walked with the real resolver (throwaway harness, `resolveCityMovement`,
// 11 steps north from (0, −38) → (0, −42.18), r = 17.18, inside the passage)
// a sideways push leaves the passage almost at once: +X for 8 steps reaches
// (3.04, −42.18) — past the 9.784° bowl cut, |X| > 2.6 — and the same push
// carries on to (7.60, −42.18), r = 18.79, where the player is standing inside
// the rendered arcade pier.  A −12 … +12 X sweep at z = −40.5 is entirely
// free, i.e. the whole rear band between the podium ring and the facade is
// open ground to the resolver once the player is past the podium's cut edge.
// It is a movement-boundary gap, not a mesh defect: the rendered gate is
// exactly what C-8.31 built, and the registry simply models the facade
// (r 19.3) and the podium (r 15.3) as thin polylines with nothing between.
//
// The C-8.27 remedy for the doorway's flank strip applies unchanged — bridge
// the strip between the two structures that already end there.  Both endpoints
// below ARE existing collider endpoints: the podium ring stops at
// `podiumPoint(π ∓ COLO_PODIUM_GAP)` (2.610, −40.076) and the rear facade drum
// at `coloPoint(π ∓ COLO_GATE_HALF)` (2.700, −44.110).  The seal therefore adds
// no new corner and leaves no slit — it is the passage's own side wall, drawn
// between the two cut faces the render already uses.
//
// The passage's clear width is 5.2 (|X| ≤ 2.6 at the podium; 5.40 at the
// facade).  The player is a 0.4-radius circle, so a wall on that face leaves
// |X| ≈ 2.2 of usable corridor — wider than the drawbridge deck and its side
// beams together (±2.11, so the whole deck stays walkable) and as wide as the
// corridor C-8.27 pins at the doorway.  No rendered geometry moves.
const COLO_GATE_SEAL = {
  /** Facade jamb — the point `colo-rearwall-*` ends on (r = R_FACADE). */
  facade: coloPoint(Math.PI - COLO_GATE_HALF),
  /** Bowl cut edge — the point `colo-rearpodium-*` ends on (r = R_ARENA_WALL). */
  bowl: podiumPoint(Math.PI - COLO_PODIUM_GAP),
};

const colosseumGateSeals: SegmentCollider[] = [
  {
    type: 'segment',
    id: 'colo-gateseal-l',
    x1: -COLO_GATE_SEAL.facade[0], z1: COLO_GATE_SEAL.facade[1],
    x2: -COLO_GATE_SEAL.bowl[0], z2: COLO_GATE_SEAL.bowl[1],
  },
  {
    type: 'segment',
    id: 'colo-gateseal-r',
    x1: COLO_GATE_SEAL.facade[0], z1: COLO_GATE_SEAL.facade[1],
    x2: COLO_GATE_SEAL.bowl[0], z2: COLO_GATE_SEAL.bowl[1],
  },
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
// Northern Fortress Walls — NorthernFortress.tsx, root [0, 4.72, -81.5]
//
// The fortress model (Z-up, 70×70 ground footprint) is rotated [-π/2, 0, 0]
// (Z-up → Y-up) and scaled 0.30, giving a 21×21 world footprint centered
// at [0, MOTTE_CENTER_Z] on the motte summit (Y=4.72).  After rotation, the
// model's Y axis maps to world -Z, so:
//   South face (model Y = -35) → world Z = MOTTE_CENTER_Z + 10.5 = -71.0 (city side)
//   North face (model Y = +35) → world Z = MOTTE_CENTER_Z - 10.5 = -92.0
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
// Phases C-8.37 / C-8.38: the fortress moved with its motte (Z: -71.5 → -76.5
// → -81.5).  Every rect is now stated relative to terrainHeight's
// MOTTE_CENTER_Z — the fortress
// stands on the summit centre, at the group transform NorthernFortress.tsx
// itself declares — so the walls follow the mound automatically.
// ─────────────────────────────────────────────────────────────────────────────

/** Model half-footprint 35 × 0.30 — the fortress's 21×21 world footprint. */
const FORTRESS_HALF_DEPTH = 10.5;

const fortressWallRects: RectCollider[] = [
  // South wall — split at gate gap X ∈ [-1.0, 1.0]
  RECT('fortress-south-l', -5.75, MOTTE_CENTER_Z + FORTRESS_HALF_DEPTH, 9.5, 1.2),
  RECT('fortress-south-r', 5.75, MOTTE_CENTER_Z + FORTRESS_HALF_DEPTH, 9.5, 1.2),
  // North wall — full width
  RECT('fortress-north', 0, MOTTE_CENTER_Z - FORTRESS_HALF_DEPTH, 21.0, 1.2),
  // East / West walls — full depth
  RECT('fortress-east', 10.5, MOTTE_CENTER_Z, 1.2, 21.0),
  RECT('fortress-west', -10.5, MOTTE_CENTER_Z, 1.2, 21.0),
];

// ─────────────────────────────────────────────────────────────────────────────
// Northern Motte Perimeter — NorthernMotte.tsx, center [0, 0, -81.5] (C-8.38)
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
// MOTTE_CENTER_Z comes from terrainHeight (Phases C-8.37 / C-8.38) — the same constant
// the mound, the moat ring, the drawbridge and the fortress are placed with.
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
  ...colosseumFlanks,
  ...colosseumPodium,
  ...colosseumGateSeals,
  fountainCircle,
  ...colosseumWallSegments,
  ...yardWallSegments,
  ...streetWallRects,
  ...streetWallSegments,
  ...fortressWallRects,
  ...mottePerimeterSegments,
];
