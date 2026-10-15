/**
 * Phase 36 — Armor Stat Bonus Integration regression tests.
 *
 * Verifies that calculateTotalStats() correctly applies:
 *   - ArmorItem.bonusDefense  → total defense      (PRE-1)
 *   - ArmorItem.staminaRegenBonus → total staminaRegen (PRE-2)
 *
 * Run with: bun test src/utils/phase36.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { calculateTotalStats } from '../services/storage';
import { DEFAULT_PLAYER_WEAPON, ALL_ARMORS } from '../data/itemsDB';
import { PlayerProfile, ArmorItem } from '../types/game';

// ── Fixtures ────────────────────────────────────────────────────────────────

/** A minimal profile with only base stats and a weapon (no armor). */
function bareProfile(): PlayerProfile {
  return {
    name: 'Test',
    title: 'Tester',
    rank: 'Rookie',
    appearance: {
      skinColor: '#000',
      hairColor: '#000',
      tunicColor: '#000',
      crestColor: '#000',
    },
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    unspentStatPoints: 0,
    baseStats: { strength: 10, agility: 10, stamina: 10, defense: 4 },
    gold: 0,
    fame: 0,
    currentTier: 1,
    tierProgress: { 1: 0, 2: 0, 3: 0, 4: 0 },
    defeatedOpponentIds: [],
    bossKills: 0,
    newGamePlus: 0,
    trainingSessionsLeft: 2,
    injury: null,
    equipped: { weapon: DEFAULT_PLAYER_WEAPON },
    inventory: [],
    fightsWon: 0,
    fightsLost: 0,
    peakCrowdHypeOverall: 0,
  };
}

/** Equip one or more armor pieces onto a bare profile. */
function withArmor(profile: PlayerProfile, pieces: Partial<Record<'helm' | 'chest' | 'arms' | 'legs', ArmorItem>>): PlayerProfile {
  return {
    ...profile,
    equipped: { ...profile.equipped, ...pieces },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Phase 36 — Armor bonusDefense integration (PRE-1)', () => {
  test('armor with bonusDefense increases computed defense by the expected amount', () => {
    const helm = ALL_ARMORS.find((a) => a.id === 'helm_murmillo')!; // defense 4, bonusDefense 2
    const base = calculateTotalStats(bareProfile());
    const equipped = calculateTotalStats(withArmor(bareProfile(), { helm }));

    // defense should increase by defense(4) + bonusDefense(2) = 6
    expect(equipped.defense).toBe(base.defense + 6);
  });

  test('multiple armor pieces with bonusDefense stack correctly', () => {
    const helm = ALL_ARMORS.find((a) => a.id === 'helm_murmillo')!;        // defense 4, bonusDefense 2
    const chest = ALL_ARMORS.find((a) => a.id === 'chest_lorica_segmentata')!; // defense 10, bonusDefense 5
    const base = calculateTotalStats(bareProfile());
    const equipped = calculateTotalStats(withArmor(bareProfile(), { helm, chest }));

    // defense increase = (4+2) + (10+5) = 21
    expect(equipped.defense).toBe(base.defense + 21);
  });

  test('armor without bonusDefense still applies base defense only', () => {
    // Create a controlled armor with no bonusDefense field
    const armor: ArmorItem = {
      id: 'test_no_bonus',
      slot: 'helm',
      name: 'Test Helm',
      rarity: 'common',
      description: 'Test',
      defense: 7,
      staminaRegenBonus: 0,
      price: 0,
      sellPrice: 0,
      color: '#000',
      trimColor: '#000',
    };
    const base = calculateTotalStats(bareProfile());
    const equipped = calculateTotalStats(withArmor(bareProfile(), { helm: armor }));

    // Only base defense applies, no bonus
    expect(equipped.defense).toBe(base.defense + 7);
  });

  test('bonusDefense is not applied twice', () => {
    const helm = ALL_ARMORS.find((a) => a.id === 'helm_centurion')!; // defense 8, bonusDefense 4
    const base = calculateTotalStats(bareProfile());
    const equipped = calculateTotalStats(withArmor(bareProfile(), { helm }));

    // Should be defense(8) + bonusDefense(4) = 12, not 16 or 8
    expect(equipped.defense).toBe(base.defense + 12);
    expect(equipped.defense).not.toBe(base.defense + 8);
    expect(equipped.defense).not.toBe(base.defense + 16);
  });
});

describe('Phase 36 — Armor staminaRegenBonus integration (PRE-2)', () => {
  test('armor with staminaRegenBonus increases computed staminaRegen by the expected amount', () => {
    const arms = ALL_ARMORS.find((a) => a.id === 'arms_manica')!; // staminaRegenBonus 0.5
    const base = calculateTotalStats(bareProfile());
    const equipped = calculateTotalStats(withArmor(bareProfile(), { arms }));

    expect(equipped.staminaRegen).toBe(base.staminaRegen + 0.5);
  });

  test('multiple armor pieces with staminaRegenBonus stack correctly', () => {
    // Use controlled fixtures with ONLY staminaRegenBonus (no attribute bonuses)
    // so the delta is purely from regenBonus, not from agi/sta changes.
    const a: ArmorItem = { id: 't1', slot: 'helm', name: 'T1', rarity: 'common', description: '', defense: 0, staminaRegenBonus: 0.5, price: 0, sellPrice: 0, color: '', trimColor: '' };
    const b: ArmorItem = { id: 't2', slot: 'chest', name: 'T2', rarity: 'common', description: '', defense: 0, staminaRegenBonus: 1, price: 0, sellPrice: 0, color: '', trimColor: '' };
    const c: ArmorItem = { id: 't3', slot: 'arms', name: 'T3', rarity: 'common', description: '', defense: 0, staminaRegenBonus: 2, price: 0, sellPrice: 0, color: '', trimColor: '' };
    const base = calculateTotalStats(bareProfile());
    const equipped = calculateTotalStats(withArmor(bareProfile(), { helm: a, chest: b, arms: c }));

    // 0.5 + 1 + 2 = 3.5
    expect(equipped.staminaRegen).toBe(base.staminaRegen + 3.5);
  });

  test('armor with staminaRegenBonus 0 leaves staminaRegen unchanged', () => {
    const helm = ALL_ARMORS.find((a) => a.id === 'helm_murmillo')!; // staminaRegenBonus 0
    const base = calculateTotalStats(bareProfile());
    const equipped = calculateTotalStats(withArmor(bareProfile(), { helm }));

    expect(equipped.staminaRegen).toBe(base.staminaRegen);
  });
});

describe('Phase 36 — Existing stat contributions remain intact', () => {
  test('armor base defense still applies', () => {
    const chest = ALL_ARMORS.find((a) => a.id === 'chest_lorica_segmentata')!; // defense 10
    const base = calculateTotalStats(bareProfile());
    const equipped = calculateTotalStats(withArmor(bareProfile(), { chest }));

    // base defense(10) + bonusDefense(5) = 15 total to defense
    expect(equipped.defense).toBe(base.defense + 15);
  });

  test('armor bonusStrength still applies', () => {
    const arms = ALL_ARMORS.find((a) => a.id === 'arms_manica')!; // bonusStrength 1
    const base = calculateTotalStats(bareProfile());
    const equipped = calculateTotalStats(withArmor(bareProfile(), { arms }));

    expect(equipped.strength).toBe(base.strength + 1);
  });

  test('armor bonusAgility still applies', () => {
    const legs = ALL_ARMORS.find((a) => a.id === 'legs_greaves_bronze')!; // bonusAgility 2
    const base = calculateTotalStats(bareProfile());
    const equipped = calculateTotalStats(withArmor(bareProfile(), { legs }));

    expect(equipped.agility).toBe(base.agility + 2);
  });

  test('healthMax reflects the increased defense from bonusDefense', () => {
    const chest = ALL_ARMORS.find((a) => a.id === 'chest_golden_muscled')!; // defense 18, bonusDefense 8, bonusStrength 5
    const base = calculateTotalStats(bareProfile());
    const equipped = calculateTotalStats(withArmor(bareProfile(), { chest }));

    // str increases by 5, def increases by 18+8=26
    const expectedHealth = 80 + (base.strength + 5) * 4 + (base.defense + 26) * 3;
    expect(equipped.healthMax).toBe(expectedHealth);
  });
});
