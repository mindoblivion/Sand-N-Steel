/**
 * ===========================================================================
 * PITCH A1 — FORTUNA'S OMEN: the honesty suite
 * ===========================================================================
 * The slice's own pins, one section per claim `ideas-story.md` §5 Hook A and the
 * eight Director rulings make:
 *
 *   §A the FIELD — a lazy optional object (`omen: { kind, expiresAtBout }`) and a
 *      lazy boolean marker, resolved as "no omen / trickle still owed" from a
 *      missing, null or malformed save, cleared on consumption and round-tripped
 *      through the game's own save key;
 *   §B the DRAW and the PRICE — 50/50 through an injected RNG (both words reachable
 *      across seeds) and 25 gold, refused before any arithmetic when the purse
 *      cannot cover it;
 *   §C the KIND omen — ×1.25 fame applied LAST, on the numbers C-C's composition
 *      order already produced (mode → crowd peak → crowd turning), gold untouched,
 *      and expired unpaid on a loss;
 *   §D the ILL omen — +0.10 aggression / +0.05 blockChance at duel entry, after the
 *      mode delta, clamped into [0.05, 0.95] and NOT counted toward C-C's ±0.20
 *      budget; a win pays ×1.25 gold AND fame, a loss expires it unpaid;
 *   §E the DECLINE — the first ever pays +5 fame and records the marker, later ones
 *      write nothing, and declining while an omen is live leaves it untouched;
 *   §F EXPIRY and REPLACEMENT — `expiresAtBout` is total bouts + 1, a second
 *      offering replaces the first with no refund, and nothing but a duel result
 *      consumes an omen;
 *   §G the SURFACES — the pre-fight card's omen line and the result screen's
 *      paid/expired line, rendered from the real components;
 *   §H the WRITE SITES — the module is pure, and the only save writes are `App`'s
 *      existing save-on-change path (the two shrine handlers and the one duel-result
 *      write the omen is settled inside);
 *   §I the CORPUS RULE — the extended 20-field optional list, plus a control showing
 *      the scan still fails on a field nobody accounted for.
 *
 * Run with: `bun test src/utils/fortunasOmen.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect, beforeEach } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { DuelStatistics, OpponentConfig, PlayerProfile } from '../types/game';
import { createNewProfile, loadSavedProfile, saveProfile } from '../services/storage';
import { ALL_OPPONENTS } from '../data/opponents';
import { BOUT_MODES, modeRewardBases, resolveBoutProfile } from '../data/boutModes';
import { CROWD_CONFIG } from '../data/crowdConfig';
import { crowdDuelReward } from './crowdDynamics';
import { calculateDuelGold } from './duelRewards';
import { PreFightModal } from '../components/hub/PreFightModal';
import { DuelResultModal } from '../components/hub/DuelResultModal';
import {
  OMEN_FAME_MULTIPLIER,
  OMEN_ILL_GOLD_MULTIPLIER,
  OMEN_ILL_PROFILE_DELTA,
  OMEN_ILL_SPENT_LINE,
  OMEN_KIND_LOST_LINE,
  OMEN_KIND_PAID_LABEL,
  OMEN_PRICE,
  OMEN_TRICKLE_FAME,
  applyIllOmenToBoutProfile,
  clearOmen,
  declineOmen,
  isIllOmenPending,
  isTrickleClaimed,
  nextBoutIndex,
  offerOmen,
  omenDeclineResultLine,
  omenLine,
  omenOfferResultLine,
  resolveOmen,
  settleOmenRewards,
} from './omens';

// ── In-memory localStorage polyfill (bun's runtime has no DOM) ─────────────
const _store = new Map<string, string>();
// @ts-ignore — assign to global before the storage functions are called
globalThis.localStorage = {
  getItem: (key: string) => _store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    _store.set(key, value);
  },
  removeItem: (key: string) => {
    _store.delete(key);
  },
  clear: () => {
    _store.clear();
  },
};

const SRC_ROOT = fileURLToPath(new URL('../', import.meta.url));

/** A source file, comment-stripped, so prose can neither satisfy nor defeat a pin. */
const code = (relPath: string): string =>
  readFileSync(join(SRC_ROOT, relPath), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

const OMENS_SOURCE = code('utils/omens.ts');
const APP_SOURCE = code('App.tsx');
const SCENE_SOURCE = code('components/3d/city/CityHubScene.tsx');
const PREFIGHT_SOURCE = code('components/hub/PreFightModal.tsx');
const RESULT_SOURCE = code('components/hub/DuelResultModal.tsx');
const HUB_SOURCE = code('components/hub/GladiatorSchoolHub.tsx');
const DUEL_SOURCE = code('components/duel/DuelScene.tsx');
const RACE_SOURCE = code('components/3d/RaceScene.tsx');

/** A fresh profile with overrides — the factory shape, so every field is real. */
const profile = (over: Partial<PlayerProfile> = {}): PlayerProfile => ({
  ...createNewProfile('Tester'),
  ...over,
});

const marcus = (): OpponentConfig => {
  const found = ALL_OPPONENTS.find((opponent) => opponent.id === 'opp_marcus');
  if (!found) throw new Error('the roster lost its tier-1 opener');
  return found;
};

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

/** React escapes an apostrophe as a numeric entity in rendered text. */
const escaped = (text: string): string => text.replace(/'/g, '&#x27;');

beforeEach(() => {
  _store.clear();
});

// ════════════════════════════════════════════════════════════════════════════
// §A — the field
// ════════════════════════════════════════════════════════════════════════════
describe("PITCH A1 §A — the omen is a lazy optional object, absent = neutral", () => {
  test('the factory writes neither field, and an absent omen is neutral', () => {
    const fresh = createNewProfile('Fresh');
    expect(Object.keys(fresh)).not.toContain('omen');
    expect(Object.keys(fresh)).not.toContain('omenTrickleClaimed');
    expect(resolveOmen(fresh)).toBeNull();
    expect(isIllOmenPending(fresh)).toBe(false);
    expect(isTrickleClaimed(fresh)).toBe(false);
    expect(nextBoutIndex(fresh)).toBe(1);
  });

  test('a missing, null or malformed field reads as "no omen" rather than being repaired', () => {
    const cases: unknown[] = [
      undefined,
      null,
      {},
      'kind',
      7,
      { kind: 'bogus', expiresAtBout: 3 },
      { kind: 'kind' },
      { kind: 'kind', expiresAtBout: 0 },
      { kind: 'ill', expiresAtBout: Number.NaN },
      { kind: 'ill', expiresAtBout: 'next' },
    ];
    for (const omen of cases) {
      const subject = { ...profile(), omen: omen as PlayerProfile['omen'] };
      expect(resolveOmen(subject), JSON.stringify(omen)).toBeNull();
      expect(isIllOmenPending(subject)).toBe(false);
    }
  });

  test('a valid omen resolves to a fresh copy, and the stored record is untouched', () => {
    const stored = { kind: 'ill' as const, expiresAtBout: 4 };
    const subject = profile({ omen: stored });
    const resolved = resolveOmen(subject);
    expect(resolved).toEqual(stored);
    expect(resolved).not.toBe(stored);
    resolved!.kind = 'kind';
    expect(subject.omen).toEqual({ kind: 'ill', expiresAtBout: 4 });
  });

  test('clearOmen removes the field, and is a no-op (same object) when there is none', () => {
    const absent = profile();
    expect(clearOmen(absent)).toBe(absent);
    const live = profile({ omen: { kind: 'kind', expiresAtBout: 2 } });
    const cleared = clearOmen(live);
    expect(cleared).not.toBe(live);
    expect('omen' in cleared).toBe(false);
    expect(resolveOmen(cleared)).toBeNull();
    // Everything else on the profile is carried unchanged.
    expect({ ...cleared, omen: live.omen }).toEqual(live);
  });

  test('the omen round-trips through the real save key and clears on consumption', () => {
    const offered = offerOmen(profile(), () => 0.1);
    expect(offered.ok).toBe(true);
    if (!offered.ok) return;
    saveProfile(offered.profile);
    const loaded = loadSavedProfile();
    expect(loaded).not.toBeNull();
    expect(resolveOmen(loaded!)).toEqual({ kind: 'kind', expiresAtBout: 1 });

    saveProfile(clearOmen(loaded!));
    const after = loadSavedProfile()!;
    expect('omen' in after).toBe(false);
    expect(resolveOmen(after)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §B — the draw and the price
// ════════════════════════════════════════════════════════════════════════════
describe('PITCH A1 §B — Fortuna gives what she gives, and 25 gold is the price', () => {
  test('the draw is 50/50 across seeds, and both words are reachable', () => {
    const subject = profile({ gold: 1000 });
    const kinds = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      const outcome = offerOmen(subject, () => i / 100);
      if (!outcome.ok) throw new Error('a 1000-gold purse must afford an offering');
      kinds.add(outcome.omen.kind);
    }
    expect([...kinds].sort()).toEqual(['ill', 'kind']);
    // The boundary is the published 0.50.
    const kindOf = (roll: number): string => {
      const outcome = offerOmen(subject, () => roll);
      if (!outcome.ok) throw new Error('a 1000-gold purse must afford an offering');
      return outcome.omen.kind;
    };
    expect(kindOf(0)).toBe('kind');
    expect(kindOf(0.4999)).toBe('kind');
    expect(kindOf(0.5)).toBe('ill');
    expect(kindOf(0.9999)).toBe('ill');
  });

  test('a purse under 25 gold is refused, and nothing is written', () => {
    const poor = profile({ gold: OMEN_PRICE - 1 });
    const outcome = offerOmen(poor, () => 0.9);
    expect(outcome).toEqual({ ok: false, reason: 'insufficient-gold' });
    expect('profile' in outcome).toBe(false);
    expect(poor.gold).toBe(OMEN_PRICE - 1);
    expect('omen' in poor).toBe(false);

    // A malformed balance affords nothing either.
    expect(offerOmen({ ...poor, gold: Number.NaN }, () => 0.9)).toEqual({
      ok: false,
      reason: 'insufficient-gold',
    });
  });

  test('exactly 25 gold pays to zero and records the word; nothing else moves', () => {
    const exact = profile({ gold: OMEN_PRICE });
    const outcome = offerOmen(exact, () => 0.9);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.profile.gold).toBe(0);
    expect(outcome.omen).toEqual({ kind: 'ill', expiresAtBout: 1 });
    expect(outcome.profile.omen).toEqual(outcome.omen);
    // Purity: the caller's own profile is untouched.
    expect(exact.gold).toBe(OMEN_PRICE);
    expect('omen' in exact).toBe(false);
    const { gold: _gold, omen: _omen, ...rest } = outcome.profile;
    const { gold: _baseGold, ...baseRest } = exact;
    expect(rest).toEqual(baseRest);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §C — the kind omen
// ════════════════════════════════════════════════════════════════════════════
describe('PITCH A1 §C — a kind omen multiplies the FINAL fame, and gold is untouched', () => {
  /** The exact numbers C-C's composition order produces at Steel, peak 50, turned. */
  const composition = () => {
    const row = marcus();
    const bases = modeRewardBases('steel', row);
    const purse = calculateDuelGold({
      baseGold: bases.goldBase,
      didWin: true,
      crowdHypePeak: 50,
      perfectBlocks: 0,
      damageTaken: 1,
    });
    const crowd = crowdDuelReward({
      baseFame: bases.fameBase,
      baseGold: bases.goldBase,
      crowdHypePeak: 50,
      crowdTurned: true,
    });
    return { bases, purse, crowd, gold: purse.total + crowd.peakGoldBonus, fame: crowd.fame };
  };

  test('the mode multiplier, the crowd peak bonus and the turning are all present', () => {
    const { bases, purse, crowd, gold, fame } = composition();
    expect(bases.goldBase).toBeGreaterThan(marcus().rewardGold);
    expect(bases.fameBase).toBe(BOUT_MODES.steel.fameMultiplier * marcus().rewardFame);
    expect(crowd.peakFameBonus).toBeGreaterThan(0);
    expect(crowd.peakGoldBonus).toBeGreaterThan(0);
    expect(crowd.crowdTurned).toBe(true);
    expect(crowd.fame).toBeLessThan(crowd.fameBeforeTurn);
    expect(gold).toBe(purse.total + crowd.peakGoldBonus);
    expect(fame).toBe(crowd.fame);
  });

  test('the omen applies LAST: ×1.25 of the already-turned fame, gold byte-identical', () => {
    const { crowd, gold, fame } = composition();
    const settled = settleOmenRewards({ kind: 'kind', expiresAtBout: 2 }, true, { fame, gold });
    expect(settled.paid).toBe(true);
    expect(settled.fame).toBe(Math.round(fame * OMEN_FAME_MULTIPLIER));
    expect(settled.gold).toBe(gold);
    expect(settled.goldBonus).toBe(0);
    expect(settled.fameBonus).toBe(settled.fame - fame);
    expect(settled.fameBonus).toBeGreaterThan(0);
    expect(settled.line).toBe(`${OMEN_KIND_PAID_LABEL}: +${settled.fameBonus} fame`);

    // The order is load-bearing: the same omen applied BEFORE the crowd's turning
    // would pay a different figure, so the check is sensitive to where it sits.
    const appliedBeforeTurning = Math.round(
      Math.round(crowd.fameBeforeTurn * OMEN_FAME_MULTIPLIER) * CROWD_CONFIG.turnedFameFactor,
    );
    expect(settled.fame).not.toBe(appliedBeforeTurning);
  });

  test('a lost bout expires the kind omen unpaid', () => {
    const settled = settleOmenRewards({ kind: 'kind', expiresAtBout: 2 }, false, {
      fame: 20,
      gold: 60,
    });
    expect(settled).toEqual({
      fame: 20,
      gold: 60,
      fameBonus: 0,
      goldBonus: 0,
      paid: false,
      line: OMEN_KIND_LOST_LINE,
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §D — the ill omen
// ════════════════════════════════════════════════════════════════════════════
describe('PITCH A1 §D — an ill omen hardens ONE bout, and a win pays gold and fame', () => {
  test('the published shift, and no shift at all without an ill omen', () => {
    const mode = { aggression: 0.5, blockChance: 0.5 };
    const hardened = applyIllOmenToBoutProfile(mode, true);
    expect(hardened.aggression).toBe(0.5 + OMEN_ILL_PROFILE_DELTA.aggression);
    expect(hardened.blockChance).toBe(0.5 + OMEN_ILL_PROFILE_DELTA.blockChance);
    expect(OMEN_ILL_PROFILE_DELTA).toEqual({ aggression: 0.1, blockChance: 0.05 });
    // No ill omen: the caller's own object, unchanged.
    expect(applyIllOmenToBoutProfile(mode, false)).toBe(mode);
  });

  test('the clamp holds at both ends, including a high-guard opponent at the 0.95 cap', () => {
    const high = applyIllOmenToBoutProfile({ aggression: 0.93, blockChance: 0.93 }, true);
    expect(high).toEqual({ aggression: 0.95, blockChance: 0.95 });
    const atCap = applyIllOmenToBoutProfile({ aggression: 0.95, blockChance: 0.95 }, true);
    expect(atCap).toEqual({ aggression: 0.95, blockChance: 0.95 });
    const low = applyIllOmenToBoutProfile({ aggression: 0.05, blockChance: 0.05 }, true);
    expect(low).toEqual({ aggression: 0.15, blockChance: 0.1 });
  });

  test('it lands AFTER the mode delta and outside C-C’s ±0.20 grudge+mode budget', () => {
    // A grudge row whose studied shift is already at the published +0.20 cap.
    const base = { aggression: 0.5, blockChance: 0.4 };
    const row = {
      ...marcus(),
      aggression: base.aggression,
      blockChance: base.blockChance,
      grudge: {
        baseId: 'opp_marcus',
        baseProfile: base,
        adjustedProfile: { aggression: 0.7, blockChance: 0.6 },
        evolvedTrait: 'iron_lungs',
        state: 'open',
      },
    } as unknown as OpponentConfig;
    const composed = resolveBoutProfile('steel', row);
    // C-C's cap holds the grudge shift + the Steel delta at +0.20.
    expect(composed.aggression).toBeCloseTo(base.aggression + 0.2, 6);
    // The shrine's ill omen is a SEPARATE effect: +0.10 on top of that.
    const hardened = applyIllOmenToBoutProfile(composed, true);
    expect(hardened.aggression).toBeCloseTo(base.aggression + 0.3, 6);
    expect(hardened.blockChance).toBeCloseTo(base.blockChance + 0.2 + 0.05, 6);
  });

  test('the duel entry reads the ill omen from the save, and nothing else does', () => {
    expect(isIllOmenPending(profile({ omen: { kind: 'ill', expiresAtBout: 3 } }))).toBe(true);
    expect(isIllOmenPending(profile({ omen: { kind: 'kind', expiresAtBout: 3 } }))).toBe(false);
    // The duel composes it at the same layer as the mode delta, after it.
    expect(DUEL_SOURCE).toContain('applyIllOmenToBoutProfile(modeProfile, omenIll)');
    expect(DUEL_SOURCE).toContain('const omenShift = useMemo(() => illOmenDelta(omenIll), [omenIll]);');
    // The race scene never touches the omen.
    expect(RACE_SOURCE).not.toContain('omen');
  });

  test('winning that bout pays ×1.25 gold AND ×1.25 fame, applied last', () => {
    const settled = settleOmenRewards({ kind: 'ill', expiresAtBout: 2 }, true, {
      fame: 20,
      gold: 80,
    });
    expect(settled.fame).toBe(Math.round(20 * OMEN_FAME_MULTIPLIER));
    expect(settled.gold).toBe(Math.round(80 * OMEN_ILL_GOLD_MULTIPLIER));
    expect(settled.fameBonus).toBe(5);
    expect(settled.goldBonus).toBe(20);
    expect(settled.paid).toBe(true);
    expect(settled.line).toContain('+20 gold');
    expect(settled.line).toContain('+5 fame');
  });

  test('losing it expires unpaid', () => {
    const settled = settleOmenRewards({ kind: 'ill', expiresAtBout: 2 }, false, {
      fame: 20,
      gold: 80,
    });
    expect(settled.fame).toBe(20);
    expect(settled.gold).toBe(80);
    expect(settled.paid).toBe(false);
    expect(settled.line).toBe(OMEN_ILL_SPENT_LINE);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §E — the decline
// ════════════════════════════════════════════════════════════════════════════
describe('PITCH A1 §E — the decline trickle is paid once per profile, ever', () => {
  test('the first decline pays +5 fame and records the marker', () => {
    const subject = profile({ fame: 40 });
    const outcome = declineOmen(subject);
    expect(outcome.wrote).toBe(true);
    if (!outcome.wrote) return;
    expect(outcome.famePaid).toBe(OMEN_TRICKLE_FAME);
    expect(outcome.profile.fame).toBe(40 + OMEN_TRICKLE_FAME);
    expect(outcome.profile.omenTrickleClaimed).toBe(true);
    expect(isTrickleClaimed(outcome.profile)).toBe(true);
    // Purity, and nothing else moves.
    expect(subject.fame).toBe(40);
    expect('omenTrickleClaimed' in subject).toBe(false);
    const { fame: _fame, omenTrickleClaimed: _claimed, ...rest } = outcome.profile;
    const { fame: _baseFame, ...baseRest } = subject;
    expect(rest).toEqual(baseRest);
    expect(omenDeclineResultLine(outcome)).toContain('+5 fame');
  });

  test('the second decline pays nothing and writes nothing', () => {
    const first = declineOmen(profile({ fame: 40 }));
    expect(first.wrote).toBe(true);
    if (!first.wrote) return;
    const second = declineOmen(first.profile);
    expect(second).toEqual({ wrote: false, reason: 'already-claimed' });
    expect('profile' in second).toBe(false);
    expect(first.profile.fame).toBe(45);
    expect(omenDeclineResultLine(second)).toContain('own arm');
  });

  test('declining while an omen is live leaves it untouched and does not spend the trickle', () => {
    const live = profile({
      fame: 100,
      omen: { kind: 'ill', expiresAtBout: 4 },
    });
    const outcome = declineOmen(live);
    expect(outcome).toEqual({ wrote: false, reason: 'omen-live' });
    expect(live.fame).toBe(100);
    expect(resolveOmen(live)).toEqual({ kind: 'ill', expiresAtBout: 4 });
    expect(isTrickleClaimed(live)).toBe(false);
    expect(omenDeclineResultLine(outcome)).toContain('untouched');
    // And the still-unclaimed trickle is paid on a later, omen-free decline.
    const later = declineOmen(clearOmen(live));
    expect(later.wrote).toBe(true);
    if (later.wrote) expect(later.profile.fame).toBe(100 + OMEN_TRICKLE_FAME);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §F — expiry and replacement
// ════════════════════════════════════════════════════════════════════════════
describe('PITCH A1 §F — the bout index, replacement, and what may consume an omen', () => {
  test('expiresAtBout is total bouts + 1 at the moment of offering', () => {
    expect(nextBoutIndex({ fightsWon: 0, fightsLost: 0 })).toBe(1);
    expect(nextBoutIndex({ fightsWon: 6, fightsLost: 2 })).toBe(9);
    expect(nextBoutIndex({ fightsWon: 3, fightsLost: 0 })).toBe(4);
    const subject = profile({ fightsWon: 6, fightsLost: 2, gold: 100 });
    const outcome = offerOmen(subject, () => 0.2);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.omen.expiresAtBout).toBe(9);
    // The corpus fixture carries exactly that shape for its own record (8 fought).
    expect(resolveOmen(profile({ omen: { kind: 'kind', expiresAtBout: 9 } }))).toEqual({
      kind: 'kind',
      expiresAtBout: 9,
    });
  });

  test('a new offering REPLACES a live omen, with no refund', () => {
    const subject = profile({ gold: 100 });
    const first = offerOmen(subject, () => 0.1);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.omen.kind).toBe('kind');
    expect(first.profile.gold).toBe(75);
    const second = offerOmen(first.profile, () => 0.9);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.omen.kind).toBe('ill');
    expect(second.profile.gold).toBe(50);
    expect(resolveOmen(second.profile)).toEqual({ kind: 'ill', expiresAtBout: 1 });
  });

  test('only a duel result consumes an omen — training, rest and races never do', () => {
    // Source pins: the settlement sits in `handleMatchComplete`'s one write, and
    // the module's consumers are exactly these.
    const at = APP_SOURCE.indexOf('const handleMatchComplete');
    const handler = APP_SOURCE.slice(at, APP_SOURCE.indexOf('const handleDuelResultDismiss', at));
    expect(at).toBeGreaterThan(-1);
    expect(handler).toContain('settleOmenRewards(omenBefore, didWin');
    expect(handler).toContain('clearOmen(afterInjury)');
    expect(handler.match(/saveProfile\(/g)?.length).toBe(1);
    // The training, rest and race handlers name no omen at all.
    for (const name of ['handleTrainStat', 'handleRestAtInn', 'handleStartRace', 'handleExitRace']) {
      const start = APP_SOURCE.indexOf(`const ${name}`);
      expect(start, name).toBeGreaterThan(-1);
      const body = APP_SOURCE.slice(start, APP_SOURCE.indexOf('\n  };', start));
      expect(body, name).not.toContain('omen');
    }
    expect(RACE_SOURCE).not.toContain('omen');
  });

  test('the module’s consumers are exactly App, the shrine, the card, the duel and the corpus', () => {
    const importers: string[] = [];
    const walk = (dir: string, prefix = ''): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules') continue;
          walk(join(dir, entry.name), rel);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const source = readFileSync(join(dir, entry.name), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^[ \t]*\/\/.*$/gm, '');
        if (/from '[^']*utils\/omens'/.test(source) || /from '[^']*\.\/omens'/.test(source)) {
          importers.push(rel);
        }
      }
    };
    walk(SRC_ROOT);
    // REBASED, not weakened — STORY-3 added one consumer: the campaign's own
    // read path (`utils/storyState.ts`) reads Beat 3's evidence through
    // `resolveOmen` / `isTrickleClaimed`, because a live omen OR the decline
    // marker is what completes Chapter 2's omen gate. It is a pure reader with no
    // writer and no UI, and the list is still exhaustive: the exact set, not a
    // filter, so a sixth consumer still fails this test.
    expect(importers.sort()).toEqual([
      'App.tsx',
      'components/3d/city/CityHubScene.tsx',
      'components/duel/DuelScene.tsx',
      'components/hub/GladiatorSchoolHub.tsx',
      'components/hub/PreFightModal.tsx',
      'utils/fortunasOmen.test.ts',
      'utils/saveCorpus.test.ts',
      'utils/storyState.ts',
    ]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §G — the surfaces
// ════════════════════════════════════════════════════════════════════════════
describe('PITCH A1 §G — the card and the result print the omen in plain words', () => {
  const card = (omen: Parameters<typeof PreFightModal>[0]['omen']) =>
    renderToStaticMarkup(
      React.createElement(PreFightModal, {
        opponent: marcus(),
        onConfirm: () => {},
        onCancel: () => {},
        omen,
      }),
    );

  test('the pre-fight card shows kind/ill and the bout it waits for', () => {
    const kind = card({ kind: 'kind', expiresAtBout: 9 });
    expect(kind).toContain('data-prefight-omen="kind"');
    expect(kind).toContain('Omen</div>');
    expect(kind).toContain('next bout (#9)');
    expect(kind).toContain(escaped(omenLine({ kind: 'kind', expiresAtBout: 9 })));

    const ill = card({ kind: 'ill', expiresAtBout: 9 });
    expect(ill).toContain('data-prefight-omen="ill"');
    expect(ill).toContain('next bout (#9)');
    expect(ill).toContain(escaped(omenLine({ kind: 'ill', expiresAtBout: 9 })));
  });

  test('a bout with no omen renders no omen block at all', () => {
    expect(card(null)).not.toContain('data-prefight-omen');
    expect(card(null)).not.toContain('Omen</div>');
    // And the hub hands the card the save's own reading.
    expect(HUB_SOURCE).toContain('omen={resolveOmen(playerProfile)}');
  });

  test('the result screen prints the omen line on a win and on a defeat alike', () => {
    const won = renderToStaticMarkup(
      React.createElement(DuelResultModal, {
        didWin: true,
        opponent: marcus(),
        stats: stats(),
        omenLine: "Fortuna's kind omen: +7 fame",
        onContinue: () => {},
      }),
    );
    expect(won).toContain('data-duel-omen');
    expect(won).toContain(escaped("Fortuna's kind omen: +7 fame"));

    const lost = renderToStaticMarkup(
      React.createElement(DuelResultModal, {
        didWin: false,
        opponent: marcus(),
        stats: stats({ goldEarned: 0 }),
        omenLine: OMEN_ILL_SPENT_LINE,
        onContinue: () => {},
      }),
    );
    expect(lost).toContain('data-duel-omen');
    expect(lost).toContain(escaped(OMEN_ILL_SPENT_LINE));

    const none = renderToStaticMarkup(
      React.createElement(DuelResultModal, {
        didWin: true,
        opponent: marcus(),
        stats: stats(),
        onContinue: () => {},
      }),
    );
    expect(none).not.toContain('data-duel-omen');
  });

  test('the shrine panel offers both answers, shows the live word, and is thumb-sized', () => {
    expect(SCENE_SOURCE).toContain('data-shrine-panel');
    expect(SCENE_SOURCE).toContain('data-offer-omen');
    expect(SCENE_SOURCE).toContain('data-decline-omen');
    expect(SCENE_SOURCE).toContain("data-shrine-omen={liveOmen ? liveOmen.kind : 'none'}");
    expect(SCENE_SOURCE).toContain('data-omen-result');
    expect(SCENE_SOURCE).toContain('data-omen-refusal="insufficient-gold"');
    expect(SCENE_SOURCE).toContain('omenLine(liveOmen)');
    expect(SCENE_SOURCE).toContain('Offer {OMEN_PRICE}g for an omen');
    // No new tap target smaller than the hub's own 48px floor.
    expect(SCENE_SOURCE).toContain('min-h-[48px]');
    // The shrine opens the panel, and both choice buttons reach `App`'s handlers.
    expect(SCENE_SOURCE).toContain("nearbyLoc.id === 'shrine_temple'");
    expect(SCENE_SOURCE).toContain('setShrinePanel(true)');
    expect(SCENE_SOURCE).toContain('onOfferOmen()');
    expect(SCENE_SOURCE).toContain('onDeclineOmen()');
    // The panel's result copy is the module's, not retyped on the screen.
    expect(SCENE_SOURCE).toContain('omenOfferResultLine(outcome.omen)');
    expect(SCENE_SOURCE).toContain('omenDeclineResultLine(outcome)');
    expect(omenOfferResultLine({ kind: 'kind', expiresAtBout: 2 })).toContain('kind');
    expect(omenOfferResultLine({ kind: 'ill', expiresAtBout: 2 })).toContain('hardens');
  });

  test('the screen writes no save and re-implements no transaction', () => {
    expect(SCENE_SOURCE).not.toContain('saveProfile');
    expect(SCENE_SOURCE).not.toContain('offerOmen(');
    expect(SCENE_SOURCE).not.toContain('declineOmen(');
    expect(SCENE_SOURCE).not.toContain('gold: playerProfile.gold -');
    expect(PREFIGHT_SOURCE).not.toContain('saveProfile');
    expect(RESULT_SOURCE).not.toContain('saveProfile');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §H — the write sites
// ════════════════════════════════════════════════════════════════════════════
describe('PITCH A1 §H — no save writes outside the existing save-on-change flow', () => {
  test('the module is pure: no storage, no profile write, no clock', () => {
    expect(OMENS_SOURCE).not.toContain('saveProfile');
    expect(OMENS_SOURCE).not.toContain('localStorage');
    expect(OMENS_SOURCE).not.toContain('setProfile');
    expect(OMENS_SOURCE).not.toContain('calculateTotalStats');
    expect(OMENS_SOURCE).not.toContain('Date.now');
    // It reads the type file and the bout profile's clamp — nothing else.
    const imports = [...OMENS_SOURCE.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
    expect(imports.sort()).toEqual(['../data/boutModes', '../types/game']);
  });

  test('App is the only caller of both transactions, and each saves exactly once', () => {
    expect(APP_SOURCE.match(/offerOmen\(profile\)/g)?.length).toBe(1);
    expect(APP_SOURCE.match(/declineOmen\(profile\)/g)?.length).toBe(1);
    for (const [call, marker] of [
      ['offerOmen(profile)', 'const handleOfferOmen'],
      ['declineOmen(profile)', 'const handleDeclineOmen'],
    ] as const) {
      const at = APP_SOURCE.indexOf(marker);
      const body = APP_SOURCE.slice(at, APP_SOURCE.indexOf('\n  };', at));
      expect(body).toContain(call);
      expect(body.match(/setProfile\(/g)?.length).toBe(1);
      expect(body.match(/saveProfile\(/g)?.length).toBe(1);
    }
    // A refusal never reaches a writer: the early return precedes both writes.
    const offerBody = APP_SOURCE.slice(
      APP_SOURCE.indexOf('const handleOfferOmen'),
      APP_SOURCE.indexOf('\n  };', APP_SOURCE.indexOf('const handleOfferOmen')),
    );
    expect(offerBody.indexOf('if (!result.ok) return result;')).toBeLessThan(
      offerBody.indexOf('saveProfile('),
    );
    const declineBody = APP_SOURCE.slice(
      APP_SOURCE.indexOf('const handleDeclineOmen'),
      APP_SOURCE.indexOf('\n  };', APP_SOURCE.indexOf('const handleDeclineOmen')),
    );
    expect(declineBody.indexOf('if (!result.wrote) return result;')).toBeLessThan(
      declineBody.indexOf('saveProfile('),
    );
  });

  test('the result write credits the settled numbers and clears the field in one save', () => {
    const at = APP_SOURCE.indexOf('const handleMatchComplete');
    const handler = APP_SOURCE.slice(at, APP_SOURCE.indexOf('const handleDuelResultDismiss', at));
    // STORY-4b — a CLEARED bounty posting adds its own gold/fame in the same write;
    // the omen's settled figure is still the duel's contribution, unchanged.
    expect(handler).toContain('const nextGold = profile.gold + resultStats.goldEarned + bounty.gold;');
    expect(handler).toContain('const nextFame = profile.fame + resultStats.fameEarned + bounty.fame;');
    // STORY-5b REBASE, not a weakening: an EXHIBITION neither pays nor expires the
    // omen (Director ruling R4), so the clear is the else arm of the fence. Every
    // ordinary duel still clears the field in this same write.
    expect(handler).toContain('const afterOmen = exhibition ? afterInjury : clearOmen(afterInjury);');
    expect(handler.match(/saveProfile\(/g)?.length).toBe(1);
    // The result screen is handed the same settlement.
    expect(handler).toContain('omenSettled.line ? { omenLine: omenSettled.line } : {}');
    expect(APP_SOURCE).toContain("omenLine={duelResult.omenLine}");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// §I — the corpus rule, still sensitive to an unaccounted field
// ════════════════════════════════════════════════════════════════════════════
describe('PITCH A1 §I — the extended optional list, and the rule still fails on a new field', () => {
  /** The scan `saveCorpus.test.ts` §J runs, lifted so the control can drive it. */
  const scanOptional = (typesSource: string): string[] => {
    const start = typesSource.indexOf('export interface PlayerProfile {');
    expect(start).toBeGreaterThan(-1);
    let depth = 0;
    let end = start;
    for (let i = typesSource.indexOf('{', start); i < typesSource.length; i += 1) {
      if (typesSource[i] === '{') depth += 1;
      if (typesSource[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = typesSource.slice(start, end);
    return [...body.matchAll(/^ {2}([A-Za-z][A-Za-z0-9_]*)\?:/gm)].map((match) => match[1]);
  };

  const EXPECTED = [
    'injury',
    'isLeftyMode',
    'chariot',
    'racing',
    'story',
    'temper',
    'road',
    'seen',
    'time',
    'laurels',
    'consumables',
    'intel',
    'stable',
    'facilities',
    'armatura',
    'palmae',
    'grudges',
    'seenKeepers',
    'omen',
    'omenTrickleClaimed',
    // STORY-4a — PITCH A9's spared map, appended last in `game.ts` declaration
    // order.  REBASED, not weakened: this list is the field SET, and the set
    // legitimately grew by the one field that slice added — the same extension
    // `saveCorpus.test.ts` §J carries.
    'spared',
    // LUDI PHASE A — the calendar's day-state, declared between `spared` and `records`.
    'ludi',
    // A8 — the retained Triumphs record, still last in declaration order.
    'records',
  ];

  test('the merged type declares exactly the twenty-three optional fields, in order', () => {
    const types = readFileSync(join(SRC_ROOT, 'types/game.ts'), 'utf8');
    const optional = scanOptional(types);
    expect(optional).toEqual(EXPECTED);
    expect(optional.length).toBe(23);
  });

  test('the rule still fails on a field nobody accounted for', () => {
    const types = readFileSync(join(SRC_ROOT, 'types/game.ts'), 'utf8');
    const withNewField = types.replace(
      '  omenTrickleClaimed?: boolean;',
      '  omenTrickleClaimed?: boolean;\n  unaccounted?: string;',
    );
    expect(withNewField).not.toBe(types);
    expect(scanOptional(withNewField)).not.toEqual(EXPECTED);
    expect(scanOptional(withNewField)).toContain('unaccounted');
    // `omen-era` supplies the present half for both new fields and every older
    // fixture the absent half — the shape the corpus rule demands of a new field.
    // STORY-4a REBASE: the pair is no longer last — PITCH A9's `spared` map is
    // appended after it — so the same property is stated over the last three.
    // A8 REBASE: `records` is now last, so the pair this pins is the tail of the set.
    expect(EXPECTED.slice(-2)).toEqual(['ludi', 'records']);
  });
});
