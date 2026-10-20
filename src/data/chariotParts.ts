/**
 * Phase C-8.66B — the chariot parts catalogue.
 *
 * Chariot parts are their own catalogue on purpose.  `ITEMS_DB` entries are
 * `WeaponItem | ArmorItem` and every screen narrows them by their own fields
 * (`'damageLight' in i`, `'defense' in i`), so mixing chariot parts into those
 * arrays would break that narrowing — and nothing about a chariot part belongs
 * in a weapon's or an armour piece's shape.  This catalogue is therefore
 * additive: no existing item, price, slot or array is touched.
 *
 * Slots: `wheels` (a real, separately modelled wheel variant from
 * `RomanChariot_WheelKit.glb`) and `finish` (a material recolor applied to the
 * chariot's own named materials — `Wood`, `DarkWood`, `Bronze`, `Leather` — with
 * the GLB left byte-identical).
 *
 * `partClass` is the cosmetic/performance classification the workshop shows.
 * No racing or combat number is derived from it: no racing gameplay consumes
 * chariot stats yet, so every part is presented as a fit or cosmetic upgrade
 * and never as a stat change.
 */

import { ChariotSlot } from '../types/game';

/** Wheel variants that are playable now.  Spiked and Bladed are deliberately absent — see below. */
export type ChariotWheelVariantKey = 'standard' | 'reinforced';

/** Finish keys.  `stock` keeps the asset's own materials untouched. */
export type ChariotFinishKey = 'stock' | 'charred' | 'gilded' | 'oxblood';

export type ChariotPartClass = 'performance' | 'cosmetic';

/** One finish override: which of the chariot's own material names it recolors, and to what. */
export interface ChariotFinishOverride {
  material: string;
  color: string;
  roughness?: number;
  metalness?: number;
}

export interface ChariotPart {
  /** Unique, stable id — also the id stored in the player's save. */
  id: string;
  /** The one slot this part occupies. */
  slot: ChariotSlot;
  name: string;
  description: string;
  /** Gold price.  0 = free, and the slot's default is always owned. */
  price: number;
  /**
   * Cosmetic/performance classification.  Purely descriptive: it selects the
   * card's label and nothing else (there is no racing stat to apply it to).
   */
  partClass: ChariotPartClass;
  /** True for the slot's stock part: owned by every profile, at no cost. */
  defaultOwned: boolean;
  /** Set for `wheels` parts: which kit node the preview mounts. */
  wheelVariant?: ChariotWheelVariantKey;
  /** Set for `finish` parts: which finish the preview applies. */
  finish?: ChariotFinishKey;
  /** Set for `finish` parts: what the finish recolors, in catalogue order. */
  overrides?: ChariotFinishOverride[];
}

/**
 * The initial catalogue.
 *
 * Spiked and Bladed wheels are deliberately NOT sold in this phase: their rims
 * reach 0.8025 and 0.8429 radius against the reinforced set's 0.7025, so their
 * ground clearance and hub alignment need a separate measured visual-fit pass —
 * and the bladed variant is mirrored left/right, which the kit's single wheel
 * node does not express.  They stay out of the catalogue until that phase.
 */
export const CHARIOT_PARTS: ChariotPart[] = [
  // ── Slot: wheels ──────────────────────────────────────────────────────
  {
    id: 'wheels_standard',
    slot: 'wheels',
    name: 'Standard Wheel Set',
    description:
      'The workshop\'s stock racing wheel: ash rim, eight spokes, bronze hub. Fitted to every chariot by default.',
    price: 0,
    partClass: 'performance',
    defaultOwned: true,
    wheelVariant: 'standard',
  },
  {
    id: 'wheels_reinforced',
    slot: 'wheels',
    name: 'Reinforced Wheel Set',
    description:
      'Iron-banded rim with leather-bound spokes and a deeper bronze hub. A heavier, meaner wheel on the same axle.',
    price: 450,
    partClass: 'performance',
    defaultOwned: false,
    wheelVariant: 'reinforced',
  },

  // ── Slot: finish ──────────────────────────────────────────────────────
  {
    id: 'finish_stock',
    slot: 'finish',
    name: 'Workshop Stock Finish',
    description:
      'The chariot as it left the bench: bare ash, dark walnut chassis, bronze fittings and plain hide binding.',
    price: 0,
    partClass: 'cosmetic',
    defaultOwned: true,
    finish: 'stock',
  },
  {
    id: 'finish_charred',
    slot: 'finish',
    name: 'Charred Ebony Timber',
    description:
      'The tub and chassis scorched to a deep ebony — the colour veteran racing teams favour for a used, working chariot.',
    price: 180,
    partClass: 'cosmetic',
    defaultOwned: false,
    finish: 'charred',
    overrides: [
      { material: 'Wood', color: '#241a12', roughness: 0.88 },
      { material: 'DarkWood', color: '#140e09', roughness: 0.9 },
    ],
  },
  {
    id: 'finish_gilded',
    slot: 'finish',
    name: 'Gilded Parade Trim',
    description:
      'Every bronze fitting polished and gilded for the procession, with dark red hide binding on the tub\'s open ends.',
    price: 320,
    partClass: 'cosmetic',
    defaultOwned: false,
    finish: 'gilded',
    overrides: [
      { material: 'Bronze', color: '#e0b558', roughness: 0.22, metalness: 1 },
      { material: 'Leather', color: '#6b1d1d', roughness: 0.75 },
    ],
  },
  {
    id: 'finish_oxblood',
    slot: 'finish',
    name: 'Oxblood Hide & Ash',
    description:
      'New oxblood leather over the binding and a paler, sun-bleached ash on the tub and draught pole.',
    price: 240,
    partClass: 'cosmetic',
    defaultOwned: false,
    finish: 'oxblood',
    overrides: [
      { material: 'Leather', color: '#7f1d1d', roughness: 0.7 },
      { material: 'Wood', color: '#c9a86b', roughness: 0.65 },
    ],
  },
];

const PARTS_BY_ID: ReadonlyMap<string, ChariotPart> = new Map(
  CHARIOT_PARTS.map((part) => [part.id, part])
);

/** The slot's stock part — the one every profile owns at no cost. */
export const getDefaultChariotPart = (slot: ChariotSlot): ChariotPart =>
  CHARIOT_PARTS.find((part) => part.slot === slot && part.defaultOwned) as ChariotPart;

/** Look up a chariot part by its stable id. */
export const getChariotPart = (id: string): ChariotPart | undefined => PARTS_BY_ID.get(id);

/** The `finish` part that carries a finish key — what the preview reads its overrides from. */
export const getChariotPartByFinish = (finish: ChariotFinishKey): ChariotPart | undefined =>
  CHARIOT_PARTS.find((part) => part.slot === 'finish' && part.finish === finish);

/** Every catalogue entry for one slot, in catalogue order. */
export const chariotPartsBySlot = (slot: ChariotSlot): ChariotPart[] =>
  CHARIOT_PARTS.filter((part) => part.slot === slot);

/**
 * The stock part ids.  `wheels_standard` and `finish_stock` are the fallbacks a
 * legacy save (no `chariot` field) and a corrupt/partial loadout resolve to.
 */
export const DEFAULT_CHARIOT_WHEELS = getDefaultChariotPart('wheels').id;
export const DEFAULT_CHARIOT_FINISH = getDefaultChariotPart('finish').id;

/** Does this part id exist in the catalogue? */
export const isChariotPartId = (id: string): boolean => PARTS_BY_ID.has(id);
