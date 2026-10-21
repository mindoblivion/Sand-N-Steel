/**
 * Living City L5 — the authoritative training transaction.
 *
 * This suite drives the REAL `trainStat` over real profiles and the real
 * catalogue, so the guarantees the phase is judged by are measured rather than
 * inferred from a disabled button:
 *
 *   §A  the schedule is the gate — a drill resting today is refused even when
 *       the handler is called directly, and every scheduled drill is accepted;
 *   §B  the purse — insufficient gold leaves the profile byte-identical;
 *   §C  the session — one deduction and one stat point, at the SHIPPED cost
 *       (`25 × level`), with no other field touched;
 *   §D  the clock — training never advances the city day, and a legacy save
 *       keeps having no `day` field;
 *   §E  atomicity and purity — one new profile, unrelated fields by identity,
 *       the input never mutated, refusals hand back nothing to commit;
 *   §F  the wiring — App delegates to this transaction (never to its own gold
 *       arithmetic, never to the schedule directly) and the screen renders the
 *       same resolver's timetable.
 *
 * Run with: `bun test src/utils/trainingSession.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via `bun test`
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { TRAINING_ACTIONS, getTrainingAction, trainingCost } from '../data/training';
import { createNewProfile } from '../services/storage';
import type { PlayerProfile } from '../types/game';
import { resolveCityDay } from './cityClock';
import { resolveTrainingSchedule } from './trainingSchedule';
import { trainStat } from './trainingSession';

const code = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const SESSION_CODE = code('./trainingSession.ts');
const APP_CODE = code('../App.tsx');
const TAB_CODE = code('../components/hub/TrainingTab.tsx');

const CATALOGUE_IDS = TRAINING_ACTIONS.map((action) => action.id);

/** A profile sitting on a known city day with a chosen purse. */
function profileOn(day: number, gold = 1000, level = 1): PlayerProfile {
  return { ...createNewProfile('Trainee'), gold, level, city: { day } };
}

/** The drill that rests on that day (the transaction must refuse it). */
function restingIdOn(day: number): string {
  return resolveTrainingSchedule({ city: { day } }).resting[0].id;
}

/** A drill the yard runs that day (the transaction must accept it). */
function scheduledIdOn(day: number): string {
  return resolveTrainingSchedule({ city: { day } }).actions[0].id;
}

describe('§A the schedule is the gate', () => {
  test("a drill resting today is refused even when the handler is called directly", () => {
    for (const day of [1, 2, 3, 4, 7]) {
      const profile = profileOn(day);
      const result = trainStat(profile, restingIdOn(day));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('not-scheduled');
    }
  });

  test('the refusal leaves gold and stats exactly as they were', () => {
    const profile = profileOn(1);
    const snapshot = JSON.stringify(profile);
    trainStat(profile, restingIdOn(1));
    expect(JSON.stringify(profile)).toBe(snapshot);
  });

  test('every scheduled drill is accepted', () => {
    const day = 6;
    for (const id of resolveTrainingSchedule({ city: { day } }).actions.map((a) => a.id)) {
      const result = trainStat(profileOn(day), id);
      expect(result.ok).toBe(true);
    }
  });

  test('the same drill is refused on its rest day and accepted on another', () => {
    const resting = restingIdOn(1);
    expect(trainStat(profileOn(1), resting).ok).toBe(false);
    const otherDay = [2, 3, 4].find((day) =>
      resolveTrainingSchedule({ city: { day } }).actions.some((a) => a.id === resting)
    ) as number;
    expect(trainStat(profileOn(otherDay), resting).ok).toBe(true);
  });

  test('an id the Ludus does not train is refused', () => {
    const result = trainStat(profileOn(1), 'charisma');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unknown-action');
  });

  test('a missing profile is refused', () => {
    expect(trainStat(null, 'strength').ok).toBe(false);
    expect(trainStat(undefined, 'strength').ok).toBe(false);
  });
});

describe('§B the purse', () => {
  test('insufficient gold leaves the profile unchanged', () => {
    const day = 3;
    const id = scheduledIdOn(day);
    const cost = trainingCost(1);
    const profile = profileOn(day, cost - 1);
    const snapshot = JSON.stringify(profile);
    const result = trainStat(profile, id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('insufficient-gold');
    expect(JSON.stringify(profile)).toBe(snapshot);
  });

  test('exactly enough gold is accepted and leaves zero', () => {
    const day = 3;
    const id = scheduledIdOn(day);
    const cost = trainingCost(1);
    const result = trainStat(profileOn(day, cost), id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.gold).toBe(0);
      expect(result.cost).toBe(cost);
    }
  });

  test('the schedule is checked before the purse', () => {
    const profile = profileOn(1, 0);
    const result = trainStat(profile, restingIdOn(1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not-scheduled');
  });
});

describe('§C the session', () => {
  test('a scheduled session applies the shipped cost and one stat point', () => {
    const day = 3;
    const id = scheduledIdOn(day);
    const profile = profileOn(day, 100, 1);
    const before = profile.baseStats[id as 'strength'];
    const result = trainStat(profile, id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cost).toBe(25);
    expect(result.profile.gold).toBe(75);
    expect(result.profile.baseStats[id as 'strength']).toBe(before + 1);
    expect(result.action).toEqual(getTrainingAction(id)!);
  });

  test('the cost scales with level exactly as the shipped rule did', () => {
    for (const level of [1, 2, 5, 12]) {
      const day = 4;
      const id = scheduledIdOn(day);
      const result = trainStat(profileOn(day, 10_000, level), id);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.cost).toBe(25 * level);
        expect(result.profile.gold).toBe(10_000 - 25 * level);
      }
    }
  });

  test('only the trained stat moves, and only by one', () => {
    const day = 5;
    const id = scheduledIdOn(day);
    const profile = profileOn(day, 500);
    const result = trainStat(profile, id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const stat of CATALOGUE_IDS) {
      const expected = profile.baseStats[stat] + (stat === id ? 1 : 0);
      expect(result.profile.baseStats[stat]).toBe(expected);
    }
  });

  test('two sessions in a row charge twice and add twice', () => {
    const day = 7;
    const id = scheduledIdOn(day);
    const profile = profileOn(day, 100);
    const first = trainStat(profile, id);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = trainStat(first.profile, id);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.profile.gold).toBe(50);
    expect(second.profile.baseStats[id as 'strength']).toBe(profile.baseStats[id as 'strength'] + 2);
  });
});

describe('§D the clock', () => {
  test('training never advances the city day', () => {
    for (const day of [1, 4, 9]) {
      const id = scheduledIdOn(day);
      const result = trainStat(profileOn(day), id);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.profile.city?.day).toBe(day);
    }
  });

  test('a legacy save keeps having no day field after training', () => {
    const legacy = createNewProfile('Legacy');
    legacy.gold = 500;
    expect(legacy.city).toBeUndefined();
    const id = scheduledIdOn(1);
    const result = trainStat(legacy, id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.city).toBeUndefined();
    expect(resolveCityDay(result.profile)).toBe(1);
  });

  test('the transaction names no clock advance', () => {
    expect(SESSION_CODE).not.toContain('advanceCityDay');
    expect(SESSION_CODE).not.toContain('nextCityDay');
    expect(SESSION_CODE).not.toMatch(/setInterval|setTimeout|Math\.random/);
    expect(SESSION_CODE).not.toMatch(/localStorage|sessionStorage|saveProfile/);
  });
});

describe('§E atomicity and purity', () => {
  test('a success is ONE new profile carrying unrelated fields by identity', () => {
    const profile = profileOn(2, 200);
    const result = trainStat(profile, scheduledIdOn(2));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile).not.toBe(profile);
    expect(result.profile.city).toBe(profile.city);
    expect(result.profile.equipped).toBe(profile.equipped);
    expect(result.profile.inventory).toBe(profile.inventory);
    expect(result.profile.name).toBe(profile.name);
    expect(result.profile.level).toBe(profile.level);
  });

  test('the caller profile is never mutated on any path', () => {
    const day = 8;
    const profile = profileOn(day, 100);
    const snapshot = JSON.stringify(profile);
    trainStat(profile, scheduledIdOn(day));
    trainStat(profile, restingIdOn(day));
    trainStat(profile, 'charisma');
    trainStat(profileOn(day, 0), scheduledIdOn(day));
    expect(JSON.stringify(profile)).toBe(snapshot);
  });

  test('a refusal reports no profile to commit', () => {
    const refused = trainStat(profileOn(1), restingIdOn(1));
    expect(refused).toEqual({ ok: false, reason: 'not-scheduled' });
    expect('profile' in refused).toBe(false);
  });

  test('an existing city record is carried through untouched', () => {
    const day = 6;
    const profile = profileOn(day, 200);
    profile.city = { day, merchantPurchaseDay: day };
    const result = trainStat(profile, scheduledIdOn(day));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.city).toEqual({ day, merchantPurchaseDay: day });
    }
  });

  test('training writes no training record and leaves the dormant session field alone', () => {
    const day = 5;
    const profile = profileOn(day, 200);
    const result = trainStat(profile, scheduledIdOn(day));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.profile.trainingSessionsLeft).toBe(profile.trainingSessionsLeft);
      expect(result.profile.city).toEqual({ day });
    }
  });
});

describe('§F the wiring', () => {
  test('App trains only through the transaction', () => {
    const handler = APP_CODE.slice(
      APP_CODE.indexOf('const handleTrainStat'),
      APP_CODE.indexOf('const handleBuyItem')
    );
    expect(handler).toContain('trainStat(profileRef.current, stat)');
    expect(handler).toContain('if (!result.ok) return;');
    expect(handler).toContain('setProfile(updated)');
    expect(handler).toContain('saveProfile(updated)');
    // The handler no longer computes the cost or the stat itself.
    expect(handler).not.toContain('25 *');
    expect(handler).not.toContain('baseStats');
    expect(handler).not.toContain('gold');
    // It reads the newest committed profile, the L4 purchase pattern.
    expect(handler).toContain('profileRef.current');
  });

  test('the screen renders the shared timetable and cost, and offers every drill', () => {
    expect(TAB_CODE).toContain('resolveTrainingSchedule(profile)');
    expect(TAB_CODE).toContain('trainingCost(profile.level)');
    expect(TAB_CODE).toContain('TRAINING_ACTIONS.map');
    expect(TAB_CODE).toContain('scheduledIds.has(action.id)');
    expect(TAB_CODE).toContain('disabled={!enabled}');
    expect(TAB_CODE).not.toContain('25 *');
    expect(TAB_CODE).not.toMatch(/localStorage|saveProfile|advanceCityDay/);
  });

  test('the transaction reads the one schedule and the one catalogue', () => {
    expect(SESSION_CODE).toContain("from './trainingSchedule'");
    expect(SESSION_CODE).toContain("from '../data/training'");
    expect(SESSION_CODE).toContain('isTrainingActionScheduled');
    expect(SESSION_CODE).toContain('getTrainingAction');
    expect(SESSION_CODE).toContain('trainingCost');
  });
});
