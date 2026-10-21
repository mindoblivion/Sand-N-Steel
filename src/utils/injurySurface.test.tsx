/**
 * S4 — the two injury surfaces, server-rendered.
 *
 * The helper and the wiring are pinned by `injury.test.ts`; this suite renders the
 * real components so the player-facing copy is proved, not just referenced:
 *   • `DuelResultModal` names the wound's own numbers on an inflicting loss, says
 *     "Injury healed." when a duel closes one, and adds nothing otherwise;
 *   • `StatsTab` shows the live injury and its fights remaining, and adds nothing
 *     when there is no injury.
 *
 * `.tsx`, not `.ts`: it renders JSX and bun's `.ts` transform rejects it
 * (the same trap `triumphsSurface.test.tsx` records).
 *
 * Run with: `bun test src/utils/injurySurface.test.tsx`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DuelStatistics, PlayerProfile } from '../types/game';
import { DuelResultModal } from '../components/hub/DuelResultModal';
import { StatsTab } from '../components/hub/StatsTab';
import { ALL_OPPONENTS } from '../data/opponents';
import { INJURY_FIGHTS, INJURY_PENALTY_STRENGTH, INJURY_PENALTY_AGILITY } from './injury';

function profile(over: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    name: 'Test',
    title: 'Tester',
    rank: 'Rookie',
    appearance: { skinColor: '#000', hairColor: '#000', tunicColor: '#000', crestColor: '#000' },
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    unspentStatPoints: 0,
    baseStats: { strength: 10, agility: 10, stamina: 10, defense: 4 },
    gold: 100,
    fame: 0,
    currentTier: 1,
    tierProgress: { 1: 0, 2: 0, 3: 0, 4: 0 },
    defeatedOpponentIds: [],
    bossKills: 0,
    newGamePlus: 0,
    trainingSessionsLeft: 2,
    injury: null,
    equipped: {} as PlayerProfile['equipped'],
    inventory: [],
    fightsWon: 0,
    fightsLost: 1,
    peakCrowdHypeOverall: 0,
    ...over,
  };
}

const STATS: DuelStatistics = {
  damageDealt: 40,
  damageTaken: 90,
  hitsLanded: 4,
  maxCombo: 2,
  perfectBlocks: 0,
  dodgesPerformed: 1,
  crowdHypePeak: 30,
  durationSeconds: 42,
  goldEarned: 0,
  fameEarned: 0,
  xpEarned: 0,
  lowestStaminaFraction: 0.2,
};

const FRESH = {
  fightsRemaining: INJURY_FIGHTS,
  penaltyStrength: INJURY_PENALTY_STRENGTH,
  penaltyAgility: INJURY_PENALTY_AGILITY,
};

function modal(injuryEvent: Parameters<typeof DuelResultModal>[0]['injuryEvent']) {
  return renderToStaticMarkup(
    <DuelResultModal
      didWin={false}
      opponent={ALL_OPPONENTS[0]}
      stats={STATS}
      injuryEvent={injuryEvent}
      onContinue={() => {}}
    />,
  );
}

describe('§A the result modal', () => {
  test('an inflicting loss names the numbers that were written', () => {
    const html = modal({ kind: 'inflicted', injury: FRESH });
    expect(html).toContain('Injured: −2 STR / −2 AGI for 3 fights');
    expect(html).toContain('data-duel-injury="inflicted"');
  });

  test('a duel that closes the injury says so', () => {
    const html = modal({ kind: 'healed' });
    expect(html).toContain('Injury healed.');
    expect(html).toContain('data-duel-injury="healed"');
    expect(html).not.toContain('Injured:');
  });

  test('a duel that only advances the clock adds nothing', () => {
    const html = modal(null);
    expect(html).not.toContain('data-duel-injury');
    expect(html).not.toContain('Injury healed.');
    expect(html).not.toContain('Injured:');
  });
});

describe('§B the stats tab', () => {
  test('a live injury shows its penalties and fights remaining', () => {
    const html = renderToStaticMarkup(<StatsTab profile={profile({ injury: FRESH })} onAllocatePoint={() => {}} />);
    expect(html).toContain('Injured');
    expect(html).toContain('−2 STR / −2 AGI');
    expect(html).toContain('3 fights remaining');
    expect(html).toContain('data-injury="3"');
  });

  test('no injury adds nothing', () => {
    const html = renderToStaticMarkup(<StatsTab profile={profile()} onAllocatePoint={() => {}} />);
    expect(html).not.toContain('data-injury');
    expect(html).not.toContain('fights remaining');
  });

  test('a cleared injury adds nothing', () => {
    const html = renderToStaticMarkup(
      <StatsTab profile={profile({ injury: { ...FRESH, fightsRemaining: 0 } })} onAllocatePoint={() => {}} />,
    );
    expect(html).not.toContain('data-injury');
  });
});
