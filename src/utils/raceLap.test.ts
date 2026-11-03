// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { advanceRaceLap, createRaceLapTracker, RACE_FAR_TURN_Z, RACE_FINISH_LINE_Z } from './raceLap';

describe('race lap finish detection', () => {
  test('does not finish on the initial line or on a nearby reversal', () => {
    let tracker = createRaceLapTracker();
    for (const z of [42.5, 41, 42, 42.5, 41.8, 42.6]) {
      const update = advanceRaceLap(tracker, z);
      tracker = update.tracker;
      expect(update.finishedNow).toBe(false);
    }
  });

  test('requires reaching the far end and crossing back through the line', () => {
    let tracker = createRaceLapTracker();
    for (const z of [30, 10, -5, RACE_FAR_TURN_Z + 1, -19, -10, 0, 20, 42.4]) {
      const update = advanceRaceLap(tracker, z);
      tracker = update.tracker;
      expect(update.finishedNow).toBe(false);
    }
    const finish = advanceRaceLap(tracker, RACE_FINISH_LINE_Z + 0.1);
    expect(finish.finishedNow).toBe(true);
    expect(finish.tracker.finished).toBe(true);
  });

  test('does not finish when the far turn was not reached', () => {
    let tracker = createRaceLapTracker();
    for (const z of [30, 10, 0, 10, 30, 42.6]) {
      const update = advanceRaceLap(tracker, z);
      tracker = update.tracker;
      expect(update.finishedNow).toBe(false);
    }
  });

  test('finishes once only and ignores malformed samples', () => {
    let tracker = createRaceLapTracker();
    for (const z of [20, -20, 0, 42.4]) tracker = advanceRaceLap(tracker, z).tracker;
    const finish = advanceRaceLap(tracker, 43);
    expect(finish.finishedNow).toBe(true);
    expect(advanceRaceLap(finish.tracker, 44).finishedNow).toBe(false);
    expect(advanceRaceLap(finish.tracker, Number.NaN).tracker).toBe(finish.tracker);
  });
});
