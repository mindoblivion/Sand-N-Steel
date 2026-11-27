/**
 * LADDER-1D — Horse stamina: the race's managed resource (challenge §2D).
 *
 * A pure per-rig pool (0–100), drained by pace band, team size, and loadout,
 * recovering a little on cruise straights, easing the pace cap when tired,
 * and widening the tangle window when tired. The same module and the same
 * rates drive the player and every rival — no AI-only shortcuts, no hidden
 * rival pools. It moves no rig itself: the scene steps it per tick from each
 * rig's speed, pace cap, team size, loadout, and `routeZoneAt` section, and
 * feeds the helpers' outputs back into the movement cap, the driver target,
 * and the incident steward.
 *
 * Recon corrections this module is built on (brief §0–§1):
 * - The player's pace cap IS `CHARIOT_MOVEMENT.maxSpeed` (13) — there is no
 *   player pace-cap value to consume. Bands are measured against 13 for the
 *   player and against `resolveDriverPaceCap(profile)` / `state.paceTarget`
 *   for rivals (different scales, by design).
 * - Recovery reads the section from `routeZoneAt` ('straight' | 'meta' |
 *   'meta-exit') — there is no `raceCircuit` data module.
 * - The loadout factor table is NEW code in this module: the loadout data
 *   exists and is readable (equipped part ids), but no factor mapping
 *   existed. Reinforced wheels reduce TURN drain slightly; finishes are
 *   cosmetic and factor exactly 1.0.
 * - Rivals have no team size (all Biga by construction), so the team-size
 *   factor applies to the player only in practice; rivals always read 1.0.
 * - The pool is 0–100 for both rungs. The rung multipliers (District
 *   ×1.25, League ×1.0) live in `raceTiers.ts`, which is 1E's module.
 */
import type { RivalRouteZone } from './rivalDriver';
import type { ChariotTeamSize } from '../types/game';

/** All stamina rates in one exported config — the builder tunes these to the drain targets (brief §3), proven by the soak (§6). */
export const RACE_STAMINA_CONFIG = {
  /** The pool every rig starts a race with, and its ceiling. */
  poolMax: 100,
  /** Drain per second, by pace band. Retuned in Part 5 (see the brief's
   * Build record) from the Part 3 rates (press 0.20, all-out 0.45) by ONE
   * proportional scale, derived from the measured queue factor: the
   * shipped field's laps run longer than the single-rig laps the Part 3
   * rates were tuned against, so every rig drains more in the field than
   * alone. Queue factor Q = full-field total race time / single-rig total
   * race time, same rig, same laps, seed 11:
   * - District metronome russata 3-lap: 228.6 / 223.9 = 1.021
   * - District metronome servius 3-lap: 234.5 / 230.3 = 1.018
   * - League frontrunner tiberius 3-lap: 227.0 / 194.3 = 1.168
   * - League closer albata 5-lap: 365.8 / 342.0 = 1.070
   * The scale is 1 / max(Q) = 1 / 1.168 = 0.856 ≈ 0.855: the scale must
   * cover the worst queue in the shipped field (the League lap-1 queue,
   * 85.1 s vs 64.3 s single-rig, +32%), not the average — the District's
   * own Q (1.02) would only restore the single-rig drain, and the
   * single-rig rookies already end at 40.0–41.9, i.e. at the boundary, not
   * above it with margin. The frontrunner fade bounds the scale from
   * below: it needs s > 0.73 (lap-3 pool < 40) and s < 1.08 (lap-2 pool
   * > 40); 0.855 sits comfortably inside. Press must stay strictly above
   * cruise (the drain-ordering test pins all-out > press > cruise): the
   * scale preserves the ratios (0.385 / 0.171 = 2.25, 0.171 / 0.128 =
   * 1.34, as before). Recovery is UNTOUCHED by the scale. The Part 5
   * soak proves these numbers — they move only on soak evidence. */
  drainPerSecond: {
    cruise: 0.128,
    press: 0.171,
    allOut: 0.385,
  },
  /** Regain per second, cruise band on straights only. */
  recoveryPerSecond: 0.14,
  /** A full lap of cruising cannot refill more than this much of the pool. */
  recoveryCapPerLap: 10,
  /** Drain multiplier by team size — bigger teams are an endurance purchase. */
  teamSizeFactor: {
    2: 1.0,
    3: 0.9,
    4: 0.8,
  },
  /** Pace-cap multiplier is 1.0 at or above this pool, easing linearly to the floor at 0. */
  paceCapEaseStart: 40,
  /** The pace-cap multiplier at pool 0 — a blown team limps on, it never stops. */
  paceCapEaseFloor: 0.88,
  /** At or below this pool a rig is tired: its tangle window widens. */
  vulnerabilityThreshold: 25,
  /** The tangle-window multiplier for a tired rig. */
  vulnerabilityFactor: 1.5,
  /** Reinforced wheels cut turn drain by this factor (10% less on metas). */
  reinforcedWheelsTurnDrainFactor: 0.9,
} as const;

/** A rig's pace band, from its speed relative to its pace cap. */
export type StaminaPaceBand = 'cruise' | 'press' | 'allOut';

/** One rig's stamina state, created fresh per race. */
export interface RaceStaminaState {
  /** The pool, 0–100. Starts at `poolMax`. */
  pool: number;
  /** The band the rig is in this tick. */
  band: StaminaPaceBand;
  /** The lowest pool reached this race — a results-screen row. */
  lowestPool: number;
  /** Milliseconds spent in the all-out band — a results-screen row. */
  timeAllOutMs: number;
  /** Pool regained since the lap counter last changed (the recovery cap). */
  recoveredThisLap: number;
  /** The lap `recoveredThisLap` belongs to. */
  lap: number;
}

/** A fresh pool: full, cruising, nothing spent yet. */
export function createRaceStamina(): RaceStaminaState {
  return {
    pool: RACE_STAMINA_CONFIG.poolMax,
    band: 'cruise',
    lowestPool: RACE_STAMINA_CONFIG.poolMax,
    timeAllOutMs: 0,
    recoveredThisLap: 0,
    lap: 0,
  };
}

/**
 * The pace band for a speed against its pace cap: cruise below 70%, press
 * 70–92%, all-out above 92%. A rig that cannot move (speed 0) cruises; a
 * missing or non-positive cap fails closed to cruise (the lowest drain).
 */
export function staminaPaceBand(speed: number, paceCap: number): StaminaPaceBand {
  if (!Number.isFinite(speed) || !Number.isFinite(paceCap) || paceCap <= 0) return 'cruise';
  const fraction = Math.max(0, speed) / paceCap;
  if (fraction < 0.7) return 'cruise';
  if (fraction <= 0.92) return 'press';
  return 'allOut';
}

/**
 * The shared pace-cap multiplier — the single consumption point for player
 * and rivals. 1.0 at or above 40 stamina, easing linearly to 0.88 at 0.
 * Smooth, never binary: no cliff at the threshold.
 */
export function paceCapMultiplierFor(pool: number): number {
  const { paceCapEaseStart, paceCapEaseFloor } = RACE_STAMINA_CONFIG;
  if (!Number.isFinite(pool)) return 1;
  if (pool >= paceCapEaseStart) return 1;
  if (pool <= 0) return paceCapEaseFloor;
  return paceCapEaseFloor + (1 - paceCapEaseFloor) * (pool / paceCapEaseStart);
}

/**
 * The vulnerability factor for one rig's pool: exactly 1.0 above 25 stamina,
 * 1.5 at 25 or below (tired — the design's "stamina < 25" clause, with 25
 * itself counted tired so the boundary is unambiguous). The steward takes
 * the max of the two rigs' factors for a pair.
 */
export function staminaVulnerabilityFactor(pool: number): number {
  if (!Number.isFinite(pool)) return 1;
  return pool <= RACE_STAMINA_CONFIG.vulnerabilityThreshold
    ? RACE_STAMINA_CONFIG.vulnerabilityFactor
    : 1;
}

/**
 * The HUD stamina bar's band for a pool — the same two thresholds the
 * module already owns, so the bar can never disagree with the physics:
 * healthy at or above 40 (no pace-cap easing), working from 25 up to 40
 * (the cap is easing but the rig is not tired), blown at or below 25
 * (tired — the tangle window widens). A non-finite pool reads healthy
 * (the bar's fail-closed state, matching the vulnerability helper).
 */
export type StaminaBarBand = 'healthy' | 'working' | 'blown';

export function staminaBarBand(pool: number): StaminaBarBand {
  if (!Number.isFinite(pool)) return 'healthy';
  if (pool <= RACE_STAMINA_CONFIG.vulnerabilityThreshold) return 'blown';
  if (pool < RACE_STAMINA_CONFIG.paceCapEaseStart) return 'working';
  return 'healthy';
}

/** Drain multiplier by team size. Unknown sizes fail closed to Biga (1.0). */
export function teamSizeDrainFactor(teamSize: ChariotTeamSize): number {
  const factor = RACE_STAMINA_CONFIG.teamSizeFactor[teamSize];
  return typeof factor === 'number' ? factor : 1;
}

/**
 * The wheels' drain factor. Reinforced wheels cut TURN drain slightly
 * (×0.9 on a meta or meta-exit); on a straight, and for standard or unknown
 * wheels, they change nothing.
 */
export function wheelsDrainFactor(wheelsId: string, zone: RivalRouteZone): number {
  if (wheelsId !== 'wheels_reinforced') return 1;
  if (zone === 'straight') return 1;
  return RACE_STAMINA_CONFIG.reinforcedWheelsTurnDrainFactor;
}

/**
 * The finish's drain factor: exactly 1.0, always. Finishes are cosmetic —
 * the workshop's honesty is preserved. Any id, known or unknown, reads 1.0.
 */
export function finishDrainFactor(_finishId: string): number {
  return 1;
}

/** The combined loadout factor: wheels (turns only) × finish (always 1.0). */
export function loadoutDrainFactor(
  wheelsId: string,
  finishId: string,
  zone: RivalRouteZone,
): number {
  return wheelsDrainFactor(wheelsId, zone) * finishDrainFactor(finishId);
}

/** One fixed-timestep stamina update. Mutated in place, like the driver and the steward. */
export interface RaceStaminaTickInput {
  /** Current speed, world units per second. */
  speed: number;
  /** The rig's pace cap (player: `CHARIOT_MOVEMENT.maxSpeed`; rival: `state.paceTarget`). */
  paceCap: number;
  /** Fixed timestep, milliseconds (1/60 s in the scene and the soak). */
  dtMs: number;
  /** The rig's team size (rivals are always Biga). */
  teamSize: ChariotTeamSize;
  /** The equipped wheels part id (`wheels_standard` | `wheels_reinforced`). */
  wheelsId: string;
  /** The equipped finish part id (cosmetic — always factor 1.0). */
  finishId: string;
  /** The circuit section, from `routeZoneAt`. */
  zone: RivalRouteZone;
  /** Completed laps — the recovery cap resets when this changes. */
  lap: number;
}

/**
 * Step one rig's stamina by one tick.
 *
 * - Cruise band on a straight RECOVERS at `recoveryPerSecond`, capped so a
 *   full lap of cruising cannot refill more than `recoveryCapPerLap` — only
 *   the pool actually regained counts toward the cap, and the cap resets
 *   when the lap changes.
 * - Every other band/section DRAINS at the band rate × team-size factor ×
 *   loadout factor (Reinforced wheels help on turns only; finishes never).
 * - The pool clamps to 0–100. `lowestPool` and `timeAllOutMs` are tracked
 *   for the results screen. A non-positive timestep is a no-op.
 */
export function stepRaceStamina(
  state: RaceStaminaState,
  input: RaceStaminaTickInput,
): RaceStaminaState {
  if (!(input.dtMs > 0)) return state;
  if (input.lap !== state.lap) {
    state.lap = input.lap;
    state.recoveredThisLap = 0;
  }
  const dt = input.dtMs / 1000;
  const band = staminaPaceBand(input.speed, input.paceCap);
  state.band = band;
  if (band === 'cruise' && input.zone === 'straight') {
    const remaining = Math.max(
      0,
      RACE_STAMINA_CONFIG.recoveryCapPerLap - state.recoveredThisLap,
    );
    const rawGain = RACE_STAMINA_CONFIG.recoveryPerSecond * dt;
    const newPool = Math.min(
      RACE_STAMINA_CONFIG.poolMax,
      state.pool + Math.min(rawGain, remaining),
    );
    state.recoveredThisLap += newPool - state.pool;
    state.pool = newPool;
  } else {
    const drain =
      RACE_STAMINA_CONFIG.drainPerSecond[band] *
      teamSizeDrainFactor(input.teamSize) *
      loadoutDrainFactor(input.wheelsId, input.finishId, input.zone) *
      dt;
    state.pool = Math.max(0, state.pool - drain);
  }
  if (state.pool < state.lowestPool) state.lowestPool = state.pool;
  if (band === 'allOut') state.timeAllOutMs += input.dtMs;
  return state;
}
