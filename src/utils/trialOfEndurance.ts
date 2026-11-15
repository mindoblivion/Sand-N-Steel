import type {
  DuelStatistics,
  OpponentConfig,
  PlayerProfile,
  TrialOfEnduranceProgress,
} from '../types/game';
import { TRIAL_OF_ENDURANCE_OPPONENTS, TRIAL_OF_ENDURANCE_ROUNDS } from '../data/trialOfEndurance';

export interface ResolvedTrialProgress {
  attempts: number;
  currentRound: 1 | 2 | 3;
  wins: number;
  losses: number;
  completed: boolean;
  lastOutcome?: 'win' | 'loss';
}

export interface TrialSettlementExclusions {
  exhibition?: boolean;
  grudge?: boolean;
}

function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function resolveTrialOfEndurance(
  profile: PlayerProfile | null | undefined,
): ResolvedTrialProgress {
  const stored = profile?.story?.trialOfEndurance as unknown;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return { attempts: 0, currentRound: 1, wins: 0, losses: 0, completed: false };
  }
  const raw = stored as Record<string, unknown>;
  const wins = safeCount(raw.wins);
  const losses = safeCount(raw.losses);
  const attempts = Math.max(safeCount(raw.attempts), losses, wins > 0 ? 1 : 0);
  const currentRound = raw.currentRound === 2 || raw.currentRound === 3 ? raw.currentRound : 1;
  const completed =
    raw.completed === true &&
    raw.currentRound === 3 &&
    wins >= TRIAL_OF_ENDURANCE_ROUNDS &&
    raw.lastOutcome === 'win';
  return {
    attempts,
    currentRound: completed ? 3 : currentRound,
    wins,
    losses,
    completed,
    lastOutcome: raw.lastOutcome === 'win' || raw.lastOutcome === 'loss' ? raw.lastOutcome : undefined,
  };
}

export function trialOfEnduranceOpponentFor(
  profile: PlayerProfile | null | undefined,
): OpponentConfig | null {
  const progress = resolveTrialOfEndurance(profile);
  if (progress.completed) return null;
  return TRIAL_OF_ENDURANCE_OPPONENTS[progress.currentRound - 1] ?? null;
}

function validStats(stats: DuelStatistics | null | undefined): stats is DuelStatistics {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return false;
  const required: (keyof DuelStatistics)[] = [
    'damageDealt', 'damageTaken', 'durationSeconds', 'goldEarned', 'fameEarned', 'xpEarned',
  ];
  return required.every((key) => {
    const value = stats[key];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  });
}

export function isTrialOfEnduranceOpponent(opponent: OpponentConfig | null | undefined): boolean {
  return !!opponent &&
    TRIAL_OF_ENDURANCE_OPPONENTS.some((row) => row.id === opponent.id) &&
    opponent.isBoss !== true &&
    opponent.featureBout !== true &&
    opponent.bountyBout !== true &&
    opponent.grudge === undefined;
}

/**
 * Advance only the currently expected Trial round. The caller must invoke this
 * inside the authoritative accepted-reward profile transaction; technical exits
 * never call this function. The first round result opens an attempt.
 */
export function settleTrialOfEnduranceRound(
  profile: PlayerProfile,
  opponent: OpponentConfig | null | undefined,
  didWin: boolean,
  rewardSettlementAccepted: boolean,
  stats: DuelStatistics | null | undefined,
  exclusions: TrialSettlementExclusions = {},
): PlayerProfile {
  if (!isTrialOfEnduranceOpponent(opponent)) return profile;
  if (exclusions.exhibition || exclusions.grudge) return profile;
  if (typeof didWin !== 'boolean' || !validStats(stats)) return profile;
  if (stats.outcome !== undefined && stats.outcome !== 'withdrawn') return profile;
  if (didWin && (stats.outcome === 'withdrawn' || !rewardSettlementAccepted)) return profile;

  const current = resolveTrialOfEndurance(profile);
  if (current.completed) return profile;
  const expected = TRIAL_OF_ENDURANCE_OPPONENTS[current.currentRound - 1];
  if (!expected || expected.id !== opponent.id) return profile;

  const attempts = current.attempts + (current.currentRound === 1 ? 1 : 0);
  const wins = current.wins + (didWin ? 1 : 0);
  const losses = current.losses + (didWin ? 0 : 1);
  const completed = didWin && current.currentRound === TRIAL_OF_ENDURANCE_ROUNDS;
  const nextRound: 1 | 2 | 3 = didWin
    ? (completed ? 3 : (current.currentRound + 1) as 2 | 3)
    : 1;
  const next: TrialOfEnduranceProgress = {
    attempts,
    currentRound: nextRound,
    wins,
    losses,
    completed,
    lastOutcome: didWin ? 'win' : 'loss',
  };
  return {
    ...profile,
    story: {
      ...(profile.story ?? {}),
      trialOfEndurance: next,
      ...(completed ? { trialDone: true } : {}),
    },
  };
}
