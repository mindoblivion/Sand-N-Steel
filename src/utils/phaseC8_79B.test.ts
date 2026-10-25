/**
 * Opponent readability and reaction-window audit (C-8.79B).
 *
 * The audit traced the whole announced-strike lifecycle (range and stamina
 * guards → `announceEnemyAttack` → the 700 ms reaction window → the dodge/block
 * resolution → the impact and turn hand-back → the bout-end and unmount cancels)
 * and found the mechanics sound. It found ONE reproducible defect, and this suite
 * is that defect's regression test.
 *
 * THE DEFECT. The reaction cue was stance-blind: `reactionTaken` was a boolean,
 * so the line under the telegraph read "Stance set — the strike lands against
 * your guard." no matter which answer the player gave. After a DODGE that
 * statement is false in both halves of the mechanic — `reactToPendingAttack(
 * 'dodge')` sets `isInvulnerable` and never `isBlocking`, the impact rolls a
 * 75 % evade, and a failed roll lands the blow at FULL damage because no guard
 * was ever raised. So the one piece of feedback inside a 700 ms decision window
 * told the player their shield was up when it was not.
 *
 * Reproduction, before the fix, in the shipped HUD (the dev harness mounts the
 * real component): `/?devHarness=hud&hudState=power` → press `Dodge` →
 * `data-hud-reacts="dodge"` (the dodge was delivered) while the cue read
 * "Stance set — the strike lands against your guard."
 *
 * Sections:
 *   §A the shared rule: the line names the stance that was taken
 *   §B the SHIPPED HUD, rendered — a dodge never claims a guard
 *   §C the shipped write sites: the stance itself is recorded, and cleared
 *   §D the audited lifecycle this phase did not move
 *
 * Run with: bun test src/utils/phaseC8_79B.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { CombatHUD } from '../components/ui/CombatHUD';
import { resolveReactionCue } from './pendingStrike';
import type { PendingReaction } from './pendingStrike';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';
import { DODGE_STAMINA_COST, ENEMY_ATTACK_WINDUP_MS } from './combatCalculations';
import type { FighterState } from '../types/game';

const duelSource = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);
const hudSource = readFileSync(
  new URL('../components/ui/CombatHUD.tsx', import.meta.url),
  'utf8',
);
const harnessSource = readFileSync(
  new URL('../components/dev/CombatHudHarness.tsx', import.meta.url),
  'utf8',
);

/** `//` and block-comment lines stripped, so prose can neither satisfy nor defeat a pin. */
const codeOnly = (source: string): string =>
  source
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('/*'))
    .join('\n');

/** The cue's reaction line as rendered, or '' when the row is not there. */
function reactionLine(html: string): string {
  const from = html.indexOf('data-reaction-taken');
  if (from === -1) return '';
  return html.slice(from, html.indexOf('</p>', from));
}

const fighter = (overrides: Record<string, unknown>) =>
  ({
    id: 'c8-79b',
    name: 'Test',
    title: 'Gladiator',
    isPlayer: false,
    position: [0, 0, 0],
    rotationY: 0,
    health: 80,
    stamina: 60,
    action: 'idle',
    actionTimer: 0,
    isBlocking: false,
    isInvulnerable: false,
    hitFlashTimer: 0,
    stats: {
      strength: 10,
      agility: 10,
      stamina: 60,
      staminaMax: 100,
      staminaRegen: 20,
      defense: 5,
      healthMax: 100,
    },
    loadout: { weapon: DEFAULT_PLAYER_WEAPON },
    comboCount: 0,
    skinColor: '#c9a27a',
    hairColor: '#2b1d12',
    tunicColor: '#7f1d1d',
    ...overrides,
  }) as unknown as FighterState;

/** The SHIPPED HUD, rendered with the telegraph up and the given reaction state. */
function renderHud(reactionTaken: PendingReaction | null): string {
  return renderToStaticMarkup(
    React.createElement(CombatHUD, {
      player: fighter({ id: 'p', name: 'Dimachaerus', isPlayer: true }),
      opponent: fighter({ id: 'o', name: 'Marcus' }),
      crowdHype: 52,
      comboCount: 0,
      matchTimer: 97,
      isMuted: false,
      onToggleMute: () => {},
      onWithdraw: () => {},
      onOpenHelp: () => {},
      cameraMode: 'cinematic',
      onCycleCameraMode: () => {},
      // C-8.80N — the command panel is DuelScene's flex sibling of the stage, not a
      // CombatHUD prop; these fixtures render the instrumentation overlay only.
      pendingEnemyAttack: 'power_attack' as const,
      pendingPlayerAttack: null,
      reactionTaken,
      onReactToPendingAttack: () => {},
    }),
  );
}

// ── §A. The rule ───────────────────────────────────────────────────────────

describe('§A — the reaction line names the stance the player actually took', () => {
  test('nothing spent means nothing to say', () => {
    expect(resolveReactionCue(null)).toBeNull();
  });

  test('a dodge is reported as a dodge, and never as a guard', () => {
    const cue = resolveReactionCue('dodge');
    expect(cue).not.toBeNull();
    expect(cue!.kind).toBe('dodge');
    expect(cue!.label.toLowerCase()).toContain('dodge');
    // The defect: a dodge raises no shield, so the line may not mention one.
    expect(cue!.label.toLowerCase()).not.toContain('guard');
  });

  test('a shield guard is reported as a guard', () => {
    const cue = resolveReactionCue('shield_block');
    expect(cue).not.toBeNull();
    expect(cue!.kind).toBe('shield_block');
    expect(cue!.label.toLowerCase()).toContain('guard');
    expect(cue!.label.toLowerCase()).not.toContain('dodge');
  });

  test('the two answers cannot share one line', () => {
    expect(resolveReactionCue('dodge')!.label).not.toBe(
      resolveReactionCue('shield_block')!.label,
    );
  });
});

// ── §B. The shipped HUD ────────────────────────────────────────────────────

describe('§B — the rendered cue reports the stance it was given', () => {
  test('after a Dodge the cue does not claim a raised guard', () => {
    const line = reactionLine(renderHud('dodge'));
    expect(line).not.toBe('');
    expect(line).toContain('data-reaction-kind="dodge"');
    expect(line.toLowerCase()).toContain('dodge');
    expect(line.toLowerCase()).not.toContain('guard');
  });

  test('after Shield Guard the cue reports the guard', () => {
    const line = reactionLine(renderHud('shield_block'));
    expect(line).toContain('data-reaction-kind="shield_block"');
    expect(line.toLowerCase()).toContain('guard');
    expect(line.toLowerCase()).not.toContain('dodge');
  });

  test('before any reaction the two controls are offered and no line is claimed', () => {
    const html = renderHud(null);
    expect(reactionLine(html)).toBe('');
    expect(html).toContain('data-reaction="shield_block"');
    expect(html).toContain('data-reaction="dodge"');
  });

  test('the cue keeps its own window and its own reaction cost', () => {
    expect(hudSource).toContain('animationDuration: `${ENEMY_ATTACK_WINDUP_MS}ms`');
    expect(hudSource).toContain('disabled={player.stamina < DODGE_STAMINA_COST}');
    expect(ENEMY_ATTACK_WINDUP_MS).toBe(700);
    expect(DODGE_STAMINA_COST).toBe(12);
  });
});

// ── §C. The shipped write sites ────────────────────────────────────────────

describe('§C — the scene records WHICH stance was spent, and clears it', () => {
  const duelCode = codeOnly(duelSource);

  test('the reaction writes the stance it was handed', () => {
    expect(duelCode).toContain('setReactionTaken(action);');
    // The stance-blind boolean cannot come back without failing here.
    expect(duelCode).not.toContain('setReactionTaken(true)');
    expect(duelCode).not.toContain('setReactionTaken(false)');
  });

  test('every reset clears the stance (announce, impact and cancellation)', () => {
    expect(duelCode.split('setReactionTaken(null)').length - 1).toBe(3);
  });

  test('the cue is told the stance through the HUD prop, typed to the union', () => {
    expect(duelCode).toContain('reactionTaken={reactionTaken}');
    expect(hudSource).toContain('reactionTaken: PendingReaction | null;');
    expect(hudSource).not.toContain('reactionTaken: boolean;');
    // C-8.82B passes the fighter's own block reduction as the cue's second
    // argument so the guard line can name its mitigation; the stance still comes
    // straight from the prop, which is the property this pin exists for.
    expect(hudSource).toContain('resolveReactionCue(reactionTaken,');
  });

  test('the dev harness passes the reaction it actually delivered', () => {
    expect(codeOnly(harnessSource)).toContain('reacts[reacts.length - 1]');
  });

  test('the reaction is still claimed before the stance is written', () => {
    // C-8.70B §R1's ordering, untouched: the claim is what stops a mashed Dodge
    // from paying twice or stacking a guard with an evade.
    const claim = duelCode.indexOf('claimReaction()');
    const write = duelCode.indexOf('setReactionTaken(action)');
    expect(claim).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(claim);
  });
});

// ── §D. What this phase did not move ───────────────────────────────────────

describe('§D — the audited lifecycle is unchanged', () => {
  test('one announcement, one impact, one 700 ms window', () => {
    expect(duelSource).toContain('strikeRef.current?.announce(');
    expect(duelSource).toContain("executeTurnRef.current('opponent', landing);");
    expect(duelSource).toContain('if (!announced) return;');
    expect(ENEMY_ATTACK_WINDUP_MS).toBe(700);
  });

  test('the stance rules and the dodge price are untouched', () => {
    // Scoped to the reaction itself: the file's other dodge charges are the
    // player's and the opponent's own turn actions, which this phase never reads.
    const react = duelSource.slice(
      duelSource.indexOf('const reactToPendingAttack = useCallback('),
      duelSource.indexOf('// No blow may outlive the scene'),
    );
    expect(react).toContain("applyDefensiveAction(clearDefensiveStance(prev), 'dodge')");
    expect(react).toContain("applyDefensiveAction(clearDefensiveStance(prev), 'shield_block')");
    expect(react.split('prev.stamina - DODGE_STAMINA_COST').length - 1).toBe(1);
  });

  test('a decided fight and an unmount still drop the pending strike', () => {
    // The two outcome branches call the canceller; the unmount cleanup cancels
    // both controllers directly, and the announcement's own callback is inert.
    expect(duelSource.split('cancelPendingEnemyAttack(').length - 1).toBe(2);
    expect(duelSource.split('strikeRef.current?.cancel();').length - 1).toBe(2);
    expect(duelSource).toContain('playerStrikeRef.current?.cancel();');
  });
});
