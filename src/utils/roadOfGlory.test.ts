/**
 * Progression Slice 1 — the Road of Glory's derivation.
 *
 * Run with: bun test src/utils/roadOfGlory.test.ts
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A the shape: seven stages in order, exactly one 'current', everything
 *      below it 'reached' and everything above it 'ahead';
 *   §B every gate, on both sides of its boundary, and that the rank-driven
 *      gates follow `deriveRank` rather than a copy of its numbers;
 *   §C the Champion gate names the roster's own tier-4 boss id, read from
 *      `src/data/opponents.ts`, not a literal;
 *   §D the cumulative rule: the current stage is the HIGHEST qualified one, so
 *      a skipped stage is 'reached', never 'ahead';
 *   §E `resolveRoadProgress`'s lazy resolution of the optional `profile.road`
 *      field (absent / partial / hand-edited all read as unsworn);
 *   §F purity: the resolvers write nothing and mutate nothing, and the
 *      requirement text is built from `rank.ts`'s own constants.
 *
 * Nothing here reads storage or the clock: the resolvers are pure, so a bare
 * profile literal is the whole fixture.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';

import { ALL_OPPONENTS } from '../data/opponents';
import { DEFAULT_PLAYER_WEAPON } from '../data/itemsDB';
import type { PlayerProfile } from '../types/game';
import {
  CHAMPION_FAME,
  CHAMPION_TIER,
  LEGEND_FAME,
  LEGEND_TIER,
  VETERAN_FAME,
  VETERAN_TIER,
  deriveRank,
} from './rank';
import {
  AURELIUS_OPPONENT_ID,
  CHAMPION_RECORD_LINE,
  ROAD_STAGES,
  resolveRoadProgress,
  resolveRoadState,
  type RoadStage,
  type RoadStageId,
} from './roadOfGlory';

// ── Fixtures ────────────────────────────────────────────────────────────────

/** The seven ids, in road order — stated once, so a re-order fails loudly. */
const ROAD_ORDER: RoadStageId[] = [
  'nobody',
  'sworn',
  'blooded',
  'known',
  'feared',
  'champion',
  'legend',
];

/** A minimal but complete save, in the shape `services/storage` writes. */
function baseProfile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    name: 'Test',
    title: 'Tester',
    rank: 'Rookie',
    appearance: { skinColor: '#000', hairColor: '#000', tunicColor: '#000', crestColor: '#000' },
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    unspentStatPoints: 0,
    baseStats: { strength: 10, agility: 10, stamina: 10, defense: 4 },
    gold: 0,
    fame: 0,
    currentTier: 1,
    tierProgress: { 1: 0, 2: 0, 3: 0, 4: 0 },
    defeatedOpponentIds: [],
    bossKills: 0,
    newGamePlus: 0,
    trainingSessionsLeft: 2,
    injury: null,
    equipped: { weapon: DEFAULT_PLAYER_WEAPON },
    inventory: [],
    fightsWon: 0,
    fightsLost: 0,
    peakCrowdHypeOverall: 0,
    ...overrides,
  };
}

/** The stage the player currently stands on, or null when the road is broken. */
function currentOf(stages: RoadStage[]): RoadStageId | null {
  const standing = stages.filter((stage) => stage.state === 'current');
  return standing.length === 1 ? standing[0].id : null;
}

/** Every stage as an id → state map, for the cumulative assertions. */
function stateOf(stages: RoadStage[]): Record<string, string> {
  return Object.fromEntries(stages.map((stage) => [stage.id, stage.state]));
}

/** A profile holding the champion record: the Colossus felled. */
const CHAMPION_PROFILE = { defeatedOpponentIds: [AURELIUS_OPPONENT_ID] };

/** A profile holding the legend record: every gate at once. */
const LEGEND_PROFILE = { fame: LEGEND_FAME, currentTier: LEGEND_TIER, bossKills: 1 };

// ── §A. The road's shape ────────────────────────────────────────────────────

describe('Progression Slice 1 — road shape', () => {
  test('the authored stages and the resolved road agree on the seven ids, in order', () => {
    expect(ROAD_STAGES.map((stage) => stage.id)).toEqual(ROAD_ORDER);
    expect(resolveRoadState(baseProfile()).map((stage) => stage.id)).toEqual(ROAD_ORDER);
  });

  test('every state is one of the three, and exactly one stage is current', () => {
    const profiles = [
      baseProfile(),
      baseProfile({ road: { oathSworn: true } }),
      baseProfile({ fightsWon: 1 }),
      baseProfile({ fame: CHAMPION_FAME, currentTier: CHAMPION_TIER }),
      baseProfile(LEGEND_PROFILE),
    ];
    for (const profile of profiles) {
      const stages = resolveRoadState(profile);
      expect(stages.length).toBe(7);
      expect(stages.filter((stage) => stage.state === 'current').length).toBe(1);
      for (const stage of stages) {
        expect(['reached', 'current', 'ahead']).toContain(stage.state);
      }
    }
  });

  test('the three states are contiguous: no reached stage above an ahead one', () => {
    const order = resolveRoadState(
      baseProfile({ fame: CHAMPION_FAME, currentTier: CHAMPION_TIER })
    ).map((stage) => stage.state);
    expect(order.indexOf('current')).toBe(order.lastIndexOf('reached') + 1);
    expect(order.indexOf('ahead')).toBe(order.indexOf('current') + 1);
  });

  test('every stage carries its own copy: name, place and requirement', () => {
    for (const stage of ROAD_STAGES) {
      expect(stage.name.length).toBeGreaterThan(0);
      expect(stage.place.length).toBeGreaterThan(0);
      expect(stage.requirement.length).toBeGreaterThan(0);
    }
  });
});

// ── §B. The gates, on both sides of every boundary ──────────────────────────

describe('Progression Slice 1 — gates', () => {
  test('nobody is the floor: an empty save stands there with nothing behind it', () => {
    const stages = resolveRoadState(baseProfile());
    expect(currentOf(stages)).toBe('nobody');
    expect(stages.every((stage) => stage.state !== 'reached')).toBe(true);
  });

  test('a save with no fields at all is nobody, not an error', () => {
    expect(currentOf(resolveRoadState({} as PlayerProfile))).toBe('nobody');
    expect(currentOf(resolveRoadState(null))).toBe('nobody');
    expect(currentOf(resolveRoadState(undefined))).toBe('nobody');
  });

  test('sworn is the oath, and nothing else', () => {
    expect(currentOf(resolveRoadState(baseProfile({ road: { oathSworn: true } })))).toBe('sworn');
    expect(currentOf(resolveRoadState(baseProfile({ road: { oathSworn: false } })))).toBe('nobody');
    expect(currentOf(resolveRoadState(baseProfile({ road: {} })))).toBe('nobody');
  });

  test('blooded is the first bout won, and nothing else', () => {
    expect(currentOf(resolveRoadState(baseProfile({ fightsWon: 1 })))).toBe('blooded');
    expect(currentOf(resolveRoadState(baseProfile({ fightsWon: 0 })))).toBe('nobody');
    expect(currentOf(resolveRoadState(baseProfile({ fightsWon: 25 })))).toBe('blooded');
  });

  test('known and feared follow the rank, not a repeated threshold', () => {
    // Both sides of the Veteran gate.
    expect(
      currentOf(resolveRoadState(baseProfile({ fame: VETERAN_FAME - 1, currentTier: VETERAN_TIER })))
    ).toBe('nobody');
    expect(
      currentOf(resolveRoadState(baseProfile({ fame: VETERAN_FAME, currentTier: VETERAN_TIER })))
    ).toBe('known');
    // Both sides of the Champion gate.
    expect(
      currentOf(resolveRoadState(baseProfile({ fame: CHAMPION_FAME - 1, currentTier: CHAMPION_TIER })))
    ).toBe('known');
    expect(
      currentOf(resolveRoadState(baseProfile({ fame: CHAMPION_FAME, currentTier: CHAMPION_TIER })))
    ).toBe('feared');
  });

  test('the rank-driven gates stay in step with deriveRank over a sweep', () => {
    const expected: Record<string, RoadStageId> = {
      Rookie: 'nobody',
      Veteran: 'known',
      Champion: 'feared',
      Legend: 'legend',
    };
    for (const fame of [0, VETERAN_FAME - 1, VETERAN_FAME, CHAMPION_FAME - 1, CHAMPION_FAME, LEGEND_FAME]) {
      for (const tier of [1, 2, 3, 4]) {
        // No oath, no bout won and no felled opponent: only the rank gates can fire.
        const profile = baseProfile({ fame, currentTier: tier, bossKills: 1 });
        expect(currentOf(resolveRoadState(profile))).toBe(expected[deriveRank(profile)]);
      }
    }
  });
});

// ── §C. The Champion gate names the roster's own boss ───────────────────────

describe('Progression Slice 1 — the champion record', () => {
  test('the gate reads the roster: the tier-4 boss id, not a copy of it', () => {
    const roster = ALL_OPPONENTS.find(
      (opponent) => opponent.isBoss === true && opponent.tier === LEGEND_TIER
    );
    expect(AURELIUS_OPPONENT_ID).toBe(roster?.id ?? '');
    expect(AURELIUS_OPPONENT_ID).toBe('opp_aurelius_boss');
  });

  test('felling the Colossus makes a champion, from any lower stage', () => {
    expect(currentOf(resolveRoadState(baseProfile(CHAMPION_PROFILE)))).toBe('champion');
    expect(
      currentOf(
        resolveRoadState(baseProfile({ ...CHAMPION_PROFILE, road: { oathSworn: true }, fightsWon: 9 }))
      )
    ).toBe('champion');
  });

  test('other opponents, or a malformed record, are not the champion gate', () => {
    expect(currentOf(resolveRoadState(baseProfile({ defeatedOpponentIds: ['opp_marcus'] })))).toBe('nobody');
    // A string where the array belongs is ignored, not iterated.
    expect(
      currentOf(
        resolveRoadState(baseProfile({ defeatedOpponentIds: AURELIUS_OPPONENT_ID as unknown as string[] }))
      )
    ).toBe('nobody');
    expect(
      currentOf(resolveRoadState(baseProfile({ defeatedOpponentIds: null as unknown as string[] })))
    ).toBe('nobody');
  });

  test('the champion record line is the copy the Champion node prints', () => {
    const champion = ROAD_STAGES.find((stage) => stage.id === 'champion');
    expect(champion?.requirement).toBe(CHAMPION_RECORD_LINE);
    expect(CHAMPION_RECORD_LINE).toContain('AURELIUS');
  });
});

// ── §D. Cumulative: the highest qualified stage is current ──────────────────

describe('Progression Slice 1 — cumulative road', () => {
  test('a champion who never swore stands on champion with the oath behind him', () => {
    const byId = stateOf(resolveRoadState(baseProfile(CHAMPION_PROFILE)));
    expect(byId.champion).toBe('current');
    expect(byId.nobody).toBe('reached');
    expect(byId.sworn).toBe('reached');
    expect(byId.blooded).toBe('reached');
    expect(byId.known).toBe('reached');
    expect(byId.feared).toBe('reached');
    expect(byId.legend).toBe('ahead');
  });

  test('a veteran who never won a bout keeps the earlier stages behind him', () => {
    const byId = stateOf(resolveRoadState(baseProfile({ fame: VETERAN_FAME, currentTier: VETERAN_TIER })));
    expect(byId.blooded).toBe('reached');
    expect(byId.sworn).toBe('reached');
    expect(byId.known).toBe('current');
  });

  test('legend is the top of the road: everything below is reached', () => {
    const byId = stateOf(resolveRoadState(baseProfile(LEGEND_PROFILE)));
    expect(byId.legend).toBe('current');
    for (const id of ROAD_ORDER.slice(0, 6)) {
      expect(byId[id]).toBe('reached');
    }
  });

  test('a Legend without the boss kill is a Champion: the road caps at what was earned', () => {
    const noKill = baseProfile({ fame: LEGEND_FAME, currentTier: LEGEND_TIER, bossKills: 0 });
    const byId = stateOf(resolveRoadState(noKill));
    expect(deriveRank(noKill)).toBe('Champion');
    expect(byId.feared).toBe('current');
    expect(byId.legend).toBe('ahead');
  });
});

// ── §E. `profile.road` resolves lazily ──────────────────────────────────────

describe('Progression Slice 1 — the optional road field', () => {
  test('an absent or unreadable field reads as unsworn, no device, none seen', () => {
    const unsworn = { oathSworn: false, bannerDevice: null, milestonesSeen: [] };
    expect(resolveRoadProgress(baseProfile())).toEqual(unsworn);
    expect(resolveRoadProgress(null)).toEqual(unsworn);
    expect(resolveRoadProgress(undefined)).toEqual(unsworn);
    expect(resolveRoadProgress(baseProfile({ road: null as never }))).toEqual(unsworn);
    expect(resolveRoadProgress(baseProfile({ road: ['oath'] as never }))).toEqual(unsworn);
    expect(resolveRoadProgress(baseProfile({ road: {} }))).toEqual(unsworn);
  });

  test('the oath is a strict boolean: a truthy string is not sworn', () => {
    expect(resolveRoadProgress(baseProfile({ road: { oathSworn: true } })).oathSworn).toBe(true);
    expect(
      resolveRoadProgress(baseProfile({ road: { oathSworn: 'yes' as unknown as boolean } })).oathSworn
    ).toBe(false);
    expect(resolveRoadProgress(baseProfile({ road: { oathSworn: false } })).oathSworn).toBe(false);
  });

  test('the banner device is text or nothing: blank reads as no device', () => {
    expect(resolveRoadProgress(baseProfile({ road: { bannerDevice: 'Wolf' } })).bannerDevice).toBe('Wolf');
    expect(resolveRoadProgress(baseProfile({ road: { bannerDevice: '   ' } })).bannerDevice).toBe(null);
    expect(
      resolveRoadProgress(baseProfile({ road: { bannerDevice: 7 as unknown as string } })).bannerDevice
    ).toBe(null);
  });

  test('milestones are strings only, and always an array', () => {
    expect(
      resolveRoadProgress(baseProfile({ road: { milestonesSeen: ['a', 'b'] } })).milestonesSeen
    ).toEqual(['a', 'b']);
    expect(
      resolveRoadProgress(baseProfile({ road: { milestonesSeen: ['a', 3, null, 'b'] as never } }))
        .milestonesSeen
    ).toEqual(['a', 'b']);
    expect(
      resolveRoadProgress(baseProfile({ road: { milestonesSeen: 'nope' as never } })).milestonesSeen
    ).toEqual([]);
  });

  test('the oath gate reads only the resolved field', () => {
    expect(currentOf(resolveRoadState(baseProfile({ road: { oathSworn: true } })))).toBe('sworn');
    expect(
      currentOf(resolveRoadState(baseProfile({ road: { oathSworn: 'yes' as unknown as boolean } })))
    ).toBe('nobody');
  });
});

// ── §F. Purity and the requirement text ─────────────────────────────────────

describe('Progression Slice 1 — read-only by construction', () => {
  test('resolving writes nothing back into the profile', () => {
    const profile = baseProfile({
      road: { oathSworn: true, bannerDevice: 'Wolf', milestonesSeen: ['oath'] },
    });
    const before = JSON.stringify(profile);
    resolveRoadState(profile);
    resolveRoadProgress(profile);
    expect(JSON.stringify(profile)).toBe(before);
  });

  test('the same profile resolves to the same road twice', () => {
    const profile = baseProfile(CHAMPION_PROFILE);
    expect(resolveRoadState(profile)).toEqual(resolveRoadState(profile));
  });

  test("the requirement text is built from rank.ts's own numbers", () => {
    const requirementOf = (id: RoadStageId) =>
      ROAD_STAGES.find((stage) => stage.id === id)?.requirement ?? '';
    expect(requirementOf('known')).toContain(String(VETERAN_FAME));
    expect(requirementOf('known')).toContain(`tier-${VETERAN_TIER}`);
    expect(requirementOf('feared')).toContain(String(CHAMPION_FAME));
    expect(requirementOf('feared')).toContain(`tier-${CHAMPION_TIER}`);
    expect(requirementOf('legend')).toContain(String(LEGEND_FAME));
    expect(requirementOf('legend')).toContain(`tier-${LEGEND_TIER}`);
  });
});
