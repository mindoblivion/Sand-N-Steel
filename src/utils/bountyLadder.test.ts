/**
 * STORY-4b — THE DESERTER'S PRICE, pinned.
 *
 * Every rule the brief names is asserted against the shipped module and the
 * shipped roster: the ladder's order and payouts, the sequential gate, the five
 * twists, the Deserter's two answers, and all SEVEN fences that keep a bounty bout
 * out of the ladder's other systems. The chapter the gate reads is supplied
 * through the same override seam STORY-4a's `mercyOfferFor` carries, because
 * `resolveStoryState` cannot reach Chapter 3 until Stage 2 lands (R6's stated
 * dormancy) — the shipped reading is asserted separately and must stay locked.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { DuelStatistics, PlayerProfile } from '../types/game';
import {
  ALL_OPPONENTS,
  FEATURE_BOUT_OPPONENTS,
  LADDER_OPPONENTS,
  PRIMUS_PALUS_LADDER,
  isLadderBoss,
} from '../data/opponents';
import { BOUNTY_DESERTER, BOUNTY_RUNG_OPPONENTS } from '../data/bountyBoard';
import {
  BOUNTY_CHAPTER,
  BOUNTY_FINAL,
  BOUNTY_LADDER,
  applyDeserterChoice,
  bountyBoardState,
  isBountyLadderOpen,
  isDeserterUnlocked,
  resolveBountyVictory,
  resolveClearedRungs,
  twistMetFor,
  withRungCleared,
} from './bountyLadder';
import { resolveVictoryTier } from './tierAdvancement';
import { nextBossKills } from './bossKills';
import { extraPalmaFor } from './extraPalmae';
import { MERCY_RIVAL_IDS, mercyOfferFor } from './mercyBouts';
import { isGrudgeBase, recordStandardVictory } from './grudgeBouts';
import { featureBoutStatuses } from './featureBouts';
import { CROWD_HYPE_TIER_MAX } from './crowdHype';
import { DOCTORE_TEST_COMBO_TARGET } from './storyBeats';
import { resolveStoryState } from './storyState';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';

const SOURCE_DIR = fileURLToPath(new URL('../', import.meta.url));

function profile(over: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    name: 'Test',
    title: 'Tester',
    rank: 'Rookie',
    appearance: { skinColor: '#000', hairColor: '#000', tunicColor: '#000', crestColor: '#000' },
    level: 8,
    xp: 0,
    xpToNextLevel: 100,
    unspentStatPoints: 0,
    baseStats: { strength: 10, agility: 10, stamina: 10, defense: 4 },
    gold: 100,
    fame: 0,
    currentTier: 3,
    tierProgress: { 1: 0, 2: 0, 3: 0, 4: 0 },
    defeatedOpponentIds: [],
    bossKills: 0,
    newGamePlus: 0,
    trainingSessionsLeft: 2,
    injury: null,
    equipped: { weapon: DEFAULT_PLAYER_WEAPON },
    inventory: [DEFAULT_PLAYER_WEAPON],
    fightsWon: 0,
    fightsLost: 0,
    peakCrowdHypeOverall: 0,
    ...over,
  };
}

function stats(over: Partial<DuelStatistics> = {}): DuelStatistics {
  return {
    damageDealt: 100,
    damageTaken: 10,
    hitsLanded: 6,
    perfectBlocks: 2,
    dodgesPerformed: 1,
    maxCombo: 1,
    lowestStaminaFraction: 0.8,
    lowestHealthFraction: 1,
    crowdHypePeak: 20,
    durationSeconds: 40,
    goldEarned: 60,
    fameEarned: 10,
    xpEarned: 200,
    ...over,
  };
}

const cleared = (count: number): PlayerProfile =>
  profile({ story: { bountyRungs: BOUNTY_LADDER.slice(0, count).map((rung) => rung.opponentId) } });

const row = (id: string) => {
  const found = ALL_OPPONENTS.find((opponent) => opponent.id === id);
  if (!found) throw new Error(`no roster row '${id}'`);
  return found;
};

// ════════════════════════════════════════════════════════════════════════════
describe('STORY-4b §A — the ladder as data', () => {
  test('five rungs, in order, over the five appended rows', () => {
    expect(BOUNTY_LADDER).toHaveLength(5);
    expect(BOUNTY_LADDER.map((rung) => rung.rung)).toEqual([1, 2, 3, 4, 5]);
    expect(BOUNTY_LADDER.map((rung) => rung.opponentId)).toEqual(
      BOUNTY_RUNG_OPPONENTS.map((opponent) => opponent.id),
    );
    // The five names, exactly as authored (STORY-4b — authored, not transcribed).
    expect(BOUNTY_RUNG_OPPONENTS.map((opponent) => opponent.name)).toEqual([
      'Decimus the Rampart',
      'Sextus Sinister',
      'Gaius the Ironclad',
      "Publius the Crowd's Darling",
      'Manius the Unscarred',
    ]);
  });

  test('the twists, in order, and the posted bounties (Director ruling R1)', () => {
    expect(BOUNTY_LADDER.map((rung) => rung.twist)).toEqual([
      'combo',
      'left_handed',
      'stamina_war',
      'crowd',
      'clean',
    ]);
    expect(BOUNTY_LADDER.map((rung) => [rung.bountyGold, rung.bountyFame])).toEqual([
      [280, 95],
      [300, 100],
      [320, 110],
      [340, 115],
      [380, 125],
    ]);
  });

  test('the Deserter is a boss AND a bounty row, with Goliath’s mechanic and no phase data', () => {
    expect(BOUNTY_DESERTER.isBoss).toBe(true);
    expect(BOUNTY_DESERTER.bountyBout).toBe(true);
    expect(BOUNTY_DESERTER.bossMechanic).toBe('heavy_telegraph');
    expect(BOUNTY_DESERTER.fightIndex).toBe(0);
    expect(BOUNTY_DESERTER.name).toBe('Lucius Cassius, called the Oathbreaker');
    // Single-phase: he owns no registered ladder, so nothing reads phase data.
    expect(BOUNTY_DESERTER).not.toHaveProperty('phases');
  });

  test('the armoured build is authored at Tier-3 scale and above the regular baseline', () => {
    const tierThreeRegulars = LADDER_OPPONENTS.filter(
      (opponent) => opponent.tier === 3 && opponent.isBoss !== true,
    );
    expect(tierThreeRegulars.length).toBeGreaterThan(0);
    const maxDefense = Math.max(...tierThreeRegulars.map((row) => row.stats.defense));
    const maxStamina = Math.max(...tierThreeRegulars.map((row) => row.stats.staminaMax));
    const ironclad = row('opp_bounty_gaius');
    expect(ironclad.stats.defense).toBeGreaterThan(maxDefense);
    expect(ironclad.stats.staminaMax).toBeGreaterThan(maxStamina);
  });

  test('the left-handed rung carries the flag and the board prints its note', () => {
    expect(row('opp_bounty_sextus').leftHanded).toBe(true);
    const board = bountyBoardState(cleared(1), BOUNTY_CHAPTER);
    const rungTwo = board.rungs.find((entry) => entry.rung.rung === 2)!;
    expect(rungTwo.note).toBe('fights left-handed');
    // No other row claims the stance.
    expect(
      BOUNTY_RUNG_OPPONENTS.filter((opponent) => opponent.leftHanded === true).map((o) => o.id),
    ).toEqual(['opp_bounty_sextus']);
  });

  test('every bounty row sits in the roster, and nowhere in the ladder', () => {
    for (const opponent of [...BOUNTY_RUNG_OPPONENTS, BOUNTY_DESERTER]) {
      expect(ALL_OPPONENTS.map((entry) => entry.id)).toContain(opponent.id);
      expect(LADDER_OPPONENTS.map((entry) => entry.id)).not.toContain(opponent.id);
      expect(PRIMUS_PALUS_LADDER.map((entry) => entry.id)).not.toContain(opponent.id);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('STORY-4b §B — the gate, the order and the repeats', () => {
  test('before Chapter 3 the board renders shut (R6)', () => {
    const board = bountyBoardState(profile(), 2);
    expect(board.open).toBe(false);
    expect(board.rungs.every((entry) => !entry.open && entry.lockReason === 'ladder')).toBe(true);
    expect(board.final.open).toBe(false);
    expect(board.final.lockReason).toBe('ladder');
    expect(board.lockedLine).toContain('Chapter 3');
    // …and the panel still carries every price and every twist.
    expect(board.rungs.map((entry) => entry.postedGold)).toEqual([280, 300, 320, 340, 380]);
    expect(board.rungs.every((entry) => entry.twistText.length > 10)).toBe(true);
  });

  test('the shipped chapter really is dormant today — the same consequence 4a records', () => {
    expect(resolveStoryState(profile()).chapter).toBeLessThan(BOUNTY_CHAPTER);
    expect(isBountyLadderOpen(profile())).toBe(false);
    expect(isDeserterUnlocked(profile({ story: { bountyRungs: BOUNTY_LADDER.map((r) => r.opponentId) } }))).toBe(false);
  });

  test('R3 — sequential unlock: only rung 1 is open on a fresh chapter-3 board', () => {
    const board = bountyBoardState(profile(), BOUNTY_CHAPTER);
    expect(board.open).toBe(true);
    expect(board.rungs.map((entry) => entry.open)).toEqual([true, false, false, false, false]);
    expect(board.rungs.slice(1).every((entry) => entry.lockReason === 'order')).toBe(true);
    expect(board.final.open).toBe(false);
    expect(board.final.lockReason).toBe('final');
  });

  test('R3 — clearing n-1 unlocks n, and a cleared rung stays free to re-fight', () => {
    for (let count = 1; count <= 5; count += 1) {
      const board = bountyBoardState(cleared(count), BOUNTY_CHAPTER);
      const clearedFlags = board.rungs.map((entry) => entry.cleared);
      expect(clearedFlags.slice(0, count).every(Boolean)).toBe(true);
      expect(clearedFlags.slice(count).some(Boolean)).toBe(false);
      // Every cleared rung is still enterable; the next one opens; the rest wait.
      expect(board.rungs.slice(0, count).every((entry) => entry.open)).toBe(true);
      if (count < 5) expect(board.rungs[count].open).toBe(true);
      expect(board.final.open).toBe(count === 5);
    }
  });

  test('R3 — repeats pay the FULL bounty, not a reduced one', () => {
    const again = resolveBountyVictory(
      cleared(1),
      row('opp_bounty_decimus'),
      stats({ maxCombo: DOCTORE_TEST_COMBO_TARGET }),
      true,
    );
    expect(again.clearedRungId).toBe('opp_bounty_decimus');
    expect([again.gold, again.fame]).toEqual([280, 95]);
  });

  test('the Deserter needs Chapter 3 AND all five rungs', () => {
    expect(isDeserterUnlocked(cleared(5), BOUNTY_CHAPTER)).toBe(true);
    expect(isDeserterUnlocked(cleared(4), BOUNTY_CHAPTER)).toBe(false);
    expect(isDeserterUnlocked(cleared(5), 2)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('STORY-4b §C — the five twists read DuelStatistics, never a formula', () => {
  test('R1 combo: victory AND maxCombo >= DOCTORE_TEST_COMBO_TARGET', () => {
    expect(twistMetFor('combo', stats({ maxCombo: DOCTORE_TEST_COMBO_TARGET }))).toBe(true);
    expect(twistMetFor('combo', stats({ maxCombo: DOCTORE_TEST_COMBO_TARGET - 1 }))).toBe(false);
    expect(twistMetFor('combo', null)).toBe(false);
  });

  test('R4 crowd: victory AND peak hype at the MAX tier (75)', () => {
    expect(twistMetFor('crowd', stats({ crowdHypePeak: CROWD_HYPE_TIER_MAX }))).toBe(true);
    expect(twistMetFor('crowd', stats({ crowdHypePeak: CROWD_HYPE_TIER_MAX - 0.1 }))).toBe(false);
  });

  test('R5 clean: the player never fell below half health', () => {
    expect(twistMetFor('clean', stats({ lowestHealthFraction: 0.5 }))).toBe(true);
    expect(twistMetFor('clean', stats({ lowestHealthFraction: 0.49 }))).toBe(false);
    // Absent reads as never-dropped, exactly as the stamina mark's default does.
    const absent = stats();
    delete (absent as { lowestHealthFraction?: number }).lowestHealthFraction;
    expect(twistMetFor('clean', absent)).toBe(true);
  });

  test('R2/R5 — the stance and the armour are the twist: a victory meets them', () => {
    expect(twistMetFor('left_handed', stats())).toBe(true);
    expect(twistMetFor('stamina_war', stats())).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('STORY-4b §D — the victory resolver (Director ruling R4)', () => {
  test('a non-bounty bout, and every defeat, answer nothing', () => {
    expect(resolveBountyVictory(profile(), row('opp_marcus'), stats(), true).kind).toBe('none');
    expect(resolveBountyVictory(profile(), row('opp_bounty_decimus'), stats(), false).kind).toBe('none');
  });

  test('a rung victory that meets its twist clears and pays the posting', () => {
    const outcome = resolveBountyVictory(
      profile(),
      row('opp_bounty_publius'),
      stats({ crowdHypePeak: CROWD_HYPE_TIER_MAX }),
      true,
    );
    expect(outcome.kind).toBe('rung');
    expect(outcome.clearedRungId).toBe('opp_bounty_publius');
    expect([outcome.gold, outcome.fame]).toEqual([340, 115]);
  });

  test('R4 — a victory that misses the twist pays nothing extra and clears nothing', () => {
    const outcome = resolveBountyVictory(
      profile(),
      row('opp_bounty_decimus'),
      stats({ maxCombo: 1 }),
      true,
    );
    expect(outcome.kind).toBe('rung');
    expect(outcome.clearedRungId).toBeNull();
    expect([outcome.gold, outcome.fame]).toEqual([0, 0]);
    expect(outcome.line).toContain('posting stands');

    // …and the record is untouched by that bout.
    const after = withRungCleared(profile(), 'not-a-clear');
    expect(resolveClearedRungs(after)).toEqual(['not-a-clear']);
    expect(resolveClearedRungs(profile())).toEqual([]);
  });

  test('the Deserter’s victory pays nothing at the write — the answer pays it', () => {
    const outcome = resolveBountyVictory(cleared(5), BOUNTY_DESERTER, stats(), true);
    expect(outcome.kind).toBe('final');
    expect([outcome.gold, outcome.fame]).toEqual([0, 0]);
    expect(outcome.clearedRungId).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('STORY-4b §E — the two writes', () => {
  test('a rung clear lands inside `story`, once, and keeps every other flag', () => {
    const before = profile({ story: { librarySeen: true, bountyRungs: [] } });
    const once = withRungCleared(before, 'opp_bounty_decimus');
    expect(once.story?.bountyRungs).toEqual(['opp_bounty_decimus']);
    expect(once.story?.librarySeen).toBe(true);
    // Idempotent: the same clear returns the SAME profile (no save, no re-render).
    expect(withRungCleared(once, 'opp_bounty_decimus')).toBe(once);
    // No top-level field was added.
    expect(Object.keys(once).length).toBe(Object.keys(before).length);
  });

  test('capture writes `spared` and pays 550 / 90; kill writes `taken` and pays 350 / 180', () => {
    const captured = applyDeserterChoice(profile(), 'spared');
    expect(captured.profile.story?.deserterChoice).toBe('spared');
    expect([captured.gold, captured.fame]).toEqual([550, 90]);
    expect(captured.profile.gold).toBe(650);
    expect(captured.profile.fame).toBe(90);
    // Paid into the same `spared`-free field set: no other story key was invented.
    expect(Object.keys(captured.profile.story ?? {})).toEqual(['deserterChoice']);

    const killed = applyDeserterChoice(profile(), 'taken');
    expect(killed.profile.story?.deserterChoice).toBe('taken');
    expect([killed.gold, killed.fame]).toEqual([350, 180]);
    expect(killed.profile.gold).toBe(450);
    expect(killed.profile.fame).toBe(180);
  });

  test('the answer is exactly once: a second call writes nothing and pays nothing', () => {
    const first = applyDeserterChoice(profile(), 'spared');
    const second = applyDeserterChoice(first.profile, 'taken');
    expect(second.alreadyAnswered).toBe(true);
    expect(second.profile).toBe(first.profile);
    expect([second.gold, second.fame]).toEqual([0, 0]);
    expect(second.profile.story?.deserterChoice).toBe('spared');
    expect(second.profile.gold).toBe(650);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('STORY-4b §F — the seven fences', () => {
  test('(a) tier advancement — a bounty victory never moves `currentTier`', () => {
    const atTwo = { currentTier: 2, opponent: BOUNTY_DESERTER, defeatedOpponentIds: [] as string[] };
    const deserter = resolveVictoryTier(atTwo);
    expect(deserter.currentTier).toBe(2);
    expect(deserter.firstDefeat).toBe(false);
    for (const opponent of BOUNTY_RUNG_OPPONENTS) {
      const rung = resolveVictoryTier({ currentTier: 2, opponent, defeatedOpponentIds: [] });
      expect(rung.currentTier).toBe(2);
    }
    // …and a ladder boss still advances (the rule itself is unchanged).
    expect(
      resolveVictoryTier({ currentTier: 2, opponent: row('opp_valeria_boss'), defeatedOpponentIds: [] })
        .currentTier,
    ).toBe(3);
  });

  test('(b) bossKills — the Deserter is not a campaign kill', () => {
    const before = { bossKills: 2, defeatedOpponentIds: [] as string[] };
    const after = { bossKills: 2, defeatedOpponentIds: ['opp_bounty_deserter'] };
    expect(nextBossKills(before, after, BOUNTY_DESERTER)).toBe(2);
    // A ladder boss's first defeat still counts.
    expect(
      nextBossKills(before, { bossKills: 2, defeatedOpponentIds: ['opp_goliath_boss'] }, row('opp_goliath_boss')),
    ).toBe(3);
  });

  test('(c) extraPalmae — no bounty row is ever granted a palma', () => {
    for (const opponent of [...BOUNTY_RUNG_OPPONENTS, BOUNTY_DESERTER]) {
      expect(extraPalmaFor(opponent)).toBeNull();
    }
    // The safe-subset roster is unaffected.
    expect(extraPalmaFor(row('opp_marcus'))).not.toBeNull();
  });

  test('(d) the Feature Bouts section never lists a bounty row', () => {
    expect(FEATURE_BOUT_OPPONENTS).toHaveLength(5);
    expect(FEATURE_BOUT_OPPONENTS.some((opponent) => opponent.bountyBout === true)).toBe(false);
    const statuses = featureBoutStatuses(profile({ level: 20, fame: 5000, currentTier: 4 }));
    expect(statuses).toHaveLength(5);
    expect(statuses.some((status) => status.opponent.bountyBout === true)).toBe(false);
  });

  test('(e) 4a mercy never offers on a bounty row', () => {
    expect(mercyOfferFor(cleared(0), BOUNTY_DESERTER, true, BOUNTY_CHAPTER)).toBeNull();
    for (const opponent of BOUNTY_RUNG_OPPONENTS) {
      expect(mercyOfferFor(profile(), opponent, true, BOUNTY_CHAPTER)).toBeNull();
      expect(MERCY_RIVAL_IDS).not.toContain(opponent.id);
    }
    // The fence is not a blanket: an eligible ladder regular still offers.
    expect(mercyOfferFor(profile(), row('opp_centurion_drusus'), true, BOUNTY_CHAPTER)).not.toBeNull();
  });

  test('(f) C-A grudges — a bounty victory generates none', () => {
    for (const opponent of [...BOUNTY_RUNG_OPPONENTS, BOUNTY_DESERTER]) {
      expect(isGrudgeBase(opponent)).toBe(false);
      const before = profile();
      const after = recordStandardVictory(before, opponent, 'power');
      // The same profile comes back untouched: no grudge, no new id, no save.
      expect(after).toBe(before);
      expect(after.grudges).toBeUndefined();
    }
  });

  test('(g) rung victories are not ladder wins for any gate', () => {
    for (const opponent of [...BOUNTY_RUNG_OPPONENTS, BOUNTY_DESERTER]) {
      expect(isLadderBoss(opponent)).toBe(false);
      expect(opponent.fightIndex).toBe(0);
      expect(LADDER_OPPONENTS.map((entry) => entry.id)).not.toContain(opponent.id);
    }
    // The shipped ladder is exactly the twelve it was.
    expect(LADDER_OPPONENTS).toHaveLength(12);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('STORY-4b §G — no new profile field', () => {
  const types = readFileSync(join(SOURCE_DIR, 'types/game.ts'), 'utf8');

  const optionalProfileFields = (): string[] => {
    const start = types.indexOf('export interface PlayerProfile {');
    expect(start).toBeGreaterThan(-1);
    let depth = 0;
    let end = start;
    for (let i = types.indexOf('{', start); i < types.length; i += 1) {
      if (types[i] === '{') depth += 1;
      if (types[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = types.slice(start, end);
    return [...body.matchAll(/^ {2}([A-Za-z][A-Za-z0-9_]*)\?:/gm)].map((match) => match[1]);
  };

  test('§J stays at twenty-one fields, `spared` last, and no bounty field appears', () => {
    const optional = optionalProfileFields();
    expect(optional.length).toBe(21);
    expect(optional[optional.length - 1]).toBe('spared');
    expect(optional.some((name) => /bounty|deserter/i.test(name))).toBe(false);
  });

  test('both bounty records live inside the existing `story` object', () => {
    const story = types.slice(
      types.indexOf('export interface StoryProgress {'),
      types.indexOf('export interface StoryProgress {') + 3000,
    );
    expect(story).toContain('deserterChoice?:');
    expect(story).toContain('bountyRungs?: string[];');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('STORY-4b §H — the wiring is the module, and only the module', () => {
  const code = (rel: string): string =>
    readFileSync(join(SOURCE_DIR, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  test('App writes through the banner module, once each', () => {
    const app = code('App.tsx');
    expect(app.match(/resolveBountyVictory\(/g)?.length).toBe(1);
    expect(app.match(/withRungCleared\(/g)?.length).toBe(1);
    expect(app.match(/applyDeserterChoice\(/g)?.length).toBe(1);
    // The choice itself is written by the module; App only relays the answer.
    expect(app).toContain('onDeserterChoice={handleDeserterChoice}');
  });

  test('the city opens the board from the hall, and only from the hall', () => {
    const city = code('components/3d/city/CityHubScene.tsx');
    expect(city).toContain("nearbyLoc.id === 'bounty_hall'");
    expect(city).toContain('setBountyPanel(true)');
    expect(city).toContain('<BountyBoardPanel');
    // The old flavour routing cannot fire first: the id branch precedes the tabKey one.
    expect(city.indexOf("nearbyLoc.id === 'bounty_hall'")).toBeLessThan(
      city.indexOf("nearbyLoc.tabKey === 'tournament'"),
    );
  });

  test('the modal holds the Deserter’s result open until it is answered', () => {
    const modal = code('components/hub/DuelResultModal.tsx');
    expect(modal).toContain('data-deserter-choice="spared"');
    expect(modal).toContain('data-deserter-choice="taken"');
    expect(modal).toContain(
      "{(!mercy || mercy.chosen) && (!bounty || bounty.kind === 'rung' || bounty.chosen) && (",
    );
  });
});
