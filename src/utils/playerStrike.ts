/**
 * The player's strike anticipation window — C-8.71B.
 *
 * An enemy attack is announced, held for {@link ENEMY_ATTACK_WINDUP_MS} and only
 * then resolved (`pendingStrike.ts`). The player's own swing used to resolve in
 * the very commit that started it, so the blow — and its damage number, its
 * hit-stop and its shake — all landed on the same frame as the tap. This module
 * gives the player's strike the same readable shape: the swing and its telegraph
 * are committed at the tap, and the impact happens one window later, through the
 * SAME resolution the attack always went through.
 *
 * It deliberately does NOT reuse `pendingStrike`: that controller carries the
 * player's *reaction* claim (`claimReaction`), which exists because the player
 * answers an enemy announcement. Reusing it for the player's own swing would let
 * the opponent "react" to it — a rules change, not a timing one.
 *
 * Two guarantees it exists to provide:
 *
 *   • **One impact.** A second `strike` while one is pending is refused, and a
 *     fired callback whose strike was cancelled (or already resolved) does
 *     nothing — so one swing can never resolve two blows.
 *   • **Cancellation wins.** `cancel()` clears the scheduled impact and makes the
 *     callback inert, so a victory, a defeat, an unmount or the turn's own end can
 *     drop a pending swing without damage landing into a scene that has gone.
 *   • **Ownership (C-8.71D).** Every accepted strike takes its own token, and a
 *     callback may resolve ONLY the strike that scheduled it. Without that, a
 *     cancelled strike's already-queued callback could fire after a NEWER strike
 *     had taken the controller over, read the newer strike's shared pending
 *     action, invoke the OLD closure and clear the newer strike's state — which
 *     also orphans its timer, since `cancel()` would then have no handle left to
 *     clear. A stale callback must be a complete no-op.
 *
 * Timing is injectable, which is what lets the tests drive it on a controlled
 * clock instead of a wall clock.
 */

import { PLAYER_ATTACK_WINDUP_MS, isAttackInRange } from './combatCalculations';
import type { WeaponItem } from '../types/game';

/** The player actions that are held before they land. */
export type PlayerStrikeAction = 'quick_attack' | 'power_attack';

/** The only timing primitive this module needs — injectable for tests. */
export interface PlayerStrikeTimer {
  set(callback: () => void, ms: number): number;
  clear(handle: number): void;
}

const realTimer: PlayerStrikeTimer = {
  set: (callback, ms) => setTimeout(callback, ms) as unknown as number,
  clear: (handle) => clearTimeout(handle),
};

export interface PlayerStrikeConfig {
  /** Defaults to the platform timers. */
  timer?: PlayerStrikeTimer;
  /** Defaults to {@link PLAYER_ATTACK_WINDUP_MS}. */
  windupMs?: number;
}

export interface PlayerStrike {
  /** The swinging action, or null when nothing is pending. */
  readonly pending: PlayerStrikeAction | null;
  /**
   * Commit a swing and schedule its impact. Returns false (and schedules
   * nothing) when a swing is already pending.
   */
  strike(action: PlayerStrikeAction, onImpact: (action: PlayerStrikeAction) => void): boolean;
  /**
   * Drop the pending swing. Returns true when one was actually pending; either
   * way, any callback still in flight becomes inert.
   */
  cancel(): boolean;
}

export function createPlayerStrike(config: PlayerStrikeConfig = {}): PlayerStrike {
  const timer = config.timer ?? realTimer;
  const windupMs = config.windupMs ?? PLAYER_ATTACK_WINDUP_MS;

  let handle: number | null = null;
  let action: PlayerStrikeAction | null = null;
  /**
   * The serial number of the strike that currently owns the controller — the
   * C-8.71D ownership token. `cancel()` retires it, so a callback queued by the
   * strike it dropped can never act on whatever the controller carries next.
   */
  let owner = 0;

  return {
    get pending() {
      return action;
    },

    strike(nextAction, onImpact) {
      if (action !== null) return false;
      const mine = ++owner;
      action = nextAction;
      handle = timer.set(() => {
        // Ownership first: only the strike that scheduled this callback may
        // resolve, and a stale one must not touch the pending state, the handle
        // or the newer strike's timer in any way.
        if (mine !== owner) return;
        handle = null;
        // Read the pending action AT IMPACT, not from the closure: a cancelled
        // swing is null here, so a repeated delivery resolves nothing.
        const landing = action;
        if (landing === null) return;
        action = null;
        onImpact(landing);
      }, windupMs);
      return true;
    },

    cancel() {
      const hadPending = action !== null;
      if (handle !== null) timer.clear(handle);
      handle = null;
      action = null;
      // Retire the pending strike's token, so its already-queued callback is inert.
      owner += 1;
      return hadPending;
    },
  };
}

/**
 * Whether a committed strike may still resolve — checked AT THE IMPACT POINT
 * rather than trusted from the commit's closure.
 *
 * The shipped lifecycle cannot move fighter state inside the window (every
 * action is locked by the resolution latch), so this is the same
 * defence-in-depth guarantee C-8.71A gave the range guard: a fight that has
 * already been decided, an attacker or target that is down, or a target outside
 * the weapon's reach all resolve NOTHING, so a stale strike can never apply
 * damage to an obsolete target. Stamina was spent at the commit and is
 * deliberately not refunded (see the caller).
 */
export function canResolveStrikeImpact(check: {
  isMatchOver: boolean;
  attackerHealth: number;
  defenderHealth: number;
  distance: number;
  weapon: WeaponItem;
}): boolean {
  if (check.isMatchOver) return false;
  // `!(x > 0)` also refuses a health value that is not a number.
  if (!(check.attackerHealth > 0) || !(check.defenderHealth > 0)) return false;
  return isAttackInRange(check.distance, check.weapon);
}
