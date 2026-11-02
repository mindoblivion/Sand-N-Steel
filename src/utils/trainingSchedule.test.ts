// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createNewProfile } from '../services/storage';
import { TRAINING_ACTIONS } from '../data/training';
import { resolveTimeState } from './timeState';
import {
  TRAINING_RESTING_PER_DAY,
  isTrainingActionScheduled,
  resolveTrainingSchedule,
  scheduleTrainingDay,
} from './trainingSchedule';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const tab = readFileSync(new URL('../components/hub/TrainingTab.tsx', import.meta.url), 'utf8');
const source = readFileSync(new URL('./trainingSchedule.ts', import.meta.url), 'utf8');

describe('L5 — deterministic training schedule on the authoritative timeState clock', () => {
  test('the same day always produces the same schedule', () => {
    for (const day of [1, 2, 3, 7, 40, 365]) {
      const expected = scheduleTrainingDay(TRAINING_ACTIONS, day);
      for (let i = 0; i < 10; i += 1) {
        expect(scheduleTrainingDay(TRAINING_ACTIONS, day)).toEqual(expected);
      }
    }
  });

  test('the day-1 resting drill is stable and three drills remain available', () => {
    const schedule = scheduleTrainingDay(TRAINING_ACTIONS, 1);
    expect(schedule.resting.map((action) => action.id)).toEqual(['stamina']);
    expect(schedule.actions.map((action) => action.id)).toEqual(['strength', 'agility', 'defense']);
  });

  test('different days can produce different resting drills', () => {
    expect(scheduleTrainingDay(TRAINING_ACTIONS, 1).resting.map(x => x.id))
      .not.toEqual(scheduleTrainingDay(TRAINING_ACTIONS, 2).resting.map(x => x.id));
  });

  test('every discipline both rests and trains across the first nine days', () => {
    const rested = new Set<string>();
    const trained = new Set<string>();
    for (let day = 1; day <= 9; day += 1) {
      const schedule = scheduleTrainingDay(TRAINING_ACTIONS, day);
      schedule.resting.forEach(x => rested.add(x.id));
      schedule.actions.forEach(x => trained.add(x.id));
    }
    expect([...rested].sort()).toEqual(TRAINING_ACTIONS.map(x => x.id).sort());
    expect([...trained].sort()).toEqual(TRAINING_ACTIONS.map(x => x.id).sort());
  });

  test('the profile day comes only from time.total and legacy saves resolve to day 1', () => {
    const fresh = createNewProfile('L5');
    expect(resolveTrainingSchedule(fresh).day).toBe(1);
    const atDay3 = { ...fresh, time: { total: 14 } };
    expect(resolveTimeState(atDay3).day).toBe(3);
    expect(resolveTrainingSchedule(atDay3).day).toBe(3);
    expect(resolveTrainingSchedule({ time: { total: 13 } } as never).day).toBe(2);
  });

  test('malformed clock state resolves through the existing clock contract', () => {
    for (const total of [undefined, null, '7', NaN, Infinity, -1, 0]) {
      const profile = { time: { total } } as never;
      expect(resolveTrainingSchedule(profile).day).toBe(resolveTimeState(profile).day);
      expect(resolveTrainingSchedule(profile).day).toBe(1);
    }
  });

  test('exactly one drill rests when the catalogue has more than one', () => {
    expect(TRAINING_RESTING_PER_DAY).toBe(1);
    for (let day = 1; day <= 30; day += 1) {
      const schedule = scheduleTrainingDay(TRAINING_ACTIONS, day);
      expect(schedule.resting).toHaveLength(1);
      expect(schedule.actions).toHaveLength(3);
    }
  });

  test('catalogue duplicates are ignored and short catalogues remain total', () => {
    const duplicate = [...TRAINING_ACTIONS, TRAINING_ACTIONS[0]];
    const schedule = scheduleTrainingDay(duplicate, 4);
    const all = [...schedule.actions, ...schedule.resting];
    expect(new Set(all.map(x => x.id)).size).toBe(4);
    expect(scheduleTrainingDay([], 4)).toEqual({ day: 4, actions: [], resting: [] });
    expect(scheduleTrainingDay([TRAINING_ACTIONS[0]], 4).resting).toEqual([]);
  });

  test('membership and displayed schedule agree', () => {
    const profile = { time: { total: 0 } } as never;
    const schedule = resolveTrainingSchedule(profile);
    for (const action of TRAINING_ACTIONS) {
      expect(isTrainingActionScheduled(profile, action.id))
        .toBe(schedule.actions.some(x => x.id === action.id));
    }
    expect(isTrainingActionScheduled(profile, 'unknown')).toBe(false);
  });

  test('no clock advancement or persistence is hidden in the resolver', () => {
    expect(source).toContain("from './timeState'");
    expect(source).toContain('resolveTimeState');
    for (const forbidden of ['cityClock', 'advanceTimeBy', 'advanceToNextDawn', 'saveProfile',
      'localStorage', 'Date.now', 'new Date', 'Math.random', 'setTimeout', 'setInterval']) {
      expect(source).not.toContain(forbidden);
    }
  });

  test('App enforces schedule at the authoritative training transaction', () => {
    const start = app.indexOf('const handleTrainStat =');
    const end = app.indexOf('const handleBuyItem =', start);
    const handler = app.slice(start, end);
    expect(handler).toContain('isTrainingActionScheduled(profile, stat)');
    expect(handler).toContain('advanceTimeBy(trained, 1)');
    expect(handler).toContain('saveProfile(timed.profile)');
  });

  test('TrainingTab renders the same catalogue and disables the resting drill', () => {
    expect(tab).toContain('TRAINING_ACTIONS');
    expect(tab).toContain('resolveTrainingSchedule(profile)');
    expect(tab).toContain('Resting today');
    expect(tab).not.toContain('Heavy Log Sleds');
  });
});
