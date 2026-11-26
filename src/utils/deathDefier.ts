/**
 * ===========================================================================
 * PHASE2-FATECON-2 — Death Defier: once per bout, survive an otherwise
 * fatal blow with a sliver of health.
 * Pure helpers only — no React, no storage — so `DuelScene` (the defiance
 * branch) and the tests call the SAME function.
 *
 * The rule: the first time a blow would reduce the PLAYER to 0 HP, they do
 * not die. The death beat plays — the blow lands, the damage numbers,
 * hit-stop and crowd all fire exactly as today — and then, before the
 * defeat write, the defiance fires: their HP is set to 1, the sliver the
 * card promises. The second time they reach 0 HP, they die like any
 * fighter. Once per bout; the defiance can never chain.
 *
 * ── WHY THE DECISION IS PURE AND THE EFFECT IS NOT ─────────────────────────
 * Whether the defiance fires is a fact about the blow (`fightEnded`), the
 * card (`ownsDeathDefier`) and the duel's own memory (`deathDefied`) — all
 * of it knowable without touching state, so the predicate lives here and
 * is pinned by deterministic tests. The effect — the HP write, the ref,
 * the banner — lives in `DuelScene`'s damage-resolution site, in the same
 * synchronous dispatch as the killing blow's own HP write, because the
 * defeat effect reads `player.health` after that commit: the defiance
 * must leave the health at 1 before any defeat write can run. A defiance
 * dispatched a tick later would lose the race to the result flow. This
 * mirrors the Second Rising's race exactly (`secondRising.ts`).
 *
 * ── WHY `fightEnded` IS THE WHOLE FATALITY ─────────────────────────────────
 * `fightEnded` is computed on the landed blow (main blow, then the Twin
 * Fangs bonus if it lands) from the defender's health at dispatch. It is
 * the only fatality the duel knows: the arena hazard floors its victim at
 * 1 HP (`triggerHazardEffect`: `Math.max(1, ...)`), so a hazard can never
 * be the killing blow, and no other damage source exists inside one
 * dispatch. A defiance that keyed on anything narrower would miss the
 * bonus blade; a defiance that keyed on anything wider would fire on a
 * scratch. The defiance READS `fightEnded`, never recomputes it.
 * ===========================================================================
 */

export interface DeathDefierInput {
  /** Whether the player owns the Death Defier card. */
  ownsDeathDefier: boolean;
  /** True only when the PLAYER struck the blow — the defiance is the player's, not the opponent's. */
  isActorPlayer: boolean;
  /** Whether Death Defier has already fired this bout. Once per bout, never twice. */
  deathDefied: boolean;
  /** Whether this landed blow ended the fight — the fatality, as computed. */
  fightEnded: boolean;
}

/**
 * Does Death Defier fire on this blow? True only when every condition
 * holds: the player owns the card, the blow was struck by the opponent
 * (the player is the defender), by a blow that ended the fight, and the
 * defiance has not fired yet this bout.
 */
export function shouldDeathDefy(input: DeathDefierInput): boolean {
  return (
    input.ownsDeathDefier === true &&
    input.isActorPlayer === false &&
    input.deathDefied === false &&
    input.fightEnded === true
  );
}

/**
 * The HP the defiance leaves: exactly 1 — the card's "sliver", and the
 * codebase's existing floor (arena hazards floor their victim at 1 HP).
 * The next hit kills unless the player acts.
 */
export const DEATH_DEFIER_SLIVER_HP = 1;

/** The banner the defiance announces itself under. */
export const DEATH_DEFIER_BANNER_TEXT = 'DEATH DEFIED';
