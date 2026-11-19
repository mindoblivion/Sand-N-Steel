import { PlayerProfile, ChariotTeamSize } from '../types/game';
import { canDebitGold } from './goldTransactions';

// BET-1 — the tavern betting system is cut: the Golden Palm Bookmaker, its
// faction odds and its wager settlement are removed, not repaired. The four
// circus factions live on only as race-rival display strings in
// `raceCompetitors.ts`; nothing here prices a wager any more.

export interface LeagueTier {
  id: number;
  name: string;
  horsesRequired: ChariotTeamSize;
  description: string;
  firstPlacePrize: number;
  fameReward: number;
  pointsToAdvance: number;
}

export const LEAGUE_TIERS: LeagueTier[] = [
  {
    id: 1,
    name: 'Provincial Track Circuit',
    horsesRequired: 2, // Biga
    description: 'Local 2-horse Biga trials held across regional arenas.',
    firstPlacePrize: 250,
    fameReward: 20,
    pointsToAdvance: 100,
  },
  {
    id: 2,
    name: 'Circus Metropolis Cup',
    horsesRequired: 3, // Triga
    description: '3-horse Triga championship for acclaimed faction drivers.',
    firstPlacePrize: 600,
    fameReward: 50,
    pointsToAdvance: 250,
  },
  {
    id: 3,
    name: 'Circus Maximus Grand Prix',
    horsesRequired: 4, // Quadra
    description: 'Pinnacle 4-horse Quadra spectacle in Imperial Rome before 150,000 citizens.',
    firstPlacePrize: 1500,
    fameReward: 120,
    pointsToAdvance: 500,
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
 * Advanced Chariot Tuning Model
 * ────────────────────────────────────────────────────────────────────────── */

export interface ChariotTuning {
  reinStrength: number; // 0..5
  axleDurability: number; // 0..5
  wheelSpikes: number; // 0..5
  staminaConditioning: number; // 0..5
}

export const MAX_TUNING_LEVEL = 5;

export const TUNING_COSTS: Record<number, number> = {
  1: 200,
  2: 400,
  3: 750,
  4: 1200,
  5: 2000,
};

export function defaultChariotTuning(): ChariotTuning {
  return {
    reinStrength: 0,
    axleDurability: 0,
    wheelSpikes: 0,
    staminaConditioning: 0,
  };
}

export function resolveChariotTuning(profile: PlayerProfile | null | undefined): ChariotTuning {
  const stored = profile?.racingTuning;
  if (!stored || typeof stored !== 'object') return defaultChariotTuning();
  return {
    reinStrength: Math.min(MAX_TUNING_LEVEL, Math.max(0, stored.reinStrength || 0)),
    axleDurability: Math.min(MAX_TUNING_LEVEL, Math.max(0, stored.axleDurability || 0)),
    wheelSpikes: Math.min(MAX_TUNING_LEVEL, Math.max(0, stored.wheelSpikes || 0)),
    staminaConditioning: Math.min(MAX_TUNING_LEVEL, Math.max(0, stored.staminaConditioning || 0)),
  };
}

export function getTuningUpgradeCost(currentLevel: number): number {
  if (currentLevel >= MAX_TUNING_LEVEL) return 0;
  return TUNING_COSTS[currentLevel + 1] || 1000;
}

export function purchaseTuningUpgrade(
  profile: PlayerProfile | null | undefined,
  stat: keyof ChariotTuning
): { ok: true; profile: PlayerProfile } | { ok: false; reason: string } {
  if (!profile) return { ok: false, reason: 'No profile' };
  const currentTuning = resolveChariotTuning(profile);
  const currentLevel = currentTuning[stat];
  if (currentLevel >= MAX_TUNING_LEVEL) {
    return { ok: false, reason: 'Stat is already at maximum tuning level.' };
  }
  const cost = getTuningUpgradeCost(currentLevel);
  if (!canDebitGold(profile.gold, cost)) {
    return { ok: false, reason: `Not enough gold (${cost} required).` };
  }

  const updatedTuning: ChariotTuning = {
    ...currentTuning,
    [stat]: currentLevel + 1,
  };

  return {
    ok: true,
    profile: {
      ...profile,
      gold: profile.gold - cost,
      racingTuning: updatedTuning,
    },
  };
}
