/**
 * L5 recovery — authoritative training transaction.
 * Schedule membership, facility-aware cost and stat credit are checked against
 * one profile. Clock advancement remains in App's existing successful-training
 * settlement so DAY/NIGHT and Ludi deed accounting keep their current order.
 */
import { getTrainingAction, type TrainingAction } from '../data/training';
import type { PlayerProfile } from '../types/game';
import { trainingCost } from './facilityProgression';
import { isTrainingActionScheduled } from './trainingSchedule';

export type TrainingRefusal = 'no-profile' | 'unknown-action' | 'not-scheduled' | 'insufficient-gold';
export type TrainingResult =
  | { ok: true; profile: PlayerProfile; action: TrainingAction; cost: number }
  | { ok: false; reason: TrainingRefusal };

export function trainStat(
  profile: PlayerProfile | null | undefined,
  stat: string
): TrainingResult {
  if (!profile) return { ok: false, reason: 'no-profile' };
  const action = getTrainingAction(stat);
  if (!action) return { ok: false, reason: 'unknown-action' };
  if (!isTrainingActionScheduled(profile, action.id)) return { ok: false, reason: 'not-scheduled' };
  const cost = trainingCost(profile);
  if (typeof profile.gold !== 'number' || !Number.isFinite(profile.gold) || profile.gold < cost) {
    return { ok: false, reason: 'insufficient-gold' };
  }
  const current = profile.baseStats[action.id];
  if (typeof current !== 'number' || !Number.isFinite(current)) {
    return { ok: false, reason: 'unknown-action' };
  }
  return {
    ok: true,
    action,
    cost,
    profile: {
      ...profile,
      gold: profile.gold - cost,
      baseStats: { ...profile.baseStats, [action.id]: current + 1 },
    },
  };
}
