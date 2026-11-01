// L5 — authoritative training transaction.
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createNewProfile } from '../services/storage';
import type { PlayerProfile } from '../types/game';
import { trainingCost } from './facilityProgression';
import { resolveTrainingSchedule } from './trainingSchedule';
import { trainStat } from './trainingSession';

const rich = (total = 0): PlayerProfile => ({ ...createNewProfile('Tester'), gold: 50000, time: { total } });
const available = (profile: PlayerProfile) => resolveTrainingSchedule(profile).actions[0].id;

describe('L5 — training transaction', () => {
  test('a scheduled drill deducts the facility-aware cost and raises exactly one stat', () => {
    const base = rich(0);
    const stat = available(base);
    const cost = trainingCost(base);
    const result = trainStat(base, stat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cost).toBe(cost);
    expect(result.profile.gold).toBe(base.gold - cost);
    expect(result.profile.baseStats[stat]).toBe(base.baseStats[stat] + 1);
    expect(result.profile.time).toEqual(base.time);
    expect(base.baseStats[stat]).toBe(result.profile.baseStats[stat] - 1);
  });
  test('a resting discipline is refused without mutating the profile', () => {
    const base = rich(0);
    const resting = resolveTrainingSchedule(base).resting[0].id;
    const before = JSON.stringify(base);
    expect(trainStat(base, resting)).toEqual({ ok: false, reason: 'not-scheduled' });
    expect(JSON.stringify(base)).toBe(before);
  });
  test('unknown action and missing profile are refused', () => {
    expect(trainStat(null, 'strength')).toEqual({ ok: false, reason: 'no-profile' });
    expect(trainStat(rich(), 'charisma')).toEqual({ ok: false, reason: 'unknown-action' });
  });
  test('insufficient gold does not change stats or purse', () => {
    const base = { ...rich(), gold: 0 };
    const before = JSON.stringify(base);
    expect(trainStat(base, available(base))).toEqual({ ok: false, reason: 'insufficient-gold' });
    expect(JSON.stringify(base)).toBe(before);
  });
  test('App preserves the established one-phase successful-training settlement', () => {
    const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    const handler = app.slice(app.indexOf('const handleTrainStat'), app.indexOf('const handleBuyItem'));
    expect(handler).toContain('trainStat(base, stat)');
    expect(handler).toContain('advanceTimeBy(result.profile, 1)');
    expect(handler).toContain('settleLudiDeeds');
    expect(handler).toContain('profileRef.current = timed.profile');
  });
});
