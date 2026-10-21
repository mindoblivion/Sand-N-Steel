/**
 * Living City L9 — the Arena Medical House's rest-and-recovery transaction.
 *
 * This suite drives the REAL `restAtMedicalHouse` over real profiles, the real
 * training cost helper and the real injury normalizer, so the rules the phase is
 * judged by are measured rather than inferred from a banner:
 *
 *   §A  the treatment — a valid wound clears, the fee is `25 × level`, the gold
 *       leaves the purse and the day turns by exactly one;
 *   §B  the fee — `trainingCost` is the one formula, at the profile's own level;
 *   §C  the refusals — no profile, no wound, an unaffordable fee and a day already
 *       rested, each leaving the profile (and every nested object) byte-identical;
 *   §D  the clock — the entry day is what `restDay` records, the resulting profile
 *       stands on the next day, and a legacy save rests from day 1 into day 2;
 *   §E  purity — no mutation, unrelated fields by identity, and no storage, React,
 *       wall clock, timer or randomness in the module;
 *   §F  the neighbours — the merchant's allowance, the day's offer, the training
 *       schedule and the injury lifecycle all respond to the resulting day through
 *       their OWN resolvers, and no rule of theirs is restated here;
 *   §G  the wiring — one rest path (App → this module), one clock call site for a
 *       duel settlement, no component advancing the day, and the Medical House's
 *       prompt, the Bathhouse and the Caravanserai untouched.
 *
 * Run with: `bun test src/utils/restRecovery.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via `bun test`
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';

import { trainingCost } from '../data/training';
import { createNewProfile } from '../services/storage';
import type { PlayerProfile } from '../types/game';
import { HUB_LOCATIONS } from './cityCollisions';
import { resolveCityDay } from './cityClock';
import {
  isStorefrontItemOnOffer,
  resolveStorefrontOffer,
  rotateStorefrontStock,
} from './cityRotation';
import { normalizeInjury, settleInjury } from './injurySettlement';
import {
  REST_DAY_FIELD,
  isRestSpentToday,
  resolveRestDay,
  restAtMedicalHouse,
  restCost,
} from './restRecovery';
import { isMerchantPurchaseSpent, resolveMerchantPurchaseDay } from './storefrontPurchase';
import { resolveTrainingSchedule } from './trainingSchedule';
import { trainStat } from './trainingSession';

/** Source with comments removed — prose can neither satisfy nor defeat a guard. */
const code = (target: string | URL): string =>
  readFileSync(target instanceof URL ? target : new URL(target, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const APP_CODE = code('../App.tsx');
const CITY_SCENE_CODE = code('../components/3d/city/CityHubScene.tsx');
const MODULE_CODE = code('./restRecovery.ts');

/** The slice of `source` from `start` (inclusive) up to `end` (exclusive). */
function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) return '';
  return source.slice(from, to);
}

/** Every non-test `.ts`/`.tsx` under `src/`, with its comment-stripped source. */
function walk(directory: URL, prefix = ''): { path: string; source: string }[] {
  const files: { path: string; source: string }[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...walk(new URL(`${entry.name}/`, directory), relative));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
    files.push({ path: relative, source: code(new URL(entry.name, directory)) });
  }
  return files;
}

const PRODUCTION = walk(new URL('../', import.meta.url));

/** The canonical wound L7 inflicts. */
const WOUND = { fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 };

/** A wounded gladiator with a purse that covers a level-1 treatment (25). */
function wounded(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    ...createNewProfile('Wounded'),
    gold: 200,
    injury: { ...WOUND },
    ...overrides,
  };
}

/** The same gladiator on a known city day. */
function woundedOn(day: number, overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  // The override's own city fields are kept and only the day is pinned, so a
  // fixture can state `restDay` or the merchant's allowance beside it.
  return { ...wounded(overrides), city: { ...overrides.city, day } };
}

/** A pre-L1/L9 save: the profile with no `city` field at all. */
function legacy(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  const profile = wounded(overrides);
  delete (profile as { city?: unknown }).city;
  return profile;
}

const snapshot = (value: unknown): string => JSON.stringify(value);

// ── §A. The treatment ──────────────────────────────────────────────────────

describe('§A — a valid wound is treated for a day and a fee', () => {
  test('success clears the wound, charges 25 × level and turns the day', () => {
    const profile = woundedOn(1);
    const result = restAtMedicalHouse(profile);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cost).toBe(25);
    expect(result.day).toBe(1); // the day it CONSUMED
    expect(result.profile.injury).toBeNull();
    expect(result.profile.gold).toBe(175);
    expect(resolveCityDay(result.profile)).toBe(2);
    expect(result.profile.city?.[REST_DAY_FIELD]).toBe(1);
  });

  test('the clock advances exactly once — never twice, never zero', () => {
    for (const day of [1, 4, 9, 40]) {
      const result = restAtMedicalHouse(woundedOn(day));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(resolveCityDay(result.profile)).toBe(day + 1);
      expect(result.day).toBe(day);
    }
  });

  test('the field is literally `restDay`, on the existing city object', () => {
    expect(REST_DAY_FIELD).toBe('restDay');
    const result = restAtMedicalHouse(woundedOn(3));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.profile.city ?? {})).toContain('restDay');
  });

  test('rest awards nothing and moves no statistic', () => {
    const profile = woundedOn(2, { fightsWon: 4, fightsLost: 3, fame: 90, xp: 40 });
    const result = restAtMedicalHouse(profile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.fightsWon).toBe(4);
    expect(result.profile.fightsLost).toBe(3);
    expect(result.profile.fame).toBe(90);
    expect(result.profile.xp).toBe(40);
    expect(result.profile.level).toBe(profile.level);
    expect(result.profile.defeatedOpponentIds).toBe(profile.defeatedOpponentIds);
  });

  test('a freshly inflicted 2-fight wound is cleared completely, not shortened', () => {
    const result = restAtMedicalHouse(woundedOn(1, { injury: { ...WOUND } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.injury).toBeNull();
    expect(normalizeInjury(result.profile.injury)).toBeNull();
  });
});

// ── §B. The fee ────────────────────────────────────────────────────────────

describe('§B — the fee is the shipped `25 × level` rule', () => {
  test('a higher level pays 25 × level and clears the wound the same way', () => {
    for (const level of [1, 2, 3, 5, 7, 12]) {
      const profile = woundedOn(1, { level, gold: 1000 });
      const result = restAtMedicalHouse(profile);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.cost).toBe(25 * level);
      expect(result.cost).toBe(trainingCost(level));
      expect(result.profile.gold).toBe(1000 - 25 * level);
      expect(result.profile.injury).toBeNull();
    }
  });

  test('`restCost` reads the same helper the Ludus charges with', () => {
    for (const level of [1, 4, 9, 16]) {
      expect(restCost({ level })).toBe(trainingCost(level));
    }
  });

  test('`restCost` is total: a missing or malformed level resolves to the floor', () => {
    expect(restCost(null)).toBe(25);
    expect(restCost(undefined)).toBe(25);
    expect(restCost({})).toBe(25);
    expect(restCost({ level: Number.NaN })).toBe(25);
    expect(restCost({ level: Number.POSITIVE_INFINITY })).toBe(25);
    expect(restCost({ level: -3 })).toBe(25);
    expect(restCost({ level: 0 })).toBe(25);
    expect(restCost({ level: 2.9 })).toBe(50); // floored to whole levels
  });

  test('exactly enough gold is accepted; one short is refused', () => {
    const exact = restAtMedicalHouse(woundedOn(1, { gold: 25 }));
    expect(exact.ok).toBe(true);
    if (exact.ok) expect(exact.profile.gold).toBe(0);

    const short = restAtMedicalHouse(woundedOn(1, { gold: 24 }));
    expect(short).toEqual({ ok: false, reason: 'insufficient-gold' });
  });
});

// ── §C. The refusals ───────────────────────────────────────────────────────

describe('§C — nothing is committed on a refusal', () => {
  test('a missing profile is refused', () => {
    expect(restAtMedicalHouse(null)).toEqual({ ok: false, reason: 'no-profile' });
    expect(restAtMedicalHouse(undefined)).toEqual({ ok: false, reason: 'no-profile' });
  });

  test('no injury at all is refused', () => {
    expect(restAtMedicalHouse(woundedOn(1, { injury: null }))).toEqual({
      ok: false,
      reason: 'no-injury',
    });
    const withoutField = woundedOn(1);
    delete (withoutField as { injury?: unknown }).injury;
    expect(restAtMedicalHouse(withoutField)).toEqual({ ok: false, reason: 'no-injury' });
  });

  test('every injury `normalizeInjury` reads as spent or malformed is refused', () => {
    const shapes: unknown[] = [
      { fightsRemaining: 0 },
      { fightsRemaining: -1 },
      { fightsRemaining: 0.9 },
      { fightsRemaining: '2' },
      { fightsRemaining: Number.NaN },
      { fightsRemaining: Number.POSITIVE_INFINITY },
      {},
      [],
      'injury',
      true,
      0,
    ];
    for (const injury of shapes) {
      const profile = { ...woundedOn(1), injury } as PlayerProfile;
      expect(normalizeInjury(injury)).toBeNull();
      expect(restAtMedicalHouse(profile)).toEqual({ ok: false, reason: 'no-injury' });
    }
  });

  test('a fractional but live duration is a valid wound', () => {
    const profile = woundedOn(1, { injury: { ...WOUND, fightsRemaining: 1.5 } });
    expect(restAtMedicalHouse(profile).ok).toBe(true);
  });

  test('an empty purse is refused', () => {
    expect(restAtMedicalHouse(woundedOn(1, { gold: 0 }))).toEqual({
      ok: false,
      reason: 'insufficient-gold',
    });
  });

  test('a treatment already spent today is refused', () => {
    const profile = woundedOn(5, { city: { day: 5, restDay: 5 } });
    expect(isRestSpentToday(profile)).toBe(true);
    expect(restAtMedicalHouse(profile)).toEqual({ ok: false, reason: 'already-rested' });
  });

  test('a refusal leaves the profile and its nested objects exactly as they were', () => {
    const cases: PlayerProfile[] = [
      woundedOn(1, { injury: null }),
      woundedOn(1, { gold: 10 }),
      woundedOn(5, { city: { day: 5, restDay: 5 } }),
    ];
    for (const profile of cases) {
      const before = snapshot(profile);
      const cityRef = profile.city;
      const inventoryRef = profile.inventory;
      const statsRef = profile.baseStats;
      const result = restAtMedicalHouse(profile);
      expect(result.ok).toBe(false);
      expect(snapshot(profile)).toBe(before);
      expect(profile.city).toBe(cityRef);
      expect(profile.inventory).toBe(inventoryRef);
      expect(profile.baseStats).toBe(statsRef);
      expect('profile' in result).toBe(false);
    }
  });
});

// ── §D. The clock and legacy saves ─────────────────────────────────────────

describe('§D — the allowance is derived from the one clock', () => {
  test('a later day permits a new treatment', () => {
    const profile = woundedOn(5, { city: { day: 5, restDay: 4 }, injury: { ...WOUND } });
    expect(isRestSpentToday(profile)).toBe(false);
    const result = restAtMedicalHouse(profile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.city?.[REST_DAY_FIELD]).toBe(5);
    expect(resolveCityDay(result.profile)).toBe(6);
  });

  test('a legacy profile with no `city` rests from day 1 into day 2', () => {
    const profile = legacy();
    expect((profile as { city?: unknown }).city).toBeUndefined();
    expect(resolveCityDay(profile)).toBe(1);
    expect(resolveRestDay(profile)).toBeNull();

    const result = restAtMedicalHouse(profile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.day).toBe(1);
    expect(resolveCityDay(result.profile)).toBe(2);
    expect(result.profile.city?.[REST_DAY_FIELD]).toBe(1);
  });

  test('the advance never overwrites itself with the entry day', () => {
    for (const day of [1, 12]) {
      const result = restAtMedicalHouse(woundedOn(day));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.profile.city?.day).toBe(day + 1);
      expect(result.profile.city?.day).not.toBe(result.day);
    }
  });

  test('every other city field survives the treatment', () => {
    const profile = woundedOn(3, { city: { day: 3, merchantPurchaseDay: 2 } });
    const result = restAtMedicalHouse(profile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.city).toEqual({ day: 4, merchantPurchaseDay: 2, restDay: 3 });
  });

  test('`resolveRestDay` is total — junk never invents a day', () => {
    for (const restDay of ['3', true, [], {}, Number.NaN, Number.POSITIVE_INFINITY, 0, -7, -0.5]) {
      const profile = { ...woundedOn(3), city: { day: 3, restDay } } as PlayerProfile;
      expect(resolveRestDay(profile)).toBeNull();
    }
    expect(resolveRestDay({ city: { day: 3, restDay: 1.8 } })).toBe(1);
    expect(resolveRestDay({ city: 'junk' as never })).toBeNull();
    expect(resolveRestDay(null)).toBeNull();
    expect(resolveRestDay(undefined)).toBeNull();
  });

  test('`isRestSpentToday` answers only for the current day', () => {
    expect(isRestSpentToday({ city: { day: 4, restDay: 4 } })).toBe(true);
    expect(isRestSpentToday({ city: { day: 4, restDay: 3 } })).toBe(false);
    expect(isRestSpentToday({ city: { day: 1 } })).toBe(false);
    expect(isRestSpentToday({})).toBe(false);
    expect(isRestSpentToday(legacy())).toBe(false);
  });
});

// ── §E. Purity ─────────────────────────────────────────────────────────────

describe('§E — pure: one new profile, nothing mutated', () => {
  test('the input profile and its nested objects are untouched', () => {
    const profile = woundedOn(2, { city: { day: 2, merchantPurchaseDay: 1 } });
    const before = snapshot(profile);
    const cityRef = profile.city;
    const injuryRef = profile.injury;
    const inventoryRef = profile.inventory;

    const result = restAtMedicalHouse(profile);
    expect(result.ok).toBe(true);
    expect(snapshot(profile)).toBe(before);
    expect(profile.city).toBe(cityRef);
    expect(profile.injury).toBe(injuryRef);
    expect(profile.inventory).toBe(inventoryRef);
    if (result.ok) {
      expect(result.profile).not.toBe(profile);
      expect(result.profile.city).not.toBe(profile.city);
    }
  });

  test('unrelated fields survive by identity', () => {
    const profile = woundedOn(1);
    const result = restAtMedicalHouse(profile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.baseStats).toBe(profile.baseStats);
    expect(result.profile.equipped).toBe(profile.equipped);
    expect(result.profile.inventory).toBe(profile.inventory);
    expect(result.profile.appearance).toBe(profile.appearance);
    expect(result.profile.tierProgress).toBe(profile.tierProgress);
  });

  test('the module carries no storage, React, wall clock, timer or randomness', () => {
    for (const forbidden of [
      'localStorage',
      'sessionStorage',
      'saveProfile',
      'loadSavedProfile',
      'react',
      'useState',
      'useEffect',
      'Date.now',
      'new Date',
      'setTimeout',
      'setInterval',
      'Math.random',
      'performance.now',
    ]) {
      expect(MODULE_CODE).not.toContain(forbidden);
    }
  });

  test('the module imports only the house modules it needs', () => {
    const imports = readFileSync(new URL('./restRecovery.ts', import.meta.url), 'utf8')
      .split('\n')
      .filter((line) => line.startsWith('import '));
    expect(imports).toHaveLength(4);
    const joined = imports.join('\n');
    expect(joined).toContain("from '../types/game'");
    expect(joined).toContain("from '../data/training'");
    expect(joined).toContain("from './cityClock'");
    expect(joined).toContain("from './injurySettlement'");
  });
});

// ── §F. The neighbours respond to the resulting day ────────────────────────

describe('§F — the day it turns is the neighbours’ own input', () => {
  test('the merchant’s allowance reopens on the day the rest produced', () => {
    // The player bought at the merchant on day 1 and rests the same day.
    const profile = woundedOn(1, { city: { day: 1, merchantPurchaseDay: 1 } });
    expect(isMerchantPurchaseSpent(profile)).toBe(true);

    const result = restAtMedicalHouse(profile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(resolveCityDay(result.profile)).toBe(2);
    expect(resolveMerchantPurchaseDay(result.profile)).toBe(1);
    expect(isMerchantPurchaseSpent(result.profile)).toBe(false);
  });

  test('the day’s merchant offer is resolved from the resulting day', () => {
    const result = restAtMedicalHouse(woundedOn(1));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const offer = resolveStorefrontOffer(result.profile, 'merchant');
    expect(offer).toEqual(rotateStorefrontStock('merchant', 2));
    expect(offer.length).toBe(4);
    for (const id of offer) {
      expect(isStorefrontItemOnOffer(result.profile, 'merchant', id)).toBe(true);
    }
  });

  test('the training schedule resolves on the resulting day, unchanged', () => {
    const result = restAtMedicalHouse(woundedOn(1, { gold: 200 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const schedule = resolveTrainingSchedule(result.profile);
    expect(schedule.day).toBe(2);

    const resting = schedule.resting[0].id;
    expect(trainStat(result.profile, resting)).toEqual({ ok: false, reason: 'not-scheduled' });
    expect(trainStat(result.profile, schedule.actions[0].id).ok).toBe(true);
  });

  test('the injury lifecycle is untouched, on both sides of the rest', () => {
    // Normalization rules are not restated or weakened by this module.
    expect(normalizeInjury(null)).toBeNull();
    expect(normalizeInjury({ fightsRemaining: 3 })).toEqual({
      fightsRemaining: 3,
      penaltyStrength: 2,
      penaltyAgility: 2,
    });

    const result = restAtMedicalHouse(woundedOn(2));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // A cleared wound is not spent by a win, and a defeat inflicts its canonical 2.
    expect(settleInjury(result.profile, true).injury).toBeNull();
    expect(settleInjury(result.profile, false).injury).toEqual(WOUND);
  });

  test('the day a rest produced is the day a settled duel then advances', () => {
    const result = restAtMedicalHouse(woundedOn(1));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The neighbours read `city.day`; nothing needs a second clock to agree.
    expect(resolveCityDay(result.profile)).toBe(2);
    expect(resolveTrainingSchedule(result.profile).day).toBe(
      resolveTrainingSchedule({ city: { day: 2 } }).day
    );
  });
});

// ── §G. The wiring ────────────────────────────────────────────────────────

describe('§G — one rest path, and the clock call sites stay where they were', () => {
  const creditHandler = between(APP_CODE, 'const handleMatchComplete', 'const handleDuelResultDismiss');
  const restHandler = between(APP_CODE, 'const handleRest', 'const handleBuyItem');
  const medicalBranch = between(
    CITY_SCENE_CODE,
    "nearbyLoc.id === 'arena_medical_house'",
    '} else {'
  );

  test('the duel settlement still advances the clock and settles the wound exactly once', () => {
    expect(creditHandler.length).toBeGreaterThan(0);
    expect(creditHandler.match(/advanceCityDay\(/g)?.length).toBe(1);
    expect(creditHandler.match(/settleInjury\(/g)?.length).toBe(1);
    expect(APP_CODE.match(/advanceCityDay\(/g)?.length).toBe(1);
    expect(APP_CODE.match(/settleInjury\(/g)?.length).toBe(1);
  });

  test('the settlement keeps its one persistence pair per outcome', () => {
    expect(creditHandler.match(/saveProfile\(settledProfile\)/g)?.length).toBe(2);
    expect(creditHandler.match(/setProfile\(settledProfile\)/g)?.length).toBe(2);
  });

  test('the rest handler reads the newest profile, commits once and advances nothing', () => {
    expect(restHandler.length).toBeGreaterThan(0);
    expect(restHandler).toContain('restAtMedicalHouse(profileRef.current)');
    expect(restHandler).toContain('if (!rest.ok) return rest;');
    expect(restHandler.match(/setProfile\(/g)?.length).toBe(1);
    expect(restHandler.match(/saveProfile\(/g)?.length).toBe(1);
    expect(restHandler).toContain('profileRef.current = rested');
    expect(restHandler).not.toContain('advanceCityDay');
    expect(restHandler.match(/restAtMedicalHouse\(/g)?.length).toBe(1);

    // …and the commit order is ref → state → save, exactly as the other handlers.
    const call = restHandler.indexOf('restAtMedicalHouse');
    const refWrite = restHandler.indexOf('profileRef.current = rested');
    const stateWrite = restHandler.indexOf('setProfile(rested)');
    const save = restHandler.indexOf('saveProfile(rested)');
    expect(call).toBeLessThan(refWrite);
    expect(refWrite).toBeLessThan(stateWrite);
    expect(stateWrite).toBeLessThan(save);
  });

  test('this module is the only OTHER production caller of the clock', () => {
    const callers = PRODUCTION.filter((file) => file.source.includes('advanceCityDay('))
      .map((file) => file.path)
      .sort();
    expect(callers).toEqual(['App.tsx', 'utils/restRecovery.ts']);
  });

  test('no UI component calls the clock or the settlement directly', () => {
    for (const file of PRODUCTION) {
      if (!file.path.startsWith('components/')) continue;
      expect(file.source).not.toContain('advanceCityDay');
      expect(file.source).not.toContain('settleInjury');
    }
  });

  test('there is exactly one rest transaction — no alternate path', () => {
    const callers = PRODUCTION.filter((file) => file.source.includes('restAtMedicalHouse('))
      .map((file) => file.path)
      .sort();
    expect(callers).toEqual(['App.tsx', 'utils/restRecovery.ts']);
  });

  test('App hands the handler to the city scene, once', () => {
    expect(APP_CODE.match(/onRest=\{handleRest\}/g)?.length).toBe(1);
    expect(APP_CODE.match(/const handleRest = /g)?.length).toBe(1);
    expect(APP_CODE).not.toContain('restDay =');
  });

  test('the Medical House branch asks the transaction and shows its result', () => {
    expect(medicalBranch.length).toBeGreaterThan(0);
    expect(medicalBranch).toContain('onRest()');
    expect(medicalBranch).toContain('restNotice(');
    // The old static description is gone from this branch…
    expect(medicalBranch).not.toContain('Bandages, ceramic vessels');
    // …the approved uninjured wording is what the refusal says…
    expect(CITY_SCENE_CODE).toContain('The medicus finds nothing to treat.');
    // …and a success names the wound, dawn, the day and the gold.
    expect(CITY_SCENE_CODE).toContain('cleans and binds your wound');
    expect(CITY_SCENE_CODE).toContain('sleep until dawn');
    expect(CITY_SCENE_CODE).toContain('resolveCityDay(result.profile)');
    expect(CITY_SCENE_CODE).toContain('result.cost');
    expect(CITY_SCENE_CODE).not.toContain('advanceCityDay');
  });

  test('the Medical House prompt and its interaction rules are unchanged', () => {
    const medical = HUB_LOCATIONS.find((location) => location.id === 'arena_medical_house');
    expect(medical).toBeDefined();
    expect(medical?.actionPrompt).toBe('Visit Arena Medical House');
    expect(medical?.radius).toBe(4.5);
    expect(medical?.position).toEqual([-29, 0, -5]);
    // It still runs through the same proximity prompt every hub uses.
    expect(CITY_SCENE_CODE).toContain('{nearbyLoc.actionPrompt} [E / Space]');
  });

  test('the Bathhouse and the Caravanserai interactions are untouched', () => {
    const bathhouse = HUB_LOCATIONS.find((location) => location.id === 'bathhouse');
    expect(bathhouse?.tabKey).toBe('stats');
    expect(bathhouse?.actionPrompt).toBe('Visit the Thermae');

    const caravanserai = HUB_LOCATIONS.find((location) => location.id === 'caravanserai');
    expect(caravanserai?.tabKey).toBe('gear');
    expect(caravanserai?.actionPrompt).toBe('Equip Loadout');

    // Neither gained a branch of its own: both still fall through to the tab.
    expect(CITY_SCENE_CODE).not.toContain("id === 'bathhouse'");
    expect(CITY_SCENE_CODE).not.toContain("id === 'caravanserai'");
    expect(CITY_SCENE_CODE).toContain('} else if (nearbyLoc.tabKey) {');
  });
});
