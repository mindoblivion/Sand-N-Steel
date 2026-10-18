import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';

/**
 * EastCircusArena.tsx — East Circus District: the chariot arena's placement
 * prototype (Phase C-8.64A).
 *
 * Loads the workspace asset `public/_workspace_arena.glb` through the same
 * `useGLTF` pipeline as the other landmark GLBs (NorthernMotte,
 * NorthernFortress, ColosseumSignPrototype) and mounts it at the audit's
 * approved transform:
 *
 *   position [52.34, -0.05, 43.80]   yaw  Math.PI / 2   scale  0.20
 *
 * Measured world-space results of that transform (the asset carries no node
 * transforms of its own — every node's t/r/s is null — so these are exactly
 * scale × model extent, rotated about the group origin):
 *
 *   whole asset    X 37.600 … 66.344   Y -0.250 … 5.710   Z -30.157 … 46.000
 *   shell          X 38.380 … 66.300   Z -30.157 … 43.800  (Marble_01 — outer
 *                  wall + cavea; 27.92 wide × 73.96 long)
 *   sand track     X 43.940 … 60.740   Z -24.600 … 43.800  (Sand_00)
 *   carceres       X 43.340 … 61.340   Z  43.800 … 46.000  (Travertine_25)
 *   triumphal arch X 49.840 … 54.840   Z -23.900 … -22.500 (Travertine_30)
 *
 * The track's top face is exactly Y = -0.05 (`Sand_00` spans Y -0.25 … -0.05 at
 * this scale), i.e. flush with `ProcessionAvenue`'s ground plane
 * (`GROUND_PLANE_ELEVATION_Y`), which already spans X ±70 / Z -114 … +70 — so
 * the arena needs no new ground, no terrain change and no ground-plane resize.
 *
 * ── Why the asset is used exactly as authored ────────────────────────────
 * The phase requires the mesh normals, UVs, material assignments and transforms
 * to be preserved and the source GLB not to be modified destructively, so this
 * component touches no geometry and no material:
 *
 *   • the loaded `gltf.scene` is rendered directly (no `clone()`), so its
 *     geometry and its eight textures exist once in memory;
 *   • the asset's eight PNG textures carry **no glTF samplers**, and three's
 *     GLTFLoader falls back to `RepeatWrapping` for exactly that case
 *     (`texture.wrapS = WEBGL_WRAPPINGS[sampler.wrapS] || RepeatWrapping`).
 *     The authored UV tiling — TEXCOORD_0 runs to 61.6 — is therefore
 *     reproduced as authored, with no material, map or wrap override here;
 *   • no mesh is hidden, merged, re-scaled per node or re-materialized.
 *
 * ── Rendering overhead ───────────────────────────────────────────────────
 * The asset is 76 primitives over 8 materials (~21 000 triangles, 8 textures of
 * 85–248 kB), so its cost is draw calls rather than geometry or texture memory,
 * and its materials are already shared one per glTF material. What this
 * component does about it:
 *
 *   • one load, no per-instance clone (see above);
 *   • every node is static inside its group, so each mesh composes its local
 *     matrix once at mount and then stops (`matrixAutoUpdate = false`) instead
 *     of 76 matrix compositions a frame;
 *   • `frustumCulled` is left at three's default (true), so the arena culls as
 *     a whole whenever the player is not looking east;
 *   • nothing is added per frame — no traversals, no material cloning.
 *
 * Shadow casting stays on, matching NorthernMotte / NorthernFortress: this phase
 * changes neither the scene's shadow frustum nor the sun.
 */

export const CIRCUS_ARENA_URL = '/_workspace_arena.glb';

/** Approved placement (C-8.63 audit, Candidate A — East Circus District). */
export const CIRCUS_ARENA_POSITION: [number, number, number] = [52.34, -0.05, 43.8];
export const CIRCUS_ARENA_YAW = Math.PI / 2;
export const CIRCUS_ARENA_SCALE = 0.2;

// Preload at module import time (same pattern as NorthernMotte / NorthernFortress).
try {
  useGLTF.preload(CIRCUS_ARENA_URL);
} catch {
  // Silent fallback — useGLTF will load on demand if preload fails.
}

const ArenaModel: React.FC = () => {
  const gltf = useGLTF(CIRCUS_ARENA_URL);

  // Reuse the loaded scene as-is; never clone (the arena is mounted once and its
  // geometry is immutable here, so a clone would only duplicate GPU buffers).
  const scene = useMemo(() => gltf.scene, [gltf]);

  useEffect(() => {
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Static geometry: compose the local matrix once, then hold it.
      mesh.updateMatrix();
      mesh.matrixAutoUpdate = false;
    });
  }, [scene]);

  return <primitive object={scene} />;
};

export const EastCircusArena: React.FC = () => {
  return (
    <group
      position={CIRCUS_ARENA_POSITION}
      rotation={[0, CIRCUS_ARENA_YAW, 0]}
      scale={CIRCUS_ARENA_SCALE}
    >
      <ArenaModel />
    </group>
  );
};
