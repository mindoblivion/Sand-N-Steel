/**
 * Living City L5 — the deterministic, day-based training schedule.
 *
 * The training yard's catalogue (`data/training.ts`) is unchanged; this suite
 * pins the SCHEDULE arithmetic added on top of it, in the repo's two registers
 * (behaviour for pure logic, ordered source assertions for the wiring this repo
 * has no DOM renderer for):
 *
 *   §A  determinism — the same day and catalogue always produce the same
 *       timetable, on repeated calls and across a fresh resolution;
 *   §B  day sensitivity — representative days differ, every discipline both
 *       drills and rests, without randomness;
 *   §C  the clock — the day comes from `resolveCityDay` (`utils/cityClock.ts`):
 *       a legacy profile with no `city.day` reads day 1 and malformed days
 *       resolve exactly as the clock resolves them;
 *   §D  catalogue safety — only existing actions are ever scheduled, a changing
 *       catalogue cannot produce duplicates or invalid entries, and the
 *       schedule stays total for short and empty catalogues;
 *   §E  purity, scope and wiring — no input is mutated, the module names no
 *       clock/timer/storage/randomness, and the screen and the transaction share
 *       this one resolver.
 *
 * The day-1 pin in §B is a stability record measured from the shipped hash: a
 * change to the hash must be acknowledged here rather than silently altering
 * which drills rest on every save.
 *
 * Run with: `bun test src/utils/trainingSchedule.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via `bun test`
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { TRAINING_ACTIONS, type TrainingAction } from '../data/training';
import { createNewProfile } from '../services/storage';
import { normalizeCityDay } from './cityClock';
import {
  TRAINING_RESTING_PER_DAY,
  isTrainingActionScheduled,
  resolveTrainingSchedule,
  scheduleTrainingDay,
} from './trainingSchedule';

const code = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const SCHEDULE_SRC = readFileSync(new URL('./trainingSchedule.ts', import.meta.url), 'utf8');
const SCHEDULE_CODE = code('./trainingSchedule.ts');

const CATALOGUE_IDS = TRAINING_ACTIONS.map((action) => action.id);

/** The measured day-1 timetable, pinned so a hash change cannot pass unnoticed. */
const DAY_ONE_RESTING = ['stamina'];

const clone = (actions: readonly TrainingAction[]): TrainingAction[] => actions.map((a) => ({ ...a }));

describe('§A determinism', () => {
  test('the same day and catalogue always answer the same timetable', () => {
    for (const day of [1, 2, 3, 7, 40, 365]) {
      const first = scheduleTrainingDay(TRAINING_ACTIONS, day);
      for (let i = 0; i < 5; i += 1) {
        const again = scheduleTrainingDay(TRAINING_ACTIONS, day);
        expect(again.actions.map((a) => a.id)).toEqual(first.actions.map((a) => a.id));
        expect(again.resting.map((a) => a.id)).toEqual(first.resting.map((a) => a.id));
        expect(again.day).toBe(day);
      }
    }
  });

  test('a fresh resolution of the same legacy profile repeats the timetable', () => {
    const a = resolveTrainingSchedule({});
    const b = resolveTrainingSchedule({});
    expect(b.day).toBe(a.day);
    expect(b.actions.map((x) => x.id)).toEqual(a.actions.map((x) => x.id));
  });

  test('25 consecutive resolutions are identical for one day', () => {
    const profile = { city: { day: 9 } };
    const expected = resolveTrainingSchedule(profile).actions.map((a) => a.id).join(',');
    for (let i = 0; i < 25; i += 1) {
      expect(resolveTrainingSchedule(profile).actions.map((a) => a.id).join(',')).toBe(expected);
    }
  });

  test('every call returns fresh arrays the caller may mutate', () => {
    const first = scheduleTrainingDay(TRAINING_ACTIONS, 1);
    first.actions.length = 0;
    first.resting.push({ id: 'strength', name: 'x', description: 'x' });
    const second = scheduleTrainingDay(TRAINING_ACTIONS, 1);
    expect(second.actions.length).toBe(TRAINING_ACTIONS.length - TRAINING_RESTING_PER_DAY);
    expect(second.resting.map((a) => a.id)).toEqual(DAY_ONE_RESTING);
  });
});

describe('§B day sensitivity', () => {
  test('day 1 is the measured timetable', () => {
    const schedule = scheduleTrainingDay(TRAINING_ACTIONS, 1);
    expect(schedule.resting.map((a) => a.id)).toEqual(DAY_ONE_RESTING);
    expect(schedule.actions.map((a) => a.id)).toEqual(['strength', 'agility', 'defense']);
  });

  test('two representative days differ', () => {
    const one = scheduleTrainingDay(TRAINING_ACTIONS, 1).resting.map((a) => a.id).join(',');
    const two = scheduleTrainingDay(TRAINING_ACTIONS, 2).resting.map((a) => a.id).join(',');
    expect(one).not.toBe(two);
  });

  test('every discipline both drills and rests over the first nine days', () => {
    const rested = new Set<string>();
    const drilled = new Set<string>();
    for (let day = 1; day <= 9; day += 1) {
      const schedule = scheduleTrainingDay(TRAINING_ACTIONS, day);
      schedule.resting.forEach((a) => rested.add(a.id));
      schedule.actions.forEach((a) => drilled.add(a.id));
    }
    expect([...rested].sort()).toEqual([...CATALOGUE_IDS].sort());
    expect([...drilled].sort()).toEqual([...CATALOGUE_IDS].sort());
  });

  test('one discipline rests per day while the catalogue has more than one', () => {
    for (let day = 1; day <= 20; day += 1) {
      const schedule = scheduleTrainingDay(TRAINING_ACTIONS, day);
      expect(schedule.resting.length).toBe(TRAINING_RESTING_PER_DAY);
      expect(schedule.actions.length).toBe(TRAINING_ACTIONS.length - TRAINING_RESTING_PER_DAY);
    }
  });
});

describe('§C the clock', () => {
  test('a legacy profile with no city object reads day 1', () => {
    const schedule = resolveTrainingSchedule(createNewProfile('Legacy'));
    expect(schedule.day).toBe(1);
    expect(schedule.resting.map((a) => a.id)).toEqual(DAY_ONE_RESTING);
  });

  test('a missing or null profile also reads day 1', () => {
    expect(resolveTrainingSchedule(undefined).day).toBe(1);
    expect(resolveTrainingSchedule(null).day).toBe(1);
  });

  test('malformed day values resolve exactly as resolveCityDay resolves them', () => {
    const malformed: unknown[] = [
      undefined,
      null,
      '7',
      true,
      [],
      {},
      NaN,
      Infinity,
      -Infinity,
      0,
      -7,
      -0.5,
    ];
    for (const value of malformed) {
      const schedule = scheduleTrainingDay(TRAINING_ACTIONS, value as number);
      expect(schedule.day).toBe(normalizeCityDay(value));
      expect(schedule.day).toBe(1);
    }
  });

  test('a fractional day is floored through the same normalizer', () => {
    expect(scheduleTrainingDay(TRAINING_ACTIONS, 3.7).day).toBe(3);
    expect(scheduleTrainingDay(TRAINING_ACTIONS, 3.7).resting.map((a) => a.id)).toEqual(
      scheduleTrainingDay(TRAINING_ACTIONS, 3).resting.map((a) => a.id)
    );
  });

  test('a malformed city container is ignored rather than spread', () => {
    const schedule = resolveTrainingSchedule({ city: 'day 4' as never });
    expect(schedule.day).toBe(1);
    expect(schedule.resting.map((a) => a.id)).toEqual(DAY_ONE_RESTING);
  });

  test('the module reads the one clock and names no other source of time', () => {
    expect(SCHEDULE_CODE).toContain("from './cityClock'");
    expect(SCHEDULE_CODE).toContain('resolveCityDay');
    expect(SCHEDULE_CODE).toContain('normalizeCityDay');
    expect(SCHEDULE_CODE).not.toContain('Date');
    expect(SCHEDULE_CODE).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/);
    expect(SCHEDULE_CODE).not.toMatch(/Math\.random/);
    expect(SCHEDULE_CODE).not.toMatch(/localStorage|sessionStorage|saveProfile/);
    expect(SCHEDULE_CODE).not.toContain('advanceCityDay');
  });
});

describe('§D catalogue safety', () => {
  test('only existing training actions ever appear', () => {
    for (let day = 1; day <= 60; day += 1) {
      const schedule = scheduleTrainingDay(TRAINING_ACTIONS, day);
      for (const action of [...schedule.actions, ...schedule.resting]) {
        expect(CATALOGUE_IDS).toContain(action.id);
      }
    }
  });

  test('no day lists the same drill twice', () => {
    for (let day = 1; day <= 60; day += 1) {
      const schedule = scheduleTrainingDay(TRAINING_ACTIONS, day);
      const ids = [...schedule.actions, ...schedule.resting].map((a) => a.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  test('a catalogue change is absorbed without duplicates or invalid entries', () => {
    const extended = [
      ...clone(TRAINING_ACTIONS),
      { id: 'strength' as const, name: 'Duplicate Sled', description: 'ignored' },
      { id: 'agility' as const, name: 'Duplicate Target', description: 'ignored' },
    ];
    const schedule = scheduleTrainingDay(extended, 5);
    const ids = [...schedule.actions, ...schedule.resting].map((a) => a.id);
    expect(ids.sort()).toEqual([...CATALOGUE_IDS].sort());
    expect(new Set(ids).size).toBe(CATALOGUE_IDS.length);
    // The first catalogue entry for an id wins, so the real drill keeps its name.
    expect(schedule.actions.concat(schedule.resting).find((a) => a.id === 'strength')?.name).toBe(
      'Heavy Log Sleds'
    );
  });

  test('the resolver is total for short and empty catalogues', () => {
    expect(scheduleTrainingDay([], 4)).toEqual({ day: 4, actions: [], resting: [] });

    const single = scheduleTrainingDay([TRAINING_ACTIONS[0]], 4);
    expect(single.actions.map((a) => a.id)).toEqual(['strength']);
    expect(single.resting).toEqual([]);

    const pair = scheduleTrainingDay(TRAINING_ACTIONS.slice(0, 2), 4);
    expect(pair.actions.length).toBe(1);
    expect(pair.resting.length).toBe(1);
  });

  test('the catalogue itself is unchanged by any number of resolutions', () => {
    const before = JSON.stringify(TRAINING_ACTIONS);
    for (let day = 1; day <= 90; day += 1) scheduleTrainingDay(TRAINING_ACTIONS, day);
    expect(JSON.stringify(TRAINING_ACTIONS)).toBe(before);
    expect(TRAINING_ACTIONS.map((a) => a.id)).toEqual(CATALOGUE_IDS);
  });
});

describe('§E purity, scope and wiring', () => {
  test('the profile and its city object are never mutated', () => {
    const profile = { city: { day: 6 }, gold: 100 };
    const snapshot = JSON.stringify(profile);
    resolveTrainingSchedule(profile);
    isTrainingActionScheduled(profile, 'strength');
    expect(profile.city.day).toBe(6);
    expect(JSON.stringify(profile)).toBe(snapshot);
  });

  test('membership agrees with the resolved timetable', () => {
    const profile = { city: { day: 1 } };
    const schedule = resolveTrainingSchedule(profile);
    for (const id of CATALOGUE_IDS) {
      const listed = schedule.actions.some((a) => a.id === id);
      expect(isTrainingActionScheduled(profile, id)).toBe(listed);
    }
    expect(isTrainingActionScheduled(profile, 'charisma' as never)).toBe(false);
  });

  test('the screen and the training transaction both read this one resolver', () => {
    const tab = code('../components/hub/TrainingTab.tsx');
    const session = code('./trainingSession.ts');
    expect(tab).toContain('resolveTrainingSchedule');
    expect(tab).toContain('trainingCost');
    expect(session).toContain('isTrainingActionScheduled');
    expect(SCHEDULE_CODE).toContain('TRAINING_ACTIONS');
    // The catalogue is the one source of the drills, and the screen no longer
    // carries its own copy of them.
    expect(tab).not.toContain('Heavy Log Sleds');
    expect(tab).not.toContain('Sand Endurance Drills');
    expect(SCHEDULE_SRC).toContain('TRAINING_RESTING_PER_DAY');
  });
});
