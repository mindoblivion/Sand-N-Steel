/**
 * P4 — STABLE PROGRESSION: the horse team's bought QUALITY and CONDITIONING.
 *
 * This module is the whole data model for the stables' two ladders — no screen,
 * no render, no racing behaviour.  It is the same shape as the shipped
 * `racingProgression.ts` (catalogue → resolve → eligibility → purchase) because
 * it answers the same kind of question: what does this profile own, and what may
 * it buy next?
 *
 * ── QUALITY: ONE TEAM, ONE STANDARD ───────────────────────────────────────
 * Quality is bought IN ORDER, one grade at a time, for the player's ONE team.
 * It is never "selected", never per-configuration and never per-horse: a Biga,
 * a Triga and a Quadra all race at the grade the player has bought.  Buying a
 * team (`purchaseRacingConfig`) changes nothing here, and buying a grade changes
 * nothing there — the two ladders are independent.
 *
 *   | grade | id                 | name               | price (gold) |
 *   |-------|--------------------|--------------------|--------------|
 *   | 0     | plow               | Plow Team          | 0 (default)  |
 *   | 1     | trained            | Trained Team       | 400          |
 *   | 2     | racing_bred        | Racing Bred        | 900          |
 *   | 3     | champion_bloodline | Champion Bloodline | 1,600        |
 *
 * ── CONDITIONING: A LADDER OF FIVE ────────────────────────────────────────
 * Levels 0–5, bought one level at a time.  The price of the next level is
 *
 *     price = 60 × (currentLevel + 1) × teamSize
 *
 * where `teamSize` is the horse count of the team the player has actually
 * selected — read from `resolveRacingState()` and never stored: a Triga is more
 * horses to keep fit, so its conditioning costs half again what a Biga's does,
 * and nothing in the save duplicates the size.
 *
 * ── THE DECLARED EFFECT IS DATA ONLY ──────────────────────────────────────
 * Every catalogue entry declares what it will one day change — quality declares
 * `{ pace: grade, stamina: grade }`, conditioning declares `{ stamina: level }`
 * — but NOTHING in this build reads those numbers as a live stat.  Racing Stage
 * 3 is the first slice allowed to; until then the effects are inert data, and
 * `phaseP4StableProgression.test.ts` §E pins that no production module outside
 * this file mentions them (the same sweep P3 applies to `raceEffect`).
 *
 * ── NO FACILITY GATES YET ─────────────────────────────────────────────────
 * The brief for this slice fixes eligibility as ORDER + GOLD only.  The facility
 * system (P5) will later gate Racing Bred, Champion Bloodline and conditioning
 * levels 4–5 behind their buildings; those gates are deliberately absent here, so
 * a future slice adds exactly one condition to one function.
 *
 * Shape and purity follow the house pure-transaction idiom exactly
 * (`racingProgression.ts`, `chariotLoadout.ts`, `tempering.ts`, `laurels.ts`):
 *   • no profile and no `stable` object is ever mutated in place — a success
 *     returns a NEW `PlayerProfile` for the caller to hand to the existing
 *     `saveProfile()` path;
 *   • a refusal returns `{ ok: false, reason }` and no profile at all, so a
 *     refused purchase can never reach a save writer;
 *   • eligibility is read first and the purchase re-checks it, so a stale or
 *     repeated click is refused exactly like a first one;
 *   • gold can never go negative: a price the purse cannot cover is refused
 *     before any arithmetic, and a profile with no usable gold buys nothing;
 *   • a legacy save (no `stable` field), a partial field and a malformed field
 *     all resolve to "Plow Team, conditioning 0" rather than throwing, and
 *     nothing backfills or repairs them.
 *
 * It reads no storage and no environment: there is no second currency, no second
 * storage key and no parallel save path.
 */

import { PlayerProfile, ChariotTeamSize } from '../types/game';
import { resolveRacingState } from './racingProgression';

/**
 * What a stable upgrade is DECLARED to change.  DATA ONLY: no production code
 * reads these numbers as a live stat until racing Stage 3.
 */
export interface StableDeclaredEffect {
  pace?: number;
  stamina?: number;
}

/** The catalogue ids. */
export type StableQualityId = 'plow' | 'trained' | 'racing_bred' | 'champion_bloodline';

export interface StableQuality {
  /** The ladder position, 0–3.  Stored verbatim in `stable.quality`. */
  grade: number;
  id: StableQualityId;
  name: string;
  /** Gold price.  Grade 0 is 0 — it is the default and is never bought. */
  price: number;
  /** The grade that must be owned before this one can be bought. */
  requires?: number;
  /** Declared by every grade.  Inert data — see `StableDeclaredEffect`. */
  effect: StableDeclaredEffect;
}

/**
 * The catalogue, in progression order.  400 / 900 / 1,600 are the prices from
 * the brief and are the single source of truth for the tests and any future
 * screen.  "One team, one standard": there is no per-team or per-configuration
 * variant of a grade.
 */
export const STABLE_QUALITIES: StableQuality[] = [
  { grade: 0, id: 'plow', name: 'Plow Team', price: 0, effect: { pace: 0, stamina: 0 } },
  {
    grade: 1,
    id: 'trained',
    name: 'Trained Team',
    price: 400,
    requires: 0,
    effect: { pace: 1, stamina: 1 },
  },
  {
    grade: 2,
    id: 'racing_bred',
    name: 'Racing Bred',
    price: 900,
    requires: 1,
    effect: { pace: 2, stamina: 2 },
  },
  {
    grade: 3,
    id: 'champion_bloodline',
    name: 'Champion Bloodline',
    price: 1600,
    requires: 2,
    effect: { pace: 3, stamina: 3 },
  },
];

/** The grade every profile starts at — the Plow Team, free and never bought. */
export const PLOW_GRADE = 0;

/** The top of the quality ladder; there is nothing above Champion Bloodline. */
export const MAX_STABLE_QUALITY = 3;

/** The top of the conditioning ladder. */
export const MAX_CONDITIONING = 5;

/** The conditioning price step: `60 × (currentLevel + 1) × teamSize` gold. */
export const CONDITIONING_STEP = 60;

const QUALITY_BY_GRADE: ReadonlyMap<number, StableQuality> = new Map(
  STABLE_QUALITIES.map((quality) => [quality.grade, quality])
);
const QUALITY_BY_ID: ReadonlyMap<StableQualityId, StableQuality> = new Map(
  STABLE_QUALITIES.map((quality) => [quality.id, quality])
);

/**
 * Look a grade up by number (0–3) or by name (`plow` | `trained` | `racing_bred`
 * | `champion_bloodline`).  Anything else — a string number, a fraction, an
 * unknown grade, `null` — resolves to `undefined`, which every caller turns into
 * a refusal rather than a guess.
 */
export function getStableQuality(ref: unknown): StableQuality | undefined {
  if (typeof ref === 'number') return QUALITY_BY_GRADE.get(ref);
  if (typeof ref === 'string') return QUALITY_BY_ID.get(ref as StableQualityId);
  return undefined;
}

/**
 * What the stable's conditioning at `level` is DECLARED to change:
 * `{ stamina: level }`.  DATA ONLY — nothing consumes it as a live stat until
 * racing Stage 3.
 */
export function declaredConditioningEffect(level: number): StableDeclaredEffect {
  return { stamina: level };
}

/** What this profile's stable is: the bought grade and the conditioning level. */
export interface StableState {
  /** 0–3.  0 is the free Plow Team. */
  quality: number;
  /** 0–5. */
  conditioning: number;
}

/** Plow Team, conditioning 0 — every profile's starting state. */
export function defaultStableState(): StableState {
  return { quality: PLOW_GRADE, conditioning: 0 };
}

/** The stored field, or `undefined` when it is absent or not a plain object. */
function storedStable(
  profile: PlayerProfile | null | undefined
): { quality?: unknown; conditioning?: unknown } | undefined {
  const stored = profile?.stable;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return undefined;
  return stored as { quality?: unknown; conditioning?: unknown };
}

/**
 * One rung of one ladder, or 0 when the stored value is not one.
 *
 * Malformed means anything that is not an integer in `0..max`: a string number,
 * a fraction, `true`, a negative number and a value past the top of the ladder —
 * a hand-edited save must never yield a grade the catalogue does not sell.  The
 * two fields resolve independently, so a save whose `conditioning` is junk still
 * keeps the grade it earned.
 */
function rungWithin(value: unknown, max: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max
    ? value
    : 0;
}

/**
 * Resolve the player's stable progression.
 *
 * Total and never throwing:
 *   • no `stable` field (every save written before this slice) → Plow Team,
 *     conditioning 0;
 *   • a `stable` that is `null`, an array or not an object → the same defaults;
 *   • a malformed `quality` or `conditioning` → that field alone resolves to 0;
 *   • nothing is written back — the resolved object is fresh and detached from
 *     the save, so a caller can never mutate the stored record through it.
 */
export function resolveStableState(profile: PlayerProfile | null | undefined): StableState {
  const stored = storedStable(profile);
  return {
    quality: rungWithin(stored?.quality, MAX_STABLE_QUALITY),
    conditioning: rungWithin(stored?.conditioning, MAX_CONDITIONING),
  };
}

/**
 * The horse count of the team the player has selected — 2, 3 or 4.
 *
 * Read from `resolveRacingState()` every time and never stored on `stable`: the
 * team size is the racing module's fact, and duplicating it here could only ever
 * disagree with it after a team purchase.
 */
export function stableTeamSize(profile: PlayerProfile | null | undefined): ChariotTeamSize {
  return resolveRacingState(profile).horses;
}

/**
 * The gold price of the conditioning level ABOVE `currentLevel`, for a team of
 * `teamSize` horses: `60 × (currentLevel + 1) × teamSize`.
 *
 *   0 → 1 on a Biga (2):    60 × 1 × 2 =   120
 *   0 → 1 on a Triga (3):   60 × 1 × 3 =   180
 *   0 → 1 on a Quadra (4):  60 × 1 × 4 =   240
 *   4 → 5 on a Quadra (4):  60 × 5 × 4 = 1,200
 */
export function conditioningCost(currentLevel: number, teamSize: number): number {
  return CONDITIONING_STEP * (currentLevel + 1) * teamSize;
}

/**
 * What the next conditioning level costs THIS profile, for display.  It is the
 * same number the purchase charges; at level 5 nothing is on sale and the
 * purchase refuses with `max-level`.
 */
export function nextConditioningCost(profile: PlayerProfile | null | undefined): number {
  const state = resolveStableState(profile);
  return conditioningCost(state.conditioning, stableTeamSize(profile));
}

/** Why a purchase was refused.  `ok: true` never carries a reason. */
export type StableRejectionReason =
  | 'no-profile'
  | 'unknown-quality'
  | 'unknown-level'
  | 'already-owned'
  | 'prerequisite-locked'
  | 'max-level'
  | 'insufficient-gold';

export type StableResult =
  | { ok: true; profile: PlayerProfile }
  | { ok: false; reason: StableRejectionReason };

/**
 * A profile whose gold is missing or not a finite number can afford nothing —
 * treating it as "not enough gold" keeps a malformed save from producing a NaN
 * balance by subtraction.
 */
function canAfford(profile: PlayerProfile, price: number): boolean {
  return typeof profile.gold === 'number' && Number.isFinite(profile.gold) && profile.gold >= price;
}

/**
 * Can the player buy this quality grade right now?  A surface uses it to state
 * the reason on the card; the purchase re-checks the same rules.
 *
 * Eligibility is ORDER + GOLD only — the facility gates that will later hold
 * Racing Bred and Champion Bloodline back are P5's, not this slice's.
 */
export function getStableQualityEligibility(
  profile: PlayerProfile | null | undefined,
  ref: unknown
): { ok: true } | { ok: false; reason: StableRejectionReason } {
  if (!profile) return { ok: false, reason: 'no-profile' };

  const quality = getStableQuality(ref);
  if (!quality) return { ok: false, reason: 'unknown-quality' };

  const state = resolveStableState(profile);
  if (state.quality >= MAX_STABLE_QUALITY) return { ok: false, reason: 'max-level' };

  if (quality.grade <= state.quality) return { ok: false, reason: 'already-owned' };
  if (quality.requires !== undefined && quality.requires > state.quality) {
    return { ok: false, reason: 'prerequisite-locked' };
  }

  if (!canAfford(profile, quality.price)) return { ok: false, reason: 'insufficient-gold' };

  return { ok: true };
}

/**
 * Buy the next quality grade for the player's one team.
 *
 * Deducts exactly `price` once and records the grade; it never touches the
 * racing state, the selected team or any racing price.  Refuses, leaving the
 * caller's profile untouched, when there is no profile, the grade is unknown, the
 * ladder is already at Champion Bloodline, the grade is already owned (a repeat or
 * stale click is never charged twice), a grade is being skipped, or gold is short.
 */
export function purchaseStableQuality(
  profile: PlayerProfile | null | undefined,
  ref: unknown
): StableResult {
  const eligibility = getStableQualityEligibility(profile, ref);
  if (!eligibility.ok) return eligibility;
  if (!profile) return { ok: false, reason: 'no-profile' };

  const quality = getStableQuality(ref)!;
  const state = resolveStableState(profile);

  return {
    ok: true,
    profile: {
      ...profile,
      gold: profile.gold - quality.price,
      stable: { quality: quality.grade, conditioning: state.conditioning },
    },
  };
}

/**
 * Can the player buy this conditioning level right now?  `ref` is the level
 * being bought (1–5), and only the level directly above the current one is ever
 * on offer.  ORDER + GOLD only; the L4–L5 facility gate is P5's.
 */
export function getStableConditioningEligibility(
  profile: PlayerProfile | null | undefined,
  ref: unknown
): { ok: true } | { ok: false; reason: StableRejectionReason } {
  if (!profile) return { ok: false, reason: 'no-profile' };

  if (typeof ref !== 'number' || !Number.isInteger(ref) || ref < 1 || ref > MAX_CONDITIONING) {
    return { ok: false, reason: 'unknown-level' };
  }

  const state = resolveStableState(profile);
  if (state.conditioning >= MAX_CONDITIONING) return { ok: false, reason: 'max-level' };
  if (ref <= state.conditioning) return { ok: false, reason: 'already-owned' };
  if (ref > state.conditioning + 1) return { ok: false, reason: 'prerequisite-locked' };

  const price = conditioningCost(state.conditioning, stableTeamSize(profile));
  if (!canAfford(profile, price)) return { ok: false, reason: 'insufficient-gold' };

  return { ok: true };
}

/**
 * Buy the next conditioning level for the player's team.
 *
 * Charges `60 × (currentLevel + 1) × teamSize`, where the team size is read from
 * the profile's own racing state at the moment of purchase.  Refuses, leaving the
 * caller's profile untouched, when there is no profile, the level is not 1–5, the
 * ladder is already at 5, the level is already owned, a level is being skipped, or
 * gold is short.
 */
export function purchaseStableConditioning(
  profile: PlayerProfile | null | undefined,
  ref: unknown
): StableResult {
  const eligibility = getStableConditioningEligibility(profile, ref);
  if (!eligibility.ok) return eligibility;
  if (!profile) return { ok: false, reason: 'no-profile' };

  const level = ref as number;
  const state = resolveStableState(profile);
  const price = conditioningCost(state.conditioning, stableTeamSize(profile));

  return {
    ok: true,
    profile: {
      ...profile,
      gold: profile.gold - price,
      stable: { quality: state.quality, conditioning: level },
    },
  };
}

/** A short, player-facing explanation of a refusal. */
export function describeStableRejection(reason: StableRejectionReason): string {
  switch (reason) {
    case 'no-profile':
      return 'No gladiator profile loaded.';
    case 'unknown-quality':
      return 'The stables never bred such a team.';
    case 'unknown-level':
      return 'That is not a conditioning level the trainers sell.';
    case 'already-owned':
      return 'Already yours.';
    case 'prerequisite-locked':
      return 'Buy the grade below it first.';
    case 'max-level':
      return 'Your stable is already at its best.';
    case 'insufficient-gold':
      return 'Not enough gold.';
  }
}
