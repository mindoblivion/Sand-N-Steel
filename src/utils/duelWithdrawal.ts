import type { DuelStatistics } from '../types/game';

export interface WithdrawalPendingWork {
  cancelEnemyStrike(): void;
  cancelPlayerStrike(): void;
  clearTurnTimer(): void;
}

export interface WithdrawalRequest {
  isMatchOver: { current: boolean };
  stats: DuelStatistics;
  pending: WithdrawalPendingWork;
  settle: (stats: DuelStatistics, didWin: boolean) => void;
}

/** A confirmed withdrawal is one defeat, settled through the ordinary App path. */
export function withdrawFromDuel(request: WithdrawalRequest): boolean {
  const { isMatchOver, stats, pending, settle } = request;
  if (isMatchOver.current) return false;
  isMatchOver.current = true;
  pending.cancelEnemyStrike();
  pending.cancelPlayerStrike();
  pending.clearTurnTimer();
  stats.goldEarned = 0;
  stats.outcome = 'withdrawn';
  settle(stats, false);
  return true;
}
