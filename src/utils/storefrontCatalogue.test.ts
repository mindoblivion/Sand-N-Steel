/**
 * Storefront catalogue layer (hub shops) — Phase SHOP-1 regression suite.
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 * `src/data/shops.ts` is a pure data layer: it decides which items each hub
 * storefront offers, derived only from the fields of `ITEMS_DB`, and owns no
 * price, stat or item of its own. This suite pins that contract:
 *
 *   §A  the resolver's contract — pure, order-preserving and returning a fresh
 *       array every call, without ever touching `ITEMS_DB`;
 *   §B  each storefront's EXACT id list — forge (every weapon bar the starter),
 *       armorer (all armor), merchant (the rare/legendary goods), bazaar (empty
 *       by design) and market (the whole catalogue);
 *   §C  forge excludes the starter gladius, and every other weapon is present;
 *   §D  the merchant's thirteen goods are exactly the rare/legendary 13;
 *   §E  forge ∪ armorer = market minus the starter, and the two are disjoint;
 *   §F  the item catalogue itself is untouched — the counts and the
 *       load-bearing `ALL_WEAPONS` order (index 2 is the spare starter);
 *   §G  the scope guard — `shops.ts` derives from `ITEMS_DB` fields (no id or
 *       price table of its own), and exactly three components consume it: the
 *       shop screen the storefront wiring added (Phase SHOP-2) and the two
 *       components that carry a storefront id to it.
 *
 * The expected lists below are written out literally on purpose: they are the
 * specification, so a change to a shipped storefront has to be acknowledged
 * here rather than followed silently.
 *
 * Run with: bun test src/utils/storefrontCatalogue.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ALL_ARMORS, ALL_WEAPONS, ITEMS_DB, STARTING_SPARE_WEAPON } from '../data/itemsDB';
import { getStorefrontStock } from '../data/shops';

// ── Sources (for the scope guard) ──────────────────────────────────────────
const path = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const load = (rel: string): string => readFileSync(path(rel), 'utf8');
/** Comments are stripped so prose can never satisfy (or defeat) an assertion. */
const code = (rel: string): string =>
  load(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const SHOPS_SRC = code('../data/shops.ts');

/** Every file under a directory, recursively. */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else out.push(full);
  }
  return out;
}

// ── The specification: each storefront's exact stock, in ITEMS_DB order ────
const STARTER_ID = 'gladius_standard';

const FORGE_IDS = [
  'spatha_legion',
  'hoplite_spear',
  'trident_retarius',
  'dual_sicae_daggers',
  'dual_vipers',
  'bronze_mace',
  'titan_colossus_mace',
  'dagger_pugio',
  'dirk_desert',
  'shamshir_curved',
  'wooden_sword_shield',
];

const ARMORER_IDS = [
  'helm_murmillo',
  'helm_centurion',
  'chest_lorica_segmentata',
  'chest_golden_muscled',
  'arms_manica',
  'legs_greaves_bronze',
  'arms_manica_iron',
  'arms_manica_steel',
  'arms_galerus_gilded',
  'legs_greaves_iron',
  'legs_greaves_steel',
  'legs_greaves_gilded',
  'helm_galea_iron',
  'helm_champion_gilded',
  'chest_lorica_hamata',
  'chest_champion_gilded',
];

const MERCHANT_IDS = [
  'trident_retarius',
  'dual_vipers',
  'titan_colossus_mace',
  'shamshir_curved',
  'helm_centurion',
  'chest_golden_muscled',
  'arms_manica_steel',
  'arms_galerus_gilded',
  'legs_greaves_steel',
  'legs_greaves_gilded',
  'helm_champion_gilded',
  'chest_lorica_hamata',
  'chest_champion_gilded',
];

const MARKET_IDS = ITEMS_DB.map((item) => item.id);

const sorted = (ids: readonly string[]): string[] => [...ids].sort();

// ══════════════════════════════════════════════════════════════════════════
describe('SHOP-1 §A — the resolver is pure and order-preserving', () => {
  test('a storefront resolves to its item ids in ITEMS_DB order', () => {
    expect(getStorefrontStock('forge')).toEqual(FORGE_IDS);
    expect(getStorefrontStock('armorer')).toEqual(ARMORER_IDS);
    expect(getStorefrontStock('merchant')).toEqual(MERCHANT_IDS);
    expect(getStorefrontStock('market')).toEqual(MARKET_IDS);
  });

  test('every call returns a fresh, equal array (no shared reference)', () => {
    const first = getStorefrontStock('market');
    const second = getStorefrontStock('market');
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    first.push('__mutated__');
    expect(getStorefrontStock('market')).toEqual(MARKET_IDS);
  });

  test('the catalogue is never mutated by resolving a storefront', () => {
    const before = ITEMS_DB.map((item) => `${item.id}:${item.rarity}`);
    for (const id of ['forge', 'armorer', 'bazaar', 'merchant', 'market'] as const) {
      getStorefrontStock(id);
    }
    expect(ITEMS_DB.map((item) => `${item.id}:${item.rarity}`)).toEqual(before);
    expect(ITEMS_DB.length).toBe(ALL_WEAPONS.length + ALL_ARMORS.length);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('SHOP-1 §B — each storefront offers exactly its own set', () => {
  test('forge offers 11 weapons', () => {
    expect(getStorefrontStock('forge')).toHaveLength(11);
    expect(new Set(getStorefrontStock('forge'))).toEqual(new Set(FORGE_IDS));
  });

  test('armorer offers all sixteen armor pieces', () => {
    expect(getStorefrontStock('armorer')).toHaveLength(16);
    expect(new Set(getStorefrontStock('armorer'))).toEqual(new Set(ALL_ARMORS.map((a) => a.id)));
  });

  test('merchant offers exactly the thirteen rare/legendary goods', () => {
    expect(getStorefrontStock('merchant')).toHaveLength(13);
    expect(new Set(getStorefrontStock('merchant'))).toEqual(new Set(MERCHANT_IDS));
  });

  test('bazaar is empty by design (consumables land later)', () => {
    expect(getStorefrontStock('bazaar')).toEqual([]);
  });

  test('market offers the whole catalogue, starter included', () => {
    expect(getStorefrontStock('market')).toEqual(MARKET_IDS);
    expect(new Set(getStorefrontStock('market'))).toEqual(new Set(ITEMS_DB.map((i) => i.id)));
    expect(getStorefrontStock('market')).toContain(STARTER_ID);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('SHOP-1 §C — the forge excludes the starter and nothing else', () => {
  test('the starter gladius is not sold by the forge', () => {
    expect(getStorefrontStock('forge')).not.toContain(STARTER_ID);
  });

  test('every other weapon IS forge stock', () => {
    const forge = new Set(getStorefrontStock('forge'));
    for (const weapon of ALL_WEAPONS) {
      if (weapon.id === STARTER_ID) continue;
      expect(forge.has(weapon.id)).toBe(true);
    }
    // Exactly one weapon is withheld, so the set sizes differ by one.
    expect(ALL_WEAPONS.length - getStorefrontStock('forge').length).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('SHOP-1 §D — the merchant deals only in rare and legendary', () => {
  test('the merchant set equals the rare/legendary subset of ITEMS_DB', () => {
    const rareLegendary = ITEMS_DB
      .filter((item) => item.rarity === 'rare' || item.rarity === 'legendary')
      .map((item) => item.id);
    expect(sorted(getStorefrontStock('merchant'))).toEqual(sorted(rareLegendary));
    expect(rareLegendary).toHaveLength(13);
  });

  test('no common or uncommon item is merchant stock', () => {
    const merchant = new Set(getStorefrontStock('merchant'));
    for (const item of ITEMS_DB) {
      if (item.rarity === 'common' || item.rarity === 'uncommon') {
        expect(merchant.has(item.id)).toBe(false);
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('SHOP-1 §E — forge + armorer partition the market minus the starter', () => {
  test('their union is the market without the starter', () => {
    const union = new Set([...getStorefrontStock('forge'), ...getStorefrontStock('armorer')]);
    const expected = new Set(MARKET_IDS.filter((id) => id !== STARTER_ID));
    expect(union).toEqual(expected);
    expect(union.size).toBe(MARKET_IDS.length - 1);
  });

  test('forge and armorer are disjoint', () => {
    const forge = new Set(getStorefrontStock('forge'));
    for (const id of getStorefrontStock('armorer')) expect(forge.has(id)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('SHOP-1 §F — the item catalogue itself is untouched', () => {
  test('the database keeps its weapon and armor counts', () => {
    expect(ALL_WEAPONS).toHaveLength(12);
    expect(ALL_ARMORS).toHaveLength(16);
    expect(ITEMS_DB).toHaveLength(28);
  });

  test('the load-bearing ALL_WEAPONS order is intact', () => {
    expect(ALL_WEAPONS[0].id).toBe(STARTER_ID);
    expect(ALL_WEAPONS[2]).toBe(STARTING_SPARE_WEAPON);
    expect(ALL_WEAPONS[2].id).toBe('hoplite_spear');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('SHOP-1 §G — scope guard: derived from fields, one consumer', () => {
  test('shops.ts derives from itemsDB and carries no id or price table of its own', () => {
    expect(SHOPS_SRC).toContain("from './itemsDB'");
    for (const id of [
      STARTER_ID,
      'spatha_legion',
      'titan_colossus_mace',
      'helm_murmillo',
      'chest_golden_muscled',
    ]) {
      expect(SHOPS_SRC).not.toContain(id);
    }
    expect(SHOPS_SRC).not.toContain('price');
    expect(SHOPS_SRC).not.toContain('sellPrice');
  });

  test('exactly one component renders the storefront layer, and two carry the id to it', () => {
    const components = filesUnder(path('../components'));
    // Comments are stripped: a file may name the module in prose without consuming it.
    const consumers = components
      .filter((file) => /['"][^'"]*\/shops['"]/.test(code(file)))
      .sort();
    // Phase SHOP-2 wired the layer up: `ShopTab` renders a storefront's stock, and
    // the two components that carry the storefront id to it — the city scene, which
    // raises the interaction, and the hub screen in between — import its type. No
    // other component consumes the catalogue layer.
    expect(consumers).toEqual(
      [
        path('../components/3d/city/CityHubScene.tsx'),
        path('../components/hub/GladiatorSchoolHub.tsx'),
        path('../components/hub/ShopTab.tsx'),
      ].sort()
    );
  });
});
