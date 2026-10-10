import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useCameraDrag } from '../../../hooks/useCameraDrag';

interface CityCameraProps {
  targetPosition: [number, number, number];
  targetRotationY: number;
  isMoving?: boolean;
  cameraYawRef?: React.MutableRefObject<number>;
}

/**
 * Elevated 3rd-Person Chase Camera with Wider Field of View, Smooth Damped Tracking,
 * and Hold-and-Drag Camera Angle Control (360 Orbit & Elevation Pitch)
 */
export const CityCamera: React.FC<CityCameraProps> = ({
  targetPosition,
  targetRotationY,
  isMoving = false,
  cameraYawRef,
}) => {
  const { camera } = useThree();

  const { yawOffsetRef, pitchOffsetRef } = useCameraDrag(isMoving);

  const currentLookAt = useRef(
    new THREE.Vector3(targetPosition[0], targetPosition[1] + 1.2, targetPosition[2])
  );
  const currentCamYaw = useRef<number>(targetRotationY);

  useFrame((_, delta) => {
    const pX = targetPosition[0];
    const pY = targetPosition[1];
    const pZ = targetPosition[2];

    const baseDistance = 5.5;
    const baseHeight = 2.8;

    // Apply hold-and-drag pitch adjustment
    const dragPitch = pitchOffsetRef.current;
    const currentHeight = Math.max(0.8, Math.min(7.5, baseHeight + dragPitch));
    const currentDistance = Math.max(2.8, Math.min(10.5, baseDistance + dragPitch * 0.35));

    // Combine player facing yaw with manual drag orbit yaw offset
    const effectiveTargetYaw = targetRotationY + yawOffsetRef.current;

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

    const desiredCamPos = new THREE.Vector3(desiredX, desiredY, desiredZ);

    // Smooth camera position lerp
    camera.position.lerp(desiredCamPos, Math.min(1, delta * 7.5));

    // Target look-at: player chest and upper body with forward horizon focus
    const forwardOffsetX = Math.sin(currentCamYaw.current) * 2.2;
    const forwardOffsetZ = Math.cos(currentCamYaw.current) * 2.2;
    const targetPoint = new THREE.Vector3(
      pX + forwardOffsetX * 0.3,
      pY + 1.5,
      pZ + forwardOffsetZ * 0.3
    );

    currentLookAt.current.lerp(targetPoint, Math.min(1, delta * 8.5));
    camera.lookAt(currentLookAt.current);
  });

  return null;
};
