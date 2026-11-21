import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';

export interface InteriorStickVector {
  x: number;
  y: number;
}

export interface InteriorInputOptions {
  /** When true (dialogue/panel open), releases active inputs and ignores new movement. */
  locked?: boolean;
  /** Optional Space/E interact callback when not locked. */
  onInteract?: () => void;
  /** Optional Escape callback (e.g. closing an active dialogue). */
  onEscape?: () => void;
}

export interface InteriorInputResult {
  keysRef: React.MutableRefObject<Record<string, boolean>>;
  stickRef: React.MutableRefObject<InteriorStickVector>;
  joystickRef: React.RefObject<HTMLDivElement | null>;
  joystickKnobRef: React.RefObject<HTMLDivElement | null>;
  resetAllInputs: () => void;
  joystickHandlers: {
    onTouchStart: (e: React.TouchEvent<HTMLDivElement>) => void;
    onTouchMove: (e: React.TouchEvent<HTMLDivElement>) => void;
    onTouchEnd: (e: React.TouchEvent<HTMLDivElement>) => void;
    onTouchCancel: (e: React.TouchEvent<HTMLDivElement>) => void;
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
  };
}

/**
 * Shared, web-portable virtual joystick + keyboard input controller for 3D interiors.
 *
 * - Updates the joystick knob via direct `translate3d` transforms (zero React re-renders per touch sample).
 * - Isolates a single touch identifier (or non-touch pointerId with capture) so multi-touch never steals the stick.
 * - Guarantees complete input release on window `blur`, `visibilitychange` (hidden), unmount, or `locked`.
 */
export function useInteriorInput(options: InteriorInputOptions = {}): InteriorInputResult {
  const { locked = false, onInteract, onEscape } = options;

  const keysRef = useRef<Record<string, boolean>>({});
  const stickRef = useRef<InteriorStickVector>({ x: 0, y: 0 });
  const joystickRef = useRef<HTMLDivElement | null>(null);
  const joystickKnobRef = useRef<HTMLDivElement | null>(null);
  const touchIdRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const onInteractRef = useRef(onInteract);
  onInteractRef.current = onInteract;
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  const resetKnobTransform = useCallback(() => {
    if (joystickKnobRef.current) {
      joystickKnobRef.current.style.transform = 'translate3d(0px, 0px, 0)';
    }
  }, []);

  const resetStick = useCallback(() => {
    touchIdRef.current = null;
    pointerIdRef.current = null;
    stickRef.current = { x: 0, y: 0 };
    resetKnobTransform();
  }, [resetKnobTransform]);

  const resetAllInputs = useCallback(() => {
    keysRef.current = {};
    resetStick();
  }, [resetStick]);

  // Clear held movement whenever a panel/dialogue locks input or on unmount.
  useEffect(() => {
    if (locked) {
      resetAllInputs();
    }
  }, [locked, resetAllInputs]);

  // Android WebViews / mobile browsers can suspend or steal focus without sending touchend/keyup.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        resetAllInputs();
      }
    };
    window.addEventListener('blur', resetAllInputs);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('blur', resetAllInputs);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      resetAllInputs();
    };
  }, [resetAllInputs]);

  // Keyboard: WASD / arrows to walk, E / Space to interact, Escape to back out.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.key === 'Escape') {
        onEscapeRef.current?.();
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      if (lockedRef.current) return;
      keysRef.current[e.code] = true;
      if (e.code === 'KeyE' || e.code === 'Space') {
        onInteractRef.current?.();
      }
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const updateStickFromClient = useCallback((clientX: number, clientY: number) => {
    const el = joystickRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const maxDist = rect.width * 0.42;
    if (maxDist <= 0) return;

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxDist) {
      dx = (dx / dist) * maxDist;
      dy = (dy / dist) * maxDist;
    }

    if (joystickKnobRef.current) {
      joystickKnobRef.current.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    }
    stickRef.current = { x: dx / maxDist, y: dy / maxDist };
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.cancelable) e.preventDefault();
      if (lockedRef.current || touchIdRef.current !== null) return;
      const t = e.changedTouches[0];
      if (!t) return;
      touchIdRef.current = t.identifier;
      updateStickFromClient(t.clientX, t.clientY);
    },
    [updateStickFromClient],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.cancelable) e.preventDefault();
      if (lockedRef.current || touchIdRef.current === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === touchIdRef.current) {
          updateStickFromClient(t.clientX, t.clientY);
          break;
        }
      }
    },
    [updateStickFromClient],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (touchIdRef.current === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchIdRef.current) {
          resetStick();
          break;
        }
      }
    },
    [resetStick],
  );

  // Non-touch pointer fallback (mouse / stylus / ChromeOS / foldables)
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch') return;
      if (lockedRef.current || pointerIdRef.current !== null) return;
      pointerIdRef.current = e.pointerId;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture is unavailable in synthetic test DOMs.
      }
      updateStickFromClient(e.clientX, e.clientY);
    },
    [updateStickFromClient],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch') return;
      if (lockedRef.current || pointerIdRef.current !== e.pointerId) return;
      updateStickFromClient(e.clientX, e.clientY);
    },
    [updateStickFromClient],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch') return;
      if (pointerIdRef.current === e.pointerId) {
        try {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        } catch {
          // Safe fallback
        }
        resetStick();
      }
    },
    [resetStick],
  );

  return {
    keysRef,
    stickRef,
    joystickRef,
    joystickKnobRef,
    resetAllInputs,
    joystickHandlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: onTouchEnd,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
