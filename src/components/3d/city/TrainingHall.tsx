import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BuildingFoundation } from './BuildingFoundation';
import {
  RomanGabledRoof,
  ClassicalDoorway,
  ClassicalWindow,
  CornerQuoins,
  WallCornice,
} from './ClassicalArchitecture';
import { NOISE_TEXTURE, ROMAN_PALETTE } from './RomanMaterials';

// ── Training Hall dimensions (local to TrainingYard parent at [-18,0,0]) ──
// Centre: local (-3, 0, -8.4)  →  world (-21, 0, -8.4)
// Width X: 7   Depth Z: 2.6   Wall height: 3.0
// South face at local z = -7.1 (0.1 behind the Phase 27.2 perimeter wall)
// Colosseum clearance: NE corner dist 20.31 > 19.5  ✓ (margin 0.81)
// Barracks clearance: roof Z-gap 0.85   ✓ (was 0.45 at depth 3.0 / z -8.6)

const HALL_W = 7;
const HALL_D = 2.6;
const WALL_H = 3.0;

// Material instances (shared across the hall)
const wallMat = new THREE.MeshStandardMaterial({
  color: '#ebdcb9',
  roughness: 0.68,
  bumpMap: NOISE_TEXTURE || null,
  bumpScale: 0.012,
});
const quoinMat = new THREE.MeshStandardMaterial({
  color: '#d4a373',
  roughness: 0.78,
  bumpMap: NOISE_TEXTURE || null,
  bumpScale: 0.014,
});
const timberMat = new THREE.MeshStandardMaterial({
  color: '#451a03',
  roughness: 0.85,
});
const canopyMat = new THREE.MeshStandardMaterial({
  color: ROMAN_PALETTE.terracottaTile.color,
  roughness: 0.75,
  bumpMap: NOISE_TEXTURE || null,
  bumpScale: 0.015,
});
const bannerMat = new THREE.MeshStandardMaterial({
  color: '#b91c1c',
  roughness: 0.82,
  side: THREE.DoubleSide,
});
const emblemMat = new THREE.MeshStandardMaterial({
  color: '#ca8a04',
  roughness: 0.4,
  metalness: 0.6,
});
const ironMat = new THREE.MeshStandardMaterial({
  color: ROMAN_PALETTE.darkIron.color,
  roughness: 0.5,
  metalness: 0.8,
});

/**
 * TrainingHall — a single-storey Roman gladiator training school (ludus)
 * with a gabled terracotta roof, shaded south veranda, crimson banner, and
 * crossed-swords emblem.  Designed to be unmistakably a training facility
 * from the third-person mobile camera.
 *
 * Rendered inside the TrainingYard group; the hall sits just behind the
 * north perimeter wall and is visible above the low (0.9-unit) wall.
 */
export const TrainingHall: React.FC = React.memo(() => {
  const bannerRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (bannerRef.current) {
      const t = state.clock.getElapsedTime();
      bannerRef.current.rotation.z = Math.sin(t * 1.2) * 0.03;
    }
  });

  // Veranda dimensions (in component-local coords, hall centred at [0,0,0])
  const VERANDA_HALF_W = 1.5;            // 3 units wide
  const VERANDA_SOUTH_Z = 4.0;           // courtyard-side post z (local z=-5.0 in yard)
  const CANOPY_Y = WALL_H;               // canopy at wall-top height
  const POST_R = 0.09;

  return (
    <group position={[-3, 0, -8.4]}>
      {/* 0. STEPPED TRAVERTINE FOUNDATION */}
      <BuildingFoundation
        size={[HALL_W, HALL_D]}
        height={0.3}
        projection={0.25}
        color="#e5d0b1"
        capColor="#ebdcb9"
        wearTone="sand"
      />

      {/* 1. MAIN WALL BODY (warm limestone / travertine) */}
      <mesh castShadow receiveShadow position={[0, 0.3 + WALL_H / 2, 0]}>
        <boxGeometry args={[HALL_W, WALL_H, HALL_D]} />
        <primitive object={wallMat} attach="material" />
      </mesh>

      {/* Corner quoins */}
      <CornerQuoins height={WALL_H + 0.3} buildingSize={[HALL_W, HALL_D]} color={quoinMat.color ? '#d4a373' : '#d4a373'} blockHeight={0.5} />

      {/* Eave cornice below roof */}
      <WallCornice size={[HALL_W, HALL_D]} y={0.3 + WALL_H} color="#ebdcb9" height={0.16} projection={0.12} />

      {/* 2. TERRACOTTA GABLED ROOF (ridge along X → gable faces south toward courtyard) */}
      <RomanGabledRoof
        width={HALL_W}
        depth={HALL_D}
        height={1.4}
        eaveOverhang={0.4}
        ridgeAlong="x"
        position={[0, 0.3 + WALL_H + 0.16, 0]}
        tileColor="#9e492f"
        trimColor="#ebdcb9"
        tympanumColor="#d97706"
      />

      {/* 3. SOUTH FACE: doorway + flanking windows */}
      {/* Central timber-frame doorway (south face at z = +HALL_D/2) */}
      <ClassicalDoorway
        position={[0, 0.3, HALL_D / 2]}
        width={1.8}
        height={2.2}
        depth={0.35}
        stoneColor="#d4a373"
        recessColor="#141210"
        wearTone="sand"
      />

      {/* Windows flanking the door */}
      <ClassicalWindow
        position={[-2.2, 0.3 + 1.5, HALL_D / 2 + 0.02]}
        width={0.7}
        height={0.95}
        stoneColor="#d4a373"
      />
      <ClassicalWindow
        position={[2.2, 0.3 + 1.5, HALL_D / 2 + 0.02]}
        width={0.7}
        height={0.95}
        stoneColor="#d4a373"
      />

      {/* 4. VERANDA — south-facing shaded canopy with timber posts */}
      {/* 4a. Veranda canopy (sloped slightly for rain, extends south from hall face) */}
      <mesh
        castShadow
        position={[0, CANOPY_Y - 0.15, HALL_D / 2 + (VERANDA_SOUTH_Z - HALL_D / 2) / 2]}
        rotation={[-0.12, 0, 0]}
      >
        <boxGeometry args={[VERANDA_HALF_W * 2 + 0.3, 0.08, VERANDA_SOUTH_Z - HALL_D / 2 + 0.15]} />
        <primitive object={canopyMat} attach="material" />
      </mesh>

      {/* 4b. Veranda timber posts (4: 2 at building face, 2 in courtyard) */}
      {[
        [-VERANDA_HALF_W, HALL_D / 2],
        [VERANDA_HALF_W, HALL_D / 2],
        [-VERANDA_HALF_W, VERANDA_SOUTH_Z],
        [VERANDA_HALF_W, VERANDA_SOUTH_Z],
      ].map(([px, pz], i) => (
        <mesh key={`vpost-${i}`} castShadow position={[px, 0.3 + CANOPY_Y / 2, pz]}>
          <cylinderGeometry args={[POST_R, POST_R, CANOPY_Y, 6]} />
          <primitive object={timberMat} attach="material" />
        </mesh>
      ))}

      {/* 4c. Horizontal timber beam connecting courtyard posts (front of veranda) */}
      <mesh castShadow position={[0, 0.3 + CANOPY_Y - 0.05, VERANDA_SOUTH_Z]}>
        <boxGeometry args={[VERANDA_HALF_W * 2 + 0.2, 0.1, 0.08]} />
        <primitive object={timberMat} attach="material" />
      </mesh>

      {/* 5. LARGE CRIMSON BANNER on the gable / south wall (above door) */}
      <group ref={bannerRef} position={[0, 0.3 + WALL_H + 0.7, HALL_D / 2 + 0.05]}>
        {/* Banner crossbar */}
        <mesh castShadow position={[0, 0.8, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.04, 2.2, 6]} />
          <primitive object={timberMat} attach="material" />
        </mesh>
        {/* Crimson fabric */}
        <mesh castShadow position={[0, 0, 0.02]}>
          <boxGeometry args={[1.8, 1.5, 0.03]} />
          <primitive object={bannerMat} attach="material" />
        </mesh>
        {/* Gold central stripe */}
        <mesh position={[0, 0, 0.04]}>
          <boxGeometry args={[0.18, 1.5, 0.01]} />
          <primitive object={emblemMat} attach="material" />
        </mesh>
      </group>

      {/* 6. CROSSED-SWORDS EMBLEM on south wall (flanking the banner, identifying ludus) */}
      {/* Left crossed swords */}
      <group position={[-2.6, 0.3 + 1.8, HALL_D / 2 + 0.03]}>
        <mesh castShadow rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.06, 1.0, 0.04]} />
          <primitive object={ironMat} attach="material" />
        </mesh>
        <mesh castShadow rotation={[0, 0, -Math.PI / 4]}>
          <boxGeometry args={[0.06, 1.0, 0.04]} />
          <primitive object={ironMat} attach="material" />
        </mesh>
        {/* Crossguard accents */}
        <mesh castShadow position={[0, 0, 0.01]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.22, 0.05, 0.04]} />
          <primitive object={emblemMat} attach="material" />
        </mesh>
        <mesh castShadow position={[0, 0, 0.01]} rotation={[0, 0, -Math.PI / 4]}>
          <boxGeometry args={[0.22, 0.05, 0.04]} />
          <primitive object={emblemMat} attach="material" />
        </mesh>
      </group>
      {/* Right crossed swords */}
      <group position={[2.6, 0.3 + 1.8, HALL_D / 2 + 0.03]}>
        <mesh castShadow rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.06, 1.0, 0.04]} />
          <primitive object={ironMat} attach="material" />
        </mesh>
        <mesh castShadow rotation={[0, 0, -Math.PI / 4]}>
          <boxGeometry args={[0.06, 1.0, 0.04]} />
          <primitive object={ironMat} attach="material" />
        </mesh>
        <mesh castShadow position={[0, 0, 0.01]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.22, 0.05, 0.04]} />
          <primitive object={emblemMat} attach="material" />
        </mesh>
        <mesh castShadow position={[0, 0, 0.01]} rotation={[0, 0, -Math.PI / 4]}>
          <boxGeometry args={[0.22, 0.05, 0.04]} />
          <primitive object={emblemMat} attach="material" />
        </mesh>
      </group>

      {/* 7. BENCH & EQUIPMENT UNDER VERANDA */}
      {/* Stone bench under the veranda canopy */}
      <group position={[0, 0, HALL_D / 2 + 1.2]}>
        {/* Bench seat slab */}
        <mesh castShadow receiveShadow position={[0, 0.45, 0]}>
          <boxGeometry args={[1.8, 0.12, 0.55]} />
          <meshStandardMaterial color="#ecd9be" roughness={0.5} />
        </mesh>
        {/* Bench legs */}
        {[-0.7, 0.7].map((bx, i) => (
          <mesh key={`bench-leg-${i}`} castShadow position={[bx, 0.22, 0]}>
            <boxGeometry args={[0.18, 0.44, 0.48]} />
            <meshStandardMaterial color="#d4a373" roughness={0.7} />
          </mesh>
        ))}
      </group>

      {/* Practice shields leaning against the hall wall under the veranda */}
      <group position={[-1.2, 0, HALL_D / 2 + 0.4]}>
        <mesh castShadow position={[0, 0.25, 0]} rotation={[0.1, 0.3, 0.12]}>
          <cylinderGeometry args={[0.32, 0.32, 0.04, 12]} />
          <meshStandardMaterial color="#7a5c3a" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.27, 0]} rotation={[0.1, 0.3, 0.12]}>
          <torusGeometry args={[0.32, 0.025, 6, 14]} />
          <meshStandardMaterial color="#3d2b1a" roughness={0.8} />
        </mesh>
      </group>
      <group position={[1.2, 0, HALL_D / 2 + 0.4]}>
        <mesh castShadow position={[0, 0.25, 0]} rotation={[0.1, -0.3, -0.12]}>
          <cylinderGeometry args={[0.32, 0.32, 0.04, 12]} />
          <meshStandardMaterial color="#7a5c3a" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.27, 0]} rotation={[0.1, -0.3, -0.12]}>
          <torusGeometry args={[0.32, 0.025, 6, 14]} />
          <meshStandardMaterial color="#3d2b1a" roughness={0.8} />
        </mesh>
      </group>

      {/* A wooden rudis leaning against the wall beside the door */}
      <group position={[0, 0, HALL_D / 2 + 0.3]} rotation={[0, 0, 0.15]}>
        <mesh castShadow position={[0, 0.5, 0]}>
          <boxGeometry args={[0.06, 0.9, 0.025]} />
          <meshStandardMaterial color="#9a7b52" roughness={0.78} />
        </mesh>
        <mesh castShadow position={[0, 0.08, 0]}>
          <boxGeometry args={[0.14, 0.04, 0.04]} />
          <meshStandardMaterial color="#4a3220" roughness={0.85} />
        </mesh>
      </group>
    </group>
  );
});
