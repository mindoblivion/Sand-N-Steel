/**
 * START-1 — the title's audio beat.
 *
 * The rule from the design: the title paints SILENT; the player's first tap anywhere
 * unlocks audio, and the title motif is the first sound they hear; after any
 * interruption the next tap anywhere silently re-arms. There is no error state for
 * sound, ever.
 *
 * This is WIRING, not an audio engine: both hooks already exist — `sounds.getAudioContext()`
 * creates/resumes the AudioContext and `music.play('title_main')` is already the track
 * `App`'s routing plays on the title screen. `music.play` clears its own current-track
 * id when a play fails (a suspended context, a missing file), so re-attempting it after a
 * gesture is exactly the supported retry.
 */

import { music } from './musicEngine';
import { sounds } from './soundEffects';

/** The title motif, as `App`'s music routing already names it. */
export const TITLE_MOTIF_TRACK = 'title_main';

/**
 * Try to start the title motif. Swallows everything: a browser that will not give an
 * AudioContext, a blocked `resume()`, a missing track — all of it is "the title stays
 * silent for now", never an error the player can see.
 */
export function unlockTitleAudio(): void {
  try {
    const ctx = sounds.getAudioContext();
    if (ctx && ctx.state !== 'running') {
      // A rejected resume is routine (no gesture yet, or an interrupted device); the
      // next tap re-arms and tries again.
      void ctx.resume().catch(() => {});
    }
  } catch {
    // No AudioContext in this browser/session — silence, not a failure.
  }

  try {
    void music.play(TITLE_MOTIF_TRACK);
  } catch {
    // Same: the motif is never allowed to surface an error.
  }
}

/**
 * Arm the one-shot unlock: the next tap or keypress anywhere unlocks audio and starts
 * the motif. It re-arms itself after an interruption — the page being backgrounded, or
 * the audio context falling out of `running` — so sound comes back on the next tap
 * rather than staying dead.
 *
 * Returns a teardown function, for the title's unmount.
 */
export function armTitleAudioUnlock(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  let armed = false;

  const onGesture = () => {
    if (!armed) return;
    armed = false;
    detachGesture();
    unlockTitleAudio();
  };

  function attachGesture() {
    document.addEventListener('pointerdown', onGesture, true);
    document.addEventListener('keydown', onGesture, true);
  }

  function detachGesture() {
    document.removeEventListener('pointerdown', onGesture, true);
    document.removeEventListener('keydown', onGesture, true);
  }

  /** After any interruption, the next tap anywhere re-arms. */
  const rearm = () => {
    if (armed) return;
    armed = true;
    attachGesture();
  };

  const onVisibilityChange = () => {
    if (document.hidden) rearm();
  };

  let ctx: AudioContext | null = null;
  const onStateChange = () => {
    if (ctx && ctx.state !== 'running') rearm();
  };

  try {
    ctx = sounds.getAudioContext();
    ctx.addEventListener('statechange', onStateChange);
  } catch {
    ctx = null;
  }

  if (!hasStarted()) rearm();
  document.addEventListener('visibilitychange', onVisibilityChange);

  function hasStarted(): boolean {
    try {
      return sounds.getAudioContext().state === 'running';
    } catch {
      return false;
    }
  }

  return () => {
    detachGesture();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    try {
      ctx?.removeEventListener('statechange', onStateChange);
    } catch {
      // Nothing to detach.
    }
  };
}
