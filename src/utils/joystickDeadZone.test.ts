/**
 * joystickDeadZone.test.ts — the city virtual joystick's radial dead zone.
 *
 * Run with: bun test src/utils/joystickDeadZone.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A the constant — the city hub reads the dead zone from `JOYSTICK_DEAD_ZONE`
 *      (0.15 of full deflection) and holds no number of its own;
 *   §B `applyDeadZone` — a resting thumb reads as NO input, the range above the dead
 *      zone is RESCALED rather than clamped (so there is no jump at the boundary and
 *      full deflection stays full), direction is preserved exactly, output grows
 *      monotonically with input, and junk magnitudes are answered with no input
 *      rather than a NaN vector;
 *   §C the wiring — the city scene reads the touch vector through `applyDeadZone` and
 *      only there: keyboard movement and the knob's own visual position are untouched.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { JOYSTICK_DEAD_ZONE, applyDeadZone } from './joystickDeadZone';

const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

/** A source with its comments stripped, so prose can neither satisfy nor defeat a check. */
const code = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

const magnitude = (v: { x: number; z: number }): number => Math.hypot(v.x, v.z);

describe('§A the constant', () => {
  test('the dead zone is 15% of full deflection', () => {
    expect(JOYSTICK_DEAD_ZONE).toBe(0.15);
    expect(JOYSTICK_DEAD_ZONE).toBeGreaterThan(0);
    expect(JOYSTICK_DEAD_ZONE).toBeLessThan(1);
  });
});

describe('§B applyDeadZone', () => {
  test('a stick at rest is no input at all — even off-centre', () => {
    expect(applyDeadZone(0, 0)).toEqual({ x: 0, z: 0 });
    // A resting thumb rarely sits exactly on centre; both axes small and one large
    // still read as nothing.
    expect(applyDeadZone(0.05, 0.05)).toEqual({ x: 0, z: 0 });
    expect(applyDeadZone(0.14, 0)).toEqual({ x: 0, z: 0 });
    expect(applyDeadZone(-0.1, -0.1)).toEqual({ x: 0, z: 0 });
  });

  test('exactly at the dead zone is still nothing (the boundary is inclusive)', () => {
    expect(applyDeadZone(JOYSTICK_DEAD_ZONE, 0)).toEqual({ x: 0, z: 0 });
    expect(applyDeadZone(0, JOYSTICK_DEAD_ZONE)).toEqual({ x: 0, z: 0 });
    const onCircle = JOYSTICK_DEAD_ZONE / Math.SQRT2;
    expect(applyDeadZone(onCircle, onCircle)).toEqual({ x: 0, z: 0 });
  });

  test('there is no jump at the boundary: just past it is a whisper, not a stride', () => {
    expect(magnitude(applyDeadZone(JOYSTICK_DEAD_ZONE + 1e-9, 0))).toBeLessThan(1e-6);
    const small = applyDeadZone(JOYSTICK_DEAD_ZONE + 0.05, 0);
    expect(magnitude(small)).toBeGreaterThan(0);
    expect(magnitude(small)).toBeLessThanOrEqual(0.06);
  });

  test('the range above the dead zone is rescaled onto [0, 1], not clamped', () => {
    // (m - dead) / (1 - dead) is exactly the output magnitude for m in (dead, 1].
    for (const m of [0.2, 0.35, 0.5, 0.75, 0.9, 1]) {
      const out = applyDeadZone(m, 0);
      expect(magnitude(out), `m=${m}`).toBeCloseTo((m - JOYSTICK_DEAD_ZONE) / (1 - JOYSTICK_DEAD_ZONE), 10);
    }
  });

  test('full deflection stays full — no speed is lost to the dead zone', () => {
    expect(magnitude(applyDeadZone(1, 0))).toBeCloseTo(1, 10);
    expect(magnitude(applyDeadZone(Math.SQRT1_2, Math.SQRT1_2))).toBeCloseTo(1, 10);
    expect(magnitude(applyDeadZone(0, -1))).toBeCloseTo(1, 10);
  });

  test('direction is preserved EXACTLY — only the length changes', () => {
    const cases: Array<[number, number]> = [
      [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.4], [-0.3, 0.9], [-0.6, -0.6], [0.15, 0.99],
    ];
    for (const [x, z] of cases) {
      const out = applyDeadZone(x, z);
      // Same angle: the cross product of input and output is zero.
      expect(Math.abs(x * out.z - z * out.x), `cross for (${x}, ${z})`).toBeLessThan(1e-12);
      // Same side: the dot product is positive.
      expect(x * out.x + z * out.z).toBeGreaterThan(0);
      // The ratio of the two axes is untouched.
      if (z !== 0 && x !== 0) expect(out.x / out.z).toBeCloseTo(x / z, 10);
    }
  });

  test('output grows monotonically with input deflection', () => {
    let previous = -1;
    for (const m of [0.16, 0.3, 0.45, 0.6, 0.8, 1]) {
      const mag = magnitude(applyDeadZone(0.6 * m, 0.8 * m));
      expect(mag).toBeGreaterThan(previous);
      previous = mag;
    }
  });

  test('a broken magnitude is answered with no input, never a NaN vector', () => {
    const cases: Array<[number, number]> = [
      [Number.NaN, 0], [0, Number.NaN], [Number.POSITIVE_INFINITY, 0], [0, Number.NEGATIVE_INFINITY], [Number.NaN, Number.NaN],
    ];
    for (const [x, z] of cases) {
      expect(applyDeadZone(x, z), `(${x}, ${z})`).toEqual({ x: 0, z: 0 });
    }
  });

  test('the dead zone is a parameter, so a caller can tune it without touching the constant', () => {
    expect(applyDeadZone(0.4, 0, 0.5)).toEqual({ x: 0, z: 0 });
    expect(magnitude(applyDeadZone(0.9, 0, 0.5))).toBeCloseTo(0.8, 10);
    expect(magnitude(applyDeadZone(1, 0, 0))).toBeCloseTo(1, 10); // a zero dead zone is the identity
  });
});

describe('§C the wiring — the city hub and nothing else', () => {
  const hub = load('../components/3d/city/CityHubScene.tsx');
  const hubCode = code(hub);

  test('the scene reads the touch vector through the dead zone', () => {
    expect(hubCode).toContain("import { applyDeadZone } from '../../../utils/joystickDeadZone';");
    expect(hubCode).toContain('applyDeadZone(dx / maxDist, dy / maxDist)');
    // The dead-zoned vector is what is stored — not the raw pixel delta.
    expect(hubCode).toContain('touchVectorRef.current = { x: vec.x, z: vec.z };');
    // Exactly one application: the import plus the one call site.
    expect((hubCode.match(/applyDeadZone/g) ?? []).length).toBe(2);
  });

  test('the touch vector is still cleared to no input when the thumb lifts', () => {
    expect(hubCode).toContain('touchVectorRef.current = { x: 0, z: 0 };');
  });

  test('keyboard movement is untouched by the dead zone', () => {
    expect(hubCode).toContain("if (keysPressed.current['w']) inputZ -= 1;");
    expect(hubCode).toContain("if (keysPressed.current['d']) inputX += 1;");
    // The keyboard's own +/-1 units never pass through the dead zone.
    const keyBlock = hubCode.slice(
      hubCode.indexOf("if (keysPressed.current['w'])"),
      hubCode.indexOf('if (touchVectorRef.current.x !== 0'),
    );
    expect(keyBlock.length).toBeGreaterThan(0);
    expect(keyBlock).not.toContain('applyDeadZone');
  });

  test('the knob still follows the thumb — the dead zone is on the input, not the visual', () => {
    // The knob position is set from the clamped pixel delta, BEFORE the dead zone.
    const knobIndex = hubCode.indexOf('setKnobPos({ x: dx, y: dy });');
    const deadZoneIndex = hubCode.indexOf('applyDeadZone(dx / maxDist, dy / maxDist)');
    expect(knobIndex).toBeGreaterThan(-1);
    expect(deadZoneIndex).toBeGreaterThan(knobIndex);
  });
});
