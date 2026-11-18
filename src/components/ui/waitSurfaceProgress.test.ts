// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { resolveWaitSurfaceProgress } from './waitSurfaceProgress';

describe('WaitSurface progress truthfulness', () => {
  test('uses a measured percentage while the asset loader is active with a known count', () => {
    expect(resolveWaitSurfaceProgress(true, 8, 37.6)).toEqual({
      knowsCount: true,
      pct: 38,
    });
  });

  test('does not reuse a completed loader percentage while a lazy screen chunk is pending', () => {
    expect(resolveWaitSurfaceProgress(false, 8, 100)).toEqual({
      knowsCount: false,
      pct: 0,
    });
  });

  test('uses an indeterminate sweep when the active loader has no known item count', () => {
    expect(resolveWaitSurfaceProgress(true, 0, 0)).toEqual({
      knowsCount: false,
      pct: 0,
    });
  });

  test('fails closed for invalid progress values', () => {
    expect(resolveWaitSurfaceProgress(true, 3, Number.NaN)).toEqual({
      knowsCount: false,
      pct: 0,
    });
  });
});
