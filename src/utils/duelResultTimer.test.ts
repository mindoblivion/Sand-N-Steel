// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { cancelDuelResult, scheduleDuelResult } from './duelResultTimer';

describe('duel result transition timer lifecycle', () => {
  test('schedules the unchanged result delay and invokes completion once', () => {
    let scheduled: (() => void) | undefined;
    let delay = 0;
    let called = 0;
    const fakeSchedule = ((callback: TimerHandler, ms?: number) => {
      scheduled = callback as () => void;
      delay = ms ?? 0;
      return {} as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout;

    const timer = scheduleDuelResult(() => { called += 1; }, 1400, fakeSchedule);
    expect(timer).toBeDefined();
    expect(delay).toBe(1400);
    scheduled?.();
    expect(called).toBe(1);
  });

  test('cancels a pending transition and safely accepts an empty timer', () => {
    const cancelled: ReturnType<typeof setTimeout>[] = [];
    const cancel = ((timer: ReturnType<typeof setTimeout>) => {
      cancelled.push(timer);
    }) as typeof clearTimeout;
    const timer = {} as ReturnType<typeof setTimeout>;

    expect(cancelDuelResult(timer, cancel)).toBeNull();
    expect(cancelled).toEqual([timer]);
    expect(cancelDuelResult(null, cancel)).toBeNull();
    expect(cancelled).toEqual([timer]);
  });
});
