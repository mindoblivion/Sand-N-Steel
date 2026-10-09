import { PlayerProfile, FighterStats } from '../types/game';
import { DEFAULT_PLAYER_WEAPON, ALL_WEAPONS } from '../data/weapons';

const PROFILE_STORAGE_KEY = 'sand_and_steel_gladiator_save_v2';

export function calculateTotalStats(profile: PlayerProfile): FighterStats {
  const base = profile.baseStats;
  let str = base.strength;
  let agi = base.agility;
  let sta = base.stamina;
  let def = base.defense;

  // Add equipment bonuses
  const { weapon, helm, chest, arms, legs } = profile.equipped;
  if (weapon) {
    str += weapon.bonusStrength || 0;
    agi += weapon.bonusAgility || 0;
    sta += weapon.bonusStamina || 0;
    def += weapon.bonusDefense || 0;
  }
  [helm, chest, arms, legs].forEach((armor) => {
    if (armor) {
      str += armor.bonusStrength || 0;
      agi += armor.bonusAgility || 0;
      sta += armor.bonusStamina || 0;
      def += armor.defense || 0;
    }
  });

  // Apply injury penalty if any
  if (profile.injury && profile.injury.fightsRemaining > 0) {
    str = Math.max(1, str - profile.injury.penaltyStrength);
    agi = Math.max(1, agi - profile.injury.penaltyAgility);
  }

  const healthMax = 80 + str * 4 + def * 3;
  const staminaMax = 70 + sta * 5;
  const staminaRegen = 12 + agi * 0.8 + sta * 0.4;

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

export function createNewProfile(name: string, characterModel = 'roman_warrior' as const): PlayerProfile {
  return {
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
      weapon: DEFAULT_PLAYER_WEAPON,
    },
    inventory: [DEFAULT_PLAYER_WEAPON, ALL_WEAPONS[2]], // includes spear
    fightsWon: 0,
    fightsLost: 0,
    peakCrowdHypeOverall: 0,
  };
}

export function loadSavedProfile(): PlayerProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load profile:', e);
    return null;
  }
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

