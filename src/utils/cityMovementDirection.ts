/**
 * Convert normalized screen-space movement input into city world-space movement.
 *
 * CityCamera places the camera at player - forward, where forward is
 * (sin(yaw), cos(yaw)). In that view, camera-right is the yaw-rotated local
 * +X axis: (cos(yaw), -sin(yaw)). This keeps joystick and keyboard strafe
 * directions aligned with what the player sees on screen.
 */
export function getCameraRelativeMovement(
  inputX: number,
  inputZ: number,
  cameraYaw: number,
): { x: number; z: number } {
  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  return {
    x: inputX * cos - inputZ * sin,
    z: -inputX * sin - inputZ * cos,
  };
}
