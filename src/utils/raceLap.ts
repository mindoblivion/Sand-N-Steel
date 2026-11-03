/**
 * Pure lap-finish detection for the East Circus oval.
 *
 * The start line is a Z plane. A valid lap must travel to the far end of the
 * oval before crossing that plane in the return (+Z) direction; merely leaving
 * the starting line or reversing nearby cannot finish the race.
 */
export interface RaceLapTracker {
  lastZ: number;
  farthestZ: number;
  finished: boolean;
}

export interface RaceLapUpdate {
  tracker: RaceLapTracker;
  finishedNow: boolean;
}

export const RACE_FINISH_LINE_Z = 42.5;
export const RACE_FAR_TURN_Z = -18;

export function createRaceLapTracker(startZ = RACE_FINISH_LINE_Z): RaceLapTracker {
  return { lastZ: startZ, farthestZ: startZ, finished: false };
}

/**
 * Advance the tracker with a world-space Z coordinate. It finishes exactly once,
 * on a northbound crossing after reaching the far-turn threshold. Invalid
 * coordinates are ignored, preserving the last valid sample.
 */
export function advanceRaceLap(
  tracker: RaceLapTracker,
  currentZ: number,
  finishLineZ = RACE_FINISH_LINE_Z,
  farTurnZ = RACE_FAR_TURN_Z,
): RaceLapUpdate {
  if (tracker.finished) return { tracker, finishedNow: false };
  if (!Number.isFinite(currentZ) || !Number.isFinite(finishLineZ) || !Number.isFinite(farTurnZ)) {
    return { tracker, finishedNow: false };
  }

  const farthestZ = Math.min(tracker.farthestZ, currentZ);
  const crossedFinish = tracker.lastZ < finishLineZ && currentZ >= finishLineZ;
  const finishedNow = crossedFinish && farthestZ <= farTurnZ;
  const next: RaceLapTracker = {
    lastZ: currentZ,
    farthestZ,
    finished: finishedNow,
  };
  return { tracker: next, finishedNow };
}
