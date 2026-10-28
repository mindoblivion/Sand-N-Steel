/**
 * duelPhaseLight.ts — Day/Night T1's DUEL mapping of the one phase table.
 *
 * The duel draws no table of its own. It reads `PHASE_LIGHT` (the city's rows) and
 * scales that read for the ring: the row's own colours and key-light direction, a
 * much shorter fog band, and the two authored NIGHT STATES:
 *
 *   • `torchlit`     — a normal duel at the `night` phase; fog 20 … 55.
 *   • `spectacle`    — a BOSS duel, at ANY phase; fog 16 … 50.
 *
 * Day phases (and the night phase's own row for a regular bout's sky) use the row's
 * fog band scaled to the ring: 25 … 65 for day.
 *
 * **Do not ship a duel night with a daytime sky.** A night state therefore always
 * takes the `night` row's sky, moon and stars — a boss bout at any phase is a night
 * bout — so `nightState !== null` implies `row === PHASE_LIGHT.night`. The phase row
 * is not mutated by this mapping and the canonical phase itself never changes.
 *
 * Lighting only: nothing here reads or writes a save, and nothing adds a light. The
 * duel's existing ambient, two directionals and eight brazier point lights are given
 * new PROPERTY values.
 *
 * ── T3 — THE NIGHT FIXTURE STATES, AND THE JOINT FENCE ───────────────────
 * T1 shipped the LIGHT states (sky, key, fog, brazier light, ember emissive). T3 adds
 * the FIXTURE states on top of them — the bronze bowls' own glow at night, and the
 * spectator rings' dress for the Night Spectacle — as more material properties on
 * meshes the arena already draws (+0 meshes, +0 lights, +0 draw calls).
 *
 * THE FENCE, stated once and binding: **Challenge owns boss mechanics; CF-6 owns boss
 * moments (shake / swell / glow / sting); this slice owns the boss BASE LIGHT STATE and
 * DRESSING.** Nothing here reads a boss's health, phases or telegraphs, and the only
 * input is the opponent's own `isBoss`, which the caller passes to `resolveDuelPhaseLight`
 * as `bossBout`. The spectacle is therefore reachable by a boss bout and BY NOTHING ELSE:
 * a regular bout's `nightState` is `'torchlit'` at the night phase and `null` at every
 * other phase, and `crowdDress` is 0 in both. Do not extend the spectacle to a non-boss
 * fight, and do not move a boss moment into this module.
 */
import { PHASE_LIGHT, sunDirection, type PhaseLight } from './atmosphere';
import type { TimePhase } from './timeState';

/** Fog bands for the ring, in world units. */
export const DUEL_DAY_FOG: readonly [number, number] = [25, 65];
export const DUEL_TORCHLIT_FOG: readonly [number, number] = [20, 55];
export const DUEL_SPECTACLE_FOG: readonly [number, number] = [16, 50];

/** How far the duel's key light stands from the ring's centre (a direction, scaled). */
export const DUEL_KEY_DISTANCE = 48;

/** The shipped duel rig's own bases — the values these scales multiply. */
export const DUEL_BRAZIER_LIGHT = 3.5;
export const DUEL_EMBER_EMISSIVE = 3;
/** T3 — the bronze bowls' warm emissive at full dress (a material property on meshes already drawn). */
export const DUEL_BOWL_EMISSIVE = 0.9;
/** T3 — the spectator rings' dress emissive for the Night Spectacle alone. */
export const DUEL_CROWD_DRESS_EMISSIVE = 0.28;
export const DUEL_FILL_INTENSITY = 0.5;
/** The hemisphere intensity the shipped fill was calibrated against (the golden row). */
export const DUEL_FILL_REFERENCE_HEMI = 0.45;

export type DuelNightState = 'torchlit' | 'spectacle';

export interface DuelPhaseLight {
  /** The phase row actually rendered (a night state always renders `night`). */
  phase: TimePhase;
  row: PhaseLight;
  nightState: DuelNightState | null;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  /** The key light's position, already scaled for the ring. */
  keyPosition: [number, number, number];
  keyColor: string;
  keyIntensity: number;
  ambientColor: string;
  ambientIntensity: number;
  fillColor: string;
  fillIntensity: number;
  /** The eight bronze braziers' point-light intensity. */
  brazierIntensity: number;
  /** The braziers' ember emissive (a material property on meshes already drawn). */
  emberEmissive: number;
  /**
   * T3 — the bronze bowls' own warm emissive. 0 by day: a cold bowl is what daylight
   * looks like, and the embers above it still carry the fire.
   */
  bowlEmissive: number;
  /**
   * T3 — the SPECTACLE RING'S DRESS: the spectator silhouettes' own emissive, so the
   * crowd is read in the dark. Non-zero ONLY for a boss bout (see the joint fence
   * below); a regular bout can never reach it.
   */
  crowdDress: number;
}

/**
 * The lamp scale: brighter braziers at night, dimmer by day, from the row's own
 * `lampGlow`, with the Night Spectacle pushing them further than Torchlit.
 */
export function duelBrazierScale(lampGlow: number, nightState: DuelNightState | null): number {
  const base = 0.55 + 0.95 * Math.max(0, Math.min(1, lampGlow));
  return nightState === 'spectacle' ? base * 1.2 : base;
}

/**
 * Resolve the duel's lighting for a phase and a bout kind.
 *
 * `bossBout` is the opponent's own `isBoss` flag: a boss duel is the Night Spectacle
 * at ANY phase, a regular duel is Torchlit only at the `night` phase, and every other
 * combination is the row's day mapping.
 */
export function resolveDuelPhaseLight(phase: TimePhase, bossBout: boolean): DuelPhaseLight {
  const nightState: DuelNightState | null = bossBout
    ? 'spectacle'
    : phase === 'night'
      ? 'torchlit'
      : null;

  const row = nightState ? PHASE_LIGHT.night : PHASE_LIGHT[phase];
  const [fogNear, fogFar] = nightState === 'spectacle'
    ? DUEL_SPECTACLE_FOG
    : nightState === 'torchlit'
      ? DUEL_TORCHLIT_FOG
      : DUEL_DAY_FOG;

  const direction = sunDirection(row.sunElevationDeg, row.sunAzimuthDeg);
  const scale = duelBrazierScale(row.lampGlow, nightState);

  return {
    phase: nightState ? 'night' : phase,
    row,
    nightState,
    fogColor: row.fogColor,
    fogNear,
    fogFar,
    keyPosition: [
      direction[0] * DUEL_KEY_DISTANCE,
      direction[1] * DUEL_KEY_DISTANCE,
      direction[2] * DUEL_KEY_DISTANCE,
    ],
    keyColor: row.sunColor,
    keyIntensity: row.sunIntensity,
    ambientColor: row.hemiSky,
    ambientIntensity: row.hemiIntensity,
    fillColor: row.hemiSky,
    // The cool fill follows the row's own bounce strength, so it fades at night.
    fillIntensity: DUEL_FILL_INTENSITY * (row.hemiIntensity / DUEL_FILL_REFERENCE_HEMI),
    brazierIntensity: DUEL_BRAZIER_LIGHT * scale,
    emberEmissive: DUEL_EMBER_EMISSIVE * scale,
    // T3 — the bowls glow only in a night state, at the same accounting as the embers.
    bowlEmissive: nightState ? DUEL_BOWL_EMISSIVE * scale : 0,
    // T3 — the ring is dressed for the SPECTACLE only; `nightState` is 'spectacle'
    // exactly when `bossBout` is true, so a regular bout can never reach this.
    crowdDress: nightState === 'spectacle' ? DUEL_CROWD_DRESS_EMISSIVE * scale : 0,
  };
}
