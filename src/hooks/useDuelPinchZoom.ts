import { useEffect, useRef } from 'react';
import { createPinchZoomTracker } from '../utils/duelPinchZoom';
import { isInteractiveCameraUI } from './useCameraDrag';

interface UseDuelPinchZoomOptions {
  /** Disable the pinch while a modal, dialogue, or menu overlay owns the screen. */
  disabled?: boolean;
  /** The camera's live distance, read at the gesture's start (the anchor). */
  getCurrentDistance: () => number;
  /** Called with the resolved absolute camera distance while pinching. */
  onZoomChange: (distance: number) => void;
}

/**
 * PHASE1-TOUCH — pinch-to-zoom for the duel camera, the fine control beside
 * the camera-mode button's coarse one.
 *
 * The gesture begins on the Canvas (pointerdown on the canvas element), and
 * the move/up/cancel listeners live on the window — the same shape as the
 * drag hook, so a finger that slides off the canvas mid-pinch still releases
 * cleanly. The same `isInteractiveCameraUI` exclusion applies (a pinch that
 * starts on a button or a panel is the UI's), and the same focus-loss release
 * (blur / visibilitychange) clears the gesture without snapping the camera
 * anywhere. The hook never touches the camera itself: it resolves a distance
 * through the pure helper and hands it to the rig, which still clamps it to
 * the shipped 3.5–16 range and still floors it under the CAMGUARD floor.
 *
 * A single pointer is never a pinch — the tracker returns null for it, so
 * the orbit drag and the pinch share the Canvas without fighting: one finger
 * orbits, two fingers zoom (and orbit at once, if the drag is already
 * holding the first finger).
 */
export function useDuelPinchZoom(
  canvas: HTMLCanvasElement | null,
  options: UseDuelPinchZoomOptions,
): void {
  const trackerRef = useRef(createPinchZoomTracker());
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!canvas || typeof window === 'undefined') return;
    const tracker = trackerRef.current;

    const handlePointerDown = (e: PointerEvent) => {
      if (optionsRef.current.disabled) return;
      if (isInteractiveCameraUI(e.target as HTMLElement)) return;
      tracker.pointerDown(e.pointerId, e.clientX, e.clientY, optionsRef.current.getCurrentDistance());
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (optionsRef.current.disabled) {
        tracker.cancel();
        return;
      }
      const desired = tracker.pointerMove(e.pointerId, e.clientX, e.clientY);
      if (desired !== null) optionsRef.current.onZoomChange(desired);
    };

    const handlePointerEnd = (e: PointerEvent) => {
      tracker.pointerUp(e.pointerId);
    };

    // Android can interrupt a gesture when the app is backgrounded or the
    // system UI takes focus. Release the pinch without snapping the camera
    // back — the offset the rig already holds stays where the gesture left it.
    const handleInputInterruption = () => {
      tracker.cancel();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') handleInputInterruption();
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);
    window.addEventListener('blur', handleInputInterruption);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
      window.removeEventListener('blur', handleInputInterruption);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      tracker.cancel();
    };
  }, [canvas]);
}
