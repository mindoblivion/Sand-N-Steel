/**
 * chariotMovement.test.ts — Phase C-8.70B Stage 1, Slice 2: the movement unit suite.
 *
 * Run with: bun test src/utils/chariotMovement.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A the configuration and the module's purity (one exported constant object,
 *      no renderer, no storage);
 *   §B the acceleration curve and its forward cap, and the Clean Start
 *      multiplier's effect on it;
 *   §C drag: a coasting chariot slows monotonically, settles on EXACTLY zero and
 *      then does not move again;
 *   §D braking, and the reverse cap;
 *   §E steering: the rate scales with speed, the standstill rate is the crawl
 *      and nothing more, and the sign is the driver's right;
 *   §F integration: the position follows heading × speed, on both axes;
 *   §G the fixed timestep and the dt clamp that keeps a backgrounded tab from
 *      teleporting the chariot;
 *   §H the driveable boundary — derived from the registry, driven into from every
 *      heading at full speed, and shown to hold after EVERY step;
 *   §I Clean Start: a modifier over the Slice-1 machine's `racing` state, never a
 *      new state or transition;
 *   §J the two input paths merge into the same throttle/steer values, so touch
 *      and keyboard cannot produce different motion;
 *   §K gait and pace: the HUD's vocabulary, never bare digits;
 *   §L the no-allocation contract the frame loop depends on.
 *
 * Every expectation is computed from the shipped module or re-derived in the
 * test; nothing is copied from the module's own comments.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  CHARIOT_BOUNDARY_PROBES,
  CHARIOT_CHASE_CAMERA,
  CHARIOT_DRIVEABLE_OUTLINE,
  CHARIOT_MODEL_FORWARD,
  CHARIOT_MODEL_YAW_OFFSET,
  CHARIOT_MOVEMENT,
  advanceChariot,
  chariotTurnRate,
  createChariotLaunchState,
  createChariotMotion,
  distanceToDriveableBoundary,
  getChariotGait,
  getChariotPace,
  isChariotInsideArena,
  launchAccelScale,
  mergeChariotInputs,
  pointInDriveableArea,
  stepChariot,
  trackChariotLaunch,
} from './chariotMovement';
import type { ChariotInput, ChariotMotion } from './chariotMovement';
import { CITY_COLLIDERS, CIRCUS_AXIS_X, CIRCUS_EAST_X, CIRCUS_SOUTH_Z, CIRCUS_WEST_X } from './collisionShapes';
import { CIRCUS_RACE_START } from './circusDistrictGeometry';

const moduleSource = readFileSync(new URL('./chariotMovement.ts', import.meta.url), 'utf8');

/** The module with its comments stripped, so no assertion can be defeated by prose. */
const moduleCode = moduleSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('//'))
  .join('\n');

const cfg = CHARIOT_MOVEMENT;
const STEP = cfg.fixedDt;

/** The start pose the scene mounts the chariot at. */
const START_X = CIRCUS_RACE_START.x;
const START_Z = CIRCUS_RACE_START.z;
const START_HEADING = CIRCUS_RACE_START.rotationY;

const input = (throttle: number, steer = 0): ChariotInput => ({ throttle, steer });

const atStart = (): ChariotMotion => createChariotMotion(START_X, START_Z, START_HEADING);

/** Drive `steps` fixed steps and hand back the motion. */
function drive(motion: ChariotMotion, throttle: number, steer: number, steps: number): ChariotMotion {
  for (let i = 0; i < steps; i += 1) stepChariot(motion, input(throttle, steer), STEP);
  return motion;
}

/** The test's OWN ray-cast containment test, over the module's exported outline. */
function insideOutline(x: number, z: number): boolean {
  const outline = CHARIOT_DRIVEABLE_OUTLINE;
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, zi] = outline[i];
    const [xj, zj] = outline[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Every probe circle of `motion` is inside the outline and clear of it by its radius. */
function probesClear(motion: ChariotMotion): boolean {
  for (const probe of CHARIOT_BOUNDARY_PROBES) {
    const cx = motion.x - Math.sin(motion.heading) * probe.forward;
    const cz = motion.z - Math.cos(motion.heading) * probe.forward;
    if (!insideOutline(cx, cz)) return false;
    if (distanceToDriveableBoundary(cx, cz) < probe.radius - 1e-9) return false;
  }
  return true;
}

// ══════════════════════════════════════════════════════════════════════════
// A. The configuration, and the module's purity
// ══════════════════════════════════════════════════════════════════════════

describe('A. The configuration', () => {
  test('every movement constant lives in the one exported object', () => {
    expect(Object.keys(cfg).sort()).toEqual([
      'acceleration',
      'bodyRadius',
      'boundaryPasses',
      'brakeDeceleration',
      'drag',
      'fixedDt',
      'gait',
      'launch',
      'maxFrameDt',
      'maxReverseSpeed',
      'maxSpeed',
      'maxStepsPerFrame',
      'noseForward',
      'noseRadius',
      'reverseAcceleration',
      'turnRateAtMaxSpeed',
      'turnRateAtRest',
    ]);
    expect(Object.keys(cfg.gait).sort()).toEqual(['halt', 'trot', 'walk']);
    expect(Object.keys(cfg.launch).sort()).toEqual([
      'boggedDurationMs',
      'boggedFactor',
      'cleanBoost',
      'cleanDurationMs',
      'releaseWindowMs',
      'revThreshold',
    ]);
  });

  test('the constants are coherent', () => {
    expect(cfg.maxReverseSpeed).toBeLessThan(cfg.maxSpeed);
    expect(cfg.drag).toBeLessThan(cfg.acceleration);
    expect(cfg.turnRateAtRest).toBeLessThan(cfg.turnRateAtMaxSpeed);
    expect(cfg.fixedDt).toBeCloseTo(1 / 60, 12);
    expect(cfg.maxFrameDt).toBe(0.1);
    expect(cfg.maxStepsPerFrame * cfg.fixedDt).toBeGreaterThanOrEqual(cfg.maxFrameDt);
    expect(cfg.gait.halt).toBeLessThan(cfg.gait.walk);
    expect(cfg.gait.walk).toBeLessThan(cfg.gait.trot);
    expect(cfg.gait.trot).toBeLessThan(cfg.maxSpeed);
    expect(cfg.bodyRadius).toBeGreaterThan(0);
    expect(cfg.noseRadius).toBeGreaterThan(0);
    expect(cfg.noseForward).toBeGreaterThan(0);
  });

  test('the frame is the model’s own −Z with a zero yaw offset', () => {
    expect(CHARIOT_MODEL_FORWARD).toBe('-Z');
    expect(CHARIOT_MODEL_YAW_OFFSET).toBe(0);
    // the start pose travels down world −Z, i.e. heading 0 has no correction
    expect(START_HEADING + CHARIOT_MODEL_YAW_OFFSET).toBe(0);
  });

  test('the chase camera is one behaviour with a positive follow rate', () => {
    expect(CHARIOT_CHASE_CAMERA.distance).toBeGreaterThan(0);
    expect(CHARIOT_CHASE_CAMERA.height).toBeGreaterThan(0);
    expect(CHARIOT_CHASE_CAMERA.lookAhead).toBeGreaterThan(0);
    expect(CHARIOT_CHASE_CAMERA.followRate).toBeGreaterThan(0);
  });

  test('the module is pure: no renderer, no DOM and no storage', () => {
    for (const token of ['react', 'three', 'useFrame', 'document.', 'window.', 'localStorage', 'sessionStorage']) {
      expect(moduleCode.toLowerCase(), token).not.toContain(token);
    }
    expect(moduleCode).toContain("from './collisionShapes'");
    expect(moduleSource).toContain('CHARIOT_MOVEMENT');
  });

  test('a fresh motion starts at rest with an empty accumulator', () => {
    const motion = atStart();
    expect(motion.x).toBe(START_X);
    expect(motion.z).toBe(START_Z);
    expect(motion.heading).toBe(START_HEADING);
    expect(motion.speed).toBe(0);
    expect(motion.accumulator).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. Acceleration and its forward cap
// ══════════════════════════════════════════════════════════════════════════

describe('B. Acceleration', () => {
  test('full throttle accelerates and never exceeds the forward cap', () => {
    // 150 steps is ~30 units of the arena's 73: the cap is reached well before
    // the north taper, so the drive stays clear of the boundary
    const motion = atStart();
    let previous = 0;
    for (let i = 0; i < 150; i += 1) {
      stepChariot(motion, input(1), STEP);
      expect(motion.speed).toBeGreaterThanOrEqual(previous);
      expect(motion.speed).toBeLessThanOrEqual(cfg.maxSpeed);
      previous = motion.speed;
    }
    expect(motion.speed).toBe(cfg.maxSpeed);
  });

  test('the cap is reached in exactly the time acceleration implies', () => {
    const motion = atStart();
    const stepsToCap = Math.ceil(cfg.maxSpeed / (cfg.acceleration * STEP));
    drive(motion, 1, 0, stepsToCap - 1);
    expect(motion.speed).toBeLessThan(cfg.maxSpeed);
    stepChariot(motion, input(1), STEP);
    expect(motion.speed).toBeCloseTo(cfg.maxSpeed, 6);
  });

  test('partial throttle gives a proportional share of the acceleration', () => {
    const half = drive(atStart(), 0.5, 0, 60);
    const full = drive(atStart(), 1, 0, 60);
    expect(half.speed).toBeCloseTo(full.speed / 2, 9);
  });

  test('the Clean Start boost accelerates harder and the bog softens it', () => {
    const plain = drive(atStart(), 1, 0, 30);
    const boosted = atStart();
    for (let i = 0; i < 30; i += 1) stepChariot(boosted, input(1), STEP, cfg.launch.cleanBoost);
    const bogged = atStart();
    for (let i = 0; i < 30; i += 1) stepChariot(bogged, input(1), STEP, cfg.launch.boggedFactor);

    expect(boosted.speed).toBeGreaterThan(plain.speed);
    expect(bogged.speed).toBeLessThan(plain.speed);
    expect(boosted.speed).toBeCloseTo(plain.speed * cfg.launch.cleanBoost, 9);
    expect(bogged.speed).toBeCloseTo(plain.speed * cfg.launch.boggedFactor, 9);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. Drag
// ══════════════════════════════════════════════════════════════════════════

describe('C. Drag', () => {
  test('a coasting chariot slows monotonically to a standstill', () => {
    const motion = atStart();
    drive(motion, 1, 0, 200);
    expect(motion.speed).toBe(cfg.maxSpeed);

    let previous = motion.speed;
    for (let i = 0; i < 600; i += 1) {
      stepChariot(motion, input(0), STEP);
      expect(motion.speed).toBeLessThanOrEqual(previous);
      expect(motion.speed).toBeGreaterThanOrEqual(0);
      previous = motion.speed;
    }
    expect(motion.speed).toBe(0);
  });

  test('the drag stops the chariot in the time the constant implies', () => {
    const motion = atStart();
    drive(motion, 1, 0, 200);
    const stepsToStop = Math.ceil(cfg.maxSpeed / (cfg.drag * STEP));
    drive(motion, 0, 0, stepsToStop);
    // at most one drag step short of the standstill, and exactly at rest a step later
    expect(motion.speed).toBeLessThanOrEqual(cfg.drag * STEP);
    stepChariot(motion, input(0), STEP);
    expect(motion.speed).toBe(0);
  });

  test('no movement at zero throttle once the drag has settled', () => {
    const motion = atStart();
    drive(motion, 1, 0, 200);
    drive(motion, 0, 0, 600);
    const settled = { x: motion.x, z: motion.z, heading: motion.heading };
    drive(motion, 0, 0, 600);
    expect(motion.speed).toBe(0);
    expect(motion.x).toBe(settled.x);
    expect(motion.z).toBe(settled.z);
    expect(motion.heading).toBe(settled.heading);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. Braking and the reverse cap
// ══════════════════════════════════════════════════════════════════════════

describe('D. Braking and reverse', () => {
  test('the brake sheds speed faster than the drag does', () => {
    const braking = atStart();
    drive(braking, 1, 0, 200);
    drive(braking, -1, 0, 30);
    const coasting = atStart();
    drive(coasting, 1, 0, 200);
    drive(coasting, 0, 0, 30);
    expect(braking.speed).toBeLessThan(coasting.speed);
  });

  test('braking through zero rolls into reverse and caps there', () => {
    const motion = atStart();
    drive(motion, 1, 0, 200);
    drive(motion, -1, 0, 300);
    expect(motion.speed).toBe(-cfg.maxReverseSpeed);

    let lowest = motion.speed;
    for (let i = 0; i < 300; i += 1) {
      stepChariot(motion, input(-1), STEP);
      expect(motion.speed).toBeGreaterThanOrEqual(-cfg.maxReverseSpeed);
      expect(motion.speed).toBeLessThanOrEqual(lowest);
      lowest = motion.speed;
    }
    expect(motion.speed).toBe(-cfg.maxReverseSpeed);
  });

  test('a standing start reverses at the reverse acceleration', () => {
    const motion = drive(createChariotMotion(START_X, 0, START_HEADING), -1, 0, 30);
    expect(motion.speed).toBeCloseTo(-cfg.reverseAcceleration * 30 * STEP, 9);
    expect(motion.speed).toBeGreaterThan(-cfg.maxReverseSpeed);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. Steering
// ══════════════════════════════════════════════════════════════════════════

describe('E. Steering', () => {
  test('the turn rate scales with speed between the crawl and the cap', () => {
    expect(chariotTurnRate(0)).toBeCloseTo(cfg.turnRateAtRest, 12);
    expect(chariotTurnRate(cfg.maxSpeed)).toBeCloseTo(cfg.turnRateAtMaxSpeed, 12);
    expect(chariotTurnRate(cfg.maxSpeed * 4)).toBeCloseTo(cfg.turnRateAtMaxSpeed, 12);
    expect(chariotTurnRate(-cfg.maxSpeed)).toBeCloseTo(cfg.turnRateAtMaxSpeed, 12);

    let previous = chariotTurnRate(0);
    for (let speed = 0.5; speed <= cfg.maxSpeed; speed += 0.5) {
      const rate = chariotTurnRate(speed);
      expect(rate).toBeGreaterThanOrEqual(previous);
      previous = rate;
    }
  });

  test('at a standstill the only steering is the crawl, and nothing moves', () => {
    const motion = atStart();
    const x0 = motion.x;
    const z0 = motion.z;
    drive(motion, 0, 1, 60);
    expect(motion.speed).toBe(0);
    expect(motion.x).toBe(x0);
    expect(motion.z).toBe(z0);
    expect(Math.abs(motion.heading)).toBeCloseTo(cfg.turnRateAtRest, 9);
  });

  test('steer +1 is the driver’s right: it turns the nose toward +X', () => {
    const right = drive(atStart(), 1, 1, 60);
    const left = drive(atStart(), 1, -1, 60);
    expect(right.heading).toBeLessThan(START_HEADING);
    expect(left.heading).toBeGreaterThan(START_HEADING);
    // the forward axis travels `(−sin θ, −cos θ)`, so the right-hand turn gains +X
    expect(right.x).toBeGreaterThan(START_X);
    expect(left.x).toBeLessThan(START_X);
    expect(right.heading).toBeCloseTo(-left.heading, 9);
    expect(right.z).toBeCloseTo(left.z, 9);
  });

  test('the same steer turns further at speed than at a crawl', () => {
    const fast = drive(atStart(), 1, 1, 60);
    const crawl = drive(atStart(), 0, 1, 60);
    expect(Math.abs(fast.heading)).toBeGreaterThan(Math.abs(crawl.heading));
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. Integration
// ══════════════════════════════════════════════════════════════════════════

describe('F. Integration', () => {
  test('heading 0 travels straight down world −Z with no sideways drift', () => {
    const motion = drive(atStart(), 1, 0, 60);
    expect(motion.x).toBe(START_X);
    expect(motion.z).toBeLessThan(START_Z);
    // distance covered ≈ ½·a·t² over the first second of acceleration
    expect(START_Z - motion.z).toBeGreaterThan(0.5 * cfg.acceleration * 0.98);
    expect(START_Z - motion.z).toBeLessThan(0.5 * cfg.acceleration * 1.02);
  });

  test('heading +π/2 travels down world −X with no drift along Z', () => {
    const motion = createChariotMotion(START_X, START_Z, Math.PI / 2);
    drive(motion, 1, 0, 60);
    expect(motion.z).toBe(START_Z);
    expect(motion.x).toBeLessThan(START_X);
  });

  test('the position follow is heading × speed, step by step', () => {
    const motion = atStart();
    for (let i = 0; i < 100; i += 1) {
      const before = { x: motion.x, z: motion.z, speed: motion.speed };
      stepChariot(motion, input(1, 0.4), STEP);
      // the step accelerates first, then travels with the NEW speed and heading
      const travelled = (before.speed + cfg.acceleration * STEP) * STEP;
      expect(motion.heading).toBeLessThanOrEqual(START_HEADING);
      expect(motion.z - before.z).toBeCloseTo(-Math.cos(motion.heading) * travelled, 9);
      expect(motion.x - before.x).toBeCloseTo(-Math.sin(motion.heading) * travelled, 9);
    }
  });

  test('the heading stays wrapped inside ±π however long it turns', () => {
    const motion = atStart();
    drive(motion, 1, 1, 2000);
    expect(motion.heading).toBeGreaterThanOrEqual(-Math.PI);
    expect(motion.heading).toBeLessThanOrEqual(Math.PI);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// G. The fixed timestep and the dt clamp
// ══════════════════════════════════════════════════════════════════════════

describe('G. The fixed timestep', () => {
  test('two half-frames land where one whole frame does', () => {
    const split = atStart();
    advanceChariot(split, input(1), 0.05);
    advanceChariot(split, input(1), 0.05);
    const whole = atStart();
    advanceChariot(whole, input(1), 0.1);

    expect(split.speed).toBeCloseTo(whole.speed, 9);
    expect(split.z).toBeCloseTo(whole.z, 9);
    expect(split.x).toBeCloseTo(whole.x, 9);
  });

  test('a backgrounded tab cannot teleport the chariot: the delta is clamped', () => {
    const clamped = atStart();
    advanceChariot(clamped, input(1), 10);
    const honest = atStart();
    advanceChariot(honest, input(1), cfg.maxFrameDt);

    expect(clamped.speed).toBe(honest.speed);
    expect(clamped.z).toBe(honest.z);
    // …and the distance covered is bounded by the clamp, not by the frame's delta
    expect(START_Z - clamped.z).toBeLessThan(cfg.maxSpeed * cfg.maxFrameDt + 1e-9);
  });

  test('the step count is bounded by the clamp', () => {
    const motion = atStart();
    // 10 s of frame delta, clamped to 0.1 s, is at most 8 fixed steps
    advanceChariot(motion, input(1), 10);
    expect(motion.speed).toBeLessThanOrEqual(cfg.acceleration * cfg.maxStepsPerFrame * STEP);
    expect(motion.accumulator).toBeLessThan(cfg.fixedDt);
  });

  test('a negative or nonsense delta is a no-op', () => {
    const motion = atStart();
    advanceChariot(motion, input(1), -5);
    advanceChariot(motion, input(1), Number.NaN);
    expect(motion.speed).toBe(0);
    expect(motion.z).toBe(START_Z);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// H. The driveable boundary
// ══════════════════════════════════════════════════════════════════════════

describe('H. The boundary', () => {
  test('the outline is the ring’s own data, walked as one polygon', () => {
    const outline = CHARIOT_DRIVEABLE_OUTLINE;
    expect(outline[0]).toEqual([CIRCUS_WEST_X, CIRCUS_SOUTH_Z]);
    expect(outline[outline.length - 1]).toEqual([CIRCUS_EAST_X, CIRCUS_SOUTH_Z]);
    expect(outline.length).toBe(27);
    expect(outline[outline.length - 1][0]).toBeCloseTo(2 * CIRCUS_AXIS_X - CIRCUS_WEST_X, 9);
  });

  test('every edge but the closing south line is a registry segment, endpoint for endpoint', () => {
    const ring = CITY_COLLIDERS.filter((collider) => collider.id.startsWith('circus-'));
    expect(ring.length).toBe(31);

    const key = (x1: number, z1: number, x2: number, z2: number): string => {
      const a = `${x1.toFixed(6)},${z1.toFixed(6)}`;
      const b = `${x2.toFixed(6)},${z2.toFixed(6)}`;
      return a < b ? `${a}|${b}` : `${b}|${a}`;
    };
    const segments = new Map<string, string>();
    for (const collider of ring) {
      if (collider.type !== 'segment') continue;
      segments.set(key(collider.x1, collider.z1, collider.x2, collider.z2), collider.id);
    }

    const matched = new Set<string>();
    let unmatched = 0;
    for (let i = 0; i < CHARIOT_DRIVEABLE_OUTLINE.length; i += 1) {
      const [x1, z1] = CHARIOT_DRIVEABLE_OUTLINE[i];
      const [x2, z2] = CHARIOT_DRIVEABLE_OUTLINE[(i + 1) % CHARIOT_DRIVEABLE_OUTLINE.length];
      const id = segments.get(key(x1, z1, x2, z2));
      if (id) matched.add(id);
      else {
        unmatched += 1;
        // the one unmatched edge is the ring's own south line, taken full width
        expect(z1).toBe(CIRCUS_SOUTH_Z);
        expect(z2).toBe(CIRCUS_SOUTH_Z);
        expect(Math.min(x1, x2)).toBe(CIRCUS_WEST_X);
        expect(Math.max(x1, x2)).toBe(CIRCUS_EAST_X);
      }
    }
    expect(unmatched).toBe(1);

    // the five registry segments the driveable floor does not use…
    const unused = [...segments.entries()].filter(([, id]) => !matched.has(id)).map(([k]) => k);
    expect(unused.length).toBe(5);
    const unusedIds = [...segments.entries()]
      .filter(([, id]) => !matched.has(id))
      .map(([, id]) => id)
      .sort();
    expect(unusedIds).toEqual([
      'circus-carceres-e',
      'circus-carceres-front',
      'circus-carceres-w',
      'circus-south-e',
      'circus-south-w',
    ]);

    // …and every one of them lies on or SOUTH of the driveable floor's south line
    for (const collider of ring) {
      if (collider.type !== 'segment' || !unusedIds.includes(collider.id)) continue;
      expect(collider.z1).toBeGreaterThanOrEqual(CIRCUS_SOUTH_Z);
      expect(collider.z2).toBeGreaterThanOrEqual(CIRCUS_SOUTH_Z);
    }
  });

  test('the boundary’s inward normals point into the arena, edge by edge', () => {
    const outline = CHARIOT_DRIVEABLE_OUTLINE;
    for (let i = 0; i < outline.length; i += 1) {
      const [x1, z1] = outline[i];
      const [x2, z2] = outline[(i + 1) % outline.length];
      const dx = x2 - x1;
      const dz = z2 - z1;
      const length = Math.hypot(dx, dz);
      expect(length).toBeGreaterThan(0.3);
      const nx = -dz / length;
      const nz = dx / length;
      const probeX = (x1 + x2) / 2 + nx * 0.05;
      const probeZ = (z1 + z2) / 2 + nz * 0.05;
      expect(insideOutline(probeX, probeZ), `edge ${i}`).toBe(true);
      expect(insideOutline(probeX - 2 * nx * 0.05, probeZ - 2 * nz * 0.05), `edge ${i}`).toBe(false);
    }
  });

  test('the start pose is on the driveable floor', () => {
    const motion = atStart();
    expect(pointInDriveableArea(motion.x, motion.z)).toBe(true);
    expect(isChariotInsideArena(motion)).toBe(true);
    expect(probesClear(motion)).toBe(true);
  });

  test('full throttle into the boundary from sixteen headings stays inside, every step', () => {
    for (let i = 0; i < 16; i += 1) {
      const motion = createChariotMotion(START_X, START_Z, (i / 16) * Math.PI * 2);
      for (let step = 0; step < 600; step += 1) {
        stepChariot(motion, input(1), STEP);
        expect(isChariotInsideArena(motion), `heading index ${i}, step ${step}`).toBe(true);
        expect(probesClear(motion), `heading index ${i}, step ${step}`).toBe(true);
      }
    }
  });

  test('reversing into the arena’s south line stops the chariot dead', () => {
    const motion = drive(atStart(), -1, 0, 60);
    expect(motion.z).toBeCloseTo(CIRCUS_SOUTH_Z - cfg.bodyRadius, 9);
    expect(motion.speed).toBe(0);
    expect(motion.x).toBe(START_X);
    // and it stays pinned there rather than creeping through
    drive(motion, -1, 0, 60);
    expect(motion.z).toBeCloseTo(CIRCUS_SOUTH_Z - cfg.bodyRadius, 9);
    expect(motion.speed).toBe(0);
  });

  test('even an absurd dt cannot put the chariot outside', () => {
    const motion = atStart();
    for (const heading of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 3]) {
      const probe = createChariotMotion(START_X, START_Z, heading);
      stepChariot(probe, input(1), 5);
      stepChariot(probe, input(-1), 5);
      expect(isChariotInsideArena(probe), `heading ${heading}`).toBe(true);
    }
    expect(isChariotInsideArena(motion)).toBe(true);
  });

  test('a corner hit cannot squeeze the chariot out through the sphendone', () => {
    // drive hard up the west flank and into the north taper, turning the whole way
    const motion = atStart();
    for (let step = 0; step < 900; step += 1) {
      stepChariot(motion, input(1, step < 300 ? 1 : -1), STEP);
      expect(isChariotInsideArena(motion), `step ${step}`).toBe(true);
    }
    expect(probesClear(motion)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// I. Clean Start — a modifier over `racing`
// ══════════════════════════════════════════════════════════════════════════

describe('I. Clean Start', () => {
  test('a launch with no rev gets no modifier at all', () => {
    const state = createChariotLaunchState();
    expect(state).toEqual({ revved: false, quality: 'none' });
    trackChariotLaunch(state, 1, true, 100);
    expect(state.revved).toBe(false);
    expect(state.quality).toBe('none');
    expect(launchAccelScale(state, 100)).toBe(1);
  });

  test('rev is built during the countdown and only there', () => {
    const state = createChariotLaunchState();
    trackChariotLaunch(state, 0.2, false, 0);
    expect(state.revved).toBe(false);
    trackChariotLaunch(state, cfg.launch.revThreshold, false, 0);
    expect(state.revved).toBe(true);
    expect(state.quality).toBe('none'); // nothing resolves while the gates are up
  });

  test('releasing inside the window is a clean start with a bounded boost', () => {
    const state = createChariotLaunchState();
    trackChariotLaunch(state, 1, false, 0);
    trackChariotLaunch(state, 1, true, 50);
    expect(state.quality).toBe('pending');
    trackChariotLaunch(state, 0, true, 60);
    expect(state.quality).toBe('clean');

    expect(launchAccelScale(state, 0)).toBe(cfg.launch.cleanBoost);
    expect(launchAccelScale(state, cfg.launch.cleanDurationMs - 1)).toBe(cfg.launch.cleanBoost);
    expect(launchAccelScale(state, cfg.launch.cleanDurationMs)).toBe(1);
    expect(launchAccelScale(state, cfg.launch.cleanDurationMs * 10)).toBe(1);
  });

  test('holding through GO bogs the launch, and a later release cannot undo it', () => {
    const state = createChariotLaunchState();
    trackChariotLaunch(state, 1, false, 0);
    trackChariotLaunch(state, 1, true, cfg.launch.releaseWindowMs + 1);
    expect(state.quality).toBe('bogged');
    expect(launchAccelScale(state, 0)).toBe(cfg.launch.boggedFactor);
    expect(launchAccelScale(state, cfg.launch.boggedDurationMs - 1)).toBe(cfg.launch.boggedFactor);
    expect(launchAccelScale(state, cfg.launch.boggedDurationMs)).toBe(1);

    trackChariotLaunch(state, 0, true, cfg.launch.releaseWindowMs + 2);
    expect(state.quality).toBe('bogged');
  });

  test('the modifier scales acceleration only — the cap is the configuration’s', () => {
    // mid-arena, so a boosted launch reaches the cap with room to spare
    const boosted = createChariotMotion(START_X, 0, START_HEADING);
    for (let i = 0; i < 130; i += 1) stepChariot(boosted, input(1), STEP, cfg.launch.cleanBoost);
    expect(boosted.speed).toBe(cfg.maxSpeed);

    // the bog is a ratio on the rate, and never moves the cap itself
    const bogged = createChariotMotion(START_X, 0, START_HEADING);
    const plain = createChariotMotion(START_X, 0, START_HEADING);
    for (let i = 0; i < 30; i += 1) {
      stepChariot(bogged, input(1), STEP, cfg.launch.boggedFactor);
      stepChariot(plain, input(1), STEP);
    }
    expect(bogged.speed).toBeCloseTo(plain.speed * cfg.launch.boggedFactor, 9);
    expect(bogged.speed).toBeLessThan(cfg.maxSpeed);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// J. One merged input
// ══════════════════════════════════════════════════════════════════════════

describe('J. One merged input', () => {
  test('either path alone produces the same merged values', () => {
    const merged = { throttle: 0, steer: 0 };
    mergeChariotInputs(merged, { throttle: 1, steer: -1 }, { throttle: 0, steer: 0 });
    expect(merged).toEqual({ throttle: 1, steer: -1 });
    mergeChariotInputs(merged, { throttle: 0, steer: 0 }, { throttle: 1, steer: -1 });
    expect(merged).toEqual({ throttle: 1, steer: -1 });
  });

  test('using both at once cannot exceed full deflection, and nonsense is a standstill', () => {
    const merged = { throttle: 0, steer: 0 };
    mergeChariotInputs(merged, { throttle: 1, steer: 1 }, { throttle: 1, steer: 1 });
    expect(merged).toEqual({ throttle: 1, steer: 1 });
    mergeChariotInputs(merged, { throttle: -1, steer: -1 }, { throttle: -1, steer: -1 });
    expect(merged).toEqual({ throttle: -1, steer: -1 });
    mergeChariotInputs(merged, { throttle: Number.NaN, steer: 0 }, { throttle: 0, steer: 0 });
    expect(merged).toEqual({ throttle: 0, steer: 0 });
  });

  test('touch and keyboard are indistinguishable for the same inputs', () => {
    const keyboard = atStart();
    const touch = atStart();
    const mergedA = { throttle: 0, steer: 0 };
    const mergedB = { throttle: 0, steer: 0 };

    for (let i = 0; i < 240; i += 1) {
      const throttle = i < 120 ? 1 : i < 180 ? -1 : 0;
      const steer = i % 90 < 45 ? 1 : -1;
      // the keyboard path
      mergeChariotInputs(mergedA, { throttle, steer }, { throttle: 0, steer: 0 });
      stepChariot(keyboard, mergedA, STEP);
      // the touch path
      mergeChariotInputs(mergedB, { throttle: 0, steer: 0 }, { throttle, steer });
      stepChariot(touch, mergedB, STEP);
    }

    expect(mergedB).toEqual(mergedA);
    expect(touch.x).toBe(keyboard.x);
    expect(touch.z).toBe(keyboard.z);
    expect(touch.heading).toBe(keyboard.heading);
    expect(touch.speed).toBe(keyboard.speed);
  });

  test('out-of-range inputs are clamped before they reach the physics', () => {
    const wild = drive(createChariotMotion(START_X, START_Z, START_HEADING), 9, 0, 30);
    const full = drive(atStart(), 1, 0, 30);
    expect(wild.speed).toBe(full.speed);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// K. Gait and pace
// ══════════════════════════════════════════════════════════════════════════

describe('K. Gait and pace', () => {
  test('the gait bands read a speed as a word', () => {
    expect(getChariotGait(0)).toBe('Halt');
    expect(getChariotGait(cfg.gait.halt - 1e-6)).toBe('Halt');
    expect(getChariotGait(cfg.gait.halt)).toBe('Walk');
    expect(getChariotGait(cfg.gait.walk - 1e-6)).toBe('Walk');
    expect(getChariotGait(cfg.gait.walk)).toBe('Trot');
    expect(getChariotGait(cfg.gait.trot - 1e-6)).toBe('Trot');
    expect(getChariotGait(cfg.gait.trot)).toBe('Gallop');
    expect(getChariotGait(cfg.maxSpeed)).toBe('Gallop');
  });

  test('gait is read by magnitude, so reverse is never a gallop', () => {
    expect(getChariotGait(-cfg.maxReverseSpeed)).toBe(getChariotGait(cfg.maxReverseSpeed));
    expect(getChariotGait(Number.NaN)).toBe('Halt');
  });

  test('the pace bar is the fraction of the forward cap', () => {
    expect(getChariotPace(0)).toBe(0);
    expect(getChariotPace(cfg.maxSpeed / 2)).toBeCloseTo(0.5, 12);
    expect(getChariotPace(cfg.maxSpeed)).toBe(1);
    expect(getChariotPace(cfg.maxSpeed * 3)).toBe(1);
    expect(getChariotPace(-cfg.maxSpeed)).toBe(1);
    expect(getChariotPace(Number.NaN)).toBe(0);
  });

  test('the gait a real drive reaches is the cap’s own word', () => {
    const motion = atStart();
    expect(getChariotGait(motion.speed)).toBe('Halt');
    drive(motion, 1, 0, 200);
    expect(getChariotGait(motion.speed)).toBe('Gallop');
    expect(getChariotPace(motion.speed)).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// L. The frame loop's allocation contract
// ══════════════════════════════════════════════════════════════════════════

describe('L. No allocation in the step', () => {
  test('the step and the frame both mutate and return the same object', () => {
    const motion = atStart();
    expect(stepChariot(motion, input(1), STEP)).toBe(motion);
    expect(advanceChariot(motion, input(1), 0.02)).toBe(motion);
  });

  test('the merge writes into the target it is handed', () => {
    const target = { throttle: 0, steer: 0 };
    expect(mergeChariotInputs(target, { throttle: 1, steer: 0 }, { throttle: 0, steer: 0 })).toBe(target);
  });

  test('ten thousand steps leave the chassis finite', () => {
    const motion = atStart();
    for (let i = 0; i < 10000; i += 1) {
      stepChariot(motion, input(i % 300 < 150 ? 1 : -1, i % 17 === 0 ? 1 : 0), STEP);
    }
    expect(Number.isFinite(motion.x)).toBe(true);
    expect(Number.isFinite(motion.z)).toBe(true);
    expect(Number.isFinite(motion.heading)).toBe(true);
    expect(Number.isFinite(motion.speed)).toBe(true);
    expect(isChariotInsideArena(motion)).toBe(true);
  });
});
