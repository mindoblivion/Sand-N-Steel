/**
 * The arena purse regression tests.
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  a loss pays nothing, whatever the fight's statistics were;
 *   §B  a plain victory pays exactly the opponent's base bounty;
 *   §C  crowd favour steps at the 25-point marks above 50 and never below it;
 *   §D  precision is 5 gold per perfect block, capped at five blocks;
 *   §E  a flawless victory adds half the base, and one point of damage removes it;
 *   §F  a full-value win is the sum of its parts, and the total is never negative
 *       or fractional for malformed input;
 *   §G  the wiring: the duel pays the purse onto the stats object App credits, a
 *       defeat pays zero, and the result screen renders the breakdown.
 *
 * Run with: `bun test src/utils/duelRewards.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  calculateDuelGold,
  PURSE_FLAWLESS_RATE,
  PURSE_HYPE_FLOOR,
  PURSE_HYPE_STEP,
  PURSE_PRECISION_MAX_BLOCKS,
  PURSE_PRECISION_PER_BLOCK,
} from './duelRewards';

/** Marcus the Rookie's bounty — the tier-1 gate every fresh gladiator meets. */
const BASE = 35;

function purse(over: Partial<Parameters<typeof calculateDuelGold>[0]> = {}) {
  return calculateDuelGold({
    baseGold: BASE,
    didWin: true,
    crowdHypePeak: 25,
    perfectBlocks: 0,
    damageTaken: 40,
    ...over,
  });
}

describe('§A a loss pays nothing', () => {
  test('a defeat with a spectacular fight still pays zero', () => {
    const lost = purse({ didWin: false, crowdHypePeak: 100, perfectBlocks: 5, damageTaken: 0 });
    expect(lost).toEqual({ base: 0, hype: 0, precision: 0, flawless: 0, total: 0 });
  });
});

describe('§B a plain victory pays the bounty', () => {
  test('quiet fight, some damage taken: exactly the base', () => {
    expect(purse().total).toBe(BASE);
  });

  test('hype at the floor earns no crowd favour', () => {
    expect(purse({ crowdHypePeak: PURSE_HYPE_FLOOR })).toEqual({
      base: BASE,
      hype: 0,
      precision: 0,
      flawless: 0,
      total: BASE,
    });
  });
});

describe('§C crowd favour', () => {
  test('one step above the floor is 10 % of the base', () => {
    expect(purse({ crowdHypePeak: PURSE_HYPE_FLOOR + PURSE_HYPE_STEP }).hype).toBe(4); // 3.5 → 4
  });

  test('two steps is 20 %', () => {
    expect(purse({ crowdHypePeak: 100 }).hype).toBe(7); // 7.0
  });

  test('a hype peak below the floor never subtracts', () => {
    for (const hype of [0, 10, 24, 49]) expect(purse({ crowdHypePeak: hype }).hype).toBe(0);
  });

  test('the bonus is monotonic in hype', () => {
    let previous = -1;
    for (let hype = 0; hype <= 100; hype += 5) {
      const value = purse({ crowdHypePeak: hype }).hype;
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe('§D precision', () => {
  test('5 gold per perfect block', () => {
    expect(purse({ perfectBlocks: 2 }).precision).toBe(2 * PURSE_PRECISION_PER_BLOCK);
  });

  test('the bonus is capped at five blocks', () => {
    const capped = PURSE_PRECISION_MAX_BLOCKS * PURSE_PRECISION_PER_BLOCK;
    expect(purse({ perfectBlocks: 5 }).precision).toBe(capped);
    expect(purse({ perfectBlocks: 9 }).precision).toBe(capped);
  });
});

describe('§E flawless victory', () => {
  test('no damage taken adds half the base', () => {
    expect(purse({ damageTaken: 0 }).flawless).toBe(Math.round(BASE * PURSE_FLAWLESS_RATE)); // 18
  });

  test('one point of damage removes it entirely', () => {
    expect(purse({ damageTaken: 1 }).flawless).toBe(0);
  });
});

describe('§F totals', () => {
  test('a full-value win is the sum of its parts', () => {
    const best = purse({ crowdHypePeak: 100, perfectBlocks: 5, damageTaken: 0 });
    expect(best.base).toBe(BASE);
    expect(best.hype).toBe(7);
    expect(best.precision).toBe(25);
    expect(best.flawless).toBe(18);
    expect(best.total).toBe(85);
    expect(best.total).toBe(best.base + best.hype + best.precision + best.flawless);
  });

  test('every field stays a non-negative whole number for malformed input', () => {
    const malformed = [
      purse({ baseGold: Number.NaN }),
      purse({ baseGold: -50 }),
      purse({ crowdHypePeak: Number.POSITIVE_INFINITY }),
      purse({ perfectBlocks: -3 }),
      purse({ damageTaken: Number.NaN }),
      purse({ baseGold: 12.7, crowdHypePeak: 99.9, perfectBlocks: 1.9, damageTaken: 0 }),
    ];
    for (const p of malformed) {
      for (const value of [p.base, p.hype, p.precision, p.flawless, p.total]) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('a win never pays less than the bounty', () => {
    for (const baseGold of [0, 35, 120, 920, 1000]) {
      expect(purse({ baseGold }).total).toBeGreaterThanOrEqual(baseGold);
    }
  });
});

describe('§G wiring', () => {
  const scene = readFileSync('src/components/duel/DuelScene.tsx', 'utf8');
  const app = readFileSync('src/App.tsx', 'utf8');
  const modal = readFileSync('src/components/hub/DuelResultModal.tsx', 'utf8');

  test('the duel pays the purse onto the stats object it reports', () => {
    expect(scene).toContain("import { calculateDuelGold } from '../../utils/duelRewards';");
    expect(scene).toContain('baseGold: opponent.rewardGold');
    expect(scene).toContain('statsRef.current.goldEarned = purse.total;');
    expect(scene).toContain('statsRef.current.goldBreakdown = purse;');
  });

  test('a defeat pays no purse', () => {
    const defeat = scene.slice(scene.indexOf("addLog(`DEFEAT!"));
    expect(defeat.slice(0, 220)).toContain('statsRef.current.goldEarned = 0;');
  });

  test('App credits the same figure it saved — the reward path is unchanged', () => {
    // REBASED (L13A): the credit adds to the settlement's newest-committed base.
    expect(app).toContain('const nextGold = base.gold + stats.goldEarned;');
    expect(app).toContain('gold: nextGold');
    expect(app).toContain('goldTotal={profile?.gold}');
  });

  test('the result screen renders the breakdown', () => {
    expect(modal).toContain('stats.goldBreakdown');
    expect(modal).toContain('Crowd Favour');
    expect(modal).toContain('Perfect Blocks');
    expect(modal).toContain('Flawless Victory');
    expect(modal).toContain('Purse Now:');
  });
});
