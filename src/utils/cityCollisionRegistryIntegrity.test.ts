/**
 * Structural integrity checks for the live city collision registry.
 *
 * Collider IDs are keys in recovery/diagnostic sets, so they must be unique.
 * Geometry must also be finite and have positive dimensions; malformed
 * entries can otherwise poison collision and navigation calculations.
 *
 * This is a registry-level guard, not a claim that collision shapes perfectly
 * match rendered geometry (that still requires asset/scene review).
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { CITY_COLLIDERS } from './collisionShapes';

describe('city collision registry integrity', () => {
  test('every collider has a unique, non-empty ID', () => {
    const ids = CITY_COLLIDERS.map((collider) => collider.id);
    expect(ids.every((id) => typeof id === 'string' && id.trim().length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('all collider coordinates and dimensions are finite and valid', () => {
    const invalid: string[] = [];

    for (const collider of CITY_COLLIDERS) {
      if (collider.type === 'rect') {
        const values = [collider.cx, collider.cz, collider.hw, collider.hd];
        if (!values.every(Number.isFinite) || collider.hw <= 0 || collider.hd <= 0) {
          invalid.push(collider.id);
        }
      } else if (collider.type === 'circle') {
        const values = [collider.cx, collider.cz, collider.r];
        if (!values.every(Number.isFinite) || collider.r <= 0) invalid.push(collider.id);
      } else {
        const values = [collider.x1, collider.z1, collider.x2, collider.z2];
        if (!values.every(Number.isFinite)) invalid.push(collider.id);
      }
    }

    expect(invalid).toEqual([]);
  });
});
