// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { CIRCUS_AXIS_X } from './collisionShapes';
import { advanceRaceLap, createRaceLapTracker } from './raceLap';
import { getRaceRivalPose, getRaceRivalSpeed, resolveFieldFinishOrder, resolveRaceRivalFinishMs, resolveRaceRivalOutcome } from './raceRival';

describe('deterministic race rival route', () => {
  test('starts on the selected lane and is deterministic for equal elapsed time', () => {
    const config = { lapDurationMs: 60000, startSide: 1 as const };
    const a = getRaceRivalPose(0, config);
    const b = getRaceRivalPose(0, config);
    expect(a).toEqual(b);
    expect(a.x).toBeCloseTo(CIRCUS_AXIS_X + 7.8, 8);
    expect(a.z).toBe(42.5);
    expect(a.finished).toBe(false);
  });

  test('crosses both surveyed lane checkpoints and the finish exactly once', () => {
    const config = { lapDurationMs: 60000, startSide: 1 as const };
    let tracker = createRaceLapTracker();
    for (let i = 0; i <= 1000; i += 1) {
      const pose = getRaceRivalPose(i * config.lapDurationMs / 1000, config);
      const update = advanceRaceLap(tracker, pose);
      tracker = update.tracker;
      expect(pose.x).toBeGreaterThanOrEqual(43.94);
      expect(pose.x).toBeLessThanOrEqual(60.74);
      if (i < 1000) expect(update.finishedNow).toBe(false);
      else expect(update.finishedNow).toBe(true);
    }
    expect(tracker.northTurnCompleted).toBe(true);
    expect(tracker.southTurnCompleted).toBe(true);
    expect(tracker.finished).toBe(true);
    expect(advanceRaceLap(tracker, getRaceRivalPose(70000, config)).finishedNow).toBe(false);
  });

  test('supports the mirrored west-first lane without changing lap validation', () => {
    const config = { lapDurationMs: 45000, startSide: -1 as const };
    let tracker = createRaceLapTracker();
    for (let i = 0; i <= 1000; i += 1) {
      const pose = getRaceRivalPose(i * config.lapDurationMs / 1000, config);
      tracker = advanceRaceLap(tracker, pose).tracker;
    }
    expect(tracker.startSide).toBe(-1);
    expect(tracker.northTurnCompleted).toBe(true);
    expect(tracker.southTurnCompleted).toBe(true);
    expect(tracker.finished).toBe(true);
  });

  test('clamps time, handles malformed time and protects invalid lap durations', () => {
    const config = { lapDurationMs: 1000, startSide: 1 as const };
    expect(getRaceRivalPose(-100, config).progress).toBe(0);
    expect(getRaceRivalPose(Number.NaN, config).progress).toBe(0);
    expect(getRaceRivalPose(2000, config).progress).toBe(1);
    expect(getRaceRivalPose(0, { lapDurationMs: Number.NaN, startSide: 1 }).finished).toBe(false);
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

  test('heading remains finite at straight segments and lane transitions', () => {
    for (let i = 0; i <= 100; i += 1) {
      const pose = getRaceRivalPose(i * 1000, { lapDurationMs: 100000, startSide: 1 });
      expect(Number.isFinite(pose.heading)).toBe(true);
      expect(Number.isFinite(pose.x)).toBe(true);
      expect(Number.isFinite(pose.z)).toBe(true);
    }
  });

  test('heading faces the local negative-Z forward axis along both mirrored routes', () => {
    const config = { lapDurationMs: 36000, startSide: 1 as const };
    const mirrored = { ...config, startSide: -1 as const };
    for (const route of [config, mirrored]) {
      for (let elapsed = 100; elapsed < route.lapDurationMs - 100; elapsed += 100) {
        const before = getRaceRivalPose(elapsed - 20, route);
        const pose = getRaceRivalPose(elapsed, route);
        const after = getRaceRivalPose(elapsed + 20, route);
        const dx = after.x - before.x;
        const dz = after.z - before.z;
        if (Math.hypot(dx, dz) < 1e-5) continue;
        const expectedHeading = Math.atan2(-dx, -dz);
        const difference = Math.atan2(
          Math.sin(pose.heading - expectedHeading),
          Math.cos(pose.heading - expectedHeading),
        );
        expect(Math.abs(difference)).toBeLessThan(0.02);
      }
    }
  });

  test('rounded hairpins stay within the surveyed racing surface and turn smoothly', () => {
    const config = { lapDurationMs: 36000, startSide: -1 as const };
    let previousHeading: number | null = null;
    for (let i = 0; i <= 2000; i += 1) {
      const pose = getRaceRivalPose(i * config.lapDurationMs / 2000, config);
      expect(pose.x).toBeGreaterThanOrEqual(43.94);
      expect(pose.x).toBeLessThanOrEqual(60.74);
      expect(pose.z).toBeGreaterThanOrEqual(-27.66);
      expect(pose.z).toBeLessThanOrEqual(43.51);
      if (previousHeading !== null) {
        const delta = Math.atan2(
          Math.sin(pose.heading - previousHeading),
          Math.cos(pose.heading - previousHeading),
        );
        expect(Math.abs(delta)).toBeLessThan(0.3);
      }
      previousHeading = pose.heading;
    }
  });
});


describe('race rival finish comparison', () => {
  test('reports a player victory and the exact winning margin', () => {
    expect(resolveRaceRivalOutcome(58200, 60000)).toEqual({
      outcome: 'victory',
      marginMs: 1800,
    });
  });

  test('reports a rival victory and the exact losing margin', () => {
    expect(resolveRaceRivalOutcome(61800, 60000)).toEqual({
      outcome: 'defeat',
      marginMs: 1800,
    });
  });

  test('treats finishes within one displayed tenth as a photo finish', () => {
    expect(resolveRaceRivalOutcome(60099, 60000)).toEqual({
      outcome: 'photo-finish',
      marginMs: 99,
    });
    expect(resolveRaceRivalOutcome(60000, 60000)?.outcome).toBe('photo-finish');
  });

  test('rejects invalid finish times instead of inventing a winner', () => {
    expect(resolveRaceRivalOutcome(Number.NaN, 60000)).toBeNull();
    expect(resolveRaceRivalOutcome(60000, Number.POSITIVE_INFINITY)).toBeNull();
    expect(resolveRaceRivalOutcome(-1, 60000)).toBeNull();
  });
});

describe('LADDER-1B — staggered rival clocks', () => {
  test('rival finish time includes its own delay after the leader crosses', () => {
    expect(resolveRaceRivalFinishMs(60000, 2400)).toBe(62400);
    expect(resolveRaceRivalFinishMs(58000, 0)).toBe(58000);
  });

  test('invalid lap durations or crossing delays cannot create a finish time', () => {
    expect(resolveRaceRivalFinishMs(0, 1000)).toBeNull();
    expect(resolveRaceRivalFinishMs(Number.NaN, 1000)).toBeNull();
    expect(resolveRaceRivalFinishMs(60000, -1)).toBeNull();
    expect(resolveRaceRivalFinishMs(60000, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

// LADDER-1B — the full field, in place order, from finish times. The 1v1
// helper above still answers a two-rig race; a multi-rival field needs
// places for every rig and one outcome for the settlement.
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
