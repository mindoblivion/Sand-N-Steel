/**
 * Resolves overlapping holds on one driving axis.
 * The most recently pressed control wins; releasing it restores the most
 * recently pressed control that is still held. Each axis has its own instance.
 */
export interface RaceAxisHold {
  press(control: string, value: number): number;
  release(control: string): number;
  reset(): number;
  value(): number;
}

export const createRaceAxisHold = (): RaceAxisHold => {
  const held = new Map<string, number>();
  const current = () => {
    const values = Array.from(held.values());
    return values.length ? values[values.length - 1] : 0;
  };

  return {
    press(control, value) {
      held.delete(control);
      held.set(control, value);
      return current();
    },
    release(control) {
      held.delete(control);
      return current();
    },
    reset() {
      held.clear();
      return 0;
    },
    value: current,
  };
};
