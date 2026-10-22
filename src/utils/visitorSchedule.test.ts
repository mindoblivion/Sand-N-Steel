/**
 * Living City L10 — the visitor catalogue and the deterministic schedule.
 *
 * What this suite pins, in the repo's two registers (behaviour for pure logic,
 * ordered source assertions for the wiring this repo has no DOM renderer for):
 *
 *   §A  the catalogue — stable unique ids, bounded cadence/window values, and one
 *       well-formed, non-progression-critical offer per visitor that references
 *       real `ITEMS_DB` content the permanent spine already stocks;
 *   §B  determinism — the same day and profile always produce the same schedule,
 *       on repeated calls and across a fresh resolution;
 *   §C  the arrival rule — the resolver matches an INDEPENDENT reimplementation
 *       of the roadmap's `fnv1a(`${day}:${visitorId}`) % cadence === 0` over 400
 *       days, and both window boundaries are respected even where the hash
 *       matches;
 *   §D  day sensitivity — pinned days, and the tuning record the catalogue
 *       documents (first arrivals, and 52 of the first 90 days with a visitor);
 *   §E  completion — a completed id is excluded PERMANENTLY, while merely being
 *       seen is not completion;
 *   §F  the clock — the day comes from `resolveCityDay` / `normalizeCityDay`, and
 *       the resolver never advances it;
 *   §G  the history readers — total for absent, malformed and junk-filled arrays;
 *   §H  offers — resolved by `selectDailyWindow`, rotating with the day;
 *   §I  purity and scope — nothing is mutated, and the module names no storage,
 *       React, timer, wall clock or randomness;
 *   §J  the neighbours and the wiring — the merchant window, the training
 *       timetable and the city registry are unchanged; the visitor panel is still
 *       the one surface, and (since L17) a visitor's body is derived from THIS
 *       schedule's presence resolver rather than hard-coded, with no collider.
 *
 * The pinned days and the density count are a stability record measured from the
 * shipped hash: changing a cadence, a window or the hash must be acknowledged
 * here rather than silently altering when visitors appear on every save.
 *
 * Run with: `bun test src/utils/visitorSchedule.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via `bun test`
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { ITEMS_DB, getItemById } from '../data/itemsDB';
import { getStorefrontStock } from '../data/shops';
import {
  VISITORS,
  VISITOR_CADENCE_MAX,
  VISITOR_CADENCE_MIN,
  VISITOR_OFFER_SLOTS,
  VISITOR_WINDOW_MAX_DAY,
  getVisitor,
  type Visitor,
} from '../data/visitors';
import { createNewProfile } from '../services/storage';
import type { PlayerProfile } from '../types/game';
import type { CityState } from '../types/game';
import { normalizeCityDay } from './cityClock';
import { resolveStorefrontOffer, rotateStorefrontStock, selectDailyWindow } from './cityRotation';
import { resolveTrainingSchedule } from './trainingSchedule';
import {
  readCompletedVisitors,
  readSeenVisitors,
  resolveVisitorSchedule,
  scheduleVisitorDay,
} from './visitorSchedule';

const CATALOGUE_SRC = readFileSync(new URL('../data/visitors.ts', import.meta.url), 'utf8');
const SCHEDULE_SRC = readFileSync(new URL('./visitorSchedule.ts', import.meta.url), 'utf8');
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const load = (rel: string): string => code(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const CATALOGUE_CODE = code(CATALOGUE_SRC);
const SCHEDULE_CODE = code(SCHEDULE_SRC);

/** The catalogue's ids, pinned so a renamed or dropped visitor cannot pass unnoticed. */
const VISITOR_IDS = ['numidian_bladesmith', 'campanian_armorer', 'emesan_weapon_trader'];

const fresh = (): PlayerProfile => createNewProfile('Tester');
const onDay = (day: number, extra: Partial<CityState> = {}): PlayerProfile =>
  ({ ...fresh(), city: { day, ...extra } }) as PlayerProfile;
const ids = (schedule: { arrivals: { visitor: Visitor }[] }): string[] =>
  schedule.arrivals.map((arrival) => arrival.visitor.id);

/** An INDEPENDENT implementation of the roadmap's arrival rule — never imported. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
const expectedArrival = (visitor: Visitor, day: number): boolean =>
  day >= visitor.window.from &&
  day <= visitor.window.to &&
  fnv1a(`${day}:${visitor.id}`) % visitor.cadence === 0;

const SPINE = new Set([...getStorefrontStock('forge'), ...getStorefrontStock('armorer')]);

describe('§A the catalogue', () => {
  test('ids are stable and unique', () => {
    expect(VISITORS.map((visitor) => visitor.id)).toEqual(VISITOR_IDS);
    expect(new Set(VISITOR_IDS).size).toBe(VISITOR_IDS.length);
    for (const id of VISITOR_IDS) expect(getVisitor(id)?.id).toBe(id);
    expect(getVisitor('no_such_visitor')).toBeUndefined();
  });

  test('every cadence is a bounded whole number, and never 1', () => {
    for (const visitor of VISITORS) {
      expect(Number.isInteger(visitor.cadence)).toBe(true);
      expect(visitor.cadence).toBeGreaterThanOrEqual(VISITOR_CADENCE_MIN);
      expect(visitor.cadence).toBeLessThanOrEqual(VISITOR_CADENCE_MAX);
      expect(visitor.cadence).not.toBe(1);
    }
  });

  test('every window is bounded, ordered and inside the horizon', () => {
    for (const visitor of VISITORS) {
      const { from, to } = visitor.window;
      expect(Number.isInteger(from)).toBe(true);
      expect(Number.isInteger(to)).toBe(true);
      expect(from).toBeGreaterThanOrEqual(1);
      expect(to).toBeLessThanOrEqual(VISITOR_WINDOW_MAX_DAY);
      expect(from).toBeLessThanOrEqual(to);
    }
  });

  test('every offer is well formed and its pool has no repeats', () => {
    for (const visitor of VISITORS) {
      expect(visitor.offer.summary.trim().length).toBeGreaterThan(0);
      expect(visitor.offer.pool.length).toBeGreaterThan(0);
      expect(new Set(visitor.offer.pool).size).toBe(visitor.offer.pool.length);
    }
  });

  test('every offer references real existing content', () => {
    for (const visitor of VISITORS) {
      for (const id of visitor.offer.pool) {
        expect(getItemById(id)).toBeDefined();
        expect(ITEMS_DB.some((item) => item.id === id)).toBe(true);
      }
    }
  });

  test('every offer is non-progression-critical: the permanent spine already stocks it', () => {
    for (const visitor of VISITORS) {
      for (const id of visitor.offer.pool) expect(SPINE.has(id)).toBe(true);
    }
  });

  test('the catalogue is immutable', () => {
    expect(Object.isFrozen(VISITORS)).toBe(true);
    for (const visitor of VISITORS) {
      expect(Object.isFrozen(visitor)).toBe(true);
      expect(Object.isFrozen(visitor.window)).toBe(true);
      expect(Object.isFrozen(visitor.offer)).toBe(true);
      expect(Object.isFrozen(visitor.offer.pool)).toBe(true);
    }
    expect(() => {
      (VISITORS as Visitor[]).push(VISITORS[0]);
    }).toThrow();
    expect(VISITORS.length).toBe(VISITOR_IDS.length);
  });
});

describe('§B determinism', () => {
  test('the same day and profile produce the same schedule', () => {
    const profile = onDay(15);
    expect(resolveVisitorSchedule(profile)).toEqual(resolveVisitorSchedule(profile));
    expect(resolveVisitorSchedule(profile).arrivals).toEqual(resolveVisitorSchedule(onDay(15)).arrivals);
  });

  test('a schedule is stable on thirty consecutive days, across fresh resolutions', () => {
    for (let day = 1; day <= 30; day += 1) {
      const first = scheduleVisitorDay(VISITORS, day);
      const second = scheduleVisitorDay(VISITORS, day);
      expect(second).toEqual(first);
      expect(ids(second)).toEqual(ids(first));
    }
  });

  test('a caller gets fresh arrays it may mutate freely', () => {
    const schedule = scheduleVisitorDay(VISITORS, 15);
    schedule.arrivals.length = 0;
    expect(scheduleVisitorDay(VISITORS, 15).arrivals.length).toBe(2);
  });
});

describe('§C the arrival rule', () => {
  test('the resolver matches the documented rule over 400 days', () => {
    for (let day = 1; day <= 400; day += 1) {
      const resolved = new Set(ids(scheduleVisitorDay(VISITORS, day)));
      for (const visitor of VISITORS) {
        expect(resolved.has(visitor.id)).toBe(expectedArrival(visitor, day));
      }
    }
  });

  test('a visitor that fails the cadence rule is excluded', () => {
    const bladesmith = getVisitor('numidian_bladesmith') as Visitor;
    const passing = [5, 10, 14, 15].every((day) => expectedArrival(bladesmith, day));
    expect(passing).toBe(true);
    for (const day of [6, 7, 8, 9]) {
      expect(expectedArrival(bladesmith, day)).toBe(false);
      expect(ids(scheduleVisitorDay(VISITORS, day))).not.toContain('numidian_bladesmith');
    }
  });

  test('both window boundaries are respected even where the hash matches', () => {
    const base = getVisitor('campanian_armorer') as Visitor;
    const narrowed: Visitor = { ...base, window: { from: 10, to: 20 } };
    const matches = (day: number) => fnv1a(`${day}:${narrowed.id}`) % narrowed.cadence === 0;

    const inside = Array.from({ length: 11 }, (_, i) => 10 + i).filter(matches);
    const before = Array.from({ length: 9 }, (_, i) => 1 + i).filter(matches);
    const after = Array.from({ length: 10 }, (_, i) => 21 + i).filter(matches);

    expect(inside.length).toBeGreaterThan(0);
    expect(before.length).toBeGreaterThan(0);
    expect(after.length).toBeGreaterThan(0);
    for (const day of inside) expect(ids(scheduleVisitorDay([narrowed], day))).toEqual([narrowed.id]);
    for (const day of before) expect(ids(scheduleVisitorDay([narrowed], day))).toEqual([]);
    for (const day of after) expect(ids(scheduleVisitorDay([narrowed], day))).toEqual([]);
  });

  test('a visitor past its window never arrives again', () => {
    const base = getVisitor('campanian_armorer') as Visitor;
    for (let day = base.window.to + 1; day <= base.window.to + 200; day += 1) {
      expect(ids(scheduleVisitorDay(VISITORS, day))).not.toContain(base.id);
    }
  });

  test('arrivals are listed in catalogue order', () => {
    for (let day = 1; day <= 200; day += 1) {
      const order = ids(scheduleVisitorDay(VISITORS, day));
      const expected = VISITOR_IDS.filter((id) => order.includes(id));
      expect(order).toEqual(expected);
    }
  });
});

describe('§D day sensitivity', () => {
  test('the pinned days, measured from the shipped hash', () => {
    expect(ids(scheduleVisitorDay(VISITORS, 1))).toEqual([]);
    expect(ids(scheduleVisitorDay(VISITORS, 5))).toEqual(['numidian_bladesmith']);
    expect(ids(scheduleVisitorDay(VISITORS, 8))).toEqual(['campanian_armorer']);
    expect(ids(scheduleVisitorDay(VISITORS, 15))).toEqual(['numidian_bladesmith', 'campanian_armorer']);
    expect(ids(scheduleVisitorDay(VISITORS, 31))).toEqual(['emesan_weapon_trader']);
  });

  test('the schedule changes with the day', () => {
    expect(ids(scheduleVisitorDay(VISITORS, 1))).not.toEqual(ids(scheduleVisitorDay(VISITORS, 5)));
    expect(ids(scheduleVisitorDay(VISITORS, 5))).not.toEqual(ids(scheduleVisitorDay(VISITORS, 6)));
  });

  test('every visitor arrives on at least one day inside its own window', () => {
    for (const visitor of VISITORS) {
      let arrived = 0;
      for (let day = visitor.window.from; day <= visitor.window.to; day += 1) {
        if (expectedArrival(visitor, day)) arrived += 1;
      }
      expect(arrived).toBeGreaterThan(0);
    }
  });

  test('the documented density holds over the first 90 days', () => {
    let withVisitor = 0;
    let withTwo = 0;
    for (let day = 1; day <= 90; day += 1) {
      const count = scheduleVisitorDay(VISITORS, day).arrivals.length;
      if (count >= 1) withVisitor += 1;
      if (count >= 2) withTwo += 1;
    }
    expect(withVisitor).toBe(52);
    expect(withTwo).toBe(10);
  });
});

describe('§E completion', () => {
  test('a completed visitor is excluded on every day it would otherwise arrive', () => {
    const bladesmith = getVisitor('numidian_bladesmith') as Visitor;
    const arrivalDays: number[] = [];
    for (let day = bladesmith.window.from; day <= bladesmith.window.to; day += 1) {
      if (expectedArrival(bladesmith, day)) arrivalDays.push(day);
    }
    expect(arrivalDays.length).toBeGreaterThan(0);
    for (const day of arrivalDays) {
      const schedule = resolveVisitorSchedule(onDay(day, { completedVisitors: [bladesmith.id] }));
      expect(ids(schedule)).not.toContain(bladesmith.id);
    }
  });

  test('completion is permanent, and it does not disturb the other visitors', () => {
    const day = 15;
    expect(ids(resolveVisitorSchedule(onDay(day))).sort()).toEqual([
      'campanian_armorer',
      'numidian_bladesmith',
    ]);
    const after = resolveVisitorSchedule(onDay(day, { completedVisitors: ['numidian_bladesmith'] }));
    expect(ids(after)).toEqual(['campanian_armorer']);
    const late = resolveVisitorSchedule(onDay(22, { completedVisitors: ['numidian_bladesmith'] }));
    expect(ids(late)).not.toContain('numidian_bladesmith');
  });

  test('being seen is not being done', () => {
    const seenOnly = resolveVisitorSchedule(onDay(15, { seenVisitors: ['numidian_bladesmith'] }));
    expect(ids(seenOnly)).toContain('numidian_bladesmith');
    expect(seenOnly).toEqual(resolveVisitorSchedule(onDay(15)));
  });

  test('malformed and unknown completed ids exclude nobody', () => {
    const junk = [42, null, undefined, '', {}, [], 'no_such_visitor'] as unknown as string[];
    const schedule = resolveVisitorSchedule(onDay(15, { completedVisitors: junk }));
    expect(ids(schedule)).toEqual(['numidian_bladesmith', 'campanian_armorer']);
  });

  test('the resolver is given the completion set, and reads it totally', () => {
    expect(ids(scheduleVisitorDay(VISITORS, 5, ['numidian_bladesmith']))).toEqual([]);
    expect(ids(scheduleVisitorDay(VISITORS, 5, ['no_such_visitor']))).toEqual(['numidian_bladesmith']);
  });
});

describe('§F the clock', () => {
  test('a legacy save with no city reads day 1 with no history', () => {
    const schedule = resolveVisitorSchedule(fresh());
    expect(schedule.day).toBe(1);
    expect(schedule.arrivals).toEqual([]);
  });

  test('no profile at all is answerable', () => {
    expect(resolveVisitorSchedule()).toEqual({ day: 1, arrivals: [] });
    expect(resolveVisitorSchedule(null).day).toBe(1);
  });

  test('malformed days resolve exactly as the canonical clock resolves them', () => {
    const values: unknown[] = [0, -5, 1.9, Number.NaN, Infinity, -Infinity, '7', null, {}, [], true, 2 ** 60];
    for (const value of values) {
      const profile = { ...fresh(), city: { day: value } } as unknown as PlayerProfile;
      expect(resolveVisitorSchedule(profile).day).toBe(normalizeCityDay(value));
      expect(scheduleVisitorDay(VISITORS, value as number).day).toBe(normalizeCityDay(value));
    }
  });

  test('a fractional day is floored to a whole day', () => {
    expect(resolveVisitorSchedule(onDay(15.9)).day).toBe(15);
    expect(ids(resolveVisitorSchedule(onDay(15.9)))).toEqual(ids(resolveVisitorSchedule(onDay(15))));
  });

  test('a malformed city container reads day 1', () => {
    for (const city of ['day 4', 4, null, []]) {
      const profile = { ...fresh(), city } as unknown as PlayerProfile;
      expect(resolveVisitorSchedule(profile)).toEqual({ day: 1, arrivals: [] });
    }
  });

  test('resolving never advances the day', () => {
    const profile = onDay(15);
    resolveVisitorSchedule(profile);
    resolveVisitorSchedule(profile);
    expect(profile.city?.day).toBe(15);
    expect(resolveVisitorSchedule(profile).day).toBe(15);
  });
});

describe('§G the history readers', () => {
  test('absent, non-array and junk-filled histories resolve to valid ids only', () => {
    expect(readSeenVisitors(fresh())).toEqual([]);
    expect(readCompletedVisitors(fresh())).toEqual([]);
    expect(readSeenVisitors()) .toEqual([]);
    expect(readCompletedVisitors(null)).toEqual([]);

    const junk = { city: { day: 4, seenVisitors: 'v1', completedVisitors: [42, 'ok', '', null, '  '] } };
    expect(readSeenVisitors(junk as unknown as PlayerProfile)).toEqual([]);
    expect(readCompletedVisitors(junk as unknown as PlayerProfile)).toEqual(['ok', '  ']);
  });

  test('the readers return fresh arrays and mutate nothing', () => {
    const profile = onDay(4, { seenVisitors: ['numidian_bladesmith'] });
    const seen = readSeenVisitors(profile);
    seen.push('another');
    expect(readSeenVisitors(profile)).toEqual(['numidian_bladesmith']);
    expect(profile.city?.seenVisitors).toEqual(['numidian_bladesmith']);
  });
});

describe('§H offers', () => {
  test('the day\'s offer is the existing rotation, not a second mechanism', () => {
    for (const visitor of VISITORS) {
      for (let day = 1; day <= 200; day += 1) {
        if (!expectedArrival(visitor, day)) continue;
        const arrival = scheduleVisitorDay([visitor], day).arrivals[0];
        const expected = selectDailyWindow(
          visitor.offer.pool,
          VISITOR_OFFER_SLOTS,
          visitor.id,
          day
        );
        expect(arrival.offerItemId).toBe(expected[0]);
      }
    }
  });

  test('every arrival offers exactly one real item', () => {
    for (let day = 1; day <= 200; day += 1) {
      for (const arrival of scheduleVisitorDay(VISITORS, day).arrivals) {
        expect(typeof arrival.offerItemId).toBe('string');
        expect(getItemById(arrival.offerItemId as string)).toBeDefined();
        expect(arrival.visitor.offer.pool).toContain(arrival.offerItemId);
      }
    }
  });

  test('an offer rotates with the day', () => {
    const bladesmith = getVisitor('numidian_bladesmith') as Visitor;
    const offers = new Set<string | null>();
    for (let day = bladesmith.window.from; day <= bladesmith.window.to; day += 1) {
      const arrival = scheduleVisitorDay([bladesmith], day).arrivals[0];
      if (arrival) offers.add(arrival.offerItemId);
    }
    expect(offers.size).toBeGreaterThan(1);
  });

  test('an empty pool offers nothing rather than inventing an item', () => {
    const base = getVisitor('numidian_bladesmith') as Visitor;
    const empty: Visitor = { ...base, offer: { summary: 'nothing', pool: [] } };
    const arrival = scheduleVisitorDay([empty], 5).arrivals[0];
    expect(arrival.visitor.id).toBe(base.id);
    expect(arrival.offerItemId).toBeNull();
  });
});

describe('§I purity and scope', () => {
  test('neither the profile nor its nested arrays are mutated', () => {
    const profile = onDay(15, { seenVisitors: ['x'], completedVisitors: [] });
    const snapshot = JSON.parse(JSON.stringify(profile));
    resolveVisitorSchedule(profile);
    resolveVisitorSchedule(profile);
    expect(profile).toEqual(snapshot as PlayerProfile);
    expect(profile.city).toEqual({ day: 15, seenVisitors: ['x'], completedVisitors: [] });
  });

  test('a frozen profile and frozen history arrays are answerable', () => {
    const city: CityState = Object.freeze({
      day: 15,
      seenVisitors: Object.freeze(['x']) as unknown as string[],
      completedVisitors: Object.freeze([]) as unknown as string[],
    });
    const profile = Object.freeze({ ...fresh(), city }) as PlayerProfile;
    expect(ids(resolveVisitorSchedule(profile))).toEqual(['numidian_bladesmith', 'campanian_armorer']);
  });

  test('the module writes neither history field', () => {
    expect(SCHEDULE_CODE).not.toMatch(/seenVisitors\s*[:=]/);
    expect(SCHEDULE_CODE).not.toMatch(/completedVisitors\s*[:=]/);
  });

  test('the module imports only the four house modules', () => {
    const imports = Array.from(SCHEDULE_CODE.matchAll(/from\s+'([^']+)'/g)).map((m) => m[1]);
    expect(imports).toEqual([
      '../data/visitors',
      '../types/game',
      './cityClock',
      './cityRotation',
    ]);
  });

  test('the module names no storage, React, timer, wall clock or randomness', () => {
    for (const source of [SCHEDULE_CODE, CATALOGUE_CODE]) {
      expect(source).not.toMatch(/\bDate\b|performance\.now/);
      expect(source).not.toMatch(/setTimeout|setInterval|requestAnimationFrame/);
      expect(source).not.toMatch(/Math\.random/);
      expect(source).not.toMatch(/localStorage|sessionStorage/);
      expect(source).not.toMatch(/from 'react'|@react-three/);
      expect(source).not.toMatch(/advanceCityDay/);
    }
  });

  test('the catalogue is data only: no functions beyond its id reader', () => {
    const functions = Array.from(CATALOGUE_CODE.matchAll(/export function (\w+)/g)).map((m) => m[1]);
    expect(functions).toEqual(['getVisitor']);
  });
});

describe('§J the neighbours and the wiring', () => {
  test('the merchant window is unchanged', () => {
    expect(resolveStorefrontOffer(fresh(), 'merchant')).toEqual([
      'helm_centurion',
      'chest_golden_muscled',
      'arms_manica_steel',
      'arms_galerus_gilded',
    ]);
    expect(rotateStorefrontStock('market', 1)).toEqual(getStorefrontStock('market'));
  });

  test('the training timetable is unchanged', () => {
    const schedule = resolveTrainingSchedule(fresh());
    expect(schedule.actions.map((action) => action.id)).toEqual(['strength', 'agility', 'defense']);
    expect(schedule.resting.map((action) => action.id)).toEqual(['stamina']);
  });

  test('a visitor has a body now, and it comes only from the presence resolver (rebased by L17)', () => {
    // L10 shipped no visitor wiring; L11 added exactly one surface — the visitor
    // panel, opened from the city header's chip; **L17 deliberately gives the
    // scheduled visitors a body standing at a fixed stall**, which is the one
    // assertion below that could no longer be stated as "no mesh". This guard is
    // rebased, not weakened: the property it always protected was that the city's
    // COLLISION and HUB tables know nothing about visitors, that a body exists only
    // because THIS schedule put the visitor in town (never a hard-coded mesh, a
    // per-day literal or a disc of its own), and that the panel stays the one
    // surface for meeting and trading. Each of those is now asserted directly.
    expect(load('./cityCollisions.ts')).not.toMatch(/visitor/i);
    const scene = load('../components/3d/city/CityHubScene.tsx');
    expect(scene).toContain('resolveVisitorPresence(playerProfile)');
    expect(scene.match(/\{visitorStalls\.map/g)?.length).toBe(2);
    expect(scene).not.toMatch(/visitorCollider|visitorDisc|activeToday/);
    expect(scene.match(/<VisitorPanel/g)?.length).toBe(1);
    // Proximity raises a prompt and opens the panel; it never records a meeting.
    expect(scene).not.toMatch(/onEncounterVisitor\(/);
    expect(load('../App.tsx')).not.toMatch(/completedVisitors\s*[:=]/);
  });

  test('the two history fields stay optional, and no migration introduces them', () => {
    const types = load('../types/game.ts');
    expect(types).toMatch(/seenVisitors\?: string\[\];/);
    expect(types).toMatch(/completedVisitors\?: string\[\];/);
    expect(fresh().city).toBeUndefined();
  });
});
