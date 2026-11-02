import { canDebitGold } from './goldTransactions';
/**
 * Living City L12/L16B — the one visitor trade transaction.
 *
 * A scheduled visitor offers exactly one item OR one visitor-only chariot part.
 * The offer is re-resolved at purchase time, and a successful trade charges,
 * grants ownership/inventory and completes the visitor in one immutable profile.
 */
import type { PlayerProfile, ChariotLoadout } from '../types/game';
import { getItemById, type GameItem } from '../data/itemsDB';
import { getChariotPart, type ChariotPart } from '../data/chariotParts';
import { resolveChariotLoadout } from './chariotLoadout';
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
  | 'insufficient-gold'
  | 'invalid-offer'
  | 'invalid-ownership'
  | 'already-owned';

export type VisitorPurchaseResult =
  | { ok: true; kind: 'item'; profile: PlayerProfile; item: GameItem; price: number }
  | { ok: true; kind: 'part'; profile: PlayerProfile; part: ChariotPart; price: number }
  | { ok: false; reason: VisitorPurchaseRejectionReason };

export type VisitorPriceSource = { readonly price?: number };

export function resolveVisitorItemPrice(item: VisitorPriceSource | null | undefined): number | null {
  const price = item?.price;
  return typeof price === 'number' && Number.isFinite(price) && price >= 0 ? price : null;
}

/** The one bargain rule for either catalogue: ceil(canonical × valid rate). */
export function resolveVisitorBargainPrice(
  item: VisitorPriceSource | null | undefined,
  bargainRate: number | null | undefined,
): number | null {
  const canonical = resolveVisitorItemPrice(item);
  if (canonical === null) return null;
  const validRate = typeof bargainRate === 'number' &&
    Number.isFinite(bargainRate) && bargainRate > 0 && bargainRate < 1;
  return validRate ? Math.ceil(canonical * bargainRate) : canonical;
}

function recordsWithCompletion(profile: PlayerProfile, visitorId: string) {
  const records =
    profile.records && typeof profile.records === 'object' && !Array.isArray(profile.records)
      ? profile.records
      : {};
  return { ...records, visitorsCompleted: [...readCompletedVisitors(profile), visitorId] };
}

function purchaseVisitorPart(
  profile: PlayerProfile,
  visitorId: string,
  visitorPool: readonly string[],
  partId: string,
  bargainRate: number | undefined,
): VisitorPurchaseResult {
  if (!visitorPool.includes(partId)) return { ok: false, reason: 'no-offer' };
  const part = getChariotPart(partId);
  // A visitor may never become an alternate route to a workshop's ordinary stock.
  if (!part || !part.visitorOnly) return { ok: false, reason: 'invalid-offer' };

  const price = resolveVisitorBargainPrice(part, bargainRate);
  if (price === null) return { ok: false, reason: 'invalid-price' };

  const gold = profile.gold;
  if (typeof gold !== 'number' || !Number.isFinite(gold) || gold < 0) {
    return { ok: false, reason: 'invalid-gold' };
  }

  const stored = profile.chariot;
  if (stored !== undefined && stored !== null) {
    if (typeof stored !== 'object' || Array.isArray(stored)) {
      return { ok: false, reason: 'invalid-ownership' };
    }
    if (stored.owned !== undefined && !Array.isArray(stored.owned)) {
      return { ok: false, reason: 'invalid-ownership' };
    }
    if (stored.equipped !== undefined &&
      (!stored.equipped || typeof stored.equipped !== 'object' || Array.isArray(stored.equipped))) {
      return { ok: false, reason: 'invalid-ownership' };
    }
  }

  const loadout = resolveChariotLoadout(profile);
  if (loadout.owned.includes(partId)) return { ok: false, reason: 'already-owned' };
  if (!canDebitGold(gold, price)) return { ok: false, reason: 'insufficient-gold' };

  const chariot: ChariotLoadout = {
    owned: [...loadout.owned, part.id],
    equipped: { ...(stored?.equipped ?? {}) },
  };

  return {
    ok: true,
    kind: 'part',
    part,
    price,
    profile: {
      ...profile,
      gold: gold - price,
      chariot,
      records: recordsWithCompletion(profile, visitorId),
    },
  };
}

/**
 * Buy today's offer. The visitor id is the ONLY caller-supplied choice; neither
 * item/part id nor price is trusted from the panel.
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

  if (view.offerPartId) {
    return purchaseVisitorPart(
      profile, visitorId, visitor.offer.pool, view.offerPartId, visitor.bargainRate,
    );
  }
  const offerItemId = view.offerItemId;
  if (!offerItemId || !visitor.offer.pool.includes(offerItemId)) {
    return { ok: false, reason: 'no-offer' };
  }

  const item = getItemById(offerItemId);
  if (!item) return { ok: false, reason: 'unknown-item' };
  const price = resolveVisitorBargainPrice(item, visitor.bargainRate);
  if (price === null) return { ok: false, reason: 'invalid-price' };

  const gold = profile.gold;
  if (typeof gold !== 'number' || !Number.isFinite(gold) || gold < 0) {
    return { ok: false, reason: 'invalid-gold' };
  }
  if (!Array.isArray(profile.inventory)) return { ok: false, reason: 'invalid-inventory' };
  if (gold < price) return { ok: false, reason: 'insufficient-gold' };

  return {
    ok: true,
    kind: 'item',
    item,
    price,
    profile: {
      ...profile,
      gold: gold - price,
      inventory: [...profile.inventory, item],
      records: recordsWithCompletion(profile, visitorId),
    },
  };
}
