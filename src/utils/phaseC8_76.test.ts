/**
 * Phase C-8.76B — Crowd Momentum milestone tests.
 *
 * The rule: every THIRD consecutive landed player hit is worth +10 crowd hype
 * (through the meter's existing 100-point cap) and one chronicle line. Nothing
 * else moves: no damage, no stamina, no hit chance, no AI, no reward formula.
 *
 * What is driven here, and what is merely read:
 *   §A–§H drive the PRODUCTION helpers (`applyComboEvent`, `crowdMomentumReward`,
 *         `isCrowdMomentumMilestone`, `calculateDuelGold`) in sequences that mirror
 *         the duel's own combo events, so the award, its idempotency, its reset
 *         behaviour, the cap and the opponent-isolation rule are behaviour, not
 *         source text. The reset semantics are the shipped C-9 ones — this suite
 *         pins that they did NOT change.
 *   §I is the wiring check the repo's other combat suites use (there is no DOM
 *      renderer here to mount `<DuelScene/>`): it reads the shipped sources and
 *      asserts the award is evaluated once, outside `executeCombatTurn`, on the
 *      combo count, gated before any hype write, and that the HUD badge is still
 *      the one existing element.
 *
 * Run with: bun test src/utils/phaseC8_76.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  CROWD_HYPE_MAX,
  CROWD_MOMENTUM_HYPE_GAIN,
  CROWD_MOMENTUM_INTERVAL,
  crowdMomentumReward,
  isCrowdMomentumMilestone,
} from './crowdMomentum';
import { applyComboEvent, type ComboEvent } from './combatCalculations';
import { calculateDuelGold } from './duelRewards';

const duelSource = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);
const hudSource = readFileSync(
  new URL('../components/ui/CombatHUD.tsx', import.meta.url),
  'utf8',
);

/** The duel's own starting hype (`DuelScene`'s `useState(25)`). */
const HYPE_START = 25;

/**
 * Drive one combo event exactly the way the duel does: `applyComboEvent` moves
 * the count, then the transition is priced against the meter's current hype.
 */
function drive(state: { combo: number; hype: number }, event: ComboEvent) {
  const previousCombo = state.combo;
  const combo = applyComboEvent(previousCombo, event);
  const reward = crowdMomentumReward(state.hype, previousCombo, combo);
  return { combo, ...reward };
}

// ── §A  The milestone itself ──────────────────────────────────────────────
describe('C-8.76B — milestone detection', () => {
  test('every third hit is a milestone and nothing else is', () => {
    expect(isCrowdMomentumMilestone(3)).toBe(true);
    expect(isCrowdMomentumMilestone(6)).toBe(true);
    expect(isCrowdMomentumMilestone(9)).toBe(true);
    expect(isCrowdMomentumMilestone(12)).toBe(true);
    for (const count of [0, 1, 2, 4, 5, 7, 8, 10, 11]) {
      expect(isCrowdMomentumMilestone(count)).toBe(false);
    }
  });

  test('no count at or below zero is a milestone, and junk reads as none', () => {
    expect(isCrowdMomentumMilestone(0)).toBe(false);
    expect(isCrowdMomentumMilestone(-3)).toBe(false);
    expect(isCrowdMomentumMilestone(Number.NaN)).toBe(false);
    expect(isCrowdMomentumMilestone(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isCrowdMomentumMilestone(Number.NEGATIVE_INFINITY)).toBe(false);
    // @ts-expect-error — a hand-edited/foreign value must not throw
    expect(isCrowdMomentumMilestone(undefined)).toBe(false);
    // @ts-expect-error — a hand-edited/foreign value must not throw
    expect(isCrowdMomentumMilestone('3')).toBe(false);
  });

  test('the shipped numbers are the phase brief (3 hits, +10, cap 100)', () => {
    expect(CROWD_MOMENTUM_INTERVAL).toBe(3);
    expect(CROWD_MOMENTUM_HYPE_GAIN).toBe(10);
    expect(CROWD_HYPE_MAX).toBe(100);
  });
});

// ── §B  The award, and only on the qualifying transition ───────────────────
describe('C-8.76B — one award per newly reached milestone', () => {
  test('the first hit of a streak is worth nothing and the third pays', () => {
    let state = { combo: 0, hype: HYPE_START };

    let r = drive(state, 'landed');
    state = { combo: r.combo, hype: r.hype };
    expect(state.combo).toBe(1);
    expect(r.hypeGain).toBe(0);

    r = drive(state, 'landed');
    state = { combo: r.combo, hype: r.hype };
    expect(state.combo).toBe(2);
    expect(r.hypeGain).toBe(0);

    r = drive(state, 'landed');
    state = { combo: r.combo, hype: r.hype };
    expect(state.combo).toBe(3);
    expect(r.milestone).toBe(true);
    expect(r.hypeGain).toBe(10);
    expect(state.hype).toBe(HYPE_START + 10);

    // The fourth and fifth carry the streak on and pay nothing.
    r = drive(state, 'landed');
    state = { combo: r.combo, hype: r.hype };
    expect(state.combo).toBe(4);
    expect(r.hypeGain).toBe(0);
    r = drive(state, 'landed');
    state = { combo: r.combo, hype: r.hype };
    expect(state.combo).toBe(5);
    expect(r.hypeGain).toBe(0);
  });

  test('counts 3, 6 and 9 each qualify exactly once', () => {
    let state = { combo: 0, hype: HYPE_START };
    const awarded: number[] = [];
    for (let hit = 1; hit <= 9; hit++) {
      const r = drive(state, 'landed');
      state = { combo: r.combo, hype: r.hype };
      if (r.hypeGain > 0) awarded.push(state.combo);
    }
    expect(awarded).toEqual([3, 6, 9]);
    expect(state.hype).toBe(HYPE_START + 3 * CROWD_MOMENTUM_HYPE_GAIN);
  });

  test('only a forward move onto the milestone pays', () => {
    expect(crowdMomentumReward(25, 2, 3).hypeGain).toBe(10);
    expect(crowdMomentumReward(25, 5, 6).hypeGain).toBe(10);
    expect(crowdMomentumReward(25, 8, 9).hypeGain).toBe(10);
    expect(crowdMomentumReward(25, 1, 2).hypeGain).toBe(0);
    expect(crowdMomentumReward(25, 3, 4).hypeGain).toBe(0);
  });
});

// ── §C  Idempotency ───────────────────────────────────────────────────────
describe('C-8.76B — a milestone cannot pay twice', () => {
  test('re-evaluating the same milestone pays nothing', () => {
    const first = crowdMomentumReward(25, 2, 3);
    expect(first.hypeGain).toBe(10);
    expect(first.hype).toBe(35);

    // The identical evaluation again (a re-render / Strict Mode double call).
    const again = crowdMomentumReward(25, 2, 3);
    expect(again.hypeGain).toBe(10); // pure: same inputs, same answer…
    // …which is why the CALLER commits the count: the second evaluation is made
    // from 3 → 3, i.e. no forward movement, and pays nothing.
    expect(crowdMomentumReward(35, 3, 3).hypeGain).toBe(0);
    expect(crowdMomentumReward(35, 3, 3).hype).toBe(35);
  });

  test('a duplicated landed event advances the streak instead of re-paying', () => {
    // 2 → 3 pays once; the duplicate resolves as 3 → 4, which is not a milestone.
    let state = { combo: 0, hype: HYPE_START };
    state = (() => { const r = drive(state, 'landed'); return { combo: r.combo, hype: r.hype }; })();
    state = (() => { const r = drive(state, 'landed'); return { combo: r.combo, hype: r.hype }; })();
    const pay = drive(state, 'landed');
    expect(pay.hypeGain).toBe(10);
    state = { combo: pay.combo, hype: pay.hype };

    const duplicate = drive(state, 'landed');
    expect(duplicate.combo).toBe(4);
    expect(duplicate.hypeGain).toBe(0);
    expect(duplicate.hype).toBe(HYPE_START + 10);
  });

  test('an unchanged count can never pay, whatever the hype', () => {
    for (const combo of [0, 3, 6, 9]) {
      expect(crowdMomentumReward(40, combo, combo).hypeGain).toBe(0);
    }
  });
});

// ── §D  Reset and re-qualify ──────────────────────────────────────────────
describe('C-8.76B — a reset restarts the sequence', () => {
  test('three hits pay, a miss resets, and the next third hit pays again', () => {
    let state = { combo: 0, hype: HYPE_START };
    const step = (event: ComboEvent) => {
      const r = drive(state, event);
      state = { combo: r.combo, hype: r.hype };
      return r;
    };

    step('landed');
    step('landed');
    expect(step('landed').hypeGain).toBe(10);

    const miss = step('miss');
    expect(miss.combo).toBe(0);
    expect(miss.hypeGain).toBe(0);

    step('landed');
    step('landed');
    expect(step('landed').hypeGain).toBe(10);
    expect(state.hype).toBe(HYPE_START + 20);
  });

  test('taking a hit resets the sequence the same way', () => {
    let state = { combo: 0, hype: HYPE_START };
    const step = (event: ComboEvent) => {
      const r = drive(state, event);
      state = { combo: r.combo, hype: r.hype };
      return r;
    };

    step('landed');
    step('landed');
    expect(step('landed').hypeGain).toBe(10);

    const damaged = step('player_damaged');
    expect(damaged.combo).toBe(0);
    expect(damaged.hypeGain).toBe(0);

    step('landed');
    step('landed');
    expect(step('landed').hypeGain).toBe(10);
  });

  test('the C-9 reset semantics are unchanged', () => {
    // The events the duel actually emits (DuelScene's four applyComboEvent sites).
    expect(applyComboEvent(2, 'landed')).toBe(3);
    expect(applyComboEvent(3, 'miss')).toBe(0);
    expect(applyComboEvent(3, 'player_damaged')).toBe(0);
    expect(applyComboEvent(3, 'blocked')).toBe(3);
    expect(applyComboEvent(3, 'none')).toBe(3);
  });
});

// ── §E  The cap ───────────────────────────────────────────────────────────
describe('C-8.76B — hype stays inside the meter', () => {
  test('a milestone at the ceiling pays nothing and never exceeds 100', () => {
    const atCap = crowdMomentumReward(100, 2, 3);
    expect(atCap.hypeGain).toBe(10); // the transition is a milestone…
    expect(atCap.hype).toBe(100); // …but the meter cannot pass its ceiling
  });

  test('a milestone just below the ceiling clamps to exactly 100', () => {
    expect(crowdMomentumReward(95, 2, 3).hype).toBe(100);
    expect(crowdMomentumReward(99.5, 5, 6).hype).toBe(100);
  });

  test('a long streak ends at 100 and stays there', () => {
    let state = { combo: 0, hype: HYPE_START };
    for (let hit = 1; hit <= 30; hit++) {
      const r = drive(state, 'landed');
      state = { combo: r.combo, hype: r.hype };
      expect(state.hype).toBeLessThanOrEqual(CROWD_HYPE_MAX);
    }
    expect(state.hype).toBe(100);
  });

  test('a malformed meter reads as empty rather than NaN', () => {
    expect(crowdMomentumReward(Number.NaN, 2, 3).hype).toBe(10);
    expect(crowdMomentumReward(Number.POSITIVE_INFINITY, 2, 3).hype).toBe(10);
    expect(crowdMomentumReward(-40, 5, 6).hype).toBe(10);
  });
});

// ── §F  Player-only ───────────────────────────────────────────────────────
describe('C-8.76B — the award is the player\'s own streak', () => {
  test('an opponent hit that damages the player pays nothing', () => {
    const damage = crowdMomentumReward(30, 3, applyComboEvent(3, 'player_damaged'));
    expect(damage.hypeGain).toBe(0);
    expect(damage.milestone).toBe(false);
    expect(damage.hype).toBe(30);
  });

  test('a taunt, a block, a dodge or an opponent miss pays nothing', () => {
    // None of these is a combo event at all; the count simply does not move.
    for (const combo of [0, 2, 3, 5]) {
      expect(crowdMomentumReward(30, combo, combo).hypeGain).toBe(0);
    }
  });

  test('a blocked attack that still chips keeps the streak but pays nothing', () => {
    const combo = applyComboEvent(3, 'blocked');
    expect(combo).toBe(3);
    expect(crowdMomentumReward(30, 3, combo).hypeGain).toBe(0);
  });
});

// ── §G  The documented evade semantics ────────────────────────────────────
describe('C-8.76B — an evaded strike keeps the C-9 behaviour', () => {
  test('an evade leaves the streak standing and pays nothing', () => {
    // Phase 39B documents `none` — evaded / out of range / non-attack — as "no
    // change", and the audit confirmed production reaches it by simply not
    // calling applyComboEvent on the evade branch. Behaviour preserved as is.
    expect(applyComboEvent(2, 'none')).toBe(2);
    expect(crowdMomentumReward(30, 2, applyComboEvent(2, 'none')).hypeGain).toBe(0);
    expect(applyComboEvent(3, 'none')).toBe(3);
    expect(crowdMomentumReward(30, 3, 3).hypeGain).toBe(0);
  });
});

// ── §H  The purse is untouched ────────────────────────────────────────────
describe('C-8.76B — reward formulas are unchanged', () => {
  const purse = (crowdHypePeak: number) =>
    calculateDuelGold({
      baseGold: 35,
      didWin: true,
      crowdHypePeak,
      perfectBlocks: 0,
      damageTaken: 0,
    });

  test('the crowd-favour thresholds and rates are exactly as shipped', () => {
    expect(purse(50).hype).toBe(0);
    expect(purse(75).hype).toBe(4);
    expect(purse(100).hype).toBe(7);
    expect(purse(49).hype).toBe(0);
  });

  test('a loss still pays nothing at any hype', () => {
    const lost = calculateDuelGold({
      baseGold: 35,
      didWin: false,
      crowdHypePeak: 100,
      perfectBlocks: 5,
      damageTaken: 0,
    });
    expect(lost).toEqual({ base: 0, hype: 0, precision: 0, flawless: 0, total: 0 });
  });

  test('the total is still base + hype + precision + flawless', () => {
    const p = purse(100);
    expect(p.total).toBe(p.base + p.hype + p.precision + p.flawless);
  });
});

// ── §I  Wiring ────────────────────────────────────────────────────────────
describe('C-8.76B — the shipped wiring', () => {
  test('the award is evaluated once, on the combo count, outside the turn resolver', () => {
    const calls = duelSource.split('crowdMomentumReward(').length - 1;
    expect(calls).toBe(1);
    // Imported once…
    expect(duelSource).toContain("from '../../utils/crowdMomentum'");
    // …and read outside `executeCombatTurn`, so no strike branch can fire it.
    expect(duelSource.indexOf('crowdMomentumReward(')).toBeLessThan(
      duelSource.indexOf('const executeCombatTurn'),
    );
    // It watches the combo count itself.
    expect(duelSource).toContain('[player.comboCount, addLog, updateCrowdHype]');
  });

  test('the hype write is gated, so no milestone means no write and no log', () => {
    const call = duelSource.indexOf('crowdMomentumReward(');
    const gate = duelSource.indexOf('if (hypeGain === 0) return;', call);
    const write = duelSource.indexOf('updateCrowdHype(() => hype);', call);
    const log = duelSource.indexOf('CROWD MOMENTUM!', call);
    expect(gate).toBeGreaterThan(call);
    expect(write).toBeGreaterThan(gate);
    expect(log).toBeGreaterThan(gate);
    // The hype still lands through the one shared updater (peak + state + ref).
    expect(write).toBeGreaterThan(0);
  });

  test('the combo events themselves are untouched (four sites, no fifth)', () => {
    expect(duelSource.split('applyComboEvent(').length - 1).toBe(4); // the four call sites
    expect(duelSource).toContain("applyComboEvent(prev.comboCount, 'landed')");
    expect(duelSource).toContain("applyComboEvent(prev.comboCount, 'miss')");
    expect(duelSource).toContain("applyComboEvent(prev.comboCount, 'player_damaged')");
    expect(duelSource).toContain("applyComboEvent(prev.comboCount, 'fully_blocked')");
  });

  test('the badge is the existing one, lit from the same rule', () => {
    expect(hudSource).toContain("from '../../utils/crowdMomentum'");
    expect(hudSource).toContain('isCrowdMomentumMilestone(comboCount)');
    // One badge, one label, no new HUD row and no timer in it.
    expect(hudSource.split('COMBO ×{comboCount}').length - 1).toBe(1);
    expect(hudSource).toContain('animate-pulse');
    expect(hudSource.indexOf('comboMomentumLit')).toBeLessThan(
      hudSource.indexOf('COMBO ×{comboCount}'),
    );
  });
});
