/**
 * Living City L3 — the merchant's daily stock, end to end.
 *
 * L2 (`cityRotation.test.ts`) pins the rotation arithmetic. This suite pins the
 * things L3 depends on, in the repo's two registers (behaviour for pure logic,
 * ordered source assertions for the React wiring this repo has no DOM renderer
 * for):
 *
 *   §A  catalogue safety — every id a day offers is a real `ITEMS_DB` item the
 *       storefront itself stocks, the pool's ids are unique, and the one id the
 *       previous report misspelled (`arms_galerus_rilded`) does not exist;
 *   §B  the window's shape — exactly `MERCHANT_ROTATION_SLOTS` distinct items
 *       whenever the pool is at least that big, stable across calls, in
 *       `ITEMS_DB` order, never an invalid index;
 *   §C  the day — a legacy profile reads day 1 and malformed days resolve
 *       exactly as `resolveCityDay` resolves them;
 *   §D  the non-merchant storefronts — forge, armorer and market keep their
 *       whole stock on every day, the bazaar stays empty;
 *   §E  short and reordered catalogues behave safely (`selectDailyWindow`), the
 *       one path a real catalogue cannot exercise here;
 *   §F  the shared boundary — the screen's list and the purchase gate are the
 *       same list, an eligible-but-not-selected merchant item is refused, and
 *       nothing on either path advances the city day.
 *
 * Run with: `bun test src/utils/cityRotationL3.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via `bun test`
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { ITEMS_DB, getItemById } from '../data/itemsDB';
import { getStorefrontStock, type StorefrontId } from '../data/shops';
import { normalizeCityDay, resolveCityDay } from './cityClock';
import {
  MERCHANT_ROTATION_SLOTS,
  isStorefrontItemOnOffer,
  resolveCityRotation,
  resolveStorefrontOffer,
  rotateStorefrontStock,
  selectDailyWindow,
} from './cityRotation';

const load = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const SHOP_SRC = load('../components/hub/ShopTab.tsx');
const APP_SRC = load('../App.tsx');
const PURCHASE_SRC = load('./storefrontPurchase.ts');

const MERCHANT_POOL = getStorefrontStock('merchant');

/** The measured day-1 window (the L2 suite pins the same four ids). */
const MERCHANT_DAY_ONE = [
  'helm_centurion',
  'chest_golden_muscled',
  'arms_manica_steel',
  'arms_galerus_gilded',
];

const STOREFRONTS: StorefrontId[] = ['forge', 'armorer', 'bazaar', 'merchant', 'market'];

/** An eligible merchant good the given day does NOT offer. */
const withheldMerchantItem = (day: number): string => {
  const offer = new Set(rotateStorefrontStock('merchant', day));
  const withheld = MERCHANT_POOL.find((id) => !offer.has(id));
  expect(withheld).toBeTruthy();
  return withheld as string;
};

// ── §A. Catalogue safety ──────────────────────────────────────────────────

describe('§A — every rotated id is a real, stocked, uniquely-identified item', () => {
  test('the gilded galerus exists under its shipped id, and the misspelling does not', () => {
    const gilded = getItemById('arms_galerus_gilded');
    expect(gilded).toBeTruthy();
    expect(gilded!.rarity).toBe('legendary');

    // The name "arms_galerus_rilded" appears in the L2 report; it is not an id.
    expect(getItemById('arms_galerus_rilded')).toBeUndefined();
    for (const item of ITEMS_DB) expect(item.id).not.toContain('rilded');
    for (let day = 1; day <= 40; day += 1) {
      expect(rotateStorefrontStock('merchant', day)).not.toContain('arms_galerus_rilded');
    }
  });

  test('every day’s merchant ids exist in ITEMS_DB and are stocked by the merchant', () => {
    const eligible = new Set(MERCHANT_POOL);
    for (let day = 1; day <= 200; day += 1) {
      for (const id of rotateStorefrontStock('merchant', day)) {
        expect(eligible.has(id)).toBe(true);
        expect(getItemById(id)).toBeTruthy();
      }
    }
  });

  test('the catalogue and every storefront pool carry unique ids', () => {
    const catalogueIds = ITEMS_DB.map((item) => item.id);
    expect(new Set(catalogueIds).size).toBe(catalogueIds.length);

    for (const id of STOREFRONTS) {
      const stock = getStorefrontStock(id);
      expect(new Set(stock).size).toBe(stock.length);
    }
  });
});

// ── §B. The window's shape ────────────────────────────────────────────────

describe('§B — four distinct items, stable and in catalogue order', () => {
  test('four unique merchant items whenever the pool is at least four', () => {
    expect(MERCHANT_POOL.length).toBeGreaterThanOrEqual(MERCHANT_ROTATION_SLOTS);
    for (let day = 1; day <= 200; day += 1) {
      const window = rotateStorefrontStock('merchant', day);
      expect(window).toHaveLength(MERCHANT_ROTATION_SLOTS);
      expect(new Set(window).size).toBe(MERCHANT_ROTATION_SLOTS);
    }
  });

  test('repeated calls and a fresh resolution are stable', () => {
    for (const day of [1, 2, 7, 33, 500]) {
      expect(rotateStorefrontStock('merchant', day)).toEqual(
        rotateStorefrontStock('merchant', day)
      );
      expect(resolveCityRotation({ city: { day } }).storefronts.merchant.itemIds).toEqual(
        rotateStorefrontStock('merchant', day)
      );
    }
  });

  test('a window stays in catalogue order and never names an invalid index', () => {
    for (let day = 1; day <= 60; day += 1) {
      const indices = rotateStorefrontStock('merchant', day).map((id) => MERCHANT_POOL.indexOf(id));
      expect([...indices].sort((a, b) => a - b)).toEqual(indices);
      for (const index of indices) expect(index).toBeGreaterThanOrEqual(0);
      for (const index of indices) expect(index).toBeLessThan(MERCHANT_POOL.length);
    }
  });

  test('day one is still the measured window', () => {
    expect(rotateStorefrontStock('merchant', 1)).toEqual(MERCHANT_DAY_ONE);
  });
});

// ── §C. The day comes from the one clock ──────────────────────────────────

describe('§C — the profile’s city day is the only day source', () => {
  test('a legacy profile with no city.day gets day-one stock', () => {
    const legacy = { gold: 100 } as Record<string, unknown>;
    expect(resolveCityDay(legacy)).toBe(1);
    expect(resolveStorefrontOffer(legacy, 'merchant')).toEqual(MERCHANT_DAY_ONE);
    expect(resolveCityRotation(legacy).storefronts.merchant.itemIds).toEqual(MERCHANT_DAY_ONE);
  });

  test('missing and malformed day values resolve through resolveCityDay', () => {
    const malformed: unknown[] = [undefined, null, '7', true, NaN, Infinity, 0, -7, -0.5, {}, []];

    for (const day of malformed) {
      const expected = normalizeCityDay(day);
      const offer = resolveStorefrontOffer({ city: { day: day as number } }, 'merchant');
      expect(offer).toEqual(rotateStorefrontStock('merchant', expected));
    }

    // A fractional day floors, exactly as the clock floors it.
    expect(resolveStorefrontOffer({ city: { day: 3.7 } }, 'merchant')).toEqual(
      rotateStorefrontStock('merchant', 3)
    );
    // A malformed city container is ignored rather than read.
    for (const city of ['day 5', 5, [5], true]) {
      expect(resolveStorefrontOffer({ city: city as never }, 'merchant')).toEqual(
        MERCHANT_DAY_ONE
      );
    }
  });

  test('advancing the day changes the stock only through the resolver', () => {
    const dayOne = resolveStorefrontOffer({ city: { day: 1 } }, 'merchant');
    const dayTwo = resolveStorefrontOffer({ city: { day: 2 } }, 'merchant');
    expect(dayOne).toEqual(MERCHANT_DAY_ONE);
    expect(dayTwo).toEqual(rotateStorefrontStock('merchant', 2));
    expect(dayTwo).not.toEqual(dayOne);
  });
});

// ── §D. Non-merchant storefronts are untouched ────────────────────────────

describe('§D — forge, armorer and market keep their whole stock every day', () => {
  test('the permanent spine is exactly getStorefrontStock on any day', () => {
    for (const day of [1, 2, 6, 17, 99, 5000]) {
      for (const id of ['forge', 'armorer', 'market'] as const) {
        const profile = { city: { day } };
        expect(resolveStorefrontOffer(profile, id)).toEqual(getStorefrontStock(id));
      }
    }
  });

  test('the bazaar is empty on every day', () => {
    for (const day of [1, 4, 88]) {
      expect(resolveStorefrontOffer({ city: { day } }, 'bazaar')).toEqual([]);
    }
  });

  test('the merchant is the only storefront the resolver marks as rotating', () => {
    const rotation = resolveCityRotation({ city: { day: 3 } });
    for (const id of STOREFRONTS) {
      expect(rotation.storefronts[id].rotates).toBe(id === 'merchant');
    }
  });
});

// ── §E. Short and reordered catalogues ────────────────────────────────────

describe('§E — selectDailyWindow is total for any eligible list', () => {
  test('an empty pool answers an empty list instead of throwing', () => {
    expect(selectDailyWindow([], MERCHANT_ROTATION_SLOTS, 'merchant', 1)).toEqual([]);
    expect(selectDailyWindow([], null, 'forge', 1)).toEqual([]);
  });

  test('a pool shorter than the slot count answers the whole pool, without duplicates', () => {
    for (const pool of [['a'], ['a', 'b'], ['a', 'b', 'c']]) {
      const window = selectDailyWindow(pool, MERCHANT_ROTATION_SLOTS, 'merchant', 9);
      expect(window).toEqual(pool);
      expect(new Set(window).size).toBe(pool.length);
    }
  });

  test('a longer pool answers exactly the slot count, all inside the pool', () => {
    const pool = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    for (let day = 1; day <= 20; day += 1) {
      const window = selectDailyWindow(pool, MERCHANT_ROTATION_SLOTS, 'merchant', day);
      expect(window).toHaveLength(MERCHANT_ROTATION_SLOTS);
      expect(new Set(window).size).toBe(MERCHANT_ROTATION_SLOTS);
      for (const id of window) expect(pool).toContain(id);
      // Catalogue order is preserved by index, never by insertion order.
      const indices = window.map((id) => pool.indexOf(id));
      expect([...indices].sort((a, b) => a - b)).toEqual(indices);
    }
  });

  test('a null slot count answers the whole pool as a fresh array', () => {
    const pool = ['a', 'b', 'c'];
    const window = selectDailyWindow(pool, null, 'forge', 4);
    expect(window).toEqual(pool);
    expect(window).not.toBe(pool);
  });

  test('a reordered catalogue is handled safely and deterministically', () => {
    const reversed = [...MERCHANT_POOL].reverse();
    const first = selectDailyWindow(reversed, MERCHANT_ROTATION_SLOTS, 'merchant', 5);
    const second = selectDailyWindow(reversed, MERCHANT_ROTATION_SLOTS, 'merchant', 5);

    expect(second).toEqual(first);
    expect(first).toHaveLength(MERCHANT_ROTATION_SLOTS);
    expect(new Set(first).size).toBe(MERCHANT_ROTATION_SLOTS);
    for (const id of first) expect(reversed).toContain(id);
    for (const id of first) expect(getItemById(id)).toBeTruthy();
  });

  test('the helper normalises the day exactly as the clock does', () => {
    expect(selectDailyWindow(MERCHANT_POOL, MERCHANT_ROTATION_SLOTS, 'merchant', 3.7)).toEqual(
      selectDailyWindow(MERCHANT_POOL, MERCHANT_ROTATION_SLOTS, 'merchant', 3)
    );
    expect(selectDailyWindow(MERCHANT_POOL, MERCHANT_ROTATION_SLOTS, 'merchant', 0)).toEqual(
      selectDailyWindow(MERCHANT_POOL, MERCHANT_ROTATION_SLOTS, 'merchant', 1)
    );
  });
});

// ── §F. One authoritative offer for screen and purchase ───────────────────

describe('§F — the screen and the purchase gate share one daily selection', () => {
  test('every displayed merchant card passes the gate; every withheld item fails it', () => {
    for (const day of [1, 2, 5, 12]) {
      const profile = { city: { day } };
      const displayed = resolveStorefrontOffer(profile, 'merchant');

      for (const id of displayed) {
        expect(isStorefrontItemOnOffer(profile, 'merchant', id)).toBe(true);
      }

      const withheld = withheldMerchantItem(day);
      // Eligible at the storefront, but not on offer today: refused.
      expect(getStorefrontStock('merchant')).toContain(withheld);
      expect(displayed).not.toContain(withheld);
      expect(isStorefrontItemOnOffer(profile, 'merchant', withheld)).toBe(false);
    }
  });

  test('a withheld item is refused only because of the day — it is offered on another day', () => {
    const profile = { city: { day: 1 } };
    const withheld = withheldMerchantItem(1);
    expect(isStorefrontItemOnOffer(profile, 'merchant', withheld)).toBe(false);

    const offeredSomewhere = Array.from({ length: 40 }, (_, i) => i + 1).some((day) =>
      isStorefrontItemOnOffer({ city: { day } }, 'merchant', withheld)
    );
    expect(offeredSomewhere).toBe(true);
  });

  test('an unknown id is refused by every storefront', () => {
    for (const id of STOREFRONTS) {
      expect(isStorefrontItemOnOffer({ city: { day: 3 } }, id, 'not_a_real_item')).toBe(false);
    }
  });

  test('the open market still offers every catalogue item', () => {
    const profile = { city: { day: 4 } };
    for (const id of getStorefrontStock('market')) {
      expect(isStorefrontItemOnOffer(profile, 'market', id)).toBe(true);
    }
  });

  test('the screen renders the shared offer and the gate is checked before any mutation', () => {
    expect(SHOP_SRC).toContain('resolveStorefrontOffer(profile, shopId)');
    expect(SHOP_SRC).not.toContain('getStorefrontStock(shopId)');

    // Living City L4 moved the transaction out of `App.handleBuyItem` into the
    // pure `utils/storefrontPurchase.ts`, so the ordering this test exists to pin
    // is read from the module that now owns it, and App is pinned as its caller.
    const goldCheck = PURCHASE_SRC.indexOf('profile.gold < item.price');
    const offerCheck = PURCHASE_SRC.indexOf('isStorefrontItemOnOffer(profile, storefront, itemId)');
    const mutation = PURCHASE_SRC.indexOf('inventory: [...profile.inventory, item]');
    expect(goldCheck).toBeGreaterThan(-1);
    expect(offerCheck).toBeGreaterThan(goldCheck);
    expect(mutation).toBeGreaterThan(offerCheck);

    expect(APP_SRC).toContain('purchaseStorefrontItem(base, shopId, item.id)');
    expect(APP_SRC).not.toContain('inventory: [...profile.inventory');
  });

  test('buying, opening or leaving a shop never advances the city day', () => {
    const buyStart = APP_SRC.indexOf('const handleBuyItem');
    const buyBody = APP_SRC.slice(buyStart, APP_SRC.indexOf('const handleSellItem', buyStart));

    expect(buyBody).not.toContain('advanceCityDay');
    expect(buyBody).not.toContain('city:');
    // The screen names no clock and no storage of its own.
    for (const forbidden of ['advanceCityDay', 'resolveCityDay', 'localStorage', 'saveProfile']) {
      expect(SHOP_SRC).not.toContain(forbidden);
    }
    // `advanceCityDay` keeps its single call site in the settlement handler.
    expect(APP_SRC.split('advanceCityDay(').length - 1).toBe(1);
  });

  test('no separate stock persistence or second day field was introduced', () => {
    for (const forbidden of ['localStorage', 'sessionStorage', 'saveProfile', 'Date.now']) {
      expect(load('./cityRotation.ts')).not.toContain(forbidden);
    }
    expect(resolveCityRotation({ city: { day: 2 } }).day).toBe(2);
  });
});
