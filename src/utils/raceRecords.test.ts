// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { createNewProfile } from '../services/storage';
import { readFileSync } from 'node:fs';
import { recordRaceBestTime, MAX_RECORDED_RACE_TIME_MS } from './raceRecords';

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

  test('malformed previous time is replaced by a valid finish', () => {
    const profile = { ...createNewProfile('Record Keeper'), racing: { selected: 2, bestTimes: { 2: Number.NaN, 3: 'bad' } } } as unknown as ReturnType<typeof createNewProfile>;
    const result = recordRaceBestTime(profile, 2, 12345);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profile.racing?.bestTimes).toEqual({ 2: 12345, 3: 'bad' });
  });

  test('only the finish transition requests a record write; abort stays read-only', () => {
    const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    const scene = readFileSync(new URL('../components/3d/RaceScene.tsx', import.meta.url), 'utf8');
    expect(app.includes('onRecordBestTime={handleRecordRaceBestTime}')).toBe(true);
    expect(scene.includes('onRecordBestTime(teamSize, elapsedMs)')).toBe(true);
    const exit = app.slice(app.indexOf('const handleExitRace'), app.indexOf('const handleOpenHubTab'));
    expect(exit.includes('recordRaceBestTime')).toBe(false);
    expect(exit.includes('saveProfile')).toBe(false);
  });
});
