/**
 * Living City L17 — where the scheduled visitors STAND, and which one the player
 * is talking to.
 *
 * L10 decided WHO is in the city on a day (`utils/visitorSchedule`, a pure
 * function of the saved city day and `completedVisitors`); L11 and L12 gave a
 * visitor a meeting and a trade through the panel. Until L17 a visitor existed
 * only in that panel — the city itself had no body for them. This module is the
 * missing half of the same fact, and nothing more:
 *
 *   • `VISITOR_STALLS` is a FROZEN, code-defined table of the one place each
 *     catalogue visitor keeps in the city. It is data: no clock, no storage, no
 *     React, no randomness, and no entry for any id the catalogue does not list.
 *   • `resolveVisitorPresence(profile)` is the ONE answer to "who is standing in
 *     the city right now, and where" — the L10 arrivals, joined to the stall table,
 *     with the day's offer carried along so a caller never looks it up again.
 *   • `resolveVisitorTarget(pos, presence, hub)` is the ONE interaction-selection
 *     rule for a visitor: inside their own disc, and STRICTLY nearer than the hub
 *     the player is also standing in. A tie keeps the hub.
 *
 * WHAT IT IS NOT. It persists nothing, advances no day, records no encounter and
 * sells nothing. Being near a visitor only raises a prompt; the panel's explicit
 * selection is still the only thing that writes `seenVisitors`, and the L12
 * purchase is still the only thing that writes `completedVisitors` and gold — and
 * both re-validate against the newest profile themselves, so a stale body in the
 * world can never make a finished trade possible. The schedule is DERIVED from the
 * profile, so a visitor who leaves town (the day turns) or completes their trade
 * disappears from here in the same render that changed the profile.
 *
 * The stalls are deliberately NOT `HUB_LOCATIONS` entries and NOT colliders: they
 * are people standing in the street, not doors, so they add no fast-travel entry,
 * no district, no ambient-audio zone and no collision shape. Every anchor is
 * measured against the real registry and the real hub discs in
 * `visitorPresence.test.ts`.
 *
 * Pure: no storage, no React, no timers, no wall clock, no randomness, no
 * mutation of anything it is handed.
 */

import type { CityState } from '../types/game';
import type { Visitor } from '../data/visitors';
import { resolveVisitorSchedule } from './visitorSchedule';

/** The little of a profile this module needs: the schedule reads `city`. */
type CityCarrier = { city?: CityState };

/**
 * One visitor's pitch in the city: a fixed world anchor (X/Z on the flat city
 * ground) and the yaw they stand at. `facing` is the same `rotationY` the scene
 * applies to a character, so 0 faces +Z, +π/2 faces +X, and so on.
 */
export interface VisitorStall {
  readonly x: number;
  readonly z: number;
  readonly facing: number;
}

/**
 * The three stalls, keyed by the catalogue's own ids — frozen, because a stall is
 * level design, not state. The scene only ever READS this table, and an id with no
 * entry here simply has nobody standing in the city.
 *
 * The audited candidate anchors were:
 *   `numidian_bladesmith`   (−6, 18)      — kept
 *   `campanian_armorer`     (15, −6)      — MOVED to (12.5, −6.5), see below
 *   `emesan_weapon_trader`  (6.5, −3.5)   — kept
 *
 * MEASURED REASON FOR THE ONE MOVE. At (15, −6) the armorer's interaction disc
 * (radius 2.5) contained the Bazaar & General Store's own fast-travel arrival
 * `[17, −5]` at 2.236, so arriving at the bazaar would have raised the armorer's
 * prompt instead of the store's; the disc also reached 0.679 into that hub's own
 * interaction disc while the arrival sits only 5.000 from the store's centre, so
 * the armorer out-ranked the store's door there. (12.5, −6.5) is 5.656 from the
 * arrival, keeps the whole 2.5 disc standable, and overlaps no hub disc at all.
 * Everything else in the table is the audit's own value, re-verified rather than
 * assumed.
 */
export const VISITOR_STALLS: Readonly<Record<string, VisitorStall>> = Object.freeze({
  // West side of the gate avenue, facing the road and the Monumental Gate.
  numidian_bladesmith: Object.freeze({ x: -6, z: 18, facing: Math.PI / 2 }),
  // The market street west of the bazaar, facing back toward the plaza.
  campanian_armorer: Object.freeze({ x: 12.5, z: -6.5, facing: -Math.PI / 3 }),
  // The open plaza's north side, facing the spawn avenue.
  emesan_weapon_trader: Object.freeze({ x: 6.5, z: -3.5, facing: -Math.PI / 4 }),
});

/**
 * How close the player must stand to a visitor for the prompt to appear. Smaller
 * than every building's interaction disc on purpose: a person is a person, not a
 * doorway, and this is the radius the discs were measured at (2.5 keeps each disc
 * entirely on walkable ground and clear of every hub's own approach ring).
 */
export const VISITOR_INTERACTION_RADIUS = 2.5;

/**
 * The dye that distinguishes a visitor from an ambient extra: the same fighter
 * factory and the same `GladiatorMesh`, dressed in a deep indigo tunic with a gold
 * crest instead of the extras' undyed brown. Reused as colours only — no new
 * material, asset or animation system — and they also dress the procedural
 * fallback, which is the one path where a tunic colour is drawn explicitly.
 */
export const VISITOR_TUNIC_COLOR = '#2b3a67';
export const VISITOR_CREST_COLOR = '#d4a017';

/** One visitor standing in the city today. */
export interface VisitorPresence {
  /** The catalogue entry — the name, the title and the id the panel keys on. */
  readonly visitor: Visitor;
  /** The one `ITEMS_DB` id on offer today (from the schedule), or `null`. */
  readonly offerItemId: string | null;
  /** Where they stand. */
  readonly stall: VisitorStall;
}

/**
 * A stall, if the table really has one for this id and its numbers are usable.
 * Total: an unknown id, a missing entry or a hand-edited `NaN` answers `undefined`
 * so no body is rendered for it.
 */
function readStall(
  stalls: Readonly<Record<string, VisitorStall>>,
  visitorId: string
): VisitorStall | undefined {
  const stall = stalls[visitorId];
  if (!stall || typeof stall !== 'object') return undefined;
  const { x, z, facing } = stall;
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(facing)) return undefined;
  return stall;
}

/**
 * Who is standing in the city right now, in the schedule's own (catalogue) order.
 *
 * `resolveVisitorSchedule(profile)` is the single source of truth for the day and
 * the arrivals — this function joins it to the stall table and changes nothing
 * about it: a completed visitor is already absent from the schedule, a
 * seen-but-not-completed visitor is still present, and a legacy save reads day 1.
 * A visitor with no usable stall is skipped rather than guessed at. The table is a
 * parameter so that total rule is exercisable (the suite hands it a partial one);
 * production always reads the frozen `VISITOR_STALLS`.
 */
export function resolveVisitorPresence(
  profile?: CityCarrier | null,
  stalls: Readonly<Record<string, VisitorStall>> = VISITOR_STALLS
): VisitorPresence[] {
  const presence: VisitorPresence[] = [];
  for (const arrival of resolveVisitorSchedule(profile).arrivals) {
    const stall = readStall(stalls, arrival.visitor.id);
    if (!stall) continue;
    presence.push({ visitor: arrival.visitor, offerItemId: arrival.offerItemId, stall });
  }
  return presence;
}

/** The visitor the player may speak to, and how far away they are. */
export interface VisitorTarget {
  readonly presence: VisitorPresence;
  readonly distance: number;
}

/** The distance the interaction rule compares, in the city's own X/Z plane. */
function planDistance(
  from: readonly [number, number, number],
  to: { readonly x: number; readonly z: number }
): number {
  return Math.hypot(from[0] - to.x, from[2] - to.z);
}

/**
 * The ONE interaction-selection rule for visitors.
 *
 *  1. Only a visitor whose own disc contains the player is eligible, and the
 *     NEAREST eligible one wins — the same "nearest, not first match" rule the
 *     hub scan adopted in C-8.47. An exact tie between two visitors keeps the
 *     earlier entry in the presence list (catalogue order).
 *  2. When the player is ALSO inside a hub's interaction disc, the visitor is the
 *     active target only if they are STRICTLY nearer than that hub's centre. A
 *     tie — or a nearer hub — answers `null`, which leaves the hub's established
 *     behaviour exactly as it was. This is what keeps a stall from hijacking a
 *     doorway prompt: the hub object handed in is the very one
 *     `getNearbyHubLocation` answered, so no second hub rule exists here.
 *  3. Out of range (or a non-finite position) answers `null`: no target at all.
 */
export function resolveVisitorTarget(
  pos: readonly [number, number, number],
  presence: readonly VisitorPresence[],
  competingHub?: { readonly position: readonly [number, number, number] } | null
): VisitorTarget | null {
  let nearest: VisitorTarget | null = null;
  for (const entry of presence) {
    const distance = planDistance(pos, entry.stall);
    if (!Number.isFinite(distance) || distance > VISITOR_INTERACTION_RADIUS) continue;
    // Strictly nearer only, so an exact tie keeps the earlier presence entry.
    if (!nearest || distance < nearest.distance) nearest = { presence: entry, distance };
  }
  if (!nearest) return null;

  if (competingHub) {
    const hubDistance = Math.hypot(
      pos[0] - competingHub.position[0],
      pos[2] - competingHub.position[2]
    );
    // A tie (to float precision) belongs to the hub: the player was already being
    // offered the hub's action before visitors had bodies.
    if (!Number.isFinite(hubDistance) || nearest.distance >= hubDistance - 1e-9) return null;
  }

  return nearest;
}

/** The prompt the active visitor raises. Presentation only — no rule reads it. */
export function visitorPrompt(target: VisitorTarget): string {
  return `Speak with ${target.presence.visitor.name}`;
}
