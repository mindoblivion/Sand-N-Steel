// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import {
  canActDuringImpactLifecycle,
  DEAD_IMPACT_STATE,
  isImpactLifecycleGrounded,
  STANDING_IMPACT_STATE,
  transitionImpactLifecycle,
  type ImpactLifecycleState,
} from './impactLifecycle';

const impact = (reaction: 'none' | 'stagger' | 'knockdown', lethal = false) =>
  ({ type: 'impact', reaction, lethal } as const);

const phases = (...names: ImpactLifecycleState['phase'][]) =>
  names.map((phase) => ({ phase, transitionId: 0 }));

describe('physical impact lifecycle state machine', () => {
  test('stagger has a single guarded recovery path back to standing', () => {
    const staggered = transitionImpactLifecycle(STANDING_IMPACT_STATE, impact('stagger'));
    expect(staggered.phase).toBe('staggered');
    expect(canActDuringImpactLifecycle(staggered)).toBe(false);
    expect(isImpactLifecycleGrounded(staggered)).toBe(false);

    expect(transitionImpactLifecycle(staggered, {
      type: 'stagger_complete',
      transitionId: staggered.transitionId,
    }).phase).toBe('standing');
    expect(transitionImpactLifecycle(STANDING_IMPACT_STATE, {
      type: 'stagger_complete',
      transitionId: STANDING_IMPACT_STATE.transitionId,
    })).toBe(STANDING_IMPACT_STATE);
  });

  test('knockdown upgrades stagger and follows fall, grounded recovery, and get-up in order', () => {
    const staggered = transitionImpactLifecycle(STANDING_IMPACT_STATE, impact('stagger'));
    const down = transitionImpactLifecycle(staggered, impact('knockdown'));
    expect(down.phase).toBe('knocked_down');
    expect(canActDuringImpactLifecycle(down)).toBe(false);
    expect(isImpactLifecycleGrounded(down)).toBe(true);

    const grounded = transitionImpactLifecycle(down, {
      type: 'fall_complete',
      transitionId: down.transitionId,
    });
    expect(grounded.phase).toBe('grounded_recovery');
    expect(isImpactLifecycleGrounded(grounded)).toBe(true);

    const gettingUp = transitionImpactLifecycle(grounded, {
      type: 'grounded_recovery_complete',
      transitionId: grounded.transitionId,
    });
    expect(gettingUp.phase).toBe('getting_up');
    expect(isImpactLifecycleGrounded(gettingUp)).toBe(false);
    expect(canActDuringImpactLifecycle(gettingUp)).toBe(false);

    const standing = transitionImpactLifecycle(gettingUp, {
      type: 'get_up_complete',
      transitionId: gettingUp.transitionId,
    });
    expect(standing.phase).toBe('standing');
    expect(canActDuringImpactLifecycle(standing)).toBe(true);
  });

  test('stale completion callbacks cannot complete a repeated stagger', () => {
    const first = transitionImpactLifecycle(STANDING_IMPACT_STATE, impact('stagger'));
    const second = transitionImpactLifecycle(first, impact('stagger'));
    expect(second.phase).toBe('staggered');
    expect(second.transitionId).toBeGreaterThan(first.transitionId);

    const stale = transitionImpactLifecycle(second, {
      type: 'stagger_complete',
      transitionId: first.transitionId,
    });
    expect(stale).toBe(second);

    const current = transitionImpactLifecycle(second, {
      type: 'stagger_complete',
      transitionId: second.transitionId,
    });
    expect(current.phase).toBe('standing');
  });

  test('completion events from stale phases cannot skip lifecycle steps', () => {
    const down = transitionImpactLifecycle(STANDING_IMPACT_STATE, impact('knockdown'));
    expect(transitionImpactLifecycle(down, {
      type: 'grounded_recovery_complete',
      transitionId: down.transitionId,
    })).toBe(down);
    expect(transitionImpactLifecycle(down, {
      type: 'get_up_complete',
      transitionId: down.transitionId,
    })).toBe(down);

    const grounded = transitionImpactLifecycle(down, {
      type: 'fall_complete',
      transitionId: down.transitionId,
    });
    expect(transitionImpactLifecycle(grounded, {
      type: 'get_up_complete',
      transitionId: grounded.transitionId,
    })).toBe(grounded);
  });

  test('ordinary hits cannot lift a fighter out of grounded recovery', () => {
    const down = transitionImpactLifecycle(STANDING_IMPACT_STATE, impact('knockdown'));
    const grounded = transitionImpactLifecycle(down, {
      type: 'fall_complete',
      transitionId: down.transitionId,
    });
    expect(transitionImpactLifecycle(grounded, impact('stagger'))).toBe(grounded);
    expect(transitionImpactLifecycle(grounded, impact('knockdown'))).toBe(grounded);
    expect(transitionImpactLifecycle(grounded, impact('none'))).toBe(grounded);
  });

  test('a new impact interrupts get-up and invalidates its completion callback', () => {
    const down = transitionImpactLifecycle(STANDING_IMPACT_STATE, impact('knockdown'));
    const grounded = transitionImpactLifecycle(down, {
      type: 'fall_complete',
      transitionId: down.transitionId,
    });
    const gettingUp = transitionImpactLifecycle(grounded, {
      type: 'grounded_recovery_complete',
      transitionId: grounded.transitionId,
    });
    const interrupted = transitionImpactLifecycle(gettingUp, impact('knockdown'));
    expect(interrupted.phase).toBe('knocked_down');
    expect(interrupted.transitionId).toBeGreaterThan(gettingUp.transitionId);
    expect(transitionImpactLifecycle(interrupted, {
      type: 'get_up_complete',
      transitionId: gettingUp.transitionId,
    })).toBe(interrupted);
  });

  test('a non-lethal no-reaction impact preserves the current state', () => {
    expect(transitionImpactLifecycle(STANDING_IMPACT_STATE, impact('none'))).toBe(STANDING_IMPACT_STATE);
  });

  test('lethal damage takes precedence from every live phase', () => {
    for (const state of phases('standing', 'staggered', 'knocked_down', 'grounded_recovery', 'getting_up')) {
      const dead = transitionImpactLifecycle(state, impact('none', true));
      expect(dead.phase).toBe('dead');
      expect(dead.transitionId).toBe(state.transitionId + 1);
      expect(transitionImpactLifecycle(state, { type: 'death' }).phase).toBe('dead');
    }
    expect(DEAD_IMPACT_STATE.phase).toBe('dead');
  });

  test('death is terminal even when stale impact or recovery events arrive', () => {
    const dead = transitionImpactLifecycle(STANDING_IMPACT_STATE, { type: 'death' });
    for (const next of [
      impact('knockdown'),
      { type: 'fall_complete' as const, transitionId: 0 },
      { type: 'grounded_recovery_complete' as const, transitionId: 0 },
      { type: 'get_up_complete' as const, transitionId: 0 },
    ]) {
      expect(transitionImpactLifecycle(dead, next)).toBe(dead);
    }
    expect(canActDuringImpactLifecycle(dead)).toBe(false);
    expect(isImpactLifecycleGrounded(dead)).toBe(false);
  });
});
