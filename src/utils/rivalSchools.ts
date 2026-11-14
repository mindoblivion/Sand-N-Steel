import type {
  DuelStatistics,
  OpponentConfig,
  PlayerProfile,
  RivalryProgress,
} from '../types/game';
import { RIVAL_SCHOOL_OPPONENT_ID } from '../data/rivalSchools';

export type RivalSchoolChallengeState = 'available' | 'awaiting_retry' | 'completed';

export interface ResolvedRivalryProgress {
  stage: 'first_challenge' | 'completed';
  attempts: number;
  wins: number;
  losses: number;
  completed: boolean;
  lastOutcome?: 'win' | 'loss';
}

export interface RivalDuelExclusions {
  exhibition?: boolean;
  grudge?: boolean;
}

function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/**
 * Read the optional save record defensively. A malformed or partial record is
 * never interpreted as a victory; only an explicit, internally consistent
 * completed record is accepted.
 */
export function resolveRivalryProgress(
  profile: PlayerProfile | null | undefined
): ResolvedRivalryProgress {
  const stored = profile?.story?.rivalry as unknown;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return {
      stage: 'first_challenge',
      attempts: 0,
      wins: 0,
      losses: 0,
      completed: false,
    };
  }

  const raw = stored as Record<string, unknown>;
  const wins = safeCount(raw.wins);
  const losses = safeCount(raw.losses);
  const attempts = Math.max(safeCount(raw.attempts), wins + losses);
  const lastOutcome = raw.lastOutcome === 'win' || raw.lastOutcome === 'loss'
    ? raw.lastOutcome
    : undefined;
  const completed = raw.completed === true && wins > 0 && lastOutcome === 'win';

  return {
    stage: completed ? 'completed' : 'first_challenge',
    attempts,
    wins,
    losses,
    completed,
    lastOutcome,
  };
}

export function rivalSchoolChallengeState(
  profile: PlayerProfile | null | undefined
): RivalSchoolChallengeState {
  const progress = resolveRivalryProgress(profile);
  if (progress.completed) return 'completed';
  return progress.attempts > 0 ? 'awaiting_retry' : 'available';
}

export function isRivalSchoolChallengeWon(
  profile: PlayerProfile | null | undefined
): boolean {
  return resolveRivalryProgress(profile).completed;
}

export function isRivalSchoolOpponent(
  opponent: OpponentConfig | null | undefined
): boolean {
  return !!opponent &&
    opponent.id === RIVAL_SCHOOL_OPPONENT_ID &&
    opponent.isBoss !== true &&
    opponent.featureBout !== true &&
    opponent.bountyBout !== true &&
    opponent.grudge === undefined;
}

function validStats(stats: DuelStatistics | null | undefined): stats is DuelStatistics {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return false;
  const required: (keyof DuelStatistics)[] = [
    'damageDealt',
    'damageTaken',
    'durationSeconds',
    'goldEarned',
    'fameEarned',
    'xpEarned',
  ];
  return required.every((key) => {
    const value = stats[key];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  });
}

/** A confirmed withdrawal is a genuine loss; technical exits never call this seam. */
export function isValidRivalDuelOutcome(
  opponent: OpponentConfig | null | undefined,
  didWin: boolean,
  rewardSettlementAccepted: boolean,
  stats: DuelStatistics | null | undefined,
  exclusions: RivalDuelExclusions = {}
): boolean {
  if (!isRivalSchoolOpponent(opponent)) return false;
  if (exclusions.exhibition || exclusions.grudge) return false;
  if (typeof didWin !== 'boolean' || !validStats(stats)) return false;
  if (stats.outcome !== undefined && stats.outcome !== 'withdrawn') return false;
  if (didWin && (stats.outcome === 'withdrawn' || !rewardSettlementAccepted)) return false;
  return true;
}

/**
 * Record one genuine result in the same profile transaction as the duel.
 * Losses (including a confirmed withdrawal) remain retryable. A completed
 * challenge is identity-stable, so duplicate result delivery cannot pay twice.
 */
export function settleRivalSchoolBout(
  profile: PlayerProfile,
  opponent: OpponentConfig | null | undefined,
  didWin: boolean,
  rewardSettlementAccepted: boolean,
  stats: DuelStatistics | null | undefined,
  exclusions: RivalDuelExclusions = {}
): PlayerProfile {
  if (!isValidRivalDuelOutcome(opponent, didWin, rewardSettlementAccepted, stats, exclusions)) {
    return profile;
  }

  const current = resolveRivalryProgress(profile);
  if (current.completed) return profile;

  const attempts = current.attempts + 1;
  const wins = current.wins + (didWin ? 1 : 0);
  const losses = current.losses + (didWin ? 0 : 1);
  const next: RivalryProgress = {
    stage: didWin ? 'completed' : 'first_challenge',
    attempts,
    wins,
    losses,
    completed: didWin,
    lastOutcome: didWin ? 'win' : 'loss',
  };

  return {
    ...profile,
    story: {
      ...(profile.story ?? {}),
      rivalry: next,
    },
  };
}
