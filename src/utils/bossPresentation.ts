/**
 * CF-6 — boss presentation moments (bosses only).
 *
 * The five boss mechanics were in the game with sound and a log line apiece;
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
 * so every boss-moment presentation site is a no-op for it. (COMBAT-3 adds one
 * narrower gate, `presentsTelegraphGlow`, for the glow alone — see below.)
 *
 * `bossPresentationMoments` is the same rule read the other way round — the
 * complete list of moments an opponent's identity owns — which is what makes
 * the acceptance core testable as an explicit negative: a standard duel's list
 * is empty, so none of the four effects can fire.
 *
 * COMBAT-3 — the ONE exception to "a standard opponent presents nothing" is
 * the telegraph glow, and it is not a fifth moment: `presentsTelegraphGlow`
 * below answers a narrower question — may this opponent's mesh glow while a
 * telegraph is live? A regular's announced power (COMBAT-3) glows because the
 * telegraph itself is live; a boss still glows only through its own
 * `heavy_telegraph` moment. The moment entitlement above is untouched: a
 * standard opponent still owns no moment and `bossPresentsMoment` still
 * answers false for it on every mechanic.
 */
import type { BossMechanic, LadderBossMechanic, OpponentConfig } from '../types/game';

/** The five boss moments, as the presentation layer names them. */
export type BossMoment = 'rage' | 'telegraph' | 'phaseSwitch' | 'counter' | 'secondRising';

/** Which presentation moment each boss mechanic owns. */
const MOMENT_BY_MECHANIC: Record<LadderBossMechanic, BossMoment> = {
  rage_mode_colossus: 'rage',
  heavy_telegraph: 'telegraph',
  phase_weapon_switch: 'phaseSwitch',
  counter_dodge: 'counter',
  second_rising: 'secondRising',
};

/**
 * D-1 — is this one of the FIVE mechanics the duel actually runs?
 *
 * `OpponentConfig.bossMechanic` also accepts the five feature-bout mechanics,
 * which are inert data in this slice. The moment table and the presentation gate
 * are keyed on the ladder five only, so a feature mechanic can neither own a
 * moment nor present one. TIER-8's `second_rising` is a ladder mechanic carried
 * on a feature bout's row, so it owns a moment — the row's feature status does
 * not strip it.
 */
export function isLadderBossMechanic(
  mechanic: BossMechanic | undefined
): mechanic is LadderBossMechanic {
  return (
    mechanic === 'rage_mode_colossus' ||
    mechanic === 'heavy_telegraph' ||
    mechanic === 'phase_weapon_switch' ||
    mechanic === 'counter_dodge' ||
    mechanic === 'second_rising'
  );
}

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
  if (!isLadderBossMechanic(mechanic)) return false;
  return opponent.bossMechanic === mechanic;
}

/**
 * Every boss moment this opponent's identity owns. A standard opponent answers
 * `[]` — which is the explicit negative assertion the boss gating stands on.
 */
export function bossPresentationMoments(
  opponent: BossGateInput | null | undefined,
): BossMoment[] {
  if (!opponent || opponent.isBoss !== true) return [];
  // D-1 — a FEATURE boss's mechanic owns no presentation moment: the moments
  // below belong to the ladder mechanics and nothing else, so a feature bout
  // presents exactly as a standard boss until its D-slice. TIER-8 is the one
  // exception the rule names: `second_rising` is a LADDER mechanic, so the
  // feature row that carries it owns its moment like any ladder boss.
  const ladderMechanic = opponent.bossMechanic;
  if (!isLadderBossMechanic(ladderMechanic)) return [];
  const moment = MOMENT_BY_MECHANIC[ladderMechanic];
  return moment ? [moment] : [];
}

/**
 * COMBAT-3 — may this opponent's mesh glow while a telegraph is live?
 *
 * The glow is the announced heavy's tell, not a boss perk, so the gate is
 * wider than `bossPresentsMoment` by exactly one case:
 * - a boss glows only through its own `heavy_telegraph` moment (Goliath, and
 *   the Deserter who carries it) — Varro's feint, Valéria's counter, Ignis's
 *   switch and Aurelius's rage still read false here, exactly as CF-6 pins;
 * - a regular opponent glows, because its announced power IS a telegraph
 *   (see `regularTelegraph.ts`): the banner is up, the blow is coming, and
 *   the pulse is what makes that readable at a glance.
 * Tolerates `undefined`/`null` (no opponent, no glow).
 */
export function presentsTelegraphGlow(
  opponent: BossGateInput | null | undefined,
): boolean {
  if (!opponent) return false;
  if (opponent.isBoss === true) return bossPresentsMoment(opponent, 'heavy_telegraph');
  return true;
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

// ── Second Rising (TIER-8) ─────────────────────────────────────────────────
/**
 * The banner words the rise fires: the first blow that would kill Scaevola
 * does not, and the sand gives him back under these words. One literal, read
 * by the duel's rise branch and pinned by `secondRising.test.ts` — the banner
 * text lives here, not as a second literal in the scene.
 */
export const SECOND_RISING_BANNER_TEXT = 'HE RISES';

/**
 * Shake energy the CF-1 rig receives when Scaevola rises — the same 0.5 kick
 * the rage and the phase transition use, written into the SAME
 * `impactRef.trauma` the landed-blows table uses (capped at 1 by that write).
 * A named constant of its own, not the rage's: the rise is its own moment.
 */
export const SECOND_RISING_TRAUMA = 0.5;

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
