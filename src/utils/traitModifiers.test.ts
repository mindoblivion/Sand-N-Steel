/**
 * CH-1 — the armatura / palma data and the read model.  Data only: no combat,
 * no UI, no writer.
 *
 *   §A  `resolvePalmae` on undefined, null and garbage — always the empty record;
 *   §B  the equipped cap (3), the unlocked filter, unknown/boss-only dropping,
 *       de-duplication and purity;
 *   §C  `mergeModifiers` — the identity, adds, multipliers, `statFlat`, the flag,
 *       the 0.90 `blockReductionAdd` cap and `applyBlockReduction`;
 *   §D  `resolveArmatura` — the explicit class wins, both model inferences, the
 *       Murmillo default;
 *   §E  the seven armaturae as data: stats, doctrina, kit weapons verified against
 *       `itemsDB`, the Forge kit name;
 *   §F  the sixteen palmae as data: ids, the 12/4 split, and the structural rule
 *       that a boss-only row is never in the player pool;
 *   §G  a pre-CH-1 save (no `armatura`, no `palmae`) loads through the real save
 *       path and resolves to Murmillo + empty palmae, with no errors logged.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';

import type { PlayerProfile } from '../types/game';
import { getItemById } from '../data/itemsDB';
import { createNewProfile, loadSavedProfile, saveProfile } from '../services/storage';
import {
  ARMATURAE,
  ARMATURA_IDS,
  DEFAULT_ARMATURA_ID,
  getArmatura,
  isArmaturaId,
} from '../data/armaturae';
import {
  PALMAE,
  PALMAE_BOSS_ONLY,
  PALMAE_PLAYER_POOL,
  getPalma,
} from '../data/palmae';
import {
  BLOCK_REDUCTION_CAP,
  MAX_EQUIPPED_PALMAE,
  applyBlockReduction,
  mergeModifiers,
  resolveArmatura,
  resolvePalmae,
} from './traitModifiers';

// ── In-memory localStorage polyfill for §G (bun's runtime has no DOM) ──────
const _store = new Map<string, string>();
// @ts-ignore — assign to global before storage.ts is used
globalThis.localStorage = {
  getItem: (key: string) => _store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    _store.set(key, value);
  },
  removeItem: (key: string) => {
    _store.delete(key);
  },
  clear: () => {
    _store.clear();
  },
};

const EMPTY_PALMAE = { unlocked: [], equipped: [] };

/** A profile that is a real pre-CH-1 shape — the factory never writes either field. */
const preChOneProfile = (): PlayerProfile => createNewProfile('Pre-CH-1');

const withModel = (model: PlayerProfile['appearance']['characterModel']): PlayerProfile => {
  const profile = preChOneProfile();
  return { ...profile, appearance: { ...profile.appearance, characterModel: model } };
};

// ── §A defaults on absent / garbage input ─────────────────────────────────
describe('CH-1 §A — resolvePalmae defaults', () => {
  test('undefined, null and non-objects resolve to the empty record', () => {
    for (const input of [undefined, null, 42, 'palmae', true, [], () => undefined]) {
      expect(resolvePalmae(input)).toEqual(EMPTY_PALMAE);
    }
  });

  test('a profile with no palmae field resolves to the empty record', () => {
    expect(resolvePalmae(preChOneProfile())).toEqual(EMPTY_PALMAE);
    expect(resolvePalmae({ palmae: null })).toEqual(EMPTY_PALMAE);
    expect(resolvePalmae({ palmae: 'none' })).toEqual(EMPTY_PALMAE);
    expect(resolvePalmae({ palmae: [] })).toEqual(EMPTY_PALMAE);
  });

  test('a malformed record drops what it cannot read rather than throwing', () => {
    expect(resolvePalmae({ unlocked: 'iron_lungs', equipped: 5 })).toEqual(EMPTY_PALMAE);
    expect(resolvePalmae({ palmae: { unlocked: [1, 2, true, null], equipped: 'x' } })).toEqual(EMPTY_PALMAE);
    expect(resolvePalmae({ palmae: { unlocked: {}, equipped: {} } })).toEqual(EMPTY_PALMAE);
  });

  test('a well-formed record is returned as stored', () => {
    expect(resolvePalmae({ palmae: { unlocked: ['iron_lungs'], equipped: ['iron_lungs'] } })).toEqual({
      unlocked: ['iron_lungs'],
      equipped: ['iron_lungs'],
    });
  });
});

// ── §B the cap, the filter and purity ─────────────────────────────────────
describe('CH-1 §B — resolvePalmae rules', () => {
  test('equipped is capped at three, in stored order', () => {
    const profile = {
      palmae: {
        unlocked: ['executioner', 'shieldwall_discipline', 'untouchable', 'iron_lungs', 'second_wind'],
        equipped: ['second_wind', 'iron_lungs', 'untouchable', 'shieldwall_discipline', 'executioner'],
      },
    };
    expect(MAX_EQUIPPED_PALMAE).toBe(3);
    expect(resolvePalmae(profile).equipped).toEqual(['second_wind', 'iron_lungs', 'untouchable']);
  });

  test('equipped ids that are not unlocked are dropped', () => {
    expect(
      resolvePalmae({ palmae: { unlocked: ['iron_lungs'], equipped: ['iron_lungs', 'second_wind'] } }),
    ).toEqual({ unlocked: ['iron_lungs'], equipped: ['iron_lungs'] });
    expect(resolvePalmae({ palmae: { equipped: ['iron_lungs'] } })).toEqual(EMPTY_PALMAE);
  });

  test('unknown ids and boss-only ids never survive the read', () => {
    const profile = {
      palmae: {
        unlocked: ['not_a_palma', 'pyre_brand', 'colossus_hide', 'iron_lungs'],
        equipped: ['pyre_brand', 'pit_bellower', 'iron_lungs'],
      },
    };
    expect(resolvePalmae(profile)).toEqual({ unlocked: ['iron_lungs'], equipped: ['iron_lungs'] });
  });

  test('duplicates collapse to the first occurrence', () => {
    expect(
      resolvePalmae({ palmae: { unlocked: ['iron_lungs', 'iron_lungs'], equipped: ['iron_lungs', 'iron_lungs'] } }),
    ).toEqual({ unlocked: ['iron_lungs'], equipped: ['iron_lungs'] });
  });

  test('the resolver never mutates its input and returns fresh arrays', () => {
    const record = { unlocked: ['iron_lungs', 'second_wind'], equipped: ['iron_lungs'] };
    const profile = { palmae: record };
    const before = JSON.stringify(profile);
    const resolved = resolvePalmae(profile);

    expect(JSON.stringify(profile)).toBe(before);
    expect(resolved.unlocked).not.toBe(record.unlocked);
    expect(resolved.equipped).not.toBe(record.equipped);
  });

  test('it accepts the palmae record on its own as well as the profile', () => {
    const record = { unlocked: ['iron_lungs'], equipped: ['iron_lungs'] };
    expect(resolvePalmae(record)).toEqual({ unlocked: ['iron_lungs'], equipped: ['iron_lungs'] });
  });
});

// ── §C mergeModifiers ─────────────────────────────────────────────────────
describe('CH-1 §C — mergeModifiers', () => {
  test('an empty block is the identity', () => {
    expect(mergeModifiers([])).toEqual({});
    expect(mergeModifiers([{}])).toEqual({});
    expect(mergeModifiers([{}, {}])).toEqual({});
    expect(mergeModifiers([undefined, null])).toEqual({});
    expect(mergeModifiers([{ statFlat: {} }])).toEqual({});
  });

  test('adds add per field', () => {
    expect(mergeModifiers([{ staminaMaxAdd: 12 }, { staminaMaxAdd: 10 }])).toEqual({ staminaMaxAdd: 22 });
    expect(
      mergeModifiers([{ staminaMaxAdd: 12, staminaRegenAdd: 2 }, { staminaRegenAdd: 1, restStaminaAdd: 15 }]),
    ).toEqual({ staminaMaxAdd: 12, staminaRegenAdd: 3, restStaminaAdd: 15 });
  });

  test('multipliers multiply', () => {
    const merged = mergeModifiers([{ damageDealtMult: 1.1 }, { damageDealtMult: 0.95 }]);
    expect(merged.damageDealtMult).toBeCloseTo(1.045, 10);
    expect(mergeModifiers([{ goldMult: 1.1, xpMult: 0.95 }])).toEqual({ goldMult: 1.1, xpMult: 0.95 });
  });

  test('statFlat adds per stat', () => {
    expect(mergeModifiers([{ statFlat: { str: 2 } }, { statFlat: { str: 3, agi: 1 } }])).toEqual({
      statFlat: { str: 5, agi: 1 },
    });
  });

  test('comboShield is a flag: any true wins, absent stays absent', () => {
    expect(mergeModifiers([{ comboShield: true }, {}])).toEqual({ comboShield: true });
    expect(mergeModifiers([{ comboShield: false }])).toEqual({});
  });

  test('the pooled blockReductionAdd cannot exceed the 0.90 cap', () => {
    expect(BLOCK_REDUCTION_CAP).toBe(0.9);
    expect(mergeModifiers([{ blockReductionAdd: 0.06 }])).toEqual({ blockReductionAdd: 0.06 });
    expect(mergeModifiers([{ blockReductionAdd: 0.6 }, { blockReductionAdd: 0.5 }]).blockReductionAdd).toBe(0.9);
    expect(mergeModifiers([{ blockReductionAdd: 0.4 }, { blockReductionAdd: 0.4 }]).blockReductionAdd).toBe(0.8);
  });

  test('applyBlockReduction clamps a weapon base plus an add to 0.90', () => {
    expect(applyBlockReduction(0.82, 0)).toBe(0.82);
    expect(applyBlockReduction(0.85, 0.06)).toBe(0.9);
    expect(applyBlockReduction(0.5, 0.06)).toBeCloseTo(0.56, 10);
    expect(applyBlockReduction(0.99, 0.06)).toBe(0.9);
    // A total can never go below zero, and a negative add is honoured.
    expect(applyBlockReduction(-1, 0.2)).toBe(0);
    expect(applyBlockReduction(0.5, -0.1)).toBeCloseTo(0.4, 10);
    expect(applyBlockReduction(Number.NaN, 0.1)).toBe(0.1);
    expect(applyBlockReduction(0.5, Number.POSITIVE_INFINITY)).toBe(0.5);
  });

  test('non-finite values and non-block entries are ignored', () => {
    expect(
      mergeModifiers([{ staminaMaxAdd: Number.NaN, goldMult: Number.POSITIVE_INFINITY }, 'x' as never]),
    ).toEqual({});
  });

  test('merging never mutates its blocks', () => {
    const block = { staminaMaxAdd: 12, statFlat: { str: 2 } };
    const before = JSON.stringify(block);
    const merged = mergeModifiers([block, { staminaMaxAdd: 3 }]);
    expect(JSON.stringify(block)).toBe(before);
    expect(merged.statFlat).not.toBe(block.statFlat);
  });
});

// ── §D resolveArmatura ────────────────────────────────────────────────────
describe('CH-1 §D — resolveArmatura', () => {
  test('the default is Murmillo', () => {
    expect(DEFAULT_ARMATURA_ID).toBe('murmillo');
  });

  test('a missing profile or a plain character resolves to Murmillo', () => {
    expect(resolveArmatura(undefined)).toBe('murmillo');
    expect(resolveArmatura(null)).toBe('murmillo');
    expect(resolveArmatura(preChOneProfile())).toBe('murmillo');
    expect(resolveArmatura(withModel('roman_warrior'))).toBe('murmillo');
    expect(resolveArmatura(withModel('amazonian'))).toBe('murmillo');
    expect(resolveArmatura(withModel('minotaur'))).toBe('murmillo');
  });

  test('the two class models are inferred', () => {
    expect(resolveArmatura(withModel('retiarius'))).toBe('retiarius');
    expect(resolveArmatura(withModel('dimachaerus'))).toBe('dimachaerus');
  });

  test('an explicit class wins over the model', () => {
    expect(resolveArmatura({ ...withModel('retiarius'), armatura: 'thraex' })).toBe('thraex');
    expect(resolveArmatura({ ...withModel('roman_warrior'), armatura: 'hoplomachus' })).toBe('hoplomachus');
  });

  test('a garbage explicit value falls through to the inference', () => {
    const garbage = { ...withModel('dimachaerus'), armatura: 'gladiator' } as unknown as PlayerProfile;
    expect(resolveArmatura(garbage)).toBe('dimachaerus');
  });

  test('isArmaturaId accepts the seven ids and nothing else', () => {
    for (const id of ARMATURA_IDS) expect(isArmaturaId(id)).toBe(true);
    for (const value of ['gladiator', '', null, 3, {}, undefined]) expect(isArmaturaId(value)).toBe(false);
  });
});

// ── §E the armaturae as data ──────────────────────────────────────────────
describe('CH-1 §E — the seven armaturae', () => {
  test('all seven are present, in the design order, with unique ids', () => {
    expect(ARMATURAE).toHaveLength(7);
    expect(ARMATURA_IDS).toEqual([
      'murmillo',
      'retiarius',
      'secutor',
      'thraex',
      'hoplomachus',
      'dimachaerus',
      'provocator',
    ]);
    expect(new Set(ARMATURA_IDS).size).toBe(7);
    for (const id of ARMATURA_IDS) expect(getArmatura(id)?.id).toBe(id);
  });

  test('the stat templates are the design values', () => {
    const expected: Record<string, [number, number, number, number]> = {
      murmillo: [12, 8, 10, 6],
      retiarius: [9, 13, 11, 1],
      secutor: [11, 9, 11, 5],
      thraex: [10, 12, 10, 3],
      hoplomachus: [11, 9, 10, 5],
      dimachaerus: [10, 13, 10, 2],
      provocator: [11, 10, 10, 5],
    };
    for (const armatura of ARMATURAE) {
      const [strength, agility, stamina, defense] = expected[armatura.id];
      expect(armatura.stats, armatura.id).toEqual({ strength, agility, stamina, defense });
    }
  });

  test('every fantasy line is the design line', () => {
    expect(getArmatura('murmillo')?.fantasy).toBe('The wall that walks.');
    expect(getArmatura('retiarius')?.fantasy).toBe('Kill from three meters, or not at all.');
    expect(getArmatura('secutor')?.fantasy).toBe('Built to hunt the fisherman.');
    expect(getArmatura('thraex')?.fantasy).toBe("The curved blade asks questions shields can't answer.");
    expect(getArmatura('hoplomachus')?.fantasy).toBe('A spear wall of one.');
    expect(getArmatura('dimachaerus')?.fantasy).toBe('Two blades, no shield, no brakes.');
    expect(getArmatura('provocator')?.fantasy).toBe("The legion's duelist, trained against his own mirror.");
  });

  test('every class carries its doctrina id, name and one-line text', () => {
    const names: Record<string, string> = {
      murmillo: 'Fish-Scale Wall',
      retiarius: 'Cast the Net',
      secutor: 'Snag-Proof Pursuit',
      thraex: 'Hook the Rim',
      hoplomachus: "Spearman's Ground",
      dimachaerus: 'Twin Fangs',
      provocator: 'Mirror Drill',
    };
    for (const armatura of ARMATURAE) {
      expect(armatura.doctrina.name, armatura.id).toBe(names[armatura.id]);
      expect(armatura.doctrina.id.length).toBeGreaterThan(3);
      expect(armatura.doctrina.text.length).toBeGreaterThan(20);
      expect(Array.isArray(armatura.doctrina.notes)).toBe(true);
    }
  });

  test('the doctrinae the block can express carry the design values', () => {
    expect(getArmatura('murmillo')?.doctrina.modifiers).toEqual({ onBlockStamina: 6 });
    expect(getArmatura('secutor')?.doctrina.modifiers).toEqual({ staminaCostMult: 0.85 });
    expect(getArmatura('provocator')?.doctrina.modifiers).toEqual({ damageTakenMult: 0.92 });
    // The stateful / unhooked ones are honestly empty blocks with their condition noted.
    for (const id of ['retiarius', 'thraex', 'hoplomachus', 'dimachaerus'] as const) {
      expect(getArmatura(id)?.doctrina.modifiers, id).toEqual({});
      expect((getArmatura(id)?.doctrina.notes.length ?? 0) > 0, id).toBe(true);
    }
  });

  test('the starting kit references real itemsDB entries', () => {
    for (const armatura of ARMATURAE) {
      const weapon = getItemById(armatura.startingWeaponId);
      expect(weapon, `${armatura.id} startingWeaponId`).toBeDefined();
      expect('damageLight' in (weapon as object)).toBe(true);
      for (const id of armatura.startingInventoryIds) {
        expect(getItemById(id), `${armatura.id} inventory ${id}`).toBeDefined();
      }
    }
  });

  test('the retiarius starts with the trident EQUIPPED and the gladius carried', () => {
    const retiarius = getArmatura('retiarius')!;
    expect(retiarius.startingWeaponId).toBe('trident_retarius');
    expect(retiarius.startingInventoryIds).toEqual(['gladius_standard']);
    expect(getItemById('trident_retarius')?.name).toBe('Retiarius Trident');
  });

  test('the dimachaerus starts with two dual_blades-family items', () => {
    const dimachaerus = getArmatura('dimachaerus')!;
    const items = [dimachaerus.startingWeaponId, ...dimachaerus.startingInventoryIds].map((id) => getItemById(id));
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item && 'type' in item ? item.type : undefined).toBe('dual_blades');
    }
  });

  test('every other class starts with exactly its kit primary and no spare', () => {
    for (const armatura of ARMATURAE) {
      if (armatura.id === 'retiarius' || armatura.id === 'dimachaerus') continue;
      expect(armatura.startingInventoryIds, armatura.id).toEqual([]);
    }
  });

  test('every class names its Forge kit', () => {
    for (const armatura of ARMATURAE) {
      expect(armatura.forgeKit).toBe(`kit_${armatura.id}`);
    }
  });
});

// ── §F the palmae as data ─────────────────────────────────────────────────
describe("CH-1 §F — the palmae as data (CH-1's sixteen + D-1's ten)", () => {
  const toSnake = (name: string): string =>
    name
      .toLowerCase()
      // An apostrophe is elided ("Viper's" -> vipers), not turned into a separator.
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

  test('all twenty-six are present, with snake_case ids derived from the names', () => {
    // D-1 — CH-1's sixteen rows plus the ten Feature Bout palms (five drops in the
    // player pool, five carried boss-only).
    expect(PALMAE).toHaveLength(26);
    for (const palma of PALMAE) {
      expect(palma.id, palma.name).toBe(toSnake(palma.name));
      expect(palma.name.length).toBeGreaterThan(2);
      expect(palma.description.length).toBeGreaterThan(10);
      expect(palma.sourceDetail.length).toBeGreaterThan(2);
      expect(palma.hookStages.length).toBeGreaterThan(0);
    }
    expect(new Set(PALMAE.map((palma) => palma.id)).size).toBe(26);
  });

  test('the pool is seventeen and the boss-only set is nine', () => {
    expect(PALMAE_PLAYER_POOL).toHaveLength(17);
    expect(PALMAE_BOSS_ONLY).toHaveLength(9);
    expect(PALMAE_PLAYER_POOL.length + PALMAE_BOSS_ONLY.length).toBe(PALMAE.length);
    expect(PALMAE_BOSS_ONLY.map((palma) => palma.name).sort()).toEqual(
      [
        'Blood-Scent',
        'Colossus Hide',
        'Old Craft',
        'Pit Bellower',
        'Pyre Brand',
        "Survivor's Oath",
        'Two Faces',
        'Vainheart',
        "Viper's Patience",
      ].sort(),
    );
    expect(PALMAE_BOSS_ONLY.every((palma) => palma.bossOnly === true)).toBe(true);
  });

  test('a boss-only row is NEVER in the player pool', () => {
    for (const boss of PALMAE_BOSS_ONLY) {
      expect(PALMAE_PLAYER_POOL).not.toContain(boss);
      expect(PALMAE_PLAYER_POOL.some((palma) => palma.id === boss.id)).toBe(false);
    }
    expect(PALMAE_PLAYER_POOL.some((palma) => palma.bossOnly === true)).toBe(false);
  });

  test('the player pool is the design twelve plus D-1\'s five drops', () => {
    expect(PALMAE_PLAYER_POOL.map((palma) => palma.name)).toEqual([
      'Executioner',
      'Shieldwall Discipline',
      'Untouchable',
      'Colossus Bane',
      'Blood Price',
      'Iron Lungs',
      'Second Wind',
      'Sand Sprinter',
      'Heavy Hand',
      'First Palm of the Crowd',
      'Phoenix Nerves',
      'Golden Laurel',
      // D-1 — the five Feature Bout drops, appended in Part A's order.
      "Hunter's Patience",
      "Ward's Breath",
      'Shieldbreaker',
      'The Open Flank',
      'Undying Name',
    ]);
  });

  test('each effect lands in the shared block shape with the design magnitudes', () => {
    expect(getPalma('executioner')?.effect).toEqual({ damageDealtMult: 1.1 });
    expect(getPalma('shieldwall_discipline')?.effect).toEqual({ blockReductionAdd: 0.06 });
    expect(getPalma('untouchable')?.effect).toEqual({ passiveEvadeAdd: 0.04 });
    expect(getPalma('colossus_bane')?.effect).toEqual({ damageDealtMult: 1.12 });
    expect(getPalma('blood_price')?.effect).toEqual({ damageDealtMult: 1.08 });
    expect(getPalma('iron_lungs')?.effect).toEqual({ staminaMaxAdd: 12, staminaRegenAdd: 2 });
    expect(getPalma('second_wind')?.effect).toEqual({ restStaminaAdd: 15 });
    expect(getPalma('sand_sprinter')?.effect).toEqual({ hitAgiAdd: 1 });
    expect(getPalma('heavy_hand')?.effect).toEqual({ staminaCostMult: 0.9, damageDealtMult: 0.95 });
    expect(getPalma('first_palm_of_the_crowd')?.effect).toEqual({ hypeAdd: 4 });
    expect(getPalma('phoenix_nerves')?.effect).toEqual({ comboShield: true });
    expect(getPalma('golden_laurel')?.effect).toEqual({ goldMult: 1.1, fameMult: 1.1, xpMult: 0.95 });
    expect(getPalma('colossus_hide')?.effect).toEqual({ damageTakenMult: 0.92 });
    expect(getPalma('vipers_patience')?.effect).toEqual({ damageDealtMult: 1.2 });
    // D-1 — the five drops' block data (their CONDITIONS are in `notes`).
    expect(getPalma('hunters_patience')?.effect).toEqual({ damageDealtMult: 1.1 });
    expect(getPalma('wards_breath')?.effect).toEqual({ onBlockStamina: 4 });
    expect(getPalma('shieldbreaker')?.effect).toEqual({ damageDealtMult: 1.12 });
    expect(getPalma('the_open_flank')?.effect).toEqual({ critChanceAdd: 0.2 });
    expect(getPalma('undying_name')?.effect).toEqual({ fameMult: 1.12 });
  });

  test('the effects the block cannot hold are empty blocks with their condition noted', () => {
    // CH-1's two, plus D-1's five CARRIED palms — every one of them conditioned on
    // a mechanic that does not exist yet, so wiring a magnitude would grant it
    // unconditionally.
    for (const id of [
      'pyre_brand',
      'pit_bellower',
      'blood_scent',
      'two_faces',
      'vainheart',
      'survivors_oath',
      'old_craft',
    ]) {
      expect(getPalma(id)?.effect, id).toEqual({});
      expect((getPalma(id)?.notes?.length ?? 0) > 0, id).toBe(true);
    }
  });

  test('every effect merges without throwing and stays inside the block shape', () => {
    const known = new Set([
      'statFlat',
      'healthMaxAdd',
      'staminaMaxAdd',
      'staminaRegenAdd',
      'staminaCostMult',
      'blockReductionAdd',
      'rangeAdd',
      'hitAgiAdd',
      'critChanceAdd',
      'damageDealtMult',
      'damageTakenMult',
      'passiveEvadeAdd',
      'onBlockStamina',
      'hypeAdd',
      'comboShield',
      'restStaminaAdd',
      'goldMult',
      'fameMult',
      'xpMult',
    ]);
    for (const palma of PALMAE) {
      const merged = mergeModifiers([palma.effect]);
      for (const key of Object.keys(merged)) {
        expect(known.has(key), `${palma.id} carries unknown block field ${key}`).toBe(true);
      }
    }
  });

  test('the seventeen player palmae merge into one block without colliding on ids', () => {
    const merged = mergeModifiers(PALMAE_PLAYER_POOL.map((palma) => palma.effect));
    expect(merged.blockReductionAdd).toBe(0.06);
    // CH-1's four damage multipliers, then D-1's two (Hunter's Patience 1.10 and
    // Shieldbreaker 1.12); Undying Name is a reward-stage fame multiplier.
    expect(merged.damageDealtMult).toBeCloseTo(1.1 * 1.12 * 1.08 * 0.95 * 1.1 * 1.12, 10);
    expect(merged.fameMult).toBeCloseTo(1.1 * 1.12, 10);
    expect(merged.critChanceAdd).toBeCloseTo(0.2, 10);
    expect(merged.staminaMaxAdd).toBe(12);
    expect(merged.comboShield).toBe(true);
  });
});

// ── §G a pre-CH-1 save ────────────────────────────────────────────────────
describe('CH-1 §G — a pre-CH-1 save loads and resolves', () => {
  test('the factory writes neither field', () => {
    const profile = preChOneProfile();
    expect(Object.keys(profile)).not.toContain('armatura');
    expect(Object.keys(profile)).not.toContain('palmae');
  });

  test('it loads through the real save path and resolves to Murmillo + empty palmae', () => {
    const logged: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args);
    };
    try {
      localStorage.clear();
      saveProfile(preChOneProfile());
      const loaded = loadSavedProfile();
      expect(loaded).not.toBeNull();
      expect(resolveArmatura(loaded)).toBe('murmillo');
      expect(resolvePalmae(loaded)).toEqual(EMPTY_PALMAE);
    } finally {
      console.error = original;
    }
    expect(logged).toEqual([]);
  });

  test('a model-only profile (no armatura) infers its class on load', () => {
    localStorage.clear();
    saveProfile(withModel('retiarius'));
    const loaded = loadSavedProfile();
    expect(Object.keys(loaded as object)).not.toContain('armatura');
    expect(resolveArmatura(loaded)).toBe('retiarius');
    expect(resolvePalmae(loaded)).toEqual(EMPTY_PALMAE);
  });
});
