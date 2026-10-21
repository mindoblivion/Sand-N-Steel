/**
 * Living City L12 — the ONE visitor purchase transaction.
 *
 * Until L12 a visitor could only be MET (`utils/visitorEncounter` wrote
 * `seenVisitors`); what completes a visit was undefined, so nothing wrote
 * `completedVisitors`. L12 decides it: **buying the day's offered item, at its
 * canonical `ITEMS_DB` price, completes that visitor permanently.** A visitor who
 * has finished their trade is excluded by the L10 schedule on every later day,
 * because the schedule already drops any id in `completedVisitors`.
 *
 * It follows the house transaction contract (`purchaseStorefrontItem`,
 * `trainStat`, `restAtMedicalHouse`, `recordVisitorEncounter`):
 *
 *   • **one base, one decision.** Every check reads the caller's profile and a
 *     success returns a NEW profile; a refusal returns `{ ok: false, reason }` and
 *     nothing else, so no partially updated profile can escape — gold, inventory
 *     and completion history all stay exactly as they were;
 *   • **checks before the commit, in a fixed order** — the profile, the catalogue,
 *     completion, today's schedule, the offer, the item and its price, the purse
 *     shape, then the price itself — and nothing is written until all of them pass;
 *   • **the offer is resolved HERE, from the schedule**, never taken from a caller:
 *     a stale UI selection cannot buy an item the visitor is not offering today,
 *     and a stale visitor cannot be bought from on a day they are not in the city;
 *   • **one write.** Gold, the granted item and `completedVisitors` live in the SAME
 *     profile literal, so there is no second update that could race them. The
 *     completion entry is what makes a replayed callback harmless: the second call
 *     sees the id in `completedVisitors` and is refused before it can charge again.
 *
 * WHAT IT DOES NOT DO: no discount, no reward, no fame, no experience, no bonus; no
 * day change (the city object is carried over as stored, only the completion list
 * changes); no merchant allowance (this is not a storefront purchase); no new item
 * and no visitor-exclusive stock. `seenVisitors` is preserved, not rewritten —
 * being seen and being done are different things, and the panel keeps saying so.
 */

import type { CityState, PlayerProfile } from '../types/game';
import { getItemById, type GameItem } from '../data/itemsDB';
import { getVisitor } from '../data/visitors';
import { resolveVisitorEncounter } from './visitorEncounter';
import { readCompletedVisitors } from './visitorSchedule';

/** Why a visitor purchase was refused. `ok: true` never carries a reason. */
export type VisitorPurchaseRejectionReason =
  | 'no-profile'
  | 'unknown-visitor'
  | 'already-completed'
  | 'not-in-town'
  | 'no-offer'
  | 'unknown-item'
  | 'invalid-price'
  | 'invalid-gold'
  | 'invalid-inventory'
  | 'insufficient-gold';

/**
 * `item` and `price` are the catalogue's own entry and its canonical price, so the
 * caller can name exactly what was bought and what it cost without looking either
 * up again. `profile` is the single committed update described above.
 */
export type VisitorPurchaseResult =
  | { ok: true; profile: PlayerProfile; item: GameItem; price: number }
  | { ok: false; reason: VisitorPurchaseRejectionReason };

/**
 * The profile's `city` object, or `{}` when the field is absent or is not a plain
 * object — the same total rule `cityClock` / `storefrontPurchase` /
 * `visitorEncounter` apply, repeated so a hand-edited save can never be spread
 * into the profile this returns.
 */
function readCity(profile: PlayerProfile | null | undefined): CityState {
  const city = profile?.city;
  if (!city || typeof city !== 'object' || Array.isArray(city)) return {};
  return city;
}

/**
 * The canonical price, or `null` when it is not a usable price at all. A malformed
 * price must never read as "free": `NaN` and `Infinity` both fail every `gold <`
 * comparison, so without this guard a bad catalogue entry would sell for nothing.
 * A finite zero is a legitimate price (a free gift), so only negative and
 * non-finite values are refused.
 */
export function resolveVisitorItemPrice(item: GameItem | null | undefined): number | null {
  const price = item?.price;
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return null;
  return price;
}

/**
 * Buy the visitor's one offer for today. A success charges exactly the item's
 * `ITEMS_DB` price, grants exactly one copy through the established
 * `[...inventory, item]` convention, and appends the visitor to
 * `completedVisitors` — all in one profile.
 *
 * Refusals, in the order they are checked: `no-profile`, `unknown-visitor`,
 * `already-completed` (checked before the schedule, so a finished visitor reads as
 * finished rather than as "not in town"), `not-in-town`, `no-offer`, `unknown-item`,
 * `invalid-price`, `invalid-gold`, `invalid-inventory`, `insufficient-gold`.
 */
export function purchaseVisitorOffer(
  profile: PlayerProfile | null | undefined,
  visitorId: string
): VisitorPurchaseResult {
  if (!profile) return { ok: false, reason: 'no-profile' };

  const visitor = getVisitor(visitorId);
  if (!visitor) return { ok: false, reason: 'unknown-visitor' };

  // Completion is permanent, so a finished visitor is refused even on a day the
  // schedule no longer lists them at all.
  if (readCompletedVisitors(profile).includes(visitorId)) {
    return { ok: false, reason: 'already-completed' };
  }

  // The offer is re-resolved from the L10 schedule at purchase time: this single
  // read answers "is this visitor in town today" and "what is on offer today".
  const view = resolveVisitorEncounter(profile, visitorId);
  if (!view) return { ok: false, reason: 'not-in-town' };

  const offerItemId = view.offerItemId;
  if (!offerItemId || !visitor.offer.pool.includes(offerItemId)) {
    return { ok: false, reason: 'no-offer' };
  }

  const item = getItemById(offerItemId);
  if (!item) return { ok: false, reason: 'unknown-item' };

  const price = resolveVisitorItemPrice(item);
  if (price === null) return { ok: false, reason: 'invalid-price' };

  const gold = profile.gold;
  if (typeof gold !== 'number' || !Number.isFinite(gold) || gold < 0) {
    return { ok: false, reason: 'invalid-gold' };
  }

  // A malformed inventory cannot be appended to, so it is refused rather than
  // repaired — a purchase that silently rebuilt the list could drop owned gear.
  if (!Array.isArray(profile.inventory)) {
    return { ok: false, reason: 'invalid-inventory' };
  }

  if (gold < price) return { ok: false, reason: 'insufficient-gold' };

  const completed = readCompletedVisitors(profile);

  return {
    ok: true,
    item,
    price,
    profile: {
      ...profile,
      gold: gold - price,
      inventory: [...profile.inventory, item],
      // `city.day`, `restDay`, `merchantPurchaseDay` and `seenVisitors` ride across
      // from the stored object untouched — only the completion list changes.
      city: {
        ...readCity(profile),
        completedVisitors: [...completed, visitorId],
      },
    },
  };
}
