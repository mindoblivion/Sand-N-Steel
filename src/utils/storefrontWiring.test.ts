/**
 * Storefront wiring — Phase SHOP-2 regression suite.
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 * Phase SHOP-1 shipped the catalogue (`src/data/shops.ts`) with nothing
 * consuming it. This phase wires it up: each city building's interaction opens
 * the shop tab on ITS OWN storefront, and the shop screen renders that
 * storefront's ids — the hub's own tab keeps the whole market.
 *
 *   §A  the hub locations — the four buildings that sell carry the storefront
 *       id that matches what they are (`smithing_forge` → forge, `general_store`
 *       → bazaar, `merchant_house` → merchant, `armor_workshop` → armorer), all
 *       on the SHOP tab (the workshop's old `gear` tab sold nothing), no other
 *       hub carries one, and the stable's own `chariot` subview is untouched;
 *   §B  the copy fixes — the four prompts the phase was asked to correct, with
 *       no rest wording left in the tavern's or the bathhouse's;
 *   §C  the wiring — `onOpenTab` carries the id, the two hub components pass it
 *       through with `'market'` as the default, and App resets to the open
 *       market whenever the shop tab is opened from the hub's own navigation;
 *   §D  the screen — `ShopTab` renders the resolver's ids (never the catalogue
 *       arrays), every id a storefront offers resolves to a real item so no card
 *       can render blank, the bazaar's empty state is the honest sentence, and
 *       the screen buys only through the handler it is given;
 *   §E  the scope guard — no save path, no price/stock change, and `shops.ts`
 *       still owns no id or price table of its own.
 *
 * Run with: `bun test src/utils/storefrontWiring.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { HUB_LOCATIONS, getNearbyHubLocation } from './cityCollisions';
import { getStorefrontStock, type StorefrontId } from '../data/shops';
import { getItemById, isWeapon, ITEMS_DB, DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';

// ── Sources ────────────────────────────────────────────────────────────────
const path = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));
const load = (rel: string): string => readFileSync(path(rel), 'utf8');
/** Comments are stripped so prose can never satisfy (or defeat) an assertion. */
const code = (rel: string): string =>
  load(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const CITY_SCENE_SRC = code('../components/3d/city/CityHubScene.tsx');
const HUB_SRC = code('../components/hub/GladiatorSchoolHub.tsx');
const SHOP_SRC = code('../components/hub/ShopTab.tsx');
const APP_SRC = code('../App.tsx');
const SHOPS_SRC = code('../data/shops.ts');

// ── The specification: which building opens which storefront ───────────────
const STOREFRONT_BY_HUB: Readonly<Record<string, StorefrontId>> = {
  smithing_forge: 'forge',
  armor_workshop: 'armorer',
  general_store: 'bazaar',
  merchant_house: 'merchant',
};

/** The one storefront the hub's own tab uses (the whole market). */
const HUB_TAB_STOREFRONT: StorefrontId = 'market';

const hub = (id: string) => HUB_LOCATIONS.find((loc) => loc.id === id);

// ══════════════════════════════════════════════════════════════════════════
describe('SHOP-2 §A — each commercial building opens its own storefront', () => {
  test('the four selling buildings carry the storefront that matches them', () => {
    for (const [hubId, shopId] of Object.entries(STOREFRONT_BY_HUB)) {
      const loc = hub(hubId);
      expect(loc).toBeDefined();
      expect(loc?.shopId).toBe(shopId);
      // Every one of them lands on the SHOP tab, which is what renders a stock list.
      expect(loc?.tabKey).toBe('shop');
    }
  });

  test('no other hub carries a storefront id', () => {
    const withShop = HUB_LOCATIONS.filter((loc) => loc.shopId !== undefined)
      .map((loc) => loc.id)
      .sort();
    expect(withShop).toEqual(Object.keys(STOREFRONT_BY_HUB).sort());
  });

  test('the workshop no longer opens the Armory, which has nothing to sell', () => {
    const workshop = hub('armor_workshop');
    expect(workshop?.tabKey).not.toBe('gear');
    // …and the storefront it now opens is genuinely stocked.
    expect(getStorefrontStock('armorer').length).toBeGreaterThan(0);
  });

  test('the stable keeps its chariot subview and gains no storefront', () => {
    const stable = hub('stable');
    expect(stable?.tabKey).toBe('gear');
    expect(stable?.subTab).toBe('chariot');
    expect(stable?.shopId).toBeUndefined();
  });

  test('the storefront ids are the catalogue’s own, and every stock list resolves', () => {
    for (const shopId of Object.values(STOREFRONT_BY_HUB)) {
      const stock = getStorefrontStock(shopId);
      expect(Array.isArray(stock)).toBe(true);
      for (const itemId of stock) expect(getItemById(itemId)).toBeDefined();
    }
    // The market is the whole catalogue, starter included — the hub tab's behaviour.
    expect(getStorefrontStock(HUB_TAB_STOREFRONT)).toEqual(ITEMS_DB.map((item) => item.id));
  });

  test('a hub’s own prompt still comes up from its own arrival', () => {
    expect(getNearbyHubLocation([18, 0, 2.6])?.id).toBe('smithing_forge');
    expect(getNearbyHubLocation([28.2, 0, 4.25])?.id).toBe('armor_workshop');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('SHOP-2 §B — the prompt copy the phase was asked to correct', () => {
  const PROMPTS: Readonly<Record<string, string>> = {
    smithing_forge: 'Buy Weapons',
    armor_workshop: 'Buy Armor & Accessories',
    tavern: 'Hear Rumors',
    bathhouse: 'Visit the Thermae',
  };

  test('each corrected prompt reads as specified', () => {
    for (const [hubId, prompt] of Object.entries(PROMPTS)) {
      expect(hub(hubId)?.actionPrompt).toBe(prompt);
    }
  });

  test('no rest wording is left on the tavern or the bathhouse', () => {
    for (const hubId of ['tavern', 'bathhouse']) {
      expect(hub(hubId)?.actionPrompt.toLowerCase()).not.toContain('rest');
    }
  });

  test('the other selling buildings keep their own prompts', () => {
    expect(hub('general_store')?.actionPrompt).toBe('Visit Bazaar Merchant');
    expect(hub('merchant_house')?.actionPrompt).toBe('Inspect High-Tier Wares');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('SHOP-2 §C — the storefront id is threaded from the city to the screen', () => {
  test('the city scene hands the hub’s storefront to the tab callback', () => {
    expect(CITY_SCENE_SRC).toContain('onOpenTab(nearbyLoc.tabKey, nearbyLoc.subTab, nearbyLoc.shopId)');
    expect(CITY_SCENE_SRC).toContain('shopId?: StorefrontId');
  });

  test('the hub screen passes it to the shop screen, defaulting to the market', () => {
    expect(HUB_SRC).toContain('shopId?: StorefrontId');
    expect(HUB_SRC).toContain("shopId = 'market'");
    expect(HUB_SRC).toContain('shopId={shopId}');
  });

  test('App defaults the shop tab to the market and resets it on the hub’s own navigation', () => {
    expect(APP_SRC).toContain("useState<StorefrontId>('market')");
    expect(APP_SRC).toContain("setShopId(shopStorefront ?? 'market')");
    expect(APP_SRC).toContain("setShopId('market')");
    expect(APP_SRC).toContain('shopId={shopId}');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('SHOP-2 §D — the shop screen renders a storefront, not the catalogue', () => {
  test('the screen resolves its list through the catalogue layer', () => {
    // Living City L3 moved the source of truth one step out: the screen renders
    // the day's offer, which the rotation resolver selects FROM this catalogue
    // layer (`getStorefrontStock`), so the storefront still decides eligibility.
    expect(SHOP_SRC).toContain('resolveStorefrontOffer(profile, shopId)');
    expect(SHOP_SRC).toContain("shopId = 'market'");
    // The storefront's list replaces the old "render every weapon and every armor" screen.
    expect(SHOP_SRC).not.toContain('ALL_WEAPONS');
    expect(SHOP_SRC).not.toContain('ALL_ARMORS');
  });

  test('the bazaar’s empty state is the honest one, not a fake list', () => {
    expect(getStorefrontStock('bazaar')).toEqual([]);
    expect(SHOP_SRC).toContain(
      "The Bazaar's potion stock arrives with the medicus trade"
    );
  });

  test('every storefront the hub can open has its own title and subtitle', () => {
    for (const shopId of [...Object.values(STOREFRONT_BY_HUB), HUB_TAB_STOREFRONT]) {
      expect(SHOP_SRC).toMatch(new RegExp(`${shopId}\\s*:\\s*\\{`));
    }
  });

  test('the screen only ever buys through the handler it is given', () => {
    expect(SHOP_SRC).toContain('onBuyItem(');
    for (const forbidden of ['saveProfile', 'localStorage', 'sessionStorage', 'profile.gold -']) {
      expect(SHOP_SRC).not.toContain(forbidden);
    }
  });

  test('each storefront’s stock is what its own screen would show', () => {
    const forge = getStorefrontStock('forge').map(getItemById);
    expect(forge.every((item) => item !== undefined && isWeapon(item))).toBe(true);
    // The forge withholds exactly the starter every gladiator already carries.
    expect(getStorefrontStock('forge')).not.toContain(DEFAULT_PLAYER_WEAPON.id);

    const armorer = getStorefrontStock('armorer').map(getItemById);
    expect(armorer.length).toBeGreaterThan(0);
    expect(armorer.every((item) => item !== undefined && !isWeapon(item))).toBe(true);

    // The merchant house deals in weapons AND armor, at the top two rarities.
    const merchant = getStorefrontStock('merchant').map(getItemById);
    expect(merchant.some((item) => item !== undefined && isWeapon(item))).toBe(true);
    expect(merchant.some((item) => item !== undefined && !isWeapon(item))).toBe(true);
    for (const item of merchant) {
      expect(['rare', 'legendary']).toContain(item?.rarity);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('SHOP-2 §E — scope guard', () => {
  test('the catalogue layer still owns no item, id or price of its own', () => {
    for (const id of [DEFAULT_PLAYER_WEAPON.id, 'spatha_legion', 'helm_murmillo']) {
      expect(SHOPS_SRC).not.toContain(id);
    }
    expect(SHOPS_SRC).not.toContain('price');
  });

  test('the wiring changed no price and no stock', () => {
    const prices = ITEMS_DB.map((item) => `${item.id}:${item.price}`);
    expect(prices).toHaveLength(ITEMS_DB.length);
    expect(getStorefrontStock('market')).toEqual(ITEMS_DB.map((item) => item.id));
    // Forge ∪ armorer is still the market minus the starter.
    const union = new Set([...getStorefrontStock('forge'), ...getStorefrontStock('armorer')]);
    expect(union.size).toBe(ITEMS_DB.length - 1);
  });

  test('the city scene reads no save and writes none for a storefront', () => {
    expect(CITY_SCENE_SRC).not.toContain('saveProfile');
  });
});
