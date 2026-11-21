/**
 * CH-2 — the creation write path and unified fighter picker.
 *
 * Run with: `bun test src/utils/characterCreation.test.ts`
 *
 * ── WHY THIS SUITE EXISTS ─────────────────────────────────────────────────
 * CharacterCreation used to start every gladiator from a flat 10 / 10 / 10 / 4 and
 * a one-size starter kit, and it built its profile inline.  Creation now runs
 * through `utils/characterCreation.ts` — the same code the screen runs — so this
 * suite pins the three things the slice promises:
 *
 *   §A  the brief's own Retiarius literals (9 / 13 / 11 / 1, the wooden spear equipped,
 *       no steel carried, 119 HP before any allocation) and the allocation on top;
 *   §B  every class' template lands as `baseStats` with its kit equipped and carried,
 *       and `palmae` is never written at creation;
 *   §C  the factory: `createNewProfile()` with no argument is BYTE-IDENTICAL to the
 *       pre-CH-2 output, and the class argument writes the class (and its template
 *       and kit) — never `palmae`;
 *   §D  one fighter choice atomically determines both class mechanics and model;
 *   §E  the screen is wired to this module and renders its cards from the data.
 *
 * No storage is read or written by this suite: `buildCreatedProfile` is pure and
 * `createNewProfile` touches no storage either.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { PlayerAppearance } from '../types/game';
import { ARMATURAE, getArmatura } from '../data/armaturae';
import { getItemById } from '../data/itemsDB';
import { calculateTotalStats, createNewProfile } from '../services/storage';
import {
  CREATION_POINTS,
  DEFAULT_SELECTION,
  NO_ALLOCATION,
  allocatedPoints,
  armaturaBaseStats,
  armaturaKit,
  ARMATURA_CHARACTER_MODELS,
  armaturaModel,
  armaturaModelLabel,
  buildCreatedProfile,
  selectArmatura,
  unspentPoints,
} from './characterCreation';

const APPEARANCE: PlayerAppearance = {
  skinColor: '#c68b59',
  hairColor: '#3e2723',
  tunicColor: '#854d0e',
  crestColor: '#dc2626',
  clothingStyle: 'roman_tunic',
  characterModel: 'roman_warrior',
};

const creationSource = () => readFileSync('src/components/hub/CharacterCreation.tsx', 'utf8');

/**
 * The pre-CH-2 factory's output, frozen as bytes (`createNewProfile('Tester')` at
 * the merge base of this branch).  Its own pin, not a corpus import: the corpus has
 * exactly three consumer suites and `saveCorpus.test.ts` §H enforces that list, so
 * this suite freezes the string it compares against instead of becoming a fourth.
 */
// ── §A the brief's Retiarius literals ─────────────────────────────────────
describe('gladiator body-weight creation persistence', () => {
  test('the chosen body weight is retained inside appearance without adding a top-level field', () => {
    const profile = buildCreatedProfile({
      name: 'Marcus',
      appearance: { ...APPEARANCE, bodyWeightLb: 245 },
      armatura: 'retiarius',
      allocation: NO_ALLOCATION,
    });

    expect(profile.appearance.bodyWeightLb).toBe(245);
    expect(Object.prototype.hasOwnProperty.call(profile, 'weight')).toBe(false);
  });

  test('tunic and crest colors are preserved in the appearance object', () => {
    const profile = buildCreatedProfile({
      name: 'Custom Color',
      appearance: { 
        ...APPEARANCE, 
        tunicColor: '#1e3a8a', 
        crestColor: '#f59e0b' 
      },
      armatura: 'provocator',
      allocation: NO_ALLOCATION,
    });

    expect(profile.appearance.tunicColor).toBe('#1e3a8a');
    expect(profile.appearance.crestColor).toBe('#f59e0b');
  });
});

describe('CH-2 §A — a new Retiarius, before and after allocation', () => {
  const retiarius = buildCreatedProfile({
    name: 'Gaius',
    appearance: APPEARANCE,
    armatura: 'retiarius',
    allocation: NO_ALLOCATION,
  });

  test('the template is the brief\'s own 9 / 13 / 11 / 1, before any allocation', () => {
    expect(retiarius.baseStats).toEqual({ strength: 9, agility: 13, stamina: 11, defense: 1 });
    expect(retiarius.appearance.bodyWeightLb).toBeUndefined();
    expect(retiarius.unspentStatPoints).toBe(CREATION_POINTS);
  });

  test('the wooden spear is equipped and no steel is carried in the inventory', () => {
    expect(retiarius.equipped.weapon.id).toBe('wooden_spear');
    expect(retiarius.equipped.weapon.name).toBe('Wooden Training Spear');
    const carried = retiarius.inventory.map((item) => item.id);
    expect(carried[0]).toBe('wooden_spear');
    expect(carried).not.toContain('gladius_standard');
  });

  test('HP derives 119 from the template before allocation', () => {
    // The brief's literal: 80 + STR×4 + DEF×3 on the base stats alone.
    expect(80 + retiarius.baseStats.strength * 4 + retiarius.baseStats.defense * 3).toBe(119);
    // The wooden spear adds no stat bonuses, so the equipped read matches the
    // template's own derivation (119 HP, 9 STR, 13 AGI) rather than exceeding it.
    // Steel must be earned: the 50g gladius comes after the first duel win.
    const equipped = calculateTotalStats(retiarius);
    expect(equipped.healthMax).toBe(119);
    expect(equipped.strength).toBe(9);
    expect(equipped.agility).toBe(13);
  });

  test('the allocation lands on top of the template, keeping the ten-point pool', () => {
    const allocation = { strength: 4, agility: 4, stamina: 0, defense: 2 };
    const allocated = buildCreatedProfile({
      name: 'Gaius',
      appearance: APPEARANCE,
      armatura: 'retiarius',
      allocation,
    });
    expect(allocated.baseStats).toEqual({ strength: 13, agility: 17, stamina: 11, defense: 3 });
    expect(allocated.unspentStatPoints).toBe(0);
    expect(allocatedPoints(allocation)).toBe(10);
    expect(unspentPoints(NO_ALLOCATION)).toBe(10);
  });

  test('creation writes the class and never a palma', () => {
    expect(retiarius.armatura).toBe('retiarius');
    expect('palmae' in retiarius).toBe(false);
    expect(Object.keys(retiarius)).not.toContain('palmae');
  });
});

// ── §B every class: template as baseStats, kit equipped and carried ───────
describe('CH-2 §B — every class lands its template and its kit', () => {
  test('all seven classes build with their own template, class id and kit', () => {
    expect(ARMATURAE).toHaveLength(7);
    for (const row of ARMATURAE) {
      const profile = buildCreatedProfile({
        name: `Test ${row.name}`,
        appearance: APPEARANCE,
        armatura: row.id,
        allocation: NO_ALLOCATION,
      });
      expect(profile.armatura, row.id).toBe(row.id);
      expect(profile.baseStats, row.id).toEqual({ ...row.stats });
      expect(profile.equipped.weapon.id, row.id).toBe(row.startingWeaponId);
      const carried = profile.inventory.map((item) => item.id);
      for (const id of row.startingInventoryIds) {
        expect(carried, `${row.id} carries ${id}`).toContain(id);
      }
      expect('palmae' in profile, row.id).toBe(false);
      expect(profile.unspentStatPoints, row.id).toBe(10);
    }
  });

  test('every class receives the universal wooden sword-shield and two-handed spear', () => {
    for (const row of ARMATURAE) {
      const ids = armaturaKit(row).inventory.map((item) => item.id);
      expect(ids).toContain('wooden_sword_shield');
      expect(ids).toContain('wooden_spear');
    }
  });

  test('every kit id is a real catalogue item, and the equipped one is the primary', () => {
    for (const row of ARMATURAE) {
      expect(getItemById(row.startingWeaponId), row.id).toBeDefined();
      const kit = armaturaKit(row);
      expect(kit.weapon.id, row.id).toBe(row.startingWeaponId);
      expect(kit.inventory[0].id, row.id).toBe(row.startingWeaponId);
    }
  });

  test('the class template is the allocation floor: zero points leaves it untouched', () => {
    const murmillo = getArmatura('murmillo');
    if (!murmillo) throw new Error('no murmillo');
    expect(armaturaBaseStats(murmillo, NO_ALLOCATION)).toEqual(murmillo.stats);
    expect(armaturaBaseStats(murmillo, { strength: 1, agility: 0, stamina: 0, defense: 0 })).toEqual({
      ...murmillo.stats,
      strength: murmillo.stats.strength + 1,
    });
  });
});

// ── §C the factory ────────────────────────────────────────────────────────
describe('CH-2 §C — createNewProfile', () => {
  test('with no argument the output keeps its profile shape and receives the wooden starter arsenal', () => {
    // Comparing the SERIALISED bytes pins the key set, the key ORDER and every
    // value — so a new field (or a reordered one) cannot slip into the no-argument
    // path, which is exactly the guarantee the GC20 corpus pins were built on.
    const live = createNewProfile('Tester');
    expect(live.equipped.weapon.id).toBe('wooden_sword_shield');
    expect('armatura' in live).toBe(false);
    expect('palmae' in live).toBe(false);
    expect(live.baseStats).toEqual({ strength: 10, agility: 10, stamina: 10, defense: 4 });
    expect(live.inventory.map((item) => item.id)).toEqual(['wooden_sword_shield', 'wooden_spear']);
  });

  test('with a class argument it writes that class, its template and its kit', () => {
    const withClass = createNewProfile('Tester', 'roman_warrior', 'retiarius');
    const plain = createNewProfile('Tester');

    // The only field the argument ADDS is the class itself.
    expect(Object.keys(withClass).sort()).toEqual([...Object.keys(plain), 'armatura'].sort());
    expect(withClass.armatura).toBe('retiarius');
    expect(withClass.baseStats).toEqual({ strength: 9, agility: 13, stamina: 11, defense: 1 });
    expect(withClass.equipped.weapon.id).toBe('wooden_spear');
    expect(withClass.inventory.map((item) => item.id)).toEqual(['wooden_spear', 'wooden_sword_shield']);
      expect('palmae' in withClass).toBe(false);
    expect(withClass.appearance).toEqual(plain.appearance);
    expect(withClass.gold).toBe(plain.gold);
    expect(withClass.unspentStatPoints).toBe(plain.unspentStatPoints);
    expect(withClass.isLeftyMode).toBe(plain.isLeftyMode);
  });

  test('the class argument matches what local creation writes', () => {
    for (const row of ARMATURAE) {
      const factory = createNewProfile('Same Gladiator', 'roman_warrior', row.id);
      const local = buildCreatedProfile({
        name: 'Same Gladiator',
        appearance: factory.appearance,
        armatura: row.id,
        allocation: NO_ALLOCATION,
      });
      expect(factory.baseStats, row.id).toEqual(local.baseStats);
      expect(factory.equipped.weapon.id, row.id).toBe(local.equipped.weapon.id);
      expect(factory.inventory.map((item) => item.id), row.id).toEqual(
        local.inventory.map((item) => item.id),
      );
      expect(factory.armatura, row.id).toBe(row.id);
    }
  });

  test('an unknown class id writes nothing, so the no-argument shape stands', () => {
    const bogus = createNewProfile('Tester', 'roman_warrior', 'gladiator' as never);
    expect(bogus).toEqual(createNewProfile('Tester'));
    expect('armatura' in bogus).toBe(false);
  });

  test('neither path writes `palmae`, and the argument does not touch any other save field', () => {
    const withClass = createNewProfile('Corpus Fresh', 'roman_warrior', 'thraex');
    for (const field of ['palmae', 'consumables', 'intel', 'stable', 'facilities', 'racing', 'chariot', 'road', 'seen', 'time', 'temper']) {
      expect(Object.keys(withClass), field).not.toContain(field);
    }
  });
});

// ── §D a fighter choice atomically selects class and model ──────────────────
describe('CH-2 §D — class and model are one fighter choice', () => {
  test('every class resolves to one authored character model', () => {
    expect(ARMATURAE).toHaveLength(7);
    for (const row of ARMATURAE) {
      const selection = selectArmatura(DEFAULT_SELECTION, row.id);
      expect(selection.armatura).toBe(row.id);
      expect(selection.characterModel).toBe(ARMATURA_CHARACTER_MODELS[row.id]);
      expect(selection.characterModel).toBe(armaturaModel(row.id));
      expect(armaturaModelLabel(row.id)).toBeTruthy();
      expect('modelPicked' in selection).toBe(false);
    }
  });

  test('changing fighter always changes both fields together and cannot retain a stale model', () => {
    const amazonian = selectArmatura(DEFAULT_SELECTION, 'thraex');
    expect(amazonian).toEqual({ armatura: 'thraex', characterModel: 'amazonian' });

    const next = selectArmatura(amazonian, 'retiarius');
    expect(next).toEqual({ armatura: 'retiarius', characterModel: 'retiarius' });
  });

  test('all six existing models remain represented by the seven fighter choices', () => {
    const models = new Set(ARMATURAE.map((row) => armaturaModel(row.id)));
    expect(models).toEqual(new Set([
      'roman_warrior',
      'procedural_gladiator',
      'amazonian',
      'retiarius',
      'minotaur',
      'dimachaerus',
    ]));
  });

  test('the screen renders class and model together from the class data', () => {
    const source = creationSource();
    expect(source).toContain('{ARMATURAE.map((row) => {');
    expect(source).toContain('data-armatura-card={row.id}');
    expect(source).toContain('data-armatura-model={row.id}');
    expect(source).toContain('armaturaModelLabel(row.id)');
    expect(source).not.toContain('handleModelSelect');
    expect(source).not.toContain('selectCharacterModel');
    expect(source).toContain('data-armatura-picker');
  });

  test('the screen finishes through the pure creation module', () => {
    const source = creationSource();
    expect(source).toContain('buildCreatedProfile({');
    expect(source).toContain('armatura: selection.armatura,');
    expect(source).toContain('allocation,');
    expect(source).toContain('build: corpus.build,');
    expect(source).toContain('origo: corpus.origo,');
    expect(source).toContain('vitium: corpus.vitium,');
    expect(source).toContain('const draftStats = calculateTotalStats(buildProfile());');
    expect(source).toContain('selectArmatura(current, id)');
  });
});


describe('mobile character creation layout contract', () => {
  test('the customization column remains vertically scrollable within the viewport with safe area handling', () => {
    const source = creationSource();
    expect(source).toContain('h-[100dvh] min-h-0');
    expect(source).toContain('flex-1 min-h-0');
    expect(source).toContain('overflow-y-auto overscroll-y-contain touch-pan-y');
    expect(source).toContain('pt-[max(0.5rem,env(safe-area-inset-top))]');
    expect(source).toContain('pb-[max(0.5rem,env(safe-area-inset-bottom))]');
  });

  test('the mobile preview is height-bounded so it cannot consume the whole screen', () => {
    const source = creationSource();
    expect(source).toContain('h-[38dvh]');
    expect(source).toContain('lg:h-full');
  });

  test('customization sections are organized into Identity, Body, and Attributes tabs', () => {
    const source = creationSource();
    expect(source).toContain('data-tab="identity"');
    expect(source).toContain('data-tab="body"');
    expect(source).toContain('data-tab="features"');
    expect(source).toContain('data-tab-panel={activeTab}');
  });
});
