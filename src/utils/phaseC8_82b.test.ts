/**
 * Defense stance parity — C-8.82B.
 *
 * The C-8.82A audit found that Shield Guard strictly dominated Dodge for every
 * shield configuration in the roster. The two stances answer the SAME mitigated
 * blow, so the comparison is arithmetic, not judgement:
 *
 *   expected damage, Guard = hit% × calculateAttackDamage(base, str, false, def, TRUE,  weapon.blockReduction)
 *   expected damage, Dodge = hit% × (1 − DODGE_EVADE_CHANCE) × calculateAttackDamage(base, str, false, def, false, 0)
 *
 * The hit% multiplies both identically, so the verdict is decided by
 * `(1 − evade)` against `(1 − blockReduction)`. At the old 0.75 the roster's
 * shields (gladius 0.82, shamshir 0.80, spatha 0.85) passed LESS damage through
 * than a dodge avoided — and the guard also recovered stamina on a stopped blow —
 * so a dodge was worse on damage AND on stamina: strict dominance.
 *
 * This suite pins the correction (the shared `DODGE_EVADE_CHANCE`, 0.88) and the
 * invariants it must not disturb:
 *
 *   §A one source of truth — the constant, and every display/copy derived from it
 *   §B the roster-wide trade-off — ALL_WEAPONS × the opponent weapon set, no dominance
 *   §C the meaningful benefit — the roster's heaviest attack, before/after
 *   §D the resource economy — Guard ≥ 0, Dodge exactly −12, charged once
 *   §E untouched rules — timings, range/affordability order, hit/crit/str/rage,
 *      damage, rewards, AI weights
 *   §F C-8.81D's attack-contact constants and their production consumer
 *
 * Defender parameters are the ones the C-8.72B defensive-balance record
 * documents (helm_centurion + full plate): `defense 42`, `agility 16`,
 * `staminaRegen 31.9`, against an attacker of `strength 12`, `agility 14`
 * (58 % heavy / 82 % quick hit chance). Every figure comes from the shipped
 * functions — no formula is restated here.
 *
 * Run with: bun test src/utils/phaseC8_82b.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  AI_FALLBACK_THRESHOLDS,
  CRIT_MULTIPLIER,
  DEFENSE_MITIGATION_FACTOR,
  DODGE_EVADE_CHANCE,
  DODGE_EVADE_PERCENT,
  DODGE_STAMINA_COST,
  ENEMY_ATTACK_WINDUP_MS,
  PLAYER_ATTACK_WINDUP_MS,
  RAGE_DAMAGE_MULTIPLIER,
  SHIELD_GUARD_REGEN_MULTIPLIER,
  STRENGTH_BONUS_PER_POINT,
  applyStaminaRegen,
  calculateAttackDamage,
  calculateHitChance,
  chooseAIOutOfRangeAction,
  chooseAIStandardAction,
  shieldGuardStaminaGain,
} from './combatCalculations';
import { ALL_OPPONENTS } from '../data/opponents';
import { ALL_WEAPONS, getWeaponByType } from '../data/itemsDB';
import type { WeaponItem } from '../types/game';
import { calculateDuelGold } from './duelRewards';
import { resolveReactionCue } from './pendingStrike';
import {
  ATTACK_CLIP_CONTACT_MS,
  ATTACK_FRAME_MS,
  ATTACK_CLIP_START_LAG_MS,
  HIT_STOP_SAMPLE_LAG_MS,
  attackContactWindowMs,
  attackPlaybackRateForAction,
} from './attackContact';

const duelSource = readFileSync(
  new URL('../components/duel/DuelScene.tsx', import.meta.url),
  'utf8',
);
const panelSource = readFileSync(
  new URL('../components/ui/TurnActionPanel.tsx', import.meta.url),
  'utf8',
);
const hudSource = readFileSync(
  new URL('../components/ui/CombatHUD.tsx', import.meta.url),
  'utf8',
);
const helpSource = readFileSync(
  new URL('../components/hub/HelpModal.tsx', import.meta.url),
  'utf8',
);

/** The documented defender (C-8.72B's shield build) and attacker. */
const DEFENDER = { defense: 42, agility: 16, staminaRegen: 31.9 } as const;
const ATTACKER = { strength: 12, agility: 14 } as const;

/** Every weapon type the opponent roster actually fields. */
const OPPONENT_WEAPON_TYPES = [...new Set(ALL_OPPONENTS.map((o) => o.weaponType))];
const OPPONENT_WEAPONS: WeaponItem[] = OPPONENT_WEAPON_TYPES.map((type) =>
  getWeaponByType(type),
);

/** Damage a blow of `base` does when it lands unguarded (defence only). */
const openDamage = (base: number): number =>
  calculateAttackDamage(base, ATTACKER.strength, false, DEFENDER.defense, false, 0, 1);

/** Damage a blow of `base` does when the defender's guard stops it. */
const guardDamage = (base: number, weapon: WeaponItem): number =>
  calculateAttackDamage(
    base,
    ATTACKER.strength,
    false,
    DEFENDER.defense,
    true,
    weapon.blockReduction,
    1,
  );

/** Expected damage of a dodge at `rate`: a failed evade lands UNMITIGATED. */
const dodgeDamage = (base: number, rate: number): number => (1 - rate) * openDamage(base);

interface Config {
  defender: WeaponItem;
  attacker: WeaponItem;
  kind: 'quick' | 'heavy';
  base: number;
  guard: number;
  dodge: number;
}

/** The whole roster matrix at a given evade rate. */
function matrix(rate: number): Config[] {
  const rows: Config[] = [];
  for (const defender of ALL_WEAPONS) {
    for (const attacker of OPPONENT_WEAPONS) {
      for (const [kind, base] of [
        ['quick', attacker.damageLight],
        ['heavy', attacker.damageHeavy],
      ] as const) {
        rows.push({
          defender,
          attacker,
          kind,
          base,
          guard: guardDamage(base, defender),
          dodge: dodgeDamage(base, rate),
        });
      }
    }
  }
  return rows;
}

/** A configuration's relative benefit of dodging over guarding. */
const gainOverGuard = (row: Config): number => (row.guard - row.dodge) / row.guard;

// ── §A. One source of truth ────────────────────────────────────────────────

describe('§A — the evade chance lives in one constant and every display derives from it', () => {
  test('the audited rate is 0.88, with a derived whole percentage', () => {
    expect(DODGE_EVADE_CHANCE).toBe(0.88);
    expect(DODGE_EVADE_PERCENT).toBe(88);
    expect(DODGE_EVADE_PERCENT).toBe(Math.round(DODGE_EVADE_CHANCE * 100));
    // Still a chance, not a guarantee: a dodge can fail.
    expect(DODGE_EVADE_CHANCE).toBeLessThan(1);
    expect(DODGE_EVADE_CHANCE).toBeGreaterThan(0.5);
  });

  test('the resolution rolls the shared constant, never a literal', () => {
    expect(duelSource).toContain(
      'const isEvaded = defender.isInvulnerable && Math.random() < DODGE_EVADE_CHANCE;',
    );
    // A hardcoded rate cannot come back without failing here.
    expect(duelSource).not.toMatch(/isInvulnerable && Math\.random\(\) < 0\.\d+/);
    expect(duelSource).not.toContain('Math.random() < 0.75');
  });

  test('the tactic panel prints both of Dodge’s numbers from the constants', () => {
    expect(panelSource).toContain('{DODGE_EVADE_PERCENT}% chance to evade');
    expect(panelSource).toContain('{DODGE_EVADE_PERCENT}% Evade');
    expect(panelSource).toContain('DODGE_STAMINA_COST');
    expect(panelSource).not.toMatch(/\d+% (chance to )?evade/i);
  });

  test('the manual prints the chance from the constant and keeps its other claims', () => {
    expect(helpSource).toContain('{DODGE_EVADE_PERCENT}% chance to evade');
    expect(helpSource).not.toMatch(/\d+% chance to evade/);
    expect(helpSource).toContain('Cost: 12 SP');
    expect(helpSource).toContain('whether the dodge succeeds or fails');
    expect(helpSource).toContain('a failed dodge still takes the damage');
    // The guard's own entry states its mitigation rule, so the pair reads as a choice.
    expect(helpSource).toContain('damage is cut by your weapon');
  });

  test('the manual never prints a universal guard mitigation', () => {
    // C-8.82C — Guard's cut IS the equipped weapon's blockReduction, which spans
    // 0.35–0.85 across the roster, so a fixed figure in the manual would be wrong
    // for most of it. The manual states the rule and leaves the number to the
    // tactic panel and the HUD, which both read the active weapon.
    expect(helpSource).not.toMatch(/\b(?:3[5-9]|[4-8]\d)% ?(?:absorb|absorbed|cut|blocked|reduced)/i);
    // And it keeps the one claim that separates the free guard from the paid dodge.
    expect(helpSource).toContain('costs nothing');
  });

  test('the reaction row offers both stances with their real odds', () => {
    expect(hudSource).toContain('{DODGE_EVADE_PERCENT}% evade');
    expect(hudSource).toContain('{guardMitigationPct}% cut · no cost');
    expect(hudSource).toContain('Math.round((player.loadout?.weapon?.blockReduction ?? 0) * 100)');
    expect(hudSource).not.toMatch(/\d+% evade/);
  });

  test('the claimed-reaction cue names the stance, its odds and its cost', () => {
    const cue = resolveCue('dodge');
    expect(cue.toLowerCase()).toContain('dodge');
    expect(cue).toContain(`${DODGE_EVADE_PERCENT}%`);
    expect(cue).toContain(`${DODGE_STAMINA_COST} SP`);
    expect(cue.toLowerCase()).toContain('chance to slip the blow');
    // No overclaim: the dodge is a chance, never an immunity.
    for (const word of ['guarantee', 'certain', 'always', 'will evade', 'immune', 'no damage']) {
      expect(cue.toLowerCase()).not.toContain(word);
    }
    // And it may not claim a guard that was never raised.
    expect(cue.toLowerCase()).not.toContain('guard');
  });

  test('the guard cue names its mitigation when the weapon is supplied', () => {
    const withWeapon = resolveCue('shield_block', ALL_WEAPONS[0]);
    const without = resolveCue('shield_block');
    expect(withWeapon.toLowerCase()).toContain('guard');
    expect(withWeapon.toLowerCase()).toContain('reduced');
    expect(withWeapon).toContain(
      `${Math.round(ALL_WEAPONS[0].blockReduction * 100)}% absorbed by the shield`,
    );
    expect(without).toContain('reduced force');
    expect(without).not.toContain('%');
    // Neither line may borrow the other stance's vocabulary.
    for (const label of [withWeapon, without]) {
      expect(label.toLowerCase()).not.toContain('dodge');
      expect(label.toLowerCase()).not.toContain('evade');
    }
  });
});

/** The shipped cue's label, resolved the way `CombatHUD` does it. */
function resolveCue(reaction: 'dodge' | 'shield_block', weapon?: WeaponItem): string {
  return resolveReactionCue(reaction, weapon?.blockReduction)!.label;
}

// ── §B. The roster-wide trade-off ──────────────────────────────────────────

describe('§B — every weapon in the roster trades Dodge’s stamina for less damage', () => {
  test('the opponent weapon set is the roster’s own four types', () => {
    expect(OPPONENT_WEAPON_TYPES.length).toBe(4);
    expect(OPPONENT_WEAPON_TYPES.sort()).toEqual(
      ['dual_blades', 'mace', 'spear', 'sword_shield'].sort(),
    );
    expect(OPPONENT_WEAPONS.map((w) => w.id)).toEqual([
      'gladius_standard',
      'dual_sicae_daggers',
      'bronze_mace',
      'hoplite_spear',
    ]);
    // ALL_WEAPONS is the defender roster; keep the matrix honest about its size.
    expect(ALL_WEAPONS.length).toBe(15);
  });

  test('the structural rule: the evade rate beats the best shield in the roster', () => {
    const bestBlock = Math.max(...ALL_WEAPONS.map((w) => w.blockReduction));
    expect(bestBlock).toBe(0.85);
    // `(1 − evade) < (1 − block)` is the whole trade-off, solved.
    expect(1 - DODGE_EVADE_CHANCE).toBeLessThan(1 - bestBlock);
  });

  test('no configuration makes Dodge worse on damage than Shield Guard (0 of 88)', () => {
    const rows = matrix(DODGE_EVADE_CHANCE);
    expect(rows.length).toBe(ALL_WEAPONS.length * OPPONENT_WEAPONS.length * 2);
    const dominated = rows.filter((row) => row.dodge >= row.guard);
    expect(dominated.map((r) => `${r.defender.id}/${r.attacker.id}/${r.kind}`)).toEqual([]);
    // Strictly better on damage for every one of them, and worse on stamina for
    // every one of them (see §D): a real trade-off, not a tie.
    for (const row of rows) {
      expect(row.dodge).toBeLessThan(row.guard);
    }
  });

  test('the pre-fix 0.75 DID dominate — 30 of 88 configurations', () => {
    const legacy = matrix(0.75);
    const dominated = legacy.filter((row) => row.dodge >= row.guard);
    expect(dominated.length).toBe(30);
    // The worst case was the spatha's guard against a standard gladius heavy.
    const worst = legacy
      .map((row) => ({ row, gain: gainOverGuard(row) }))
      .sort((a, b) => a.gain - b.gain)[0];
    expect(worst.row.defender.id).toBe('spatha_legion');
    expect(worst.gain * 100).toBeCloseTo(-66.6667, 3);
  });

  test('light weapons keep the trade-off the right way round — a bigger, not smaller, dodge dividend', () => {
    const rows = matrix(DODGE_EVADE_CHANCE);
    const lightWeapons = ALL_WEAPONS.filter((w) => w.blockReduction < 0.5);
    const shieldWeapons = ALL_WEAPONS.filter((w) => w.blockReduction >= 0.75);
    expect(lightWeapons.length).toBe(5);
    expect(shieldWeapons.length).toBe(4);

    const minLight = Math.min(
      ...rows.filter((r) => r.defender.blockReduction < 0.5).map(gainOverGuard),
    );
    const maxShield = Math.max(
      ...rows.filter((r) => r.defender.blockReduction >= 0.75).map(gainOverGuard),
    );
    // The lighter the guard, the more a dodge is worth — never the reverse.
    // Measured: the worst light build (dual_vipers 0.48, against the hoplite's
    // quick thrust) still gains 76.0 %, while the best shield entry
    // (titan_colossus_mace 0.75, against the gladius' quick thrust) gains 56.0 %.
    expect(minLight * 100).toBeCloseTo(76.0, 1);
    expect(maxShield * 100).toBeCloseTo(56.0, 1);
    expect(minLight).toBeGreaterThan(maxShield);
    expect(minLight).toBeGreaterThan(0.4);

    // Concretely, the roster's lightest guard against the heaviest opponent blow.
    const pugio = ALL_WEAPONS.find((w) => w.id === 'dagger_pugio')!;
    expect(guardDamage(42, pugio)).toBe(21);
    expect(dodgeDamage(42, DODGE_EVADE_CHANCE)).toBeCloseTo(3.96, 10);
  });
});

// ── §C. The meaningful benefit ─────────────────────────────────────────────

describe('§C — on the heaviest attack, Dodge measurably cuts the damage Guard leaves', () => {
  test('the opponent roster’s heaviest blow: ≥ 15 % off Guard for every defender weapon', () => {
    const heaviest = Math.max(...OPPONENT_WEAPONS.map((w) => w.damageHeavy));
    expect(heaviest).toBe(42);
    const measured = ALL_WEAPONS.map((defender) => {
      const guard = guardDamage(heaviest, defender);
      const dodge = dodgeDamage(heaviest, DODGE_EVADE_CHANCE);
      return { id: defender.id, guard, dodge, gain: (guard - dodge) / guard };
    });
    for (const row of measured) {
      expect(row.gain).toBeGreaterThanOrEqual(0.15);
    }
    const worst = measured.sort((a, b) => a.gain - b.gain)[0];
    expect(worst.id).toBe('spatha_legion');
    // spatha 0.85: 5 damage guarded, 3.96 expected from a dodge.
    expect(worst.guard).toBe(5);
    expect(worst.dodge).toBeCloseTo(3.96, 10);
    expect(worst.gain * 100).toBeCloseTo(20.8, 1);
  });

  test('the roster’s heaviest attack overall (72) clears the same bar, before → after', () => {
    const base = Math.max(...ALL_WEAPONS.map((w) => w.damageHeavy));
    expect(base).toBe(72);
    const spatha = ALL_WEAPONS.find((w) => w.id === 'spatha_legion')!;
    const gladius = ALL_WEAPONS.find((w) => w.id === 'gladius_standard')!;

    // after: 0.88
    expect(dodgeDamage(base, DODGE_EVADE_CHANCE)).toBeCloseTo(6.72, 10);
    expect(guardDamage(base, spatha)).toBe(8);
    expect(guardDamage(base, gladius)).toBe(10);
    expect(((8 - 6.72) / 8) * 100).toBeCloseTo(16.0, 1);
    expect(((10 - 6.72) / 10) * 100).toBeCloseTo(32.8, 1);

    // before: 0.75 — the same dodge was WORSE than the same guard.
    expect(dodgeDamage(base, 0.75)).toBeCloseTo(14.0, 10);
    expect(((8 - 14) / 8) * 100).toBeCloseTo(-75.0, 1);

    // Every defender weapon clears the 15 % bar at 72 as well.
    for (const defender of ALL_WEAPONS) {
      const guard = guardDamage(base, defender);
      expect((guard - dodgeDamage(base, DODGE_EVADE_CHANCE)) / guard).toBeGreaterThanOrEqual(0.15);
    }
  });
});

// ── §D. The resource economy ───────────────────────────────────────────────

describe('§D — Guard never loses stamina, Dodge pays exactly 12', () => {
  const heavyHit = calculateHitChance(false, ATTACKER.agility, DEFENDER.agility);

  test('the documented hit chance and the guard’s expected credit', () => {
    expect(heavyHit).toBe(58);
    const credit = shieldGuardStaminaGain(true, DEFENDER.staminaRegen, true);
    expect(credit).toBeCloseTo(15.95, 10);
    // Expected stamina per heavy defensive turn: +9.25 (guard) vs −12 (dodge).
    expect((heavyHit / 100) * credit).toBeCloseTo(9.251, 3);
    expect((heavyHit / 100) * credit).toBeGreaterThan(0);
    expect(-DODGE_STAMINA_COST).toBe(-12);
  });

  test('the credit is non-negative for every regen, and only on a stopped blow', () => {
    for (const regen of [0, 1, 5, 24, DEFENDER.staminaRegen, 100]) {
      expect(shieldGuardStaminaGain(true, regen, true)).toBeGreaterThanOrEqual(0);
      expect(shieldGuardStaminaGain(false, regen, true)).toBe(0);
    }
    expect(SHIELD_GUARD_REGEN_MULTIPLIER).toBe(0.5);
    // Clamped by the fighter's own ceiling — a credit can never overflow it.
    const gain = shieldGuardStaminaGain(true, DEFENDER.staminaRegen, true);
    expect(applyStaminaRegen(140, 140, gain)).toBe(140);
    expect(applyStaminaRegen(0, 140, gain)).toBeCloseTo(15.95, 10);
  });

  test('at most one credit per hit, from the one blocked-hit branch', () => {
    // One production call site, inside `if (isBlocked) {`, after the damage.
    expect(duelSource.split('shieldGuardStaminaGain(').length - 1).toBe(1);
    const impact = duelSource.slice(
      duelSource.indexOf('const resolveImpact = () => {'),
      duelSource.indexOf('// 4. ANIMATION RESOLUTION'),
    );
    const creditAt = impact.indexOf('shieldGuardStaminaGain(');
    const blockedAt = impact.lastIndexOf('if (isBlocked) {', creditAt);
    expect(blockedAt).toBeGreaterThan(-1);
    // C-8.84F — the wording is built by the shared helper; the blocked branch
    // still writes it before the credit.
    expect(impact.slice(blockedAt, creditAt)).toContain('blockedStrikeLog(');
    // The evade path and the miss path never reach it.
    const evade = impact.slice(
      impact.indexOf('if (isEvaded || isPassiveEvaded) {'),
      impact.indexOf('} else if (roll <= hitPct) {'),
    );
    expect(evade).not.toContain('shieldGuardStaminaGain');
    expect(evade).not.toContain('applyStaminaRegen');
  });

  test('the Dodge stance is charged exactly once, at stance entry, by both fighters', () => {
    const branch = duelSource.slice(
      duelSource.indexOf("} else if (actionType === 'dodge') {"),
      duelSource.indexOf("} else if (actionType === 'taunt') {"),
    );
    expect(branch.length).toBeGreaterThan(0);
    // One debit per fighter write (player + opponent), and no regen alongside it.
    expect(branch.split('prev.stamina - DODGE_STAMINA_COST').length - 1).toBe(2);
    expect(branch).not.toContain('applyStaminaRegen');
    // The resolution neither refunds a success nor recharges a failure.
    const impact = duelSource.slice(
      duelSource.indexOf('const resolveImpact = () => {'),
      duelSource.indexOf('// 4. ANIMATION RESOLUTION'),
    );
    expect(impact).not.toContain('DODGE_STAMINA_COST');
  });

  test('a free Shield Guard action spends and credits nothing by itself', () => {
    const branch = duelSource.slice(
      duelSource.indexOf("else if (actionType === 'shield_block') {"),
      duelSource.indexOf("} else if (actionType === 'dodge') {"),
    );
    expect(branch).toContain('isBlocking: true');
    expect(branch).not.toContain('stamina:');
    expect(branch).not.toContain('applyStaminaRegen');
    expect(branch).not.toContain('shieldGuardStaminaGain');
  });
});

// ── §E. Rules this phase must not touch ────────────────────────────────────

describe('§E — the surrounding combat rules are unchanged', () => {
  test('the 700 ms wind-up and the 1100 ms turn window', () => {
    expect(ENEMY_ATTACK_WINDUP_MS).toBe(700);
    expect(PLAYER_ATTACK_WINDUP_MS).toBe(700);
    expect(duelSource).toContain('}, 1100);');
    expect(ENEMY_ATTACK_WINDUP_MS).toBeLessThan(1100);
  });

  test('range and affordability are settled before any cost or turn consumption', () => {
    const rangeAt = duelSource.indexOf('if (!isAttackInRange(gap, attackerNow.loadout.weapon)) {');
    const affordAt = duelSource.indexOf('if (!canAffordAttack(attackerNow.stamina, attackerNow.loadout.weapon, actionType)) {');
    const lockAt = duelSource.indexOf('resolvingRef.current = true;');
    const debitAt = duelSource.indexOf('prev.stamina - staminaCost');
    expect(rangeAt).toBeGreaterThan(-1);
    expect(affordAt).toBeGreaterThan(rangeAt);
    expect(lockAt).toBeGreaterThan(affordAt);
    expect(debitAt).toBeGreaterThan(lockAt);
  });

  test('hit chance, critical, strength, rage and the defence curve keep their values', () => {
    expect(DEFENSE_MITIGATION_FACTOR).toBe(2.5);
    expect(STRENGTH_BONUS_PER_POINT).toBe(0.05);
    expect(CRIT_MULTIPLIER).toBe(1.5);
    expect(RAGE_DAMAGE_MULTIPLIER).toBe(1.25);

    // Hit chance: quick 50–95, power 35–80, driven by the agility gap.
    expect(calculateHitChance(true, 100, 0)).toBe(95);
    expect(calculateHitChance(true, 0, 100)).toBe(50);
    expect(calculateHitChance(false, 100, 0)).toBe(80);
    expect(calculateHitChance(false, 0, 100)).toBe(35);
    expect(calculateHitChance(true, ATTACKER.agility, DEFENDER.agility)).toBe(82);

    // The damage formula, measured: 26 heavy through defence 42, unguarded 20,
    // guarded by a gladius 4; a crit 30; rage 25; never below 1.
    expect(openDamage(26)).toBe(20);
    expect(guardDamage(26, ALL_WEAPONS[0])).toBe(4);
    expect(calculateAttackDamage(26, ATTACKER.strength, true, DEFENDER.defense, false, 0, 1)).toBe(30);
    expect(
      calculateAttackDamage(26, ATTACKER.strength, false, DEFENDER.defense, false, 0, RAGE_DAMAGE_MULTIPLIER),
    ).toBe(25);
    expect(calculateAttackDamage(1, 0, false, 1000, false, 0, 1)).toBe(1);
  });

  test('the purse still pays the same gold', () => {
    const win = calculateDuelGold({
      baseGold: 200,
      didWin: true,
      crowdHypePeak: 100,
      perfectBlocks: 5,
      damageTaken: 0,
    });
    expect(win).toEqual({ base: 200, hype: 40, precision: 25, flawless: 100, total: 365 });
    expect(
      calculateDuelGold({
        baseGold: 200,
        didWin: false,
        crowdHypePeak: 100,
        perfectBlocks: 5,
        damageTaken: 0,
      }).total,
    ).toBe(0);
  });

  test('the AI’s weights are untouched', () => {
    expect(AI_FALLBACK_THRESHOLDS).toEqual({ quick: 0.46, power: 0.72, block: 0.9 });
    // The aggression/blockChance model, at its boundaries.
    expect(chooseAIStandardAction(0.5, 0.5, 0.1)).toBe('quick_attack');
    expect(chooseAIStandardAction(0.5, 0.5, 0.4)).toBe('power_attack');
    expect(chooseAIStandardAction(0.5, 0.5, 0.7)).toBe('shield_block');
    expect(chooseAIStandardAction(0.5, 0.5, 0.9)).toBe('dodge');
    expect(chooseAIStandardAction(undefined, undefined, 0.5)).toBe('power_attack');
    expect(chooseAIStandardAction(undefined, undefined, 0.95)).toBe('dodge');
    // Out of range: advance 82 %, taunt 18 % — never a strike.
    expect(chooseAIOutOfRangeAction(0.81)).toBe('advance');
    expect(chooseAIOutOfRangeAction(0.83)).toBe('taunt');
  });
});

// ── §F. C-8.81D strike timing ──────────────────────────────────────────────

describe('§F — the C-8.81D attack-contact constants and their consumer are untouched', () => {
  test('the contact frames, the frame lag and the derived window', () => {
    expect(ATTACK_FRAME_MS).toBeCloseTo(1000 / 60, 10);
    expect(ATTACK_CLIP_START_LAG_MS).toBe(ATTACK_FRAME_MS);
    expect(HIT_STOP_SAMPLE_LAG_MS).toBe(ATTACK_FRAME_MS);
    expect(ATTACK_CLIP_CONTACT_MS.Sword_Attack).toBe(546);
    expect(ATTACK_CLIP_CONTACT_MS.Sword_Regular_C).toBe(698);
    // The two one-frame offsets cancel, so the window is the 700 ms wind-up.
    expect(attackContactWindowMs()).toBe(700);
    expect(attackContactWindowMs(ENEMY_ATTACK_WINDUP_MS)).toBe(700);
  });

  test('the calibrated playback rates are unchanged, and only the strikes are calibrated', () => {
    expect(attackPlaybackRateForAction('attack_light', 'Sword_Attack')).toBeCloseTo(0.78, 10);
    expect(attackPlaybackRateForAction('attack_heavy', 'Sword_Regular_C')).toBeCloseTo(
      0.9971428571,
      9,
    );
    expect(attackPlaybackRateForAction('dodge', 'Sword_Attack')).toBe(1);
    expect(attackPlaybackRateForAction('attack_light', 'Unmapped_Clip')).toBe(1);
  });

  test('GladiatorMesh is still the one production consumer', () => {
    const mesh = readFileSync(
      new URL('../components/3d/GladiatorMesh.tsx', import.meta.url),
      'utf8',
    );
    // Exactly one call site (the import names it without a call).
    expect(mesh.split('attackPlaybackRateForAction(').length - 1).toBe(1);
    expect(mesh).toContain(
      'nextAction.setEffectiveTimeScale(attackPlaybackRateForAction(activeAction, targetClip));',
    );
    // This phase's files do not touch the strike timing path at all.
    for (const source of [duelSource, panelSource, hudSource, helpSource]) {
      expect(source).not.toContain('attackContact');
    }
  });
});
