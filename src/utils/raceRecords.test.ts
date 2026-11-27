// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { createNewProfile } from '../services/storage';
import { readFileSync } from 'node:fs';
import { recordRaceBestTime, resolveNormalizedRaceTime, settleRaceCompletion, MAX_RECORDED_RACE_TIME_MS } from './raceRecords';
import { RACE_TIERS } from '../data/raceTiers';

describe('race best-time transaction', () => {
  test('a first finish writes only the selected team time and preserves legacy progression', () => {
    const profile = createNewProfile('Record Keeper');
    const result = recordRaceBestTime(profile, 2, 12543.4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.improved).toBe(true);
    expect(result.bestTimeMs).toBe(12543);
    expect(result.profile.racing).toEqual({ bestTimes: { 2: 12543 } });
    expect(profile.racing).toBeUndefined();
    expect(result.profile.gold).toBe(profile.gold);
  });

  test('a faster lap replaces only its team record', () => {
    const profile = { ...createNewProfile('Record Keeper'), racing: { unlocked: [3], selected: 3, bestTimes: { 2: 15000, 3: 18000 } } };
    const result = recordRaceBestTime(profile, 3, 16000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.improved).toBe(true);
    expect(result.profile.racing).toEqual({ unlocked: [3], selected: 3, bestTimes: { 2: 15000, 3: 16000 } });
  });

  test('slower or equal laps are no-ops', () => {
    const profile = { ...createNewProfile('Record Keeper'), racing: { unlocked: [3], selected: 3, bestTimes: { 3: 16000 } } };
    for (const time of [16000, 17000]) {
      const result = recordRaceBestTime(profile, 3, time);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.improved).toBe(false);
        expect(result.profile).toBe(profile);
        expect(result.bestTimeMs).toBe(16000);
      }
    }
  });

  test('bad times never mutate a profile', () => {
    const profile = createNewProfile('Record Keeper');
    for (const time of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, MAX_RECORDED_RACE_TIME_MS + 1]) {
      const result = recordRaceBestTime(profile, 2, time);
      expect(result.ok).toBe(false);
      expect(profile.racing).toBeUndefined();
    }
  });

  test('invalid runtime team sizes cannot create unsupported best-time keys', () => {
    const profile = createNewProfile('Record Keeper');
    for (const teamSize of [0, 1, 2.5, 5, '2', null] as unknown[]) {
      const result = recordRaceBestTime(profile, teamSize as 2, 12345);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('invalid-team-size');
      expect(profile.racing).toBeUndefined();
    }
  });

  test('malformed previous time is replaced by a valid finish', () => {
    const profile = { ...createNewProfile('Record Keeper'), racing: { selected: 2, bestTimes: { 2: Number.NaN, 3: 'bad' } } } as unknown as ReturnType<typeof createNewProfile>;
    const result = recordRaceBestTime(profile, 2, 12345);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profile.racing?.bestTimes).toEqual({ 2: 12345, 3: 'bad' });
  });

  test('completion purse is free-entry, team-scaled, and includes a modest victory bonus', () => {
    const profile = createNewProfile('Circus Career');
    const biga = settleRaceCompletion(profile, 2, 15000, 'victory', 4, 'district', 1);
    expect(biga.ok).toBe(true);
    if (!biga.ok) return;
    expect(biga.purseAwarded).toBe(100);
    expect(biga.profile.gold).toBe(profile.gold + 100);
    expect(biga.profile.racing).toMatchObject({ completed: 1, wins: 1, losses: 0, lastPurseDay: 4 });
  });

  test('only one purse is paid per in-game day, but every valid finish is recorded', () => {
    const first = settleRaceCompletion(createNewProfile('Circus Career'), 2, 15000, 'defeat', 7, 'district', 3);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = settleRaceCompletion(first.profile, 2, 14500, 'victory', 7, 'district', 1);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.purseAwarded).toBe(0);
    expect(second.profile.gold).toBe(first.profile.gold);
    expect(second.profile.racing).toMatchObject({ completed: 2, wins: 1, losses: 1, lastPurseDay: 7 });
    const nextDay = settleRaceCompletion(second.profile, 2, 14000, 'photo-finish', 8, 'district', 1);
    expect(nextDay.ok).toBe(true);
    if (nextDay.ok) expect(nextDay.purseAwarded).toBe(80);
  });

  test('ECON-1 purse table: every team pays its base, victory adds its bonus', () => {
    // Biga 80+20=100, Triga 120+30=150, Quadra 200+50=250 per paid race-day.
    const cases: [2 | 3 | 4, 'victory' | 'defeat', number][] = [
      [2, 'victory', 100],
      [2, 'defeat', 80],
      [3, 'victory', 150],
      [3, 'defeat', 120],
      [4, 'victory', 250],
      [4, 'defeat', 200],
    ];
    for (const [teamSize, outcome, purse] of cases) {
      const result = settleRaceCompletion(createNewProfile('Circus Career'), teamSize, 15000, outcome, 4, 'district', outcome === 'victory' ? 1 : 3);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.purseAwarded).toBe(purse);
      expect(result.profile.gold).toBe(100 + purse);
    }
  });

  test('ECON-1 leaves league points and best-time recording unchanged', () => {
    const win = settleRaceCompletion(createNewProfile('Circus Career'), 2, 15000, 'victory', 4, 'district', 1);
    expect(win.ok).toBe(true);
    if (!win.ok) return;
    // Victory still earns 50 league points, defeat 15 — the rebalance touches
    // the purse only.
    expect(win.profile.racing?.leaguePoints).toBe(50);
    expect(win.bestTimeMs).toBe(15000);
    expect(win.profile.racing?.bestTimes).toEqual({ 2: 15000 });
    const loss = settleRaceCompletion(createNewProfile('Circus Career'), 3, 16000, 'defeat', 4, 'district', 3);
    expect(loss.ok).toBe(true);
    if (!loss.ok) return;
    expect(loss.profile.racing?.leaguePoints).toBe(15);
    expect(loss.bestTimeMs).toBe(16000);
    expect(loss.profile.racing?.bestTimes).toEqual({ 3: 16000 });
  });

  test('BET-1 — a stale bet on an old save is never settled: the purse only', () => {
    // The bookmaker is cut, but the `activeRaceBet` field stays declared (inert,
    // §J stays 29). A save that still carries one settles exactly like a save
    // with none: the purse is the whole gold movement, and the stale bet sits
    // unread — no payout, no clearing, no refund.
    const stale = {
      ...createNewProfile('Circus Career'),
      activeRaceBet: { factionId: 'green_prasina', wagerAmount: 50, oddsMultiplier: 1.8, potentialPayout: 90 },
    } as ReturnType<typeof createNewProfile>;
    const win = settleRaceCompletion(stale, 2, 15000, 'victory', 4, 'district', 1);
    expect(win.ok).toBe(true);
    if (!win.ok) return;
    expect(win.purseAwarded).toBe(100);
    expect(win.profile.gold).toBe(100 + 100);
    expect(win.profile.activeRaceBet).toEqual(stale.activeRaceBet);
  });

  test('invalid completion timing, team, outcome or day cannot pay a purse', () => {
    const profile = createNewProfile('Circus Career');
    const cases = [
      [2, 0, 'victory', 1], [1, 10000, 'victory', 1], [2, 10000, 'unknown', 1], [2, 10000, 'victory', -1],
    ] as unknown[][];
    for (const args of cases) {
      const result = settleRaceCompletion(profile, args[0] as 2, args[1] as number, args[2] as 'victory', args[3] as number, 'district', 1);
      expect(result.ok).toBe(false);
      expect(profile.gold).toBe(100);
      expect(profile.racing).toBeUndefined();
    }
  });

  test('only the finish transition requests a record write; abort stays read-only', () => {
    const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    const scene = readFileSync(new URL('../components/3d/RaceScene.tsx', import.meta.url), 'utf8');
    expect(app.includes('onRecordRaceCompletion={handleRecordRaceCompletion}')).toBe(true);
    expect(scene.includes('onRecordRaceCompletion(teamSize, normalizedElapsedMs, outcome, rungId, finishPlace)')).toBe(true);
    const exit = app.slice(app.indexOf('const handleExitRace'), app.indexOf('const handleOpenHubTab'));
    expect(exit.includes('recordRaceBestTime')).toBe(false);
    expect(exit.includes('saveProfile')).toBe(false);
  });
});

describe('ECON-2 league milestone prizes', () => {
  test('tier 1 fires on the second win: 250g + 20 fame, once', () => {
    const first = settleRaceCompletion(createNewProfile('Circus Career'), 2, 15000, 'victory', 1, 'district', 1);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.prizeAwarded).toBe(0);
    expect(first.fameAwarded).toBe(0);
    expect(first.tierAdvanced).toBeNull();
    expect(first.leaguePointsEarned).toBe(50);
    expect(first.profile.racing?.leaguePoints).toBe(50);
    // Nothing claimed yet, so the claim list stays absent — no empty field written.
    expect(first.profile.racing?.leaguePrizesClaimed).toBeUndefined();

    const second = settleRaceCompletion(first.profile, 2, 15000, 'victory', 2, 'district', 1);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.prizeAwarded).toBe(250);
    expect(second.fameAwarded).toBe(20);
    expect(second.tierAdvanced).toBe(1);
    expect(second.profile.gold).toBe(100 + 100 + 100 + 250);
    expect(second.profile.fame).toBe(20);
    expect(second.profile.racing?.leaguePrizesClaimed).toEqual([1]);

    const third = settleRaceCompletion(second.profile, 2, 15000, 'victory', 3, 'district', 1);
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    expect(third.prizeAwarded).toBe(0);
    expect(third.fameAwarded).toBe(0);
    expect(third.tierAdvanced).toBeNull();
    expect(third.profile.racing?.leaguePrizesClaimed).toEqual([1]);
  });

  test('the full ladder: tier 2 at 5 wins once Triga is owned, tier 3 at 10 once Quadra is owned', () => {
    let profile = createNewProfile('Circus Career');
    const win = (day: number) => {
      const result = settleRaceCompletion(profile, 2, 15000, 'victory', day, 'district', 1);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('settlement failed');
      profile = result.profile;
      return result;
    };
    expect(win(1).prizeAwarded).toBe(0);
    expect(win(2).prizeAwarded).toBe(250);
    win(3);
    win(4);
    const fifth = win(5); // 250 points, Triga still locked
    expect(fifth.prizeAwarded).toBe(0);
    expect(profile.racing?.leaguePrizesClaimed).toEqual([1]);

    profile = { ...profile, racing: { ...profile.racing, unlocked: [3] } };
    const sixth = win(6); // 300 points, Triga owned: tier 2 fires now
    expect(sixth.prizeAwarded).toBe(600);
    expect(sixth.fameAwarded).toBe(50);
    expect(sixth.tierAdvanced).toBe(2);
    expect(profile.racing?.leaguePrizesClaimed).toEqual([1, 2]);

    win(7);
    win(8);
    win(9);
    const tenth = win(10); // 500 points, Quadra still locked
    expect(tenth.prizeAwarded).toBe(0);

    profile = { ...profile, racing: { ...profile.racing, unlocked: [3, 4] } };
    const eleventh = win(11);
    expect(eleventh.prizeAwarded).toBe(1500);
    expect(eleventh.fameAwarded).toBe(120);
    expect(eleventh.tierAdvanced).toBe(3);
    expect(profile.racing?.leaguePrizesClaimed).toEqual([1, 2, 3]);
    expect(profile.fame).toBe(190);
    expect(profile.gold).toBe(100 + 11 * 100 + 2350);

    const twelfth = win(12); // claimed: nothing more pays
    expect(twelfth.prizeAwarded).toBe(0);
    expect(twelfth.fameAwarded).toBe(0);
    expect(twelfth.tierAdvanced).toBeNull();
  });

  test('the prize fires on an already-paid day: it sits outside the purse cap', () => {
    const first = settleRaceCompletion(createNewProfile('Circus Career'), 2, 15000, 'victory', 4, 'district', 1);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.purseAwarded).toBe(100);
    const second = settleRaceCompletion(first.profile, 2, 15000, 'victory', 4, 'district', 1);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.purseAwarded).toBe(0);
    expect(second.prizeAwarded).toBe(250);
    expect(second.fameAwarded).toBe(20);
    expect(second.profile.gold).toBe(100 + 100 + 0 + 250);
  });

  test('mixed results reach tier 1 on the third finish (50 + 15 + 50)', () => {
    let profile = createNewProfile('Circus Career');
    const finish = (outcome: 'victory' | 'defeat', day: number) => {
      const result = settleRaceCompletion(profile, 2, 15000, outcome, day, 'district', outcome === 'victory' ? 1 : 3);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('settlement failed');
      profile = result.profile;
      return result;
    };
    expect(finish('victory', 1).prizeAwarded).toBe(0);
    const loss = finish('defeat', 2);
    expect(loss.prizeAwarded).toBe(0);
    expect(loss.leaguePointsEarned).toBe(15);
    expect(profile.racing?.leaguePoints).toBe(65);
    const third = finish('victory', 3);
    expect(third.prizeAwarded).toBe(250);
    expect(third.tierAdvanced).toBe(1);
  });

  test('defeats alone still reach tier 1, on the seventh (7 x 15)', () => {
    let profile = createNewProfile('Circus Career');
    let last = null as unknown as ReturnType<typeof settleRaceCompletion>;
    for (let day = 1; day <= 7; day++) {
      last = settleRaceCompletion(profile, 2, 15000, 'defeat', day, 'district', 3);
      expect(last.ok).toBe(true);
      if (!last.ok) return;
      profile = last.profile;
      expect(last.prizeAwarded).toBe(day === 7 ? 250 : 0);
    }
    expect(profile.racing?.leaguePoints).toBe(105);
    expect(profile.racing?.leaguePrizesClaimed).toEqual([1]);
  });

  test('ECON-2 retroactive: a save banking 480 points collects all three bonuses on its next finish', () => {
    const banked = {
      ...createNewProfile('Circus Career'),
      racing: { leaguePoints: 480, unlocked: [3, 4] },
    } as ReturnType<typeof createNewProfile>;
    const result = settleRaceCompletion(banked, 2, 15000, 'victory', 1, 'district', 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prizeAwarded).toBe(2350);
    expect(result.fameAwarded).toBe(190);
    expect(result.tierAdvanced).toBe(3);
    expect(result.profile.racing?.leaguePrizesClaimed).toEqual([1, 2, 3]);
    expect(result.profile.gold).toBe(100 + 100 + 2350);
    expect(result.profile.fame).toBe(190);
  });

  test('ECON-2 retroactive team gate: 500 banked points pay tier 1 only until the teams are owned', () => {
    let profile = {
      ...createNewProfile('Circus Career'),
      racing: { leaguePoints: 500 },
    } as ReturnType<typeof createNewProfile>;
    const first = settleRaceCompletion(profile, 2, 15000, 'victory', 1, 'district', 1);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.prizeAwarded).toBe(250);
    expect(first.tierAdvanced).toBe(1);
    expect(first.profile.racing?.leaguePrizesClaimed).toEqual([1]);

    profile = { ...first.profile, racing: { ...first.profile.racing, unlocked: [3, 4] } };
    const second = settleRaceCompletion(profile, 2, 15000, 'victory', 2, 'district', 1);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.prizeAwarded).toBe(2100);
    expect(second.fameAwarded).toBe(170);
    expect(second.tierAdvanced).toBe(3);
    expect(second.profile.racing?.leaguePrizesClaimed).toEqual([1, 2, 3]);
  });

  test('the prize and the purse stay separate: a Quadra prize finish still pays its own purse', () => {
    const profile = {
      ...createNewProfile('Circus Career'),
      // Tiers 1 and 2 already claimed, so only tier 3 is due on this finish.
      racing: { leaguePoints: 450, unlocked: [3, 4], leaguePrizesClaimed: [1, 2] },
    } as ReturnType<typeof createNewProfile>;
    const result = settleRaceCompletion(profile, 4, 15000, 'victory', 1, 'district', 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.purseAwarded).toBe(250);
    expect(result.prizeAwarded).toBe(1500);
    expect(result.profile.gold).toBe(100 + 250 + 1500);
  });

  test('a stale bet still sits unread when a League bonus fires', () => {
    const stale = {
      ...createNewProfile('Circus Career'),
      activeRaceBet: { factionId: 'green_prasina', wagerAmount: 50, oddsMultiplier: 1.8, potentialPayout: 90 },
      racing: { leaguePoints: 90 },
    } as ReturnType<typeof createNewProfile>;
    const result = settleRaceCompletion(stale, 2, 15000, 'victory', 1, 'district', 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.prizeAwarded).toBe(250);
    expect(result.profile.activeRaceBet).toEqual(stale.activeRaceBet);
  });

  test('the prize is displayed, not silent: the finish screen names the League bonus apart from the purse', () => {
    const scene = readFileSync(new URL('../components/3d/RaceScene.tsx', import.meta.url), 'utf8');
    expect(scene).toContain('data-race-league-prize');
    expect(scene).toContain('League bonus');
    expect(scene).toContain('data-race-purse');
    expect(scene).toContain('raceSettlement.prizeAwarded');
    const panel = readFileSync(new URL('../components/hub/PreRacePanel.tsx', import.meta.url), 'utf8');
    expect(panel).toContain('data-race-field="league-standing"');
    expect(panel).toContain('leagueStandingLine(leagueStanding)');
    const workshop = readFileSync(new URL('../components/hub/RacingConfigSection.tsx', import.meta.url), 'utf8');
    expect(workshop).toContain('data-racing-league-standing');
    expect(workshop).toContain('leagueStandingLine(leagueStanding)');
    // The shared line itself lives in the league module, and names the next
    // tier and the gap — never a placement.
    const league = readFileSync(new URL('./racingLeague.ts', import.meta.url), 'utf8');
    expect(league).toContain('League standing:');
    // No surface claims a placement the 1v1 race does not have.
    for (const source of [scene, panel, workshop, league]) {
      expect(source).not.toMatch(/first place prize|won first place/i);
    }
  });
});

describe('LADDER-1E Part 3 — the per-rung results write', () => {
  test('a District finish writes the District fields and leaves the League fields absent', () => {
    const result = settleRaceCompletion(createNewProfile('Circus Career'), 2, 15000, 'victory', 4, 'district', 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.racing).toMatchObject({
      districtBestFinish: 1,
      districtCompleted: 1,
      districtWins: 1,
    });
    expect(result.profile.racing?.leagueBestFinish).toBeUndefined();
    expect(result.profile.racing?.leagueCompleted).toBeUndefined();
    expect(result.profile.racing?.leagueWins).toBeUndefined();
  });

  test('a District top-2 defeat still records the best finish (2nd opens the League)', () => {
    const result = settleRaceCompletion(createNewProfile('Circus Career'), 2, 15000, 'defeat', 4, 'district', 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.racing).toMatchObject({ districtBestFinish: 2, districtCompleted: 1, districtWins: 0 });
    expect(result.profile.racing?.wins).toBe(0);
    expect(result.profile.racing?.losses).toBe(1);
  });

  test('best finish is min-wins: a later worse finish never moves it, a better one does', () => {
    let profile = createNewProfile('Circus Career');
    const finish = (place: number, day: number) => {
      const result = settleRaceCompletion(profile, 2, 15000, 'defeat', day, 'district', place);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('settlement failed');
      profile = result.profile;
    };
    finish(3, 1);
    expect(profile.racing?.districtBestFinish).toBe(3);
    finish(2, 2);
    expect(profile.racing?.districtBestFinish).toBe(2);
    finish(3, 3);
    expect(profile.racing?.districtBestFinish).toBe(2);
    expect(profile.racing?.districtCompleted).toBe(3);
  });

  test('a League finish writes the League fields and never touches the District fields', () => {
    let profile = createNewProfile('Circus Career');
    const district = settleRaceCompletion(profile, 2, 15000, 'victory', 1, 'district', 1);
    expect(district.ok).toBe(true);
    if (!district.ok) return;
    profile = district.profile;
    const league = settleRaceCompletion(profile, 2, 14000, 'defeat', 2, 'league', 4);
    expect(league.ok).toBe(true);
    if (!league.ok) return;
    expect(league.profile.racing).toMatchObject({
      districtBestFinish: 1,
      districtCompleted: 1,
      districtWins: 1,
      leagueBestFinish: 4,
      leagueCompleted: 1,
      leagueWins: 0,
    });
  });

  test('an unusable finish place still settles the race but writes no best finish', () => {
    const profile = createNewProfile('Circus Career');
    for (const place of [0, -1, 2.5, 99, 'first', null, undefined] as unknown[]) {
      const result = settleRaceCompletion(profile, 2, 15000, 'victory', 4, 'district', place);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.profile.racing?.districtCompleted).toBe(1);
      expect(result.profile.racing?.districtWins).toBe(1);
      expect(result.profile.racing?.districtBestFinish).toBeUndefined();
    }
  });

  test('an unknown rung settles as District, never a locked rung', () => {
    const profile = createNewProfile('Circus Career');
    for (const rung of ['championship', 'league ', undefined, null, 42] as unknown[]) {
      const result = settleRaceCompletion(profile, 2, 15000, 'victory', 4, rung, 1);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.profile.racing?.districtCompleted).toBe(1);
      expect(result.profile.racing?.leagueCompleted).toBeUndefined();
    }
  });

  test('a malformed previous per-rung record is treated as absent, not as evidence', () => {
    const profile = {
      ...createNewProfile('Circus Career'),
      racing: { districtBestFinish: 'first', districtCompleted: 'many', districtWins: -2 },
    } as unknown as ReturnType<typeof createNewProfile>;
    const result = settleRaceCompletion(profile, 2, 15000, 'defeat', 4, 'district', 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.racing).toMatchObject({ districtBestFinish: 2, districtCompleted: 1, districtWins: 0 });
  });

  test('a legacy save without per-rung subfields settles to the defaults (GC20)', () => {
    // A save from before 1E carries no per-rung fields at all: the first
    // District finish writes them from zero, and the League fields stay
    // absent until a League race is run.
    const legacy = { ...createNewProfile('Circus Career'), racing: { bestTimes: { 2: 16000 } } };
    const result = settleRaceCompletion(legacy, 2, 15000, 'victory', 4, 'district', 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.racing).toMatchObject({ districtBestFinish: 1, districtCompleted: 1, districtWins: 1 });
    expect(result.profile.racing?.bestTimes).toEqual({ 2: 15000 });
    expect(result.profile.racing?.leagueBestFinish).toBeUndefined();
  });

  test('the settlement reads the NAMED economy table in raceTiers.ts — no drift', () => {
    // The table in `raceTiers.ts` is the one config; the settlement must pay
    // exactly what it names for every team and outcome.
    const economy = RACE_TIERS.district.economy;
    for (const teamSize of [2, 3, 4] as const) {
      for (const outcome of ['victory', 'defeat'] as const) {
        const result = settleRaceCompletion(createNewProfile('Circus Career'), teamSize, 15000, outcome, 4, 'district', 1);
        expect(result.ok).toBe(true);
        if (!result.ok) continue;
        const expectedPurse = economy.basePurse[teamSize] + (outcome === 'victory' ? economy.victoryBonus[teamSize] : 0);
        expect(result.purseAwarded).toBe(expectedPurse);
        expect(result.leaguePointsEarned).toBe(outcome === 'victory' ? economy.leaguePoints.win : economy.leaguePoints.other);
        expect(economy.famePerRace).toBe(0);
      }
    }
    const records = readFileSync(new URL('./raceRecords.ts', import.meta.url), 'utf8');
    expect(records).toContain("from '../data/raceTiers'");
    expect(records).toContain('resolveRaceTier');
  });
});

describe('LADDER-1E Part 3 — the best-time normalization', () => {
  test('the measured slot gap is subtracted from the raw elapsed', () => {
    // The leader crossed at t=10000, the player at t=12500: the gap is 2500.
    expect(resolveNormalizedRaceTime(180000, 12500, 10000)).toBe(177500);
  });

  test('a missing clock origin normalizes to the raw elapsed', () => {
    expect(resolveNormalizedRaceTime(180000, null, 10000)).toBe(180000);
    expect(resolveNormalizedRaceTime(180000, 12500, null)).toBe(180000);
  });

  test('a non-positive gap normalizes to the raw elapsed', () => {
    expect(resolveNormalizedRaceTime(180000, 10000, 10000)).toBe(180000);
    expect(resolveNormalizedRaceTime(180000, 9000, 10000)).toBe(180000);
  });

  test('a gap that would erase the race normalizes to the raw elapsed', () => {
    expect(resolveNormalizedRaceTime(2000, 12500, 10000)).toBe(2000);
  });

  test('an invalid elapsed passes through untouched (the settlement still rejects it)', () => {
    expect(resolveNormalizedRaceTime(0, 12500, 10000)).toBe(0);
    expect(resolveNormalizedRaceTime(Number.NaN, 12500, 10000)).toBeNaN();
  });
});
