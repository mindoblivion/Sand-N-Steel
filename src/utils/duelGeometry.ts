/**
 * ===========================================================================
 * SAND & STEEL — DUEL OPENING & Z-AXIS MOVEMENT GEOMETRY (Phase C-8.80J)
 * ===========================================================================
 *
 * The bout used to open with the two fighters at `z = ±3.5` — a 7.0 m gap that
 * no constant ever chose. It was the camera rig's framing distance, not a
 * designed engagement distance, and at 7.0 m the starter gladius (range 2.1)
 * was THREE Advances away, so the opening turns were spent walking.
 *
 * The designed opening is 3.6 m. It is still outside the starter gladius's
 * 2.1 m range, so the first legal blow remains something the player must close
 * for — but one 1.8 m Advance leaves 1.8 m, inside 2.1 m, so a single approach
 * action buys the first attack. The pair is centred on the arena origin with
 * symmetric offsets (±1.8), which is what keeps the camera rig's midpoint and
 * both fighters' facing rotations exactly where they were.
 *
 * WHAT THIS MODULE OWNS — and nothing else:
 *   • the opening separation, from which both spawn offsets are derived;
 *   • the Z-axis target formulas for `advance` and `retreat`, moved here verbatim
 *     from `DuelScene` so the spawn/movement calculation can be exercised as a
 *     pure function rather than asserted from source text.
 *
 * The movement VALUES are the shipped ones and are deliberately UNCHANGED by
 * C-8.80J: a 1.8 m step, the 1.2 m minimum gap a step may never close (bodies
 * cannot pass through each other), and the ±7.5 m retreat limit. Weapon range,
 * the 700 ms wind-up, damage, stamina, the AI's 82/18 out-of-range split, the
 * hit-stop and the C-8.80G contact calibration are owned elsewhere and are not
 * touched here.
 */

/**
 * Designed opening separation between the two fighters, in metres.
 *
 * Chosen so the opening is out of the starter gladius's reach (2.1 m) while one
 * 1.8 m Advance lands inside it (1.8 m). See the module header.
 */
export const DUEL_OPENING_SEPARATION_M = 3.6;

/**
 * Each fighter's spawn offset from the arena origin along Z.
 *
 * The player stands on +Z facing −Z, the opponent on −Z facing +Z, so the pair
 * is centred and symmetric: `2 × 1.8 = 3.6`.
 */
export const DUEL_SPAWN_OFFSET_Z = DUEL_OPENING_SEPARATION_M / 2;

/** One Advance/Retreat step along Z, in metres — the shipped value, unchanged. */
export const DUEL_MOVE_STEP_M = 1.8;

/** The minimum gap a step may never close: fighters cannot occupy one spot. */
export const DUEL_MIN_GAP_M = 1.2;

/** The arena-edge clamp on a retreat, mirrored for both fighters. */
export const DUEL_RETREAT_LIMIT_Z = 7.5;

/**
 * Where a fighter ends up after an Advance along Z.
 *
 * `direction` is the sign of travel: the player advances toward −Z (`-1`) and
 * the opponent toward +Z (`+1`). The step is clamped so the resulting separation
 * never drops below {@link DUEL_MIN_GAP_M}.
 */
export function resolveAdvanceTargetZ(
  actorZ: number,
  opponentZ: number,
  direction: -1 | 1,
): number {
  return direction < 0
    ? Math.max(opponentZ + DUEL_MIN_GAP_M, actorZ - DUEL_MOVE_STEP_M)
    : Math.min(opponentZ - DUEL_MIN_GAP_M, actorZ + DUEL_MOVE_STEP_M);
}

/**
 * Where a fighter ends up after a Retreat along Z, clamped to the arena limit.
 *
 * A retreat always moves AWAY from the opponent, so it only ever needs the
 * ±{@link DUEL_RETREAT_LIMIT_Z} clamp.
 */
export function resolveRetreatTargetZ(actorZ: number, direction: -1 | 1): number {
  return direction < 0
    ? Math.min(DUEL_RETREAT_LIMIT_Z, actorZ + DUEL_MOVE_STEP_M)
    : Math.max(-DUEL_RETREAT_LIMIT_Z, actorZ - DUEL_MOVE_STEP_M);
}
