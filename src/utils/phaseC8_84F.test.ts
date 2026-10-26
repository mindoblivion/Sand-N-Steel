/**
 * C-8.84F — shield-accurate combat feedback at the last two sites.
 *
 * The C-8.84E audit confirmed in source that C-8.84D fixed only ONE of the three
 * places a raised guard is described, and left the same defect at two more:
 *
 *   D1  THE PLAYER'S REACTION GUARD. `reactToPendingAttack` logged
 *       `"<name> snaps the shield up!"` for every loadout. A player carrying the
 *       catalogue's spear or twin blades (buyable at the forge, which stocks
 *       every weapon but the starting gladius) was told they had raised a shield
 *       they do not own.
 *   D2  THE BLOCKED-STRIKE LINE. The resolution logged
 *       `"<attacker>'s strike was BLOCKED by <defender>'s shield ..."` whether or
 *       not the defender carries one — reachable for every `dual_blades`, spear
 *       and mace opponent the roster sends to the shared `shield_block` stance.
 *
 * The fix routes both through the module C-8.84D created, so there is still ONE
 * shield detector (`weaponCarriesShield`) and one place the wording lives. The
 * shield-equipped strings are byte-identical to the shipped ones; the stance,
 * the costs, the damage formula, the stamina credit and the timing are untouched.
 *
 * How faithful is this suite? Sections A–C execute the REAL copy module.
 * Section D runs the real detector over the shipped weapon catalogue and the
 * whole opponent roster. Section E binds the three production call sites by
 * source (the shipped `DuelScene` cannot be mounted here — no DOM renderer for
 * the scene, the convention `phaseC8_84D` established). Section F drives the
 * real stance helper. Section G pins the constants and the damage path.
 *
 * Limitation, stated rather than papered over: this is NOT live-duel acceptance
 * and NOT Android acceptance. No 3D scene is mounted and no wall clock is used.
 *
 * Run with: `bun test src/utils/phaseC8_84F.test.ts`
 */
// @ts-ignore - bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  blockedStrikeLog,
  reactionGuardFeedback,
  shieldGuardFeedback,
  weaponCarriesShield,
} from './guardFeedback';
import {
  DODGE_EVADE_CHANCE,
  DODGE_STAMINA_COST,
  ENEMY_ATTACK_WINDUP_MS,
  PLAYER_ATTACK_WINDUP_MS,
  applyDefensiveAction,
  clearDefensiveStance,
} from './combatCalculations';
import { ALL_WEAPONS } from '../data/itemsDB';
import { ALL_OPPONENTS } from '../data/opponents';

/** Source with comments stripped, so a docstring can never satisfy or defeat a pin. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const collapse = (src: string) => src.replace(/\s+/g, ' ');

const DUEL_SOURCE = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);
const DUEL_CODE = collapse(stripComments(DUEL_SOURCE));
const FEEDBACK_SOURCE = readFileSync(new URL('./guardFeedback.ts', import.meta.url), 'utf8');
const FEEDBACK_CODE = stripComments(FEEDBACK_SOURCE);

const SHIELDLESS_NAME = 'Flaccus the Dagger';
const SHIELD_NAME = 'Marcus the Legionary';

/** Every builder this module exposes, so one rule can be checked for all three. */
const BUILDERS: ReadonlyArray<readonly [string, (name: string, carries: boolean) => { log: string }]> = [
  ['turn action', shieldGuardFeedback],
  ['reaction', reactionGuardFeedback],
  ['blocked strike', (name, carries) => ({ log: blockedStrikeLog('Cassius', name, carries, 7) })],
];

// -- A. The reaction guard (D1) ----------------------------------------------

describe('A - the player reaction guard follows the loadout', () => {
  test('a shield-equipped fighter gets the shipped line, word for word', () => {
    expect(reactionGuardFeedback(SHIELD_NAME, true)).toEqual({
      log: `${SHIELD_NAME} snaps the shield up!`,
      cue: 'GUARD!',
    });
  });

  test('a shield-less fighter is told about a guard, never a shield', () => {
    const feedback = reactionGuardFeedback(SHIELDLESS_NAME, false);
    expect(feedback.log.toLowerCase()).not.toContain('shield');
    expect(feedback.log).toBe(`${SHIELDLESS_NAME} sets a tight guard.`);
  });

  test('the cue is the shipped GUARD! for both loadouts', () => {
    expect(reactionGuardFeedback(SHIELDLESS_NAME, true).cue).toBe('GUARD!');
    expect(reactionGuardFeedback(SHIELDLESS_NAME, false).cue).toBe('GUARD!');
  });

  test('the line names the fighter it was given, and differs between loadouts', () => {
    const armed = reactionGuardFeedback(SHIELD_NAME, true).log;
    const unarmed = reactionGuardFeedback(SHIELD_NAME, false).log;
    expect(armed.startsWith(SHIELD_NAME)).toBe(true);
    expect(unarmed.startsWith(SHIELD_NAME)).toBe(true);
    expect(armed).not.toBe(unarmed);
  });
});

// -- B. The blocked-strike line (D2) -----------------------------------------

describe('B - the blocked-strike line follows the defender loadout', () => {
  test('a shield-equipped defender keeps the shipped sentence', () => {
    expect(blockedStrikeLog('Cassius', 'Brutus', true, 9)).toBe(
      "Cassius's strike was BLOCKED by Brutus's shield (-9 HP)!",
    );
  });

  test('a shield-less defender is not credited with a shield', () => {
    const line = blockedStrikeLog('Cassius', SHIELDLESS_NAME, false, 9);
    expect(line.toLowerCase()).not.toContain('shield');
    expect(line).toBe(`Cassius's strike was BLOCKED by ${SHIELDLESS_NAME}'s guard (-9 HP)!`);
  });

  test('the damage figure is reported exactly as it was passed', () => {
    for (const damage of [1, 7, 12, 26, 72]) {
      expect(blockedStrikeLog('A', 'B', true, damage)).toContain(`(-${damage} HP)`);
      expect(blockedStrikeLog('A', 'B', false, damage)).toContain(`(-${damage} HP)`);
    }
  });

  test('the sentence keeps its shape: one attacker, one defender, one figure', () => {
    const line = blockedStrikeLog('Cassius', 'Ignis', false, 11);
    expect(line.split('BLOCKED').length - 1).toBe(1);
    expect(line.split('HP').length - 1).toBe(1);
    expect(line).not.toContain('undefined');
    expect(line).not.toContain('NaN');
  });
});

// -- C. The turn-action site C-8.84D fixed, still intact ---------------------

describe('C - the turn-action guard feedback is unchanged', () => {
  test('the shield-equipped pair is the shipped copy', () => {
    expect(shieldGuardFeedback(SHIELD_NAME, true)).toEqual({
      log: `${SHIELD_NAME} braces behind their shield.`,
      cue: 'BRACED!',
    });
  });

  test('the shield-less pair keeps C-8.84D wording', () => {
    expect(shieldGuardFeedback(SHIELDLESS_NAME, false)).toEqual({
      log: `${SHIELDLESS_NAME} sets a tight guard.`,
      cue: 'GUARD!',
    });
  });

  test('the two sites cannot disagree about what a shield-less fighter raised', () => {
    // The reaction and the turn action use the same neutral sentence; only the
    // shield-equipped wording differs (a different action, a different line).
    expect(reactionGuardFeedback('X', false).log).toBe(shieldGuardFeedback('X', false).log);
    expect(reactionGuardFeedback('X', true).log).not.toBe(shieldGuardFeedback('X', true).log);
  });
});

// -- D. The one detector, over the real catalogue ----------------------------

describe('D - one shield rule, over every weapon and the whole roster', () => {
  test('every catalogue weapon is classified by its own type', () => {
    expect(ALL_WEAPONS.length).toBeGreaterThan(5);
    for (const weapon of ALL_WEAPONS) {
      expect(weaponCarriesShield(weapon)).toBe(weapon.type === 'sword_shield');
    }
  });

  test('the roster really contains shield-less fighters', () => {
    const shieldless = ALL_OPPONENTS.filter((opponent) => {
      const weapon = ALL_WEAPONS.find((candidate) => candidate.type === opponent.weaponType);
      return weapon ? !weaponCarriesShield(weapon) : false;
    });
    expect(shieldless.length).toBeGreaterThan(0);
  });

  test('no shield-less builder output ever claims a shield, for any weapon or fighter', () => {
    const shieldlessWeapons = ALL_WEAPONS.filter((weapon) => !weaponCarriesShield(weapon));
    expect(shieldlessWeapons.length).toBeGreaterThan(0);
    for (const [label, build] of BUILDERS) {
      for (const weapon of shieldlessWeapons) {
        const text = build(SHIELDLESS_NAME, false).log;
        expect({ label, weapon: weapon.id, claimsShield: text.toLowerCase().includes('shield') })
          .toEqual({ label, weapon: weapon.id, claimsShield: false });
      }
      for (const opponent of ALL_OPPONENTS) {
        const text = build(opponent.name, false).log;
        expect({ opponent: opponent.name, claimsShield: text.toLowerCase().includes('shield') })
          .toEqual({ opponent: opponent.name, claimsShield: false });
      }
    }
  });

  test('the shield-equipped path still names the shield, for every builder', () => {
    for (const [, build] of BUILDERS) {
      const text = build(SHIELD_NAME, true).log;
      expect(text).toContain('shield');
      expect(text).toContain(SHIELD_NAME);
    }
  });

  test('no resolved weapon means a shield, matching the rendered mesh', () => {
    expect(weaponCarriesShield(undefined)).toBe(true);
    expect(weaponCarriesShield(null)).toBe(true);
  });

  test('the control: the pre-fix literals would fail this suite\'s own rule', () => {
    // Sensitivity check — the pre-fix strings contain the word the rule forbids.
    expect('Flaccus snaps the shield up!'.toLowerCase()).toContain('shield');
    expect("Cassius's strike was BLOCKED by Flaccus's shield (-9 HP)!".toLowerCase()).toContain(
      'shield',
    );
    // ... and the shipped shield-less output does not.
    expect(reactionGuardFeedback(SHIELDLESS_NAME, false).log.toLowerCase()).not.toContain('shield');
    expect(blockedStrikeLog('Cassius', SHIELDLESS_NAME, false, 9).toLowerCase()).not.toContain(
      'shield',
    );
  });
});

// -- E. The three production call sites --------------------------------------

describe('E - all three sites use the shared module and the shared rule', () => {
  test('the scene imports the three builders and the one detector', () => {
    expect(DUEL_CODE).toContain('from \'../../utils/guardFeedback\'');
    for (const name of [
      'blockedStrikeLog',
      'reactionGuardFeedback',
      'shieldGuardFeedback',
      'weaponCarriesShield',
    ]) {
      expect(DUEL_CODE).toContain(name);
    }
  });

  test('the turn-action site asks the detector about the ATTACKER', () => {
    expect(DUEL_CODE).toMatch(
      /shieldGuardFeedback\(\s*attacker\.name,\s*weaponCarriesShield\(attacker\.loadout\.weapon\)/,
    );
  });

  test('the reaction site asks the detector about the PLAYER', () => {
    expect(DUEL_CODE).toMatch(
      /reactionGuardFeedback\(\s*player\.name,\s*weaponCarriesShield\(player\.loadout\.weapon\)/,
    );
    expect(DUEL_CODE).toContain("addLog(reactionGuard.log, 'player')");
    expect(DUEL_CODE).toContain("spawnDamageText(reactionGuard.cue, 'blocked', player.position)");
  });

  test('the blocked-strike site asks the detector about the DEFENDER', () => {
    expect(DUEL_CODE).toMatch(
      /addLog\(\s*blockedStrikeLog\(\s*attacker\.name,\s*defender\.name,\s*weaponCarriesShield\(defender\.loadout\.weapon\),\s*rawDamage,?\s*\)/,
    );
  });

  test('no shield-specific literal survives in the scene', () => {
    expect(DUEL_SOURCE).not.toContain('snaps the shield up!');
    expect(DUEL_SOURCE).not.toContain("'s shield (-");
    expect(DUEL_SOURCE).not.toContain('braces behind their shield');
    expect(DUEL_SOURCE).not.toContain("'BRACED!'");
  });

  test('the scene holds no second shield detector of its own', () => {
    // The heuristic (a name/id containing "shield") lives only in the module.
    expect(DUEL_CODE.toLowerCase()).not.toContain("includes('shield')");
    expect(FEEDBACK_CODE.toLowerCase()).toContain("includes('shield')");
    expect(FEEDBACK_CODE).toContain('export function weaponCarriesShield');
  });

  test('the wording lives in the module, not in the scene', () => {
    expect(FEEDBACK_CODE).toContain('snaps the shield up!');
    expect(FEEDBACK_CODE).toContain('braces behind their shield.');
    expect(FEEDBACK_CODE).toContain('BLOCKED by');
  });
});

// -- F. The stance and the cost are what they were ---------------------------

describe('F - the fallback still braces, and never grants Dodge invulnerability', () => {
  test('shield_block sets the block flag and nothing else', () => {
    expect(applyDefensiveAction(clearDefensiveStance({ isBlocking: false, isInvulnerable: false }), 'shield_block'))
      .toEqual({ isBlocking: true, isInvulnerable: false });
  });

  test('a shield-less reaction writes the same stance as a shielded one', () => {
    const start = clearDefensiveStance({ isBlocking: false, isInvulnerable: false });
    expect(applyDefensiveAction(start, 'shield_block')).toEqual(
      applyDefensiveAction(start, 'shield_block'),
    );
    // The copy is the only thing that varies with the loadout.
    expect(reactionGuardFeedback('X', true).cue).toBe(reactionGuardFeedback('X', false).cue);
  });

  test('the reaction branch writes a block stance and never a dodge', () => {
    // The stance is written BEFORE the copy, so the branch is anchored on the
    // guard's own `playBlock` inside the shipped reaction handler.
    const fnStart = DUEL_CODE.indexOf('const reactToPendingAttack = useCallback(');
    expect(fnStart).toBeGreaterThan(-1);
    const fn = DUEL_CODE.slice(fnStart, DUEL_CODE.indexOf('// No blow may outlive the scene'));
    const guardAt = fn.indexOf('sounds.playBlock();');
    expect(guardAt).toBeGreaterThan(-1);
    const branch = fn.slice(guardAt, guardAt + 600);
    expect(branch).toContain("action: 'block'");
    expect(branch).toContain('reactionGuard.log');
    expect(branch).toContain('reactionGuard.cue');
    expect(branch).toContain("applyDefensiveAction(clearDefensiveStance(prev), 'shield_block')");
    expect(branch).not.toContain('isInvulnerable: true');
    expect(branch).not.toContain('DODGE_STAMINA_COST');
  });

  test('the turn-action guard branch is still a block, not a dodge', () => {
    const start = DUEL_CODE.indexOf("else if (actionType === 'shield_block') {");
    const end = DUEL_CODE.indexOf("} else if (actionType === 'dodge') {");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const branch = DUEL_CODE.slice(start, end);
    expect(branch).toContain('isBlocking: true');
    expect(branch).not.toContain('isInvulnerable');
    expect(branch).toContain("action: 'block'");
  });
});

// -- G. Nothing about cost, damage, stamina or timing moved ------------------

describe('G - affordability, damage, stamina and timing are untouched', () => {
  test('the Dodge price and evade rate are the shipped constants', () => {
    expect(DODGE_STAMINA_COST).toBe(12);
    expect(DODGE_EVADE_CHANCE).toBe(0.88);
  });

  test('the wind-ups are the shipped 700 ms pair', () => {
    expect(ENEMY_ATTACK_WINDUP_MS).toBe(700);
    expect(PLAYER_ATTACK_WINDUP_MS).toBe(700);
  });

  test('the blocked branch still computes damage through the real formula arguments', () => {
    // The figure is computed before the branch, so the call itself is pinned.
    expect(DUEL_CODE).toMatch(
      /const rawDamage = calculateAttackDamage\(\s*baseDmg,\s*attacker\.stats\.strength,\s*isCrit,\s*defender\.stats\.defense,\s*isBlocked,\s*defender\.loadout\.weapon\.blockReduction,\s*rageMult,?\s*\)/,
    );
    expect(DUEL_CODE).toContain('const isBlocked = defender.isBlocking;');
  });

  test('the guard credit is still the blocked branch\'s only stamina write', () => {
    expect(DUEL_SOURCE.split('shieldGuardStaminaGain(').length - 1).toBe(1);
    const start = DUEL_CODE.indexOf('if (isBlocked) {');
    const branch = DUEL_CODE.slice(start, start + 900);
    expect(branch).toContain('shieldGuardStaminaGain(true, defender.stats.staminaRegen)');
  });

  test('the module cannot spend, deal, heal or randomise anything', () => {
    for (const forbidden of [
      'stamina',
      'DODGE_STAMINA_COST',
      'Math.random',
      'calculateAttackDamage',
      'applyStaminaRegen',
      'Date.now',
    ]) {
      expect({ forbidden, present: FEEDBACK_CODE.includes(forbidden) }).toEqual({
        forbidden,
        present: false,
      });
    }
  });

  test('the three builders are pure: same input, same output, no shared state', () => {
    for (const [, build] of BUILDERS) {
      expect(build('X', true)).toEqual(build('X', true));
      expect(build('X', false)).toEqual(build('X', false));
    }
  });
});
