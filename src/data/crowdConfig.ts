/**
 * C-8.70C — the crowd's tuning, in ONE place.
 *
 * Every crowd-hype number in the game lives here after this slice. The rule the
 * duel reads is `utils/crowdDynamics.ts`; this module is the data it reads, and
 * nothing in it is game logic.
 *
 * — DESIGN vs AUTHORED —
 * DESIGN values are the ones the brief names. AUTHORED values are the ones it
 * left open: each is anchored to the nearest existing number in the tree where
 * one exists (noted on the value), and every one of them is marked AUTHORED so
 * it is never mistaken for a designed number. `crowdHypeDynamics.test.ts` pins
 * each value so a later slice cannot retune one silently.
 *
 * — WHAT IS NOT MIGRATED HERE, ON PURPOSE —
 * Some hype numbers are deliberately NOT moved, because their meaning is not
 * this config's and a move would change behaviour or the shipped reading:
 *
 *   • the opening hype seed `25` and the award magnitudes `+8 / +18 / +20`
 *     (`DuelScene`) — these are award EVENTS, not tuning factors, and the CF-3
 *     suite pins them byte-identical;
 *   • the crowd's tier boundaries `40` / `75` (`utils/crowdHype.ts`) — those are
 *     CombatHUD's own reading of the meter, pinned from the HUD's source by the
 *     same suite;
 *   • the CF-3 procedural crowd-audio gains `0.015 / 0.04 / 0.075` — pinned
 *     audio design values with their own semantics.
 *
 * The one value-identical migration made here is the arena purse's crowd-favour
 * ladder (see `crowdFavour`), which IS hype tuning and was referenced by
 * `utils/duelRewards.ts` as three hard-coded constants.
 */

/** The four venue tiers the roster already publishes (`OpponentConfig.tier`). */
export type CrowdVenueTier = 1 | 2 | 3 | 4;

/** One venue tier's cooling curve. */
export interface CrowdTierTuning {
  /**
   * Hype lost per second while the crowd is simply watching.
   * AUTHORED — 1.0 at tier 1 is one landed blow's +8 over a CF-5 exchange
   * (1100 ms resolution + 750 ms think ≈ 1.85 s), so a fight that keeps trading
   * still warms while a fight that stalls visibly cools.
   */
  decayRatePerSecond: number;
  /**
   * Multiplier applied to `decayRatePerSecond` while NEITHER fighter has taken
   * an offensive action inside `passiveWindowSeconds`. AUTHORED.
   */
  passiveDecayMultiplier: number;
  /**
   * How long the sand may stay quiet before that acceleration applies, in
   * seconds. AUTHORED — two CF-5 exchanges' worth of silence.
   */
  passiveWindowSeconds: number;
}

export interface CrowdConfig {
  /** DESIGN — hype at which the crowd starts emboldening the opponent. */
  emboldenThreshold: number;
  /** DESIGN — the largest aggression shift embolden can add. */
  emboldenCap: number;
  /** DESIGN — hype at which that cap is reached. */
  emboldenFullThreshold: number;
  /** DESIGN — the shift at the threshold itself (linear to the cap). */
  emboldenFloorShift: number;
  /** DESIGN — below this in the duel's second half, the crowd turns. */
  crowdTurnedThreshold: number;
  /** The shipped hype ceiling (value-identical to the `Math.min(100, …)` cap). */
  hypeCeiling: number;
  /**
   * The purse's crowd-favour ladder, moved here value-identically from
   * `utils/duelRewards.ts` (50 / 25 / 0.1 — one 10 % step of the bounty per full
   * 25 points of peak hype above 50).
   */
  crowdFavour: {
    /** Peak hype at or below which no favour is paid. */
    floor: number;
    /** Hype per favour step. */
    step: number;
    /** One step's share of the base bounty. */
    stepRate: number;
  };
  /**
   * AUTHORED — the duel length the crowd expects, in seconds. The "second half"
   * is elapsed time against this expectation (`expectedDuelSeconds / 2` = 45 s),
   * chosen over the HP reading so the definition needs no fighter state and is
   * testable as arithmetic.
   */
  expectedDuelSeconds: number;
  /** AUTHORED — the fame multiplier applied when the crowd has turned (< 1). */
  turnedFameFactor: number;
  /** AUTHORED — the peak-fame bonus factor: base × (peak/100 × this). */
  peakFameFactor: number;
  /** AUTHORED — the peak-gold bonus factor (anchored to one favour step, 0.1). */
  peakGoldFactor: number;
  /** AUTHORED — how much hype speeds Aurelius's rage charge (rate × (1 + hype/100 × this)). */
  rageFeedFactor: number;
  /** AUTHORED — rage charge per second at hype 0 (full rage intensity in 2 s). */
  rageAccumulationPerSecond: number;
  /** Per-venue-tier cooling curves. */
  tiers: Record<CrowdVenueTier, CrowdTierTuning>;
}

export const CROWD_CONFIG: CrowdConfig = {
  // ── DESIGN (named by the brief) ──────────────────────────────────────────
  emboldenThreshold: 70,
  emboldenCap: 0.15,
  emboldenFullThreshold: 90,
  emboldenFloorShift: 0.05,
  crowdTurnedThreshold: 20,

  // ── value-identical migration ────────────────────────────────────────────
  hypeCeiling: 100,
  crowdFavour: { floor: 50, step: 25, stepRate: 0.1 },

  // ── AUTHORED ─────────────────────────────────────────────────────────────
  expectedDuelSeconds: 90,
  turnedFameFactor: 0.8,
  peakFameFactor: 0.25,
  peakGoldFactor: 0.1,
  rageFeedFactor: 0.5,
  rageAccumulationPerSecond: 0.5,

  tiers: {
    // AUTHORED — a bigger, grander house cools faster: 1.0 / 1.2 / 1.4 / 1.6 per
    // second; the passive window and its multiplier are shared by all four.
    1: { decayRatePerSecond: 1.0, passiveDecayMultiplier: 2.0, passiveWindowSeconds: 6 },
    2: { decayRatePerSecond: 1.2, passiveDecayMultiplier: 2.0, passiveWindowSeconds: 6 },
    3: { decayRatePerSecond: 1.4, passiveDecayMultiplier: 2.0, passiveWindowSeconds: 6 },
    4: { decayRatePerSecond: 1.6, passiveDecayMultiplier: 2.0, passiveWindowSeconds: 6 },
  },
};

/** The tuning for one venue tier, clamped onto 1–4 (an invalid tier reads as 1). */
export function crowdTierTuning(
  tier: number | undefined,
  config: CrowdConfig = CROWD_CONFIG,
): CrowdTierTuning {
  const rounded = typeof tier === 'number' && Number.isFinite(tier) ? Math.round(tier) : 1;
  const clamped = Math.min(4, Math.max(1, rounded)) as CrowdVenueTier;
  return config.tiers[clamped];
}
