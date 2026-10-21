/**
 * L14 (Living City) — the ONE night's lodging at the Caravanserai.
 *
 * Until this phase the city clock only moved on a settled duel (L1) or on a
 * treatment at the Arena Medical House (L9), so a player who wanted tomorrow's
 * merchant stock, tomorrow's training timetable or tomorrow's visitors had to
 * fight for it. The Caravanserai is the second way to spend a day without a
 * bout, and it follows the house transaction contract exactly
 * (`restAtMedicalHouse`, `trainStat`, `purchaseStorefrontItem`):
 *
 *   • **one base, one decision.** Every check reads the caller's profile, and a
 *     refusal returns `{ ok: false, reason }` with the profile (and every nested
 *     object) untouched — nothing is built until all of them pass;
 *   • **checks before the commit, in a fixed order** — the profile, tonight's
 *     allowance, the purse;
 *   • **a room costs a DAY, not just gold.** A successful stay consumes the
 *     current city day and turns the clock by exactly one (`advanceCityDay`),
 *     recorded in the SAME profile literal as the fee and the allowance, so there
 *     is no second write that could race it. The merchant's stock and its daily
 *     purchase, the Ludus's timetable and the visitors' arrivals then respond to
 *     the new day through their own existing resolvers — no rule of theirs is
 *     restated here.
 *
 * **Lodging is not the medicus.** Sleeping at the inn advances the day and
 * nothing else: the injury slot is carried across untouched (an injured
 * gladiator wakes on the next day still injured), no reward, item or statistic
 * moves, and no duel is settled. Healing stays the Arena Medical House's job
 * (`utils/restRecovery.ts`), read here not at all.
 *
 * The module is PURE — no storage, no React, no timer, no wall-clock read, no
 * randomness — and it is not a second clock: the day is resolved and advanced
 * only through `utils/cityClock.ts`.
 */

import type { CityState, PlayerProfile } from '../types/game';
import { trainingCost } from '../data/training';
import { CITY_DAY_START, advanceCityDay, resolveCityDay } from './cityClock';

/**
 * The `city` field recording the last day a room was taken. ONE number, not a
 * log: the allowance is spent exactly while it equals the current day, so a later
 * stay overwrites it and the field can never grow with play.
 */
export const LODGING_DAY_FIELD = 'lodgingDay' as const;

/** Why a stay was refused. `ok: true` never carries a reason. */
export type LodgingRefusal = 'no-profile' | 'already-lodged' | 'insufficient-gold';

/**
 * A stay either commits a NEW profile — with the fee spent and the clock turned
 * by one — or refuses and writes nothing. `day` is the day the stay CONSUMED (the
 * entry day), not the day the resulting profile now stands on; read that with
 * `resolveCityDay(result.profile)`.
 */
export type LodgingResult =
  | { ok: true; profile: PlayerProfile; cost: number; day: number }
  | { ok: false; reason: LodgingRefusal };

/** The little of a profile this module needs: the clock lives on `city`. */
type CityCarrier = { city?: CityState };

/**
 * The profile's `city` object, or `{}` when the field is absent or is not a plain
 * object — the same total rule `utils/cityClock.ts` and
 * `utils/restRecovery.ts` apply, repeated here so this module never spreads junk
 * (a string, number, array or `true`) into the city it returns.
 */
function readCity(profile: CityCarrier | null | undefined): CityState {
  const city = profile?.city;
  if (!city || typeof city !== 'object' || Array.isArray(city)) return {};
  return city;
}

/**
 * The last city day on which a room was taken, or `null` when the save carries no
 * usable record (absent, wrong type, `NaN`, zero, negative — a legacy profile and
 * a hand-edited one alike). Total: it never throws and never invents a day, so
 * malformed data can only ever GRANT the stay, never lock a player out of a night
 * he never paid for.
 */
export function resolveLodgingDay(profile: CityCarrier | null | undefined): number | null {
  const raw = readCity(profile)[LODGING_DAY_FIELD];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const whole = Math.floor(raw);
  if (whole < CITY_DAY_START) return null;
  return whole;
}

/**
 * Whether this profile has already taken a room on its current city day. Pure and
 * derived: the stored day and the clock are compared on read, so the allowance
 * resets by itself when `city.day` advances.
 */
export function isLodgingSpentToday(profile: CityCarrier | null | undefined): boolean {
  return resolveLodgingDay(profile) === resolveCityDay(profile);
}

/**
 * What one night costs — the shipped `25 × level` rule through the SAME
 * `trainingCost` helper the Ludus and the medicus charge with, so there is one
 * price formula in the game and not two. Total, like the other readers: a
 * missing or malformed level resolves to the floor (level 1) instead of throwing
 * or quoting a free room.
 */
export function lodgingCost(profile: { level?: number } | null | undefined): number {
  const level = profile?.level;
  const whole = typeof level === 'number' && Number.isFinite(level) ? Math.floor(level) : CITY_DAY_START;
  return trainingCost(Math.max(CITY_DAY_START, whole));
}

/**
 * Take a room at the Caravanserai: spend one city day and `25 × level` gold to
 * wake on the next day.
 *
 * Checks in order — profile, tonight's allowance, the purse — so a refusal leaves
 * every field of the profile exactly as it was. On success the entry day is
 * captured FIRST, the clock is turned exactly once, and the returned profile
 * carries the advanced `city` (with `lodgingDay` beside the new day, never
 * overwriting it) and the reduced purse. Every unrelated field is carried over
 * untouched by the spread — injury included: a night's sleep is not a treatment.
 * No save is ever migrated: a legacy profile with no `city` lodges from day 1 into
 * day 2.
 */
export function lodgeAtCaravanserai(
  profile: PlayerProfile | null | undefined
): LodgingResult {
  if (!profile) return { ok: false, reason: 'no-profile' };
  if (isLodgingSpentToday(profile)) return { ok: false, reason: 'already-lodged' };

  const cost = lodgingCost(profile);
  if (profile.gold < cost) return { ok: false, reason: 'insufficient-gold' };

  // The day the stay consumes, captured before the clock moves: it is both the
  // result's `day` and the allowance record.
  const entryDay = resolveCityDay(profile);
  const advanced = advanceCityDay(profile);

  return {
    ok: true,
    cost,
    day: entryDay,
    profile: {
      ...advanced,
      gold: profile.gold - cost,
      // `city` is the ADVANCED city: `day` stays the next day, and every other
      // city field (the merchant's allowance, the medicus's, the visitor
      // histories) is preserved.
      city: { ...readCity(advanced), [LODGING_DAY_FIELD]: entryDay },
    },
  };
}
