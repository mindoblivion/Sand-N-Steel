// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import {
  advanceRaceLap,
  createRaceLapTracker,
  RACE_FINISH_LINE_Z,
  RACE_NORTH_TURN_Z,
  RACE_SOUTH_TURN_Z,
  RACE_TURN_LANE_OFFSET,
} from './raceLap';

const axis = 52.34;
const sample = (x: number, z: number) => ({ x, z });

describe('full oval lap checkpoints', () => {
  test('does not finish on the initial line or after reversing near the start', () => {
    let tracker = createRaceLapTracker();
    for (const z of [RACE_FINISH_LINE_Z, 41, 42, 42.5, 41.8, 42.6]) {
      const update = advanceRaceLap(tracker, sample(axis, z));
      tracker = update.tracker;
      expect(update.finishedNow).toBe(false);
    }
  });

  test('a straight north-and-reverse shortcut is not a lap', () => {
    let tracker = createRaceLapTracker();
    for (const z of [30, 10, RACE_NORTH_TURN_Z - 1, 0, 20, RACE_FINISH_LINE_Z + 0.1]) {
      const update = advanceRaceLap(tracker, sample(axis, z));
      tracker = update.tracker;
      expect(update.finishedNow).toBe(false);
    }
    expect(tracker.northTurnSide).toBeNull();
    expect(tracker.southTurnCompleted).toBe(false);
  });

  test('does not accept a lane swap well before the southern curve', () => {
    let tracker = createRaceLapTracker();
    for (const position of [
      sample(axis, 20),
      sample(axis + 9, RACE_NORTH_TURN_Z - 1),
      sample(axis + 9, -5),
      sample(axis + 9, 15),
      sample(axis + 9, 26),
      sample(axis - 9, 26),
      sample(axis - 9, 35),
      sample(axis - 9, RACE_FINISH_LINE_Z + 0.1),
    ]) {
      const update = advanceRaceLap(tracker, position);
      tracker = update.tracker;
      expect(update.finishedNow).toBe(false);
    }
    expect(tracker.southTurnCompleted).toBe(false);
  });

  test('requires a north turn and a south turn on the opposite side', () => {
    let tracker = createRaceLapTracker();
    const route = [
      sample(axis, 20),
      sample(axis + RACE_TURN_LANE_OFFSET + 1, RACE_NORTH_TURN_Z - 1),
      sample(axis + 9, -5),
      sample(axis + 9, 10),
      sample(axis + 9, RACE_SOUTH_TURN_Z + 1),
      sample(axis + 9, 35),
      sample(axis + 9, RACE_FINISH_LINE_Z + 0.1),
    ];
    for (const position of route) {
      const update = advanceRaceLap(tracker, position);
      tracker = update.tracker;
      expect(update.finishedNow).toBe(false);
    }
    expect(tracker.northTurnSide).toBe(1);
    expect(tracker.southTurnCompleted).toBe(false);
  });

  test('finishes after rounding both ends in opposite lanes', () => {
    let tracker = createRaceLapTracker();
    const route = [
      sample(axis, 20),
      sample(axis + 9, RACE_NORTH_TURN_Z - 1),
      sample(axis + 9, -5),
      sample(axis + 9, 15),
      sample(axis + 9, RACE_SOUTH_TURN_Z + 1),
      sample(axis - 9, RACE_SOUTH_TURN_Z + 1),
      sample(axis - 9, 35),
      sample(axis - 9, RACE_FINISH_LINE_Z - 0.1),
    ];
    for (const position of route) tracker = advanceRaceLap(tracker, position).tracker;
    expect(tracker.northTurnSide).toBe(1);
    expect(tracker.southTurnCompleted).toBe(true);
    const finish = advanceRaceLap(tracker, sample(axis - 9, RACE_FINISH_LINE_Z + 0.1));
    expect(finish.finishedNow).toBe(true);
    expect(finish.tracker.finished).toBe(true);
    expect(advanceRaceLap(finish.tracker, sample(axis, RACE_FINISH_LINE_Z + 1)).finishedNow).toBe(false);
  });

  test('keeps a valid southern lane change when frame samples cross the center strip', () => {
    let tracker = createRaceLapTracker();
    for (const position of [
      sample(axis, 20),
      sample(axis + 9, RACE_NORTH_TURN_Z - 1),
      sample(axis + 9, -5),
      sample(axis + 9, 15),
      sample(axis + 9, RACE_SOUTH_TURN_Z + 1),
      sample(axis + 4, RACE_SOUTH_TURN_Z + 1),
      sample(axis - 4, RACE_SOUTH_TURN_Z + 1),
      sample(axis - 9, RACE_SOUTH_TURN_Z + 1),
    ]) tracker = advanceRaceLap(tracker, position).tracker;
    expect(tracker.southTurnCompleted).toBe(true);
    const beforeFinish = advanceRaceLap(tracker, sample(axis - 9, RACE_FINISH_LINE_Z - 0.1)).tracker;
    expect(advanceRaceLap(beforeFinish, sample(axis - 9, RACE_FINISH_LINE_Z + 0.1)).finishedNow).toBe(true);
  });

  test('supports the mirrored lane direction and ignores malformed samples', () => {
    let tracker = createRaceLapTracker();
    for (const position of [
      sample(axis, 20),
      sample(axis - 9, RACE_NORTH_TURN_Z - 1),
      sample(axis - 9, -5),
      sample(axis - 9, 15),
      sample(axis - 9, RACE_SOUTH_TURN_Z + 1),
      sample(axis + 9, RACE_SOUTH_TURN_Z + 1),
      sample(axis + 9, 35),
      sample(axis + 9, RACE_FINISH_LINE_Z - 0.1),
    ]) tracker = advanceRaceLap(tracker, position).tracker;
    expect(advanceRaceLap(tracker, { x: Number.NaN, z: 43 }).tracker).toBe(tracker);
    expect(advanceRaceLap(tracker, sample(axis + 9, RACE_FINISH_LINE_Z + 0.1)).finishedNow).toBe(true);
  });
});
