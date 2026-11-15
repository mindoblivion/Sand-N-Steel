import type { OpponentConfig } from '../types/game';
import type { BeatLine } from '../utils/storyBeats';

/**
 * Rival Schools — first vertical slice.
 * The public identity is deliberately a configurable placeholder until the
 * rival's final name, school and visual identity are approved.
 */
export const RIVAL_SCHOOL_CONFIG = {
  schoolName: 'Rival Ludus',
  challengeTitle: 'Rival Schools Challenge',
  opponentId: 'rival_school_champion',
} as const;

export const RIVAL_SCHOOL_OPPONENT_ID = RIVAL_SCHOOL_CONFIG.opponentId;

export const RIVAL_SCHOOL_BRIEFING: readonly BeatLine[] = [
  {
    speaker: 'Herald',
    line: 'A champion from a rival ludus has called for your school. This is no ladder rung and no staged exhibition. Win, and your name will be carried beyond these walls; fall, and you may return to answer the challenge.',
  },
];

export const RIVAL_SCHOOL_OPPONENT: OpponentConfig = {
  id: RIVAL_SCHOOL_OPPONENT_ID,
  name: 'The Rival Champion',
  title: 'Champion of the Rival Ludus',
  tier: 1,
  fightIndex: 0,
  difficulty: 'veteran',
  weaponType: 'sword_shield',
  personality: 'Tricky',
  recommendedLevel: 3,
  stats: {
    strength: 13,
    agility: 12,
    staminaMax: 108,
    staminaRegen: 16,
    defense: 5,
    healthMax: 138,
  },
  skinColor: '#a56f55',
  hairColor: '#292524',
  tunicColor: '#4c1d24',
  armorColor: '#9a7b4f',
  aggression: 0.56,
  blockChance: 0.4,
  dodgeChance: 0.24,
  rewardGold: 70,
  rewardFame: 20,
  rewardXp: 90,
  clothingStyle: 'gladiator_sash',
};
