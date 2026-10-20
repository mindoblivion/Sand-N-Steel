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
 * An item is sellable only while it sits in `inventory` and is NOT equipped:
 * `equipped.weapon` is a required field, so unequipping-by-selling a weapon
 * would leave the profile in a state no other code expects.  The player unequips
 * first, exactly as they would in a real armoury.
 */

import { PlayerProfile } from '../types/game';
import { getItemById } from '../data/itemsDB';
import { getTemperSellValue } from './tempering';

/** Why a sale was refused.  `ok: true` never carries a reason. */
export type SellRejectionReason = 'no-profile' | 'unknown-item' | 'not-owned' | 'equipped';

/** Whether the player owns this id in `inventory` (an equipped item is not sellable). */
function isInInventory(profile: PlayerProfile, itemId: string): boolean {
  return profile.inventory.some((item) => item?.id === itemId);
}

/** Whether the id currently occupies one of the equipped slots. */
function isEquipped(profile: PlayerProfile, itemId: string): boolean {
  const equipped = profile.equipped;
  if (!equipped) return false;
  return [equipped.weapon, equipped.helm, equipped.chest, equipped.arms, equipped.legs].some(
    (item) => item?.id === itemId
  );
}

/** The gold a sale of `itemId` pays this profile, or 0 when the item is unknown. */
export function getSellValue(profile: PlayerProfile | null | undefined, itemId: string): number {
  const item = getItemById(itemId);
  if (!item) return 0;
  return getTemperSellValue(profile, item);
}

/**
 * The sell rules, read out before a caller draws a control: the item must exist,
 * be carried in the inventory, and not be equipped.
 */
export function getSellEligibility(
  profile: PlayerProfile | null | undefined,
  itemId: string
): { ok: true } | { ok: false; reason: SellRejectionReason } {
  if (!profile) return { ok: false, reason: 'no-profile' };
  if (!getItemById(itemId)) return { ok: false, reason: 'unknown-item' };
  if (!isInInventory(profile, itemId)) return { ok: false, reason: 'not-owned' };
  if (isEquipped(profile, itemId)) return { ok: false, reason: 'equipped' };
  return { ok: true };
}

/**
 * Sell one carried item.
 *
 * PURE: a refusal returns the caller's own profile object, untouched (same
 * reference).  A success returns a NEW profile with the sale value added to
 * `gold`, the item dropped from `inventory`, and that item's temper entry
 * removed — the owned item objects themselves are never modified.
 */
export function sellItem(profile: PlayerProfile, itemId: string): PlayerProfile {
  if (!getSellEligibility(profile, itemId).ok) return profile;

  const item = getItemById(itemId);
  if (!item) return profile; // unreachable: eligibility already resolved it

  const next: PlayerProfile = {
    ...profile,
    gold: profile.gold + getTemperSellValue(profile, item),
    inventory: profile.inventory.filter((owned) => owned?.id !== itemId),
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
