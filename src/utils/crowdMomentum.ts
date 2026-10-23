/**
 * SANDS & STEEL — CROWD MOMENTUM (C-8.76B)
 * ===========================================================================
 * The combo counter's one gameplay-facing effect.
 *
 * Until this phase the player's combo was tracked, shown as a HUD badge and
 * recorded as `maxCombo` on the result screen, but it changed nothing. Crowd
 * Momentum turns every third consecutive landed hit into crowd hype — the
 * meter the arena already displays and the purse already pays for — so the
 * streak is worth something to the crowd and nothing at all to the damage
 * formula.
 *
 * The rule is one line of arithmetic:
 *
 *   • every THIRD consecutive landed player hit (3, 6, 9, …)
 *   • grants exactly {@link CROWD_MOMENTUM_HYPE_GAIN} hype
 *   • through the existing 100-point cap and the existing hype pathway
 *
 * What it is NOT: no damage bonus, no stamina refund, no hit-chance change, no
 * defence bypass, no persistent progression and no new HUD row. The reward is
 * bounded by the hype cap and by the fact that a missed strike or a hit the
 * player takes still resets the streak exactly as it did before (C-9).
 *
 * ── Why the transition, not the value ────────────────────────────────────
 *
 * The reward is keyed on the count MOVING FORWARD onto a milestone, never on
 * "the count is a multiple of three". That distinction is what makes the rule
 * safe to evaluate from a React effect: a re-render, a Strict Mode doubled
 * invocation, or a second identical callback all re-observe 3 → 3 and are worth
 * 0, so one milestone pays out once and only once. A reset (any event that
 * returns the count to 0) can never pay, because 0 is not a milestone and the
 * count did not move forward.
 *
 * Pure and side-effect-free — `DuelScene` owns the hype state and the chronicle.
 */

/** A milestone falls on every Nth consecutive landed hit. */
export const CROWD_MOMENTUM_INTERVAL = 3;

/** Hype granted when a milestone is newly reached. */
export const CROWD_MOMENTUM_HYPE_GAIN = 10;

/** The meter's ceiling — the same 100 every hype write already clamps to. */
export const CROWD_HYPE_MAX = 100;

/**
 * Is this exact combo count a Crowd Momentum milestone?
 *
 * True for 3, 6, 9, …; false for 0, negatives, non-multiples and malformed
 * values. This answers "is the badge lit", not "should hype be paid" — see
 * {@link crowdMomentumReward} for the transition rule.
 */
export function isCrowdMomentumMilestone(comboCount: number): boolean {
  if (typeof comboCount !== 'number' || !Number.isFinite(comboCount)) return false;
  return comboCount > 0 && comboCount % CROWD_MOMENTUM_INTERVAL === 0;
}

/** The outcome of one combo transition, ready for the caller to commit. */
export interface CrowdMomentumReward {
  /** True when this transition NEWLY reached a milestone. */
  milestone: boolean;
  /** Hype this transition is worth: 10 on a new milestone, otherwise 0. */
  hypeGain: number;
  /**
   * Hype the meter ACTUALLY moved by — the grant after the {@link CROWD_HYPE_MAX}
   * cap, so it equals `hypeGain` on an ordinary milestone, the remaining headroom
   * near the ceiling (5 from 95), and **0** on a milestone reached with the meter
   * already full. Report THIS, never `hypeGain`: at the cap the milestone is real
   * but pays nothing, and a chronicle line claiming +10 % there would be untrue.
   * The award, the threshold, the cap and the transition rule are unchanged —
   * only what the caller is allowed to say about them.
   */
  hypeAwarded: number;
  /** Hype after the grant, clamped to [0, {@link CROWD_HYPE_MAX}]. */
  hype: number;
}

/**
 * Resolve one combo transition against the crowd.
 *
 * @param currentHype   the hype the meter holds right now
 * @param previousCombo the combo count the duel last recorded
 * @param comboCount    the combo count just recorded
 */
export function crowdMomentumReward(
  currentHype: number,
  previousCombo: number,
  comboCount: number,
): CrowdMomentumReward {
  // Forward movement onto a milestone is the whole trigger. A repeated
  // evaluation of the same count, a reset to 0 and an unchanged count all fail
  // this test, which is what makes the award idempotent.
  const milestone = comboCount > previousCombo && isCrowdMomentumMilestone(comboCount);
  const hypeGain = milestone ? CROWD_MOMENTUM_HYPE_GAIN : 0;
  const safeHype = typeof currentHype === 'number' && Number.isFinite(currentHype)
    ? Math.min(CROWD_HYPE_MAX, Math.max(0, currentHype))
    : 0;
  const hype = Math.min(CROWD_HYPE_MAX, safeHype + hypeGain);
  return {
    milestone,
    hypeGain,
    // The cap is applied above, so this is the meter's real movement — the only
    // figure the caller may report as gained.
    hypeAwarded: hype - safeHype,
    hype,
  };
}
