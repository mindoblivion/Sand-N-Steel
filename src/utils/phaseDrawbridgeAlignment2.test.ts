/**
 * Phase Drawbridge Alignment 2 — northern drawbridge deck alignment tests.
 *
 * Run with: bun test src/utils/phaseDrawbridgeAlignment2.test.ts
 *
 * Background
 * ----------
 * Phase Motte-Terrain Alignment 1 matched gameplay terrain to the rendered
 * mound.  This phase aligns the wooden drawbridge deck with that visible
 * geometry: the deck's north end stopped short of the motte's southern grass
 * rim (a 0.34-unit gap), and the structure's underside reached Y = 0.04 —
 * below the visible moat water surface at Y = 0.06.
 *
 * Measured targets, sampled from the shipping asset
 * public/_workspace_motte_normals.glb (world transform position [0,0,-71.5],
 * scale 0.3145, top surface ray-sampled along X = 0):
 *
 *   Motte_Grass southern rim       Z = -46.34, surface Y = 0.00
 *   Grass surface crosses Y = 0    Z = -52.00 (the rising slope starts there)
 *   Visible moat water surface     Y = 0.06    (ring, MOAT_WATER_Y)
 *   Moat ring at south             Z = -45.70 (inner) → -40.50 (outer)
 *
 * The deck's real geometry is validated through its exported transform and
 * dimension constants rather than by searching the source for numbers: the
 * deck box is DECK_LENGTH deep inside a group at DECK_CENTER_Z, so its world
 * ends are DECK_CENTER_Z ∓ DECK_LENGTH / 2, and its surfaces are
 * DECK_TOP_Y / DECK_UNDERSIDE_Y.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import {
  DECK_TOP_Y,
  DECK_THICKNESS,
  DECK_UNDERSIDE_Y,
  DECK_Z_OUTER,
  DECK_Z_INNER,
  DECK_LENGTH,
  DECK_CENTER_Z,
  BEAM_HEIGHT,
  HINGE_RAISE,
  HINGE_RADIUS,
  DECK_Y,
} from '../components/3d/city/Drawbridge';
import {
  MOAT_WATER_Y,
  MOAT_INNER_RADIUS,
  MOAT_OUTER_RADIUS,
} from '../components/3d/city/NorthernMotte';
import {
  getTerrainY,
  isOnBridge,
  BRIDGE_HALF_WIDTH,
  BRIDGE_Z_OUTER,
  BRIDGE_Z_INNER,
  SUMMIT_Y,
  SUMMIT_SLOPE_FOOT_SCALE,
  SUMMIT_SLOPE_FOOT_RADIUS,
  MOTTE_CENTER_X,
  MOTTE_CENTER_Z,
  MOTTE_PERIMETER_RADIUS,
} from './terrainHeight';
import { PLAYER_RADIUS, CITY_COLLIDERS, collidesWith } from './collisionShapes';
import {
  BOUNDARY_X,
  BOUNDARY_Z_MIN,
  BOUNDARY_Z_MAX,
  resolveCityMovement,
  FAST_TRAVEL_ARRIVALS,
} from './cityCollisions';

// ── Tolerances ──────────────────────────────────────────────────────────────
const EPS = 1e-6;

// ── Measured references (shipping asset, sampled along X = 0) ───────────────
// Phase C-8.37: the mesh moved 5.0 north with the northern group, so both
// measured landmarks are stated relative to the motte centre (the south rim is
// the mesh's own 80 × 0.3145 = 25.16 base ring; the slope leaves Y = 0 at the
// visible foot, 19.499 out).
const MOTTE_GRASS_SOUTH_RIM_Z = MOTTE_CENTER_Z + 25.16; // -51.34
const MOTTE_GRASS_RIM_Y = 0.0; // its surface height
const MOTTE_SLOPE_ABOVE_GROUND_Z = MOTTE_CENTER_Z + 19.5; // -57.0

// ── Recorded pre-phase deck values (Phase 35E) ──────────────────────────────
const PHASE_35E_DECK_TOP_Y = 0.16;
const PHASE_35E_DECK_UNDERSIDE_Y = 0.04;

// ── Fortress reference (must match collisionShapes.ts) ─────────────────────
const FORTRESS_SOUTH_Z = MOTTE_CENTER_Z + 10.5; // -66.0 (C-8.37)

// ═══════════════════════════════════════════════════════════════════════════
// 1. The deck reaches the motte approach with no geometric gap
// ═══════════════════════════════════════════════════════════════════════════

describe('Deck reaches the motte approach (no gap)', () => {
  test('deck north end reaches the measured grass rim', () => {
    expect(DECK_Z_INNER).toBeLessThanOrEqual(MOTTE_GRASS_SOUTH_RIM_Z);
  });

  test('deck overlaps the rim only slightly (≤ 0.5 units)', () => {
    const overlap = MOTTE_GRASS_SOUTH_RIM_Z - DECK_Z_INNER;
    expect(overlap).toBeGreaterThan(0);
    expect(overlap).toBeLessThanOrEqual(0.5);
  });

  test('deck box transform puts its ends at DECK_Z_INNER / DECK_Z_OUTER', () => {
    // The deck box is DECK_LENGTH deep, centered in the group at DECK_CENTER_Z.
    expect(DECK_CENTER_Z - DECK_LENGTH / 2).toBeCloseTo(DECK_Z_INNER, 10);
    expect(DECK_CENTER_Z + DECK_LENGTH / 2).toBeCloseTo(DECK_Z_OUTER, 10);
  });

  test('deck spans the grass rim in plan', () => {
    expect(DECK_Z_INNER).toBeLessThanOrEqual(MOTTE_GRASS_SOUTH_RIM_Z);
    expect(DECK_Z_OUTER).toBeGreaterThan(MOTTE_GRASS_SOUTH_RIM_Z);
  });

  test('deck stays south of the rising mound slope (no unnecessary clipping)', () => {
    // The mound surface only leaves Y = 0 at Z = -52.00; the deck must not
    // reach into it.
    expect(DECK_Z_INNER).toBeGreaterThan(MOTTE_SLOPE_ABOVE_GROUND_Z);
    expect(DECK_Z_INNER - MOTTE_SLOPE_ABOVE_GROUND_Z).toBeGreaterThan(1.0);
  });

  test('deck underside stays above the rim surface where it overlaps', () => {
    // The grass rim is flat at Y = 0.00 (measured), so the deck hovers over
    // it rather than intersecting the mesh.
    expect(MOTTE_GRASS_RIM_Y).toBeLessThan(DECK_UNDERSIDE_Y);
    expect(getTerrainY(0, DECK_Z_INNER)).toBe(0);
  });

  test('the previous north end left a measured gap (defect fixed)', () => {
    // Phase 35E ended the deck at BRIDGE_Z_INNER (-46.0), 0.34 south of the
    // rim.  The shipped deck must now cover that gap.
    const gapBefore = BRIDGE_Z_INNER - MOTTE_GRASS_SOUTH_RIM_Z;
    expect(gapBefore).toBeGreaterThan(0.3);
    expect(DECK_Z_INNER).toBeLessThan(BRIDGE_Z_INNER);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Vertical relationship to the moat water surface
// ═══════════════════════════════════════════════════════════════════════════

describe('Deck and support geometry sit above the water surface', () => {
  test('deck underside clears the visible water surface', () => {
    expect(DECK_UNDERSIDE_Y).toBeGreaterThan(MOAT_WATER_Y);
  });

  test('the clearance is small (no free-floating deck)', () => {
    const clearance = DECK_UNDERSIDE_Y - MOAT_WATER_Y;
    expect(clearance).toBeGreaterThan(0.02);
    expect(clearance).toBeLessThan(0.06);
  });

  test('the pre-phase underside did intersect the water (defect)', () => {
    expect(PHASE_35E_DECK_UNDERSIDE_Y).toBeLessThan(MOAT_WATER_Y);
  });

  test('deck top (walking surface) is unchanged by this phase', () => {
    expect(DECK_TOP_Y).toBeCloseTo(PHASE_35E_DECK_TOP_Y, 10);
    expect(DECK_TOP_Y).toBeCloseTo(DECK_UNDERSIDE_Y + DECK_THICKNESS, 10);
  });

  test('side beams are aligned flush under the deck and clear the water', () => {
    // Beam bottom = DECK_UNDERSIDE_Y (the component places each beam's center
    // at DECK_UNDERSIDE_Y + BEAM_HEIGHT / 2); deck top = deck bottom + height.
    const beamBottom = DECK_UNDERSIDE_Y;
    const beamTop = DECK_UNDERSIDE_Y + BEAM_HEIGHT;
    expect(beamBottom).toBeGreaterThan(MOAT_WATER_Y);
    expect(beamTop).toBeGreaterThan(DECK_UNDERSIDE_Y);
    expect(DECK_TOP_Y).toBeLessThan(beamTop);
  });

  test('iron hinges clear the water surface too', () => {
    const hingeCenter = DECK_Y + HINGE_RAISE;
    const hingeBottom = hingeCenter - HINGE_RADIUS;
    expect(hingeBottom).toBeGreaterThan(MOAT_WATER_Y);
  });

  test('the deck sits over the moat ring without covering its water', () => {
    // The deck spans the moat radially without overrunning the outer edge.
    const moatOuterZ = MOTTE_CENTER_Z + MOAT_OUTER_RADIUS;
    expect(DECK_Z_OUTER).toBeGreaterThanOrEqual(moatOuterZ - EPS);
    expect(DECK_Z_OUTER - moatOuterZ).toBeLessThanOrEqual(1.0);
    // Inner end stays within a unit of the moat's inner edge.
    const moatInnerZ = MOTTE_CENTER_Z + MOAT_INNER_RADIUS;
    expect(moatInnerZ - DECK_Z_INNER).toBeLessThanOrEqual(1.0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Still connected to the flat southern approach
// ═══════════════════════════════════════════════════════════════════════════

describe('Deck stays connected to the southern approach', () => {
  test('deck south end is unchanged (city-approach side)', () => {
    expect(DECK_Z_OUTER).toBe(BRIDGE_Z_OUTER);
  });

  test('terrain across the whole deck span is flat at Y = 0', () => {
    for (let z = DECK_Z_OUTER; z >= DECK_Z_INNER; z -= 0.25) {
      expect(getTerrainY(0, z)).toBe(0);
      expect(getTerrainY(BRIDGE_HALF_WIDTH, z)).toBe(0);
      expect(getTerrainY(-BRIDGE_HALF_WIDTH, z)).toBe(0);
    }
  });

  test('flat ground continues from the city approach to the slope foot', () => {
    for (let z = DECK_Z_OUTER + 3; z >= MOTTE_CENTER_Z + SUMMIT_SLOPE_FOOT_RADIUS; z -= 0.5) {
      expect(getTerrainY(0, z)).toBe(0);
    }
  });

  test('walking from the city across the deck reaches the fortress gate', () => {
    let pos: [number, number, number] = [0, 0, DECK_Z_OUTER + 3];
    for (let i = 0; i < 600; i++) {
      pos = resolveCityMovement(pos, 0, -1, 3.8, 1 / 60);
    }
    expect(pos[2]).toBeLessThan(DECK_Z_INNER);
    expect(pos[2]).toBeLessThanOrEqual(FORTRESS_SOUTH_Z + 0.5);
  });

  test('the deck footprint is collision-free (walkable)', () => {
    for (let z = DECK_Z_OUTER; z >= DECK_Z_INNER; z -= 0.5) {
      expect(collidesWith(0, z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. getTerrainY is unchanged by this phase (terrain constants untouched)
// ═══════════════════════════════════════════════════════════════════════════

describe('getTerrainY unchanged by the deck alignment', () => {
  test('shared bridge constants keep their offsets from the motte centre', () => {
    // Phase C-8.37 moved both ends with the group; the +31.0 (outer shoreline)
    // and +25.5 (0.5 short of the deck's own north end) offsets are unchanged.
    expect(BRIDGE_Z_OUTER).toBe(MOTTE_CENTER_Z + 31.0);
    expect(BRIDGE_Z_INNER).toBe(MOTTE_CENTER_Z + 25.5);
    expect(BRIDGE_Z_OUTER).toBe(-45.5);
    expect(BRIDGE_Z_INNER).toBe(-51.0);
    expect(BRIDGE_HALF_WIDTH).toBe(2.0);
    expect(isOnBridge(0, (BRIDGE_Z_OUTER + BRIDGE_Z_INNER) / 2)).toBe(true);
  });

  test('the extended deck region is flat ground, not a terrain change', () => {
    // The extension lies beyond the shared isOnBridge region; terrain there is
    // city ground (Y = 0) either way, so nothing about the route changes.
    expect(isOnBridge(0, DECK_Z_INNER)).toBe(false);
    expect(getTerrainY(0, DECK_Z_INNER)).toBe(0);
    expect(getTerrainY(0, (BRIDGE_Z_INNER + DECK_Z_INNER) / 2)).toBe(0);
  });

  test('measured motte slope samples still match getTerrainY', () => {
    // Mesh samples shifted 5.0 north with the mound (C-8.37); heights unchanged.
    const samples: Array<[number, number]> = [
      [-57.5, 0.3402],
      [-58.0, 0.6811],
      [-59.0, 1.3630],
      [-60.0, 2.0448],
      [-64.0, 4.7175],
    ];
    for (const [z, meshY] of samples) {
      expect(Math.abs(getTerrainY(0, z) - meshY)).toBeLessThan(0.01,
        `Z=${z}: terrain Y=${getTerrainY(0, z).toFixed(4)} vs mesh ${meshY}`);
    }
  });

  test('terrain only rises north of the slope foot', () => {
    expect(getTerrainY(0, MOTTE_SLOPE_ABOVE_GROUND_Z)).toBe(0);
    expect(getTerrainY(0, MOTTE_SLOPE_ABOVE_GROUND_Z - 0.25)).toBeGreaterThan(0);
  });

  test('summit and slope-foot geometry are unchanged', () => {
    expect(SUMMIT_Y).toBeCloseTo(4.7175, 6);
    expect(SUMMIT_SLOPE_FOOT_SCALE).toBe(1.55);
    expect(SUMMIT_SLOPE_FOOT_RADIUS).toBeCloseTo(19.499, 3);
    expect(getTerrainY(MOTTE_CENTER_X, MOTTE_CENTER_Z)).toBe(SUMMIT_Y);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Collision perimeter, fortress navigation and world bounds unchanged
// ═══════════════════════════════════════════════════════════════════════════

describe('Collision, navigation and bounds unchanged', () => {
  test('collision perimeter radius is unchanged and no bridge colliders exist', () => {
    expect(MOTTE_PERIMETER_RADIUS).toBe(22.0);
    expect(CITY_COLLIDERS.filter((c) => /bridge|draw/i.test(c.id)).length).toBe(0);
  });

  test('motte perimeter and fortress collider counts are unchanged', () => {
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('motte-wall')).length).toBe(20);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('fortress-')).length).toBe(5);
  });

  test('fortress fast-travel arrival is unchanged and still walkable', () => {
    const [ax, az] = FAST_TRAVEL_ARRIVALS.northern_fortress;
    expect(getTerrainY(ax, az)).toBeCloseTo(SUMMIT_Y, 2);
    expect(collidesWith(ax, az, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
  });

  test('world boundary constants keep their derivation (north limit moved)', () => {
    expect(BOUNDARY_X).toBe(35);
    // MOTTE_CENTER_Z - MOTTE_PERIMETER_RADIUS + 2.5 = -96 (C-8.37).
    expect(BOUNDARY_Z_MIN).toBe(-96);
    expect(BOUNDARY_Z_MAX).toBe(35);
  });
});
