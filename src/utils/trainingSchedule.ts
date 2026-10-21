/**
 * L5 (Living City) — the day-based training schedule: the ONE deterministic
 * answer to "which drills does the Ludus run on this city day?".
 *
 * The training catalogue (`data/training.ts`) lists four disciplines and the
 * game has no session limit, so this module adds ONLY the schedule arithmetic
 * on top of it. It owns no drill, no cost, no stat effect and no progression
 * rule:
 *
 *   • the day is `resolveCityDay(profile)` from `utils/cityClock.ts` — the one
 *     clock. `scheduleTrainingDay` also takes an explicit day (normalized
 *     through the same `normalizeCityDay`) for a caller that already has one.
 *     There is no second clock, no wall clock, no timer and no randomness, so
 *     the same day always produces the same schedule — after a reload, on
 *     another device, and on a local or a Drive save alike. Nothing is
 *     persisted: the schedule is derived from the saved day, so it cannot
 *     drift from it;
 *   • membership is the catalogue itself. The resolver only ever SELECTS from
 *     the actions it is handed, deduplicated by id, so a schedule can never
 *     name a drill the training yard does not run.
 *
 * Cadence (a tuned constant, not a game rule): one discipline rests each day,
 * so three of the four are available. The game establishes no cadence of its
 * own, so this is the least disruptive variation available — any smaller window
 * would withhold more of the existing training than this phase needs.
 */

import { TRAINING_ACTIONS, type TrainingAction } from '../data/training';
import type { CityState } from '../types/game';
import { normalizeCityDay, resolveCityDay } from './cityClock';

/** The little of a profile this module needs: the clock lives on `city`. */
type CityCarrier = { city?: CityState };

/** How many published drills rest on one day (never all of them). */
export const TRAINING_RESTING_PER_DAY = 1;

/** One city day's timetable. */
export interface TrainingSchedule {
  /** The resolved city day — exactly what `resolveCityDay` answered. */
  day: number;
  /** The drills available today, in catalogue order. */
  actions: TrainingAction[];
  /** The drills resting today, in catalogue order. */
  resting: TrainingAction[];
}

/**
 * FNV-1a (32-bit) over a small ASCII key. Deterministic across platforms and
 * runs by construction: integer mixing only, no floating point, no locale.
 */
function hash32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** The catalogue without repeated ids (first entry wins), so a schedule can never list a drill twice. */
function uniqueActions(catalogue: readonly TrainingAction[]): TrainingAction[] {
  const seen = new Set<string>();
  const actions: TrainingAction[] = [];
  for (const action of catalogue) {
    if (seen.has(action.id)) continue;
    seen.add(action.id);
    actions.push(action);
  }
  return actions;
}

/**
 * The timetable for one explicit day and one explicit catalogue.
 *
 * Pure and total: any day at all (via `normalizeCityDay`) and any catalogue
 * length is answerable. A catalogue of one drill rests it on no day (there
 * would be nothing left to train); an empty catalogue answers an empty
 * timetable rather than inventing one.
 */
export function scheduleTrainingDay(
  catalogue: readonly TrainingAction[],
  day: number
): TrainingSchedule {
  const resolvedDay = normalizeCityDay(day);
  const actions = uniqueActions(catalogue);

  if (actions.length <= TRAINING_RESTING_PER_DAY) {
    return { day: resolvedDay, actions, resting: [] };
  }

  const restingCount = Math.min(TRAINING_RESTING_PER_DAY, actions.length - 1);
  const start = hash32(`sand-and-steel:training-schedule:${resolvedDay}`) % actions.length;
  const restingIds = new Set<string>();
  for (let i = 0; i < restingCount; i += 1) restingIds.add(actions[(start + i) % actions.length].id);

  return {
    day: resolvedDay,
    actions: actions.filter((action) => !restingIds.has(action.id)),
    resting: actions.filter((action) => restingIds.has(action.id)),
  };
}

/**
 * The schedule for the day the profile is on: the ONE list the training screen
 * renders and the ONE membership gate the training transaction checks, so a
 * card on screen and a session agree by construction. A legacy save (no `city`)
 * reads day 1; opening or using the yard never advances the day.
 */
export function resolveTrainingSchedule(profile?: CityCarrier | null): TrainingSchedule {
  return scheduleTrainingDay(TRAINING_ACTIONS, resolveCityDay(profile));
}

/** Whether the Ludus runs this drill on the profile's current city day. */
export function isTrainingActionScheduled(
  profile: CityCarrier | null | undefined,
  id: string
): boolean {
  return resolveTrainingSchedule(profile).actions.some((action) => action.id === id);
}
