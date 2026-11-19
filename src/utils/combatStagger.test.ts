/**
 * ===========================================================================
 * COMBAT-1 — Stagger, Knockback, Recovery (plus the fair-range fix and the
 * weight strip). The slice's pins, one section per brief requirement.
 * Nothing here restates a formula: every expectation is computed with the
 * SHIPPED functions (`combatCalculations.ts`, `combatModifiers.ts`,
 * `combatStagger.ts`, `DuelScene`'s own `turnResolutionMs`), so a change to a
 * formula or a constant moves the assertions with it — except the locked
 * design values (1 turn, 1.2 m, the 9.0 m separation bound, the ±7.5 m
 * position bounds), which are the point of those pins.
 *
 *   §1  the trigger            (power / crit / telegraphed heavy stagger)
 *   §2  the non-triggers       (quick never, blocked power never)
 *   §3  the forced recovery    (one turn, flag clears, player AND AI)
 *   §4  knockback              (1.2 m away, clamped; nobody moves otherwise)
 *   §5  the fair-range fix     (out of range: no stamina, no turn)
 *   §6  the weight strip       (identical cost / damage / hold, multipliers gone)
 *   §P  persistence            (duel state only — nothing reaches a save)
 *   §X  the wiring, read out of the sources
 *
 * Run with: bun test src/utils/combatStagger.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';

import { calculateAttackDamage } from './combatCalculations';
import { EMPTY_MODIFIERS, staminaCostWithModifiers } from './combatModifiers';
import { turnResolutionMs } from '../components/duel/DuelScene';
import {
  ARENA_POSITION_MAX_M,
  ARENA_POSITION_MIN_M,
  ARENA_SEPARATION_MAX_M,
  KNOCKBACK_DISTANCE_M,
  STAGGER_TURNS_ON_LAND,
  isStaggered,
  knockbackPositionZ,
  shouldStaggerHit,
} from './combatStagger';

// ── helpers ──────────────────────────────────────────────────────────────────

const source = (path: string) => readFileSync(path, 'utf8');
/** Strip block and line comments so prose can neither satisfy nor defeat a pin. */
const code = (path: string) =>
  source(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

// ── §1 — THE TRIGGER ─────────────────────────────────────────────────────────

describe('§1 — a landed heavy staggers', () => {
  test('a landed power attack staggers', () => {
    expect(
      shouldStaggerHit({ isQuick: false, isCrit: false, isTelegraphedHeavy: false, isBlocked: false }),
    ).toBe(true);
  });

  test('a landed crit staggers', () => {
    // A crit can only come from a power attack, so it staggers on both counts.
    expect(
      shouldStaggerHit({ isQuick: false, isCrit: true, isTelegraphedHeavy: false, isBlocked: false }),
    ).toBe(true);
  });

  test('a telegraphed heavy that lands always staggers', () => {
    expect(
      shouldStaggerHit({ isQuick: false, isCrit: false, isTelegraphedHeavy: true, isBlocked: false }),
    ).toBe(true);
  });

  test('the stagger costs exactly one turn', () => {
    expect(STAGGER_TURNS_ON_LAND).toBe(1);
    expect(isStaggered(STAGGER_TURNS_ON_LAND)).toBe(true);
    expect(isStaggered(0)).toBe(false);
    expect(isStaggered(undefined)).toBe(false);
  });
});

// ── §2 — THE NON-TRIGGERS ────────────────────────────────────────────────────

describe('§2 — quick and blocked never stagger', () => {
  test('a quick attack never staggers', () => {
    expect(
      shouldStaggerHit({ isQuick: true, isCrit: false, isTelegraphedHeavy: false, isBlocked: false }),
    ).toBe(false);
  });

  test('a blocked power attack never staggers — blocking is the answer to heavies', () => {
    expect(
      shouldStaggerHit({ isQuick: false, isCrit: false, isTelegraphedHeavy: false, isBlocked: true }),
    ).toBe(false);
    // Even a blocked crit or a blocked telegraphed heavy does not stagger:
    // the shield stopped it, so there is nothing to reel from.
    expect(
      shouldStaggerHit({ isQuick: false, isCrit: true, isTelegraphedHeavy: false, isBlocked: true }),
    ).toBe(false);
    expect(
      shouldStaggerHit({ isQuick: false, isCrit: false, isTelegraphedHeavy: true, isBlocked: true }),
    ).toBe(false);
  });
});

// ── §3 — THE FORCED RECOVERY ─────────────────────────────────────────────────

describe('§3 — the staggered fighter loses exactly one turn, then recovers', () => {
  test('the recovery turn is a `recover` action that clears the flag', () => {
    const duel = code('src/components/duel/DuelScene.tsx');
    // The branch exists and is the only place the flag is cleared: both
    // fighters' setters write staggeredTurns: 0 there, with the `hit` action
    // showing briefly and no other state touched.
    expect((duel.match(/action: 'hit', staggeredTurns: 0/g) ?? []).length).toBe(2);
    expect(duel).toContain("spawnDamageText('RECOVERING'");
    expect(duel).toContain('is RECOVERING');
    // The recovery resolves nothing: no hit roll, no damage, no stamina in
    // the branch (sliced from the branch to the next action branch).
    const branch = duel.slice(
      duel.indexOf("else if (actionType === 'recover')"),
      duel.indexOf('else if (isBeastStrike'),
    );
    expect(branch).not.toContain('calculateHitChance');
    expect(branch).not.toContain('calculateAttackDamage');
    expect(branch).not.toContain('getStaminaCost');
  });

  test('the AI recovers instead of choosing an action when staggered', () => {
    const duel = code('src/components/duel/DuelScene.tsx');
    expect(duel).toContain('isStaggered(opp.staggeredTurns)');
    expect(duel).toContain("executeCombatTurn('opponent', 'recover')");
    // The check sits before the tactical ladder is reached: the staggered
    // slot never plans a brothers slot, a telegraph or a counter.
    const aiStart = duel.indexOf('isStaggered(opp.staggeredTurns)');
    const ladder = duel.indexOf('let chosenAction: CombatActionType', aiStart);
    expect(aiStart).toBeGreaterThan(-1);
    expect(ladder).toBeGreaterThan(aiStart);
  });

  test('the player recovers instead of acting when staggered', () => {
    const duel = code('src/components/duel/DuelScene.tsx');
    expect(duel).toContain('isStaggered(player.staggeredTurns)');
    expect(duel).toContain("executeCombatTurnRef.current?.('player', 'recover', 'master', false)");
    // The panel is the only input, and it is locked while staggered: every
    // action button is disabled and the banner names the recovery.
    const panel = code('src/components/ui/TurnActionPanel.tsx');
    expect(panel).toContain('isStaggered(player.staggeredTurns)');
    expect((panel.match(/disabled=\{!isPlayerTurn \|\| isExecuting \|\| playerRecovering/g) ?? []).length).toBe(9);
    expect(panel).toContain('RECOVERING');
  });

  test('the flag is set on the hit and cleared by the recovery — one turn, no more', () => {
    const duel = code('src/components/duel/DuelScene.tsx');
    // Set exactly twice (one damage setter per fighter), to exactly one turn.
    expect((duel.match(/staggeredTurns: STAGGER_TURNS_ON_LAND/g) ?? []).length).toBe(2);
    // Cleared exactly twice (one setter per fighter in the `recover` branch).
    expect((duel.match(/staggeredTurns: 0/g) ?? []).length).toBe(4);
    // …of which two are the initializers, and two are the recovery branch.
    expect((duel.match(/action: 'hit', staggeredTurns: 0/g) ?? []).length).toBe(2);
  });
});

// ── §4 — KNOCKBACK ───────────────────────────────────────────────────────────

describe('§4 — a staggering hit knocks the victim back 1.2 m', () => {
  test('the victim moves 1.2 m away from the attacker', () => {
    // The opening stance: player at +3.5, opponent at −3.5.
    expect(knockbackPositionZ(-3.5, 3.5)).toBeCloseTo(4.7, 10);
    expect(knockbackPositionZ(3.5, -3.5)).toBeCloseTo(-4.7, 10);
    expect(KNOCKBACK_DISTANCE_M).toBe(1.2);
  });

  test('the separation never exceeds the 9.0 m retreat limit', () => {
    // Already at the limit: nowhere to go.
    expect(knockbackPositionZ(-7.5, 1.5)).toBe(1.5);
    expect(knockbackPositionZ(1.5, -7.5)).toBe(-7.5);
    // One step from the limit: the displacement is cut to the limit.
    expect(knockbackPositionZ(-7.5, 0.9)).toBeCloseTo(1.5, 10);
    expect(ARENA_SEPARATION_MAX_M).toBe(9.0);
  });

  test('neither fighter leaves the ±7.5 m position bounds', () => {
    // Backed against the wall: the knockback is cut to the wall.
    expect(knockbackPositionZ(0, 7.0)).toBe(7.5);
    expect(knockbackPositionZ(0, -7.0)).toBe(-7.5);
    expect(ARENA_POSITION_MIN_M).toBe(-7.5);
    expect(ARENA_POSITION_MAX_M).toBe(7.5);
  });

  test('a non-staggering hit displaces nobody — the knockback rides the stagger only', () => {
    const duel = code('src/components/duel/DuelScene.tsx');
    // The position write appears exactly twice (one damage setter per
    // fighter), and each sits inside the stagger's own conditional spread —
    // no other hit writes a position.
    const calls = [...duel.matchAll(/knockbackPositionZ\(attacker\.position\[2\], prev\.position\[2\]\)/g)];
    expect(calls.length).toBe(2);
    for (const call of calls) {
      const before = duel.slice(Math.max(0, (call.index ?? 0) - 400), call.index ?? 0);
      expect(before).toContain('shouldStagger && nextHp > 0');
    }
  });
});

// ── §5 — THE FAIR-RANGE FIX ──────────────────────────────────────────────────

describe('§5 — an out-of-range swing costs neither stamina nor turn', () => {
  test('stamina is preserved out of range (the existing guard)', () => {
    const duel = code('src/components/duel/DuelScene.tsx');
    expect(duel).toMatch(
      /stamina:\s*dist\s*>\s*effectiveRange\s*\?\s*prev\.stamina\s*:\s*Math\.max\(0,\s*prev\.stamina\s*-\s*staminaCost\)/,
    );
  });

  test('the turn is preserved too: the out-of-range branch skips the toggle', () => {
    const duel = code('src/components/duel/DuelScene.tsx');
    // The branch marks the whiff…
    expect(duel).toContain('outOfRangeWhiff = true');
    // …and the shared toggle is guarded by it, before the handoff.
    const guard = duel.indexOf('if (outOfRangeWhiff) return;');
    const handoff = duel.indexOf('setIsPlayerTurn(!isActorPlayer);');
    expect(guard).toBeGreaterThan(-1);
    expect(handoff).toBeGreaterThan(guard);
  });

  test('the branch keeps its existing side effects', () => {
    const duel = code('src/components/duel/DuelScene.tsx');
    const branch = duel.slice(
      duel.indexOf("if (dist > effectiveRange) {"),
      duel.indexOf('} else {', duel.indexOf("if (dist > effectiveRange) {")),
    );
    // D-4 — a Crossing that never reached him is still spent.
    expect(branch).toContain("crossingAnswerRef.current = 'open'");
    // The player's missed-reach note is still written.
    expect(branch).toContain("notePlayerStrike('missed_out_of_reach')");
    expect(branch).toContain("spawnDamageText('OUT OF RANGE!'");
  });
});

// ── §6 — THE WEIGHT STRIP ────────────────────────────────────────────────────

describe('§6 — body weight scales nothing in the duel any more', () => {
  test('no weight profile reaches any combat call in DuelScene', () => {
    const duel = source('src/components/duel/DuelScene.tsx');
    expect(duel).not.toContain('getWeightCombatProfile');
    expect(duel).not.toContain('gladiatorWeight');
  });

  test('the HUD/panel props are passed neutral', () => {
    const duel = code('src/components/duel/DuelScene.tsx');
    expect(duel).toContain('playerWeightImpactMultiplier={1}');
    expect(duel).toContain('playerWeightStaminaMultiplier={1}');
  });

  test('the turn hold is passed neutral', () => {
    const duel = code('src/components/duel/DuelScene.tsx');
    expect(duel).toMatch(/turnResolutionMs\(\s*actionType,\s*fightEnded,\s*boutMode,\s*1,\s*\)/);
  });

  test('identical stamina cost, damage and turn hold across body weights', () => {
    // The multiplier is 1, so the cost IS the base cost, for either attack.
    expect(staminaCostWithModifiers(20, false, EMPTY_MODIFIERS, 1)).toBe(20);
    expect(staminaCostWithModifiers(12, true, EMPTY_MODIFIERS, 1)).toBe(12);
    // …and 1 is the formula's own neutral: the default equals the explicit 1.
    expect(calculateAttackDamage(20, 10, false, 5, false, 0, 1)).toBe(
      calculateAttackDamage(20, 10, false, 5, false, 0, 1, 1),
    );
    // …and the hold at multiplier 1 is the shipped weight.
    expect(turnResolutionMs('quick_attack', false, 'sand', 1)).toBe(880);
    expect(turnResolutionMs('power_attack', false, 'sand', 1)).toBe(1300);
  });
});

// ── §P — THE DUEL STATE NEVER REACHES A SAVE ────────────────────────────────

describe('§P — the duel state never reaches a save', () => {
  test('only the duel, the panel, the type, this module and this file name the field', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) return walk(path);
        return entry.isFile() && /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
      });

    const naming = walk('src').filter((path) => source(path).includes('staggeredTurns'));

    expect(naming.sort()).toEqual(
      [
        'src/components/duel/DuelScene.tsx',
        'src/components/ui/TurnActionPanel.tsx',
        'src/types/game.ts',
        'src/utils/combatStagger.test.ts',
        'src/utils/combatStagger.ts',
      ].sort(),
    );
  });

  test('the storage service and the save corpus name the field not', () => {
    for (const path of ['src/services/storage.ts', 'src/utils/saveCorpus.test.ts', 'src/services/googleDrive.ts']) {
      const text = source(path);
      expect(text.includes('staggeredTurns'), path).toBe(false);
    }
  });

  test('the field is declared optional on FighterState', () => {
    const types = code('src/types/game.ts');
    expect(types).toContain('staggeredTurns?: number;');
  });
});

// ── §X — THE WIRING ──────────────────────────────────────────────────────────

describe('§X — the wiring', () => {
  test('the duel sets the stagger where the damage lands, for both fighters', () => {
    const duel = code('src/components/duel/DuelScene.tsx');
    expect(duel).toContain('shouldStaggerHit({');
    expect((duel.match(/staggeredTurns: STAGGER_TURNS_ON_LAND/g) ?? []).length).toBe(2);
    // The stagger announces itself: the tag and one log line.
    expect(duel).toContain("spawnDamageText('STAGGERED!'");
    expect(duel).toContain('is STAGGERED');
  });

  test('the `recover` action has its own resolution weight', () => {
    expect(turnResolutionMs('recover')).toBe(1000);
  });
});
