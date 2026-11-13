/**
 * ===========================================================================
 * INTENSIVE TRAINING — the honesty suite
 * ===========================================================================
 * The slice's own pins, one section per claim the brief and the five Director
 * rulings make (canon: building-keepers.md §2.9, Shops §1.8):
 *
 *   §A the PRICE — the course costs the yard session's price, tripled: 75
 *      gold at level 1 with an unupgraded yard, 300 at level 4, and the
 *      triple holds at every level;
 *   §B the GATE — the course is refused below level 3, whatever the purse
 *      holds, and opens at level 3;
 *   §C the TIMETABLE — the drill resting today is refused, and a scheduled
 *      drill passes the timetable (the same deterministic schedule that
 *      governs the yard);
 *   §D the PURSE — a purse that cannot cover 3x the price is refused before
 *      any arithmetic, and the profile is left exactly as it was;
 *   §E the EFFECT — a success debits exactly 3x the session price, adds +2
 *      to the one stat (the others untouched), and records ONE session
 *      through the physique record, the same as a yard session;
 *   §F the PURITY & LINES — the module never mutates its argument, and the
 *      refusal and success lines are Rufus's, printed from the module.
 *
 * Run with: `bun test src/utils/intensiveTraining.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';

import type { PlayerProfile } from '../types/game';
import { createNewProfile } from '../services/storage';
import { resolveTrainingSchedule } from './trainingSchedule';
import { resolvePhysicalDevelopment } from './physicalDevelopment';
import { trainingCost } from './facilityProgression';
import {
  INTENSIVE_LEVEL_MIN,
  INTENSIVE_PRICE_MULTIPLIER,
  INTENSIVE_STAT_GAIN,
  applyIntensiveTraining,
  intensiveCourseCost,
  intensiveRefusal,
  intensiveRefusalLine,
  intensiveSuccessLine,
  isIntensiveQualified,
} from './intensiveTraining';

/** A fresh profile at a chosen level and purse. */
const profile = (overrides: Partial<PlayerProfile> = {}): PlayerProfile => ({
  ...createNewProfile('Intensive Course'),
  gold: 1000,
  level: 3,
  ...overrides,
});

/** A drill scheduled today, and the one drill resting today. */
const scheduledStat = (p: PlayerProfile) =>
  resolveTrainingSchedule(p).actions[0].id as 'strength' | 'agility' | 'stamina' | 'defense';
const restingStat = (p: PlayerProfile) =>
  resolveTrainingSchedule(p).resting[0].id as 'strength' | 'agility' | 'stamina' | 'defense';

describe('§A the price', () => {
  test('the course is three times the yard session, at every level', () => {
    expect(INTENSIVE_PRICE_MULTIPLIER).toBe(3);
    for (const level of [1, 2, 3, 4, 7]) {
      const p = profile({ level });
      expect(intensiveCourseCost(p)).toBe(trainingCost(p) * 3);
    }
  });

  test('75 gold at level 1 with an unupgraded yard, 300 at level 4', () => {
    expect(intensiveCourseCost(profile({ level: 1 }))).toBe(75);
    expect(intensiveCourseCost(profile({ level: 4 }))).toBe(300);
  });
});

describe('§B the gate', () => {
  test('the course is refused below level 3, whatever the purse holds', () => {
    expect(INTENSIVE_LEVEL_MIN).toBe(3);
    for (const level of [1, 2]) {
      const p = profile({ level, gold: 100000 });
      expect(isIntensiveQualified(p)).toBe(false);
      expect(intensiveRefusal(p, scheduledStat(p))).toBe('below-level');
      expect(applyIntensiveTraining(p, scheduledStat(p))).toEqual({
        ok: false,
        reason: 'below-level',
      });
    }
  });

  test('the course opens at level 3', () => {
    const p = profile({ level: 3 });
    expect(isIntensiveQualified(p)).toBe(true);
    expect(intensiveRefusal(p, scheduledStat(p))).toBe(null);
  });
});

describe('§C the timetable', () => {
  test('the drill resting today is refused, and a scheduled drill passes', () => {
    const p = profile();
    expect(resolveTrainingSchedule(p).resting.length).toBe(1);
    expect(intensiveRefusal(p, restingStat(p))).toBe('not-scheduled');
    expect(applyIntensiveTraining(p, restingStat(p))).toEqual({
      ok: false,
      reason: 'not-scheduled',
    });
    expect(intensiveRefusal(p, scheduledStat(p))).toBe(null);
  });
});

describe('§D the purse', () => {
  test('a purse that cannot cover 3x the price is refused before any arithmetic', () => {
    const p = profile({ gold: intensiveCourseCost(profile()) - 1 });
    const before = JSON.stringify(p);
    expect(intensiveRefusal(p, scheduledStat(p))).toBe('insufficient-gold');
    const result = applyIntensiveTraining(p, scheduledStat(p));
    expect(result).toEqual({ ok: false, reason: 'insufficient-gold' });
    expect(JSON.stringify(p)).toBe(before);
  });

  test('exactly the price still runs', () => {
    const p = profile({ gold: intensiveCourseCost(profile()) });
    expect(intensiveRefusal(p, scheduledStat(p))).toBe(null);
  });
});

describe('§E the effect', () => {
  test('a success debits exactly 3x the session price and adds +2 to the one stat', () => {
    const p = profile();
    const stat = scheduledStat(p);
    const cost = intensiveCourseCost(p);
    const before = p.baseStats[stat];
    const result = applyIntensiveTraining(p, stat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.gold).toBe(p.gold - cost);
    expect(result.profile.baseStats[stat]).toBe(before + INTENSIVE_STAT_GAIN);
    for (const other of ['strength', 'agility', 'stamina', 'defense'] as const) {
      if (other === stat) continue;
      expect(result.profile.baseStats[other]).toBe(p.baseStats[other]);
    }
  });

  test('a success records ONE session, the same as a yard session', () => {
    const p = profile();
    const stat = scheduledStat(p);
    const before = resolvePhysicalDevelopment(p.appearance.physique);
    const result = applyIntensiveTraining(p, stat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = resolvePhysicalDevelopment(result.profile.appearance.physique);
    expect(after[`${stat}Sessions`]).toBe(before[`${stat}Sessions`] + 1);
    expect(after.trainingDays).toBeGreaterThanOrEqual(before.trainingDays);
  });
});

describe('§F the purity & lines', () => {
  test('the module never mutates its argument', () => {
    const p = profile();
    const before = JSON.stringify(p);
    applyIntensiveTraining(p, scheduledStat(p));
    applyIntensiveTraining(p, restingStat(p));
    expect(JSON.stringify(p)).toBe(before);
  });

  test('the lines are Rufus\u2019s, printed from the module', () => {
    const cost = intensiveCourseCost(profile());
    expect(intensiveRefusalLine('below-level', cost)).toContain('Three levels of blood first');
    expect(intensiveRefusalLine('not-scheduled', cost)).toContain('That drill rests today');
    expect(intensiveRefusalLine('insufficient-gold', cost)).toContain(`${cost} gold`);
    expect(intensiveSuccessLine('strength')).toContain('two points of strength');
  });
});
