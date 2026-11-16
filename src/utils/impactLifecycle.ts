/**
 * Deterministic state transitions for the physical-impact recovery lifecycle.
 *
 * This is deliberately a rules-only module. It does not schedule timers, choose
 * animation clips, apply damage, move a fighter, or decide turn ownership.
 * DuelScene remains authoritative for those concerns. The runtime can dispatch
 * the completion events only when the corresponding animation/timing is
 * verified for the loaded character rig.
 */

import type { ImpactReaction } from './impactReactions';

export type ImpactLifecyclePhase =
  | 'standing'
  | 'staggered'
  | 'knocked_down'
  | 'grounded_recovery'
  | 'getting_up'
  | 'dead';

export interface ImpactLifecycleState {
  phase: ImpactLifecyclePhase;
}

export type ImpactLifecycleEvent =
  | { type: 'impact'; reaction: ImpactReaction; lethal?: boolean }
  | { type: 'stagger_complete' }
  | { type: 'fall_complete' }
  | { type: 'grounded_recovery_complete' }
  | { type: 'get_up_complete' }
  | { type: 'death' };

export const STANDING_IMPACT_STATE: ImpactLifecycleState = Object.freeze({
  phase: 'standing',
});

export const DEAD_IMPACT_STATE: ImpactLifecycleState = Object.freeze({
  phase: 'dead',
});

/**
 * Advance one lifecycle event.
 *
 * Lethal damage always wins. A knockdown upgrades a stagger or interrupts a
 * get-up, while non-lethal impacts cannot pop a fighter out of a grounded
 * recovery. Completion events are accepted only from their matching phase, so
 * stale timers/animation callbacks cannot skip or reverse the lifecycle.
 */
export function transitionImpactLifecycle(
  state: ImpactLifecycleState,
  event: ImpactLifecycleEvent,
): ImpactLifecycleState {
  if (state.phase === 'dead') return state;

  if (event.type === 'death' || (event.type === 'impact' && event.lethal === true)) {
    return DEAD_IMPACT_STATE;
  }

  if (event.type === 'impact') {
    if (event.reaction === 'none') return state;

    if (event.reaction === 'stagger') {
      if (state.phase === 'standing' || state.phase === 'staggered' || state.phase === 'getting_up') {
        return { phase: 'staggered' };
      }
      return state;
    }

    if (event.reaction === 'knockdown') {
      if (state.phase === 'standing' || state.phase === 'staggered' || state.phase === 'getting_up') {
        return { phase: 'knocked_down' };
      }
      return state;
    }

    return state;
  }

  switch (event.type) {
    case 'stagger_complete':
      return state.phase === 'staggered' ? STANDING_IMPACT_STATE : state;
    case 'fall_complete':
      return state.phase === 'knocked_down' ? { phase: 'grounded_recovery' } : state;
    case 'grounded_recovery_complete':
      return state.phase === 'grounded_recovery' ? { phase: 'getting_up' } : state;
    case 'get_up_complete':
      return state.phase === 'getting_up' ? STANDING_IMPACT_STATE : state;
    default:
      return state;
  }
}

/** A fighter may act only when the impact lifecycle is standing. */
export function canActDuringImpactLifecycle(state: ImpactLifecycleState): boolean {
  return state.phase === 'standing';
}

/** True only while the fighter is physically on the ground. */
export function isImpactLifecycleGrounded(state: ImpactLifecycleState): boolean {
  return state.phase === 'knocked_down' || state.phase === 'grounded_recovery';
}
