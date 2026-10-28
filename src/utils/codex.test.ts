/**
 * A5 — THE CODEX: the derivation, the one lazy save field, and the capstone.
 *
 * Run with: `bun test src/utils/codex.test.ts`
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  the datasets and the R1 denominators (24 / 9 / teams + parts / itemsDB
 *       count / 21) — read from the shipped data, never a literal copy of it;
 *   §B  Gladiators — every rival, defeated from `defeatedOpponentIds` or not yet;
 *   §C  Bosses — the 9 boss-ladder rows, feature bosses killed through
 *       `defeatedOpponentIds` with `bossKills` empty, the Deserter excluded;
 *   §D  Horses & Teams — Biga by definition, Triga/Quadra from `racing.unlocked`,
 *       every catalogue part owned or not (and NO horse-tier section);
 *   §E  Arms & Armor — A8's `GEAR_SETS` first, the loose pieces after, owned lit,
 *       missing dimmed, the selling shop named;
 *   §F  The City — 21 hubs, visited from `records.codexLocations`;
 *   §G  the percentage arithmetic and the laurel rule (100% exactly, never 99);
 *   §H  the ONE new record: first-visit-only writes, deduped, nested in `records`,
 *       identity-stable so a repeat visit can never save;
 *   §I  the full-Codex triumph: `saga_codex_complete` evaluates iff every shipped
 *       page is 100%, and it grants 'Chronicler of the Ludus' through the shipped
 *       `laurels.titles` mechanism (owned permanently, selectable);
 *   §J  the save corpus: §J stays at 22 optional fields with `records` last, and
 *       the records-era fixture carries the new array;
 *   §K  the surfaces and the wiring, read out of the shipped sources: the Codex
 *       tab in the Library rack, no horse tiers, no best-hype column, and the one
 *       hub-visit write through App's save pair.  The Fragments page is STORY-5b's
 *       and is pinned where it belongs (`librarianChain.test.ts` §F): absent
 *       until the Librarian chain closes, so A5's "no empty shell" property holds.
 *
 * The components are not rendered here (JSX needs a .tsx file) — the rendered
 * pins live in `codexSurface.test.tsx`; this suite reads their sources only where
 * the wiring is the claim.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PlayerProfile } from '../types/game';
import { createNewProfile } from '../services/storage';
import { ALL_OPPONENTS, DOCTORE_TEST_OPPONENT } from '../data/opponents';
import { CHARIOT_PARTS } from '../data/chariotParts';
import { ITEMS_DB } from '../data/itemsDB';
import { HUB_LOCATIONS } from './cityCollisions';
import { GEAR_SETS } from './triumphs';
import {
  CODEX_COMPLETE_TRIUMPH_ID,
  applyTriumphAwards,
  evaluateTriumphs,
  resolveRecords,
} from './triumphs';
import { ownedTitleOptions, resolveLaurels, selectDisplayedTitle } from './laurels';
import {
  CODEX_BOSS_ROWS,
  CODEX_DENOMINATORS,
  CODEX_GLADIATOR_ROWS,
  buildCodex,
  codexPage,
  isCodexComplete,
  resolveCodexLocations,
  withCodexLocation,
} from './codex';
import { SAVE_FIXTURES } from './saveFixtures';

const SOURCE_DIR = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string): string => readFileSync(join(SOURCE_DIR, path), 'utf8');
const code = (path: string): string =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');

const profileWith = (patch: Partial<PlayerProfile>): PlayerProfile => ({
  ...createNewProfile('Codex Tester'),
  ...patch,
});

const ids = (entries: { id: string }[]): string[] => entries.map((entry) => entry.id);

describe('A5 §A — the datasets and the R1 denominators', () => {
  test('the five denominators are the shipped datasets, not literals', () => {
    expect(CODEX_DENOMINATORS).toEqual({
      gladiators: 24,
      bosses: 9,
      horses: 3 + CHARIOT_PARTS.length,
      arms: ITEMS_DB.length,
      city: HUB_LOCATIONS.length,
    });
    // The measured sizes this branch ships (a change here is a real dataset change).
    expect(ALL_OPPONENTS.length).toBe(23);
    expect(CODEX_GLADIATOR_ROWS.length).toBe(ALL_OPPONENTS.length + 1);
    expect(CHARIOT_PARTS.length).toBe(16);
    expect(ITEMS_DB.length).toBe(27);
    expect(HUB_LOCATIONS.length).toBe(21);
  });

  test('Gladiators is every roster row plus the Doctore\'s Test story bout', () => {
    expect(ids(CODEX_GLADIATOR_ROWS as { id: string }[])).toEqual([
      ...ALL_OPPONENTS.map((opponent) => opponent.id),
      DOCTORE_TEST_OPPONENT.id,
    ]);
    expect(CODEX_GLADIATOR_ROWS).toContain(DOCTORE_TEST_OPPONENT);
  });

  test('Bosses is the 9 boss-ladder rows: four champions plus five feature bosses', () => {
    expect(CODEX_BOSS_ROWS.length).toBe(9);
    expect(CODEX_BOSS_ROWS.filter((opponent) => opponent.featureBout === true).length).toBe(5);
    expect(CODEX_BOSS_ROWS.filter((opponent) => opponent.featureBout !== true).length).toBe(4);
    // The Deserter is a bounty, not a boss-ladder row (R1).
    expect(ids(CODEX_BOSS_ROWS as { id: string }[])).not.toContain('opp_bounty_deserter');
  });
});

describe('A5 §B — Gladiators, defeated or not yet faced', () => {
  test('every row renders with its class and its mark', () => {
    const page = codexPage(
      profileWith({
        defeatedOpponentIds: ['opp_marcus', 'opp_bounty_decimus', DOCTORE_TEST_OPPONENT.id],
      }),
      'gladiators',
    )!;
    expect(page.total).toBe(24);
    expect(page.groups.map((group) => group.id)).toEqual(['ladder', 'yard', 'feature', 'bounty']);
    const entries = page.groups.flatMap((group) => group.entries);
    expect(entries.length).toBe(24);
    expect(entries.filter((entry) => entry.found).map((entry) => entry.id)).toEqual([
      'opp_marcus',
      DOCTORE_TEST_OPPONENT.id,
      'opp_bounty_decimus',
    ]);
    // A bounty row and the story bout both count — all 24 rows are the dataset.
    expect(ids(entries)).toContain('opp_bounty_deserter');
    expect(ids(entries)).toContain(DOCTORE_TEST_OPPONENT.id);
    // Every row carries a class/tier line; a row with no armatura falls back to its weapon.
    expect(entries.find((entry) => entry.id === 'opp_marcus')!.detail).toContain('Murmillo');
    expect(entries.find((entry) => entry.id === DOCTORE_TEST_OPPONENT.id)!.detail).toContain(
      'Sword & shield',
    );
  });

  test('a fresh gladiator has faced nobody', () => {
    const page = codexPage(profileWith({}), 'gladiators')!;
    expect(page.touched).toBe(0);
    expect(page.percent).toBe(0);
    expect(page.laurel).toBe(false);
  });
});

describe('A5 §C — Bosses, and where the kill mark is read', () => {
  test('a ladder champion is killed from the id record', () => {
    const page = codexPage(profileWith({ bossKills: 1, defeatedOpponentIds: ['opp_goliath_boss'] }), 'bosses')!;
    const entries = page.groups.flatMap((group) => group.entries);
    expect(entries.filter((entry) => entry.found).map((entry) => entry.id)).toEqual([
      'opp_goliath_boss',
    ]);
  });

  test('a feature boss counts as killed with bossKills empty — from defeatedOpponentIds', () => {
    const page = codexPage(
      profileWith({ bossKills: 0, defeatedOpponentIds: ['opp_varro_boss', 'opp_hermas_boss'] }),
      'bosses',
    )!;
    const entries = page.groups.flatMap((group) => group.entries);
    expect(page.touched).toBe(2);
    expect(entries.filter((entry) => entry.found).map((entry) => entry.id).sort()).toEqual([
      'opp_hermas_boss',
      'opp_varro_boss',
    ]);
    // …and the mark is not the count: bossKills alone names no row.
    const countOnly = codexPage(profileWith({ bossKills: 4 }), 'bosses')!;
    expect(countOnly.touched).toBe(0);
  });

  test('the Deserter is on no boss page, and there are nine rows', () => {
    const page = codexPage(profileWith({ defeatedOpponentIds: ['opp_bounty_deserter'] }), 'bosses')!;
    const entries = page.groups.flatMap((group) => group.entries);
    expect(entries.length).toBe(9);
    expect(ids(entries)).not.toContain('opp_bounty_deserter');
    expect(page.touched).toBe(0);
  });
});

describe('A5 §D — Horses & Teams: teams and parts, and nothing else', () => {
  test('Biga is owned by definition; Triga and Quadra follow racing.unlocked', () => {
    const fresh = codexPage(profileWith({}), 'horses')!;
    const teams = fresh.groups.find((group) => group.id === 'teams')!.entries;
    expect(teams.map((team) => [team.id, team.found])).toEqual([
      ['team_biga', true],
      ['team_triga', false],
      ['team_quadra', false],
    ]);

    const unlocked = codexPage(profileWith({ racing: { unlocked: [3, 4], selected: 4 } }), 'horses')!;
    expect(unlocked.groups[0].entries.every((team) => team.found)).toBe(true);
  });

  test('every catalogue part is a row; the stock part of a slot is owned', () => {
    const page = codexPage(profileWith({}), 'horses')!;
    const parts = page.groups.find((group) => group.id === 'parts')!.entries;
    expect(parts.length).toBe(CHARIOT_PARTS.length);
    expect(page.total).toBe(3 + CHARIOT_PARTS.length);
    // The five stock parts are owned with no chariot field at all.
    const stockIds = CHARIOT_PARTS.filter((part) => part.defaultOwned).map((part) => part.id);
    expect(parts.filter((part) => part.found).map((part) => part.id)).toEqual(stockIds);

    const bought = codexPage(
      profileWith({
        chariot: { owned: ['wheels_reinforced'], equipped: { wheels: 'wheels_reinforced', finish: 'finish_stock' } },
      }),
      'horses',
    )!;
    expect(bought.groups[1].entries.find((part) => part.id === 'wheels_reinforced')!.found).toBe(true);
    // The Triumph banner finish is a catalogue part like any other (R1).
    expect(bought.groups[1].entries.find((part) => part.id === 'finish_triumph_banners')!.found).toBe(false);
  });

  test('there is no horse-tiers section — no void is advertised (R2)', () => {
    const page = codexPage(profileWith({}), 'horses')!;
    expect(page.groups.map((group) => group.id)).toEqual(['teams', 'parts']);
    for (const group of page.groups) {
      expect(group.label.toLowerCase()).not.toContain('tier');
    }
  });
});

describe('A5 §E — Arms & Armor: A8\'s sets first, then the loose pieces', () => {
  test('the sets are A8\'s own GEAR_SETS, and the rest is listed plainly', () => {
    const page = codexPage(profileWith({}), 'arms')!;
    expect(page.total).toBe(ITEMS_DB.length);
    expect(page.groups.map((group) => group.id)).toEqual([
      ...GEAR_SETS.map((set) => set.id),
      'ungrouped',
    ]);
    for (const set of GEAR_SETS) {
      const group = page.groups.find((candidate) => candidate.id === set.id)!;
      expect(group.entries.map((entry) => entry.id)).toEqual(set.pieces.map((piece) => piece.itemId));
    }
    const loose = page.groups.find((group) => group.id === 'ungrouped')!;
    expect(loose.entries.length).toBe(ITEMS_DB.length - GEAR_SETS.length * 4);
  });

  test('owned pieces are lit — carried or worn — and missing ones are dimmed with their shop', () => {
    const starter = createNewProfile('Codex Tester');
    const page = codexPage(starter, 'arms')!;
    const entries = page.groups.flatMap((group) => group.entries);
    // The starter's own gladius is owned from the first minute.
    expect(entries.find((entry) => entry.id === starter.equipped.weapon.id)!.found).toBe(true);

    const missing = entries.find((entry) => entry.id === 'chest_golden_muscled')!;
    expect(missing.found).toBe(false);
    expect(missing.source).toBe('Armor & Leather Workshop');

    const weapon = entries.find((entry) => entry.id === 'spatha_legion')!;
    expect(weapon.found).toBe(false);
    expect(weapon.source).toBe('Imperial Smithing Forge');

    // A piece no city shop sells names no shop — the starter kit is honestly unsold.
    const unsold = entries.find((entry) => entry.id === 'gladius_standard')!;
    expect(unsold.source).toBeUndefined();
  });
});

describe('A5 §F — The City: every hub walked', () => {
  test('all 21 hubs are listed and only recorded ones are visited', () => {
    const page = codexPage(profileWith({ records: { codexLocations: ['colosseum', 'records_house'] } }), 'city')!;
    expect(page.total).toBe(HUB_LOCATIONS.length);
    const entries = page.groups.flatMap((group) => group.entries);
    expect(ids(entries).sort()).toEqual(HUB_LOCATIONS.map((location) => location.id).sort());
    expect(entries.filter((entry) => entry.found).map((entry) => entry.id).sort()).toEqual([
      'colosseum',
      'records_house',
    ]);
  });

  test('the resolver drops unknown ids, duplicates and junk', () => {
    const profile = profileWith({
      records: {
        codexLocations: ['colosseum', 'colosseum', 'not_a_hub', 7 as unknown as string, 'tavern'],
      },
    });
    expect(resolveCodexLocations(profile)).toEqual(['colosseum', 'tavern']);
  });
});

describe('A5 §G — the percentage and the laurel', () => {
  test('a page is floor(touched / dataset), so 23 of 24 is 95%, never 100', () => {
    const allButOne = CODEX_GLADIATOR_ROWS.slice(0, 23).map((opponent) => opponent.id);
    const page = codexPage(profileWith({ defeatedOpponentIds: allButOne }), 'gladiators')!;
    expect(page.touched).toBe(23);
    expect(page.percent).toBe(95);
    expect(page.laurel).toBe(false);
  });

  test('the laurel is lit at exactly 100% and nowhere else — on every page', () => {
    const empty = buildCodex(profileWith({}));
    for (const page of empty.pages) {
      expect(page.percent).toBe(page.total === 0 ? 0 : Math.floor((page.touched / page.total) * 100));
      expect(page.laurel).toBe(page.touched === page.total && page.total > 0);
    }
    // One page is filled; that page alone carries the mark.
    const one = buildCodex(
      profileWith({
        records: { codexLocations: HUB_LOCATIONS.map((location) => location.id) },
      }),
    );
    expect(one.pages.find((page) => page.id === 'city')!.laurel).toBe(true);
    expect(one.laurelCount).toBe(1);
    expect(one.complete).toBe(false);
  });
});

describe('A5 §H — the one new record: first-visit-only, nested in `records`', () => {
  test('a first visit appends inside records and preserves every other record', () => {
    const before = profileWith({
      records: { peakGold: 900, earnedTriumphs: ['sand_first_blood'], viewedTriumphs: [] },
    });
    const after = withCodexLocation(before, 'colosseum');
    expect(after).not.toBe(before);
    expect(after.records!.codexLocations).toEqual(['colosseum']);
    // The record's other members survive the write untouched.
    expect(after.records!.peakGold).toBe(900);
    expect(after.records!.earnedTriumphs).toEqual(['sand_first_blood']);
    // …and no top-level profile field was added (§J).
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  });

  test('a repeat visit writes nothing — the same profile object comes back', () => {
    const first = withCodexLocation(profileWith({}), 'colosseum');
    const again = withCodexLocation(first, 'colosseum');
    expect(again).toBe(first);
    // A deduped saved array is read as one visit, and a second write of it is a no-op.
    const duplicated = profileWith({ records: { codexLocations: ['colosseum', 'colosseum'] } });
    expect(resolveCodexLocations(duplicated)).toEqual(['colosseum']);
    expect(withCodexLocation(duplicated, 'colosseum')).toBe(duplicated);
  });

  test('an unknown id, a junk id and no profile all change nothing', () => {
    const profile = profileWith({});
    expect(withCodexLocation(profile, 'not_a_hub')).toBe(profile);
    expect(withCodexLocation(profile, 42)).toBe(profile);
    expect(withCodexLocation(profile, null)).toBe(profile);
    expect(withCodexLocation(null, 'colosseum')).toBeNull();
  });

  test('a malformed records object is replaced by a well-formed one, not crashed on', () => {
    const profile = profileWith({ records: 'broken' as unknown as PlayerProfile['records'] });
    const after = withCodexLocation(profile, 'tavern');
    expect(after.records!.codexLocations).toEqual(['tavern']);
    expect(resolveRecords(after).peakGold).toBe(0);
  });
});

// ── §I the full-Codex capstone ────────────────────────────────────────────
/** A profile that has filled every shipped page: the only shape that earns it. */
const fullCodexProfile = (patch: Partial<PlayerProfile> = {}): PlayerProfile =>
  profileWith({
    defeatedOpponentIds: CODEX_GLADIATOR_ROWS.map((opponent) => opponent.id),
    inventory: [...ITEMS_DB],
    chariot: {
      owned: CHARIOT_PARTS.map((part) => part.id),
      equipped: { wheels: 'wheels_reinforced', finish: 'finish_gilded' },
    },
    racing: { unlocked: [3, 4], selected: 4 },
    records: { codexLocations: HUB_LOCATIONS.map((location) => location.id) },
    ...patch,
  });

describe('A5 §I — saga_codex_complete, the shared reward sink', () => {
  test('a fully filled Codex earns it through the EXISTING evaluator', () => {
    const full = fullCodexProfile();
    expect(isCodexComplete(full)).toBe(true);
    expect(buildCodex(full).laurelCount).toBe(5);
    const earned = evaluateTriumphs(full).map((triumph) => triumph.id);
    expect(earned).toContain(CODEX_COMPLETE_TRIUMPH_ID);
  });

  test('it grants 25 fame (a Saga capstone) and the authored title, selectable', () => {
    const full = fullCodexProfile({ records: { codexLocations: HUB_LOCATIONS.map((location) => location.id) } });
    const before = full.fame;
    const outcome = applyTriumphAwards(full);
    const capstone = outcome.earned.find((triumph) => triumph.id === CODEX_COMPLETE_TRIUMPH_ID)!;
    expect(capstone.capstone).toBe(true);
    // The batch's fame is the sum of its grants, so the capstone's own 25 is in it.
    expect(outcome.profile.fame - before).toBe(
      outcome.earned.reduce((sum, triumph) => sum + (triumph.capstone ? 25 : 10), 0),
    );
    // The title is granted through the shipped laurels record, owned permanently.
    expect(resolveLaurels(outcome.profile).titles).toContain('title_chronicler_of_the_ludus');
    expect(ownedTitleOptions(outcome.profile).map((title) => title.id)).toContain(
      'title_chronicler_of_the_ludus',
    );
    // …and it is a title like any other: one tap puts it on the record.
    const shown = selectDisplayedTitle(outcome.profile, 'title_chronicler_of_the_ludus');
    expect(shown.title).toBe('Chronicler of the Ludus');
    // Re-running the same result earns nothing twice.
    expect(evaluateTriumphs(outcome.profile).map((triumph) => triumph.id)).not.toContain(
      CODEX_COMPLETE_TRIUMPH_ID,
    );
  });

  test('the Stage-2 consequence: missing only the bounty rows does NOT earn it', () => {
    const bountyIds = ALL_OPPONENTS.filter((opponent) => opponent.bountyBout === true).map(
      (opponent) => opponent.id,
    );
    expect(bountyIds.length).toBe(6);
    const noBounties = fullCodexProfile({
      defeatedOpponentIds: CODEX_GLADIATOR_ROWS.filter(
        (opponent) => opponent.bountyBout !== true,
      ).map((opponent) => opponent.id),
    });
    expect(buildCodex(noBounties).pages.find((page) => page.id === 'gladiators')!.percent).toBe(75);
    expect(isCodexComplete(noBounties)).toBe(false);
    expect(evaluateTriumphs(noBounties).map((triumph) => triumph.id)).not.toContain(
      CODEX_COMPLETE_TRIUMPH_ID,
    );
  });

  test('a fresh gladiator is nowhere near it, and every page must be full', () => {
    expect(isCodexComplete(profileWith({}))).toBe(false);
    expect(evaluateTriumphs(profileWith({})).map((triumph) => triumph.id)).not.toContain(
      CODEX_COMPLETE_TRIUMPH_ID,
    );
    // Full everywhere but the City: still not complete.
    const noCity = fullCodexProfile({ records: { codexLocations: ['colosseum'] } });
    expect(isCodexComplete(noCity)).toBe(false);
  });
});

describe('A5 §J — the save corpus keeps its rule', () => {
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

  test('§J stays at 22 optional fields, with `records` last', () => {
    const optional = scanOptional(read('types/game.ts'));
    expect(optional.length).toBe(22);
    expect(optional.slice(-2)).toEqual(['spared', 'records']);
    // The Codex's field is NESTED inside records, never a top-level one (R6).
    expect(optional).not.toContain('codexLocations');
  });

  test('the records-era fixture carries codexLocations inside records', () => {
    const fixture = SAVE_FIXTURES.find((entry) => entry.id === 'records-era');
    expect(fixture).toBeDefined();
    const raw = read(`utils/saveFixtures/${fixture!.file}`);
    expect(raw).toContain('"codexLocations"');
    expect(read('utils/saveFixtures/index.ts')).toContain('codexLocations');
  });
});

describe('A5 §K — the surfaces and the wiring', () => {
  test('the Codex is a page of the Library rack beside The Road and Triumphs', () => {
    const library = code('components/hub/LibraryTab.tsx');
    expect(library).toContain("{ id: 'codex', label: 'Codex' }");
    expect(library).toContain("import { CodexPage } from './CodexPage'");
    expect(library).toContain("page === 'codex' && <CodexPage profile={profile} />");
    // The page sits beside Triumphs — no new StatsTab button was added.
    expect(code('components/hub/StatsTab.tsx')).not.toContain('Codex');
    // The Codex view writes nothing.
    const page = code('components/hub/CodexPage.tsx');
    expect(page).not.toContain('saveProfile');
    expect(page).not.toContain('applyTriumphAwards');
  });

  /**
   * STORY-5b — REBASED, NOT WEAKENED.  A5 pinned "no Fragments page" because none
   * existed: an empty shell would have advertised unbuilt story.  The page now
   * exists and is gated on the Librarian chain (§F of `librarianChain.test.ts`
   * pins both halves — absent before the chain, SEALED rows after it), so the
   * property A5 was protecting is unchanged and the remaining pins are the two
   * sections that are still deliberately absent.
   */
  test('no horse tiers and no best-hype column', () => {
    for (const path of ['utils/codex.ts', 'components/hub/CodexPage.tsx']) {
      const source = code(path).toLowerCase();
      expect(source).not.toContain('horse tier');
      expect(source).not.toContain('best hype');
      expect(source).not.toContain('best-hype');
    }
  });

  test('the Fragments page is gated, never an empty shell', () => {
    const fresh = buildCodex(createNewProfile('Codex Tester'));
    expect(fresh.fragments).toBeUndefined();
    expect(fresh.pages.map((page) => page.id)).toEqual([
      'gladiators',
      'bosses',
      'horses',
      'arms',
      'city',
    ]);
  });

  test('the ONE Codex write rides the existing hub interaction and App\'s save pair', () => {
    const city = code('components/3d/city/CityHubScene.tsx');
    expect(city).toContain('onVisitLocation?.(nearbyLoc.id)');
    const app = code('App.tsx');
    expect((app.match(/withCodexLocation\(/g) ?? []).length).toBe(1);
    expect(app).toContain('const visited = withCodexLocation(profile, locationId);');
    expect(app).toContain('if (visited === profile) return;');
    expect(app).toContain('saveProfile(visited);');
    expect(app).toContain('onVisitLocation={handleVisitLocation}');
    // The codex module itself never touches storage or the clock.
    const module = code('utils/codex.ts');
    expect(module).not.toContain('localStorage');
    expect(module).not.toContain('saveProfile');
    expect(module).not.toContain('Date');
    expect(module).not.toContain('Math.random');
    expect(module).not.toContain('combatCalculations');
  });
});
