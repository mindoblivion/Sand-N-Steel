/**
 * BridgeGuards.tsx -- DB-2 'The Bridge Guards'.
 *
 * Two procedural Roman legionary soldiers standing watch flanking the
 * drawbridge approach (city-side bank). Decorative NPCs: no dialogue,
 * no interaction, no AI, no colliders.
 *
 * Audit notes (DB-2, 2026-10-29):
 * - ROMAN_PALETTE has no 'red' and no 'skin'/'flesh' entry, so the brief's
 *   verbatim fallbacks apply: tunic/crest red #991b1b, skin #d9a066.
 * - sharedMaterials has no entry matching the brief's guard tones
 *   (#991b1b / #d9a066 / #3f2d20 / #3a3a3e / #6b4f3a), so guard meshes use
 *   the brief's verbatim colors. No invented material colors.
 * - No delta-accumulator animation pattern exists in the city components,
 *   so the guards are completely static (no useFrame) per the brief.
 */
import * as THREE from 'three';
import { ROMAN_PALETTE, sharedMaterials } from './RomanMaterials';

type PaletteEntry = { color?: string };
const palette = ROMAN_PALETTE as unknown as Record<string, PaletteEntry | undefined>;

// Brief conditionals, resolved against the real palette: use a palette red /
// skin-flesh entry when one exists, else the verbatim fallback.
const TUNIC_RED = palette.red?.color ?? '#991b1b';
const SKIN = palette.skin?.color ?? palette.flesh?.color ?? '#d9a066';
const BELT_LEATHER = '#3f2d20';
const IRON = '#3a3a3e';
const SPEAR_WOOD = '#6b4f3a';

/**
 * Resolve a guard color through the shared material registry: reuse an
 * existing shared material when it already carries the exact tone,
 * otherwise build a local material in the brief's verbatim color.
 * Every resolved color is a brief value -- nothing invented.
 */
function guardMaterial(color: string): THREE.MeshStandardMaterial {
  const hex = color.replace('#', '').toLowerCase();
  const shared = (Object.values(sharedMaterials) as THREE.MeshStandardMaterial[])
    .find((m) => m.color.getHexString().toLowerCase() === hex);
  if (shared) return shared;
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05 });
}

// Module-level materials: the guards are fully static.
const tunicMat = guardMaterial(TUNIC_RED);
const beltMat = guardMaterial(BELT_LEATHER);
const skinMat = guardMaterial(SKIN);
const ironMat = guardMaterial(IRON);
const woodMat = guardMaterial(SPEAR_WOOD);

type Vec3 = [number, number, number];

/**
 * One procedural Roman soldier, feet at Y=0, built facing local +Z.
 * The mount applies rotationY = Math.PI (faces north).
 */
function GuardFigure({ position }: { position: Vec3 }) {
  return (
    <group position={position} rotation-y={Math.PI}>
      {/* 1. Tunic: torso Y 0.9-1.5 */}
      <mesh castShadow position={[0, 1.2, 0]} material={tunicMat}>
        <boxGeometry args={[0.5, 0.6, 0.32]} />
      </mesh>
      {/* 2. Belt */}
      <mesh castShadow position={[0, 0.95, 0]} material={beltMat}>
        <boxGeometry args={[0.54, 0.08, 0.36]} />
      </mesh>
      {/* 3. Head */}
      <mesh castShadow position={[0, 1.72, 0]} material={skinMat}>
        <sphereGeometry args={[0.16, 16, 16]} />
      </mesh>
      {/* 4. Galea helmet + crest */}
      <mesh castShadow position={[0, 1.76, 0]} material={ironMat}>
        <sphereGeometry args={[0.19, 16, 16]} />
      </mesh>
      <mesh castShadow position={[0, 1.95, 0]} material={tunicMat}>
        <boxGeometry args={[0.05, 0.12, 0.3]} />
      </mesh>
      {/* 5. Arms: shoulders Y 1.45 down to Y 1.0 */}
      <mesh castShadow position={[-0.28, 1.225, 0]} material={skinMat}>
        <boxGeometry args={[0.12, 0.5, 0.12]} />
      </mesh>
      <mesh castShadow position={[0.28, 1.225, 0]} material={skinMat}>
        <boxGeometry args={[0.12, 0.5, 0.12]} />
      </mesh>
      {/* 6. Legs: Y 0-0.9 */}
      <mesh castShadow position={[-0.12, 0.45, 0]} material={skinMat}>
        <boxGeometry args={[0.14, 0.9, 0.14]} />
      </mesh>
      <mesh castShadow position={[0.12, 0.45, 0]} material={skinMat}>
        <boxGeometry args={[0.14, 0.9, 0.14]} />
      </mesh>
      {/* 7. Spear (hasta) + iron tip */}
      <mesh castShadow position={[0.35, 1.1, 0]} material={woodMat}>
        <cylinderGeometry args={[0.03, 0.03, 2.2, 8]} />
      </mesh>
      <mesh castShadow position={[0.35, 2.325, 0]} material={ironMat}>
        <coneGeometry args={[0.05, 0.25, 8]} />
      </mesh>
      {/* 8. Scutum (curved segment, outer face -X) + iron boss */}
      <mesh castShadow position={[-0.35, 1.1, 0.1]} material={tunicMat}>
        <cylinderGeometry args={[0.35, 0.35, 0.9, 12, 1, true, -Math.PI / 2 - 0.6, 1.2]} />
      </mesh>
      <mesh castShadow position={[-0.7, 1.1, 0.1]} material={ironMat}>
        <sphereGeometry args={[0.07, 12, 12]} />
      </mesh>
    </group>
  );
}

/**
 * Both bridge guards, flanking the approach 1.0 outside the drawbridge
 * anchor posts (at +-2.5) and 1.0 south of them (Z -48.5 vs -49.5).
 */
export function BridgeGuards() {
  return (
    <group>
      <GuardFigure position={[-3.5, 0, -48.5]} />
      <GuardFigure position={[3.5, 0, -48.5]} />
    </group>
  );
}
