/**
 * The player's wind-up cue (C-8.73B).
 *
 * The cue must be a READ of the strike controller, not a lifecycle of its own,
 * so it is driven here on the same CONTROLLED clock the C-8.71B/D suites use
 * (`playerStrikeWindup.test.ts`'s `fakeTimer` idiom): the controller reports
 * every pending transition, the test advances the clock by hand, and a stale
 * callback is fired on purpose instead of hoped for. The pure ownership rule is
 * table-driven; the wiring is pinned against the shipped sources, anchored on
 * code markers, because this repo has no DOM renderer to mount the scene under.
 *
 * Covered:
 *   §A the rule — a cue only for a genuinely pending player strike, and never
 *       alongside an opponent announcement
 *   §B the lifecycle — commit → impact → every cancellation, no stale cue after
 *       a cancel followed by a new strike, and nothing for a refused action
 *   §C the wiring — the scene mirrors the controller and the HUD renders it
 *   §D scope — no timing, formula or existing cue moved
 *
 * Run with: bun test src/utils/playerWindupCue.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  createPlayerStrike,
  resolvePlayerWindupCue,
  type PlayerStrikeAction,
  type PlayerStrikeTimer,
} from './playerStrike';
import { PLAYER_ATTACK_WINDUP_MS, ENEMY_ATTACK_WINDUP_MS } from './combatCalculations';

const duelSource = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);
const hudSource = readFileSync(
  new URL('../components/ui/CombatHUD.tsx', import.meta.url),
  'utf8',
);

const QUICK: PlayerStrikeAction = 'quick_attack';
const POWER: PlayerStrikeAction = 'power_attack';

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
    lastHandle(): number {
      return nextId - 1;
    },
    get live() {
      return scheduled.size;
    },
  };
}

/** A controller whose every pending transition is recorded. */
function cuedController() {
  const clock = fakeTimer();
  const cue: Array<PlayerStrikeAction | null> = [];
  const strikes = createPlayerStrike({
    timer: clock.timer,
    onPendingChange: (pending) => cue.push(pending),
  });
  return { clock, cue, strikes, impacts: [] as PlayerStrikeAction[] };
}

// ── §A. The ownership rule ─────────────────────────────────────────────────

describe('§A — a cue exists only for a genuinely pending player strike', () => {
  test('nothing pending is no cue at all', () => {
    expect(resolvePlayerWindupCue(null, null)).toBeNull();
    expect(resolvePlayerWindupCue(null, QUICK)).toBeNull();
    expect(resolvePlayerWindupCue(null, POWER)).toBeNull();
  });

  test('a pending light strike is the player\'s quick strike', () => {
    expect(resolvePlayerWindupCue(QUICK, null)).toEqual({
      action: 'quick_attack',
      label: 'Your quick strike',
    });
  });

  test('a pending heavy strike is the player\'s power slash', () => {
    expect(resolvePlayerWindupCue(POWER, null)).toEqual({
      action: 'power_attack',
      label: 'Your power slash',
    });
  });

  test('the two attack types read differently, and neither reads as incoming', () => {
    const light = resolvePlayerWindupCue(QUICK, null)!;
    const heavy = resolvePlayerWindupCue(POWER, null)!;
    expect(light.action).not.toBe(heavy.action);
    expect(light.label).not.toBe(heavy.label);
    // The opponent's banner says "…incoming"; the player's own cue must not.
    for (const label of [light.label, heavy.label]) {
      expect(label.toLowerCase()).not.toContain('incoming');
      expect(label.toLowerCase()).toContain('your');
    }
  });

  test('an opponent announcement owns the cue, whichever type it is', () => {
    expect(resolvePlayerWindupCue(QUICK, QUICK)).toBeNull();
    expect(resolvePlayerWindupCue(QUICK, POWER)).toBeNull();
    expect(resolvePlayerWindupCue(POWER, QUICK)).toBeNull();
    expect(resolvePlayerWindupCue(POWER, POWER)).toBeNull();
  });

  test('the rule is total — it never throws on the values the scene can hold', () => {
    for (const player of [null, QUICK, POWER]) {
      for (const enemy of [null, QUICK, POWER]) {
        const cue = resolvePlayerWindupCue(player, enemy);
        if (enemy !== null || player === null) expect(cue).toBeNull();
        else expect(cue?.action).toBe(player);
      }
    }
  });
});

// ── §B. The lifecycle, driven on a controlled clock ────────────────────────

describe('§B — the cue lives exactly as long as the pending strike', () => {
  test('a light strike raises the cue, and only for its wind-up', () => {
    const { clock, cue, strikes } = cuedController();
    const seen: PlayerStrikeAction[] = [];

    expect(strikes.strike(QUICK, (a) => seen.push(a))).toBe(true);
    expect(cue).toEqual([QUICK]);
    expect(resolvePlayerWindupCue(strikes.pending, null)?.action).toBe(QUICK);

    clock.advance(PLAYER_ATTACK_WINDUP_MS - 1);
    expect(cue).toEqual([QUICK]);

    clock.advance(1);
    expect(seen).toEqual([QUICK]);
    expect(cue).toEqual([QUICK, null]);
    expect(resolvePlayerWindupCue(strikes.pending, null)).toBeNull();
  });

  test('a heavy strike behaves identically', () => {
    const { clock, cue, strikes } = cuedController();
    expect(strikes.strike(POWER, () => {})).toBe(true);
    expect(cue).toEqual([POWER]);
    clock.advance(PLAYER_ATTACK_WINDUP_MS);
    expect(cue).toEqual([POWER, null]);
  });

  test('the cue is gone before the impact resolves — never after it', () => {
    const { clock, cue, strikes } = cuedController();
    let cueAtImpact: PlayerStrikeAction | null | 'unread' = 'unread';

    strikes.strike(QUICK, () => {
      // Read the controller from inside the impact: the cue has already cleared.
      cueAtImpact = strikes.pending;
    });
    clock.advance(PLAYER_ATTACK_WINDUP_MS);

    expect(cueAtImpact).toBeNull();
    expect(cue).toEqual([QUICK, null]);
  });

  test('cancelling a pending strike clears the cue and resolves nothing', () => {
    const { clock, cue, strikes, impacts } = cuedController();
    let resolved = 0;
    strikes.strike(POWER, () => {
      resolved += 1;
    });
    expect(cue).toEqual([POWER]);

    // The turn-end timer, both end-of-fight paths and the unmount cleanup all
    // reach the controller through this one call.
    expect(strikes.cancel()).toBe(true);
    expect(cue).toEqual([POWER, null]);
    expect(strikes.pending).toBeNull();

    clock.advance(PLAYER_ATTACK_WINDUP_MS * 3);
    expect(resolved).toBe(0);
    expect(impacts).toEqual([]);
    expect(cue).toEqual([POWER, null]);
  });

  test('cancelling with nothing pending reports nothing — no spurious clear', () => {
    const { cue, strikes } = cuedController();
    expect(strikes.cancel()).toBe(false);
    expect(cue).toEqual([]);
  });

  test('a refused second strike cannot raise a second cue', () => {
    const { clock, cue, strikes } = cuedController();
    expect(strikes.strike(QUICK, () => {})).toBe(true);
    expect(strikes.strike(POWER, () => {})).toBe(false);
    expect(cue).toEqual([QUICK]);

    clock.advance(PLAYER_ATTACK_WINDUP_MS);
    expect(cue).toEqual([QUICK, null]);
  });

  test('no stale cue after a cancellation followed by a new strike (ownership)', () => {
    const { clock, cue, strikes } = cuedController();
    const seen: string[] = [];

    strikes.strike(QUICK, (a) => seen.push(`A:${a}`));
    const handleA = clock.lastHandle();
    strikes.cancel();
    strikes.strike(POWER, (a) => seen.push(`B:${a}`));
    expect(cue).toEqual([QUICK, null, POWER]);

    // The cancelled strike's already-queued callback must be a complete no-op —
    // it may not clear the NEWER strike's cue.
    clock.fireStale(handleA);
    expect(seen).toEqual([]);
    expect(strikes.pending).toBe(POWER);
    expect(cue).toEqual([QUICK, null, POWER]);

    clock.advance(PLAYER_ATTACK_WINDUP_MS);
    expect(seen).toEqual(['B:power_attack']);
    expect(cue).toEqual([QUICK, null, POWER, null]);
    expect(clock.live).toBe(0);
  });

  test('a refused action raises no cue — the guard runs before the controller', () => {
    // The scene's authoritative range guard returns before any strike is
    // committed, so the controller is never touched and nothing is reported.
    const { cue, strikes } = cuedController();
    const guard = duelSource.indexOf("if (!isAttackInRange(gap, attackerNow.loadout.weapon)) {");
    const refusalEnd = duelSource.indexOf('resolvingRef.current = true;');
    const strikeCall = duelSource.indexOf('playerStrikeRef.current?.strike(actionType, resolveImpact)');

    expect(guard).toBeGreaterThan(-1);
    expect(refusalEnd).toBeGreaterThan(guard);
    expect(strikeCall).toBeGreaterThan(refusalEnd);
    // The refused branch spends nothing and commits nothing.
    const refusal = duelSource.slice(guard, refusalEnd);
    expect(refusal).toContain('return;');
    expect(refusal).not.toContain('playerStrikeRef');
    expect(refusal).not.toContain('setPendingPlayerAttack');
    expect(cue).toEqual([]);
    expect(strikes.pending).toBeNull();
  });
});

// ── §C. The wiring ─────────────────────────────────────────────────────────

describe('§C — the scene mirrors the controller and the HUD renders it', () => {
  test('the scene holds the cue as mirror state fed by the controller', () => {
    expect(duelSource).toContain(
      'const [pendingPlayerAttack, setPendingPlayerAttack] = useState<PlayerStrikeAction | null>(null);',
    );
    expect(duelSource).toContain('createPlayerStrike({ onPendingChange: setPendingPlayerAttack })');
    // The controller is still created exactly once per mount.
    expect(duelSource.split('createPlayerStrike(').length - 1).toBe(1);
  });

  test('the HUD is handed the player cue next to the opponent one', () => {
    expect(duelSource).toContain('pendingPlayerAttack={pendingPlayerAttack}');
    expect(duelSource).toContain('pendingEnemyAttack={pendingEnemyAttack}');
  });

  test('the HUD takes the prop and resolves it through the shared rule', () => {
    expect(hudSource).toContain('pendingPlayerAttack: PlayerStrikeAction | null;');
    expect(hudSource).toContain(
      'const playerWindupCue = resolvePlayerWindupCue(pendingPlayerAttack, pendingEnemyAttack);',
    );
    expect(hudSource).toContain('data-player-windup-cue={playerWindupCue.action}');
    expect(hudSource).toContain('{playerWindupCue.label}');
  });

  test('the cue cannot block a control and does not cover the vitals', () => {
    const cueStart = hudSource.indexOf('data-player-windup-cue=');
    const cueEnd = hudSource.indexOf('BOSS TELEGRAPH WARNING BANNER');
    expect(cueStart).toBeGreaterThan(-1);
    expect(cueEnd).toBeGreaterThan(cueStart);
    const cueBlock = hudSource.slice(cueStart, cueEnd);
    // Inert throughout: no control, no pointer-events-auto, no button.
    expect(cueBlock).not.toContain('pointer-events-auto');
    expect(cueBlock).not.toContain('<button');
    expect(cueBlock).not.toContain('onClick');
    // It is rendered after the vital cards, so it cannot obscure them.
    expect(hudSource.indexOf('GLADIATOR VITAL BARS')).toBeLessThan(cueStart);
  });

  test('the countdown reuses the established telegraph treatment', () => {
    const cueStart = hudSource.indexOf('data-player-windup-cue=');
    const cueBlock = hudSource.slice(cueStart, hudSource.indexOf('BOSS TELEGRAPH WARNING BANNER'));
    expect(cueBlock).toContain('windup-bar');
    expect(cueBlock).toContain('animationDuration: `${PLAYER_ATTACK_WINDUP_MS}ms`');
  });

  test('nothing in the cue is timed by its own clock', () => {
    // No second timer anywhere in the HUD, and the controller schedules exactly
    // one callback per accepted strike.
    expect(hudSource).not.toContain('setTimeout');
    expect(hudSource).not.toContain('setInterval');
    const strikeSource = readFileSync(new URL('./playerStrike.ts', import.meta.url), 'utf8');
    expect(strikeSource.split('timer.set(').length - 1).toBe(1);
    expect(strikeSource.split('onPendingChange').length - 1).toBeGreaterThan(0);
  });
});

// ── §D. Scope ──────────────────────────────────────────────────────────────

describe('§D — no timing or combat value moved with the cue', () => {
  test('the wind-up is still the audited 700 ms, matched to the opponent\'s', () => {
    expect(PLAYER_ATTACK_WINDUP_MS).toBe(700);
    expect(ENEMY_ATTACK_WINDUP_MS).toBe(700);
    expect(PLAYER_ATTACK_WINDUP_MS).toBe(ENEMY_ATTACK_WINDUP_MS);
  });

  test('the turn-end timer, the opponent cue and the turn toggles are untouched', () => {
    expect(duelSource).toContain('}, 1100);');
    // The 1100 ms timer, the range refusal's release, C-8.75E's strike
    // affordability release and C-8.84B's Dodge affordability release.
    expect(duelSource.split('setIsPlayerTurn(').length - 1).toBe(4);
    expect(hudSource).toContain('data-windup-cue={pendingEnemyAttack}');
    expect(hudSource).toContain('data-reaction="shield_block"');
    expect(hudSource).toContain('data-reaction="dodge"');
    // Every existing cancel site still releases the player's swing (and with it
    // the cue): the turn end, victory, defeat and unmount.
    expect(duelSource.split('playerStrikeRef.current?.cancel();').length - 1).toBe(4);
  });
});
