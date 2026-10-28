/**
 * ===========================================================================
 * C-8.70C — GRUDGE BOUTS: the honesty suite
 * ===========================================================================
 * The slice's own pins, one section per claim the design (B4) and the Director
 * addendum make:
 *
 *   §A the GENERATION — stats byte-identical, the published shifts, the caps and
 *      the clamp, the fence (regular rows only), the base row never mutated;
 *   §B the MIX SUMMARY — read from D-5's own `{ quick, power }` counter, with the
 *      three-in-five line and the balanced case;
 *   §C the AVAILABILITY — a beaten regular's grudge at his tier + 1, gated by the
 *      player's own tier, never for a boss and never past the ladder's top;
 *   §D the ANTI-FARM rule — a lost grudge closes, any standard win at that tier
 *      re-opens it, a won grudge settles for good;
 *   §E the FIRST-VICTORY record — the mix is recorded once, on the bout the
 *      rival's id enters the book, and never on a rematch;
 *   §F the REWARDS — C3d: the venue tier's floor regular (no premium, no price
 *      table), with the summit's home-floor exception and the mode composition;
 *   §G the SURFACES — the tournament card, the pre-fight card (with the evolved
 *      trait printed by name and the composed purse line) and the result line;
 *   §H the SAVE — lazy resolution, nothing invented, the generated row never in
 *      the roster.
 *
 * Run with: `bun test src/utils/grudgeBouts.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type {
  DominantOffensiveClass,
  DuelStatistics,
  OpponentConfig,
  PlayerProfile,
} from '../types/game';
import { ALL_OPPONENTS, DOCTORE_TEST_OPPONENT, LADDER_OPPONENTS } from '../data/opponents';
import { createNewProfile } from '../services/storage';
import { FINAL_TIER } from './tierAdvancement';
import { BOUT_MODES, modeRewardBases } from '../data/boutModes';
import { SAFE_SUBSET_PALMAE_ORDER, extraPalmaFor } from './extraPalmae';
import { createLongMemoryState, notePlayerAction } from './longMemory';
import {
  GRUDGE_CAPS,
  GRUDGE_MIX_THRESHOLD,
  GRUDGE_SHIFTS,
  buildGrudgeOpponent,
  closeGrudge,
  dominantClassOfMix,
  grudgeBoutStatuses,
  grudgeIdOf,
  grudgeProfileLine,
  grudgePurseFor,
  grudgeResultLine,
  grudgeRewardLine,
  grudgeTraitLine,
  grudgeStudiedLine,
  grudgeTierOf,
  isGrudgeBase,
  isGrudgeBout,
  recordStandardVictory,
  resolveGrudges,
  settleGrudge,
} from './grudgeBouts';
import { TournamentTab } from '../components/hub/TournamentTab';
import { PreFightModal } from '../components/hub/PreFightModal';
import { DuelResultModal } from '../components/hub/DuelResultModal';

const HERE = dirname(fileURLToPath(import.meta.url));
const repoPath = (relative: string) => normalize(join(HERE, '..', '..', relative));
const readSource = (relative: string): string => readFileSync(repoPath(relative), 'utf8');
/** Comments stripped: prose can neither satisfy nor defeat a check. */
const code = (relative: string): string =>
  readSource(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const CLASSES: DominantOffensiveClass[] = ['quick', 'power', 'even'];
const REGULARS = LADDER_OPPONENTS.filter(isGrudgeBase);

const byId = (id: string): OpponentConfig => {
  const row = ALL_OPPONENTS.find((opponent) => opponent.id === id);
  if (!row) throw new Error(`no roster row '${id}'`);
  return row;
};

/** A profile shaped like a real save, with just what this module reads. */
const base = (overrides: Partial<PlayerProfile> = {}): PlayerProfile => ({
  ...createNewProfile('Grudge Tester'),
  ...overrides,
});

const marcus = (): OpponentConfig => byId('opp_marcus');

/** A profile that has beaten Marcus, with a grudge record for him. */
const marcusGrudge = (
  dominant: DominantOffensiveClass = 'power',
  overrides: Partial<PlayerProfile> = {}
): PlayerProfile =>
  base({
    defeatedOpponentIds: ['opp_marcus'],
    currentTier: 2,
    grudges: { opp_marcus: { dominant } },
    ...overrides,
  });

const stats = (overrides: Partial<DuelStatistics> = {}): DuelStatistics => ({
  damageDealt: 90,
  damageTaken: 40,
  hitsLanded: 12,
  perfectBlocks: 1,
  dodgesPerformed: 0,
  maxCombo: 3,
  lowestStaminaFraction: 0.5,
  crowdHypePeak: 60,
  durationSeconds: 40,
  goldEarned: 70,
  fameEarned: 25,
  xpEarned: 40,
  ...overrides,
});

// ════════════════════════════════════════════════════════════════════════════
// §A — the generation
// ════════════════════════════════════════════════════════════════════════════

describe('C-8.70C §A — the rematch is GENERATED from the base row', () => {
  test('every regular row generates for every class, with stats byte-identical', () => {
    expect(REGULARS.length).toBeGreaterThan(0);
    for (const row of REGULARS) {
      const before = JSON.stringify(row);
      for (const cls of CLASSES) {
        const generated = buildGrudgeOpponent(row, cls);
        expect(generated, `${row.id}/${cls}`).not.toBeNull();
        // Byte-identical, not merely equal: the whole stat block is copied.
        expect(JSON.stringify(generated!.stats), `${row.id}/${cls}`).toBe(JSON.stringify(row.stats));
        expect(generated!.stats).toEqual(row.stats);
        // Same kit and identity; the purse is the VENUE tier's floor (C3d) and the
        // profile is the only other thing that moves.
        expect(generated!.weaponType).toBe(row.weaponType);
        expect(generated!.rewardXp).toBe(row.rewardXp);
        expect(generated!.name).toBe(row.name);
        expect(generated!.id).toBe(grudgeIdOf(row.id));
        expect(generated!.id).not.toBe(row.id);
      }
      // The base row is never mutated by generating from it.
      expect(JSON.stringify(row)).toBe(before);
    }
  });

  test('the shift is the published one, inside the caps and the clamp', () => {
    for (const row of REGULARS) {
      for (const cls of CLASSES) {
        const generated = buildGrudgeOpponent(row, cls)!;
        const shift = GRUDGE_SHIFTS[cls];
        expect(generated.grudge!.studied).toBe(cls);
        expect(generated.grudge!.baseProfile).toEqual({
          aggression: row.aggression,
          blockChance: row.blockChance,
        });

        const aggressionDelta = generated.aggression - row.aggression;
        const blockDelta = generated.blockChance - row.blockChance;
        expect(Math.abs(aggressionDelta), `${row.id}/${cls} aggression`).toBeLessThanOrEqual(
          GRUDGE_CAPS.maxShift + 1e-9
        );
        expect(Math.abs(blockDelta), `${row.id}/${cls} block`).toBeLessThanOrEqual(
          GRUDGE_CAPS.maxShift + 1e-9
        );
        for (const value of [generated.aggression, generated.blockChance]) {
          expect(value).toBeGreaterThanOrEqual(GRUDGE_CAPS.min);
          expect(value).toBeLessThanOrEqual(GRUDGE_CAPS.max);
        }
        // The shift lands exactly where the base value leaves room for it.
        const wantsBlock = Math.max(
          GRUDGE_CAPS.min,
          Math.min(GRUDGE_CAPS.max, row.blockChance + shift.blockChance)
        );
        const wantsAggression = Math.max(
          GRUDGE_CAPS.min,
          Math.min(GRUDGE_CAPS.max, row.aggression + shift.aggression)
        );
        expect(generated.blockChance).toBeCloseTo(wantsBlock, 6);
        expect(generated.aggression).toBeCloseTo(wantsAggression, 6);
        expect(generated.grudge!.adjustedProfile).toEqual({
          aggression: generated.aggression,
          blockChance: generated.blockChance,
        });
      }
    }
  });

  test('the published shifts themselves: power braces, quick presses, even just presses harder', () => {
    expect(GRUDGE_SHIFTS.power.blockChance).toBeCloseTo(0.1, 9);
    expect(GRUDGE_SHIFTS.power.aggression).toBeCloseTo(-0.05, 9);
    expect(GRUDGE_SHIFTS.quick.blockChance).toBeCloseTo(-0.05, 9);
    expect(GRUDGE_SHIFTS.quick.aggression).toBeCloseTo(0.1, 9);
    expect(GRUDGE_SHIFTS.even.blockChance).toBe(0);
    expect(GRUDGE_SHIFTS.even.aggression).toBeCloseTo(0.05, 9);
  });

  test('the clamp holds both ends on a base value that has no room', () => {
    const high = { ...marcus(), blockChance: 0.92, aggression: 0.02 };
    const powered = buildGrudgeOpponent(high, 'power')!;
    expect(powered.blockChance).toBe(GRUDGE_CAPS.max);
    // 0.02 − 0.05 would be negative; the clamp catches it at the floor.
    expect(powered.aggression).toBe(GRUDGE_CAPS.min);

    const low = { ...marcus(), blockChance: 0.07, aggression: 0.94 };
    const quickened = buildGrudgeOpponent(low, 'quick')!;
    expect(quickened.blockChance).toBe(GRUDGE_CAPS.min);
    expect(quickened.aggression).toBe(GRUDGE_CAPS.max);
  });

  test('THE EVOLVED-TRAIT SLOT IS NEVER NULL — it is C3b\'s safe-subset extra', () => {
    // Every regular, every studied class: the slot names one of the four and the
    // SAME id is appended to the generated row's own `palmae`.
    for (const row of REGULARS) {
      for (const cls of CLASSES) {
        const generated = buildGrudgeOpponent(row, cls)!;
        const trait = generated.grudge!.evolvedTrait;
        expect(typeof trait).toBe('string');
        expect(SAFE_SUBSET_PALMAE_ORDER).toContain(trait as never);
        expect(generated.palmae).toEqual([...(row.palmae ?? []), trait]);
        expect(trait).toBe(extraPalmaFor(row));
      }
    }
  });

  test('no boss, Feature Bout or already-generated row ever generates a grudge', () => {
    for (const row of ALL_OPPONENTS.filter((o) => o.isBoss === true)) {
      expect(isGrudgeBase(row), row.id).toBe(false);
      expect(buildGrudgeOpponent(row, 'power'), row.id).toBeNull();
    }
    for (const row of ALL_OPPONENTS.filter((o) => o.featureBout === true)) {
      expect(isGrudgeBase(row), row.id).toBe(false);
    }
    const generated = buildGrudgeOpponent(marcus(), 'power')!;
    expect(isGrudgeBase(generated)).toBe(false);
    expect(buildGrudgeOpponent(generated, 'quick')).toBeNull();
    expect(buildGrudgeOpponent(null, 'power')).toBeNull();
    expect(buildGrudgeOpponent(undefined, 'power')).toBeNull();
  });

  test('a grudge is an ordinary regular rematch: no boss mechanic, no gate, no feature flag', () => {
    const generated = buildGrudgeOpponent(marcus(), 'power')!;
    expect(generated.isBoss).toBeUndefined();
    expect(generated.bossMechanic).toBeUndefined();
    expect(generated.featureBout).toBeUndefined();
    expect(generated.gate).toBeUndefined();
    expect(generated.presentationState).toBeUndefined();
    expect(generated.beast).toBeUndefined();
    expect(generated.brothers).toBeUndefined();
    expect(generated.longMemory).toBeUndefined();
    expect(generated.panoply).toBeUndefined();
    expect(generated.falseTelegraph).toBeUndefined();
    expect(isGrudgeBout(generated)).toBe(true);
    expect(isGrudgeBout(marcus())).toBe(false);
    expect(isGrudgeBout(null)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §B — the mix summary (D-5's counter, read)
// ════════════════════════════════════════════════════════════════════════════

describe('C-8.70C §B — the dominant class is read from D-5’s live counter', () => {
  test('the three-way summary, with the three-in-five line and nothing counted', () => {
    expect(dominantClassOfMix({ quick: 0, power: 0 })).toBe('even');
    expect(dominantClassOfMix({ quick: 6, power: 1 })).toBe('quick');
    expect(dominantClassOfMix({ quick: 1, power: 6 })).toBe('power');
    expect(dominantClassOfMix({ quick: 3, power: 3 })).toBe('even');
    expect(dominantClassOfMix({ quick: 4, power: 4 })).toBe('even');
    // Exactly 60 % is NOT past the line (D-5's own rule) — 3/2 reads even.
    expect(dominantClassOfMix({ quick: 2, power: 3 })).toBe('even');
    expect(dominantClassOfMix({ quick: 1, power: 4 })).toBe('power');
    expect(dominantClassOfMix({ quick: 4, power: 1 })).toBe('quick');
  });

  test('malformed counters read as even rather than lying', () => {
    expect(dominantClassOfMix(null)).toBe('even');
    expect(dominantClassOfMix(undefined)).toBe('even');
    expect(dominantClassOfMix({ quick: NaN, power: 3 })).toBe('power');
    expect(dominantClassOfMix({ quick: -3, power: -1 })).toBe('even');
  });

  test('it reads the SAME counter D-5 counts with (no second counter)', () => {
    // Drive D-5's own counting function, then read this module's summary.
    let state = createLongMemoryState();
    for (const action of [
      'power_attack',
      'power_attack',
      'power_attack',
      'quick_attack',
    ] as const) {
      state = notePlayerAction(state, action);
    }
    expect(state.mix).toEqual({ quick: 1, power: 3 });
    expect(dominantClassOfMix(state.mix)).toBe('power');

    // A shield block / advance is not an offensive action, so it never counts.
    state = notePlayerAction(state, 'shield_block');
    state = notePlayerAction(state, 'advance');
    expect(dominantClassOfMix(state.mix)).toBe('power');
  });

  test('the module builds no counter of its own', () => {
    const source = code('src/utils/grudgeBouts.ts');
    expect(source).not.toContain('createLongMemoryState');
    expect(source).not.toContain('notePlayerAction');
    expect(source).toContain('dominantClassOfMix');
    expect(GRUDGE_MIX_THRESHOLD).toBeCloseTo(0.6, 9);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §C — availability
// ════════════════════════════════════════════════════════════════════════════

describe('C-8.70C §C — the grudge appears at the rival’s tier + 1, once reached', () => {
  test('Marcus is a T1 rival: his grudge is fought at T2 and waits for T2', () => {
    expect(grudgeTierOf(marcus())).toBe(2);

    const locked = grudgeBoutStatuses(marcusGrudge('power', { currentTier: 1 }));
    expect(locked).toHaveLength(1);
    expect(locked[0].grudgeTier).toBe(2);
    expect(locked[0].tierReached).toBe(false);
    expect(locked[0].open).toBe(false);

    const reached = grudgeBoutStatuses(marcusGrudge('power', { currentTier: 2 }));
    expect(reached).toHaveLength(1);
    expect(reached[0].tierReached).toBe(true);
    expect(reached[0].open).toBe(true);
    expect(reached[0].studied).toBe('power');
    expect(reached[0].opponent.id).toBe(grudgeIdOf('opp_marcus'));
    expect(reached[0].opponent.aggression).toBe(
      buildGrudgeOpponent(marcus(), 'power')!.aggression
    );
    expect(reached[0].opponent.blockChance).toBe(
      buildGrudgeOpponent(marcus(), 'power')!.blockChance
    );
  });

  test('an undefeated rival has no grudge, and a boss never has one', () => {
    expect(grudgeBoutStatuses(base({ currentTier: 2 }))).toEqual([]);
    const bossVictim = base({
      defeatedOpponentIds: ['opp_goliath_boss'],
      currentTier: 2,
      grudges: { opp_goliath_boss: { dominant: 'power' } },
    });
    expect(grudgeBoutStatuses(bossVictim)).toEqual([]);
  });

  test('a boss’s defeated id never turns into a status, even with a forged record', () => {
    const forged = base({
      defeatedOpponentIds: ALL_OPPONENTS.filter((o) => o.isBoss === true).map((o) => o.id),
      currentTier: 4,
      grudges: Object.fromEntries(
        ALL_OPPONENTS.filter((o) => o.isBoss === true).map((o) => [o.id, { dominant: 'quick' as const }])
      ),
    });
    expect(grudgeBoutStatuses(forged)).toEqual([]);
  });

  test('the ladder’s top tier is the end of it: base tier + 1 past 4 is no grudge', () => {
    const topRegular: OpponentConfig = {
      ...marcus(),
      id: 'synthetic_top_regular',
      tier: FINAL_TIER,
    };
    expect(isGrudgeBase(topRegular)).toBe(true);
    expect(grudgeTierOf(topRegular)).toBe(FINAL_TIER + 1);
    // The generation itself is fine; the STATUS list is what gates it, and no
    // roster regular sits on the final tier today — the gate is the constant.
    expect(grudgeTierOf(topRegular)).toBeGreaterThan(FINAL_TIER);
  });

  test('the status list is in roster order and reads the recorded class', () => {
    const profile = base({
      defeatedOpponentIds: ['opp_marcus', 'opp_flaccus'],
      currentTier: 2,
      grudges: {
        opp_marcus: { dominant: 'power' },
        opp_flaccus: { dominant: 'quick' },
      },
    });
    const statuses = grudgeBoutStatuses(profile);
    const ids = statuses.map((status) => status.base.id);
    const rosterOrder = LADDER_OPPONENTS.map((row) => row.id).filter((id) => ids.includes(id));
    expect(ids).toEqual(rosterOrder);
    expect(statuses.find((status) => status.base.id === 'opp_flaccus')!.studied).toBe('quick');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §D — the anti-farm rule and settlement
// ════════════════════════════════════════════════════════════════════════════

describe('C-8.70C §D — losing closes, a standard win at that tier re-opens, winning settles', () => {
  const grudgeRow = (): OpponentConfig => buildGrudgeOpponent(marcus(), 'power')!;

  test('a lost grudge closes, and a second loss changes nothing', () => {
    const profile = marcusGrudge('power', { currentTier: 2 });
    const closed = closeGrudge(profile, grudgeRow());
    expect(resolveGrudges(closed)).toEqual({ opp_marcus: { dominant: 'power', closed: true } });
    // Pure: the caller's profile is untouched.
    expect(resolveGrudges(profile)).toEqual({ opp_marcus: { dominant: 'power' } });

    const statuses = grudgeBoutStatuses(closed);
    expect(statuses[0].closed).toBe(true);
    expect(statuses[0].open).toBe(false);

    expect(closeGrudge(closed, grudgeRow())).toBe(closed);
  });

  test('a standard win at that grudge’s tier re-opens it', () => {
    const closed = closeGrudge(marcusGrudge('power', { currentTier: 2 }), grudgeRow());
    expect(grudgeBoutStatuses(closed)[0].open).toBe(false);

    // Hoplite is a T2 regular: winning any standard T2 bout re-opens Marcus's T2 grudge.
    const reopened = recordStandardVictory(closed, byId('opp_hoplite'), 'even');
    expect(grudgeBoutStatuses(reopened)[0].open).toBe(true);
    expect(resolveGrudges(reopened).opp_marcus).toEqual({ dominant: 'power' });
  });

  test('a win at ANOTHER tier does not re-open it', () => {
    const closed = closeGrudge(marcusGrudge('power', { currentTier: 2 }), grudgeRow());
    // Drusus is a T3 regular — a different tier entirely.
    const elsewhere = recordStandardVictory(closed, byId('opp_centurion_drusus'), 'quick');
    expect(grudgeBoutStatuses(elsewhere)[0].open).toBe(false);
  });

  test('winning the grudge settles it permanently', () => {
    const profile = marcusGrudge('power', { currentTier: 2 });
    const settled = settleGrudge(profile, grudgeRow());
    expect(resolveGrudges(settled)).toEqual({ opp_marcus: { dominant: 'power', settled: true } });
    expect(settleGrudge(settled, grudgeRow())).toBe(settled);
    expect(grudgeBoutStatuses(settled)[0].settled).toBe(true);
    expect(grudgeBoutStatuses(settled)[0].open).toBe(false);
  });

  test('a row that is not a grudge writes nothing', () => {
    const profile = marcusGrudge('power', { currentTier: 2 });
    expect(settleGrudge(profile, marcus())).toBe(profile);
    expect(closeGrudge(profile, marcus())).toBe(profile);
    expect(settleGrudge(profile, null)).toBe(profile);
    expect(closeGrudge(profile, undefined)).toBe(profile);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §E — the first-victory record
// ════════════════════════════════════════════════════════════════════════════

describe('C-8.70C §E — the mix is recorded on the FIRST victory over a rival', () => {
  test('a first victory records the dominant class, keyed by the base row id', () => {
    const profile = base({ defeatedOpponentIds: [] });
    const written = recordStandardVictory(profile, marcus(), 'power');
    expect(resolveGrudges(written)).toEqual({ opp_marcus: { dominant: 'power' } });
    // Pure: the caller's profile still carries no record.
    expect(profile.grudges).toBeUndefined();
  });

  test('a rematch records nothing new', () => {
    const profile = base({ defeatedOpponentIds: ['opp_marcus'] });
    expect(recordStandardVictory(profile, marcus(), 'power')).toBe(profile);
  });

  test('an off-ladder regular (the Doctore’s Test champion) records nothing', () => {
    // `DOCTORE_TEST_OPPONENT` is a regular row but not a ladder rung, so he has no
    // grudge to come back with and his win must not write an inert record.
    const profile = base({ defeatedOpponentIds: [] });
    expect(recordStandardVictory(profile, DOCTORE_TEST_OPPONENT, 'power')).toBe(profile);
  });

  test('a boss victory records nothing', () => {
    const profile = base({ defeatedOpponentIds: [] });
    for (const boss of ALL_OPPONENTS.filter((o) => o.isBoss === true)) {
      expect(recordStandardVictory(profile, boss, 'quick')).toBe(profile);
    }
  });

  test('an unreadable class records the balanced case', () => {
    const profile = base({ defeatedOpponentIds: [] });
    const written = recordStandardVictory(
      profile,
      marcus(),
      'nonsense' as unknown as DominantOffensiveClass
    );
    expect(resolveGrudges(written)).toEqual({ opp_marcus: { dominant: 'even' } });
  });

  test('an existing grudge record is not overwritten by a later rematch', () => {
    const profile = marcusGrudge('power', { currentTier: 2 });
    const after = recordStandardVictory(profile, marcus(), 'quick');
    expect(resolveGrudges(after).opp_marcus).toEqual({ dominant: 'power' });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §F — rewards
// ════════════════════════════════════════════════════════════════════════════

describe('C-TRAIT §F — the grudge purse is the venue tier floor (design C3d)', () => {
  test('the floor regulars: T2 Cassius 90 g / 25 fame, T3 Drusus 260 g / 90 fame', () => {
    expect(grudgePurseFor(2)).toEqual({
      venueTier: 2,
      purseTier: 2,
      purseGold: 90,
      purseFame: 25,
      summit: false,
    });
    expect(grudgePurseFor(3)).toEqual({
      venueTier: 3,
      purseTier: 3,
      purseGold: 260,
      purseFame: 90,
      summit: false,
    });
    expect(grudgePurseFor(1)).toEqual({
      venueTier: 1,
      purseTier: 1,
      purseGold: 35,
      purseFame: 10,
      summit: false,
    });
    expect(grudgePurseFor(Number.NaN)).toBeNull();
  });

  test('SUMMIT EXCEPTION — venue T4 has no regular row, so it pays the home T3 floor', () => {
    expect(grudgePurseFor(FINAL_TIER)).toEqual({
      venueTier: 4,
      purseTier: 3,
      purseGold: 260,
      purseFame: 90,
      summit: true,
    });
  });

  test('the generated row adopts the venue purse, never the base row’s own', () => {
    const row = buildGrudgeOpponent(marcus(), 'power')!;
    expect(row.rewardGold).toBe(90);
    expect(row.rewardFame).toBe(25);
    expect(row.rewardXp).toBe(marcus().rewardXp);

    // Drusus is a T3 regular: his grudge is fought at the summit and pays T3's floor.
    const drusus = buildGrudgeOpponent(byId('opp_centurion_drusus'), 'even')!;
    expect(drusus.rewardGold).toBe(260);
    expect(drusus.rewardFame).toBe(90);

    for (const base of REGULARS) {
      const purse = grudgePurseFor(grudgeTierOf(base))!;
      const generated = buildGrudgeOpponent(base, 'power')!;
      expect(generated.rewardGold, base.id).toBe(purse.purseGold);
      expect(generated.rewardFame, base.id).toBe(purse.purseFame);
    }
  });

  test('the composed examples, one per venue tier × mode (mode first, crowd after)', () => {
    // T2 venue — Cassius's 90 / 25 row, multiplied by each mode.
    const t2 = buildGrudgeOpponent(marcus(), 'power')!;
    expect(modeRewardBases('sand', t2)).toEqual({ goldBase: 90, fameBase: 25 });
    expect(modeRewardBases('steel', t2)).toEqual({ goldBase: 113, fameBase: 38 });
    expect(modeRewardBases('invictus', t2)).toEqual({ goldBase: 135, fameBase: 50 });

    // T3 venue — Drusus's own 260 / 90 row (and his grudge is the summit case).
    const drususGrudge = buildGrudgeOpponent(byId('opp_centurion_drusus'), 'power')!;
    expect(modeRewardBases('sand', drususGrudge)).toEqual({ goldBase: 260, fameBase: 90 });
    expect(modeRewardBases('steel', drususGrudge)).toEqual({ goldBase: 325, fameBase: 135 });
    expect(modeRewardBases('invictus', drususGrudge)).toEqual({ goldBase: 390, fameBase: 180 });

    // The card line states the same composition, not a second set of numbers.
    expect(grudgeRewardLine(t2, 'steel')).toContain('113 gold · 38 fame');
    expect(grudgeRewardLine(t2, 'steel')).toContain(`× ${BOUT_MODES.steel.name}`);
    expect(grudgeRewardLine(drususGrudge, 'invictus')).toContain('390 gold · 180 fame');
    expect(grudgeRewardLine(drususGrudge, 'invictus')).toContain('home floor');
  });

  test('THE AUTHORED PREMIUM AND ANY GRUDGE PRICE TABLE ARE GONE (repo-wide grep)', () => {
    // The needles are COMPOSED so this suite never contains the literal it greps
    // for — otherwise the sweep would always find itself.
    const PREMIUM = 'fame' + 'Premium';
    const OLD_CONFIG = 'GRUDGE_' + 'REWARDS';

    // 1 — the shipped source names neither the old constant nor the premium field.
    const source = readSource('src/utils/grudgeBouts.ts');
    expect(source).not.toContain(PREMIUM);
    expect(source).not.toContain(OLD_CONFIG);
    expect(source).not.toContain('TUNING-PENDING');
    // 2 — no price table: the purse is DERIVED from the roster floor rows.
    expect(source).not.toContain('GRUDGE_PRICES');
    expect(source).not.toContain('grudgePrice');

    // 3 — repo-wide: no file under src/ mentions the deleted value at all.
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(repoPath(dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(rel);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const text = readFileSync(repoPath(rel), 'utf8');
        if (text.includes(PREMIUM) || text.includes(OLD_CONFIG)) offenders.push(rel);
      }
    };
    walk('src');
    expect(offenders).toEqual([]);
  });

  test('nothing else writes gold or fame', () => {
    const source = code('src/utils/grudgeBouts.ts');
    expect(source).not.toContain('profile.gold');
    expect(source).not.toContain('gold:');
    expect(source).not.toContain('fame:');
    expect(source).not.toContain('saveProfile');
    expect(source).not.toContain('localStorage');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §G — the surfaces
// ════════════════════════════════════════════════════════════════════════════

describe('C-8.70C §G — the tournament card, the pre-fight card and the result', () => {
  test('the Colosseum lists an open grudge in the tier the player is fighting', () => {
    const profile = marcusGrudge('power', { currentTier: 2, defeatedOpponentIds: ['opp_marcus'] });
    const markup = renderToStaticMarkup(
      React.createElement(TournamentTab, { profile, onSelectOpponent: () => {} })
    );
    expect(markup).toContain('Grudge Bouts');
    expect(markup).toContain('data-grudge-bout="opp_marcus"');
    expect(markup).toContain('data-grudge-open="true"');
    expect(markup).toContain(grudgeStudiedLine(buildGrudgeOpponent(marcus(), 'power')));
    expect(markup).toContain(grudgeProfileLine(buildGrudgeOpponent(marcus(), 'power')!.grudge));
    expect(markup).toContain('Enter Grudge Bout');
    // C3d — the card prints the GENERATED row's purse (the venue tier's floor).
    expect(markup).toContain(`from ${buildGrudgeOpponent(marcus(), 'power')!.rewardGold} Gold`);
  });

  test('a closed grudge is listed, says why, and cannot be entered', () => {
    const closed = closeGrudge(
      marcusGrudge('power', { currentTier: 2 }),
      buildGrudgeOpponent(marcus(), 'power')!
    );
    const markup = renderToStaticMarkup(
      React.createElement(TournamentTab, { profile: closed, onSelectOpponent: () => {} })
    );
    expect(markup).toContain('data-grudge-open="false"');
    expect(markup).toContain('Win any standard bout at Tier 2 to reopen it');
    expect(markup).not.toContain('Enter Grudge Bout');
  });

  test('a settled grudge is never listed, and a T1 player sees no section', () => {
    const settled = settleGrudge(
      marcusGrudge('power', { currentTier: 2 }),
      buildGrudgeOpponent(marcus(), 'power')!
    );
    const settledMarkup = renderToStaticMarkup(
      React.createElement(TournamentTab, { profile: settled, onSelectOpponent: () => {} })
    );
    expect(settledMarkup).not.toContain('data-grudge-bout');

    const unreached = renderToStaticMarkup(
      React.createElement(TournamentTab, {
        profile: marcusGrudge('power', { currentTier: 1 }),
        onSelectOpponent: () => {},
      })
    );
    expect(unreached).not.toContain('data-grudge-bout');
  });

  test('the pre-fight card states the grudge, the studied class and base → adjusted', () => {
    const row = buildGrudgeOpponent(marcus(), 'power')!;
    const markup = renderToStaticMarkup(
      React.createElement(PreFightModal, { opponent: row, onConfirm: () => {}, onCancel: () => {} })
    );
    expect(markup).toContain(`data-prefight-grudge="${row.grudge!.baseId}"`);
    expect(markup).toContain('Grudge Bout');
    expect(markup).toContain(grudgeStudiedLine(row));
    expect(markup).toContain(grudgeProfileLine(row.grudge));
    // C-TRAIT — the slot is never null, so the card prints the granted palma by
    // name with its effect, plus the composed purse line.
    expect(markup).toContain(`data-prefight-grudge-trait="${row.grudge!.evolvedTrait}"`);
    expect(markup).toContain(grudgeTraitLine(row));
    // (The static markup HTML-escapes the apostrophe, so the line is matched by
    // its own numbers rather than byte-for-byte.)
    expect(markup).toContain('data-prefight-grudge-purse="sand"');
    expect(markup).toContain('Tier 2 floor (90 gold / 25 fame)');
    expect(markup).toContain('90 gold · 25 fame');
    expect(grudgeRewardLine(row, 'steel')).toContain('113 gold · 38 fame');
  });

  test('both cards compose the purse line from the CHOSEN mode, in the component', () => {
    // The pre-fight card re-reads the purse on every mode toggle (session state),
    // and the result card reads the mode the duel actually fought.
    const preFight = code('src/components/hub/PreFightModal.tsx');
    expect(preFight).toContain('grudgeRewardLine(opponent, boutMode)');
    expect(preFight).toContain('grudgeTraitLine(opponent)');
    const result = code('src/components/hub/DuelResultModal.tsx');
    expect(result).toContain('grudgeRewardLine(opponent, stats.boutMode ?? \'sand\')');
  });

  test('the result card prints the grudge purse it paid', () => {
    const row = buildGrudgeOpponent(marcus(), 'power')!;
    const markup = renderToStaticMarkup(
      React.createElement(DuelResultModal, {
        didWin: true,
        opponent: row,
        stats: { ...stats(), boutMode: 'steel' },
        onContinue: () => {},
      })
    );
    expect(markup).toContain('data-duel-grudge-purse="steel"');
    expect(markup).toContain('113 gold');
    expect(markup).toContain('Tier 2 floor (90 gold / 25 fame)');
  });

  test('the result card records a settled grudge, or an open one', () => {
    const row = buildGrudgeOpponent(marcus(), 'power')!;
    const won = renderToStaticMarkup(
      React.createElement(DuelResultModal, {
        didWin: true,
        opponent: row,
        stats: stats(),
        onContinue: () => {},
      })
    );
    expect(won).toContain('data-duel-grudge="settled"');
    // React escapes the apostrophe, so compare the sentence's own words.
    expect(grudgeResultLine(row, true)).toContain('grudge is settled');
    expect(won).toContain('grudge is settled');

    const lost = renderToStaticMarkup(
      React.createElement(DuelResultModal, {
        didWin: false,
        opponent: row,
        stats: stats({ goldEarned: 0 }),
        onContinue: () => {},
      })
    );
    expect(lost).toContain('data-duel-grudge="open"');
    expect(lost).toContain('Tier 2');
  });

  test('a standard opponent’s surfaces are unchanged', () => {
    const preFight = renderToStaticMarkup(
      React.createElement(PreFightModal, {
        opponent: marcus(),
        onConfirm: () => {},
        onCancel: () => {},
      })
    );
    expect(preFight).not.toContain('Grudge Bout');
    expect(preFight).not.toContain('data-prefight-grudge');

    const result = renderToStaticMarkup(
      React.createElement(DuelResultModal, {
        didWin: true,
        opponent: marcus(),
        stats: stats(),
        onContinue: () => {},
      })
    );
    expect(result).not.toContain('data-duel-grudge');
  });

  test('no shift, purse or studied sentence is hard-coded in a component', () => {
    for (const path of [
      'src/components/hub/TournamentTab.tsx',
      'src/components/hub/PreFightModal.tsx',
      'src/components/hub/DuelResultModal.tsx',
    ]) {
      const source = code(path);
      expect(source, `${path}: studied line`).not.toContain('has learned to fear your power attacks');
      expect(source, `${path}: shift`).not.toContain('blockChance: 0.1');
      // Composed, so this suite never holds the literal it greps for.
      expect(source, `${path}: premium`).not.toContain('fame' + 'Premium');
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §H — the save
// ════════════════════════════════════════════════════════════════════════════

describe('C-8.70C §H — the saved record is lazy and the generated row is not a roster row', () => {
  test('missing, null and malformed records read as no grudges', () => {
    expect(resolveGrudges(base())).toEqual({});
    expect(resolveGrudges(null)).toEqual({});
    expect(resolveGrudges(undefined)).toEqual({});
    expect(resolveGrudges({ grudges: null } as unknown as PlayerProfile)).toEqual({});
    expect(resolveGrudges({ grudges: [] } as unknown as PlayerProfile)).toEqual({});
    const junk = {
      grudges: {
        opp_marcus: { dominant: 'sword' },
        opp_flaccus: null,
        opp_naija: { dominant: 'quick', closed: 'yes', settled: 1 },
      },
    } as unknown as PlayerProfile;
    expect(resolveGrudges(junk)).toEqual({ opp_naija: { dominant: 'quick' } });
  });

  test('resolving returns a fresh object and never mutates the save', () => {
    const profile = marcusGrudge('power');
    const before = JSON.stringify(profile);
    const resolved = resolveGrudges(profile);
    expect(resolved).not.toBe(profile.grudges);
    expect(JSON.stringify(profile)).toBe(before);
    resolved.opp_marcus.dominant = 'quick';
    expect(profile.grudges!.opp_marcus.dominant).toBe('power');
  });

  test('no generated row is ever in the roster', () => {
    const ids = new Set(ALL_OPPONENTS.map((row) => row.id));
    for (const row of REGULARS) {
      for (const cls of CLASSES) {
        const generated = buildGrudgeOpponent(row, cls)!;
        expect(ids.has(generated.id), generated.id).toBe(false);
      }
    }
  });

  test('creation writes no grudge field', () => {
    expect(Object.keys(createNewProfile('Corpus Fresh'))).not.toContain('grudges');
  });
});
