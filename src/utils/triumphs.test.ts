/**
 * A8 — TRIUMPHS: the evaluator, the record and the Library view.
 *
 * Run with: `bun test src/utils/triumphs.test.ts`
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  every SHIPPED catalogue entry — A8's 23 plus A5's Codex capstone — has a
 *       condition that holds
 *       when the profile satisfies it and does not hold on a fresh gladiator;
 *   §B  the boundaries: fightsWon 9/10, 49/50, 99/100; peak gold 999/1,000,
 *       4,999/5,000, 24,999/25,000; hype 89/90; health 0.11/0.10; boss kills
 *       3/4; the three tier-clear derivations and Aurelius;
 *   §C  the dormant rows: defined, never evaluated (even against a maximal
 *       profile), and never rendered by the Library page;
 *   §D  `newlyEarned` = holds minus already-earned, and it is idempotent;
 *   §E  the fame grants — 10 standard / 25 capstone, once, in the same save;
 *   §F  the peak-gold record: it rises, it never falls, and peakGold >= gold;
 *   §G  the titles: appended beside the purchased ones, one per category,
 *       Saga's capstone-gated, and 'Living Legend' != 'Living Legend of the Ludus';
 *   §H  the ✦ marker: it shows iff earned-minus-viewed is non-empty, and the one
 *       view mark clears it and never writes twice;
 *   §I  the gear sets: every defined set is completable from shop stock;
 *   §J  the save corpus: section J's 22 optional fields, and the `records-era`
 *       fixture registered beside them;
 *   §K  the shipped wiring, read out of the sources: one call site, the transient
 *       reading it passes, the Library's one view mark and StatsTab's second door.
 *
 * The components are rendered with `react-dom/server`; no browser is involved and
 * no storage is read or written.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PlayerProfile, ArmorItem, WeaponItem } from '../types/game';
import { createNewProfile } from '../services/storage';
import { ALL_ARMORS, ITEMS_DB, getItemById } from '../data/itemsDB';
import { getStorefrontStock } from '../data/shops';
import { isItemUnlocked } from './facilityProgression';
import { TRIUMPHS as PURCHASABLE_TRIUMPHS, EARNED_TITLES, ownsTriumph, ownedTitleOptions, resolveLaurels, selectDisplayedTitle, purchaseLaurel } from './laurels';
import {
  DORMANT_TRIUMPHS,
  GEAR_SETS,
  SHIPPED_TRIUMPHS,
  CODEX_COMPLETE_TRIUMPH_ID,
  TIER_FOUR_FINAL_BOSS_ID,
  TRIUMPH_CATALOGUE,
  TRIUMPH_CATEGORIES,
  TRIUMPH_FAME_CAPSTONE,
  TRIUMPH_FAME_STANDARD,
  applyTriumphAwards,
  evaluateTriumphs,
  hasUnviewedTriumphs,
  markTriumphsViewed,
  resolveRecords,
  triumphFame,
  triumphsInCategory,
  unviewedTriumphs,
  withPeakGold,
} from './triumphs';

const SOURCE_DIR = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string): string => readFileSync(join(SOURCE_DIR, path), 'utf8');
const code = (path: string): string =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

/** A fresh gladiator with the patch applied.  Never mutated by the module. */
const profileWith = (patch: Partial<PlayerProfile> = {}): PlayerProfile => ({
  ...createNewProfile('Triumph Tester'),
  ...patch,
});

const armour = (id: string): ArmorItem => ALL_ARMORS.find((item) => item.id === id) as ArmorItem;

/** A profile holding one item (carried). */
const carrying = (...ids: string[]): PlayerProfile => {
  const items = ids.map((id) => getItemById(id)).filter(Boolean) as (WeaponItem | ArmorItem)[];
  return profileWith({ inventory: [...createNewProfile('x').inventory, ...items] });
};

/** The ids `evaluateTriumphs` returns for a profile. */
const earnedIds = (profile: PlayerProfile, duel?: Parameters<typeof evaluateTriumphs>[1]) =>
  evaluateTriumphs(profile, duel).map((triumph) => triumph.id);

// ── §A every shipped entry's condition ────────────────────────────────────
describe('A8 §A — every shipped triumph, condition by condition', () => {
  /**
   * One row per SHIPPED catalogue entry: the profile that satisfies it, and the
   * reading the condition needs.  §A asserts each id is earned by its own row and
   * by NO OTHER row, so the table is exhaustive in both directions.
   */
  const ROWS: { id: string; profile: () => PlayerProfile; duel?: { won: boolean; lowestHealthFraction?: number; crowdHypePeak?: number } }[] = [
    { id: 'sand_first_blood', profile: () => profileWith({ fightsWon: 1 }) },
    { id: 'sand_ten_victories', profile: () => profileWith({ fightsWon: 10 }) },
    { id: 'sand_fifty_victories', profile: () => profileWith({ fightsWon: 50 }) },
    { id: 'sand_hundred_victories', profile: () => profileWith({ fightsWon: 100 }) },
    { id: 'sand_missio_denied', profile: () => profileWith(), duel: { won: true, lowestHealthFraction: 0.1 } },
    { id: 'sand_crowd_chants', profile: () => profileWith(), duel: { won: false, crowdHypePeak: 90 } },
    { id: 'sand_every_boss', profile: () => profileWith({ bossKills: 4 }) },
    { id: 'coin_1000_gold', profile: () => profileWith({ records: { peakGold: 1000 } }) },
    { id: 'coin_5000_gold', profile: () => profileWith({ records: { peakGold: 5000 } }) },
    { id: 'coin_25000_gold', profile: () => profileWith({ records: { peakGold: 25000 } }) },
    {
      id: 'coin_full_chariot',
      profile: () =>
        profileWith({
          chariot: {
            owned: ['wheels_standard', 'finish_stock', 'wheels_reinforced', 'finish_charred', 'axle_ironbound', 'harness_padded', 'chassis_reinforced'],
            equipped: { wheels: 'wheels_standard', finish: 'finish_stock' },
          },
        }),
    },
    { id: 'coin_quadra', profile: () => profileWith({ racing: { unlocked: [3, 4], selected: 4 } }) },
    {
      id: 'steel_full_set',
      profile: () => carrying(...(GEAR_SETS[0].pieces.map((piece) => piece.itemId))),
    },
    {
      id: 'steel_wheels',
      profile: () =>
        profileWith({
          chariot: {
            owned: ['wheels_standard', 'finish_stock', 'wheels_reinforced'],
            equipped: { wheels: 'wheels_standard', finish: 'finish_stock' },
          },
        }),
    },
    {
      id: 'steel_finishes',
      profile: () =>
        profileWith({
          chariot: {
            owned: ['wheels_standard', 'finish_stock', 'finish_charred', 'finish_gilded', 'finish_oxblood'],
            equipped: { wheels: 'wheels_standard', finish: 'finish_stock' },
          },
        }),
    },
    {
      id: 'steel_gilded_loadout',
      profile: () =>
        profileWith({
          equipped: {
            weapon: createNewProfile('x').equipped.weapon,
            helm: armour('helm_champion_gilded'),
            chest: armour('chest_champion_gilded'),
          },
        }),
    },
    { id: 'saga_veteran', profile: () => profileWith({ fame: 150, currentTier: 2 }) },
    { id: 'saga_champion', profile: () => profileWith({ fame: 600, currentTier: 3 }) },
    { id: 'saga_legend', profile: () => profileWith({ fame: 1500, currentTier: 4, bossKills: 1 }) },
    { id: 'saga_tier_one', profile: () => profileWith({ currentTier: 2 }) },
    { id: 'saga_tier_two', profile: () => profileWith({ currentTier: 3 }) },
    { id: 'saga_tier_three', profile: () => profileWith({ currentTier: 4 }) },
    { id: 'saga_tier_four', profile: () => profileWith({ defeatedOpponentIds: [TIER_FOUR_FINAL_BOSS_ID] }) },
  ];

  test('the shipped catalogue is the 23 A8 rows this table covers, plus A5\'s Codex capstone', () => {
    // A5 REBASE, not a weakening: A5 appends ONE Saga capstone
    // (`saga_codex_complete`, the full-Codex triumph) to the catalogue and touches
    // no A8 row, so the table's 23 rows are asserted unchanged and the new id is
    // named explicitly beside them.
    expect(SHIPPED_TRIUMPHS.length).toBe(24);
    expect(ROWS.length).toBe(23);
    expect(SHIPPED_TRIUMPHS.map((triumph) => triumph.id).sort()).toEqual(
      [...ROWS.map((row) => row.id), CODEX_COMPLETE_TRIUMPH_ID].sort(),
    );
    // 7 Sand, 5 Coin, 4 Steel, 8 Saga — the brief's own split, plus A5's capstone.
    expect(triumphsInCategory('sand').length).toBe(7);
    expect(triumphsInCategory('coin').length).toBe(5);
    expect(triumphsInCategory('steel').length).toBe(4);
    expect(triumphsInCategory('saga').length).toBe(8);
  });

  test('every shipped triumph has a plain-language requirement — no secret deeds', () => {
    for (const triumph of SHIPPED_TRIUMPHS) {
      expect(triumph.requirement.length, triumph.id).toBeGreaterThan(10);
      expect(triumph.requirement.endsWith('.'), triumph.id).toBe(true);
      expect(triumph.holds, triumph.id).toBeDefined();
    }
  });

  for (const row of ROWS) {
    test(`'${row.id}' holds when the profile satisfies it, and not on a fresh gladiator`, () => {
      expect(earnedIds(row.profile(), row.duel)).toContain(row.id);
      expect(earnedIds(profileWith())).not.toContain(row.id);
    });
  }

  test('no row earns a triumph it does not satisfy — the table is exact', () => {
    for (const row of ROWS) {
      const ids = earnedIds(row.profile(), row.duel);
      for (const id of ids) {
        const owning = ROWS.find((candidate) => candidate.id === id);
        expect(owning, `'${row.id}' unexpectedly earns '${id}'`).toBeDefined();
      }
    }
  });

  test('a fresh gladiator earns nothing at all', () => {
    expect(earnedIds(profileWith())).toEqual([]);
  });
});

// ── §B the boundaries ─────────────────────────────────────────────────────
describe('A8 §B — every threshold on both sides', () => {
  const at = (patch: Partial<PlayerProfile>) => earnedIds(profileWith(patch));

  test('victories: 9 vs 10, 49 vs 50, 99 vs 100', () => {
    expect(at({ fightsWon: 9 })).toContain('sand_first_blood');
    expect(at({ fightsWon: 9 })).not.toContain('sand_ten_victories');
    expect(at({ fightsWon: 10 })).toContain('sand_ten_victories');
    expect(at({ fightsWon: 49 })).not.toContain('sand_fifty_victories');
    expect(at({ fightsWon: 50 })).toContain('sand_fifty_victories');
    expect(at({ fightsWon: 99 })).not.toContain('sand_hundred_victories');
    expect(at({ fightsWon: 100 })).toContain('sand_hundred_victories');
  });

  test('the purse: 999 vs 1,000, 4,999 vs 5,000, 24,999 vs 25,000', () => {
    for (const [below, above, id] of [
      [999, 1000, 'coin_1000_gold'],
      [4999, 5000, 'coin_5000_gold'],
      [24999, 25000, 'coin_25000_gold'],
    ] as const) {
      expect(at({ records: { peakGold: below } })).not.toContain(id);
      expect(at({ records: { peakGold: above } })).toContain(id);
    }
  });

  test('the crowd: hype 89 vs 90, and only in a duel', () => {
    expect(earnedIds(profileWith(), { won: false, crowdHypePeak: 89 })).not.toContain('sand_crowd_chants');
    expect(earnedIds(profileWith(), { won: true, crowdHypePeak: 90 })).toContain('sand_crowd_chants');
    // No result screen, no transient reading — the design's rule (R5).
    expect(earnedIds(profileWith())).not.toContain('sand_crowd_chants');
  });

  test('the low-water mark: 0.11 vs 0.10, and a defeat never earns it', () => {
    expect(
      earnedIds(profileWith(), { won: true, lowestHealthFraction: 0.11 }),
    ).not.toContain('sand_missio_denied');
    expect(
      earnedIds(profileWith(), { won: true, lowestHealthFraction: 0.1 }),
    ).toContain('sand_missio_denied');
    // A defeat also ends at 0% health; it must not earn a victory's triumph.
    expect(
      earnedIds(profileWith(), { won: false, lowestHealthFraction: 0.02 }),
    ).not.toContain('sand_missio_denied');
  });

  test('boss classes: 3 of the 4 ladder bosses vs all 4', () => {
    expect(profileWith().bossKills).toBe(0);
    expect(at({ bossKills: 3 })).not.toContain('sand_every_boss');
    expect(at({ bossKills: 4 })).toContain('sand_every_boss');
  });

  test('the tier clears are derived from currentTier alone', () => {
    expect(at({ currentTier: 1 })).toEqual([]);
    expect(at({ currentTier: 2 })).toContain('saga_tier_one');
    expect(at({ currentTier: 2 })).not.toContain('saga_tier_two');
    expect(at({ currentTier: 3 })).toContain('saga_tier_two');
    expect(at({ currentTier: 3 })).not.toContain('saga_tier_three');
    expect(at({ currentTier: 4 })).toContain('saga_tier_three');
  });

  test('Tier 4 is Aurelius felled, read from the roster rather than a literal', () => {
    expect(TIER_FOUR_FINAL_BOSS_ID).toBe('opp_aurelius_boss');
    expect(at({ currentTier: 4 })).not.toContain('saga_tier_four');
    expect(at({ defeatedOpponentIds: ['opp_gnaeus_boss'] })).not.toContain('saga_tier_four');
    expect(at({ defeatedOpponentIds: ['opp_aurelius_boss'] })).toContain('saga_tier_four');
  });

  test('the ranks move with deriveRank, not with the stored rank field', () => {
    expect(at({ fame: 149, currentTier: 2 })).not.toContain('saga_veteran');
    expect(at({ fame: 150, currentTier: 2 })).toContain('saga_veteran');
    expect(at({ fame: 600, currentTier: 3 })).toContain('saga_champion');
    // The stored field says Legend; the record says Rookie.
    expect(at({ rank: 'Legend' })).toEqual([]);
    expect(at({ fame: 1500, currentTier: 4, bossKills: 1 })).toContain('saga_legend');
  });
});

// ── §C the dormant rows ───────────────────────────────────────────────────
describe('A8 §C — dormant triumphs are defined, never evaluated, never rendered', () => {
  /** Everything true at once: the only profile that could earn a dormant row. */
  const maximal = (): PlayerProfile =>
    profileWith({
      fightsWon: 500,
      bossKills: 9,
      fame: 99999,
      currentTier: 4,
      defeatedOpponentIds: ['opp_aurelius_boss'],
      records: { peakGold: 999999 },
      racing: { unlocked: [3, 4], selected: 4 },
      chariot: {
        owned: ['wheels_standard', 'finish_stock', 'wheels_reinforced', 'finish_charred', 'finish_gilded', 'finish_oxblood', 'axle_ironbound', 'harness_padded', 'chassis_reinforced'],
        equipped: { wheels: 'wheels_standard', finish: 'finish_stock' },
      },
      equipped: {
        weapon: createNewProfile('x').equipped.weapon,
        helm: armour('helm_champion_gilded'),
        chest: armour('chest_champion_gilded'),
      },
    });

  test('there are six dormant rows and each names its unblocker', () => {
    expect(DORMANT_TRIUMPHS.length).toBe(6);
    expect(DORMANT_TRIUMPHS.filter((triumph) => triumph.dormant?.family === 'circus').length).toBe(3);
    expect(DORMANT_TRIUMPHS.filter((triumph) => triumph.dormant?.family === 'rudis').length).toBe(1);
    expect(DORMANT_TRIUMPHS.filter((triumph) => triumph.dormant?.family === 'ngplus').length).toBe(2);
    for (const triumph of DORMANT_TRIUMPHS) {
      expect(triumph.dormant, triumph.id).toBeDefined();
      expect(['racing', 'rudis', 'ngplus']).toContain(triumph.dormant?.unblocker as string);
      // A dormant row carries no condition at all, so nothing can evaluate it.
      expect(triumph.holds, triumph.id).toBeUndefined();
    }
    expect(TRIUMPH_CATALOGUE.length).toBe(SHIPPED_TRIUMPHS.length + DORMANT_TRIUMPHS.length);
  });

  test('a maximal profile still earns none of them', () => {
    const ids = earnedIds(maximal(), { won: true, lowestHealthFraction: 0.01, crowdHypePeak: 100 });
    for (const triumph of DORMANT_TRIUMPHS) expect(ids).not.toContain(triumph.id);
    // And the same through the award composition.
    const awarded = applyTriumphAwards(maximal());
    for (const triumph of DORMANT_TRIUMPHS) {
      expect(awarded.earned.map((entry) => entry.id)).not.toContain(triumph.id);
      expect(resolveRecords(awarded.profile).earnedTriumphs).not.toContain(triumph.id);
    }
  });

  test('the shipped page can only ever list the four shipped categories', () => {
    // The rendered proof lives in `triumphsSurface.test.tsx` §F (JSX needs a
    // .tsx file); this is the data half of the same claim.
    expect(TRIUMPH_CATEGORIES.map((category) => category.id)).toEqual(['sand', 'coin', 'steel', 'saga']);
    expect(triumphsInCategory('sand').length + triumphsInCategory('coin').length +
      triumphsInCategory('steel').length + triumphsInCategory('saga').length).toBe(
      SHIPPED_TRIUMPHS.length,
    );
    for (const triumph of DORMANT_TRIUMPHS) {
      expect(SHIPPED_TRIUMPHS.map((entry) => entry.id)).not.toContain(triumph.id);
    }
  });
});

// ── §D newlyEarned, and idempotence ───────────────────────────────────────
describe('A8 §D — newlyEarned is condition-holds minus already-earned', () => {
  test('an already-earned id is never returned again', () => {
    const profile = profileWith({ fightsWon: 12, records: { earnedTriumphs: ['sand_ten_victories'] } });
    const ids = earnedIds(profile);
    expect(ids).toContain('sand_first_blood');
    expect(ids).not.toContain('sand_ten_victories');
  });

  test('awarding is idempotent: re-evaluating earns nothing twice', () => {
    const start = profileWith({ fightsWon: 12, records: { peakGold: 1200 } });
    const first = applyTriumphAwards(start);
    expect(first.earned.length).toBeGreaterThan(0);
    expect(evaluateTriumphs(first.profile)).toEqual([]);

    const second = applyTriumphAwards(first.profile);
    expect(second.earned).toEqual([]);
    expect(second.profile.fame).toBe(first.profile.fame);
    expect(second.profile.records).toEqual(first.profile.records);
  });

  test('the record keeps the EARN order and drops ids the catalogue does not know', () => {
    const profile = profileWith({
      fightsWon: 10,
      records: { earnedTriumphs: ['not_a_triumph', 'sand_first_blood', 'sand_first_blood'] },
    });
    expect(resolveRecords(profile).earnedTriumphs).toEqual(['sand_first_blood']);
    expect(earnedIds(profile)).toEqual(['sand_ten_victories']);
  });

  test('a malformed or absent records field reads as nothing earned', () => {
    for (const records of [undefined, null, 7, [] as unknown, {}] as unknown[]) {
      const profile = profileWith({ records: records as PlayerProfile['records'] });
      expect(resolveRecords(profile)).toEqual({
        earnedTriumphs: [],
        viewedTriumphs: [],
        peakGold: 0,
      });
    }
  });
});

// ── §E the fame grants ────────────────────────────────────────────────────
describe('A8 §E — the one-time fame grants (Director ruling R1)', () => {
  test('10 for a standard triumph and 25 for a capstone', () => {
    expect(TRIUMPH_FAME_STANDARD).toBe(10);
    expect(TRIUMPH_FAME_CAPSTONE).toBe(25);
    for (const triumph of SHIPPED_TRIUMPHS) {
      expect(triumphFame(triumph), triumph.id).toBe(triumph.capstone ? 25 : 10);
    }
    // The capstones are the six the brief names, plus A5's Codex capstone.
    expect(SHIPPED_TRIUMPHS.filter((triumph) => triumph.capstone).map((t) => t.id).sort()).toEqual([
      'coin_25000_gold',
      'coin_quadra',
      'saga_codex_complete',
      'saga_legend',
      'sand_every_boss',
      'sand_hundred_victories',
      'steel_gilded_loadout',
    ]);
  });

  test('a batch pays exactly its own grants, in the same save', () => {
    const start = profileWith({ fame: 100, fightsWon: 1, currentTier: 2 });
    const outcome = applyTriumphAwards(start);
    // sand_first_blood (10) + saga_tier_one (10) + saga_veteran? no: fame 100.
    expect(outcome.earned.map((t) => t.id)).toEqual(['sand_first_blood', 'saga_tier_one']);
    expect(outcome.profile.fame).toBe(120);
    // The caller's own profile is never mutated.
    expect(start.fame).toBe(100);
    expect(start.records).toBeUndefined();
  });

  test('a capstone pays 25, and every crossing the purse clears pays its own grant', () => {
    // 25,000 clears all three Coin thresholds and every ladder boss is down, so
    // this one write earns four deeds: 25 + 10 + 10 + 25 = 70 fame.
    const start = profileWith({ fame: 0, bossKills: 4, records: { peakGold: 25000 } });
    const outcome = applyTriumphAwards(start);
    const ids = outcome.earned.map((t) => t.id);
    expect(ids).toEqual(['sand_every_boss', 'coin_1000_gold', 'coin_5000_gold', 'coin_25000_gold']);
    expect(outcome.profile.fame).toBe(70);
  });

  test('re-running the same result pays nothing a second time', () => {
    const start = profileWith({ fightsWon: 10 });
    const once = applyTriumphAwards(start);
    const twice = applyTriumphAwards(once.profile);
    expect(twice.profile.fame).toBe(once.profile.fame);
  });
});

// ── §F the peak-gold record ───────────────────────────────────────────────
describe('A8 §F — peakGold rises and never falls', () => {
  test('it records the purse on the first write and only raises it', () => {
    const start = profileWith({ gold: 800 });
    const recorded = withPeakGold(start);
    expect(resolveRecords(recorded).peakGold).toBe(800);
    expect(recorded).not.toBe(start);

    // Gold spent down: the peak holds, and the profile is returned unchanged.
    const spent = profileWith({ gold: 20, records: { peakGold: 800 } });
    expect(withPeakGold(spent)).toBe(spent);
    expect(resolveRecords(withPeakGold(spent)).peakGold).toBe(800);
  });

  test('a new high raises it, and the peak is never below the purse', () => {
    const rich = withPeakGold(profileWith({ gold: 5000, records: { peakGold: 800 } }));
    expect(resolveRecords(rich).peakGold).toBe(5000);
    expect(resolveRecords(rich).peakGold).toBeGreaterThanOrEqual(rich.gold);
  });

  test('a malformed purse or a malformed peak is not trusted', () => {
    const nanGold = profileWith({ gold: Number.NaN, records: { peakGold: 400 } });
    expect(withPeakGold(nanGold)).toBe(nanGold);
    expect(resolveRecords(profileWith({ records: { peakGold: Number.NaN } })).peakGold).toBe(0);
    expect(resolveRecords(profileWith({ records: { peakGold: -50 } })).peakGold).toBe(0);
  });

  test('a victory that raises gold earns the Coin deed on the same write', () => {
    // The duel write credits the purse, then the award composition reads the peak.
    const before = profileWith({ gold: 100 });
    const afterVictory = profileWith({ gold: 1200, records: { peakGold: 100 } });
    expect(before.records).toBeUndefined();
    const outcome = applyTriumphAwards(afterVictory);
    expect(outcome.earned.map((t) => t.id)).toContain('coin_1000_gold');
    expect(resolveRecords(outcome.profile).peakGold).toBe(1200);
  });
});

// ── §G the titles ─────────────────────────────────────────────────────────
describe('A8 §G — one earned title per category (Director ruling R2)', () => {
  test('the earned titles, and their categories', () => {
    // A5 REBASE, not a weakening: A5 appends its own capstone title by id (granted
    // only by `saga_codex_complete`, never by a category rule), so the four A8
    // titles keep their order and the fifth is named after them.
    expect(EARNED_TITLES.map((title) => title.id)).toEqual([
      'title_blood_of_the_sands',
      'title_fortunes_favourite',
      'title_iron_bound',
      'title_living_legend_of_the_ludus',
      'title_chronicler_of_the_ludus',
    ]);
  });

  test('the first Sand / Coin / Steel triumph grants each category\'s title', () => {
    const start = profileWith({ fightsWon: 1, records: { peakGold: 1000 } });
    const outcome = applyTriumphAwards(start);
    const ids = outcome.earned.map((t) => t.id);
    expect(ids).toContain('sand_first_blood');
    expect(ids).toContain('coin_1000_gold');
    expect(outcome.titles.map((title) => title.id)).toEqual([
      'title_blood_of_the_sands',
      'title_fortunes_favourite',
    ]);
    expect(resolveLaurels(outcome.profile).titles).toEqual([
      'title_blood_of_the_sands',
      'title_fortunes_favourite',
    ]);
  });

  test('the Steel title arrives with the first Steel triumph', () => {
    const outcome = applyTriumphAwards(
      profileWith({
        chariot: {
          owned: ['wheels_standard', 'finish_stock', 'wheels_reinforced'],
          equipped: { wheels: 'wheels_standard', finish: 'finish_stock' },
        },
      }),
    );
    expect(outcome.earned.map((t) => t.id)).toContain('steel_wheels');
    expect(outcome.titles.map((title) => title.id)).toEqual(['title_iron_bound']);
  });

  test('the Saga title is capstone-gated: rank triumphs alone grant nothing', () => {
    const veteran = applyTriumphAwards(profileWith({ fame: 600, currentTier: 3 }));
    expect(veteran.earned.map((t) => t.id)).toContain('saga_veteran');
    expect(veteran.earned.map((t) => t.id)).toContain('saga_champion');
    expect(veteran.titles).toEqual([]);
    expect(resolveLaurels(veteran.profile).titles).toEqual([]);
  });

  test('at Legend rank the Saga title is granted', () => {
    const legend = applyTriumphAwards(profileWith({ fame: 1500, currentTier: 4, bossKills: 1 }));
    expect(legend.earned.map((t) => t.id)).toContain('saga_legend');
    expect(legend.titles.map((title) => title.id)).toEqual(['title_living_legend_of_the_ludus']);
  });

  test('earned titles are appended beside the purchased ones, which stay owned', () => {
    const bought = purchaseLaurel(profileWith({ fame: 5000 }), 'title_crowd_favourite');
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    expect(bought.profile.title).toBe('Crowd Favourite');

    const outcome = applyTriumphAwards({ ...bought.profile, fightsWon: 1 });
    expect(resolveLaurels(outcome.profile).titles).toEqual([
      'title_crowd_favourite',
      'title_blood_of_the_sands',
    ]);
    // Owning a new title does not steal the displayed one.
    expect(outcome.profile.title).toBe('Crowd Favourite');
    expect(ownsTriumph(outcome.profile, 'title_crowd_favourite')).toBe(true);
  });

  test('a second title purchase cannot wipe the earned titles', () => {
    const earned = applyTriumphAwards(profileWith({ fightsWon: 1 })).profile;
    const bought = purchaseLaurel({ ...earned, fame: 5000 }, 'title_champion_of_the_sands');
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    // The purchased titles come first in catalogue order, the earned one after —
    // and the earned one SURVIVED the purchase (it is not dropped by the write).
    expect(resolveLaurels(bought.profile).titles).toEqual([
      'title_champion_of_the_sands',
      'title_blood_of_the_sands',
    ]);
    expect(bought.profile.laurels?.titles).toEqual([
      'title_blood_of_the_sands',
      'title_champion_of_the_sands',
    ]);
  });

  test("'Living Legend' and 'Living Legend of the Ludus' are different titles", () => {
    const purchasable = PURCHASABLE_TRIUMPHS.find((triumph) => triumph.id === 'title_living_legend');
    const earned = EARNED_TITLES.find((title) => title.id === 'title_living_legend_of_the_ludus');
    expect(purchasable?.name).toBe('Living Legend');
    expect(earned?.name).toBe('Living Legend of the Ludus');
    expect(purchasable?.name).not.toBe(earned?.name);
    expect(purchasable?.id).not.toBe(earned?.id);

    // Both are selectable when both are owned, and each writes its own string.
    const both = profileWith({
      laurels: { titles: ['title_living_legend', 'title_living_legend_of_the_ludus'] },
    });
    expect(ownedTitleOptions(both).map((title) => title.id)).toEqual([
      'title_living_legend',
      'title_living_legend_of_the_ludus',
    ]);
    expect(selectDisplayedTitle(both, 'title_living_legend').title).toBe('Living Legend');
    expect(selectDisplayedTitle(both, 'title_living_legend_of_the_ludus').title).toBe(
      'Living Legend of the Ludus',
    );
  });

  test('one tap selects an owned title; an unowned or already-shown one is not saved', () => {
    const owned = profileWith({ laurels: { titles: ['title_blood_of_the_sands'] } });
    const selected = selectDisplayedTitle(owned, 'title_blood_of_the_sands');
    expect(selected.title).toBe('Blood of the Sands');
    expect(selectDisplayedTitle(selected, 'title_blood_of_the_sands')).toBe(selected);
    expect(selectDisplayedTitle(owned, 'title_iron_bound')).toBe(owned);
    expect(selectDisplayedTitle(owned, 'not_a_title')).toBe(owned);
  });

  test('the page offers a row for every owned title, in two catalogues', () => {
    const profile = profileWith({
      title: 'Iron-Bound',
      laurels: { titles: ['title_crowd_favourite', 'title_iron_bound'] },
    });
    // The rendered marking is asserted in `triumphsSurface.test.tsx` §F.
    expect(ownedTitleOptions(profile).map((title) => title.id)).toEqual([
      'title_crowd_favourite',
      'title_iron_bound',
    ]);
    expect(profile.title).toBe('Iron-Bound');
  });
});

// ── §H the ✦ marker ───────────────────────────────────────────────────────
describe('A8 §H — the ✦ marker (Director ruling R7)', () => {
  test('it shows iff earned-minus-viewed is non-empty', () => {
    const none = profileWith();
    expect(hasUnviewedTriumphs(none)).toBe(false);

    const unread = profileWith({
      records: { earnedTriumphs: ['sand_first_blood', 'coin_quadra'] },
    });
    expect(unviewedTriumphs(unread)).toEqual(['sand_first_blood', 'coin_quadra']);
    expect(hasUnviewedTriumphs(unread)).toBe(true);

    const allRead = profileWith({
      records: {
        earnedTriumphs: ['sand_first_blood', 'coin_quadra'],
        viewedTriumphs: ['sand_first_blood', 'coin_quadra'],
      },
    });
    expect(hasUnviewedTriumphs(allRead)).toBe(false);

    const partly = profileWith({
      records: {
        earnedTriumphs: ['sand_first_blood', 'coin_quadra'],
        viewedTriumphs: ['sand_first_blood'],
      },
    });
    expect(unviewedTriumphs(partly)).toEqual(['coin_quadra']);
    expect(hasUnviewedTriumphs(partly)).toBe(true);
  });

  test('one view mark clears it, and a second mark never writes', () => {
    const unread = profileWith({
      records: { earnedTriumphs: ['sand_first_blood', 'coin_quadra'], peakGold: 300 },
    });
    const viewed = markTriumphsViewed(unread);
    expect(viewed).not.toBe(unread);
    expect(viewed.records?.viewedTriumphs).toEqual(['sand_first_blood', 'coin_quadra']);
    expect(viewed.records?.earnedTriumphs).toEqual(['sand_first_blood', 'coin_quadra']);
    expect(viewed.records?.peakGold).toBe(300);
    expect(hasUnviewedTriumphs(viewed)).toBe(false);

    // Identity-stable once nothing is unread: the Library's effect cannot save twice.
    expect(markTriumphsViewed(viewed)).toBe(viewed);
  });

  test('nothing earned means no marker and no write', () => {
    const fresh = profileWith();
    expect(markTriumphsViewed(fresh)).toBe(fresh);
  });

  test('the city prompt reads the marker on the Library building only', () => {
    const scene = code('components/3d/city/CityHubScene.tsx');
    expect(scene).toContain('hasUnviewedTriumphs(playerProfile)');
    expect(scene).toContain("nearbyLoc.id === 'records_house' && unreadDeeds");
    expect(scene).toContain("'✦ '");
    // No other hub id carries it.
    expect(scene.split("nearbyLoc.id === 'records_house' && unreadDeeds").length - 1).toBe(2);
  });
});

// ── §I the gear sets ──────────────────────────────────────────────────────
describe('A8 §I — every gear set is completable from shop stock', () => {
  const armorerStock = new Set(getStorefrontStock('armorer'));
  const fullyBuilt = profileWith({ facilities: { stable: 0, yard: 0, workshop: 2 } });

  test('two complete sets are defined, one piece per slot each', () => {
    expect(GEAR_SETS.map((set) => set.material)).toEqual(['iron', 'gilded']);
    for (const set of GEAR_SETS) {
      expect(set.pieces.map((piece) => piece.slot)).toEqual(['helm', 'chest', 'arms', 'legs']);
    }
  });

  test('every piece exists in itemsDB, in its own slot, and is sold by the armorer', () => {
    const knownIds = new Set(ITEMS_DB.map((item) => item.id));
    for (const set of GEAR_SETS) {
      for (const piece of set.pieces) {
        expect(knownIds, `${set.id} ${piece.itemId}`).toContain(piece.itemId);
        const item = ALL_ARMORS.find((armor) => armor.id === piece.itemId);
        expect(item?.slot).toBe(piece.slot);
        // On a shelf: the armorer's stock, and reachable once the forge allows it.
        expect(armorerStock, `${set.id} ${piece.itemId}`).toContain(piece.itemId);
        // On a shelf AND reachable: the armorer sells every armour piece, and the
        // Master Forge gate is satisfied by a built workshop.
        expect(isItemUnlocked(fullyBuilt, piece.itemId), `${set.id} ${piece.itemId}`).toBe(true);
      }
    }
  });

  test('each complete set satisfies the triumph', () => {
    for (const set of GEAR_SETS) {
      expect(earnedIds(carrying(...set.pieces.map((piece) => piece.itemId)))).toContain(
        'steel_full_set',
      );
    }
  });

  test('three of the four pieces is not a set', () => {
    const set = GEAR_SETS[0];
    const three = carrying(...set.pieces.slice(0, 3).map((piece) => piece.itemId));
    expect(earnedIds(three)).not.toContain('steel_full_set');
  });

  test('a worn piece counts as owned', () => {
    const set = GEAR_SETS[1];
    const worn = profileWith({
      equipped: {
        weapon: createNewProfile('x').equipped.weapon,
        helm: armour(set.pieces[0].itemId),
        chest: armour(set.pieces[1].itemId),
      },
    });
    expect(earnedIds(worn)).not.toContain('steel_full_set');
    const alsoCarrying = carrying(set.pieces[2].itemId, set.pieces[3].itemId);
    expect(
      earnedIds({
        ...worn,
        inventory: [...alsoCarrying.inventory],
      }),
    ).toContain('steel_full_set');
  });
});

// ── §J the save corpus ────────────────────────────────────────────────────
describe('A8 §J — the corpus keeps its rule at 22', () => {
  const scanOptional = (source: string): string[] => {
    const start = source.indexOf('export interface PlayerProfile {');
    expect(start).toBeGreaterThan(-1);
    let depth = 0;
    let end = start;
    for (let i = source.indexOf('{', start); i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    return [...source.slice(start, end).matchAll(/^ {2}([A-Za-z][A-Za-z0-9_]*)\?:/gm)].map(
      (match) => match[1],
    );
  };

  test('records is the twenty-second optional field, last in declaration order', () => {
    const optional = scanOptional(read('types/game.ts'));
    expect(optional.length).toBe(22);
    expect(optional.slice(-2)).toEqual(['spared', 'records']);
  });

  test('the records-era fixture is registered, and the manifest names it', () => {
    expect(read('utils/saveFixtures/index.ts')).toContain("id: 'records-era'");
    expect(read('utils/saveFixtures/MANIFEST.md')).toContain('records-era');
    expect(read('utils/saveFixtures/index.ts')).toContain("file: 'recordsEraProfile.json'");
  });
});

// ── §K the shipped wiring ─────────────────────────────────────────────────
describe('A8 §K — the one call site, the two doors, the one view mark', () => {
  const app = code('App.tsx');

  test('the duel result is the ONE shipped evaluation, with its transient reading', () => {
    const handler = app.slice(app.indexOf('const handleMatchComplete'));
    const end = handler.indexOf('const handleDuelResultDismiss');
    const body = end > 0 ? handler.slice(0, end) : handler;
    expect((app.match(/applyTriumphAwards\(/g) ?? []).length).toBe(1);
    expect(body).toContain('applyTriumphAwards(timedProfile, duelTriumphStats)');
    expect(body).toContain('won: didWin');
    expect(body).toContain('lowestHealthFraction: resultStats.lowestHealthFraction');
    expect(body).toContain('crowdHypePeak: resultStats.crowdHypePeak');
    // One save: the awards are composed into the profile this write saves.
    expect(body).toContain('setProfile(awards.profile)');
    expect(body).toContain('saveProfile(awards.profile)');
    // The herald line the brief fixes word for word.
    expect(body).toContain('The scribes record a new triumph: ');
    // The Library never evaluates: opening it cannot earn a deed.
    expect(code('components/hub/TriumphsPage.tsx')).not.toContain('applyTriumphAwards');
    expect(code('components/hub/LibraryTab.tsx')).not.toContain('applyTriumphAwards');
  });

  test('the peak-gold updater rides every write that RAISES gold', () => {
    expect(app).toContain('withPeakGold(sellItem(profile, item.id))');
    expect(app).toContain('withPeakGold(outcome.profile)');
  });

  test('the Library marks earned deeds viewed once, when its page opens', () => {
    const library = code('components/hub/LibraryTab.tsx');
    expect(library).toContain("if (page !== 'triumphs') return;");
    expect(library).toContain('markViewed.current?.()');
    // The write itself is App's, through the normal save pair.
    const handler = app.slice(app.indexOf('const handleViewTriumphs'));
    const body = handler.slice(0, handler.indexOf('};') + 2);
    expect(body).toContain('markTriumphsViewed(profile)');
    expect(body).toContain('if (viewed === profile) return;');
    expect(body).toContain('saveProfile(viewed)');
  });

  test('the character sheet is the second door onto the same view', () => {
    const stats = code('components/hub/StatsTab.tsx');
    expect(stats).toContain('onOpenTriumphs');
    expect(stats).toContain('View Triumphs');
    const hub = code('components/hub/GladiatorSchoolHub.tsx');
    expect(hub).toContain("setLibraryPage('triumphs')");
    expect(hub).toContain('onTabChange(\'library\')');
    expect(hub).toContain('<LibraryTab');
  });

  test('combatCalculations.ts is untouched by this slice', () => {
    for (const path of ['utils/triumphs.ts', 'components/hub/TriumphsPage.tsx', 'components/hub/LibraryTab.tsx']) {
      expect(code(path), path).not.toContain('combatCalculations');
    }
  });

  test('the page offers title selection only inside the Triumphs view', () => {
    const page = code('components/hub/TriumphsPage.tsx');
    expect(page).toContain('data-title-option={title.id}');
    expect(page).toContain('onClick={() => onSelectTitle?.(title.id)}');
    // StatsTab routes; it does not grow a second selector.
    expect(code('components/hub/StatsTab.tsx')).not.toContain('data-title-option');
  });

  test('the sheet\'s route button is conditional on its handler', () => {
    // The rendered proof is `triumphsSurface.test.tsx` §F; here the source pin.
    expect(code('components/hub/StatsTab.tsx')).toContain('{onOpenTriumphs && (');
  });
});
