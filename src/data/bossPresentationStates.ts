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
  /**
   * D-5 — the arena's eight bronze brazier embers, as an emissive intensity for
   * the material they already use (the shipped value is 3). A MATERIAL PROPERTY
   * on a mesh the arena already draws, so still +0 draw calls.
   */
  emberEmissive?: number;
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
  // D-3 — Varro's state, per Part A's own brief: "Hard white sun, hard short
  // shadows: nothing to hide a feint." The key light is driven to white and
  // lifted, the ambient dropped (so the shadows stay short and hard rather than
  // filled in), and the sand haze bleached to match.
  'high-noon': {
    sunColor: '#ffffff',
    sunIntensity: 2.45,
    ambientColor: '#e7e5e4',
    ambientIntensity: 0.42,
    fogColor: '#e4d5b7',
  },
  // D-4 — the Cotta brothers' state: "Two shadows on the sand where one fighter
  // should stand." A low, hard, warm key from the SIDE (the sun is lowered and
  // swung warm, so one long shadow per brother falls across the sand), the
  // ambient pulled down so those shadows stay hard rather than filled in, and
  // the haze darkened to the same hour. Property values only: no light, mesh or
  // material is added, so the draw-call count is unchanged.
  brothers: {
    sunColor: '#f2b263',
    sunIntensity: 1.62,
    ambientColor: '#e7c9a3',
    ambientIntensity: 0.44,
    fogColor: '#b98d63',
  },
  // D-3 — Gnaeus's state: "Gold under torchlight — wealth displayed as armour."
  // A warm gilt key under a lifted amber ambient, with the haze gilded to match.
  gilded: {
    sunColor: '#f6c453',
    sunIntensity: 1.75,
    ambientColor: '#f3d08a',
    ambientIntensity: 0.62,
    fogColor: '#b8863b',
  },
  // D-5 — Hermas's state, per Part A's own brief: "The long light of a career
  // ending, and the crowd knowing it." A DEEPENED dusk: the key light sunk low and
  // reddened far past `dawn`'s, the ambient dropped so the sand goes the colour of
  // old bronze rather than staying lit, and the haze pulled down with it. The
  // braziers are raised (ember emissive 3 → 5.4) because at this hour they are the
  // only light the crowd has — again a MATERIAL PROPERTY on the embers the arena
  // already draws, so +0 draw calls. His banner rides the same single heraldic
  // cloth D-3/D-4 established (a dusk wine canopy with a tarnished-bronze trim);
  // a SECOND cloth "beside the player's" would be +1 draw call, which this slice's
  // budget does not allow, so the state is carried as the one cloth's tones.
  dusk: {
    sunColor: '#c2703f',
    sunIntensity: 1.05,
    ambientColor: '#a98a6d',
    ambientIntensity: 0.34,
    fogColor: '#7d5a3f',
    emberEmissive: 5.4,
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
): BossPresentationDelta | null {
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
