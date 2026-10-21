/**
 * Living City L11 — the visitor encounter transaction, and the city surface it
 * hangs on.
 *
 * What this suite pins, in the repo's two registers (behaviour for pure logic,
 * ordered source assertions for the wiring this repo has no DOM renderer for):
 *
 *   §A  the transaction — one meeting records one id, a repeat records nothing,
 *       history is deduplicated, and every other profile/city field survives;
 *   §B  eligibility — only a visitor the L10 schedule puts in the city today can be
 *       met, and a completed visitor never can be;
 *   §C  seen is not done — a met visitor still arrives, the day never moves, and
 *       `completedVisitors` is never written by this phase;
 *   §D  purity — the caller's profile is never mutated, and passive schedule
 *       resolution writes nothing at all;
 *   §E  the neighbours — merchant rotation, training, rest and the clock are
 *       unchanged;
 *   §F  the wiring — `App` is the one caller and reads the newest profile, the city
 *       scene lists the schedule it was given, and the panel records only on an
 *       explicit selection.
 *
 * The pinned days are the L10 suite's own (the bladesmith arrives on day 5, the
 * armorer on day 8), so a cadence change fails there first and here second.
 *
 * Run with: `bun test src/utils/visitorEncounter.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via `bun test`
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { getStorefrontStock } from '../data/shops';
import { VISITORS } from '../data/visitors';
import { createNewProfile } from '../services/storage';
import type { PlayerProfile } from '../types/game';
import { advanceCityDay, resolveCityDay } from './cityClock';
import { resolveStorefrontOffer } from './cityRotation';
import { restCost } from './restRecovery';
import { resolveTrainingSchedule } from './trainingSchedule';
import {
  isVisitorInTown,
  recordVisitorEncounter,
  resolveVisitorEncounter,
} from './visitorEncounter';
import { readSeenVisitors, resolveVisitorSchedule } from './visitorSchedule';

const APP_CODE = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const PANEL_CODE = readFileSync(new URL('../components/hub/VisitorPanel.tsx', import.meta.url), 'utf8');
const SCENE_CODE = readFileSync(
  new URL('../components/3d/city/CityHubScene.tsx', import.meta.url),
  'utf8'
);

const fresh = (): PlayerProfile => createNewProfile('Tester');
const onDay = (day: number, extra: Partial<NonNullable<PlayerProfile['city']>> = {}): PlayerProfile =>
  ({ ...fresh(), city: { day, ...extra } }) as PlayerProfile;

/** Day 5: the Numidian bladesmith is in the city; day 1 has nobody. */
const ARRIVAL_DAY = 5;
const BLADESMITH = 'numidian_bladesmith';
const ARMORER = 'campanian_armorer';

describe('§A the encounter transaction', () => {
  test('the first meeting records the visitor once', () => {
    const before = onDay(ARRIVAL_DAY);
    const result = recordVisitorEncounter(before, BLADESMITH);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recorded).toBe(true);
    expect(readSeenVisitors(result.profile)).toEqual([BLADESMITH]);
    expect(resolveCityDay(result.profile)).toBe(ARRIVAL_DAY);
  });

  test('a repeat meeting records nothing and does not grow the history', () => {
    const first = recordVisitorEncounter(onDay(ARRIVAL_DAY), BLADESMITH);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = recordVisitorEncounter(first.profile, BLADESMITH);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.recorded).toBe(false);
    expect(readSeenVisitors(second.profile)).toEqual([BLADESMITH]);
  });

  test('history is deduplicated against what the save already holds', () => {
    const already = onDay(ARRIVAL_DAY, { seenVisitors: [BLADESMITH] });
    const result = recordVisitorEncounter(already, BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recorded).toBe(false);
    expect(readSeenVisitors(result.profile)).toEqual([BLADESMITH]);
  });

  test('two different visitors accumulate in the order they were met', () => {
    const bladesmith = recordVisitorEncounter(onDay(ARRIVAL_DAY), BLADESMITH);
    expect(bladesmith.ok).toBe(true);
    if (!bladesmith.ok) return;
    // Day 15 has both the bladesmith and the armorer.
    const armorer = recordVisitorEncounter(onDay(15), ARMORER);
    expect(armorer.ok).toBe(true);
    if (!armorer.ok) return;
    const both = recordVisitorEncounter(armorer.profile, BLADESMITH);
    expect(both.ok).toBe(true);
    if (!both.ok) return;
    expect(readSeenVisitors(both.profile)).toEqual([ARMORER, BLADESMITH]);
  });

  test('every other profile and city field survives the write', () => {
    const before = {
      ...onDay(ARRIVAL_DAY, { restDay: 4, merchantPurchaseDay: 4 }),
      gold: 777,
      defeatedOpponentIds: ['boss_a'],
      city: { day: ARRIVAL_DAY, restDay: 4, merchantPurchaseDay: 4, completedVisitors: [] },
    } as PlayerProfile;
    const result = recordVisitorEncounter(before, BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.profile.gold).toBe(777);
    expect(result.profile.inventory).toEqual(before.inventory);
    expect(result.profile.defeatedOpponentIds).toEqual(['boss_a']);
    expect(result.profile.city).toEqual({
      day: ARRIVAL_DAY,
      restDay: 4,
      merchantPurchaseDay: 4,
      completedVisitors: [],
      seenVisitors: [BLADESMITH],
    });
  });

  test('a malformed city container is not spread into the result', () => {
    const junk = { ...fresh(), city: 'day 5' } as unknown as PlayerProfile;
    const result = recordVisitorEncounter(junk, BLADESMITH);
    // Day 1 has nobody in town, so the malformed profile is refused outright.
    expect(result.ok).toBe(false);
  });

  test('a junk-filled history is filtered, not carried', () => {
    const before = {
      ...fresh(),
      city: { day: ARRIVAL_DAY, seenVisitors: [42, null, '', 'ok'] },
    } as unknown as PlayerProfile;
    const result = recordVisitorEncounter(before, BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(readSeenVisitors(result.profile)).toEqual(['ok', BLADESMITH]);
  });
});

describe('§B eligibility', () => {
  test('a visitor who is not in town today cannot be met', () => {
    const result = recordVisitorEncounter(onDay(1), BLADESMITH);
    expect(result).toEqual({ ok: false, reason: 'not-in-town' });
  });

  test('a visitor past its window cannot be met', () => {
    const result = recordVisitorEncounter(onDay(400), BLADESMITH);
    expect(result).toEqual({ ok: false, reason: 'not-in-town' });
  });

  test('a visitor the catalogue does not host is refused as unknown', () => {
    expect(recordVisitorEncounter(onDay(ARRIVAL_DAY), 'no_such_visitor')).toEqual({
      ok: false,
      reason: 'unknown-visitor',
    });
  });

  test('no profile is refused, not thrown', () => {
    expect(recordVisitorEncounter(null, BLADESMITH)).toEqual({ ok: false, reason: 'no-profile' });
    expect(recordVisitorEncounter(undefined, BLADESMITH)).toEqual({
      ok: false,
      reason: 'no-profile',
    });
  });

  test('a completed visitor can never be met again and the history is left alone', () => {
    const completed = onDay(ARRIVAL_DAY, { completedVisitors: [BLADESMITH] });
    expect(isVisitorInTown(completed, BLADESMITH)).toBe(false);

    const result = recordVisitorEncounter(completed, BLADESMITH);
    expect(result).toEqual({ ok: false, reason: 'not-in-town' });
    expect(completed.city?.seenVisitors).toBeUndefined();
    expect(completed.city?.completedVisitors).toEqual([BLADESMITH]);
  });

  test('the view agrees with the schedule, and is null for anyone not in town', () => {
    const today = onDay(ARRIVAL_DAY);
    const view = resolveVisitorEncounter(today, BLADESMITH);
    expect(view).not.toBeNull();
    expect(view?.visitor.id).toBe(BLADESMITH);
    expect(view?.seen).toBe(false);
    expect(view?.offerItemId).toBeString();
    expect(view?.item?.id).toBe(view?.offerItemId as string);

    expect(resolveVisitorEncounter(today, ARMORER)).toBeNull();
    expect(resolveVisitorEncounter(onDay(1), BLADESMITH)).toBeNull();
  });

  test('the view reports a visitor already met as seen', () => {
    const met = onDay(ARRIVAL_DAY, { seenVisitors: [BLADESMITH] });
    expect(resolveVisitorEncounter(met, BLADESMITH)?.seen).toBe(true);
  });
});

describe('§C seen is not done', () => {
  test('a met visitor still arrives on the same day', () => {
    const met = recordVisitorEncounter(onDay(ARRIVAL_DAY), BLADESMITH);
    expect(met.ok).toBe(true);
    if (!met.ok) return;
    expect(resolveVisitorSchedule(met.profile).arrivals.map((a) => a.visitor.id)).toContain(
      BLADESMITH
    );
    expect(resolveVisitorSchedule(met.profile)).toEqual(resolveVisitorSchedule(onDay(ARRIVAL_DAY)));
  });

  test('meeting a visitor writes nothing to completedVisitors', () => {
    const result = recordVisitorEncounter(onDay(ARRIVAL_DAY), BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.city?.completedVisitors).toBeUndefined();
  });

  test('meeting a visitor never advances the city day', () => {
    const before = onDay(ARRIVAL_DAY);
    const result = recordVisitorEncounter(before, BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(resolveCityDay(result.profile)).toBe(resolveCityDay(before));
    expect(result.profile.city?.day).toBe(ARRIVAL_DAY);
  });

  test('the module itself only ever writes seenVisitors', () => {
    const source = readFileSync(new URL('./visitorEncounter.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(source).toMatch(/seenVisitors:\s*\[/);
    expect(source).not.toMatch(/completedVisitors\s*:/);
    expect(source).not.toMatch(/gold\s*:/);
    expect(source).not.toMatch(/inventory\s*:/);
    expect(source).not.toMatch(/advanceCityDay|nextCityDay/);
  });
});

describe('§D purity', () => {
  test('the caller’s profile is never mutated', () => {
    const before = onDay(ARRIVAL_DAY, { seenVisitors: [] });
    const snapshot = JSON.parse(JSON.stringify(before));
    recordVisitorEncounter(before, BLADESMITH);
    recordVisitorEncounter(before, BLADESMITH);
    expect(before).toEqual(snapshot as PlayerProfile);
    expect(before.city?.seenVisitors).toEqual([]);
  });

  test('a frozen profile is answerable and a new object comes back', () => {
    const city = Object.freeze({ day: ARRIVAL_DAY });
    const profile = Object.freeze({ ...fresh(), city }) as PlayerProfile;
    const result = recordVisitorEncounter(profile, BLADESMITH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile).not.toBe(profile);
    expect(readSeenVisitors(result.profile)).toEqual([BLADESMITH]);
  });

  test('passive resolution writes nothing at all', () => {
    const profile = onDay(ARRIVAL_DAY);
    const snapshot = JSON.parse(JSON.stringify(profile));
    resolveVisitorSchedule(profile);
    resolveVisitorSchedule(profile);
    resolveVisitorEncounter(profile, BLADESMITH);
    isVisitorInTown(profile, BLADESMITH);
    expect(profile).toEqual(snapshot as PlayerProfile);
  });
});

describe('§E the neighbours', () => {
  test('the merchant window, the training timetable and the rest fee are unchanged', () => {
    // The merchant's window is pinned on day 1 — the day a legacy save resolves to,
    // which is the day the L10 suite pins it against.
    const profile = fresh();
    expect(resolveStorefrontOffer(profile, 'merchant')).toEqual([
      'helm_centurion',
      'chest_golden_muscled',
      'arms_manica_steel',
      'arms_galerus_gilded',
    ]);
    expect(resolveStorefrontOffer(profile, 'forge')).toEqual(getStorefrontStock('forge'));
    const today = onDay(ARRIVAL_DAY);
    const training = resolveTrainingSchedule(today);
    expect(training.actions.map((a) => a.id)).toEqual(['strength', 'agility', 'defense']);
    expect(training.resting.map((a) => a.id)).toEqual(['stamina']);
    expect(restCost(today)).toBe(25 * today.level);
  });

  test('the city clock is untouched by an encounter', () => {
    const profile = onDay(ARRIVAL_DAY);
    expect(advanceCityDay(profile).city.day).toBe(ARRIVAL_DAY + 1);
    expect(recordVisitorEncounter(profile, BLADESMITH).ok).toBe(true);
    expect(resolveCityDay(profile)).toBe(ARRIVAL_DAY);
  });

  test('the catalogue is untouched: no visitor-exclusive item, no new price', () => {
    for (const visitor of VISITORS) {
      for (const id of visitor.offer.pool) {
        const spine = [...getStorefrontStock('forge'), ...getStorefrontStock('armorer')];
        expect(spine).toContain(id);
      }
    }
  });
});

describe('§F the wiring', () => {
  test('App is the one caller of the transaction, and it reads the newest profile', () => {
    expect(APP_CODE.match(/recordVisitorEncounter\(/g)?.length).toBe(1);
    expect(APP_CODE).toContain('recordVisitorEncounter(profileRef.current, visitorId)');
    expect(APP_CODE.match(/const handleVisitorEncounter = /g)?.length).toBe(1);
    // One save per successful, first encounter — never on a refusal or a repeat.
    expect(APP_CODE).toContain('if (!result.ok || !result.recorded) return;');
  });

  test('App hands the handler to the city scene exactly once', () => {
    expect(APP_CODE.match(/onEncounterVisitor=\{handleVisitorEncounter\}/g)?.length).toBe(1);
  });

  test('the city scene lists the schedule it was given, and opens the panel', () => {
    expect(SCENE_CODE).toContain('resolveVisitorSchedule(playerProfile)');
    expect(SCENE_CODE.match(/<VisitorPanel/g)?.length).toBe(1);
    expect(SCENE_CODE).toContain('onEncounter={onEncounterVisitor}');
    // The chip only exists on a day that has someone to meet.
    expect(SCENE_CODE).toContain('visitorArrivals.length > 0');
  });

  test('the panel records only on an explicit selection, never on render', () => {
    const code = PANEL_CODE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).toContain('onEncounter(visitor.id)');
    expect(code).not.toMatch(/useEffect/);
    // One call site, inside the row's own click handler.
    expect(code.match(/onEncounter\(/g)?.length).toBe(1);
  });

  test('the panel sells nothing: no purchase, no price, no completion', () => {
    const code = PANEL_CODE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/purchaseStorefrontItem|purchaseChariotPart|storefrontPurchase/);
    expect(code).not.toMatch(/\.price\b/);
    expect(code).not.toMatch(/completedVisitors/);
    expect(code).not.toMatch(/saveProfile/);
  });

  test('the schedule still has no writer and no purchase path', () => {
    const source = readFileSync(new URL('./visitorSchedule.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(source).not.toMatch(/seenVisitors\s*[:=]/);
    expect(source).not.toMatch(/completedVisitors\s*[:=]/);
  });
});
