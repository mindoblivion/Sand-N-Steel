import React from 'react';
import * as THREE from 'three';
import { BuildingFoundation } from './BuildingFoundation';
import {
  RomanGabledRoof,
  ClassicalColumn,
  ClassicalWindow,
  CornerQuoins,
  WallCornice,
} from './ClassicalArchitecture';
import { RomanBench, RomanAmphora } from './CivicFurnishingProps';
import { SteamParticles } from './EnvironmentalMotion';

export const PublicBathhouse: React.FC = () => {
  return (
    <group position={[-26, 0, 25]}>
      {/* 0. STEPPED TRAVERTINE FOUNDATION PODIUM */}
      <BuildingFoundation size={[7.5, 6.5]} height={0.3} projection={0.25} color="#e5d0b1" capColor="#ebdcb9" />

      {/* 1. ROMAN THERMAE STONE STRUCTURE */}
      {/* Heavy Travertine Foundation and Main Bath Hall */}
      <mesh castShadow receiveShadow position={[0, 1.6, 0]}>
        <boxGeometry args={[7.5, 3.2, 6.5]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.5} />
      </mesh>

      {/* Travertine Corner Quoins */}
      <CornerQuoins height={3.2} buildingSize={[7.5, 6.5]} color="#d4a373" blockHeight={0.4} />

      {/* Wall Cornice Below Eaves */}
      <WallCornice size={[7.5, 6.5]} y={3.15} color="#d4a373" height={0.16} projection={0.12} />

      {/* Terracotta Gabled Sloping Roof with Overhangs & Ridge Cap */}
      <RomanGabledRoof
        width={7.5}
        depth={6.5}
        height={1.35}
        eaveOverhang={0.35}
        ridgeAlong="z"
        position={[0, 3.2, 0]}
        tileColor="#b45309"
        trimColor="#ebdcb9"
        tympanumColor="#ebdcb9"
      />

      {/* Thermae Lunette Windows */}
      <ClassicalWindow
        position={[-3.76, 2.1, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        width={1.0}
        height={0.8}
        stoneColor="#d4a373"
      />

      {/* 2. RECESSED SHALLOW POOL / WATER BASIN (FRONT-RIGHT) */}
      <group position={[1.8, 0.05, 1.8]}>
        {/* Stone pool ring */}
        <mesh castShadow receiveShadow position={[0, 0.25, 0]}>
          <boxGeometry args={[2.5, 0.4, 2.0]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.6} />
        </mesh>
        {/* Shimmering pool water */}
        <mesh position={[0, 0.42, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2.2, 1.7]} />
          <meshStandardMaterial color="#0ea5e9" metalness={0.7} roughness={0.1} opacity={0.8} />
        </mesh>
        {/* Steam visual cues */}
        <SteamParticles position={[0, 0.8, 0]} />
      </group>

      {/* 3. COLONNADE PORTICO FACADE WITH CLASSICAL COLUMNS */}
      <group position={[0, 0, -3.4]}>
        {/* Front support columns with stepped bases & capitals */}
        {[-2.8, -1.0, 1.0, 2.8].map((x, i) => (
          <ClassicalColumn
            key={`bath-col-${i}`}
            position={[x, 0, 0]}
            height={2.9}
            radius={0.16}
            stoneColor="#f8fafc"
            capitalColor="#ebdcb9"
            order="tuscan"
          />
        ))}
      </group>

      {/* 4. BATHHOUSE AMBIENT HEARTH BRAZIER */}
      <group position={[-2.4, 0, 1.8]}>
        {/* Stone Basin */}
        <mesh castShadow position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.35, 0.25, 1.0, 8]} />
          <meshStandardMaterial color="#475569" roughness={0.7} />
        </mesh>
        {/* Fire embers */}
        <mesh position={[0, 1.05, 0]}>
          <sphereGeometry args={[0.2, 8, 8]} />
          <meshStandardMaterial color="#ef4444" emissive="#f97316" emissiveIntensity={2.2} />
        </mesh>
        <pointLight color="#f97316" intensity={1.5} distance={7} position={[0, 1.2, 0]} />
      </group>

      {/* 5. RELAXATION MARBLE BENCH & SCENTED OIL AMPHORAE (PHASE 26) */}
      <RomanBench position={[-1.2, 0, -3.8]} rotationY={0} stoneColor="#cbd5e1" />
      <RomanAmphora position={[3.2, 0, 1.8]} scale={0.75} tone="sand" />
      <RomanAmphora position={[3.6, 0, 1.2]} scale={0.7} tone="terracotta" />
    </group>
  );
};
