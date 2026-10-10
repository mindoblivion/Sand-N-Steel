import React from 'react';
import * as THREE from 'three';
import { BuildingFoundation } from './BuildingFoundation';
import { ClassicalPediment, ClassicalColumn, RomanGabledRoof } from './ClassicalArchitecture';
import { RomanBench, RomanAmphora } from './CivicFurnishingProps';

export const RomanShrine: React.FC = () => {
  return (
    <group position={[-27, 0, 11]}>
      {/* 0. STEPPED MARBLE FOUNDATION PLINTH */}
      <BuildingFoundation size={[5.8, 5.0]} height={0.25} projection={0.25} color="#cbd5e1" capColor="#f1f5f9" />

      {/* 1. ELEVATED MARBLE FOUNDATION PLATFORM */}
      {/* Tier 1 base */}
      <mesh castShadow receiveShadow position={[0, 0.2, 0]}>
        <boxGeometry args={[5.8, 0.4, 5.0]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.3} />
      </mesh>
      {/* Tier 2 step */}
      <mesh castShadow receiveShadow position={[0, 0.5, 0.5]}>
        <boxGeometry args={[4.8, 0.3, 3.8]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.4} />
      </mesh>

      {/* 2. CLASSICAL TEMPLE COLONNADE & PEDIMENT */}
      {/* Main Back Cell/Altar Wall */}
      <mesh castShadow position={[0, 2.15, -1.0]}>
        <boxGeometry args={[4.2, 3.0, 1.8]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.4} />
      </mesh>

      {/* Roman Gabled Roof over Shrine Cella */}
      <RomanGabledRoof
        width={4.2}
        depth={1.8}
        height={0.95}
        eaveOverhang={0.25}
        ridgeAlong="z"
        position={[0, 3.65, -1.0]}
        tileColor="#cbd5e1"
        trimColor="#f1f5f9"
        tympanumColor="#f1f5f9"
      />

      {/* Classical Temple Pediment */}
      <ClassicalPediment
        width={4.6}
        depth={1.2}
        height={0.95}
        position={[0, 2.85, 1.4]}
        stoneColor="#f1f5f9"
        trimColor="#cbd5e1"
      />

      {/* Front Columns with stepped bases & capitals */}
      {[-1.8, -0.6, 0.6, 1.8].map((x, i) => (
        <ClassicalColumn
          key={`shrine-col-${i}`}
          position={[x, 0.65, 1.4]}
          height={2.2}
          radius={0.13}
          stoneColor="#f8fafc"
          capitalColor="#f1f5f9"
          order="corinthian"
        />
      ))}

      {/* 3. FORTUNA STATUE / GOLD ALTAR */}
      <group position={[0, 0.65, -0.8]}>
        {/* Plinth */}
        <mesh castShadow position={[0, 0.45, 0]}>
          <boxGeometry args={[0.9, 0.9, 0.9]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.3} />
        </mesh>
        {/* Golden Statue Altar Shape */}
        <mesh castShadow position={[0, 1.3, 0]}>
          <cylinderGeometry args={[0.25, 0.35, 1.0, 8]} />
          <meshStandardMaterial color="#f59e0b" metalness={0.95} roughness={0.15} />
        </mesh>
        <mesh position={[0, 2.0, 0]}>
          <sphereGeometry args={[0.25, 8, 8]} />
          <meshStandardMaterial color="#fef08a" metalness={0.95} roughness={0.15} />
        </mesh>
      </group>

      {/* 4. PURPLE & GOLD CEREMONIAL BANNER */}
      <group position={[1.8, 1.8, -0.6]}>
        {/* Gold vertical flag rod */}
        <mesh castShadow position={[0, 0.8, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 3.2, 8]} />
          <meshStandardMaterial color="#ca8a04" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Hanging royal purple fabric banner */}
        <mesh castShadow position={[0.4, 1.5, 0.05]} rotation={[0, 0, -0.05]}>
          <boxGeometry args={[0.8, 1.4, 0.04]} />
          <meshStandardMaterial color="#581c87" roughness={0.7} />
        </mesh>
      </group>

      {/* 5. CEREMONIAL LIBATION AMPHORAE & CONTEMPLATION BENCH (PHASE 26) */}
      <RomanBench position={[0, 0, 3.2]} rotationY={0} stoneColor="#e2e8f0" />
      <RomanAmphora position={[-1.2, 0.5, 0.4]} scale={0.75} tone="sand" />
      <RomanAmphora position={[1.2, 0.5, 0.4]} scale={0.75} tone="sand" />
    </group>
  );
};
