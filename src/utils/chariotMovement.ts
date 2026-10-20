/**
 * chariotMovement.ts — Phase C-8.70B Stage 1, Slice 2: the chariot's motion.
 *
 * A PURE module: no React, no three.js, no clock, no storage.  Its one import is
 * the arena's collision module, because the area the chariot is allowed to drive
 * in IS the arena's own perimeter ring — that ring's authored outline is the
 * single source, so the boundary the movement clamps against and the ring the
 * walking resolver stops a player at cannot drift apart.  Everything below runs
 * with no renderer at all (`bun test src/utils/chariotMovement.test.ts`).
 *
 * ── 1. THE FRAME: the model's forward axis, and the yaw offset it implies ──
 * Both facts are read off the shipping asset in code that already exists, not
 * guessed:
 *
 *   • `utils/chariotGeometry.ts` measures the model in the Y-up frame the loader
 *     hands back — X ±0.768, Y −0.035 … 1.335, Z −2.107 … 0.685 — with the
 *     draught pole, the part that points where the team would go, at
 *     Z −0.293 … −2.107: ahead of the axle on the model's LOCAL −Z, the tub's
 *     0.685 behind.
 *   • the chariot team plan's own audit states the same thing as a constant of
 *     its own, `CHARIOT_FORWARD_AXIS = '-Z'` — "the draught pole and the yoke are ahead of
 *     the axle, the footboard and the tub's open end are behind it" — which is
 *     also what makes the model's own L/R naming come out right (forward −Z,
 *     up +Y ⇒ right +X).
 *   • `utils/circusDistrictGeometry.ts` places the start line with
 *     `rotationY: 0` and says why: "The chariot's draught pole points down its
 *     own local -Z …, so `rotationY` 0 faces it down that straight".
 *
 * Therefore the model's forward IS local −Z and the yaw offset the scene must
 * apply is **0**: `rotation.y = heading` needs no correction, and the world
 * direction travelled for a heading θ is `(−sin θ, −cos θ)`.  Heading 0 faces
 * world −Z (north, down the arena's long axis) from the start line at
 * [52.34, 0, 42.5].
 *
 * Steering is signed about that: `steer` **+1 is the driver's RIGHT**, which
 * DECREASES the heading, because increasing θ turns the model's −Z nose toward
 * −X, i.e. to the driver's left.
 *
 * ── 2. THE DRIVEABLE AREA: the ring, minus the carceres block's belly ─────
 * `collisionShapes.ts` models the arena as a CLOSED 31-segment ring: two south
 * lines, the carceres block's two cheeks and its front, two straight flanks at
 * `CIRCUS_WEST_X` / `CIRCUS_EAST_X` from `CIRCUS_SOUTH_Z` to
 * `CIRCUS_OVAL_START_Z`, and the sphendone as 12 chords a side taken from
 * `CIRCUS_WEST_OUTLINE` and mirrored about `CIRCUS_AXIS_X`.
 *
 * The driveable outline this module owns is that ring's own authored data,
 * walked as one closed polygon: the west flank, the west chords to the apex on
 * the axis, their mirror back down the east side, the east flank, and the ring's
 * own south line (`CIRCUS_SOUTH_Z`) across the full width to close it.  Three of
 * the ring's 31 segments are deliberately NOT edges of it — `circus-carceres-w`,
 * `circus-carceres-e` and `circus-carceres-front` — because those three bound
 * the carceres block's own belly, which lies entirely at Z ≥ `CIRCUS_SOUTH_Z`:
 * south of the sandy floor, in stone the chariot must never enter.  The suite
 * re-derives every edge from the registry and pins exactly that exclusion.
 *
 * The chariot is kept inside that polygon by two circles rather than one, so no
 * part of it can cross the boundary:
 *
 *   | probe | forward | radius | what it covers                                 |
 *   |-------|---------|--------|------------------------------------------------|
 *   | body  | 0       | 1.05   | the whole tub / axle / wheel assembly           |
 *   | yoke  | 2.02    | 0.70   | the yoke bar (±0.65) and the pole tip (−2.107)  |
 *
 * Body radius: the model's farthest point behind the origin is its own rear
 * wheel corner, (±0.768, +0.685) against the origin — 1.032 — so 1.05 clears the
 * whole body with 0.018 to spare.  Yoke probe: that same audit measures the
 * yoke's centre line at Z −2.020 and its bar at X ±0.650, so a
 * 0.70-radius circle on that line covers both yoke ends (0.650) and the pole tip
 * (0.107 further forward) with 0.05 of margin, so the pole is not left sticking
 * into the stone on a head-on approach.
 *
 * ── 3. THE BOUNDARY RESPONSE: STOP ────────────────────────────────────────
 * Contact with the boundary sets the speed to 0 and leaves the position pushed
 * back inside — the chariot is stopped by the wall.  A slide (projecting the
 * velocity onto the wall's tangent) was rejected as the more complex of the two
 * correct behaviours: it needs the wall's tangent, a second position correction
 * and its own tests, and this slice's acceptance criterion is only that the
 * chariot cannot leave the arena or pass through its perimeter.
 *
 * ── 4. NO TUNNELLING, NO BACKGROUNDING TELEPORT ───────────────────────────
 * `advanceChariot` is the scene's entry point: it CLAMPS the frame's delta at
 * `maxFrameDt` (0.1 s) and then runs whole `fixedDt` (1/60 s) steps, so a
 * backgrounded tab — whose first frame back can report seconds of delta —
 * freezes the race instead of teleporting the chariot forward, and a fast frame
 * never sub-steps.  A single step at the maximum speed moves 0.216 units, and
 * the clamp is a *position* projection, so even an absurd `dt` cannot put the
 * chariot outside: the suite drives full throttle into every wall and asserts
 * the invariant after every step.
 *
 * ── 5. CLEAN START: a modifier, never a state ─────────────────────────────
 * `ChariotLaunchState` is the Slice-1 state machine's untouched neighbour: it is
 * resolved from the throttle and the elapsed time since `racing` began, it adds
 * no state to `raceState.ts` and no transition to its table.  Build rev during
 * `countdown`, release it inside the launch's window after GO and the launch
 * gets a short acceleration boost; hold through GO and it is bogged for the same
 * length of time.  `launchAccelScale` is a multiplier the scene hands to
 * `advanceChariot`, so the physics itself stays unmodified.
 */

import {
  CIRCUS_AXIS_X,
  CIRCUS_EAST_X,
  CIRCUS_OVAL_START_Z,
  CIRCUS_SOUTH_Z,
  CIRCUS_WEST_OUTLINE,
  CIRCUS_WEST_X,
} from './collisionShapes';

// ─────────────────────────────────────────────────────────────────────────────
// 1. The frame
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The shipping model's own forward axis — local −Z (see this file's header for
 * the three places the existing code already says so).
 */
export const CHARIOT_MODEL_FORWARD = '-Z' as const;

/**
 * The yaw the scene adds to a heading so the model faces the way the heading
 * travels: **0**, because the model's forward is already local −Z and the world
 * direction it travels is `(−sin θ, −cos θ)`.
 */
export const CHARIOT_MODEL_YAW_OFFSET = 0;

// ─────────────────────────────────────────────────────────────────────────────
// 2. The configuration — every movement constant, in one exported object
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The chariot's whole tuning surface.  Nothing below this object hard-codes a
 * speed, a rate, a radius or a duration.
 */
export const CHARIOT_MOVEMENT = {
  /** Forward speed cap, world units per second. */
  maxSpeed: 13,
  /** Reverse speed cap — deliberately a fraction of the forward one. */
  maxReverseSpeed: 3.2,
  /** Throttle-1 acceleration, units/s².  Reaches the forward cap in 2.0 s. */
  acceleration: 6.5,
  /** Throttle -1 while already moving forward: braking, not reversing. */
  brakeDeceleration: 14,
  /** Throttle -1 from rest: rolling backwards.  Reaches the reverse cap in 1.0 s. */
  reverseAcceleration: 3.2,
  /** Coasting deceleration with the throttle at rest.  Stops from the cap in 4.3 s. */
  drag: 3,
  /** Turn rate (rad/s) at a standstill — the crawl the prompt allows, nothing more. */
  turnRateAtRest: 0.35,
  /** Turn rate (rad/s) at the forward cap.  Steering scales with speed between the two. */
  turnRateAtMaxSpeed: 1.5,
  /** The fixed simulation step: 60 Hz, whatever the renderer is doing. */
  fixedDt: 1 / 60,
  /** The largest slice of a single frame the accumulator will ever take (0.1 s). */
  maxFrameDt: 0.1,
  /** Belt and braces: the most fixed steps one frame may run (0.1 / (1/60) = 6). */
  maxStepsPerFrame: 8,
  /** Boundary projection passes: the outline is very nearly convex, so 3 is ample. */
  boundaryPasses: 3,
  /** Collision radius of the circle at the model's origin (the body). */
  bodyRadius: 1.05,
  /** Where the second (yoke/pole) probe sits, along the model's forward axis. */
  noseForward: 2.02,
  /** Collision radius of that second probe. */
  noseRadius: 0.7,
  /** Gait bands, in world units per second, against a speed's magnitude. */
  gait: {
    /** Below this the chariot is Halt: stationary, or the drag's last millimetre. */
    halt: 0.2,
    /** Below this it is Walk; below `trot` it is Trot; at or above it, Gallop. */
    walk: 3.6,
    trot: 8.5,
  },
  /** Clean Start (this file's §5).  Durations in milliseconds. */
  launch: {
    /** Throttle at or above this during the countdown counts as building rev. */
    revThreshold: 0.5,
    /** Releasing inside this window after GO is a clean start. */
    releaseWindowMs: 300,
    /** The clean start's own published acceleration window. */
    cleanBoost: 1.35,
    cleanDurationMs: 1200,
    /** Holding through GO bogs the launch instead. */
    boggedFactor: 0.5,
    boggedDurationMs: 1200,
  },
} as const;

/**
 * The chase camera's own constants — this slice's one camera behaviour: a lerped
 * follow behind the chariot, with the look point carried ahead of it.
 *
 * They live here rather than in the scene for the same reason Slice 1 kept both
 * race poses in the layout module: so the suite can pin them.
 *
 * `height` is high on purpose, and measured.  The carceres block stands 2.18
 * high immediately SOUTH of the start line (`Travertine_25` 1.900 plus its
 * coping `Marble_26`, at Z 43.800 … 46.000 — see `circusDistrictGeometry.ts`),
 * and a chase camera sits south of the chariot by definition, so any sight line
 * to the 1.335-high model must clear that corner.  At `distance` 7.5 and
 * `height` 6.6 the line to the model's top passes that corner at 2.25, i.e. 0.07
 * clear, while the look-ahead keeps the frame's own pitch at a normal 24.5°.
 */
export const CHARIOT_CHASE_CAMERA = {
  /** How far behind the chariot the camera sits. */
  distance: 7.5,
  /** Camera height above the chariot's own plane. */
  height: 6.6,
  /** How far ahead of the chariot the look point is carried. */
  lookAhead: 5,
  /** Height of that look point. */
  lookHeight: 0.9,
  /** Follow rate (1/s): `1 − e^(−rate·dt)` is the per-frame blend, so it is frame-rate independent. */
  followRate: 5,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 3. The motion state
// ─────────────────────────────────────────────────────────────────────────────

/** One frame's worth of driver input.  `steer` +1 is the driver's RIGHT. */
export interface ChariotInput {
  /** −1 = full brake/reverse, 0 = no throttle (the drag coasts), +1 = full throttle. */
  throttle: number;
  /** −1 = full left, 0 = straight, +1 = full right. */
  steer: number;
}

/**
 * The chariot's whole simulation state, mutated in place by `stepChariot`.
 *
 * `accumulator` is the fixed-timestep remainder and belongs to the same object
 * so that a frame loop holds exactly one allocation for the life of the race.
 * The three physical fields are the prompt's own three: position (x, z), heading
 * (radians, the model's yaw) and speed (units/s, negative in reverse).
 */
export interface ChariotMotion {
  x: number;
  z: number;
  heading: number;
  speed: number;
  accumulator: number;
}

export function createChariotMotion(x: number, z: number, heading: number): ChariotMotion {
  return { x, z, heading, speed: 0, accumulator: 0 };
}

const clampNumber = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

/**
 * The turn rate a speed earns, linearly between the standstill crawl and the
 * forward cap: steering scales with speed, and at a standstill there is only the
 * crawl (0.35 rad/s) — no pivoting on the spot.
 */
export function chariotTurnRate(speed: number): number {
  const s = Math.abs(Number.isFinite(speed) ? speed : 0);
  const t = Math.min(s / CHARIOT_MOVEMENT.maxSpeed, 1);
  return CHARIOT_MOVEMENT.turnRateAtRest +
    (CHARIOT_MOVEMENT.turnRateAtMaxSpeed - CHARIOT_MOVEMENT.turnRateAtRest) * t;
}

/**
 * Merge two input sources into one, by clamped sum: the keyboard's and the
 * touch controls' write the SAME fields, so whichever the player uses produces
 * the same motion and using both at once cannot exceed full deflection.
 * Allocation-free — `target` is the object the frame loop reads.
 */
export function mergeChariotInputs(
  target: ChariotInput,
  a: ChariotInput,
  b: ChariotInput
): ChariotInput {
  const throttle = a.throttle + b.throttle;
  const steer = a.steer + b.steer;
  target.throttle = Number.isFinite(throttle) ? clampNumber(throttle, -1, 1) : 0;
  target.steer = Number.isFinite(steer) ? clampNumber(steer, -1, 1) : 0;
  return target;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. One fixed step, and the frame that drives it
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One fixed-timestep step.  `dt` is passed in (the caller owns the clock), the
 * state is mutated in place and returned — no allocation, so a frame loop can
 * call it as often as it needs to.
 *
 * Order: the throttle moves the speed, the speed sets the turn rate, the
 * steering turns the heading, the heading and the speed move the position, and
 * the boundary is resolved last, so nothing can leave the arena between steps.
 * `accelScale` is the Clean Start modifier (§5) and is 1 for an ordinary launch.
 */
export function stepChariot(
  motion: ChariotMotion,
  input: ChariotInput,
  dt: number,
  accelScale = 1
): ChariotMotion {
  const config = CHARIOT_MOVEMENT;
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const throttle = Number.isFinite(input.throttle) ? clampNumber(input.throttle, -1, 1) : 0;
  const steer = Number.isFinite(input.steer) ? clampNumber(input.steer, -1, 1) : 0;
  const scale = Number.isFinite(accelScale) && accelScale > 0 ? accelScale : 1;

  let speed = motion.speed;

  if (throttle > 0) {
    speed += throttle * config.acceleration * scale * step;
    if (speed > config.maxSpeed) speed = config.maxSpeed;
  } else if (throttle < 0) {
    if (speed > 0) {
      // Braking: the throttle works against the forward speed.
      speed += throttle * config.brakeDeceleration * step;
    } else {
      speed += throttle * config.reverseAcceleration * scale * step;
      if (speed < -config.maxReverseSpeed) speed = -config.maxReverseSpeed;
    }
  } else {
    // Coasting: drag toward a standstill, and settle on exactly 0 rather than
    // creeping across it forever.
    const decel = config.drag * step;
    speed = speed > decel ? speed - decel : speed < -decel ? speed + decel : 0;
  }

  // steer +1 (the driver's right) turns the nose toward +X, which is −θ.
  let heading = motion.heading - steer * chariotTurnRate(speed) * step;
  if (heading > Math.PI) heading -= 2 * Math.PI;
  else if (heading < -Math.PI) heading += 2 * Math.PI;

  motion.speed = speed;
  motion.heading = heading;
  motion.x += -Math.sin(heading) * speed * step;
  motion.z += -Math.cos(heading) * speed * step;

  clampMotionToArena(motion);
  return motion;
}

/**
 * Advance by one frame's worth of time, at a fixed timestep.
 *
 * The frame delta is CLAMPED at `maxFrameDt` (0.1 s) before it joins the
 * accumulator, so a hidden or backgrounded tab — whose first frame back reports
 * however long it was away — freezes the race rather than teleporting the
 * chariot forward, and the number of steps one frame may run stays bounded.
 */
export function advanceChariot(
  motion: ChariotMotion,
  input: ChariotInput,
  frameDt: number,
  accelScale = 1
): ChariotMotion {
  const config = CHARIOT_MOVEMENT;
  const clamped = Number.isFinite(frameDt) ? clampNumber(frameDt, 0, config.maxFrameDt) : 0;

  motion.accumulator += clamped;

  let steps = 0;
  while (motion.accumulator >= config.fixedDt && steps < config.maxStepsPerFrame) {
    stepChariot(motion, input, config.fixedDt, accelScale);
    motion.accumulator -= config.fixedDt;
    steps += 1;
  }

  return motion;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. The driveable boundary
// ─────────────────────────────────────────────────────────────────────────────

/** Mirror a west-side outline point onto the arena's east side. */
const circusMirrorX = (x: number): number => 2 * CIRCUS_AXIS_X - x;

/**
 * The driveable floor, as one closed polygon walked with the interior on its
 * LEFT in the (X, Z) plane.  Derived here from the ring's own authored values —
 * this file's header names the three ring segments that are deliberately not
 * edges of it, and the suite re-derives every edge from the registry.
 */
export const CHARIOT_DRIVEABLE_OUTLINE: ReadonlyArray<readonly [number, number]> = (() => {
  const outline: [number, number][] = [
    [CIRCUS_WEST_X, CIRCUS_SOUTH_Z],
    [CIRCUS_WEST_X, CIRCUS_OVAL_START_Z],
  ];
  // The west sphendone, from the flank's north end round to the apex on the axis.
  for (let i = 1; i < CIRCUS_WEST_OUTLINE.length; i++) {
    outline.push([CIRCUS_WEST_OUTLINE[i][0], CIRCUS_WEST_OUTLINE[i][1]]);
  }
  // …and its mirror back down the east side, apex to flank.
  for (let i = CIRCUS_WEST_OUTLINE.length - 2; i >= 0; i--) {
    outline.push([circusMirrorX(CIRCUS_WEST_OUTLINE[i][0]), CIRCUS_WEST_OUTLINE[i][1]]);
  }
  // The east flank's south end; the closing edge is the ring's own south line.
  outline.push([CIRCUS_EAST_X, CIRCUS_SOUTH_Z]);
  return outline;
})();

interface BoundaryEdge {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  /** Unit inward normal — the direction from the edge into the driveable area. */
  nx: number;
  nz: number;
}

const DRIVEABLE_EDGES: readonly BoundaryEdge[] = (() => {
  const outline = CHARIOT_DRIVEABLE_OUTLINE;
  const edges: BoundaryEdge[] = [];
  for (let i = 0; i < outline.length; i++) {
    const [x1, z1] = outline[i];
    const [x2, z2] = outline[(i + 1) % outline.length];
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz) || 1;
    // The outline is walked with the interior on the left, so rotating an edge's
    // direction by +90° in the (X, Z) plane points into the arena.
    edges.push({ x1, z1, x2, z2, nx: -dz / length, nz: dx / length });
  }
  return edges;
})();

export interface ChariotBoundaryProbe {
  /** Where the probe's centre sits along the model's forward axis. */
  forward: number;
  /** The circle's radius. */
  radius: number;
}

/**
 * The two circles the chariot is kept inside the ring by (this file's §2).  The
 * numbers are the configuration's; only their order is fixed here.
 */
export const CHARIOT_BOUNDARY_PROBES: readonly ChariotBoundaryProbe[] = [
  { forward: 0, radius: CHARIOT_MOVEMENT.bodyRadius },
  { forward: CHARIOT_MOVEMENT.noseForward, radius: CHARIOT_MOVEMENT.noseRadius },
];

/** Is a point on the driveable floor?  (Ray casting, the standard even-odd rule.) */
export function pointInDriveableArea(x: number, z: number): boolean {
  const outline = CHARIOT_DRIVEABLE_OUTLINE;
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, zi] = outline[i];
    const [xj, zj] = outline[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** The distance from a point to the nearest edge of the driveable area (always ≥ 0). */
export function distanceToDriveableBoundary(x: number, z: number): number {
  let best = Infinity;
  for (let e = 0; e < DRIVEABLE_EDGES.length; e++) {
    const edge = DRIVEABLE_EDGES[e];
    const ex = edge.x2 - edge.x1;
    const ez = edge.z2 - edge.z1;
    const lengthSq = ex * ex + ez * ez;
    let t = lengthSq > 0 ? ((x - edge.x1) * ex + (z - edge.z1) * ez) / lengthSq : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (edge.x1 + ex * t);
    const dz = z - (edge.z1 + ez * t);
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq < best) best = distanceSq;
  }
  return Math.sqrt(best);
}

/**
 * The invariant the clamp maintains: every probe circle is on the driveable
 * floor and clear of the boundary by its own radius.  The suite asserts it after
 * every step of every drive.
 */
export function isChariotInsideArena(motion: ChariotMotion): boolean {
  for (let p = 0; p < CHARIOT_BOUNDARY_PROBES.length; p++) {
    const probe = CHARIOT_BOUNDARY_PROBES[p];
    const cx = motion.x - Math.sin(motion.heading) * probe.forward;
    const cz = motion.z - Math.cos(motion.heading) * probe.forward;
    if (!pointInDriveableArea(cx, cz)) return false;
    if (distanceToDriveableBoundary(cx, cz) < probe.radius - 1e-9) return false;
  }
  return true;
}

/**
 * Resolve the boundary: every probe that has crossed (or come within its own
 * radius of) an edge is pushed back to sit exactly `radius` inside it, and the
 * whole chariot moves with it.  Up to three passes, because pushing the body
 * moves the nose and vice versa; the outline is very nearly convex, so they
 * converge.
 *
 * Returns true when the chariot touched the boundary — in which case the speed
 * is zeroed, this slice's chosen "the wall stops you" response.
 */
function clampMotionToArena(motion: ChariotMotion): boolean {
  let touching = false;

  for (let pass = 0; pass < CHARIOT_MOVEMENT.boundaryPasses; pass++) {
    let moved = false;

    for (let p = 0; p < CHARIOT_BOUNDARY_PROBES.length; p++) {
      const probe = CHARIOT_BOUNDARY_PROBES[p];
      const cx = motion.x - Math.sin(motion.heading) * probe.forward;
      const cz = motion.z - Math.cos(motion.heading) * probe.forward;

      let bestDistanceSq = Infinity;
      let bestX = 0;
      let bestZ = 0;
      let bestEdge = 0;

      for (let e = 0; e < DRIVEABLE_EDGES.length; e++) {
        const edge = DRIVEABLE_EDGES[e];
        const ex = edge.x2 - edge.x1;
        const ez = edge.z2 - edge.z1;
        const lengthSq = ex * ex + ez * ez;
        let t = lengthSq > 0 ? ((cx - edge.x1) * ex + (cz - edge.z1) * ez) / lengthSq : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = edge.x1 + ex * t;
        const qz = edge.z1 + ez * t;
        const dx = cx - qx;
        const dz = cz - qz;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq < bestDistanceSq) {
          bestDistanceSq = distanceSq;
          bestX = qx;
          bestZ = qz;
          bestEdge = e;
        }
      }

      const nearest = DRIVEABLE_EDGES[bestEdge];
      if (pointInDriveableArea(cx, cz) && Math.sqrt(bestDistanceSq) >= probe.radius) {
        continue;
      }

      const targetX = bestX + nearest.nx * probe.radius;
      const targetZ = bestZ + nearest.nz * probe.radius;
      motion.x += targetX - cx;
      motion.z += targetZ - cz;
      moved = true;
      touching = true;
    }

    if (!moved) break;
  }

  if (touching) motion.speed = 0;
  return touching;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Clean Start — a racing-state modifier
// ─────────────────────────────────────────────────────────────────────────────

export type ChariotLaunchQuality = 'none' | 'pending' | 'clean' | 'bogged';

export interface ChariotLaunchState {
  /** Did the player build rev (hold the throttle) while the gates counted down? */
  revved: boolean;
  /** How the launch resolved.  `pending` only ever exists inside the window. */
  quality: ChariotLaunchQuality;
}

export function createChariotLaunchState(): ChariotLaunchState {
  return { revved: false, quality: 'none' };
}

/**
 * Fold one frame's throttle into the launch state.
 *
 * While the gates are still counting down, a held throttle only records that rev
 * was built.  Once the race is running: no rev means no modifier at all; a
 * release inside `releaseWindowMs` of GO is a clean start; still holding when the
 * window closes is a bogged one.  Allocation-free, and it only ever moves toward
 * an outcome.
 */
export function trackChariotLaunch(
  state: ChariotLaunchState,
  throttle: number,
  racing: boolean,
  elapsedSinceGoMs: number
): void {
  const { revThreshold, releaseWindowMs } = CHARIOT_MOVEMENT.launch;

  if (!racing) {
    if (Number.isFinite(throttle) && throttle >= revThreshold) state.revved = true;
    return;
  }

  if (!state.revved) {
    state.quality = 'none';
    return;
  }
  if (state.quality === 'clean' || state.quality === 'bogged') return;

  if (throttle < revThreshold) {
    state.quality = 'clean';
    return;
  }
  state.quality = elapsedSinceGoMs > releaseWindowMs ? 'bogged' : 'pending';
}

/**
 * The launch's acceleration multiplier right now: a boost for `cleanDurationMs`
 * after a clean start, a bog for `boggedDurationMs` after a bogged one, and 1 in
 * every other case — including once either window has run out.
 */
export function launchAccelScale(state: ChariotLaunchState, elapsedSinceGoMs: number): number {
  const { cleanBoost, cleanDurationMs, boggedFactor, boggedDurationMs } = CHARIOT_MOVEMENT.launch;
  if (state.quality === 'clean') return elapsedSinceGoMs < cleanDurationMs ? cleanBoost : 1;
  if (state.quality === 'bogged') return elapsedSinceGoMs < boggedDurationMs ? boggedFactor : 1;
  return 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Gait and pace — how the HUD reads a speed, never as bare digits
// ─────────────────────────────────────────────────────────────────────────────

/** The four gait words the racing HUD shows instead of a number. */
export type ChariotGait = 'Halt' | 'Walk' | 'Trot' | 'Gallop';

/** The gait a speed reads as (by magnitude, so reverse reads Walk at most). */
export function getChariotGait(speed: number): ChariotGait {
  const { halt, walk, trot } = CHARIOT_MOVEMENT.gait;
  const s = Math.abs(Number.isFinite(speed) ? speed : 0);
  if (s < halt) return 'Halt';
  if (s < walk) return 'Walk';
  if (s < trot) return 'Trot';
  return 'Gallop';
}

/** The pace bar's fraction of the forward cap, 0 … 1. */
export function getChariotPace(speed: number): number {
  const s = Math.abs(Number.isFinite(speed) ? speed : 0);
  return Math.min(s / CHARIOT_MOVEMENT.maxSpeed, 1);
}
