/**
 * ===========================================================================
 * COMBAT-2 — Player Counterattack (the Riposte). The slice's pins, one
 * section per brief requirement. The decision logic lives in the pure helpers
 * (`combatCounter.ts`); the wiring pins (§X) read the resolution and the
 * panel out of the sources, so a disconnect between the helpers and the
 * shipped code fails here rather than in a playtest.
 *
 *   §1  the trigger            (blocked power queues; quick / dodged / missed do not)
 *   §2  the riposte            (+50% damage; the three evade paths are gated)
 *   §3  the window lapses      (any non-attack action lets it go)
 *   §4  consumed by one attack (exactly one riposte, then normal)
 *   §5  the stagger interaction (a riposte power still staggers per slice 1)
 *   §P  persistence            (duel state only — nothing reaches a save)
 *   §X  the wiring, read out of the sources
 *
 * Run with: bun test src/utils/combatCounter.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';

import { RIPOSTE_DAMAGE_MULT, applyRiposteDamage, isRiposteReady, resolveRiposteWindow, shouldQueueRiposte } from './combatCounter';
import { shouldStaggerHit } from './combatStagger';

// ── helpers ──────────────────────────────────────────────────────────────────

const source = (path: string) => readFileSync(path, 'utf8');
/** Strip block and line comments so prose can neither satisfy nor defeat a pin. */
const code = (path: string) =>
  source(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

// ── §1 — THE TRIGGER ─────────────────────────────────────────────────────────

describe('§1 — blocking a power attack queues the Riposte', () => {
  test('a power attack the player blocked queues it', () => {
    expect(shouldQueueRiposte({ defenderIsPlayer: true, isBlocked: true, isQuick: false })).toBe(true);
  });

  test('a blocked quick attack queues nothing — the safe poke is not punishable', () => {
    expect(shouldQueueRiposte({ defenderIsPlayer: true, isBlocked: true, isQuick: true })).toBe(false);
  });

  test('a power attack the OPPONENT blocked queues nothing — player only', () => {
    expect(shouldQueueRiposte({ defenderIsPlayer: false, isBlocked: true, isQuick: false })).toBe(false);
  });

  test('a power attack that was not blocked queues nothing — dodged and missed never reach the shield', () => {
    expect(shouldQueueRiposte({ defenderIsPlayer: true, isBlocked: false, isQuick: false })).toBe(false);
  });
});

// ── §2 — THE RIPOSTE ─────────────────────────────────────────────────────────

describe('§2 — the riposte hits +50% and cannot be evaded', () => {
  test('the multiplier is the locked design value', () => {
    expect(RIPOSTE_DAMAGE_MULT).toBe(1.5);
  });

  test('+50% damage, rounded, floored at 1', () => {
    expect(applyRiposteDamage(10, true)).toBe(15);
    expect(applyRiposteDamage(11, true)).toBe(17);
    expect(applyRiposteDamage(1, true)).toBe(2);
    expect(applyRiposteDamage(0, true)).toBe(1);
  });

  test('a non-riposte blow is untouched', () => {
    expect(applyRiposteDamage(10, false)).toBe(10);
    expect(applyRiposteDamage(0, false)).toBe(0);
  });

  test('the window reads exactly as the panel does', () => {
    expect(isRiposteReady(true)).toBe(true);
    expect(isRiposteReady(false)).toBe(false);
    expect(isRiposteReady(undefined)).toBe(false);
  });
});

// ── §3 — THE WINDOW LAPSES ───────────────────────────────────────────────────

describe('§3 — a non-attack action lets the window lapse', () => {
  test('advance, retreat, rest, taunt, net, block and dodge all lapse it — no attack, no riposte', () => {
    expect(resolveRiposteWindow(true, false)).toEqual({ applies: false, ready: false });
  });

  test('an unopened window stays closed whatever the player does', () => {
    expect(resolveRiposteWindow(false, false)).toEqual({ applies: false, ready: false });
    expect(resolveRiposteWindow(false, true)).toEqual({ applies: false, ready: false });
  });
});

// ── §4 — CONSUMED BY ONE ATTACK ─────────────────────────────────────────────

describe('§4 — the window is consumed by exactly one attack', () => {
  test('the next attack carries the riposte and closes the window', () => {
    expect(resolveRiposteWindow(true, true)).toEqual({ applies: true, ready: false });
  });

  test('a second attack after the riposte is normal', () => {
    const afterFirst = resolveRiposteWindow(true, true);
    expect(resolveRiposteWindow(afterFirst.ready, true)).toEqual({ applies: false, ready: false });
  });

  test('quick and power both spend it — the choice is the player\'s', () => {
    // The window resolves on the attack action, not the attack kind: the
    // helper takes only "is this an attack", so both kinds spend it alike.
    expect(resolveRiposteWindow(true, true).applies).toBe(true);
  });
});

// ── §5 — THE STAGGER INTERACTION ────────────────────────────────────────────

describe('§5 — a riposte power attack still staggers per slice-1 rules', () => {
  test('a riposte is a power attack, so it staggers exactly as one does', () => {
    // The riposte changes damage and evasion, never the attack kind: the
    // stagger rule reads isQuick / isCrit / isTelegraphedHeavy / isBlocked
    // and nothing about the riposte, so a riposte power staggers.
    expect(shouldStaggerHit({ isQuick: false, isCrit: false, isTelegraphedHeavy: false, isBlocked: false })).toBe(true);
  });

  test('a riposte power the defender blocked does not stagger — blocking is still the answer', () => {
    expect(shouldStaggerHit({ isQuick: false, isCrit: false, isTelegraphedHeavy: false, isBlocked: true })).toBe(false);
  });

  test('a riposte quick attack does not stagger', () => {
    expect(shouldStaggerHit({ isQuick: true, isCrit: false, isTelegraphedHeavy: false, isBlocked: false })).toBe(false);
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

    const naming = walk('src').filter((path) => source(path).includes('riposteReady'));

    expect(naming.sort()).toEqual(
      [
        'src/components/duel/DuelScene.tsx',
        'src/components/ui/TurnActionPanel.tsx',
        'src/types/game.ts',
        'src/utils/combatCounter.test.ts',
        'src/utils/combatCounter.ts',
      ].sort(),
    );
  });

  test('the storage service and the save corpus name the field not', () => {
    for (const path of ['src/services/storage.ts', 'src/utils/saveCorpus.test.ts', 'src/services/googleDrive.ts']) {
      const text = source(path);
      expect(text.includes('riposteReady'), path).toBe(false);
    }
  });

  test('the field is declared optional on FighterState', () => {
    const types = code('src/types/game.ts');
    expect(types).toContain('riposteReady?: boolean;');
  });
});

// ── §X — THE WIRING ─────────────────────────────────────────────────────────

describe('§X — the wiring', () => {
  test('the duel queues the riposte where the block lands, player-side only', () => {
    const duel = code('src/components/duel/DuelScene.tsx');
    expect(duel).toContain('shouldQueueRiposte({');
    expect(duel).toContain('defenderIsPlayer: !isActorPlayer');
    expect(duel).toContain("spawnDamageText(RIPOSTE_READY_TEXT");
    expect(duel).toContain('riposteReady: true');
  });

  test('the riposte is read at the attack resolution and spent on that blow', () => {
    const duel = code('src/components/duel/DuelScene.tsx');
    expect(duel).toContain('const isRiposte = isActorPlayer && isRiposteReady(player.riposteReady);');
    expect(duel).toContain('...(isRiposte ? { riposteReady: false } : {}),');
  });

  test('the window lapses on a non-attack action', () => {
    const duel = code('src/components/duel/DuelScene.tsx');
    expect(duel).toContain('if (isActorPlayer && !isAttackAction) {');
  });

  test('all three evade paths are gated on the riposte — and the draws are skipped with them', () => {
    const duel = code('src/components/duel/DuelScene.tsx');
    // One `!isRiposte &&` per evade path: stance, Valéria's passive, palma.
    expect((duel.match(/!isRiposte &&/g) ?? []).length).toBe(3);
    expect(duel).toContain('const isEvaded = !isRiposte && defender.isInvulnerable');
  });

  test('the damage multiplier rides the resolved damage, in the duel and in the panel estimates', () => {
    const duel = code('src/components/duel/DuelScene.tsx');
    const panel = code('src/components/ui/TurnActionPanel.tsx');
    expect(duel).toContain('applyRiposteDamage(');
    // Three estimate wraps in the panel (quick, power min, power max) — the
    // import line carries no `(` so it is not counted here.
    expect((panel.match(/applyRiposteDamage\(/g) ?? []).length).toBe(3);
  });

  test('the panel shows the window while it is open', () => {
    const panel = code('src/components/ui/TurnActionPanel.tsx');
    expect(panel).toContain('riposte-banner');
    expect(panel).toContain('Riposte Ready');
    expect(panel).toContain('cannot be evaded');
  });

  test('the stagger application is untouched by this slice', () => {
    const duel = code('src/components/duel/DuelScene.tsx');
    expect((duel.match(/staggeredTurns: STAGGER_TURNS_ON_LAND/g) ?? []).length).toBe(2);
  });
});
