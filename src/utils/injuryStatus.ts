/**
 * L8 — the one read-only presentation model for a stored injury.
 *
 * Validity and malformed-save handling belong to injurySettlement.normalizeInjury.
 * Screens receive null for an absent/spent injury or a small, normalized display
 * record. This module has no React, storage, clock, timer or settlement behavior.
 */
import { normalizeInjury } from './injurySettlement';

export interface InjuryStatus {
  penaltyStrength: number;
  penaltyAgility: number;
  fightsRemaining: number;
  durationLabel: string;
}

export function describeInjury(value: unknown): InjuryStatus | null {
  const injury = normalizeInjury(value);
  if (!injury) return null;
  return {
    penaltyStrength: injury.penaltyStrength,
    penaltyAgility: injury.penaltyAgility,
    fightsRemaining: injury.fightsRemaining,
    durationLabel: injury.fightsRemaining === 1
      ? 'Affects the next completed duel'
      : `Affects the next ${injury.fightsRemaining} completed duels`,
  };
}
