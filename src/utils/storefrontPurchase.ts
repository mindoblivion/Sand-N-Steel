/**
 * Living City L4 — the ONE storefront purchase transaction.
 *
 * Until L4 the whole transaction lived inline in `App.handleBuyItem`: a gold
 * check, the L3 offer gate, then a new profile with the price deducted and the
 * item appended. L4 adds the merchant's daily allowance, and three properties
 * have to hold together for it to be trustworthy — so the body moved here, in
 * the repo's established pure-helper style (`purchaseChariotPart`,
 * `purchaseRacingConfig`, `sellItem`):
 *
 *   • **one base, one decision.** Every check reads the caller's profile and the
 *     transaction returns a NEW profile on success and the caller's own object
 *     (untouched) on refusal, so a rejected purchase cannot move gold, inventory
 *     or the purchase record;
 *   • **checks before the commit, in a fixed order** — the profile, the item in
 *     the catalogue, the purse, the day's offer, then the merchant's allowance —
 *     and nothing is written until all of them pass;
 *   • **the merchant's allowance is ONE number on the existing `city` object**
 *     (`city.merchantPurchaseDay`), written in the SAME profile literal as the
 *     gold and the inventory, so there is no second write that could race it.
 *
 * The day is `resolveCityDay(profile)` — the one clock — and nothing here reads
 * the wall clock, starts a timer or advances the day. Buying never spends a day;
 * the allowance simply stops matching when a settled duel moves the clock.
 *
 * Scope: the limit applies to `merchant` ONLY. The forge, armorer, market and
 * bazaar keep exactly the behaviour they had, so their purchasers are unchanged.
 */

import type { CityState, PlayerProfile } from '../types/game';
import { getItemById } from '../data/itemsDB';
import type { StorefrontId } from '../data/shops';
import { CITY_DAY_START, resolveCityDay } from './cityClock';
import { isStorefrontItemOnOffer } from './cityRotation';

/**
 * The storefronts with a per-day purchase allowance. `merchant` is the Elite
 * Merchant House (the rotating rare/legendary trader); every other storefront is
 * the permanent spine and is deliberately unlimited.
 */
export const DAILY_LIMITED_STOREFRONTS: readonly StorefrontId[] = ['merchant'];

/** Why a purchase was refused. `ok: true` never carries a reason. */
export type StorefrontPurchaseRejectionReason =
  | 'no-profile'
  | 'unknown-item'
  | 'insufficient-gold'
  | 'not-on-offer'
  | 'merchant-daily-limit';

export type StorefrontPurchaseResult =
  | { ok: true; profile: PlayerProfile }
  | { ok: false; reason: StorefrontPurchaseRejectionReason };

/**
 * The profile's `city` object, or `{}` when the field is absent or is not a plain
 * object — the same total rule `utils/cityClock.ts` applies, repeated here so
 * this module reads the container exactly once and never spreads junk (a string,
 * number, array or `true`) into the profile it returns.
 */
function readCity(profile: PlayerProfile | null | undefined): CityState {
  const city = profile?.city;
  if (!city || typeof city !== 'object' || Array.isArray(city)) return {};
  return city;
}

/**
 * The last city day on which a merchant purchase succeeded, or `null` when the
 * save carries no usable record (absent, wrong type, `NaN`, zero, negative — a
 * legacy profile and a hand-edited one alike). Total: it never throws and never
 * invents a day, so malformed data can only ever GRANT the allowance, never lock
 * a player out of a day they never spent.
 */
export function resolveMerchantPurchaseDay(
  profile: PlayerProfile | null | undefined
): number | null {
  const raw = readCity(profile).merchantPurchaseDay;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const whole = Math.floor(raw);
  if (whole < CITY_DAY_START) return null;
  return whole;
}

/**
 * Whether this profile has already spent the Elite Merchant House's allowance on
 * its current city day. Pure and derived: the stored day and the clock are
 * compared on read, so the allowance resets by itself when `city.day` advances.
 */
export function isMerchantPurchaseSpent(
  profile: PlayerProfile | null | undefined
): boolean {
  return resolveMerchantPurchaseDay(profile) === resolveCityDay(profile);
}

/**
 * The purchase transaction. Returns a NEW profile on success — gold reduced by
 * exactly the item's price, one copy appended to the inventory, and, for the
 * merchant, the current day recorded in the same update — or a refusal reason
 * with the caller's profile untouched.
 *
 * The item is resolved from `ITEMS_DB` by id, so the committed object is the
 * catalogue's own entry rather than a caller-supplied clone, and the day's offer
 * is judged by `isStorefrontItemOnOffer` — the same helper the shop screen
 * renders from, so a card and a purchase can never disagree.
 */
export function purchaseStorefrontItem(
  profile: PlayerProfile | null | undefined,
  storefront: StorefrontId,
  itemId: string
): StorefrontPurchaseResult {
  if (!profile) return { ok: false, reason: 'no-profile' };

  const item = getItemById(itemId);
  if (!item) return { ok: false, reason: 'unknown-item' };
  if (profile.gold < item.price) return { ok: false, reason: 'insufficient-gold' };
  if (!isStorefrontItemOnOffer(profile, storefront, itemId)) {
    return { ok: false, reason: 'not-on-offer' };
  }

  const day = resolveCityDay(profile);
  const limited = DAILY_LIMITED_STOREFRONTS.includes(storefront);
  if (limited && resolveMerchantPurchaseDay(profile) === day) {
    return { ok: false, reason: 'merchant-daily-limit' };
  }

  const purchased: PlayerProfile = {
    ...profile,
    gold: profile.gold - item.price,
    inventory: [...profile.inventory, item],
  };

  if (!limited) return { ok: true, profile: purchased };

  return {
    ok: true,
    profile: {
      ...purchased,
      // `city.day` is carried over AS STORED (never normalized, never invented);
      // only the allowance is recorded, and only after every check passed.
      city: { ...readCity(profile), merchantPurchaseDay: day },
    },
  };
}
