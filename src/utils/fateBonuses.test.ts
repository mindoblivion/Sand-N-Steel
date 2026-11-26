// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import {
  FATECON1_LIVE_EFFECT_KINDS,
  FATE_DODGE_BASE_STAMINA_COST,
  fateAttackRecoveryMultiplier,
  fateConditionalDamageMultiplier,
  fateCrowdHypeMultiplier,
  fateDamageMultiplier,
  fateDamageTakenMultiplier,
  fateDodgeCost,
  fateDodgeDistanceMultiplier,
  fateFameRewardMultiplier,
  fateGoldRewardMultiplier,
  fateMovementSpeedMultiplier,
  fateStaminaMaxBonus,
  fateStaminaRegenMultiplier,
  fateWeaponMasteryMultiplier,
  resolveFateBonuses,
  resolveFateCombatBonuses,
  type FateConditionalState,
} from './fateBonuses';

describe('PHASE2-FATECON-1 — the Fate bonus helper', () => {
  test('empty and unknown ids are neutral', () => {
    expect(fateStaminaMaxBonus([])).toBe(0);
    expect(fateStaminaRegenMultiplier([])).toBe(1);
    expect(fateMovementSpeedMultiplier([])).toBe(1);
    expect(fateDodgeCost([])).toBe(12);
    expect(fateDodgeDistanceMultiplier([])).toBe(1);
    expect(fateGoldRewardMultiplier([])).toBe(1);
    expect(fateFameRewardMultiplier([])).toBe(1);
    expect(fateCrowdHypeMultiplier([])).toBe(1);

    // Unknown ids are ignored, not errors — a hand-edited save cannot invent a bonus.
    const unknown = ['no_such_card', 'also_not_a_card'];
    expect(fateStaminaMaxBonus(unknown)).toBe(0);
    expect(fateGoldRewardMultiplier(unknown)).toBe(1);
    expect(fateDodgeCost(unknown)).toBe(12);
    expect(fateDamageMultiplier(unknown)).toBe(1);
    expect(fateDamageTakenMultiplier(unknown)).toBe(1);
    expect(fateAttackRecoveryMultiplier(unknown)).toBe(1);
    expect(resolveFateBonuses({ ownedCardIds: unknown, pendingDrafts: [], lastDraftedLevel: 0 })).toEqual({
      staminaMaxBonus: 0,
      staminaRegenMultiplier: 1,
      movementSpeedMultiplier: 1,
      dodgeCost: 12,
      dodgeDistanceMultiplier: 1,
      goldRewardMultiplier: 1,
      fameRewardMultiplier: 1,
      crowdHypeMultiplier: 1,
      ownedCardIds: [],
      damageMultiplier: 1,
      damageTakenMultiplier: 1,
      attackRecoveryMultiplier: 1,
    });
  });

  test('Iron Lungs sums flat: +6 per stack', () => {
    expect(fateStaminaMaxBonus(['iron_lungs'])).toBe(6);
    expect(fateStaminaMaxBonus(['iron_lungs', 'iron_lungs', 'iron_lungs'])).toBe(18);
  });

  test('percentage kinds multiply per stack', () => {
    expect(fateStaminaRegenMultiplier(['second_wind'])).toBeCloseTo(1.08, 10);
    expect(fateStaminaRegenMultiplier(['second_wind', 'second_wind'])).toBeCloseTo(1.08 * 1.08, 10);
    expect(fateMovementSpeedMultiplier(['fleet_footed', 'fleet_footed', 'fleet_footed'])).toBeCloseTo(
      1.04 * 1.04 * 1.04,
      10,
    );
    expect(fateDodgeDistanceMultiplier(['evasive_instinct'])).toBeCloseTo(1.08, 10);
    expect(fateGoldRewardMultiplier(['blood_money'])).toBeCloseTo(1.06, 10);
    expect(fateGoldRewardMultiplier(['blood_money', 'blood_money', 'blood_money'])).toBeCloseTo(
      1.06 * 1.06 * 1.06,
      10,
    );
    expect(fateFameRewardMultiplier(['crowd_favourite'])).toBeCloseTo(1.05, 10);
    expect(fateCrowdHypeMultiplier(['showman', 'showman'])).toBeCloseTo(1.08 * 1.08, 10);
  });

  test('the dodge cost rounds once on the final cost: 12 → 11 at 1 stack, 10 at 2', () => {
    expect(FATE_DODGE_BASE_STAMINA_COST).toBe(12);
    // 12 × 0.92 = 11.04 → 11; 12 × 0.92² = 10.1568 → 10.
    expect(fateDodgeCost(['arena_runner'])).toBe(11);
    expect(fateDodgeCost(['arena_runner', 'arena_runner'])).toBe(10);
  });

  test('each kind is scoped: a card of another kind changes nothing here', () => {
    // Brutal Force is damage_pct — the combat helpers read it, the Part 1
    // helpers never do.
    expect(fateStaminaMaxBonus(['brutal_force'])).toBe(0);
    expect(fateGoldRewardMultiplier(['brutal_force'])).toBe(1);
    expect(fateDodgeCost(['brutal_force'])).toBe(12);
    expect(fateCrowdHypeMultiplier(['brutal_force'])).toBe(1);
    // Deep Wounds is unlock_technique — no system to extend, no bonus anywhere.
    expect(fateGoldRewardMultiplier(['deep_wounds'])).toBe(1);
    expect(fateStaminaRegenMultiplier(['deep_wounds'])).toBe(1);
    expect(fateDamageMultiplier(['deep_wounds'])).toBe(1);
  });

  test('resolveFateBonuses resolves malformed state to neutral and bundles the rest', () => {
    for (const bad of [null, undefined, 'nope', 42, { ownedCardIds: 'iron_lungs' }]) {
      expect(resolveFateBonuses(bad)).toEqual({
        staminaMaxBonus: 0,
        staminaRegenMultiplier: 1,
        movementSpeedMultiplier: 1,
        dodgeCost: 12,
        dodgeDistanceMultiplier: 1,
        goldRewardMultiplier: 1,
        fameRewardMultiplier: 1,
        crowdHypeMultiplier: 1,
        ownedCardIds: [],
        damageMultiplier: 1,
        damageTakenMultiplier: 1,
        attackRecoveryMultiplier: 1,
      });
    }
    expect(
      resolveFateBonuses({
        ownedCardIds: ['iron_lungs', 'iron_lungs', 'second_wind', 'fleet_footed', 'blood_money'],
        pendingDrafts: [],
        lastDraftedLevel: 5,
      }),
    ).toEqual({
      staminaMaxBonus: 12,
      staminaRegenMultiplier: 1.08,
      movementSpeedMultiplier: 1.04,
      dodgeCost: 12,
      dodgeDistanceMultiplier: 1,
      goldRewardMultiplier: 1.06,
      fameRewardMultiplier: 1,
      crowdHypeMultiplier: 1,
      ownedCardIds: ['iron_lungs', 'iron_lungs', 'second_wind', 'fleet_footed', 'blood_money'],
      damageMultiplier: 1,
      damageTakenMultiplier: 1,
      attackRecoveryMultiplier: 1,
    });
  });

  test('the live set is exactly the fourteen kinds Parts 1 and 2 wired', () => {
    expect([...FATECON1_LIVE_EFFECT_KINDS].sort()).toEqual([
      'attack_recovery_pct',
      'conditional_damage_pct',
      'crowd_hype_pct',
      'damage_pct',
      'damage_taken_pct',
      'dodge_distance_pct',
      'fame_reward_pct',
      'gold_reward_pct',
      'movement_speed_pct',
      'once_per_bout_survival',
      'stamina_cost_pct',
      'stamina_max_flat',
      'stamina_recovery_pct',
      'weapon_mastery_pct',
    ]);
    // gold_flat was PHASE2-FATE's and stays named in the modal, not in this set.
    expect(FATECON1_LIVE_EFFECT_KINDS.has('gold_flat')).toBe(false);
    // Only Deep Wounds stays out: no technique registry, no bleeding system.
    expect(FATECON1_LIVE_EFFECT_KINDS.has('unlock_technique')).toBe(false);
  });
});

// ── PHASE2-FATECON-2 — the combat helpers ────────────────────────────────────

describe('PHASE2-FATECON-2 — the Fate combat helpers', () => {
  const noConditions: FateConditionalState = {
    afterOpponentMisses: false,
    afterSuccessfulDodge: false,
    attackerHealth: 100,
    attackerHealthMax: 100,
    defenderHealth: 100,
    defenderHealthMax: 100,
  };

  test('empty and unknown ids are neutral', () => {
    expect(fateDamageMultiplier([])).toBe(1);
    expect(fateWeaponMasteryMultiplier([], 'sword_shield')).toBe(1);
    expect(fateConditionalDamageMultiplier([], noConditions)).toBe(1);
    expect(fateDamageTakenMultiplier([])).toBe(1);
    expect(fateAttackRecoveryMultiplier([])).toBe(1);
    const unknown = ['no_such_card', 'also_not_a_card'];
    expect(fateDamageMultiplier(unknown)).toBe(1);
    expect(fateWeaponMasteryMultiplier(unknown, 'spear')).toBe(1);
    expect(fateConditionalDamageMultiplier(unknown, noConditions)).toBe(1);
    expect(fateDamageTakenMultiplier(unknown)).toBe(1);
    expect(fateAttackRecoveryMultiplier(unknown)).toBe(1);
    expect(resolveFateCombatBonuses({ ownedCardIds: unknown, pendingDrafts: [], lastDraftedLevel: 0 })).toEqual({
      ownedCardIds: [],
      damageMultiplier: 1,
      damageTakenMultiplier: 1,
      attackRecoveryMultiplier: 1,
    });
  });

  test('damage_pct multiplies per stack: brutal_force ×4 plus master_of_arms', () => {
    expect(fateDamageMultiplier(['brutal_force'])).toBeCloseTo(1.03, 10);
    expect(
      fateDamageMultiplier(['brutal_force', 'brutal_force', 'brutal_force', 'brutal_force', 'master_of_arms']),
    ).toBeCloseTo(1.03 * 1.03 * 1.03 * 1.03 * 1.03, 10);
  });

  test('weapon mastery is keyed by the weapon in hand; mace reads 1', () => {
    expect(fateWeaponMasteryMultiplier(['gladius_doctrine'], 'sword_shield')).toBeCloseTo(1.05, 10);
    expect(
      fateWeaponMasteryMultiplier(
        ['gladius_doctrine', 'gladius_doctrine', 'gladius_doctrine'],
        'sword_shield',
      ),
    ).toBeCloseTo(1.05 * 1.05 * 1.05, 10);
    expect(fateWeaponMasteryMultiplier(['spear_dancer'], 'spear')).toBeCloseTo(1.05, 10);
    expect(fateWeaponMasteryMultiplier(['twin_blade_flow'], 'dual_blades')).toBeCloseTo(1.05, 10);
    // A doctrine for another weapon changes nothing here.
    expect(fateWeaponMasteryMultiplier(['gladius_doctrine'], 'spear')).toBe(1);
    expect(fateWeaponMasteryMultiplier(['spear_dancer'], 'sword_shield')).toBe(1);
    // No mace card exists in the catalogue, so a mace reads 1 with any cards.
    expect(
      fateWeaponMasteryMultiplier(['gladius_doctrine', 'spear_dancer', 'twin_blade_flow'], 'mace'),
    ).toBe(1);
  });

  test('conditionals pay only when their condition holds', () => {
    const all = ['opening_strike', 'opening_strike', 'executioner', 'adrenaline_surge', 'blood_of_the_colossus'];
    expect(fateConditionalDamageMultiplier(all, noConditions)).toBe(1);
    // Opening Strike: only after the opponent misses.
    expect(
      fateConditionalDamageMultiplier(all, { ...noConditions, afterOpponentMisses: true }),
    ).toBeCloseTo(1.08 * 1.08, 10);
    // Adrenaline Surge: only after a successful dodge.
    expect(
      fateConditionalDamageMultiplier(all, { ...noConditions, afterSuccessfulDodge: true }),
    ).toBeCloseTo(1.1, 10);
    // Both flags live at once: they stack multiplicatively.
    expect(
      fateConditionalDamageMultiplier(all, {
        ...noConditions,
        afterOpponentMisses: true,
        afterSuccessfulDodge: true,
      }),
    ).toBeCloseTo(1.08 * 1.08 * 1.1, 10);
    // Executioner: only against an enemy below 25% health (strictly below).
    expect(
      fateConditionalDamageMultiplier(all, { ...noConditions, defenderHealth: 24, defenderHealthMax: 100 }),
    ).toBeCloseTo(1.12, 10);
    expect(
      fateConditionalDamageMultiplier(all, { ...noConditions, defenderHealth: 25, defenderHealthMax: 100 }),
    ).toBe(1);
    expect(
      fateConditionalDamageMultiplier(all, { ...noConditions, defenderHealth: 0, defenderHealthMax: 100 }),
    ).toBe(1);
    // Blood of the Colossus: only while the player is below 30% health.
    expect(
      fateConditionalDamageMultiplier(all, { ...noConditions, attackerHealth: 29, attackerHealthMax: 100 }),
    ).toBeCloseTo(1.1, 10);
    expect(
      fateConditionalDamageMultiplier(all, { ...noConditions, attackerHealth: 30, attackerHealthMax: 100 }),
    ).toBe(1);
    // The whole storm, all four conditions at once.
    expect(
      fateConditionalDamageMultiplier(all, {
        afterOpponentMisses: true,
        afterSuccessfulDodge: true,
        attackerHealth: 29,
        attackerHealthMax: 100,
        defenderHealth: 24,
        defenderHealthMax: 100,
      }),
    ).toBeCloseTo(1.08 * 1.08 * 1.12 * 1.1 * 1.1, 10);
  });

  test('Shield Savant reduces incoming damage: 0.98 per stack', () => {
    expect(fateDamageTakenMultiplier(['shield_savant'])).toBeCloseTo(0.98, 10);
    expect(
      fateDamageTakenMultiplier(['shield_savant', 'shield_savant', 'shield_savant']),
    ).toBeCloseTo(0.98 * 0.98 * 0.98, 10);
    expect(fateDamageTakenMultiplier(['shield_savant', 'shield_savant', 'shield_savant'])).toBeCloseTo(
      0.941192,
      10,
    );
  });

  test('Quick Recovery speeds the hold: 0.96 per stack, never 1.04', () => {
    expect(fateAttackRecoveryMultiplier(['quick_recovery'])).toBeCloseTo(0.96, 10);
    expect(
      fateAttackRecoveryMultiplier(['quick_recovery', 'quick_recovery', 'quick_recovery']),
    ).toBeCloseTo(0.96 * 0.96 * 0.96, 10);
    expect(
      fateAttackRecoveryMultiplier(['quick_recovery', 'quick_recovery', 'quick_recovery']),
    ).toBeCloseTo(0.884736, 10);
  });

  test('the combat bundle resolves malformed state to neutral', () => {
    for (const bad of [null, undefined, 'nope', 42, { ownedCardIds: 'brutal_force' }]) {
      expect(resolveFateCombatBonuses(bad)).toEqual({
        ownedCardIds: [],
        damageMultiplier: 1,
        damageTakenMultiplier: 1,
        attackRecoveryMultiplier: 1,
      });
    }
    expect(
      resolveFateCombatBonuses({
        ownedCardIds: ['brutal_force', 'shield_savant', 'quick_recovery'],
        pendingDrafts: [],
        lastDraftedLevel: 5,
      }),
    ).toEqual({
      ownedCardIds: ['brutal_force', 'shield_savant', 'quick_recovery'],
      damageMultiplier: 1.03,
      damageTakenMultiplier: 0.98,
      attackRecoveryMultiplier: 0.96,
    });
  });
});
