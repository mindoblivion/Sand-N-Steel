/**
 * ===========================================================================
 * SAND & STEEL — MOVEMENT CHRONICLE REPORTS (Phase C-8.80K)
 * ===========================================================================
 *
 * Advance and Retreat used to announce a flat "advances 1.8m" / "retreats back
 * 1.8m" no matter what the fighter actually did. Both steps are clamped:
 *
 *   • an Advance may never close the gap below `DUEL_MIN_GAP_M` (1.2 m), so near
 *     the opponent it is shortened and then refused outright;
 *   • a Retreat stops on the ±`DUEL_RETREAT_LIMIT_Z` arena edge, so at the edge
 *     it is also shortened and then refused.
 *
 * A fighter pressed against their opponent was therefore told they had walked
 * 1.8 m when their position had not changed at all. This module turns the real
 * before/after Z the duel already computes into the sentence the chronicle
 * prints, so the report and the rendered position cannot disagree. Player and
 * opponent share one movement path in `DuelScene`, so both are covered.
 *
 * WHAT THIS OWNS — and nothing else:
 *   • the displacement of a step, measured from the positions themselves;
 *   • the display precision of a distance, and the distance formatter;
 *   • the three outcomes of a step (full step / shortened / refused) and their
 *     wording.
 *
 * The movement VALUES (1.8 m step, 1.2 m gap, ±7.5 m limit) still live in
 * `duelGeometry` and are only READ here. Turn timing, stamina, AI decisions and
 * combat rules are untouched.
 */

import { DUEL_MOVE_STEP_M } from './duelGeometry';

/** The two movement actions whose chronicle line this module writes. */
export type DuelMoveAction = 'advance' | 'retreat';

/**
 * Decimal places in a reported distance — the shipped messages said "1.8m", and
 * keeping one decimal means a shortened step reads "0.8m" rather than "0.8".
 */
export const MOVE_REPORT_DECIMALS = 1;

/** Absolute displacement of a step, from the real positions it started and ended at. */
export function moveDisplacement(fromZ: number, toZ: number): number {
  return Math.abs(toZ - fromZ);
}

/**
 * The displacement as it is DISPLAYED, rounded to {@link MOVE_REPORT_DECIMALS}.
 *
 * Rounding happens once, here, so the decision "did they move at all?" and the
 * number in the sentence always agree: a 0.04 m residual (floating-point noise
 * against a clamp, not a step) displays as 0.0 and is reported as no movement
 * instead of a step the fighter cannot see.
 */
export function reportedDistance(distance: number): number {
  const scale = 10 ** MOVE_REPORT_DECIMALS;
  return Math.round(distance * scale) / scale;
}

/** Format a distance in metres at the chronicle's precision, e.g. `1.8m`. */
export function formatMoveDistance(distance: number): string {
  return `${reportedDistance(distance).toFixed(MOVE_REPORT_DECIMALS)}m`;
}

/**
 * The chronicle sentence for a step that ran from `fromZ` to `toZ`.
 *
 * A full step keeps the shipped wording verbatim; a shortened step says "only"
 * and names the real distance; a refused step says the fighter did not move.
 * `advance` and `retreat` differ only in their blocker, because the opponent's
 * body is what stops one and the arena edge is what stops the other.
 */
export function describeMoveReport(
  name: string,
  action: DuelMoveAction,
  fromZ: number,
  toZ: number,
): string {
  const shown = reportedDistance(moveDisplacement(fromZ, toZ));
  const isAdvance = action === 'advance';

  if (shown <= 0) {
    return isAdvance
      ? `${name} cannot advance — the enemy is already at grips.`
      : `${name} cannot retreat — the arena's edge is at their back.`;
  }

  const distance = formatMoveDistance(shown);
  if (shown >= DUEL_MOVE_STEP_M) {
    return isAdvance
      ? `${name} advances ${distance} toward their opponent.`
      : `${name} retreats back ${distance}.`;
  }

  return isAdvance
    ? `${name} advances only ${distance} toward their opponent — the enemy is already at grips.`
    : `${name} retreats only ${distance} — the arena's edge stops them.`;
}
