/**
 * STORY-2 — "Arrival, Oath, First Sand" (Chapters 0–1).
 *
 * ── THE SEVEN PROOFS THIS SUITE PINS ───────────────────────────────────────
 *   P1  the novice bout is the shipped ladder fight, and the Doctore's Test is
 *       NOT on the ladder (so it can move no tier, kill count or stripe);
 *   P2  the beat's framing is FRESH-PROFILE ONLY — one that has won a duel or
 *       already put Marcus down never sees it again, and a LOSS does not
 *       consume it;
 *   P3  that framing is narration, never intel — two voices, no statistic, and
 *       the pre-fight card's intel block untouched;
 *   P4  the Doctore reads the FIRST attempt, win or lose, and a loss changes
 *       nothing but the loss column;
 *   P5  the Test offers exactly two rules, each printed with its reason, and
 *       the player chooses one;
 *   P6  the verdict is read off the duel's own tracked statistics, and the
 *       campaign gate needs BOTH pieces of evidence the victory write records;
 *   P7  the Primus Palus board is a stateless derivative: the city's roster in
 *       ladder order, the champion's plaque, and the player's line chalked only
 *       after the first win — with no save field of its own.
 *
 * ── WHAT IS NOT ASSERTED HERE ──────────────────────────────────────────────
 * Nothing about a rendered frame, combat balance or the 3D hub: this suite reads
 * the pure modules, renders the shipped components to static markup, and reads
 * the two wiring sites (`App`'s result write, `DuelScene`'s stamina tracking) by
 * source.  It never calls a save writer and never touches `localStorage`.
 *
 * Run with: bun test src/utils/storyChapterOne.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { DuelStatistics, OpponentConfig, PlayerProfile } from '../types/game';
import { ALL_OPPONENTS, DOCTORE_TEST_OPPONENT, PRIMUS_PALUS_LADDER } from '../data/opponents';
import { createNewProfile } from '../services/storage';
import { resolveStoryState } from './storyState';
import {
  DOCTORE_TEST_COMBO_TARGET,
  DOCTORE_TEST_OPPONENT_ID,
  DOCTORE_TEST_RESTRICTIONS,
  DOCTORE_TEST_STAMINA_FLOOR,
  NOVICE_BOUT_BRIEFING,
  NOVICE_BOUT_OPPONENT_ID,
  doctoreAttemptLine,
  doctoreRestrictionSpec,
  doctoreTestResultLine,
  isDoctoreTestOpponent,
  isDoctoreTestPassed,
  isNoviceBoutDue,
  isNoviceBoutOpponent,
  meetsDoctoreRestriction,
} from './storyBeats';
import { DoctoreTestCard } from '../components/hub/DoctoreTestCard';
import { PreFightModal } from '../components/hub/PreFightModal';
import {
  PRIMUS_PALUS_BOARD_EPIGRAPH,
  PrimusPalusBoard,
  primusPalusChallengers,
  primusPalusChampion,
} from '../components/hub/PrimusPalusBoard';

// ── Sources ───────────────────────────────────────────────────────────────
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const duelSource = readFileSync(new URL('../components/duel/DuelScene.tsx', import.meta.url), 'utf8');
const preFightSource = readFileSync(
  new URL('../components/hub/PreFightModal.tsx', import.meta.url),
  'utf8'
);
const boardSource = readFileSync(
  new URL('../components/hub/PrimusPalusBoard.tsx', import.meta.url),
  'utf8'
);
const beatsSource = readFileSync(new URL('./storyBeats.ts', import.meta.url), 'utf8');

/** Comments stripped, so no assertion can be satisfied by prose. */
const codeOf = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

/** Decode the markup's entities so a test can quote the authored words. */
const text = (markup: string): string =>
  markup
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

// ── Fixtures ──────────────────────────────────────────────────────────────
const fresh = (): PlayerProfile => createNewProfile('Tester');

const noviceBout = (): OpponentConfig => {
  const opponent = ALL_OPPONENTS.find((candidate) => candidate.id === NOVICE_BOUT_OPPONENT_ID);
  if (!opponent) throw new Error('the shipped novice bout is not in the roster');
  return opponent;
};

/** A duel's tracked statistics, with the two readings this slice adds. */
const duelStats = (overrides: Partial<DuelStatistics> = {}): DuelStatistics => ({
  damageDealt: 0,
  damageTaken: 0,
  hitsLanded: 0,
  perfectBlocks: 0,
  dodgesPerformed: 0,
  maxCombo: 0,
  lowestStaminaFraction: 1,
  crowdHypePeak: 25,
  durationSeconds: 30,
  goldEarned: 35,
  fameEarned: 10,
  xpEarned: 40,
  ...overrides,
});

const preFightMarkup = (opponent: OpponentConfig, narration?: typeof NOVICE_BOUT_BRIEFING) =>
  renderToStaticMarkup(
    React.createElement(PreFightModal, {
      opponent,
      narration,
      onConfirm: () => undefined,
      onCancel: () => undefined,
    })
  );

// ── P1 the bout is shipped, the Test is not on the ladder ─────────────────
describe('P1 — the novice bout is the shipped rung and the Test is off-ladder', () => {
  test('Marcus is still Tier 1, Fight 1, and the beat names his own id', () => {
    const marcus = noviceBout();
    expect(NOVICE_BOUT_OPPONENT_ID).toBe('opp_marcus');
    expect(marcus.tier).toBe(1);
    expect(marcus.fightIndex).toBe(1);
    expect(isNoviceBoutOpponent(marcus)).toBe(true);
    // The framing is attached by id, never by name.
    expect(isNoviceBoutOpponent({ ...marcus, name: 'Someone Else' })).toBe(true);
    expect(isNoviceBoutOpponent({ ...marcus, id: 'opp_flaccus' })).toBe(false);
    expect(isNoviceBoutOpponent(null)).toBe(false);
  });

  test('the Doctore’s yard champion is not in the roster, so he cannot move a tier or a stripe', () => {
    expect(ALL_OPPONENTS.some((opponent) => opponent.id === DOCTORE_TEST_OPPONENT_ID)).toBe(false);
    expect(PRIMUS_PALUS_LADDER.some((opponent) => opponent.id === DOCTORE_TEST_OPPONENT_ID)).toBe(
      false
    );
    // A non-boss with no rung: `tierAdvancement` / `bossKills` / `heraldry` read
    // `isBoss` and `fightIndex`, so neither can be moved by taking the Test.
    expect(DOCTORE_TEST_OPPONENT.isBoss).toBeUndefined();
    expect(DOCTORE_TEST_OPPONENT.fightIndex).toBe(0);
    expect(DOCTORE_TEST_OPPONENT.tier).toBe(1);
    expect(isDoctoreTestOpponent(DOCTORE_TEST_OPPONENT)).toBe(true);
    expect(isDoctoreTestOpponent(noviceBout())).toBe(false);
  });

  test('no save field is added at creation', () => {
    expect('story' in fresh()).toBe(false);
  });
});

// ── P2 fresh profiles only ────────────────────────────────────────────────
describe('P2 — the framing is for a fresh record only', () => {
  test('a fresh profile is due the arrival', () => {
    expect(isNoviceBoutDue(fresh())).toBe(true);
  });

  test('a profile that has won any duel is not', () => {
    expect(isNoviceBoutDue({ ...fresh(), fightsWon: 1 })).toBe(false);
    expect(isNoviceBoutDue({ ...fresh(), fightsWon: 12 })).toBe(false);
  });

  test('a profile that has already put Marcus down is not, even with no win recorded', () => {
    const faced: PlayerProfile = {
      ...fresh(),
      defeatedOpponentIds: [NOVICE_BOUT_OPPONENT_ID],
    };
    expect(isNoviceBoutDue(faced)).toBe(false);
    // …but another opponent's id says nothing about the arrival.
    expect(isNoviceBoutDue({ ...fresh(), defeatedOpponentIds: ['opp_flaccus'] })).toBe(true);
  });

  test('a LOSS does not consume the framing — the first attempt may be lost', () => {
    const lostOnce: PlayerProfile = { ...fresh(), fightsLost: 1 };
    expect(isNoviceBoutDue(lostOnce)).toBe(true);
    // …and a loss records no win and no defeated id, so the chapter has not moved.
    const state = resolveStoryState(lostOnce);
    expect(state.chapter).toBe(0);
    expect(lostOnce.defeatedOpponentIds).toEqual([]);
  });

  test('a missing profile is never due, and a malformed record resolves safely', () => {
    expect(isNoviceBoutDue(null)).toBe(false);
    expect(isNoviceBoutDue(undefined)).toBe(false);
    const malformed = { ...fresh(), fightsWon: 'three', defeatedOpponentIds: 'none' };
    expect(isNoviceBoutDue(malformed as unknown as PlayerProfile)).toBe(true);
  });
});

// ── P3 narration, not intel ───────────────────────────────────────────────
describe('P3 — the framing is two voices, never a statistic', () => {
  test('Niger names the bout, Marcus answers, and neither line carries a number', () => {
    expect(NOVICE_BOUT_BRIEFING.map((entry) => entry.speaker)).toEqual(['Niger', 'Marcus']);
    for (const entry of NOVICE_BOUT_BRIEFING) {
      expect(entry.line.length).toBeGreaterThan(40);
      expect(entry.line).not.toMatch(/[0-9]/);
    }
  });

  test('the card prints both lines only when it is handed them', () => {
    const withNarration = text(preFightMarkup(noviceBout(), NOVICE_BOUT_BRIEFING));
    expect(withNarration).toContain('data-prefight-narration');
    for (const entry of NOVICE_BOUT_BRIEFING) {
      expect(withNarration).toContain(entry.speaker);
      expect(withNarration).toContain(entry.line);
    }
    const without = text(preFightMarkup(noviceBout()));
    expect(without).not.toContain('data-prefight-narration');
    for (const entry of NOVICE_BOUT_BRIEFING) expect(without).not.toContain(entry.line);
  });

  test('the narration block reads no opponent field, so it can print no intel', () => {
    const code = codeOf(preFightSource);
    const start = code.indexOf('data-prefight-narration');
    // C-8.70C's grudge block now sits between the narration and the Test's rule,
    // so the narration block ends at the NEXT block marker after it, whichever
    // that is. The property pinned — the narration reads no opponent field — is
    // unchanged, and the intel-row count below still has to be exactly three.
    const grudgeStart = code.indexOf('opponent.grudge', start);
    const end = grudgeStart > start ? grudgeStart : code.indexOf('data-prefight-restriction');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = code.slice(start, end);
    expect(block).not.toContain('opponent.');
    // …and the shipped intel rows are still the only ones the card prints.
    expect(code.match(/opponent\.(weaponType|personality|rewardGold)/g)?.length).toBe(3);
  });

  test('the briefing is data, so the hub holds no copy of the words', () => {
    expect(codeOf(beatsSource)).toContain('NOVICE_BOUT_BRIEFING');
    expect(NOVICE_BOUT_BRIEFING.length).toBe(2);
  });
});

// ── P4 the Doctore reads the first attempt ────────────────────────────────
describe('P4 — the Doctore reads the first attempt, win or lose', () => {
  test('the win and the loss are two different readings', () => {
    const won = doctoreAttemptLine(true);
    const lost = doctoreAttemptLine(false);
    expect(won).not.toBe(lost);
    expect(won.startsWith('Doctore:')).toBe(true);
    expect(lost.startsWith('Doctore:')).toBe(true);
    // Losing costs nothing and ends nothing: the line says so, and the next move
    // is another attempt (the entry stays open).
    expect(lost).toContain('cost you nothing');
    expect(lost.toLowerCase()).toContain('again');
    // A win hands the player on to the Test.
    expect(won).toContain('Test');
  });

  test('the result write reads the line once, before the record is written', () => {
    const code = codeOf(appSource);
    const start = code.indexOf('const handleMatchComplete');
    const end = code.indexOf('const handleDuelResultDismiss');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const write = code.slice(start, end);
    // The attempt is judged against the profile as it stands BEFORE the write.
    expect(write).toContain('isNoviceBoutDue(profile)');
    expect(write).toContain('isNoviceBoutOpponent(activeOpponent)');
    expect(write).toContain('doctoreAttemptLine(didWin)');
    // …and the line travels to the result screen with the result.
    // S4 added the injury outcome to the same result payload; the lines still travel
    // to the result screen with the result, which is the property this pins.
    // CH-5 then added one OPTIONAL conditional spread (the palmae a victory earned), so
    // the payload is no longer a one-line literal.  The property is unchanged and
    // strengthened: ONE result write, carrying the Doctore's line with the outcome.  A
    // payload missing the line, the stats, the outcome or the injury event fails here.
    expect(write.match(/setDuelResult\(/g)?.length).toBe(1);
    const callStart = write.indexOf('setDuelResult({');
    expect(callStart).toBeGreaterThan(-1);
    const resultCall = write.slice(callStart, write.indexOf('});', callStart));
    for (const field of ['didWin', 'stats', 'storyLines', 'injuryEvent']) {
      expect(resultCall).toContain(`${field},`);
    }
    expect(resultCall).toContain(
      '...(palmaEarned && palmaEarned.length > 0 ? { palmaEarned } : {}),',
    );
  });

  test('a loss still records only the loss — no win, no id, no story flag', () => {
    const code = codeOf(appSource);
    const write = code.slice(
      code.indexOf('const handleMatchComplete'),
      code.indexOf('const handleDuelResultDismiss')
    );
    const loseBranch = write.slice(write.lastIndexOf('} else {'));
    expect(loseBranch).toContain('fightsLost: profile.fightsLost + 1');
    expect(loseBranch).not.toContain('fightsWon');
    expect(loseBranch).not.toContain('doctoreTestPassed');
  });
});

// ── P5 the two restricted rules ───────────────────────────────────────────
describe("P5 — the Test offers two rules, each with its reason", () => {
  test('exactly two restrictions, in offer order, each stating rule and reason', () => {
    expect(DOCTORE_TEST_RESTRICTIONS.map((spec) => spec.id)).toEqual(['combo', 'fresh']);
    for (const spec of DOCTORE_TEST_RESTRICTIONS) {
      expect(spec.name.length).toBeGreaterThan(3);
      expect(spec.rule.length).toBeGreaterThan(20);
      // The Clarity law: a restriction is never set without its reason.
      expect(spec.reason.length).toBeGreaterThan(40);
    }
    expect(doctoreRestrictionSpec('combo')).toBe(DOCTORE_TEST_RESTRICTIONS[0]);
    expect(doctoreRestrictionSpec('fresh')).toBe(DOCTORE_TEST_RESTRICTIONS[1]);
    for (const junk of [null, undefined, 'folded', 0, {}]) {
      expect(doctoreRestrictionSpec(junk)).toBeNull();
    }
  });

  test('the entry card prints both rules and their reasons, with one choice each', () => {
    const markup = text(
      renderToStaticMarkup(
        React.createElement(DoctoreTestCard, {
          profile: fresh(),
          onChooseRestriction: () => undefined,
        })
      )
    );
    expect(markup).toContain('data-doctore-test-card');
    expect(markup).toContain('data-test-passed="false"');
    expect(markup.match(/<button/g)?.length).toBe(2);
    for (const spec of DOCTORE_TEST_RESTRICTIONS) {
      expect(markup).toContain(`data-doctore-restriction="${spec.id}"`);
      expect(markup).toContain(spec.name);
      expect(markup).toContain(spec.rule);
      expect(markup).toContain(spec.reason);
    }
    // The champion the Test is fought against is named, from the roster.
    expect(markup).toContain(DOCTORE_TEST_OPPONENT.name);
  });

  test('the card marks a passed Test, and the entry stays open as a bout', () => {
    const passed: PlayerProfile = {
      ...fresh(),
      defeatedOpponentIds: [DOCTORE_TEST_OPPONENT_ID],
      story: { doctoreTestPassed: true },
    };
    expect(isDoctoreTestPassed(passed)).toBe(true);
    expect(isDoctoreTestPassed(fresh())).toBe(false);
    const markup = text(
      renderToStaticMarkup(
        React.createElement(DoctoreTestCard, {
          profile: passed,
          onChooseRestriction: () => undefined,
        })
      )
    );
    expect(markup).toContain('data-test-passed="true"');
    expect(markup).toContain('data-doctore-test-state="passed"');
    // Still offered, still two rules: the yard keeps its place in the world.
    expect(markup.match(/<button/g)?.length).toBe(2);
  });
});

// ── P6 the verdict and the gate's evidence ────────────────────────────────
describe("P6 — the verdict reads the duel's own statistics", () => {
  test('the combo rule is met at the target and not one below it', () => {
    expect(DOCTORE_TEST_COMBO_TARGET).toBe(3);
    expect(meetsDoctoreRestriction('combo', duelStats({ maxCombo: 3 }))).toBe(true);
    expect(meetsDoctoreRestriction('combo', duelStats({ maxCombo: 5 }))).toBe(true);
    expect(meetsDoctoreRestriction('combo', duelStats({ maxCombo: 2 }))).toBe(false);
  });

  test('the fresh rule is met at the floor, and the low-water mark is a fraction of the maximum', () => {
    expect(DOCTORE_TEST_STAMINA_FLOOR).toBe(0.5);
    expect(meetsDoctoreRestriction('fresh', duelStats({ lowestStaminaFraction: 0.5 }))).toBe(true);
    expect(meetsDoctoreRestriction('fresh', duelStats({ lowestStaminaFraction: 0.49 }))).toBe(
      false
    );
    // A duel never entered reads as full: the mark starts at 1.
    expect(meetsDoctoreRestriction('fresh', duelStats())).toBe(true);
  });

  test('an unknown rule or a missing reading passes nothing', () => {
    expect(meetsDoctoreRestriction(null, duelStats({ maxCombo: 9 }))).toBe(false);
    expect(meetsDoctoreRestriction('folded' as never, duelStats())).toBe(false);
    expect(meetsDoctoreRestriction('combo', null)).toBe(false);
    expect(meetsDoctoreRestriction('fresh', undefined)).toBe(false);
  });

  test('the result line says PASSED only inside the rule, and names the shortfall otherwise', () => {
    const passed = doctoreTestResultLine('combo', duelStats({ maxCombo: 4 }));
    expect(passed).toContain('PASSED');
    expect(passed).not.toContain('NOT passed');

    const missed = doctoreTestResultLine('combo', duelStats({ maxCombo: 2 }));
    expect(missed).toContain('NOT passed');
    expect(missed).toContain('2');
    expect(missed).toContain(String(DOCTORE_TEST_COMBO_TARGET));
    expect(missed).toContain('take it again');

    const spent = doctoreTestResultLine('fresh', duelStats({ lowestStaminaFraction: 0.42 }));
    expect(spent).toContain('NOT passed');
    expect(spent).toContain('42%');
  });

  test('the duel tracks the low-water mark the way it tracks the combo, and no formula reads it', () => {
    const code = codeOf(duelSource);
    expect(code).toContain('lowestStaminaFraction: 1');
    expect(code).toMatch(
      /statsRef\.current\.lowestStaminaFraction = Math\.min\(/
    );
    // A reading of the fight, never an input: the literal's initial value and the
    // one update are the only places the name appears.
    expect(code.match(/lowestStaminaFraction/g)?.length).toBe(3);
    // The combo reading it is modelled on is still exactly one Math.max assign.
    expect(code).toMatch(/statsRef\.current\.maxCombo = Math\.max\(/);
  });

  test("the campaign gate needs both the id and the flag the same write records", () => {
    const firstWin: PlayerProfile = { ...fresh(), fightsWon: 1 };
    const gateOf = (profile: PlayerProfile) => {
      const state = resolveStoryState(profile);
      const gate = state.gates.find((entry) => entry.id === 'doctore-test');
      if (!gate) throw new Error('the Test gate is not on Chapter 1');
      return gate.state;
    };
    expect(gateOf(firstWin)).toBe('unmet');
    // The id alone: a plain win records it, with no pass flag.
    const plainWin: PlayerProfile = {
      ...firstWin,
      defeatedOpponentIds: [DOCTORE_TEST_OPPONENT_ID],
    };
    expect(gateOf(plainWin)).toBe('unmet');
    // The flag alone is not evidence either.
    expect(gateOf({ ...firstWin, story: { doctoreTestPassed: true } })).toBe('unmet');
    // Both, as the victory write lands them: the gate is met, so it CLOSES
    // Chapter 1 and is no longer one of the gates the resolver hands back.
    const passed: PlayerProfile = {
      ...plainWin,
      story: { doctoreTestPassed: true },
    };
    const passedState = resolveStoryState(passed);
    expect(passedState.chapter).toBe(2);
    expect(passedState.gates.some((gate) => gate.id === 'doctore-test')).toBe(false);
    // …and the entry card reads the same pair, so the two can never disagree.
    expect(isDoctoreTestPassed(passed)).toBe(true);
    expect(isDoctoreTestPassed(plainWin)).toBe(false);
  });

  test('the victory write lands the flag in the existing lazy `story` object only when the rule held', () => {
    const code = codeOf(appSource);
    const start = code.indexOf('const testWon =');
    expect(start).toBeGreaterThan(-1);
    const judged = code.slice(start, code.indexOf('if (didWin)', start));
    expect(judged).toContain('didWin');
    expect(judged).toContain('isDoctoreTestOpponent(activeOpponent)');
    expect(judged).toContain('doctoreRestriction !== null');
    expect(judged).toContain('meetsDoctoreRestriction(doctoreRestriction, stats)');
    // The flag rides the ordinary victory write, beside the recorded id.
    expect(code).toContain('...(testWon');
    expect(code).toContain('doctoreTestPassed: true');
    // No new top-level field was declared on the profile for this beat.
    expect(code).not.toContain('doctoreTestPassed: profile.');
  });
});

// ── P7 the Primus Palus board ─────────────────────────────────────────────
describe('P7 — the Primus Palus board derives everything it shows', () => {
  test('the champion is the roster’s tier-4 boss, by data not by id', () => {
    const champion = primusPalusChampion();
    expect(champion).toBeDefined();
    expect(champion?.tier).toBe(4);
    expect(champion?.isBoss).toBe(true);
    // …and it is the roster's own object, not a copy with restated fields.
    expect(champion).toBe(
      ALL_OPPONENTS.find((opponent) => opponent.tier === 4 && opponent.isBoss === true)
    );
  });

  test('the challengers’ row is the ladder in order, without the champion', () => {
    const champion = primusPalusChampion();
    const challengers = primusPalusChallengers();
    // The plaque lists the LADDER: D-1's five feature bouts are not rungs of it.
    expect(challengers.length).toBe(PRIMUS_PALUS_LADDER.length - 1);
    expect(challengers.some((opponent) => opponent.id === champion?.id)).toBe(false);
    // Ladder order: tier first, then the rung.
    const order = PRIMUS_PALUS_LADDER.map((opponent) => opponent.id).filter(
      (id) => id !== champion?.id
    );
    expect(challengers.map((opponent) => opponent.id)).toEqual(order);
    for (let index = 1; index < challengers.length; index += 1) {
      const previous = challengers[index - 1];
      const current = challengers[index];
      expect(
        current.tier > previous.tier ||
          (current.tier === previous.tier && current.fightIndex >= previous.fightIndex)
      ).toBe(true);
    }
  });

  test('before the first win the player’s line is a blank, and the plaque still stands', () => {
    const markup = text(renderToStaticMarkup(React.createElement(PrimusPalusBoard, { profile: fresh() })));
    expect(markup).toContain('data-primus-palus-board');
    expect(markup).toContain('data-board-chalked="false"');
    expect(markup).toContain('data-board-player="unchalked"');
    expect(markup).not.toContain('data-board-player="Tester"');
    expect(markup).toContain(PRIMUS_PALUS_BOARD_EPIGRAPH);
    expect(markup).toContain(`data-board-champion="${primusPalusChampion()?.id}"`);
    // The board does not claim a name it has not earned.
    expect(markup).not.toContain('>Tester<');
  });

  test('after the first win the line is chalked with the player’s name, and the row is the roster', () => {
    const markup = text(
      renderToStaticMarkup(
        React.createElement(PrimusPalusBoard, { profile: { ...fresh(), fightsWon: 1 } })
      )
    );
    expect(markup).toContain('data-board-chalked="true"');
    expect(markup).toContain('data-board-player="Tester"');
    expect(markup).toContain(`data-board-challengers="${primusPalusChallengers().length}"`);
    for (const opponent of primusPalusChallengers()) {
      expect(markup).toContain(`data-board-entry="${opponent.id}"`);
    }
    // The champion's plaque is not repeated in the challengers' row.
    expect(markup).not.toContain(`data-board-entry="${primusPalusChampion()?.id}"`);
  });

  test('it holds no state, reads no storage and adds no save field', () => {
    const code = codeOf(boardSource);
    expect(code).not.toMatch(/useState|useEffect|useReducer|useRef/);
    expect(code).not.toMatch(/localStorage|sessionStorage|indexedDB|saveProfile|loadSavedProfile/);
    // Everything comes from the profile it is handed and the roster it imports.
    expect(code).toContain('profile.fightsWon');
    expect(code).toContain('ALL_OPPONENTS');
  });
});
