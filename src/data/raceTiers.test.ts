/**
 * LADDER-1E Part 1 — race tier config.
 *
 * `raceTiers.ts` is the source of truth for the two shipped rungs, District
 * and League.  This suite pins the shipped config: laps, field sizes, pools,
 * the stamina drain multipliers (District 0.8, League 1.0 — the §7 Q1
 * decision, a drain-rate multiplier, not a bigger pool), the race economy as
 * written in code, the fail-closed resolver, and the fact that
 * `RUNG_FIELD_SIZE` reads from the tier config.  Pools and the pool speed
 * invariant (every League lap time faster than every rookie lap time) are
 * pinned here too, so a tier-config change cannot silently move them.
 *
 * Championship is Update 1 and is NOT here: no 7-lap / 5-rival field, no
 * Fortuna-off configuration, no Championship pool.
 *
 * Run with: `bun test src/data/raceTiers.test.ts`
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { RACE_TIERS, resolveRaceTier, rungStaminaDrainMultiplier } from './raceTiers';
import { RUNG_FIELD_SIZE, resolveRungField, ROOKIE_POOL, LEAGUE_POOL } from '../utils/raceCompetitors';

describe('race tier config (LADDER-1E Part 1)', () => {
  test('District is the rookie rung: 3 laps, 2 rivals, rookie pool, gentler drain', () => {
    const district = RACE_TIERS.district;
    expect(district.id).toBe('district');
    expect(district.laps).toBe(3);
    expect(district.fieldSize).toBe(2);
    expect(district.pool).toBe('rookie');
    expect(district.staminaDrainMultiplier).toBe(0.8);
  });

  test('League is the top rung: 5 laps, 4 rivals, League pool, full drain', () => {
    const league = RACE_TIERS.league;
    expect(league.id).toBe('league');
    expect(league.laps).toBe(5);
    expect(league.fieldSize).toBe(4);
    expect(league.pool).toBe('league');
    expect(league.staminaDrainMultiplier).toBe(1.0);
  });

  test('the economy is the ECON-1 table as written in code, not the shorthand', () => {
    for (const rung of ['district', 'league'] as const) {
      const economy = RACE_TIERS[rung].economy;
      // Base 80/120/200 by team size; victory bonus 20/30/50.  The
      // "100/150/250" figure is the victory total only — never the table.
      expect(economy.basePurse).toEqual({ 2: 80, 3: 120, 4: 200 });
      expect(economy.victoryBonus).toEqual({ 2: 20, 3: 30, 4: 50 });
      expect(economy.leaguePoints).toEqual({ win: 50, other: 15 });
      // Racing pays no fame per race — fame arrives only through the ECON-2
      // milestone prizes.
      expect(economy.famePerRace).toBe(0);
    }
    // One table, named once: both rungs share the same economy object.
    expect(RACE_TIERS.district.economy).toBe(RACE_TIERS.league.economy);
  });

  test('the resolver fails closed to the District, the always-open rung', () => {
    expect(resolveRaceTier('league')).toBe(RACE_TIERS.league);
    expect(resolveRaceTier('district')).toBe(RACE_TIERS.district);
    for (const value of ['championship', 'League', '', undefined, null, 0, 1, {}, []]) {
      expect(resolveRaceTier(value)).toBe(RACE_TIERS.district);
    }
  });

  test('RUNG_FIELD_SIZE reads from the tier config', () => {
    expect(RUNG_FIELD_SIZE).toEqual({ district: 2, league: 4 });
    expect(RUNG_FIELD_SIZE.district).toBe(RACE_TIERS.district.fieldSize);
    expect(RUNG_FIELD_SIZE.league).toBe(RACE_TIERS.league.fieldSize);
    // And the field draw follows it.
    expect(resolveRungField('district')).toHaveLength(2);
    expect(resolveRungField('league')).toHaveLength(4);
    expect(resolveRungField('championship')).toHaveLength(2);
  });

  test('pools and the pool speed invariant are unchanged', () => {
    expect(ROOKIE_POOL).toHaveLength(3);
    expect(LEAGUE_POOL).toHaveLength(5);
    expect(ROOKIE_POOL.map((rival) => rival.id)).toEqual([
      'russata_rookie', 'servius_veneta_rookie', 'manius_prasina_rookie',
    ]);
    expect(LEAGUE_POOL.map((rival) => rival.id)).toEqual([
      'albata_champion', 'appius_albata', 'tiberius_russata', 'veneta_veteran', 'spurius_prasina',
    ]);
    // Every League lap time is faster than every rookie lap time, so the
    // rungs never overlap in speed.
    const slowestLeague = Math.max(...LEAGUE_POOL.map((rival) => rival.lapDurationMs));
    const fastestRookie = Math.min(...ROOKIE_POOL.map((rival) => rival.lapDurationMs));
    expect(slowestLeague).toBeLessThan(fastestRookie);
  });

  test('the drain multiplier resolves per rung, and an unknown rung drains at 1.0', () => {
    // LADDER-1E Part 5 — the wiring's fail-closed rule: District 0.8,
    // League 1.0, anything else the full League rate, never less. (The
    // tier resolver itself still fails closed to the District CONFIG —
    // the two resolvers answer different questions.)
    expect(rungStaminaDrainMultiplier('district')).toBe(0.8);
    expect(rungStaminaDrainMultiplier('league')).toBe(1.0);
    for (const value of ['championship', 'League', '', undefined, null, 0, 1, {}, []]) {
      expect(rungStaminaDrainMultiplier(value)).toBe(1);
    }
    expect(rungStaminaDrainMultiplier('district')).toBe(RACE_TIERS.district.staminaDrainMultiplier);
    expect(rungStaminaDrainMultiplier('league')).toBe(RACE_TIERS.league.staminaDrainMultiplier);
  });

  test('the config is immutable', () => {
    expect(Object.isFrozen(RACE_TIERS)).toBe(true);
    expect(Object.isFrozen(RACE_TIERS.district)).toBe(true);
    expect(Object.isFrozen(RACE_TIERS.league)).toBe(true);
    expect(Object.isFrozen(RACE_TIERS.district.economy)).toBe(true);
  });
});
