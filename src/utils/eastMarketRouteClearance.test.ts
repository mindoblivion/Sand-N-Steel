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
      expect(collidesWith(px, pz, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
      expect(Math.abs(px)).toBeLessThanOrEqual(35);
    }
  }
}

describe('candidate east-market and Scholar-block routes', () => {
  test('Decumanus approach reaches the Forge west frontage', () => {
    expect(walkRoute([[0, 2.6], [11.6, 2.6], [12.75, 2.6]])).toEqual([12.75, 2.6]);
  });

  test('Forge south-west connector reaches the General Store counter lane', () => {
    expect(walkRoute([
      [11.6, 2.6],
      [11.6, -3.0],
      [17.3, -3.0],
      [17.3, -9.6],
    ])).toEqual([17.3, -9.6]);
    // West counter service standoff is on this lane.
    expect(walkAxisSegment([17.3, -3.0], [17.3, -5.0])).toEqual([17.3, -5.0]);
  });

  test('counter lane joins the east-of-Colosseum Scholar lane', () => {
    expect(walkRoute([
      [17.3, -9.6],
      [18.5, -9.6],
      [18.5, -13.0],
      [20.7, -13.0],
      [20.7, -21.5],
    ])).toEqual([20.7, -21.5]);
  });

  test('Merchant, Doctore, Library and Academy frontage standoffs are reachable', () => {
    expect(walkAxisSegment([20.7, -13.0], [21.65, -13.0])).toEqual([21.65, -13.0]);
    expect(walkAxisSegment([20.7, -18.875], [24.5, -18.875])).toEqual([24.5, -18.875]);
    expect(walkRoute([
      [20.7, -21.5],
      [23.1, -21.5],
      [23.1, -25.7],
    ])).toEqual([23.1, -25.7]);
    expect(walkAxisSegment([23.1, -24.0], [26.15, -24.0])).toEqual([26.15, -24.0]);
  });

  test('Workshop, Stable, Inn and Tavern frontage approaches are reachable', () => {
    expect(walkAxisSegment([27.0, -2.2], [28.2, -2.2])).toEqual([28.2, -2.2]);
    expect(walkAxisSegment([33.0, 10.65], [26.0, 10.65])).toEqual([26.0, 10.65]);
    expect(walkAxisSegment([0, 14.0], [10.95, 14.0])).toEqual([10.95, 14.0]);
    expect(walkAxisSegment([0, 14.0], [-11.05, 14.0])).toEqual([-11.05, 14.0]);
  });

  test('primary east-market and Scholar corridors preserve 2-unit sampled clearance', () => {
    // Cardo / Decumanus approach to the Forge; the Forge is east of the
    // frontage endpoint, so the clear width is across Z.
    expectClearCorridor([0, 2.6], [12.75, 2.6], 'z');

    // South-west around the Forge and across the south frontage.
    expectClearCorridor([11.6, 2.6], [11.6, -3.0], 'x');
    expectClearCorridor([11.6, -3.0], [17.3, -3.0], 'z');

    // West of the General Store and its projecting counter.
    expectClearCorridor([17.3, -3.0], [17.3, -9.6], 'x', [-2, 0]);

    // North of the Store, then east of the Colosseum and west of Merchant.
    expectClearCorridor([17.3, -9.6], [18.5, -9.6], 'z');
    expectClearCorridor([18.5, -9.6], [18.5, -13.0], 'x');
    expectClearCorridor([18.5, -13.0], [20.7, -13.0], 'z');
    expectClearCorridor([20.7, -13.0], [20.7, -21.5], 'x');

    // Scholar approach turns east before the Colosseum boundary tightens.
    expectClearCorridor([20.7, -21.5], [23.1, -21.5], 'z');
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
