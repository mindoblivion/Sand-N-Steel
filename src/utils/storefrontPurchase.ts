/**
 * L3/L4 recovery port — the one authoritative storefront purchase transaction.
 *
 * Daily stock is derived from main's seven-phase clock by cityRotation. The
 * Elite Merchant House additionally permits one successful purchase per
 * resolved in-game day. The allowance is stored lazily in records and is
 * committed atomically with gold and inventory; it never advances the clock.
 *
 * All other storefronts retain their existing unlimited purchase behaviour.
 * Facility unlocks and purse validation remain owned by itemPurchase.
 */

import type { PlayerProfile } from '../types/game';
import { getItemById } from '../data/itemsDB';
import type { StorefrontId } from '../data/shops';
import { purchaseItem } from './itemPurchase';
import { resolveTimeState } from './timeState';
import { isStorefrontItemOnOffer } from './cityRotation';

export const DAILY_LIMITED_STOREFRONTS: readonly StorefrontId[] = ['merchant'];

export type StorefrontPurchaseRejectionReason =
  | 'no-profile'
  | 'unknown-item'
  | 'not-on-offer'
  | 'merchant-daily-limit'
  | 'facility-required'
  | 'insufficient-gold';

export type StorefrontPurchaseResult =
  | { ok: true; profile: PlayerProfile }
  | { ok: false; reason: StorefrontPurchaseRejectionReason };

type RecordsCarrier = { records?: PlayerProfile['records'] };

function readRecords(profile: PlayerProfile | null | undefined): NonNullable<PlayerProfile['records']> {
  const records = (profile as RecordsCarrier | null | undefined)?.records;
  if (!records || typeof records !== 'object' || Array.isArray(records)) return {};
  return records;
}

/** The last day a merchant purchase succeeded, or null for legacy/malformed data. */
export function resolveMerchantPurchaseDay(profile: PlayerProfile | null | undefined): number | null {
  const raw = readRecords(profile).merchantPurchaseDay;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const day = Math.floor(raw);
  return day >= 1 ? day : null;
}

/** True only when the saved purchase marker matches the authoritative clock day. */
export function isMerchantPurchaseSpent(profile: PlayerProfile | null | undefined): boolean {
  return resolveMerchantPurchaseDay(profile) === resolveTimeState(profile).day;
}

/**
 * Validate and commit one storefront purchase. The catalogue entry, offer,
 * facility gate and purse are all rechecked here; caller-supplied item objects
 * are never trusted. A merchant marker is written only after purchaseItem
 * succeeds, in the same returned profile as its gold/inventory changes.
 */
export function purchaseStorefrontItem(
  profile: PlayerProfile | null | undefined,
  storefront: StorefrontId,
  itemId: string
): StorefrontPurchaseResult {
  if (!profile) return { ok: false, reason: 'no-profile' };
  const item = getItemById(itemId);
  if (!item) return { ok: false, reason: 'unknown-item' };
  if (!isStorefrontItemOnOffer(profile, storefront, itemId)) {
    return { ok: false, reason: 'not-on-offer' };
  }

  const limited = DAILY_LIMITED_STOREFRONTS.includes(storefront);
  const day = resolveTimeState(profile).day;
  if (limited && resolveMerchantPurchaseDay(profile) === day) {
    return { ok: false, reason: 'merchant-daily-limit' };
  }

  const result = purchaseItem(profile, item);
  if (!result.ok) return result;

  if (!limited) return { ok: true, profile: result.profile };

  return {
    ok: true,
    profile: {
      ...result.profile,
      records: {
        ...readRecords(profile),
        merchantPurchaseDay: day,
      },
    },
  };
}
