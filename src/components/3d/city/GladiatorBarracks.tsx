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

export const GladiatorBarracks: React.FC = () => {
  const bannerRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (bannerRef.current) {
      const time = state.clock.getElapsedTime();
      // Slow gentle sway representing breeze
      bannerRef.current.rotation.y = Math.sin(time * 1.5) * 0.08;
      bannerRef.current.rotation.z = Math.cos(time * 1.2) * 0.03;
    }
  });

  return (
    <group position={[-27, 0, -14]}>
      {/* 0. STEPPED TRAVERTINE FOUNDATION PODIUM */}
      <BuildingFoundation size={[6.6, 5.6]} height={0.3} projection={0.25} color="#e5d0b1" capColor="#ebdcb9" />

      {/* 1. LOWER STONE STRUCTURE (TRAVERTINE) */}
      <mesh castShadow receiveShadow position={[0, 1.0, 0]}>
        <boxGeometry args={[6.6, 2.0, 5.6]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.65} />
      </mesh>

      {/* Lower Stone Corner Quoins */}
      <CornerQuoins height={2.0} buildingSize={[6.6, 5.6]} color="#d4a373" blockHeight={0.4} />

      {/* Mid-Floor Travertine String Course */}
      <WallCornice size={[6.6, 5.6]} y={2.0} color="#d4a373" height={0.16} projection={0.12} />

      {/* 2. UPPER STUCCO STRUCTURE (WARM TERRACOTTA/YELLOW STUCCO) */}
      <mesh castShadow receiveShadow position={[0, 3.0, 0]}>
        <boxGeometry args={[6.4, 2.0, 5.4]} />
        <meshStandardMaterial color="#d97706" roughness={0.7} />
      </mesh>

      {/* Upper Floor Windows */}
      <ClassicalWindow
        position={[-1.8, 3.1, 2.72]}
        width={0.7}
        height={0.85}
        stoneColor="#d4a373"
      />
      <ClassicalWindow
        position={[1.8, 3.1, 2.72]}
        width={0.7}
        height={0.85}
        stoneColor="#d4a373"
      />

      {/* Eave Cornice Below Roof */}
      <WallCornice size={[6.4, 5.4]} y={3.95} color="#ebdcb9" height={0.16} projection={0.12} />

      {/* 3. TERRACOTTA GABLED ROOF WITH OVERHANGS & RIDGE CAP */}
      <RomanGabledRoof
        width={6.4}
        depth={5.4}
        height={1.3}
        eaveOverhang={0.35}
        ridgeAlong="z"
        position={[0, 4.0, 0]}
        tileColor="#b45309"
        trimColor="#ebdcb9"
        tympanumColor="#d97706"
      />

      {/* Recessed Barracks Heavy Timber Doorway */}
      <ClassicalDoorway
        position={[0, 0, 2.82]}
        width={1.5}
        height={1.9}
        depth={0.35}
        stoneColor="#d4a373"
        recessColor="#141210"
      />

      {/* 4. DARK TIMBER DETAILS & BALCONY */}
      {/* Wooden support posts */}
      {[-3.0, 3.0].map((x, i) => (
        <mesh key={`post-${i}`} castShadow position={[x, 2.0, 2.6]}>
          <cylinderGeometry args={[0.08, 0.08, 4.0, 6]} />
          <meshStandardMaterial color="#451a03" roughness={0.8} />
        </mesh>
      ))}

      {/* Front wooden balcony rail on second floor */}
      <mesh castShadow position={[0, 2.1, 2.7]}>
        <boxGeometry args={[6.2, 0.2, 0.1]} />
        <meshStandardMaterial color="#451a03" roughness={0.8} />
      </mesh>
      {Array.from({ length: 7 }).map((_, i) => {
        const x = -2.7 + i * 0.9;
        return (
          <mesh key={`baluster-${i}`} castShadow position={[x, 2.3, 2.7]}>
            <cylinderGeometry args={[0.03, 0.03, 0.4, 4]} />
            <meshStandardMaterial color="#451a03" roughness={0.8} />
          </mesh>
        );
      })}
      <mesh castShadow position={[0, 2.5, 2.7]}>
        <boxGeometry args={[6.2, 0.1, 0.12]} />
        <meshStandardMaterial color="#451a03" roughness={0.8} />
      </mesh>

      {/* 5. VISIBLE OUTSIDE PROPS (BUNK BED / LOCKER SILHOUETTES & PRACTICE GEAR) */}
      {/* Small Timber Locker/Chest outside */}
      <group position={[2.2, 0.25, 2.2]}>
        <mesh castShadow>
          <boxGeometry args={[0.8, 0.5, 0.5]} />
          <meshStandardMaterial color="#78350f" roughness={0.8} />
        </mesh>
        {/* Metal banding */}
        <mesh position={[0, 0.01, 0]}>
          <boxGeometry args={[0.82, 0.52, 0.42]} />
          <meshStandardMaterial color="#4b5563" metalness={0.7} roughness={0.4} />
        </mesh>
      </group>

      {/* Wooden Bunk Bed Silhouette inside recessed alcove/porch */}
      <group position={[-2.0, 0.5, 2.2]}>
        {/* Simple wooden bed frame */}
        <mesh castShadow position={[0, 0, 0]}>
          <boxGeometry args={[1.2, 0.15, 0.6]} />
          <meshStandardMaterial color="#451a03" roughness={0.9} />
        </mesh>
        <mesh castShadow position={[0, 0.8, 0]}>
          <boxGeometry args={[1.2, 0.1, 0.6]} />
          <meshStandardMaterial color="#451a03" roughness={0.9} />
        </mesh>
        {/* Corner bedposts */}
        {[[-0.58, -0.28], [0.58, -0.28], [-0.58, 0.28], [0.58, 0.28]].map((coords, i) => (
          <mesh key={`bedpost-${i}`} castShadow position={[coords[0], 0.4, coords[1]]}>
            <cylinderGeometry args={[0.03, 0.03, 1.2, 4]} />
            <meshStandardMaterial color="#451a03" roughness={0.9} />
          </mesh>
        ))}
      </group>

      {/* Hanging Practice Wooden Swords / Gear on Wall */}
      <group position={[0, 1.0, 2.82]}>
        {/* Crossed wooden gladii on lower wall */}
        <mesh castShadow position={[-1.2, 0.2, 0]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.06, 0.8, 0.04]} />
          <meshStandardMaterial color="#ca8a04" roughness={0.7} />
        </mesh>
        <mesh castShadow position={[-1.2, 0.2, 0]} rotation={[0, 0, -Math.PI / 4]}>
          <boxGeometry args={[0.06, 0.8, 0.04]} />
          <meshStandardMaterial color="#ca8a04" roughness={0.7} />
        </mesh>
      </group>

      {/* 6. SMALL CRIMSON GLADIATOR BANNER */}
      <group position={[1.5, 2.5, 2.8]} ref={bannerRef}>
        {/* Banner crossbar */}
        <mesh castShadow position={[0, 0.55, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.03, 0.03, 1.4, 6]} />
          <meshStandardMaterial color="#78350f" roughness={0.7} />
        </mesh>
        {/* Crimson fabric hanging banner */}
        <mesh castShadow position={[0, 0, 0.02]}>
          <boxGeometry args={[1.0, 1.0, 0.03]} />
          <meshStandardMaterial color="#b91c1c" roughness={0.8} />
        </mesh>
        {/* Yellow/Gold emblem stripe */}
        <mesh position={[0, 0, 0.04]}>
          <boxGeometry args={[0.15, 1.0, 0.01]} />
          <meshStandardMaterial color="#ca8a04" roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
};
