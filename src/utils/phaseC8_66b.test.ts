/**
 * Phase C-8.66B — the Chariot Workshop MVP.
 *
 * Run with: `bun test src/utils/phaseC8_66b.test.ts`
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  the catalogue: unique ids, explicit slots, prices, descriptions, the
 *       cosmetic/performance classification, exactly one stock part per slot,
 *       and the fact that no chariot part leaked into `ITEMS_DB` (whose
 *       `'damageLight' in i` / `'defense' in i` narrowing must keep working);
 *   §B  legacy and damaged profiles: no `chariot` field, unknown ids, duplicates
 *       and a missing/foreign `equipped` entry all resolve to the standard
 *       chariot through the real `saveProfile()` / `loadSavedProfile()` pair;
 *   §C  purchase: exactly one deduction, ownership without duplicates, refusal on
 *       insufficient gold / repeat purchase / unknown id / missing profile, and
 *       no in-place mutation of the profile or its nested loadout;
 *   §D  equip: never touches gold, refuses an unowned part, an unknown id and a
 *       part paired with the wrong slot, and survives a save/load round trip;
 *   §E  preview purity: computing eligibility or previewing a part writes nothing,
 *       and the workshop component has no mutation path of its own (source-parsed);
 *   §F  the audited wheel fit — re-measured from the two SHIPPING GLBs, not
 *       restated: both hubs land on the chariot's own (±0.70, 0.65, 0), the
 *       standard set reproduces the fitted wheel's −0.035 bottom exactly, and the
 *       reinforced set's bottom is −0.0525, i.e. the recorded 0.0175 deeper;
 *   §G  the wiring: the Imperial Stable opens the gear tab's chariot subview, the
 *       gear tab keeps two subviews, the hub keeps five tabs, and the collision
 *       registry is untouched by this phase;
 *   §H  both uploaded GLBs are byte-identical to the audited hashes.
 *
 * ── SOURCES ───────────────────────────────────────────────────────────────
 * Every geometric figure is computed here from the GLB's own JSON chunk: node
 * matrices are composed the way glTF defines them (column-major, post-multiplied)
 * and each mesh's POSITION accessor min/max is transformed corner by corner, so
 * the hub heights, radii and bottoms below are the asset's, not a comment's.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect, beforeEach } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// ── In-memory localStorage polyfill (bun's runtime has no DOM) ─────────────
const _store = new Map<string, string>();
const localStorageShim = {
  getItem: (key: string) => _store.get(key) ?? null,
  setItem: (key: string, value: string) => { _store.set(key, value); },
  removeItem: (key: string) => { _store.delete(key); },
  clear: () => { _store.clear(); },
};
// @ts-ignore — assign to global before storage.ts is used
globalThis.localStorage = localStorageShim;

import { PlayerProfile } from '../types/game';
import { createNewProfile, saveProfile, loadSavedProfile, calculateTotalStats } from '../services/storage';
import { ITEMS_DB } from '../data/itemsDB';
import {
  CHARIOT_PARTS,
  DEFAULT_CHARIOT_FINISH,
  DEFAULT_CHARIOT_WHEELS,
  getChariotPart,
  getDefaultChariotPart,
  chariotPartsBySlot,
} from '../data/chariotParts';
import {
  defaultChariotLoadout,
  describeChariotRejection,
  equippedChariotPartId,
  equipChariotPart,
  getChariotEquipEligibility,
  getChariotPurchaseEligibility,
  ownsChariotPart,
  purchaseChariotPart,
  resolveChariotLoadout,
} from './chariotLoadout';
import {
  CHARIOT_MODEL_SCALE,
  CHARIOT_MODEL_URL,
  CHARIOT_STOCK_WHEEL_BOTTOM_Y,
  CHARIOT_STOCK_WHEEL_NODES,
  CHARIOT_WHEEL_HUB_X,
  CHARIOT_WHEEL_HUB_Y,
  CHARIOT_WHEEL_KIT_HUB_Y,
  CHARIOT_WHEEL_KIT_URL,
  CHARIOT_WHEEL_VARIANTS,
  CHARIOT_WHEEL_YAW,
  getChariotWheelPlacement,
} from './chariotGeometry';
import { CITY_COLLIDERS, PLAYER_RADIUS } from './collisionShapes';
import {
  FAST_TRAVEL_ARRIVALS,
  HUB_LOCATIONS,
  getNearbyHubLocation,
} from './cityCollisions';
import { CIRCUS_LINK_MOUTH_APRON } from './circusDistrictGeometry';
import { CORE_3D_ASSETS } from './preloadAssets';

// ── Sources ────────────────────────────────────────────────────────────────
const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
/** Comments are stripped so prose can never satisfy (or defeat) an assertion. */
const code = (rel: string): string =>
  load(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const chariotPartsSrc = code('../data/chariotParts.ts');
const chariotLoadoutSrc = code('./chariotLoadout.ts');
const chariotGeometrySrc = code('./chariotGeometry.ts');
const chariotPreviewSrc = code('../components/3d/ChariotPreview.tsx');
const workshopSrc = code('../components/hub/ChariotWorkshopTab.tsx');
const gearTabSrc = code('../components/hub/GearTab.tsx');
const hubSrc = code('../components/hub/GladiatorSchoolHub.tsx');
const citySceneSrc = code('../components/3d/city/CityHubScene.tsx');
const collisionsSrc = code('./cityCollisions.ts');
const appSrc = code('../App.tsx');

const repoFile = (rel: string) => new URL(rel, import.meta.url);

// ── A minimal, real glTF bounds reader (no three.js needed) ────────────────
const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;

interface GltfJson {
  nodes: any[];
  meshes: any[];
  accessors: any[];
  scenes: { nodes?: number[] }[];
}

function readGltfJson(rel: string): { json: GltfJson; bytes: Buffer } {
  const bytes = readFileSync(repoFile(rel));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint32(0, true)).toBe(GLB_MAGIC);
  const total = view.getUint32(8, true);
  expect(total).toBe(bytes.length);
  let offset = 12;
  let json: GltfJson | null = null;
  while (offset < total) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    if (chunkType === CHUNK_JSON) {
      json = JSON.parse(
        new TextDecoder().decode(bytes.subarray(offset + 8, offset + 8 + chunkLength))
      ) as GltfJson;
    }
    offset += 8 + chunkLength;
  }
  if (!json) throw new Error(`no JSON chunk in ${rel}`);
  return { json, bytes };
}

type Mat4 = number[];
const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** glTF matrices are column-major; `a` then `b` means "apply a, then b". */
function matMul(a: Mat4, b: Mat4): Mat4 {
  const out = new Array(16).fill(0);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

function nodeLocal(node: any): Mat4 {
  if (node.matrix) return node.matrix as Mat4;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const r: Mat4 = [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    0, 0, 0, 1,
  ];
  const scaled: Mat4 = [...r];
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) scaled[j * 4 + i] *= [sx, sy, sz][i];
  }
  scaled[12] = tx;
  scaled[13] = ty;
  scaled[14] = tz;
  return scaled;
}

const xf = (m: Mat4, p: number[]): number[] => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

interface Bounds { min: number[]; max: number[]; corners: number[][] }

/** World-space bounds of one named node's whole subtree, from the asset itself. */
function subtreeBounds(rel: string, nodeName: string): Bounds {
  const { json } = readGltfJson(rel);
  const world: Mat4[] = json.nodes.map(() => IDENTITY);
  const visit = (index: number, parent: Mat4, visited: Set<number>) => {
    expect(visited.has(index)).toBe(false);
    visited.add(index);
    const node = json.nodes[index];
    world[index] = matMul(nodeLocal(node), parent);
    for (const child of node.children ?? []) visit(child, world[index], visited);
  };
  const rootIndex = json.nodes.findIndex((n) => n.name === nodeName);
  expect(rootIndex).toBeGreaterThanOrEqual(0);
  visit(rootIndex, IDENTITY, new Set<number>());

  // Re-walk the subtree to collect its meshes.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const stack = [rootIndex];
  while (stack.length) {
    const index = stack.pop() as number;
    const node = json.nodes[index];
    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives) {
        const accessor = json.accessors[prim.attributes.POSITION];
        for (const cx of [accessor.min[0], accessor.max[0]]) {
          for (const cy of [accessor.min[1], accessor.max[1]]) {
            for (const cz of [accessor.min[2], accessor.max[2]]) {
              const p = xf(world[index], [cx, cy, cz]);
              for (let k = 0; k < 3; k += 1) {
                min[k] = Math.min(min[k], p[k]);
                max[k] = Math.max(max[k], p[k]);
              }
            }
          }
        }
      }
    }
    for (const child of node.children ?? []) stack.push(child);
  }
  const corners: number[][] = [];
  for (const cx of [min[0], max[0]]) {
    for (const cy of [min[1], max[1]]) {
      for (const cz of [min[2], max[2]]) corners.push([cx, cy, cz]);
    }
  }
  return { min, max, corners };
}

/** Ry(θ) — the rotation convention the geometry module documents. */
const ry = (p: number[], theta: number): number[] => [
  p[0] * Math.cos(theta) + p[2] * Math.sin(theta),
  p[1],
  -p[0] * Math.sin(theta) + p[2] * Math.cos(theta),
];

// The suite lives in src/utils/, so the repo's public/ folder is two levels up.
const CHARIOT = '../../public/_workspace_chariot_model_RomanChariot.glb';
const WHEEL_KIT = '../../public/_workspace_chariot_model_RomanChariot_WheelKit.glb';

const AUDITED_HASHES: Record<string, string> = {
  [CHARIOT]: '49e132e658e72d89c544075499939030f708da5db5dd39456f8de0e4799baf2b',
  [WHEEL_KIT]: 'd5b36addbb68f15150c49c1432d8ea7d587efe7767b680cb80bdb0f9e0f96121',
};

const sha256 = (rel: string) =>
  createHash('sha256').update(readFileSync(repoFile(rel))).digest('hex');

const measured = (rel: string, name: string) => subtreeBounds(rel, name);
const mid = (b: Bounds, axis: number) => (b.min[axis] + b.max[axis]) / 2;

let profile: PlayerProfile;
beforeEach(() => {
  _store.clear();
  // A tester with enough gold to buy the whole catalogue: a starting gladiator's
  // 100 gold is below every paid part, and that path has its own test below
  // ('insufficient gold leaves the profile unchanged').
  profile = { ...createNewProfile('Workshop Tester'), gold: 5000 };
});

// ══════════════════════════════════════════════════════════════════════════
describe('C-8.66B §A — catalogue, slots and isolation from the item database', () => {
  test('every part has a unique id, an explicit slot, a price and a description', () => {
    const ids = CHARIOT_PARTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CHARIOT_PARTS.length).toBeGreaterThan(2);
    for (const part of CHARIOT_PARTS) {
      expect(ids.filter((id) => id === part.id)).toHaveLength(1);
      expect(['wheels', 'finish']).toContain(part.slot);
      expect(part.name.length).toBeGreaterThan(2);
      expect(part.description.length).toBeGreaterThan(10);
      expect(Number.isInteger(part.price)).toBe(true);
      expect(part.price).toBeGreaterThanOrEqual(0);
      expect(['performance', 'cosmetic']).toContain(part.partClass);
      expect(typeof part.defaultOwned).toBe('boolean');
    }
  });

  test('each slot has exactly one stock part, priced at zero and marked as such', () => {
    for (const slot of ['wheels', 'finish'] as const) {
      const defaults = chariotPartsBySlot(slot).filter((p) => p.defaultOwned);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].price).toBe(0);
      expect(getDefaultChariotPart(slot).id).toBe(defaults[0].id);
    }
    expect(DEFAULT_CHARIOT_WHEELS).toBe('wheels_standard');
    expect(DEFAULT_CHARIOT_FINISH).toBe('finish_stock');
  });

  test('wheels carry a kit variant and finishes carry material overrides', () => {
    for (const part of chariotPartsBySlot('wheels')) {
      expect(['standard', 'reinforced']).toContain(part.wheelVariant);
    }
    for (const part of chariotPartsBySlot('finish')) {
      expect(part.finish).toBeDefined();
      if (part.defaultOwned) {
        expect(part.overrides ?? []).toHaveLength(0);
      } else {
        expect((part.overrides ?? []).length).toBeGreaterThan(0);
        for (const override of part.overrides ?? []) {
          // The chariot's own material names, per the shipping GLB.
          expect(['Wood', 'DarkWood', 'Bronze', 'Leather']).toContain(override.material);
          expect(override.color).toMatch(/^#[0-9a-f]{6}$/i);
        }
      }
    }
  });

  test('only Standard and Reinforced wheels are sold — Spiked and Bladed are held back', () => {
    const variants = chariotPartsBySlot('wheels').map((p) => p.wheelVariant);
    expect(new Set(variants)).toEqual(new Set(['standard', 'reinforced']));
    const catalogueText = chariotPartsSrc.toLowerCase();
    expect(catalogueText).not.toContain('wheels_spiked');
    expect(catalogueText).not.toContain('wheels_bladed');
    // Their nodes exist in the kit and stay unsold.
    const kit = readGltfJson(WHEEL_KIT).json;
    for (const node of ['Wheel_Spiked', 'Wheel_Bladed']) {
      expect(kit.nodes.some((n) => n.name === node)).toBe(true);
    }
  });

  test('no chariot part is mixed into ITEMS_DB, and item narrowing still works', () => {
    const itemIds = new Set(ITEMS_DB.map((item) => item.id));
    for (const part of CHARIOT_PARTS) expect(itemIds.has(part.id)).toBe(false);
    for (const item of ITEMS_DB) {
      const isWeapon = 'damageLight' in item;
      const isArmor = 'defense' in item;
      expect(isWeapon || isArmor).toBe(true);
      expect(isWeapon && isArmor).toBe(false);
    }
    expect(chariotLoadoutSrc).not.toContain('itemsDB');
  });

  test('the catalogue is reachable through its own lookups', () => {
    expect(getChariotPart('wheels_reinforced')?.slot).toBe('wheels');
    expect(getChariotPart('finish_gilded')?.partClass).toBe('cosmetic');
    expect(getChariotPart('nope')).toBeUndefined();
    expect(chariotPartsBySlot('finish').length).toBeGreaterThan(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('C-8.66B §B — legacy, partial and damaged saves', () => {
  test('a new profile has no chariot field at all, and resolves to the stock chariot', () => {
    expect(profile.chariot).toBeUndefined();
    const loadout = resolveChariotLoadout(profile);
    expect(loadout.equipped).toEqual({ wheels: 'wheels_standard', finish: 'finish_stock' });
    expect(ownsChariotPart(profile, 'wheels_standard')).toBe(true);
    expect(ownsChariotPart(profile, 'finish_stock')).toBe(true);
    expect(ownsChariotPart(profile, 'wheels_reinforced')).toBe(false);
  });

  test('a legacy save without the field survives the real save/load round trip as the standard chariot', () => {
    const legacy = createNewProfile('Legacy Gladiator');
    delete (legacy as Partial<PlayerProfile>).chariot;
    saveProfile(legacy);

    const loaded = loadSavedProfile() as PlayerProfile;
    expect(loaded).not.toBeNull();
    expect(loaded.chariot).toBeUndefined();
    expect(resolveChariotLoadout(loaded)).toEqual(defaultChariotLoadout());
    expect(equippedChariotPartId(loaded, 'wheels')).toBe('wheels_standard');
    expect(equippedChariotPartId(loaded, 'finish')).toBe('finish_stock');
  });

  test('a partial or foreign loadout falls back per slot and drops unknown ids', () => {
    const damaged: PlayerProfile = {
      ...profile,
      // @ts-ignore — deliberately malformed, as a corrupted save would be
      chariot: {
        owned: ['wheels_reinforced', 'wheels_reinforced', 'finish_gone', 42, null] as any,
        equipped: { wheels: 'finish_gilded', finish: 'nope' } as any,
      },
    };
    const loadout = resolveChariotLoadout(damaged);
    // 'finish_gone' / 42 / null are not catalogue ids; the duplicate collapses.
    expect(loadout.owned.sort()).toEqual(
      ['finish_stock', 'wheels_reinforced', 'wheels_standard'].sort()
    );
    // A wheel slot holding a finish id, and an unknown finish, both fall back.
    expect(loadout.equipped).toEqual({ wheels: 'wheels_standard', finish: 'finish_stock' });
  });

  test('an equipped part that is no longer owned falls back to the slot default', () => {
    const stale: PlayerProfile = {
      ...profile,
      chariot: {
        owned: ['wheels_standard', 'finish_stock'],
        equipped: { wheels: 'wheels_reinforced', finish: 'finish_gilded' },
      },
    };
    const loadout = resolveChariotLoadout(stale);
    expect(loadout.equipped).toEqual({ wheels: 'wheels_standard', finish: 'finish_stock' });
    // ...and the resolution does not repair the save behind the player's back.
    expect(stale.chariot?.equipped.wheels).toBe('wheels_reinforced');
  });

  test('a null or undefined profile resolves to the stock chariot without throwing', () => {
    expect(resolveChariotLoadout(null)).toEqual(defaultChariotLoadout());
    expect(resolveChariotLoadout(undefined)).toEqual(defaultChariotLoadout());
    expect(ownsChariotPart(null, 'wheels_standard')).toBe(true);
    expect(ownsChariotPart(null, 'wheels_reinforced')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('C-8.66B §C — purchase: one deduction, no duplicates, no mutation', () => {
  test('an affordable purchase deducts gold exactly once and records ownership', () => {
    const before = profile.gold;
    const part = getChariotPart('wheels_reinforced')!;
    const result = purchaseChariotPart(profile, part.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.profile.gold).toBe(before - part.price);
    expect(result.profile.gold).toBe(before - 450);
    expect(resolveChariotLoadout(result.profile).owned).toContain('wheels_reinforced');
    expect(
      resolveChariotLoadout(result.profile).owned.filter((id) => id === 'wheels_reinforced')
    ).toHaveLength(1);
    // A purchase never equips.
    expect(result.profile.chariot?.equipped.wheels).toBe('wheels_standard');
  });

  test('the original profile and its nested loadout are untouched by a purchase', () => {
    const equippedBefore = { ...resolveChariotLoadout(profile).equipped };
    const snapshot = JSON.stringify(profile);
    const result = purchaseChariotPart(profile, 'finish_charred');
    expect(result.ok).toBe(true);
    expect(JSON.stringify(profile)).toBe(snapshot);
    expect(profile.gold).toBe(5000);
    expect(profile.chariot).toBeUndefined();
    expect(resolveChariotLoadout(profile).equipped).toEqual(equippedBefore);

    // A purchase that follows an existing loadout copies the nested objects.
    const bought = purchaseChariotPart(profile, 'wheels_reinforced');
    if (!bought.ok) return;
    const again = purchaseChariotPart(bought.profile, 'finish_oxblood');
    if (!again.ok) return;
    expect(bought.profile.chariot?.owned).not.toBe(again.profile.chariot?.owned);
    expect(bought.profile.chariot?.equipped).not.toBe(again.profile.chariot?.equipped);
    expect(again.profile.chariot?.owned).toContain('wheels_reinforced');
    expect(again.profile.chariot?.owned).toContain('finish_oxblood');
    expect(bought.profile.chariot?.owned).not.toContain('finish_oxblood');
  });

  test('insufficient gold leaves the profile unchanged', () => {
    const poor: PlayerProfile = { ...profile, gold: 40 };
    const snapshot = JSON.stringify(poor);
    const result = purchaseChariotPart(poor, 'wheels_reinforced');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('insufficient-gold');
    expect(result).not.toHaveProperty('profile');
    expect(poor.gold).toBe(40);
    expect(JSON.stringify(poor)).toBe(snapshot);
    expect(ownsChariotPart(poor, 'wheels_reinforced')).toBe(false);
  });

  test('exactly enough gold is enough', () => {
    const part = getChariotPart('finish_oxblood')!;
    const exact: PlayerProfile = { ...profile, gold: part.price };
    const result = purchaseChariotPart(exact, part.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.gold).toBe(0);
  });

  test('a repeated purchase is rejected without another deduction or duplicate ownership', () => {
    const first = purchaseChariotPart(profile, 'wheels_reinforced');
    if (!first.ok) throw new Error('first purchase should succeed');
    const goldAfterFirst = first.profile.gold;

    const second = purchaseChariotPart(first.profile, 'wheels_reinforced');
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('already-owned');
    expect(first.profile.gold).toBe(goldAfterFirst);
    expect(
      resolveChariotLoadout(first.profile).owned.filter((id) => id === 'wheels_reinforced')
    ).toHaveLength(1);
  });

  test('the free stock parts are owned already, so buying them is a no-op', () => {
    for (const id of [DEFAULT_CHARIOT_WHEELS, DEFAULT_CHARIOT_FINISH]) {
      const result = purchaseChariotPart(profile, id);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('already-owned');
      expect(profile.gold).toBe(5000);
    }
  });

  test('unknown ids and a missing profile are rejected', () => {
    const unknown = purchaseChariotPart(profile, 'wheels_spiked');
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.reason).toBe('unknown-part');

    const noProfile = purchaseChariotPart(null, 'wheels_reinforced');
    expect(noProfile.ok).toBe(false);
    if (!noProfile.ok) {
      expect(noProfile.reason).toBe('no-profile');
      expect(noProfile).not.toHaveProperty('profile');
    }
    expect(profile.gold).toBe(5000);
  });

  test('eligibility reports the same rules the purchase enforces', () => {
    expect(getChariotPurchaseEligibility(profile, 'wheels_reinforced')).toEqual({ ok: true });
    expect(getChariotPurchaseEligibility(profile, 'wheels_standard')).toEqual({
      ok: false,
      reason: 'already-owned',
    });
    expect(getChariotPurchaseEligibility({ ...profile, gold: 0 }, 'wheels_reinforced')).toEqual({
      ok: false,
      reason: 'insufficient-gold',
    });
    expect(getChariotPurchaseEligibility(profile, 'ghost')).toEqual({
      ok: false,
      reason: 'unknown-part',
    });
    expect(getChariotPurchaseEligibility(null, 'wheels_reinforced')).toEqual({
      ok: false,
      reason: 'no-profile',
    });
    for (const reason of [
      'no-profile',
      'unknown-part',
      'slot-mismatch',
      'already-owned',
      'insufficient-gold',
      'not-owned',
    ] as const) {
      expect(describeChariotRejection(reason).length).toBeGreaterThan(5);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('C-8.66B §D — equip: ownership required, never a gold movement', () => {
  test('an unowned part cannot be equipped and changes nothing', () => {
    const snapshot = JSON.stringify(profile);
    const result = equipChariotPart(profile, 'wheels_reinforced');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('not-owned');
    expect(result).not.toHaveProperty('profile');
    expect(JSON.stringify(profile)).toBe(snapshot);
    expect(equippedChariotPartId(profile, 'wheels')).toBe('wheels_standard');
    expect(getChariotEquipEligibility(profile, 'wheels_reinforced')).toEqual({
      ok: false,
      reason: 'not-owned',
    });
  });

  test('re-equipping an owned part does not deduct gold, and a bought part equips without paying again', () => {
    const bought = purchaseChariotPart(profile, 'wheels_reinforced');
    if (!bought.ok) throw new Error('purchase should succeed');
    const goldAfterBuy = bought.profile.gold;

    const equipped = equipChariotPart(bought.profile, 'wheels_reinforced');
    expect(equipped.ok).toBe(true);
    if (!equipped.ok) return;
    expect(equipped.profile.gold).toBe(goldAfterBuy);
    expect(resolveChariotLoadout(equipped.profile).equipped.wheels).toBe('wheels_reinforced');

    // Equipping it again is idempotent and still free.
    const again = equipChariotPart(equipped.profile, 'wheels_reinforced');
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.profile.gold).toBe(goldAfterBuy);
    expect(again.profile.gold).toBe(5000 - 450);

    // ...and the other slot is untouched.
    expect(resolveChariotLoadout(again.profile).equipped.finish).toBe('finish_stock');
  });

  test('a part paired with the wrong slot is rejected', () => {
    const bought = purchaseChariotPart(profile, 'finish_gilded');
    if (!bought.ok) throw new Error('purchase should succeed');
    const snapshot = JSON.stringify(bought.profile);

    const mismatched = equipChariotPart(bought.profile, 'finish_gilded', 'wheels');
    expect(mismatched.ok).toBe(false);
    if (!mismatched.ok) expect(mismatched.reason).toBe('slot-mismatch');
    expect(JSON.stringify(bought.profile)).toBe(snapshot);

    const matched = equipChariotPart(bought.profile, 'finish_gilded', 'finish');
    expect(matched.ok).toBe(true);
    if (matched.ok) {
      expect(resolveChariotLoadout(matched.profile).equipped.finish).toBe('finish_gilded');
    }
  });

  test('unknown ids and a missing profile are rejected by equip too', () => {
    const unknown = equipChariotPart(profile, 'does_not_exist');
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.reason).toBe('unknown-part');
    const noProfile = equipChariotPart(undefined, 'wheels_standard');
    expect(noProfile.ok).toBe(false);
    if (!noProfile.ok) expect(noProfile.reason).toBe('no-profile');
  });

  test('ownership and the equipped choice survive a save/load round trip', () => {
    const bought = purchaseChariotPart(profile, 'wheels_reinforced');
    if (!bought.ok) throw new Error('purchase should succeed');
    const equipped = equipChariotPart(bought.profile, 'wheels_reinforced');
    if (!equipped.ok) throw new Error('equip should succeed');
    const purchasedFinish = purchaseChariotPart(equipped.profile, 'finish_gilded');
    if (!purchasedFinish.ok) throw new Error('finish purchase should succeed');
    const equippedFinish = equipChariotPart(purchasedFinish.profile, 'finish_gilded');
    if (!equippedFinish.ok) throw new Error('finish equip should succeed');

    saveProfile(equippedFinish.profile);
    const loaded = loadSavedProfile() as PlayerProfile;

    const loadout = resolveChariotLoadout(loaded);
    expect(loadout.equipped).toEqual({ wheels: 'wheels_reinforced', finish: 'finish_gilded' });
    expect(loadout.owned).toEqual(expect.arrayContaining([
      'wheels_standard',
      'wheels_reinforced',
      'finish_stock',
      'finish_gilded',
    ]));
    expect(loaded.gold).toBe(5000 - 450 - 320);
    // Re-equipping the stock set after a reload is still free.
    const backToStock = equipChariotPart(loaded, DEFAULT_CHARIOT_WHEELS);
    expect(backToStock.ok).toBe(true);
    if (backToStock.ok) {
      expect(backToStock.profile.gold).toBe(loaded.gold);
      expect(resolveChariotLoadout(backToStock.profile).equipped.wheels).toBe('wheels_standard');
    }
  });

  test('the storage key and the gold field are the existing ones — no parallel system', () => {
    const bought = purchaseChariotPart(profile, 'finish_oxblood');
    if (!bought.ok) throw new Error('purchase should succeed');
    saveProfile(bought.profile);
    expect(_store.has('sand_and_steel_gladiator_save_v2')).toBe(true);
    expect(_store.size).toBe(1);
    // ...and the loadout module is pure: it never names or touches the storage
    // layer, because App hands the profile it returns to the existing saveProfile().
    expect(chariotLoadoutSrc).not.toContain('saveProfile');
    expect(chariotLoadoutSrc).not.toContain('localStorage');
    expect(chariotLoadoutSrc).not.toContain('sessionStorage');
    expect(chariotLoadoutSrc).not.toContain('firestore');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('C-8.66B §E — cosmetic selection, preview purity and combat isolation', () => {
  test('cosmetic selection does not alter combat stats', () => {
    const base = calculateTotalStats(profile);
    let current = profile;
    for (const id of ['finish_charred', 'finish_gilded', 'finish_oxblood']) {
      const bought = purchaseChariotPart(current, id);
      if (!bought.ok) throw new Error(`purchase ${id} should succeed`);
      const equipped = equipChariotPart(bought.profile, id);
      if (!equipped.ok) throw new Error(`equip ${id} should succeed`);
      current = equipped.profile;
      expect(calculateTotalStats(current)).toEqual(base);
    }
    const reinforced = purchaseChariotPart({ ...current, gold: 5000 }, 'wheels_reinforced');
    if (!reinforced.ok) throw new Error('reinforced purchase should succeed');
    expect(calculateTotalStats(reinforced.profile)).toEqual(base);
  });

  test('nothing reads the chariot field for stats, and no stat is presented as an effect', () => {
    expect(code('../services/storage.ts')).not.toContain('chariot');
    expect(code('./combatCalculations.ts')).not.toContain('chariot');
    expect(chariotPartsSrc).not.toContain('damageLight');
    expect(chariotPartsSrc).not.toContain('healthMax');
    expect(chariotPartsSrc).not.toContain('staminaMax');
    // The catalogue declares no numeric effect at all: no stat field names exist in it.
    for (const forbidden of ['speedBonus', 'raceSpeed', 'handling', 'lapTime']) {
      expect(chariotPartsSrc).not.toContain(forbidden);
    }
  });

  test('reading eligibility or looking at a part in the preview writes nothing', () => {
    const snapshot = JSON.stringify(profile);
    getChariotPurchaseEligibility(profile, 'wheels_reinforced');
    getChariotEquipEligibility(profile, 'wheels_standard');
    resolveChariotLoadout(profile);
    ownsChariotPart(profile, 'finish_gilded');
    equippedChariotPartId(profile, 'finish');
    // What the workshop does on a preview click: it only sets local state from
    // the catalogue entry the player is looking at.
    const previewed = getChariotPart('finish_gilded')!;
    expect(previewed.finish).toBe('gilded');
    expect(JSON.stringify(profile)).toBe(snapshot);
    expect(_store.size).toBe(0);
  });

  test('the workshop component owns no mutation path of its own', () => {
    // It borrows the eligibility helpers, and every write goes through its two
    // callbacks — which App wires to the real purchase/equip functions.
    expect(workshopSrc).toContain('getChariotPurchaseEligibility');
    expect(workshopSrc).toContain('getChariotEquipEligibility');
    expect(workshopSrc).not.toContain('purchaseChariotPart');
    expect(workshopSrc).not.toContain('equipChariotPart');
    expect(workshopSrc).not.toContain('saveProfile');
    expect(workshopSrc).not.toContain('localStorage');
    expect(workshopSrc).toContain('onBuyPart(');
    expect(workshopSrc).toContain('onEquipPart(');
    // The preview selection is component state, reset from the equipped loadout.
    expect(workshopSrc).toContain('useState');
    expect(workshopSrc).toContain('Reset preview');
  });

  test('App writes only through the pure helpers and the existing save path', () => {
    expect(appSrc).toContain('purchaseChariotPart');
    expect(appSrc).toContain('equipChariotPart');
    // Scoped to this phase's two handlers: the shop/training handlers elsewhere
    // in App still deduct gold themselves, which is theirs and not this phase's.
    const chariotHandlers = appSrc.slice(
      appSrc.indexOf('const handleBuyChariotPart'),
      appSrc.indexOf('const handleMatchComplete')
    );
    expect(chariotHandlers).toContain('purchaseChariotPart');
    expect(chariotHandlers).toContain('equipChariotPart');
    expect(chariotHandlers).toContain('saveProfile(result.profile)');
    // The chariot handlers never touch gold directly — the helper does that.
    expect(chariotHandlers).not.toContain('gold');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('C-8.66B §F — the audited wheel fit, re-measured from the shipping GLBs', () => {
  const chariotLeft = measured(CHARIOT, 'Wheel_L');
  const chariotRight = measured(CHARIOT, 'Wheel_R');

  test('the chariot model is at the measured game scale, and its fitted wheels sit at (±0.70, 0.65, 0)', () => {
    expect(CHARIOT_MODEL_SCALE).toBe(1);
    expect(CHARIOT_WHEEL_HUB_X).toBeCloseTo(0.7, 6);
    expect(CHARIOT_WHEEL_HUB_Y).toBeCloseTo(0.65, 6);

    // Measured from the asset: the fitted wheel's own bounds.
    expect(mid(chariotLeft, 0)).toBeCloseTo(-CHARIOT_WHEEL_HUB_X, 6);
    expect(mid(chariotLeft, 1)).toBeCloseTo(CHARIOT_WHEEL_HUB_Y, 6);
    expect(mid(chariotRight, 0)).toBeCloseTo(CHARIOT_WHEEL_HUB_X, 6);
    expect(mid(chariotRight, 1)).toBeCloseTo(CHARIOT_WHEEL_HUB_Y, 6);
    expect(chariotLeft.min[1]).toBeCloseTo(CHARIOT_STOCK_WHEEL_BOTTOM_Y, 6);

    // The fitted rim's radius, and its disc plane: thin in X, full size in Y and Z.
    const radius = (chariotLeft.max[1] - chariotLeft.min[1]) / 2;
    expect(radius).toBeCloseTo(CHARIOT_WHEEL_VARIANTS.standard.radius, 6);
    // Measured from the asset: the fitted wheel's own disc is 0.136 wide in X —
    // thin against its 1.37 diameter, which is what "a disc, not a drum" means.
    expect(chariotLeft.max[0] - chariotLeft.min[0]).toBeCloseTo(0.136, 6);
    expect(chariotLeft.max[0] - chariotLeft.min[0]).toBeLessThan(radius / 4);
    expect(chariotLeft.max[2] - chariotLeft.min[2]).toBeCloseTo(radius * 2, 6);
  });

  for (const variant of ['standard', 'reinforced'] as const) {
    test(`${variant}: the kit measurement matches the variant table`, () => {
      const spec = CHARIOT_WHEEL_VARIANTS[variant];
      const kit = measured(WHEEL_KIT, spec.node);
      const radius = (kit.max[1] - kit.min[1]) / 2;

      expect(mid(kit, 0)).toBeCloseTo(spec.kitHubX, 6);
      expect(mid(kit, 1)).toBeCloseTo(CHARIOT_WHEEL_KIT_HUB_Y, 6);
      expect(radius).toBeCloseTo(spec.radius, 6);
      expect(kit.min[1]).toBeCloseTo(spec.kitBottomY, 6);
      // The kit wheel's disc lies in XY (thin in Z) — the 90° yaw is real.
      expect(kit.max[2] - kit.min[2]).toBeLessThan(0.2);
      expect(kit.max[1] - kit.min[1]).toBeGreaterThan(1.3);
    });

    test(`${variant}: both sides land on the axle hub, and the bottom is the audited one`, () => {
      for (const side of ['left', 'right'] as const) {
        const placement = getChariotWheelPlacement(variant, side);
        const hubX = side === 'left' ? -CHARIOT_WHEEL_HUB_X : CHARIOT_WHEEL_HUB_X;

        expect(placement.rotationY).toBeCloseTo(CHARIOT_WHEEL_YAW, 9);
        expect(placement.hub[0]).toBeCloseTo(hubX, 9);
        expect(placement.hub[1]).toBeCloseTo(CHARIOT_WHEEL_HUB_Y, 9);
        expect(placement.hub[2]).toBeCloseTo(0, 9);

        // The hub's alignment to the AXLE is what makes this real: the axle's own
        // bounds straddle 0.65, and the stock hub centre is the same point.
        expect(placement.hub[1]).toBeGreaterThan(0.605);
        expect(placement.hub[1]).toBeLessThan(0.695);
      }
    });
  }

  test('applying the shipped transform to the measured kit geometry reproduces the audited hub and bottom', () => {
    for (const variant of ['standard', 'reinforced'] as const) {
      const kit = measured(WHEEL_KIT, CHARIOT_WHEEL_VARIANTS[variant].node);
      for (const side of ['left', 'right'] as const) {
        const placement = getChariotWheelPlacement(variant, side);
        // Move the asset's own corners through the shipped rotation + position.
        const moved = kit.corners.map((corner) => {
          const r = ry(corner, placement.rotationY);
          return [
            r[0] + placement.position[0],
            r[1] + placement.position[1],
            r[2] + placement.position[2],
          ];
        });
        // The accessor min/max are float32 in the asset, so a corner put through
        // the shipped rotation carries ~1e-8 of error; 6 decimals is the honest
        // precision for a re-measurement of the file.
        const bottomY = Math.min(...moved.map((p) => p[1]));
        expect(bottomY).toBeCloseTo(placement.bottomY, 6);

        // ...and the transformed hub centre is the chariot's hub.
        const hubCentre = (() => {
          const r = ry([mid(kit, 0), mid(kit, 1), 0], placement.rotationY);
          return [r[0] + placement.position[0], r[1] + placement.position[1], r[2] + placement.position[2]];
        })();
        expect(hubCentre[0]).toBeCloseTo(placement.hub[0], 6);
        expect(hubCentre[1]).toBeCloseTo(placement.hub[1], 6);
        expect(hubCentre[2]).toBeCloseTo(placement.hub[2], 6);
        expect(hubCentre[1]).toBeCloseTo(CHARIOT_WHEEL_HUB_Y, 6);
      }
    }
  });

  test('the standard set reproduces the original fitted geometry exactly', () => {
    expect(getChariotWheelPlacement('standard', 'left').bottomY).toBeCloseTo(
      CHARIOT_STOCK_WHEEL_BOTTOM_Y,
      9
    );
    expect(getChariotWheelPlacement('standard', 'left').bottomDelta).toBeCloseTo(0, 9);
    expect(getChariotWheelPlacement('standard', 'right').bottomY).toBeCloseTo(
      CHARIOT_STOCK_WHEEL_BOTTOM_Y,
      9
    );
  });

  test('the reinforced set stays axle-centred and carries the recorded 0.0175 deeper bottom', () => {
    for (const side of ['left', 'right'] as const) {
      const placement = getChariotWheelPlacement('reinforced', side);
      expect(placement.bottomY).toBeCloseTo(-0.0525, 9);
      expect(placement.bottomDelta).toBeCloseTo(-0.0175, 9);
      // The extra depth is exactly the rim's extra radius — nothing was fudged.
      const extraRadius =
        CHARIOT_WHEEL_VARIANTS.reinforced.radius - CHARIOT_WHEEL_VARIANTS.standard.radius;
      expect(extraRadius).toBeCloseTo(0.0175, 9);
      expect(placement.bottomDelta).toBeCloseTo(-extraRadius, 9);
      // The hub is NOT raised to hide it.
      expect(placement.hub[1]).toBeCloseTo(CHARIOT_WHEEL_HUB_Y, 9);
    }
  });

  test('the two sides are mirrored instances with identical hub geometry', () => {
    const source = CHARIOT_WHEEL_VARIANTS.reinforced;
    const kit = measured(WHEEL_KIT, source.node);
    const left = getChariotWheelPlacement('reinforced', 'left');
    const right = getChariotWheelPlacement('reinforced', 'right');
    expect(left.position[0]).toBeCloseTo(-right.position[0], 9);
    expect(left.position[1]).toBeCloseTo(right.position[1], 9);
    expect(left.position[2]).toBeCloseTo(right.position[2], 9);
    expect(left.hub[1]).toBeCloseTo(right.hub[1], 9);
    // The per-variant offset is the kit's own row offset, not zero: the uploaded
    // README's "zero the local position" recipe would leave the wheel at kit X.
    expect(source.kitHubX).not.toBe(0);
    expect(left.position[2]).toBeCloseTo(-source.kitHubX, 9);
    expect(kit.max[0] - kit.min[0]).toBeCloseTo(source.radius * 2, 6);
  });

  test('the preview clones both assets and gives each side its own object instance', () => {
    // The cached scenes are cloned; the kit node is cloned once per side inside
    // the map over the two sides (so the two wheels can never share an instance).
    expect(chariotPreviewSrc).toContain('chariotGltf.scene.clone(true)');
    expect(chariotPreviewSrc).toContain('source.clone(true)');
    expect(chariotPreviewSrc).toMatch(/\(\['left', 'right'\] as const\)\.map/);
    expect(chariotPreviewSrc).toContain('CHARIOT_STOCK_WHEEL_NODES');
    expect(chariotPreviewSrc).toContain('wheelVariant');
  });

  test('the wheel kit is loaded on demand and is NOT in the global preload registry', () => {
    const preloadSrc = code('./preloadAssets.ts');
    expect(preloadSrc).not.toContain('RomanChariot');
    expect([...CORE_3D_ASSETS].some((asset) => asset.includes('chariot'))).toBe(false);
    expect(CHARIOT_WHEEL_KIT_URL).toContain('RomanChariot_WheelKit.glb');
    expect(chariotPreviewSrc).toContain('CHARIOT_WHEEL_KIT_URL');
    // ...and the preview only mounts with the workshop subview.
    expect(gearTabSrc).toContain('<ChariotWorkshopTab');
    expect(gearTabSrc).toContain("gearView === 'chariot'");
  });

  test('the preview keeps its fallbacks and never drives React state from the render loop', () => {
    expect(chariotPreviewSrc).toContain('WebGLReadyGuard');
    expect(chariotPreviewSrc).toContain('WebGLContextErrorBoundary');
    expect(chariotPreviewSrc).toContain('ThreeComponentErrorBoundary');
    expect(chariotPreviewSrc).toContain('CanvasLoadingFallback');
    expect(chariotPreviewSrc).toContain('could not be loaded');
    expect(chariotPreviewSrc).not.toContain('useFrame');
    expect(chariotPreviewSrc).not.toContain('setInterval');
    // The finish recolors a CLONE's materials only.
    expect(chariotGeometrySrc).toContain('material.clone()');
    expect(chariotGeometrySrc).toContain('applyChariotFinish');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('C-8.66B §G — workshop access, navigation and untouched city geometry', () => {
  const stable = HUB_LOCATIONS.find((loc) => loc.id === 'stable')!;

  test('the Imperial Stable interaction opens the existing gear tab on the chariot subview', () => {
    expect(stable).toBeDefined();
    expect(stable.tabKey).toBe('gear');
    expect(stable.subTab).toBe('chariot');
    expect(stable.actionPrompt).toBe('Visit Chariot Workshop');
    // Nothing about where it is or how it is reached moved.
    expect(stable.position).toEqual([26, 0, 15]);
    expect(stable.radius).toBe(5.25);
    expect(FAST_TRAVEL_ARRIVALS['stable']).toEqual([26, 10]);
    expect(getNearbyHubLocation([26, 0, 10])?.id).toBe('stable');
    expect(stable.radius).toBeGreaterThan(3.85 + PLAYER_RADIUS);
  });

  test('the city scene hands the subview to the router callback', () => {
    // Phase SHOP-2 added the third argument (the shop tab's storefront); the
    // subview hint itself is unchanged and still handed through in second place.
    expect(citySceneSrc).toContain('onOpenTab(nearbyLoc.tabKey, nearbyLoc.subTab, nearbyLoc.shopId)');
    expect(citySceneSrc).toContain('subTab?:');
    // The old "under construction" stable notice is gone.
    expect(citySceneSrc).not.toContain('Under construction by order of the Emperor');
  });

  test('the Armory keeps two subviews and the hub keeps five tabs — no sixth global tab', () => {
    const views = gearTabSrc.match(/key: '(armory|chariot)'/g) ?? [];
    expect(views.sort()).toEqual(["key: 'armory'", "key: 'chariot'"]);
    const tabs = hubSrc.match(/key: '(tournament|training|shop|gear|stats)'/g) ?? [];
    expect(tabs).toHaveLength(5);
    expect(hubSrc).not.toContain('chariot');
    expect(hubSrc).toContain('onGearViewChange');
    expect(hubSrc).toContain('onBuyChariotPart');
    expect(hubSrc).toContain('onEquipChariotPart');
  });

  test('the workshop adds no collider, no city bound and no district geometry', () => {
    const rectangles = CITY_COLLIDERS.filter((c) => c.type === 'rect');
    expect(CITY_COLLIDERS).toHaveLength(142);
    expect(rectangles).toHaveLength(32);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('circus-'))).toHaveLength(31);
    expect(CITY_COLLIDERS.some((c) => c.id === 'forecourt-parapet')).toBe(true);
    expect(CITY_COLLIDERS.some((c) => c.id.toLowerCase().includes('chariot'))).toBe(false);
    // The registry gains exactly one thing this phase: the stable's subview hint
    // (its declared type and its value).  No chariot collider, bound or geometry.
    expect(collisionsSrc.match(/chariot/g) ?? []).toHaveLength(2);
    expect(collisionsSrc).toContain("subTab?: 'chariot'");
    expect(collisionsSrc).toContain("subTab: 'chariot'");
    // C-8.65's apron is exactly as it shipped.
    expect(CIRCUS_LINK_MOUTH_APRON.westX).toBeCloseTo(13.1, 9);
    expect(code('../components/3d/city/EastCircusDistrict.tsx')).not.toContain('chariot');
    expect(code('../components/3d/city/Stable.tsx')).not.toContain('chariot');
  });

  test('the chariot assets are only referenced by the workshop feature', () => {
    const referencing = [
      chariotGeometrySrc,
      chariotPreviewSrc,
      workshopSrc,
      code('../data/chariotParts.ts'),
    ].join('\n');
    expect(referencing).toContain('RomanChariot');
    expect(citySceneSrc).not.toContain('RomanChariot');
    expect(code('../components/3d/city/EastCircusArena.tsx')).not.toContain('RomanChariot');
    expect(CHARIOT_MODEL_URL).toBe('/_workspace_chariot_model_RomanChariot.glb');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('C-8.66B §H — the uploaded assets are byte-identical', () => {
  test('both GLBs still hash to their audited values', () => {
    expect(sha256(CHARIOT)).toBe(AUDITED_HASHES[CHARIOT]);
    expect(sha256(WHEEL_KIT)).toBe(AUDITED_HASHES[WHEEL_KIT]);
  });

  test('the assets are structurally intact and carry no texture or animation the workshop ignores', () => {
    for (const rel of [CHARIOT, WHEEL_KIT]) {
      const { json } = readGltfJson(rel);
      expect(json.scenes.length).toBe(1);
      expect(json.accessors.length).toBeGreaterThan(10);
      expect((json as any).images ?? []).toHaveLength(0);
      expect((json as any).animations ?? []).toHaveLength(0);
      expect((json as any).skins ?? []).toHaveLength(0);
    }
    const chariot = readGltfJson(CHARIOT).json as any;
    const chariotMaterials = chariot.materials.map((m: any) => m.name).sort();
    expect(chariotMaterials).toEqual(['Bronze', 'DarkWood', 'Leather', 'Wood']);
    // Every finish override names one of those materials — nothing invented.
    const materialNames = new Set(chariotMaterials);
    for (const part of chariotPartsBySlot('finish')) {
      for (const override of part.overrides ?? []) {
        expect(materialNames.has(override.material)).toBe(true);
      }
    }
  });

  test('the stock wheel node names the preview hides are the model\'s own', () => {
    const { json } = readGltfJson(CHARIOT);
    const names = (json as any).nodes.map((n: any) => n.name);
    for (const node of CHARIOT_STOCK_WHEEL_NODES) expect(names).toContain(node);
    // ...and the kit carries the two sold variants.
    const kitNames = (readGltfJson(WHEEL_KIT).json as any).nodes.map((n: any) => n.name);
    for (const variant of Object.values(CHARIOT_WHEEL_VARIANTS)) {
      expect(kitNames).toContain(variant.node);
    }
  });
});
