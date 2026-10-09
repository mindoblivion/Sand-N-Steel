import { FighterState } from '../types/game';

// Minimal FighterState for ambient, static characters
const createAmbientFighter = (id: string, name: string, model: string, pos: [number, number, number], rotY: number): FighterState => ({
  id,
  name,
  title: 'Ambient',
  isPlayer: false,
  position: pos,
  rotationY: rotY,
  health: 1,
  stamina: 1,
  action: 'idle',
  actionTimer: 0,
  isBlocking: false,
  isInvulnerable: true,
  hitFlashTimer: 0,
  stats: {
    strength: 1,
    agility: 1,
    staminaMax: 1,
    healthMax: 1,
    initiative: 1,
    armorRating: 0,
    meleeAttack: 0,
    rangedAttack: 0,
    dodgeChance: 0,
    blockChance: 0,
    critChance: 0,
  },
  loadout: { weapon: { id: 'none', name: 'None', type: 'sword_shield', damageLight: 0, damageHeavy: 0, critChance: 0, critMultiplier: 1, range: 0, price: 0, description: '' } },
  comboCount: 0,
  skinColor: '#d2b48c',
  hairColor: '#4b3621',
  tunicColor: '#8b4513',
  characterModel: model,
});

export const AMBIENT_CHARACTERS: FighterState[] = [
  createAmbientFighter('forge_smith', 'Smith', 'roman_warrior', [5, 0, 5], 0),
  createAmbientFighter('tavern_patron', 'Patron', 'roman_warrior', [-5, 0, -5], Math.PI),
  createAmbientFighter('gate_guard', 'Guard', 'roman_warrior', [0, 0, 10], 0),
  createAmbientFighter('colosseum_guard_1', 'Guard', 'roman_warrior', [10, 0, 10], Math.PI/2),
  createAmbientFighter('colosseum_gladiator_1', 'Gladiator', 'roman_warrior', [10, 0, 12], Math.PI/2),
  createAmbientFighter('academy_instructor', 'Instructor', 'roman_warrior', [-10, 0, -10], -Math.PI/2),
  createAmbientFighter('market_merchant', 'Merchant', 'roman_warrior', [5, 0, -5], Math.PI/4),
  createAmbientFighter('ludus_gladiator_1', 'Trainee', 'roman_warrior', [-5, 0, 5], Math.PI/4),
  createAmbientFighter('ludus_gladiator_2', 'Trainee', 'roman_warrior', [-7, 0, 5], -Math.PI/4),
];
