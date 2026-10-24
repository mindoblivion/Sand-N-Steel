/**
 * CF-3 — the crowd's response to hype.
 *
 * Pure, dependency-free helpers shared by the duel scene (which owns
 * `crowdHype`), the arena crowd (which bounces) and the audio bed (which
 * changes level). Keeping the thresholds and the curve here means the test
 * suite drives the real logic instead of re-implementing it, and there is one
 * place to read the rule.
 *
 * ── THE TIER RULE ─────────────────────────────────────────────────────────
 * These boundaries are exactly CombatHUD's own reading:
 *
 *     crowdHype > 75 ? 'MAX' : crowdHype > 40 ? 'HIGH' : 'LOW'
 *
 * so both comparisons are STRICT. A hype of exactly 40 is still LOW and
 * exactly 75 is still HIGH — the crossing happens on the value that passes the
 * boundary (41 and 76). That keeps the crowd's reaction in sync with the meter
 * the player is looking at; `crowdHype.test.ts` §A pins the HUD expression
 * itself so the two can never drift apart.
 */

/** The LOW → HIGH boundary, unchanged by CF-3 — named so it is not duplicated. */
export const CROWD_HYPE_TIER_HIGH = 40;
/** The HIGH → MAX boundary, unchanged by CF-3. */
export const CROWD_HYPE_TIER_MAX = 75;

/** LOW = 0, HIGH = 1, MAX = 2 — the audio bed's three levels. */
export type CrowdHypeTier = 0 | 1 | 2;

/** The HUD's own tier reading, as a number the audio bed can index. */
export function crowdHypeTier(hype: number): CrowdHypeTier {
  if (hype > CROWD_HYPE_TIER_MAX) return 2;
  if (hype > CROWD_HYPE_TIER_HIGH) return 1;
  return 0;
}

export interface CrowdHypeCrossing {
  /** The tier the hype has arrived in. */
  level: CrowdHypeTier;
  /** True only when the hype moved UP into this tier. */
  upward: boolean;
}

/**
 * The one event updateCrowdHype reacts to: the hype changed tier.
 * Returns null while the tier is unchanged (most updates).
 */
export function detectCrowdHypeCrossing(prev: number, next: number): CrowdHypeCrossing | null {
  const from = crowdHypeTier(prev);
  const to = crowdHypeTier(next);
  if (from === to) return null;
  return { level: to, upward: to > from };
}

// ── The celebration bounce ────────────────────────────────────────────────
/** Design value: the crowd rises 0.12 world units at the peak. */
export const CROWD_BOUNCE_AMPLITUDE = 0.12;
/** Design value: the whole bounce settles within 600 ms. */
export const CROWD_BOUNCE_DURATION_MS = 600;
/** Two decaying hops read as a crowd surge rather than a single lift. */
export const CROWD_BOUNCE_HOPS = 2;
/** Each hop rises to this fraction of the one before it. */
export const CROWD_BOUNCE_HOP_DECAY = 0.35;

/**
 * Vertical offset of the crowd group at `elapsedMs` into a celebration.
 *
 * Each hop is its own half-sine scaled by `HOP_DECAY^hop`, so the FIRST hop's
 * crown is exactly `CROWD_BOUNCE_AMPLITUDE` — 0.12 at 150 ms — and the second
 * rises to 0.35 of it (0.042 at 450 ms): a bounce that decays, rather than a
 * single lift with a fading envelope. It is 0 before the pulse, 0 at every
 * hop boundary, and 0 from 600 ms on.
 */
export function crowdBounceOffset(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  if (elapsedMs >= CROWD_BOUNCE_DURATION_MS) return 0;
  const scaled = (elapsedMs / CROWD_BOUNCE_DURATION_MS) * CROWD_BOUNCE_HOPS;
  const hopIndex = Math.floor(scaled);
  const hopPhase = scaled - hopIndex;
  const hopAmplitude = CROWD_BOUNCE_AMPLITUDE * Math.pow(CROWD_BOUNCE_HOP_DECAY, hopIndex);
  return hopAmplitude * Math.sin(Math.PI * hopPhase);
}

/**
 * The bounce's per-frame state, held in a ref so a celebration costs no React
 * render: the arena compares the pulse counter every frame and starts a new
 * bounce only when it changes.
 */
export interface CrowdBounce {
  seenPulse: number;
  /** Milliseconds into the current bounce, or null when nothing is playing. */
  ageMs: number | null;
}

export function createCrowdBounce(pulse: number): CrowdBounce {
  return { seenPulse: pulse, ageMs: null };
}

/**
 * Advance one frame and return the crowd group's `position.y`.
 * A changed pulse starts a fresh bounce; otherwise the current one keeps
 * running and settles to 0. Mutates `bounce` in place (no allocation per frame).
 */
export function stepCrowdBounce(bounce: CrowdBounce, pulse: number, deltaMs: number): number {
  if (pulse !== bounce.seenPulse) {
    bounce.seenPulse = pulse;
    bounce.ageMs = 0;
  }
  if (bounce.ageMs === null) return 0;
  bounce.ageMs += Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
  const offset = crowdBounceOffset(bounce.ageMs);
  if (bounce.ageMs >= CROWD_BOUNCE_DURATION_MS) bounce.ageMs = null;
  return offset;
}
