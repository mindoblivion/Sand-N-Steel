/**
 * ===========================================================================
 * CH-5 — THE PALMAE'S OWN WRITERS (equip, earn, buy)
 * ===========================================================================
 * `profile.palmae` has exactly three writers in the game, and they all live in
 * this module:
 *
 *   • `equipPalma` / `unequipPalma` — the StatsTab panel's tap, validated here;
 *   • `applyPalmaEarns`            — the victory write's earn checks;
 *   • `purchaseDoctorePalma`       — the Doctore's two sold palms.
 *
 * The DIRECTOR RULING on slot math (settled; the design text deliberates
 * inline): equipped-palmae slots = min(3, max(0, currentTier - 1)).  Tier 1 → 0
 * slots, Tier 2 → 1, Tier 3 → 2, Tier 4 → 3.  CH-1's `MAX_EQUIPPED_PALMAE` of 3
 * stays the absolute ceiling the resolver enforces; the tier cap is applied on
 * top of it here, at write time.
 *
 * Every read goes through `resolvePalmae`, so an unknown id, a boss-only row or
 * a duplicate in a hand-edited save is dropped before anything is written.  Every
 * function is pure: nothing is mutated in place, no storage is read, no clock and
 * no randomness are consulted, and a refusal carries NO profile at all — so a
 * stale click can never charge twice or wear a palm the player has not earned.
 *
 * The ids this module names are the deed definitions themselves (a deed has to
 * say WHICH palma it grants); every player-facing string, price and effect is
 * read from `data/palmae.ts`, never restated here.
 */

import type { PalmaeState, PlayerProfile } from '../types/game';
import { ALL_OPPONENTS } from '../data/opponents';
import { PALMAE_PLAYER_POOL, getPalma, type Palma } from '../data/palmae';
import { MAX_EQUIPPED_PALMAE, resolvePalmae } from './traitModifiers';
import { deriveRank, rankAtLeast, type GladiatorRank, type RankInput } from './rank';

// ── §1 the slot ladder ─────────────────────────────────────────────────────

/** The absolute ceiling — CH-1's resolver cap, which no tier may exceed. */
export const PALMA_SLOT_CEILING = MAX_EQUIPPED_PALMAE;

/**
 * How many palms a gladiator of this tier may wear.
 *
 * `min(3, max(0, tier - 1))`: Tier 1 wears none (he has not won the crowd yet),
 * and the fourth tier — where a Tier-1 boss has long since fallen — wears all
 * three.  A missing, non-finite or fractional tier reads as its whole part, and
 * anything below Tier 1 reads as none rather than as a negative count.
 */
export function palmaSlotsForTier(currentTier: unknown): number {
  const tier =
    typeof currentTier === 'number' && Number.isFinite(currentTier) ? Math.floor(currentTier) : 0;
  return Math.max(0, Math.min(PALMA_SLOT_CEILING, tier - 1));
}

/**
 * The tier that OPENs a slot (0-based slot index), for the greyed row a locked
 * slot shows: slot 1 at Tier 2, slot 2 at Tier 3, slot 3 at Tier 4.  `null` for
 * an index no tier can open.
 */
export function slotOpeningTier(slotIndex: number): number | null {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= PALMA_SLOT_CEILING) {
    return null;
  }
  return slotIndex + 2;
}

// ── §2 write results ───────────────────────────────────────────────────────

/** Why a palma write was refused.  `ok: true` never carries a reason. */
export type PalmaWriteRejection =
  | 'no-profile'
  | 'unknown-palma'
  | 'boss-only'
  | 'locked'
  | 'already-equipped'
  | 'not-equipped'
  | 'no-slot'
  | 'not-for-sale'
  | 'already-owned'
  | 'insufficient-gold';

/** A successful write: the NEW profile the caller saves, and the palma it moved. */
export type PalmaWriteResult =
  | { ok: true; profile: PlayerProfile; palma: Palma }
  | { ok: false; reason: PalmaWriteRejection };

const refuse = (reason: PalmaWriteRejection): PalmaWriteResult => ({ ok: false, reason });

/** The resolved record with both lists present — the only shape a write composes from. */
interface ResolvedPalmae {
  unlocked: string[];
  equipped: string[];
}

const readPalmae = (input: unknown): ResolvedPalmae => {
  const state = resolvePalmae(input);
  return { unlocked: state.unlocked ?? [], equipped: state.equipped ?? [] };
};

const resolvedPalmae = (profile: PlayerProfile): ResolvedPalmae => readPalmae(profile);

/** A profile whose gold is missing or not finite can afford nothing. */
function canAfford(profile: PlayerProfile, price: number): boolean {
  return (
    typeof profile.gold === 'number' &&
    Number.isFinite(profile.gold) &&
    typeof price === 'number' &&
    Number.isFinite(price) &&
    profile.gold >= price
  );
}

// ── §3 equip / unequip — the StatsTab panel's one write ────────────────────

/**
 * Wear a palm the player has unlocked.
 *
 * Refused when the id is unknown, boss-only (**a boss's palm can never be worn
 * by the player, however a save was edited**), not unlocked, already worn, or
 * when the tier's slot ladder is full.  A success writes the resolved record
 * plus the one id; nothing else on the profile moves.
 */
export function equipPalma(
  profile: PlayerProfile | null | undefined,
  palmaId: unknown,
): PalmaWriteResult {
  if (!profile) return refuse('no-profile');
  const palma = getPalma(palmaId);
  if (!palma) return refuse('unknown-palma');
  if (palma.bossOnly === true) return refuse('boss-only');

  const state = resolvedPalmae(profile);
  if (!state.unlocked.includes(palma.id)) return refuse('locked');
  if (state.equipped.includes(palma.id)) return refuse('already-equipped');

  const slots = palmaSlotsForTier(profile.currentTier);
  if (slots <= 0 || state.equipped.length >= slots) return refuse('no-slot');

  return {
    ok: true,
    palma,
    profile: { ...profile, palmae: { unlocked: state.unlocked, equipped: [...state.equipped, palma.id] } },
  };
}

/** Take a worn palm off — always free, and the slot it frees is usable at once. */
export function unequipPalma(
  profile: PlayerProfile | null | undefined,
  palmaId: unknown,
): PalmaWriteResult {
  if (!profile) return refuse('no-profile');
  const palma = getPalma(palmaId);
  if (!palma) return refuse('unknown-palma');
  if (palma.bossOnly === true) return refuse('boss-only');

  const state = resolvedPalmae(profile);
  if (!state.equipped.includes(palma.id)) return refuse('not-equipped');

  return {
    ok: true,
    palma,
    profile: {
      ...profile,
      palmae: {
        unlocked: state.unlocked,
        equipped: state.equipped.filter((id) => id !== palma.id),
      },
    },
  };
}

// ── §4 the earn checks ─────────────────────────────────────────────────────

/**
 * The fields the earn checks read.  Structural on purpose — a `PlayerProfile`
 * satisfies it, and so does a bare literal in a suite.  `palmae` is read through
 * `resolvePalmae` so an unknown or boss-only id never counts as owned.
 */
export interface PalmaDeedRecord extends RankInput {
  fightsWon?: number;
  peakCrowdHypeOverall?: number;
  palmae?: PalmaeState;
}

/** Sand Sprinter's threshold: ten victories. */
export const SAND_SPRINTER_FIGHTS_WON = 10;
/** First Palm of the Crowd / Phoenix Nerves: the peak crowd hype they answer. */
export const FIRST_PALM_HYPE = 50;
export const PHOENIX_NERVES_HYPE = 85;
/** Shieldwall Discipline: the tier whose CLEARING is the deed (Tier 2 → 3). */
export const SHIELDWALL_CLEARED_TIER = 3;

/**
 * The opponent a `boss-drop` row names, resolved from the row's own
 * `sourceDetail` ("Goliath", "Ignis", "Valéria") against the shipped roster's
 * names.  Data-driven on purpose: a renamed or re-tiered boss moves the deed
 * with it, and a row whose detail names nobody drops nothing.
 */
function opponentIdsNamed(name: string): string[] {
  return ALL_OPPONENTS.filter(
    (opponent) => typeof opponent.name === 'string' && opponent.name.split(' ')[0] === name,
  ).map((opponent) => opponent.id);
}

/** palma id → the opponent ids whose first defeat drops it (empty if none). */
const BOSS_DROP_OPPONENT_IDS: ReadonlyMap<string, readonly string[]> = new Map(
  PALMAE_PLAYER_POOL.filter((palma) => palma.source === 'boss-drop').map((palma) => [
    palma.id,
    opponentIdsNamed(palma.sourceDetail),
  ]),
);

/** The rank each rank-gated palma answers, derived through `deriveRank`. */
const RANK_DEEDS: readonly { palmaId: string; rank: GladiatorRank }[] = [
  { palmaId: 'blood_price', rank: 'Veteran' },
  { palmaId: 'heavy_hand', rank: 'Champion' },
  { palmaId: 'golden_laurel', rank: 'Legend' },
];

/** A whole, non-negative count; anything else reads as zero. */
function countOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/** The felled ids, dropped unless they really are ids. */
function felledIds(record: PalmaDeedRecord | null | undefined): string[] {
  const stored = record?.defeatedOpponentIds;
  if (!Array.isArray(stored)) return [];
  return stored.filter((id): id is string => typeof id === 'string');
}

/**
 * One predicate per EARNED palma (`doctore-training` rows are bought, not won,
 * and carry no deed).  Keyed by the palma id the deed grants; built from the
 * data above so a row with no deed simply cannot be earned.
 */
const DEEDS: ReadonlyMap<string, (record: PalmaDeedRecord) => boolean> = new Map<
  string,
  (record: PalmaDeedRecord) => boolean
>([
  // Boss drops: the boss whose name the row's own sourceDetail states.
  ...[...BOSS_DROP_OPPONENT_IDS].map(([palmaId, opponentIds]): [string, (record: PalmaDeedRecord) => boolean] => [
    palmaId,
    (record) => {
      if (opponentIds.length === 0) return false;
      const felled = felledIds(record);
      return opponentIds.some((id) => felled.includes(id));
    },
  ]),
  // Tier 2 cleared — which is the same event as Ignis falling (he is its boss).
  ['shieldwall_discipline', (record) =>
    countOrZero(record.currentTier) >= SHIELDWALL_CLEARED_TIER ||
    felledIds(record).includes('opp_ignis_boss')],
  ['sand_sprinter', (record) => countOrZero(record.fightsWon) >= SAND_SPRINTER_FIGHTS_WON],
  ['first_palm_of_the_crowd', (record) =>
    countOrZero(record.peakCrowdHypeOverall) >= FIRST_PALM_HYPE],
  ['phoenix_nerves', (record) =>
    countOrZero(record.peakCrowdHypeOverall) >= PHOENIX_NERVES_HYPE],
  // Rank gates read the DERIVED rank only; the stored `rank` field is never read.
  ...RANK_DEEDS.map(
    ({ palmaId, rank }): [string, (record: PalmaDeedRecord) => boolean] => [
      palmaId,
      (record) => rankAtLeast(deriveRank(record), rank),
    ],
  ),
]);

/** The player-pool rows that can be EARNED (everything but the Doctore's sold ones). */
export const EARNED_PALMAE: readonly Palma[] = PALMAE_PLAYER_POOL.filter(
  (palma) => palma.source !== 'doctore-training',
);

/** The player-pool rows the Doctore SELLS, read straight off the data. */
export const DOCTORE_PALMAE: readonly Palma[] = PALMAE_PLAYER_POOL.filter(
  (palma) => palma.source === 'doctore-training',
);

/** The palma ids a record's deeds grant, in `PALMAE_PLAYER_POOL` order. */
export function palmaDeedIds(record: PalmaDeedRecord | null | undefined): string[] {
  const ids: string[] = [];
  for (const palma of EARNED_PALMAE) {
    const deed = DEEDS.get(palma.id);
    if (deed && deed(record ?? {})) ids.push(palma.id);
  }
  return ids;
}

/**
 * The palms this record has EARNED but does not yet own, in data order.
 *
 * Idempotent by construction: a palma already in `unlocked` is skipped before
 * its deed is even evaluated, so re-winning a fight (or replaying the whole
 * victory write) can never duplicate an unlock.
 */
export function evaluatePalmaEarns(record: PalmaDeedRecord | null | undefined): Palma[] {
  const unlocked = new Set(readPalmae(record ?? {}).unlocked);
  const earned: Palma[] = [];
  for (const palma of EARNED_PALMAE) {
    if (unlocked.has(palma.id)) continue;
    const deed = DEEDS.get(palma.id);
    if (deed && deed(record ?? {})) earned.push(palma);
  }
  return earned;
}

/** What the victory write needs: the profile to save, and what it just earned. */
export interface PalmaEarnResult {
  profile: PlayerProfile;
  earned: Palma[];
}

/**
 * Append this victory's new unlocks to the profile the victory write composes.
 *
 * Returns the CALLER'S OWN profile object when nothing new was earned, so the
 * identity check every handler in this house uses keeps working.  On a success
 * it returns a NEW profile carrying the resolved `unlocked` list plus the new
 * ids, with `equipped` untouched — **an unlock is never an equip**.
 */
export function applyPalmaEarns(profile: PlayerProfile): PalmaEarnResult {
  const earned = evaluatePalmaEarns(profile);
  if (earned.length === 0) return { profile, earned };

  const state = resolvedPalmae(profile);
  return {
    profile: {
      ...profile,
      palmae: { unlocked: [...state.unlocked, ...earned.map((palma) => palma.id)], equipped: state.equipped },
    },
    earned,
  };
}

// ── §5 the Doctore's stall ─────────────────────────────────────────────────

/** A palma's price, read from its own data row; `null` when it is not for sale. */
export function palmaPrice(palma: Palma | null | undefined): number | null {
  const price = palma?.price;
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return null;
  return price;
}

/**
 * Buy one of the Doctore's palms.
 *
 * A purchase UNLOCKS and never equips (the player chooses what to wear, and the
 * tier ladder decides how much), deducts exactly the row's own price, and
 * refuses an already-owned palm so a stale click cannot be charged twice.  The
 * gold can never go negative: an unaffordable price is refused before any
 * profile is built.
 */
export function purchaseDoctorePalma(
  profile: PlayerProfile | null | undefined,
  palmaId: unknown,
): PalmaWriteResult {
  if (!profile) return refuse('no-profile');
  const palma = getPalma(palmaId);
  if (!palma) return refuse('unknown-palma');
  if (palma.bossOnly === true) return refuse('boss-only');
  if (palma.source !== 'doctore-training') return refuse('not-for-sale');

  const price = palmaPrice(palma);
  if (price === null) return refuse('not-for-sale');

  const state = resolvedPalmae(profile);
  if (state.unlocked.includes(palma.id)) return refuse('already-owned');
  if (!canAfford(profile, price)) return refuse('insufficient-gold');

  return {
    ok: true,
    palma,
    profile: {
      ...profile,
      gold: profile.gold - price,
      palmae: { unlocked: [...state.unlocked, palma.id], equipped: state.equipped },
    },
  };
}
