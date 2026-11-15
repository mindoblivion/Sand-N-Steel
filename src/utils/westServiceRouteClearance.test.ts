/**
 * Candidate west-side pedestrian route clearance.
 *
 * These are geometry-derived candidate centerlines from the city-layout
 * blueprint. The test walks them through the production movement resolver,
 * rather than treating a collision-free endpoint as proof of connectivity.
 * The Training Yard gate is a named narrow threshold exception.
 *
 * Run with: bun test src/utils/westServiceRouteClearance.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { CITY_COLLIDERS, PLAYER_RADIUS, collidesWith } from './collisionShapes';
import { resolveCityMovement } from './cityCollisions';

type Point = [number, number]; // world X/Z
const SPEED = 3.8;
const STEP = 0.2;

function walkAxisSegment(start: Point, end: Point): Point {
  const dx = Math.sign(end[0] - start[0]);
  const dz = Math.sign(end[1] - start[1]);
  if (dx !== 0 && dz !== 0) throw new Error('Route segments must be axis-aligned');

  let position: [number, number, number] = [start[0], 0, start[1]];
  const axis = dx !== 0 ? 0 : 2;
  const target = axis === 0 ? end[0] : end[1];

  for (let guard = 0; guard < 1000; guard++) {
    const current = position[axis];
    const remaining = Math.abs(target - current);
    if (remaining < 1e-6) return [position[0], position[2]];

    const step = Math.min(STEP, remaining);
    const before = current;
    position = resolveCityMovement(
      position,
      dx,
      dz,
      step / 0.1,
      0.1,
    );

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
    const t = samples === 0 ? 0 : i / samples;
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

describe('candidate west-side service route', () => {
  test('west service spine and three south-facing frontage branches are walkable', () => {
    const spineStart: Point = [-33.575, -21.45];
    const spineEnd: Point = [-33.575, -1.75];
    expect(walkAxisSegment(spineStart, spineEnd)).toEqual(spineEnd);

    // Veteran Hall, Barracks, and Medical House exterior standoffs use a
    // 0.50-unit facade offset, leaving tolerance beyond PLAYER_RADIUS = 0.40.
    expect(walkAxisSegment(spineStart, [-24, -21.45])).toEqual([-24, -21.45]);
    expect(walkAxisSegment([-33.575, -10.45], [-27, -10.45])).toEqual([-27, -10.45]);
    expect(walkAxisSegment(spineEnd, [-29, -1.75])).toEqual([-29, -1.75]);
  });

  test('cross-connector skirts the Colosseum and reaches the Training Yard gate', () => {
    const route: Point[] = [
      [-33.575, -9.35],
      [-14.0, -9.35],
      [-14.0, -7.5],
      [-9.4, -7.5],
      [-9.4, 0],
      [-13.5, 0],
    ];
    expect(walkRoute(route)).toEqual([-13.5, 0]);
  });

  test('primary portions preserve at least a 2-unit sampled centre corridor', () => {
    // West spine: between the west movement boundary and the expanded
    // Medical House west face.
    expectClearCorridor([-33.575, -21.45], [-33.575, -1.75], 'x');

    // Medical/Barracks cross-connector: 3.20-unit footprint gap leaves
    // 2.40 units after both PLAYER_RADIUS expansions.
    expectClearCorridor([-33.575, -9.35], [-13.7, -9.35], 'z');

    // Colosseum west-side bypass and south-west turn.
    expectClearCorridor([-14.0, -9.35], [-14.0, -7.5], 'x');
    expectClearCorridor([-14.0, -7.5], [-9.4, -7.5], 'z');

    // Training Yard east-side approach. It narrows near the gate; the
    // doorway itself is tested by the resolver above as a 1.7-unit
    // player-centre opening, an explicit threshold exception.
    expectClearCorridor([-9.4, -7.0], [-9.4, 0], 'x', [-0.8, 1.2]);
  });
});
