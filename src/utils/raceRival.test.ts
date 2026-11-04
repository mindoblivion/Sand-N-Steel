// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { CIRCUS_AXIS_X } from './collisionShapes';
import { advanceRaceLap, createRaceLapTracker } from './raceLap';
import { getRaceRivalPose } from './raceRival';

describe('deterministic race rival route', () => {
  test('starts on the selected lane and is deterministic for equal elapsed time', () => {
    const config = { lapDurationMs: 60000, startSide: 1 as const };
    const a = getRaceRivalPose(0, config);
    const b = getRaceRivalPose(0, config);
    expect(a).toEqual(b);
    expect(a.x).toBeCloseTo(CIRCUS_AXIS_X + 9, 8);
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

  test('heading remains finite at straight segments and lane transitions', () => {
    for (let i = 0; i <= 100; i += 1) {
      const pose = getRaceRivalPose(i * 1000, { lapDurationMs: 100000, startSide: 1 });
      expect(Number.isFinite(pose.heading)).toBe(true);
      expect(Number.isFinite(pose.x)).toBe(true);
      expect(Number.isFinite(pose.z)).toBe(true);
    }
  });
});
