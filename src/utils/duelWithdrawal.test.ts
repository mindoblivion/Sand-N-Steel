import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { DuelStatistics } from '../types/game';
import { withdrawFromDuel } from './duelWithdrawal';

function stats(): DuelStatistics {
  return {
    damageDealt: 12, damageTaken: 4, hitsLanded: 2, perfectBlocks: 0,
    dodgesPerformed: 1, maxCombo: 2, lowestStaminaFraction: 0.5,
    crowdHypePeak: 40, durationSeconds: 20, goldEarned: 125,
    fameEarned: 15, xpEarned: 20,
  };
}

describe('C-8.80B — confirmed duel withdrawal', () => {
  test('confirmed withdrawal latches, cancels pending work, and settles one defeat', () => {
    const order: string[] = [];
    const latch = { current: false };
    const resultStats = stats();
    const settled: Array<{ stats: DuelStatistics; didWin: boolean }> = [];
    const ok = withdrawFromDuel({
      isMatchOver: latch,
      stats: resultStats,
      pending: {
        cancelEnemyStrike: () => order.push('enemy'),
        cancelPlayerStrike: () => order.push('player'),
        clearTurnTimer: () => order.push('timer'),
      },
      settle: (s, didWin) => {
        order.push('settle');
        settled.push({ stats: s, didWin });
      },
    });
    expect(ok).toBe(true);
    expect(latch.current).toBe(true);
    expect(order).toEqual(['enemy', 'player', 'timer', 'settle']);
    expect(settled).toHaveLength(1);
    expect(settled[0].stats).toBe(resultStats);
    expect(settled[0].didWin).toBe(false);
    expect(resultStats.goldEarned).toBe(0);
    expect(resultStats.outcome).toBe('withdrawn');
  });

  test('a second confirmation after any result changes nothing', () => {
    const latch = { current: true };
    const resultStats = stats();
    let calls = 0;
    const ok = withdrawFromDuel({
      isMatchOver: latch,
      stats: resultStats,
      pending: {
        cancelEnemyStrike: () => { calls += 1; },
        cancelPlayerStrike: () => { calls += 1; },
        clearTurnTimer: () => { calls += 1; },
      },
      settle: () => { calls += 1; },
    });
    expect(ok).toBe(false);
    expect(calls).toBe(0);
    expect(resultStats.goldEarned).toBe(125);
    expect(resultStats.outcome).toBeUndefined();
  });
});

describe('C-8.80B — scene and HUD wiring', () => {
  test('weapon badge is informational and withdrawal is the deliberate exit', () => {
    const hud = readFileSync(new URL('../components/ui/CombatHUD.tsx', import.meta.url), 'utf8');
    expect(hud).toContain('onWithdraw');
    expect(hud).toContain('data-withdraw="true"');
    expect(hud).toContain('data-combat-weapon-badge="true"');
    expect(hud).not.toContain('onOpenArmory');
  });
  test('the scene settles through App and cancels active turn timers', () => {
    const scene = readFileSync(new URL('../components/duel/DuelScene.tsx', import.meta.url), 'utf8');
    expect(scene).toContain('withdrawFromDuel({');
    expect(scene).toContain('settle: onMatchComplete');
    expect(scene).toContain('clearTimeout(aiTurnTimerRef.current)');
    expect(scene).toContain('clearTimeout(turnResolutionTimerRef.current)');
    expect(scene).toContain('onFallbackTo2D={onOpenArmory}');
  });
  test('the result card labels a forfeit accurately', () => {
    const modal = readFileSync(new URL('../components/hub/DuelResultModal.tsx', import.meta.url), 'utf8');
    expect(modal).toContain("stats.outcome === 'withdrawn' ? 'WITHDRAWN'");
    expect(modal).toContain('You raised the flag against');
  });
});
