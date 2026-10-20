/**
 * Progression Slice 1 — `deriveRank` and the thresholds it is derived from.
 *
 * Run with: bun test src/utils/rank.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A the three gates, on both sides of every boundary, each half required;
 *   §B precedence — the highest gate a profile satisfies wins;
 *   §C malformed input: a missing, non-numeric, NaN or infinite field reads as
 *      zero rather than throwing, which is what every pre-progression save is;
 *   §D the stored `rank` field is NOT read — the rank is derived from progress,
 *      and only progress;
 *   §E the module's own tables: `RANK_ORDER` / `RANK_INDEX` ascending and
 *      exhaustive, and `rankAtLeast` inclusive at the boundary.
 *
 * Every boundary is stated against the module's exported constants, so a
 * threshold change moves the suite with it instead of silently passing.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';

import {
  CHAMPION_FAME,
  CHAMPION_TIER,
  LEGEND_BOSS_KILLS,
  LEGEND_FAME,
  LEGEND_TIER,
  RANK_INDEX,
  RANK_ORDER,
  VETERAN_FAME,
  VETERAN_TIER,
  deriveRank,
  rankAtLeast,
  type RankInput,
} from './rank';

// ── Fixture ─────────────────────────────────────────────────────────────────

/** A structural rank input.  `PlayerProfile` satisfies it; so does this. */
const input = (fields: Partial<RankInput>): RankInput => ({ ...fields });

// ── §A. The three gates, both sides of every boundary ───────────────────────

describe('Progression Slice 1 — deriveRank gates', () => {
  test('Veteran needs BOTH the fame and the tier', () => {
    expect(deriveRank(input({ fame: VETERAN_FAME, currentTier: VETERAN_TIER }))).toBe('Veteran');
    expect(deriveRank(input({ fame: VETERAN_FAME, currentTier: VETERAN_TIER - 1 }))).toBe('Rookie');
    expect(deriveRank(input({ fame: VETERAN_FAME - 1, currentTier: VETERAN_TIER }))).toBe('Rookie');
    // One short on fame but far past the tier stays below the gate.
    expect(deriveRank(input({ fame: VETERAN_FAME - 1, currentTier: LEGEND_TIER }))).toBe('Rookie');
    // Above the gate on fame alone is still Rookie: the tier is required.
    expect(deriveRank(input({ fame: VETERAN_FAME * 3, currentTier: 1 }))).toBe('Rookie');
  });

  test('Champion needs BOTH the fame and the tier', () => {
    expect(deriveRank(input({ fame: CHAMPION_FAME, currentTier: CHAMPION_TIER }))).toBe('Champion');
    expect(deriveRank(input({ fame: CHAMPION_FAME, currentTier: CHAMPION_TIER - 1 }))).toBe('Veteran');
    expect(deriveRank(input({ fame: CHAMPION_FAME - 1, currentTier: CHAMPION_TIER }))).toBe('Veteran');
    expect(deriveRank(input({ fame: CHAMPION_FAME - 1, currentTier: LEGEND_TIER }))).toBe('Veteran');
    expect(deriveRank(input({ fame: CHAMPION_FAME * 10, currentTier: CHAMPION_TIER - 1 }))).toBe('Veteran');
  });

  test('Legend needs the fame, the tier AND a boss kill', () => {
    const legendary = { fame: LEGEND_FAME, currentTier: LEGEND_TIER, bossKills: LEGEND_BOSS_KILLS };
    expect(deriveRank(input(legendary))).toBe('Legend');
    // Each of the three, one short on its own, drops the profile to Champion.
    expect(deriveRank(input({ ...legendary, fame: LEGEND_FAME - 1 }))).toBe('Champion');
    expect(deriveRank(input({ ...legendary, currentTier: LEGEND_TIER - 1 }))).toBe('Champion');
    expect(deriveRank(input({ ...legendary, bossKills: LEGEND_BOSS_KILLS - 1 }))).toBe('Champion');
  });

  test('the gates ascend in the order the ranks do', () => {
    expect(VETERAN_FAME).toBeLessThan(CHAMPION_FAME);
    expect(CHAMPION_FAME).toBeLessThan(LEGEND_FAME);
    expect(VETERAN_TIER).toBeLessThan(CHAMPION_TIER);
    expect(CHAMPION_TIER).toBeLessThan(LEGEND_TIER);
    expect(LEGEND_BOSS_KILLS).toBeGreaterThan(0);
  });
});

// ── §B. Precedence — the highest satisfied gate wins ────────────────────────

describe('Progression Slice 1 — precedence', () => {
  test('a profile past every gate is Legend, not its first match', () => {
    expect(
      deriveRank(input({ fame: LEGEND_FAME * 4, currentTier: LEGEND_TIER, bossKills: 12 }))
    ).toBe('Legend');
  });

  test('the rank never decreases as fame rises on a fixed tier and kill count', () => {
    const seen: number[] = [];
    for (let fame = 0; fame <= LEGEND_FAME * 1.2; fame += 25) {
      seen.push(RANK_INDEX[deriveRank(input({ fame, currentTier: LEGEND_TIER, bossKills: 3 }))]);
    }
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    }
    expect(seen[seen.length - 1]).toBe(RANK_INDEX.Legend);
  });

  test('the tier alone, with no fame, never promotes', () => {
    for (let tier = 1; tier <= LEGEND_TIER; tier++) {
      expect(deriveRank(input({ fame: 0, currentTier: tier, bossKills: 99 }))).toBe('Rookie');
    }
  });
});

// ── §C. Malformed input reads as zero ───────────────────────────────────────

describe('Progression Slice 1 — malformed saves', () => {
  test('an absent profile, or an empty one, is Rookie', () => {
    expect(deriveRank(undefined)).toBe('Rookie');
    expect(deriveRank(null)).toBe('Rookie');
    expect(deriveRank({})).toBe('Rookie');
    expect(deriveRank(input({}))).toBe('Rookie');
  });

  test('NaN, Infinity, negatives, non-numbers and zero read as zero', () => {
    const hostile: Partial<RankInput>[] = [
      { fame: NaN, currentTier: NaN, bossKills: NaN },
      { fame: Infinity, currentTier: Infinity, bossKills: Infinity },
      { fame: -LEGEND_FAME, currentTier: -LEGEND_TIER, bossKills: -LEGEND_BOSS_KILLS },
      { fame: 0, currentTier: 0, bossKills: 0 },
      { fame: `${LEGEND_FAME}` as unknown as number },
      { currentTier: null as unknown as number },
    ];
    for (const fields of hostile) {
      expect(deriveRank(input(fields))).toBe('Rookie');
    }
  });

  test('one malformed field does not lift a profile past its gate', () => {
    // Fame and tier are real; the kill count is not a number.
    expect(
      deriveRank(input({ fame: LEGEND_FAME, currentTier: LEGEND_TIER, bossKills: NaN }))
    ).toBe('Champion');
  });

  test('extra fields are ignored', () => {
    const noisy = { ...input({ fame: VETERAN_FAME, currentTier: VETERAN_TIER }), gold: 999999 };
    expect(deriveRank(noisy)).toBe('Veteran');
  });
});

// ── §D. The stored `rank` field is not this ─────────────────────────────────

describe('Progression Slice 1 — the stored rank is not read', () => {
  test("a save labelled 'Legend' with no progress derives Rookie", () => {
    expect(deriveRank({ rank: 'Legend' } as unknown as RankInput)).toBe('Rookie');
  });

  test("a save labelled 'Rookie' with Legend progress derives Legend", () => {
    const stored = {
      rank: 'Rookie',
      fame: LEGEND_FAME,
      currentTier: LEGEND_TIER,
      bossKills: 1,
    } as unknown as RankInput;
    expect(deriveRank(stored)).toBe('Legend');
  });
});

// ── §E. The module's own tables ─────────────────────────────────────────────

describe('Progression Slice 1 — rank table', () => {
  test('four ranks, ascending, and the index agrees with the order', () => {
    expect(RANK_ORDER.length).toBe(4);
    RANK_ORDER.forEach((rank, index) => {
      expect(RANK_INDEX[rank]).toBe(index);
    });
  });

  test('the lowest gate on the board is Rookie, and the top of the table is Legend', () => {
    expect(deriveRank(input({}))).toBe(RANK_ORDER[0]);
    expect(RANK_INDEX[RANK_ORDER[RANK_ORDER.length - 1]]).toBe(3);
  });

  test('rankAtLeast is inclusive at the boundary and reflexive', () => {
    for (const rank of RANK_ORDER) {
      expect(rankAtLeast(rank, rank)).toBe(true);
    }
    expect(rankAtLeast('Champion', 'Veteran')).toBe(true);
    expect(rankAtLeast('Legend', 'Veteran')).toBe(true);
    expect(rankAtLeast('Rookie', 'Veteran')).toBe(false);
    expect(rankAtLeast('Veteran', 'Champion')).toBe(false);
    expect(rankAtLeast('Champion', 'Legend')).toBe(false);
  });
});
