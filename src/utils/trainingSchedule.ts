/**
 * L5 (Living City) — deterministic daily training availability.
 *
 * The authoritative day is resolved from main's existing seven-phase
 * PlayerProfile.time.total clock. This module owns no clock, save field,
 * persistence, timer, random source, price, or stat effect.
 */
import type { PlayerProfile } from '../types/game';
import { TRAINING_ACTIONS, type TrainingAction } from '../data/training';
import { resolveTimeState } from './timeState';

export const TRAINING_RESTING_PER_DAY = 1;

export interface TrainingSchedule {
  day: number;
  actions: TrainingAction[];
  resting: TrainingAction[];
}

function hash32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function uniqueActions(catalogue: readonly TrainingAction[]): TrainingAction[] {
  const seen = new Set<string>();
  const actions: TrainingAction[] = [];
  for (const action of catalogue) {
    if (seen.has(action.id)) continue;
    seen.add(action.id);
    actions.push(action);
  }
  return actions;
}

function normalizeDay(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER));
}

export function scheduleTrainingDay(
  catalogue: readonly TrainingAction[],
  day: number,
): TrainingSchedule {
  const resolvedDay = normalizeDay(day);
  const actions = uniqueActions(catalogue);
  if (actions.length <= TRAINING_RESTING_PER_DAY) {
    return { day: resolvedDay, actions, resting: [] };
  }

  const start = hash32(`sand-and-steel:training-schedule:${resolvedDay}`) % actions.length;
  const restingIds = new Set<string>();
  for (let i = 0; i < TRAINING_RESTING_PER_DAY; i += 1) {
    restingIds.add(actions[(start + i) % actions.length].id);
  }
  return {
    day: resolvedDay,
    actions: actions.filter((action) => !restingIds.has(action.id)),
    resting: actions.filter((action) => restingIds.has(action.id)),
  };
}

export function resolveTrainingSchedule(
  profile?: Pick<PlayerProfile, 'time'> | null,
): TrainingSchedule {
  return scheduleTrainingDay(TRAINING_ACTIONS, resolveTimeState(profile as PlayerProfile | null | undefined).day);
}

export function isTrainingActionScheduled(
  profile: Pick<PlayerProfile, 'time'> | null | undefined,
  id: string,
): boolean {
  return resolveTrainingSchedule(profile).actions.some((action) => action.id === id);
}
