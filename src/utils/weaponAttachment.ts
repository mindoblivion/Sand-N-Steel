/**
 * ===========================================================================
 * SAND & STEEL — BONE-ATTACHED EQUIPMENT SCALE (Phase C-8.80E)
 * ===========================================================================
 *
 * Every fighter root group in `GladiatorMesh` carries
 *
 *     scale = fighter.meshScale × MODEL_SCALE_CORRECTIONS[characterModel]
 *
 * `MODEL_SCALE_CORRECTIONS` exists for exactly one purpose: the four
 * alternative character bodies are authored ~1.70-1.83 units of visible height
 * while `arena_roman` renders ~1.10, so each alternative is multiplied DOWN
 * (0.60-0.77) to match the default gladiator's rendered height. It is a
 * body-normalisation factor, not a fighter-size factor — `meshScale` is the
 * boss/opponent scale and is the only thing that makes a whole fighter larger.
 *
 * Anything attached to a hand bone inherits the root group's scale, so it also
 * inherits that normalisation. Equipment whose world-space size must not depend
 * on which body is wearing it — the shield always did, and the weapon now does —
 * divides the correction back out here. Combat reach is world-space
 * (`getWeaponRange`: gladius 2.1, dagger 1.6, spatha 2.4), so a weapon that
 * shrinks with the body falls visibly short of a legal strike on that body
 * alone.
 *
 * Measured before C-8.80E (real assets, `Fighting_Idle`, right hand): the same
 * 1.000-unit gladius rendered **1.000** world units on `arena_roman` (correction
 * 1.00) but **0.600** on `dimachaerus` and `amazonian` (correction 0.60) and
 * **0.770** on `minotaur` (0.77) — a 40 % reach deficit on a body of identical
 * rendered height. The shield, which already divides the correction out, stayed
 * 0.6095 world units tall on all five bodies.
 */
export function attachmentScaleForModelCorrection(modelCorrection: number): number {
  const correction =
    typeof modelCorrection === 'number' && Number.isFinite(modelCorrection) && modelCorrection > 0
      ? modelCorrection
      : 1;
  return 1 / correction;
}
