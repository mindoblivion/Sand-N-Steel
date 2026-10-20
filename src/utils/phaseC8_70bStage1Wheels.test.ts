/**
 * Phase C-8.70B Stage 1, Slice 3 — the fitted wheels roll.
 *
 * Run with: bun test src/utils/phaseC8_70bStage1Wheels.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A the RULE: a pure `distance / radius` reading, forward turning the wheels
 *      backwards about +X (the model's forward is −Z), reverse turning them the
 *      other way, and the frame delta clamped exactly as `advanceChariot` clamps
 *      its own;
 *   §B the WIRING: each wheel node is re-parented onto a pivot at its own
 *      measured hub and spun about X, from the motion module's own speed, only
 *      while the chariot is being driven — and the cached GLB is never mutated;
 *   §C the SCOPE guard: no movement constant, collider, save path or arena file
 *      moved for this slice.
 *
 * Nothing here restates a number the shipped modules export: the radius, the
 * frame clamp, the speed cap and the node names are all imported or parsed.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  CHARIOT_MOVEMENT,
  CHARIOT_WHEEL_RADIUS,
  advanceWheelRoll,
} from './chariotMovement';
import { RACE_WHEEL_NODE_NAMES } from '../components/3d/RaceScene';

const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

const sceneSrc = load('../components/3d/RaceScene.tsx');
const movementSrc = load('./chariotMovement.ts');

/** A source with its comments stripped, so prose cannot satisfy (or defeat) a check. */
const code = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

const sceneCode = code(sceneSrc);
const movementCode = code(movementSrc);

// ══════════════════════════════════════════════════════════════════════════
// A. The rule
// ══════════════════════════════════════════════════════════════════════════

describe('A. The wheels turn with the ground, not with the clock', () => {
  test('the radius is the fitted wheel’s own: hub 0.650 less tyre bottom −0.035', () => {
    expect(CHARIOT_WHEEL_RADIUS).toBeCloseTo(0.685, 9);
  });

  test('forward motion turns the wheels backwards about +X', () => {
    // The model's forward is −Z, and +X carries the crown toward +Z: rolling
    // forward is therefore a NEGATIVE change.
    expect(advanceWheelRoll(0, 5, 1 / 60)).toBeLessThan(0);
    expect(advanceWheelRoll(0, -5, 1 / 60)).toBeGreaterThan(0);
    expect(advanceWheelRoll(0, 0, 1 / 60)).toBe(0);
  });

  test('the turn is exactly the distance travelled over the radius', () => {
    const dt = 1 / 60;
    const speed = 7.3;
    const delta = advanceWheelRoll(0, speed, dt) - 0;
    expect(Math.abs(delta) * CHARIOT_WHEEL_RADIUS).toBeCloseTo(speed * dt, 12);
    // One circumference of travel is one full turn, to the digit — driven one
    // frame at a time, because a single second-long frame is clamped to 0.1 s.
    const circumference = 2 * Math.PI * CHARIOT_WHEEL_RADIUS;
    let oneTurn = 0;
    for (let i = 0; i < 60; i += 1) oneTurn = advanceWheelRoll(oneTurn, circumference, 1 / 60);
    expect(oneTurn).toBeCloseTo(-2 * Math.PI, 9);
  });

  test('reverse rolls the other way, and the angle stays a continuous reading', () => {
    let roll = 0;
    for (let i = 0; i < 60; i += 1) roll = advanceWheelRoll(roll, -3.2, 1 / 60);
    expect(roll).toBeGreaterThan(0);
    const forward = advanceWheelRoll(roll, 3.2, 1 / 60);
    expect(forward).toBeLessThan(roll);
  });

  test('the frame delta is clamped exactly as the motion module clamps its own', () => {
    const absurd = advanceWheelRoll(0, 13, 30);
    const clamped = advanceWheelRoll(0, 13, CHARIOT_MOVEMENT.maxFrameDt);
    expect(absurd).toBe(clamped);
  });

  test('an unmeasurable frame or speed is not a turn', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(advanceWheelRoll(0, bad, 1 / 60)).toBe(0);
      expect(advanceWheelRoll(0, 5, bad)).toBe(0);
    }
    // A poisoned angle is read as zero and the frame's own turn is then applied —
    // the reading stays a finite number rather than becoming NaN for ever.
    const recovered = advanceWheelRoll(NaN, 5, 1 / 60);
    expect(Number.isFinite(recovered)).toBe(true);
    expect(recovered).toBeCloseTo(advanceWheelRoll(0, 5, 1 / 60), 12);
    expect(advanceWheelRoll(0, 5, -1)).toBe(0);
  });

  test('the rule is self-contained: no renderer, no clock, no storage', () => {
    const body = movementCode.slice(movementCode.indexOf('export function advanceWheelRoll'));
    const fn = body.slice(0, body.indexOf('\n}\n') + 3);
    for (const banned of ['Date', 'performance', 'localStorage', 'THREE', 'window']) {
      expect(fn, banned).not.toContain(banned);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The wiring
// ══════════════════════════════════════════════════════════════════════════

describe('B. The scene spins both fitted wheels about their own hubs', () => {
  test('the wheel nodes are the model’s own, and there are exactly two', () => {
    expect([...RACE_WHEEL_NODE_NAMES]).toEqual(['Wheel_L', 'Wheel_R']);
    expect(sceneCode).toContain('getObjectByName(name)');
  });

  test('each wheel is re-parented onto a pivot AT its measured hub', () => {
    expect(sceneCode).toContain('new THREE.Box3().setFromObject(node)');
    expect(sceneCode).toContain('bounds.getCenter(pivot.position)');
    expect(sceneCode).toContain('pivot.attach(node)');
    // The scene must not type a hub coordinate in: the centre is measured.
    expect(sceneCode).not.toMatch(/pivot\.position\.set\(\s*-?0\.7/);
  });

  test('the spin is the module’s, from the module’s own speed', () => {
    expect(sceneCode).toContain('advanceWheelRoll(roll.current, racing ? motion.speed : 0, delta)');
    expect(sceneCode).toContain('wheel.rotation.x = roll.current');
  });

  test('the wheels turn only while the chariot is actually driven', () => {
    // `racing` is the scene's own gate: it is false outside `racing` AND while the
    // settings panel is open, so an idling or paused chariot cannot spin.
    expect(sceneCode).toContain("const racing = raceState === 'racing' && !frozen;");
    expect(sceneCode).toContain('racing ? motion.speed : 0');
  });

  test('the cached GLB is cloned before it is touched', () => {
    expect(sceneCode).toContain('const scene = gltf.scene.clone(true);');
    expect(sceneCode).not.toContain('gltf.scene.getObjectByName');
    expect(sceneCode).toContain('object={body.scene}');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. Scope
// ══════════════════════════════════════════════════════════════════════════

describe('C. Nothing else moved for this slice', () => {
  test('the movement constants are the ones Slice 2 shipped', () => {
    expect(CHARIOT_MOVEMENT.maxSpeed).toBe(13);
    expect(CHARIOT_MOVEMENT.maxReverseSpeed).toBe(3.2);
    expect(CHARIOT_MOVEMENT.fixedDt).toBeCloseTo(1 / 60, 12);
    expect(CHARIOT_MOVEMENT.maxFrameDt).toBe(0.1);
  });

  test('the wheel rule adds no save path and no new collision data', () => {
    // The module already reads the arena's authored outline; this slice only adds
    // an angle, so nothing new is imported and no collider is registered.
    for (const banned of ['saveProfile', 'localStorage', 'sessionStorage', 'RECT(', 'CIRCLE(']) {
      expect(movementCode, banned).not.toContain(banned);
    }
    expect(movementCode).toContain("from './collisionShapes'");
    expect(sceneCode).not.toContain('saveProfile');
  });
});
