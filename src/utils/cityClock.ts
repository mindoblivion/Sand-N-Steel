/**
 * L1 (Living City) — the in-game clock: the ONE authoritative day.
 *
 * The Living City discovery audit (`AGENTS.md`, "Living City discovery audit")
 * found that nothing in the game persisted time at all, so this module is the
 * foundation every later Living City phase reads: a single `profile.city.day`
 * counter, resolved totally and advanced by exactly one per completed duel.
 *
 * It follows the house pattern for persisted state exactly (`resolveRacingState`,
 * `resolveStoryState`, `resolveRoadState`):
 *
 *   • a legacy save has no `city` field at all and must keep loading, so a
 *     missing, partial or malformed field resolves to **day 1** instead of being
 *     repaired — no migration ever rewrites a save just to introduce the field;
 *   • `advanceCityDay` is PURE. It returns a NEW profile with a NEW `city` object;
 *     it never mutates its input, never writes storage, never touches React state
 *     and starts no timer. Persistence and lifecycle stay at the application
 *     boundary (`App.handleMatchComplete`), which saves the one profile update
 *     the duel already credits;
 *   • a day is always a positive integer. Non-numbers, `NaN`, `Infinity`, zero and
 *     negatives normalize to day 1; a fractional value is floored to a whole day;
 *     and the value is capped at `Number.MAX_SAFE_INTEGER`, so no addition and no
 *     later arithmetic on it can produce an invalid day.
 *
 * There is deliberately no calendar, no weekday, no season, no day/night phase
 * and no real-world timestamp in this phase. The clock is passive: it never
 * advances on its own, and nothing inside this module reads the wall clock.
 */

import { CityState } from '../types/game';

/** The day a profile with no usable clock starts on, and the floor of every day. */
export const CITY_DAY_START = 1;

/** The ceiling: the largest day that is still a safe integer after `+ 1`. */
export const CITY_DAY_MAX = Number.MAX_SAFE_INTEGER;

/** The little of a profile this module needs: the clock lives on `city`. */
type CityCarrier = { city?: CityState };

/**
 * The one validity rule for a stored day. Total: any value at all answers a
 * usable day, so a corrupt save can never produce an invalid time calculation.
 */
export function normalizeCityDay(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return CITY_DAY_START;
  const whole = Math.floor(value);
  if (whole < CITY_DAY_START) return CITY_DAY_START;
  return Math.min(whole, CITY_DAY_MAX);
}

/**
 * The profile's `city` object, or `{}` when the field is absent or is not a
 * plain object (a hand-edited or truncated save must not throw, and a string or
 * array must not be spread into the new state).
 */
function readCity(profile: CityCarrier | null | undefined): CityState {
  const city = profile?.city;
  if (!city || typeof city !== 'object' || Array.isArray(city)) return {};
  return city;
}

/**
 * The current in-game day — **the single authoritative reader**. Every consumer
 * (now and in later Living City phases) resolves the day through this function,
 * so there is one clock and no parallel counter.
 */
export function resolveCityDay(profile?: CityCarrier | null): number {
  return normalizeCityDay(readCity(profile).day);
}

/**
 * The next day for a completed event: exactly one day later, never invalid.
 * Exported on its own so a caller that needs only the number cannot drift from
 * `advanceCityDay`'s rule.
 */
export function nextCityDay(profile?: CityCarrier | null): number {
  return Math.min(resolveCityDay(profile) + CITY_DAY_START, CITY_DAY_MAX);
}

/**
 * Advance the clock by exactly one day and return a NEW profile.
 *
 * Every unrelated field is carried over untouched (the spread preserves the
 * identity of `baseStats`, `equipped`, `inventory` and the other optional
 * records), and any future member already inside `city` is preserved too, so
 * later phases can extend the object without this function dropping their data.
 * The input profile is never mutated.
 */
export function advanceCityDay<P extends CityCarrier>(
  profile: P
): P & { city: CityState & { day: number } } {
  return {
    ...profile,
    city: { ...readCity(profile), day: nextCityDay(profile) },
  };
}
