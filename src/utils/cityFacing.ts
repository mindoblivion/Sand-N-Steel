/**
 * Convert a world-space movement direction to the city gladiator's model yaw.
 *
 * CityCamera defines forward as (sin(yaw), cos(yaw)) and places the camera at
 * playerPosition - forward * distance. The character rig therefore faces along
 * local +Z at yaw 0; yaw PI faces -Z, keeping the chase camera behind the player.
 * atan2(dx, dz) is the matching world-direction mapping.
 */
export function getCityFacingYaw(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}
