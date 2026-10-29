/**
 * Drawbridge.tsx — Lightweight wooden drawbridge spanning the moat at the
 * south face of the Northern Motte (Phase 35E; aligned Phase Drawbridge
 * Alignment 2).
 *
 * Replaces the hidden Ramp_Dirt mesh with a compact, static wooden bridge
 * in world space.  The deck sits just above ground level (Y=0); the mound
 * slope (terrainHeight.ts) provides the upward path from the bridge to the
 * summit.
 *
 * Measured targets (shipping asset public/_workspace_motte_normals.glb, world
 * transform position [0,0,-81.5] since Phase C-8.38, scale 0.3145; sampled
 * along X = 0):
 *
 *   Motte_Grass southern rim      Z = -56.34, surface Y = 0.00
 *   Grass surface crosses Y = 0   Z = -62.00 (rising slope begins there)
 *   Visible moat water surface    Y = 0.06   (ring, MOAT_WATER_Y)
 *   Moat ring span at south       Z = -56.50 (inner) → -50.50 (outer)
 *
 * Dimensions (world space, centered at X=0):
 *   Span:   Z = -50.5 (city side) → Z = -56.5 (motte side), 6.0 units long
 *   Width:  4 units (X ±2.0), inside the rear gate's 5.40 clear width
 *   Deck:   top Y = 0.16 (unchanged walking surface), underside Y = 0.09 —
 *           0.03 above the moat water surface at Y = 0.06
 *
 * Phase C-8.38 — the deck's south end is now 6.19 units north of the
 * Colosseum's rear-most rendered stone (the gate plinth's cut edge at
 * Z = -44.308) and 6.00 north of the gate lintel on the deck's own axis
 * (Z = -44.5), so the bridge visibly begins outside the gateway on the outer
 * bank instead of reading as an extension of the gate's stonework.
 *
 * Phase Drawbridge Alignment 2 (deck alignment):
 *   - The north end was extended 0.5 units (BRIDGE_Z_INNER -56.0 → -56.5) so
 *     the deck visibly overlaps the motte's southern grass rim at Z = -56.34
 *     by 0.16, removing the 0.34-unit gap.  It stays 5.5 units south of the
 *     rising mound slope (Z = -62.00), so it does not clip into the mound.
 *     The shared constants in terrainHeight.ts are deliberately untouched:
 *     terrain is flat at Y = 0 across this whole region, so the visible
 *     extension changes no gameplay height or collision behaviour.
 *   - The plank was thinned (0.12 → 0.07) so the whole structure's underside
 *     rose from Y = 0.04 to Y = 0.09 — clear of the visible water surface at
 *     Y = 0.06 — while the deck top and therefore the walking surface stays
 *     exactly where Phase 35E put it.
 *
 * Construction (5 meshes — minimal for mobile performance):
 *   1. Plank deck  — single box, wood material, with cast/receive shadow
 *   2. Side beams  — two boxes flanking the deck (restrained railings)
 *   3. Iron hinges — two small cylinders at the motte end (drawbridge hardware)
 *
 * No colliders are added — the bridge area is already collision-free (the
 * motte perimeter opening covers it) and the terrain is flat at Y=0.
 */

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import {
  BRIDGE_HALF_WIDTH,
  BRIDGE_Z_OUTER,
  BRIDGE_Z_INNER,
} from '../../../utils/terrainHeight';
import {
  DRAWBRIDGE_ANIM_DURATION,
  DRAWBRIDGE_CHAIN_SAG,
  DRAWBRIDGE_RAISED_ANGLE,
} from '../../../utils/drawbridge';

// ── Deck vertical placement ─────────────────────────────────────────────────
// The visible moat water ring sits at Y = 0.06 (MOAT_WATER_Y, NorthernMotte).
// The walking surface keeps its Phase 35E height (top Y = 0.16); the thinner
// plank lifts the structure's underside to Y = 0.09, clear of the water.
export const DECK_TOP_Y = 0.16;
export const DECK_THICKNESS = 0.07;
export const DECK_Y = DECK_TOP_Y - DECK_THICKNESS / 2; // 0.125 (box center)
export const DECK_UNDERSIDE_Y = DECK_TOP_Y - DECK_THICKNESS; // 0.09

export const BEAM_HEIGHT = 0.28;
export const BEAM_WIDTH = 0.22;

// Iron hinges sit just above the deck's mid-height at the motte end.
export const HINGE_RADIUS = 0.08;
export const HINGE_RAISE = 0.04;

// ── Deck span ───────────────────────────────────────────────────────────────
// Both ends come from terrainHeight's northern-group constants, so the bridge
// moves wherever the motte, its moat and its fortress move (Phases C-8.37 /
// C-8.38).
// South end: the moat's outer shoreline / city approach (BRIDGE_Z_OUTER
// = -50.5) — the bank the deck lands on, now 6.19 units north of the
// Colosseum's rear-most rendered stone (the gate plinth's cut edge at
// Z = -44.308), 6.00 north of the gate lintel on the deck's own axis
// (Z = -44.5) and 6.39 north of the gate's registered jamb line (-44.11), so
// the bridge begins on the bank outside the gateway with a visible apron
// behind the gate.
// North end: 0.5 units past the shared terrain constant so the deck overlaps
// the motte grass rim (Z = -56.34) by 0.16 with no visible gap.
export const DECK_Z_OUTER = BRIDGE_Z_OUTER;
export const DECK_Z_INNER = BRIDGE_Z_INNER - 0.5; // -56.5
export const DECK_LENGTH = DECK_Z_OUTER - DECK_Z_INNER; // 6.0

// Bridge center (midpoint of span)
export const DECK_CENTER_Z = (DECK_Z_OUTER + DECK_Z_INNER) / 2; // -53.5

// Wood material (reused across deck + beams)
const woodMaterial = new THREE.MeshStandardMaterial({
  color: '#6b4f3a',
  roughness: 0.85,
  metalness: 0.0,
});

// Iron material (reused for hinges)
const ironMaterial = new THREE.MeshStandardMaterial({
  color: '#3a3a3e',
  roughness: 0.5,
  metalness: 0.7,
});

/** Props for the working drawbridge (DB-1). */
interface DrawbridgeProps {
  /** When true, the bridge animates to the raised position. Defaults to false. */
  raised?: boolean;
}

/** easeInOutCubic easing for the raise/lower animation. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export const Drawbridge: React.FC<DrawbridgeProps> = ({ raised = false }) => {
  const hingeRef = useRef<THREE.Group>(null);
  const progressRef = useRef(0);
  const chainProgressRef = useRef(-1);
  const chainMeshesRef = useRef<Array<THREE.Mesh | null>>([null, null]);

  /** Rebuilds both chain tube geometries for the given animation progress. */
  const rebuildChains = (progress: number) => {
    const hinge = hingeRef.current;
    if (!hinge) return;
    hinge.updateWorldMatrix(true, false);
    ([-1, 1] as const).forEach((side, index) => {
      const mesh = chainMeshesRef.current[index];
      if (!mesh) return;
      const start = new THREE.Vector3(side * 2.5, 3.0, -49.5);
      const end = hinge.localToWorld(new THREE.Vector3(side * 1.5, DECK_TOP_Y, DECK_LENGTH));
      const control = start.clone().add(end).multiplyScalar(0.5);
      control.y -= (1 - progress) * DRAWBRIDGE_CHAIN_SAG;
      const curve = new THREE.QuadraticBezierCurve3(start, control, end);
      mesh.geometry.dispose();
      mesh.geometry = new THREE.TubeGeometry(curve, 20, 0.03, 8, false);
    });
  };

  useFrame((_, delta) => {
    const target = raised ? 1 : 0;
    const current = progressRef.current;
    if (current !== target) {
      const step = delta / DRAWBRIDGE_ANIM_DURATION;
      progressRef.current =
        current < target ? Math.min(target, current + step) : Math.max(target, current - step);
    }
    const eased = easeInOutCubic(progressRef.current);
    if (hingeRef.current) {
      hingeRef.current.rotation.x = -eased * DRAWBRIDGE_RAISED_ANGLE;
    }
    if (Math.abs(progressRef.current - chainProgressRef.current) > 0.01) {
      chainProgressRef.current = progressRef.current;
      rebuildChains(progressRef.current);
    }
  });

  useEffect(() => {
    return () => {
      chainMeshesRef.current.forEach((mesh) => {
        if (mesh) mesh.geometry.dispose();
      });
    };
  }, []);

  return (
    <group position={[0, 0, DECK_CENTER_Z]}>
      {/* Hinge group: deck and beams rotate about the north-end hinge (world Z -56.5). */}
      <group ref={hingeRef} position={[0, 0, -DECK_LENGTH / 2]}>
        <group position={[0, 0, DECK_LENGTH / 2]}>
          {/* Plank deck */}
          <mesh position={[0, DECK_Y, 0]} castShadow receiveShadow>
            <boxGeometry
              args={[BRIDGE_HALF_WIDTH * 2, DECK_THICKNESS, DECK_LENGTH]}
            />
            <primitive object={woodMaterial} attach="material" />
          </mesh>
          {/* Left side beam (underside flush with the deck underside) */}
          <mesh
            position={[-BRIDGE_HALF_WIDTH, DECK_UNDERSIDE_Y + BEAM_HEIGHT / 2, 0]}
            castShadow
          >
            <boxGeometry args={[BEAM_WIDTH, BEAM_HEIGHT, DECK_LENGTH]} />
            <primitive object={woodMaterial} attach="material" />
          </mesh>
          {/* Right side beam */}
          <mesh
            position={[BRIDGE_HALF_WIDTH, DECK_UNDERSIDE_Y + BEAM_HEIGHT / 2, 0]}
            castShadow
          >
            <boxGeometry args={[BEAM_WIDTH, BEAM_HEIGHT, DECK_LENGTH]} />
            <primitive object={woodMaterial} attach="material" />
          </mesh>
        </group>
      </group>
      {/* Iron hinge — left (at motte end) */}
      <mesh
        position={[
          -BRIDGE_HALF_WIDTH + BEAM_WIDTH / 2,
          DECK_Y + HINGE_RAISE,
          -DECK_LENGTH / 2, // north end of bridge
        ]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[HINGE_RADIUS, HINGE_RADIUS, BEAM_WIDTH * 1.4, 8]} />
        <primitive object={ironMaterial} attach="material" />
      </mesh>
      {/* Iron hinge — right */}
      <mesh
        position={[
          BRIDGE_HALF_WIDTH - BEAM_WIDTH / 2,
          DECK_Y + HINGE_RAISE,
          -DECK_LENGTH / 2,
        ]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[HINGE_RADIUS, HINGE_RADIUS, BEAM_WIDTH * 1.4, 8]} />
        <primitive object={ironMaterial} attach="material" />
      </mesh>
      {/* Anchor posts (DB-1). */}
      <mesh key="anchor-post-left" position={[-2.5, 1.5, -49.5]} castShadow>
        <boxGeometry args={[0.3, 3.0, 0.3]} />
        <primitive object={woodMaterial} attach="material" />
      </mesh>
      <mesh key="anchor-post-right" position={[2.5, 1.5, -49.5]} castShadow>
        <boxGeometry args={[0.3, 3.0, 0.3]} />
        <primitive object={woodMaterial} attach="material" />
      </mesh>
      {/* Chains (DB-1): tube geometry rebuilt as the bridge moves. */}
      <mesh
        key="chain-left"
        ref={(mesh) => {
          chainMeshesRef.current[0] = mesh;
        }}
      >
        <primitive object={ironMaterial} attach="material" />
      </mesh>
      <mesh
        key="chain-right"
        ref={(mesh) => {
          chainMeshesRef.current[1] = mesh;
        }}
      >
        <primitive object={ironMaterial} attach="material" />
      </mesh>
    </group>
  );
};
