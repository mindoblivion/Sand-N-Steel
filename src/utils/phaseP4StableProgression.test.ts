/**
 * P4 — stable progression: quality + conditioning, pure data and transactions,
 * NO UI.
 *
 * Design: progression-design.md §3.4 + §4 P4.  The module models the shape of the
 * shipped `racingProgression.ts` (catalogue → resolve → eligibility → purchase),
 * and this suite mirrors the coverage of `phaseC8_67b.test.ts`:
 *
 *   §A  the catalogue: four grades, the brief's prices (0 / 400 / 900 / 1,600) and
 *       names, one team, one standard — quality is bought, never "selected".
 *   §B  the resolver: absent, null, partial and malformed `stable` shapes all
 *       resolve to the defaults, per field, without throwing or repairing the save.
 *   §C  quality purchase: bought in order, skipping a grade refused, duplicates
 *       refused, insufficient gold refused untouched, exactly-enough gold pays to
 *       zero, the cap at grade 3 refuses, frozen-profile purity, no mutation.
 *   §D  conditioning: `60 × (currentLevel + 1) × teamSize` verified at team sizes
 *       2, 3 and 4 (L1 Biga 120, L1 Quadra 240, L5 Quadra 1,200), team size read
 *       only from `resolveRacingState`, the cap at 5 refuses, order-only buying,
 *       insufficient gold, exact gold, purity.
 *   §E  NON-CONSUMPTION: the declared pace/stamina effects are inert data — the
 *       P3-style production sweep, over every non-test file under `src/`.
 *   §F  the profile field + the GC20 corpus: `stable` is optional, the factory
 *       never writes it, and the `stable-era` fixture carries the shape a real
 *       purchase writes.
 *   §G  the exclusions: no facility gate, no UI consumer, the racing state shape
 *       untouched, no team size stored redundantly.
 *
 * Every price is pinned from the brief as a literal here and is NOT read back from
 * the module's own catalogue, so a wrong catalogue fails instead of agreeing with
 * itself.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { PlayerProfile } from '../types/game';
import { createNewProfile } from '../services/storage';
import { purchaseRacingConfig, selectRacingConfig, resolveRacingState } from './racingProgression';
import {
  CONDITIONING_STEP,
  MAX_CONDITIONING,
  MAX_STABLE_QUALITY,
  PLOW_GRADE,
  STABLE_QUALITIES,
  conditioningCost,
  declaredConditioningEffect,
  defaultStableState,
  describeStableRejection,
  getStableConditioningEligibility,
  getStableQuality,
  getStableQualityEligibility,
  nextConditioningCost,
  purchaseStableConditioning,
  purchaseStableQuality,
  resolveStableState,
  stableTeamSize,
} from './stableProgression';
import { SAVE_FIXTURES } from './saveFixtures';

const path = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));
const load = (rel: string): string => readFileSync(path(rel), 'utf8');
/** Comments are stripped so prose can neither satisfy nor defeat an assertion. */
const code = (rel: string): string =>
  load(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const MODULE = code('./stableProgression.ts');
const GAME_TYPES = code('../types/game.ts');
const STORAGE = code('../services/storage.ts');
const RACING = code('./racingProgression.ts');

const SRC_ROOT = path('../');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
const isTest = (file: string): boolean => /\.test\.(ts|tsx)$/.test(file);
const rel = (file: string): string => file.slice(SRC_ROOT.length);
const PRODUCTION_FILES = walk(SRC_ROOT).filter((file) => !isTest(file));

/** A profile of this game's own factory with an explicit purse. */
const profileWith = (gold: number, stable?: { quality?: number; conditioning?: number }): PlayerProfile => ({
  ...createNewProfile('Tester'),
  gold,
  ...(stable ? { stable } : {}),
});

/** A profile racing the Quadra — four horses — so conditioning costs the 4× rate. */
const quadraProfile = (gold: number, stable?: { quality?: number; conditioning?: number }): PlayerProfile => ({
  ...profileWith(gold, stable),
  racing: { unlocked: [3, 4], selected: 4 },
});

/** The Triga — three horses. */
const trigaProfile = (gold: number, stable?: { quality?: number; conditioning?: number }): PlayerProfile => ({
  ...profileWith(gold, stable),
  racing: { unlocked: [3], selected: 3 },
});

/** Freeze a profile all the way down: any in-place write throws in strict mode. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

const expectOk = (result: ReturnType<typeof purchaseStableQuality>): PlayerProfile => {
  if (!result.ok) throw new Error(`expected success, got ${result.reason}`);
  return result.profile;
};
const expectRefused = (
  result: ReturnType<typeof purchaseStableQuality>,
  reason: string
): void => {
  expect(result.ok, 'expected a refusal, got a profile').toBe(false);
  if (!result.ok) expect(String(result.reason)).toBe(reason);
};

// ══════════════════════════════════════════════════════════════════════════
describe('P4 §A — the catalogue', () => {
  /** Pinned from the brief: grade, id, name, price. */
  const PINNED = [
    { grade: 0, id: 'plow', name: 'Plow Team', price: 0 },
    { grade: 1, id: 'trained', name: 'Trained Team', price: 400 },
    { grade: 2, id: 'racing_bred', name: 'Racing Bred', price: 900 },
    { grade: 3, id: 'champion_bloodline', name: 'Champion Bloodline', price: 1600 },
  ];

  test('the four grades exist with the pinned id, name, price and order', () => {
    expect(STABLE_QUALITIES.length).toBe(4);
    expect(STABLE_QUALITIES.map((quality) => quality.grade)).toEqual([0, 1, 2, 3]);
    for (const pinned of PINNED) {
      const quality = STABLE_QUALITIES[pinned.grade];
      expect(quality.grade).toBe(pinned.grade);
      expect(quality.id).toBe(pinned.id as never);
      expect(quality.name).toBe(pinned.name);
      expect(quality.price).toBe(pinned.price);
    }
  });

  test('the price ladder is exactly 0 / 400 / 900 / 1,600, ascending', () => {
    expect(STABLE_QUALITIES.map((quality) => quality.price)).toEqual([0, 400, 900, 1600]);
    for (let grade = 1; grade < STABLE_QUALITIES.length; grade += 1) {
      expect(STABLE_QUALITIES[grade].price).toBeGreaterThan(STABLE_QUALITIES[grade - 1].price);
    }
  });

  test('grade 0 is the free default and is the one grade nobody buys', () => {
    expect(PLOW_GRADE).toBe(0);
    expect(STABLE_QUALITIES[0].price).toBe(0);
    expect(defaultStableState()).toEqual({ quality: 0, conditioning: 0 });
    expect(resolveStableState(createNewProfile('Fresh'))).toEqual({ quality: 0, conditioning: 0 });
  });

  test('every grade declares its effect as DATA: { pace: grade, stamina: grade }', () => {
    for (const quality of STABLE_QUALITIES) {
      expect(quality.effect).toEqual({ pace: quality.grade, stamina: quality.grade });
      for (const value of Object.values(quality.effect)) {
        expect(typeof value).toBe('number');
        expect(Number.isFinite(value as number)).toBe(true);
      }
    }
    // Conditioning's declared effect is the level itself.
    expect(declaredConditioningEffect(0)).toEqual({ stamina: 0 });
    expect(declaredConditioningEffect(3)).toEqual({ stamina: 3 });
    expect(declaredConditioningEffect(MAX_CONDITIONING)).toEqual({ stamina: 5 });
  });

  test('a grade resolves by number and by name, and nothing else does', () => {
    for (const pinned of PINNED) {
      expect(getStableQuality(pinned.grade)?.id).toBe(pinned.id as never);
      expect(getStableQuality(pinned.id)?.grade).toBe(pinned.grade);
    }
    for (const junk of [4, -1, 1.5, NaN, '4', 'plow_team', 'Champion Bloodline', null, undefined, {}, []]) {
      expect(getStableQuality(junk as never), String(junk)).toBeUndefined();
    }
  });

  test('one team, one standard: a grade costs the same whatever the team, and buying a team changes nothing', () => {
    // The same grade from a Biga, a Triga and a Quadra costs the same 400.
    for (const profile of [profileWith(1000), trigaProfile(1000), quadraProfile(1000)]) {
      const bought = expectOk(purchaseStableQuality(profile, 'trained'));
      expect(bought.gold).toBe(600);
      expect(bought.stable).toEqual({ quality: 1, conditioning: 0 });
    }
    // Buying a team never buys a grade, and there is no second quality ladder.
    const teamPurchase = purchaseRacingConfig(profileWith(5000), 'triga');
    if (!teamPurchase.ok) throw new Error(`triga purchase refused: ${teamPurchase.reason}`);
    const withTriga = teamPurchase.profile;
    expect(withTriga.stable).toBeUndefined();
    expect(resolveStableState(withTriga).quality).toBe(0);
    // And there is no selection operation for quality at all.
    expect(MODULE).not.toMatch(/export function select/);
  });

  test('the module declares no facility gate: eligibility is order + gold only', () => {
    expect(MODULE).not.toContain('facility');
    expect(MODULE).not.toContain('buildingId');
    expect(MODULE).not.toContain('unlocked:');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P4 §B — the resolver: malformed fields land on the defaults', () => {
  test('a legacy profile with no stable field resolves to Plow Team, conditioning 0', () => {
    const fresh = createNewProfile('Legacy');
    expect('stable' in fresh).toBe(false);
    expect(resolveStableState(fresh)).toEqual({ quality: 0, conditioning: 0 });
  });

  test('no profile at all resolves to the defaults instead of throwing', () => {
    expect(resolveStableState(null)).toEqual({ quality: 0, conditioning: 0 });
    expect(resolveStableState(undefined)).toEqual({ quality: 0, conditioning: 0 });
    expect(defaultStableState()).not.toBe(defaultStableState());
  });

  test('every malformed stable shape resolves to the defaults', () => {
    const malformed: unknown[] = [
      null,
      [],
      'stable',
      7,
      true,
      {},
      { quality: '2' },
      { quality: 2.5 },
      { quality: -1 },
      { quality: 4 },
      { quality: NaN },
      { quality: null },
      { conditioning: '3' },
      { conditioning: 3.5 },
      { conditioning: -1 },
      { conditioning: 6 },
      { conditioning: false },
      { quality: undefined, conditioning: undefined },
    ];
    for (const value of malformed) {
      const profile = { ...createNewProfile('Malformed'), stable: value } as unknown as PlayerProfile;
      expect(resolveStableState(profile), JSON.stringify(value)).toEqual({ quality: 0, conditioning: 0 });
    }
  });

  test('the two fields resolve independently, so junk in one keeps the other', () => {
    expect(resolveStableState(profileWith(0, { quality: 2, conditioning: 'x' as never }))).toEqual({
      quality: 2,
      conditioning: 0,
    });
    expect(resolveStableState(profileWith(0, { quality: 9, conditioning: 3 }))).toEqual({
      quality: 0,
      conditioning: 3,
    });
    expect(resolveStableState(profileWith(0, { quality: 1 }))).toEqual({ quality: 1, conditioning: 0 });
    expect(resolveStableState(profileWith(0, { conditioning: 4 }))).toEqual({ quality: 0, conditioning: 4 });
  });

  test('a well-formed field resolves exactly as stored, at both tops of the ladders', () => {
    expect(resolveStableState(profileWith(0, { quality: 3, conditioning: 5 }))).toEqual({
      quality: 3,
      conditioning: 5,
    });
    expect(resolveStableState(profileWith(0, { quality: 1, conditioning: 2 }))).toEqual({
      quality: 1,
      conditioning: 2,
    });
    expect(MAX_STABLE_QUALITY).toBe(3);
    expect(MAX_CONDITIONING).toBe(5);
  });

  test('resolving a frozen profile neither throws nor mutates it', () => {
    const frozen = deepFreeze(profileWith(250, { quality: 2, conditioning: 3 }));
    const before = JSON.stringify(frozen);
    const state = resolveStableState(frozen);
    expect(state).toEqual({ quality: 2, conditioning: 3 });
    expect(JSON.stringify(frozen)).toBe(before);
    // The resolved object is fresh, so a caller cannot reach the save through it.
    state.quality = 3;
    expect(resolveStableState(frozen).quality).toBe(2);
    expect(resolveStableState(frozen)).not.toBe(resolveStableState(frozen));
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P4 §C — quality is bought in order, once, with gold', () => {
  test('Trained Team costs exactly 400, once, and records grade 1', () => {
    const before = profileWith(1000);
    const bought = expectOk(purchaseStableQuality(before, 1));
    expect(before.gold).toBe(1000); // the caller's own profile never moves
    expect(bought.gold).toBe(600);
    expect(bought.stable).toEqual({ quality: 1, conditioning: 0 });
    expect(bought).not.toBe(before);
  });

  test('the ladder is bought in order: 400, then 900, then 1,600', () => {
    const g1 = expectOk(purchaseStableQuality(profileWith(3000), 1));
    expect(g1.gold).toBe(2600);
    const g2 = expectOk(purchaseStableQuality(g1, 2));
    expect(g2.gold).toBe(1700);
    const g3 = expectOk(purchaseStableQuality(g2, 3));
    expect(g3.gold).toBe(100);
    expect(g3.stable).toEqual({ quality: 3, conditioning: 0 });
  });

  test('a grade bought by name is the same purchase as by number', () => {
    const byNumber = expectOk(purchaseStableQuality(profileWith(1000), 1));
    const byName = expectOk(purchaseStableQuality(profileWith(1000), 'trained'));
    expect(byName.gold).toBe(byNumber.gold);
    expect(byName.stable).toEqual(byNumber.stable);
    expect(getStableQuality('trained')?.grade).toBe(1);
  });

  test('skipping a grade is refused and the profile — gold included — is untouched', () => {
    const before = profileWith(5000);
    const frozen = JSON.stringify(before);
    expectRefused(purchaseStableQuality(before, 2), 'prerequisite-locked');
    expectRefused(purchaseStableQuality(before, 3), 'prerequisite-locked');
    expectRefused(purchaseStableQuality(before, 'champion_bloodline'), 'prerequisite-locked');
    expect(JSON.stringify(before)).toBe(frozen);
    // One grade up from grade 1 is still in order; two is not.
    const g1 = expectOk(purchaseStableQuality(before, 1));
    expectRefused(purchaseStableQuality(g1, 3), 'prerequisite-locked');
    expect(g1.gold).toBe(4600);
  });

  test('a duplicate buy is refused and never charges twice', () => {
    const g1 = expectOk(purchaseStableQuality(profileWith(5000), 1));
    expectRefused(purchaseStableQuality(g1, 1), 'already-owned');
    expect(g1.gold).toBe(4600);
    // The free Plow Team is never "bought" either.
    expectRefused(purchaseStableQuality(profileWith(5000), 0), 'already-owned');
    // A grade already surpassed is refused, not re-charged.
    const g2 = expectOk(purchaseStableQuality(g1, 2));
    expectRefused(purchaseStableQuality(g2, 1), 'already-owned');
    expect(g2.gold).toBe(3700);
  });

  test('insufficient gold is refused before any arithmetic', () => {
    const poor = profileWith(399);
    const frozen = JSON.stringify(poor);
    expectRefused(purchaseStableQuality(poor, 1), 'insufficient-gold');
    expect(JSON.stringify(poor)).toBe(frozen);
    // A profile with no usable balance can buy nothing.
    for (const gold of [0, -50, NaN, Infinity]) {
      const broken = { ...profileWith(1000), gold } as PlayerProfile;
      const result = purchaseStableQuality(broken, 1);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('insufficient-gold');
      expect(broken.gold).toBe(gold);
    }
  });

  test('exactly enough gold pays to exactly zero, and never below it', () => {
    const exact = expectOk(purchaseStableQuality(profileWith(400), 1));
    expect(exact.gold).toBe(0);
    const exactTop = expectOk(purchaseStableQuality(profileWith(1600, { quality: 2 }), 3));
    expect(exactTop.gold).toBe(0);
    expect(exactTop.stable).toEqual({ quality: 3, conditioning: 0 });
  });

  test('the cap at grade 3 refuses, whatever grade is asked for', () => {
    const maxed = profileWith(5000, { quality: MAX_STABLE_QUALITY });
    for (const ref of [3, 2, 0, 'champion_bloodline']) {
      expectRefused(purchaseStableQuality(maxed, ref), 'max-level');
    }
    expect(maxed.gold).toBe(5000);
    expect(resolveStableState(maxed).quality).toBe(3);
  });

  test('unknown grades and a missing profile are refused', () => {
    for (const ref of [4, -1, 1.5, 'plow_team', null, undefined, {}]) {
      expectRefused(purchaseStableQuality(profileWith(5000), ref as never), 'unknown-quality');
    }
    expectRefused(purchaseStableQuality(null, 1), 'no-profile');
    expectRefused(purchaseStableQuality(undefined, 1), 'no-profile');
  });

  test('the eligibility read-out matches what the purchase then does', () => {
    const cases: Array<[PlayerProfile, unknown]> = [
      [profileWith(5000), 1],
      [profileWith(400), 1],
      [profileWith(399), 1],
      [profileWith(5000), 2],
      [profileWith(5000, { quality: 1 }), 2],
      [profileWith(5000, { quality: 1 }), 1],
      [profileWith(5000, { quality: 3 }), 3],
      [profileWith(5000), 9],
    ];
    for (const [profile, ref] of cases) {
      const eligibility = getStableQualityEligibility(profile, ref);
      const purchase = purchaseStableQuality(profile, ref as never);
      expect(purchase.ok, `ref ${String(ref)}`).toBe(eligibility.ok);
      if (!eligibility.ok && !purchase.ok) expect(purchase.reason).toBe(eligibility.reason);
    }
    expect(getStableQualityEligibility(null, 1).ok).toBe(false);
  });

  test('every refusal has a player-facing explanation', () => {
    for (const reason of [
      'no-profile',
      'unknown-quality',
      'unknown-level',
      'already-owned',
      'prerequisite-locked',
      'max-level',
      'insufficient-gold',
    ] as const) {
      expect(typeof describeStableRejection(reason)).toBe('string');
      expect(describeStableRejection(reason).length).toBeGreaterThan(3);
    }
  });

  test('a refused purchase touches nothing, and a success never mutates its input', () => {
    const frozen = deepFreeze(profileWith(3000, { quality: 1, conditioning: 2 }));
    const before = JSON.stringify(frozen);
    expectRefused(purchaseStableQuality(frozen, 1), 'already-owned');
    expectRefused(purchaseStableQuality(frozen, 3), 'prerequisite-locked');
    expect(JSON.stringify(frozen)).toBe(before);

    const bought = expectOk(purchaseStableQuality(frozen, 2));
    expect(JSON.stringify(frozen)).toBe(before);
    expect(bought.gold).toBe(2100);
    expect(bought.stable).toEqual({ quality: 2, conditioning: 2 });
    expect(bought.stable).not.toBe(frozen.stable);
    expect(bought.equipped).toBe(frozen.equipped); // untouched branches keep identity
  });

  test('the quality purchase leaves the racing record and the rest of the profile byte-identical', () => {
    const before = deepFreeze(quadraProfile(5000));
    const snapshot = JSON.stringify(before);
    const bought = expectOk(purchaseStableQuality(before, 1));
    const { gold: _g, stable: _s, ...rest } = bought;
    const { gold: _bg, stable: _bs, ...beforeRest } = before as PlayerProfile & { stable?: unknown };
    expect(JSON.stringify(rest)).toBe(JSON.stringify(beforeRest));
    expect(bought.racing).toEqual({ unlocked: [3, 4], selected: 4 });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P4 §D — conditioning: 60 × (currentLevel + 1) × teamSize', () => {
  test('the formula itself, pinned as the brief writes it', () => {
    expect(CONDITIONING_STEP).toBe(60);
    expect(conditioningCost(0, 2)).toBe(120);
    expect(conditioningCost(0, 3)).toBe(180);
    expect(conditioningCost(0, 4)).toBe(240);
    expect(conditioningCost(4, 4)).toBe(1200);
    // 60 × (currentLevel + 1) × teamSize, for the whole ladder on a Quadra.
    expect([0, 1, 2, 3, 4].map((level) => conditioningCost(level, 4))).toEqual([
      240, 480, 720, 960, 1200,
    ]);
  });

  test('L1 on a Biga — two horses — costs exactly 120', () => {
    const bought = expectOk(purchaseStableConditioning(profileWith(1000), 1));
    expect(stableTeamSize(profileWith(1000))).toBe(2);
    expect(bought.gold).toBe(880);
    expect(bought.stable).toEqual({ quality: 0, conditioning: 1 });
  });

  test('L1 on a Triga — three horses — costs exactly 180', () => {
    const bought = expectOk(purchaseStableConditioning(trigaProfile(1000), 1));
    expect(stableTeamSize(trigaProfile(1000))).toBe(3);
    expect(bought.gold).toBe(820);
  });

  test('L1 on a Quadra — four horses — costs exactly 240', () => {
    const bought = expectOk(purchaseStableConditioning(quadraProfile(1000), 1));
    expect(stableTeamSize(quadraProfile(1000))).toBe(4);
    expect(bought.gold).toBe(760);
  });

  test('L5 on a Quadra — from level 4 — costs exactly 1,200', () => {
    const atFour = quadraProfile(2000, { conditioning: 4 });
    expect(nextConditioningCost(atFour)).toBe(1200);
    const bought = expectOk(purchaseStableConditioning(atFour, 5));
    expect(bought.gold).toBe(800);
    expect(bought.stable).toEqual({ quality: 0, conditioning: 5 });
  });

  test('the whole five-level ladder on a Quadra costs 3,600, level by level', () => {
    let profile = quadraProfile(4000);
    const paid: number[] = [];
    for (let level = 1; level <= 5; level += 1) {
      const before = profile.gold;
      expect(nextConditioningCost(profile)).toBe(conditioningCost(level - 1, 4));
      profile = expectOk(purchaseStableConditioning(profile, level));
      paid.push(before - profile.gold);
    }
    expect(paid).toEqual([240, 480, 720, 960, 1200]);
    expect(profile.gold).toBe(400);
    expect(profile.stable).toEqual({ quality: 0, conditioning: 5 });
  });

  test('the team size is read from resolveRacingState, and re-read after a team purchase', () => {
    // On a fresh profile the next level is the Biga's 120.
    const fresh = profileWith(5000);
    expect(stableTeamSize(fresh)).toBe(resolveRacingState(fresh).horses);
    expect(nextConditioningCost(fresh)).toBe(120);

    // Buy a Triga and select it: the very next level is now the 3× rate, 180.
    const boughtTeam = purchaseRacingConfig(fresh, 'triga');
    if (!boughtTeam.ok) throw new Error(`triga purchase refused: ${boughtTeam.reason}`);
    const withTeam = boughtTeam.profile;
    expect(nextConditioningCost(withTeam)).toBe(120); // still racing the Biga
    const selected = selectRacingConfig(withTeam, 'triga');
    if (!selected.ok) throw new Error(`triga selection refused: ${selected.reason}`);
    const racing = selected.profile;
    expect(nextConditioningCost(racing)).toBe(180);
    const bought = expectOk(purchaseStableConditioning(racing, 1));
    expect(racing.gold - bought.gold).toBe(180);

    // And nothing about the team is stored on `stable`.
    expect(Object.keys(bought.stable!).sort()).toEqual(['conditioning', 'quality']);
  });

  test('the cap at level 5 refuses', () => {
    const maxed = quadraProfile(9000, { conditioning: MAX_CONDITIONING });
    expectRefused(purchaseStableConditioning(maxed, 5), 'max-level');
    expectRefused(purchaseStableConditioning(maxed, 4), 'max-level');
    expectRefused(purchaseStableConditioning(maxed, 6), 'unknown-level');
    expect(maxed.gold).toBe(9000);
    expect(resolveStableState(maxed).conditioning).toBe(5);
  });

  test('skipping a level is refused', () => {
    const before = quadraProfile(9000);
    const frozen = JSON.stringify(before);
    expectRefused(purchaseStableConditioning(before, 2), 'prerequisite-locked');
    expectRefused(purchaseStableConditioning(before, 5), 'prerequisite-locked');
    expect(JSON.stringify(before)).toBe(frozen);
    const one = expectOk(purchaseStableConditioning(before, 1));
    expectRefused(purchaseStableConditioning(one, 3), 'prerequisite-locked');
  });

  test('a duplicate level is refused and never charged twice', () => {
    const one = expectOk(purchaseStableConditioning(quadraProfile(9000), 1));
    expectRefused(purchaseStableConditioning(one, 1), 'already-owned');
    expectRefused(purchaseStableConditioning(one, 0), 'unknown-level');
    expect(one.gold).toBe(8760);
    const two = expectOk(purchaseStableConditioning(one, 2));
    expectRefused(purchaseStableConditioning(two, 1), 'already-owned');
    expect(two.gold).toBe(8280);
  });

  test('insufficient gold is refused untouched; exactly enough pays to zero', () => {
    const short = quadraProfile(239);
    const frozen = JSON.stringify(short);
    expectRefused(purchaseStableConditioning(short, 1), 'insufficient-gold');
    expect(JSON.stringify(short)).toBe(frozen);

    const exact = expectOk(purchaseStableConditioning(quadraProfile(240), 1));
    expect(exact.gold).toBe(0);

    const exactBiga = expectOk(purchaseStableConditioning(profileWith(120), 1));
    expect(exactBiga.gold).toBe(0);

    // A malformed balance buys nothing and is never rewritten.
    for (const gold of [NaN, -1, Infinity]) {
      const broken = { ...quadraProfile(1000), gold } as PlayerProfile;
      expectRefused(purchaseStableConditioning(broken, 1), 'insufficient-gold');
      expect(broken.gold).toBe(gold);
    }
  });

  test('unknown levels and a missing profile are refused', () => {
    for (const ref of [0, -1, 6, 1.5, '1', null, undefined, NaN]) {
      expectRefused(purchaseStableConditioning(quadraProfile(9000), ref as never), 'unknown-level');
    }
    expectRefused(purchaseStableConditioning(null, 1), 'no-profile');
    expectRefused(purchaseStableConditioning(undefined, 1), 'no-profile');
  });

  test('the eligibility read-out matches what the purchase then does', () => {
    const cases: Array<[PlayerProfile, unknown]> = [
      [quadraProfile(9000), 1],
      [quadraProfile(240), 1],
      [quadraProfile(239), 1],
      [quadraProfile(9000), 2],
      [quadraProfile(9000, { conditioning: 2 }), 3],
      [quadraProfile(9000, { conditioning: 2 }), 2],
      [quadraProfile(9000, { conditioning: 5 }), 5],
      [quadraProfile(9000), 9],
    ];
    for (const [profile, ref] of cases) {
      const eligibility = getStableConditioningEligibility(profile, ref);
      const purchase = purchaseStableConditioning(profile, ref as never);
      expect(purchase.ok, `level ${String(ref)}`).toBe(eligibility.ok);
      if (!eligibility.ok && !purchase.ok) expect(purchase.reason).toBe(eligibility.reason);
    }
  });

  test('a frozen profile can be bought from and is never mutated', () => {
    const frozen = deepFreeze(quadraProfile(3000, { quality: 2, conditioning: 1 }));
    const before = JSON.stringify(frozen);
    const bought = expectOk(purchaseStableConditioning(frozen, 2));
    expect(JSON.stringify(frozen)).toBe(before);
    expect(bought.gold).toBe(2520);
    expect(bought.stable).toEqual({ quality: 2, conditioning: 2 });
    expect(bought.stable).not.toBe(frozen.stable);
    // The grade the player bought is carried through untouched.
    expect(resolveStableState(bought).quality).toBe(2);
  });

  test('the two ladders are independent: each keeps the other where it was', () => {
    const q = expectOk(purchaseStableQuality(profileWith(9000, { conditioning: 3 }), 1));
    expect(q.stable).toEqual({ quality: 1, conditioning: 3 });
    const c = expectOk(purchaseStableConditioning(q, 4));
    expect(c.stable).toEqual({ quality: 1, conditioning: 4 });
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P4 §E — the declared effects are inert data nothing in production reads', () => {
  test('the sweep covers real production modules (it is not vacuous)', () => {
    expect(PRODUCTION_FILES.length).toBeGreaterThan(100);
    expect(PRODUCTION_FILES.some((file) => file.endsWith('/utils/stableProgression.ts'))).toBe(true);
    expect(PRODUCTION_FILES.some((file) => file.endsWith('/utils/racingProgression.ts'))).toBe(true);
    expect(PRODUCTION_FILES.some((file) => file.endsWith('/types/game.ts'))).toBe(true);
  });

  test('the module is the only production file that mentions its own catalogue or transactions', () => {
    const tokens = [
      'STABLE_QUALITIES',
      'StableDeclaredEffect',
      'declaredConditioningEffect',
      'purchaseStableQuality',
      'purchaseStableConditioning',
      'resolveStableState',
      'stableTeamSize',
      'conditioningCost',
      'nextConditioningCost',
      'getStableQualityEligibility',
      'getStableConditioningEligibility',
      'describeStableRejection',
      'MAX_CONDITIONING',
      'MAX_STABLE_QUALITY',
    ];
    // The corpus registry is excluded on purpose and for one reason: its
    // `provenance` strings are DATA that describe how a fixture was obtained and
    // are never executed — every era fixture's entry names the transaction that
    // produced it (`purchaseLaurel`, `purchaseIntel`, and now these).  It imports
    // nothing from this module, which the test below pins.
    for (const token of tokens) {
      const mentioning = PRODUCTION_FILES.filter((file) =>
        !file.endsWith('/saveFixtures/index.ts') &&
        stripComments(readFileSync(file, 'utf8')).includes(token)
      ).map(rel);
      expect(mentioning, token).toEqual(['/utils/stableProgression.ts']);
    }
    // …and it is prose only: the registry imports nothing from this module.
    expect(load('./saveFixtures/index.ts')).not.toContain('stableProgression');
  });

  test('nothing in production imports the module: no screen, no combat path, no city file', () => {
    for (const file of PRODUCTION_FILES) {
      if (file.endsWith('/utils/stableProgression.ts')) continue;
      const source = stripComments(readFileSync(file, 'utf8'));
      expect(source.includes('stableProgression'), rel(file)).toBe(false);
    }
  });

  test('the module only DECLARES its effects: it never reads one as a stat', () => {
    // No property access, destructure or optional chain on the declared effect.
    expect(MODULE).not.toMatch(/\.effect\b/);
    expect(MODULE).not.toMatch(/\{[^}]*\beffect\b[^}]*\}\s*=/);
    expect(MODULE).not.toMatch(/\beffect\s*\?\./);
    // And no stat name is read out of a stable record at all: the resolver reads
    // exactly the two rungs it documents.
    const reads = [...MODULE.matchAll(/stored\??\.([A-Za-z]+)/g)].map((match) => match[1]);
    expect([...new Set(reads)].sort()).toEqual(['conditioning', 'quality']);
    // The declared-effect helper is a pure declaration, never a lookup.
    const declared = MODULE.slice(MODULE.indexOf('export function declaredConditioningEffect'));
    expect(declared.slice(0, declared.indexOf('}'))).toContain('stamina: level');
  });

  test('the combat, racing and hub paths are clear of the stable ladder', () => {
    for (const file of [
      'utils/racingProgression.ts',
      'utils/chariotLoadout.ts',
      'utils/combatCalculations.ts',
      'utils/tempering.ts',
      'services/storage.ts',
      'App.tsx',
    ]) {
      const source = stripComments(readFileSync(path(`../${file}`), 'utf8'));
      for (const token of ['stableProgression', 'STABLE_QUALITIES', 'purchaseStable', 'resolveStableState']) {
        expect(source.includes(token), `${file} mentions ${token}`).toBe(false);
      }
    }
  });

  test('the declared effect names appear in no stable-shaped read anywhere in production', () => {
    // `pace` and `stamina` are ordinary words elsewhere in the game, so the check
    // is narrow and true: no production file reads either off a stable record.
    for (const file of PRODUCTION_FILES) {
      const source = stripComments(readFileSync(file, 'utf8'));
      expect(source).not.toMatch(/stable\??\.(?:effect|pace)\b/i);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P4 §F — the profile field and the GC20 corpus', () => {
  test('the type declares stable optional, with both rungs optional and numeric', () => {
    expect(GAME_TYPES).toContain('stable?: { quality?: number; conditioning?: number };');
    const block = GAME_TYPES.slice(GAME_TYPES.indexOf('export interface PlayerProfile {'));
    expect(block).toContain('stable?:');
  });

  test('the factory never writes the field, and no migration exists', () => {
    const factory = STORAGE.slice(STORAGE.indexOf('export function createNewProfile'));
    expect(factory.slice(0, factory.indexOf('\n}'))).not.toContain('stable');
    expect(GAME_TYPES).not.toContain('migrateStable');
  });

  test('the stable-era fixture is registered, plausibly populated, and resolves as stored', () => {
    const fixture = SAVE_FIXTURES.find((entry) => entry.id === 'stable-era');
    expect(fixture).toBeDefined();
    expect(fixture!.file).toBe('stableEraProfile.json');
    const raw = (fixture!.profile as PlayerProfile & { stable?: { quality?: number; conditioning?: number } });
    expect(raw.stable).toEqual({ quality: 3, conditioning: 5 });
    expect(Object.keys(raw.stable!).sort()).toEqual(['conditioning', 'quality']);
    expect(resolveStableState(fixture!.profile)).toEqual({ quality: 3, conditioning: 5 });
    // It carries every earlier era's fields too: it is the fully-populated shape.
    for (const field of ['chariot', 'racing', 'consumables', 'intel', 'story', 'time']) {
      expect((raw as unknown as Record<string, unknown>)[field], field).toBeDefined();
    }
    expect(fixture!.covers.join(' ')).toContain('stable');
  });

  test('the corpus still holds the legacy shape: at least one fixture omits stable', () => {
    const omitting = SAVE_FIXTURES.filter(
      (entry) => !('stable' in (entry.profile as unknown as Record<string, unknown>))
    );
    expect(omitting.length).toBeGreaterThan(0);
    expect(omitting.some((entry) => entry.id === 'current-fresh')).toBe(true);
  });

  test('resolving the whole corpus never throws and never mutates a fixture', () => {
    for (const fixture of SAVE_FIXTURES) {
      const before = JSON.stringify(fixture.profile);
      const state = resolveStableState(fixture.profile);
      expect(Number.isInteger(state.quality), fixture.id).toBe(true);
      expect(Number.isInteger(state.conditioning), fixture.id).toBe(true);
      expect(JSON.stringify(fixture.profile), fixture.id).toBe(before);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P4 §G — the exclusions hold', () => {
  test('no UI consumes the module: no component, no hub tab, no App handler', () => {
    for (const file of PRODUCTION_FILES) {
      if (!file.endsWith('.tsx')) continue;
      expect(stripComments(readFileSync(file, 'utf8')).includes('stableProgression'), rel(file)).toBe(false);
    }
  });

  test('the racing state shape is untouched: still unlocked + selected, and nothing new stored', () => {
    const start = GAME_TYPES.indexOf('export interface RacingProgression {');
    const body = GAME_TYPES.slice(start, GAME_TYPES.indexOf('}', start));
    const fields = [...body.matchAll(/^ {2}([A-Za-z][A-Za-z0-9_]*)\??:/gm)].map((match) => match[1]);
    expect(fields).toEqual(['unlocked', 'selected']);
    // The racing module gained nothing from this phase.
    for (const token of ['quality', 'conditioning', 'stableTeamSize']) {
      expect(RACING.includes(token), token).toBe(false);
    }
  });

  test('no team size is ever stored on the profile by this module', () => {
    expect(MODULE).toContain('resolveRacingState');
    expect(MODULE).not.toMatch(/stable:\s*\{[^}]*teamSize/);
    expect(MODULE).not.toMatch(/teamSize:\s*(?:teamSize|stableTeamSize\()/);
    // Every write is exactly the two rungs.
    const writes = [...MODULE.matchAll(/stable:\s*\{([^}]*)\}/g)].map((match) => match[1]);
    expect(writes.length).toBe(2);
    for (const write of writes) {
      const keys = [...write.matchAll(/([A-Za-z]+):/g)].map((match) => match[1]).sort();
      expect(keys).toEqual(['conditioning', 'quality']);
    }
  });

  test('the module imports only the profile type and the racing resolver', () => {
    const imports = [...MODULE.matchAll(/^import .*?from '(.+?)';$/gm)].map((match) => match[1]);
    expect(imports.sort()).toEqual(['../types/game', './racingProgression']);
    expect(MODULE).not.toContain('localStorage');
    expect(MODULE).not.toContain('saveProfile');
  });
});

/** Comment stripping, shared by the sweeps above. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
