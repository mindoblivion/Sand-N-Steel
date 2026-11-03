import { CIRCUS_RACE_START } from './circusDistrictGeometry';
import { CIRCUS_AXIS_X, CIRCUS_OVAL_START_Z, CIRCUS_SOUTH_Z } from './collisionShapes';

/**
 * Pure lap progression for the surveyed East Circus oval.
 *
 * A lap is not a straight drive to the far end and reverse. The racer must
 * round the north end on one side, change sides at the southern curve, and
 * only then cross the start/finish plane heading north.
 */
export type RaceTrackSide = -1 | 1;

export interface RaceLapTracker {
  lastZ: number;
  farthestZ: number;
  lastSide: RaceTrackSide | null;
  northTurnSide: RaceTrackSide | null;
  southTurnCompleted: boolean;
  finished: boolean;
}

export interface RaceLapPosition {
  x: number;
  z: number;
}

export interface RaceLapUpdate {
  tracker: RaceLapTracker;
  finishedNow: boolean;
}

export const RACE_FINISH_LINE_Z = CIRCUS_RACE_START.z;
/** Past the oval's straight-flank start, into the north sphendone. */
export const RACE_NORTH_TURN_Z = CIRCUS_OVAL_START_Z - 5;
/** The side change must occur at or beyond the southern curve's approach. */
export const RACE_SOUTH_TURN_Z = CIRCUS_SOUTH_Z - 3;
/** Minimum lateral offset from the surveyed axis to count as rounding a turn. */
export const RACE_TURN_LANE_OFFSET = 7.5;

export function createRaceLapTracker(startZ = RACE_FINISH_LINE_Z): RaceLapTracker {
  return {
    lastZ: startZ,
    farthestZ: startZ,
    lastSide: null,
    northTurnSide: null,
    southTurnCompleted: false,
    finished: false,
  };
}

/**
 * Advance using a world-space sample. Checkpoints are monotonic and finish can
 * fire once only. Invalid coordinates are ignored without corrupting progress.
 */
export function advanceRaceLap(
  tracker: RaceLapTracker,
  position: RaceLapPosition,
): RaceLapUpdate {
  if (tracker.finished) return { tracker, finishedNow: false };
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) {
    return { tracker, finishedNow: false };
  }

  const { x, z } = position;
  const laneOffset = x - CIRCUS_AXIS_X;
  const side: RaceTrackSide | null = laneOffset <= -RACE_TURN_LANE_OFFSET
    ? -1
    : laneOffset >= RACE_TURN_LANE_OFFSET
      ? 1
      : null;

  let northTurnSide = tracker.northTurnSide;
  if (northTurnSide === null && z <= RACE_NORTH_TURN_Z && side !== null) {
    northTurnSide = side;
  }

  // Merely arriving at the south checkpoint on the opposite side is not enough:
  // a racer could swap lanes halfway down the straight. Require the actual side
  // transition to happen at/after the southern curve checkpoint.
  const changedSide = side !== null && tracker.lastSide !== null && side !== tracker.lastSide;
  const southTurnCompleted = tracker.southTurnCompleted ||
    (northTurnSide !== null &&
      z >= RACE_SOUTH_TURN_Z &&
      side === -northTurnSide &&
      changedSide);
  const crossedFinish = tracker.lastZ < RACE_FINISH_LINE_Z && z >= RACE_FINISH_LINE_Z;
  // The south checkpoint must be complete BEFORE this crossing sample; the
  // finish line itself cannot satisfy both conditions in one frame.
  const finishedNow = crossedFinish && tracker.southTurnCompleted;

  const next: RaceLapTracker = {
    lastZ: z,
    farthestZ: Math.min(tracker.farthestZ, z),
    // Preserve the last known lane through the centre strip so crossing the
    // axis between frame samples does not erase a genuine lane transition.
    lastSide: side ?? tracker.lastSide,
    northTurnSide,
    southTurnCompleted,
    finished: finishedNow,
  };
  return { tracker: next, finishedNow };
}
