/**
 * L5 recovery — deterministic daily Ludus timetable.
 * The seven-phase timeState clock is authoritative; one of the four existing
 * disciplines rests each in-game day. This module owns no price, stat mutation,
 * persistence or clock advancement.
 */
import { TRAINING_ACTIONS, type TrainingAction } from '../data/training';
import type { PlayerProfile } from '../types/game';
import { resolveTimeState } from './timeState';

export const TRAINING_RESTING_PER_DAY = 1;

export interface TrainingSchedule {
  day: number;
  actions: TrainingAction[];
  resting: TrainingAction[];
}

function normalizeDay(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER));
}

function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function scheduleTrainingDay(
  catalogue: readonly TrainingAction[],
  day: number
): TrainingSchedule {
  const resolvedDay = normalizeDay(day);
  const seen = new Set<string>();
  const actions = catalogue.filter((action) => {
    if (seen.has(action.id)) return false;
    seen.add(action.id);
    return true;
  });
  if (actions.length <= TRAINING_RESTING_PER_DAY) {
    return { day: resolvedDay, actions, resting: [] };
  }
  const start = hash32(`sand-and-steel:training-schedule:${resolvedDay}`) % actions.length;
  const restingIds = new Set([actions[start].id]);
  return {
    day: resolvedDay,
    actions: actions.filter((action) => !restingIds.has(action.id)),
    resting: actions.filter((action) => restingIds.has(action.id)),
  };
}

export function resolveTrainingSchedule(profile?: PlayerProfile | null): TrainingSchedule {
  return scheduleTrainingDay(TRAINING_ACTIONS, resolveTimeState(profile).day);
}

export function isTrainingActionScheduled(
  profile: PlayerProfile | null | undefined,
  id: string
): boolean {
  return resolveTrainingSchedule(profile).actions.some((action) => action.id === id);
}
