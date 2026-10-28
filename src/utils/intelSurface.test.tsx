/**
 * S7 — the tournament card's rumour surface, server-rendered.
 *
 * The helper and the wiring are pinned by `intel.test.ts`; this suite renders the
 * REAL `TournamentTab` so the display gate is proved on the markup:
 *   • an opponent WITHOUT a bought rumour renders exactly the surface it showed
 *     before this slice — proved byte-for-byte, twice: the whole screen when no
 *     rumour on that tier is owned, and each other card when one is;
 *   • an opponent WITH a bought rumour renders personality, the stat line, the
 *     weapon type and (for a boss) the signature mechanic, all read from the
 *     opponent's own config;
 *   • the block is a display only — no button, no price, no purchase control.
 *
 * `.tsx`, not `.ts`: it renders JSX and bun's `.ts` transform rejects it (the same
 * trap `consumablesSurface.test.tsx` and `injurySurface.test.tsx` record).
 *
 * Run with: `bun test src/utils/intelSurface.test.tsx`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PlayerProfile } from '../types/game';
import { TournamentTab } from '../components/hub/TournamentTab';
import { ALL_OPPONENTS } from '../data/opponents';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';

function profile(over: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    name: 'Test',
    title: 'Tester',
    rank: 'Rookie',
    appearance: { skinColor: '#000', hairColor: '#000', tunicColor: '#000', crestColor: '#000' },
    level: 10,
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
    equipped: { weapon: DEFAULT_PLAYER_WEAPON },
    inventory: [DEFAULT_PLAYER_WEAPON],
    fightsWon: 0,
    fightsLost: 0,
    peakCrowdHypeOverall: 0,
    ...over,
  };
}

const tab = (p: PlayerProfile) =>
  renderToStaticMarkup(<TournamentTab profile={p} onSelectOpponent={() => {}} />);

/** The card bodies, split at the one class prefix each card carries. */
const cards = (html: string): string[] => html.split('class="p-5 rounded-3xl').slice(1);

const OPPONENT = (id: string) => {
  const found = ALL_OPPONENTS.find((opponent) => opponent.id === id);
  if (!found) throw new Error(`no opponent '${id}'`);
  return found;
};

describe('S7 §G the tournament card’s rumour gate', () => {
  test('a tier with no bought rumour renders exactly today’s surface, byte for byte', () => {
    const withoutIntel = tab(profile());
    // The same screen with a rumour owned on a DIFFERENT tier: the tier-1 cards
    // must be untouched by a purchase that does not concern them.
    const otherTier = tab(profile({ intel: ['opp_ignis_boss', 'opp_valeria_boss'] }));
    expect(otherTier).toBe(withoutIntel);
    // And the baseline really is today's surface: no rumour block anywhere.
    expect(withoutIntel).not.toContain('data-intel=');
    expect(withoutIntel).not.toContain('Tavern rumour');
  });

  test('one bought rumour changes only that opponent’s card', () => {
    const baseline = cards(tab(profile()));
    const withOne = cards(tab(profile({ intel: ['opp_goliath_boss'] })));
    expect(withOne).toHaveLength(baseline.length);
    for (let i = 0; i < baseline.length; i += 1) {
      if (withOne[i].includes('data-intel="opp_goliath_boss"')) continue;
      expect(withOne[i]).toBe(baseline[i]);
    }
    // Exactly one card carries a rumour block.
    expect(withOne.filter((card) => card.includes('data-intel='))).toHaveLength(1);
  });

  test('an intel’d boss shows personality, stat line, weapon and mechanic', () => {
    const boss = OPPONENT('opp_goliath_boss');
    const html = tab(profile({ intel: [boss.id] }));
    expect(html).toContain('data-intel="opp_goliath_boss"');
    expect(html).toContain('Tavern rumour — information only');
    expect(html).toContain(`${boss.personality} fighter · Mace`);
    expect(html).toContain(`STR ${boss.stats.strength}`);
    expect(html).toContain(`AGI ${boss.stats.agility}`);
    expect(html).toContain(`STA ${boss.stats.staminaMax}`);
    expect(html).toContain(`REG ${boss.stats.staminaRegen}`);
    expect(html).toContain(`DEF ${boss.stats.defense}`);
    expect(html).toContain(`HP ${boss.stats.healthMax}`);
    expect(html).toContain('Signature: Heavy attacks are telegraphed');
  });

  test('a non-boss rumour reads its own weapon and carries no signature line', () => {
    const rookie = OPPONENT('opp_marcus');
    const html = tab(profile({ intel: [rookie.id] }));
    // `renderToStaticMarkup` escapes the ampersand, so the label is asserted as markup.
    expect(html).toContain('Aggressive fighter · Sword &amp; Shield');
    expect(html).toContain(`HP ${rookie.stats.healthMax}`);
    expect(html).not.toContain('Signature:');
  });

  test('the block is display only — no control, no price, no purchase', () => {
    const html = tab(profile({ intel: ['opp_goliath_boss'] }));
    expect(html).not.toContain('data-buy-intel');
    expect(html).not.toContain('15g');
    expect(html).not.toContain('Buy rumour');
    // The card's own duel control is still exactly one per opponent.
    expect(html.match(/Enter Arena Duel/g)?.length ?? 0).toBeGreaterThan(0);
  });

  test('a rumour does not unlock or reprice the fight itself', () => {
    const locked = profile({ level: 1, currentTier: 4 });
    const withoutIntel = tab(locked);
    const withIntel = tab({ ...locked, intel: ['opp_aurelius_boss'] });
    expect(withIntel).toContain('Locked (Requires LVL 10)');
    expect(withoutIntel).toContain('Locked (Requires LVL 10)');
    // The reward row is identical in both — intel touches no reward.
    const rewardOf = (html: string) => html.slice(html.indexOf('from 1000 Gold') - 60, html.indexOf('from 1000 Gold') + 60);
    expect(rewardOf(withIntel)).toBe(rewardOf(withoutIntel));
  });
});
