/**
 * Phase 35C — Moat water ring placement tests.
 *
 * Verifies the water ring's world-space placement, ramp opening alignment,
 and non-interference with the existing movement/collision system.
 *
 * Run with: bun test src/utils/phase35c.test.ts
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import {
  MOAT_INNER_RADIUS,
  MOAT_OUTER_RADIUS,
  MOAT_WATER_Y,
  MOAT_GAP_HALF_ANGLE,
} from '../components/3d/city/NorthernMotte';
import {
  MOTTE_CENTER_X,
  MOTTE_CENTER_Z,
  MOTTE_PERIMETER_RADIUS,
  RAMP_HALF_WIDTH,
  RAMP_Z_OUTER,
  SUMMIT_Y,
  MOTTE_SCALE,
} from './terrainHeight';
import { CITY_COLLIDERS } from './collisionShapes';
import { resolveCityMovement } from './cityCollisions';

describe('Phase 35C — Moat water ring placement', () => {
  test('inner radius clears the rendered mound the water plane could cut', () => {
    // Phase C-8.36 rebased this assertion.  It used to compare against the
    // mesh's 25.16 flange footprint (80 model units x MOTTE_SCALE), which
    // Phase C-8.35 sank below the ground plane; the mound's rendered surface
    // now ends at its foot/skirt.  Measured on the shipping asset after that
    // burial (phaseC8_36.test.ts §D): the motte's surface is above the water
    // plane (Y = 0.06) out to radius 24.456 and its visible silhouette — where
    // the buried skirt crosses the ground plane — reaches 24.666 on the
    // diagonals.  The ring's inner edge must stay outside both, or the water
    // would visibly cut the mound's base.
    expect(MOAT_INNER_RADIUS).toBeGreaterThan(24.666);
  });

  test('inner radius is outside the collision perimeter', () => {
    expect(MOAT_INNER_RADIUS).toBeGreaterThan(MOTTE_PERIMETER_RADIUS);
  });

  test('outer radius creates a visible moat width', () => {
    const moatWidth = MOAT_OUTER_RADIUS - MOAT_INNER_RADIUS;
    expect(moatWidth).toBeGreaterThanOrEqual(3.0);
    expect(moatWidth).toBeLessThanOrEqual(8.0);
  });

  test('water elevation is above ground and below motte summit', () => {
    expect(MOAT_WATER_Y).toBeGreaterThan(0);
    expect(MOAT_WATER_Y).toBeLessThan(SUMMIT_Y);
  });

  test('water elevation has enough clearance from ground to avoid z-fighting', () => {
    expect(MOAT_WATER_Y).toBeGreaterThanOrEqual(0.03);
  });

  test('the complete ring still cannot obstruct the ramp opening', () => {
    // Phase C-8.36 removed the south gap (the dry channel under the
    // drawbridge), so the ring is a complete annulus.  It is still entirely
    // outside the collision perimeter — the ramp opening's half-angle works out
    // to atan((RAMP_HALF_WIDTH + 0.4) / MOTTE_PERIMETER_RADIUS) ≈ 0.146 rad —
    // so the water plane never reaches the opening the player walks through,
    // and it carries no colliders of its own (asserted below).
    const collisionOpeningHalf = Math.atan(
      (RAMP_HALF_WIDTH + 0.4) / MOTTE_PERIMETER_RADIUS
    );
    expect(collisionOpeningHalf).toBeGreaterThan(0);
    expect(MOAT_INNER_RADIUS).toBeGreaterThan(MOTTE_PERIMETER_RADIUS);
    expect(MOAT_GAP_HALF_ANGLE).toBe(0);
  });

  test('gap half-angle is not excessively wide', () => {
    // Should not exceed ~30 degrees (0.52 rad) to keep the moat visually enclosing
    expect(MOAT_GAP_HALF_ANGLE).toBeLessThanOrEqual(0.52);
  });

  test('water ring does not overlap the ramp outer edge', () => {
    // Ramp outer edge is at Z = RAMP_Z_OUTER (-44.73), distance from motte center
    const rampOuterDist = Math.abs(RAMP_Z_OUTER - MOTTE_CENTER_Z);
    // The water ring inner radius should be beyond the ramp outer extent
    expect(MOAT_INNER_RADIUS).toBeGreaterThan(rampOuterDist);
  });

  test('no moat-water colliders are added to the collision system', () => {
    // The water ring must not add collision — player should walk freely across it
    const waterColliders = CITY_COLLIDERS.filter(
      (c) => c.id.includes('moat') || c.id.includes('water')
    );
    expect(waterColliders.length).toBe(0);
  });
});

describe('Phase 35C — Moat water does not interfere with movement', () => {
  test('player can walk from city toward the ramp without new collision', () => {
    // Walk from south (Z=-40) toward the ramp entrance at Z=-44
    const start: [number, number, number] = [0, 0, -40];
    const result = resolveCityMovement(start, 0, -1, 3.8, 0.016);
    // Should have moved north (Z decreased)
    expect(result[2]).toBeLessThan(start[2]);
  });

  test('player at the water ring radius (outside perimeter) has terrain Y=0', () => {
    // At radius ~28 (within water ring), terrain should be flat ground
    const { getTerrainY } = require('./terrainHeight');
    const y = getTerrainY(28, MOTTE_CENTER_Z);
    expect(y).toBe(0);
  });

  test('player at the south gap center has terrain Y=0 (not on ramp)', () => {
    const { getTerrainY } = require('./terrainHeight');
    // South of the motte at the gap center, at radius 28
    const x = 0;
    const z = MOTTE_CENTER_Z + 28; // = -40
    const y = getTerrainY(x, z);
    expect(y).toBe(0);
  });
});
