/**
 * Living City L4 — the merchant purchase lifecycle and its daily allowance.
 *
 * L3's suite pins the day's offer. This suite drives the REAL purchase
 * transaction (`purchaseStorefrontItem`) over real catalogue items and real
 * profiles, so the guarantees the phase is judged by are measured rather than
 * inferred from a disabled button or a source grep:
 *
 *   §A  the purchase record — a total read of `city.merchantPurchaseDay`, and
 *       the derived "spent today" answer, including malformed and legacy shapes;
 *   §B  a first eligible merchant purchase — gold, inventory and the record in
 *       ONE returned profile, with the day untouched;
 *   §C  the daily allowance — a second merchant purchase the same day refused
 *       with `merchant-daily-limit` and nothing changed; the same call through a
 *       ref-backed gate (App's own wiring) charges once, with a control showing a
 *       stale-base gate WOULD charge twice;
 *   §D  refusals — insufficient gold, an item outside the day's four, an unknown
 *       id and a missing profile all leave every field untouched;
 *   §E  the other storefronts — forge / armorer / market / bazaar neither consume
 *       nor obey the merchant's allowance;
 *   §F  the day — a purchase on a later city day succeeds again, and buying never
 *       advances the clock;
 *   §G  legacy and malformed saves — no `city`, a `string`/`number`/array
 *       container, and junk record values all resolve safely;
 *   §H  atomicity and purity — one profile update, every unrelated field carried
 *       over by identity, the input never mutated;
 *   §I  the wiring — App buys only through the transaction, the shop screen says
 *       the purse is closed, and the module names no storage, timer or clock.
 *
 * Run with: `bun test src/utils/storefrontPurchase.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via `bun test`
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { createNewProfile } from '../services/storage';
import type { CityState, PlayerProfile } from '../types/game';
import { getStorefrontStock, type StorefrontId } from '../data/shops';
import { getItemById } from '../data/itemsDB';
import { resolveCityDay } from './cityClock';
import { isStorefrontItemOnOffer, resolveStorefrontOffer } from './cityRotation';
import {
  DAILY_LIMITED_STOREFRONTS,
  isMerchantPurchaseSpent,
  purchaseStorefrontItem,
  resolveMerchantPurchaseDay,
} from './storefrontPurchase';

const code = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const PURCHASE_SRC = code('./storefrontPurchase.ts');
const APP_SRC = code('../App.tsx');
const SHOP_SRC = code('../components/hub/ShopTab.tsx');

/** A real profile with a purse and, optionally, a city day. */
const profileAt = (gold: number, day?: number): PlayerProfile => {
  const base = createNewProfile('Tester');
  return day === undefined ? { ...base, gold } : { ...base, gold, city: { day } };
};

/** The day-1 merchant window and the first id on it (a real, affordable good). */
const DAY_ONE_OFFER = resolveStorefrontOffer({ city: { day: 1 } }, 'merchant');
const DAY_ONE_ITEM = getItemById(DAY_ONE_OFFER[0])!;
const RICH = 50_000;

/** A merchant good the given day does NOT offer, so the offer gate is exercised. */
const withheldMerchantItem = (day: number): string => {
  const offer = resolveStorefrontOffer({ city: { day } }, 'merchant');
  const withheld = getStorefrontStock('merchant').find((id) => !offer.includes(id));
  if (!withheld) throw new Error('the merchant pool is fully on offer');
  return withheld;
};

/** Every field of a profile, for a "nothing changed" comparison. */
const snapshot = (profile: PlayerProfile): string => JSON.stringify(profile);

/**
 * App's own composition, exercised behaviourally: one latest-profile base, written
 * the instant a purchase commits. `stale` is the control — it keeps the base it
 * was constructed with, which is what reading React state in a handler does.
 */
function createPurchaseGate(initial: PlayerProfile, storefront: StorefrontId, stale = false) {
  let latest = initial;
  const fixed = initial;
  return {
    click(itemId: string) {
      const base = stale ? fixed : latest;
      const result = purchaseStorefrontItem(base, storefront, itemId);
      if (result.ok && !stale) latest = result.profile;
      return result;
    },
    get profile(): PlayerProfile {
      return latest;
    },
  };
}

describe('§A the purchase record', () => {
  test('a profile with no city, and every malformed shape, reads as "no purchase"', () => {
    expect(resolveMerchantPurchaseDay({} as unknown as PlayerProfile)).toBeNull();
    expect(resolveMerchantPurchaseDay(undefined)).toBeNull();
    expect(resolveMerchantPurchaseDay(null)).toBeNull();
    for (const junk of [0, -3, -0.5, NaN, Infinity, '3', true, null, {}, [], 0.4]) {
      const profile = { city: { merchantPurchaseDay: junk } } as unknown as PlayerProfile;
      expect(resolveMerchantPurchaseDay(profile)).toBeNull();
    }
  });

  test('a malformed city container is ignored rather than read into', () => {
    for (const city of ['day5', 5, true, [], null]) {
      const profile = { city } as unknown as PlayerProfile;
      expect(resolveMerchantPurchaseDay(profile)).toBeNull();
      expect(isMerchantPurchaseSpent(profile)).toBe(false);
    }
  });

  test('a stored day round-trips, and only the CURRENT day spends the allowance', () => {
    const at = (city: CityState): PlayerProfile => ({ city } as unknown as PlayerProfile);
    expect(resolveMerchantPurchaseDay(at({ merchantPurchaseDay: 4 }))).toBe(4);
    expect(isMerchantPurchaseSpent(at({ day: 4, merchantPurchaseDay: 4 }))).toBe(true);
    expect(isMerchantPurchaseSpent(at({ day: 5, merchantPurchaseDay: 4 }))).toBe(false);
    expect(isMerchantPurchaseSpent(at({ merchantPurchaseDay: 4 }))).toBe(false);
    expect(isMerchantPurchaseSpent(at({ day: 4 }))).toBe(false);
  });
});

describe('§B the first merchant purchase of the day', () => {
  test('succeeds and records the day, in ONE returned profile', () => {
    const base = profileAt(RICH, 3);
    const result = purchaseStorefrontItem(base, 'merchant', DAY_ONE_ITEM.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.profile.gold).toBe(RICH - DAY_ONE_ITEM.price);
    expect(result.profile.inventory.length).toBe(base.inventory.length + 1);
    expect(result.profile.inventory[result.profile.inventory.length - 1].id).toBe(DAY_ONE_ITEM.id);
    expect(result.profile.city?.merchantPurchaseDay).toBe(3);
    expect(result.profile.city?.day).toBe(3);
    expect(isMerchantPurchaseSpent(result.profile)).toBe(true);
  });

  test('the day-1 window buys on day 1, and the recorded day is the profile\'s own', () => {
    const base = profileAt(RICH, 1);
    const result = purchaseStorefrontItem(base, 'merchant', DAY_ONE_ITEM.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.city?.merchantPurchaseDay).toBe(1);
  });
});

describe('§C the daily allowance', () => {
  test('a second merchant purchase that day is refused, with nothing changed', () => {
    const base = profileAt(RICH, 3);
    const first = purchaseStorefrontItem(base, 'merchant', DAY_ONE_ITEM.id);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const before = snapshot(first.profile);
    const second = purchaseStorefrontItem(first.profile, 'merchant', DAY_ONE_OFFER[1]);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('merchant-daily-limit');
    expect(snapshot(first.profile)).toBe(before);
  });

  test('App\'s ref-backed gate charges once for two clicks in one tick', () => {
    const gate = createPurchaseGate(profileAt(RICH, 3), 'merchant');
    const first = gate.click(DAY_ONE_ITEM.id);
    const second = gate.click(DAY_ONE_OFFER[1]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('merchant-daily-limit');
    expect(gate.profile.gold).toBe(RICH - DAY_ONE_ITEM.price);
    expect(gate.profile.inventory.length).toBe(createNewProfile('Tester').inventory.length + 1);
  });

  test('CONTROL: a stale-base gate would charge twice — which is what the ref prevents', () => {
    const gate = createPurchaseGate(profileAt(RICH, 3), 'merchant', true);
    expect(gate.click(DAY_ONE_ITEM.id).ok).toBe(true);
    expect(gate.click(DAY_ONE_OFFER[1]).ok).toBe(true);
    expect(gate.profile.city?.merchantPurchaseDay).toBeUndefined();
  });

  test('the allowance is the merchant\'s alone', () => {
    expect(DAILY_LIMITED_STOREFRONTS).toEqual(['merchant']);
  });
});

describe('§D refusals leave every field untouched', () => {
  test('insufficient gold does not consume the allowance', () => {
    const base = profileAt(DAY_ONE_ITEM.price - 1, 3);
    const before = snapshot(base);
    const result = purchaseStorefrontItem(base, 'merchant', DAY_ONE_ITEM.id);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('insufficient-gold');
    expect(snapshot(base)).toBe(before);
    expect(isMerchantPurchaseSpent(base)).toBe(false);
  });

  test('an item outside the day\'s four is refused before any mutation', () => {
    const withheld = withheldMerchantItem(3);
    const base = profileAt(RICH, 3);
    const before = snapshot(base);
    expect(isStorefrontItemOnOffer(base, 'merchant', withheld)).toBe(false);

    const result = purchaseStorefrontItem(base, 'merchant', withheld);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('not-on-offer');
    expect(snapshot(base)).toBe(before);
  });

  test('an unknown id and a missing profile are refused', () => {
    const base = profileAt(RICH, 3);
    const before = snapshot(base);
    const unknown = purchaseStorefrontItem(base, 'merchant', 'not_a_real_item');
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.reason).toBe('unknown-item');

    const missing = purchaseStorefrontItem(null, 'merchant', DAY_ONE_ITEM.id);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe('no-profile');
    expect(snapshot(base)).toBe(before);
  });
});

describe('§E non-merchant storefronts behave exactly as before', () => {
  test('they neither consume nor obey the allowance, and stay repeatable', () => {
    for (const storefront of ['forge', 'armorer', 'market'] as StorefrontId[]) {
      const id = getStorefrontStock(storefront)[0];
      const item = getItemById(id)!;
      const base = profileAt(RICH, 3);
      const carried = base.inventory.filter((entry) => entry.id === id).length;

      const first = purchaseStorefrontItem(base, storefront, id);
      expect(first.ok).toBe(true);
      if (!first.ok) continue;
      expect(first.profile.city?.merchantPurchaseDay).toBeUndefined();
      expect(isMerchantPurchaseSpent(first.profile)).toBe(false);

      const second = purchaseStorefrontItem(first.profile, storefront, id);
      expect(second.ok).toBe(true);
      if (!second.ok) continue;
      expect(second.profile.gold).toBe(RICH - item.price * 2);
      expect(second.profile.inventory.filter((entry) => entry.id === id).length).toBe(carried + 2);
    }
    // The bazaar stocks nothing, so anything it is asked for is off its shelf.
    const bazaar = purchaseStorefrontItem(profileAt(RICH, 3), 'bazaar', DAY_ONE_ITEM.id);
    expect(bazaar.ok).toBe(false);
    if (!bazaar.ok) expect(bazaar.reason).toBe('not-on-offer');
  });

  test('a merchant purchase does not close another storefront', () => {
    const base = profileAt(RICH, 3);
    const merchant = purchaseStorefrontItem(base, 'merchant', DAY_ONE_ITEM.id);
    expect(merchant.ok).toBe(true);
    if (!merchant.ok) return;
    const forgeId = getStorefrontStock('forge')[0];
    expect(purchaseStorefrontItem(merchant.profile, 'forge', forgeId).ok).toBe(true);
  });
});

describe('§F the day', () => {
  test('a purchase on a later city day succeeds again', () => {
    const dayThree = purchaseStorefrontItem(profileAt(RICH, 3), 'merchant', DAY_ONE_ITEM.id);
    expect(dayThree.ok).toBe(true);
    if (!dayThree.ok) return;

    // The clock moves on a settled duel (L1), never on a purchase: simulate the
    // resulting save by carrying the record forward with a later day.
    const later = { ...dayThree.profile, city: { ...dayThree.profile.city, day: 4 } };
    expect(isMerchantPurchaseSpent(later)).toBe(false);

    const offerFour = resolveStorefrontOffer(later, 'merchant');
    const again = purchaseStorefrontItem(later, 'merchant', offerFour[0]);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.profile.city?.merchantPurchaseDay).toBe(4);
  });

  test('buying never advances the city day', () => {
    const base = profileAt(RICH, 7);
    const result = purchaseStorefrontItem(base, 'merchant', resolveStorefrontOffer(base, 'merchant')[0]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(resolveCityDay(result.profile)).toBe(7);
    expect(result.profile.city?.day).toBe(7);
  });
});

describe('§G legacy and malformed saves', () => {
  test('a legacy profile without city reads day 1 and records day 1 there', () => {
    const legacy = profileAt(RICH);
    expect(legacy.city).toBeUndefined();
    expect(resolveCityDay(legacy)).toBe(1);
    expect(isMerchantPurchaseSpent(legacy)).toBe(false);

    const result = purchaseStorefrontItem(legacy, 'merchant', DAY_ONE_ITEM.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // No `city.day` is fabricated: only the allowance is added.
    expect(result.profile.city).toEqual({ merchantPurchaseDay: 1 });
    expect(result.profile.city?.day).toBeUndefined();
    expect(resolveCityDay(result.profile)).toBe(1);

    const second = purchaseStorefrontItem(result.profile, 'merchant', DAY_ONE_OFFER[1]);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('merchant-daily-limit');
  });

  test('a malformed record grants the allowance and is replaced by a valid day', () => {
    for (const junk of ['today', true, -2, NaN, {}]) {
      const base = { ...profileAt(RICH), city: { day: 2, merchantPurchaseDay: junk } } as unknown as PlayerProfile;
      expect(isMerchantPurchaseSpent(base)).toBe(false);
      const result = purchaseStorefrontItem(base, 'merchant', resolveStorefrontOffer(base, 'merchant')[0]);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.profile.city?.merchantPurchaseDay).toBe(2);
      expect(result.profile.city?.day).toBe(2);
    }
  });

  test('a malformed city container is not spread into the new profile', () => {
    const base = { ...profileAt(RICH), city: 'day2' as unknown as CityState } as PlayerProfile;
    const result = purchaseStorefrontItem(base, 'merchant', DAY_ONE_ITEM.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.city).toEqual({ merchantPurchaseDay: 1 });
  });
});

describe('§H atomicity and purity', () => {
  test('gold, inventory and the record move together, and nothing else moves', () => {
    const base = profileAt(RICH, 3);
    const result = purchaseStorefrontItem(base, 'merchant', DAY_ONE_ITEM.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Every unrelated field survives by identity — one update, no rebuild.
    expect(result.profile.baseStats).toBe(base.baseStats);
    expect(result.profile.equipped).toBe(base.equipped);
    expect(result.profile.appearance).toBe(base.appearance);
    expect(result.profile.tierProgress).toBe(base.tierProgress);
    expect(result.profile.defeatedOpponentIds).toBe(base.defeatedOpponentIds);
    expect(result.profile.level).toBe(base.level);
    expect(result.profile.fame).toBe(base.fame);
    expect(result.profile.fightsWon).toBe(base.fightsWon);
    expect(result.profile).not.toBe(base);
    expect(result.profile.inventory).not.toBe(base.inventory);
  });

  test('the caller\'s profile is never mutated', () => {
    const base = profileAt(RICH, 3);
    const before = snapshot(base);
    purchaseStorefrontItem(base, 'merchant', DAY_ONE_ITEM.id);
    purchaseStorefrontItem(base, 'merchant', withheldMerchantItem(3));
    expect(snapshot(base)).toBe(before);
  });

  test('an existing `city` member is preserved beside the record', () => {
    const base = { ...profileAt(RICH, 5), city: { day: 5, merchantPurchaseDay: 2 } };
    const result = purchaseStorefrontItem(base, 'merchant', resolveStorefrontOffer(base, 'merchant')[0]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.city).toEqual({ day: 5, merchantPurchaseDay: 5 });
  });
});

describe('§I the wiring', () => {
  test('App buys only through the transaction, and writes its ref before committing', () => {
    expect(APP_SRC).toContain('purchaseStorefrontItem(base, shopId, item.id)');
    expect(APP_SRC).not.toContain('inventory: [...profile.inventory');
    // REBASED (L13A): the ordering is now asserted INSIDE this handler's own body.
    // Several later-hardened handlers (chariot, racing, oath) write the ref the same
    // way, so a file-wide `indexOf` would let one of them satisfy this check for the
    // shop. Slicing first states the property for the handler it is about.
    const body = APP_SRC.slice(APP_SRC.indexOf('const handleBuyItem'), APP_SRC.indexOf('const handleSellItem'));
    const call = body.indexOf('purchaseStorefrontItem(base, shopId, item.id)');
    const base = body.indexOf('const base = profileRef.current');
    const refWrite = body.indexOf('profileRef.current = result.profile');
    const commit = body.indexOf('setProfile(result.profile)', refWrite);
    expect(base).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(base);
    expect(refWrite).toBeGreaterThan(call);
    expect(commit).toBeGreaterThan(refWrite);
    // No separate save, no second persistence path, no clock on this path.
    expect(body).not.toContain('advanceCityDay');
    expect(body.split('saveProfile(').length - 1).toBe(1);
  });

  test('the shop screen renders the closed purse from the same rule', () => {
    expect(SHOP_SRC).toContain('isMerchantPurchaseSpent(profile)');
    expect(SHOP_SRC).toContain('one purchase per city day');
    expect(SHOP_SRC.split('merchantSpentToday').length - 1).toBeGreaterThanOrEqual(4);
  });

  test('the module owns no storage, no timer and no clock of its own', () => {
    for (const forbidden of ['localStorage', 'sessionStorage', 'saveProfile', 'setInterval', 'setTimeout', 'Date.now', 'advanceCityDay', 'Math.random']) {
      expect(PURCHASE_SRC).not.toContain(forbidden);
    }
    expect(PURCHASE_SRC).toContain("from './cityClock'");
    expect(PURCHASE_SRC).toContain("from './cityRotation'");
    expect(PURCHASE_SRC).toContain("from '../data/itemsDB'");
  });
});
