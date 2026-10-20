export type WeaponType = 'sword_shield' | 'spear' | 'dual_blades' | 'mace';

export type ArmorSlot = 'helm' | 'chest' | 'arms' | 'legs';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export type AIPersonality = 'Aggressive' | 'Defensive' | 'Tricky' | 'Berserker';

export type BossMechanic = 'heavy_telegraph' | 'phase_weapon_switch' | 'counter_dodge' | 'rage_mode_colossus';

export type CharacterModelType = 'roman_warrior' | 'procedural_gladiator' | 'amazonian' | 'retiarius' | 'minotaur' | 'dimachaerus';

export interface WeaponItem {
  id: string;
  name: string;
  type: WeaponType;
  rarity: ItemRarity;
  description: string;
  damageLight: number;
  damageHeavy: number;
  staminaLight: number;
  staminaHeavy: number;
  range: number;
  speed: number;
  blockReduction: number;
  price: number;
  sellPrice: number;
  color: string;
  metalColor: string;
  icon: string;
  /** Optional real mesh asset for this weapon (see data/itemsDB.ts). */
  modelPath?: string;
  bonusStrength?: number;
  bonusAgility?: number;
  bonusStamina?: number;
  bonusDefense?: number;
}

export interface ArmorItem {
  id: string;
  slot: ArmorSlot;
  name: string;
  rarity: ItemRarity;
  description: string;
  defense: number;
  staminaRegenBonus: number;
  healthBonus?: number;
  price: number;
  sellPrice: number;
  color: string;
  trimColor: string;
  style?: string;
  bonusStrength?: number;
  bonusAgility?: number;
  bonusDefense?: number;
  bonusStamina?: number;
}

export interface FighterStats {
  strength: number;
  agility: number;
  stamina?: number;
  staminaMax: number;
  staminaRegen: number;
  defense: number;
  healthMax: number;
}

export interface FighterLoadout {
  weapon: WeaponItem;
  helm?: ArmorItem;
  chest?: ArmorItem;
  arms?: ArmorItem;
  legs?: ArmorItem;
}

export type FighterAction = 
  | 'idle' 
  | 'walk' 
  | 'attack_light' 
  | 'attack_heavy' 
  | 'block' 
  | 'dodge' 
  | 'hit' 
  | 'death';

export type ClothingStyle = 'gladiator_sash' | 'roman_tunic' | 'centurion_harness' | 'champion_mantle';

export interface FighterState {
  id: string;
  name: string;
  title: string;
  isPlayer: boolean;
  position: [number, number, number];
  rotationY: number;
  health: number;
  stamina: number;
  action: FighterAction;
  actionTimer: number;
  isBlocking: boolean;
  isInvulnerable: boolean;
  hitFlashTimer: number;
  stats: FighterStats;
  loadout: FighterLoadout;
  comboCount: number;
  skinColor: string;
  hairColor: string;
  tunicColor: string;
  crestColor?: string;
  sashColor?: string;
  clothTrimColor?: string;
  clothingStyle?: ClothingStyle;
  characterModel?: CharacterModelType;
  meshScale?: number;
  isRaged?: boolean;
  telegraphTimer?: number;
  telegraphText?: string;
  isPhase2?: boolean;
  isLeftyMode?: boolean;
}

export interface DamageNumber {
  id: string;
  text: string;
  type: 'damage' | 'crit' | 'blocked' | 'dodge' | 'hype';
  position: [number, number, number];
  createdAt: number;
}

export interface ArenaParticle {
  id: string;
  position: [number, number, number];
  velocity: [number, number, number];
  color: string;
  scale: number;
  life: number;
  maxLife: number;
  type: 'spark' | 'dust' | 'flower' | 'coin';
}

export interface OpponentConfig {
  id: string;
  name: string;
  title: string;
  tier: number;
  fightIndex: number;
  isBoss?: boolean;
  difficulty: 'rookie' | 'veteran' | 'champion';
  weaponType: WeaponType;
  personality: AIPersonality;
  recommendedLevel: number;
  stats: FighterStats;
  skinColor: string;
  hairColor: string;
  tunicColor: string;
  armorColor: string;
  aggression: number;
  blockChance: number;
  dodgeChance: number;
  rewardGold: number;
  rewardFame: number;
  rewardXp: number;
  meshScale?: number;
  characterModel?: CharacterModelType;
  bossMechanic?: BossMechanic;
  phase2WeaponType?: WeaponType;
  guaranteedDrop?: WeaponItem | ArmorItem;
  loadout?: FighterLoadout;
  clothingStyle?: ClothingStyle;
  sashColor?: string;
  clothTrimColor?: string;
}

export interface DuelStatistics {
  damageDealt: number;
  damageTaken: number;
  hitsLanded: number;
  perfectBlocks: number;
  dodgesPerformed: number;
  maxCombo: number;
  crowdHypePeak: number;
  durationSeconds: number;
  goldEarned: number;
  fameEarned: number;
  xpEarned: number;
  wagerEarned?: number;
  lootDrop?: WeaponItem | ArmorItem | null;
}

export interface TournamentTierInfo {
  tier: number;
  name: string;
  subtitle: string;
  description: string;
  minLevel: number;
}

export interface ArenaTheme {
  sandColor: string;
  sandRimColor: string;
  stoneColor: string;
  wallColor: string;
  bannerColors: [string, string];
  skyAmbient: string;
  sunLightColor: string;
  sunLightIntensity: number;
  rimLightColor: string;
  crowdCount: number;
}

export interface PlayerAppearance {
  skinColor: string;
  hairColor: string;
  tunicColor: string;
  crestColor: string;
  clothingStyle?: ClothingStyle;
  sashColor?: string;
  clothTrimColor?: string;
  characterModel?: CharacterModelType;
}

export interface PlayerInjury {
  fightsRemaining: number;
  penaltyStrength: number;
  penaltyAgility: number;
}

/** Phase C-8.66B — the two chariot slots the Chariot Workshop sells parts for. */
export type ChariotSlot = 'wheels' | 'finish';

/**
 * Phase C-8.66B — the player's chariot ownership and fit-out, stored on the
 * gladiator save alongside gold and inventory.
 *
 * Optional on `PlayerProfile` on purpose: a save written before this phase has
 * no `chariot` field at all and must keep loading, so the workshop resolves a
 * missing or partial loadout to the stock chariot rather than repairing it.
 */
export interface ChariotLoadout {
  /** Owned chariot part ids.  The two stock parts are always owned. */
  owned: string[];
  /** The equipped part id per slot. */
  equipped: { wheels: string; finish: string };
}

/**
 * Phase C-8.67B — the three historical horse-team configurations:
 * Biga (2), Triga (3), Quadra (4).
 */
export type ChariotTeamSize = 2 | 3 | 4;

/**
 * Phase C-8.67B — racing progression, stored on the gladiator save alongside
 * gold, inventory and the chariot loadout.
 *
 * Optional on `PlayerProfile` on purpose, exactly like `chariot`: a save written
 * before this phase has no `racing` field at all and must keep loading, so the
 * pure helpers in `src/utils/racingProgression.ts` resolve a missing, partial or
 * malformed field to "Biga selected, Triga and Quadra locked" rather than
 * repairing the save.  Every field is optional for the same reason — a save may
 * carry only one of them and still be valid.
 */
export interface RacingProgression {
  /**
   * The team sizes the player has bought: only 3 (Triga) and/or 4 (Quadra).
   * Biga (2) is never stored — it is unlocked for every profile by definition.
   */
  unlocked?: number[];
  /** The team size the player races with.  2 | 3 | 4; anything else resolves to Biga. */
  selected?: number;
}

/**
 * Progression Slice 1 — the Road of Glory's own field: the oath, the banner device
 * the gladiator swore under, and the milestones the road has shown them.
 *
 * Optional on `PlayerProfile` on purpose, exactly like `chariot` and `racing`: every
 * save written before this slice has no `road` field at all and must keep loading,
 * so `resolveRoadProgress` (`src/utils/roadOfGlory.ts`) resolves a missing, partial
 * or malformed field to unsworn / no device / none seen rather than repairing it.
 * Every subfield is optional for the same reason.  Nothing in this slice writes it:
 * it has no writer until the oath slice lands, and `createNewProfile()` still writes
 * no `road` field.
 */
export interface RoadProgress {
  /** The oath at the Ludus gate has been sworn. */
  oathSworn?: boolean;
  /** The banner device sworn under, as the player chose it. */
  bannerDevice?: string;
  /** Ids of the road milestones the player has been shown. */
  milestonesSeen?: string[];
}

export interface PlayerProfile {
  name: string;
  title: string;
  rank: 'Rookie' | 'Veteran' | 'Champion' | 'Legend';
  appearance: PlayerAppearance;
  level: number;
  xp: number;
  xpToNextLevel: number;
  unspentStatPoints: number;
  baseStats: {
    strength: number;
    agility: number;
    stamina: number;
    defense: number;
  };
  gold: number;
  fame: number;
  currentTier: number;
  tierProgress: Record<number, number>;
  defeatedOpponentIds: string[];
  bossKills: number;
  newGamePlus: number;
  trainingSessionsLeft: number;
  injury?: PlayerInjury | null;
  equipped: {
    weapon: WeaponItem;
    helm?: ArmorItem;
    chest?: ArmorItem;
    arms?: ArmorItem;
    legs?: ArmorItem;
  };
  inventory: (WeaponItem | ArmorItem)[];
  fightsWon: number;
  fightsLost: number;
  peakCrowdHypeOverall: number;
  isLeftyMode?: boolean;
  /** Phase C-8.66B — chariot ownership/fit-out; absent on every pre-workshop save. */
  chariot?: ChariotLoadout;
  /**
   * Phase C-8.67B — Biga/Triga/Quadra progression; absent on every pre-racing
   * save, and written only by a successful purchase or selection (never by a
   * migration, and never by `createNewProfile()`).
   */
  racing?: RacingProgression;
  /**
   * Progression Slice 1 — the Road of Glory's own field; absent on every save that
   * predates the Road, and written by nothing in this slice (the road is derived
   * from progress, not stored).  See `RoadProgress` above.
   */
  road?: RoadProgress;
}
