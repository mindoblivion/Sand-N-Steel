/**
 * S4 — INJURIES HAPPEN (disease before cures).
 *
 * `PlayerInjury` has existed on the profile since the beginning and
 * `calculateTotalStats` has always subtracted its penalties — but until this slice
 * nothing in the game ever wrote a non-null injury, so the field was dead and the
 * penalty branch was never exercised by play.  This module is the missing
 * inflictor, and it is the ONLY thing that writes the field.
 *
 * The rule, in full:
 *
 *   • a LOSS with no active injury inflicts a fresh one: 3 fights, −2 STR, −2 AGI;
 *   • ANY completed duel (win or loss) while injured decrements `fightsRemaining`
 *     by one, and the injury clears to `null` when that reaches zero;
 *   • a loss while already injured neither stacks nor refreshes — it only
 *     decrements, like every other completed duel;
 *   • a fresh infliction is NOT decremented by the duel that inflicted it, so a new
 *     injury always starts at the full 3 fights.
 *
 * It is deterministic — no clock, no randomness, no storage — and pure: it reads
 * the profile it is handed and returns a NEW profile (the input is never mutated).
 * It follows the shipped pure-transaction idiom (`bossKills.ts`, `laurels.ts`,
 * `tempering.ts`): the caller hands the result to the existing
 * `setProfile()` + `saveProfile()` pair.
 *
 * The penalties are applied by the existing `calculateTotalStats` (floored at 1);
 * this module never touches that function or any combat formula.
 *
 * S5 — THE CURES live here too, because they write the same one field: the Arena
 * Medical House's `treatInjury` clears a wound outright for 75 gold, and the
 * Caravanserai Inn's `restAtInn` takes two fights off its clock (clearing it at
 * zero) for 25 gold.  Both are pure, both refuse before any arithmetic (no live
 * injury, or a purse that cannot cover the price, returns the caller's own profile
 * untouched), and neither reads nor advances the day/time — rest is a treatment
 * service here, not the exertion day counter.
 */

import type { PlayerInjury, PlayerProfile } from '../types/game';

/** A fresh injury lasts this many completed duels. */
export const INJURY_FIGHTS = 3;

/** S5 — the Arena Medical House's price for a full cure, in gold (design §1.6). */
export const TREAT_PRICE = 75;

/** S5 — the Caravanserai Inn's price for a night's rest, in gold (design §1.6). */
export const REST_PRICE = 25;

/** S5 — one night's rest takes this many fights off the injury's clock. */
export const REST_FIGHTS_RESTORED = 2;
/** A fresh injury costs this much strength … */
export const INJURY_PENALTY_STRENGTH = 2;
/** … and this much agility. */
export const INJURY_PENALTY_AGILITY = 2;

/**
 * What this duel did to the injury, for the result screen to say:
 *   • `inflicted` — this loss opened a new injury (the modal names its own numbers);
 *   • `healed` — this completed duel was the last one the injury had, and it cleared.
 * A duel that merely decrements a still-live injury has nothing new to announce and
 * reports `null`.
 */
export type DuelInjuryEvent =
  | { kind: 'inflicted'; injury: PlayerInjury }
  | { kind: 'healed' };

/** The one field the rule reads, so a bare literal in a suite satisfies it. */
export interface InjuryRecord {
  injury?: PlayerInjury | null;
}

/**
 * The profile's live injury, or `null`.  A missing, absent or exhausted injury is
 * `null` — the same read `calculateTotalStats` makes before it applies a penalty —
 * so a malformed save cannot make the game believe in a wound that does nothing.
 */
export function resolveActiveInjury(
  raw: PlayerInjury | null | undefined,
): PlayerInjury | null {
  if (!raw || typeof raw !== 'object') return null;
  const remaining = raw.fightsRemaining;
  if (typeof remaining !== 'number' || !Number.isFinite(remaining) || remaining <= 0) {
    return null;
  }
  return {
    fightsRemaining: Math.floor(remaining),
    penaltyStrength: raw.penaltyStrength,
    penaltyAgility: raw.penaltyAgility,
  };
}

/**
 * Resolve one completed duel against the profile's injury.
 *
 * `won` is the duel's outcome; a loss is the only thing that can inflict, and every
 * outcome (including a loss taken while already hurt) advances an existing injury's
 * clock by one.  The fresh-injury branch returns before the decrement, which is what
 * keeps a new wound at its full three fights.
 */
export function resolveInjuryAfterDuel<T extends InjuryRecord>(
  profile: T,
  won: boolean,
): { profile: T; event: DuelInjuryEvent | null } {
  const current = resolveActiveInjury(profile.injury);

  if (current) {
    const fightsRemaining = current.fightsRemaining - 1;
    if (fightsRemaining <= 0) {
      return { profile: { ...profile, injury: null }, event: { kind: 'healed' } };
    }
    return { profile: { ...profile, injury: { ...current, fightsRemaining } }, event: null };
  }

  if (won) return { profile, event: null };

  const injury: PlayerInjury = {
    fightsRemaining: INJURY_FIGHTS,
    penaltyStrength: INJURY_PENALTY_STRENGTH,
    penaltyAgility: INJURY_PENALTY_AGILITY,
  };
  return { profile: { ...profile, injury }, event: { kind: 'inflicted', injury } };
}

/** The one player-facing line a fresh injury prints, from the injury's own numbers. */
export function injuryBannerLine(injury: PlayerInjury): string {
  const fights = injury.fightsRemaining;
  return `Injured: −${injury.penaltyStrength} STR / −${injury.penaltyAgility} AGI for ${fights} ${
    fights === 1 ? 'fight' : 'fights'
  }`;
}

/* ── S5 — the cures ──────────────────────────────────────────────────────── */

/**
 * The two places that sell a cure.  The Medical House cures outright; the inn
 * takes a bite out of the clock.  These ids are the surface's own, not save data.
 */
export type TreatmentService = 'medical_house' | 'caravanserai';

/** Why a cure was refused.  `ok: true` never carries a reason. */
export type TreatmentRejectionReason = 'no-injury' | 'insufficient-gold';

export type TreatmentEligibility =
  | { ok: true; price: number }
  | { ok: false; reason: TreatmentRejectionReason };

/** What one visit costs, in gold — the single source for the surface and the transaction. */
export function treatmentPrice(service: TreatmentService): number {
  return service === 'medical_house' ? TREAT_PRICE : REST_PRICE;
}

/**
 * Can the player buy this cure right now?  Both grounds the transaction enforces:
 * a LIVE injury to treat (an exhausted or malformed wound is no injury, exactly as
 * `resolveActiveInjury` reads it) and a purse that covers the price.  A balance that
 * is missing or not a finite number can afford nothing, so a malformed save can never
 * produce a NaN balance by subtraction.
 */
export function getTreatmentEligibility(
  profile: PlayerProfile,
  service: TreatmentService,
): TreatmentEligibility {
  if (!resolveActiveInjury(profile?.injury)) return { ok: false, reason: 'no-injury' };

  const price = treatmentPrice(service);
  const gold = profile.gold;
  if (typeof gold !== 'number' || !Number.isFinite(gold) || gold < price) {
    return { ok: false, reason: 'insufficient-gold' };
  }
  return { ok: true, price };
}

/**
 * The Arena Medical House: 75 gold, and the wound is gone.  Eligibility first, so a
 * refusal returns the caller's own profile untouched and never a half-charged one;
 * a success returns a NEW profile with the price deducted exactly once.
 */
export function treatInjury(profile: PlayerProfile): PlayerProfile {
  if (!getTreatmentEligibility(profile, 'medical_house').ok) return profile;
  return { ...profile, gold: profile.gold - TREAT_PRICE, injury: null };
}

/**
 * The Caravanserai Inn: 25 gold, and two fights come off the wound's clock.  The
 * floor is zero — at zero the injury clears to `null` rather than lingering as a
 * wound worth nothing — and the penalties ride along until then.
 *
 * This is the TREATMENT service only: it does not advance the day or the time.
 */
export function restAtInn(profile: PlayerProfile): PlayerProfile {
  if (!getTreatmentEligibility(profile, 'caravanserai').ok) return profile;

  const current = resolveActiveInjury(profile.injury)!;
  const fightsRemaining = Math.max(0, current.fightsRemaining - REST_FIGHTS_RESTORED);
  return {
    ...profile,
    gold: profile.gold - REST_PRICE,
    injury: fightsRemaining > 0 ? { ...current, fightsRemaining } : null,
  };
}
