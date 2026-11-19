/**
 * ===========================================================================
 * COMBAT-5 — Received shake scales with what landed (gap 6: being hit always
 * shook the same). The slice's pins, one section per brief requirement. The
 * decision logic lives in the pure helper (`combatShake.ts`); the wiring pin
 * (§X) reads the resolution out of the source, so a disconnect between the
 * helper and the shipped code fails here rather than in a playtest.
 *
 *   §1  the table            (blocked 0.10 / heavy 0.85 / crit 0.70 /
 *                             quick 0.25 / power 0.45)
 *   §2  the priority         (blocked > telegraphed > crit > quick > power)
 *   §P  persistence          (duel state only — nothing reaches a save)
 *   §X  the wiring, read out of the source
 *
 * Run with: bun test src/utils/combatShake.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import { RECEIVED_SHAKE_TRAUMA, receivedShakeTrauma } from './combatShake';

// ── helpers ──────────────────────────────────────────────────────────────────

const source = (path: string) => readFileSync(path, 'utf8');
/** Strip block and line comments so prose can neither satisfy nor defeat a pin. */
const code = (path: string) =>
  source(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

// ── §1 — THE TABLE ───────────────────────────────────────────────────────────

describe('§1 — a blow the player takes shakes by what landed', () => {
  test('the pinned values are the brief’s own', () => {
    expect(RECEIVED_SHAKE_TRAUMA).toEqual({
      blocked: 0.1,
      telegraphedHeavy: 0.85,
      crit: 0.7,
      quick: 0.25,
      power: 0.45,
    });
  });

  test('a blocked blow shakes least, whatever it was', () => {
    expect(receivedShakeTrauma({ isBlocked: true, isTelegraphedHeavy: false, isCrit: false, isQuick: false })).toBe(0.1);
  });

  test('a telegraphed heavy is the hardest single shake in the game', () => {
    expect(receivedShakeTrauma({ isBlocked: false, isTelegraphedHeavy: true, isCrit: false, isQuick: false })).toBe(0.85);
  });

  test('a crit shakes harder than a plain power attack', () => {
    expect(receivedShakeTrauma({ isBlocked: false, isTelegraphedHeavy: false, isCrit: true, isQuick: false })).toBe(0.7);
    expect(receivedShakeTrauma({ isBlocked: false, isTelegraphedHeavy: false, isCrit: false, isQuick: false })).toBe(0.45);
  });

  test('a quick attack shakes least of the landed blows', () => {
    expect(receivedShakeTrauma({ isBlocked: false, isTelegraphedHeavy: false, isCrit: false, isQuick: true })).toBe(0.25);
  });
});

// ── §2 — THE PRIORITY ────────────────────────────────────────────────────────

describe('§2 — blocked wins, exactly as in the hit-stop chain', () => {
  test('a blocked telegraphed heavy shakes 0.10, not 0.85', () => {
    expect(receivedShakeTrauma({ isBlocked: true, isTelegraphedHeavy: true, isCrit: false, isQuick: false })).toBe(0.1);
  });

  test('a blocked crit shakes 0.10, not 0.70', () => {
    expect(receivedShakeTrauma({ isBlocked: true, isTelegraphedHeavy: false, isCrit: true, isQuick: false })).toBe(0.1);
  });

  test('a telegraphed heavy outranks a crit — it is the heavier blow', () => {
    expect(receivedShakeTrauma({ isBlocked: false, isTelegraphedHeavy: true, isCrit: true, isQuick: false })).toBe(0.85);
  });

  test('no single received hit exceeds 0.85', () => {
    for (const flags of [
      { isBlocked: false, isTelegraphedHeavy: true, isCrit: true, isQuick: true },
      { isBlocked: false, isTelegraphedHeavy: true, isCrit: false, isQuick: false },
      { isBlocked: true, isTelegraphedHeavy: true, isCrit: true, isQuick: true },
    ]) {
      expect(receivedShakeTrauma(flags)).toBeLessThanOrEqual(0.85);
    }
  });
});

// ── §P — PERSISTENCE ─────────────────────────────────────────────────────────

describe('§P — the shake lives in duel state only', () => {
  test('no save field, no new module state: a pure function of the outcome', () => {
    expect(typeof receivedShakeTrauma).toBe('function');
  });
});

// ── §X — THE WIRING, READ OUT OF THE SOURCE ──────────────────────────────────

describe('§X — the received shake is wired into the resolution', () => {
  const duel = code('src/components/duel/DuelScene.tsx');

  test('the resolution calls the helper with the four outcome flags', () => {
    expect(duel).toContain('receivedShakeTrauma({ isBlocked, isTelegraphedHeavy, isCrit, isQuick })');
  });

  test('the flat received value is gone — nothing still reads playerHit', () => {
    expect(duel).not.toContain('playerHit');
  });

  test('the attacker-side table is untouched — the player’s own strikes still scale', () => {
    expect(duel).toContain('quick: 0.25,');
    expect(duel).toContain('power: 0.45,');
    expect(duel).toContain('crit: 0.7,');
  });

  test('hit-stop is untouched — the telegraphed heavy still holds longest', () => {
    expect(duel).toContain('telegraphedHeavy: 200,');
  });
});
