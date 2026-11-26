/**
 * PHASE2-FATECON-2 — THE CONSUMERS: the seven combat Fate kinds, wired.
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  the damage factor: one `* fateDamageMult` in the traitMult chain,
 *       player-gated, computed from the bundle (damage × mastery × live
 *       conditionals), covering both Twin Fangs blades through the shared
 *       `traitMult` const;
 *   §B  the flags: set in the MISSED branch (opponent misses) and the
 *       evade branch (stance evade only), read-and-cleared at the head of
 *       the player's next attack resolution, stacking multiplicatively;
 *   §C  Shield Savant: the post-formula reduction on damage the player
 *       takes (main blow and bonus blade), never inside the traitMult
 *       chain, and the fight-ended read still uses the reduced damage;
 *   §D  Quick Recovery: the Fate factor multiplies the weight recovery
 *       at the `turnResolutionMs` call site (the one forced rebase);
 *   §E  Death Defier: the predicate, the branch beside the Second Rising,
 *       the 1 HP sliver, the refs reset with the others;
 *   §F  the HUD: one combined `fateDamageMultiplier` prop, threaded
 *       DuelScene → CombatHUD → TurnActionPanel and appended (never
 *       prepended) to the panel's estimates;
 *   §G  the modal: the draft modal marks gold_flat and the fourteen kinds
 *       live; only Deep Wounds stays inert.
 *
 * Source assertions read comment-stripped code, so prose can never satisfy
 * (or defeat) them — the `code` helper below is the treatment suite's idiom.
 *
 * Run with: `bun test src/utils/fateCombatConsumers.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Strip comments so prose can never satisfy (or defeat) a source assertion. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const DUEL_SOURCE = code(
  readFileSync(join(SRC_ROOT, 'components', 'duel', 'DuelScene.tsx'), 'utf8'),
);
const PANEL_SOURCE = code(
  readFileSync(join(SRC_ROOT, 'components', 'ui', 'TurnActionPanel.tsx'), 'utf8'),
);
const HUD_SOURCE = code(readFileSync(join(SRC_ROOT, 'components', 'ui', 'CombatHUD.tsx'), 'utf8'));
const DRAFT_MODAL_SOURCE = code(
  readFileSync(join(SRC_ROOT, 'components', 'hub', 'FateDraftModal.tsx'), 'utf8'),
);
const BONUSES_SOURCE = code(readFileSync(join(SRC_ROOT, 'utils', 'fateBonuses.ts'), 'utf8'));

describe('PHASE2-FATECON-2 §A — the damage factor rides the traitMult chain', () => {
  test('one fateDamageMult factor, computed from the bundle and the live state', () => {
    // The factor is computed once per landed blow, player-gated, from the
    // memo the scene already holds — damage × mastery × live conditionals.
    expect(DUEL_SOURCE).toContain('const fateDamageMult = isActorPlayer');
    expect(DUEL_SOURCE).toContain('fateBonuses.damageMultiplier');
    expect(DUEL_SOURCE).toContain(
      'fateWeaponMasteryMultiplier(fateBonuses.ownedCardIds, attackerWeapon.type)',
    );
    expect(DUEL_SOURCE).toContain(
      'fateConditionalDamageMultiplier(fateBonuses.ownedCardIds, {',
    );
    expect(DUEL_SOURCE).toContain('afterOpponentMisses: fateAfterOpponentMissed,');
    expect(DUEL_SOURCE).toContain('afterSuccessfulDodge: fateAfterSuccessfulDodge,');
    expect(DUEL_SOURCE).toContain('attackerHealth: attacker.health,');
    expect(DUEL_SOURCE).toContain('defenderHealth: defender.health,');
  });

  test('the factor is appended to the chain, after the weight impact — the call text is untouched', () => {
    expect(DUEL_SOURCE).toContain('* fateDamageMult;');
    // The resolveTraitMult call itself is unchanged (its argument list is
    // pinned in combatPlumbing.test.ts): the factor multiplies after it.
    expect(DUEL_SOURCE).toContain('const traitMult = resolveTraitMult(attackerMods, defenderMods, {');
    expect(DUEL_SOURCE).toContain('attackerHealth: attacker.health,');
    expect(DUEL_SOURCE).toContain('defenderHealth: defender.health,');
  });

  test('the frozen file and the modifiers module are never approached', () => {
    const frozen = code(readFileSync(join(SRC_ROOT, 'utils', 'combatCalculations.ts'), 'utf8'));
    expect(frozen).not.toContain('fate');
    expect(frozen).not.toContain('Fate');
    const modifiers = code(readFileSync(join(SRC_ROOT, 'utils', 'combatModifiers.ts'), 'utf8'));
    expect(modifiers).not.toContain('fate');
    expect(modifiers).not.toContain('Fate');
    // The Fate factor multiplies after the resolveTraitMult call returns,
    // never as one of its arguments: the call's argument list is unchanged.
    const callAt = DUEL_SOURCE.indexOf('const traitMult = resolveTraitMult(');
    const callArgs = DUEL_SOURCE.slice(callAt, DUEL_SOURCE.indexOf('})', callAt));
    expect(callArgs).not.toContain('fate');
    expect(callArgs).not.toContain('Fate');
  });
});

describe('PHASE2-FATECON-2 §B — the event flags', () => {
  test('the refs exist and reset with the other duel refs', () => {
    expect(DUEL_SOURCE).toContain('const afterOpponentMissedRef = useRef(false);');
    expect(DUEL_SOURCE).toContain('const afterSuccessfulDodgeRef = useRef(false);');
    expect(DUEL_SOURCE).toContain('const deathDefiedRef = useRef(false);');
    // Four clears each: the three reset sites (withdrawal cancel, victory,
    // defeat) plus the consumption clear at the head of the next attack.
    expect(DUEL_SOURCE.split('afterOpponentMissedRef.current = false').length - 1).toBe(4);
    expect(DUEL_SOURCE.split('afterSuccessfulDodgeRef.current = false').length - 1).toBe(4);
  });

  test('the miss flag is set only when the opponent’s attack misses', () => {
    const missedAt = DUEL_SOURCE.indexOf("'MISSED!'");
    const block = DUEL_SOURCE.slice(missedAt, missedAt + 800);
    expect(block).toContain('if (!isActorPlayer) afterOpponentMissedRef.current = true;');
  });

  test('the dodge flag is set only on a stance evade of the opponent’s attack', () => {
    const evadedAt = DUEL_SOURCE.indexOf("'EVADED!'");
    const block = DUEL_SOURCE.slice(evadedAt, evadedAt + 1200);
    expect(block).toContain('if (!isActorPlayer && isEvaded) afterSuccessfulDodgeRef.current = true;');
    // A passive palma evade or a sidestep never sets it: the only setter in
    // the branch is the stance-evade one above.
    expect(DUEL_SOURCE.split('afterSuccessfulDodgeRef.current = true').length - 1).toBe(1);
  });

  test('the flags are read-and-cleared at the head of the player’s next attack resolution', () => {
    expect(DUEL_SOURCE).toContain(
      'const fateAfterOpponentMissed = isActorPlayer && afterOpponentMissedRef.current;',
    );
    expect(DUEL_SOURCE).toContain(
      'const fateAfterSuccessfulDodge = isActorPlayer && afterSuccessfulDodgeRef.current;',
    );
    // The snapshot is read before the sidestep/evade/hit/miss chain, so a
    // miss, an evade and a sidestep all consume the flags, exactly as a
    // landed blow does — and the snapshot rides into the traitMult chain.
    const snapshotAt = DUEL_SOURCE.indexOf('const fateAfterOpponentMissed');
    const chainAt = DUEL_SOURCE.indexOf('if (isSidestepped)', snapshotAt);
    expect(chainAt).toBeGreaterThan(snapshotAt);
    expect(DUEL_SOURCE.indexOf('const fateDamageMult', snapshotAt)).toBeGreaterThan(chainAt);
  });
});

describe('PHASE2-FATECON-2 §C — Shield Savant, post-formula', () => {
  test('the main blow and the bonus blade are reduced after the formula returns', () => {
    expect(DUEL_SOURCE).toContain(
      ') * (!isActorPlayer ? fateBonuses.damageTakenMultiplier : 1),',
    );
    expect(DUEL_SOURCE.split('fateBonuses.damageTakenMultiplier').length - 1).toBe(2);
  });

  test('the reduction never enters the traitMult chain', () => {
    // The chain ends with the Fate damage factor; no taken factor appears
    // in it, and resolveTraitMult is never called with a Fate argument.
    const chainAt = DUEL_SOURCE.indexOf('const traitMult = resolveTraitMult(');
    const chain = DUEL_SOURCE.slice(chainAt, DUEL_SOURCE.indexOf('const rawDamage', chainAt));
    expect(chain).not.toContain('damageTakenMultiplier');
    expect(chain).not.toContain('damage_taken');
  });

  test('the fight-ended read still uses the reduced damage', () => {
    expect(DUEL_SOURCE).toContain('fightEnded = defender.health - rawDamage <= 0;');
    expect(DUEL_SOURCE).toContain('fightEnded = fightEnded || defender.health - rawDamage - bonusDamage <= 0;');
  });
});

describe('PHASE2-FATECON-2 §D — Quick Recovery at the call site', () => {
  test('the Fate factor multiplies the weight recovery in the fourth argument', () => {
    expect(DUEL_SOURCE).toContain(
      'isActorPlayer ? playerWeightProfile.recoveryMultiplier * fateBonuses.attackRecoveryMultiplier : 1,',
    );
    // The clamp itself lives inside the resolver in this same file and is
    // untouched — the call site only multiplies the factor in.
    expect(DUEL_SOURCE.split('fateBonuses.attackRecoveryMultiplier').length - 1).toBe(1);
  });
});

describe('PHASE2-FATECON-2 §E — Death Defier', () => {
  test('the defiance branch reads the predicate and the refs', () => {
    expect(DUEL_SOURCE).toContain('shouldDeathDefy({');
    expect(DUEL_SOURCE).toContain("fateBonuses.ownedCardIds.includes('death_defier')");
    expect(DUEL_SOURCE).toContain('deathDefied: deathDefiedRef.current,');
    expect(DUEL_SOURCE).toContain('health: DEATH_DEFIER_SLIVER_HP,');
    expect(DUEL_SOURCE).toContain('spawnDamageText(DEATH_DEFIER_BANNER_TEXT,');
  });

  test('the helper is pure and lives outside the frozen file', () => {
    expect(BONUSES_SOURCE).not.toContain('death_defier');
    const defier = code(readFileSync(join(SRC_ROOT, 'utils', 'deathDefier.ts'), 'utf8'));
    expect(defier).toContain('export function shouldDeathDefy(');
    expect(defier).toContain('DEATH_DEFIER_SLIVER_HP = 1');
  });
});

describe('PHASE2-FATECON-2 §F — the HUD reads the same factor', () => {
  test('one combined prop, threaded DuelScene → CombatHUD → TurnActionPanel', () => {
    expect(DUEL_SOURCE).toContain('fateDamageMultiplier={fateDamageMultiplierForPanel}');
    expect(HUD_SOURCE).toContain('fateDamageMultiplier?: number;');
    expect(HUD_SOURCE).toContain('fateDamageMultiplier = 1,');
    expect(HUD_SOURCE).toContain('fateDamageMultiplier={fateDamageMultiplier}');
    expect(PANEL_SOURCE).toContain('fateDamageMultiplier?: number;');
    expect(PANEL_SOURCE).toContain('fateDamageMultiplier = 1,');
  });

  test('the panel appends the factor to the estimates — never prepends or restructures', () => {
    // The shipped substring pins in combatStagger.test.ts still read true:
    // the Fate factor is appended after the weight multiplier.
    expect(PANEL_SOURCE).toContain(
      'estimateTraitMult(true) * playerWeightImpactMultiplier * fateDamageMultiplier',
    );
    expect(PANEL_SOURCE).toContain(
      'estimateTraitMult(false) * playerWeightImpactMultiplier * fateDamageMultiplier',
    );
    expect(PANEL_SOURCE.split('fateDamageMultiplier').length - 1).toBe(5);
  });

  test('the scene computes the panel factor at render, from the live flags and health', () => {
    expect(DUEL_SOURCE).toContain('const fateDamageMultiplierForPanel =');
    expect(DUEL_SOURCE).toContain('afterOpponentMisses: afterOpponentMissedRef.current,');
    expect(DUEL_SOURCE).toContain('afterSuccessfulDodge: afterSuccessfulDodgeRef.current,');
    expect(DUEL_SOURCE).toContain('attackerHealth: player.health,');
    expect(DUEL_SOURCE).toContain('defenderHealth: opp.health,');
  });
});

describe('PHASE2-FATECON-2 §G — the modal: fourteen kinds live, only Deep Wounds inert', () => {
  test('the draft modal still marks liveness through the same expression', () => {
    expect(DRAFT_MODAL_SOURCE).toContain("card.effect.kind === 'gold_flat'");
    expect(DRAFT_MODAL_SOURCE).toContain('FATECON1_LIVE_EFFECT_KINDS.has(card.effect.kind)');
    expect(DRAFT_MODAL_SOURCE).toContain(
      "card.effect.kind === 'gold_flat' || FATECON1_LIVE_EFFECT_KINDS.has(card.effect.kind) ? (",
    );
  });

  test('only Deep Wounds stays inert — the live set is pinned in fateBonuses.test.ts', () => {
    // The modal reads nothing else for liveness; the set itself is pinned
    // exactly (fourteen kinds) in the helper suite.
    expect(DRAFT_MODAL_SOURCE).not.toContain('unlock_technique');
  });
});
