// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { getCityFacingYaw } from './cityFacing';

describe('city player facing follows the camera forward convention', () => {
  test('north/south movement respects the Roman rig local +Z forward axis', () => {
    expect(getCityFacingYaw(0, 1)).toBeCloseTo(0, 10);
    expect(Math.abs(getCityFacingYaw(0, -1))).toBeCloseTo(Math.PI, 10);
  });

  test('east/west movement faces the direction of travel', () => {
    expect(getCityFacingYaw(1, 0)).toBeCloseTo(Math.PI / 2, 10);
    expect(getCityFacingYaw(-1, 0)).toBeCloseTo(-Math.PI / 2, 10);
  });

  test('diagonal movement preserves its direction', () => {
    const yaw = getCityFacingYaw(1, -1);
    expect(Math.sin(yaw)).toBeCloseTo(Math.SQRT1_2, 10);
    expect(Math.cos(yaw)).toBeCloseTo(-Math.SQRT1_2, 10);
  });
});
