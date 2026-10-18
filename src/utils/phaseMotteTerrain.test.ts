/**
 * Phase Motte-Terrain Alignment 1 — Northern motte visible-slope / gameplay
 * terrain-height alignment regression tests.
 *
 * Run with: bun test src/utils/phaseMotteTerrain.test.ts
 *
 * Background
 * ----------
 * A read-only audit measured gameplay terrain up to 1.252 world units ABOVE
 * the rendered mound surface (worst case at X=0, Z=-52.0), because
 * getTerrainY() interpolated the mound slope out to the COLLISION perimeter
 * (22.0) instead of to the visible slope foot.
 *
 * Sampling the shipping asset (public/_workspace_motte_normals.glb, world
 * transform position [0,0,-71.5], scale 0.3145, no extra rotation) shows the
 * rendered grass surface is a family of scaled superellipses (exponent 6):
 *
 *   level s   world radius (cardinal)   visible Y
 *   1.000     12.580                    4.7175   (summit edge)
 *   1.275     16.040                    2.3588
 *   1.550     19.499                    0.0000   (visible slope foot)
 *
 * and the height falls linearly in the level from SUMMIT_Y at s = 1 to 0 at
 * s = 1.55.  The reference samples below are the measured mesh heights along
 * the south approach (X = 0), used as the ground truth for this suite.
 *
 * The collision perimeter (MOTTE_PERIMETER_RADIUS = 22.0) is deliberately
 * unchanged: it is collision geometry, not the visible slope foot.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import {
  PLAYER_RADIUS,
  CITY_COLLIDERS,
  collidesWith,
} from './collisionShapes';
import {
  BOUNDARY_X,
  BOUNDARY_Z_MIN,
  BOUNDARY_Z_MAX,
  FAST_TRAVEL_ARRIVALS,
} from './cityCollisions';
import {
  getTerrainY,
  summitLevel,
  isOnBridge,
  SUMMIT_Y,
  SUMMIT_CARDINAL_RADIUS,
  SUMMIT_DIAGONAL_RADIUS,
  SUMMIT_SLOPE_FOOT_SCALE,
  SUMMIT_SLOPE_FOOT_RADIUS,
  MOTTE_CENTER_X,
  MOTTE_CENTER_Z,
  MOTTE_PERIMETER_RADIUS,
  BRIDGE_Z_OUTER,
  BRIDGE_Z_INNER,
  BRIDGE_HALF_WIDTH,
} from './terrainHeight';

// ── Tolerances ──────────────────────────────────────────────────────────────
const EPS = 1e-6;
const MESH_TOL = 0.01; // sampling/rounding tolerance against the GLB profile

// ── Measured visible grass surface along the south approach (X = 0) ─────────
// From a downward raycast onto the shipping Motte_Grass mesh.  Phases C-8.37
// and C-8.38 each moved the mesh 5.0 north with the northern group, so every
// world Z below is the raycast sample − 10.0; the heights are the mesh's own
// and unchanged, which is why they still match `getTerrainY` exactly.
const MESH_SOUTH_PROFILE: Array<[number, number]> = [
  [-69, 4.7175],
  [-68, 4.0902],
  [-67, 3.4080],
  [-66, 2.7266],
  [-65, 2.0450],
  [-64, 1.3630],
  [-63, 0.6811],
];

// ── Fortress constants (must match collisionShapes.ts) ─────────────────────
// Phase C-8.37: both follow the motte centre rather than a restated world Z.
const FORTRESS_SOUTH_Z = MOTTE_CENTER_Z + 10.5; // -66.0
const FORTRESS_CENTER_Z = MOTTE_CENTER_Z; // -76.5

// ═══════════════════════════════════════════════════════════════════════════
// 1. Gameplay terrain matches the measured visible mesh profile
// ═══════════════════════════════════════════════════════════════════════════

describe('Gameplay terrain matches the measured visible mesh profile', () => {
  test('south approach matches the sampled mesh within tolerance', () => {
    for (const [z, meshY] of MESH_SOUTH_PROFILE) {
      const y = getTerrainY(0, z);
      expect(Math.abs(y - meshY)).toBeLessThan(MESH_TOL,
        `Z=${z}: terrain Y=${y.toFixed(4)} vs mesh ${meshY.toFixed(4)}`);
    }
  });

  test('summit plateau is flat at SUMMIT_Y out to the cardinal edge', () => {
    for (let r = 0; r <= SUMMIT_CARDINAL_RADIUS; r += 0.5) {
      expect(getTerrainY(0, MOTTE_CENTER_Z + r)).toBeCloseTo(SUMMIT_Y, 6);
    }
  });

  test('summit height is unchanged (SUMMIT_Y = 15 * scale)', () => {
    expect(SUMMIT_Y).toBeCloseTo(4.7175, 6);
    expect(getTerrainY(MOTTE_CENTER_X, MOTTE_CENTER_Z)).toBe(SUMMIT_Y);
  });

  test('visible slope foot radius is the measured 19.499 (1.55 x 40 model units)', () => {
    expect(SUMMIT_SLOPE_FOOT_SCALE).toBe(1.55);
    expect(SUMMIT_SLOPE_FOOT_RADIUS).toBeCloseTo(19.499, 3);
    expect(SUMMIT_SLOPE_FOOT_RADIUS).toBeCloseTo(62 * 0.3145, 4);
  });

  test('foot is a superellipse: 19.50 cardinal, 24.55 diagonal (not a circle)', () => {
    // Cardinal: exactly at the foot radius → Y = 0
    expect(getTerrainY(0, MOTTE_CENTER_Z + SUMMIT_SLOPE_FOOT_RADIUS)).toBeCloseTo(0, 10);
    // Diagonal: the measured foot is ~24.55, i.e. 1.55 x the diagonal summit edge
    const diagonalFoot = SUMMIT_SLOPE_FOOT_SCALE * SUMMIT_DIAGONAL_RADIUS;
    expect(diagonalFoot).toBeCloseTo(24.567, 2);
    const d = diagonalFoot * Math.SQRT1_2;
    expect(getTerrainY(d, MOTTE_CENTER_Z + d)).toBeCloseTo(0, 3);
    // ...and the slope still runs at the collision perimeter on the diagonal,
    // matching the visible mesh there.
    const p = MOTTE_PERIMETER_RADIUS * Math.SQRT1_2;
    const yAtPerimeter = getTerrainY(p, MOTTE_CENTER_Z + p);
    expect(yAtPerimeter).toBeGreaterThan(0);
    expect(yAtPerimeter).toBeLessThan(SUMMIT_Y);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Monotonic descent down the south approach, and flat ground outside
// ═══════════════════════════════════════════════════════════════════════════

describe('Monotonic descent and flat ground', () => {
  test('terrain decreases monotonically walking south from the summit edge', () => {
    let prevY = SUMMIT_Y;
    for (let z = MOTTE_CENTER_Z + SUMMIT_CARDINAL_RADIUS; z <= MOTTE_CENTER_Z + SUMMIT_SLOPE_FOOT_RADIUS; z += 0.25) {
      const y = getTerrainY(0, z);
      expect(y).toBeLessThanOrEqual(prevY + EPS,
        `Z=${z.toFixed(2)}: Y=${y.toFixed(4)} should not exceed previous Y=${prevY.toFixed(4)}`);
      prevY = y;
    }
  });

  test('terrain reaches Y=0 at the visible slope foot', () => {
    const y = getTerrainY(0, MOTTE_CENTER_Z + SUMMIT_SLOPE_FOOT_RADIUS);
    expect(y).toBeLessThan(0.01);
  });

  test('terrain stays at Y=0 outside the slope, out to and beyond the perimeter', () => {
    for (let r = SUMMIT_SLOPE_FOOT_RADIUS; r <= MOTTE_PERIMETER_RADIUS + 10; r += 0.5) {
      expect(getTerrainY(0, MOTTE_CENTER_Z + r)).toBe(0);
    }
  });

  test('the whole flat approach and drawbridge span are at Y=0', () => {
    for (let z = BRIDGE_Z_OUTER; z >= BRIDGE_Z_INNER; z -= 0.25) {
      expect(getTerrainY(0, z)).toBe(0);
      expect(getTerrainY(BRIDGE_HALF_WIDTH, z)).toBe(0);
    }
    // From the bridge's inner end up to the slope foot
    for (let z = BRIDGE_Z_INNER; z <= MOTTE_CENTER_Z + SUMMIT_SLOPE_FOOT_RADIUS; z += 0.25) {
      expect(getTerrainY(0, z)).toBe(0);
    }
  });

  test('isOnBridge still reports the deck, and the deck is flat at Y=0', () => {
    const midZ = (BRIDGE_Z_OUTER + BRIDGE_Z_INNER) / 2;
    expect(isOnBridge(0, midZ)).toBe(true);
    expect(getTerrainY(0, midZ)).toBe(0);
  });

  test('city ground away from the motte is unchanged at Y=0', () => {
    expect(getTerrainY(0, 0)).toBe(0);
    expect(getTerrainY(0, -25)).toBe(0);
    expect(getTerrainY(0, MOTTE_CENTER_Z + MOTTE_PERIMETER_RADIUS + 0.01)).toBe(0);
    expect(getTerrainY(28, MOTTE_CENTER_Z)).toBe(0);
  });

  test('summitLevel is a monotonic measure of distance from the center', () => {
    let prev = summitLevel(0, 0);
    for (let r = 0.5; r <= 30; r += 0.5) {
      const lv = summitLevel(0, r);
      expect(lv).toBeGreaterThanOrEqual(prev - EPS);
      prev = lv;
    }
    expect(summitLevel(0, 0)).toBeCloseTo(0, 10);
    expect(summitLevel(SUMMIT_CARDINAL_RADIUS, 0)).toBeCloseTo(1, 10);
    expect(summitLevel(SUMMIT_SLOPE_FOOT_RADIUS, 0)).toBeCloseTo(SUMMIT_SLOPE_FOOT_SCALE, 10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. The reported defect: false elevated terrain at Z=-52 is removed
// ═══════════════════════════════════════════════════════════════════════════

describe('Reported defect removed (false elevated terrain at Z=-52)', () => {
  test('terrain at X=0, Z=-52 is ground level, not the former ~1.252', () => {
    const y = getTerrainY(0, -52.0);
    expect(y).toBeLessThan(0.02);
    // Explicit: the old radial interpolation returned 1.2520 here.
    expect(Math.abs(y - 1.2520)).toBeGreaterThan(1.0);
  });

  test('terrain never exceeds the mesh by more than tolerance on the south approach', () => {
    // Sweep the whole approach at fine resolution against the measured law.
    for (let z = MOTTE_CENTER_Z + SUMMIT_SLOPE_FOOT_RADIUS; z >= MOTTE_CENTER_Z + SUMMIT_CARDINAL_RADIUS; z -= 0.1) {
      const r = MOTTE_CENTER_Z + SUMMIT_SLOPE_FOOT_RADIUS - z; // distance inward from the foot
      const expected = Math.min(
        SUMMIT_Y,
        SUMMIT_Y * (r / (SUMMIT_SLOPE_FOOT_RADIUS - SUMMIT_CARDINAL_RADIUS)),
      );
      expect(Math.abs(getTerrainY(0, z) - expected)).toBeLessThan(MESH_TOL,
        `Z=${z.toFixed(2)}: Y=${getTerrainY(0, z).toFixed(4)} vs expected ${expected.toFixed(4)}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Collision perimeter and fortress navigation are unchanged
// ═══════════════════════════════════════════════════════════════════════════

describe('Collision perimeter and fortress navigation unchanged', () => {
  test('MOTTE_PERIMETER_RADIUS is still 22.0 (separate from the slope foot)', () => {
    expect(MOTTE_PERIMETER_RADIUS).toBe(22.0);
    expect(SUMMIT_SLOPE_FOOT_RADIUS).toBeLessThan(MOTTE_PERIMETER_RADIUS);
  });

  test('motte perimeter collider count is unchanged (20 segments)', () => {
    const segs = CITY_COLLIDERS.filter((c) => c.id.startsWith('motte-wall'));
    expect(segs.length).toBe(20);
  });

  test('fortress collider count is unchanged (5)', () => {
    const segs = CITY_COLLIDERS.filter((c) => c.id.startsWith('fortress-'));
    expect(segs.length).toBe(5);
  });

  test('no colliders were added or removed by the terrain change', () => {
    expect(CITY_COLLIDERS.filter((c) => /bridge|draw|slope|foot/i.test(c.id)).length).toBe(0);
  });

  test('motte perimeter still blocks off the south opening', () => {
    expect(collidesWith(MOTTE_PERIMETER_RADIUS, MOTTE_CENTER_Z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(true);
    expect(collidesWith(-MOTTE_PERIMETER_RADIUS, MOTTE_CENTER_Z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(true);
    // South opening (through the slope foot) stays walkable
    expect(collidesWith(0, MOTTE_CENTER_Z + MOTTE_PERIMETER_RADIUS, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
  });

  test('fortress fast-travel arrival is still on the flat summit and collision-free', () => {
    const [ax, az] = FAST_TRAVEL_ARRIVALS.northern_fortress;
    expect(getTerrainY(ax, az)).toBeCloseTo(SUMMIT_Y, 2);
    expect(collidesWith(ax, az, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
  });

  test('fortress gate walk-in still descends to the summit from the slope', () => {
    expect(getTerrainY(0, FORTRESS_SOUTH_Z)).toBeCloseTo(SUMMIT_Y, 3);
    expect(getTerrainY(0, FORTRESS_CENTER_Z)).toBeCloseTo(SUMMIT_Y, 3);
  });

  test('world boundary constants keep their derivation (north limit moved)', () => {
    expect(BOUNDARY_X).toBe(35);
    // MOTTE_CENTER_Z - MOTTE_PERIMETER_RADIUS + 2.5 = -101 (C-8.38).
    expect(BOUNDARY_Z_MIN).toBe(-101);
    expect(BOUNDARY_Z_MAX).toBe(35);
  });
});
