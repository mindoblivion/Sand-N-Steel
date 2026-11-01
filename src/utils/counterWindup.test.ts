// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { nextCounterWindupStep } from './counterWindup';

describe('C-8.75C — queued counter telegraph', () => {
  test('no queued counter has no telegraph step', () => {
    expect(nextCounterWindupStep(false, false)).toBe('none');
    expect(nextCounterWindupStep(false, true)).toBe('none');
  });
  test('a queued counter announces once before it resolves', () => {
    expect(nextCounterWindupStep(true, false)).toBe('announce');
    expect(nextCounterWindupStep(true, true)).toBe('resolve');
  });
});
