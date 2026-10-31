/** Deterministic daily visitor schedule, derived from the authoritative game clock. */
import { VISITORS, VISITOR_OFFER_SLOTS, type Visitor } from '../data/visitors';
import { isChariotPartId } from '../data/chariotParts';
import type { PlayerProfile } from '../types/game';
import { resolveTimeState } from './timeState';
import { selectDailyWindow } from './cityRotation';
export interface VisitorArrival { visitor: Visitor; offerItemId: string | null; offerPartId: string | null }
export interface VisitorSchedule { day: number; arrivals: VisitorArrival[] }
type CityCarrier = { city?: { completedVisitors?: unknown; seenVisitors?: unknown } };
function readIds(ids: unknown): string[] {
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
}
export function readSeenVisitors(profile?: CityCarrier | null): string[] {
  const city = profile?.city;
  return readIds(city && typeof city === 'object' && !Array.isArray(city) ? city.seenVisitors : undefined);
}
export function readCompletedVisitors(profile?: CityCarrier | null): string[] {
  const city = profile?.city;
  return readIds(city && typeof city === 'object' && !Array.isArray(city) ? city.completedVisitors : undefined);
}
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash >>> 0;
}
function arrivesOnDay(visitor: Visitor, day: number): boolean {
  return day >= visitor.window.from && day <= visitor.window.to && Number.isInteger(visitor.cadence) &&
    visitor.cadence >= 2 && fnv1a(String(day) + ':' + visitor.id) % visitor.cadence === 0;
}
function uniqueVisitors(catalogue: readonly Visitor[]): Visitor[] {
  const seen = new Set<string>();
  return catalogue.filter((visitor) => { if (seen.has(visitor.id)) return false; seen.add(visitor.id); return true; });
}
export function scheduleVisitorDay(catalogue: readonly Visitor[], day: number, completedIds: readonly string[] = []): VisitorSchedule {
  const resolvedDay = typeof day === 'number' && Number.isFinite(day)
    ? Math.max(1, Math.min(Math.floor(day), Number.MAX_SAFE_INTEGER)) : 1;
  const completed = new Set(readIds(completedIds));
  const arrivals: VisitorArrival[] = [];
  for (const visitor of uniqueVisitors(catalogue)) {
    if (completed.has(visitor.id) || !arrivesOnDay(visitor, resolvedDay)) continue;
    const picks = selectDailyWindow(visitor.offer.pool, VISITOR_OFFER_SLOTS, visitor.id, resolvedDay);
    const offered = picks[0] ?? null;
    const offerPartId = offered !== null && isChariotPartId(offered) ? offered : null;
    arrivals.push({ visitor, offerItemId: offered !== null && offerPartId === null ? offered : null, offerPartId });
  }
  return { day: resolvedDay, arrivals };
}
/** The live seven-phase profile clock is authoritative; no second day counter is introduced. */
export function resolveVisitorSchedule(profile?: PlayerProfile | null): VisitorSchedule {
  return scheduleVisitorDay(VISITORS, resolveTimeState(profile).day, readCompletedVisitors(profile));
}
