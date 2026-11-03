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
 *
 * PITCH A4 — CORPUS ET ORIGO extends the same pure path with three cheap axes,
 * every one a Director ruling (`data/corpusEtOrigo.ts`): `buildStatDelta` moves the
 * template BEFORE allocation so the floor becomes template + delta, a chosen vitium
 * raises the pool 10 → 12, and the three choices are written as ONE `identity`
 * field — or not at all, which keeps a no-choice call byte-identical to the pre-A4
 * profile.  Nothing here reads or writes storage, and nothing here knows about React.
 */

import type {
  ArmorItem,
  ArmaturaId,
  BuildId,
  CharacterModelType,
  CorpusEtOrigoIdentity,
  PlayerAppearance,
  PlayerProfile,
  ProvinceId,
  VitiumId,
  WeaponItem,
} from '../types/game';
import { ARMATURAE, DEFAULT_ARMATURA_ID, getArmatura } from '../data/armaturae';
import type { Armatura } from '../data/armaturae';
import {
  DEFAULT_BUILD_ID,
  DEFAULT_PROVINCE_ID,
  VITIUM_CREATION_POINTS,
  getBuild,
  getVitium,
  isBuildId,
  isProvinceId,
  isVitiumId,
} from '../data/corpusEtOrigo';
import { DEFAULT_PLAYER_WEAPON, getItemById, isWeapon } from '../data/itemsDB';
import type { StatFlat } from './traitModifiers';

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

// ── PITCH A4 — CORPUS ET ORIGO ───────────────────────────────────────────────
//
// Three choices, made once at creation and frozen: the Build, the Origo and the
// Vitium (Pitch A4 — Director ruling R-BUILD / R-ORIGO / R-VITIUM).  The screen
// holds them in `CreationCorpus`; `buildCreatedProfile` collapses them into the ONE
// lazy `identity` field the save carries.

/** What the creation screen's three new pickers hold. */
export interface CreationCorpus {
  build: BuildId;
  origo: ProvinceId;
  /** `null` is the "None" card: a valid choice, worth no extra points. */
  vitium: VitiumId | null;
}

/**
 * The pickers' defaults (Pitch A4 — Director ruling R-DEFAULTS): Even + Italia +
 * no flaw.  Every one is changeable before confirming; a profile created through
 * the screen therefore always carries a build and a province, and carries a vitium
 * only when the player takes one.
 */
export const DEFAULT_CORPUS: CreationCorpus = {
  build: DEFAULT_BUILD_ID,
  origo: DEFAULT_PROVINCE_ID,
  vitium: null,
};

/**
 * The creation pool for a given choice: ten points, or twelve when a flaw is
 * taken (Pitch A4 — Director ruling R-VITIUM).  The flaw IS the extra two points
 * — no separate penalty is invented.
 */
export function creationPoints(vitium?: VitiumId | null): number {
  return getVitium(vitium) ? CREATION_POINTS + VITIUM_CREATION_POINTS : CREATION_POINTS;
}

/**
 * The build's `statFlat` delta — applied BEFORE the allocation, so the allocation
 * floor becomes the class template plus this delta (Pitch A4 — Director ruling
 * R-BUILD).  No build, an unknown build or Even is `{}`.
 */
export function buildStatDelta(build?: BuildId | null): StatFlat {
  const preset = getBuild(build);
  return preset ? { ...preset.statDelta } : {};
}

/**
 * The `identity` record for a set of choices, or `null` when nothing was chosen.
 *
 * `null` is what keeps `buildCreatedProfile`'s output byte-identical when no
 * choices are passed — a legacy/factory shape gains NO field (Pitch A4 — Director
 * ruling R-FIELD).  Unknown ids are dropped rather than written.
 */
export function corpusIdentity(input: {
  build?: BuildId | null;
  origo?: ProvinceId | null;
  vitium?: VitiumId | null;
}): CorpusEtOrigoIdentity | null {
  const identity: CorpusEtOrigoIdentity = {};
  if (isBuildId(input.build)) identity.build = input.build;
  if (isProvinceId(input.origo)) identity.origo = input.origo;
  if (isVitiumId(input.vitium)) identity.vitium = input.vitium;
  return Object.keys(identity).length > 0 ? identity : null;
}

/** The points the allocation leaves unspent (what the profile stores). */
export function unspentPoints(allocation: CreationAllocation, vitium?: VitiumId | null): number {
  return creationPoints(vitium) - allocatedPoints(allocation);
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

/**
 * The class template, PLUS the build's delta, plus the points spent on it.
 *
 * The delta lands before the allocation (Pitch A4 — Director ruling R-BUILD), so
 * the per-stat floor `baseStats` is measured against is `template + delta`: a Sturdy
 * gladiator's agility floor is his template − 1, and no allocation point can be
 * spent to go under it.  With no build (or Even) the delta is `{}` and this is
 * exactly the pre-A4 template + allocation.
 */
export function armaturaBaseStats(
  armatura: Armatura,
  allocation: CreationAllocation,
  build?: BuildId | null,
): PlayerProfile['baseStats'] {
  const delta = buildStatDelta(build);
  return {
    strength: armatura.stats.strength + (delta.str ?? 0) + allocation.strength,
    agility: armatura.stats.agility + (delta.agi ?? 0) + allocation.agility,
    stamina: armatura.stats.stamina + (delta.sta ?? 0) + allocation.stamina,
    defense: armatura.stats.defense + (delta.def ?? 0) + allocation.defense,
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
 * the build's delta plus the allocation, and the class field is written because
 * creating a gladiator with a class IS the successful action that sets it.
 * `palmae` is deliberately absent.
 *
 * PITCH A4 — the three Corpus et Origo choices are OPTIONAL here, and they are
 * written as the ONE `identity` field only when at least one is passed (Pitch A4 —
 * Director ruling R-FIELD).  A call with no choices therefore produces exactly the
 * pre-A4 profile: no `identity` key, the ten-point pool and the untouched template.
 * A chosen Vitium raises that profile's pool to twelve.
 */
export function buildCreatedProfile(input: {
  name: string;
  appearance: PlayerAppearance;
  armatura: ArmaturaId;
  allocation: CreationAllocation;
  /** Pitch A4 — the build (absent = no build delta, i.e. Even's effect). */
  build?: BuildId | null;
  /** Pitch A4 — the birth province (absent = no Origo passive). */
  origo?: ProvinceId | null;
  /** Pitch A4 — the chosen flaw, or `null`/absent for "None" (pool stays 10). */
  vitium?: VitiumId | null;
}): PlayerProfile {
  const armatura = getArmatura(input.armatura) ?? ARMATURAE[0];
  const kit = armaturaKit(armatura);
  const identity = corpusIdentity({
    build: input.build,
    origo: input.origo,
    vitium: input.vitium,
  });

  return {
    name: input.name.trim() || 'Spartacus',
    title: 'The Sandborn Rebel',
    rank: 'Rookie',
    appearance: input.appearance,
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    unspentStatPoints: unspentPoints(input.allocation, input.vitium),
    baseStats: armaturaBaseStats(armatura, input.allocation, input.build),
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
    // Pitch A4 — the ONE lazy identity field, present only when a choice was made.
    ...(identity ? { identity } : {}),
  };
}
