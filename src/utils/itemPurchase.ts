/**
 * Buying a weapon or a piece of armour from a storefront.
 *
 * The stock rule lives in `data/shops.ts` (`getVisibleStorefrontStock`, which
 * withholds the two Master Forge pieces until the Smithing Workshop reaches L2).
 * This module is the other half — the transaction itself — written in the same
 * pure style as `selling.ts`, `tempering.ts` and `facilityProgression.ts`:
 *
 *   • nothing is mutated in place — a success returns a NEW `PlayerProfile` for
 *     the caller to hand to `saveProfile()`;
 *   • a refusal carries no profile at all, so a stale click can never charge
 *     twice, move gold or add an item the ludus is not yet allowed to sell;
 *   • the gate is re-checked HERE, not trusted from the stock list, so a Gilded
 *     piece bought below workshop L2 is refused even if a screen skipped
 *     `getVisibleStorefrontStock`.
 *
 * The item is added as the object the caller passed in — the shared `ITEMS_DB`
 * catalogue row — exactly as the shop screen did before this layer existed.
 */

import { PlayerProfile, WeaponItem, ArmorItem } from '../types/game';
import { getItemById } from '../data/itemsDB';
import { isItemUnlocked } from './facilityProgression';

/** Why a purchase was refused.  `ok: true` never carries a reason. */
export type PurchaseRejectionReason =
  | 'no-profile'
  | 'unknown-item'
  | 'facility-required'
  | 'insufficient-gold';

export type PurchaseResult =
  | { ok: true; profile: PlayerProfile }
  | { ok: false; reason: PurchaseRejectionReason };

/** A profile whose gold is missing or not finite can afford nothing. */
function canAfford(profile: PlayerProfile, price: number): boolean {
  return (
    typeof profile.gold === 'number' &&
    Number.isFinite(profile.gold) &&
    typeof price === 'number' &&
    Number.isFinite(price) &&
    profile.gold >= price
  );
}

/**
 * The buy rules, read out before a caller draws a control: the item must exist,
 * the ludus must be built high enough to sell it, and the purse must cover it.
 */
export function getItemPurchaseEligibility(
  profile: PlayerProfile | null | undefined,
  item: WeaponItem | ArmorItem | null | undefined
): { ok: true } | { ok: false; reason: PurchaseRejectionReason } {
  if (!profile) return { ok: false, reason: 'no-profile' };
  if (!item || typeof item.id !== 'string' || !getItemById(item.id)) {
    return { ok: false, reason: 'unknown-item' };
  }
  if (!isItemUnlocked(profile, item.id)) {
    return { ok: false, reason: 'facility-required' };
  }
  if (!canAfford(profile, item.price)) {
    return { ok: false, reason: 'insufficient-gold' };
  }
  return { ok: true };
}

/**
 * Buy one item.
 *
 * Deducts exactly the item's price once and appends ONE inventory entry.  A
 * refusal returns no profile at all, so the caller's save is untouched.
 */
export function purchaseItem(
  profile: PlayerProfile | null | undefined,
  item: WeaponItem | ArmorItem | null | undefined
): PurchaseResult {
  const eligibility = getItemPurchaseEligibility(profile, item);
  if (!eligibility.ok) return eligibility;
  if (!profile || !item) return { ok: false, reason: 'no-profile' }; // unreachable: eligibility resolved both

  return {
    ok: true,
    profile: {
      ...profile,
      gold: profile.gold - item.price,
      inventory: [...profile.inventory, item],
    },
  };
}

/** A short, player-facing explanation of a refusal. */
export function describePurchaseRejection(reason: PurchaseRejectionReason): string {
  switch (reason) {
    case 'no-profile':
      return 'No gladiator to buy for.';
    case 'unknown-item':
      return 'The merchant does not stock that.';
    case 'facility-required':
      return 'The Smithing Workshop must reach the Imperial Armoury first.';
    case 'insufficient-gold':
      return 'Not enough gold.';
  }
}
