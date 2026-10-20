/**
 * START-1 — the title's phase backdrop, as ONE named resolver.
 *
 * The designed startup sequence puts the title in a time of day: the title backdrop
 * carries a phase's atmosphere, and the sequence is meant to follow the game's own
 * clock. **That clock does not exist in this codebase yet** — there is no Atmosphere
 * light-profile system and no day/night state to read (nothing under `src/` resolves a
 * phase, and this slice is forbidden to invent a lighting system for it) — so
 * `resolveTitlePhaseBackdrop()` returns the DAWN variant unconditionally, and the title
 * reads its atmosphere from here.
 *
 * START-1b replaces the body of `resolveTitlePhaseBackdrop` with the real resolver
 * (read the phase, pick the matching variant, keep the same return shape); the hook,
 * the variant shape and every caller stay as they are. Until then this is the single
 * place the title's phase is decided, and it is READ-ONLY: it touches no storage, no
 * network, no clock and no player save.
 *
 * This is deliberately NOT a lighting system: a variant carries presentation values
 * the title already knows how to paint (a tint wash and the warm-light glow its CSS
 * layer already animates), not a light rig.
 */

export type TitlePhaseId = 'dawn';

export interface TitlePhaseBackdrop {
  /** The phase this variant paints. Only `dawn` exists in this slice. */
  id: TitlePhaseId;
  /** A short human label, for diagnostics and the dev tools. */
  label: string;
  /**
   * A flat wash laid over the artwork, as a CSS colour. Kept faint: the title art is
   * the picture, this is only the light on it.
   */
  tint: string;
  /** The existing warm-light layer's gradient for this phase (see index.css). */
  warmLightGradient: string;
}

/**
 * The dawn variant: low, warm light from the east over the Colosseum, before the
 * crowd arrives. The gradient is the one `TitleScreen`'s `title-warm-light` layer has
 * always painted, so the phase is honest about what the title can actually show today.
 */
export const DAWN_BACKDROP: TitlePhaseBackdrop = {
  id: 'dawn',
  label: 'First light',
  tint: 'rgba(255, 176, 96, 0.10)',
  warmLightGradient:
    'radial-gradient(ellipse 55% 45% at 50% 22%, rgba(255,180,80,0.35) 0%, transparent 70%)',
};

/**
 * The named resolver. Returns the phase variant the title should paint — the dawn
 * variant today, and whatever the real day/night resolver answers once START-1b wires
 * it. Read-only, total and pure: it never throws and every call answers the same thing
 * for the same (absent) inputs.
 */
export function resolveTitlePhaseBackdrop(): TitlePhaseBackdrop {
  // START-1b: replace with the real phase resolver.
  return DAWN_BACKDROP;
}

/** The hook form of the resolver, for the component that paints the title. */
export function useTitlePhaseBackdrop(): TitlePhaseBackdrop {
  return resolveTitlePhaseBackdrop();
}
