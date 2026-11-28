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
  /**
   * LADDER-1E — completed laps (0-based). The lap being driven is
   * `lap + 1`. On the final lap's finish crossing the race is over, so
   * `lap` stays at `totalLaps - 1` and the readout still reads the final
   * lap — `lap` is never incremented past the last lap.
   */
  lap: number;
  /**
   * LADDER-1E — laps in the race. `finishedNow` fires only on the final
   * lap; a 1-lap race behaves exactly as the single-lap tracker did.
   */
  totalLaps: number;
}

export interface RaceLapPosition {
  x: number;
  z: number;
}

export interface RaceLapUpdate {
  tracker: RaceLapTracker;
  finishedNow: boolean;
}

/** Player-facing checkpoint stage, derived from the authoritative lap tracker. */
export type RaceLapStage = 'north-turn' | 'south-turn' | 'finish-line' | 'finished';

/** The next required section of the oval; this never changes lap validity. */
export function getRaceLapStage(tracker: RaceLapTracker): RaceLapStage {
  if (tracker.finished) return 'finished';
  if (!tracker.northTurnCompleted) return 'north-turn';
  if (!tracker.southTurnCompleted) return 'south-turn';
  return 'finish-line';
}

export const RACE_FINISH_LINE_Z = CIRCUS_RACE_START.z;
/** Past the oval's straight-flank start, into the north sphendone. */
export const RACE_NORTH_TURN_Z = CIRCUS_OVAL_START_Z - 5;
/** The side change must occur at or beyond the southern curve's approach. */
export const RACE_SOUTH_TURN_Z = CIRCUS_SOUTH_Z - 3;
/** Minimum lateral offset from the surveyed axis to count as a lane. */
export const RACE_TURN_LANE_OFFSET = 7.5;

/** The HUD lap readout: "Lap N of M", N 1-based, from completed laps (0-based) and the race length. */
export function raceLapReadout(completedLaps: number, totalLaps: number): string {
  return `Lap ${completedLaps + 1} of ${totalLaps}`;
}

export function createRaceLapTracker(
  startZ = RACE_FINISH_LINE_Z,
  totalLaps = 1,
): RaceLapTracker {
  // LADDER-1E — a bogus race length fails closed to a single lap, the
  // shipped behaviour: the tracker never promises laps it cannot count.
  const laps = Number.isFinite(totalLaps) && Math.floor(totalLaps) >= 1
    ? Math.floor(totalLaps)
    : 1;
  return {
    lastZ: startZ,
    farthestZ: startZ,
    lastSide: null,
    startSide: null,
    northTurnCompleted: false,
    southTurnCompleted: false,
    finished: false,
    lap: 0,
    totalLaps: laps,
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

  // LADDER-1E — a finish crossing on a non-final lap counts the lap and
  // resets the per-lap checkpoints, but `finishedNow` fires ONLY on the
  // final lap: the scene's finish transition reads it, so an earlier
  // crossing must never settle the race. The south hairpin is BEFORE the
  // line — the cubic ends at finishApproachZ, 0.1 units before it — so the
  // chariot crosses the line and heads north on the SAME flank it started
  // on; the opening side does not change across the line, and it is carried
  // over unchanged here. The flank swap happens at the north turn, as on
  // lap 1. `lastZ` / `lastSide` carry over so the line crossing itself
  // fires no checkpoint: the north turn needs the far bend, the south turn
  // needs the north turn first.
  if (finishedNow && tracker.lap + 1 < tracker.totalLaps) {
    const next: RaceLapTracker = {
      lastZ: z,
      farthestZ: Math.min(tracker.farthestZ, z),
      lastSide: side ?? tracker.lastSide,
      startSide: tracker.startSide,
      northTurnCompleted: false,
      southTurnCompleted: false,
      finished: false,
      lap: tracker.lap + 1,
      totalLaps: tracker.totalLaps,
    };
    return { tracker: next, finishedNow: false };
  }

  const next: RaceLapTracker = {
    lastZ: z,
    farthestZ: Math.min(tracker.farthestZ, z),
    lastSide: side ?? tracker.lastSide,
    startSide,
    northTurnCompleted,
    southTurnCompleted,
    finished: finishedNow,
    lap: tracker.lap,
    totalLaps: tracker.totalLaps,
  };
  return { tracker: next, finishedNow };
}
