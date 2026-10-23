/**
 * CH-2 — the creation write path, as one pure function, plus the two reducers the
 * picker runs on.
 *
 * CharacterCreation used to build its own profile object inline and start every
 * gladiator from a flat 10 / 10 / 10 / 4 with a one-size starter kit.  It now
 * builds the profile through this module, so the screen and the tests drive the
 * SAME code: a class is chosen, its stat template is the allocation floor, and the
 * ten creation points are spent on top of it.
 *
 * Nothing here reads or writes storage, and nothing here knows about React.
 *
 *   • `armaturaKit` — the class's kit from `data/armaturae.ts`: the primary weapon
 *     is equipped and carried (the shipped starter shape has always listed the
 *     equipped gladius in `inventory` too), then the kit's extra weapons.
 *   • `buildCreatedProfile` — the profile `onComplete` receives.  `baseStats` is
 *     the template plus the spent points, the class field is written (`armatura`),
 *     and `palmae` is NOT: a palm is earned in the arena, never at creation.
 *   • `selectArmatura` / `selectCharacterModel` — the look and the class are
 *     independent.  The class only *suggests* its natural model (retiarius,
 *     dimachaerus) while the player has not picked one, and picking a model never
 *     touches the class.
 */

import type {
  ArmorItem,
  ArmaturaId,
  CharacterModelType,
  PlayerAppearance,
  PlayerProfile,
  WeaponItem,
} from '../types/game';
import { ARMATURAE, DEFAULT_ARMATURA_ID, getArmatura } from '../data/armaturae';
import type { Armatura } from '../data/armaturae';
import { DEFAULT_PLAYER_WEAPON, getItemById, isWeapon } from '../data/itemsDB';

/** The ten points every new gladiator spends in the allocation screen. */
export const CREATION_POINTS = 10;

/** The creation points spent per attribute — never the absolute value. */
export interface CreationAllocation {
  strength: number;
  agility: number;
  stamina: number;
  defense: number;
}

export type AllocationStat = keyof CreationAllocation;

/** Nothing spent yet: every attribute sits on its class template. */
export const NO_ALLOCATION: CreationAllocation = {
  strength: 0,
  agility: 0,
  stamina: 0,
  defense: 0,
};

/** How many of the ten points the allocation spends. */
export function allocatedPoints(allocation: CreationAllocation): number {
  return allocation.strength + allocation.agility + allocation.stamina + allocation.defense;
}

/** The points the allocation leaves unspent (what the profile stores). */
export function unspentPoints(allocation: CreationAllocation): number {
  return CREATION_POINTS - allocatedPoints(allocation);
}

/**
 * The model a class naturally suggests.  Only two classes ARE a model in this
 * build; the rest suggest nothing, and a suggestion is never applied once the
 * player has chosen a look.
 */
export function armaturaModelSuggestion(armatura: ArmaturaId): CharacterModelType | null {
  return armatura === 'retiarius' || armatura === 'dimachaerus' ? armatura : null;
}

/**
 * The class's kit as items: the primary weapon (equipped) first, then the kit's
 * carried extras.  Ids are verified against `itemsDB` by the suite, so a renamed
 * item fails a test; if one ever goes missing the shipped gladius stands in rather
 * than leaving the profile without a weapon.
 */
export function armaturaKit(armatura: Armatura): {
  weapon: WeaponItem;
  inventory: (WeaponItem | ArmorItem)[];
} {
  const primary = getItemById(armatura.startingWeaponId);
  const weapon = primary && isWeapon(primary) ? primary : DEFAULT_PLAYER_WEAPON;
  const extras = armatura.startingInventoryIds
    .map((id) => getItemById(id))
    .filter((item): item is WeaponItem | ArmorItem => item !== undefined);
  return { weapon, inventory: [weapon, ...extras] };
}

/** The class template plus the points spent on it. */
export function armaturaBaseStats(
  armatura: Armatura,
  allocation: CreationAllocation,
): PlayerProfile['baseStats'] {
  return {
    strength: armatura.stats.strength + allocation.strength,
    agility: armatura.stats.agility + allocation.agility,
    stamina: armatura.stats.stamina + allocation.stamina,
    defense: armatura.stats.defense + allocation.defense,
  };
}

/**
 * What the creation screen's two pickers hold.  `modelPicked` records that the
 * player chose a look themselves, which is what stops a class from re-suggesting
 * one — the class never overrides a choice.
 */
export interface CreationSelection {
  armatura: ArmaturaId;
  characterModel: CharacterModelType;
  modelPicked: boolean;
}

export const DEFAULT_SELECTION: CreationSelection = {
  armatura: DEFAULT_ARMATURA_ID,
  characterModel: 'roman_warrior',
  modelPicked: false,
};

/** Choosing a class.  The look moves only to a suggestion, and only if unpicked. */
export function selectArmatura(
  selection: CreationSelection,
  armatura: ArmaturaId,
): CreationSelection {
  const suggestion = armaturaModelSuggestion(armatura);
  return {
    armatura,
    characterModel:
      selection.modelPicked || suggestion === null ? selection.characterModel : suggestion,
    modelPicked: selection.modelPicked,
  };
}

/** Choosing a look.  It never touches the class. */
export function selectCharacterModel(
  selection: CreationSelection,
  characterModel: CharacterModelType,
): CreationSelection {
  return { ...selection, characterModel, modelPicked: true };
}

/**
 * The profile a finished creation hands to `onComplete`.
 *
 * `appearance` is the screen's own object, `baseStats` is the class template plus
 * the allocation, and the class field is written because creating a gladiator with
 * a class IS the successful action that sets it.  `palmae` is deliberately absent.
 */
export function buildCreatedProfile(input: {
  name: string;
  appearance: PlayerAppearance;
  armatura: ArmaturaId;
  allocation: CreationAllocation;
}): PlayerProfile {
  const armatura = getArmatura(input.armatura) ?? ARMATURAE[0];
  const kit = armaturaKit(armatura);

  return {
    name: input.name.trim() || 'Spartacus',
    title: 'The Sandborn Rebel',
    rank: 'Rookie',
    appearance: input.appearance,
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    unspentStatPoints: unspentPoints(input.allocation),
    baseStats: armaturaBaseStats(armatura, input.allocation),
    gold: 100,
    fame: 0,
    currentTier: 1,
    tierProgress: { 1: 0, 2: 0, 3: 0, 4: 0 },
    defeatedOpponentIds: [],
    bossKills: 0,
    newGamePlus: 0,
    trainingSessionsLeft: 2,
    injury: null,
    equipped: {
      weapon: kit.weapon,
    },
    inventory: kit.inventory,
    fightsWon: 0,
    fightsLost: 0,
    peakCrowdHypeOverall: 0,
    isLeftyMode: false,
    armatura: armatura.id,
  };
}
