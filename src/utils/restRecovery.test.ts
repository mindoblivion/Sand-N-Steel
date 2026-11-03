// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createNewProfile } from '../services/storage';
import type { PlayerProfile } from '../types/game';
import { resolveTimeState } from './timeState';
import { normalizeInjury } from './injurySettlement';
import {
  REST_BASE_COST,
  REST_DAY_FIELD,
  REST_DAY_PHASES,
  getRestEligibility,
  isRestSpentToday,
  resolveRestDay,
  restAtMedicalHouse,
  restCost,
} from './restRecovery';

const APP = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const CITY = readFileSync(new URL('../components/3d/city/CityHubScene.tsx', import.meta.url), 'utf8');
const MODULE = readFileSync(new URL('./restRecovery.ts', import.meta.url), 'utf8');

const WOUND = { fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 };

function wounded(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return { ...createNewProfile('Rest Test'), gold: 500, injury: { ...WOUND }, ...overrides };
}

function atDay(day: number, overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return wounded({
    ...overrides,
    time: { total: (day - 1) * REST_DAY_PHASES },
  });
}

describe('L9 — Arena Medical House rest and recovery', () => {
  test('the fee is fixed at 25 × level, independent of yard upgrades', () => {
    expect(REST_BASE_COST).toBe(25);
    for (const level of [1, 2, 3, 5, 7, 12]) {
      expect(restCost({ level })).toBe(25 * level);
    }
  });

  test('malformed and missing levels safely use level 1', () => {
    for (const profile of [null, undefined, {}, { level: Number.NaN }, { level: Infinity }, { level: -4 }, { level: 0 }]) {
      expect(restCost(profile as never)).toBe(25);
    }
    expect(restCost({ level: 2.9 })).toBe(50);
  });

  test('successful rest clears injury, deducts the fee and advances one full day', () => {
    const before = atDay(1, { gold: 100 });
    const result = restAtMedicalHouse(before);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cost).toBe(25);
    expect(result.day).toBe(1);
    expect(result.profile.injury).toBeNull();
    expect(result.profile.gold).toBe(75);
    expect(resolveTimeState(result.profile).day).toBe(2);
    expect(result.profile.time?.total).toBe(7);
    expect(result.profile.city?.restDay).toBe(1);
  });

  test('one full day is added from every phase while preserving the phase', () => {
    for (const total of [0, 1, 3, 6, 7, 10, 13, 41]) {
      const before = wounded({ time: { total } });
      const beforeClock = resolveTimeState(before);
      const result = restAtMedicalHouse(before);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const afterClock = resolveTimeState(result.profile);
      expect(afterClock.day).toBe(beforeClock.day + 1);
      expect(afterClock.phaseIndex).toBe(beforeClock.phaseIndex);
      expect(afterClock.total).toBe(beforeClock.total + REST_DAY_PHASES);
    }
  });

  test('legacy saves without time or city rest into day 2 without migration', () => {
    const legacy = wounded();
    delete legacy.time;
    delete legacy.city;
    expect(resolveTimeState(legacy).day).toBe(1);
    expect(resolveRestDay(legacy)).toBeNull();
    const result = restAtMedicalHouse(legacy);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(resolveTimeState(result.profile).day).toBe(2);
    expect(result.profile.city).toEqual({ restDay: 1 });
  });

  test('the allowance stores only restDay; timeState remains the only day counter', () => {
    const result = restAtMedicalHouse(atDay(4));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(REST_DAY_FIELD).toBe('restDay');
    expect(result.profile.city).toEqual({ restDay: 4 });
    expect(result.profile.city).not.toHaveProperty('day');
    expect(resolveTimeState(result.profile).day).toBe(5);
  });

  test('one rest is spent on the entry day and the allowance resets on the next day', () => {
    const spent = atDay(3, { city: { restDay: 3 } });
    expect(resolveRestDay(spent)).toBe(3);
    expect(isRestSpentToday(spent)).toBe(true);
    expect(getRestEligibility(spent)).toMatchObject({ ok: false, reason: 'already-rested' });

    const nextDay = { ...spent, time: { total: 3 * REST_DAY_PHASES } };
    expect(resolveTimeState(nextDay).day).toBe(4);
    expect(isRestSpentToday(nextDay)).toBe(false);
  });

  test('malformed restDay markers never lock out a day', () => {
    for (const restDay of [undefined, null, '3', Number.NaN, Infinity, -1, 0]) {
      const profile = atDay(3, { city: { restDay: restDay as number } });
      expect(resolveRestDay(profile)).toBeNull();
      expect(isRestSpentToday(profile)).toBe(false);
    }
  });

  test('a missing profile is refused before any other check', () => {
    expect(getRestEligibility(null)).toMatchObject({ ok: false, reason: 'no-profile' });
    expect(restAtMedicalHouse(null)).toEqual({ ok: false, reason: 'no-profile' });
  });

  test('an absent, malformed or spent injury is refused', () => {
    const invalid: unknown[] = [null, undefined, {}, [], 'injury',
      { ...WOUND, fightsRemaining: 0 },
      { ...WOUND, fightsRemaining: -1 },
      { ...WOUND, fightsRemaining: Number.NaN }];
    for (const injury of invalid) {
      const profile = atDay(1, { injury: injury as PlayerProfile['injury'] });
      expect(normalizeInjury(injury)).toBeNull();
      expect(restAtMedicalHouse(profile)).toEqual({ ok: false, reason: 'no-injury' });
    }
  });

  test('a fractional but live injury is normalized and can be treated', () => {
    const profile = atDay(1, { injury: { ...WOUND, fightsRemaining: 1.5 } });
    expect(restAtMedicalHouse(profile).ok).toBe(true);
  });

  test('exactly enough gold is accepted and one gold short is refused', () => {
    expect(restAtMedicalHouse(atDay(1, { gold: 25 })).ok).toBe(true);
    expect(restAtMedicalHouse(atDay(1, { gold: 24 }))).toEqual({
      ok: false, reason: 'insufficient-gold',
    });
  });

  test('non-finite balances cannot pay for treatment', () => {
    for (const gold of [undefined, null, Number.NaN, Infinity, -Infinity, '500']) {
      expect(restAtMedicalHouse(atDay(1, { gold: gold as number })).ok).toBe(false);
    }
  });

  test('the pure transaction mutates nothing and preserves unrelated nested data', () => {
    const before = atDay(2, { gold: 100, fame: 17, fightsWon: 3 });
    const snapshot = JSON.stringify(before);
    const inventory = before.inventory;
    const stats = before.baseStats;
    const result = restAtMedicalHouse(before);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(before.inventory).toBe(inventory);
    expect(before.baseStats).toBe(stats);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.inventory).toBe(inventory);
    expect(result.profile.baseStats).toBe(stats);
    expect(result.profile.fame).toBe(17);
    expect(result.profile.fightsWon).toBe(3);
  });

  test('the module has no wall clock, randomness, timer or persistence', () => {
    for (const forbidden of ['Date.now', 'new Date', 'Math.random', 'setTimeout',
      'setInterval', 'localStorage', 'sessionStorage', 'saveProfile', 'cityClock']) {
      expect(MODULE).not.toContain(forbidden);
    }
    expect(MODULE).toContain("from './timeState'");
    expect(MODULE).toContain("from './injurySettlement'");
  });

  test('App owns the day rollover and the single save after the pure transaction', () => {
    expect(APP).toContain('restAtMedicalHouse(profile)');
    expect(APP).toContain('onDayRollover(profile, result.profile)');
    const handlerStart = APP.indexOf('const handleTreatInjury');
    const handlerEnd = APP.indexOf('const payForNight', handlerStart);
    const handler = APP.slice(handlerStart, handlerEnd);
    expect(handler.match(/saveProfile\(/g)?.length).toBe(1);
    expect(handler).toContain('setProfile(settled)');
  });

  test('the city only reads eligibility and price; it owns no clock or save write', () => {
    expect(CITY).toContain('getRestEligibility(playerProfile)');
    expect(CITY).toContain('restCost(playerProfile)');
    expect(CITY).toContain('You have already rested at the Medical House today.');
    expect(CITY).not.toContain('advanceTimeBy(');
    expect(CITY).not.toContain('saveProfile(');
    expect(CITY).not.toContain('setProfile(');
  });
});
