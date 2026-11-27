/**
 * East Circus opponent roster.
 *
 * One opponent is selected per event from the player's validated career wins.
 * Keeping a single rival chariot in the scene preserves the established mobile
 * draw-call budget while victories progressively introduce faster factions.
 */
import type { ChariotFinishKey } from '../data/chariotParts';
import { RACE_TIERS } from '../data/raceTiers';

export interface RaceCompetitor {
  readonly id: string;
  readonly name: string;
  readonly faction: string;
  readonly lapDurationMs: number;
  readonly startSide: -1 | 1;
  readonly finish: ChariotFinishKey;
}

export const RACE_COMPETITORS: readonly RaceCompetitor[] = Object.freeze([
  Object.freeze({
    id: 'russata_rookie',
    name: 'Rufus of the Russata',
    faction: 'Russata · Red',
    lapDurationMs: 64_000,
    startSide: 1 as const,
    finish: 'oxblood' as const,
  }),
  Object.freeze({
    id: 'veneta_veteran',
    name: 'Diodorus of the Veneta',
    faction: 'Veneta · Blue',
    lapDurationMs: 61_000,
    startSide: -1 as const,
    finish: 'ventive' as const,
  }),
  Object.freeze({
    id: 'albata_champion',
    name: 'Aulus of the Albata',
    faction: 'Albata · White',
    lapDurationMs: 58_000,
    startSide: 1 as const,
    finish: 'triumph' as const,
  }),
]);

/** Wins unlock the next rival; losses and photo finishes keep the current tier. */
export function resolveRaceCompetitor(wins: unknown): RaceCompetitor {
  const validWins = Number.isSafeInteger(wins) && (wins as number) >= 0 ? wins as number : 0;
  return RACE_COMPETITORS[Math.min(validWins, RACE_COMPETITORS.length - 1)];
}

// ─────────────────────────────────────────────────────────────────────────────
// LADDER-1A — the ladder pools (District + League fields).
//
// RACE_COMPETITORS above is the shipped 1v1 ladder: selection by career wins,
// pinned exactly by raceCompetitors.test.ts. It is NOT extended here —
// appending a rival would change which rival a high-win player faces in the
// shipped 1v1 race. The pools below are the ladder FIELDS instead: District
// draws 2 rookies, League draws 4. The shipped three are reused by reference
// (RACE_COMPETITORS[0] is the rookie, [1] the veteran, [2] the champion —
// that order is pinned), so no rival exists twice, and the new entries follow
// the same shape: a faction-colored name, a lap time on the shipped 64/61/58s
// scale (3s a tier), a startSide lane, and a chariot finish.
//
// Pool speed invariant: every League lap time is faster than every rookie lap
// time (League 58–62s, rookies 64–67s), so the rungs never overlap in speed.
// Pools are ordered fastest first; the field draw takes the first N, so a
// District field is the two quickest rookies and a League field the four
// quickest of its pool. Real draw/selection is 1E's race card, not this slice.
// ─────────────────────────────────────────────────────────────────────────────

/** A rookie's plain chariot: no fancy finish, just wood and wear. */
const SERVIUS_VENETA_ROOKIE: RaceCompetitor = Object.freeze({
  id: 'servius_veneta_rookie',
  name: 'Servius of the Veneta',
  faction: 'Veneta · Blue',
  lapDurationMs: 66_000,
  startSide: 1 as const,
  finish: 'charred' as const,
});

/**
 * The backmarker, 3s behind Rufus on the shipped 3s-a-tier scale — and the
 * first Green on the roster. Prasina is already a racing faction in the
 * glossary ("The Greens, a racing faction"); it simply had no auriga until now.
 */
const MANIUS_PRASINA_ROOKIE: RaceCompetitor = Object.freeze({
  id: 'manius_prasina_rookie',
  name: 'Manius of the Prasina',
  faction: 'Prasina · Green',
  lapDurationMs: 67_000,
  startSide: -1 as const,
  finish: 'stock' as const,
});

/** Second Russata: the stable now has two aurigae (Rufus + Tiberius). */
const TIBERIUS_RUSSATA: RaceCompetitor = Object.freeze({
  id: 'tiberius_russata',
  name: 'Tiberius of the Russata',
  faction: 'Russata · Red',
  lapDurationMs: 60_000,
  startSide: -1 as const,
  finish: 'gilded' as const,
});

/**
 * Second Albata, in the same triumph livery as Aulus — same stable, same
 * finish family, 1s behind the champion.
 */
const APPIUS_ALBATA: RaceCompetitor = Object.freeze({
  id: 'appius_albata',
  name: 'Appius of the Albata',
  faction: 'Albata · White',
  lapDurationMs: 59_000,
  startSide: 1 as const,
  finish: 'triumph' as const,
});

/** Second Prasina, and the slowest of the League pool — still 2s faster than the quickest rookie. */
const SPURIUS_PRASINA: RaceCompetitor = Object.freeze({
  id: 'spurius_prasina',
  name: 'Spurius of the Prasina',
  faction: 'Prasina · Green',
  lapDurationMs: 62_000,
  startSide: -1 as const,
  finish: 'charred' as const,
});

/** The two ladder rungs. 1E's raceTiers.ts owns the full tier config; this is only the pool key. */
export type RaceRungId = 'district' | 'league';

/**
 * LADDER-1B — normalize a rung id. Only 'league' is the League; anything
 * else — an unknown string, a missing prop, a stale value — fails closed to
 * the District, the always-open rung, never a locked one. resolveRungField
 * below is the single consumer of this rule for the field itself.
 */
export function resolveRaceRungId(rung: unknown): RaceRungId {
  return rung === 'league' ? 'league' : 'district';
}

/**
 * Rivals per field, excluding the player: District is player + 2, League
 * player + 4.  LADDER-1E — read from `raceTiers.ts`, the tier config's source
 * of truth; the numbers are unchanged, only the owner moved.
 */
export const RUNG_FIELD_SIZE: Readonly<Record<RaceRungId, number>> = {
  district: RACE_TIERS.district.fieldSize,
  league: RACE_TIERS.league.fieldSize,
} as const;

/** District draws rookies only, fastest first. */
export const ROOKIE_POOL: readonly RaceCompetitor[] = Object.freeze([
  RACE_COMPETITORS[0],
  SERVIUS_VENETA_ROOKIE,
  MANIUS_PRASINA_ROOKIE,
]);

/** League draws its pool, fastest first. */
export const LEAGUE_POOL: readonly RaceCompetitor[] = Object.freeze([
  RACE_COMPETITORS[2],
  APPIUS_ALBATA,
  TIBERIUS_RUSSATA,
  RACE_COMPETITORS[1],
  SPURIUS_PRASINA,
]);

/**
 * The rivals for a rung's field, deterministically the fastest N of the rung's
 * pool. An unknown rung fails closed to the District field — the always-open
 * rung, never a locked one.
 */
export function resolveRungField(rung: unknown): readonly RaceCompetitor[] {
  const rungId = resolveRaceRungId(rung);
  const pool = rungId === 'league' ? LEAGUE_POOL : ROOKIE_POOL;
  const count = RUNG_FIELD_SIZE[rungId];
  return pool.slice(0, count);
}

// ─────────────────────────────────────────────────────────────────────────────
// LADDER-1B2 — driver profiles (challenge §2B, brief §3).
//
// A lap time is not a driver: `RaceCompetitor` carries only id / name /
// faction / lapDurationMs / startSide / finish. 1B2 authors the profile here,
// derived where a number exists and assigned where the design gives a rule —
// and says which is which, so nothing looks sourced that isn't.
//
// DERIVED — `paceCapFactor`: the rival's mean speed (route length over its
// lap time) relative to the fastest rival (Aulus, 58 s = 1.00). The route
// length cancels, so the factor is 58 / lapSeconds — the test asserts the
// derivation from `lapDurationMs`, never a hand-typed number. A lap-time
// change re-derives it. The factor is a TARGET-speed cap for the driver
// (mean speed, far below the movement cap of 13 u/s); it is never a
// rubber-band — the driver never exceeds it to catch up, except for
// Fortuna's Hand (LADDER-1E, `fortunasHand.ts`), the SINGLE disclosed
// exception: a bounded ±4%/±2% adjustment of a RIVAL's pace cap by
// position relative to the player, off on the final lap, printed on the
// results screen.
//
// ASSIGNED — `metaSkill`, `aggression`, `staminaStyle`: the brief's §3 table
// (rookies wide lines, low aggression; Greens tight; League tighter and
// hotter than rookies). `staminaStyle` is stored now and NOT consumed until
// 1D. Pool speed invariant (1A) still holds in profile terms: every League
// factor exceeds every rookie factor, so the rungs never overlap in speed.
// ─────────────────────────────────────────────────────────────────────────────

export type RivalStaminaStyle = 'closer' | 'metronome' | 'frontrunner';

export interface RivalDriverProfile {
  /** The competitor this profile drives. */
  competitorId: string;
  /** Target-speed cap as a factor of the fastest rival's mean speed (Aulus = 1.00). Derived. */
  paceCapFactor: number;
  /** 0 = the wide safe line around a meta, 1 = the tight inside line. Assigned. */
  metaSkill: number;
  /** 0 = never defends, 1 = always. A rival defends at or above 0.60. Assigned. */
  aggression: number;
  /** Stored now, consumed by 1D (stamina). Assigned. */
  staminaStyle: RivalStaminaStyle;
}

/** The brief's §3 table — the ASSIGNED half of each profile, keyed by rival id. */
const RIVAL_DRIVER_ASSIGNED: Readonly<Record<string, {
  metaSkill: number;
  aggression: number;
  staminaStyle: RivalStaminaStyle;
}>> = Object.freeze({
  albata_champion: { metaSkill: 0.8, aggression: 0.7, staminaStyle: 'closer' },
  appius_albata: { metaSkill: 0.7, aggression: 0.6, staminaStyle: 'metronome' },
  tiberius_russata: { metaSkill: 0.65, aggression: 0.65, staminaStyle: 'frontrunner' },
  veneta_veteran: { metaSkill: 0.6, aggression: 0.55, staminaStyle: 'metronome' },
  spurius_prasina: { metaSkill: 0.75, aggression: 0.5, staminaStyle: 'closer' },
  russata_rookie: { metaSkill: 0.35, aggression: 0.35, staminaStyle: 'metronome' },
  servius_veneta_rookie: { metaSkill: 0.3, aggression: 0.3, staminaStyle: 'metronome' },
  manius_prasina_rookie: { metaSkill: 0.45, aggression: 0.3, staminaStyle: 'metronome' },
});

/** The fastest rival's lap, in seconds — the pace-cap reference (Aulus, 58 s). */
export const RIVAL_PACE_REFERENCE_LAP_SECONDS = 58;

/**
 * LADDER-1B2 — the driver profile for a competitor. The pace cap is DERIVED
 * from the shipped lap time (58 / lapSeconds); the rest is the assigned
 * §3 table. An unknown competitor fails closed to the slowest rookie
 * profile (never a League profile), so a bad id can never invent speed.
 */
export function resolveRivalDriverProfile(competitor: RaceCompetitor): RivalDriverProfile {
  const lapSeconds = Number.isFinite(competitor?.lapDurationMs) && competitor.lapDurationMs > 0
    ? competitor.lapDurationMs / 1000
    : 67;
  const assigned = RIVAL_DRIVER_ASSIGNED[competitor?.id] ?? {
    metaSkill: 0.3,
    aggression: 0.3,
    staminaStyle: 'metronome' as const,
  };
  return {
    competitorId: competitor?.id ?? 'unknown',
    paceCapFactor: RIVAL_PACE_REFERENCE_LAP_SECONDS / lapSeconds,
    metaSkill: assigned.metaSkill,
    aggression: assigned.aggression,
    staminaStyle: assigned.staminaStyle,
  };
}
