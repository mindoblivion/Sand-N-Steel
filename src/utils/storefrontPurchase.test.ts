// L3/L4 recovery — daily merchant purchase transaction.
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createNewProfile } from '../services/storage';
import type { PlayerProfile } from '../types/game';
import { getStorefrontStock } from '../data/shops';
import { getItemById } from '../data/itemsDB';
import { resolveStorefrontOffer } from './cityRotation';
import {
  DAILY_LIMITED_STOREFRONTS, isMerchantPurchaseSpent,
  purchaseStorefrontItem, resolveMerchantPurchaseDay,
} from './storefrontPurchase';

const rich = (total = 0): PlayerProfile => ({ ...createNewProfile('Tester'), gold: 50000, time: { total } });
const firstOffer = (p: PlayerProfile) => resolveStorefrontOffer(p, 'merchant')[0];
const snapshot = (p: PlayerProfile) => JSON.stringify(p);

describe('L3/L4 — merchant purchase allowance', () => {
  test('legacy and malformed records safely grant the allowance', () => {
    for (const records of [undefined, null, 'bad', 3, [], { merchantPurchaseDay: NaN }, { merchantPurchaseDay: -1 }]) {
      const p = { ...rich(), records } as unknown as PlayerProfile;
      expect(resolveMerchantPurchaseDay(p)).toBeNull();
      expect(isMerchantPurchaseSpent(p)).toBe(false);
    }
  });

  test('first purchase atomically deducts gold, grants item and records the clock day', () => {
    const base = rich(14);
    const item = getItemById(firstOffer(base))!;
    const result = purchaseStorefrontItem(base, 'merchant', item.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.gold).toBe(base.gold - item.price);
    expect(result.profile.inventory.at(-1)?.id).toBe(item.id);
    expect(result.profile.records?.merchantPurchaseDay).toBe(3);
    expect(result.profile.time).toEqual(base.time);
    expect(base.records?.merchantPurchaseDay).toBeUndefined();
  });

  test('second same-day purchase is refused without changing the committed profile', () => {
    const first = purchaseStorefrontItem(rich(), 'merchant', firstOffer(rich()));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const before = snapshot(first.profile);
    const second = purchaseStorefrontItem(first.profile, 'merchant', resolveStorefrontOffer(first.profile, 'merchant')[1]);
    expect(second).toEqual({ ok: false, reason: 'merchant-daily-limit' });
    expect(snapshot(first.profile)).toBe(before);
  });

  test('allowance resets naturally at the next dawn', () => {
    const base = rich(6);
    const first = purchaseStorefrontItem(base, 'merchant', firstOffer(base));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const nextDay = { ...first.profile, time: { total: 7 } };
    expect(isMerchantPurchaseSpent(nextDay)).toBe(false);
    const second = purchaseStorefrontItem(nextDay, 'merchant', firstOffer(nextDay));
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.profile.records?.merchantPurchaseDay).toBe(2);
  });

  test('off-rotation item is refused even if caller bypasses the screen', () => {
    const base = rich();
    const withheld = getStorefrontStock('merchant').find(id => !resolveStorefrontOffer(base, 'merchant').includes(id))!;
    const before = snapshot(base);
    expect(purchaseStorefrontItem(base, 'merchant', withheld)).toEqual({ ok: false, reason: 'not-on-offer' });
    expect(snapshot(base)).toBe(before);
  });

  test('permanent storefront purchases remain unlimited and do not write a merchant marker', () => {
    expect(DAILY_LIMITED_STOREFRONTS).toEqual(['merchant']);
    const base = rich();
    const id = getStorefrontStock('forge')[0];
    const first = purchaseStorefrontItem(base, 'forge', id);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = purchaseStorefrontItem(first.profile, 'forge', id);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.profile.records?.merchantPurchaseDay).toBeUndefined();
  });

  test('unknown item and insufficient funds do not spend the allowance', () => {
    expect(purchaseStorefrontItem(rich(), 'merchant', 'not-a-real-item')).toEqual({ ok: false, reason: 'unknown-item' });
    const poor = { ...rich(), gold: 0 };
    expect(purchaseStorefrontItem(poor, 'merchant', firstOffer(poor))).toEqual({ ok: false, reason: 'insufficient-gold' });
    expect(isMerchantPurchaseSpent(poor)).toBe(false);
  });

  test('App uses the atomic transaction and synchronously updates its profile ref', () => {
    const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('purchaseStorefrontItem(base, shopId, item.id)');
    expect(app).toContain('profileRef.current = result.profile');
  });
});
