/**
 * Deterministic rival pacing on the surveyed East Circus oval.
 *
 * The rival follows the same two lane-change checkpoints as raceLap.ts. This
 * module is deliberately renderer- and storage-free: callers supply race time
 * and receive a stable world-space pose. A rival is not authoritative for
 * player completion or rewards; the scene must still validate its own finish.
 */
import { CIRCUS_AXIS_X } from './collisionShapes';
import { CIRCUS_RACE_START } from './circusDistrictGeometry';
import { RACE_NORTH_TURN_Z, RACE_SOUTH_TURN_Z } from './raceLap';

export interface RaceRivalPose {
  x: number;
  z: number;
  heading: number;
  finished: boolean;
  progress: number;
}

export interface RaceRivalConfig {
  /** Target lap duration. Must be finite and positive. */
  lapDurationMs: number;
  /** +1 starts on the east lane; -1 starts on the west lane. */
  startSide: -1 | 1;
}

const LANE_OFFSET = 9;

/**
 * One complete route, including both lane changes required by the lap tracker.
 * The finish is crossed northbound at the same Z plane as the player's start.
 */
function routeFor(startSide: -1 | 1): ReadonlyArray<readonly [number, number]> {
  const otherSide = -startSide;
  return [
    [CIRCUS_AXIS_X + startSide * LANE_OFFSET, CIRCUS_RACE_START.z],
    [CIRCUS_AXIS_X + startSide * LANE_OFFSET, RACE_NORTH_TURN_Z],
    [CIRCUS_AXIS_X + otherSide * LANE_OFFSET, RACE_NORTH_TURN_Z],
    [CIRCUS_AXIS_X + otherSide * LANE_OFFSET, RACE_SOUTH_TURN_Z],
    [CIRCUS_AXIS_X + startSide * LANE_OFFSET, RACE_SOUTH_TURN_Z],
    [CIRCUS_AXIS_X + startSide * LANE_OFFSET, CIRCUS_RACE_START.z],
  ];
}

function routeLength(points: ReadonlyArray<readonly [number, number]>): number {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return length;
}

/** Resolve a repeatable rival pose from elapsed race time. */
export function getRaceRivalPose(
  elapsedMs: number,
  config: RaceRivalConfig,
): RaceRivalPose {
  const duration = Number.isFinite(config?.lapDurationMs) && config.lapDurationMs > 0
    ? config.lapDurationMs
    : 1;
  const startSide: -1 | 1 = config?.startSide === -1 ? -1 : 1;
  const points = routeFor(startSide);
  const totalLength = routeLength(points);
  const progress = Number.isFinite(elapsedMs)
    ? Math.max(0, Math.min(1, elapsedMs / duration))
    : 0;
  let remaining = totalLength * progress;

  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    const segmentLength = Math.hypot(dx, dz);
    if (remaining <= segmentLength || i === points.length - 1) {
      const t = segmentLength > 0 ? Math.min(1, remaining / segmentLength) : 1;
      return {
        x: from[0] + dx * t,
        z: from[1] + dz * t,
        // Three.js chariot forward is local -Z.
        heading: Math.atan2(dx, -dz),
        finished: progress >= 1,
        progress,
      };
    }
    remaining -= segmentLength;
  }

  const last = points[points.length - 1];
  return { x: last[0], z: last[1], heading: 0, finished: true, progress: 1 };
}
