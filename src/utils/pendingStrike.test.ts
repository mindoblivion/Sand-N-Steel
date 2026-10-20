/**
 * Combat responsiveness §R1 — the announced enemy strike.
 *
 * The wind-up's three guarantees are timing and bookkeeping, so they are driven
 * here on a CONTROLLED clock (`fakeTimer`) rather than on the wall clock: no test
 * sleeps, nothing is timing-sensitive, and a stale callback can be fired on
 * purpose instead of hoped for. `pendingStrike.ts` takes its timer as a
 * parameter for exactly this reason.
 *
 * Covered:
 *   §A the window — nothing resolves before ENEMY_ATTACK_WINDUP_MS, exactly once at it
 *   §B reactions — one claim per announcement, reset by the next one
 *   §C at-most-once and cancellation — cancel wins, stale callbacks are inert
 *
 * Run with: bun test src/utils/pendingStrike.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';

import { createPendingStrike } from './pendingStrike';
import type { StrikeTimer } from './pendingStrike';
import { ENEMY_ATTACK_WINDUP_MS } from './combatCalculations';

/** A clock the test advances by hand. Callbacks are fireable even once cleared. */
function fakeTimer() {
  let now = 0;
  let nextId = 1;
  const scheduled = new Map<number, { at: number; run: () => void }>();
  const callbacks = new Map<number, () => void>();

  const timer: StrikeTimer = {
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
    /** Milliseconds until the earliest scheduled callback. */
    dueIn(): number | null {
      const times = [...scheduled.values()].map((job) => job.at);
      return times.length ? Math.min(...times) - now : null;
    },
    /** Advance the clock, running anything that falls due. */
    advance(ms: number) {
      now += ms;
      for (const [id, job] of [...scheduled]) {
        if (job.at <= now) {
          scheduled.delete(id);
          job.run();
        }
      }
    },
    /** Fire a callback that was cleared — a stale timer the platform still runs. */
    fireStale(handle: number) {
      callbacks.get(handle)?.();
    },
    get live() {
      return scheduled.size;
    },
  };
}

const QUICK = 'quick_attack' as const;
const POWER = 'power_attack' as const;

// ── §A. The window ─────────────────────────────────────────────────────────

describe('§A — an announced strike resolves only at the end of its wind-up', () => {
  test('nothing lands before the wind-up has elapsed', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });
    const impacts: string[] = [];

    strike.announce(QUICK, (action) => impacts.push(action));
    expect(strike.pending).toBe(QUICK);

    clock.advance(ENEMY_ATTACK_WINDUP_MS - 1);
    expect(impacts).toEqual([]);
    expect(strike.pending).toBe(QUICK);

    clock.advance(1);
    expect(impacts).toEqual([QUICK]);
    expect(strike.pending).toBeNull();
  });

  test('the default window is ENEMY_ATTACK_WINDUP_MS (700 ms)', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });

    expect(ENEMY_ATTACK_WINDUP_MS).toBe(700);
    strike.announce(POWER, () => {});
    expect(clock.dueIn()).toBe(700);
  });

  test('the impact carries the announced action', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });
    const impacts: string[] = [];

    strike.announce(POWER, (action) => impacts.push(action));
    clock.advance(ENEMY_ATTACK_WINDUP_MS);

    expect(impacts).toEqual([POWER]);
  });

  test('an injected window is honoured', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer, windupMs: 250 });
    let impacts = 0;

    strike.announce(QUICK, () => { impacts += 1; });
    clock.advance(249);
    expect(impacts).toBe(0);
    clock.advance(1);
    expect(impacts).toBe(1);
  });
});

// ── §B. Reactions ──────────────────────────────────────────────────────────

describe('§B — the player gets one reaction per announcement', () => {
  test('a claim succeeds once and is then refused', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });

    strike.announce(POWER, () => {});
    expect(strike.claimReaction()).toBe(true);
    expect(strike.hasReacted).toBe(true);
    expect(strike.claimReaction()).toBe(false);
  });

  test('nothing pending means no claim (a reaction is never a free turn)', () => {
    const strike = createPendingStrike({ timer: fakeTimer().timer });
    expect(strike.claimReaction()).toBe(false);
    expect(strike.hasReacted).toBe(false);
  });

  test('the next announcement restores the reaction', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });

    strike.announce(QUICK, () => {});
    strike.claimReaction();
    clock.advance(ENEMY_ATTACK_WINDUP_MS);

    strike.announce(POWER, () => {});
    expect(strike.hasReacted).toBe(false);
    expect(strike.claimReaction()).toBe(true);
  });

  test('a claim does not resolve the strike early', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });
    let impacts = 0;

    strike.announce(QUICK, () => { impacts += 1; });
    strike.claimReaction();
    expect(impacts).toBe(0);

    clock.advance(ENEMY_ATTACK_WINDUP_MS);
    expect(impacts).toBe(1);
  });
});

// ── §C. At-most-once and cancellation ──────────────────────────────────────

describe('§C — at most one impact, and a cancel always wins', () => {
  test('a second announcement while one is pending is refused', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });
    const impacts: string[] = [];

    expect(strike.announce(QUICK, (action) => impacts.push(action))).toBe(true);
    expect(strike.announce(POWER, (action) => impacts.push(action))).toBe(false);

    clock.advance(ENEMY_ATTACK_WINDUP_MS);
    expect(impacts).toEqual([QUICK]);
  });

  test('cancel before impact drops the strike and reports what it dropped', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });
    let impacts = 0;

    strike.announce(POWER, () => { impacts += 1; });
    expect(strike.cancel()).toBe(true);
    expect(strike.pending).toBeNull();

    clock.advance(ENEMY_ATTACK_WINDUP_MS);
    expect(impacts).toBe(0);
    expect(strike.cancel()).toBe(false);
  });

  test('a callback that fires AFTER a cancel is inert', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });
    let impacts = 0;

    strike.announce(QUICK, () => { impacts += 1; });
    strike.cancel();
    // The platform still runs a cleared timer: this is that callback.
    clock.fireStale(1);

    expect(impacts).toBe(0);
    expect(strike.pending).toBeNull();
  });

  test('a callback that fires twice resolves the strike once', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });
    let impacts = 0;

    strike.announce(QUICK, () => { impacts += 1; });
    clock.fireStale(1);
    clock.fireStale(1);

    expect(impacts).toBe(1);
  });

  test('cancel wins even mid-window, and the next strike still lands once', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });
    const impacts: string[] = [];

    strike.announce(QUICK, (action) => impacts.push(action));
    clock.advance(ENEMY_ATTACK_WINDUP_MS / 2);
    strike.cancel();
    clock.fireStale(1);
    expect(impacts).toEqual([]);

    strike.announce(POWER, (action) => impacts.push(action));
    clock.advance(ENEMY_ATTACK_WINDUP_MS);
    expect(impacts).toEqual([POWER]);
  });

  test('cancel also clears the spent reaction', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });

    strike.announce(QUICK, () => {});
    strike.claimReaction();
    strike.cancel();

    expect(strike.hasReacted).toBe(false);
    expect(strike.claimReaction()).toBe(false);
  });

  test('a cancelled then re-announced strike holds exactly one live timer', () => {
    const clock = fakeTimer();
    const strike = createPendingStrike({ timer: clock.timer });

    strike.announce(QUICK, () => {});
    strike.announce(POWER, () => {}); // refused — must not leak a timer
    expect(clock.live).toBe(1);

    strike.cancel();
    expect(clock.live).toBe(0);
  });
});
