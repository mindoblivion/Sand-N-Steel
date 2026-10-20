import { DEFAULT_PLAYER_WEAPON, ITEMS_DB, isWeapon, GameItem } from './itemsDB';

/**
 * ===========================================================================
 * SAND & STEEL — STOREFRONT CATALOGUE LAYER
 * ===========================================================================
 * The hub's shops all draw from the same item pool. This module is the single
 * place that says WHICH items a given storefront offers. It owns no price, no
 * stat and no item of its own: every list is derived from the fields of
 * `ITEMS_DB` (the one source of truth for gear), kept in `ITEMS_DB` order, so
 * an item's rarity or category change is reflected here automatically.
 *
 * Pure data: `getStorefrontStock` only reads `ITEMS_DB` and returns a fresh
 * array of ids, so a caller can never mutate the catalogue through it.
 *
 * Consumed by: `components/hub/ShopTab.tsx`, which renders exactly the ids a
 * city building's own storefront resolves to — and the whole catalogue for the
 * hub's own tab, whose storefront id is 'market'.
 */

/** The five hub storefronts. */
export type StorefrontId = 'forge' | 'armorer' | 'bazaar' | 'merchant' | 'market';

/**
 * The rarities the travelling merchant deals in. A weapon or armor piece is
 * merchant stock exactly when its own `rarity` is one of these.
 */
const MERCHANT_RARITIES: ReadonlySet<GameItem['rarity']> = new Set(['rare', 'legendary']);

/**
 * One predicate per storefront, each expressed only through an item's own
 * fields. `isWeapon()` narrows on the `damageLight` stat every weapon carries,
 * so armor is "everything that is not a weapon" — mirroring how `ITEMS_DB` is
 * composed (`[...ALL_WEAPONS, ...ALL_ARMORS]`).
 */
const STOCK_PREDICATES: Record<StorefrontId, (item: GameItem) => boolean> = {
  // The smith sells every weapon EXCEPT the standard gladius every gladiator
  // already starts with.
  forge: (item) => isWeapon(item) && item.id !== DEFAULT_PLAYER_WEAPON.id,
  // The armorer sells the full armor catalogue.
  armorer: (item) => !isWeapon(item),
  // The travelling merchant deals only in rare and legendary goods.
  merchant: (item) => MERCHANT_RARITIES.has(item.rarity),
  // The bazaar stocks consumables, which arrive in a later phase — an empty
  // list is the correct answer today, not a missing filter.
  bazaar: () => false,
  // The open market shows the whole catalogue (the hub tab's current behaviour).
  market: () => true,
};

/**
 * The ids a storefront offers, in `ITEMS_DB` order. Pure: it reads `ITEMS_DB`
 * and returns a new array, leaving the catalogue untouched.
 */
export function getStorefrontStock(id: StorefrontId): string[] {
  return ITEMS_DB.filter(STOCK_PREDICATES[id]).map((item) => item.id);
}
