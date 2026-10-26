/**
 * AI turn-action Dodge affordability — C-8.84B.
 *
 * The defect. `DODGE_STAMINA_COST` (12 SP) buys the Dodge STANCE, but the
 * opponent's in-range chain only ever compared stamina to the LIGHT attack's
 * cost. With `dual_blades` (light 9) an opponent at 9-11 SP reached the standard
 * `chooseAIStandardAction` pool and could draw `dodge`; with `spear` (light 11) it
 * could at 11 SP. Resolution then billed the opponent's Dodge with
 * `Math.max(0, prev.stamina - DODGE_STAMINA_COST)` — a CLAMP, which refuses
 * nothing — and the C-8.84A turn guard was narrowed to `isActorPlayer`. So an
 * opponent short of the cost was handed the stance, its evade chance and a dodge
 * it had not paid for.
 *
 * What this suite pins:
 *
 *   A  the roster edge the defect was reported against, measured, and replayed
 *      through the pre-fix rule as a control
 *   B  no stamina below 12 can select Dodge, in any branch, at any draw
 *   C  at exactly 12, and above it, Dodge is still there when otherwise eligible
 *   D  the fallback is a legal, free, existing action and mints nothing
 *   E  priorities, thresholds and selection are unchanged with enough stamina
 *   F  both boundaries — selection and resolution — are bound to the shipped code
 *   G  the player's C-8.84A turn-action contract is intact
 *   H  the reaction path and its free reaffirmation are untouched
 *
 * Registers, the same two the neighbouring combat suites use: the SHIPPED pure
 * helpers driven directly at every boundary (that is the production path — the AI
 * effect calls `chooseAITacticalAction` and nothing else reaches an AI turn-action
 * Dodge), and ordered source assertions for the wiring this repo cannot mount
 * (there is no DOM renderer for `<DuelScene/>`), anchored on CODE markers and read
 * on comment-stripped text so this phase's own prose cannot satisfy a check.
 *
 * Limitation, stated rather than papered over: this is NOT live-duel acceptance and
 * NOT Android acceptance. No 3D scene is mounted and no wall clock is exercised. It
 * proves the affordability contract, not how a refused Dodge feels in the arena.
 *
 * Run with: bun test src/utils/phaseC8_84B.test.ts
 */
// @ts-ignore - bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  DODGE_EVADE_CHANCE,
  DODGE_EVADE_PERCENT,
  DODGE_STAMINA_COST,
  applyDefensiveAction,
  canAffordDodge,
  clearDefensiveStance,
  getStaminaCost,
  planDodgeReaction,
} from './combatCalculations';
import {
  canAffordAttack,
  chooseAITacticalAction,
  enforceAffordableAIAction,
} from './aiActionSelection';
import type { AITacticalAction, AITacticalContext } from './aiActionSelection';
import { chooseAIStandardAction } from './combatCalculations';
import { ALL_WEAPONS, getWeaponByType } from '../data/itemsDB';
import { ALL_OPPONENTS } from '../data/opponents';
import type { WeaponItem } from '../types/game';

const DUEL_SOURCE = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);
const AI_SOURCE = readFileSync(new URL('./aiActionSelection.ts', import.meta.url), 'utf8');

/** Index of a marker that must exist, reported by name when it does not. */
function at(source: string, marker: string): number {
  const index = source.indexOf(marker);
  expect({ marker, found: index >= 0 }).toEqual({ marker, found: true });
  return index;
}

/** The slice between two markers, both required and in order. */
function between(source: string, start: string, end: string): string {
  const from = at(source, start);
  const to = source.indexOf(end, from);
  expect({ marker: end, found: to > from }).toEqual({ marker: end, found: true });
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

/** `//` comments stripped, so an ordering check reads code rather than prose. */
function stripComments(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

const ROSTER_WEAPONS = [
  'sword_shield',
  'spear',
  'dual_blades',
  'mace',
] as const;

interface RosterEdge {
  id: string;
  name: string;
  weapon: WeaponItem;
  light: number;
  heavy: number;
  aggression: number | undefined;
  blockChance: number | undefined;
}

/** Every roster opponent whose light strike is cheaper than a Dodge stance. */
const BAND: RosterEdge[] = ALL_OPPONENTS.map((opponent) => {
  const weapon = getWeaponByType(opponent.weaponType);
  return {
    id: opponent.id,
    name: opponent.name,
    weapon,
    light: getStaminaCost(weapon, true),
    heavy: getStaminaCost(weapon, false),
    aggression: opponent.aggression,
    blockChance: opponent.blockChance,
  };
}).filter((entry) => entry.light < DODGE_STAMINA_COST);

/**
 * The first draw that selects Dodge for this opponent's own weights, so the
 * standard-pool branch can be exercised at its Dodge outcome deliberately rather
 * than by a lucky literal.
 */
function dodgeDraw(aggression: number | undefined, blockChance: number | undefined): number {
  for (let step = 0; step < 1000; step += 1) {
    const r = step / 1000;
    if (chooseAIStandardAction(aggression, blockChance, r) === 'dodge') return r;
  }
  throw new Error('no draw selects Dodge for this configuration');
}

/**
 * THE CONTROL — the shipped rules as they stood before C-8.84B. Strikes were
 * enforced (C-8.75E); every non-strike action, Dodge included, was passed through
 * untouched, which is exactly the hole this phase closes.
 */
function preFixEnforce(action: AITacticalAction, stamina: number, weapon: WeaponItem): AITacticalAction {
  if (action !== 'quick_attack' && action !== 'power_attack') return action;
  if (canAffordAttack(stamina, weapon, action)) return action;
  if (action === 'power_attack' && canAffordAttack(stamina, weapon, 'quick_attack')) {
    return 'quick_attack';
  }
  return 'rest';
}

/** The pre-fix chain, same branches and same single draw per branch. */
function preFixChain(context: AITacticalContext, r: number): AITacticalAction {
  const lightCost = getStaminaCost(context.weapon, true);
  let chosen: AITacticalAction;
  if (context.playerIsBlocking) {
    chosen = r < 0.45 ? 'power_attack' : r < 0.75 ? 'taunt' : 'shield_block';
  } else if (context.stamina < lightCost) {
    chosen = r < 0.6 ? 'shield_block' : 'rest';
  } else if (context.playerHealth < 25) {
    chosen = r < 0.7 ? 'quick_attack' : 'power_attack';
  } else {
    chosen = chooseAIStandardAction(context.aggression, context.blockChance, r);
  }
  return preFixEnforce(chosen, context.stamina, context.weapon);
}

/** A draw grid dense enough to cover every branch boundary of the chain. */
const DRAWS: number[] = Array.from({ length: 201 }, (_, i) => i / 200);

// -- A. the reported defect ---------------------------------------------------

describe('A - the roster edge the defect was reported against', () => {
  test('the band is real: some opponents strike for less than a Dodge costs', () => {
    expect(BAND.length).toBeGreaterThan(0);
    expect(DODGE_STAMINA_COST).toBe(12);
  });

  test('dual_blades cost 9 SP and reach the standard pool from 9 SP', () => {
    const blades = getWeaponByType('dual_blades');
    expect(getStaminaCost(blades, true)).toBe(9);
    expect(getStaminaCost(blades, true)).toBeLessThan(DODGE_STAMINA_COST);
  });

  test('spear costs 11 SP and reaches the standard pool from 11 SP', () => {
    const spear = getWeaponByType('spear');
    expect(getStaminaCost(spear, true)).toBe(11);
    expect(getStaminaCost(spear, true)).toBeLessThan(DODGE_STAMINA_COST);
  });

  test('the four named opponents are in that band, by their own resolved weapon', () => {
    const ids = ['opp_flaccus', 'opp_ignis_boss', 'opp_hoplite', 'opp_valeria_boss'];
    for (const id of ids) {
      const entry = BAND.find((candidate) => candidate.id === id);
      expect({ id, present: entry !== undefined }).toEqual({ id, present: true });
    }
    expect(BAND.find((entry) => entry.id === 'opp_flaccus')!.light).toBe(9);
    expect(BAND.find((entry) => entry.id === 'opp_ignis_boss')!.light).toBe(9);
    expect(BAND.find((entry) => entry.id === 'opp_hoplite')!.light).toBe(11);
    expect(BAND.find((entry) => entry.id === 'opp_valeria_boss')!.light).toBe(11);
  });

  test('CONTROL: the pre-fix rule selected Dodge across that whole band', () => {
    for (const entry of BAND) {
      const r = dodgeDraw(entry.aggression, entry.blockChance);
      for (let stamina = entry.light; stamina < DODGE_STAMINA_COST; stamina += 1) {
        const context: AITacticalContext = {
          playerIsBlocking: false,
          playerHealth: 100,
          stamina,
          weapon: entry.weapon,
          aggression: entry.aggression,
          blockChance: entry.blockChance,
        };
        // The old chain hands out a stance the opponent cannot pay for...
        expect({ id: entry.id, stamina, action: preFixChain(context, r) }).toEqual({
          id: entry.id,
          stamina,
          action: 'dodge',
        });
        // ...and the shipped one does not.
        expect({ id: entry.id, stamina, action: chooseAITacticalAction(context, r) }).not.toEqual({
          id: entry.id,
          stamina,
          action: 'dodge',
        });
      }
    }
  });
});

// -- B. no Dodge below the cost ----------------------------------------------

describe('B - no AI turn-action Dodge below DODGE_STAMINA_COST', () => {
  test('0 SP: no branch and no draw can select Dodge', () => {
    for (const type of ROSTER_WEAPONS) {
      const weapon = getWeaponByType(type);
      for (const playerIsBlocking of [false, true]) {
        for (const playerHealth of [100, 10]) {
          for (const r of DRAWS) {
            const action = chooseAITacticalAction(
              { playerIsBlocking, playerHealth, stamina: 0, weapon, aggression: 0.6, blockChance: 0.2 },
              r,
            );
            expect(action).not.toBe('dodge');
          }
        }
      }
    }
  });

  test('1-11 SP: no branch and no draw can select Dodge', () => {
    for (const type of ROSTER_WEAPONS) {
      const weapon = getWeaponByType(type);
      for (let stamina = 1; stamina < DODGE_STAMINA_COST; stamina += 1) {
        for (const playerIsBlocking of [false, true]) {
          for (const playerHealth of [100, 10]) {
            for (const r of DRAWS) {
              const action = chooseAITacticalAction(
                { playerIsBlocking, playerHealth, stamina, weapon, aggression: 0.6, blockChance: 0.2 },
                r,
              );
              expect(action).not.toBe('dodge');
            }
          }
        }
      }
    }
  });

  test('the roster boundary cases specifically: 9, 10 and 11 SP under dual_blades', () => {
    const blades = getWeaponByType('dual_blades');
    const r = dodgeDraw(0.6, 0.2); // Flaccus' own weights
    for (const stamina of [9, 10, 11]) {
      expect({
        stamina,
        action: chooseAITacticalAction(
          { playerIsBlocking: false, playerHealth: 100, stamina, weapon: blades, aggression: 0.6, blockChance: 0.2 },
          r,
        ),
      }).toEqual({ stamina, action: 'shield_block' });
    }
  });

  test('the roster boundary case under spear: 11 SP', () => {
    const spear = getWeaponByType('spear');
    const r = dodgeDraw(0.45, 0.65); // Cassius' own weights
    expect(
      chooseAITacticalAction(
        { playerIsBlocking: false, playerHealth: 100, stamina: 11, weapon: spear, aggression: 0.45, blockChance: 0.65 },
        r,
      ),
    ).toBe('shield_block');
  });

  test('every weapon in the catalogue refuses Dodge at every stamina it cannot pay', () => {
    for (const weapon of ALL_WEAPONS) {
      for (let stamina = 0; stamina < DODGE_STAMINA_COST; stamina += 1) {
        expect(enforceAffordableAIAction('dodge', stamina, weapon)).toBe('shield_block');
      }
    }
  });

  test('a corrupt stamina balance affords no Dodge', () => {
    const weapon = getWeaponByType('dual_blades');
    for (const stamina of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(canAffordDodge(stamina)).toBe(false);
      expect(enforceAffordableAIAction('dodge', stamina, weapon)).toBe('shield_block');
      for (const playerIsBlocking of [false, true]) {
        expect(
          chooseAITacticalAction(
            { playerIsBlocking, playerHealth: 100, stamina, weapon, aggression: 0.6, blockChance: 0.2 },
            0.999,
          ),
        ).not.toBe('dodge');
      }
    }
  });
});

// -- C. still available when it is affordable ---------------------------------

describe('C - Dodge is still available when the opponent can pay for it', () => {
  test('at the cost: the standard pool keeps its Dodge outcome', () => {
    // `max(light, DODGE_STAMINA_COST)` — a mace's light strike costs more than a
    // Dodge, and below its own light cost the chain never reaches the standard pool.
    for (const type of ROSTER_WEAPONS) {
      const weapon = getWeaponByType(type);
      const r = dodgeDraw(0.6, 0.2);
      const stamina = Math.max(getStaminaCost(weapon, true), DODGE_STAMINA_COST);
      expect({
        type,
        stamina,
        action: chooseAITacticalAction(
          { playerIsBlocking: false, playerHealth: 100, stamina, weapon, aggression: 0.6, blockChance: 0.2 },
          r,
        ),
      }).toEqual({ type, stamina, action: 'dodge' });
    }
  });

  test('above 12 SP: still a Dodge, and exactly the cost is charged later', () => {
    for (const type of ROSTER_WEAPONS) {
      const weapon = getWeaponByType(type);
      const r = dodgeDraw(0.6, 0.2);
      const floor = Math.max(getStaminaCost(weapon, true), DODGE_STAMINA_COST);
      for (const stamina of [floor, floor + 1, 40, 100]) {
        expect({
          type,
          stamina,
          action: chooseAITacticalAction(
            { playerIsBlocking: false, playerHealth: 100, stamina, weapon, aggression: 0.6, blockChance: 0.2 },
            r,
          ),
        }).toEqual({ type, stamina, action: 'dodge' });
      }
      expect(enforceAffordableAIAction('dodge', DODGE_STAMINA_COST, weapon)).toBe('dodge');
      expect(enforceAffordableAIAction('dodge', 100, weapon)).toBe('dodge');
    }
  });

  test('the Dodge outcome survives the whole pool at and above the cost', () => {
    const weapon = getWeaponByType('dual_blades');
    for (let stamina = DODGE_STAMINA_COST; stamina <= DODGE_STAMINA_COST + 3; stamina += 1) {
      const seen = new Set<AITacticalAction>();
      for (const r of DRAWS) {
        seen.add(
          chooseAITacticalAction(
            { playerIsBlocking: false, playerHealth: 100, stamina, weapon, aggression: 0.6, blockChance: 0.2 },
            r,
          ),
        );
      }
      expect({ stamina, hasDodge: seen.has('dodge') }).toEqual({ stamina, hasDodge: true });
    }
  });
});

// -- D. the fallback is legal and inert --------------------------------------

describe('D - the insufficient-stamina fallback is legal, free and mints nothing', () => {
  const weapon = getWeaponByType('dual_blades');

  test('the unaffordable Dodge becomes the free guard, never `rest`', () => {
    for (let stamina = 0; stamina < DODGE_STAMINA_COST; stamina += 1) {
      expect({ stamina, action: enforceAffordableAIAction('dodge', stamina, weapon) }).toEqual({
        stamina,
        action: 'shield_block',
      });
    }
  });

  test('the guard is already an outcome of the shipped chain at 0 SP', () => {
    let guards = 0;
    for (const r of DRAWS) {
      if (
        chooseAITacticalAction(
          { playerIsBlocking: false, playerHealth: 100, stamina: 0, weapon, aggression: 0.6, blockChance: 0.2 },
          r,
        ) === 'shield_block'
      ) {
        guards += 1;
      }
    }
    // Branch 2 picks it on 60 % of draws — the fallback adds no new kind of turn.
    expect(guards).toBeGreaterThan(0);
  });

  test('the shipped Shield Guard branch bills no stamina and grants none', () => {
    const guardBranch = stripComments(
      between(
        DUEL_SOURCE,
        "else if (actionType === 'shield_block') {",
        "} else if (actionType === 'dodge') {",
      ),
    );
    expect(guardBranch).not.toContain('stamina');
    expect(guardBranch).not.toContain('+ 40');
    expect(guardBranch).toContain('isBlocking: true');
  });

  test('the fallback resolves as the opponent’s own turn, not as a lost turn', () => {
    // A strike is announced (and resolves later); every other action — the guard
    // included — reaches the resolution immediately, so the fallback spends the
    // turn instead of stalling it.
    const announce = stripComments(
      between(DUEL_SOURCE, "if (chosenAction === 'quick_attack'", 'executeCombatTurn'),
    );
    expect(announce).not.toContain('shield_block');
    expect(at(DUEL_SOURCE, "executeCombatTurn('opponent', chosenAction);")).toBeGreaterThan(
      at(DUEL_SOURCE, 'chosenAction = chooseAITacticalAction({'),
    );
  });

  test('a refused Dodge that reaches resolution hands the turn back', () => {
    const guard = between(
      DUEL_SOURCE,
      'if (actionType === \'dodge\' && !canAffordDodge(attackerNow.stamina)) {',
      'resolvingRef.current = true;',
    );
    expect(guard).toContain('if (!isActorPlayer) {');
    expect(guard).toContain('setIsPlayerTurn(true)');
    expect(guard).toContain('setIsExecuting(false)');
  });
});

// -- E. priorities unchanged when stamina is sufficient -----------------------

describe('E - priorities, thresholds and selection are unchanged with enough stamina', () => {
  test('the shipped chain equals the pre-fix chain wherever its Dodge is affordable', () => {
    for (const weapon of ALL_WEAPONS) {
      const heavy = getStaminaCost(weapon, false);
      const stamina = Math.max(heavy, DODGE_STAMINA_COST) + 10;
      for (const playerIsBlocking of [false, true]) {
        for (const playerHealth of [100, 10]) {
          for (const [aggression, blockChance] of [
            [undefined, undefined],
            [0.6, 0.2],
            [0.45, 0.65],
            [0, 1],
          ] as Array<[number | undefined, number | undefined]>) {
            const context: AITacticalContext = {
              playerIsBlocking,
              playerHealth,
              stamina,
              weapon,
              aggression,
              blockChance,
            };
            for (const r of DRAWS) {
              expect({
                id: weapon.id,
                playerIsBlocking,
                playerHealth,
                aggression,
                blockChance,
                r,
                action: chooseAITacticalAction(context, r),
              }).toEqual({
                id: weapon.id,
                playerIsBlocking,
                playerHealth,
                aggression,
                blockChance,
                r,
                action: preFixChain(context, r),
              });
            }
          }
        }
      }
    }
  });

  test('the shipped standard-pool thresholds are the ones that were already there', () => {
    expect(chooseAIStandardAction(undefined, undefined, 0.30)).toBe('quick_attack');
    expect(chooseAIStandardAction(undefined, undefined, 0.50)).toBe('power_attack');
    expect(chooseAIStandardAction(undefined, undefined, 0.80)).toBe('shield_block');
    expect(chooseAIStandardAction(undefined, undefined, 0.95)).toBe('dodge');
  });

  test('enforcement is idempotent and draws no randomness', () => {
    for (const weapon of ALL_WEAPONS) {
      for (const stamina of [0, 9, 11, DODGE_STAMINA_COST, 40]) {
        const once = enforceAffordableAIAction('dodge', stamina, weapon);
        expect(enforceAffordableAIAction(once, stamina, weapon)).toBe(once);
        if (once === 'dodge') expect(canAffordDodge(stamina)).toBe(true);
      }
    }
  });
});

// -- F. both boundaries, bound to the shipped code ----------------------------

describe('F - selection and resolution both carry the rule', () => {
  test('the resolution guard is not narrowed to the player', () => {
    const index = at(DUEL_SOURCE, 'canAffordDodge(attackerNow.stamina)');
    const lineStart = DUEL_SOURCE.lastIndexOf('\n', index);
    const line = DUEL_SOURCE.slice(lineStart, DUEL_SOURCE.indexOf('\n', index));
    expect(line).toContain("actionType === 'dodge'");
    expect(line).not.toContain('isActorPlayer');
  });

  test('it runs before the commit, the stance pre-clear and the dodge counter', () => {
    const code = stripComments(
      between(DUEL_SOURCE, 'const executeCombatTurn = useCallback(', 'const reactToPendingAttack'),
    );
    const guard = code.indexOf('canAffordDodge(attackerNow.stamina)');
    expect(guard).toBeGreaterThan(-1);
    expect(code.indexOf('resolvingRef.current = true')).toBeGreaterThan(guard);
    expect(code.indexOf('prev.isInvulnerable || prev.isBlocking')).toBeGreaterThan(guard);
    expect(code.indexOf('statsRef.current.dodgesPerformed += 1')).toBeGreaterThan(guard);
  });

  test('the AI’s own selection reads the shared predicate', () => {
    expect(AI_SOURCE).toContain('canAffordDodge');
    expect(AI_SOURCE).toContain("if (action === 'dodge') return canAffordDodge(stamina) ? 'dodge' : 'shield_block';");
    // The AI chain routes every branch through the enforcement.
    expect(AI_SOURCE).toContain('return enforceAffordableAIAction(chosen, context.stamina, context.weapon);');
  });

  test('the production AI handler invokes the tested selector, and no other Dodge entry exists', () => {
    expect(at(DUEL_SOURCE, 'chosenAction = chooseAITacticalAction({')).toBeGreaterThan(-1);
    expect(DUEL_SOURCE).not.toContain("executeCombatTurn('opponent', 'dodge')");
    const calls = DUEL_SOURCE.split("executeCombatTurn('opponent'").length - 1;
    expect(calls).toBe(3); // telegraph landing, counter strike, the selected action
  });
});

// -- G. the player's C-8.84A contract is intact -------------------------------

describe('G - the player turn-action contract (C-8.84A) is unchanged', () => {
  test('the threshold is still 0-11 refused, 12 and above accepted', () => {
    for (let stamina = 0; stamina < DODGE_STAMINA_COST; stamina += 1) {
      expect(canAffordDodge(stamina)).toBe(false);
    }
    expect(canAffordDodge(DODGE_STAMINA_COST)).toBe(true);
    expect(canAffordDodge(DODGE_STAMINA_COST + 1)).toBe(true);
    expect(canAffordDodge(100)).toBe(true);
    expect(canAffordDodge(Number.NaN)).toBe(false);
    expect(canAffordDodge(Number.POSITIVE_INFINITY)).toBe(false);
  });

  test('a paid player Dodge still charges exactly 12 once and holds the stance', () => {
    let stamina = 50;
    let stance = applyDefensiveAction(clearDefensiveStance({ isBlocking: false, isInvulnerable: false }), 'dodge');
    let dodges = 0;
    expect(canAffordDodge(stamina)).toBe(true);
    stamina = Math.max(0, stamina - DODGE_STAMINA_COST);
    dodges += 1;
    expect(stamina).toBe(38);
    expect(stance.isInvulnerable).toBe(true);
    expect(dodges).toBe(1);
  });

  test('a player Dodge at 11 SP is still refused, and leaves a held stance standing', () => {
    const held = { isBlocking: false, isInvulnerable: true };
    expect(canAffordDodge(11)).toBe(false);
    // The guard returns before the pre-clear, so the paid-for stance survives.
    expect(held).toEqual({ isBlocking: false, isInvulnerable: true });
  });
});

// -- H. the reaction path is untouched ---------------------------------------

describe('H - the reaction Dodge and its free reaffirmation are untouched', () => {
  const OPEN = { isInvulnerable: false };
  const HELD = { isInvulnerable: true };

  test('a new reaction Dodge still costs 12 and counts one dodge', () => {
    expect(planDodgeReaction(OPEN, DODGE_STAMINA_COST)).toEqual({
      kind: 'activate',
      staminaCost: DODGE_STAMINA_COST,
      countsDodge: true,
    });
  });

  test('a new reaction Dodge below 12 is still refused', () => {
    for (let stamina = 0; stamina < DODGE_STAMINA_COST; stamina += 1) {
      expect(planDodgeReaction(OPEN, stamina)).toEqual({
        kind: 'refused',
        staminaCost: 0,
        countsDodge: false,
      });
    }
  });

  test('reaffirming a held stance is still free, at any stamina', () => {
    for (const stamina of [0, 5, 11, DODGE_STAMINA_COST, 100]) {
      expect({ stamina, plan: planDodgeReaction(HELD, stamina) }).toEqual({
        stamina,
        plan: { kind: 'reaffirm', staminaCost: 0, countsDodge: false },
      });
    }
  });

  test('the reaction body still settles its charge through the reaction planner', () => {
    const reaction = stripComments(
      between(
        DUEL_SOURCE,
        'const reactToPendingAttack = useCallback(',
        // C-8.84F — the handler now also depends on the player's weapon (its
        // copy follows the loadout); the slice's end anchor follows it.
        '[player.stamina, player.name, player.position, player.loadout.weapon, addLog, spawnDamageText],',
      ),
    );
    expect(reaction).toContain('planDodgeReaction');
    expect(reaction).not.toContain('canAffordDodge');
  });

  test('the dodge rate and cost are the shipped ones', () => {
    expect(DODGE_EVADE_CHANCE).toBe(0.88);
    expect(DODGE_EVADE_PERCENT).toBe(88);
    expect(DODGE_STAMINA_COST).toBe(12);
  });
});
