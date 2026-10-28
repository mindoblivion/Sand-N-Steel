/**
 * currentPhase.ts — the phase VOCABULARY's presentation seam.
 *
 * DAY/NIGHT T1 shipped this module around one staging constant, `CURRENT_PHASE`, because
 * nothing painted the clock yet: every scene read the single name so T2 could wire the
 * real clock through it. **T2 has done that and the constant is GONE** — the city and the
 * duel now resolve `resolveTimeState(profile).phase` themselves, and the Settings row is
 * handed the phase it reports. Nothing may reintroduce a module-level phase here: a
 * constant would silently disagree with the save.
 *
 * What stays is the phase's presentation. The ids are `utils/timeState.ts`'s own
 * (`dawn … night`) and the labels come from `TIME_PHASE_NAMES`, so the surface text and
 * the lighting table can never drift.
 */
import { TIME_PHASE_NAMES, type TimePhase } from './timeState';

/** How the phase was decided, in the player's words — the Settings row's gloss. */
export const CURRENT_PHASE_SOURCE = 'set by the day';

/** A phase's display label (`Golden Hour`, `Night`, …). */
export function currentPhaseLabel(phase: TimePhase): string {
  return TIME_PHASE_NAMES[phase];
}
