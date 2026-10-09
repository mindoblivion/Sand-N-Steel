import { useEffect, useRef } from 'react';

interface CameraDragOptions {
  yawSensitivity?: number;
  pitchSensitivity?: number;
  minPitch?: number;
  maxPitch?: number;
  autoDecayOnMove?: boolean;
}

export interface CameraDragState {
  yawOffsetRef: React.MutableRefObject<number>;
  pitchOffsetRef: React.MutableRefObject<number>;
  isDraggingRef: React.MutableRefObject<boolean>;
  resetDrag: () => void;
}

/**
 * Custom React Hook for Touch & Mouse Hold-and-Drag Camera Angle Control
 * Allows orbiting and adjusting pitch/elevation around 3D scenes
 */
export function useCameraDrag(
  isMoving = false,
  options: CameraDragOptions = {}
): CameraDragState {
  const {
    yawSensitivity = 0.0055,
    pitchSensitivity = 0.012,
    minPitch = -1.8,
    maxPitch = 3.5,
  } = options;

  const yawOffsetRef = useRef<number>(0);
  const pitchOffsetRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);

  const lastPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const activePointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isInteractiveUI = (target: HTMLElement | null): boolean => {
      if (!target) return false;
      return Boolean(
        target.closest('button') ||
          target.closest('input') ||
          target.closest('a') ||
          target.closest('[data-ui="true"]') ||
          target.closest('.pointer-events-auto')
      );
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (activePointerIdRef.current !== null) return;
      if (isInteractiveUI(e.target as HTMLElement)) return;

      activePointerIdRef.current = e.pointerId;
      isDraggingRef.current = true;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current || e.pointerId !== activePointerIdRef.current) return;

      const deltaX = e.clientX - lastPointerRef.current.x;
      const deltaY = e.clientY - lastPointerRef.current.y;

      lastPointerRef.current = { x: e.clientX, y: e.clientY };

      // Rotate camera yaw (horizontal orbit - inverted so dragging right orbits right)
      yawOffsetRef.current -= deltaX * yawSensitivity;

      // Adjust camera pitch (vertical elevation - dragging down looks down at player)
      pitchOffsetRef.current = Math.max(
        minPitch,
        Math.min(maxPitch, pitchOffsetRef.current + deltaY * pitchSensitivity)
      );
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.pointerId === activePointerIdRef.current) {
        isDraggingRef.current = false;
        activePointerIdRef.current = null;
      }
    };

    window.addEventListener('pointerdown', handlePointerDown, false);
    window.addEventListener('pointermove', handlePointerMove, false);
    window.addEventListener('pointerup', handlePointerUp, false);
    window.addEventListener('pointercancel', handlePointerUp, false);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [yawSensitivity, pitchSensitivity, minPitch, maxPitch]);

  // Decay yaw offset towards 0 when player starts running/moving
  useEffect(() => {
    if (!isMoving || isDraggingRef.current) return;

    let animId: number;
    const decayLoop = () => {
      if (!isDraggingRef.current && Math.abs(yawOffsetRef.current) > 0.001) {
        yawOffsetRef.current *= 0.94;
        animId = requestAnimationFrame(decayLoop);
      } else if (!isDraggingRef.current) {
        yawOffsetRef.current = 0;
      }
    };

    animId = requestAnimationFrame(decayLoop);
    return () => cancelAnimationFrame(animId);
  }, [isMoving]);

  const resetDrag = () => {
    yawOffsetRef.current = 0;
    pitchOffsetRef.current = 0;
    isDraggingRef.current = false;
  };

  return {
    yawOffsetRef,
    pitchOffsetRef,
    isDraggingRef,
    resetDrag,
  };
}
