/**
 * P5 — facility progression: three buildings, two levels each, the gates they
 * hold.  Pure data and transactions, NO UI.
 *
 * Design: progression-design.md §3.5 + §4 P5.  The module follows the shape of
 * the shipped `stableProgression.ts` (catalogue → resolve → eligibility →
 * purchase), and this suite mirrors `phaseP4StableProgression.test.ts`:
 *
 *   §A  the catalogue: three buildings, the brief's 500 / 1,200 ladder, two
 *       levels each, bought in order.
 *   §B  the resolver: absent, null, partial and malformed `facilities` shapes
 *       all resolve to level 0, per building, without throwing or repairing.
 *   §C  the purchase: 500 then 1,200, one deduction, refusals that move nothing,
 *       frozen-profile purity and the other two buildings left alone.
 *   §D  the gates: tempering L1 free / L2 workshop L1 / L3 workshop L2; stable
 *       quality grades 2–3 and conditioning levels 4–5 behind the Imperial Stable.
 *   §E  the yard discount: 0 / 10 / 25 % on STAT TRAINING ONLY, and the two
 *       shipped consumers read it.
 *   §F  the gilded gate: the four `_gilded` armour rows appear only at workshop L2.
 *   §G  the profile field + the GC20 corpus: `facilities` is optional, the factory
 *       never writes it, and `facilities-era` carries the shape a purchase writes.
 *   §H  the scope guards: one consumer set, no storage, no second writer.
 *
 * Every price is pinned from the brief as a literal here and is NOT read back from
 * the module's own catalogue, so a wrong catalogue fails instead of agreeing with
 * itself.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PlayerProfile } from '../types/game';
import { createNewProfile } from '../services/storage';
import { ITEMS_DB } from '../data/itemsDB';
import { getStorefrontStock, getVisibleStorefrontStock } from '../data/shops';
import { SAVE_FIXTURES } from './saveFixtures';
import {
  FACILITIES,
  MAX_FACILITY_LEVEL,
  TRAINING_DISCOUNT_BY_YARD,
  defaultFacilitiesState,
  describeFacilityRejection,
  getFacilityLevel,
  getFacilityUpgradeEligibility,
  gildedUnlocked,
  nextFacilityCost,
  nextFacilityLevel,
  purchaseFacility,
  requiredStableForConditioning,
  requiredStableForQuality,
  requiredWorkshopForTemper,
  resolveFacilities,
  trainingCost,
  trainingDiscountRate,
} from './facilityProgression';
import {
  getStableConditioningEligibility,
  getStableQualityEligibility,
  purchaseStableConditioning,
  purchaseStableQuality,
} from './stableProgression';
import { getTemperPurchaseEligibility, purchaseTemper, resolveTemperLevel } from './tempering';

const path = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));
const load = (rel: string): string => readFileSync(path(rel), 'utf8');
const code = (rel: string): string =>
  load(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const SOURCE_DIR = fileURLToPath(new URL('../', import.meta.url));

/**
 * Every non-test source file under `src/` whose code names `token`, as paths
 * relative to `src/`.  Used instead of a hand-written list of neighbours, so a
 * new gold sink that reaches for the helper fails here without this suite having
 * to name it.
 */
const namersOf = (token: string): string[] => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(join(SOURCE_DIR, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(rel, out);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
      const source = readFileSync(join(SOURCE_DIR, rel), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      if (source.includes(token)) out.push(rel);
    }
    return out;
  };
  return walk('').sort();
};

const MODULE = code('./facilityProgression.ts');
const GAME_TYPES = code('../types/game.ts');
const STORAGE = code('../services/storage.ts');
const APP = code('../App.tsx');
const TRAINING_TAB = code('../components/hub/TrainingTab.tsx');
const TEMPERING = code('./tempering.ts');
const STABLE = code('./stableProgression.ts');
const SHOPS = code('../data/shops.ts');

/** A profile of this game's own factory with an explicit purse. */
const profileWith = (
  gold: number,
  facilities?: { stable?: number; yard?: number; workshop?: number }
): PlayerProfile => ({
  ...createNewProfile('Tester'),
  gold,
  ...(facilities ? { facilities } : {}),
});

/** The Quadra — four horses — so conditioning costs the 4× rate. */
const quadraProfile = (
  gold: number,
  facilities?: { stable?: number; yard?: number; workshop?: number },
  stable?: { quality?: number; conditioning?: number }
): PlayerProfile => ({
  ...profileWith(gold, facilities),
  ...(stable ? { stable } : {}),
  racing: { unlocked: [3, 4], selected: 4 },
});

/** Freeze a profile all the way down: any in-place write throws in strict mode. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

const expectOk = (result: ReturnType<typeof purchaseFacility>): PlayerProfile => {
  if (!result.ok) throw new Error(`expected success, got ${result.reason}`);
  return result.profile;
};
const expectRefused = (
  result: ReturnType<typeof purchaseFacility>,
  reason: string
): void => {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.reason).toBe(reason as never);
};

// ══════════════════════════════════════════════════════════════════════════
describe('P5 §A — the catalogue', () => {
  test('the three buildings exist, in order, with their brief prices', () => {
    expect(FACILITIES.map((facility) => facility.id)).toEqual(['stable', 'yard', 'workshop']);
    expect(FACILITIES.map((facility) => facility.name)).toEqual([
      'Imperial Stable',
      'Ludus Training Yard',
      'Smithing Workshop',
    ]);

    const prices = Object.fromEntries(
      FACILITIES.map((facility) => [
        facility.id,
        facility.levels.map((level) => `L${level.level} ${level.name} ${level.price}`),
      ])
    );
    expect(prices.stable).toEqual(['L1 Stone Stalls 500', 'L2 Stud & Training Paddock 1200']);
    expect(prices.yard).toEqual(["L1 Doctore's Yard 500", "L2 Master's Ludus 1200"]);
    // The workshop's names/prices are the documented placeholder (same ladder).
    expect(prices.workshop).toEqual(["L1 Smith's Bench 500", 'L2 Master Forge 1200']);
  });

  test('every building has exactly two rungs, 1 then 2, ascending in price', () => {
    for (const facility of FACILITIES) {
      expect(facility.levels.map((level) => level.level)).toEqual([1, 2]);
      expect(facility.levels[0].price).toBe(500);
      expect(facility.levels[1].price).toBe(1200);
    }
    expect(MAX_FACILITY_LEVEL).toBe(2);
  });

  test('nothing is built at the start, and no building can be selected', () => {
    expect(defaultFacilitiesState()).toEqual({ stable: 0, yard: 0, workshop: 0 });
    expect(MODULE).not.toMatch(/export function select/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P5 §B — the resolver: malformed fields land on nothing built', () => {
  test('a legacy profile with no facilities field resolves to three level-0 buildings', () => {
    const fresh = createNewProfile('Legacy');
    expect('facilities' in fresh).toBe(false);
    expect(resolveFacilities(fresh)).toEqual({ stable: 0, yard: 0, workshop: 0 });
  });

  test('no profile at all resolves to the defaults instead of throwing', () => {
    expect(resolveFacilities(null)).toEqual(defaultFacilitiesState());
    expect(resolveFacilities(undefined)).toEqual(defaultFacilitiesState());
  });

  test('every malformed facilities shape resolves to the defaults', () => {
    const malformed: unknown[] = [
      null,
      'stable',
      42,
      [],
      [{ stable: 2 }],
      () => ({ stable: 2 }),
    ];
    for (const facilities of malformed) {
      const profile = { ...createNewProfile('Malformed'), facilities } as unknown as PlayerProfile;
      expect(resolveFacilities(profile), JSON.stringify(facilities)).toEqual({
        stable: 0,
        yard: 0,
        workshop: 0,
      });
    }
  });

  test('each building resolves independently, so junk in one keeps the others', () => {
    const profile = {
      ...createNewProfile('Partial'),
      facilities: { stable: 2, yard: -1, workshop: 'two' },
    } as unknown as PlayerProfile;
    expect(resolveFacilities(profile)).toEqual({ stable: 2, yard: 0, workshop: 0 });

    const fractions = {
      ...createNewProfile('Fractions'),
      facilities: { stable: 1.5, yard: 9, workshop: 1 },
    } as unknown as PlayerProfile;
    expect(resolveFacilities(fractions)).toEqual({ stable: 0, yard: 0, workshop: 1 });
  });

  test('a well-formed field resolves exactly as stored, at both ends', () => {
    for (const level of [0, 1, 2]) {
      const profile = profileWith(0, { stable: level, yard: level, workshop: level });
      expect(resolveFacilities(profile)).toEqual({ stable: level, yard: level, workshop: level });
    }
  });

  test('resolving a frozen profile neither throws nor mutates it, and returns a fresh object', () => {
    const frozen = deepFreeze(profileWith(0, { stable: 1, workshop: 2 }));
    const before = JSON.stringify(frozen);
    const resolved = resolveFacilities(frozen);
    expect(JSON.stringify(frozen)).toBe(before);
    expect(resolved).not.toBe(frozen.facilities);
    resolved.stable = 2;
    expect(resolveFacilities(frozen).stable).toBe(1);
  });

  test('an unknown building id reads as level 0, not as a guess', () => {
    const profile = profileWith(0, { stable: 2 });
    expect(getFacilityLevel(profile, 'stables')).toBe(0);
    expect(getFacilityLevel(profile, null)).toBe(0);
    expect(getFacilityLevel(profile, 2)).toBe(0);
    expect(getFacilityLevel(profile, 'stable')).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P5 §C — the purchase is in order, once, with gold', () => {
  test('L1 costs exactly 500 and L2 exactly 1,200, one rung at a time', () => {
    const start = profileWith(2000);
    expect(nextFacilityLevel(start, 'stable')?.level).toBe(1);
    expect(nextFacilityCost(start, 'stable')).toBe(500);

    const l1 = expectOk(purchaseFacility(start, 'stable'));
    expect(l1.gold).toBe(1500);
    expect(l1.facilities).toEqual({ stable: 1, yard: 0, workshop: 0 });
    expect(nextFacilityLevel(l1, 'stable')?.level).toBe(2);
    expect(nextFacilityCost(l1, 'stable')).toBe(1200);

    const l2 = expectOk(purchaseFacility(l1, 'stable'));
    expect(l2.gold).toBe(300);
    expect(l2.facilities).toEqual({ stable: 2, yard: 0, workshop: 0 });
    expect(nextFacilityLevel(l2, 'stable')).toBeUndefined();
    expect(nextFacilityCost(l2, 'stable')).toBe(0);
  });

  test('the three buildings are bought independently', () => {
    let profile = profileWith(6000);
    for (const id of ['stable', 'yard', 'workshop'] as const) {
      profile = expectOk(purchaseFacility(profile, id));
      profile = expectOk(purchaseFacility(profile, id));
    }
    expect(profile.facilities).toEqual({ stable: 2, yard: 2, workshop: 2 });
    expect(profile.gold).toBe(6000 - 5100);
  });

  test('buying one building leaves the other two exactly where they were', () => {
    const start = profileWith(3000, { yard: 1, workshop: 2 });
    const after = expectOk(purchaseFacility(start, 'stable'));
    expect(after.facilities).toEqual({ stable: 1, yard: 1, workshop: 2 });
  });

  test('the cap refuses a third level, whatever is asked', () => {
    const maxed = profileWith(9000, { stable: 2 });
    expectRefused(purchaseFacility(maxed, 'stable'), 'max-level');
    expect(getFacilityUpgradeEligibility(maxed, 'stable')).toEqual({
      ok: false,
      reason: 'max-level',
    });
  });

  test('a purse that cannot cover the rung is refused before any arithmetic', () => {
    for (const gold of [0, 499, 1199]) {
      const profile = profileWith(gold, { stable: gold >= 1199 ? 1 : 0 });
      expectRefused(purchaseFacility(profile, 'stable'), 'insufficient-gold');
      expect(profile.gold).toBe(gold);
    }
    // A malformed balance buys nothing and is never rewritten.
    for (const gold of [NaN, -1, Infinity]) {
      const broken = profileWith(0);
      (broken as { gold: number }).gold = gold;
      expectRefused(purchaseFacility(broken, 'stable'), 'insufficient-gold');
      expect(broken.gold).toBe(gold);
    }
  });

  test('exactly enough gold pays to exactly zero, and never below it', () => {
    const exact = expectOk(purchaseFacility(profileWith(500), 'yard'));
    expect(exact.gold).toBe(0);
    expect(exact.facilities).toEqual({ stable: 0, yard: 1, workshop: 0 });
  });

  test('unknown buildings and a missing profile are refused without a profile', () => {
    for (const id of ['stables', '', null, undefined, 7, {}]) {
      expectRefused(purchaseFacility(profileWith(9000), id), 'unknown-facility');
    }
    expectRefused(purchaseFacility(null, 'stable'), 'no-profile');
    expectRefused(purchaseFacility(undefined, 'stable'), 'no-profile');
  });

  test('the eligibility read-out matches what the purchase then does', () => {
    const cases: Array<[PlayerProfile, unknown]> = [
      [profileWith(9000), 'stable'],
      [profileWith(500), 'stable'],
      [profileWith(499), 'stable'],
      [profileWith(9000, { stable: 1 }), 'stable'],
      [profileWith(9000, { stable: 2 }), 'stable'],
      [profileWith(9000), 'not-a-building'],
    ];
    for (const [profile, id] of cases) {
      const eligibility = getFacilityUpgradeEligibility(profile, id);
      const purchase = purchaseFacility(profile, id);
      expect(purchase.ok, String(id)).toBe(eligibility.ok);
      if (!eligibility.ok && !purchase.ok) expect(purchase.reason).toBe(eligibility.reason);
    }
  });

  test('every refusal has a player-facing explanation', () => {
    for (const reason of [
      'no-profile',
      'unknown-facility',
      'max-level',
      'insufficient-gold',
    ] as const) {
      expect(describeFacilityRejection(reason).length).toBeGreaterThan(0);
    }
  });

  test('a refused purchase touches nothing, and a success never mutates its input', () => {
    const frozen = deepFreeze(profileWith(5000, { yard: 1 }));
    const before = JSON.stringify(frozen);
    const bought = expectOk(purchaseFacility(frozen, 'workshop'));
    expect(JSON.stringify(frozen)).toBe(before);
    expect(bought.gold).toBe(4500);
    expect(bought.facilities).toEqual({ stable: 0, yard: 1, workshop: 1 });
    expect(bought.facilities).not.toBe(frozen.facilities);

    const refused = purchaseFacility(frozen, 'nope');
    expect(refused.ok).toBe(false);
    expect(JSON.stringify(frozen)).toBe(before);
  });

  test('the purchase writes only the facilities field and the purse', () => {
    const start = profileWith(5000);
    const after = expectOk(purchaseFacility(start, 'stable'));
    const { gold: _g, facilities: _f, ...rest } = after;
    const { gold: _bg, ...beforeRest } = start;
    expect(JSON.stringify(rest)).toBe(JSON.stringify(beforeRest));
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P5 §D — the gates the buildings hold', () => {
  test('the requirement tables are the brief\'s: L2→1, L3→2; grades 2→1, 3→2; levels 4→1, 5→2', () => {
    expect([0, 1, 2, 3, 4].map(requiredWorkshopForTemper)).toEqual([0, 0, 1, 2, 0]);
    expect([0, 1, 2, 3, 4].map(requiredStableForQuality)).toEqual([0, 0, 1, 2, 0]);
    expect([0, 1, 2, 3, 4, 5, 6].map(requiredStableForConditioning)).toEqual([
      0, 0, 0, 0, 1, 2, 0,
    ]);
  });

  test('tempering: level 1 is free, level 2 needs workshop L1, level 3 needs L2', () => {
    const gladius = createNewProfile('Smith').equipped.weapon.id;

    const shopless = profileWith(1000);
    expect(getTemperPurchaseEligibility(shopless, gladius)).toEqual({ ok: true });
    const l1 = purchaseTemper(shopless, gladius);
    expect(resolveTemperLevel(l1, gladius)).toBe(1);

    // The bench is not built: the second rung is refused and nothing is charged.
    expect(getTemperPurchaseEligibility(l1, gladius)).toEqual({
      ok: false,
      reason: 'facility-required',
    });
    expect(purchaseTemper(l1, gladius)).toBe(l1);
    expect(l1.gold).toBe(980);

    const bench = { ...l1, facilities: { workshop: 1 } } as PlayerProfile;
    const l2 = purchaseTemper(bench, gladius);
    expect(resolveTemperLevel(l2, gladius)).toBe(2);

    // Only the master forge tempers the third rung.
    expect(getTemperPurchaseEligibility(l2, gladius)).toEqual({
      ok: false,
      reason: 'facility-required',
    });
    const forge = { ...l2, facilities: { workshop: 2 } } as PlayerProfile;
    const l3 = purchaseTemper(forge, gladius);
    expect(resolveTemperLevel(l3, gladius)).toBe(3);
    expect(l3.gold).toBe(980 - 40 - 70);
  });

  test('stable quality: Racing Bred needs stable L1 and Champion Bloodline L2', () => {
    const racingBred = quadraProfile(9000, undefined, { quality: 1 });
    expect(getStableQualityEligibility(racingBred, 2)).toEqual({
      ok: false,
      reason: 'facility-required',
    });
    const refused = purchaseStableQuality(racingBred, 2);
    expect(refused.ok).toBe(false);
    expect(racingBred.gold).toBe(9000);

    const stalls = quadraProfile(9000, { stable: 1 }, { quality: 1 });
    expect(getStableQualityEligibility(stalls, 2)).toEqual({ ok: true });
    const bought = purchaseStableQuality(stalls, 2);
    if (!bought.ok) throw new Error(bought.reason);
    expect(bought.profile.stable).toEqual({ quality: 2, conditioning: 0 });

    // The champion grade waits for the paddock.
    expect(getStableQualityEligibility(bought.profile, 3)).toEqual({
      ok: false,
      reason: 'facility-required',
    });
    const paddock = { ...bought.profile, facilities: { stable: 2 } };
    expect(purchaseStableQuality(paddock, 3).ok).toBe(true);
  });

  test('conditioning: level 4 needs stable L1 and level 5 needs L2', () => {
    const lvl3 = quadraProfile(9000, undefined, { conditioning: 3 });
    expect(getStableConditioningEligibility(lvl3, 4)).toEqual({
      ok: false,
      reason: 'facility-required',
    });
    expect(purchaseStableConditioning(lvl3, 4).ok).toBe(false);

    const stalls = quadraProfile(9000, { stable: 1 }, { conditioning: 3 });
    expect(getStableConditioningEligibility(stalls, 4)).toEqual({ ok: true });
    const l4 = purchaseStableConditioning(stalls, 4);
    if (!l4.ok) throw new Error(l4.reason);
    expect(l4.profile.stable).toEqual({ quality: 0, conditioning: 4 });

    expect(getStableConditioningEligibility(l4.profile, 5)).toEqual({
      ok: false,
      reason: 'facility-required',
    });
    const paddock = { ...l4.profile, facilities: { stable: 2 } };
    expect(purchaseStableConditioning(paddock, 5).ok).toBe(true);
  });

  test('a gate is a prerequisite, so it outranks the purse and never charges', () => {
    const poorAndShopless = quadraProfile(0, undefined, { quality: 1 });
    // Order first, facility second, gold last: the facility is what stops it.
    expect(getStableQualityEligibility(poorAndShopless, 2)).toEqual({
      ok: false,
      reason: 'facility-required',
    });
    const temperPoor = profileWith(0);
    const gladius = temperPoor.equipped.weapon.id;
    const l1 = purchaseTemper(temperPoor, gladius); // 20 g on a 0 g purse? no — refused
    expect(l1).toBe(temperPoor);
  });

  test('a legacy save (no facilities) is simply unbuilt, never repaired', () => {
    const legacy = { ...createNewProfile('Legacy'), gold: 9000 };
    const legacyGladius = legacy.equipped.weapon.id;
    const one = purchaseTemper(legacy, legacyGladius);
    expect(resolveTemperLevel(one, legacyGladius)).toBe(1);
    expect('facilities' in legacy).toBe(false);
    expect('facilities' in purchaseTemper(one, legacyGladius)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P5 §E — the yard discounts stat training, and only stat training', () => {
  test('the discount rungs are 0 / 10 / 25 %', () => {
    expect(TRAINING_DISCOUNT_BY_YARD).toEqual([0, 0.1, 0.25]);
    expect(trainingDiscountRate(profileWith(0))).toBe(0);
    expect(trainingDiscountRate(profileWith(0, { yard: 1 }))).toBe(0.1);
    expect(trainingDiscountRate(profileWith(0, { yard: 2 }))).toBe(0.25);
  });

  test('the cost is the base price less the discount, rounded to gold', () => {
    // Level 1 trains for 25 g; level 4 for 100 g.
    expect(trainingCost(profileWith(0), 25)).toBe(25);
    expect(trainingCost(profileWith(0, { yard: 1 }), 25)).toBe(22); // 25 - round(2.5)
    expect(trainingCost(profileWith(0, { yard: 2 }), 25)).toBe(19); // 25 - round(6.25)
    expect(trainingCost(profileWith(0, { yard: 1 }), 100)).toBe(90);
    expect(trainingCost(profileWith(0, { yard: 2 }), 100)).toBe(75);
  });

  test('a nonsense base cost is 0 and the discount can never go negative', () => {
    for (const base of [0, -5, NaN, Infinity]) {
      expect(trainingCost(profileWith(0, { yard: 2 }), base)).toBe(0);
    }
    expect(trainingCost(profileWith(0, { yard: 2 }), 1)).toBe(1);
  });

  test('the two shipped consumers read the helper, and nothing else charges it', () => {
    expect(APP).toContain('trainingCost(profile, 25 * profile.level)');
    expect(TRAINING_TAB).toContain('trainingCost(profile, 25 * profile.level)');
    // The other gold sinks keep their own price: the helper's only namers in the
    // whole source tree are the module that defines it and the two surfaces that
    // charge stat training.
    expect(namersOf('trainingCost')).toEqual([
      'App.tsx',
      'components/hub/TrainingTab.tsx',
      'utils/facilityProgression.ts',
    ]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P5 §F — gilded armour appears only at workshop L2', () => {
  const gildedIds = ITEMS_DB.filter((item) => item.id.endsWith('_gilded')).map((item) => item.id);

  test('the gate has four §3.1 rows to hold back', () => {
    expect(gildedIds).toEqual([
      'arms_galerus_gilded',
      'legs_greaves_gilded',
      'helm_champion_gilded',
      'chest_champion_gilded',
    ]);
    expect(gildedUnlocked(profileWith(0, { workshop: 1 }))).toBe(false);
    expect(gildedUnlocked(profileWith(0, { workshop: 2 }))).toBe(true);
    expect(gildedUnlocked(null)).toBe(false);
  });

  test('without the master forge the gilded rows are absent from every stock', () => {
    for (const id of ['armorer', 'merchant', 'market'] as const) {
      const visible = getVisibleStorefrontStock(id, profileWith(0));
      for (const gilded of gildedIds) expect(visible, `${id} ${gilded}`).not.toContain(gilded);
    }
  });

  test('with the master forge the stock is exactly the ungated catalogue', () => {
    const forgeProfile = profileWith(0, { workshop: 2 });
    for (const id of ['forge', 'armorer', 'merchant', 'market'] as const) {
      expect(getVisibleStorefrontStock(id, forgeProfile)).toEqual(getStorefrontStock(id));
    }
    expect(getVisibleStorefrontStock('armorer', forgeProfile)).toEqual(
      expect.arrayContaining(gildedIds)
    );
  });

  test('nothing but the gilded rows is withheld, and the list is fresh each call', () => {
    const plain = getStorefrontStock('market').filter((id) => !gildedIds.includes(id));
    const visible = getVisibleStorefrontStock('market', profileWith(0));
    expect(visible).toEqual(plain);
    expect(getVisibleStorefrontStock('market', profileWith(0))).not.toBe(visible);

    // The other legendary goods are not gated: a gilded id is what is special.
    expect(visible).toContain('titan_colossus_mace');
    expect(visible).toContain('trident_retarius');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P5 §G — the profile field and the GC20 corpus', () => {
  test('the type declares facilities optional, with each building optional and numeric', () => {
    expect(GAME_TYPES).toContain('facilities?: { stable?: number; yard?: number; workshop?: number };');
    const block = GAME_TYPES.slice(GAME_TYPES.indexOf('export interface PlayerProfile {'));
    expect(block).toContain('facilities?:');
  });

  test('the factory never writes the field, and no migration exists', () => {
    const factory = STORAGE.slice(STORAGE.indexOf('export function createNewProfile'));
    expect(factory.slice(0, factory.indexOf('\n}'))).not.toContain('facilities');
    expect(GAME_TYPES).not.toContain('migrateFacilities');
  });

  test('the facilities-era fixture is registered and resolves as stored', () => {
    const fixture = SAVE_FIXTURES.find((entry) => entry.id === 'facilities-era');
    expect(fixture).toBeDefined();
    expect(fixture!.file).toBe('facilitiesEraProfile.json');
    const raw = fixture!.profile as PlayerProfile & {
      facilities?: { stable?: number; yard?: number; workshop?: number };
    };
    expect(raw.facilities).toEqual({ stable: 2, yard: 2, workshop: 2 });
    expect(Object.keys(raw.facilities!).sort()).toEqual(['stable', 'workshop', 'yard']);
    expect(resolveFacilities(fixture!.profile)).toEqual({ stable: 2, yard: 2, workshop: 2 });
    expect(raw.gold).toBe(900);
    expect(fixture!.covers.join(' ')).toContain('facilities');
  });

  test('the corpus still holds the legacy shape: fixtures and the factory omit facilities', () => {
    const omitting = SAVE_FIXTURES.filter(
      (entry) => !('facilities' in (entry.profile as unknown as Record<string, unknown>))
    );
    expect(omitting.length).toBeGreaterThan(0);
    expect(omitting.some((entry) => entry.id === 'current-fresh')).toBe(true);
    expect(Object.keys(createNewProfile('Corpus Fresh'))).not.toContain('facilities');
  });

  test('resolving the whole corpus never throws and never mutates a fixture', () => {
    for (const fixture of SAVE_FIXTURES) {
      const before = JSON.stringify(fixture.profile);
      const state = resolveFacilities(fixture.profile);
      for (const value of Object.values(state)) expect(Number.isInteger(value), fixture.id).toBe(true);
      expect(JSON.stringify(fixture.profile), fixture.id).toBe(before);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P5 §H — the scope guards', () => {
  test('the module imports only the profile type: no storage, no second save path', () => {
    const imports = [...MODULE.matchAll(/^import .*?from '(.+?)';$/gm)].map((match) => match[1]);
    expect(imports).toEqual(['../types/game']);
    expect(MODULE).not.toContain('localStorage');
    expect(MODULE).not.toContain('saveProfile');
  });

  test('the module is the only writer of the field and the only home of the requirement tables', () => {
    for (const file of [TEMPERING, STABLE, SHOPS]) {
      expect(file).not.toMatch(/facilities:\s*\{/);
      // The owners READ the requirement helpers; none of them defines a table.
      expect(file).not.toContain('export function requiredWorkshopForTemper');
      expect(file).not.toContain('export function requiredStableForQuality');
      expect(file).not.toContain('export function requiredStableForConditioning');
    }
    const writes = [...MODULE.matchAll(/facilities:\s*\{([^}]*)\}/g)].map((match) => match[1]);
    expect(writes.length).toBe(1);
    expect(writes[0]).toContain('...resolveFacilities(profile)');
  });

  test('the gates are READ by their owners and restated nowhere', () => {
    expect(TEMPERING).toContain("getFacilityLevel(profile, 'workshop')");
    expect(STABLE).toContain("getFacilityLevel(profile, 'stable')");
    expect(SHOPS).toContain('gildedUnlocked(profile)');
    // No price or requirement literal is duplicated in a gate reader.
    for (const token of ['500', '1200']) {
      expect(TEMPERING).not.toContain(token);
      expect(STABLE).not.toContain(token);
    }
  });

  test('the facility purchase is called by no UI: there is no facility screen yet', () => {
    for (const file of [APP, TRAINING_TAB, SHOPS]) {
      expect(file).not.toContain('purchaseFacility');
      expect(file).not.toContain('nextFacilityCost');
    }
  });
});
