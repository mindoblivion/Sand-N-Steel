/**
 * chaseCamera.test.ts — the chase camera's own unit suite (the camera addendum
 * to Phase C-8.70B Stage 1, Slice 2).
 *
 * Run with: bun test src/utils/chaseCamera.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A the standard itself and the module's purity: 55° → 65°, the three named
 *      distance presets with Standard the default, one exported config object;
 *   §B the FOV mapping — 55 at rest, 65 at the movement module's cap, monotonic
 *      between, clamped beyond, and smooth (no step, no jitter), with the
 *      non-finite inputs falling back rather than propagating;
 *   §C the look-ahead composition — `4 + 0.9 × speed` along the heading, the
 *      steering bias leaning the look target toward the driver's right, the
 *      camera's own position untouched by steering;
 *   §D the presets and the settings row's attachment point;
 *   §E the rest framing: Slice 1's START composition read back through the
 *      composer at the start line at rest, the eased hand-over, and the
 *      continuity of a launch;
 *   §F the allocation-free contract the frame loop depends on.
 *
 * Every expectation is computed from the shipped module, the movement module's
 * own cap and the layout module's own measured pose; nothing is copied from the
 * module's comments.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  CHARIOT_CHASE_CAMERA,
  CHASE_DISTANCE_PRESETS,
  CHASE_DISTANCE_PRESET_DEFAULT,
  CHASE_DISTANCE_PRESET_NAMES,
  CHASE_REST_FRAMING,
  chaseFovForSpeed,
  chaseLookAhead,
  chaseRestWeight,
  composeChasePose,
  createChasePose,
  resolveChaseDistancePreset,
} from './chaseCamera';
import type { ChaseDistancePreset, ChasePose } from './chaseCamera';
import {
  CHARIOT_MOVEMENT,
  advanceChariot,
  createChariotMotion,
  getChariotPace,
} from './chariotMovement';
import { CIRCUS_RACE_CAMERA, CIRCUS_RACE_START } from './circusDistrictGeometry';

const moduleSource = readFileSync(new URL('./chaseCamera.ts', import.meta.url), 'utf8');
/** The source with its comments stripped, so prose cannot satisfy (or defeat) a check. */
const moduleCode = moduleSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

/** The start line, at rest — the one state the rest framing exists for. */
const atStart = () =>
  createChariotMotion(CIRCUS_RACE_START.x, CIRCUS_RACE_START.z, CIRCUS_RACE_START.rotationY);

/** A motion far from the start line, so the preset framing is the whole pose. */
const underWay = (speed: number, heading = 0) => {
  const motion = createChariotMotion(CIRCUS_RACE_START.x, 0, heading);
  motion.speed = speed;
  return motion;
};

const pose = () => createChasePose();

// ══════════════════════════════════════════════════════════════════════════
// A. The standard, and the module's purity
// ══════════════════════════════════════════════════════════════════════════

describe('A. The surveyed standard', () => {
  test('the FOV ends are the survey’s 55 and 65', () => {
    expect(CHARIOT_CHASE_CAMERA.fovAtRest).toBe(55);
    expect(CHARIOT_CHASE_CAMERA.fovAtFullSpeed).toBe(65);
    expect(CHARIOT_CHASE_CAMERA.fovAtFullSpeed).toBeGreaterThan(CHARIOT_CHASE_CAMERA.fovAtRest);
  });

  test('the look-ahead composition is 4 + 0.9 × speed', () => {
    expect(CHARIOT_CHASE_CAMERA.lookAheadBase).toBe(4);
    expect(CHARIOT_CHASE_CAMERA.lookAheadPerSpeed).toBe(0.9);
    expect(CHARIOT_CHASE_CAMERA.steerLookBias).toBeGreaterThan(0);
  });

  test('Slice 2’s follow smoothing is unchanged', () => {
    expect(CHARIOT_CHASE_CAMERA.followRate).toBe(5);
    expect(CHARIOT_CHASE_CAMERA.lookHeight).toBe(0.9);
  });

  test('the module is pure: no renderer, no DOM, no clock and no storage', () => {
    for (const token of [
      'react',
      'three',
      'useFrame',
      'document.',
      'window.',
      'localStorage',
      'sessionStorage',
      'performance.now',
    ]) {
      expect(moduleCode.toLowerCase(), token).not.toContain(token);
    }
    expect(moduleCode).toContain("from './chariotMovement'");
    expect(moduleCode).toContain("from './circusDistrictGeometry'");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The FOV mapping
// ══════════════════════════════════════════════════════════════════════════

describe('B. The FOV widens with speed and settles back', () => {
  test('rest is 55 and the movement module’s own cap is 65', () => {
    expect(chaseFovForSpeed(0)).toBe(55);
    expect(chaseFovForSpeed(CHARIOT_MOVEMENT.maxSpeed)).toBe(65);
    // the fraction it is coupled to is the movement module's own reading
    expect(getChariotPace(CHARIOT_MOVEMENT.maxSpeed)).toBe(1);
  });

  test('the mapping is smooth and monotonic between the two ends', () => {
    const samples: number[] = [];
    const steps = 1000;
    for (let i = 0; i <= steps; i++) {
      samples.push(chaseFovForSpeed((i / steps) * CHARIOT_MOVEMENT.maxSpeed));
    }
    let largestStep = 0;
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
      largestStep = Math.max(largestStep, samples[i] - samples[i - 1]);
    }
    expect(samples[0]).toBe(55);
    expect(samples[samples.length - 1]).toBe(65);
    // a 1/1000-of-the-cap step may not move the FOV by even a hundredth of a
    // degree: no step and no jitter anywhere on the curve
    expect(largestStep).toBeLessThan(0.02);
  });

  test('it is clamped beyond the cap, and a non-finite reading falls back to rest', () => {
    expect(chaseFovForSpeed(CHARIOT_MOVEMENT.maxSpeed * 8)).toBe(65);
    expect(chaseFovForSpeed(1e6)).toBe(65);
    // magnitude, as the pace bar reads it: reversing widens too, to its own cap
    expect(chaseFovForSpeed(-CHARIOT_MOVEMENT.maxSpeed * 8)).toBe(65);
    expect(chaseFovForSpeed(-CHARIOT_MOVEMENT.maxReverseSpeed)).toBeGreaterThan(55);
    expect(chaseFovForSpeed(-CHARIOT_MOVEMENT.maxReverseSpeed)).toBeLessThan(65);
    // the speed fraction is the movement module's, which guards a non-finite
    // reading as ZERO — so junk can never widen the frame
    expect(chaseFovForSpeed(Number.NaN)).toBe(55);
    expect(chaseFovForSpeed(Number.POSITIVE_INFINITY)).toBe(55);
    expect(getChariotPace(Number.POSITIVE_INFINITY)).toBe(0);
  });

  test('it settles back to rest as the chariot slows', () => {
    const atSpeed = chaseFovForSpeed(CHARIOT_MOVEMENT.maxSpeed * 0.5);
    expect(atSpeed).toBeGreaterThan(55);
    expect(chaseFovForSpeed(CHARIOT_MOVEMENT.maxSpeed * 0.25)).toBeLessThan(atSpeed);
    expect(chaseFovForSpeed(0)).toBe(CHARIOT_CHASE_CAMERA.fovAtRest);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. The look-ahead composition
// ══════════════════════════════════════════════════════════════════════════

describe('C. The look point is carried ahead, and leans into the steering', () => {
  test('the look-ahead is 4 at rest and 15.7 at the cap', () => {
    expect(chaseLookAhead(0)).toBe(4);
    expect(chaseLookAhead(CHARIOT_MOVEMENT.maxSpeed)).toBeCloseTo(15.7, 9);
    expect(chaseLookAhead(CHARIOT_MOVEMENT.maxSpeed)).toBeGreaterThan(chaseLookAhead(0));
    // reversing shortens it, and a non-finite reading falls back to rest
    expect(chaseLookAhead(-CHARIOT_MOVEMENT.maxReverseSpeed)).toBeLessThan(4);
    expect(chaseLookAhead(-CHARIOT_MOVEMENT.maxReverseSpeed)).toBeGreaterThan(0);
    expect(chaseLookAhead(Number.NaN)).toBe(4);
  });

  test('the look point sits on the heading, at the look height', () => {
    const out = pose();
    composeChasePose(out, underWay(0), 0);
    // heading 0 faces world −Z, so the look point is 4 north of the chariot
    expect(out.lookX).toBeCloseTo(CIRCUS_RACE_START.x, 9);
    expect(out.lookY).toBe(CHARIOT_CHASE_CAMERA.lookHeight);
    expect(out.lookZ).toBeCloseTo(0 - chaseLookAhead(0), 9);

    // and it follows the heading rather than the world axes
    const turned = pose();
    composeChasePose(turned, underWay(0, Math.PI / 2), 0);
    expect(turned.lookX).toBeCloseTo(CIRCUS_RACE_START.x - chaseLookAhead(0), 9);
    expect(turned.lookZ).toBeCloseTo(0, 9);
  });

  test('the preset framing is behind the chariot, at its height', () => {
    for (const preset of CHASE_DISTANCE_PRESET_NAMES) {
      const out = pose();
      composeChasePose(out, underWay(0), 0, preset);
      // heading 0: behind is +Z, so the camera is `distance` south of the chariot
      expect(out.x, preset).toBeCloseTo(CIRCUS_RACE_START.x, 9);
      expect(out.z, preset).toBeCloseTo(CHASE_DISTANCE_PRESETS[preset].distance, 9);
      expect(out.y, preset).toBe(CHASE_DISTANCE_PRESETS[preset].height);
    }
    // and it swings round with the heading, staying behind the chariot
    const turned = pose();
    composeChasePose(turned, underWay(0, Math.PI / 2), 0, 'standard');
    expect(turned.x).toBeCloseTo(CIRCUS_RACE_START.x + CHASE_DISTANCE_PRESETS.standard.distance, 9);
    expect(turned.z).toBeCloseTo(0, 9);
  });

  test('steering leans the look target toward the driver’s right, and only the look target', () => {
    const straight = pose();
    const right = pose();
    const left = pose();
    composeChasePose(straight, underWay(0), 0);
    composeChasePose(right, underWay(0), 1);
    composeChasePose(left, underWay(0), -1);

    // `steer +1` is the driver's RIGHT — at heading 0, world +X (the movement
    // module's own sign: it DECREASES the heading)
    expect(right.lookX).toBeCloseTo(straight.lookX + CHARIOT_CHASE_CAMERA.steerLookBias, 9);
    expect(left.lookX).toBeCloseTo(straight.lookX - CHARIOT_CHASE_CAMERA.steerLookBias, 9);
    expect(right.lookZ).toBeCloseTo(straight.lookZ, 9);
    expect(left.lookY).toBe(straight.lookY);

    // at heading π/2 the driver's right is world −Z, not +X
    const rightTurned = pose();
    composeChasePose(rightTurned, underWay(0, Math.PI / 2), 1);
    expect(rightTurned.lookZ).toBeCloseTo(-CHARIOT_CHASE_CAMERA.steerLookBias, 9);

    // the CAMERA does not move: only the view leans
    expect(right.x).toBeCloseTo(straight.x, 12);
    expect(right.z).toBeCloseTo(straight.z, 12);
    expect(left.x).toBeCloseTo(straight.x, 12);
    expect(left.z).toBeCloseTo(straight.z, 12);

    // a full deflection is all a biased lean can be, and junk reads as straight
    const over = pose();
    composeChasePose(over, underWay(0), 4);
    expect(over.lookX).toBeCloseTo(right.lookX, 12);
    const junk = pose();
    composeChasePose(junk, underWay(0), Number.NaN);
    expect(junk.lookX).toBeCloseTo(straight.lookX, 12);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. The presets, and the settings row's attachment point
// ══════════════════════════════════════════════════════════════════════════

describe('D. The distance presets', () => {
  test('Near, Standard and Far are the surveyed pairs, in order', () => {
    expect(CHASE_DISTANCE_PRESET_NAMES).toEqual(['near', 'standard', 'far']);
    expect(CHASE_DISTANCE_PRESETS.near).toEqual({ distance: 7.0, height: 3.0 });
    expect(CHASE_DISTANCE_PRESETS.standard).toEqual({ distance: 8.5, height: 3.4 });
    expect(CHASE_DISTANCE_PRESETS.far).toEqual({ distance: 10.5, height: 4.0 });
    // nearer is lower and farther is higher and further back
    expect(CHASE_DISTANCE_PRESETS.near.distance).toBeLessThan(CHASE_DISTANCE_PRESETS.standard.distance);
    expect(CHASE_DISTANCE_PRESETS.standard.distance).toBeLessThan(CHASE_DISTANCE_PRESETS.far.distance);
    expect(CHASE_DISTANCE_PRESETS.near.height).toBeLessThan(CHASE_DISTANCE_PRESETS.standard.height);
    expect(CHASE_DISTANCE_PRESETS.standard.height).toBeLessThan(CHASE_DISTANCE_PRESETS.far.height);
  });

  test('Standard is the default, and it is what a caller gets for nothing', () => {
    expect(CHASE_DISTANCE_PRESET_DEFAULT).toBe('standard');
    expect(resolveChaseDistancePreset()).toBe('standard');
    expect(resolveChaseDistancePreset(undefined)).toBe('standard');
    expect(resolveChaseDistancePreset(null)).toBe('standard');
    for (const name of CHASE_DISTANCE_PRESET_NAMES) {
      expect(resolveChaseDistancePreset(name)).toBe(name);
    }
  });

  test('the resolver is total: an unknown, stale or mistyped name resolves to the default', () => {
    for (const junk of ['huge', '', 'NEAR', ' Standard', 'close', '0', 'far ']) {
      expect(resolveChaseDistancePreset(junk), junk).toBe(CHASE_DISTANCE_PRESET_DEFAULT);
    }
  });

  test('the composition falls back to Standard for an unknown preset rather than losing a framing', () => {
    const standard = pose();
    const junk = pose();
    composeChasePose(standard, underWay(0), 0, 'standard');
    composeChasePose(junk, underWay(0), 0, 'huge' as ChaseDistancePreset);
    expect(junk).toEqual(standard);
  });

  test('changing the preset changes the framing and nothing else', () => {
    const near = pose();
    const far = pose();
    composeChasePose(near, underWay(CHARIOT_MOVEMENT.maxSpeed), 0.5, 'near');
    composeChasePose(far, underWay(CHARIOT_MOVEMENT.maxSpeed), 0.5, 'far');
    // behind the chariot at heading 0 is +Z, so the FAR camera is the larger Z
    expect(near.lookX).toBeCloseTo(far.lookX, 12);
    expect(near.lookZ).toBeCloseTo(far.lookZ, 12);
    expect(far.z - near.z).toBeCloseTo(
      CHASE_DISTANCE_PRESETS.far.distance - CHASE_DISTANCE_PRESETS.near.distance,
      9
    );
    expect(far.y - near.y).toBeCloseTo(
      CHASE_DISTANCE_PRESETS.far.height - CHASE_DISTANCE_PRESETS.near.height,
      9
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. The rest framing — Slice 1's start composition, and the eased hand-over
// ══════════════════════════════════════════════════════════════════════════

describe('E. The start composition is preserved at rest', () => {
  test('the rest framing is Slice 1’s measured pose, read back in the chariot’s frame', () => {
    // camera 8.5 AHEAD (the layout module's camera is north-east of the line),
    // 3.66 to the driver's right, 3.4 up; look point 0.5 ahead at 0.9 up
    expect(CHASE_REST_FRAMING.camera.forward).toBeCloseTo(8.5, 12);
    expect(CHASE_REST_FRAMING.camera.right).toBeCloseTo(3.66, 12);
    expect(CHASE_REST_FRAMING.camera.up).toBeCloseTo(3.4, 12);
    expect(CHASE_REST_FRAMING.look.forward).toBeCloseTo(0.5, 12);
    expect(CHASE_REST_FRAMING.look.right).toBeCloseTo(0, 12);
    expect(CHASE_REST_FRAMING.look.up).toBeCloseTo(CIRCUS_RACE_CAMERA.target[1], 12);
  });

  test('at the start line, at rest, the composed pose IS Slice 1’s framed start', () => {
    const motion = atStart();
    expect(motion.speed).toBe(0);
    expect(chaseRestWeight(motion)).toBe(1);

    const out = pose();
    composeChasePose(out, motion, 0);
    expect(out.x).toBeCloseTo(CIRCUS_RACE_CAMERA.position[0], 12);
    expect(out.y).toBeCloseTo(CIRCUS_RACE_CAMERA.position[1], 12);
    expect(out.z).toBeCloseTo(CIRCUS_RACE_CAMERA.position[2], 12);
    expect(out.lookX).toBeCloseTo(CIRCUS_RACE_CAMERA.target[0], 12);
    expect(out.lookY).toBeCloseTo(CIRCUS_RACE_CAMERA.target[1], 12);
    expect(out.lookZ).toBeCloseTo(CIRCUS_RACE_CAMERA.target[2], 12);

    // …at rest, on the line, the take-over at GO is therefore continuous with
    // the countdown's static camera rather than a snap
    expect(out.z).not.toBeCloseTo(CIRCUS_RACE_START.z + CHASE_DISTANCE_PRESETS.standard.distance, 6);
  });

  test('the eased hand-over exists because the Standard framing is blind there', () => {
    // An 8.5-behind / 3.4-high camera looks over the carceres block (2.18 high,
    // north face Z 43.8) at the 1.335-high model: the sight line crosses the
    // block's own top plane.  Measured here rather than asserted from prose.
    const cameraZ = CIRCUS_RACE_START.z + CHASE_DISTANCE_PRESETS.standard.distance;
    const blockNorthZ = 43.8;
    const blockTopY = 2.18;
    const modelTopY = 1.335;
    const cameraY = CHASE_DISTANCE_PRESETS.standard.height;
    const sightYAtBlock =
      cameraY + (modelTopY - cameraY) * ((cameraZ - blockNorthZ) / (cameraZ - CIRCUS_RACE_START.z));
    expect(sightYAtBlock).toBeLessThan(blockTopY);

    // and the rest framing does not: 8.5 AHEAD of the line, on the arena floor
    const rest = pose();
    composeChasePose(rest, atStart(), 0);
    expect(rest.z).toBeLessThan(CIRCUS_RACE_START.z);
  });

  test('the rest framing holds only at the start line and only at rest', () => {
    expect(chaseRestWeight(atStart())).toBe(1);

    // under way: gone by the configured speed fraction
    const quick = atStart();
    quick.speed = CHARIOT_MOVEMENT.maxSpeed * CHARIOT_CHASE_CAMERA.rest.speedFraction;
    expect(chaseRestWeight(quick)).toBe(0);
    quick.speed = CHARIOT_MOVEMENT.maxSpeed;
    expect(chaseRestWeight(quick)).toBe(0);

    // …and gone at the configured distance from the line, exactly
    const far = createChariotMotion(CIRCUS_RACE_START.x, CIRCUS_RACE_START.z - CHARIOT_CHASE_CAMERA.rest.zone, 0);
    expect(chaseRestWeight(far)).toBe(0);

    // …and gone once the chariot has left the start line, however slowly: a
    // boundary hit zeroes the speed mid-track and must NOT swing the camera round
    // to the front of the chariot
    const stoppedMidTrack = createChariotMotion(CIRCUS_RACE_START.x, CIRCUS_RACE_START.z - 20, 0);
    expect(stoppedMidTrack.speed).toBe(0);
    expect(chaseRestWeight(stoppedMidTrack)).toBe(0);

    // and it is monotonic on the distance factor: nearer is never less than further
    let previous = 1;
    for (let travelled = 0; travelled <= CHARIOT_CHASE_CAMERA.rest.zone / 2; travelled += 0.05) {
      const motion = createChariotMotion(CIRCUS_RACE_START.x, CIRCUS_RACE_START.z - travelled, 0);
      const weight = chaseRestWeight(motion);
      expect(weight).toBeLessThanOrEqual(previous + 1e-12);
      expect(weight).toBeGreaterThan(0);
      previous = weight;
    }
  });

  test('a launch hands over continuously — the pose never takes a step', () => {
    const motion = atStart();
    // a straight launch: the camera's own continuity is what this measures, and
    // the steering bias leans only the look point (§C drives that separately)
    const input = { throttle: 1, steer: 0 };
    const out = pose();
    const previous: ChasePose = { ...createChasePose() };

    let largestStep = 0;
    let largestFovStep = 0;
    let previousFov = chaseFovForSpeed(motion.speed);
    const weightAtStart = chaseRestWeight(motion);

    for (let step = 0; step < 180; step++) {
      // the shipped fixed-timestep frame, one 1/60 s slice at a time
      advanceChariot(motion, input, CHARIOT_MOVEMENT.fixedDt);
      composeChasePose(out, motion, input.steer);
      const fov = chaseFovForSpeed(motion.speed);

      if (step > 0) {
        for (const axis of ['x', 'y', 'z', 'lookX', 'lookY', 'lookZ'] as const) {
          largestStep = Math.max(largestStep, Math.abs(out[axis] - previous[axis]));
        }
        expect(fov).toBeGreaterThanOrEqual(previousFov);
        largestFovStep = Math.max(largestFovStep, fov - previousFov);
      }
      Object.assign(previous, out);
      previousFov = fov;
    }

    // the launch ends with the chariot under way and the framing fully handed over
    expect(motion.speed).toBeCloseTo(CHARIOT_MOVEMENT.maxSpeed, 6);
    expect(weightAtStart).toBe(1);
    expect(chaseRestWeight(motion)).toBe(0);
    // a frame may not teleport the camera or jump the FOV
    expect(largestStep).toBeLessThan(1.5);
    expect(largestFovStep).toBeLessThan(0.35);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. The allocation-free contract
// ══════════════════════════════════════════════════════════════════════════

describe('F. The frame loop allocates nothing', () => {
  test('the composition writes into the object it is given', () => {
    const out = createChasePose();
    const returned = composeChasePose(out, underWay(4), 0.5, 'standard');
    expect(returned).toBe(out);
    // and composing again overwrites it rather than handing back a new object
    const before = { ...out };
    composeChasePose(out, underWay(9), -0.5, 'far');
    expect(out).not.toEqual(before);
  });

  test('the factory is a factory: each call is its own object', () => {
    expect(createChasePose()).not.toBe(createChasePose());
    expect(createChasePose()).toEqual({ x: 0, y: 0, z: 0, lookX: 0, lookY: 0, lookZ: 0 });
  });

  test('the module exports no mutable state a frame could write to', () => {
    // every export is a constant, a factory, or a function of its arguments
    expect(moduleCode).not.toContain('let ');
    expect(moduleCode).toContain('export function composeChasePose(');
    expect(moduleCode).toContain('export interface ChasePose {');
  });
});
