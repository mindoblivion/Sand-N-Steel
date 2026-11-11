// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const sceneSource = readFileSync(
  new URL('../components/3d/city/CityHubScene.tsx', import.meta.url),
  'utf8',
);

describe('city movement focus-loss recovery', () => {
  test('blur and hidden visibility clear touch and keyboard movement state', () => {
    const resetStart = sceneSource.indexOf('const resetJoystickInput = () => {');
    const resetEnd = sceneSource.indexOf('\n    };', resetStart);
    expect(resetStart).toBeGreaterThan(-1);
    const resetHandler = sceneSource.slice(resetStart, resetEnd);

    expect(resetHandler).toContain('touchIdRef.current = null');
    expect(resetHandler).toContain('touchVectorRef.current = { x: 0, z: 0 }');
    expect(resetHandler).toContain('keysPressed.current = {}');
    expect(resetHandler).toContain('setKnobPos({ x: 0, y: 0 })');

    expect(sceneSource).toContain("window.addEventListener('blur', resetJoystickInput)");
    expect(sceneSource).toContain("document.addEventListener('visibilitychange', handleVisibilityChange)");
    expect(sceneSource).toContain("if (document.visibilityState !== 'visible') resetJoystickInput()");
  });
});
