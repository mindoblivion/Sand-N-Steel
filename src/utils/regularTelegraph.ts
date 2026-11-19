/**
 * COMBAT-3 — regular opponents announce their power.
 *
 * The audit's gap 3: a boss announces a heavy a full turn ahead (banner, red
 * 2 Hz pulse), but a regular's quick vs power choice was invisible until its
 * clip played inside the 650 ms windup. This module holds the ONE decision the
 * duel's AI effect makes about that — whether a regular's chosen power attack
 * is announced instead of thrown silently — so the rule can be asserted
 * without a canvas, exactly as the boss gates are asserted in
 * `bossPresentation.ts`.
 *
 * ── WHAT THIS IS, AND WHAT IT IS NOT ──────────────────────────────────────
 * It is the announce decision only. The announce itself is the existing
 * `'telegraph'` action (same banner, same glow, same 1450 ms hold as a boss
 * heavy) and the resolution is the standard `power_attack` pipeline on the
 * next AI turn — neither is duplicated here. The choice itself becomes the
 * tell: there is no telegraph *rate* for regulars, so a regular's power is
 * announced whenever the ladder chooses it and the conditions below hold.
 *
 * What it deliberately does NOT cover:
 * - Bosses. A boss keeps its own telegraph (Goliath's ~30% rate, Varro's
 *   feint, Valéria's counter wind-up, the Cotta Crossing) — this predicate
 *   returns false for every `isBoss === true` opponent, so no boss branch
 *   can ever route through it.
 * - Quick attacks. They stay hidden and resolve as they always have.
 * - Counter/dodge tells for regulars (out of scope for this slice: regulars
 *   have no counter/dodge mechanics to announce).
 * - The glow. That gate lives in `bossPresentation.ts` (`presentsTelegraphGlow`).
 */
import type { CombatActionType } from '../components/ui/TurnActionPanel';

/** Everything the announce decision reads — nothing else is consulted. */
export interface RegularPowerAnnounceInput {
  /** `opponent.isBoss` — regulars announce; bosses keep their own telegraphs. */
  isBoss: boolean | undefined;
  /** The action the tactical ladder chose for this slot. */
  chosenAction: CombatActionType;
  /** A telegraph is already live for this opponent (`pendingHeavyAttackRef`). */
  pendingHeavy: boolean;
  /** The player is inside the opponent's weapon range right now. */
  inRange: boolean;
  /** The opponent's current stamina. */
  stamina: number;
  /** The stamina a power attack costs with this weapon. */
  heavyCost: number;
}

/**
 * Should this regular's chosen power attack be announced (`'telegraph'`)
 * instead of thrown silently? True only when the opponent is not a boss, the
 * ladder chose a power attack, no telegraph is already live, the player is in
 * range, and the opponent can afford the heavy. Every condition mirrors the
 * Varro branch (`false_telegraph`) in the duel's AI effect, minus the
 * feature-bout config — the shape is the same because the job is the same:
 * a chosen heavy is announced, and the announce spends the turn exactly as a
 * boss's does.
 */
export function shouldAnnounceRegularPower(input: RegularPowerAnnounceInput): boolean {
  if (input.isBoss === true) return false;
  if (input.chosenAction !== 'power_attack') return false;
  if (input.pendingHeavy) return false;
  if (!input.inRange) return false;
  return input.stamina >= input.heavyCost;
}
