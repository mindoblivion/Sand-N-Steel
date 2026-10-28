/**
 * STORY-5a — THE LOADED DICE (Story §3A) + the QUIET DICE chain (§2.4), pinned.
 *
 * What this suite proves, in the order the slice is written:
 *   §A  the chain, IN ORDER: step 1 on a deep card, step 2 as a STAGED standard
 *       bout, step 3 the return that opens the board — and the board is LOCKED
 *       before step 3, whatever else the record carries
 *   §B  the board's sequence: card N+1 sealed until card N is won, and every
 *       card NAMES ITS BOUT (a real roster row, non-boss, its own row)
 *   §C  the offer: only after all three cards, both answers reachable, mutually
 *       exclusive, gone after the answer
 *   §D  'cut' pays DICE_CUT_GOLD, closes her rumour service for good, and the
 *       full cost is printed BEFORE the choice; 'refused' pays nothing here (the
 *       champion's own standard purse is the honest purse)
 *   §E  the rewards: +5 `records.laudes`, the house cup flag, and the tavern's
 *       watered-wine line variant present IF AND ONLY IF the cup is owned
 *   §F  the guards: §J stays at 22 top-level optional fields with `records`
 *       last; no new top-level field; S7's price/transaction untouched; the
 *       board is a SECTION of the tavern panel; the trail imports no combat,
 *       storage or clock module; no opponent row was added
 *   §G  STORY-4a's fence: a trail bout NEVER offers Spare/Finish, while the same
 *       row fought as an ordinary duel still does (proved through 4a's own
 *       dormant chapter seam)
 *   §H  the panel: the shipped section server-rendered at every state
 *
 * `.ts` with `React.createElement` rather than JSX on purpose: the brief names
 * this path, and bun's `.ts` transform rejects JSX (the trap `intelSurface` and
 * `consumablesSurface` record).
 *
 * Run with: `bun test src/utils/diceTrail.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OpponentConfig, PlayerProfile } from '../types/game';
import { createNewProfile } from '../services/storage';
import { ALL_OPPONENTS } from '../data/opponents';
import { INTEL_PRICE, purchaseIntel, resolveIntel } from './intel';
import { mercyOfferFor } from './mercyBouts';
import {
  DICE_CHAIN_CHAMPION,
  DICE_CHAIN_LAUDES,
  DICE_CHOICE_COST_LINES,
  DICE_CUT_GOLD,
  DICE_DEEP_CARD_PRICE,
  DICE_ENDING_CHAMPION,
  DICE_RUMORS,
  DICE_TRAIL_BOUTS,
  HOUSE_CUP_LINE,
  QUIET_DICE_CLOSING_LINE,
  TAVERN_WINE_LINE,
  applyDiceChoice,
  diceChainAwaitingReturn,
  diceChainSteps,
  diceTrailBoutOpponent,
  diceTrailView,
  isDiceTrailStaged,
  isRumourServiceClosed,
  mercyOfferForDuel,
  resolveDiceTrail,
  resolveLaudes,
  withDiceChainClosed,
  withDiceTrailVictory,
  withLaudes,
} from './diceTrail';
import { DiceTrailSection } from '../components/hub/DiceTrailSection';

const SOURCE_DIR = fileURLToPath(new URL('../', import.meta.url));
const raw = (path: string): string => readFileSync(join(SOURCE_DIR, path), 'utf8');
const code = (path: string): string =>
  raw(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const base = (): PlayerProfile => createNewProfile('Dice Trail');

/** Buy one deep card — the design's "a rumour from her" (S7's own transaction). */
const withDeepCard = (profile: PlayerProfile = base()): PlayerProfile => {
  const bought = purchaseIntel(profile, 'opp_marcus');
  if (!bought.ok) throw new Error('the deep card must be affordable on a fresh purse');
  return bought.profile;
};

/** His champion has fallen (the ordinary victory write records the id). */
const withChampionBeaten = (profile: PlayerProfile): PlayerProfile => ({
  ...profile,
  defeatedOpponentIds: [...profile.defeatedOpponentIds, DICE_CHAIN_CHAMPION.opponentId],
});

/** The whole chain walked, board open. */
const boardOpen = (): PlayerProfile => withDiceChainClosed(withChampionBeaten(withDeepCard()));

/** The board with its first N cards won (in order). */
const withCardsWon = (profile: PlayerProfile, count: number): PlayerProfile =>
  DICE_RUMORS.slice(0, count).reduce(
    (current, rumor) => withDiceTrailVictory(current, rumor.bout.opponentId),
    profile
  );

const rosterRow = (id: string): OpponentConfig => {
  const row = ALL_OPPONENTS.find((opponent) => opponent.id === id);
  if (!row) throw new Error(`no roster row ${id}`);
  return row;
};

/**
 * Every optional top-level member `PlayerProfile` declares, in declaration order
 * — the same scan `saveCorpus` §J runs, shared here by both of §F's guards.
 */
const optionalProfileFields = (): string[] => {
  const types = raw('types/game.ts');
  const start = types.indexOf('export interface PlayerProfile {');
  if (start < 0) throw new Error('PlayerProfile not found');
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
  return [...types.slice(start, end).matchAll(/^ {2}([A-Za-z][A-Za-z0-9_]*)\?:/gm)].map(
    (match) => match[1]
  );
};

const render = (profile: PlayerProfile): string =>
  renderToStaticMarkup(
    React.createElement(DiceTrailSection, {
      profile,
      onEnterBout: () => undefined,
      onChooseEnding: () => undefined,
    })
  );

// ── §A the chain, in order ─────────────────────────────────────────────────
describe('STORY-5a §A — the Quiet Dice chain, in order', () => {
  test('a fresh profile owes all three steps, and enters no bout yet', () => {
    const profile = base();
    const steps = diceChainSteps(profile);
    expect(steps.step1Done).toBe(false);
    expect(steps.step2Done).toBe(false);
    expect(steps.complete).toBe(false);
    expect(diceChainAwaitingReturn(profile)).toBe(false);
    // Step 1 comes first: with no deep card there is no bout to enter at all.
    expect(diceTrailView(profile).nextBout).toBeUndefined();
    expect(resolveDiceTrail(profile)).toEqual({ boardOpen: false, rumorsWon: [], cup: false });
    expect(resolveLaudes(profile)).toBe(0);
  });

  test('STEP 1 resolves on ANY S7 deep card — all tavern rumours are hers', () => {
    const profile = withDeepCard();
    expect(resolveIntel(profile)).toEqual(['opp_marcus']);
    expect(diceChainSteps(profile).step1Done).toBe(true);
    expect(diceChainSteps(profile).step2Done).toBe(false);
    // A deep card is 15 gold, S7's own price: the trail adds no charge.
    expect(profile.gold).toBe(base().gold - INTEL_PRICE);
    expect(DICE_DEEP_CARD_PRICE).toBe(INTEL_PRICE);
  });

  test('STEP 2 is a STAGED standard bout: a real ladder row, never a boss row', () => {
    const view = diceTrailView(withDeepCard());
    expect(view.nextBout?.bout.key).toBe('chain');
    expect(view.nextBout?.bout.opponentId).toBe(DICE_CHAIN_CHAMPION.opponentId);
    const row = view.nextBout!.opponent;
    expect(row.id).toBe('opp_flaccus');
    expect(row.name).toBe(DICE_CHAIN_CHAMPION.staging);
    // No boss mechanics, no new row: it is the arena's own regular, untouched.
    expect(row.isBoss).not.toBe(true);
    expect(row.featureBout).not.toBe(true);
    expect(row.bountyBout).not.toBe(true);
    expect(row.bossMechanic).toBeUndefined();
    // A standard ladder row: no false telegraph and no unbroken panoply either —
    // the two other boss-presentation configs a row can carry.
    expect(row.falseTelegraph).toBeUndefined();
    expect(row.panoply).toBeUndefined();
    expect(isDiceTrailStaged(row)).toBe(true);
    // The chain text names the row it stages.
    expect(raw('utils/diceTrail.ts')).toContain('Flaccus the Nimble');
  });

  test('STEP 2 resolves on the win, and the return is then owed', () => {
    const profile = withChampionBeaten(withDeepCard());
    expect(diceChainSteps(profile).step2Done).toBe(true);
    expect(diceChainSteps(profile).complete).toBe(false);
    expect(diceChainAwaitingReturn(profile)).toBe(true);
    // Nothing more to fight; the next move is HER counter.
    expect(diceTrailView(profile).nextBout).toBeUndefined();
  });

  test('STEP 3 — the return opens the board, once, and pays the chain', () => {
    const ready = withChampionBeaten(withDeepCard());
    const closed = withDiceChainClosed(ready);
    expect(resolveDiceTrail(closed).boardOpen).toBe(true);
    expect(diceChainSteps(closed).complete).toBe(true);
    expect(diceChainAwaitingReturn(closed)).toBe(false);
    // Identity-stable: a second open of the panel writes nothing and pays nothing.
    expect(withDiceChainClosed(closed)).toBe(closed);
  });

  test('the board is LOCKED before step 3, whatever else the record carries', () => {
    const profile = withChampionBeaten(withDeepCard());
    const view = diceTrailView(profile);
    expect(view.boardOpen).toBe(false);
    expect(view.rumors.map((entry) => entry.unlocked)).toEqual([false, false, false]);
    // Nor can a card be won before the board exists.
    const attempted = withDiceTrailVictory(profile, DICE_RUMORS[0].bout.opponentId);
    expect(attempted).toBe(profile);
    // Nor can the offer be answered.
    expect(applyDiceChoice(profile, 'cut').ok).toBe(false);
  });

  test('step 3 is reached ONLY through steps 1 and 2 together', () => {
    // Champion beaten but never bought a card: nothing to return for.
    const noCard = withChampionBeaten(base());
    expect(withDiceChainClosed(noCard)).toBe(noCard);
    // Card bought but no champion: nothing to hear about.
    const bought = withDeepCard();
    expect(diceChainAwaitingReturn(bought)).toBe(false);
    expect(withDiceChainClosed(bought)).toBe(bought);
  });
});

// ── §B the board's sequence ────────────────────────────────────────────────
describe('STORY-5a §B — the rumor board, in sequence', () => {
  test('card 1 opens at board-open; cards 2 and 3 stay sealed', () => {
    const view = diceTrailView(boardOpen());
    expect(view.rumors.map((entry) => entry.unlocked)).toEqual([true, false, false]);
    expect(view.rumors.map((entry) => entry.won)).toEqual([false, false, false]);
    expect(view.nextBout?.bout.key).toBe('rumor1');
  });

  test('card N+1 unlocks only after card N is WON, and in order', () => {
    const one = withCardsWon(boardOpen(), 1);
    expect(resolveDiceTrail(one).rumorsWon).toEqual(['rumor1']);
    expect(diceTrailView(one).rumors.map((entry) => entry.unlocked)).toEqual([true, true, false]);

    const two = withCardsWon(boardOpen(), 2);
    expect(diceTrailView(two).rumors.map((entry) => entry.unlocked)).toEqual([true, true, true]);
    expect(diceTrailView(two).nextBout?.bout.key).toBe('rumor3');
  });

  test('a win on any other row records nothing (a re-fight cannot double-count)', () => {
    const one = withCardsWon(boardOpen(), 1);
    expect(withDiceTrailVictory(one, DICE_RUMORS[0].bout.opponentId)).toBe(one);
    expect(withDiceTrailVictory(one, DICE_RUMORS[2].bout.opponentId)).toBe(one);
    expect(withDiceTrailVictory(one, 'opp_marcus')).toBe(one);
  });

  test('every card NAMES ITS BOUT — a real, distinct, non-boss ladder row', () => {
    const staged = DICE_RUMORS.map((rumor) => rumor.bout);
    for (const [index, bout] of staged.entries()) {
      const row = diceTrailBoutOpponent(bout);
      expect(row).toBeDefined();
      expect(row!.name).toBe(bout.staging);
      expect(row!.isBoss).not.toBe(true);
      expect(row!.bossMechanic).toBeUndefined();
      // The card's own text names the man it stages.
      expect(DICE_RUMORS[index].text).toContain(bout.staging);
    }
    // Five DIFFERENT rows across the whole slice, no repeats.
    const ids = DICE_TRAIL_BOUTS.map((bout) => bout.opponentId);
    expect(new Set(ids).size).toBe(5);
    expect(ids).toEqual([
      'opp_flaccus',
      'opp_hoplite',
      'opp_brutus_anvil',
      'opp_naija_fisher',
      'opp_kallias_sparta',
    ]);
    // Every staged id is an existing roster row: this slice adds none.
    expect(ALL_OPPONENTS.length).toBe(23);
    for (const id of ids) expect(ALL_OPPONENTS.some((row) => row.id === id)).toBe(true);
  });

  test('no race bout: every bout of the slice is a DUEL (a roster row)', () => {
    for (const bout of DICE_TRAIL_BOUTS) {
      expect(diceTrailBoutOpponent(bout)?.id).toBe(bout.opponentId);
    }
    // The module says so in words, so the deferral cannot be lost.
    expect(raw('utils/diceTrail.ts')).toContain('NO RACE BOUT IN THIS SLICE');
  });
});

// ── §C the offer ───────────────────────────────────────────────────────────
describe('STORY-5a §C — Piso’s offer', () => {
  test('the offer appears ONLY after all three cards are won', () => {
    expect(diceTrailView(boardOpen()).offerOpen).toBe(false);
    expect(diceTrailView(withCardsWon(boardOpen(), 2)).offerOpen).toBe(false);
    expect(diceTrailView(withCardsWon(boardOpen(), 3)).offerOpen).toBe(true);
    // And answering is impossible before it opens.
    expect(applyDiceChoice(withCardsWon(boardOpen(), 2), 'cut')).toEqual({
      ok: false,
      reason: 'not-open',
    });
  });

  test('both endings are reachable, and neither pays the other’s purse', () => {
    const ready = withCardsWon(boardOpen(), 3);
    const cut = applyDiceChoice(ready, 'cut');
    const refused = applyDiceChoice(ready, 'refused');
    expect(cut.ok && refused.ok).toBe(true);
    if (!cut.ok || !refused.ok) throw new Error('both answers must be offered');
    expect(cut.profile.story?.diceEnding).toBe('cut');
    expect(refused.profile.story?.diceEnding).toBe('refused');
    expect(cut.profile.gold).toBe(ready.gold + DICE_CUT_GOLD);
    expect(refused.profile.gold).toBe(ready.gold);
  });

  test('the answers are MUTUALLY EXCLUSIVE: the first answer locks the other', () => {
    const ready = withCardsWon(boardOpen(), 3);
    const cut = applyDiceChoice(ready, 'cut');
    if (!cut.ok) throw new Error('cut must be offered');
    expect(applyDiceChoice(cut.profile, 'refused')).toEqual({
      ok: false,
      reason: 'already-answered',
    });
    expect(cut.profile.story?.diceEnding).toBe('cut');

    const refused = applyDiceChoice(ready, 'refused');
    if (!refused.ok) throw new Error('refused must be offered');
    expect(applyDiceChoice(refused.profile, 'cut')).toEqual({
      ok: false,
      reason: 'already-answered',
    });
    // The offer is GONE from the panel once an answer stands.
    expect(diceTrailView(cut.profile).offerOpen).toBe(false);
    expect(diceTrailView(refused.profile).offerOpen).toBe(false);
  });

  test('the FULL COST is printed before the choice, both sides of it', () => {
    const html = render(withCardsWon(boardOpen(), 3));
    expect(html).toContain('data-dice-offer');
    expect(html).toContain('data-dice-cost="cut"');
    expect(html).toContain('data-dice-cost="refused"');
    expect(DICE_CHOICE_COST_LINES.cut).toContain(`${DICE_CUT_GOLD} gold`);
    expect(DICE_CHOICE_COST_LINES.cut).toContain('closes to you permanently');
    expect(html).toContain(`+${DICE_CUT_GOLD} gold`);
    expect(html).toContain('data-dice-choice="cut"');
    expect(html).toContain('data-dice-choice="refused"');
    // …and the offer is gone from the markup once answered.
    const answered = applyDiceChoice(withCardsWon(boardOpen(), 3), 'cut');
    if (!answered.ok) throw new Error('cut must be offered');
    const after = render(answered.profile);
    expect(after).not.toContain('data-dice-offer');
    expect(after).toContain('data-dice-choice-answer="cut"');
  });
});

// ── §D 'cut' and the honest purse ──────────────────────────────────────────
describe('STORY-5a §D — the two purses', () => {
  test("'cut' pays exactly 300 gold, once, in the same write as the flag", () => {
    const ready = withCardsWon(boardOpen(), 3);
    const cut = applyDiceChoice(ready, 'cut');
    if (!cut.ok) throw new Error('cut must be offered');
    expect(cut.profile.gold - ready.gold).toBe(DICE_CUT_GOLD);
    expect(DICE_CUT_GOLD).toBe(300);
    // Nothing else moved: no fame, no xp, no tier, no card, no cup.
    expect(cut.profile.fame).toBe(ready.fame);
    expect(cut.profile.xp).toBe(ready.xp);
    expect(cut.profile.currentTier).toBe(ready.currentTier);
    expect(resolveDiceTrail(cut.profile).rumorsWon).toEqual(resolveDiceTrail(ready).rumorsWon);
    expect(resolveDiceTrail(cut.profile).cup).toBe(resolveDiceTrail(ready).cup);
  });

  test("'cut' closes her rumour service PERMANENTLY, and the panel says so", () => {
    const ready = withCardsWon(boardOpen(), 3);
    expect(isRumourServiceClosed(ready)).toBe(false);
    const cut = applyDiceChoice(ready, 'cut');
    if (!cut.ok) throw new Error('cut must be offered');
    expect(isRumourServiceClosed(cut.profile)).toBe(true);
    // There is NO un-close path: nothing in the module clears the flag.
    expect(code('utils/diceTrail.ts')).not.toContain('diceEnding: undefined');
    expect(raw('utils/diceTrail.ts')).toContain('There is NO un-close path');
    // The panel prints the closure in the panel body…
    expect(render(cut.profile)).toContain('not for sale to you');
  });

  test('purchases are BLOCKED after a cut — App refuses before the transaction', () => {
    const app = code('App.tsx');
    const guardAt = app.indexOf('if (isRumourServiceClosed(profile)) return false;');
    const buyAt = app.indexOf('const result = purchaseIntel(profile, opponentId);');
    expect(guardAt).toBeGreaterThan(-1);
    expect(buyAt).toBeGreaterThan(guardAt); // the guard runs FIRST
    // …and the panel replaces the list rather than offering buttons.
    const city = code('components/3d/city/CityHubScene.tsx');
    expect(city).toContain('const tavernRumoursClosed = intelPanel && isRumourServiceClosed(playerProfile);');
    expect(city).toContain('data-tavern-rumours-closed');
    const closedAt = city.indexOf('{tavernRumoursClosed ? (');
    const buyButtonAt = city.indexOf('data-buy-intel={opponent.id}');
    expect(closedAt).toBeGreaterThan(-1);
    expect(buyButtonAt).toBeGreaterThan(closedAt); // the closure branch comes first
  });

  test('the S7 transaction itself is untouched: 15 gold, gold + intel only', () => {
    expect(INTEL_PRICE).toBe(15);
    const profile = base();
    const bought = purchaseIntel(profile, 'opp_flaccus');
    if (!bought.ok) throw new Error('must be affordable');
    expect(bought.profile.gold).toBe(profile.gold - 15);
    expect(bought.profile.intel).toEqual(['opp_flaccus']);
    // A refused buy returns no profile at all, so nothing can be saved.
    expect(purchaseIntel({ ...profile, gold: 10 }, 'opp_flaccus').ok).toBe(false);
  });

  test("'refused' pays nothing here: his champion's OWN standard purse is the purse", () => {
    const ready = withCardsWon(boardOpen(), 3);
    const refused = applyDiceChoice(ready, 'refused');
    if (!refused.ok) throw new Error('refused must be offered');
    // R2 — no bonus, no penalty, in the answer's own write.
    expect(refused.profile.gold).toBe(ready.gold);
    expect(refused.profile.fame).toBe(ready.fame);
    expect(isRumourServiceClosed(refused.profile)).toBe(false);
    // The champion is a roster row with its own standard purse, read from the row.
    const row = rosterRow(DICE_ENDING_CHAMPION.opponentId);
    expect(row.name).toBe(DICE_ENDING_CHAMPION.staging);
    expect(row.isBoss).not.toBe(true);
    expect(Number.isFinite(row.rewardGold)).toBe(true);
    expect(Number.isFinite(row.rewardFame)).toBe(true);
    // The bout is offered by the panel once the answer stands.
    const view = diceTrailView(refused.profile);
    expect(view.choice).toBe('refused');
    expect(view.nextBout?.bout.key).toBe('ending');
    expect(view.endingChampionWon).toBe(false);
    const html = render(refused.profile);
    expect(html).toContain(`data-dice-enter="${DICE_ENDING_CHAMPION.opponentId}"`);
  });
});

// ── §E the chain's rewards ─────────────────────────────────────────────────
describe('STORY-5a §E — backstory, Laudes and the house cup', () => {
  test('the chain pays +5 records.laudes and the cup, in one write', () => {
    const closed = boardOpen();
    expect(resolveLaudes(closed)).toBe(DICE_CHAIN_LAUDES);
    expect(DICE_CHAIN_LAUDES).toBe(5);
    expect(resolveDiceTrail(closed).cup).toBe(true);
    // …and the closing line is the panel's own, with the backstory under it.
    const html = render(closed);
    expect(html).toContain('Now. About the dice.');
    expect(html).toContain('Her brother');
    expect(QUIET_DICE_CLOSING_LINE).toBe('Now. About the dice.');
  });

  test('Laudes accumulate on the SHARED counter, never a second one', () => {
    const already = { ...base(), records: { laudes: 7 } };
    expect(resolveLaudes(withLaudes(already, 5))).toBe(12);
    // The chain adds to whatever the counter already holds (Ludi A will reuse it).
    const closed = withDiceChainClosed(
      withChampionBeaten(withDeepCard({ ...base(), records: { laudes: 7 } } as PlayerProfile))
    );
    expect(resolveLaudes(closed)).toBe(12);
    // Identity-stable guards.
    expect(withLaudes(already, 0)).toBe(already);
    expect(withLaudes(already, -3)).toBe(already);
    // A malformed value reads as zero, never NaN.
    expect(resolveLaudes({ ...base(), records: { laudes: 'x' as unknown as number } })).toBe(0);
  });

  test('the watered-wine line is present IF AND ONLY IF the cup is owned', () => {
    const withoutCup = render(withDeepCard());
    expect(withoutCup).toContain(TAVERN_WINE_LINE);
    expect(withoutCup).not.toContain(HOUSE_CUP_LINE);
    expect(withoutCup).toContain('data-tavern-wine-line="watered"');

    const withCup = render(boardOpen());
    expect(withCup).toContain(HOUSE_CUP_LINE);
    expect(withCup).toContain('noticeably less watered');
    expect(withCup).toContain('data-tavern-wine-line="cup"');

    // A cup flag alone flips the line; nothing else about the panel moves.
    const cupOnly = render({ ...base(), story: { diceTrail: { cup: true } } });
    expect(cupOnly).toContain(HOUSE_CUP_LINE);
    // Pure flavour: the cup wears no mechanic — no stat, no price, no reward.
    expect(raw('utils/diceTrail.ts')).toContain('wears no mechanic');
    expect(raw('components/hub/DiceTrailSection.tsx')).toContain('PURE FLAVOUR');
  });
});

// ── §F guards ──────────────────────────────────────────────────────────────
describe('STORY-5a §F — the guards', () => {
  test('§J stays at 22 optional top-level fields, `records` last', () => {
    const optional = optionalProfileFields();
    expect(optional.length).toBe(22);
    expect(optional.slice(-2)).toEqual(['spared', 'records']);
  });

  test('no top-level field is added by any write of this slice', () => {
    const before = base();
    const after = withDiceTrailVictory(withDiceChainClosed(withChampionBeaten(withDeepCard())), 'opp_hoplite');
    // Every key the write produced is a member `PlayerProfile` already declares:
    // the lazy containers appear, and nothing else does.
    const declared = [...Object.keys(before), ...optionalProfileFields()];
    for (const key of Object.keys(after)) expect(declared).toContain(key);
    expect(Object.keys(after)).not.toContain('diceTrail');
    expect(Object.keys(after)).not.toContain('laudes');
    // The state is nested where the story's other records live…
    expect(after.story?.diceTrail).toBeDefined();
    expect(after.records?.laudes).toBe(DICE_CHAIN_LAUDES);
    // …and `createNewProfile` still writes neither field.
    expect(Object.keys(before)).not.toContain('diceTrail');
    expect(before.story?.diceTrail).toBeUndefined();
    expect(before.records?.laudes).toBeUndefined();
  });

  test('the records-era fixture carries the shared counter (§J unchanged)', () => {
    const fixture = JSON.parse(
      readFileSync(join(SOURCE_DIR, 'utils/saveFixtures/recordsEraProfile.json'), 'utf8')
    ) as PlayerProfile;
    expect(fixture.records?.laudes).toBe(5);
    expect(resolveLaudes(fixture)).toBe(5);
  });

  test('the board is a SECTION of the tavern intel panel, not a panel of its own', () => {
    const city = code('components/3d/city/CityHubScene.tsx');
    const panelAt = city.indexOf('data-intel-panel');
    const sectionAt = city.indexOf('<DiceTrailSection');
    expect(panelAt).toBeGreaterThan(-1);
    expect(sectionAt).toBeGreaterThan(panelAt);
    // It rides under Aelia's plate, and the panel is still raised by the tavern.
    expect(city.indexOf('<KeeperPlate')).toBeLessThan(sectionAt);
    expect(city).toContain("else if (nearbyLoc.id === 'tavern')");
    // No second panel: the section owns no panel chrome of its own.
    expect(code('components/hub/DiceTrailSection.tsx')).not.toContain('data-intel-panel');
  });

  test('step 3 fires as HER counter opens, through App’s one write', () => {
    const city = code('components/3d/city/CityHubScene.tsx');
    expect(city).toContain('onOpenDiceBoard?.();');
    const app = code('App.tsx');
    expect(app).toContain('const opened = withDiceChainClosed(profile);');
    expect(app).toContain('onOpenDiceBoard={handleOpenDiceBoard}');
  });

  test('the trail imports no combat, storage or clock module', () => {
    const module = code('utils/diceTrail.ts');
    expect(module).not.toContain('combatCalculations');
    expect(module).not.toContain('services/storage');
    expect(module).not.toContain('localStorage');
    expect(module).not.toContain('Date.now');
    expect(module).not.toContain('new Date');
    expect(module).toContain("from './intel'");
    expect(module).toContain("from './mercyBouts'");
    // combatCalculations is not opened by this slice at all.
    const diffNames = ['combatCalculations.ts'];
    for (const name of diffNames) expect(module).not.toContain(name);
  });

  test('every write is pure: a frozen profile is never mutated', () => {
    const profile = withChampionBeaten(withDeepCard());
    const frozen = Object.freeze({
      ...profile,
      defeatedOpponentIds: Object.freeze([...profile.defeatedOpponentIds]),
    }) as PlayerProfile;
    expect(Object.isFrozen(frozen)).toBe(true);
    const closed = withDiceChainClosed(frozen);
    expect(closed).not.toBe(frozen);
    // The input is byte-for-byte what it was: nothing was written into it.
    expect(frozen.story?.diceTrail).toBeUndefined();
    expect(frozen.records?.laudes).toBeUndefined();
    expect(resolveLaudes(closed)).toBe(DICE_CHAIN_LAUDES);
  });
});

// ── §G the mercy fence ─────────────────────────────────────────────────────
describe('STORY-5a §G — a trail bout is not a mercy bout', () => {
  test('four staged rows ARE mercy-eligible regulars when fought normally', () => {
    const profile = withCardsWon(boardOpen(), 3);
    // STORY-4a's own seam drives the offer before Stage 2 unlocks Chapter 3.
    const offer = mercyOfferFor(profile, rosterRow('opp_hoplite'), true, 3);
    expect(offer).not.toBeNull();
    expect(offer?.rivalId).toBe('opp_hoplite');
  });

  test('the fence withholds it on a trail bout, and only there', () => {
    const profile = withCardsWon(boardOpen(), 3);
    const rival = rosterRow('opp_hoplite');
    expect(mercyOfferForDuel(profile, rival, true, true, 3)).toBeNull();
    // The same row fought as an ordinary duel keeps its offer, unchanged.
    expect(mercyOfferForDuel(profile, rival, true, false, 3)).toEqual(
      mercyOfferFor(profile, rival, true, 3)
    );
    // A loss is never an offer either way.
    expect(mercyOfferForDuel(profile, rival, false, false, 3)).toBeNull();
    // Every staged row is fenced by the same call.
    for (const bout of DICE_TRAIL_BOUTS) {
      const row = rosterRow(bout.opponentId);
      expect(mercyOfferForDuel(profile, row, true, true, 3)).toBeNull();
    }
  });

  test('App asks through the fence, and the flag is consumed by the result', () => {
    const app = code('App.tsx');
    // STORY-5b REBASE, not a weakening: STORY-5b's exhibition flag joins the same
    // fence (`... || exhibition`), so this is still the ONE call site, and it still
    // refuses the offer on a trail bout.
    expect(app).toContain(
      'mercyOfferForDuel(profile, activeOpponent, didWin, diceTrailBoutRef.current || exhibition)'
    );
    expect(app).not.toContain('mercyOfferFor(profile, activeOpponent, didWin)');
    // Set at the trail's own entrance, cleared at the result.
    expect(app).toContain('diceTrailBoutRef.current = true;');
    expect(app).toContain('diceTrailBoutRef.current = false;');
  });

  test('the trail’s victory is recorded in the same save as the win', () => {
    const app = code('App.tsx');
    const winAt = app.indexOf('const trailProfile =');
    const awardsAt = app.indexOf('applyTriumphAwards(trailProfile, duelTriumphStats)');
    const saveAt = app.indexOf('saveProfile(awards.profile);');
    expect(winAt).toBeGreaterThan(-1);
    expect(awardsAt).toBeGreaterThan(winAt);
    expect(saveAt).toBeGreaterThan(awardsAt);
    expect(app).toContain('withDiceTrailVictory(timedProfile, activeOpponent.id)');
  });
});

// ── §H the panel, at every state ───────────────────────────────────────────
describe('STORY-5a §H — the tavern section, server-rendered', () => {
  test('a fresh profile: three owed steps, no board, the watered line', () => {
    const html = render(base());
    expect(html).toContain('data-quiet-dice-chain');
    expect(html).not.toContain('data-dice-board');
    expect(html).toContain('data-quiet-dice-step-state="pending"');
    expect(html).not.toContain('data-dice-enter=');
    expect(html).toContain('15g for a true thing');
    expect(html).toContain(TAVERN_WINE_LINE);
  });

  test('after the deep card: his champion is enterable, and named', () => {
    const html = render(withDeepCard());
    expect(html).toContain('data-quiet-dice-step="1"');
    expect(html).toContain('data-quiet-dice-step-state="done"');
    expect(html).toContain(`data-dice-enter="${DICE_CHAIN_CHAMPION.opponentId}"`);
    expect(html).toContain('Flaccus the Nimble');
    expect(html).not.toContain('data-dice-board');
  });

  test('the open board: her line, three cards, only the first enterable', () => {
    const html = render(boardOpen());
    expect(html).toContain('data-dice-board');
    expect(html).toContain('Now. About the dice.');
    expect(html).toContain('data-dice-rumor="rumor1"');
    expect(html).toContain('data-dice-rumor-state="open"');
    expect(html).toContain('data-dice-rumor-state="locked"');
    expect(html).toContain(`data-dice-enter="${DICE_RUMORS[0].bout.opponentId}"`);
    expect(html).not.toContain(`data-dice-enter="${DICE_RUMORS[1].bout.opponentId}"`);
    expect(html).toContain('data-dice-chain-reward="5"');
    expect(html).not.toContain('data-dice-offer');
  });

  test('the won card reads as taken; the next is posted', () => {
    const html = render(withCardsWon(boardOpen(), 1));
    expect(html).toContain('data-dice-rumor-state="won"');
    expect(html).toContain(`data-dice-enter="${DICE_RUMORS[1].bout.opponentId}"`);
  });

  test('a cut panel: the closure, the answer, no purchase and no offer', () => {
    const cut = applyDiceChoice(withCardsWon(boardOpen(), 3), 'cut');
    if (!cut.ok) throw new Error('cut must be offered');
    const html = render(cut.profile);
    expect(html).toContain('data-dice-choice-answer="cut"');
    expect(html).not.toContain('data-dice-offer');
    expect(html).not.toContain('data-dice-choice="refused"');
    expect(html).toContain(HOUSE_CUP_LINE);
  });

  test('a refused panel: the champion is waiting, and the line says so', () => {
    const refused = applyDiceChoice(withCardsWon(boardOpen(), 3), 'refused');
    if (!refused.ok) throw new Error('refused must be offered');
    const html = render(refused.profile);
    expect(html).toContain('data-dice-choice-answer="refused"');
    expect(html).toContain(`data-dice-enter="${DICE_ENDING_CHAMPION.opponentId}"`);
    expect(html).toContain('Kallias of Sparta');
    // The refusal never closes her counter.
    expect(html).not.toContain('not for sale to you');
  });
});
