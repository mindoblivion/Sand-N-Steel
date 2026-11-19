/**
 * ===========================================================================
 * COMBAT-5 — Received shake scales with what landed (gap 6: being hit always
 * shook the same). Pure helper only — no React, no storage, no randomness —
 * so `DuelScene` (resolution) and the tests call the SAME function.
 *
 *   • the flat `playerHit: 0.2` is gone: a blow the player RECEIVES now
 *     scales exactly like the blows the player LANDS (quick 0.25, power
 *     0.45, crit 0.70), with the telegraphed heavy the hardest single shake
 *     in the game at 0.85
 *   • priority is the hit-stop chain's own order — blocked first, so a
 *     blocked telegraphed heavy shakes 0.10, not 0.85: blocking stays the
 *     answer to heavies
 *   • no single received hit exceeds 0.85 trauma; total trauma stays clamped
 *     at 1.0 on add and decay stays 1.6/s (0.85 empties in 0.53 s, inside the
 *     1450 ms telegraph resolution window, so shake never bleeds into the
 *     next turn). The settings escape hatch (Camera Shake Off / reduced) is
 *     untouched; no new setting.
 *   • the Twin Fangs second bite adds no trauma of its own — it adds only
 *     its 35 ms hit-stop and rides the resolution's trauma. The beast pounce
 *     needs no entry: it dispatches as an ordinary quick/power attack by
 *     `hitProfile`, so it falls out of the table naturally.
 * ===========================================================================
 */

/** The received-shake table, in trauma units — the pinned design values. */
export const RECEIVED_SHAKE_TRAUMA = {
  /** A blow the shield stopped, whatever it was — the shortest shake. */
  blocked: 0.1,
  /** The boss's telegraphed overhead smash — the heaviest impact in the game. */
  telegraphedHeavy: 0.85,
  /** A critical blow (a power attack that crit). */
  crit: 0.7,
  /** A quick attack. */
  quick: 0.25,
  /** A power attack. */
  power: 0.45,
} as const;

export interface ReceivedShakeInput {
  /** The defender's shield stopped the blow — wins the priority. */
  isBlocked: boolean;
  /** A telegraphed heavy that landed — the hardest single shake. */
  isTelegraphedHeavy: boolean;
  /** A critical blow — only possible on a power attack. */
  isCrit: boolean;
  /** A quick (light) attack. */
  isQuick: boolean;
}

/**
 * The trauma a blow the player RECEIVES adds: blocked 0.10, telegraphed
 * heavy 0.85, crit 0.70, quick 0.25, power 0.45 — in that priority order,
 * the same order as the hit-stop chain (blocked first).
 */
export function receivedShakeTrauma(input: ReceivedShakeInput): number {
  if (input.isBlocked) return RECEIVED_SHAKE_TRAUMA.blocked;
  if (input.isTelegraphedHeavy) return RECEIVED_SHAKE_TRAUMA.telegraphedHeavy;
  if (input.isCrit) return RECEIVED_SHAKE_TRAUMA.crit;
  if (input.isQuick) return RECEIVED_SHAKE_TRAUMA.quick;
  return RECEIVED_SHAKE_TRAUMA.power;
}
