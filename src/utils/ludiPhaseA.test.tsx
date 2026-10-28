/**
 * LUDI PHASE A — THE LUDI CALENDAR, the Acta's deeds, Favour and the six calendar
 * triumphs. Regression suite.
 *
 * Run with: bun test src/utils/ludiPhaseA.test.tsx
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A  the day's identity: the EXERTION day (`resolveTimeState(profile).day`), never a wall
 *       clock, and no `new Date()` on the calendar's path; the seven names; the lazy reader;
 *   §B  the deterministic draw: three DISTINCT deeds per day from the five shapes, the same
 *       day always the same Acta, different days genuinely different, and NO race deed and
 *       NO boss deed anywhere in the pool;
 *   §C  the one settlement, seam by seam: a won bout, a peak above 40 hype, a training
 *       session, a named hub visit and the 100-fame day — each paid 5 fame + 10 gold ONCE,
 *       in ONE non-recursive pass, with `deedsDone` closing the door on a repeat;
 *   §D  the third deed: one Laurel through the SHARED `records.laudes` counter (never a
 *       second field) and one Favour, with no extra gold and no extra fame;
 *   §E  the alms-day: +1 Favour once per exertion day, at a SUCCESSFUL offering only, with
 *       the Omen's price, effects and expiry untouched;
 *   §F  the rollover: the day's own state resets, Favour and the Laurel total persist;
 *   §G  the six saga rows: 10 fame at 7 and 30, 25 at 100, no titles, evaluated at a duel
 *       result by the EXISTING evaluator;
 *   §H  the shipped wiring, pinned by source the way this repo's App-level suites do it;
 *   §I  the surfaces: the city's Acta card, Felix's section on the Bounty Hall's board, the
 *       training yard's session read and the Library's two tallies;
 *   §J  the save corpus: the `ludi` fixture, and older saves that omit the field.
 *
 * `.tsx`, not `.ts`: it renders JSX and bun's `.ts` transform rejects it.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect, beforeEach } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { LudiProgress, PlayerProfile } from '../types/game';
import { createNewProfile } from '../services/storage';
import { PHASES_PER_DAY, resolveTimeState } from './timeState';
import { LUDI_ROTATION, ludiDayName, ludiIndexForDay, LUDI_QUIETUS_INDEX } from './dayRollover';
import { resolveLaudes, withLaudes } from './diceTrail';
import {
  LUDI_DAY_CHARACTER,
  LUDI_DAY_FAME_TARGET,
  LUDI_DEEDS,
  LUDI_DEED_COUNT,
  LUDI_DEED_FAME,
  LUDI_DEED_GOLD,
  LUDI_LAUREL_FAVOUR,
  LUDI_PEAK_HYPE_TARGET,
  applyLudiRollover,
  ludiDeedsForDay,
  ludiSessionsRefreshed,
  resolveLudiDay,
  resolveLudiProgress,
  resolveLudiState,
  settleLudiDeeds,
  withLudiAlms,
} from './ludiCalendar';
import {
  SHIPPED_TRIUMPHS,
  applyTriumphAwards,
  evaluateTriumphs,
  getTriumphEntry,
  resolveTriumphFacts,
  triumphFame,
} from './triumphs';
import { getKeeper, getKeeperForBuilding } from '../data/keepers';
import { BountyBoardPanel } from '../components/hub/BountyBoardPanel';
import { ActaCard, actaDismissedThisSession, dismissActaThisSession, resetActaSession } from '../components/hub/ActaCard';
import { TrainingTab } from '../components/hub/TrainingTab';
import { LibraryTab } from '../components/hub/LibraryTab';
import { SAVE_FIXTURES } from './saveFixtures';

// ── Sources ────────────────────────────────────────────────────────────────
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
const code = (rel: string): string =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const APP = code('App.tsx');

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else out.push(full);
  }
  return out;
}

// ── Profiles ───────────────────────────────────────────────────────────────

/** A profile woken on the given exertion day (phase index 2, midday). */
const onDay = (day: number, patch: Partial<PlayerProfile> = {}): PlayerProfile => ({
  ...createNewProfile('Calendar Tester'),
  time: { total: (day - 1) * PHASES_PER_DAY + 2 },
  ...patch,
});

const ludi = (patch: Partial<LudiProgress> = {}): LudiProgress => ({
  day: 1,
  deedsDone: [],
  favour: 0,
  lastAlmsDay: 0,
  fameBaseline: 0,
  visitsToday: 0,
  ...patch,
});

/** A day whose Acta is known to draw exactly these ids (pinned by §B's own table). */
const DAY_WITH = { winAndTrain: 10, trainHypeVisit: 12, winDuelOnly: 2 };

// ── §A the day's identity ─────────────────────────────────────────────────
describe('LUDI A §A — the day is the exertion day, never a clock', () => {
  test('resolveLudiState answers the day resolveTimeState resolves', () => {
    for (const total of [0, 1, 6, 7, 26, 79, 104]) {
      const profile = { ...createNewProfile('x'), time: { total } };
      const expected = resolveTimeState(profile).day;
      expect(resolveLudiDay(profile)).toBe(expected);
      expect(resolveLudiState(profile).day).toBe(expected);
      expect(resolveLudiState(profile).dayName).toBe(ludiDayName(expected));
    }
    // Day 1 at dawn, Day 2 at the seventh phase's successor, and the seven-day wrap.
    expect(resolveLudiState({ ...createNewProfile('x'), time: { total: 0 } }).dayName).toBe('Dies Mercatus');
    expect(resolveLudiState({ ...createNewProfile('x'), time: { total: 7 } }).dayName).toBe('Dies Ferratus');
    // The last phase of day 1 is still day 1; the seventh day is the Quiet one.
    expect(resolveLudiState({ ...createNewProfile('x'), time: { total: 6 } }).dayName).toBe('Dies Mercatus');
    expect(resolveLudiState({ ...createNewProfile('x'), time: { total: 6 * 7 } }).dayName).toBe('Dies Quietus');
  });

  test('the seven names and their seven characters are the same rotation', () => {
    expect(LUDI_ROTATION.length).toBe(7);
    expect(LUDI_DAY_CHARACTER.length).toBe(LUDI_ROTATION.length);
    for (let day = 1; day <= 7; day += 1) {
      const state = resolveLudiState(onDay(day));
      expect(state.dayName).toBe(LUDI_ROTATION[day - 1]);
      expect(state.characterLine).toBe(LUDI_DAY_CHARACTER[ludiIndexForDay(day)]);
      expect(state.characterLine.length).toBeGreaterThan(10);
    }
  });

  test('no calendar module reads the wall clock', () => {
    for (const rel of [
      'utils/ludiCalendar.ts',
      'utils/dayRollover.ts',
      'utils/timeState.ts',
      'components/hub/ActaCard.tsx',
      'components/hub/BountyBoardPanel.tsx',
    ]) {
      expect(code(rel), rel).not.toContain('new Date');
      expect(code(rel), rel).not.toContain('Date.now');
      expect(code(rel), rel).not.toContain('performance.now');
    }
  });

  test('a save with no `ludi` field resolves as a fresh day and gains no field', () => {
    const legacy = onDay(4);
    const before = JSON.stringify(legacy);
    const state = resolveLudiState(legacy);
    expect(state.favour).toBe(0);
    expect(state.laudes).toBe(0);
    expect(state.deedsDone).toEqual([]);
    expect(state.remaining).toBe(LUDI_DEED_COUNT);
    expect(JSON.stringify(legacy)).toBe(before);
    expect(resolveLudiProgress(legacy)).toEqual({
      day: 0,
      deedsDone: [],
      favour: 0,
      lastAlmsDay: 0,
      fameBaseline: 0,
      visitsToday: 0,
    });
  });

  test('a malformed `ludi` field resolves total rather than throwing', () => {
    for (const junk of [null, 42, 'x', [], { day: 'x', deedsDone: 'nope', favour: -5 }]) {
      const profile = { ...onDay(3), ludi: junk as unknown as LudiProgress };
      const state = resolveLudiState(profile);
      expect(state.favour).toBe(0);
      expect(state.deedsDone).toEqual([]);
      expect(state.deeds.length).toBe(LUDI_DEED_COUNT);
    }
    // Unknown deed ids are dropped; a real one survives.
    const state = resolveLudiState({ ...onDay(3), ludi: ludi({ day: 3, deedsDone: ['nope', 'train', 'train'] }) });
    expect(resolveLudiProgress({ ...onDay(3), ludi: ludi({ day: 3, deedsDone: ['nope', 'train', 'train'] }) }).deedsDone).toEqual(['train']);
    expect(state.deeds.length).toBe(LUDI_DEED_COUNT);
  });
});

// ── §B the deterministic draw ─────────────────────────────────────────────
describe('LUDI B §B — three distinct deeds, drawn by the day alone', () => {
  test('the pool is the five shapes and holds no race deed and no boss deed', () => {
    expect(LUDI_DEEDS.length).toBe(5);
    const ids = LUDI_DEEDS.map((deed) => deed.id);
    expect(ids).toEqual(['win_duel', 'peak_hype', 'train', 'visit_hub', 'earn_fame']);
    for (const deed of LUDI_DEEDS) {
      for (const forbidden of ['race', 'chariot', 'circus', 'boss', 'champion']) {
        expect(deed.id.toLowerCase()).not.toContain(forbidden);
        expect(deed.label.toLowerCase()).not.toContain(forbidden);
      }
      expect(deed.label.endsWith('.')).toBe(true);
    }
  });

  test('every day draws three DISTINCT deeds from the pool', () => {
    for (let day = 1; day <= 70; day += 1) {
      const drawn = ludiDeedsForDay(day);
      expect(drawn.length).toBe(LUDI_DEED_COUNT);
      expect(new Set(drawn).size).toBe(LUDI_DEED_COUNT);
      for (const id of drawn) expect(LUDI_DEEDS.map((deed) => deed.id)).toContain(id);
    }
  });

  test('the same day always draws the same three — order included', () => {
    for (let day = 1; day <= 30; day += 1) {
      expect(ludiDeedsForDay(day)).toEqual(ludiDeedsForDay(day));
      // Same day, different profile: the Acta is a property of the DAY, not of the save.
      const a = onDay(day);
      const b = onDay(day, { fame: 5000, gold: 1, fightsWon: 9 });
      expect(resolveLudiState(a).deeds.map((entry) => entry.deed.id)).toEqual(
        resolveLudiState(b).deeds.map((entry) => entry.deed.id),
      );
    }
  });

  test('different days genuinely differ, and every deed shape is asked for', () => {
    const signatures = new Set<string>();
    const seen = new Set<string>();
    for (let day = 1; day <= 14; day += 1) {
      const drawn = ludiDeedsForDay(day);
      signatures.add([...drawn].sort().join('+'));
      drawn.forEach((id) => seen.add(id));
    }
    expect(signatures.size).toBeGreaterThanOrEqual(7);
    expect([...seen].sort()).toEqual(LUDI_DEEDS.map((deed) => deed.id).sort());
  });

  test('the pinned draws the suite builds on are what the shipped hash answers', () => {
    // Recorded so a change to the hash is a deliberate, visible decision.
    expect(ludiDeedsForDay(2)).toEqual(['peak_hype', 'earn_fame', 'win_duel']);
    expect(ludiDeedsForDay(10)).toEqual(['earn_fame', 'win_duel', 'train']);
    expect(ludiDeedsForDay(12)).toEqual(['train', 'peak_hype', 'visit_hub']);
  });

  test('a non-finite or fractional day is normalised, never an empty Acta', () => {
    expect(ludiDeedsForDay(Number.NaN)).toEqual(ludiDeedsForDay(1));
    expect(ludiDeedsForDay(12.9)).toEqual(ludiDeedsForDay(12));
  });
});

// ── §C the one settlement ─────────────────────────────────────────────────
describe('LUDI C §C — deed completion inside the shipped save paths', () => {
  const state = (profile: PlayerProfile) => resolveLudiState(profile);

  test('a victory pays the drawn victory deed once: 5 fame and 10 gold', () => {
    const start = onDay(DAY_WITH.winDuelOnly, { fame: 0, gold: 100, ludi: ludi({ day: DAY_WITH.winDuelOnly, fameBaseline: 900 }) });
    expect(state(start).deeds.map((entry) => entry.deed.id)).toContain('win_duel');
    const first = settleLudiDeeds(start, { won: true, atDuelResult: true });
    expect(first.completed.map((deed) => deed.id)).toEqual(['win_duel']);
    expect(first.profile.fame).toBe(LUDI_DEED_FAME);
    expect(first.profile.gold).toBe(100 + LUDI_DEED_GOLD);
    expect(first.laurelEarned).toBe(false);
    // A repeat settlement of the same event pays nothing and hands back the SAME object.
    const again = settleLudiDeeds(first.profile, { won: true, atDuelResult: true });
    expect(again.completed).toEqual([]);
    expect(again.profile).toBe(first.profile);
    expect(again.profile.fame).toBe(LUDI_DEED_FAME);
  });

  test('the peak-hype deed needs a WIN above 40 hype — 40 exactly is not enough', () => {
    const withHype = (peak: number) =>
      settleLudiDeeds(
        onDay(DAY_WITH.winDuelOnly, { ludi: ludi({ day: DAY_WITH.winDuelOnly, deedsDone: ['win_duel'], fameBaseline: 900 }) }),
        { won: true, crowdHypePeak: peak, atDuelResult: true },
      ).completed.map((deed) => deed.id);
    expect(LUDI_PEAK_HYPE_TARGET).toBe(40);
    expect(withHype(40)).toEqual([]);
    expect(withHype(41)).toEqual(['peak_hype']);
    // A defeat at any hype earns nothing.
    expect(
      settleLudiDeeds(
        onDay(DAY_WITH.winDuelOnly, { ludi: ludi({ day: DAY_WITH.winDuelOnly, deedsDone: ['win_duel'], fameBaseline: 900 }) }),
        { won: false, crowdHypePeak: 99, atDuelResult: true },
      ).completed,
    ).toEqual([]);
  });

  test('a training session completes the draw’s training deed', () => {
    const start = onDay(DAY_WITH.winAndTrain, { ludi: ludi({ day: DAY_WITH.winAndTrain, fameBaseline: 900 }) });
    expect(state(start).deeds.map((entry) => entry.deed.id)).toContain('train');
    const trained = settleLudiDeeds(start, { trained: true });
    expect(trained.completed.map((deed) => deed.id)).toEqual(['train']);
    expect(trained.profile.fame).toBe(LUDI_DEED_FAME);
  });

  test('a named hub visit is counted every time and pays the deed once', () => {
    const start = onDay(DAY_WITH.trainHypeVisit, { ludi: ludi({ day: DAY_WITH.trainHypeVisit }) });
    const first = settleLudiDeeds(start, { visited: true });
    expect(first.completed.map((deed) => deed.id)).toEqual(['visit_hub']);
    expect(resolveLudiProgress(first.profile).visitsToday).toBe(1);
    const second = settleLudiDeeds(first.profile, { visited: true });
    expect(second.completed).toEqual([]);
    expect(resolveLudiProgress(second.profile).visitsToday).toBe(2);
    expect(second.profile.fame).toBe(first.profile.fame);
    // An unrelated settlement with no visit changes nothing at all.
    expect(settleLudiDeeds(second.profile, {}).profile).toBe(second.profile);
  });

  test('the 100-fame day is decided at a duel result, over the day’s own baseline', () => {
    const base = onDay(DAY_WITH.winAndTrain, {
      fame: LUDI_DAY_FAME_TARGET - 1,
      ludi: ludi({ day: DAY_WITH.winAndTrain, deedsDone: ['win_duel', 'train'], fameBaseline: 0 }),
    });
    expect(LUDI_DAY_FAME_TARGET).toBe(100);
    // 99 over the baseline: not yet.
    expect(settleLudiDeeds(base, { atDuelResult: true }).completed).toEqual([]);
    // Nor outside a duel result, however high the fame stands.
    const rich = { ...base, fame: 500 };
    expect(settleLudiDeeds(rich, {}).completed).toEqual([]);
    expect(settleLudiDealsGuard(rich)).toEqual(['earn_fame']);
  });

  /** Convenience: the fame deed at a duel result, on a profile with 500 fame. */
  function settleLudiDealsGuard(profile: PlayerProfile) {
    return settleLudiDeeds(profile, { atDuelResult: true }).completed.map((deed) => deed.id);
  }

  test('THE SINGLE PASS: a deed’s reward can never satisfy another deed in the same transaction', () => {
    // Day 10 draws earn_fame + win_duel + train. The victory's own 5 fame takes the
    // gladiator from 96 to 101 — over the 100 mark — and the fame deed must STILL be
    // unpaid in that pass, then pay on the next settlement.
    const start = onDay(DAY_WITH.winAndTrain, {
      fame: 96,
      ludi: ludi({ day: DAY_WITH.winAndTrain, deedsDone: ['train'], fameBaseline: 0 }),
    });
    const first = settleLudiDeeds(start, { won: true, atDuelResult: true });
    expect(first.completed.map((deed) => deed.id)).toEqual(['win_duel']);
    expect(first.profile.fame).toBe(101);
    const second = settleLudiDeeds(first.profile, { atDuelResult: true });
    expect(second.completed.map((deed) => deed.id)).toEqual(['earn_fame']);
    expect(second.profile.fame).toBe(106);
  });
});

// ── §D the third deed ─────────────────────────────────────────────────────
describe('LUDI D §D — the day’s third deed pays one Laurel and one Favour', () => {
  test('completing all three pays records.laudes +1 and favour +1, no extra gold or fame', () => {
    const start = onDay(DAY_WITH.trainHypeVisit, {
      fame: 10,
      gold: 100,
      records: { laudes: 4 },
      ludi: ludi({ day: DAY_WITH.trainHypeVisit, fameBaseline: 10 }),
    });
    const done = settleLudiDeeds(start, { won: true, crowdHypePeak: 70, trained: true, visited: true, atDuelResult: true });
    expect(done.completed.map((deed) => deed.id).sort()).toEqual(['peak_hype', 'train', 'visit_hub']);
    expect(done.laurelEarned).toBe(true);
    expect(done.favourEarned).toBe(LUDI_LAUREL_FAVOUR);
    // Exactly the deeds' own pay: three at 5 fame / 10 gold.
    expect(done.profile.fame).toBe(10 + 3 * LUDI_DEED_FAME);
    expect(done.profile.gold).toBe(100 + 3 * LUDI_DEED_GOLD);
    // The Laurel rides the SHARED counter — 4 + 1, no second field anywhere.
    expect(resolveLaudes(done.profile)).toBe(5);
    expect(Object.keys(done.profile.records ?? {})).toContain('laudes');
    expect(done.profile.ludi?.favour).toBe(1);
    expect(resolveLudiState(done.profile).allDone).toBe(true);
    // And it never pays twice.
    const again = settleLudiDeeds(done.profile, { won: true, crowdHypePeak: 70, trained: true, visited: true });
    expect(again.laurelEarned).toBe(false);
    expect(resolveLaudes(again.profile)).toBe(5);
    expect(again.profile.ludi?.favour).toBe(1);
  });

  test('two deeds pay two deed rewards and NO Laurel', () => {
    const start = onDay(DAY_WITH.trainHypeVisit, {
      fame: 0,
      gold: 0,
      ludi: ludi({ day: DAY_WITH.trainHypeVisit, fameBaseline: 900 }),
    });
    const two = settleLudiDeeds(start, { trained: true, visited: true });
    expect(two.completed.length).toBe(2);
    expect(two.laurelEarned).toBe(false);
    expect(resolveLaudes(two.profile)).toBe(0);
    expect(two.profile.ludi?.favour).toBe(0);
  });

  test('the Laurel is the counter `withLaudes` writes — never a forked field', () => {
    const start = onDay(DAY_WITH.trainHypeVisit, { records: { laudes: 7 }, ludi: ludi({ day: DAY_WITH.trainHypeVisit }) });
    const done = settleLudiDeeds(start, { won: true, crowdHypePeak: 90, trained: true, visited: true });
    expect(resolveLaudes(done.profile)).toBe(8);
    expect(resolveLaudes(withLaudes(start, 1))).toBe(8);
    // No other key of the profile carries a Laurel count.
    // The ONLY key that mentions a laurel is the pre-existing fame-honours shop field;
    // nothing else on the profile carries a count of them.
    const keys = Object.keys(done.profile).filter((key) => /laurel/i.test(key));
    for (const key of keys) expect(key).toBe('laurels');
  });
});

// ── §E the alms-day ───────────────────────────────────────────────────────
describe('LUDI E §E — one Favour per alms-day, at a successful offering only', () => {
  test('the first alms of the day pays +1 Favour and the second pays nothing', () => {
    const start = onDay(5);
    const first = withLudiAlms(start);
    expect(first.ludi?.favour).toBe(1);
    expect(first.ludi?.lastAlmsDay).toBe(5);
    expect(first.ludi?.day).toBe(5);
    const second = withLudiAlms(first);
    expect(second).toBe(first);
    // Tomorrow is a new alms-day.
    const tomorrow = withLudiAlms({ ...first, time: { total: (5) * PHASES_PER_DAY + 2 } });
    expect(tomorrow.ludi?.favour).toBe(2);
  });

  test('the alms touches no gold, no omen and nothing else', () => {
    const start = onDay(5, { gold: 100 });
    const alms = withLudiAlms(start);
    expect(alms.gold).toBe(100);
    expect(alms.fame).toBe(start.fame);
    expect(alms.omen).toBeUndefined();
  });

  test('the shrine pays it AFTER the offering is accepted, never on a refusal', () => {
    const handler = APP.slice(APP.indexOf('const handleOfferOmen'));
    const body = handler.slice(0, handler.indexOf('};') + 2);
    const refusal = body.indexOf('if (!result.ok) return result;');
    const alms = body.indexOf('withLudiAlms(result.profile)');
    expect(refusal).toBeGreaterThan(-1);
    expect(alms).toBeGreaterThan(refusal);
    // The price, the effects and the expiry are the omens module's own, untouched.
    const omens = code('utils/omens.ts');
    expect(omens).toContain('OMEN_PRICE');
    expect(omens).not.toContain('ludi');
    expect(omens).not.toContain('settleLudiDeeds');
    expect(omens).not.toContain('LUDI_');
  });
});

// ── §F the rollover ───────────────────────────────────────────────────────
describe('LUDI F §F — the rollover resets the day’s own state and keeps the rest', () => {
  test('deedsDone, fameBaseline and visitsToday reset; favour and laudes persist', () => {
    const before = onDay(3, {
      fame: 260,
      records: { laudes: 9 },
      ludi: ludi({ day: 3, deedsDone: ['train', 'visit_hub'], favour: 4, lastAlmsDay: 3, fameBaseline: 40, visitsToday: 2 }),
    });
    // `onDayRollover` hands the rollover the profile the clock step already produced,
    // so the day is read from `time` and `ludi.day` is its bookkeeping.
    const advanced = { ...before, time: { total: 3 * PHASES_PER_DAY + 2 } };
    expect(resolveTimeState(advanced).day).toBe(4);
    const after = applyLudiRollover(advanced, 4);
    expect(after.ludi).toEqual({
      day: 4,
      deedsDone: [],
      favour: 4,
      lastAlmsDay: 3,
      fameBaseline: 260,
      visitsToday: 0,
    });
    expect(resolveLaudes(after)).toBe(9);
    expect(resolveLudiState(after).dayName).toBe(ludiDayName(4));
    expect(resolveLudiState(after).remaining).toBe(LUDI_DEED_COUNT);
  });

  test('App’s onDayRollover composes it into the SAME save the other effects ride', () => {
    const seam = APP.slice(APP.indexOf('const onDayRollover'));
    const body = seam.slice(0, seam.indexOf('};') + 2);
    expect(body).toContain('applyLudiRollover(applyDayRollover(advanced, rolledTo), rolledTo)');
    // One return, no second write of its own.
    expect(body.match(/saveProfile/g)?.length ?? 0).toBe(0);
  });
});

// ── §G the six saga rows ──────────────────────────────────────────────────
describe('LUDI G §G — six fame-only saga rows, evaluated by the existing evaluator', () => {
  const IDS = ['saga_laurel_7', 'saga_laurel_30', 'saga_laurel_100', 'saga_favour_7', 'saga_favour_30', 'saga_favour_100'];

  test('all six are shipped, in Saga, and pay 10 / 10 / 25 fame with no title', () => {
    for (const id of IDS) {
      const row = getTriumphEntry(id);
      expect(row, id).toBeDefined();
      expect(row?.category).toBe('saga');
      expect(row?.dormant).toBeUndefined();
      expect(row?.requirement.length).toBeGreaterThan(10);
      expect(SHIPPED_TRIUMPHS.map((triumph) => triumph.id)).toContain(id);
    }
    expect(IDS.slice(0, 3).map((id) => triumphFame(getTriumphEntry(id)!))).toEqual([10, 10, 25]);
    expect(IDS.slice(3).map((id) => triumphFame(getTriumphEntry(id)!))).toEqual([10, 10, 25]);
    // No title is due for a calendar row: the saga title stays gated on `saga_legend`.
    const laurels = applyTriumphAwards(onDay(2, { records: { laudes: 100 } }));
    expect(laurels.titles).toEqual([]);
    const favour = applyTriumphAwards(onDay(2, { ludi: ludi({ day: 2, favour: 100 }) }));
    expect(favour.titles).toEqual([]);
  });

  test('the thresholds are exact — 6 does not hold, 7 does; 99 does not, 100 does', () => {
    const at = (laudes: number, favour: number) =>
      evaluateTriumphs(onDay(2, { records: { laudes }, ludi: ludi({ day: 2, favour }) })).map((t) => t.id);
    expect(at(6, 6)).toEqual([]);
    expect(at(7, 0)).toEqual(['saga_laurel_7']);
    expect(at(0, 7)).toEqual(['saga_favour_7']);
    expect(at(99, 99)).toEqual(['saga_laurel_7', 'saga_laurel_30', 'saga_favour_7', 'saga_favour_30']);
    expect(at(100, 100)).toEqual(IDS);
  });

  test('the evaluator reads the counters off the profile it is given', () => {
    const facts = resolveTriumphFacts(onDay(2, { records: { laudes: 12 }, ludi: ludi({ day: 2, favour: 3 }) }));
    expect(facts.laurels).toBe(12);
    expect(facts.favour).toBe(3);
  });

  test('a duel result pays them once, in the one save, and never twice', () => {
    const start = onDay(2, { fame: 0, records: { laudes: 7 }, ludi: ludi({ day: 2, favour: 7 }) });
    const awards = applyTriumphAwards(start, { won: true });
    expect(awards.earned.map((triumph) => triumph.id)).toEqual([
      'saga_laurel_7',
      'saga_favour_7',
      'sand_first_blood',
    ].filter((id) => awards.earned.some((triumph) => triumph.id === id)));
    expect(awards.earned.map((triumph) => triumph.id)).toContain('saga_laurel_7');
    expect(awards.earned.map((triumph) => triumph.id)).toContain('saga_favour_7');
    expect(awards.profile.fame).toBe(20);
    const twice = applyTriumphAwards(awards.profile, { won: true });
    expect(twice.earned).toEqual([]);
    expect(twice.profile.fame).toBe(20);
  });
});

// ── §H the shipped wiring ─────────────────────────────────────────────────
describe('LUDI H §H — where the settlement lives', () => {
  test('the duel result settles the Acta inside its ONE save', () => {
    const handler = APP.slice(APP.indexOf('const handleMatchComplete'));
    const end = handler.indexOf('const handleDuelResultDismiss');
    const body = end > -1 ? handler.slice(0, end) : handler;
    expect(body).toContain('settleLudiDeeds(trailProfile, {');
    expect(body).toContain('won: didWin');
    expect(body).toContain('crowdHypePeak: resultStats.crowdHypePeak');
    expect(body).toContain('atDuelResult: true');
    // Still the duel's ONE write.
    expect(body.match(/saveProfile\(/g)?.length).toBe(1);
    // The triumph evaluation reads the ludi-composed profile.
    expect(body).toContain('applyTriumphAwards(ludi.profile, duelTriumphStats)');
  });

  test('training and the city visit settle their own deeds', () => {
    const train = APP.slice(APP.indexOf('const handleTrainStat'), APP.indexOf('const handleBuyItem'));
    expect(train).toContain('trained: true');
    expect(train).toContain('advanceTimeBy(trained, 1)');
    const visit = APP.slice(APP.indexOf('const handleVisitLocation'));
    expect(visit.slice(0, visit.indexOf('};') + 2)).toContain('{ visited: true }');
  });

  test('no gameplay formula is touched by this slice', () => {
    const calc = code('utils/combatCalculations.ts');
    for (const token of ['ludi', 'favour', 'Acta', 'deed', 'Laurel']) {
      expect(calc.toLowerCase()).not.toContain(token.toLowerCase());
    }
    // The calendar imports no combat, no item and no opponent module.
    const calendar = code('utils/ludiCalendar.ts');
    for (const forbidden of ['combatCalculations', 'combatModifiers', 'itemsDB', 'opponents', 'Math.random']) {
      expect(calendar).not.toContain(forbidden);
    }
    // …and it never writes a save itself.
    expect(calendar).not.toContain('saveProfile');
    expect(calendar).not.toContain('localStorage');
  });
});

// ── §I the surfaces ───────────────────────────────────────────────────────
describe('LUDI I §I — the Acta card, Felix’s board section, the yard and the Library', () => {
  beforeEach(() => resetActaSession());

  const card = (profile: PlayerProfile): string =>
    renderToStaticMarkup(<ActaCard profile={profile} onDismiss={() => {}} />);

  test('the card prints the day, its character and the three deeds with done/todo', () => {
    const html = card(onDay(12, { ludi: ludi({ day: 12, deedsDone: ['train'], favour: 3 }) }));
    expect(html).toContain('data-acta-card');
    expect(html).toContain('data-acta-day-name');
    expect(html).toContain(ludiDayName(12));
    expect(html).toContain(LUDI_DAY_CHARACTER[ludiIndexForDay(12)].replace(/'/g, '&#x27;'));
    expect(html.match(/data-acta-deed=/g)?.length).toBe(LUDI_DEED_COUNT);
    expect(html).toContain('data-acta-deed="train" data-acta-deed-done="true"');
    expect(html.match(/data-acta-deed-done="false"/g)?.length).toBe(LUDI_DEED_COUNT - 1);
    expect(html).toContain('done');
    expect(html).toContain('todo');
  });

  test('the card states the sessions the new day handed back — 2, or 3 on Dies Quietus', () => {
    expect(ludiSessionsRefreshed(1)).toBe(2);
    expect(ludiSessionsRefreshed(LUDI_QUIETUS_INDEX + 1)).toBe(3);
    expect(card(onDay(1))).toContain('Training sessions refreshed: 2');
    const quietus = card(onDay(7));
    expect(quietus).toContain('Dies Quietus');
    expect(quietus).toContain('Training sessions refreshed: 3');
  });

  test('the card carries no modifier line and no unfinished-business line', () => {
    const source = code('components/hub/ActaCard.tsx');
    for (const forbidden of ['modifier', 'unfinished', 'owed', 'bonus to']) {
      expect(source.toLowerCase()).not.toContain(forbidden);
    }
    const html = card(onDay(3)).toLowerCase();
    expect(html).not.toContain('modifier');
    expect(html).not.toContain('unfinished');
  });

  test('the city card waits while a presented scene owns the screen', () => {
    // The oath beat's lock is the city's own `movementLocked`: a new gladiator swears
    // first and reads the Acta after, so the card never stacks under the oath.
    expect(code('components/3d/city/CityHubScene.tsx')).toContain('&& !movementLocked;');
  });

  test('the dismissal is session-scoped and keyed by the day', () => {
    expect(actaDismissedThisSession(3)).toBe(false);
    dismissActaThisSession(3);
    expect(actaDismissedThisSession(3)).toBe(true);
    expect(actaDismissedThisSession(4)).toBe(false);
    expect(code('components/hub/ActaCard.tsx')).not.toContain('localStorage');
    expect(code('components/hub/ActaCard.tsx')).not.toContain('sessionStorage');
    expect(code('components/hub/ActaCard.tsx')).not.toContain('saveProfile');
  });

  test('the Bounty Hall’s board heads an Acta section with FELIX’s plate, by id', () => {
    const felix = getKeeper('cornelius_felix');
    expect(felix).toBeDefined();
    expect(felix?.buildingId).toBe('bounty_hall');
    // The two-board building still answers no keeper through the building map.
    expect(getKeeperForBuilding('bounty_hall')).toBeUndefined();

    const html = renderToStaticMarkup(
      <BountyBoardPanel
        profile={onDay(9)}
        night={false}
        onEnterBout={() => {}}
        onRecordKeeperVisit={() => {}}
        onClose={() => {}}
        chapterOverride={3}
      />,
    );
    expect(html).toContain('data-acta-section');
    expect(html).toContain(`data-keeper="${felix!.id}"`);
    expect(html).toContain('Cornelius Felix');
    expect(html).toContain(felix!.firstVisitLine.replace(/'/g, '&#x27;'));
    // Scribonia keeps the bounty section, unchanged.
    expect(html).toContain('data-keeper="scribonia"');
    expect(html).toContain('data-bounty-rules');
    // The section adds no control: still the five postings plus the Deserter.
    expect(html.match(/data-bounty-enter=/g)?.length).toBe(6);
    expect(code('components/hub/BountyBoardPanel.tsx')).toContain("getKeeper('cornelius_felix')");
    expect(code('components/hub/BountyBoardPanel.tsx')).not.toContain("getKeeperForBuilding('bounty_hall')");
  });

  test('the training yard shows the day’s sessions as a READ — the gold gate is unchanged', () => {
    const yard = (profile: PlayerProfile) =>
      renderToStaticMarkup(<TrainingTab profile={profile} onTrainStat={() => {}} />);

    const fresh = yard(onDay(1));
    expect(fresh).toContain('data-training-sessions="2"');
    expect(fresh).toContain('Sessions left today: 2');

    // No sessions left and plenty of gold: every train control still works.
    const spent = yard(onDay(1, { gold: 100000, trainingSessionsLeft: 0 }));
    expect(spent).toContain('data-training-sessions="0"');
    expect(spent).not.toContain('disabled=""');

    // Gold is still the only gate.
    const broke = yard(onDay(1, { gold: 0, trainingSessionsLeft: 2 }));
    expect(broke).toContain('disabled=""');
    const source = code('components/hub/TrainingTab.tsx');
    expect(source).toContain('disabled={!canAfford}');
    expect(source).not.toContain('trainingSessionsLeft >');
  });

  test('the Library prints the Laurel and Favour totals on its own rack', () => {
    const html = renderToStaticMarkup(
      <LibraryTab profile={onDay(6, { records: { laudes: 6 }, ludi: ludi({ day: 6, favour: 2 }) })} />,
    );
    expect(html).toContain('data-library-ludi');
    expect(html).toContain('data-library-laudes="6"');
    expect(html).toContain('data-library-favour="2"');
    expect(html).toContain('Laudes 6');
    expect(html).toContain('Favour 2');
    // Read-only: the rack's own writes are the two view marks it already had.
    expect(code('components/hub/LibraryTab.tsx')).not.toContain('withLaudes');
    expect(code('components/hub/LibraryTab.tsx')).not.toContain('saveProfile');
  });
});

// ── §J the corpus ─────────────────────────────────────────────────────────
describe('LUDI J §J — the save corpus covers the new field', () => {
  test('the ludi fixture is registered and carries the shipped shape', () => {
    const fixture = SAVE_FIXTURES.find((candidate) => candidate.id === 'ludi-era');
    expect(fixture).toBeDefined();
    const raw = fixture!.profile as unknown as Record<string, unknown>;
    const field = raw.ludi as LudiProgress;
    expect(field.day).toBe(resolveTimeState(fixture!.profile).day);
    expect(field.deedsDone.length).toBe(3);
    expect(field.favour).toBe(2);
    expect(field.lastAlmsDay).toBe(field.day);
    expect(resolveLaudes(fixture!.profile)).toBe(6);
    expect(read('utils/saveFixtures/MANIFEST.md')).toContain('ludi-era');
  });

  test('every older fixture omits the field — the legacy shape a load must survive', () => {
    for (const fixture of SAVE_FIXTURES) {
      if (fixture.id === 'ludi-era') continue;
      expect(fixture.id, fixture.id).not.toBe('ludi-era');
      expect(Object.keys(fixture.profile as unknown as Record<string, unknown>)).not.toContain('ludi');
    }
  });
});
