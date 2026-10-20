/**
 * Day/night cycle T0 — the game clock's data model and resolver.
 *
 * ONE lazily-advanced integer drives the whole cycle.  It lives on the save as
 * `PlayerProfile.time.total`, and this module is the only place that decides what
 * a value of it MEANS:
 *
 *   • `resolveTimeState`  — the effective state of any profile (total, day,
 *     phase, and the countdown to the next dawn);
 *   • `advanceTimeBy`     — step the clock forward by N phases;
 *   • `advanceToNextDawn` — jump the clock to the next dawn;
 *   • `PHASE_PROFILES`    — the presentation data each phase will paint with
 *     (lighting / fog / sky), keyed by phase.
 *
 * ── Discipline, mirroring `resolveRacingState` ────────────────────────────
 * `total` is read as a LAZY, forgiving integer, never as a validated field:
 *   • a profile with no `time` field at all (every pre-T0 save), a `time` that
 *     is not an object, a `total` that is absent or not a number, `NaN`,
 *     `±Infinity` and any NEGATIVE value all resolve to **0**;
 *   • a FRACTIONAL value is floored (`7.9` is phase 0 of day 2, not phase 0.9);
 *   • nothing is migrated and nothing is repaired, so loading an older save is
 *     unchanged and a hand-edited value can only ever read as a valid state.
 *
 * A legacy save therefore wakes on **Day 1 at dawn** and is deliberately NOT
 * retro-credited for the time it was played before this slice existed.
 *
 * ── The advance functions are PURE ────────────────────────────────────────
 * `advanceTimeBy` and `advanceToNextDawn` RETURN a new profile for the caller to
 * hand to the existing `saveProfile()` path; they never mutate their argument and
 * they never write anything themselves.  A negative or nonsense `steps` is
 * treated as 0.  **T0 ships NO call sites**: nothing advances the clock yet, no
 * scene reads the profiles yet, and no profile write is added anywhere in this
 * slice.
 *
 * ── The phase profiles are DATA ───────────────────────────────────────────
 * `PHASE_PROFILES` is a plain lookup table — no scene, no renderer and no
 * consumer here; a later slice wires it up.  Its provenance is stated in full
 * above the table below, and it is flagged as Director-reviewable data.
 */

import { PlayerProfile } from '../types/game';

// ─────────────────────────────────────────────────────────────────────────────
// The seven phases
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The day's seven phases, in order.  These ids (and the names below) are the
 * design's vocabulary for the cycle: dawn → morning → midday → afternoon →
 * golden → dusk → night, then the next day's dawn.
 */
export type TimePhase =
  | 'dawn'
  | 'morning'
  | 'midday'
  | 'afternoon'
  | 'golden'
  | 'dusk'
  | 'night';

/** Every phase, in cycle order — the suite sweeps this list. */
export const TIME_PHASES: readonly TimePhase[] = [
  'dawn',
  'morning',
  'midday',
  'afternoon',
  'golden',
  'dusk',
  'night',
];

/** The human label each phase paints with, for diagnostics and the dev tools. */
export const TIME_PHASE_NAMES: Readonly<Record<TimePhase, string>> = {
  dawn: 'Dawn',
  morning: 'Morning',
  midday: 'Midday',
  afternoon: 'Afternoon',
  golden: 'Golden Hour',
  dusk: 'Dusk',
  night: 'Night',
};

/** How many phases make a day.  The clock's whole modulus. */
export const PHASES_PER_DAY = TIME_PHASES.length;

/** Where every fresh or legacy clock begins: Day 1, first phase. */
export const FIRST_DAY = 1;

// ─────────────────────────────────────────────────────────────────────────────
// The resolver
// ─────────────────────────────────────────────────────────────────────────────

/** What a profile's clock actually means right now. */
export interface ResolvedTimeState {
  /** The clock itself: a non-negative, whole phase count. */
  total: number;
  /** 1-based day number.  Day 1 is the first seven phases. */
  day: number;
  /** 0-based index into `TIME_PHASES`. */
  phaseIndex: number;
  /** The phase id at that index. */
  phase: TimePhase;
  /**
   * How many phases until the next dawn, i.e. until `day` increments.
   * **Convention: `PHASES_PER_DAY - phaseIndex`, so it is 7 at dawn and 1 at
   * night** — the number of steps a caller must take to land on a dawn.
   */
  phasesUntilDawn: number;
  /** Is the cycle in its one dark phase?  **Convention: the `night` phase only.** */
  isNight: boolean;
}

/**
 * The clock's value, normalised: absent / malformed / negative / non-finite all
 * read as 0, and a fractional value is floored.  Total by construction.
 */
function normalizeTotal(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return 0;
  return Math.floor(raw);
}

/**
 * Resolve the player's clock.
 *
 * Never throws and never answers something a caller cannot use: a missing,
 * malformed or negative `time.total` reads as `0` — Day 1, dawn.
 */
export function resolveTimeState(
  profile: PlayerProfile | null | undefined
): ResolvedTimeState {
  const total = normalizeTotal(profile?.time?.total);
  const phaseIndex = total % PHASES_PER_DAY;
  const phase = TIME_PHASES[phaseIndex];
  return {
    total,
    day: Math.floor(total / PHASES_PER_DAY) + FIRST_DAY,
    phaseIndex,
    phase,
    phasesUntilDawn: PHASES_PER_DAY - phaseIndex,
    isNight: phase === 'night',
  };
}

/** A step count, normalised: absent / negative / non-finite read as 0, floored. */
function normalizeSteps(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return 0;
  return Math.floor(raw);
}

// ─────────────────────────────────────────────────────────────────────────────
// The advance functions (pure — they RETURN a new profile)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Step the clock forward by `steps` phases and return a NEW profile.
 *
 * PURE: the argument is never mutated, and nothing is persisted here — the
 * caller hands the result to the existing `saveProfile()` path.  `steps` is
 * floored, and a negative or nonsense `steps` is treated as 0 (so the clock can
 * only move forward).  The step is applied to the RESOLVED total, so a malformed
 * save advances from 0 rather than from garbage.
 */
export function advanceTimeBy(profile: PlayerProfile, steps: number): PlayerProfile {
  const { total } = resolveTimeState(profile);
  return { ...profile, time: { total: total + normalizeSteps(steps) } };
}

/**
 * Jump the clock to the next dawn and return a NEW profile.
 *
 * The total is rounded UP to the next multiple of `PHASES_PER_DAY`.  **Already
 * at dawn the clock STAYS — `advanceToNextDawn` is the identity from dawn**
 * (there is no "next" dawn without spending a whole cycle), and that behaviour
 * is pinned in the suite.
 *
 * PURE: the argument is never mutated and nothing is persisted here.
 */
export function advanceToNextDawn(profile: PlayerProfile): PlayerProfile {
  const { total, phaseIndex } = resolveTimeState(profile);
  const next = phaseIndex === 0 ? total : total + (PHASES_PER_DAY - phaseIndex);
  return { ...profile, time: { total: next } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase presentation profiles (DATA — no scene reads these yet)
// ─────────────────────────────────────────────────────────────────────────────

/** One phase's lighting / fog / sky values, as plain data. */
export interface TimePhaseProfile {
  /** The phase this profile paints. */
  id: TimePhase;
  /** Its human label (same source as `TIME_PHASE_NAMES`). */
  name: string;
  /** How much of the MIDDAY anchor this phase carries: 0 (night) … 1 (midday). */
  daylight: number;
  /** Key (sun) light colour and intensity. */
  sunColor: string;
  sunIntensity: number;
  /** Key-light elevation above the horizon, in degrees (negative = below it). */
  sunElevationDeg: number;
  /** Hemisphere light: sky colour, ground colour, intensity. */
  skyColor: string;
  groundColor: string;
  ambientIntensity: number;
  /** Fog: colour and its near / far planes. */
  fogColor: string;
  fogNear: number;
  fogFar: number;
  /** Sky dome: colour and intensity. */
  skyDomeColor: string;
  skyDomeIntensity: number;
  /** Torches / braziers — the night anchor's warm key.  Zero in full daylight. */
  torchIntensity: number;
}

/**
 * PROVENANCE — read this before changing a value.
 *
 * The repo carries **no atmosphere package and no day/night design sheet**, so
 * the two anchors this table interpolates between are taken from the SHIPPED
 * city lighting rig rather than from a document:
 *
 *   • `ANCHOR_MIDDAY` is `CityHubScene`'s own calibrated noon rig, value for
 *     value — sun `#fffbeb` at 2.15, hemisphere `#fef3c7` / `#8a7a5f` at 0.45,
 *     fog `#e3dbc6` (45 … 160), sky dome `#fef3c7` at 0.35 — i.e. the "high
 *     Roman sun at midday" anchor the design names, as the city already paints
 *     it.
 *   • `ANCHOR_NIGHT` is the torchlit night anchor the design names, authored
 *     here: a cool moonlight key over a dark warm ground, a deep blue sky dome
 *     and a warm torch key.  No shipped scene paints night yet, so these are
 *     PROPOSED values, not measured ones.
 *
 * The seven phases are then a linear interpolation between those two anchors,
 * driven by `PHASE_DAYLIGHT` — colours mixed in sRGB, every number lerped.  The
 * weights were chosen to read as a day: full at midday, near-full in the
 * morning and afternoon, a low warm sun at golden hour, and near-dark at dusk.
 *
 * **This table is Director-reviewable data, not settled art direction.** It
 * ships as data only — nothing renders it in T0 — and a later slice is expected
 * to replace the numbers with the approved ones.
 */
export const ANCHOR_MIDDAY: Omit<TimePhaseProfile, 'id' | 'name' | 'daylight'> = {
  sunColor: '#fffbeb',
  sunIntensity: 2.15,
  sunElevationDeg: 68,
  skyColor: '#fef3c7',
  groundColor: '#8a7a5f',
  ambientIntensity: 0.45,
  fogColor: '#e3dbc6',
  fogNear: 45,
  fogFar: 160,
  skyDomeColor: '#fef3c7',
  skyDomeIntensity: 0.35,
  torchIntensity: 0,
};

/** The torchlit night anchor — authored here (see the provenance note above). */
export const ANCHOR_NIGHT: Omit<TimePhaseProfile, 'id' | 'name' | 'daylight'> = {
  sunColor: '#8ea6c8',
  sunIntensity: 0.18,
  sunElevationDeg: -24,
  skyColor: '#1b2436',
  groundColor: '#241d16',
  ambientIntensity: 0.22,
  fogColor: '#141a26',
  fogNear: 20,
  fogFar: 90,
  skyDomeColor: '#0e1420',
  skyDomeIntensity: 0.16,
  torchIntensity: 1.4,
};

/** How much midday each phase carries — the interpolation weight per phase. */
export const PHASE_DAYLIGHT: Readonly<Record<TimePhase, number>> = {
  dawn: 0.35,
  morning: 0.7,
  midday: 1,
  afternoon: 0.85,
  golden: 0.55,
  dusk: 0.25,
  night: 0,
};

const lerp = (night: number, midday: number, t: number): number =>
  night + (midday - night) * t;

/** Mix two `#rrggbb` colours in sRGB, `t` = 0 → `night`, 1 → `midday`. */
function mixHex(night: string, midday: string, t: number): string {
  const channel = (hex: string, offset: number): number =>
    parseInt(hex.slice(offset, offset + 2), 16);
  const mixed = [1, 3, 5].map((offset) => {
    const value = Math.round(lerp(channel(night, offset), channel(midday, offset), t));
    return value.toString(16).padStart(2, '0');
  });
  return `#${mixed.join('')}`;
}

/** Build one phase's profile by interpolating the two anchors at its weight. */
function buildPhaseProfile(id: TimePhase, daylight: number): TimePhaseProfile {
  const n = ANCHOR_NIGHT;
  const m = ANCHOR_MIDDAY;
  return {
    id,
    name: TIME_PHASE_NAMES[id],
    daylight,
    sunColor: mixHex(n.sunColor, m.sunColor, daylight),
    sunIntensity: lerp(n.sunIntensity, m.sunIntensity, daylight),
    sunElevationDeg: lerp(n.sunElevationDeg, m.sunElevationDeg, daylight),
    skyColor: mixHex(n.skyColor, m.skyColor, daylight),
    groundColor: mixHex(n.groundColor, m.groundColor, daylight),
    ambientIntensity: lerp(n.ambientIntensity, m.ambientIntensity, daylight),
    fogColor: mixHex(n.fogColor, m.fogColor, daylight),
    fogNear: lerp(n.fogNear, m.fogNear, daylight),
    fogFar: lerp(n.fogFar, m.fogFar, daylight),
    skyDomeColor: mixHex(n.skyDomeColor, m.skyDomeColor, daylight),
    skyDomeIntensity: lerp(n.skyDomeIntensity, m.skyDomeIntensity, daylight),
    torchIntensity: lerp(n.torchIntensity, m.torchIntensity, daylight),
  };
}

/**
 * The phase table, keyed by phase id and built once at module load by
 * interpolating the two anchors.  Data only: T0 wires it to no scene.
 */
export const PHASE_PROFILES: Readonly<Record<TimePhase, TimePhaseProfile>> = {
  dawn: buildPhaseProfile('dawn', PHASE_DAYLIGHT.dawn),
  morning: buildPhaseProfile('morning', PHASE_DAYLIGHT.morning),
  midday: buildPhaseProfile('midday', PHASE_DAYLIGHT.midday),
  afternoon: buildPhaseProfile('afternoon', PHASE_DAYLIGHT.afternoon),
  golden: buildPhaseProfile('golden', PHASE_DAYLIGHT.golden),
  dusk: buildPhaseProfile('dusk', PHASE_DAYLIGHT.dusk),
  night: buildPhaseProfile('night', PHASE_DAYLIGHT.night),
};

/** The profile for a resolved state — the one call a later scene will make. */
export function getPhaseProfile(phase: TimePhase): TimePhaseProfile {
  return PHASE_PROFILES[phase];
}
