export type WeaponType = 'sword_shield' | 'spear' | 'dual_blades' | 'mace';

export type ArmorSlot = 'helm' | 'chest' | 'arms' | 'legs';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export type AIPersonality = 'Aggressive' | 'Defensive' | 'Tricky' | 'Berserker';

export type BossMechanic = 'heavy_telegraph' | 'phase_weapon_switch' | 'counter_dodge' | 'rage_mode_colossus';

export type CharacterModelType = 'roman_warrior' | 'procedural_gladiator';

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
}
