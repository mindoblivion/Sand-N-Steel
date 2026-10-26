/**
 * L21B — the herald calls the city's visitors.
 *
 * The Living City's visitors already have one schedule (`utils/visitorSchedule`:
 * the one hash, the one window rule, the one completion filter, the catalogue's
 * own order) and one surface for the herald's voice (`heraldCries` / `HeraldToast`,
 * raised by `utils/roadMilestones`). This module adds nothing to either: it ASKS
 * the canonical resolver who is in town on the profile's current city day, and
 * says so once per visitor per day.
 *
 * WHAT IT IS. A pure copy function, a stable key, and an in-memory ledger:
 *
 *   - `visitorHeraldCry` names the visitor by the catalogue's own identity — the
 *     `name` and the `title` — and deliberately says nothing about the day's
 *     offer, its price or a rare item's id. The offer is the visitor's business
 *     to reveal when the player walks up to the stall;
 *   - `visitorHeraldKey` is `${day}:${visitorId}`, the same pair the schedule's
 *     own rule turns on, so "announced today" and "arrived today" cannot disagree;
 *   - `createVisitorHeraldLedger` holds those keys in a `Set` — MEMORY ONLY, in a
 *     `useRef` at the one call site. Nothing is written to the profile, and no
 *     save field, schema version or migration is introduced. A reload re-announces
 *     the day's arrivals, which is exactly what a fresh arrival should do.
 *
 * WHAT IT IS NOT. It never writes a profile, never advances the day, never opens,
 * meets, completes or prices an encounter, and never touches a mesh, prompt or
 * collider. It does not re-implement the schedule: no second hash, no window
 * arithmetic, no completion filter, no catalogue order of its own — every
 * eligible visitor comes from `resolveVisitorSchedule(profile).arrivals` in the
 * order that resolver returns, so a day with two or three arrivals announces all
 * of them, in catalogue order. `seenVisitors` is not read at all, so merely
 * having met a visitor never suppresses the call; completion already removes the
 * visitor inside the resolver.
 *
 * IDEMPOTENCE. `announce` records each key BEFORE it returns that cry, so a
 * repeated call — the same profile twice, an unrelated profile update, React
 * StrictMode's double effect invocation, or leaving and re-entering the city on
 * the same day — answers no cries at all. A later city day is a different key, so
 * it announces its own arrivals (including a visitor the player already heard
 * about on an earlier day).
 *
 * Purity: the profile is read, never mutated, and the schedule it builds is a
 * fresh object per call. No storage, no React, no timer, no wall clock, no
 * randomness, no per-frame work.
 */

import { resolveVisitorSchedule } from './visitorSchedule';

/** Exactly the profile shape the canonical resolver reads — no duplicate type. */
type ProfileLike = Parameters<typeof resolveVisitorSchedule>[0];

/** What the herald needs of a visitor: identity only, never the offer. */
interface VisitorIdentity {
  readonly name: string;
  readonly title: string;
}

/**
 * The herald's copy for one arrival, in the established voice (`The herald
 * cries: …`). The catalogue's `name` and `title` are the whole of it: the offer,
 * its price and any rare item id stay the visitor's own business.
 */
export function visitorHeraldCry(visitor: VisitorIdentity): string {
  return `The herald cries: ${visitor.name}, the ${visitor.title}, walks the city today!`;
}

/** The one key an announcement is remembered by — the schedule's own day/visitor pair. */
export function visitorHeraldKey(day: number, visitorId: string): string {
  return `${day}:${visitorId}`;
}

/** One session's record of what the herald has already called. */
export interface VisitorHeraldLedger {
  /**
   * The cries this profile's city day still owes, in the resolver's catalogue
   * order. Never repeats a `(day, visitorId)` this ledger has already called, and
   * records every key it returns before returning it.
   */
  announce(profile: ProfileLike): string[];
}

/**
 * A fresh, in-memory ledger — one per mounted app (`useRef`), never persisted.
 * `announce` is total: a null profile, a legacy save with no `city` and a profile
 * whose day has no arrivals all answer `[]` and leave the ledger usable.
 */
export function createVisitorHeraldLedger(): VisitorHeraldLedger {
  const called = new Set<string>();
  return {
    announce(profile: ProfileLike): string[] {
      const schedule = resolveVisitorSchedule(profile);
      const cries: string[] = [];
      for (const arrival of schedule.arrivals) {
        const key = visitorHeraldKey(schedule.day, arrival.visitor.id);
        if (called.has(key)) continue;
        // Recorded before the cry is handed back, so a repeated call can never
        // duplicate it even if the caller drops the return value.
        called.add(key);
        cries.push(visitorHeraldCry(arrival.visitor));
      }
      return cries;
    },
  };
}
