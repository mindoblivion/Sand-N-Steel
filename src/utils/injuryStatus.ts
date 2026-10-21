/**
 * L8 (Living City) — the injury's PRESENTATION model.
 *
 * L7 gave the injury a lifecycle; until this module it had no reader in the UI, so a
 * wound that costs 2 strength and 2 agility was invisible. This module turns the ONE
 * stored injury into the words three screens show, and nothing more:
 *
 *   • it is a pure read — no React, storage, clock, timer or randomness, and it
 *     writes nothing;
 *   • it does NOT re-implement the validity rules: `normalizeInjury` (the single
 *     canonical reader the settlement and `calculateTotalStats` already share) decides
 *     whether an injury exists, so a screen can never show a wound the stat
 *     calculation is not applying, nor hide one it is;
 *   • `null` is the absent answer, exactly like `normalizeInjury` — an absent,
 *     malformed or spent record yields no status at all, which is what lets each
 *     screen render no container for an uninjured fighter.
 *
 * The numbers are the normalized penalties and duration, verbatim: the strength and
 * agility points the wound costs right now, and how many completed duels it still
 * affects.
 */

import { normalizeInjury } from './injurySettlement';

/** What an injured gladiator's screens show; `null` means "no injury to show". */
export interface InjuryStatus {
  /** Strength points the injury costs right now (a positive penalty). */
  penaltyStrength: number;
  /** Agility points the injury costs right now (a positive penalty). */
  penaltyAgility: number;
  /** Completed duels the injury still affects. */
  fightsRemaining: number;
  /** "Affects the next 2 completed duels" — singular when only one is left. */
  durationLabel: string;
}

export function describeInjury(value: unknown): InjuryStatus | null {
  const injury = normalizeInjury(value);
  if (!injury) return null;

  return {
    penaltyStrength: injury.penaltyStrength,
    penaltyAgility: injury.penaltyAgility,
    fightsRemaining: injury.fightsRemaining,
    durationLabel:
      injury.fightsRemaining === 1
        ? 'Affects the next completed duel'
        : `Affects the next ${injury.fightsRemaining} completed duels`,
  };
}
