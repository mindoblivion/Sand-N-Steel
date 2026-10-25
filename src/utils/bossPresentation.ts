/**
 * CF-6 — boss presentation moments (bosses only).
 *
 * The four boss mechanics were in the game with sound and a log line apiece;
 * this module holds the *entitlement* rule and the presentation numbers their
 * missing moments use, so the duel itself stays a call apiece and the boss
 * gating can be asserted without a canvas.
 *
 * ── WHAT THIS IS, AND WHAT IT IS NOT ──────────────────────────────────────
 * It is NOT a second copy of the mechanic triggers. When a rage ignites, when a
 * telegraph goes up, when the phase flips and when the Viper slips are decided
 * exactly where they always were — `shouldActivateRage`, the `'telegraph'`
 * action + `pendingHeavyAttackRef`, `phaseSwitchedRef`'s effect and
 * `pendingCounterRef` — and none of those rates, thresholds, timings or damage
 * numbers changed. This module answers only the other half of the question:
 * **is this opponent allowed to *present* the moment at all?** A boss is (its
 * config carries `isBoss: true` and the mechanic); a standard opponent is not,
 * so every presentation site is a no-op for it.
 *
 * `bossPresentationMoments` is the same rule read the other way round — the
 * complete list of moments an opponent's identity owns — which is what makes
 * the acceptance core testable as an explicit negative: a standard duel's list
 * is empty, so none of the four effects can fire.
 */
import type { BossMechanic, OpponentConfig } from '../types/game';

/** The four boss moments, as the presentation layer names them. */
export type BossMoment = 'rage' | 'telegraph' | 'phaseSwitch' | 'counter';

/** Which presentation moment each boss mechanic owns. */
const MOMENT_BY_MECHANIC: Record<BossMechanic, BossMoment> = {
  rage_mode_colossus: 'rage',
  heavy_telegraph: 'telegraph',
  phase_weapon_switch: 'phaseSwitch',
  counter_dodge: 'counter',
};

/** The opponent fields the boss gate reads — nothing else is consulted. */
export type BossGateInput = Pick<OpponentConfig, 'isBoss' | 'bossMechanic'>;

/**
 * May this opponent present `mechanic`'s moment? True only when the config is
 * a boss AND that boss owns this mechanic — the hard acceptance gate of CF-6.
 * Tolerates `undefined` (a standard opponent built without the field).
 */
export function bossPresentsMoment(
  opponent: BossGateInput | null | undefined,
  mechanic: BossMechanic,
): boolean {
  if (!opponent || opponent.isBoss !== true) return false;
  return opponent.bossMechanic === mechanic;
}

/**
 * Every boss moment this opponent's identity owns. A standard opponent answers
 * `[]` — which is the explicit negative assertion the boss gating stands on.
 */
export function bossPresentationMoments(
  opponent: BossGateInput | null | undefined,
): BossMoment[] {
  if (!opponent || opponent.isBoss !== true || !opponent.bossMechanic) return [];
  const moment = MOMENT_BY_MECHANIC[opponent.bossMechanic];
  return moment ? [moment] : [];
}

// ── Rage ───────────────────────────────────────────────────────────────────
/**
 * Shake energy the CF-1 rig receives when a boss's rage ignites. One flat kick,
 * written into the SAME `impactRef.trauma` the landed-blows table uses (capped
 * at 1 by that write), so the existing decay runs it out in ~0.31 s and no new
 * shake system exists.
 */
export const BOSS_RAGE_TRAUMA = 0.5;

/** The HUD's red vignette pulse length, in ms — the CSS animation's duration. */
export const BOSS_VIGNETTE_MS = 700;

// ── Telegraph ──────────────────────────────────────────────────────────────
/** The boss mesh's telegraph emissive colour. */
export const TELEGRAPH_GLOW_COLOR = '#ff2222';

/** Pulses per second of the telegraph emissive. */
export const TELEGRAPH_GLOW_HZ = 2;

/** Emissive intensity at the trough of the pulse (never fully dark). */
export const TELEGRAPH_GLOW_MIN = 0.25;

/** Emissive intensity at the crest — the same peak the hit flash uses (0.8). */
export const TELEGRAPH_GLOW_MAX = 0.8;

/**
 * The telegraph emissive intensity at time `t` (seconds): a continuous 2 Hz
 * sine between `TELEGRAPH_GLOW_MIN` and `TELEGRAPH_GLOW_MAX`. Pure, so the pulse
 * shape can be pinned without a renderer; a non-finite `t` reads as the trough.
 */
export function telegraphGlowIntensity(t: number): number {
  if (!Number.isFinite(t)) return TELEGRAPH_GLOW_MIN;
  const wave = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * TELEGRAPH_GLOW_HZ);
  return TELEGRAPH_GLOW_MIN + (TELEGRAPH_GLOW_MAX - TELEGRAPH_GLOW_MIN) * wave;
}
