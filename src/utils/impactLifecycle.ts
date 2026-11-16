/**
 * Deterministic state transitions for the physical-impact recovery lifecycle.
 *
 * This is deliberately a rules-only module. It does not schedule timers, choose
 * animation clips, apply damage, move a fighter, or decide turn ownership.
 * DuelScene remains authoritative for those concerns. The runtime dispatches
 * completion events with the transitionId captured when each animation/timer
 * starts, so stale callbacks cannot complete a newer reaction.
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
  /** Monotonically advances whenever a new phase/reaction invalidates old callbacks. */
  transitionId: number;
}

export type ImpactLifecycleEvent =
  | { type: 'impact'; reaction: ImpactReaction; lethal?: boolean }
  | { type: 'stagger_complete'; transitionId: number }
  | { type: 'fall_complete'; transitionId: number }
  | { type: 'grounded_recovery_complete'; transitionId: number }
  | { type: 'get_up_complete'; transitionId: number }
  | { type: 'death' };

export const STANDING_IMPACT_STATE: ImpactLifecycleState = Object.freeze({
  phase: 'standing',
  transitionId: 0,
});

export const DEAD_IMPACT_STATE: ImpactLifecycleState = Object.freeze({
  phase: 'dead',
  transitionId: 0,
});

function nextPhase(
  state: ImpactLifecycleState,
  phase: ImpactLifecyclePhase,
): ImpactLifecycleState {
  return { phase, transitionId: state.transitionId + 1 };
}

/**
 * Advance one lifecycle event.
 *
 * Lethal damage always wins. A knockdown upgrades a stagger or interrupts a
 * get-up, while non-lethal impacts cannot pop a fighter out of grounded
 * recovery. Completion events are accepted only from their matching phase
 * AND transitionId, so stale timers/animation callbacks cannot skip or reverse
 * a newer lifecycle.
 */
export function transitionImpactLifecycle(
  state: ImpactLifecycleState,
  event: ImpactLifecycleEvent,
): ImpactLifecycleState {
  if (state.phase === 'dead') return state;

  if (event.type === 'death' || (event.type === 'impact' && event.lethal === true)) {
    return nextPhase(state, 'dead');
  }

  if (event.type === 'impact') {
    if (event.reaction === 'none') return state;

    if (event.reaction === 'stagger') {
      if (state.phase === 'standing' || state.phase === 'staggered' || state.phase === 'getting_up') {
        return nextPhase(state, 'staggered');
      }
      return state;
    }

    if (event.reaction === 'knockdown') {
      if (state.phase === 'standing' || state.phase === 'staggered' || state.phase === 'getting_up') {
        return nextPhase(state, 'knocked_down');
      }
      return state;
    }

    return state;
  }

  switch (event.type) {
    case 'stagger_complete':
      return state.phase === 'staggered' && event.transitionId === state.transitionId
        ? nextPhase(state, 'standing')
        : state;
    case 'fall_complete':
      return state.phase === 'knocked_down' && event.transitionId === state.transitionId
        ? nextPhase(state, 'grounded_recovery')
        : state;
    case 'grounded_recovery_complete':
      return state.phase === 'grounded_recovery' && event.transitionId === state.transitionId
        ? nextPhase(state, 'getting_up')
        : state;
    case 'get_up_complete':
      return state.phase === 'getting_up' && event.transitionId === state.transitionId
        ? nextPhase(state, 'standing')
        : state;
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
