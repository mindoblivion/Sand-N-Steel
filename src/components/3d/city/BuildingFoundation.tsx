import React from 'react';
import * as THREE from 'three';
import { ROMAN_PALETTE, NOISE_TEXTURE } from './RomanMaterials';

interface BuildingFoundationProps {
  /** Width (X) and Depth (Z) of the building footprint to ground */
  size: [number, number];
  /** Vertical elevation/height of the plinth (default 0.3m) */
  height?: number;
  /** Outward projection from the building wall footprint (default 0.25m) */
  projection?: number;
  /** Local position offset relative to building parent group (default [0, 0, 0]) */
  position?: [number, number, number];
  /** Travertine stone base color (default travertineDark) */
  color?: string;
  /** Stone cap / step color (default travertine) */
  capColor?: string;
  /** Ground wear tone at corners: 'sand' | 'dust' | 'forge' | 'none' */
  wearTone?: 'sand' | 'dust' | 'forge' | 'none';
}

/**
 * BuildingFoundation Component
 * Adds an authentic Roman stepped stone podium / plinth beneath building walls,
 * grounding them into the terrain and eliminating the visual floating effect.
 * Phase 25: Integrates subtle corner sand/dust drifts along ground contact edges.
 */
export const BuildingFoundation: React.FC<BuildingFoundationProps> = ({
  size,
  height = 0.3,
  projection = 0.25,
  position = [0, 0, 0],
  color = ROMAN_PALETTE.travertineDark.color,
  capColor = ROMAN_PALETTE.travertine.color,
  wearTone = 'dust',
}) => {
  const [w, d] = size;
  // Lower step: wider, sits on the ground
  const lowerHeight = height * 0.45;
  const lowerWidth = w + projection * 2;
  const lowerDepth = d + projection * 2;

  // Upper stepped plinth: slightly narrower than lower step, directly supports wall
  const upperHeight = height * 0.55;
  const upperWidth = w + projection * 1.2;
  const upperDepth = d + projection * 1.2;

  // Dust color by district tone
  const dustColor =
    wearTone === 'sand'
      ? ROMAN_PALETTE.arenaSand.color
      : wearTone === 'forge'
      ? '#3f3833'
      : '#ab977e';

  // Corner drift size
  const cornerSize = Math.min(1.2, Math.min(w, d) * 0.2);

  return (
    <group position={position}>
      {/* Lower ground contact stone step */}
      <mesh castShadow receiveShadow position={[0, lowerHeight / 2, 0]}>
        <boxGeometry args={[lowerWidth, lowerHeight, lowerDepth]} />
        <meshStandardMaterial
          color={color}
          roughness={0.84}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.018}
        />
      </mesh>

      {/* Upper plinth riser / podium body */}
      <mesh castShadow receiveShadow position={[0, lowerHeight + upperHeight / 2, 0]}>
        <boxGeometry args={[upperWidth, upperHeight, upperDepth]} />
        <meshStandardMaterial
          color={capColor}
          roughness={0.78}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.014}
        />
      </mesh>

      {/* Phase 25: Subtle non-collidable ground dust drifts hugging the lower corners */}
      {wearTone !== 'none' && (
        <group>
          {/* Front-left corner */}
          <mesh receiveShadow position={[-lowerWidth / 2 + cornerSize * 0.3, 0.012, lowerDepth / 2 - cornerSize * 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[cornerSize, cornerSize]} />
            <meshStandardMaterial color={dustColor} roughness={0.94} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.014} />
          </mesh>
          {/* Front-right corner */}
          <mesh receiveShadow position={[lowerWidth / 2 - cornerSize * 0.3, 0.012, lowerDepth / 2 - cornerSize * 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[cornerSize, cornerSize]} />
            <meshStandardMaterial color={dustColor} roughness={0.94} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.014} />
          </mesh>
          {/* Back-left corner */}
          <mesh receiveShadow position={[-lowerWidth / 2 + cornerSize * 0.3, 0.012, -lowerDepth / 2 + cornerSize * 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[cornerSize, cornerSize]} />
            <meshStandardMaterial color={dustColor} roughness={0.94} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.014} />
          </mesh>
          {/* Back-right corner */}
          <mesh receiveShadow position={[lowerWidth / 2 - cornerSize * 0.3, 0.012, -lowerDepth / 2 + cornerSize * 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[cornerSize, cornerSize]} />
            <meshStandardMaterial color={dustColor} roughness={0.94} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.014} />
          </mesh>
        </group>
      )}
    </group>
  );
};
