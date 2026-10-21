/**
 * S6 — the two consumable surfaces, server-rendered.
 *
 * The helper and the wiring are pinned by `consumables.test.ts`; this suite renders
 * the real components so the rules the slice states are proved on the markup:
 *   • `StatsTab` shows no use row when the gladiator is healthy, none when nothing is
 *     carried, and one button per owned item when injured;
 *   • `ShopTab` renders the Bazaar's potions with the count owned and its buy
 *     control, and adds none of them to any other storefront.
 *
 * `.tsx`, not `.ts`: it renders JSX and bun's `.ts` transform rejects it (the same
 * trap `injurySurface.test.tsx` records).
 *
 * Run with: `bun test src/utils/consumablesSurface.test.tsx`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PlayerProfile } from '../types/game';
import { StatsTab } from '../components/hub/StatsTab';
import { ShopTab } from '../components/hub/ShopTab';
import { INJURY_FIGHTS, INJURY_PENALTY_AGILITY, INJURY_PENALTY_STRENGTH } from './injury';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';

const FRESH = {
  fightsRemaining: INJURY_FIGHTS,
  penaltyStrength: INJURY_PENALTY_STRENGTH,
  penaltyAgility: INJURY_PENALTY_AGILITY,
};

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
    equipped: { weapon: DEFAULT_PLAYER_WEAPON },
    inventory: [DEFAULT_PLAYER_WEAPON],
    fightsWon: 0,
    fightsLost: 0,
    peakCrowdHypeOverall: 0,
    ...over,
  };
}

const stats = (p: PlayerProfile) =>
  renderToStaticMarkup(<StatsTab profile={p} onAllocatePoint={() => {}} onUseConsumable={() => {}} />);

const shop = (p: PlayerProfile, shopId: 'bazaar' | 'market' | 'forge') =>
  renderToStaticMarkup(
    <ShopTab profile={p} onBuyItem={() => {}} onBuyConsumable={() => {}} shopId={shopId} />,
  );

describe('S6 §A the stats tab', () => {
  test('an injured gladiator with a poultice gets one use button, with its count', () => {
    const html = stats(
      profile({ injury: FRESH, consumables: { field_poultice: 2, medicus_salve: 1 } }),
    );
    expect(html).toContain('data-consumable-row');
    expect(html).toContain('data-use-consumable="field_poultice"');
    expect(html).toContain('data-use-consumable="medicus_salve"');
    expect(html).toContain('Use Field Poultice (2)');
    expect(html).toContain('Use Medicus Salve (1)');
  });

  test('no injury adds no use row, even when items are carried', () => {
    const html = stats(profile({ consumables: { field_poultice: 3 } }));
    expect(html).not.toContain('data-consumable-row');
    expect(html).not.toContain('data-use-consumable');
  });

  test('an empty satchel adds no use row, even when injured', () => {
    const html = stats(profile({ injury: FRESH, consumables: { field_poultice: 0 } }));
    expect(html).not.toContain('data-consumable-row');
    expect(html).not.toContain('data-use-consumable');
  });
});

describe('S6 §B the bazaar screen', () => {
  test('the bazaar renders both potions with their prices and counts owned', () => {
    const html = shop(profile({ gold: 95, consumables: { field_poultice: 2 } }), 'bazaar');
    expect(html).toContain('Potions &amp; Salves');
    expect(html).toContain('data-consumable="field_poultice"');
    expect(html).toContain('data-consumable="medicus_salve"');
    expect(html).toContain('data-owned="2"');
    expect(html).toContain('data-owned="0"');
    expect(html).toContain('20 Gold');
    expect(html).toContain('90 Gold');
    // 95 gold cannot cover the 90 g salve AND the 20 g poultice… but it can cover each
    // one: both buy controls are enabled, and the refusal is the transaction's job.
    expect(html.match(/Buy \(/g)?.length).toBe(2);
  });

  test('a purse below a price disables only that buy control', () => {
    const html = shop(profile({ gold: 30 }), 'bazaar');
    // 20 g is affordable, 90 g is not — exactly one disabled control.
    expect(html.match(/disabled=""/g)?.length).toBe(1);
  });

  test('the other storefronts sell no consumables', () => {
    for (const shopId of ['market', 'forge'] as const) {
      const html = shop(profile(), shopId);
      expect(html).not.toContain('data-consumable');
      expect(html).not.toContain('Potions &amp; Salves');
    }
  });
});
