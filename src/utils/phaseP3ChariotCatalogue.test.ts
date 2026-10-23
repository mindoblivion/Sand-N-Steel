/**
 * P3 — chariot catalogue expansion (types + data + resolver, NO UI).
 *
 * Design: progression-design.md §3.3 + §4 P3.  This slice widens `ChariotSlot` to
 * five slots, appends nine axle / harness / chassis parts to the catalogue and
 * generalises the loadout resolver so a legacy save (wheels/finish only) resolves
 * every newer slot to its stock part at READ time.
 *
 * Sections
 *   §A  the nine appended parts exist, with pinned prices and raceEffect payloads
 *       (prices pinned from the brief, not read back from the data).
 *   §B  the defaults map: every slot has exactly one stock default.
 *   §C  the resolver: legacy -> five slots; fully specified -> unchanged;
 *       damaged / stale ids for the new slots fall back per slot.
 *   §D  read-only: resolution never mutates the stored record and writes nothing,
 *       and the purchase/equip transactions never write a new-slot key.
 *   §E  `raceEffect` is INERT DATA: no production (non-test) module reads it.
 *   §F  the stored save shape is unchanged (no new profile field).
 *   §G  the exclusions hold: wheels slot as shipped, no banner set, no UI touched.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';

import {
  CHARIOT_PARTS,
  CHARIOT_SLOTS,
  DEFAULT_CHARIOT_PART_IDS,
  chariotPartsBySlot,
  getChariotPart,
  getDefaultChariotPart,
} from '../data/chariotParts';
import {
  defaultChariotLoadout,
  equipChariotPart,
  equippedChariotPartId,
  purchaseChariotPart,
  resolveChariotLoadout,
} from './chariotLoadout';
import { createNewProfile } from '../services/storage';
import type { ChariotSlot, PlayerProfile } from '../types/game';

const ALL_SLOTS: ChariotSlot[] = ['wheels', 'finish', 'axle', 'harness', 'chassis'];

/** Pinned from the brief: id, name, slot, price, raceEffect. */
const NINE: Array<[string, string, ChariotSlot, number, Record<string, number>]> = [
  ['axle_stock', 'Ash Axle', 'axle', 0, {}],
  ['axle_ironbound', 'Iron-Bound Axle', 'axle', 260, { durability: 2 }],
  ['axle_bronzehub', 'Bronze-Hub Racing Axle', 'axle', 520, { durability: 4, grip: 1 }],
  ['harness_stock', 'Hide Harness', 'harness', 0, {}],
  ['harness_padded', 'Padded Draft Harness', 'harness', 300, { horseComfort: 2 }],
  ['harness_russata', 'Russata Racing Harness', 'harness', 580, { horseComfort: 4 }],
  ['chassis_stock', 'Ash Tub', 'chassis', 0, {}],
  ['chassis_reinforced', 'Reinforced War Tub', 'chassis', 350, { stability: 2 }],
  ['chassis_lightweight', 'Lightweight Racing Tub', 'chassis', 700, { stability: 3, weight: -2 }],
];

const NEW_STOCK = { axle: 'axle_stock', harness: 'harness_stock', chassis: 'chassis_stock' };

/** A stored record is typed with two slots; a hand-built wider one needs this cast. */
type StoredEquipped = { wheels: string; finish: string };
const wide = (record: Record<string, unknown>): StoredEquipped => record as unknown as StoredEquipped;

// ══════════════════════════════════════════════════════════════════════════
describe('P3 §A — the nine appended parts', () => {
  test('all nine exist with the pinned name, slot, price and raceEffect', () => {
    for (const [id, name, slot, price, effect] of NINE) {
      const part = getChariotPart(id);
      expect(part, id).toBeDefined();
      expect(part!.name, id).toBe(name);
      expect(part!.slot, id).toBe(slot);
      expect(part!.price, id).toBe(price);
      expect(part!.raceEffect, id).toEqual(effect);
      expect(part!.defaultOwned, id).toBe(price === 0);
    }
  });

  test('the paid prices are exactly 260 / 520 / 300 / 580 / 350 / 700 and the stocks are free', () => {
    const paid = NINE.filter(([, , , price]) => price > 0).map(([, , , price]) => price);
    expect(paid).toEqual([260, 520, 300, 580, 350, 700]);
    for (const id of ['axle_stock', 'harness_stock', 'chassis_stock']) {
      expect(getChariotPart(id)!.price).toBe(0);
    }
  });

  test('they are APPENDED: the catalogue is the six shipped rows then these nine, in order', () => {
    // P-BANNER appends one more row after these nine; the prefix this test
    // protects is unchanged, so the window is stated rather than the length.
    expect(CHARIOT_PARTS).toHaveLength(16);
    expect(CHARIOT_PARTS.slice(0, 6).map((p) => [p.id, p.price])).toEqual([
      ['wheels_standard', 0],
      ['wheels_reinforced', 450],
      ['finish_stock', 0],
      ['finish_charred', 180],
      ['finish_gilded', 320],
      ['finish_oxblood', 240],
    ]);
    expect(CHARIOT_PARTS.slice(6, 15).map((p) => p.id)).toEqual(NINE.map(([id]) => id));
  });

  test('raceEffect is plain numbers only, declared by exactly these nine parts', () => {
    const declaring = CHARIOT_PARTS.filter((p) => p.raceEffect !== undefined).map((p) => p.id);
    expect(declaring).toEqual(NINE.map(([id]) => id));
    for (const part of CHARIOT_PARTS) {
      for (const value of Object.values(part.raceEffect ?? {})) {
        expect(typeof value).toBe('number');
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  test('every new part has a unique id and a real description', () => {
    const ids = CHARIOT_PARTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [id] of NINE) expect(getChariotPart(id)!.description.length).toBeGreaterThan(10);
  });

  test('no new part id collides with the item database', async () => {
    const { ITEMS_DB } = await import('../data/itemsDB');
    const itemIds = new Set(ITEMS_DB.map((item: { id: string }) => item.id));
    for (const [id] of NINE) expect(itemIds.has(id)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P3 §B — the per-slot defaults map', () => {
  test('the catalogue lists exactly the five slots', () => {
    expect([...CHARIOT_SLOTS].sort()).toEqual([...ALL_SLOTS].sort());
  });

  test('every slot has exactly ONE stock default, priced at zero', () => {
    for (const slot of ALL_SLOTS) {
      const stocks = chariotPartsBySlot(slot).filter((p) => p.defaultOwned);
      expect(stocks, slot).toHaveLength(1);
      expect(stocks[0].price, slot).toBe(0);
      expect(getDefaultChariotPart(slot).id, slot).toBe(stocks[0].id);
    }
  });

  test('the defaults map is keyed by exactly the five slots and points at the stock ids', () => {
    expect(Object.keys(DEFAULT_CHARIOT_PART_IDS).sort()).toEqual([...ALL_SLOTS].sort());
    expect(DEFAULT_CHARIOT_PART_IDS).toEqual({
      wheels: 'wheels_standard',
      finish: 'finish_stock',
      axle: 'axle_stock',
      harness: 'harness_stock',
      chassis: 'chassis_stock',
    });
  });

  test('the stock default of each slot lives in that slot', () => {
    for (const slot of ALL_SLOTS) {
      expect(getChariotPart(DEFAULT_CHARIOT_PART_IDS[slot])!.slot).toBe(slot);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P3 §C — the generalised resolver', () => {
  const base = (): PlayerProfile => ({ ...createNewProfile('P3 Tester'), gold: 5000 });

  test('a legacy equipped record (wheels/finish only) resolves all five slots, new three at stock', () => {
    const profile: PlayerProfile = {
      ...base(),
      chariot: {
        owned: ['wheels_standard', 'finish_stock', 'wheels_reinforced', 'finish_charred'],
        equipped: { wheels: 'wheels_reinforced', finish: 'finish_charred' },
      },
    };
    const resolved = resolveChariotLoadout(profile);
    expect(Object.keys(resolved.equipped).sort()).toEqual([...ALL_SLOTS].sort());
    expect(resolved.equipped).toEqual({
      wheels: 'wheels_reinforced',
      finish: 'finish_charred',
      ...NEW_STOCK,
    });
  });

  test('a profile with no chariot field resolves every slot to stock', () => {
    const profile = base();
    expect(profile.chariot).toBeUndefined();
    expect(resolveChariotLoadout(profile).equipped).toEqual(DEFAULT_CHARIOT_PART_IDS);
    expect(resolveChariotLoadout(null)).toEqual(defaultChariotLoadout());
    expect(resolveChariotLoadout(undefined).equipped).toEqual(DEFAULT_CHARIOT_PART_IDS);
  });

  test('a fully specified equipped record resolves unchanged', () => {
    const profile: PlayerProfile = {
      ...base(),
      chariot: {
        owned: [
          'wheels_standard', 'finish_stock', 'wheels_reinforced', 'finish_gilded',
          'axle_bronzehub', 'harness_russata', 'chassis_lightweight',
        ],
        // The stored type carries two slots; a later slice's save would carry all
        // five, so build it past the narrow type.
        equipped: wide({
          wheels: 'wheels_reinforced',
          finish: 'finish_gilded',
          axle: 'axle_bronzehub',
          harness: 'harness_russata',
          chassis: 'chassis_lightweight',
        }),
      },
    };
    expect(resolveChariotLoadout(profile).equipped).toEqual({
      wheels: 'wheels_reinforced',
      finish: 'finish_gilded',
      axle: 'axle_bronzehub',
      harness: 'harness_russata',
      chassis: 'chassis_lightweight',
    });
  });

  test("a new-slot part that is not owned, in the wrong slot, or unknown falls back to that slot's stock", () => {
    const profile: PlayerProfile = {
      ...base(),
      chariot: {
        owned: ['wheels_standard', 'finish_stock', 'axle_ironbound'],
        equipped: wide({
          wheels: 'wheels_standard',
          finish: 'finish_stock',
          axle: 'axle_bronzehub', // known, but not owned
          harness: 'axle_ironbound', // owned, but belongs to the axle slot
          chassis: 'chassis_gone', // unknown to the catalogue
        }),
      },
    };
    expect(resolveChariotLoadout(profile).equipped).toEqual({
      wheels: 'wheels_standard',
      finish: 'finish_stock',
      ...NEW_STOCK,
    });
  });

  test('an owned new-slot part that is equipped is kept', () => {
    const profile: PlayerProfile = {
      ...base(),
      chariot: {
        owned: ['wheels_standard', 'finish_stock', 'axle_ironbound'],
        equipped: wide({ wheels: 'wheels_standard', finish: 'finish_stock', axle: 'axle_ironbound' }),
      },
    };
    expect(resolveChariotLoadout(profile).equipped.axle).toBe('axle_ironbound');
    expect(equippedChariotPartId(profile, 'axle')).toBe('axle_ironbound');
    expect(equippedChariotPartId(profile, 'harness')).toBe('harness_stock');
  });

  test('every slot reads through equippedChariotPartId as a real catalogue id', () => {
    const profile = base();
    for (const slot of ALL_SLOTS) {
      expect(getChariotPart(equippedChariotPartId(profile, slot))).toBeDefined();
    }
  });

  test('a null equipped block or null chariot still resolves all five slots', () => {
    const nullEquipped = { ...base(), chariot: { owned: [], equipped: null } } as unknown as PlayerProfile;
    expect(resolveChariotLoadout(nullEquipped).equipped).toEqual(DEFAULT_CHARIOT_PART_IDS);
    const nullChariot = { ...base(), chariot: null } as unknown as PlayerProfile;
    expect(resolveChariotLoadout(nullChariot).equipped).toEqual(DEFAULT_CHARIOT_PART_IDS);
  });

  test('`owned` keeps its pre-P3 meaning: the new stock parts are implicit, never listed', () => {
    expect(resolveChariotLoadout(base()).owned).toEqual(['wheels_standard', 'finish_stock']);
    expect(defaultChariotLoadout().owned).toEqual(['wheels_standard', 'finish_stock']);
  });

  test('the existing wheels/finish behaviour is identical: buy, equip and per-slot fallback', () => {
    const bought = purchaseChariotPart(base(), 'wheels_reinforced');
    if (!bought.ok) throw new Error('buy should succeed');
    const equipped = equipChariotPart(bought.profile, 'wheels_reinforced');
    if (!equipped.ok) throw new Error('equip should succeed');
    expect(resolveChariotLoadout(equipped.profile).equipped.wheels).toBe('wheels_reinforced');
    expect(resolveChariotLoadout(equipped.profile).equipped.finish).toBe('finish_stock');
    // A wheels slot holding a finish id still falls back to the stock wheels.
    const foreign = {
      ...base(),
      chariot: { owned: ['finish_gilded'], equipped: { wheels: 'finish_gilded', finish: 'finish_gilded' } },
    } as PlayerProfile;
    expect(resolveChariotLoadout(foreign).equipped.wheels).toBe('wheels_standard');
    expect(resolveChariotLoadout(foreign).equipped.finish).toBe('finish_gilded');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P3 §D — resolution is read-only and writes nothing', () => {
  test('resolving a legacy record never mutates it (a deep-frozen input does not throw or change)', () => {
    const profile: PlayerProfile = {
      ...createNewProfile('Frozen'),
      chariot: {
        owned: ['wheels_standard', 'finish_stock', 'wheels_reinforced'],
        equipped: { wheels: 'wheels_reinforced', finish: 'finish_stock' },
      },
    };
    const before = JSON.stringify(profile);
    const deepFreeze = (value: unknown): void => {
      if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        Object.values(value as object).forEach(deepFreeze);
      }
    };
    deepFreeze(profile);

    const resolved = resolveChariotLoadout(profile);
    expect(Object.keys(resolved.equipped)).toHaveLength(5);
    expect(JSON.stringify(profile)).toBe(before);
    // The stored record still carries ONLY the two original keys.
    expect(Object.keys(profile.chariot!.equipped).sort()).toEqual(['finish', 'wheels']);
  });

  test('resolving writes nothing: localStorage is never written by a resolve', () => {
    const writes: string[] = [];
    const store = new Map<string, string>();
    const g = globalThis as { localStorage?: unknown };
    const original = g.localStorage;
    g.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { writes.push(k); store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    };
    try {
      resolveChariotLoadout(createNewProfile('Quiet'));
      resolveChariotLoadout(null);
      expect(writes).toEqual([]);
    } finally {
      g.localStorage = original;
    }
  });

  test('resolution returns fresh objects: mutating a result never reaches the defaults map or the profile', () => {
    const profile = createNewProfile('Fresh');
    const resolved = resolveChariotLoadout(profile);
    resolved.equipped.axle = 'tampered';
    resolved.owned.push('tampered');
    expect(DEFAULT_CHARIOT_PART_IDS.axle).toBe('axle_stock');
    expect(resolveChariotLoadout(profile).equipped.axle).toBe('axle_stock');
    expect(resolveChariotLoadout(profile).owned).toEqual(['wheels_standard', 'finish_stock']);
    const fresh = defaultChariotLoadout();
    fresh.equipped.chassis = 'tampered';
    expect(defaultChariotLoadout().equipped.chassis).toBe('chassis_stock');
  });

  test('the transactions persist every NON-STOCK slot and omit the stock ones', () => {
    // P3 pinned "ONLY wheels/finish are ever written".  P6 widens the rule to
    // every slot the workshop sells, and keeps the property P3 cared about —
    // whatever is written round-trips to the same resolved loadout.
    const bought = purchaseChariotPart({ ...createNewProfile('Buyer'), gold: 5000 }, 'wheels_reinforced');
    if (!bought.ok) throw new Error('buy should succeed');
    // A purchase never equips, so every slot is still stock: nothing is stored.
    expect(bought.profile.chariot!.equipped).toEqual({});

    const equipped = equipChariotPart(bought.profile, 'wheels_reinforced');
    if (!equipped.ok) throw new Error('equip should succeed');
    expect(equipped.profile.chariot!.equipped).toEqual({ wheels: 'wheels_reinforced' });
    for (const stock of ['axle_stock', 'harness_stock', 'chassis_stock']) {
      expect(equipped.profile.chariot!.owned).not.toContain(stock);
    }
    expect(resolveChariotLoadout(equipped.profile).equipped).toEqual({
      ...DEFAULT_CHARIOT_PART_IDS,
      wheels: 'wheels_reinforced',
    });
  });

  test('a non-stock fit in a newer slot is written, and reads back after a serialization round trip', () => {
    const bought = purchaseChariotPart({ ...createNewProfile('Charioteer'), gold: 5000 }, 'chassis_lightweight');
    if (!bought.ok) throw new Error('buy should succeed');
    const equipped = equipChariotPart(bought.profile, 'chassis_lightweight');
    if (!equipped.ok) throw new Error('equip should succeed');

    expect(equipped.profile.chariot!.equipped).toEqual({ chassis: 'chassis_lightweight' });
    const resolved = resolveChariotLoadout(equipped.profile).equipped;
    expect(resolved).toEqual({ ...DEFAULT_CHARIOT_PART_IDS, chassis: 'chassis_lightweight' });
    // The bytes on disk read back to the same five-slot loadout.
    const reloaded = JSON.parse(JSON.stringify(equipped.profile)) as PlayerProfile;
    expect(resolveChariotLoadout(reloaded).equipped).toEqual(resolved);
    // Re-equipping the stock part removes the key again, so a legacy-shaped save
    // is what a stock chariot still stores.
    const back = equipChariotPart(equipped.profile, 'chassis_stock');
    if (!back.ok) throw new Error('re-equip should succeed');
    expect(back.profile.chariot!.equipped).toEqual({});
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Source sweeps.  Comments are stripped so prose can neither satisfy nor defeat
// an assertion.
const SRC_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const isTest = (file: string): boolean => /\.test\.(ts|tsx)$/.test(file);
const PRODUCTION_FILES = walk(SRC_ROOT).filter((file) => !isTest(file));
const rel = (file: string): string => file.slice(SRC_ROOT.length + 1);

describe('P3 §E — raceEffect is inert data nothing in production reads', () => {
  test('the sweep covers real production modules (it is not vacuous)', () => {
    expect(PRODUCTION_FILES.length).toBeGreaterThan(100);
    expect(PRODUCTION_FILES.some((f) => f.endsWith('/data/chariotParts.ts'))).toBe(true);
    expect(PRODUCTION_FILES.some((f) => f.endsWith('/utils/chariotLoadout.ts'))).toBe(true);
  });

  test('only the catalogue file mentions raceEffect; every other production module is clear of it', () => {
    const mentioning = PRODUCTION_FILES.filter((file) =>
      stripComments(readFileSync(file, 'utf8')).includes('raceEffect')
    ).map(rel);
    expect(mentioning).toEqual(['data/chariotParts.ts']);
  });

  test('none of the effect-name keys is read anywhere in production outside the catalogue file', () => {
    for (const file of PRODUCTION_FILES) {
      if (file.endsWith('/data/chariotParts.ts')) continue;
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const key of ['horseComfort', 'durability', 'stability']) {
        expect(code.includes(key), `${rel(file)} reads ${key}`).toBe(false);
      }
    }
  });

  test('the catalogue file only DECLARES it: no property access, destructure or optional chain on raceEffect', () => {
    const code = stripComments(readFileSync(`${SRC_ROOT}/data/chariotParts.ts`, 'utf8'));
    expect(code).not.toMatch(/\.raceEffect\b/);
    expect(code).not.toMatch(/\{[^}]*\braceEffect\b[^}]*\}\s*=/);
    expect(code).not.toMatch(/\braceEffect\s*\?\./);
  });

  test('the resolver, workshop, pre-race panel and racing module do not touch it', () => {
    for (const path of [
      'utils/chariotLoadout.ts',
      'components/hub/ChariotWorkshopTab.tsx',
      'components/hub/PreRacePanel.tsx',
      'utils/racingProgression.ts',
    ]) {
      expect(stripComments(readFileSync(`${SRC_ROOT}/${path}`, 'utf8')), path).not.toContain('raceEffect');
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('P3 §F — the stored save shape is unchanged', () => {
  test('the stored ChariotLoadout is a PARTIAL five-slot record; ChariotSlot is the five slots', () => {
    const types = stripComments(readFileSync(`${SRC_ROOT}/types/game.ts`, 'utf8'));
    // P3 pinned `{ wheels: string; finish: string }` because nothing sold the
    // newer slots.  P6's workshop sells all five, so a non-stock fit in any slot
    // has to survive a save; the record is now Partial, and a stock slot is
    // omitted and restored at read time (`DEFAULT_CHARIOT_PART_IDS`).
    expect(types).toContain('equipped: Partial<Record<ChariotSlot, string>>;');
    expect(types).toContain(
      "export type ChariotSlot = 'wheels' | 'finish' | 'axle' | 'harness' | 'chassis';"
    );
  });

  test('no new field was added to PlayerProfile for the chariot (only the existing optional `chariot`)', () => {
    const types = stripComments(readFileSync(`${SRC_ROOT}/types/game.ts`, 'utf8'));
    const profile = types.slice(types.indexOf('export interface PlayerProfile'));
    const body = profile.slice(0, profile.indexOf('\n}'));
    const chariotFields = body.match(/^\s+\w*[Cc]hariot\w*\??:/gm) ?? [];
    expect(chariotFields.map((f) => f.trim())).toEqual(['chariot?:']);
  });

  test('a brand-new profile carries no chariot field, and no axle/harness/chassis key anywhere', () => {
    const fresh = createNewProfile('Shape');
    expect(fresh.chariot).toBeUndefined();
    const text = JSON.stringify(fresh);
    for (const token of ['axle', 'harness', 'chassis']) expect(text).not.toContain(token);
  });

  // The frozen corpus (src/utils/saveFixtures) may be imported by saveCorpus.test.ts
  // ONLY (its §H scope guard), so the corpus-wide P3 checks live there, in §K.
});

// ══════════════════════════════════════════════════════════════════════════
describe('P3 §G — the exclusions hold', () => {
  test('the wheels slot is exactly as shipped: two sets, no spiked or bladed, no 480/620/600/800 price', () => {
    expect(chariotPartsBySlot('wheels').map((p) => [p.id, p.price])).toEqual([
      ['wheels_standard', 0],
      ['wheels_reinforced', 450],
    ]);
    const source = stripComments(readFileSync(`${SRC_ROOT}/data/chariotParts.ts`, 'utf8'));
    for (const banned of ['wheels_spiked', 'wheels_bladed', 'Wheel_Spiked', 'Wheel_Bladed']) {
      expect(source, banned).not.toContain(banned);
    }
    for (const price of [480, 620, 600, 800]) {
      expect(CHARIOT_PARTS.some((p) => p.price === price), String(price)).toBe(false);
    }
  });

  test('the finish slot keeps its four shipped finishes, then the P-BANNER banner set', () => {
    const finish = chariotPartsBySlot('finish');
    expect(finish.slice(0, 4).map((p) => [p.id, p.price])).toEqual([
      ['finish_stock', 0],
      ['finish_charred', 180],
      ['finish_gilded', 320],
      ['finish_oxblood', 240],
    ]);
    // P-BANNER appended exactly one row, priced in fame; its own suite pins the
    // amount and the currency behaviour.
    expect(finish.slice(4).map((p) => [p.id, p.currency])).toEqual([
      ['finish_triumph_banners', 'fame'],
    ]);
  });

  test('the only banner part is P-BANNER\'s, appended after the nine', () => {
    // P3 pinned "no Triumph banner parts".  P-BANNER is the phase that adds one,
    // so the guard becomes the exact set rather than an empty one.
    const banners = CHARIOT_PARTS.filter((p) => /banner|triumph/i.test(p.id)).map((p) => p.id);
    expect(banners).toEqual(['finish_triumph_banners']);
    expect(CHARIOT_PARTS[CHARIOT_PARTS.length - 1].id).toBe('finish_triumph_banners');
    expect(CHARIOT_PARTS).toHaveLength(16);
  });

  test('the workshop derives its sections from the catalogue — no slot list, no part id, no price (P6)', () => {
    // P3 pinned "the workshop queries wheels and finish only", because no screen
    // had gained the newer slots.  P6's workshop sells all five, so the property
    // is restated as the thing P3 was protecting: the screen owns no slot list,
    // no part id and no price, and every section comes from `CHARIOT_SLOTS`.
    const workshop = stripComments(readFileSync(`${SRC_ROOT}/components/hub/ChariotWorkshopTab.tsx`, 'utf8'));
    expect(workshop).toContain(
      'const SLOT_SECTIONS = CHARIOT_SLOTS.map((slot) => ({ slot, parts: chariotPartsBySlot(slot) }));'
    );
    expect(workshop).toContain('SLOT_SECTIONS.map(({ slot, parts })');
    // The only place the slot names appear is `SLOT_META`, a Record keyed by the
    // exported type — so a slot added to the catalogue fails to compile here
    // rather than rendering nothing.  No array of slot names survives.
    const slotNames = /'(?:wheels|finish|axle|harness|chassis)'/;
    const slotArrays = [...workshop.matchAll(/\[([^\]]*)\]/g)]
      .map((m) => m[1])
      .filter((body) => slotNames.test(body));
    expect(slotArrays).toEqual([]);
    // No part id and no gold price literal: both belong to the catalogue.
    for (const part of CHARIOT_PARTS) expect(workshop).not.toContain(`'${part.id}'`);
    expect(workshop).not.toMatch(/\b\d{2,4}\s*[Gg]old/);
    const panel = stripComments(readFileSync(`${SRC_ROOT}/components/hub/PreRacePanel.tsx`, 'utf8'));
    for (const slot of ['axle', 'harness', 'chassis']) {
      expect(panel.includes(slot), `pre-race panel mentions ${slot}`).toBe(false);
    }
  });
});
