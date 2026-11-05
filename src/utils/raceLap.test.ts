// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import {
  advanceRaceLap,
  createRaceLapTracker,
  RACE_FINISH_LINE_Z,
  RACE_NORTH_TURN_Z,
  RACE_SOUTH_TURN_Z,
  RACE_TURN_LANE_OFFSET,
  getRaceLapStage,
} from './raceLap';

const axis = 52.34;
const sample = (x: number, z: number) => ({ x, z });

const validRoute = (startSide: -1 | 1) => {
  const opposite = -startSide as -1 | 1;
  return [
    sample(axis, 20),
    sample(axis + startSide * 9, 10),
    sample(axis + startSide * 9, RACE_NORTH_TURN_Z - 1),
    sample(axis + opposite * 9, RACE_NORTH_TURN_Z - 1),
    sample(axis + opposite * 9, -5),
    sample(axis + opposite * 9, 15),
    sample(axis + opposite * 9, RACE_SOUTH_TURN_Z + 1),
    sample(axis + startSide * 4, RACE_SOUTH_TURN_Z + 1),
    sample(axis - startSide * 4, RACE_SOUTH_TURN_Z + 1),
    sample(axis + startSide * 9, RACE_SOUTH_TURN_Z + 1),
    sample(axis + startSide * 9, RACE_FINISH_LINE_Z - 0.1),
  ];
};

describe('race checkpoint HUD stage', () => {
  test('reports north turn, south turn, finish line and finished in route order', () => {
    let tracker = createRaceLapTracker();
    expect(getRaceLapStage(tracker)).toBe('north-turn');
    for (const position of validRoute(1)) {
      tracker = advanceRaceLap(tracker, position).tracker;
      if (tracker.northTurnCompleted && !tracker.southTurnCompleted) {
        expect(getRaceLapStage(tracker)).toBe('south-turn');
      }
      if (tracker.southTurnCompleted && !tracker.finished) {
        expect(getRaceLapStage(tracker)).toBe('finish-line');
      }
    }
    const finish = advanceRaceLap(tracker, sample(axis + 9, RACE_FINISH_LINE_Z + 0.1));
    expect(getRaceLapStage(finish.tracker)).toBe('finished');
  });

  test('does not claim a checkpoint from invalid coordinates', () => {
    const tracker = createRaceLapTracker();
    const update = advanceRaceLap(tracker, { x: Number.NaN, z: 10 });
    expect(getRaceLapStage(update.tracker)).toBe('north-turn');
  });
});

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
    expect(tracker.startSide).toBeNull();
    expect(tracker.northTurnCompleted).toBe(false);
    expect(tracker.southTurnCompleted).toBe(false);
  });

  test('requires a lane change at the north curve before the south checkpoint can count', () => {
    let tracker = createRaceLapTracker();
    for (const position of [
      sample(axis + 9, 10),
      sample(axis + 9, RACE_NORTH_TURN_Z - 1),
      sample(axis + 9, -5),
      sample(axis + 9, 15),
      sample(axis + 9, RACE_SOUTH_TURN_Z + 1),
      sample(axis - 9, RACE_SOUTH_TURN_Z + 1),
      sample(axis - 9, RACE_FINISH_LINE_Z + 0.1),
    ]) {
      const update = advanceRaceLap(tracker, position);
      tracker = update.tracker;
      expect(update.finishedNow).toBe(false);
    }
    expect(tracker.startSide).toBe(1);
    expect(tracker.northTurnCompleted).toBe(false);
    expect(tracker.southTurnCompleted).toBe(false);
  });

  test('does not accept a lane swap well before the southern curve', () => {
    let tracker = createRaceLapTracker();
    for (const position of [
      sample(axis, 20),
      sample(axis + 9, 10),
      sample(axis + 9, RACE_NORTH_TURN_Z - 1),
      sample(axis - 9, RACE_NORTH_TURN_Z - 1),
      sample(axis - 9, -5),
      sample(axis - 9, 15),
      sample(axis - 9, 26),
      sample(axis + 9, 26),
      sample(axis + 9, 35),
      sample(axis + 9, RACE_FINISH_LINE_Z + 0.1),
    ]) {
      const update = advanceRaceLap(tracker, position);
      tracker = update.tracker;
      expect(update.finishedNow).toBe(false);
    }
    expect(tracker.northTurnCompleted).toBe(true);
    expect(tracker.southTurnCompleted).toBe(false);
  });

  test('finishes only after north and south lane changes on the full route', () => {
    let tracker = createRaceLapTracker();
    for (const position of validRoute(1)) tracker = advanceRaceLap(tracker, position).tracker;
    expect(tracker.startSide).toBe(1);
    expect(tracker.northTurnCompleted).toBe(true);
    expect(tracker.southTurnCompleted).toBe(true);
    const finish = advanceRaceLap(tracker, sample(axis + 9, RACE_FINISH_LINE_Z + 0.1));
    expect(finish.finishedNow).toBe(true);
    expect(finish.tracker.finished).toBe(true);
    expect(advanceRaceLap(finish.tracker, sample(axis, RACE_FINISH_LINE_Z + 1)).finishedNow).toBe(false);
  });

  test('supports the mirrored route and ignores malformed samples', () => {
    let tracker = createRaceLapTracker();
    for (const position of validRoute(-1)) tracker = advanceRaceLap(tracker, position).tracker;
    expect(tracker.northTurnCompleted).toBe(true);
    expect(tracker.southTurnCompleted).toBe(true);
    expect(advanceRaceLap(tracker, { x: Number.NaN, z: 43 }).tracker).toBe(tracker);
    expect(advanceRaceLap(tracker, sample(axis - 9, RACE_FINISH_LINE_Z + 0.1)).finishedNow).toBe(true);
  });
});
