// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resetCityInputState } from './cityInputLifecycle';

describe('city input lifecycle reset', () => {
  test('clears held keyboard and joystick input and releases the active touch', () => {
    const keys = { current: { w: true, a: true } as Record<string, boolean> };
    const vector = { current: { x: 0.8, z: -0.4 } };
    const touch = { current: 17 as number | null };
    const clock = { current: 1234 };
    resetCityInputState(keys, vector, touch, clock, 9876);
    expect(keys.current).toEqual({});
    expect(vector.current).toEqual({ x: 0, z: 0 });
    expect(touch.current).toBeNull();
    expect(clock.current).toBe(9876);
  });

  test('city scene subscribes and cleans up lifecycle/focus reset events', () => {
    const source = readFileSync(new URL('../components/3d/city/CityHubScene.tsx', import.meta.url), 'utf8');
    expect(source).toContain("document.addEventListener('visibilitychange', handleVisibilityChange)");
    expect(source).toContain("window.addEventListener('blur', resetInput)");
    expect(source).toContain("window.addEventListener('focus', resetInput)");
    expect(source).toContain("window.addEventListener('pageshow', resetInput)");
    expect(source).toContain("document.removeEventListener('visibilitychange', handleVisibilityChange)");
    expect(source).toContain("window.removeEventListener('blur', resetInput)");
    expect(source).toContain("window.removeEventListener('focus', resetInput)");
    expect(source).toContain("window.removeEventListener('pageshow', resetInput)");
  });
});
