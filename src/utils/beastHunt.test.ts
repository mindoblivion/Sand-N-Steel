/**
 * ===========================================================================
 * D-2 — BEAST HUNT: the honesty suite
 * ===========================================================================
 * One section per claim the slice makes:
 *
 *   §A the data — Ferrum's published numbers live on Marcellin's row, are
 *      AUTHORED (Part A carries none), and print from the row, not a component;
 *   §B the fence — a beast exists only for a boss FEATURE bout carrying the
 *      mechanic, so a regular opponent with a copied string fields none;
 *   §C the cadence — a crouch on every third boss action slot, the pounce on the
 *      slot after a live crouch, and a spent pounce back to prowling;
 *   §D interruption and flight — a landed strike cancels the pounce, one wound at
 *      a time, and the third drives the beast off;
 *   §E the net — two skipped cadences, and the Secutor ruling;
 *   §F the pounce's numbers — the pipeline's own formulas, at the standard block
 *      and dodge values, with the beast's row substituted for a fighter's;
 *   §G Blood-Scent — the palma's +20 % on the master's next attack only;
 *   §H master alone — exactly the row's shift, clamped;
 *   §I the surfaces — pips, the target control (48dp, defaults to the master),
 *      the telegraph, and the in-memory epilogue;
 *   §J scope — no save, no new formula, no new pipeline stage, no new draw call.
 *
 * Run with: `bun test src/utils/beastHunt.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { DuelStatistics, FighterState, OpponentConfig } from '../types/game';
import { ALL_OPPONENTS } from '../data/opponents';
import { ENTANGLE_TURNS_ON_LAND, resolveNetCast } from './statefulDoctrinae';
import { buildOpponentModifiers, damageDealtMultiplier } from './combatModifiers';
import { calculateAttackDamage, calculateHitChance } from './combatCalculations';
import { BOSS_PRESENTATION_DELTAS, bossSceneDeltas } from '../data/bossPresentationStates';
import {
  BEAST_CROUCH_TELEGRAPH,
  BEAST_FLIGHT_WORDS,
  BLOOD_SCENT_DAMAGE_MULT,
  beastConfigFor,
  beastCrouches,
  beastEpilogueLine,
  beastFleesWithMaster,
  beastIntelLine,
  beastNetted,
  beastPounces,
  beastSkipsCadence,
  beastWounded,
  createBeastState,
  isBeastHuntBout,
  masterAloneAggression,
  openBossSlot,
  planBeastSlot,
  type BeastDuelState,
} from './beastHunt';
import { TurnActionPanel } from '../components/ui/TurnActionPanel';
import { CombatHUD } from '../components/ui/CombatHUD';
import { DuelResultModal } from '../components/hub/DuelResultModal';

const HERE = dirname(fileURLToPath(import.meta.url));
const repoPath = (relative: string) => normalize(join(HERE, '..', '..', relative));
const readSource = (relative: string): string => readFileSync(repoPath(relative), 'utf8');
/** Comments stripped: prose can neither satisfy nor defeat a check. */
const code = (relative: string): string =>
  readSource(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const DUEL_SCENE = code('src/components/duel/DuelScene.tsx');
const MODULE = code('src/utils/beastHunt.ts');

const marcellin = (): OpponentConfig => {
  const found = ALL_OPPONENTS.find((opponent) => opponent.id === 'opp_marcellin_boss');
  if (!found) throw new Error('roster has no Marcellin');
  return found;
};
const BEAST = () => {
  const beast = marcellin().beast;
  if (!beast) throw new Error('Marcellin carries no beast data');
  return beast;
};

/** Run `n` boss slots from a fresh state, returning each slot's plan. */
function cadence(state: BeastDuelState, slots: number) {
  const plans: string[] = [];
  let current = state;
  for (let i = 0; i < slots; i += 1) {
    const opened = openBossSlot(current);
    const plan = planBeastSlot(opened, BEAST());
    plans.push(plan);
    if (plan === 'crouch') current = beastCrouches(opened);
    else if (plan === 'pounce') current = beastPounces(opened);
    else if (plan === 'skip') current = beastSkipsCadence(opened);
    else current = opened;
  }
  return { plans, state: current };
}

// ════════════════════════════════════════════════════════════════════════════
// §A — the published numbers (AUTHORED, anchored)
// ════════════════════════════════════════════════════════════════════════════
describe('D-2 §A — Ferrum is DATA on Marcellin’s row', () => {
  test('the row carries the beast block, and only that row does', () => {
    expect(marcellin().beast).toBeDefined();
    for (const opponent of ALL_OPPONENTS) {
      if (opponent.id === 'opp_marcellin_boss') continue;
      expect(opponent.beast, opponent.id).toBeUndefined();
    }
  });

  test('every number is the authored one, anchored to the Tier-2 band', () => {
    const beast = BEAST();
    expect(beast.name).toBe('Ferrum');
    expect(beast.hitProfile).toBe('quick');
    // AGI 18 = one above the tier's fastest man (Ignis, 17).
    expect(beast.agility).toBe(18);
    expect(beast.agility).toBeGreaterThan(marcellin().stats.agility);
    // STR 12 = below the tier's lowest rung (Cassius, 13).
    expect(beast.strength).toBe(12);
    expect(beast.strength).toBeLessThan(marcellin().stats.strength);
    // 24 = the top of the tier's light-damage band (the Legion Spear's 24).
    expect(beast.pounceDamage).toBe(24);
    // The card line's own words.
    expect(beast.crouchEveryNthAction).toBe(3);
    expect(beast.maxWounds).toBe(3);
    expect(marcellin().cardLine).toContain('Every third exchange');
    expect(marcellin().cardLine).toContain('Three wounds');
    // The master-alone shift, and the flight's hype (the taunt's own +20).
    expect(beast.masterAloneAggressionBonus).toBe(0.1);
    expect(beast.flightHype).toBe(20);
  });

  test('the Tavern line prints the row, and no figure is restated in a component', () => {
    const line = beastIntelLine(BEAST());
    for (const token of ['Ferrum', 'quick', '18', '12', '24', '3rd', '3 wounds']) {
      expect(line, token).toContain(token);
    }
    const tab = code('src/components/hub/TournamentTab.tsx');
    expect(tab).toContain('beastIntelLine(');
    // No number of the beast's is typed into a component.
    for (const figure of ['pounceDamage', 'agility: 18', '24 base']) {
      expect(tab, figure).not.toContain(figure);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §B — the fence
// ════════════════════════════════════════════════════════════════════════════
describe('D-2 §B — the fence: only a boss feature bout fields a beast', () => {
  const beast = {
    name: 'Ferrum',
    hitProfile: 'quick' as const,
    agility: 18,
    strength: 12,
    pounceDamage: 24,
    crouchEveryNthAction: 3,
    maxWounds: 3,
    masterAloneAggressionBonus: 0.1,
    flightHype: 20,
  };

  test('the real row passes', () => {
    expect(beastConfigFor(marcellin())).not.toBeNull();
    expect(isBeastHuntBout(marcellin())).toBe(true);
  });

  test('a REGULAR opponent with a copied mechanic string fields NO beast', () => {
    const impostor = {
      ...ALL_OPPONENTS[0],
      bossMechanic: 'beast_hunt',
      beast,
    } as unknown as OpponentConfig;
    expect(impostor.isBoss).not.toBe(true);
    expect(beastConfigFor(impostor)).toBeNull();
    expect(isBeastHuntBout(impostor)).toBe(false);
  });

  test('each clause of the fence is load-bearing', () => {
    const base = marcellin();
    // boss, but not a feature bout
    expect(beastConfigFor({ ...base, featureBout: undefined })).toBeNull();
    // feature bout, but not a boss
    expect(beastConfigFor({ ...base, isBoss: false })).toBeNull();
    // boss + feature bout, but another mechanic
    expect(beastConfigFor({ ...base, bossMechanic: 'false_telegraph' })).toBeNull();
    // boss + feature bout + the mechanic, but no sub-data
    expect(beastConfigFor({ ...base, beast: undefined })).toBeNull();
    // …and each malformed field is refused rather than half-used
    for (const broken of [
      { ...beast, pounceDamage: 0 },
      { ...beast, maxWounds: 0 },
      { ...beast, crouchEveryNthAction: 0 },
      { ...beast, agility: Number.NaN },
      { ...beast, hitProfile: 'savage' as unknown as 'quick' },
      { ...beast, name: '   ' },
    ]) {
      expect(beastConfigFor({ ...base, beast: broken }), JSON.stringify(broken)).toBeNull();
    }
    expect(beastConfigFor(null)).toBeNull();
    expect(beastConfigFor(undefined)).toBeNull();
  });

  test('the duel reaches the beast through the module, never by naming the mechanic', () => {
    // The mechanic token lives in the module and the data — not in the scene, so
    // the scene cannot decide "is this a beast bout" on its own.
    expect(MODULE).toContain("'beast_hunt'");
    expect(DUEL_SCENE).not.toContain("'beast_hunt'");
    expect(DUEL_SCENE).toContain('beastConfigFor(opponent)');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §C — the cadence
// ════════════════════════════════════════════════════════════════════════════
describe('D-2 §C — one crouch every third boss action', () => {
  test('a fresh beast prowls, unwounded, with no cadence spent', () => {
    expect(createBeastState()).toEqual({ wounds: 0, slots: 0, pose: 'prowl', netSkip: 0 });
  });

  test('the crouch falls on slots 3, 6, 9 and 12 — and nowhere else', () => {
    const { plans } = cadence(createBeastState(), 12);
    expect(plans).toEqual([
      'none',
      'none',
      'crouch',
      'pounce',
      'none',
      'crouch',
      'pounce',
      'none',
      'crouch',
      'pounce',
      'none',
      'crouch',
    ]);
  });

  test('the pounce is the slot AFTER a live crouch, never the crouch itself', () => {
    const opened = openBossSlot(openBossSlot(openBossSlot(createBeastState())));
    expect(opened.slots).toBe(3);
    expect(planBeastSlot(opened, BEAST())).toBe('crouch');
    const crouching = beastCrouches(opened);
    expect(planBeastSlot(crouching, BEAST())).toBe('pounce');
    // …and the spring is the very next slot, which is what gives the player
    // exactly one action against the crouch.
    expect(openBossSlot(crouching).slots).toBe(4);
  });

  test('a spent pounce returns to prowling as the next slot opens', () => {
    const pounced = beastPounces({ ...createBeastState(), slots: 4 });
    expect(pounced.pose).toBe('pounce-resolved');
    const next = openBossSlot(pounced);
    expect(next.pose).toBe('prowl');
    expect(planBeastSlot(next, BEAST())).toBe('none');
  });

  test('the crouch is READABLE a full action ahead: the telegraph is set, the spring waits', () => {
    const crouchBranch = DUEL_SCENE.slice(
      DUEL_SCENE.indexOf("actionType === 'beast_crouch'"),
      DUEL_SCENE.indexOf('else if (isBeastStrike && beastCfg)'),
    );
    expect(crouchBranch).toContain('telegraphText: BEAST_CROUCH_TELEGRAPH');
    expect(crouchBranch).not.toContain('pounce');
    expect(BEAST_CROUCH_TELEGRAPH).toContain('CROUCHES');
    // The pounce only ever fires from the 'pounce' plan, i.e. a live crouch.
    const ai = DUEL_SCENE.slice(DUEL_SCENE.indexOf("if (plan === 'pounce')"));
    expect(ai.indexOf("if (plan === 'pounce')")).toBe(0);
    expect(ai).toContain('beastPounceRef.current = true;');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §D — interruption and flight
// ════════════════════════════════════════════════════════════════════════════
describe('D-2 §D — a strike at the crouch, and the flight at three', () => {
  const crouching = () => beastCrouches({ ...createBeastState(), slots: 3 });

  test('a wound cancels the pounce and counts once', () => {
    const struck = beastWounded(crouching(), BEAST());
    expect(struck.pose).toBe('prowl');
    expect(struck.wounds).toBe(1);
    // The cancelled crouch cannot pounce: the pose is no longer 'crouch'.
    expect(planBeastSlot(openBossSlot(struck), BEAST())).not.toBe('pounce');
  });

  test('the third wound drives the beast off, and it never takes a fourth', () => {
    let state = crouching();
    state = beastWounded(state, BEAST());
    state = beastWounded(beastCrouches(state), BEAST());
    expect(state.wounds).toBe(2);
    expect(state.pose).toBe('prowl');
    state = beastWounded(beastCrouches(state), BEAST());
    expect(state.wounds).toBe(3);
    expect(state.pose).toBe('fled');
    expect(beastWounded(state, BEAST()).wounds).toBe(3);
  });

  test('a fled beast takes no further slot plan — and never crouches again', () => {
    const fled = beastWounded(beastCrouches(beastWounded(beastCrouches(beastWounded(crouching(), BEAST())), BEAST())), BEAST());
    expect(fled.pose).toBe('fled');
    for (let i = 0; i < 9; i += 1) {
      expect(planBeastSlot(openBossSlot({ ...fled, slots: i }), BEAST())).toBe('none');
    }
  });

  test('the flight is a hype event through the existing plumbing', () => {
    const branch = DUEL_SCENE.slice(
      DUEL_SCENE.indexOf('if (struck.pose === \'fled\')'),
      DUEL_SCENE.indexOf('} else {', DUEL_SCENE.indexOf('if (struck.pose === \'fled\')')),
    );
    expect(branch).toContain('updateCrowdHype((prev) => Math.min(100, prev + beastCfg.flightHype));');
    expect(branch).toContain('sounds.playCrowdSwell();');
    expect(BEAST().flightHype).toBe(20);
  });

  test('the strike is aimed through the same hit formula a fighter’s is', () => {
    const branch = DUEL_SCENE.slice(
      DUEL_SCENE.indexOf('else if (isBeastStrike && beastCfg)'),
      DUEL_SCENE.indexOf('else if (actionType === \'quick_attack\' || actionType === \'power_attack\')'),
    );
    expect(branch).toContain('entangledHitChance(');
    expect(branch).toContain('calculateHitChance(');
    expect(branch).toContain('beastCfg.agility');
    expect(branch).toContain('beastWounded(');
    // No damage is dealt to the beast: wounds are not HP.
    expect(branch).not.toContain('calculateAttackDamage');
    expect(branch).not.toContain('health');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §E — the net
// ════════════════════════════════════════════════════════════════════════════
describe('D-2 §E — the net at the beast', () => {
  test('a landed net cancels the crouch and buys exactly two cadences', () => {
    const netted = beastNetted(beastCrouches({ ...createBeastState(), slots: 3 }));
    expect(netted.pose).toBe('prowl');
    expect(netted.netSkip).toBe(ENTANGLE_TURNS_ON_LAND);
    expect(netted.netSkip).toBe(2);

    // Slot 4 is an ordinary slot; slots 6 and 9 are the two cadences it loses.
    // Slots 4 … 12: the skips fall on the two cadence slots (6 and 9), and the
    // next cadence (12) crouches again.
    const { plans, state } = cadence(netted, 9);
    expect(plans).toEqual(['none', 'none', 'skip', 'none', 'none', 'skip', 'none', 'none', 'crouch']);
    expect(state.netSkip).toBe(0);
    expect(plans.filter((plan) => plan === 'crouch')).toHaveLength(1);
  });

  test('the skips are the net’s TWO turns, borrowed from the one net rule', () => {
    expect(MODULE).toContain('ENTANGLE_TURNS_ON_LAND');
    expect(ENTANGLE_TURNS_ON_LAND).toBe(2);
    const once = beastSkipsCadence(beastNetted(createBeastState()));
    expect(once.netSkip).toBe(1);
    const twice = beastSkipsCadence(once);
    expect(twice.netSkip).toBe(0);
    // …and it cannot go negative however often it is spent.
    expect(beastSkipsCadence(twice).netSkip).toBe(0);
  });

  test('SECUTOR RULING: Snag-Proof refuses a secutor and cannot refuse the beast', () => {
    // The immunity is keyed on the target's CLASS; the beast has none, so the
    // duel resolves this cast with no class at all.
    expect(resolveNetCast({ targetArmaturaId: 'secutor', rngOrValue: 0 }).immune).toBe(true);
    expect(resolveNetCast({ rngOrValue: 0 })).toEqual({
      landed: true,
      immune: false,
      entangledTurns: ENTANGLE_TURNS_ON_LAND,
    });
    const branch = DUEL_SCENE.slice(
      DUEL_SCENE.indexOf('else if (isBeastNet && beastCfg)'),
      DUEL_SCENE.indexOf('} else {', DUEL_SCENE.indexOf('else if (isBeastNet && beastCfg)')),
    );
    // The beast cast passes NO target class…
    expect(branch).toContain('resolveNetCast({})');
    // …so no armatura can ever be read for it.
    expect(branch).not.toContain('armaturaId');
    expect(branch).not.toContain('defenderMods');
    // …and it reuses the net's own entangle length.
    expect(branch).toContain('beastNetted(');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §F — the pounce's numbers, through the existing formulas
// ════════════════════════════════════════════════════════════════════════════
describe('D-2 §F — the pounce consumes the existing hit/evasion/damage stages', () => {
  const beast = BEAST();
  const playerAgi = 14;
  const playerDefense = 14;
  const blockReduction = 0.5;

  test('the hit chance is the quick formula, with the beast’s own agility', () => {
    const pounce = calculateHitChance(beast.hitProfile === 'quick', beast.agility, playerAgi);
    expect(pounce).toBe(calculateHitChance(true, 18, playerAgi));
    // It is the SAME function a fighter's attack uses — no beast-specific maths.
    expect(MODULE).not.toContain('calculateHitChance');
    expect(DUEL_SCENE).toContain('strikeAgility');
  });

  test('the damage is calculateAttackDamage with the beast’s damage and strength as base', () => {
    const landed = calculateAttackDamage(
      beast.pounceDamage,
      beast.strength,
      false,
      playerDefense,
      false,
      0,
      1,
      1,
    );
    // Identical to a fighter holding a 24-damage weapon at STR 12 against DEF 14.
    expect(landed).toBe(calculateAttackDamage(24, 12, false, 14, false, 0, 1, 1));
    expect(landed).toBeGreaterThan(0);
    expect(DUEL_SCENE).toContain('beastCfg.pounceDamage');
    expect(DUEL_SCENE).toContain('beastCfg.strength');
  });

  test('a shield absorbs at the standard block reduction', () => {
    const unblocked = calculateAttackDamage(24, 12, false, playerDefense, false, 0, 1, 1);
    const blocked = calculateAttackDamage(24, 12, false, playerDefense, true, blockReduction, 1, 1);
    expect(blocked).toBeLessThan(unblocked);
    // Exactly the weapon's own reduction, floored at the formula's own 1.
    const expected = Math.max(1, Math.round(unblocked * (1 - blockReduction)));
    expect(blocked).toBe(expected);
    // The branch reads the defender's block the way every blow does.
    expect(DUEL_SCENE).toContain('const isBlocked = defender.isBlocking;');
  });

  test('a dodge stance evades at the standard 75 %, which the pounce inherits', () => {
    // The pounce is dispatched as an ordinary attack, so it meets the one evasion
    // branch — the stance's 0.75 and the player's passive evade, unchanged.
    expect(DUEL_SCENE).toContain('const isEvaded = defender.isInvulnerable && Math.random() < 0.75;');
    expect((DUEL_SCENE.match(/Math\.random\(\) < 0\.75/g) ?? []).length).toBe(1);
    // The pounce has no evasion path of its own: the marker adds no branch.
    const markers = DUEL_SCENE.slice(
      DUEL_SCENE.indexOf('const isBeastPounce'),
      DUEL_SCENE.indexOf('const isBeastStrike'),
    );
    expect(markers).not.toContain('isEvaded');
    expect(markers).not.toContain('Math.random');
  });

  test('no formula or constant moved: the pounce is a dispatch, not a mechanic', () => {
    const calc = code('src/utils/combatCalculations.ts');
    for (const token of ['beast', 'pounce', 'Ferrum', 'crouch']) {
      expect(calc, token).not.toContain(token);
    }
    // DuelScene keeps exactly its two damage call sites.
    expect((DUEL_SCENE.match(/calculateAttackDamage\(/g) ?? []).length).toBe(2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §G — Blood-Scent
// ════════════════════════════════════════════════════════════════════════════
describe('D-2 §G — Blood-Scent rides the traitMult parameter', () => {
  test('the palma contributes nothing on its own — its block is still empty', () => {
    const mods = buildOpponentModifiers(marcellin());
    expect(mods.palmae.map((palma) => palma.id)).toEqual(['blood_scent']);
    expect(mods.block).toEqual({});
    const ctx = {
      isQuick: false,
      distance: 2,
      effectiveRange: 3.8,
      attackerHealth: 150,
      attackerHealthMax: 200,
      defenderHealth: 120,
      defenderHealthMax: 150,
      defenderIsBoss: false,
    } as const;
    // No unconditional bonus: the +20 % can only arrive through the marker.
    expect(damageDealtMultiplier(mods, ctx)).toBe(1);
  });

  test('the magnitude is the palma’s own +20 %, and it is applied once', () => {
    expect(BLOOD_SCENT_DAMAGE_MULT).toBe(1.2);
    const plain = calculateAttackDamage(16, 15, false, 14, false, 0, 1, 1);
    const scented = calculateAttackDamage(16, 15, false, 14, false, 0, 1, BLOOD_SCENT_DAMAGE_MULT);
    expect(scented).toBeGreaterThan(plain);
    expect(scented).toBe(calculateAttackDamage(16, 15, false, 14, false, 0, 1, 1.2));
  });

  test('it is set by a pounce that draws blood, and by nothing else', () => {
    const marker = DUEL_SCENE.slice(
      DUEL_SCENE.indexOf('if (isBeastPounce) {'),
      DUEL_SCENE.indexOf('// Track stats'),
    );
    expect(marker).toContain("carriesBossPalma(opponentMods, 'blood_scent')");
    expect(marker).toContain('bloodScentRef.current = true;');
    // Only one site ever sets it.
    expect((DUEL_SCENE.match(/bloodScentRef\.current = true/g) ?? []).length).toBe(1);
  });

  test('it applies to the master’s next attack only, and expires unused', () => {
    const read = DUEL_SCENE.slice(
      DUEL_SCENE.indexOf('const isBloodScentAttack'),
      DUEL_SCENE.indexOf('const isBeastStrike'),
    );
    // Not the pounce itself, and never a player action.
    expect(read).toContain('!isActorPlayer && !isBeastPounce && bloodScentRef.current');
    // Read-and-cleared: one blow, then gone.
    expect(read).toContain('bloodScentRef.current = false;');
    expect((DUEL_SCENE.match(/isBloodScentAttack \? BLOOD_SCENT_DAMAGE_MULT : 1/g) ?? []).length).toBe(1);
    expect((DUEL_SCENE.match(/isBloodScentAttack \?/g) ?? []).length).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §H — master alone
// ════════════════════════════════════════════════════════════════════════════
describe('D-2 §H — the master alone fights at the row’s own shift', () => {
  test('the shift is exactly the data value', () => {
    const bonus = BEAST().masterAloneAggressionBonus;
    expect(bonus).toBe(0.1);
    expect(masterAloneAggression(0.6, bonus)).toBeCloseTo(0.7, 10);
    expect(masterAloneAggression(marcellin().aggression, bonus)).toBeCloseTo(0.7, 10);
  });

  test('it is clamped, and a duel with no flight is untouched', () => {
    expect(masterAloneAggression(0.95, 0.1)).toBe(1);
    expect(masterAloneAggression(0.6, 0)).toBe(0.6);
    expect(masterAloneAggression(0.6, -1)).toBe(0.6);
    expect(masterAloneAggression(Number.NaN, 0.1)).toBeCloseTo(0.6, 10);
  });

  test('the AI reads it only once the beast has fled', () => {
    expect(DUEL_SCENE).toContain("beastCfg && beastRef.current.pose === 'fled'");
    expect(DUEL_SCENE).toContain('masterAloneAggression(opponent.aggression, beastCfg.masterAloneAggressionBonus)');
    // The standard call is preserved verbatim for every other bout.
    expect(DUEL_SCENE).toContain('chooseAIStandardAction(opponent.aggression, opponent.blockChance)');
  });

  test('the HUD says it once, in the part’s own words', () => {
    expect(BEAST_FLIGHT_WORDS).toBe('The master fights mad now — grief makes him reckless');
    // One writer of the line, beside the one site that can make the beast flee.
    expect((DUEL_SCENE.match(/addLog\(BEAST_FLIGHT_WORDS/g) ?? []).length).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §I — the surfaces
// ════════════════════════════════════════════════════════════════════════════
const fighter = (over: Partial<FighterState> = {}): FighterState => ({
  id: 'player',
  name: 'Testa',
  title: '',
  isPlayer: true,
  position: [0, 0, 3.5],
  rotationY: Math.PI,
  health: 140,
  stamina: 90,
  action: 'idle',
  actionTimer: 0,
  isBlocking: false,
  isInvulnerable: false,
  hitFlashTimer: 0,
  stats: { strength: 14, agility: 14, staminaMax: 110, staminaRegen: 18, defense: 14, healthMax: 140 },
  loadout: {
    weapon: {
      id: 'w',
      name: 'Gladius',
      type: 'sword_shield',
      rarity: 'common',
      description: '',
      damageLight: 19,
      damageHeavy: 35,
      staminaLight: 9,
      staminaHeavy: 20,
      range: 2.5,
      speed: 1,
      blockReduction: 0.5,
      price: 0,
      sellPrice: 0,
      color: '#fff',
      metalColor: '#fff',
      icon: '',
    },
  },
  comboCount: 0,
  skinColor: '#b07d62',
  hairColor: '#27272a',
  tunicColor: '#78350f',
  ...over,
});

const BEAST_PANEL = { name: 'Ferrum', wounds: 1, maxWounds: 3, agility: 18, targetable: true };

describe('D-2 §I — the surfaces the player reads', () => {
  test('the wound pips sit beside the boss name', () => {
    const html = renderToStaticMarkup(
      React.createElement(CombatHUD, {
        player: fighter(),
        opponent: fighter({ isPlayer: false, name: 'Marcellin the Beastmaster' }),
        crowdHype: 25,
        comboCount: 0,
        matchTimer: 0,
        isMuted: false,
        onToggleMute: () => {},
        onOpenArmory: () => {},
        onOpenHelp: () => {},
        cameraMode: 'cinematic',
        onCycleCameraMode: () => {},
        distance: 2,
        isPlayerTurn: true,
        isExecuting: false,
        combatLog: [],
        opponentIsBoss: true,
        beast: BEAST_PANEL,
        onExecuteAction: () => {},
      }),
    );
    expect(html).toContain('data-beast-pips="1/3"');
    // Three pips, one of them taken.
    expect((html.match(/rounded-full border bg-amber-400/g) ?? []).length).toBe(1);
  });

  test('a duel with no beast renders no pips and no target control', () => {
    const html = renderToStaticMarkup(
      React.createElement(CombatHUD, {
        player: fighter(),
        opponent: fighter({ isPlayer: false, name: 'Brutus' }),
        crowdHype: 25,
        comboCount: 0,
        matchTimer: 0,
        isMuted: false,
        onToggleMute: () => {},
        onOpenArmory: () => {},
        onOpenHelp: () => {},
        cameraMode: 'cinematic',
        onCycleCameraMode: () => {},
        distance: 2,
        isPlayerTurn: true,
        isExecuting: false,
        combatLog: [],
        onExecuteAction: () => {},
      }),
    );
    expect(html).not.toContain('data-beast-pips');
    expect(html).not.toContain('data-beast-target-control');
  });

  test('the target control defaults to the MASTER and is two real 48dp buttons', () => {
    const html = renderToStaticMarkup(
      React.createElement(TurnActionPanel, {
        player: fighter(),
        opponent: fighter({ isPlayer: false, name: 'Marcellin the Beastmaster' }),
        distance: 2,
        isPlayerTurn: true,
        isExecuting: false,
        combatLog: [],
        beast: BEAST_PANEL,
        onExecuteAction: () => {},
      }),
    );
    expect(html).toContain('data-beast-target-control="true"');
    expect(html).toContain('data-beast-target="master"');
    expect(html).toContain('data-beast-target="beast"');
    // Keyboard parity: two real buttons, each carrying its pressed state.
    const buttons = html.match(/<button[^>]*data-beast-target="(master|beast)"[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toContain('aria-pressed="true"'); // default = master
    expect(buttons[1]).toContain('aria-pressed="false"');
    // The 48dp floor, as on every other combat control.
    for (const button of buttons) expect(button).toContain('min-h-[48px]');
    expect(html).toContain('Ferrum');
  });

  test('the control is absent while the beast is not crouching', () => {
    const html = renderToStaticMarkup(
      React.createElement(TurnActionPanel, {
        player: fighter(),
        opponent: fighter({ isPlayer: false, name: 'Marcellin the Beastmaster' }),
        distance: 2,
        isPlayerTurn: true,
        isExecuting: false,
        combatLog: [],
        beast: { ...BEAST_PANEL, targetable: false },
        onExecuteAction: () => {},
      }),
    );
    expect(html).not.toContain('data-beast-target-control');
  });

  test('the attack buttons hand the chosen target to the duel', () => {
    const panel = code('src/components/ui/TurnActionPanel.tsx');
    expect(panel).toContain("onExecuteAction('quick_attack', attackTarget)");
    expect(panel).toContain("onExecuteAction('power_attack', attackTarget)");
    expect(panel).toContain("onExecuteAction('cast_net', attackTarget)");
  });

  test('the epilogue is computed from duel state and reaches the result screen', () => {
    const fled = beastWounded(beastWounded(beastWounded(beastCrouches(createBeastState()), BEAST()), BEAST()), BEAST());
    expect(fled.pose).toBe('fled');
    const wonFled = beastEpilogueLine(fled, true, 'Ferrum', 'Marcellin');
    const wonProwl = beastEpilogueLine(createBeastState(), true, 'Ferrum', 'Marcellin');
    expect(wonFled).not.toBe(wonProwl);
    expect(wonFled).toContain('Ferrum');
    expect(beastEpilogueLine(null, true, 'Ferrum', 'Marcellin')).toBe('');
    expect(beastEpilogueLine(createBeastState(), false, 'Ferrum', 'Marcellin')).toContain('Marcellin');
    // The duel writes it on the in-memory statistics object…
    expect((DUEL_SCENE.match(/statsRef\.current\.beastEpilogue =/g) ?? []).length).toBe(2);
    // …and the result modal prints it.
    const modal = code('src/components/hub/DuelResultModal.tsx');
    expect(modal).toContain('stats.beastEpilogue');
  });

  test('a victory with the beast still standing flees it with the result', () => {
    expect(beastFleesWithMaster(createBeastState()).pose).toBe('fled');
    const already = beastFleesWithMaster({ ...createBeastState(), pose: 'fled' });
    expect(already.pose).toBe('fled');
    expect(DUEL_SCENE).toContain('beastFleesWithMaster(beastRef.current)');
  });

  test('the beast figure renders from the fence, and a fled beast is not drawn', () => {
    expect(DUEL_SCENE).toContain("beastCfg && beast.pose !== 'fled' && (");
    expect(DUEL_SCENE).toContain('<BeastFigure');
    const figure = code('src/components/3d/BeastFigure.tsx');
    // The stand-in is primitives with two shared materials and no per-frame work.
    expect(figure).toContain('new THREE.MeshStandardMaterial');
    expect(figure).not.toContain('useFrame');
    expect(figure).not.toContain('useGLTF');
    expect(figure).not.toContain('mixer');
  });

  test('the dawn state is property deltas only — no new light, mesh or material', () => {
    const dawn = bossSceneDeltas(marcellin());
    expect(dawn).not.toBeNull();
    expect(Object.keys(dawn ?? {}).sort()).toEqual(
      ['ambientColor', 'ambientIntensity', 'fogColor', 'sunColor', 'sunIntensity'].sort(),
    );
    // Only the one authored state has a table entry so far.
    expect(Object.keys(BOSS_PRESENTATION_DELTAS)).toEqual(['dawn']);
    // A ladder boss and a non-boss ask for nothing.
    expect(bossSceneDeltas(ALL_OPPONENTS.find((o) => o.id === 'opp_ignis_boss'))).toBeNull();
    expect(bossSceneDeltas(ALL_OPPONENTS[0])).toBeNull();
    // The scene applies them to the rig it already had…
    expect(DUEL_SCENE).toContain('bossSceneDeltas(opponent)');
    expect(DUEL_SCENE).toContain('sceneDeltas?.sunIntensity');
    expect(DUEL_SCENE).toContain('sceneDeltas?.ambientIntensity');
    // …naming no state and adding nothing to the scene.
    expect(DUEL_SCENE).not.toContain("'dawn'");
    expect(DUEL_SCENE).not.toMatch(/<pointLight|<spotLight|new THREE\.Mesh|new THREE\.Material/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §J — scope
// ════════════════════════════════════════════════════════════════════════════
describe('D-2 §J — nothing persists, and no pipeline stage was added', () => {
  test('the beast state never reaches a save', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) return walk(path);
        return entry.isFile() && /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
      });
    const naming = walk('src')
      .filter((path) => readSource(path).includes('BeastDuelState'))
      .map((path) => path.replace(/^src\//, 'src/'));
    expect(naming.sort()).toEqual(
      [
        'src/components/duel/DuelScene.tsx',
        'src/utils/beastHunt.test.ts',
        'src/utils/beastHunt.ts',
      ].sort(),
    );
    for (const path of ['src/services/storage.ts', 'src/services/googleDrive.ts']) {
      const text = readSource(path);
      expect(text.includes('beast'), path).toBe(false);
    }
  });

  test('the duel resolves the beast through the module and adds no stage of its own', () => {
    for (const call of [
      'openBossSlot(',
      'planBeastSlot(',
      'beastCrouches(',
      'beastPounces(',
      'beastSkipsCadence(',
      'beastWounded(',
      'beastNetted(',
      'beastEpilogueLine(',
      'masterAloneAggression(',
    ]) {
      expect(DUEL_SCENE, call).toContain(call);
    }
    // The pounce is the existing attack action; the crouch is the only new action.
    expect(DUEL_SCENE).toContain("beastCfg.hitProfile === 'power' ? 'power_attack' : 'quick_attack'");
    // Five dispatches inside the resolution (the two ladder boss branches, the
    // beast's crouch, the beast's pounce, the AI's chosen action) plus the panel's
    // own callback — no sixth resolution path was introduced.
    expect((DUEL_SCENE.match(/executeCombatTurn\(/g) ?? []).length).toBe(6);
  });

  test('the fence gates the panel, the figure, the pips and every rule', () => {
    // One fence read, and every beast surface is behind it.
    expect((DUEL_SCENE.match(/beastConfigFor\(opponent\)/g) ?? []).length).toBe(1);
    expect(DUEL_SCENE).toContain('const beastCfg = useMemo(');
    for (const surface of ['if (beastCfg) {', 'beastCfg && beast.pose !== \'fled\'', 'beastCfg\n            ? {']) {
      expect(DUEL_SCENE, surface).toContain(surface);
    }
  });
});
