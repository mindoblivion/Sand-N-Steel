/**
 * Phase 38 — Aurelius rage_mode_colossus boss mechanic tests.
 *
 * Verifies:
 *   - shouldActivateRage() activation logic (threshold, one-time, gating)
 *   - calculateAttackDamage() rage multiplier (1.25×) and preservation of
 *     existing crit / defense / block / rounding semantics
 *   - Phase 37B chooseAIStandardAction remains unchanged
 *
 * Run with: bun test src/utils/phase38.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import {
  shouldActivateRage,
  calculateAttackDamage,
  RAGE_DAMAGE_MULTIPLIER,
  chooseAIStandardAction,
  CRIT_MULTIPLIER,
  STRENGTH_BONUS_PER_POINT,
  DEFENSE_MITIGATION_FACTOR,
} from './combatCalculations';

// ── 1. Activation threshold ──────────────────────────────────────────────

describe('Phase 38 — shouldActivateRage threshold', () => {
  test('does not activate above 50% health', () => {
    // Aurelius: healthMax=480, 50%=240. Above 240 → no rage.
    expect(shouldActivateRage('rage_mode_colossus', 480, 480, false)).toBe(false);
    expect(shouldActivateRage('rage_mode_colossus', 300, 480, false)).toBe(false);
    expect(shouldActivateRage('rage_mode_colossus', 241, 480, false)).toBe(false);
  });

  test('activates exactly at 50% health', () => {
    expect(shouldActivateRage('rage_mode_colossus', 240, 480, false)).toBe(true);
  });

  test('activates below 50% health', () => {
    expect(shouldActivateRage('rage_mode_colossus', 200, 480, false)).toBe(true);
    expect(shouldActivateRage('rage_mode_colossus', 1, 480, false)).toBe(true);
  });

  test('does not activate at 0 health (dead)', () => {
    expect(shouldActivateRage('rage_mode_colossus', 0, 480, false)).toBe(false);
  });

  test('does not activate with NaN or infinite health', () => {
    expect(shouldActivateRage('rage_mode_colossus', NaN, 480, false)).toBe(false);
    expect(shouldActivateRage('rage_mode_colossus', Infinity, 480, false)).toBe(false);
    expect(shouldActivateRage('rage_mode_colossus', 200, NaN, false)).toBe(false);
    expect(shouldActivateRage('rage_mode_colossus', 200, Infinity, false)).toBe(false);
  });
});

// ── 2. One-time activation ─────────────────────────────────────────────────

describe('Phase 38 — shouldActivateRage one-time guard', () => {
  test('does not re-activate when alreadyActivated is true', () => {
    expect(shouldActivateRage('rage_mode_colossus', 240, 480, true)).toBe(false);
    expect(shouldActivateRage('rage_mode_colossus', 100, 480, true)).toBe(false);
    expect(shouldActivateRage('rage_mode_colossus', 1, 480, true)).toBe(false);
  });

  test('activates when alreadyActivated is false and health is at threshold', () => {
    expect(shouldActivateRage('rage_mode_colossus', 240, 480, false)).toBe(true);
  });
});

// ── 3. Non-rage_mode_colossus opponents ───────────────────────────────────

describe('Phase 38 — shouldActivateRage mechanic gating', () => {
  test('returns false for heavy_telegraph', () => {
    expect(shouldActivateRage('heavy_telegraph', 100, 480, false)).toBe(false);
  });

  test('returns false for counter_dodge', () => {
    expect(shouldActivateRage('counter_dodge', 100, 480, false)).toBe(false);
  });

  test('returns false for phase_weapon_switch', () => {
    expect(shouldActivateRage('phase_weapon_switch', 100, 480, false)).toBe(false);
  });

  test('returns false for undefined bossMechanic', () => {
    expect(shouldActivateRage(undefined, 100, 480, false)).toBe(false);
  });
});

// ── 4. Rage damage multiplier ─────────────────────────────────────────────

describe('Phase 38 — Rage damage multiplier', () => {
  // Use round-number inputs (baseDamage=100, strength=0, defense=0) so that
  // Math.round does not distort the multiplier ratio.
  const baseDmg = 100;
  const strength = 0;
  const defense = 0;

  test('RAGE_DAMAGE_MULTIPLIER is exactly 1.25', () => {
    expect(RAGE_DAMAGE_MULTIPLIER).toBe(1.25);
  });

  test('raged attack deals exactly 1.25× the non-raged damage (no crit, no block)', () => {
    const normal = calculateAttackDamage(baseDmg, strength, false, defense, false, 0);
    const raged = calculateAttackDamage(baseDmg, strength, false, defense, false, 0, RAGE_DAMAGE_MULTIPLIER);
    expect(normal).toBe(100);
    expect(raged).toBe(125);
    expect(raged / normal).toBe(1.25);
  });

  test('raged crit attack multiplies by 1.25 on top of crit', () => {
    const normalCrit = calculateAttackDamage(baseDmg, strength, true, defense, false, 0);
    const ragedCrit = calculateAttackDamage(baseDmg, strength, true, defense, false, 0, RAGE_DAMAGE_MULTIPLIER);
    expect(normalCrit).toBe(150);
    expect(ragedCrit).toBe(188);
    // 150 * 1.25 = 187.5 → rounds to 188
  });

  test('raged blocked attack applies 1.25× then block reduction', () => {
    const blockReduction = 0.6;
    const normalBlocked = calculateAttackDamage(baseDmg, strength, false, defense, true, blockReduction);
    const ragedBlocked = calculateAttackDamage(baseDmg, strength, false, defense, true, blockReduction, RAGE_DAMAGE_MULTIPLIER);
    // Normal: 100 * 0.4 = 40. Raged: 125 * 0.4 = 50.
    expect(normalBlocked).toBe(40);
    expect(ragedBlocked).toBe(50);
  });

  test('default rageMultiplier (omitted) is 1.0 — no rage bonus', () => {
    const noRageArg = calculateAttackDamage(baseDmg, strength, false, defense, false, 0);
    const explicit1 = calculateAttackDamage(baseDmg, strength, false, defense, false, 0, 1.0);
    expect(noRageArg).toBe(explicit1);
  });

  test('rage multiplier applies exactly once (not doubled)', () => {
    // If the multiplier were applied twice, raged would be 156 (100 * 1.5625).
    const normal = calculateAttackDamage(baseDmg, strength, false, defense, false, 0);
    const raged = calculateAttackDamage(baseDmg, strength, false, defense, false, 0, RAGE_DAMAGE_MULTIPLIER);
    expect(raged).not.toBe(156);
    expect(raged).toBe(125);
  });
});

// ── 5. Non-raged opponents and player attacks ──────────────────────────────

describe('Phase 38 — No rage bonus for non-raged or player attacks', () => {
  test('rageMultiplier=1.0 produces identical damage to no rage', () => {
    const dmg1 = calculateAttackDamage(20, 15, false, 10, false, 0);
    const dmg2 = calculateAttackDamage(20, 15, false, 10, false, 0, 1.0);
    expect(dmg1).toBe(dmg2);
  });

  test('player attack (isActorPlayer=true → rageMult=1.0) has no rage bonus', () => {
    // In DuelScene, player attacks always pass rageMult=1.0 because the
    // condition is (!isActorPlayer && attacker.isRaged).
    const playerDamage = calculateAttackDamage(20, 15, false, 10, false, 0, 1.0);
    const expected = calculateAttackDamage(20, 15, false, 10, false, 0);
    expect(playerDamage).toBe(expected);
  });
});

// ── 6. Existing crit/defense/block/rounding semantics preserved ───────────

describe('Phase 38 — Existing damage semantics preserved', () => {
  test('non-crit non-raged damage matches original formula', () => {
    // baseDamage=20, strength=10, defense=5, no block, no rage
    const strBonus = 1 + 10 * STRENGTH_BONUS_PER_POINT;
    const raw = 20 * strBonus;
    const mitigated = raw * (100 / (100 + 5 * DEFENSE_MITIGATION_FACTOR));
    const expected = Math.max(1, Math.round(mitigated));
    expect(calculateAttackDamage(20, 10, false, 5, false, 0)).toBe(expected);
  });

  test('crit multiplier is 1.5 and preserved', () => {
    // baseDamage=100, strength=0, defense=0 → clean integers
    const nonCrit = calculateAttackDamage(100, 0, false, 0, false, 0);
    const crit = calculateAttackDamage(100, 0, true, 0, false, 0);
    expect(nonCrit).toBe(100);
    expect(crit).toBe(150);
    expect(crit / nonCrit).toBe(1.5);
  });

  test('defense mitigation diminishing returns preserved', () => {
    const lowDef = calculateAttackDamage(20, 10, false, 5, false, 0);
    const highDef = calculateAttackDamage(20, 10, false, 50, false, 0);
    expect(highDef).toBeLessThan(lowDef);
  });

  test('block reduction applies after rage multiplier', () => {
    // baseDamage=100, strength=0, defense=0 → clean integers
    const blockReduction = 0.6;
    const unblocked = calculateAttackDamage(100, 0, false, 0, false, 0, RAGE_DAMAGE_MULTIPLIER);
    const blocked = calculateAttackDamage(100, 0, false, 0, true, blockReduction, RAGE_DAMAGE_MULTIPLIER);
    // Unblocked: 125. Blocked: 125 * 0.4 = 50.
    expect(unblocked).toBe(125);
    expect(blocked).toBe(50);
    expect(blocked / unblocked).toBe(0.4);
  });

  test('minimum damage is 1 even with high defense + block + rage', () => {
    const dmg = calculateAttackDamage(1, 1, false, 1000, true, 0.99, RAGE_DAMAGE_MULTIPLIER);
    expect(dmg).toBe(1);
  });

  test('rage + crit stack multiplicatively in correct order', () => {
    // Order: strBonus × critMult × rageMult, then defense, then block
    // baseDamage=30, strength=20, defense=10 → clean integers
    const baseDmg = 30;
    const strength = 20;
    const defense = 10;
    const strBonus = 1 + 20 * STRENGTH_BONUS_PER_POINT; // 2.0
    const raw = baseDmg * strBonus * CRIT_MULTIPLIER * RAGE_DAMAGE_MULTIPLIER; // 30 * 2 * 1.5 * 1.25 = 112.5
    const mitigated = raw * (100 / (100 + 10 * DEFENSE_MITIGATION_FACTOR)); // 112.5 * 0.8 = 90
    const expected = Math.max(1, Math.round(mitigated)); // 90
    expect(calculateAttackDamage(baseDmg, strength, true, defense, false, 0, RAGE_DAMAGE_MULTIPLIER)).toBe(expected);
  });
});

// ── 7. Phase 37B chooseAIStandardAction unchanged ─────────────────────────

describe('Phase 38 — Phase 37B AI action selection unchanged', () => {
  test('fallback thresholds still work', () => {
    expect(chooseAIStandardAction(undefined, undefined, 0.30)).toBe('quick_attack');
    expect(chooseAIStandardAction(undefined, undefined, 0.50)).toBe('power_attack');
    expect(chooseAIStandardAction(undefined, undefined, 0.80)).toBe('shield_block');
    expect(chooseAIStandardAction(undefined, undefined, 0.95)).toBe('dodge');
  });

  test('Aurelius aggression/blockChance values produce valid actions', () => {
    // Aurelius: aggression=0.95, blockChance=0.70
    const action = chooseAIStandardAction(0.95, 0.70, 0.42);
    expect(['quick_attack', 'power_attack', 'shield_block', 'dodge']).toContain(action);
  });

  test('aggression=0.95 produces ~95% offensive', () => {
    // quickCutoff = 0.95 * 46/72 ≈ 0.607, powerCutoff = 0.95
    // r=0.60 → quick_attack, r=0.94 → power_attack
    expect(chooseAIStandardAction(0.95, 0.70, 0.60)).toBe('quick_attack');
    expect(chooseAIStandardAction(0.95, 0.70, 0.94)).toBe('power_attack');
    // r=0.96 → defensive: blockCutoff = 0.95 + 0.05*0.70 = 0.985 → shield_block
    expect(chooseAIStandardAction(0.95, 0.70, 0.96)).toBe('shield_block');
  });
});

// ── 8. Rage state reset for new duel ──────────────────────────────────────

describe('Phase 38 — Rage state reset', () => {
  test('shouldActivateRage with alreadyActivated=false allows fresh activation', () => {
    // Simulating a new duel: ref resets to false, health is full → no activation
    expect(shouldActivateRage('rage_mode_colossus', 480, 480, false)).toBe(false);
    // But at 50% it activates again (ref was reset)
    expect(shouldActivateRage('rage_mode_colossus', 240, 480, false)).toBe(true);
  });

  test('shouldActivateRage with alreadyActivated=true blocks re-activation', () => {
    // After activation in the same duel, ref is true → no re-trigger
    expect(shouldActivateRage('rage_mode_colossus', 100, 480, true)).toBe(false);
  });
});
