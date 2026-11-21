// @ts-ignore - bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { createNewProfile } from '../services/storage';
import { ITEMS_BY_CATEGORY, WOODEN_SHIELD, weaponSupportsOffhandShield } from '../data/itemsDB';

describe('independent off-hand shield equipment', () => {
  test('the four material shields are separate catalogue items with ascending block values', () => {
    const shields = ITEMS_BY_CATEGORY.shield;
    expect(shields.map((shield) => shield.id)).toEqual([
      'shield_wooden_wicker',
      'shield_bronze_round',
      'shield_iron_scuta',
      'shield_steel_scuta',
    ]);
    expect(shields.map((shield) => shield.blockReduction)).toEqual([0.60, 0.72, 0.78, 0.82]);
    expect(shields.every((shield) => Boolean(shield.modelPath))).toBe(true);
    expect(WOODEN_SHIELD.id).toBe('shield_wooden_wicker');
  });

  test('only one-handed sword-and-shield and mace families accept an off-hand shield', () => {
    expect(weaponSupportsOffhandShield('sword_shield')).toBe(true);
    expect(weaponSupportsOffhandShield('mace')).toBe(true);
    expect(weaponSupportsOffhandShield('spear')).toBe(false);
    expect(weaponSupportsOffhandShield('dual_blades')).toBe(false);
  });

  test('new profiles carry and equip the independent wooden shield', () => {
    const profile = createNewProfile('Shield Test');
    expect(profile.equipped.shield?.id).toBe(WOODEN_SHIELD.id);
    expect(profile.inventory.some((item) => item.id === WOODEN_SHIELD.id)).toBe(true);
  });
});
