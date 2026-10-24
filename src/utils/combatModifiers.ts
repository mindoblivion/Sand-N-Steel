/**
 * ===========================================================================
 * CH-3a — COMBAT PLUMBING: one merged block, every stage
 * ===========================================================================
 * The combat side of the CH-1 read model (§2.4).  `utils/traitModifiers.ts`
 * owns the block SHAPE, the merge rules and the save resolvers; this module
 * owns what a duel does with the result:
 *
 *   • `buildPlayerModifiers` / `buildOpponentModifiers` — the ONE merged block
 *     each fighter reads for the whole duel (`mergeModifiers([...palmae,
 *     doctrina])`).  A fighter with no palmae and no doctrina resolves to the
 *     empty block, which is the identity.
 *   • the weapon stage  — `staminaCostWithModifiers`, `blockReductionFor`,
 *     `blockPenetrationFor`, `effectiveBlockReduction`
 *   • the hit stage     — `hitAgilityFor`, `critChanceFor`
 *   • the damage stage  — `damageDealtMultiplier`, `damageTakenMultiplier`,
 *     `resolveTraitMult` (the numerator/denominator pair `calculateAttackDamage`'s
 *     `traitMult` takes)
 *   • the evasion stage — `passiveEvadeChance`
 *   • Mirror Drill's per-type ledger — `recordHitType`
 *
 * NO formula constant moves here: every function either reads a block or hands
 * `combatCalculations.ts` an argument it already accepted.  Everything is pure
 * — no React, no storage, no randomness — so `DuelScene` (resolution) and
 * `TurnActionPanel` (HUD estimates) call the SAME helpers and their numbers can
 * never drift apart.
 *
 * Conditions the CH-1 block shape cannot express (health thresholds, attack
 * type, the boss flag, Mirror Drill's per-type ledger, Spearman's Ground's
 * distance bands) are evaluated HERE, at the call site, which is what the CH-1
 * records said a later slice would have to do.
 */
import type { ArmaturaId, MirrorDrillLedger, OpponentConfig, PlayerProfile } from '../types/game';
import { getArmatura } from '../data/armaturae';
import { PALMAE, type Palma } from '../data/palmae';
import {
  applyBlockReduction,
  mergeModifiers,
  resolveArmatura,
  resolvePalmae,
  type TraitModifierBlock,
} from './traitModifiers';

/** A power attack's base critical chance — the frozen roll `DuelScene` makes. */
export const BASE_CRIT_CHANCE = 0.25;

/** The most any critical chance may reach, however many palmae stack. */
export const CRIT_CHANCE_CAP = 0.6;

/**
 * Block penetration by class — the magnitude CH-1 could record only in a
 * doctrina's `notes` (`thraex: 'blockPenetration 0.40 — not a
 * TraitModifierBlock field'`).  A penetrating attack keeps only
 * `(1 − penetration)` of the defender's block reduction.
 */
export const DOCTRINA_BLOCK_PENETRATION: Partial<Record<ArmaturaId, number>> = {
  thraex: 0.4,
};

/** One band of Spearman's Ground: strikes at or beyond `minRatio` of reach. */
export interface SpearmansGroundBand {
  /** Lower bound of the band, as `distance / effectiveRange`. */
  readonly minRatio: number;
  /** Damage multiplier inside the band. */
  readonly mult: number;
}

/**
 * Spearman's Ground's distance table (`hoplomachus`), exactly as §2.2 states it:
 * "Strikes landed from the outer third of your weapon's reach deal +15% damage;
 * strikes landed from inside half your reach deal −10%."  There are two
 * modifiers and no middle tier — the span between them is neutral (×1.00).
 *
 * `ratio` is `distance / effectiveRange`, so the outer third of reach is
 * `ratio >= 2/3`, inside half reach is `ratio < 0.5`, and `0.5 <= ratio < 2/3`
 * lies between them with no modifier.
 */
export const SPEARMANS_GROUND_BANDS: readonly SpearmansGroundBand[] = [
  { minRatio: 2 / 3, mult: 1.15 },
  { minRatio: 0.5, mult: 1 },
  { minRatio: 0, mult: 0.9 },
];

/** One fighter's modifiers for the whole duel. */
export interface FighterModifiers {
  /** `mergeModifiers([...palmae, doctrina])` — the identity when both are empty. */
  block: TraitModifierBlock;
  /** The class's own block, kept apart for the doctrina's conditional stages. */
  doctrina: TraitModifierBlock;
  /** The equipped palma rows, in equip order (conditions are read off these). */
  palmae: readonly Palma[];
  /** The fighter's class, when it has one. */
  armaturaId?: ArmaturaId;
}

/** The empty block — every fighter with no palmae and no armatura. */
export const EMPTY_MODIFIERS: FighterModifiers = Object.freeze({
  block: {},
  doctrina: {},
  palmae: [],
});

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Assemble one fighter's block from already-resolved rows. */
function assembleModifiers(
  palmae: readonly Palma[],
  doctrina: TraitModifierBlock | undefined,
  armaturaId: ArmaturaId | undefined,
): FighterModifiers {
  const doctrinaBlock = doctrina ?? {};
  return {
    block: mergeModifiers([...palmae.map((palma) => palma.effect), doctrinaBlock]),
    doctrina: doctrinaBlock,
    palmae,
    ...(armaturaId ? { armaturaId } : {}),
  };
}

/**
 * The PLAYER's merged block: the class's doctrina plus the equipped palmae.
 *
 * Reads the same resolvers the save does (`resolveArmatura`, `resolvePalmae`),
 * so a legacy save with neither field resolves to a Murmillo with no palmae and
 * an unknown or boss-only palma id is dropped exactly as the hub drops it.
 */
export function buildPlayerModifiers(
  profile: PlayerProfile | null | undefined,
): FighterModifiers {
  const armaturaId = resolveArmatura(profile);
  const doctrina = getArmatura(armaturaId)?.doctrina.modifiers;
  const equipped = resolvePalmae(profile).equipped ?? [];
  const palmae = equipped
    .map((id) => PALMAE.find((palma) => palma.id === id))
    .filter((palma): palma is Palma => palma !== undefined);

  return assembleModifiers(palmae, doctrina, armaturaId);
}

/**
 * The OPPONENT's merged block.
 *
 * An opponent carries no save, so its class and its palms come from its own
 * config — and that config does not exist yet: CH-4 lands the opponent's
 * `armatura` / `palmae`.  Until then both fields are absent, so every opponent
 * resolves to the empty block and behaves exactly as it does today.  The read is
 * deliberately tolerant (a bare id list or the player save's
 * `{ equipped: [...] }` shape, unknown ids dropped, capped at three) so CH-4
 * needs no second resolver here.
 */
export function buildOpponentModifiers(
  opponent: OpponentConfig | null | undefined,
): FighterModifiers {
  const config = opponent as unknown as Record<string, unknown> | null | undefined;
  const candidate = isPlainObject(config) ? config.armatura : undefined;
  const armaturaId =
    typeof candidate === 'string' && getArmatura(candidate) ? (candidate as ArmaturaId) : undefined;

  const rawPalmae = isPlainObject(config) ? config.palmae : undefined;
  const list = isPlainObject(rawPalmae) ? rawPalmae.equipped : rawPalmae;
  const palmae: Palma[] = [];
  if (Array.isArray(list)) {
    for (const id of list) {
      if (typeof id !== 'string') continue;
      const palma = PALMAE.find((row) => row.id === id);
      if (!palma || palmae.includes(palma)) continue;
      palmae.push(palma);
      if (palmae.length === 3) break;
    }
  }

  const doctrina = armaturaId ? getArmatura(armaturaId)?.doctrina.modifiers : undefined;
  return assembleModifiers(palmae, doctrina, armaturaId);
}

// ── WEAPON STAGE ─────────────────────────────────────────────────────────────

/**
 * The stamina one attack costs, after the block's `staminaCostMult`.
 *
 * Both CH-1 rows carrying the multiplier (secutor's Snag-Proof Pursuit, 0.85,
 * and the Heavy Hand palma, 0.90) are documented as POWER-attack discounts, so a
 * quick attack is never discounted.  Rounded to a whole point, because every
 * stamina value in the duel is a whole point; no multiplier means the base cost
 * exactly, which is the pre-CH-3a number.
 */
export function staminaCostWithModifiers(
  baseCost: number,
  isQuick: boolean,
  mods: FighterModifiers,
): number {
  if (isQuick) return baseCost;
  const mult = mods.block.staminaCostMult;
  if (!isFiniteNumber(mult)) return baseCost;
  return Math.max(0, Math.round(baseCost * mult));
}

/** A weapon's own block reduction plus the block's add, clamped to 0.90. */
export function blockReductionFor(
  weaponBlockReduction: number,
  mods: FighterModifiers,
): number {
  return applyBlockReduction(weaponBlockReduction, mods.block.blockReductionAdd ?? 0);
}

/** The fraction of a block this attacker's class ignores (thraex 0.40). */
export function blockPenetrationFor(mods: FighterModifiers): number {
  const value = mods.armaturaId ? DOCTRINA_BLOCK_PENETRATION[mods.armaturaId] : undefined;
  return isFiniteNumber(value) ? Math.max(0, Math.min(1, value)) : 0;
}

/**
 * The block reduction a blow actually meets: the defender's weapon plus its
 * `blockReductionAdd` (capped at 0.90), less the attacker's penetration when the
 * defender is blocking.  A defender who is not blocking keeps its own total,
 * which the damage formula ignores anyway.
 */
export function effectiveBlockReduction(
  weaponBlockReduction: number,
  defenderMods: FighterModifiers,
  attackerMods: FighterModifiers,
  isBlocked: boolean,
): number {
  const total = blockReductionFor(weaponBlockReduction, defenderMods);
  if (!isBlocked) return total;
  return total * (1 - blockPenetrationFor(attackerMods));
}

// ── HIT STAGE ────────────────────────────────────────────────────────────────

/** A fighter's agility as the hit-chance maths reads it (`hitAgiAdd`). */
export function hitAgilityFor(agility: number, mods: FighterModifiers): number {
  const add = mods.block.hitAgiAdd;
  return isFiniteNumber(add) ? agility + add : agility;
}

/** A power attack's critical chance: 0.25 + `critChanceAdd`, clamped ≤ 0.60. */
export function critChanceFor(mods: FighterModifiers): number {
  const add = mods.block.critChanceAdd;
  const total = BASE_CRIT_CHANCE + (isFiniteNumber(add) ? add : 0);
  return Math.max(0, Math.min(CRIT_CHANCE_CAP, total));
}

// ── EVASION STAGE ────────────────────────────────────────────────────────────

/**
 * A fighter's passive evade chance (`passiveEvadeAdd`), which applies only while
 * the fighter is NOT in a dodge stance — it mirrors the counter_dodge boss
 * passive and does not stack with the dodge stance's own 75 %.
 */
export function passiveEvadeChance(mods: FighterModifiers, isInDodgeStance: boolean): number {
  if (isInDodgeStance) return 0;
  const add = mods.block.passiveEvadeAdd;
  return isFiniteNumber(add) ? Math.max(0, Math.min(1, add)) : 0;
}

// ── DAMAGE STAGE ─────────────────────────────────────────────────────────────

/** Everything a damage resolution knows that a modifier block cannot hold. */
export interface DamageContext {
  isQuick: boolean;
  distance: number;
  effectiveRange: number;
  attackerHealth: number;
  attackerHealthMax: number;
  defenderHealth: number;
  defenderHealthMax: number;
  defenderIsBoss: boolean;
  /** Attack types the DEFENDER has already been hit by (Mirror Drill). */
  defenderTypesHit?: MirrorDrillLedger;
}

/**
 * Per-palma conditions on `damageDealtMult`.  A row with no entry applies
 * unconditionally; a row listed here applies only when its predicate holds.
 */
const PALMA_DEALT_CONDITIONS: Record<string, (ctx: DamageContext) => boolean> = {
  // "Deal 10% more damage to opponents below 25% health."
  executioner: (ctx) => ctx.defenderHealth > 0 && ctx.defenderHealth < ctx.defenderHealthMax * 0.25,
  // "Deal 8% more damage while you are below 40% health."
  blood_price: (ctx) => ctx.attackerHealth > 0 && ctx.attackerHealth < ctx.attackerHealthMax * 0.4,
  // "Deal 12% more damage to bosses."
  colossus_bane: (ctx) => ctx.defenderIsBoss === true,
  // "Power attacks … deal 5% less damage." (the CH-1 descriptor's own note)
  heavy_hand: (ctx) => !ctx.isQuick,
  // "Only the attack following a triggered counter" — a state that does not
  // exist yet, so it never applies in this slice (CH-4 lands it at its own
  // mechanic site).
  vipers_patience: () => false,
};

/** Per-palma conditions on `damageTakenMult`. */
const PALMA_TAKEN_CONDITIONS: Record<string, (ctx: DamageContext) => boolean> = {
  // "Take 8% less damage from quick attacks."
  colossus_hide: (ctx) => ctx.isQuick,
};

/** Spearman's Ground's multiplier for a strike made from `distance`. */
export function spearmansGroundMult(distance: number, effectiveRange: number): number {
  if (!isFiniteNumber(distance) || !isFiniteNumber(effectiveRange) || effectiveRange <= 0) {
    return 1;
  }
  const ratio = distance / effectiveRange;
  for (const band of SPEARMANS_GROUND_BANDS) {
    if (ratio >= band.minRatio) return band.mult;
  }
  return 1;
}

/** The attacker's whole damage-dealt multiplier for this blow. */
export function damageDealtMultiplier(
  attacker: FighterModifiers,
  ctx: DamageContext,
): number {
  let mult = 1;
  for (const palma of attacker.palmae) {
    const own = palma.effect.damageDealtMult;
    if (!isFiniteNumber(own)) continue;
    const condition = PALMA_DEALT_CONDITIONS[palma.id];
    if (!condition || condition(ctx)) mult *= own;
  }
  if (isFiniteNumber(attacker.doctrina.damageDealtMult)) mult *= attacker.doctrina.damageDealtMult;
  if (attacker.armaturaId === 'hoplomachus') {
    mult *= spearmansGroundMult(ctx.distance, ctx.effectiveRange);
  }
  return mult;
}

/**
 * The defender's whole damage-taken multiplier for this blow.
 *
 * Provocator's Mirror Drill is the one doctrina whose `damageTakenMult` is
 * conditional: "after the first hit of each attack type, you take 8% less damage
 * from that type".  The first hit of a type therefore resolves at 1 and every
 * later hit of that type at 0.92.
 */
export function damageTakenMultiplier(
  defender: FighterModifiers,
  ctx: DamageContext,
): number {
  let mult = 1;
  for (const palma of defender.palmae) {
    const own = palma.effect.damageTakenMult;
    if (!isFiniteNumber(own)) continue;
    const condition = PALMA_TAKEN_CONDITIONS[palma.id];
    if (!condition || condition(ctx)) mult *= own;
  }
  const doctrinaOwn = defender.doctrina.damageTakenMult;
  if (isFiniteNumber(doctrinaOwn)) {
    const seen = ctx.defenderTypesHit;
    const applies =
      defender.armaturaId === 'provocator'
        ? ctx.isQuick
          ? seen?.light === true
          : seen?.power === true
        : true;
    if (applies) mult *= doctrinaOwn;
  }
  return mult;
}

/**
 * The `traitMult` a blow carries into `calculateAttackDamage`: everything the
 * attacker deals more, divided by everything the defender takes less.
 */
export function resolveTraitMult(
  attacker: FighterModifiers,
  defender: FighterModifiers,
  ctx: DamageContext,
): number {
  const dealt = damageDealtMultiplier(attacker, ctx);
  const taken = damageTakenMultiplier(defender, ctx);
  if (!isFiniteNumber(dealt) || !isFiniteNumber(taken) || taken <= 0) return 1;
  return dealt / taken;
}

/**
 * Record that a hit of the given type landed on the defender.  Returns a new
 * ledger (never mutates), which is what `FighterState.mirrorDrillTypes` holds.
 */
export function recordHitType(
  ledger: MirrorDrillLedger | undefined,
  isQuick: boolean,
): MirrorDrillLedger {
  if (isQuick) return { ...(ledger ?? {}), light: true };
  return { ...(ledger ?? {}), power: true };
}
