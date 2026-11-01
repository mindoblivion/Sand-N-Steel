import React, { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import {
  LANDMARK_SIGN_BACKING,
  LANDMARK_SIGNS_BY_ID,
  type LandmarkSignId,
} from '../../../data/landmarkSigns';
import { ThreeComponentErrorBoundary } from '../../ui/ThreeComponentErrorBoundary';

/**
 * L17B — one landmark sign, mounted inside its building's own root group.
 *
 * Reuses the Grand Colosseum sign's treatment exactly (Phase 29.3D,
 * `ColosseumSignPrototype.tsx`): the delivered GLB is rendered unmodified, and
 * a dark walnut panel sits behind the cut-out plate so the silhouette lettering
 * reads.  The backing is the Colosseum's own margin / depth / centre values,
 * with the width taken per sign from the measured plate so no plate is
 * stretched — see `src/data/landmarkSigns.ts` for the numbers and the mounting
 * rationale.
 *
 * Deliberately absent: preloading of the other sign models, per-frame state,
 * lights, animation and any runtime manifest parsing.  Each sign's GLB is a
 * separate ~80 KB asset fetched through the shared `useGLTF` cache when its own
 * building renders.  The component owns its own `Suspense`, so a sign that is
 * still loading can never blank the building around it.
 *
 * L17D — reliability.  `useGLTF` rejects on a missing or corrupt GLB, and React
 * re-throws that rejection during render; before L17D the nearest boundary was
 * the city's single `CityArchitecturalDistricts` boundary, so ONE failed sign
 * took the whole architectural district down with it.  Each sign now carries its
 * own `ThreeComponentErrorBoundary` (the project's existing 3D boundary) with a
 * `null` fallback: a failed sign renders nothing and every other building, sign
 * and collider is untouched.  The boundary sits OUTSIDE the `Suspense`, so
 * `Suspense` keeps owning loading while the boundary owns load and render
 * failures; once tripped it holds that state for the life of the mount (no
 * retry, no reset), so a permanently missing asset cannot loop.
 */

const LandmarkSignModel: React.FC<{ id: LandmarkSignId }> = ({ id }) => {
  const sign = LANDMARK_SIGNS_BY_ID[id];
  const gltf = useGLTF(sign.assetPath);

  // Same walnut backing as the Colosseum sign — one mesh, mobile-friendly.
  const backingMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#3D2817',
        metalness: 0,
        roughness: 0.8,
      }),
    [],
  );

  useEffect(() => {
    return () => backingMaterial.dispose();
  }, [backingMaterial]);

  return (
    <group position={sign.position} rotation={[0, sign.rotationY, 0]} scale={sign.scale}>
      {/* Delivered GLB — post, bracket arm, chains and cut-out plate, unmodified */}
      <primitive object={gltf.scene} />

      {/* Walnut panel behind the cut-out lettering (no plate is stretched) */}
      <mesh
        material={backingMaterial}
        position={[0, LANDMARK_SIGN_BACKING.centerY, LANDMARK_SIGN_BACKING.centerZ]}
        castShadow
      >
        <boxGeometry
          args={[
            sign.plateWidth + 2 * LANDMARK_SIGN_BACKING.margin,
            LANDMARK_SIGN_BACKING.plateHeight + 2 * LANDMARK_SIGN_BACKING.margin,
            LANDMARK_SIGN_BACKING.depth,
          ]}
        />
      </mesh>
    </group>
  );
};

export const LandmarkSign: React.FC<{ id: LandmarkSignId }> = ({ id }) => (
  <ThreeComponentErrorBoundary componentName={`LandmarkSign:${id}`} fallback={null}>
    <Suspense fallback={null}>
      <LandmarkSignModel id={id} />
    </Suspense>
  </ThreeComponentErrorBoundary>
);
