import type { ChariotTeamSize, PlayerProfile, RacingProgression } from '../types/game';
import { creditGold } from './goldTransactions';

export const MAX_RECORDED_RACE_TIME_MS = 86_400_000;

export type RaceBestTimeResult =
  | { ok: true; profile: PlayerProfile; improved: boolean; bestTimeMs: number }
  | { ok: false; reason: 'invalid-profile' | 'invalid-team-size' | 'invalid-time'; profile: PlayerProfile | null | undefined };

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
  if (teamSize !== 2 && teamSize !== 3 && teamSize !== 4) {
    return { ok: false, reason: 'invalid-team-size', profile };
  }
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || elapsedMs > MAX_RECORDED_RACE_TIME_MS) {
    return { ok: false, reason: 'invalid-time', profile };
  }

  const rounded = Math.round(elapsedMs);
  const currentRacing: RacingProgression = profile.racing && typeof profile.racing === 'object' && !Array.isArray(profile.racing)
    ? profile.racing as RacingProgression
    : {};
  const currentTimes: Partial<Record<ChariotTeamSize, number>> = currentRacing.bestTimes && typeof currentRacing.bestTimes === 'object' && !Array.isArray(currentRacing.bestTimes)
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


export type RaceCompletionOutcome = 'victory' | 'defeat' | 'photo-finish';

export interface RaceCompletionResult {
  ok: true;
  profile: PlayerProfile;
  improvedBest: boolean;
  bestTimeMs: number;
  purseAwarded: number;
  completed: number;
  wins: number;
  losses: number;
  photoFinishes: number;
}

/**
 * Settle a validated finish in one immutable profile transaction.
 * Entry is free. Every valid finish earns a modest completion purse, with a
 * small victory bonus. Only the first completed race per in-game day pays,
 * preventing an unlimited same-day gold farm. Abort never calls this function.
 */
export function settleRaceCompletion(
  profile: PlayerProfile | null | undefined,
  teamSize: ChariotTeamSize,
  elapsedMs: number,
  outcome: RaceCompletionOutcome,
  day: number,
): RaceCompletionResult | { ok: false; reason: string; profile: PlayerProfile | null | undefined } {
  if (!Number.isInteger(day) || day < 0) return { ok: false, reason: 'invalid-day', profile };
  if (outcome !== 'victory' && outcome !== 'defeat' && outcome !== 'photo-finish') {
    return { ok: false, reason: 'invalid-outcome', profile };
  }
  const best = recordRaceBestTime(profile, teamSize, elapsedMs);
  if (!best.ok) return best;

  const current = best.profile.racing ?? {};
  const count = (value: unknown): number =>
    Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : 0;
  const completed = count(current.completed);
  const wins = count(current.wins);
  const losses = count(current.losses);
  const photoFinishes = count(current.photoFinishes);
  const alreadyPaidToday = current.lastPurseDay === day;
  const basePurse = teamSize === 2 ? 40 : teamSize === 3 ? 60 : 80;
  const purseAwarded = alreadyPaidToday ? 0 : basePurse + (outcome === 'victory' ? 20 : 0);
  if ([completed, wins, losses, photoFinishes].some((value) => value >= Number.MAX_SAFE_INTEGER)) {
    return { ok: false, reason: 'career-counter-overflow', profile };
  }
  const nextGold = creditGold(best.profile.gold, purseAwarded);
  if (nextGold === null) return { ok: false, reason: 'invalid-gold-balance', profile };
  const nextRacing = {
    ...current,
    completed: completed + 1,
    wins: wins + (outcome === 'victory' ? 1 : 0),
    losses: losses + (outcome === 'defeat' ? 1 : 0),
    photoFinishes: photoFinishes + (outcome === 'photo-finish' ? 1 : 0),
    ...(alreadyPaidToday ? {} : { lastPurseDay: day }),
  };
  return {
    ok: true,
    profile: { ...best.profile, gold: nextGold, racing: nextRacing },
    improvedBest: best.improved,
    bestTimeMs: best.bestTimeMs,
    purseAwarded,
    completed: nextRacing.completed,
    wins: nextRacing.wins,
    losses: nextRacing.losses,
    photoFinishes: nextRacing.photoFinishes,
  };
}
