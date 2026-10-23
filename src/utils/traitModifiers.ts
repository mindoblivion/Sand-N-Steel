/**
 * CH-1 — the armatura / palma read model: one modifier shape, one merge, two
 * resolvers.  Pure functions over data, NO combat, NO UI.
 *
 * The design (characters-and-systems §2.2/§2.3/§2.4) gives every class and
 * every palma its effect in the same small block, so a later combat slice has
 * exactly one seam to read: `mergeModifiers([...palmae, doctrina])`.  This
 * module owns that block and the rules that turn a save into it:
 *
 *   • `TraitModifierBlock` — flat adds and multipliers.  The empty block is the
 *     identity: merging nothing changes nothing.
 *   • `mergeModifiers` — adds add, multipliers multiply, flags OR, and the
 *     pooled `blockReductionAdd` can never exceed `BLOCK_REDUCTION_CAP` (0.90);
 *     `applyBlockReduction` clamps a weapon's own base plus that add to the same
 *     cap at the call site.
 *   • `resolvePalmae` — a missing, partial or malformed `palmae` field resolves
 *     to "none earned, none worn"; equipped ids must be unlocked ids (max 3),
 *     and ids the player pool does not offer (unknown, or a boss-only row) are
 *     dropped.
 *   • `resolveArmatura` — the explicit class wins; otherwise the class is
 *     inferred from `appearance.characterModel` (retiarius / dimachaerus); a
 *     save with neither is a Murmillo.
 *
 * Every function here is pure: it never throws, never reads storage and never
 * mutates its input.  Nothing in this slice reads the result — the save fields
 * are written only by later successful actions, exactly like `racing`.
 */

import type { ArmaturaId, PalmaeState, PlayerProfile } from '../types/game';
import { DEFAULT_ARMATURA_ID, isArmaturaId } from '../data/armaturae';
import { PALMAE_PLAYER_POOL } from '../data/palmae';

/** The flat stat deltas a block may carry (`statFlat` in the design). */
export interface StatFlat {
  str?: number;
  agi?: number;
  sta?: number;
  def?: number;
}

/**
 * The shared effect shape (design §2.4).  Every field is optional; the empty
 * block `{}` is the identity.
 */
export interface TraitModifierBlock {
  statFlat?: StatFlat;
  healthMaxAdd?: number;
  staminaMaxAdd?: number;
  staminaRegenAdd?: number;
  /** Multiplies every stamina cost (1 = unchanged). */
  staminaCostMult?: number;
  /** Added to a weapon's own blockReduction; the total is capped at 0.90. */
  blockReductionAdd?: number;
  rangeAdd?: number;
  /** Agility in hit-chance maths only. */
  hitAgiAdd?: number;
  critChanceAdd?: number;
  damageDealtMult?: number;
  damageTakenMult?: number;
  passiveEvadeAdd?: number;
  /** Stamina recovered when the player blocks an attack. */
  onBlockStamina?: number;
  hypeAdd?: number;
  /** `true` = a miss does not reset the combo (once per fight). */
  comboShield?: boolean;
  restStaminaAdd?: number;
  goldMult?: number;
  fameMult?: number;
  xpMult?: number;
}

/** The most block reduction any total may reach. */
export const BLOCK_REDUCTION_CAP = 0.9;

/** The most palmae a gladiator may wear at once. */
export const MAX_EQUIPPED_PALMAE = 3;

const ADD_KEYS = [
  'healthMaxAdd',
  'staminaMaxAdd',
  'staminaRegenAdd',
  'blockReductionAdd',
  'rangeAdd',
  'hitAgiAdd',
  'critChanceAdd',
  'passiveEvadeAdd',
  'onBlockStamina',
  'hypeAdd',
  'restStaminaAdd',
] as const;
type AddKey = (typeof ADD_KEYS)[number];

const MULT_KEYS = [
  'staminaCostMult',
  'damageDealtMult',
  'damageTakenMult',
  'goldMult',
  'fameMult',
  'xpMult',
] as const;
type MultKey = (typeof MULT_KEYS)[number];

const STAT_KEYS = ['str', 'agi', 'sta', 'def'] as const;
type StatKey = (typeof STAT_KEYS)[number];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Merge any number of blocks into one.
 *
 *   • adds add (`staminaMaxAdd` 12 + 10 = 22) and the pooled
 *     `blockReductionAdd` is clamped to `BLOCK_REDUCTION_CAP`;
 *   • multipliers multiply (1.10 × 0.95 = 1.045);
 *   • `statFlat` adds per stat (`str`, `agi`, `sta`, `def`);
 *   • `comboShield` is a flag: any `true` makes it `true`.
 *
 * A key no block supplies is left off the result, so merging nothing (or only
 * empty blocks) returns `{}` — the identity.  Non-finite values and non-block
 * entries are ignored rather than allowed to poison the merge.
 */
export function mergeModifiers(
  blocks: readonly (TraitModifierBlock | null | undefined)[],
): TraitModifierBlock {
  const merged: Record<string, unknown> = {};
  if (!Array.isArray(blocks)) return merged as TraitModifierBlock;

  const adds = new Map<AddKey, number>();
  const mults = new Map<MultKey, number>();
  const flat = new Map<StatKey, number>();
  let comboShield = false;
  let hasStatFlat = false;

  for (const block of blocks) {
    if (!isPlainObject(block)) continue;

    for (const key of ADD_KEYS) {
      const value = (block as Record<string, unknown>)[key];
      if (isFiniteNumber(value)) adds.set(key, (adds.get(key) ?? 0) + value);
    }
    for (const key of MULT_KEYS) {
      const value = (block as Record<string, unknown>)[key];
      if (isFiniteNumber(value)) mults.set(key, (mults.get(key) ?? 1) * value);
    }
    const statFlat = block.statFlat;
    if (isPlainObject(statFlat)) {
      for (const key of STAT_KEYS) {
        const value = statFlat[key];
        if (isFiniteNumber(value)) {
          flat.set(key, (flat.get(key) ?? 0) + value);
          hasStatFlat = true;
        }
      }
    }
    if (block.comboShield === true) comboShield = true;
  }

  for (const [key, value] of adds) {
    merged[key] = key === 'blockReductionAdd' ? Math.min(value, BLOCK_REDUCTION_CAP) : value;
  }
  for (const [key, value] of mults) merged[key] = value;
  if (hasStatFlat) {
    const statFlat: Record<string, number> = {};
    for (const [key, value] of flat) statFlat[key] = value;
    merged.statFlat = statFlat;
  }
  if (comboShield) merged.comboShield = true;

  return merged as TraitModifierBlock;
}

/**
 * Apply a merged `blockReductionAdd` to a weapon's own base and clamp the total
 * to `BLOCK_REDUCTION_CAP` — the call-site half of the 0.90 rule.  Non-finite
 * input reads as zero rather than producing `NaN`.
 */
export function applyBlockReduction(base: number, add: number): number {
  const ownBase = isFiniteNumber(base) ? base : 0;
  const ownAdd = isFiniteNumber(add) ? add : 0;
  return Math.max(0, Math.min(BLOCK_REDUCTION_CAP, ownBase + ownAdd));
}

/** The ids the player pool actually offers, so a stored id can be checked. */
const PLAYER_POOL_IDS: ReadonlySet<string> = new Set(
  PALMAE_PLAYER_POOL.map((palma) => palma.id),
);

/** String ids the pool offers, de-duplicated, in stored order. */
function cleanPalmaIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !PLAYER_POOL_IDS.has(entry) || seen.has(entry)) continue;
    seen.add(entry);
    ids.push(entry);
  }
  return ids;
}

/**
 * Resolve the player's palmae.
 *
 * Accepts the profile itself (it reads `profile.palmae`) or the `palmae` record
 * on its own, so the corpus can drive it the way the game does.
 *
 * Never throws and never mutates:
 *   • a profile with no `palmae` field (every pre-CH-1 save), a null/partial or
 *     non-object field reads as `{ unlocked: [], equipped: [] }`;
 *   • ids that are not strings, are unknown to the player pool, or name a
 *     boss-only row are dropped;
 *   • `equipped` is filtered to ids the player has unlocked and capped at
 *     `MAX_EQUIPPED_PALMAE` (3).
 */
export function resolvePalmae(input: unknown): PalmaeState {
  const record = isPlainObject(input) && 'palmae' in input ? input.palmae : input;
  if (!isPlainObject(record)) return { unlocked: [], equipped: [] };

  const unlocked = cleanPalmaIds(record.unlocked);
  const equipped = cleanPalmaIds(record.equipped)
    .filter((id) => unlocked.includes(id))
    .slice(0, MAX_EQUIPPED_PALMAE);

  return { unlocked, equipped };
}

/**
 * Resolve the player's class.
 *
 * The explicit `profile.armatura` wins whenever it names one of the seven
 * classes.  Otherwise the class is inferred from the character model the player
 * picked at creation — the only two models that ARE a class — and anything else
 * (a missing profile, a plain model, a garbage value) is a Murmillo.
 */
export function resolveArmatura(profile: PlayerProfile | null | undefined): ArmaturaId {
  const candidate = profile as { armatura?: unknown; appearance?: { characterModel?: unknown } } | null | undefined;
  if (isArmaturaId(candidate?.armatura)) return candidate.armatura;

  const model = candidate?.appearance?.characterModel;
  if (model === 'retiarius') return 'retiarius';
  if (model === 'dimachaerus') return 'dimachaerus';

  return DEFAULT_ARMATURA_ID;
}
