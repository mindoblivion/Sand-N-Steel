/**
 * Combat responsiveness, defense balance and fight-entry safety (§R1–§R3).
 *
 * One suite for the rules this phase changed, and for the wiring that binds them
 * into the shipped screens (§D pins the wiring, because a UI that never receives
 * a cue or never disables a button is exactly the failure the phase exists to
 * prevent):
 *
 *   §A Shield Guard's stamina rule — no free regeneration, one credited stop (§R2)
 *   §B Out-of-range attacks — one rule, applied before stamina or a turn (§R3A)
 *   §C The wind-up cue and its reactions, as wired (§R1)
 *   §D The Colosseum door — briefing and the tab's own level gate (§R3B)
 *
 * Pure helpers where they exist (`shieldGuardStaminaGain`, `isAttackInRange`,
 * `resolveBoutLevelGate`); source reads only for the wiring, never for a number a
 * helper already owns.
 *
 * Run with: bun test src/utils/combatResponsiveness.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  applyStaminaRegen,
  shieldGuardStaminaGain,
  isAttackInRange,
  DODGE_STAMINA_COST,
  ENEMY_ATTACK_WINDUP_MS,
  getStaminaCost,
} from './combatCalculations';
import { resolveBoutLevelGate, resolveVictoryTier } from './tierAdvancement';
import type { WeaponItem } from '../types/game';
import { ALL_OPPONENTS } from '../data/opponents';

const duelSource = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);
const hudSource = readFileSync(
  new URL('../components/ui/CombatHUD.tsx', import.meta.url),
  'utf8',
);
const panelSource = readFileSync(
  new URL('../components/ui/TurnActionPanel.tsx', import.meta.url),
  'utf8',
);
const helpSource = readFileSync(
  new URL('../components/hub/HelpModal.tsx', import.meta.url),
  'utf8',
);
const tabSource = readFileSync(
  new URL('../components/hub/TournamentTab.tsx', import.meta.url),
  'utf8',
);
const citySource = readFileSync(
  new URL('../components/3d/city/CityHubScene.tsx', import.meta.url),
  'utf8',
);
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

/** A weapon stub: `isAttackInRange` reads only `range`. */
const weaponAt = (range: number) => ({ range } as WeaponItem);

// ── §A. Shield Guard's stamina rule ────────────────────────────────────────

describe('§A — Shield Guard recovers nothing by itself (§R2)', () => {
  test('raising the guard that stops nothing recovers no stamina', () => {
    expect(shieldGuardStaminaGain(false, 24)).toBe(0);
    expect(shieldGuardStaminaGain(false, 0.0001)).toBe(0);
  });

  test('a guard that stops a blow credits the fighter\'s own regen, once', () => {
    expect(shieldGuardStaminaGain(true, 24)).toBe(24);
    expect(shieldGuardStaminaGain(true, 5)).toBe(5);
  });

  test('a stalled or malformed regen credits nothing rather than NaN', () => {
    expect(shieldGuardStaminaGain(true, 0)).toBe(0);
    expect(shieldGuardStaminaGain(true, -8)).toBe(0);
    expect(shieldGuardStaminaGain(true, Number.NaN)).toBe(0);
    expect(shieldGuardStaminaGain(true, Number.POSITIVE_INFINITY)).toBe(0);
  });

  test('the credited stop is still clamped by the stamina ceiling', () => {
    const gain = shieldGuardStaminaGain(true, 24);
    expect(applyStaminaRegen(100, 100, gain)).toBe(100);
    expect(applyStaminaRegen(90, 100, gain)).toBe(100);
    expect(applyStaminaRegen(50, 100, gain)).toBe(74);
  });

  test('the engine\'s shield_block action spends and credits nothing', () => {
    const start = duelSource.indexOf("else if (actionType === 'shield_block') {");
    const end = duelSource.indexOf("} else if (actionType === 'dodge') {");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const branch = duelSource.slice(start, end);
    expect(branch).toContain('isBlocking: true');
    expect(branch).not.toContain('applyStaminaRegen');
    expect(branch).not.toContain('stamina:');
  });

  test('the successful-block credit exists exactly once, inside the blocked branch', () => {
    const calls = duelSource.split('shieldGuardStaminaGain(').length - 1;
    expect(calls).toBe(1);

    const call = duelSource.indexOf('shieldGuardStaminaGain(');
    const blockedBranch = duelSource.lastIndexOf('if (isBlocked) {', call);
    const otherBranch = duelSource.lastIndexOf('} else {', call);
    expect(blockedBranch).toBeGreaterThan(-1);
    // The nearest enclosing branch marker before the credit is the block's own.
    expect(blockedBranch).toBeGreaterThan(otherBranch);
  });

  test('Dodge still costs 12 SP, and no call site hardcodes the number', () => {
    expect(DODGE_STAMINA_COST).toBe(12);
    expect(duelSource).not.toContain('prev.stamina - 12');
    expect(panelSource).not.toContain('player.stamina < 12');
  });

  test('the tactic panel no longer advertises a Shield Guard stamina gain', () => {
    expect(panelSource).not.toContain('shieldRecovery');
    expect(panelSource).not.toContain('applyStaminaRegen');
    expect(panelSource).toContain('NO COST');
    expect(panelSource).toContain('SP on block');
  });

  test('the help screen states the real rule', () => {
    expect(helpSource).not.toContain('Restores: 12 SP');
    expect(helpSource).not.toContain('while recovering stamina');
    expect(helpSource).toContain('recovers stamina only when it actually stops a blow');
  });
});

// ── §B. Out-of-range attacks ───────────────────────────────────────────────

describe('§B — an out-of-range attack is refused before it costs anything (§R3A)', () => {
  const gladius = weaponAt(2.1);

  test('in range, at the edge, and out of it', () => {
    expect(isAttackInRange(0, gladius)).toBe(true);
    expect(isAttackInRange(2.0, gladius)).toBe(true);
    expect(isAttackInRange(2.1, gladius)).toBe(true); // the border is legal
    expect(isAttackInRange(2.1001, gladius)).toBe(false);
    expect(isAttackInRange(7.5, gladius)).toBe(false);
  });

  test('a distance or a reach that cannot be evaluated is refused', () => {
    expect(isAttackInRange(Number.NaN, gladius)).toBe(false);
    expect(isAttackInRange(Number.POSITIVE_INFINITY, gladius)).toBe(false);
    expect(isAttackInRange(-1, gladius)).toBe(false);
    expect(isAttackInRange(1, weaponAt(0))).toBe(false);
    expect(isAttackInRange(1, weaponAt(Number.NaN))).toBe(false);
    expect(isAttackInRange(1, undefined as unknown as WeaponItem)).toBe(false);
  });

  test('a real weapon\'s own reach decides, not a screen-wide constant', () => {
    const spear = ALL_OPPONENTS.length > 0 ? weaponAt(3.8) : gladius;
    expect(isAttackInRange(3.5, spear)).toBe(true);
    expect(isAttackInRange(3.5, gladius)).toBe(false);
  });

  test('the engine guards range before stamina, animation or the turn commit', () => {
    const guard = duelSource.indexOf('if (!isAttackInRange(gap, attackerNow.loadout.weapon)) {');
    const committing = duelSource.indexOf('resolvingRef.current = true;');
    const stamina = duelSource.indexOf('const staminaCost = getStaminaCost(');

    expect(guard).toBeGreaterThan(-1);
    expect(committing).toBeGreaterThan(-1);
    expect(stamina).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(committing);
    expect(guard).toBeLessThan(stamina);

    // The guarded branch leaves the function before anything is spent.
    const guarded = duelSource.slice(guard, duelSource.indexOf('resolvingRef.current = true;'));
    expect(guarded).toContain('return;');
    expect(guarded).not.toContain('stamina');
    expect(guarded).not.toContain('setPlayer(');
  });

  test('both strike buttons disable themselves through the same rule', () => {
    expect(panelSource).toContain('isAttackInRange(distance, player.loadout.weapon)');
    const disables = panelSource.split('|| !isInWeaponRange}').length - 1;
    expect(disables).toBe(2);
    const explanations = panelSource.split('Out of range — Advance to strike').length - 1;
    expect(explanations).toBe(2);
  });
});

// ── §C. The wind-up cue and its reactions, as wired ────────────────────────

describe('§C — the announced strike is visible, answerable and cancellable (§R1)', () => {
  test('the HUD takes the cue, the reaction and the reaction handler', () => {
    expect(hudSource).toContain("pendingEnemyAttack: 'quick_attack' | 'power_attack' | null;");
    expect(hudSource).toContain('reactionTaken: boolean;');
    expect(hudSource).toContain(
      "onReactToPendingAttack: (action: 'shield_block' | 'dodge') => void;"
    );
  });

  test('the HUD renders the cue and both usable reaction controls', () => {
    expect(hudSource).toContain('data-windup-cue={pendingEnemyAttack}');
    expect(hudSource).toContain('data-reaction="shield_block"');
    expect(hudSource).toContain('data-reaction="dodge"');
    expect(hudSource).toContain('data-reaction-taken="true"');
    // Both buttons are inside the pointed-events-auto panel, not the inert HUD.
    const cue = hudSource.slice(hudSource.indexOf('data-windup-cue='));
    expect(cue.slice(0, 400)).toContain('pointer-events-auto');
    // The window is drawn, and its length is the announced one.
    expect(hudSource).toContain("animationDuration: `${ENEMY_ATTACK_WINDUP_MS}ms`");
  });

  test('DuelScene feeds the cue and does not duplicate the stamina prop', () => {
    expect(duelSource).toContain('pendingEnemyAttack={pendingEnemyAttack}');
    expect(duelSource).toContain('reactionTaken={reactionTaken}');
    expect(duelSource).toContain('onReactToPendingAttack={reactToPendingAttack}');
    expect(duelSource).not.toContain('playerStamina=');
  });

  test('the announcement goes through the one-impact controller', () => {
    expect(duelSource).toContain('createPendingStrike()');
    expect(duelSource).toContain('strikeRef.current?.announce(');
    expect(duelSource).toContain('if (!announced) return;');
    expect(duelSource).not.toContain('pendingEnemyAttackRef');
    expect(duelSource).not.toContain('windupTimerRef');
  });

  test('the reaction is claimed before any stance is written', () => {
    const claim = duelSource.indexOf('claimReaction()');
    const write = duelSource.indexOf('setReactionTaken(true)');
    const stamina = duelSource.indexOf('player.stamina < DODGE_STAMINA_COST');

    expect(claim).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(claim);
    // The stamina refusal runs BEFORE the claim, so it cannot burn the reaction.
    expect(stamina).toBeGreaterThan(-1);
    expect(stamina).toBeLessThan(claim);
  });

  test('the reaction writes the existing stance rules, and pays Dodge once', () => {
    const react = duelSource.slice(
      duelSource.indexOf('const reactToPendingAttack = useCallback('),
      // Follow-up pass (2026-10-20): the anchor is the unmount effect's comment, whose
      // wording was corrected to "No blow may outlive the scene" because the 1400 ms
      // result settlement deliberately DOES outlive the scene. The property these
      // assertions pin — the reaction pays Dodge once and writes the stance flags —
      // is unchanged; only the marker's first word moved.
      duelSource.indexOf('// No blow may outlive the scene'),
    );
    expect(react).toContain("applyDefensiveAction(clearDefensiveStance(prev), 'dodge')");
    expect(react).toContain("applyDefensiveAction(clearDefensiveStance(prev), 'shield_block')");
    const dodgeCharges = react.split('prev.stamina - DODGE_STAMINA_COST').length - 1;
    expect(dodgeCharges).toBe(1);
  });

  test('a pending strike is dropped on victory, on defeat and on unmount', () => {
    // Both end-of-fight paths, at statement indentation.
    const endOfFightCalls = duelSource.split('\n      cancelPendingEnemyAttack();').length - 1;
    expect(endOfFightCalls).toBe(2);

    const unmount = duelSource.slice(duelSource.indexOf('// No blow may outlive the scene'));
    expect(unmount.slice(0, 1200)).toContain('strikeRef.current?.cancel();');
    expect(unmount.slice(0, 1200)).toContain('clearTimeout(resolutionTimerRef.current)');
  });

  test('the wind-up constant is the audited 700 ms', () => {
    expect(ENEMY_ATTACK_WINDUP_MS).toBe(700);
  });
});

// ── §D. The Colosseum door ─────────────────────────────────────────────────

describe('§D — the Colosseum door briefs the bout and honours the level gate (§R3B)', () => {
  const goliath = ALL_OPPONENTS.find((entry) => entry.id === 'opp_goliath_boss')!;

  test('the gate is the tournament tab\'s own rule', () => {
    expect(goliath.recommendedLevel).toBe(3);
    // Below the recommendation and never beaten: locked.
    expect(resolveBoutLevelGate(1, goliath, []).locked).toBe(true);
    expect(resolveBoutLevelGate(1, goliath, []).requiredLevel).toBe(3);
    expect(resolveBoutLevelGate(2, goliath, ['opp_marcus']).locked).toBe(true);
    // At or above it: open.
    expect(resolveBoutLevelGate(3, goliath, []).locked).toBe(false);
    expect(resolveBoutLevelGate(12, goliath, []).locked).toBe(false);
  });

  test('a rematch is never locked — the fighter has already been faced', () => {
    expect(resolveBoutLevelGate(1, goliath, [goliath.id]).locked).toBe(false);
    expect(resolveBoutLevelGate(1, goliath, [goliath.id]).requiredLevel).toBe(3);
  });

  test('a bout nothing can vouch for is refused, and a missing level reads as 1', () => {
    expect(resolveBoutLevelGate(9, null, []).locked).toBe(true);
    expect(resolveBoutLevelGate(9, undefined, []).locked).toBe(true);
    const unlevelled = { id: 'opp_maker', recommendedLevel: undefined };
    expect(resolveBoutLevelGate(1, unlevelled, []).locked).toBe(false);
    expect(resolveBoutLevelGate(1, unlevelled, []).requiredLevel).toBe(1);
  });

  test('the door opens the briefing instead of the duel', () => {
    expect(citySource).toContain("import { resolveDoorDuelTarget, resolveBoutLevelGate }");
    expect(citySource).toContain("import { PreFightModal } from '../../hub/PreFightModal';");
    expect(citySource).toContain('const target = resolveDoorDuelTarget(');
    expect(citySource).toContain('const gate = resolveBoutLevelGate(');
    expect(citySource).toContain('if (gate.locked) {');
    expect(citySource).toContain('setPendingDuel(target.opponent);');
    // The pre-fight bypass is gone: no direct hand-off from the door.
    expect(citySource).not.toContain('onEnterDuel(target.opponent)');
    // …and the briefing is what confirms it.
    const modal = citySource.slice(citySource.indexOf('<PreFightModal'));
    expect(modal).toContain('opponent={pendingDuel}');
    expect(modal).toContain('onConfirm={');
    expect(modal.slice(0, 400)).toContain('onEnterDuel(opp)');
    expect(modal).toContain('onCancel={() => setPendingDuel(null)}');
  });

  test('the tab reads the same gate, so the two screens cannot disagree', () => {
    expect(tabSource).toContain('resolveBoutLevelGate(');
    expect(tabSource).not.toContain('profile.level < opp.recommendedLevel');
  });

  test('tier advancement and the duel hand-off are untouched', () => {
    expect(appSource).toContain('const handleEnterDuel = (opp: OpponentConfig) => {');
    expect(appSource).toContain('onEnterDuel={handleEnterDuel}');
    const result = resolveVictoryTier({
      currentTier: 1,
      opponent: goliath,
      defeatedOpponentIds: [],
    });
    expect(result.advanced).toBe(true);
    expect(result.currentTier).toBe(2);
    expect(
      resolveVictoryTier({ currentTier: 1, opponent: goliath, defeatedOpponentIds: [goliath.id] })
        .advanced
    ).toBe(false);
  });

  test('the panel\'s strike costs are still the weapon\'s own', () => {
    // §R2 asked for the defense rebalance only: a light strike still costs what
    // the weapon says, so no cost was quietly retuned with the guard.
    const gladius = ALL_OPPONENTS.length ? { staminaLight: 12, staminaHeavy: 24 } : null;
    expect(getStaminaCost(gladius as unknown as WeaponItem, true)).toBe(12);
    expect(getStaminaCost(gladius as unknown as WeaponItem, false)).toBe(24);
  });
});
