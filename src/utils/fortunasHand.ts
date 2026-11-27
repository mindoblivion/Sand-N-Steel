// fortunasHand.ts — LADDER-1E: Fortuna's Hand, the disclosed rubber-band.
//
// Fortuna's Hand keeps a race close by adjusting a RIVAL's pace cap by its
// position relative to the player: a rival behind the player gets a faster
// cap, a rival ahead gets a slower one, so the field compresses toward the
// player. The rates are printed — on the race card (Part 5, which reads
// `FORTUNAS_HAND_RATES`) and on the results screen — so the player always
// knows the Hand is there and exactly what it does.
//
// This is the SINGLE disclosed exception to the driver's no-rubber-banding
// stance (`rivalDriver.ts`, `raceCompetitors.ts`): bounded (±4%/±2%), a pure
// function of (position relative to the player, lap, rung), off entirely on
// the final lap, and never applied to the player. There is no other
// rubber-band anywhere in the race code. The Hand is a *rubber-band*; the
// stamina multiplier (`raceStamina.ts`) is a *tiredness* effect — different
// helpers, different modules, and the two compose in the driver's target
// computation as paceCap × style × stamina × Hand, never one hiding the
// other.
//
// Fail-closed rules, all in the pure function below:
//   • no player snapshot (the soak harness, a unit test with no player) —
//     the Hand is 1.0. The soak never fires it, so the soak pins hold
//     exactly. (The live race always has a player snapshot.)
//   • the final lap — the Hand is 1.0. A single-lap race is all final lap,
//     so the Hand never applies there either.
//   • a tie — the player's total equals the rival's — the Hand is 1.0.
//     The boundary is exact, not a hidden term.
//   • an unknown rung — the District rates, the always-open rung.
// Position is the unwrapped route distance (lap × length + s). Both flanks
// share one length (`raceRival.ts`: both flanks share one length), so the
// totals compare across sides: a rival on the other flank is still ahead
// of or behind the player in the race.

import { resolveRaceRungId, type RaceRungId } from './raceCompetitors';

/** The Hand's rates, by rung — the single source of truth, read by the driver and by the race card (Part 5). */
export const FORTUNAS_HAND_RATES: Readonly<
  Record<RaceRungId, Readonly<{ behind: number; ahead: number }>>
> = Object.freeze({
  district: Object.freeze({ behind: 0.04, ahead: -0.03 }),
  league: Object.freeze({ behind: 0.02, ahead: -0.015 }),
});

/** One evaluation of the Hand: everything it may read, nothing else. */
export interface FortunasHandInput {
  /**
   * The player's unwrapped route distance (lap × length + s), or null when
   * no player snapshot is present. Only the POSITION is read — never the
   * player's speed, pace, or any other field.
   */
  playerTotal: number | null;
  /** This rival's unwrapped route distance (`state.totalS`). */
  myTotal: number;
  /** The rival's current lap index, 0-based (`state.lap`). */
  lap: number;
  /** The race length in laps (`state.totalLaps`). */
  totalLaps: number;
  /** The rung this race is run on. */
  rung: RaceRungId;
}

/**
 * Fortuna's Hand as a pace-cap multiplier: 1 + the disclosed rate, or
 * exactly 1.0 when the Hand does not apply (no player, final lap, tie).
 * Pure — the same inputs always give the same multiplier.
 */
export function fortunasHandMultiplier(input: FortunasHandInput): number {
  if (input.playerTotal === null) return 1;
  if (!Number.isFinite(input.playerTotal) || !Number.isFinite(input.myTotal)) return 1;
  if (!Number.isFinite(input.lap) || !Number.isFinite(input.totalLaps)) return 1;
  if (input.lap >= input.totalLaps - 1) return 1;
  const rates = FORTUNAS_HAND_RATES[resolveRaceRungId(input.rung)];
  if (input.playerTotal > input.myTotal) return 1 + rates.behind;
  if (input.playerTotal < input.myTotal) return 1 + rates.ahead;
  return 1;
}

/** One rate as a signed percentage for display: +4%, -3%, +2%, -1.5%. */
function fortunasHandRateText(rate: number): string {
  const pct = Math.round(rate * 1000) / 10;
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

/**
 * The rates as a display fragment: "rivals behind +4%, ahead −3%".
 * Shared by the results line below and the race card (Part 5), so the two
 * can never disagree about what the Hand does on a rung.
 */
export function fortunasHandRatesText(rung: RaceRungId): string {
  const rates = FORTUNAS_HAND_RATES[resolveRaceRungId(rung)];
  return `rivals behind ${fortunasHandRateText(rates.behind)}, ahead ${fortunasHandRateText(rates.ahead)}`;
}

/**
 * The results-screen line for a race just run: the rung rates, and whether
 * the Hand was active in that race (off on the final lap). A race that
 * never applied the Hand — or a single-lap race, which is all final lap —
 * says so instead of claiming otherwise.
 */
export function fortunasHandResultsLine(
  rung: RaceRungId,
  active: boolean,
  totalLaps: number,
): string {
  const id = resolveRaceRungId(rung);
  const name = id === 'league' ? 'League' : 'District';
  const line = `Fortuna's Hand — ${name}: ${fortunasHandRatesText(id)}.`;
  if (!active || totalLaps <= 1) return `${line} Not applied in this race.`;
  return `${line} Active laps 1-${totalLaps - 1}; off on the final lap.`;
}
