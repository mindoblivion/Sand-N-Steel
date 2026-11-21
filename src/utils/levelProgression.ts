import type { GladiatorRank } from './rank';

export const STAT_POINTS_PER_LEVEL = 2;
export const DEFAULT_XP_TO_NEXT_LEVEL = 100;
export const MAX_LEVEL_STEPS_PER_BOUT = 25;

export interface XpProgressionInput {
  level: number;
  xp: number;
  xpToNextLevel: number;
  unspentStatPoints: number;
  xpEarned: number;
}

export interface XpProgressionResult {
  levelBefore: number;
  levelAfter: number;
  levelsGained: number;
  statPointsGained: number;
  xp: number;
  xpToNextLevel: number;
  unspentStatPoints: number;
}

export interface DuelProgressionSummary {
  levelBefore: number;
  levelAfter: number;
  levelsGained: number;
  statPointsGained: number;
  unspentStatPointsAfter: number;
  tierUnlocked: boolean;
  newTier: number;
  rankBefore: GladiatorRank;
  rankAfter: GladiatorRank;
  rankPromoted: boolean;
}

function nonNegativeInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : fallback;
}

/**
 * Pure level-up resolver for cumulative XP.
 * Crosses all earned thresholds in one pass instead of capping at +1 level per bout,
 * while guarding against malformed thresholds or runaway loops.
 */
export function resolveXpProgression(input: XpProgressionInput): XpProgressionResult {
  const levelBefore = positiveInt(input.level, 1);
  const startXp = nonNegativeInt(input.xp, 0);
  const earned = nonNegativeInt(input.xpEarned, 0);
  const nextXp = startXp + earned;

  let nextLevel = levelBefore;
  let nextXpToNext = positiveInt(input.xpToNextLevel, DEFAULT_XP_TO_NEXT_LEVEL);
  let nextUnspentPoints = nonNegativeInt(input.unspentStatPoints, 0);
  let levelsGained = 0;

  while (nextXp >= nextXpToNext && levelsGained < MAX_LEVEL_STEPS_PER_BOUT) {
    nextLevel += 1;
    levelsGained += 1;
    nextXpToNext = Math.max(nextXpToNext + 1, Math.round(nextXpToNext * 1.5));
    nextUnspentPoints += STAT_POINTS_PER_LEVEL;
  }

  return {
    levelBefore,
    levelAfter: nextLevel,
    levelsGained,
    statPointsGained: levelsGained * STAT_POINTS_PER_LEVEL,
    xp: nextXp,
    xpToNextLevel: nextXpToNext,
    unspentStatPoints: nextUnspentPoints,
  };
}
