import type { PlayerProfile, PhysicalDevelopment } from '../types/game';
import { resolveTimeState } from './timeState';

export type PhysicalTrainingStat = 'strength' | 'agility' | 'stamina' | 'defense';

const MAX_COUNTER = 100_000;

const ZERO_DEVELOPMENT: PhysicalDevelopment = {
  strengthSessions: 0,
  agilitySessions: 0,
  staminaSessions: 0,
  defenseSessions: 0,
  trainingDays: 0,
  trainingStreak: 0,
  lastTrainingDay: 0,
  recoveryDays: 0,
  lastRecoveryDay: 0,
};

function readCounter(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_COUNTER, Math.floor(value)));
}

function readDay(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)));
}

/** Read the optional nested appearance history without migrating or mutating a save. */
export function resolvePhysicalDevelopment(value: unknown): PhysicalDevelopment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...ZERO_DEVELOPMENT };
  }
  const raw = value as Record<string, unknown>;
  const trainingDays = readCounter(raw.trainingDays);
  return {
    strengthSessions: readCounter(raw.strengthSessions),
    agilitySessions: readCounter(raw.agilitySessions),
    staminaSessions: readCounter(raw.staminaSessions),
    defenseSessions: readCounter(raw.defenseSessions),
    trainingDays,
    trainingStreak: Math.min(trainingDays, readCounter(raw.trainingStreak)),
    lastTrainingDay: readDay(raw.lastTrainingDay),
    recoveryDays: readCounter(raw.recoveryDays),
    lastRecoveryDay: readDay(raw.lastRecoveryDay),
  };
}

/**
 * Record one paid Ludus session. Multiple drills on the same in-game day each
 * count as a session, but the day/streak counters advance only once for that day.
 * The clock is read before App advances it for the completed session.
 */
export function recordPhysicalTraining(
  profile: PlayerProfile,
  stat: PhysicalTrainingStat,
): PlayerProfile {
  const current = resolvePhysicalDevelopment(profile.appearance.physique);
  const day = resolveTimeState(profile).day;
  const sameDay = current.lastTrainingDay === day;
  const isNextDay = current.lastTrainingDay === day - 1;
  const isNewerDay = day > current.lastTrainingDay;
  const next: PhysicalDevelopment = {
    ...current,
    [`${stat}Sessions`]: readCounter(current[`${stat}Sessions`] + 1),
    trainingDays: isNewerDay ? readCounter(current.trainingDays + 1) : current.trainingDays,
    trainingStreak: sameDay
      ? current.trainingStreak
      : isNextDay
        ? readCounter(current.trainingStreak + 1)
        : isNewerDay
          ? 1
          : current.trainingStreak,
    lastTrainingDay: isNewerDay ? day : current.lastTrainingDay,
  };
  return {
    ...profile,
    appearance: { ...profile.appearance, physique: next },
  };
}

/** Record one completed rest/recovery day; duplicate rest events on a day count once. */
export function recordPhysicalRecovery(
  profile: PlayerProfile,
  entryDay = resolveTimeState(profile).day,
): PlayerProfile {
  const current = resolvePhysicalDevelopment(profile.appearance.physique);
  const day = readDay(entryDay);
  if (day < 1 || day <= current.lastRecoveryDay) return profile;
  return {
    ...profile,
    appearance: {
      ...profile.appearance,
      physique: {
        ...current,
        recoveryDays: readCounter(current.recoveryDays + 1),
        lastRecoveryDay: day,
      },
    },
  };
}
