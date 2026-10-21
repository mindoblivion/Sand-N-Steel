/**
 * L5 (Living City) — the authoritative training transaction.
 *
 * One session was previously charged inside `App.handleTrainStat` while the
 * screen computed the same `25 × level` cost a second time and neither of them
 * knew about a schedule. This module is the ONE place a session is decided:
 * the catalogue entry (`data/training.ts`), the day's schedule
 * (`utils/trainingSchedule.ts`) and the purse are all checked against the
 * profile it is handed, and only then is ONE new profile built.
 *
 * Follows the house transaction contract (`purchaseStorefrontItem`,
 * `sellItem`, `purchaseChariotPart`): a refusal returns `{ ok: false, reason }`
 * and nothing is written, a success returns a NEW profile — gold and the stat
 * in the same literal — and the caller's profile is never mutated. It starts
 * no timer, reads no storage, touches no other field, and never advances the
 * city day (`city` is carried over untouched by the spread).
 */

import {
  getTrainingAction,
  trainingCost,
  type TrainingAction,
} from '../data/training';
import type { PlayerProfile } from '../types/game';
import { isTrainingActionScheduled } from './trainingSchedule';

export type TrainingRefusal =
  | 'no-profile'
  | 'unknown-action'
  | 'not-scheduled'
  | 'insufficient-gold';

export type TrainingResult =
  | { ok: true; profile: PlayerProfile; action: TrainingAction; cost: number }
  | { ok: false; reason: TrainingRefusal };

/**
 * Train one base stat by one point, if the Ludus runs that drill today and the
 * purse covers it. Checks in order — profile, catalogue entry, today's
 * schedule, gold — so an unavailable or unaffordable call leaves every field of
 * the profile exactly as it was.
 */
export function trainStat(
  profile: PlayerProfile | null | undefined,
  stat: string
): TrainingResult {
  if (!profile) return { ok: false, reason: 'no-profile' };

  const action = getTrainingAction(stat);
  if (!action) return { ok: false, reason: 'unknown-action' };

  if (!isTrainingActionScheduled(profile, action.id)) return { ok: false, reason: 'not-scheduled' };

  const cost = trainingCost(profile.level);
  if (profile.gold < cost) return { ok: false, reason: 'insufficient-gold' };

  return {
    ok: true,
    action,
    cost,
    profile: {
      ...profile,
      gold: profile.gold - cost,
      baseStats: {
        ...profile.baseStats,
        [action.id]: profile.baseStats[action.id] + 1,
      },
    },
  };
}
