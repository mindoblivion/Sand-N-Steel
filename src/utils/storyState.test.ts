/**
 * STORY-1 — the campaign's state (`src/utils/storyState.ts`, `src/utils/rank.ts`)
 * and the campaign card (`src/components/hub/CampaignCard.tsx`).
 *
 * ── THE RULES THIS SUITE PINS ──────────────────────────────────────────────
 * The chapter is DERIVED from the record and never stored: the current chapter
 * is the FIRST chapter that still has an unmet gate, a chapter is CLOSED once
 * every gate whose evidence can exist is met, and a gate whose owning system has
 * not landed is `'pending'` rather than `'unmet'`.  Two consequences are
 * asserted here directly, because they are the two the design turns on:
 *   • pending gates do not hold the campaign shut — they leave the chapter
 *     closable on its available evidence, which is what makes Chapter 7 (and the
 *     card's Legend state) reachable while the race and omen systems are
 *     unlanded; and
 *   • the Oath gate is met by the grandfather rule (`fightsWon > 0`) as well as
 *     by a `road.oathSworn === true` field, so a legacy save resolves as
 *     oath-sworn.
 *
 * ── STORY-2 CHANGED ONE GATE'S STATE, NOT THE RULES ────────────────────────
 * The chapter-one `doctore-test` gate used to be `'pending'` because its owning
 * system had not landed.  STORY-2 lands the Doctore's Test, so the gate is now
 * read off real evidence — the yard champion's id in the record AND
 * `story.doctoreTestPassed` — and a record that has not taken the Test waits in
 * Chapter 1.  The two rules above are unchanged; the fixtures below carry that
 * evidence the way the victory write does (`withDoctoreTest`), so every boundary
 * assertion still measures the boundary it names.
 *
 * ── STORY-3 CHANGED WHICH GATES HOLD A CHAPTER SHUT ────────────────────────
 * Chapter 2 ("Fortuna's Coin, the Second Sand") refuses to close on duels alone:
 * its District race gate must be MET, not merely unlanded, so `holdsChapterOpen`
 * is the one rule that overrides "pending never holds a chapter shut" — and it is
 * on exactly one gate in the whole table (§G5 asserts that).  The race system's
 * results write has not landed, so the campaign is HELD at Chapter 2 by design
 * (the Director's ruling of record, and the documented deferral).  Consequences
 * this suite now measures rather than assumes:
 *   • a profile that has beaten Goliath resolves to Chapter 2, not Chapter 3
 *     (§B4), and a record that has met every other chapter's gates stops there
 *     too (§B6, §B9);
 *   • the card's Legend state is therefore unreachable until that gate has
 *     evidence (§F), which is a property of the build, not a lost assertion; and
 *   • chapters 3-7 stay covered through `resolveChapterGates(profile, chapter)`
 *     — the same table, the same evidence, addressed per chapter (§B5-§B9, §G).
 * Chapter 2's omen gate is the other change: Pitch A1's shrine landed, so Beat 3
 * reads STATE (a live omen or the once-ever decline marker) instead of pending.
 *
 * ── WHAT IS *NOT* ASSERTED HERE ────────────────────────────────────────────
 * Nothing about rendering beyond the card's own static markup, and nothing about
 * a save: this suite never calls a save writer, never touches `localStorage` and
 * never reads the browser's or the cloud's save.  §E asserts that property of the
 * shipped sources.
 *
 * Run with: bun test src/utils/storyState.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PlayerProfile } from '../types/game';
import { ALL_OPPONENTS } from '../data/opponents';
import { createNewProfile } from '../services/storage';
import { RANK_ORDER, RANK_THRESHOLDS, deriveRank, rankAtLeast } from './rank';
import {
  LEGEND_LINE,
  PENDING_GATE_LINES,
  STORY_CHAPTERS,
  STORY_FINAL_CHAPTER,
  resolveChapterGates,
  resolveStoryState,
  storyGateLine,
} from './storyState';
import { CampaignCard } from '../components/hub/CampaignCard';
import { DOCTORE_TEST_OPPONENT_ID } from './storyBeats';

// ── Sources (§E) ──────────────────────────────────────────────────────────
const moduleSource = readFileSync(new URL('./storyState.ts', import.meta.url), 'utf8');
const rankSource = readFileSync(new URL('./rank.ts', import.meta.url), 'utf8');
const cardSource = readFileSync(new URL('../components/hub/CampaignCard.tsx', import.meta.url), 'utf8');
/** Comments stripped, so no assertion here can be satisfied by prose. */
const codeOf = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

// ── Fixtures ──────────────────────────────────────────────────────────────
/** The roster's own boss of a tier — never a restated id. */
const bossId = (tier: number): string => {
  const boss = ALL_OPPONENTS.find((opponent) => opponent.tier === tier && opponent.isBoss === true);
  if (!boss) throw new Error(`no boss in tier ${tier}`);
  return boss.id;
};
/** The roster's short name for that boss, the way the card prints it. */
const bossShortName = (tier: number): string => {
  const boss = ALL_OPPONENTS.find((opponent) => opponent.tier === tier && opponent.isBoss === true);
  if (!boss) throw new Error(`no boss in tier ${tier}`);
  return boss.name.split(' the ')[0].trim();
};

const fresh = (): PlayerProfile => createNewProfile('Tester');

/** A legacy save: wins recorded before the campaign's own fields existed. */
const legacy = (fightsWon: number): PlayerProfile => ({ ...fresh(), fightsWon });

/**
 * STORY-2 — the Doctore's Test's evidence, written the way the duel's victory
 * write writes it: the yard champion's id in the record AND the pass flag in the
 * lazy `story` object.  Chapter 1's gate reads both, so a fixture that means
 * "past Chapter 1" has to carry both.
 */
const withDoctoreTest = (profile: PlayerProfile): PlayerProfile => ({
  ...profile,
  defeatedOpponentIds: profile.defeatedOpponentIds.includes(DOCTORE_TEST_OPPONENT_ID)
    ? profile.defeatedOpponentIds
    : [...profile.defeatedOpponentIds, DOCTORE_TEST_OPPONENT_ID],
  story: { ...(profile.story ?? {}), doctoreTestPassed: true },
});

/** Merge a story patch into the profile's stored story, keeping its other flags. */
const withStory = (
  profile: PlayerProfile,
  story: NonNullable<PlayerProfile['story']>
): PlayerProfile => ({ ...profile, story: { ...(profile.story ?? {}), ...story } });

/** A mid-campaign record that has beaten the bosses it has met. */
const campaign = (overrides: Partial<PlayerProfile>): PlayerProfile => ({
  ...fresh(),
  fightsWon: 6,
  ...overrides,
});

const midCampaign = (tier: number, fame: number): Partial<PlayerProfile> => ({
  currentTier: tier,
  fame,
  defeatedOpponentIds: [bossId(1), ...(tier >= 2 ? [bossId(2)] : [])],
});

const gateOf = (profile: PlayerProfile, id: string) => {
  const state = resolveStoryState(profile);
  const gate = state.gates.find((entry) => entry.id === id);
  if (!gate) throw new Error(`gate ${id} is not on the current chapter (${state.chapter})`);
  return gate;
};

/** Decode the markup's entities so a test can quote the authored words. */
const text = (markup: string): string =>
  markup
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const markupFor = (profile: PlayerProfile): string =>
  renderToStaticMarkup(React.createElement(CampaignCard, { profile }));

// ── §A `deriveRank` and its thresholds ────────────────────────────────────
describe('§A the derived rank', () => {
  test('a fresh profile is a Rookie', () => {
    expect(deriveRank(fresh())).toBe('Rookie');
  });

  test('Veteran needs BOTH 150 fame and Tier 2', () => {
    const { fame, currentTier } = RANK_THRESHOLDS.veteran;
    expect(deriveRank(campaign({ fame, currentTier }))).toBe('Veteran');
    expect(deriveRank(campaign({ fame, currentTier: currentTier - 1 }))).toBe('Rookie');
    expect(deriveRank(campaign({ fame: fame - 1, currentTier }))).toBe('Rookie');
  });

  test('Champion needs BOTH 600 fame and Tier 3 — and is tested AFTER Legend', () => {
    const { fame, currentTier } = RANK_THRESHOLDS.champion;
    expect(deriveRank(campaign({ fame, currentTier }))).toBe('Champion');
    expect(deriveRank(campaign({ fame, currentTier: currentTier - 1 }))).toBe('Veteran');
    expect(deriveRank(campaign({ fame: fame - 1, currentTier }))).toBe('Veteran');
    // 1,500 fame without the Tier-4 boss is still a Champion, not a Legend.
    expect(deriveRank(campaign({ fame: RANK_THRESHOLDS.legend.fame, currentTier }))).toBe('Champion');
  });

  test('Legend needs 1,500 fame AND a Tier-4 boss in the record', () => {
    const legend = campaign({
      fame: RANK_THRESHOLDS.legend.fame,
      currentTier: RANK_THRESHOLDS.legend.currentTier,
      defeatedOpponentIds: [bossId(4)],
    });
    expect(deriveRank(legend)).toBe('Legend');
    expect(
      deriveRank({ ...legend, defeatedOpponentIds: [bossId(1), bossId(2), bossId(3)] })
    ).toBe('Champion');
  });

  test('the stored `rank` field is ignored, not read', () => {
    // `rank` is a `PlayerProfile` field, not a `RankInput` one, so the fixture is
    // asserted back to the profile type while it carries the stale stored field.
    expect(deriveRank({ ...fresh(), rank: 'Legend' } as PlayerProfile)).toBe('Rookie');
    // Reading the stored field would be a `.rank` access; the module has none.
    expect(rankSource).not.toMatch(/\.rank\b/);
    // …and writing one would be an object-literal key.  The pattern anchors on a
    // `{` or a `,` so it cannot be satisfied by `rankAtLeast`'s own parameter
    // declaration (`rank: GladiatorRank,`) — that is a rank VALUE, not the stored
    // field this test is about.
    expect(codeOf(rankSource)).not.toMatch(/[{,]\s*rank\s*:/);
  });

  test('`rankAtLeast` orders the four ranks', () => {
    expect(RANK_ORDER).toEqual(['Rookie', 'Veteran', 'Champion', 'Legend']);
    expect(rankAtLeast('Veteran', 'Veteran')).toBe(true);
    expect(rankAtLeast('Rookie', 'Veteran')).toBe(false);
    expect(rankAtLeast('Legend', 'Champion')).toBe(true);
  });

  test('a missing, partial or malformed profile is a Rookie, never a throw', () => {
    expect(deriveRank(null)).toBe('Rookie');
    expect(deriveRank(undefined)).toBe('Rookie');
    expect(deriveRank({} as PlayerProfile)).toBe('Rookie');
    expect(
      deriveRank({
        ...fresh(),
        fame: 'lots',
        currentTier: Number.NaN,
        defeatedOpponentIds: 'none',
      } as unknown as PlayerProfile)
    ).toBe('Rookie');
  });
});

// ── §B every chapter boundary reachable on today's evidence ───────────────
describe('§B the chapter boundaries', () => {
  test('B1 — a fresh profile is in Chapter 0 with its Oath gate unmet', () => {
    const state = resolveStoryState(fresh());
    expect(state.chapter).toBe(0);
    expect(state.title).toBe('Bought at Dawn');
    expect(state.complete).toBe(false);
    expect(state.gates.map((gate) => gate.id)).toEqual(['oath-sworn']);
    expect(state.gates[0].state).toBe('unmet');
    expect(storyGateLine(state.gates[0])).toBe('Swear the oath of the ludus');
  });

  test('B2 — a grandfathered profile resolves as oath-sworn, closing Chapter 0', () => {
    // Chapter 0's gate is met by the grandfather rule (fightsWon > 0), so the
    // first chapter with an unmet gate is Chapter 1 — which is the statement
    // "Chapter 0 closed".  STORY-2 made Chapter 1's Test gate real, so a legacy
    // record waits there until it takes the Test (B3).
    const state = resolveStoryState(legacy(3));
    expect(state.chapter).toBe(1);
    // A record with no wins at all is held at Chapter 0 (B1), so it is the
    // grandfather rule — not the chapter table — that moves a legacy save on.
    expect(resolveStoryState(fresh()).chapter).toBe(0);
    const oneWin = resolveStoryState(legacy(1));
    expect(oneWin.chapter).toBe(1);
    expect(oneWin.gates.map((gate) => gate.id)).toEqual(['first-duel-won', 'doctore-test']);
    // With the Test's evidence as well, the first chapter with an unmet gate is 2.
    const tested = resolveStoryState(withDoctoreTest(legacy(1)));
    expect(tested.chapter).toBe(2);
    expect(tested.gates.map((gate) => gate.id)).toEqual(['tier-1-boss', 'district-race', 'omen']);
  });

  test("B2b — a `road.oathSworn` field closes Chapter 0 too, and a malformed `road` does not", () => {
    const sworn = { ...fresh(), road: { oathSworn: true } } as unknown as PlayerProfile;
    expect(resolveStoryState(sworn).chapter).toBe(1);
    for (const road of [{ oathSworn: 'yes' }, { oathSworn: false }, 'sworn', [true], null]) {
      const profile = { ...fresh(), road } as unknown as PlayerProfile;
      expect(resolveStoryState(profile).chapter).toBe(0);
    }
  });

  test("B3 — the first win and the Doctore's Test close Chapter 1 and put Chapter 2 in front of the player", () => {
    // The first win meets one half of Chapter 1; STORY-2's Test is the other.
    const firstWin = resolveStoryState(legacy(1));
    expect(firstWin.chapter).toBe(1);
    expect(gateOf(legacy(1), 'first-duel-won').state).toBe('met');
    expect(gateOf(legacy(1), 'doctore-test').state).toBe('unmet');
    expect(storyGateLine(gateOf(legacy(1), 'doctore-test'))).toBe(
      "Pass the Doctore's test under the restricted rules"
    );

    const tested = withDoctoreTest(legacy(1));
    const state = resolveStoryState(tested);
    expect(state.chapter).toBe(2);
    expect(state.title).toBe("Fortuna's Coin, the Second Sand");
    expect(gateOf(tested, 'tier-1-boss').state).toBe('unmet');
    expect(gateOf(tested, 'district-race').state).toBe('pending');
    // STORY-3 — the omen's owning system has landed (Pitch A1's shrine), so Beat
    // 3's gate reads evidence and asks for the reading in its own words.
    expect(gateOf(tested, 'omen').state).toBe('unmet');
    expect(storyGateLine(gateOf(tested, 'tier-1-boss'))).toBe(`Defeat ${bossShortName(1)}`);
    expect(storyGateLine(gateOf(tested, 'district-race'))).toBe(PENDING_GATE_LINES.race);
    expect(storyGateLine(gateOf(tested, 'omen'))).toBe('Face the reading of the omen');
  });

  test("B4 — Goliath down: Chapter 2's duel gate is met and the chapter is HELD open by its race gate", () => {
    const tested = withDoctoreTest(legacy(2));
    // Chapter 2 is in front of the player, and its duel gate is the one unmet gate.
    expect(resolveStoryState(tested).chapter).toBe(2);
    expect(gateOf(tested, 'tier-1-boss').state).toBe('unmet');
    expect(storyGateLine(gateOf(tested, 'tier-1-boss'))).toBe(`Defeat ${bossShortName(1)}`);

    const goliathDown: PlayerProfile = {
      ...tested,
      defeatedOpponentIds: [...tested.defeatedOpponentIds, bossId(1)],
    };
    // STORY-3 — the duel gate is met and the chapter STILL does not close: its
    // District race gate must be met, not merely unlanded (Director ruling 4).
    const state = resolveStoryState(goliathDown);
    expect(state.chapter).toBe(2);
    expect(state.complete).toBe(false);
    expect(state.gates.map((gate) => gate.id)).toEqual([
      'tier-1-boss',
      'district-race',
      'omen',
    ]);
    expect(state.gates.map((gate) => gate.state)).toEqual(['met', 'pending', 'unmet']);
    expect(gateOf(goliathDown, 'district-race').holdsChapterOpen).toBe(true);
    expect(gateOf(goliathDown, 'tier-1-boss').holdsChapterOpen).toBeUndefined();

    // …and Beat 3 as well: duel AND omen are met, and the chapter still waits on
    // the race.  Nothing else holds it (the omen gate declares no such rule).
    const withOmen: PlayerProfile = {
      ...goliathDown,
      omen: { kind: 'kind', expiresAtBout: 9 },
    };
    const held = resolveStoryState(withOmen);
    expect(held.chapter).toBe(2);
    expect(held.gates.map((gate) => gate.state)).toEqual(['met', 'pending', 'met']);
    expect(held.complete).toBe(false);
    expect(storyGateLine(held.gates[2])).toBe('The omen has been read.');
  });

  test("B5 — Chapter 3's own gates are unchanged, and the campaign is held at Chapter 2", () => {
    const base = withDoctoreTest(campaign(midCampaign(2, 200)));
    const almost = withStory(base, { librarySeen: false });
    // STORY-3 — the chapter the record resolves to is 2 (its race gate is
    // unlanded), so Chapter 3's table is read through the per-chapter seam.
    expect(resolveStoryState(almost).chapter).toBe(2);
    const gates = resolveChapterGates(almost, 3);
    expect(STORY_CHAPTERS[3].title).toBe('The Name in the Records');
    expect(gates.map((gate) => gate.id)).toEqual([
      'rank-veteran',
      'tier-2-boss',
      'district-final',
      'library-seen',
    ]);
    expect(gates.map((gate) => gate.state)).toEqual(['met', 'met', 'pending', 'unmet']);
    expect(storyGateLine(gates[2])).toBe(PENDING_GATE_LINES.race);
    // The library beat is the one gate still unmet, and it is the only one that
    // moves when it is met.
    const done = withStory(base, { librarySeen: true });
    expect(resolveChapterGates(done, 3).map((gate) => gate.state)).toEqual([
      'met',
      'met',
      'pending',
      'met',
    ]);
    // …and each missing piece still holds its own gate back.
    expect(resolveChapterGates({ ...almost, fame: 100, currentTier: 2 }, 3)[0].state).toBe('unmet');
    expect(
      resolveChapterGates(
        {
          ...almost,
          // Without Ignis — the tier-2 boss — in the record, that gate is unmet.
          defeatedOpponentIds: almost.defeatedOpponentIds.filter((id) => id !== bossId(2)),
        },
        3
      )[1].state
    ).toBe('unmet');
  });

  test("B6 — a fully-met record stops at Chapter 2: the Legend state is not claimed without a race", () => {
    const veteran = withDoctoreTest(
      campaign({
        fame: 2000,
        currentTier: 4,
        defeatedOpponentIds: [bossId(1), bossId(2), bossId(3), bossId(4)],
        story: { librarySeen: true, trialDone: true, summitSeen: true, diceEnding: 'cut' },
      })
    );
    const state = resolveStoryState(veteran);
    // The documented deferral (STORY-3): Chapter 2's race gate cannot be met, so
    // the campaign advances no further and the Legend state is not claimed.
    expect(state.chapter).toBe(2);
    expect(state.complete).toBe(false);
    expect(state.gates.map((gate) => gate.state)).toEqual(['met', 'pending', 'unmet']);
    // Chapter 7's own table is still resolved, and this record satisfies it.
    expect(STORY_CHAPTERS[STORY_FINAL_CHAPTER].title).toBe('Legend, and the Open Road');
    expect(resolveChapterGates(veteran, STORY_FINAL_CHAPTER).map((gate) => gate.state)).toEqual([
      'met',
      'pending',
    ]);
  });

  test('B7 — the story flags are the evidence for their own gates', () => {
    // Chapter 4: the dice, once the tier and the rank are there.
    const beforeDice = withDoctoreTest(
      campaign({
        currentTier: 3,
        fame: 700,
        defeatedOpponentIds: [bossId(1), bossId(2)],
        story: { librarySeen: true },
      })
    );
    // STORY-3 — the campaign is held at Chapter 2, so Chapter 4's flags are read
    // on its own table: same definitions, same evidence, per-chapter seam.
    expect(resolveStoryState(beforeDice).chapter).toBe(2);
    const diceGate = (profile: PlayerProfile) =>
      resolveChapterGates(profile, 4).find((gate) => gate.id === 'dice-ending')!;
    expect(diceGate(beforeDice).state).toBe('unmet');
    expect(
      resolveChapterGates(beforeDice, 4).find((gate) => gate.id === 'league-promotion')!.state
    ).toBe('pending');
    const rolled = withStory(beforeDice, { diceEnding: 'refused' });
    // …and the flag is that gate's own evidence: once the dice have fallen the
    // gate is met, and an unknown enum name is not evidence at all.
    expect(diceGate(rolled).state).toBe('met');
    // Deliberately wrong-typed input, so the cast is the point of the fixture.
    const folded = withStory(beforeDice, {
      diceEnding: 'folded',
    } as unknown as NonNullable<PlayerProfile['story']>);
    expect(diceGate(folded).state).toBe('unmet');
  });

  test('B8 — the chapter table is the eight authored chapters, in order', () => {
    expect(STORY_CHAPTERS.map((chapter) => chapter.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(STORY_CHAPTERS.map((chapter) => chapter.title)).toEqual([
      'Bought at Dawn',
      'First Sand',
      "Fortuna's Coin, the Second Sand",
      'The Name in the Records',
      "The Vulture's Wheel",
      'The Northern Trial',
      'The Laurel, Twice',
      'Legend, and the Open Road',
    ]);
    for (const chapter of STORY_CHAPTERS) expect(chapter.beat.length).toBeGreaterThan(20);
  });

  test('B9 — every gate on every chapter is still addressed, and the walk is held at Chapter 2', () => {
    // STORY-3 — the campaign cannot pass Chapter 2 while its race gate is
    // unlanded, so the walk that used to end in the Legend state now asserts the
    // HOLD at every step, plus the property that made the old walk worth having:
    // every chapter's table is still resolved from the same record.
    const steps: PlayerProfile[] = [];
    // The walk starts past Chapter 1, so it carries the Test's evidence and every
    // later step appends to the record it already holds.
    let profile: PlayerProfile = withDoctoreTest(legacy(1));
    // Each step is the evidence one chapter's table asks for, in the campaign's
    // own order — the walk is unchanged; what moved is where it can go.
    profile = { ...profile, defeatedOpponentIds: [...profile.defeatedOpponentIds, bossId(1)] };
    steps.push(profile); // Chapter 2's duel gate
    profile = { ...profile, fame: 200, currentTier: 2 };
    steps.push(profile); // Chapter 3's rank gate
    profile = {
      ...withStory(profile, { librarySeen: true }),
      defeatedOpponentIds: [...profile.defeatedOpponentIds, bossId(2)],
    };
    steps.push(profile); // Chapter 3 closed on its own table
    profile = { ...withStory(profile, { diceEnding: 'cut' }), currentTier: 3, fame: 700 };
    steps.push(profile); // Chapter 4's tier and dice gates
    profile = {
      ...withStory(profile, { trialDone: true }),
      defeatedOpponentIds: [...profile.defeatedOpponentIds, bossId(3)],
    };
    steps.push(profile); // Chapter 5's rank, boss and trial gates
    profile = {
      // Chapter 7's own gate IS the rank, so the walk has to arrive at Legend:
      // 1,500 fame AND a Tier-4 boss in the record.  Without them the chapter
      // resolves as current-but-unclosed, which is what the assertion below caught.
      ...withStory(profile, { summitSeen: true }),
      fame: RANK_THRESHOLDS.legend.fame,
      currentTier: RANK_THRESHOLDS.legend.currentTier,
      defeatedOpponentIds: [...profile.defeatedOpponentIds, bossId(4)],
    }; // Chapter 6's boss and summit gates, plus Chapter 7's rank
    steps.push(profile);
    for (const step of steps) {
      expect(resolveStoryState(step).chapter).toBe(2);
      expect(resolveStoryState(step).complete).toBe(false);
      for (let chapter = 0; chapter <= STORY_FINAL_CHAPTER; chapter += 1) {
        expect(resolveChapterGates(step, chapter).length).toBeGreaterThan(0);
      }
    }
    const finalState = resolveStoryState(profile);
    expect(finalState.gates.map((gate) => gate.state)).toEqual(['met', 'pending', 'unmet']);
    // The last step satisfies every OTHER chapter's table, chapter by chapter.
    expect(resolveChapterGates(profile, STORY_FINAL_CHAPTER).map((gate) => gate.state)).toEqual([
      'met',
      'pending',
    ]);
    // An unknown chapter index is an empty list, never a throw; a missing profile
    // still resolves a chapter's gates from the defaults.
    expect(resolveChapterGates(profile, 99)).toEqual([]);
    expect(resolveChapterGates(null, 3).length).toBe(4);
  });
});

// ── §C malformed input ────────────────────────────────────────────────────
describe('§C malformed input resolves to the defaults', () => {
  test('a missing, partial or non-object `story` field resolves the flags to defaults', () => {
    for (const story of [undefined, null, 'beats', 42, [], true]) {
      const state = resolveStoryState({ ...fresh(), story } as unknown as PlayerProfile);
      expect(state.chapter).toBe(0);
      expect(state.flags).toEqual({
        librarySeen: false,
        doctoreTestPassed: false,
        fragmentsFound: [],
        trialDone: false,
        diceEnding: undefined,
        deserterChoice: undefined,
        summitSeen: false,
      });
    }
  });

  test('wrong-typed subfields and unknown enum names fall back, one by one', () => {
    const junk = {
      librarySeen: 'true',
      fragmentsFound: 'all',
      trialDone: 1,
      diceEnding: 'folded',
      deserterChoice: 'sold',
      summitSeen: null,
    } as unknown as PlayerProfile['story'];
    expect(resolveStoryState({ ...fresh(), story: junk }).flags).toEqual({
      librarySeen: false,
      doctoreTestPassed: false,
      fragmentsFound: [],
      trialDone: false,
      diceEnding: undefined,
      deserterChoice: undefined,
      summitSeen: false,
    });
  });

  test('a partial `story` field keeps the parts it does carry', () => {
    const partial = { librarySeen: true } as PlayerProfile['story'];
    const state = resolveStoryState({ ...fresh(), story: partial });
    expect(state.flags.librarySeen).toBe(true);
    expect(state.flags.trialDone).toBe(false);
  });

  test('`fragmentsFound` keeps only the strings, and never the caller\'s array', () => {
    const stored = ['shard-a', 7, null, 'shard-b'];
    const profile = { ...fresh(), story: { fragmentsFound: stored } } as unknown as PlayerProfile;
    const state = resolveStoryState(profile);
    expect(state.flags.fragmentsFound).toEqual(['shard-a', 'shard-b']);
    expect(state.flags.fragmentsFound).not.toBe(stored);
    expect(stored).toEqual(['shard-a', 7, null, 'shard-b']);
  });

  test('every malformed profile shape resolves rather than throwing', () => {
    const shapes: unknown[] = [
      null,
      undefined,
      {},
      { fightsWon: 'three' },
      { fame: Number.POSITIVE_INFINITY, currentTier: -1, defeatedOpponentIds: 0 },
      { story: new Map(), defeatedOpponentIds: ['opp_marcus', 5] },
      Object.create(null),
    ];
    for (const shape of shapes) {
      const state = resolveStoryState(shape as PlayerProfile);
      expect(state.chapter).toBe(0);
      expect(state.complete).toBe(false);
      expect(state.gates.length).toBeGreaterThan(0);
    }
  });
});

// ── §D purity: the input is read, never written ───────────────────────────
describe('§D the resolver never mutates its input', () => {
  test('a deep-frozen profile resolves without a write', () => {
    const profile = campaign({
      story: { librarySeen: true, fragmentsFound: ['shard-a'], diceEnding: 'cut' },
    });
    const deepFreeze = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      for (const child of Object.values(value)) deepFreeze(child);
      Object.freeze(value);
    };
    deepFreeze(profile);
    expect(() => resolveStoryState(profile)).not.toThrow();
    expect(Object.isFrozen(profile)).toBe(true);
  });

  test('a before/after snapshot of the whole profile is identical', () => {
    const profile = campaign({
      story: { librarySeen: true, trialDone: true, diceEnding: 'refused', summitSeen: true },
    });
    const before = JSON.stringify(profile);
    resolveStoryState(profile);
    resolveStoryState(profile);
    expect(JSON.stringify(profile)).toBe(before);
  });

  test('a legacy profile gains no `story` field by being resolved', () => {
    const profile = legacy(4);
    resolveStoryState(profile);
    expect('story' in profile).toBe(false);
  });
});

// ── §E the slice writes no profile ───────────────────────────────────────
describe('§E zero profile writes', () => {
  test('neither new module names a save path', () => {
    const omensSource = readFileSync(new URL('./omens.ts', import.meta.url), 'utf8');
    for (const source of [
      codeOf(moduleSource),
      codeOf(cardSource),
      codeOf(rankSource),
      codeOf(omensSource),
    ]) {
      expect(source).not.toMatch(/saveProfile|loadSavedProfile|clearProfile|PROFILE_STORAGE_KEY/);
      expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
      expect(source).not.toMatch(/googleDrive|saveToDrive|uploadSave/);
    }
  });

  test('the resolver imports nothing that can write', () => {
    const imports = [...moduleSource.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
    // STORY-3 — `./omens` joined the list: the beat's evidence is read through
    // the omen module's own lazy readers, and that module is pinned below.
    expect(imports).toEqual([
      '../types/game',
      '../data/opponents',
      './storyBeats',
      './omens',
      './rank',
    ]);
    expect([...cardSource.matchAll(/from '([^']+)'/g)].map((match) => match[1])).toEqual([
      'react',
      '../../types/game',
      'lucide-react',
      '../../utils/storyState',
    ]);
  });

  test('the module only ever reads the profile it is handed', () => {
    const code = codeOf(moduleSource);
    // Every profile touch is a read: an optional read, or a destructured read.
    expect(code).toMatch(/profile\?\./);
    expect(code).not.toMatch(/profile\s*\.\s*[A-Za-z_]+\s*=[^=]/);
    expect(code).not.toMatch(/profile\s*\[/);
  });
});

// ── §F the card renders the chapter and the gate words ───────────────────
describe('§F the campaign card', () => {
  test('a fresh profile shows Chapter 0 and its unmet requirement', () => {
    const markup = text(markupFor(fresh()));
    expect(markup).toContain('data-campaign-card');
    expect(markup).toContain('data-chapter="0"');
    expect(markup).toContain('data-campaign-complete="false"');
    expect(markup).toContain('Bought at Dawn');
    expect(markup).toContain(STORY_CHAPTERS[0].beat);
    expect(markup).toContain('Swear the oath of the ludus');
    expect(markup).toContain('data-story-gate="oath-sworn"');
    expect(markup).not.toContain('data-state="met"');
    expect(markup).not.toContain(LEGEND_LINE);
  });

  test('a Goliath-down profile shows the requirement for the fight it has not won', () => {
    const markup = text(markupFor(withDoctoreTest(legacy(1))));
    expect(markup).toContain('data-chapter="2"');
    expect(markup).toContain("Fortuna's Coin, the Second Sand");
    expect(markup).toContain(`Defeat ${bossShortName(1)}`);
    expect(markup).toContain('data-story-gate="tier-1-boss"');
    expect(markup).toContain('data-state="unmet"');
  });

  test('pending gates print the authored pending lines and never their requirement', () => {
    const markup = text(markupFor(withDoctoreTest(legacy(1))));
    expect(markup).toContain(PENDING_GATE_LINES.race);
    expect(markup).toContain('data-state="pending"');
    // STORY-3 — the omen's system has landed, so its gate asks for the reading in
    // its own words; the omen's pending line must never be printed again.
    expect(markup).not.toContain(PENDING_GATE_LINES.omen);
    expect(markup).toContain('Face the reading of the omen');
    // The requirement of the ONE unlanded system is still never printed.
    expect(markup).not.toContain('Finish your first District race');
  });

  test('a met gate prints its confirmation, not its requirement', () => {
    // STORY-3 — the card's chapter is Chapter 2, so the met gates measured here
    // are that chapter's own: Goliath's fall and Beat 3's omen.
    const base = withDoctoreTest(legacy(2));
    const profile: PlayerProfile = {
      ...base,
      defeatedOpponentIds: [...base.defeatedOpponentIds, bossId(1)],
      omenTrickleClaimed: true,
    };
    const markup = text(markupFor(profile));
    expect(markup).toContain(`${bossShortName(1)} has fallen in the sand.`);
    expect(markup).not.toContain(`Defeat ${bossShortName(1)}`);
    expect(markup).toContain('The omen has been read.');
    expect(markup).not.toContain('Face the reading of the omen');
  });

  test("the Legend state is not claimed while Chapter 2's race gate is unlanded", () => {
    // STORY-3 — this is a property of the build, stated rather than assumed: the
    // card reads the Legend line only once every chapter closes, and Chapter 2's
    // race gate holds that open, so a record that has met every OTHER gate still
    // renders Chapter 2.  The line itself is unchanged.
    expect(LEGEND_LINE).toBe('The road is walked. The city is yours to keep walking.');
    const legendProfile = withDoctoreTest(
      campaign({
        fame: 2000,
        currentTier: 4,
        defeatedOpponentIds: [bossId(1), bossId(2), bossId(3), bossId(4)],
        story: { librarySeen: true, trialDone: true, summitSeen: true, diceEnding: 'cut' },
      })
    );
    const markup = text(markupFor(legendProfile));
    expect(markup).toContain('data-chapter="2"');
    expect(markup).toContain('data-campaign-complete="false"');
    expect(markup).not.toContain('data-chapter="7"');
    expect(markup).not.toContain(LEGEND_LINE);
    // …and the resolver still reports a fully-met later chapter where it is asked
    // to, so nothing about chapters 3-7 was lost with the advance.
    expect(resolveChapterGates(legendProfile, STORY_FINAL_CHAPTER)[0].state).toBe('met');
  });

  test('the card renders every gate of its chapter, whatever the chapter', () => {
    for (const profile of [fresh(), legacy(1), campaign(midCampaign(2, 200))]) {
      const state = resolveStoryState(profile);
      const markup = markupFor(profile);
      for (const gate of state.gates) {
        expect(markup).toContain(`data-story-gate="${gate.id}"`);
        expect(markup).toContain(`data-state="${gate.state}"`);
      }
      expect((markup.match(/data-story-gate=/g) ?? []).length).toBe(state.gates.length);
    }
  });
});

// ── §G the story beats: two unlanded, one landed (C-1 / STORY-2) ──────────
describe('§G the story beats', () => {
  /** The profile that stands IN each chapter, so that chapter's gates can be read. */
  const chapterOne = (): PlayerProfile => ({ ...fresh(), road: { oathSworn: true } });
  const chapterFour = (): PlayerProfile =>
    withDoctoreTest(
      campaign({
        currentTier: 3,
        fame: 700,
        defeatedOpponentIds: [bossId(1), bossId(2)],
        story: { librarySeen: true },
      })
    );
  const chapterSeven = (): PlayerProfile =>
    withDoctoreTest(
      campaign({
        fame: 2000,
        currentTier: 4,
        defeatedOpponentIds: [bossId(1), bossId(2), bossId(3), bossId(4)],
        story: { librarySeen: true, trialDone: true, summitSeen: true, diceEnding: 'cut' },
      })
    );

  const BEAT_GATES = [
    { chapter: 4, id: 'vexus-race', requirement: 'Run the Vexus incident race' },
    { chapter: 7, id: 'statue-ceremony', requirement: 'See the statue ceremony played' },
  ] as const;

  const views = () => [chapterFour(), chapterSeven()];

  test("G1 — each unlanded beat gate is on its chapter, kind 'beat', state 'pending'", () => {
    const profiles = views();
    for (const [index, entry] of BEAT_GATES.entries()) {
      // STORY-3 — the campaign is held at Chapter 2, so a chapter's own table is
      // read through the per-chapter seam instead of by walking a record into it.
      const state = resolveChapterGates(profiles[index], entry.chapter);
      const gate = state.find((candidate) => candidate.id === entry.id);
      expect(gate).toBeDefined();
      expect(gate?.pendingKind).toBe('beat');
      expect(gate?.state).toBe('pending');
      expect(gate?.requirement).toBe(entry.requirement);
    }
  });

  test('G2 — the beat pending line is the authored one, through storyGateLine', () => {
    expect(PENDING_GATE_LINES.beat).toBe('That hour has not been written yet.');
    const profiles = views();
    for (const [index, entry] of BEAT_GATES.entries()) {
      const gate = resolveChapterGates(profiles[index], entry.chapter).find(
        (candidate) => candidate.id === entry.id
      );
      expect(gate).toBeDefined();
      expect(storyGateLine(gate!)).toBe(PENDING_GATE_LINES.beat);
    }
    // …and the card never prints an unlanded beat's requirement.  STORY-3: the
    // card holds Chapter 2, whose one pending gate is the race's, so the beat's
    // line and the Vexus requirement are both absent from it.
    const markup = text(markupFor(chapterFour()));
    expect(markup).toContain('data-chapter="2"');
    expect(markup).toContain('data-state="pending"');
    expect(markup).toContain(PENDING_GATE_LINES.race);
    expect(markup).not.toContain(PENDING_GATE_LINES.beat);
    expect(markup).not.toContain('Run the Vexus incident race');
  });

  test("G3 — STORY-2 landed the third beat: Chapter 1's Test gate reads evidence, not pending", () => {
    // The gate the table always carried is now real: no pending kind, and unmet on
    // a record that has only won a duel.
    const firstWin = legacy(1);
    const gate = gateOf(firstWin, 'doctore-test');
    expect(gate.pendingKind).toBeUndefined();
    expect(gate.state).toBe('unmet');
    // The id alone is not a pass — every win records it — and neither is the flag.
    const plainWin: PlayerProfile = {
      ...firstWin,
      defeatedOpponentIds: [DOCTORE_TEST_OPPONENT_ID],
    };
    expect(gateOf(plainWin, 'doctore-test').state).toBe('unmet');
    expect(gateOf(withStory(firstWin, { doctoreTestPassed: true }), 'doctore-test').state).toBe(
      'unmet'
    );
    // Both together are the evidence, and they close the chapter.
    expect(resolveStoryState(withDoctoreTest(firstWin)).chapter).toBe(2);
  });

  test('G4 — a profile meeting every available gate closes Chapter 1, and Chapter 2 holds it', () => {
    // Chapter 1: the first win and the Test are met and no beat is pending.
    expect(resolveStoryState(withDoctoreTest(legacy(1))).chapter).toBe(2);
    // Chapter 4: Tier 3 and the dice are met and the Vexus race is pending, so
    // that chapter has no unmet gate — and the record is still held at Chapter 2.
    const four = withStory(chapterFour(), { diceEnding: 'cut' });
    expect(resolveChapterGates(four, 4).map((gate) => gate.state)).toEqual([
      'met',
      'pending',
      'pending',
      'met',
    ]);
    expect(resolveStoryState(four).chapter).toBe(2);
    // Chapter 7: Legend is met and the statue ceremony is pending.
    expect(resolveChapterGates(chapterSeven(), STORY_FINAL_CHAPTER).map((gate) => gate.state))
      .toEqual(['met', 'pending']);
    expect(resolveStoryState(chapterSeven()).complete).toBe(false);
  });

  test('G5 — a pending gate never holds a chapter shut, except the one that declares it must be met', () => {
    for (const profile of views()) {
      for (const gate of [
        ...resolveChapterGates(profile, 4),
        ...resolveChapterGates(profile, STORY_FINAL_CHAPTER),
      ]) {
        if (gate.pendingKind) expect(gate.state).toBe('pending');
      }
    }
    // STORY-3 — exactly ONE gate in the whole table declares that it must be met,
    // and it is Chapter 2's District race.  Every other pending gate is inert.
    const declaring: string[] = [];
    for (let chapter = 0; chapter <= STORY_FINAL_CHAPTER; chapter += 1) {
      for (const gate of resolveChapterGates(fresh(), chapter)) {
        if (gate.holdsChapterOpen) declaring.push(`${chapter}:${gate.id}`);
      }
    }
    expect(declaring).toEqual(['2:district-race']);
    // The unlanded beats add no field and no writer: a fresh profile is still Chapter 0.
    expect(resolveStoryState(fresh()).chapter).toBe(0);
    expect(resolveStoryState(fresh()).complete).toBe(false);
    // A chapter without its available evidence still stays open, beat or no beat.
    expect(resolveStoryState(chapterOne()).chapter).toBe(1);
    // Chapter 4's own table still has an unmet gate — the dice — and that gate,
    // not the pending pair beside it, is what would hold that chapter open.
    const four = resolveChapterGates(chapterFour(), 4);
    expect(four.map((gate) => gate.state)).toEqual(['met', 'pending', 'pending', 'unmet']);
    expect(resolveStoryState(chapterFour()).chapter).toBe(2);
  });
});
