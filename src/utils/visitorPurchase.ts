/**
 * Living City L12 — the one visitor item-trade transaction.
 *
 * The offer is re-resolved from today's schedule at purchase time. A successful
 * trade charges the visitor's catalogue bargain price, grants one canonical item,
 * and records completion in the SAME profile update. No clock/day advancement,
 * experience, fame, merchant allowance or second discount is involved.
 */
import type { PlayerProfile } from '../types/game';
import { getItemById, type GameItem } from '../data/itemsDB';
import { getVisitor } from '../data/visitors';
import { resolveVisitorEncounter } from './visitorEncounter';
import { readCompletedVisitors } from './visitorSchedule';

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

export type VisitorPurchaseResult =
  | { ok: true; profile: PlayerProfile; item: GameItem; price: number }
  | { ok: false; reason: VisitorPurchaseRejectionReason };

/** Canonical item price less the visitor's valid bargain rate, rounded upward. */
export function resolveVisitorBargainPrice(
  item: { readonly price?: number } | null | undefined,
  bargainRate: number | null | undefined,
): number | null {
  const canonical = item?.price;
  if (typeof canonical !== 'number' || !Number.isFinite(canonical) || canonical < 0) {
    return null;
  }
  const validRate =
    typeof bargainRate === 'number' &&
    Number.isFinite(bargainRate) &&
    bargainRate > 0 &&
    bargainRate < 1;
  return validRate ? Math.ceil(canonical * bargainRate) : canonical;
}

/**
 * Buy the visitor's scheduled item. All checks precede the one immutable commit;
 * a rejection never mutates the supplied profile or partially grants anything.
 */
export function purchaseVisitorOffer(
  profile: PlayerProfile | null | undefined,
  visitorId: string,
): VisitorPurchaseResult {
  if (!profile) return { ok: false, reason: 'no-profile' };

  const visitor = getVisitor(visitorId);
  if (!visitor) return { ok: false, reason: 'unknown-visitor' };

  if (readCompletedVisitors(profile).includes(visitorId)) {
    return { ok: false, reason: 'already-completed' };
  }

  const view = resolveVisitorEncounter(profile, visitorId);
  if (!view) return { ok: false, reason: 'not-in-town' };
  if (!view.offerItemId || !visitor.offer.pool.includes(view.offerItemId)) {
    return { ok: false, reason: 'no-offer' };
  }

  const item = getItemById(view.offerItemId);
  if (!item) return { ok: false, reason: 'unknown-item' };

  const price = resolveVisitorBargainPrice(item, visitor.bargainRate);
  if (price === null) return { ok: false, reason: 'invalid-price' };

  const gold = profile.gold;
  if (typeof gold !== 'number' || !Number.isFinite(gold) || gold < 0) {
    return { ok: false, reason: 'invalid-gold' };
  }
  if (!Array.isArray(profile.inventory)) {
    return { ok: false, reason: 'invalid-inventory' };
  }
  if (gold < price) return { ok: false, reason: 'insufficient-gold' };

  const records =
    profile.records && typeof profile.records === 'object' && !Array.isArray(profile.records)
      ? profile.records
      : {};
  const completed = readCompletedVisitors(profile);

  return {
    ok: true,
    item,
    price,
    profile: {
      ...profile,
      gold: gold - price,
      inventory: [...profile.inventory, item],
      records: { ...records, visitorsCompleted: [...completed, visitorId] },
    },
  };
}
