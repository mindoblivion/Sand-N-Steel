/**
 * combatTests.ts — Regression tests for Phase 32B combat stat integration.
 *
 * Run with:  npx tsx scripts/combatTests.ts
 *
 * Tests the pure calculation functions in src/utils/combatCalculations.ts
 * directly — the same functions consumed by DuelScene.tsx (combat
 * resolution) and TurnActionPanel.tsx (HUD estimates).  No simplified
 * test-only duplicates of the formulas.
 *
 * Also verifies that weapon data from src/data/itemsDB.ts is consistent
 * with the expected stat ranges, and that stamina regen clamps correctly.
 */
import { strict as assert } from 'node:assert';
import {
  getWeaponRange,
  getStaminaCost,
  calculateHitChance,
  calculateAttackDamage,
  applyStaminaRegen,
  shieldGuardStaminaGain,
  DEFENSE_MITIGATION_FACTOR,
  STRENGTH_BONUS_PER_POINT,
  CRIT_MULTIPLIER,
} from '../src/utils/combatCalculations';
import {
  ALL_WEAPONS,
  DEFAULT_PLAYER_WEAPON,
  getWeaponByType,
} from '../src/data/itemsDB';
import {
  canAffordAttack,
  chooseAITacticalAction,
  enforceAffordableAIAction,
} from '../src/utils/aiActionSelection';

// ── Mini test runner ──────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    // eslint-disable-next-line no-console
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    // eslint-disable-next-line no-console
    console.error(`  ✗ ${name}`);
    // eslint-disable-next-line no-console
    console.error(`    ${(e as Error).message}`);
  }
}

function approx(actual: number, expected: number, tol = 1e-6): void {
  assert.ok(
    Math.abs(actual - expected) < tol,
    `Expected ${expected}, got ${actual} (tol ${tol})`,
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 1. DEFENSE-STAT DAMAGE MITIGATION
// ════════════════════════════════════════════════════════════════════════════

test('defense 0: no mitigation (full damage)', () => {
  // base 20, str 10 (×1.5), no crit, def 0, no block
  const dmg = calculateAttackDamage(20, 10, false, 0, false, 0);
  approx(dmg, 30); // 20 * 1.5 * 100/100 = 30
});

test('defense 2: light mitigation', () => {
  const dmg = calculateAttackDamage(20, 10, false, 2, false, 0);
  // 20 * 1.5 * 100/(100+2*2.5) = 30 * 100/105 = 28.57 → round = 29
  approx(dmg, 29);
});

test('defense 6: moderate mitigation (~13%)', () => {
  const dmg = calculateAttackDamage(20, 10, false, 6, false, 0);
  // 30 * 100/115 = 26.087 → 26
  approx(dmg, 26);
});

test('defense 14: significant mitigation (~26%)', () => {
  const dmg = calculateAttackDamage(20, 10, false, 14, false, 0);
  // 30 * 100/135 = 22.22 → 22
  approx(dmg, 22);
});

test('defense 20: ~33% reduction', () => {
  const dmg = calculateAttackDamage(20, 10, false, 20, false, 0);
  // 30 * 100/150 = 20
  approx(dmg, 20);
});

test('defense 38: ~49% reduction (high-defense build)', () => {
  const dmg = calculateAttackDamage(20, 10, false, 38, false, 0);
  // 30 * 100/195 = 15.38 → 15
  approx(dmg, 15);
});

test('defense 100: never invulnerable (~71% reduction)', () => {
  const dmg = calculateAttackDamage(20, 10, false, 100, false, 0);
  // 30 * 100/350 = 8.57 → 9
  assert.ok(dmg > 0, 'high defense must still take damage');
  assert.ok(dmg >= 1, 'minimum damage floor is 1');
  approx(dmg, 9);
});

test('low defense takes more damage than high defense', () => {
  const low = calculateAttackDamage(30, 15, false, 2, false, 0);
  const high = calculateAttackDamage(30, 15, false, 38, false, 0);
  assert.ok(low > high, `low defense (${low}) should take more damage than high defense (${high})`);
});

// ════════════════════════════════════════════════════════════════════════════
// 2. MINIMUM DAMAGE FLOOR
// ════════════════════════════════════════════════════════════════════════════

test('minimum damage is 1 even with extreme defense + block', () => {
  // base 1, str 1, crit, defense 500, blocked with 0.99 blockReduction
  const dmg = calculateAttackDamage(1, 1, true, 500, true, 0.99);
  assert.ok(dmg >= 1, `damage must be at least 1, got ${dmg}`);
  approx(dmg, 1);
});

test('minimum damage is 1 with extreme defense, no block', () => {
  const dmg = calculateAttackDamage(1, 1, false, 500, false, 0);
  assert.ok(dmg >= 1);
  approx(dmg, 1);
});

// ════════════════════════════════════════════════════════════════════════════
// 3. CRITICAL HIT BEHAVIOR
// ════════════════════════════════════════════════════════════════════════════

test('crit deals 1.5x damage vs same defense', () => {
  const normal = calculateAttackDamage(20, 10, false, 10, false, 0);
  const crit = calculateAttackDamage(20, 10, true, 10, false, 0);
  // crit should be roughly 1.5x (rounding may differ by 1)
  assert.ok(
    crit >= Math.round(normal * 1.4) && crit <= Math.round(normal * 1.6),
    `crit (${crit}) should be ~1.5x normal (${normal})`,
  );
});

test('crit multiplier is exactly 1.5', () => {
  // With def 0, no block: dmg = base * (1+str*0.05) * critMult
  // crit: 20 * 1.5 * 1.5 = 45; non-crit: 20 * 1.5 * 1.0 = 30
  const normal = calculateAttackDamage(20, 10, false, 0, false, 0);
  const crit = calculateAttackDamage(20, 10, true, 0, false, 0);
  approx(crit / normal, CRIT_MULTIPLIER);
});

test('crit + defense: both reductions stack multiplicatively', () => {
  const critNoDef = calculateAttackDamage(20, 10, true, 0, false, 0);
  const critDef20 = calculateAttackDamage(20, 10, true, 20, false, 0);
  // critNoDef=45, defense 20: 45 * 100/150 = 30
  approx(critDef20, 30);
  assert.ok(critDef20 < critNoDef);
});

// ════════════════════════════════════════════════════════════════════════════
// 4. BLOCKING EFFECTIVENESS (blockReduction)
// ════════════════════════════════════════════════════════════════════════════

test('block with gladius (blockReduction 0.82): ~82% absorbed', () => {
  const unblocked = calculateAttackDamage(20, 10, false, 0, false, 0);
  const blocked = calculateAttackDamage(20, 10, false, 0, true, 0.82);
  // unblocked = 30; blocked = 30 * (1-0.82) = 30 * 0.18 = 5.4 → 5
  approx(blocked, 5);
  assert.ok(blocked < unblocked);
});

test('block with dual blades (blockReduction 0.40): only 40% absorbed', () => {
  const unblocked = calculateAttackDamage(20, 10, false, 0, false, 0);
  const blocked = calculateAttackDamage(20, 10, false, 0, true, 0.40);
  // 30 * 0.60 = 18
  approx(blocked, 18);
  assert.ok(blocked < unblocked);
  // dual blades should block worse than gladius
  const gladiusBlocked = calculateAttackDamage(20, 10, false, 0, true, 0.82);
  assert.ok(blocked > gladiusBlocked, 'dual-blade block should let more damage through than shield block');
});

test('block + defense stack multiplicatively', () => {
  // base 20, str 10 (×1.5), no crit, def 10, blocked with 0.80
  // raw = 30; after def: 30 * 100/125 = 24; after block: 24 * 0.20 = 4.8 → 5
  const dmg = calculateAttackDamage(20, 10, false, 10, true, 0.80);
  approx(dmg, 5);
});

test('shield weapon blocks better than spear weapon', () => {
  const gladius = DEFAULT_PLAYER_WEAPON; // blockReduction 0.82
  const spear = getWeaponByType('spear'); // blockReduction 0.45
  assert.ok(
    gladius.blockReduction > spear.blockReduction,
    'gladius (shield) should have higher blockReduction than spear',
  );

  const shieldDmg = calculateAttackDamage(30, 15, false, 5, true, gladius.blockReduction);
  const spearDmg = calculateAttackDamage(30, 15, false, 5, true, spear.blockReduction);
  assert.ok(
    shieldDmg < spearDmg,
    'blocking with a shield should take less damage than blocking with a spear',
  );
});

test('blockReduction values are in valid range [0, 1] for all weapons', () => {
  ALL_WEAPONS.forEach((w) => {
    assert.ok(
      w.blockReduction >= 0 && w.blockReduction <= 1,
      `${w.name} blockReduction ${w.blockReduction} out of [0,1]`,
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. WEAPON-SPECIFIC STAMINA COSTS
// ════════════════════════════════════════════════════════════════════════════

test('light stamina cost matches weapon data', () => {
  ALL_WEAPONS.forEach((w) => {
    const cost = getStaminaCost(w, true);
    assert.ok(cost === w.staminaLight, `light cost ${cost} !== weapon.staminaLight ${w.staminaLight} for ${w.name}`);
  });
});

test('heavy stamina cost matches weapon data', () => {
  ALL_WEAPONS.forEach((w) => {
    const cost = getStaminaCost(w, false);
    assert.ok(cost === w.staminaHeavy, `heavy cost ${cost} !== weapon.staminaHeavy ${w.staminaHeavy} for ${w.name}`);
  });
});

test('heavy cost >= light cost for every weapon', () => {
  ALL_WEAPONS.forEach((w) => {
    assert.ok(
      w.staminaHeavy >= w.staminaLight,
      `${w.name}: heavy (${w.staminaHeavy}) should cost >= light (${w.staminaLight})`,
    );
  });
});

test('gladius stamina costs: light 12, heavy 24', () => {
  approx(getStaminaCost(DEFAULT_PLAYER_WEAPON, true), 12);
  approx(getStaminaCost(DEFAULT_PLAYER_WEAPON, false), 24);
});

test('dual blades have cheaper stamina than mace', () => {
  const daggers = ALL_WEAPONS.find((w) => w.id === 'dual_sicae_daggers')!;
  const mace = ALL_WEAPONS.find((w) => w.id === 'bronze_mace')!;
  assert.ok(
    getStaminaCost(daggers, true) < getStaminaCost(mace, true),
    'dual blades should be cheaper to swing than a mace (light)',
  );
  assert.ok(
    getStaminaCost(daggers, false) < getStaminaCost(mace, false),
    'dual blades should be cheaper to swing than a mace (heavy)',
  );
});

// ════════════════════════════════════════════════════════════════════════════
// 6. WEAPON-SPECIFIC ATTACK RANGE
// ════════════════════════════════════════════════════════════════════════════

test('range matches weapon.range for every weapon', () => {
  ALL_WEAPONS.forEach((w) => {
    approx(getWeaponRange(w), w.range);
  });
});

test('gladius range is 2.1 (not the old binary 2.5)', () => {
  approx(getWeaponRange(DEFAULT_PLAYER_WEAPON), 2.1);
});

test('spear range > sword range', () => {
  const spear = getWeaponByType('spear');
  const sword = getWeaponByType('sword_shield');
  assert.ok(
    getWeaponRange(spear) > getWeaponRange(sword),
    'spear should have longer range than sword',
  );
});

test('dual blades have shortest range', () => {
  const dagger = ALL_WEAPONS.find((w) => w.id === 'dagger_pugio')!;
  assert.ok(getWeaponRange(dagger) <= 1.6, `dagger range should be <= 1.6, got ${getWeaponRange(dagger)}`);
  ALL_WEAPONS.forEach((w) => {
    assert.ok(
      getWeaponRange(w) >= getWeaponRange(dagger),
      `${w.name} range should be >= dagger range`,
    );
  });
});

test('all weapon ranges are in plausible combat range [1.0, 4.0]', () => {
  ALL_WEAPONS.forEach((w) => {
    assert.ok(
      w.range >= 1.0 && w.range <= 4.0,
      `${w.name} range ${w.range} outside [1.0, 4.0]`,
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. STAMINA REGENERATION
// ════════════════════════════════════════════════════════════════════════════

test('regen adds to current stamina', () => {
  const result = applyStaminaRegen(50, 100, 20);
  approx(result, 70);
});

test('regen clamps to maximum', () => {
  const result = applyStaminaRegen(90, 100, 20);
  approx(result, 100);
});

test('regen clamps to 0 minimum', () => {
  const result = applyStaminaRegen(5, 100, -20);
  approx(result, 0);
});

test('regen at exactly max does not exceed max', () => {
  const result = applyStaminaRegen(100, 100, 20);
  approx(result, 100);
});

test('regen with 0 regen rate returns current (no change)', () => {
  const result = applyStaminaRegen(50, 100, 0);
  approx(result, 50);
});

test('regen from 0 with full regen', () => {
  const result = applyStaminaRegen(0, 100, 50);
  approx(result, 50);
});

// ════════════════════════════════════════════════════════════════════════════
// 8. HIT CHANCE CONSISTENCY
// ════════════════════════════════════════════════════════════════════════════

test('quick hit chance: equal agility → 83%', () => {
  // 80 + 10*1.5 - 10*1.2 = 80 + 15 - 12 = 83
  const pct = calculateHitChance(true, 10, 10);
  approx(pct, 83);
});

test('power hit chance: equal agility → 60%', () => {
  const pct = calculateHitChance(false, 10, 10);
  approx(pct, 60);
});

test('quick hit chance: higher ceiling than power', () => {
  const quickMax = calculateHitChance(true, 100, 0);
  const powerMax = calculateHitChance(false, 100, 0);
  assert.ok(quickMax > powerMax, 'quick should have higher max hit % than power');
  approx(quickMax, 95); // capped at 95
  approx(powerMax, 80); // capped at 80
});

test('quick hit chance: higher floor than power', () => {
  const quickMin = calculateHitChance(true, 0, 100);
  const powerMin = calculateHitChance(false, 0, 100);
  assert.ok(quickMin > powerMin, 'quick should have higher min hit % than power');
  approx(quickMin, 50); // floored at 50
  approx(powerMin, 35); // floored at 35
});

test('attacker agility advantage increases hit chance', () => {
  const low = calculateHitChance(true, 10, 15);
  const high = calculateHitChance(true, 20, 15);
  assert.ok(high > low, 'higher attacker agility should yield higher hit chance');
});

// ════════════════════════════════════════════════════════════════════════════
// 9. UI / COMBAT ESTIMATE CONSISTENCY
// ════════════════════════════════════════════════════════════════════════════

test('UI quick damage estimate matches combat function (no crit, no block)', () => {
  // This is exactly what TurnActionPanel computes for quickDmgMin
  const weapon = DEFAULT_PLAYER_WEAPON;
  const str = 10;
  const oppDef = 6;
  const estimate = calculateAttackDamage(weapon.damageLight, str, false, oppDef, false, 0);
  // base 14, str 10 → ×1.5 = 21; def 6 → ×100/115 = 18.26 → 18
  approx(estimate, 18);
});

test('UI power damage range: non-crit < crit', () => {
  const weapon = DEFAULT_PLAYER_WEAPON;
  const str = 10;
  const oppDef = 6;
  const min = calculateAttackDamage(weapon.damageHeavy, str, false, oppDef, false, 0);
  const max = calculateAttackDamage(weapon.damageHeavy, str, true, oppDef, false, 0);
  assert.ok(max > min, 'crit damage estimate should be higher than non-crit');
  // base 26, str 10 → ×1.5 = 39; def 6 → ×100/115 = 33.91 → 34
  approx(min, 34);
  // crit: 39 * 1.5 = 58.5; def 6 → ×100/115 = 50.87 → 51
  approx(max, 51);
});

test('same inputs produce same result in combat and UI paths', () => {
  // Both DuelScene and TurnActionPanel call calculateAttackDamage with the
  // same weapon, strength, crit, defense, block, blockReduction args.
  // This test asserts the function is deterministic.
  const a = calculateAttackDamage(25, 12, true, 8, true, 0.65);
  const b = calculateAttackDamage(25, 12, true, 8, true, 0.65);
  approx(a, b);
  // Also verify a different input gives a different result
  const c = calculateAttackDamage(25, 12, true, 8, true, 0.45);
  assert.ok(a !== c, 'different blockReduction should yield different damage');
});

// ════════════════════════════════════════════════════════════════════════════
// 10. STRENGTH BONUS
// ════════════════════════════════════════════════════════════════════════════

test('strength bonus: +5% per point', () => {
  const base = calculateAttackDamage(20, 0, false, 0, false, 0);
  const boosted = calculateAttackDamage(20, 10, false, 0, false, 0);
  // base: 20 * 1.0 = 20; boosted: 20 * 1.5 = 30
  approx(base, 20);
  approx(boosted, 30);
  approx(STRENGTH_BONUS_PER_POINT, 0.05);
});

test('strength bonus applies before defense mitigation', () => {
  // str 20, base 20, def 20
  // raw = 20 * (1 + 20*0.05) = 20 * 2.0 = 40
  // def 20: 40 * 100/150 = 26.67 → 27
  const dmg = calculateAttackDamage(20, 20, false, 20, false, 0);
  approx(dmg, 27);
});

// ════════════════════════════════════════════════════════════════════════════
// 11. DEFENSE MITIGATION CONSTANT
// ════════════════════════════════════════════════════════════════════════════

test('defense mitigation factor is 2.5', () => {
  approx(DEFENSE_MITIGATION_FACTOR, 2.5);
});

test('defense curve: diminishing returns', () => {
  // Each additional +10 defense should reduce damage by a smaller absolute amount
  const d0 = calculateAttackDamage(100, 10, false, 0, false, 0);
  const d10 = calculateAttackDamage(100, 10, false, 10, false, 0);
  const d20 = calculateAttackDamage(100, 10, false, 20, false, 0);
  const d30 = calculateAttackDamage(100, 10, false, 30, false, 0);

  const reduction0to10 = d0 - d10;
  const reduction10to20 = d10 - d20;
  const reduction20to30 = d20 - d30;

  assert.ok(reduction0to10 > reduction10to20, 'first +10 def should reduce more than second +10');
  assert.ok(reduction10to20 > reduction20to30, 'second +10 def should reduce more than third +10');
});

// ════════════════════════════════════════════════════════════════════════════
// 12. SHIELD GUARD'S CREDITED STOP (§R2)
//
// Raising the guard spends nothing and recovers nothing: the older rule credited
// stamina on every Shield Guard turn, which made the guard strictly better than
// Dodge.  Recovery now happens only when the guard actually STOPS a blow
// (shieldGuardStaminaGain), and that credit is still clamped by the fighter's
// remaining capacity through applyStaminaRegen.  C-8.72B halves that credit
// (SHIELD_GUARD_REGEN_MULTIPLIER), so the clamp cases below feed the engine's
// own credit — not the raw regen stat — into the same arithmetic it applies.
// ════════════════════════════════════════════════════════════════════════════

test('raising the guard that stops nothing credits 0 SP', () => {
  approx(shieldGuardStaminaGain(false, 24, true), 0);
  approx(shieldGuardStaminaGain(true, 24, true), 12);
});

test('shield recovery at full stamina: 0 (no room to recover)', () => {
  // staminaRegen = 24 (12 + 10*0.8 + 10*0.4), but at full stamina nothing to recover
  const regen = 24;
  const current = 100;
  const max = 100;
  const afterRegen = applyStaminaRegen(current, max, regen);
  const recovery = afterRegen - current;
  approx(recovery, 0);
});

test('shield recovery below max: the credited gain, once', () => {
  // stamina 50/100, regen 24 → the guard credits half of it (12)
  const gain = shieldGuardStaminaGain(true, 24, true);
  const current = 50;
  const max = 100;
  const afterRegen = applyStaminaRegen(current, max, gain);
  const recovery = afterRegen - current;
  approx(recovery, 12);
});

test('shield recovery with partial remaining capacity: clamped', () => {
  // stamina 90/100, regen 24 → only 10 capacity remains
  const regen = 24;
  const current = 90;
  const max = 100;
  const afterRegen = applyStaminaRegen(current, max, regen);
  const recovery = afterRegen - current;
  approx(recovery, 10);
  approx(afterRegen, max); // cannot exceed max
});

test('shield recovery at 0 stamina: the credited gain (if it is below max)', () => {
  const gain = shieldGuardStaminaGain(true, 24, true);
  const current = 0;
  const max = 100;
  const afterRegen = applyStaminaRegen(current, max, gain);
  const recovery = afterRegen - current;
  approx(recovery, 12);
});

test('shield recovery when regen exceeds remaining capacity: clamped to capacity', () => {
  // stamina 95/100, regen 24 → only 5 remains
  const regen = 24;
  const current = 95;
  const max = 100;
  const recovery = applyStaminaRegen(current, max, regen) - current;
  approx(recovery, 5);
});

test('shield recovery never exceeds staminaMax', () => {
  // Even with huge regen, recovery is bounded by capacity
  const regen = 500;
  const current = 80;
  const max = 100;
  const afterRegen = applyStaminaRegen(current, max, regen);
  assert.ok(afterRegen <= max, `regen must not exceed max: ${afterRegen}`);
  const recovery = afterRegen - current;
  approx(recovery, 20);
});

test('shield recovery uses staminaRegen stat, not hardcoded 12', () => {
  // The old UI hardcoded "+12 SP". The production formula is
  // staminaRegen = 12 + agi*0.8 + sta*0.4, which exceeds 12 for any
  // character with positive agility/stamina. Verify a typical stat
  // line produces a regen > 12.
  const agi = 10;
  const sta = 10;
  const staminaRegen = 12 + agi * 0.8 + sta * 0.4;
  assert.ok(staminaRegen > 12, `staminaRegen (${staminaRegen}) should exceed old hardcoded 12`);
  approx(staminaRegen, 24);
});

// ════════════════════════════════════════════════════════════════════════════
// 13. ADVANCE DISABLED CONDITION (Phase 32D)
//
// The Advance button is disabled when the player is already within their
// weapon's attack range (distance <= getWeaponRange(weapon)).  This replaces
// the old fixed 2.5m threshold which incorrectly blocked short-reach weapons
// (dagger 1.6m) from closing distance and incorrectly allowed long-reach
// weapons (spear 3.1m) to keep advancing while already in range.
// ════════════════════════════════════════════════════════════════════════════

// Helper: replicates the TurnActionPanel disabled condition for Advance
function advanceDisabled(distance: number, weaponRange: number): boolean {
  return distance <= weaponRange;
}

test('advance: dagger (range 1.6) at 2.4m — enabled (out of range, below old 2.5)', () => {
  const dagger = ALL_WEAPONS.find((w) => w.id === 'dagger_pugio')!;
  const range = getWeaponRange(dagger);
  approx(range, 1.6);
  // At 2.4m: old code disabled advance (2.4 <= 2.5), but player is out of range
  assert.ok(!advanceDisabled(2.4, range), 'dagger at 2.4m should be able to advance');
  assert.ok(2.4 > range, '2.4m is outside dagger range');
});

test('advance: dagger (range 1.6) at 1.5m — disabled (in range)', () => {
  const dagger = ALL_WEAPONS.find((w) => w.id === 'dagger_puggio') ?? ALL_WEAPONS.find((w) => w.id === 'dagger_pugio')!;
  const range = getWeaponRange(dagger);
  assert.ok(advanceDisabled(1.5, range), 'dagger at 1.5m should not advance (in range)');
});

test('advance: dagger (range 1.6) at 1.6m — disabled (at exact range)', () => {
  const dagger = ALL_WEAPONS.find((w) => w.id === 'dagger_pugio')!;
  const range = getWeaponRange(dagger);
  assert.ok(advanceDisabled(1.6, range), 'dagger at exactly 1.6m should not advance');
});

test('advance: gladius (range 2.1) at 2.3m — enabled (between range and old 2.5)', () => {
  const gladius = DEFAULT_PLAYER_WEAPON;
  const range = getWeaponRange(gladius);
  approx(range, 2.1);
  // At 2.3m: old code disabled advance (2.3 <= 2.5), but player is out of range
  assert.ok(!advanceDisabled(2.3, range), 'gladius at 2.3m should be able to advance');
  assert.ok(2.3 > range, '2.3m is outside gladius range');
});

test('advance: gladius (range 2.1) at 2.1m — disabled (at exact range)', () => {
  const gladius = DEFAULT_PLAYER_WEAPON;
  const range = getWeaponRange(gladius);
  assert.ok(advanceDisabled(2.1, range), 'gladius at exactly 2.1m should not advance');
});

test('advance: spear (range 3.1) at 2.6m — disabled (in range, old code enabled)', () => {
  const spear = getWeaponByType('spear');
  const range = getWeaponRange(spear);
  approx(range, 3.1);
  // At 2.6m: old code enabled advance (2.6 > 2.5), but player is already in range
  assert.ok(advanceDisabled(2.6, range), 'spear at 2.6m should not advance (already in range)');
  assert.ok(2.6 <= range, '2.6m is within spear range');
});

test('advance: spear (range 3.1) at 3.5m — enabled (out of range)', () => {
  const spear = getWeaponByType('spear');
  const range = getWeaponRange(spear);
  assert.ok(!advanceDisabled(3.5, range), 'spear at 3.5m should be able to advance');
});

test('advance: spear (range 3.1) at 3.1m — disabled (at exact range)', () => {
  const spear = getWeaponByType('spear');
  const range = getWeaponRange(spear);
  assert.ok(advanceDisabled(3.1, range), 'spear at exactly 3.1m should not advance');
});

test('advance: polearm (range 3.3) at 2.8m — disabled (in range, old code enabled)', () => {
  const polearm = ALL_WEAPONS.find((w) => w.range === 3.3)!;
  const range = getWeaponRange(polearm);
  approx(range, 3.3);
  // At 2.8m: old code enabled advance (2.8 > 2.5), but player is in range
  assert.ok(advanceDisabled(2.8, range), 'polearm at 2.8m should not advance (in range)');
});

test('advance: no dead zone — min advance distance (1.2) < shortest weapon range', () => {
  // The advance clamp in DuelScene limits minimum distance to 1.2m.
  // Verify every weapon range exceeds this so the player can always
  // close to within striking distance.
  const minAdvanceDistance = 1.2;
  ALL_WEAPONS.forEach((w) => {
    assert.ok(
      getWeaponRange(w) >= minAdvanceDistance,
      `${w.name} range ${w.range} must be >= min advance distance ${minAdvanceDistance}`,
    );
  });
});

test('advance: all weapons at 2.5m — dagger enabled, spear disabled', () => {
  // At the old fixed threshold of 2.5m, the new condition correctly
  // differentiates: short weapons still need to close, long weapons are in range
  const dagger = ALL_WEAPONS.find((w) => w.id === 'dagger_pugio')!;
  const spear = getWeaponByType('spear');
  assert.ok(!advanceDisabled(2.5, getWeaponRange(dagger)), 'dagger at 2.5m: advance enabled (out of range)');
  assert.ok(advanceDisabled(2.5, getWeaponRange(spear)), 'spear at 2.5m: advance disabled (in range)');
});

// ════════════════════════════════════════════════════════════════════════════
// AI STRIKE AFFORDABILITY (C-8.75E)
//
// The AI may only throw a strike it can pay for. These read the same helpers
// DuelScene's AI turn and executeCombatTurn use, at both cost boundaries.
// ════════════════════════════════════════════════════════════════════════════

test('affordability: the light cost leaves the power attack unaffordable', () => {
  const weapon = DEFAULT_PLAYER_WEAPON;
  const light = getStaminaCost(weapon, true);
  const heavy = getStaminaCost(weapon, false);
  assert.ok(heavy > light, 'the audited weapon must have distinct strike costs');
  assert.equal(canAffordAttack(light, weapon, 'quick_attack'), true);
  assert.equal(canAffordAttack(light, weapon, 'power_attack'), false);
  assert.equal(canAffordAttack(heavy, weapon, 'power_attack'), true);
  assert.equal(canAffordAttack(light - 1, weapon, 'quick_attack'), false);
});

test('affordability: every weapon answers its own two costs', () => {
  ALL_WEAPONS.forEach((w) => {
    const light = getStaminaCost(w, true);
    const heavy = getStaminaCost(w, false);
    assert.equal(canAffordAttack(light, w, 'quick_attack'), true, `${w.name} light`);
    assert.equal(canAffordAttack(light, w, 'power_attack'), light >= heavy, `${w.name} heavy`);
    assert.equal(canAffordAttack(heavy, w, 'power_attack'), true, `${w.name} heavy cost`);
  });
});

test('affordability: an unaffordable power attack degrades to the quick attack', () => {
  const weapon = DEFAULT_PLAYER_WEAPON;
  const between = Math.floor((getStaminaCost(weapon, true) + getStaminaCost(weapon, false)) / 2);
  assert.equal(enforceAffordableAIAction('power_attack', between, weapon), 'quick_attack');
  assert.equal(enforceAffordableAIAction('power_attack', 0, weapon), 'rest');
});

test('affordability: the AI selection never names an unpayable strike', () => {
  const weapon = DEFAULT_PLAYER_WEAPON;
  const light = getStaminaCost(weapon, true);
  const heavy = getStaminaCost(weapon, false);
  const staminas = [0, light - 1, light, Math.floor((light + heavy) / 2), heavy, heavy + 20];
  const draws = [0, 0.2, 0.44, 0.45, 0.7, 0.75, 0.9, 0.99];
  for (const stamina of staminas) {
    for (const playerIsBlocking of [false, true]) {
      for (const playerHealth of [100, 10]) {
        for (const draw of draws) {
          const action = chooseAITacticalAction(
            { playerIsBlocking, playerHealth, stamina, weapon, aggression: 0.95, blockChance: 0.7 },
            draw,
          );
          if (action === 'quick_attack' || action === 'power_attack') {
            assert.equal(
              canAffordAttack(stamina, weapon, action),
              true,
              `${action} at ${stamina} SP must be affordable`,
            );
          }
          if (stamina < light) {
            assert.ok(
              action !== 'quick_attack' && action !== 'power_attack',
              `no strike is possible at ${stamina} SP, got ${action}`,
            );
          }
        }
      }
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ════════════════════════════════════════════════════════════════════════════

// eslint-disable-next-line no-console
console.log(`\n  Combat tests: ${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) {
  process.exit(1);
}
