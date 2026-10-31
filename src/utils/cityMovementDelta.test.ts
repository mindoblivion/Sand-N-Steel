/**
 * City movement delta clamp - wall-tunneling regression tests.
 *
 * resolveCityMovement is called every frame with the frame's raw delta.
 * Without a clamp, a low-framerate hitch (delta ~1s) moves the player
 * dx*speed*delta meters in a single step, teleporting straight through
 * building colliders: the target position tests clear, so the resolver
 * accepts the tunneled position. The resolver now clamps delta to 0.1s
 * (a 10fps floor) at its top, so the longest single step is 0.38m at the
 * 3.8 m/s stride speed - well under PLAYER_RADIUS and collider sizes, so
 * tunneling is impossible. During hitches the game time-dilates slightly
 * instead of teleporting; that is the correct behavior.
 */
// @ts-ignore - bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { resolveCityMovement } from './cityCollisions';
import {
  CITY_COLLIDERS,
  PLAYER_RADIUS,
  overlappingColliderIds,
  type RectCollider,
} from './collisionShapes';

// The stride speed used by the city movement call path.
const SPEED = 3.8;
// The clamp floor: 0.1s (10fps). Larger deltas are time-dilated to this.
const CLAMPED_DELTA = 0.1;

// Find a rect wall thin enough that an unclamped 1s step (3.8m) fully
// crosses it, with collider-free start and landing spots so the pre-fix run
// is a clean tunnel (the target position tests clear).
function findTestWall(): { rect: RectCollider; startX: number; startZ: number } {
  const rects = CITY_COLLIDERS.filter(
    (c): c is RectCollider => c.type === 'rect' && c.hw >= 0.3 && c.hw <= 1.5,
  );
  for (const rect of rects) {
    const startX = rect.cx - rect.hw - PLAYER_RADIUS - 0.05;
    const startZ = rect.cz;
    const landingX = startX + SPEED * 1.0;
    const startClear =
      overlappingColliderIds(startX, startZ, PLAYER_RADIUS, CITY_COLLIDERS).size === 0;
    const landingClear =
      overlappingColliderIds(landingX, startZ, PLAYER_RADIUS, CITY_COLLIDERS).size === 0;
    const fullyCrosses = landingX > rect.cx + rect.hw + PLAYER_RADIUS;
    if (startClear && landingClear && fullyCrosses) {
      return { rect, startX, startZ };
    }
  }
  throw new Error('No suitable test wall found in CITY_COLLIDERS');
}

// Find open ground with no collider within 5m, away from the boundaries.
function findOpenSpot(): [number, number] {
  for (let gx = -30; gx <= 30; gx += 5) {
    for (let gz = -90; gz <= 30; gz += 5) {
      if (overlappingColliderIds(gx, gz, 1, CITY_COLLIDERS).size === 0) {
        return [gx, gz];
      }
    }
  }
  throw new Error('No open spot found');
}

describe('city movement delta clamp', () => {
  test('delta = 1.0 does not tunnel through a wall collider', () => {
    const { rect, startX, startZ } = findTestWall();
    const farFace = rect.cx + rect.hw;
    const [x, , z] = resolveCityMovement([startX, 0, startZ], 1, 0, SPEED, 1.0);
    // The player must stay on the near side of the wall, within one clamped
    // step of where it started.
    expect(x).toBeLessThan(farFace);
    expect(x - startX).toBeLessThanOrEqual(SPEED * CLAMPED_DELTA + 1e-9);
    expect(z).toBeCloseTo(startZ, 9);
  });

  test('delta = 1.0 behaves like delta = 0.1 in open space', () => {
    const [sx, sz] = findOpenSpot();
    const full = resolveCityMovement([sx, 0, sz], 1, 0, SPEED, 1.0);
    const clamped = resolveCityMovement([sx, 0, sz], 1, 0, SPEED, CLAMPED_DELTA);
    expect(full[0]).toBeCloseTo(clamped[0], 9);
    expect(full[2]).toBeCloseTo(clamped[2], 9);
  });

  test('delta = 1/60 behaves exactly as before (regression)', () => {
    const [sx, sz] = findOpenSpot();
    const delta = 1 / 60;
    const [x, , z] = resolveCityMovement([sx, 0, sz], 1, 0, SPEED, delta);
    // 1/60s is below the clamp, so the full unclamped step is preserved.
    expect(x).toBeCloseTo(sx + SPEED * delta, 9);
    expect(z).toBeCloseTo(sz, 9);
  });

test('delta = 0.1 passes through unclamped; just above 0.1 clamps (boundary pin)', () => {
  const [sx, sz] = findOpenSpot();
  const atFloor = resolveCityMovement([sx, 0, sz], 1, 0, SPEED, 0.1);
  // 0.1 is the clamp boundary: the full 3.8 * 0.1 = 0.38m step is preserved.
  expect(atFloor[0]).toBeCloseTo(sx + SPEED * 0.1, 9);
  expect(atFloor[2]).toBeCloseTo(sz, 9);
  const justAbove = resolveCityMovement([sx, 0, sz], 1, 0, SPEED, 0.100001);
  // Just above the floor clamps back to the 0.1 behavior.
  expect(justAbove[0]).toBeCloseTo(atFloor[0], 9);
  expect(justAbove[2]).toBeCloseTo(atFloor[2], 9);
});
});
