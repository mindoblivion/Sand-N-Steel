/**
 * CH-2 — the legacy re-pledge: the one write this slice makes to an existing
 * profile, and only on the player's tap.
 *
 * A save written before CH-1 has no `armatura` field, so its class is INFERRED
 * from the character model (`resolveArmatura`).  That inference is honest but it
 * cannot name six of the seven classes, so the stats screen offers those players a
 * one-time free choice of class.  The pledge writes the field and NOTHING else:
 * no stat, no item, no gold and no palma changes, so a legacy gladiator keeps every
 * number he earned.  A profile that already names a class cannot pledge again —
 * `canRepledgeArmatura` is what the screen reads to hide the action.
 */

import type { ArmaturaId, PlayerProfile } from '../types/game';
import { getArmatura } from '../data/armaturae';

/** True only while the class was never explicitly set on the save. */
export function canRepledgeArmatura(profile: PlayerProfile | null | undefined): boolean {
  if (!profile) return false;
  return getArmatura(profile.armatura) === undefined;
}

/** Why a pledge was refused.  `ok: true` never carries a reason. */
export type PledgeRejectionReason = 'no-profile' | 'already-pledged' | 'unknown-armatura';

export type PledgeResult =
  | { ok: true; profile: PlayerProfile }
  | { ok: false; profile: null; reason: PledgeRejectionReason };

/**
 * Write the chosen class onto the profile.
 *
 * A success returns a NEW profile whose only difference from the argument is the
 * `armatura` field.  A refusal returns `ok: false` and no profile at all, so a
 * refused tap can never reach `saveProfile()`; the caller's object is never
 * mutated either way.
 */
export function withArmaturaPledge(
  profile: PlayerProfile | null | undefined,
  armatura: ArmaturaId,
): PledgeResult {
  if (!profile) return { ok: false, profile: null, reason: 'no-profile' };
  if (!canRepledgeArmatura(profile)) {
    return { ok: false, profile: null, reason: 'already-pledged' };
  }
  const row = getArmatura(armatura);
  if (!row) return { ok: false, profile: null, reason: 'unknown-armatura' };

  return { ok: true, profile: { ...profile, armatura: row.id } };
}
