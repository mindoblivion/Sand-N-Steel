import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  useCameraDrag,
  CAMERA_DRAG_BASE_YAW_SENSITIVITY,
  CAMERA_DRAG_BASE_PITCH_SENSITIVITY,
} from '../../../hooks/useCameraDrag';
import { CITY_CAMERA_DISTANCES, getCameraSensitivityScale } from '../../../services/settings';
import { useSettings } from '../../../hooks/useSettings';
import { resolveCameraCollision, CAMERA_HEAD_HEIGHT } from '../../../utils/cameraCollision';
import { CITY_COLLIDERS } from '../../../utils/collisionShapes';

interface CityCameraProps {
  targetPosition: [number, number, number];
  targetPositionRef?: React.MutableRefObject<[number, number, number]>;
  targetRotationY: number;
  isMoving?: boolean;
  cameraYawRef?: React.MutableRefObject<number>;
}

/** The camera's own height above the player, unchanged since Phase 26. */
const CITY_CAMERA_BASE_HEIGHT = 2.8;

/** The dragged distance may not exceed this, so the pitch control cannot run away. */
const CITY_CAMERA_MAX_DRAGGED_DISTANCE = 12;

/**
 * Elevated 3rd-Person Chase Camera with Wider Field of View, Smooth Damped Tracking,
 * and Hold-and-Drag Camera Angle Control (360 Orbit & Elevation Pitch)
 *
 * C-8.70B §SET-1 — two settings rows arrive here through the settings
 * subscription (a change re-renders this component; the frame loop below is
 * untouched and still reads nothing but refs):
 *   • City Camera Distance — the framing behind the player.  Standard is the
 *     framing this camera already had (5.5 behind at 2.8 above); Near and Far are
 *     the design's presets, `CITY_CAMERA_DISTANCES`.
 *   • Camera Sensitivity — the drag-orbit scale `useCameraDrag` is handed, 1.0 at
 *     the default setting.
 */
export const CityCamera: React.FC<CityCameraProps> = ({
  targetPosition,
  targetPositionRef,
  targetRotationY,
  isMoving = false,
  cameraYawRef,
}) => {
  const { camera } = useThree();

  const settings = useSettings();
  const sensitivityScale = getCameraSensitivityScale(settings);

  const { yawOffsetRef, pitchOffsetRef } = useCameraDrag(isMoving, {
    yawSensitivity: CAMERA_DRAG_BASE_YAW_SENSITIVITY * sensitivityScale,
    pitchSensitivity: CAMERA_DRAG_BASE_PITCH_SENSITIVITY * sensitivityScale,
  });

  const currentLookAt = useRef(
    new THREE.Vector3(targetPosition[0], targetPosition[1] + 1.2, targetPosition[2])
  );
  const currentCamYaw = useRef<number>(targetRotationY);
  // Phase 26.0: Fixed base yaw captured from the initial player facing.
  // The camera yaw must NOT follow the player's rotation — only the user's drag
  // offset changes it. Following the player's facing creates a positive feedback
  // loop (move right → face right → camera follows → "right" shifts → spiral).
  const baseYawRef = useRef<number>(targetRotationY);

  // Phase 2B.60: Reusable vectors to avoid per-frame allocations inside useFrame.
  const desiredCamPosRef = useRef(new THREE.Vector3());
  const targetPointRef = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    // Phase 26.1: Read position from ref when provided for smooth per-frame
    // tracking without depending on React state re-renders.
    const pos = targetPositionRef ? targetPositionRef.current : targetPosition;
    const pX = pos[0];
    const pY = pos[1];
    const pZ = pos[2];

    // C-8.70B §SET-1 — the framing comes from the settings row.
    const baseDistance = CITY_CAMERA_DISTANCES[settings.cityCamDistance];
    const baseHeight = CITY_CAMERA_BASE_HEIGHT;

    // Apply hold-and-drag pitch adjustment
    const dragPitch = pitchOffsetRef.current;
    const currentHeight = Math.max(0.8, Math.min(7.5, baseHeight + dragPitch));
    const currentDistance = Math.max(
      2.8,
      Math.min(CITY_CAMERA_MAX_DRAGGED_DISTANCE, baseDistance + dragPitch * 0.35)
    );

    // Phase 26.0: Camera yaw is decoupled from the player's facing rotation.
    // Only the user's drag offset changes the camera orientation (auto-recentering
    // to baseYaw via useCameraDrag's decay when moving). This keeps joystick
    // movement direction stable relative to the screen — no spiral feedback.
    const effectiveTargetYaw = baseYawRef.current + yawOffsetRef.current;

    // Smoothly damp camera yaw towards effective target yaw
    let yawDiff = effectiveTargetYaw - currentCamYaw.current;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    currentCamYaw.current += yawDiff * Math.min(1, delta * 5.5);

    // Sync current camera yaw to shared ref for decoupled camera-relative movement
    if (cameraYawRef) {
      cameraYawRef.current = currentCamYaw.current;
    }

    // Calculate camera position based on smoothed yaw and drag height
    const desiredX = pX - Math.sin(currentCamYaw.current) * currentDistance;
    const desiredZ = pZ - Math.cos(currentCamYaw.current) * currentDistance;
    const desiredY = pY + currentHeight;

    const desiredCamPos = desiredCamPosRef.current.set(desiredX, desiredY, desiredZ);

    // Keep the chase camera out of city buildings while preserving the existing
    // smooth lerp and all camera distance/sensitivity settings.
    const safeCamPos = resolveCameraCollision(
      { x: pX, y: pY + CAMERA_HEAD_HEIGHT, z: pZ },
      { x: desiredCamPos.x, y: desiredCamPos.y, z: desiredCamPos.z },
      CITY_COLLIDERS,
    );
    desiredCamPos.set(safeCamPos.x, safeCamPos.y, safeCamPos.z);

    // Smooth camera position lerp
    camera.position.lerp(desiredCamPos, Math.min(1, delta * 7.5));

    // Target look-at: player chest and upper body with forward horizon focus
    const forwardOffsetX = Math.sin(currentCamYaw.current) * 2.2;
    const forwardOffsetZ = Math.cos(currentCamYaw.current) * 2.2;
    const targetPoint = targetPointRef.current.set(
      pX + forwardOffsetX * 0.3,
      pY + 1.5,
      pZ + forwardOffsetZ * 0.3
    );

    currentLookAt.current.lerp(targetPoint, Math.min(1, delta * 8.5));
    camera.lookAt(currentLookAt.current);
  });

  return null;
};
