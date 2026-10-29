/**
 * drawbridge.test.ts - DB-1 The Working Drawbridge mechanics tests.
 *
 * Pins the shared mechanics literals and the moat water-respawn rule.
 */
// @ts-ignore: bun:test is provided by the bun runtime; tsc has no bun-types here
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  BRIDGE_DECK_HALF_WIDTH,
  BRIDGE_DECK_Z_INNER,
  BRIDGE_DECK_Z_OUTER,
  DRAWBRIDGE_ANIM_DURATION,
  DRAWBRIDGE_CHAIN_SAG,
  DRAWBRIDGE_RAISED_ANGLE,
  MOAT_RESPAWN_POS,
  checkMoatRespawn,
} from './drawbridge';

describe('drawbridge mechanics literals (DB-1)', () => {
  test('pins the four shared literals', () => {
    expect(DRAWBRIDGE_RAISED_ANGLE).toBe((75 * Math.PI) / 180);
    expect(DRAWBRIDGE_ANIM_DURATION).toBe(2.5);
    expect(DRAWBRIDGE_CHAIN_SAG).toBe(0.8);
    expect(MOAT_RESPAWN_POS).toEqual([0, 0, -48]);
  });

  test('pins the measured deck constants', () => {
    expect(BRIDGE_DECK_HALF_WIDTH).toBe(2.0);
    expect(BRIDGE_DECK_Z_OUTER).toBe(-50.5);
    expect(BRIDGE_DECK_Z_INNER).toBe(-56.5);
  });
});

describe('checkMoatRespawn', () => {
  test('[0,0,-53] in the moat ring, bridge raised -> respawn', () => {
    expect(checkMoatRespawn(0, 0, -53, true)).toEqual([0, 0, -48]);
  });

  test('[0,0.16,-53] on the deck, bridge down -> null', () => {
    expect(checkMoatRespawn(0, 0.16, -53, false)).toBeNull();
  });

  test('[0,0,-53] bridge raised -> respawn', () => {
    expect(checkMoatRespawn(0, 0, -53, true)).toEqual([0, 0, -48]);
  });

  test('[0,0,-40] outside the ring -> null', () => {
    expect(checkMoatRespawn(0, 0, -40, false)).toBeNull();
  });

  test('[10,0,-81.5] is inside the inner radius -> null (not in the ring)', () => {
    // dist = sqrt(10^2 + 0^2) = 10 < 25: inside the inner radius, so per
    // the normative distance rule this point is NOT in the moat ring.
    expect(checkMoatRespawn(10, 0, -81.5, false)).toBeNull();
  });

  test('[28,0,-81.5] in the ring east -> respawn', () => {
    expect(checkMoatRespawn(28, 0, -81.5, false)).toEqual([0, 0, -48]);
  });

  test('player above the water (Y = 1.0) -> null', () => {
    expect(checkMoatRespawn(5, 1.0, -53, false)).toBeNull();
  });

  test('ring boundaries are inclusive', () => {
    // dist exactly 25.0 at the inner edge and 31.0 at the outer edge.
    expect(checkMoatRespawn(0, 0, -56.5, true)).toEqual([0, 0, -48]);
    expect(checkMoatRespawn(0, 0, -50.5, true)).toEqual([0, 0, -48]);
  });
});

describe('drawbridge module purity', () => {
  test('module source contains no Math.random', () => {
    const source = readFileSync(new URL('./drawbridge.ts', import.meta.url), 'utf8');
    const codeLines = source.split('\n').filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('*') && !trimmed.startsWith('//');
    });
    expect(codeLines.join('\n')).not.toContain('Math.random');
  });
});
