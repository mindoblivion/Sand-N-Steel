/**
 * dayRollover.ts — Day/Night T2: the DAY-BOUNDARY SEAM's own data and effects.
 *
 * The clock itself lives in `utils/timeState.ts` (phases, days, the advance functions).
 * This module owns the two things that only exist once a day has actually turned over:
 *
 *   • THE LUDI ROTATION — the day's own name. Day identity is `(day - 1) mod 7` and Day 1
 *     is Market Day, so the seven names repeat every week and the banner can say which
 *     day the city woke into;
 *   • THE ROLLOVER'S EFFECTS for this slice — every training session comes back, and Dies
 *     Quietus grants one more. Nothing expires and nothing is owed: a rollover is free
 *     and silent about cost.
 *
 * It also owns the duel result's ONE time settlement (`settleDuelClock`), the
 * transaction-scoped guard that stops a double-invocation of the result path from walking
 * the clock twice. NO PROFILE FIELD exists for that: `time.total` is the only clock state,
 * and the bout's "already settled" flag is session memory the caller holds (App's ref) and
 * discards with the bout.
 *
 * The Acta / deed systems are NOT built here. `onDayRollover` in `App.tsx` is the seam
 * they will hang off: it already hands them the new day, exactly once.
 */

import type { PlayerProfile } from '../types/game';
import { advanceTimeBy, resolveTimeState } from './timeState';

/**
 * The seven Ludi, in rotation order — Day 1 is Market Day. The director's table, verbatim:
 * 0 Dies Mercatus, 1 Dies Ferratus, 2 Dies Fortunae, 3 Dies Equorum, 4 Dies Sanguinis,
 * 5 Ludi Magni, 6 Dies Quietus.
 */
export const LUDI_ROTATION: readonly string[] = [
  'Dies Mercatus',
  'Dies Ferratus',
  'Dies Fortunae',
  'Dies Equorum',
  'Dies Sanguinis',
  'Ludi Magni',
  'Dies Quietus',
];

/** The rotation slot of Dies Quietus — the one day that grants an extra session. */
export const LUDI_QUIETUS_INDEX = 6;

/**
 * A day's rotation slot: `(day - 1) mod 7`, kept non-negative so a malformed day can
 * never index outside `LUDI_ROTATION`.
 */
export function ludiIndexForDay(day: number): number {
  const whole = Number.isFinite(day) ? Math.floor(day) : 1;
  const span = LUDI_ROTATION.length;
  return (((whole - 1) % span) + span) % span;
}

/** The day's own name (`Dies Mercatus` on Day 1, `Dies Quietus` on Day 7, ...). */
export function ludiDayName(day: number): string {
  return LUDI_ROTATION[ludiIndexForDay(day)];
}

/** The banner's one line: the new day's name and the dawn that opened it. */
export function dayBannerText(day: number): string {
  return `${ludiDayName(day)} · Prima Luce`;
}

/**
 * A training day's full allotment. READ FROM THE TREE, not invented: a created profile is
 * written with `trainingSessionsLeft: 2` (`utils/characterCreation.ts`) and the storage
 * fallback writes the same 2 (`services/storage.ts`), so a rollover restores exactly the
 * value a fresh gladiator starts the day with.
 */
export const TRAINING_SESSIONS_FULL = 2;

/**
 * The new day when an advance crossed a boundary, else `null`.
 *
 * The calendar day only ever changes on night -> dawn (the total reaching a multiple of
 * seven), so this is the whole rollover test: same day, no rollover.
 */
export function dayRolledTo(
  before: PlayerProfile,
  advanced: PlayerProfile,
): number | null {
  const from = resolveTimeState(before).day;
  const to = resolveTimeState(advanced).day;
  return to === from ? null : to;
}

/**
 * Apply this slice's rollover effects to the ALREADY-ADVANCED profile.
 *
 * `trainingSessionsLeft` returns to the full allotment, and Dies Quietus grants one more
 * on top (the rotation's own bonus). Nothing else is touched: no injury, no clock, no
 * purse — the clock move itself is the caller's advance.
 */
export function applyDayRollover(profile: PlayerProfile, day: number): PlayerProfile {
  const quietus = ludiIndexForDay(day) === LUDI_QUIETUS_INDEX ? 1 : 0;
  return {
    ...profile,
    trainingSessionsLeft: TRAINING_SESSIONS_FULL + quietus,
  };
}

/** What one duel-result time settlement answers. */
export interface DuelClockSettlement {
  /** The profile the transaction must save — the clock stepped at most once. */
  profile: PlayerProfile;
  /** Whether this bout's clock has now been stepped; the caller keeps it for the bout. */
  stepped: boolean;
}

/**
 * THE DUEL RESULT'S ONE ADVANCE, transaction-scoped.
 *
 * A duel that reached a result advances the clock exactly one phase, win or lose, and it
 * does so INSIDE the single resolution write (`App.handleMatchComplete`). The result path
 * runs once per bout by construction; because a second call into it would otherwise walk
 * the clock twice (and re-run the rollover), the caller holds ONE session flag per bout in
 * a ref, armed when the bout is entered and consumed here. This function is the whole
 * guard, so the double-invocation property is testable without a profile field and
 * without any storage:
 *
 *   first call  (`alreadyStepped === false`) -> `+1` phase, `stepped: true`
 *   second call (`alreadyStepped === true`)  -> unchanged,   `stepped: true`
 *
 * PURE with respect to its inputs: the profile handed in is never mutated, and nothing is
 * persisted.
 */
export function settleDuelClock(
  composed: PlayerProfile,
  alreadyStepped: boolean,
): DuelClockSettlement {
  if (alreadyStepped) return { profile: composed, stepped: true };
  return { profile: advanceTimeBy(composed, 1), stepped: true };
}
