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

// The measured sand is 16.8 units wide (X 43.940..60.740), so ±7.8
// keeps the rival's centreline inside the playable surface with 0.6 units
// of margin while clearing raceLap.ts's inclusive lane threshold.
const LANE_OFFSET = 7.8;

/**
 * Sample a cubic Bezier in world space. Sampling keeps distance-based pacing
 * deterministic while giving the chariot a continuous tangent through turns.
 */
function sampleCurve(
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
  p3: readonly [number, number],
  steps = 512,
): Array<readonly [number, number]> {
  const points: Array<readonly [number, number]> = [];
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    points.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return points;
}

/**
 * One complete oval-like route. The two cubic hairpins round the surveyed
 * north and south ends; their lateral crossings still satisfy raceLap.ts.
 */
function buildRoute(startSide: -1 | 1): ReadonlyArray<readonly [number, number]> {
  const otherSide = -startSide;
  const startX = CIRCUS_AXIS_X + startSide * LANE_OFFSET;
  const otherX = CIRCUS_AXIS_X + otherSide * LANE_OFFSET;
  const northZ = RACE_NORTH_TURN_Z;
  const northEntryZ = northZ - 1;
  const northApexZ = northZ - 5.5;
  const southEntryZ = 30;
  const finishApproachZ = CIRCUS_RACE_START.z - 0.1;
  return [
    [startX, CIRCUS_RACE_START.z],
    [startX, northEntryZ],
    ...sampleCurve(
      [startX, northEntryZ],
      [startX, northApexZ],
      [otherX, northApexZ],
      [otherX, northEntryZ],
    ),
    [otherX, northEntryZ],
    [otherX, southEntryZ],
    ...sampleCurve(
      [otherX, southEntryZ],
      [otherX, southEntryZ + 6],
      [startX, finishApproachZ - 0.9],
      [startX, finishApproachZ],
    ),
    [startX, finishApproachZ],
    [startX, CIRCUS_RACE_START.z],
  ];
}

const WEST_FIRST_ROUTE = buildRoute(-1);
const EAST_FIRST_ROUTE = buildRoute(1);

function routeFor(startSide: -1 | 1): ReadonlyArray<readonly [number, number]> {
  return startSide === -1 ? WEST_FIRST_ROUTE : EAST_FIRST_ROUTE;
}

function routeLength(points: ReadonlyArray<readonly [number, number]>): number {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return length;
}

/**
 * Constant world-space pace for the configured lap. Deriving this from the
 * route keeps the horse gait and wheel roll synchronized with the rival pose.
 */
export function getRaceRivalSpeed(config: RaceRivalConfig): number {
  const duration = Number.isFinite(config?.lapDurationMs) && config.lapDurationMs > 0
    ? config.lapDurationMs / 1000
    : 0.001;
  return routeLength(routeFor(config?.startSide === -1 ? -1 : 1)) / duration;
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
  if (progress >= 1) {
    const last = points[points.length - 1];
    const previous = points[points.length - 2];
    return {
      x: last[0],
      z: last[1],
      heading: Math.atan2(last[0] - previous[0], -(last[1] - previous[1])),
      finished: true,
      progress: 1,
    };
  }
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
