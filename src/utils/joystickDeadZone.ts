/**
 * The city virtual joystick's radial dead zone.
 *
 * A resting thumb never sits exactly on the stick's centre, so before this the
 * character drifted whenever the joystick was merely held.  Offsets shorter than
 * `JOYSTICK_DEAD_ZONE` of full deflection now read as no input at all, and the range
 * above it is RESCALED rather than clamped, so there is no jump at the boundary:
 * [deadZone, 1] maps onto [0, 1].
 *
 * This is the one place to tune it — `CityHubScene` reads it through `applyDeadZone`,
 * and keyboard movement never goes near either.  Pure: no React, no three.js, no DOM.
 */
export const JOYSTICK_DEAD_ZONE = 0.15;

/** The magnitude below which a deflection reads as nothing (and the rescale's floor). */
export interface JoystickVector {
  x: number;
  z: number;
}

/**
 * Apply the radial dead zone and rescale what is left.
 *
 * Direction is preserved exactly (the vector only ever changes length): below the
 * dead zone the result is (0, 0); at the dead zone it is ~0; at (or past) full
 * deflection it is the input's own magnitude, so full deflection stays full.
 */
export function applyDeadZone(x: number, z: number, deadZone: number = JOYSTICK_DEAD_ZONE): JoystickVector {
  const magnitude = Math.sqrt(x * x + z * z);
  if (!Number.isFinite(magnitude) || magnitude <= deadZone) return { x: 0, z: 0 };

  const scale = (magnitude - deadZone) / (1 - deadZone) / magnitude;
  return { x: x * scale, z: z * scale };
}
