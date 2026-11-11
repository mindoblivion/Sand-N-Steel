// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const sceneSource = readFileSync(
  new URL('../components/3d/RaceScene.tsx', import.meta.url),
  'utf8',
);

describe('race touch-input lifecycle recovery', () => {
  test('freezing the race releases both touch and keyboard controls', () => {
    const frozenStart = sceneSource.indexOf('if (frozen) {', sceneSource.indexOf('// The desktop path'));
    const frozenEnd = sceneSource.indexOf('\n    }', frozenStart);
    expect(frozenStart).toBeGreaterThan(-1);
    const frozenBlock = sceneSource.slice(frozenStart, frozenEnd);

    expect(frozenBlock).toContain('heldKeys.clear()');
    expect(frozenBlock).toContain('keyboardInput.throttle = 0');
    expect(frozenBlock).toContain('keyboardInput.steer = 0');
    expect(frozenBlock).toContain('touchInput.throttle = 0');
    expect(frozenBlock).toContain('touchInput.steer = 0');
  });

  test('blur and hidden visibility release both input paths', () => {
    const releaseStart = sceneSource.indexOf('const releaseAll = () => {');
    const releaseEnd = sceneSource.indexOf('\n    };', releaseStart);
    expect(releaseStart).toBeGreaterThan(-1);
    const releaseBlock = sceneSource.slice(releaseStart, releaseEnd);

    expect(releaseBlock).toContain('heldKeys.clear()');
    expect(releaseBlock).toContain('sync()');
    expect(releaseBlock).toContain('touchInput.throttle = 0');
    expect(releaseBlock).toContain('touchInput.steer = 0');

    expect(sceneSource).toContain("window.addEventListener('blur', releaseAll)");
    expect(sceneSource).toContain("document.addEventListener('visibilitychange', handleVisibilityChange)");
    expect(sceneSource).toContain("if (document.visibilityState !== 'visible') releaseAll()");
    expect(sceneSource).toContain("document.removeEventListener('visibilitychange', handleVisibilityChange)");
  });
});
