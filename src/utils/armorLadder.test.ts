/**
 * Progression P0 — the armor material ladder (data only).
 *
 * Run with: `bun test src/utils/armorLadder.test.ts`
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  the ten appended pieces, field by field: id, slot, name, rarity,
 *       defense, price, sellPrice, staminaRegenBonus, colors, style and every
 *       stat bonus they carry — and that they carry no bonus beyond the ones
 *       specified (no invented healthBonus / bonusStamina);
 *   §B  the two consistent conventions the ten were assigned with: rarity
 *       follows the price band the rest of the catalogue uses, and sellPrice is
 *       ~44% of price rounded to the nearest 5;
 *   §C  append-only registry order: the ten are the LAST ten entries of
 *       `ALL_ARMORS`, in the specified order, and the six pre-existing entries
 *       keep their indices and their exact rarities, prices and defenses;
 *   §D  the per-slot material ladder, bronze < iron < steel < gilded: within
 *       each slot the rungs that ship are non-decreasing in material and
 *       STRICTLY increasing in defense, arms and legs ship all four rungs, and
 *       the two slots that do not (helm has no steel rung, chest no bronze or
 *       steel rung) are pinned as shipped so a future rung is a deliberate
 *       edit rather than an accident;
 *   §E  registry integration: `ITEMS_BY_CATEGORY` resolves four pieces per
 *       slot, `getItemById` finds every new piece, ids stay unique and each
 *       piece's `slot` matches the category it is filed under.
 *
 * ── SCOPE ─────────────────────────────────────────────────────────────────
 * Data only. Nothing here reads a save, a handler, a component or
 * `src/data/shops.ts`; the ladder is asserted from the catalogue itself.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { ALL_ARMORS, ITEMS_BY_CATEGORY, ITEMS_DB, getItemById } from '../data/itemsDB';
import type { ArmorItem, ArmorSlot, ItemRarity } from '../types/game';

type Material = 'bronze' | 'iron' | 'steel' | 'gilded';

/** The ladder's material order; a rung may be absent from a slot, never reordered. */
const MATERIAL_ORDER: Material[] = ['bronze', 'iron', 'steel', 'gilded'];

/**
 * The ten pieces appended by Progression P0. Every value is the specified one;
 * `bonuses` lists the stat bonuses the piece is allowed to carry, and nothing
 * else — a bonus that is not here must be absent from the catalogue entry.
 */
const NEW_PIECES: {
  id: string;
  slot: ArmorSlot;
  name: string;
  rarity: ItemRarity;
  defense: number;
  price: number;
  sellPrice: number;
  staminaRegenBonus: number;
  color: string;
  trimColor: string;
  style?: string;
  bonuses: Partial<Pick<ArmorItem, 'bonusStrength' | 'bonusAgility' | 'bonusDefense' | 'bonusStamina'>>;
}[] = [
  {
    id: 'arms_manica_iron',
    slot: 'arms',
    name: 'Banded Iron Manica',
    rarity: 'uncommon',
    defense: 5,
    price: 180,
    sellPrice: 80,
    staminaRegenBonus: 0.5,
    color: '#64748b',
    trimColor: '#94a3b8',
    bonuses: { bonusStrength: 1 },
  },
  {
    id: 'arms_manica_steel',
    slot: 'arms',
    name: 'Toledo-Steel Manica',
    rarity: 'rare',
    defense: 7,
    price: 420,
    sellPrice: 185,
    staminaRegenBonus: 0.6,
    color: '#475569',
    trimColor: '#cbd5e1',
    bonuses: { bonusStrength: 2 },
  },
  {
    id: 'arms_galerus_gilded',
    slot: 'arms',
    name: 'Gilded Galerus of the Retiarius',
    rarity: 'legendary',
    defense: 9,
    price: 780,
    sellPrice: 345,
    staminaRegenBonus: 0.8,
    color: '#ca8a04',
    trimColor: '#fef08a',
    bonuses: { bonusStrength: 2, bonusAgility: 2 },
  },
  {
    id: 'legs_greaves_iron',
    slot: 'legs',
    name: 'Iron Ocrea Greaves',
    rarity: 'uncommon',
    defense: 7,
    price: 260,
    sellPrice: 115,
    staminaRegenBonus: 1,
    color: '#64748b',
    trimColor: '#94a3b8',
    bonuses: { bonusAgility: 1 },
  },
  {
    id: 'legs_greaves_steel',
    slot: 'legs',
    name: 'Steel War Greaves',
    rarity: 'rare',
    defense: 9,
    price: 480,
    sellPrice: 210,
    staminaRegenBonus: 1.2,
    color: '#475569',
    trimColor: '#cbd5e1',
    bonuses: { bonusAgility: 2 },
  },
  {
    id: 'legs_greaves_gilded',
    slot: 'legs',
    name: 'Gilded Champion Greaves',
    rarity: 'legendary',
    defense: 11,
    price: 820,
    sellPrice: 360,
    staminaRegenBonus: 1.5,
    color: '#ca8a04',
    trimColor: '#fef08a',
    bonuses: { bonusAgility: 3 },
  },
  {
    id: 'helm_galea_iron',
    slot: 'helm',
    name: 'Iron Galea',
    rarity: 'uncommon',
    defense: 6,
    price: 170,
    sellPrice: 75,
    staminaRegenBonus: 0.5,
    color: '#64748b',
    trimColor: '#94a3b8',
    style: 'crested',
    bonuses: { bonusDefense: 1 },
  },
  {
    id: 'helm_champion_gilded',
    slot: 'helm',
    name: "Champion's Gilded Galea",
    rarity: 'legendary',
    defense: 11,
    price: 760,
    sellPrice: 335,
    staminaRegenBonus: 2,
    color: '#ca8a04',
    trimColor: '#fef08a',
    style: 'crested',
    bonuses: { bonusStrength: 2, bonusDefense: 3 },
  },
  {
    id: 'chest_lorica_hamata',
    slot: 'chest',
    name: 'Lorica Hamata Mail',
    rarity: 'rare',
    defense: 14,
    price: 520,
    sellPrice: 230,
    staminaRegenBonus: 0.5,
    color: '#64748b',
    trimColor: '#94a3b8',
    style: 'heavy',
    bonuses: { bonusDefense: 3 },
  },
  {
    id: 'chest_champion_gilded',
    slot: 'chest',
    name: 'Gilded Champion Cuirass',
    rarity: 'legendary',
    defense: 20,
    price: 1200,
    sellPrice: 530,
    staminaRegenBonus: 2,
    color: '#ca8a04',
    trimColor: '#fef08a',
    style: 'heavy',
    bonuses: { bonusStrength: 3, bonusDefense: 6 },
  },
];

/**
 * The six entries that were in `ALL_ARMORS` before this phase, pinned as they
 * shipped so "append only" is a fact and not a promise. Index is the entry's
 * position in the array.
 */
const LEGACY_PIECES = [
  { index: 0, id: 'helm_murmillo', slot: 'helm', rarity: 'common', defense: 4, price: 80, sellPrice: 35 },
  { index: 1, id: 'helm_centurion', slot: 'helm', rarity: 'rare', defense: 8, price: 320, sellPrice: 140 },
  { index: 2, id: 'chest_lorica_segmentata', slot: 'chest', rarity: 'uncommon', defense: 10, price: 240, sellPrice: 100 },
  { index: 3, id: 'chest_golden_muscled', slot: 'chest', rarity: 'legendary', defense: 18, price: 900, sellPrice: 420 },
  { index: 4, id: 'arms_manica', slot: 'arms', rarity: 'common', defense: 3, price: 70, sellPrice: 30 },
  { index: 5, id: 'legs_greaves_bronze', slot: 'legs', rarity: 'uncommon', defense: 5, price: 130, sellPrice: 55 },
] as const;

/**
 * The ladder as SHIPPED, per slot, in ascending order.
 *
 *   - `arms_manica` is the entry rung below iron: `common`, 70 g, and its own
 *     text names no metal, so it is recorded as the slot's bronze rung.
 *   - `chest` carries TWO iron rungs (the segmentata plate, then the hamata
 *     mail) and ships no bronze and no steel rung; `helm` ships no steel rung.
 *     Those absences are pinned below exactly as they are, so adding a rung is
 *     a deliberate edit to this table.
 */
const LADDER: { slot: ArmorSlot; rungs: { tier: Material; id: string }[] }[] = [
  {
    slot: 'arms',
    rungs: [
      { tier: 'bronze', id: 'arms_manica' },
      { tier: 'iron', id: 'arms_manica_iron' },
      { tier: 'steel', id: 'arms_manica_steel' },
      { tier: 'gilded', id: 'arms_galerus_gilded' },
    ],
  },
  {
    slot: 'legs',
    rungs: [
      { tier: 'bronze', id: 'legs_greaves_bronze' },
      { tier: 'iron', id: 'legs_greaves_iron' },
      { tier: 'steel', id: 'legs_greaves_steel' },
      { tier: 'gilded', id: 'legs_greaves_gilded' },
    ],
  },
  {
    slot: 'helm',
    rungs: [
      { tier: 'bronze', id: 'helm_murmillo' },
      { tier: 'iron', id: 'helm_galea_iron' },
      { tier: 'gilded', id: 'helm_champion_gilded' },
    ],
  },
  {
    slot: 'chest',
    rungs: [
      { tier: 'iron', id: 'chest_lorica_segmentata' },
      { tier: 'iron', id: 'chest_lorica_hamata' },
      { tier: 'gilded', id: 'chest_champion_gilded' },
    ],
  },
];

const find = (id: string): ArmorItem => {
  const piece = ALL_ARMORS.find((armor) => armor.id === id);
  if (!piece) throw new Error(`armor ${id} is missing from ALL_ARMORS`);
  return piece;
};

/** Only the stat bonuses an entry actually carries. */
const bonusesOf = (piece: ArmorItem) => {
  const carried: Record<string, number> = {};
  for (const key of ['bonusStrength', 'bonusAgility', 'bonusDefense', 'bonusStamina'] as const) {
    if (piece[key] !== undefined) carried[key] = piece[key] as number;
  }
  return carried;
};

const materialRank = (tier: Material) => MATERIAL_ORDER.indexOf(tier);

describe('P0 armor ladder — the ten appended pieces', () => {
  test('every specified piece is present with its exact id, slot, name and rarity', () => {
    for (const expected of NEW_PIECES) {
      const piece = find(expected.id);
      expect(piece.slot).toBe(expected.slot);
      expect(piece.name).toBe(expected.name);
      expect(piece.rarity).toBe(expected.rarity);
      expect(typeof piece.description).toBe('string');
      expect(piece.description.length).toBeGreaterThan(10);
    }
  });

  test('defense, price and sellPrice are exactly the specified values', () => {
    for (const expected of NEW_PIECES) {
      const piece = find(expected.id);
      expect({ id: piece.id, defense: piece.defense, price: piece.price, sellPrice: piece.sellPrice }).toEqual({
        id: expected.id,
        defense: expected.defense,
        price: expected.price,
        sellPrice: expected.sellPrice,
      });
    }
  });

  test('each piece carries exactly its specified stat bonuses and no others', () => {
    for (const expected of NEW_PIECES) {
      const piece = find(expected.id);
      expect(bonusesOf(piece)).toEqual(expected.bonuses);
      // No unspecified stat was invented on the way in.
      expect(piece.healthBonus).toBeUndefined();
      expect(piece.staminaRegenBonus).toBe(expected.staminaRegenBonus);
    }
  });

  test('colors and styles follow the catalogue: metal palette, helmet crest, heavy chest', () => {
    const metalPalette: Record<string, [string, string]> = {
      iron: ['#64748b', '#94a3b8'],
      steel: ['#475569', '#cbd5e1'],
      gilded: ['#ca8a04', '#fef08a'],
    };
    for (const expected of NEW_PIECES) {
      const piece = find(expected.id);
      expect([piece.color, piece.trimColor]).toEqual([expected.color, expected.trimColor]);
      // The palette named above is the one the entry wears.
      expect(Object.values(metalPalette)).toContainEqual([piece.color, piece.trimColor]);
      expect(piece.style).toBe(expected.style);
    }
    // The two helmets keep the slot's own crest style, the two chests the heavy one.
    expect(find('helm_galea_iron').style).toBe('crested');
    expect(find('helm_champion_gilded').style).toBe('crested');
    expect(find('chest_lorica_hamata').style).toBe('heavy');
    expect(find('chest_champion_gilded').style).toBe('heavy');
  });
});

describe('P0 armor ladder — rarity and sellPrice conventions', () => {
  test('rarity follows the catalogue price band (uncommon, then rare, then legendary)', () => {
    const band = (price: number): ItemRarity => (price < 320 ? 'uncommon' : price < 760 ? 'rare' : 'legendary');
    for (const expected of NEW_PIECES) {
      expect({ id: expected.id, rarity: expected.rarity }).toEqual({ id: expected.id, rarity: band(expected.price) });
    }
    // The band is the one the pre-existing entries already sit in.
    expect(band(130)).toBe('uncommon');
    expect(band(240)).toBe('uncommon');
    expect(band(320)).toBe('rare');
    expect(band(900)).toBe('legendary');
    expect(find('helm_centurion').rarity).toBe(band(find('helm_centurion').price));
    expect(find('chest_lorica_segmentata').rarity).toBe(band(find('chest_lorica_segmentata').price));
  });

  test('sellPrice is ~44% of price, rounded to the nearest 5', () => {
    const sellPriceFor = (price: number) => Math.round((price * 0.44) / 5) * 5;
    for (const expected of NEW_PIECES) {
      expect({ id: expected.id, sellPrice: expected.sellPrice }).toEqual({
        id: expected.id,
        sellPrice: sellPriceFor(expected.price),
      });
      // A resale value never reaches the purchase price.
      expect(expected.sellPrice).toBeLessThan(expected.price);
    }
    // The rule is the catalogue's own: four of the six legacy entries satisfy it
    // (the segmentata and the golden muscled cuirass predate it and are left as
    // they shipped).
    const legacyOnRule = LEGACY_PIECES.filter((piece) => piece.sellPrice === sellPriceFor(piece.price));
    expect(legacyOnRule.map((piece) => piece.id)).toEqual([
      'helm_murmillo',
      'helm_centurion',
      'arms_manica',
      'legs_greaves_bronze',
    ]);
  });
});

describe('P0 armor ladder — append-only registry order', () => {
  test('the ten new pieces are the LAST ten entries, in the specified order', () => {
    const tail = ALL_ARMORS.slice(ALL_ARMORS.length - NEW_PIECES.length);
    expect(tail.map((piece) => piece.id)).toEqual(NEW_PIECES.map((piece) => piece.id));
  });

  test('the six pre-existing entries keep their indices and their exact values', () => {
    for (const legacy of LEGACY_PIECES) {
      const piece = ALL_ARMORS[legacy.index];
      expect({
        id: piece.id,
        slot: piece.slot,
        rarity: piece.rarity,
        defense: piece.defense,
        price: piece.price,
        sellPrice: piece.sellPrice,
      }).toEqual({
        id: legacy.id,
        slot: legacy.slot,
        rarity: legacy.rarity,
        defense: legacy.defense,
        price: legacy.price,
        sellPrice: legacy.sellPrice,
      });
    }
    // Nothing was inserted before them and nothing was dropped.
    expect(ALL_ARMORS.length).toBe(LEGACY_PIECES.length + NEW_PIECES.length);
  });

  test('no legacy entry was edited to make the ladder fit', () => {
    expect(find('arms_manica').defense).toBe(3);
    expect(find('arms_manica').price).toBe(70);
    expect(find('helm_murmillo').defense).toBe(4);
    expect(find('chest_golden_muscled').defense).toBe(18);
    expect(find('chest_golden_muscled').price).toBe(900);
    expect(find('legs_greaves_bronze').defense).toBe(5);
    expect(find('legs_greaves_bronze').price).toBe(130);
  });
});

describe('P0 armor ladder — per-slot material ordering (bronze < iron < steel < gilded)', () => {
  test('within every slot the rungs are non-decreasing in material and strictly increasing in defense', () => {
    for (const { slot, rungs } of LADDER) {
      let previousDefense = -Infinity;
      let previousRank = -1;
      for (const rung of rungs) {
        const piece = find(rung.id);
        expect(piece.slot).toBe(slot);
        expect(materialRank(rung.tier)).toBeGreaterThanOrEqual(previousRank);
        expect(piece.defense).toBeGreaterThan(previousDefense);
        previousDefense = piece.defense;
        previousRank = materialRank(rung.tier);
      }
    }
  });

  test('arms and legs ship a full four-rung ladder', () => {
    for (const slot of ['arms', 'legs'] as ArmorSlot[]) {
      const rungs = LADDER.find((entry) => entry.slot === slot)!.rungs;
      expect(rungs.map((rung) => rung.tier)).toEqual(MATERIAL_ORDER);
      const defenses = rungs.map((rung) => find(rung.id).defense);
      expect(defenses).toEqual([...defenses].sort((a, b) => a - b));
    }
    // Spelled out, bronze < iron < steel < gilded in each of the two slots.
    expect(find('arms_manica').defense).toBeLessThan(find('arms_manica_iron').defense);
    expect(find('arms_manica_iron').defense).toBeLessThan(find('arms_manica_steel').defense);
    expect(find('arms_manica_steel').defense).toBeLessThan(find('arms_galerus_gilded').defense);
    expect(find('legs_greaves_bronze').defense).toBeLessThan(find('legs_greaves_iron').defense);
    expect(find('legs_greaves_iron').defense).toBeLessThan(find('legs_greaves_steel').defense);
    expect(find('legs_greaves_steel').defense).toBeLessThan(find('legs_greaves_gilded').defense);
  });

  test('helm and chest ship the rungs recorded here — the gaps are pinned, not invented', () => {
    const helm = LADDER.find((entry) => entry.slot === 'helm')!.rungs;
    const chest = LADDER.find((entry) => entry.slot === 'chest')!.rungs;
    // As shipped: no steel helm and no bronze or steel chest among the ten pieces.
    expect(helm.map((rung) => rung.tier)).toEqual(['bronze', 'iron', 'gilded']);
    expect(chest.map((rung) => rung.tier)).toEqual(['iron', 'iron', 'gilded']);
    expect(find('helm_murmillo').defense).toBeLessThan(find('helm_galea_iron').defense);
    expect(find('helm_galea_iron').defense).toBeLessThan(find('helm_champion_gilded').defense);
    expect(find('chest_lorica_segmentata').defense).toBeLessThan(find('chest_lorica_hamata').defense);
    expect(find('chest_lorica_hamata').defense).toBeLessThan(find('chest_champion_gilded').defense);
    // A helmet or chest entry named for steel would be the missing rung; there is none.
    const steelNamed = ALL_ARMORS.filter((piece) => /steel/i.test(piece.name));
    expect(steelNamed.map((piece) => piece.slot)).toEqual(['arms', 'legs']);
  });

  test('the legacy upper tiers still sit inside the ladder they now share a slot with', () => {
    // The centurion galea is the helm's strongest pre-existing piece: above the
    // iron rung, not above the gilded one.
    expect(find('helm_centurion').defense).toBeGreaterThan(find('helm_galea_iron').defense);
    expect(find('helm_centurion').defense).toBeLessThan(find('helm_champion_gilded').defense);
    // The gilded champion cuirass is the chest's top rung.
    expect(find('chest_golden_muscled').defense).toBeLessThanOrEqual(find('chest_champion_gilded').defense);
  });
});

describe('P0 armor ladder — registry integration', () => {
  test('every slot resolves four pieces through ITEMS_BY_CATEGORY', () => {
    for (const slot of ['helm', 'chest', 'arms', 'legs'] as ArmorSlot[]) {
      const pieces = ITEMS_BY_CATEGORY[slot];
      expect(pieces.length).toBe(4);
      expect(pieces.every((piece) => piece.slot === slot)).toBe(true);
    }
    const newIds = NEW_PIECES.map((piece) => piece.id);
    for (const expected of NEW_PIECES) {
      expect(ITEMS_BY_CATEGORY[expected.slot].map((piece) => piece.id)).toContain(expected.id);
    }
    expect(ALL_ARMORS.map((piece) => piece.id)).toEqual(expect.arrayContaining(newIds));
  });

  test('getItemById resolves every new piece and the id list stays unique', () => {
    const ids = ITEMS_DB.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const expected of NEW_PIECES) {
      const item = getItemById(expected.id);
      expect(item?.id).toBe(expected.id);
      expect(item && 'defense' in item).toBe(true);
    }
  });

  test('each piece is filed under the slot its id names', () => {
    for (const expected of NEW_PIECES) {
      const [prefix] = expected.id.split('_');
      expect(find(expected.id).slot).toBe(prefix);
    }
  });
});
