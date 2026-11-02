import { canDebitGold } from './goldTransactions';
/**
 * L9 — the Arena Medical House's one-rest-per-day transaction.
 *
 * The authoritative day is derived from main's existing seven-phase timeState
 * clock. The optional city.restDay is only an allowance marker; it is never a
 * second clock and never carries a day counter. A successful rest costs 25 ×
 * character level, clears the one normalized injury, and advances exactly one
 * full in-game day. App composes day-boundary effects and performs the one save.
 *
 * Pure: no React, persistence, wall clock, timers, randomness or mutation.
 */
import type { PlayerProfile } from '../types/game';
import { advanceTimeBy, resolveTimeState, PHASES_PER_DAY } from './timeState';
import { normalizeInjury } from './injurySettlement';

export const REST_DAY_FIELD = 'restDay' as const;
export const REST_DAY_PHASES = PHASES_PER_DAY;
export const REST_BASE_COST = 25;

export type RestRefusal =
  | 'no-profile'
  | 'already-rested'
  | 'no-injury'
  | 'insufficient-gold';

export type RestEligibility =
  | { ok: true; cost: number; day: number }
  | { ok: false; reason: RestRefusal; cost: number; day: number };

export type RestResult =
  | { ok: true; profile: PlayerProfile; cost: number; day: number }
  | { ok: false; reason: RestRefusal };

type CityCarrier = { city?: { restDay?: unknown } | null };

function readCity(profile: CityCarrier | null | undefined): { restDay?: unknown } {
  const city = profile?.city;
  if (!city || typeof city !== 'object' || Array.isArray(city)) return {};
  return city;
}

/** The last in-game day on which a Medical House rest succeeded. */
export function resolveRestDay(profile: CityCarrier | null | undefined): number | null {
  const raw = readCity(profile).restDay;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const day = Math.floor(raw);
  return day >= 1 ? day : null;
}

/** The allowance resets automatically when the timeState-derived day changes. */
export function isRestSpentToday(profile: PlayerProfile | null | undefined): boolean {
  if (!profile) return false;
  return resolveRestDay(profile) === resolveTimeState(profile).day;
}

/** The fixed 25 × level Medical House fee; malformed/legacy levels use level 1. */
export function restCost(profile: Pick<PlayerProfile, 'level'> | null | undefined): number {
  const raw = profile?.level;
  const level = typeof raw === 'number' && Number.isFinite(raw)
    ? Math.max(1, Math.min(Math.floor(raw), Math.floor(Number.MAX_SAFE_INTEGER / REST_BASE_COST)))
    : 1;
  return REST_BASE_COST * level;
}

/** Read-only eligibility in the transaction's fixed check order. */
export function getRestEligibility(
  profile: PlayerProfile | null | undefined,
): RestEligibility {
  const day = profile ? resolveTimeState(profile).day : 1;
  const cost = restCost(profile);
  if (!profile) return { ok: false, reason: 'no-profile', cost, day };
  if (isRestSpentToday(profile)) return { ok: false, reason: 'already-rested', cost, day };
  if (!normalizeInjury(profile.injury)) return { ok: false, reason: 'no-injury', cost, day };
  if (!canDebitGold(profile.gold, cost)) {
    return { ok: false, reason: 'insufficient-gold', cost, day };
  }
  return { ok: true, cost, day };
}

/**
 * Rest at the Arena Medical House. The entry day is recorded in city.restDay,
 * then time.total advances by seven phases (one full day, same phase). This
 * preserves main's single clock and leaves App to apply the existing day rollover.
 */
export function restAtMedicalHouse(
  profile: PlayerProfile | null | undefined,
): RestResult {
  const eligibility = getRestEligibility(profile);
  if (!eligibility.ok) return { ok: false, reason: eligibility.reason };
  if (!profile) return { ok: false, reason: 'no-profile' };

  const advanced = advanceTimeBy(profile, REST_DAY_PHASES);
  return {
    ok: true,
    cost: eligibility.cost,
    day: eligibility.day,
    profile: {
      ...advanced,
      gold: profile.gold - eligibility.cost,
      injury: null,
      city: { ...readCity(profile), [REST_DAY_FIELD]: eligibility.day },
    },
  };
}
