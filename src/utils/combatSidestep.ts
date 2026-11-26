/**
 * ===========================================================================
 * COMBAT-5 — Sidestep (gap 5: positioning is one-dimensional). Pure helpers
 * only — no React, no storage, no randomness — so `DuelScene` (resolution)
 * and the tests call the SAME functions.
 *
 *   • one lateral move, 1.8 m along X, clamped to the ring bounds ±3.6 m
 *     (two sidesteps from centre); repeated taps bounce across the ring
 *     and back, so the fighter can never walk out of it
 *   • its ONE job is dodging a telegraphed heavy: a heavy is aimed at the
 *     spot the defender stands on when it is announced, so a defender
 *     ≥ 1.2 m off that line when it lands is not there to be hit
 *   • range never changes — distance stays |ΔZ|, so a sidestep cannot close
 *     distance, escape reach, or move any distance band
 *   • the AI never sidesteps: the player never telegraphs, so the AI has no
 *     heavy to step away from; the resolution branch handles both fighters
 *     symmetrically anyway, and the opponent's X stays 0 in practice
 * ===========================================================================
 */

/** One sidestep's lateral displacement, in arena metres. */
export const SIDESTEP_DISTANCE_M = 1.8;

/** The ring's lateral bounds: two sidesteps from centre. */
export const SIDESTEP_BOUND_M = 3.6;

/**
 * How far off the announced line a defender must be for a telegraphed heavy
 * to miss them — the same 1.2 m separation the advance action uses as its
 * minimum, so one sidestep (1.8 m) always clears it.
 */
export const SIDESTEP_CLEAR_M = 1.2;

/**
 * The fighter's new X after one sidestep: `distance` m in the direction of the
 * current lateral offset (default +X from centre), reversing at the bounds —
 * a bounce, so repeated taps walk the fighter across the ring and back.
 * The result never exceeds ±3.6 m. The distance is a parameter (default the
 * shipped 1.8 m) so a caller with a Fate-scaled step — Evasive Instinct,
 * PHASE2-FATECON-1 — can pass its own distance without touching the rule.
 */
export function sidestepPositionX(x: number, distance = SIDESTEP_DISTANCE_M): number {
  const direction = x === 0 ? 1 : Math.sign(x);
  const stepped = x + direction * distance;
  if (stepped > SIDESTEP_BOUND_M || stepped < -SIDESTEP_BOUND_M) {
    return x - direction * distance;
  }
  return stepped;
}

/**
 * Does a telegraphed heavy miss a defender who stepped off the line? True
 * when the defender's X is at least 1.2 m from the X recorded when the heavy
 * was announced. Each announcement re-records the defender's X, so a
 * sidestep taken BEFORE any announcement dodges nothing — the check reads
 * the announced X, not the sidestep itself.
 */
export function sidestepDodgesHeavy(defenderX: number, announcedX: number): boolean {
  return Math.abs(defenderX - announcedX) >= SIDESTEP_CLEAR_M;
}
