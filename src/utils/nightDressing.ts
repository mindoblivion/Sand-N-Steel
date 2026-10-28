/**
 * nightDressing.ts — Day/Night T3: WHICH dressing is up, as pure predicates.
 *
 * One row per dressing in the slice, so the rule is testable without a renderer
 * and the scene only asks a question. Nothing here reads or writes a save, and
 * nothing advances the clock: the phase and the day are handed in.
 *
 * The four dressings (design, Day/Night T3):
 *   • forum + arena-gate braziers lit at dusk and night;
 *   • the tavern at full dress at dusk and night;
 *   • the fortress watch-fire burning at night — one emissive on the motte, pure
 *     silhouette dressing, the frontier sleeps armed;
 *   • shrine smoke at dawn on Dies Fortunae only (day identity `(day - 1) mod 7`
 *     with Dies Fortunae at slot 2 — see `dayRollover.ts`).
 */
import type { TimePhase } from './timeState';
import { LUDI_FORTUNAE_INDEX, ludiIndexForDay } from './dayRollover';
import { MOTTE_CENTER_Z, SUMMIT_Y } from './terrainHeight';

/** The two evening phases the lamps answer: dusk and night. */
export const BRAZIER_PHASES: readonly TimePhase[] = ['dusk', 'night'];

/** Forum and arena-gate braziers burn at dusk and at night, and only then. */
export function braziersLit(phase: TimePhase): boolean {
  return BRAZIER_PHASES.includes(phase);
}

/** The tavern dresses for the evening with the braziers — full dress, same hours. */
export function tavernFullDress(phase: TimePhase): boolean {
  return BRAZIER_PHASES.includes(phase);
}

/** The watch-fire burns only in the dark phase. */
export function watchFireLit(phase: TimePhase): boolean {
  return phase === 'night';
}

/** Shrine smoke rises at dawn, and only on Dies Fortunae. */
export function shrineSmokeActive(phase: TimePhase, day: number): boolean {
  return phase === 'dawn' && ludiIndexForDay(day) === LUDI_FORTUNAE_INDEX;
}

/**
 * The watch-fire's one mesh: a small flame standing on the motte outside the
 * fortress's south gate. It is `brazier` class, so it is driven by the same
 * shared emissive driver as every other fire in the city.
 */
export const WATCH_FIRE_POSITION: [number, number, number] = [
  0,
  SUMMIT_Y + 0.15,
  MOTTE_CENTER_Z + 10.2,
];
export const WATCH_FIRE_RADIUS = 0.22;
export const WATCH_FIRE_HEIGHT = 0.75;
export const WATCH_FIRE_EMISSIVE = 2.6;

/**
 * The shrine's smoke: one transparent plume above the altar of the Shrine of
 * Fortuna (root [-27, 0, 11], altar at local [0, 0.65, -0.8]).
 */
export const SHRINE_SMOKE_POSITION: [number, number, number] = [-27, 3.0, 10.2];
export const SHRINE_SMOKE_RADIUS = 0.34;
export const SHRINE_SMOKE_HEIGHT = 1.7;
export const SHRINE_SMOKE_OPACITY = 0.22;
