/**
 * C-8.85E — the stopped-blow Guard credit is the SHIELD's reward.
 *
 * C-8.85A/B/C priced a defensive economy in which Shield Guard was dominant and
 * C-8.85D's design gate recommended one package: award the credit only to a
 * defender whose equipped weapon carries a shield. That is the whole rule. The
 * `shield_block` stance is shared by every weapon (C-8.84B sends an
 * unaffordable Dodge there), and until this phase a spear or twin-blade brace
 * stopped the blow, took the 82-85 % mitigation AND minted the same stamina a
 * scutum did — the shield's reward paid to a fighter with no shield.
 *
 * What this suite runs, and what it can only bind by source:
 *   A  the eligibility rule itself, over the real catalogue and the real roster;
 *   B  the shielded credit, unchanged to the SP from C-8.72B;
 *   C  a shield-less defender earning nothing for the same stopped blow;
 *   D  an unblocked strike, whatever the loadout;
 *   E  the dodge / evade branches;
 *   F  once per resolved strike, applied once;
 *   G  the stamina cap, both loadouts;
 *   H  player and AI defenders under the same rule;
 *   I  the shared shield-feedback seam staying consistent with the credit.
 *
 * Sections A, B, C, D, G, H and I exercise the REAL production helpers.
 * Sections E, F and H's call-site half bind the shipped `DuelScene` by source,
 * the convention `phaseC8_84D`/`phaseC8_84F`/`combatResponsiveness` established:
 * the scene cannot be mounted here (no DOM renderer for the arena, which renders
 * at ~1-2 fps through SwiftShader in this container).
 *
 * Limitation, stated rather than papered over: this is NOT live-duel acceptance
 * and NOT Android acceptance. No 3D scene is mounted, no wall clock is used and
 * no RNG is drawn.
 *
 * Run with: `bun test src/utils/phaseC8_85E.test.ts`
 */
// @ts-ignore - bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  applyStaminaRegen,
  canAffordDodge,
  carriesShieldForGuardCredit,
  DODGE_EVADE_CHANCE,
  DODGE_STAMINA_COST,
  SHIELD_GUARD_REGEN_MULTIPLIER,
  shieldGuardStaminaGain,
} from './combatCalculations';
import {
  blockedStrikeLog,
  reactionGuardFeedback,
  shieldGuardFeedback,
  weaponCarriesShield,
} from './guardFeedback';
import { ALL_WEAPONS, getWeaponByType } from '../data/itemsDB';
import { ALL_OPPONENTS } from '../data/opponents';

/** Source with comments stripped, so a docstring can never satisfy or defeat a pin. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const DUEL_SOURCE = stripComments(
  readFileSync(new URL('../components/duel/DuelScene.tsx', import.meta.url), 'utf8'),
);
const CALC_SOURCE = stripComments(
  readFileSync(new URL('./combatCalculations.ts', import.meta.url), 'utf8'),
);

/** The credit's own call site, and the branch it lives in. */
const CREDIT_CALL = DUEL_SOURCE.indexOf('shieldGuardStaminaGain(');
const BLOCK_OPENS = DUEL_SOURCE.lastIndexOf('if (isBlocked) {', CREDIT_CALL);
const UNBLOCKED_OPENS = DUEL_SOURCE.indexOf('\n            } else {', CREDIT_CALL);
const TRACK_STATS = DUEL_SOURCE.indexOf('// Track stats', UNBLOCKED_OPENS);
const BLOCKED_BRANCH = DUEL_SOURCE.slice(BLOCK_OPENS, UNBLOCKED_OPENS);
const UNBLOCKED_BRANCH = DUEL_SOURCE.slice(UNBLOCKED_OPENS, TRACK_STATS);
const EVADE_BRANCH = DUEL_SOURCE.slice(
  DUEL_SOURCE.indexOf('if (isEvaded || isPassiveEvaded) {'),
  DUEL_SOURCE.indexOf('} else if (roll <= hitPct) {'),
);

/** The C-8.85D measured builds: gladius kit regen 29.7, sicae kit regen 34.5. */
const GLADIUS_KIT_REGEN = 29.7;
const SICAE_KIT_REGEN = 34.5;

const weapon = (type: Parameters<typeof getWeaponByType>[0]) => getWeaponByType(type);

/** The credit exactly as the resolution computes it, for one defender weapon. */
const creditFor = (equipped: unknown, regen: number) =>
  shieldGuardStaminaGain(
    true,
    regen,
    carriesShieldForGuardCredit(equipped as ReturnType<typeof getWeaponByType>),
  );

// ── A. The eligibility rule ────────────────────────────────────────────────

describe('A — the credit is earned by a shield, decided by the canonical rule', () => {
  test('every shield-bearing catalogue weapon is eligible', () => {
    const shielded = ALL_WEAPONS.filter((w) => w.type === 'sword_shield');
    expect(shielded.length).toBeGreaterThanOrEqual(3);
    for (const w of shielded) {
      expect(carriesShieldForGuardCredit(w)).toBe(true);
    }
    // The shipped starter, named explicitly: the default loadout keeps its credit.
    expect(carriesShieldForGuardCredit(weapon('sword_shield'))).toBe(true);
  });

  test('no shield-less catalogue weapon is eligible', () => {
    const shieldless = ALL_WEAPONS.filter((w) => w.type !== 'sword_shield');
    expect(shieldless.length).toBeGreaterThanOrEqual(6);
    for (const w of shieldless) {
      expect(weaponCarriesShield(w)).toBe(false);
      expect(carriesShieldForGuardCredit(w)).toBe(false);
    }
  });

  test('missing, null and malformed weapon data fails safe — no credit', () => {
    expect(carriesShieldForGuardCredit(undefined)).toBe(false);
    expect(carriesShieldForGuardCredit(null)).toBe(false);
    // A weapon object with nothing classifiable in it.
    expect(carriesShieldForGuardCredit({})).toBe(false);
    expect(carriesShieldForGuardCredit({ type: undefined, name: undefined, id: undefined })).toBe(false);
    expect(carriesShieldForGuardCredit({ type: 'unknown_weapon' })).toBe(false);
    expect(carriesShieldForGuardCredit({ name: '', id: '' })).toBe(false);
    expect(carriesShieldForGuardCredit({ type: 'spear', name: 'Dory Hoplite Spear' })).toBe(false);
  });

  test('the eligibility IS the canonical rule — one definition, no drift', () => {
    for (const w of ALL_WEAPONS) {
      expect(carriesShieldForGuardCredit(w)).toBe(weaponCarriesShield(w));
    }
    // The credit module must not re-implement the classification: it asks the
    // detector rather than testing `type`/`name` itself.
    expect(CALC_SOURCE).toContain('weaponCarriesShield');
    expect(CALC_SOURCE).not.toContain("includes('shield')");
    expect(CALC_SOURCE).not.toContain("=== 'sword_shield'");
  });
});

// ── B. The shielded credit is untouched ────────────────────────────────────

describe('B — a shield carrier receives exactly the C-8.72B credit', () => {
  test('the multiplier and the formula are unchanged', () => {
    expect(SHIELD_GUARD_REGEN_MULTIPLIER).toBe(0.5);
    const gladiusKit = creditFor(weapon('sword_shield'), GLADIUS_KIT_REGEN);
    expect(gladiusKit).toBeCloseTo(14.85, 10); // the C-8.85D measured figure
    expect(gladiusKit).toBeCloseTo(GLADIUS_KIT_REGEN * SHIELD_GUARD_REGEN_MULTIPLIER, 10);
    // The pre-existing two-argument contract is preserved verbatim.
    expect(shieldGuardStaminaGain(true, 24)).toBe(12);
    expect(shieldGuardStaminaGain(true, 5)).toBe(2.5);
    expect(shieldGuardStaminaGain(true, 31.9)).toBeCloseTo(15.95, 10);
  });

  test('every shield weapon credits the same halved regen', () => {
    for (const w of ALL_WEAPONS.filter((x) => x.type === 'sword_shield')) {
      expect(creditFor(w, GLADIUS_KIT_REGEN)).toBeCloseTo(14.85, 10);
    }
  });
});

// ── C. A shield-less defender earns nothing ────────────────────────────────

describe('C — a shield-less defender earns zero for the same stopped blow', () => {
  test('the blocked strike pays nothing to a shield-less brace', () => {
    for (const w of ALL_WEAPONS.filter((x) => x.type !== 'sword_shield')) {
      expect(creditFor(w, GLADIUS_KIT_REGEN)).toBe(0);
      expect(creditFor(w, SICAE_KIT_REGEN)).toBe(0);
    }
  });

  test('the shield-less defender\'s stamina is left exactly where it was', () => {
    const gain = creditFor(weapon('dual_blades'), SICAE_KIT_REGEN);
    expect(gain).toBe(0);
    expect(applyStaminaRegen(50, 120, gain)).toBe(50);
    expect(applyStaminaRegen(0, 120, gain)).toBe(0);
    // The mitigation is NOT touched by this gate: the blow is still blocked and
    // still absorbed — the shield only stops paying stamina for it.
    expect(weapon('dual_blades').blockReduction).toBeGreaterThan(0);
  });
});

// ── D. An unblocked strike credits nothing ─────────────────────────────────

describe('D — no credit unless the guard actually stopped the blow', () => {
  test('the stopped-blow flag is the first gate, whatever the loadout', () => {
    for (const eligible of [true, false]) {
      expect(shieldGuardStaminaGain(false, GLADIUS_KIT_REGEN, eligible)).toBe(0);
      expect(shieldGuardStaminaGain(false, 0.0001, eligible)).toBe(0);
      expect(shieldGuardStaminaGain(false, 999, eligible)).toBe(0);
    }
  });

  test('the unblocked resolution branch writes no stamina at all', () => {
    expect(BLOCK_OPENS).toBeGreaterThan(-1);
    expect(BLOCKED_BRANCH).toContain('shieldGuardStaminaGain(');
    expect(UNBLOCKED_BRANCH.length).toBeGreaterThan(0);
    expect(UNBLOCKED_BRANCH).not.toContain('shieldGuardStaminaGain');
    expect(UNBLOCKED_BRANCH).not.toContain('applyStaminaRegen');
    expect(UNBLOCKED_BRANCH).not.toContain('guardGain');
  });
});

// ── E. Dodge and the other defensive branches ──────────────────────────────

describe('E — Dodge and unrelated defensive branches grant no Guard credit', () => {
  test('the evade branch carries no credit and no stamina write', () => {
    expect(EVADE_BRANCH.length).toBeGreaterThan(0);
    expect(EVADE_BRANCH).toContain('EVADED');
    expect(EVADE_BRANCH).not.toContain('shieldGuardStaminaGain');
    expect(EVADE_BRANCH).not.toContain('applyStaminaRegen');
  });

  test('the stances themselves stay priced as shipped', () => {
    expect(DODGE_STAMINA_COST).toBe(12);
    expect(DODGE_EVADE_CHANCE).toBeCloseTo(0.88, 10);
    expect(canAffordDodge(DODGE_STAMINA_COST)).toBe(true);
    expect(canAffordDodge(DODGE_STAMINA_COST - 1)).toBe(false);
    // Raising the guard neither charges nor credits on its own turn.
    const guardBranchStart = DUEL_SOURCE.indexOf("else if (actionType === 'shield_block') {");
    const guardBranchEnd = DUEL_SOURCE.indexOf("} else if (actionType === 'dodge') {");
    const guardBranch = DUEL_SOURCE.slice(guardBranchStart, guardBranchEnd);
    expect(guardBranch.length).toBeGreaterThan(0);
    expect(guardBranch).not.toContain('applyStaminaRegen');
    expect(guardBranch).not.toContain('shieldGuardStaminaGain');
  });

  test('a dodging defender that is not struck earns nothing', () => {
    // The dodge stance itself grants no credit: the helper is only reachable with
    // `didStopBlow === true`, and a dodge that evades never reaches it.
    expect(shieldGuardStaminaGain(false, GLADIUS_KIT_REGEN, true)).toBe(0);
    // And a shield-less dodger is ineligible even if a blow were stopped.
    expect(creditFor(weapon('spear'), GLADIUS_KIT_REGEN)).toBe(0);
  });
});

// ── F. Once per resolved strike ────────────────────────────────────────────

describe('F — the credit is computed once per resolved strike', () => {
  test('exactly one credit call site exists, inside the blocked branch', () => {
    const calls = DUEL_SOURCE.split('shieldGuardStaminaGain(').length - 1;
    expect(calls).toBe(1);
    expect(BLOCK_OPENS).toBeGreaterThan(-1);
    expect(DUEL_SOURCE.lastIndexOf('} else {', CREDIT_CALL)).toBeLessThan(BLOCK_OPENS);
  });

  test('the gain is computed once and applied once, in either defender arm', () => {
    // ONE computation of `guardGain`...
    expect(BLOCKED_BRANCH.split('const guardGain').length - 1).toBe(1);
    // ...feeding two mutually exclusive writes (player defender / AI defender).
    const applies = BLOCKED_BRANCH.split('applyStaminaRegen(').length - 1;
    expect(applies).toBe(2);
    expect(BLOCKED_BRANCH.split('guardGain').length - 1).toBe(3); // decl + 2 uses
    expect(BLOCKED_BRANCH).toContain('setOpp(');
    expect(BLOCKED_BRANCH).toContain('setPlayer(');
    // A single application adds exactly one credit, never two.
    const gain = creditFor(weapon('sword_shield'), GLADIUS_KIT_REGEN);
    expect(applyStaminaRegen(50, 120, gain)).toBeCloseTo(50 + gain, 10);
    expect(applyStaminaRegen(50, 120, gain)).not.toBeCloseTo(50 + 2 * gain, 10);
  });
});

// ── G. The stamina cap ─────────────────────────────────────────────────────

describe('G — the cap holds for both loadouts', () => {
  test('a shield carrier is clamped at staminaMax', () => {
    const gain = creditFor(weapon('sword_shield'), GLADIUS_KIT_REGEN);
    expect(applyStaminaRegen(0, 120, gain)).toBeCloseTo(14.85, 10);
    expect(applyStaminaRegen(110, 120, gain)).toBe(120);
    expect(applyStaminaRegen(120, 120, gain)).toBe(120);
    expect(applyStaminaRegen(0, 120, shieldGuardStaminaGain(true, 999, true))).toBe(120);
  });

  test('a shield-less defender is neither credited nor pushed over the cap', () => {
    const gain = creditFor(weapon('mace'), GLADIUS_KIT_REGEN);
    expect(applyStaminaRegen(110, 120, gain)).toBe(110);
    expect(applyStaminaRegen(120, 120, gain)).toBe(120);
    expect(applyStaminaRegen(0, 120, gain)).toBe(0);
  });

  test('malformed regen credits nothing for either loadout', () => {
    for (const eligible of [true, false]) {
      expect(shieldGuardStaminaGain(true, 0, eligible)).toBe(0);
      expect(shieldGuardStaminaGain(true, -8, eligible)).toBe(0);
      expect(shieldGuardStaminaGain(true, Number.NaN, eligible)).toBe(0);
      expect(shieldGuardStaminaGain(true, Number.POSITIVE_INFINITY, eligible)).toBe(0);
    }
  });
});

// ── H. Player and AI defenders ─────────────────────────────────────────────

describe('H — one rule for a player defender and an AI defender', () => {
  test('the resolution decides eligibility from the DEFENDER\'s weapon, once', () => {
    // One call site, and it reads the defender's own loadout — the defender is
    // whichever fighter is not the attacker, so the same line serves both.
    expect(DUEL_SOURCE.split('carriesShieldForGuardCredit(').length - 1).toBe(1);
    expect(BLOCKED_BRANCH).toContain('carriesShieldForGuardCredit(defender.loadout?.weapon)');
  });

  test('every opponent in the roster resolves under the same weapon rule', () => {
    expect(ALL_OPPONENTS.length).toBeGreaterThanOrEqual(8);
    for (const opponent of ALL_OPPONENTS) {
      const equipped = opponent.loadout?.weapon ?? getWeaponByType(opponent.weaponType);
      expect(carriesShieldForGuardCredit(equipped)).toBe(opponent.weaponType === 'sword_shield');
    }
  });

  test('a player and an AI defender carrying the same weapon are treated alike', () => {
    for (const type of ['sword_shield', 'spear', 'dual_blades', 'mace'] as const) {
      const playerWeapon = getWeaponByType(type);
      const aiWeapon = getWeaponByType(type);
      expect(carriesShieldForGuardCredit(playerWeapon)).toBe(carriesShieldForGuardCredit(aiWeapon));
      expect(creditFor(playerWeapon, GLADIUS_KIT_REGEN)).toBe(creditFor(aiWeapon, GLADIUS_KIT_REGEN));
    }
  });
});

// ── I. The shared shield-feedback seam ─────────────────────────────────────

describe('I — the credit agrees with the shield feedback the player is given', () => {
  test('every catalogue weapon gets shield wording exactly when it is eligible', () => {
    for (const w of ALL_WEAPONS) {
      const eligible = carriesShieldForGuardCredit(w);
      expect(shieldGuardFeedback('Drusus', eligible).cue).toBe(eligible ? 'BRACED!' : 'GUARD!');
      expect(shieldGuardFeedback('Drusus', eligible).log).toBe(
        eligible ? 'Drusus braces behind their shield.' : 'Drusus sets a tight guard.',
      );
      expect(reactionGuardFeedback('Drusus', eligible).log).toBe(
        eligible ? 'Drusus snaps the shield up!' : 'Drusus sets a tight guard.',
      );
      expect(blockedStrikeLog('Aurelius', 'Drusus', eligible, 7).includes('shield')).toBe(eligible);
    }
  });

  test('the shield wording is byte-identical to the shipped copy', () => {
    expect(shieldGuardFeedback('Drusus', true)).toEqual({
      log: 'Drusus braces behind their shield.',
      cue: 'BRACED!',
    });
    expect(reactionGuardFeedback('Drusus', true)).toEqual({
      log: 'Drusus snaps the shield up!',
      cue: 'GUARD!',
    });
    expect(blockedStrikeLog('Aurelius', 'Drusus', true, 7)).toBe(
      "Aurelius's strike was BLOCKED by Drusus's shield (-7 HP)!",
    );
  });
});
