/**
 * The player's strike anticipation window (C-8.71B).
 *
 * The wind-up's guarantees are timing and bookkeeping, so they are driven on a
 * CONTROLLED clock (`fakeTimer`, the `pendingStrike.test.ts` idiom) rather than
 * on a wall clock: no test sleeps, nothing is timing-sensitive, and a stale
 * callback can be fired on purpose instead of hoped for. The impact rule is a
 * pure function, so it is table-driven. The wiring is asserted against the
 * shipped `DuelScene` source, anchored on CODE markers only, because this repo
 * has no DOM renderer to mount the scene under.
 *
 * Covered:
 *   §A the window — nothing resolves before PLAYER_ATTACK_WINDUP_MS, exactly once at it
 *   §B at-most-once and cancellation — a second swing is refused, cancel wins, stale callbacks are inert
 *   §B2 stale-callback ownership (C-8.71D) — cancel A, start B, fire A's queued callback: the audit's
 *       own ordering, shown to leave B pending, cancellable and exactly-once
 *   §C the impact rule — no damage before the wind-up, none to a dead/absent/out-of-reach target
 *   §D the wiring — commit → wind-up → impact → the ONE turn-end timer, and every cancel path
 *   §E scope — no formula, cost, timer or turn rule moved
 *
 * Run with: bun test src/utils/playerStrikeWindup.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { createPlayerStrike, canResolveStrikeImpact } from './playerStrike';
import type { PlayerStrikeTimer } from './playerStrike';
import {
  PLAYER_ATTACK_WINDUP_MS,
  ENEMY_ATTACK_WINDUP_MS,
  getStaminaCost,
  DODGE_STAMINA_COST,
  DEFENSE_MITIGATION_FACTOR,
  CRIT_MULTIPLIER,
  STRENGTH_BONUS_PER_POINT,
} from './combatCalculations';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';
import type { WeaponItem } from '../types/game';

const duelSource = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);

/** A clock the test advances by hand. Callbacks are fireable even once cleared. */
function fakeTimer() {
  let now = 0;
  let nextId = 1;
  const scheduled = new Map<number, { at: number; run: () => void }>();
  const callbacks = new Map<number, () => void>();

  const timer: PlayerStrikeTimer = {
    set(callback, ms) {
      const id = nextId++;
      scheduled.set(id, { at: now + ms, run: callback });
      callbacks.set(id, callback);
      return id;
    },
    clear(handle) {
      scheduled.delete(handle);
    },
  };

  return {
    timer,
    dueIn(): number | null {
      const times = [...scheduled.values()].map((job) => job.at);
      return times.length ? Math.min(...times) - now : null;
    },
    advance(ms: number) {
      now += ms;
      for (const [id, job] of [...scheduled]) {
        if (job.at <= now) {
          scheduled.delete(id);
          job.run();
        }
      }
    },
    fireStale(handle: number) {
      callbacks.get(handle)?.();
    },
    /** The handle of the most recently scheduled callback (C-8.71D). */
    lastHandle(): number {
      return nextId - 1;
    },
    get live() {
      return scheduled.size;
    },
  };
}

/** Index of a marker that must exist, reported by name when it does not. */
function at(source: string, marker: string): number {
  const index = source.indexOf(marker);
  expect({ marker, found: index >= 0 }).toEqual({ marker, found: true });
  return index;
}

/** The slice between two markers, both required. */
function between(source: string, start: string, end: string): string {
  const from = at(source, start);
  const to = at(source, end);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

const QUICK = 'quick_attack' as const;
const POWER = 'power_attack' as const;

const attackBranchStart = "else if (actionType === 'quick_attack' || actionType === 'power_attack') {";
const turnTimerMarker = '// 4. ANIMATION RESOLUTION & TURN TRANSITION (1100ms)';
const impactMarker = 'const resolveImpact = () => {';
const dispatchMarker = 'if (playerStrikeRef.current?.strike(actionType, resolveImpact)) {';

/** A weapon stub: every rule here reads only `range`. */
const weaponAt = (range: number) => ({ range } as WeaponItem);
const gladius = DEFAULT_PLAYER_WEAPON as WeaponItem;

// ── §A. The window ─────────────────────────────────────────────────────────

describe('§A — the player\'s blow lands only at the end of its wind-up', () => {
  test('nothing resolves before the wind-up has elapsed', () => {
    const clock = fakeTimer();
    const strike = createPlayerStrike({ timer: clock.timer });
    const impacts: string[] = [];

    strike.strike(QUICK, (action) => impacts.push(action));
    expect(strike.pending).toBe(QUICK);

    clock.advance(PLAYER_ATTACK_WINDUP_MS - 1);
    expect(impacts).toEqual([]);
    expect(strike.pending).toBe(QUICK);

    clock.advance(1);
    expect(impacts).toEqual([QUICK]);
    expect(strike.pending).toBeNull();
  });

  test('exactly one resolution follows the completion', () => {
    const clock = fakeTimer();
    const strike = createPlayerStrike({ timer: clock.timer });
    let impacts = 0;

    strike.strike(POWER, () => { impacts += 1; });
    clock.advance(PLAYER_ATTACK_WINDUP_MS);
    expect(impacts).toBe(1);

    // Further clock movement resolves nothing: the strike is spent.
    clock.advance(5000);
    expect(impacts).toBe(1);
    expect(clock.live).toBe(0);
  });

  test('the window is one explicit duration inside the 600–800 ms band', () => {
    expect(PLAYER_ATTACK_WINDUP_MS).toBe(700);
    expect(PLAYER_ATTACK_WINDUP_MS).toBeGreaterThanOrEqual(600);
    expect(PLAYER_ATTACK_WINDUP_MS).toBeLessThanOrEqual(800);
    // Matched to the enemy's audited wind-up, so both sides anticipate alike.
    expect(PLAYER_ATTACK_WINDUP_MS).toBe(ENEMY_ATTACK_WINDUP_MS);

    const clock = fakeTimer();
    const strike = createPlayerStrike({ timer: clock.timer });
    strike.strike(QUICK, () => {});
    expect(clock.dueIn()).toBe(700);
  });

  test('the window sits inside the 1100 ms turn window, so the blow precedes the turn', () => {
    expect(PLAYER_ATTACK_WINDUP_MS).toBeLessThan(1100);
    expect(at(duelSource, turnTimerMarker)).toBeGreaterThan(at(duelSource, dispatchMarker));
    expect(duelSource).toContain('}, 1100);');
  });

  test('an injected window is honoured', () => {
    const clock = fakeTimer();
    const strike = createPlayerStrike({ timer: clock.timer, windupMs: 250 });
    let impacts = 0;

    strike.strike(QUICK, () => { impacts += 1; });
    clock.advance(249);
    expect(impacts).toBe(0);
    clock.advance(1);
    expect(impacts).toBe(1);
  });

  test('the impact carries the committed action', () => {
    const clock = fakeTimer();
    const strike = createPlayerStrike({ timer: clock.timer });
    const impacts: string[] = [];

    strike.strike(POWER, (action) => impacts.push(action));
    clock.advance(PLAYER_ATTACK_WINDUP_MS);
    expect(impacts).toEqual([POWER]);
  });
});

// ── §B. Duplicate input and cancellation ───────────────────────────────────

describe('§B — one swing at a time, and a cancel always wins', () => {
  test('a second strike while one is pending is refused, so input cannot queue one', () => {
    const clock = fakeTimer();
    const strike = createPlayerStrike({ timer: clock.timer });
    const impacts: string[] = [];

    expect(strike.strike(QUICK, (action) => impacts.push(action))).toBe(true);
    expect(strike.strike(POWER, (action) => impacts.push(action))).toBe(false);
    expect(clock.live).toBe(1);

    clock.advance(PLAYER_ATTACK_WINDUP_MS);
    expect(impacts).toEqual([QUICK]);
  });

  test('cancel before impact drops the swing and reports what it dropped', () => {
    const clock = fakeTimer();
    const strike = createPlayerStrike({ timer: clock.timer });
    let impacts = 0;

    strike.strike(POWER, () => { impacts += 1; });
    expect(strike.cancel()).toBe(true);
    expect(strike.pending).toBeNull();

    clock.advance(PLAYER_ATTACK_WINDUP_MS);
    expect(impacts).toBe(0);
    expect(strike.cancel()).toBe(false);
  });

  test('a callback that fires AFTER a cancel is inert', () => {
    const clock = fakeTimer();
    const strike = createPlayerStrike({ timer: clock.timer });
    let impacts = 0;

    strike.strike(QUICK, () => { impacts += 1; });
    strike.cancel();
    clock.fireStale(1);

    expect(impacts).toBe(0);
    expect(strike.pending).toBeNull();
  });

  test('a callback that fires twice resolves the swing once', () => {
    const clock = fakeTimer();
    const strike = createPlayerStrike({ timer: clock.timer });
    let impacts = 0;

    strike.strike(QUICK, () => { impacts += 1; });
    clock.fireStale(1);
    clock.fireStale(1);
    expect(impacts).toBe(1);
  });

  test('a cancelled swing lets the NEXT one land, exactly once', () => {
    const clock = fakeTimer();
    const strike = createPlayerStrike({ timer: clock.timer });
    const impacts: string[] = [];

    strike.strike(QUICK, (action) => impacts.push(action));
    clock.advance(PLAYER_ATTACK_WINDUP_MS / 2);
    strike.cancel();
    expect(clock.live).toBe(0);

    strike.strike(POWER, (action) => impacts.push(action));
    clock.advance(PLAYER_ATTACK_WINDUP_MS);
    expect(impacts).toEqual([POWER]);
    expect(clock.live).toBe(0);
  });

  test('a refused strike leaks no timer', () => {
    const clock = fakeTimer();
    const strike = createPlayerStrike({ timer: clock.timer });

    strike.strike(QUICK, () => {});
    strike.strike(POWER, () => {});
    expect(clock.live).toBe(1);

    strike.cancel();
    expect(clock.live).toBe(0);
  });
});

// ── §B2. Stale-callback ownership (C-8.71D) ────────────────────────────────

/**
 * The hazard the C-8.71C audit reproduced, driven in its own order: a strike is
 * cancelled, a NEWER strike takes the controller, and only then does the
 * cancelled strike's already-queued callback fire. Before the ownership token it
 * read the newer strike's shared pending action, invoked the OLD closure with it
 * and cleared the newer strike's state — orphaning its timer, so `cancel()` could
 * no longer reach it either.
 */
describe('§B2 — a cancelled strike\'s queued callback cannot act on its successor', () => {
  test('the audit sequence: cancel A, start B, then fire A\'s stale callback', () => {
    const clock = fakeTimer();
    const strike = createPlayerStrike({ timer: clock.timer });
    const impacts: string[] = [];

    strike.strike(QUICK, (action) => impacts.push(`A:${action}`));
    const handleA = clock.lastHandle();
    expect(strike.cancel()).toBe(true);

    strike.strike(POWER, (action) => impacts.push(`B:${action}`));
    const handleB = clock.lastHandle();
    expect(handleB).toBeGreaterThan(handleA);
    expect(strike.pending).toBe(POWER);
    expect(clock.live).toBe(1);

    // A's callback, deliberately fired after its cancel and B's commit.
    clock.fireStale(handleA);

    // A's closure never runs — not with B's action, not with anything.
    expect(impacts).toEqual([]);
    // B's pending state is intact rather than cleared by A.
    expect(strike.pending).toBe(POWER);
    // B's timer was not nulled out from under it.
    expect(clock.live).toBe(1);

    // …and B still lands, exactly once, at its own deadline.
    clock.advance(PLAYER_ATTACK_WINDUP_MS);
    expect(impacts).toEqual(['B:power_attack']);
    expect(strike.pending).toBeNull();
    expect(clock.live).toBe(0);
  });

  test('B resolves exactly once when its own callback follows the stale one', () => {
    const clock = fakeTimer();
    const strike = createPlayerStrike({ timer: clock.timer });
    const impacts: string[] = [];

    strike.strike(QUICK, (action) => impacts.push(`A:${action}`));
    const handleA = clock.lastHandle();
    strike.cancel();
    strike.strike(POWER, (action) => impacts.push(`B:${action}`));
    const handleB = clock.lastHandle();

    clock.fireStale(handleA);
    clock.fireStale(handleB);
    clock.fireStale(handleB);

    expect(impacts).toEqual(['B:power_attack']);
    expect(strike.pending).toBeNull();
  });

  test('cancelling B after A\'s stale callback still cancels B\'s timer', () => {
    const clock = fakeTimer();
    const strike = createPlayerStrike({ timer: clock.timer });
    const impacts: string[] = [];

    strike.strike(QUICK, (action) => impacts.push(`A:${action}`));
    const handleA = clock.lastHandle();
    strike.cancel();
    strike.strike(POWER, (action) => impacts.push(`B:${action}`));

    clock.fireStale(handleA);
    // The handle A's callback used to null is still B's, so cancel reaches the timer.
    expect(strike.cancel()).toBe(true);
    expect(clock.live).toBe(0);

    clock.advance(PLAYER_ATTACK_WINDUP_MS);
    expect(impacts).toEqual([]);
    expect(strike.pending).toBeNull();
  });

  test('repeated cancellation and repeated delivery stay harmless', () => {
    const clock = fakeTimer();
    const strike = createPlayerStrike({ timer: clock.timer });
    const impacts: string[] = [];

    strike.strike(QUICK, (action) => impacts.push(`A:${action}`));
    const handleA = clock.lastHandle();
    expect(strike.cancel()).toBe(true);
    expect(strike.cancel()).toBe(false);
    expect(strike.cancel()).toBe(false);
    clock.fireStale(handleA);
    clock.fireStale(handleA);

    strike.strike(POWER, (action) => impacts.push(`B:${action}`));
    const handleB = clock.lastHandle();
    clock.fireStale(handleB);
    clock.fireStale(handleB);
    expect(strike.cancel()).toBe(false);
    clock.fireStale(handleB);

    // A new swing after all that is unaffected and lands exactly once.
    expect(strike.strike(QUICK, (action) => impacts.push(`C:${action}`))).toBe(true);
    clock.advance(PLAYER_ATTACK_WINDUP_MS);

    expect(impacts).toEqual(['B:power_attack', 'C:quick_attack']);
    expect(strike.pending).toBeNull();
    expect(clock.live).toBe(0);
  });

  test('a spent callback delivered again cannot resolve a LATER strike', () => {
    const clock = fakeTimer();
    const strike = createPlayerStrike({ timer: clock.timer });
    const impacts: string[] = [];

    strike.strike(QUICK, (action) => impacts.push(`A:${action}`));
    const handleA = clock.lastHandle();
    clock.advance(PLAYER_ATTACK_WINDUP_MS);
    expect(impacts).toEqual(['A:quick_attack']);

    // A resolved normally; delivering its callback again must not land B.
    strike.strike(POWER, (action) => impacts.push(`B:${action}`));
    clock.fireStale(handleA);

    expect(impacts).toEqual(['A:quick_attack']);
    expect(strike.pending).toBe(POWER);
    expect(clock.live).toBe(1);
  });
});

// ── §C. The impact rule ────────────────────────────────────────────────────

describe('§C — a committed strike resolves nothing against an invalid target', () => {
  const base = {
    isMatchOver: false,
    attackerHealth: 100,
    defenderHealth: 100,
    distance: 2.0,
    weapon: gladius,
  };

  test('a live fight, both fighters up, in reach: it resolves', () => {
    expect(canResolveStrikeImpact(base)).toBe(true);
    // The border is legal, exactly as the shared range rule says.
    expect(canResolveStrikeImpact({ ...base, distance: gladius.range })).toBe(true);
  });

  test('a decided fight resolves nothing', () => {
    expect(canResolveStrikeImpact({ ...base, isMatchOver: true })).toBe(false);
  });

  test('a downed target resolves nothing — no stale damage', () => {
    expect(canResolveStrikeImpact({ ...base, defenderHealth: 0 })).toBe(false);
    expect(canResolveStrikeImpact({ ...base, defenderHealth: -4 })).toBe(false);
    expect(canResolveStrikeImpact({ ...base, defenderHealth: Number.NaN })).toBe(false);
  });

  test('a downed attacker resolves nothing either', () => {
    expect(canResolveStrikeImpact({ ...base, attackerHealth: 0 })).toBe(false);
    expect(canResolveStrikeImpact({ ...base, attackerHealth: Number.NaN })).toBe(false);
  });

  test('a target out of reach resolves nothing, and so does a distance that cannot be read', () => {
    expect(canResolveStrikeImpact({ ...base, distance: gladius.range + 0.0001 })).toBe(false);
    expect(canResolveStrikeImpact({ ...base, distance: 9 })).toBe(false);
    expect(canResolveStrikeImpact({ ...base, distance: Number.NaN })).toBe(false);
    expect(canResolveStrikeImpact({ ...base, distance: Number.POSITIVE_INFINITY })).toBe(false);
    expect(canResolveStrikeImpact({ ...base, weapon: weaponAt(Number.NaN) })).toBe(false);
  });

  test('the reach is the fighter\'s own weapon, not a screen-wide constant', () => {
    const spear = weaponAt(3.8);
    expect(canResolveStrikeImpact({ ...base, distance: 3.5, weapon: spear })).toBe(true);
    expect(canResolveStrikeImpact({ ...base, distance: 3.5, weapon: gladius })).toBe(false);
  });
});

// ── §D. The wiring ─────────────────────────────────────────────────────────

describe('§D — commit, wind-up, impact, and the single turn-end timer', () => {
  const attackBranch = between(duelSource, attackBranchStart, turnTimerMarker);

  test('the commit starts the swing and spends the cost before any blow is resolved', () => {
    const animation = at(attackBranch, "action: isQuick ? 'attack_light' : 'attack_heavy'");
    const damage = at(attackBranch, 'calculateAttackDamage(');
    const dispatch = at(attackBranch, dispatchMarker);
    expect(animation).toBeLessThan(damage);
    // The cost is the shared helper's, spent once per actor, and never refunded.
    expect(attackBranch.split('stamina: Math.max(0, prev.stamina - staminaCost)').length - 1).toBe(2);
    expect(attackBranch).toContain('getStaminaCost(attacker.loadout.weapon, isQuick)');
    expect(attackBranch).not.toContain('prev.stamina + staminaCost');
    expect(dispatch).toBeGreaterThan(-1);
  });

  test('the player schedules the impact; only the opponent resolves inline', () => {
    const playerSide = between(
      duelSource,
      'if (isActorPlayer) {\n          if (playerStrikeRef.current?.strike(',
      '} else {\n          // The AI\'s strike resolves through the same block',
    );
    expect(playerSide).toContain('strike(actionType, resolveImpact)');
    // The player's branch never calls the impact itself.
    expect(playerSide).not.toContain('resolveImpact();');
    // …and exactly one path resolves on the spot: the opponent's.
    expect(duelSource.split('resolveImpact();').length - 1).toBe(1);
    // resolveImpact is defined once and referenced by those two call sites.
    expect(duelSource.split('resolveImpact').length - 1).toBe(3);
  });

  test('the impact validates the fight before it rolls anything', () => {
    const impact = between(duelSource, impactMarker, dispatchMarker);
    const check = at(impact, 'canResolveStrikeImpact({');
    const hit = at(impact, 'const hitPct = calculateHitChance(');
    const damage = at(impact, 'calculateAttackDamage(');
    const random = at(impact, 'Math.random()');

    expect(check).toBeLessThan(hit);
    expect(check).toBeLessThan(damage);
    expect(check).toBeLessThan(random);
    // It reads the LIVE fighters and the resolution latch, not the commit closure.
    expect(impact).toContain('const live = fightersRef.current;');
    expect(impact).toContain('isMatchOver: isMatchOver.current');
    expect(impact).toContain('distance: gapNow');
    // A refused impact returns before the roll; the turn timer below still runs.
    const refusal = between(impact, 'if (', '// Check Evasion / Hit Probability');
    expect(refusal).toContain('return;');
    expect(refusal).not.toContain('calculateHitChance(');
  });

  test('the turn is still advanced exactly once, by the unchanged 1100 ms timer', () => {
    expect(duelSource.split('setIsPlayerTurn(').length - 1).toBe(2);
    expect(duelSource).toContain('setIsPlayerTurn(!isActorPlayer);');
    expect(duelSource).toContain('}, 1100);');
    // The opponent cannot answer before the impact: the AI effect is gated on the
    // turn and on the resolution lock, both of which outlive the wind-up.
    expect(duelSource).toContain('if (isPlayerTurn || isExecuting || isMatchOver.current || opp.health <= 0) return;');
    expect(at(duelSource, dispatchMarker)).toBeLessThan(at(duelSource, 'setIsPlayerTurn(!isActorPlayer);'));
  });

  test('every cancellation path releases the pending swing', () => {
    // Unmount (leaving the arena, the HUD's Armory shortcut), the turn's own end,
    // and both end-of-fight paths.
    expect(duelSource.split('playerStrikeRef.current?.cancel();').length - 1).toBe(4);
    const unmount = duelSource.slice(at(duelSource, '// No blow may outlive the scene'));
    expect(unmount.slice(0, 1400)).toContain('playerStrikeRef.current?.cancel();');
    // The player's own controller is created exactly once per mount.
    expect(duelSource.split('createPlayerStrike()').length - 1).toBe(1);
  });

  test('the wind-up is announced to the player, and it is the player\'s own strike', () => {
    expect(duelSource).toContain("`${attacker.name} winds up a ${isQuick ? 'quick strike' : 'power slash'}…`");
    // The controller is only ever driven by the player's own commit.
    const playerSide = between(duelSource, dispatchMarker, "} else {\n          // The AI's strike");
    expect(playerSide).not.toContain("'opponent'");
  });
});

// ── §E. Scope ──────────────────────────────────────────────────────────────

describe('§E — no combat value, cost or formula moved with the timing', () => {
  test('the audited constants are untouched', () => {
    expect(ENEMY_ATTACK_WINDUP_MS).toBe(700);
    expect(DODGE_STAMINA_COST).toBe(12);
    expect(DEFENSE_MITIGATION_FACTOR).toBe(2.5);
    expect(CRIT_MULTIPLIER).toBe(1.5);
    expect(STRENGTH_BONUS_PER_POINT).toBe(0.05);
    expect(getStaminaCost(gladius, true)).toBe(gladius.staminaLight);
    expect(getStaminaCost(gladius, false)).toBe(gladius.staminaHeavy);
  });

  test('the range guard and its refusal are exactly as C-8.71A left them', () => {
    const guard = at(duelSource, "if (!isAttackInRange(gap, attackerNow.loadout.weapon)) {");
    const commit = at(duelSource, 'resolvingRef.current = true;');
    const stamina = at(duelSource, 'const staminaCost = getStaminaCost(');
    expect(guard).toBeLessThan(commit);
    expect(guard).toBeLessThan(stamina);
    const refusal = between(duelSource, "if (!isAttackInRange(gap, attackerNow.loadout.weapon)) {", 'resolvingRef.current = true;');
    expect(refusal).not.toContain('stamina');
    expect(refusal).toContain('return;');
    expect(refusal).toContain('is out of range — Advance before striking.');
  });

  test('the wind-up introduces no second damage formula and no per-weapon timing', () => {
    // One damage roll, one hit roll, one stamina spend per actor — all in the
    // block the wind-up simply defers.
    expect(duelSource.split('calculateAttackDamage(').length - 1).toBe(1);
    expect(duelSource.split('calculateHitChance(').length - 1).toBe(1);
    expect(duelSource).not.toContain('speed * PLAYER_ATTACK_WINDUP_MS');
    expect(duelSource).not.toContain('windupTimerRef');
    expect(duelSource).not.toContain('pendingPlayerStrike');
  });
});
