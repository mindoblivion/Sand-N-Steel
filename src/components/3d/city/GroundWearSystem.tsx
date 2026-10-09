import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ROMAN_PALETTE, NOISE_TEXTURE } from './RomanMaterials';

/**
 * Phase 25 — Ground Wear, Sand Drift & Threshold Transition System
 * Provides low-profile, non-collidable, static visual grounding details:
 * 1. CornerSandDrift — subtle irregular corner sand/dust accumulations at plinth edges
 * 2. GroundThresholdStep — authentic stepped stone threshold slab with subtle entrance wear
 * 3. DistrictGroundWear — district-specific ground accumulation (arena sand, forge soot/dust)
 */

interface CornerDriftProps {
  /** [x, y, z] center position */
  position: [number, number, number];
  /** Approximate horizontal size [width, depth] */
  size?: [number, number];
  /** Rotation angle around Y in radians */
  rotationY?: number;
  /** Tone: 'sand' (default golden arena dust), 'dust' (muted street dirt), 'forge' (dark soot/ash) */
  tone?: 'sand' | 'dust' | 'forge';
}

/**
 * Low-profile, irregular sand/dust deposit for plinth corners and curbs.
 * Uses a thin multi-layer wedge that hugs the ground (0.015m to 0.035m high),
 * visually softening sharp 90-degree intersections between stone and earth.
 */
export const CornerSandDrift: React.FC<CornerDriftProps> = ({
  position,
  size = [1.2, 1.2],
  rotationY = 0,
  tone = 'dust',
}) => {
  const [w, d] = size;

  const color = useMemo(() => {
    switch (tone) {
      case 'sand':
        return ROMAN_PALETTE.arenaSand.color; // #cda270
      case 'forge':
        return '#3f3833'; // Soot & charcoal dust
      case 'dust':
      default:
        return '#ab977e'; // Natural dry Mediterranean street dust
    }
  }, [tone]);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Primary low dust bed */}
      <mesh receiveShadow position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial
          color={color}
          roughness={0.94}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.015}
        />
      </mesh>
      {/* Tapered inner accumulation wedge along the corner vertex */}
      <mesh receiveShadow position={[-w * 0.15, 0.022, -d * 0.15]}>
        <boxGeometry args={[w * 0.65, 0.03, d * 0.65]} />
        <meshStandardMaterial
          color={color}
          roughness={0.96}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.018}
        />
      </mesh>
    </group>
  );
};

interface GroundThresholdStepProps {
  /** Width of the doorway entrance */
  width?: number;
  /** Depth of the threshold slab (forward projection) */
  depth?: number;
  /** Position offset */
  position?: [number, number, number];
  /** Rotation around Y axis */
  rotationY?: number;
  /** Stone tint */
  stoneColor?: string;
  /** District dust tone beside threshold */
  dustTone?: 'sand' | 'dust' | 'forge';
}

/**
 * Authentic Roman entry threshold transition slab:
 * Provides a worn lower stone step (0.04m above street) with slightly worn central depression
 * and flanked by subtle accumulated corner dust.
 */
export const GroundThresholdStep: React.FC<GroundThresholdStepProps> = ({
  width = 1.6,
  depth = 0.55,
  position = [0, 0, 0],
  rotationY = 0,
  stoneColor = ROMAN_PALETTE.travertineDark.color,
  dustTone = 'dust',
}) => {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* 1. Low projecting threshold stone step slab */}
      <mesh receiveShadow position={[0, 0.03, depth * 0.4]}>
        <boxGeometry args={[width + 0.35, 0.06, depth]} />
        <meshStandardMaterial
          color={stoneColor}
          roughness={0.84}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.014}
        />
      </mesh>

      {/* 2. Central foot-worn patina on threshold top surface */}
      <mesh receiveShadow position={[0, 0.062, depth * 0.4]}>
        <boxGeometry args={[width * 0.65, 0.005, depth * 0.65]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.ashlarLight.color}
          roughness={0.76}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.01}
        />
      </mesh>

      {/* 3. Small flanking dust accumulations at both edges of the threshold */}
      <CornerSandDrift
        position={[-width / 2 - 0.2, 0, depth * 0.3]}
        size={[0.45, 0.45]}
        tone={dustTone}
      />
      <CornerSandDrift
        position={[width / 2 + 0.2, 0, depth * 0.3]}
        size={[0.45, 0.45]}
        tone={dustTone}
      />
    </group>
  );
};
