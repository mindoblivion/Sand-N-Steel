/**
 * S7 — TAVERN RUMOURS: intel as a service.
 *
 * The Golden Palm Tavern sells what a tavern actually sells: knowledge. For 15
 * gold the keeper tells the player what they could not see from the stands —
 * an opponent's temperament, their stat line, the weapon they carry and, for a
 * boss, the trick that makes them dangerous.
 *
 * INTEL IS INFORMATION ONLY. It never changes a stat, a formula, a reward, an
 * opponent's behaviour or a fight's odds — nothing in the combat path imports
 * this module, and `purchaseIntel` touches exactly two fields: `gold` (down by
 * the price) and `intel` (the opponent id appended). The panel and the tournament
 * card say so in plain words, because a player paying for information must be
 * able to trust that it is not a buff in disguise.
 *
 * `PlayerProfile.intel?: string[]` is optional exactly like `chariot`, `racing`
 * and `consumables`: a save written before this slice has no field at all and must
 * keep loading, so every read goes through `resolveIntel`, which answers `[]` for
 * a missing, null or malformed field and drops ids the roster no longer knows.
 * Nothing migrates it and `createNewProfile()` does not write it — the field
 * appears the first time a rumour is bought.
 *
 * The rules, in one place:
 *   • a rumour costs exactly `INTEL_PRICE` and can never take gold below zero; a
 *     purse that cannot cover it is refused before any arithmetic;
 *   • an opponent already in `intel` is never offered again and can never be
 *     charged twice — the refusal is `already-owned`, not a silent no-op;
 *   • an id the roster does not know is refused (`unknown-opponent`).
 *
 * Every function here is pure and returns a NEW profile (the input and its nested
 * `intel` array are never mutated); a refusal returns `{ ok: false, reason }` with
 * no profile at all, so a refused purchase can never reach `saveProfile()`.
 */

import type { OpponentConfig, PlayerProfile } from '../types/game';
import { ALL_OPPONENTS } from '../data/opponents';

/** What one rumour costs. Pinned by the brief; the tests state 15 as a literal. */
export const INTEL_PRICE = 15;

/** The roster's ids, the only ids a rumour can ever be about. */
const ROSTER_BY_ID = new Map(ALL_OPPONENTS.map((opponent) => [opponent.id, opponent]));

/** The fields this module reads, so a bare literal in a suite satisfies it. */
export interface IntelRecord {
  intel?: string[] | null;
  gold?: number;
}

/**
 * The opponents this profile has bought rumour on, resolved lazily: absent, null
 * or malformed is `[]`; non-strings and ids the roster no longer knows are dropped
 * (like the chariot loader drops retired parts) and duplicates keep their first
 * position, so a repeated buy can never appear twice. Always a fresh array — a
 * caller can never mutate the save through it.
 */
export function resolveIntel(profile: IntelRecord | null | undefined): string[] {
  const raw = profile?.intel;
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    if (!ROSTER_BY_ID.has(value)) continue;
    if (ids.includes(value)) continue;
    ids.push(value);
  }
  return ids;
}

/** Has the player bought rumour on this opponent? A malformed save: no. */
export function hasIntel(
  profile: IntelRecord | null | undefined,
  opponentId: string,
): boolean {
  return resolveIntel(profile).includes(opponentId);
}

/**
 * What the tavern can still sell, in roster order — every tournament opponent the
 * player has NOT yet bought rumour on. An opponent already in `intel` is filtered
 * out here, so the panel cannot offer it and no double-charge is possible.
 */
export function intelTargets(profile: IntelRecord | null | undefined): OpponentConfig[] {
  const owned = resolveIntel(profile);
  return ALL_OPPONENTS.filter((opponent) => !owned.includes(opponent.id));
}

/* ── buy ─────────────────────────────────────────────────────────────────── */

export type IntelPurchaseRejectionReason =
  | 'unknown-opponent'
  | 'already-owned'
  | 'insufficient-gold';

/**
 * `ok: true` carries the NEW profile and the opponent the rumour is about; a
 * refusal carries no profile, so it cannot be handed to a save writer.
 */
export type IntelPurchaseResult =
  | { ok: true; profile: PlayerProfile; opponent: OpponentConfig }
  | { ok: false; reason: IntelPurchaseRejectionReason };

export type IntelEligibility =
  | { ok: true; opponent: OpponentConfig }
  | { ok: false; reason: IntelPurchaseRejectionReason };

/**
 * Can this rumour be bought right now? The three grounds the transaction enforces:
 * a real opponent, not already owned, and a purse that covers the price. The panel
 * reads this to disable its button; `purchaseIntel` re-checks it, so a stale click
 * cannot slip past.
 */
export function getIntelPurchaseEligibility(
  profile: PlayerProfile,
  opponentId: string,
): IntelEligibility {
  const opponent = ROSTER_BY_ID.get(opponentId);
  if (!opponent) return { ok: false, reason: 'unknown-opponent' };
  if (hasIntel(profile, opponent.id)) return { ok: false, reason: 'already-owned' };
  const gold = (profile as IntelRecord | null)?.gold;
  if (typeof gold !== 'number' || !Number.isFinite(gold) || gold < INTEL_PRICE) {
    return { ok: false, reason: 'insufficient-gold' };
  }
  return { ok: true, opponent };
}

/**
 * Buy one rumour. Gold decreases by exactly `INTEL_PRICE` (never below zero: a
 * purse that cannot cover it is refused first) and the opponent's id is appended
 * to `intel`. Nothing else on the profile is read or written — no stat, no
 * formula, no reward.
 */
export function purchaseIntel(profile: PlayerProfile, opponentId: string): IntelPurchaseResult {
  const eligibility = getIntelPurchaseEligibility(profile, opponentId);
  if (!eligibility.ok) return { ok: false, reason: eligibility.reason };

  const gold = (profile as IntelRecord).gold as number;
  return {
    ok: true,
    opponent: eligibility.opponent,
    profile: {
      ...profile,
      gold: gold - INTEL_PRICE,
      intel: [...resolveIntel(profile), eligibility.opponent.id],
    },
  };
}
