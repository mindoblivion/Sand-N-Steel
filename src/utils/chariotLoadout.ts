/**
 * Phase C-8.66B — pure chariot loadout helpers.
 *
 * Everything here is a pure function of `(profile, partId)`:
 *   • no profile, chariot loadout or nested object is ever mutated in place —
 *     every success returns a NEW `PlayerProfile` for the caller to hand to the
 *     existing `saveProfile()` path;
 *   • a rejected call returns the caller's own profile object untouched, so a
 *     failed purchase cannot move gold, ownership or the equipped choice;
 *   • ownership and equipment are resolved through one place, so a legacy save
 *     (no `chariot` field), a partial loadout or an id that no longer exists in
 *     the catalogue all resolve to the standard chariot instead of throwing.
 *
 * The persistence path is deliberately the existing one: `profile.gold` and the
 * existing `saveProfile()` / `PROFILE_STORAGE_KEY`.  There is no second currency,
 * no second storage key and no parallel purchase system.
 */

import {
  PlayerProfile,
  ChariotLoadout,
  ChariotSlot,
  ChariotEquippedResolved,
} from '../types/game';
import {
  CHARIOT_SLOTS,
  DEFAULT_CHARIOT_PART_IDS,
  DEFAULT_CHARIOT_WHEELS,
  DEFAULT_CHARIOT_FINISH,
  getChariotPart,
} from '../data/chariotParts';

/** Why a purchase or an equip was refused.  `ok: true` never carries a reason. */
export type ChariotRejectionReason =
  | 'no-profile'
  | 'unknown-part'
  | 'slot-mismatch'
  | 'already-owned'
  | 'insufficient-gold'
  | 'not-owned';

export type ChariotLoadoutState = {
  owned: string[];
  /** P3 — one resolved part id for EVERY slot, filled in at read time. */
  equipped: ChariotEquippedResolved;
};

export type ChariotPurchaseResult =
  | { ok: true; profile: PlayerProfile }
  | { ok: false; reason: ChariotRejectionReason };

export type ChariotEquipResult =
  | { ok: true; profile: PlayerProfile }
  | { ok: false; reason: ChariotRejectionReason };

/** The stock chariot every profile has before it buys anything. */
export function defaultChariotLoadout(): ChariotLoadoutState {
  return {
    owned: [DEFAULT_CHARIOT_WHEELS, DEFAULT_CHARIOT_FINISH],
    equipped: { ...DEFAULT_CHARIOT_PART_IDS },
  };
}

/** The slot's stock part id — the fallback a missing or stale entry resolves to. */
function defaultPartId(slot: ChariotSlot): string {
  return DEFAULT_CHARIOT_PART_IDS[slot];
}

/**
 * Resolve the player's chariot loadout.
 *
 * Never throws and never returns something the workshop cannot render:
 *   • a profile with no `chariot` field (every pre-C-8.66B save, local or in the
 *     cloud) reads as the stock chariot;
 *   • ids the catalogue no longer knows are dropped from `owned`;
 *   • a slot whose equipped entry is missing, unknown or unowned falls back to
 *     that slot's stock part;
 *   • the two original slot defaults (wheels, finish) are always present in
 *     `owned`, and no duplicate survives;
 *   • P3 — `equipped` carries EVERY catalogue slot.  A slot the stored record
 *     does not carry (every legacy save has only wheels/finish) resolves to its
 *     stock part at read time.  Resolution is read-only: the stored record is
 *     never mutated and nothing is written back, so the saved shape is unchanged
 *     and `owned` is untouched by the newer slots (their stock parts are free
 *     and implicit, never listed).
 */
export function resolveChariotLoadout(
  profile: PlayerProfile | null | undefined
): ChariotLoadoutState {
  const stored: Partial<ChariotLoadout> | undefined = profile?.chariot;
  if (!stored) return defaultChariotLoadout();

  const owned = new Set<string>([DEFAULT_CHARIOT_WHEELS, DEFAULT_CHARIOT_FINISH]);
  for (const id of Array.isArray(stored.owned) ? stored.owned : []) {
    if (typeof id === 'string' && getChariotPart(id)) owned.add(id);
  }

  // The stored record may carry only the original two slots (or be partial or
  // null), so read it through an index that tolerates absent keys.
  const storedIds = (stored.equipped ?? {}) as Partial<Record<ChariotSlot, string>>;
  const equipped = {} as ChariotEquippedResolved;
  for (const slot of CHARIOT_SLOTS) {
    equipped[slot] = resolveEquippedId(storedIds[slot], slot, owned);
  }

  // The stock parts are always owned, so an equipped id inside `owned` is
  // always legal; re-adding here keeps `owned` and `equipped` consistent even
  // if a save was hand-edited.  Only the original two slots are re-added:
  // the P3 stock parts are implicit and never listed in `owned`.
  owned.add(equipped.wheels);
  owned.add(equipped.finish);

  return { owned: [...owned], equipped };
}

function resolveEquippedId(
  candidate: string | undefined,
  slot: ChariotSlot,
  owned: ReadonlySet<string>
): string {
  const part = typeof candidate === 'string' ? getChariotPart(candidate) : undefined;
  if (!part || part.slot !== slot || !owned.has(part.id)) return defaultPartId(slot);
  return part.id;
}

/**
 * The STORED form of a resolved loadout's `equipped` block.
 *
 * P6 widened this from P3's wheels + finish only: now that the workshop sells
 * the axle, harness and chassis slots, a non-stock fit in ANY slot has to
 * survive a save.  The rule is stated once, here:
 *
 *   • a slot whose equipped part is NOT its stock part is persisted;
 *   • a slot sitting on its stock part is omitted — the resolver restores it at
 *     read (`DEFAULT_CHARIOT_PART_IDS`), so nothing is lost;
 *   • a legacy wheels/finish-only record therefore reads exactly as it did, and
 *     a stock chariot still writes no `equipped` entry at all.
 *
 * The property P3 cared about is preserved and widened: whatever this writes
 * round-trips through `resolveChariotLoadout` to the same resolved loadout.
 */
function storedEquipped(resolved: ChariotEquippedResolved): ChariotLoadout['equipped'] {
  const stored: ChariotLoadout['equipped'] = {};
  for (const slot of CHARIOT_SLOTS) {
    const partId = resolved[slot];
    if (partId && partId !== DEFAULT_CHARIOT_PART_IDS[slot]) stored[slot] = partId;
  }
  return stored;
}

/**
 * Does the profile own this part?  Unknown ids are not owned; EVERY slot's stock
 * part always is.
 *
 * P3 kept `owned` to the two original stock ids, and the newer slots' stock
 * parts are implicit — never listed in a save.  P6's workshop renders all five
 * slots, so ownership is read off the catalogue here (`defaultOwned`) instead:
 * the stock axle, harness and tub are "included with every chariot" and must be
 * equippable back to, while the stored `owned` array keeps its P3 meaning.
 */
export function ownsChariotPart(
  profile: PlayerProfile | null | undefined,
  partId: string
): boolean {
  const part = getChariotPart(partId);
  if (!part) return false;
  if (part.defaultOwned) return true;
  return resolveChariotLoadout(profile).owned.includes(part.id);
}

/** Is this part the one equipped in its slot? */
export function isChariotPartEquipped(
  profile: PlayerProfile | null | undefined,
  partId: string
): boolean {
  const part = getChariotPart(partId);
  if (!part) return false;
  return resolveChariotLoadout(profile).equipped[part.slot] === part.id;
}

/** The equipped part id for one slot (always a real catalogue id). */
export function equippedChariotPartId(
  profile: PlayerProfile | null | undefined,
  slot: ChariotSlot
): string {
  return resolveChariotLoadout(profile).equipped[slot];
}

/**
 * Can the player buy this part right now?  Used by the workshop to disable the
 * button and to explain the state; the purchase itself re-checks the same rules.
 */
export function getChariotPurchaseEligibility(
  profile: PlayerProfile | null | undefined,
  partId: string
): { ok: true } | { ok: false; reason: ChariotRejectionReason } {
  if (!profile) return { ok: false, reason: 'no-profile' };
  const part = getChariotPart(partId);
  if (!part) return { ok: false, reason: 'unknown-part' };
  if (ownsChariotPart(profile, part.id)) return { ok: false, reason: 'already-owned' };
  if (profile.gold < part.price) return { ok: false, reason: 'insufficient-gold' };
  return { ok: true };
}

/** What an equip would do right now. */
export function getChariotEquipEligibility(
  profile: PlayerProfile | null | undefined,
  partId: string
): { ok: true } | { ok: false; reason: ChariotRejectionReason } {
  if (!profile) return { ok: false, reason: 'no-profile' };
  const part = getChariotPart(partId);
  if (!part) return { ok: false, reason: 'unknown-part' };
  if (!ownsChariotPart(profile, part.id)) return { ok: false, reason: 'not-owned' };
  return { ok: true };
}

/**
 * Buy a chariot part with the player's existing gold.
 *
 * Deducts `part.price` exactly once and adds ownership without duplicates.
 * Refuses, with the caller's profile returned unchanged, when there is no
 * profile, the id is unknown, the part is already owned, or gold is short.
 * Equipping is a separate step: a purchase never changes what is equipped.
 */
export function purchaseChariotPart(
  profile: PlayerProfile | null | undefined,
  partId: string
): ChariotPurchaseResult {
  const eligibility = getChariotPurchaseEligibility(profile, partId);
  if (!eligibility.ok) return eligibility;
  if (!profile) return { ok: false, reason: 'no-profile' };

  const part = getChariotPart(partId)!;
  const loadout = resolveChariotLoadout(profile);

  return {
    ok: true,
    profile: {
      ...profile,
      gold: profile.gold - part.price,
      chariot: {
        owned: [...loadout.owned, part.id],
        equipped: storedEquipped(loadout.equipped),
      },
    },
  };
}

/**
 * Equip an owned chariot part.  Never touches gold; refuses an unowned part, an
 * unknown id, a missing profile, and a caller that pairs a part with the wrong
 * slot (`expectedSlot`).
 */
export function equipChariotPart(
  profile: PlayerProfile | null | undefined,
  partId: string,
  expectedSlot?: ChariotSlot
): ChariotEquipResult {
  const eligibility = getChariotEquipEligibility(profile, partId);
  if (!eligibility.ok) return eligibility;
  if (!profile) return { ok: false, reason: 'no-profile' };

  const part = getChariotPart(partId)!;
  if (expectedSlot && part.slot !== expectedSlot) return { ok: false, reason: 'slot-mismatch' };

  const loadout = resolveChariotLoadout(profile);

  return {
    ok: true,
    profile: {
      ...profile,
      gold: profile.gold,
      chariot: {
        owned: [...loadout.owned],
        equipped: storedEquipped({ ...loadout.equipped, [part.slot]: part.id }),
      },
    },
  };
}

/** A short, player-facing explanation of a refusal. */
export function describeChariotRejection(reason: ChariotRejectionReason): string {
  switch (reason) {
    case 'no-profile':
      return 'No gladiator profile loaded.';
    case 'unknown-part':
      return 'That chariot part is no longer carried by the workshop.';
    case 'slot-mismatch':
      return 'That part does not fit this slot.';
    case 'already-owned':
      return 'Already owned — equip it without paying again.';
    case 'insufficient-gold':
      return 'Not enough gold.';
    case 'not-owned':
      return 'Buy this part before equipping it.';
  }
}
