/**
 * Living City L11 — the ONE visitor encounter transaction.
 *
 * The L10 schedule (`utils/visitorSchedule.ts`) answers which visitors are in the
 * city and what each brings. Nothing until now could write either history field,
 * and this module is the only thing that writes `seenVisitors`: meeting a visitor
 * is a real player action, so it earns a real profile write, through the same
 * pure-helper shape every other Living City transaction uses
 * (`storefrontPurchase`, `restRecovery`, `trainingSession`):
 *
 *   • **one base, one decision.** Every check reads the caller's profile and the
 *     transaction returns a NEW profile on success, or a refusal reason with the
 *     caller's own object untouched — a refusal can never record a visit;
 *   • **checks before the commit, in a fixed order** — the profile, the catalogue,
 *     then the L10 schedule itself (so a visitor who is not in the city today
 *     cannot be met), and nothing is written until all of them pass;
 *   • **the day is the schedule's own.** This module owns no clock, starts no
 *     timer, reads no wall clock and never advances the day: an encounter costs no
 *     time. The day only moves on a settled duel (or, by the L9 rule, on a rest at
 *     the Medical House — never here).
 *
 * WHAT "SEEN" MEANS. Selecting a visitor in the city's visitor panel is a
 * meaningful encounter, and that is exactly the moment the one write happens.
 * Being seen is NOT being done: this module never writes `completedVisitors`, and
 * the schedule deliberately keeps listing a seen visitor on the days it arrives
 * (see the L10 record). Completion — the action that excludes a visitor
 * permanently — is NOT implemented here: the roadmap does not define what
 * completes a visit, and a phase that needs it must decide that first rather than
 * let a UI convenience invent a permanent history entry.
 *
 * Scope: no purchase, no reward, no cost, no inventory change, no day change, no
 * progression gate, and no separate visitor economy. The offer is only READ (for
 * display), never transacted.
 */

import type { CityState, PlayerProfile } from '../types/game';
import { getItemById, type GameItem } from '../data/itemsDB';
import { getChariotPart, type ChariotPart } from '../data/chariotParts';
import { getVisitor, type Visitor } from '../data/visitors';
import { readSeenVisitors, resolveVisitorSchedule } from './visitorSchedule';

/** Why an encounter was refused. `ok: true` never carries a reason. */
export type VisitorEncounterRejectionReason = 'no-profile' | 'unknown-visitor' | 'not-in-town';

/**
 * `recorded` distinguishes the FIRST encounter from a repeat: a visitor already
 * in `seenVisitors` answers `ok: true, recorded: false` and the caller's own
 * profile object, so a second tap, a stale callback or a re-render cannot append
 * a duplicate entry or trigger a second save.
 */
export type VisitorEncounterResult =
  | { ok: true; profile: PlayerProfile; recorded: boolean }
  | { ok: false; reason: VisitorEncounterRejectionReason };

/**
 * The profile's `city` object, or `{}` when the field is absent or is not a plain
 * object — the same total rule `cityClock` / `storefrontPurchase` apply, repeated
 * so a hand-edited save can never be spread into the profile this returns.
 */
function readCity(profile: PlayerProfile | null | undefined): CityState {
  const city = profile?.city;
  if (!city || typeof city !== 'object' || Array.isArray(city)) return {};
  return city;
}

/**
 * Whether this visitor can be met on the profile's current city day: inside its
 * inclusive arrival window, passing the L10 cadence rule, and not completed. The
 * schedule already answers all three, so this is a read of it rather than a
 * second rule that could disagree with it.
 */
export function isVisitorInTown(
  profile: PlayerProfile | null | undefined,
  visitorId: string
): boolean {
  return resolveVisitorSchedule(profile).arrivals.some(
    (arrival) => arrival.visitor.id === visitorId
  );
}

/**
 * One visitor's encounter view for the day the profile is on: the catalogue
 * entry, its offer id, the catalogue item that id resolves to (for display), and
 * whether this profile has met them before. `null` when the visitor is not in the
 * city today — a completed, out-of-window or absent visitor reads exactly like one
 * the catalogue does not host, so a stale panel row can never describe a visitor
 * the schedule no longer lists.
 */
export interface VisitorEncounterView {
  visitor: Visitor;
  /** The one `ITEMS_DB` id on offer today, or `null` when the day's pick is a part. */
  offerItemId: string | null;
  /** The catalogue item `offerItemId` names, or `null` when it names none. */
  item: GameItem | null;
  /**
   * L16B — the one chariot-part id on offer today, or `null` when the day's pick is
   * an item. Read from the same schedule resolution, so the panel cannot describe
   * an offer the transaction would refuse.
   */
  offerPartId: string | null;
  /** The catalogue part `offerPartId` names, or `null` when it names none. */
  part: ChariotPart | null;
  /** True when this profile has already met the visitor (history only). */
  seen: boolean;
}

export function resolveVisitorEncounter(
  profile: PlayerProfile | null | undefined,
  visitorId: string
): VisitorEncounterView | null {
  const arrival = resolveVisitorSchedule(profile).arrivals.find(
    (candidate) => candidate.visitor.id === visitorId
  );
  if (!arrival) return null;

  return {
    visitor: arrival.visitor,
    offerItemId: arrival.offerItemId,
    item: arrival.offerItemId ? getItemById(arrival.offerItemId) ?? null : null,
    offerPartId: arrival.offerPartId,
    part: arrival.offerPartId ? getChariotPart(arrival.offerPartId) ?? null : null,
    seen: readSeenVisitors(profile).includes(visitorId),
  };
}

/**
 * Record that the player has MET this visitor. The ONE write of `seenVisitors`.
 *
 * Returns a NEW profile with the id appended to `city.seenVisitors` — deduplicated
 * against what the save already holds, and with every other profile and city field
 * carried over untouched (`day`, `restDay`, `merchantPurchaseDay`, and
 * `completedVisitors` above all) — or a refusal that leaves the caller's profile
 * exactly as it was. `completedVisitors` is never written here: meeting a visitor
 * is not completing them.
 */
export function recordVisitorEncounter(
  profile: PlayerProfile | null | undefined,
  visitorId: string
): VisitorEncounterResult {
  if (!profile) return { ok: false, reason: 'no-profile' };
  if (!getVisitor(visitorId)) return { ok: false, reason: 'unknown-visitor' };
  if (!isVisitorInTown(profile, visitorId)) return { ok: false, reason: 'not-in-town' };

  const seen = readSeenVisitors(profile);
  if (seen.includes(visitorId)) return { ok: true, profile, recorded: false };

  return {
    ok: true,
    recorded: true,
    profile: {
      ...profile,
      // The city object is rebuilt from the stored one, so the day and the other
      // Living City records ride across untouched; only the history list changes.
      city: { ...readCity(profile), seenVisitors: [...seen, visitorId] },
    },
  };
}
