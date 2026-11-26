/**
 * ACADEMY-INTERIOR — the Gladiator Academy's Intensive Course, as data.
 *
 * DIRECTOR RULINGS (canon: building-keepers.md §2.9, Shops §1.8):
 * (1) The Intensive is Rufus's hard course: +2 to ONE stat (not +1), at 3x
 *     the yard session's price, gated at character level 3+. The yard session
 *     itself is unchanged — this is the Academy's harder, dearer version.
 * (2) The price is the yard's own price, tripled: trainingCost(profile) * 3,
 *     so a yard upgrade (25 → 22 → 20 base) lowers the Intensive too. The
 *     yard stays the ONLY place a training price is set (P5).
 * (3) The Intensive is a session, not a second economy: it requires the
 *     drill to be scheduled today (the same deterministic timetable that
 *     governs the yard — trainingSchedule.ts), and it records ONE session
 *     through recordPhysicalTraining, the same as a yard session. Since
 *     PHASE2-TRAINING it also spends one of the day's sessions
 *     (trainingSessionsLeft), like a yard session — the counter is a hard
 *     cap, and at zero the course is refused with 'sessions-exhausted'.
 * (4) Refusals return before any gold moves and before any save: a refused
 *     Intensive leaves gold, stats, physique and the clock exactly as they
 *     were. The module owns no clock step and no save — App wraps a success
 *     the way handleTrainStat does (advance one phase, settle Ludi deeds,
 *     one save).
 * (5) No new save field. The Intensive writes gold, baseStats and the
 *     physique record — all existing fields. §J is untouched.
 */

import type { PlayerProfile } from '../types/game';
import { canDebitGold } from './goldTransactions';
import { trainingCost } from './facilityProgression';
import { isTrainingActionScheduled } from './trainingSchedule';
import { recordPhysicalTraining, type PhysicalTrainingStat } from './physicalDevelopment';

export const INTENSIVE_LEVEL_MIN = 3;
export const INTENSIVE_PRICE_MULTIPLIER = 3;
export const INTENSIVE_STAT_GAIN = 2;

export type IntensiveRefusal = 'below-level' | 'not-scheduled' | 'sessions-exhausted' | 'insufficient-gold';

/** The character's level, floored at 1 — the same rung trainingCost uses. */
function resolveLevel(profile: PlayerProfile | null | undefined): number {
  const level = profile?.level;
  return typeof level === 'number' && Number.isFinite(level) && level >= 1
    ? Math.floor(level)
    : 1;
}

/**
 * What one Intensive Course costs this profile: the yard session's price,
 * tripled. 75 gold at level 1 with an unupgraded yard, 300 at level 4.
 */
export function intensiveCourseCost(profile: PlayerProfile | null | undefined): number {
  return trainingCost(profile) * INTENSIVE_PRICE_MULTIPLIER;
}

export function isIntensiveQualified(profile: PlayerProfile | null | undefined): boolean {
  return resolveLevel(profile) >= INTENSIVE_LEVEL_MIN;
}

/**
 * The refusal for this profile and drill, or null when the course can run.
 * Checked in the order Rufus would say them: the level gate first (he names
 * the course only to those who qualify), then the day's timetable, then the
 * day's sessions, then the purse.
 */
export function intensiveRefusal(
  profile: PlayerProfile | null | undefined,
  stat: PhysicalTrainingStat,
): IntensiveRefusal | null {
  if (!isIntensiveQualified(profile)) return 'below-level';
  if (!isTrainingActionScheduled(profile, stat)) return 'not-scheduled';
  // PHASE2-TRAINING — the day's sessions are a hard cap: the course spends
  // one, like a yard session, and at zero Rufus refuses before the purse.
  if ((profile?.trainingSessionsLeft ?? 0) <= 0) return 'sessions-exhausted';
  if (!canDebitGold(profile?.gold ?? 0, intensiveCourseCost(profile))) {
    return 'insufficient-gold';
  }
  return null;
}

export type IntensiveResult =
  | { ok: true; profile: PlayerProfile }
  | { ok: false; reason: IntensiveRefusal };

/**
 * Run one Intensive Course: debit 3x the session price, add +2 to the stat,
 * spend one of the day's sessions, record the session. Pure — no clock step,
 * no save, no profile mutation. A refusal returns the reason and the caller's
 * profile untouched.
 */
export function applyIntensiveTraining(
  profile: PlayerProfile,
  stat: PhysicalTrainingStat,
): IntensiveResult {
  const reason = intensiveRefusal(profile, stat);
  if (reason) return { ok: false, reason };
  const cost = intensiveCourseCost(profile);
  const trained = recordPhysicalTraining(
    {
      ...profile,
      gold: profile.gold - cost,
      trainingSessionsLeft: profile.trainingSessionsLeft - 1,
      baseStats: {
        ...profile.baseStats,
        [stat]: profile.baseStats[stat] + INTENSIVE_STAT_GAIN,
      },
    },
    stat,
  );
  return { ok: true, profile: trained };
}

export function intensiveRefusalLine(reason: IntensiveRefusal, cost: number): string {
  switch (reason) {
    case 'below-level':
      return "Rufus shakes his head. 'Three levels of blood first. The hard course is not for beginners.'";
    case 'not-scheduled':
      return "'That drill rests today,' Rufus says. 'The timetable is the timetable.'";
    case 'sessions-exhausted':
      return "'No sessions left today,' Rufus says. 'The sand keeps count. Come back at dawn.'";
    case 'insufficient-gold':
      return `'The course costs ${cost} gold,' Rufus says, without looking up. 'Come back with it.'`;
  }
}

export function intensiveSuccessLine(stat: PhysicalTrainingStat): string {
  return `The hard course is done. Rufus allows himself the smallest of nods — two points of ${stat}, and the sand remembers.`;
}
