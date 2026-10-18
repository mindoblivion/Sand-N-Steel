import React, { useMemo, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import { buryMotteFlange } from '../../../utils/motteSurface';

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
 * uses rotation [0, 0, 0].  (NorthernFortress works the same way: its GLB
 * nodes also bake in the Z-up→Y-up rotation, so its group applies no
 * rotation either.)  Applying a duplicate rotation would misalign the
 * motte and break the terrain height calculations in terrainHeight.ts.
 *
 * Approved configuration (Phase 34G, C2 south-facing):
 *   Position: [0, 0, -71.5]
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
 * Phase C-8.35 — the outer flange.  `Motte_Grass` does not stop at the mound's
 * foot: the superellipse family continues as an outer flange whose crest rings
 * sit at exactly world Y = 0, i.e. 0.05 ABOVE the city ground plane, while its
 * troughs sink below it and are hidden.  The flat sage-green material therefore
 * rendered as concentric ground-level bands up to 63.4 units wide (the
 * "oversized flat green surface" of the northern approach).  At mount time the
 * flange is sunk below the ground plane by utils/motteSurface.ts; the mound,
 * the summit, the traversable slope, the collision registry and getTerrainY()
 * are untouched.
 *
 * World-space bounds after transform (scale 0.3145, center [0, -71.5]):
 *   Motte: X[-25.16, 25.16], Z[-96.66, -46.34], Y[-0.88, 4.72]
 *   Ramp:  X[-2.83, 2.83],   Z[-58.92, -48.23], Y[0, 4.72]
 *   Summit (flat top at Y=4.72): radius ≈15.73 from [0, -71.5]
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
        const name = mesh.name || mesh.userData?.gltfAsset?.name;
        // Omit the buried moat mesh — it is entirely below the ground
        // plane at Y=0 (world Y ≈ -0.60) and would z-fight with the
        // city ground.  Skip rendering by making it invisible.
        if (name === 'Moat_Water') {
          mesh.visible = false;
          return;
        }
        // Phase 35E: Hide the dirt ramp — replaced by the wooden drawbridge.
        // The mesh is set invisible (not removed) so the GLB asset is
        // preserved byte-for-byte; only runtime visibility changes.
        if (name === 'Ramp_Dirt') {
          mesh.visible = false;
          return;
        }
        // Phase C-8.35: the trimesh conversion left an outer flange around the
        // mound's foot.  Its crest rings sit at exactly world Y = 0 — 0.05 ABOVE
        // the city ground plane at Y = -0.05 — so the flat sage-green material
        // rendered as concentric ground-level bands out to a 63-unit width,
        // with the sand showing through between them.  Sinking the flange under
        // the ground plane removes those flat bands; the mound, the summit, the
        // traversable slope and every gameplay number stay exactly as they were
        // (see utils/motteSurface.ts).
        if (name === 'Motte_Grass') {
          // POSITION is interleaved with NORMAL in one 24-byte-strided buffer
          // view, so its array is shared with the normals and must not be edited
          // in place.  Read through the accessor API into a buffer this
          // component owns — correct for an interleaved attribute and a plain
          // one alike — then sink the flange.
          const position = mesh.geometry.getAttribute('position');
          if (position) {
            const positions = new Float32Array(position.count * 3);
            for (let i = 0; i < position.count; i++) {
              positions[i * 3] = position.getX(i);
              positions[i * 3 + 1] = position.getY(i);
              positions[i * 3 + 2] = position.getZ(i);
            }
            buryMotteFlange(positions);
            mesh.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            mesh.geometry.computeBoundingSphere();
          }
        }
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
  }, [cloned]);

  return <primitive object={cloned} />;
};

// ── Moat water ring (Phase 35C) ─────────────────────────────────────────────
//
// The GLB's own Moat_Water mesh sits at world Y≈-0.60 (model Z=-1.9 × scale
// 0.3145), entirely below the city ground plane at Y=0, and is hidden.  This
// lightweight ring restores visible water at ground level.
//
// Verified dimensions (from GLB accessor bounds):
//   Motte_Grass base: model X/Y ±80 → world radius 25.16
//   Original GLB moat: model radius ~69.93 → world radius ~21.99 (buried)
//   Perimeter collision: world radius 22.0
//   Ramp: south-facing, world X ±2.83, Z[-55.42, -44.73]
//   Ramp opening half-angle (collision): atan((2.83+0.4)/22) ≈ 0.146 rad
//
// Water ring placement:
//   Inner radius: 25.8  — just outside the motte base (25.16) with 0.64 clearance
//   Outer radius: 31.0 — 5.2-unit-wide moat
//   Elevation: Y=0.06  — above ground (0) to avoid z-fighting, below motte
//   Gap half-angle: 0.18 rad — centered at south, wider than collision opening

export const MOAT_INNER_RADIUS = 25.8;
export const MOAT_OUTER_RADIUS = 31.0;
export const MOAT_WATER_Y = 0.06;
export const MOAT_GAP_HALF_ANGLE = 0.18; // radians

const MOTTE_MOAT_CENTER: [number, number, number] = [0, 0, -71.5];

const MoatWater: React.FC = () => {
  // RingGeometry is in the XY plane. After rotation [-π/2, 0, 0]:
  //   θ_ring=0 → +X (east), θ_ring=3π/2 → +Z (south from motte center).
  // Gap centered at south: thetaStart = 3π/2 + GAP_HALF, thetaLength = 2π - 2*GAP_HALF.
  const thetaStart = (3 * Math.PI) / 2 + MOAT_GAP_HALF_ANGLE;
  const thetaLength = 2 * Math.PI - 2 * MOAT_GAP_HALF_ANGLE;

  return (
    <mesh
      position={[MOTTE_MOAT_CENTER[0], MOAT_WATER_Y, MOTTE_MOAT_CENTER[2]]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow={false}
    >
      <ringGeometry
        args={[MOAT_INNER_RADIUS, MOAT_OUTER_RADIUS, 48, 1, thetaStart, thetaLength]}
      />
      <meshStandardMaterial
        color="#4a7a8a"
        roughness={0.35}
        metalness={0.1}
        transparent
        opacity={0.82}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
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
        <group position={[0, 0, -71.5]} scale={0.3145}>
          <MotteModel />
        </group>
        <MoatWater />
      </React.Suspense>
    </MotteErrorBoundary>
  );
};
