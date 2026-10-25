/**
 * C-8.82D — the chronicle line for an incoming strike that LANDED.
 *
 * Every landed blow already wrote a line, but a blow that beat a raised dodge
 * read exactly like a blow against an open guard — "X struck Y for N damage." The
 * player had just paid the dodge's stamina for that stance, the stance was spent,
 * and the chronicle hid the one fact the exchange turns on: the dodge was taken
 * and it FAILED. The C-8.82C audit named this the highest-value follow-up of the
 * defense-parity work, and this module owns that wording alone.
 *
 * Three rules the copy keeps:
 *
 *   • **One line, one hit.** The failed-dodge case reuses the SAME chronicle
 *     entry the landed blow already writes — it is a different wording, not an
 *     extra entry — so one incoming attack can never report the failure twice,
 *     log the damage twice or contradict itself.
 *   • **It says what happened.** The strike LANDED for real damage; the text
 *     never claims a miss, a block or an evade, and never implies the dodge's
 *     stamina came back (nothing here touches stamina at all).
 *   • **Criticals stay legible.** A critical blow behind a failed dodge still
 *     reads as a critical blow, so the damage outcome is never flattened.
 *
 * Pure text: no damage formula, no fighter state, no RNG. The damage figure is
 * computed by the caller from the shipped `calculateAttackDamage`.
 */

/** The words that mark a dodge which was raised and beaten — one, shared marker. */
export const DODGE_FAILED_MARKER = 'DODGE FAILS';

export interface LandedStrikeFeedback {
  attackerName: string;
  defenderName: string;
  /** The damage the shipped formula actually applied. */
  damage: number;
  isCrit: boolean;
  /**
   * The defender had a dodge stance up and the evade roll failed. False for an
   * open defence, a raised shield (which has its own BLOCKED line) or an evasion
   * (which has its own EVADED line).
   */
  dodgeFailed?: boolean;
}

/**
 * The one chronicle line for a landed strike.
 *
 * @returns the text for the landed hit; callers pass it to their single `addLog`
 *          call for that hit, with the same log kind they used before.
 */
export function landedStrikeText({
  attackerName,
  defenderName,
  damage,
  isCrit,
  dodgeFailed = false,
}: LandedStrikeFeedback): string {
  if (dodgeFailed) {
    return isCrit
      ? `${defenderName}'s ${DODGE_FAILED_MARKER} — CRITICAL BLOW! ${attackerName}'s strike lands for ${damage} damage.`
      : `${defenderName}'s ${DODGE_FAILED_MARKER} — ${attackerName}'s strike lands for ${damage} damage.`;
  }
  return isCrit
    ? `CRITICAL BLOW! ${attackerName} struck ${defenderName} for ${damage} DAMAGE!`
    : `${attackerName} struck ${defenderName} for ${damage} damage.`;
}
