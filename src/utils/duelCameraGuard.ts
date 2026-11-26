/**
 * ===========================================================================
 * PHASE1-CAMGUARD — Duel camera guard: the separation-aware distance floor.
 *
 * The duel camera frames the midpoint of the two fighters' STATE positions.
 * In over-shoulder mode at the opening face-off (7.0 m separation) the
 * player's own fighter sits 46.8° off the view axis against a 22.5°
 * vertical half-FOV — entirely out of frame until the fighters close. The
 * loss is angular, and the angle is governed by the camera's distance from
 * the midpoint, so the fix is one number: the camera's distance from the
 * midpoint is at least separation / 2 + DUEL_CAMERA_MIN_BEYOND_FIGHTER.
 *
 * At spawn (S = 7) the floor raises over-shoulder from 4.2 to 6.0, which
 * brings the near fighter's head from 46.8° to 19.3° off-axis (margin 3.2°)
 * and the side-yaw case from 39.8° to 30.3° (margin 6.1° against the 36.4°
 * horizontal half-FOV). It bites only when S > 3.4 in over-shoulder — i.e.
 * only while the fighters are OUT of spear range; in range the mode
 * distance already exceeds the floor and the camera is untouched. In
 * cinematic and isometric the floor is inert at every separation (their
 * minimum distances, 7.78 and 10.28, exceed the floor's maximum, 6.0).
 *
 * Pure, no allocation. This module does NOT do occlusion — the rig calls
 * the shipped `resolveCameraCollision` directly for that. The floor sets
 * the outer bound; the resolver can only pull in.
 * ===========================================================================
 */

/**
 * PHASE1-CAMGUARD — how far beyond the nearer fighter the duel camera must
 * sit, in world units. 2.5 fixes the default-pitch spawn loss and only
 * bites out of spear range (see the header); 3.0 would also fix the
 * full-pitch-up spawn corner but would pull the over-shoulder camera out
 * during ordinary in-range fighting (S > 2.4).
 */
export const DUEL_CAMERA_MIN_BEYOND_FIGHTER = 2.5;

/**
 * PHASE1-CAMGUARD — the separation-aware distance floor: the camera's
 * distance from the fighters' midpoint is at least separation / 2 + 2.5.
 * Separation is |player.z − opp.z| — range is purely |ΔZ| (gap map §3).
 * Pure, no allocation.
 */
export function duelCameraFloorDistance(currentDist: number, separation: number): number {
  return Math.max(currentDist, separation / 2 + DUEL_CAMERA_MIN_BEYOND_FIGHTER);
}
