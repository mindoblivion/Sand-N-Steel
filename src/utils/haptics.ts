/**
 * haptics.ts — device vibration, behind the settings.
 *
 * `navigator.vibrate` is a no-op on every device that cannot buzz (desktop
 * browsers, iOS Safari, a denied permission) and is absent from the typing libs
 * this project compiles against, so this module is the single place the feature
 * is touched: it reads the player's `vibration` setting, checks for the API, and
 * stays silent when either says no.  A scene calls it and never has to ask
 * whether the device supports it.
 *
 * The patterns live here so the two call sites in the duel share one definition.
 */

import { getSettings } from '../services/settings';

/** The player's hit landed (the player's own strike connected). */
export const HAPTIC_HIT_LANDED_MS = 15;

/** The player was defeated — three short buzzes. */
export const HAPTIC_DEFEAT_PATTERN: readonly number[] = [30, 40, 30];

/**
 * Buzz, in the pattern asked for — unless the player has vibration off, or the
 * device cannot vibrate, in which case this is a silent no-op.
 */
export function vibrate(pattern: number | readonly number[]): void {
  try {
    if (!getSettings().vibration) return;
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    navigator.vibrate(pattern as number | number[]);
  } catch {
    // A device without haptics is not an error condition.
  }
}
