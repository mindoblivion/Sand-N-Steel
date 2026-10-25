/**
 * The announced enemy strike — combat responsiveness §R1.
 *
 * An enemy attack is not resolved when the AI picks it: it is announced, held for
 * {@link ENEMY_ATTACK_WINDUP_MS} so the cue can be read and answered, and only then
 * handed to the existing resolution. This module owns that bookkeeping alone — the
 * pending action, its one scheduled impact and the player's one reaction claim. It
 * touches no React state, no damage formula and no fighter state, which is what lets
 * the timing be tested with a controlled clock instead of a wall clock.
 *
 * Three guarantees it exists to provide:
 *
 *   • **One impact.** A second `announce` while a strike is pending is refused, and a
 *     fired callback whose strike was cancelled (or already resolved) does nothing —
 *     so no strike can land twice.
 *   • **Cancellation wins.** `cancel()` clears the scheduled impact and makes the
 *     callback inert, so a victory, a defeat or an unmount can drop a pending strike
 *     and nothing resolves into a scene that has gone.
 *   • **One reaction.** `claimReaction()` succeeds at most once per announcement, so
 *     mashing Shield Guard and Dodge cannot stack a block with a dodge.
 */

import {
  DODGE_EVADE_PERCENT,
  DODGE_STAMINA_COST,
  ENEMY_ATTACK_WINDUP_MS,
} from './combatCalculations';

/** The enemy actions that are announced and held before they land. */
export type EnemyStrikeAction = 'quick_attack' | 'power_attack';

/** The only timing primitive this module needs — injectable for tests. */
export interface StrikeTimer {
  set(callback: () => void, ms: number): number;
  clear(handle: number): void;
}

const realTimer: StrikeTimer = {
  set: (callback, ms) => setTimeout(callback, ms) as unknown as number,
  clear: (handle) => clearTimeout(handle),
};

export interface PendingStrikeConfig {
  /** Defaults to the platform timers. */
  timer?: StrikeTimer;
  /** Defaults to {@link ENEMY_ATTACK_WINDUP_MS}. */
  windupMs?: number;
}

export interface PendingStrike {
  /** The announced action, or null when nothing is pending. */
  readonly pending: EnemyStrikeAction | null;
  /** True once the player has spent this strike's reaction. */
  readonly hasReacted: boolean;
  /**
   * Announce a strike and schedule its impact. Returns false (and schedules
   * nothing) when a strike is already pending.
   */
  announce(action: EnemyStrikeAction, onImpact: (action: EnemyStrikeAction) => void): boolean;
  /**
   * Spend the reaction for the pending strike. Returns false when nothing is
   * pending or the reaction was already spent.
   */
  claimReaction(): boolean;
  /**
   * Drop the pending strike. Returns true when one was actually pending; either
   * way, any callback still in flight becomes inert.
   */
  cancel(): boolean;
}

/** The player's one answer to an announced strike. */
export type PendingReaction = 'shield_block' | 'dodge';

/** What the cue says once the reaction has been spent. */
export interface ReactionCue {
  kind: PendingReaction;
  label: string;
}

/**
 * The line the cue shows once the player has answered the announced strike.
 *
 * It names the stance that was ACTUALLY taken, because the two answer the blow
 * differently: Shield Guard sets `isBlocking`, so the strike still lands and its
 * damage is reduced by the shield's blockReduction; Dodge sets `isInvulnerable`,
 * so the blow is evaded outright at the dodge rate and lands unreduced only when
 * that roll fails. A single guard line therefore misreports a dodge — it claims a
 * guard that was never raised and hides that the incoming blow can land in full.
 *
 * C-8.82B — the line also states what each answer OFFERS, so the trade-off is
 * legible at the moment it is being made: the dodge's evade chance and its spent
 * cost, and (when the caller supplies the fighter's weapon) the guard's own
 * mitigation. Both percentages come from the shared constants, so the copy cannot
 * disagree with the roll or the charge.
 *
 * @param reaction       the stance actually spent, or null before any answer
 * @param blockReduction the answering fighter's weapon block fraction (0–1); when
 *                       finite, the guard line names the mitigation it applies
 */
export function resolveReactionCue(
  reaction: PendingReaction | null,
  blockReduction?: number,
): ReactionCue | null {
  if (reaction === null) return null;
  if (reaction === 'dodge') {
    return {
      kind: 'dodge',
      label:
        `Dodge set — ${DODGE_EVADE_PERCENT}% chance to slip the blow entirely; ` +
        `${DODGE_STAMINA_COST} SP spent.`,
    };
  }
  const mitigation =
    typeof blockReduction === 'number' && Number.isFinite(blockReduction)
      ? ` (${Math.round(blockReduction * 100)}% absorbed by the shield)`
      : '';
  return {
    kind: 'shield_block',
    label: `Guard set — the blow lands at reduced force${mitigation}.`,
  };
}

export function createPendingStrike(config: PendingStrikeConfig = {}): PendingStrike {
  const timer = config.timer ?? realTimer;
  const windupMs = config.windupMs ?? ENEMY_ATTACK_WINDUP_MS;

  let handle: number | null = null;
  let action: EnemyStrikeAction | null = null;
  let reacted = false;

  return {
    get pending() {
      return action;
    },

    get hasReacted() {
      return reacted;
    },

    announce(nextAction, onImpact) {
      if (action !== null) return false;
      action = nextAction;
      reacted = false;
      handle = timer.set(() => {
        handle = null;
        // Read the pending action AT IMPACT, not from the closure: a cancelled
        // strike is null here, so a stale or repeated callback resolves nothing.
        const landing = action;
        if (landing === null) return;
        action = null;
        onImpact(landing);
      }, windupMs);
      return true;
    },

    claimReaction() {
      if (action === null || reacted) return false;
      reacted = true;
      return true;
    },

    cancel() {
      if (handle !== null) timer.clear(handle);
      handle = null;
      const hadPending = action !== null;
      action = null;
      reacted = false;
      return hadPending;
    },
  };
}
