/**
 * Selling — the market's buy-back path.
 *
 * The value rule lives in `utils/tempering.ts`, which already owns what an item
 * is worth once gold has been sunk into it: a sale pays the item's own
 * `sellPrice` plus 25 % of the temper gold spent on it (`getTemperSellValue`).
 * This module is the other half — the transaction itself — written in the same
 * pure style as the chariot / racing / tempering helpers:
 *
 *   • no profile and no owned item object is mutated in place — a success
 *     returns a NEW `PlayerProfile` for the caller to hand to `saveProfile()`;
 *   • a refused sale returns the caller's own profile object, untouched, so a
 *     refused click can never move gold or lose an item;
 *   • a sale clears that item's temper record.  The catalogue objects in
 *     `ITEMS_DB` are shared data, so a re-bought sword must start at level 0
 *     rather than inherit the levels its previous owner paid for.
 *
 * A sale is an instance, not an id (C-3/C-4): it removes exactly ONE inventory
 * entry and pays once.  The equipped copy itself is never sellable — `equipped.weapon`
 * is a required field, so unequipping-by-selling a weapon would leave the profile in a
 * state no other code expects — but the starter gladius genuinely sits in BOTH
 * `equipped.weapon` and `inventory`, so eligibility counts copies instead of looking the
 * id up: equipment explains one inventory entry, and every entry beyond that count is a
 * spare that sells under the normal rule.
 */

import { PlayerProfile } from '../types/game';
import { getItemById } from '../data/itemsDB';
import { getTemperSellValue } from './tempering';

/** Why a sale was refused.  `ok: true` never carries a reason. */
export type SellRejectionReason = 'no-profile' | 'unknown-item' | 'not-owned' | 'equipped';

/** How many `inventory` entries carry this id. */
function inventoryCount(profile: PlayerProfile, itemId: string): number {
  return profile.inventory.filter((item) => item?.id === itemId).length;
}

/** How many equipped slots hold this id — the copies the equipment already explains. */
function equippedCount(profile: PlayerProfile, itemId: string): number {
  const equipped = profile.equipped;
  if (!equipped) return 0;
  return [equipped.weapon, equipped.helm, equipped.chest, equipped.arms, equipped.legs].filter(
    (item) => item?.id === itemId
  ).length;
}

/** The gold a sale of `itemId` pays this profile, or 0 when the item is unknown. */
export function getSellValue(profile: PlayerProfile | null | undefined, itemId: string): number {
  const item = getItemById(itemId);
  if (!item) return 0;
  return getTemperSellValue(profile, item);
}

/**
 * The sell rules, read out before a caller draws a control: the item must exist and
 * at least one carried copy must be explained by no equipment.
 *
 * Eligibility is counted, not looked up by id (C-4): the equipped copy accounts for
 * one inventory entry — the starter gladius genuinely sits in both — and every entry
 * beyond that count is a spare.  When the inventory holds no more copies than the
 * equipment explains, the only copy left is the one being worn, and it is `equipped`.
 */
export function getSellEligibility(
  profile: PlayerProfile | null | undefined,
  itemId: string
): { ok: true } | { ok: false; reason: SellRejectionReason } {
  if (!profile) return { ok: false, reason: 'no-profile' };
  if (!getItemById(itemId)) return { ok: false, reason: 'unknown-item' };
  const carried = inventoryCount(profile, itemId);
  if (carried === 0) return { ok: false, reason: 'not-owned' };
  if (carried <= equippedCount(profile, itemId)) return { ok: false, reason: 'equipped' };
  return { ok: true };
}

/**
 * Sell one carried item.
 *
 * PURE: a refusal returns the caller's own profile object, untouched (same
 * reference).  A success returns a NEW profile with the sale value added to
 * `gold`, exactly ONE matching entry dropped from `inventory` (the first — a sale
 * is one instance, C-3), and that item's temper entry removed — the owned item
 * objects themselves are never modified.
 */
export function sellItem(profile: PlayerProfile, itemId: string): PlayerProfile {
  if (!getSellEligibility(profile, itemId).ok) return profile;

  const item = getItemById(itemId);
  if (!item) return profile; // unreachable: eligibility already resolved it

  const soldAt = profile.inventory.findIndex((owned) => owned?.id === itemId);
  const inventory = profile.inventory.filter((_, index) => index !== soldAt);

  const next: PlayerProfile = {
    ...profile,
    gold: profile.gold + getTemperSellValue(profile, item),
    inventory,
  };

  // Drop the temper record with the item, and leave the field absent on a save
  // that never had one.
  if (profile.temper) {
    const temper = { ...profile.temper };
    delete temper[itemId];
    next.temper = temper;
  }

  return next;
}
