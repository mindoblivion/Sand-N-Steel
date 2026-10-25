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
 * ── D-2 — THE DAWN DELTAS (property deltas only, +0 draw calls) ────────────
 * AI-4 — the key map that would turn an authored state NAME into a full dressing
 * — is still not in the tree, so no new geometry, light or material may be built
 * for a state. What a state CAN carry without one is a table of PROPERTY values
 * for the duel arena's existing lights and fog: nothing is added to the scene, so
 * the draw-call count is unchanged, and a state with no entry leaves the arena
 * exactly as it was.
 *
 * `dawn` is the only state authored here — Marcellin's, per Part A's "First light
 * on the beast pits". Its values are authored to read as first light on the
 * existing rig: a low, warm sun (a little dimmer and much warmer than the shipped
 * noon `#fffbeb` / 1.9), ambient lifted toward the same warmth so the shade side
 * of the sand does not go blue at that hour, and the sand fog warmed to match.
 * No property here changes anything a fight computes.
 */
export interface BossPresentationDelta {
  /** The key (sun) light's colour and intensity. */
  sunColor?: string;
  sunIntensity?: number;
  /** The ambient lift's colour and intensity. */
  ambientColor?: string;
  ambientIntensity?: number;
  /** The sand haze behind the fighters. */
  fogColor?: string;
}

/**
 * The deltas each authored state carries, where one has landed. A name absent
 * from this table has no dressing yet and leaves the arena untouched — which is
 * the honest answer for the four states whose D-slices have not run.
 */
export const BOSS_PRESENTATION_DELTAS: Partial<
  Record<BossPresentationState, BossPresentationDelta>
> = {
  dawn: {
    sunColor: '#fca86b',
    sunIntensity: 1.55,
    ambientColor: '#ffd7ad',
    ambientIntensity: 0.55,
    fogColor: '#c99a72',
  },
};

/**
 * The property deltas the duel should apply for this opponent, or `null` when it
 * should leave the arena alone. Read by the arena, never by a fight rule: a
 * non-boss, a ladder boss and a feature boss whose state has no table entry all
 * answer `null`.
 */
export function bossSceneDeltas(
  opponent: Pick<OpponentConfig, 'isBoss' | 'featureBout' | 'presentationState'> | null | undefined
): { sunColor?: string; sunIntensity?: number; ambientColor?: string; ambientIntensity?: number; fogColor?: string } | null {
  const state = authoredPresentationState(opponent);
  if (!state) return null;
  const delta = BOSS_PRESENTATION_DELTAS[state];
  return delta ?? null;
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
