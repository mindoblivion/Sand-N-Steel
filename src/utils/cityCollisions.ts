export type CityDistrictType = 'CENTER' | 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | string;

export interface InteractiveLocation {
  id: string;
  name: string;
  subtitle: string;
  position: [number, number, number];
  radius: number;
  icon: string;
  tabKey?: 'tournament' | 'training' | 'shop' | 'gear' | 'stats' | null;
  actionPrompt: string;
  color: string;
  district: CityDistrictType;
}

export const HUB_LOCATIONS: InteractiveLocation[] = [
  {
    id: 'town_gate',
    name: 'Monumental Ishtar Town Gate',
    subtitle: 'City Entrance & Desert Highway',
    position: [0, 0, 24],
    radius: 4.5,
    icon: 'DoorOpen',
    tabKey: 'stats',
    actionPrompt: 'Inspect City Gate',
    color: '#0284c7',
    district: 'SOUTH',
  },
  {
    id: 'colosseum',
    name: 'The Grand Colosseum',
    subtitle: 'Enter Tournament Arena',
    position: [0, 0, -20],
    radius: 5.5,
    icon: 'Swords',
    tabKey: 'tournament',
    actionPrompt: 'Enter Arena Duels',
    color: '#dc2626',
    district: 'NORTH',
  },
  {
    id: 'training_yard',
    name: 'Ludus Martial Yard',
    subtitle: 'Attribute Conditioning',
    position: [-18, 0, 0],
    radius: 4.5,
    icon: 'Dumbbell',
    tabKey: 'training',
    actionPrompt: 'Train Gladiator Stats',
    color: '#ea580c',
    district: 'WEST',
  },
  {
    id: 'smithing_forge',
    name: 'Imperial Smithing Forge',
    subtitle: 'Armory & Weaponsmith',
    position: [18, 0, 2],
    radius: 4.5,
    icon: 'Hammer',
    tabKey: 'shop',
    actionPrompt: 'Buy Weapons & Armor',
    color: '#ca8a04',
    district: 'EAST',
  },
  {
    id: 'general_store',
    name: 'Bazaar & General Store',
    subtitle: 'Potions & Trade Wares',
    position: [16, 0, -14],
    radius: 4.5,
    icon: 'ShoppingCart',
    tabKey: 'shop',
    actionPrompt: 'Visit Bazaar Merchant',
    color: '#16a34a',
    district: 'EAST',
  },
  {
    id: 'tavern',
    name: 'The Golden Palm Tavern',
    subtitle: 'Rumors & Gambling',
    position: [-16, 0, 14],
    radius: 4.5,
    icon: 'Beer',
    tabKey: 'stats',
    actionPrompt: 'Gather Intel & Rest',
    color: '#9333ea',
    district: 'SOUTH',
  },
  {
    id: 'caravanserai',
    name: 'Caravanserai Inn',
    subtitle: 'Rest & Quarters',
    position: [16, 0, 14],
    radius: 4.5,
    icon: 'Home',
    tabKey: 'gear',
    actionPrompt: 'Equip Loadout',
    color: '#0891b2',
    district: 'EAST',
  },
  {
    id: 'merchant_house',
    name: 'Elite Merchant House',
    subtitle: 'Prestigious Trade Taberna',
    position: [26, 0, -12],
    radius: 4.5,
    icon: 'ShoppingCart',
    tabKey: 'shop',
    actionPrompt: 'Inspect High-Tier Wares',
    color: '#10b981',
    district: 'EAST',
  },
  {
    id: 'armor_workshop',
    name: 'Armor & Leather Workshop',
    subtitle: 'Tannery & Shieldsmith',
    position: [27, 0, 1],
    radius: 4.5,
    icon: 'Shield',
    tabKey: 'gear',
    actionPrompt: 'Forge Armor & Accessories',
    color: '#f59e0b',
    district: 'EAST',
  },
  {
    id: 'stable',
    name: 'Imperial Horse Stable',
    subtitle: 'Mounts & Caravans',
    position: [26, 0, 15],
    radius: 4.5,
    icon: 'Compass',
    actionPrompt: 'Visit Stables',
    color: '#10b981',
    district: 'EAST',
  },
  {
    id: 'gladiator_academy',
    name: 'Gladiator Ludus Academy',
    subtitle: 'Advanced Gladiator Training',
    position: [30.5, 0, -27],
    radius: 4.5,
    icon: 'Dumbbell',
    tabKey: 'training',
    actionPrompt: 'Enter Ludus Academy',
    color: '#dc2626',
    district: 'NORTH',
  },
  {
    id: 'doctore_house',
    name: 'Doctore Tactical House',
    subtitle: 'Consult Chief Combat Instructor',
    position: [28, 0, -17],
    radius: 4.5,
    icon: 'Compass',
    actionPrompt: 'Consult Doctore',
    color: '#ea580c',
    district: 'NORTH',
  },
  {
    id: 'records_house',
    name: 'Records & Lore Library',
    subtitle: 'Ancient Parchments & Achievements',
    position: [20.5, 0, -28],
    radius: 4.5,
    icon: 'BookOpen',
    tabKey: 'stats',
    actionPrompt: 'Read Ancient Scrolls',
    color: '#9333ea',
    district: 'NORTH',
  },
  {
    id: 'bathhouse',
    name: 'Imperial Public Bathhouse',
    subtitle: 'Thermae & Recuperation Pools',
    position: [-26, 0, 25],
    radius: 4.5,
    icon: 'Home',
    tabKey: 'stats',
    actionPrompt: 'Rest in Bathhouse Thermae',
    color: '#0ea5e9',
    district: 'SOUTH',
  },
  {
    id: 'shrine_temple',
    name: 'Shrine of Fortuna',
    subtitle: 'Altar of Luck & Providence',
    position: [-27, 0, 11],
    radius: 4.5,
    icon: 'Compass',
    actionPrompt: 'Offer Alms to Fortuna',
    color: '#a855f7',
    district: 'SOUTH',
  },
  {
    id: 'bounty_hall',
    name: 'Bounty & Mercenary Hall',
    subtitle: 'Contracts & Combat Notices',
    position: [-15, 0, 26],
    radius: 4.5,
    icon: 'Swords',
    tabKey: 'tournament',
    actionPrompt: 'Consult Mercenary Board',
    color: '#f43f5e',
    district: 'SOUTH',
  },
  {
    id: 'gladiator_barracks',
    name: 'Gladiator Barracks',
    subtitle: "Recruits' Quarters",
    position: [-27, 0, -14],
    radius: 4.5,
    icon: 'Home',
    actionPrompt: 'Visit Gladiator Barracks',
    color: '#10b981',
    district: 'WEST',
  },
  {
    id: 'veteran_gladiator_hall',
    name: 'Veteran Gladiator Hall',
    subtitle: "Fighters' Clubhouse",
    position: [-16, 0, -16],
    radius: 4.5,
    icon: 'Trophy',
    actionPrompt: 'Enter Veteran Gladiator Hall',
    color: '#ca8a04',
    district: 'WEST',
  },
  {
    id: 'arena_medical_house',
    name: 'Arena Medical House',
    subtitle: 'Roman Infirmary',
    position: [-29, 0, -5],
    radius: 4.5,
    icon: 'Shield',
    actionPrompt: 'Visit Arena Medical House',
    color: '#dc2626',
    district: 'WEST',
  },
];

export function resolveCityMovement(
  currentPos: [number, number, number],
  dx: number,
  dz: number,
  speed: number,
  delta: number
): [number, number, number] {
  let newX = currentPos[0] + dx * speed * delta;
  let newZ = currentPos[2] + dz * speed * delta;

  // City outer boundaries expanded for multi-district growth
  newX = Math.max(-35, Math.min(35, newX));
  newZ = Math.max(-35, Math.min(35, newZ));

  return [newX, currentPos[1], newZ];
}

export function getNearbyHubLocation(
  pos: [number, number, number]
): InteractiveLocation | null {
  for (const loc of HUB_LOCATIONS) {
    const distSq =
      Math.pow(pos[0] - loc.position[0], 2) + Math.pow(pos[2] - loc.position[2], 2);
    if (distSq <= loc.radius * loc.radius) {
      return loc;
    }
  }
  return null;
}
