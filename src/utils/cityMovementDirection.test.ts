// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { getCameraRelativeMovement } from './cityMovementDirection';

describe('camera-relative city movement direction', () => {
  test('at default camera yaw, up is forward (+Z) and right is +X', () => {
    const forward = getCameraRelativeMovement(0, -1, 0);
    expect(forward.x).toBeCloseTo(0, 10);
    expect(forward.z).toBeCloseTo(1, 10);

    const right = getCameraRelativeMovement(1, 0, 0);
    expect(right.x).toBeCloseTo(1, 10);
    expect(right.z).toBeCloseTo(0, 10);

    const left = getCameraRelativeMovement(-1, 0, 0);
    expect(left.x).toBeCloseTo(-1, 10);
    expect(left.z).toBeCloseTo(0, 10);

    const backward = getCameraRelativeMovement(0, 1, 0);
    expect(backward.x).toBeCloseTo(0, 10);
    expect(backward.z).toBeCloseTo(-1, 10);
  });

  test('rotates the same screen-space controls with the camera orbit', () => {
    const right = getCameraRelativeMovement(1, 0, Math.PI / 2);
    expect(right.x).toBeCloseTo(0, 10);
    expect(right.z).toBeCloseTo(-1, 10);

    const forward = getCameraRelativeMovement(0, -1, Math.PI / 2);
    expect(forward.x).toBeCloseTo(1, 10);
    expect(forward.z).toBeCloseTo(0, 10);
  });

  test('preserves diagonal magnitude and direction', () => {
    const diagonal = getCameraRelativeMovement(Math.SQRT1_2, -Math.SQRT1_2, 0);
    expect(diagonal.x).toBeCloseTo(Math.SQRT1_2, 10);
    expect(diagonal.z).toBeCloseTo(Math.SQRT1_2, 10);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(1, 10);
  });
});
