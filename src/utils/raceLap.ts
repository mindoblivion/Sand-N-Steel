import { CIRCUS_RACE_START } from './circusDistrictGeometry';
import { CIRCUS_AXIS_X, CIRCUS_OVAL_START_Z, CIRCUS_SOUTH_Z } from './collisionShapes';

/**
 * Pure lap progression for the surveyed East Circus oval.
 *
 * From the starting straight, a valid lap changes lanes at the north curve,
 * returns down the opposite flank, changes back at the south curve, then crosses
 * the start/finish plane. A straight reverse or a single half-lap is insufficient.
 */
export type RaceTrackSide = -1 | 1;

export interface RaceLapTracker {
  lastZ: number;
  farthestZ: number;
  lastSide: RaceTrackSide | null;
  startSide: RaceTrackSide | null;
  northTurnCompleted: boolean;
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
/** Minimum lateral offset from the surveyed axis to count as a lane. */
export const RACE_TURN_LANE_OFFSET = 7.5;

export function createRaceLapTracker(startZ = RACE_FINISH_LINE_Z): RaceLapTracker {
  return {
    lastZ: startZ,
    farthestZ: startZ,
    lastSide: null,
    startSide: null,
    northTurnCompleted: false,
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
  const changedSide = side !== null && tracker.lastSide !== null && side !== tracker.lastSide;

  // The start side is captured on the opening straight, before the north turn.
  const startSide = tracker.startSide ?? (
    z > RACE_NORTH_TURN_Z && side !== null ? side : null
  );

  // At the north curve, the chariot must cross from its opening side to the
  // opposite lane. A player who reaches the far end while staying on one side
  // has not rounded the turn.
  const northTurnCompleted = tracker.northTurnCompleted || (
    startSide !== null &&
    z <= RACE_NORTH_TURN_Z &&
    side === -startSide &&
    changedSide
  );

  // At the south curve, it must cross back onto its opening side. Preserve the
  // last known lane through the centre strip so multiple frames across X≈axis
  // cannot erase a legitimate side change.
  const southTurnCompleted = tracker.southTurnCompleted || (
    northTurnCompleted &&
    startSide !== null &&
    z >= RACE_SOUTH_TURN_Z &&
    side === startSide &&
    changedSide
  );

  const crossedFinish = tracker.lastZ < RACE_FINISH_LINE_Z && z >= RACE_FINISH_LINE_Z;
  // The southern checkpoint must be complete before this finish-line sample.
  const finishedNow = crossedFinish && tracker.southTurnCompleted;

  const next: RaceLapTracker = {
    lastZ: z,
    farthestZ: Math.min(tracker.farthestZ, z),
    lastSide: side ?? tracker.lastSide,
    startSide,
    northTurnCompleted,
    southTurnCompleted,
    finished: finishedNow,
  };
  return { tracker: next, finishedNow };
}
