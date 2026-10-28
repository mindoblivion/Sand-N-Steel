/**
 * S6 — BAZAAR CONSUMABLES: the catalogue, the counted inventory, the buy, the use.
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  the catalogue — exactly two items, the DESIGN's prices pinned as literals
 *       (Field Poultice 20 g, Medicus Salve 90 g per design-reconciliation C4c —
 *       the superseded 45 g must not return), and each item's effect data;
 *   §B  the lazy record — a legacy save with no `consumables` field resolves to {},
 *       null / malformed / negative / fractional shapes resolve to whole counts,
 *       and `createNewProfile` still writes no field;
 *   §C  buying — gold decreases by exactly the price, the count rises by one, the
 *       item never enters the GEAR inventory, and a purse that cannot cover it is
 *       refused with the profile untouched;
 *   §D  using — the count drops by one, the injury changes through the item's data
 *       effect, a poultice at 1 fight clears the wound, a salve clears a fresh
 *       3-fight wound outright, and use is refused at 0 owned and when uninjured;
 *   §E  purity — no helper mutates its input, and a refusal returns no profile at
 *       all so it cannot reach `saveProfile`;
 *   §F  the wiring — the App-level handlers are the only writers, the Bazaar screen
 *       buys through them, and the two use surfaces appear only when injured with
 *       something owned.
 *
 * Run with: `bun test src/utils/consumables.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlayerInjury, PlayerProfile } from '../types/game';
import { CONSUMABLES, getConsumableById } from '../data/consumables';
import {
  applyConsumableEffect,
  consumeItem,
  getConsumableCount,
  getConsumableUseEligibility,
  ownedConsumables,
  purchaseConsumable,
  resolveConsumables,
} from './consumables';
import { createNewProfile } from '../services/storage';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';

const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url));

const FRESH: PlayerInjury = { fightsRemaining: 3, penaltyStrength: 2, penaltyAgility: 2 };

function bareProfile(over: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    name: 'Test',
    title: 'Tester',
    rank: 'Rookie',
    appearance: { skinColor: '#000', hairColor: '#000', tunicColor: '#000', crestColor: '#000' },
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    unspentStatPoints: 0,
    baseStats: { strength: 10, agility: 10, stamina: 10, defense: 4 },
    gold: 100,
    fame: 0,
    currentTier: 1,
    tierProgress: { 1: 0, 2: 0, 3: 0, 4: 0 },
    defeatedOpponentIds: [],
    bossKills: 0,
    newGamePlus: 0,
    trainingSessionsLeft: 2,
    injury: null,
    equipped: { weapon: DEFAULT_PLAYER_WEAPON },
    inventory: [DEFAULT_PLAYER_WEAPON],
    fightsWon: 0,
    fightsLost: 0,
    peakCrowdHypeOverall: 0,
    ...over,
  };
}

/** Comments stripped, so prose can never satisfy (or defeat) a source assertion. */
const code = (rel: string): string =>
  readFileSync(join(SRC_ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

// ══════════════════════════════════════════════════════════════════════════
describe('S6 §A — the catalogue', () => {
  test('exactly two consumables, the Bazaar’s own', () => {
    expect(CONSUMABLES.map((item) => item.id)).toEqual(['field_poultice', 'medicus_salve']);
    expect(CONSUMABLES.map((item) => item.name)).toEqual(['Field Poultice', 'Medicus Salve']);
  });

  test('the prices are the design’s — 20 g and 90 g (C4c, not 45 g)', () => {
    expect(getConsumableById('field_poultice')?.price).toBe(20);
    expect(getConsumableById('medicus_salve')?.price).toBe(90);
    // The superseded S6 price must not come back.
    expect(CONSUMABLES.map((item) => item.price)).not.toContain(45);
  });

  test('the effects are data: a one-fight poultice and an outright salve', () => {
    expect(getConsumableById('field_poultice')?.effect).toEqual({
      kind: 'reduce-injury-fights',
      magnitude: 1,
    });
    expect(getConsumableById('medicus_salve')?.effect).toEqual({
      kind: 'clear-injury',
      magnitude: 0,
    });
  });

  test('an id no build knows resolves to undefined', () => {
    expect(getConsumableById('philosophers_stone')).toBeUndefined();
    expect(getConsumableById('')).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('S6 §B — the lazy counted record', () => {
  test('a legacy save with no consumables field owns none', () => {
    const legacy = bareProfile();
    expect('consumables' in legacy).toBe(false);
    expect(resolveConsumables(legacy)).toEqual({});
    expect(getConsumableCount(legacy, 'field_poultice')).toBe(0);
    expect(ownedConsumables(legacy)).toEqual([]);
  });

  test('null, an array, a string and a bare number all resolve to {}', () => {
    for (const bad of [null, [], 'two potions', 3]) {
      const profile = { consumables: bad } as unknown as { consumables: Record<string, number> };
      expect(resolveConsumables(profile)).toEqual({});
    }
    expect(resolveConsumables(null)).toEqual({});
    expect(resolveConsumables(undefined)).toEqual({});
  });

  test('counts are whole and never negative; unknown ids are dropped', () => {
    const profile = bareProfile({
      consumables: {
        field_poultice: 2.9,
        medicus_salve: -4,
        philosophers_stone: 7,
      } as unknown as Record<string, number>,
    });
    expect(resolveConsumables(profile)).toEqual({ field_poultice: 2 });
  });

  test('the factory still writes no consumables field', () => {
    const fresh = createNewProfile('Lazy');
    expect('consumables' in fresh).toBe(false);
    expect(resolveConsumables(fresh)).toEqual({});
  });

  test('a resolved record is a fresh object every read', () => {
    const profile = bareProfile({ consumables: { field_poultice: 1 } });
    const first = resolveConsumables(profile);
    first.field_poultice = 99;
    expect(resolveConsumables(profile)).toEqual({ field_poultice: 1 });
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('S6 §C — buying', () => {
  test('gold decreases by exactly the price and the count rises by one', () => {
    const before = bareProfile({ gold: 100 });
    const result = purchaseConsumable(before, 'field_poultice');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.gold).toBe(80);
    expect(result.profile.consumables).toEqual({ field_poultice: 1 });
    // The input is untouched.
    expect(before.gold).toBe(100);
    expect(before.consumables).toBeUndefined();
  });

  test('a consumable is never a gear item and never enters profile.inventory', () => {
    const result = purchaseConsumable(bareProfile({ gold: 100 }), 'medicus_salve');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.gold).toBe(10);
    expect(result.profile.inventory.map((item) => item.id)).toEqual([DEFAULT_PLAYER_WEAPON.id]);
    expect(result.profile.inventory).not.toContain(result.item as unknown as typeof DEFAULT_PLAYER_WEAPON);
    // Gear narrowing stays sound: nothing new carries `damageLight` or `defense`.
    expect(result.profile.inventory.every((item) => 'damageLight' in item || 'defense' in item)).toBe(true);
  });

  test('a second buy accumulates and each buy costs its own price', () => {
    const first = purchaseConsumable(bareProfile({ gold: 200 }), 'field_poultice');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.profile.gold).toBe(180);
    const second = purchaseConsumable(first.profile, 'field_poultice');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.profile.gold).toBe(160);
    expect(second.profile.consumables).toEqual({ field_poultice: 2 });

    const salve = purchaseConsumable(second.profile, 'medicus_salve');
    expect(salve.ok).toBe(true);
    if (!salve.ok) return;
    expect(salve.profile.gold).toBe(70);
    expect(salve.profile.consumables).toEqual({ field_poultice: 2, medicus_salve: 1 });
  });

  test('exactly the price pays to zero; one gold short is refused', () => {
    const exact = purchaseConsumable(bareProfile({ gold: 20 }), 'field_poultice');
    expect(exact.ok).toBe(true);
    if (exact.ok) expect(exact.profile.gold).toBe(0);

    const short = purchaseConsumable(bareProfile({ gold: 19 }), 'field_poultice');
    expect(short).toEqual({ ok: false, reason: 'insufficient-gold' });
  });

  test('a refused buy leaves the profile, its gold and its counts untouched', () => {
    const poor = bareProfile({ gold: 89, consumables: { field_poultice: 1 } });
    const frozen = JSON.stringify(poor);
    const result = purchaseConsumable(poor, 'medicus_salve');
    expect(result.ok).toBe(false);
    expect('profile' in result).toBe(false);
    expect(JSON.stringify(poor)).toBe(frozen);
    expect(poor.gold).toBe(89);
    expect(poor.consumables).toEqual({ field_poultice: 1 });
  });

  test('a missing or non-finite balance can afford nothing', () => {
    for (const gold of [undefined, NaN, Infinity]) {
      const profile = bareProfile({ gold: gold as unknown as number });
      expect(purchaseConsumable(profile, 'field_poultice')).toEqual({
        ok: false,
        reason: 'insufficient-gold',
      });
    }
  });

  test('an unknown item is refused', () => {
    expect(purchaseConsumable(bareProfile({ gold: 1000 }), 'philosophers_stone')).toEqual({
      ok: false,
      reason: 'unknown-item',
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('S6 §D — using', () => {
  test('a poultice spends one and takes one fight off the wound', () => {
    const before = bareProfile({ injury: FRESH, consumables: { field_poultice: 2 } });
    const result = consumeItem(before, 'field_poultice');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.consumables).toEqual({ field_poultice: 1 });
    expect(result.profile.injury).toEqual({ ...FRESH, fightsRemaining: 2 });
    expect(result.cleared).toBe(false);
    // The input and its nested records are untouched.
    expect(before.consumables).toEqual({ field_poultice: 2 });
    expect(before.injury).toEqual(FRESH);
  });

  test('a poultice at one fight remaining clears the injury', () => {
    const before = bareProfile({
      injury: { ...FRESH, fightsRemaining: 1 },
      consumables: { field_poultice: 1 },
    });
    const result = consumeItem(before, 'field_poultice');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.injury).toBeNull();
    expect(result.cleared).toBe(true);
    // The count reached zero, so it drops out of the record instead of lingering.
    expect(result.profile.consumables).toEqual({});
  });

  test('a salve clears a fresh three-fight injury outright', () => {
    const before = bareProfile({ injury: FRESH, consumables: { medicus_salve: 1 } });
    const result = consumeItem(before, 'medicus_salve');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.injury).toBeNull();
    expect(result.cleared).toBe(true);
    expect(result.profile.consumables).toEqual({});
  });

  test('use is refused at count 0, and when there is no live injury', () => {
    const noneOwned = bareProfile({ injury: FRESH, consumables: { medicus_salve: 0 } });
    expect(getConsumableUseEligibility(noneOwned, 'medicus_salve')).toEqual({
      ok: false,
      reason: 'none-owned',
    });
    const noneAtAll = bareProfile({ injury: FRESH });
    expect(consumeItem(noneAtAll, 'field_poultice')).toEqual({ ok: false, reason: 'none-owned' });

    const uninjured = bareProfile({ injury: null, consumables: { field_poultice: 3 } });
    expect(consumeItem(uninjured, 'field_poultice')).toEqual({ ok: false, reason: 'not-injured' });

    // An exhausted (malformed) wound is no wound — the same reading calculateTotalStats makes.
    const exhausted = bareProfile({
      injury: { ...FRESH, fightsRemaining: 0 },
      consumables: { field_poultice: 3 },
    });
    expect(consumeItem(exhausted, 'field_poultice')).toEqual({ ok: false, reason: 'not-injured' });
  });

  test('a refused use leaves gold, counts and injury untouched', () => {
    const uninjured = bareProfile({ gold: 50, consumables: { field_poultice: 3 } });
    const frozen = JSON.stringify(uninjured);
    const result = consumeItem(uninjured, 'field_poultice');
    expect(result.ok).toBe(false);
    expect('profile' in result).toBe(false);
    expect(JSON.stringify(uninjured)).toBe(frozen);
  });

  test('an unknown item is refused', () => {
    expect(consumeItem(bareProfile({ injury: FRESH }), 'philosophers_stone')).toEqual({
      ok: false,
      reason: 'unknown-item',
    });
  });

  test('using spends no gold and buying heals nothing', () => {
    const bought = purchaseConsumable(bareProfile({ gold: 100 }), 'field_poultice');
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    expect(bought.profile.injury).toBeNull();

    const used = consumeItem(bareProfile({ gold: 40, injury: FRESH, consumables: { field_poultice: 1 } }), 'field_poultice');
    expect(used.ok).toBe(true);
    if (!used.ok) return;
    expect(used.profile.gold).toBe(40);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('S6 §E — the effect helper is pure', () => {
  test('it applies the item’s own kind and magnitude', () => {
    const effect = getConsumableById('field_poultice')!.effect;
    expect(applyConsumableEffect(FRESH, effect)).toEqual({ ...FRESH, fightsRemaining: 2 });
    expect(applyConsumableEffect({ ...FRESH, fightsRemaining: 1 }, effect)).toBeNull();
    expect(
      applyConsumableEffect(FRESH, { kind: 'reduce-injury-fights', magnitude: 5 }),
    ).toBeNull();
    expect(applyConsumableEffect(FRESH, { kind: 'clear-injury', magnitude: 0 })).toBeNull();
    expect(applyConsumableEffect(null, effect)).toBeNull();
  });

  test('it never mutates the injury it is handed', () => {
    const injury: PlayerInjury = { ...FRESH };
    const snapshot = JSON.stringify(injury);
    const result = applyConsumableEffect(injury, {
      kind: 'reduce-injury-fights',
      magnitude: 1,
    });
    expect(result).not.toBe(injury);
    expect(JSON.stringify(injury)).toBe(snapshot);
  });

  test('frozen profiles survive every helper', () => {
    const frozen = Object.freeze(
      bareProfile({
        injury: Object.freeze({ ...FRESH }),
        consumables: Object.freeze({ field_poultice: 1 }),
      }),
    );
    expect(() => resolveConsumables(frozen)).not.toThrow();
    expect(() => purchaseConsumable(frozen, 'field_poultice')).not.toThrow();
    expect(() => consumeItem(frozen, 'field_poultice')).not.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('S6 §F — the wiring', () => {
  const APP = code('App.tsx');
  const SHOP = code('components/hub/ShopTab.tsx');
  const STATS = code('components/hub/StatsTab.tsx');
  const CITY = code('components/3d/city/CityHubScene.tsx');
  const HELPER = code('utils/consumables.ts');

  test('App owns the only buy and use writers', () => {
    expect(APP).toContain('const handleBuyConsumable = (item: ConsumableItem) => {');
    expect(APP).toContain('const handleUseConsumable = (itemId: string): boolean => {');
    expect(APP).toContain('purchaseConsumable(profile, item.id)');
    expect(APP).toContain('consumeItem(profile, itemId)');
    // Both reach the shipped save pair and nothing else writes the record.
    expect(APP).toContain('saveProfile(result.profile);');
    expect(HELPER).not.toContain('saveProfile');
    expect(HELPER).not.toContain('localStorage');
  });

  test('the helper module never touches the gear inventory', () => {
    expect(HELPER).not.toContain('inventory');
    expect(HELPER).toContain('consumables: { ...counts');
  });

  test('the Bazaar screen buys through its handler and shows the count owned', () => {
    expect(SHOP).toContain('getConsumableCount(profile, item.id)');
    expect(SHOP).toContain('onBuyConsumable?.(item)');
    expect(SHOP).toContain("const showsConsumables = shopId === 'bazaar';");
    expect(SHOP).not.toContain('saveProfile');
    expect(SHOP).not.toContain('profile.gold -');
  });

  test('the two use surfaces are gated on a live injury and something owned', () => {
    expect(STATS).toContain('ownedConsumables(profile)');
    expect(STATS).toContain('usableConsumables.length > 0');
    expect(STATS).toContain('data-use-consumable={item.id}');
    expect(CITY).toContain('ownedConsumables(playerProfile)');
    expect(CITY).toContain('treatmentConsumables.length > 0');
    expect(CITY).toContain('data-use-consumable={item.id}');
  });

  test('no other file buys or uses a consumable', () => {
    for (const rel of [
      'components/hub/ShopTab.tsx',
      'components/hub/StatsTab.tsx',
      'components/3d/city/CityHubScene.tsx',
      'components/hub/GladiatorSchoolHub.tsx',
    ]) {
      const source = code(rel);
      expect(source).not.toContain('purchaseConsumable');
      expect(source).not.toContain('consumeItem(');
    }
  });
});
