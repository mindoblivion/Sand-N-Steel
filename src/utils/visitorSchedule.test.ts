// @ts-ignore — bun:test is provided by the test runner
import { describe, expect, test } from 'bun:test';
import { VISITORS, getVisitor } from '../data/visitors';
import { resolveVisitorSchedule, scheduleVisitorDay, readCompletedVisitors, readSeenVisitors } from './visitorSchedule';
import { resolveTimeState } from './timeState';
import type { PlayerProfile } from '../types/game';

const profile = (total: number, city?: unknown) => ({ time: { total }, city } as unknown as PlayerProfile);
const ids = (day: number) => scheduleVisitorDay(VISITORS, day).arrivals.map((arrival) => arrival.visitor.id);

describe('Living City visitor catalogue', () => {
  test('catalogue ids are unique and all visitors have bounded valid windows', () => {
    expect(new Set(VISITORS.map((visitor) => visitor.id)).size).toBe(VISITORS.length);
    for (const visitor of VISITORS) {
      expect(visitor.cadence).toBeGreaterThanOrEqual(2);
      expect(visitor.cadence).toBeLessThanOrEqual(7);
      expect(visitor.window.from).toBeGreaterThanOrEqual(1);
      expect(visitor.window.from).toBeLessThanOrEqual(visitor.window.to);
      expect(visitor.window.to).toBeLessThanOrEqual(365);
      expect(visitor.offer.pool.length).toBeGreaterThan(0);
    }
    expect(getVisitor('numidian_bladesmith')?.name).toBe('Hanno of Cirta');
    expect(getVisitor('unknown')).toBeUndefined();
  });
  test('schedule is deterministic, ordered and bounded by each arrival window', () => {
    for (let day = 1; day <= 400; day += 1) {
      const first = scheduleVisitorDay(VISITORS, day);
      expect(scheduleVisitorDay(VISITORS, day)).toEqual(first);
      for (const arrival of first.arrivals) {
        expect(day).toBeGreaterThanOrEqual(arrival.visitor.window.from);
        expect(day).toBeLessThanOrEqual(arrival.visitor.window.to);
      }
      expect(first.arrivals.map((a) => a.visitor.id)).toEqual(
        VISITORS.map((v) => v.id).filter((id) => first.arrivals.some((a) => a.visitor.id === id))
      );
    }
  });
  test('profile schedule uses the existing seven-phase clock, not city.day', () => {
    const p = profile(7, { day: 300, completedVisitors: [] });
    expect(resolveTimeState(p).day).toBe(2);
    expect(resolveVisitorSchedule(p).day).toBe(2);
    expect(resolveVisitorSchedule(profile(0)).day).toBe(1);
  });
  test('completion excludes permanently while seen history does not', () => {
    const day = 15;
    const all = resolveVisitorSchedule(profile((day - 1) * 7));
    for (const arrival of all.arrivals) {
      const completed = resolveVisitorSchedule(profile((day - 1) * 7, { completedVisitors: [arrival.visitor.id] }));
      expect(completed.arrivals.some((a) => a.visitor.id === arrival.visitor.id)).toBe(false);
      const seen = resolveVisitorSchedule(profile((day - 1) * 7, { seenVisitors: [arrival.visitor.id] }));
      expect(seen.arrivals.some((a) => a.visitor.id === arrival.visitor.id)).toBe(true);
    }
  });
  test('malformed histories are harmless and returned as fresh arrays', () => {
    const p = profile(0, { seenVisitors: 'bad', completedVisitors: [null, 2, 'ok', ''] });
    expect(readSeenVisitors(p)).toEqual([]);
    expect(readCompletedVisitors(p)).toEqual(['ok']);
    expect(readCompletedVisitors(p)).not.toBe(readCompletedVisitors(p));
  });
  test('resolving never mutates profile or advances its clock', () => {
    const p = profile(105, { completedVisitors: [] });
    const before = JSON.stringify(p);
    resolveVisitorSchedule(p);
    resolveVisitorSchedule(p);
    expect(JSON.stringify(p)).toBe(before);
  });
});
