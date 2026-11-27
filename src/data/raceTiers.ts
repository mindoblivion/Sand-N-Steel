/**
 * LADDER-1E — race tier config (challenge §2E).
 *
 * One module owns the full tier config for the two shipped rungs, District
 * and League.  Championship is Update 1 and is NOT here: no 7-lap / 5-rival
 * field, no Fortuna-off configuration, no Championship pool.
 *
 * What lives here:
 *   • rung id, laps, field size, and which ladder pool the field draws from;
 *   • the stamina drain multiplier (§7 Q1 — a drain-RATE multiplier, not a
 *     bigger pool: District drains at 1/1.25 = 0.8×, League at 1.0×.  A 25%
 *     larger pool drained at the same rate lasts 25% longer; draining 20%
 *     slower lasts 25% longer — the same time-to-empty, and the 0–100 pool,
 *     the 40/25 thresholds, the 0.88 floor, and the 1.5 vulnerability factor
 *     all stay intact.  The multipliers as named make District *easier* —
 *     the rookie rung is gentler — not a typo for the reverse);
 *   • the race economy as written in code (ECON-1): the completion purse by
 *     team size, the victory bonus, the league points, and the rule that
 *     racing pays no fame per race — fame arrives only through the ECON-2
 *     milestone prizes (`racingLeague.ts`), never from a finish itself.
 *
 * What does NOT live here:
 *   • the pools themselves — `ROOKIE_POOL` / `LEAGUE_POOL` stay in
 *     `raceCompetitors.ts` (its own comment: "1E's raceTiers.ts owns the full
 *     tier config; this is only the pool key").  The `pool` field below names
 *     which pool a rung draws from, it does not hold the rivals;
 *   • the settlement — `raceRecords.ts` still carries the purse table inline
 *     until Part 3 threads the rung through settlement; this module's purse
 *     table is the named config Part 3 switches the settlement to.  The two
 *     tables hold the same numbers; a drift between them is a Part 3 defect,
 *     not a second source of truth.
 *
 * Everything here is frozen data plus one fail-closed resolver: an unknown
 * rung resolves to the District, the always-open rung, never a locked one —
 * the same rule `resolveRaceRungId` already applies.
 */
import type { ChariotTeamSize } from '../types/game';
import type { RaceRungId } from '../utils/raceCompetitors';

/** Which ladder pool a rung's field draws from. */
export type RaceTierPoolKey = 'rookie' | 'league';

/**
 * The race economy, as written in code (ECON-1, `raceRecords.ts:113-115,120`).
 * The "100/150/250" figure is the VICTORY TOTAL only (base + victory bonus);
 * the table below is the table itself — base 80/120/200 by team size, victory
 * bonus 20/30/50.  A defeat pays the base only, and only the first completed
 * race per in-game day pays at all.
 */
export interface RaceTierEconomy {
  /** Completion purse base, by team size. */
  basePurse: Readonly<Record<ChariotTeamSize, number>>;
  /** Victory bonus, by team size, added to the base on a win. */
  victoryBonus: Readonly<Record<ChariotTeamSize, number>>;
  /** League points earned on a finish: 50 on a win, 15 otherwise. */
  leaguePoints: Readonly<{ win: number; other: number }>;
  /**
   * Fame paid per race: 0.  Racing pays no fame — fame arrives only through
   * the ECON-2 milestone prizes (`racingLeague.ts`).
   */
  famePerRace: 0;
}

/** The full config for one shipped rung. */
export interface RaceTierConfig {
  /** The rung id. */
  id: RaceRungId;
  /** Laps in a race on this rung. */
  laps: number;
  /** Rivals per field, excluding the player. */
  fieldSize: number;
  /** Which ladder pool the field draws from. */
  pool: RaceTierPoolKey;
  /**
   * Stamina drain multiplier applied to the 1D drain rates (1E §7 Q1).
   * District 0.8, League 1.0.  The pool stays 0–100 on both rungs.
   */
  staminaDrainMultiplier: number;
  /** The race economy for this rung (the same table on both rungs). */
  economy: RaceTierEconomy;
}

/** The race economy, shared by both rungs — one table, named once. */
const RACE_TIER_ECONOMY: RaceTierEconomy = Object.freeze({
  basePurse: Object.freeze({ 2: 80, 3: 120, 4: 200 }),
  victoryBonus: Object.freeze({ 2: 20, 3: 30, 4: 50 }),
  leaguePoints: Object.freeze({ win: 50, other: 15 }),
  famePerRace: 0 as const,
});

/**
 * The shipped tier config.  District is the rookie rung: 3 laps, 2 rivals,
 * the rookie pool, and the gentler drain.  League is the top rung: 5 laps,
 * 4 rivals, the League pool, and the full drain.
 */
export const RACE_TIERS: Readonly<Record<RaceRungId, RaceTierConfig>> = Object.freeze({
  district: Object.freeze({
    id: 'district',
    laps: 3,
    fieldSize: 2,
    pool: 'rookie',
    staminaDrainMultiplier: 0.8,
    economy: RACE_TIER_ECONOMY,
  }),
  league: Object.freeze({
    id: 'league',
    laps: 5,
    fieldSize: 4,
    pool: 'league',
    staminaDrainMultiplier: 1.0,
    economy: RACE_TIER_ECONOMY,
  }),
});

/**
 * The config for a rung.  Only 'league' is the League; anything else — an
 * unknown string, a missing prop, a stale value — fails closed to the
 * District, the always-open rung, never a locked one.
 */
export function resolveRaceTier(rung: unknown): RaceTierConfig {
  return rung === 'league' ? RACE_TIERS.league : RACE_TIERS.district;
}

/**
 * The stamina drain multiplier for a rung (1E §7 Q1, wired in Part 5).
 * District 0.8, League 1.0.  An unknown rung drains at 1.0 — the full
 * League rate, never less: the §3 drain targets were proven at 1.0×, so a
 * garbage rung cannot silently buy a gentler drain.  Note the asymmetry
 * with `resolveRaceTier`, which fails closed to the District config: the
 * tier resolver answers "which rung is this", the multiplier answers
 * "how hard does this rung drain", and the safe drain answer for an
 * unknown rung is the full rate.
 */
export function rungStaminaDrainMultiplier(rung: unknown): number {
  if (rung === 'district') return RACE_TIERS.district.staminaDrainMultiplier;
  if (rung === 'league') return RACE_TIERS.league.staminaDrainMultiplier;
  return 1;
}
