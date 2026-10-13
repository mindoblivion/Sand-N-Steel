import React from 'react';
import * as THREE from 'three';
import { ROMAN_PALETTE, NOISE_TEXTURE } from './RomanMaterials';
import { Banner } from './EnvironmentalMotion';

// ── Shared timber materials (created once, reused across all equipment) ──
const timberPost = new THREE.MeshStandardMaterial({
  color: '#6b4a2e',       // warm aged pine — visible grain tone
  roughness: 0.88,
  metalness: 0.02,
  bumpMap: NOISE_TEXTURE || null,
  bumpScale: 0.03,
});
const timberDark = new THREE.MeshStandardMaterial({
  color: '#4a3220',       // darker timber for crossbars / rack frame
  roughness: 0.9,
  metalness: 0.02,
  bumpMap: NOISE_TEXTURE || null,
  bumpScale: 0.025,
});
const ropeWrap = new THREE.MeshStandardMaterial({
  color: '#a07b4e',       // hemp-rope tone
  roughness: 0.95,
  metalness: 0.0,
  bumpMap: NOISE_TEXTURE || null,
  bumpScale: 0.04,
});
const strawMat = new THREE.MeshStandardMaterial({
  color: '#b89255',       // dried straw / reed — muted, not bright yellow
  roughness: 0.96,
  metalness: 0.0,
  bumpMap: NOISE_TEXTURE || null,
  bumpScale: 0.05,
});
const leatherWrap = new THREE.MeshStandardMaterial({
  color: '#5c3d28',       // worn leather for head coverings
  roughness: 0.82,
  metalness: 0.03,
  bumpMap: NOISE_TEXTURE || null,
  bumpScale: 0.02,
});
const shieldWood = new THREE.MeshStandardMaterial({
  color: '#7a5c3a',       // practice shield wood
  roughness: 0.85,
  metalness: 0.03,
  bumpMap: NOISE_TEXTURE || null,
  bumpScale: 0.02,
});
const shieldRim = new THREE.MeshStandardMaterial({
  color: '#3d2b1a',
  roughness: 0.8,
  metalness: 0.05,
});
const rudisBlade = new THREE.MeshStandardMaterial({
  color: '#9a7b52',       // wooden training sword blade
  roughness: 0.78,
  metalness: 0.02,
  bumpMap: NOISE_TEXTURE || null,
  bumpScale: 0.015,
});
const rudisHandle = new THREE.MeshStandardMaterial({
  color: '#4a3220',
  roughness: 0.85,
  metalness: 0.02,
});

// ── Stone enclosure wall materials (shared, reused across all segments) ──
const wallStone = new THREE.MeshStandardMaterial({
  color: ROMAN_PALETTE.travertineDark.color,
  roughness: 0.82,
  metalness: 0.04,
  bumpMap: NOISE_TEXTURE || null,
  bumpScale: 0.02,
});
const copingStone = new THREE.MeshStandardMaterial({
  color: ROMAN_PALETTE.travertine.color,
  roughness: 0.78,
  metalness: 0.04,
  bumpMap: NOISE_TEXTURE || null,
  bumpScale: 0.015,
});
const pierStone = new THREE.MeshStandardMaterial({
  color: ROMAN_PALETTE.ashlarLight.color,
  roughness: 0.82,
  metalness: 0.04,
  bumpMap: NOISE_TEXTURE || null,
  bumpScale: 0.016,
});

// ── Stone enclosure wall geometry constants ──
// Entrance faces +X (local), confirmed to align with the Via Decumanus street
// approach at world [-11, 0, 0] (street boundary walls at world x=-13.5, z=±4.5
// create a corridor leading to this entrance).
const WALL_RADIUS = 7.0;
const WALL_HEIGHT = 0.9;
const WALL_THICKNESS = 0.35;
const ENTRANCE_CHORD = 2.5;
const ENTRANCE_HALF_ANGLE = Math.asin(ENTRANCE_CHORD / (2 * WALL_RADIUS));
const NUM_SEGMENTS = 14;
const WALL_ARC = Math.PI * 2 - 2 * ENTRANCE_HALF_ANGLE;
const SEGMENT_ANGLE = WALL_ARC / NUM_SEGMENTS;
// Use outer-edge chord so adjacent segments overlap slightly (no visible gaps)
const SEGMENT_WIDTH = 2 * (WALL_RADIUS + WALL_THICKNESS / 2) * Math.sin(SEGMENT_ANGLE / 2);
const GATE_X = WALL_RADIUS * Math.cos(ENTRANCE_HALF_ANGLE);

// ── A single gladiator pell dummy (palus) ──
// Stone base → tapered timber post → rope-wrapped strike zone → crossbar arms → leather-wrapped head.
// Proportioned to ~1.25 units tall (matching the ~1.10-unit-tall player).
const PellDummy: React.FC<{ position: [number, number, number]; rotationY?: number }> = React.memo(
  ({ position, rotationY = 0 }) => (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Stone base anchor — flat disc, sits on ground */}
      <mesh castShadow receiveShadow position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.42, 0.5, 0.12, 12]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.ashlarLight.color}
          roughness={ROMAN_PALETTE.ashlarLight.roughness}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.012}
        />
      </mesh>

      {/* Tapered timber post — wider at base, narrower at top */}
      <mesh castShadow position={[0, 0.62, 0]}>
        <cylinderGeometry args={[0.12, 0.18, 1.0, 8]} />
        <primitive object={timberPost} attach="material" />
      </mesh>

      {/* Rope-wrapped strike zone — slightly fatter cylinder with visible rope rings */}
      <mesh castShadow position={[0, 0.62, 0]}>
        <cylinderGeometry args={[0.18, 0.2, 0.65, 10]} />
        <primitive object={ropeWrap} attach="material" />
      </mesh>
      {/* Rope binding rings (3 torus rings spaced along the strike zone) */}
      {[0.38, 0.62, 0.86].map((ry) => (
        <mesh key={`rope-ring-${ry}`} position={[0, ry, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.19, 0.025, 6, 12]} />
          <primitive object={ropeWrap} attach="material" />
        </mesh>
      ))}

      {/* Crossbar arms — represents a raised guard, at shoulder height */}
      <mesh castShadow position={[0, 0.95, 0]}>
        <boxGeometry args={[0.95, 0.1, 0.1]} />
        <primitive object={timberDark} attach="material" />
      </mesh>
      {/* Cap blocks on crossbar ends */}
      <mesh castShadow position={[0.5, 0.95, 0]}>
        <boxGeometry args={[0.1, 0.14, 0.14]} />
        <primitive object={timberDark} attach="material" />
      </mesh>
      <mesh castShadow position={[-0.5, 0.95, 0]}>
        <boxGeometry args={[0.1, 0.14, 0.14]} />
        <primitive object={timberDark} attach="material" />
      </mesh>

      {/* Head — slightly flattened sphere wrapped in leather, not bright yellow */}
      <mesh castShadow position={[0, 1.2, 0]} scale={[1, 1.15, 1]}>
        <sphereGeometry args={[0.14, 10, 8]} />
        <primitive object={leatherWrap} attach="material" />
      </mesh>
    </group>
  ),
);
PellDummy.displayName = 'PellDummy';

// ── A wooden rudis (training sword) on the rack ──
const Rudis: React.FC<{ position: [number, number, number] }> = React.memo(({ position }) => (
  <group position={position} rotation={[0.18, 0, 0]}>
    {/* Blade — flat wooden lath */}
    <mesh castShadow position={[0, 0.45, 0]}>
      <boxGeometry args={[0.07, 0.8, 0.025]} />
      <primitive object={rudisBlade} attach="material" />
    </mesh>
    {/* Guard */}
    <mesh castShadow position={[0, 0.05, 0]}>
      <boxGeometry args={[0.16, 0.04, 0.04]} />
      <primitive object={rudisHandle} attach="material" />
    </mesh>
    {/* Handle */}
    <mesh castShadow position={[0, -0.12, 0]}>
      <cylinderGeometry args={[0.025, 0.025, 0.22, 6]} />
      <primitive object={rudisHandle} attach="material" />
    </mesh>
    {/* Pommel */}
    <mesh castShadow position={[0, -0.25, 0]}>
      <sphereGeometry args={[0.03, 6, 6]} />
      <primitive object={rudisHandle} attach="material" />
    </mesh>
  </group>
));
Rudis.displayName = 'Rudis';

// ── A practice shield leaning against the rack ──
const PracticeShield: React.FC<{ position: [number, number, number]; rotationY: number }> = React.memo(
  ({ position, rotationY }) => (
    <group position={position} rotation={[0.15, rotationY, 0]}>
      {/* Shield board — convex disk */}
      <mesh castShadow position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.04, 14]} />
        <primitive object={shieldWood} attach="material" />
      </mesh>
      {/* Rim band */}
      <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.35, 0.025, 6, 16]} />
        <primitive object={shieldRim} attach="material" />
      </mesh>
      {/* Center boss */}
      <mesh castShadow position={[0, 0.04, 0]}>
        <sphereGeometry args={[0.07, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <primitive object={shieldRim} attach="material" />
      </mesh>
    </group>
  ),
);
PracticeShield.displayName = 'PracticeShield';

// ── Weapon rack — A-frame timber stand with crossbar ──
const WeaponRack: React.FC<{ position: [number, number, number]; rotationY: number }> = React.memo(
  ({ position, rotationY }) => (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Left A-frame post */}
      <mesh castShadow position={[-0.9, 0.5, 0]} rotation={[0, 0, 0.12]}>
        <cylinderGeometry args={[0.06, 0.08, 1.0, 6]} />
        <primitive object={timberDark} attach="material" />
      </mesh>
      {/* Right A-frame post */}
      <mesh castShadow position={[0.9, 0.5, 0]} rotation={[0, 0, -0.12]}>
        <cylinderGeometry args={[0.06, 0.08, 1.0, 6]} />
        <primitive object={timberDark} attach="material" />
      </mesh>
      {/* Lower crossbar (sword rests) */}
      <mesh castShadow position={[0, 0.6, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 1.85, 6]} />
        <primitive object={timberDark} attach="material" />
      </mesh>
      {/* Upper crossbar (structural) */}
      <mesh castShadow position={[0, 0.88, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 1.85, 6]} />
        <primitive object={timberDark} attach="material" />
      </mesh>

      {/* Rudis training swords hanging on the lower crossbar */}
      {[-0.55, -0.2, 0.15, 0.5].map((sx, i) => (
        <Rudis key={`rudis-${i}`} position={[sx, 0.62, 0.12]} />
      ))}

      {/* Practice shields leaning against the rack base */}
      <PracticeShield position={[-1.2, 0.18, 0.15]} rotationY={0.3} />
      <PracticeShield position={[1.15, 0.18, 0.15]} rotationY={-0.3} />
    </group>
  ),
);
WeaponRack.displayName = 'WeaponRack';

// ── Stone wall segment with coping stones ──
const StoneWallSegment: React.FC<{ angle: number }> = React.memo(({ angle }) => {
  const px = Math.cos(angle) * WALL_RADIUS;
  const pz = Math.sin(angle) * WALL_RADIUS;
  return (
    <group position={[px, 0, pz]} rotation={[0, -angle - Math.PI / 2, 0]}>
      {/* Wall body */}
      <mesh castShadow receiveShadow position={[0, WALL_HEIGHT / 2, 0]}>
        <boxGeometry args={[SEGMENT_WIDTH, WALL_HEIGHT, WALL_THICKNESS]} />
        <primitive object={wallStone} attach="material" />
      </mesh>
      {/* Coping stone cap */}
      <mesh castShadow position={[0, WALL_HEIGHT + 0.04, 0]}>
        <boxGeometry args={[SEGMENT_WIDTH + 0.04, 0.08, WALL_THICKNESS + 0.06]} />
        <primitive object={copingStone} attach="material" />
      </mesh>
    </group>
  );
});
StoneWallSegment.displayName = 'StoneWallSegment';

// ── Stone pier with cap (also used for gateposts via props) ──
const StonePier: React.FC<{
  angle: number;
  height?: number;
  width?: number;
  capWidth?: number;
}> = React.memo(({ angle, height = 1.1, width = 0.5, capWidth = 0.56 }) => {
  const px = Math.cos(angle) * WALL_RADIUS;
  const pz = Math.sin(angle) * WALL_RADIUS;
  return (
    <group position={[px, 0, pz]} rotation={[0, -angle - Math.PI / 2, 0]}>
      <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, width]} />
        <primitive object={pierStone} attach="material" />
      </mesh>
      <mesh castShadow position={[0, height + 0.03, 0]}>
        <boxGeometry args={[capWidth, 0.08, capWidth]} />
        <primitive object={copingStone} attach="material" />
      </mesh>
    </group>
  );
});
StonePier.displayName = 'StonePier';

export const TrainingYard = React.memo(() => {
  return (
    <group position={[-18, 0, 0]}>
      {/* 0. STEPPED TRAVERTINE RETAINING FOUNDATION PLINTH */}
      {/* Lower ground step around sand circle */}
      <mesh receiveShadow castShadow position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[6.9, 7.3, 32]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.travertineDark.color}
          roughness={ROMAN_PALETTE.travertineDark.roughness}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.015}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Upper retaining stone curb */}
      <mesh position={[0, 0.16, 0]}>
        <torusGeometry args={[7.0, 0.12, 8, 32]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.travertine.color}
          roughness={ROMAN_PALETTE.travertine.roughness}
        />
      </mesh>

      {/* 1. SANDY GLADIATOR TRAINING RING (WARM GOLDEN ARENA SAND) */}
      <mesh receiveShadow position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[6.8, 24]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.arenaSand.color}
          roughness={ROMAN_PALETTE.arenaSand.roughness}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.02}
        />
      </mesh>

      {/* 2. STONE PERIMETER WALL ENCLOSURE (LUDUS) */}
      {/* Low Roman stone wall with entrance gate, replacing timber palisade */}

      {/* Wall segments around the circle, skipping the entrance gap */}
      {Array.from({ length: NUM_SEGMENTS }).map((_, i) => {
        const angle = ENTRANCE_HALF_ANGLE + (i + 0.5) * SEGMENT_ANGLE;
        return <StoneWallSegment key={`wall-seg-${i}`} angle={angle} />;
      })}

      {/* Intermediate piers at every 3rd segment boundary */}
      {[3, 6, 9, 12].map((k) => {
        const angle = ENTRANCE_HALF_ANGLE + k * SEGMENT_ANGLE;
        return <StonePier key={`pier-${k}`} angle={angle} />;
      })}

      {/* Entrance gateposts (taller and wider than wall piers) */}
      <StonePier angle={ENTRANCE_HALF_ANGLE} height={1.5} width={0.6} capWidth={0.66} />
      <StonePier angle={-ENTRANCE_HALF_ANGLE} height={1.5} width={0.6} capWidth={0.66} />

      {/* Timber lintel across the entrance */}
      <mesh castShadow position={[GATE_X, 1.5, 0]}>
        <boxGeometry args={[0.22, 0.2, 2.7]} />
        <primitive object={timberDark} attach="material" />
      </mesh>

      {/* Crimson banner hanging from the lintel */}
      <Banner position={[GATE_X, 0.95, 0]} rotation={[0, Math.PI / 2, 0]} size={[0.9, 0.7]} color="#b91c1c" />

      {/* Travertine paved threshold at the entrance */}
      <mesh receiveShadow position={[WALL_RADIUS, 0.02, 0]}>
        <boxGeometry args={[2.5, 0.03, 2.5]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.forumPaving.color}
          roughness={ROMAN_PALETTE.forumPaving.roughness}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.012}
        />
      </mesh>

      {/* 3. WOODEN PELL TRAINING DUMMIES (PALLUS) — redesigned with proper proportions */}
      {/* Positions kept identical to preserve spatial layout for movement/camera */}
      {[
        [-2.4, 0, -1.8, 0.4],
        [1.8, 0, -2.2, -0.6],
        [-1.6, 0, 2.4, 1.2],
      ].map(([x, y, z, rot], di) => (
        <PellDummy key={`dummy-${di}`} position={[x, y, z]} rotationY={rot} />
      ))}

      {/* 4. WEAPON RACK WITH WOODEN RUDIS SWORDS & PRACTICE SHIELDS */}
      <WeaponRack position={[3.6, 0, 1.2]} rotationY={-Math.PI / 3} />

      {/* 5. STONE LIFTING WEIGHTS & HALTERES */}
      <group position={[-3.8, 0, 0]}>
        <mesh castShadow position={[0, 0.3, 0]}>
          <sphereGeometry args={[0.35, 10, 10]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.ashlarStone.color}
            roughness={ROMAN_PALETTE.ashlarStone.roughness}
            bumpMap={NOISE_TEXTURE || undefined}
            bumpScale={0.015}
          />
        </mesh>
        <mesh castShadow position={[0.6, 0.25, 0.3]}>
          <sphereGeometry args={[0.28, 10, 10]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.ashlarStone.color}
            roughness={ROMAN_PALETTE.ashlarStone.roughness}
            bumpMap={NOISE_TEXTURE || undefined}
            bumpScale={0.015}
          />
        </mesh>
      </group>

      {/* 6. TRAINING YARD FIRE BRAZIER */}
      <group position={[4.5, 0, -3.2]}>
        <mesh castShadow position={[0, 0.7, 0]}>
          <cylinderGeometry args={[0.45, 0.35, 1.4, 10]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.agedBronze.color}
            metalness={ROMAN_PALETTE.agedBronze.metalness}
            roughness={ROMAN_PALETTE.agedBronze.roughness}
          />
        </mesh>
        <mesh position={[0, 1.5, 0]}>
          <sphereGeometry args={[0.25, 8, 8]} />
          <meshStandardMaterial color="#ff5722" emissive="#f97316" emissiveIntensity={3} />
        </mesh>
        <pointLight color="#f97316" intensity={3.2} distance={8} position={[0, 1.8, 0]} />
      </group>
    </group>
  );
});
