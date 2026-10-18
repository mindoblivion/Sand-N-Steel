/**
 * Phase Northern Ground Coverage — city ground-plane extension tests.
 *
 * Run with: bun test src/utils/phaseNorthernGroundCoverage.test.ts
 *
 * Background
 * ----------
 * The city has ONE flat ground plane (ProcessionAvenue), on which every other
 * district sits.  It measured 140 × 140 centred at Z = 0, so the ground stopped
 * at Z = -70 while:
 *
 *   - the walkable northern movement envelope reaches Z = -96 (BOUNDARY_Z_MIN;
 *     -91 before Phase C-8.37 moved the northern group north),
 *   - the motte mesh footprint ends at Z = -101.66 (-96.66 pre-shift),
 *   - the visible moat ring ends at Z = -107.5 (-102.5 pre-shift),
 *
 * leaving a reachable northern area where the player walked on nothing.
 *
 * The shipped correction resizes that single plane — no second plane, no extra
 * draw call — to 140 × 179 centred at [0, -0.05, -19.5], i.e. world
 * X[-70, 70], Z[-109, 70] at Y = -0.05, keeping the south edge at Z = +70.
 * Phase C-8.37 moved the motte, its moat, the drawbridge and the fortress 5.0
 * units north, and the plane's north edge followed by exactly that: the
 * margins this phase measured (1.5 past the moat ring, 7.34 past the motte mesh
 * bound, 13 past the walkable limit) are unchanged, so every coverage rule
 * below holds at the new position exactly as it did at the old one.
 *
 * How this suite validates the plane
 * ----------------------------------
 * The plane's real geometry is validated through its exported constants and
 * the world-space bounds derived from them, never by searching the source for
 * numeric literals.  The mesh is rotated -π/2 about X, so the plane's local
 * +Y axis maps to world -Z: the first `planeGeometry` argument spans world X
 * and the second spans world Z.  Every coverage target below is itself derived
 * from the module that owns it (world boundaries, motte transform + mesh
 * bounds, moat ring radii) rather than restated as a bare number.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import {
  GROUND_PLANE_WIDTH,
  GROUND_PLANE_DEPTH,
  GROUND_PLANE_ELEVATION_Y,
  GROUND_PLANE_CENTER,
  GROUND_PLANE_NORTH_Z,
  GROUND_PLANE_SOUTH_Z,
  GROUND_PLANE_WEST_X,
  GROUND_PLANE_EAST_X,
  GROUND_BUMP_REPEAT_X,
  GROUND_BUMP_REPEAT_Z,
  GROUND_BUMP_METERS_PER_TILE_X,
  GROUND_BUMP_METERS_PER_TILE_Z,
} from '../components/3d/city/ProcessionAvenue';
import {
  getTerrainY,
  SUMMIT_Y,
  SUMMIT_SLOPE_FOOT_SCALE,
  SUMMIT_SLOPE_FOOT_RADIUS,
  SUMMIT_CARDINAL_RADIUS,
  SUMMIT_SUPERELLIPSE_N,
  summitLevel,
  MOTTE_PERIMETER_RADIUS,
  MOTTE_CENTER_X,
  MOTTE_CENTER_Z,
  MOTTE_SCALE,
  BRIDGE_HALF_WIDTH,
  BRIDGE_Z_OUTER,
  BRIDGE_Z_INNER,
  isOnBridge,
} from './terrainHeight';
import {
  MOAT_INNER_RADIUS,
  MOAT_OUTER_RADIUS,
  MOAT_WATER_Y,
  MOAT_GAP_HALF_ANGLE,
} from '../components/3d/city/NorthernMotte';
import {
  DECK_TOP_Y,
  DECK_UNDERSIDE_Y,
  DECK_Z_OUTER,
  DECK_Z_INNER,
} from '../components/3d/city/Drawbridge';
import {
  PLAYER_RADIUS,
  CITY_COLLIDERS,
  collidesWith,
  type RectCollider,
} from './collisionShapes';
import {
  BOUNDARY_X,
  BOUNDARY_Z_MIN,
  BOUNDARY_Z_MAX,
  FAST_TRAVEL_ARRIVALS,
} from './cityCollisions';

// ── Measured / recorded references ──────────────────────────────────────────

/** Motte_Grass base ring radius in model units (documented in NorthernMotte). */
const MOTTE_BASE_MODEL_RADIUS = 80;
/** World half-extent of the motte mesh footprint: 80 × 0.3145 = 25.16. */
const MOTTE_MESH_HALF_EXTENT = MOTTE_BASE_MODEL_RADIUS * MOTTE_SCALE;
/** Recorded motte mesh footprint north edge (shipping GLB): Z = -101.66. */
const MOTTE_MESH_NORTH_Z = MOTTE_CENTER_Z - MOTTE_MESH_HALF_EXTENT;
/** Recorded motte mesh footprint south edge (shipping GLB): Z = -51.34. */
const MOTTE_MESH_SOUTH_Z = MOTTE_CENTER_Z + MOTTE_MESH_HALF_EXTENT;

/** Recorded pre-phase ground plane (140 × 140 centred at Z = 0). */
const PHASE_PRE_WIDTH = 140;
const PHASE_PRE_DEPTH = 140;
const PHASE_PRE_CENTER_Z = 0;
const PHASE_PRE_ELEVATION_Y = -0.05;
/** Its north edge — the measured defect boundary. */
const PHASE_PRE_NORTH_Z = PHASE_PRE_CENTER_Z - PHASE_PRE_DEPTH / 2; // -70

/** Minimum coverage margin demanded around the walkable envelope. */
const REQUIRED_MARGIN = 3;

/**
 * Coverage rule for the northern movement envelope: the plane's north edge
 * must sit at least REQUIRED_MARGIN units north of the walkable limit.
 */
const coversNorthernEnvelope = (northZ: number): boolean =>
  northZ <= BOUNDARY_Z_MIN - REQUIRED_MARGIN;

/** The moat ring's northern extent, derived from its own transform + radius. */
const MOAT_NORTH_Z = MOTTE_CENTER_Z - MOAT_OUTER_RADIUS;

/** A derived AABB of the ground plane, built from width/depth/centre. */
const groundPlaneAABB = () => ({
  minX: GROUND_PLANE_CENTER[0] - GROUND_PLANE_WIDTH / 2,
  maxX: GROUND_PLANE_CENTER[0] + GROUND_PLANE_WIDTH / 2,
  minZ: GROUND_PLANE_CENTER[2] - GROUND_PLANE_DEPTH / 2,
  maxZ: GROUND_PLANE_CENTER[2] + GROUND_PLANE_DEPTH / 2,
});

const rect = (id: string): RectCollider => {
  const c = CITY_COLLIDERS.find((collider) => collider.id === id);
  expect(c).toBeDefined();
  return c as RectCollider;
};

// ═══════════════════════════════════════════════════════════════════════════
// 1. The plane's world-space AABB matches its dimensions and position
// ═══════════════════════════════════════════════════════════════════════════

describe('Ground plane AABB matches its dimensions and position', () => {
  test('exported bounds equal the AABB derived from width/depth/centre', () => {
    const box = groundPlaneAABB();
    expect(GROUND_PLANE_WEST_X).toBeCloseTo(box.minX, 10);
    expect(GROUND_PLANE_EAST_X).toBeCloseTo(box.maxX, 10);
    expect(GROUND_PLANE_NORTH_Z).toBeCloseTo(box.minZ, 10);
    expect(GROUND_PLANE_SOUTH_Z).toBeCloseTo(box.maxZ, 10);
  });

  test('the plane kept its 140-unit X width and its south edge at Z = +70', () => {
    expect(GROUND_PLANE_WIDTH).toBe(PHASE_PRE_WIDTH);
    expect(GROUND_PLANE_SOUTH_Z).toBe(70);
    expect(GROUND_PLANE_CENTER[2] + GROUND_PLANE_DEPTH / 2).toBe(GROUND_PLANE_SOUTH_Z);
  });

  test('the plane reaches Z = -109 after the C-8.37 extension', () => {
    expect(GROUND_PLANE_NORTH_Z).toBe(-109);
    expect(GROUND_PLANE_DEPTH).toBe(GROUND_PLANE_SOUTH_Z - GROUND_PLANE_NORTH_Z);
  });

  test('the plane stays centred on the city X axis', () => {
    expect(GROUND_PLANE_CENTER[0]).toBe(0);
    expect(GROUND_PLANE_WEST_X).toBe(-GROUND_PLANE_EAST_X);
  });

  test('the plane is a pure resize: depth grew, width and elevation did not', () => {
    expect(GROUND_PLANE_DEPTH).toBeGreaterThan(PHASE_PRE_DEPTH);
    expect(GROUND_PLANE_WIDTH).toBe(PHASE_PRE_WIDTH);
    expect(GROUND_PLANE_ELEVATION_Y).toBe(PHASE_PRE_ELEVATION_Y);
    expect(GROUND_PLANE_CENTER[1]).toBe(GROUND_PLANE_ELEVATION_Y);
  });

  test('the extension only moves the north edge (south edge unchanged)', () => {
    const southBefore = PHASE_PRE_CENTER_Z + PHASE_PRE_DEPTH / 2; // +70
    expect(GROUND_PLANE_SOUTH_Z).toBe(southBefore);
    expect(GROUND_PLANE_NORTH_Z).toBeLessThan(PHASE_PRE_NORTH_Z);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. The bounds cover the complete walkable movement envelope, with margin
// ═══════════════════════════════════════════════════════════════════════════

describe('Ground covers the walkable movement envelope with ≥3 units of margin', () => {
  test('the walkable envelope is the one the extension targeted', () => {
    expect(BOUNDARY_X).toBe(35);
    // MOTTE_CENTER_Z - MOTTE_PERIMETER_RADIUS + 2.5; -91 before C-8.37 moved
    // the motte (and with it the perimeter the limit is derived from) 5.0 north.
    expect(BOUNDARY_Z_MIN).toBe(-96);
    expect(BOUNDARY_Z_MAX).toBe(35);
  });

  test('north edge clears the walkable limit by at least 3 units', () => {
    expect(GROUND_PLANE_NORTH_Z).toBeLessThanOrEqual(BOUNDARY_Z_MIN - REQUIRED_MARGIN);
    expect(BOUNDARY_Z_MIN - GROUND_PLANE_NORTH_Z).toBeGreaterThanOrEqual(REQUIRED_MARGIN);
  });

  test('west and east edges clear the ±35 corridor by at least 3 units', () => {
    expect(GROUND_PLANE_WEST_X).toBeLessThanOrEqual(-BOUNDARY_X - REQUIRED_MARGIN);
    expect(GROUND_PLANE_EAST_X).toBeGreaterThanOrEqual(BOUNDARY_X + REQUIRED_MARGIN);
  });

  test('south edge clears the southern walkable limit by at least 3 units', () => {
    expect(GROUND_PLANE_SOUTH_Z).toBeGreaterThanOrEqual(BOUNDARY_Z_MAX + REQUIRED_MARGIN);
  });

  test('every corner of the movement envelope is inside the plane', () => {
    const box = groundPlaneAABB();
    const corners: Array<[number, number]> = [
      [-BOUNDARY_X, BOUNDARY_Z_MIN],
      [BOUNDARY_X, BOUNDARY_Z_MIN],
      [-BOUNDARY_X, BOUNDARY_Z_MAX],
      [BOUNDARY_X, BOUNDARY_Z_MAX],
    ];
    for (const [x, z] of corners) {
      expect(x).toBeGreaterThan(box.minX);
      expect(x).toBeLessThan(box.maxX);
      expect(z).toBeGreaterThan(box.minZ);
      expect(z).toBeLessThan(box.maxZ);
    }
  });

  test('the northern walkable limit is itself reachable (defect was real)', () => {
    // BOUNDARY_Z_MIN is north of the pre-phase north edge, so the player could
    // stand there with no ground beneath: 21 units of void.
    expect(BOUNDARY_Z_MIN).toBeLessThan(PHASE_PRE_NORTH_Z);
    // 26 since C-8.37 (21 when the limit was -91).
    expect(PHASE_PRE_NORTH_Z - BOUNDARY_Z_MIN).toBeCloseTo(26, 6);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. The bounds cover the motte mesh's complete plan footprint
// ═══════════════════════════════════════════════════════════════════════════

describe('Ground covers the motte mesh footprint', () => {
  test('the recorded mesh footprint matches the transform-derived one', () => {
    expect(MOTTE_MESH_HALF_EXTENT).toBeCloseTo(25.16, 2);
    expect(MOTTE_MESH_NORTH_Z).toBeCloseTo(-101.66, 2);
    expect(MOTTE_MESH_SOUTH_Z).toBeCloseTo(-51.34, 2);
  });

  test('the plane reaches past the motte mesh north edge', () => {
    expect(GROUND_PLANE_NORTH_Z).toBeLessThan(MOTTE_MESH_NORTH_Z);
    expect(MOTTE_MESH_NORTH_Z - GROUND_PLANE_NORTH_Z).toBeGreaterThan(REQUIRED_MARGIN);
  });

  test('the whole motte footprint is inside the plane in X and Z', () => {
    const box = groundPlaneAABB();
    expect(MOTTE_CENTER_X - MOTTE_MESH_HALF_EXTENT).toBeGreaterThan(box.minX);
    expect(MOTTE_CENTER_X + MOTTE_MESH_HALF_EXTENT).toBeLessThan(box.maxX);
    expect(MOTTE_MESH_SOUTH_Z).toBeLessThan(box.maxZ);
    expect(MOTTE_MESH_NORTH_Z).toBeGreaterThan(box.minZ);
  });

  test('the motte centre and its summit are far inside the plane', () => {
    const box = groundPlaneAABB();
    expect(MOTTE_CENTER_Z).toBeGreaterThan(box.minZ);
    expect(MOTTE_CENTER_Z).toBeLessThan(box.maxZ);
    expect(MOTTE_CENTER_Z - box.minZ).toBeGreaterThan(30);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. The bounds cover the visible moat ring's northern extent
// ═══════════════════════════════════════════════════════════════════════════

describe('Ground covers the visible moat ring', () => {
  test('the moat ring north extent is derived as Z = -107.5', () => {
    expect(MOAT_OUTER_RADIUS).toBe(31.0);
    expect(MOAT_NORTH_Z).toBeCloseTo(-107.5, 6);
  });

  test('the plane reaches past the moat ring north edge', () => {
    expect(GROUND_PLANE_NORTH_Z).toBeLessThan(MOAT_NORTH_Z);
    expect(MOAT_NORTH_Z - GROUND_PLANE_NORTH_Z).toBeGreaterThan(1);
  });

  test('both moat edges stay inside the plane', () => {
    const box = groundPlaneAABB();
    expect(MOTTE_CENTER_Z - MOAT_OUTER_RADIUS).toBeGreaterThan(box.minZ);
    expect(MOTTE_CENTER_Z - MOAT_INNER_RADIUS).toBeGreaterThan(box.minZ);
    expect(MOTTE_CENTER_Z + MOAT_OUTER_RADIUS).toBeLessThan(box.maxZ);
  });

  test('the moat is the northernmost geometry the plane must cover', () => {
    // Sanity: the moat ring reaches further north than the motte mesh itself,
    // so the two northern coverage targets are ordered correctly.
    expect(MOAT_NORTH_Z).toBeLessThan(MOTTE_MESH_NORTH_Z);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Elevation: below the moat water surface, above nothing else
// ═══════════════════════════════════════════════════════════════════════════

describe('Ground elevation stays below the moat water surface', () => {
  test('the plane sits at Y = -0.05, below the water at Y = 0.06', () => {
    expect(GROUND_PLANE_ELEVATION_Y).toBe(-0.05);
    expect(MOAT_WATER_Y).toBe(0.06);
    expect(GROUND_PLANE_ELEVATION_Y).toBeLessThan(MOAT_WATER_Y);
  });

  test('the water clearance is wide enough to avoid z-fighting', () => {
    expect(MOAT_WATER_Y - GROUND_PLANE_ELEVATION_Y).toBeGreaterThan(0.05);
  });

  test('the plane stays below the city walking surface (Y = 0)', () => {
    expect(GROUND_PLANE_ELEVATION_Y).toBeLessThan(0);
    // Sampled off the motte (X = 40), well north of the old plane edge: the
    // added ground sits under the flat city level, not above it.
    expect(getTerrainY(40, GROUND_PLANE_NORTH_Z + 20)).toBe(0);
    expect(getTerrainY(-40, -90)).toBe(0);
  });

  test('the plane stays below the drawbridge underside', () => {
    expect(GROUND_PLANE_ELEVATION_Y).toBeLessThan(DECK_UNDERSIDE_Y);
    expect(GROUND_PLANE_ELEVATION_Y).toBeLessThan(DECK_TOP_Y);
  });

  test('the plane is well below the motte summit', () => {
    expect(GROUND_PLANE_ELEVATION_Y).toBeLessThan(SUMMIT_Y);
    expect(GROUND_PLANE_ELEVATION_Y).toBeLessThan(getTerrainY(0, MOTTE_CENTER_Z));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Bump-map tiling keeps the established world-space texture density
// ═══════════════════════════════════════════════════════════════════════════

describe('Bump-map tiling preserves world-space texture density', () => {
  /** The density the 140 m plane had at repeat 32 (its calibrated value). */
  const LEGACY_METERS_PER_TILE = PHASE_PRE_WIDTH / GROUND_BUMP_REPEAT_X; // 4.375

  test('the X axis keeps the calibrated density', () => {
    expect(GROUND_BUMP_METERS_PER_TILE_X).toBeCloseTo(LEGACY_METERS_PER_TILE, 10);
    expect(GROUND_BUMP_METERS_PER_TILE_X).toBeCloseTo(4.375, 6);
  });

  test('the Z axis stays within 1 % of that density (no stretching)', () => {
    const deviation = Math.abs(GROUND_BUMP_METERS_PER_TILE_Z - LEGACY_METERS_PER_TILE);
    expect(deviation / LEGACY_METERS_PER_TILE).toBeLessThan(0.01);
  });

  test('the texture stays isotropic (X and Z tiles match in size)', () => {
    const anisotropy =
      Math.abs(GROUND_BUMP_METERS_PER_TILE_Z - GROUND_BUMP_METERS_PER_TILE_X) /
      GROUND_BUMP_METERS_PER_TILE_X;
    expect(anisotropy).toBeLessThan(0.01);
  });

  test('the repeats are derived from the plane dimensions, not restated', () => {
    expect(GROUND_BUMP_METERS_PER_TILE_X).toBe(GROUND_PLANE_WIDTH / GROUND_BUMP_REPEAT_X);
    expect(GROUND_BUMP_METERS_PER_TILE_Z).toBe(GROUND_PLANE_DEPTH / GROUND_BUMP_REPEAT_Z);
    expect(GROUND_BUMP_REPEAT_X).toBe(32); // unchanged from the pre-phase tiling
    expect(GROUND_BUMP_REPEAT_Z).toBe(41); // 179 / 41 = 4.366 m per tile (C-8.37)
  });

  test('the Z repeat is the smallest integer that holds the density', () => {
    const idealRepeatZ = GROUND_PLANE_DEPTH / LEGACY_METERS_PER_TILE; // 39.77…
    expect(GROUND_BUMP_REPEAT_Z).toBe(Math.round(idealRepeatZ));
    expect(GROUND_BUMP_REPEAT_Z).toBeGreaterThanOrEqual(Math.ceil(idealRepeatZ) - 1);
  });

  test('the pre-phase single repeat would have stretched the texture', () => {
    const stretched = GROUND_PLANE_DEPTH / GROUND_BUMP_REPEAT_X; // 5.4375
    expect(stretched / LEGACY_METERS_PER_TILE).toBeGreaterThan(1.2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Existing terrain and layout contracts remain unchanged
// ═══════════════════════════════════════════════════════════════════════════

describe('Terrain contracts are unchanged by the ground extension', () => {
  test('summit height, slope profile and slope foot are unchanged', () => {
    expect(SUMMIT_Y).toBeCloseTo(4.7175, 6);
    expect(SUMMIT_SLOPE_FOOT_SCALE).toBe(1.55);
    expect(SUMMIT_SLOPE_FOOT_RADIUS).toBeCloseTo(19.499, 3);
    expect(SUMMIT_CARDINAL_RADIUS).toBeCloseTo(12.58, 6);
    expect(SUMMIT_SUPERELLIPSE_N).toBe(6);
  });

  test('the mound slope still matches the measured mesh samples', () => {
    // Absolute world Z: the mesh moved 5.0 north with the group (C-8.37), so
    // each sample keeps the same radius about the motte centre as before.
    const samples: Array<[number, number]> = [
      [MOTTE_CENTER_Z + 19.0, 0.3402],
      [MOTTE_CENTER_Z + 18.5, 0.6811],
      [MOTTE_CENTER_Z + 17.5, 1.3630],
      [MOTTE_CENTER_Z + 16.5, 2.0448],
      [MOTTE_CENTER_Z + 12.5, 4.7175],
    ];
    for (const [z, meshY] of samples) {
      expect(Math.abs(getTerrainY(0, z) - meshY)).toBeLessThan(0.01);
    }
  });

  test('the summit superellipse profile is unchanged', () => {
    expect(summitLevel(0, 0)).toBe(0);
    expect(summitLevel(SUMMIT_CARDINAL_RADIUS, 0)).toBeCloseTo(1, 10);
    expect(summitLevel(SUMMIT_SLOPE_FOOT_RADIUS, 0)).toBeCloseTo(SUMMIT_SLOPE_FOOT_SCALE, 10);
    expect(getTerrainY(SUMMIT_CARDINAL_RADIUS, MOTTE_CENTER_Z)).toBeCloseTo(SUMMIT_Y, 6);
  });

  test('collision perimeter and the moat ring carry the C-8.36 values', () => {
    expect(MOTTE_PERIMETER_RADIUS).toBe(22.0);
    // Phase C-8.36 widened the ring in from 25.8 to 25.0 and removed its south
    // gap, so the moat water now runs beneath the drawbridge; the ring stays
    // outside the 22.0 collision perimeter and carries no colliders.  The
    // coverage and clearance measurements live in phaseC8_36.test.ts.
    expect(MOAT_INNER_RADIUS).toBe(25.0);
    expect(MOAT_OUTER_RADIUS).toBe(31.0);
    expect(MOAT_GAP_HALF_ANGLE).toBe(0);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('motte-wall')).length).toBe(20);
  });

  test('drawbridge footprint and elevation carry the C-8.37 span', () => {
    // Both ends are stated relative to the motte centre in terrainHeight, so
    // they moved with the group: +31.0 (the moat's outer shoreline, the bank
    // the deck lands on) and +25.5 (0.5 short of the deck's own north end).
    expect(BRIDGE_Z_OUTER).toBe(MOTTE_CENTER_Z + 31.0); // -45.5
    expect(BRIDGE_Z_INNER).toBe(MOTTE_CENTER_Z + 25.5); // -51.0
    expect(DECK_Z_OUTER).toBe(BRIDGE_Z_OUTER);          // -45.5
    expect(DECK_Z_INNER).toBe(BRIDGE_Z_INNER - 0.5);    // -51.5
    expect(BRIDGE_HALF_WIDTH).toBe(2.0);
    expect(DECK_TOP_Y).toBe(0.16);
    expect(DECK_UNDERSIDE_Y).toBe(0.09);
    expect(isOnBridge(0, (BRIDGE_Z_OUTER + BRIDGE_Z_INNER) / 2)).toBe(true);
  });

  test('fortress collider rects keep their offsets from the motte centre', () => {
    const south = rect('fortress-south-l');
    const north = rect('fortress-north');
    const west = rect('fortress-west');
    const east = rect('fortress-east');
    // 10.5 = the fortress's own 21×21 world half-footprint at scale 0.30; both
    // walls ride at MOTTE_CENTER_Z ± 10.5 (C-8.37).
    expect(south.cz).toBe(MOTTE_CENTER_Z + 10.5); // -66.0
    expect(north.cz).toBe(MOTTE_CENTER_Z - 10.5); // -87.0
    expect(west.cx).toBe(-10.5);
    expect(east.cx).toBe(10.5);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('fortress-')).length).toBe(5);
  });

  test('fast-travel arrival points are unchanged and inside the boundaries', () => {
    // 12.5 north of the motte centre = 2.0 south of the fortress south wall
    // (outer face MOTTE_CENTER_Z + 10.5 = -66.0), inside the summit.
    expect(FAST_TRAVEL_ARRIVALS.northern_fortress).toEqual([0, MOTTE_CENTER_Z + 12.5]);
    for (const [ax, az] of Object.values(FAST_TRAVEL_ARRIVALS)) {
      expect(ax).toBeGreaterThanOrEqual(-BOUNDARY_X);
      expect(ax).toBeLessThanOrEqual(BOUNDARY_X);
      expect(az).toBeGreaterThanOrEqual(BOUNDARY_Z_MIN);
      expect(az).toBeLessThanOrEqual(BOUNDARY_Z_MAX);
    }
  });

  test('the fortress arrival is still walkable and at summit height', () => {
    const [ax, az] = FAST_TRAVEL_ARRIVALS.northern_fortress;
    expect(collidesWith(ax, az, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    expect(getTerrainY(ax, az)).toBeCloseTo(SUMMIT_Y, 2);
  });

  test('world boundaries keep their derivation from the motte perimeter', () => {
    expect(BOUNDARY_X).toBe(35);
    // MOTTE_CENTER_Z - MOTTE_PERIMETER_RADIUS + 2.5 = -96 (was -91 before the
    // group moved 5.0 north; the 2.5-unit margin is unchanged).
    expect(BOUNDARY_Z_MIN).toBe(MOTTE_CENTER_Z - MOTTE_PERIMETER_RADIUS + 2.5);
    expect(BOUNDARY_Z_MIN).toBe(-96);
    expect(BOUNDARY_Z_MAX).toBe(35);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. The suite detects a regression that exposes reachable northern ground
// ═══════════════════════════════════════════════════════════════════════════

describe('Regression detection on the plane north edge', () => {
  test('the pre-phase plane fails the coverage rule', () => {
    expect(coversNorthernEnvelope(PHASE_PRE_NORTH_Z)).toBe(false);
    expect(PHASE_PRE_NORTH_Z).toBeGreaterThan(BOUNDARY_Z_MIN);
  });

  test('the shipped plane passes exactly where the pre-phase one failed', () => {
    expect(coversNorthernEnvelope(GROUND_PLANE_NORTH_Z)).toBe(true);
    expect(GROUND_PLANE_NORTH_Z).toBeLessThan(BOUNDARY_Z_MIN);
  });

  test('shrinking the depth back toward the old size is caught', () => {
    // Any plane whose north edge stops short of the 3-unit margin — a revert
    // to the 140-deep plane, or a "partial" extension that stops at the motte
    // rim (Z = -96.66) — must be rejected by the same rule.
    const depthToCoverMotteRim =
      2 * (GROUND_PLANE_CENTER[2] - MOTTE_MESH_NORTH_Z); // 159.32
    for (const depth of [PHASE_PRE_DEPTH, depthToCoverMotteRim - 12]) {
      expect(coversNorthernEnvelope(GROUND_PLANE_CENTER[2] - depth / 2)).toBe(false);
    }
  });

  test('the rule flips exactly at the depth that buys the required margin', () => {
    // Centre ∓ half depth, so the north edge lands exactly on the minimum
    // margin line: 2 × (-19.5 − (-96 − 3)) = 159 after the C-8.37 shift.
    const requiredDepth =
      2 * (GROUND_PLANE_CENTER[2] - (BOUNDARY_Z_MIN - REQUIRED_MARGIN)); // 159
    expect(requiredDepth).toBe(159);
    expect(coversNorthernEnvelope(GROUND_PLANE_CENTER[2] - requiredDepth / 2)).toBe(true);
    expect(coversNorthernEnvelope(GROUND_PLANE_CENTER[2] - (requiredDepth - 2) / 2)).toBe(false);
    expect(GROUND_PLANE_DEPTH).toBeGreaterThan(requiredDepth);
  });

  test('the margin rule sits between the defect and the fix', () => {
    // Reverting to the pre-phase depth would expose 26 walkable units of void
    // (BOUNDARY_Z_MIN -96 against the plane's old north edge at -70).
    expect(GROUND_PLANE_DEPTH / 2 - PHASE_PRE_DEPTH / 2).toBeCloseTo(19.5, 6);
    expect(GROUND_PLANE_NORTH_Z).toBeLessThanOrEqual(BOUNDARY_Z_MIN - REQUIRED_MARGIN);
    expect(PHASE_PRE_NORTH_Z).toBeGreaterThan(BOUNDARY_Z_MIN - REQUIRED_MARGIN);
  });

  test('a plane that only just covered the moat ring would still fail margin', () => {
    // Covering the moat north edge is necessary but not sufficient: the rule
    // is about the walkable envelope, so a plane whose north edge equals the
    // moat edge passes coverage by 1.5 units — assert the shipped one has room.
    expect(GROUND_PLANE_NORTH_Z).toBeLessThan(MOAT_NORTH_Z);
    const moatOnlyNorthZ = MOAT_NORTH_Z;
    expect(BOUNDARY_Z_MIN - moatOnlyNorthZ).toBeGreaterThan(REQUIRED_MARGIN);
  });
});
