/**
 * C-8.84D — Dodge UI and feedback consistency.
 *
 * The C-8.84C audit left two loose ends in the Dodge work, and both are CONFIRMED
 * here before anything is edited:
 *
 *   A  THE PLAYER'S DODGE CONTROLS did not answer to the engine's predicate.
 *      `CombatHUD`'s reaction button gated on
 *      `player.stamina < DODGE_STAMINA_COST && !player.isInvulnerable` and
 *      `TurnActionPanel`'s Dodge card on `player.stamina < DODGE_STAMINA_COST`,
 *      while C-8.84A's resolution guard answers to `canAffordDodge`. The two agree
 *      for every finite stamina ≥ 0 — which is why the divergence was invisible —
 *      and disagree exactly where the predicate was written for: a NON-FINITE
 *      stamina. `NaN < 12` is `false`, so both controls ENABLED a dodge the engine
 *      then refuses; a non-numeric `stamina` ('60' from a hand-edited save) is the
 *      same shape. The fix is the shared predicate at both gates and nothing else.
 *
 *   B  THE SHIELD-BLOCK FALLBACK SPOKE OF A SHIELD THE FIGHTER DID NOT HAVE.
 *      `executeCombatTurn`'s `shield_block` branch is shared by every loadout, and
 *      C-8.84B sends an unaffordable Dodge there. Its copy was
 *      `"<name> braces behind their shield."` with a `BRACED!` cue, so a
 *      `dual_blades` opponent — the roster's Flaccus and Ignis — was told it had
 *      braced behind a shield. The fix is loadout-aware copy (`guardFeedback`);
 *      the stance, its zero cost, the block mitigation and the turn timing are
 *      untouched.
 *
 * How faithful is this suite? Section A and B render the SHIPPED components with
 * `react-dom/server` and read the `disabled` attribute out of the real markup, the
 * convention `phaseC8_79A` / `phaseC8_83B` / `phaseC8_80B` established. Section C
 * executes the real `guardFeedback` module. Section D binds the shipped branch by
 * source order (the shipped DuelScene cannot be mounted here — no DOM renderer for
 * the scene). Section E runs the real AI fallback and the real stance helper.
 *
 * Limitation, stated rather than papered over: this is NOT live-duel acceptance and
 * NOT Android acceptance. No 3D scene is mounted and no wall clock is exercised.
 *
 * Run with: `bun test src/utils/phaseC8_84D.test.ts`
 */
// @ts-ignore - bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { CombatHUD } from '../components/ui/CombatHUD';
import { TurnActionPanel } from '../components/ui/TurnActionPanel';
import {
  DODGE_EVADE_CHANCE,
  DODGE_EVADE_PERCENT,
  DODGE_STAMINA_COST,
  applyDefensiveAction,
  canAffordDodge,
  clearDefensiveStance,
  planDodgeReaction,
} from './combatCalculations';
import { shieldGuardFeedback, weaponCarriesShield } from './guardFeedback';
import { ALL_WEAPONS, DEFAULT_PLAYER_WEAPON, getWeaponByType } from '../data/itemsDB';
import { ALL_OPPONENTS } from '../data/opponents';
import { enforceAffordableAIAction } from './aiActionSelection';
import type { FighterState } from '../types/game';

const DUEL_SOURCE = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);
const HUD_SOURCE = readFileSync(
  new URL('../components/ui/CombatHUD.tsx', import.meta.url),
  'utf8',
);
const PANEL_SOURCE = readFileSync(
  new URL('../components/ui/TurnActionPanel.tsx', import.meta.url),
  'utf8',
);

/** The shipped Shield Guard branch of `executeCombatTurn`. */
const TURN_GUARD_BRANCH = (() => {
  const start = DUEL_SOURCE.indexOf("else if (actionType === 'shield_block') {");
  const end = DUEL_SOURCE.indexOf("} else if (actionType === 'dodge') {");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return DUEL_SOURCE.slice(start, end);
})();

// -- fixtures ----------------------------------------------------------------

function fighter(overrides: Partial<FighterState>): FighterState {
  return {
    id: 'p',
    name: 'Dimachaerus',
    title: 'Gladiator',
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
  } as unknown as FighterState;
}

interface GateCase {
  stamina: number;
  isInvulnerable?: boolean;
}

function renderHud({ stamina, isInvulnerable = false }: GateCase): string {
  return renderToStaticMarkup(
    React.createElement(CombatHUD, {
      player: fighter({ stamina, isInvulnerable }),
      opponent: fighter({ id: 'o', name: 'Flaccus', isPlayer: false }),
      crowdHype: 52,
      comboCount: 0,
      matchTimer: 97,
      isMuted: false,
      onToggleMute: () => {},
      onWithdraw: () => {},
      onOpenHelp: () => {},
      cameraMode: 'cinematic',
      onCycleCameraMode: () => {},
      pendingEnemyAttack: 'power_attack',
      pendingPlayerAttack: null,
      reactionTaken: null,
      onReactToPendingAttack: () => {},
    }),
  );
}

function renderPanel(stamina: number, extra: { isPlayerTurn?: boolean; isExecuting?: boolean } = {}): string {
  return renderToStaticMarkup(
    React.createElement(TurnActionPanel, {
      player: fighter({ stamina }),
      opponent: fighter({ id: 'o', name: 'Flaccus', isPlayer: false }),
      distance: 2.0,
      isPlayerTurn: extra.isPlayerTurn ?? true,
      isExecuting: extra.isExecuting ?? false,
      combatLog: [],
      onExecuteAction: () => {},
    }),
  );
}

/**
 * One rendered `<button>`, located by a phrase inside its own content — the card's
 * `disabled` lives in its opening tag, which is readable without a DOM.
 */
function card(html: string, phrase: string): string {
  const found = html
    .split('<button')
    .slice(1)
    .find((candidate) => candidate.includes(phrase));
  if (found === undefined) throw new Error(`no rendered card contains ${phrase}`);
  return found;
}

function openingTag(rendered: string): string {
  const end = rendered.indexOf('>');
  return end < 0 ? rendered : rendered.slice(0, end);
}

const isDisabled = (rendered: string): boolean => openingTag(rendered).includes('disabled');

/** Every stamina that must refuse a NEW dodge, and every one that must allow it. */
const REFUSING = Array.from({ length: DODGE_STAMINA_COST }, (_, i) => i);
const NON_FINITE: number[] = [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  // A hand-edited save: numeric-looking, but not a number.
  '60' as unknown as number,
];

// -- A. The HUD's reaction gate ----------------------------------------------

describe('A - the HUD reaction Dodge answers to canAffordDodge', () => {
  const HUD_DODGE = 'data-reaction="dodge"';

  test('0-11 SP disables a NEW dodge', () => {
    for (const stamina of REFUSING) {
      const rendered = renderHud({ stamina });
      expect(isDisabled(card(rendered, HUD_DODGE))).toBe(true);
    }
  });

  test('exactly 12 SP and above enables it', () => {
    for (const stamina of [DODGE_STAMINA_COST, DODGE_STAMINA_COST + 1, 50, 100]) {
      const rendered = renderHud({ stamina });
      expect(isDisabled(card(rendered, HUD_DODGE))).toBe(false);
    }
  });

  test('a non-finite or non-numeric stamina disables it, exactly as the engine refuses', () => {
    for (const stamina of NON_FINITE) {
      const rendered = renderHud({ stamina });
      expect(isDisabled(card(rendered, HUD_DODGE))).toBe(true);
      // The engine's own answer, so the UI cannot disagree with the handler.
      expect(canAffordDodge(stamina)).toBe(false);
    }
  });

  test('control: the pre-fix comparison ENABLED cases the predicate refuses', () => {
    // The defect being closed, replayed through the shipped expression's own rule.
    const preFix = (stamina: number, isInvulnerable: boolean) =>
      !(stamina < DODGE_STAMINA_COST && !isInvulnerable);
    // NaN, +Infinity and a non-numeric value all compare FALSE against the cost, so
    // the old rule offered the stance where the engine refuses it. (-Infinity does
    // compare low, so it was already gated.)
    const PRE_FIX_ENABLED: number[] = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      '60' as unknown as number,
    ];
    for (const stamina of PRE_FIX_ENABLED) {
      expect(preFix(stamina, false)).toBe(true);
      expect(!canAffordDodge(stamina)).toBe(true);
    }
    // ...and the two rules agree everywhere finite, which is why it went unnoticed,
    // including the negative-infinity case where both refused.
    for (const stamina of [...REFUSING, DODGE_STAMINA_COST, 100, Number.NEGATIVE_INFINITY]) {
      expect(preFix(stamina, false)).toBe(stamina >= DODGE_STAMINA_COST);
      expect(!canAffordDodge(stamina)).toBe(!(stamina >= DODGE_STAMINA_COST && Number.isFinite(stamina)));
    }
  });

  test('a HELD stance is still reaffirmed for free, even at 0 SP', () => {
    const held = card(renderHud({ stamina: 0, isInvulnerable: true }), HUD_DODGE);
    expect(isDisabled(held)).toBe(false);
    const markup = renderHud({ stamina: 0, isInvulnerable: true });
    expect(markup).toContain('Dodge · held');
    expect(markup).toContain('no cost');
  });

  test('the held-stance exemption also survives a non-finite stamina', () => {
    // `planDodgeReaction` charges a held stance nothing at any stamina, so the
    // control must stay usable; only a NEW stance is gated.
    expect(planDodgeReaction({ isInvulnerable: true }, Number.NaN)).toEqual({
      kind: 'reaffirm',
      staminaCost: 0,
      countsDodge: false,
    });
    for (const stamina of NON_FINITE) {
      expect(isDisabled(card(renderHud({ stamina, isInvulnerable: true }), HUD_DODGE))).toBe(false);
    }
  });

  test('the gate is the shared predicate in source, not a literal comparison', () => {
    expect(HUD_SOURCE).toContain(
      'const reactionDodgeBlocked = !canAffordDodge(player.stamina) && !player.isInvulnerable;',
    );
    expect(HUD_SOURCE).toContain('disabled={reactionDodgeBlocked}');
    expect(HUD_SOURCE).not.toContain('player.stamina < DODGE_STAMINA_COST');
  });
});

// -- B. The tactic panel's Dodge card ----------------------------------------

describe('B - the tactic panel Dodge card answers to canAffordDodge', () => {
  const DODGE_CARD = 'Enter an evasion stance';

  test('0-11 SP disables a dodge', () => {
    for (const stamina of REFUSING) {
      expect(isDisabled(card(renderPanel(stamina), DODGE_CARD))).toBe(true);
    }
  });

  test('exactly 12 SP and above enables it when otherwise eligible', () => {
    for (const stamina of [DODGE_STAMINA_COST, DODGE_STAMINA_COST + 1, 50, 100]) {
      expect(isDisabled(card(renderPanel(stamina), DODGE_CARD))).toBe(false);
    }
  });

  test('a non-finite or non-numeric stamina disables it', () => {
    for (const stamina of NON_FINITE) {
      expect(isDisabled(card(renderPanel(stamina), DODGE_CARD))).toBe(true);
    }
  });

  test('the turn/execution gates are unchanged', () => {
    expect(isDisabled(card(renderPanel(100, { isPlayerTurn: false }), DODGE_CARD))).toBe(true);
    expect(isDisabled(card(renderPanel(100, { isExecuting: true }), DODGE_CARD))).toBe(true);
  });

  test('the card is still gated by the shared predicate in source', () => {
    expect(PANEL_SOURCE).toContain('const dodgeUnaffordable = !canAffordDodge(player.stamina);');
    expect(PANEL_SOURCE).toContain('disabled={!isPlayerTurn || isExecuting || dodgeUnaffordable}');
    expect(PANEL_SOURCE).not.toContain('player.stamina < DODGE_STAMINA_COST');
  });
});

// -- C. The guard copy -------------------------------------------------------

describe('C - the guard copy follows the loadout', () => {
  test('a shield-equipped fighter keeps the shipped wording, word for word', () => {
    expect(shieldGuardFeedback('Marcus', true)).toEqual({
      log: 'Marcus braces behind their shield.',
      cue: 'BRACED!',
    });
  });

  test('a shield-less fighter is never told about a shield', () => {
    const feedback = shieldGuardFeedback('Flaccus', false);
    expect(feedback.log.toLowerCase()).not.toContain('shield');
    expect(feedback.cue.toLowerCase()).not.toContain('shield');
    // ...and it still describes a guard, not a dodge.
    expect(feedback.log).toContain('guard');
    expect(feedback.cue).toBe('GUARD!');
  });

  test('the two loadouts read differently, so the chronicle cannot be mistaken', () => {
    expect(shieldGuardFeedback('Flaccus', false).log).not.toBe(
      shieldGuardFeedback('Flaccus', true).log,
    );
    expect(shieldGuardFeedback('Flaccus', false).cue).not.toBe(
      shieldGuardFeedback('Flaccus', true).cue,
    );
  });

  test('weaponCarriesShield reads the loadout the way the rendered mesh does', () => {
    expect(weaponCarriesShield(getWeaponByType('sword_shield'))).toBe(true);
    for (const type of ['spear', 'dual_blades', 'mace'] as const) {
      expect(weaponCarriesShield(getWeaponByType(type))).toBe(false);
    }
    // The mesh's own fallbacks: no resolved weapon, or one that names a shield.
    expect(weaponCarriesShield(undefined)).toBe(true);
    expect(weaponCarriesShield(null)).toBe(true);
    expect(weaponCarriesShield({ type: 'mace', name: 'Boarded Shield Mace' })).toBe(true);
    expect(weaponCarriesShield({ type: 'mace', id: 'mace_shieldbreaker' })).toBe(true);
  });

  test('every catalogue weapon and every roster opponent resolves to the right copy', () => {
    // Catalogue: only the sword-and-shield type carries a board.
    for (const weapon of ALL_WEAPONS) {
      expect(weaponCarriesShield(weapon)).toBe(weapon.type === 'sword_shield');
    }
    // Roster: the shield-less opponents are the ones the audit named.
    const shieldless = ALL_OPPONENTS.filter(
      (opponent) => !weaponCarriesShield(getWeaponByType(opponent.weaponType)),
    );
    expect(shieldless.length).toBeGreaterThan(0);
    for (const opponent of shieldless) {
      expect(opponent.weaponType).not.toBe('sword_shield');
      expect(shieldGuardFeedback(opponent.name, false).log.toLowerCase()).not.toContain('shield');
    }
    // The audit's named cases: the roster's two `dual_blades` fighters.
    const daggerFighters = ALL_OPPONENTS.filter(
      (opponent) => opponent.weaponType === 'dual_blades',
    );
    expect(daggerFighters.length).toBe(2);
    expect(daggerFighters.some((o) => o.name.startsWith('Flaccus'))).toBe(true);
    expect(daggerFighters.some((o) => o.name.startsWith('Ignis'))).toBe(true);
    for (const opponent of daggerFighters) {
      expect(weaponCarriesShield(getWeaponByType(opponent.weaponType))).toBe(false);
    }
  });
});

// -- D. The shipped branch ---------------------------------------------------

describe('D - the shield_block branch uses the loadout-aware copy', () => {
  test('it writes the feedback through the shared helper', () => {
    expect(TURN_GUARD_BRANCH).toContain('shieldGuardFeedback(');
    expect(TURN_GUARD_BRANCH).toContain('weaponCarriesShield(attacker.loadout.weapon)');
    expect(TURN_GUARD_BRANCH).toContain('addLog(guardFeedback.log,');
    expect(TURN_GUARD_BRANCH).toContain("spawnDamageText(guardFeedback.cue, 'blocked', attacker.position)");
  });

  test('no shield-specific literal survives in the scene', () => {
    expect(DUEL_SOURCE).not.toContain('braces behind their shield');
    expect(DUEL_SOURCE).not.toContain("'BRACED!'");
  });

  test('the stance it sets is UNCHANGED: a block, never a dodge', () => {
    expect(TURN_GUARD_BRANCH).toContain('isBlocking: true');
    expect(TURN_GUARD_BRANCH).not.toContain('isInvulnerable');
    expect(TURN_GUARD_BRANCH).toContain("action: 'block'");
    expect(TURN_GUARD_BRANCH).not.toContain("action: 'dodge'");
  });

  test('the branch still costs and credits nothing', () => {
    // Comments stripped: the C-8.70B note explains why the regen is gone, and prose
    // must neither satisfy nor defeat this pin.
    const code = TURN_GUARD_BRANCH.split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    expect(code).not.toContain('stamina');
    expect(code).not.toContain('DODGE_STAMINA_COST');
    expect(code).not.toContain('canAffordDodge');
  });

  test('the feedback is written inside the branch, once, for both actors', () => {
    expect(TURN_GUARD_BRANCH.split('addLog(').length - 1).toBe(1);
    expect(TURN_GUARD_BRANCH.split('spawnDamageText(').length - 1).toBe(1);
    // The same branch serves the player and the opponent (isActorPlayer branches only
    // on which fighter state is written; the copy is one call).
    expect(TURN_GUARD_BRANCH).toContain("isActorPlayer ? 'player' : 'opponent'");
  });
});

// -- E. The AI fallback still lands on a legal, shield-less guard --------------

describe('E - the C-8.84B fallback keeps its stance and never grants a dodge', () => {
  const DAGGERS = getWeaponByType('dual_blades');

  test('an unaffordable Dodge still falls back to shield_block', () => {
    for (const stamina of REFUSING) {
      expect(enforceAffordableAIAction('dodge', stamina, DAGGERS)).toBe('shield_block');
    }
    expect(enforceAffordableAIAction('dodge', DODGE_STAMINA_COST, DAGGERS)).toBe('dodge');
  });

  test('that fallback sets the blocking stance and leaves invulnerability clear', () => {
    const stance = applyDefensiveAction(
      clearDefensiveStance({ isBlocking: false, isInvulnerable: false }),
      'shield_block',
    );
    expect(stance).toEqual({ isBlocking: true, isInvulnerable: false });
  });

  test('the shield-less fighter still gets a truthful line for that turn', () => {
    const opponent = ALL_OPPONENTS.find((candidate) => candidate.weaponType === 'dual_blades')!;
    const weapon = getWeaponByType(opponent.weaponType);
    const action = enforceAffordableAIAction('dodge', DODGE_STAMINA_COST - 1, weapon);
    expect(action).toBe('shield_block');
    const feedback = shieldGuardFeedback(opponent.name, weaponCarriesShield(weapon));
    expect(feedback.log.toLowerCase()).not.toContain('shield');
    expect(feedback.log).toContain(opponent.name);
  });
});

// -- F. Nothing else moved ---------------------------------------------------

describe('F - the affordability contract and its constants are untouched', () => {
  test('the cost and the evade chance are unchanged', () => {
    expect(DODGE_STAMINA_COST).toBe(12);
    expect(DODGE_EVADE_CHANCE).toBe(0.88);
    expect(DODGE_EVADE_PERCENT).toBe(88);
  });

  test('the engine resolution guard is exactly as C-8.84A/B left it', () => {
    expect(DUEL_SOURCE).toContain(
      "if (actionType === 'dodge' && !canAffordDodge(attackerNow.stamina)) {",
    );
    expect(DUEL_SOURCE).toContain('is too winded to take an evasion stance.');
  });

  test('the reaction planner still refuses only an unaffordable NEW stance', () => {
    const OPEN = { isBlocking: false, isInvulnerable: false };
    expect(planDodgeReaction(OPEN, DODGE_STAMINA_COST - 1)).toEqual({
      kind: 'refused',
      staminaCost: 0,
      countsDodge: false,
    });
    for (const stamina of [0, 5, DODGE_STAMINA_COST - 1, 88]) {
      expect(planDodgeReaction({ isInvulnerable: true }, stamina)).toEqual({
        kind: 'reaffirm',
        staminaCost: 0,
        countsDodge: false,
      });
    }
  });

  test('the UI gate is the same predicate as the handler for every finite stamina', () => {
    for (let stamina = 0; stamina <= 120; stamina += 1) {
      const hud = card(renderHud({ stamina }), 'data-reaction="dodge"');
      const panel = card(renderPanel(stamina), 'Enter an evasion stance');
      expect(isDisabled(hud)).toBe(!canAffordDodge(stamina));
      expect(isDisabled(panel)).toBe(!canAffordDodge(stamina));
    }
  });
});
