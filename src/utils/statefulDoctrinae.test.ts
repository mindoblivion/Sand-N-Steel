/**
 * ===========================================================================
 * CH-3b — STATEFUL DOCTRINAE (Cast the Net + Twin Fangs)
 * ===========================================================================
 * The slice's pins, one section per decision.  Nothing here restates a formula:
 * every expectation is computed with the SHIPPED functions
 * (`combatCalculations.ts`, `combatModifiers.ts`, `statefulDoctrinae.ts`), so a
 * change to a formula or a constant moves the assertions with it — except the
 * deliberately frozen pre-CH-3b numbers, which are the point of those pins.
 *
 *   §N  Cast the Net          (land, miss, spent, secutor immunity)
 *   §E  the entangle          (crit rider live / gone, the tick, expiry)
 *   §H  the hit penalty       (applied to the RESULT, floored at the clamps)
 *   §A  the AI's net branch   (net available + player not entangled)
 *   §T  Twin Fangs            (own roll, half damage, no crit, no recursion)
 *   §P  persistence           (duel state only — nothing reaches a save)
 *   §X  the wiring, read out of the sources
 *
 * Run with: bun test src/utils/statefulDoctrinae.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';

import {
  HIT_CHANCE_BOUNDS,
  applyComboEvent,
  calculateAttackDamage,
  calculateHitChance,
} from './combatCalculations';
import { EMPTY_MODIFIERS, critChanceFor, type FighterModifiers } from './combatModifiers';
import {
  ENTANGLE_HIT_PENALTY,
  ENTANGLE_TURNS_ON_LAND,
  NET_CRIT_BONUS,
  NET_LAND_CHANCE,
  TWIN_FANGS_DAMAGE_RATIO,
  TWIN_FANGS_LANDED_HYPE,
  canCastNet,
  decrementEntangle,
  entangledHitChance,
  isEntangleImmune,
  isEntangled,
  netCritBonusModifiers,
  resolveNetCast,
  rollBonusStrike,
  rollNetCast,
  shouldAICastNet,
  twinFangsApplies,
  twinFangsBaseDamage,
  twinFangsComboEvent,
} from './statefulDoctrinae';

// ── helpers ──────────────────────────────────────────────────────────────────

const source = (path: string) => readFileSync(path, 'utf8');
/** Strip block and line comments so prose can neither satisfy nor defeat a pin. */
const code = (path: string) =>
  source(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const withCritAdd = (add: number): FighterModifiers => ({
  ...EMPTY_MODIFIERS,
  block: { ...EMPTY_MODIFIERS.block, critChanceAdd: add },
});

// ── §N — CAST THE NET ────────────────────────────────────────────────────────

describe('§N — Cast the Net', () => {
  test('lands at 70 %: just under the line lands, the line itself misses', () => {
    expect(NET_LAND_CHANCE).toBe(0.7);
    expect(rollNetCast(0)).toBe(true);
    expect(rollNetCast(0.6999)).toBe(true);
    expect(rollNetCast(0.7)).toBe(false);
    expect(rollNetCast(0.999)).toBe(false);
  });

  test('a landed cast entangles for exactly two turns', () => {
    expect(ENTANGLE_TURNS_ON_LAND).toBe(2);
    expect(resolveNetCast({ rngOrValue: 0.1 })).toEqual({
      landed: true,
      immune: false,
      entangledTurns: 2,
    });
  });

  test('a missed cast is spent and leaves no entangle', () => {
    const miss = resolveNetCast({ rngOrValue: 0.7 });
    expect(miss).toEqual({ landed: false, immune: false, entangledTurns: 0 });
    expect(isEntangled(miss.entangledTurns)).toBe(false);
  });

  test('secutor immunity: the cast resolves, nothing is entangled', () => {
    expect(isEntangleImmune('secutor')).toBe(true);
    for (const other of ['murmillo', 'retiarius', 'dimachaerus', 'thraex', 'provocator'] as const) {
      expect(isEntangleImmune(other), other).toBe(false);
    }
    expect(isEntangleImmune(undefined)).toBe(false);

    // A guaranteed-land roll still cannot entangle a secutor, and the roll is
    // not even consumed (immunity is read before it).
    let draws = 0;
    const result = resolveNetCast({
      targetArmaturaId: 'secutor',
      rngOrValue: () => {
        draws += 1;
        return 0;
      },
    });
    expect(result).toEqual({ landed: false, immune: true, entangledTurns: 0 });
    expect(draws).toBe(0);
  });

  test('canCastNet: only an unspent net may be thrown', () => {
    expect(canCastNet(true)).toBe(true);
    expect(canCastNet(false)).toBe(false);
    expect(canCastNet(undefined)).toBe(false);
    // Spent by the cast: from that moment the guard refuses every re-throw.
    expect(canCastNet(false)).toBe(false);
  });
});

// ── §E — THE ENTANGLE ────────────────────────────────────────────────────────

describe('§E — the entangle', () => {
  test('the caster gains +0.25 crit chance through CH-3a’s crit hook', () => {
    expect(NET_CRIT_BONUS).toBe(0.25);
    expect(critChanceFor(EMPTY_MODIFIERS)).toBeCloseTo(0.25, 10);
    const netted = netCritBonusModifiers(EMPTY_MODIFIERS, true);
    expect(critChanceFor(netted)).toBeCloseTo(0.5, 10);
  });

  test('the rider stacks onto an existing critChanceAdd and respects the 0.60 cap', () => {
    expect(critChanceFor(netCritBonusModifiers(withCritAdd(0.1), true))).toBeCloseTo(0.6, 10);
    // 0.25 + 0.5 + 0.25 = 1.00 → still the hook's own ceiling.
    expect(critChanceFor(netCritBonusModifiers(withCritAdd(0.5), true))).toBe(0.6);
  });

  test('the bonus is gone once the entangle expires (the block is untouched)', () => {
    const base = withCritAdd(0.12);
    expect(netCritBonusModifiers(base, false)).toBe(base);
    expect(critChanceFor(netCritBonusModifiers(base, false))).toBeCloseTo(0.37, 10);
  });

  test('it ticks down on the entangled fighter’s own action and expires at 0', () => {
    expect(ENTANGLE_TURNS_ON_LAND).toBe(2);
    // Two penalised actions, then it is over.
    const first = decrementEntangle(2);
    expect(first).toBe(1);
    expect(isEntangled(first)).toBe(true);
    const second = decrementEntangle(first);
    expect(second).toBe(0);
    expect(isEntangled(second)).toBe(false);
    // And it never goes negative.
    expect(decrementEntangle(0)).toBe(0);
    expect(decrementEntangle(undefined)).toBe(0);
    expect(isEntangled(undefined)).toBe(false);
    expect(isEntangled(-1)).toBe(false);
  });
});

// ── §H — THE HIT PENALTY ─────────────────────────────────────────────────────

describe('§H — the entangle’s hit penalty', () => {
  test('−25 percentage points off the formula’s RESULT', () => {
    expect(ENTANGLE_HIT_PENALTY).toBe(25);
    expect(entangledHitChance(80, true, true)).toBe(55);
    expect(entangledHitChance(95, true, true)).toBe(70);
    expect(entangledHitChance(80, false, true)).toBe(55);
  });

  test('floored at the formula’s own clamps, never below them', () => {
    expect(entangledHitChance(60, true, true)).toBe(HIT_CHANCE_BOUNDS.quick.floor);
    expect(entangledHitChance(50, true, true)).toBe(50);
    expect(entangledHitChance(10, true, true)).toBe(50);
    expect(entangledHitChance(45, false, true)).toBe(HIT_CHANCE_BOUNDS.power.floor);
    expect(entangledHitChance(35, false, true)).toBe(35);
    expect(entangledHitChance(10, false, true)).toBe(35);
  });

  test('the floors ARE the formula’s clamps (not a second set of numbers)', () => {
    expect(HIT_CHANCE_BOUNDS.quick.floor).toBe(calculateHitChance(true, 0, 100));
    expect(HIT_CHANCE_BOUNDS.power.floor).toBe(calculateHitChance(false, 0, 100));
    expect(HIT_CHANCE_BOUNDS.quick.ceiling).toBe(calculateHitChance(true, 100, 0));
    expect(HIT_CHANCE_BOUNDS.power.ceiling).toBe(calculateHitChance(false, 100, 0));
  });

  test('every percentage in range stays inside its clamp and never above the input', () => {
    for (let pct = 0; pct <= 100; pct += 1) {
      const quick = entangledHitChance(pct, true, true);
      expect(quick).toBeGreaterThanOrEqual(HIT_CHANCE_BOUNDS.quick.floor);
      expect(quick).toBeLessThanOrEqual(Math.max(pct, HIT_CHANCE_BOUNDS.quick.floor));
      const power = entangledHitChance(pct, false, true);
      expect(power).toBeGreaterThanOrEqual(HIT_CHANCE_BOUNDS.power.floor);
      expect(power).toBeLessThanOrEqual(Math.max(pct, HIT_CHANCE_BOUNDS.power.floor));
    }
  });

  test('an unentangled fighter’s hit chance is exactly the formula’s', () => {
    for (const pct of [0, 35, 50, 72, 95, 100]) {
      expect(entangledHitChance(pct, true, false)).toBe(pct);
      expect(entangledHitChance(pct, false, false)).toBe(pct);
    }
  });
});

// ── §A — THE AI’S NET BRANCH ─────────────────────────────────────────────────

describe('§A — the AI retiarius branch', () => {
  test('fires only with a net in hand and the player not entangled', () => {
    expect(
      shouldAICastNet({ armaturaId: 'retiarius', netAvailable: true, playerEntangled: false }),
    ).toBe(true);
    expect(
      shouldAICastNet({ armaturaId: 'retiarius', netAvailable: true, playerEntangled: undefined }),
    ).toBe(true);
  });

  test('does not fire with a spent net, or at an already-entangled player', () => {
    expect(
      shouldAICastNet({ armaturaId: 'retiarius', netAvailable: false, playerEntangled: false }),
    ).toBe(false);
    expect(
      shouldAICastNet({
        armaturaId: 'retiarius',
        netAvailable: true,
        playerEntangled: true,
      }),
    ).toBe(false);
  });

  test('does not fire for any other class, net in hand or not', () => {
    for (const armaturaId of [
      'murmillo',
      'secutor',
      'dimachaerus',
      'thraex',
      'provocator',
      'hoplomachus',
      undefined,
    ] as const) {
      expect(shouldAICastNet({ armaturaId, netAvailable: true, playerEntangled: false }), String(armaturaId)).toBe(
        false,
      );
    }
  });

  test('the player-side net is the player’s own armatura, never the opponent’s', () => {
    // The two sides are decided by their own resolved blocks, and a net is only
    // ever held by a retiarius — so the AI branch cannot arm the player.
    expect(shouldAICastNet({ armaturaId: 'murmillo', netAvailable: true, playerEntangled: false })).toBe(false);
  });
});

// ── §T — TWIN FANGS ──────────────────────────────────────────────────────────

describe('§T — Twin Fangs', () => {
  test('applies to a dimachaerus’ quick attack only', () => {
    expect(twinFangsApplies('dimachaerus', true)).toBe(true);
    expect(twinFangsApplies('dimachaerus', false)).toBe(false);
    for (const other of ['murmillo', 'retiarius', 'secutor', 'thraex', 'provocator', 'hoplomachus', undefined] as const) {
      expect(twinFangsApplies(other, true), String(other)).toBe(false);
    }
  });

  test('cannot itself trigger Twin Fangs', () => {
    expect(twinFangsApplies('dimachaerus', true, true)).toBe(false);
  });

  test('the bonus strike makes its own hit roll against the same hit chance', () => {
    // `r * 100 <= hitPct`, the duel's own convention.
    expect(rollBonusStrike(80, 0.79)).toBe(true);
    expect(rollBonusStrike(80, 0.8)).toBe(true);
    expect(rollBonusStrike(80, 0.81)).toBe(false);
    expect(rollBonusStrike(50, 0.2)).toBe(true);
    expect(rollBonusStrike(50, 0.9)).toBe(false);
    // A guaranteed and an impossible roll.
    expect(rollBonusStrike(95, () => 0)).toBe(true);
    expect(rollBonusStrike(35, () => 0.99)).toBe(false);
  });

  test('the bonus strike is 50 % of damageLight, at least 1', () => {
    expect(TWIN_FANGS_DAMAGE_RATIO).toBe(0.5);
    expect(twinFangsBaseDamage(20)).toBe(10);
    expect(twinFangsBaseDamage(14)).toBe(7);
    expect(twinFangsBaseDamage(11)).toBe(6); // 5.5 rounds up
    expect(twinFangsBaseDamage(1)).toBe(1);
    expect(twinFangsBaseDamage(0)).toBe(1);
    expect(twinFangsBaseDamage(Number.NaN)).toBe(1);
  });

  test('through the same damage pipeline it is a half blow and can never crit', () => {
    const strength = 10;
    const defense = 4;
    const damageLight = 20;

    const main = calculateAttackDamage(damageLight, strength, false, defense, false, 0, 1, 1);
    const twin = calculateAttackDamage(
      twinFangsBaseDamage(damageLight),
      strength,
      false,
      defense,
      false,
      0,
      1,
      1,
    );
    const twinIfItCouldCrit = calculateAttackDamage(
      twinFangsBaseDamage(damageLight),
      strength,
      true,
      defense,
      false,
      0,
      1,
      1,
    );

    expect(twin).toBeLessThan(main);
    expect(twin).not.toBe(twinIfItCouldCrit);
    // Half the base damage through the identical pipeline (rounding aside).
    const halfBlow = calculateAttackDamage(damageLight * 0.5, strength, false, defense, false, 0, 1, 1);
    expect(Math.abs(twin - halfBlow)).toBeLessThanOrEqual(1);
  });

  test('it feeds combo exactly as any landed / missed blow', () => {
    expect(twinFangsComboEvent(true)).toBe('landed');
    expect(twinFangsComboEvent(false)).toBe('miss');
    expect(applyComboEvent(2, twinFangsComboEvent(true))).toBe(3);
    expect(applyComboEvent(3, twinFangsComboEvent(false))).toBe(0);
  });

  test('the landed bonus strike adds the same hype as any landed quick attack', () => {
    expect(TWIN_FANGS_LANDED_HYPE).toBe(8);
  });
});

// ── §P — NOTHING PERSISTS ────────────────────────────────────────────────────

describe('§P — the duel state never reaches a save', () => {
  test('only the duel, the HUD, the type and this module name the fields', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) return walk(path);
        return entry.isFile() && /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
      });

    const naming = walk('src').filter((path) => {
      const text = source(path);
      return text.includes('entangledTurns') || text.includes('netAvailable');
    });

    expect(naming.sort()).toEqual(
      [
        'src/components/duel/DuelScene.tsx',
        'src/components/ui/TurnActionPanel.tsx',
        'src/types/game.ts',
        // D-2 — the beast suite asserts the same cast's own return shape
        // (`entangledTurns`), so it names the field without ever putting it on a
        // fighter. A test file joining this list is the list working: no
        // PRODUCTION file beyond the four above may name either field.
        'src/utils/beastHunt.test.ts',
        'src/utils/statefulDoctrinae.test.ts',
        'src/utils/statefulDoctrinae.ts',
      ].sort(),
    );
  });

  test('the storage service and the save corpus name neither field', () => {
    for (const path of ['src/services/storage.ts', 'src/utils/saveCorpus.test.ts', 'src/services/googleDrive.ts']) {
      const text = source(path);
      expect(text.includes('entangledTurns'), path).toBe(false);
      expect(text.includes('netAvailable'), path).toBe(false);
    }
  });

  test('the fields are declared optional on FighterState', () => {
    const types = code('src/types/game.ts');
    expect(types).toContain('entangledTurns?: number;');
    expect(types).toContain('netAvailable?: boolean;');
  });
});

// ── §X — THE WIRING ──────────────────────────────────────────────────────────

describe('§X — the wiring', () => {
  const duel = code('src/components/duel/DuelScene.tsx');
  const panel = code('src/components/ui/TurnActionPanel.tsx');

  test('the duel resolves the net through the module and spends it on every cast', () => {
    for (const call of ['canCastNet(', 'resolveNetCast(', 'netCritBonusModifiers(', 'entangledHitChance(', 'isEntangled(', 'decrementEntangle(']) {
      expect(duel, call).toContain(call);
    }
    // The net is spent in the cast branch, before the result is read.
    expect(duel).toContain('netAvailable: false');
    // The entangle ticks down in BOTH fighters' turn-end branches.
    expect((duel.match(/entangledTurns: decrementEntangle\(prev\.entangledTurns\)/g) ?? []).length).toBe(2);
  });

  test('the cast is a real action in the duel and a button in the HUD', () => {
    expect(duel).toContain("actionType === 'cast_net'");
    expect(panel).toContain("'cast_net'");
    // D-2 — the button still throws the net; it now carries the chosen target,
    // because the same cast can be aimed at a crouching beast (the beast branch
    // resolves it with no target class, so Snag-Proof cannot refuse a lion).
    expect(panel).toContain("onExecuteAction('cast_net', attackTarget)");
    // Retiarius only, and only while the net is unspent.
    expect(panel).toContain("playerModifiers.armaturaId === 'retiarius'");
    expect(panel).toContain('!netReady');
  });

  test('the AI net branch is PRE-standard and keeps the standard call intact', () => {
    const netBranch = duel.indexOf('shouldAICastNet({');
    const standard = duel.indexOf('chooseAIStandardAction(opponent.aggression, opponent.blockChance)');
    expect(netBranch).toBeGreaterThan(0);
    expect(standard).toBeGreaterThan(netBranch);
    expect(duel).toContain("chosenAction = 'cast_net';");
  });

  test('the twin strike sits inside the LANDED branch, before the MISSED one', () => {
    const landed = duel.indexOf('} else if (roll <= hitPct) {');
    const twin = duel.indexOf('if (twinFangsApplies(');
    const missed = duel.indexOf("'s attack MISSED!");
    expect(landed).toBeGreaterThan(0);
    expect(twin).toBeGreaterThan(landed);
    expect(missed).toBeGreaterThan(twin);

    const window = duel.slice(twin, missed);
    expect(window).toContain('rollBonusStrike(');
    expect(window).toContain('twinFangsBaseDamage(');
    expect(window).toContain('twinFangsComboEvent(');
    expect(window).toContain('TWIN_FANGS_LANDED_HYPE');
    // No crit is ever rolled for the bonus strike.
    expect(window).not.toContain('isCrit: true');
  });

  test('the entangled penalty is applied to the hitPct RESULT, not inside the formula', () => {
    expect(duel).toContain('const hitPct = entangledHitChance(');
    expect(duel).toContain('calculateHitChance(');
    // The formula's own declaration is unchanged in shape.
    const calc = code('src/utils/combatCalculations.ts');
    expect(calc).toContain('export function calculateHitChance(');
    expect(calc).toContain('export const HIT_CHANCE_BOUNDS');
    expect(calc).not.toContain('ENTANGLE');
  });

  test('the HUD’s hit estimates read the same penalty as resolution', () => {
    expect(panel).toContain('entangledHitChance(');
  });
});
