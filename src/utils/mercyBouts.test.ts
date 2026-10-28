/**
 * ===========================================================================
 * STORY-4a — MERCY OR GLORY (Pitch A9, duel form only): the honesty suite
 * ===========================================================================
 * One section per claim the brief, the design of record and the Director's
 * rulings make:
 *
 *   §A the FIELD — `spared` is one lazy optional object, absent = nobody spared,
 *      and no other save field was added;
 *   §B ELIGIBILITY — Tier 2+ named regulars offer; Tier 1, Sextus, ladder bosses,
 *      Feature Bout bosses and grudge-bout victories never do; Chapters 0-2 never
 *      offer and Chapter 3+ does (R4-R7);
 *   §C ONCE EACH — a spared rival never offers again, and neither does a beaten
 *      one (the first-defeat rule);
 *   §D SPARE — writes the flag idempotently, keeps the C-A grudge, touches
 *      nothing else (R2);
 *   §E FINISH — removes that defeat's grudge, pays final fame x1.25 rounded once,
 *      writes no flag, moves no gold (R1, R2);
 *   §F THE GRUDGE INTERPLAY — a finished rival never generates a future grudge,
 *      the C-A fence is unchanged (no boss ever carries one), and the Primus
 *      Palus board prints base -> adjusted inside the published caps plus the
 *      C-TRAIT palma by name (§5);
 *   §G THE WORDS — the first Spare and first Finish herald lines fire once each,
 *      the teaching lines ride the first offer, and the keeper's lines are flavor
 *      only (no numbers, nothing promised) (R3);
 *   §H THE SURFACES — the result modal HOLDS the flow for an eligible victory
 *      until an answer is given, App writes each answer exactly once, and the
 *      save corpus carries the new fixture with §J at twenty-one fields.
 *
 * Run with: `bun test src/utils/mercyBouts.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { DuelStatistics, OpponentConfig, PlayerProfile } from '../types/game';
import {
  ALL_OPPONENTS,
  DOCTORE_TEST_OPPONENT,
  FEATURE_BOUT_OPPONENTS,
  LADDER_OPPONENTS,
} from '../data/opponents';
import { createNewProfile } from '../services/storage';
import { getPalma } from '../data/palmae';
import { buildGrudgeOpponent, grudgeBoutStatuses, grudgeIdOf, grudgeProfileLine, recordStandardVictory } from './grudgeBouts';
import { resolveStoryState } from './storyState';
import { DuelResultModal } from '../components/hub/DuelResultModal';
import { PrimusPalusBoard } from '../components/hub/PrimusPalusBoard';
import {
  FINISH_FAME_MULTIPLIER,
  MERCY_CHAPTER,
  MERCY_FIRST_FINISH_CRY,
  MERCY_FIRST_SPARE_CRY,
  MERCY_MIN_TIER,
  MERCY_RIVAL_IDS,
  MERCY_TEACHING_LINES,
  boardGrudgeCards,
  finishRival,
  hasFinishedAnyRival,
  isFirstMercyOfKind,
  isMercyRival,
  isRivalFinished,
  isRivalSpared,
  mercyChoiceLine,
  mercyHeraldCries,
  mercyKeeperLine,
  mercyOfferFor,
  resolveSpared,
  spareRival,
} from './mercyBouts';

// ── Sources (for the surface and scope pins) ───────────────────────────────
const SRC_ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (rel: string): string => readFileSync(join(SRC_ROOT, rel), 'utf8');
const code = (rel: string): string =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

const APP = read('App.tsx');
const APP_CODE = code('App.tsx');
const MODAL = code('components/hub/DuelResultModal.tsx');
const BOARD = code('components/hub/PrimusPalusBoard.tsx');

// ── Fixtures ───────────────────────────────────────────────────────────────
const fresh = (): PlayerProfile => createNewProfile('Tester');
const rival = (id: string): OpponentConfig => {
  const row = LADDER_OPPONENTS.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`no roster row '${id}'`);
  return row;
};
const cassius = (): OpponentConfig => rival('opp_hoplite');
const DRUSUS = 'opp_centurion_drusus';

/** A profile that has beaten Cassius (first victory already written) with his grudge live. */
const afterBeatingCassius = (dominant: 'quick' | 'power' | 'even' = 'power'): PlayerProfile => ({
  ...fresh(),
  defeatedOpponentIds: [cassius().id],
  fightsWon: 1,
  grudges: { [cassius().id]: { dominant } },
});

const stats = (overrides: Partial<DuelStatistics> = {}): DuelStatistics => ({
  damageDealt: 90,
  damageTaken: 40,
  hitsLanded: 12,
  perfectBlocks: 1,
  dodgesPerformed: 0,
  maxCombo: 3,
  lowestStaminaFraction: 0.5,
  crowdHypePeak: 60,
  durationSeconds: 40,
  goldEarned: 70,
  fameEarned: 25,
  xpEarned: 40,
  ...overrides,
});

/** React escapes an apostrophe as a numeric entity in rendered text. */
const escaped = (text: string): string => text.replace(/'/g, '&#x27;');

// ════════════════════════════════════════════════════════════════════════════
// §A — the field
// ════════════════════════════════════════════════════════════════════════════
describe('STORY-4a §A — `spared` is one lazy optional map and nothing else', () => {
  test('the factory writes no `spared`, and an absent field reads as nobody spared', () => {
    const profile = fresh();
    expect(Object.keys(profile)).not.toContain('spared');
    expect(resolveSpared(profile)).toEqual({});
    expect(isRivalSpared(profile, cassius().id)).toBe(false);
  });

  test('a null, array, string or partial map resolves lazily rather than being repaired', () => {
    const shapes: unknown[] = [
      null,
      undefined,
      [],
      'spared',
      7,
      { [cassius().id]: false },
      { [cassius().id]: 'true' },
      { '': true },
    ];
    for (const shape of shapes) {
      const profile = { ...fresh(), spared: shape } as unknown as PlayerProfile;
      const resolved = resolveSpared(profile);
      expect(resolved).toEqual({});
      // …and the stored bytes are untouched: resolution never repairs a save.
      expect(profile.spared).toBe(shape as never);
    }
    const live = { ...fresh(), spared: { [cassius().id]: true, junk: false } } as PlayerProfile;
    expect(resolveSpared(live)).toEqual({ [cassius().id]: true });
  });

  test('the field is the pitch’s exact shape and it is declared last, after the omen pair', () => {
    const types = read('types/game.ts');
    expect(types).toContain('spared?: { [rivalId: string]: true };');
    const start = types.indexOf('export interface PlayerProfile {');
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
    const optional = [...body.matchAll(/^ {2}([A-Za-z][A-Za-z0-9_]*)\?:/gm)].map((m) => m[1]);
    expect(optional.length).toBe(21);
    expect(optional.slice(-2)).toEqual(['omenTrickleClaimed', 'spared']);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §B — eligibility
// ════════════════════════════════════════════════════════════════════════════
describe('STORY-4a §B — who is offered mercy (R4-R7)', () => {
  test('the population is the roster’s Tier 2+ named regulars, derived (R7)', () => {
    expect(MERCY_RIVAL_IDS).toEqual(
      LADDER_OPPONENTS.filter(
        (row) => row.isBoss !== true && row.featureBout !== true && row.tier >= MERCY_MIN_TIER
      ).map((row) => row.id)
    );
    // The roster's own names — never a literal list in the module.
    expect(MERCY_RIVAL_IDS.map((id) => rival(id).name)).toEqual([
      'Cassius the Phalanx',
      'Brutus "The Anvil"',
      'Naija the Fisher',
      'Centurion Drusus',
      'Kallias of Sparta',
      'The Pale Twins',
    ]);
    expect(code('utils/mercyBouts.ts')).not.toMatch(/opp_hoplite|opp_brutus_anvil|opp_pale_twins/);
    for (const id of MERCY_RIVAL_IDS) {
      expect(isMercyRival(rival(id))).toBe(true);
      expect(mercyOfferFor(fresh(), rival(id), true, 3)?.rivalId).toBe(id);
    }
  });

  test('a Tier-1 regular never offers (R5)', () => {
    for (const row of LADDER_OPPONENTS.filter((r) => r.tier < MERCY_MIN_TIER && r.isBoss !== true)) {
      expect(isMercyRival(row), row.id).toBe(false);
      expect(mercyOfferFor(fresh(), row, true, 3), row.id).toBeNull();
    }
  });

  test('Sextus the Yard Measure never offers (R5 — the story bout)', () => {
    expect(DOCTORE_TEST_OPPONENT.id).toBe('opp_doctore_sextus');
    expect(isMercyRival(DOCTORE_TEST_OPPONENT)).toBe(false);
    expect(mercyOfferFor(fresh(), DOCTORE_TEST_OPPONENT, true, 3)).toBeNull();
  });

  test('no boss offers mercy — ladder bosses and Feature Bout bosses alike (R5)', () => {
    const ladderBosses = ALL_OPPONENTS.filter((row) => row.isBoss === true && row.featureBout !== true);
    const featureBosses = FEATURE_BOUT_OPPONENTS;
    expect(ladderBosses.length).toBeGreaterThan(0);
    expect(featureBosses.length).toBeGreaterThan(0);
    for (const boss of [...ladderBosses, ...featureBosses]) {
      expect(isMercyRival(boss), boss.id).toBe(false);
      expect(mercyOfferFor(fresh(), boss, true, 3), boss.id).toBeNull();
      expect(MERCY_RIVAL_IDS).not.toContain(boss.id);
    }
  });

  test('a victory inside a generated grudge bout never offers — the rival already chose (R5)', () => {
    const grudge = buildGrudgeOpponent(cassius(), 'quick');
    expect(grudge).not.toBeNull();
    expect(grudge!.id).toBe(grudgeIdOf(cassius().id));
    expect(isMercyRival(grudge)).toBe(false);
    expect(mercyOfferFor(fresh(), grudge, true, 3)).toBeNull();
  });

  test('a defeat never offers, whatever the rival', () => {
    expect(mercyOfferFor(fresh(), cassius(), false, 3)).toBeNull();
    for (const id of MERCY_RIVAL_IDS) {
      expect(mercyOfferFor(fresh(), rival(id), false, MERCY_CHAPTER)).toBeNull();
    }
  });

  test('Chapters 0-2 never offer; Chapter 3 and later do (R6)', () => {
    for (const chapter of [0, 1, 2]) {
      expect(mercyOfferFor(fresh(), cassius(), true, chapter), `chapter ${chapter}`).toBeNull();
    }
    expect(mercyOfferFor(fresh(), cassius(), true, MERCY_CHAPTER)).not.toBeNull();
    expect(mercyOfferFor(fresh(), cassius(), true, MERCY_CHAPTER + 1)).not.toBeNull();
  });

  test('the shipped chapter really is dormant today — R6’s stated consequence', () => {
    // `resolveStoryState` holds the campaign at Chapter 2 until Stage 2 lands the
    // race-results write, so with NO override the offer cannot fire yet.
    const profile = fresh();
    expect(resolveStoryState(profile).chapter).toBeLessThan(MERCY_CHAPTER);
    expect(mercyOfferFor(profile, cassius(), true)).toBeNull();
    // …and even a played profile that has closed every available gate is held.
    const played: PlayerProfile = {
      ...fresh(),
      fightsWon: 4,
      currentTier: 3,
      defeatedOpponentIds: ['opp_marcus', 'opp_goliath_boss'],
      road: { oathSworn: true, milestonesSeen: ['sworn', 'blooded', 'known'] },
    };
    expect(resolveStoryState(played).chapter).toBeLessThan(MERCY_CHAPTER);
  });

  test('R4 — a defeat recorded before this slice never earns a retroactive offer', () => {
    const legacy = afterBeatingCassius();
    expect(mercyOfferFor(legacy, cassius(), true, 3)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §C — once each
// ════════════════════════════════════════════════════════════════════════════
describe('STORY-4a §C — once per rival', () => {
  test('a spared rival never offers again (the spared map enforces it)', () => {
    const spared = spareRival(fresh(), cassius().id);
    expect(mercyOfferFor(spared, cassius(), true, 3)).toBeNull();
    // A different rival is unaffected.
    expect(mercyOfferFor(spared, rival(DRUSUS), true, 3)).not.toBeNull();
  });

  test('a beaten rival never offers again, spared or no flag (the first-defeat rule)', () => {
    expect(mercyOfferFor(afterBeatingCassius(), cassius(), true, 3)).toBeNull();
    // Nor after a Finish: the id stays in the book, so no later win is a first win.
    const finished = finishRival(afterBeatingCassius(), cassius().id, 25).profile;
    expect(mercyOfferFor(finished, cassius(), true, 3)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §D — Spare
// ════════════════════════════════════════════════════════════════════════════
describe('STORY-4a §D — Spare writes the flag and keeps the grudge (R2)', () => {
  test('it writes `spared[rivalId] = true` exactly and touches nothing else', () => {
    const before = afterBeatingCassius('power');
    const after = spareRival(before, cassius().id);
    expect(after).not.toBe(before);
    expect(after.spared).toEqual({ [cassius().id]: true });
    expect(after.grudges).toEqual(before.grudges);
    expect(after.fame).toBe(before.fame);
    expect(after.gold).toBe(before.gold);
    expect(after.defeatedOpponentIds).toEqual(before.defeatedOpponentIds);
    // The input is never mutated.
    expect('spared' in before).toBe(false);
  });

  test('a second write for the same rival changes nothing — it returns the caller’s object', () => {
    const once = spareRival(fresh(), cassius().id);
    const twice = spareRival(once, cassius().id);
    expect(twice).toBe(once);
    expect(Object.keys(resolveSpared(twice))).toEqual([cassius().id]);
  });

  test('the spared rival keeps a LIVE grudge — the bout is the return path', () => {
    const spared = spareRival(afterBeatingCassius('quick'), cassius().id);
    const statuses = grudgeBoutStatuses({ ...spared, currentTier: 3 });
    const grudge = statuses.find((status) => status.base.id === cassius().id);
    expect(grudge).toBeDefined();
    expect(grudge!.settled).toBe(false);
    expect(grudge!.grudgeTier).toBe(3);
    expect(grudge!.open).toBe(true);
  });

  test('an empty or junk rival id is a no-op', () => {
    const before = fresh();
    expect(spareRival(before, '')).toBe(before);
    expect(spareRival(before, undefined as unknown as string)).toBe(before);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §E — Finish
// ════════════════════════════════════════════════════════════════════════════
describe('STORY-4a §E — Finish pays x1.25 once and removes the grudge (R1, R2)', () => {
  test('it pays the final fame x1.25, rounded, as one increment', () => {
    expect(FINISH_FAME_MULTIPLIER).toBe(1.25);
    const before = afterBeatingCassius();
    const outcome = finishRival(before, cassius().id, 40);
    expect(outcome.totalFame).toBe(50);
    expect(outcome.extraFame).toBe(10);
    expect(outcome.profile.fame).toBe(before.fame + 10);
    // Rounding: 3 x 1.25 = 3.75 -> 4, so the increment is 1 and never a fraction.
    const odd = finishRival(before, cassius().id, 3);
    expect(odd.totalFame).toBe(4);
    expect(odd.extraFame).toBe(1);
    expect(Number.isInteger(odd.profile.fame)).toBe(true);
    // A zero or non-finite final fame pays nothing and cannot produce NaN.
    expect(finishRival(before, cassius().id, 0).extraFame).toBe(0);
    expect(finishRival(before, cassius().id, Number.NaN).extraFame).toBe(0);
  });

  test('gold is untouched by mercy, and a Finish writes no spared flag', () => {
    const before = afterBeatingCassius();
    const outcome = finishRival(before, cassius().id, 40);
    expect(outcome.profile.gold).toBe(before.gold);
    expect('spared' in outcome.profile).toBe(false);
    expect(isRivalSpared(outcome.profile, cassius().id)).toBe(false);
    expect(resolveSpared(outcome.profile)).toEqual({});
  });

  test('it touches only that rival’s key — even a malformed sibling entry is left as stored', () => {
    const before = {
      ...afterBeatingCassius('power'),
      grudges: {
        [cassius().id]: { dominant: 'power' },
        // A junk entry no resolver would keep: it must survive the write untouched.
        junk: { notAClass: true },
      },
    } as unknown as PlayerProfile;
    const outcome = finishRival(before, cassius().id, 25);
    const stored = outcome.profile.grudges as unknown as Record<string, unknown>;
    expect(Object.keys(stored)).toEqual(['junk']);
    expect(stored.junk).toEqual({ notAClass: true });
  });

  test('it removes that defeat’s grudge and leaves every other record standing', () => {
    const before: PlayerProfile = {
      ...afterBeatingCassius('power'),
      defeatedOpponentIds: [cassius().id, DRUSUS],
      grudges: {
        [cassius().id]: { dominant: 'power' },
        [DRUSUS]: { dominant: 'quick', closed: true },
      },
    };
    const outcome = finishRival(before, cassius().id, 25);
    expect(outcome.profile.grudges?.[cassius().id]).toBeUndefined();
    expect(outcome.profile.grudges?.[DRUSUS]).toEqual({ dominant: 'quick', closed: true });
    // The input is never mutated.
    expect(before.grudges?.[cassius().id]).toEqual({ dominant: 'power' });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §F — the grudge interplay and the board cards
// ════════════════════════════════════════════════════════════════════════════
describe('STORY-4a §F — a finished rival never returns; the board prints the live grudges', () => {
  test('a finished rival generates no future grudge and is derived as finished', () => {
    const finished = finishRival(afterBeatingCassius(), cassius().id, 25).profile;
    expect(isRivalFinished(finished, cassius().id)).toBe(true);
    expect(hasFinishedAnyRival(finished)).toBe(true);
    // A later standard victory cannot re-create the record (not a first victory).
    const rewon = recordStandardVictory(finished, cassius(), 'power');
    expect(rewon).toBe(finished);
    expect(rewon.grudges?.[cassius().id]).toBeUndefined();
    expect(grudgeBoutStatuses({ ...rewon, currentTier: 3 })).toHaveLength(0);
  });

  test('the C-A fence is unchanged: no boss generates a grudge, and none is a mercy rival', () => {
    for (const boss of ALL_OPPONENTS.filter((row) => row.isBoss === true)) {
      expect(buildGrudgeOpponent(boss, 'power'), boss.id).toBeNull();
      expect(MERCY_RIVAL_IDS, boss.id).not.toContain(boss.id);
    }
  });

  test('the board card prints base -> adjusted through the C-A helper, inside the caps', () => {
    const profile = { ...afterBeatingCassius('power'), currentTier: 3 };
    const cards = boardGrudgeCards(profile);
    expect(cards).toHaveLength(1);
    const card = cards[0];
    const status = grudgeBoutStatuses(profile)[0];
    expect(card.rivalId).toBe(cassius().id);
    expect(card.boutId).toBe(grudgeIdOf(cassius().id));
    expect(card.shifts).toBe(grudgeProfileLine(status.opponent.grudge));
    expect(card.shifts).toBe('Guard 0.65 → 0.75 · Aggression 0.45 → 0.40');

    // Every printed pair is inside the published caps and the [0.05, 0.95] clamp.
    for (const studied of ['power', 'quick', 'even'] as const) {
      const one = boardGrudgeCards({
        ...fresh(),
        defeatedOpponentIds: [cassius().id],
        grudges: { [cassius().id]: { dominant: studied } },
        currentTier: 3,
      })[0];
      const grudge = grudgeBoutStatuses({
        ...fresh(),
        defeatedOpponentIds: [cassius().id],
        grudges: { [cassius().id]: { dominant: studied } },
        currentTier: 3,
      })[0].opponent.grudge!;
      const deltas = [
        grudge.adjustedProfile.blockChance - grudge.baseProfile.blockChance,
        grudge.adjustedProfile.aggression - grudge.baseProfile.aggression,
      ];
      for (const delta of deltas) expect(Math.abs(delta)).toBeLessThanOrEqual(0.15 + 1e-9);
      for (const value of Object.values(grudge.adjustedProfile)) {
        expect(value).toBeGreaterThanOrEqual(0.05);
        expect(value).toBeLessThanOrEqual(0.95);
      }
      expect(one.shifts).toBe(grudgeProfileLine(grudge));
    }
  });

  test('the granted palma is named (C-TRAIT), and a settled grudge shows no card', () => {
    const profile = { ...afterBeatingCassius('power'), currentTier: 3 };
    const card = boardGrudgeCards(profile)[0];
    const evolved = grudgeBoutStatuses(profile)[0].opponent.grudge!.evolvedTrait;
    expect(card.palmaName).toBe(getPalma(evolved)!.name);
    expect(card.trait).toContain(card.palmaName);

    const settled = boardGrudgeCards({
      ...profile,
      grudges: { [cassius().id]: { dominant: 'power', settled: true } },
    });
    expect(settled).toHaveLength(0);
  });

  test('the Primus Palus board renders the card on the rival’s own entry', () => {
    const profile = { ...afterBeatingCassius('power'), currentTier: 3, fightsWon: 1 };
    const markup = renderToStaticMarkup(React.createElement(PrimusPalusBoard, { profile }));
    expect(markup).toContain(`data-board-grudge="${cassius().id}"`);
    expect(markup).toContain(`data-board-grudge-bout="${grudgeIdOf(cassius().id)}"`);
    expect(markup).toContain(escaped('Guard 0.65 → 0.75 · Aggression 0.45 → 0.40'));
    const card = boardGrudgeCards(profile)[0];
    expect(markup).toContain(escaped(card.palmaName));
    // The card rides the entry, and it adds no click target of its own.
    const entry = markup.slice(markup.indexOf(`data-board-entry="${cassius().id}"`));
    expect(entry.slice(0, entry.indexOf('</li>'))).toContain(`data-board-grudge="${cassius().id}"`);
    expect(BOARD).not.toContain('onClick');
    expect(BOARD).not.toContain('href');
    // A profile with no grudge prints no card at all.
    const none = renderToStaticMarkup(
      React.createElement(PrimusPalusBoard, { profile: { ...fresh(), fightsWon: 1 } })
    );
    expect(none).not.toContain('data-board-grudge');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §G — the words
// ════════════════════════════════════════════════════════════════════════════
describe('STORY-4a §G — the herald lines fire once, the keeper speaks in flavor', () => {
  test('the first Spare fires one herald line, and only the first', () => {
    expect(isFirstMercyOfKind(fresh(), 'spare')).toBe(true);
    expect(mercyHeraldCries('spare', true)).toEqual([MERCY_FIRST_SPARE_CRY]);
    const spared = spareRival(fresh(), cassius().id);
    expect(isFirstMercyOfKind(spared, 'spare')).toBe(false);
    expect(mercyHeraldCries('spare', false)).toEqual([]);
  });

  test('the first Finish fires one herald line, and only the first', () => {
    expect(isFirstMercyOfKind(fresh(), 'finish')).toBe(true);
    expect(mercyHeraldCries('finish', true)).toEqual([MERCY_FIRST_FINISH_CRY]);
    const finished = finishRival(afterBeatingCassius(), cassius().id, 25).profile;
    expect(isFirstMercyOfKind(finished, 'finish')).toBe(false);
    expect(mercyHeraldCries('finish', false)).toEqual([]);
    // A Spare does not spend the first-Finish line.
    const sparedOnly = spareRival(fresh(), cassius().id);
    expect(isFirstMercyOfKind(sparedOnly, 'finish')).toBe(true);
  });

  test('the herald’s lines carry no numbers and promise no mechanic', () => {
    for (const cry of [MERCY_FIRST_SPARE_CRY, MERCY_FIRST_FINISH_CRY]) {
      expect(cry).not.toMatch(/\d/);
      expect(cry.toLowerCase()).not.toContain('fame');
      expect(cry.toLowerCase()).not.toContain('gold');
      expect(cry.toLowerCase()).not.toContain('grudge');
    }
  });

  test('the teaching lines exist and ride only the first offer', () => {
    expect(MERCY_TEACHING_LINES.length).toBe(3);
    for (const line of MERCY_TEACHING_LINES) expect(line).not.toMatch(/\d/);
    expect(mercyOfferFor(fresh(), cassius(), true, 3)?.teaching).toBe(true);
    // Once any mercy has been taken the teaching lines are spent.
    expect(mercyOfferFor(spareRival(fresh(), DRUSUS), cassius(), true, 3)?.teaching).toBe(false);
    const finished = finishRival(
      { ...fresh(), defeatedOpponentIds: [DRUSUS], grudges: { [DRUSUS]: { dominant: 'even' } } },
      DRUSUS,
      20
    ).profile;
    expect(mercyOfferFor(finished, cassius(), true, 3)?.teaching).toBe(false);
  });

  test('the keeper’s lines are flavor: no numbers, and the house mark claims nothing (R3)', () => {
    const offer = mercyKeeperLine('offer', cassius().name);
    const spare = mercyKeeperLine('spare', cassius().name);
    const finish = mercyKeeperLine('finish', cassius().name);
    for (const line of [offer, spare, finish]) expect(line).not.toMatch(/\d/);
    expect(finish.toLowerCase()).toContain('house');
    // R3 — the price and bounty mechanics are deferred, so the line names no price,
    // no shop and no bounty.
    for (const word of ['price', 'shop', 'bounty', 'gold']) {
      expect(finish.toLowerCase()).not.toContain(word);
    }
    expect(offer).not.toBe(spare);
    expect(spare).not.toBe(finish);
    // Every Director ruling the slice applies is flagged in the source (R1, R2, R3).
    const source = read('utils/mercyBouts.ts');
    for (const ruling of ['R1', 'R2', 'R3']) {
      expect(
        source.includes(`STORY-4a — Director ruling ${ruling}`),
        `the ${ruling} ruling is flagged in the source`
      ).toBe(true);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §H — the surfaces
// ════════════════════════════════════════════════════════════════════════════
describe('STORY-4a §H — the result surface holds the flow; App writes each answer once', () => {
  const renderModal = (
    mercy: Parameters<typeof DuelResultModal>[0]['mercy'],
    extra: Partial<Parameters<typeof DuelResultModal>[0]> = {}
  ) =>
    renderToStaticMarkup(
      React.createElement(DuelResultModal, {
        didWin: true,
        opponent: cassius(),
        stats: stats(),
        mercy,
        onMercyChoice: () => {},
        onContinue: () => {},
        ...extra,
      })
    );

  test('an eligible victory shows the two answers and NO way past them', () => {
    const markup = renderModal({ rivalId: cassius().id, rivalName: cassius().name, teaching: true });
    expect(markup).toContain(`data-duel-mercy-offer="${cassius().id}"`);
    expect(markup).toContain('data-duel-mercy="spare"');
    expect(markup).toContain('data-duel-mercy="finish"');
    expect(markup).toContain(`data-duel-mercy-teaching="${MERCY_TEACHING_LINES.length}"`);
    expect(markup).toContain(escaped(MERCY_TEACHING_LINES[0]));
    // The modal does not finalize past the choice: the return button is absent.
    expect(markup).not.toContain('Return to Metropolis');
    // Both answers state their rule and their reason.
    expect(markup).toContain('grudge bout');
    expect(markup).toContain('quarter more fame');
  });

  test('a non-first offer drops the teaching lines but keeps the choice', () => {
    const markup = renderModal({ rivalId: cassius().id, rivalName: cassius().name, teaching: false });
    expect(markup).toContain('data-duel-mercy-offer');
    expect(markup).not.toContain('data-duel-mercy-teaching');
  });

  test('an answered result shows the consequence and restores the return button', () => {
    const spare = renderModal({
      rivalId: cassius().id,
      rivalName: cassius().name,
      teaching: false,
      chosen: 'spare',
    });
    expect(spare).toContain('data-duel-mercy-chosen="spare"');
    expect(spare).toContain(escaped(mercyChoiceLine('spare', cassius().name)));
    expect(spare).toContain('Return to Metropolis');
    expect(spare).not.toContain('data-duel-mercy="spare"');

    const finish = renderModal({
      rivalId: cassius().id,
      rivalName: cassius().name,
      teaching: false,
      chosen: 'finish',
      extraFame: 10,
    });
    expect(finish).toContain('data-duel-mercy-chosen="finish"');
    expect(finish).toContain(escaped(mercyChoiceLine('finish', cassius().name, 10)));
    expect(finish).toContain('Return to Metropolis');
  });

  test('a result with no offer renders exactly as it always has', () => {
    const none = renderModal(null);
    expect(none).not.toContain('data-duel-mercy');
    expect(none).toContain('Return to Metropolis');
  });

  test('the modal writes nothing — it reports the answer to App', () => {
    expect(MODAL).not.toMatch(/saveProfile|localStorage|sessionStorage/);
    expect(MODAL).toContain("onMercyChoice?.('spare')");
    expect(MODAL).toContain("onMercyChoice?.('finish')");
  });

  test('App decides the offer at the duel’s own write and passes the answer up', () => {
    const handler = APP_CODE.slice(
      APP_CODE.indexOf('const handleMatchComplete'),
      APP_CODE.indexOf('const handleDuelResultDismiss')
    );
    expect(handler).toContain('mercyOfferFor(profile, activeOpponent, didWin)');
    expect(handler).toContain('finalFame: resultStats.fameEarned');
    expect(handler.match(/saveProfile\(/g)?.length).toBe(1);
    expect(APP_CODE).toContain('mercy={duelResult.mercy ?? null}');
    expect(APP_CODE).toContain('onMercyChoice={handleMercyChoice}');
  });

  test('each answer writes exactly once — one save, guarded by the once ref', () => {
    const start = APP_CODE.indexOf('const handleMercyChoice');
    expect(start).toBeGreaterThan(-1);
    const body = APP_CODE.slice(start, APP_CODE.indexOf('\n  };', start));
    expect(body.match(/saveProfile\(/g)?.length).toBe(1);
    expect(body).toContain('duelResult.mercy.chosen');
    expect(body).toContain('mercyWrittenRef.current === offer.rivalId');
    expect(body).toContain('spareRival(profile, offer.rivalId)');
    expect(body).toContain('finishRival(profile, offer.rivalId, offer.finalFame)');
    expect(body).toContain('isFirstMercyOfKind(profile, choice)');
    expect(body).toContain('mercyHeraldCries(choice, first)');
  });

  test('the spared field has exactly one writer in the tree', () => {
    const files = ['utils/mercyBouts.ts', 'App.tsx', 'services/storage.ts', 'components/hub/DuelResultModal.tsx'];
    for (const file of files) {
      const source = code(file);
      if (file === 'utils/mercyBouts.ts') {
        expect(source).toContain('spared: { ...spared, [rivalId]: true }');
        continue;
      }
      expect(source, file).not.toMatch(/spared\s*:/);
    }
    // The factory never writes the field (a fresh save carries none).
    expect('spared' in fresh()).toBe(false);
  });

  test('the save corpus carries the new fixture, with §J at twenty-one fields', () => {
    // Read as DATA, not imported through the registry: `saveCorpus.test.ts` §H pins
    // the corpus's consumer list exactly, and this suite must not widen it just to
    // look at one fixture.  §A of that suite owns file<->registry registration.
    const raw = JSON.parse(
      read('utils/saveFixtures/mercyEraProfile.json')
    ) as Record<string, unknown>;
    expect(read('utils/saveFixtures/index.ts')).toContain("id: 'mercy-era',");
    expect(raw.spared).toEqual({ [cassius().id]: true });
    // A spared rival keeps his grudge, and a finished one has none left.
    expect((raw.grudges as Record<string, unknown>)[cassius().id]).toBeDefined();
    expect('opp_brutus_anvil' in (raw.grudges as Record<string, unknown>)).toBe(false);
    expect((raw.defeatedOpponentIds as string[])).toContain('opp_brutus_anvil');
    expect(isRivalFinished(raw as unknown as PlayerProfile, 'opp_brutus_anvil')).toBe(true);
    expect(isRivalSpared(raw as unknown as PlayerProfile, cassius().id)).toBe(true);
    // §J's list, as the corpus suite reads it out of `types/game.ts`.
    expect(read('utils/saveCorpus.test.ts')).toContain("      'spared',\n    ]);");
  });
});
