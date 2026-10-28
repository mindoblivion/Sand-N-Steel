/**
 * ===========================================================================
 * SAND & STEEL — KEEPER STATE LINES (slice K4-STATE)
 * ===========================================================================
 * building-keepers.md §4.1(c): a keeper's plate speaks to the STATE the player
 * walked in with — injured at the Medical House or the Inn, broke at a
 * storefront — where that state is cheap to read and legible on the plate.  The
 * plate is a HEADER, never a modal: it never blocks the panel's business, and
 * every price, cure effect and rest effect is exactly what the surface already
 * charged (the Shops ladder's transactions).
 *
 * ── What this module is, and is not ──────────────────────────────────────
 * It is the TRIGGER, not the words: the seven lines live on the registry rows in
 * `data/keepers.ts` (`Keeper.stateLines`).  It owns no price of its own — a
 * storefront's floor is computed from the same `data/shops.ts` stock the surface
 * renders and the same `ITEMS_DB` / consumable prices its buttons charge — and it
 * reads no clock, no save and no profile field beyond the two that already exist
 * (`injury` through `resolveActiveInjury`, and `gold`).  No new profile field.
 *
 * ── Precedence (Director ruling, flagged) ────────────────────────────────
 *   STATE > NIGHT > own (seen/repeat/first-visit)
 * A state line is the most specific signal a counter can have, so it wins even
 * after dark — a broke gladiator at night hears the smith's line, not the night
 * clerk's.  Each surface freezes the reading where it already freezes the
 * greeting: `CityHubScene` at panel open, `ShopTab` per its own render pattern.
 *
 * ── Deferred, deliberately ───────────────────────────────────────────────
 * Race-day lines (Mappa's PreRacePanel plate is unbuilt) and live-bounty lines
 * (no Hall panel exists) are NOT here: writing them would invent panels.
 */

import type { Keeper, KeeperStateLines } from '../data/keepers';
import type { StorefrontId } from '../data/shops';
import { getVisibleStorefrontStock } from '../data/shops';
import { ITEMS_DB } from '../data/itemsDB';
import { CONSUMABLES } from '../data/consumables';
import type { PlayerProfile } from '../types/game';
import { resolveActiveInjury } from './injury';

/** Which of a keeper's state lines a visit calls for. */
export type KeeperStateKey = keyof KeeperStateLines;

/**
 * Every purchasable price this city can quote, by id: the gear catalogue plus the
 * Bazaar's counted consumables.  Read-only, built once — those two tables are the
 * single sources the surfaces charge from, so a floor can never drift from a
 * button's price.
 */
const PRICE_BY_ID = new Map<string, number>([
  ...ITEMS_DB.map((item) => [item.id, item.price] as const),
  ...CONSUMABLES.map((item) => [item.id, item.price] as const),
]);

/**
 * The ids a counter actually sells this gladiator: the storefront's own stock,
 * and for the Bazaar its counted consumables — its GEAR stock is empty by design
 * (S6 moved the stall's trade to poultices and salves), so a gear-only reading
 * would call every purse broke in a shop that sells nothing.
 */
export function storefrontStock(
  shopId: StorefrontId,
  profile: PlayerProfile | null | undefined
): string[] {
  if (shopId === 'bazaar') return CONSUMABLES.map((item) => item.id);
  return getVisibleStorefrontStock(shopId, profile);
}

/**
 * The lowest price among a list of catalogue ids, or `null` when there is nothing
 * on the shelf to buy.  A counter with no purchasable stock has no floor.
 */
export function lowestStockPrice(ids: readonly string[]): number | null {
  const prices: number[] = [];
  for (const id of ids) {
    const price = PRICE_BY_ID.get(id);
    if (typeof price === 'number' && Number.isFinite(price)) prices.push(price);
  }
  return prices.length === 0 ? null : Math.min(...prices);
}

/** The lowest price this counter can charge this gladiator — `null` when it sells nothing. */
export function lowestPurchasablePrice(
  shopId: StorefrontId,
  profile: PlayerProfile | null | undefined
): number | null {
  return lowestStockPrice(storefrontStock(shopId, profile));
}

/**
 * Is this purse below the counter's floor?  `null` (nothing purchasable) is never
 * "broke", and a malformed balance affords nothing, so it is.
 */
export function purseBelowFloor(gold: unknown, floor: number | null): boolean {
  if (floor === null) return false;
  const balance = typeof gold === 'number' && Number.isFinite(gold) ? gold : 0;
  return balance < floor;
}

/**
 * Which state line this visit calls for, in precedence order: a live injury, then
 * its absence where a keeper speaks to that, then a purse below the counter's
 * floor.  `null` means the counter keeps its own line (and, after dark, the night
 * clerk's).
 *
 * `shopId` is passed only by a storefront: the two treatment counters sell a
 * service, not a catalogue, so no price floor exists there.
 */
export function keeperStateFor(
  keeper: Keeper,
  profile: PlayerProfile | null | undefined,
  shopId?: StorefrontId
): KeeperStateKey | null {
  const lines = keeper.stateLines;
  if (!lines) return null;

  const injured = resolveActiveInjury(profile?.injury) !== null;
  if (injured && lines.injured) return 'injured';
  if (!injured && lines.uninjured) return 'uninjured';

  if (lines.broke && shopId !== undefined) {
    if (purseBelowFloor(profile?.gold, lowestPurchasablePrice(shopId, profile))) return 'broke';
  }

  return null;
}

/**
 * The state line this visit calls for, or `''` so a caller can put it straight at
 * the top of its own precedence chain (`stateLine || nightLine || ownLine`).
 */
export function keeperStateLineFor(
  keeper: Keeper,
  profile: PlayerProfile | null | undefined,
  shopId?: StorefrontId
): string {
  const key = keeperStateFor(keeper, profile, shopId);
  return key === null ? '' : keeper.stateLines?.[key] ?? '';
}
