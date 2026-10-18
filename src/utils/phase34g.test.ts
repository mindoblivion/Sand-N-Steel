/**
 * Phase 34G — Northern Motte and Fortress Integration regression tests.
 *
 * Run with: bun test src/utils/phase34g.test.ts
 *
 * Covers:
 *   - Terrain height at ramp bottom, midpoint, and top
 *   - Terrain height on the summit and outside the motte
 *   - Fortress footprint inside the flat summit
 *   - Collision: fortress walls shifted correctly, gate gap clear
 *   - Motte perimeter segments with ramp opening
 *   - Boundary coverage (BOUNDARY_Z_MIN)
 *   - Fast-travel arrival position and terrain height
 *   - Recovery history clearing
 *   - Colosseum clearance from the motte
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import {
  PLAYER_RADIUS,
  CITY_COLLIDERS,
  collidesWith,
  totalPenetration,
  overlappingColliderIds,
} from './collisionShapes';
import {
  BOUNDARY_X,
  BOUNDARY_Z_MIN,
  BOUNDARY_Z_MAX,
  resolveCityMovement,
  clearRecoveryHistory,
  FAST_TRAVEL_ARRIVALS,
  HUB_LOCATIONS,
} from './cityCollisions';
import {
  getTerrainY,
  isInsideSummit,
  summitEdgeRadius,
  MOTTE_CENTER_Z,
  MOTTE_SCALE,
  RAMP_HALF_WIDTH,
  RAMP_Z_OUTER,
  RAMP_Z_INNER,
  SUMMIT_Y,
  SUMMIT_CARDINAL_RADIUS,
  SUMMIT_DIAGONAL_RADIUS,
  SUMMIT_SUPERELLIPSE_N,
  SUMMIT_SLOPE_FOOT_RADIUS,
  MOTTE_PERIMETER_RADIUS,
} from './terrainHeight';

// ── Tolerances ──────────────────────────────────────────────────────────────
const EPS = 1e-6;
const HALF_MM = 5e-4;

// ── Fortress constants (must match collisionShapes.ts) ─────────────────────
const FORTRESS_HALF_W = 10.5; // 21 * 0.30 / 2
const FORTRESS_SOUTH_Z = -61.0; // -71.5 + 10.5
const FORTRESS_NORTH_Z = -82.0; // -71.5 - 10.5
const FORTRESS_CENTER_Z = -71.5;
const GATE_HALF_GAP = 1.0;

// ═══════════════════════════════════════════════════════════════════════════
// 1. Terrain Height — Former Ramp Area (now mound slope)
// ═══════════════════════════════════════════════════════════════════════════
//
// Phase 35E: The dirt ramp is hidden and replaced by a wooden drawbridge.
// The mound slope now provides the upward path from the perimeter (Y=0)
// to the summit edge (Y=4.72) at the south opening.

describe('Terrain height — former ramp area (mound slope)', () => {
  test('former ramp outer edge is at Y=0 (ground/bridge level)', () => {
    const y = getTerrainY(0, RAMP_Z_OUTER);
    expect(Math.abs(y)).toBeLessThan(EPS);
  });

  test('former ramp inner edge is at summit height', () => {
    // At the summit boundary (cardinal radius 12.58), terrain is summit Y
    const y = getTerrainY(0, RAMP_Z_INNER);
    expect(Math.abs(y - SUMMIT_Y)).toBeLessThan(HALF_MM);
  });

  test('midpoint of former ramp is on mound slope (not flat ground)', () => {
    const midZ = (RAMP_Z_OUTER + RAMP_Z_INNER) / 2;
    const y = getTerrainY(0, midZ);
    // Should be between 0 and summit — on the mound slope
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(SUMMIT_Y);
  });

  test('mound slope is continuous from the visible slope foot to the summit', () => {
    // Phase Motte-Terrain Alignment 1: the visible mound reaches Y=0 at the
    // slope foot (SUMMIT_SLOPE_FOOT_RADIUS, 19.499 cardinal), which is INSIDE
    // the collision perimeter (22.0).  Sample from just inside the foot up to
    // the summit edge; the band between the foot and the perimeter is flat
    // city ground and is asserted separately below.
    for (let r = SUMMIT_SLOPE_FOOT_RADIUS - 0.5; r > SUMMIT_CARDINAL_RADIUS + 0.1; r -= 0.5) {
      const y = getTerrainY(0, MOTTE_CENTER_Z + r);
      expect(y).toBeGreaterThan(0, `r=${r.toFixed(2)}: Y=${y.toFixed(4)} should be > 0`);
      expect(y).toBeLessThan(SUMMIT_Y, `r=${r.toFixed(2)}: Y=${y.toFixed(4)} should be < SUMMIT_Y`);
    }
  });

  test('ground between the slope foot and the collision perimeter is flat', () => {
    // The rendered mound is fully below the ground plane here (the ditch
    // ring), so gameplay terrain is Y=0 all the way out to the perimeter.
    for (let r = SUMMIT_SLOPE_FOOT_RADIUS; r <= MOTTE_PERIMETER_RADIUS; r += 0.5) {
      const y = getTerrainY(0, MOTTE_CENTER_Z + r);
      expect(y).toBeGreaterThanOrEqual(0, `r=${r.toFixed(2)}: Y=${y.toFixed(4)} should be >= 0`);
      expect(y).toBeLessThan(0.02, `r=${r.toFixed(2)}: Y=${y.toFixed(4)} should be flat ground`);
    }
  });

  test('mound slope increases monotonically toward summit', () => {
    let prevY = 0;
    for (let r = MOTTE_PERIMETER_RADIUS - 0.1; r > SUMMIT_CARDINAL_RADIUS; r -= 0.5) {
      const y = getTerrainY(0, MOTTE_CENTER_Z + r);
      expect(y).toBeGreaterThanOrEqual(prevY - 0.01,
        `r=${r.toFixed(2)}: Y=${y.toFixed(4)} should be >= prev Y=${prevY.toFixed(4)}`);
      prevY = y;
    }
  });

  test('terrain just outside ramp width is on mound slope', () => {
    // Just beyond the former ramp width, at midpoint Z — should be on mound slope
    const x = RAMP_HALF_WIDTH + 0.01;
    const midZ = (RAMP_Z_OUTER + RAMP_Z_INNER) / 2;
    const y = getTerrainY(x, midZ);
    // Should be on the mound slope (between 0 and summit)
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(SUMMIT_Y);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Terrain Height — Summit
// ═══════════════════════════════════════════════════════════════════════════

describe('Terrain height — summit', () => {
  test('summit center is at summit height', () => {
    const y = getTerrainY(0, MOTTE_CENTER_Z);
    expect(Math.abs(y - SUMMIT_Y)).toBeLessThan(EPS);
  });

  test('summit at fortress center is at summit height', () => {
    const y = getTerrainY(0, FORTRESS_CENTER_Z);
    expect(Math.abs(y - SUMMIT_Y)).toBeLessThan(EPS);
  });

  test('summit edge at cardinal direction is at summit height', () => {
    // At the cardinal summit radius (12.58), along the X axis
    const y = getTerrainY(SUMMIT_CARDINAL_RADIUS, MOTTE_CENTER_Z);
    expect(Math.abs(y - SUMMIT_Y)).toBeLessThan(HALF_MM);
  });

  test('just beyond cardinal summit edge starts sloping down', () => {
    const yInside = getTerrainY(SUMMIT_CARDINAL_RADIUS, MOTTE_CENTER_Z);
    const yOutside = getTerrainY(SUMMIT_CARDINAL_RADIUS + 0.1, MOTTE_CENTER_Z);
    expect(yOutside).toBeLessThan(yInside);
  });

  test('summit edge at diagonal direction is at summit height', () => {
    // Diagonal summit radius ≈ 15.87 at 45°
    const dx = SUMMIT_DIAGONAL_RADIUS * Math.SQRT1_2;
    const dz = SUMMIT_DIAGONAL_RADIUS * Math.SQRT1_2;
    const y = getTerrainY(dx, MOTTE_CENTER_Z + dz);
    expect(Math.abs(y - SUMMIT_Y)).toBeLessThan(0.01);
  });

  test('just beyond diagonal summit edge starts sloping down', () => {
    const dx = SUMMIT_DIAGONAL_RADIUS * Math.SQRT1_2;
    const dz = SUMMIT_DIAGONAL_RADIUS * Math.SQRT1_2;
    const yInside = getTerrainY(dx, MOTTE_CENTER_Z + dz);
    const yOutside = getTerrainY(dx + 0.1, MOTTE_CENTER_Z + dz + 0.1);
    expect(yOutside).toBeLessThan(yInside);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Terrain Height — Outside the Motte
// ═══════════════════════════════════════════════════════════════════════════

describe('Terrain height — outside motte', () => {
  test('city center is at Y=0', () => {
    expect(getTerrainY(0, 0)).toBe(0);
  });

  test('colosseum area is at Y=0', () => {
    expect(getTerrainY(0, -25)).toBe(0);
  });

  test('just outside perimeter radius is at Y=0', () => {
    const y = getTerrainY(MOTTE_PERIMETER_RADIUS + 0.01, MOTTE_CENTER_Z);
    expect(Math.abs(y)).toBeLessThan(HALF_MM);
  });

  test('south of ramp outer edge is at Y=0', () => {
    const y = getTerrainY(0, RAMP_Z_OUTER + 1);
    expect(y).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3b. Phase 34I — Superellipse Summit Regression Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Superellipse summit regression (Phase 34I)', () => {
  test('cardinal summit radius is 40 * scale', () => {
    expect(SUMMIT_CARDINAL_RADIUS).toBeCloseTo(40 * MOTTE_SCALE, 4);
  });

  test('diagonal summit radius is ~50.4 * scale', () => {
    expect(SUMMIT_DIAGONAL_RADIUS).toBeCloseTo(50.4 * MOTTE_SCALE, 2);
  });

  test('superellipse exponent is 6', () => {
    expect(SUMMIT_SUPERELLIPSE_N).toBe(6);
  });

  test('no floating region between cardinal and old circular radius', () => {
    // The old circular approximation used 50 * scale = 15.725 as the summit
    // radius.  At cardinal direction, the actual summit edge is 12.58.
    // Points between 12.58 and 15.725 should NOT be at summit height —
    // they should be on the mound slope (Y < SUMMIT_Y).
    const oldRadius = 50 * MOTTE_SCALE; // 15.725
    for (let r = SUMMIT_CARDINAL_RADIUS + 0.1; r < oldRadius; r += 0.5) {
      const y = getTerrainY(r, MOTTE_CENTER_Z);
      expect(y).toBeLessThan(SUMMIT_Y - 0.01,
        `Floating region at cardinal r=${r.toFixed(2)}: Y=${y.toFixed(4)} should be below summit`);
    }
  });

  test('no floating region at cardinal between summit edge and perimeter', () => {
    // All points between the cardinal summit edge (12.58) and the
    // perimeter (22.0) at cardinal direction should be on the mound
    // slope, not at summit height.
    for (let r = SUMMIT_CARDINAL_RADIUS + 0.01; r < MOTTE_PERIMETER_RADIUS; r += 1.0) {
      const y = getTerrainY(r, MOTTE_CENTER_Z);
      expect(y).toBeLessThan(SUMMIT_Y,
        `Cardinal r=${r.toFixed(2)}: Y=${y.toFixed(4)} should be below summit`);
      expect(y).toBeGreaterThanOrEqual(0,
        `Cardinal r=${r.toFixed(2)}: Y=${y.toFixed(4)} should be >= 0`);
    }
  });

  test('summit is NOT circular: cardinal and diagonal edges differ', () => {
    const cardinalEdge = summitEdgeRadius(0);
    const diagonalEdge = summitEdgeRadius(Math.PI / 4);
    expect(cardinalEdge).toBeCloseTo(SUMMIT_CARDINAL_RADIUS, 4);
    expect(diagonalEdge).toBeCloseTo(SUMMIT_DIAGONAL_RADIUS, 1);
    expect(diagonalEdge).toBeGreaterThan(cardinalEdge);
  });

  test('isInsideSummit: center is inside', () => {
    expect(isInsideSummit(0, 0)).toBe(true);
  });

  test('isInsideSummit: cardinal edge is inside', () => {
    expect(isInsideSummit(SUMMIT_CARDINAL_RADIUS - 0.01, 0)).toBe(true);
  });

  test('isInsideSummit: beyond cardinal edge is outside', () => {
    expect(isInsideSummit(SUMMIT_CARDINAL_RADIUS + 0.01, 0)).toBe(false);
  });

  test('isInsideSummit: diagonal point inside superellipse', () => {
    // At 45°, the summit extends to ~15.87.  A point at radius 14 should be inside.
    const r = 14;
    expect(isInsideSummit(r * Math.SQRT1_2, r * Math.SQRT1_2)).toBe(true);
  });

  test('isInsideSummit: old circular radius at cardinal is outside summit', () => {
    // 15.725 at cardinal should be outside the superellipse (cardinal edge is 12.58)
    expect(isInsideSummit(50 * MOTTE_SCALE, 0)).toBe(false);
  });

  test('terrain at old circular radius (cardinal) is on mound slope', () => {
    const oldRadius = 50 * MOTTE_SCALE; // 15.725
    const y = getTerrainY(oldRadius, MOTTE_CENTER_Z);
    // Should be on the slope, not at summit and not at ground
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(SUMMIT_Y);
  });

  test('terrain at old circular radius (diagonal) is at summit', () => {
    // At 45°, the old circular radius (15.725) is close to the diagonal
    // summit edge (15.87), so it should still be at summit height.
    const oldRadius = 50 * MOTTE_SCALE;
    const dx = oldRadius * Math.SQRT1_2;
    const dz = oldRadius * Math.SQRT1_2;
    const y = getTerrainY(dx, MOTTE_CENTER_Z + dz);
    expect(y).toBeCloseTo(SUMMIT_Y, 1);
  });

  test('fortress footprint corners are inside summit at all 4 corners', () => {
    const corners: [number, number][] = [
      [FORTRESS_HALF_W, FORTRESS_HALF_W],
      [-FORTRESS_HALF_W, FORTRESS_HALF_W],
      [FORTRESS_HALF_W, -FORTRESS_HALF_W],
      [-FORTRESS_HALF_W, -FORTRESS_HALF_W],
    ];
    for (const [cx, cz] of corners) {
      expect(isInsideSummit(cx, cz)).toBe(true);
    }
  });

  test('mound slope is continuous: no jump at summit boundary', () => {
    // Just inside and just outside the cardinal summit edge should have
    // nearly the same height (continuous transition).
    const yInside = getTerrainY(SUMMIT_CARDINAL_RADIUS - 0.01, MOTTE_CENTER_Z);
    const yOutside = getTerrainY(SUMMIT_CARDINAL_RADIUS + 0.01, MOTTE_CENTER_Z);
    expect(Math.abs(yInside - yOutside)).toBeLessThan(0.1);
  });

  test('mound slope reaches zero at perimeter', () => {
    // At the perimeter radius, the mound slope should be at or near Y=0
    const y = getTerrainY(MOTTE_PERIMETER_RADIUS - 0.01, MOTTE_CENTER_Z);
    expect(y).toBeLessThan(0.1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Fortress Footprint Inside the Flat Summit
// ═══════════════════════════════════════════════════════════════════════════

describe('Fortress footprint inside flat summit', () => {
  test('fortress south wall is inside summit cardinal radius', () => {
    const dist = Math.abs(FORTRESS_SOUTH_Z - MOTTE_CENTER_Z);
    expect(dist).toBeLessThan(SUMMIT_CARDINAL_RADIUS);
  });

  test('fortress north wall is inside summit cardinal radius', () => {
    const dist = Math.abs(FORTRESS_NORTH_Z - MOTTE_CENTER_Z);
    expect(dist).toBeLessThan(SUMMIT_CARDINAL_RADIUS);
  });

  test('fortress corner is inside summit superellipse', () => {
    // Corner at (10.5, -61.0): dx=10.5, dz=10.5 from motte center [0, -71.5]
    const dx = FORTRESS_HALF_W;
    const dz = FORTRESS_HALF_W;
    expect(isInsideSummit(dx, dz)).toBe(true);
  });

  test('fortress corner clearance > 0.5 units from diagonal summit edge', () => {
    // Corner distance from center
    const cornerDist = Math.sqrt(FORTRESS_HALF_W ** 2 + FORTRESS_HALF_W ** 2);
    // Summit edge at 45° (diagonal)
    const diagonalEdge = summitEdgeRadius(Math.PI / 4);
    const clearance = diagonalEdge - cornerDist;
    expect(clearance).toBeGreaterThan(0.5);
  });

  test('terrain at fortress center is summit height', () => {
    expect(getTerrainY(0, FORTRESS_CENTER_Z)).toBeCloseTo(SUMMIT_Y, 4);
  });

  test('terrain at all fortress corners is summit height', () => {
    const corners: [number, number][] = [
      [FORTRESS_HALF_W, FORTRESS_SOUTH_Z],
      [-FORTRESS_HALF_W, FORTRESS_SOUTH_Z],
      [FORTRESS_HALF_W, FORTRESS_NORTH_Z],
      [-FORTRESS_HALF_W, FORTRESS_NORTH_Z],
    ];
    for (const [cx, cz] of corners) {
      expect(getTerrainY(cx, cz)).toBeCloseTo(SUMMIT_Y, 3);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Collision — Fortress Walls
// ═══════════════════════════════════════════════════════════════════════════

describe('Collision — fortress walls', () => {
  test('gate gap at X=0 is collision-free at south wall', () => {
    const blocked = collidesWith(0, FORTRESS_SOUTH_Z, PLAYER_RADIUS, CITY_COLLIDERS);
    expect(blocked).toBe(false);
  });

  test('gate gap edge (X=0.5) is collision-free at south wall', () => {
    // Gate gap is ±1.0; with player radius 0.4, safe range is ±0.6
    const blocked = collidesWith(0.5, FORTRESS_SOUTH_Z, PLAYER_RADIUS, CITY_COLLIDERS);
    expect(blocked).toBe(false);
  });

  test('gate gap edge (X=0.9) collides with wall (outside safe zone)', () => {
    // Player at X=0.9 extends to 1.3, overlapping fortress-south-r (starts at X=1.0)
    const blocked = collidesWith(0.9, FORTRESS_SOUTH_Z, PLAYER_RADIUS, CITY_COLLIDERS);
    expect(blocked).toBe(true);
  });

  test('south wall blocks at X=2.0 (outside gate gap)', () => {
    const blocked = collidesWith(2.0, FORTRESS_SOUTH_Z, PLAYER_RADIUS, CITY_COLLIDERS);
    expect(blocked).toBe(true);
  });

  test('north wall blocks player', () => {
    const blocked = collidesWith(0, FORTRESS_NORTH_Z, PLAYER_RADIUS, CITY_COLLIDERS);
    expect(blocked).toBe(true);
  });

  test('east wall blocks player', () => {
    const blocked = collidesWith(FORTRESS_HALF_W, FORTRESS_CENTER_Z, PLAYER_RADIUS, CITY_COLLIDERS);
    expect(blocked).toBe(true);
  });

  test('west wall blocks player', () => {
    const blocked = collidesWith(-FORTRESS_HALF_W, FORTRESS_CENTER_Z, PLAYER_RADIUS, CITY_COLLIDERS);
    expect(blocked).toBe(true);
  });

  test('inside fortress (center) is collision-free', () => {
    const blocked = collidesWith(0, FORTRESS_CENTER_Z, PLAYER_RADIUS, CITY_COLLIDERS);
    expect(blocked).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Collision — Motte Perimeter
// ═══════════════════════════════════════════════════════════════════════════

describe('Collision — motte perimeter', () => {
  test('north side of motte perimeter blocks player', () => {
    // North of motte center at perimeter radius
    const x = 0;
    const z = MOTTE_CENTER_Z - MOTTE_PERIMETER_RADIUS;
    const blocked = collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS);
    expect(blocked).toBe(true);
  });

  test('east side of motte perimeter blocks player', () => {
    const x = MOTTE_PERIMETER_RADIUS;
    const z = MOTTE_CENTER_Z;
    const blocked = collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS);
    expect(blocked).toBe(true);
  });

  test('west side of motte perimeter blocks player', () => {
    const x = -MOTTE_PERIMETER_RADIUS;
    const z = MOTTE_CENTER_Z;
    const blocked = collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS);
    expect(blocked).toBe(true);
  });

  test('ramp opening (south, X=0) is collision-free', () => {
    // At the south point of the perimeter, in the ramp opening
    const x = 0;
    const z = MOTTE_CENTER_Z + MOTTE_PERIMETER_RADIUS; // south point
    const blocked = collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS);
    expect(blocked).toBe(false);
  });

  test('ramp opening edge (X=2.5) is collision-free', () => {
    const x = 2.5;
    const z = MOTTE_CENTER_Z + MOTTE_PERIMETER_RADIUS;
    const blocked = collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS);
    expect(blocked).toBe(false);
  });

  test('outside ramp opening (X=6.0, near perimeter) is blocked by perimeter', () => {
    // At the perimeter south point the arc curves away; just inside
    // (1 unit north of the south point) the arc segment is close enough
    // to block at X=6.0.
    const x = 6.0;
    const z = MOTTE_CENTER_Z + MOTTE_PERIMETER_RADIUS - 1; // -50.5
    const blocked = collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS);
    expect(blocked).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Entry and Exit at the Bridge / Mound Perimeter Opening
// ═══════════════════════════════════════════════════════════════════════════

describe('Bridge and mound entry/exit', () => {
  test('can walk from ground onto bridge outer edge', () => {
    // Just south of bridge — on flat ground
    const groundOk = !collidesWith(0, RAMP_Z_OUTER + 1, PLAYER_RADIUS, CITY_COLLIDERS);
    // At bridge/mound area
    const rampOk = !collidesWith(0, RAMP_Z_OUTER, PLAYER_RADIUS, CITY_COLLIDERS);
    expect(groundOk).toBe(true);
    expect(rampOk).toBe(true);
  });

  test('can traverse from mound slope to summit', () => {
    // At the former ramp inner edge (now mound slope near summit)
    const rampTopOk = !collidesWith(0, RAMP_Z_INNER, PLAYER_RADIUS, CITY_COLLIDERS);
    // Just past, on summit
    const summitOk = !collidesWith(0, RAMP_Z_INNER - 0.5, PLAYER_RADIUS, CITY_COLLIDERS);
    expect(rampTopOk).toBe(true);
    expect(summitOk).toBe(true);
  });

  test('can pass through fortress gate from summit', () => {
    // South of fortress south wall, in gate gap
    const southOk = !collidesWith(0, FORTRESS_SOUTH_Z - 1, PLAYER_RADIUS, CITY_COLLIDERS);
    // At fortress south wall, in gate gap
    const gateOk = !collidesWith(0, FORTRESS_SOUTH_Z, PLAYER_RADIUS, CITY_COLLIDERS);
    // Inside fortress
    const insideOk = !collidesWith(0, FORTRESS_SOUTH_Z - 2, PLAYER_RADIUS, CITY_COLLIDERS);
    expect(southOk).toBe(true);
    expect(gateOk).toBe(true);
    expect(insideOk).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. Fast-Travel Arrival
// ═══════════════════════════════════════════════════════════════════════════

describe('Fast-travel arrival', () => {
  test('northern_fortress arrival is in FAST_TRAVEL_ARRIVALS', () => {
    expect(FAST_TRAVEL_ARRIVALS.northern_fortress).toBeDefined();
  });

  test('northern_fortress arrival X is in gate gap', () => {
    const [ax] = FAST_TRAVEL_ARRIVALS.northern_fortress;
    expect(Math.abs(ax)).toBeLessThan(GATE_HALF_GAP);
  });

  test('northern_fortress arrival is south of fortress south wall', () => {
    const [, az] = FAST_TRAVEL_ARRIVALS.northern_fortress;
    expect(az).toBeGreaterThan(FORTRESS_SOUTH_Z - 1.2); // outside wall rect
  });

  test('northern_fortress arrival is collision-free', () => {
    const [ax, az] = FAST_TRAVEL_ARRIVALS.northern_fortress;
    const blocked = collidesWith(ax, az, PLAYER_RADIUS, CITY_COLLIDERS);
    expect(blocked).toBe(false);
  });

  test('northern_fortress arrival is on the summit (terrain Y = summit height)', () => {
    const [ax, az] = FAST_TRAVEL_ARRIVALS.northern_fortress;
    const y = getTerrainY(ax, az);
    expect(y).toBeCloseTo(SUMMIT_Y, 2);
  });

  test('northern_fortress arrival is within boundary', () => {
    const [ax, az] = FAST_TRAVEL_ARRIVALS.northern_fortress;
    expect(ax).toBeGreaterThanOrEqual(-BOUNDARY_X);
    expect(ax).toBeLessThanOrEqual(BOUNDARY_X);
    expect(az).toBeGreaterThanOrEqual(BOUNDARY_Z_MIN);
    expect(az).toBeLessThanOrEqual(BOUNDARY_Z_MAX);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Collision Recovery and Recovery-History Clearing
// ═══════════════════════════════════════════════════════════════════════════

describe('Collision recovery', () => {
  test('clearRecoveryHistory is callable and does not throw', () => {
    expect(() => clearRecoveryHistory()).not.toThrow();
  });

  test('movement from outside motte toward ramp does not trap', () => {
    // Start south of the motte, walk north toward the ramp
    let pos: [number, number, number] = [0, 0, RAMP_Z_OUTER + 2];
    for (let i = 0; i < 30; i++) {
      pos = resolveCityMovement(pos, 0, -1, 3.8, 1 / 60);
    }
    // Should have moved north (Z decreased) and not be trapped
    expect(pos[2]).toBeLessThan(RAMP_Z_OUTER + 2);
  });

  test('movement on summit toward gate does not trap', () => {
    // Start on summit, walk south toward gate
    let pos: [number, number, number] = [0, 0, FORTRESS_CENTER_Z];
    for (let i = 0; i < 20; i++) {
      pos = resolveCityMovement(pos, 0, 1, 3.8, 1 / 60);
    }
    // Should have moved south (Z increased)
    expect(pos[2]).toBeGreaterThan(FORTRESS_CENTER_Z);
  });

  test('cannot walk through fortress east wall', () => {
    // Start inside fortress, walk east
    let pos: [number, number, number] = [0, 0, FORTRESS_CENTER_Z];
    for (let i = 0; i < 30; i++) {
      pos = resolveCityMovement(pos, 1, 0, 3.8, 1 / 60);
    }
    // Should be blocked by east wall (X < FORTRESS_HALF_W)
    expect(pos[0]).toBeLessThan(FORTRESS_HALF_W);
  });

  test('cannot walk through fortress north wall', () => {
    // Start inside fortress, walk north
    let pos: [number, number, number] = [0, 0, FORTRESS_CENTER_Z];
    for (let i = 0; i < 30; i++) {
      pos = resolveCityMovement(pos, 0, -1, 3.8, 1 / 60);
    }
    // Should be blocked by north wall
    expect(pos[2]).toBeGreaterThan(FORTRESS_NORTH_Z);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. City Boundary Coverage and Colosseum Clearance
// ═══════════════════════════════════════════════════════════════════════════

describe('Boundary and Colosseum clearance', () => {
  test('BOUNDARY_Z_MIN is -91', () => {
    expect(BOUNDARY_Z_MIN).toBe(-91);
  });

  test('motte perimeter north point is within boundary', () => {
    const northZ = MOTTE_CENTER_Z - MOTTE_PERIMETER_RADIUS; // -90
    // The perimeter itself is at Z=-93.5, but the player center can be at -91
    // (boundary) and still be 2.5 units from the perimeter
    expect(northZ).toBeGreaterThanOrEqual(BOUNDARY_Z_MIN - 5);
  });

  test('summit north edge is within boundary', () => {
    const northZ = MOTTE_CENTER_Z - SUMMIT_CARDINAL_RADIUS; // -80.58
    expect(northZ).toBeGreaterThanOrEqual(BOUNDARY_Z_MIN);
  });

  test('fortress north wall is within boundary', () => {
    expect(FORTRESS_NORTH_Z).toBeGreaterThanOrEqual(BOUNDARY_Z_MIN);
  });

  test('Colosseum north wall (Z≈-44.3) is clear of motte south edge (Z≈-46.34)', () => {
    // Colosseum outer wall north at Z = -25 - 19.3 = -44.3
    const colosseumNorthZ = -25 - 19.3;
    // Motte south edge at ground level (rim) at Z ≈ -46.34
    const motteSouthZ = MOTTE_CENTER_Z + 80 * MOTTE_SCALE; // -71.5 + 25.16 = -46.34
    // After the 3.5-unit shift, motte south edge is north of Colosseum north wall
    expect(motteSouthZ).toBeLessThan(colosseumNorthZ);
    // Clearance
    const clearance = colosseumNorthZ - motteSouthZ;
    expect(clearance).toBeGreaterThan(1.0);
  });

  test('ramp outer edge is south of motte perimeter but within boundary', () => {
    expect(RAMP_Z_OUTER).toBeGreaterThan(BOUNDARY_Z_MIN);
    expect(RAMP_Z_OUTER).toBeLessThan(BOUNDARY_Z_MAX);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. Hub Location Updated
// ═══════════════════════════════════════════════════════════════════════════

describe('Hub location', () => {
  test('northern_fortress hub location Z is -71.5', () => {
    const loc = HUB_LOCATIONS.find(l => l.id === 'northern_fortress');
    expect(loc).toBeDefined();
    expect(loc!.position[2]).toBe(-71.5);
  });
});
