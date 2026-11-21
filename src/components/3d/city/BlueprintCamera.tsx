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
import type { Collider } from '../../../utils/collisionShapes';

interface BlueprintCameraProps {
  targetPosition: [number, number, number];
  targetPositionRef: React.MutableRefObject<[number, number, number]>;
  targetRotationY: number;
  isMoving: boolean;
  cameraYawRef: React.MutableRefObject<number>;
  colliders: Collider[];
  /** Updated per frame with true if camera collision pulled closer than desired distance. */
  cameraClippedRef?: React.MutableRefObject<boolean>;
  disabled?: boolean;
}

const BLUEPRINT_CAMERA_BASE_HEIGHT = 3.1;
const BLUEPRINT_CAMERA_MAX_DRAGGED_DISTANCE = 16;

/**
 * 3rd-Person Chase Camera for the 500×500 City Blueprint Scene.
 * Matches CityCamera.tsx drag-orbit & damping feel while resolving against
 * the blueprint's own colliders (so alleys and setbacks can be tested live).
 */
export const BlueprintCamera: React.FC<BlueprintCameraProps> = ({
  targetPosition,
  targetPositionRef,
  targetRotationY,
  isMoving,
  cameraYawRef,
  colliders,
  cameraClippedRef,
  disabled = false,
}) => {
  const { camera } = useThree();
  const settings = useSettings();
  const sensitivityScale = getCameraSensitivityScale(settings);

  const { yawOffsetRef, pitchOffsetRef } = useCameraDrag(isMoving, {
    yawSensitivity: CAMERA_DRAG_BASE_YAW_SENSITIVITY * sensitivityScale,
    pitchSensitivity: CAMERA_DRAG_BASE_PITCH_SENSITIVITY * sensitivityScale,
    autoDecayOnMove: false,
    disabled,
  });

  const currentLookAt = useRef(
    new THREE.Vector3(targetPosition[0], targetPosition[1] + 1.4, targetPosition[2]),
  );
  const currentCamYaw = useRef<number>(targetRotationY);
  const baseYawRef = useRef<number>(targetRotationY);
  const desiredCamPosRef = useRef(new THREE.Vector3());
  const targetPointRef = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const pos = targetPositionRef.current;
    const [pX, pY, pZ] = pos;

    const baseDistance = CITY_CAMERA_DISTANCES[settings.cityCamDistance];
    const dragPitch = pitchOffsetRef.current;
    const currentHeight = Math.max(0.9, Math.min(9.0, BLUEPRINT_CAMERA_BASE_HEIGHT + dragPitch));
    const currentDistance = Math.max(
      3.0,
      Math.min(BLUEPRINT_CAMERA_MAX_DRAGGED_DISTANCE, baseDistance + dragPitch * 0.4),
    );

    const effectiveTargetYaw = baseYawRef.current + yawOffsetRef.current;
    let yawDiff = effectiveTargetYaw - currentCamYaw.current;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    currentCamYaw.current += yawDiff * Math.min(1, delta * 5.5);

    cameraYawRef.current = currentCamYaw.current;

    const desiredX = pX - Math.sin(currentCamYaw.current) * currentDistance;
    const desiredZ = pZ - Math.cos(currentCamYaw.current) * currentDistance;
    const desiredY = pY + currentHeight;

    const desiredCamPos = desiredCamPosRef.current.set(desiredX, desiredY, desiredZ);

    const safeCamPos = resolveCameraCollision(
      { x: pX, y: pY + CAMERA_HEAD_HEIGHT, z: pZ },
      { x: desiredCamPos.x, y: desiredCamPos.y, z: desiredCamPos.z },
      colliders,
    );

    if (cameraClippedRef) {
      const pullDist = Math.hypot(safeCamPos.x - desiredX, safeCamPos.z - desiredZ);
      cameraClippedRef.current = pullDist > 0.25;
    }

    desiredCamPos.set(safeCamPos.x, safeCamPos.y, safeCamPos.z);
    camera.position.lerp(desiredCamPos, Math.min(1, delta * 8.0));

    const forwardOffsetX = Math.sin(currentCamYaw.current) * 2.4;
    const forwardOffsetZ = Math.cos(currentCamYaw.current) * 2.4;
    const targetPoint = targetPointRef.current.set(
      pX + forwardOffsetX * 0.3,
      pY + 1.5,
      pZ + forwardOffsetZ * 0.3,
    );

    currentLookAt.current.lerp(targetPoint, Math.min(1, delta * 9.0));
    camera.lookAt(currentLookAt.current);
  });

  return null;
};
