/**
 * chaseCamera.ts — the race chase camera, at the studio's surveyed standard.
 * (Phase C-8.70B Stage 1, Slice 2 — the camera addendum.)
 *
 * A PURE module in `chariotMovement.ts`'s own idiom: no React, no three.js, no
 * clock, no storage, and every constant in one exported object.  It is what the
 * race scene's `RaceCameraRig` reads; the rig itself only lerps toward what
 * `composeChasePose` hands it, and Slice 2's follow smoothing (frame-based,
 * `1 − e^(−rate·dt)`) is unchanged.
 *
 * ── What the survey sets ──────────────────────────────────────────────────
 *   • **FOV** — 55° vertical at rest, widening smoothly to a capped 65° at the
 *     movement module's `maxSpeed`.  The mapping is a pure function of the
 *     chariot's own speed fraction (`getChariotPace`, i.e. |speed| / maxSpeed,
 *     clamped), smoothstepped so there is no step and no jitter at either end,
 *     and clamped beyond the cap — so it also SETTLES BACK as speed falls.
 *   • **Framing** — one named distance/height preset: Near 7.0 / 3.0, Standard
 *     8.5 / 3.4 (the default), Far 10.5 / 4.0, all measured behind the chariot.
 *   • **Look-ahead** — `heading × (4 + 0.9 × speed)`, plus a lateral steering
 *     bias that leans the look target toward the active steering input (+1 is
 *     the driver's RIGHT, `chariotMovement.ts`'s own sign).
 *
 * The constants used to live in `chariotMovement.ts`; they moved here when they
 * outgrew one behaviour, so that file stays what its name says — the chariot's
 * motion.  Nothing in the movement module changed.
 *
 * ── Why the rest framing exists (measured, not a taste call) ──────────────
 * Slice 1 measured the start composition and could not use the obvious camera:
 * "behind" the chariot is SOUTH of the start line, and the carceres block stands
 * there 2.18 high at Z 43.800 … 46.000, 18 units wide.  Worked through, a camera
 * 8.5 behind at 3.4 has the block's top face across the whole model at rest: the
 * line of sight to the 1.335-high model crosses Y 2.18 at Z 45.978, i.e. inside
 * the block, and the model's TOP only clears the block's north-top corner once
 * the chariot is **2.18** of travel clear of it (the whole model, 4.15).  The
 * Standard preset is therefore the right framing *under way* and a blind one at
 * the line — which is exactly the conflict this addendum resolves by easing.
 *
 * So the rig holds `CHASE_REST_FRAMING` — Slice 1's measured pose, expressed in
 * the chariot's own frame — while the chariot is still at the start line and
 * slow, and hands over to the preset as it gets going.  At the start line at
 * rest the composed pose IS `CIRCUS_RACE_CAMERA`, to a rounding epsilon of the
 * blend's own arithmetic (the suite pins it at 1e-12): the chariot
 * and the closed carceres read exactly as Slice 1's framed start, the take-over
 * at GO is continuous with the countdown's static camera instead of a snap, and
 * by the time the framing has fully handed over (0.55 of the cap, 7.2 u/s) the
 * chariot is clear of the block's shadow.
 *
 * The easing is the product of two smooth fades, because the rest framing is the
 * START LINE's framing and not "what a stopped chariot looks like":
 *
 *   | factor                            | full at | zero at       | what it prevents |
 *   |-----------------------------------|---------|---------------|------------------|
 *   | distance from the start line      | 0       | 5.0 of travel | a swing round to the front of the chariot every time it stops mid-track (a boundary hit zeroes the speed) |
 *   | speed fraction (`getChariotPace`) | 0       | 0.55          | a swing while a chariot crosses the line at speed |
 *
 * Both are smooth, so the product is smooth; both are monotonic, so the hand-over
 * never reverses while the player accelerates.
 */

import { CIRCUS_RACE_CAMERA, CIRCUS_RACE_START } from './circusDistrictGeometry';
import { getChariotPace } from './chariotMovement';
import type { ChariotMotion } from './chariotMovement';

// ─────────────────────────────────────────────────────────────────────────────
// 1. The distance/height presets — one named config
// ─────────────────────────────────────────────────────────────────────────────

/** The three surveyed chase distances. */
export type ChaseDistancePreset = 'near' | 'standard' | 'far';

/** A chase framing: how far behind the chariot, and how high above its plane. */
export interface ChaseFraming {
  /** How far behind the chariot the camera sits, along its heading. */
  distance: number;
  /** Camera height above the chariot's own plane (the sand, Y 0). */
  height: number;
}

/**
 * THE preset config: the chase distance and height, named.  This is what a
 * settings row reads; nothing else in the codebase restates one of these pairs.
 */
export const CHASE_DISTANCE_PRESETS = {
  near: { distance: 7.0, height: 3.0 },
  standard: { distance: 8.5, height: 3.4 },
  far: { distance: 10.5, height: 4.0 },
} as const;

/** The presets in the order a settings row would offer them. */
export const CHASE_DISTANCE_PRESET_NAMES = ['near', 'standard', 'far'] as const;

/** The surveyed default — Standard. */
export const CHASE_DISTANCE_PRESET_DEFAULT: ChaseDistancePreset = 'standard';

/**
 * Resolve a preset name to a preset.  **This is the settings row's attachment
 * point**: no settings module exists in the codebase yet (the only player
 * preference, Lefty Mode, is a field on the saved profile, which this addendum
 * must not write), so the rig calls this with no argument and gets the config's
 * default.  When the row lands it passes its stored name in here and nothing
 * else changes — an unknown or missing name still resolves to the default, so a
 * stale saved value can never leave the camera without a framing.
 */
export function resolveChaseDistancePreset(name?: string | null): ChaseDistancePreset {
  const known = CHASE_DISTANCE_PRESET_NAMES.find((preset) => preset === name);
  return known ?? CHASE_DISTANCE_PRESET_DEFAULT;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. The camera standard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The chase camera's own constants.  `fovAtRest` … `steerLookBias` are the
 * surveyed standard; `lookHeight` and `followRate` are Slice 2's, unchanged.
 */
export const CHARIOT_CHASE_CAMERA = {
  /** Vertical FOV at rest, degrees. */
  fovAtRest: 55,
  /** Vertical FOV at the movement module's `maxSpeed`, degrees — the cap. */
  fovAtFullSpeed: 65,
  /** Look-ahead at rest: world units ahead of the chariot the look point sits. */
  lookAheadBase: 4,
  /** …and how much further ahead each unit/s of speed carries it. */
  lookAheadPerSpeed: 0.9,
  /** How far the look point leans sideways at full steering input, world units. */
  steerLookBias: 2.2,
  /** Height of the look point above the chariot's plane. */
  lookHeight: 0.9,
  /** Follow rate (1/s): `1 − e^(−rate·dt)` is the per-frame blend, so it is frame-rate independent. */
  followRate: 5,
  /** The rest easing (this file's header): how far it holds, and to what speed. */
  rest: {
    /** World units of travel from the start line over which the rest framing hands over. */
    zone: 5,
    /** …and the speed fraction (`getChariotPace`) at which it has handed over. */
    speedFraction: 0.55,
  },
} as const;

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

const clampSigned = (value: number): number => (value < -1 ? -1 : value > 1 ? 1 : value);

/** 3t² − 2t³ — 0 at 0, 1 at 1, flat at both ends, monotonic between. */
const smoothStep = (t: number): number => t * t * (3 - 2 * t);

/** A quantity's contribution to a fade: 1 at 0, 0 at `span` and beyond, smooth between. */
const fadeOver = (value: number, span: number): number =>
  Number.isFinite(value) ? smoothStep(clamp01(1 - value / span)) : 0;

// ─────────────────────────────────────────────────────────────────────────────
// 3. The FOV mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The vertical FOV the chariot's speed earns, in degrees.
 *
 * Coupled to the movement module's OWN speed fraction (`getChariotPace`, the
 * HUD pace bar's input, so there is one definition of "how fast is that"), which
 * already clamps at the cap and guards a non-finite reading.  Smoothstepped, so
 * the widening has no step at either end and no jitter in between; it is a pure
 * function of the CURRENT speed, so it settles back exactly as the chariot slows.
 */
export function chaseFovForSpeed(speed: number): number {
  const { fovAtRest, fovAtFullSpeed } = CHARIOT_CHASE_CAMERA;
  return fovAtRest + (fovAtFullSpeed - fovAtRest) * smoothStep(getChariotPace(speed));
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. The look-ahead
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How far ahead of the chariot the look point is carried: `4 + 0.9 × speed`.
 *
 * Signed speed, as the survey states it: at the 13 u/s cap the look point is
 * 15.7 ahead, coasting to a stop it comes back to 4, and reversing shortens it
 * further (1.12 at the 3.2 reverse cap) — the frame looks closer to the chariot
 * the slower it is going.
 */
export function chaseLookAhead(speed: number): number {
  const s = Number.isFinite(speed) ? speed : 0;
  return CHARIOT_CHASE_CAMERA.lookAheadBase + CHARIOT_CHASE_CAMERA.lookAheadPerSpeed * s;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. The rest framing — Slice 1's measured start pose, in the chariot's frame
// ─────────────────────────────────────────────────────────────────────────────

/** An offset along the chariot's own axes. */
interface LocalOffset {
  /** Along the chariot's heading (−Z at heading 0, the way it drives). */
  forward: number;
  /** Toward the driver's right (+X at heading 0). */
  right: number;
  /** Straight up. */
  up: number;
}

/**
 * The start line's yaw frame.  `CIRCUS_RACE_START.rotationY` is 0 (the chariot's
 * pole faces world −Z), but the frame is derived rather than assumed, so the
 * offset below stays Slice 1's if the line is ever turned.
 */
const START_FRAME = (() => {
  const yaw = CIRCUS_RACE_START.rotationY;
  return {
    forwardX: -Math.sin(yaw),
    forwardZ: -Math.cos(yaw),
    rightX: Math.cos(yaw),
    rightZ: -Math.sin(yaw),
  };
})();

/** Read a world offset from the start line as the chariot's own forward/right/up. */
const localOffset = (x: number, y: number, z: number): LocalOffset => ({
  forward: x * START_FRAME.forwardX + z * START_FRAME.forwardZ,
  right: x * START_FRAME.rightX + z * START_FRAME.rightZ,
  up: y,
});

/**
 * Slice 1's measured start composition, expressed in the chariot's own frame:
 * camera 8.5 ahead, 3.66 to the driver's right, 3.4 up; look point 0.5 ahead,
 * 0.9 up.  DERIVED from `CIRCUS_RACE_CAMERA` and `CIRCUS_RACE_START`, so the
 * framing and the layout module's own measured pose cannot drift apart — at the
 * start line, at heading 0, this composes back to exactly that pose.
 */
export const CHASE_REST_FRAMING = {
  camera: localOffset(
    CIRCUS_RACE_CAMERA.position[0] - CIRCUS_RACE_START.x,
    CIRCUS_RACE_CAMERA.position[1] - CIRCUS_RACE_START.y,
    CIRCUS_RACE_CAMERA.position[2] - CIRCUS_RACE_START.z
  ),
  look: localOffset(
    CIRCUS_RACE_CAMERA.target[0] - CIRCUS_RACE_START.x,
    CIRCUS_RACE_CAMERA.target[1] - CIRCUS_RACE_START.y,
    CIRCUS_RACE_CAMERA.target[2] - CIRCUS_RACE_START.z
  ),
} as const;

/**
 * How much of the rest framing the pose keeps, 0 … 1: full at the start line at
 * rest, zero once the chariot is under way or has left the start (this file's
 * header has the two fades and why each exists).
 */
export function chaseRestWeight(motion: ChariotMotion): number {
  const dx = motion.x - CIRCUS_RACE_START.x;
  const dz = motion.z - CIRCUS_RACE_START.z;
  const travelled = Math.sqrt(dx * dx + dz * dz);
  return (
    fadeOver(travelled, CHARIOT_CHASE_CAMERA.rest.zone) *
    fadeOver(getChariotPace(motion.speed), CHARIOT_CHASE_CAMERA.rest.speedFraction)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. The desired pose — allocation-free, straight into the rig's own object
// ─────────────────────────────────────────────────────────────────────────────

/** A desired camera pose: where the camera goes, and what it looks at. */
export interface ChasePose {
  x: number;
  y: number;
  z: number;
  lookX: number;
  lookY: number;
  lookZ: number;
}

/** The object `composeChasePose` writes into.  One allocation per race, not per frame. */
export function createChasePose(): ChasePose {
  return { x: 0, y: 0, z: 0, lookX: 0, lookY: 0, lookZ: 0 };
}

/**
 * The pose the rig should be following this frame, written into `out` and
 * returned — allocation-free, the way `mergeChariotInputs` writes into the frame
 * loop's own object.
 *
 * It is the preset framing behind the chariot, blended toward the rest framing by
 * `chaseRestWeight`: at the start line at rest that blend is all rest pose (Slice
 * 1's start composition, preserved exactly), and under way it is all preset.  The
 * look point is carried `chaseLookAhead(speed)` ahead along the heading and leaned
 * `steerLookBias × steer` toward the active steering input (+1 the driver's right)
 * — and the lean, like the whole rest pose, is multiplied out at rest, so it
 * cannot disturb the measured start composition.
 */
export function composeChasePose(
  out: ChasePose,
  motion: ChariotMotion,
  steer: number,
  preset: ChaseDistancePreset = CHASE_DISTANCE_PRESET_DEFAULT
): ChasePose {
  const framing: ChaseFraming =
    CHASE_DISTANCE_PRESETS[preset] ?? CHASE_DISTANCE_PRESETS[CHASE_DISTANCE_PRESET_DEFAULT];
  const forwardX = -Math.sin(motion.heading);
  const forwardZ = -Math.cos(motion.heading);
  const rightX = -forwardZ;
  const rightZ = forwardX;

  const steerInput = Number.isFinite(steer) ? clampSigned(steer) : 0;
  const lean = steerInput * CHARIOT_CHASE_CAMERA.steerLookBias;
  const ahead = chaseLookAhead(motion.speed);
  const weight = chaseRestWeight(motion);

  const rest = CHASE_REST_FRAMING;

  // The preset framing: behind the chariot, at its height; look point ahead.
  const chaseX = motion.x - forwardX * framing.distance;
  const chaseZ = motion.z - forwardZ * framing.distance;
  const chaseLookX = motion.x + forwardX * ahead + rightX * lean;
  const chaseLookZ = motion.z + forwardZ * ahead + rightZ * lean;

  // Slice 1's start composition, in the chariot's own frame.
  const restX = motion.x + forwardX * rest.camera.forward + rightX * rest.camera.right;
  const restZ = motion.z + forwardZ * rest.camera.forward + rightZ * rest.camera.right;
  const restLookX = motion.x + forwardX * rest.look.forward + rightX * rest.look.right;
  const restLookZ = motion.z + forwardZ * rest.look.forward + rightZ * rest.look.right;

  out.x = chaseX + (restX - chaseX) * weight;
  out.y = framing.height + (rest.camera.up - framing.height) * weight;
  out.z = chaseZ + (restZ - chaseZ) * weight;
  out.lookX = chaseLookX + (restLookX - chaseLookX) * weight;
  out.lookY =
    CHARIOT_CHASE_CAMERA.lookHeight + (rest.look.up - CHARIOT_CHASE_CAMERA.lookHeight) * weight;
  out.lookZ = chaseLookZ + (restLookZ - chaseLookZ) * weight;
  return out;
}
