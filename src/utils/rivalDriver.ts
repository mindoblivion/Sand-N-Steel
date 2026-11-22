// rivalDriver.ts — LADDER-1B2: the rival AI driver.
//
// The 1B clock (`getRaceRivalPose`) is retired. A rival is now a rig like the
// player's: it advances through `advanceChariot` on the fixed timestep, and
// this module is the brain that hands it a `ChariotInput` each tick. The
// driver never moves a rig itself — it only ever returns an input, and the
// movement module owns the motion, the boundary and the speed.
//
// ── The line ────────────────────────────────────────────────────────────────
// The offset is a pure function of the route distance `s` (the brief's §4):
// a straight offset from `metaSkill` — `(metaSkill − 0.5) × 0.5`, so a rookie
// (0.30) sits 0.10 OUTSIDE its lane and Aulus (0.80) 0.15 inside it — blended
// to a meta offset of `0.3 + metaSkill × 1.2` inside (0.66 … 1.26) by a
// weight `w(s) = sin²(heading(s))`: 0 on both straights (heading 0 or π),
// 1 at each hairpin's apex (heading ±π/2), ~0.8 on the south diagonal's
// steady heading. The blend is a cosine-shaped bump over each turn, so the
// rig tightens on the approach and is back on its lane before the checkpoint.
// The south diagonal is where the weight earns its keep: the route's own
// south "hairpin" is a diagonal cut ending in a sharp north hook, and the
// lap checkpoint only registers ~0.1 units before the finish line — an
// inside offset pulls the rig onto its lane early, which is what makes the
// lap complete. (Measured Nov 19 2026: the route's heading peaks at 4.25
// rad unwrapped on the diagonal and returns to π at the hook, so the
// weight rises 0 → 0.80 → 0 along it.)
//
// ── The steering ────────────────────────────────────────────────────────────
// Pure pursuit toward a point 2 units ahead on the offset line (gain 3).
// The lookahead is short on purpose: the south hook is a near-cusp, and a
// long lookahead lets the target point wrap onto the next lap's straight
// while the rig is still on the diagonal — the rig then turns north early,
// cuts inside, and misses its lane (the lap checkpoint only registers
// ~0.1 units before the finish). A heading-plus-correction controller was
// tried and rejected: its lateral correction is too gentle to pull a rig
// back once it drifts inside at the hook, and it beached on the west wall.
// The line offset is read at the lookahead point too, so the rig is back
// on its lane by the hook's end instead of arriving a unit inside (north):
// a rig a unit north of the hook's end must drive south to cross the
// finish, straight into the south wall (the nose probe reaches the wall
// when the body is 1.3 units short of the line).
//
// ── The pace ────────────────────────────────────────────────────────────────
// The target speed is the profile's mean speed (`route length / lap
// seconds`, the `paceCapFactor` derivation) and the driver NEVER exceeds it
// — there is no rubber-banding: a rival behind does not speed up to catch
// up, it simply holds its own pace. The throttle is bang-bang with
// hysteresis, which is the correct controller for this physics: the movement
// module applies NO drag while the throttle is positive (only throttle == 0
// coasts, at 3 u/s²), so any positive throttle accelerates and a steady
// speed is a pulse. The hysteresis is ±0.05 u/s; the brake (−1) only fires
// when the speed is more than 0.5 above the CORNER limit ahead, never to
// chase the pace cap (the handoff's 5 u/s roll speed decays by coasting).
//
// The corner limit is the other half of the pace: route curvature ahead
// caps speed using the movement module's own turn-rate curve
// (`v·κ ≤ 0.35 + 0.0885·v`). Curvature is measured over the forward
// `RIVAL_CORNER_WINDOW` (currently 1.5 route units), not the steering
// controller's separate 2-unit pursuit target. This deliberately reads the
// concentrated south-hook curvature closely; the tradeoff is a slow hook and
// a queue in full-field races. The soak records the resulting lap-time spread
// rather than hiding it. Any change to this window needs the full-field soak
// and driveable-outline regression, not just a single-rig lap.
//
// ── The windows ─────────────────────────────────────────────────────────────
// A pass is honest: it opens only when the lateral room on the inside, from
// the leader's inside edge to the inside limit, fits the follower's width
// plus the brief's margin (straight +0.4, meta-exit +0.3 with the leader
// wide), AND the follower has a pace advantage (its target speed exceeds
// the leader's actual speed by ≥ 0.02 u/s — the adjacent League lap-time
// gaps are ~0.045 u/s, so a 0.15 margin would make League passes
// impossible). The pass line sits the follower's centre
// `(wL + wF)/2 + margin` inside the leader's centre. A window that closes
// mid-pass tucks the follower back to its line — no contact, no shove.
//
// ── The defense ─────────────────────────────────────────────────────────────
// A leader whose aggression is ≥ 0.60 may make ONE lateral line change per
// straight to cover the inside, and only while the follower is still more
// than one rig length (3.05) behind and closing. One move: the state records
// the straight it happened on, and a second follower on the same straight
// gets nothing. Below 0.60 a rival never defends.
//
// ── The warnings hook ───────────────────────────────────────────────────────
// The driver takes a `warning` input (`none` | `initiator` | `innocent`)
// and nothing in 1B2 ever sets it. A warned initiator steers to clear
// (0.5 outside its lane, 80% pace); a warned innocent holds its line — the
// two inputs are wired and tested, the steward that would set them is 1C's.
//
// ── The RNG ─────────────────────────────────────────────────────────────────
// One seeded draw per driver, at creation: a ±0.1 line jitter, so two
// identical-profile rivals do not drive the exact same line. The seed
// defaults to the competitor's field index; a caller may inject its own
// `rng` (the tests do, so the jitter is deterministic there).

import {
  RACE_LANE_OFFSET,
  RACE_ROUTE_LENGTH,
  getRivalRoute,
} from './raceRival';
import { CIRCUS_AXIS_X } from './collisionShapes';
import {
  CHARIOT_DRIVEABLE_OUTLINE,
  CHARIOT_MOVEMENT,
  chariotTurnRate,
  pointInDriveableArea,
  type ChariotInput,
} from './chariotMovement';
import { getTeamWidth } from './chariotTeamFormation';
import type { ChariotTeamSize } from '../types/game';
import { RIG_BODY_RADIUS } from './raceRigCollision';
import {
  resolveRivalDriverProfile,
  type RivalDriverProfile,
} from './raceCompetitors';

// ─────────────────────────────────────────────────────────────────────────────
// Tuning — the driver's own constants (the movement module's are untouched)
// ─────────────────────────────────────────────────────────────────────────────

/** Pure-pursuit lookahead, in route units. Short on purpose: the south hook is a near-cusp, and a long lookahead lets the target point wrap onto the next lap's straight while the rig is still on the diagonal — the rig then turns north early, cuts inside, and misses its lane (the lap checkpoint only registers ~0.1 units before the finish). A short lookahead keeps the target on the diagonal until the rig is at the hook's end; the turn north happens after the finish, where there is room to the east. */
export const RIVAL_DRIVER_LOOKAHEAD = 2;
/** Steering gain on the heading error (rad → steer). */
export const RIVAL_DRIVER_STEER_GAIN = 3;
/** How far ahead a rival looks for a rig to pass or defend against, in route units. */
export const RIVAL_DRIVER_OVERTAKE_LOOKAHEAD = 12;
/** One rig length, in route units — the defense and pass-completion measure. */
export const RIVAL_RIG_LENGTH = 3.05;
/** The follow distance: a rig within this far behind another, with no open window, holds the leader's speed instead of its own pace. Six units — a rig length plus the nose (2.02 ahead of the body) plus braking room, so the follower's nose never reaches the leader's body while it sheds speed. */
export const RIVAL_FOLLOW_DISTANCE = 6;
/** The defense threshold: aggression at or above this defends (§7 default). */
export const RIVAL_DEFENSE_THRESHOLD = 0.6;
/** The straight-window margin (§7 default): room ≥ widths + this. */
export const RIVAL_STRAIGHT_WINDOW_MARGIN = 0.4;
/** The meta-exit-window margin (§7 default). */
export const RIVAL_META_EXIT_WINDOW_MARGIN = 0.3;
/** The pace-advantage margin: a pass needs the follower's target above the leader's actual speed by this. */
export const RIVAL_PACE_ADVANTAGE_MARGIN = 0.02;
/** The throttle hysteresis band around the target speed. */
export const RIVAL_DRIVER_SPEED_HYSTERESIS = 0.05;
/** How far above the corner limit the speed must be before the driver brakes. */
export const RIVAL_DRIVER_BRAKE_MARGIN = 0.5;
/** The corner-speed lookahead window, in route units. The current 1.5-unit window reads the hook's concentrated curvature closely enough for the rival to make the turn without leaving the driveable outline. The full-field soak records the resulting queue and lap-time tradeoff; do not change this value without rerunning that simulation and the Samsung race profiler. */
export const RIVAL_CORNER_WINDOW = 1.5;
/** The warned initiator's clearance: this far outside its lane, at this pace fraction. */
export const RIVAL_WARNING_CLEAR_OFFSET = -0.5;
export const RIVAL_WARNING_PACE_FRACTION = 0.8;

// ─────────────────────────────────────────────────────────────────────────────
// Seeded RNG — mulberry32, one draw per driver
// ─────────────────────────────────────────────────────────────────────────────

/** A small seeded PRNG (mulberry32): the same seed draws the same numbers. */
export function mulberry32(seed: number): () => number {
  let state = (Number.isFinite(seed) ? seed : 0) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Route analysis — the driver's reference path, analysed once per side
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The route, analysed once per side and cached: the per-sample heading, the
 * meta weight (`sin²(heading)`), and the corner speed — the fastest the
 * movement module's turn rate can follow the route's curvature there.
 * The analysis is read-only and shared by every driver on that side.
 */
export interface RivalRouteAnalysis {
  side: 1 | -1;
  length: number;
  points: readonly (readonly [number, number])[];
  cumulativeDistances: readonly number[];
  headings: readonly number[];
  /** The per-sample heading, unwrapped so it is continuous around the loop. */
  unwrappedHeadings: readonly number[];
  /** `sin²(heading)`: 0 on the straights, 1 at each hairpin's apex. */
  metaWeight: readonly number[];
  /** The corner speed per `cornerStep` units of arc (see `cornerSpeedAt`). */
  cornerSpeed: readonly number[];
  /** The arc step of `cornerSpeed` (0.5 units). */
  cornerStep: number;
  /** The inside limit per sample index, computed once and cached. */
  insideLimitCache: Map<number, number>;
}

const routeAnalysisCache = new Map<1 | -1, RivalRouteAnalysis>();

/** The circuit's centroid, in (x, z) — the inside direction points at it. */
const CIRCUIT_CENTROID: readonly [number, number] = [CIRCUS_AXIS_X, 5.85];

/** The turn-rate curve's slope: `turnRate(v) = 0.35 + 0.0885·v` for v ≤ 13. */
const TURN_RATE_SLOPE = (CHARIOT_MOVEMENT.turnRateAtMaxSpeed - CHARIOT_MOVEMENT.turnRateAtRest) / CHARIOT_MOVEMENT.maxSpeed;

/**
 * The fastest a rig can follow a curve of curvature κ: solve
 * `v·κ ≤ turnRate(v)` from the movement module's own curve. Above the
 * movement cap there is no limit; below the slope the curve is gentle
 * enough for any speed.
 */
export function cornerSpeedForCurvature(curvature: number): number {
  const kappa = Number.isFinite(curvature) ? curvature : 0;
  if (kappa <= TURN_RATE_SLOPE) return CHARIOT_MOVEMENT.maxSpeed;
  const limit = CHARIOT_MOVEMENT.turnRateAtRest / (kappa - TURN_RATE_SLOPE);
  return Math.min(Math.max(limit, 0.8), CHARIOT_MOVEMENT.maxSpeed);
}

function wrapAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

interface RivalRouteShape {
  points: readonly (readonly [number, number])[];
  cumulativeDistances: readonly number[];
  length: number;
}

/** The (unwrapped) heading at an arc distance, interpolated between samples. */
function headingAtArc(route: RivalRouteShape, unwrappedHeadings: readonly number[], s: number): number {
  const wrapped = ((s % route.length) + route.length) % route.length;
  const n = route.cumulativeDistances.length;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (route.cumulativeDistances[mid] < wrapped) lo = mid + 1;
    else hi = mid;
  }
  const idx = lo;
  if (idx === 0) return unwrappedHeadings[0];
  const d0 = route.cumulativeDistances[idx - 1];
  const d1 = route.cumulativeDistances[idx];
  const span = d1 - d0 || 1e-9;
  const t = Math.min(Math.max((wrapped - d0) / span, 0), 1);
  return unwrappedHeadings[idx - 1] + (unwrappedHeadings[idx] - unwrappedHeadings[idx - 1]) * t;
}

/** Analyse the route for one side (cached — the route never changes). */
export function analyzeRivalRoute(side: 1 | -1): RivalRouteAnalysis {
  const cached = routeAnalysisCache.get(side);
  if (cached) return cached;

  const route = getRivalRoute(side);
  const n = route.points.length;
  const headings: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = route.points[i];
    const b = route.points[(i + 1) % n];
    headings[i] = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
  }
  const metaWeight = headings.map((h) => {
    const s = Math.sin(h);
    return s * s;
  });

  // The unwrapped heading, continuous around the loop (the route's total
  // turn is not 2π — the south "hairpin" is a diagonal cut, so the heading
  // rises 0 → π → ~4.25 → π → 0 — but the unwrap is continuous, which is
  // what the interpolation needs).
  const unwrappedHeadings: number[] = new Array(n);
  unwrappedHeadings[0] = headings[0];
  for (let i = 1; i < n; i++) {
    unwrappedHeadings[i] = unwrappedHeadings[i - 1] + wrapAngle(headings[i] - headings[i - 1]);
  }

  // The corner speed, per 0.5 units of ARC (not per sample — the samples
  // are non-uniform: two for a 65-unit straight, 512 for a 25-unit curve,
  // so a per-sample window smears a corner across the whole straight).
  // The curvature at an arc position is the heading change over the NEXT
  // `RIVAL_CORNER_WINDOW` units (the lookahead scale): the pure pursuit
  // smooths the route over its lookahead, so the rig's effective curvature
  // is the route's heading change over that window, not the raw per-sample
  // tangent — the south hook's last control leg is a near-cusp (the tangent
  // swings 2.58 rad in 0.6 units of arc) that no rig follows literally. A
  // forward window also never smears a corner BACKWARD past the line: at
  // s = 0 the window is the straight ahead, so the limit there is the cap.
  // The active window is `RIVAL_CORNER_WINDOW` (currently 1.5 units).
  // Keep this explanation tied to the constant: changing the tuning requires
  // rerunning the full-field soak and checking the driveable-outline result.
  const cornerStep = 0.5;
  const cornerCount = Math.ceil(route.length / cornerStep);
  const cornerSpeed: number[] = new Array(cornerCount);
  for (let k = 0; k < cornerCount; k++) {
    const s = k * cornerStep;
    const h0 = headingAtArc(route, unwrappedHeadings, s);
    const h1 = headingAtArc(route, unwrappedHeadings, s + RIVAL_CORNER_WINDOW);
    const curvature = Math.abs(wrapAngle(h1 - h0)) / RIVAL_CORNER_WINDOW;
    cornerSpeed[k] = cornerSpeedForCurvature(curvature);
  }

  const analysis: RivalRouteAnalysis = {
    side,
    length: route.length,
    points: route.points,
    cumulativeDistances: route.cumulativeDistances,
    headings,
    unwrappedHeadings,
    metaWeight,
    cornerSpeed,
    cornerStep,
    insideLimitCache: new Map(),
  };
  routeAnalysisCache.set(side, analysis);
  return analysis;
}

/** The sample index nearest a route distance (wrapping). */
export function routeSampleAt(analysis: RivalRouteAnalysis, s: number): number {
  const n = analysis.cumulativeDistances.length;
  const wrapped = ((s % analysis.length) + analysis.length) % analysis.length;
  // Binary search: the cumulative distances are increasing.
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (analysis.cumulativeDistances[mid] < wrapped) lo = mid + 1;
    else hi = mid;
  }
  const idx = lo;
  if (idx > 0) {
    const prev = analysis.cumulativeDistances[idx - 1];
    const next = analysis.cumulativeDistances[idx];
    return wrapped - prev < next - wrapped ? idx - 1 : idx;
  }
  return idx;
}

/** The route's heading at an arc distance, wrapped to (−π, π]. */
export function routeHeadingAt(analysis: RivalRouteAnalysis, s: number): number {
  const wrapped = ((s % analysis.length) + analysis.length) % analysis.length;
  const n = analysis.cumulativeDistances.length;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (analysis.cumulativeDistances[mid] < wrapped) lo = mid + 1;
    else hi = mid;
  }
  const idx = lo;
  let h: number;
  if (idx === 0) {
    h = analysis.unwrappedHeadings[0];
  } else {
    const d0 = analysis.cumulativeDistances[idx - 1];
    const d1 = analysis.cumulativeDistances[idx];
    const span = d1 - d0 || 1e-9;
    const t = Math.min(Math.max((wrapped - d0) / span, 0), 1);
    h = analysis.unwrappedHeadings[idx - 1] + (analysis.unwrappedHeadings[idx] - analysis.unwrappedHeadings[idx - 1]) * t;
  }
  return wrapAngle(h);
}

/** The route point at a distance `s` (linear interpolation between samples). */
export function routePointAt(analysis: RivalRouteAnalysis, s: number): readonly [number, number] {
  const n = analysis.points.length;
  const wrapped = ((s % analysis.length) + analysis.length) % analysis.length;
  const idx = routeSampleAt(analysis, wrapped);
  const next = (idx + 1) % n;
  const d0 = analysis.cumulativeDistances[idx];
  const d1 = idx + 1 < n ? analysis.cumulativeDistances[idx + 1] : analysis.length;
  const span = d1 - d0 || 1e-9;
  const t = Math.min(Math.max((wrapped - d0) / span, 0), 1);
  const a = analysis.points[idx];
  const b = analysis.points[next];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * The inside normal at a route distance — the unit vector toward the circuit
 * centroid, perpendicular to the route's tangent. Positive offsets along it
 * move a rig toward the axis.
 */
export function routeInsideNormalAt(analysis: RivalRouteAnalysis, s: number): readonly [number, number] {
  const idx = routeSampleAt(analysis, s);
  const n = analysis.points.length;
  const a = analysis.points[idx];
  const b = analysis.points[(idx + 1) % n];
  const tx = b[0] - a[0];
  const tz = b[1] - a[1];
  const tLen = Math.hypot(tx, tz) || 1;
  const ux = tx / tLen;
  const uz = tz / tLen;
  // The centroid direction, with its along-tangent component removed.
  let cx = CIRCUIT_CENTROID[0] - a[0];
  let cz = CIRCUIT_CENTROID[1] - a[1];
  const dot = cx * ux + cz * uz;
  cx -= dot * ux;
  cz -= dot * uz;
  const cLen = Math.hypot(cx, cz);
  if (cLen < 1e-9) return [0, 0];
  return [cx / cLen, cz / cLen];
}

/**
 * Project a pose onto the route, searching a window of SEGMENTS around a
 * hint segment so the call stays allocation-light per tick. Returns the
 * wrapped route distance, the segment index (the next call's hint), and
 * the lateral offset in inside units (positive = toward the axis).
 *
 * Segments, not samples: the northbound straight is a single 65-unit
 * segment, so a sample window cannot track a rig on it (there are only
 * two samples for the whole straight), while a segment projection gives
 * the exact distance along it. The route is a closed loop whose last
 * point repeats the first, so the degenerate closing segment (last → first,
 * zero length) is excluded — otherwise the line point ties between s = 0
 * and s = route length and the driver pins itself at the lap's end.
 *
 * Continuity: only candidates whose PROJECTED s is within ±1.5 units of
 * arc of the hint s are considered — a rig moves at most 0.22 units per
 * tick (13 u/s at 1/60), so its true position is always inside that
 * window, and a candidate outside it is a jump, not a move. The hint s
 * is the rig's own current s (its totalS, wrapped), not the hint
 * segment's start: segment 0 spans 65 units, so a window around its
 * start (0) would admit the whole straight while the rig is at s = 30.
 * The window is what stops the projection snapping onto the diagonal at
 * the south end: the diagonal cuts across the track and passes 0.66
 * units from a rig 3.56 off its line on the northbound straight, so a
 * purely geometric nearest-segment search returns the diagonal
 * (s ≈ 154) and the driver thinks the rig is at the lap's end instead
 * of 2.4 past the line — it steers in circles at the line and its lap
 * count goes negative. The score then adds a small arc penalty (0.5
 * units per unit of arc from the hint's s) and a 1.0 stickiness bonus
 * for the hint segment and its neighbours, which only break near-ties
 * inside the window. (A large arc penalty backfires on its own: the
 * route's end wraps to arc 0 at the line, so a rig 5 units past the
 * line is "nearer" in arc to the diagonal's end than to its own
 * straight.)
 */
export function projectToRoute(
  analysis: RivalRouteAnalysis,
  x: number,
  z: number,
  hintS: number,
  hintIndex: number
): { s: number; index: number; lateral: number } {
  const n = analysis.points.length;
  // The real segments are 0 … n−2 (points[i] → points[i+1]); segment n−1
  // is the degenerate closing segment (last point → first point, zero
  // length) and is never searched.
  const segCount = n - 1;
  const window = 40;
  const hint = Number.isFinite(hintIndex) ? ((Math.round(hintIndex) % segCount) + segCount) % segCount : 0;
  const length = analysis.length;
  // The hint s, wrapped into [0, length) — the rig's own current s, not
  // the hint segment's start (segment 0 spans 65 units, so a window
  // around its start would admit the whole straight).
  const hs = Number.isFinite(hintS) ? (((hintS % length) + length) % length) : 0;
  let best = -1;
  let bestScore = Infinity;
  let bestT = 0;
  let bestK = Infinity;
  for (let k = -window; k <= window; k++) {
    const i = (hint + k + segCount) % segCount;
    const a = analysis.points[i];
    const b = analysis.points[i + 1];
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const lenSq = ex * ex + ez * ez;
    let t = lenSq > 0 ? ((x - a[0]) * ex + (z - a[1]) * ez) / lenSq : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = a[0] + ex * t;
    const qz = a[1] + ez * t;
    const dx = x - qx;
    const dz = z - qz;
    const distSq = dx * dx + dz * dz;
    // The candidate's arc position, and how far it is from the hint's —
    // wrapped, so the line's two ends are adjacent, not 157 units apart.
    // A candidate whose projected s is more than 6 units of arc from
    // the hint is a jump, not a move, and is skipped outright. Six, not
    // 1.5: a rig that swung wide off its line (u ≈ 3–4 at the hook) has
    // its nearest route point several units of arc from its last s, and
    // a 1.5-unit window cannot see it — the projection falls back to the
    // hint, the driver's s freezes, and the rig steers in circles at the
    // hook for the whole race. Six still blocks the diagonal snap (a
    // ~150-unit jump) while letting a wide rig recover.
    const d0 = analysis.cumulativeDistances[i];
    const d1 = analysis.cumulativeDistances[i + 1];
    const segS = d0 + (d1 - d0) * t;
    let arcDist = segS - hs;
    while (arcDist > length / 2) arcDist -= length;
    while (arcDist < -length / 2) arcDist += length;
    if (Math.abs(arcDist) > 6) continue;
    const score = distSq + (arcDist * 0.5) * (arcDist * 0.5) - (Math.abs(k) <= 1 ? 1 : 0);
    // Ties break toward the hint (the smaller |k|): at the line point the
    // straight's start and the diagonal's end are the SAME point, both
    // distance 0, and the loop reaches k = −1 (the diagonal) before k = 0
    // — without this the driver is created on the diagonal (totalS =
    // 157.61), thinks it is approaching the hook while actually driving
    // north on the straight, brakes to the hook's corner limit, and never
    // recovers.
    if (score < bestScore - 1e-12 || (Math.abs(score - bestScore) <= 1e-12 && Math.abs(k) < Math.abs(bestK))) {
      bestScore = score;
      best = i;
      bestT = t;
      bestK = k;
    }
  }
  if (best < 0) best = hint;
  const d0 = analysis.cumulativeDistances[best];
  const d1 = analysis.cumulativeDistances[best + 1];
  const s = d0 + (d1 - d0) * bestT;
  const a = analysis.points[best];
  const b = analysis.points[best + 1];
  const ex = b[0] - a[0];
  const ez = b[1] - a[1];
  const qx = a[0] + ex * bestT;
  const qz = a[1] + ez * bestT;
  const normal = routeInsideNormalAt(analysis, s);
  const lateral = (x - qx) * normal[0] + (z - qz) * normal[1];
  return { s, index: best, lateral };
}

// ─────────────────────────────────────────────────────────────────────────────
// The pace cap — a target speed, never a rubber-band
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The driver's target speed: the profile's mean speed, `route length / lap
 * seconds` — the `paceCapFactor` derivation, so a lap-time change re-derives
 * it. The driver never commands above this, and never speeds up to catch a
 * rival: there is no rubber-banding anywhere in this module.
 */
export function resolveDriverPaceCap(profile: RivalDriverProfile): number {
  const reference = RACE_ROUTE_LENGTH / 58;
  return profile.paceCapFactor * reference;
}

/**
 * The corner-speed limit at a route distance: the precomputed value for the
 * forward `RIVAL_CORNER_WINDOW` arc. This is the anticipation distance used
 * by route analysis; the value is tuned against the full-field soak, while
 * actual steering and driveable-outline recovery remain movement-system work.
 */
export function rivalSpeedLimitAt(analysis: RivalRouteAnalysis, s: number): number {
  const wrapped = ((s % analysis.length) + analysis.length) % analysis.length;
  const idx = Math.min(
    Math.floor(wrapped / analysis.cornerStep),
    analysis.cornerSpeed.length - 1
  );
  return analysis.cornerSpeed[idx];
}

// ─────────────────────────────────────────────────────────────────────────────
// The inside limit — how far inside the lane a rig can go at a route distance
// ─────────────────────────────────────────────────────────────────────────────

import { SPINA_TIP_BOX, distanceToSpinaTipBox } from './raceGrid';

/**
 * The largest inside offset (in inside units) a rig's body centre can take
 * at a route distance before its body probe (r 1.05) comes within 0.3 of the
 * spina tip box or leaves the driveable outline. Scanned outward in 0.25
 * steps — the spina is a hole in the middle of the floor, so the valid
 * region is not monotone and a binary search would land on the wrong side
 * of it. On a straight beside the spina this is ~5.6; at the diagonal's
 * midpoint (where the route itself threads the tip) it is 0.
 */
export function insideLimitAt(analysis: RivalRouteAnalysis, s: number): number {
  const idx = routeSampleAt(analysis, s);
  const cached = analysis.insideLimitCache.get(idx);
  if (cached !== undefined) return cached;
  const p = routePointAt(analysis, s);
  const n = routeInsideNormalAt(analysis, s);
  const clearance = RIG_BODY_RADIUS + 0.3;
  let limit = 8;
  for (let u = 0; u <= 8; u += 0.25) {
    const x = p[0] + n[0] * u;
    const z = p[1] + n[1] * u;
    if (!pointInDriveableArea(x, z) || distanceToSpinaTipBox(x, z) < clearance) {
      limit = Math.max(u - 0.25, 0);
      break;
    }
  }
  analysis.insideLimitCache.set(idx, limit);
  return limit;
}

/** The spina tip box, re-exported for the tests that pin the inside limit. */
export const RIVAL_SPINA_TIP_BOX = SPINA_TIP_BOX;

// ─────────────────────────────────────────────────────────────────────────────
// Overtake windows — honest, margin-checked, pure functions of the numbers
// ─────────────────────────────────────────────────────────────────────────────

export interface RivalWindowArgs {
  /** The leader's lateral offset, in inside units (positive = toward the axis). */
  leaderU: number;
  /** The leader's rig width (Biga 1.5, Triga ~2.2, Quadra 2.94). */
  leaderWidth: number;
  /** The follower's rig width. */
  followerWidth: number;
  /** The inside limit at this route distance (from `insideLimitAt`). */
  insideLimit: number;
}

export interface RivalWindow {
  open: boolean;
  /** The follower's centre offset, in inside units, if it takes the window. */
  passOffset: number;
}

/**
 * The straight window (§7 default): open when the lateral room on the
 * inside, from the leader's inside edge to the inside limit, fits the
 * follower's width plus 0.4. The pass line sits the follower's centre
 * `(wL + wF)/2 + 0.4` inside the leader's centre.
 */
export function straightWindowOpen(args: RivalWindowArgs): RivalWindow {
  const room = args.insideLimit - (args.leaderU + args.leaderWidth / 2);
  const open = room >= args.followerWidth + RIVAL_STRAIGHT_WINDOW_MARGIN;
  return {
    open,
    passOffset:
      args.leaderU +
      (args.leaderWidth + args.followerWidth) / 2 +
      RIVAL_STRAIGHT_WINDOW_MARGIN,
  };
}

/**
 * The meta-exit window (§7 default): the same room check with a 0.3 margin,
 * and only when the leader is on the wide line (`uL ≤ 0.2`) — the gap the
 * leader left by going wide is the one the follower takes.
 */
export function metaExitWindowOpen(args: RivalWindowArgs): RivalWindow {
  const leaderWide = args.leaderU <= 0.2;
  const room = args.insideLimit - (args.leaderU + args.leaderWidth / 2);
  const open = leaderWide && room >= args.followerWidth + RIVAL_META_EXIT_WINDOW_MARGIN;
  return {
    open,
    passOffset:
      args.leaderU +
      (args.leaderWidth + args.followerWidth) / 2 +
      RIVAL_META_EXIT_WINDOW_MARGIN,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The route zone — where on the circuit a rig is, for the window choice
// ─────────────────────────────────────────────────────────────────────────────

export type RivalRouteZone = 'straight' | 'meta' | 'meta-exit';

/**
 * The zone at a route distance, from the meta weight: below 0.05 is a
 * straight (or a meta exit, if the weight was above 0.5 within the last 10
 * units behind — the rig just came out of a turn); a rising weight is a
 * meta entry, a falling one a meta exit.
 */
export function routeZoneAt(analysis: RivalRouteAnalysis, s: number): RivalRouteZone {
  const w = analysis.metaWeight[routeSampleAt(analysis, s)];
  if (w < 0.05) {
    for (let d = 1; d <= 10; d += 1) {
      if (analysis.metaWeight[routeSampleAt(analysis, s - d)] > 0.5) return 'meta-exit';
    }
    return 'straight';
  }
  const ahead = analysis.metaWeight[routeSampleAt(analysis, s + 1)];
  return ahead < w ? 'meta-exit' : 'meta';
}

/**
 * The straight a route distance is on, for the defense's "one move per
 * straight": 0 = the northbound straight (heading ≈ 0), 1 = the southbound
 * straight (heading ≈ ±π), null = in a turn.
 */
export function straightIdAt(analysis: RivalRouteAnalysis, s: number): number | null {
  const h = analysis.headings[routeSampleAt(analysis, s)];
  if (Math.abs(h) < 0.3) return 0;
  if (Math.abs(Math.abs(h) - Math.PI) < 0.3) return 1;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The driver — state, creation, and one tick
// ─────────────────────────────────────────────────────────────────────────────

/** One rig in the field, as the driver sees it. */
export interface RivalRigSnapshot {
  id: string;
  /** Route distance (wrapped, 0 … route length). */
  s: number;
  /** Completed laps. */
  lap: number;
  /** Lateral offset, in inside units (positive = toward the axis). */
  u: number;
  /** Current speed, in units/s. */
  speed: number;
  /** The rig's target speed (its pace cap; the player's current speed). */
  paceTarget: number;
  /** Rig width (Biga 1.5, Triga ~2.2, Quadra 2.94). */
  width: number;
  /** Which side's route the rig is on (its formation slot's flank). A rig
   * on the other side is on the opposite lane — beside, never ahead — so
   * the overtake, the defense, and the follow cap only ever consider
   * snapshots whose side matches the driver's own. Without this the
   * follower caps its speed on a rig 15 units to its side while driving
   * into the rig actually in front of it, and the field piles up at the
   * hook. */
  side: 1 | -1;
  /** Body-centre position (for the caller's separation resolver). */
  x: number;
  z: number;
  heading: number;
}

export type RivalWarning = 'none' | 'initiator' | 'innocent';

/** One tick's input to the driver. */
export interface RivalDriverTick {
  /** The rig's current pose, from its `ChariotMotion`. */
  x: number;
  z: number;
  heading: number;
  speed: number;
  /** Whether this rig's clock has started — the driver only drives when racing. */
  racing: boolean;
  /** The steward's warning (never set in 1B2; the hook is wired and tested). */
  warning: RivalWarning;
  /** The other rigs in the field (player + rivals). */
  others: readonly RivalRigSnapshot[];
  /** The frame delta, in seconds (the fixed step, 1/60). */
  dt?: number;
}

export interface RivalDriverState {
  profile: RivalDriverProfile;
  side: 1 | -1;
  analysis: RivalRouteAnalysis;
  /** The pace-cap target speed. */
  paceTarget: number;
  /** This rig's width. */
  width: number;
  /** The seeded line jitter (±0.1), drawn once at creation. */
  lineJitter: number;
  /** The driver's own unwrapped route distance. */
  totalS: number;
  /** Completed laps. */
  lap: number;
  /** The last projected sample index (the next projection's hint). */
  sampleIndex: number;
  /** The last projected lateral offset, in inside units. */
  lateral: number;
  /** The current (blended) lateral offset target. */
  offset: number;
  /** The last throttle, for the hysteresis hold. */
  lastThrottle: number;
  defense: {
    /** The straight the last defense move happened on, or null. */
    lastStraight: number | null;
    /** The defended offset target, or null when not defending. */
    targetOffset: number | null;
    /** The follower the defense is covering, or null. */
    followerId: string | null;
  };
  overtake: {
    /** The rig being passed, or null. */
    targetId: string | null;
    /** The pass line's offset, in inside units. */
    offset: number;
  };
}

export interface RivalDriverOptions {
  competitor: import('./raceCompetitors').RaceCompetitor;
  side: 1 | -1;
  /** The formation-slot handoff pose (the driver's starting point). */
  x: number;
  z: number;
  heading: number;
  speed: number;
  teamSize?: ChariotTeamSize;
  /** The seed for the line jitter (defaults to 0). */
  seed?: number;
  /** An injected RNG (the tests inject one, so the jitter is deterministic). */
  rng?: () => number;
}

/**
 * Create a driver for one rival, at its formation-slot handoff pose. The
 * line jitter is one seeded draw (±0.1), so two identical-profile rivals
 * do not drive the exact same line and the same seed reproduces it.
 */
export function createRivalDriver(options: RivalDriverOptions): RivalDriverState {
  const profile = resolveRivalDriverProfile(options.competitor);
  const analysis = analyzeRivalRoute(options.side);
  const rng = options.rng ?? mulberry32(options.seed ?? 0);
  const lineJitter = (rng() - 0.5) * 0.2;
  const width = getTeamWidth(options.teamSize ?? 2);
  const projection = projectToRoute(analysis, options.x, options.z, 0, 0);
  return {
    profile,
    side: options.side,
    analysis,
    paceTarget: resolveDriverPaceCap(profile),
    width,
    lineJitter,
    totalS: projection.s,
    lap: 0,
    sampleIndex: projection.index,
    lateral: projection.lateral,
    offset: 0,
    lastThrottle: 0,
    defense: { lastStraight: null, targetOffset: null, followerId: null },
    overtake: { targetId: null, offset: 0 },
  };
}

/** The driver's route position, for the scene's rig registry. */
export function rivalDriverRoutePosition(state: RivalDriverState): {
  s: number;
  lap: number;
  u: number;
} {
  const length = state.analysis.length;
  return {
    s: ((state.totalS % length) + length) % length,
    lap: state.lap,
    u: state.lateral,
  };
}

const clampNumber = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

/**
 * One tick of the driver: a `ChariotInput` for `advanceChariot`. The driver
 * never moves the rig itself.
 *
 * The order is the decision order: project the pose, find the rigs ahead
 * and behind, settle the overtake (as follower) and the defense (as
 * leader), fold in the warning, blend the lateral offset, steer by pure
 * pursuit toward the lookahead point, and throttle bang-bang with
 * hysteresis around the pace cap (itself capped by the corner limit
 * ahead). When not racing the driver coasts — the roll owns the motion
 * until the rig's own crossing.
 */
export function driveRival(state: RivalDriverState, tick: RivalDriverTick): ChariotInput {
  const analysis = state.analysis;
  const length = analysis.length;
  const dt = Number.isFinite(tick.dt) && (tick.dt ?? 0) > 0 ? (tick.dt as number) : 1 / 60;

  // 1. Project the pose onto the route and unwrap the distance. The hint
  //    s is the rig's own current s (its totalS, wrapped) — the projection
  //    only accepts candidates within 6 units of arc of it, so a rig
  //    off its line at the south end cannot snap onto the diagonal (a
  //    ~150-unit jump) while a rig that swung wide can still recover.
  const projection = projectToRoute(analysis, tick.x, tick.z, state.totalS, state.sampleIndex);
  let delta = projection.s - (state.totalS % length);
  if (delta < -length / 2) delta += length;
  if (delta > length / 2) delta -= length;
  state.totalS += delta;
  state.lap = Math.floor(state.totalS / length);
  state.sampleIndex = projection.index;
  state.lateral = projection.lateral;
  const s = ((state.totalS % length) + length) % length;

  if (!tick.racing) {
    return { throttle: 0, steer: 0 };
  }

  // 2. The nearest rig ahead and behind, by total route distance.
  const myTotal = state.totalS;
  let ahead: RivalRigSnapshot | null = null;
  let aheadGap = Infinity;
  let behind: RivalRigSnapshot | null = null;
  let behindGap = Infinity;
  for (const other of tick.others) {
    // Same side only: a rig on the other side's route is on the opposite
    // lane — beside, never ahead — and must not count as the leader, the
    // follower, or the rig to pass.
    if (other.side !== state.side) continue;
    const otherTotal = other.lap * length + other.s;
    const d = otherTotal - myTotal;
    if (d > 0 && d <= RIVAL_DRIVER_OVERTAKE_LOOKAHEAD && d < aheadGap) {
      ahead = other;
      aheadGap = d;
    }
    if (d < 0 && d >= -RIVAL_DRIVER_OVERTAKE_LOOKAHEAD && -d < behindGap) {
      behind = other;
      behindGap = -d;
    }
  }

  // 3. The base line: the straight offset blended to the meta offset by the
  //    weight, plus the seeded jitter. The weight is read at the LOOKAHEAD
  //    point, not the rig's own s: the offset anticipates the turn, so the
  //    rig is back on its lane by the hook's end instead of arriving there
  //    a unit inside (north) — the lap checkpoint only registers ~0.1
  //    units before the finish, and a rig a unit north of the hook's end
  //    must drive south to cross it, straight into the south wall.
  const lookS = s + RIVAL_DRIVER_LOOKAHEAD;
  const w = analysis.metaWeight[routeSampleAt(analysis, lookS)];
  const straightOffset = (state.profile.metaSkill - 0.5) * 0.5;
  // The meta offset is the SAME for every profile (single file through
  // the hook): five rigs 1.5 units wide cannot go through a 5-unit slow
  // zone side-by-side on offsets 0.66–1.26 apart — they overlap
  // laterally, the resolver scatters them, and the field jams for
  // minutes. The metaSkill spread lives on the straights (above), where
  // there is room to run a different line; at the hook every rig files
  // through on the same line, nose-to-tail, and the follow cap below
  // holds the spacing.
  const metaOffset = 0.9;
  let desiredOffset = straightOffset + (metaOffset - straightOffset) * w + state.lineJitter;

  const zone = routeZoneAt(analysis, s);

  // 4. The overtake, as follower: a pass needs a pace advantage and an open
  //    window. A pass ABORTS when the rig enters a meta: a pass started on
  //    the straight that is still alongside when the hook starts would
  //    carry two rigs side-by-side through the narrow hook, where there
  //    is no room — they overlap, the resolver scatters them, and the
  //    field jams for minutes. So the follower tucks back to single file
  //    for the hook (the follow cap, below, holds it behind the leader)
  //    and the pass is re-attempted on the next straight or meta-exit.
  //    A pass is complete a rig length ahead.
  if (zone === 'meta' && state.overtake.targetId !== null) {
    state.overtake.targetId = null;
  }
  if (state.overtake.targetId !== null) {
    const target = tick.others.find((o) => o.id === state.overtake.targetId);
    if (!target) {
      state.overtake.targetId = null;
    } else {
      const d = target.lap * length + target.s - myTotal;
      if (d < -RIVAL_RIG_LENGTH) state.overtake.targetId = null;
    }
  }
  if (ahead !== null && state.paceTarget > ahead.paceTarget + RIVAL_PACE_ADVANTAGE_MARGIN) {
    if (zone !== 'meta') {
      const insideLimit = insideLimitAt(analysis, s);
      const args: RivalWindowArgs = {
        leaderU: ahead.u,
        leaderWidth: ahead.width,
        followerWidth: state.width,
        insideLimit,
      };
      const win = zone === 'meta-exit' ? metaExitWindowOpen(args) : straightWindowOpen(args);
      if (win.open) {
        state.overtake.targetId = ahead.id;
        state.overtake.offset = win.passOffset;
      } else if (state.overtake.targetId === ahead.id) {
        state.overtake.targetId = null;
      }
    }
  } else if (ahead !== null && state.overtake.targetId === ahead.id) {
    state.overtake.targetId = null;
  }
  if (state.overtake.targetId !== null) desiredOffset = state.overtake.offset;

  // 5. The defense, as leader: one lateral move per straight, only while
  //    the follower is still more than a rig length behind and closing, and
  //    only at or above the 0.60 aggression threshold. The move covers the
  //    follower's intended pass line. It clears when the straight ends or
  //    the follower it was covering passes.
  const straightId = straightIdAt(analysis, s);
  if (state.defense.targetOffset !== null) {
    const covered = state.defense.followerId === null
      ? null
      : tick.others.find((o) => o.id === state.defense.followerId);
    const coveredPassed = covered !== undefined && covered !== null
      ? covered.lap * length + covered.s - myTotal > 0
      : false;
    if (zone === 'meta' || zone === 'meta-exit' || coveredPassed || (straightId !== null && straightId !== state.defense.lastStraight)) {
      state.defense.targetOffset = null;
      state.defense.followerId = null;
    }
  }
  if (
    behind !== null &&
    state.profile.aggression >= RIVAL_DEFENSE_THRESHOLD &&
    behind.paceTarget > state.paceTarget + RIVAL_PACE_ADVANTAGE_MARGIN &&
    behindGap > RIVAL_RIG_LENGTH &&
    behindGap <= RIVAL_DRIVER_OVERTAKE_LOOKAHEAD &&
    straightId !== null &&
    state.defense.lastStraight !== straightId
  ) {
    const insideLimit = insideLimitAt(analysis, s);
    const passLine =
      behind.u + (state.width + behind.width) / 2 + RIVAL_STRAIGHT_WINDOW_MARGIN;
    state.defense.lastStraight = straightId;
    state.defense.targetOffset = Math.min(
      passLine + 0.2,
      insideLimit - state.width / 2 - 0.2
    );
    state.defense.followerId = behind.id;
  }
  if (state.defense.targetOffset !== null) desiredOffset = state.defense.targetOffset;

  // 6. The warning hook (never set in 1B2): a warned initiator steers to
  //    clear (0.5 outside its lane, 80% pace); a warned innocent holds its
  //    line — no change at all.
  let paceFraction = 1;
  if (tick.warning === 'initiator') {
    desiredOffset = RIVAL_WARNING_CLEAR_OFFSET;
    paceFraction = RIVAL_WARNING_PACE_FRACTION;
  }

  // 7. Blend the offset toward its target (bounded, so the rig never snaps
  //    laterally when a window opens or closes).
  const maxStep = 4 * dt;
  const offsetDelta = desiredOffset - state.offset;
  state.offset += offsetDelta > maxStep ? maxStep : offsetDelta < -maxStep ? -maxStep : offsetDelta;

  // 8. Steer by pure pursuit toward the lookahead point, on the offset line.
  //    A bearing to a point ahead is a strong line-keeper (unlike a
  //    heading-plus-correction controller, whose lateral correction is too
  //    gentle to pull a rig back once it drifts inside at the hook). The
  //    lookahead is short (2) so the target stays on the diagonal until
  //    the rig is at the hook's end — a long lookahead wraps the target
  //    onto the next lap while the rig is still on the diagonal, and the
  //    rig turns north early and misses its lane.
  const targetPoint = routePointAt(analysis, lookS);
  const normal = routeInsideNormalAt(analysis, lookS);
  const tx = targetPoint[0] + normal[0] * state.offset;
  const tz = targetPoint[1] + normal[1] * state.offset;
  const desiredHeading = Math.atan2(-(tx - tick.x), -(tz - tick.z));
  const headingError = wrapAngle(desiredHeading - tick.heading);
  // steer +1 is the driver's right, which DECREASES the heading.
  const steer = clampNumber(-headingError * RIVAL_DRIVER_STEER_GAIN, -1, 1);

  // 9. Throttle bang-bang with hysteresis around the pace cap, itself capped
  //    by the corner limit ahead. The brake only fires when the speed is
  //    more than 0.5 above the corner limit — the handoff's 5 u/s roll
  //    speed decays by coasting, never by braking.
  //
  //    Following: a rig close behind another (within the follow distance)
  //    with no open window holds the leader's speed instead of its own
  //    pace — it waits for a window rather than driving into the leader's
  //    nose. Without this the field piles up at the hook (where everyone
  //    slows and no window opens) and the rigs jostle for minutes. An
  //    active pass lifts the cap: the follower is committed to the window
  //    it took. Closing fast on a slowed leader BRAKES (the coast's 3 u/s²
  //    cannot shed 1.9 u/s of closing speed before the nose — 2.02 ahead
  //    of the body — reaches the leader).
  const cornerLimit = rivalSpeedLimitAt(analysis, s);
  let target = Math.min(state.paceTarget * paceFraction, cornerLimit);
  let followBrake = false;
  if (ahead !== null && state.overtake.targetId === null && aheadGap <= RIVAL_FOLLOW_DISTANCE) {
    // Capped by BOTH the leader's pace and its actual speed: the pace
    // stops the creep (the leader's actual speed oscillates ±0.05 above
    // its mean, so capping on the actual speed alone lets the follower
    // close 3.8 units in 25 s), and the actual speed stops the pile-up
    // at the hook (the leader's pace is 2.54 there but its actual speed
    // is 0.83 — capping on the pace alone drives the follower into it).
    target = Math.min(target, ahead.paceTarget, ahead.speed + RIVAL_PACE_ADVANTAGE_MARGIN);
    if (tick.speed > ahead.speed + 0.5) followBrake = true;
  }
  let throttle: number;
  if (followBrake) throttle = -1;
  else if (tick.speed < target - RIVAL_DRIVER_SPEED_HYSTERESIS) throttle = 1;
  else if (tick.speed > cornerLimit + RIVAL_DRIVER_BRAKE_MARGIN) throttle = -1;
  else if (tick.speed > target + RIVAL_DRIVER_SPEED_HYSTERESIS) throttle = 0;
  else throttle = state.lastThrottle;
  state.lastThrottle = throttle;

  return { throttle, steer };
}
