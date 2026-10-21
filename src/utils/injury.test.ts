/**
 * S4 — THE INJURY LOOP'S INFLICTOR.
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  a loss with no active injury inflicts one; a win never does;
 *   §B  a fresh infliction starts at the full 3 fights and is NOT decremented
 *       by the duel that inflicted it;
 *   §C  the decrement cadence across subsequent duels — win or loss alike;
 *   §D  the injury clears to `null` exactly when the clock reaches zero;
 *   §E  a loss while already injured neither stacks nor refreshes;
 *   §F  `calculateTotalStats` applies the −2 / −2, floored at 1 (the first
 *       non-null-injury coverage in the repo);
 *   §G  the helper is pure: the input profile is not mutated, and a duel that
 *       changes nothing returns the caller's own object;
 *   §H  the wiring: ONE call site, inside the single App-level result
 *       transaction, composed with the save for wins and losses alike.
 *
 * Run with: `bun test src/utils/injury.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlayerInjury, PlayerProfile } from '../types/game';
import {
  INJURY_FIGHTS,
  INJURY_PENALTY_AGILITY,
  INJURY_PENALTY_STRENGTH,
  injuryBannerLine,
  resolveActiveInjury,
  resolveInjuryAfterDuel,
} from './injury';
import { calculateTotalStats } from '../services/storage';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';

const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url));

const FRESH: PlayerInjury = {
  fightsRemaining: INJURY_FIGHTS,
  penaltyStrength: INJURY_PENALTY_STRENGTH,
  penaltyAgility: INJURY_PENALTY_AGILITY,
};

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

const APP_SOURCE = readFileSync(join(SRC_ROOT, 'App.tsx'), 'utf8');
const MODAL_SOURCE = readFileSync(join(SRC_ROOT, 'components', 'hub', 'DuelResultModal.tsx'), 'utf8');
const STATS_SOURCE = readFileSync(join(SRC_ROOT, 'components', 'hub', 'StatsTab.tsx'), 'utf8');

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

// ── §A the infliction rule ─────────────────────────────────────────────────
describe('§A a loss is the only thing that inflicts', () => {
  test('a loss with no active injury opens a fresh one', () => {
    const { profile, event } = resolveInjuryAfterDuel(bareProfile(), false);
    expect(profile.injury).toEqual(FRESH);
    expect(event).toEqual({ kind: 'inflicted', injury: FRESH });
  });

  test('the constants are the design’s: 3 fights, −2 STR, −2 AGI', () => {
    expect(INJURY_FIGHTS).toBe(3);
    expect(INJURY_PENALTY_STRENGTH).toBe(2);
    expect(INJURY_PENALTY_AGILITY).toBe(2);
  });

  test('a win never inflicts', () => {
    const before = bareProfile();
    const { profile, event } = resolveInjuryAfterDuel(before, true);
    expect(profile.injury).toBeNull();
    expect(event).toBeNull();
    expect(profile).toBe(before);
  });

  test('the new injury is written onto a NEW profile object', () => {
    const before = bareProfile();
    const { profile } = resolveInjuryAfterDuel(before, false);
    expect(profile).not.toBe(before);
    expect(before.injury).toBeNull();
  });
});

// ── §B order of operations ─────────────────────────────────────────────────
describe('§B a fresh infliction is not decremented by its own duel', () => {
  test('the inflicting loss leaves the full 3 fights — not 2', () => {
    const { profile } = resolveInjuryAfterDuel(bareProfile(), false);
    expect(profile.injury?.fightsRemaining).toBe(3);
  });

  test('a win immediately after starts the clock at 2, not 3', () => {
    const first = resolveInjuryAfterDuel(bareProfile(), false).profile;
    const next = resolveInjuryAfterDuel(first, true);
    expect(next.profile.injury?.fightsRemaining).toBe(2);
  });
});

// ── §C the cadence ─────────────────────────────────────────────────────────
describe('§C every completed duel advances a live injury by one', () => {
  test('loss, win, loss, win: 3 → 2 → 1 → healed', () => {
    let current = bareProfile();
    const readings: (number | null)[] = [];

    current = resolveInjuryAfterDuel(current, false).profile; // inflicts 3
    readings.push(current.injury?.fightsRemaining ?? null);

    current = resolveInjuryAfterDuel(current, true).profile; // 2
    readings.push(current.injury?.fightsRemaining ?? null);

    current = resolveInjuryAfterDuel(current, false).profile; // 1, a loss does not refresh
    readings.push(current.injury?.fightsRemaining ?? null);

    const last = resolveInjuryAfterDuel(current, true);
    readings.push(last.profile.injury?.fightsRemaining ?? null);

    expect(readings).toEqual([3, 2, 1, null]);
    expect(last.event).toEqual({ kind: 'healed' });
  });

  test('consecutive losses still each advance by exactly one', () => {
    let current = resolveInjuryAfterDuel(bareProfile(), false).profile;
    current = resolveInjuryAfterDuel(current, false).profile;
    expect(current.injury?.fightsRemaining).toBe(2);
    current = resolveInjuryAfterDuel(current, false).profile;
    expect(current.injury?.fightsRemaining).toBe(1);
  });

  test('a duel that only advances the clock reports no event', () => {
    const hurt = bareProfile({ injury: FRESH });
    expect(resolveInjuryAfterDuel(hurt, true).event).toBeNull();
    expect(resolveInjuryAfterDuel(hurt, false).event).toBeNull();
  });
});

// ── §D the clear ───────────────────────────────────────────────────────────
describe('§D the injury clears at zero', () => {
  test('one fight remaining → the next completed duel clears it to null', () => {
    for (const won of [true, false]) {
      const hurt = bareProfile({ injury: { ...FRESH, fightsRemaining: 1 } });
      const { profile, event } = resolveInjuryAfterDuel(hurt, won);
      expect(profile.injury).toBeNull();
      expect(event).toEqual({ kind: 'healed' });
    }
  });

  test('a stored injury already at zero is not an injury and is never decremented below it', () => {
    const stale = bareProfile({ injury: { ...FRESH, fightsRemaining: 0 } });
    expect(resolveActiveInjury(stale.injury)).toBeNull();
    // A win leaves the dead injury untouched; a loss inflicts a fresh one.
    expect(resolveInjuryAfterDuel(stale, true).profile.injury).toEqual({ ...FRESH, fightsRemaining: 0 });
    expect(resolveInjuryAfterDuel(stale, false).profile.injury).toEqual(FRESH);
  });

  test('a malformed injury reads as no injury', () => {
    expect(resolveActiveInjury(null)).toBeNull();
    expect(resolveActiveInjury(undefined)).toBeNull();
    expect(resolveActiveInjury({ fightsRemaining: Number.NaN } as PlayerInjury)).toBeNull();
    expect(resolveActiveInjury({ fightsRemaining: -1 } as PlayerInjury)).toBeNull();
  });
});

// ── §E no stacking, no refreshing ──────────────────────────────────────────
describe('§E a loss while injured neither stacks nor refreshes', () => {
  test('the penalties stay −2 / −2 and the clock only moves down', () => {
    const hurt = bareProfile({ injury: FRESH });
    const { profile } = resolveInjuryAfterDuel(hurt, false);
    expect(profile.injury).toEqual({ ...FRESH, fightsRemaining: 2 });
    expect(profile.injury?.penaltyStrength).toBe(2);
    expect(profile.injury?.penaltyAgility).toBe(2);
  });

  test('a loss at the last fight clears the wound instead of re-inflicting it', () => {
    const hurt = bareProfile({ injury: { ...FRESH, fightsRemaining: 1 } });
    const { profile, event } = resolveInjuryAfterDuel(hurt, false);
    expect(profile.injury).toBeNull();
    expect(event).toEqual({ kind: 'healed' });
  });
});

// ── §F calculateTotalStats applies it ─────────────────────────────────────
describe('§F the existing stat path applies the penalties (first non-null coverage)', () => {
  test('−2 STR / −2 AGI on a plain stat block', () => {
    const clean = calculateTotalStats(bareProfile());
    const hurt = calculateTotalStats(bareProfile({ injury: FRESH }));
    expect(clean.strength).toBe(10);
    expect(clean.agility).toBe(10);
    expect(hurt.strength).toBe(8);
    expect(hurt.agility).toBe(8);
  });

  test('the penalty is floored at 1, never at 0', () => {
    const weak = bareProfile({ baseStats: { strength: 1, agility: 1, stamina: 10, defense: 4 } });
    const hurt = calculateTotalStats({ ...weak, injury: FRESH });
    expect(hurt.strength).toBe(1);
    expect(hurt.agility).toBe(1);
  });

  test('the penalties flow into the derived pools', () => {
    const clean = calculateTotalStats(bareProfile());
    const hurt = calculateTotalStats(bareProfile({ injury: FRESH }));
    expect(hurt.healthMax).toBe(clean.healthMax - 8); // −2 STR × 4
  });

  test('an exhausted injury applies no penalty', () => {
    const clean = calculateTotalStats(bareProfile());
    const stale = calculateTotalStats(bareProfile({ injury: { ...FRESH, fightsRemaining: 0 } }));
    expect(stale).toEqual(clean);
  });

  test('the helper’s own output feeds the stat path unchanged', () => {
    const { profile } = resolveInjuryAfterDuel(bareProfile(), false);
    const stats = calculateTotalStats(profile);
    expect(stats.strength).toBe(8);
    expect(stats.agility).toBe(8);
  });
});

// ── §G purity ──────────────────────────────────────────────────────────────
describe('§G the helper is pure', () => {
  test('the input profile and its nested injury are not mutated', () => {
    const hurt = bareProfile({
      injury: Object.freeze({ ...FRESH }) as PlayerInjury,
      defeatedOpponentIds: Object.freeze([]) as unknown as string[],
    });
    const snapshot = JSON.stringify(hurt);
    resolveInjuryAfterDuel(hurt, false);
    resolveInjuryAfterDuel(hurt, true);
    expect(JSON.stringify(hurt)).toBe(snapshot);
    expect(hurt.injury).toEqual(FRESH);
  });

  test('a duel that changes nothing returns the caller’s own object', () => {
    const before = bareProfile();
    expect(resolveInjuryAfterDuel(before, true).profile).toBe(before);
  });

  test('two calls on the same input agree, and neither leaks into the other', () => {
    const hurt = bareProfile({ injury: FRESH });
    const first = resolveInjuryAfterDuel(hurt, true).profile;
    const second = resolveInjuryAfterDuel(hurt, true).profile;
    expect(first.injury).toEqual(second.injury);
    expect(first).not.toBe(second);
  });

  test('the banner line is built from the injury’s own numbers', () => {
    expect(injuryBannerLine(FRESH)).toBe('Injured: −2 STR / −2 AGI for 3 fights');
    expect(injuryBannerLine({ fightsRemaining: 1, penaltyStrength: 3, penaltyAgility: 1 })).toBe(
      'Injured: −3 STR / −1 AGI for 1 fight',
    );
  });
});

// ── §H the wiring ──────────────────────────────────────────────────────────
describe('§H the one call site: the result transaction', () => {
  const write = (() => {
    const start = APP_SOURCE.indexOf('const handleMatchComplete');
    return APP_SOURCE.slice(start, APP_SOURCE.indexOf('const handleDuelResultDismiss'));
  })();

  test('App composes the helper inside the result transaction, exactly once', () => {
    // S5 — this module now also exports the two cures, so App's one import from it
    // carries them too; the property pinned here is unchanged (App reaches the
    // helper through THIS module, and nowhere else).
    expect(APP_SOURCE).toMatch(
      /import \{[^}]*resolveInjuryAfterDuel[^}]*\} from '\.\/utils\/injury';/,
    );
    expect(write.match(/resolveInjuryAfterDuel\(/g)?.length).toBe(1);
    expect(write).toContain('resolveInjuryAfterDuel(profile, didWin)');
  });

  test('no other shipped file calls it — duels are the only inflictor', () => {
    const callers = sourceFiles(SRC_ROOT)
      .filter((path) => !path.endsWith(`${join('utils', 'injury.ts')}`))
      .filter((path) => code(readFileSync(path, 'utf8')).includes('resolveInjuryAfterDuel('));
    expect(callers.map((path) => path.slice(SRC_ROOT.length))).toEqual(['App.tsx']);
  });

  test('the resolution happens before the win/loss branch and feeds both writes', () => {
    expect(write.indexOf('resolveInjuryAfterDuel(profile, didWin)')).toBeLessThan(
      write.indexOf('if (didWin) {'),
    );
    expect(write.match(/\.\.\.afterInjury,/g)?.length).toBe(2);
  });

  test('it rides the existing save — one write per outcome', () => {
    expect(write.match(/saveProfile\(settledProfile\)/g)?.length).toBe(2);
    expect(write).not.toContain('saveProfile(afterInjury)');
  });

  test('the result screen is handed the event from the same write', () => {
    expect(write).toContain('setDuelResult({ didWin, stats, storyLines, injuryEvent })');
    const callStart = APP_SOURCE.indexOf('<DuelResultModal');
    const block = APP_SOURCE.slice(callStart, APP_SOURCE.indexOf('onContinue={handleDuelResultDismiss}', callStart));
    expect(block).toContain('injuryEvent={duelResult.injuryEvent}');
  });

  test('the two surfaces read the helper rather than restating the numbers', () => {
    expect(MODAL_SOURCE).toContain('injuryBannerLine(injuryEvent.injury)');
    expect(MODAL_SOURCE).toContain('Injury healed.');
    expect(MODAL_SOURCE).toContain('data-duel-injury={injuryEvent.kind}');
    expect(STATS_SOURCE).toContain('resolveActiveInjury(profile.injury)');
    expect(STATS_SOURCE).toContain('data-injury={activeInjury.fightsRemaining}');
  });

  test('combat formulas are untouched: the helper never reads the stat path', () => {
    const injuryModule = code(readFileSync(join(SRC_ROOT, 'utils', 'injury.ts'), 'utf8'));
    expect(injuryModule).not.toContain('calculateTotalStats');
    expect(injuryModule).not.toContain('combatCalculations');
    expect(injuryModule).not.toContain('localStorage');
    expect(injuryModule).not.toContain('saveProfile');
    expect(injuryModule).not.toContain('Math.random');
  });
});
