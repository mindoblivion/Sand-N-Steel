/**
 * ===========================================================================
 * C-8.70C — THE HONESTY SUITE (Sand / Steel / Invictus bout modes)
 * ===========================================================================
 * The claims the pre-fight card makes are checked against the data and the
 * shipped functions the duel reads:
 *
 *   §A the three modes themselves (the published multipliers, the trait slot
 *      omitted, Invictus's 40-hype opening, the Sand default);
 *   §B EVERY roster row keeps byte-identical base stats across the three modes
 *      (deep-equal on the whole `stats` block, every other field unchanged);
 *   §C the published Steel delta and its [0.05, 0.95] clamp on every row;
 *   §D the crowd — opening hype and the effective-tier decay mapping read from
 *      the C-B config (Invictus T1→T2 rate … T4→own × 1.25 = 2.0);
 *   §E the reward COMPOSITION ORDER: mode first, then the crowd's peak, then
 *      the turning (fame only), with exact figures;
 *   §F Grudge Bouts fight in any mode: the studied shift and the Steel delta
 *      compose additively, inside [0.05, 0.95] and a ±0.20 total shift, and the
 *      composed values are what the card prints;
 *   §G the telegraph floor — Steel/Invictus only, never below 0.8s, Sand exact;
 *   §H the selector defaults to Sand and the card lists every effect;
 *   §I the card's words carry the real numbers (no trait is ever named).
 *
 * Run with: `bun test src/utils/boutModes.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BOUT_MODES,
  BOUT_MODE_ORDER,
  BOUT_PROFILE_CLAMP,
  DEFAULT_BOUT_MODE,
  DEFAULT_STEEL_DELTA,
  INVICTUS_CROWD_START_HYPE,
  INVICTUS_TOP_TIER_DECAY_FACTOR,
  MAX_PROFILE_SHIFT,
  TELEGRAPH_FLOOR_SECONDS,
  VENUE_DEFAULT_CROWD_START_HYPE,
  boutModeEffectLines,
  boutModeProfileLine,
  modeCrowdDecayMultiplier,
  modeCrowdDecayRate,
  modeCrowdDecayTier,
  modeCrowdStartHype,
  modeRewardBases,
  modeTelegraphWindowMs,
  modeTelegraphWindowSeconds,
  resolveBoutOpponent,
  resolveBoutProfile,
} from '../data/boutModes';
import { ALL_OPPONENTS, DOCTORE_TEST_OPPONENT } from '../data/opponents';
import { PALMAE } from '../data/palmae';
import { CROWD_CONFIG } from '../data/crowdConfig';
import { applyCrowdHypeDecay, crowdDuelReward } from './crowdDynamics';
import { calculateDuelGold } from './duelRewards';
import { buildGrudgeOpponent } from './grudgeBouts';
import { SAFE_SUBSET_PALMAE_ORDER, extraPalmaFor } from './extraPalmae';
import { turnResolutionMs } from '../components/duel/DuelScene';
import type { BoutMode, OpponentConfig } from '../types/game';

const HERE = dirname(fileURLToPath(import.meta.url));
const repoPath = (relative: string) => normalize(join(HERE, '..', '..', relative));
const readSource = (relative: string) => readFileSync(repoPath(relative), 'utf8');

const MODES: BoutMode[] = ['sand', 'steel', 'invictus'];
const ROSTER: OpponentConfig[] = [...ALL_OPPONENTS, DOCTORE_TEST_OPPONENT];

const byId = (id: string): OpponentConfig => {
  const found = ALL_OPPONENTS.find((row) => row.id === id);
  if (!found) throw new Error(`roster has no ${id}`);
  return found;
};

const withoutProfile = (row: OpponentConfig) => {
  const { aggression: _a, blockChance: _b, stats: _s, ...rest } = row;
  return rest;
};

/** `palmae` is carved out separately: C3b's grant is the one legal mode change. */
const withoutProfileAndPalmae = (row: OpponentConfig) => {
  const { aggression: _a, blockChance: _b, stats: _s, palmae: _p, ...rest } = row;
  return rest;
};

describe('C-8.70C §A — the three modes, as data', () => {
  test('Sand is the default and the selector starts with it', () => {
    expect(DEFAULT_BOUT_MODE).toBe('sand');
    expect(BOUT_MODE_ORDER[0]).toBe('sand');
    expect(BOUT_MODE_ORDER).toEqual(['sand', 'steel', 'invictus']);
  });

  test('the published reward multipliers are exact', () => {
    expect(BOUT_MODES.sand.goldMultiplier).toBe(1);
    expect(BOUT_MODES.sand.fameMultiplier).toBe(1);
    expect(BOUT_MODES.steel.goldMultiplier).toBe(1.25);
    expect(BOUT_MODES.steel.fameMultiplier).toBe(1.5);
    expect(BOUT_MODES.invictus.goldMultiplier).toBe(1.5);
    expect(BOUT_MODES.invictus.fameMultiplier).toBe(2);
  });

  test('the trait grant is Steel/Invictus only — Sand grants nothing (design C3b)', () => {
    expect(BOUT_MODES.sand.grantsExtraPalma).toBe(false);
    expect(BOUT_MODES.steel.grantsExtraPalma).toBe(true);
    expect(BOUT_MODES.invictus.grantsExtraPalma).toBe(true);
    // The retired null fallback is gone from the data, not merely unused.
    expect(Object.keys(BOUT_MODES.steel)).not.toContain('traitGrant');
  });

  test('Invictus opens hot at 40; Sand and Steel keep the venue default (25)', () => {
    expect(INVICTUS_CROWD_START_HYPE).toBe(40);
    expect(VENUE_DEFAULT_CROWD_START_HYPE).toBe(25);
    expect(modeCrowdStartHype('sand')).toBe(25);
    expect(modeCrowdStartHype('steel')).toBe(25);
    expect(modeCrowdStartHype('invictus')).toBe(40);
    expect(BOUT_MODES.invictus.crowdStartHype).toBe(40);
    expect(BOUT_MODES.sand.crowdStartHype).toBeNull();
    expect(BOUT_MODES.steel.crowdStartHype).toBeNull();
  });

  test('the clamp and the total-shift cap are the published values', () => {
    expect(BOUT_PROFILE_CLAMP).toEqual({ min: 0.05, max: 0.95 });
    expect(MAX_PROFILE_SHIFT).toBe(0.2);
    expect(TELEGRAPH_FLOOR_SECONDS).toBe(0.8);
  });
});

describe('C-8.70C §B — every row’s base stats are identical in all three modes', () => {
  test('the roster is the full cast (17 ladder/feature rows + the Doctore’s champion)', () => {
    // STORY-4b — the Bounty Hall board appends six rows to the roster (five rungs
    // plus the Deserter). `LADDER_OPPONENTS` and `FEATURE_BOUT_OPPONENTS` are
    // unchanged: both fences now exclude `bountyBout` rows.
    expect(ALL_OPPONENTS.length).toBe(23);
    // STORY-4b — six more rows, so the full cast plus the Doctore's champion is 24.
    expect(ROSTER.length).toBe(24);
  });

  test('every opponent’s stat block deep-equals across Sand/Steel/Invictus', () => {
    for (const row of ROSTER) {
      const sand = resolveBoutOpponent('sand', row).stats;
      const steel = resolveBoutOpponent('steel', row).stats;
      const invictus = resolveBoutOpponent('invictus', row).stats;
      expect(sand).toEqual(row.stats);
      expect(steel).toEqual(row.stats);
      expect(invictus).toEqual(row.stats);
      expect(steel).toEqual(sand);
      expect(invictus).toEqual(sand);
    }
  });

  test('every OTHER field — gear, rewards, tier, mechanic — is unchanged by a mode', () => {
    for (const row of ROSTER) {
      const baseline = withoutProfileAndPalmae(row);
      for (const mode of MODES) {
        const resolved = resolveBoutOpponent(mode, row);
        expect(withoutProfileAndPalmae(resolved)).toEqual(baseline);
        expect(resolved.rewardGold).toBe(row.rewardGold);
        expect(resolved.rewardFame).toBe(row.rewardFame);
        expect(resolved.rewardXp).toBe(row.rewardXp);
      }
    }
  });

  test('`palmae` is the ONE field a mode may touch — and only by C3b’s grant', () => {
    for (const row of ROSTER) {
      const extra = extraPalmaFor(row);
      for (const mode of MODES) {
        const resolved = resolveBoutOpponent(mode, row);
        const expected =
          BOUT_MODES[mode].grantsExtraPalma && extra
            ? [...(row.palmae ?? []), extra]
            : row.palmae;
        expect(resolved.palmae, `${row.id}/${mode}`).toEqual(expected);
        // Sand never appends, and no row's array is mutated in place.
        if (!BOUT_MODES[mode].grantsExtraPalma) expect(resolved.palmae).toEqual(row.palmae);
      }
    }
  });

  test('resolution never mutates the roster row', () => {
    for (const row of ROSTER) {
      const before = JSON.parse(JSON.stringify(row));
      for (const mode of MODES) resolveBoutOpponent(mode, row);
      expect(JSON.parse(JSON.stringify(row))).toEqual(before);
    }
  });
});

describe('C-8.70C §C — the published Steel delta, clamped to [0.05, 0.95]', () => {
  test('every row carries the default +0.05 / +0.05 (no authored variation)', () => {
    for (const row of ROSTER) {
      expect(row.steelDelta).toEqual(DEFAULT_STEEL_DELTA);
      expect(row.steelDelta).toEqual({ aggression: 0.05, blockChance: 0.05 });
    }
  });

  test('Sand is the row exactly; Steel and Invictus are row + 0.05 (or the clamp)', () => {
    for (const row of ROSTER) {
      const sand = resolveBoutProfile('sand', row);
      expect(sand.aggression).toBe(row.aggression);
      expect(sand.blockChance).toBe(row.blockChance);
      for (const mode of ['steel', 'invictus'] as BoutMode[]) {
        const sharpened = resolveBoutProfile(mode, row);
        expect(sharpened.aggression).toBe(
          Math.min(0.95, Math.round((row.aggression + 0.05) * 1e6) / 1e6),
        );
        expect(sharpened.blockChance).toBe(
          Math.min(0.95, Math.round((row.blockChance + 0.05) * 1e6) / 1e6),
        );
      }
    }
  });

  test('the clamp holds at the ceiling — a 0.95 row, a 0.93 row and Aurelius', () => {
    const synthetic = (aggression: number, blockChance: number): OpponentConfig => ({
      ...byId('opp_marcus'),
      aggression,
      blockChance,
      steelDelta: DEFAULT_STEEL_DELTA,
    });
    expect(resolveBoutProfile('steel', synthetic(0.95, 0.95))).toEqual({
      aggression: 0.95,
      blockChance: 0.95,
    });
    expect(resolveBoutProfile('steel', synthetic(0.93, 0.93))).toEqual({
      aggression: 0.95,
      blockChance: 0.95,
    });
    const aurelius = resolveBoutProfile('invictus', byId('opp_aurelius_boss'));
    expect(aurelius.aggression).toBe(0.95);
    expect(aurelius.blockChance).toBe(0.75);
  });

  test('no mode can push any real row outside the clamp', () => {
    for (const row of ROSTER) {
      for (const mode of MODES) {
        const profile = resolveBoutProfile(mode, row);
        expect(profile.aggression).toBeGreaterThanOrEqual(0.05);
        expect(profile.aggression).toBeLessThanOrEqual(0.95);
        expect(profile.blockChance).toBeGreaterThanOrEqual(0.05);
        expect(profile.blockChance).toBeLessThanOrEqual(0.95);
      }
    }
  });
});

describe('C-8.70C §D — the crowd: Invictus starts at 40 and cools at the NEXT tier’s rate', () => {
  test('the C-B config is the one source of the rates (1.0 / 1.2 / 1.4 / 1.6)', () => {
    expect(CROWD_CONFIG.tiers[1].decayRatePerSecond).toBe(1.0);
    expect(CROWD_CONFIG.tiers[2].decayRatePerSecond).toBe(1.2);
    expect(CROWD_CONFIG.tiers[3].decayRatePerSecond).toBe(1.4);
    expect(CROWD_CONFIG.tiers[4].decayRatePerSecond).toBe(1.6);
  });

  test('Sand and Steel read the venue’s own tier and rate', () => {
    for (const mode of ['sand', 'steel'] as BoutMode[]) {
      for (const tier of [1, 2, 3, 4]) {
        expect(modeCrowdDecayTier(mode, tier)).toBe(tier);
        expect(modeCrowdDecayMultiplier(mode, tier)).toBe(1);
        expect(modeCrowdDecayRate(mode, tier)).toBe([1.0, 1.2, 1.4, 1.6][tier - 1]);
      }
    }
  });

  test('Invictus T1→T2 rate, T2→T3, T3→T4, and T4 uses its own rate × 1.25 = 2.0', () => {
    expect(modeCrowdDecayTier('invictus', 1)).toBe(2);
    expect(modeCrowdDecayTier('invictus', 2)).toBe(3);
    expect(modeCrowdDecayTier('invictus', 3)).toBe(4);
    expect(modeCrowdDecayTier('invictus', 4)).toBe(4);
    expect(modeCrowdDecayRate('invictus', 1)).toBe(1.2);
    expect(modeCrowdDecayRate('invictus', 2)).toBe(1.4);
    expect(modeCrowdDecayRate('invictus', 3)).toBe(1.6);
    expect(modeCrowdDecayRate('invictus', 4)).toBe(2.0);
    expect(modeCrowdDecayRate('invictus', 4)).toBe(
      CROWD_CONFIG.tiers[4].decayRatePerSecond * INVICTUS_TOP_TIER_DECAY_FACTOR,
    );
  });

  test('the decay the duel applies equals the mapping (one second off the opening 40)', () => {
    const decayed = applyCrowdHypeDecay({
      hype: 40,
      tier: modeCrowdDecayTier('invictus', 1),
      passive: false,
      dtSeconds: 1,
      rateMultiplier: modeCrowdDecayMultiplier('invictus', 1),
    });
    expect(decayed).toBe(38.8);
    const top = applyCrowdHypeDecay({
      hype: 40,
      tier: modeCrowdDecayTier('invictus', 4),
      passive: false,
      dtSeconds: 1,
      rateMultiplier: modeCrowdDecayMultiplier('invictus', 4),
    });
    expect(top).toBe(38);
  });
});

describe('C-8.70C §E — reward composition is MODE FIRST, then the crowd', () => {
  const marcus = byId('opp_marcus');

  test('the mode multiplies the row’s bases and leaves XP alone', () => {
    expect(modeRewardBases('sand', marcus)).toEqual({ goldBase: 35, fameBase: 10 });
    expect(modeRewardBases('steel', marcus)).toEqual({ goldBase: 44, fameBase: 15 });
    expect(modeRewardBases('invictus', marcus)).toEqual({ goldBase: 53, fameBase: 20 });
  });

  test('Steel: purse and crowd bonuses computed on the mode-adjusted bases', () => {
    const bases = modeRewardBases('steel', marcus);
    const purse = calculateDuelGold({
      baseGold: bases.goldBase,
      didWin: true,
      crowdHypePeak: 100,
      perfectBlocks: 0,
      damageTaken: 1,
    });
    // 44 base + 2 hype steps × 10 % (9) = 53
    expect(purse).toEqual({ base: 44, hype: 9, precision: 0, flawless: 0, total: 53 });

    const crowd = crowdDuelReward({
      baseFame: bases.fameBase,
      baseGold: bases.goldBase,
      crowdHypePeak: 100,
      crowdTurned: false,
    });
    // fame 15 + round(15 × 1.0 × 0.25) = 19; gold peak round(44 × 1.0 × 0.1) = 4
    expect(crowd.peakFameBonus).toBe(4);
    expect(crowd.peakGoldBonus).toBe(4);
    expect(crowd.fame).toBe(19);
  });

  test('the crowd’s turning multiplies the MODE-adjusted fame and never the gold', () => {
    const bases = modeRewardBases('steel', marcus);
    const crowd = crowdDuelReward({
      baseFame: bases.fameBase,
      baseGold: bases.goldBase,
      crowdHypePeak: 0,
      crowdTurned: true,
    });
    expect(crowd.fameBeforeTurn).toBe(15);
    expect(crowd.fame).toBe(12); // round(15 × 0.8)
    expect(crowd.peakGoldBonus).toBe(0);

    // The documented order is sensitive to its own rounding: with the crowd's
    // peak applied to the UNADJUSTED base first, Marcus's 10 fame would pay 20
    // at Steel's ×1.5; applied to the mode-adjusted 15 it pays 19. The shipped
    // order is mode first.
    const crowdFirstPeak = Math.round(
      (10 + Math.round(10 * CROWD_CONFIG.peakFameFactor)) * BOUT_MODES.steel.fameMultiplier,
    );
    const modeFirstPeak = crowdDuelReward({
      baseFame: bases.fameBase,
      baseGold: bases.goldBase,
      crowdHypePeak: 100,
      crowdTurned: false,
    }).fame;
    expect(modeFirstPeak).toBe(19);
    expect(crowdFirstPeak).toBe(20);
    expect(modeFirstPeak).not.toBe(crowdFirstPeak);
  });

  test('Sand is byte-identical to the shipped reward figures', () => {
    const bases = modeRewardBases('sand', marcus);
    const purse = calculateDuelGold({
      baseGold: bases.goldBase,
      didWin: true,
      crowdHypePeak: 100,
      perfectBlocks: 2,
      damageTaken: 0,
    });
    // 35 base + 7 hype + 10 precision + 18 flawless (round(35 × 0.5) = 18, half-up)
    expect(purse.total).toBe(70);
  });

  test('Invictus composes multiplicatively with the crowd’s peak', () => {
    const bases = modeRewardBases('invictus', marcus);
    const purse = calculateDuelGold({
      baseGold: bases.goldBase,
      didWin: true,
      crowdHypePeak: 100,
      perfectBlocks: 0,
      damageTaken: 1,
    });
    expect(purse.base).toBe(53);
    expect(purse.hype).toBe(11); // round(53 × 0.1 × 2)
    expect(purse.total).toBe(64);
  });
});

describe('C-8.70C §F — Grudge × mode composition', () => {
  const marcus = byId('opp_marcus');
  const quickGrudge = buildGrudgeOpponent(marcus, 'quick')!;
  const powerGrudge = buildGrudgeOpponent(marcus, 'power')!;

  test('Sand fights the grudge at its studied shift only (0.50/0.25 → 0.60/0.20)', () => {
    expect(quickGrudge.grudge!.baseProfile).toEqual({ aggression: 0.5, blockChance: 0.25 });
    expect(quickGrudge.grudge!.adjustedProfile).toEqual({ aggression: 0.6, blockChance: 0.2 });
    expect(resolveBoutProfile('sand', quickGrudge)).toEqual({
      aggression: 0.6,
      blockChance: 0.2,
    });
  });

  test('Steel/Invictus add the published delta ADDITIVELY to the studied shift', () => {
    for (const mode of ['steel', 'invictus'] as BoutMode[]) {
      expect(resolveBoutProfile(mode, quickGrudge)).toEqual({
        aggression: 0.65,
        blockChance: 0.25,
      });
      expect(resolveBoutProfile(mode, powerGrudge)).toEqual({
        aggression: 0.5,
        blockChance: 0.4,
      });
    }
  });

  test('the total shift from the base row never exceeds ±0.20', () => {
    for (const grudge of [quickGrudge, powerGrudge]) {
      const base = grudge.grudge!.baseProfile;
      for (const mode of MODES) {
        const composed = resolveBoutProfile(mode, grudge);
        expect(Math.abs(composed.aggression - base.aggression)).toBeLessThanOrEqual(0.2);
        expect(Math.abs(composed.blockChance - base.blockChance)).toBeLessThanOrEqual(0.2);
      }
    }
  });

  test('a synthetic over-cap studied shift is capped at ±0.20, then clamped', () => {
    const overCap: OpponentConfig = {
      ...quickGrudge,
      grudge: {
        ...quickGrudge.grudge!,
        baseProfile: { aggression: 0.5, blockChance: 0.5 },
        adjustedProfile: { aggression: 0.8, blockChance: 0.9 },
      },
    };
    // aggression: studied +0.30 + Steel +0.05 = +0.35 → capped to +0.20 → 0.70.
    // blockChance: studied +0.40 + Steel +0.05 = +0.45 → capped to +0.20 → 0.70.
    const composed = resolveBoutProfile('steel', overCap);
    expect(composed.aggression).toBe(0.7);
    expect(composed.blockChance).toBe(0.7);
  });

  test('the composed values are what the card prints', () => {
    const line = boutModeProfileLine('steel', quickGrudge);
    expect(line).toContain('0.50 → 0.65');
    expect(line).toContain('0.25 → 0.25');
    expect(line).toContain('grudge shift + Steel');
    expect(line).toContain('total shift ≤ ±0.20');
  });
});

describe('C-8.70C §G — the telegraph floor: Steel only, never below 0.8s, Sand exact', () => {
  test('the floor is 0.8s and a longer window comes down TO it, no further', () => {
    expect(modeTelegraphWindowSeconds('steel', 1.45)).toBe(0.8);
    expect(modeTelegraphWindowSeconds('invictus', 1.0)).toBe(0.8);
    expect(modeTelegraphWindowSeconds('steel', 0.8)).toBe(0.8);
    expect(modeTelegraphWindowSeconds('steel', 0.7)).toBe(0.7);
    expect(modeTelegraphWindowSeconds('invictus', 0.5)).toBe(0.5);
  });

  test('Sand keeps every shipped duration exactly', () => {
    expect(modeTelegraphWindowSeconds('sand', 1.45)).toBe(1.45);
    expect(modeTelegraphWindowSeconds('sand', 1.0)).toBe(1);
    expect(modeTelegraphWindowSeconds('sand', 0.5)).toBe(0.5);
  });

  test('the duel’s pacing table applies the rule to the telegraph holds only', () => {
    expect(turnResolutionMs('telegraph', false, 'sand')).toBe(1450);
    expect(turnResolutionMs('telegraph', false, 'steel')).toBe(800);
    expect(turnResolutionMs('beast_crouch', false, 'invictus')).toBe(800);
    expect(turnResolutionMs('telegraph', false, 'invictus')).toBe(800);
    expect(modeTelegraphWindowMs('steel', 1450)).toBe(800);
  });

  test('quick and heavy pacing — Varro’s feint/true distinction — is never re-based', () => {
    for (const mode of MODES) {
      expect(turnResolutionMs('quick_attack', false, mode)).toBe(880);
      expect(turnResolutionMs('power_attack', false, mode)).toBe(1300);
      expect(turnResolutionMs('dodge', false, mode)).toBe(800);
    }
    expect(turnResolutionMs('telegraph', true, 'steel')).toBe(1600); // the death beat wins
  });
});

describe('C-8.70C §H — the selector defaults to Sand and lists every effect', () => {
  const modalSource = readSource('src/components/hub/PreFightModal.tsx');

  test('the card starts on the default mode, session-only', () => {
    expect(modalSource).toContain('useState<BoutMode>(DEFAULT_BOUT_MODE)');
    expect(modalSource).toContain('data-prefight-mode');
    expect(modalSource).toContain('data-bout-mode={id}');
    expect(modalSource).toContain('aria-pressed={selected}');
    expect(modalSource).toContain('min-h-[48px]');
    expect(modalSource).toContain('onConfirm(boutMode)');
  });

  test('the card prints the mode’s reward, crowd, trait and floor lines', () => {
    const steel = boutModeEffectLines('steel', byId('opp_marcus')).join('\n');
    expect(steel).toContain('×1.25 gold');
    expect(steel).toContain('×1.50 fame');
    expect(steel).toContain('Trait grant — the rival gains Sand Sprinter');
    expect(steel).toContain('Gain 1 effective agility in hit-chance calculations only.');
    expect(steel).toContain('0.8s floor');
    expect(steel).toContain('Aggression 0.50 → 0.55');

    const invictus = boutModeEffectLines('invictus', byId('opp_hoplite')).join('\n');
    expect(invictus).toContain('starts hot at 40');
    expect(invictus).toContain('Tier 4');

    const sand = boutModeEffectLines('sand', byId('opp_marcus')).join('\n');
    expect(sand).toContain('published profile stands');
    expect(sand).toContain('×1.00 gold');
    expect(sand).toContain('×1.00 fame');
  });

  test('the mode names the granted palma by name and effect (C3b), and only that one', () => {
    for (const row of ROSTER) {
      const granted = extraPalmaFor(row);
      for (const mode of MODES) {
        const lines = boutModeEffectLines(mode, row).join('\n');
        const resolved = resolveBoutOpponent(mode, row);
        const extra = (resolved.palmae ?? []).filter((id) => !(row.palmae ?? []).includes(id));
        if (!BOUT_MODES[mode].grantsExtraPalma || !granted) {
          // Sand, and every fenced-out row: nothing granted, and nothing named.
          expect(extra).toEqual([]);
          expect(lines).not.toContain('Trait grant — the rival gains');
          continue;
        }
        // Exactly one extra, from the safe subset, and the card names it.
        expect(extra).toEqual([granted]);
        expect(SAFE_SUBSET_PALMAE_ORDER).toContain(granted as never);
        const palma = PALMAE.find((row) => row.id === granted)!;
        expect(lines).toContain(`Trait grant — the rival gains ${palma.name} — ${palma.description}`);
      }
    }
  });

  test('BOSSES AND FEATURE BOUTS NEVER RECEIVE AN EXTRA (the resolver’s fence)', () => {
    const fenced = ROSTER.filter((row) => row.isBoss === true || row.featureBout === true);
    expect(fenced.length).toBeGreaterThan(0);
    for (const row of fenced) {
      expect(extraPalmaFor(row), row.id).toBeNull();
      for (const mode of MODES) {
        const resolved = resolveBoutOpponent(mode, row);
        expect(resolved.palmae, `${row.id}/${mode}`).toEqual(row.palmae);
        expect(boutModeEffectLines(mode, row).join('\n')).not.toContain('Trait grant — the rival gains');
      }
    }
  });

  test('the duel reads the composed profile and the mode’s reward bases', () => {
    const scene = readSource('src/components/duel/DuelScene.tsx');
    expect(scene).toContain('resolveBoutProfile(boutMode, opponent)');
    expect(scene).toContain('modeRewardBases(boutMode, opponent)');
    expect(scene).toContain('modeCrowdStartHype(boutMode)');
    expect(scene).toContain('modeCrowdDecayTier(boutMode, opponent.tier)');
    expect(scene).toContain('rateMultiplier: crowdDecayMultiplier');
    expect(scene).toContain('statsRef.current.boutMode = boutMode');
    // Sand's standard chooser call is still present and unchanged.
    expect(scene).toContain('chooseAIStandardAction(opponent.aggression, opponent.blockChance)');
  });
});
