/**
 * LADDER-1E Part 1 — racing-record preservation.
 *
 * Before 1E, `purchaseRacingConfig` and `selectRacingConfig` built a fresh
 * `racing: { unlocked, selected }` literal and dropped every other subfield:
 * buying or selecting a team erased bestTimes, counts, points, and prizes —
 * the whole racing record, verified by execution in the 1E recon.  Both
 * functions now spread the stored field first and only override
 * `unlocked` / `selected`.  This suite pins that: a buy and a select against
 * a profile carrying a full racing record leave every career field intact.
 *
 * The purchase/select rules themselves (prices, prerequisites, refusals) are
 * pinned by phaseC8_67b/c/d, 70b, and phaseP4StableProgression — this suite
 * adds only the preservation case and touches no other assertion.
 *
 * Run with: `bun test src/utils/racingProgression.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { PlayerProfile } from '../types/game';
import { createNewProfile } from '../services/storage';
import { purchaseRacingConfig, selectRacingConfig } from './racingProgression';

/**
 * A profile with a full racing record: Triga unlocked and selected, best
 * times for all three teams, a season of counts, a purse day, league points,
 * and two claimed ECON-2 prizes.  Gold covers a Quadra purchase (1,500g).
 */
function fullRacingProfile(): PlayerProfile {
  return {
    ...createNewProfile('Tester'),
    gold: 5000,
    racing: {
      unlocked: [3],
      selected: 3,
      bestTimes: { 2: 64000, 3: 61000, 4: 58000 },
      completed: 12,
      wins: 7,
      losses: 5,
      photoFinishes: 2,
      lastPurseDay: 41,
      leaguePoints: 265,
      leaguePrizesClaimed: [1, 2],
    },
  };
}

describe('racing-record preservation (LADDER-1E Part 1)', () => {
  test('buying Quadra preserves every career field and only changes unlocks', () => {
    const before = fullRacingProfile();
    const snapshot = JSON.parse(JSON.stringify(before.racing));

    const result = purchaseRacingConfig(before, 'quadra');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const racing = result.profile.racing!;

    // The purchase itself: 1,500g once, Quadra unlocked, selection untouched.
    expect(result.profile.gold).toBe(3500);
    expect(racing.unlocked).toEqual([3, 4]);
    expect(racing.selected).toBe(3);

    // Every career field survives, byte for byte.
    expect(racing.bestTimes).toEqual(snapshot.bestTimes);
    expect(racing.completed).toBe(snapshot.completed);
    expect(racing.wins).toBe(snapshot.wins);
    expect(racing.losses).toBe(snapshot.losses);
    expect(racing.photoFinishes).toBe(snapshot.photoFinishes);
    expect(racing.lastPurseDay).toBe(snapshot.lastPurseDay);
    expect(racing.leaguePoints).toBe(snapshot.leaguePoints);
    expect(racing.leaguePrizesClaimed).toEqual(snapshot.leaguePrizesClaimed);

    // The input profile is never mutated in place.
    expect(before.racing).toEqual(snapshot);
    expect(before.gold).toBe(5000);
  });

  test('selecting Triga preserves every career field and only changes selection', () => {
    const before: PlayerProfile = {
      ...fullRacingProfile(),
      racing: { ...fullRacingProfile().racing, selected: 2 },
    };
    const snapshot = JSON.parse(JSON.stringify(before.racing));

    const result = selectRacingConfig(before, 'triga');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const racing = result.profile.racing!;

    // The selection itself: free, Triga selected, unlocks untouched.
    expect(result.profile.gold).toBe(5000);
    expect(racing.unlocked).toEqual([3]);
    expect(racing.selected).toBe(3);

    // Every career field survives, byte for byte.
    expect(racing.bestTimes).toEqual(snapshot.bestTimes);
    expect(racing.completed).toBe(snapshot.completed);
    expect(racing.wins).toBe(snapshot.wins);
    expect(racing.losses).toBe(snapshot.losses);
    expect(racing.photoFinishes).toBe(snapshot.photoFinishes);
    expect(racing.lastPurseDay).toBe(snapshot.lastPurseDay);
    expect(racing.leaguePoints).toBe(snapshot.leaguePoints);
    expect(racing.leaguePrizesClaimed).toEqual(snapshot.leaguePrizesClaimed);

    // The input profile is never mutated in place.
    expect(before.racing).toEqual(snapshot);
  });

  test('buying on a profile with no racing field still writes only unlocks + selection', () => {
    const before: PlayerProfile = { ...createNewProfile('Fresh'), gold: 5000 };
    expect(before.racing).toBeUndefined();

    const result = purchaseRacingConfig(before, 'triga');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.profile.gold).toBe(4250);
    expect(result.profile.racing).toEqual({ unlocked: [3], selected: 2 });
  });
});
