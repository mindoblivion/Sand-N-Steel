/**
 * ===========================================================================
 * COMBAT-5 — Sidestep (gap 5: positioning is one-dimensional). The slice's
 * pins, one section per brief requirement. The decision logic lives in the
 * pure helpers (`combatSidestep.ts`); the wiring pins (§X) read the
 * resolution and the panel out of the sources, so a disconnect between the
 * helpers and the shipped code fails here rather than in a playtest.
 *
 *   §1  the move             (1.8 m, bounce at ±3.6 m, never out of the ring)
 *   §2  the dodge            (≥ 1.2 m off the announced line whiffs the heavy)
 *   §P  persistence          (duel state only — nothing reaches a save)
 *   §X  the wiring, read out of the sources
 *
 * Run with: bun test src/utils/combatSidestep.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  SIDESTEP_BOUND_M,
  SIDESTEP_CLEAR_M,
  SIDESTEP_DISTANCE_M,
  sidestepDodgesHeavy,
  sidestepPositionX,
} from './combatSidestep';

// ── helpers ──────────────────────────────────────────────────────────────────

const source = (path: string) => readFileSync(path, 'utf8');
/** Strip block and line comments so prose can neither satisfy nor defeat a pin. */
const code = (path: string) =>
  source(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

// ── §1 — THE MOVE ────────────────────────────────────────────────────────────

describe('§1 — one sidestep moves 1.8 m laterally and bounces at the bounds', () => {
  test('the pinned values are the brief’s own', () => {
    expect(SIDESTEP_DISTANCE_M).toBe(1.8);
    expect(SIDESTEP_BOUND_M).toBe(3.6);
    expect(SIDESTEP_CLEAR_M).toBe(1.2);
  });

  test('from centre the first step is +X', () => {
    expect(sidestepPositionX(0)).toBe(1.8);
  });

  test('two steps reach the bound, the third bounces back', () => {
    expect(sidestepPositionX(1.8)).toBe(3.6);
    expect(sidestepPositionX(3.6)).toBe(1.8);
  });

  test('the negative side mirrors exactly', () => {
    expect(sidestepPositionX(-1.8)).toBe(-3.6);
    expect(sidestepPositionX(-3.6)).toBe(-1.8);
  });

  test('repeated taps never leave the ring, either way', () => {
    // The walk oscillates 1.8 ↔ 3.6 once it reaches the bound: it never
    // returns to centre on its own, and it never exceeds the bound.
    let x = 0;
    for (let i = 0; i < 12; i += 1) {
      x = sidestepPositionX(x);
      expect(Math.abs(x)).toBeLessThanOrEqual(3.6);
    }
    expect(x).toBe(3.6);
    // …and the negative side bounces the same way, starting one step in.
    let y = -1.8;
    for (let i = 0; i < 11; i += 1) {
      y = sidestepPositionX(y);
      expect(Math.abs(y)).toBeLessThanOrEqual(3.6);
    }
    expect(y).toBe(-3.6);
  });
});

// ── §2 — THE DODGE ───────────────────────────────────────────────────────────

describe('§2 — a telegraphed heavy whiffs ≥ 1.2 m off the announced line', () => {
  test('standing on the announced line is hit', () => {
    expect(sidestepDodgesHeavy(0, 0)).toBe(false);
  });

  test('one sidestep (1.8 m) always clears it', () => {
    expect(sidestepDodgesHeavy(1.8, 0)).toBe(true);
    expect(sidestepDodgesHeavy(-1.8, 0)).toBe(true);
  });

  test('exactly 1.2 m clears it; a hair under does not', () => {
    expect(sidestepDodgesHeavy(1.2, 0)).toBe(true);
    expect(sidestepDodgesHeavy(1.19, 0)).toBe(false);
  });

  test('the check reads the ANNOUNCED line, not the sidestep itself', () => {
    // A sidestep taken before any announcement dodges nothing: each
    // announcement re-records the defender's X, so the same 1.8 m that
    // cleared the old line is standing on the new one.
    expect(sidestepDodgesHeavy(1.8, 1.8)).toBe(false);
    expect(sidestepDodgesHeavy(1.8, 0)).toBe(true);
  });
});

// ── §P — PERSISTENCE ─────────────────────────────────────────────────────────

describe('§P — the sidestep lives in duel state only', () => {
  test('no save field, no new module state: X is runtime fighter state', () => {
    // The helpers are pure functions of their inputs; the only state the
    // slice writes is the fighter's `position[0]`, which the duel resets at
    // fight start ([0, 0, ±3.5]). Nothing here touches storage.
    expect(typeof sidestepPositionX).toBe('function');
    expect(typeof sidestepDodgesHeavy).toBe('function');
  });
});

// ── §X — THE WIRING, READ OUT OF THE SOURCES ─────────────────────────────────

describe('§X — the sidestep is wired into the duel and the panel', () => {
  const duel = code('src/components/duel/DuelScene.tsx');
  const panel = code('src/components/ui/TurnActionPanel.tsx');
  const hud = code('src/components/ui/CombatHUD.tsx');

  test('the movement branch steps X only, plays walk, regenerates stamina', () => {
    const branch = duel.indexOf("else if (actionType === 'sidestep')");
    expect(branch).toBeGreaterThan(-1);
    const body = duel.slice(branch, duel.indexOf("else if (actionType === 'shield_block')", branch));
    expect(body).toContain('sidestepPositionX(');
    expect(body).toContain("action: 'walk'");
    expect(body).toContain('applyStaminaRegen(');
    // Z is preserved, never rewritten: the sidestep moves X alone.
    expect(body).toContain('prev.position[2]');
    expect(body).not.toContain('position: [0, 0,');
  });

  test('advance and retreat preserve X — no snap back to centre', () => {
    expect(duel).toContain('position: [prev.position[0], 0, targetZ]');
    expect(duel).not.toContain('position: [0, 0, targetZ]');
  });

  test('the telegraph branch records the defender’s X — real heavies only', () => {
    const announce = duel.indexOf("else if (actionType === 'telegraph')");
    const castNet = duel.indexOf("else if (actionType === 'cast_net')", announce);
    const branch = duel.slice(announce, castNet);
    expect(branch).toContain('telegraphTargetXRef.current = defender.position[0]');
    expect(branch).toContain('if (!isCounterWindup)');
    // The beast crouch is a separate branch and never touches the ref.
    const crouch = duel.indexOf("else if (actionType === 'beast_crouch'");
    const crouchEnd = duel.indexOf('else if (actionType ===', crouch + 1);
    expect(duel.slice(crouch, crouchEnd)).not.toContain('telegraphTargetXRef');
  });

  test('a sidestepped heavy takes the evade path — SIDESTEPPED!, no damage', () => {
    expect(duel).toContain('sidestepDodgesHeavy(defender.position[0], telegraphTargetXRef.current)');
    expect(duel).toContain("spawnDamageText('SIDESTEPPED!', 'dodge', defender.position)");
    // The whiff branch sits before the ordinary evade branch, so a
    // sidestepped heavy never falls through to a hit roll.
    const whiff = duel.indexOf("spawnDamageText('SIDESTEPPED!'");
    const evaded = duel.indexOf("spawnDamageText('EVADED!'");
    expect(whiff).toBeGreaterThan(-1);
    expect(evaded).toBeGreaterThan(-1);
    expect(whiff).toBeLessThan(evaded);
  });

  test('the panel offers Sidestep only while a real heavy telegraph is live', () => {
    expect(panel).toContain("'sidestep'");
    expect(panel).toContain('heavyTelegraphLive');
    expect(panel).toContain("onExecuteAction('sidestep')");
    expect(panel).toContain('Step sideways off the line (1.8m)');
    // The enablement reads the dedicated prop, never the shared banner flag.
    expect(panel).not.toContain('telegraphText');
    // The HUD passes the prop through from the scene.
    expect(hud).toContain('heavyTelegraphLive={heavyTelegraphLive}');
    expect(duel).toContain('heavyTelegraphLive={');
    expect(duel).toContain("opp.telegraphText === 'HEAVY ATTACK INCOMING'");
    expect(duel).toContain('opp.telegraphText === CROSSING_TELEGRAPH_WORDS');
  });

  test('the sidestep resolves on the shared 800 ms utility beat', () => {
    expect(duel).toContain('sidestep: 800,');
  });
});
