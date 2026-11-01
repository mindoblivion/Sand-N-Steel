// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { nextCounterWindupStep } from './counterWindup';

const scene = readFileSync(new URL('../components/duel/DuelScene.tsx', import.meta.url), 'utf8');

describe('C-8.75C — Valéria counter response window', () => {
  test('the pure state machine announces once, then resolves once', () => {
    expect(nextCounterWindupStep(false, false)).toBe('none');
    expect(nextCounterWindupStep(true, false)).toBe('announce');
    expect(nextCounterWindupStep(true, true)).toBe('resolve');
    expect(nextCounterWindupStep(false, true)).toBe('none');
  });

  test('the queued counter first opens the existing full player response turn', () => {
    const start = scene.indexOf("if (opponent.bossMechanic === 'counter_dodge' && pendingCounterRef.current)");
    const end = scene.indexOf('// ── D-2 BEAST HUNT', start);
    const branch = scene.slice(start, end);
    expect(branch).toContain("counterStep === 'announce'");
    expect(branch).toContain("executeCombatTurn('opponent', 'telegraph')");
    expect(branch).toContain("counterStep === 'resolve'");
    expect(branch).toContain("executeCombatTurn('opponent', 'quick_attack')");
    expect(branch.indexOf("counterStep === 'announce'")).toBeLessThan(branch.indexOf("counterStep === 'resolve'"));
  });

  test('the tell is labelled as a counter, not a heavy, and does not trigger heavy-only perks', () => {
    const start = scene.indexOf("else if (actionType === 'telegraph')");
    const end = scene.indexOf('// 2c. STATEFUL DOCTRINA', start);
    const block = scene.slice(start, end);
    expect(block).toContain("'COUNTER ATTACK INCOMING'");
    expect(block).toContain("'\\u26A0 COUNTER!'");
    expect(block).toContain('isCounterWindup ? 0 : pitBellowerStaminaDrain');
  });

  test('withdrawal and both knockout paths clear the pending counter tell', () => {
    expect(scene).toContain('pendingCounterWindupRef.current = false;');
    expect(scene.match(/pendingCounterWindupRef\\.current = false;/g)?.length).toBeGreaterThanOrEqual(4);
  });

  test('the counter still uses the existing damage bonus marker and ordinary quick attack', () => {
    expect(scene).toContain('counterStrikeRef.current = true;');
    expect(scene).toContain("executeCombatTurn('opponent', 'quick_attack')");
  });
});
