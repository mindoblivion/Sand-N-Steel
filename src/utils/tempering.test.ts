/**
 * P1 — Tempering logic regression tests (pure logic, no UI).
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  `resolveTemperLevel`: a legacy save with no `temper` field, a missing
 *       id and eleven malformed values all resolve to 0 (or to the cap) rather
 *       than throwing — nothing here can break loading an older save;
 *   §B  the cost curve: the two worked examples (starter gladius 50 g →
 *       20 / 40 / 70; Colossus Titan Skullcrusher 920 g → 370 / 735 / 1,290),
 *       every cost a multiple of 5 inside the 40 / 80 / 140 % band, the
 *       accumulated spend, and no cost beyond the cap;
 *   §C  the transaction: a refusal — for each of its four reachable reasons —
 *       returns the caller's own deep-frozen profile, identical, and a success
 *       deducts exactly one level's cost, increments the level once, returns a
 *       new profile and never modifies the owned item objects.  Gold is swept
 *       from 0 upward and can never go negative;
 *   §D  the effective stats: +0 is the base item and +3 is +24 % damage and
 *       +2 strength (weapon) / +3 defense and +1 to the listed bonus (armor),
 *       with the input objects never mutated — and the seam itself:
 *       `calculateTotalStats` reads the temper record, so combat and the hub
 *       see a tempered item without either of them changing;
 *   §E  the sell-refund rule: base `sellPrice` untempered, +25 % of the temper
 *       gold spent once tempered;
 *   §F  the duel seam: `DuelScene` builds the player fighter's loadout from the
 *       effective weapon, so the damage the attack resolution reads is the
 *       tempered one.
 *
 * Run with: `bun test src/utils/tempering.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PlayerProfile, WeaponItem, ArmorItem } from '../types/game';
import { DEFAULT_PLAYER_WEAPON, ALL_WEAPONS, ALL_ARMORS } from '../data/itemsDB';
import { calculateTotalStats } from '../services/storage';
import {
  TEMPER_MAX_LEVEL,
  resolveTemperLevel,
  ownsItem,
  getTemperCost,
  getTemperGoldSpent,
  getEffectiveWeaponStats,
  getEffectiveArmorStats,
  getTemperSellValue,
  getTemperPurchaseEligibility,
  purchaseTemper,
} from './tempering';

// ── Fixtures ────────────────────────────────────────────────────────────────

/** The item every worked example in the brief uses: price 50, sellPrice 20. */
const GLADIUS = DEFAULT_PLAYER_WEAPON;
/** price 920, sellPrice 450, damage 38 / 72, bonusStrength 14. */
const TITAN = ALL_WEAPONS.find((w) => w.id === 'titan_colossus_mace')!;
/** defense 4, bonusDefense 2, price 80, sellPrice 35. */
const MURMILLO = ALL_ARMORS.find((a) => a.id === 'helm_murmillo')!;

/** A profile with the two worked-example items owned, plus an equipped helmet. */
function profile(mutate: (p: PlayerProfile) => void = () => {}): PlayerProfile {
  const p: PlayerProfile = {
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
    equipped: { weapon: GLADIUS, helm: MURMILLO },
    inventory: [GLADIUS, TITAN],
    fightsWon: 0,
    fightsLost: 0,
    peakCrowdHypeOverall: 0,
  };
  mutate(p);
  return p;
}

/**
 * Freeze a value and everything under it.  Writes to a frozen object throw in
 * this module's strict-mode ESM, so a frozen input is a real purity tripwire.
 * The profile's items are *copies*, never the shared `ITEMS_DB` entries.
 */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

/** A profile whose equipped item objects are frozen copies — for purity tests. */
function frozenProfile(mutate: (p: PlayerProfile) => void = () => {}): PlayerProfile {
  return deepFreeze(
    profile((p) => {
      p.equipped = { weapon: { ...GLADIUS }, helm: { ...MURMILLO } };
      p.inventory = [{ ...GLADIUS }, { ...TITAN }];
      mutate(p);
    })
  );
}

// ══════════════════════════════════════════════════════════════════════════
describe('P1 §A — resolveTemperLevel', () => {
  test('a legacy save with no temper field resolves every item to level 0', () => {
    const legacy = profile();
    expect(legacy.temper).toBeUndefined();
    expect(resolveTemperLevel(legacy, GLADIUS.id)).toBe(0);
    expect(resolveTemperLevel(legacy, TITAN.id)).toBe(0);
    expect(resolveTemperLevel(legacy, MURMILLO.id)).toBe(0);
    expect(resolveTemperLevel(legacy, 'no_such_item')).toBe(0);
    // ...and a profile that is not there at all is level 0, not a crash.
    expect(resolveTemperLevel(null, GLADIUS.id)).toBe(0);
    expect(resolveTemperLevel(undefined, GLADIUS.id)).toBe(0);
  });

  test('a stored level is read back per item, and only for that item', () => {
    const p = profile((x) => {
      x.temper = { [GLADIUS.id]: 2, [TITAN.id]: 1 };
    });
    expect(resolveTemperLevel(p, GLADIUS.id)).toBe(2);
    expect(resolveTemperLevel(p, TITAN.id)).toBe(1);
    expect(resolveTemperLevel(p, MURMILLO.id)).toBe(0);
  });

  test('a malformed level resolves into 0 … 3 and never throws', () => {
    const malformed: unknown[] = [-1, -0.5, 0, 9, 2.9, NaN, Infinity, -Infinity, '2', null, {}];
    for (const value of malformed) {
      const p = profile((x) => {
        x.temper = { [GLADIUS.id]: value as number };
      });
      const level = resolveTemperLevel(p, GLADIUS.id);
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(TEMPER_MAX_LEVEL);
      expect(Number.isInteger(level)).toBe(true);
    }
    expect(resolveTemperLevel(profile(), GLADIUS.id)).toBe(0);
    const overCap = profile((x) => {
      x.temper = { [GLADIUS.id]: 9 };
    });
    expect(resolveTemperLevel(overCap, GLADIUS.id)).toBe(TEMPER_MAX_LEVEL);
    const fractional = profile((x) => {
      x.temper = { [GLADIUS.id]: 2.9 };
    });
    expect(resolveTemperLevel(fractional, GLADIUS.id)).toBe(2);
    const wrongShape = profile((x) => {
      x.temper = null as unknown as Record<string, number>;
    });
    expect(resolveTemperLevel(wrongShape, GLADIUS.id)).toBe(0);
  });

  test('ownership covers the equipped slots as well as the inventory', () => {
    const p = profile();
    expect(ownsItem(p, GLADIUS.id)).toBe(true);
    expect(ownsItem(p, TITAN.id)).toBe(true);
    expect(ownsItem(p, MURMILLO.id)).toBe(true); // equipped helmet
    expect(ownsItem(p, ALL_WEAPONS.find((w) => w.id === 'spatha_legion')!.id)).toBe(false);
    expect(ownsItem(null, GLADIUS.id)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P1 §B — the cost curve', () => {
  test('the starter gladius (50 g) costs 20 / 40 / 70', () => {
    expect(getTemperCost(GLADIUS, 0)).toBe(20);
    expect(getTemperCost(GLADIUS, 1)).toBe(40);
    expect(getTemperCost(GLADIUS, 2)).toBe(70);
    // A level at the cap has no next level.
    expect(getTemperCost(GLADIUS, TEMPER_MAX_LEVEL)).toBe(0);
  });

  test('the Colossus Titan Skullcrusher (920 g) costs 370 / 735 / 1,290', () => {
    expect(TITAN.price).toBe(920);
    expect(getTemperCost(TITAN, 0)).toBe(370);
    expect(getTemperCost(TITAN, 1)).toBe(735);
    expect(getTemperCost(TITAN, 2)).toBe(1290);
    expect(getTemperCost(TITAN, TEMPER_MAX_LEVEL)).toBe(0);
  });

  test('every catalogue cost is a multiple of 5 within 2.5 of its ratio of the price', () => {
    const ratios = [0.4, 0.8, 1.4];
    for (const item of [...ALL_WEAPONS, ...ALL_ARMORS]) {
      for (let level = 0; level < TEMPER_MAX_LEVEL; level += 1) {
        const cost = getTemperCost(item, level);
        expect(cost % 5, `${item.id} level ${level + 1}`).toBe(0);
        expect(cost).toBeGreaterThan(0);
        expect(Math.abs(cost - item.price * ratios[level])).toBeLessThanOrEqual(2.5);
      }
    }
  });

  test('the gold already spent accumulates level by level', () => {
    expect(getTemperGoldSpent(GLADIUS, 0)).toBe(0);
    expect(getTemperGoldSpent(GLADIUS, 1)).toBe(20);
    expect(getTemperGoldSpent(GLADIUS, 2)).toBe(60);
    expect(getTemperGoldSpent(GLADIUS, 3)).toBe(130);
    expect(getTemperGoldSpent(TITAN, 3)).toBe(370 + 735 + 1290);
    expect(getTemperGoldSpent(GLADIUS, 7)).toBe(130); // clamped to the cap
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P1 §C — the purchase transaction and its purity', () => {
  test('an unknown item is refused and the frozen profile comes back identical', () => {
    const p = frozenProfile();
    expect(getTemperPurchaseEligibility(p, 'no_such_item')).toEqual({
      ok: false,
      reason: 'unknown-item',
    });
    expect(purchaseTemper(p, 'no_such_item')).toBe(p);
  });

  test('an item the player does not own is refused, identical profile out', () => {
    const notOwned = ALL_WEAPONS.find((w) => w.id === 'spatha_legion')!;
    const p = frozenProfile();
    expect(ownsItem(p, notOwned.id)).toBe(false);
    expect(getTemperPurchaseEligibility(p, notOwned.id)).toEqual({
      ok: false,
      reason: 'not-owned',
    });
    expect(purchaseTemper(p, notOwned.id)).toBe(p);
  });

  test('an item already at +3 is refused, identical profile out', () => {
    const p = frozenProfile((x) => {
      x.temper = { [GLADIUS.id]: TEMPER_MAX_LEVEL };
      x.gold = 5000;
    });
    expect(getTemperPurchaseEligibility(p, GLADIUS.id)).toEqual({
      ok: false,
      reason: 'max-level',
    });
    expect(purchaseTemper(p, GLADIUS.id)).toBe(p);
    expect(p.gold).toBe(5000);
  });

  test('an unaffordable level is refused, identical profile out', () => {
    const p = frozenProfile((x) => {
      x.gold = 19; // one gold short of the gladius' 20 g first level
    });
    expect(getTemperPurchaseEligibility(p, GLADIUS.id)).toEqual({
      ok: false,
      reason: 'insufficient-gold',
    });
    expect(purchaseTemper(p, GLADIUS.id)).toBe(p);
    expect(p.gold).toBe(19);
  });

  test('a missing profile is refused before anything else', () => {
    expect(getTemperPurchaseEligibility(null, GLADIUS.id)).toEqual({
      ok: false,
      reason: 'no-profile',
    });
  });

  test('a purchase deducts exactly one level cost, increments once and returns a new profile', () => {
    const before = profile((x) => {
      x.gold = 500; // enough for the gladius' whole 130 g curve and more
    });
    const after = purchaseTemper(before, GLADIUS.id);

    expect(after).not.toBe(before);
    expect(after.gold).toBe(500 - 20);
    expect(resolveTemperLevel(after, GLADIUS.id)).toBe(1);
    // The caller's own profile did not move.
    expect(before.gold).toBe(500);
    expect(before.temper).toBeUndefined();

    const next = purchaseTemper(after, GLADIUS.id);
    expect(next.gold).toBe(500 - 20 - 40);
    expect(resolveTemperLevel(next, GLADIUS.id)).toBe(2);
    expect(after.gold).toBe(480); // and neither did the previous result

    const last = purchaseTemper(next, GLADIUS.id);
    expect(last.gold).toBe(500 - 130);
    expect(resolveTemperLevel(last, GLADIUS.id)).toBe(TEMPER_MAX_LEVEL);
    // A second item's record never disturbs the first.
    const both = purchaseTemper(last, TITAN.id);
    expect(both.gold).toBe(500 - 130 - 370);
    expect(both.temper).toEqual({ [GLADIUS.id]: 3, [TITAN.id]: 1 });
  });

  test('the owned item objects are never modified — the upgrade lives in the temper record', () => {
    const p = frozenProfile(); // item objects and the profile are frozen
    const after = purchaseTemper(p, MURMILLO.id);

    expect(after.gold).toBe(100 - 30); // 40 % of 80 g, rounded to the nearest 5
    expect(resolveTemperLevel(after, MURMILLO.id)).toBe(1);
    // The very same item object, untouched, is still equipped...
    expect(after.equipped.helm).toBe(p.equipped.helm);
    expect(after.equipped.helm!.defense).toBe(MURMILLO.defense);
    // ...and only the effective-stat view shows the +1 defense.
    expect(getEffectiveArmorStats(after.equipped.helm!, 1).defense).toBe(MURMILLO.defense + 1);
    expect(MURMILLO.defense).toBe(4);
  });

  test('gold can never go negative, at any starting balance, for repeated purchases', () => {
    for (let gold = 0; gold <= 210; gold += 1) {
      let current = profile((x) => {
        x.gold = gold;
      });
      for (let step = 0; step < 5; step += 1) {
        const next = purchaseTemper(current, GLADIUS.id);
        expect(next.gold).toBeGreaterThanOrEqual(0);
        expect(resolveTemperLevel(next, GLADIUS.id)).toBeLessThanOrEqual(TEMPER_MAX_LEVEL);
        // Every purchase that happened charged exactly the level's own cost.
        const spent = gold - next.gold;
        expect(spent).toBe(getTemperGoldSpent(GLADIUS, resolveTemperLevel(next, GLADIUS.id)));
        current = next;
      }
      // Whatever the balance, only the cost curve was ever charged and the
      // balance never went negative; a balance past the full 130 g reaches +3.
      expect(current.gold).toBeGreaterThanOrEqual(0);
      expect(gold - current.gold).toBe(
        getTemperGoldSpent(GLADIUS, resolveTemperLevel(current, GLADIUS.id))
      );
      if (gold >= 130) expect(resolveTemperLevel(current, GLADIUS.id)).toBe(TEMPER_MAX_LEVEL);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P1 §D — effective stats and the stat-aggregation seam', () => {
  test('a weapon at +0 is the base item and at +3 is +24 % damage and +2 strength', () => {
    const base = getEffectiveWeaponStats(GLADIUS, 0);
    expect(base).toEqual(GLADIUS);

    const max = getEffectiveWeaponStats(GLADIUS, TEMPER_MAX_LEVEL);
    expect(max.damageLight).toBe(Math.round(GLADIUS.damageLight * 1.24)); // 14 → 17
    expect(max.damageHeavy).toBe(Math.round(GLADIUS.damageHeavy * 1.24)); // 26 → 32
    expect(max.bonusStrength).toBe(GLADIUS.bonusStrength! + 2); // 0 → 2
    expect(max.bonusDefense).toBe(GLADIUS.bonusDefense); // untouched
    expect(max.staminaLight).toBe(GLADIUS.staminaLight);
    expect(max.id).toBe(GLADIUS.id);
    // The input item is untouched.
    expect(GLADIUS.damageLight).toBe(14);
    expect(GLADIUS.damageHeavy).toBe(26);
    expect(GLADIUS.bonusStrength).toBe(0);
  });

  test('the weapon strength bonus arrives at +2 and again at +3, damage scaling linearly', () => {
    expect(getEffectiveWeaponStats(GLADIUS, 1).bonusStrength).toBe(0);
    expect(getEffectiveWeaponStats(GLADIUS, 2).bonusStrength).toBe(1);
    expect(getEffectiveWeaponStats(GLADIUS, 3).bonusStrength).toBe(2);
    expect(getEffectiveWeaponStats(GLADIUS, 1).damageLight).toBe(Math.round(14 * 1.08));
    expect(getEffectiveWeaponStats(GLADIUS, 2).damageLight).toBe(Math.round(14 * 1.16));
    // ...and on the heavy weapon the base bonus is carried, not replaced.
    const titanMax = getEffectiveWeaponStats(TITAN, 3);
    expect(titanMax.bonusStrength).toBe(TITAN.bonusStrength! + 2);
    expect(titanMax.damageLight).toBe(Math.round(TITAN.damageLight * 1.24));
    expect(titanMax.bonusDefense).toBe(TITAN.bonusDefense);
  });

  test('armour at +0 is the base piece and at +3 is +3 defense and +1 to its listed bonus', () => {
    const base = getEffectiveArmorStats(MURMILLO, 0);
    expect(base).toEqual(MURMILLO);

    const plus1 = getEffectiveArmorStats(MURMILLO, 1);
    expect(plus1.defense).toBe(MURMILLO.defense + 1);
    expect(plus1.bonusDefense).toBe(MURMILLO.bonusDefense);

    const max = getEffectiveArmorStats(MURMILLO, TEMPER_MAX_LEVEL);
    expect(max.defense).toBe(MURMILLO.defense + 3); // 4 → 7
    expect(max.bonusDefense).toBe(MURMILLO.bonusDefense! + 1); // 2 → 3
    expect('bonusStrength' in max).toBe(false); // a temper never invents a bonus
    expect(max.staminaRegenBonus).toBe(MURMILLO.staminaRegenBonus);
    // The input piece is untouched.
    expect(MURMILLO.defense).toBe(4);
    expect(MURMILLO.bonusDefense).toBe(2);
  });

  test('the effective-stat helpers never mutate a frozen input', () => {
    const weapon = deepFreeze({ ...GLADIUS });
    const armor = deepFreeze({ ...MURMILLO });
    expect(() => getEffectiveWeaponStats(weapon, 3)).not.toThrow();
    expect(() => getEffectiveArmorStats(armor, 3)).not.toThrow();
    expect(weapon.damageLight).toBe(14);
    expect(armor.defense).toBe(4);
  });

  test('the seam: calculateTotalStats reads the temper record, so a tempered item counts', () => {
    const plain = profile();
    const base = calculateTotalStats(plain);
    // A legacy save with no temper field, and an empty record, change nothing.
    expect(calculateTotalStats({ ...plain, temper: {} })).toEqual(base);

    const tempered: PlayerProfile = {
      ...plain,
      temper: { [GLADIUS.id]: TEMPER_MAX_LEVEL, [MURMILLO.id]: TEMPER_MAX_LEVEL },
    };
    const after = calculateTotalStats(tempered);

    // Weapon: +2 strength (its bonusDefense is untouched). Helmet: +3 defense
    // and +1 bonusDefense.
    expect(after.strength).toBe(base.strength + 2);
    expect(after.defense).toBe(base.defense + 4);
    expect(after.agility).toBe(base.agility);
    expect(after.stamina).toBe(base.stamina);
    expect(after.healthMax).toBe(80 + after.strength * 4 + after.defense * 3);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P1 §E — the sell-refund rule', () => {
  test('an untempered item sells for exactly its own sellPrice', () => {
    const p = profile();
    expect(getTemperSellValue(p, GLADIUS)).toBe(GLADIUS.sellPrice);
    expect(getTemperSellValue(p, TITAN)).toBe(TITAN.sellPrice);
    expect(getTemperSellValue(p, MURMILLO)).toBe(MURMILLO.sellPrice);
    expect(getTemperSellValue(null, GLADIUS)).toBe(GLADIUS.sellPrice);
  });

  test('a tempered item refunds 25 % of the temper gold spent on it, rounded', () => {
    // Gladius fully tempered: 130 g spent → 32.5 → 33 refunded.
    const gladiusMax = profile((x) => {
      x.temper = { [GLADIUS.id]: 3 };
    });
    expect(getTemperGoldSpent(GLADIUS, 3)).toBe(130);
    expect(getTemperSellValue(gladiusMax, GLADIUS)).toBe(GLADIUS.sellPrice + 33);

    // One level only: 20 g spent → exactly 5 refunded.
    const gladiusPlus1 = profile((x) => {
      x.temper = { [GLADIUS.id]: 1 };
    });
    expect(getTemperSellValue(gladiusPlus1, GLADIUS)).toBe(GLADIUS.sellPrice + 5);

    // The heavy weapon: 2,395 g spent → 598.75 → 599 refunded.
    const titanMax = profile((x) => {
      x.temper = { [TITAN.id]: 3 };
    });
    expect(getTemperGoldSpent(TITAN, 3)).toBe(2395);
    expect(getTemperSellValue(titanMax, TITAN)).toBe(TITAN.sellPrice + 599);

    // A tempered item the profile does not own is still read from its own record.
    expect(getTemperSellValue(profile(), GLADIUS)).toBe(GLADIUS.sellPrice);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P1 §F — the duel reads the effective weapon', () => {
  // A source-level check, the repo's convention for a wiring claim that needs a
  // renderer: the behaviour above is unit-tested, this pins that combat actually
  // consumes it.
  const duelSource = readFileSync(
    fileURLToPath(new URL('../components/duel/DuelScene.tsx', import.meta.url)),
    'utf8'
  );

  test('the player fighter is built from the tempered weapon, never the saved object', () => {
    expect(duelSource).toContain('getEffectiveWeaponStats(');
    expect(duelSource).toContain(
      'resolveTemperLevel(playerProfile, playerProfile.equipped.weapon.id)'
    );
    expect(duelSource).toContain('loadout: { weapon: playerWeapon }');
    expect(duelSource).not.toContain('loadout: { weapon: playerProfile.equipped.weapon }');
  });

  test('attack resolution still reads the fighter loadout, so the tempered damage is what lands', () => {
    expect(duelSource).toContain('attacker.loadout.weapon.damageLight');
    expect(duelSource).toContain('attacker.loadout.weapon.damageHeavy');
  });
});
