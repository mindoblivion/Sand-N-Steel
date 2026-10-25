/**
 * Defensive balance correction — C-8.72B.
 *
 * C-8.70B §R2 stopped Shield Guard from recovering stamina on its own, but a
 * stopped blow still credited the fighter's FULL `staminaRegen` stat. Measured
 * through the shipped helpers on a representative shield build (gladius 0.82
 * block, `staminaRegen` 31.9) that was **31.9 SP per blocked exchange**, against
 * Dodge's 12 SP cost for an evade — with the guard also absorbing 82 % of
 * the damage. C-8.72B halves the credit (`SHIELD_GUARD_REGEN_MULTIPLIER`) and
 * moves nothing else: no damage, mitigation, block reduction, evade chance, AI
 * probability, stamina cost or turn timing changed, and Dodge gained no refund.
 *
 * This suite pins that correction where it can be observed: the shared rule, the
 * two defensive paths that reach it, Dodge's unchanged 12 SP in both outcomes,
 * and the 700 ms wind-up's inability to credit a guard twice or to consume a
 * stale stance.
 *
 *   §A the reduced gain — 0.5, the measured credits, nothing when no blow is stopped,
 *      still clamped by the normal cap, and the rule living in ONE place
 *   §B both defensive paths — a normal-turn guard and a reaction guard reach the same
 *      single credit; an evade and a miss credit nothing
 *   §C Dodge costs exactly 12 SP, whether it succeeds or fails
 *   §D the 700 ms wind-up — one impact per swing, the stance read at impact, consumed once
 *
 * Helper values are driven directly; the wiring is asserted against the shipped
 * sources, anchored on CODE markers only (this repo has no DOM renderer, so the
 * scene cannot be mounted under a test).
 *
 * Run with: bun test src/utils/defensiveBalance.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  applyStaminaRegen,
  shieldGuardStaminaGain,
  DODGE_EVADE_CHANCE,
  DODGE_EVADE_PERCENT,
  SHIELD_GUARD_REGEN_MULTIPLIER,
  DODGE_STAMINA_COST,
  PLAYER_ATTACK_WINDUP_MS,
  ENEMY_ATTACK_WINDUP_MS,
  clearDefensiveStance,
  resolveTurnEndDefensive,
  applyDefensiveAction,
} from './combatCalculations';
import { createPlayerStrike } from './playerStrike';
import type { PlayerStrikeTimer } from './playerStrike';

const duelSource = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);
const helpSource = readFileSync(
  new URL('../components/hub/HelpModal.tsx', import.meta.url),
  'utf8',
);
const panelSource = readFileSync(
  new URL('../components/ui/TurnActionPanel.tsx', import.meta.url),
  'utf8',
);

/** The measured `staminaRegen` of the representative shield build (C-8.72B). */
const SHIELD_BUILD_REGEN = 31.9;
/** The measured `staminaRegen` of the non-shield (pugio 0.35 block) build. */
const NON_SHIELD_REGEN = 37.5;

/** A hand-advanced clock, the `playerStrikeWindup.test.ts` idiom. */
function fakeTimer() {
  let nextId = 1;
  const callbacks = new Map<number, () => void>();
  let live = 0;
  const timer: PlayerStrikeTimer = {
    set(callback) {
      const id = nextId++;
      callbacks.set(id, callback);
      live += 1;
      return id;
    },
    clear(handle) {
      if (callbacks.delete(handle)) live -= 1;
    },
  };
  return {
    timer,
    fireLast() {
      const ids = [...callbacks.keys()];
      const id = ids[ids.length - 1];
      const cb = id === undefined ? undefined : callbacks.get(id);
      if (cb) cb();
      return cb !== undefined;
    },
    get live() {
      return live;
    },
  };
}

// ── §A. The reduced gain ───────────────────────────────────────────────────

describe('§A — Shield Guard credits half a stopped blow (C-8.72B)', () => {
  test('the multiplier is the audited 0.5', () => {
    expect(SHIELD_GUARD_REGEN_MULTIPLIER).toBe(0.5);
  });

  test('the measured shield build credits ≈ 16 SP where it used to credit ≈ 32', () => {
    const credit = shieldGuardStaminaGain(true, SHIELD_BUILD_REGEN);
    expect(credit).toBeCloseTo(15.95, 10);
    expect(credit).toBeCloseTo(SHIELD_BUILD_REGEN * 0.5, 10);
    // Still a positive recovery — the guard's identity is preserved, not removed.
    expect(credit).toBeGreaterThan(0);
    // And it no longer dwarfs Dodge's 12 SP cost the way the full regen did.
    expect(credit).toBeLessThan(SHIELD_BUILD_REGEN);
    expect(SHIELD_BUILD_REGEN - credit).toBeCloseTo(15.95, 10);
  });

  test('a non-shield build is credited the same proportional half', () => {
    expect(shieldGuardStaminaGain(true, NON_SHIELD_REGEN)).toBeCloseTo(18.75, 10);
  });

  test('whole and fractional regen both halve exactly', () => {
    expect(shieldGuardStaminaGain(true, 24)).toBe(12);
    expect(shieldGuardStaminaGain(true, 5)).toBe(2.5);
    expect(shieldGuardStaminaGain(true, 1)).toBe(0.5);
  });

  test('an unstopped blow, a miss and malformed regen credit nothing', () => {
    expect(shieldGuardStaminaGain(false, SHIELD_BUILD_REGEN)).toBe(0);
    expect(shieldGuardStaminaGain(false, 24)).toBe(0);
    expect(shieldGuardStaminaGain(true, 0)).toBe(0);
    expect(shieldGuardStaminaGain(true, -8)).toBe(0);
    expect(shieldGuardStaminaGain(true, Number.NaN)).toBe(0);
    expect(shieldGuardStaminaGain(true, Number.POSITIVE_INFINITY)).toBe(0);
  });

  test('the credit is still clamped by the NORMAL stamina cap', () => {
    const gain = shieldGuardStaminaGain(true, SHIELD_BUILD_REGEN);
    // Low stamina: the full (halved) credit applies.
    expect(applyStaminaRegen(0, 140, gain)).toBeCloseTo(15.95, 10);
    // Mid stamina: it adds on top of what is there.
    expect(applyStaminaRegen(50, 140, gain)).toBeCloseTo(65.95, 10);
    // Near the ceiling: it can never pass it.
    expect(applyStaminaRegen(135, 140, gain)).toBe(140);
    expect(applyStaminaRegen(140, 140, gain)).toBe(140);
    expect(applyStaminaRegen(0, 140, shieldGuardStaminaGain(true, 999))).toBe(140);
  });

  test('the rule lives in the shared helper and nowhere else', () => {
    // One production call site, and it passes the fighter's own stat.
    const calls = duelSource.split('shieldGuardStaminaGain(').length - 1;
    expect(calls).toBe(1);
    expect(duelSource).toContain('shieldGuardStaminaGain(true, defender.stats.staminaRegen)');
    // No call site restates the halving.
    expect(duelSource).not.toContain('SHIELD_GUARD_REGEN_MULTIPLIER');
    expect(duelSource).not.toContain('staminaRegen * 0.5');
    expect(duelSource).not.toMatch(/staminaRegen\s*\*\s*0\.[0-9]/);
  });
});

// ── §B. Both defensive paths reach the one credit ──────────────────────────

describe('§B — a normal-turn guard and a reaction guard share one credit', () => {
  const reactStart = duelSource.indexOf('const reactToPendingAttack = useCallback(');
  const reactEnd = duelSource.indexOf('// No blow may outlive the scene');
  const react = reactStart > -1 && reactEnd > reactStart ? duelSource.slice(reactStart, reactEnd) : '';

  test('the reaction handler exists and claims one reaction per announcement', () => {
    expect(react.length).toBeGreaterThan(0);
    expect(react).toContain('claimReaction()');
  });

  test('the reaction\'s guard writes a STANCE only — no stamina, no credit', () => {
    const guardAt = react.indexOf("applyDefensiveAction(clearDefensiveStance(prev), 'shield_block')");
    expect(guardAt).toBeGreaterThan(-1);
    const window = react.slice(Math.max(0, guardAt - 160), guardAt + 200);
    expect(window).not.toContain('stamina');
    expect(window).not.toContain('applyStaminaRegen');
    expect(window).not.toContain('shieldGuardStaminaGain');
  });

  test('the engine\'s own shield_block turn spends and credits nothing', () => {
    const start = duelSource.indexOf("else if (actionType === 'shield_block') {");
    const end = duelSource.indexOf("} else if (actionType === 'dodge') {");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const branch = duelSource.slice(start, end);
    expect(branch).toContain('isBlocking: true');
    expect(branch).not.toContain('applyStaminaRegen');
    expect(branch).not.toContain('shieldGuardStaminaGain');
    expect(branch).not.toContain('stamina:');
  });

  test('the single credit serves BOTH paths, because it sits in the shared resolution', () => {
    // The reaction only writes stance flags; the credit is in the impact block
    // every strike goes through — a normal-turn guard and a reaction guard alike.
    const impactStart = duelSource.indexOf('const resolveImpact = () => {');
    const impactEnd = duelSource.indexOf('// 4. ANIMATION RESOLUTION');
    expect(impactStart).toBeGreaterThan(-1);
    expect(impactEnd).toBeGreaterThan(impactStart);
    const impact = duelSource.slice(impactStart, impactEnd);

    const creditAt = impact.indexOf('shieldGuardStaminaGain(');
    expect(creditAt).toBeGreaterThan(-1);
    const blockedAt = impact.lastIndexOf('if (isBlocked) {', creditAt);
    const elseAt = impact.lastIndexOf('} else {', creditAt);
    expect(blockedAt).toBeGreaterThan(-1);
    expect(blockedAt).toBeGreaterThan(elseAt);
    // It credits the fighter who was struck, and writes the OTHER fighter.
    expect(impact).toContain('defender.stats.staminaRegen');
    expect(impact.slice(creditAt)).toContain('setOpp((prev) =>');
    expect(impact.slice(creditAt)).toContain('setPlayer((prev) =>');
  });

  test('an evade credits nothing — a dodge is not a blocked blow', () => {
    const evadeStart = duelSource.indexOf('if (isEvaded || isPassiveEvaded) {');
    const evadeEnd = duelSource.indexOf('} else if (roll <= hitPct) {');
    expect(evadeStart).toBeGreaterThan(-1);
    expect(evadeEnd).toBeGreaterThan(evadeStart);
    const evade = duelSource.slice(evadeStart, evadeEnd);
    expect(evade).not.toContain('shieldGuardStaminaGain');
    expect(evade).not.toContain('applyStaminaRegen');
    expect(evade).not.toContain('stamina:');
  });

  test('a missed strike credits nothing', () => {
    const missStart = duelSource.indexOf('// MISSED');
    const missEnd = duelSource.indexOf('};', missStart);
    expect(missStart).toBeGreaterThan(-1);
    const miss = duelSource.slice(missStart, missEnd);
    expect(miss).not.toContain('shieldGuardStaminaGain');
    expect(miss).not.toContain('applyStaminaRegen');
  });
});

// ── §C. Dodge costs exactly 12 SP, whether it succeeds or fails ────────────

describe('§C — Dodge pays 12 SP at stance entry, and the outcome cannot change it', () => {
  test('the cost is the audited 12 and no call site hardcodes it', () => {
    expect(DODGE_STAMINA_COST).toBe(12);
    expect(duelSource).not.toContain('prev.stamina - 12');
    expect(panelSource).not.toContain('player.stamina < 12');
    expect(panelSource).toContain('DODGE_STAMINA_COST');
  });

  test('the dodge turn debits it once per fighter write', () => {
    const start = duelSource.indexOf("} else if (actionType === 'dodge') {");
    const end = duelSource.indexOf("} else if (actionType === 'taunt') {");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const branch = duelSource.slice(start, end);
    // The player and the opponent each take one debit; no other arithmetic.
    const debits = branch.split('prev.stamina - DODGE_STAMINA_COST').length - 1;
    expect(debits).toBe(2);
    expect(branch).not.toContain('applyStaminaRegen');
  });

  test('the reaction dodge debits it once, before any roll', () => {
    const reactStart = duelSource.indexOf('const reactToPendingAttack = useCallback(');
    const reactEnd = duelSource.indexOf('// No blow may outlive the scene');
    const react = duelSource.slice(reactStart, reactEnd);
    expect(react.split('prev.stamina - DODGE_STAMINA_COST').length - 1).toBe(1);
    // The refusal runs before the claim, so a failed dodge does not burn the reaction.
    expect(react.indexOf('player.stamina < DODGE_STAMINA_COST')).toBeLessThan(
      react.indexOf('claimReaction()'),
    );
  });

  test('the resolution never refunds a successful dodge or charges a failed one', () => {
    const impactStart = duelSource.indexOf('const resolveImpact = () => {');
    const impactEnd = duelSource.indexOf('// 4. ANIMATION RESOLUTION');
    const impact = duelSource.slice(impactStart, impactEnd);
    expect(impact.length).toBeGreaterThan(0);
    expect(impact).not.toContain('DODGE_STAMINA_COST');
    expect(impact).not.toContain('prev.stamina -');
    expect(impact).not.toContain('prev.stamina +');
  });

  test('the evade roll reads the ONE shared chance, never a literal', () => {
    // C-8.82B — the rate is a shared constant, so this pin moved from the literal
    // 0.75 to the constant's name and keeps its strength: a hardcoded number (or
    // a different constant) fails here.
    expect(duelSource).toContain(
      'const isEvaded = defender.isInvulnerable && Math.random() < DODGE_EVADE_CHANCE;',
    );
    expect(duelSource).not.toMatch(/isInvulnerable && Math\.random\(\) < 0\.\d+/);
    expect(DODGE_EVADE_PERCENT).toBe(Math.round(DODGE_EVADE_CHANCE * 100));
  });

  test('the manual documents cost, odds, failure and the two timings', () => {
    expect(helpSource).toContain('Dodge');
    expect(helpSource).toContain('Cost: 12 SP');
    expect(helpSource).toContain('{DODGE_EVADE_PERCENT}% chance to evade');
    expect(helpSource).not.toMatch(/\d+% chance to evade/);
    expect(helpSource).toContain('whether the dodge succeeds or fails');
    expect(helpSource).toContain('a failed dodge still takes the damage');
    expect(helpSource).toContain('carries into the opponent');
    expect(helpSource).toContain('one per announcement');
  });
});

// ── §D. The 700 ms wind-up cannot duplicate the credit ─────────────────────

describe('§D — the 700 ms wind-up credits at most once and reads the live stance', () => {
  test('the window is 700 ms, shorter than the 1100 ms turn', () => {
    expect(PLAYER_ATTACK_WINDUP_MS).toBe(700);
    expect(ENEMY_ATTACK_WINDUP_MS).toBe(700);
    expect(duelSource).toContain('}, 1100);');
    expect(PLAYER_ATTACK_WINDUP_MS).toBeLessThan(1100);
  });

  test('a delivered-twice impact resolves once, so one swing cannot credit twice', () => {
    const clock = fakeTimer();
    const strike = createPlayerStrike({ timer: clock.timer });
    let resolved = 0;
    expect(strike.strike('power_attack', () => { resolved += 1; })).toBe(true);

    clock.fireLast(); // the scheduled impact
    clock.fireLast(); // the same callback delivered again
    clock.fireLast(); // and once more

    // The controller admits one impact per swing; the guard credit lives inside
    // that one impact, so it cannot be credited twice for one blow.
    expect(resolved).toBe(1);
    expect(strike.pending).toBeNull();
  });

  test('a second swing is refused while one is pending — no queued second credit', () => {
    const clock = fakeTimer();
    const strike = createPlayerStrike({ timer: clock.timer });
    expect(strike.strike('quick_attack', () => {})).toBe(true);
    expect(strike.strike('power_attack', () => {})).toBe(false);
    expect(clock.live).toBe(1);
    strike.cancel();
    expect(clock.live).toBe(0);
  });

  test('the stance is read at IMPACT, so a strike resolves against the stance it meets', () => {
    const impactStart = duelSource.indexOf('const resolveImpact = () => {');
    const impactEnd = duelSource.indexOf('// 4. ANIMATION RESOLUTION');
    const impact = duelSource.slice(impactStart, impactEnd);
    expect(impact).toContain('const isBlocked = defender.isBlocking;');
    expect(impact).toContain('defender.isInvulnerable');
    // The stance survives the turn boundary and is consumed once, when the
    // fighter next acts — so the wind-up cannot consume it early or twice.
    const preserved = resolveTurnEndDefensive({ isBlocking: true, isInvulnerable: false });
    expect(preserved.isBlocking).toBe(true);
    expect(clearDefensiveStance(preserved)).toEqual({ isBlocking: false, isInvulnerable: false });
    expect(applyDefensiveAction(clearDefensiveStance({ isBlocking: false, isInvulnerable: false }), 'shield_block'))
      .toEqual({ isBlocking: true, isInvulnerable: false });
    expect(applyDefensiveAction(clearDefensiveStance({ isBlocking: true, isInvulnerable: false }), 'dodge'))
      .toEqual({ isBlocking: false, isInvulnerable: true });
  });

  test('the pre-clear runs once per fighter branch, and the reaction replaces (never stacks)', () => {
    // One consumption rule, in the engine's pre-clear, for each side.
    const preCleared = duelSource.split('prev.isInvulnerable || prev.isBlocking').length - 1;
    expect(preCleared).toBe(2);
    // The reaction clears the OTHER stance before applying its own, twice over.
    expect(duelSource.split('clearDefensiveStance(').length - 1).toBe(2);
  });
});
