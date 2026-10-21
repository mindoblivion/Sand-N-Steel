/**
 * L7 (Living City) — the injury lifecycle: ONE slot, inflicted by a lost duel and
 * spent by the duels that follow it.
 *
 * Before this module `PlayerInjury` was a type with no writer, so an injury could
 * never exist at runtime and `calculateTotalStats`'s injury branch was dead code.
 * This module is the ONE place an injury is created, refreshed or recovered, and
 * it follows the house transaction contract (`advanceCityDay`, `trainStat`):
 *
 *   • `settleInjury` is PURE and returns a NEW profile. It never mutates its
 *     input, reads no storage, starts no timer, reads no wall clock and uses no
 *     randomness — the whole decision is a function of the injury and the result;
 *   • the rules are fixed: a completed defeat inflicts (or refreshes) one injury
 *     of `fightsRemaining: 2` with `penaltyStrength: 2` / `penaltyAgility: 2`,
 *     and every completed duel — won or lost — spends one fight of the injury
 *     that was already on the fighter when the settlement began;
 *   • ordering is the rule, not an accident: the injury present on entry is
 *     snapshotted and decremented FIRST, and only then does the defeat rule write
 *     a fresh injury. That is what makes a defeat refresh the duration to 2
 *     instead of leaving a freshly inflicted injury at 1.
 *
 * Both results are processed the same way on purpose: a lost duel is not a way to
 * escape the injury it earns, and an injury that is still on the fighter when the
 * next bout is settled is spent by that bout whether it was won or lost.
 *
 * Malformed legacy data is normalized narrowly (see `normalizeInjury`): a
 * non-finite or non-positive `fightsRemaining` means "no injury", and a
 * non-finite penalty resolves to the canonical 2 so `calculateTotalStats` can
 * never subtract `NaN` from a stat. Valid records are returned unchanged, and no
 * save is ever migrated — a corrupt field simply reads as absent.
 */

import type { PlayerInjury } from '../types/game';

/** How many completed duels a freshly inflicted (or refreshed) injury lasts. */
export const INJURY_FIGHTS_REMAINING = 2;

/** The fixed strength penalty of the one injury slot. */
export const INJURY_PENALTY_STRENGTH = 2;

/** The fixed agility penalty of the one injury slot. */
export const INJURY_PENALTY_AGILITY = 2;

/** The little of a profile this module needs: the injury lives on the save. */
type InjuryCarrier = { injury?: PlayerInjury | null };

/**
 * A stored penalty is a finite, non-negative number of stat points. A missing,
 * `NaN` or infinite value resolves to the canonical penalty for that side, and a
 * negative hand-edited value clamps to 0 — a "penalty" can never be a bonus.
 */
function normalizePenalty(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, value);
}

/**
 * The one validity rule for a stored injury. Total: any value at all answers
 * either a usable injury or `null` (the project's absent representation), so a
 * hand-edited save can neither throw nor poison a stat calculation.
 *
 * - a missing / `null` / non-object value is `null`;
 * - a `fightsRemaining` that is not a finite number, or is `<= 0` once floored to
 *   whole duels, is `null` (the injury is spent);
 * - a fractional duration floors to whole duels, exactly like `normalizeCityDay`;
 * - malformed penalties resolve to the canonical 2 / 2 (see `normalizePenalty`).
 */
export function normalizeInjury(value: unknown): PlayerInjury | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const record = value as Partial<Record<keyof PlayerInjury, unknown>>;
  const rawFights = record.fightsRemaining;
  if (typeof rawFights !== 'number' || !Number.isFinite(rawFights)) return null;

  const fightsRemaining = Math.floor(rawFights);
  if (fightsRemaining <= 0) return null;

  return {
    fightsRemaining,
    penaltyStrength: normalizePenalty(record.penaltyStrength, INJURY_PENALTY_STRENGTH),
    penaltyAgility: normalizePenalty(record.penaltyAgility, INJURY_PENALTY_AGILITY),
  };
}

/**
 * Settle the injury slot for ONE completed duel and return a NEW profile.
 *
 * A completed duel is authoritative: `true` for a victory, `false` for a defeat.
 * An abandoned or cancelled bout never reaches the settlement boundary that calls
 * this, so it inflicts and spends nothing.
 *
 * Ordering (the approved rules):
 *   1. snapshot the injury present on entry and spend ONE of its fights — the
 *      pre-existing injury only, never the one this defeat is about to inflict;
 *   2. a defeat then writes (or refreshes) the single injury slot at its fixed
 *      duration and fixed penalties, so penalties never accumulate and a second
 *      injury is never stacked on the first.
 *
 * Every unrelated field is carried over untouched by the spread (`city`,
 * `baseStats`, `inventory`, the training and merchant records), so this writes
 * nothing but `injury`; it never advances the city day.
 */
export function settleInjury<P extends InjuryCarrier>(profile: P, didWin: boolean): P {
  const previous = normalizeInjury(profile.injury);
  let injury: PlayerInjury | null = null;

  if (previous) {
    const fightsRemaining = previous.fightsRemaining - 1;
    injury = fightsRemaining > 0 ? { ...previous, fightsRemaining } : null;
  }

  if (!didWin) {
    injury = {
      fightsRemaining: INJURY_FIGHTS_REMAINING,
      penaltyStrength: INJURY_PENALTY_STRENGTH,
      penaltyAgility: INJURY_PENALTY_AGILITY,
    };
  }

  return { ...profile, injury };
}
