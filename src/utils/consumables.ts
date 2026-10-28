/**
 * S6 — BAZAAR CONSUMABLES: the counted inventory, the buy and the use.
 *
 * The catalogue (names, prices, effects) lives in `data/consumables.ts`. This
 * module is the behaviour: it resolves the profile's lazy `consumables` record,
 * buys one for gold, and applies an item's data-driven effect to the injury.
 *
 * `PlayerProfile.consumables?: Record<string, number>` is optional exactly like
 * `chariot`, `racing` and `laurels`: a save written before this slice has no field
 * at all and must keep loading, so every read goes through `resolveConsumables`,
 * which answers `{}` for a missing, null or malformed field. Nothing migrates it and
 * `createNewProfile()` does not write it — the field appears the first time a
 * consumable is bought.
 *
 * The rules, in one place:
 *   • a buy costs exactly the item's price and can never take gold below zero; a
 *     buy the purse cannot cover is refused before any arithmetic;
 *   • a use needs a LIVE injury and at least one of the item; at zero owned, or with
 *     nothing to treat, it is refused;
 *   • a use decrements the count by one and applies the item's own effect through
 *     the pure `applyConsumableEffect` — a poultice at one fight left clears the
 *     wound, a salve clears any wound outright;
 *   • counts are never negative, and a count that reaches zero drops out of the
 *     record rather than lingering as a meaningless `0`.
 *
 * Every function here is pure and returns a NEW profile (the input and its nested
 * `consumables` record are never mutated); a refusal returns `{ ok: false, reason }`
 * with no profile at all, so a refused buy or use can never reach `saveProfile()`.
 */

import type { PlayerInjury, PlayerProfile } from '../types/game';
import {
  CONSUMABLES,
  getConsumableById,
  type ConsumableEffect,
  type ConsumableItem,
} from '../data/consumables';
import { resolveActiveInjury } from './injury';

/** The fields this module reads, so a bare literal in a suite satisfies it. */
export interface ConsumableRecord {
  consumables?: Record<string, number> | null;
  injury?: PlayerInjury | null;
  gold?: number;
}

/**
 * The profile's owned counts, resolved lazily: absent, null or malformed is `{}`;
 * every known consumable's count is floored to a whole number, negatives and
 * non-numbers are dropped, and a `0` is the same as not owning the item. Ids the
 * catalogue no longer knows are dropped, like the chariot loader drops retired parts.
 * Always a fresh object — a caller can never mutate the save through it.
 */
export function resolveConsumables(
  profile: ConsumableRecord | null | undefined,
): Record<string, number> {
  const raw = profile?.consumables;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const counts: Record<string, number> = {};
  for (const item of CONSUMABLES) {
    const value = (raw as Record<string, unknown>)[item.id];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const count = Math.floor(value);
    if (count > 0) counts[item.id] = count;
  }
  return counts;
}

/** How many of one item the player owns. A malformed save owns none. */
export function getConsumableCount(
  profile: ConsumableRecord | null | undefined,
  id: string,
): number {
  return resolveConsumables(profile)[id] ?? 0;
}

/** The owned items, in catalogue order — what a use surface offers. */
export function ownedConsumables(
  profile: ConsumableRecord | null | undefined,
): ConsumableItem[] {
  const counts = resolveConsumables(profile);
  return CONSUMABLES.filter((item) => (counts[item.id] ?? 0) > 0);
}

/**
 * Apply one item's effect to an injury. The effect is read from the item's data and
 * never restated here: `reduce-injury-fights` takes `magnitude` fights off the clock
 * (clearing at zero), `clear-injury` clears the wound. Pure — the injury handed in is
 * never mutated, and a new object is returned only when the wound survives.
 */
export function applyConsumableEffect(
  injury: PlayerInjury | null,
  effect: ConsumableEffect,
): PlayerInjury | null {
  if (!injury) return null;
  if (effect.kind === 'clear-injury') return null;
  const fightsRemaining = injury.fightsRemaining - effect.magnitude;
  if (fightsRemaining <= 0) return null;
  return { ...injury, fightsRemaining };
}

/* ── buy ─────────────────────────────────────────────────────────────────── */

export type ConsumablePurchaseRejectionReason = 'unknown-item' | 'insufficient-gold';

/**
 * `ok: true` carries the NEW profile and the catalogue entry; a refusal carries no
 * profile, so it cannot be handed to a save writer.
 */
export type ConsumablePurchaseResult =
  | { ok: true; profile: PlayerProfile; item: ConsumableItem }
  | { ok: false; reason: ConsumablePurchaseRejectionReason };

/**
 * Buy one consumable. Gold decreases by exactly the item's price (never below zero:
 * a purse that cannot cover it is refused first), the count rises by one, and
 * `inventory` — the GEAR array — is not touched, because a consumable is not a
 * `WeaponItem` or an `ArmorItem`.
 */
export function purchaseConsumable(
  profile: PlayerProfile,
  itemId: string,
): ConsumablePurchaseResult {
  const item = getConsumableById(itemId);
  if (!item) return { ok: false, reason: 'unknown-item' };

  const gold = (profile as ConsumableRecord | null)?.gold;
  if (typeof gold !== 'number' || !Number.isFinite(gold) || gold < item.price) {
    return { ok: false, reason: 'insufficient-gold' };
  }

  const counts = resolveConsumables(profile);
  return {
    ok: true,
    item,
    profile: {
      ...profile,
      gold: gold - item.price,
      consumables: { ...counts, [item.id]: (counts[item.id] ?? 0) + 1 },
    },
  };
}

/* ── use ─────────────────────────────────────────────────────────────────── */

export type ConsumableUseRejectionReason = 'unknown-item' | 'not-injured' | 'none-owned';

export type ConsumableEligibility =
  | { ok: true; item: ConsumableItem }
  | { ok: false; reason: ConsumableUseRejectionReason };

/**
 * Can this item be used right now? Both grounds the transaction enforces: a LIVE
 * injury to treat (the same reading `calculateTotalStats` makes) and at least one
 * of the item owned.
 */
export function getConsumableUseEligibility(
  profile: PlayerProfile,
  itemId: string,
): ConsumableEligibility {
  const item = getConsumableById(itemId);
  if (!item) return { ok: false, reason: 'unknown-item' };
  if (!resolveActiveInjury(profile?.injury)) return { ok: false, reason: 'not-injured' };
  if (getConsumableCount(profile, item.id) <= 0) return { ok: false, reason: 'none-owned' };
  return { ok: true, item };
}

export type ConsumableUseResult =
  | { ok: true; profile: PlayerProfile; item: ConsumableItem; cleared: boolean }
  | { ok: false; reason: ConsumableUseRejectionReason };

/**
 * Use one consumable on the live injury: the count drops by one (dropping out of the
 * record at zero) and the item's effect is applied by `applyConsumableEffect`.
 * A refusal returns no profile, so nothing is saved.
 */
export function consumeItem(profile: PlayerProfile, itemId: string): ConsumableUseResult {
  const eligibility = getConsumableUseEligibility(profile, itemId);
  if (!eligibility.ok) return { ok: false, reason: eligibility.reason };

  const item = eligibility.item;
  const counts = resolveConsumables(profile);
  const remaining = (counts[item.id] ?? 0) - 1;
  if (remaining <= 0) delete counts[item.id];
  else counts[item.id] = remaining;

  const injury = applyConsumableEffect(resolveActiveInjury(profile.injury), item.effect);
  return {
    ok: true,
    item,
    cleared: injury === null,
    profile: { ...profile, injury, consumables: counts },
  };
}
