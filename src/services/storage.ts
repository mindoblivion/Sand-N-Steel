import { PlayerProfile, FighterStats, ArmaturaId } from '../types/game';
import { DEFAULT_PLAYER_WEAPON, STARTING_SPARE_WEAPON, WOODEN_SWORD_SHIELD } from '../data/itemsDB';
import { getArmatura } from '../data/armaturae';
import { armaturaKit } from '../utils/characterCreation';
import {
  resolveTemperLevel,
  getEffectiveWeaponStats,
  getEffectiveArmorStats,
} from '../utils/tempering';
import { buildPlayerModifiers } from '../utils/combatModifiers';

/**
 * The one local-save key.  Exported so the two things that remove it — `Reset save`
 * here in storage, and the account-deletion flow's device wipe
 * (`services/accountDeletion.ts`) — cannot drift apart.
 */
export const PROFILE_STORAGE_KEY = 'sand_and_steel_gladiator_save_v2';

/**
 * Where a save that cannot be read is kept, verbatim.
 *
 * `loadSavedProfile()` never deletes the main key: when the bytes there cannot be
 * parsed, or do not carry the fields the game runs on, the *original string* is
 * copied here untouched and the game starts as if no save existed.  This is the only
 * storage key the save-safety pass adds.
 */
export const PROFILE_QUARANTINE_KEY = 'sand_and_steel_gladiator_save_v2_quarantine';

export function calculateTotalStats(profile: PlayerProfile): FighterStats {
  const base = profile.baseStats;
  let str = base.strength;
  let agi = base.agility;
  let sta = base.stamina;
  let def = base.defense;

  // Add equipment bonuses
  const { weapon, helm, chest, arms, legs } = profile.equipped;
  if (weapon) {
    // P1 — a tempered weapon contributes its effective bonuses; the item
    // object itself is never modified (level 0 is the base item exactly).
    const effective = getEffectiveWeaponStats(
      weapon,
      resolveTemperLevel(profile, weapon.id)
    );
    str += effective.bonusStrength || 0;
    agi += effective.bonusAgility || 0;
    sta += effective.bonusStamina || 0;
    def += effective.bonusDefense || 0;
  }
  let regenBonus = 0;
  [helm, chest, arms, legs].forEach((armor) => {
    if (armor) {
      // P1 — same seam for armour: defense and its listed bonuses are read
      // at the piece's own temper level.
      const effective = getEffectiveArmorStats(
        armor,
        resolveTemperLevel(profile, armor.id)
      );
      str += effective.bonusStrength || 0;
      agi += effective.bonusAgility || 0;
      sta += effective.bonusStamina || 0;
      def += effective.defense || 0;
      def += effective.bonusDefense || 0;
      regenBonus += effective.staminaRegenBonus || 0;
    }
  });

  // CH-3a — the equipped palmae's stat-stage block (design §2.4), folded after
  // the equipment bonuses and before the injury penalty. `buildPlayerModifiers`
  // builds the SAME merged block the duel resolves with, so the hub's readout and
  // the arena cannot disagree. With no palmae equipped every term below is the
  // identity — and no CH-1 doctrina carries a stat-stage field — so the output is
  // bit-identical to pre-CH-3a.
  const traitBlock = buildPlayerModifiers(profile).block;
  const statFlat = traitBlock.statFlat;
  if (statFlat) {
    str += statFlat.str ?? 0;
    agi += statFlat.agi ?? 0;
    sta += statFlat.sta ?? 0;
    def += statFlat.def ?? 0;
  }

  // Apply injury penalty if any
  if (profile.injury && profile.injury.fightsRemaining > 0) {
    str = Math.max(1, str - profile.injury.penaltyStrength);
    agi = Math.max(1, agi - profile.injury.penaltyAgility);
  }

  const healthMax = 80 + str * 4 + def * 3 + (traitBlock.healthMaxAdd ?? 0);
  const staminaMax = 70 + sta * 5 + (traitBlock.staminaMaxAdd ?? 0);
  const staminaRegen =
    12 + agi * 0.8 + sta * 0.4 + regenBonus + (traitBlock.staminaRegenAdd ?? 0);

  return {
    strength: str,
    agility: agi,
    stamina: sta,
    staminaMax,
    staminaRegen,
    defense: def,
    healthMax,
  };
}

/**
 * The profile factory.
 *
 * CH-2 — `armatura` is optional and defaults to `undefined`.  With NO argument the
 * output is byte-identical to the pre-CH-2 factory: no `armatura` key, the flat
 * 10 / 10 / 10 / 4 stats and the one-size starter kit exactly as before, so the
 * GC20 corpus pins are untouched.  With a class argument the profile carries that
 * class, its stat template and its kit — the same shape local creation writes, so a
 * cloud-created gladiator is not a classless one.  Either way `palmae` is never
 * written: a palm is earned in the arena.
 */
export function createNewProfile(
  name: string,
  characterModel = 'roman_warrior' as const,
  armatura?: ArmaturaId,
): PlayerProfile {
  const profile: PlayerProfile = {
    name: name.trim() || 'Spartacus',
    title: 'The Sandborn Rebel',
    rank: 'Rookie',
    appearance: {
      skinColor: '#c68b59',
      hairColor: '#3e2723',
      tunicColor: '#854d0e',
      crestColor: '#dc2626',
      clothingStyle: 'roman_tunic',
      characterModel: characterModel,
    },
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    unspentStatPoints: 10,
    baseStats: {
      strength: 10,
      agility: 10,
      stamina: 10,
      defense: 4,
    },
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
      weapon: WOODEN_SWORD_SHIELD,
    },
    inventory: [WOODEN_SWORD_SHIELD, STARTING_SPARE_WEAPON], // includes spear
    fightsWon: 0,
    fightsLost: 0,
    peakCrowdHypeOverall: 0,
    // Shape alignment: `CharacterCreation`'s finish path writes this too, so both
    // profile factories produce the same key set. App reads lefty from settings.
    isLeftyMode: false,
  };

  if (armatura === undefined) return profile;

  const row = getArmatura(armatura);
  // An unknown id writes nothing, so the no-argument shape stays the fallback.
  if (!row) return profile;

  const kit = armaturaKit(row);
  return {
    ...profile,
    baseStats: { ...row.stats },
    equipped: { weapon: kit.weapon },
    inventory: kit.inventory,
    armatura: row.id,
  };
}

/* ---------------------------------------------------------------------------
 * Save-safety: shape validation and quarantine
 * ------------------------------------------------------------------------- */

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isStatBlock = (value: unknown): value is Record<string, unknown> =>
  isPlainObject(value) && ['strength', 'agility', 'stamina', 'defense'].every((key) => isFiniteNumber(value[key]));

const isEquipment = (value: unknown): value is Record<string, unknown> =>
  isPlainObject(value) && isPlainObject(value.weapon);

/**
 * The fields a stored profile must carry for the game to run — every
 * **non-optional** member of `PlayerProfile`, at its own type.
 *
 * This is a shape check and deliberately nothing more: a save that satisfies it is
 * handed back exactly as it was parsed (no field added, removed, reordered or
 * repaired), and anything nested inside `appearance` / `tierProgress` / a weapon is
 * the game's business rather than this check's.  `injury`, `isLeftyMode`, `chariot`
 * and `racing` are optional on the type and stay optional here, so every save that
 * was written before those fields existed still loads.
 */
const REQUIRED_PROFILE_FIELDS: ReadonlyArray<readonly [string, (value: unknown) => boolean]> = [
  ['name', isString],
  ['title', isString],
  ['rank', isString],
  ['appearance', isPlainObject],
  ['level', isFiniteNumber],
  ['xp', isFiniteNumber],
  ['xpToNextLevel', isFiniteNumber],
  ['unspentStatPoints', isFiniteNumber],
  ['baseStats', isStatBlock],
  ['gold', isFiniteNumber],
  ['fame', isFiniteNumber],
  ['currentTier', isFiniteNumber],
  ['tierProgress', isPlainObject],
  ['defeatedOpponentIds', (value: unknown) => Array.isArray(value)],
  ['bossKills', isFiniteNumber],
  ['newGamePlus', isFiniteNumber],
  ['trainingSessionsLeft', isFiniteNumber],
  ['equipped', isEquipment],
  ['inventory', (value: unknown) => Array.isArray(value)],
  ['fightsWon', isFiniteNumber],
  ['fightsLost', isFiniteNumber],
  ['peakCrowdHypeOverall', isFiniteNumber],
];

/** True when `value` carries every field the game cannot run without. */
export function isValidStoredProfile(value: unknown): value is PlayerProfile {
  return (
    isPlainObject(value) &&
    REQUIRED_PROFILE_FIELDS.every(([field, check]) => check((value as Record<string, unknown>)[field]))
  );
}

/**
 * Set when THIS boot had to quarantine a stored save.  A module flag rather than a
 * second storage record: it is boot state, not player data, and it is what the title
 * screen reads to say so in plain language.
 */
let storedSaveQuarantined = false;

/** Did `loadSavedProfile()` quarantine a stored save this boot? */
export function wasStoredSaveQuarantined(): boolean {
  return storedSaveQuarantined;
}

/**
 * Keep an unreadable save's ORIGINAL bytes, verbatim, under the quarantine key.
 *
 * The main key is never touched — not emptied, not rewritten — so the player's bytes
 * survive here and in place.  The key holds the most recent unreadable save.
 */
function quarantineStoredProfile(raw: string, reason: string): void {
  try {
    localStorage.setItem(PROFILE_QUARANTINE_KEY, raw);
  } catch (e) {
    console.error('Failed to quarantine profile:', e);
  }
  storedSaveQuarantined = true;
  console.warn(`Stored gladiator save could not be read (${reason}). The original data was kept under "${PROFILE_QUARANTINE_KEY}"; starting as if no save existed.`);
}

/**
 * A short, tolerant read of whatever gladiator is stored — what a "start over" would
 * erase.  `null` means nothing is stored; the identity fields are `null` when the
 * bytes cannot be read as a profile at all, which is still a stored save.
 */
export interface StoredProfileSummary {
  name: string | null;
  fame: number | null;
  rank: string | null;
}

export function readStoredProfileSummary(): StoredProfileSummary | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PROFILE_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (isPlainObject(parsed)) {
      const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
      const rank = typeof parsed.rank === 'string' ? parsed.rank.trim() : '';
      return {
        name: name || null,
        fame: isFiniteNumber(parsed.fame) ? parsed.fame : null,
        rank: rank || null,
      };
    }
  } catch {
    // Unreadable bytes still mean a save is stored — the caller must still confirm.
  }
  return { name: null, fame: null, rank: null };
}

/**
 * Load the stored gladiator.
 *
 * A valid save is returned **exactly as parsed**.  A save that is not valid JSON, or
 * that is missing a field the game runs on, is quarantined (see
 * `quarantineStoredProfile`), reported once through `wasStoredSaveQuarantined()`, and
 * answered with `null` — so the game takes the same path it takes for a missing save.
 */
export function loadSavedProfile(): PlayerProfile | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PROFILE_STORAGE_KEY);
  } catch (e) {
    console.error('Failed to load profile:', e);
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load profile:', e);
    quarantineStoredProfile(raw, 'not valid JSON');
    return null;
  }

  if (!isValidStoredProfile(parsed)) {
    console.error('Stored profile is missing fields the game needs:', parsed);
    quarantineStoredProfile(raw, 'missing a required field or a field has the wrong type');
    return null;
  }

  return parsed;
}

export function saveProfile(profile: PlayerProfile): void {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.error('Failed to save profile:', e);
  }
}

export function clearSavedProfile(): void {
  try {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear profile:', e);
  }
}

const LEFTY_MODE_KEY = 'sand_and_steel_lefty_mode';

export function getLeftyMode(): boolean {
  try {
    return localStorage.getItem(LEFTY_MODE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setLeftyMode(isLefty: boolean): void {
  try {
    localStorage.setItem(LEFTY_MODE_KEY, String(isLefty));
  } catch {
    // Silent fallback
  }
}

