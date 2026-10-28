import type { PlayerProfile } from '../types/game';

/**
 * L21I — the title's ONE primary action, lifted out of `TitleScreen` so its ordering
 * can be tested without a DOM.
 *
 * The original handler was inline in the component: it set the double-tap guard, tried
 * fullscreen with `await` (so the decision happened after an async hop), then chose
 * continue-vs-create from the `savedProfile` its render had captured. That is safe ONLY
 * while `savedProfile` is already resolved when the title first paints. While App
 * hydrated the save from a passive effect, the first paint carried `null`, so a tap in
 * that window captured `null` and a returning player was routed into character creation.
 *
 * This module decides nothing new: it is the same guard → fullscreen → destination
 * order, with the destination still read AFTER the fullscreen attempt, from whatever
 * `savedProfile` the caller's render captured. The fix for the race lives in `App.tsx`
 * (the save is hydrated in the state initializer, so every render — including the first
 * — carries it).
 */
export type TitleDestination = 'continue' | 'new_character';

export interface TitlePrimaryActionContext {
  /** The profile this render captured. `null` means "no save", never "not loaded yet". */
  savedProfile: PlayerProfile | null;
  /** The component's double-tap guard, shared across calls. */
  started: { current: boolean };
  /** The fullscreen attempt; may reject — a refusal is not a routing failure. */
  requestFullscreen: () => Promise<void>;
  /** The tap's own feedback (click sound, stage-2 preload). Runs after fullscreen. */
  playFeedback: () => void;
  onContinueAdventure: () => void;
  onNewCharacter: () => void;
}

/**
 * Runs the primary action once. Returns the destination it routed to, or `null` when
 * the guard rejected a second tap (the first tap's destination is the only one).
 */
export async function runTitlePrimaryAction(
  ctx: TitlePrimaryActionContext,
): Promise<TitleDestination | null> {
  if (ctx.started.current) return null;
  ctx.started.current = true;

  // Attempt fullscreen. Orientation is left to the device's own controls.
  try {
    await ctx.requestFullscreen();
  } catch {
    // Graceful fail — a refused fullscreen never blocks the game.
  }

  ctx.playFeedback();

  if (ctx.savedProfile) {
    ctx.onContinueAdventure();
    return 'continue';
  }
  ctx.onNewCharacter();
  return 'new_character';
}
