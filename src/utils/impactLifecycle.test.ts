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

const event = (type: 'impact', reaction: 'none' | 'stagger' | 'knockdown', lethal = false) =>
  ({ type, reaction, lethal } as const);

const phases = (...names: ImpactLifecycleState['phase'][]) => names.map((phase) => ({ phase }));

describe('physical impact lifecycle state machine', () => {
  test('stagger has a single guarded recovery path back to standing', () => {
    const staggered = transitionImpactLifecycle(STANDING_IMPACT_STATE, event('impact', 'stagger'));
    expect(staggered.phase).toBe('staggered');
    expect(canActDuringImpactLifecycle(staggered)).toBe(false);
    expect(isImpactLifecycleGrounded(staggered)).toBe(false);

    expect(transitionImpactLifecycle(staggered, { type: 'stagger_complete' })).toEqual(STANDING_IMPACT_STATE);
    expect(transitionImpactLifecycle(STANDING_IMPACT_STATE, { type: 'stagger_complete' })).toBe(STANDING_IMPACT_STATE);
  });

  test('knockdown upgrades stagger and follows fall, grounded recovery, and get-up in order', () => {
    const staggered = transitionImpactLifecycle(STANDING_IMPACT_STATE, event('impact', 'stagger'));
    const down = transitionImpactLifecycle(staggered, event('impact', 'knockdown'));
    expect(down.phase).toBe('knocked_down');
    expect(canActDuringImpactLifecycle(down)).toBe(false);
    expect(isImpactLifecycleGrounded(down)).toBe(true);

    const grounded = transitionImpactLifecycle(down, { type: 'fall_complete' });
    expect(grounded.phase).toBe('grounded_recovery');
    expect(isImpactLifecycleGrounded(grounded)).toBe(true);

    const gettingUp = transitionImpactLifecycle(grounded, { type: 'grounded_recovery_complete' });
    expect(gettingUp.phase).toBe('getting_up');
    expect(isImpactLifecycleGrounded(gettingUp)).toBe(false);
    expect(canActDuringImpactLifecycle(gettingUp)).toBe(false);

    const standing = transitionImpactLifecycle(gettingUp, { type: 'get_up_complete' });
    expect(standing).toEqual(STANDING_IMPACT_STATE);
    expect(canActDuringImpactLifecycle(standing)).toBe(true);
  });

  test('completion events from stale timers cannot skip lifecycle phases', () => {
    const down = transitionImpactLifecycle(STANDING_IMPACT_STATE, event('impact', 'knockdown'));
    expect(transitionImpactLifecycle(down, { type: 'grounded_recovery_complete' })).toBe(down);
    expect(transitionImpactLifecycle(down, { type: 'get_up_complete' })).toBe(down);

    const grounded = transitionImpactLifecycle(down, { type: 'fall_complete' });
    expect(transitionImpactLifecycle(grounded, { type: 'get_up_complete' })).toBe(grounded);
  });

  test('ordinary hits cannot lift a fighter out of a grounded recovery', () => {
    const down = transitionImpactLifecycle(STANDING_IMPACT_STATE, event('impact', 'knockdown'));
    const grounded = transitionImpactLifecycle(down, { type: 'fall_complete' });
    expect(transitionImpactLifecycle(grounded, event('impact', 'stagger'))).toBe(grounded);
    expect(transitionImpactLifecycle(grounded, event('impact', 'knockdown'))).toBe(grounded);
    expect(transitionImpactLifecycle(grounded, event('impact', 'none'))).toBe(grounded);
  });

  test('a new impact interrupts get-up and restarts the appropriate reaction', () => {
    const down = transitionImpactLifecycle(STANDING_IMPACT_STATE, event('impact', 'knockdown'));
    const grounded = transitionImpactLifecycle(down, { type: 'fall_complete' });
    const gettingUp = transitionImpactLifecycle(grounded, { type: 'grounded_recovery_complete' });
    expect(transitionImpactLifecycle(gettingUp, event('impact', 'stagger')).phase).toBe('staggered');
    expect(transitionImpactLifecycle(gettingUp, event('impact', 'knockdown')).phase).toBe('knocked_down');
  });

  test('a non-lethal no-reaction impact preserves the current state', () => {
    expect(transitionImpactLifecycle(STANDING_IMPACT_STATE, event('impact', 'none'))).toBe(STANDING_IMPACT_STATE);
  });

  test('lethal damage takes precedence from every live phase', () => {
    const liveStates = phases('standing', 'staggered', 'knocked_down', 'grounded_recovery', 'getting_up');
    for (const state of liveStates) {
      expect(transitionImpactLifecycle(state, event('impact', 'none', true))).toBe(DEAD_IMPACT_STATE);
      expect(transitionImpactLifecycle(state, { type: 'death' })).toBe(DEAD_IMPACT_STATE);
    }
  });

  test('death is terminal even when stale impact or recovery events arrive', () => {
    for (const next of [
      event('impact', 'knockdown'),
      { type: 'fall_complete' as const },
      { type: 'grounded_recovery_complete' as const },
      { type: 'get_up_complete' as const },
    ]) {
      expect(transitionImpactLifecycle(DEAD_IMPACT_STATE, next)).toBe(DEAD_IMPACT_STATE);
    }
    expect(canActDuringImpactLifecycle(DEAD_IMPACT_STATE)).toBe(false);
    expect(isImpactLifecycleGrounded(DEAD_IMPACT_STATE)).toBe(false);
  });
});
