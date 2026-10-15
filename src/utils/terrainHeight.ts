/**
 * terrainHeight.ts — Focused terrain-height utility for the Northern Motte.
 *
 * The motte is a raised earth mound at world center [0, 0, -68] with a
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
 *     Model radius 0–50 → world radius 0–15.73, flat at Y=4.72.
 *
 *   Mound slope (between summit edge and moat ring):
 *     Model radius 50–70 → world radius 15.73–22.0, surface descends
 *     from Y≈4.72 to Y≈0.  Approximated as a linear interpolation.
 *
 *   Moat ring (perimeter collision boundary):
 *     World radius ≈22.0 from motte center.  Collision segments with
 *     a south-facing opening for the ramp prevent walking onto the
 *     mound sides.  Outside this radius the ground is flat at Y=0.
 *
 * The player model origin is at the feet (Y=0 = ground level), so the
 * returned Y is applied directly as the player's world Y position.
 */

// ── Motte configuration ─────────────────────────────────────────────────────

export const MOTTE_CENTER_X = 0;
export const MOTTE_CENTER_Z = -68;
export const MOTTE_SCALE = 0.3145;

// Ramp world-space bounds (derived from model Ramp_Dirt mesh)
export const RAMP_HALF_WIDTH = 9 * MOTTE_SCALE;       // 2.8305
export const RAMP_Z_OUTER = 74 * MOTTE_SCALE - 68;    // -44.7273 (south, Y=0)
export const RAMP_Z_INNER = 40 * MOTTE_SCALE - 68;    // -55.42   (north, Y=4.72)
export const RAMP_Z_RANGE = RAMP_Z_OUTER - RAMP_Z_INNER; // 10.6927 (positive)

// Summit
export const SUMMIT_Y = 15 * MOTTE_SCALE;             // 4.7175
export const SUMMIT_RADIUS = 50 * MOTTE_SCALE;        // 15.725 (flat summit edge)

// Mound perimeter (moat ring, used for collision)
export const MOTTE_PERIMETER_RADIUS = 22.0;           // ~69.93 model * scale

// ── Terrain height function ─────────────────────────────────────────────────

/**
 * Returns the world-space Y (feet) height at a given world XZ position.
 *
 * Priority:
 *   1. Ramp — linear interpolation from Y=0 (outer/south) to Y=4.72 (inner/north).
 *   2. Flat summit (radius ≤ SUMMIT_RADIUS) — Y = 4.72.
 *   3. Mound slope (SUMMIT_RADIUS < radius ≤ MOTTE_PERIMETER_RADIUS) — linear
 *      descent from 4.72 to 0.
 *   4. Outside the motte — Y = 0 (city ground).
 *
 * The ramp takes priority over the mound because the ramp mesh sits on top
 * of the mound surface (the ramp surface is above the mound everywhere
 * except at the inner edge where they match at Y=4.72).
 */
export function getTerrainY(x: number, z: number): number {
  // 1. Ramp — check XZ bounds first
  if (Math.abs(x) <= RAMP_HALF_WIDTH && z >= RAMP_Z_INNER && z <= RAMP_Z_OUTER) {
    // t goes 0 at outer (Y=0) → 1 at inner (Y=SUMMIT_Y)
    const t = (RAMP_Z_OUTER - z) / RAMP_Z_RANGE;
    return SUMMIT_Y * t;
  }

  // 2–4. Motte area by radial distance from center
  const dx = x - MOTTE_CENTER_X;
  const dz = z - MOTTE_CENTER_Z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist <= SUMMIT_RADIUS) {
    // Flat summit
    return SUMMIT_Y;
  }

  if (dist <= MOTTE_PERIMETER_RADIUS) {
    // Mound slope — linear approximation from summit to ground
    const t = (dist - SUMMIT_RADIUS) / (MOTTE_PERIMETER_RADIUS - SUMMIT_RADIUS);
    return SUMMIT_Y * (1 - t);
  }

  // Outside the motte — city ground
  return 0;
}
