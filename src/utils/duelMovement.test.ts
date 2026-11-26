/**
 * ===========================================================================
 * PHASE1-SMOOTH — Fighter translation smoothing. The slice's pins for the
 * pure step helper: convergence inside the 800 ms utility beat at 60 fps and
 * at 30 fps, no overshoot, exact arrival, zero-distance rest, the frame
 * clamp, and the fighter-id snap rule.
 *
 * Run with: bun test src/utils/duelMovement.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';

import {
  DUEL_FIGHTER_FRAME_CLAMP,
  DUEL_FIGHTER_MOVE_SPEED,
  fighterStepForDelta,
  stepFighterRender,
  stepFighterToward,
  type DuelVec3,
  type FighterRenderState,
} from './duelMovement';

function distance(a: DuelVec3, b: DuelVec3): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

/** True when `point` lies on the segment from `start` to `end` (within fp noise). */
function onSegment(point: DuelVec3, start: DuelVec3, end: DuelVec3): boolean {
  const total = distance(start, end);
  if (total === 0) return distance(point, start) <= 1e-9;
  const d1 = distance(point, start);
  const d2 = distance(point, end);
  return Math.abs(d1 + d2 - total) <= 1e-9;
}

// ── §1 — the constants ───────────────────────────────────────────────────────

describe('PHASE1-SMOOTH §1 — constants', () => {
  test('the speed is the Brothers’ rate, 6 u/s', () => {
    expect(DUEL_FIGHTER_MOVE_SPEED).toBe(6);
  });

  test('the frame clamp is 0.1 s', () => {
    expect(DUEL_FIGHTER_FRAME_CLAMP).toBe(0.1);
  });

  test('fighterStepForDelta: a normal 60 fps frame steps 0.1 m', () => {
    expect(fighterStepForDelta(1 / 60)).toBeCloseTo(0.1, 10);
  });

  test('fighterStepForDelta: a normal 30 fps frame steps 0.2 m', () => {
    expect(fighterStepForDelta(1 / 30)).toBeCloseTo(0.2, 10);
  });

  test('fighterStepForDelta: a 1 s delta (backgrounded tab) steps at most 0.6 m', () => {
    expect(fighterStepForDelta(1)).toBeCloseTo(0.6, 10);
  });
});

// ── §2 — convergence inside the 800 ms utility beat ─────────────────────────

describe('PHASE1-SMOOTH §2 — convergence', () => {
  test('a 1.8 m advance converges to within 0.05 m inside 0.8 s at 60 fps', () => {
    const current: DuelVec3 = [0, 0, 3.5];
    const target: DuelVec3 = [0, 0, 1.7];
    let moving = true;
    let arrivalFrame: number | null = null;
    for (let i = 0; i < 48; i += 1) {
      moving = stepFighterToward(current, target, fighterStepForDelta(1 / 60));
      if (arrivalFrame === null && distance(current, target) === 0) arrivalFrame = i + 1;
      if (!moving) break;
    }
    // 1.8 m at 6 u/s arrives in 0.30 s — 18 frames at 60 fps. (The arrival
    // frame still reports moving, per the Brothers’ contract; the next frame
    // reports at rest.)
    expect(arrivalFrame).toBeLessThanOrEqual(18);
    expect(distance(current, target)).toBeLessThanOrEqual(0.05);
    expect(distance(current, target)).toBe(0);
    expect(moving).toBe(false);
  });

  test('a 1.8 m advance converges in the same 0.30 s of wall time at 30 fps', () => {
    const current: DuelVec3 = [0, 0, 3.5];
    const target: DuelVec3 = [0, 0, 1.7];
    let moving = true;
    let arrivalFrame: number | null = null;
    for (let i = 0; i < 24; i += 1) {
      moving = stepFighterToward(current, target, fighterStepForDelta(1 / 30));
      if (arrivalFrame === null && distance(current, target) === 0) arrivalFrame = i + 1;
      if (!moving) break;
    }
    // 9 frames at 30 fps is the same 0.30 s of wall time — constant speed,
    // not frame-counted.
    expect(arrivalFrame).toBeLessThanOrEqual(9);
    expect(distance(current, target)).toBe(0);
    expect(moving).toBe(false);
  });

  test('a 1.2 m knockback converges inside the 880 ms quick-attack window', () => {
    const current: DuelVec3 = [0, 0, -3.5];
    const target: DuelVec3 = [0, 0, -2.3];
    let moving = true;
    let arrivalFrame: number | null = null;
    for (let i = 0; i < 53; i += 1) {
      moving = stepFighterToward(current, target, fighterStepForDelta(1 / 60));
      if (arrivalFrame === null && distance(current, target) === 0) arrivalFrame = i + 1;
      if (!moving) break;
    }
    // 1.2 m at 6 u/s arrives in 0.20 s — 12 frames at 60 fps.
    expect(arrivalFrame).toBeLessThanOrEqual(12);
    expect(distance(current, target)).toBe(0);
    expect(moving).toBe(false);
  });
});

// ── §3 — no overshoot, ever ──────────────────────────────────────────────────

describe('PHASE1-SMOOTH §3 — no overshoot', () => {
  test('distance never increases and the point stays on the segment', () => {
    const start: DuelVec3 = [0, 0, 3.5];
    const target: DuelVec3 = [0.6, 0, 1.7];
    const current: DuelVec3 = [...start];
    let prev = distance(current, target);
    for (let i = 0; i < 60; i += 1) {
      const moving = stepFighterToward(current, target, fighterStepForDelta(1 / 60));
      const next = distance(current, target);
      expect(next).toBeLessThanOrEqual(prev + 1e-9);
      expect(onSegment(current, start, target)).toBe(true);
      prev = next;
      if (!moving) break;
    }
    expect(distance(current, target)).toBe(0);
  });
});

// ── §4 — exact arrival ───────────────────────────────────────────────────────

describe('PHASE1-SMOOTH §4 — exact arrival', () => {
  test('when the remaining distance is at most the step, the result is exactly the target', () => {
    const current: DuelVec3 = [0, 0, 1.75];
    const target: DuelVec3 = [0, 0, 1.7];
    // 0.05 m remaining, 0.1 m step: snaps exactly, and still reports moving
    // on the arrival frame (the Brothers’ contract).
    expect(stepFighterToward(current, target, 0.1)).toBe(true);
    expect(current).toEqual(target);
    // The next frame reports at rest.
    expect(stepFighterToward(current, target, 0.1)).toBe(false);
    expect(current).toEqual(target);
  });

  test('a zero-distance move returns not-moving on the first call', () => {
    const current: DuelVec3 = [0, 0, 1.7];
    const target: DuelVec3 = [0, 0, 1.7];
    expect(stepFighterToward(current, target, 0.1)).toBe(false);
    expect(current).toEqual(target);
  });

  test('a non-finite or non-positive step never moves the point but reports moving', () => {
    const current: DuelVec3 = [0, 0, 3.5];
    const target: DuelVec3 = [0, 0, 1.7];
    expect(stepFighterToward(current, target, 0)).toBe(true);
    expect(stepFighterToward(current, target, Number.NaN)).toBe(true);
    expect(current).toEqual([0, 0, 3.5]);
  });
});

// ── §5 — the fighter-id snap rule ────────────────────────────────────────────

describe('PHASE1-SMOOTH §5 — fighter-id snap rule', () => {
  test('a first-seen fighter id snaps the rendered position to the target', () => {
    const state: FighterRenderState = { rendered: [0, 0, 3.5], lastId: null };
    const moving = stepFighterRender(state, [0, 0, -3.5], 'player', 0.1);
    expect(moving).toBe(false);
    expect(state.rendered).toEqual([0, 0, -3.5]);
    expect(state.lastId).toBe('player');
  });

  test('the same id steps toward a new target instead of snapping', () => {
    const state: FighterRenderState = { rendered: [0, 0, 3.5], lastId: 'player' };
    const moving = stepFighterRender(state, [0, 0, 1.7], 'player', 0.1);
    expect(moving).toBe(true);
    expect(state.rendered[2]).toBeCloseTo(3.4, 10);
    expect(state.lastId).toBe('player');
  });

  test('an id change snaps immediately, even mid-traverse', () => {
    const state: FighterRenderState = { rendered: [0, 0, 3.4], lastId: 'player' };
    const moving = stepFighterRender(state, [0, 0, -3.5], 'marcellin', 0.1);
    expect(moving).toBe(false);
    expect(state.rendered).toEqual([0, 0, -3.5]);
    expect(state.lastId).toBe('marcellin');
  });

  test('stepFighterRender reports not-moving once the fighter is at rest', () => {
    const state: FighterRenderState = { rendered: [0, 0, 1.7], lastId: 'player' };
    expect(stepFighterRender(state, [0, 0, 1.7], 'player', 0.1)).toBe(false);
  });
});
