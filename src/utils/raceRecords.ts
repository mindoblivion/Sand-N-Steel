import type { ChariotTeamSize, PlayerProfile, RacingProgression } from '../types/game';
import { creditGold } from './goldTransactions';
import { resolveClaimedLeagueTierIds, resolveLeaguePrizeAwards } from './racingLeague';

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
  /**
   * ECON-2 — League bonus paid on this finish (0 when no tier fired). Reported
   * on the result so the finish screen can name it: a prize paid but not
   * reported would be silent gold, the defect BET-1 removed from betting.
   */
  prizeAwarded: number;
  /** Fame paid with the League bonus on this finish (0 when no tier fired). */
  fameAwarded: number;
  /** Highest League tier whose bonus fired on this finish, or null. */
  tierAdvanced: number | null;
  /** League points earned on this finish (50 win / 15 otherwise). */
  leaguePointsEarned: number;
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
  const basePurse = teamSize === 2 ? 80 : teamSize === 3 ? 120 : 200;
  const victoryBonus = teamSize === 2 ? 20 : teamSize === 3 ? 30 : 50;
  const purseAwarded = alreadyPaidToday ? 0 : basePurse + (outcome === 'victory' ? victoryBonus : 0);
  if ([completed, wins, losses, photoFinishes].some((value) => value >= Number.MAX_SAFE_INTEGER)) {
    return { ok: false, reason: 'career-counter-overflow', profile };
  }
  const currentLeaguePoints = current.leaguePoints || 0;
  const leaguePointsEarned = outcome === 'victory' ? 50 : 15;
  const nextLeaguePoints = currentLeaguePoints + leaguePointsEarned;

  // ECON-2 — the League bonus: every tier whose points threshold is met, whose
  // bonus is unclaimed, and whose team the player owns pays once, in this same
  // transaction. A one-time milestone cannot be farmed, so it is paid
  // regardless of `lastPurseDay` — a player crossing a threshold on an
  // already-paid day still earned it. On the claim-as-you-go path at most one
  // tier fires per finish; a save banking points above unclaimed thresholds
  // collects every due bonus on its next finish, never on load.
  const leagueAwards = resolveLeaguePrizeAwards(best.profile, nextLeaguePoints);
  const prizeAwarded = leagueAwards.reduce((sum, award) => sum + award.gold, 0);
  const fameAwarded = leagueAwards.reduce((sum, award) => sum + award.fame, 0);
  const tierAdvanced = leagueAwards.length > 0 ? leagueAwards[leagueAwards.length - 1].tier.id : null;
  const claimedTierIds = [...resolveClaimedLeagueTierIds(best.profile), ...leagueAwards.map((award) => award.tier.id)];

  const nextGold = creditGold(best.profile.gold, purseAwarded + prizeAwarded);
  if (nextGold === null) return { ok: false, reason: 'invalid-gold-balance', profile };

  const nextRacing = {
    ...current,
    completed: completed + 1,
    wins: wins + (outcome === 'victory' ? 1 : 0),
    losses: losses + (outcome === 'defeat' ? 1 : 0),
    photoFinishes: photoFinishes + (outcome === 'photo-finish' ? 1 : 0),
    leaguePoints: nextLeaguePoints,
    ...(alreadyPaidToday ? {} : { lastPurseDay: day }),
    ...(leagueAwards.length > 0 ? { leaguePrizesClaimed: claimedTierIds } : {}),
  };

  // BET-1 — the tavern bet is cut, so no settlement reads it: a stale
  // `activeRaceBet` on an old save simply sits unread (see `raceRecords.test.ts`).
  // ECON-2 — fame is only written when a League bonus pays it; otherwise the
  // profile's own fame passes through untouched.
  const nextFame = typeof best.profile.fame === 'number' && Number.isFinite(best.profile.fame) && best.profile.fame >= 0
    ? best.profile.fame + fameAwarded
    : fameAwarded;
  const finalProfile: PlayerProfile = {
    ...best.profile,
    gold: nextGold,
    ...(fameAwarded > 0 ? { fame: nextFame } : {}),
    racing: nextRacing,
  };

  return {
    ok: true,
    profile: finalProfile,
    improvedBest: best.improved,
    bestTimeMs: best.bestTimeMs,
    purseAwarded,
    completed: nextRacing.completed,
    wins: nextRacing.wins,
    losses: nextRacing.losses,
    photoFinishes: nextRacing.photoFinishes,
    prizeAwarded,
    fameAwarded,
    tierAdvanced,
    leaguePointsEarned,
  };
}
