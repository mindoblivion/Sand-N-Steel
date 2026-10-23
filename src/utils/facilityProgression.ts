/**
 * P5 — FACILITY PROGRESSION: the ludus's three buildings and the gates they hold.
 *
 * This module is the whole data model for the facilities — no screen, no render.
 * It follows the same pure-transaction shape as `stableProgression.ts`,
 * `racingProgression.ts` and `tempering.ts`: catalogue → resolve → eligibility →
 * purchase, with no mutation and no refusal that carries a profile.
 *
 * ── THE THREE BUILDINGS, TWO LEVELS EACH ──────────────────────────────────
 *
 *   | id       | name                | L1                      | L2                        |
 *   |----------|---------------------|-------------------------|---------------------------|
 *   | stable   | Imperial Stable     | Stone Stalls — 500 g    | Stud & Training Paddock — 1,200 g |
 *   | yard     | Ludus Training Yard | Doctore's Yard — 500 g  | Master's Ludus — 1,200 g  |
 *   | workshop | Smithing Workshop   | Master's Forge — 600 g  | Imperial Armoury — 1,400 g |
 *
 * Levels are bought IN ORDER — only the level directly above the one owned is
 * ever on offer, so a skipped level is not a rule to check but a level that does
 * not exist to buy.
 *
 * ── WHAT EACH BUILDING GATES ──────────────────────────────────────────────
 * The gates are read-time facts; nothing in the save records them.
 *
 *   • workshop L1 — the second temper level; L2 — the third and last.
 *   • stable L1 — Racing Bred (quality grade 2); L2 — Champion Bloodline
 *     (grade 3) AND conditioning levels 4 and 5, which both need the paddock.
 *   • yard — the stat-training PRICE itself: 25 / 22 / 20 gold per character
 *     level at yard 0 / 1 / 2 (`trainingCost`), never any other gold sink.
 *   • workshop L2 — the two champion Gilded rows (`chest_champion_gilded`,
 *     `helm_champion_gilded`) are withheld from shop stock
 *     (`getVisibleStorefrontStock`) and refused at purchase
 *     (`getItemPurchaseEligibility`).
 *
 * ── PRICES ────────────────────────────────────────────────────────────────
 * The design's ladder: the stable and the yard 500 / 1,200, the workshop
 * 600 / 1,400 — 5,400 gold to build the whole ludus.  Every consumer reads
 * these constants rather than duplicating a price.  Change them here, nowhere
 * else.
 *
 * A legacy save (no `facilities` field), a partial field and a malformed one all
 * resolve to level 0 for each building rather than throwing, and nothing
 * backfills or repairs them.  `createNewProfile()` never writes the field.
 */

import { PlayerProfile } from '../types/game';

/** The buildings. */
export type FacilityId = 'stable' | 'yard' | 'workshop';

/** The highest level a building can reach. */
export const MAX_FACILITY_LEVEL = 2;

export interface FacilityLevel {
  /** 1 or 2 — the rung being bought. */
  level: number;
  name: string;
  /** Gold price. */
  price: number;
}

export interface Facility {
  id: FacilityId;
  name: string;
  levels: FacilityLevel[];
}

/**
 * The catalogue, in progression order.  Prices and names are the single source
 * of truth for the tests and any future screen.
 */
export const FACILITIES: Facility[] = [
  {
    id: 'stable',
    name: 'Imperial Stable',
    levels: [
      { level: 1, name: 'Stone Stalls', price: 500 },
      { level: 2, name: 'Stud & Training Paddock', price: 1200 },
    ],
  },
  {
    id: 'yard',
    name: 'Ludus Training Yard',
    levels: [
      { level: 1, name: "Doctore's Yard", price: 500 },
      { level: 2, name: "Master's Ludus", price: 1200 },
    ],
  },
  {
    id: 'workshop',
    name: 'Smithing Workshop',
    levels: [
      { level: 1, name: "Master's Forge", price: 600 },
      { level: 2, name: 'Imperial Armoury', price: 1400 },
    ],
  },
];

const FACILITY_BY_ID: ReadonlyMap<FacilityId, Facility> = new Map(
  FACILITIES.map((facility) => [facility.id, facility])
);

/** The built level of each building.  0 means "not built". */
export interface FacilitiesState {
  stable: number;
  yard: number;
  workshop: number;
}

/** Nothing built — every profile's starting state. */
export function defaultFacilitiesState(): FacilitiesState {
  return { stable: 0, yard: 0, workshop: 0 };
}

/** The stored field, or `undefined` when it is absent or not a plain object. */
function storedFacilities(
  profile: PlayerProfile | null | undefined
): Partial<Record<FacilityId, unknown>> | undefined {
  const stored = profile?.facilities;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return undefined;
  return stored as Partial<Record<FacilityId, unknown>>;
}

/** A level is a whole number in `0 … MAX_FACILITY_LEVEL`; anything else is 0. */
function rungWithin(value: unknown): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_FACILITY_LEVEL
    ? value
    : 0;
}

/**
 * Resolve the player's three buildings.
 *
 * Total and never throwing: a missing `facilities` field (every earlier save),
 * a null/array/non-object field, or a malformed rung each resolve to 0 for that
 * building alone.  The returned object is fresh and detached from the save.
 */
export function resolveFacilities(profile: PlayerProfile | null | undefined): FacilitiesState {
  const stored = storedFacilities(profile);
  return {
    stable: rungWithin(stored?.stable),
    yard: rungWithin(stored?.yard),
    workshop: rungWithin(stored?.workshop),
  };
}

/** The built level of one building, 0–2.  An unknown id resolves to 0. */
export function getFacilityLevel(
  profile: PlayerProfile | null | undefined,
  id: unknown
): number {
  if (id !== 'stable' && id !== 'yard' && id !== 'workshop') return 0;
  return resolveFacilities(profile)[id];
}

/** Whether a building is built to at least `level`. */
export function hasFacilityLevel(
  profile: PlayerProfile | null | undefined,
  id: unknown,
  level: number
): boolean {
  return getFacilityLevel(profile, id) >= level;
}

/** The level of `id` that is next on sale (1 or 2), or `undefined` at the cap. */
export function nextFacilityLevel(
  profile: PlayerProfile | null | undefined,
  id: unknown
): FacilityLevel | undefined {
  if (id !== 'stable' && id !== 'yard' && id !== 'workshop') return undefined;
  const facility = FACILITY_BY_ID.get(id);
  const level = getFacilityLevel(profile, id);
  if (level >= MAX_FACILITY_LEVEL || !facility) return undefined;
  return facility.levels[level];
}

/** What the next level of `id` costs THIS profile, for display; 0 at the cap. */
export function nextFacilityCost(
  profile: PlayerProfile | null | undefined,
  id: unknown
): number {
  return nextFacilityLevel(profile, id)?.price ?? 0;
}

/** Why a facility purchase was refused.  `ok: true` never carries a reason. */
export type FacilityRejectionReason =
  | 'no-profile'
  | 'unknown-facility'
  | 'max-level'
  | 'insufficient-gold';

export type FacilityResult =
  | { ok: true; profile: PlayerProfile }
  | { ok: false; reason: FacilityRejectionReason };

/** A profile whose gold is missing or not finite can afford nothing. */
function canAfford(profile: PlayerProfile, price: number): boolean {
  return typeof profile.gold === 'number' && Number.isFinite(profile.gold) && profile.gold >= price;
}

/**
 * Can the player buy the next level of this building right now?  ORDER + GOLD
 * only: only the rung above the built one is ever on offer.
 */
export function getFacilityUpgradeEligibility(
  profile: PlayerProfile | null | undefined,
  id: unknown
): { ok: true } | { ok: false; reason: FacilityRejectionReason } {
  if (!profile) return { ok: false, reason: 'no-profile' };
  if (id !== 'stable' && id !== 'yard' && id !== 'workshop') {
    return { ok: false, reason: 'unknown-facility' };
  }
  const level = getFacilityLevel(profile, id);
  if (level >= MAX_FACILITY_LEVEL) return { ok: false, reason: 'max-level' };
  if (!canAfford(profile, nextFacilityCost(profile, id))) {
    return { ok: false, reason: 'insufficient-gold' };
  }
  return { ok: true };
}

/**
 * Build the next level of a facility.
 *
 * Deducts exactly the rung's price once, records the new level and leaves the
 * other two buildings where they were.  A refusal returns no profile at all, so
 * a stale click can never charge twice or move gold.
 */
export function purchaseFacility(
  profile: PlayerProfile | null | undefined,
  id: unknown
): FacilityResult {
  const eligibility = getFacilityUpgradeEligibility(profile, id);
  if (!eligibility.ok) return eligibility;
  if (!profile) return { ok: false, reason: 'no-profile' };

  const level = getFacilityLevel(profile, id);
  const price = nextFacilityCost(profile, id);

  return {
    ok: true,
    profile: {
      ...profile,
      gold: profile.gold - price,
      facilities: { ...resolveFacilities(profile), [id as FacilityId]: level + 1 },
    },
  };
}

/** A short, player-facing explanation of a refusal. */
export function describeFacilityRejection(reason: FacilityRejectionReason): string {
  switch (reason) {
    case 'no-profile':
      return 'No ludus to build in.';
    case 'unknown-facility':
      return 'No such building stands here.';
    case 'max-level':
      return 'This building is already at its best.';
    case 'insufficient-gold':
      return 'Not enough gold.';
  }
}

/* ---------------------------------------------------------------------------
 * The gates the buildings hold
 * ------------------------------------------------------------------------- */

/**
 * The workshop level a temper rung requires: level 2 needs L1, level 3 needs L2,
 * level 1 is open to everyone.  Anything outside 1–3 requires nothing.
 */
export function requiredWorkshopForTemper(level: number): number {
  if (level === 2) return 1;
  if (level === 3) return 2;
  return 0;
}

/** The Imperial Stable level a quality grade requires: grade 2 → L1, grade 3 → L2. */
export function requiredStableForQuality(grade: number): number {
  if (grade === 2) return 1;
  if (grade === 3) return 2;
  return 0;
}

/**
 * The Imperial Stable level a conditioning level requires: BOTH level 4 and
 * level 5 need the stud paddock (L2); levels 1–3 are open to every ludus.
 */
export function requiredStableForConditioning(level: number): number {
  if (level === 4 || level === 5) return 2;
  return 0;
}

/** The workshop level that works gold onto a champion's plate. */
export const GILDED_ARMOUR_WORKSHOP_LEVEL = 2;

/**
 * The two §3.1 Gilded rows only the Master Forge sells — an explicit id list,
 * not a naming convention.  `arms_galerus_gilded` and `legs_greaves_gilded` are
 * deliberately absent: they are in stock and purchasable at every level.
 */
export const GILDED_FORGE_ITEM_IDS: readonly string[] = [
  'chest_champion_gilded',
  'helm_champion_gilded',
];

/** Whether this item id waits for the Smithing Workshop's L2 forge. */
export function requiresMasterForge(itemId: unknown): boolean {
  return typeof itemId === 'string' && GILDED_FORGE_ITEM_IDS.includes(itemId);
}

/**
 * Whether the Smithing Workshop is high enough for the gated armour to appear in
 * a shop's stock.
 */
export function gildedUnlocked(profile: PlayerProfile | null | undefined): boolean {
  return hasFacilityLevel(profile, 'workshop', GILDED_ARMOUR_WORKSHOP_LEVEL);
}

/**
 * Whether this item may be OFFERED and BOUGHT at the profile's workshop level:
 * everything that is not on the Master Forge's list is open at level 0.
 */
export function isItemUnlocked(
  profile: PlayerProfile | null | undefined,
  itemId: unknown
): boolean {
  return !requiresMasterForge(itemId) || gildedUnlocked(profile);
}

/** Stat training's price per character level by yard level: 25 / 22 / 20 gold. */
export const TRAINING_BASE_BY_YARD: readonly number[] = [25, 22, 20];

/** The per-level stat-training price this profile's yard sets (25, 22 or 20). */
export function trainingBaseCost(profile: PlayerProfile | null | undefined): number {
  return TRAINING_BASE_BY_YARD[getFacilityLevel(profile, 'yard')] ?? TRAINING_BASE_BY_YARD[0];
}

/**
 * What one stat training costs this profile: the yard's flat per-level base
 * times the character's level — 25 / 22 / 20 at level 1, 100 / 88 / 80 at 4.
 *
 * This is the ONLY place the yard's price is applied — every other gold sink
 * keeps its own price untouched.
 */
export function trainingCost(profile: PlayerProfile | null | undefined): number {
  const level = profile?.level;
  const rung =
    typeof level === 'number' && Number.isFinite(level) && level >= 1 ? Math.floor(level) : 1;
  return trainingBaseCost(profile) * rung;
}
