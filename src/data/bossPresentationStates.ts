/**
 * ===========================================================================
 * D-1 — BOSS PRESENTATION STATES (boss-rosters.md Part A, as data)
 * ===========================================================================
 * Part A gives each Feature Bout a presentation state NAME. In this slice the
 * name is DATA ONLY:
 *
 *   • the five authored names live here, with the one-line brief each carries;
 *   • each feature boss's row states which of them it wears
 *     (`OpponentConfig.presentationState`);
 *   • **the AI-4 presentation key map is DEFERRED.** AI-4 is not in the tree, so
 *     there is no key → dressing table to extend and no visual delta to apply
 *     here. The deltas land in each boss's own later D-slice.
 *
 * Until then every boss — feature bout or ladder champion — stands in the
 * STANDARD BOSS AMBIENT STATE: the generic `isBoss` loge dressing the arenas
 * already use. That is defined here once, so "which dressing is in force" has a
 * single answer rather than being implied by an absent table.
 */
import type { BossPresentationState, OpponentConfig } from '../types/game';

/** One authored presentation state, as Part A names it. */
export interface BossPresentationStateDefinition {
  name: BossPresentationState;
  /** The state's own one-line brief: what the dressing will say once AI-4 lands. */
  brief: string;
}

/** The five authored states, in Part A's order. */
export const BOSS_PRESENTATION_STATES: readonly BossPresentationStateDefinition[] = [
  { name: 'dawn', brief: 'First light on the beast pits — a hunt begins, not a bout.' },
  { name: 'high-noon', brief: 'Hard white sun, hard short shadows: nothing to hide a feint.' },
  { name: 'gilded', brief: 'Gold under torchlight — wealth displayed as armour.' },
  { name: 'brothers', brief: 'Two shadows on the sand where one fighter should stand.' },
  { name: 'dusk', brief: 'The long light of a career ending, and the crowd knowing it.' },
];

/**
 * The ambient state EVERY boss uses in this slice: the generic `isBoss` loge
 * dressing (the boss banner, the boss music cue, the boss card and the boss HUD
 * treatment the arenas already present). A feature bout adds no visual delta of
 * its own until its D-slice, so this is what it actually wears.
 */
export const STANDARD_BOSS_AMBIENT_STATE = {
  id: 'standard-boss',
  brief: 'The generic isBoss loge dressing every boss in the game already stands in.',
} as const;

/** The state a feature boss is AUTHORED to wear, or `null` for a non-feature boss. */
export function authoredPresentationState(
  opponent: Pick<OpponentConfig, 'featureBout' | 'presentationState'> | null | undefined
): BossPresentationState | null {
  if (!opponent || opponent.featureBout !== true) return null;
  return opponent.presentationState ?? null;
}

/**
 * The presentation state IN FORCE for an opponent, right now.
 *
 * Every boss answers the standard ambient state, because the AI-4 key map that
 * would turn an authored name into a dressing is deferred. The function exists
 * so a later slice has one place to change, and so the deferral is a fact a test
 * can assert rather than a promise in a comment.
 */
export function presentationStateInForce(
  opponent: Pick<OpponentConfig, 'isBoss' | 'featureBout' | 'presentationState'> | null | undefined
): typeof STANDARD_BOSS_AMBIENT_STATE | null {
  return opponent?.isBoss === true ? STANDARD_BOSS_AMBIENT_STATE : null;
}
