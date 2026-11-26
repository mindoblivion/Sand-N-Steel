// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import {
  FATECON1_LIVE_EFFECT_KINDS,
  FATE_DODGE_BASE_STAMINA_COST,
  fateCrowdHypeMultiplier,
  fateDodgeCost,
  fateDodgeDistanceMultiplier,
  fateFameRewardMultiplier,
  fateGoldRewardMultiplier,
  fateMovementSpeedMultiplier,
  fateStaminaMaxBonus,
  fateStaminaRegenMultiplier,
  resolveFateBonuses,
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
    expect(resolveFateBonuses({ ownedCardIds: unknown, pendingDrafts: [], lastDraftedLevel: 0 })).toEqual({
      staminaMaxBonus: 0,
      staminaRegenMultiplier: 1,
      movementSpeedMultiplier: 1,
      dodgeCost: 12,
      dodgeDistanceMultiplier: 1,
      goldRewardMultiplier: 1,
      fameRewardMultiplier: 1,
      crowdHypeMultiplier: 1,
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
    // Brutal Force is damage_pct — Part 2's kind, inert to every helper here.
    expect(fateStaminaMaxBonus(['brutal_force'])).toBe(0);
    expect(fateGoldRewardMultiplier(['brutal_force'])).toBe(1);
    expect(fateDodgeCost(['brutal_force'])).toBe(12);
    expect(fateCrowdHypeMultiplier(['brutal_force'])).toBe(1);
    // Deep Wounds is unlock_technique — no system to extend, no bonus anywhere.
    expect(fateGoldRewardMultiplier(['deep_wounds'])).toBe(1);
    expect(fateStaminaRegenMultiplier(['deep_wounds'])).toBe(1);
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
    });
  });

  test('the live set is exactly the eight kinds this slice wired', () => {
    expect([...FATECON1_LIVE_EFFECT_KINDS].sort()).toEqual([
      'crowd_hype_pct',
      'dodge_distance_pct',
      'fame_reward_pct',
      'gold_reward_pct',
      'movement_speed_pct',
      'stamina_cost_pct',
      'stamina_max_flat',
      'stamina_recovery_pct',
    ]);
    // gold_flat was PHASE2-FATE's and stays named in the modal, not in this set.
    expect(FATECON1_LIVE_EFFECT_KINDS.has('gold_flat')).toBe(false);
    // The seven combat kinds and unlock_technique stay out until Part 2.
    for (const kind of [
      'damage_pct',
      'conditional_damage_pct',
      'weapon_mastery_pct',
      'damage_taken_pct',
      'attack_recovery_pct',
      'once_per_bout_survival',
      'unlock_technique',
    ] as const) {
      expect(FATECON1_LIVE_EFFECT_KINDS.has(kind)).toBe(false);
    }
  });
});
