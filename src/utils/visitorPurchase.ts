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
 * L15 gives the visitor their reason to be worth the walk: the asking price is
 * `ceil(canonical × bargainRate)` — a RATE read from the visitor catalogue, never a
 * second price table. `resolveVisitorBargainPrice` is the ONE resolver, and the
 * panel and this transaction both call it, so the price shown and the price charged
 * cannot disagree. A rate that is missing or outside `(0, 1)` falls back to the
 * canonical price: malformed catalogue data can only ever cost the player MORE, never
 * make an item free and never invent a markup.
 *
 * L16B extends the SAME transaction to a second kind of offer: a visitor may bring
 * a chariot finish instead of an item (`data/chariotParts`), and buying it grants
 * the part into the player's chariot ownership — never into the item inventory,
 * which every shop and gear screen narrows by weapon/armour shape. The finish's
 * price is its own catalogue `price` through the SAME `resolveVisitorBargainPrice`
 * (900 at the bladesmith's 0.70 rate = 630), the visitor is completed by the same
 * one completion list, and the whole trade is still ONE profile literal. A part
 * the player already owns is refused before anything is charged, and a malformed
 * `chariot`/`owned` field is refused rather than rebuilt — a purchase that
 * silently repaired the list could drop a part the player paid for.
 *
 * WHAT IT DOES NOT DO: no fame, no experience, no bonus; no day change (the city
 * object is carried over as stored, only the completion list changes); no merchant
 * allowance (this is not a storefront purchase); no new item and no
 * visitor-exclusive stock; no second discount at any permanent shop. `seenVisitors`
 * is preserved, not rewritten — being seen and being done are different things, and
 * the panel keeps saying so.
 */

import type { CityState, PlayerProfile } from '../types/game';
import { getItemById, type GameItem } from '../data/itemsDB';
import { getVisitor, type Visitor } from '../data/visitors';
import { getChariotPart, type ChariotPart } from '../data/chariotParts';
import { resolveChariotLoadout } from './chariotLoadout';
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
  | 'insufficient-gold'
  // L16B — the offer is a chariot part rather than an item.
  | 'invalid-offer'
  | 'invalid-ownership'
  | 'already-owned';

/**
 * `kind` names WHICH of the two catalogue entries was bought — an `ITEMS_DB` item
 * or a chariot part — and carries that entry plus the price actually charged, so
 * the caller can name exactly what was bought and what it cost without looking
 * either up again. `profile` is the single committed update described above.
 */
export type VisitorPurchaseResult =
  | { ok: true; kind: 'item'; profile: PlayerProfile; item: GameItem; price: number }
  | { ok: true; kind: 'part'; profile: PlayerProfile; part: ChariotPart; price: number }
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
 * L16B — the chariot part ids this profile owns, stock parts included, or `null`
 * when the stored `chariot` field is present but malformed.
 *
 * A legacy save (no `chariot` at all) is NOT malformed: it resolves to the stock
 * chariot through the workshop's own reader, so a first-time visitor purchase works
 * on it. A `chariot` that is not a plain object, or whose `owned` is not an array,
 * is refused rather than repaired — a purchase that silently rebuilt the list
 * could drop a part the player paid for.
 */
function readOwnedChariotParts(profile: PlayerProfile): string[] | null {
  const chariot = profile.chariot;
  if (chariot === undefined || chariot === null) return resolveChariotLoadout(profile).owned;
  if (typeof chariot !== 'object' || Array.isArray(chariot)) return null;
  if (chariot.owned !== undefined && !Array.isArray(chariot.owned)) return null;
  return resolveChariotLoadout(profile).owned;
}

/**
 * The canonical price, or `null` when it is not a usable price at all. A malformed
 * price must never read as "free": `NaN` and `Infinity` both fail every `gold <`
 * comparison, so without this guard a bad catalogue entry would sell for nothing.
 * A finite zero is a legitimate price (a free gift), so only negative and
 * non-finite values are refused.
 */
export function resolveVisitorItemPrice(
  item: VisitorPriceSource | null | undefined
): number | null {
  const price = item?.price;
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return null;
  return price;
}

/**
 * The little a price source needs: a catalogue `price`. Both the `ITEMS_DB` entry
 * (`GameItem`) and a chariot part (`ChariotPart`) qualify, so L16B's finish is
 * priced by the SAME resolver rather than by a second formula.
 */
export type VisitorPriceSource = { readonly price?: number };

/**
 * L15 — the visitor's asking price: the canonical `ITEMS_DB` price less that
 * visitor's own bargain rate, rounded UP so the shop's discount never rounds to a
 * coin the item did not promise (`ceil(170 × 0.75)` = 128).
 *
 * It is the ONE price rule — `purchaseVisitorOffer` charges what this returns and
 * `VisitorPanel` displays it, so the two cannot drift apart. The canonical price is
 * validated through `resolveVisitorItemPrice` (so `null` in, `null` out, and the
 * `unknown-item` / `invalid-price` distinction upstream is untouched).
 *
 * A rate is valid only strictly inside `(0, 1)`: `0` would make the item free, `1`
 * is no bargain, and anything above it is a markup on the catalogue — so a missing,
 * `NaN`, non-finite, non-numeric or out-of-band rate reads as "no bargain" and the
 * canonical price is charged. Malformed catalogue data can therefore only ever cost
 * the player more, never less. That fallback is what lets the panel show no saving
 * (`price === canonical`) instead of a discount it cannot honour.
 */
export function resolveVisitorBargainPrice(
  item: VisitorPriceSource | null | undefined,
  bargainRate: number | null | undefined
): number | null {
  const canonicalPrice = resolveVisitorItemPrice(item);
  if (canonicalPrice === null) return null;

  const usable =
    typeof bargainRate === 'number' &&
    Number.isFinite(bargainRate) &&
    bargainRate > 0 &&
    bargainRate < 1;
  if (!usable) return canonicalPrice;

  return Math.ceil(canonicalPrice * bargainRate);
}

/**
 * Buy the visitor's one offer for today. A success charges exactly the visitor's
 * bargain price over the item's canonical `ITEMS_DB` price (`result.price` is that
 * amount, so the caller never re-derives it), grants exactly one copy through the
 * established `[...inventory, item]` convention, and appends the visitor to
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

  // L16B — the day's single offer may be a chariot part rather than an item. The
  // schedule classified it, so both branches are reached from this one resolution
  // and neither can be bought on a day the visitor does not bring it.
  if (view.offerPartId) return purchaseVisitorPart(profile, visitor, view.offerPartId);

  const offerItemId = view.offerItemId;
  if (!offerItemId || !visitor.offer.pool.includes(offerItemId)) {
    return { ok: false, reason: 'no-offer' };
  }

  const item = getItemById(offerItemId);
  if (!item) return { ok: false, reason: 'unknown-item' };

  // L15 — the price charged is the visitor's own bargain rate over the canonical
  // price, resolved by the same helper the panel displays. The rate comes from the
  // catalogue, never from a caller, so the UI cannot name a price the trade honours.
  const price = resolveVisitorBargainPrice(item, visitor.bargainRate);
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
    kind: 'item',
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

/**
 * L16B — buy the visitor's chariot-part offer.
 *
 * Reached only from `purchaseVisitorOffer`, with the schedule's own classification,
 * so the offer is re-validated here rather than taken from a caller: the part must
 * still be in the visitor's pool, must exist in `CHARIOT_PARTS`, and must be a
 * visitor-acquired part (`visitorOnly`) — a workshop part that somehow appeared in
 * a pool is refused, not sold through the visitor.
 *
 * Refusals, in the order they are checked: `no-offer` (the part left the pool),
 * `invalid-offer` (unknown id, or a part a visitor must not sell), `invalid-price`,
 * `invalid-gold`, `invalid-ownership` (a malformed `chariot`/`owned` field),
 * `already-owned`, `insufficient-gold`. Nothing is written until all of them pass,
 * and success is ONE profile literal: gold, the chariot's owned list and
 * `completedVisitors` together. The part never enters `profile.inventory`.
 */
function purchaseVisitorPart(
  profile: PlayerProfile,
  visitor: Visitor,
  partId: string
): VisitorPurchaseResult {
  if (!visitor.offer.pool.includes(partId)) return { ok: false, reason: 'no-offer' };

  const part = getChariotPart(partId);
  if (!part || !part.visitorOnly) return { ok: false, reason: 'invalid-offer' };

  const price = resolveVisitorBargainPrice(part, visitor.bargainRate);
  if (price === null) return { ok: false, reason: 'invalid-price' };

  const gold = profile.gold;
  if (typeof gold !== 'number' || !Number.isFinite(gold) || gold < 0) {
    return { ok: false, reason: 'invalid-gold' };
  }

  const owned = readOwnedChariotParts(profile);
  if (owned === null) return { ok: false, reason: 'invalid-ownership' };
  if (owned.includes(part.id)) return { ok: false, reason: 'already-owned' };

  if (gold < price) return { ok: false, reason: 'insufficient-gold' };

  const loadout = resolveChariotLoadout(profile);
  const completed = readCompletedVisitors(profile);

  return {
    ok: true,
    kind: 'part',
    part,
    price,
    profile: {
      ...profile,
      gold: gold - price,
      // The part joins the chariot's own ownership list. `equipped` is carried
      // across as it was: a purchase never changes what the player has fitted.
      chariot: { owned: [...loadout.owned, part.id], equipped: { ...loadout.equipped } },
      // `city.day`, `restDay`, `merchantPurchaseDay` and `seenVisitors` ride across
      // from the stored object untouched — only the completion list changes.
      city: {
        ...readCity(profile),
        completedVisitors: [...completed, visitor.id],
      },
    },
  };
}
