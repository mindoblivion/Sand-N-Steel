/**
 * ===========================================================================
 * TIER-8 — Scaevola the Twice-Slain: the Second Rising.
 * Pure helpers only — no React, no storage — so `DuelScene` (the rise branch)
 * and the tests call the SAME function.
 *
 * The rule: the first time a blow would reduce Scaevola to 0 HP, he does not
 * die. The death beat plays — the blow lands, the damage numbers, hit-stop
 * and crowd all fire exactly as today — and then, before the victory write,
 * the rise fires: his HP is set to 50 % of maximum, his stamina is restored
 * to full, and he is Phase 2 for the rest of the duel. The second time he
 * reaches 0 HP, he dies like any boss. Once per duel; the rise can never
 * chain.
 *
 * ── WHY THE DECISION IS PURE AND THE EFFECT IS NOT ─────────────────────────
 * Whether the rise fires is a fact about the blow (`fightEnded`), the row
 * (`bossMechanic`) and the duel's own memory (`risen`) — all of it knowable
 * without touching state, so the predicate lives here and is pinned by
 * deterministic tests. The effect — the HP write, the ref, the banner — lives
 * in `DuelScene`'s damage-resolution site, in the same synchronous dispatch
 * as the killing blow's own HP write, because the victory effect reads
 * `opp.health` after that commit: the rise must leave the health at 50 %
 * before any victory write can run. A rise dispatched a tick later would
 * lose the race to the result flow.
 *
 * ── WHY `fightEnded` IS THE WHOLE FATALITY ─────────────────────────────────
 * `fightEnded` is computed on the landed blow (main blow, then the Twin
 * Fangs bonus if it lands) from the defender's health at dispatch. It is
 * the only fatality the duel knows: the arena hazard floors its victim at
 * 1 HP (`triggerHazardEffect`: `Math.max(1, ...)`), so a hazard can never
 * be the killing blow, and no other damage source exists inside one
 * dispatch. A rise that keyed on anything narrower would miss the bonus
 * blade; a rise that keyed on anything wider would fire on a scratch.
 * ===========================================================================
 */

import { BOSS_PHASE_THRESHOLD } from '../data/bossPhases';
import type { BossMechanic } from '../types/game';

export interface SecondRisingInput {
  /** The row's mechanic. Only `second_rising` ever rises. */
  bossMechanic: BossMechanic | undefined;
  /** The defender is a boss row. A regular carrying the string never rises. */
  isBoss: boolean;
  /** True only when the PLAYER struck the blow — the rise is his, not ours. */
  isActorPlayer: boolean;
  /** Whether the rise has already fired this duel. Once per duel, never twice. */
  risen: boolean;
  /** Whether this landed blow ended the fight — the fatality, as computed. */
  fightEnded: boolean;
}

/**
 * Does the Second Rising fire on this blow? True only when every condition
 * holds: a boss row carrying `second_rising`, struck by the player, by a blow
 * that ended the fight, and not yet risen this duel.
 */
export function shouldSecondRise(input: SecondRisingInput): boolean {
  return (
    input.bossMechanic === 'second_rising' &&
    input.isBoss === true &&
    input.isActorPlayer === true &&
    input.risen === false &&
    input.fightEnded === true
  );
}

/**
 * The HP the rise leaves: exactly the phase line (50 % of maximum), floored
 * to a whole number — the given `BOSS_PHASE_THRESHOLD`, not a second
 * constant, so Phase 2 IS the risen state and no second threshold exists.
 */
export function secondRisingHealth(healthMax: number): number {
  if (!Number.isFinite(healthMax) || healthMax <= 0) return 0;
  return Math.floor(healthMax * BOSS_PHASE_THRESHOLD);
}
