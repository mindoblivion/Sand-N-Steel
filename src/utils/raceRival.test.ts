// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { CIRCUS_AXIS_X } from './collisionShapes';
import { getRivalRoute, getRaceRivalSpeed, RACE_ROUTE_LENGTH, resolveFieldFinishOrder } from './raceRival';

// LADDER-1B2 — the clocks retired. The route is now the rival driver's
// reference path (rivalDriver.ts), not a clock pose source; getRaceRivalPose
// and resolveRaceRivalOutcome were removed with the clocks. These tests pin
// the route the driver follows, and the field-order settlement the driven
// finish times feed.
describe('rival route (the driver reference path)', () => {
  test('starts on the selected lane at the finish line and is deterministic', () => {
    const a = getRivalRoute(1);
    const b = getRivalRoute(1);
    expect(a.points).toEqual(b.points);
    expect(a.length).toBeCloseTo(RACE_ROUTE_LENGTH, 9);
    expect(a.points[0][0]).toBeCloseTo(CIRCUS_AXIS_X + 7.8, 8);
    expect(a.points[0][1]).toBe(42.5);
    expect(a.points[a.points.length - 1][0]).toBeCloseTo(CIRCUS_AXIS_X + 7.8, 8);
    expect(a.points[a.points.length - 1][1]).toBe(42.5);
  });

  test('the route length is the measured 157.613 units', () => {
    expect(RACE_ROUTE_LENGTH).toBeCloseTo(157.613, 2);
    expect(getRivalRoute(-1).length).toBeCloseTo(157.613, 2);
  });

  test('the mirrored west-first lane mirrors the east lane about the axis', () => {
    const east = getRivalRoute(1);
    const west = getRivalRoute(-1);
    expect(west.points.length).toBe(east.points.length);
    expect(west.points[0][0]).toBeCloseTo(CIRCUS_AXIS_X - 7.8, 8);
    for (let i = 0; i < east.points.length; i += 47) {
      expect(west.points[i][0]).toBeCloseTo(2 * CIRCUS_AXIS_X - east.points[i][0], 6);
      expect(west.points[i][1]).toBeCloseTo(east.points[i][1], 6);
    }
  });

  test('the route rounds both surveyed turns and stays inside the driveable outline', () => {
    for (const side of [1, -1] as const) {
      const route = getRivalRoute(side);
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const [x, z] of route.points) {
        expect(x).toBeGreaterThanOrEqual(38.38);
        expect(x).toBeLessThanOrEqual(66.3);
        expect(z).toBeGreaterThanOrEqual(-27.66);
        expect(z).toBeLessThanOrEqual(43.8);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
      expect(minZ).toBeLessThanOrEqual(-22);
      expect(maxZ).toBeGreaterThanOrEqual(40.8);
    }
  });

  test('arc lengths are monotonic and end at the route length', () => {
    const route = getRivalRoute(1);
    expect(route.cumulativeDistances.length).toBe(route.points.length);
    expect(route.cumulativeDistances[0]).toBe(0);
    expect(route.cumulativeDistances[route.cumulativeDistances.length - 1]).toBeCloseTo(route.length, 9);
    for (let i = 1; i < route.cumulativeDistances.length; i += 1) {
      expect(route.cumulativeDistances[i]).toBeGreaterThanOrEqual(route.cumulativeDistances[i - 1]);
    }
  });

  test('derives a stable world-space pace from the configured lap duration', () => {
    const config = { lapDurationMs: 36000, startSide: -1 as const };
    const speed = getRaceRivalSpeed(config);
    expect(Number.isFinite(speed)).toBe(true);
    expect(speed).toBeGreaterThan(4);
    expect(speed).toBeLessThan(6);
    expect(getRaceRivalSpeed(config)).toBe(speed);
    expect(getRaceRivalSpeed({ lapDurationMs: 0, startSide: 1 })).toBeGreaterThan(1000);
  });
});

// LADDER-1B — the full field, in place order, from finish times. The 1v1
// outcome helper retired with the clocks; a multi-rival field needs places
// for every rig and one outcome for the settlement. In 1B2 the finish times
// are driven (rivalDriver.ts), not clocked, but the settlement is unchanged.
describe('LADDER-1B — the field finish order', () => {
  const field = [
    { id: 'player', name: 'Spartacus', finishMs: 58000, isPlayer: true },
    { id: 'rival-1', name: 'Aulus', finishMs: 59000, isPlayer: false },
    { id: 'rival-2', name: 'Appius', finishMs: 60000, isPlayer: false },
  ];

  test('places the full field from finish times, fastest first', () => {
    const order = resolveFieldFinishOrder(field);
    expect(order?.places.map((place) => place.place)).toEqual([1, 2, 3]);
    expect(order?.places.map((place) => place.id)).toEqual(['player', 'rival-1', 'rival-2']);
    expect(order?.places[0].finishMs).toBe(58000);
  });

  test('victory iff the player places 1st, clear by more than the photo-finish threshold', () => {
    const order = resolveFieldFinishOrder(field);
    expect(order?.outcome).toBe('victory');
    expect(order?.marginMs).toBe(1000);
  });

  test('a player 1st within 100 ms of 2nd is a photo finish, not a victory', () => {
    const order = resolveFieldFinishOrder([
      { id: 'player', name: 'Spartacus', finishMs: 58950, isPlayer: true },
      { id: 'rival-1', name: 'Aulus', finishMs: 59000, isPlayer: false },
    ]);
    expect(order?.outcome).toBe('photo-finish');
    expect(order?.places[0].id).toBe('player');
    expect(order?.marginMs).toBe(50);
  });

  test('a player behind the leader by more than 100 ms is a defeat', () => {
    const order = resolveFieldFinishOrder([
      { id: 'rival-1', name: 'Aulus', finishMs: 58000, isPlayer: false },
      { id: 'player', name: 'Spartacus', finishMs: 60000, isPlayer: true },
      { id: 'rival-2', name: 'Appius', finishMs: 61000, isPlayer: false },
    ]);
    expect(order?.outcome).toBe('defeat');
    expect(order?.places.find((place) => place.isPlayer)?.place).toBe(2);
    expect(order?.marginMs).toBe(2000);
  });

  test('a player within 100 ms of the leader, but 2nd, is a photo finish', () => {
    const order = resolveFieldFinishOrder([
      { id: 'rival-1', name: 'Aulus', finishMs: 58000, isPlayer: false },
      { id: 'player', name: 'Spartacus', finishMs: 58050, isPlayer: true },
    ]);
    expect(order?.outcome).toBe('photo-finish');
    expect(order?.places.find((place) => place.isPlayer)?.place).toBe(2);
  });

  test('an exact tie puts the player first, never a loss', () => {
    const order = resolveFieldFinishOrder([
      { id: 'rival-1', name: 'Aulus', finishMs: 58000, isPlayer: false },
      { id: 'player', name: 'Spartacus', finishMs: 58000, isPlayer: true },
    ]);
    expect(order?.places[0].id).toBe('player');
    expect(order?.outcome).toBe('photo-finish');
  });

  test('rejects an invalid field instead of inventing places', () => {
    expect(resolveFieldFinishOrder([])).toBeNull();
    expect(resolveFieldFinishOrder([field[0]])).toBeNull();
    expect(resolveFieldFinishOrder([
      { id: 'rival-1', name: 'Aulus', finishMs: 58000, isPlayer: false },
      { id: 'rival-2', name: 'Appius', finishMs: 59000, isPlayer: false },
    ])).toBeNull();
    expect(resolveFieldFinishOrder([
      { id: 'player', name: 'Spartacus', finishMs: Number.NaN, isPlayer: true },
      field[1],
    ])).toBeNull();
    expect(resolveFieldFinishOrder([
      { id: 'player', name: 'Spartacus', finishMs: -1, isPlayer: true },
      field[1],
    ])).toBeNull();
  });
});
