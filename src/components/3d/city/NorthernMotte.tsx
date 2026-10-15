import React, { useMemo, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';

/**
 * NorthernMotte.tsx — Motte-and-bailey earth mound north of the Colosseum.
 *
 * Loads the corrected GLB asset (public/_workspace_motte_normals.glb)
 * through the existing useGLTF pipeline.
 *
 * Asset correction history:
 *   1. The original GLB (trimesh-generated) had no NORMAL attributes on any
 *      mesh, causing invisible rendering on SwiftShader.
 *   2. The corrected asset was produced with TWO modifications:
 *      a. Smooth per-vertex normals computed from the indexed geometry,
 *         preserving all vertex counts, indices, materials, and bounds.
 *      b. Node-level Z-up→Y-up rotation baked into the GLB node hierarchy,
 *         so the model renders correctly in Three.js (Y-up) without any
 *         component-level rotation.
 *
 * IMPORTANT: Because the GLB nodes already carry the Z-up→Y-up rotation,
 * this component must NOT apply a duplicate rotation.  The outer group
 * uses rotation [0, 0, 0].  (Contrast with NorthernFortress, whose GLB
 * nodes carry NO rotation and which applies [-π/2, 0, 0] at the component
 * level.)  Applying a duplicate rotation would misalign the motte and
 * break the terrain height calculations in terrainHeight.ts.
 *
 * Approved configuration (Phase 34G, C2 south-facing):
 *   Position: [0, 0, -68]
 *   Scale:    0.3145
 *   Rotation: [0, 0, 0]  (the GLB nodes already carry the Z-up→Y-up rotation)
 *
 * The GLB has three meshes:
 *   Motte_Grass  — the mound surface (grass), rendered with shadows.
 *   Ramp_Dirt    — the dirt ramp, rendered with shadows.
 *   Moat_Water   — a flat ring at model Z=-1.9 (world Y≈-0.60), entirely
 *                  below the city ground plane at Y=0.  Omitted from
 *                  rendering because it is always hidden underground.
 *
 * World-space bounds after transform (scale 0.3145, center [0, -68]):
 *   Motte: X[-25.16, 25.16], Z[-93.16, -42.84], Y[-0.88, 4.72]
 *   Ramp:  X[-2.83, 2.83],   Z[-55.42, -44.73], Y[0, 4.72]
 *   Summit (flat top at Y=4.72): radius ≈15.73 from [0, -68]
 *
 * The motte is mounted once in CityHubScene via this component.
 */

const MOTTE_URL = '/_workspace_motte_normals.glb';

// Preload at module import time (same pattern as NorthernFortress / GladiatorMesh).
try {
  useGLTF.preload(MOTTE_URL);
} catch {
  // Silent fallback — useGLTF will load on demand if preload fails.
}

const MotteModel: React.FC = () => {
  const gltf = useGLTF(MOTTE_URL);

  // Clone so the cached scene is never mutated across instances.
  const cloned = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);

  useEffect(() => {
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        // Omit the buried moat mesh — it is entirely below the ground
        // plane at Y=0 (world Y ≈ -0.60) and would z-fight with the
        // city ground.  Skip rendering by making it invisible.
        if (mesh.name === 'Moat_Water' || mesh.userData?.gltfAsset?.name === 'Moat_Water') {
          mesh.visible = false;
          return;
        }
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
  }, [cloned]);

  return <primitive object={cloned} />;
};

/**
 * Error boundary wrapper — a load failure renders nothing rather than
 * crashing the city hub, consistent with ThreeComponentErrorBoundary usage
 * in CityHubScene.
 */
class MotteErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('[NorthernMotte] GLB failed to load:', err);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export const NorthernMotte: React.FC = () => {
  return (
    <MotteErrorBoundary>
      <React.Suspense fallback={null}>
        <group position={[0, 0, -68]} scale={0.3145}>
          <MotteModel />
        </group>
      </React.Suspense>
    </MotteErrorBoundary>
  );
};
