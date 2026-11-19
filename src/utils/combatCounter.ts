/**
 * ===========================================================================
 * COMBAT-2 — Player Counterattack (the Riposte). Pure helpers only — no
 * React, no storage, no randomness — so `DuelScene` (resolution),
 * `TurnActionPanel` (estimates and banner) and the tests call the SAME
 * functions.
 *
 *   • blocking a POWER attack queues the Riposte; a blocked quick attack, a
 *     dodged power attack and a missed power attack queue nothing (the last
 *     two never reach the hit branch at all — the queue helper pins the
 *     first two)
 *   • the window applies to the player's very next attack, quick or power,
 *     and is consumed by exactly that one attack; any non-attack action
 *     lets it lapse with no effect
 *   • the riposte deals +50% damage and ignores the defender's dodge chance
 *     — all three evade paths (stance, Valéria's passive, palma) are
 *     skipped, and the evade draws are not consumed either
 *   • player only: the AI never holds a riposte; Valéria keeps her own
 *     `counter_dodge` as a boss mechanic, untouched by this slice
 * ===========================================================================
 */

/** Damage multiplier on a riposte attack: +50%. */
export const RIPOSTE_DAMAGE_MULT = 1.5;

/** The banner and log words for the open window. */
export const RIPOSTE_READY_TEXT = 'RIPOSTE READY!';

/**
 * Whether the player holds an open Riposte window. Follows the `isStaggered`
 * precedent exactly: a set flag means the next attack carries the riposte.
 */
export function isRiposteReady(riposteReady: boolean | undefined): boolean {
  return riposteReady === true;
}

export interface RiposteQueueInput {
  /** The blow landed on the player — only the player ever holds a riposte. */
  defenderIsPlayer: boolean;
  /** The defender's shield stopped the blow (it landed, blocked). */
  isBlocked: boolean;
  /** A quick (light) attack — the safe poke, never punishable. */
  isQuick: boolean;
}

/**
 * Does this blocked blow open the Riposte window? Only a power attack the
 * player actually blocked: a blocked quick attack queues nothing, and a blow
 * that never reached the defender's shield (dodged, missed, out of range)
 * is not a blocked blow, so it queues nothing either.
 */
export function shouldQueueRiposte(input: RiposteQueueInput): boolean {
  if (!input.defenderIsPlayer) return false;
  if (!input.isBlocked) return false;
  return !input.isQuick;
}

/**
 * The damage a blow deals: a riposte multiplies the resolved damage by 1.5
 * (rounded, floored at 1, like `calculateAttackDamage`); any other blow is
 * untouched.
 */
export function applyRiposteDamage(rawDamage: number, isRiposte: boolean): number {
  if (!isRiposte) return rawDamage;
  return Math.max(1, Math.round(rawDamage * RIPOSTE_DAMAGE_MULT));
}

/**
 * The window's fate on the player's next resolved action. An attack spends
 * it — and carries the riposte if it was open; any non-attack action lets it
 * lapse with no effect. Either way the window is gone after this action:
 * one attack only, then normal. A strike at the beast is not this duel's
 * riposte, so the scene resolves it in its own branch and never calls this.
 */
export function resolveRiposteWindow(
  ready: boolean,
  isAttackAction: boolean,
): { applies: boolean; ready: boolean } {
  if (!ready) return { applies: false, ready: false };
  return { applies: isAttackAction, ready: false };
}
