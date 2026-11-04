// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/index.css', 'utf8');
const city = readFileSync('src/components/3d/city/CityHubScene.tsx', 'utf8');

describe('mobile city safe-area layout', () => {
  test('defines a non-zero fallback when Android reports no bottom safe-area inset', () => {
    expect(css).toContain('--hub-safe-bottom: max(env(safe-area-inset-bottom, 0px), 1.5rem);');
    expect(css).toContain('viewport-fit=cover');
  });

  test('keeps joystick and action controls above the district footer and system navigation region', () => {
    expect(city).toContain('pb-[calc(var(--hub-safe-bottom)+var(--hub-footer-h)+0.5rem)]');
    expect(city).toContain('bottom-[calc(var(--hub-safe-bottom)+0.5rem)]');
  });

  test('keeps the desktop helper bar from colliding with the safe bottom region', () => {
    expect(city).toContain('bottom-[calc(var(--hub-safe-bottom)+4.5rem)]');
  });
});
