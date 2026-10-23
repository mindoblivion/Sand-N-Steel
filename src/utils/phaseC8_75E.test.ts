/**
 * AI strike affordability (C-8.75E).
 *
 * The defect this pins: the opponent's in-range tactical chain chose a POWER
 * attack without ever comparing that attack's cost to its stamina. The only
 * stamina test in the chain was `opp.stamina < oppLightCost` — the LIGHT
 * attack's cost — and it sat behind branches (player guarding, player low HP,
 * the `chooseAIStandardAction` pool) that could name the heavy strike anyway.
 * Resolution then clamped the bill with `Math.max(0, stamina - cost)`, so an
 * opponent at 14 SP threw a 22 SP power slash and kept the damage it paid 12 for.
 *
 * Two registers, as the neighbouring combat suites use them:
 *   - the SHIPPED pure helpers, driven directly at every cost boundary
 *     (`canAffordAttack`, `enforceAffordableAIAction`, `chooseAITacticalAction`)
 *     — this is the production path: `DuelScene`'s AI effect calls the last one;
 *   - ordered source assertions for the wiring this repo cannot mount (there is
 *     no DOM renderer for `<DuelScene/>`), anchored on CODE markers and run on
 *     comment-stripped text so the phase's own prose cannot satisfy a check.
 *
 * Sections:
 *   §A the affordability predicate at the light, power and in-between boundaries
 *   §B the downgrade and the no-affordable-attack fallback
 *   §C selection: no boundary and no branch can yield an unaffordable strike
 *   §D the shipped weights, thresholds and draw counts are unchanged
 *   §E resolution: an unaffordable strike is refused before it costs anything
 *   §F the paths that bypass selection (counter, telegraph) read the same rule
 *
 * Run with: bun test src/utils/phaseC8_75E.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  canAffordAttack,
  chooseAITacticalAction,
  enforceAffordableAIAction,
} from './aiActionSelection';
import type { AITacticalContext } from './aiActionSelection';
import { chooseAIStandardAction, getStaminaCost } from './combatCalculations';
import { ALL_WEAPONS, getWeaponByType } from '../data/itemsDB';
import { ALL_OPPONENTS } from '../data/opponents';

const duelSource = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);

/** Index of a marker that must exist, reported by name when it does not. */
function at(source: string, marker: string): number {
  const index = source.indexOf(marker);
  expect({ marker, found: index >= 0 }).toEqual({ marker, found: true });
  return index;
}

/** The slice between two markers, both required. */
function between(source: string, start: string, end: string): string {
  const from = at(source, start);
  const to = at(source, end);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

/** Source with `//` comments stripped, so prose cannot satisfy — or defeat — a check. */
function codeOnly(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

/** A weapon with two DIFFERENT strike costs — the boundary values are read, not assumed. */
const WEAPON = getWeaponByType('sword_shield');
const LIGHT = getStaminaCost(WEAPON, true);
const HEAVY = getStaminaCost(WEAPON, false);
const BETWEEN = Math.floor((LIGHT + HEAVY) / 2);

/** The stamina boundaries the brief names, derived from the shipped costs. */
const BOUNDARIES: Array<{ name: string; stamina: number }> = [
  { name: 'below the light cost', stamina: LIGHT - 1 },
  { name: 'exactly the light cost', stamina: LIGHT },
  { name: 'between the light and power costs', stamina: BETWEEN },
  { name: 'exactly the power cost', stamina: HEAVY },
  { name: 'above both costs', stamina: HEAVY + 40 },
];

const DRAWS = [0, 0.1, 0.3, 0.44, 0.45, 0.6, 0.69, 0.7, 0.74, 0.75, 0.9, 0.99];

function everyTacticalContext(stamina: number): AITacticalContext[] {
  const base = { stamina, weapon: WEAPON };
  return [
    { ...base, playerIsBlocking: false, playerHealth: 100, aggression: 0.95, blockChance: 0.7 },
    { ...base, playerIsBlocking: true, playerHealth: 100, aggression: 0.95, blockChance: 0.7 },
    { ...base, playerIsBlocking: false, playerHealth: 10, aggression: 0.95, blockChance: 0.7 },
    // The fallback-probability path (`chooseAIStandardAction`'s own default).
    { ...base, playerIsBlocking: false, playerHealth: 100 },
  ];
}

// ── §A. The predicate, at every cost boundary ──────────────────────────────

describe('§A — the cost compared is the attack actually being thrown', () => {
  test('the two strike costs of the audited weapon are distinct', () => {
    // Without this the boundaries below would collapse onto each other.
    expect(HEAVY).toBeGreaterThan(LIGHT);
  });

  test('below the light cost: neither strike is affordable', () => {
    expect(canAffordAttack(LIGHT - 1, WEAPON, 'quick_attack')).toBe(false);
    expect(canAffordAttack(LIGHT - 1, WEAPON, 'power_attack')).toBe(false);
  });

  test('exactly the light cost: the quick attack is affordable, the power attack is not', () => {
    expect(canAffordAttack(LIGHT, WEAPON, 'quick_attack')).toBe(true);
    expect(canAffordAttack(LIGHT, WEAPON, 'power_attack')).toBe(false);
  });

  test('between the costs: still only the quick attack', () => {
    expect(canAffordAttack(BETWEEN, WEAPON, 'quick_attack')).toBe(true);
    expect(canAffordAttack(BETWEEN, WEAPON, 'power_attack')).toBe(false);
  });

  test('exactly the power cost: both are affordable', () => {
    expect(canAffordAttack(HEAVY, WEAPON, 'quick_attack')).toBe(true);
    expect(canAffordAttack(HEAVY, WEAPON, 'power_attack')).toBe(true);
  });

  test('above both costs: both are affordable', () => {
    expect(canAffordAttack(HEAVY + 40, WEAPON, 'quick_attack')).toBe(true);
    expect(canAffordAttack(HEAVY + 40, WEAPON, 'power_attack')).toBe(true);
  });

  test('the predicate reads the ATTACK’s own cost, not a stand-in', () => {
    // The exact defect: the light cost standing in for both strikes.
    expect(canAffordAttack(LIGHT, WEAPON, 'quick_attack')).toBe(
      LIGHT >= getStaminaCost(WEAPON, true),
    );
    expect(canAffordAttack(LIGHT, WEAPON, 'power_attack')).toBe(
      LIGHT >= getStaminaCost(WEAPON, false),
    );
  });

  test('a corrupt stamina balance affords nothing', () => {
    for (const stamina of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, undefined as unknown as number]) {
      expect(canAffordAttack(stamina, WEAPON, 'quick_attack')).toBe(false);
      expect(canAffordAttack(stamina, WEAPON, 'power_attack')).toBe(false);
    }
  });

  test('every weapon in the catalogue follows its own two costs', () => {
    for (const weapon of ALL_WEAPONS) {
      const light = getStaminaCost(weapon, true);
      const heavy = getStaminaCost(weapon, false);
      expect(canAffordAttack(light, weapon, 'quick_attack')).toBe(true);
      expect(canAffordAttack(light, weapon, 'power_attack')).toBe(light >= heavy);
      expect(canAffordAttack(heavy, weapon, 'power_attack')).toBe(true);
    }
  });
});

// ── §B. Downgrade and fallback ────────────────────────────────────────────

describe('§B — an unaffordable action is downgraded, never executed', () => {
  test('power attack with only the light cost available becomes a quick attack', () => {
    expect(enforceAffordableAIAction('power_attack', BETWEEN, WEAPON)).toBe('quick_attack');
    expect(enforceAffordableAIAction('power_attack', LIGHT, WEAPON)).toBe('quick_attack');
  });

  test('an affordable action is returned untouched', () => {
    expect(enforceAffordableAIAction('power_attack', HEAVY, WEAPON)).toBe('power_attack');
    expect(enforceAffordableAIAction('power_attack', HEAVY + 40, WEAPON)).toBe('power_attack');
    expect(enforceAffordableAIAction('quick_attack', LIGHT, WEAPON)).toBe('quick_attack');
  });

  test('with neither strike affordable the turn falls back to the existing rest', () => {
    expect(enforceAffordableAIAction('quick_attack', LIGHT - 1, WEAPON)).toBe('rest');
    expect(enforceAffordableAIAction('power_attack', LIGHT - 1, WEAPON)).toBe('rest');
    expect(enforceAffordableAIAction('power_attack', 0, WEAPON)).toBe('rest');
  });

  test('non-strike actions are never rewritten, whatever the stamina', () => {
    for (const action of ['shield_block', 'dodge', 'taunt', 'rest'] as const) {
      for (const stamina of [0, LIGHT - 1, BETWEEN, HEAVY + 40]) {
        expect(enforceAffordableAIAction(action, stamina, WEAPON)).toBe(action);
      }
    }
  });

  test('enforcement is idempotent and draws no randomness', () => {
    for (const stamina of [0, LIGHT - 1, LIGHT, BETWEEN, HEAVY, HEAVY + 40]) {
      const once = enforceAffordableAIAction('power_attack', stamina, WEAPON);
      expect(enforceAffordableAIAction(once, stamina, WEAPON)).toBe(once);
      // Whatever it hands back is affordable as an attack, or is not an attack.
      if (once === 'quick_attack' || once === 'power_attack') {
        expect(canAffordAttack(stamina, WEAPON, once)).toBe(true);
      }
    }
  });
});

// ── §C. Selection at every boundary, through the production helper ────────

describe('§C — the production selector never returns an unaffordable strike', () => {
  test('every boundary × every branch × every draw: an attack is always affordable', () => {
    for (const { stamina } of BOUNDARIES) {
      for (const context of everyTacticalContext(stamina)) {
        for (const draw of DRAWS) {
          const action = chooseAITacticalAction(context, draw);
          if (action === 'quick_attack' || action === 'power_attack') {
            expect({ stamina, draw, action, affordable: canAffordAttack(stamina, WEAPON, action) })
              .toMatchObject({ affordable: true });
          }
        }
      }
    }
  });

  test('below the light cost nothing strikes, on any draw or branch', () => {
    for (const context of everyTacticalContext(LIGHT - 1)) {
      for (const draw of DRAWS) {
        const action = chooseAITacticalAction(context, draw);
        expect(['quick_attack', 'power_attack']).not.toContain(action);
      }
    }
  });

  test('below the light cost the shipped recovery branch answers (block or rest)', () => {
    const actions = new Set(DRAWS.map((d) => chooseAITacticalAction(everyTacticalContext(0)[0], d)));
    expect([...actions].sort()).toEqual(['rest', 'shield_block']);
  });

  test('exactly the light cost: a quick attack is allowed, a power attack is never chosen', () => {
    for (const context of everyTacticalContext(LIGHT)) {
      for (const draw of DRAWS) {
        expect(chooseAITacticalAction(context, draw)).not.toBe('power_attack');
      }
    }
  });

  test('between the costs: the heavy slice degrades to the quick attack it can pay for', () => {
    const blocking = everyTacticalContext(BETWEEN)[1];
    // This branch names a power attack on its first 45 %.
    expect(chooseAITacticalAction(blocking, 0.2)).toBe('quick_attack');
    // …and it is a real downgrade, not a lost turn: the action is still a strike.
    expect(chooseAITacticalAction(blocking, 0.2)).not.toBe('rest');

    const lowHp = everyTacticalContext(BETWEEN)[2];
    // This branch names a power attack on its top 30 %.
    expect(chooseAITacticalAction(lowHp, 0.9)).toBe('quick_attack');

    const standard = everyTacticalContext(BETWEEN)[0];
    // aggression 0.95 / blockChance 0.7 puts 0.94 in the power slice.
    expect(chooseAITacticalAction(standard, 0.94)).toBe('quick_attack');
  });

  test('exactly the power cost: the heavy strike is restored, not downgraded', () => {
    expect(chooseAITacticalAction(everyTacticalContext(HEAVY)[1], 0.2)).toBe('power_attack');
    expect(chooseAITacticalAction(everyTacticalContext(HEAVY)[2], 0.9)).toBe('power_attack');
    expect(chooseAITacticalAction(everyTacticalContext(HEAVY)[0], 0.94)).toBe('power_attack');
  });

  test('the selected action’s cost is affordable at resolution — the round trip', () => {
    // Everything the selector hands back is payable in the same tick it is chosen.
    for (const { stamina } of BOUNDARIES) {
      for (const context of everyTacticalContext(stamina)) {
        for (const draw of DRAWS) {
          const action = chooseAITacticalAction(context, draw);
          if (action === 'quick_attack') {
            expect(stamina).toBeGreaterThanOrEqual(getStaminaCost(WEAPON, true));
          }
          if (action === 'power_attack') {
            expect(stamina).toBeGreaterThanOrEqual(getStaminaCost(WEAPON, false));
          }
        }
      }
    }
  });
});

// ── §D. The shipped weights, thresholds and draw counts ───────────────────

describe('§D — personality and probabilities are unchanged', () => {
  test('the player-guarding branch keeps its 45 / 30 / 25 thresholds', () => {
    const context = everyTacticalContext(HEAVY + 40)[1];
    expect(chooseAITacticalAction(context, 0.44)).toBe('power_attack');
    expect(chooseAITacticalAction(context, 0.45)).toBe('taunt');
    expect(chooseAITacticalAction(context, 0.74)).toBe('taunt');
    expect(chooseAITacticalAction(context, 0.75)).toBe('shield_block');
  });

  test('the low-stamina branch keeps its 60 / 40 thresholds', () => {
    const context = everyTacticalContext(LIGHT - 1)[0];
    expect(chooseAITacticalAction(context, 0.59)).toBe('shield_block');
    expect(chooseAITacticalAction(context, 0.6)).toBe('rest');
  });

  test('the low-HP branch keeps its 70 / 30 thresholds', () => {
    const context = everyTacticalContext(HEAVY + 40)[2];
    expect(chooseAITacticalAction(context, 0.69)).toBe('quick_attack');
    expect(chooseAITacticalAction(context, 0.70)).toBe('power_attack');
  });

  test('the standard branch is still exactly chooseAIStandardAction', () => {
    for (const aggression of [undefined, 0.2, 0.55, 0.95]) {
      for (const blockChance of [undefined, 0.1, 0.7]) {
        for (const draw of DRAWS) {
          const context = everyTacticalContext(HEAVY + 40)[0];
          expect(
            chooseAITacticalAction({ ...context, aggression, blockChance }, draw),
          ).toBe(chooseAIStandardAction(aggression, blockChance, draw));
        }
      }
    }
  });

  test('one random draw per branch — the AI’s stream cannot shift', () => {
    for (const context of everyTacticalContext(HEAVY + 40)) {
      let draws = 0;
      chooseAITacticalAction(context, () => {
        draws += 1;
        return 0.5;
      });
      expect(draws).toBe(1);
    }
  });

  test('a malformed stamina reading is treated as unable to strike, not as unlimited', () => {
    for (const stam of [Number.NaN, Number.POSITIVE_INFINITY]) {
      for (const draw of DRAWS) {
        const action = chooseAITacticalAction(
          { ...everyTacticalContext(100)[0], stamina: stam },
          draw,
        );
        expect(['quick_attack', 'power_attack']).not.toContain(action);
      }
    }
  });

  test('every shipped opponent can still be selected against without an impossible strike', () => {
    for (const opponent of ALL_OPPONENTS) {
      const weapon = opponent.loadout?.weapon ?? getWeaponByType(opponent.weaponType);
      const stam = getStaminaCost(weapon, true);
      const action = chooseAITacticalAction(
        {
          playerIsBlocking: true,
          playerHealth: 100,
          stamina: stam,
          weapon,
          aggression: opponent.aggression,
          blockChance: opponent.blockChance,
        },
        0.2,
      );
      expect(action).toBe('quick_attack');
    }
  });
});

// ── §E. Resolution: refused before anything is spent ──────────────────────

describe('§E — an unaffordable strike cannot resolve, and cannot lock the turn', () => {
  const guardStart = 'if (!isAttackInRange(gap, attackerNow.loadout.weapon)) {';
  const commitMarker = 'resolvingRef.current = true;';

  test('the affordability guard sits above the commit, inside the attack branch', () => {
    const guards = between(duelSource, guardStart, commitMarker);
    expect(guards).toContain(
      'if (!canAffordAttack(attackerNow.stamina, attackerNow.loadout.weapon, actionType)) {',
    );
    // Beside the range guard, which keeps its own precedence: an out-of-reach
    // strike is still reported as out of range.
    expect(at(guards, 'isAttackInRange(')).toBeLessThan(at(guards, 'canAffordAttack('));
  });

  test('the refusal spends nothing: no stamina write, no animation, no damage, no timer', () => {
    const guards = between(duelSource, guardStart, commitMarker);
    const refusal = guards.slice(at(guards, 'if (!canAffordAttack('));
    expect(refusal).toContain('addLog(');
    expect(refusal).toContain('return;');
    expect(refusal).not.toContain('getStaminaCost(');
    expect(refusal).not.toContain('setOpp(');
    expect(refusal).not.toContain('setPlayer(');
    expect(refusal).not.toContain('calculateHitChance(');
    expect(refusal).not.toContain('calculateAttackDamage(');
    expect(refusal).not.toContain('Math.random(');
    expect(refusal).not.toContain('resolutionTimerRef');
  });

  test('a refused opponent strike hands the turn back instead of latching the HUD', () => {
    const guards = between(duelSource, guardStart, commitMarker);
    const refusal = guards.slice(at(guards, 'if (!canAffordAttack('));
    expect(refusal).toContain('if (!isActorPlayer) {');
    expect(refusal).toContain('setIsExecuting(false);');
    expect(refusal).toContain('setIsPlayerTurn(true);');
  });

  test('the strike branch no longer has to clamp an unpaid bill', () => {
    // It still clamps (a paid strike can never go negative), but the guard above
    // means the clamp is no longer the thing hiding a free attack.
    const attackBranch = between(
      duelSource,
      "else if (actionType === 'quick_attack' || actionType === 'power_attack') {",
      'const resolveImpact = () => {',
    );
    expect(attackBranch).toContain('Math.max(0, prev.stamina - staminaCost)');
  });
});

// ── §F. The paths that bypass selection read the same rule ────────────────

describe('§F — the counter and the telegraph land are paid for like any strike', () => {
  const aiTurn = codeOnly(
    between(duelSource, 'const aiTimer = setTimeout(() => {', 'let chosenAction: CombatActionType'),
  );

  test('the AI effect selects through the production helper, and the light-cost stand-in is gone', () => {
    const selection = codeOnly(
      between(duelSource, 'let chosenAction: CombatActionType', '// Goliath heavy-attack telegraph'),
    );
    expect(selection).toContain('chosenAction = chooseAITacticalAction({');
    expect(selection).toContain('stamina: opp.stamina');
    expect(selection).not.toContain('oppLightCost');
    expect(selection).not.toContain('oppHeavyCost');
    // No local cost snapshot survives in the AI turn at all.
    expect(aiTurn).not.toContain('oppLightCost');
    expect(aiTurn).not.toContain('oppHeavyCost');
  });

  test('a queued counter is announced only when its quick attack is affordable', () => {
    const counter = aiTurn.slice(at(aiTurn, 'pendingCounterRef.current = false;'));
    expect(counter).toContain("canAffordAttack(opp.stamina, opp.loadout.weapon, 'quick_attack')");
    // Affordability is read BEFORE the announcement, so a blow she cannot pay
    // for is never telegraphed to the player.
    expect(at(counter, 'canAffordAttack(')).toBeLessThan(at(counter, "announceEnemyAttack('quick_attack')"));
    expect(counter).toContain("announceEnemyAttack('quick_attack');");
    // …and the unaffordable case falls through to the ordinary selection below
    // instead of stalling the turn (it logs and leaves the branch).
    expect(counter).toContain("addLog(`${opp.name} is too winded");
  });

  test('the boss only announces a heavy it could pay the landing for', () => {
    const code = codeOnly(duelSource);
    const predicate = "canAffordAttack(opp.stamina, opp.loadout.weapon, 'power_attack') &&";
    expect(code).toContain(predicate);
    // The predicate gates the telegraph CHOICE itself, so the boss cannot queue a
    // heavy whose landing it would be refused.
    expect(at(code, predicate)).toBeLessThan(at(code, "chosenAction = 'telegraph';"));
    expect(code).not.toContain('oppHeavyCost');
  });

  test('the fallback is a real, stamina-free branch the scene resolves', () => {
    // `rest` needs no stamina and cannot leave the fight waiting: the scene has
    // its own branch for it, and only strikes are ever announced.
    expect(duelSource).toContain("else if (actionType === 'rest') {");
    const restBranch = between(
      duelSource,
      "else if (actionType === 'rest') {",
      '// 2b. BOSS TELEGRAPH ACTION',
    );
    expect(restBranch).toContain('Math.min(prev.stats.staminaMax, prev.stamina + 40)');
    expect(restBranch).not.toContain('stamina - ');
  });

  test('the announcement API only ever carries the two strikes', () => {
    const code = codeOnly(duelSource);
    // The counter's literal call…
    expect(code).toContain("announceEnemyAttack('quick_attack');");
    // …and the ordinary one, which is gated on the two strike actions before it
    // is reached, so no other action of the tactical chain can be announced.
    expect(code).toContain("announceEnemyAttack(chosenAction);");
    expect(code).toContain(
      "if (chosenAction === 'quick_attack' || chosenAction === 'power_attack') {",
    );
  });
});
