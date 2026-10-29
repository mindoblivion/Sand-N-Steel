// @ts-ignore - bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ALL_WEAPONS,
  DEFAULT_PLAYER_WEAPON,
  STARTING_SPARE_WEAPON,
  WOODEN_SWORD_SHIELD,
} from '../data/itemsDB';

const itemsDbPath = fileURLToPath(new URL('../data/itemsDB.ts', import.meta.url));
const storagePath = fileURLToPath(new URL('../services/storage.ts', import.meta.url));

describe('WOODEN-1 wooden beginnings', () => {
  test('wooden sword and shield literals', () => {
    expect(WOODEN_SWORD_SHIELD.id).toBe('wooden_sword_shield');
    expect(WOODEN_SWORD_SHIELD.name).toBe('Wooden Sword & Shield');
    expect(WOODEN_SWORD_SHIELD.damageLight).toBe(8);
    expect(WOODEN_SWORD_SHIELD.damageHeavy).toBe(15);
    expect(WOODEN_SWORD_SHIELD.blockReduction).toBe(0.6);
    expect(WOODEN_SWORD_SHIELD.price).toBe(10);
    expect(WOODEN_SWORD_SHIELD.sellPrice).toBe(4);
  });

  test('wooden is strictly weaker than the steel gladius', () => {
    expect(WOODEN_SWORD_SHIELD.damageLight).toBeLessThan(DEFAULT_PLAYER_WEAPON.damageLight);
    expect(WOODEN_SWORD_SHIELD.damageHeavy).toBeLessThan(DEFAULT_PLAYER_WEAPON.damageHeavy);
    expect(WOODEN_SWORD_SHIELD.blockReduction).toBeLessThan(DEFAULT_PLAYER_WEAPON.blockReduction);
  });

  test('ALL_WEAPONS order preserved and wooden appended last', () => {
    expect(ALL_WEAPONS[0]).toBe(DEFAULT_PLAYER_WEAPON);
    expect(ALL_WEAPONS[2]).toBe(STARTING_SPARE_WEAPON);
    expect(STARTING_SPARE_WEAPON.id).toBe('hoplite_spear');
    expect(ALL_WEAPONS[ALL_WEAPONS.length - 1]).toBe(WOODEN_SWORD_SHIELD);
    expect(ALL_WEAPONS.indexOf(WOODEN_SWORD_SHIELD)).toBeGreaterThan(2);
  });

  test('character creation grants wood instead of steel', () => {
    const storageSource = readFileSync(storagePath, 'utf8');
    expect(storageSource).toContain('weapon: WOODEN_SWORD_SHIELD');
    expect(storageSource).toContain('inventory: [WOODEN_SWORD_SHIELD, STARTING_SPARE_WEAPON]');
    expect(storageSource).not.toContain('weapon: DEFAULT_PLAYER_WEAPON');
  });

  test('steel gladius remains affordable with starting gold', () => {
    const itemsSource = readFileSync(itemsDbPath, 'utf8');
    const steelBlock = itemsSource.slice(
      itemsSource.indexOf('export const DEFAULT_PLAYER_WEAPON'),
      itemsSource.indexOf('export const ALL_WEAPONS'),
    );
    const steelPrice = Number(steelBlock.match(/price: (\d+)/)?.[1]);
    const storageSource = readFileSync(storagePath, 'utf8');
    const startingGold = Number(storageSource.match(/gold: (\d+)/)?.[1]);
    expect(Number.isFinite(steelPrice)).toBe(true);
    expect(Number.isFinite(startingGold)).toBe(true);
    expect(steelPrice).toBeLessThanOrEqual(startingGold);
  });
});
