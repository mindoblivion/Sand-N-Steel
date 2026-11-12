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

  test('floating damage label timers are owned and cleared when the duel unmounts', () => {
    expect(code).toContain('const damageNumberTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());');
    expect(code).toContain('damageNumberTimersRef.current.forEach((timer) => clearTimeout(timer));');
    expect(code).toContain('damageNumberTimersRef.current.clear();');
    expect(code).toContain('damageNumberTimersRef.current.add(timer);');
    expect(code).toContain('damageNumberTimersRef.current.delete(timer);');
  });

  test('both victory and defeat schedule the existing 1400 ms result transition', () => {
    const victory = code.indexOf('setTimeout(() => onMatchComplete(statsRef.current, true), 0);');
    const defeat = code.indexOf('setTimeout(() => onMatchComplete(statsRef.current, false), 0);');
    expect(victory).toBeGreaterThan(-1);
    expect(defeat).toBeGreaterThan(victory);
    const victorySchedule = code.lastIndexOf('resultTransitionTimerRef.current = scheduleDuelResult(', victory);
    const defeatSchedule = code.lastIndexOf('resultTransitionTimerRef.current = scheduleDuelResult(', defeat);
    expect(victorySchedule).toBeGreaterThan(-1);
    expect(defeatSchedule).toBeGreaterThan(victory);
    expect(code.indexOf('}, 1400);', victorySchedule)).toBeGreaterThan(victory);
    expect(code.indexOf('}, 1400);', defeatSchedule)).toBeGreaterThan(defeat);
    expect(code).not.toContain('setTimeout(() => {\n        onMatchComplete(statsRef.current');
  });

  test('each completion callback clears the owned ref before handing off the result', () => {
    expect(code).toMatch(/resultTransitionTimerRef\.current = null;\s*setTimeout\(\(\) => onMatchComplete\(statsRef\.current, true\), 0\);/);
    expect(code).toMatch(/resultTransitionTimerRef\.current = null;\s*setTimeout\(\(\) => onMatchComplete\(statsRef\.current, false\), 0\);/);
  });
});
