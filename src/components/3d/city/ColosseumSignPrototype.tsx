import React, { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { assetUrl } from '../../../utils/assetUrl';
import { useGLTF } from '@react-three/drei';

/**
 * Phase 29.3D — Grand Colosseum Sign Prototype with Wooden Backing
 *
 * Visual prototype: loads the existing grand_colosseum.glb sign model and
 * adds a dark walnut wooden backing panel behind the gold cut-out sign mesh.
 *
 * The backing sits behind the sign's rear face so the original gold lettering
 * and emblem remain fully visible. A small margin around the sign silhouette
 * makes the wood read as a backing rather than covering the metal.
 *
 * Verified GLB mesh bounds (parsed via three.js GLTFLoader):
 *   sign:   X[-0.449, 0.449]  Y[0.790, 2.340]  Z[-0.025, 0.061]
 *   brace:  X[-0.936, 0.136]  Y[1.932, 2.578]  Z[-0.032, 0.032]
 *   chains: X[±0.046]         Y[2.247, 2.571]   Z[-0.046, 0.046]
 *
 * The backing panel is placed at Z = -0.060 (front face at -0.0525), which is
 * 6.5mm behind the chain back face (Z = -0.046) — no overlap with any original
 * geometry. The 35mm gap behind the sign back (Z = -0.025) still reads as a
 * tight backing because the panel silhouette extends beyond the sign edges.
 */

const SIGN_GLB_PATH = assetUrl('/signs/grand_colosseum/grand_colosseum.glb');

// Backing panel dimensions — ~30mm margin around the sign silhouette.
const BACKING_WIDTH = 0.958; // sign width 0.898 + 2 × 0.030 margin
const BACKING_HEIGHT = 1.610; // sign height 1.550 + 2 × 0.030 margin
const BACKING_DEPTH = 0.015;
const BACKING_CENTER_Y = 1.565; // (0.790 + 2.340) / 2
const BACKING_CENTER_Z = -0.060; // behind sign, brace, and chains

// Preload so the GLB is cached before the portal renders.
useGLTF.preload(SIGN_GLB_PATH);

export const ColosseumSignPrototype: React.FC = () => {
  const gltf = useGLTF(SIGN_GLB_PATH);

  // Dark walnut backing — non-metallic, rough, mobile-friendly single mesh.
  const woodBackingMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#3D2817',
        metalness: 0,
        roughness: 0.8,
      }),
    [],
  );

  useEffect(() => {
    return () => woodBackingMaterial.dispose();
  }, [woodBackingMaterial]);

  return (
    <group>
      {/* Original GLB sign model — rendered unmodified */}
      <primitive object={gltf.scene} />

      {/* Dark walnut wooden backing panel behind the gold cut-out */}
      <mesh
        material={woodBackingMaterial}
        position={[0, BACKING_CENTER_Y, BACKING_CENTER_Z]}
        castShadow
      >
        <boxGeometry args={[BACKING_WIDTH, BACKING_HEIGHT, BACKING_DEPTH]} />
      </mesh>
    </group>
  );
};
