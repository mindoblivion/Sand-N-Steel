// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { createNewProfile } from '../services/storage';
import { readFileSync } from 'node:fs';
import { recordRaceBestTime, settleRaceCompletion, MAX_RECORDED_RACE_TIME_MS } from './raceRecords';

describe('race best-time transaction', () => {
  test('a first finish writes only the selected team time and preserves legacy progression', () => {
    const profile = createNewProfile('Record Keeper');
    const result = recordRaceBestTime(profile, 2, 12543.4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.improved).toBe(true);
    expect(result.bestTimeMs).toBe(12543);
    expect(result.profile.racing).toEqual({ bestTimes: { 2: 12543 } });
    expect(profile.racing).toBeUndefined();
    expect(result.profile.gold).toBe(profile.gold);
  });

  test('a faster lap replaces only its team record', () => {
    const profile = { ...createNewProfile('Record Keeper'), racing: { unlocked: [3], selected: 3, bestTimes: { 2: 15000, 3: 18000 } } };
    const result = recordRaceBestTime(profile, 3, 16000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.improved).toBe(true);
    expect(result.profile.racing).toEqual({ unlocked: [3], selected: 3, bestTimes: { 2: 15000, 3: 16000 } });
  });

  test('slower or equal laps are no-ops', () => {
    const profile = { ...createNewProfile('Record Keeper'), racing: { unlocked: [3], selected: 3, bestTimes: { 3: 16000 } } };
    for (const time of [16000, 17000]) {
      const result = recordRaceBestTime(profile, 3, time);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.improved).toBe(false);
        expect(result.profile).toBe(profile);
        expect(result.bestTimeMs).toBe(16000);
      }
    }
  });

  test('bad times never mutate a profile', () => {
    const profile = createNewProfile('Record Keeper');
    for (const time of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, MAX_RECORDED_RACE_TIME_MS + 1]) {
      const result = recordRaceBestTime(profile, 2, time);
      expect(result.ok).toBe(false);
      expect(profile.racing).toBeUndefined();
    }
  });

  test('invalid runtime team sizes cannot create unsupported best-time keys', () => {
    const profile = createNewProfile('Record Keeper');
    for (const teamSize of [0, 1, 2.5, 5, '2', null] as unknown[]) {
      const result = recordRaceBestTime(profile, teamSize as 2, 12345);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('invalid-team-size');
      expect(profile.racing).toBeUndefined();
    }
  });

  test('malformed previous time is replaced by a valid finish', () => {
    const profile = { ...createNewProfile('Record Keeper'), racing: { selected: 2, bestTimes: { 2: Number.NaN, 3: 'bad' } } } as unknown as ReturnType<typeof createNewProfile>;
    const result = recordRaceBestTime(profile, 2, 12345);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profile.racing?.bestTimes).toEqual({ 2: 12345, 3: 'bad' });
  });

  test('completion purse is free-entry, team-scaled, and includes a modest victory bonus', () => {
    const profile = createNewProfile('Circus Career');
    const biga = settleRaceCompletion(profile, 2, 15000, 'victory', 4);
    expect(biga.ok).toBe(true);
    if (!biga.ok) return;
    expect(biga.purseAwarded).toBe(60);
    expect(biga.profile.gold).toBe(profile.gold + 60);
    expect(biga.profile.racing).toMatchObject({ completed: 1, wins: 1, losses: 0, lastPurseDay: 4 });
  });

  test('only one purse is paid per in-game day, but every valid finish is recorded', () => {
    const first = settleRaceCompletion(createNewProfile('Circus Career'), 2, 15000, 'defeat', 7);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = settleRaceCompletion(first.profile, 2, 14500, 'victory', 7);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.purseAwarded).toBe(0);
    expect(second.profile.gold).toBe(first.profile.gold);
    expect(second.profile.racing).toMatchObject({ completed: 2, wins: 1, losses: 1, lastPurseDay: 7 });
    const nextDay = settleRaceCompletion(second.profile, 2, 14000, 'photo-finish', 8);
    expect(nextDay.ok).toBe(true);
    if (nextDay.ok) expect(nextDay.purseAwarded).toBe(40);
  });

  test('invalid completion timing, team, outcome or day cannot pay a purse', () => {
    const profile = createNewProfile('Circus Career');
    const cases = [
      [2, 0, 'victory', 1], [1, 10000, 'victory', 1], [2, 10000, 'unknown', 1], [2, 10000, 'victory', -1],
    ] as unknown[][];
    for (const args of cases) {
      const result = settleRaceCompletion(profile, args[0] as 2, args[1] as number, args[2] as 'victory', args[3] as number);
      expect(result.ok).toBe(false);
      expect(profile.gold).toBe(100);
      expect(profile.racing).toBeUndefined();
    }
  });

  test('only the finish transition requests a record write; abort stays read-only', () => {
    const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    const scene = readFileSync(new URL('../components/3d/RaceScene.tsx', import.meta.url), 'utf8');
    expect(app.includes('onRecordRaceCompletion={handleRecordRaceCompletion}')).toBe(true);
    expect(scene.includes('onRecordRaceCompletion(teamSize, elapsedMs, outcome)')).toBe(true);
    const exit = app.slice(app.indexOf('const handleExitRace'), app.indexOf('const handleOpenHubTab'));
    expect(exit.includes('recordRaceBestTime')).toBe(false);
    expect(exit.includes('saveProfile')).toBe(false);
  });
});
