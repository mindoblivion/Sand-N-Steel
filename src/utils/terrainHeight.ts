/**
 * terrainHeight.ts — Focused terrain-height utility for the Northern Motte.
 *
 * The motte is a raised earth mound at world center [0, 0, -71.5] with a
 * south-facing ramp.  The player must walk naturally from city ground (Y=0)
 * up the ramp, onto the flat summit (Y≈4.72), through the fortress gate,
 * and back down.
 *
 * Geometry (model space → world space after scale 0.3145 + rotation + translation):
 *
 *   Ramp (Ramp_Dirt mesh, 6 verts):
 *     Model: X[-9, 9], Y[-74, -40], Z[0, 15]
 *     World: X[-2.83, 2.83], Z[-55.42, -44.73], Y[0, 4.72]
 *     The ramp slopes UP going NORTH (Z decreases).  Outer edge (south,
 *     toward city) is at Y=0; inner edge (toward motte center) is at Y=4.72.
 *
 *   Summit (Motte_Grass, Z=15 ring):
 *     The summit boundary is a SUPERELLIPSE in model space, NOT a circle.
 *     Measured cardinal radius: 40 model units (world: 12.58).
 *     Measured diagonal radius: ~50.4 model units (world: ~15.87).
 *     Superellipse exponent n = 6 (derived from cardinal/diagonal ratio).
 *     In world space (after uniform scale 0.3145, the shape is preserved):
 *       (|dx| / SUMMIT_CARDINAL_RADIUS)^6 + (|dz| / SUMMIT_CARDINAL_RADIUS)^6 ≤ 1
 *     where dx = world_x - MOTTE_CENTER_X, dz = world_z - MOTTE_CENTER_Z.
 *     The coordinate transform maps model X → world X, model Y → world -Z
 *     (after Z-up→Y-up node rotation), so the superellipse axes align with
 *     world X and Z.
 *     Inside this boundary: flat at Y = SUMMIT_Y (4.7175).
 *
 *   Mound slope (between summit edge and slope foot) — Phase Motte-Terrain
 *   Alignment 1:
 *     The rendered grass surface is a FAMILY OF SCALED SUPERELLIPSES of
 *     exponent 6.  Every ring of the mesh is the summit superellipse
 *     (cardinal radius 40 model units) multiplied by a constant level
 *     factor s.  Sampling the shipping asset
 *     (public/_workspace_motte_normals.glb, world transform position
 *     [0, 0, -71.5], scale 0.3145, no extra rotation) gives:
 *
 *       level s   model radius   world radius (cardinal)   Y
 *       1.000     40.0           12.580                     4.7175  (summit edge)
 *       ~1.11     ~44.5          14.000                     3.7490
 *       1.275     51.0           16.040                     2.3588
 *       1.425     57.0           17.927                     1.1794
 *       1.550     62.0           19.499                     0.0000  (slope foot)
 *
 *     The height descends LINEARLY in the level s, from SUMMIT_Y at the
 *     summit edge (s = 1) to 0 at the visible slope foot (s = 1.55).
 *     That reproduces the sampled mesh profile to within 0.001 world
 *     units along the south approach (radius 14 → 3.749/3.749,
 *     16 → 2.386/2.386, 19 → 0.340/0.340).
 *
 *     Because the foot is a superellipse (not a circle), the visible foot
 *     radius is angle-dependent: 19.50 cardinal, 24.55 diagonal.  It is
 *     therefore deliberately DISTINCT from the collision perimeter below.
 *
 *   Moat ring (perimeter collision boundary):
 *     World radius ≈22.0 from motte center.  Collision segments with
 *     a south-facing opening for the ramp prevent walking onto the
 *     mound sides.  This radius is collision geometry only — it is NOT
 *     the visible slope foot and is no longer used by getTerrainY.
 *     Beyond the visible slope foot the ground is flat at Y=0.
 *
 * The player model origin is at the feet (Y=0 = ground level), so the
 * returned Y is applied directly as the player's world Y position.
 */

// ── Motte configuration ─────────────────────────────────────────────────────

export const MOTTE_CENTER_X = 0;
export const MOTTE_CENTER_Z = -71.5;
export const MOTTE_SCALE = 0.3145;

// ── Drawbridge (Phase 35E) ───────────────────────────────────────────────────
//
// The old dirt ramp (Ramp_Dirt mesh) is hidden and replaced by a wooden
// drawbridge that spans the moat at the south opening.  The bridge deck
// sits at Y=0 (ground level); the mound slope (perimeter → summit edge)
// provides the upward path that the ramp formerly did.
//
// Bridge placement (world space, centered at X=0):
//   Outer (south, city side): Z = -40.5  (at moat outer edge -40.5)
//   Inner (north, motte side): Z = -46.0  (0.3 beyond moat inner edge -45.7)
//   Half-width: 2.0  (4-unit deck, fits inside moat gap linear width ≈9.24)
//   Deck Y: 0.1  (above moat water at 0.06, avoids z-fighting with ground)

export const BRIDGE_HALF_WIDTH = 2.0;
export const BRIDGE_Z_OUTER = -40.5;
export const BRIDGE_Z_INNER = -46.0;
export const BRIDGE_LENGTH = BRIDGE_Z_OUTER - BRIDGE_Z_INNER; // 5.5 (negative)

/**
 * Returns true when the world-space point (x, z) is on the bridge deck.
 */
export function isOnBridge(x: number, z: number): boolean {
  return Math.abs(x) <= BRIDGE_HALF_WIDTH && z >= BRIDGE_Z_INNER && z <= BRIDGE_Z_OUTER;
}

// Legacy ramp bounds (kept for reference and test migration; the Ramp_Dirt
// mesh is hidden and the ramp interpolation is no longer used in getTerrainY).
export const RAMP_HALF_WIDTH = 9 * MOTTE_SCALE;       // 2.8305
export const RAMP_Z_OUTER = 74 * MOTTE_SCALE + MOTTE_CENTER_Z;  // -48.23 (south, Y=0)
export const RAMP_Z_INNER = 40 * MOTTE_SCALE + MOTTE_CENTER_Z;  // -58.92 (north, Y=4.72)
export const RAMP_Z_RANGE = RAMP_Z_OUTER - RAMP_Z_INNER; // 10.6927 (positive)

// Summit — superellipse (NOT a circle)
export const SUMMIT_Y = 15 * MOTTE_SCALE;             // 4.7175
export const SUMMIT_CARDINAL_RADIUS = 40 * MOTTE_SCALE;        // 12.58
export const SUMMIT_DIAGONAL_RADIUS = 50.4 * MOTTE_SCALE;     // ~15.87
export const SUMMIT_SUPERELLIPSE_N = 6;  // derived from cardinal/diagonal ratio

// Mound perimeter (moat ring, used for COLLISION only — unchanged by the
// terrain alignment).  This is not the visible slope foot; see
// SUMMIT_SLOPE_FOOT_SCALE below.
export const MOTTE_PERIMETER_RADIUS = 22.0;           // ~69.93 model * scale

// ── Visible mound slope (Phase Motte-Terrain Alignment 1) ───────────────────
//
// Measured from the shipping GLB: the outermost grass ring that still reaches
// the city ground plane is the summit superellipse scaled by 1.55 (model
// radius 62 of 40), i.e. world radius 19.499 cardinal / 24.554 diagonal.
// The mound surface is interpolated linearly in this level factor between the
// summit edge (s = 1, Y = SUMMIT_Y) and the foot (s = 1.55, Y = 0).
export const SUMMIT_SLOPE_FOOT_SCALE = 1.55;          // model radius 62 / 40
export const SUMMIT_SLOPE_FOOT_RADIUS =
  SUMMIT_CARDINAL_RADIUS * SUMMIT_SLOPE_FOOT_SCALE;   // 19.499 (cardinal)

// ── Summit boundary helpers ─────────────────────────────────────────────────

/**
 * Returns true when the world-space point (dx, dz) relative to the motte
 * center is inside the flat summit superellipse.
 *
 * The superellipse (|dx|/a)^n + (|dz|/a)^n ≤ 1 with a = SUMMIT_CARDINAL_RADIUS
 * and n = SUMMIT_SUPERELLIPSE_N matches the measured summit geometry:
 *   - Cardinal (dx=12.58, dz=0): 1 + 0 = 1 → on boundary ✓
 *   - Diagonal (dx=dz): (d/√2/a)^n * 2 = 1 → d = a * 2^(1/2 - 1/n) ≈ 15.87 ✓
 */
export function isInsideSummit(dx: number, dz: number): boolean {
  const ax = Math.abs(dx) / SUMMIT_CARDINAL_RADIUS;
  const az = Math.abs(dz) / SUMMIT_CARDINAL_RADIUS;
  return Math.pow(ax, SUMMIT_SUPERELLIPSE_N) + Math.pow(az, SUMMIT_SUPERELLIPSE_N) <= 1;
}

/**
 * Returns the radial distance from the motte center to the summit boundary
 * at a given angle θ (measured from south, i.e., atan2(dz, dx)).
 *
 * For a superellipse (x/a)^n + (z/a)^n = 1, the boundary at angle θ is:
 *   r = a / (|cos θ|^n + |sin θ|^n)^(1/n)
 *
 * At cardinal: r = a (12.58)
 * At diagonal: r = a * 2^(1/2 - 1/n) ≈ 15.87
 */
export function summitEdgeRadius(theta: number): number {
  const c = Math.pow(Math.abs(Math.cos(theta)), SUMMIT_SUPERELLIPSE_N);
  const s = Math.pow(Math.abs(Math.sin(theta)), SUMMIT_SUPERELLIPSE_N);
  return SUMMIT_CARDINAL_RADIUS / Math.pow(c + s, 1 / SUMMIT_SUPERELLIPSE_N);
}

/**
 * Returns the superellipse LEVEL of a point relative to the motte center.
 *
 * The mound surface is a family of scaled copies of the summit superellipse,
 * so this single number locates a point within that family:
 *   level < 1        → inside the flat summit
 *   level = 1        → on the summit edge
 *   1 < level < 1.55 → on the mound slope
 *   level ≥ 1.55     → outside the visible slope (city ground, Y = 0)
 *
 * For the superellipse (|dx|/a)^n + (|dz|/a)^n = s^n, the level of a point is
 * s = ((|dx|/a)^n + (|dz|/a)^n)^(1/n).  This replaces the former radial
 * interpolation, which assumed an angle-dependent edge interpolated to the
 * collision perimeter and overstated the terrain by up to 1.252 world units
 * on the south approach (e.g. 1.252 at X=0, Z=-52 vs 0.0 measured).
 */
export function summitLevel(dx: number, dz: number): number {
  const ax = Math.abs(dx) / SUMMIT_CARDINAL_RADIUS;
  const az = Math.abs(dz) / SUMMIT_CARDINAL_RADIUS;
  return Math.pow(
    Math.pow(ax, SUMMIT_SUPERELLIPSE_N) + Math.pow(az, SUMMIT_SUPERELLIPSE_N),
    1 / SUMMIT_SUPERELLIPSE_N,
  );
}

// ── Terrain height function ─────────────────────────────────────────────────

/**
 * Returns the world-space Y (feet) height at a given world XZ position.
 *
 * Priority:
 *   1. Bridge — flat at Y=0 across the drawbridge span.
 *   2. Flat summit (level < 1) — Y = 4.7175.
 *   3. Mound slope (1 ≤ level < 1.55) — linear descent in the superellipse
 *      level from the summit edge down to Y=0 at the visible slope foot.
 *   4. Outside the visible slope (level ≥ 1.55, or any point off the motte)
 *      — Y = 0 (city ground).
 *
 * The old dirt ramp was removed (Phase 35E).  The mound slope now provides
 * the continuous upward path from the slope foot (Y=0) to the summit edge
 * (Y=4.72) at the south opening, replacing the former ramp interpolation.
 * The wooden drawbridge spans the moat at ground level (Y=0).
 *
 * Implementation note: the previous version interpolated over the radial
 * distance to the COLLISION perimeter (22.0), which does not match the
 * rendered mound — the visible slope reaches Y=0 at the foot (19.499
 * cardinal), well inside the perimeter.  Interpolating in the superellipse
 * level matches the asset at every sampled point.
 */
export function getTerrainY(x: number, z: number): number {
  // 1. Bridge — flat at Y=0 across the drawbridge deck
  if (isOnBridge(x, z)) {
    return 0;
  }

  // 2–4. Motte area, located by its superellipse level
  const dx = x - MOTTE_CENTER_X;
  const dz = z - MOTTE_CENTER_Z;
  const level = summitLevel(dx, dz);

  if (level <= 1) {
    // 2. Flat summit — superellipse test (NOT circular)
    return SUMMIT_Y;
  }

  if (level >= SUMMIT_SLOPE_FOOT_SCALE) {
    // 4. Beyond the visible slope foot — city ground
    return 0;
  }

  // 3. Mound slope — linear descent from the summit edge to the slope foot
  const t = (level - 1) / (SUMMIT_SLOPE_FOOT_SCALE - 1);
  return SUMMIT_Y * (1 - t);
}
