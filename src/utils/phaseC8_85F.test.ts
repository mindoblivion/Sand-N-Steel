/**
 * C-8.85F — the Guard credit's API fails closed, and the tactic grid tells the truth.
 *
 * C-8.85E gated the stopped-blow Guard credit on the defender's own loadout, but
 * it defaulted the eligibility argument to `true`, so a future caller that forgot
 * the third argument silently inherited a shield it may not carry. It also left
 * the tactic grid advertising "SP on block" to every loadout, i.e. promising a
 * shield-less fighter a benefit C-8.85E had just taken away.
 *
 * What this suite binds:
 *   A  the helper's API — an omitted, undefined, null or non-boolean eligibility
 *      pays NOTHING, while an explicit `true` pays exactly what C-8.72B shipped;
 *   B  the shielded credit numerically unchanged, and the shield-less credit zero;
 *   C  the helper's contract in source: no defaulted eligibility parameter, the
 *      fail-closed guard, and the one production call site passing the canonical
 *      predicate explicitly;
 *   D  the tactic grid, RENDERED with `react-dom/server` (the convention
 *      `phaseC8_84D` / `phaseC8_79A` established) for a shield and for shield-less
 *      loadouts, plus agreement across the whole catalogue;
 *   E  what did not move — Dodge's price and evade chance, held-stance
 *      reaffirmation, the reaction lifecycle and the guard wording.
 *
 * Limitation, stated rather than papered over: this is NOT live-duel acceptance
 * and NOT Android acceptance. No 3D scene is mounted, no wall clock is used and no
 * RNG is drawn.
 *
 * Run with: `bun test src/utils/phaseC8_85F.test.ts`
 */
// @ts-ignore - bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { TurnActionPanel } from '../components/ui/TurnActionPanel';
import {
  applyStaminaRegen,
  canAffordDodge,
  carriesShieldForGuardCredit,
  DODGE_EVADE_CHANCE,
  DODGE_STAMINA_COST,
  SHIELD_GUARD_REGEN_MULTIPLIER,
  planDodgeReaction,
  shieldGuardStaminaGain,
} from './combatCalculations';
import {
  blockedStrikeLog,
  reactionGuardFeedback,
  shieldGuardFeedback,
  weaponCarriesShield,
} from './guardFeedback';
import { ALL_WEAPONS, DEFAULT_PLAYER_WEAPON, getWeaponByType } from '../data/itemsDB';
import type { FighterState, WeaponItem } from '../types/game';

/** Source with comments stripped, so a docstring can never satisfy or defeat a pin. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const CALC_SOURCE = stripComments(
  readFileSync(new URL('./combatCalculations.ts', import.meta.url), 'utf8'),
);
const DUEL_SOURCE = stripComments(
  readFileSync(new URL('../components/duel/DuelScene.tsx', import.meta.url), 'utf8'),
);
const PANEL_SOURCE = stripComments(
  readFileSync(new URL('../components/ui/TurnActionPanel.tsx', import.meta.url), 'utf8'),
);
const HELP_SOURCE = stripComments(
  readFileSync(new URL('../components/hub/HelpModal.tsx', import.meta.url), 'utf8'),
);

/** The C-8.85D measured builds: gladius kit regen 29.7, sicae kit regen 34.5. */
const GLADIUS_KIT_REGEN = 29.7;
const SICAE_KIT_REGEN = 34.5;

/** The helper, reached as an untyped function so an omitted argument can be exercised. */
const creditUnchecked = shieldGuardStaminaGain as unknown as (
  didStopBlow: boolean,
  regen: number,
  carriesShield?: unknown,
) => number;

const SHIELD_WEAPON = DEFAULT_PLAYER_WEAPON;
const SHIELDLESS_WEAPONS = ALL_WEAPONS.filter((w) => w.type !== 'sword_shield');

// ── A. The API fails closed ────────────────────────────────────────────────

describe('A — missing or malformed eligibility pays nothing (C-8.85F)', () => {
  test('a stopped blow with the eligibility argument OMITTED credits 0', () => {
    // C-8.85E returned a positive credit here; that default is the defect.
    expect(creditUnchecked(true, 24)).toBe(0);
    expect(creditUnchecked(true, GLADIUS_KIT_REGEN)).toBe(0);
  });

  test('undefined and null eligibility credit 0', () => {
    expect(creditUnchecked(true, 24, undefined)).toBe(0);
    expect(creditUnchecked(true, 24, null)).toBe(0);
  });

  test('a truthy non-boolean eligibility credits 0 — only the literal `true` pays', () => {
    for (const wrong of ['true', 'yes', 'false', 1, -1, {}, [], { type: 'sword_shield' }, () => true]) {
      expect(creditUnchecked(true, 24, wrong)).toBe(0);
    }
  });

  test('an explicit `false` still credits 0, as C-8.85E shipped', () => {
    expect(shieldGuardStaminaGain(true, 24, false)).toBe(0);
    expect(creditUnchecked(true, 24, false)).toBe(0);
  });

  test('the refusal is a credit of zero, not a NaN or a throw', () => {
    for (const wrong of [undefined, null, 'true', 1, {}]) {
      const value = creditUnchecked(true, GLADIUS_KIT_REGEN, wrong);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBe(0);
    }
  });
});

// ── B. The shielded credit is numerically unchanged ────────────────────────

describe('B — shield eligibility pays exactly what C-8.72B shipped', () => {
  test('the multiplier, the measured builds and the whole/fractional cases', () => {
    expect(SHIELD_GUARD_REGEN_MULTIPLIER).toBe(0.5);
    expect(shieldGuardStaminaGain(true, GLADIUS_KIT_REGEN, true)).toBeCloseTo(14.85, 10);
    expect(shieldGuardStaminaGain(true, SICAE_KIT_REGEN, true)).toBeCloseTo(17.25, 10);
    expect(shieldGuardStaminaGain(true, 24, true)).toBe(12);
    expect(shieldGuardStaminaGain(true, 5, true)).toBe(2.5);
    expect(shieldGuardStaminaGain(true, 1, true)).toBe(0.5);
    expect(shieldGuardStaminaGain(true, 31.9, true)).toBeCloseTo(15.95, 10);
  });

  test('an unstopped blow or a malformed regen credits nothing, even when eligible', () => {
    expect(shieldGuardStaminaGain(false, GLADIUS_KIT_REGEN, true)).toBe(0);
    expect(shieldGuardStaminaGain(false, 24, true)).toBe(0);
    expect(shieldGuardStaminaGain(true, 0, true)).toBe(0);
    expect(shieldGuardStaminaGain(true, -8, true)).toBe(0);
    expect(shieldGuardStaminaGain(true, Number.NaN, true)).toBe(0);
    expect(shieldGuardStaminaGain(true, Number.POSITIVE_INFINITY, true)).toBe(0);
  });

  test('the credit is still clamped by the fighter\'s own stamina cap', () => {
    const gain = shieldGuardStaminaGain(true, GLADIUS_KIT_REGEN, true);
    expect(applyStaminaRegen(100, 100, gain)).toBe(100);
    expect(applyStaminaRegen(95, 100, gain)).toBe(100);
    expect(applyStaminaRegen(50, 100, gain)).toBeCloseTo(64.85, 10);
    expect(applyStaminaRegen(0, 100, shieldGuardStaminaGain(true, 999, true))).toBe(100);
  });

  test('a shield-less loadout earns zero for the same stopped blow, stamina untouched', () => {
    for (const weapon of SHIELDLESS_WEAPONS) {
      const eligible = carriesShieldForGuardCredit(weapon);
      expect(eligible).toBe(false);
      const gain = shieldGuardStaminaGain(true, GLADIUS_KIT_REGEN, eligible);
      expect(gain).toBe(0);
      expect(applyStaminaRegen(60, 100, gain)).toBe(60);
    }
  });

  test('every catalogue weapon\'s credit answers to the canonical shield rule', () => {
    expect(ALL_WEAPONS.length).toBeGreaterThanOrEqual(9);
    for (const weapon of ALL_WEAPONS) {
      const eligible = carriesShieldForGuardCredit(weapon);
      expect(eligible).toBe(weaponCarriesShield(weapon));
      const gain = shieldGuardStaminaGain(true, 24, eligible);
      expect(gain).toBe(eligible ? 12 : 0);
    }
  });
});

// ── C. The helper's contract, in source ────────────────────────────────────

describe('C — the credit API cannot be called without an explicit answer', () => {
  test('the eligibility parameter carries no default and the guard is `!== true`', () => {
    const signature = CALC_SOURCE.slice(
      CALC_SOURCE.indexOf('export function shieldGuardStaminaGain('),
    ).slice(0, 400);
    expect(signature).toContain('carriesShield: boolean,');
    expect(signature).not.toContain('carriesShield: boolean =');
    expect(signature).not.toMatch(/carriesShield\s*\??\s*:\s*boolean\s*=/);
    expect(signature).toContain('carriesShield !== true');
  });

  test('the credit still has exactly ONE production call site, and it passes the predicate', () => {
    const calls = DUEL_SOURCE.split('shieldGuardStaminaGain(').length - 1;
    expect(calls).toBe(1);
    expect(DUEL_SOURCE).toMatch(
      /shieldGuardStaminaGain\(\s*true,\s*defender\.stats\.staminaRegen,\s*carriesShieldForGuardCredit\(defender\.loadout\?\.weapon\),\s*\)/,
    );
  });

  test('the credit is still paid only inside the blocked-strike branch', () => {
    const call = DUEL_SOURCE.indexOf('shieldGuardStaminaGain(');
    const blockedBranch = DUEL_SOURCE.lastIndexOf('if (isBlocked) {', call);
    const otherBranch = DUEL_SOURCE.lastIndexOf('} else {', call);
    expect(blockedBranch).toBeGreaterThan(-1);
    expect(blockedBranch).toBeGreaterThan(otherBranch);
  });

  test('no second shield rule exists in the credit module or the panel', () => {
    for (const source of [CALC_SOURCE, PANEL_SOURCE]) {
      expect(source).not.toContain("=== 'sword_shield'");
      expect(source).not.toMatch(/includes\(\s*'shield'\s*\)/);
    }
    // The one classification the panel asks is the canonical one.
    expect(PANEL_SOURCE).toContain('carriesShieldForGuardCredit(weapon)');
  });
});

// ── D. The tactic grid, rendered ───────────────────────────────────────────

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

/** The shipped panel's markup for one equipped weapon, read without a DOM renderer. */
function renderPanel(weapon: WeaponItem): string {
  return renderToStaticMarkup(
    React.createElement(TurnActionPanel, {
      player: fighter({ loadout: { weapon } }),
      opponent: fighter({ id: 'o', name: 'Flaccus', isPlayer: false }),
      distance: 2.0,
      isPlayerTurn: true,
      isExecuting: false,
      combatLog: [],
      onExecuteAction: () => {},
    }),
  );
}

/** The Shield Guard card's own markup, located by its title. */
function guardCard(html: string): string {
  const found = html
    .split('<button')
    .slice(1)
    .find((candidate) => candidate.includes('Shield Guard'));
  if (found === undefined) throw new Error('no rendered card contains Shield Guard');
  return found;
}

describe('D — the Shield Guard card describes the loadout actually equipped', () => {
  test('a shield-equipped loadout keeps the accurate "SP on block" promise', () => {
    const card = guardCard(renderPanel(SHIELD_WEAPON));
    expect(card).toContain('SP on block');
    expect(card).not.toContain('No SP credit');
    expect(carriesShieldForGuardCredit(SHIELD_WEAPON)).toBe(true);
  });

  test('a shield-less loadout is promised NO Guard stamina credit', () => {
    for (const weapon of SHIELDLESS_WEAPONS) {
      const card = guardCard(renderPanel(weapon));
      expect(card).not.toContain('SP on block');
      expect(card).toContain('No SP credit');
      // The mitigation it DOES get is still stated, and the action still costs nothing.
      expect(card).toContain(`${Math.round(weapon.blockReduction * 100)}% Absorb`);
      expect(card).toContain('NO COST');
      expect(card).not.toContain('SP on block');
    }
  });

  test('the label matches the canonical rule for every catalogue weapon', () => {
    for (const weapon of ALL_WEAPONS) {
      const card = guardCard(renderPanel(weapon));
      const promisesCredit = card.includes('SP on block');
      expect(promisesCredit).toBe(weaponCarriesShield(weapon));
      expect(promisesCredit).toBe(carriesShieldForGuardCredit(weapon));
      expect(card.includes('No SP credit')).toBe(!promisesCredit);
    }
  });

  test('the formal action name and the rest of the card are unchanged', () => {
    const shielded = guardCard(renderPanel(SHIELD_WEAPON));
    const shieldless = guardCard(renderPanel(getWeaponByType('dual_blades')));
    for (const card of [shielded, shieldless]) {
      expect(card).toContain('Shield Guard');
      expect(card).toContain('NO COST');
      expect(card).toContain('Brace to absorb');
      expect(card).toContain('% Absorb');
      expect(card).not.toContain('disabled');
    }
  });
});

// ── E. What did not move ───────────────────────────────────────────────────

describe('E — Dodge, the reaction lifecycle and the guard wording are untouched', () => {
  test('Dodge keeps its 12 SP price and its 88 % evade chance', () => {
    expect(DODGE_STAMINA_COST).toBe(12);
    expect(DODGE_EVADE_CHANCE).toBeCloseTo(0.88, 10);
    expect(canAffordDodge(11)).toBe(false);
    expect(canAffordDodge(12)).toBe(true);
    expect(canAffordDodge(Number.NaN)).toBe(false);
  });

  test('reaffirming a held stance is still free and spends no second reaction charge', () => {
    const first = planDodgeReaction({ isInvulnerable: false }, 40);
    expect(first.kind).toBe('activate');
    expect(first.staminaCost).toBe(12);
    expect(first.countsDodge).toBe(true);
    const held = planDodgeReaction({ isInvulnerable: true }, 40);
    expect(held.kind).toBe('reaffirm');
    expect(held.staminaCost).toBe(0);
    expect(held.countsDodge).toBe(false);
  });

  test('the guard wording stays loadout-aware and shield-accurate', () => {
    expect(shieldGuardFeedback('Marcus', true).log).toBe('Marcus braces behind their shield.');
    expect(shieldGuardFeedback('Marcus', false).log).toBe('Marcus sets a tight guard.');
    expect(shieldGuardFeedback('Marcus', false).cue).toBe('GUARD!');
    expect(reactionGuardFeedback('Marcus', true).log).toContain('shield');
    expect(reactionGuardFeedback('Marcus', false).log).not.toContain('shield');
    expect(blockedStrikeLog('Ignis', 'Marcus', true, 7)).toContain("Marcus's shield");
    expect(blockedStrikeLog('Ignis', 'Marcus', false, 7)).not.toContain('shield');
    expect(blockedStrikeLog('Ignis', 'Marcus', false, 7)).toContain("Marcus's guard");
  });

  test('the help screen names the shield as the condition for the credit', () => {
    expect(HELP_SOURCE).not.toContain('Restores: 12 SP');
    expect(HELP_SOURCE).toContain('recovers stamina only when it actually stops a blow');
    expect(HELP_SOURCE).toContain('a shield-bearing guard recovers stamina');
  });
});
