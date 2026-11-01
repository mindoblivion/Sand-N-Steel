// L5 — deterministic daily training timetable.
import { describe, test, expect } from 'bun:test';
import { TRAINING_ACTIONS } from '../data/training';
import { resolveTrainingSchedule, scheduleTrainingDay } from './trainingSchedule';

describe('L5 — training schedule', () => {
  test('exactly one of four drills rests and the rest are still available', () => {
    const result = scheduleTrainingDay(TRAINING_ACTIONS, 1);
    expect(result.actions).toHaveLength(3);
    expect(result.resting).toHaveLength(1);
    expect([...result.actions, ...result.resting].map((x) => x.id).sort())
      .toEqual(TRAINING_ACTIONS.map((x) => x.id).sort());
  });
  test('same day is deterministic and a later day may rotate the resting drill', () => {
    expect(scheduleTrainingDay(TRAINING_ACTIONS, 4)).toEqual(scheduleTrainingDay(TRAINING_ACTIONS, 4));
    const days = new Set(Array.from({ length: 12 }, (_, i) =>
      scheduleTrainingDay(TRAINING_ACTIONS, i + 1).resting[0]?.id));
    expect(days.size).toBeGreaterThan(1);
  });
  test('legacy and malformed clock values resolve through timeState day one', () => {
    expect(resolveTrainingSchedule({} as never).day).toBe(1);
    expect(resolveTrainingSchedule({ time: { total: NaN } } as never).day).toBe(1);
    expect(resolveTrainingSchedule({ time: { total: 7 } } as never).day).toBe(2);
  });
  test('small catalogues never rest every available drill', () => {
    expect(scheduleTrainingDay([], 1)).toEqual({ day: 1, actions: [], resting: [] });
    expect(scheduleTrainingDay([TRAINING_ACTIONS[0]], 1).actions).toHaveLength(1);
  });
});
