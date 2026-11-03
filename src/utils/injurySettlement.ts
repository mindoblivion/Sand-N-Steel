/**
 * L7 — the one pure injury lifecycle and canonical validity reader.
 *
 * A completed defeat inflicts or refreshes one 2-fight injury (−2 STR / −2 AGI).
 * Every completed duel spends the injury present on entry first; a defeat then
 * refreshes the single slot to its full duration. No stacking, clock, storage,
 * timer, randomness or React.
 */
import type { PlayerInjury } from '../types/game';

export const INJURY_FIGHTS_REMAINING = 2;
export const INJURY_PENALTY_STRENGTH = 2;
export const INJURY_PENALTY_AGILITY = 2;

type InjuryCarrier = { injury?: PlayerInjury | null };

function normalizePenalty(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, value);
}

/** The single total reader used by settlement, stat calculation and presentation. */
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
 * Spend one fight from the injury carried into this duel, then apply a defeat's
 * refresh. A fresh injury is never decremented by the defeat that creates it.
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
