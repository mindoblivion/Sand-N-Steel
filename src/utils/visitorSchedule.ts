/**
 * Main-branch Living City L10: deterministic, read-only visitor scheduling.
 * The day comes from the existing seven-phase timeState clock.
 */
import { ITEMS_DB } from '../data/itemsDB';
import { VISITORS, type Visitor } from '../data/visitors';
import type { PlayerProfile } from '../types/game';
import { resolveTimeState } from './timeState';
import { getChariotPart, isChariotPartId } from '../data/chariotParts';
import { selectDailyWindow } from './cityRotation';

const ITEM_IDS = new Set(ITEMS_DB.map((item) => item.id));
const VISITOR_IDS = new Set(VISITORS.map((visitor) => visitor.id));

type HistoryProfile = { records?: unknown } | null | undefined;

function historyValue(profile: HistoryProfile, key: 'visitorsSeen' | 'visitorsCompleted'): unknown {
  const records = profile?.records;
  if (!records || typeof records !== 'object' || Array.isArray(records)) return undefined;
  return (records as Record<string, unknown>)[key];
}

export interface VisitorArrival {
  visitor: Visitor;
  offerItemId: string | null;
  offerPartId: string | null;
}

export interface VisitorSchedule {
  day: number;
  arrivals: VisitorArrival[];
}

export function visitorHash(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function validIds(value: unknown, allowed: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((id): id is string => {
    if (typeof id !== 'string' || !allowed.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function readSeenVisitors(profile?: HistoryProfile | null): string[] {
  return validIds(historyValue(profile, 'visitorsSeen'), VISITOR_IDS);
}

export function readCompletedVisitors(profile?: HistoryProfile | null): string[] {
  return validIds(historyValue(profile, 'visitorsCompleted'), VISITOR_IDS);
}

function arrives(visitor: Visitor, day: number): boolean {
  return day >= visitor.window.from &&
    day <= visitor.window.to &&
    Number.isInteger(visitor.cadence) &&
    visitor.cadence > 0 &&
    visitorHash(day + ':' + visitor.id) % visitor.cadence === 0;
}

function offer(visitor: Visitor, day: number): string {
  const pool = visitor.offer.pool.filter((id) =>
    ITEM_IDS.has(id) || getChariotPart(id)?.visitorOnly === true
  );
  if (!pool.length) return '';
  // Share the storefront daily-window selector while preserving the visitor's
  // existing one-slot offer semantics and hash namespace.
  return selectDailyWindow(pool, 1, visitor.id, day)[0] ?? '';
}

/** Resolve any supplied day without reading or writing storage. */
export function scheduleVisitorDay(
  catalogue: readonly Visitor[],
  day: number,
  completedIds: readonly string[] = [],
): VisitorSchedule {
  const safeDay = Number.isFinite(day) && day >= 1 ? Math.floor(day) : 1;
  const allowed = new Set(catalogue.map((visitor) => visitor.id));
  const completed = new Set(validIds(completedIds, allowed));
  const seen = new Set<string>();
  const arrivals: VisitorArrival[] = [];

  for (const visitor of catalogue) {
    if (!visitor || !visitor.id || seen.has(visitor.id)) continue;
    seen.add(visitor.id);
    if (completed.has(visitor.id) || !arrives(visitor, safeDay)) continue;
    const offerId = offer(visitor, safeDay);
    if (!offerId) continue;
    const isPart = isChariotPartId(offerId);
    arrivals.push({
      visitor,
      offerItemId: isPart ? null : offerId,
      offerPartId: isPart ? offerId : null,
    });
  }
  return { day: safeDay, arrivals };
}

/** Resolve today's schedule using main's existing clock and completion history. */
export function resolveVisitorSchedule(
  profile?: Pick<PlayerProfile, 'time' | 'records'> | null,
): VisitorSchedule {
  const day = resolveTimeState(profile as PlayerProfile | null | undefined).day;
  return scheduleVisitorDay(VISITORS, day, readCompletedVisitors(profile));
}
