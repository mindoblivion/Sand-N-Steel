/**
 * Candidate east-market and Scholar-block route clearance.
 *
 * Geometry-derived candidate centerlines are walked through the production
 * movement resolver. Corridor samples use the actual player radius and live
 * CITY_COLLIDERS registry. This is test-only evidence; it does not add paving.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { CITY_COLLIDERS, PLAYER_RADIUS, collidesWith } from './collisionShapes';
import { resolveCityMovement } from './cityCollisions';

type Point = [number, number]; // world X/Z
const STEP = 0.2;

function walkAxisSegment(start: Point, end: Point): Point {
  const sameX = Math.abs(end[0] - start[0]) < 0.01;
  const sameZ = Math.abs(end[1] - start[1]) < 0.01;
  if (!sameX && !sameZ) throw new Error('Route segments must be axis-aligned');
  const dx = sameX ? 0 : Math.sign(end[0] - start[0]);
  const dz = sameZ ? 0 : Math.sign(end[1] - start[1]);
  let position: [number, number, number] = [
    sameX ? end[0] : start[0],
    0,
    sameZ ? end[1] : start[1],
  ];
  const axis = dx !== 0 ? 0 : 2;
  const target = axis === 0 ? end[0] : end[1];

  for (let guard = 0; guard < 1000; guard++) {
    const current = position[axis];
    const remaining = Math.abs(target - current);
    if (remaining < 1e-6) return [position[0], position[2]];
    const step = Math.min(STEP, remaining);
    const before = current;
    position = resolveCityMovement(position, dx, dz, step / 0.1, 0.1);
    const after = position[axis];
    const progressed = dx !== 0 ? (after - before) * dx : (after - before) * dz;
    if (progressed < step - 1e-4) {
      throw new Error(
        `Movement blocked on candidate segment ${start.join(',')} → ${end.join(',')} at ${position[0]},${position[2]}`,
      );
    }
  }
  throw new Error(`Route segment did not terminate: ${start.join(',')} → ${end.join(',')}`);
}

function walkRoute(points: Point[]): Point {
  let current = points[0];
  for (const next of points.slice(1)) current = walkAxisSegment(current, next);
  return current;
}

function expectPoint(actual: Point, expected: Point): void {
  expect(actual[0]).toBeCloseTo(expected[0], 2);
  expect(actual[1]).toBeCloseTo(expected[1], 2);
}

function expectClearCorridor(
  start: Point,
  end: Point,
  lateralAxis: 'x' | 'z',
  offsets: [number, number] = [-1, 1],
): void {
  const distance = Math.abs(end[0] - start[0]) + Math.abs(end[1] - start[1]);
  const samples = Math.ceil(distance / 0.1);
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = start[0] + (end[0] - start[0]) * t;
    const z = start[1] + (end[1] - start[1]) * t;
    for (const offset of offsets) {
      const px = lateralAxis === 'x' ? x + offset : x;
      const pz = lateralAxis === 'z' ? z + offset : z;
      if (collidesWith(px, pz, PLAYER_RADIUS, CITY_COLLIDERS)) {
        const blockers = CITY_COLLIDERS
          .filter((collider) => collidesWith(px, pz, PLAYER_RADIUS, [collider]))
          .map((collider) => collider.id);
        throw new Error(`2-unit corridor blocked at X=${px.toFixed(2)}, Z=${pz.toFixed(2)} (offset ${offset}); blockers: ${blockers.join(', ')}`);
      }
      expect(Math.abs(px)).toBeLessThanOrEqual(35);
    }
  }
}

describe('candidate east-market and Scholar-block routes', () => {
  test('east side of the fountain connects spawn to the Forge west frontage', () => {
    expectPoint(walkRoute([
      [0, 16.0],
      [5.8, 16.0],
      [5.8, 2.6],
      [12.75, 2.6],
    ]), [12.75, 2.6]);
  });

  test('Forge connector reaches the west counter lane without crossing building colliders', () => {
    expectPoint(walkRoute([
      [12.75, 2.6],
      [12.75, -2.9],
      [16.2, -2.9],
      [16.2, -9.8],
    ]), [16.2, -9.8]);

    // The General Store is an exterior counter, not a door. Approach its
    // west service point from the lane; keep the counter edge 0.50 away.
    expectPoint(walkRoute([
      [16.2, -2.9],
      [16.2, -5.0],
      [17.3, -5.0],
    ]), [17.3, -5.0]);
    expect(17.8 - 17.3).toBeGreaterThan(PLAYER_RADIUS + 0.09);
  });

  test('counter lane joins the east-of-Colosseum Scholar lane', () => {
    expectPoint(walkRoute([
      [16.2, -9.8],
      [20.6, -9.8],
      [20.6, -13.0],
      [20.6, -21.5],
    ]), [20.6, -21.5]);
  });

  test('Merchant, Doctore, Library and Academy frontage standoffs are reachable', () => {
    expectPoint(walkAxisSegment([20.6, -13.0], [21.65, -13.0]), [21.65, -13.0]);
    expectPoint(walkAxisSegment([20.6, -18.875], [24.5, -18.875]), [24.5, -18.875]);
    expectPoint(walkRoute([
      [20.6, -21.5],
      [23.1, -21.5],
      [23.1, -25.7],
    ]), [23.1, -25.7]);
    expectPoint(walkAxisSegment([23.1, -24.0], [26.15, -24.0]), [26.15, -24.0]);
  });

  test('Workshop, Stable, Inn and Tavern frontage approaches are reachable', () => {
    expectPoint(walkAxisSegment([27.0, -2.2], [28.2, -2.2]), [28.2, -2.2]);
    expectPoint(walkAxisSegment([33.0, 10.65], [26.0, 10.65]), [26.0, 10.65]);
    expectPoint(walkAxisSegment([0, 14.0], [10.95, 14.0]), [10.95, 14.0]);
    expectPoint(walkAxisSegment([0, 14.0], [-11.05, 14.0]), [-11.05, 14.0]);
  });

  test('main east-side approaches preserve 2-unit sampled clearance', () => {
    // Route around the east side of the 4.0-radius central fountain.
    expectClearCorridor([0, 16.0], [5.8, 16.0], 'z');
    expectClearCorridor([5.8, 16.0], [5.8, 2.6], 'x');
    expectClearCorridor([5.8, 2.6], [12.75, 2.6], 'z');

    // The Forge's west facade creates a narrow frontage approach; the wider
    // public lane begins beyond its south-west corner.
    expectClearCorridor([12.75, -2.9], [16.2, -2.9], 'z');

    // West of the General Store counter and crate display.
    expectClearCorridor([16.2, -2.9], [16.2, -9.8], 'x', [-2, 0]);

    // Join the existing Via Mercatoria alignment and continue east of the
    // Colosseum, west of Merchant House.
    expectClearCorridor([16.2, -9.8], [20.6, -9.8], 'z');
    expectClearCorridor([20.6, -9.8], [20.6, -13.0], 'x');
    expectClearCorridor([20.6, -13.0], [20.6, -21.5], 'x');

    // Scholar approach turns east before the Colosseum boundary tightens.
    expectClearCorridor([20.6, -21.5], [23.1, -21.5], 'z');
    expectClearCorridor([23.1, -21.5], [23.1, -25.7], 'x');

    // Workshop frontage spur is 2.0 units wide to the north.
    expectClearCorridor([27.0, -2.2], [28.2, -2.2], 'z', [-2, 0]);

    // Stable north frontage has open approach space to the east.
    expectClearCorridor([33.0, 10.65], [26.0, 10.65], 'z', [-2, 0]);

    // Inn and Tavern west/east frontage paths.
    expectClearCorridor([0, 14.0], [10.95, 14.0], 'z');
    expectClearCorridor([0, 14.0], [-11.05, 14.0], 'z');
  });
});
