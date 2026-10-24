/**
 * Out-of-range attack fairness (C-8.79A — audit; no production change needed).
 *
 * The contract: a player strike refused for range must cost NOTHING — no
 * stamina, no damage, no turn, no pending strike, no delayed impact — and must
 * leave the HUD in a state that does not invite the same refused tap again.
 *
 * The audit found the shipped path already satisfies it: `executeCombatTurn`
 * refuses the strike before `resolvingRef` is committed, before any stamina
 * write, before the pending-strike dispatch and before the 1100 ms turn timer,
 * and `TurnActionPanel` disables both strike buttons through the same shared
 * `isAttackInRange` rule the engine reads. So this suite adds ONLY the coverage
 * that was genuinely missing:
 *
 *   §A the refusal's ordering against the pending strike (not pinned before)
 *   §B the distance the panel sees is the engine's own expression
 *   §C the SHIPPED tactic panel, rendered — out of range, at the boundary,
 *      inside, low stamina and off-turn (the panel was never executed by a test)
 *
 * Source slices are anchored on CODE markers and brace-balanced, exactly as the
 * neighbouring combat suites do (this repo has no DOM renderer to mount the
 * whole `DuelScene`; the panel itself is a pure component and IS rendered here).
 *
 * Run with: bun test src/utils/phaseC8_79A.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { TurnActionPanel } from '../components/ui/TurnActionPanel';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';
import type { FighterState, WeaponItem } from '../types/game';

const duelSource = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);
const hudSource = readFileSync(
  new URL('../components/ui/CombatHUD.tsx', import.meta.url),
  'utf8',
);

/** Index of a marker that must exist, reported by name when it does not. */
function at(source: string, marker: string): number {
  const index = source.indexOf(marker);
  expect({ marker, found: index >= 0 }).toEqual({ marker, found: true });
  return index;
}

/** The brace-balanced block that STARTS at `start` (inclusive). */
function blockAt(source: string, start: string): string {
  const from = at(source, start); // eslint-disable-line @typescript-eslint/no-use-before-define
  let depth = 0;
  for (let i = from; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(from, i + 1);
    }
  }
  throw new Error(`unbalanced block at ${start}`);
}

const gladius = DEFAULT_PLAYER_WEAPON as WeaponItem;
const guardStart = 'if (!isAttackInRange(gap, attackerNow.loadout.weapon)) {';
const dispatchMarker = 'if (playerStrikeRef.current?.strike(actionType, resolveImpact)) {';
const rangeRefusal = blockAt(duelSource, guardStart);

// ── §A. The refusal, and the strike it must never schedule ─────────────────

describe('§A — a refused player strike schedules nothing and spends nothing', () => {
  test('the refusal sits before the pending-strike dispatch and the turn timer', () => {
    // C-8.71B dispatches the player's pending swing AFTER the guards; a refusal
    // that could ever reach it would leave a 700 ms impact armed for a blow that
    // was never allowed to start.
    expect(at(duelSource, guardStart)).toBeLessThan(at(duelSource, dispatchMarker));
    expect(at(duelSource, guardStart)).toBeLessThan(
      at(duelSource, 'resolutionTimerRef.current = setTimeout('),
    );
    expect(at(duelSource, guardStart)).toBeLessThan(at(duelSource, 'const staminaCost = getStaminaCost('));
  });

  test('the refusal block itself contains only the chronicle line and the return', () => {
    expect(rangeRefusal).toContain('addLog(');
    expect(rangeRefusal).toContain('is out of range — Advance before striking.');
    expect(rangeRefusal).toContain('return;');
    // No stamina write, no fighter mutation, no pending strike, no impact, no timer.
    expect(rangeRefusal).not.toContain('playerStrikeRef');
    expect(rangeRefusal).not.toContain('resolveImpact');
    expect(rangeRefusal).not.toContain('resolutionTimerRef');
    expect(rangeRefusal).not.toContain('stamina');
    expect(rangeRefusal).not.toContain('setPlayer(');
    expect(rangeRefusal).not.toContain('setOpp(');
    expect(rangeRefusal).not.toContain('setIsExecuting(true)');
    expect(rangeRefusal).not.toContain('spawnDamageText(');
  });

  test('the player has exactly one attack entry point, and it is the shared engine call', () => {
    // A second player entry (a keyboard shortcut, a HUD swipe, a direct call)
    // could bypass the guard; there is only the tactic panel's callback.
    expect(duelSource.split("executeCombatTurn('player'").length - 1).toBe(1);
    expect(duelSource).toContain("onExecuteAction={(action) => executeCombatTurn('player', action)}");
    expect(duelSource).not.toContain('keydown');
  });
});

// ── §B. One distance, read the same way on both sides ──────────────────────

describe('§B — the panel is shown the engine\'s own range distance', () => {
  const engineGap = 'const gap = Math.abs(player.position[2] - opp.position[2]);';
  const panelDistance = 'const currentDistance = Math.abs(player.position[2] - opp.position[2]);';

  test('the engine guard and the HUD distance are the same expression', () => {
    expect(at(duelSource, engineGap)).toBeGreaterThan(-1);
    expect(at(duelSource, panelDistance)).toBeGreaterThan(-1);
    // One computation feeds both: the guard re-reads the same two positions and
    // the HUD is handed `currentDistance` untouched, through to the panel.
    expect(duelSource).toContain('distance={currentDistance}');
    // REBASED (C-8.80N): the command panel is no longer a CombatHUD child, so the
    // second hop is DuelScene's own and the HUD forwards nothing. The contract this
    // test exists to pin is unchanged — the engine's single `currentDistance` reaches
    // the panel untouched, with no offset arithmetic anywhere on the way.
    expect(duelSource.split('distance={currentDistance}').length - 1).toBe(1);
    expect(hudSource).not.toContain('distance={');
    expect(duelSource).not.toContain('distance={currentDistance +');
  });
});

// ── §C. The shipped tactic panel, rendered ─────────────────────────────────

const fighter = (overrides: Partial<FighterState> = {}): FighterState =>
  ({
    id: 'player-1',
    name: 'Test Gladiator',
    title: 'Tiro',
    isPlayer: true,
    position: [0, 0, 0],
    rotationY: 0,
    health: 100,
    stamina: 60,
    action: 'idle',
    actionTimer: 0,
    isBlocking: false,
    isInvulnerable: false,
    hitFlashTimer: 0,
    comboCount: 0,
    skinColor: '#c8a27a',
    hairColor: '#222222',
    tunicColor: '#aa3333',
    stats: {
      strength: 10,
      agility: 10,
      staminaMax: 100,
      staminaRegen: 20,
      defense: 10,
      healthMax: 100,
    },
    loadout: { weapon: gladius },
    ...overrides,
  } as FighterState);

const opponent = fighter({
  id: 'opponent-1',
  name: 'Test Rival',
  title: 'Veteranus',
  isPlayer: false,
  position: [0, 0, 5],
});

interface PanelOptions {
  distance: number;
  stamina?: number;
  isPlayerTurn?: boolean;
  isExecuting?: boolean;
}

/** The shipped panel, rendered with the state the engine would hand it. */
const renderPanel = ({
  distance,
  stamina = 60,
  isPlayerTurn = true,
  isExecuting = false,
}: PanelOptions): string =>
  renderToStaticMarkup(
    React.createElement(TurnActionPanel, {
      player: fighter({ stamina }),
      opponent,
      distance,
      isPlayerTurn,
      isExecuting,
      combatLog: [],
      onExecuteAction: () => {},
    }),
  );

/**
 * One card's opening tag and body, located by a phrase inside its own content.
 *
 * Each tactic card is a `<button>`, so a rendered card's `disabled` lives in its
 * opening tag and its overlay text in its body — both readable from the shipped
 * markup without a DOM.
 */
function buttonFor(html: string, phrase: string): { open: string; body: string } {
  const cards = html.split('<button').slice(1);
  const card = cards.find((candidate) => candidate.includes(phrase));
  expect({ phrase, found: card !== undefined }).toEqual({ phrase, found: true });
  const segment = card as string;
  const openEnd = segment.indexOf('>');
  const close = segment.indexOf('</button>');
  return {
    open: segment.slice(0, openEnd),
    body: segment.slice(openEnd, close),
  };
}

describe('§C — the rendered tactic panel refuses the strike it cannot land', () => {
  test('just outside reach: both strikes are disabled and say why', () => {
    const html = renderPanel({ distance: gladius.range + 0.0001 });
    const quick = buttonFor(html, 'Quick Strike');
    const power = buttonFor(html, 'Power Slash');

    expect(quick.open).toContain('disabled');
    expect(power.open).toContain('disabled');
    expect(quick.body).toContain('Out of range — Advance to strike');
    expect(power.body).toContain('Out of range — Advance to strike');
  });

  test('clearly outside reach behaves the same', () => {
    const html = renderPanel({ distance: 7.5 });
    expect(buttonFor(html, 'Quick Strike').open).toContain('disabled');
    expect(buttonFor(html, 'Power Slash').open).toContain('disabled');
  });

  test('the boundary is legal, exactly as the engine\'s own rule says', () => {
    const html = renderPanel({ distance: gladius.range });
    const quick = buttonFor(html, 'Quick Strike');
    const power = buttonFor(html, 'Power Slash');

    expect(quick.open).not.toContain('disabled');
    expect(power.open).not.toContain('disabled');
    expect(quick.body).not.toContain('Out of range');
    expect(power.body).not.toContain('Out of range');
  });

  test('clearly inside reach the strikes stay available', () => {
    const html = renderPanel({ distance: 1.2 });
    expect(buttonFor(html, 'Quick Strike').open).not.toContain('disabled');
    expect(buttonFor(html, 'Power Slash').open).not.toContain('disabled');
  });

  test('low stamina cannot turn an out-of-range tap into a cheap one', () => {
    // The refusal is the same whether or not the strike is affordable: no card
    // can be clicked at all, so nothing is spent and nothing is armed.
    const html = renderPanel({ distance: gladius.range + 1, stamina: 0 });
    expect(buttonFor(html, 'Quick Strike').open).toContain('disabled');
    expect(buttonFor(html, 'Power Slash').open).toContain('disabled');
    expect(buttonFor(html, 'Quick Strike').body).toContain('Out of range — Advance to strike');
  });

  test('the remedy the panel names stays available while the strikes are refused', () => {
    // "Out of range — Advance to strike" would be misleading if the player could
    // not advance: out of reach, Advance is the enabled control and the strikes
    // are the disabled ones. In reach it inverts, so the fighters cannot be
    // walked through one another.
    const far = renderPanel({ distance: gladius.range + 1 });
    expect(buttonFor(far, 'Advance (+1.8m)').open).not.toContain('disabled');
    expect(buttonFor(far, 'Shield Guard').open).not.toContain('disabled');
    expect(buttonFor(far, 'Quick Strike').open).toContain('disabled');

    const near = renderPanel({ distance: 1.2 });
    expect(buttonFor(near, 'Advance (+1.8m)').open).toContain('disabled');
    expect(buttonFor(near, 'Quick Strike').open).not.toContain('disabled');
  });

  test('off-turn and mid-resolution every strike is disabled inside reach too', () => {
    const offTurn = renderPanel({ distance: 1.2, isPlayerTurn: false });
    expect(buttonFor(offTurn, 'Quick Strike').open).toContain('disabled');
    expect(buttonFor(offTurn, 'Power Slash').open).toContain('disabled');

    const executing = renderPanel({ distance: 1.2, isExecuting: true });
    expect(buttonFor(executing, 'Quick Strike').open).toContain('disabled');
    expect(buttonFor(executing, 'Power Slash').open).toContain('disabled');
  });
});
