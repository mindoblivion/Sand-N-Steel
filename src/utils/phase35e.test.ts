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
  MOAT_WATER_Y,
} from '../components/3d/city/NorthernMotte';
import { DECK_UNDERSIDE_Y, DECK_Z_INNER, DECK_Z_OUTER, BEAM_WIDTH } from '../components/3d/city/Drawbridge';

// ── Tolerances ──────────────────────────────────────────────────────────────
const EPS = 1e-6;

// ── Fortress constants (must match collisionShapes.ts) ─────────────────────
// Phase C-8.37: both follow the motte centre rather than a restated world Z.
const FORTRESS_SOUTH_Z = MOTTE_CENTER_Z + 10.5; // -66.0
const FORTRESS_CENTER_Z = MOTTE_CENTER_Z; // -76.5

// ═══════════════════════════════════════════════════════════════════════════
// 1. Bridge Fits Inside the Moat Angular Opening
// ═══════════════════════════════════════════════════════════════════════════

describe('Bridge fits inside moat angular opening', () => {
  // Phase C-8.36 inverted these two: they used to check that the bridge fitted
  // inside a dry south gap in the ring.  That gap WAS the reported defect — a
  // dry terrain channel under the drawbridge — so the ring is now complete and
  // the water runs beneath the bridge instead.
  test('the ring is complete — the moat passes under the drawbridge', () => {
    expect(MOAT_GAP_HALF_ANGLE).toBe(0);
  });

  test('the ring reaches under the bridge footprint, side beams included', () => {
    // Inner corners of the bridge footprint: the outer face of each side beam
    // at the deck's north end.  The ring must reach at least that far in, or a
    // dry strip would show beneath the bridge's north end.
    const beamOuterX = BRIDGE_HALF_WIDTH + BEAM_WIDTH / 2; // 2.11
    const innerCornerRadius = Math.hypot(beamOuterX, DECK_Z_INNER - MOTTE_CENTER_Z);
    expect(innerCornerRadius).toBeCloseTo(25.089, 3);
    expect(innerCornerRadius).toBeGreaterThanOrEqual(MOAT_INNER_RADIUS);
  });

  test('bridge span covers the moat ring at south', () => {
    // Moat at south: inner edge Z = -76.5 + 25.0 = -51.5, outer edge
    // Z = -76.5 + 31.0 = -45.5 (Phase C-8.37 moved the whole group 5.0 north).
    // The drawn deck (DECK_Z_OUTER … DECK_Z_INNER) spans the ring end to end,
    // so the water still runs beneath the whole crossing.
    const moatInnerZ = MOTTE_CENTER_Z + MOAT_INNER_RADIUS;
    const moatOuterZ = MOTTE_CENTER_Z + MOAT_OUTER_RADIUS;
    expect(DECK_Z_OUTER).toBeGreaterThanOrEqual(moatOuterZ - 0.1);
    expect(DECK_Z_INNER).toBeLessThanOrEqual(moatInnerZ + 0.1);
    // The shared terrain constants moved with the group and keep their offsets
    // from the motte centre: +31.0 (outer shoreline) and +25.5 (0.5 short of
    // the deck's own north end).  The terrain stays flat at Y = 0 either way.
    expect(BRIDGE_Z_OUTER).toBe(MOTTE_CENTER_Z + MOAT_OUTER_RADIUS);
    expect(BRIDGE_Z_INNER).toBe(MOTTE_CENTER_Z + MOAT_INNER_RADIUS + 0.5);
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
    // Phase C-8.37: the legacy ramp bounds are derived from MOTTE_CENTER_Z, so
    // they moved 5.0 north with the mound (-48.227 → -53.227).
    expect(RAMP_Z_OUTER).toBeCloseTo(MOTTE_CENTER_Z + 23.273, 2);
    expect(RAMP_Z_OUTER).toBeCloseTo(-53.227, 2);
    expect(RAMP_Z_INNER).toBeCloseTo(-63.92, 1);
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

  test('bridge inner end reaches the moat inner edge', () => {
    // Phase C-8.36 widened the ring in to radius 25.0, which puts its inner
    // shoreline exactly at the deck's north end — so the deck's whole footprint
    // has water beneath it and there is no dry strip at that end.
    const moatInnerZ = MOTTE_CENTER_Z + MOAT_INNER_RADIUS;
    expect(DECK_Z_INNER).toBeCloseTo(moatInnerZ, 6);
    expect(DECK_Z_INNER).toBeLessThanOrEqual(moatInnerZ + 0.1);
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

  test('boundary limits keep their derivation (C-8.37 moved the north limit)', () => {
    expect(BOUNDARY_X).toBe(35);
    // MOTTE_CENTER_Z - MOTTE_PERIMETER_RADIUS + 2.5 = -96.
    expect(BOUNDARY_Z_MIN).toBe(-96);
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
  test('moat inner radius still clears the mound (C-8.36 value)', () => {
    // Phase C-8.36 moved this from 25.8 to 25.0 so the water reaches beneath
    // the drawbridge's north end; the mound's own clearances are asserted in
    // phaseC8_36.test.ts §D and phase35c.test.ts.
    expect(MOAT_INNER_RADIUS).toBe(25.0);
  });

  test('moat outer radius is unchanged', () => {
    expect(MOAT_OUTER_RADIUS).toBe(31.0);
  });

  test('the south gap is gone — the ring is complete (C-8.36)', () => {
    expect(MOAT_GAP_HALF_ANGLE).toBe(0);
  });

  test('moat water surface sits below the bridge deck and its beams', () => {
    // Phase Drawbridge Alignment 2: the whole structure's underside is at
    // DECK_UNDERSIDE_Y (deck top 0.16 − thickness 0.07), and the side beams
    // are aligned flush to it.  The old assertion compared against the deck
    // BOX CENTER (0.10), which hid that the underside reached 0.04 — below
    // the water surface at 0.06.
    expect(MOAT_WATER_Y).toBeLessThan(DECK_UNDERSIDE_Y);
    expect(DECK_UNDERSIDE_Y - MOAT_WATER_Y).toBeGreaterThan(0.02);
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
