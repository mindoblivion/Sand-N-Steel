/**
 * ===========================================================================
 * CH-3b — STATEFUL DOCTRINAE: Cast the Net + Twin Fangs
 * ===========================================================================
 * The two doctrinae CH-1 could record only in `notes` — because a
 * `TraitModifierBlock` cannot express a once-per-fight resource or a repeated
 * strike — resolved here as pure decisions.  CH-3a owns the hooks; this module
 * owns what a duel does with them:
 *
 *   • Cast the Net (retiarius)  — `resolveNetCast`, `canCastNet`,
 *     `isEntangleImmune`, `isEntangled`, `decrementEntangle`
 *   • the entangle's two penalties — `netCritBonusModifiers` (the caster's
 *     +0.25 crit, fed through `critChanceFor`) and `entangledHitChance` (the
 *     −25 percentage points, subtracted from `calculateHitChance`'s RESULT and
 *     floored at that formula's own clamps)
 *   • Twin Fangs (dimachaerus)  — `twinFangsApplies`, `rollBonusStrike`,
 *     `twinFangsBaseDamage`, `twinFangsComboEvent`
 *   • the AI's pre-standard net branch — `shouldAICastNet`
 *
 * NOTHING here changes a formula.  No constant in `combatCalculations.ts`
 * moved, and the entangle penalty is applied to the percentage the formula
 * returned, not inside it.  Everything is pure — no React, no storage, no
 * clock — so `DuelScene` (resolution) and `TurnActionPanel` (HUD estimates)
 * read the same helpers and cannot drift apart.
 *
 * The entangle is TRANSIENT DUEL STATE ONLY: it lives on `FighterState` for the
 * length of one fight (`entangledTurns`, `netAvailable`) and is never written to
 * the profile or to any save.
 */
import type { ArmaturaId } from '../types/game';
import { HIT_CHANCE_BOUNDS, type ComboEvent } from './combatCalculations';
import type { FighterModifiers } from './combatModifiers';

// ── CAST THE NET ─────────────────────────────────────────────────────────────

/** Chance a thrown net lands, as a fraction of one draw. */
export const NET_LAND_CHANCE = 0.7;

/** Turns of entangle a landed net applies (its victim's own actions). */
export const ENTANGLE_TURNS_ON_LAND = 2;

/** Extra critical chance the caster gains against a target it has netted. */
export const NET_CRIT_BONUS = 0.25;

/** Percentage points an entangled fighter's attacks lose off their hit chance. */
export const ENTANGLE_HIT_PENALTY = 25;

/** The retiarius' class id — the only class that carries a net. */
const RETIARIUS_ID: ArmaturaId = 'retiarius';

/** The secutor's class id — Snag-Proof Pursuit makes it immune to Entangle. */
const SECUTOR_ID: ArmaturaId = 'secutor';

/**
 * What one cast resolved to.
 *
 *   landed          — the net took hold (never true for a secutor)
 *   immune          — the target's doctrina refused it (Snag-Proof Pursuit)
 *   entangledTurns  — turns to write onto the target (0 when it did not land)
 *
 * The net is spent by EVERY cast, whatever this answers — the caller clears
 * `netAvailable` before it reads the result, so a miss and an immune target
 * both cost the retiarius his one throw.
 */
export interface NetCastResult {
  landed: boolean;
  immune: boolean;
  entangledTurns: number;
}

/** Is the fighter's net still in hand this fight? */
export function canCastNet(netAvailable: boolean | undefined): boolean {
  return netAvailable === true;
}

/**
 * Is this class immune to Entangle?  Read at RESOLUTION — a secutor can never
 * carry `entangledTurns`, however the net was thrown at it.
 */
export function isEntangleImmune(armaturaId: ArmaturaId | undefined): boolean {
  return armaturaId === SECUTOR_ID;
}

/**
 * Roll a net throw.  Injectable RNG, the same shape as
 * `chooseAIStandardAction`: a value in [0, 1) or a `() => number` callback.
 */
export function rollNetCast(rngOrValue: number | (() => number) = Math.random): boolean {
  const r = typeof rngOrValue === 'function' ? rngOrValue() : rngOrValue;
  return r < NET_LAND_CHANCE;
}

/**
 * Resolve one Cast the Net against a target.
 *
 * Immunity is checked BEFORE the roll, so a secutor is never entangled and the
 * random sequence of a cast at one is not consumed.  A landed cast always
 * applies exactly `ENTANGLE_TURNS_ON_LAND` turns — never a remainder, never a
 * stack on top of an existing entangle.
 */
export function resolveNetCast(params: {
  targetArmaturaId?: ArmaturaId;
  rngOrValue?: number | (() => number);
}): NetCastResult {
  if (isEntangleImmune(params.targetArmaturaId)) {
    return { landed: false, immune: true, entangledTurns: 0 };
  }
  if (rollNetCast(params.rngOrValue ?? Math.random)) {
    return { landed: true, immune: false, entangledTurns: ENTANGLE_TURNS_ON_LAND };
  }
  return { landed: false, immune: false, entangledTurns: 0 };
}

/** Is the fighter currently caught in a net? */
export function isEntangled(entangledTurns: number | undefined): boolean {
  return typeof entangledTurns === 'number' && Number.isFinite(entangledTurns) && entangledTurns > 0;
}

/**
 * One of the entangled fighter's actions has resolved: tick the counter down.
 * Floors at 0, so an expired entangle stays expired rather than going negative.
 */
export function decrementEntangle(entangledTurns: number | undefined): number {
  if (!isEntangled(entangledTurns)) return 0;
  return Math.max(0, Math.ceil(entangledTurns as number) - 1);
}

// ── THE ENTANGLE'S TWO PENALTIES ─────────────────────────────────────────────

/**
 * The caster's block, with the net's crit bonus folded into `critChanceAdd`.
 *
 * This is CH-3a's crit hook and nothing else: `critChanceFor` reads
 * `block.critChanceAdd` and still applies its own 0.60 cap.  In a two-fighter
 * duel the fighter facing an entangled opponent IS the caster, so the bonus is
 * keyed off the DEFENDER's entangle; the same reference comes back untouched
 * when the target is not entangled, so an unentangled fight allocates nothing.
 */
export function netCritBonusModifiers(
  mods: FighterModifiers,
  targetEntangled: boolean,
): FighterModifiers {
  if (!targetEntangled) return mods;
  const current = mods.block.critChanceAdd;
  const add = (typeof current === 'number' && Number.isFinite(current) ? current : 0) + NET_CRIT_BONUS;
  return { ...mods, block: { ...mods.block, critChanceAdd: add } };
}

/**
 * The hit percentage an entangled fighter's attack actually rolls against.
 *
 * The penalty is subtracted from `calculateHitChance`'s RESULT — the formula is
 * untouched — and then floored at the very clamp that formula already applies
 * for the attack type (`HIT_CHANCE_BOUNDS`), so a tangled attack can never fall
 * below the floor its formula allows.
 */
export function entangledHitChance(hitPct: number, isQuick: boolean, entangled: boolean): number {
  if (!entangled || !Number.isFinite(hitPct)) return hitPct;
  const floor = isQuick ? HIT_CHANCE_BOUNDS.quick.floor : HIT_CHANCE_BOUNDS.power.floor;
  return Math.max(floor, hitPct - ENTANGLE_HIT_PENALTY);
}

/**
 * The AI's pre-standard net branch: a retiarius throws once, while its net is
 * still in hand and the player is not already caught.  Nothing else is asked —
 * the standard tactical ladder is never consulted for this decision.
 */
export function shouldAICastNet(params: {
  armaturaId?: ArmaturaId;
  netAvailable?: boolean;
  playerEntangled?: boolean;
}): boolean {
  return (
    params.armaturaId === RETIARIUS_ID &&
    canCastNet(params.netAvailable) &&
    params.playerEntangled !== true
  );
}

// ── TWIN FANGS ───────────────────────────────────────────────────────────────

/** A bonus strike deals half the weapon's light damage. */
export const TWIN_FANGS_DAMAGE_RATIO = 0.5;

/** The hype a LANDED bonus strike adds, the same as any landed quick attack. */
export const TWIN_FANGS_LANDED_HYPE = 8;

/**
 * Does this blow earn a bonus strike?
 *
 * Twin Fangs is the dimachaerus' quick attack only, and `isBonusStrike` is what
 * closes the recursion: the bonus strike resolves through this same guard with
 * `isBonusStrike = true`, which is always false, so a twin can never fork into
 * another twin.
 */
export function twinFangsApplies(
  armaturaId: ArmaturaId | undefined,
  isQuick: boolean,
  isBonusStrike = false,
): boolean {
  return !isBonusStrike && isQuick === true && armaturaId === 'dimachaerus';
}

/**
 * The bonus strike's OWN hit roll, against the same hit chance the primary blow
 * rolled against (`r * 100 <= hitPct`, the duel's own convention).
 */
export function rollBonusStrike(
  hitPct: number,
  rngOrValue: number | (() => number) = Math.random,
): boolean {
  const r = typeof rngOrValue === 'function' ? rngOrValue() : rngOrValue;
  return r * 100 <= hitPct;
}

/**
 * The bonus strike's base damage: half the weapon's `damageLight`, rounded and
 * never below 1, fed through the SAME `calculateAttackDamage` pipeline the
 * primary blow used (strength, defense, block, the trait multiplier) — with
 * `isCrit` always false.
 */
export function twinFangsBaseDamage(damageLight: number): number {
  if (!Number.isFinite(damageLight) || damageLight <= 0) return 1;
  return Math.max(1, Math.round(damageLight * TWIN_FANGS_DAMAGE_RATIO));
}

/** The combo event a bonus strike feeds, exactly as any landed / missed blow. */
export function twinFangsComboEvent(hit: boolean): ComboEvent {
  return hit ? 'landed' : 'miss';
}
