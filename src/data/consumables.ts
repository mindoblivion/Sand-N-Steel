/**
 * ===========================================================================
 * SAND & STEEL — BAZAAR CONSUMABLES (S6)
 * ===========================================================================
 * The Bazaar's counter has displayed potions since the storefront was built; this
 * module is the catalogue that makes them real. Consumables are **not** gear: they
 * are never `WeaponItem` / `ArmorItem`, they never enter `profile.inventory`, and
 * nothing here carries a stat. An item is a name, a price and one effect.
 *
 * Prices are the design's own (shops-and-completion.md §1.2, as amended by
 * design-reconciliation C4c):
 *
 *   | item            | price | effect                                  |
 *   |-----------------|-------|-----------------------------------------|
 *   | Field Poultice  | 20 g  | one fight comes off the wound's clock   |
 *   | Medicus Salve   | 90 g  | the wound is cleared outright           |
 *
 * Medicus Salve is **90 g** under C4c — the portable premium cure. The original
 * S6 text's 45 g is superseded and must not be restored.
 *
 * The effect is DATA (`kind` + `magnitude`). Applying it is `utils/consumables.ts`'s
 * job (`applyConsumableEffect`), never this file's — this module owns no behaviour,
 * no storage and no profile.
 */

/** The two Bazaar consumables. Stored as keys of `profile.consumables`. */
export type ConsumableId = 'field_poultice' | 'medicus_salve';

/**
 * What a consumable does to the player's live injury:
 *   • `reduce-injury-fights` — take `magnitude` fights off the wound's clock,
 *     clearing the injury when the clock reaches zero;
 *   • `clear-injury` — clear the wound outright (`magnitude` is 0).
 */
export interface ConsumableEffect {
  kind: 'reduce-injury-fights' | 'clear-injury';
  magnitude: number;
}

/** One purchasable consumable. Never a `GameItem`. */
export interface ConsumableItem {
  id: ConsumableId;
  name: string;
  description: string;
  /** Gold price. The single source for the transaction and the buy surface. */
  price: number;
  effect: ConsumableEffect;
}

/** The Bazaar's stock, in display order. */
export const CONSUMABLES: readonly ConsumableItem[] = [
  {
    id: 'field_poultice',
    name: 'Field Poultice',
    description:
      'Vinegar, bitter herbs and clean linen, pressed on in the changing room. One fight comes off a wound.',
    price: 20,
    effect: { kind: 'reduce-injury-fights', magnitude: 1 },
  },
  {
    id: 'medicus_salve',
    name: 'Medicus Salve',
    description:
      "A sealed clay pot of the medicus' own salve, carried out of the arena. Closes a wound outright.",
    price: 90,
    effect: { kind: 'clear-injury', magnitude: 0 },
  },
];

/** The catalogue entry behind an id, or `undefined` for an id no build knows. */
export function getConsumableById(id: string): ConsumableItem | undefined {
  return CONSUMABLES.find((item) => item.id === id);
}
