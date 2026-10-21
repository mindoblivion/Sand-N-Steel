/**
 * L14 — a night at the Caravanserai: one day spent, `25 × level` gold paid, no wound tended.
 *
 * The lodging transaction is the second way to spend a city day without a bout
 * (the medicus was the first), so this suite pins the contract it inherits from
 * `restRecovery.ts`/`storefrontPurchase.ts` — one base, checks before the commit,
 * one new profile, a refusal that writes nothing — and then pins what makes it
 * LODGING rather than treatment: the injury slot is carried across untouched and
 * the day-dependent systems resolve from the day the player wakes on.
 *
 *   §A  the stay — the fee, the entry day recorded, one day turned, nothing awarded;
 *   §B  the refusals — no profile, a room already taken, an unaffordable bed, each
 *       leaving the profile (and every nested object) byte-identical;
 *   §C  the allowance over days — the room reopens on the next day, the record
 *       survives advancing, and never grows past one number;
 *   §D  backward compatibility and preservation — a legacy save lodges day 1 → 2,
 *       and every unrelated field survives by identity;
 *   §E  the neighbours — merchant stock and its daily allowance, the training
 *       timetable and the visitors all resolve from the new day, and the medicus
 *       is unchanged (lodging never heals, rest still refuses an uninjured man);
 *   §F  purity — no storage, React, timer, wall clock or randomness;
 *   §G  the App handler, EXECUTED from its own source — ref → state → save, one
 *       save on success, none on a refusal;
 *   §H  the city interaction — the Caravanserai lodges, the Armory keeps its footer.
 *
 * Run with: `bun test src/utils/lodging.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via `bun test`
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { trainingCost } from '../data/training';
import { createNewProfile } from '../services/storage';
import type { PlayerProfile } from '../types/game';
import { HUB_LOCATIONS } from './cityCollisions';
import { CITY_DAY_MAX, resolveCityDay } from './cityClock';
import { isStorefrontItemOnOffer, resolveStorefrontOffer } from './cityRotation';
import { normalizeInjury, settleInjury } from './injurySettlement';
import {
  LODGING_DAY_FIELD,
  isLodgingSpentToday,
  lodgeAtCaravanserai,
  lodgingCost,
  resolveLodgingDay,
} from './lodging';
import { isRestSpentToday, restAtMedicalHouse } from './restRecovery';
import { isMerchantPurchaseSpent, resolveMerchantPurchaseDay } from './storefrontPurchase';
import { resolveTrainingSchedule } from './trainingSchedule';
import { resolveVisitorSchedule } from './visitorSchedule';

/** Source with comments removed — prose can neither satisfy nor defeat a guard. */
const code = (target: string | URL): string =>
  readFileSync(target instanceof URL ? target : new URL(target, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const APP_CODE = code('../App.tsx');
const CITY_SCENE_CODE = code('../components/3d/city/CityHubScene.tsx');
const MODULE_CODE = code('./lodging.ts');
const HUB_CODE = code('../components/hub/GladiatorSchoolHub.tsx');

/** A gladiator with a purse that covers several level-1 nights (25 each). */
function lodger(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return { ...createNewProfile('Lodger'), gold: 200, ...overrides };
}

/** The same gladiator on a known city day, keeping any other city fields. */
function onDay(day: number, overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return { ...lodger(overrides), city: { ...overrides.city, day } };
}

/** A pre-L14 save: the profile with no `city` field at all. */
function legacy(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  const profile = lodger(overrides);
  delete (profile as { city?: unknown }).city;
  return profile;
}

const snapshot = (value: unknown): string => JSON.stringify(value);

// ── §A. The stay ───────────────────────────────────────────────────────────

describe('§A — a room is paid for, and the player wakes on the next day', () => {
  test('success charges 25 × level and turns the day', () => {
    const profile = onDay(1);
    const result = lodgeAtCaravanserai(profile);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cost).toBe(25);
    expect(result.day).toBe(1); // the day the room CONSUMED
    expect(result.profile.gold).toBe(175);
    expect(resolveCityDay(result.profile)).toBe(2);
    expect(result.profile.city?.[LODGING_DAY_FIELD]).toBe(1);
  });

  test('the fee is the Ludus’s own formula, through trainingCost', () => {
    for (const level of [1, 2, 5, 9]) {
      const result = lodgeAtCaravanserai(onDay(3, { level, gold: 1000 }));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.cost).toBe(trainingCost(level));
      expect(result.profile.gold).toBe(1000 - trainingCost(level));
    }
  });

  test('lodgingCost is total: a missing or malformed level quotes level 1', () => {
    expect(lodgingCost({ level: 4 })).toBe(trainingCost(4));
    expect(lodgingCost({ level: 4.9 })).toBe(trainingCost(4));
    expect(lodgingCost({})).toBe(trainingCost(1));
    expect(lodgingCost({ level: Number.NaN })).toBe(trainingCost(1));
    expect(lodgingCost({ level: -3 })).toBe(trainingCost(1));
    expect(lodgingCost(null)).toBe(trainingCost(1));
  });

  test('the clock advances exactly once — never twice, never zero', () => {
    for (const day of [1, 4, 9, 40]) {
      const result = lodgeAtCaravanserai(onDay(day));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(resolveCityDay(result.profile)).toBe(day + 1);
      expect(result.day).toBe(day);
    }
  });

  test('the field is literally `lodgingDay`, on the existing city object', () => {
    expect(LODGING_DAY_FIELD).toBe('lodgingDay');
    const result = lodgeAtCaravanserai(onDay(3));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.profile.city ?? {})).toContain('lodgingDay');
  });

  test('a night awards nothing and moves no statistic', () => {
    const before = onDay(2);
    const result = lodgeAtCaravanserai(before);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.xp).toBe(before.xp);
    expect(result.profile.fame).toBe(before.fame);
    expect(result.profile.level).toBe(before.level);
    expect(result.profile.fightsWon).toBe(before.fightsWon);
    expect(result.profile.fightsLost).toBe(before.fightsLost);
    expect(result.profile.baseStats).toBe(before.baseStats);
    expect(result.profile.inventory).toBe(before.inventory);
    expect(result.profile.defeatedOpponentIds).toBe(before.defeatedOpponentIds);
  });
});

// ── §B. The refusals ───────────────────────────────────────────────────────

describe('§B — every refusal writes nothing', () => {
  test('no profile', () => {
    expect(lodgeAtCaravanserai(null)).toEqual({ ok: false, reason: 'no-profile' });
    expect(lodgeAtCaravanserai(undefined)).toEqual({ ok: false, reason: 'no-profile' });
  });

  test('a room already taken today is refused without a write', () => {
    const stayed = lodgeAtCaravanserai(onDay(4));
    expect(stayed.ok).toBe(true);
    if (!stayed.ok) return;

    // The SAME consumed day: `lodgingDay` still equals the clock.
    const sameDay = { ...stayed.profile, city: { ...stayed.profile.city, day: 4 } };
    const before = snapshot(sameDay);
    expect(lodgeAtCaravanserai(sameDay)).toEqual({ ok: false, reason: 'already-lodged' });
    expect(snapshot(sameDay)).toBe(before);
  });

  test('an unaffordable bed is refused without a write', () => {
    const poor = onDay(2, { gold: 24 });
    const before = snapshot(poor);
    expect(lodgeAtCaravanserai(poor)).toEqual({ ok: false, reason: 'insufficient-gold' });
    expect(snapshot(poor)).toBe(before);
  });

  test('exactly enough gold pays to zero; one short is refused', () => {
    const exact = lodgeAtCaravanserai(onDay(2, { gold: 25 }));
    expect(exact.ok).toBe(true);
    if (!exact.ok) return;
    expect(exact.profile.gold).toBe(0);

    expect(lodgeAtCaravanserai(onDay(2, { gold: 0 }))).toEqual({
      ok: false,
      reason: 'insufficient-gold',
    });
  });

  test('a refusal carries no profile at all — nothing partial can be written', () => {
    for (const profile of [null, onDay(1, { gold: 0 }), { ...onDay(1), city: { day: 1, lodgingDay: 1 } }]) {
      const result = lodgeAtCaravanserai(profile as PlayerProfile | null);
      expect(result.ok).toBe(false);
      expect('profile' in result).toBe(false);
    }
  });

  test('the allowance check precedes the purse check', () => {
    // Stuck on day 1 with an empty purse: the day's allowance is what refuses.
    const stuck = onDay(1, { gold: 0, city: { day: 1, lodgingDay: 1 } });
    expect(lodgeAtCaravanserai(stuck)).toEqual({ ok: false, reason: 'already-lodged' });
  });
});

// ── §C. The allowance over days ────────────────────────────────────────────

describe('§C — one room per day, and the record survives the day it buys', () => {
  test('the entry day is recorded, the new day is distinguishable from it', () => {
    const result = lodgeAtCaravanserai(onDay(6));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.city?.lodgingDay).toBe(6);
    expect(result.profile.city?.day).toBe(7);
    expect(isLodgingSpentToday(result.profile)).toBe(false);
  });

  test('lodging becomes available again after another day has passed', () => {
    const first = lodgeAtCaravanserai(onDay(6));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    // Still on the consumed day: refused.
    const sameDay = { ...first.profile, city: { ...first.profile.city, day: 6 } };
    expect(lodgeAtCaravanserai(sameDay)).toEqual({ ok: false, reason: 'already-lodged' });

    // A day later (a settled duel, or the night already bought): open again.
    const aDayLater = { ...first.profile, city: { ...first.profile.city, day: 8 } };
    const second = lodgeAtCaravanserai(aDayLater);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.profile.city?.lodgingDay).toBe(8);
    expect(second.profile.city?.day).toBe(9);
    expect(second.profile.gold).toBe(first.profile.gold - 25);
  });

  test('a day advance settles the allowance, and the record survives it', () => {
    const stayed = lodgeAtCaravanserai(onDay(2));
    expect(stayed.ok).toBe(true);
    if (!stayed.ok) return;

    // A settled duel turns the day with the clock's own helper; the lodging
    // record must ride along untouched (it is what the allowance is spent against).
    const nextDay = {
      ...stayed.profile,
      city: { ...stayed.profile.city, day: 3 },
    };
    expect(resolveLodgingDay(nextDay)).toBe(2);
    expect(isLodgingSpentToday(nextDay)).toBe(false);
    const again = lodgeAtCaravanserai(nextDay);
    expect(again.ok).toBe(true);
  });

  test('the record is ONE number, never a growing log', () => {
    let profile = onDay(1, { gold: 500 });
    for (let day = 1; day <= 5; day += 1) {
      const result = lodgeAtCaravanserai({ ...profile, city: { ...profile.city, day } });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      profile = result.profile;
      expect(typeof profile.city?.lodgingDay).toBe('number');
    }
    expect(profile.gold).toBe(500 - 5 * 25);
    expect(resolveCityDay(profile)).toBe(6);
  });

  test('resolveLodgingDay is total over junk', () => {
    for (const raw of [undefined, null, '3', true, [], {}, Number.NaN, Number.POSITIVE_INFINITY, 0, -4, -0.5]) {
      expect(resolveLodgingDay({ city: { lodgingDay: raw as number } })).toBeNull();
    }
    expect(resolveLodgingDay({ city: { lodgingDay: 3.9 } })).toBe(3);
    expect(resolveLodgingDay({ city: 'junk' as never })).toBeNull();
    expect(resolveLodgingDay(null)).toBeNull();
  });

  test('the maximum supported day follows the clock: it caps and cannot be exceeded', () => {
    const atCap = lodgeAtCaravanserai(onDay(CITY_DAY_MAX, { gold: 100 }));
    expect(atCap.ok).toBe(true);
    if (!atCap.ok) return;
    // `advanceCityDay` caps at the largest safe integer, so the day holds...
    expect(resolveCityDay(atCap.profile)).toBe(CITY_DAY_MAX);
    expect(Number.isSafeInteger(resolveCityDay(atCap.profile))).toBe(true);
    // ...and the recorded entry day equals it, so the day's allowance is spent.
    expect(isLodgingSpentToday(atCap.profile)).toBe(true);
  });
});

// ── §D. Backward compatibility and preservation ────────────────────────────

describe('§D — a legacy save lodges, and nothing unrelated moves', () => {
  test('a profile with no `city` lodges from day 1 into day 2', () => {
    const result = lodgeAtCaravanserai(legacy());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.day).toBe(1);
    expect(resolveCityDay(result.profile)).toBe(2);
    expect(result.profile.city?.lodgingDay).toBe(1);
    expect(result.profile.gold).toBe(175);
  });

  test('the load path never needs a `city` field (no migration)', () => {
    const raw = legacy();
    expect((raw as { city?: unknown }).city).toBeUndefined();
    expect(resolveCityDay(raw)).toBe(1);
    expect(resolveLodgingDay(raw)).toBeNull();
    expect(isLodgingSpentToday(raw)).toBe(false);
  });

  test('existing CityState fields survive the stay and the advance', () => {
    const profile = onDay(7, {
      city: {
        day: 7,
        merchantPurchaseDay: 7,
        restDay: 6,
        seenVisitors: ['numidian_bladesmith'],
        completedVisitors: ['campanian_armorer'],
      },
    });
    const result = lodgeAtCaravanserai(profile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.city).toEqual({
      day: 8,
      merchantPurchaseDay: 7,
      restDay: 6,
      seenVisitors: ['numidian_bladesmith'],
      completedVisitors: ['campanian_armorer'],
      lodgingDay: 7,
    });
  });

  test('the visitor and allowance history objects are the SAME arrays', () => {
    const profile = onDay(2, {
      city: { day: 2, seenVisitors: ['numidian_bladesmith'], completedVisitors: [] },
    });
    const result = lodgeAtCaravanserai(profile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.city?.seenVisitors).toBe(profile.city?.seenVisitors);
    expect(result.profile.city?.completedVisitors).toBe(profile.city?.completedVisitors);
  });

  test('an injured profile wakes still injured, with the exact same record', () => {
    const wound = { fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 };
    const result = lodgeAtCaravanserai(onDay(3, { injury: { ...wound } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.injury).toEqual(wound);
    expect(normalizeInjury(result.profile.injury)).toEqual(wound);
  });

  test('an uninjured profile stays uninjured — a room never inflicts a wound', () => {
    const result = lodgeAtCaravanserai(onDay(3, { injury: null }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.injury).toBeNull();
    expect(normalizeInjury(result.profile.injury)).toBeNull();
  });

  test('stats, gear, purse-adjacent state, fame, tier and rank inputs are unchanged', () => {
    const profile = onDay(4, {
      fame: 640,
      xp: 310,
      currentTier: 3,
      bossKills: 2,
      defeatedOpponentIds: ['opp_goliath', 'opp_ignis'],
      inventory: [...createNewProfile('x').inventory],
      temper: { gladius_standard: 2 } as PlayerProfile['temper'],
    });
    const result = lodgeAtCaravanserai(profile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.baseStats).toBe(profile.baseStats);
    expect(result.profile.equipped).toBe(profile.equipped);
    expect(result.profile.inventory).toBe(profile.inventory);
    expect(result.profile.temper).toBe(profile.temper);
    expect(result.profile.fame).toBe(640);
    expect(result.profile.xp).toBe(310);
    expect(result.profile.currentTier).toBe(3);
    expect(result.profile.bossKills).toBe(2);
    expect(result.profile.defeatedOpponentIds).toBe(profile.defeatedOpponentIds);
    expect(result.profile.trainingSessionsLeft).toBe(profile.trainingSessionsLeft);
  });
});

// ── §E. The neighbours ─────────────────────────────────────────────────────

describe('§E — the day-dependent systems resolve from the day the player wakes on', () => {
  const stay = (day: number) => {
    const result = lodgeAtCaravanserai(onDay(day, { gold: 300 }));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected the stay to succeed');
    return result.profile;
  };

  test('the merchant resolves its stock from the post-lodging day', () => {
    const after = stay(2);
    expect(resolveCityDay(after)).toBe(3);
    expect(resolveStorefrontOffer(after, 'merchant')).toEqual(
      resolveStorefrontOffer({ city: { day: 3 } }, 'merchant')
    );
    // A different day is genuinely a different list on this pool.
    expect(resolveStorefrontOffer(after, 'merchant')).not.toEqual(
      resolveStorefrontOffer({ city: { day: 2 } }, 'merchant')
    );
  });

  test('the merchant’s once-per-day purchase restriction behaves on the new day', () => {
    const boughtYesterday = onDay(2, { city: { day: 2, merchantPurchaseDay: 2 } });
    expect(isMerchantPurchaseSpent(boughtYesterday)).toBe(true);

    const result = lodgeAtCaravanserai(boughtYesterday);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The room spent the day, so the merchant's allowance reopens on it.
    expect(resolveMerchantPurchaseDay(result.profile)).toBe(2);
    expect(isMerchantPurchaseSpent(result.profile)).toBe(false);
    // …and everything the day offers passes the offer gate it always did.
    for (const id of resolveStorefrontOffer(result.profile, 'merchant')) {
      expect(isStorefrontItemOnOffer(result.profile, 'merchant', id)).toBe(true);
    }
  });

  test('the training timetable resolves from the post-lodging day', () => {
    const after = stay(4);
    const schedule = resolveTrainingSchedule(after);
    expect(schedule.day).toBe(5);
    expect(schedule.actions).toEqual(resolveTrainingSchedule({ city: { day: 5 } }).actions);
    expect(schedule.resting).toEqual(resolveTrainingSchedule({ city: { day: 5 } }).resting);
  });

  test('the visitors resolve from the post-lodging day', () => {
    const after = stay(4);
    const schedule = resolveVisitorSchedule(after);
    expect(schedule.day).toBe(5);
    expect(schedule.arrivals).toEqual(resolveVisitorSchedule({ city: { day: 5 } }).arrivals);
    // Day 5 is the bladesmith's first day — the arrival a night in town buys.
    expect(schedule.arrivals.length).toBeGreaterThan(0);
  });

  test('the medicus is unchanged: lodging spends no rest, and heals nothing', () => {
    const wound = { fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 };
    const after = stay(5);
    expect(after.injury).toBeNull(); // uninjured in, uninjured out
    expect(isRestSpentToday(after)).toBe(false); // last night was an inn, not a treatment
    expect(restAtMedicalHouse(after)).toEqual({ ok: false, reason: 'no-injury' });

    const wounded = lodgeAtCaravanserai(onDay(5, { injury: { ...wound } }));
    expect(wounded.ok).toBe(true);
    if (!wounded.ok) return;
    expect(wounded.profile.injury).toEqual(wound);
    const treated = restAtMedicalHouse(wounded.profile);
    expect(treated.ok).toBe(true);
    if (!treated.ok) return;
    expect(treated.profile.injury).toBeNull();
  });

  test('a settled duel after a night still spends the injury as it always did', () => {
    const wound = { fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 };
    const stayed = lodgeAtCaravanserai(onDay(5, { injury: { ...wound } }));
    expect(stayed.ok).toBe(true);
    if (!stayed.ok) return;
    expect(settleInjury(stayed.profile, true).injury).toEqual({
      fightsRemaining: 1,
      penaltyStrength: 2,
      penaltyAgility: 2,
    });
  });
});

// ── §F. Purity ─────────────────────────────────────────────────────────────

describe('§F — the module is pure and cannot persist anything', () => {
  test('success does not mutate its input', () => {
    const profile = onDay(2);
    const before = snapshot(profile);
    lodgeAtCaravanserai(profile);
    expect(snapshot(profile)).toBe(before);
  });

  test('refusal does not mutate its input', () => {
    const profile = onDay(2, { gold: 0 });
    const before = snapshot(profile);
    lodgeAtCaravanserai(profile);
    expect(snapshot(profile)).toBe(before);
  });

  test('a frozen profile is answerable, and a new object comes back', () => {
    const frozen = Object.freeze({ ...onDay(3), city: Object.freeze({ day: 3 }) });
    const result = lodgeAtCaravanserai(frozen as PlayerProfile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile).not.toBe(frozen as unknown as PlayerProfile);
    expect(result.profile.city).not.toBe(frozen.city);
  });

  test('no storage, React, timer, wall clock or randomness in the module', () => {
    for (const token of [
      'localStorage',
      'sessionStorage',
      'saveProfile',
      'loadSavedProfile',
      'useState',
      'useEffect',
      'setTimeout',
      'setInterval',
      'Date.now',
      'new Date',
      'Math.random',
    ]) {
      expect(MODULE_CODE).not.toContain(token);
    }
  });

  test('the module imports only the clock, the fee table and its types', () => {
    const imports = MODULE_CODE.match(/^import .*$/gm) ?? [];
    expect(imports.length).toBe(3);
    expect(MODULE_CODE).toContain("from './cityClock'");
    expect(MODULE_CODE).toContain("from '../data/training'");
  });
});

// ── §G. The App handler, executed from its own source ──────────────────────

describe('§G — the handler commits ref → state → save, exactly once', () => {
  /** Pull one `const name = (...) => { … };` declaration out of App's source. */
  function extractHandler(name: string): string {
    const needle = `const ${name} = `;
    const start = APP_CODE.indexOf(needle);
    if (start < 0) throw new Error(`${name} is not declared in App.tsx`);
    const bodyStart = APP_CODE.indexOf('{', APP_CODE.indexOf('=>', start));
    let depth = 0;
    for (let i = bodyStart; i < APP_CODE.length; i += 1) {
      if (APP_CODE[i] === '{') depth += 1;
      else if (APP_CODE[i] === '}') {
        depth -= 1;
        if (depth === 0) return APP_CODE.slice(start, i + 2);
      }
    }
    throw new Error(`${name}'s body is not balanced`);
  }

  function lodgingHarness(refProfile: PlayerProfile | null, renderProfile: PlayerProfile | null) {
    const ref: { current: PlayerProfile | null } = { current: refProfile };
    const renders: Array<PlayerProfile | null> = [];
    const saves: PlayerProfile[] = [];
    const factory = new Function(
      'profileRef',
      'profile',
      'setProfile',
      'saveProfile',
      'lodgeAtCaravanserai',
      // @ts-ignore — Bun is the test runtime
      new Bun.Transpiler({ loader: 'ts' }).transformSync(
        `${extractHandler('handleLodging')}\nreturn { handleLodging };`
      )
    ) as (...args: unknown[]) => { handleLodging: () => unknown };
    const handlers = factory(
      ref,
      renderProfile,
      (next: PlayerProfile | null) => renders.push(next),
      (profile: PlayerProfile) => saves.push(profile),
      lodgeAtCaravanserai
    );
    return { ref, renders, saves, handlers };
  }

  test('the declaration is App’s own source', () => {
    expect(APP_CODE).toContain(extractHandler('handleLodging'));
    expect(APP_CODE.match(/const handleLodging = /g)?.length).toBe(1);
    expect(APP_CODE.match(/onLodging=\{handleLodging\}/g)?.length).toBe(1);
  });

  test('the authoritative base is profileRef.current, not the render’s profile', () => {
    // The render snapshot cannot afford a room; the committed profile can.
    const live = onDay(4, { gold: 200 });
    const render = onDay(4, { gold: 0 });
    const harness = lodgingHarness(live, render);

    const result = harness.handlers.handleLodging() as { ok: boolean; profile?: PlayerProfile };
    expect(result.ok).toBe(true);
    expect(harness.saves.length).toBe(1);
    expect(harness.saves[0].gold).toBe(175);
    expect(resolveCityDay(harness.saves[0])).toBe(5);
  });

  test('success writes one identical object through ref, state and disk, in that order', () => {
    const harness = lodgingHarness(onDay(2), onDay(2));
    harness.handlers.handleLodging();

    const saved = harness.saves[0];
    expect(harness.ref.current).toBe(saved);
    expect(harness.renders).toEqual([saved]);
    expect(harness.saves.length).toBe(1);
    expect(resolveCityDay(saved)).toBe(3);
    expect(saved.city?.lodgingDay).toBe(2);
  });

  test('a refusal saves nothing and touches no channel', () => {
    const stays = lodgeAtCaravanserai(onDay(3));
    expect(stays.ok).toBe(true);
    if (!stays.ok) return;

    const sameDay = { ...stays.profile, city: { ...stays.profile.city, day: 3 } };
    const harness = lodgingHarness(sameDay, null);
    const result = harness.handlers.handleLodging() as { ok: boolean; reason?: string };
    expect(result).toEqual({ ok: false, reason: 'already-lodged' });
    expect(harness.saves.length).toBe(0);
    expect(harness.renders.length).toBe(0);
    expect(harness.ref.current).toBe(sameDay);

    const poor = lodgingHarness(onDay(3, { gold: 1 }), null);
    expect((poor.handlers.handleLodging() as { reason?: string }).reason).toBe('insufficient-gold');
    expect(poor.saves.length).toBe(0);
  });

  test('two clicks buy two nights, never a same-day double charge', () => {
    // Each success spends its own day, so a second click is a second NIGHT —
    // one day and one fee apiece, and the allowance can never be spent twice on
    // the day a stay consumed.
    const harness = lodgingHarness(onDay(6), null);
    harness.handlers.handleLodging();
    harness.handlers.handleLodging();
    expect(harness.saves.length).toBe(2);
    expect(harness.saves[0].gold).toBe(175);
    expect(harness.saves[1].gold).toBe(150);
    expect(resolveCityDay(harness.saves[0])).toBe(7);
    expect(resolveCityDay(harness.saves[1])).toBe(8);

    // On one and the same day, the second attempt is refused and saves nothing.
    const sameDay = lodgingHarness(onDay(6, { city: { day: 6, lodgingDay: 6 } }), null);
    expect((sameDay.handlers.handleLodging() as { reason?: string }).reason).toBe('already-lodged');
    expect(sameDay.saves.length).toBe(0);
  });

  test('the handler does no clock work of its own', () => {
    const handler = extractHandler('handleLodging');
    expect(handler).not.toContain('advanceCityDay');
    expect(handler).not.toContain('resolveCityDay');
    expect(handler.match(/saveProfile\(/g)?.length).toBe(1);
    expect(handler.match(/setProfile\(/g)?.length).toBe(1);
  });

  test('this module is the third production caller of the clock, and no UI does it', () => {
    // The clock's callers are: the duel settlement (App), the medicus, the inn.
    expect(APP_CODE.match(/advanceCityDay\(/g)?.length).toBe(1);
    expect(MODULE_CODE).toContain('advanceCityDay(');
    for (const [path, source] of Object.entries({
      'CityHubScene.tsx': CITY_SCENE_CODE,
      'GladiatorSchoolHub.tsx': HUB_CODE,
    })) {
      expect(`${path}:${source.includes('advanceCityDay')}`).toBe(`${path}:false`);
    }
  });
});

// ── §H. The city interaction ───────────────────────────────────────────────

describe('§H — the Caravanserai lodges; the Armory keeps its own door', () => {
  const caravanserai = HUB_LOCATIONS.find((location) => location.id === 'caravanserai');

  test('the hub entry no longer opens the Armory', () => {
    expect(caravanserai).toBeDefined();
    expect(caravanserai?.tabKey).toBeUndefined();
    expect(caravanserai?.actionPrompt).toBe('Take a Room');
    expect(caravanserai?.name).toBe('Caravanserai Inn');
    expect(caravanserai?.subtitle).toBe('Rest & Quarters');
    // Its reachability (the C-8.47 rule) is untouched.
    expect(caravanserai?.radius).toBe(5.75);
    expect(caravanserai?.position).toEqual([16, 0, 14]);
  });

  test('the scene dispatches the Caravanserai to lodging, before the tab fall-through', () => {
    const dispatch = CITY_SCENE_CODE.slice(
      CITY_SCENE_CODE.indexOf("nearbyLoc.id === 'caravanserai'"),
      CITY_SCENE_CODE.indexOf("nearbyLoc.id === 'arena_medical_house'")
    );
    expect(dispatch.length).toBeGreaterThan(0);
    expect(dispatch).toContain('onLodging()');
    expect(dispatch).toContain('lodgingNotice(');
    expect(dispatch).toContain('setStableNotice(');
    // It is the hub's own branch, not a tab: the entry carries no `tabKey`, so
    // the `nearbyLoc.tabKey` fall-through cannot open the Armory from the inn.
    expect(caravanserai?.tabKey).toBeUndefined();
    expect(CITY_SCENE_CODE).not.toContain("id === 'caravanserai' && nearbyLoc.tabKey");
  });

  test('the notice names the new day, the fee and the distinction from the medicus', () => {
    expect(CITY_SCENE_CODE).toContain('resolveCityDay(result.profile)');
    expect(CITY_SCENE_CODE).toContain('result.cost');
    expect(CITY_SCENE_CODE).toContain('no wound is tended here');
    expect(CITY_SCENE_CODE).toContain('already paid for a room today');
    expect(CITY_SCENE_CODE).toContain('gold for a bed');
    // The medicus's own wording is untouched beside it.
    expect(CITY_SCENE_CODE).toContain('The medicus finds nothing to treat.');
    expect(CITY_SCENE_CODE).toContain('cleans and binds your wound');
  });

  test('the Armory stays reachable from the hub footer', () => {
    expect(HUB_CODE).toContain("key: 'gear'");
    expect(HUB_CODE).toContain("label: 'Armory'");
    expect(APP_CODE).toContain('onOpenArmory=');
  });

  test('no new mesh, collider, visitor geometry or per-frame work came with it', () => {
    expect(CITY_SCENE_CODE).not.toContain('LodgingMesh');
    expect(CITY_SCENE_CODE).not.toContain('lodgingDisc');
    // The notice builder is a plain function, not a mounted component.
    expect(CITY_SCENE_CODE).toContain('function lodgingNotice(result: LodgingResult, level: number): string');
    // The hub table still carries no visitor entry and the inn gained no collider.
    const collisions = code('./cityCollisions.ts');
    expect(collisions).toContain("id: 'caravanserai'");
    expect(collisions).not.toContain('lodgingDay');
  });
});
