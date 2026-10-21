/**
 * S5 — THE CURES: the Medical House's treat and the Caravanserai Inn's rest.
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  treat: a live injury clears outright and costs exactly 75 gold — once;
 *   §B  rest: two fights come off the clock for exactly 25 gold, and the wound
 *       clears to `null` at zero (from 3 → 1, from 2 → null, from 1 → null) —
 *       it never goes negative and the penalties ride along until it clears;
 *   §C  both refusals, each with the profile untouched: no live injury (absent,
 *       null, exhausted, malformed) and a purse below the price (a balance that is
 *       exactly the price pays to zero, a missing/non-finite balance is refused);
 *   §D  purity: the input profile and its nested injury are never mutated, frozen
 *       inputs are survivable, and a refusal returns the CALLER'S OWN object;
 *   §E  the wiring: two App-level handlers (the only callers), the city's panel and
 *       its callbacks, the Inn's old Armory redirect gone, the other flavour notices
 *       untouched, and no day/time involvement anywhere in this slice.
 *
 * The PRICES are pinned as the design writes them — Treat 75g, Rest 25g — not as
 * read back from the module (production-lessons.md L-11: a test that restates a
 * constant can only agree with itself).
 *
 * Run with: `bun test src/utils/treatment.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlayerInjury, PlayerProfile } from '../types/game';
import {
  REST_FIGHTS_RESTORED,
  getTreatmentEligibility,
  restAtInn,
  treatInjury,
  treatmentPrice,
} from './injury';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';
import { HUB_LOCATIONS } from './cityCollisions';

const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url));

const FRESH: PlayerInjury = { fightsRemaining: 3, penaltyStrength: 2, penaltyAgility: 2 };

function bareProfile(over: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    name: 'Test',
    title: 'Tester',
    rank: 'Rookie',
    appearance: {
      skinColor: '#000',
      hairColor: '#000',
      tunicColor: '#000',
      crestColor: '#000',
    },
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    unspentStatPoints: 0,
    baseStats: { strength: 10, agility: 10, stamina: 10, defense: 4 },
    gold: 100,
    fame: 0,
    currentTier: 1,
    tierProgress: { 1: 0, 2: 0, 3: 0, 4: 0 },
    defeatedOpponentIds: [],
    bossKills: 0,
    newGamePlus: 0,
    trainingSessionsLeft: 2,
    injury: null,
    equipped: { weapon: DEFAULT_PLAYER_WEAPON },
    inventory: [],
    fightsWon: 0,
    fightsLost: 0,
    peakCrowdHypeOverall: 0,
    ...over,
  };
}

/** Strip comments so prose can never satisfy (or defeat) a source assertion. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const APP_SOURCE = code(readFileSync(join(SRC_ROOT, 'App.tsx'), 'utf8'));
const SCENE_SOURCE = code(
  readFileSync(join(SRC_ROOT, 'components', '3d', 'city', 'CityHubScene.tsx'), 'utf8'),
);
const INJURY_SOURCE = code(readFileSync(join(SRC_ROOT, 'utils', 'injury.ts'), 'utf8'));

// ── §A the Medical House ───────────────────────────────────────────────────
describe('§A treat clears a live injury for 75 gold', () => {
  test('the price is the design’s 75 gold', () => {
    expect(treatmentPrice('medical_house')).toBe(75);
  });

  test('a live wound clears outright and exactly one price is deducted', () => {
    const hurt = bareProfile({ injury: FRESH, gold: 100 });
    const cured = treatInjury(hurt);
    expect(cured.injury).toBeNull();
    expect(cured.gold).toBe(25); // 100 − 75
  });

  test('nothing else on the profile moves', () => {
    const hurt = bareProfile({ injury: FRESH, gold: 100, fame: 12, fightsWon: 4 });
    const cured = treatInjury(hurt);
    expect({ ...cured, injury: hurt.injury, gold: hurt.gold }).toEqual(hurt);
    expect(cured.fame).toBe(12);
    expect(cured.fightsWon).toBe(4);
  });

  test('a purse exactly at the price pays to zero, never below', () => {
    const cured = treatInjury(bareProfile({ injury: FRESH, gold: 75 }));
    expect(cured.gold).toBe(0);
    expect(cured.injury).toBeNull();
  });

  test('treating twice from one profile charges once', () => {
    const hurt = bareProfile({ injury: FRESH, gold: 200 });
    const once = treatInjury(hurt);
    const twice = treatInjury(hurt);
    expect(once.gold).toBe(125);
    expect(twice.gold).toBe(125);
    // The cured profile has no injury left, so a second visit is refused.
    expect(treatInjury(once)).toBe(once);
  });
});

// ── §B the Caravanserai Inn ────────────────────────────────────────────────
describe('§B rest takes two fights off the clock for 25 gold', () => {
  test('the price is the design’s 25 gold and the bite is two fights', () => {
    expect(treatmentPrice('caravanserai')).toBe(25);
    expect(REST_FIGHTS_RESTORED).toBe(2);
  });

  test('3 fights → 1 fight, exactly 25 gold deducted, penalties intact', () => {
    const rested = restAtInn(bareProfile({ injury: FRESH, gold: 100 }));
    expect(rested.injury).toEqual({ fightsRemaining: 1, penaltyStrength: 2, penaltyAgility: 2 });
    expect(rested.gold).toBe(75); // 100 − 25
  });

  test('2 fights → cleared to null (the floor, not a zero-fight wound)', () => {
    const rested = restAtInn(
      bareProfile({ injury: { ...FRESH, fightsRemaining: 2 }, gold: 100 }),
    );
    expect(rested.injury).toBeNull();
    expect(rested.gold).toBe(75);
  });

  test('1 fight → cleared to null, never negative', () => {
    const rested = restAtInn(
      bareProfile({ injury: { ...FRESH, fightsRemaining: 1 }, gold: 100 }),
    );
    expect(rested.injury).toBeNull();
    expect(rested.gold).toBe(75);
  });

  test('rest is not a cure: a fresh 3-fight wound still has a fight left', () => {
    const rested = restAtInn(bareProfile({ injury: FRESH }));
    expect(rested.injury?.fightsRemaining).toBe(1);
  });

  test('two rests take the same wound from 3 to null, 50 gold in total', () => {
    const first = restAtInn(bareProfile({ injury: FRESH, gold: 60 }));
    expect(first.injury?.fightsRemaining).toBe(1);
    expect(first.gold).toBe(35);
    const second = restAtInn(first);
    expect(second.injury).toBeNull();
    expect(second.gold).toBe(10);
  });

  test('rest advances no day and no time — the clock field is not written', () => {
    const rested = restAtInn(bareProfile({ injury: FRESH, time: { total: 11 } }));
    expect(rested.time).toEqual({ total: 11 });
    expect(rested).not.toBe(null);
  });
});

// ── §C the refusals ────────────────────────────────────────────────────────
describe('§C both services refuse, and the profile is untouched', () => {
  test('treat with no injury is refused', () => {
    const healthy = bareProfile({ injury: null, gold: 500 });
    expect(getTreatmentEligibility(healthy, 'medical_house')).toEqual({
      ok: false,
      reason: 'no-injury',
    });
    expect(treatInjury(healthy)).toBe(healthy);
    expect(healthy.gold).toBe(500);
  });

  test('rest with no injury is refused', () => {
    const healthy = bareProfile({ injury: null, gold: 500 });
    expect(getTreatmentEligibility(healthy, 'caravanserai')).toEqual({
      ok: false,
      reason: 'no-injury',
    });
    expect(restAtInn(healthy)).toBe(healthy);
    expect(healthy.gold).toBe(500);
  });

  test('an exhausted or malformed wound is no injury, so it is refused', () => {
    for (const injury of [
      { ...FRESH, fightsRemaining: 0 },
      { ...FRESH, fightsRemaining: -2 },
      { fightsRemaining: Number.NaN } as PlayerInjury,
    ]) {
      const stale = bareProfile({ injury, gold: 500 });
      expect(treatInjury(stale)).toBe(stale);
      expect(restAtInn(stale)).toBe(stale);
      expect(stale.gold).toBe(500);
    }
  });

  test('treat with gold below the price is refused — gold and injury untouched', () => {
    const poor = bareProfile({ injury: FRESH, gold: 74 });
    const result = getTreatmentEligibility(poor, 'medical_house');
    expect(result).toEqual({ ok: false, reason: 'insufficient-gold' });
    expect(treatInjury(poor)).toBe(poor);
    expect(poor.gold).toBe(74);
    expect(poor.injury).toEqual(FRESH);
  });

  test('rest with gold below the price is refused — gold and injury untouched', () => {
    const poor = bareProfile({ injury: FRESH, gold: 24 });
    const result = getTreatmentEligibility(poor, 'caravanserai');
    expect(result).toEqual({ ok: false, reason: 'insufficient-gold' });
    expect(restAtInn(poor)).toBe(poor);
    expect(poor.gold).toBe(24);
    expect(poor.injury).toEqual(FRESH);
  });

  test('a malformed balance can afford nothing', () => {
    const broken = bareProfile({ injury: FRESH, gold: Number.NaN });
    expect(getTreatmentEligibility(broken, 'medical_house')).toEqual({
      ok: false,
      reason: 'insufficient-gold',
    });
    expect(treatInjury(broken)).toBe(broken);
    expect(restAtInn(broken)).toBe(broken);
  });

  test('the eligible path answers the price it would charge', () => {
    const hurt = bareProfile({ injury: FRESH, gold: 100 });
    expect(getTreatmentEligibility(hurt, 'medical_house')).toEqual({ ok: true, price: 75 });
    expect(getTreatmentEligibility(hurt, 'caravanserai')).toEqual({ ok: true, price: 25 });
  });
});

// ── §D purity ──────────────────────────────────────────────────────────────
describe('§D the helpers are pure', () => {
  test('frozen inputs survive both helpers and are not mutated', () => {
    const hurt = bareProfile({
      injury: Object.freeze({ ...FRESH }) as PlayerInjury,
      equipped: Object.freeze({ weapon: DEFAULT_PLAYER_WEAPON }) as PlayerProfile['equipped'],
    });
    const snapshot = JSON.stringify(hurt);

    const cured = treatInjury(hurt);
    const rested = restAtInn(hurt);

    expect(JSON.stringify(hurt)).toBe(snapshot);
    expect(hurt.injury).toEqual(FRESH);
    expect(hurt.gold).toBe(100);
    expect(cured).not.toBe(hurt);
    expect(rested).not.toBe(hurt);
    expect(cured.injury).toBeNull();
    expect(rested.injury?.fightsRemaining).toBe(1);
  });

  test('two calls on the same input agree and do not share an object', () => {
    const hurt = bareProfile({ injury: FRESH });
    const a = restAtInn(hurt);
    const b = restAtInn(hurt);
    expect(a.injury).toEqual(b.injury);
    expect(a).not.toBe(b);
    expect(a.injury).not.toBe(b.injury);
  });
});

// ── §E the wiring ──────────────────────────────────────────────────────────
describe('§E the wiring: App transacts, the city reports the choice', () => {
  test('App is the only caller, and each handler saves exactly once', () => {
    expect(APP_SOURCE.match(/treatInjury\(profile\)/g)?.length).toBe(1);
    expect(APP_SOURCE.match(/restAtInn\(profile\)/g)?.length).toBe(1);

    for (const helper of ['treatInjury', 'restAtInn']) {
      const at = APP_SOURCE.indexOf(`${helper}(profile)`);
      const block = APP_SOURCE.slice(at, APP_SOURCE.indexOf('};', at));
      expect(block).toContain('setProfile(');
      expect(block).toContain('saveProfile(');
    }
  });

  test('the city scene hands both callbacks through and writes no save itself', () => {
    expect(SCENE_SOURCE).toContain('onTreatInjury={handleTreatInjury}');
    expect(SCENE_SOURCE).toContain('onRestAtInn={handleRestAtInn}');
    expect(SCENE_SOURCE).toContain('onTreatInjury: () => boolean;');
    expect(SCENE_SOURCE).toContain('onRestAtInn: () => boolean;');
    expect(SCENE_SOURCE).not.toContain('saveProfile');
    expect(SCENE_SOURCE).not.toContain('setProfile(');
    // The transaction is not re-implemented on the screen.
    expect(SCENE_SOURCE).not.toContain('gold: playerProfile.gold -');
  });

  test('the panel is the injury module’s own reading, with one 48dp button', () => {
    expect(SCENE_SOURCE).toContain('data-treatment-panel={treatmentPanel}');
    expect(SCENE_SOURCE).toContain('getTreatmentEligibility(playerProfile, treatmentPanel)');
    expect(SCENE_SOURCE).toContain('injuryBannerLine(treatmentInjury)');
    expect(SCENE_SOURCE).toContain('treatmentPrice(treatmentPanel)');
    expect(SCENE_SOURCE).toContain('data-treatment-refusal={treatmentEligibility.reason}');
    expect(SCENE_SOURCE).toContain('min-h-[48px]');
    // Esc closes it and no other key is read while it is up.
    expect(SCENE_SOURCE).toContain("if (code === 'Escape' || key === 'escape') setTreatmentPanel(null);");
  });

  test('the Inn’s old Armory redirect is gone; rest is its service', () => {
    const inn = HUB_LOCATIONS.find((location) => location.id === 'caravanserai');
    expect(inn).toBeDefined();
    expect(inn!.tabKey).toBeUndefined();
    expect(inn!.actionPrompt).toBe('Rest at the Inn');
  });

  test('the Medical House is reached by id and has no tab', () => {
    const medical = HUB_LOCATIONS.find((location) => location.id === 'arena_medical_house');
    expect(medical).toBeDefined();
    expect(medical!.tabKey).toBeUndefined();
  });

  test('the other flavour notices are untouched', () => {
    expect(SCENE_SOURCE).toContain('Shrine of Fortuna');
    expect(SCENE_SOURCE).toContain('Gladiator Barracks: Recruits rest here');
    expect(SCENE_SOURCE).toContain('Veteran Gladiator Hall: Old trophies');
    expect(SCENE_SOURCE).toContain('Nothing to trade here yet.');
  });

  test('the helpers know nothing of the day/time, combat or storage', () => {
    expect(INJURY_SOURCE).not.toContain('timeState');
    expect(INJURY_SOURCE).not.toContain('advanceTime');
    expect(INJURY_SOURCE).not.toContain('calculateTotalStats');
    expect(INJURY_SOURCE).not.toContain('combatCalculations');
    expect(INJURY_SOURCE).not.toContain('saveProfile');
    expect(INJURY_SOURCE).not.toContain('localStorage');
    expect(INJURY_SOURCE).not.toContain('Math.random');
  });

  test('racing never treats or rests', () => {
    expect(APP_SOURCE).not.toContain('restAtInn(');
    expect(APP_SOURCE).not.toContain('treatInjury(');
    // …apart from the two handlers' own call sites, which the first test pins.
    expect(APP_SOURCE.match(/restAtInn\(/g)?.length).toBe(1);
    expect(APP_SOURCE.match(/treatInjury\(/g)?.length).toBe(1);
  });
});
