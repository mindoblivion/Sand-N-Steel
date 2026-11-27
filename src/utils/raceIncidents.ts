// LADDER-1C — the race steward: wheel contact, trace tangles, fault,
// and the session-only race log (challenge §2C, design A2.3/A5/A6).
//
// A PURE module (no React, no three.js, no clock, no storage): it reads
// poses only and returns per-rig effects plus new log entries. The scene
// calls it once per frame over the same pair set the resolver runs, feeds
// each rival's warning into its `driveRival` call (the 1B2 hook), and
// applies the drag / steer modifiers to every rig's `advanceChariot`
// call — player and rivals through the same path, so the physics cannot
// favour one side.
//
// ── The two incident types ───────────────────────────────────────────────
// Wheel contact: when two rigs' outlines interlock LATERALLY (the
// deepest overlapping circle pair pushes mostly sideways — a
// nose-to-tail brush pushes lengthways and is not wheel contact) beyond
// the scrape threshold while their speeds are close and they are
// alongside, both enter a scrape WARNING (small scrub for both, the
// initiator steers to clear through the 1B2 hook, the innocent holds
// its line). If the overlap deepens past the hub-catch threshold while
// the warning is still armed (≥ 0.6 s), the incident fires on the
// INITIATOR only — strong deceleration over ~1.5 s via the movement
// module's drag multiplier. Steering clear during the warning clears it
// with no incident.
//
// Trace tangle: only at a meta (the route zone is 'meta' or 'meta-exit'
// — see below — and the rig is on the tight line, u ≥ the tight band) while another
// rig is within the tangle lateral window and alongside. After the same
// ≥ 0.6 s warning (visible trace-strain state on both rigs), the rig at
// fault — the one that entered the occupied tight band last — is dragged
// wide (steering authority reduced, a lateral outward drift applied for
// ~2 s, with speed scrub). The other rig takes at most the scrape effect.
//
// Wall scrapes (District's self-inflicted incidents under A6): a rig
// whose BODY comes within the scrape margin of the ring boundary warns
// first; sustained touching (≥ 0.6 s) logs the incident, which runs
// 1.5 s at wallDragScale (the hub catch's pattern) and then releases
// into the 1 s post-incident immunity. The ring clamp already stops the
// rig; the incident drag is the penalty, not the stop.
//
// The measure is body-only, ring-only, by measurement: the driven route
// centreline passes through the spina tip box (body clearance −1.05 at
// s=148–149 on both flanks), and the box is a roll-path planning
// exclusion in raceGrid.ts, not a driven surface — so it cannot be a
// wall surface (it would warn every rig at the south hook every lap).
// The nose probe dips outside the ring at the hook exit (s=157) and
// would false-positive there. The body-vs-ring measure is clean on the
// whole route (min 0.25 at s=0, a single point inside the 3 s start
// immunity; ≥ 0.64 elsewhere, above the 0.3 margin).
//
// Disclosed limitation: with the box dropped, the spina tip has no
// incident surface — no real spina collision geometry exists in the
// tree (a rig can drive through it today, pre-existing). District wall
// incidents in 1C are outer-ring scrapes only; a real spina surface is
// a follow-up, not 1C's.
//
// ── The meta zone ────────────────────────────────────────────────────────
// The brief's §3 prescribes "lap stage + tight band". The lap stage is
// progress-based (north-turn covers the whole northbound straight) and
// only the player has a tracker, so this module uses the circuit's own
// per-position determination instead: `routeZoneAt` (1B2, from the
// route's meta weight — 0 on the straights, 1 at each hairpin's apex),
// plus the same tight band the brief prescribes (u ≥ 0.5 inside units —
// between the shipped straight-line spread, |u| ≤ ~0.25, and the
// shipped meta offset, 0.9, so it identifies rigs that have moved inside
// the route's centreline at a meta). Place names come from the zone and
// the rig's z (north meta / south meta / the straight).
//
// `routeZoneAt` returns 'meta-exit' for the second half of each hairpin
// (the meta weight falling past the apex) and the short tail after it —
// the rigs are still turning through the hairpin there, traces still
// straining, so 'meta-exit' counts as the meta for tangles (isMetaZone
// below). A tangle window of only the approach half would be too narrow
// to ever fire at the short south hook.
//
// ── Fault ────────────────────────────────────────────────────────────────
// Geometric and deterministic (A5): the rig at fault for a wheel contact
// is the one that closed the lateral gap last — tracked from each rig's
// lateral offset from the route (u): the closer is the rig whose u moved
// further toward the other's since last tick. The route frame is what
// makes this asymmetric (a rig holding its lane has ~0 lateral movement
// in it), and the resolver's push can only open a gap, never close one,
// so a rig shoved apart is never blamed.
// For a tangle it is the rig that entered the occupied tight band last.
// If no closer was ever recorded, no hub catch fires — a warning without
// an identified initiator never escalates.
//
// ── Rung scoping (A6, brief §7 Q1) ───────────────────────────────────────
// District is self-inflicted only: rig-vs-rig evaluation is OFF, walls
// are ON. League runs the full system (rig-vs-rig + walls). No DNF:
// an incident never ends a race; the settlement is untouched.
//
// ── The fairness charter (A5) is the test gate ───────────────────────────
// Warning first (≥ 0.6 s) with an escape that works; no incident in the
// first 3 s after the start or within 1 s of a previous incident
// resolving; never teleport, never reset position, never spin the rig;
// the innocent rig's penalty is capped at the scrape level; everything
// that costs the player a race is written to the race log in plain
// language. The log is session-only — nothing here writes saves (§J
// stays 29).
//
// ── The 1D hook ──────────────────────────────────────────────────────────
// `vulnerabilityFactor` widens the tangle lateral window — per rig, from
// stamina (below 25 stamina the window widens ×1.5, above 25 it is exactly
// 1.0); a pair uses the max of the two rigs' factors. Each pose carries its
// own factor; the steward-level factor on the input is the fallback for
// rigs that carry none (1C's tests pass it). 1C never consumes stamina
// itself.

import { CIRCUS_AXIS_X } from './collisionShapes';
import { CHARIOT_MOVEMENT, distanceToDriveableBoundary } from './chariotMovement';
import { RACE_NORTH_TURN_Z } from './raceLap';
import { RACE_ROUTE_LENGTH } from './raceRival';
import { SPINA_TIP_BOX } from './raceGrid';
import { resolveRigSeparation } from './raceRigCollision';
import {
  RIVAL_RIG_LENGTH,
  analyzeRivalRoute,
  routeZoneAt,
} from './rivalDriver';
import type { RivalRouteZone, RivalWarning } from './rivalDriver';
import type { RaceRungId } from './raceCompetitors';

/**
 * LADDER-1C — every incident threshold, in one exported config. The
 * numbers are chosen in the comments, not tuned to pass a test: the
 * scrape threshold sits above a brush (a real wheel touch, not resolver
 * jostling), the hub-catch threshold is a deep interlock, and the
 * durations are the design's own (≥ 0.6 s warning, 3 s start immunity,
 * 1 s post-incident immunity, ~1.5 s hub catch, ~2 s tangle).
 */
export const RACE_INCIDENT_CONFIG = {
  /** Lateral circle overlap (metres) that arms a scrape. */
  scrapeLateralOverlap: 0.1,
  /** Lateral circle overlap that escalates an armed scrape to a hub catch. */
  hubCatchLateralOverlap: 0.45,
  /** |vA − vB| (u/s) at or below which two rigs count as "speeds close". */
  matchedSpeedWindow: 2.0,
  /** A warning must run this long (ms) before its incident can fire. */
  warningDurationMs: 600,
  /** No incident (or warning) in the first 3 s after the race clock starts. */
  startImmunityMs: 3000,
  /** No new incident for a pair / rig within 1 s of its last one resolving. */
  postIncidentImmunityMs: 1000,
  /** Hub catch: strong deceleration for ~1.5 s. */
  hubCatchDurationMs: 1500,
  /** Hub catch: the movement module's drag multiplier (see chariotMovement §6). */
  hubCatchDragScale: 4.0,
  /** Scrape: the small scrub both rigs take while a scrape warning runs. */
  scrapeDragScale: 1.3,
  /** Tangle: |Δu| (inside units) at or below which two rigs contest one tight line. */
  tangleLateralWindow: 1.0,
  /** Tangle: |along-route gap| (units) below which two rigs count as abreast. */
  tangleAlongsideGap: 1.5,
  /** Tight line: u (inside units, + toward the axis) at or above this at a meta. */
  tightBandU: 0.5,
  /** Tangle: dragged wide + slowed for ~2 s. */
  tangleDurationMs: 2000,
  /** Tangle: the movement module's drag multiplier for the rig at fault. */
  tangleDragScale: 2.0,
  /** Tangle: the rig at fault keeps this fraction of its steering authority. */
  tangleSteerScale: 0.4,
  /** Tangle: the outward steer bias (half deflection) dragging the rig wide. */
  tangleSteerBias: 0.5,
  /** Wall: the body within this far (m) of the ring boundary warns. */
  wallScrapeMargin: 0.3,
  /** Wall: at or inside this clearance (m) the rig is touching the wall. */
  wallTouchEpsilon: 0.05,
  /** Wall: the drag multiplier while a rig is fouled on the wall. */
  wallDragScale: 4.0,
  /** Wall scrape: the incident runs this long (ms) at wallDragScale,
      then releases into the 1 s post-incident immunity — the hub catch's
      pattern (a wall incident with no duration pinned a rig at speed 0). */
  wallIncidentDurationMs: 1500,
} as const;

/** One rig's pose for one steward tick, from the scene's rig registry. */
export interface IncidentRigPose {
  /** Registry id ('player' or a competitor id). */
  id: string;
  /** Display name for the log ('You' for the player, the rival's full name). */
  name: string;
  isPlayer: boolean;
  x: number;
  z: number;
  /** Heading in radians, 0 = north (−Z), the movement module's convention. */
  heading: number;
  /** Speed in units/s. */
  speed: number;
  /** Rig width (Biga 1.5, Triga ~2.2, Quadra 2.94). */
  width: number;
  /** Route distance (wrapped, 0 … route length). */
  s: number;
  /** Completed laps (the driver's lap). */
  lap: number;
  /** Lateral offset, in inside units (positive = toward the axis). */
  u: number;
  /** The route zone at this rig's route distance ('meta' = inside a turn). */
  zone: RivalRouteZone;
  /** Which meta the rig is in, or null outside one (north: z < 10, south: z ≥ 10). */
  meta: 'north' | 'south' | null;
  /**
   * LADDER-1D: this rig's own tangle-window factor, from its stamina pool
   * (1.0 when fresh, 1.5 when tired — `staminaVulnerabilityFactor`). A pair
   * uses the max of the two rigs' factors. When absent, the rig falls back
   * to the steward-level `vulnerabilityFactor` below (1C's tests pass it;
   * 1D's scene puts a per-rig factor on every pose).
   */
  vulnerabilityFactor?: number;
}

/** What the steward wants the scene to do to one rig this frame. */
export interface IncidentRigEffects {
  /** The 1B2 warnings-hook input: 'initiator' steers to clear, 'innocent' holds its line. */
  warning: RivalWarning;
  /** Which warning (if any) this rig is under — for the HUD banner. */
  warningKind: 'scrape' | 'tangle' | 'wall' | null;
  /** The movement module's drag multiplier (1 = no incident effect). */
  dragScale: number;
  /** Tangle only: the fraction of steering authority the rig keeps. */
  steerScale: number;
  /** Tangle only: the outward steer bias dragging the rig wide (−1 … 1). */
  steerBias: number;
}

/** The do-nothing effects: a rig with no warning and no incident. */
export const DEFAULT_INCIDENT_RIG_EFFECTS: IncidentRigEffects = {
  warning: 'none',
  warningKind: null,
  dragScale: 1,
  steerScale: 1,
  steerBias: 0,
} as const;

/** One race-log entry: every warning and incident, in plain language's raw form. */
export interface RaceIncidentLogEntry {
  /** The steward's tick (frame count since the race clock started). */
  tick: number;
  /** Milliseconds since the race clock origin (the leader's crossing). */
  timeMs: number;
  /** The lap the log reads (1 in 1C — lap counting is 1E's). */
  lap: number;
  /** 'north meta' | 'south meta' | 'the straight'. */
  place: string;
  /** What happened. */
  type: 'scrape-warning' | 'hub-catch' | 'trace-strain' | 'trace-tangle' | 'wall-warning' | 'wall-scrape';
  /** The rig at fault (provisional for warnings), or null when no rig is at fault. */
  atFaultId: string | null;
  atFaultName: string | null;
  /** The other rig, or null for a wall (then `surface` names it). */
  otherId: string | null;
  otherName: string | null;
  /** For a wall: 'wall' (the outer ring — the only wall surface in 1C). */
  surface: 'wall' | null;
}

type IncidentPairKind = 'none' | 'scrape-warning' | 'hub-catch' | 'tangle-warning' | 'tangle';

interface IncidentPairState {
  kind: IncidentPairKind;
  /** When the current warning started (elapsed ms), or null. */
  warningSinceMs: number | null;
  /** When the active incident ends (elapsed ms), or 0. */
  incidentUntilMs: number;
  /** No new incident for this pair before this elapsed ms. */
  immunityUntilMs: number;
  /** The rig that last closed the lateral gap, or null when none has. */
  lastCloserId: string | null;
  /** The lateral overlap last tick (null before the first tick). */
  lastLateralOverlap: number | null;
  /** When each rig last entered the tight band at a meta (elapsed ms). */
  bandEntryMs: Map<string, number>;
  /** Each rig's u last tick (for band-entry detection). */
  lastU: Map<string, number>;
}

type IncidentWallKind = 'none' | 'warning' | 'incident';

interface IncidentWallState {
  kind: IncidentWallKind;
  /** When the current warning started (elapsed ms), or null. */
  warningSinceMs: number | null;
  /** When the active wall incident ends (elapsed ms), or 0. */
  incidentUntilMs: number;
  /** No new wall warning for this rig before this elapsed ms. */
  immunityUntilMs: number;
  /** Which surface the rig is scraping ('wall' = the outer ring). */
  surface: 'wall' | null;
}

/** The steward's whole state: one entry per rig pair, one per rig (walls). */
export interface IncidentStewardState {
  rung: RaceRungId;
  tick: number;
  pairs: Map<string, IncidentPairState>;
  walls: Map<string, IncidentWallState>;
}

export function createIncidentStewardState(rung: RaceRungId): IncidentStewardState {
  return { rung, tick: 0, pairs: new Map(), walls: new Map() };
}

export interface IncidentStewardInput {
  rigs: readonly IncidentRigPose[];
  rung: RaceRungId;
  /** Milliseconds since the race clock origin (the leader's crossing). */
  elapsedMs: number;
  /** The lap the log reads (1 in 1C — lap counting is 1E's). */
  lap: number;
  /**
   * LADDER-1D's hook (steward-level fallback): widens the tangle lateral
   * window for rigs that carry no per-rig factor; default exactly 1.0.
   * 1D's scene passes a per-rig `vulnerabilityFactor` on every pose, so
   * this is the fallback, not the path — a rig's own factor always wins.
   */
  vulnerabilityFactor?: number;
}

export interface IncidentStewardOutput {
  /** One entry per input rig (defaults when nothing applies — stale effects never stick). */
  effects: Map<string, IncidentRigEffects>;
  /** The warnings and incidents that fired on this tick (appended to the session log). */
  newLogEntries: RaceIncidentLogEntry[];
}

const clampNumber = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

/** Wrap an angle to (−π, π]. */
function wrapAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

/** The pair key: the two ids sorted, so (a, b) and (b, a) are one pair. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}<${b}` : `${b}<${a}`;
}

function createPairState(): IncidentPairState {
  return {
    kind: 'none',
    warningSinceMs: null,
    incidentUntilMs: 0,
    immunityUntilMs: 0,
    lastCloserId: null,
    lastLateralOverlap: null,
    bandEntryMs: new Map(),
    lastU: new Map(),
  };
}

function createWallState(): IncidentWallState {
  return { kind: 'none', warningSinceMs: null, incidentUntilMs: 0, immunityUntilMs: 0, surface: null };
}

/**
 * The place a position reads as in the log: a meta when the rig is in
 * one (north: z < 10, south: z ≥ 10 — the metae sit at z ≈ −27.5 and
 * z ≈ 36–42, so any split between them is exact), else the straight.
 */
/**
 * A route zone that counts as "at a meta" for tangles: 'meta' (the
 * approach half of a hairpin) and 'meta-exit' (the exit half plus the
 * short tail after it — the rigs are still turning there; see the header).
 */
function isMetaZone(zone: RivalRouteZone): boolean {
  return zone === 'meta' || zone === 'meta-exit';
}

function placeFor(zone: RivalRouteZone, z: number): string {
  if (isMetaZone(zone)) return z < 10 ? 'north meta' : 'south meta';
  return 'the straight';
}

/** The short name for a possessive ("Tiberius" from "Tiberius of the Russata"). */
function shortName(name: string): string {
  return name.split(' ')[0] ?? name;
}

/** "you" for the player, the name otherwise. */
function nameFor(id: string, name: string, playerId: string): string {
  return id === playerId ? 'you' : name;
}

/**
 * Format one log entry in plain language (design 2C item 4). The player
 * is "you"; a rival is its full name, with the short name in the
 * possessive ("Tiberius's fault"). `playerId` is the registry id of the
 * player ('player').
 */
export function formatRaceIncidentLogEntry(
  entry: RaceIncidentLogEntry,
  playerId = 'player',
): string {
  const lap = `Lap ${entry.lap}, ${entry.place}`;
  // Warnings always name both rigs (the fault is provisional); the null
  // arms below are a safety net for a malformed entry, never a display.
  const fault = entry.atFaultId === null
    ? null
    : nameFor(entry.atFaultId, entry.atFaultName ?? '', playerId);
  const other = entry.otherId === null
    ? null
    : nameFor(entry.otherId, entry.otherName ?? '', playerId);
  const pairPhrase =
    fault !== null && other !== null ? `${fault} / ${other}` : 'two rigs';
  // "(your fault)" / "(their fault)" when the player is involved, else
  // the short possessive ("Tiberius's fault").
  const faultPossessive =
    entry.atFaultId === null
      ? ''
      : entry.atFaultId === playerId
        ? 'your'
        : entry.otherId === playerId
          ? 'their'
          : `${shortName(entry.atFaultName ?? '')}'s`;
  switch (entry.type) {
    case 'scrape-warning':
      return fault !== null && other !== null
        ? `${lap}: ${fault} scraped wheels with ${other} — warning, steer clear`
        : `${lap}: ${pairPhrase} scraped wheels — warning, steer clear`;
    case 'hub-catch':
      return fault !== null && other !== null
        ? `${lap}: ${fault} caught wheels with ${other} (${faultPossessive} fault)`
        : `${lap}: ${pairPhrase} caught wheels`;
    case 'trace-strain':
      return fault !== null && other !== null
        ? `${lap}: ${fault} strained traces with ${other} — warning, give room`
        : `${lap}: ${pairPhrase} strained traces — warning, give room`;
    case 'trace-tangle':
      return fault !== null && other !== null
        ? `${lap}: ${fault} tangled with ${other} (${faultPossessive} fault)`
        : `${lap}: ${pairPhrase} tangled`;
    case 'wall-warning':
      return `${lap}: ${fault ?? 'a rig'} scraped the wall — warning, steer clear`;
    case 'wall-scrape':
      return `${lap}: ${fault ?? 'a rig'} hit the wall`;
    default:
      return `${lap}: ${fault ?? 'a rig'} — incident`;
  }
}

/**
 * The outward steer bias for a tangled rig: the steer that turns it away
 * from the meta's apex (north apex: the hairpin's turn centre at
 * RACE_NORTH_TURN_Z − 5.5; south apex: the spina tip). Signed by the
 * movement module's convention (steer +1 is the driver's right, which
 * decreases the heading), scaled by `tangleSteerBias` (half deflection).
 * A rig already heading outward gets ~0 — the drift only fights a rig
 * still holding the tight line.
 */
function outwardSteerBias(pose: IncidentRigPose): number {
  const apexZ = pose.meta === 'north'
    ? RACE_NORTH_TURN_Z - 5.5
    : SPINA_TIP_BOX.zMax;
  const ox = pose.x - CIRCUS_AXIS_X;
  const oz = pose.z - apexZ;
  const len = Math.hypot(ox, oz);
  if (len < 1e-6) return 0;
  const nx = ox / len;
  const nz = oz / len;
  // The heading whose forward (−sin θ, −cos θ) is the outward direction.
  const desiredHeading = Math.atan2(-nx, -nz);
  let err = desiredHeading - pose.heading;
  while (err > Math.PI) err -= 2 * Math.PI;
  while (err < -Math.PI) err += 2 * Math.PI;
  return clampNumber(-err * 2, -1, 1) * RACE_INCIDENT_CONFIG.tangleSteerBias;
}

/**
 * The wall clearance for one rig: the BODY probe's distance to spare
 * against the ring boundary — 0 is touching, negative is through.
 * Body-only, ring-only, by measurement (see the header): the driven
 * route centreline passes through the spina tip box, and the nose probe
 * dips outside the ring at the hook exit — either would false-positive
 * every lap at the south hook. The body-vs-ring measure is clean on the
 * whole route.
 */
function wallClearance(pose: IncidentRigPose): { clearance: number; surface: 'wall' } {
  return {
    clearance: distanceToDriveableBoundary(pose.x, pose.z) - CHARIOT_MOVEMENT.bodyRadius,
    surface: 'wall',
  };
}

/**
 * One steward tick: evaluate every pair of rigs (League only) and every
 * rig's wall (both rungs), from poses only. The state is mutated in
 * place (the driver works the same way); the outputs are fresh every
 * tick, so a rig's effects always reflect this tick and nothing else.
 *
 * The order is the design's: tangles first at a meta (the meta-specific
 * incident), wheel contact elsewhere; a pair holds at most one warning
 * or incident at a time, and an active incident runs to its duration
 * before the pair can warn again.
 */
export function stepIncidentSteward(
  state: IncidentStewardState,
  input: IncidentStewardInput,
): IncidentStewardOutput {
  const config = RACE_INCIDENT_CONFIG;
  const { rigs, elapsedMs, lap } = input;
  const rung = input.rung;
  // LADDER-1D: the steward-level factor is the fallback for rigs that carry
  // no per-rig factor (1C's tests pass it). A rig's own factor always wins;
  // the pair's factor is the max of the two rigs', resolved in the pair
  // loop below — either tired rig widens the pair's window.
  const stewardVulnerability = Number.isFinite(input.vulnerabilityFactor) && (input.vulnerabilityFactor ?? 1) > 0
    ? (input.vulnerabilityFactor as number)
    : 1;
  const vulnerabilityOf = (rig: IncidentRigPose): number =>
    Number.isFinite(rig.vulnerabilityFactor) && (rig.vulnerabilityFactor ?? 1) > 0
      ? (rig.vulnerabilityFactor as number)
      : stewardVulnerability;
  state.tick += 1;
  const tick = state.tick;
  const effects = new Map<string, IncidentRigEffects>();
  for (const rig of rigs) effects.set(rig.id, { ...DEFAULT_INCIDENT_RIG_EFFECTS });
  const newLogEntries: RaceIncidentLogEntry[] = [];
  const immune = elapsedMs < config.startImmunityMs;

  const applyEffect = (id: string, patch: Partial<IncidentRigEffects>): void => {
    const current = effects.get(id);
    if (!current) return;
    // A rig in two pairs keeps the worst drag, the strongest warning
    // (initiator beats innocent), and the first tangle's steer.
    const next: IncidentRigEffects = {
      warning:
        patch.warning === 'initiator' || current.warning === 'initiator'
          ? 'initiator'
          : patch.warning ?? current.warning,
      warningKind: patch.warningKind ?? current.warningKind,
      dragScale: Math.max(current.dragScale, patch.dragScale ?? 1),
      steerScale: patch.steerScale !== undefined && current.steerScale === 1
        ? patch.steerScale
        : current.steerScale,
      steerBias: current.steerBias !== 0 ? current.steerBias : (patch.steerBias ?? 0),
    };
    // warningKind precedence: tangle > scrape > wall (the most severe wins).
    const rank = (kind: IncidentRigEffects['warningKind']): number =>
      kind === 'tangle' ? 3 : kind === 'scrape' ? 2 : kind === 'wall' ? 1 : 0;
    if (rank(patch.warningKind ?? null) < rank(current.warningKind)) {
      next.warningKind = current.warningKind;
    }
    effects.set(id, next);
  };

  const logEntry = (
    type: RaceIncidentLogEntry['type'],
    place: string,
    atFault: IncidentRigPose | null,
    other: IncidentRigPose | null,
    surface: 'wall' | null,
  ): void => {
    newLogEntries.push({
      tick,
      timeMs: Math.round(elapsedMs),
      lap,
      place,
      type,
      atFaultId: atFault?.id ?? null,
      atFaultName: atFault?.name ?? null,
      otherId: other?.id ?? null,
      otherName: other?.name ?? null,
      surface,
    });
  };

  // ── Walls: every rig, both rungs (District's self-inflicted incidents) ──
  for (const rig of rigs) {
    const wallState = state.walls.get(rig.id) ?? createWallState();
    state.walls.set(rig.id, wallState);
    if (immune || elapsedMs < wallState.immunityUntilMs) continue;
    // An active wall incident runs to its duration, then the rig is immune
    // for 1 s — the hub catch's pattern. Nothing new is evaluated while
    // it runs, and steering clear does not cut it short.
    if (wallState.kind === 'incident') {
      if (elapsedMs < wallState.incidentUntilMs) {
        applyEffect(rig.id, { dragScale: config.wallDragScale });
        continue;
      }
      wallState.kind = 'none';
      wallState.warningSinceMs = null;
      wallState.incidentUntilMs = 0;
      wallState.surface = null;
      wallState.immunityUntilMs = elapsedMs + config.postIncidentImmunityMs;
      continue;
    }
    const { clearance, surface } = wallClearance(rig);
    const place = placeFor(rig.zone, rig.z);
    if (clearance < config.wallScrapeMargin) {
      if (wallState.kind === 'none') {
        wallState.kind = 'warning';
        wallState.warningSinceMs = elapsedMs;
        wallState.surface = surface;
        logEntry('wall-warning', place, rig, null, surface);
      } else if (
        wallState.kind === 'warning' &&
        wallState.warningSinceMs !== null &&
        elapsedMs - wallState.warningSinceMs >= config.warningDurationMs &&
        clearance <= config.wallTouchEpsilon
      ) {
        wallState.kind = 'incident';
        wallState.incidentUntilMs = elapsedMs + config.wallIncidentDurationMs;
        logEntry('wall-scrape', place, rig, null, surface);
      }
      if (wallState.kind === 'warning') {
        applyEffect(rig.id, { warningKind: 'wall' });
      } else if (wallState.kind === 'incident') {
        applyEffect(rig.id, { dragScale: config.wallDragScale });
      }
    } else if (wallState.kind === 'warning') {
      // A warning clears with no incident when the rig steers clear.
      wallState.kind = 'none';
      wallState.warningSinceMs = null;
      wallState.surface = null;
    }
  }

  // ── Rig-vs-rig: League only (District is self-inflicted only, A6) ──
  if (rung === 'league') {
    for (let i = 0; i < rigs.length; i += 1) {
      for (let j = i + 1; j < rigs.length; j += 1) {
        const a = rigs[i];
        const b = rigs[j];
        const pairState = state.pairs.get(pairKey(a.id, b.id)) ?? createPairState();
        state.pairs.set(pairKey(a.id, b.id), pairState);

        // The pair's geometry, from the same circle test the resolver
        // uses: the deepest overlapping pair decides. A lateral contact
        // is one whose push is mostly lateral (a side-by-side interlock);
        // a nose-to-tail brush pushes mostly longitudinally and is NOT
        // wheel contact — the follow cap and the separation already own
        // it. (A width-only measure would fire for a rig directly behind
        // another, whose lateral distance is 0.) The alongside gate keeps
        // it to true side-by-side: the bodies overlap longitudinally.
        const sep = resolveRigSeparation(
          { x: a.x, z: a.z, heading: a.heading },
          { x: b.x, z: b.z, heading: b.heading },
        );
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const avgHeading = a.heading + wrapAngle(b.heading - a.heading) / 2;
        const fx = -Math.sin(avgHeading);
        const fz = -Math.cos(avgHeading);
        // Lateral unit: (fz, −fx) is a perpendicular of the forward (fx, fz).
        const lx = fz;
        const lz = -fx;
        const longitudinal = dx * fx + dz * fz;
        const alongside = Math.abs(longitudinal) < RIVAL_RIG_LENGTH;
        const matchedSpeed = Math.abs(a.speed - b.speed) <= config.matchedSpeedWindow;
        let lateralOverlap = 0;
        if (sep !== null) {
          const pushLateral = Math.abs(sep.pushA.x * lx + sep.pushA.z * lz);
          const pushLong = Math.abs(sep.pushA.x * fx + sep.pushA.z * fz);
          if (pushLateral > pushLong) lateralOverlap = sep.overlap;
        }

        // Fault: who closed the lateral gap last. The gap is the rigs'
        // lateral offset from the route (|uA − uB|); the closer is the rig
        // whose u moved further toward the other's since last tick. The
        // route frame is what makes this asymmetric — a rig holding its
        // lane has ~0 lateral velocity in it, while a rig steering into
        // the other has plenty — and the resolver's push can only open a
        // gap, never close one, so a rig shoved apart is never blamed.
        // The closer resets when the pair separates, so an old encounter
        // never blames a new one.
        const gapU = Math.abs(a.u - b.u);
        const prevUA = pairState.lastU.get(a.id);
        const prevUB = pairState.lastU.get(b.id);
        if (prevUA !== undefined && prevUB !== undefined) {
          const prevGapU = Math.abs(prevUA - prevUB);
          if (gapU < prevGapU - 1e-9) {
            const closingA = (a.u - prevUA) * Math.sign(b.u - a.u);
            const closingB = (b.u - prevUB) * Math.sign(a.u - b.u);
            if (closingA > 0.001 && closingA >= closingB) pairState.lastCloserId = a.id;
            else if (closingB > 0.001) pairState.lastCloserId = b.id;
          }
        }
        if (lateralOverlap <= 0 || !alongside) pairState.lastCloserId = null;
        pairState.lastLateralOverlap = lateralOverlap;

        // Tight-band entries, for the tangle's fault: the rig that entered
        // the occupied tight band last. Entry = u crossing into the band
        // while at a meta; re-entry re-stamps the time.
        for (const rig of [a, b]) {
          const wasTight = pairState.lastU.get(rig.id);
          if (isMetaZone(rig.zone) && rig.u >= config.tightBandU && (wasTight === undefined || wasTight < config.tightBandU)) {
            pairState.bandEntryMs.set(rig.id, elapsedMs);
          }
          pairState.lastU.set(rig.id, rig.u);
        }

        // An active incident runs to its duration, then the pair is immune
        // for 1 s. Nothing new is evaluated while it runs.
        if (pairState.kind === 'hub-catch' || pairState.kind === 'tangle') {
          if (elapsedMs < pairState.incidentUntilMs) {
            applyIncidentEffects(a, b, pairState);
            continue;
          }
          pairState.kind = 'none';
          pairState.warningSinceMs = null;
          pairState.incidentUntilMs = 0;
          pairState.immunityUntilMs = elapsedMs + config.postIncidentImmunityMs;
        }
        if (immune || elapsedMs < pairState.immunityUntilMs) continue;

        const place = placeFor(
          isMetaZone(a.zone) ? a.zone : b.zone,
          (a.z + b.z) / 2,
        );
        const closerRig = pairState.lastCloserId === a.id ? a : pairState.lastCloserId === b.id ? b : null;
        // Provisional fault for a warning entry: the last gap-closer, or
        // the first-listed rig when no closer was ever recorded (the pair
        // formed already overlapping). A warning's fault is provisional —
        // the incident's fault is decided when it fires.
        const provisionalFault = closerRig ?? a;
        const provisionalOther = provisionalFault === a ? b : a;
        // The tangle's fault, decided at fire time: the rig that entered
        // the occupied tight band last; ties fall back to the last
        // gap-closer, then the deeper line.
        const tangleFault = (): IncidentRigPose => {
          const entryA = pairState.bandEntryMs.get(a.id) ?? -Infinity;
          const entryB = pairState.bandEntryMs.get(b.id) ?? -Infinity;
          if (entryA !== entryB) return entryA > entryB ? a : b;
          if (closerRig !== null) return closerRig;
          return a.u >= b.u ? a : b;
        };

        // Tangle first (the meta-specific incident): both rigs on the
        // tight line at a meta, within the lateral window, abreast.
        // LADDER-1D: the pair's window is the max of the two rigs'
        // factors — either tired rig widens it; a fresh pair reads
        // exactly the shipped window.
        const alongRouteGap = Math.abs(
          (a.lap * RACE_ROUTE_LENGTH + a.s) - (b.lap * RACE_ROUTE_LENGTH + b.s),
        );
        const pairVulnerability = Math.max(vulnerabilityOf(a), vulnerabilityOf(b));
        const tangleWindow = config.tangleLateralWindow * pairVulnerability;
        const tangleHolds =
          isMetaZone(a.zone) &&
          isMetaZone(b.zone) &&
          a.u >= config.tightBandU &&
          b.u >= config.tightBandU &&
          Math.abs(a.u - b.u) <= tangleWindow &&
          alongRouteGap < config.tangleAlongsideGap;
        if (tangleHolds) {
          // A scrape warning converts to a tangle warning (same clock —
          // the warning has already run, so the fairness rule is kept),
          // and the conversion is logged: the warning the player sees is
          // now a trace strain, not a wheel scrape.
          if (pairState.kind === 'scrape-warning') {
            pairState.kind = 'tangle-warning';
            logEntry('trace-strain', place, provisionalFault, provisionalOther, null);
          }
          if (pairState.kind === 'none') {
            pairState.kind = 'tangle-warning';
            pairState.warningSinceMs = elapsedMs;
            logEntry('trace-strain', place, provisionalFault, provisionalOther, null);
          } else if (
            pairState.kind === 'tangle-warning' &&
            pairState.warningSinceMs !== null &&
            elapsedMs - pairState.warningSinceMs >= config.warningDurationMs
          ) {
            const fault = tangleFault();
            const innocent = fault === a ? b : a;
            pairState.kind = 'tangle';
            pairState.incidentUntilMs = elapsedMs + config.tangleDurationMs;
            logEntry('trace-tangle', place, fault, innocent, null);
            applyIncidentEffects(a, b, pairState, fault);
          } else if (pairState.kind === 'tangle-warning') {
            applyEffect(provisionalFault.id, { warning: 'initiator', warningKind: 'tangle', dragScale: config.scrapeDragScale });
            applyEffect(provisionalOther.id, { warning: 'innocent', warningKind: 'tangle', dragScale: config.scrapeDragScale });
          }
          continue;
        }

        // Wheel contact: lateral overlap past the scrape threshold, the
        // rigs alongside, speeds close.
        const scrapeHolds = lateralOverlap > config.scrapeLateralOverlap && alongside && matchedSpeed;
        if (scrapeHolds) {
          // A tangle warning converts back to a scrape warning (same
          // clock) when the pair leaves the meta still scraping.
          if (pairState.kind === 'tangle-warning') pairState.kind = 'scrape-warning';
          if (pairState.kind === 'none') {
            pairState.kind = 'scrape-warning';
            pairState.warningSinceMs = elapsedMs;
            logEntry('scrape-warning', place, provisionalFault, provisionalOther, null);
          } else if (
            pairState.kind === 'scrape-warning' &&
            pairState.warningSinceMs !== null &&
            elapsedMs - pairState.warningSinceMs >= config.warningDurationMs &&
            lateralOverlap >= config.hubCatchLateralOverlap &&
            closerRig !== null
          ) {
            const innocent = closerRig === a ? b : a;
            pairState.kind = 'hub-catch';
            pairState.incidentUntilMs = elapsedMs + config.hubCatchDurationMs;
            logEntry('hub-catch', place, closerRig, innocent, null);
            applyIncidentEffects(a, b, pairState, closerRig);
          } else if (pairState.kind === 'scrape-warning') {
            applyEffect(provisionalFault.id, { warning: 'initiator', warningKind: 'scrape', dragScale: config.scrapeDragScale });
            applyEffect(provisionalOther.id, { warning: 'innocent', warningKind: 'scrape', dragScale: config.scrapeDragScale });
          }
          continue;
        }

        // Neither condition holds: a warning clears with no incident.
        if (pairState.kind === 'scrape-warning' || pairState.kind === 'tangle-warning') {
          pairState.kind = 'none';
          pairState.warningSinceMs = null;
        }
      }
    }
  }

  return { effects, newLogEntries };

  /** The effects of an active hub-catch or tangle, from the pair state. */
  function applyIncidentEffects(
    a: IncidentRigPose,
    b: IncidentRigPose,
    pairState: IncidentPairState,
    faultOverride?: IncidentRigPose,
  ): void {
    if (pairState.kind === 'hub-catch') {
      const fault = faultOverride ?? (pairState.lastCloserId === a.id ? a : pairState.lastCloserId === b.id ? b : null);
      if (fault === null) return;
      const innocent = fault === a ? b : a;
      applyEffect(fault.id, { warning: 'none', dragScale: RACE_INCIDENT_CONFIG.hubCatchDragScale });
      applyEffect(innocent.id, { warning: 'none', dragScale: RACE_INCIDENT_CONFIG.scrapeDragScale });
    } else if (pairState.kind === 'tangle') {
      const entryA = pairState.bandEntryMs.get(a.id) ?? -Infinity;
      const entryB = pairState.bandEntryMs.get(b.id) ?? -Infinity;
      const fault = faultOverride ?? (entryA !== entryB ? (entryA > entryB ? a : b) : a.u >= b.u ? a : b);
      const innocent = fault === a ? b : a;
      applyEffect(fault.id, {
        warning: 'none',
        dragScale: RACE_INCIDENT_CONFIG.tangleDragScale,
        steerScale: RACE_INCIDENT_CONFIG.tangleSteerScale,
        steerBias: outwardSteerBias(fault),
      });
      applyEffect(innocent.id, { warning: 'none', dragScale: RACE_INCIDENT_CONFIG.scrapeDragScale });
    }
  }
}

/**
 * LADDER-1C — the meta zone for one rig, from the circuit's own data:
 * the route zone at its route distance (the 1B2 analysis, cached per
 * side), plus which meta it is in by position. The scene calls this per
 * rig per frame; the analysis lookup is cached, so it is a lookup, not
 * a build.
 */
export function incidentZoneForRig(side: 1 | -1, s: number, z: number): {
  zone: RivalRouteZone;
  meta: 'north' | 'south' | null;
} {
  const zone = routeZoneAt(analyzeRivalRoute(side), s);
  return { zone, meta: isMetaZone(zone) ? (z < 10 ? 'north' : 'south') : null };
}
