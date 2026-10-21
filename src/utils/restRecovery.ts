/**
 * L9 (Living City) — the ONE rest-and-recovery transaction.
 *
 * An injury (L7, `utils/injurySettlement.ts`) could only ever be spent by the
 * duels that followed it, so a wounded gladiator had to fight while wounded to
 * heal. This module is the Arena Medical House's treatment, and it follows the
 * house transaction contract (`trainStat`, `purchaseStorefrontItem`, and L7's
 * one-writer injury lifecycle in `utils/injurySettlement.ts`):
 *
 *   • **one base, one decision.** Every check reads the caller's profile, and a
 *     refusal returns `{ ok: false, reason }` with the profile (and every nested
 *     object) untouched — nothing is written until all of them pass;
 *   • **checks before the commit, in a fixed order** — the profile, the day's
 *     allowance, the wound, the purse;
 *   • **the treatment costs a DAY, not just gold.** A successful rest consumes
 *     the current city day and turns the clock by exactly one
 *     (`advanceCityDay`), recorded in the SAME profile literal as the gold and
 *     the cleared injury, so there is no second write that could race it. The
 *     merchant's allowance and the Ludus's timetable then respond to the new day
 *     through their own existing resolvers — no rule of theirs is restated here.
 *
 * `normalizeInjury` is the ONLY validity reader: the medicus treats what the
 * stat calculation is actually applying, and a malformed or spent injury is no
 * wound at all. The module is PURE — no storage, no React, no timer, no
 * wall-clock read, no randomness — and it is not a duel settlement: it awards
 * nothing, moves no win/loss statistic and never performs one. Clearing the
 * wound is the whole of its effect on the injury slot.
 */

import type { CityState, PlayerProfile } from '../types/game';
import { trainingCost } from '../data/training';
import { CITY_DAY_START, advanceCityDay, resolveCityDay } from './cityClock';
import { normalizeInjury } from './injurySettlement';

/**
 * The `city` field recording the last day a treatment succeeded. ONE number, not
 * a log: the allowance is spent exactly while it equals the current day, so a
 * later rest overwrites it and the field can never grow with play.
 */
export const REST_DAY_FIELD = 'restDay' as const;

/** Why a treatment was refused. `ok: true` never carries a reason. */
export type RestRefusal =
  | 'no-profile'
  | 'already-rested'
  | 'no-injury'
  | 'insufficient-gold';

/**
 * A treatment either commits a NEW profile — with the gold spent, the wound
 * cleared and the clock turned by one — or refuses and writes nothing.
 * `day` is the day the treatment CONSUMED (the entry day), not the day the
 * resulting profile now stands on; read that with `resolveCityDay(result.profile)`.
 */
export type RestResult =
  | { ok: true; profile: PlayerProfile; cost: number; day: number }
  | { ok: false; reason: RestRefusal };

/** The little of a profile this module needs: the clock lives on `city`. */
type CityCarrier = { city?: CityState };

/**
 * The profile's `city` object, or `{}` when the field is absent or is not a plain
 * object — the same total rule `utils/cityClock.ts` and
 * `utils/storefrontPurchase.ts` apply, repeated here so this module never
 * spreads junk (a string, number, array or `true`) into the city it returns.
 */
function readCity(profile: CityCarrier | null | undefined): CityState {
  const city = profile?.city;
  if (!city || typeof city !== 'object' || Array.isArray(city)) return {};
  return city;
}

/**
 * The last city day on which a treatment succeeded, or `null` when the save
 * carries no usable record (absent, wrong type, `NaN`, zero, negative — a legacy
 * profile and a hand-edited one alike). Total: it never throws and never invents
 * a day, so malformed data can only ever GRANT the treatment, never lock a
 * player out of a day he never spent.
 */
export function resolveRestDay(profile: CityCarrier | null | undefined): number | null {
  const raw = readCity(profile)[REST_DAY_FIELD];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const whole = Math.floor(raw);
  if (whole < CITY_DAY_START) return null;
  return whole;
}

/**
 * Whether this profile has already been treated on its current city day. Pure and
 * derived: the stored day and the clock are compared on read, so the allowance
 * resets by itself when `city.day` advances.
 */
export function isRestSpentToday(profile: CityCarrier | null | undefined): boolean {
  return resolveRestDay(profile) === resolveCityDay(profile);
}

/**
 * What one treatment costs — the shipped `25 × level` rule through the SAME
 * `trainingCost` helper the Ludus charges with. Total, like the other readers: a
 * missing or malformed level resolves to the floor (level 1) instead of throwing
 * or quoting a free treatment.
 */
export function restCost(profile: { level?: number } | null | undefined): number {
  const level = profile?.level;
  const whole = typeof level === 'number' && Number.isFinite(level) ? Math.floor(level) : CITY_DAY_START;
  return trainingCost(Math.max(CITY_DAY_START, whole));
}

/**
 * Rest at the Arena Medical House: spend one city day and `25 × level` gold to
 * clear the one injury slot.
 *
 * Checks in order — profile, today's allowance, the wound, the purse — so a
 * refusal leaves every field of the profile exactly as it was. On success the
 * entry day is captured FIRST, the clock is turned exactly once, and the returned
 * profile carries the advanced `city` (with `restDay` beside the new day, never
 * overwriting it), the reduced purse and `injury: null`. Unrelated fields are
 * carried over untouched by the spread, and no save is ever migrated: a legacy
 * profile with no `city` resolves to day 1 and rests into day 2.
 */
export function restAtMedicalHouse(
  profile: PlayerProfile | null | undefined
): RestResult {
  if (!profile) return { ok: false, reason: 'no-profile' };
  if (isRestSpentToday(profile)) return { ok: false, reason: 'already-rested' };
  if (!normalizeInjury(profile.injury)) return { ok: false, reason: 'no-injury' };

  const cost = restCost(profile);
  if (profile.gold < cost) return { ok: false, reason: 'insufficient-gold' };

  // The day the treatment consumes, captured before the clock moves: it is both
  // the result's `day` and the allowance record.
  const entryDay = resolveCityDay(profile);
  const advanced = advanceCityDay(profile);

  return {
    ok: true,
    cost,
    day: entryDay,
    profile: {
      ...advanced,
      gold: profile.gold - cost,
      injury: null,
      // `city` is the ADVANCED city: `day` stays the next day, and every other
      // city field (including the merchant's allowance) is preserved.
      city: { ...readCity(advanced), [REST_DAY_FIELD]: entryDay },
    },
  };
}
