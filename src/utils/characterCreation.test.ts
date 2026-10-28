/**
 * CH-2 — the creation write path and the class/look pickers.
 *
 * Run with: `bun test src/utils/characterCreation.test.ts`
 *
 * ── WHY THIS SUITE EXISTS ─────────────────────────────────────────────────
 * CharacterCreation used to start every gladiator from a flat 10 / 10 / 10 / 4 and
 * a one-size starter kit, and it built its profile inline.  Creation now runs
 * through `utils/characterCreation.ts` — the same code the screen runs — so this
 * suite pins the three things the slice promises:
 *
 *   §A  the brief's own Retiarius literals (9 / 13 / 11 / 1, the trident equipped,
 *       the gladius carried, 119 HP before any allocation) and the allocation on top;
 *   §B  every class' template lands as `baseStats` with its kit equipped and carried,
 *       and `palmae` is never written at creation;
 *   §C  the factory: `createNewProfile()` with no argument is BYTE-IDENTICAL to the
 *       pre-CH-2 output, and the class argument writes the class (and its template
 *       and kit) — never `palmae`;
 *   §D  the two pickers are independent: a model never changes the class, and a
 *       class only *suggests* a model while the player has not chosen one;
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
  armaturaModelSuggestion,
  buildCreatedProfile,
  selectArmatura,
  selectCharacterModel,
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
const PRE_CH2_FACTORY_JSON =
  '{"name":"Tester","title":"The Sandborn Rebel","rank":"Rookie","appearance":{"skinColor":"#c68b59","hairColor":"#3e2723","tunicColor":"#854d0e","crestColor":"#dc2626","clothingStyle":"roman_tunic","characterModel":"roman_warrior"},"level":1,"xp":0,"xpToNextLevel":100,"unspentStatPoints":10,"baseStats":{"strength":10,"agility":10,"stamina":10,"defense":4},"gold":100,"fame":0,"currentTier":1,"tierProgress":{"1":0,"2":0,"3":0,"4":0},"defeatedOpponentIds":[],"bossKills":0,"newGamePlus":0,"trainingSessionsLeft":2,"injury":null,"equipped":{"weapon":{"id":"gladius_standard","name":"Standard Gladius & Scutum","type":"sword_shield","rarity":"common","description":"The iconic Roman short sword and rectangular legionary curved shield.","damageLight":14,"damageHeavy":26,"staminaLight":12,"staminaHeavy":24,"range":2.1,"speed":0.38,"blockReduction":0.82,"price":50,"sellPrice":20,"color":"#c59b27","metalColor":"#e2e8f0","icon":"ShieldAlert","modelPath":"/models/weapons/gladius.glb","bonusStrength":0,"bonusDefense":2}},"inventory":[{"id":"gladius_standard","name":"Standard Gladius & Scutum","type":"sword_shield","rarity":"common","description":"The iconic Roman short sword and rectangular legionary curved shield.","damageLight":14,"damageHeavy":26,"staminaLight":12,"staminaHeavy":24,"range":2.1,"speed":0.38,"blockReduction":0.82,"price":50,"sellPrice":20,"color":"#c59b27","metalColor":"#e2e8f0","icon":"ShieldAlert","modelPath":"/models/weapons/gladius.glb","bonusStrength":0,"bonusDefense":2},{"id":"hoplite_spear","name":"Dory Hoplite Spear","type":"spear","rarity":"common","description":"Ash-wood shaft tipped with a bronze leaf blade for deadly thrusts.","damageLight":16,"damageHeavy":30,"staminaLight":11,"staminaHeavy":22,"range":3.1,"speed":0.34,"blockReduction":0.45,"price":110,"sellPrice":45,"color":"#b45309","metalColor":"#d97706","icon":"Zap","bonusAgility":3}],"fightsWon":0,"fightsLost":0,"peakCrowdHypeOverall":0,"isLeftyMode":false}';

// ── §A the brief's Retiarius literals ─────────────────────────────────────
describe('CH-2 §A — a new Retiarius, before and after allocation', () => {
  const retiarius = buildCreatedProfile({
    name: 'Gaius',
    appearance: APPEARANCE,
    armatura: 'retiarius',
    allocation: NO_ALLOCATION,
  });

  test('the template is the brief\'s own 9 / 13 / 11 / 1, before any allocation', () => {
    expect(retiarius.baseStats).toEqual({ strength: 9, agility: 13, stamina: 11, defense: 1 });
    expect(retiarius.unspentStatPoints).toBe(CREATION_POINTS);
  });

  test('the trident is equipped and the gladius is carried in the inventory', () => {
    expect(retiarius.equipped.weapon.id).toBe('trident_retarius');
    expect(retiarius.equipped.weapon.name).toBe('Retiarius Trident');
    const carried = retiarius.inventory.map((item) => item.id);
    expect(carried[0]).toBe('trident_retarius');
    expect(carried).toContain('gladius_standard');
  });

  test('HP derives 119 from the template before allocation', () => {
    // The brief's literal: 80 + STR×4 + DEF×3 on the base stats alone.
    expect(80 + retiarius.baseStats.strength * 4 + retiarius.baseStats.defense * 3).toBe(119);
    // The equipped read adds the trident's own +4 STR, which is why the Stats tab
    // and the duel show 135 rather than 119.  Both numbers are honest; the 119 is
    // the class template's own derivation and is the one this slice pins.
    const equipped = calculateTotalStats(retiarius);
    expect(equipped.healthMax).toBe(135);
    expect(equipped.strength).toBe(13);
    expect(equipped.agility).toBe(17);
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

  test('the retiarius and dimachaerus kits are the two with a carried extra', () => {
    const extras = (id: 'retiarius' | 'dimachaerus') => {
      const row = getArmatura(id);
      if (!row) throw new Error(`no class ${id}`);
      const kit = armaturaKit(row);
      return kit.inventory.slice(1).map((item) => item.id);
    };
    expect(extras('retiarius')).toEqual(['gladius_standard']);
    expect(extras('dimachaerus')).toEqual(['dagger_pugio']);
    for (const row of ARMATURAE) {
      if (row.id === 'retiarius' || row.id === 'dimachaerus') continue;
      expect(armaturaKit(row).inventory).toHaveLength(1);
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
  test('with no argument the output is byte-identical to the pre-CH-2 factory', () => {
    // Comparing the SERIALISED bytes pins the key set, the key ORDER and every
    // value — so a new field (or a reordered one) cannot slip into the no-argument
    // path, which is exactly the guarantee the GC20 corpus pins were built on.
    const live = createNewProfile('Tester');
    expect(JSON.stringify(live)).toBe(PRE_CH2_FACTORY_JSON);
    expect('armatura' in live).toBe(false);
    expect('palmae' in live).toBe(false);
    expect(live.baseStats).toEqual({ strength: 10, agility: 10, stamina: 10, defense: 4 });
    expect(live.inventory.map((item) => item.id)).toEqual(['gladius_standard', 'hoplite_spear']);
  });

  test('with a class argument it writes that class, its template and its kit', () => {
    const withClass = createNewProfile('Tester', 'roman_warrior', 'retiarius');
    const plain = createNewProfile('Tester');

    // The only field the argument ADDS is the class itself.
    expect(Object.keys(withClass).sort()).toEqual([...Object.keys(plain), 'armatura'].sort());
    expect(withClass.armatura).toBe('retiarius');
    expect(withClass.baseStats).toEqual({ strength: 9, agility: 13, stamina: 11, defense: 1 });
    expect(withClass.equipped.weapon.id).toBe('trident_retarius');
    expect(withClass.inventory.map((item) => item.id)).toEqual([
      'trident_retarius',
      'gladius_standard',
    ]);
    expect('palmae' in withClass).toBe(false);

    // Everything the argument does not touch is exactly the factory's own value.
    expect(withClass.name).toBe(plain.name);
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

// ── §D class and look are independent ─────────────────────────────────────
describe('CH-2 §D — the class picker and the model picker are independent', () => {
  test('choosing a class never overrides a look the player has chosen', () => {
    let selection = selectCharacterModel(DEFAULT_SELECTION, 'amazonian');
    selection = selectArmatura(selection, 'retiarius');
    expect(selection.armatura).toBe('retiarius');
    expect(selection.characterModel).toBe('amazonian');

    selection = selectArmatura(selection, 'dimachaerus');
    expect(selection.armatura).toBe('dimachaerus');
    expect(selection.characterModel).toBe('amazonian');
    expect(selection.modelPicked).toBe(true);
  });

  test('choosing a model never changes the class', () => {
    let selection = selectArmatura(DEFAULT_SELECTION, 'secutor');
    const before = selection.armatura;
    selection = selectCharacterModel(selection, 'minotaur');
    expect(selection.armatura).toBe(before);
    expect(selection.characterModel).toBe('minotaur');
  });

  test('a class only suggests its natural model, and only before a choice', () => {
    expect(armaturaModelSuggestion('retiarius')).toBe('retiarius');
    expect(armaturaModelSuggestion('dimachaerus')).toBe('dimachaerus');
    for (const row of ARMATURAE) {
      if (row.id === 'retiarius' || row.id === 'dimachaerus') continue;
      expect(armaturaModelSuggestion(row.id), row.id).toBeNull();
    }

    const suggested = selectArmatura(DEFAULT_SELECTION, 'retiarius');
    expect(suggested.characterModel).toBe('retiarius');
    expect(suggested.modelPicked).toBe(false);

    const unsuggested = selectArmatura(suggested, 'murmillo');
    expect(unsuggested.characterModel).toBe('retiarius');
  });

  test('the screen itself renders its cards from the data, not from copies', () => {
    const source = creationSource();
    expect(source).toContain("import { ARMATURAE } from '../../data/armaturae';");
    expect(source).toContain('{ARMATURAE.map((row) => {');
    expect(source).toContain('data-armatura-card={row.id}');
    expect(source).toContain('data-armatura-picker');
    expect(source).toContain('min-h-[48px]');
    expect(source).toContain('row.doctrina.name');
    expect(source).toContain('row.stats.strength');
    // The seven class names are never typed into the screen.
    for (const name of ['Murmillo', 'Secutor', 'Thraex', 'Hoplomachus', 'Dimachaerus', 'Provocateur']) {
      expect(source, name).not.toContain(`'${name}'`);
    }
  });

  test('the screen finishes through the pure creation module', () => {
    const source = creationSource();
    // PITCH A4 REBASE: the call is written across lines now that it carries the
    // three Corpus et Origo choices; the property — the screen finishes through the
    // pure creation module — is unchanged.
    expect(source).toContain('buildCreatedProfile({');
    expect(source).toContain('armatura: selection.armatura,');
    expect(source).toContain('allocation,');
    expect(source).toContain('build: corpus.build,');
    expect(source).toContain('origo: corpus.origo,');
    expect(source).toContain('vitium: corpus.vitium,');
    expect(source).toContain('const draftStats = calculateTotalStats(buildProfile());');
    expect(source).toContain("disabled={stat.val <= statFloor}");
    expect(source).toContain('selectArmatura(current, id)');
    expect(source).toContain('selectCharacterModel(current, model)');
  });
});
