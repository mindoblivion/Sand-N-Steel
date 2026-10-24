/**
 * ===========================================================================
 * SAND & STEEL — ATTACK CONTACT-PHASE CALIBRATION (Phase C-8.80G)
 * ===========================================================================
 *
 * The duel resolves damage at a FIXED time: the player's swing is committed at
 * the tap, the animation starts, and the blow lands one
 * {@link PLAYER_ATTACK_WINDUP_MS} (700 ms) later. The animation clips were not
 * authored against that window, so each one reaches its intended contact frame
 * at its own time — and at rate 1 it is already recovering by the time damage
 * resolves.
 *
 * MEASURED (throwaway harness, real `arena_roman.glb` / `gladius.glb` through a
 * real `AnimationMixer`, the shipped hierarchy: root scale = meshScale × body
 * correction, the gladius on `hand_r` inside the C-8.80E attachment group, the
 * defender on `Fighting_Idle` at the legal gladius distance of 2.1 with roots at
 * ±1.05). Contact = the clip time at which the blade TIP's world position is
 * closest to the defender's nearest skinned vertex:
 *
 *   clip                | duration | contact  | tip-to-defender at 700 ms
 *   --------------------|----------|----------|--------------------------
 *   Sword_Attack        |  1.917 s |  519 ms  | 2.032 (2.6x the contact gap)
 *   Sword_Regular_C     |  1.667 s |  659 ms  | 1.673 (2.9x the contact gap)
 *
 * The same measurement on all five shipped bodies (arena_roman 1.00, amazonian
 * 0.61, dimachaerus 0.60, minotaur 0.77, netfighter 0.60) lands within 6 ms of
 * those figures — 517-523 ms and 659-661 ms — so the contact phase belongs to
 * the CLIP, not to the model wearing it, and one constant per clip is the
 * correct granularity. There is deliberately no universal multiplier: the two
 * clips disagree by far more than that spread.
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
 */
export const ATTACK_CLIP_CONTACT_MS: Readonly<Record<string, number>> = {
  /** Light attack: the forward cut's closest approach to the defender. */
  Sword_Attack: 519,
  /** Heavy attack: the overhead smash's closest approach. */
  Sword_Regular_C: 659,
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
