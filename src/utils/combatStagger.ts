/**
 * ===========================================================================
 * COMBAT-1 — Stagger, Knockback, Recovery (and the fair-range + weight-strip
 * companions). Pure helpers only — no React, no storage, no randomness — so
 * `DuelScene` (resolution) and the tests call the SAME functions.
 *
 *   • a stagger lasts exactly one of the victim's turns (`STAGGER_TURNS_ON_LAND`)
 *   • it is set on a landed, unblocked power attack — power, crit and a
 *     telegraphed heavy all ride the power profile (a crit can only come from
 *     a power attack); quick attacks never stagger, and a blocked power is the
 *     answer to a heavy, so it never staggers either
 *   • the staggering hit also knocks the victim 1.2 m away from the attacker
 *     along Z, clamped to the arena: the fighters never separate by more than
 *     the retreat limit (9.0 m), and neither leaves the ±7.5 m position bounds
 *     the retreat action already uses
 * ===========================================================================
 */

/** Turns a staggering blow costs the victim: exactly one forced recovery turn. */
export const STAGGER_TURNS_ON_LAND = 1;

/** Knockback displacement on a staggering hit, in arena metres. */
export const KNOCKBACK_DISTANCE_M = 1.2;

/** The fighters never separate by more than the retreat limit. */
export const ARENA_SEPARATION_MAX_M = 9.0;

/** The retreat action's own position bounds, shared by knockback. */
export const ARENA_POSITION_MIN_M = -7.5;
export const ARENA_POSITION_MAX_M = 7.5;

/**
 * Whether this fighter is staggered: a set counter means the next turn they
 * get is a forced recovery. Follows the `isEntangled` precedent exactly.
 */
export function isStaggered(staggeredTurns: number | undefined): boolean {
  return typeof staggeredTurns === 'number' && Number.isFinite(staggeredTurns) && staggeredTurns > 0;
}

export interface StaggerHitInput {
  /** A quick (light) attack — never staggers. */
  isQuick: boolean;
  /** A critical blow — only possible on a power attack. */
  isCrit: boolean;
  /** A boss telegraphed heavy that landed — always staggers. */
  isTelegraphedHeavy: boolean;
  /** The defender's shield stopped it — blocking is the answer to heavies. */
  isBlocked: boolean;
}

/**
 * Does this landed blow stagger the victim? Power, crit and telegraphed heavy
 * all stagger; quick and blocked never do. (A crit can only come from a power
 * attack and a telegraphed heavy resolves as one, so the three stagger cases
 * are one rule — power, unblocked — written out so the test can pin each.)
 */
export function shouldStaggerHit(input: StaggerHitInput): boolean {
  if (input.isBlocked) return false;
  return !input.isQuick || input.isCrit || input.isTelegraphedHeavy;
}

/**
 * The victim's new Z after a staggering hit: 1.2 m away from the attacker
 * along the axis the fighters separate on. Clamped twice: first to the
 * retreat limit, so the fighters never separate by more than 9.0 m; then to
 * the retreat action's own ±7.5 m position bounds, so a fighter backed
 * against the wall simply has nowhere to go.
 *
 * The clamp is on the SEPARATION, not the raw coordinate: the opponent fights
 * at negative Z, so a literal [0, 9.0] position clamp would teleport them to
 * the centre line on every stagger. Same bound, honest geometry.
 */
export function knockbackPositionZ(attackerZ: number, defenderZ: number): number {
  const direction = Math.sign(defenderZ - attackerZ) || 1;
  const displaced = defenderZ + direction * KNOCKBACK_DISTANCE_M;
  const bySeparation =
    attackerZ + direction * Math.min(Math.abs(displaced - attackerZ), ARENA_SEPARATION_MAX_M);
  return Math.max(ARENA_POSITION_MIN_M, Math.min(ARENA_POSITION_MAX_M, bySeparation));
}
