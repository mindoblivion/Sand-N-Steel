// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import {
  DEFAULT_GLADIATOR_WEIGHT_LB,
  normalizeGladiatorWeight,
  getWeightCombatProfile,
  meetsWeaponStrengthRequirement,
} from './gladiatorWeight';

describe('gladiator weight combat and movement profile', () => {
  test('legacy and invalid values resolve to the neutral baseline', () => {
    expect(normalizeGladiatorWeight(undefined)).toBe(DEFAULT_GLADIATOR_WEIGHT_LB);
    expect(normalizeGladiatorWeight(NaN)).toBe(DEFAULT_GLADIATOR_WEIGHT_LB);
    expect(normalizeGladiatorWeight('200')).toBe(DEFAULT_GLADIATOR_WEIGHT_LB);
    expect(getWeightCombatProfile(undefined)).toEqual({
      weightLb: 180,
      impactMultiplier: 1,
      recoveryMultiplier: 1,
      movementMultiplier: 1,
    });
  });

  test('lighter builds trade impact for faster attack recovery and stride', () => {
    const light = getWeightCombatProfile(140);
    expect(light.impactMultiplier).toBeLessThan(1);
    expect(light.recoveryMultiplier).toBe(0.95);
    expect(light.movementMultiplier).toBe(1.05);
  });

  test('heavier builds trade slower attack recovery and stride for more impact', () => {
    const heavy = getWeightCombatProfile(300);
    expect(heavy.impactMultiplier).toBeGreaterThan(1);
    expect(heavy.recoveryMultiplier).toBe(1.15);
    expect(heavy.movementMultiplier).toBe(0.85);
  });

  test('weight is clamped and strength alone determines strength requirement', () => {
    expect(normalizeGladiatorWeight(1)).toBe(140);
    expect(normalizeGladiatorWeight(900)).toBe(300);
    expect(meetsWeaponStrengthRequirement(12, 12)).toBe(true);
    expect(meetsWeaponStrengthRequirement(11, 12)).toBe(false);
    expect(meetsWeaponStrengthRequirement.length).toBe(2);
  });
});
