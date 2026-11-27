// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  advanceRaceLap,
  createRaceLapTracker,
  raceLapReadout,
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

describe('multi-lap counting (LADDER-1E)', () => {
  /**
   * Drive one full lap AFTER a finish-line crossing, from the line itself.
   * `side` is the flank the chariot crossed the finish line on. The route
   * rounds the south hairpin onto the opposite flank, heads north on it,
   * changes back at the north curve, returns south, changes back at the
   * south curve, and stops just short of the line — the caller supplies
   * the crossing sample, so the test controls exactly when the lap ends.
   */
  const driveLapAfterFinish = (tracker: ReturnType<typeof createRaceLapTracker>, side: -1 | 1) => {
    const opposite = -side as -1 | 1;
    for (const position of [
      sample(axis + side * 9, RACE_FINISH_LINE_Z + 1),
      sample(axis + opposite * 9, RACE_FINISH_LINE_Z + 2),
      sample(axis + opposite * 9, 20),
      sample(axis + opposite * 9, RACE_NORTH_TURN_Z - 1),
      sample(axis + side * 9, RACE_NORTH_TURN_Z - 1),
      sample(axis + side * 9, -5),
      sample(axis + side * 9, 15),
      sample(axis + side * 9, RACE_SOUTH_TURN_Z + 1),
      sample(axis + opposite * 9, RACE_SOUTH_TURN_Z + 1),
      sample(axis + opposite * 9, RACE_FINISH_LINE_Z - 0.1),
    ]) tracker = advanceRaceLap(tracker, position).tracker;
    return tracker;
  };

  test('a 3-lap tracker fires finishedNow only on the final lap', () => {
    let tracker = createRaceLapTracker(RACE_FINISH_LINE_Z, 3);
    expect(tracker.lap).toBe(0);
    expect(tracker.totalLaps).toBe(3);

    // Lap 1: the full route, finishing on side 1.
    for (const position of validRoute(1)) tracker = advanceRaceLap(tracker, position).tracker;
    expect(tracker.northTurnCompleted).toBe(true);
    expect(tracker.southTurnCompleted).toBe(true);
    expect(getRaceLapStage(tracker)).toBe('finish-line');
    const lap1 = advanceRaceLap(tracker, sample(axis + 9, RACE_FINISH_LINE_Z + 0.1));
    expect(lap1.finishedNow).toBe(false);
    expect(lap1.tracker.finished).toBe(false);
    expect(lap1.tracker.lap).toBe(1);
    expect(getRaceLapStage(lap1.tracker)).toBe('north-turn');
    tracker = lap1.tracker;

    // Lap 2: the hairpin flips the opening flank to side -1; the lap
    // finishes on side -1 and still does not fire.
    tracker = driveLapAfterFinish(tracker, 1);
    expect(tracker.northTurnCompleted).toBe(true);
    expect(tracker.southTurnCompleted).toBe(true);
    expect(tracker.startSide).toBe(-1);
    const lap2 = advanceRaceLap(tracker, sample(axis - 9, RACE_FINISH_LINE_Z + 0.1));
    expect(lap2.finishedNow).toBe(false);
    expect(lap2.tracker.finished).toBe(false);
    expect(lap2.tracker.lap).toBe(2);
    tracker = lap2.tracker;

    // Lap 3: the opening flank flips back to side 1; the crossing fires.
    tracker = driveLapAfterFinish(tracker, -1);
    expect(tracker.startSide).toBe(1);
    const lap3 = advanceRaceLap(tracker, sample(axis + 9, RACE_FINISH_LINE_Z + 0.1));
    expect(lap3.finishedNow).toBe(true);
    expect(lap3.tracker.finished).toBe(true);
    expect(lap3.tracker.lap).toBe(2);
    expect(getRaceLapStage(lap3.tracker)).toBe('finished');
    expect(advanceRaceLap(lap3.tracker, sample(axis, RACE_FINISH_LINE_Z + 1)).finishedNow).toBe(false);
  });

  test('a 5-lap tracker counts every lap and fires only on the fifth', () => {
    let tracker = createRaceLapTracker(RACE_FINISH_LINE_Z, 5);
    for (const position of validRoute(1)) tracker = advanceRaceLap(tracker, position).tracker;
    let side: -1 | 1 = 1;
    for (let lap = 1; lap <= 4; lap++) {
      const crossing = advanceRaceLap(tracker, sample(axis + side * 9, RACE_FINISH_LINE_Z + 0.1));
      expect(crossing.finishedNow).toBe(false);
      expect(crossing.tracker.lap).toBe(lap);
      tracker = crossing.tracker;
      tracker = driveLapAfterFinish(tracker, side);
      side = -side as -1 | 1;
    }
    const final = advanceRaceLap(tracker, sample(axis + side * 9, RACE_FINISH_LINE_Z + 0.1));
    expect(final.finishedNow).toBe(true);
    expect(final.tracker.finished).toBe(true);
    expect(final.tracker.lap).toBe(4);
  });

  test('the lap readout is 1-based and the total is the race length', () => {
    expect(raceLapReadout(0, 3)).toBe('Lap 1 of 3');
    expect(raceLapReadout(1, 3)).toBe('Lap 2 of 3');
    expect(raceLapReadout(2, 3)).toBe('Lap 3 of 3');
    expect(raceLapReadout(0, 5)).toBe('Lap 1 of 5');
    expect(raceLapReadout(4, 5)).toBe('Lap 5 of 5');
  });

  test('a bogus race length fails closed to a single lap', () => {
    expect(createRaceLapTracker(RACE_FINISH_LINE_Z, 0).totalLaps).toBe(1);
    expect(createRaceLapTracker(RACE_FINISH_LINE_Z, -2).totalLaps).toBe(1);
    expect(createRaceLapTracker(RACE_FINISH_LINE_Z, Number.NaN).totalLaps).toBe(1);
    expect(createRaceLapTracker(RACE_FINISH_LINE_Z, 2.5).totalLaps).toBe(2);
  });
});

describe('scene wiring (LADDER-1E)', () => {
  /** The scene source with its comments stripped, so prose cannot satisfy (or defeat) a check. */
  const sceneSrc = readFileSync(new URL('../components/3d/RaceScene.tsx', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

  test('the HUD checkpoint span renders the lap readout, and the stage words stay', () => {
    expect(sceneSrc).toContain('data-race-checkpoint={lapStage}');
    expect(sceneSrc).toContain('raceLapReadout(completedLaps, totalLaps)');
    expect(sceneSrc).toContain('Reach far bend');
    expect(sceneSrc).toContain('Round near bend');
    expect(sceneSrc).toContain('Return to finish');
    expect(sceneSrc).not.toContain('Lap complete');
  });

  test('the race length reaches the player tracker, the rival drivers, and the HUD', () => {
    expect(sceneSrc).toContain('const totalLaps = resolveRaceTier(rungId).laps');
    expect(sceneSrc).toContain('createRaceLapTracker(RACE_FINISH_LINE_Z, totalLaps)');
    expect(sceneSrc).toContain('laps: totalLaps');
    expect(sceneSrc.split('totalLaps={totalLaps}').length - 1).toBe(2);
    expect(sceneSrc).toContain('onLapChange={setCompletedLaps}');
  });

  test('the stamina step reads the validated tracker lap', () => {
    expect(sceneSrc).toContain('lap: lap.tracker.lap');
  });
});
