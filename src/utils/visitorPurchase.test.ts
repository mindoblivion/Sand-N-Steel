/**
 * Living City L12 — visitor item purchase regression tests.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { DEFAULT_PLAYER_WEAPON, getItemById } from '../data/itemsDB';
import { getChariotPart } from '../data/chariotParts';
import type { PlayerProfile } from '../types/game';
import { VISITORS } from '../data/visitors';
import { resolveVisitorSchedule, readCompletedVisitors, readSeenVisitors } from './visitorSchedule';
import { purchaseVisitorOffer, resolveVisitorBargainPrice } from './visitorPurchase';

function profile(over: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    name: 'Test',
    title: 'Tester',
    rank: 'Rookie',
    appearance: { skinColor: '#000', hairColor: '#000', tunicColor: '#000', crestColor: '#000' },
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    unspentStatPoints: 0,
    baseStats: { strength: 10, agility: 10, stamina: 10, defense: 4 },
    gold: 1000,
    fame: 0,
    currentTier: 1,
    tierProgress: { 1: 0, 2: 0, 3: 0, 4: 0 },
    defeatedOpponentIds: [],
    bossKills: 0,
    newGamePlus: 0,
    trainingSessionsLeft: 2,
    injury: null,
    equipped: { weapon: DEFAULT_PLAYER_WEAPON },
    inventory: [DEFAULT_PLAYER_WEAPON],
    fightsWon: 0,
    fightsLost: 0,
    peakCrowdHypeOverall: 0,
    ...over,
  };
}

function profileWithVisitor(visitorId: string, gold = 1000): PlayerProfile {
  const base = profile({ gold });
  for (let day = 1; day <= 365; day += 1) {
    const candidate = { ...base, time: { total: (day - 1) * 7 } };
    if (resolveVisitorSchedule(candidate).arrivals.some((a) => a.visitor.id === visitorId && a.offerItemId !== null)) {
      return candidate;
    }
  }
  throw new Error('No arrival found in the visitor window: ' + visitorId);
}

function profileWithPart(visitorId: string, gold = 1000): PlayerProfile {
  const base = profile({ gold });
  for (let day = 1; day <= 365; day += 1) {
    const candidate = { ...base, time: { total: (day - 1) * 7 } };
    if (resolveVisitorSchedule(candidate).arrivals.some((a) => a.visitor.id === visitorId && a.offerPartId !== null)) {
      return candidate;
    }
  }
  throw new Error('No chariot-part arrival found for visitor: ' + visitorId);
}

describe('Living City L12 — visitor item purchase', () => {
  test('bargain prices are rounded up and malformed rates never create a discount', () => {
    expect(resolveVisitorBargainPrice({ price: 170 }, 0.75)).toBe(128);
    expect(resolveVisitorBargainPrice({ price: 170 }, 0)).toBe(170);
    expect(resolveVisitorBargainPrice({ price: 170 }, 1)).toBe(170);
    expect(resolveVisitorBargainPrice({ price: 170 }, Number.NaN)).toBe(170);
    expect(resolveVisitorBargainPrice({ price: Number.POSITIVE_INFINITY }, 0.5)).toBeNull();
    expect(resolveVisitorBargainPrice({ price: -1 }, 0.5)).toBeNull();
  });

  test('one scheduled trade charges the bargain price, grants one item and completes once', () => {
    const visitor = VISITORS[0];
    const p = profileWithVisitor(visitor.id);
    const arrival = resolveVisitorSchedule(p).arrivals.find((a) => a.visitor.id === visitor.id)!;
    const item = getItemById(arrival.offerItemId)!;
    const expectedPrice = resolveVisitorBargainPrice(item, visitor.bargainRate)!;
    const beforeInventory = p.inventory.slice();
    const beforeTime = p.time;

    const result = purchaseVisitorOffer(p, visitor.id);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    if (result.kind !== 'item') throw new Error('Expected item offer');
    expect(result.item).toBe(item);
    expect(result.price).toBe(expectedPrice);
    expect(result.profile.gold).toBe(p.gold - expectedPrice);
    expect(result.profile.inventory).toEqual([...beforeInventory, item]);
    expect(readCompletedVisitors(result.profile)).toEqual([visitor.id]);
    expect(readSeenVisitors(result.profile)).toEqual([]);
    expect(result.profile.time).toBe(beforeTime);
    expect(p.gold).toBe(1000);
    expect(p.inventory).toEqual(beforeInventory);
  });

  test('completed visitor cannot be charged a second time', () => {
    const visitor = VISITORS[0];
    const p = profileWithVisitor(visitor.id);
    const first = purchaseVisitorOffer(p, visitor.id);
    if (!first.ok) throw new Error(first.reason);
    const replay = purchaseVisitorOffer(first.profile, visitor.id);
    expect(replay).toEqual({ ok: false, reason: 'already-completed' });
    expect(first.profile.gold).toBeLessThan(p.gold);
    expect(first.profile.inventory).toHaveLength(p.inventory.length + 1);
  });

  test('refuses an insufficient purse without changing any part of the save', () => {
    const p = profileWithVisitor(VISITORS[0].id, 0);
    const before = JSON.stringify(p);
    expect(purchaseVisitorOffer(p, VISITORS[0].id)).toEqual({
      ok: false, reason: 'insufficient-gold',
    });
    expect(JSON.stringify(p)).toBe(before);
  });

  test('refuses malformed gold and inventory rather than repairing them', () => {
    const p = profileWithVisitor(VISITORS[0].id);
    const badGold = { ...p, gold: Number.NaN };
    expect(purchaseVisitorOffer(badGold, VISITORS[0].id)).toEqual({
      ok: false, reason: 'invalid-gold',
    });
    const badInventory = { ...p, inventory: null as unknown as PlayerProfile['inventory'] };
    expect(purchaseVisitorOffer(badInventory, VISITORS[0].id)).toEqual({
      ok: false, reason: 'invalid-inventory',
    });
  });

  test('rejects missing, unknown and unscheduled visitors without mutation', () => {
    expect(purchaseVisitorOffer(null, VISITORS[0].id)).toEqual({
      ok: false, reason: 'no-profile',
    });
    expect(purchaseVisitorOffer(profile(), 'unknown_visitor')).toEqual({
      ok: false, reason: 'unknown-visitor',
    });
    const p = profileWithVisitor(VISITORS[0].id);
    const absent = VISITORS.find((v) => v.id !== VISITORS[0].id)!;
    expect(purchaseVisitorOffer(p, absent.id)).toEqual({
      ok: false, reason: 'not-in-town',
    });
  });

  test('completion is nested, preserves unrelated records and does not imply seen', () => {
    const visitor = VISITORS[0];
    const p = profileWithVisitor(visitor.id, 1000);
    const withOtherRecords = {
      ...p,
      records: {
        laudes: 9,
        codexLocations: ['smithing_forge'],
        visitorsSeen: [VISITORS[1].id],
      },
    };
    const result = purchaseVisitorOffer(withOtherRecords, visitor.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.records?.laudes).toBe(9);
      expect(result.profile.records?.codexLocations).toEqual(['smithing_forge']);
      expect(result.profile.records?.visitorsSeen).toEqual([VISITORS[1].id]);
      expect(result.profile.records?.visitorsCompleted).toEqual([visitor.id]);
    }
  });
  test('visitor-only chariot finish is bought into chariot ownership, never item inventory', () => {
    const visitor = VISITORS[0];
    const p = profileWithPart(visitor.id, 1000);
    const arrival = resolveVisitorSchedule(p).arrivals.find((a) => a.visitor.id === visitor.id)!;
    expect(arrival.offerItemId).toBeNull();
    expect(arrival.offerPartId).toBe('finish_ventive');
    const part = getChariotPart(arrival.offerPartId!)!;
    const expectedPrice = Math.ceil(part.price * visitor.bargainRate!);
    const beforeInventory = p.inventory.slice();

    const result = purchaseVisitorOffer(p, visitor.id);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    if (result.kind !== 'part') throw new Error('Expected chariot-part offer');
    expect(result.part).toBe(part);
    expect(result.price).toBe(expectedPrice);
    expect(result.profile.gold).toBe(p.gold - expectedPrice);
    expect(result.profile.chariot?.owned).toContain(part.id);
    expect(result.profile.inventory).toEqual(beforeInventory);
    expect(readCompletedVisitors(result.profile)).toEqual([visitor.id]);
    expect(p.gold).toBe(1000);
    expect(p.inventory).toEqual(beforeInventory);
  });

  test('refuses an already-owned visitor finish and malformed ownership without mutation', () => {
    const visitor = VISITORS[0];
    const base = profileWithPart(visitor.id, 1000);
    const owned = { ...base, chariot: { owned: ['finish_ventive'], equipped: {} } };
    const before = JSON.stringify(owned);
    expect(purchaseVisitorOffer(owned, visitor.id)).toEqual({
      ok: false, reason: 'already-owned',
    });
    expect(JSON.stringify(owned)).toBe(before);

    const malformed = {
      ...base,
      chariot: { owned: null as unknown as string[], equipped: {} },
    };
    expect(purchaseVisitorOffer(malformed, visitor.id)).toEqual({
      ok: false, reason: 'invalid-ownership',
    });
  });

});
