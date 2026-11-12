// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { createRacePointerHold } from './racePointerHold';

describe('race pointer hold lifecycle', () => {
  test('accepts one pointer and ignores a second pointer on the same button', () => {
    const hold = createRacePointerHold();
    expect(hold.begin(11)).toBe(true);
    expect(hold.begin(12)).toBe(false);
    expect(hold.isActive()).toBe(true);
    expect(hold.end(12)).toBe(false);
    expect(hold.isActive()).toBe(true);
  });

  test('only the active pointer can release the hold', () => {
    const hold = createRacePointerHold();
    expect(hold.begin(7)).toBe(true);
    expect(hold.end(8)).toBe(false);
    expect(hold.end(7)).toBe(true);
    expect(hold.isActive()).toBe(false);
  });

  test('cancel, lost capture, and unmount can share an idempotent reset', () => {
    const hold = createRacePointerHold();
    expect(hold.begin(4)).toBe(true);
    expect(hold.reset()).toBe(true);
    expect(hold.reset()).toBe(false);
    expect(hold.end(4)).toBe(false);
    expect(hold.begin(5)).toBe(true);
  });

  test('independent controls can hold different pointers simultaneously', () => {
    const steering = createRacePointerHold();
    const throttle = createRacePointerHold();
    expect(steering.begin(21)).toBe(true);
    expect(throttle.begin(22)).toBe(true);
    expect(steering.end(21)).toBe(true);
    expect(throttle.isActive()).toBe(true);
  });
});
