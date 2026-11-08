// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { cancelDuelResult, scheduleDuelResult } from './duelResultTimer';

describe('duel result transition timer lifecycle', () => {
  test('schedules the unchanged result delay and invokes completion once', () => {
    let scheduled: (() => void) | undefined;
    let delay = 0;
    const timer = scheduleDuelResult(() => { called += 1; }, 1400, ((callback, ms) => {
      scheduled = callback;
      delay = ms;
      return 17 as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
    let called = 0;
    expect(timer).toBe(17);
    expect(delay).toBe(1400);
    scheduled?.();
    expect(called).toBe(1);
  });

  test('cancels a pending transition and safely accepts an empty timer', () => {
    const cancelled: unknown[] = [];
    const cancel = ((timer: unknown) => { cancelled.push(timer); }) as typeof clearTimeout;
    expect(cancelDuelResult(23 as ReturnType<typeof setTimeout>, cancel)).toBeNull();
    expect(cancelled).toEqual([23]);
    expect(cancelDuelResult(null, cancel)).toBeNull();
    expect(cancelled).toEqual([23]);
  });
});
