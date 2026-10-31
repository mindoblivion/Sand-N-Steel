// @ts-ignore - bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { ALL_WEAPONS, ITEMS_DB } from '../data/itemsDB';
import { getStorefrontStock } from '../data/shops';

// WEAPONS-1: add four historically distinct weapon choices without changing
// the existing eleven ids, their order, or the fresh-profile starter.

const EXISTING_WEAPON_IDS = [
  'gladius_standard',
  'spatha_legion',
  'hoplite_spear',
  'trident_retarius',
  'dual_sicae_daggers',
  'dual_vipers',
  'bronze_mace',
  'titan_colossus_mace',
  'dagger_pugio',
  'dirk_desert',
  'shamshir_curved',
];
const NEW_WEAPON_IDS = ['wpn_pilum', 'wpn_hasta', 'shd_scutum_gladius', 'shd_parma_pugio'];

describe('WEAPONS-1 weapons variety', () => {
  test('the four new weapons append after all existing entries', () => {
    expect(ALL_WEAPONS).toHaveLength(15);
    EXISTING_WEAPON_IDS.forEach((id, index) => expect(ALL_WEAPONS[index].id).toBe(id));
    NEW_WEAPON_IDS.forEach((id, index) => expect(ALL_WEAPONS[11 + index].id).toBe(id));
  });

  test('Pilum is an uncommon mid-range spear', () => {
    const pilum = ALL_WEAPONS[11];
    expect(pilum.name).toBe('Pilum');
    expect(pilum.type).toBe('spear');
    expect(pilum.rarity).toBe('uncommon');
    expect(pilum.damageLight).toBe(18);
    expect(pilum.damageHeavy).toBe(34);
    expect(pilum.range).toBe(2.9);
    expect(pilum.price).toBe(150);
  });

  test('Hasta has the longest weapon reach', () => {
    const hasta = ALL_WEAPONS[12];
    expect(hasta.name).toBe('Hasta');
    expect(hasta.type).toBe('spear');
    expect(hasta.range).toBe(3.4);
    expect(hasta.range).toBe(Math.max(...ALL_WEAPONS.map((weapon) => weapon.range)));
  });

  test('Scutum & Gladius is the strongest shield block', () => {
    const scutum = ALL_WEAPONS[13];
    expect(scutum.name).toBe('Scutum & Gladius');
    expect(scutum.type).toBe('sword_shield');
    expect(scutum.blockReduction).toBe(0.9);
    expect(scutum.blockReduction).toBe(Math.max(...ALL_WEAPONS.map((weapon) => weapon.blockReduction)));
    expect(scutum.bonusDefense).toBe(4);
  });

  test('Parma & Pugio is the fastest new weapon', () => {
    const parma = ALL_WEAPONS[14];
    expect(parma.name).toBe('Parma & Pugio');
    expect(parma.type).toBe('sword_shield');
    expect(parma.speed).toBe(0.32);
    expect(parma.blockReduction).toBe(0.65);
    expect(parma.bonusAgility).toBe(3);
  });

  test('all four additions are forge and market stock, not merchant stock', () => {
    const forge = getStorefrontStock('forge');
    const market = getStorefrontStock('market');
    const merchant = getStorefrontStock('merchant');
    for (const id of NEW_WEAPON_IDS) {
      expect(forge).toContain(id);
      expect(market).toContain(id);
      expect(merchant).not.toContain(id);
    }
    expect(forge).toHaveLength(14);
    expect(market).toHaveLength(ITEMS_DB.length);
  });
});
