import { getWeightCombatProfile } from './gladiatorWeight';

/**
 * Apply the character's body-weight movement trade-off to city locomotion.
 * The input speed already includes joystick magnitude, so weight changes stride
 * speed without changing directional input or collision resolution.
 */
export function resolveCityStrideSpeed(baseSpeed: number, bodyWeightLb: unknown): number {
  if (!Number.isFinite(baseSpeed) || baseSpeed < 0) return 0;
  return baseSpeed * getWeightCombatProfile(bodyWeightLb).movementMultiplier;
}
