// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { createNewProfile } from '../services/storage';
import type { PlayerProfile } from '../types/game';
import {
  LEAGUE_TIERS,
  getLeagueTier,
  leagueStandingLine,
  resolveClaimedLeagueTierIds,
  resolveLeaguePoints,
  resolveLeaguePrizeAwards,
  resolveLeagueStanding,
} from './racingLeague';

/**
 * ECON-2 — the League milestone prizes, pinned at the resolver.
 *
 * The tiers are points thresholds on the shipped 1v1 race: a tier's bonus
 * pays once, when the cumulative points reach its threshold AND the player
 * owns the tier's team. Points accrue regardless of team; the prize waits
 * for the team. Thresholds are read from LEAGUE_TIERS itself, never from
 * literals in this suite — the data is the source of truth.
 */

const withRacing = (racing: Record<string, unknown>): PlayerProfile => ({
  ...createNewProfile('League Racer'),
  racing,
} as unknown as PlayerProfile);

describe('ECON-2 §A — the standing reads the profile, never a stored flag', () => {
  test('a fresh profile stands at 0 points, no tier claimed, tier 1 next', () => {
    const standing = resolveLeagueStanding(createNewProfile('League Racer'));
    expect(standing.points).toBe(0);
    expect(standing.claimedTierIds).toEqual([]);
    expect(standing.currentTier).toBeNull();
    expect(standing.nextTier?.id).toBe(LEAGUE_TIERS[0].id);
    expect(standing.pointsToNextTier).toBe(LEAGUE_TIERS[0].pointsToAdvance);
    expect(standing.nextTierTeamOwned).toBe(true); // Biga is owned by definition
  });

  test('points and the next tier come from the tier data, not literals', () => {
    const [first, second] = LEAGUE_TIERS;
    const standing = resolveLeagueStanding(withRacing({ leaguePoints: first.pointsToAdvance - 1 }));
    expect(standing.nextTier?.id).toBe(first.id);
    expect(standing.pointsToNextTier).toBe(1);
    const claimed = resolveLeagueStanding(
      withRacing({ leaguePoints: second.pointsToAdvance, leaguePrizesClaimed: [first.id] }),
    );
    expect(claimed.currentTier?.id).toBe(first.id);
    expect(claimed.nextTier?.id).toBe(second.id);
  });

  test('a threshold met without the team still names that tier next, blocked', () => {
    const [, second] = LEAGUE_TIERS;
    const standing = resolveLeagueStanding(
      withRacing({ leaguePoints: second.pointsToAdvance, leaguePrizesClaimed: [LEAGUE_TIERS[0].id] }),
    );
    expect(standing.nextTier?.id).toBe(second.id);
    expect(standing.pointsToNextTier).toBe(0);
    expect(standing.nextTierTeamOwned).toBe(false); // Biga-only profile, Triga locked
  });

  test('all tiers claimed: no next tier, current is the top tier', () => {
    const standing = resolveLeagueStanding(
      withRacing({
        leaguePoints: LEAGUE_TIERS[2].pointsToAdvance,
        unlocked: [3, 4],
        leaguePrizesClaimed: LEAGUE_TIERS.map((tier) => tier.id),
      }),
    );
    expect(standing.nextTier).toBeNull();
    expect(standing.pointsToNextTier).toBe(0);
    expect(standing.nextTierTeamOwned).toBe(true);
    expect(standing.currentTier?.id).toBe(LEAGUE_TIERS[2].id);
  });

  test('malformed points and claim lists read as empty, never throw', () => {
    expect(resolveLeaguePoints(withRacing({ leaguePoints: -5 }))).toBe(0);
    expect(resolveLeaguePoints(withRacing({ leaguePoints: 'many' }))).toBe(0);
    expect(resolveLeaguePoints(withRacing({ leaguePoints: Number.NaN }))).toBe(0);
    expect(resolveLeaguePoints(null)).toBe(0);
    expect(resolveClaimedLeagueTierIds(withRacing({ leaguePrizesClaimed: 'all' }))).toEqual([]);
    expect(resolveClaimedLeagueTierIds(null)).toEqual([]);
    const standing = resolveLeagueStanding(withRacing({ leaguePoints: 'many', leaguePrizesClaimed: 'all' }));
    expect(standing.points).toBe(0);
    expect(standing.claimedTierIds).toEqual([]);
    expect(standing.nextTier?.id).toBe(LEAGUE_TIERS[0].id);
  });

  test('claimed ids are sanitized: valid tiers only, deduplicated, ascending', () => {
    expect(
      resolveClaimedLeagueTierIds(withRacing({ leaguePrizesClaimed: [3, 99, 1, 'x', 1, -2] })),
    ).toEqual([1, 3]);
  });
});

describe('ECON-2 §B — the award resolver pays due tiers, once each', () => {
  test('nothing is due below the first threshold', () => {
    const profile = withRacing({ leaguePoints: LEAGUE_TIERS[0].pointsToAdvance - 1 });
    expect(resolveLeaguePrizeAwards(profile, LEAGUE_TIERS[0].pointsToAdvance - 1)).toEqual([]);
  });

  test('exactly at a threshold, with the team owned, the tier pays its own prize', () => {
    for (const [index, tier] of LEAGUE_TIERS.entries()) {
      const unlocked = tier.horsesRequired === 2 ? [] : tier.horsesRequired === 3 ? [3] : [3, 4];
      const claimed = LEAGUE_TIERS.slice(0, index).map((earlier) => earlier.id);
      const profile = withRacing({ leaguePoints: 0, unlocked, leaguePrizesClaimed: claimed });
      const awards = resolveLeaguePrizeAwards(profile, tier.pointsToAdvance);
      expect(awards).toEqual([{ tier, gold: tier.firstPlacePrize, fame: tier.fameReward }]);
    }
  });

  test('a claimed tier never pays again, however far past its threshold', () => {
    const profile = withRacing({
      leaguePoints: 0,
      unlocked: [3, 4],
      leaguePrizesClaimed: [LEAGUE_TIERS[0].id],
    });
    expect(resolveLeaguePrizeAwards(profile, 500)).toHaveLength(2);
    expect(resolveLeaguePrizeAwards(profile, 500).map((award) => award.tier.id)).toEqual([2, 3]);
  });

  test('the team gate holds: points banked without the team pay nothing for that tier', () => {
    const [, second, third] = LEAGUE_TIERS;
    // 500 points, Biga only: only tier 1 can fire.
    const bigaOnly = withRacing({ leaguePoints: 0 });
    expect(resolveLeaguePrizeAwards(bigaOnly, 500).map((award) => award.tier.id)).toEqual([1]);
    // Triga owned, Quadra locked: tiers 1 and 2 fire, tier 3 waits.
    const triga = withRacing({ leaguePoints: 0, unlocked: [3] });
    expect(resolveLeaguePrizeAwards(triga, 500).map((award) => award.tier.id)).toEqual([1, 2]);
    // A hand-edited Quadra without Triga does not count: the prerequisite rule
    // is the same one resolveRacingState enforces, so tiers 2 and 3 both wait.
    const quadraAlone = withRacing({ leaguePoints: 0, unlocked: [4] });
    expect(resolveLeaguePrizeAwards(quadraAlone, 500).map((award) => award.tier.id)).toEqual([1]);
    expect(resolveLeaguePrizeAwards(quadraAlone, third.pointsToAdvance).length).toBe(1);
    expect(second.pointsToAdvance).toBeGreaterThan(0);
  });

  test('a retroactive profile collects every due bonus at once', () => {
    const profile = withRacing({ leaguePoints: 0, unlocked: [3, 4] });
    const awards = resolveLeaguePrizeAwards(profile, LEAGUE_TIERS[2].pointsToAdvance);
    expect(awards.map((award) => award.tier.id)).toEqual([1, 2, 3]);
    expect(awards.reduce((sum, award) => sum + award.gold, 0)).toBe(2350);
    expect(awards.reduce((sum, award) => sum + award.fame, 0)).toBe(190);
  });
});

describe('ECON-2 §C — the standing line names the next tier, never a placement', () => {
  test('points to go: tier name and the gap', () => {
    const line = leagueStandingLine(resolveLeagueStanding(withRacing({ leaguePoints: 50 })));
    expect(line).toBe('League standing: 50 points — Provincial Track Circuit next, 50 points to go.');
  });

  test('threshold met, team owned: the tier is reached', () => {
    const line = leagueStandingLine(
      resolveLeagueStanding(withRacing({ leaguePoints: LEAGUE_TIERS[0].pointsToAdvance })),
    );
    expect(line).toBe('League standing: 100 points — Provincial Track Circuit reached.');
  });

  test('threshold met, team locked: the line names the team that unlocks the claim', () => {
    const line = leagueStandingLine(
      resolveLeagueStanding(
        withRacing({
          leaguePoints: LEAGUE_TIERS[1].pointsToAdvance,
          leaguePrizesClaimed: [LEAGUE_TIERS[0].id],
        }),
      ),
    );
    expect(line).toBe(
      'League standing: 250 points — Circus Metropolis Cup reached; own a Triga team to claim its 600g bonus.',
    );
  });

  test('all claimed: the line says so', () => {
    const line = leagueStandingLine(
      resolveLeagueStanding(
        withRacing({
          leaguePoints: LEAGUE_TIERS[2].pointsToAdvance,
          unlocked: [3, 4],
          leaguePrizesClaimed: LEAGUE_TIERS.map((tier) => tier.id),
        }),
      ),
    );
    expect(line).toBe('League standing: 500 points — all 3 League bonuses claimed.');
  });

  test('no line ever claims a placement', () => {
    const profiles = [
      createNewProfile('League Racer'),
      withRacing({ leaguePoints: 50 }),
      withRacing({ leaguePoints: 500, unlocked: [3, 4] }),
      withRacing({ leaguePoints: 500, unlocked: [3, 4], leaguePrizesClaimed: [1, 2, 3] }),
    ];
    for (const profile of profiles) {
      const line = leagueStandingLine(resolveLeagueStanding(profile));
      expect(line).not.toMatch(/first place|1st place|won the|champion of/i);
    }
  });
});

describe('ECON-2 §D — tier lookup', () => {
  test('getLeagueTier returns the tier, or undefined for an unknown id', () => {
    expect(getLeagueTier(LEAGUE_TIERS[0].id)?.name).toBe('Provincial Track Circuit');
    expect(getLeagueTier(99)).toBeUndefined();
  });
});
