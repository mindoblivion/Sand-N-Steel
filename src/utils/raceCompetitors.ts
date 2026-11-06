/**
 * East Circus opponent roster.
 *
 * One opponent is selected per event from the player's validated career wins.
 * Keeping a single rival chariot in the scene preserves the established mobile
 * draw-call budget while victories progressively introduce faster factions.
 */
import type { ChariotFinishKey } from '../data/chariotParts';

export interface RaceCompetitor {
  readonly id: string;
  readonly name: string;
  readonly faction: string;
  readonly lapDurationMs: number;
  readonly startSide: -1 | 1;
  readonly finish: ChariotFinishKey;
}

export const RACE_COMPETITORS: readonly RaceCompetitor[] = Object.freeze([
  Object.freeze({
    id: 'russata_rookie',
    name: 'Rufus of the Russata',
    faction: 'Russata · Red',
    lapDurationMs: 64_000,
    startSide: 1 as const,
    finish: 'oxblood' as const,
  }),
  Object.freeze({
    id: 'veneta_veteran',
    name: 'Diodorus of the Veneta',
    faction: 'Veneta · Blue',
    lapDurationMs: 61_000,
    startSide: -1 as const,
    finish: 'ventive' as const,
  }),
  Object.freeze({
    id: 'albata_champion',
    name: 'Aulus of the Albata',
    faction: 'Albata · White',
    lapDurationMs: 58_000,
    startSide: 1 as const,
    finish: 'triumph' as const,
  }),
]);

/** Wins unlock the next rival; losses and photo finishes keep the current tier. */
export function resolveRaceCompetitor(wins: unknown): RaceCompetitor {
  const validWins = Number.isSafeInteger(wins) && (wins as number) >= 0 ? wins as number : 0;
  return RACE_COMPETITORS[Math.min(validWins, RACE_COMPETITORS.length - 1)];
}
