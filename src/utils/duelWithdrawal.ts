/**
 * C-8.80B — the CONFIRMED duel withdrawal.
 *
 * The player's one way out of a live bout used to be the HUD's Armory badge, which
 * unmounted the scene and recorded nothing: a losing gladiator could walk out of the
 * sand and keep a clean record (the design question `AGENTS.md`'s "Final verification
 * pass" recorded against the exit). This module is the replacement — an explicit,
 * confirmed forfeit that is settled as a DEFEAT through the SAME authoritative path a
 * knockout uses, exactly once.
 *
 * It is PURE: no React, no three.js, no storage, no clock, no timer, no randomness. The
 * scene supplies the latch, the statistics object, the callbacks that drop pending work,
 * and App's own settlement callback; this module owns only the ORDER, because the order
 * is the rule:
 *
 *   1. refuse when the bout is already decided (a second confirmation, a late click and
 *      a withdrawal offered over a finished fight all land here and change nothing);
 *   2. latch `isMatchOver` FIRST, so every impact, announcement, reaction, AI timer and
 *      resolution callback that is already in flight becomes inert;
 *   3. drop the pending enemy strike, the pending player swing and the turn-end timer,
 *      so nothing resolves into a bout that is over;
 *   4. zero the purse — a forfeit is never paid — and mark the bout `'withdrawn'`, which
 *      is the only claim made about it (no hit, damage or killing blow is fabricated);
 *   5. settle through the `settle` callback, which in production is `onMatchComplete`
 *      itself, so App's per-bout settlement latch, clock, injury settlement and single
 *      save all run unchanged.
 *
 * Because step 5 hands over the very callback a knockout uses, a bypass would have to
 * re-implement App's whole settlement to skip the latch — and a duplicate call is
 * refused by that latch (`claim(duelId)`) regardless of how often this module is called.
 */

import type { DuelStatistics } from '../types/game';

/** The pending work a withdrawal invalidates, supplied by the duel scene. */
export interface WithdrawalPendingWork {
  /** Drop the announced enemy strike and its scheduled impact. */
  cancelEnemyStrike(): void;
  /** Drop the player's own wind-up and its scheduled impact. */
  cancelPlayerStrike(): void;
  /** Clear the 1100 ms turn-end timer, if one is scheduled. */
  clearTurnTimer(): void;
}

export interface WithdrawalRequest {
  /**
   * The scene's authoritative "this bout is decided" latch — the same ref every impact,
   * announcement, reaction and resolution callback already checks. Set here, never
   * cleared, exactly as the knockout branches set it.
   */
  isMatchOver: { current: boolean };
  /** The ONE statistics object the settlement will credit. */
  stats: DuelStatistics;
  /** Everything that must be dropped before the settlement is reported. */
  pending: WithdrawalPendingWork;
  /** App's settlement entry point — the same callback a knockout reports through. */
  settle: (stats: DuelStatistics, didWin: boolean) => void;
}

/**
 * Confirm a withdrawal. Returns true when this call forfeited the bout, false when it
 * was already decided (nothing is touched in that case).
 */
export function withdrawFromDuel(request: WithdrawalRequest): boolean {
  const { isMatchOver, stats, pending, settle } = request;

  // One withdrawal per bout: a second confirmation, a rapid repeat or a click arriving
  // over a bout that already ended changes nothing at all.
  if (isMatchOver.current) return false;
  isMatchOver.current = true;

  // Invalidate pending work BEFORE settling, so no delayed callback can mutate a bout
  // that is already over (the callbacks also re-check the latch; this drops the timers).
  pending.cancelEnemyStrike();
  pending.cancelPlayerStrike();
  pending.clearTurnTimer();

  // A forfeit is never paid. This is the only statistic written — it is exactly what
  // the shipped defeat branch does, and no damage, hit, combo or hype figure is touched.
  stats.goldEarned = 0;
  // The one fact the result screen needs to say "withdrew" instead of "felled".
  stats.outcome = 'withdrawn';

  // The authoritative settlement, by reference — never a local re-implementation.
  settle(stats, false);
  return true;
}
