// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { resolveCityStrideSpeed } from './cityMovementSpeed';

describe('city stride speed by body weight', () => {
  test('keeps the neutral baseline unchanged', () => {
    expect(resolveCityStrideSpeed(3.8, 180)).toBeCloseTo(3.8);
  });

  test('lighter builds move slightly faster', () => {
    expect(resolveCityStrideSpeed(3.8, 140)).toBeCloseTo(3.99);
  });

  test('heavier builds move slightly slower', () => {
    expect(resolveCityStrideSpeed(3.8, 300)).toBeCloseTo(3.23);
  });

  test('legacy or invalid weight uses the neutral baseline', () => {
    expect(resolveCityStrideSpeed(3.8, undefined)).toBeCloseTo(3.8);
    expect(resolveCityStrideSpeed(3.8, NaN)).toBeCloseTo(3.8);
  });

  test('invalid or negative base speeds fail closed', () => {
    expect(resolveCityStrideSpeed(-1, 180)).toBe(0);
    expect(resolveCityStrideSpeed(Number.NaN, 180)).toBe(0);
    expect(resolveCityStrideSpeed(Number.POSITIVE_INFINITY, 180)).toBe(0);
  });
});
