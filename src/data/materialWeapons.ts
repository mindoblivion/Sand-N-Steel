import type { WeaponItem } from '../types/game';

/**
 * The authored material progression for the three requested weapon families.
 * Sword + shield is one combat loadout with two independently rendered meshes;
 * spear is a two-handed combat family and intentionally has no shield asset.
 */
export const MATERIAL_WEAPON_MODEL_PATHS = {
  woodenSword: '/models/weapons/wooden_sword.glb',
  woodenShield: '/models/weapons/wooden_shield.glb',
  bronzeSword: '/models/weapons/bronze_sword.glb',
  bronzeShield: '/models/weapons/bronze_shield.glb',
  bronzeSpear: '/models/weapons/bronze_spear.glb',
  ironSword: '/models/weapons/iron_sword.glb',
  ironShield: '/models/weapons/iron_shield.glb',
  ironSpear: '/models/weapons/iron_spear.glb',
  steelSword: '/models/weapons/steel_sword.glb',
  steelShield: '/models/weapons/steel_shield.glb',
  steelSpear: '/models/weapons/steel_spear.glb',
} as const;

const swordShield = (
  id: string,
  material: 'Bronze' | 'Iron' | 'Steel',
  modelPath: string,
  shieldModelPath: string,
  damageLight: number,
  damageHeavy: number,
  staminaLight: number,
  staminaHeavy: number,
  range: number,
  speed: number,
  blockReduction: number,
  price: number,
  rarity: WeaponItem['rarity'],
  bonusDefense: number,
): WeaponItem => ({
  id,
  name: `${material} Sword & Shield`,
  type: 'sword_shield',
  rarity,
  description: `A matched ${material.toLowerCase()} sword and shield set, balanced for arena combat.`,
  damageLight,
  damageHeavy,
  staminaLight,
  staminaHeavy,
  range,
  speed,
  blockReduction,
  price,
  sellPrice: Math.round(price * 0.44 / 5) * 5,
  color: material === 'Bronze' ? '#92400e' : material === 'Iron' ? '#475569' : '#334155',
  metalColor: material === 'Bronze' ? '#cd7f32' : material === 'Iron' ? '#9ca3af' : '#e2e8f0',
  icon: 'Shield',
  modelPath,
  shieldModelPath,
  bonusDefense,
});

const spear = (
  id: string,
  material: 'Bronze' | 'Iron' | 'Steel',
  modelPath: string,
  damageLight: number,
  damageHeavy: number,
  staminaLight: number,
  staminaHeavy: number,
  range: number,
  speed: number,
  price: number,
  rarity: WeaponItem['rarity'],
  bonusStrength: number,
): WeaponItem => ({
  id,
  name: `${material} Two-Handed Spear`,
  type: 'spear',
  rarity,
  description: `A long-shafted ${material.toLowerCase()}-headed spear made for two-handed thrusts and reach control.`,
  damageLight,
  damageHeavy,
  staminaLight,
  staminaHeavy,
  range,
  speed,
  blockReduction: 0.45,
  price,
  sellPrice: Math.round(price * 0.44 / 5) * 5,
  color: material === 'Bronze' ? '#92400e' : material === 'Iron' ? '#475569' : '#334155',
  metalColor: material === 'Bronze' ? '#cd7f32' : material === 'Iron' ? '#9ca3af' : '#e2e8f0',
  icon: 'Swords',
  modelPath,
  bonusStrength,
});

export const MATERIAL_WEAPONS: WeaponItem[] = [
  swordShield('bronze_sword_shield', 'Bronze', MATERIAL_WEAPON_MODEL_PATHS.bronzeSword, MATERIAL_WEAPON_MODEL_PATHS.bronzeShield, 15, 28, 11, 22, 2.1, 0.37, 0.72, 130, 'common', 1),
  spear('bronze_two_handed_spear', 'Bronze', MATERIAL_WEAPON_MODEL_PATHS.bronzeSpear, 17, 31, 11, 22, 3.2, 0.35, 145, 'common', 1),
  swordShield('iron_sword_shield', 'Iron', MATERIAL_WEAPON_MODEL_PATHS.ironSword, MATERIAL_WEAPON_MODEL_PATHS.ironShield, 19, 35, 12, 24, 2.2, 0.38, 0.78, 285, 'uncommon', 2),
  spear('iron_two_handed_spear', 'Iron', MATERIAL_WEAPON_MODEL_PATHS.ironSpear, 21, 38, 12, 24, 3.45, 0.36, 310, 'uncommon', 2),
  swordShield('steel_sword_shield', 'Steel', MATERIAL_WEAPON_MODEL_PATHS.steelSword, MATERIAL_WEAPON_MODEL_PATHS.steelShield, 23, 42, 13, 26, 2.25, 0.39, 0.82, 520, 'rare', 3),
  spear('steel_two_handed_spear', 'Steel', MATERIAL_WEAPON_MODEL_PATHS.steelSpear, 25, 46, 13, 26, 3.7, 0.37, 560, 'rare', 3),
];
