// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/index.css', 'utf8');

describe('Android landscape viewport inset', () => {
  test('clips the app root before the bottom system navigation/gesture strip', () => {
    expect(css).toContain('@media (orientation: landscape) and (max-height: 520px) and (pointer: coarse)');
    expect(css).toContain('#root {');
    expect(css).toContain('height: calc(100dvh - var(--hub-safe-bottom));');
    expect(css).toContain('min-height: 0;');
    expect(css).toContain('overflow: hidden;');
  });
});
