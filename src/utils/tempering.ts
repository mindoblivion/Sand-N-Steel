/**
 * P1 — pure tempering (weapon/armor upgrade) helpers.
 *
 * This module is the whole data model for tempering.  It owns the three levels,
 * their cost curve and the stat/sell consequences, and the operations a later
 * slice will need:
 *
 *   • `resolveTemperLevel`      — the effective level of any owned item on any save;
 *   • `getTemperCost`           — the gold cost of the NEXT level;
 *   • `getTemperGoldSpent`      — the gold already spent on an item's levels;
 *   • `getEffectiveWeaponStats` / `getEffectiveArmorStats` — the item a fight
 *     and the stat aggregation actually read at a given level;
 *   • `getTemperSellValue`      — the sell price of a tempered item;
 *   • `getTemperPurchaseEligibility` / `purchaseTemper` — the transaction.
 *
 * Everything here follows the C-8.66B chariot-loadout / C-8.67B racing pattern:
 *   • no profile and no owned item object is ever mutated in place — a success
 *     returns a NEW `PlayerProfile` for the caller to hand to the existing
 *     `saveProfile()` path;
 *   • a refused call returns the caller's own profile object, untouched, so a
 *     failed purchase cannot move gold or a level;
 *   • a legacy save (no `temper` field), a missing id and a malformed value all
 *     resolve to level 0 instead of throwing, so nothing here can break loading
 *     an older save.
 *
 * **The upgrade state lives only in `profile.temper`.**  The `WeaponItem` /
 * `ArmorItem` objects in the save are never edited — `getEffectiveWeaponStats`
 * and `getEffectiveArmorStats` return a *new* object and are the only way a
 * tempered item's stats are ever read.  This module reads no storage and no
 * environment: there is no second currency, no second storage key and no
 * parallel save path.
 */

import { PlayerProfile, WeaponItem, ArmorItem } from '../types/game';
import { getItemById } from '../data/itemsDB';
import { getFacilityLevel, requiredWorkshopForTemper } from './facilityProgression';

/** The highest temper level an item can reach. */
export const TEMPER_MAX_LEVEL = 3;

/**
 * The cost of levels 1 / 2 / 3 as a fraction of the item's own `price`.
 * `getTemperCost(item, n)` reads entry `n` — the NEXT level's ratio.
 */
export const TEMPER_COST_RATIOS = [0.4, 0.8, 1.4] as const;

/** Every cost is rounded to the nearest 5 gold (the worked curve: 920 → 370 / 735 / 1,290). */
export const TEMPER_COST_ROUNDING = 5;

/** A tempered item refunds this share of the temper gold spent on it when sold. */
export const TEMPER_SELL_REFUND_RATE = 0.25;

/** Why a temper purchase was refused.  `ok: true` never carries a reason. */
export type TemperRejectionReason =
  | 'no-profile'
  | 'unknown-item'
  | 'not-owned'
  | 'max-level'
  | 'insufficient-gold'
  | 'facility-required';

/** The armour bonus fields a level-3 temper can raise by one. */
const ARMOR_BONUS_KEYS = ['bonusStrength', 'bonusAgility', 'bonusStamina', 'bonusDefense'] as const;

/** Clamp any runtime value to an integer level in `0 … TEMPER_MAX_LEVEL`. */
function clampLevel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const level = Math.floor(value);
  if (level <= 0) return 0;
  return Math.min(level, TEMPER_MAX_LEVEL);
}

/**
 * The effective temper level of `itemId` on this profile.
 *
 * A profile with no `temper` field (every pre-P1 save), a missing id, a
 * negative level, `NaN` or a non-number all resolve to **0**; a level above the
 * cap resolves to **`TEMPER_MAX_LEVEL`**.  Never throws.
 */
export function resolveTemperLevel(
  profile: PlayerProfile | null | undefined,
  itemId: string
): number {
  const record: unknown = profile?.temper;
  if (!record || typeof record !== 'object') return 0;
  return clampLevel((record as Record<string, unknown>)[itemId]);
}

/**
 * Whether the player owns this item id — equipped or carried.  Mirrors the
 * ownership rule the armoury already uses (equipped slots ∪ inventory), because
 * an equipped weapon is still an owned one.
 */
export function ownsItem(
  profile: PlayerProfile | null | undefined,
  itemId: string
): boolean {
  if (!profile) return false;
  if (profile.inventory?.some((item) => item?.id === itemId)) return true;
  const equipped = profile.equipped;
  if (!equipped) return false;
  return [equipped.weapon, equipped.helm, equipped.chest, equipped.arms, equipped.legs].some(
    (item) => item?.id === itemId
  );
}

/**
 * The gold cost of the NEXT temper level for an item currently at
 * `currentLevel`: 40 % / 80 % / 140 % of the item's `price`, rounded to the
 * nearest 5 gold.  A level at or past the cap has no next level, so it costs 0.
 *
 * Worked examples the suite pins: starter gladius (50 g) → 20 / 40 / 70;
 * Colossus Titan Skullcrusher (920 g) → 370 / 735 / 1,290.
 */
export function getTemperCost(item: { price: number }, currentLevel: number): number {
  const level = clampLevel(currentLevel);
  if (level >= TEMPER_MAX_LEVEL) return 0;
  const raw = item.price * TEMPER_COST_RATIOS[level];
  return Math.round(raw / TEMPER_COST_ROUNDING) * TEMPER_COST_ROUNDING;
}

/** The total temper gold spent to bring an item to `level` (levels 1 … level). */
export function getTemperGoldSpent(item: { price: number }, level: number): number {
  const target = clampLevel(level);
  let spent = 0;
  for (let current = 0; current < target; current += 1) spent += getTemperCost(item, current);
  return spent;
}

/**
 * The stats a fight and the stat aggregation read for a weapon at `level`.
 *
 *   • `damageLight` / `damageHeavy`: +8 % of the **base** value per level,
 *     rounded to the nearest integer (linear on the base, not compounding);
 *   • `bonusStrength`: +1 at level 2 and a further +1 at level 3.
 *
 * Level 0 returns a copy equal to the base item.  Every other field — and the
 * input item itself — is left untouched.
 */
export function getEffectiveWeaponStats(weapon: WeaponItem, level: number): WeaponItem {
  const lvl = clampLevel(level);
  if (lvl === 0) return { ...weapon };
  const scale = 1 + 0.08 * lvl;
  const result: WeaponItem = {
    ...weapon,
    damageLight: Math.round(weapon.damageLight * scale),
    damageHeavy: Math.round(weapon.damageHeavy * scale),
  };
  const strengthBonus = (lvl >= 2 ? 1 : 0) + (lvl >= 3 ? 1 : 0);
  if (strengthBonus > 0) result.bonusStrength = (weapon.bonusStrength ?? 0) + strengthBonus;
  return result;
}

/**
 * The stats a fight and the stat aggregation read for an armour piece at `level`.
 *
 *   • `defense`: +1 per level;
 *   • at level 3, +1 to each bonus stat the piece already lists (a field it does
 *     not list stays absent — a temper never invents a bonus).
 *
 * Level 0 returns a copy equal to the base item.  The input piece itself is
 * never touched.
 */
export function getEffectiveArmorStats(armor: ArmorItem, level: number): ArmorItem {
  const lvl = clampLevel(level);
  if (lvl === 0) return { ...armor };
  const result: ArmorItem = { ...armor, defense: armor.defense + lvl };
  if (lvl >= TEMPER_MAX_LEVEL) {
    for (const key of ARMOR_BONUS_KEYS) {
      const listed = armor[key];
      if (typeof listed === 'number' && listed !== 0) result[key] = listed + 1;
    }
  }
  return result;
}

/**
 * The sell value of an item for a given profile: its own `sellPrice` plus 25 %
 * of the temper gold spent on it (rounded to the nearest gold).  An untempered
 * item sells for exactly its base `sellPrice`.
 */
export function getTemperSellValue(
  profile: PlayerProfile | null | undefined,
  item: WeaponItem | ArmorItem
): number {
  const spent = getTemperGoldSpent(item, resolveTemperLevel(profile, item.id));
  return item.sellPrice + Math.round(spent * TEMPER_SELL_REFUND_RATE);
}

/**
 * The purchase rules, read out before a caller draws a control: the item must
 * exist, be owned, be below the level cap, and be affordable.
 */
export function getTemperPurchaseEligibility(
  profile: PlayerProfile | null | undefined,
  itemId: string
): { ok: true } | { ok: false; reason: TemperRejectionReason } {
  if (!profile) return { ok: false, reason: 'no-profile' };
  const item = getItemById(itemId);
  if (!item) return { ok: false, reason: 'unknown-item' };
  if (!ownsItem(profile, itemId)) return { ok: false, reason: 'not-owned' };
  const level = resolveTemperLevel(profile, itemId);
  if (level >= TEMPER_MAX_LEVEL) return { ok: false, reason: 'max-level' };
  // P5 — the Smithing Workshop caps the ladder: L2 needs the bench built, L3 the
  // master forge.  Level 1 is open to every smith.
  const requiredWorkshop = requiredWorkshopForTemper(level + 1);
  if (requiredWorkshop > 0 && getFacilityLevel(profile, 'workshop') < requiredWorkshop) {
    return { ok: false, reason: 'facility-required' };
  }
  if (profile.gold < getTemperCost(item, level)) return { ok: false, reason: 'insufficient-gold' };
  return { ok: true };
}

/**
 * Buy the next temper level of an owned item.
 *
 * PURE: a refusal returns the caller's own profile object, untouched (same
 * reference).  A success returns a NEW profile with exactly one level's cost
 * deducted from `gold` and `temper[itemId]` incremented by one — the owned item
 * objects themselves are never modified.  Gold cannot go negative, because an
 * unaffordable purchase is refused before anything is built.
 */
export function purchaseTemper(profile: PlayerProfile, itemId: string): PlayerProfile {
  const eligibility = getTemperPurchaseEligibility(profile, itemId);
  if (!eligibility.ok) return profile;

  const item = getItemById(itemId);
  if (!item) return profile; // unreachable: eligibility already resolved it
  const level = resolveTemperLevel(profile, itemId);

  return {
    ...profile,
    gold: profile.gold - getTemperCost(item, level),
    temper: { ...(profile.temper ?? {}), [itemId]: level + 1 },
  };
}

/** A player-facing sentence for a refusal, so every surface says the same thing. */
export function describeTemperRejection(reason: TemperRejectionReason): string {
  switch (reason) {
    case 'no-profile':
      return 'No gladiator to temper.';
    case 'unknown-item':
      return 'That item cannot be tempered.';
    case 'not-owned':
      return 'You do not own that item.';
    case 'max-level':
      return 'This item is already fully tempered.';
    case 'insufficient-gold':
      return 'Not enough gold.';
    case 'facility-required':
      return 'The Smithing Workshop is not built high enough for that temper.';
  }
}
