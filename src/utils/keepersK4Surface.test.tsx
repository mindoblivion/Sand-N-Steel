/**
 * K4-STATE — the storefront plate's STATE line, rendered from the real `ShopTab`.
 *
 * `keepersK4.test.ts` pins the registry, the triggers and the precedence as data
 * and as source.  This suite proves the same rules on the markup a player sees:
 * it server-renders the SHIPPED `ShopTab` for each of the four plated storefronts
 * and reads the keeper's line out of the plate, so the wiring (state line first,
 * then the night clerk, then the greeting / repeat line) is exercised through the
 * component rather than inferred from its source.
 *
 * `.tsx`, not `.ts`: it renders JSX and bun's `.ts` transform rejects it (the trap
 * `consumablesSurface.test.tsx` records).
 *
 * Run with: `bun test src/utils/keepersK4Surface.test.tsx`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PlayerProfile } from '../types/game';
import type { StorefrontId } from '../data/shops';
import { ShopTab } from '../components/hub/ShopTab';
import { getKeeperForStorefront, nightClerkLine, selectRepeatLine } from '../data/keepers';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';
import { lowestPurchasablePrice } from './keeperStateLines';
import { TIME_PHASES } from './timeState';

/** A whole profile — the surfaces read more than the triggers do. */
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
    gold: 5000,
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

/** The clock's own night slot, read from the phase table rather than assumed. */
const NIGHT_TOTAL = TIME_PHASES.indexOf('night');

const html = (p: PlayerProfile, shopId: StorefrontId): string =>
  renderToStaticMarkup(
    <ShopTab profile={p} onBuyItem={() => {}} onBuyConsumable={() => {}} shopId={shopId} />
  );

/** The one line the plate is saying, as the player sees it. */
function plateLine(markup: string): string {
  const match = markup.match(/data-keeper-line[^>]*>([\s\S]*?)<\//);
  expect(match, 'the plate is on the page').not.toBeNull();
  return match![1]
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

const STOREFRONTS: StorefrontId[] = ['forge', 'armorer', 'bazaar', 'merchant'];

describe('K4-surface §A a broke purse is what the plate says', () => {
  test('each of the four storefronts shows its keeper’s broke line', () => {
    for (const shopId of STOREFRONTS) {
      const keeper = getKeeperForStorefront(shopId)!;
      const floor = lowestPurchasablePrice(shopId, profile())!;
      const page = html(profile({ gold: floor - 1 }), shopId);
      expect(page).toContain(`data-keeper="${keeper.id}"`);
      expect(plateLine(page), shopId).toBe(keeper.stateLines!.broke);
    }
  });

  test('the broke line also wins after dark, over the night clerk’s own line', () => {
    for (const shopId of STOREFRONTS) {
      const keeper = getKeeperForStorefront(shopId)!;
      expect(keeper.nightLine, shopId).toBeTruthy();
      const floor = lowestPurchasablePrice(shopId, profile())!;
      const page = html(profile({ gold: floor - 1, time: { total: NIGHT_TOTAL } }), shopId);
      const line = plateLine(page);
      expect(line, shopId).toBe(keeper.stateLines!.broke);
      expect(line).not.toBe(nightClerkLine(keeper));
    }
  });

  test('the Bazaar’s floor is the poultice’s 20 gold, not the gear list’s emptiness', () => {
    // 20 is affordable and 19 is not: the potions ARE that storefront's stock.
    expect(plateLine(html(profile({ gold: 19 }), 'bazaar'))).toBe(
      getKeeperForStorefront('bazaar')!.stateLines!.broke
    );
    expect(plateLine(html(profile({ gold: 20 }), 'bazaar'))).not.toBe(
      getKeeperForStorefront('bazaar')!.stateLines!.broke
    );
  });
});

describe('K4-surface §B every other visit speaks exactly as it did before', () => {
  test('a first visit above the floor still greets, and a return still repeats', () => {
    for (const shopId of STOREFRONTS) {
      const keeper = getKeeperForStorefront(shopId)!;
      expect(plateLine(html(profile(), shopId)), shopId).toBe(keeper.firstVisitLine);
      const returning = html(profile({ seenKeepers: [keeper.id] }), shopId);
      expect(plateLine(returning), shopId).toBe(selectRepeatLine(keeper, 2));
    }
  });

  test('above the floor after dark, the night clerk still speaks', () => {
    for (const shopId of STOREFRONTS) {
      const keeper = getKeeperForStorefront(shopId)!;
      const page = html(profile({ time: { total: NIGHT_TOTAL } }), shopId);
      expect(plateLine(page), shopId).toBe(nightClerkLine(keeper));
    }
  });

  test('the hub’s own market tab still shows no keeper and no plate', () => {
    const page = html(profile({ gold: 0 }), 'market');
    expect(page).not.toContain('data-keeper');
    expect(page).not.toContain('data-keeper-line');
  });

  test('a broke plate still lists the counter’s stock and prices unchanged', () => {
    const page = html(profile({ gold: 5 }), 'bazaar');
    // The transaction surface is exactly the S6 ladder: 20 and 90, both disabled.
    expect(page).toContain('Buy (20 Gold)');
    expect(page).toContain('Buy (90 Gold)');
    expect(page).toContain('disabled');
  });
});
