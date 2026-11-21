// @ts-ignore - bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { ALL_WEAPONS, ITEMS_DB } from '../data/itemsDB';
import { getStorefrontStock } from '../data/shops';

// WEAPONS-1 "Weapons Variety": pilum, hasta, scutum & gladius and parma & pugio
// are appended to ALL_WEAPONS at indices 12-15. Indices 0-11 stay unchanged.

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
  'wooden_sword_shield',
];

const NEW_WEAPON_IDS = ['wpn_pilum', 'wpn_hasta', 'shd_scutum_gladius', 'shd_parma_pugio'];

describe('WEAPONS-1 weapons variety', () => {
  test('the four legacy variety weapons retain their indices and material tiers append', () => {
    expect(ALL_WEAPONS).toHaveLength(24);
    NEW_WEAPON_IDS.forEach((id, i) => {
      expect(ALL_WEAPONS[12 + i].id).toBe(id);
    });
  });

  test('indices 0-11 keep their existing weapon ids', () => {
    EXISTING_WEAPON_IDS.forEach((id, i) => {
      expect(ALL_WEAPONS[i].id).toBe(id);
    });
  });

  test('pilum pins', () => {
    const pilum = ALL_WEAPONS[12];
    expect(pilum.name).toBe('Pilum');
    expect(pilum.type).toBe('spear');
    expect(pilum.rarity).toBe('uncommon');
    expect(pilum.damageLight).toBe(18);
    expect(pilum.damageHeavy).toBe(34);
    expect(pilum.range).toBe(2.9);
    expect(pilum.price).toBe(150);
  });

  test('hasta has the longest range of any weapon', () => {
    const hasta = ALL_WEAPONS[13];
    expect(hasta.name).toBe('Hasta');
    expect(hasta.type).toBe('spear');
    expect(hasta.rarity).toBe('common');
    expect(hasta.range).toBe(3.4);
    const legacyRangeCeiling = Math.max(...ALL_WEAPONS.filter((w) => !w.id.endsWith('_two_handed_spear')).map((w) => w.range));
    expect(hasta.range).toBe(legacyRangeCeiling);
  });

  test('scutum has the highest blockReduction and bonusDefense 4', () => {
    const scutum = ALL_WEAPONS[14];
    expect(scutum.name).toBe('Scutum & Gladius');
    expect(scutum.type).toBe('sword_shield');
    expect(scutum.rarity).toBe('uncommon');
    expect(scutum.blockReduction).toBe(0.9);
    expect(scutum.blockReduction).toBe(Math.max(...ALL_WEAPONS.map((w) => w.blockReduction)));
    expect(scutum.bonusDefense).toBe(4);
  });

  test('parma is the fastest of the four new weapons and blocks 0.65', () => {
    const newWeapons = ALL_WEAPONS.slice(12, 16);
    const parma = ALL_WEAPONS[15];
    expect(parma.name).toBe('Parma & Pugio');
    expect(parma.type).toBe('sword_shield');
    expect(parma.rarity).toBe('common');
    expect(parma.speed).toBe(0.32);
    expect(parma.speed).toBe(Math.min(...newWeapons.map((w) => w.speed)));
    expect(parma.blockReduction).toBe(0.65);
    expect(parma.bonusAgility).toBe(3);
  });

  test('material weapon tiers resolve to their supplied sword, shield and spear GLBs', () => {
    const byId = new Map(ALL_WEAPONS.map((weapon) => [weapon.id, weapon]));
    for (const [id, sword, shield] of [
      ['bronze_sword_shield', '/models/weapons/bronze_sword.glb', '/models/weapons/bronze_shield.glb'],
      ['iron_sword_shield', '/models/weapons/iron_sword.glb', '/models/weapons/iron_shield.glb'],
      ['steel_sword_shield', '/models/weapons/steel_sword.glb', '/models/weapons/steel_shield.glb'],
    ] as const) {
      expect(byId.get(id)?.modelPath).toBe(sword);
      expect(byId.get(id)?.shieldModelPath).toBe(shield);
    }
    for (const [id, model] of [
      ['bronze_two_handed_spear', '/models/weapons/bronze_spear.glb'],
      ['iron_two_handed_spear', '/models/weapons/iron_spear.glb'],
      ['steel_two_handed_spear', '/models/weapons/steel_spear.glb'],
    ] as const) {
      expect(byId.get(id)?.modelPath).toBe(model);
      expect(byId.get(id)?.type).toBe('spear');
      expect(byId.get(id)?.shieldModelPath).toBeUndefined();
    }
  });

  test('all four new weapons are stocked at the forge and the market', () => {
    const forge = getStorefrontStock('forge');
    const market = getStorefrontStock('market');
    for (const id of NEW_WEAPON_IDS) {
      expect(forge).toContain(id);
      expect(market).toContain(id);
    }
    expect(forge).toHaveLength(23);
    expect(market).toHaveLength(ITEMS_DB.length);
  });
});
