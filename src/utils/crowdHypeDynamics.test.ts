/**
 * C-8.70C — the crowd, two-edged: the live rule's honesty suite.
 *
 * One section per claim the slice makes:
 *
 *   §A decay — the per-venue rate, the passive acceleration, the floor at 0 and
 *      the "a paused duel does not cool" cases.
 *   §B embolden — the shift is 0 below the threshold, starts at +0.05 AT it,
 *      runs linearly to the cap at 90, and NEVER exceeds +0.15.
 *   §C the crowd turning — the second half is elapsed time against the config's
 *      expectation, the threshold comparison is strict, and the flag needs BOTH.
 *   §D the peak bonus — base × (peak/100 × factor), rounded, and the turned
 *      multiplier applies to FAME only (gold is never reduced).
 *   §E the rage feed — hype scales the rate for Aurelius's mechanic and for
 *      nobody else, with another boss and a regular row as the controls.
 *   §F the config — every value, each marked design or authored.
 *   §G the wiring — the two chooser calls, the HUD's words, the result screen's
 *      two lines, and the proof that `combatCalculations.ts` gained nothing.
 *
 * Run with: `bun test src/utils/crowdHypeDynamics.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CROWD_CONFIG, crowdTierTuning, type CrowdConfig } from '../data/crowdConfig';
import {
  advanceCrowdRageCharge,
  applyCrowdHypeDecay,
  clampCrowdHype,
  crowdDecayPerSecond,
  crowdDuelReward,
  crowdEmboldenedAggression,
  crowdEmboldenShift,
  crowdIsPassive,
  crowdOffensiveAction,
  crowdPeakBonus,
  crowdRageDamageMultiplier,
  crowdRageFeedApplies,
  crowdRageRateMultiplier,
  crowdSecondHalfStartSeconds,
  crowdTurnsNow,
  isCrowdSecondHalf,
  readCrowdHypeState,
} from './crowdDynamics';
import { ALL_OPPONENTS } from '../data/opponents';

const source = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
/** Comments stripped: prose can neither satisfy nor defeat a check. */
const code = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const DUEL_SCENE = code(source('../../src/components/duel/DuelScene.tsx'));
const COMBAT_HUD = source('../../src/components/ui/CombatHUD.tsx');
const RESULT_MODAL = source('../../src/components/hub/DuelResultModal.tsx');
const CALCULATIONS = source('../../src/utils/combatCalculations.ts');

const roster = (id: string) => {
  const found = ALL_OPPONENTS.find((opponent) => opponent.id === id);
  if (!found) throw new Error(`roster has no ${id}`);
  return found;
};

// ══════════════════════════════════════════════════════════════════════════
// §A — decay
// ══════════════════════════════════════════════════════════════════════════
describe('C-8.70C §A — decay', () => {
  test('the rate rises with the venue tier', () => {
    expect(crowdDecayPerSecond(1, false)).toBe(1.0);
    expect(crowdDecayPerSecond(2, false)).toBe(1.2);
    expect(crowdDecayPerSecond(3, false)).toBe(1.4);
    expect(crowdDecayPerSecond(4, false)).toBe(1.6);
    // A tier above 4 clamps to the top venue; a missing one reads as tier 1.
    expect(crowdDecayPerSecond(9, false)).toBe(1.6);
    expect(crowdDecayPerSecond(undefined, false)).toBe(1.0);
    expect(crowdDecayPerSecond(Number.NaN, false)).toBe(1.0);
  });

  test('one second of watching removes exactly the rate', () => {
    expect(applyCrowdHypeDecay({ hype: 50, tier: 1, passive: false, dtSeconds: 1 })).toBe(49);
    expect(applyCrowdHypeDecay({ hype: 50, tier: 4, passive: false, dtSeconds: 1 })).toBe(48.4);
    expect(applyCrowdHypeDecay({ hype: 50, tier: 1, passive: false, dtSeconds: 2 })).toBe(48);
  });

  test('the passive window accelerates it, by the multiplier and no more', () => {
    expect(crowdDecayPerSecond(1, true)).toBe(2.0);
    expect(applyCrowdHypeDecay({ hype: 50, tier: 1, passive: true, dtSeconds: 1 })).toBe(48);
    // Exactly the config's multiplier, derived rather than restated.
    for (const tier of [1, 2, 3, 4] as const) {
      const tuning = crowdTierTuning(tier);
      expect(crowdDecayPerSecond(tier, true)).toBeCloseTo(
        tuning.decayRatePerSecond * tuning.passiveDecayMultiplier,
        10,
      );
    }
  });

  test('the passive window is a whole window of silence, per tier', () => {
    const windowMs = crowdTierTuning(1).passiveWindowSeconds * 1000;
    expect(crowdIsPassive(windowMs - 1, 1)).toBe(false);
    expect(crowdIsPassive(windowMs, 1)).toBe(true);
    expect(crowdIsPassive(windowMs + 500, 1)).toBe(true);
    // A junk reading is not evidence of silence.
    expect(crowdIsPassive(Number.NaN, 1)).toBe(false);
  });

  test('decay floors at zero and never goes negative', () => {
    expect(applyCrowdHypeDecay({ hype: 0.5, tier: 4, passive: true, dtSeconds: 10 })).toBe(0);
    expect(applyCrowdHypeDecay({ hype: 0, tier: 1, passive: true, dtSeconds: 1 })).toBe(0);
  });

  test('a tick that is not a positive number cools nothing', () => {
    for (const dtSeconds of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(applyCrowdHypeDecay({ hype: 42, tier: 1, passive: true, dtSeconds })).toBe(42);
    }
  });

  test('a hype reading above the ceiling is clamped before it decays', () => {
    expect(clampCrowdHype(150)).toBe(100);
    expect(clampCrowdHype(-20)).toBe(0);
    expect(clampCrowdHype(Number.NaN)).toBe(0);
    expect(applyCrowdHypeDecay({ hype: 150, tier: 1, passive: false, dtSeconds: 1 })).toBe(99);
  });

  test('only the two attacks count as offensive actions', () => {
    expect(crowdOffensiveAction('quick_attack')).toBe(true);
    expect(crowdOffensiveAction('power_attack')).toBe(true);
    for (const action of ['shield_block', 'dodge', 'taunt', 'rest', 'advance', 'retreat', 'cast_net']) {
      expect(crowdOffensiveAction(action), action).toBe(false);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// §B — embolden
// ══════════════════════════════════════════════════════════════════════════
describe('C-8.70C §B — embolden', () => {
  test('never below the threshold', () => {
    for (const hype of [0, 20, 40, 69, 69.999]) {
      expect(crowdEmboldenShift(hype), String(hype)).toBe(0);
      expect(readCrowdHypeState(hype).isEmboldened, String(hype)).toBe(false);
    }
  });

  test('the endpoints are the design’s', () => {
    expect(crowdEmboldenShift(70)).toBe(0.05);
    expect(crowdEmboldenShift(80)).toBeCloseTo(0.1, 10);
    expect(crowdEmboldenShift(90)).toBe(0.15);
    expect(crowdEmboldenShift(100)).toBe(0.15);
  });

  test('it is linear between the two thresholds', () => {
    const a = crowdEmboldenShift(75) - crowdEmboldenShift(70);
    const b = crowdEmboldenShift(85) - crowdEmboldenShift(80);
    expect(a).toBeCloseTo(b, 10);
    expect(crowdEmboldenShift(75)).toBeCloseTo(0.075, 10);
  });

  test('never above the cap, for any hype in the band', () => {
    for (let hype = 0; hype <= 100; hype += 0.5) {
      expect(crowdEmboldenShift(hype)).toBeLessThanOrEqual(CROWD_CONFIG.emboldenCap);
      expect(crowdEmboldenShift(hype)).toBeGreaterThanOrEqual(0);
    }
  });

  test('the effective aggression is base + shift, capped at 1', () => {
    expect(crowdEmboldenedAggression(0.8, 90)).toBeCloseTo(0.95, 10);
    expect(crowdEmboldenedAggression(0.9, 90)).toBe(1);
    expect(crowdEmboldenedAggression(0.8, 25)).toBe(0.8);
    // A base the chooser's own fallback owns is passed through untouched.
    expect(Number.isNaN(crowdEmboldenedAggression(Number.NaN, 100))).toBe(true);
    expect(crowdEmboldenedAggression(Number.POSITIVE_INFINITY, 100)).toBe(Number.POSITIVE_INFINITY);
  });

  test('the public reader reports hype, band and shift together', () => {
    expect(readCrowdHypeState(95)).toEqual({ hype: 95, isEmboldened: true, shift: 0.15 });
    expect(readCrowdHypeState(30)).toEqual({ hype: 30, isEmboldened: false, shift: 0 });
    expect(readCrowdHypeState(140).hype).toBe(100);
  });

  test('the shift reads the config it is handed, not a literal', () => {
    const tight: CrowdConfig = { ...CROWD_CONFIG, emboldenCap: 0.3, emboldenFloorShift: 0.1 };
    expect(crowdEmboldenShift(70, tight)).toBe(0.1);
    expect(crowdEmboldenShift(90, tight)).toBe(0.3);
    expect(crowdEmboldenShift(69, tight)).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// §C — the crowd turns
// ══════════════════════════════════════════════════════════════════════════
describe('C-8.70C §C — the crowd turns', () => {
  test('the second half is elapsed time against the config’s expectation', () => {
    expect(crowdSecondHalfStartSeconds()).toBe(45);
    expect(isCrowdSecondHalf(44.9)).toBe(false);
    expect(isCrowdSecondHalf(45)).toBe(true);
    expect(isCrowdSecondHalf(180)).toBe(true);
    expect(isCrowdSecondHalf(Number.NaN)).toBe(false);
  });

  test('it needs a cold crowd AND the second half', () => {
    expect(crowdTurnsNow(19, 60)).toBe(true);
    expect(crowdTurnsNow(0, 60)).toBe(true);
    // Exactly the threshold is NOT cold (strict).
    expect(crowdTurnsNow(20, 60)).toBe(false);
    expect(crowdTurnsNow(45, 60)).toBe(false);
    // Cold, but too early.
    expect(crowdTurnsNow(10, 44)).toBe(false);
    expect(crowdTurnsNow(10, 45)).toBe(true);
  });

  test('the threshold comes from the config', () => {
    const strict: CrowdConfig = { ...CROWD_CONFIG, crowdTurnedThreshold: 35 };
    expect(crowdTurnsNow(30, 90, strict)).toBe(true);
    expect(crowdTurnsNow(30, 90)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// §D — the rewards
// ══════════════════════════════════════════════════════════════════════════
describe('C-8.70C §D — the peak bonus and the turning', () => {
  test('the peak bonus is base × (peak/100 × factor), rounded', () => {
    expect(crowdPeakBonus(100, 0.25, 100)).toBe(25);
    expect(crowdPeakBonus(100, 0.25, 80)).toBe(20);
    expect(crowdPeakBonus(1000, 0.1, 100)).toBe(100);
    expect(crowdPeakBonus(500, 0.25, 0)).toBe(0);
    // 100 × 0.53 × 0.25 = 13.25 → 13
    expect(crowdPeakBonus(100, 0.25, 53)).toBe(13);
  });

  test('a malformed base or factor pays nothing', () => {
    expect(crowdPeakBonus(Number.NaN, 0.25, 100)).toBe(0);
    expect(crowdPeakBonus(-50, 0.25, 100)).toBe(0);
    expect(crowdPeakBonus(100, 0, 100)).toBe(0);
    expect(crowdPeakBonus(100, Number.NaN, 100)).toBe(0);
  });

  test('a spectacular fight pays both bonuses on top of the base', () => {
    const reward = crowdDuelReward({
      baseFame: 500,
      baseGold: 1000,
      crowdHypePeak: 100,
      crowdTurned: false,
    });
    expect(reward.peakFameBonus).toBe(125);
    expect(reward.peakGoldBonus).toBe(100);
    expect(reward.fame).toBe(625);
    expect(reward.fameLost).toBe(0);
    expect(reward.crowdTurned).toBe(false);
  });

  test('the turning multiplies FAME and never touches gold', () => {
    const turned = crowdDuelReward({
      baseFame: 500,
      baseGold: 1000,
      crowdHypePeak: 100,
      crowdTurned: true,
    });
    expect(turned.fameBeforeTurn).toBe(625);
    expect(turned.fame).toBe(500); // 625 × 0.8
    expect(turned.fameLost).toBe(125);
    expect(turned.crowdTurned).toBe(true);
    // The gold side is identical whether the crowd turned or not.
    const unturned = crowdDuelReward({
      baseFame: 500,
      baseGold: 1000,
      crowdHypePeak: 100,
      crowdTurned: false,
    });
    expect(turned.peakGoldBonus).toBe(unturned.peakGoldBonus);
  });

  test('a cold second half costs fame on a cold peak, and pays no peak bonus', () => {
    const reward = crowdDuelReward({
      baseFame: 200,
      baseGold: 300,
      crowdHypePeak: 10,
      crowdTurned: true,
    });
    expect(reward.peakFameBonus).toBe(crowdPeakBonus(200, CROWD_CONFIG.peakFameFactor, 10));
    expect(reward.peakGoldBonus).toBeLessThanOrEqual(4); // 300 × 0.1 × 0.1 = 3
    expect(reward.fame).toBeLessThan(reward.fameBeforeTurn);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// §E — the rage feed, and its controls
// ══════════════════════════════════════════════════════════════════════════
describe('C-8.70C §E — the rage feed is Aurelius’s alone', () => {
  const aurelius = roster('opp_aurelius_boss');
  const goliath = roster('opp_goliath_boss');
  const regular = roster('opp_marcus');

  test('only Aurelius’s boss mechanic qualifies', () => {
    expect(aurelius.bossMechanic).toBe('rage_mode_colossus');
    expect(crowdRageFeedApplies(aurelius)).toBe(true);
  });

  test('CONTROL — another boss and a regular opponent do not', () => {
    expect(goliath.isBoss).toBe(true);
    expect(goliath.bossMechanic).not.toBe('rage_mode_colossus');
    expect(crowdRageFeedApplies(goliath)).toBe(false);
    expect(crowdRageFeedApplies(regular)).toBe(false);
  });

  test('CONTROL — a copied mechanic on a non-boss is still refused', () => {
    expect(
      crowdRageFeedApplies({ isBoss: false, bossMechanic: 'rage_mode_colossus' }),
    ).toBe(false);
    expect(crowdRageFeedApplies(null)).toBe(false);
    expect(crowdRageFeedApplies(undefined)).toBe(false);
  });

  test('the rate scales with hype by the config factor', () => {
    expect(crowdRageRateMultiplier(0)).toBe(1);
    expect(crowdRageRateMultiplier(50)).toBeCloseTo(1.25, 10);
    expect(crowdRageRateMultiplier(100)).toBeCloseTo(1.5, 10);
    expect(crowdRageRateMultiplier(Number.NaN)).toBe(1);
  });

  test('the charge builds measurably faster at high hype', () => {
    const low = advanceCrowdRageCharge(0, 0, 1);
    const high = advanceCrowdRageCharge(0, 100, 1);
    expect(low).toBeCloseTo(0.5, 10);
    expect(high).toBeCloseTo(0.75, 10);
    expect(high).toBeGreaterThan(low);
    // Time to full: 2 s at hype 0, ~1.33 s at hype 100.
    expect(advanceCrowdRageCharge(0, 0, 2)).toBe(1);
    let charge = 0;
    let seconds = 0;
    while (charge < 1 && seconds < 10) {
      charge = advanceCrowdRageCharge(charge, 100, 1 / 60);
      seconds += 1 / 60;
    }
    expect(seconds).toBeLessThan(1.4);
  });

  test('the charge saturates at 1 and junk input cannot move it', () => {
    expect(advanceCrowdRageCharge(0.9, 100, 10)).toBe(1);
    expect(advanceCrowdRageCharge(0.4, 100, 0)).toBe(0.4);
    expect(advanceCrowdRageCharge(0.4, 100, Number.NaN)).toBe(0.4);
    expect(advanceCrowdRageCharge(Number.NaN, 100, 1)).toBeCloseTo(0.75, 10);
  });

  test('the multiplier ramps 1.0 → the shipped 1.25 and no further', () => {
    expect(crowdRageDamageMultiplier(0)).toBe(1);
    expect(crowdRageDamageMultiplier(0.5)).toBeCloseTo(1.125, 10);
    expect(crowdRageDamageMultiplier(1)).toBe(1.25);
    expect(crowdRageDamageMultiplier(5)).toBe(1.25);
    expect(crowdRageDamageMultiplier(Number.NaN)).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// §F — the config
// ══════════════════════════════════════════════════════════════════════════
describe('C-8.70C §F — the config', () => {
  test('the design values are the brief’s', () => {
    expect(CROWD_CONFIG.emboldenThreshold).toBe(70);
    expect(CROWD_CONFIG.emboldenCap).toBe(0.15);
    expect(CROWD_CONFIG.emboldenFullThreshold).toBe(90);
    expect(CROWD_CONFIG.emboldenFloorShift).toBe(0.05);
    expect(CROWD_CONFIG.crowdTurnedThreshold).toBe(20);
  });

  test('the authored values are pinned so they cannot drift silently', () => {
    expect(CROWD_CONFIG.expectedDuelSeconds).toBe(90);
    expect(CROWD_CONFIG.turnedFameFactor).toBe(0.8);
    expect(CROWD_CONFIG.peakFameFactor).toBe(0.25);
    expect(CROWD_CONFIG.peakGoldFactor).toBe(0.1);
    expect(CROWD_CONFIG.rageFeedFactor).toBe(0.5);
    expect(CROWD_CONFIG.rageAccumulationPerSecond).toBe(0.5);
    for (const tier of [1, 2, 3, 4] as const) {
      expect(crowdTierTuning(tier).passiveDecayMultiplier).toBe(2);
      expect(crowdTierTuning(tier).passiveWindowSeconds).toBe(6);
    }
    expect(CROWD_CONFIG.turnedFameFactor).toBeLessThan(1);
  });

  test('the one value-identical migration still carries the purse’s own numbers', () => {
    expect(CROWD_CONFIG.crowdFavour).toEqual({ floor: 50, step: 25, stepRate: 0.1 });
    expect(CROWD_CONFIG.hypeCeiling).toBe(100);
  });

  test('the tune table only grows with the tier', () => {
    const rates = [1, 2, 3, 4].map((tier) => crowdTierTuning(tier).decayRatePerSecond);
    for (let i = 1; i < rates.length; i += 1) expect(rates[i]).toBeGreaterThan(rates[i - 1]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// §G — the wiring
// ══════════════════════════════════════════════════════════════════════════
describe('C-8.70C §G — the wiring', () => {
  test('the embolden shift enters as an INPUT to the existing chooser', () => {
    // The value is folded into the aggression variable the shipped calls read …
    expect(DUEL_SCENE).toContain('crowdEmboldenedAggression(aiAggression, crowdHypeRef.current, CROWD_CONFIG)');
    // … and both shipped chooser calls are still there, by the same names.
    expect(DUEL_SCENE).toContain('chooseAIStandardAction(aiAggression, aiBlockChance)');
    expect(DUEL_SCENE).toContain('chooseAIStandardAction(opponent.aggression, opponent.blockChance)');
    expect(DUEL_SCENE).toContain('masterAloneAggression(opponent.aggression, beastCfg.masterAloneAggressionBonus)');
    // The named-read branch is what carries the shift for a plain row.
    expect(DUEL_SCENE).toContain('panoplyCfg || longMemoryCfg || emboldenShift > 0');
  });

  test('combatCalculations.ts gained nothing: no crowd import, formulas intact', () => {
    expect(code(CALCULATIONS)).not.toMatch(/crowd/i);
    expect(CALCULATIONS).toContain('export const RAGE_DAMAGE_MULTIPLIER = 1.25;');
    expect(CALCULATIONS).toContain('const quickCutoff = agg * OFFENSIVE_QUICK_SHARE;');
    expect(CALCULATIONS).toContain('const blockCutoff = agg + (1 - agg) * blk;');
    expect(CALCULATIONS).toContain('export function chooseAIStandardAction(');
  });

  test('the duel’s live loop runs the clock, the latch and the charge', () => {
    expect(DUEL_SCENE).toContain('applyCrowdHypeDecay({');
    expect(DUEL_SCENE).toContain('crowdIsPassive(');
    expect(DUEL_SCENE).toContain('crowdTurnsNow(');
    expect(DUEL_SCENE).toContain('advanceCrowdRageCharge(');
    expect(DUEL_SCENE).toContain('crowdDuelReward({');
    expect(DUEL_SCENE).toContain('statsRef.current.crowdTurned = crowdReward.crowdTurned;');
    // The offensive stamp is taken at the one dispatch both fighters resolve through.
    expect(DUEL_SCENE).toContain('if (crowdOffensiveAction(actionType)) lastOffensiveActionAtRef.current = Date.now();');
    // The peak is still only raised by updateCrowdHype.
    expect(DUEL_SCENE).toContain('updateHypePeak(statsRef.current.crowdHypePeak, next)');
  });

  test('the CF-3 hype numbers are untouched by this slice', () => {
    expect(DUEL_SCENE).toContain('const [crowdHype, setCrowdHype] = useState(25);');
    expect(DUEL_SCENE).toContain('const crowdHypeRef = useRef(25);');
    expect(DUEL_SCENE).toContain('crowdHypePeak: 25,');
    expect(DUEL_SCENE).toContain('updateCrowdHype((prev) => Math.min(100, prev + (isCrit ? 18 + critHype : 8)));');
    expect(DUEL_SCENE).toContain("const tauntHype = 20 + applyPalmaEvent(playerMods.block, 'taunt').hypeAdd;");
    const awards = DUEL_SCENE.match(/updateCrowdHype\(\(prev\)/g) ?? [];
    expect(awards).toHaveLength(5);
  });

  test('the HUD says both things in words, inside the meter it describes', () => {
    expect(COMBAT_HUD).toContain('The crowd roars — {crowdEmbolden.name} fights emboldened');
    expect(COMBAT_HUD).toContain('The roar feeds his rage');
    expect(COMBAT_HUD).toContain('data-crowd-embolden={crowdEmbolden.shift.toFixed(2)}');
    expect(COMBAT_HUD).toContain('crowdEmbolden?: CrowdEmboldenInfo | null;');
    expect(COMBAT_HUD).toContain('bossRageFed?: boolean;');
    // The lines live inside the hype meter, not in a second overlay.
    const meter = COMBAT_HUD.slice(COMBAT_HUD.indexOf('CROWD HYPE'));
    const panel = meter.slice(0, meter.indexOf('<TurnActionPanel'));
    expect(panel).toContain('crowd-state-lines');
  });

  test('the result screen carries both lines', () => {
    expect(RESULT_MODAL).toContain('The crowd turned — fame reduced');
    expect(RESULT_MODAL).toContain('Crowd&apos;s favor: +{stats.crowdPeakFameBonus} fame');
    expect(RESULT_MODAL).toContain('stats.crowdPeakGoldBonus');
    expect(RESULT_MODAL).toContain('data-duel-crowd-turned="1"');
  });

  test('the duel hands the HUD exactly those two facts', () => {
    expect(DUEL_SCENE).toContain('crowdEmbolden={');
    expect(DUEL_SCENE).toContain('bossRageFed={crowdRageFeedApplies(opponent) && crowdHypeState.isEmboldened}');
    expect(DUEL_SCENE).toContain('readCrowdHypeState(crowdHype, CROWD_CONFIG)');
  });
});
