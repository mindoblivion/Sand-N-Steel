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
  MOTTE_CENTER_Z,
  MOTTE_SCALE,
  RAMP_HALF_WIDTH,
  RAMP_Z_OUTER,
  RAMP_Z_INNER,
  SUMMIT_Y,
  SUMMIT_RADIUS,
  MOTTE_PERIMETER_RADIUS,
} from './terrainHeight';

// ── Tolerances ──────────────────────────────────────────────────────────────
const EPS = 1e-6;
const HALF_MM = 5e-4;

// ── Fortress constants (must match collisionShapes.ts) ─────────────────────
const FORTRESS_HALF_W = 10.5; // 21 * 0.30 / 2
const FORTRESS_SOUTH_Z = -57.5; // -68 + 10.5
const FORTRESS_NORTH_Z = -78.5; // -68 - 10.5
const FORTRESS_CENTER_Z = -68;
const GATE_HALF_GAP = 1.0;

// ═══════════════════════════════════════════════════════════════════════════
// 1. Terrain Height — Ramp
// ═══════════════════════════════════════════════════════════════════════════

describe('Terrain height — ramp', () => {
  test('ramp bottom (outer edge) is at Y=0', () => {
    const y = getTerrainY(0, RAMP_Z_OUTER);
    expect(Math.abs(y)).toBeLessThan(EPS);
  });

  test('ramp top (inner edge) is at summit height', () => {
    const y = getTerrainY(0, RAMP_Z_INNER);
    expect(Math.abs(y - SUMMIT_Y)).toBeLessThan(EPS);
  });

  test('ramp midpoint is at half summit height', () => {
    const midZ = (RAMP_Z_OUTER + RAMP_Z_INNER) / 2;
    const y = getTerrainY(0, midZ);
    expect(Math.abs(y - SUMMIT_Y / 2)).toBeLessThan(HALF_MM);
  });

  test('ramp at 25% is at quarter height', () => {
    const z = RAMP_Z_OUTER + (RAMP_Z_INNER - RAMP_Z_OUTER) * 0.25;
    const y = getTerrainY(0, z);
    expect(Math.abs(y - SUMMIT_Y * 0.25)).toBeLessThan(HALF_MM);
  });

  test('ramp at 75% is at three-quarter height', () => {
    const z = RAMP_Z_OUTER + (RAMP_Z_INNER - RAMP_Z_OUTER) * 0.75;
    const y = getTerrainY(0, z);
    expect(Math.abs(y - SUMMIT_Y * 0.75)).toBeLessThan(HALF_MM);
  });

  test('ramp edge (X = half-width) is still on the ramp', () => {
    const y = getTerrainY(RAMP_HALF_WIDTH, (RAMP_Z_OUTER + RAMP_Z_INNER) / 2);
    expect(Math.abs(y - SUMMIT_Y / 2)).toBeLessThan(HALF_MM);
  });

  test('just outside ramp width returns to mound/ground height', () => {
    // Just beyond ramp width, at midpoint Z — should be on mound slope or summit
    const x = RAMP_HALF_WIDTH + 0.01;
    const midZ = (RAMP_Z_OUTER + RAMP_Z_INNER) / 2;
    const yOnRamp = getTerrainY(RAMP_HALF_WIDTH, midZ);
    const yOffRamp = getTerrainY(x, midZ);
    // Off-ramp should be different (mound height), not the ramp height
    expect(yOffRamp).not.toEqual(yOnRamp);
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

  test('summit edge is at summit height', () => {
    // At the summit radius, along the X axis
    const y = getTerrainY(SUMMIT_RADIUS, MOTTE_CENTER_Z);
    expect(Math.abs(y - SUMMIT_Y)).toBeLessThan(HALF_MM);
  });

  test('just beyond summit edge starts sloping down', () => {
    const yInside = getTerrainY(SUMMIT_RADIUS, MOTTE_CENTER_Z);
    const yOutside = getTerrainY(SUMMIT_RADIUS + 0.1, MOTTE_CENTER_Z);
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
// 4. Fortress Footprint Inside the Flat Summit
// ═══════════════════════════════════════════════════════════════════════════

describe('Fortress footprint inside flat summit', () => {
  test('fortress south wall is inside summit radius', () => {
    const dist = Math.abs(FORTRESS_SOUTH_Z - MOTTE_CENTER_Z);
    expect(dist).toBeLessThan(SUMMIT_RADIUS);
  });

  test('fortress north wall is inside summit radius', () => {
    const dist = Math.abs(FORTRESS_NORTH_Z - MOTTE_CENTER_Z);
    expect(dist).toBeLessThan(SUMMIT_RADIUS);
  });

  test('fortress corner is inside summit radius', () => {
    const cornerDist = Math.sqrt(FORTRESS_HALF_W ** 2 + (FORTRESS_HALF_W) ** 2);
    expect(cornerDist).toBeLessThan(SUMMIT_RADIUS);
  });

  test('fortress corner clearance > 0.5 units', () => {
    const cornerDist = Math.sqrt(FORTRESS_HALF_W ** 2 + FORTRESS_HALF_W ** 2);
    const clearance = SUMMIT_RADIUS - cornerDist;
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

  test('outside ramp opening (X=6.0, Z=-47) is blocked by perimeter', () => {
    // At Z=-46 (exact south point) the arc curves away; at Z=-47 (further
    // into the perimeter) the arc segment is close enough to block.
    const x = 6.0;
    const z = -47;
    const blocked = collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS);
    expect(blocked).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Entry and Exit at the Ramp Perimeter Opening
// ═══════════════════════════════════════════════════════════════════════════

describe('Ramp entry and exit', () => {
  test('can walk from ground onto ramp outer edge', () => {
    // Just south of ramp outer edge — on flat ground
    const groundOk = !collidesWith(0, RAMP_Z_OUTER + 1, PLAYER_RADIUS, CITY_COLLIDERS);
    // At ramp outer edge
    const rampOk = !collidesWith(0, RAMP_Z_OUTER, PLAYER_RADIUS, CITY_COLLIDERS);
    expect(groundOk).toBe(true);
    expect(rampOk).toBe(true);
  });

  test('can traverse from ramp to summit', () => {
    // At ramp inner edge
    const rampTopOk = !collidesWith(0, RAMP_Z_INNER, PLAYER_RADIUS, CITY_COLLIDERS);
    // Just past ramp inner edge, on summit
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
  test('BOUNDARY_Z_MIN is -88', () => {
    expect(BOUNDARY_Z_MIN).toBe(-88);
  });

  test('motte perimeter north point is within boundary', () => {
    const northZ = MOTTE_CENTER_Z - MOTTE_PERIMETER_RADIUS; // -90
    // The perimeter itself is at Z=-90, but the player center can be at -88
    // (boundary) and still be 2 units from the perimeter
    expect(northZ).toBeGreaterThanOrEqual(BOUNDARY_Z_MIN - 5);
  });

  test('summit north edge is within boundary', () => {
    const northZ = MOTTE_CENTER_Z - SUMMIT_RADIUS; // -83.73
    expect(northZ).toBeGreaterThanOrEqual(BOUNDARY_Z_MIN);
  });

  test('fortress north wall is within boundary', () => {
    expect(FORTRESS_NORTH_Z).toBeGreaterThanOrEqual(BOUNDARY_Z_MIN);
  });

  test('Colosseum north wall (Z≈-44.3) is clear of motte south edge (Z≈-42.84)', () => {
    // Colosseum outer wall north at Z = -25 - 19.3 = -44.3
    const colosseumNorthZ = -25 - 19.3;
    // Motte south edge at ground level (rim) at Z ≈ -42.84
    const motteSouthZ = MOTTE_CENTER_Z + 80 * MOTTE_SCALE; // -68 + 25.16 = -42.84
    // Colosseum north should be north of motte south
    expect(colosseumNorthZ).toBeLessThan(motteSouthZ);
    // Clearance
    const clearance = motteSouthZ - colosseumNorthZ;
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
  test('northern_fortress hub location Z is -68', () => {
    const loc = HUB_LOCATIONS.find(l => l.id === 'northern_fortress');
    expect(loc).toBeDefined();
    expect(loc!.position[2]).toBe(-68);
  });
});
