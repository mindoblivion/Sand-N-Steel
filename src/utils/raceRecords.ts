import type { ChariotTeamSize, PlayerProfile, RacingProgression } from '../types/game';

export const MAX_RECORDED_RACE_TIME_MS = 86_400_000;

export type RaceBestTimeResult =
  | { ok: true; profile: PlayerProfile; improved: boolean; bestTimeMs: number }
  | { ok: false; reason: 'invalid-profile' | 'invalid-time'; profile: PlayerProfile | null | undefined };

/**
 * Record a faster completed lap for the selected team size.
 *
 * This is a pure profile transaction: it changes only racing.bestTimes, never
 * gold, unlocks, selection, story evidence or other progression. The caller owns
 * persistence and must invoke it only after a genuine finish-line transition.
 */
export function recordRaceBestTime(
  profile: PlayerProfile | null | undefined,
  teamSize: ChariotTeamSize,
  elapsedMs: number,
): RaceBestTimeResult {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return { ok: false, reason: 'invalid-profile', profile };
  }
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || elapsedMs > MAX_RECORDED_RACE_TIME_MS) {
    return { ok: false, reason: 'invalid-time', profile };
  }

  const rounded = Math.round(elapsedMs);
  const currentRacing = profile.racing && typeof profile.racing === 'object' && !Array.isArray(profile.racing)
    ? profile.racing as RacingProgression
    : {};
  const currentTimes = currentRacing.bestTimes && typeof currentRacing.bestTimes === 'object' && !Array.isArray(currentRacing.bestTimes)
    ? currentRacing.bestTimes
    : {};
  const previous = currentTimes[teamSize];
  const validPrevious = typeof previous === 'number' && Number.isFinite(previous) &&
    previous > 0 && previous <= MAX_RECORDED_RACE_TIME_MS
    ? Math.round(previous)
    : null;

  if (validPrevious !== null && rounded >= validPrevious) {
    return { ok: true, profile, improved: false, bestTimeMs: validPrevious };
  }

  const nextRacing: RacingProgression = {
    ...currentRacing,
    bestTimes: { ...currentTimes, [teamSize]: rounded },
  };
  const nextProfile: PlayerProfile = { ...profile, racing: nextRacing };
  return { ok: true, profile: nextProfile, improved: true, bestTimeMs: rounded };
}
