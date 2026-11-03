// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import {
  DEFAULT_GLADIATOR_WEIGHT_LB,
  normalizeGladiatorWeight,
  getWeightCombatProfile,
  meetsWeaponStrengthRequirement,
} from './gladiatorWeight';

describe('gladiator weight combat profile', () => {
  test('legacy and invalid values resolve to the neutral baseline', () => {
    expect(normalizeGladiatorWeight(undefined)).toBe(DEFAULT_GLADIATOR_WEIGHT_LB);
    expect(normalizeGladiatorWeight(NaN)).toBe(DEFAULT_GLADIATOR_WEIGHT_LB);
    expect(normalizeGladiatorWeight('200')).toBe(DEFAULT_GLADIATOR_WEIGHT_LB);
    expect(getWeightCombatProfile(undefined)).toEqual({
      weightLb: 180,
      attackSpeedMultiplier: 1,
      impactMultiplier: 1,
    });
  });

  test('lighter builds trade impact for faster attacks', () => {
    const light = getWeightCombatProfile(140);
    expect(light.attackSpeedMultiplier).toBeGreaterThan(1);
    expect(light.impactMultiplier).toBeLessThan(1);
  });

  test('heavier builds trade attack speed for greater impact', () => {
    const heavy = getWeightCombatProfile(300);
    expect(heavy.attackSpeedMultiplier).toBeLessThan(1);
    expect(heavy.impactMultiplier).toBeGreaterThan(1);
  });

  test('weight is clamped and strength alone determines strength requirement', () => {
    expect(normalizeGladiatorWeight(1)).toBe(140);
    expect(normalizeGladiatorWeight(900)).toBe(300);
    expect(meetsWeaponStrengthRequirement(12, 12)).toBe(true);
    expect(meetsWeaponStrengthRequirement(11, 12)).toBe(false);
    // The same strength eligibility result applies regardless of body weight.
    expect(getWeightCombatProfile(140).weightLb).toBe(140);
    expect(getWeightCombatProfile(300).weightLb).toBe(300);
  });
});
