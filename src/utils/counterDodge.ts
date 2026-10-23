/**
 * ===========================================================================
 * SAND & STEEL — THE COUNTER-DODGE MECHANIC (C-8.75B)
 * ===========================================================================
 * Valéria the Viper Queen is the only opponent with `bossMechanic:
 * 'counter_dodge'`. Two rules belong to that mechanic and to nothing else:
 *
 *   • the PASSIVE EVADE — a chance to slip a player strike without having spent
 *     her turn on a dodge stance, and
 *   • the COUNTER that evade queues for her next turn.
 *
 * Both used to be inline conditions in DuelScene's impact closure, reading
 * `opponent.bossMechanic` and `opponent.dodgeChance` directly. They are read
 * here instead so "who can passively evade, and at what rate" has one answer
 * that can be reasoned about — and simulated — without a rendered 3D scene.
 *
 * What this module deliberately does NOT do: it rolls no dice of its own, it
 * never calls `Math.random`, and it decides nothing about the hit roll, the
 * damage formula, the dodge stance or any other opponent. The caller passes its
 * own roll in, exactly as before, so the RNG stream and every other boss are
 * untouched.
 */
import type { BossMechanic } from '../types/game';

/** The structural slice of an opponent this mechanic reads. */
export interface CounterDodgeOpponent {
  bossMechanic?: BossMechanic;
  dodgeChance?: number;
}

/**
 * Whether this opponent owns the counter-dodge mechanic.
 *
 * `dodgeChance` is configured on every opponent, so the mechanic — not the
 * presence of a rate — is what gates a passive evade. A boss with no such
 * mechanic must never slip a strike just because the field is populated.
 */
export function isCounterDodgeOpponent(
  opponent: CounterDodgeOpponent | null | undefined,
): boolean {
  return opponent?.bossMechanic === 'counter_dodge';
}

/**
 * The opponent's passive-evade chance as a fraction in [0, 1], or 0 when the
 * mechanic does not apply.
 *
 * A missing, non-finite or out-of-range value resolves to 0 (no passive evade,
 * the same outcome the shipped `Math.random() < undefined` produced) rather
 * than to a NaN, which a future normalisation could turn into a free evade.
 */
export function resolvePassiveEvadeChance(
  opponent: CounterDodgeOpponent | null | undefined,
): number {
  if (!isCounterDodgeOpponent(opponent)) return 0;
  const rate = opponent?.dodgeChance;
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return 0;
  return Math.min(1, Math.max(0, rate));
}

/**
 * One passive-evade roll. `roll` is the caller's own [0, 1) random value, so
 * this stays pure and a controlled roll can be tested directly.
 */
export function rollsPassiveEvade(
  opponent: CounterDodgeOpponent | null | undefined,
  roll: number,
): boolean {
  const chance = resolvePassiveEvadeChance(opponent);
  if (chance <= 0) return false;
  if (typeof roll !== 'number' || !Number.isFinite(roll)) return false;
  return roll < chance;
}

/**
 * Whether THIS evade queues the boss's counter.
 *
 * Only the player's own strikes can be countered. A player who evades Valéria's
 * counter must never chain into another counter, which is what the
 * `attackerIsPlayer` half of this rule enforces.
 */
export function queuesCounterOnEvade(
  attackerIsPlayer: boolean,
  opponent: CounterDodgeOpponent | null | undefined,
): boolean {
  return attackerIsPlayer && isCounterDodgeOpponent(opponent);
}
