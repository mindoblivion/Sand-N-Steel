/**
 * COMBAT-3 — regular opponents announce their power.
 *
 * Run with: `bun test src/utils/regularTelegraph.test.ts`
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §1  the announce rule: a regular's chosen power is announced exactly when
 *       no telegraph is live, the player is in range and the heavy is
 *       affordable — and never for a boss, a quick attack, or an out-of-range
 *       or unaffordable power.
 *   §2  the glow gate: the mesh glows for a boss's own heavy_telegraph moment
 *       and for a regular's announced power, and for nothing else — Varro's
 *       feint, Valéria's counter, Ignis's switch and Aurelius's rage stay dark.
 *   §3  the coach mark: D7 fires on the telegraph flag alone, boss or regular,
 *       and the card's text says so.
 *   §4  the duel wiring: the AI effect announces a regular's chosen power and
 *       resolves it next turn through the standard power pipeline, reusing the
 *       one banner literal — no second banner, no new timer, no boss branch
 *       touched.
 *
 * Pure functions plus source pins: nothing here renders a canvas or fights a
 * duel, and no test mutates a profile.
 */
// @ts-ignore — bun:test is available at runtime via `bun test`
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { shouldAnnounceRegularPower } from './regularTelegraph';
import { bossPresentsMoment, presentsTelegraphGlow } from './bossPresentation';
import { evaluateBeats, getCoachCard, type FightSnapshot } from './coachMarks';

// ── helpers ──────────────────────────────────────────────────────────────────

const source = (path: string) => readFileSync(path, 'utf8');
/** Strip block and line comments so prose can neither satisfy nor defeat a pin. */
const code = (path: string) =>
  source(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

/** A regular's chosen power, in range, affordable, nothing pending. */
const announceBase = {
  isBoss: false as const,
  chosenAction: 'power_attack' as const,
  pendingHeavy: false,
  inRange: true,
  stamina: 30,
  heavyCost: 22,
};

/** A fight snapshot whose only live trigger is the telegraph flag. */
function fight(over: Partial<FightSnapshot> = {}): FightSnapshot {
  return {
    phase: 'fight',
    opponentId: 'opp_gaius',
    isBoss: false,
    playerTurn: 2,
    playerActing: true,
    inReach: true,
    playerStamina: 60,
    playerStaminaMax: 100,
    quickStaminaCost: 12,
    powerStaminaCost: 22,
    lastPlayerStrike: 'landed',
    opponentHealth: 100,
    opponentHealthMax: 100,
    hype: 25,
    telegraph: true,
    ...over,
  };
}

// ── §1 — THE ANNOUNCE RULE ───────────────────────────────────────────────────

describe('§1 — a regular’s chosen power is announced', () => {
  test('the ladder’s power, in range and affordable, is announced', () => {
    expect(shouldAnnounceRegularPower(announceBase)).toBe(true);
  });

  test('a heavy that costs exactly the stamina on hand is announced', () => {
    expect(shouldAnnounceRegularPower({ ...announceBase, stamina: 22 })).toBe(true);
  });

  test('never for a boss — bosses keep their own telegraphs', () => {
    expect(shouldAnnounceRegularPower({ ...announceBase, isBoss: true })).toBe(false);
  });

  test('never for a quick attack — quick stays hidden', () => {
    expect(shouldAnnounceRegularPower({ ...announceBase, chosenAction: 'quick_attack' })).toBe(
      false,
    );
  });

  test('never while a telegraph is already live', () => {
    expect(shouldAnnounceRegularPower({ ...announceBase, pendingHeavy: true })).toBe(false);
  });

  test('never out of range — the ladder picks advance or taunt instead', () => {
    expect(shouldAnnounceRegularPower({ ...announceBase, inRange: false })).toBe(false);
  });

  test('never when the heavy is unaffordable', () => {
    expect(shouldAnnounceRegularPower({ ...announceBase, stamina: 21 })).toBe(false);
  });

  test('an opponent built without the boss field announces like a regular', () => {
    expect(shouldAnnounceRegularPower({ ...announceBase, isBoss: undefined })).toBe(true);
  });
});

// ── §2 — THE GLOW GATE ──────────────────────────────────────────────────────

describe('§2 — the mesh glows for an announced heavy, boss or regular', () => {
  test('a heavy_telegraph boss glows — the shipped behaviour', () => {
    expect(
      presentsTelegraphGlow({ isBoss: true, bossMechanic: 'heavy_telegraph' }),
    ).toBe(true);
  });

  test('a regular opponent glows — its announced power IS a telegraph', () => {
    expect(presentsTelegraphGlow({ isBoss: false, bossMechanic: undefined })).toBe(true);
    expect(presentsTelegraphGlow({ isBoss: undefined, bossMechanic: undefined })).toBe(true);
  });

  test('every other boss stays dark — the CF-6 gate is intact', () => {
    for (const mechanic of [
      'counter_dodge',
      'phase_weapon_switch',
      'rage_mode_colossus',
    ] as const) {
      expect(presentsTelegraphGlow({ isBoss: true, bossMechanic: mechanic })).toBe(false);
    }
    // A feature-bout boss (Varro's feint) owns no ladder moment and glows never.
    expect(presentsTelegraphGlow({ isBoss: true, bossMechanic: 'false_telegraph' })).toBe(
      false,
    );
    expect(presentsTelegraphGlow({ isBoss: true, bossMechanic: undefined })).toBe(false);
  });

  test('no opponent, no glow', () => {
    expect(presentsTelegraphGlow(null)).toBe(false);
    expect(presentsTelegraphGlow(undefined)).toBe(false);
  });

  test('the boss branch still runs through the boss gate', () => {
    // The moment entitlement is untouched: a standard opponent presents no
    // moment on any mechanic, so the glow's regular case is the predicate's
    // own branch, not a widened gate.
    expect(bossPresentsMoment({ isBoss: false }, 'heavy_telegraph')).toBe(false);
    expect(bossPresentsMoment({ isBoss: true, bossMechanic: 'heavy_telegraph' }, 'heavy_telegraph')).toBe(
      true,
    );
  });
});

// ── §3 — THE COACH MARK ─────────────────────────────────────────────────────

describe('§3 — D7 fires on the telegraph flag alone', () => {
  test('a regular’s telegraph teaches D7', () => {
    expect(evaluateBeats(fight({ isBoss: false }), {})).toBe('D7');
  });

  test('a boss’s telegraph still teaches D7', () => {
    expect(evaluateBeats(fight({ isBoss: true }), {})).toBe('D7');
  });

  test('no telegraph, no D7 — for either kind of opponent', () => {
    expect(evaluateBeats(fight({ isBoss: false, telegraph: false }), {})).toBeNull();
    expect(evaluateBeats(fight({ isBoss: true, telegraph: false }), {})).toBeNull();
  });

  test('the card’s text covers any opponent’s heavy, not bosses only', () => {
    const card = getCoachCard('D7');
    expect(card).toBeDefined();
    expect(card?.text).toContain("any opponent's heavy");
    expect(card?.text).toContain('Dodge');
  });
});

// ── §4 — THE DUEL WIRING ────────────────────────────────────────────────────

describe('§4 — the AI announces and resolves a regular’s power', () => {
  const duel = code('src/components/duel/DuelScene.tsx');

  test('the ladder’s chosen power is announced through the pure rule', () => {
    expect(duel).toContain('shouldAnnounceRegularPower({');
    // The announce sits after Varro’s branch and before the turn is dispatched:
    // a regular’s power is announced exactly where a boss’s is.
    const varro = duel.indexOf('falseTelegraphCfg &&');
    const announce = duel.indexOf('shouldAnnounceRegularPower({');
    const dispatch = duel.indexOf("executeCombatTurn('opponent', chosenAction);");
    expect(varro).toBeGreaterThan(-1);
    expect(announce).toBeGreaterThan(varro);
    expect(dispatch).toBeGreaterThan(announce);
    expect(duel.slice(announce, dispatch)).toContain("chosenAction = 'telegraph';");
  });

  test('the announced heavy resolves next turn through the power pipeline', () => {
    // The branch exists, after Goliath’s own resolution and before the chain:
    // a regular’s pending heavy is answered by the same power_attack call.
    const goliath = duel.indexOf(
      "if (opponent.bossMechanic === 'heavy_telegraph' && pendingHeavyAttackRef.current) {",
    );
    const regular = duel.indexOf(
      'if (opponent.isBoss !== true && pendingHeavyAttackRef.current) {',
    );
    expect(goliath).toBeGreaterThan(-1);
    expect(regular).toBeGreaterThan(goliath);
    const branch = duel.slice(regular, duel.indexOf('executeCombatTurn', regular) + 60);
    expect(branch).toContain('pendingHeavyAttackRef.current = false;');
    expect(branch).toContain('telegraphText: undefined');
    expect(branch).toContain('telegraphLandingRef.current = true;');
    expect(branch).toContain('telegraphAftermathRef.current = true;');
    expect(branch).toContain("executeCombatTurn('opponent', 'power_attack');");
  });

  test('the glow site reads the COMBAT-3 gate, not the boss gate alone', () => {
    expect(duel).toContain('presentsTelegraphGlow(opponent)');
    const glow = duel.indexOf('telegraphGlow={');
    expect(glow).toBeGreaterThan(-1);
    expect(duel.slice(glow, glow + 200)).toContain('presentsTelegraphGlow(opponent)');
  });

  test('one banner literal: regulars reuse the boss heavy’s line', () => {
    // COMBAT-5 rebased this count, not weakened it: the scene now READS the
    // banner text once more (the Sidestep button's enablement, which must
    // tell a real heavy from the counter wind-up and the beast crouch) — the
    // announce site is still the one writer of it, so regulars still reuse
    // the boss heavy's line and no second banner exists.
    expect((duel.match(/'HEAVY ATTACK INCOMING'/g) ?? []).length).toBe(2);
  });

  test('no boss branch was touched', () => {
    // Goliath’s rate gate, Varro’s announce and Valéria’s counter still read
    // exactly as they did — COMBAT-3 adds branches, it does not edit theirs.
    expect(duel).toContain(
      "if (opponent.bossMechanic === 'heavy_telegraph' && pendingHeavyAttackRef.current) {",
    );
    expect(duel).toContain("if (opponent.bossMechanic === 'false_telegraph' && pendingHeavyAttackRef.current) {");
    expect(duel).toContain("if (opponent.bossMechanic === 'counter_dodge' && pendingCounterRef.current) {");
    expect(duel).toContain('bossTelegraphChance(opponent, opp.health, opp.stats.healthMax)');
  });
});
