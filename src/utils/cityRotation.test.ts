// L2 recovery port — daily merchant rotation on main's seven-phase clock.
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { getStorefrontStock } from '../data/shops';
import { resolveTimeState } from './timeState';
import {
  MERCHANT_ROTATION_SLOTS,
  ROTATING_STOREFRONTS,
  isStorefrontItemOnOffer,
  resolveDailyStorefrontRotation,
  resolveStorefrontOffer,
  rotateStorefrontStock,
} from './cityRotation';

const DAY_ONE = [
  'helm_centurion',
  'chest_golden_muscled',
  'arms_manica_steel',
  'arms_galerus_gilded',
];

describe('L2 — deterministic daily storefront rotation', () => {
  test('the merchant day-one window preserves the shipped FNV-1a selection', () => {
    expect(rotateStorefrontStock('merchant', 1)).toEqual(DAY_ONE);
    expect(rotateStorefrontStock('merchant', 1)).toEqual(DAY_ONE);
  });

  test('merchant stock changes by day and remains a four-item catalogue subset', () => {
    const dayTwo = rotateStorefrontStock('merchant', 2);
    expect(dayTwo).toHaveLength(MERCHANT_ROTATION_SLOTS);
    expect(dayTwo).not.toEqual(DAY_ONE);
    expect(new Set(dayTwo).size).toBe(4);
    for (const id of dayTwo) expect(getStorefrontStock('merchant')).toContain(id);
  });

  test('the seven-phase clock alone determines the day', () => {
    expect(resolveTimeState({ time: { total: 0 } } as never).day).toBe(1);
    expect(resolveTimeState({ time: { total: 6 } } as never).day).toBe(1);
    expect(resolveTimeState({ time: { total: 7 } } as never).day).toBe(2);
    expect(resolveStorefrontOffer({ time: { total: 0 } } as never, 'merchant')).toEqual(DAY_ONE);
    expect(resolveStorefrontOffer({ time: { total: 7 } } as never, 'merchant')).toEqual(
      rotateStorefrontStock('merchant', 2)
    );
  });

  test('legacy and malformed clock values safely resolve to day one', () => {
    for (const profile of [undefined, null, {}, { time: { total: NaN } }, { time: { total: -1 } }]) {
      expect(resolveDailyStorefrontRotation(profile as never).day).toBe(1);
      expect(resolveStorefrontOffer(profile as never, 'merchant')).toEqual(DAY_ONE);
    }
  });

  test('only the merchant rotates; permanent storefronts keep their full stock', () => {
    expect(ROTATING_STOREFRONTS).toEqual(['merchant']);
    for (const id of ['forge', 'armorer', 'market'] as const) {
      expect(rotateStorefrontStock(id, 1)).toEqual(getStorefrontStock(id));
      expect(rotateStorefrontStock(id, 12)).toEqual(getStorefrontStock(id));
    }
    expect(rotateStorefrontStock('bazaar', 1)).toEqual([]);
  });

  test('offer predicate agrees with the displayed daily list', () => {
    const profile = { time: { total: 0 } } as never;
    const offer = resolveStorefrontOffer(profile, 'merchant');
    for (const id of offer) expect(isStorefrontItemOnOffer(profile, 'merchant', id)).toBe(true);
    expect(isStorefrontItemOnOffer(profile, 'merchant', 'not-a-real-item')).toBe(false);
  });

  test('all daily windows are fresh arrays and never mutate the catalogue', () => {
    const before = JSON.stringify(getStorefrontStock('merchant'));
    const first = rotateStorefrontStock('merchant', 4);
    first.push('corrupt-id');
    expect(JSON.stringify(getStorefrontStock('merchant'))).toBe(before);
    expect(rotateStorefrontStock('merchant', 4)).not.toContain('corrupt-id');
  });

  test('daily resolver reports a coherent set of storefront offers', () => {
    const result = resolveDailyStorefrontRotation({ time: { total: 14 } } as never);
    expect(result.day).toBe(3);
    expect(result.storefronts.merchant.itemIds).toEqual(rotateStorefrontStock('merchant', 3));
    expect(result.storefronts.merchant.slots).toBe(4);
    expect(result.storefronts.forge.rotates).toBe(false);
  });
});

describe('L2 — App transaction boundary', () => {
  test('the purchase handler re-checks the same storefront offer before saving', () => {
    const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('isStorefrontItemOnOffer(profile, shopId, item.id)');
    expect(app.indexOf('isStorefrontItemOnOffer(profile, shopId, item.id)'))
      .toBeLessThan(app.indexOf('const result = purchaseItem(profile, item)'));
  });
});
