/**
 * AI affordability AT RESOLUTION (C-8.75F).
 *
 * C-8.75E added two halves of one rule: selection never offers a strike the
 * opponent cannot pay for (`chooseAITacticalAction`), and resolution refuses one
 * anyway (`canAffordAttack` inside `executeCombatTurn`). Its suite pins the
 * predicate, the selector and the ORDER of the guard's source lines — but it
 * never executes the guard, so it cannot show that a refused strike really
 * spends no stamina, deals no damage, schedules no turn timer and hands the turn
 * back.
 *
 * This suite executes the shipped resolution. There is no DOM renderer for
 * `<DuelScene/>` (no jsdom, no testing-library, and the component mounts a
 * three.js `<Canvas>`), so the component cannot be mounted. Instead the body of
 * the real `executeCombatTurn` callback — and of `announceEnemyAttack` — is read
 * out of `DuelScene.tsx` at test time and run against a deterministic harness
 * that supplies only the React primitives the body touches (`setPlayer`,
 * `setOpp`, `setIsExecuting`, `setIsPlayerTurn`, refs, a fake clock). Every
 * combat formula, the affordability predicate, the pending-strike bookkeeping
 * and the turn timer are the PRODUCTION modules, imported — not re-implemented.
 * A missing binding fails the test with a ReferenceError instead of silently
 * skipping a check, so the harness cannot drift into a vacuous pass.
 *
 * What this is: the shipped guard and attack branch executing the brief's
 * failure scenarios. What it is not: a mounted duel, a render, or a device read.
 *
 * Sections:
 *   §A the harness runs the real source (extraction, guard order, live bindings)
 *   §B the brief's failure cases: a refused strike costs nothing and hands back
 *   §C the paid control: an affordable strike still bills, lands and completes
 *   §D the announced-strike lifecycle end to end (production `pendingStrike`)
 *
 * Run with: bun test src/utils/phaseC8_75F.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  DODGE_STAMINA_COST,
  RAGE_DAMAGE_MULTIPLIER,
  applyComboEvent,
  applyStaminaRegen,
  calculateAttackDamage,
  calculateHitChance,
  getStaminaCost,
  isAttackInRange,
  shieldGuardStaminaGain,
} from './combatCalculations';
import { canAffordAttack } from './aiActionSelection';
import {
  isCounterDodgeOpponent,
  queuesCounterOnEvade,
  rollsPassiveEvade,
} from './counterDodge';
import { canResolveStrikeImpact } from './playerStrike';
import { createPendingStrike } from './pendingStrike';
import type { StrikeTimer } from './pendingStrike';
import { HAPTIC_HIT_LANDED_MS } from './haptics';
import { landedStrikeText } from './strikeFeedback';
import { getWeaponByType } from '../data/itemsDB';

const DUEL_SOURCE = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);

/**
 * The body of a `const NAME = useCallback(…)` callback, brace-matched while
 * skipping strings and comments (an apostrophe in a comment would otherwise
 * unbalance the scan). A missing callback fails loudly instead of testing
 * nothing.
 */
function callbackBody(marker: string): string {
  const start = DUEL_SOURCE.indexOf(marker);
  if (start < 0) throw new Error(`callback marker missing: ${marker}`);
  const arrow = DUEL_SOURCE.indexOf('=> {', start);
  if (arrow < 0) throw new Error(`callback arrow missing: ${marker}`);
  const open = DUEL_SOURCE.indexOf('{', arrow);

  let depth = 0;
  let quote: string | null = null;
  let lineComment = false;
  let blockComment = false;
  for (let i = open; i < DUEL_SOURCE.length; i++) {
    const char = DUEL_SOURCE[i];
    const next = DUEL_SOURCE[i + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        i++;
      }
      continue;
    }
    if (quote) {
      if (char === '\\') {
        i++;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      i++;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      i++;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return DUEL_SOURCE.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced callback body: ${marker}`);
}

/** A numeric/object literal declared at module scope in `DuelScene.tsx`. */
function localConst(name: string): Record<string, number> {
  const marker = `const ${name} = {`;
  const start = DUEL_SOURCE.indexOf(marker);
  if (start < 0) throw new Error(`module constant missing: ${name}`);
  const open = DUEL_SOURCE.indexOf('{', start);
  const close = DUEL_SOURCE.indexOf('}', open);
  return new Function(`return (${DUEL_SOURCE.slice(open, close + 1)});`)();
}

const RESOLVE_BODY = callbackBody('const executeCombatTurn = useCallback(');
const ANNOUNCE_BODY = callbackBody('const announceEnemyAttack = useCallback(');
const HIT_STOP_MS = localConst('HIT_STOP_MS');
const SHAKE_TRAUMA = localConst('SHAKE_TRAUMA');

/** The resolution body with `//` comments removed — ordering reads code, not prose. */
const RESOLVE_CODE = RESOLVE_BODY.split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');

const WEAPON = getWeaponByType('sword_shield');
const LIGHT = getStaminaCost(WEAPON, true);
const HEAVY = getStaminaCost(WEAPON, false);
const BETWEEN = Math.floor((LIGHT + HEAVY) / 2);

// ── The harness ────────────────────────────────────────────────────────────

interface ScheduledTask {
  at: number;
  run: () => void;
  cancelled: boolean;
}

interface HarnessOptions {
  /** The opponent's stamina when the turn is taken. */
  opponentStamina: number;
  /** The player's stamina. */
  playerStamina?: number;
  /** The opponent's boss mechanic (telegraph / counter wiring). */
  bossMechanic?: 'heavy_telegraph' | 'counter_dodge';
  /** Every `Math.random()` draw returns this value. */
  rng?: number;
}

/**
 * One duel's worth of the state `executeCombatTurn` closes over, with the SHIPPED
 * bodies of `executeCombatTurn` / `announceEnemyAttack` running against it.
 */
function createHarness(options: HarnessOptions) {
  const stats = () => ({
    healthMax: 120,
    staminaMax: 100,
    staminaRegen: 12,
    agility: 10,
    strength: 14,
    defense: 8,
  });

  // Positions 1.6 apart: inside the canonical weapon's 2.5 reach, so the RANGE
  // guard (which runs first) never decides these cases — only affordability does.
  const player: any = {
    id: 'player',
    name: 'Titus',
    position: [0, 0, 0.8],
    rotationY: Math.PI,
    health: 120,
    stamina: options.playerStamina ?? 100,
    action: 'idle',
    actionTimer: 0,
    isBlocking: false,
    isInvulnerable: false,
    hitFlashTimer: 0,
    stats: stats(),
    loadout: { weapon: WEAPON },
    comboCount: 0,
    isPlayer: true,
  };
  const opp: any = {
    id: 'opponent',
    name: 'Marcus',
    position: [0, 0, -0.8],
    rotationY: 0,
    health: 120,
    stamina: options.opponentStamina,
    action: 'idle',
    actionTimer: 0,
    isBlocking: false,
    isInvulnerable: false,
    hitFlashTimer: 0,
    stats: stats(),
    loadout: { weapon: WEAPON },
    comboCount: 0,
    isPlayer: false,
  };

  const logs: Array<{ text: string; type: string }> = [];
  const damageText: string[] = [];
  const turnCalls: boolean[] = [];
  const executingCalls: boolean[] = [];
  const tasks: ScheduledTask[] = [];
  let clock = 1_000;
  let rng = options.rng ?? 0.5;

  const state = {
    isExecuting: false,
    isPlayerTurn: true,
    resolving: false,
    crowdHype: 25,
    matchOver: false,
  };

  const schedule = (run: () => void, ms: number) => {
    tasks.push({ at: clock + ms, run, cancelled: false });
    return tasks.length;
  };

  // The production pending-strike bookkeeping, with an injected clock: the same
  // module, the same one-impact/one-reaction guarantees, no wall-clock wait.
  const strikeTimer: StrikeTimer = {
    set: (callback, ms) => schedule(callback, ms),
    clear: (handle) => {
      const task = tasks[handle - 1];
      if (task) task.cancelled = true;
    },
  };
  const strikeRef = { current: createPendingStrike({ timer: strikeTimer }) };
  const executeTurnRef: { current: (actor: string, action: string) => void } = {
    current: () => {},
  };

  const env: Record<string, unknown> = {
    // Production modules — the real formulas, predicate and helpers.
    DODGE_STAMINA_COST,
    RAGE_DAMAGE_MULTIPLIER,
    HAPTIC_HIT_LANDED_MS,
    HIT_STOP_MS,
    SHAKE_TRAUMA,
    applyComboEvent,
    applyStaminaRegen,
    calculateAttackDamage,
    calculateHitChance,
    getStaminaCost,
    isAttackInRange,
    shieldGuardStaminaGain,
    canAffordAttack,
    isCounterDodgeOpponent,
    queuesCounterOnEvade,
    rollsPassiveEvade,
    canResolveStrikeImpact,
    // C-8.82D — the landed-strike chronicle line is production copy, bound like
    // every other shipped helper (its default path is the unchanged wording).
    landedStrikeText,
    // Side effects the duel only renders or plays.
    sounds: new Proxy({}, { get: () => () => {} }),
    vibrate: () => {},
    addLog: (text: string, type = 'system') => logs.push({ text, type }),
    spawnDamageText: (text: string) => damageText.push(text),
    updateCrowdHype: (updater: (prev: number) => number) => {
      state.crowdHype = updater(state.crowdHype);
    },
    // Fighters: one object per fighter, mutated in place, so the body's closure
    // reads and `fightersRef.current` always agree — exactly as the component's.
    player,
    opp,
    opponent: { id: 'opponent', name: 'Marcus', bossMechanic: options.bossMechanic },
    fightersRef: { current: { player, opp } },
    get isExecuting() {
      return state.isExecuting;
    },
    isMatchOver: {
      get current() {
        return state.matchOver;
      },
      set current(value: boolean) {
        state.matchOver = value;
      },
    },
    resolvingRef: {
      get current() {
        return state.resolving;
      },
      set current(value: boolean) {
        state.resolving = value;
      },
    },
    impactRef: { current: { freezeUntil: 0, trauma: 0 } },
    telegraphLandingRef: { current: false },
    pendingHeavyAttackRef: { current: false },
    pendingCounterRef: { current: false },
    resolutionTimerRef: { current: null },
    playerStrikeRef: {
      current: {
        strike: (_action: string, impact: () => void) => {
          schedule(impact, 0);
          return true;
        },
        cancel: () => {},
      },
    },
    strikeRef,
    executeTurnRef,
    statsRef: {
      current: {
        damageDealt: 0,
        damageTaken: 0,
        hitsLanded: 0,
        perfectBlocks: 0,
        dodgesPerformed: 0,
        maxCombo: 0,
        crowdHypePeak: 25,
        durationSeconds: 0,
      },
    },
    setPlayer: (updater: (prev: unknown) => unknown) => {
      Object.assign(player, updater(player));
    },
    setOpp: (updater: (prev: unknown) => unknown) => {
      Object.assign(opp, updater(opp));
    },
    setIsExecuting: (value: boolean) => {
      state.isExecuting = value;
      executingCalls.push(value);
    },
    setIsPlayerTurn: (value: boolean) => {
      state.isPlayerTurn = value;
      turnCalls.push(value);
    },
    setPendingEnemyAttack: () => {},
    setReactionTaken: () => {},
    // Fake clock / RNG so the harness is deterministic.
    setTimeout: schedule,
    clearTimeout: (handle: number) => {
      const task = tasks[handle - 1];
      if (task) task.cancelled = true;
    },
    performance: { now: () => clock },
    Math: Object.assign(Object.create(Math), {
      random: () => rng,
    }),
  };

  const resolveTurn = new Function(
    'env',
    'actor',
    'actionType',
    `with (env) {${RESOLVE_BODY}}`,
  ) as (env: unknown, actor: string, action: string) => void;

  const announceTurn = new Function(
    'env',
    'actionType',
    `with (env) {${ANNOUNCE_BODY}}`,
  ) as (env: unknown, action: string) => void;

  executeTurnRef.current = (actor: string, action: string) => resolveTurn(env, actor, action);

  return {
    player,
    opp,
    logs,
    damageText,
    state,
    tasks,
    strikeRef,
    impactRef: env.impactRef as { current: { freezeUntil: number; trauma: number } },
    telegraphLandingRef: env.telegraphLandingRef as { current: boolean },
    setRng: (value: number) => {
      rng = value;
    },
    /** Run (and drop) every scheduled task due within `ms`, oldest first. */
    advance: (ms: number) => {
      const until = clock + ms;
      clock = until;
      for (let guard = 0; guard < 50; guard++) {
        const due = tasks
          .filter((task) => !task.cancelled && task.at <= until)
          .sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        due.cancelled = true;
        due.run();
      }
    },
    turn: (actor: 'player' | 'opponent', action: string) => resolveTurn(env, actor, action),
    announce: (action: string) => announceTurn(env, action),
    turnCalls,
    executingCalls,
  };
}

// ── §A. The harness is running the shipped source ──────────────────────────

describe('§A — the harness executes the production resolution, not a copy', () => {
  test('the resolution and announcement bodies are the shipped ones', () => {
    expect(RESOLVE_BODY.length).toBeGreaterThan(10_000);
    expect(ANNOUNCE_BODY.length).toBeGreaterThan(500);
    // The pieces whose behaviour this suite claims to cover really are inside
    // the executed text.
    expect(RESOLVE_CODE).toContain(
      'canAffordAttack(attackerNow.stamina, attackerNow.loadout.weapon, actionType)',
    );
    expect(RESOLVE_CODE).toContain('Math.max(0, prev.stamina - staminaCost)');
    expect(RESOLVE_CODE).toContain('isAttackInRange(gap, attackerNow.loadout.weapon)');
    expect(ANNOUNCE_BODY).toContain('strikeRef.current?.announce(actionType');
  });

  test('the affordability guard sits after the range guard and before the commit', () => {
    const range = RESOLVE_CODE.indexOf('isAttackInRange(gap, attackerNow.loadout.weapon)');
    const afford = RESOLVE_CODE.indexOf('canAffordAttack(attackerNow.stamina');
    const commit = RESOLVE_CODE.indexOf('resolvingRef.current = true');
    expect(range).toBeGreaterThan(-1);
    expect(afford).toBeGreaterThan(range);
    expect(commit).toBeGreaterThan(afford);
  });

  test('the executed turn reaches the guard with every binding resolved', () => {
    const harness = createHarness({ opponentStamina: 100 });
    expect(() => harness.turn('opponent', 'power_attack')).not.toThrow();
    // An affordable strike proves the harness is not refusing everything.
    expect(harness.opp.stamina).toBe(100 - HEAVY);
    expect(harness.player.health).toBeLessThan(120);
  });
});

// ── §B. The brief's failure cases, through the real guard ──────────────────

describe('§B — an unaffordable strike is refused before it costs anything', () => {
  test('enough stamina for a light attack, not for a power attack', () => {
    expect(BETWEEN).toBeGreaterThanOrEqual(LIGHT);
    expect(BETWEEN).toBeLessThan(HEAVY);

    const harness = createHarness({ opponentStamina: BETWEEN });
    harness.turn('opponent', 'power_attack');

    // No stamina was spent (and the balance cannot go negative).
    expect(harness.opp.stamina).toBe(BETWEEN);
    // No damage, no damage number of any kind — not even a MISSED.
    expect(harness.player.health).toBe(120);
    expect(harness.damageText).toEqual([]);
    // No swing animation, no turn timer, no committed resolution.
    expect(harness.opp.action).toBe('idle');
    expect(harness.tasks).toEqual([]);
    expect(harness.state.resolving).toBe(false);
    // The refusal is visible and hands the turn back to the player, exactly as
    // the range guard does — otherwise the HUD would stay locked.
    expect(harness.logs.map((entry) => entry.text)).toEqual([
      'Marcus is too winded to strike — the blow is lost.',
    ]);
    expect(harness.executingCalls).toEqual([false]);
    expect(harness.turnCalls).toEqual([true]);
    expect(harness.state.isExecuting).toBe(false);
    expect(harness.state.isPlayerTurn).toBe(true);
  });

  test('below the light-attack cost, neither strike resolves', () => {
    for (const action of ['quick_attack', 'power_attack'] as const) {
      const harness = createHarness({ opponentStamina: LIGHT - 1 });
      harness.turn('opponent', action);
      expect({ action, stamina: harness.opp.stamina }).toEqual({ action, stamina: LIGHT - 1 });
      expect({ action, health: harness.player.health }).toEqual({ action, health: 120 });
      expect({ action, timers: harness.tasks.length }).toEqual({ action, timers: 0 });
      expect({ action, turn: harness.state.isPlayerTurn }).toEqual({ action, turn: true });
      expect({ action, resolving: harness.state.resolving }).toEqual({ action, resolving: false });
    }
  });

  test('exactly the light cost: the power attack is refused, the light one pays', () => {
    const refused = createHarness({ opponentStamina: LIGHT });
    refused.turn('opponent', 'power_attack');
    expect(refused.opp.stamina).toBe(LIGHT);
    expect(refused.player.health).toBe(120);
    expect(refused.tasks).toEqual([]);

    const paid = createHarness({ opponentStamina: LIGHT });
    paid.turn('opponent', 'quick_attack');
    expect(paid.opp.stamina).toBe(0);
    expect(paid.tasks.length).toBe(1);
  });

  test('a malformed or empty stamina balance refuses instead of paying', () => {
    for (const stamina of [0, -5, Number.NaN]) {
      const harness = createHarness({ opponentStamina: stamina });
      harness.turn('opponent', 'quick_attack');
      expect({ stamina, after: harness.opp.stamina }).toEqual({ stamina, after: stamina });
      expect({ stamina, health: harness.player.health }).toEqual({ stamina, health: 120 });
      expect({ stamina, timers: harness.tasks.length }).toEqual({ stamina, timers: 0 });
    }
  });

  test('the player is held to the same rule when a direct call arrives', () => {
    const harness = createHarness({ opponentStamina: 100, playerStamina: LIGHT - 1 });
    harness.turn('player', 'power_attack');
    expect(harness.player.stamina).toBe(LIGHT - 1);
    expect(harness.opp.health).toBe(120);
    expect(harness.tasks).toEqual([]);
    expect(harness.state.resolving).toBe(false);
  });

  test('a refused telegraphed landing consumes the marker and adds no hit-stop', () => {
    const harness = createHarness({ opponentStamina: BETWEEN, bossMechanic: 'heavy_telegraph' });
    harness.telegraphLandingRef.current = true;
    harness.turn('opponent', 'power_attack');

    expect(harness.telegraphLandingRef.current).toBe(false);
    expect(harness.impactRef.current.freezeUntil).toBe(0);
    expect(harness.impactRef.current.trauma).toBe(0);
    expect(harness.player.health).toBe(120);
  });

  test('a refused strike does not lock the duel: the paid action still resolves', () => {
    const harness = createHarness({ opponentStamina: LIGHT });

    harness.turn('opponent', 'power_attack');
    expect(harness.state.isPlayerTurn).toBe(true);
    expect(harness.state.isExecuting).toBe(false);

    // The same turn, one affordability step lower: now the light strike.
    harness.turn('opponent', 'quick_attack');
    expect(harness.opp.stamina).toBe(0);
    expect(harness.player.health).toBeLessThan(120);
    expect(harness.tasks.length).toBe(1);
  });
});

// ── §C. The paid control, and the turn's completion ────────────────────────

describe('§C — an affordable strike still bills, lands and ends its turn', () => {
  test('the power attack is billed at its own cost, exactly once', () => {
    const harness = createHarness({ opponentStamina: 100 });
    harness.turn('opponent', 'power_attack');

    expect(harness.opp.stamina).toBe(100 - HEAVY);
    expect(harness.opp.action).toBe('attack_heavy');
    expect(harness.player.health).toBeLessThan(120);
    // A landed blow takes its hit-stop; nothing else scheduled a timer.
    expect(harness.impactRef.current.freezeUntil).toBeGreaterThan(0);
    expect(harness.state.resolving).toBe(true);
    expect(harness.state.isExecuting).toBe(true);
    expect(harness.tasks.length).toBe(1);
  });

  test('flushing the 1100 ms turn timer completes the turn and releases the lock', () => {
    const harness = createHarness({ opponentStamina: 100 });
    harness.turn('opponent', 'power_attack');
    harness.advance(1_100);

    expect(harness.state.isExecuting).toBe(false);
    expect(harness.state.resolving).toBe(false);
    // The opponent acted, so the turn passes to the player.
    expect(harness.state.isPlayerTurn).toBe(true);
    expect(harness.turnCalls).toContain(true);
  });

  test('a miss still costs the strike: stamina is paid at the commit, not at the hit', () => {
    const harness = createHarness({ opponentStamina: 100, rng: 0.999 });
    harness.turn('opponent', 'quick_attack');

    expect(harness.opp.stamina).toBe(100 - LIGHT);
    // A miss costs stamina and deals nothing — the paid-strike rule, unchanged.
    expect(harness.damageText.join(' ')).toContain('MISSED');
    expect(harness.tasks.length).toBe(1);
  });
});

// ── §D. The announced-strike lifecycle ────────────────────────────────────

describe('§D — the announced strike lands through the same guard', () => {
  test('a power attack announced while short is refused at impact and leaves no lock', () => {
    const harness = createHarness({ opponentStamina: BETWEEN });

    harness.announce('power_attack');
    expect(harness.strikeRef.current.pending).toBe('power_attack');
    expect(harness.state.isExecuting).toBe(true);

    harness.advance(1_000);

    // The wind-up fired, the resolution refused the blow, and the strike is gone.
    expect(harness.strikeRef.current.pending).toBeNull();
    expect(harness.opp.stamina).toBe(BETWEEN);
    expect(harness.player.health).toBe(120);
    expect(harness.state.isExecuting).toBe(false);
    expect(harness.state.isPlayerTurn).toBe(true);
    expect(harness.logs.some((entry) => entry.text.includes('too winded to strike'))).toBe(true);

    // The duel continues: the light strike is announced and paid as normal.
    harness.announce('quick_attack');
    harness.advance(1_000);
    expect(harness.opp.stamina).toBe(BETWEEN - LIGHT);
    expect(harness.player.health).toBeLessThan(120);
    expect(harness.state.resolving).toBe(true);
  });
});
