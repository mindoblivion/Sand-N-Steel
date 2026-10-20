/**
 * Phase PRE-3 — Out-of-range AI action cleanup tests.
 *
 * Verifies that `chooseAIOutOfRangeAction()` — the pure helper extracted from
 * the dead nested conditional in DuelScene — correctly implements the
 * intended out-of-range decision rule: advance (82 %) or taunt (18 %), never
 * an attack action.
 *
 * Run with: bun test src/utils/phasePre3.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { chooseAIOutOfRangeAction } from './combatCalculations';

// ── 1. Deterministic boundary at 0.82 ───────────────────────────────────

describe('Phase PRE-3 — Out-of-range action boundaries', () => {
  test('values below 0.82 select advance', () => {
    expect(chooseAIOutOfRangeAction(0.00)).toBe('advance');
    expect(chooseAIOutOfRangeAction(0.25)).toBe('advance');
    expect(chooseAIOutOfRangeAction(0.50)).toBe('advance');
    expect(chooseAIOutOfRangeAction(0.81)).toBe('advance');
    expect(chooseAIOutOfRangeAction(0.819)).toBe('advance');
  });

  test('values at or above 0.82 select taunt', () => {
    expect(chooseAIOutOfRangeAction(0.82)).toBe('taunt');
    expect(chooseAIOutOfRangeAction(0.90)).toBe('taunt');
    expect(chooseAIOutOfRangeAction(0.99)).toBe('taunt');
    expect(chooseAIOutOfRangeAction(0.999)).toBe('taunt');
  });
});

// ── 2. Never returns an attack action ───────────────────────────────────

describe('Phase PRE-3 — Never selects an attack', () => {
  test('the result is always advance or taunt, never quick_attack or power_attack', () => {
    // Sweep the entire [0, 1) range in fine steps
    for (let r = 0; r < 1; r += 0.01) {
      const result = chooseAIOutOfRangeAction(r);
      expect(result === 'advance' || result === 'taunt').toBe(true);
      expect(result).not.toBe('quick_attack');
      expect(result).not.toBe('power_attack');
    }
  });
});

// ── 3. Callback form works and defaults to Math.random ──────────────────

describe('Phase PRE-3 — Callback and default', () => {
  test('accepts a () => number callback', () => {
    let calls = 0;
    const cb = () => { calls++; return 0.50; };
    expect(chooseAIOutOfRangeAction(cb)).toBe('advance');
    expect(calls).toBe(1);
  });

  test('default (no argument) returns a valid action without throwing', () => {
    const result = chooseAIOutOfRangeAction();
    expect(result === 'advance' || result === 'taunt').toBe(true);
  });
});
