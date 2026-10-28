/**
 * PITCH A6 — the victory card's poster section, server-rendered.
 *
 * The composer, the frame rule, the margin formatting and the share guard are
 * pinned by `victoryCard.test.ts`; this suite renders the REAL `DuelResultModal`
 * so the poster's own presence is proved on markup:
 *   • the section and its 1080x1350 canvas are there on every duel result —
 *     a win, a boss win and a defeat alike, with a class on the card;
 *   • the frame attribute follows R-FRAME (victory / champion / defeat);
 *   • NO Share button is drawn where there is no share sheet (the server has no
 *     navigator at all), so the poster shows and no dead control appears;
 *   • the poster is outside the mercy/bounty answer state (R-SCOPE) and needs
 *     no answer to exist.
 *
 * `.tsx`, not `.ts`: it renders JSX and bun's `.ts` transform rejects it (the
 * same trap `injurySurface.test.tsx` records).
 *
 * Run with: `bun test src/utils/victoryCardSurface.test.tsx`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DuelStatistics, OpponentConfig } from '../types/game';
import { DuelResultModal } from '../components/hub/DuelResultModal';
import { createNewProfile } from '../services/storage';
import { ALL_OPPONENTS, LADDER_OPPONENTS } from '../data/opponents';
import { BOUNTY_DESERTER } from '../data/bountyBoard';

const regular: OpponentConfig =
  LADDER_OPPONENTS.find((row) => row.isBoss !== true) ?? ALL_OPPONENTS[0];
const boss: OpponentConfig = LADDER_OPPONENTS.find((row) => row.isBoss === true) ?? regular;

const PLAYER = { ...createNewProfile('Poster Tester'), armatura: 'thraex' as const };

const STATS: DuelStatistics = {
  damageDealt: 70,
  damageTaken: 20,
  hitsLanded: 9,
  perfectBlocks: 2,
  dodgesPerformed: 1,
  maxCombo: 4,
  lowestStaminaFraction: 0.4,
  lowestHealthFraction: 0.6,
  winnerHealthFraction: 0.62,
  crowdHypePeak: 74,
  durationSeconds: 61,
  goldEarned: 120,
  fameEarned: 30,
  xpEarned: 90,
};

function modal(over: {
  didWin?: boolean;
  opponent?: OpponentConfig;
  stats?: DuelStatistics;
  mercy?: Parameters<typeof DuelResultModal>[0]['mercy'];
} = {}) {
  return renderToStaticMarkup(
    <DuelResultModal
      didWin={over.didWin ?? true}
      opponent={over.opponent ?? regular}
      stats={over.stats ?? STATS}
      profile={PLAYER}
      mercy={over.mercy ?? null}
      onContinue={() => {}}
    />,
  );
}

describe('Pitch A6 §A — the poster is on every duel result', () => {
  test('a win against a regular row shows the Victory frame', () => {
    const html = modal();
    expect(html).toContain('data-victory-card="victory"');
    expect(html).toContain('data-victory-card-poster="victory"');
    expect(html).toContain('width="1080"');
    expect(html).toContain('height="1350"');
    // The banner and the poster live on the same result screen.
    expect(html).toContain('VICTORY!');
  });

  test('a win against a boss row shows the Champion frame', () => {
    expect(boss.isBoss).toBe(true);
    expect(modal({ opponent: boss })).toContain('data-victory-card="champion"');
    expect(modal({ opponent: BOUNTY_DESERTER })).toContain('data-victory-card="champion"');
  });

  test('a defeat shows the Defeat frame, boss or not', () => {
    expect(modal({ didWin: false })).toContain('data-victory-card="defeat"');
    expect(modal({ didWin: false, opponent: boss })).toContain('data-victory-card="defeat"');
  });

  test('an old-path result with no transient winner reading still shows the poster', () => {
    const legacy: DuelStatistics = { ...STATS };
    delete (legacy as { winnerHealthFraction?: number }).winnerHealthFraction;
    const html = modal({ stats: legacy });
    expect(html).toContain('data-victory-card="victory"');
  });
});

describe('Pitch A6 §B — the Share button obeys the share sheet, never the layout', () => {
  test('with no share sheet (the server) the poster shows and no button appears', () => {
    const html = modal();
    expect(html).toContain('data-victory-card-poster');
    expect(html).not.toContain('data-victory-card-share');
  });
});

describe('Pitch A6 §C — R-SCOPE: independent of the mercy answer state', () => {
  test('an unanswered mercy offer does not hold the poster back', () => {
    const html = modal({
      mercy: { rivalId: 'rival-x', rivalName: 'Rival X', teaching: false },
    });
    expect(html).toContain('data-duel-mercy-offer="rival-x"');
    expect(html).toContain('data-victory-card="victory"');
  });

  test('an answered mercy offer does not change the poster', () => {
    const html = modal({
      mercy: { rivalId: 'rival-x', rivalName: 'Rival X', teaching: false, chosen: 'spare' },
    });
    expect(html).toContain('data-duel-mercy-chosen="spare"');
    expect(html).toContain('data-victory-card="victory"');
  });
});
