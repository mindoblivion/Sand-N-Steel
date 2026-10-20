/**
 * Phase 37 — Opponent AI aggression & blockChance integration tests.
 *
 * Verifies that chooseAIStandardAction() correctly translates the opponent
 * configuration values into action-selection probabilities, with a
 * backward-compatible fallback when values are missing or invalid.
 *
 * Run with: bun test src/utils/phase37.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import {
  chooseAIStandardAction,
  AIStandardAction,
} from './combatCalculations';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Quick-share constant used in the offensive pool: 46 / 72. */
const QS = 46 / 72; // ≈ 0.6389

/**
 * Run a seeded distribution over N samples and return action counts.
 * Uses a simple linear congruential generator (LCG) for reproducibility
 * — no dependency on Math.random or external seed libraries.
 */
function seededDistribution(
  aggression: number | undefined,
  blockChance: number | undefined,
  n: number,
): Record<AIStandardAction, number> {
  let seed = 123456789;
  const rng = () => {
    // LCG: standard glibc constants, returns [0, 1)
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const counts: Record<AIStandardAction, number> = {
    quick_attack: 0,
    power_attack: 0,
    shield_block: 0,
    dodge: 0,
  };
  for (let i = 0; i < n; i++) {
    counts[chooseAIStandardAction(aggression, blockChance, rng)]++;
  }
  return counts;
}

/** Helper: call with a fixed random value instead of Math.random. */
function at(
  aggression: number | undefined,
  blockChance: number | undefined,
  r: number,
): AIStandardAction {
  return chooseAIStandardAction(aggression, blockChance, r);
}

// ── Deterministic boundary tests ────────────────────────────────────────────

describe('Phase 37 — Deterministic action selection', () => {
  test('quick_attack is selected when r is in the quick-attack zone', () => {
    // aggression=0.50, blockChance=0.50
    // quickCutoff = 0.50 * 46/72 ≈ 0.3194
    expect(at(0.50, 0.50, 0.00)).toBe('quick_attack');
    expect(at(0.50, 0.50, 0.10)).toBe('quick_attack');
    expect(at(0.50, 0.50, 0.319)).toBe('quick_attack');
  });

  test('power_attack is selected when r is between quickCutoff and aggression', () => {
    // aggression=0.50: quickCutoff ≈ 0.3194, powerCutoff = 0.50
    expect(at(0.50, 0.50, 0.32)).toBe('power_attack');
    expect(at(0.50, 0.50, 0.40)).toBe('power_attack');
    expect(at(0.50, 0.50, 0.499)).toBe('power_attack');
  });

  test('shield_block is selected when r is in the defensive block zone', () => {
    // aggression=0.50, blockChance=0.50
    // blockCutoff = 0.50 + (1-0.50) * 0.50 = 0.75
    expect(at(0.50, 0.50, 0.50)).toBe('shield_block');
    expect(at(0.50, 0.50, 0.60)).toBe('shield_block');
    expect(at(0.50, 0.50, 0.749)).toBe('shield_block');
  });

  test('dodge is selected when r is in the defensive dodge zone', () => {
    // aggression=0.50, blockChance=0.50: blockCutoff = 0.75
    expect(at(0.50, 0.50, 0.75)).toBe('dodge');
    expect(at(0.50, 0.50, 0.90)).toBe('dodge');
    expect(at(0.50, 0.50, 0.999)).toBe('dodge');
  });

  test('offensive probability equals aggression', () => {
    // At aggression=0.50, r < 0.50 → offensive (quick or power)
    // r >= 0.50 → defensive (block or dodge)
    expect(at(0.50, 0.50, 0.499)).not.toBe('shield_block');
    expect(at(0.50, 0.50, 0.499)).not.toBe('dodge');
    expect(at(0.50, 0.50, 0.50)).not.toBe('quick_attack');
    expect(at(0.50, 0.50, 0.50)).not.toBe('power_attack');
  });
});

// ── Aggression influence ────────────────────────────────────────────────────

describe('Phase 37 — Aggression changes action selection', () => {
  test('higher aggression shifts a mid-range roll from defensive to offensive', () => {
    // r = 0.70
    // With aggression=0.50, blockChance=0.50: blockCutoff=0.75 → shield_block
    expect(at(0.50, 0.50, 0.70)).toBe('shield_block');
    // With aggression=0.80, blockChance=0.50: powerCutoff=0.80 → power_attack
    expect(at(0.80, 0.50, 0.70)).toBe('power_attack');
  });

  test('lower aggression shifts a mid-range roll from offensive to defensive', () => {
    // r = 0.40
    // With aggression=0.50: powerCutoff=0.50 → power_attack
    expect(at(0.50, 0.50, 0.40)).toBe('power_attack');
    // With aggression=0.30, blockChance=0.50: blockCutoff=0.30+0.70*0.50=0.65 → shield_block
    expect(at(0.30, 0.50, 0.40)).toBe('shield_block');
  });

  test('aggression=1 produces only offensive actions', () => {
    // All rolls < 1 are offensive (quick or power)
    expect(at(1, 0.50, 0.0)).toBe('quick_attack');
    expect(at(1, 0.50, 0.63)).toBe('quick_attack');
    expect(at(1, 0.50, 0.64)).toBe('power_attack');
    expect(at(1, 0.50, 0.99)).toBe('power_attack');
  });

  test('aggression=0 produces only defensive actions', () => {
    // All rolls are defensive (block or dodge)
    expect(at(0, 0.50, 0.0)).toBe('shield_block');
    expect(at(0, 0.50, 0.49)).toBe('shield_block');
    expect(at(0, 0.50, 0.50)).toBe('dodge');
    expect(at(0, 0.50, 0.99)).toBe('dodge');
  });
});

// ── BlockChance influence ───────────────────────────────────────────────────

describe('Phase 37 — BlockChance splits defensive pool', () => {
  test('higher blockChance shifts a defensive-zone roll from dodge to block', () => {
    // aggression=0.50, r=0.80
    // blockChance=0.25: blockCutoff=0.50+0.50*0.25=0.625 → dodge
    expect(at(0.50, 0.25, 0.80)).toBe('dodge');
    // blockChance=0.75: blockCutoff=0.50+0.50*0.75=0.875 → shield_block
    expect(at(0.50, 0.75, 0.80)).toBe('shield_block');
  });

  test('changing blockChance does not change total offensive probability', () => {
    // r = 0.40 is offensive for both configurations (aggression=0.50)
    expect(at(0.50, 0.25, 0.40)).toBe('power_attack');
    expect(at(0.50, 0.75, 0.40)).toBe('power_attack');
  });

  test('blockChance=1 makes all defensive actions blocks', () => {
    // aggression=0.50: defensive zone is [0.50, 1)
    // blockChance=1: blockCutoff = 0.50 + 0.50*1 = 1.0
    expect(at(0.50, 1, 0.50)).toBe('shield_block');
    expect(at(0.50, 1, 0.99)).toBe('shield_block');
  });

  test('blockChance=0 makes all defensive actions dodges', () => {
    // aggression=0.50: defensive zone is [0.50, 1)
    // blockChance=0: blockCutoff = 0.50 + 0.50*0 = 0.50
    expect(at(0.50, 0, 0.50)).toBe('dodge');
    expect(at(0.50, 0, 0.99)).toBe('dodge');
  });
});

// ── Clamping ────────────────────────────────────────────────────────────────

describe('Phase 37 — Out-of-range finite values are clamped', () => {
  test('aggression > 1 is clamped to 1 (all offensive)', () => {
    expect(at(1.5, 0.50, 0.30)).toBe('quick_attack');
    expect(at(1.5, 0.50, 0.90)).toBe('power_attack');
  });

  test('aggression < 0 is clamped to 0 (all defensive)', () => {
    expect(at(-0.5, 0.50, 0.30)).toBe('shield_block');
    expect(at(-0.5, 0.50, 0.80)).toBe('dodge');
  });

  test('blockChance > 1 is clamped to 1 (all blocks in defensive)', () => {
    expect(at(0.50, 1.5, 0.80)).toBe('shield_block');
  });

  test('blockChance < 0 is clamped to 0 (all dodges in defensive)', () => {
    expect(at(0.50, -0.5, 0.80)).toBe('dodge');
  });
});

// ── Fallback for invalid values ─────────────────────────────────────────────

describe('Phase 37 — Backward-compatible fallback', () => {
  test('undefined aggression triggers fallback to original probabilities', () => {
    // Fallback: quick < 0.46, power < 0.72, block < 0.90, dodge >= 0.90
    expect(at(undefined, 0.50, 0.30)).toBe('quick_attack');
    expect(at(undefined, 0.50, 0.50)).toBe('power_attack');
    expect(at(undefined, 0.50, 0.80)).toBe('shield_block');
    expect(at(undefined, 0.50, 0.95)).toBe('dodge');
  });

  test('undefined blockChance triggers fallback', () => {
    expect(at(0.50, undefined, 0.30)).toBe('quick_attack');
    expect(at(0.50, undefined, 0.50)).toBe('power_attack');
    expect(at(0.50, undefined, 0.80)).toBe('shield_block');
    expect(at(0.50, undefined, 0.95)).toBe('dodge');
  });

  test('NaN aggression triggers fallback', () => {
    expect(at(NaN, 0.50, 0.30)).toBe('quick_attack');
    expect(at(NaN, 0.50, 0.95)).toBe('dodge');
  });

  test('NaN blockChance triggers fallback', () => {
    expect(at(0.50, NaN, 0.30)).toBe('quick_attack');
    expect(at(0.50, NaN, 0.95)).toBe('dodge');
  });

  test('Infinity triggers fallback', () => {
    expect(at(Infinity, 0.50, 0.30)).toBe('quick_attack');
    expect(at(0.50, Infinity, 0.30)).toBe('quick_attack');
  });

  test('-Infinity triggers fallback', () => {
    expect(at(-Infinity, 0.50, 0.30)).toBe('quick_attack');
    expect(at(0.50, -Infinity, 0.30)).toBe('quick_attack');
  });

  test('both undefined triggers fallback', () => {
    expect(at(undefined, undefined, 0.10)).toBe('quick_attack');
    expect(at(undefined, undefined, 0.60)).toBe('power_attack');
    expect(at(undefined, undefined, 0.85)).toBe('shield_block');
    expect(at(undefined, undefined, 0.95)).toBe('dodge');
  });

  test('fallback matches original hardcoded thresholds exactly', () => {
    // The fallback boundaries: 0.46, 0.72, 0.90
    // Test just below and just above each boundary
    expect(at(undefined, undefined, 0.459)).toBe('quick_attack');
    expect(at(undefined, undefined, 0.46)).toBe('power_attack');
    expect(at(undefined, undefined, 0.719)).toBe('power_attack');
    expect(at(undefined, undefined, 0.72)).toBe('shield_block');
    expect(at(undefined, undefined, 0.899)).toBe('shield_block');
    expect(at(undefined, undefined, 0.90)).toBe('dodge');
  });
});

// ── Distribution tests (seeded) ─────────────────────────────────────────────

describe('Phase 37 — Seeded distribution samples', () => {
  const N = 50000;

  test('aggression=0.50 produces ~50% offensive, ~50% defensive', () => {
    const counts = seededDistribution(0.50, 0.50, N);
    const offensive = counts.quick_attack + counts.power_attack;
    const defensive = counts.shield_block + counts.dodge;
    // Tolerance: ±2% for 50k samples
    expect(Math.abs(offensive / N - 0.50)).toBeLessThan(0.02);
    expect(Math.abs(defensive / N - 0.50)).toBeLessThan(0.02);
  });

  test('aggression=0.95 produces ~95% offensive', () => {
    const counts = seededDistribution(0.95, 0.50, N);
    const offensive = counts.quick_attack + counts.power_attack;
    expect(Math.abs(offensive / N - 0.95)).toBeLessThan(0.02);
  });

  test('aggression=0.45 produces ~45% offensive', () => {
    const counts = seededDistribution(0.45, 0.65, N);
    const offensive = counts.quick_attack + counts.power_attack;
    expect(Math.abs(offensive / N - 0.45)).toBeLessThan(0.02);
  });

  test('blockChance=0.65 produces ~65% blocks within defensive pool', () => {
    const counts = seededDistribution(0.45, 0.65, N);
    const defensive = counts.shield_block + counts.dodge;
    // P(block | defensive) should be ~0.65
    expect(defensive).toBeGreaterThan(0);
    expect(Math.abs(counts.shield_block / defensive - 0.65)).toBeLessThan(0.03);
  });

  test('offensive split preserves 46:26 ratio', () => {
    const counts = seededDistribution(0.80, 0.50, N);
    const offensive = counts.quick_attack + counts.power_attack;
    expect(offensive).toBeGreaterThan(0);
    // quick:power should be 46:26 ≈ 1.769
    expect(Math.abs(counts.quick_attack / counts.power_attack - 46 / 26)).toBeLessThan(0.15);
  });

  test('different aggression values produce statistically different attack rates', () => {
    const low = seededDistribution(0.45, 0.50, N);
    const high = seededDistribution(0.95, 0.50, N);
    const lowOff = (low.quick_attack + low.power_attack) / N;
    const highOff = (high.quick_attack + high.power_attack) / N;
    // The difference should be at least 0.40 (0.95 - 0.45 = 0.50, minus margin)
    expect(highOff - lowOff).toBeGreaterThan(0.40);
  });

  test('different blockChance values produce statistically different block rates', () => {
    const low = seededDistribution(0.50, 0.25, N);
    const high = seededDistribution(0.50, 0.75, N);
    const lowBlock = low.shield_block / N;
    const highBlock = high.shield_block / N;
    expect(highBlock).toBeGreaterThan(lowBlock);
    // Difference should be substantial: (0.50*0.75) - (0.50*0.25) = 0.25
    expect(highBlock - lowBlock).toBeGreaterThan(0.20);
  });
});

// ── Opponent data sanity ───────────────────────────────────────────────────

describe('Phase 37 — All opponent config values are valid', () => {
  // Import the real opponent roster to confirm every configured value
  // is finite and in [0, 1] — no fallback will fire in production.
  const { ALL_OPPONENTS } = require('../data/opponents');

  test('every opponent has valid aggression in [0, 1]', () => {
    ALL_OPPONENTS.forEach((opp: { id: string; aggression: number }) => {
      expect(Number.isFinite(opp.aggression)).toBe(true);
      expect(opp.aggression).toBeGreaterThanOrEqual(0);
      expect(opp.aggression).toBeLessThanOrEqual(1);
    });
  });

  test('every opponent has valid blockChance in [0, 1]', () => {
    ALL_OPPONENTS.forEach((opp: { id: string; blockChance: number }) => {
      expect(Number.isFinite(opp.blockChance)).toBe(true);
      expect(opp.blockChance).toBeGreaterThanOrEqual(0);
      expect(opp.blockChance).toBeLessThanOrEqual(1);
    });
  });

  test('all 8 opponents produce valid actions with a fixed roll', () => {
    ALL_OPPONENTS.forEach((opp: { id: string; aggression: number; blockChance: number }) => {
      const action = chooseAIStandardAction(opp.aggression, opp.blockChance, 0.42);
      expect(['quick_attack', 'power_attack', 'shield_block', 'dodge']).toContain(action);
    });
  });
});
