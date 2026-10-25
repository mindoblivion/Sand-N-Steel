/**
 * D-2 — FERRUM, as a combatant figure beside his master.
 *
 * ── THE STAND-IN DECISION ─────────────────────────────────────────────────
 * The asset set has no animal: `public/models/` holds five humanoid rigs
 * (arena_roman, amazonian, netfighter, minotaur, dimachaerus) and the weapon
 * meshes, and nothing else is quadrupedal. So this is the simplest era-honest
 * stand-in the set allows — a low-poly lion assembled from primitives in the
 * arena's own palette — rather than a borrowed humanoid rig wearing a lion's
 * role. Visual richness is the asset departments' follow-up, not this slice's.
 *
 * ── COST ──────────────────────────────────────────────────────────────────
 * Seven box meshes, two shared materials, one static group, NO per-frame work
 * (no `useFrame`, no mixer, no allocation): the pose is a set of transforms
 * chosen from the beast's duel state, so a crouch is a lower body and a dropped
 * head rather than an animation. It mounts only for a bout the fence admits.
 */
import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { BeastPose } from '../../utils/beastHunt';

interface BeastFigureProps {
  position: [number, number, number];
  rotationY?: number;
  pose: BeastPose;
}

/** The hide (tawny, the arena's own gold-brown) and the mane (near-black). */
const HIDE_COLOR = '#a16207';
const MANE_COLOR = '#3f2410';

export const BeastFigure: React.FC<BeastFigureProps> = ({ position, rotationY = 0, pose }) => {
  const hide = useMemo(
    () => new THREE.MeshStandardMaterial({ color: HIDE_COLOR, roughness: 0.92, metalness: 0 }),
    [],
  );
  const mane = useMemo(
    () => new THREE.MeshStandardMaterial({ color: MANE_COLOR, roughness: 0.98, metalness: 0 }),
    [],
  );

  // A crouch gathers the body down and forward; every other pose stands.
  const crouched = pose === 'crouch';
  const bodyY = crouched ? 0.62 : 0.82;
  const headY = crouched ? 0.66 : 0.98;
  const headZ = crouched ? -0.86 : -0.78;
  const legHeight = crouched ? 0.5 : 0.7;

  return (
    <group position={position} rotation={[0, rotationY, 0]} name="beast-ferrum">
      {/* Body */}
      <mesh material={hide} position={[0, bodyY, 0]} castShadow>
        <boxGeometry args={[0.42, 0.44, 1.25]} />
      </mesh>
      {/* Shoulders */}
      <mesh material={hide} position={[0, bodyY + 0.06, -0.42]} castShadow>
        <boxGeometry args={[0.5, 0.5, 0.42]} />
      </mesh>
      {/* Head */}
      <mesh material={hide} position={[0, headY, headZ]} castShadow>
        <boxGeometry args={[0.34, 0.32, 0.4]} />
      </mesh>
      {/* Mane */}
      <mesh material={mane} position={[0, headY + 0.03, headZ + 0.16]} castShadow>
        <boxGeometry args={[0.46, 0.46, 0.3]} />
      </mesh>
      {/* Fore legs — one pair, read as two by the X offset */}
      <mesh material={hide} position={[-0.16, legHeight / 2, -0.4]} castShadow>
        <boxGeometry args={[0.13, legHeight, 0.16]} />
      </mesh>
      <mesh material={hide} position={[0.16, legHeight / 2, -0.4]} castShadow>
        <boxGeometry args={[0.13, legHeight, 0.16]} />
      </mesh>
      {/* Hind legs */}
      <mesh material={hide} position={[-0.16, legHeight / 2, 0.42]} castShadow>
        <boxGeometry args={[0.13, legHeight, 0.16]} />
      </mesh>
      <mesh material={hide} position={[0.16, legHeight / 2, 0.42]} castShadow>
        <boxGeometry args={[0.13, legHeight, 0.16]} />
      </mesh>
      {/* Tail */}
      <mesh material={mane} position={[0, bodyY + 0.14, 0.72]} rotation={[0.5, 0, 0]} castShadow>
        <boxGeometry args={[0.07, 0.62, 0.07]} />
      </mesh>
    </group>
  );
};
