/**
 * The surveyed East Circus oval, as the rival route.
 *
 * LADDER-1B2 — the clocks retired. This module no longer resolves a rival
 * pose from elapsed time: `getRaceRivalPose` and the 1v1
 * `resolveRaceRivalOutcome` are gone with the deterministic lap clocks, and
 * the rivals drive through `rivalDriver.ts` instead. What stays is the
 * route itself — the driver's reference path — plus the lane source and the
 * field finish order:
 *
 *   • `RACE_LANE_OFFSET` stays the single source for the lane (1B's rule:
 *     `raceGrid.ts` imports it, a second literal would let the two drift);
 *   • `getRivalRoute` exposes the sampled route (points, arc lengths,
 *     length) for the driver — no second circuit is built anywhere;
 *   • `getRaceRivalSpeed` stays as the route's mean-speed helper: route
 *     length over the configured lap time. The driver profiles derive their
 *     pace cap from it, and `raceFormation.test.ts` still pins it;
 *   • `resolveFieldFinishOrder` stays and is fed driven finish times.
 *
 * The module is still renderer- and storage-free.
 */
import { CIRCUS_AXIS_X } from './collisionShapes';
import { CIRCUS_RACE_START } from './circusDistrictGeometry';
import { RACE_NORTH_TURN_Z } from './raceLap';

export interface RaceRivalConfig {
  /** Target lap duration. Must be finite and positive. */
  lapDurationMs: number;
  /** +1 starts on the east lane; -1 starts on the west lane. */
  startSide: -1 | 1;
}

// The measured sand is 16.8 units wide (X 43.940..60.740), so ±7.8
// keeps the rival's centreline inside the playable surface with 0.6 units
// of margin while clearing raceLap.ts's inclusive lane threshold.
// Exported (LADDER-1B): the rolling start ends on these same lanes, so
// `raceGrid.ts` imports this value rather than restating it — the end of a
// roll path is the start of the shipped route, by construction, and a second
// literal would let the two drift apart.
export const RACE_LANE_OFFSET = 7.8;

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
  const startX = CIRCUS_AXIS_X + startSide * RACE_LANE_OFFSET;
  const otherX = CIRCUS_AXIS_X + otherSide * RACE_LANE_OFFSET;
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

/** The sampled route, as the driver consumes it: points, arc lengths, length. */
export interface RivalRoute {
  points: ReadonlyArray<readonly [number, number]>;
  cumulativeDistances: ReadonlyArray<number>;
  length: number;
}

function routeFor(startSide: -1 | 1): SampledRoute {
  return startSide === -1 ? WEST_FIRST_SAMPLED_ROUTE : EAST_FIRST_SAMPLED_ROUTE;
}

/**
 * LADDER-1B2 — the driver's reference path. The driver reuses this route;
 * it does not build a second circuit. Both flanks share one length.
 */
export function getRivalRoute(startSide: -1 | 1): RivalRoute {
  return routeFor(startSide === -1 ? -1 : 1);
}

/** The route's length (157.6 units), shared by both flanks. */
export const RACE_ROUTE_LENGTH = WEST_FIRST_SAMPLED_ROUTE.length;

/**
 * The route's mean speed for the configured lap: route length over lap time.
 * LADDER-1B2 — kept as the mean-speed helper (the clock pose is gone): the
 * driver profiles derive their pace cap from it, and the formation suite
 * still pins it. Both flanks share one length, so the speed is side-free.
 */
export function getRaceRivalSpeed(config: RaceRivalConfig): number {
  const duration = Number.isFinite(config?.lapDurationMs) && config.lapDurationMs > 0
    ? config.lapDurationMs / 1000
    : 0.001;
  return routeFor(config?.startSide === -1 ? -1 : 1).length / duration;
}

/**
 * LADDER-1B — the full field, in place order, from finish times.
 *
 * The 1v1 helper above still answers a two-rig race; a multi-rival field
 * needs places for every rig and one outcome for the settlement. Places come
 * from the finish times alone (fastest first); the outcome is the 1v1 rule
 * read against the nearest competitor — victory iff the player is 1st AND
 * more than 100 ms clear of 2nd, photo-finish iff the player is within
 * 100 ms of the leader (or of 2nd while 1st), defeat otherwise. Invalid
 * timings, a field with no player, or a field of one return null and can
 * never create a false result; the scene keeps its shipped `settleRaceCompletion`
 * call with this single derived outcome.
 */
export interface RaceFieldFinisher {
  id: string;
  name: string;
  /** Finish elapsed in ms, measured from the race clock origin (the leader's crossing). */
  finishMs: number;
  isPlayer: boolean;
}

export interface RaceFieldPlacement {
  place: number;
  id: string;
  name: string;
  finishMs: number;
  isPlayer: boolean;
}

export interface RaceFieldFinishOrder {
  places: RaceFieldPlacement[];
  outcome: 'victory' | 'defeat' | 'photo-finish';
  /** |player − nearest competitor| in ms: 2nd when the player is 1st, the leader otherwise. */
  marginMs: number;
}

export function resolveFieldFinishOrder(
  finishers: readonly RaceFieldFinisher[],
): RaceFieldFinishOrder | null {
  if (!Array.isArray(finishers) || finishers.length < 2) return null;
  const player = finishers.find((f) => f.isPlayer);
  if (!player) return null;
  for (const f of finishers) {
    if (
      typeof f.id !== 'string' ||
      typeof f.name !== 'string' ||
      !Number.isFinite(f.finishMs) ||
      f.finishMs < 0
    ) {
      return null;
    }
  }

  const sorted = [...finishers].sort((a, b) => {
    if (a.finishMs !== b.finishMs) return a.finishMs - b.finishMs;
    // An exact tie is decided by the field order the caller supplied; the
    // player takes the earlier place, so a dead heat is never a loss.
    if (a.isPlayer !== b.isPlayer) return a.isPlayer ? -1 : 1;
    return 0;
  });
  const places: RaceFieldPlacement[] = sorted.map((f, index) => ({
    place: index + 1,
    id: f.id,
    name: f.name,
    finishMs: f.finishMs,
    isPlayer: f.isPlayer,
  }));
  const playerPlace = places.find((p) => p.isPlayer)?.place ?? 0;
  const nearest = playerPlace === 1 ? places[1] : places[0];
  const marginMs = Math.abs(player.finishMs - nearest.finishMs);
  const outcome = marginMs <= 100
    ? 'photo-finish'
    : playerPlace === 1
      ? 'victory'
      : 'defeat';
  return { places, outcome, marginMs };
}
