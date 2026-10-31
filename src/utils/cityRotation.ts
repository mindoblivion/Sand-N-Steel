/**
 * L2 (Living City) — day-based storefront rotation: the ONE deterministic
 * answer to "what does this shop offer on this city day?".
 *
 * The Living City discovery audit (`AGENTS.md`) found the shop stock today is a
 * pure function of the item catalogue (`data/shops.ts` → `getStorefrontStock`),
 * which means it can never change and can never be re-rolled by leaving, by
 * reloading or by a cloud save — but also that a "rotating" shop does not exist
 * yet. This module adds ONLY the rotation arithmetic on top of that existing
 * layer. It owns no item, no price, no eligibility rule and no shop screen:
 *
 *   • eligibility is `getStorefrontStock(id)` — the one authoritative list, in
 *     `ITEMS_DB` order. Rotation only ever SELECTS from it, so a rotating shop
 *     can never offer an item its own storefront would not stock;
 *   • the day is `resolveCityDay(profile)` from `utils/cityClock.ts`. There is no
 *     second clock, no wall clock, no timer and no randomness here, so the same
 *     day always produces the same stock — after a reload, on another device, and
 *     on a local or a Drive save alike. Nothing is persisted: the rotation is
 *     derived from the saved day, so it cannot drift from it;
 *   • a storefront that does not rotate resolves to EXACTLY its full eligible
 *     stock, so wiring a later phase's shop screen to this resolver cannot change
 *     what those shops sell.
 *
 * Supported categories (the whole of L2):
 *   - `merchant` — ROTATES. `MERCHANT_ROTATION_SLOTS` of its rare/legendary goods
 *     are on offer each day.
 *   - `forge`, `armorer`, `market` — the permanent spine, never rotated: they are
 *     what progression depends on, and `market` must stay complete so no item ever
 *     becomes unreachable.
 *   - `bazaar` — has no stock at all today (consumables are a later phase), so it
 *     offers nothing on every day; an empty list is the correct answer, not a
 *     rotation.
 *
 * L3 consumes this module: `resolveStorefrontOffer(profile, id)` is the ONE list
 * the merchant screen renders and `isStorefrontItemOnOffer(...)` the ONE gate the
 * purchase handler checks, so a card on screen and a purchase agree by
 * construction. Still out of scope: daily purchase limits, per-day transaction
 * records, a rest/training schedule and day/night visuals.
 */

import { getStorefrontStock, type StorefrontId } from '../data/shops';
import type { CityState } from '../types/game';
import { normalizeCityDay, resolveCityDay } from './cityClock';

/** The little of a profile this module needs: the clock lives on `city`. */
type CityCarrier = { city?: CityState };

/** How many of the travelling merchant's goods are on offer on one day. */
export const MERCHANT_ROTATION_SLOTS = 4;

/**
 * How many of a storefront's eligible ids a day lists. `null` means the
 * storefront does not rotate and always offers its full eligible stock. The
 * `Record<StorefrontId, …>` makes a newly added storefront a type error here
 * rather than a silently non-rotating shop.
 */
const ROTATION_SLOTS: Record<StorefrontId, number | null> = {
  forge: null,
  armorer: null,
  bazaar: null,
  merchant: MERCHANT_ROTATION_SLOTS,
  market: null,
};

/** The storefronts whose stock changes with the day (derived, never a second list). */
export const ROTATING_STOREFRONTS: readonly StorefrontId[] = (
  Object.keys(ROTATION_SLOTS) as StorefrontId[]
).filter((id) => ROTATION_SLOTS[id] !== null);

/** One storefront's offer for one day. */
export interface StorefrontRotation {
  storefront: StorefrontId;
  /** True when the day changes which items are listed. */
  rotates: boolean;
  /** How many ids are on offer today. */
  slots: number;
  /** The ids on offer, in `ITEMS_DB` order (a fresh array, never the catalogue). */
  itemIds: string[];
}

/** Every storefront's offer for one city day. */
export interface CityRotation {
  /** The resolved city day — exactly what `resolveCityDay` answered. */
  day: number;
  storefronts: Record<StorefrontId, StorefrontRotation>;
}

/**
 * FNV-1a (32-bit) over a small ASCII key. Deterministic across platforms and
 * runs by construction: integer mixing only, no floating point, no locale.
 */
function hash32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Where this day's window starts in the eligible list (never random). */
function rotationStart(day: number, id: string, size: number): number {
  return hash32(`sand-and-steel:city-rotation:${id}:${day}`) % size;
}

/**
 * The ids one storefront offers on one day, in `ITEMS_DB` order.
 *
 * A rotating storefront lists a contiguous window of its eligible list, wrapped
 * and re-sorted into catalogue order; a non-rotating one lists its whole
 * eligible stock. Pure and total: any day at all (via `normalizeCityDay`) and
 * any eligible list length is answerable, and the caller gets a fresh array it
 * may mutate freely.
 *
 * `id` is a NAMESPACE IN THE HASH KEY, not a storefront lookup: this function
 * never reads `ROTATION_SLOTS`, so it is typed `string` (rather than
 * `StorefrontId` since L10) so the Living City's visitors can reuse the ONE
 * rotation instead of growing a second hash. Callers that pass a storefront id
 * are unchanged, and `rotateStorefrontStock` still takes a `StorefrontId`.
 */
export function selectDailyWindow(
  eligible: readonly string[],
  slots: number | null,
  id: string,
  day: number
): string[] {
  if (slots === null || slots >= eligible.length || eligible.length === 0) {
    return [...eligible];
  }

  const start = rotationStart(normalizeCityDay(day), id, eligible.length);
  const picked: number[] = [];
  for (let i = 0; i < slots; i += 1) picked.push((start + i) % eligible.length);
  picked.sort((a, b) => a - b);

  return picked.map((index) => eligible[index]);
}

/**
 * The ids one storefront offers on one day, in `ITEMS_DB` order.
 *
 * A rotating storefront lists a contiguous window of its eligible list, wrapped
 * and re-sorted into catalogue order; a non-rotating one lists its whole
 * eligible stock. Pure and total: any day at all (via `normalizeCityDay`) and
 * any eligible list length is answerable, and the caller gets a fresh array it
 * may mutate freely.
 */
export function rotateStorefrontStock(id: StorefrontId, day: number): string[] {
  return selectDailyWindow(getStorefrontStock(id), ROTATION_SLOTS[id], id, day);
}

/**
 * L3 — the ids a storefront offers on the day the profile is on: the ONE list
 * the shop screen renders and the ONE list the purchase gate checks, so the two
 * cannot disagree about what is on offer today.
 */
export function resolveStorefrontOffer(
  profile: CityCarrier | null | undefined,
  id: StorefrontId
): string[] {
  return selectDailyWindow(getStorefrontStock(id), ROTATION_SLOTS[id], id, resolveCityDay(profile));
}

/**
 * L3 — whether a storefront offers `itemId` on the profile's current city day.
 * `false` for an item the storefront stocks but the day's window leaves off, so
 * buying can never bypass the rotation. Buying, opening or leaving a shop never
 * advances the day: this helper only reads it.
 */
export function isStorefrontItemOnOffer(
  profile: CityCarrier | null | undefined,
  id: StorefrontId,
  itemId: string
): boolean {
  return resolveStorefrontOffer(profile, id).includes(itemId);
}

/**
 * The whole city's stock for the day the profile is on — the single entry point
 * a later phase wires a shop screen to. Resolves the day through the one clock,
 * so a legacy save (no `city`) reads day 1 and a malformed day reads whatever
 * `normalizeCityDay` makes of it; neither is repaired on write.
 */
export function resolveCityRotation(profile?: CityCarrier | null): CityRotation {
  const day = resolveCityDay(profile);
  const storefronts = {} as Record<StorefrontId, StorefrontRotation>;

  for (const id of Object.keys(ROTATION_SLOTS) as StorefrontId[]) {
    const rotates = ROTATION_SLOTS[id] !== null;
    const itemIds = rotateStorefrontStock(id, day);
    storefronts[id] = { storefront: id, rotates, slots: itemIds.length, itemIds };
  }

  return { day, storefronts };
}
