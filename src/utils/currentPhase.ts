/**
 * currentPhase.ts — Day/Night T1's ONE staging seam: the phase every scene renders.
 *
 * T1 still CHOOSES the phase with a constant; T2 wires the real clock through this
 * single name, so nothing that renders a phase has to change when the counter lands.
 * The constant is module-level and data-only: this slice reads no player save and
 * writes none, and a phase is never stored.
 *
 * The ids are `utils/timeState.ts`'s own (`dawn … night`), and the labels come from
 * `TIME_PHASE_NAMES`, so the surface text and the lighting table can never drift.
 */
import { TIME_PHASE_NAMES, type TimePhase } from './timeState';

/**
 * The phase the city, the duel and the race are drawn under in this slice.
 * `golden` is A1's default hour (`goldenHour` in the retired settings spelling).
 */
export const CURRENT_PHASE: TimePhase = 'golden';

/** How the phase was decided, in the player's words — the Settings row's gloss. */
export const CURRENT_PHASE_SOURCE = 'set by the day';

/** The current phase's display label (`Golden Hour`, `Night`, …). */
export function currentPhaseLabel(phase: TimePhase = CURRENT_PHASE): string {
  return TIME_PHASE_NAMES[phase];
}
