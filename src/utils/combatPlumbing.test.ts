/**
 * ===========================================================================
 * CH-3a — COMBAT PLUMBING (palmae + passive doctrinae through the hooks)
 * ===========================================================================
 * The slices' pins, one section per hook stage.  Nothing here restates a
 * formula: every expectation is computed with the SHIPPED functions
 * (`combatCalculations.ts`, `combatModifiers.ts`, `storage.ts`) so a change to a
 * formula or a constant moves the assertions with it — except where a pin is
 * deliberately FROZEN (the pre-CH-3a stat numbers and the pre-CH-3a damage
 * expectations), which is the whole point of those tests.
 *
 *   §S  the merged block each fighter reads       (§2.4 construction)
 *   §T  the stat stage                            (storage.calculateTotalStats)
 *   §D  the damage signature                      (calculateAttackDamage's traitMult)
 *   §W  the weapon stage                          (stamina, block, penetration)
 *   §H  the hit stage                             (effective AGI, crit chance)
 *   §V  the evasion stage                         (passiveEvadeAdd)
 *   §P  the damage stage                          (dealt/taken, conditions)
 *   §E  the event stage                           (applyPalmaEvent)
 *   §R  the fixed-seed pre-CH-3a regression       (scripted duels)
 *   §A  the two acceptance duels
 *   §X  the wiring, read out of the sources
 *
 * Run with: bun test src/utils/combatPlumbing.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  calculateAttackDamage,
  calculateHitChance,
  getStaminaCost,
  applyPalmaEvent,
  applyStaminaRegen,
  DEFENSE_MITIGATION_FACTOR,
  STRENGTH_BONUS_PER_POINT,
  CRIT_MULTIPLIER,
  RAGE_DAMAGE_MULTIPLIER,
} from './combatCalculations';
import {
  BASE_CRIT_CHANCE,
  CRIT_CHANCE_CAP,
  DOCTRINA_BLOCK_PENETRATION,
  EMPTY_MODIFIERS,
  SPEARMANS_GROUND_BANDS,
  blockPenetrationFor,
  blockReductionFor,
  buildOpponentModifiers,
  buildPlayerModifiers,
  critChanceFor,
  damageDealtMultiplier,
  damageTakenMultiplier,
  effectiveBlockReduction,
  hitAgilityFor,
  passiveEvadeChance,
  recordHitType,
  resolveTraitMult,
  spearmansGroundMult,
  staminaCostWithModifiers,
  type DamageContext,
  type FighterModifiers,
} from './combatModifiers';
import { createNewProfile, calculateTotalStats } from '../services/storage';
import { PALMAE, getPalma } from '../data/palmae';
import { ALL_OPPONENTS } from '../data/opponents';
import type { FighterStats, PlayerProfile, WeaponItem } from '../types/game';

// ── helpers ──────────────────────────────────────────────────────────────────

const source = (path: string) => readFileSync(path, 'utf8');
/** Strip block and line comments so prose can neither satisfy nor defeat a pin. */
const code = (path: string) =>
  source(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const profileWith = (
  overrides: Partial<PlayerProfile>,
  palmae?: { unlocked: string[]; equipped: string[] },
): PlayerProfile => {
  const base = createNewProfile('Trial');
  return { ...base, ...overrides, ...(palmae ? { palmae } : {}) };
};

/** A profile wearing `equipped` (all unlocked) with the given class. */
const wearing = (equipped: string[], armatura?: PlayerProfile['armatura']) => {
  const profile = profileWith(armatura ? { armatura } : {});
  return { ...profile, palmae: { unlocked: equipped, equipped } };
};

const modsFor = (equipped: string[], armatura?: PlayerProfile['armatura']) =>
  buildPlayerModifiers(wearing(equipped, armatura));

/** A damage context with neutral defaults; override what a case is about. */
const ctx = (overrides: Partial<DamageContext> = {}): DamageContext => ({
  isQuick: false,
  distance: 1.0,
  effectiveRange: 2.5,
  attackerHealth: 100,
  attackerHealthMax: 100,
  defenderHealth: 100,
  defenderHealthMax: 100,
  defenderIsBoss: false,
  ...overrides,
});

const weapon = (partial: Partial<WeaponItem>): WeaponItem => ({
  id: 'probe',
  name: 'Probe',
  type: 'sword_shield',
  rarity: 'common',
  description: '',
  damageLight: 20,
  damageHeavy: 30,
  staminaLight: 10,
  staminaHeavy: 22,
  range: 2.5,
  speed: 1,
  blockReduction: 0.8,
  price: 0,
  sellPrice: 0,
  color: '#fff',
  metalColor: '#fff',
  icon: '',
  ...partial,
});

/** The pre-CH-3a damage call: the same seven arguments, no traitMult. */
const preCh3aDamage = (
  baseDamage: number,
  strength: number,
  isCrit: boolean,
  defense: number,
  isBlocked: boolean,
  blockReduction: number,
  rage = 1.0,
) => {
  const raw =
    baseDamage *
    (1 + strength * STRENGTH_BONUS_PER_POINT) *
    (isCrit ? CRIT_MULTIPLIER : 1.0) *
    rage;
  let mitigated = raw * (100 / (100 + defense * DEFENSE_MITIGATION_FACTOR));
  if (isBlocked) mitigated *= 1 - blockReduction;
  return Math.max(1, Math.round(mitigated));
};

/** A deterministic LCG, so a seed fixes the whole trace. */
const makeRng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

interface Duelist {
  stats: FighterStats;
  weapon: WeaponItem;
  health: number;
  stamina: number;
  isBlocking: boolean;
}

const fighter = (stats: FighterStats, weaponItem: WeaponItem): Duelist => ({
  stats,
  weapon: weaponItem,
  health: stats.healthMax,
  stamina: stats.staminaMax,
  isBlocking: false,
});

/**
 * One attack, resolved the way `DuelScene.executeCombatTurn` resolves it.
 *
 * `mods` is the pair the NEW pipeline reads; `reference` asks for the PRE-CH-3a
 * formulas (raw AGI, 0.25 crit, the weapon's own blockReduction, no traitMult,
 * no event stage).  Both consume the SAME draws in the SAME order, which is
 * what makes a fixed-seed trace comparable: the passive-evade draw only happens
 * when a passive evade chance exists.
 */
function resolveStrike(
  rng: () => number,
  attacker: Duelist,
  defender: Duelist,
  opts: {
    reference?: boolean;
    attackerMods?: FighterModifiers;
    defenderMods?: FighterModifiers;
    isQuick?: boolean;
  } = {},
) {
  const attackerMods = opts.attackerMods ?? EMPTY_MODIFIERS;
  const defenderMods = opts.defenderMods ?? EMPTY_MODIFIERS;
  const isQuick = opts.isQuick ?? rng() < 0.5;

  const hitPct = opts.reference
    ? calculateHitChance(isQuick, attacker.stats.agility, defender.stats.agility)
    : calculateHitChance(
        isQuick,
        hitAgilityFor(attacker.stats.agility, attackerMods),
        hitAgilityFor(defender.stats.agility, defenderMods),
      );

  const roll = rng() * 100;

  // The evasion stage: no dodge stance in this model, so only the passive
  // branch can fire — and it only draws when a chance exists.
  const evadeChance = opts.reference ? 0 : passiveEvadeChance(defenderMods, false);
  const evaded = evadeChance > 0 && rng() < evadeChance;
  if (evaded) return { isQuick, hitPct, roll, crit: false, evaded, damage: 0 };

  if (roll > hitPct) return { isQuick, hitPct, roll, crit: false, evaded: false, damage: 0 };

  const crit = !isQuick && rng() < (opts.reference ? BASE_CRIT_CHANCE : critChanceFor(attackerMods));
  const isBlocked = defender.isBlocking;
  const base = isQuick ? attacker.weapon.damageLight : attacker.weapon.damageHeavy;

  if (opts.reference) {
    return {
      isQuick,
      hitPct,
      roll,
      crit,
      evaded: false,
      damage: preCh3aDamage(
        base,
        attacker.stats.strength,
        crit,
        defender.stats.defense,
        isBlocked,
        defender.weapon.blockReduction,
      ),
    };
  }

  const damage = calculateAttackDamage(
    base,
    attacker.stats.strength,
    crit,
    defender.stats.defense,
    isBlocked,
    effectiveBlockReduction(defender.weapon.blockReduction, defenderMods, attackerMods, isBlocked),
    1.0,
    resolveTraitMult(attackerMods, defenderMods, {
      isQuick,
      distance: 1.4,
      effectiveRange: attacker.weapon.range,
      attackerHealth: attacker.health,
      attackerHealthMax: attacker.stats.healthMax,
      defenderHealth: defender.health,
      defenderHealthMax: defender.stats.healthMax,
      defenderIsBoss: false,
    }),
  );

  return { isQuick, hitPct, roll, crit, evaded: false, damage };
}

/** A scripted duel of `strikes` attacks between two fighters, alternating block. */
function scriptedDuel(seed: number, strikes: number, opts: {
  attacker: Duelist;
  defender: Duelist;
  reference?: boolean;
  attackerMods?: FighterModifiers;
  defenderMods?: FighterModifiers;
  quick?: boolean;
}) {
  const rng = makeRng(seed);
  const attacker = { ...opts.attacker };
  const defender = { ...opts.defender };
  const trace: Array<Record<string, number | boolean>> = [];

  for (let i = 0; i < strikes; i += 1) {
    defender.isBlocking = i % 3 === 0;
    const outcome = resolveStrike(rng, attacker, defender, {
      reference: opts.reference,
      attackerMods: opts.attackerMods,
      defenderMods: opts.defenderMods,
      isQuick: opts.quick,
    });
    defender.health = Math.max(0, defender.health - outcome.damage);
    trace.push({
      isQuick: outcome.isQuick,
      hitPct: outcome.hitPct,
      roll: outcome.roll,
      crit: outcome.crit,
      blocked: defender.isBlocking,
      damage: outcome.damage,
      defenderHealth: defender.health,
    });
  }
  return trace;
}

// ════════════════════════════════════════════════════════════════════════════
// §S — THE MERGED BLOCK
// ════════════════════════════════════════════════════════════════════════════

describe('CH-3a §S — the merged block each fighter reads', () => {
  test('a fresh Murmillo resolves its doctrina and no palmae', () => {
    const mods = buildPlayerModifiers(createNewProfile('Spartacus'));
    expect(mods.armaturaId).toBe('murmillo');
    expect(mods.palmae).toEqual([]);
    expect(mods.doctrina).toEqual({ onBlockStamina: 6 });
    expect(mods.block).toEqual({ onBlockStamina: 6 });
  });

  test('a legacy save with neither field resolves the same way (never throws)', () => {
    const legacy = createNewProfile('Legacy');
    expect('armatura' in legacy).toBe(false);
    expect('palmae' in legacy).toBe(false);
    const mods = buildPlayerModifiers(legacy);
    expect(mods.armaturaId).toBe('murmillo');
    expect(mods.palmae).toEqual([]);
    expect(() => buildPlayerModifiers(null)).not.toThrow();
    expect(buildPlayerModifiers(undefined).block).toEqual({ onBlockStamina: 6 });
  });

  test('the equipped palmae and the doctrina merge into one block', () => {
    const mods = modsFor(['iron_lungs', 'second_wind']);
    expect(mods.palmae.map((p) => p.id)).toEqual(['iron_lungs', 'second_wind']);
    expect(mods.block).toEqual({
      onBlockStamina: 6,
      staminaMaxAdd: 12,
      staminaRegenAdd: 2,
      restStaminaAdd: 15,
    });
  });

  test('the equipped rows are the resolver\u2019s, so locked/boss-only ids never arrive', () => {
    const profile = profileWith({}, { unlocked: ['executioner'], equipped: ['executioner', 'colossus_hide'] });
    const mods = buildPlayerModifiers(profile);
    expect(mods.palmae.map((p) => p.id)).toEqual(['executioner']);
    const locked = profileWith({}, { unlocked: ['executioner'], equipped: ['blood_price'] });
    expect(buildPlayerModifiers(locked).palmae).toEqual([]);
  });

  test('an opponent with no config resolves to the empty block (today\u2019s behaviour)', () => {
    for (const opponent of ALL_OPPONENTS) {
      const mods = buildOpponentModifiers(opponent);
      expect(mods.block, opponent.id).toEqual({});
      expect(mods.palmae, opponent.id).toEqual([]);
      expect(mods.armaturaId, opponent.id).toBeUndefined();
      expect(mods.doctrina, opponent.id).toEqual({});
    }
    expect(buildOpponentModifiers(null).block).toEqual({});
  });

  test('CH-4 seam — a configured opponent resolves its class and palms', () => {
    const configured = {
      ...ALL_OPPONENTS[0],
      armatura: 'thraex',
      palmae: ['shieldwall_discipline', 'unknown_id', 'shieldwall_discipline'],
    } as unknown as (typeof ALL_OPPONENTS)[number];
    const mods = buildOpponentModifiers(configured);
    expect(mods.armaturaId).toBe('thraex');
    expect(mods.palmae.map((p) => p.id)).toEqual(['shieldwall_discipline']);
    // The class contributes an empty block, the palma its 0.06.
    expect(mods.block).toEqual({ blockReductionAdd: 0.06 });
  });

  test('the block is a fresh value: building mutates no catalogue row', () => {
    const before = JSON.stringify(PALMAE);
    const a = modsFor(['iron_lungs']);
    const b = modsFor(['iron_lungs']);
    expect(a.block).toEqual(b.block);
    expect(a.block).not.toBe(b.block);
    expect(JSON.stringify(PALMAE)).toBe(before);
  });

  test('the empty block is the identity for every stage helper', () => {
    expect(staminaCostWithModifiers(22, false, EMPTY_MODIFIERS)).toBe(22);
    expect(blockReductionFor(0.8, EMPTY_MODIFIERS)).toBe(0.8);
    expect(hitAgilityFor(9, EMPTY_MODIFIERS)).toBe(9);
    expect(critChanceFor(EMPTY_MODIFIERS)).toBe(BASE_CRIT_CHANCE);
    expect(passiveEvadeChance(EMPTY_MODIFIERS, false)).toBe(0);
    expect(damageDealtMultiplier(EMPTY_MODIFIERS, ctx())).toBe(1);
    expect(damageTakenMultiplier(EMPTY_MODIFIERS, ctx())).toBe(1);
    expect(resolveTraitMult(EMPTY_MODIFIERS, EMPTY_MODIFIERS, ctx())).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §T — THE STAT STAGE (storage.calculateTotalStats)
// ════════════════════════════════════════════════════════════════════════════

describe('CH-3a §T — the stat stage', () => {
  /** The pre-CH-3a numbers for a fresh profile, frozen as literals. */
  const PRE_CH3A_STATS = {
    strength: 10,
    agility: 10,
    stamina: 10,
    staminaMax: 120,
    staminaRegen: 24,
    defense: 6,
    healthMax: 138,
  };

  test('FROZEN: no palmae equipped reproduces the pre-CH-3a numbers exactly', () => {
    const stats = calculateTotalStats(createNewProfile('Spartacus'));
    for (const [key, value] of Object.entries(PRE_CH3A_STATS)) {
      expect(stats[key as keyof FighterStats], key).toBe(value);
    }
  });

  test('no palmae equipped is bit-identical to the pre-CH-3a formula', () => {
    const profile = createNewProfile('Bit');
    const equipmentStr = (profile.equipped.weapon.bonusStrength ?? 0);
    const equipmentAgi = (profile.equipped.weapon.bonusAgility ?? 0);
    const equipmentSta = (profile.equipped.weapon.bonusStamina ?? 0);
    const equipmentDef = (profile.equipped.weapon.bonusDefense ?? 0) + 0;
    const str = profile.baseStats.strength + equipmentStr;
    const agi = profile.baseStats.agility + equipmentAgi;
    const sta = profile.baseStats.stamina + equipmentSta;
    const def = profile.baseStats.defense + equipmentDef;

    const stats = calculateTotalStats(profile);
    expect(stats.strength).toBe(str);
    expect(stats.agility).toBe(agi);
    expect(stats.stamina).toBe(sta);
    expect(stats.defense).toBe(def);
    expect(stats.healthMax).toBe(80 + str * 4 + def * 3);
    expect(stats.staminaMax).toBe(70 + sta * 5);
    expect(stats.staminaRegen).toBe(12 + agi * 0.8 + sta * 0.4);
  });

  test('Iron Lungs adds exactly +12 staminaMax and +2 staminaRegen, nothing else', () => {
    const plain = calculateTotalStats(createNewProfile('Plain'));
    const lunged = calculateTotalStats(wearing(['iron_lungs']));
    expect(lunged.staminaMax).toBe(plain.staminaMax + 12);
    expect(lunged.staminaRegen).toBe(plain.staminaRegen + 2);
    expect(lunged.strength).toBe(plain.strength);
    expect(lunged.agility).toBe(plain.agility);
    expect(lunged.stamina).toBe(plain.stamina);
    expect(lunged.defense).toBe(plain.defense);
    expect(lunged.healthMax).toBe(plain.healthMax);
  });

  test('a stat-stage-free palma changes no stat at all', () => {
    const plain = calculateTotalStats(createNewProfile('Plain'));
    for (const id of ['second_wind', 'sand_sprinter', 'executioner', 'phoenix_nerves']) {
      expect(calculateTotalStats(wearing([id])), id).toEqual(plain);
    }
  });

  test('no CH-1 row carries statFlat or healthMaxAdd today (identity by data)', () => {
    for (const palma of PALMAE) {
      expect(palma.effect.statFlat, palma.id).toBeUndefined();
      expect(palma.effect.healthMaxAdd, palma.id).toBeUndefined();
    }
  });

  test('the statFlat / healthMaxAdd fold is live (seam driven, then restored)', () => {
    const lung = getPalma('iron_lungs')!;
    const original = lung.effect;
    const plain = calculateTotalStats(createNewProfile('Seam'));
    try {
      lung.effect = { staminaMaxAdd: 12, statFlat: { str: 2, def: 1 }, healthMaxAdd: 10 };
      const folded = calculateTotalStats(wearing(['iron_lungs']));
      // +2 STR and +1 DEF feed the derived maxima exactly as the formula does.
      expect(folded.strength).toBe(plain.strength + 2);
      expect(folded.defense).toBe(plain.defense + 1);
      expect(folded.healthMax).toBe(
        80 + (plain.strength + 2) * 4 + (plain.defense + 1) * 3 + 10,
      );
      expect(folded.staminaMax).toBe(plain.staminaMax + 12);
    } finally {
      lung.effect = original;
    }
    expect(calculateTotalStats(wearing(['iron_lungs'])).staminaMax).toBe(plain.staminaMax + 12);
  });

  test('the injury penalty still applies after the flat add', () => {
    const injured = wearing(['iron_lungs']);
    const withInjury: PlayerProfile = {
      ...injured,
      injury: { penaltyStrength: 4, penaltyAgility: 4, fightsRemaining: 1, name: 'Broken rib' } as PlayerProfile['injury'],
    };
    const healthy = calculateTotalStats(injured);
    const hurt = calculateTotalStats(withInjury);
    expect(hurt.strength).toBe(healthy.strength - 4);
    expect(hurt.agility).toBe(healthy.agility - 4);
    expect(hurt.healthMax).toBeLessThan(healthy.healthMax);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §D — THE DAMAGE SIGNATURE
// ════════════════════════════════════════════════════════════════════════════

describe('CH-3a §D — calculateAttackDamage\u2019s traitMult', () => {
  /** The existing damage expectations, re-stated as calls and as pre-CH-3a maths. */
  const cases: Array<[string, number, number, boolean, number, boolean, number, number]> = [
    ['no defense', 20, 10, false, 0, false, 0, 1.0],
    ['defense 6', 20, 10, false, 6, false, 0, 1.0],
    ['defense 38', 20, 10, false, 38, false, 0, 1.0],
    ['crit', 20, 10, true, 10, false, 0, 1.0],
    ['blocked 0.82', 30, 15, false, 5, true, 0.82, 1.0],
    ['blocked 0.40', 20, 10, false, 0, true, 0.4, 1.0],
    ['rage 1.25', 25, 12, false, 8, false, 0, RAGE_DAMAGE_MULTIPLIER],
    ['rage + crit + block', 25, 12, true, 8, true, 0.65, RAGE_DAMAGE_MULTIPLIER],
  ];

  test('the default traitMult reproduces every existing damage expectation', () => {
    for (const [name, base, str, crit, def, blocked, reduction, rage] of cases) {
      const before = preCh3aDamage(base, str, crit, def, blocked, reduction, rage);
      const omitted = calculateAttackDamage(base, str, crit, def, blocked, reduction, rage);
      const explicit = calculateAttackDamage(base, str, crit, def, blocked, reduction, rage, 1.0);
      expect(omitted, `${name} (default)`).toBe(before);
      expect(explicit, `${name} (1.0)`).toBe(before);
    }
  });

  test('traitMult multiplies at the rage stage', () => {
    const plain = calculateAttackDamage(20, 10, false, 10, false, 0, 1.0, 1.0);
    const boosted = calculateAttackDamage(20, 10, false, 10, false, 0, 1.0, 1.1);
    expect(boosted).toBe(Math.max(1, Math.round(plain * 1.1)));
    // …and it composes with rage rather than replacing it.
    const both = calculateAttackDamage(20, 10, false, 10, false, 0, 1.25, 1.1);
    expect(both).toBe(Math.max(1, Math.round(plain * 1.25 * 1.1)));
  });

  test('it applies before defense mitigation and before block reduction', () => {
    const unblocked = calculateAttackDamage(30, 15, false, 12, false, 0.0, 1.0, 1.2);
    const expected = Math.max(
      1,
      Math.round(30 * (1 + 15 * STRENGTH_BONUS_PER_POINT) * 1.2 * (100 / (100 + 12 * DEFENSE_MITIGATION_FACTOR))),
    );
    expect(unblocked).toBe(expected);
    const blocked = calculateAttackDamage(30, 15, false, 12, true, 0.5, 1.0, 1.2);
    expect(blocked).toBe(Math.max(1, Math.round(expected * 0.5)));
  });

  test('the floor of 1 still holds under a tiny traitMult', () => {
    expect(calculateAttackDamage(1, 1, false, 500, false, 0, 1.0, 0.01)).toBe(1);
    expect(calculateAttackDamage(1, 1, true, 500, true, 0.99, 1.0, 0.5)).toBe(1);
  });

  test('a traitMult below 1 reduces damage (the Heavy Hand case)', () => {
    const plain = calculateAttackDamage(30, 10, false, 5, false, 0);
    const softened = calculateAttackDamage(30, 10, false, 5, false, 0, 1.0, 0.95);
    expect(softened).toBeLessThan(plain);
    expect(softened).toBe(Math.max(1, Math.round(plain * 0.95)));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §W — THE WEAPON STAGE
// ════════════════════════════════════════════════════════════════════════════

describe('CH-3a §W — the weapon stage', () => {
  test('secutor pays 0.85 on POWER attacks only', () => {
    const secutor = modsFor([], 'secutor');
    const base = getStaminaCost(weapon({}), false);
    expect(staminaCostWithModifiers(base, false, secutor)).toBe(Math.round(base * 0.85));
    expect(staminaCostWithModifiers(getStaminaCost(weapon({}), true), true, secutor)).toBe(
      getStaminaCost(weapon({}), true),
    );
  });

  test('Heavy Hand pays 0.90 on POWER attacks only', () => {
    const heavy = modsFor(['heavy_hand']);
    const base = getStaminaCost(weapon({}), false);
    expect(staminaCostWithModifiers(base, false, heavy)).toBe(Math.round(base * 0.9));
    expect(staminaCostWithModifiers(getStaminaCost(weapon({}), true), true, heavy)).toBe(
      getStaminaCost(weapon({}), true),
    );
  });

  test('the two discounts multiply when both are worn', () => {
    const both = modsFor(['heavy_hand'], 'secutor');
    const base = getStaminaCost(weapon({}), false);
    expect(staminaCostWithModifiers(base, false, both)).toBe(Math.round(base * 0.85 * 0.9));
    expect(staminaCostWithModifiers(base, false, both)).toBe(17);
  });

  test('a Murmillo pays the weapon\u2019s own costs (no multiplier)', () => {
    const murmillo = modsFor([]);
    for (const isQuick of [true, false]) {
      expect(staminaCostWithModifiers(getStaminaCost(weapon({}), isQuick), isQuick, murmillo)).toBe(
        getStaminaCost(weapon({}), isQuick),
      );
    }
  });

  test('the shield palma adds its 6 points and the total is capped at 0.90', () => {
    const shielded = modsFor(['shieldwall_discipline']);
    expect(blockReductionFor(0.35, shielded)).toBeCloseTo(0.41, 10);
    expect(blockReductionFor(0.8, shielded)).toBeCloseTo(0.86, 10);
    expect(blockReductionFor(0.85, shielded)).toBe(0.9);
    expect(blockReductionFor(0.35, modsFor([]))).toBe(0.35);
  });

  test('the thraex penetrates 40 % of a block — reduction × 0.6', () => {
    const thraex = modsFor([], 'thraex');
    const defender = modsFor([]);
    expect(blockPenetrationFor(thraex)).toBe(0.4);
    expect(effectiveBlockReduction(0.8, defender, thraex, true)).toBeCloseTo(0.48, 10);
    // Not blocking → the defender's own total, untouched.
    expect(effectiveBlockReduction(0.8, defender, thraex, false)).toBeCloseTo(0.8, 10);
    // Every other class penetrates nothing.
    for (const id of ['murmillo', 'secutor', 'hoplomachus', 'provocator', 'retiarius', 'dimachaerus'] as const) {
      expect(blockPenetrationFor(modsFor([], id)), id).toBe(0);
      expect(effectiveBlockReduction(0.8, defender, modsFor([], id), true)).toBeCloseTo(0.8, 10);
    }
    expect(DOCTRINA_BLOCK_PENETRATION.thraex).toBe(0.4);
  });

  test('penetration and the shield palma compose on the defender side', () => {
    const defender = modsFor(['shieldwall_discipline']);
    const thraex = modsFor([], 'thraex');
    expect(effectiveBlockReduction(0.8, defender, thraex, true)).toBeCloseTo((0.8 + 0.06) * 0.6, 10);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §H — THE HIT STAGE
// ════════════════════════════════════════════════════════════════════════════

describe('CH-3a §H — the hit stage', () => {
  test('Sand Sprinter adds exactly 1 effective AGI', () => {
    const sprinter = modsFor(['sand_sprinter']);
    expect(hitAgilityFor(9, sprinter)).toBe(10);
    expect(hitAgilityFor(9, modsFor([]))).toBe(9);
    for (const isQuick of [true, false]) {
      expect(calculateHitChance(isQuick, hitAgilityFor(9, sprinter), 10)).toBe(
        calculateHitChance(isQuick, 10, 10),
      );
    }
  });

  test('a defender\u2019s hitAgiAdd makes the same attack harder to land', () => {
    const defenderMods = modsFor(['sand_sprinter']);
    const plain = calculateHitChance(true, 10, hitAgilityFor(10, modsFor([])));
    const slippery = calculateHitChance(true, 10, hitAgilityFor(10, defenderMods));
    expect(slippery).toBeLessThan(plain);
    expect(slippery).toBe(calculateHitChance(true, 10, 11));
  });

  test('crit chance is 0.25 by default and 0.25 + critChanceAdd otherwise', () => {
    expect(critChanceFor(modsFor([]))).toBe(0.25);
    expect(critChanceFor(EMPTY_MODIFIERS)).toBe(BASE_CRIT_CHANCE);
    const boosted: FighterModifiers = { ...EMPTY_MODIFIERS, block: { critChanceAdd: 0.1 } };
    expect(critChanceFor(boosted)).toBeCloseTo(0.35, 10);
  });

  test('crit chance is clamped at 0.60 and never negative', () => {
    expect(CRIT_CHANCE_CAP).toBe(0.6);
    expect(critChanceFor({ ...EMPTY_MODIFIERS, block: { critChanceAdd: 0.9 } })).toBe(0.6);
    expect(critChanceFor({ ...EMPTY_MODIFIERS, block: { critChanceAdd: 0.34 } })).toBeCloseTo(0.59, 10);
    expect(critChanceFor({ ...EMPTY_MODIFIERS, block: { critChanceAdd: -2 } })).toBe(0);
  });

  test('no CH-1 row carries critChanceAdd today (identity by data)', () => {
    for (const palma of PALMAE) expect(palma.effect.critChanceAdd, palma.id).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §V — THE EVASION STAGE
// ════════════════════════════════════════════════════════════════════════════

describe('CH-3a §V — the evasion stage', () => {
  test('Untouchable is 4 % out of a dodge stance and 0 inside one', () => {
    const untouchable = modsFor(['untouchable']);
    expect(passiveEvadeChance(untouchable, false)).toBeCloseTo(0.04, 10);
    expect(passiveEvadeChance(untouchable, true)).toBe(0);
  });

  test('a fighter with no passive evade has a 0 % chance, so no draw is ever made', () => {
    expect(passiveEvadeChance(modsFor([]), false)).toBe(0);
    expect(passiveEvadeChance(EMPTY_MODIFIERS, false)).toBe(0);
  });

  test('the chance is clamped into [0, 1]', () => {
    expect(passiveEvadeChance({ ...EMPTY_MODIFIERS, block: { passiveEvadeAdd: 4 } }, false)).toBe(1);
    expect(passiveEvadeChance({ ...EMPTY_MODIFIERS, block: { passiveEvadeAdd: -1 } }, false)).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §P — THE DAMAGE STAGE
// ════════════════════════════════════════════════════════════════════════════

describe('CH-3a §P — the damage stage', () => {
  test('Executioner applies only below 25 % defender health', () => {
    const executioner = modsFor(['executioner']);
    expect(damageDealtMultiplier(executioner, ctx({ defenderHealth: 24, defenderHealthMax: 100 }))).toBeCloseTo(1.1, 10);
    expect(damageDealtMultiplier(executioner, ctx({ defenderHealth: 25, defenderHealthMax: 100 }))).toBe(1);
    expect(damageDealtMultiplier(executioner, ctx({ defenderHealth: 0, defenderHealthMax: 100 }))).toBe(1);
  });

  test('Blood Price applies only while the attacker is below 40 % health', () => {
    const blood = modsFor(['blood_price']);
    expect(damageDealtMultiplier(blood, ctx({ attackerHealth: 39, attackerHealthMax: 100 }))).toBeCloseTo(1.08, 10);
    expect(damageDealtMultiplier(blood, ctx({ attackerHealth: 40, attackerHealthMax: 100 }))).toBe(1);
  });

  test('Colossus Bane applies only against a boss', () => {
    const bane = modsFor(['colossus_bane']);
    expect(damageDealtMultiplier(bane, ctx({ defenderIsBoss: true }))).toBeCloseTo(1.12, 10);
    expect(damageDealtMultiplier(bane, ctx({ defenderIsBoss: false }))).toBe(1);
  });

  test('Heavy Hand\u2019s 5 % penalty is power-only', () => {
    const heavy = modsFor(['heavy_hand']);
    expect(damageDealtMultiplier(heavy, ctx({ isQuick: false }))).toBeCloseTo(0.95, 10);
    expect(damageDealtMultiplier(heavy, ctx({ isQuick: true }))).toBe(1);
  });

  test('Colossus Hide takes 8 % less from quick attacks only', () => {
    const hide: FighterModifiers = { ...EMPTY_MODIFIERS, palmae: [getPalma('colossus_hide')!] };
    expect(damageTakenMultiplier(hide, ctx({ isQuick: true }))).toBeCloseTo(0.92, 10);
    expect(damageTakenMultiplier(hide, ctx({ isQuick: false }))).toBe(1);
  });

  test('Mirror Drill takes 8 % less from a type only AFTER its first hit', () => {
    const provocator = modsFor([], 'provocator');
    // First hit of each type: full damage.
    expect(damageTakenMultiplier(provocator, ctx({ isQuick: true }))).toBe(1);
    expect(damageTakenMultiplier(provocator, ctx({ isQuick: false }))).toBe(1);
    // After a light hit, light is reduced and power is still full.
    const lightSeen = { light: true } as const;
    expect(damageTakenMultiplier(provocator, ctx({ isQuick: true, defenderTypesHit: lightSeen }))).toBeCloseTo(0.92, 10);
    expect(damageTakenMultiplier(provocator, ctx({ isQuick: false, defenderTypesHit: lightSeen }))).toBe(1);
    const bothSeen = { light: true, power: true } as const;
    expect(damageTakenMultiplier(provocator, ctx({ isQuick: false, defenderTypesHit: bothSeen }))).toBeCloseTo(0.92, 10);
  });

  test('recordHitType never mutates the ledger it is handed', () => {
    const first = recordHitType(undefined, true);
    expect(first).toEqual({ light: true });
    const second = recordHitType(first, false);
    expect(second).toEqual({ light: true, power: true });
    expect(first).toEqual({ light: true });
    expect(recordHitType(second, true)).toEqual({ light: true, power: true });
  });

  test('Spearman\u2019s Ground uses the design\u2019s two bands and a neutral middle', () => {
    // Outer third of reach (ratio >= 2/3): +15%.
    expect(spearmansGroundMult(2.5, 2.5)).toBeCloseTo(1.15, 10); // on the point
    expect(spearmansGroundMult(2, 3)).toBeCloseTo(1.15, 10); // ratio exactly 2/3
    expect(spearmansGroundMult(1.875, 2.5)).toBeCloseTo(1.15, 10); // ratio 0.75
    // Between half and two-thirds reach: no modifier.
    expect(spearmansGroundMult(1.65, 2.5)).toBeCloseTo(1, 10); // ratio 0.66
    expect(spearmansGroundMult(1.25, 2.5)).toBeCloseTo(1, 10); // ratio exactly 0.50
    // Inside half reach: −10%.
    expect(spearmansGroundMult(1.225, 2.5)).toBeCloseTo(0.9, 10); // ratio 0.49
    // Unusable inputs stay neutral.
    expect(spearmansGroundMult(Number.NaN, 2.5)).toBe(1);
    expect(spearmansGroundMult(1, 0)).toBe(1);
    expect(SPEARMANS_GROUND_BANDS.map((b) => b.minRatio)).toEqual([2 / 3, 0.5, 0]);
    expect(SPEARMANS_GROUND_BANDS.map((b) => b.mult)).toEqual([1.15, 1, 0.9]);
  });

  test('only the hoplomachus gets the distance bands', () => {
    for (const id of ['murmillo', 'thraex', 'secutor', 'provocator', 'retiarius', 'dimachaerus'] as const) {
      expect(damageDealtMultiplier(modsFor([], id), ctx({ distance: 2.5, effectiveRange: 2.5 })), id).toBe(1);
    }
    expect(
      damageDealtMultiplier(modsFor([], 'hoplomachus'), ctx({ distance: 2.5, effectiveRange: 2.5 })),
    ).toBeCloseTo(1.15, 10);
  });

  test('resolveTraitMult divides what is dealt by what is taken', () => {
    const attacker = modsFor(['executioner']);
    const defender: FighterModifiers = { ...EMPTY_MODIFIERS, palmae: [getPalma('colossus_hide')!] };
    const context = ctx({ isQuick: true, defenderHealth: 10, defenderHealthMax: 100 });
    expect(resolveTraitMult(attacker, defender, context)).toBeCloseTo(1.1 / 0.92, 10);
  });

  test('a degenerate denominator never produces a nonsense multiplier', () => {
    const zero: FighterModifiers = { ...EMPTY_MODIFIERS, doctrina: { damageTakenMult: 0 } };
    expect(resolveTraitMult(EMPTY_MODIFIERS, zero, ctx())).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §E — THE EVENT STAGE
// ════════════════════════════════════════════════════════════════════════════

describe('CH-3a §E — applyPalmaEvent', () => {
  test('a block recovers the Fish-Scale Wall\u2019s 6 stamina', () => {
    expect(applyPalmaEvent(modsFor([]).block, 'block')).toEqual({
      staminaAdd: 6,
      hypeAdd: 0,
      comboShield: false,
    });
  });

  test('rest recovers Second Wind\u2019s extra 15', () => {
    expect(applyPalmaEvent(modsFor(['second_wind']).block, 'rest').staminaAdd).toBe(15);
    expect(applyPalmaEvent(EMPTY_MODIFIERS.block, 'rest').staminaAdd).toBe(0);
  });

  test('taunts AND crits both carry First Palm\u2019s 4 hype', () => {
    const firstPalm = modsFor(['first_palm_of_the_crowd']).block;
    expect(applyPalmaEvent(firstPalm, 'taunt').hypeAdd).toBe(4);
    expect(applyPalmaEvent(firstPalm, 'crit').hypeAdd).toBe(4);
    expect(applyPalmaEvent(firstPalm, 'block').hypeAdd).toBe(0);
  });

  test('a miss reports the combo shield, and only Phoenix Nerves sets it', () => {
    expect(applyPalmaEvent(modsFor(['phoenix_nerves']).block, 'miss').comboShield).toBe(true);
    expect(applyPalmaEvent(modsFor([]).block, 'miss').comboShield).toBe(false);
    expect(applyPalmaEvent(EMPTY_MODIFIERS.block, 'miss')).toEqual({
      staminaAdd: 0,
      hypeAdd: 0,
      comboShield: false,
    });
  });

  test('the helper is pure: it mutates nothing and reads garbage as identity', () => {
    const block = { onBlockStamina: 6, hypeAdd: 4 };
    const frozen = Object.freeze({ ...block });
    applyPalmaEvent(frozen, 'block');
    expect(frozen).toEqual(block);
    const junk = { onBlockStamina: Number.NaN, hypeAdd: Number.POSITIVE_INFINITY } as never;
    expect(applyPalmaEvent(junk, 'block').staminaAdd).toBe(0);
    expect(applyPalmaEvent(junk, 'crit').hypeAdd).toBe(0);
    expect(applyPalmaEvent(null, 'rest').staminaAdd).toBe(0);
    expect(applyPalmaEvent(undefined, 'miss').comboShield).toBe(false);
  });

  test('the stamina the event adds is clamped by the shipped regen helper', () => {
    const max = 120;
    expect(applyStaminaRegen(118, max, applyPalmaEvent(modsFor([]).block, 'block').staminaAdd)).toBe(max);
    expect(applyStaminaRegen(100, max, 6)).toBe(106);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §R — THE FIXED-SEED PRE-CH-3a REGRESSION
// ════════════════════════════════════════════════════════════════════════════

describe('CH-3a §R — fixed-seed pre-CH-3a regression', () => {
  const SEEDS = [1, 7, 42, 1337, 90001, 271828];

  const attackerStats: FighterStats = {
    strength: 12, agility: 9, stamina: 10, staminaMax: 120, staminaRegen: 24, defense: 6, healthMax: 140,
  };
  const defenderStats: FighterStats = {
    strength: 10, agility: 11, stamina: 10, staminaMax: 120, staminaRegen: 24, defense: 5, healthMax: 138,
  };

  test('R1 — two EMPTY modifier blocks reproduce the pre-CH-3a trace exactly', () => {
    for (const seed of SEEDS) {
      const attacker = fighter(attackerStats, weapon({}));
      const defender = fighter(defenderStats, weapon({ blockReduction: 0.75 }));

      const reference = scriptedDuel(seed, 120, { attacker, defender, reference: true });
      const shipped = scriptedDuel(seed, 120, {
        attacker,
        defender,
        attackerMods: EMPTY_MODIFIERS,
        defenderMods: EMPTY_MODIFIERS,
      });
      expect(shipped, `seed ${seed}`).toEqual(reference);
    }
  });

  test('R2 — a Murmillo with empty palmae reproduces the pre-CH-3a damage and HP trace', () => {
    const murmurillo = buildPlayerModifiers(createNewProfile('Murmillo'));

    for (const seed of SEEDS) {
      const player = fighter(attackerStats, weapon({ blockReduction: 0.75 }));
      const opponent = fighter(defenderStats, weapon({ blockReduction: 0.7 }));

      const reference = scriptedDuel(seed, 120, { attacker: player, defender: opponent, reference: true });
      const shipped = scriptedDuel(seed, 120, {
        attacker: player,
        defender: opponent,
        attackerMods: murmurillo,
        defenderMods: EMPTY_MODIFIERS,
      });

      // Every damage / hit / crit / HP figure is identical …
      const damageView = (trace: typeof reference) =>
        trace.map((e) => ({
          isQuick: e.isQuick,
          hitPct: e.hitPct,
          roll: e.roll,
          crit: e.crit,
          blocked: e.blocked,
          damage: e.damage,
          defenderHealth: e.defenderHealth,
        }));
      expect(damageView(shipped), `seed ${seed}`).toEqual(damageView(reference));
    }
  });

  test('R2 — the only intentional delta is Fish-Scale Wall\u2019s +6 per blocked hit', () => {
    const murmurillo = buildPlayerModifiers(createNewProfile('Murmillo'));
    const seed = 42;
    const player = fighter(attackerStats, weapon({ blockReduction: 0.75 }));
    const opponent = fighter(defenderStats, weapon({ blockReduction: 0.7 }));

    const trace = scriptedDuel(seed, 120, {
      attacker: player,
      defender: opponent,
      attackerMods: murmurillo,
      defenderMods: EMPTY_MODIFIERS,
    });

    let stamina = defenderStats.staminaMax;
    for (const entry of trace) {
      if (entry.blocked && (entry.damage as number) > 0) {
        stamina = applyStaminaRegen(stamina, defenderStats.staminaMax, applyPalmaEvent(murmurillo.block, 'block').staminaAdd);
      }
    }
    const blockedHits = trace.filter((e) => e.blocked && (e.damage as number) > 0).length;
    expect(blockedHits).toBeGreaterThan(0);
    expect(stamina).toBe(Math.min(defenderStats.staminaMax, defenderStats.staminaMax + blockedHits * 6));
  });

  test('a palma that changes nothing at these conditions leaves the trace intact', () => {
    const seed = 1337;
    const player = fighter(attackerStats, weapon({}));
    const opponent = fighter(defenderStats, weapon({}));
    const reference = scriptedDuel(seed, 80, { attacker: player, defender: opponent, reference: true });
    // Colossus Bane needs a boss; there is none here, so it is the identity.
    const bane = scriptedDuel(seed, 80, {
      attacker: player,
      defender: opponent,
      attackerMods: modsFor(['colossus_bane']),
      defenderMods: EMPTY_MODIFIERS,
    });
    expect(bane).toEqual(reference);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §A — THE TWO ACCEPTANCE DUELS
// ════════════════════════════════════════════════════════════════════════════

describe('CH-3a §A — acceptance duels', () => {
  test('A1 — a blocking Murmillo gains +6 stamina for every blocked hit', () => {
    const murmurillo = buildPlayerModifiers(createNewProfile('Murmillo'));
    const defenderStats: FighterStats = {
      strength: 10, agility: 10, stamina: 10, staminaMax: 120, staminaRegen: 24, defense: 6, healthMax: 138,
    };
    let stamina = 90;

    for (let hit = 1; hit <= 10; hit += 1) {
      const gain = applyPalmaEvent(murmurillo.block, 'block').staminaAdd;
      expect(gain, `blocked hit ${hit}`).toBe(6);
      stamina = applyStaminaRegen(stamina, defenderStats.staminaMax, gain);
      expect(stamina, `blocked hit ${hit}`).toBe(Math.min(defenderStats.staminaMax, 90 + hit * 6));
    }
    // Ten blocked hits would be +60; the maximum is the ceiling at 120.
    expect(stamina).toBe(120);
    expect(applyStaminaRegen(118, defenderStats.staminaMax, 6)).toBe(120);
  });

  test('A1 — the same block through the damage pipeline: blocked, then stamina credited', () => {
    const murmurillo = buildPlayerModifiers(createNewProfile('Murmillo'));
    const attackerStats: FighterStats = {
      strength: 10, agility: 10, stamina: 10, staminaMax: 120, staminaRegen: 24, defense: 6, healthMax: 138,
    };
    const defender = fighter(attackerStats, weapon({ blockReduction: 0.75 }));
    defender.isBlocking = true;
    const rng = makeRng(5);
    const outcome = resolveStrike(rng, fighter(attackerStats, weapon({})), defender, {
      attackerMods: EMPTY_MODIFIERS,
      defenderMods: murmurillo,
      isQuick: true,
    });
    expect(outcome.damage).toBeGreaterThan(0); // chip damage through the block
    const before = 100;
    expect(applyStaminaRegen(before, attackerStats.staminaMax, applyPalmaEvent(murmurillo.block, 'block').staminaAdd)).toBe(106);
  });

  test('A2 — a Thraex hit into a block deals blockReduction × 0.6', () => {
    const thraex = buildPlayerModifiers({ ...createNewProfile('Thraex'), armatura: 'thraex' });
    const defenderMods = EMPTY_MODIFIERS;
    const weaponItem = weapon({ blockReduction: 0.8, damageHeavy: 30 });
    const attackerStats: FighterStats = {
      strength: 10, agility: 12, stamina: 10, staminaMax: 120, staminaRegen: 24, defense: 3, healthMax: 138,
    };
    const defenderStats: FighterStats = {
      strength: 10, agility: 9, stamina: 10, staminaMax: 120, staminaRegen: 24, defense: 5, healthMax: 138,
    };

    const effective = effectiveBlockReduction(weaponItem.blockReduction, defenderMods, thraex, true);
    expect(effective).toBeCloseTo(0.48, 10);

    const withPenetration = calculateAttackDamage(
      30, attackerStats.strength, false, defenderStats.defense, true, effective, 1.0,
      resolveTraitMult(thraex, defenderMods, ctx({ isQuick: false })),
    );
    const unblocked = calculateAttackDamage(30, attackerStats.strength, false, defenderStats.defense, false, 0, 1.0);
    const withoutPenetration = calculateAttackDamage(
      30, attackerStats.strength, false, defenderStats.defense, true, 0.8, 1.0,
    );

    // Consistent with blockReduction × 0.6: the thraex keeps 40 % of the block.
    expect(withPenetration).toBe(Math.max(1, Math.round(unblocked * (1 - 0.48))));
    expect(withPenetration).toBeGreaterThan(withoutPenetration);
    // …and a murmillo hitting the same block gets the plain 0.8 reduction.
    const murmillo = modsFor([]);
    expect(
      calculateAttackDamage(30, attackerStats.strength, false, defenderStats.defense, true, effectiveBlockReduction(0.8, defenderMods, murmillo, true), 1.0),
    ).toBe(withoutPenetration);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §X — THE WIRING, READ OUT OF THE SOURCES
// ════════════════════════════════════════════════════════════════════════════

describe('CH-3a §X — wiring', () => {
  const duel = code('src/components/duel/DuelScene.tsx');
  const panel = code('src/components/ui/TurnActionPanel.tsx');
  const hud = code('src/components/ui/CombatHUD.tsx');
  const calc = code('src/utils/combatCalculations.ts');

  test('DuelScene builds each fighter\u2019s block once and reads it every stage', () => {
    expect(duel).toContain('buildPlayerModifiers(playerProfile)');
    expect(duel).toContain('buildOpponentModifiers(opponent)');
    expect(duel).toContain('useMemo(');
    for (const call of [
      'staminaCostWithModifiers(',
      'hitAgilityFor(',
      'critChanceFor(',
      'effectiveBlockReduction(',
      'resolveTraitMult(',
      'passiveEvadeChance(',
      'recordHitType(',
    ]) {
      expect(duel, call).toContain(call);
    }
    expect(duel).toContain('applyPalmaEvent(');
    for (const event of ["'block'", "'rest'", "'taunt'", "'crit'", "'miss'"]) {
      expect(duel, event).toContain(event);
    }
  });

  test('the AI branch still reads the RAW stamina costs and chooseAIStandardAction', () => {
    expect(duel).toContain('chooseAIStandardAction(opponent.aggression, opponent.blockChance)');
    expect(duel).toContain('const oppLightCost = getStaminaCost(opp.loadout.weapon, true);');
    expect(duel).toContain('const oppHeavyCost = getStaminaCost(opp.loadout.weapon, false);');
    expect(calc).toContain('export function chooseAIStandardAction(');
  });

  test('the HUD is handed the same blocks and no longer estimates from raw fields', () => {
    expect(duel).toContain('playerModifiers={playerMods}');
    expect(duel).toContain('opponentModifiers={opponentMods}');
    expect(hud).toContain('playerModifiers={playerModifiers}');
    expect(hud).toContain('opponentModifiers={opponentModifiers}');
    expect(panel).toContain('staminaCostWithModifiers(');
    expect(panel).toContain('hitAgilityFor(');
    expect(panel).toContain('resolveTraitMult(');
    expect(panel).toContain('blockReductionFor(');
    // The raw-field estimates are gone: the costs and the absorb read the block.
    expect(panel).not.toContain('const quickStaminaCost = getStaminaCost(weapon, true);');
    expect(panel).not.toContain('Math.round(weapon.blockReduction * 100)');
  });

  test('combatCalculations keeps its frozen formulas and gains only the two additions', () => {
    expect(calc).toContain('export const DEFENSE_MITIGATION_FACTOR = 2.5;');
    expect(calc).toContain('export const STRENGTH_BONUS_PER_POINT = 0.05;');
    expect(calc).toContain('export const CRIT_MULTIPLIER = 1.5;');
    expect(calc).toContain('export const RAGE_DAMAGE_MULTIPLIER = 1.25;');
    // One optional trailing parameter, multiplied at the rage stage.
    expect(calc).toContain('traitMult: number = 1.0,');
    expect(calc).toContain('* rageMultiplier * traitMult;');
    // …and the one new helper, beside applyComboEvent.
    expect(calc).toContain('export function applyPalmaEvent(');
    expect(calc.indexOf('export function applyPalmaEvent(')).toBeGreaterThan(
      calc.indexOf('export function applyComboEvent('),
    );
  });

  test('no new action was added to the duel\u2019s action set', () => {
    expect(panel).toContain("export type CombatActionType =");
    for (const action of ['quick_attack', 'power_attack', 'shield_block', 'dodge', 'advance', 'retreat', 'taunt', 'rest', 'telegraph']) {
      expect(panel, action).toContain(`'${action}'`);
    }
  });
});
