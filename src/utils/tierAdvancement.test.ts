/**
 * FIX-B — tier integrity: a tier advances only on a boss's FIRST defeat, and the
 * city's duel doors resolve a legal target instead of a stored one.
 *
 * Run with: bun test src/utils/tierAdvancement.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A the rule itself (`resolveVictoryTier`): a first defeat advances, a repeat
 *      boss victory does not, a non-boss never advances, the climb stops at 4,
 *      and a malformed record cannot throw or invent a tier;
 *   §B the audit repro end to end — Goliath falls through the hub tab, the
 *      Colosseum door's target is the tier's next UNDEFEATED boss, a rematch win
 *      anywhere leaves the tier alone, and that boss's own first defeat advances
 *      it;
 *   §C the door's targeting: the tier's first undefeated boss, a deliberately
 *      stale stored `activeOpponent` ignored entirely, the all-bosses-down
 *      rematch fallback (inert on the tier), and the no-boss tier;
 *   §D the wiring read out of the shipped sources — the win path composes the
 *      helper and the old unconditional block is gone; the city door resolves
 *      with the helper and the scene no longer accepts `activeOpponent` at all;
 *      the module touches no storage, no save and no clock.
 *
 * The profile write the win path performs (append the id if it is new, write the
 * tier the helper answers) is mirrored here as `win()`; section §D proves the
 * shipped `App.handleMatchComplete` is that same composition. Nothing here reads
 * storage or the clock.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

import type { OpponentConfig, PlayerProfile } from '../types/game';
import { ALL_OPPONENTS, TOURNAMENT_TIERS } from '../data/opponents';
import { createNewProfile } from '../services/storage';
import {
  FINAL_TIER,
  resolveDoorDuelTarget,
  resolveVictoryTier,
} from './tierAdvancement';

// ── Sources (§D) ──────────────────────────────────────────────────────────
const moduleSource = readFileSync(new URL('./tierAdvancement.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const citySource = readFileSync(
  new URL('../components/3d/city/CityHubScene.tsx', import.meta.url),
  'utf8'
);

/** The roster's own bosses, read rather than copied. */
function bossOf(tier: number): OpponentConfig {
  const boss = ALL_OPPONENTS.find((o) => o.tier === tier && o.isBoss === true);
  if (!boss) throw new Error(`roster has no boss for tier ${tier}`);
  return boss;
}

/** The roster's own non-boss opponents of a tier. */
function mooksOf(tier: number): OpponentConfig[] {
  return ALL_OPPONENTS.filter((o) => o.tier === tier && o.isBoss !== true);
}

const GOLIATH = bossOf(1);
const IGNIS = bossOf(2);
const VALERIA = bossOf(3);
const AURELIUS = bossOf(4);

/** A fresh save in the shape `services/storage` writes (no write, no clock). */
function base(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return { ...createNewProfile('Tester'), ...overrides };
}

/**
 * The write `App.handleMatchComplete` performs on a victory, mirrored: append the
 * id if it is new, and write whatever tier the shipped helper answers.
 */
function win(profile: PlayerProfile, opponent: OpponentConfig): PlayerProfile {
  const alreadyDown = profile.defeatedOpponentIds.includes(opponent.id);
  const defeatedOpponentIds = alreadyDown
    ? profile.defeatedOpponentIds
    : [...profile.defeatedOpponentIds, opponent.id];
  const tier = resolveVictoryTier({
    currentTier: profile.currentTier,
    opponent,
    defeatedOpponentIds: profile.defeatedOpponentIds,
  });

  return { ...profile, currentTier: tier.currentTier, defeatedOpponentIds };
}

// ── §A. The rule ───────────────────────────────────────────────────────────

describe('§A — a tier advances only on a boss first defeat', () => {
  test('the roster has exactly one boss in every tier, and they are the four champions', () => {
    expect(TOURNAMENT_TIERS.map((t) => t.tier)).toEqual([1, 2, 3, 4]);
    for (const tier of TOURNAMENT_TIERS.map((t) => t.tier)) {
      // D-1 — the LADDER's boss, which is one per tier; the feature bouts of
      // that venue tier are bosses too, and are counted separately below.
      // STORY-4b — the Bounty Hall's Deserter stands in tier 3 as a boss but is not
      // a ladder boss, so the LADDER population is asserted with the bounty fence.
      expect(
        ALL_OPPONENTS.filter(
          (o) => o.tier === tier && o.isBoss === true && o.featureBout !== true && o.bountyBout !== true,
        )
      ).toHaveLength(1);
    }
    expect([GOLIATH.id, IGNIS.id, VALERIA.id, AURELIUS.id]).toEqual([
      'opp_goliath_boss',
      'opp_ignis_boss',
      'opp_valeria_boss',
      'opp_aurelius_boss',
    ]);
  });

  test('a boss first defeat advances the tier and says so', () => {
    const result = resolveVictoryTier({
      currentTier: 1,
      opponent: GOLIATH,
      defeatedOpponentIds: ['opp_marcus', 'opp_flaccus'],
    });

    expect(result).toEqual({ currentTier: 2, firstDefeat: true, advanced: true });
  });

  test('a repeat boss victory pays nothing on the tier — the id is already in the book', () => {
    const result = resolveVictoryTier({
      currentTier: 2,
      opponent: GOLIATH,
      defeatedOpponentIds: ['opp_marcus', 'opp_flaccus', GOLIATH.id],
    });

    expect(result).toEqual({ currentTier: 2, firstDefeat: false, advanced: false });
  });

  test('a non-boss never advances, first victory or not', () => {
    const mook = mooksOf(1)[0];
    expect(
      resolveVictoryTier({ currentTier: 1, opponent: mook, defeatedOpponentIds: [] })
    ).toEqual({ currentTier: 1, firstDefeat: false, advanced: false });
  });

  test('the climb still advances tier by tier on each first defeat', () => {
    let profile = base();
    expect(profile.currentTier).toBe(1);

    for (const [index, boss] of [GOLIATH, IGNIS, VALERIA].entries()) {
      profile = win(profile, boss);
      expect(profile.currentTier).toBe(index + 2);
    }

    expect(profile.defeatedOpponentIds).toEqual([GOLIATH.id, IGNIS.id, VALERIA.id]);
  });

  test('the final tier does not move, but the boss is still recorded as felled', () => {
    const result = resolveVictoryTier({
      currentTier: FINAL_TIER,
      opponent: AURELIUS,
      defeatedOpponentIds: [],
    });

    expect(result.currentTier).toBe(FINAL_TIER);
    expect(result.firstDefeat).toBe(true);
    expect(result.advanced).toBe(false);

    const fallen = win(base({ currentTier: FINAL_TIER }), AURELIUS);
    expect(fallen.currentTier).toBe(FINAL_TIER);
    expect(fallen.defeatedOpponentIds).toEqual([AURELIUS.id]);
  });

  test('a missing or malformed opponent never advances and never throws', () => {
    for (const opponent of [null, undefined, { id: '', isBoss: true }]) {
      expect(
        resolveVictoryTier({ currentTier: 1, opponent, defeatedOpponentIds: [] })
      ).toEqual({ currentTier: 1, firstDefeat: false, advanced: false });
    }
  });

  test('a malformed record or tier falls back instead of inventing one', () => {
    expect(
      resolveVictoryTier({
        currentTier: 1,
        opponent: GOLIATH,
        defeatedOpponentIds: null,
      }).currentTier
    ).toBe(2);

    expect(
      resolveVictoryTier({
        currentTier: Number.NaN,
        opponent: GOLIATH,
        defeatedOpponentIds: [],
      }).currentTier
    ).toBe(2);

    const junk = resolveVictoryTier({
      currentTier: 4,
      opponent: GOLIATH,
      defeatedOpponentIds: [5, null, undefined, { id: GOLIATH.id }],
    });
    expect(junk.firstDefeat).toBe(true);
    expect(junk.currentTier).toBe(4);
  });

  test('a non-boss id in the book does not affect the boss rule', () => {
    const mook = mooksOf(2)[0];
    expect(
      resolveVictoryTier({
        currentTier: 2,
        opponent: IGNIS,
        defeatedOpponentIds: [mook.id],
      })
    ).toEqual({ currentTier: 3, firstDefeat: true, advanced: true });
  });
});

// ── §B. The audit repro, end to end ────────────────────────────────────────

describe('§B — the audit repro: Goliath via the tab, then the Colosseum door', () => {
  test('a door rematch of a fallen boss cannot carry the tier past an unfaced champion', () => {
    // 1. The tier-1 mooks and Goliath fall through the hub tab.
    let profile = base();
    for (const opponent of [...mooksOf(1), GOLIATH]) profile = win(profile, opponent);
    expect(profile.currentTier).toBe(2);
    expect(profile.defeatedOpponentIds).toContain(GOLIATH.id);

    // 2. Walk to the Colosseum: the door's target is tier 2's undefeated boss, not Goliath.
    const door = resolveDoorDuelTarget(profile.currentTier, profile.defeatedOpponentIds);
    expect(door?.opponent.id).toBe(IGNIS.id);
    expect(door?.rematch).toBe(false);

    // 3. A rematch win anywhere — the tab still offers Goliath — leaves the tier alone.
    const rematch = win(profile, GOLIATH);
    expect(rematch.currentTier).toBe(2);
    expect(rematch.defeatedOpponentIds).toEqual(profile.defeatedOpponentIds);

    // Rematching every fallen tier-1 boss again still cannot skip Ignis.
    let loop = profile;
    for (const fallen of [GOLIATH, ...mooksOf(1)]) loop = win(loop, fallen);
    expect(loop.currentTier).toBe(2);
    expect(loop.defeatedOpponentIds).toEqual(profile.defeatedOpponentIds);

    // 4. Ignis's own first defeat advances the tier.
    const ignisFirst = win(profile, door!.opponent);
    expect(ignisFirst.currentTier).toBe(3);
    expect(ignisFirst.defeatedOpponentIds).toContain(IGNIS.id);

    // And the door now offers tier 3's champion.
    expect(
      resolveDoorDuelTarget(ignisFirst.currentTier, ignisFirst.defeatedOpponentIds)?.opponent.id
    ).toBe(VALERIA.id);
  });

  test('the pre-fix rule is what the repro exploited: any boss win would advance', () => {
    // The old expression, reconstructed: `if (activeOpponent.isBoss && tier < 4) tier += 1`.
    const preFix = (tier: number, opponent: OpponentConfig) =>
      opponent.isBoss && tier < 4 ? tier + 1 : tier;
    const profile = base({ currentTier: 2, defeatedOpponentIds: [GOLIATH.id] });

    expect(preFix(profile.currentTier, GOLIATH)).toBe(3);
    expect(win(profile, GOLIATH).currentTier).toBe(2);
  });
});

// ── §C. Door targeting ─────────────────────────────────────────────────────

describe('§C — the door resolves a legal target at interact time', () => {
  test('each tier offers its own first undefeated boss', () => {
    expect(resolveDoorDuelTarget(1, [])?.opponent.id).toBe(GOLIATH.id);
    expect(resolveDoorDuelTarget(2, [])?.opponent.id).toBe(IGNIS.id);
    expect(resolveDoorDuelTarget(3, [GOLIATH.id, IGNIS.id])?.opponent.id).toBe(VALERIA.id);
    expect(resolveDoorDuelTarget(4, [GOLIATH.id, IGNIS.id, VALERIA.id])?.opponent.id).toBe(
      AURELIUS.id
    );
    for (const tier of [1, 2, 3, 4]) {
      expect(resolveDoorDuelTarget(tier, [])?.rematch).toBe(false);
    }
  });

  test('a deliberately stale activeOpponent is ignored: the target is the tier boss', () => {
    // Exactly the audited save: tier 2, Goliath down, the stored selection still Goliath.
    const profile = base({
      currentTier: 2,
      defeatedOpponentIds: ['opp_marcus', 'opp_flaccus', GOLIATH.id],
    });
    const staleActiveOpponent: OpponentConfig = GOLIATH;

    const target = resolveDoorDuelTarget(profile.currentTier, profile.defeatedOpponentIds);

    expect(target?.opponent.id).toBe(IGNIS.id);
    expect(target?.opponent).not.toBe(staleActiveOpponent);
    expect(target?.opponent.tier).toBe(profile.currentTier);
    expect(staleActiveOpponent.tier).toBe(1); // the stale selection is a tier behind
  });

  test('a stale selection from a LATER tier is not offered either', () => {
    const profile = base({ currentTier: 1, defeatedOpponentIds: [] });
    const staleActiveOpponent: OpponentConfig = AURELIUS;

    const target = resolveDoorDuelTarget(profile.currentTier, profile.defeatedOpponentIds);

    expect(target?.opponent.id).toBe(GOLIATH.id);
    expect(target?.opponent.id).not.toBe(staleActiveOpponent.id);
  });

  test('all of a tier’s bosses down: the door offers that tier’s boss rematch, inert on the tier', () => {
    const champion = base({
      currentTier: FINAL_TIER,
      defeatedOpponentIds: [GOLIATH.id, IGNIS.id, VALERIA.id, AURELIUS.id],
    });

    const target = resolveDoorDuelTarget(champion.currentTier, champion.defeatedOpponentIds);
    expect(target?.opponent.id).toBe(AURELIUS.id);
    expect(target?.rematch).toBe(true);

    const afterRematch = win(champion, target!.opponent);
    expect(afterRematch.currentTier).toBe(FINAL_TIER);
    expect(afterRematch.defeatedOpponentIds).toEqual(champion.defeatedOpponentIds);
  });

  test('a legacy mid-tier save (boss already down) also falls back to the rematch', () => {
    const legacy = base({ currentTier: 2, defeatedOpponentIds: [GOLIATH.id, IGNIS.id] });

    const target = resolveDoorDuelTarget(legacy.currentTier, legacy.defeatedOpponentIds);
    expect(target?.opponent.id).toBe(IGNIS.id);
    expect(target?.rematch).toBe(true);
    expect(win(legacy, target!.opponent).currentTier).toBe(2);
  });

  test('a tier with no boss in the roster answers null rather than a wrong fighter', () => {
    expect(resolveDoorDuelTarget(9, [])).toBeNull();
  });

  test('a malformed tier or record cannot produce an illegal target', () => {
    expect(resolveDoorDuelTarget(Number.NaN, null)?.opponent.id).toBe(GOLIATH.id);
    expect(
      resolveDoorDuelTarget(2, [GOLIATH.id, IGNIS.id, 5, { id: 'x' } as unknown as string])?.opponent
        .id
    ).toBe(IGNIS.id);
  });
});

// ── §D. The shipped wiring ─────────────────────────────────────────────────

describe('§D — the rule lives in the shipped paths', () => {
  test('App composes the helper and the old unconditional advance is gone', () => {
    expect(appSource).toContain("import { resolveVictoryTier } from './utils/tierAdvancement';");
    // STORY-5b REBASE, not a weakening: an exhibition opens no tier, so the helper
    // is the else arm of the fence. It is still the ONLY composer of the tier.
    expect(appSource).toContain('const tierAfterVictory = exhibition');
    expect(appSource).toContain(': resolveVictoryTier({');
    expect(appSource).toContain('currentTier: profile.currentTier,');
    expect(appSource).toContain('opponent: activeOpponent,');
    expect(appSource).toContain('defeatedOpponentIds: profile.defeatedOpponentIds,');
    expect(appSource).toContain('currentTier: tierAfterVictory.currentTier,');

    expect(appSource).not.toContain('if (activeOpponent.isBoss && nextTier < 4)');
    expect(appSource).not.toContain('nextTier += 1');
    expect(appSource).not.toContain('let nextTier');
  });

  test('the tier is still written in the same profile update as the book', () => {
    const update = appSource.slice(
      appSource.indexOf('const updatedProfile: PlayerProfile = {'),
      appSource.indexOf('const settledProfile = evaluateRituals(profile, updatedProfile);')
    );
    expect(update).toContain('currentTier: tierAfterVictory.currentTier,');
    expect(update).toContain('defeatedOpponentIds: defeated,');
  });

  test('App no longer hands the city a stored activeOpponent', () => {
    const start = appSource.indexOf('<CityHubScene');
    const block = appSource.slice(start, appSource.indexOf('/>', start));
    expect(start).toBeGreaterThan(-1);
    expect(block).not.toContain('activeOpponent');
    expect(block).toContain('playerProfile={profile}');
  });

  test('the city scene resolves the door with the helper and has no stored selection at all', () => {
    expect(citySource).toContain(
      "import { resolveDoorDuelTarget } from '../../../utils/tierAdvancement';"
    );
    expect(citySource).toContain(
      "} else if (nearbyLoc.tabKey === 'tournament') {"
    );
    expect(citySource).toContain('const target = resolveDoorDuelTarget(');
    expect(citySource).toContain('playerProfile.currentTier,');
    expect(citySource).toContain('playerProfile.defeatedOpponentIds');
    expect(citySource).toContain('if (target) onEnterDuel(target.opponent);');
    const cityCode = citySource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(cityCode).not.toContain('activeOpponent');

    const interact = citySource.slice(
      citySource.indexOf('const handleInteract = useCallback(() => {'),
      citySource.indexOf('const handleStartRace = useCallback')
    );
    expect(interact).toContain('resolveDoorDuelTarget(');
    expect(interact).not.toContain('onEnterDuel(activeOpponent)');
  });

  test('the module owns no save, no storage and no clock', () => {
    expect(moduleSource).not.toContain('services/storage');
    expect(moduleSource).not.toContain('saveProfile');
    expect(moduleSource).not.toContain('localStorage');
    expect(moduleSource).not.toContain('Date.now');
    expect(moduleSource).not.toContain('Math.random');
    expect(moduleSource).toContain("import { ALL_OPPONENTS, isLadderBoss } from '../data/opponents';");
  });
});
