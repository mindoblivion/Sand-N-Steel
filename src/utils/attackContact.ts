/**
 * ===========================================================================
 * SAND & STEEL — ATTACK CONTACT-PHASE CALIBRATION (Phase C-8.80G, corrected by
 * C-8.81D)
 * ===========================================================================
 *
 * The duel resolves damage at a FIXED time: the player's swing is committed at
 * the tap, the animation starts, and the blow lands one
 * {@link PLAYER_ATTACK_WINDUP_MS} (700 ms) later. The animation clips were not
 * authored against that window, so each one reaches its intended contact frame
 * at its own time — and at rate 1 it is already recovering by the time damage
 * resolves.
 *
 * HOW THE CONTACT FRAME IS MEASURED (C-8.81D — the C-8.80G proxy was invalid)
 *
 * C-8.80G sampled `attachment.localToWorld((0, box.max.y, 0))` and called it the
 * blade tip. It is not: `box.max.y` is a length in the gladius SCENE's space,
 * while the call interprets the point in the ATTACHMENT group's space, and the
 * attachment carries the C-8.80E orientation group (+90° about X) so the blade
 * leaves the grip along that group's +Z, not its +Y. At the fighting idle the
 * proxy sat **1.4132** world units from the real point of the sword, which is why
 * the old constants drifted to the tail of each swing.
 *
 * The measurement now follows the actual blade point through the complete
 * animated world transform — `utils/bladeTip`'s `bladeTipWorld`, i.e. the
 * geometry-space vertex with the greatest Y (the sword's point) pushed through
 * `mesh.localToWorld` after the whole chain is current: geometry → mesh node →
 * orientation group → attachment scale → animated `hand_r` bone → the attacker's
 * root (position, yaw, `meshScale × correction`). Verified on the shipped assets:
 * the point is 0.9996 from the pommel (C-8.80E's 1.000 world-unit blade) and the
 * pommel sits 0.0017 from the hand bone's origin.
 *
 * Contact = the clip time at which that tip's world position is closest to the
 * defender's nearest skinned vertex, measured with the defender on
 * `Fighting_Idle` at 0.4. Reported at the **legal engagement distance of 1.8 m**
 * (the 3.6 m opening less one 1.8 m Advance — the distance of the first legal
 * attack), because at the 2.1 m maximum the tip never reaches the body at all
 * (0.281 / 0.203 short) and "closest approach" there is not a contact pose.
 *
 *   clip                | duration | contact  | tip-to-defender at contact
 *   --------------------|----------|----------|---------------------------
 *   Sword_Attack        |  1.917 s |  546 ms  | 0.007 at 1.8 m (0.179 at 1.2 m)
 *   Sword_Regular_C     |  1.667 s |  698 ms  | 0.007 at 1.8 m (0.126 at 1.2 m)
 *
 * At the shipped 700 ms impact and rate 1 the same tip is 0.519 / 0.828 away, so
 * the C-8.80F symptom the calibration exists to remove is measured, not assumed.
 *
 * The contact phase belongs to the CLIP, not to the body: measured on the second
 * shipped rig (`minotaur.glb`, correction 1.256) the same two minima land at
 * 545 ms and 699 ms at 1.8 m, inside one 60 Hz frame, so one constant per clip is
 * the correct granularity. There is deliberately no universal multiplier.
 *
 * HOW THE RATE IS DERIVED
 *
 * Two one-frame offsets sit either side of the 700 ms impact, and they cancel:
 *
 *   • {@link ATTACK_CLIP_START_LAG_MS} — the action's `play()` runs in the
 *     effect that follows the state commit, and drei's mixer advances on the
 *     NEXT frame, so the clip's clock starts up to one frame after the tap.
 *   • {@link HIT_STOP_SAMPLE_LAG_MS} — the impact fires between frames, and
 *     `GladiatorMesh` applies the hit-stop's `mixer.timeScale = 0` in its own
 *     `useFrame`, which runs AFTER the mixer's update; the pose the hit-stop
 *     holds is therefore the frame boundary at or just after the impact.
 *
 * So a calibrated clip must reach its contact frame one wind-up after the tap,
 * and its playback rate is simply `contact / window`. `mixer.timeScale` stays
 * the hit-stop's own channel (it multiplies the action's rate, so the freeze
 * still stops the clip exactly where it is) — this phase never touches it.
 *
 * Both constants stay strictly inside the 700 ms wind-up (546 and 698), so the
 * calibrated rates remain below 1 (0.78 and 0.9971) and no other timer, rule or
 * sequencing constant had to move.
 *
 * WHAT THIS DOES NOT CHANGE
 *
 * Combat timing and balance are untouched: the 700 ms wind-up, the 1100 ms turn
 * window, damage, range, stamina, the AI, the defensive stances, the hit-stop
 * durations and the C-8.80E weapon attachment all stay exactly as they were.
 * Only the rate at which an attack CLIP plays is calibrated, and only for the
 * clips measured above; every other action plays at 1.
 */

import type { FighterAction } from '../types/game';
import { PLAYER_ATTACK_WINDUP_MS } from './combatCalculations';

/** One frame at 60 Hz — the unit both scheduling offsets below are stated in. */
export const ATTACK_FRAME_MS = 1000 / 60;

/**
 * The clip's clock starts up to one frame after the commit: `play()` is called
 * from the effect that follows the React commit, and the mixer that advances it
 * runs in the frame loop's own callback.
 */
export const ATTACK_CLIP_START_LAG_MS = ATTACK_FRAME_MS;

/**
 * The hit-stop holds the pose sampled at the first frame boundary at or after
 * the impact (see the module header), i.e. up to one frame after the timer.
 */
export const HIT_STOP_SAMPLE_LAG_MS = ATTACK_FRAME_MS;

/**
 * Measured clip time of each attack clip's intended contact frame, in ms.
 *
 * Sword_Attack is the light attack's first mapped clip and Sword_Regular_C the
 * heavy attack's, for every shipped body — `resolveActionClip` picks them on all
 * five. A clip with no entry here plays at rate 1.
 *
 * Both values are the true blade tip's closest approach to the defender on the
 * shipped `roman_warrior` body at 1.8 m (C-8.81D). The C-8.80G proxy's figures
 * (519 / 659) are recorded in the module header only as the defect they were.
 */
export const ATTACK_CLIP_CONTACT_MS: Readonly<Record<string, number>> = {
  /** Light attack: the diagonal cut landing on the defender's chest. */
  Sword_Attack: 546,
  /** Heavy attack: the overhead smash's lowest, deepest contact. */
  Sword_Regular_C: 698,
};

/**
 * The playback window a calibrated clip must fill, in ms.
 *
 * The 700 ms wind-up, corrected for the two one-frame scheduling offsets above,
 * which cancel exactly. Exposed (rather than inlined) so the derivation is
 * testable and a future timing change flows through instead of silently
 * re-scaling every calibrated clip.
 */
export function attackContactWindowMs(windupMs: number = PLAYER_ATTACK_WINDUP_MS): number {
  const windup =
    typeof windupMs === 'number' && Number.isFinite(windupMs) && windupMs > 0
      ? windupMs
      : PLAYER_ATTACK_WINDUP_MS;
  const window = windup - ATTACK_CLIP_START_LAG_MS + HIT_STOP_SAMPLE_LAG_MS;
  return window > 1 ? window : windup;
}

/**
 * The rate an attack clip plays at so its contact frame lands on the impact.
 *
 * `1` for a clip with no measured contact time (and for an unusable one), so an
 * uncalibrated clip keeps playing exactly as it always did.
 */
export function attackPlaybackRateForClip(
  clipName: string,
  windupMs: number = PLAYER_ATTACK_WINDUP_MS,
): number {
  const contact = ATTACK_CLIP_CONTACT_MS[clipName];
  if (typeof contact !== 'number' || !Number.isFinite(contact) || contact <= 0) return 1;
  return contact / attackContactWindowMs(windupMs);
}

/**
 * The rate `GladiatorMesh` applies to the action it is about to play.
 *
 * Only the two striking actions are calibrated: idle, walk, block, dodge, hit
 * and death keep the shipped 1x playback, so nothing about their feel changes.
 */
export function attackPlaybackRateForAction(
  action: FighterAction,
  clipName: string,
  windupMs: number = PLAYER_ATTACK_WINDUP_MS,
): number {
  if (action !== 'attack_light' && action !== 'attack_heavy') return 1;
  return attackPlaybackRateForClip(clipName, windupMs);
}
