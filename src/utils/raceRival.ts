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
import { RACE_NORTH_TURN_Z } from './raceLap';

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

interface SampledRoute {
  points: ReadonlyArray<readonly [number, number]>;
  cumulativeDistances: ReadonlyArray<number>;
  length: number;
}

/** Build arc-length metadata once; the animation frame never rescans the route. */
function prepareRoute(points: ReadonlyArray<readonly [number, number]>): SampledRoute {
  const cumulativeDistances = [0];
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    cumulativeDistances.push(
      cumulativeDistances[i - 1] + Math.hypot(to[0] - from[0], to[1] - from[1]),
    );
  }
  return { points, cumulativeDistances, length: cumulativeDistances[cumulativeDistances.length - 1] };
}

const WEST_FIRST_SAMPLED_ROUTE = prepareRoute(WEST_FIRST_ROUTE);
const EAST_FIRST_SAMPLED_ROUTE = prepareRoute(EAST_FIRST_ROUTE);

function routeFor(startSide: -1 | 1): SampledRoute {
  return startSide === -1 ? WEST_FIRST_SAMPLED_ROUTE : EAST_FIRST_SAMPLED_ROUTE;
}

/** Resolve a world-space point with a binary search over precomputed arc lengths. */
function pointAtDistance(route: SampledRoute, target: number): readonly [number, number] {
  const distance = Math.max(0, Math.min(route.length, target));
  const distances = route.cumulativeDistances;
  let low = 1;
  let high = distances.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (distances[middle] < distance) low = middle + 1;
    else high = middle;
  }

  const from = route.points[low - 1];
  const to = route.points[low];
  const segmentLength = distances[low] - distances[low - 1];
  const t = segmentLength > 0 ? (distance - distances[low - 1]) / segmentLength : 1;
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
}

/**
 * Constant world-space pace for the configured lap. Deriving this from the
 * route keeps the horse gait and wheel roll synchronized with the rival pose.
 */
export function getRaceRivalSpeed(config: RaceRivalConfig): number {
  const duration = Number.isFinite(config?.lapDurationMs) && config.lapDurationMs > 0
    ? config.lapDurationMs / 1000
    : 0.001;
  return routeFor(config?.startSide === -1 ? -1 : 1).length / duration;
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
  const route = routeFor(startSide);
  const totalLength = route.length;
  const progress = Number.isFinite(elapsedMs)
    ? Math.max(0, Math.min(1, elapsedMs / duration))
    : 0;
  const distance = totalLength * progress;

  // Resolve pose in logarithmic time from precomputed arc-length metadata.
  // Heading uses a short symmetric chord to avoid steering snaps at hairpins.
  const position = progress >= 1
    ? route.points[route.points.length - 1]
    : pointAtDistance(route, distance);
  const tangentHalfWidth = Math.min(0.2, totalLength / 1000);
  const before = pointAtDistance(route, distance - tangentHalfWidth);
  const after = pointAtDistance(route, distance + tangentHalfWidth);
  const heading = Math.atan2(-(after[0] - before[0]), -(after[1] - before[1]));

  return {
    x: position[0],
    z: position[1],
    heading,
    finished: progress >= 1,
    progress,
  };
}


export interface RaceRivalOutcome {
  outcome: 'victory' | 'defeat' | 'photo-finish';
  marginMs: number;
}

/**
 * Compare the player's validated finish with the rival's scheduled finish.
 * A difference of one displayed tenth or less is reported as a photo finish.
 * Invalid timings return null and can never create a false result.
 */
export function resolveRaceRivalOutcome(
  playerElapsedMs: number,
  rivalElapsedMs: number,
): RaceRivalOutcome | null {
  if (
    !Number.isFinite(playerElapsedMs) ||
    playerElapsedMs < 0 ||
    !Number.isFinite(rivalElapsedMs) ||
    rivalElapsedMs < 0
  ) {
    return null;
  }

  const difference = playerElapsedMs - rivalElapsedMs;
  const marginMs = Math.abs(difference);
  if (marginMs <= 100) return { outcome: 'photo-finish', marginMs };
  return {
    outcome: difference < 0 ? 'victory' : 'defeat',
    marginMs,
  };
}
