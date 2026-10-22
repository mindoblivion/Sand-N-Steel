import { CharacterModelType, FighterState } from '../types/game';

// Minimal FighterState for ambient, static characters.
//
// L17 — EXPORTED: the city's visitors are built by this same factory (one more
// idle fighter at a fixed stall), so the visitor presence adds no second
// character setup. `AMBIENT_CHARACTERS` below is unchanged.
export const createAmbientFighter = (id: string, name: string, model: CharacterModelType, pos: [number, number, number], rotY: number): FighterState => ({
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
    staminaRegen: 0,
    defense: 0,
    healthMax: 1,
  },
  loadout: { weapon: { id: 'none', name: 'None', type: 'sword_shield', rarity: 'common', description: '', damageLight: 0, damageHeavy: 0, staminaLight: 0, staminaHeavy: 0, range: 0, speed: 0, blockReduction: 0, price: 0, sellPrice: 0, color: '#9ca3af', metalColor: '#d1d5db', icon: 'Circle' } },
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
