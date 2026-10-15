/**
 * Drawbridge.tsx — Lightweight wooden drawbridge spanning the moat at the
 * south face of the Northern Motte (Phase 35E).
 *
 * Replaces the hidden Ramp_Dirt mesh with a compact, static wooden bridge
 * in world space.  The deck sits at Y=0 (ground level); the mound slope
 * (terrainHeight.ts) provides the upward path from the bridge to the summit.
 *
 * Dimensions (world space, centered at X=0):
 *   Span:   Z = -40.5 (city side) → Z = -46.0 (motte side), 5.5 units long
 *   Width:  4 units (X ±2.0), fits inside moat gap linear width ≈ 9.24
 *   Deck:   Y = 0.10 (above moat water at Y=0.06, avoids ground z-fighting)
 *
 * Construction (4 meshes — minimal for mobile performance):
 *   1. Plank deck  — single box, wood material, with cast/receive shadow
 *   2. Side beams  — two boxes flanking the deck (restrained railings)
 *   3. Iron hinges — two small cylinders at the motte end (drawbridge hardware)
 *
 * No colliders are added — the bridge area is already collision-free (the
 * motte perimeter opening covers it) and the terrain is flat at Y=0.
 */

import React from 'react';
import * as THREE from 'three';
import {
  BRIDGE_HALF_WIDTH,
  BRIDGE_Z_OUTER,
  BRIDGE_Z_INNER,
} from '../../../utils/terrainHeight';

const DECK_Y = 0.10;
const DECK_THICKNESS = 0.12;
const BEAM_HEIGHT = 0.28;
const BEAM_WIDTH = 0.22;

// Bridge center (midpoint of span)
const BRIDGE_CENTER_Z = (BRIDGE_Z_OUTER + BRIDGE_Z_INNER) / 2; // -39.5
const BRIDGE_LENGTH = BRIDGE_Z_OUTER - BRIDGE_Z_INNER; // 6.0

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

export const Drawbridge: React.FC = () => {
  return (
    <group position={[0, 0, BRIDGE_CENTER_Z]}>
      {/* Plank deck */}
      <mesh position={[0, DECK_Y, 0]} castShadow receiveShadow>
        <boxGeometry
          args={[BRIDGE_HALF_WIDTH * 2, DECK_THICKNESS, BRIDGE_LENGTH]}
        />
        <primitive object={woodMaterial} attach="material" />
      </mesh>

      {/* Left side beam */}
      <mesh
        position={[-BRIDGE_HALF_WIDTH, DECK_Y + BEAM_HEIGHT / 2 - DECK_THICKNESS / 2, 0]}
        castShadow
      >
        <boxGeometry args={[BEAM_WIDTH, BEAM_HEIGHT, BRIDGE_LENGTH]} />
        <primitive object={woodMaterial} attach="material" />
      </mesh>

      {/* Right side beam */}
      <mesh
        position={[BRIDGE_HALF_WIDTH, DECK_Y + BEAM_HEIGHT / 2 - DECK_THICKNESS / 2, 0]}
        castShadow
      >
        <boxGeometry args={[BEAM_WIDTH, BEAM_HEIGHT, BRIDGE_LENGTH]} />
        <primitive object={woodMaterial} attach="material" />
      </mesh>

      {/* Iron hinge — left (at motte end, Z = BRIDGE_Z_INNER relative) */}
      <mesh
        position={[
          -BRIDGE_HALF_WIDTH + BEAM_WIDTH / 2,
          DECK_Y + 0.04,
          BRIDGE_Z_INNER - BRIDGE_CENTER_Z, // north end of bridge
        ]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[0.08, 0.08, BEAM_WIDTH * 1.4, 8]} />
        <primitive object={ironMaterial} attach="material" />
      </mesh>

      {/* Iron hinge — right */}
      <mesh
        position={[
          BRIDGE_HALF_WIDTH - BEAM_WIDTH / 2,
          DECK_Y + 0.04,
          BRIDGE_Z_INNER - BRIDGE_CENTER_Z,
        ]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[0.08, 0.08, BEAM_WIDTH * 1.4, 8]} />
        <primitive object={ironMaterial} attach="material" />
      </mesh>
    </group>
  );
};
