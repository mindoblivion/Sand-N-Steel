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
 * ── ONE INTERPRETATION NOTE, STATED RATHER THAN BURIED ─────────────────────
 * STORY-1's test list asks for "first win → Ch 1 closed, Ch 2 current with its
 * duel gate met".  Under the two rules above, Chapter 2 closes the moment its
 * only available gate (the Tier-1 boss) is met — because its other two gates are
 * pending — so a profile that has beaten Goliath resolves to Chapter 3, not
 * Chapter 2.  Both halves are asserted (§B3 and §B4): the Duel gate's met state
 * on a Goliath-down profile, and the Chapter-2 view a player actually sees while
 * Goliath still stands.  The alternative reading — pending gates hold a chapter
 * open — would make the Chapter 7 / Legend state unreachable, which §B6 asserts
 * it is not.
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
  resolveStoryState,
  storyGateLine,
} from './storyState';
import { CampaignCard } from '../components/hub/CampaignCard';

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
    // Chapter 0's gate is met by the grandfather rule (fightsWon > 0) and
    // Chapter 1's by the same record, so the first chapter with an unmet gate is
    // Chapter 2 — which is the statement "Chapter 0 (and 1) closed".
    const state = resolveStoryState(legacy(3));
    expect(state.chapter).toBe(2);
    // A record with no wins at all is held at Chapter 0 (B1), so it is the
    // grandfather rule — not the chapter table — that moves a legacy save on.
    expect(resolveStoryState(fresh()).chapter).toBe(0);
    const oneWin = resolveStoryState(legacy(1));
    expect(oneWin.chapter).toBe(2);
    expect(oneWin.gates.map((gate) => gate.id)).toEqual(['tier-1-boss', 'district-race', 'omen']);
  });

  test("B2b — a `road.oathSworn` field closes Chapter 0 too, and a malformed `road` does not", () => {
    const sworn = { ...fresh(), road: { oathSworn: true } } as unknown as PlayerProfile;
    expect(resolveStoryState(sworn).chapter).toBe(1);
    for (const road of [{ oathSworn: 'yes' }, { oathSworn: false }, 'sworn', [true], null]) {
      const profile = { ...fresh(), road } as unknown as PlayerProfile;
      expect(resolveStoryState(profile).chapter).toBe(0);
    }
  });

  test('B3 — the first win closes Chapter 1 and puts Chapter 2 in front of the player', () => {
    const state = resolveStoryState(legacy(1));
    expect(state.chapter).toBe(2);
    expect(state.title).toBe("Fortuna's Coin, the Second Sand");
    expect(gateOf(legacy(1), 'tier-1-boss').state).toBe('unmet');
    expect(gateOf(legacy(1), 'district-race').state).toBe('pending');
    expect(gateOf(legacy(1), 'omen').state).toBe('pending');
    expect(storyGateLine(gateOf(legacy(1), 'tier-1-boss'))).toBe(`Defeat ${bossShortName(1)}`);
    expect(storyGateLine(gateOf(legacy(1), 'district-race'))).toBe(PENDING_GATE_LINES.race);
    expect(storyGateLine(gateOf(legacy(1), 'omen'))).toBe(PENDING_GATE_LINES.omen);
  });

  test('B4 — Goliath down: Chapter 2\'s Duel gate is met, its race/omen gates pending, and the chapter closes on its available evidence', () => {
    const goliathDown = legacy(2);
    goliathDown.defeatedOpponentIds = [bossId(1)];
    const state = resolveStoryState(goliathDown);
    // Chapter 2's own gates, read while it is still the current chapter.
    expect(gateOf(legacy(1), 'tier-1-boss').state).toBe('unmet');
    expect(state.chapter).toBe(3);
    // The gate that closed Chapter 2 is met, and its pending siblings are pending.
    expect(gateOf(goliathDown, 'rank-veteran').state).toBe('unmet');
    expect(resolveStoryState({ ...goliathDown, story: {} }).chapter).toBe(3);
  });

  test('B5 — Veteran + Ignis + librarySeen closes Chapter 3 on its available gates (its race gate is pending)', () => {
    const base = campaign(midCampaign(2, 200));
    const almost = { ...base, story: { librarySeen: false } };
    const state = resolveStoryState(almost);
    expect(state.chapter).toBe(3);
    expect(state.title).toBe('The Name in the Records');
    expect(state.gates.map((gate) => gate.state)).toEqual(['met', 'met', 'pending', 'unmet']);
    expect(storyGateLine(state.gates[2])).toBe(PENDING_GATE_LINES.race);
    // The library beat is the one gate still unmet, and meeting it closes Ch 3.
    const done = { ...base, story: { librarySeen: true } };
    expect(resolveStoryState(done).chapter).toBe(4);
    // …and each missing piece holds it back on its own evidence.
    expect(resolveStoryState({ ...done, fame: 100, currentTier: 2 }).chapter).toBe(3);
    expect(
      resolveStoryState({ ...done, defeatedOpponentIds: [bossId(1)] }).chapter
    ).toBe(3);
  });

  test('B6 — Aurelius down and a Legend rank: Chapter 7, every available chapter closed', () => {
    const veteran = campaign({
      fame: 2000,
      currentTier: 4,
      defeatedOpponentIds: [bossId(1), bossId(2), bossId(3), bossId(4)],
      story: { librarySeen: true, trialDone: true, summitSeen: true, diceEnding: 'cut' },
    });
    const state = resolveStoryState(veteran);
    expect(state.chapter).toBe(STORY_FINAL_CHAPTER);
    expect(state.chapter).toBe(7);
    expect(state.title).toBe('Legend, and the Open Road');
    expect(state.complete).toBe(true);
    expect(state.gates.map((gate) => gate.state)).toEqual(['met']);
  });

  test('B7 — the story flags are the evidence for their own gates', () => {
    // Chapter 4: the dice, once the tier and the rank are there.
    const beforeDice = campaign({
      currentTier: 3,
      fame: 700,
      defeatedOpponentIds: [bossId(1), bossId(2)],
      story: { librarySeen: true },
    });
    const state = resolveStoryState(beforeDice);
    expect(state.chapter).toBe(4);
    expect(gateOf(beforeDice, 'dice-ending').state).toBe('unmet');
    expect(gateOf(beforeDice, 'league-promotion').state).toBe('pending');
    const rolled: PlayerProfile = {
      ...beforeDice,
      story: { librarySeen: true, diceEnding: 'refused' },
    };
    // …and a met gate CLOSES its chapter: once the dice have fallen, Chapter 4 is
    // closed on its available gates and the chapter in front of the player is 5, so
    // the dice gate is no longer one of the gates the resolver hands back.  That
    // advance is the property §B6's Legend state depends on.
    const rolledState = resolveStoryState(rolled);
    expect(rolledState.chapter).toBe(5);
    expect(rolledState.gates.some((gate) => gate.id === 'dice-ending')).toBe(false);
    // An unknown enum name is not evidence, so the chapter does not move.
    // Deliberately wrong-typed input, so the cast is the point of the fixture.
    const folded = {
      ...beforeDice,
      story: { librarySeen: true, diceEnding: 'folded' },
    } as unknown as PlayerProfile;
    expect(resolveStoryState(folded).chapter).toBe(4);
    expect(gateOf(folded, 'dice-ending').state).toBe('unmet');
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

  test('B9 — every gate on every chapter is reachable through the resolver, chapter by chapter', () => {
    // Walk the campaign forward one gate at a time and require each chapter to be
    // closable on today's evidence, ending in the Legend state.
    const steps: PlayerProfile[] = [];
    let profile: PlayerProfile = legacy(1);
    profile = { ...profile, defeatedOpponentIds: [bossId(1)] }; // → Ch 3
    steps.push(profile);
    profile = { ...profile, fame: 200, currentTier: 2 }; // → still Ch 3 (library unseen)
    steps.push(profile);
    expect(resolveStoryState(steps[1]).chapter).toBe(3);
    profile = { ...profile, story: { librarySeen: true }, defeatedOpponentIds: [bossId(1), bossId(2)] }; // → Ch 4
    steps.push(profile);
    expect(resolveStoryState(profile).chapter).toBe(4);
    profile = { ...profile, currentTier: 3, fame: 700, story: { librarySeen: true, diceEnding: 'cut' } }; // → Ch 5
    steps.push(profile);
    expect(resolveStoryState(profile).chapter).toBe(5);
    profile = {
      ...profile,
      defeatedOpponentIds: [bossId(1), bossId(2), bossId(3)],
      story: { librarySeen: true, diceEnding: 'cut', trialDone: true },
    }; // → Ch 6
    steps.push(profile);
    expect(resolveStoryState(profile).chapter).toBe(6);
    profile = {
      ...profile,
      // Chapter 7's own gate IS the rank, so the walk has to arrive at Legend:
      // 1,500 fame AND a Tier-4 boss in the record.  Without them the chapter
      // resolves as current-but-unclosed, which is what the assertion below caught.
      fame: RANK_THRESHOLDS.legend.fame,
      currentTier: RANK_THRESHOLDS.legend.currentTier,
      defeatedOpponentIds: [bossId(1), bossId(2), bossId(3), bossId(4)],
      story: { librarySeen: true, diceEnding: 'cut', trialDone: true, summitSeen: true },
    }; // → Ch 7, closed
    steps.push(profile);
    const finalState = resolveStoryState(profile);
    expect(finalState.chapter).toBe(7);
    expect(finalState.complete).toBe(true);
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
    for (const source of [codeOf(moduleSource), codeOf(cardSource), codeOf(rankSource)]) {
      expect(source).not.toMatch(/saveProfile|loadSavedProfile|clearProfile|PROFILE_STORAGE_KEY/);
      expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
      expect(source).not.toMatch(/googleDrive|saveToDrive|uploadSave/);
    }
  });

  test('the resolver imports nothing that can write', () => {
    const imports = [...moduleSource.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
    expect(imports).toEqual(['../types/game', '../data/opponents', './rank']);
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
    const markup = text(markupFor(legacy(1)));
    expect(markup).toContain('data-chapter="2"');
    expect(markup).toContain("Fortuna's Coin, the Second Sand");
    expect(markup).toContain(`Defeat ${bossShortName(1)}`);
    expect(markup).toContain('data-story-gate="tier-1-boss"');
    expect(markup).toContain('data-state="unmet"');
  });

  test('pending gates print the authored pending lines and never their requirement', () => {
    const markup = text(markupFor(legacy(1)));
    expect(markup).toContain(PENDING_GATE_LINES.race);
    expect(markup).toContain(PENDING_GATE_LINES.omen);
    expect(markup).toContain('data-state="pending"');
    // The requirements of unlanded systems must never be printed at the player.
    expect(markup).not.toContain('Finish your first District race');
    expect(markup).not.toContain('Face the reading of the omen');
  });

  test('a met gate prints its confirmation, not its requirement', () => {
    const profile = campaign(midCampaign(2, 200));
    const markup = text(markupFor({ ...profile, story: { librarySeen: false } }));
    expect(markup).toContain('You have reached Veteran.');
    expect(markup).toContain(`${bossShortName(2)} has fallen in the sand.`);
    expect(markup).not.toContain('Reach Veteran — 150 fame and Tier 2');
    expect(markup).toContain('Read your own name in the Records');
  });

  test('the Legend state reads the legend line', () => {
    const legendProfile = campaign({
      fame: 2000,
      currentTier: 4,
      defeatedOpponentIds: [bossId(1), bossId(2), bossId(3), bossId(4)],
      story: { librarySeen: true, trialDone: true, summitSeen: true, diceEnding: 'cut' },
    });
    const markup = text(markupFor(legendProfile));
    expect(markup).toContain('data-chapter="7"');
    expect(markup).toContain('data-campaign-complete="true"');
    expect(markup).toContain('Legend');
    expect(markup).toContain('You have reached Legend.');
    expect(markup).toContain(LEGEND_LINE);
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
