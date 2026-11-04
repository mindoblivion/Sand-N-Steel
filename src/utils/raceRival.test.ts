// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { CIRCUS_AXIS_X } from './collisionShapes';
import { advanceRaceLap, createRaceLapTracker } from './raceLap';
import { getRaceRivalPose, getRaceRivalSpeed } from './raceRival';

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
