/**
 * Living City L11 — visitor encounter transaction regression tests.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';
import type { PlayerProfile } from '../types/game';
import { VISITORS } from '../data/visitors';
import { resolveVisitorSchedule, readSeenVisitors } from './visitorSchedule';
import { recordVisitorEncounter, resolveVisitorEncounter } from './visitorEncounter';

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
    gold: 100,
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

function profileWithVisitor(visitorId: string): PlayerProfile {
  const base = profile();
  for (let day = 1; day <= 365; day += 1) {
    const candidate = { ...base, time: { total: (day - 1) * 7 } };
    if (resolveVisitorSchedule(candidate).arrivals.some((a) => a.visitor.id === visitorId)) {
      return candidate;
    }
  }
  throw new Error('No arrival found in the visitor window: ' + visitorId);
}

describe('Living City L11 — visitor encounter', () => {
  test('resolves only visitors on today’s deterministic schedule', () => {
    const p = profileWithVisitor(VISITORS[0].id);
    const view = resolveVisitorEncounter(p, VISITORS[0].id);
    expect(view?.visitor).toBe(VISITORS[0]);
    expect(view?.offerItemId).toBeTruthy();
    expect(view?.seen).toBe(false);
    expect(resolveVisitorEncounter(p, 'unknown_visitor')).toBeNull();
  });

  test('first encounter writes one nested seen id and preserves all other state', () => {
    const p = profileWithVisitor(VISITORS[0].id);
    const before = JSON.stringify(p);
    const result = recordVisitorEncounter(p, VISITORS[0].id);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.recorded).toBe(true);
    expect(result.profile).not.toBe(p);
    expect(readSeenVisitors(result.profile)).toEqual([VISITORS[0].id]);
    expect(result.profile.gold).toBe(p.gold);
    expect(result.profile.inventory).toBe(p.inventory);
    expect(result.profile.time).toEqual(p.time);
    expect(JSON.stringify(p)).toBe(before);
  });

  test('repeat encounter is identity-stable and never duplicates history', () => {
    const p = profileWithVisitor(VISITORS[0].id);
    const first = recordVisitorEncounter(p, VISITORS[0].id);
    if (!first.ok) throw new Error(first.reason);
    const second = recordVisitorEncounter(first.profile, VISITORS[0].id);
    expect(second).toEqual({ ok: true, profile: first.profile, recorded: false });
    if (second.ok) expect(second.profile).toBe(first.profile);
    expect(readSeenVisitors(first.profile)).toEqual([VISITORS[0].id]);
  });

  test('rejects missing profile, unknown visitor and visitor not scheduled today', () => {
    expect(recordVisitorEncounter(null, VISITORS[0].id)).toEqual({
      ok: false, reason: 'no-profile',
    });
    expect(recordVisitorEncounter(profile(), 'unknown_visitor')).toEqual({
      ok: false, reason: 'unknown-visitor',
    });
    const p = profileWithVisitor(VISITORS[0].id);
    const absent = VISITORS.find((v) => v.id !== VISITORS[0].id)!;
    expect(recordVisitorEncounter(p, absent.id)).toEqual({
      ok: false, reason: 'not-in-town',
    });
  });

  test('malformed records are safely replaced only on a valid first encounter', () => {
    const p = profileWithVisitor(VISITORS[0].id);
    const malformed = { ...p, records: 'broken' as unknown as PlayerProfile['records'] };
    const result = recordVisitorEncounter(malformed, VISITORS[0].id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.records?.visitorsSeen).toEqual([VISITORS[0].id]);
    }
  });

  test('seen history is distinct from completion and does not hide a visitor', () => {
    const p = profileWithVisitor(VISITORS[0].id);
    const result = recordVisitorEncounter(p, VISITORS[0].id);
    if (!result.ok) throw new Error(result.reason);
    expect(resolveVisitorSchedule(result.profile).arrivals.some(
      (arrival) => arrival.visitor.id === VISITORS[0].id,
    )).toBe(true);
    expect(result.profile.records?.visitorsCompleted).toBeUndefined();
  });
});
