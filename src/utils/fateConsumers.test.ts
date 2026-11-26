/**
 * PHASE2-FATECON-1 — THE CONSUMERS: the eight non-damage Fate kinds, wired.
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  the stamina terms: `calculateTotalStats` reads the Fate terms from
 *       `records.fate` (Iron Lungs +6 per stack, Second Wind ×1.08 per stack),
 *       and the city stride multiplies the Fate factor on top of the weight
 *       trade-off, through a ref the once-mounted movement loop can read;
 *   §B  the dodge: the player charges the Fate-scaled cost (12 → 11 at 1
 *       stack, 10 at 2), the opponent still pays the flat 12, and the panel
 *       gate reads the same number the charge does;
 *   §C  the sidestep: `sidestepPositionX` keeps its 1.8 m default and the
 *       duel passes the Fate-scaled distance for the player only;
 *   §D  the economy: the result flow multiplies the final gold/fame and
 *       records Fate line items on the in-memory DuelStatistics, and the
 *       result modal renders them so the breakdown adds up;
 *   §E  the hype: the four player-caused award sites scale their added
 *       amount by the Fate factor and the beast's flight hype stays flat;
 *   §F  the modal: the draft modal marks the eight kinds live alongside
 *       `gold_flat`, and the combat kinds plus Deep Wounds stay inert.
 *
 * Source assertions read comment-stripped code, so prose can never satisfy
 * (or defeat) them — the `code` helper below is the treatment suite's idiom.
 *
 * Run with: `bun test src/utils/fateConsumers.test.ts`
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

const STORAGE_SOURCE = code(readFileSync(join(SRC_ROOT, 'services', 'storage.ts'), 'utf8'));
const CITY_SOURCE = code(
  readFileSync(join(SRC_ROOT, 'components', '3d', 'city', 'CityHubScene.tsx'), 'utf8'),
);
const DUEL_SOURCE = code(
  readFileSync(join(SRC_ROOT, 'components', 'duel', 'DuelScene.tsx'), 'utf8'),
);
const PANEL_SOURCE = code(
  readFileSync(join(SRC_ROOT, 'components', 'ui', 'TurnActionPanel.tsx'), 'utf8'),
);
const HUD_SOURCE = code(readFileSync(join(SRC_ROOT, 'components', 'ui', 'CombatHUD.tsx'), 'utf8'));
const RESULT_MODAL_SOURCE = code(
  readFileSync(join(SRC_ROOT, 'components', 'hub', 'DuelResultModal.tsx'), 'utf8'),
);
const DRAFT_MODAL_SOURCE = code(
  readFileSync(join(SRC_ROOT, 'components', 'hub', 'FateDraftModal.tsx'), 'utf8'),
);
const TYPES_SOURCE = code(readFileSync(join(SRC_ROOT, 'types', 'game.ts'), 'utf8'));

describe('PHASE2-FATECON-1 §A — the stamina terms and the city stride', () => {
  test('calculateTotalStats reads the Fate stamina terms from records.fate', () => {
    expect(STORAGE_SOURCE).toContain('resolveFateBonuses(profile.records?.fate)');
    expect(STORAGE_SOURCE).toContain('fate.staminaMaxBonus');
    expect(STORAGE_SOURCE).toContain('fate.staminaRegenMultiplier');
    // The terms are neutral (+0, ×1) with no Fate cards, so a card-less
    // profile is bit-identical — see the §T tests in combatPlumbing.test.ts.
  });

  test('CityHubScene multiplies the stride by the Fate factor on top of weight', () => {
    // The factor rides in a ref, like bodyWeightLbRef: the movement loop is
    // mounted once and reads refs only, so a memo would go stale.
    expect(CITY_SOURCE).toContain('fateMovementSpeedRef');
    expect(CITY_SOURCE).toContain(
      "resolveFateBonuses(playerProfile.records?.fate).movementSpeedMultiplier",
    );
    expect(CITY_SOURCE).toContain(
      'resolveCityStrideSpeed(3.8 * mag, bodyWeightLbRef.current) * fateMovementSpeedRef.current',
    );
  });
});

describe('PHASE2-FATECON-1 §B — the dodge: one shared cost, player only', () => {
  test('the player charges the Fate-scaled cost; the opponent still pays the flat 12', () => {
    // The dodge branch holds exactly one Fate-scaled charge and one flat 12.
    const at = DUEL_SOURCE.indexOf("else if (actionType === 'dodge')");
    expect(at).toBeGreaterThan(-1);
    const branch = DUEL_SOURCE.slice(at, DUEL_SOURCE.indexOf("else if (actionType === 'taunt')", at));
    expect(branch).toContain('prev.stamina - fateBonuses.dodgeCost');
    expect(branch).toContain('prev.stamina - 12');
    expect(branch.match(/prev\.stamina - 12/g)?.length).toBe(1);
    // The discount never routes through the power-only trait discount or
    // the weight stamina multiplier — it is the Fate helper's number alone.
    expect(branch).not.toContain('staminaCostWithModifiers');
    expect(branch).not.toContain('playerWeightStaminaMultiplier');
  });

  test('the panel gate and labels read the same cost the duel charges', () => {
    expect(PANEL_SOURCE).toContain('fateDodgeCost = 12');
    expect(PANEL_SOURCE).toContain('player.stamina < fateDodgeCost');
    expect(PANEL_SOURCE).toContain('{fateDodgeCost} SP');
    expect(PANEL_SOURCE).toContain('−{fateDodgeCost} SP');
    // No hard-coded 12 survives in the dodge button: gate and labels agree.
    const clickAt = PANEL_SOURCE.indexOf("onExecuteAction('dodge')");
    expect(clickAt).toBeGreaterThan(-1);
    const start = PANEL_SOURCE.lastIndexOf('<button', clickAt);
    const end = PANEL_SOURCE.indexOf("onExecuteAction('cast_net'", clickAt);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const button = PANEL_SOURCE.slice(start, end);
    expect(button).not.toContain('12');
    // The HUD passes the prop through from the scene.
    expect(HUD_SOURCE).toContain('fateDodgeCost={fateDodgeCost}');
    expect(DUEL_SOURCE).toContain('fateDodgeCost={fateBonuses.dodgeCost}');
  });

  test('the Fate bundle is memoized from the saved Fate state and read by the duel', () => {
    expect(DUEL_SOURCE).toContain("resolveFateBonuses(playerProfile.records?.fate)");
    expect(DUEL_SOURCE).toContain('fateBonuses');
    // Both the turn dispatcher and the victory/defeat effect list it, so a
    // card chosen between duels is never read stale.
    const dispatchDeps = DUEL_SOURCE.indexOf('fateBonuses,\n      commitPanoply');
    expect(dispatchDeps).toBeGreaterThan(-1);
    const resultDeps = DUEL_SOURCE.indexOf('fateBonuses,\n  ]);');
    expect(resultDeps).toBeGreaterThan(-1);
  });
});

describe('PHASE2-FATECON-1 §C — the sidestep: scaled for the player only', () => {
  test('the duel passes the Fate-scaled distance for the player, flat 1.8 m for the opponent', () => {
    expect(DUEL_SOURCE).toContain('SIDESTEP_DISTANCE_M * fateBonuses.dodgeDistanceMultiplier');
    const at = DUEL_SOURCE.indexOf("else if (actionType === 'sidestep')");
    expect(at).toBeGreaterThan(-1);
    const branch = DUEL_SOURCE.slice(
      at,
      DUEL_SOURCE.indexOf("else if (actionType === 'shield_block')", at),
    );
    expect(branch).toContain(': SIDESTEP_DISTANCE_M,');
  });

  test('the sidestep helper keeps its 1.8 m default', () => {
    const SIDESTEP_SOURCE = code(readFileSync(join(SRC_ROOT, 'utils', 'combatSidestep.ts'), 'utf8'));
    expect(SIDESTEP_SOURCE).toContain(
      'export function sidestepPositionX(x: number, distance = SIDESTEP_DISTANCE_M): number {',
    );
  });
});

describe('PHASE2-FATECON-1 §D — the economy: Fate multiplies the final rewards', () => {
  test('the result flow multiplies the final gold and fame, last, and records the Fate share', () => {
    // The shipped purse assignment stays verbatim (duelRewards.test.ts pins it).
    expect(DUEL_SOURCE).toContain('statsRef.current.goldEarned = purse.total;');
    expect(DUEL_SOURCE).toContain('statsRef.current.goldBreakdown = purse;');
    expect(DUEL_SOURCE).toContain('statsRef.current.goldEarned += crowdReward.peakGoldBonus;');
    expect(DUEL_SOURCE).toContain('statsRef.current.fameEarned = crowdReward.fame;');
    // Fate is last in the composition order (mode → crowd peak → crowd turned
    // → Fate): the multiplication reads the post-crowd totals.
    const fateAt = DUEL_SOURCE.indexOf('const preFateGold = statsRef.current.goldEarned;');
    expect(fateAt).toBeGreaterThan(-1);
    expect(fateAt).toBeGreaterThan(DUEL_SOURCE.indexOf('statsRef.current.crowdTurned = crowdReward.crowdTurned;'));
    expect(DUEL_SOURCE).toContain(
      'statsRef.current.goldEarned = Math.round(preFateGold * fateBonuses.goldRewardMultiplier);',
    );
    expect(DUEL_SOURCE).toContain('statsRef.current.fateGoldBonus = statsRef.current.goldEarned - preFateGold;');
    expect(DUEL_SOURCE).toContain('const preFateFame = statsRef.current.fameEarned;');
    expect(DUEL_SOURCE).toContain(
      'statsRef.current.fameEarned = Math.round(preFateFame * fateBonuses.fameRewardMultiplier);',
    );
    expect(DUEL_SOURCE).toContain('statsRef.current.fateFameBonus = statsRef.current.fameEarned - preFateFame;');
    // A defeat still pays nothing: the Fate flow is victory-only.
    expect(DUEL_SOURCE).toContain('statsRef.current.goldEarned = 0;');
  });

  test('the Fate line items are in-memory only, beside the crowd-peak fields', () => {
    expect(TYPES_SOURCE).toContain('fateGoldBonus?: number;');
    expect(TYPES_SOURCE).toContain('fateFameBonus?: number;');
    const at = TYPES_SOURCE.indexOf('fateGoldBonus?: number;');
    expect(at).toBeGreaterThan(TYPES_SOURCE.indexOf('crowdPeakGoldBonus?: number;'));
  });

  test('the result modal renders the Fate lines so the breakdown adds up', () => {
    expect(RESULT_MODAL_SOURCE).toContain('data-duel-fate-gold={stats.fateGoldBonus}');
    expect(RESULT_MODAL_SOURCE).toContain('<span>Fate Bonus</span>');
    expect(RESULT_MODAL_SOURCE).toContain('<span>+{stats.fateGoldBonus}</span>');
    expect(RESULT_MODAL_SOURCE).toContain('data-duel-fate-fame={stats.fateFameBonus}');
    expect(RESULT_MODAL_SOURCE).toContain('Fate bonus: +{stats.fateFameBonus} fame');
    // The Fate gold line sits inside the gold breakdown, after the crowd-peak
    // line; the Fate fame line sits after the crowd-peak fame line.
    const goldAt = RESULT_MODAL_SOURCE.indexOf('data-duel-fate-gold=');
    expect(goldAt).toBeGreaterThan(RESULT_MODAL_SOURCE.indexOf('data-duel-crowd-peak-gold='));
    const fameAt = RESULT_MODAL_SOURCE.indexOf('data-duel-fate-fame=');
    expect(fameAt).toBeGreaterThan(RESULT_MODAL_SOURCE.indexOf('data-duel-crowd-peak-fame='));
  });
});

describe('PHASE2-FATECON-1 §E — the hype: four player-caused sites scale, the beast stays flat', () => {
  test('all four player-caused award sites multiply their added amount by the Fate factor', () => {
    // The CF-3 base amounts are unchanged — the Fate factor rides on top.
    expect(DUEL_SOURCE).toContain(
      'const fateTauntHype = isActorPlayer ? Math.round(tauntHype * fateBonuses.crowdHypeMultiplier) : tauntHype;',
    );
    expect(DUEL_SOURCE).toContain('updateCrowdHype((prev) => Math.min(100, prev + fateTauntHype));');
    expect(DUEL_SOURCE).toContain(
      'const fateBreakHype = Math.round(panoplyCfg.breakHype * fateBonuses.crowdHypeMultiplier);',
    );
    expect(DUEL_SOURCE).toContain('updateCrowdHype((prev) => Math.min(100, prev + fateBreakHype));');
    expect(DUEL_SOURCE).toContain(
      'const fateHitHype = Math.round((isCrit ? 18 + critHype : 8) * fateBonuses.crowdHypeMultiplier);',
    );
    expect(DUEL_SOURCE).toContain('updateCrowdHype((prev) => Math.min(100, prev + fateHitHype));');
    expect(DUEL_SOURCE).toContain(
      'const fateTwinHype = Math.round(TWIN_FANGS_LANDED_HYPE * fateBonuses.crowdHypeMultiplier);',
    );
    expect(DUEL_SOURCE).toContain('updateCrowdHype((prev) => Math.min(100, prev + fateTwinHype));');
    // The taunt's log and banner print the amount actually awarded.
    expect(DUEL_SOURCE).toContain('(+${fateTauntHype}% Hype)');
    expect(DUEL_SOURCE).toContain('TAUNT! +${fateTauntHype}% HYPE');
  });

  test("the beast's flight hype stays unmultiplied", () => {
    expect(DUEL_SOURCE).toContain(
      'updateCrowdHype((prev) => Math.min(100, prev + beastCfg.flightHype));',
    );
    expect(DUEL_SOURCE).not.toContain('fateBeastHype');
    expect(DUEL_SOURCE).not.toContain('flightHype * fateBonuses');
  });

  test('there are still exactly five hype award sites', () => {
    expect(DUEL_SOURCE.match(/updateCrowdHype\(\(prev\)/g)?.length).toBe(5);
  });
});

describe('PHASE2-FATECON-1 §F — the modal: the eight kinds are live, the rest stay inert', () => {
  test('the draft modal marks gold_flat and the eight kinds live', () => {
    // The literal stays so the PHASE2-FATE pin keeps reading true.
    expect(DRAFT_MODAL_SOURCE).toContain("card.effect.kind === 'gold_flat'");
    expect(DRAFT_MODAL_SOURCE).toContain('FATECON1_LIVE_EFFECT_KINDS.has(card.effect.kind)');
    expect(DRAFT_MODAL_SOURCE).toContain(
      "card.effect.kind === 'gold_flat' || FATECON1_LIVE_EFFECT_KINDS.has(card.effect.kind) ? (",
    );
  });

  test('the combat kinds and Deep Wounds are still inert', () => {
    // The live set is exactly the eight kinds — pinned in fateBonuses.test.ts,
    // where the combat kinds and unlock_technique are asserted absent. The
    // modal reads nothing else for liveness.
    expect(DRAFT_MODAL_SOURCE).not.toContain('damage_pct');
    expect(DRAFT_MODAL_SOURCE).not.toContain('unlock_technique');
    expect(DRAFT_MODAL_SOURCE).not.toContain('once_per_bout_survival');
  });
});
