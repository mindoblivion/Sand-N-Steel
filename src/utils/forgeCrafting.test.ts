/**
 * FORGECRAFT-1 — Forge combining logic regression tests (pure logic, no UI).
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  the recipe table: all eight authored recipes resolve to exactly
 *       their brief §1 result, and the fee is 25 % of the result price
 *       rounded to the nearest 5 gold (spatha 45, shamshir 85, pilum 40,
 *       trident 90, dirk 45, sicae 55, vipers 215, titan 230);
 *   §B  the transaction: a success consumes exactly two inventory entries
 *       by index, deducts only the fee, appends the result catalogue row,
 *       returns a NEW profile and never modifies the owned item objects;
 *   §C  the refusals — for each of its eight reachable reasons — return the
 *       caller's own profile object, untouched (same reference), so a refused
 *       click can never move gold or lose an item;
 *   §D  the instance rules: two copies of one id cost exactly two entries;
 *       the equipped copy (the first entry carrying the equipped id) is
 *       never consumed, but two spares of the same id forge fine;
 *   §E  the rejections pinned by the brief: wooden, shield-line, hasta,
 *       armor, mismatched ids, bad indices (including one entry named
 *       twice), insufficient gold — and the exact-gold boundary;
 *   §F  a legacy save (no optional fields at all) and malformed inventory
 *       entries never throw;
 *   §G  the seams: §J still pins exactly 29 top-level optional fields, and
 *       `combatCalculations.ts` contains no crafting reference.
 *
 * Run with: `bun test src/utils/forgeCrafting.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PlayerProfile } from '../types/game';
import { createNewProfile } from '../services/storage';
import { getItemById } from '../data/itemsDB';
import {
  FORGE_CRAFT_FEE_RATIO,
  FORGE_CRAFT_FEE_ROUNDING,
  FORGE_RECIPES,
  craftForgeItems,
  describeForgeCraftRejection,
  getForgeCraftEligibility,
  getForgeCraftFee,
  getForgeRecipeForInput,
} from './forgeCrafting';

const SRC_DIR = fileURLToPath(new URL('../', import.meta.url));

const item = (id: string) => getItemById(id)!;

/** A profile carrying exactly these catalogue rows, with this purse. */
function profileWith(ids: string[], gold = 500): PlayerProfile {
  const profile = createNewProfile('Forge Test');
  profile.inventory = ids.map((id) => item(id));
  profile.gold = gold;
  return profile;
}

/** The same, with the first row equipped as well (it sits in both slots). */
function profileWithEquipped(ids: string[], gold = 500): PlayerProfile {
  const profile = profileWith(ids, gold);
  const first = profile.inventory[0];
  if (first && 'damageLight' in first) profile.equipped.weapon = first;
  return profile;
}

// ── §A The recipe table ────────────────────────────────────────────────────
describe('FORGECRAFT-1 §A — the recipe table', () => {
  const EXPECTED: [string, string, number][] = [
    ['gladius_standard', 'spatha_legion', 45],
    ['spatha_legion', 'shamshir_curved', 85],
    ['hoplite_spear', 'wpn_pilum', 40],
    ['wpn_pilum', 'trident_retarius', 90],
    ['dagger_pugio', 'dirk_desert', 45],
    ['dirk_desert', 'dual_sicae_daggers', 55],
    ['dual_sicae_daggers', 'dual_vipers', 215],
    ['bronze_mace', 'titan_colossus_mace', 230],
  ];

  test('exactly eight recipes, one per ladder rung', () => {
    expect(FORGE_RECIPES).toHaveLength(8);
    expect(FORGE_RECIPES.map((recipe) => recipe.inputId)).toEqual(
      EXPECTED.map(([input]) => input)
    );
  });

  for (const [inputId, resultId, fee] of EXPECTED) {
    test(`${inputId} ×2 → ${resultId} for ${fee} gold`, () => {
      const recipe = getForgeRecipeForInput(inputId);
      expect(recipe?.resultId).toBe(resultId);
      const result = item(resultId);
      expect(getForgeCraftFee(result)).toBe(fee);
      // The fee is 25 % of the result price, rounded to the nearest 5 gold.
      expect(getForgeCraftFee(result)).toBe(
        Math.round((result.price * FORGE_CRAFT_FEE_RATIO) / FORGE_CRAFT_FEE_ROUNDING) *
          FORGE_CRAFT_FEE_ROUNDING
      );
    });
  }

  test('ladder tops, wooden, shield-line and hasta have no recipe', () => {
    for (const id of [
      'shamshir_curved',
      'trident_retarius',
      'dual_vipers',
      'titan_colossus_mace',
      'wooden_sword_shield',
      'wooden_spear',
      'wooden_daggers',
      'shd_parma_pugio',
      'shd_scutum_gladius',
      'wpn_hasta',
    ]) {
      expect(getForgeRecipeForInput(id)).toBeUndefined();
    }
  });
});

// ── §B The transaction ─────────────────────────────────────────────────────
describe('FORGECRAFT-1 §B — the transaction', () => {
  test('two gladii forge into a spatha for 45 gold', () => {
    const profile = profileWith(['gladius_standard', 'gladius_standard']);
    const settled = craftForgeItems(profile, 0, 1);
    expect(settled).not.toBe(profile);
    expect(settled.gold).toBe(455);
    expect(settled.inventory).toHaveLength(1);
    expect(settled.inventory[0]).toEqual(item('spatha_legion'));
    // Nothing else moved.
    expect(settled.fightsWon).toBe(profile.fightsWon);
    expect(settled.equipped.weapon.id).toBe(profile.equipped.weapon.id);
  });

  test('the fee is the only gold that leaves, on every recipe', () => {
    for (const recipe of FORGE_RECIPES) {
      const profile = profileWith([recipe.inputId, recipe.inputId], 2000);
      const settled = craftForgeItems(profile, 0, 1);
      const fee = getForgeCraftFee(item(recipe.resultId));
      expect(settled.gold).toBe(2000 - fee);
      expect(settled.inventory.map((owned) => owned.id)).toEqual([recipe.resultId]);
    }
  });

  test('a craft never modifies the owned item objects', () => {
    const profile = profileWith(['gladius_standard', 'gladius_standard']);
    const before = profile.inventory.map((owned) => ({ ...owned }));
    craftForgeItems(profile, 0, 1);
    expect(profile.inventory).toEqual(before);
    expect(profile.gold).toBe(500);
  });

  test('eligibility previews the exact result and fee before the button', () => {
    const profile = profileWith(['dirk_desert', 'dirk_desert']);
    const eligibility = getForgeCraftEligibility(profile, 0, 1);
    expect(eligibility.ok).toBe(true);
    if (eligibility.ok) {
      expect(eligibility.result.id).toBe('dual_sicae_daggers');
      expect(eligibility.fee).toBe(55);
      expect(eligibility.input.id).toBe('dirk_desert');
    }
  });
});

// ── §C Refusals return the caller's own profile ────────────────────────────
describe('FORGECRAFT-1 §C — refusals return the profile untouched', () => {
  test('no profile', () => {
    expect(getForgeCraftEligibility(null, 0, 1)).toEqual({ ok: false, reason: 'no-profile' });
    expect(getForgeCraftEligibility(undefined, 0, 1)).toEqual({
      ok: false,
      reason: 'no-profile',
    });
  });

  test('an out-of-range or non-integer index', () => {
    const profile = profileWith(['gladius_standard', 'gladius_standard']);
    for (const [a, b] of [
      [-1, 1],
      [0, 2],
      [2, 0],
      [0.5, 1],
      [0, NaN],
    ] as [number, number][]) {
      expect(getForgeCraftEligibility(profile, a, b)).toEqual({
        ok: false,
        reason: 'invalid-index',
      });
      expect(craftForgeItems(profile, a, b)).toBe(profile);
    }
  });

  test('one entry named twice is one copy, not two', () => {
    const profile = profileWith(['gladius_standard', 'gladius_standard']);
    expect(getForgeCraftEligibility(profile, 0, 0)).toEqual({
      ok: false,
      reason: 'invalid-index',
    });
    expect(craftForgeItems(profile, 0, 0)).toBe(profile);
    expect(profile.inventory).toHaveLength(2);
    expect(profile.gold).toBe(500);
  });

  test('armor is not a weapon — it belongs at the armorer', () => {
    const profile = profileWith(['helm_murmillo', 'helm_murmillo']);
    expect(getForgeCraftEligibility(profile, 0, 1)).toEqual({
      ok: false,
      reason: 'not-a-weapon',
    });
    expect(craftForgeItems(profile, 0, 1)).toBe(profile);
    const mixed = profileWith(['gladius_standard', 'helm_murmillo']);
    expect(getForgeCraftEligibility(mixed, 0, 1)).toEqual({
      ok: false,
      reason: 'not-a-weapon',
    });
    expect(craftForgeItems(mixed, 0, 1)).toBe(mixed);
  });

  test('two different weapons never fuse', () => {
    const profile = profileWith(['gladius_standard', 'spatha_legion']);
    expect(getForgeCraftEligibility(profile, 0, 1)).toEqual({
      ok: false,
      reason: 'mismatched-inputs',
    });
    expect(craftForgeItems(profile, 0, 1)).toBe(profile);
  });

  test('wooden cannot be forged into steel', () => {
    for (const woodenId of ['wooden_sword_shield', 'wooden_spear', 'wooden_daggers']) {
      const profile = profileWith([woodenId, woodenId]);
      expect(getForgeCraftEligibility(profile, 0, 1)).toEqual({
        ok: false,
        reason: 'wooden',
      });
      expect(craftForgeItems(profile, 0, 1)).toBe(profile);
    }
  });

  test('shield-line, hasta and ladder tops have no forge path', () => {
    for (const id of [
      'shd_parma_pugio',
      'shd_scutum_gladius',
      'wpn_hasta',
      'shamshir_curved',
      'trident_retarius',
      'dual_vipers',
      'titan_colossus_mace',
    ]) {
      const profile = profileWith([id, id]);
      expect(getForgeCraftEligibility(profile, 0, 1)).toEqual({
        ok: false,
        reason: 'no-forge-path',
      });
      expect(craftForgeItems(profile, 0, 1)).toBe(profile);
    }
  });

  test('insufficient gold refuses; exactly the fee succeeds', () => {
    const broke = profileWith(['gladius_standard', 'gladius_standard'], 44);
    expect(getForgeCraftEligibility(broke, 0, 1)).toEqual({
      ok: false,
      reason: 'insufficient-gold',
    });
    expect(craftForgeItems(broke, 0, 1)).toBe(broke);
    const exact = profileWith(['gladius_standard', 'gladius_standard'], 45);
    expect(getForgeCraftEligibility(exact, 0, 1).ok).toBe(true);
    expect(craftForgeItems(exact, 0, 1).gold).toBe(0);
  });

  test('every refusal reason has a printed sentence', () => {
    for (const reason of [
      'no-profile',
      'invalid-index',
      'not-a-weapon',
      'mismatched-inputs',
      'wooden',
      'no-forge-path',
      'equipped',
      'insufficient-gold',
    ] as const) {
      const sentence = describeForgeCraftRejection(reason);
      expect(typeof sentence).toBe('string');
      expect(sentence.length).toBeGreaterThan(0);
    }
    expect(describeForgeCraftRejection('wooden')).toContain('Pine and wicker');
  });
});

// ── §D The instance rules ──────────────────────────────────────────────────
describe('FORGECRAFT-1 §D — the instance rules', () => {
  test('three copies forge two and leave one behind', () => {
    const profile = profileWith([
      'gladius_standard',
      'gladius_standard',
      'gladius_standard',
    ]);
    const settled = craftForgeItems(profile, 0, 2);
    expect(settled.inventory.map((owned) => owned.id)).toEqual([
      'gladius_standard',
      'spatha_legion',
    ]);
    expect(settled.gold).toBe(455);
  });

  test('the equipped copy never leaves the rack', () => {
    const profile = profileWithEquipped(['gladius_standard', 'gladius_standard']);
    expect(profile.equipped.weapon.id).toBe('gladius_standard');
    // Index 0 is the equipped copy — either selection naming it refuses.
    expect(getForgeCraftEligibility(profile, 0, 1)).toEqual({
      ok: false,
      reason: 'equipped',
    });
    expect(craftForgeItems(profile, 0, 1)).toBe(profile);
    expect(craftForgeItems(profile, 1, 0)).toBe(profile);
  });

  test('two spares of the equipped id forge fine', () => {
    const profile = profileWithEquipped([
      'gladius_standard',
      'gladius_standard',
      'gladius_standard',
    ]);
    const settled = craftForgeItems(profile, 1, 2);
    expect(settled).not.toBe(profile);
    expect(settled.inventory.map((owned) => owned.id)).toEqual([
      'gladius_standard',
      'spatha_legion',
    ]);
    // The equipped copy is still the one on the rack.
    expect(settled.equipped.weapon.id).toBe('gladius_standard');
  });

  test('a crafted weapon is a plain catalogue row — it can still be tempered', () => {
    const profile = profileWith(['gladius_standard', 'gladius_standard']);
    const settled = craftForgeItems(profile, 0, 1);
    expect(settled.inventory[0]).toEqual(item('spatha_legion'));
    expect(settled.temper).toBeUndefined();
  });
});

// ── §E Legacy saves ────────────────────────────────────────────────────────
describe('FORGECRAFT-1 §E — legacy saves never throw', () => {
  test('a profile with no optional fields crafts fine', () => {
    const legacy = createNewProfile('Legacy Forge');
    for (const key of Object.keys(legacy)) {
      if (key === 'temper' || key === 'story') delete (legacy as unknown as Record<string, unknown>)[key];
    }
    legacy.inventory = [item('hoplite_spear'), item('hoplite_spear')];
    legacy.gold = 500;
    expect(() => craftForgeItems(legacy, 0, 1)).not.toThrow();
    const settled = craftForgeItems(legacy, 0, 1);
    expect(settled.inventory.map((owned) => owned.id)).toEqual(['wpn_pilum']);
  });

  test('malformed inventory entries refuse, never throw', () => {
    const profile = profileWith(['gladius_standard', 'gladius_standard']);
    (profile as unknown as Record<string, unknown>).inventory = [
      null,
      item('gladius_standard'),
    ];
    expect(() => getForgeCraftEligibility(profile, 0, 1)).not.toThrow();
    expect(getForgeCraftEligibility(profile, 0, 1)).toEqual({
      ok: false,
      reason: 'not-a-weapon',
    });
    expect(() => craftForgeItems(profile, 0, 1)).not.toThrow();
    expect(craftForgeItems(profile, 0, 1)).toBe(profile);
  });
});

// ── §F The seams ───────────────────────────────────────────────────────────
describe('FORGECRAFT-1 §F — the seams', () => {
  test('§J still pins exactly 29 top-level optional fields, and crafting adds none', () => {
    // The same scan saveCorpus.test.ts §J runs, asserted here without
    // copying its 29-name list: the count and the absence are the pin.
    const types = readFileSync(join(SRC_DIR, 'types/game.ts'), 'utf8');
    const start = types.indexOf('export interface PlayerProfile {');
    expect(start).toBeGreaterThan(-1);
    let depth = 0;
    let end = start;
    for (let i = types.indexOf('{', start); i < types.length; i += 1) {
      if (types[i] === '{') depth += 1;
      if (types[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = types.slice(start, end);
    const optional = [...body.matchAll(/^ {2}([A-Za-z][A-Za-z0-9_]*)\?:/gm)].map((match) => match[1]);
    expect(optional.length).toBe(29);
    expect(optional).not.toContain('forge');
    expect(optional).toContain('story');
  });

  test('combatCalculations.ts contains no crafting reference', () => {
    const combat = readFileSync(join(SRC_DIR, 'utils/combatCalculations.ts'), 'utf8');
    expect(combat.toLowerCase()).not.toContain('craft');
    expect(combat.toLowerCase()).not.toContain('forge');
  });
});
