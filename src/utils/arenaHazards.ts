import { FighterState } from '../types/game';

export type HazardType = 'fire_brazier' | 'spiked_barrier' | 'pit_trap';

export interface ArenaHazard {
  id: string;
  type: HazardType;
  name: string;
  position: [number, number, number];
  radius: number;
  damageMin: number;
  damageMax: number;
  description: string;
}

/**
  Generates standard arena hazards located around the Colosseum floor.
  Positions are aligned with the 14-unit perimeter ring and gate sectors.
 */
export function getStandardArenaHazards(): ArenaHazard[] {
  return [
    {
      id: 'brazier_north',
      type: 'fire_brazier',
      name: 'North Fire Brazier',
      position: [0, 0, -13.5],
      radius: 2.2,
      damageMin: 14,
      damageMax: 24,
      description: 'Roaring braziers of burning pitch.',
    },
    {
      id: 'brazier_south',
      type: 'fire_brazier',
      name: 'South Fire Brazier',
      position: [0, 0, 13.5],
      radius: 2.2,
      damageMin: 14,
      damageMax: 24,
      description: 'Roaring braziers of burning pitch.',
    },
    {
      id: 'spikes_east',
      type: 'spiked_barrier',
      name: 'East Spiked Wall',
      position: [13.5, 0, 0],
      radius: 2.5,
      damageMin: 18,
      damageMax: 28,
      description: 'Iron spikes mounted along the travertine podium wall.',
    },
    {
      id: 'spikes_west',
      type: 'spiked_barrier',
      name: 'West Spiked Wall',
      position: [-13.5, 0, 0],
      radius: 2.5,
      damageMin: 18,
      damageMax: 28,
      description: 'Iron spikes mounted along the travertine podium wall.',
    },
    {
      id: 'pit_center_ne',
      type: 'pit_trap',
      name: 'North-East Arena Grate',
      position: [6.5, 0, -6.5],
      radius: 2.0,
      damageMin: 10,
      damageMax: 18,
      description: 'Sunken iron pit grate with loose sand.',
    },
    {
      id: 'pit_center_sw',
      type: 'pit_trap',
      name: 'South-West Arena Grate',
      position: [-6.5, 0, 6.5],
      radius: 2.0,
      damageMin: 10,
      damageMax: 18,
      description: 'Sunken iron pit grate with loose sand.',
    },
  ];
}

/** Distance calculation on XZ plane. */
export function hazardDistance(
  pos1: [number, number, number],
  pos2: [number, number, number]
): number {
  const dx = pos1[0] - pos2[0];
  const dz = pos1[2] - pos2[2];
  return Math.sqrt(dx * dx + dz * dz);
}

/** Check if a position is within the trigger radius of any active hazard. */
export function findNearbyHazard(
  position: [number, number, number],
  hazards: ArenaHazard[] = getStandardArenaHazards()
): ArenaHazard | null {
  for (const h of hazards) {
    if (hazardDistance(position, h.position) <= h.radius) {
      return h;
    }
  }
  return null;
}

export interface HazardTriggerResult {
  updatedTarget: FighterState;
  damage: number;
  staminaDrain: number;
  logMessage: string;
}

/** Apply damage and status effects when a fighter collides with or is shoved into a hazard. */
export function triggerHazardEffect(
  target: FighterState,
  hazard: ArenaHazard,
  isShoved = false
): HazardTriggerResult {
  const baseDamage =
    Math.floor(Math.random() * (hazard.damageMax - hazard.damageMin + 1)) + hazard.damageMin;
  const isPlayer = target.isPlayer;

  let damage = baseDamage;
  let staminaDrain = 0;
  let logMessage = '';

  if (hazard.type === 'fire_brazier') {
    damage = Math.round(baseDamage * (isShoved ? 1.25 : 1.0));
    const targetName = isPlayer ? target.name : target.title || target.name;
    logMessage = isShoved
      ? `${targetName} was hurled into the ${hazard.name}, taking ${damage} burning fire damage!`
      : `${targetName} stepped too close to the ${hazard.name}, scorching for ${damage} fire damage!`;
  } else if (hazard.type === 'spiked_barrier') {
    damage = Math.round(baseDamage * (isShoved ? 1.3 : 1.0));
    staminaDrain = 15;
    const targetName = isPlayer ? target.name : target.title || target.name;
    logMessage = isShoved
      ? `${targetName} was knocked against the ${hazard.name}, impaled for ${damage} piercing damage!`
      : `${targetName} grazed the ${hazard.name}, taking ${damage} damage and losing ${staminaDrain} stamina!`;
  } else if (hazard.type === 'pit_trap') {
    staminaDrain = 30;
    damage = Math.round(baseDamage * 0.8);
    const targetName = isPlayer ? target.name : target.title || target.name;
    logMessage = `${targetName} stumbled over the ${hazard.name}, losing ${staminaDrain} stamina and taking ${damage} trauma damage!`;
  }

  const updatedHealth = Math.max(1, target.health - damage);
  const updatedStamina = Math.max(0, target.stamina - staminaDrain);

  return {
    updatedTarget: {
      ...target,
      health: updatedHealth,
      stamina: updatedStamina,
    },
    damage,
    staminaDrain,
    logMessage,
  };
}
