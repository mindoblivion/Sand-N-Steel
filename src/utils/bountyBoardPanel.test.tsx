/**
 * STORY-4b — the Bounty Hall's board panel, server-rendered.
 *
 * The RULES are pinned by `bountyLadder.test.ts`; this suite renders the REAL
 * `BountyBoardPanel` so the display gate is proved on the markup: it renders with
 * the ladder SHUT (which is the shipped state today — no record can reach Chapter 3
 * until Stage 2 lands), it heads with Scribonia's plate, it prints every posting
 * and every twist, and it opens rung by rung exactly as the module says when the
 * ladder is driven open through the same override seam the module carries.
 *
 * `.tsx`, not `.ts`: it renders JSX and bun's `.ts` transform rejects it (the trap
 * `intelSurface.test.tsx` and `consumablesSurface.test.tsx` record).
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PlayerProfile } from '../types/game';
import { BountyBoardPanel } from '../components/hub/BountyBoardPanel';
import { BOUNTY_CHAPTER, BOUNTY_LADDER } from './bountyLadder';
import { BOUNTY_RUNG_OPPONENTS } from '../data/bountyBoard';
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

const panel = (p: PlayerProfile, chapterOverride?: number): string =>
  renderToStaticMarkup(
    <BountyBoardPanel
      profile={p}
      night={false}
      onEnterBout={() => {}}
      onRecordKeeperVisit={() => {}}
      onClose={() => {}}
      chapterOverride={chapterOverride}
    />
  );

const clearedIds = (count: number) =>
  BOUNTY_LADDER.slice(0, count).map((rung) => rung.opponentId);

describe('STORY-4b §A — the shipped board renders shut, and readable', () => {
  test('the panel renders, heads with Scribonia’s plate, and says why it is shut', () => {
    const html = panel(profile());
    expect(html).toContain('data-bounty-panel');
    // K3-BOARDS — the clerk's own registry row heads it (KeeperPlate's own markup).
    expect(html).toContain('data-keeper="scribonia"');
    expect(html).toContain('Scribonia, called &quot;the Ledger&quot;');
    expect(html).toContain('the clerk');
    // R6 — the ladder is locked, and the panel says so in words.
    expect(html).toContain('data-bounty-locked-line');
    expect(html).toContain(`The board opens in Chapter ${BOUNTY_CHAPTER}.`);
    // …and nothing on it can be entered.
    expect(html).not.toContain('disabled=""'.repeat(1) + '>Take');
    const buttons = html.match(/data-bounty-enter=/g) ?? [];
    expect(buttons).toHaveLength(6); // five rungs + the Deserter
    expect(html.match(/disabled=""/g)?.length).toBe(6);
  });

  test('every posting, price and twist is printed even while the board is shut', () => {
    const html = panel(profile());
    for (const rung of BOUNTY_LADDER) {
      expect(html).toContain(`data-bounty-rung="${rung.rung}"`);
      expect(html).toContain(`${rung.bountyGold}g`);
      expect(html).toContain(`${rung.bountyFame}f`);
    }
    // SSR escapes apostrophes; compare against the unescaped text a player reads.
    const text = html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
    for (const opponent of BOUNTY_RUNG_OPPONENTS) expect(text).toContain(opponent.name);
    // The rule the brief requires the board to print.
    expect(html).toContain('data-bounty-rules');
    expect(html).toContain('keep the ordinary purse');
  });
});

describe('STORY-4b §B — the ladder, driven open through the module’s own seam', () => {
  test('Chapter 3: rung 1 opens, the rest wait their turn, the Deserter waits for five', () => {
    const html = panel(profile(), BOUNTY_CHAPTER);
    expect(html).not.toContain('data-bounty-locked-line');
    expect(html).toContain('data-bounty-rung="1" data-bounty-rung-state="open"');
    for (const rung of [2, 3, 4, 5]) {
      expect(html).toContain(`data-bounty-rung="${rung}" data-bounty-rung-state="locked"`);
    }
    expect(html).toContain('data-bounty-final-state="locked"');
    // Exactly one control is live: the first posting.
    expect(html.match(/disabled=""/g)?.length).toBe(5);
  });

  test('the left-handed note is printed on rung 2 and nowhere else', () => {
    const html = panel(profile(), BOUNTY_CHAPTER);
    // Exactly one printed NOTE (the twist line on the same rung also names the stance,
    // which is the point: the rule is readable before the fight).
    expect(html.match(/data-bounty-note="left-handed"/g)?.length).toBe(1);
    expect(html).toContain('Sextus Sinister fights left-handed.');
  });

  test('a cleared rung shows cleared and stays enterable (repeats pay in full)', () => {
    const html = panel(profile({ story: { bountyRungs: clearedIds(1) } }), BOUNTY_CHAPTER);
    expect(html).toContain('data-bounty-rung="1" data-bounty-rung-state="cleared"');
    expect(html).toContain('Fight again');
    expect(html).toContain('data-bounty-rung="2" data-bounty-rung-state="open"');
  });

  test('all five cleared: the Deserter’s entry opens', () => {
    const html = panel(profile({ story: { bountyRungs: clearedIds(5) } }), BOUNTY_CHAPTER);
    expect(html).toContain('data-bounty-final-state="open"');
    expect(html).toContain('Go to the northern road');
    expect(html).toContain('Lucius Cassius, called the Oathbreaker');
    // 550 / 90 taken alive, 350 / 180 killed outright.
    expect(html).toContain('550g');
    expect(html).toContain('350g');
  });

  test('an answered final shows the answer it recorded', () => {
    const html = panel(
      profile({ story: { bountyRungs: clearedIds(5), deserterChoice: 'taken' } }),
      BOUNTY_CHAPTER
    );
    expect(html).toContain('data-bounty-final-answer="taken"');
    expect(html).toContain('Killed outright');
  });
});

describe('STORY-4b §C — the panel writes nothing', () => {
  const code = (rel: string): string =>
    readFileSync(join(SOURCE_DIR, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  test('it relays ONE keeper visit and owns no transaction', () => {
    const panelSource = code('components/hub/BountyBoardPanel.tsx');
    // LUDI PHASE A REBASE, not a weakening: the hall now has TWO counters, so the panel
    // relays one visit per plate — Scribonia's and Felix's — and still writes nothing.
    expect(panelSource.match(/onRecordKeeperVisit\?\.\(/g)?.length).toBe(2);
    expect(panelSource).toContain('onRecordKeeperVisit?.(BOARD_KEEPER.id)');
    expect(panelSource).toContain('onRecordKeeperVisit?.(ACTA_KEEPER.id)');
    expect(panelSource).toContain("getKeeper('scribonia')");
    for (const forbidden of ['saveProfile', 'recordKeeperVisit(', 'localStorage', 'bountyBoardState(profile) ']) {
      expect(panelSource).not.toContain(forbidden);
    }
    // The bout is handed up; the panel never enters one itself.
    expect(panelSource).toContain('onEnterBout(entry.opponent)');
    expect(panelSource).toContain('onEnterBout(board.final.opponent)');
  });
});
