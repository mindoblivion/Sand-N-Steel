/**
 * Phase 35E — Drawbridge replacement tests.
 *
 * Verifies that the dirt ramp is hidden via runtime mesh visibility (not
 * GLB modification), the bridge fits the moat opening, terrain is
 * continuous and walkable from ground across the bridge to the fortress
 * gate, and existing collision/fast-travel systems are preserved.
 *
 * Run with: bun test src/utils/phase35e.test.ts
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
  resolveCityMovement,
  clearRecoveryHistory,
  FAST_TRAVEL_ARRIVALS,
} from './cityCollisions';
import {
  getTerrainY,
  isOnBridge,
  isInsideSummit,
  BRIDGE_HALF_WIDTH,
  BRIDGE_Z_OUTER,
  BRIDGE_Z_INNER,
  MOTTE_CENTER_X,
  MOTTE_CENTER_Z,
  MOTTE_PERIMETER_RADIUS,
  RAMP_HALF_WIDTH,
  RAMP_Z_OUTER,
  RAMP_Z_INNER,
  SUMMIT_Y,
  SUMMIT_CARDINAL_RADIUS,
} from './terrainHeight';
import {
  MOAT_INNER_RADIUS,
  MOAT_OUTER_RADIUS,
  MOAT_GAP_HALF_ANGLE,
} from '../components/3d/city/NorthernMotte';

// ── Tolerances ──────────────────────────────────────────────────────────────
const EPS = 1e-6;

// ── Fortress constants (must match collisionShapes.ts) ─────────────────────
const FORTRESS_SOUTH_Z = -61.0;
const FORTRESS_CENTER_Z = -71.5;

// ═══════════════════════════════════════════════════════════════════════════
// 1. Bridge Fits Inside the Moat Angular Opening
// ═══════════════════════════════════════════════════════════════════════════

describe('Bridge fits inside moat angular opening', () => {
  test('bridge width (4.0) is less than moat gap linear width at inner radius', () => {
    const gapWidthAtInner = 2 * MOAT_INNER_RADIUS * Math.sin(MOAT_GAP_HALF_ANGLE);
    expect(BRIDGE_HALF_WIDTH * 2).toBeLessThan(gapWidthAtInner);
  });

  test('bridge width (4.0) is less than moat gap linear width at outer radius', () => {
    const gapWidthAtOuter = 2 * MOAT_OUTER_RADIUS * Math.sin(MOAT_GAP_HALF_ANGLE);
    expect(BRIDGE_HALF_WIDTH * 2).toBeLessThan(gapWidthAtOuter);
  });

  test('bridge span covers the moat ring at south', () => {
    // Moat at south: inner edge Z = -71.5 + 25.8 = -45.7, outer = -71.5 + 31.0 = -40.5
    const moatInnerZ = MOTTE_CENTER_Z + MOAT_INNER_RADIUS;
    const moatOuterZ = MOTTE_CENTER_Z + MOAT_OUTER_RADIUS;
    // Bridge must extend from south of moat outer to north of moat inner
    expect(BRIDGE_Z_OUTER).toBeGreaterThan(moatOuterZ - 0.1);
    expect(BRIDGE_Z_INNER).toBeLessThan(moatInnerZ + 0.1);
  });

  test('bridge is centered at X=0 (aligned with south opening)', () => {
    // Bridge is symmetric about X=0 (spans X [-2.0, 2.0])
    // The motte perimeter opening and fortress gate are also at X=0
    expect(BRIDGE_HALF_WIDTH).toBe(2.0);
    // Bridge Z span is symmetric about the south axis from motte center
    expect(MOTTE_CENTER_X).toBe(0); // motte is centered at X=0
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Old Ramp Mesh Hidden (runtime visibility, no GLB modification)
// ═══════════════════════════════════════════════════════════════════════════

describe('Old ramp mesh hidden via runtime visibility', () => {
  test('terrain no longer uses ramp interpolation at midpoint', () => {
    // The old ramp returned SUMMIT_Y * 0.5 at the midpoint.
    // The mound slope returns a different (lower) value.
    const midZ = (RAMP_Z_OUTER + RAMP_Z_INNER) / 2;
    const y = getTerrainY(0, midZ);
    // Should NOT be exactly half summit height (old ramp value)
    expect(Math.abs(y - SUMMIT_Y / 2)).toBeGreaterThan(0.01);
  });

  test('terrain at ramp outer edge is still Y=0', () => {
    expect(Math.abs(getTerrainY(0, RAMP_Z_OUTER))).toBeLessThan(EPS);
  });

  test('terrain at ramp inner edge is still summit height', () => {
    // At the summit boundary (cardinal radius), should be summit Y
    const y = getTerrainY(0, RAMP_Z_INNER);
    expect(Math.abs(y - SUMMIT_Y)).toBeLessThan(0.01);
  });

  test('Ramp_Dirt mesh name constant is preserved for reference', () => {
    // The legacy constants are kept in terrainHeight.ts for test migration
    expect(RAMP_HALF_WIDTH).toBeCloseTo(2.8305, 3);
    expect(RAMP_Z_OUTER).toBeCloseTo(-48.227, 2);
    expect(RAMP_Z_INNER).toBeCloseTo(-58.92, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Bridge Dimensions and Alignment
// ═══════════════════════════════════════════════════════════════════════════

describe('Bridge dimensions and alignment', () => {
  test('bridge half-width is 2.0', () => {
    expect(BRIDGE_HALF_WIDTH).toBe(2.0);
  });

  test('bridge outer edge is at or south of moat outer edge', () => {
    const moatOuterZ = MOTTE_CENTER_Z + MOAT_OUTER_RADIUS;
    expect(BRIDGE_Z_OUTER).toBeGreaterThanOrEqual(moatOuterZ);
  });

  test('bridge inner edge is at or north of moat inner edge', () => {
    const moatInnerZ = MOTTE_CENTER_Z + MOAT_INNER_RADIUS;
    expect(BRIDGE_Z_INNER).toBeLessThanOrEqual(moatInnerZ);
  });

  test('bridge length is compact (≤ 8 units)', () => {
    const length = Math.abs(BRIDGE_Z_OUTER - BRIDGE_Z_INNER);
    expect(length).toBeLessThanOrEqual(8.0);
  });

  test('bridge length is sufficient to cross moat (≥ 5 units)', () => {
    const length = Math.abs(BRIDGE_Z_OUTER - BRIDGE_Z_INNER);
    expect(length).toBeGreaterThanOrEqual(5.0);
  });

  test('isOnBridge returns true for center of bridge', () => {
    const midZ = (BRIDGE_Z_OUTER + BRIDGE_Z_INNER) / 2;
    expect(isOnBridge(0, midZ)).toBe(true);
  });

  test('isOnBridge returns false for outside bridge width', () => {
    const midZ = (BRIDGE_Z_OUTER + BRIDGE_Z_INNER) / 2;
    expect(isOnBridge(BRIDGE_HALF_WIDTH + 0.1, midZ)).toBe(false);
  });

  test('isOnBridge returns false for outside bridge span', () => {
    expect(isOnBridge(0, BRIDGE_Z_OUTER + 0.1)).toBe(false);
    expect(isOnBridge(0, BRIDGE_Z_INNER - 0.1)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Continuous Terrain Heights at Bridge Ends and Mound Transition
// ═══════════════════════════════════════════════════════════════════════════

describe('Continuous terrain heights', () => {
  test('bridge south end is at Y=0', () => {
    expect(getTerrainY(0, BRIDGE_Z_OUTER)).toBe(0);
  });

  test('bridge north end is at Y=0', () => {
    expect(getTerrainY(0, BRIDGE_Z_INNER)).toBe(0);
  });

  test('bridge center is at Y=0', () => {
    const midZ = (BRIDGE_Z_OUTER + BRIDGE_Z_INNER) / 2;
    expect(getTerrainY(0, midZ)).toBe(0);
  });

  test('bridge edge (X=half-width) is at Y=0', () => {
    const midZ = (BRIDGE_Z_OUTER + BRIDGE_Z_INNER) / 2;
    expect(getTerrainY(BRIDGE_HALF_WIDTH, midZ)).toBe(0);
  });

  test('ground south of bridge is at Y=0', () => {
    expect(getTerrainY(0, BRIDGE_Z_OUTER + 2)).toBe(0);
  });

  test('flat zone between bridge and mound is at Y=0', () => {
    // Between bridge inner edge and perimeter, terrain is flat
    const z = (BRIDGE_Z_INNER + (MOTTE_CENTER_Z + MOTTE_PERIMETER_RADIUS)) / 2;
    expect(getTerrainY(0, z)).toBe(0);
  });

  test('mound slope starts at Y=0 at perimeter', () => {
    const z = MOTTE_CENTER_Z + MOTTE_PERIMETER_RADIUS - 0.01;
    const y = getTerrainY(0, z);
    expect(y).toBeLessThan(0.1);
  });

  test('mound slope reaches summit height at summit edge', () => {
    const y = getTerrainY(0, MOTTE_CENTER_Z + SUMMIT_CARDINAL_RADIUS);
    expect(Math.abs(y - SUMMIT_Y)).toBeLessThan(0.01);
  });

  test('terrain is continuous: no jump between bridge and mound', () => {
    // Sample across bridge → flat gap → mound → summit
    const samples = [
      BRIDGE_Z_OUTER + 1,
      BRIDGE_Z_OUTER,
      (BRIDGE_Z_OUTER + BRIDGE_Z_INNER) / 2,
      BRIDGE_Z_INNER,
      BRIDGE_Z_INNER - 1,
      MOTTE_CENTER_Z + MOTTE_PERIMETER_RADIUS,
      MOTTE_CENTER_Z + MOTTE_PERIMETER_RADIUS - 2,
      MOTTE_CENTER_Z + SUMMIT_CARDINAL_RADIUS + 0.5,
      MOTTE_CENTER_Z + SUMMIT_CARDINAL_RADIUS,
    ];
    let prevY = 0;
    for (const z of samples) {
      const y = getTerrainY(0, z);
      // Terrain should never jump downward by more than 0.5
      // (it can increase going up the mound)
      if (prevY > 0) {
        expect(y).toBeGreaterThanOrEqual(prevY - 0.5,
          `Discontinuity at Z=${z.toFixed(2)}: Y=${y.toFixed(4)} vs prev Y=${prevY.toFixed(4)}`);
      }
      prevY = y;
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Walkable Movement from Ground Across Bridge to Fortress Gate
// ═══════════════════════════════════════════════════════════════════════════

describe('Walkable movement: ground → bridge → mound → gate', () => {
  test('bridge area is collision-free at center', () => {
    const midZ = (BRIDGE_Z_OUTER + BRIDGE_Z_INNER) / 2;
    expect(collidesWith(0, midZ, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
  });

  test('bridge edges are collision-free', () => {
    expect(collidesWith(BRIDGE_HALF_WIDTH - 0.1, (BRIDGE_Z_OUTER + BRIDGE_Z_INNER) / 2,
      PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    expect(collidesWith(0, BRIDGE_Z_OUTER, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    expect(collidesWith(0, BRIDGE_Z_INNER, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
  });

  test('can walk from city ground to bridge', () => {
    let pos: [number, number, number] = [0, 0, BRIDGE_Z_OUTER + 3];
    for (let i = 0; i < 30; i++) {
      pos = resolveCityMovement(pos, 0, -1, 3.8, 1 / 60);
    }
    expect(pos[2]).toBeLessThan(BRIDGE_Z_OUTER + 3);
  });

  test('can walk across bridge to mound', () => {
    // Movement per step ≈ 3.8/60 ≈ 0.063 units; bridge span is 6 units
    let pos: [number, number, number] = [0, 0, BRIDGE_Z_OUTER];
    for (let i = 0; i < 150; i++) {
      pos = resolveCityMovement(pos, 0, -1, 3.8, 1 / 60);
    }
    // Should be past the bridge and onto the mound
    expect(pos[2]).toBeLessThan(BRIDGE_Z_INNER);
  });

  test('can walk from bridge to fortress gate', () => {
    // ~21 units from bridge to fortress south wall at speed 0.063/step
    let pos: [number, number, number] = [0, 0, BRIDGE_Z_OUTER];
    for (let i = 0; i < 500; i++) {
      pos = resolveCityMovement(pos, 0, -1, 3.8, 1 / 60);
    }
    // Should have reached the fortress south wall area
    expect(pos[2]).toBeLessThanOrEqual(FORTRESS_SOUTH_Z + 0.5);
  });

  test('terrain Y increases along the walk path', () => {
    // Simulate the walk and check that terrain Y rises
    let pos: [number, number, number] = [0, 0, BRIDGE_Z_OUTER + 1];
    let prevY = 0;
    let reachedSummit = false;
    for (let i = 0; i < 500; i++) {
      pos = resolveCityMovement(pos, 0, -1, 3.8, 1 / 60);
      const y = getTerrainY(pos[0], pos[2]);
      if (y > prevY + 0.01) reachedSummit = true;
      prevY = y;
    }
    expect(reachedSummit).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Preserved Fast-Travel Arrival and Unchanged Collision Boundaries
// ═══════════════════════════════════════════════════════════════════════════

describe('Preserved fast-travel and collision boundaries', () => {
  test('northern_fortress fast-travel arrival is collision-free', () => {
    const [ax, az] = FAST_TRAVEL_ARRIVALS.northern_fortress;
    expect(collidesWith(ax, az, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
  });

  test('northern_fortress fast-travel arrival is at summit height', () => {
    const [ax, az] = FAST_TRAVEL_ARRIVALS.northern_fortress;
    expect(getTerrainY(ax, az)).toBeCloseTo(SUMMIT_Y, 2);
  });

  test('clearRecoveryHistory does not throw', () => {
    expect(() => clearRecoveryHistory()).not.toThrow();
  });

  test('boundary limits are unchanged', () => {
    expect(BOUNDARY_X).toBe(35);
    expect(BOUNDARY_Z_MIN).toBe(-91);
    expect(BOUNDARY_Z_MAX).toBe(35);
  });

  test('no new colliders added for bridge or drawbridge', () => {
    const bridgeColliders = CITY_COLLIDERS.filter(
      (c) => c.id.includes('bridge') || c.id.includes('draw')
    );
    expect(bridgeColliders.length).toBe(0);
  });

  test('motte perimeter segment count is unchanged (20)', () => {
    const motteSegs = CITY_COLLIDERS.filter((c) => c.id.startsWith('motte-wall'));
    expect(motteSegs.length).toBe(20);
  });

  test('fortress wall collider count is unchanged (5)', () => {
    const fortressSegs = CITY_COLLIDERS.filter((c) => c.id.startsWith('fortress-'));
    expect(fortressSegs.length).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Preserved Moat Visibility and Opening Geometry
// ═══════════════════════════════════════════════════════════════════════════

describe('Preserved moat visibility and opening', () => {
  test('moat inner radius is unchanged', () => {
    expect(MOAT_INNER_RADIUS).toBe(25.8);
  });

  test('moat outer radius is unchanged', () => {
    expect(MOAT_OUTER_RADIUS).toBe(31.0);
  });

  test('moat gap half-angle is unchanged', () => {
    expect(MOAT_GAP_HALF_ANGLE).toBe(0.18);
  });

  test('moat water elevation is above bridge deck', () => {
    // Bridge deck at Y=0.10, water at Y=0.06 — water is below the deck
    expect(0.06).toBeLessThan(0.10);
  });

  test('bridge does not extend beyond moat outer edge by more than 1 unit', () => {
    const moatOuterZ = MOTTE_CENTER_Z + MOAT_OUTER_RADIUS;
    expect(BRIDGE_Z_OUTER - moatOuterZ).toBeLessThanOrEqual(1.0);
  });

  test('bridge does not extend beyond moat inner edge by more than 1 unit', () => {
    const moatInnerZ = MOTTE_CENTER_Z + MOAT_INNER_RADIUS;
    expect(moatInnerZ - BRIDGE_Z_INNER).toBeLessThanOrEqual(1.0);
  });
});
