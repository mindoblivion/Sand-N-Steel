/**
 * Living City L2 — the deterministic, day-based storefront rotation.
 *
 * What this suite pins, in the repo's two registers (behaviour for pure logic,
 * ordered source assertions for the wiring this repo has no DOM renderer for):
 *
 *   §A  determinism — the same day and the same inputs always produce the same
 *       rotation, on repeated calls and across a fresh resolution;
 *   §B  day sensitivity — different days produce different rotations, without
 *       randomness, and no eligible item is rotated away permanently;
 *   §C  the clock — the day comes from `resolveCityDay` (`utils/cityClock.ts`):
 *       a legacy profile with no `city.day` reads day 1, and malformed days
 *       resolve exactly as the existing clock helper resolves them;
 *   §D  the stock model stays authoritative — every rotated id is one the
 *       storefront itself stocks, the categories that do not rotate resolve to
 *       their full stock unchanged, and the bazaar stays empty;
 *   §E  purity and scope — no input is mutated, every call returns fresh arrays,
 *       the module names no clock/timer/storage/randomness, and no shop screen
 *       consumes it yet (so shop behaviour is unchanged).
 *
 * The expected windows in §B are measured from the shipped hash and are pinned
 * as a stability record: a change to the hash must be acknowledged here rather
 * than silently altering what every shop offers on every save.
 *
 * Run with: `bun test src/utils/cityRotation.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via `bun test`
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { ITEMS_DB, getItemById, isWeapon } from '../data/itemsDB';
import { getStorefrontStock, type StorefrontId } from '../data/shops';
import { normalizeCityDay } from './cityClock';
import {
  MERCHANT_ROTATION_SLOTS,
  ROTATING_STOREFRONTS,
  resolveCityRotation,
  rotateStorefrontStock,
} from './cityRotation';

const ROTATION_SRC = readFileSync(new URL('./cityRotation.ts', import.meta.url), 'utf8');
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const ROTATION_CODE = code(ROTATION_SRC);
const load = (rel: string): string =>
  code(readFileSync(new URL(rel, import.meta.url), 'utf8'));

/** The merchant's eligible pool, in `ITEMS_DB` order — the only rotation pool today. */
const MERCHANT_POOL = getStorefrontStock('merchant');

/** The measured day-1 window, pinned so a hash change cannot pass unnoticed. */
const MERCHANT_DAY_ONE = [
  'helm_centurion',
  'chest_golden_muscled',
  'arms_manica_steel',
  'arms_galerus_gilded',
];

const STOREFRONTS: StorefrontId[] = ['forge', 'armorer', 'bazaar', 'merchant', 'market'];

// ── §A. Determinism ────────────────────────────────────────────────────────

describe('§A — the same day and inputs always produce the same rotation', () => {
  test('repeated calls for one day are equal, and each returns a fresh array', () => {
    const first = rotateStorefrontStock('merchant', 1);
    const second = rotateStorefrontStock('merchant', 1);

    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    // Mutating one caller's array cannot reach the next caller's.
    first.push('not_a_real_item');
    expect(rotateStorefrontStock('merchant', 1)).toEqual(MERCHANT_DAY_ONE);
  });

  test('25 consecutive calls are byte-identical (no state, no drift)', () => {
    const reference = rotateStorefrontStock('merchant', 9);
    for (let i = 0; i < 25; i += 1) {
      expect(rotateStorefrontStock('merchant', 9)).toEqual(reference);
    }
  });

  test('a fresh resolution of the same day repeats the same rotation', () => {
    const a = resolveCityRotation({ city: { day: 6 } });
    const b = resolveCityRotation({ city: { day: 6 } });

    expect(a).toEqual(b);
    expect(a.day).toBe(6);
    expect(a.storefronts.merchant.itemIds).toEqual(rotateStorefrontStock('merchant', 6));
  });

  test('the shipped day-1 merchant window is exactly the measured one', () => {
    expect(rotateStorefrontStock('merchant', 1)).toEqual(MERCHANT_DAY_ONE);
  });

  test('a rotated window keeps ITEMS_DB order and never repeats an id', () => {
    const ids = rotateStorefrontStock('merchant', 11);
    const indices = ids.map((id) => MERCHANT_POOL.indexOf(id));

    expect(ids).toHaveLength(MERCHANT_ROTATION_SLOTS);
    expect(new Set(ids).size).toBe(ids.length);
    for (const index of indices) expect(index).toBeGreaterThanOrEqual(0);
    expect([...indices].sort((x, y) => x - y)).toEqual(indices);
  });
});

// ── §B. Rotation actually varies with the day ──────────────────────────────

describe('§B — different days produce different rotations, deterministically', () => {
  test('day 1 and day 2 offer different merchant stock', () => {
    expect(rotateStorefrontStock('merchant', 2)).not.toEqual(MERCHANT_DAY_ONE);
  });

  test('thirteen consecutive days produce several distinct windows', () => {
    const windows = new Set<string>();
    for (let day = 1; day <= 13; day += 1) {
      windows.add(rotateStorefrontStock('merchant', day).join(','));
    }
    // Measured: 9 distinct windows across days 1-13 (the hash wraps the pool,
    // so a collision is expected and is not a defect).
    expect(windows.size).toBeGreaterThanOrEqual(2);
    expect(windows.size).toBe(9);
  });

  test('over enough days every merchant good appears (nothing is rotated away)', () => {
    const union = new Set<string>();
    for (let day = 1; day <= 40; day += 1) {
      for (const id of rotateStorefrontStock('merchant', day)) union.add(id);
    }
    expect(union.size).toBe(MERCHANT_POOL.length);
    expect([...union].sort()).toEqual([...MERCHANT_POOL].sort());
  });

  test('the rotation is a pure function of the day — no sequence matters', () => {
    // Resolving in one order and then the reverse must give the same answers.
    const forward: string[][] = [];
    for (let day = 1; day <= 8; day += 1) forward.push(rotateStorefrontStock('merchant', day));

    const backward: string[][] = [];
    for (let day = 8; day >= 1; day -= 1) backward.unshift(rotateStorefrontStock('merchant', day));

    expect(backward).toEqual(forward);
  });
});

// ── §C. The existing clock is the only day source ──────────────────────────

describe('§C — day resolution goes through resolveCityDay', () => {
  test('a legacy profile with no city field resolves to day 1', () => {
    const legacy = { gold: 100 } as Record<string, unknown>;
    const rotation = resolveCityRotation(legacy);

    expect(rotation.day).toBe(1);
    expect(rotation.storefronts.merchant.itemIds).toEqual(MERCHANT_DAY_ONE);
  });

  test('a malformed day resolves exactly as the clock helper resolves it', () => {
    const malformed: unknown[] = ['7', true, NaN, Infinity, -Infinity, 0, -7, -0.5, null, {}, []];

    for (const day of malformed) {
      const expectedDay = normalizeCityDay(day);
      const rotation = resolveCityRotation({ city: { day: day as number } });

      expect(rotation.day).toBe(expectedDay);
      expect(rotation.storefronts.merchant.itemIds).toEqual(
        rotateStorefrontStock('merchant', expectedDay)
      );
    }
    // Every one of them lands on a usable day, never on an invalid one.
    expect(Number.isInteger(resolveCityRotation({ city: { day: NaN } }).day)).toBe(true);
  });

  test('a fractional day floors, exactly as normalizeCityDay floors it', () => {
    expect(resolveCityRotation({ city: { day: 3.7 } }).day).toBe(3);
    expect(rotateStorefrontStock('merchant', 3.7)).toEqual(
      rotateStorefrontStock('merchant', normalizeCityDay(3.7))
    );
  });

  test('a malformed city container is ignored rather than read', () => {
    for (const city of ['day 5', 5, [5], true]) {
      const rotation = resolveCityRotation({ city: city as never });
      expect(rotation.day).toBe(1);
      expect(rotation.storefronts.merchant.itemIds).toEqual(MERCHANT_DAY_ONE);
    }
  });

  test('the module imports the day resolver and names no second clock', () => {
    expect(ROTATION_CODE).toContain("from './cityClock'");
    expect(ROTATION_CODE).toContain('resolveCityDay');
    expect(ROTATION_CODE).toContain('normalizeCityDay');
    for (const forbidden of ['Date', 'performance.', 'setInterval', 'setTimeout', 'localStorage', 'saveProfile']) {
      expect(ROTATION_CODE).not.toContain(forbidden);
    }
    // `Math.imul` is integer mixing for the hash; `Math.random` must never appear.
    expect(ROTATION_CODE).not.toContain('Math.random');
  });
});

// ── §D. The existing stock model stays authoritative ──────────────────────

describe('§D — eligibility comes from getStorefrontStock, unchanged', () => {
  test('every rotated id is one its own storefront stocks, and a real item', () => {
    for (let day = 1; day <= 20; day += 1) {
      const rotation = rotateStorefrontStock('merchant', day);
      const eligible = new Set(getStorefrontStock('merchant'));

      for (const id of rotation) {
        expect(eligible.has(id)).toBe(true);
        expect(getItemById(id)).toBeTruthy();
      }
    }
  });

  test('the merchant window holds only rare and legendary goods', () => {
    for (let day = 1; day <= 20; day += 1) {
      for (const id of rotateStorefrontStock('merchant', day)) {
        const item = getItemById(id)!;
        expect(['rare', 'legendary']).toContain(item.rarity);
      }
    }
  });

  test('the permanent spine resolves to its FULL stock on every day', () => {
    for (const day of [1, 2, 7, 40, 5000]) {
      expect(rotateStorefrontStock('forge', day)).toEqual(getStorefrontStock('forge'));
      expect(rotateStorefrontStock('armorer', day)).toEqual(getStorefrontStock('armorer'));
      expect(rotateStorefrontStock('market', day)).toEqual(getStorefrontStock('market'));
    }
  });

  test('the bazaar stays empty — there is nothing to rotate', () => {
    for (const day of [1, 3, 99]) expect(rotateStorefrontStock('bazaar', day)).toEqual([]);
  });

  test('merchant is the only rotating category, and the resolver says so', () => {
    expect(ROTATING_STOREFRONTS).toEqual(['merchant']);

    const rotation = resolveCityRotation({ city: { day: 4 } });
    for (const id of STOREFRONTS) {
      expect(rotation.storefronts[id].storefront).toBe(id);
      expect(rotation.storefronts[id].rotates).toBe(id === 'merchant');
      if (!rotation.storefronts[id].rotates) {
        expect(rotation.storefronts[id].itemIds).toEqual(getStorefrontStock(id));
      }
    }
    expect(rotation.storefronts.merchant.slots).toBe(MERCHANT_ROTATION_SLOTS);
    expect(rotation.storefronts.merchant.itemIds).toHaveLength(MERCHANT_ROTATION_SLOTS);
  });

  test('the forge rotation still excludes the starter weapon', () => {
    expect(rotateStorefrontStock('forge', 8)).not.toContain('gladius_standard');
    expect(getStorefrontStock('forge').every((id) => isWeapon(getItemById(id)!))).toBe(true);
  });
});

// ── §E. Purity and scope ──────────────────────────────────────────────────

describe('§E — no input or catalogue is mutated; L3 consumes only the shared helper', () => {
  test('the profile and its city object are untouched', () => {
    const city = { day: 5 };
    const profile = { gold: 250, city };
    const before = JSON.stringify(profile);

    const rotation = resolveCityRotation(profile);

    expect(JSON.stringify(profile)).toBe(before);
    expect(profile.city).toBe(city);
    expect(city).toEqual({ day: 5 });
    expect(rotation.storefronts.merchant.itemIds).toEqual(rotateStorefrontStock('merchant', 5));
  });

  test('the item catalogue is byte-identical after many resolutions', () => {
    const before = JSON.stringify(ITEMS_DB);

    for (let day = 1; day <= 60; day += 1) {
      const rotation = resolveCityRotation({ city: { day } });
      for (const id of STOREFRONTS) rotation.storefronts[id].itemIds.push('mutated');
    }

    expect(JSON.stringify(ITEMS_DB)).toBe(before);
    expect(rotateStorefrontStock('market', 1)).toEqual(getStorefrontStock('market'));
  });

  test('the module reads the storefront layer rather than owning a stock list', () => {
    expect(ROTATION_CODE).toContain("from '../data/shops'");
    expect(ROTATION_CODE).toContain('getStorefrontStock');
    // No item id, price or rarity table of its own.
    for (const token of ['_gladius', 'helm_', 'chest_', 'legs_', 'price', 'rarity:']) {
      expect(ROTATION_CODE).not.toContain(token);
    }
  });

  test('L3 consumes this module through the shared offer helper on BOTH sides', () => {
    // The screen renders `resolveStorefrontOffer(profile, shopId)` and the
    // purchase gate asks `isStorefrontItemOnOffer(...)` for the same profile, so
    // the two cannot disagree about the day's stock. Since L4 the gate lives in
    // the purchase transaction (`utils/storefrontPurchase.ts`), which App calls,
    // so the pin is on the module that actually holds it.
    expect(load('../components/hub/ShopTab.tsx')).toContain('resolveStorefrontOffer(profile, shopId)');
    expect(load('../utils/storefrontPurchase.ts')).toContain(
      'isStorefrontItemOnOffer(profile, storefront, itemId)'
    );
    expect(load('../App.tsx')).toContain('purchaseStorefrontItem(base, shopId, item.id)');
    // Neither the hub screen nor the city scene resolves stock of its own.
    for (const file of [
      '../components/hub/GladiatorSchoolHub.tsx',
      '../components/3d/city/CityHubScene.tsx',
    ]) {
      expect(load(file)).not.toContain('cityRotation');
    }
  });
});
