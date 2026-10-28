/**
 * racePhaseLight.ts — Day/Night T1's display-only override at the circus.
 *
 * The race draws the CITY's own table (`PHASE_LIGHT`) — no second table and no
 * race-only sun. Two phases are presented as their neighbours in the ring:
 *
 *   • entered at `dusk`  → rendered as `golden`;
 *   • entered at `night` → rendered as `dawn`.
 *
 * This is a DISPLAY override only: the canonical phase, and anything that reads it
 * (the settings label, T0's clock), is untouched. The mapping is total and pure.
 */
import type { TimePhase } from './timeState';

/** The circus's own display substitution, phase id → phase id. */
export const RACE_PHASE_OVERRIDES: Readonly<Partial<Record<TimePhase, TimePhase>>> = {
  dusk: 'golden',
  night: 'dawn',
};

/** The phase the race renders for a canonical phase. The canonical phase is unchanged. */
export function resolveRacePhase(phase: TimePhase): TimePhase {
  return RACE_PHASE_OVERRIDES[phase] ?? phase;
}
