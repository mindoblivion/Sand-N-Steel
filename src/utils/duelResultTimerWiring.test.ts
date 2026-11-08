// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

const scene = readFileSync(new URL('../components/duel/DuelScene.tsx', import.meta.url), 'utf8');
const code = scene.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

describe('duel result callback ownership', () => {
  test('the scene owns one result timer and cancels it during unmount cleanup', () => {
    expect(code).toContain('const resultTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);');
    expect(code).toContain('resultTransitionTimerRef.current = cancelDuelResult(resultTransitionTimerRef.current);');
    const cleanup = code.indexOf('resultTransitionTimerRef.current = cancelDuelResult(');
    const effectEnd = code.indexOf('}, []);', cleanup);
    expect(cleanup).toBeGreaterThan(-1);
    expect(effectEnd).toBeGreaterThan(cleanup);
  });

  test('both victory and defeat schedule the existing 1400 ms result transition', () => {
    const victory = code.indexOf('onMatchComplete(statsRef.current, true);');
    const defeat = code.indexOf('onMatchComplete(statsRef.current, false);');
    expect(victory).toBeGreaterThan(-1);
    expect(defeat).toBeGreaterThan(victory);
    const victorySchedule = code.lastIndexOf('resultTransitionTimerRef.current = scheduleDuelResult(', victory);
    const defeatSchedule = code.lastIndexOf('resultTransitionTimerRef.current = scheduleDuelResult(', defeat);
    expect(victorySchedule).toBeGreaterThan(-1);
    expect(defeatSchedule).toBeGreaterThan(victory);
    expect(code.slice(victorySchedule, victory)).toContain('}, 1400);');
    expect(code.slice(defeatSchedule, defeat)).toContain('}, 1400);');
    expect(code).not.toContain('setTimeout(() => {\n        onMatchComplete(statsRef.current');
  });

  test('each completion callback clears the owned ref before handing off the result', () => {
    expect(code).toMatch(/resultTransitionTimerRef\.current = null;\s*onMatchComplete\(statsRef\.current, true\);/);
    expect(code).toMatch(/resultTransitionTimerRef\.current = null;\s*onMatchComplete\(statsRef\.current, false\);/);
  });
});
