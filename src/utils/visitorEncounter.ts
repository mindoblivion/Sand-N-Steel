/**
 * Living City L11 — the single visitor encounter record.
 *
 * Meeting a scheduled visitor is a real player action. This pure transaction
 * writes only records.visitorsSeen, is idempotent, and never advances the clock,
 * charges currency, grants stock or marks the visitor completed.
 */
import type { PlayerProfile } from '../types/game';
import { getVisitor, type Visitor } from '../data/visitors';
import { readSeenVisitors, resolveVisitorSchedule } from './visitorSchedule';

export type VisitorEncounterRejectionReason = 'no-profile' | 'unknown-visitor' | 'not-in-town';

export type VisitorEncounterResult =
  | { ok: true; profile: PlayerProfile; recorded: boolean }
  | { ok: false; reason: VisitorEncounterRejectionReason };

export interface VisitorEncounterView {
  visitor: Visitor;
  offerItemId: string;
  seen: boolean;
}

/** Resolve the visitor and today's scheduled offer, or null when absent. */
export function resolveVisitorEncounter(
  profile: PlayerProfile | null | undefined,
  visitorId: string,
): VisitorEncounterView | null {
  const arrival = resolveVisitorSchedule(profile).arrivals.find(
    (candidate) => candidate.visitor.id === visitorId,
  );
  if (!arrival) return null;
  return {
    visitor: arrival.visitor,
    offerItemId: arrival.offerItemId,
    seen: readSeenVisitors(profile).includes(visitorId),
  };
}

/**
 * Record a first meeting. A repeat returns the caller's exact profile reference,
 * preventing duplicate app saves from stale callbacks or repeated panel opens.
 */
export function recordVisitorEncounter(
  profile: PlayerProfile | null | undefined,
  visitorId: string,
): VisitorEncounterResult {
  if (!profile) return { ok: false, reason: 'no-profile' };
  if (!getVisitor(visitorId)) return { ok: false, reason: 'unknown-visitor' };
  if (!resolveVisitorEncounter(profile, visitorId)) {
    return { ok: false, reason: 'not-in-town' };
  }

  const seen = readSeenVisitors(profile);
  if (seen.includes(visitorId)) return { ok: true, profile, recorded: false };

  const records =
    profile.records && typeof profile.records === 'object' && !Array.isArray(profile.records)
      ? profile.records
      : {};

  return {
    ok: true,
    recorded: true,
    profile: {
      ...profile,
      records: { ...records, visitorsSeen: [...seen, visitorId] },
    },
  };
}
