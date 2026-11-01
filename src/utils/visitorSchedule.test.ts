// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { ITEMS_DB } from '../data/itemsDB';
import { VISITORS, getVisitor } from '../data/visitors';
import type { PlayerProfile } from '../types/game';
import { resolveTimeState } from './timeState';
import {
  readCompletedVisitors,
  readSeenVisitors,
  resolveVisitorSchedule,
  scheduleVisitorDay,
  visitorHash,
} from './visitorSchedule';

const itemIds = new Set(ITEMS_DB.map((item) => item.id));
function independentHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
const profile = (total: unknown, records?: unknown): PlayerProfile =>
  ({ time: { total }, records } as unknown as PlayerProfile);

describe('main Living City visitor schedule', () => {
  test('catalogue ids are stable, unique, bounded and immutable', () => {
    expect(VISITORS.map((v) => v.id)).toEqual([
      'numidian_bladesmith', 'campanian_armorer', 'emesan_weapon_trader',
    ]);
    expect(new Set(VISITORS.map((v) => v.id)).size).toBe(VISITORS.length);
    expect(Object.isFrozen(VISITORS)).toBe(true);
    for (const visitor of VISITORS) {
      expect(visitor.cadence).toBeGreaterThanOrEqual(2);
      expect(visitor.cadence).toBeLessThanOrEqual(7);
      expect(visitor.window.from).toBeGreaterThanOrEqual(1);
      expect(visitor.window.to).toBeLessThanOrEqual(365);
      expect(visitor.window.from).toBeLessThanOrEqual(visitor.window.to);
      expect(Object.isFrozen(visitor.offer.pool)).toBe(true);
      expect(visitor.offer.pool.length).toBeGreaterThan(0);
      for (const id of visitor.offer.pool) expect(itemIds.has(id)).toBe(true);
    }
    expect(getVisitor('not-a-visitor')).toBeUndefined();
  });

  test('arrival schedule matches an independent FNV-1a implementation over the full horizon', () => {
    for (let day = 1; day <= 365; day += 1) {
      const actual = scheduleVisitorDay(VISITORS, day).arrivals.map((arrival) => arrival.visitor.id);
      const expected = VISITORS.filter((visitor) =>
        day >= visitor.window.from &&
        day <= visitor.window.to &&
        independentHash(day + ':' + visitor.id) % visitor.cadence === 0,
      ).map((visitor) => visitor.id);
      expect(actual).toEqual(expected);
      expect(scheduleVisitorDay(VISITORS, day)).toEqual(scheduleVisitorDay(VISITORS, day));
    }
    expect(visitorHash('1:numidian_bladesmith')).toBe(independentHash('1:numidian_bladesmith'));
  });

  test('arrival windows are inclusive and completed visitors stay excluded', () => {
    for (const visitor of VISITORS) {
      expect(scheduleVisitorDay([visitor], visitor.window.from).day).toBe(visitor.window.from);
      expect(scheduleVisitorDay([visitor], visitor.window.to).day).toBe(visitor.window.to);
      expect(scheduleVisitorDay([visitor], visitor.window.from - 1).arrivals).toEqual([]);
      expect(scheduleVisitorDay([visitor], visitor.window.to + 1).arrivals).toEqual([]);
      expect(scheduleVisitorDay([visitor], visitor.window.from, [visitor.id]).arrivals).toEqual([]);
    }
  });

  test('resolved day comes only from main timeState; it never advances the clock', () => {
    for (let total = 0; total < 70; total += 1) {
      const p = profile(total);
      const before = JSON.stringify(p);
      expect(resolveVisitorSchedule(p).day).toBe(resolveTimeState(p).day);
      expect(JSON.stringify(p)).toBe(before);
    }
  });

  test('legacy, malformed and junk history safely resolve to empty valid ids', () => {
    for (const records of [undefined, null, {}, { visitorsSeen: 4, visitorsCompleted: 'x' },
      { visitorsSeen: ['bogus', 'numidian_bladesmith', 'numidian_bladesmith', 4],
        visitorsCompleted: ['bogus', 'emesan_weapon_trader'] }]) {
      const p = profile(0, records);
      expect(readSeenVisitors(p)).toEqual(
        records && Array.isArray((records as {visitorsSeen?: unknown}).visitorsSeen)
          ? ['numidian_bladesmith'] : [],
      );
      expect(readCompletedVisitors(p)).toEqual(
        records && Array.isArray((records as {visitorsCompleted?: unknown}).visitorsCompleted)
          ? ['emesan_weapon_trader'] : [],
      );
    }
  });

  test('seen is informational; completion removes only that visitor', () => {
    const base = scheduleVisitorDay(VISITORS, 90);
    const completed = scheduleVisitorDay(VISITORS, 90, base.arrivals.map((a) => a.visitor.id));
    expect(completed.arrivals).toEqual([]);
    const p = profile((90 - 1) * 7, { visitorsSeen: base.arrivals.map((a) => a.visitor.id) });
    expect(resolveVisitorSchedule(p).arrivals.map((a) => a.visitor.id)).toEqual(
      base.arrivals.map((a) => a.visitor.id),
    );
  });

  test('every returned offer references a real main-branch item', () => {
    for (let day = 1; day <= 365; day += 1) {
      for (const arrival of scheduleVisitorDay(VISITORS, day).arrivals) {
        expect(itemIds.has(arrival.offerItemId)).toBe(true);
      }
    }
  });
});
