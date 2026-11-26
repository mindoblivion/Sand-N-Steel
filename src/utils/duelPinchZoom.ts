/**
 * ===========================================================================
 * PHASE1-TOUCH — Duel pinch zoom: two-pointer distance → camera distance.
 *
 * The duel camera's only zoom was cycling three modes through one HUD button.
 * On a phone, where pinch is the expected zoom, there was no zoom control at
 * all. This module is the pinch: a pure helper that turns the distance between
 * two pointers into the camera distance the rig should hold, plus the small
 * state machine that tracks a gesture (so the React side stays thin).
 *
 * The feel:
 * - Proportional, not stepped: the camera distance scales with the ratio of
 *   the fingers' spread to the spread at gesture start, so a pinch-out
 *   (fingers apart) moves the camera in and a pinch-in moves it out — the
 *   same direction every phone camera uses.
 * - Anchored per gesture: the spread and the camera distance at the second
 *   finger's touchdown are the anchor, so a pinch never jumps on first
 *   contact and never drifts as the gesture goes on.
 * - Dead-zoned: a spread change under DUEL_PINCH_DEAD_ZONE_PX moves nothing,
 *   so a two-finger drag that is really an orbit does not jitter the zoom.
 * - Clamped to the shipped camera range (3.5–16, the same clamp the rig
 *   already applies): a pinch past either end lands on the end, not past it.
 *
 * What this module does NOT do: it never touches the camera, the guard floor,
 * or any React state. The rig reads the resolved distance and the CAMGUARD
 * floor still only ever raises it — a pinch asking for less than the floor
 * gets the floor. One pointer on its own is never a pinch: a single-pointer
 * drag produces no zoom delta at all, so the orbit drag is untouched.
 * ===========================================================================
 */

/** The shipped camera range: the same clamp the rig applies to every distance. */
export const DUEL_CAMERA_MIN_DISTANCE = 3.5;
export const DUEL_CAMERA_MAX_DISTANCE = 16;

/** A spread change under this many pixels is jitter, not a pinch. */
export const DUEL_PINCH_DEAD_ZONE_PX = 8;

/** The distance between two pointers, in screen pixels. */
export function pinchDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

/**
 * Resolve a pinch to a camera distance: the anchor spread and the anchor
 * distance are the gesture's start, the current spread is where the fingers
 * are now. Fingers apart (spread up) moves the camera in; fingers together
 * moves it out. Sub-threshold spread changes return the anchor distance
 * unchanged, and the result is clamped to the shipped camera range.
 */
export function resolvePinchZoom(
  anchorDistancePx: number,
  currentDistancePx: number,
  anchorZoom: number,
): number {
  if (!(anchorDistancePx > 0) || !(currentDistancePx > 0)) return anchorZoom;
  if (Math.abs(currentDistancePx - anchorDistancePx) < DUEL_PINCH_DEAD_ZONE_PX) {
    return anchorZoom;
  }
  const desired = (anchorZoom * anchorDistancePx) / currentDistancePx;
  return Math.max(DUEL_CAMERA_MIN_DISTANCE, Math.min(DUEL_CAMERA_MAX_DISTANCE, desired));
}

/** The gesture tracker: which pointers are down, and the gesture's anchor. */
export interface PinchZoomTracker {
  /**
   * A pointer went down on the Canvas. The second pointer starts the gesture:
   * its spread and the live camera distance become the anchor.
   */
  pointerDown(id: number, x: number, y: number, currentDistance: number): void;
  /**
   * A tracked pointer moved. Returns the resolved camera distance while a
   * pinch is live, or `null` when no zoom applies — a single pointer, an
   * untracked pointer, or a gesture that never started.
   */
  pointerMove(id: number, x: number, y: number): number | null;
  /** A pointer went up (or was cancelled): the gesture ends below two pointers. */
  pointerUp(id: number): void;
  /** Release the gesture outright (focus loss, modal, unmount). */
  cancel(): void;
}

/** A fresh tracker: no pointers down, no anchor. */
export function createPinchZoomTracker(): PinchZoomTracker {
  const pointers = new Map<number, { x: number; y: number }>();
  let anchorDistancePx: number | null = null;
  let anchorZoom: number | null = null;

  const clearAnchor = () => {
    anchorDistancePx = null;
    anchorZoom = null;
  };

  return {
    pointerDown(id, x, y, currentDistance) {
      if (pointers.size >= 2 && !pointers.has(id)) return;
      pointers.set(id, { x, y });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        anchorDistancePx = pinchDistance(a.x, a.y, b.x, b.y);
        anchorZoom = currentDistance;
      }
    },

    pointerMove(id, x, y) {
      const pointer = pointers.get(id);
      if (!pointer) return null;
      pointer.x = x;
      pointer.y = y;
      if (pointers.size !== 2 || anchorDistancePx === null || anchorZoom === null) {
        return null;
      }
      const [a, b] = [...pointers.values()];
      return resolvePinchZoom(anchorDistancePx, pinchDistance(a.x, a.y, b.x, b.y), anchorZoom);
    },

    pointerUp(id) {
      pointers.delete(id);
      if (pointers.size < 2) clearAnchor();
    },

    cancel() {
      pointers.clear();
      clearAnchor();
    },
  };
}
