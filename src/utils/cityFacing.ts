/**
 * Convert a world-space movement direction to the city gladiator's model yaw.
 *
 * The shipped Roman rig's forward axis is local -Z. Therefore yaw 0 faces -Z
 * and yaw PI faces +Z (the city spawn's direction toward the south gate). The
 * inverse-vector atan2 keeps the rendered body facing the direction it travels.
 */
export function getCityFacingYaw(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}
