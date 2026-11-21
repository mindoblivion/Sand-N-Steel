/**
 * FORGECRAFT-1 + FORGECRAFT-2 — combining: two copies of one weapon + gold
 * → the next weapon up its ladder (the forge, Sextus), and two copies of
 * one piece of armor + gold → the next piece up its ladder (the armorer,
 * Salvia).
 *
 * This module is the whole data model for crafting.  It owns the authored
 * recipe ladders, the fee rule and the transaction:
 *
 *   • `FORGE_RECIPES`             — the eight authored weapon recipes (§1 of
 *     the FORGECRAFT-1 brief);
 *   • `ARMOR_RECIPES`             — the ten authored armor recipes (§0 of
 *     the FORGECRAFT-2 brief), bridging the two gaps in the P0 ladder
 *     (no steel helm, no iron chest);
 *   • `getForgeRecipeForInput` / `getArmorRecipeForInput` — the recipe an
 *     id feeds, if any;
 *   • `getForgeCraftFee`          — the gold cost of a craft (25 % of the
 *     result price, rounded to the nearest 5 gold) — one rule, both kinds;
 *   • `getForgeCraftEligibility`  — the craft rules, read out before a caller
 *     draws a control; it dispatches on the entries' kind (weapon vs
 *     armor), or on an explicit `kind` a section passes when it only ever
 *     offers one kind;
 *   • `craftForgeItems`           — the transaction, one shape for both kinds;
 *   • `describeForgeCraftRejection` — the sentence a refusal prints.
 *
 * Everything here follows the tempering / purchase / selling pattern:
 *   • no profile and no owned item object is ever mutated in place — a success
 *     returns a NEW `PlayerProfile` for the caller to hand to the existing
 *     `saveProfile()` path;
 *   • a refused call returns the caller's own profile object, untouched, so a
 *     failed craft cannot move gold or lose an item;
 *   • a legacy save (no optional fields at all) never throws — crafting reads
 *     only `inventory`, `equipped` and `gold`, all required fields.
 *
 * The ladders are AUTHORERD, not derived: the catalogue has no tier field and
 * price order is not a ladder (the 90 g parma is weaker than the 50 g
 * gladius), so each recipe names its input and its result outright.  A craft
 * is deterministic — every input pair has exactly one result, previewed
 * before the button is pressed.  There is no bonus roll, no material, no
 * gate beyond the wooden exclusion (weapons) and the Master Forge gate on
 * the two champion-gilded armor results (armor, §4 of the FORGECRAFT-2
 * brief): pine and wicker cannot be forged into steel, and a champion's
 * plate waits for the Smithing Workshop at L2.
 *
 * Crafted results are plain catalogue items appended to `inventory`, so no
 * new save field is needed (§J stays at 29) and combat sees them through the
 * existing effective-stats path — this module never touches
 * `combatCalculations.ts`.
 */

import type { ArmorItem, ArmorSlot, PlayerProfile, WeaponItem } from '../types/game';
import { getItemById } from '../data/itemsDB';
import { gildedUnlocked, requiresMasterForge } from './facilityProgression';
import { canDebitGold } from './goldTransactions';

/** The fee is this share of the result's price (the temper precedent: % of price, derived not hardcoded). */
export const FORGE_CRAFT_FEE_RATIO = 0.25;

/** Every fee is rounded to the nearest 5 gold. */
export const FORGE_CRAFT_FEE_ROUNDING = 5;

/** One authored recipe: two copies of `inputId` forge into `resultId`. */
export interface ForgeRecipe {
  inputId: string;
  resultId: string;
}

/**
 * The eight authored recipes (brief §1).  One ladder per weapon type, by
 * stats — never by price.  Wooden pieces, the shield line (`shd_parma_pugio`,
 * `shd_scutum_gladius`) and the hasta (`wpn_hasta`) have no recipe: wooden
 * cannot be forged into steel, and the shield line / hasta have no upward
 * catalogue row.  Ladder tops (shamshir, trident, vipers, titan) have no
 * outgoing recipe either.
 */
export const FORGE_RECIPES: readonly ForgeRecipe[] = [
  { inputId: 'gladius_standard', resultId: 'spatha_legion' },
  { inputId: 'spatha_legion', resultId: 'shamshir_curved' },
  { inputId: 'hoplite_spear', resultId: 'wpn_pilum' },
  { inputId: 'wpn_pilum', resultId: 'trident_retarius' },
  { inputId: 'dagger_pugio', resultId: 'dirk_desert' },
  { inputId: 'dirk_desert', resultId: 'dual_sicae_daggers' },
  { inputId: 'dual_sicae_daggers', resultId: 'dual_vipers' },
  { inputId: 'bronze_mace', resultId: 'titan_colossus_mace' },
  // Material-grade weapon lines: two matching copies forge into the next metal.
  { inputId: 'bronze_sword_shield', resultId: 'iron_sword_shield' },
  { inputId: 'iron_sword_shield', resultId: 'steel_sword_shield' },
  { inputId: 'bronze_two_handed_spear', resultId: 'iron_two_handed_spear' },
  { inputId: 'iron_two_handed_spear', resultId: 'steel_two_handed_spear' },
] as const;

/** The wooden pieces: pine and wicker cannot be forged into steel. */
export const FORGE_WOODEN_INPUT_IDS: readonly string[] = [
  'wooden_sword_shield',
  'wooden_spear',
  'wooden_daggers',
] as const;

/**
 * The ten authored armor recipes (FORGECRAFT-2 brief §0).  One ladder per
 * slot, by the shipped P0 ladder (bronze → iron → steel → gilded) — arms
 * and legs run the full four rungs; helm and chest each bridge one gap,
 * because the catalogue ships no steel helm and no iron chest:
 * `helm_galea_iron` jumps straight to the gilded champion, and
 * `chest_lorica_segmentata` jumps straight to the steel hamata.  The
 * off-ladder specials (`helm_centurion`, `chest_golden_muscled`) and the
 * four gilded tops have no recipe — no rung either way, no row above.
 * No wooden armor exists, so no wooden exclusion arises here.
 */
export const ARMOR_RECIPES: readonly ForgeRecipe[] = [
  { inputId: 'arms_manica', resultId: 'arms_manica_iron' },
  { inputId: 'arms_manica_iron', resultId: 'arms_manica_steel' },
  { inputId: 'arms_manica_steel', resultId: 'arms_galerus_gilded' },
  { inputId: 'legs_greaves_bronze', resultId: 'legs_greaves_iron' },
  { inputId: 'legs_greaves_iron', resultId: 'legs_greaves_steel' },
  { inputId: 'legs_greaves_steel', resultId: 'legs_greaves_gilded' },
  { inputId: 'helm_murmillo', resultId: 'helm_galea_iron' },
  { inputId: 'helm_galea_iron', resultId: 'helm_champion_gilded' },
  { inputId: 'chest_lorica_segmentata', resultId: 'chest_lorica_hamata' },
  { inputId: 'chest_lorica_hamata', resultId: 'chest_champion_gilded' },
] as const;

/** Why a craft was refused.  `ok: true` never carries a reason. */
export type ForgeCraftRejectionReason =
  | 'no-profile'
  | 'invalid-index'
  | 'not-a-weapon'
  | 'not-armor'
  | 'mismatched-inputs'
  | 'wooden'
  | 'no-forge-path'
  | 'workshop-locked'
  | 'equipped'
  | 'insufficient-gold';

/** The recipe a weapon id feeds, or `undefined` when it has no forge path. */
export function getForgeRecipeForInput(inputId: string): ForgeRecipe | undefined {
  return FORGE_RECIPES.find((recipe) => recipe.inputId === inputId);
}

/** The recipe an armor id feeds, or `undefined` when it has no forge path. */
export function getArmorRecipeForInput(inputId: string): ForgeRecipe | undefined {
  return ARMOR_RECIPES.find((recipe) => recipe.inputId === inputId);
}

/**
 * The gold cost of forging into `result`: 25 % of the result's `price`,
 * rounded to the nearest 5 gold.
 *
 * Worked examples the suite pins: spatha (180 g) → 45; shamshir (340 g) → 85;
 * pilum (150 g) → 40; trident (360 g) → 90; dirk (170 g) → 45; sicae
 * (210 g) → 55; vipers (850 g) → 215; titan (920 g) → 230.
 */
export function getForgeCraftFee(result: { price: number }): number {
  const raw = result.price * FORGE_CRAFT_FEE_RATIO;
  return Math.round(raw / FORGE_CRAFT_FEE_ROUNDING) * FORGE_CRAFT_FEE_ROUNDING;
}

/** Whether an inventory entry is a weapon (the `'damageLight' in i` rule GearTab already uses). */
function isWeaponEntry(item: unknown): item is WeaponItem {
  return (
    !!item &&
    typeof item === 'object' &&
    'damageLight' in (item as Record<string, unknown>)
  );
}

/** Whether an inventory entry is armor (the `'defense' in i` rule GearTab already uses). */
function isArmorEntry(item: unknown): item is ArmorItem {
  return (
    !!item &&
    typeof item === 'object' &&
    'defense' in (item as Record<string, unknown>)
  );
}

/**
 * The inventory index the equipment explains for the equipped weapon — the
 * first entry carrying the equipped weapon's id (the selling.ts / GearTab
 * rule: the starter gladius genuinely sits in both `equipped.weapon` and
 * `inventory`).  `-1` when no inventory entry carries it.
 */
function equippedWeaponInventoryIndex(profile: PlayerProfile): number {
  const equippedId = profile.equipped?.weapon?.id;
  if (!equippedId) return -1;
  const inventory = Array.isArray(profile.inventory) ? profile.inventory : [];
  return inventory.findIndex((item) => item?.id === equippedId);
}

/**
 * The same rule, per armor slot: the first inventory entry carrying the id
 * equipped in `slot`.  An armor id belongs to exactly one slot, so at most
 * one slot's equipped index can match a picked entry.  `-1` when nothing
 * is equipped in the slot or no inventory entry carries it.
 */
function equippedArmorInventoryIndex(profile: PlayerProfile, slot: ArmorSlot): number {
  const equippedId = profile.equipped?.[slot]?.id;
  if (!equippedId) return -1;
  const inventory = Array.isArray(profile.inventory) ? profile.inventory : [];
  return inventory.findIndex((item) => item?.id === equippedId);
}

/**
 * The craft rules, read out before a caller draws a control.  Validation runs
 * in this order, and the first failure is the reason:
 *
 *   1. a profile exists;
 *   2. both indices are integers pointing at inventory entries;
 *   3. both entries are the same kind — both weapons (the forge) or both
 *      armor (the armorer).  A section that only ever offers one kind may
 *      pass `kind` to pin that: armor offered to the forge refuses
 *      `'not-a-weapon'`, weapons offered to the armorer refuse
 *      `'not-armor'`.  Without `kind`, a mixed or malformed pair refuses
 *      `'not-a-weapon'`;
 *   4. both entries carry the same id (a craft fuses two copies of ONE piece);
 *   5. the id is not wooden (pine and wicker cannot be forged into steel —
 *      weapons only; no wooden armor exists);
 *   6. the id feeds a recipe (shield line, hasta and ladder tops have none;
 *      off-ladder armor and gilded tops have none);
 *   7. the result is not behind the Master Forge gate — the two
 *      champion-gilded armor results wait for the Smithing Workshop at L2
 *      (`gildedUnlocked`; arms/legs gilded are deliberately ungated);
 *   8. neither selected entry is the equipped copy (the equipment explains
 *      the first entry carrying its id — that one never leaves the rack;
 *      for armor, the first entry carrying the equipped id of the picked
 *      piece's slot);
 *   9. the purse covers the fee.
 */
export function getForgeCraftEligibility(
  profile: PlayerProfile | null | undefined,
  aIndex: number,
  bIndex: number,
  kind?: 'weapon' | 'armor'
):
  | { ok: true; input: WeaponItem | ArmorItem; result: WeaponItem | ArmorItem; fee: number }
  | { ok: false; reason: ForgeCraftRejectionReason } {
  if (!profile) return { ok: false, reason: 'no-profile' };
  const inventory = Array.isArray(profile.inventory) ? profile.inventory : [];
  if (
    !Number.isInteger(aIndex) ||
    !Number.isInteger(bIndex) ||
    aIndex < 0 ||
    bIndex < 0 ||
    aIndex >= inventory.length ||
    bIndex >= inventory.length ||
    // One entry named twice is one copy, not two — a craft always fuses two
    // distinct inventory entries.
    aIndex === bIndex
  ) {
    return { ok: false, reason: 'invalid-index' };
  }
  const a = inventory[aIndex];
  const b = inventory[bIndex];
  // The kind of this craft: pinned by the caller, or read off the entries.
  let craftKind: 'weapon' | 'armor' | undefined;
  if (kind === 'weapon') {
    if (!isWeaponEntry(a) || !isWeaponEntry(b)) return { ok: false, reason: 'not-a-weapon' };
    craftKind = 'weapon';
  } else if (kind === 'armor') {
    if (!isArmorEntry(a) || !isArmorEntry(b)) return { ok: false, reason: 'not-armor' };
    craftKind = 'armor';
  } else if (isWeaponEntry(a) && isWeaponEntry(b)) {
    craftKind = 'weapon';
  } else if (isArmorEntry(a) && isArmorEntry(b)) {
    craftKind = 'armor';
  } else {
    return { ok: false, reason: 'not-a-weapon' };
  }
  if (a.id !== b.id) return { ok: false, reason: 'mismatched-inputs' };
  if (craftKind === 'weapon' && FORGE_WOODEN_INPUT_IDS.includes(a.id)) {
    return { ok: false, reason: 'wooden' };
  }
  const recipe =
    craftKind === 'weapon' ? getForgeRecipeForInput(a.id) : getArmorRecipeForInput(a.id);
  if (!recipe) return { ok: false, reason: 'no-forge-path' };
  const result = getItemById(recipe.resultId);
  const resultIsKind =
    !!result &&
    (craftKind === 'weapon' ? isWeaponEntry(result) : isArmorEntry(result));
  if (!resultIsKind) return { ok: false, reason: 'no-forge-path' };
  if (requiresMasterForge(result.id) && !gildedUnlocked(profile)) {
    return { ok: false, reason: 'workshop-locked' };
  }
  const equippedIndex =
    craftKind === 'weapon'
      ? equippedWeaponInventoryIndex(profile)
      : equippedArmorInventoryIndex(profile, (a as ArmorItem).slot);
  if (aIndex === equippedIndex || bIndex === equippedIndex) {
    return { ok: false, reason: 'equipped' };
  }
  const fee = getForgeCraftFee(result);
  if (!canDebitGold(profile.gold, fee)) return { ok: false, reason: 'insufficient-gold' };
  return { ok: true, input: a, result, fee };
}

/**
 * Forge two copies of one weapon — or craft two copies of one piece of
 * armor — into the next piece up its ladder.
 *
 * PURE: a refusal returns the caller's own profile object, untouched (same
 * reference).  A success returns a NEW profile with exactly two inventory
 * entries removed — the two selected indices, so two copies of one id cost
 * exactly two entries — the fee deducted from `gold`, and the result
 * catalogue row appended to `inventory`.  The owned item objects themselves
 * are never modified, and a crafted piece can still be tempered afterwards
 * (temper is keyed by item id, as shipped).
 */
export function craftForgeItems(
  profile: PlayerProfile,
  aIndex: number,
  bIndex: number
): PlayerProfile {
  const eligibility = getForgeCraftEligibility(profile, aIndex, bIndex);
  if (!eligibility.ok) return profile;

  // A malformed save must not turn a craft into string concatenation, NaN, or
  // Infinity.  Refuse atomically and preserve the caller's exact profile.
  if (typeof profile.gold !== 'number' || !Number.isFinite(profile.gold) || profile.gold < 0) {
    return profile;
  }
  const nextGold = profile.gold - eligibility.fee;
  if (!Number.isFinite(nextGold) || nextGold < 0) return profile;

  const inventory = profile.inventory.filter((_, index) => index !== aIndex && index !== bIndex);
  return {
    ...profile,
    gold: nextGold,
    inventory: [...inventory, eligibility.result],
  };
}

/** A player-facing sentence for a refusal, so every surface says the same thing. */
export function describeForgeCraftRejection(reason: ForgeCraftRejectionReason): string {
  switch (reason) {
    case 'no-profile':
      return 'No gladiator to forge for.';
    case 'invalid-index':
      return 'Choose two weapons from your inventory.';
    case 'not-a-weapon':
      return 'The forge combines weapons. Armor is crafted at the armorer.';
    case 'not-armor':
      return 'The armorer combines armor. Weapons are forged at the forge.';
    case 'mismatched-inputs':
      return 'A craft fuses two copies of the same piece.';
    case 'wooden':
      return 'Pine and wicker cannot be forged into steel.';
    case 'no-forge-path':
      return 'This piece has no forge path — it cannot be crafted higher.';
    case 'workshop-locked':
      return "A champion's plate waits for the Smithing Workshop at level 2.";
    case 'equipped':
      return 'The equipped piece stays on the rack. Craft two spares.';
    case 'insufficient-gold':
      return 'Not enough gold for the forge fee.';
  }
}
