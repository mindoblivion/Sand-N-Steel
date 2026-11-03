// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createNewProfile } from '../services/storage';

const APP = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
import {
  recordPhysicalRecovery,
  recordPhysicalTraining,
  resolvePhysicalDevelopment,
} from './physicalDevelopment';

describe('physical development history', () => {
  test('legacy saves resolve to neutral development without being migrated', () => {
    const profile = createNewProfile('Legacy physique');
    expect(profile.appearance.physique).toBeUndefined();
    expect(resolvePhysicalDevelopment(undefined)).toEqual({
      strengthSessions: 0,
      agilitySessions: 0,
      staminaSessions: 0,
      defenseSessions: 0,
      trainingDays: 0,
      trainingStreak: 0,
      lastTrainingDay: 0,
      recoveryDays: 0,
      lastRecoveryDay: 0,
    });
  });

  test('one session records its stat and first training day', () => {
    const profile = { ...createNewProfile('First session'), time: { total: 0 } };
    const trained = recordPhysicalTraining(profile, 'strength');
    expect(trained.appearance.physique).toMatchObject({
      strengthSessions: 1,
      trainingDays: 1,
      trainingStreak: 1,
      lastTrainingDay: 1,
    });
    expect(trained.baseStats.strength).toBe(profile.baseStats.strength);
    expect(trained.time).toEqual(profile.time);
    expect(trained.gold).toBe(profile.gold);
  });

  test('multiple sessions on the same day count individually but not as new days', () => {
    const profile = {
      ...createNewProfile('Same day'),
      time: { total: 0 },
      appearance: {
        ...createNewProfile('Same day').appearance,
        physique: {
          strengthSessions: 1, agilitySessions: 0, staminaSessions: 0, defenseSessions: 0,
          trainingDays: 1, trainingStreak: 1, lastTrainingDay: 1,
          recoveryDays: 0, lastRecoveryDay: 0,
        },
      },
    };
    const trained = recordPhysicalTraining(profile, 'strength');
    expect(trained.appearance.physique).toMatchObject({
      strengthSessions: 2,
      trainingDays: 1,
      trainingStreak: 1,
      lastTrainingDay: 1,
    });
  });

  test('consecutive days grow the streak; a missed day resets it', () => {
    const dayOne = { ...createNewProfile('Consistency'), time: { total: 0 } };
    const first = recordPhysicalTraining(dayOne, 'stamina');
    const dayTwo = { ...first, time: { total: 7 } };
    const second = recordPhysicalTraining(dayTwo, 'stamina');
    expect(second.appearance.physique).toMatchObject({
      staminaSessions: 2, trainingDays: 2, trainingStreak: 2, lastTrainingDay: 2,
    });
    const dayFour = { ...second, time: { total: 21 } };
    const resumed = recordPhysicalTraining(dayFour, 'agility');
    expect(resumed.appearance.physique).toMatchObject({
      agilitySessions: 1, trainingDays: 3, trainingStreak: 1, lastTrainingDay: 4,
    });
  });

  test('recovery counts distinct days and never advances the clock itself', () => {
    const profile = { ...createNewProfile('Recovery'), time: { total: 7 } };
    const first = recordPhysicalRecovery(profile, 2);
    const duplicate = recordPhysicalRecovery(first, 2);
    expect(first.appearance.physique).toMatchObject({ recoveryDays: 1, lastRecoveryDay: 2 });
    expect(duplicate).toBe(first);
    expect(first.time).toEqual(profile.time);
    const later = recordPhysicalRecovery(first, 3);
    expect(later.appearance.physique).toMatchObject({ recoveryDays: 2, lastRecoveryDay: 3 });
    expect(recordPhysicalRecovery(later, Number.NaN)).toBe(later);
    expect(recordPhysicalRecovery(later, 0)).toBe(later);
  });

  test('malformed counters normalize safely and do not leak through the save', () => {
    const resolved = resolvePhysicalDevelopment({
      strengthSessions: -5,
      agilitySessions: Number.NaN,
      staminaSessions: 4.8,
      defenseSessions: 1000000,
      trainingDays: 2.9,
      trainingStreak: 99,
      lastTrainingDay: '4',
      recoveryDays: Infinity,
      lastRecoveryDay: -1,
    });
    expect(resolved).toEqual({
      strengthSessions: 0,
      agilitySessions: 0,
      staminaSessions: 4,
      defenseSessions: 100000,
      trainingDays: 2,
      trainingStreak: 2,
      lastTrainingDay: 0,
      recoveryDays: 0,
      lastRecoveryDay: 0,
    });
  });

  test('transactions are immutable and preserve unrelated profile data', () => {
    const profile = { ...createNewProfile('Immutable'), time: { total: 0 } };
    const snapshot = JSON.stringify(profile);
    const trained = recordPhysicalTraining(profile, 'defense');
    expect(JSON.stringify(profile)).toBe(snapshot);
    expect(trained.inventory).toBe(profile.inventory);
    expect(trained.baseStats).toBe(profile.baseStats);
    expect(trained.appearance).not.toBe(profile.appearance);
  });

  test('App records completed training and rest without adding a second save path', () => {
    const trainStart = APP.indexOf('const handleTrainStat');
    const trainEnd = APP.indexOf('const handleBuyItem', trainStart);
    const train = APP.slice(trainStart, trainEnd);
    expect(train).toContain('isTrainingActionScheduled(profile, stat)');
    expect(train).toContain('recordPhysicalTraining({');
    expect(train).toContain('advanceTimeBy(trained, 1)');
    expect(train.match(/saveProfile\\(/g)?.length).toBe(1);

    const medicalStart = APP.indexOf('const handleTreatInjury');
    const medicalEnd = APP.indexOf('const handleRestAtInn', medicalStart);
    const medical = APP.slice(medicalStart, medicalEnd);
    expect(medical).toContain('recordPhysicalRecovery(result.profile, resolveTimeState(profile).day)');
    expect(medical.match(/saveProfile\\(/g)?.length).toBe(1);

    const innStart = APP.indexOf('const handleRestAtInn');
    const innEnd = APP.indexOf('const handleBuyRacingConfig', innStart);
    const inn = APP.slice(innStart, innEnd);
    expect(inn).toContain('recordPhysicalRecovery(toDawn, resolveTimeState(profile).day)');
    expect(inn.match(/saveProfile\\(/g)?.length).toBe(1);
  });
});
