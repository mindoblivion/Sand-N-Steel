/**
 * L7 (Living City) — the injury lifecycle: creation, duration, refresh and recovery.
 *
 * Before this phase `PlayerInjury` was a type with no writer: nothing created an
 * injury, nothing spent one, and `calculateTotalStats`'s injury branch could only
 * ever read a hand-edited save. This suite covers the approved first version of
 * the system — one slot, inflicted by a completed defeat, spent by the duels that
 * follow it — and nothing else: **no rest action, no city-day cost, no injury UI**.
 *
 * Written in the two registers the neighbouring suites use (`cityClock`,
 * `storefrontPurchase`, `trainingSession`):
 *
 *   §A  the defeat rule: exactly one injury of 2 / 2 / 2, and a victory inflicts none
 *   §B  duration and recovery: the pre-existing injury is spent once per completed
 *       duel — win the next two and it is gone; a defeat refreshes it without
 *       accumulating penalties; the injury a defeat inflicts is never decremented
 *       by that same settlement
 *   §C  malformed legacy data: missing, null, zero, negative, fractional,
 *       non-finite and non-object records all behave safely and deterministically,
 *       and a bad penalty can never reach a stat
 *   §D  the stat seam: `calculateTotalStats` applies the existing 2-point penalty
 *       and its floor of 1, and a malformed penalty no longer poisons combat stats
 *   §E  purity: the helper never mutates its input and writes nothing but `injury`
 *   §F  no randomness, clock, timer, storage or React in the pure helper
 *   §G  wiring: the injury is settled only inside the existing authoritative
 *       settlement, by BOTH outcome branches, with the clock's one call site, the
 *       exactly-once latch and the one save per branch intact
 *
 * **One approved-rules conflict is recorded here rather than silently resolved.**
 * Rule 4 says "a defeat while injured refreshes duration to 2", and rule 5 says a
 * newly inflicted injury is not decremented by its own settlement; applying both in
 * the mandated order (recover the pre-existing injury, then apply the defeat rule)
 * means a defeat with 2 fights left ends at **2**, not 1. The brief's test list also
 * asks for "two remaining becomes one after the next completed duel, for both
 * victory and defeat"; that cannot hold for a defeat without breaking rule 4. The
 * rules win, and §B states the observable result explicitly (the defeat's own
 * refresh), so the difference is visible here rather than buried.
 *
 * Run with: `bun test src/utils/injurySettlement.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { PlayerProfile } from '../types/game';
import { DEFAULT_PLAYER_WEAPON, STARTING_SPARE_WEAPON } from '../data/itemsDB';
import { calculateTotalStats } from '../services/storage';
import {
  INJURY_FIGHTS_REMAINING,
  INJURY_PENALTY_AGILITY,
  INJURY_PENALTY_STRENGTH,
  normalizeInjury,
  settleInjury,
} from './injurySettlement';

const helperSource = readFileSync(new URL('./injurySettlement.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const storageSource = readFileSync(new URL('../services/storage.ts', import.meta.url), 'utf8');

/** The slice of `source` from `start` (inclusive) up to `end` (exclusive). */
function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) return '';
  return source.slice(from, to);
}

/** Source with every comment removed, so prose can neither satisfy nor defeat a check. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** App's one settlement boundary. */
const creditHandler = between(appSource, 'const handleMatchComplete', 'const handleDuelResultDismiss');
const winBlock = between(creditHandler, 'if (didWin) {', '} else {');
const lossBlock = between(creditHandler, '} else {', 'setDuelResult(');

/** The approved injury: one slot, fixed duration, fixed penalties. */
const APPROVED_INJURY = { fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 };

/**
 * A realistic mid-career save, every field this phase can touch supplied: the city
 * clock and the merchant's daily record (L1/L4), the training record, the inventory
 * and base stats. Built as a literal so each field is visible and can be asserted on.
 */
function freshProfile(): PlayerProfile {
  return {
    name: 'Verifier',
    title: 'The Sandborn Rebel',
    rank: 'Rookie',
    appearance: {
      skinColor: '#c68b59',
      hairColor: '#3e2723',
      tunicColor: '#854d0e',
      crestColor: '#dc2626',
    },
    level: 3,
    xp: 40,
    xpToNextLevel: 200,
    unspentStatPoints: 4,
    baseStats: { strength: 12, agility: 9, stamina: 10, defense: 5 },
    gold: 250,
    fame: 30,
    currentTier: 2,
    tierProgress: { 1: 1, 2: 0, 3: 0, 4: 0 },
    defeatedOpponentIds: ['opp_marcus'],
    bossKills: 1,
    newGamePlus: 0,
    trainingSessionsLeft: 2,
    injury: null,
    equipped: { weapon: DEFAULT_PLAYER_WEAPON },
    inventory: [DEFAULT_PLAYER_WEAPON, STARTING_SPARE_WEAPON],
    fightsWon: 4,
    fightsLost: 1,
    peakCrowdHypeOverall: 80,
    city: { day: 7, merchantPurchaseDay: 5 },
  };
}

/** A profile carrying the given (possibly malformed) injury, cast past the type. */
function withInjury(injury: unknown): PlayerProfile {
  return { ...freshProfile(), injury: injury as PlayerProfile['injury'] };
}

/** A snapshot that a mutation would change. */
function snapshot(profile: PlayerProfile): string {
  return JSON.stringify(profile);
}

// ── §A. The defeat rule ─────────────────────────────────────────────────────

describe('§A — a completed defeat inflicts exactly one injury', () => {
  test('the approved constants are the ones the rules name', () => {
    expect(INJURY_FIGHTS_REMAINING).toBe(2);
    expect(INJURY_PENALTY_STRENGTH).toBe(2);
    expect(INJURY_PENALTY_AGILITY).toBe(2);
  });

  test('a defeat with no injury creates exactly { 2, 2, 2 }', () => {
    const settled = settleInjury(freshProfile(), false);

    expect(settled.injury).toEqual(APPROVED_INJURY);
    // …and it is a fresh object, not one borrowed from the constants.
    expect(settled.injury).not.toBe(APPROVED_INJURY);
  });

  test('an absent injury (undefined) is treated like null', () => {
    const profile = freshProfile();
    delete profile.injury;

    expect(settleInjury(profile, false).injury).toEqual(APPROVED_INJURY);
    expect(settleInjury(profile, true).injury).toBeNull();
  });

  test('the injury a defeat inflicts is NOT decremented by that same settlement', () => {
    // The ordering rule: recover the pre-existing injury first, then apply the
    // defeat rule — so a freshly inflicted injury starts at its full duration.
    const firstDefeat = settleInjury(freshProfile(), false);
    expect(firstDefeat.injury?.fightsRemaining).toBe(INJURY_FIGHTS_REMAINING);
    expect(firstDefeat.injury?.fightsRemaining).toBe(2);
  });

  test('a victory inflicts nothing when no injury exists', () => {
    const settled = settleInjury(freshProfile(), true);

    expect(settled.injury).toBeNull();
    expect(settled.injury).not.toEqual(APPROVED_INJURY);
  });

  test('a victory does not resurrect an injury it has just cleared', () => {
    const settled = settleInjury(withInjury({ ...APPROVED_INJURY, fightsRemaining: 1 }), true);
    expect(settled.injury).toBeNull();

    const again = settleInjury(settled, true);
    expect(again.injury).toBeNull();
  });
});

// ── §B. Duration, recovery and refresh ─────────────────────────────────────

describe('§B — each completed duel spends one fight of the injury already carried', () => {
  test('two fights remaining becomes one after the next completed victory', () => {
    const settled = settleInjury(withInjury({ ...APPROVED_INJURY }), true);

    expect(settled.injury).toEqual({ fightsRemaining: 1, penaltyStrength: 2, penaltyAgility: 2 });
  });

  test('two fights remaining after the next completed DEFEAT ends at two — the defeat refreshes', () => {
    // Approved rule 4 (refresh to 2) applied after rule 5 (spend the pre-existing
    // fight), which is the ordering this phase implements. It is stated explicitly
    // because the brief's test list also asked for "becomes one … for both victory
    // and defeat", which rule 4 forbids. See this file's header.
    const settled = settleInjury(withInjury({ ...APPROVED_INJURY }), false);

    expect(settled.injury).toEqual(APPROVED_INJURY);
    // The pre-existing injury really was spent before the refresh (2 -> 1 -> refresh 2),
    // which is proven by the penalties staying at the fixed values rather than growing.
    expect(settled.injury?.penaltyStrength).toBe(INJURY_PENALTY_STRENGTH);
    expect(settled.injury?.penaltyAgility).toBe(INJURY_PENALTY_AGILITY);
  });

  test('one fight remaining is cleared by the next completed victory', () => {
    const settled = settleInjury(
      withInjury({ fightsRemaining: 1, penaltyStrength: 2, penaltyAgility: 2 }),
      true
    );

    expect(settled.injury).toBeNull();
    expect('injury' in settled).toBe(true);
    expect(settled.injury ?? null).toBeNull();
  });

  test('the full lifecycle: a defeat, then two victories, and the injury is gone', () => {
    const firstDefeat = settleInjury(freshProfile(), false);
    expect(firstDefeat.injury?.fightsRemaining).toBe(2);

    const nextWin = settleInjury(firstDefeat, true);
    expect(nextWin.injury?.fightsRemaining).toBe(1);

    const secondWin = settleInjury(nextWin, true);
    expect(secondWin.injury).toBeNull();
  });

  test('a longer legacy duration counts down one per duel instead of resetting', () => {
    const carried = withInjury({ fightsRemaining: 5, penaltyStrength: 2, penaltyAgility: 2 });

    expect(settleInjury(carried, true).injury?.fightsRemaining).toBe(4);
    expect(settleInjury(settleInjury(carried, true), true).injury?.fightsRemaining).toBe(3);
  });

  test('losing while injured refreshes the duration without accumulating penalties', () => {
    const carried = withInjury({ fightsRemaining: 1, penaltyStrength: 2, penaltyAgility: 2 });
    const settled = settleInjury(carried, false);

    expect(settled.injury).toEqual(APPROVED_INJURY);

    // Three defeats in a row never stack: still one injury, still 2 / 2 / 2.
    let profile = freshProfile();
    for (let i = 0; i < 3; i += 1) {
      profile = settleInjury(profile, false);
      expect(profile.injury).toEqual(APPROVED_INJURY);
    }
  });

  test('a refresh keeps the canonical penalties even if the carried record had others', () => {
    // The slot's penalties are fixed by the rules, so a defeat writes 2 / 2 rather
    // than carrying a hand-edited 5 / 5 forward.
    const settled = settleInjury(
      withInjury({ fightsRemaining: 2, penaltyStrength: 5, penaltyAgility: 5 }),
      false
    );

    expect(settled.injury).toEqual(APPROVED_INJURY);
  });

  test('a victory keeps the carried (normalized) penalties and only spends a fight', () => {
    const settled = settleInjury(
      withInjury({ fightsRemaining: 2, penaltyStrength: 3, penaltyAgility: 1 }),
      true
    );

    expect(settled.injury).toEqual({ fightsRemaining: 1, penaltyStrength: 3, penaltyAgility: 1 });
    expect(normalizeInjury(settled.injury)).toEqual({
      fightsRemaining: 1,
      penaltyStrength: 3,
      penaltyAgility: 1,
    });
  });
});

// ── §C. Malformed legacy data ──────────────────────────────────────────────

describe('§C — malformed injury data is safe and deterministic', () => {
  const ABSENT: Array<[string, unknown]> = [
    ['missing fightsRemaining', { penaltyStrength: 2, penaltyAgility: 2 }],
    ['zero duration', { fightsRemaining: 0, penaltyStrength: 2, penaltyAgility: 2 }],
    ['negative duration', { fightsRemaining: -3, penaltyStrength: 2, penaltyAgility: 2 }],
    ['NaN duration', { fightsRemaining: Number.NaN, penaltyStrength: 2, penaltyAgility: 2 }],
    ['Infinity duration', { fightsRemaining: Number.POSITIVE_INFINITY, penaltyStrength: 2, penaltyAgility: 2 }],
    ['string duration', { fightsRemaining: '2', penaltyStrength: 2, penaltyAgility: 2 }],
    ['a number', 5],
    ['a string', 'injury'],
    ['an array', [{ fightsRemaining: 2 }]],
    ['true', true],
  ];

  test('every unusable record reads as "no injury"', () => {
    for (const [label, value] of ABSENT) {
      expect([label, normalizeInjury(value)]).toEqual([label, null]);
      // …and a victory settles it to the project's absent representation.
      expect([label, settleInjury(withInjury(value), true).injury]).toEqual([label, null]);
    }
  });

  test('a defeat over unusable data still inflicts the approved injury', () => {
    for (const [label, value] of ABSENT) {
      expect([label, settleInjury(withInjury(value), false).injury]).toEqual([label, APPROVED_INJURY]);
    }
  });

  test('a fractional duration floors to whole duels, like the city clock', () => {
    expect(normalizeInjury({ fightsRemaining: 1.5, penaltyStrength: 2, penaltyAgility: 2 })).toEqual({
      fightsRemaining: 1,
      penaltyStrength: 2,
      penaltyAgility: 2,
    });
    // 1.5 -> 1 whole fight -> one victory spends it.
    expect(
      settleInjury(withInjury({ fightsRemaining: 1.5, penaltyStrength: 2, penaltyAgility: 2 }), true)
        .injury
    ).toBeNull();
    // …and a defeat refreshes it to the full 2.
    expect(
      settleInjury(withInjury({ fightsRemaining: 1.5, penaltyStrength: 2, penaltyAgility: 2 }), false)
        .injury
    ).toEqual(APPROVED_INJURY);
  });

  test('a malformed penalty resolves to the canonical 2 instead of poisoning a stat', () => {
    const broken = { fightsRemaining: 2, penaltyStrength: Number.NaN, penaltyAgility: undefined };

    expect(normalizeInjury(broken)).toEqual({ fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 });
    expect(settleInjury(withInjury(broken), true).injury).toEqual({
      fightsRemaining: 1,
      penaltyStrength: 2,
      penaltyAgility: 2,
    });
    expect(settleInjury(withInjury(broken), false).injury).toEqual(APPROVED_INJURY);
  });

  test('infinite and non-numeric penalties resolve to 2; negative ones clamp to 0', () => {
    expect(
      normalizeInjury({ fightsRemaining: 2, penaltyStrength: Number.POSITIVE_INFINITY, penaltyAgility: '2' })
    ).toEqual({ fightsRemaining: 2, penaltyStrength: 2, penaltyAgility: 2 });
    expect(
      normalizeInjury({ fightsRemaining: 2, penaltyStrength: -4, penaltyAgility: -0.5 })
    ).toEqual({ fightsRemaining: 2, penaltyStrength: 0, penaltyAgility: 0 });
  });

  test('the same malformed input always answers the same thing', () => {
    const cases = [...ABSENT.map(([, value]) => value), { fightsRemaining: 2 }, { fightsRemaining: 1.5 }];

    for (const value of cases) {
      for (const didWin of [true, false]) {
        const a = settleInjury(withInjury(value), didWin);
        const b = settleInjury(withInjury(value), didWin);
        expect(a.injury).toEqual(b.injury);
        expect(a).toEqual(b);
      }
    }
  });
});

// ── §D. The stat seam ──────────────────────────────────────────────────────

describe('§D — calculateTotalStats still applies the injury, and never a NaN', () => {
  test('a valid injury costs exactly its two points of strength and agility', () => {
    const healthy = calculateTotalStats(freshProfile());
    const injured = calculateTotalStats(withInjury({ ...APPROVED_INJURY }));

    expect(healthy.strength - injured.strength).toBe(INJURY_PENALTY_STRENGTH);
    expect(healthy.agility - injured.agility).toBe(INJURY_PENALTY_AGILITY);
    // The unrelated stats are untouched by an injury.
    expect(injured.stamina).toBe(healthy.stamina);
    expect(injured.defense).toBe(healthy.defense);
  });

  test('a spent or absent injury costs nothing', () => {
    const healthy = calculateTotalStats(freshProfile());

    for (const value of [null, undefined, { ...APPROVED_INJURY, fightsRemaining: 0 }]) {
      expect(calculateTotalStats(withInjury(value))).toEqual(healthy);
    }
  });

  test('large penalties still respect the existing floor of 1', () => {
    const huge = calculateTotalStats(
      withInjury({ fightsRemaining: 2, penaltyStrength: 999, penaltyAgility: 999 })
    );

    expect(huge.strength).toBe(1);
    expect(huge.agility).toBe(1);
    expect(Number.isFinite(huge.healthMax)).toBe(true);
  });

  test('a malformed penalty no longer propagates NaN through the stats', () => {
    const broken = calculateTotalStats(
      withInjury({ fightsRemaining: 2, penaltyStrength: Number.NaN, penaltyAgility: Number.NaN })
    );
    const healthy = calculateTotalStats(freshProfile());

    for (const value of Object.values(broken)) {
      expect(Number.isFinite(value)).toBe(true);
    }
    // Resolved to the canonical penalty rather than skipped or poisoned.
    expect(healthy.strength - broken.strength).toBe(INJURY_PENALTY_STRENGTH);
    expect(healthy.agility - broken.agility).toBe(INJURY_PENALTY_AGILITY);
  });

  test('the stat path reads the same normalization the settlement writes', () => {
    // One reader for a stored injury: storage.ts no longer interprets the record itself.
    expect(code(storageSource)).toContain('normalizeInjury(profile.injury)');
    expect(code(storageSource)).not.toContain('profile.injury.penaltyStrength');
    expect(code(storageSource)).not.toContain('profile.injury.fightsRemaining > 0');
  });
});

// ── §E. Purity and preservation ────────────────────────────────────────────

describe('§E — the helper is pure and writes nothing but the injury slot', () => {
  test('the input profile is not mutated, on either outcome', () => {
    const cases: PlayerProfile[] = [
      freshProfile(),
      withInjury({ ...APPROVED_INJURY }),
      withInjury({ fightsRemaining: 1, penaltyStrength: 2, penaltyAgility: 2 }),
    ];

    for (const profile of cases) {
      const before = snapshot(profile);
      const heldInjury = profile.injury;
      for (const didWin of [true, false]) {
        const settled = settleInjury(profile, didWin);

        expect(snapshot(profile)).toBe(before);
        expect(profile.injury).toBe(heldInjury);
        expect(settled).not.toBe(profile);
      }
    }
  });

  test('every unrelated field is carried over, including the city and training records', () => {
    const profile = freshProfile();
    const settled = settleInjury(profile, false);

    expect(settled.city).toEqual({ day: 7, merchantPurchaseDay: 5 });
    expect(settled.city).toBe(profile.city);
    expect(settled.baseStats).toBe(profile.baseStats);
    expect(settled.inventory).toBe(profile.inventory);
    expect(settled.equipped).toBe(profile.equipped);
    expect(settled.trainingSessionsLeft).toBe(profile.trainingSessionsLeft);
    expect(settled.gold).toBe(profile.gold);
    expect(settled.fame).toBe(profile.fame);
    expect(settled.xp).toBe(profile.xp);
    expect(settled.level).toBe(profile.level);
    expect(settled.currentTier).toBe(profile.currentTier);
    expect(settled.defeatedOpponentIds).toBe(profile.defeatedOpponentIds);
    expect(settled.fightsWon).toBe(profile.fightsWon);
    expect(settled.fightsLost).toBe(profile.fightsLost);
  });

  test('`injury` is the only field that differs', () => {
    const profile = freshProfile();
    const settled = settleInjury(profile, false);

    const changed = (Object.keys({ ...profile, ...settled }) as Array<keyof PlayerProfile>).filter(
      (key) => profile[key] !== settled[key]
    );

    expect(changed).toEqual(['injury']);
  });

  test('the city day is never advanced by an injury settlement', () => {
    const settled = settleInjury(freshProfile(), false);
    expect(settled.city?.day).toBe(7);
    expect(settled.city?.merchantPurchaseDay).toBe(5);
  });
});

// ── §F. No hidden dependencies ─────────────────────────────────────────────

describe('§F — the pure helper reads no clock, storage, timer or randomness', () => {
  test('the module names none of the forbidden APIs', () => {
    const body = code(helperSource);

    for (const forbidden of [
      'localStorage',
      'sessionStorage',
      'saveProfile',
      'loadSavedProfile',
      'PROFILE_STORAGE_KEY',
      'Date.now',
      'new Date',
      'performance.now',
      'setTimeout',
      'setInterval',
      'requestAnimationFrame',
      'Math.random',
      'useState',
      'useEffect',
      'advanceCityDay',
    ]) {
      expect([forbidden, body.includes(forbidden)]).toEqual([forbidden, false]);
    }
  });
});

// ── §G. Wiring ─────────────────────────────────────────────────────────────

describe('§G — injury processing happens only inside the authoritative settlement', () => {
  test('the credit handler exists and settles the injury exactly once', () => {
    expect(creditHandler.length).toBeGreaterThan(0);
    expect(creditHandler.match(/settleInjury\(/g)?.length).toBe(1);
    expect(appSource.match(/from '\.\/utils\/injurySettlement'/g)?.length).toBe(1);
  });

  test('both outcome branches persist the settled injury — no second settlement path', () => {
    expect(winBlock.length).toBeGreaterThan(0);
    expect(lossBlock.length).toBeGreaterThan(0);

    for (const block of [winBlock, lossBlock]) {
      expect(block).toContain('injury,');
      // Recovery is decided once, above the branches, and shared by both.
      expect(block).not.toContain('settleInjury(');
    }
  });

  test('the existing settlement guards and save behaviour are intact', () => {
    const claim = creditHandler.indexOf('if (!duelSettlementRef.current.claim(settledDuelId)) return;');
    // REBASED (L13A): the wound is settled from the settlement's newest-committed base.
    const settle = creditHandler.indexOf('settleInjury(base, didWin)');

    expect(claim).toBeGreaterThan(-1);
    expect(settle).toBeGreaterThan(claim);
    expect(creditHandler.match(/\.claim\(/g)?.length).toBe(1);
    // One save and one setState per branch, exactly as before this phase.
    expect(creditHandler.match(/saveProfile\(settledProfile\)/g)?.length).toBe(2);
    expect(creditHandler.match(/setProfile\(settledProfile\)/g)?.length).toBe(2);
  });

  test('the city clock keeps its one call site and its one module import', () => {
    expect(appSource.match(/advanceCityDay\(/g)?.length).toBe(1);
    expect(appSource.match(/from '\.\/utils\/cityClock'/g)?.length).toBe(1);
    expect(creditHandler.match(/advanceCityDay\(/g)?.length).toBe(1);
  });

  test('the duel callback still names its bout, so the latch is unchanged', () => {
    expect(
      appSource.match(
        /onMatchComplete=\{\(stats, didWin\) => handleMatchComplete\(stats, didWin, duelId\)\}/g
      )?.length
    ).toBe(1);
    expect(appSource.match(/\.arm\(\)/g)?.length).toBe(1);
  });

  test('no other source file settles an injury (the boundary is App alone)', () => {
    const srcDir = fileURLToPath(new URL('..', import.meta.url));

    const files: string[] = [];
    const walk = (dir: string, prefix: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walk(`${dir}/${entry.name}`, rel);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name) || entry.name.endsWith('.test.ts')) continue;
        if (readFileSync(`${dir}/${entry.name}`, 'utf8').includes('settleInjury')) files.push(rel);
      }
    };
    walk(srcDir, '');

    expect(files.sort()).toEqual(['App.tsx', 'utils/injurySettlement.ts']);
  });
});
