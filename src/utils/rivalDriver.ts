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
// seconds`, the `paceCapFactor` derivation) and the driver never exceeds it
// on its own pace — except for Fortuna's Hand (LADDER-1E, `fortunasHand.ts`),
// the SINGLE disclosed exception: a bounded ±4%/±2% adjustment of a RIVAL's
// pace cap by position relative to the player, a pure function of
// (position, lap, rung), off on the final lap, printed on the results
// screen. There is no other rubber-banding: a rival behind does not speed
// up to catch up beyond the Hand's disclosed +4%/+2%, it simply holds its
// own pace. The throttle is bang-bang with
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
// `RIVAL_CORNER_WINDOW` (1.5 route units), separately from the 2-unit
// pure-pursuit steering target. The speed solver has a hard 0.8 u/s floor;
// the full-field soak records the resulting hook queue and lap-time penalty.
// Do not tune this window from a single-rig lap: rerun the full-field soak
// and verify the driveable-outline and post-separation overlap gates.
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
// ── LADDER-1D: stamina ─────────────────────────────────────────────────────
// Each driver carries a stamina pool (`raceStamina.ts`), stepped once per
// tick in `driveRival` from its own speed, pace cap, zone, and lap — the
// same module and rates as the player. The target speed is the pace cap ×
// the style fraction × the stamina multiplier × the warning fraction × the
// Hand multiplier (LADDER-1E — rivals only, off on the final lap;
// `fortunasHand.ts`):
// frontrunner 1.00 (all-out early), metronome 0.85 (press-band), closer
// 0.85 (press-band) until the final third of the race, then 1.00 (all-out).
// (Option A — brief Build record: the design's 0.70 / 0.65 fractions
// gridlocked the League field at the north-turn kink. Option C2: the style
// fractions apply on straights only — through a turn every rig runs at full
// pace, restoring the proven 1B2 turn behaviour. Walter's decision, Nov 27
// 02:16 EST: the closer's early fraction rises 0.80 → 0.85, matching the
// metronome — the early distinction is gone; the closer's identity is the
// final-third kick plus its drain profile.) The stamina
// multiplier eases the cap smoothly (1.0 above 40 stamina, 0.88 at 0).
// The follow cap still reads the leader's RAW
// paceTarget, not its effective pace. Rivals are Biga with stock loadout,
// so those stamina factors read 1.0 here; the race length in laps comes
// from the `laps` creation option (default 1).
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
  resolveRaceRungId,
  resolveRivalDriverProfile,
  type RaceRungId,
  type RivalDriverProfile,
} from './raceCompetitors';
import {
  createRaceStamina,
  paceCapMultiplierFor,
  stepRaceStamina,
  type RaceStaminaState,
} from './raceStamina';
import { fortunasHandMultiplier } from './fortunasHand';
import { rungStaminaDrainMultiplier } from '../data/raceTiers';

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
/** STALL Part 2 — the stuck-rig re-seed: a rig whose unwrapped route
 * distance has advanced less than this far is not racing, it is pinned
 * or circling. 0.5 units: far below what the 0.8 u/s corner floor
 * guarantees even through the slowest hook (1.6 units in the 2 s
 * window), so a legitimately slow rig — the hook crawl, the follow
 * queue — always clears it. The check is on route progress, not on
 * throttle: a circling rig can be at full speed while making no route
 * progress (it orbits the line point at 2.7 u/s and advances ~0.07
 * units of arc per second), so a throttle condition would miss it. */
export const RIVAL_DRIVER_STUCK_ADVANCE = 0.5;
/** STALL Part 2 — how long the rig must make no route progress (advance
 * below the threshold above) before the projection hint is re-seeded
 * from the nearest physical point. 2 s: long enough that no legitimate
 * slowdown (the hook queue, a tangle's drag) can trip it — a rig at the
 * 0.8 floor advances 1.6 units in the window, far above the 0.5
 * threshold — short enough that a stalled lap costs ~2 s against the
 * +25 envelope. */
export const RIVAL_DRIVER_STUCK_SECONDS = 2;
/** STALL Part 2 — recovery speed: the target while a rig is recovering
 * (flagged by the re-seed). 0.8 u/s, the corner floor — the slowest the
 * driver ever commands, and the slowest the solver ever allows through
 * the hook — so a recovering rig costs a few seconds, not a lap. At 0.8
 * the turn radius (~1.4) is far smaller than the rig's distance to its
 * line, so pure pursuit converges onto the line instead of orbiting
 * around it; at full pace (2.7) the turn radius (~4.5) is comparable
 * to the error, and the rig circles. The cap applies ONLY while
 * recovering, which is set only by the re-seed firing after 2 s of no
 * route progress — never in a healthy race. (The first attempt capped
 * on the lateral error instead; that signal is blind to the orbit —
 * the projection re-pins to the diagonal as the rig orbits, so the
 * error stays under its threshold while circling — and it fired in
 * healthy racing, flipping the ordering pin. Removed.) */
export const RIVAL_DRIVER_RECOVERY_SPEED = 0.8;
/** STALL Part 2 — recovery clear: how far a recovering rig must advance
 * along the route, from the totalS at the re-seed firing, before the
 * recovery ends and the speed cap lifts. 2 units: the orbit swings
 * totalS by ±0.5, so a 0.5-unit progress clear is inside the orbit's
 * own noise and would clear mid-orbit on a forward swing; 2 units is
 * 4× above that noise while still clearing within ~2.5 s at the 0.8
 * recovery pace. */
export const RIVAL_DRIVER_RECOVERY_CLEAR_ADVANCE = 2;
/** STALL Part 2 — stale-reference bound, in route units. If totalS sits
 * this far BEHIND the progress checkpoint, the checkpoint is stale (a
 * driver seeded mid-route), not a stall — re-sync it instead of counting
 * no-progress. 10 units: far above any genuine backward drift (the
 * projection wobbles inside its ±6 arc window; the terminal pin drifted
 * −3.3 over 641 s) and far below the ~137-unit gap a seeded reference
 * starts with. */
export const RIVAL_DRIVER_STUCK_STALE = 10;
/** STALL Part 2 — line-point clamp radius, in route units. Near the line
 * point the straight and the diagonal coincide, so the geometric
 * nearest is ambiguous by construction; within this distance of the
 * line point the re-seed resolves the ambiguity toward the straight
 * (the lap the rig is actually on) instead of whichever side of the
 * joint is nearer. 2.5 units: the first attempt at 4.0 proved too wide
 * — the seed-30 3-lap trace shows the 4.0 radius snapping tiberius to
 * the straight at 3.11 and 3.47 units from the line point while it was
 * still 3.1–3.5 units short of the line (totalS 154.5/311.7 against the
 * line at 157.6/315.2); the rig then drifted into the wall and pinned
 * at v=0.00, and the re-seed no-ops there (nearest is the diagonal,
 * 4.40 from the line). The orbit firings that need the clamp all sit
 * at ≤2.1 units from the line point, so 2.5 keeps the orbit covered
 * with margin while excluding the not-crossed snaps. A stuck rig near
 * the line point has already crossed it — the straight is its lap's
 * branch; the diagonal belongs to the lap it has left. Trade-off:
 * the closest-lap rule may credit the lap for a rig that was a few
 * units short of the line — the lesser evil for a rescued rig, and the
 * lap time still carries the recovery cost. */
export const RIVAL_DRIVER_LINE_POINT_CLAMP = 2.5;
/** STALL Part 2 — recovery lookahead, in route units. A rig the re-seed
 * flagged as pinned or circling steers toward a point this far ahead
 * instead of the 2-unit lookahead. Pure pursuit orbits when the target
 * is 2 units ahead and ~7 to the side (the angle to it is ~90°, so the
 * rig turns in a circle); a target 10 units ahead sits mostly forward
 * of the rig, so it drives toward it and rejoins instead of orbiting.
 * 10 is long enough to pull the target clear of the rig's orbit and
 * short enough that the target stays on the route the rig is rejoining
 * (the straight is 65 units; the diagonal is ~8). It applies only while
 * recovering — and it is NOT clamped at the line: an earlier version
 * clamped it (min(s+10, length)), which created the near target that
 * orbits — the clamped target is the line point itself, ~2.3 units
 * away, inside the 1.90-unit turn circle at the 0.8 recovery pace, so
 * the rig traced a ~3.6-unit loop without closing. Letting the
 * lookahead wrap naturally (routePointAt wraps modulo the length)
 * puts the target on the straight ~10 units ahead of the rig, OUTSIDE
 * the turn circle, so the rig turns toward it and closes instead of
 * orbiting a near target. */
export const RIVAL_DRIVER_RECOVERY_LOOKAHEAD = 10;
/** The forward route-arc window used to estimate corner curvature. Kept separate from the 2-unit steering target; the resulting speed limit is clamped to a minimum of 0.8 u/s. The 1.5-unit value is retained because it lets the rival complete the tight south hook without leaving the driveable outline, but it creates a measurable full-field queue. Re-evaluate only with the multi-rig soak and device profiler. */
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
  // The active curvature window is `RIVAL_CORNER_WINDOW` (1.5 route units),
  // not the separate 2-unit pure-pursuit steering target. Keep this tied to
  // the constant so future tuning cannot silently drift from the analysis.
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

/**
 * STALL Part 2 — the pure-geometric nearest route point: the segment
 * whose closest point is physically nearest the pose, with no arc
 * penalty, no stickiness, and no hint window. Used ONLY by the stuck-rig
 * re-seed, so it runs only when a rig is already pinned — never on the
 * hot path. The plain projection cannot serve here: at the line point
 * its arc penalty and stickiness keep the hint on the diagonal while the
 * rig is physically on the straight, which is the deadlock itself. The
 * degenerate closing segment is excluded, as in `projectToRoute`.
 */
export function nearestRoutePoint(
  analysis: RivalRouteAnalysis,
  x: number,
  z: number,
): { s: number; index: number } {
  const n = analysis.points.length;
  const segCount = n - 1;
  let best = 0;
  let bestDistSq = Infinity;
  let bestT = 0;
  for (let i = 0; i < segCount; i++) {
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
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      best = i;
      bestT = t;
    }
  }
  const d0 = analysis.cumulativeDistances[best];
  const d1 = analysis.cumulativeDistances[best + 1];
  return { s: d0 + (d1 - d0) * bestT, index: best };
}

// ─────────────────────────────────────────────────────────────────────────────
// The pace cap — a target speed, never a rubber-band
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The driver's target speed: the profile's mean speed, `route length / lap
 * seconds` — the `paceCapFactor` derivation, so a lap-time change re-derives
 * it. The driver never commands above this on its own pace, and never speeds
 * up to catch a rival — except for Fortuna's Hand (LADDER-1E,
 * `fortunasHand.ts`), the SINGLE disclosed exception: a bounded ±4%/±2%
 * adjustment of a RIVAL's pace cap, a pure function of (position relative
 * to the player, lap, rung), applied per-tick at the target computation —
 * never at this cap itself, never to the player. There is no other
 * rubber-banding anywhere in this module.
 */
export function resolveDriverPaceCap(profile: RivalDriverProfile): number {
  const reference = RACE_ROUTE_LENGTH / 58;
  return profile.paceCapFactor * reference;
}

/**
 * The corner-speed limit at a route distance: the precomputed value for the
 * forward `RIVAL_CORNER_WINDOW` arc. This window supplies anticipation; it is
 * distinct from the pure-pursuit steering target. The curvature solver clamps
 * the result to at least 0.8 u/s, and the full-field soak measures the queue
 * and lap-time cost of that conservative hook speed.
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
  /** STALL Part 2 — whether the rig completed its laps (set by the
   * caller, which owns the race length). Absent means racing. The
   * follow cap reads this, NOT the lap count: the driver does not know
   * the race length — the soak runner creates drivers without `laps`,
   * so totalLaps=1 there even in a 3-lap race, and a lap-1 leader would
   * read as finished. Only the caller, which counts the laps, can say
   * a rig is finished. */
  finished?: boolean;
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
  /** LADDER-1D: this rig's stamina pool, stepped once per tick in `driveRival`. */
  stamina: RaceStaminaState;
  /** LADDER-1D: the race length in laps (1 = a single-lap race). The closer's
   * "final third" is the last third of this many laps. */
  totalLaps: number;
  /** LADDER-1E: the rung this race is run on — Fortuna's Hand reads its
   * rates from it (District +4%/−3%, League +2%/−1.5%). Set at creation,
   * never changed mid-race. */
  rung: RaceRungId;
  /** The seeded line jitter (±0.1), drawn once at creation. */
  lineJitter: number;
  /** The driver's own unwrapped route distance. */
  totalS: number;
  /** Completed laps. */
  lap: number;
  /** LADDER-1E: ticks on which Fortuna's Hand applied a multiplier other
   * than 1.0. The scene reads it at the finish for the results line; the
   * soak never increments it (no player snapshot there), so the soak pins
   * hold exactly. */
  handTicks: number;
  /** LADDER-1E: the target speed the driver throttled around on the last
   * tick, after the corner limit and the follow cap. Test observability:
   * the exact composition (pace cap × style × stamina × Hand) is readable
   * here, so a test can prove the Hand's percentage instead of inferring
   * it from the throttle's hysteresis window. */
  lastTarget: number;
  /** The last projected sample index (the next projection's hint). */
  sampleIndex: number;
  /** The last projected lateral offset, in inside units. */
  lateral: number;
  /** The current (blended) lateral offset target. */
  offset: number;
  /** The last throttle, for the hysteresis hold. */
  lastThrottle: number;
  /** STALL Part 2 — the stuck-rig re-seed: the totalS at the last
   * progress checkpoint, and the seconds since then without progress
   * while racing. */
  stuckRefTotalS: number;
  stuckTimeS: number;
  /** STALL Part 2 — the totalS at the re-seed firing that set
   * `recovering`. The recovery clears only once the rig has advanced
   * RIVAL_DRIVER_RECOVERY_CLEAR_ADVANCE from this point — a separate
   * reference from `stuckRefTotalS`, which the 0.5-unit progress
   * checkpoint keeps resetting. */
  recoveringRefTotalS: number;
  /** STALL Part 2 — recovery: true once the re-seed has fired (the rig
   * made no route progress for RIVAL_DRIVER_STUCK_SECONDS), cleared
   * only after RIVAL_DRIVER_RECOVERY_CLEAR_ADVANCE of sustained route
   * progress since the firing. While true the driver caps its target
   * at the corner floor (step 9), so a rig knocked off its line slows
   * enough to turn onto it instead of orbiting it at full pace. The
   * re-seed alone cannot break the circling — it corrects the
   * projection, but the rig's motion is the problem — so the re-seed
   * sets this flag and the speed cap does the breaking. */
  recovering: boolean;
  /** STALL Part 2 — whether the stuck-rig re-seed may fire for this
   * driver. True exactly for a multi-lap race: the live scene passes
   * the real race length, so a District/League driver gets this true,
   * and runSoakRace (rivalDriver.test.ts) passes `laps` too, so its
   * multi-lap drivers get it. runIncidentSoakRace does NOT pass `laps`,
   * so its drivers keep totalLaps=1 and the re-seed never fires there
   * — that is why the 1C soak pins hold exactly. A test harness that
   * drives multi-lap races without passing `laps` sets it for those
   * races (stallTrace.test.ts). */
  reseedEnabled: boolean;
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
  /** LADDER-1D: the race length in laps, for the closer's "final third"
   * (defaults to 1 — a single-lap race). */
  laps?: number;
  /** LADDER-1E: the rung this race is run on, for Fortuna's Hand
   * (defaults to 'district' — the always-open rung — via
   * `resolveRaceRungId`). */
  rung?: RaceRungId;
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
  const paceTarget = resolveDriverPaceCap(profile);
  const projection = projectToRoute(analysis, options.x, options.z, 0, 0);
  return {
    profile,
    side: options.side,
    analysis,
    paceTarget,
    width,
    stamina: createRaceStamina(),
    totalLaps: options.laps ?? 1,
    rung: resolveRaceRungId(options.rung),
    handTicks: 0,
    lastTarget: paceTarget,
    lineJitter,
    totalS: projection.s,
    lap: 0,
    sampleIndex: projection.index,
    lateral: projection.lateral,
    offset: 0,
    lastThrottle: 0,
    stuckRefTotalS: projection.s,
    stuckTimeS: 0,
    recoveringRefTotalS: projection.s,
    recovering: false,
    reseedEnabled: (options.laps ?? 1) > 1,
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
 * LADDER-1D — the style's target-band policy, as a fraction of the pace cap.
 * The band the fraction lands in is the band the rig drains at (the speed
 * chases the target, so speed/cap ≈ the fraction on open track):
 *
 * - frontrunner: 1.00 — all-out early. The design's "press early" read as
 *   "spend early": press (≤ 0.92) cannot produce the required fade against a
 *   metronome at the boundary, because both would drain at the press rate.
 *   At full pace the frontrunner drains at the all-out rate and fades late.
 * - metronome: 0.85 — press-band, all race. (Option A — brief Build
 *   record: the design's 0.70 cruise/press boundary compressed the field's
 *   speed spread to ~0.09 u/s and gridlocked the League field at the
 *   north-turn kink. 0.85 preserves the profile spread — the field's real
 *   separation — while the press rate in `raceStamina.ts` is set so a
 *   metronome still ends a 3-lap District race above 40.)
 * - closer: 0.85 — press-band, the same early straight pace as the
 *   metronome — until the final third of the race, then 1.00 — all-out.
 *   The late pace is not a boost, it is unspent stamina. (Walter's
 *   decision, Nov 27 02:16 EST — brief Build record: the 0.80 early
 *   fraction erased the straight-line pace gap the pass gate depends on
 *   (Aulus 0.80×2.72 = 2.18 vs Rufus 0.85×2.54 = 2.16) and left the
 *   closer 1.1 s over the lap-time band, so the closer rises to 0.85.
 *   The closer/metronome early distinction is gone; the closer's
 *   identity is now the final-third kick plus its drain profile — it
 *   still drains slower than the frontrunner and ends a 5-lap League
 *   race with more pool, the §3 target.)
 *
 * Option C2 (brief Build record) — the fractions apply on STRAIGHTS only.
 * Through a turn (`meta` / `meta-exit`) every rig runs at full pace
 * (fraction 1.0), restoring the proven 1B2 turn behaviour: the compressed
 * fractions (Option A) still gridlocked the League field at the north-turn
 * apex — two rigs on opposite sides reach the apex together and the
 * separation push cancels both rigs' forward motion — so stamina is a
 * straight-line game (the design's recovery also lives on straights, and
 * straights are ~85% of the race). The tired-rig vulnerability still
 * applies in turns, because the 0.88 pace-cap multiplier is on the cap,
 * not on the style fraction.
 *
 * The fractions are tuning knobs against the §3 measurable targets and the
 * §6 pins: if they cannot hold the lap-time band pin, the slice reports the
 * numbers and stops — it does not compress the styles silently to fit the
 * pins.
 */
function rivalStyleTargetFraction(state: RivalDriverState, zone: RivalRouteZone): number {
  if (zone !== 'straight') return 1;
  const style = state.profile.staminaStyle;
  if (style === 'frontrunner') return 1;
  if (style === 'metronome') return 0.85;
  const raceLength = state.totalLaps * state.analysis.length;
  return state.totalS >= (2 / 3) * raceLength ? 1 : 0.85;
}

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

  // 0. STALL Part 2 — the stuck-rig re-seed. A rig whose throttle is being
  //    eaten by the wall clamp (nose clearance 0.00, speed 0.00, throttle
  //    1) makes no route progress, and the projection's hint keeps it on
  //    the diagonal while it is physically on the straight — the lookahead
  //    then wraps to a point behind the rig and the driver keeps facing
  //    the wall. The same no-progress signature covers the scattered
  //    circling that precedes the pin: a rig knocked off its line orbits
  //    the line point at full speed while advancing ~0.07 units of arc
  //    per second, because the projection holds it 7+ arc units behind
  //    where it physically is and the lookahead target sits behind it.
  //    Nothing in the projection can break either loop from inside it
  //    (the hint IS the loop), so the recovery comes from outside it:
  //    when the rig has made no route progress for
  //    RIVAL_DRIVER_STUCK_SECONDS, re-seed the hint from the nearest
  //    physical point and let the next projection run from there. The
  //    check is on route progress, not on throttle — a circling rig is at
  //    full speed — and it runs only while racing, and only when the
  //    re-seed is enabled for this driver (a multi-lap race). A one-lap
  //    race keeps the exact behaviour the 1C soak pins were measured
  //    with: the re-seed stays out of one-lap races entirely (laps=1
  //    leaves reseedEnabled false — runIncidentSoakRace does not pass
  //    `laps`, so its drivers keep totalLaps=1; runSoakRace DOES pass
  //    `laps`, so its multi-lap drivers have the re-seed live). The live
  //    scene passes the real race length (3 or 5 laps), so the re-seed
  //    is live wherever the stall can cost a lap. A rig crawling through
  //    the hook at the 0.8 floor advances 1.6 units in the window, far
  //    above the threshold, and a false firing is a no-op or a
  //    correction: the nearest physical point is where the rig already
  //    is, unless the projection was wrong, in which case the re-seed
  //    corrects it. A re-seed is idempotent: if the rig is still turning
  //    away from the wall, the nearest point is the same one, so a
  //    second firing changes nothing.
  if (tick.racing && state.reseedEnabled) {
    if (state.totalS - state.stuckRefTotalS >= RIVAL_DRIVER_STUCK_ADVANCE) {
      state.stuckRefTotalS = state.totalS;
      state.stuckTimeS = 0;
      // STALL Part 2 — the rig is making route progress again, but the
      // recovery ends only on SUSTAINED progress: the orbit swings
      // totalS by ±0.5, so the 0.5-unit checkpoint above is inside the
      // orbit's own noise and would clear the recovery mid-orbit on a
      // forward swing (mode B: it cleared on a 0.51-unit blip, 0.07 s
      // before the next re-seed would have fired). Require
      // RIVAL_DRIVER_RECOVERY_CLEAR_ADVANCE from the firing point.
      if (
        state.recovering &&
        state.totalS - state.recoveringRefTotalS >= RIVAL_DRIVER_RECOVERY_CLEAR_ADVANCE
      ) {
        state.recovering = false;
      }
    } else if (state.stuckRefTotalS - state.totalS > RIVAL_DRIVER_STUCK_STALE) {
      // STALL Part 2 — stale reference, not a stall: totalS sits far
      // behind the checkpoint, which means the checkpoint was set from
      // a projection the rig has since left behind. The creation
      // projection is hinted at the line, so a driver seeded mid-route
      // (test scaffolding: driverAt seeds totalS=20 while the creation
      // projection, its arc window rejecting the mid-route pose, returns
      // the route's far end) starts with its reference ~a lap ahead of
      // the rig — the rig is advancing, the reference is wrong, and
      // counting that as no-progress would fire a spurious re-seed and
      // cap a healthy rig. Re-sync the reference instead. A genuine
      // stall drifts backward only a few units (the projection wobbles
      // inside its ±6 arc window; the terminal pin drifted −3.3 over
      // 641 s), far inside this threshold, so a real pin still trips
      // the re-seed below.
      state.stuckRefTotalS = state.totalS;
      state.stuckTimeS = 0;
      if (state.recovering) state.recoveringRefTotalS = state.totalS;
    } else {
      state.stuckTimeS += dt;
      if (state.stuckTimeS >= RIVAL_DRIVER_STUCK_SECONDS) {
        let nearest = nearestRoutePoint(analysis, tick.x, tick.z);
        // STALL Part 2 — the line-point clamp (mode B): near the line
        // point the straight and the diagonal coincide, so the geometric
        // nearest is ambiguous by construction — a rig that has drifted
        // south of the line while turning is nearer the diagonal even
        // though it is on the next lap's straight (mode B: the middle
        // three firings re-seeded to s=156.81/155.21/151.12, and after a
        // diagonal re-seed the straight sits 58 segments from the hint,
        // outside the projection's ±40 window, so it is invisible).
        // Within RIVAL_DRIVER_LINE_POINT_CLAMP of the line point
        // (analysis.points[0], s=0), resolve the ambiguity toward the
        // lap the rig is actually on: re-seed to the straight (segment
        // 0) rather than whichever side of the joint is nearer.
        const linePoint = analysis.points[0];
        const lineDx = tick.x - linePoint[0];
        const lineDz = tick.z - linePoint[1];
        if (
          lineDx * lineDx + lineDz * lineDz <=
          RIVAL_DRIVER_LINE_POINT_CLAMP * RIVAL_DRIVER_LINE_POINT_CLAMP
        ) {
          const a = analysis.points[0];
          const b = analysis.points[1];
          const ex = b[0] - a[0];
          const ez = b[1] - a[1];
          const lenSq = ex * ex + ez * ez;
          let t = lenSq > 0 ? ((tick.x - a[0]) * ex + (tick.z - a[1]) * ez) / lenSq : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const d0 = analysis.cumulativeDistances[0];
          const d1 = analysis.cumulativeDistances[1];
          nearest = { s: d0 + (d1 - d0) * t, index: 0 };
        }
        // The lap the re-seeded s belongs to: the one that keeps totalS
        // closest to where it is (the rig has already crossed the line,
        // so this is the lap it is on, not the one the pinned s claims).
        const lap = Math.round((state.totalS - nearest.s) / length);
        state.totalS = lap * length + nearest.s;
        state.lap = Math.floor(state.totalS / length);
        state.sampleIndex = nearest.index;
        state.stuckRefTotalS = state.totalS;
        state.stuckTimeS = 0;
        // STALL Part 2 — the re-seed fired, so the rig is pinned or
        // circling: mark it recovering so step 9 caps its target at the
        // corner floor until it makes sustained route progress again.
        // The re-seed corrects the projection; the cap breaks the
        // circling.
        state.recovering = true;
        state.recoveringRefTotalS = state.totalS;
      }
    }
  }

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

  // LADDER-1D: step this rig's stamina — same module, same rates as the
  // player. Rivals are Biga with stock loadout (no team size or loadout
  // data exists for rivals), so those factors read 1.0 here. The step runs
  // only while racing: the early return above owns the roll phase.
  // LADDER-1E Part 5: the rung drain multiplier, from the driver's own
  // rung (resolved at creation, fail-closed to District) — the District
  // field drains at 0.8×, the League at 1.0×. The rung is the driver's,
  // never the player's: a rival's drain follows the race it is in.
  stepRaceStamina(state.stamina, {
    speed: tick.speed,
    paceCap: state.paceTarget,
    dtMs: dt * 1000,
    teamSize: 2,
    wheelsId: 'wheels_standard',
    finishId: 'finish_stock',
    zone,
    lap: state.lap,
    drainMultiplier: rungStaminaDrainMultiplier(state.rung),
  });

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
  //    STALL Part 2 — a recovering rig (flagged by the re-seed) steers
  //    toward a point RIVAL_DRIVER_RECOVERY_LOOKAHEAD ahead instead:
  //    the 2-unit target sits ~90° to the side of a rig knocked off its
  //    line, so pure pursuit orbits it; the 10-unit target sits mostly
  //    forward, so the rig drives toward it and rejoins. The offset
  //    blend above still reads the 2-unit lookahead, so only the
  //    steering target moves. The recovery lookahead is NOT clamped at
  //    the line: it wraps naturally (routePointAt wraps modulo the
  //    length) onto the next lap's straight, ~10 units ahead of the rig
  //    and outside its turn circle. An earlier version clamped it at
  //    the line, which made the target the line point itself — ~2.3
  //    units away, inside the 1.90-unit turn circle at the 0.8 recovery
  //    pace — and the rig traced a ~3.6-unit loop without closing
  //    (the orbit). The clamp created the near target; removing it is
  //    the fix.
  const steerLookS = state.recovering
    ? s + RIVAL_DRIVER_RECOVERY_LOOKAHEAD
    : lookS;
  const targetPoint = routePointAt(analysis, steerLookS);
  const normal = routeInsideNormalAt(analysis, steerLookS);
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
  //    LADDER-1D: the pace cap is the style fraction × the stamina
  //    multiplier × the warning fraction. A tired rig's target eases down
  //    smoothly (1.0 above 40 stamina, 0.88 at 0) — the same helper the
  //    player uses, so the physics never forks. LADDER-1E: Fortuna's Hand
  //    multiplies the same product (rivals only, off on the final lap —
  //    `fortunasHand.ts`): the Hand is a *rubber-band*, the stamina
  //    multiplier is a *tiredness* effect — different helpers, different
  //    modules, and the two compose here as paceCap × style × stamina ×
  //    Hand, never one hiding the other. The follow cap below still
  //    reads the leader's RAW paceTarget (not its effective pace): a tired
  //    leader lowers the follower's cap through its actual speed, and the
  //    raw cap stays the upper bound — that interaction is the follow cap
  //    working as designed, not a bug to fix.
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
  const styleFraction = rivalStyleTargetFraction(state, zone);
  const staminaMultiplier = paceCapMultiplierFor(state.stamina.pool);
  // LADDER-1E: Fortuna's Hand — the player's unwrapped route distance
  // (lap × length + s) against this rig's own (`state.totalS`). Both
  // flanks share one length (`raceRival.ts`: both flanks share one
  // length), so the totals compare across sides: a rival on the other
  // flank is still ahead of or behind the player in the race. No player
  // snapshot (the soak harness, a unit test with no player) fails closed
  // to 1.0 — the Hand never fires there, so the soak pins hold exactly.
  const player = tick.others.find((o) => o.id === 'player') ?? null;
  const handMultiplier = fortunasHandMultiplier({
    playerTotal: player === null ? null : player.lap * length + player.s,
    myTotal: state.totalS,
    lap: state.lap,
    totalLaps: state.totalLaps,
    rung: state.rung,
  });
  if (handMultiplier !== 1) state.handTicks += 1;
  let target = Math.min(
    state.paceTarget * paceFraction * styleFraction * staminaMultiplier * handMultiplier,
    cornerLimit,
  );
  let followBrake = false;
  // STALL Part 2 — a finished leader does not cap the follower. A rig
  // that completed its laps freezes at speed 0 on the track (the soak
  // harness stops stepping it), and the cap below reads ahead.speed +
  // 0.02 — so a follower a lap behind, inside the follow distance, is
  // capped to 0.02 forever and can never finish. Seed 30 3-lap, tiberius
  // behind the finished albata: target 0.02, throttle 0, speed 0.00 for
  // the remaining 682.8 s, clear of any wall (body 3.29, nose 5.08), no
  // steward. The signal is the caller's `finished` flag, NOT the lap
  // count: the driver does not know the race length (the soak runner
  // creates drivers without `laps`, so totalLaps=1 there even in a
  // 3-lap race — a lap comparison would lift the cap behind every
  // leader that completed one lap, and the field would stop holding
  // spacing). A racing leader stopped at speed 0 (mid-incident,
  // mid-recovery) has `finished` unset, so the cap still holds the
  // field behind it at the hook, and only a parked rig is passed. The
  // overtake window above still sees the finished rig, so a faster
  // follower passes it on a window; a slower one drives its line past
  // it and the separation resolver keeps them apart.
  if (ahead !== null && ahead.finished !== true && state.overtake.targetId === null && aheadGap <= RIVAL_FOLLOW_DISTANCE) {
    // Capped by BOTH the leader's pace and its actual speed: the pace
    // stops the creep (the leader's actual speed oscillates ±0.05 above
    // its mean, so capping on the actual speed alone lets the follower
    // close 3.8 units in 25 s), and the actual speed stops the pile-up
    // at the hook (the leader's pace is 2.54 there but its actual speed
    // is 0.83 — capping on the pace alone drives the follower into it).
    target = Math.min(target, ahead.paceTarget, ahead.speed + RIVAL_PACE_ADVANTAGE_MARGIN);
    if (tick.speed > ahead.speed + 0.5) followBrake = true;
  }
  // STALL Part 2 — recovery speed cap: while recovering (set only by
  // the re-seed firing after 2 s of no route progress), cap the target
  // at the corner floor so the rig turns at a tight radius toward its
  // target instead of orbiting at full pace. The cap sits here, after
  // the follow cap, so it is the final word on the target in every
  // case. It is gated on `recovering`, never on the lateral error and
  // never on reseedEnabled alone: the lateral-error signal is blind
  // to the orbit (the projection re-pins to the diagonal as the rig
  // orbits, so |lateral − offset| stays 0.01–2.64 during the fast
  // circling, under its threshold) and it fired in healthy racing,
  // flipping the ordering pin.
  if (state.recovering) {
    target = Math.min(target, RIVAL_DRIVER_RECOVERY_SPEED);
  }
  // LADDER-1E: the target the driver throttles around, after the corner
  // limit and the follow cap — readable here so a test can prove the exact
  // composition (pace cap × style × stamina × Hand).
  state.lastTarget = target;
  let throttle: number;
  if (followBrake) throttle = -1;
  else if (tick.speed < target - RIVAL_DRIVER_SPEED_HYSTERESIS) throttle = 1;
  else if (tick.speed > cornerLimit + RIVAL_DRIVER_BRAKE_MARGIN) throttle = -1;
  else if (tick.speed > target + RIVAL_DRIVER_SPEED_HYSTERESIS) throttle = 0;
  else throttle = state.lastThrottle;
  state.lastThrottle = throttle;

  return { throttle, steer };
}
