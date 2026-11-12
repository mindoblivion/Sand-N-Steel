/**
 * Tracks one active pointer for a single hold-to-drive control.
 * Each button owns its own tracker, so steering and throttle can be held
 * simultaneously by two different fingers.
 */
export interface RacePointerHold {
  begin(pointerId: number): boolean;
  end(pointerId: number): boolean;
  reset(): boolean;
  isActive(): boolean;
}

export const createRacePointerHold = (): RacePointerHold => {
  let activePointerId: number | null = null;

  return {
    begin(pointerId) {
      if (activePointerId !== null) return false;
      activePointerId = pointerId;
      return true;
    },
    end(pointerId) {
      if (activePointerId !== pointerId) return false;
      activePointerId = null;
      return true;
    },
    reset() {
      if (activePointerId === null) return false;
      activePointerId = null;
      return true;
    },
    isActive() {
      return activePointerId !== null;
    },
  };
};
