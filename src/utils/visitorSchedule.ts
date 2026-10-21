/**
 * L10 (Living City) — the visitor schedule: the ONE deterministic answer to
 * "which visitors are in the city on this city day, and what is each offering?".
 *
 * The Living City discovery audit (`AGENTS.md`) states the rule verbatim: "a
 * visitor is active when `fnv1a(`${day}:${visitorId}`) % cadence === 0` inside
 * its own window, and its offers are resolved by the same slot hash; completion
 * is recorded in `completedVisitors` and excludes it permanently." This module
 * is that rule and nothing else, on top of the two layers that already exist:
 *
 *   - the day is `resolveCityDay(profile)` from `utils/cityClock.ts` — the one
 *     clock. `scheduleVisitorDay` also takes an explicit day (normalized through
 *     the same `normalizeCityDay`) for a caller that already has one. There is no
 *     second clock, no wall clock, no timer and no randomness, so the same day
 *     always produces the same arrivals — after a reload, on another device, and
 *     on a local or a Drive save alike. Nothing is persisted: the schedule is
 *     DERIVED from the saved day, so it cannot drift from it;
 *   - the offer is `selectDailyWindow(pool, 1, visitorId, day)` from
 *     `utils/cityRotation.ts` — the L2 rotation, reused rather than reimplemented,
 *     so a visitor's offer is as stable as a shop's stock and no second hash
 *     exists to disagree with it.
 *
 * WHAT IT IS NOT. It never writes a profile: `seenVisitors` and `completedVisitors`
 * are READ, defensively, and only completion removes a visitor from the schedule.
 * Being seen is not being done — the roadmap records completion separately — so a
 * visitor in `seenVisitors` is still scheduled on the days it arrives. This phase
 * implements no visit, no purchase, no inventory change, no reward and no UI:
 * the later visitor-action transaction is the only thing that may write either
 * history field.
 *
 * The module is PURE — no storage, no React, no timer, no wall clock, no
 * randomness — and it only ever SELECTS from the catalogue it is handed,
 * deduplicated by id, so a schedule can never name a visitor that does not exist.
 */

import { VISITORS, VISITOR_OFFER_SLOTS, type Visitor } from '../data/visitors';
import type { CityState } from '../types/game';
import { normalizeCityDay, resolveCityDay } from './cityClock';
import { selectDailyWindow } from './cityRotation';

/** The little of a profile this module needs: both fields live on `city`. */
type CityCarrier = { city?: CityState };

/** One visitor in the city on one day, with the single item it offers that day. */
export interface VisitorArrival {
  /** The catalogue entry, so a caller never has to look the id up again. */
  visitor: Visitor;
  /** The one real `ITEMS_DB` id on offer today, or `null` when the pool is empty. */
  offerItemId: string | null;
}

/** One city day's visitors. */
export interface VisitorSchedule {
  /** The resolved city day — exactly what `resolveCityDay` answered. */
  day: number;
  /** The visitors present today, in catalogue order (completed ones removed). */
  arrivals: VisitorArrival[];
}

/**
 * The profile's `city` object, or `{}` when the field is absent or is not a
 * plain object (a hand-edited or truncated save must not throw).
 */
function readCity(profile: CityCarrier | null | undefined): CityState {
  const city = profile?.city;
  if (!city || typeof city !== 'object' || Array.isArray(city)) return {};
  return city;
}

/**
 * Stored ids, dropped unless they are really ids: a non-array reads as an empty
 * history and every non-string (and every empty string) entry is discarded, so a
 * malformed save can never hand a bogus visitor id to the schedule.
 */
function readIds(ids: readonly unknown[] | null | undefined): string[] {
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/**
 * The visitors this profile has already MET — history only. Read for the later
 * visitor-action transaction (and for a UI that wants to say "you have met him
 * before"); it deliberately does not affect the schedule, because being seen is
 * not being done.
 */
export function readSeenVisitors(profile?: CityCarrier | null): string[] {
  return readIds(readCity(profile).seenVisitors);
}

/**
 * The visitors this profile has COMPLETED. The roadmap makes completion
 * permanent, so a valid id here removes that visitor from every later schedule.
 */
export function readCompletedVisitors(profile?: CityCarrier | null): string[] {
  return readIds(readCity(profile).completedVisitors);
}

/**
 * FNV-1a (32-bit) over the roadmap's exact key `${day}:${visitorId}`.
 * Deterministic across platforms and runs by construction: integer mixing only,
 * no floating point, no locale.
 */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Whether this visitor arrives on this day: inside its own inclusive window, and
 * passing the roadmap's cadence rule there. Total — a window whose `from` is past
 * its `to` never matches, and a cadence of zero (a malformed hand edit) answers
 * `NaN % 0`, which is never `0`, so it never matches either.
 */
function arrivesOnDay(visitor: Visitor, day: number): boolean {
  const { from, to } = visitor.window;
  if (day < from || day > to) return false;
  return fnv1a(`${day}:${visitor.id}`) % visitor.cadence === 0;
}

/** The catalogue without repeated ids (first entry wins), so a schedule cannot list a visitor twice. */
function uniqueVisitors(catalogue: readonly Visitor[]): Visitor[] {
  const seen = new Set<string>();
  const visitors: Visitor[] = [];
  for (const visitor of catalogue) {
    if (seen.has(visitor.id)) continue;
    seen.add(visitor.id);
    visitors.push(visitor);
  }
  return visitors;
}

/** The one item this visitor offers on this day, through the L2 rotation. */
function offerForDay(visitor: Visitor, day: number): string | null {
  const onOffer = selectDailyWindow(visitor.offer.pool, VISITOR_OFFER_SLOTS, visitor.id, day);
  return onOffer.length > 0 ? onOffer[0] : null;
}

/**
 * The schedule for one explicit day, one explicit catalogue and one set of
 * completed ids.
 *
 * Pure and total: any day at all (via `normalizeCityDay`), any catalogue length
 * and any junk in `completedIds` is answerable, and the caller gets a fresh
 * array it may mutate freely. An empty catalogue answers an empty schedule rather
 * than inventing one.
 */
export function scheduleVisitorDay(
  catalogue: readonly Visitor[],
  day: number,
  completedIds: readonly string[] = []
): VisitorSchedule {
  const resolvedDay = normalizeCityDay(day);
  const completed = new Set(readIds(completedIds));

  const arrivals: VisitorArrival[] = [];
  for (const visitor of uniqueVisitors(catalogue)) {
    if (completed.has(visitor.id)) continue;
    if (!arrivesOnDay(visitor, resolvedDay)) continue;
    arrivals.push({ visitor, offerItemId: offerForDay(visitor, resolvedDay) });
  }

  return { day: resolvedDay, arrivals };
}

/**
 * The schedule for the day the profile is on, against the shipping catalogue and
 * the profile's own completion history — the ONE list a later phase renders and
 * the ONE gate a later visitor action checks. A legacy save (no `city`) reads day
 * 1 with no history; visiting, reading or reloading never advances the day.
 */
export function resolveVisitorSchedule(profile?: CityCarrier | null): VisitorSchedule {
  return scheduleVisitorDay(
    VISITORS,
    resolveCityDay(profile),
    readCompletedVisitors(profile)
  );
}
