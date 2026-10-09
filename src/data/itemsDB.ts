import { WeaponItem, ArmorItem } from '../types/game';

/**
 * ===========================================================================
 * SAND & STEEL — ITEMS DB
 * ===========================================================================
 * The single source of truth for every item a player can acquire in the game:
 * weapons and gladiator armor (helm / chest / arms / legs).
 *
 * Consumed by:
 *   - components/hub/ShopTab.tsx          (Smith & Bazaar buy list)
 *   - components/hub/CharacterCreation.tsx and services/storage.ts (starter kit)
 *   - components/3d/GladiatorPreview.tsx and 3d/city/CityHubScene.tsx (default loadout)
 *   - components/hub/GearTab.tsx          (equip / sell, from the saved profile)
 *
 * Item shapes live in `types/game.ts`. Weapons may reference a real mesh through
 * the optional `modelPath`; armor is still rendered procedurally from its
 * color / trimColor / style fields.
 */

export type GameItem = WeaponItem | ArmorItem;

/**
 * Weapon meshes shipped in `public/models/weapons/`.
 * All five are single static meshes (no armature, no animation clips) and are
 * ~1 unit long along their blade axis, so they scale into the ~1.6-2.6m range
 * band of the weapons below.
 */
export const WEAPON_MODEL_PATHS = {
  gladius: '/models/weapons/gladius.glb',
  spatha: '/models/weapons/spatha.glb',
  dagger: '/models/weapons/dagger.glb',
  dirk: '/models/weapons/dirk.glb',
  shamshir: '/models/weapons/shamshir.glb',
} as const;

/** The weapon every new gladiator starts equipped with. */
export const DEFAULT_PLAYER_WEAPON: WeaponItem = {
  id: 'gladius_standard',
  name: 'Standard Gladius & Scutum',
  type: 'sword_shield',
  rarity: 'common',
  description: 'The iconic Roman short sword and rectangular legionary curved shield.',
  damageLight: 14,
  damageHeavy: 26,
  staminaLight: 12,
  staminaHeavy: 24,
  range: 2.1,
  speed: 0.38,
  blockReduction: 0.82,
  price: 50,
  sellPrice: 20,
  color: '#c59b27',
  metalColor: '#e2e8f0',
  icon: 'ShieldAlert',
  modelPath: WEAPON_MODEL_PATHS.gladius,
  bonusStrength: 0,
  bonusDefense: 2,
};

/**
 * EVERY ACQUIRABLE WEAPON.
 *
 * ORDER IS LOAD-BEARING: index 2 is the spare starter weapon handed to new
 * gladiators (see STARTING_SPARE_WEAPON). Append new weapons at the end.
 */
export const ALL_WEAPONS: WeaponItem[] = [
  DEFAULT_PLAYER_WEAPON,
  {
    id: 'spatha_legion',
    name: 'Imperial Spatha & Buckler',
    type: 'sword_shield',
    rarity: 'uncommon',
    description: 'Longer cavalry blade forged from tempered Iberian steel.',
    damageLight: 19,
    damageHeavy: 35,
    staminaLight: 14,
    staminaHeavy: 28,
    range: 2.4,
    speed: 0.42,
    blockReduction: 0.85,
    price: 180,
    sellPrice: 80,
    color: '#991b1b',
    metalColor: '#cbd5e1',
    icon: 'Shield',
    modelPath: WEAPON_MODEL_PATHS.spatha,
    bonusStrength: 3,
    bonusDefense: 3,
  },
  {
    id: 'hoplite_spear',
    name: 'Dory Hoplite Spear',
    type: 'spear',
    rarity: 'common',
    description: 'Ash-wood shaft tipped with a bronze leaf blade for deadly thrusts.',
    damageLight: 16,
    damageHeavy: 30,
    staminaLight: 11,
    staminaHeavy: 22,
    range: 3.1,
    speed: 0.34,
    blockReduction: 0.45,
    price: 110,
    sellPrice: 45,
    color: '#b45309',
    metalColor: '#d97706',
    icon: 'Zap',
    bonusAgility: 3,
  },
  {
    id: 'trident_retarius',
    name: 'Barbed Retiarius Trident',
    type: 'spear',
    rarity: 'rare',
    description: 'Three-pronged steel trident designed to disarm and impale.',
    damageLight: 24,
    damageHeavy: 44,
    staminaLight: 15,
    staminaHeavy: 30,
    range: 3.3,
    speed: 0.36,
    blockReduction: 0.52,
    price: 360,
    sellPrice: 160,
    color: '#0284c7',
    metalColor: '#38bdf8',
    icon: 'Flame',
    bonusStrength: 4,
    bonusAgility: 4,
  },
  {
    id: 'dual_sicae_daggers',
    name: 'Curved Thracian Sicae',
    type: 'dual_blades',
    rarity: 'uncommon',
    description: 'Twin forward-curved blades engineered to bypass enemy shields.',
    damageLight: 17,
    damageHeavy: 32,
    staminaLight: 9,
    staminaHeavy: 18,
    range: 1.8,
    speed: 0.26,
    blockReduction: 0.40,
    price: 210,
    sellPrice: 90,
    color: '#7c2d12',
    metalColor: '#f59e0b',
    icon: 'Swords',
    bonusAgility: 6,
  },
  {
    id: 'dual_vipers',
    name: 'Twin Desert Vipers',
    type: 'dual_blades',
    rarity: 'legendary',
    description: 'Obsidian-edged blades that strike in lightning flurries.',
    damageLight: 32,
    damageHeavy: 58,
    staminaLight: 12,
    staminaHeavy: 24,
    range: 2.0,
    speed: 0.24,
    blockReduction: 0.48,
    price: 850,
    sellPrice: 400,
    color: '#15803d',
    metalColor: '#4ade80',
    icon: 'Sparkles',
    bonusStrength: 6,
    bonusAgility: 10,
  },
  {
    id: 'bronze_mace',
    name: 'Heavy Flanged War Mace',
    type: 'mace',
    rarity: 'uncommon',
    description: 'Dense bronze head that crushes through helmet armor with ease.',
    damageLight: 22,
    damageHeavy: 42,
    staminaLight: 16,
    staminaHeavy: 32,
    range: 2.2,
    speed: 0.48,
    blockReduction: 0.65,
    price: 230,
    sellPrice: 100,
    color: '#78350f',
    metalColor: '#d97706',
    icon: 'Hammer',
    bonusStrength: 7,
  },
  {
    id: 'titan_colossus_mace',
    name: 'Colossus Titan Skullcrusher',
    type: 'mace',
    rarity: 'legendary',
    description: 'A colossal spiked iron maul that sends shockwaves through the arena sand.',
    damageLight: 38,
    damageHeavy: 72,
    staminaLight: 22,
    staminaHeavy: 44,
    range: 2.6,
    speed: 0.54,
    blockReduction: 0.75,
    price: 920,
    sellPrice: 450,
    color: '#451a03',
    metalColor: '#fbbf24',
    icon: 'Crown',
    bonusStrength: 14,
    bonusDefense: 6,
  },
  {
    id: 'dagger_pugio',
    name: 'Legionary Pugio Dagger',
    type: 'dual_blades',
    rarity: 'common',
    description: 'Short broad-bladed sidearm; blindingly fast in close quarters.',
    damageLight: 11,
    damageHeavy: 20,
    staminaLight: 8,
    staminaHeavy: 16,
    range: 1.6,
    speed: 0.22,
    blockReduction: 0.35,
    price: 90,
    sellPrice: 40,
    color: '#334155',
    metalColor: '#cbd5e1',
    icon: 'Swords',
    modelPath: WEAPON_MODEL_PATHS.dagger,
    bonusAgility: 4,
  },
  {
    id: 'dirk_desert',
    name: 'Desert Dirk',
    type: 'dual_blades',
    rarity: 'uncommon',
    description: 'Slender straight dirk honed for quick, precise thrusts.',
    damageLight: 15,
    damageHeavy: 28,
    staminaLight: 9,
    staminaHeavy: 17,
    range: 1.7,
    speed: 0.24,
    blockReduction: 0.38,
    price: 170,
    sellPrice: 75,
    color: '#0f766e',
    metalColor: '#e2e8f0',
    icon: 'Swords',
    modelPath: WEAPON_MODEL_PATHS.dirk,
    bonusAgility: 5,
    bonusStrength: 1,
  },
  {
    id: 'shamshir_curved',
    name: 'Shamshir Crescent Sabre',
    type: 'sword_shield',
    rarity: 'rare',
    description: 'Deeply curved eastern sabre that slashes through any guard.',
    damageLight: 21,
    damageHeavy: 40,
    staminaLight: 13,
    staminaHeavy: 26,
    range: 2.3,
    speed: 0.36,
    blockReduction: 0.80,
    price: 340,
    sellPrice: 150,
    color: '#78350f',
    metalColor: '#fcd34d',
    icon: 'Sparkles',
    modelPath: WEAPON_MODEL_PATHS.shamshir,
    bonusStrength: 4,
    bonusAgility: 3,
  },
];

/** Spare weapon granted to every new gladiator alongside the default gladius. */
export const STARTING_SPARE_WEAPON: WeaponItem = ALL_WEAPONS[2];

/** EVERY ACQUIRABLE ARMOR PIECE (helm / chest / arms / legs). */
export const ALL_ARMORS: ArmorItem[] = [
  {
    id: 'helm_murmillo',
    slot: 'helm',
    name: 'Bronze Murmillo Helmet',
    rarity: 'common',
    description: 'Crested fish-fin helmet with grated visor.',
    defense: 4,
    staminaRegenBonus: 0,
    healthBonus: 10,
    price: 80,
    sellPrice: 35,
    color: '#b45309',
    trimColor: '#d97706',
    style: 'crested',
    bonusDefense: 2,
  },
  {
    id: 'helm_centurion',
    slot: 'helm',
    name: 'Transverse Centurion Galea',
    rarity: 'rare',
    description: 'Imperial iron galea with a crimson transverse horsehair crest.',
    defense: 8,
    staminaRegenBonus: 1,
    healthBonus: 25,
    price: 320,
    sellPrice: 140,
    color: '#991b1b',
    trimColor: '#fbbf24',
    style: 'crested',
    bonusStrength: 2,
    bonusDefense: 4,
  },
  {
    id: 'chest_lorica_segmentata',
    slot: 'chest',
    name: 'Lorica Segmentata Cuirass',
    rarity: 'uncommon',
    description: 'Overlapping broad iron plates fastened with leather straps.',
    defense: 10,
    staminaRegenBonus: 0,
    healthBonus: 35,
    price: 240,
    sellPrice: 100,
    color: '#475569',
    trimColor: '#cbd5e1',
    style: 'heavy',
    bonusDefense: 5,
  },
  {
    id: 'chest_golden_muscled',
    slot: 'chest',
    name: 'Emperor Imperial Muscled Cuirass',
    rarity: 'legendary',
    description: 'Gilded anatomical bronze cuirass with embossed lion motifs.',
    defense: 18,
    staminaRegenBonus: 2,
    healthBonus: 60,
    price: 900,
    sellPrice: 420,
    color: '#ca8a04',
    trimColor: '#fef08a',
    style: 'heavy',
    bonusStrength: 5,
    bonusDefense: 8,
  },
  {
    id: 'arms_manica',
    slot: 'arms',
    name: 'Segmented Iron Manica',
    rarity: 'common',
    description: 'Protects sword arm with curved metal lames.',
    defense: 3,
    staminaRegenBonus: 0.5,
    price: 70,
    sellPrice: 30,
    color: '#64748b',
    trimColor: '#94a3b8',
    bonusStrength: 1,
  },
  {
    id: 'legs_greaves_bronze',
    slot: 'legs',
    name: 'Polished Bronze Ocrea Greaves',
    rarity: 'uncommon',
    description: 'Shin guards extending from knee to instep.',
    defense: 5,
    staminaRegenBonus: 1,
    price: 130,
    sellPrice: 55,
    color: '#b45309',
    trimColor: '#f59e0b',
    bonusAgility: 2,
  },
];

/** The complete item database: every weapon and every armor piece. */
export const ITEMS_DB: GameItem[] = [...ALL_WEAPONS, ...ALL_ARMORS];

/** Typed views of the database: `weapon` plus one entry per armor slot. */
export const ITEMS_BY_CATEGORY = {
  weapon: ALL_WEAPONS,
  helm: ALL_ARMORS.filter((armor) => armor.slot === 'helm'),
  chest: ALL_ARMORS.filter((armor) => armor.slot === 'chest'),
  arms: ALL_ARMORS.filter((armor) => armor.slot === 'arms'),
  legs: ALL_ARMORS.filter((armor) => armor.slot === 'legs'),
} as const;

export type ItemCategory = keyof typeof ITEMS_BY_CATEGORY;

const ITEMS_BY_ID: ReadonlyMap<string, GameItem> = new Map(
  ITEMS_DB.map((item) => [item.id, item])
);

/** Look up any acquirable item by its stable id. */
export const getItemById = (id: string): GameItem | undefined => ITEMS_BY_ID.get(id);

/** Narrow a database entry to a weapon. */
export const isWeapon = (item: GameItem): item is WeaponItem => 'damageLight' in item;
