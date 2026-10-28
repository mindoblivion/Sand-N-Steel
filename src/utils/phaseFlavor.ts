/**
 * phaseFlavor.ts — Day/Night T3: the medallion's phase classes and the CARD COPY.
 *
 * Two display-only tables, no rules:
 *
 *   • `PHASE_MEDALLION_CLASS` — gold / ember / silver, by phase class. Dawn,
 *     morning, midday, afternoon and golden are GOLD (dawn is First Light, day
 *     class); dusk is EMBER; night is SILVER.
 *   • the duel card's and the race card's phase lines. Latin phase names live in
 *     exactly three places in this game — the day banner, the duel card and the
 *     race card — and are deliberately NOT expanded to the medallion, which uses
 *     `TIME_PHASE_NAMES`' English labels.
 *
 * Flavour copy only: nothing here reads a stock, a price, an availability or a
 * save.
 */
import type { TimePhase } from './timeState';

/** The medallion's three phase classes. */
export type PhaseMedallionClass = 'gold' | 'ember' | 'silver';

/** Which class each phase is drawn in — the design's own table. */
export const PHASE_MEDALLION_CLASS: Readonly<Record<TimePhase, PhaseMedallionClass>> = {
  dawn: 'gold',
  morning: 'gold',
  midday: 'gold',
  afternoon: 'gold',
  golden: 'gold',
  dusk: 'ember',
  night: 'silver',
};

/** The tint each class paints its disc, ring and notches with. */
export const MEDALLION_TINTS: Readonly<
  Record<PhaseMedallionClass, { disc: string; ring: string; notch: string; label: string }>
> = {
  gold: { disc: '#fbbf24', ring: '#fde68a', notch: '#b45309', label: 'text-amber-200' },
  ember: { disc: '#ea580c', ring: '#fdba74', notch: '#7c2d12', label: 'text-orange-200' },
  silver: { disc: '#cbd5e1', ring: '#f1f5f9', notch: '#475569', label: 'text-slate-200' },
};

/** The Latin light-name each hour is carded under, with the line that colours it. */
export interface PhaseCardLine {
  name: string;
  note: string;
}

/** The duel card's own table — the design's Latin names, one note each. */
export const DUEL_PHASE_LINE: Readonly<Record<TimePhase, PhaseCardLine>> = {
  dawn: { name: 'Prima Luce', note: 'the sand is cold and clean' },
  morning: { name: 'Mane', note: 'the sun climbs the cavea' },
  midday: { name: 'Meridies', note: 'the sun stands high' },
  afternoon: { name: 'Meridies', note: 'the day turns west' },
  golden: { name: 'Hora Aurea', note: 'the light is kind' },
  dusk: { name: 'Last Light', note: 'the light fails' },
  night: { name: 'Nox', note: 'torchlit' },
};

/** A boss bout is an evening spectacle whatever the hour: the editor's card runs under torches. */
export const DUEL_BOSS_LINE: PhaseCardLine = { name: 'Nox', note: 'the evening spectacle' };

/** A regular bout at Nox offers the duel under torches, in words. Availability is never in question. */
export const DUEL_TORCH_OFFER = 'The arena keeps torches for those who insist';

/** What the duel card prints for an hour — display only. */
export function duelPhaseLine(
  phase: TimePhase,
  bossBout: boolean,
): { headline: string; offer?: string } {
  if (bossBout) return { headline: `${DUEL_BOSS_LINE.name} — ${DUEL_BOSS_LINE.note}` };
  const row = DUEL_PHASE_LINE[phase];
  const headline = `${row.name} — ${row.note}`;
  return phase === 'night' ? { headline, offer: DUEL_TORCH_OFFER } : { headline };
}

/** The race card's names: the light the ring is running under. */
export const RACE_PHASE_NAME: Readonly<Record<TimePhase, string>> = {
  dawn: 'First Light',
  morning: 'Mane',
  midday: 'Meridies',
  afternoon: 'Meridies',
  golden: 'Hora Aurea',
  dusk: 'Last Light',
  night: 'First Light',
};

/**
 * What the race card prints. Dusk renders golden (`utils/racePhaseLight.ts`) and
 * night renders dawn, so those two read as the day's last and first light.
 */
export function racePhaseLine(phase: TimePhase): string {
  if (phase === 'dusk') return 'Last light — the final race of the day';
  if (phase === 'night') return 'First light — the dawn race';
  return RACE_PHASE_NAME[phase];
}
