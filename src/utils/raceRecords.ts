import type { ChariotTeamSize, PlayerProfile, RacingProgression } from '../types/game';
import { resolveRaceTier } from '../data/raceTiers';
import type { RaceRungId } from './raceCompetitors';
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

/**
 * LADDER-1E §7 Q2 — the best-time normalization: the recorded best is the
 * NORMALIZED time, the raw elapsed minus the player's measured formation gap.
 *
 * The race clock starts at the leader's crossing (`raceStartedAt`), but the
 * player crosses 1.5–3.0 s later (their own slot's roll path), so the raw
 * elapsed carries the player's slot gap. The gap is the measured delay
 * between the two crossing instants — the player's own crossing
 * (`playerCrossingAt`) minus the leader's (`raceStartedAt`) — never a
 * constant and never the 3.59 s worst-case bound, which is the bound, not the
 * value. The gap is slot-dependent, so the measured delay is exact for every
 * slot. A missing origin, a non-positive gap, or a gap that would erase the
 * race normalizes to the raw elapsed: the best is never made worse than the
 * drive by a bad clock reading.
 */
export function resolveNormalizedRaceTime(
  elapsedMs: number,
  playerCrossingAt: number | null,
  raceStartedAt: number | null,
): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return elapsedMs;
  if (playerCrossingAt === null || raceStartedAt === null) return elapsedMs;
  const gap = playerCrossingAt - raceStartedAt;
  if (!Number.isFinite(gap) || gap <= 0) return elapsedMs;
  const normalized = elapsedMs - gap;
  return normalized > 0 ? normalized : elapsedMs;
}

/** A valid best finish: a safe integer within the rung's field, else null. */
function validBestFinish(value: unknown, maxPlace: number): number | null {
  return typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= maxPlace
    ? value
    : null;
}

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
 *
 * LADDER-1E — the settlement is per-rung: `rung` (resolved fail-closed to
 * District) selects which per-rung results are written
 * (`districtBestFinish` / `leagueBestFinish`, `districtCompleted` /
 * `leagueCompleted`, `districtWins` / `leagueWins`), and `finishPlace` is the
 * player's place in the field (1-based, from the finish order the scene
 * resolves). `elapsedMs` is the NORMALIZED race time — the raw elapsed minus
 * the measured formation gap, normalized by the scene through
 * `resolveNormalizedRaceTime` before it calls here — so the best time the
 * settlement records is comparable across grid slots. The purse, points and
 * fame come from the NAMED economy table in `raceTiers.ts` (the same numbers
 * the inline table held: base 80/120/200, victory bonus 20/30/50, points
 * +50 win / +15 otherwise, fame 0 per race); a drift between the two tables
 * is a defect, not a second source of truth.
 */
export function settleRaceCompletion(
  profile: PlayerProfile | null | undefined,
  teamSize: ChariotTeamSize,
  elapsedMs: number,
  outcome: RaceCompletionOutcome,
  day: number,
  rung: unknown,
  finishPlace: unknown,
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
  // LADDER-1E — the per-rung counters, read the same defensive way. A
  // malformed previous value is no record at all, exactly like the global
  // counters above. The rung resolves fail-closed to District, the
  // always-open rung, never a locked one.
  const tier = resolveRaceTier(rung);
  const rungId: RaceRungId = tier.id;
  const isDistrict = rungId === 'district';
  const rungCompleted = count(isDistrict ? current.districtCompleted : current.leagueCompleted);
  const rungWins = count(isDistrict ? current.districtWins : current.leagueWins);
  // The best finish is min-wins over VALID places only: a safe integer within
  // the rung's field (District 1–3, League 1–5). An unusable place — missing,
  // non-integer, out of range — writes no best finish, but the race still
  // settles: the finish is valid, only the place is unusable.
  const maxPlace = tier.fieldSize + 1;
  const validPlace = validBestFinish(finishPlace, maxPlace);
  const previousBest = validBestFinish(
    isDistrict ? current.districtBestFinish : current.leagueBestFinish,
    maxPlace,
  );
  const nextBestFinish =
    validPlace === null
      ? previousBest
      : previousBest === null
        ? validPlace
        : Math.min(previousBest, validPlace);

  const alreadyPaidToday = current.lastPurseDay === day;
  const economy = tier.economy;
  const basePurse = economy.basePurse[teamSize];
  const victoryBonus = economy.victoryBonus[teamSize];
  const purseAwarded = alreadyPaidToday ? 0 : basePurse + (outcome === 'victory' ? victoryBonus : 0);
  if ([completed, wins, losses, photoFinishes, rungCompleted, rungWins].some((value) => value >= Number.MAX_SAFE_INTEGER)) {
    return { ok: false, reason: 'career-counter-overflow', profile };
  }
  const currentLeaguePoints = current.leaguePoints || 0;
  const leaguePointsEarned = outcome === 'victory' ? economy.leaguePoints.win : economy.leaguePoints.other;
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
    // LADDER-1E — the per-rung results. The best finish is written only when
    // a valid place exists (this finish's, or the previous valid one); a
    // missing best finish stays absent rather than being invented.
    ...(isDistrict
      ? {
          districtCompleted: rungCompleted + 1,
          districtWins: rungWins + (outcome === 'victory' ? 1 : 0),
          ...(nextBestFinish === null ? {} : { districtBestFinish: nextBestFinish }),
        }
      : {
          leagueCompleted: rungCompleted + 1,
          leagueWins: rungWins + (outcome === 'victory' ? 1 : 0),
          ...(nextBestFinish === null ? {} : { leagueBestFinish: nextBestFinish }),
        }),
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
