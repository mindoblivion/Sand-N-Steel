import React from 'react';
import * as THREE from 'three';
import { BuildingFoundation } from './BuildingFoundation';
import {
  RomanGabledRoof,
  ClassicalDoorway,
  ClassicalWindow,
  CornerQuoins,
  WallCornice,
} from './ClassicalArchitecture';
import { RomanAmphora, WineBarrel } from './CivicFurnishingProps';

export const CityTavern: React.FC = () => {
  return (
    <group position={[-16, 0, 14]}>
      {/* 0. STEPPED TRAVERTINE FOUNDATION PODIUM */}
      <BuildingFoundation size={[8.4, 7.2]} height={0.3} projection={0.25} color="#e5d0b1" capColor="#ecd9be" />

      {/* 1. TWO-STORY ROMAN TABERNA STONE VILLA */}
      <mesh castShadow receiveShadow position={[0, 3.2, 0]}>
        <boxGeometry args={[8.4, 6.4, 7.2]} />
        <meshStandardMaterial color="#78350f" roughness={0.75} />
      </mesh>

      {/* Masonry Corner Quoins */}
      <CornerQuoins height={6.4} buildingSize={[8.4, 7.2]} color="#d4a373" blockHeight={0.55} />

      {/* Horizontal String Course Cornice between 1st & 2nd floors */}
      <WallCornice size={[8.4, 7.2]} y={3.2} color="#ebdcb9" height={0.16} projection={0.12} />

      {/* Eave Cornice Below Roof */}
      <WallCornice size={[8.4, 7.2]} y={6.35} color="#ebdcb9" height={0.18} projection={0.14} />

      {/* Terracotta Gabled Sloped Roof with Overhangs & Ridge Cap */}
      <RomanGabledRoof
        width={8.4}
        depth={7.2}
        height={1.5}
        eaveOverhang={0.4}
        ridgeAlong="z"
        position={[0, 6.4, 0]}
        tileColor="#b45309"
        trimColor="#ebdcb9"
        tympanumColor="#78350f"
      />

      {/* Upper Floor Windows */}
      <ClassicalWindow
        position={[4.22, 4.8, -2.0]}
        rotation={[0, Math.PI / 2, 0]}
        width={0.75}
        height={1.0}
        stoneColor="#ebdcb9"
      />
      <ClassicalWindow
        position={[4.22, 4.8, 2.0]}
        rotation={[0, Math.PI / 2, 0]}
        width={0.75}
        height={1.0}
        stoneColor="#ebdcb9"
      />

      {/* Arched Tavern Portal Entrance with Deep Recess & Stone Jambs */}
      <ClassicalDoorway
        position={[4.22, 0, 0]}
        rotation={[0, Math.PI / 2, 0]}
        width={2.2}
        height={3.0}
        depth={0.45}
        stoneColor="#ebdcb9"
        recessColor="#1c1917"
        hasArchHeader={true}
      />

      {/* 2. SECOND-STORY WOODEN TIMBER BALCONY */}
      <group position={[4.4, 4.2, 0]}>
        {/* Balcony Floor */}
        <mesh castShadow position={[0.6, 0, 0]}>
          <boxGeometry args={[1.4, 0.2, 4.8]} />
          <meshStandardMaterial color="#451a03" roughness={0.8} />
        </mesh>
        {/* Timber Balustrade Railing */}
        <mesh castShadow position={[1.2, 0.5, 0]}>
          <boxGeometry args={[0.1, 1.0, 4.8]} />
          <meshStandardMaterial color="#593a1c" roughness={0.75} />
        </mesh>
      </group>

      {/* 3. OUTDOOR PATIO TAVERN BENCHES & WINE BARRELS */}
      <group position={[3.6, 0, 2.2]}>
        {/* Rustic Oak Table */}
        <mesh castShadow position={[0, 0.5, 0]}>
          <boxGeometry args={[1.4, 0.9, 1.2]} />
          <meshStandardMaterial color="#451a03" roughness={0.8} />
        </mesh>
        {/* Clay Wine Cups */}
        <mesh position={[-0.2, 1.02, 0]}>
          <cylinderGeometry args={[0.08, 0.06, 0.15, 8]} />
          <meshStandardMaterial color="#c2410c" roughness={0.6} />
        </mesh>
        <mesh position={[0.2, 1.02, 0.15]}>
          <cylinderGeometry args={[0.08, 0.06, 0.15, 8]} />
          <meshStandardMaterial color="#c2410c" roughness={0.6} />
        </mesh>
        {/* Authentic Roman Wine Amphora beside table */}
        <RomanAmphora position={[0.9, 0, 0.4]} scale={0.8} tone="terracotta" />
        <RomanAmphora position={[0.8, 0, -0.2]} scale={0.75} tone="dark" />
        {/* Wine Barrel Stack */}
        <WineBarrel position={[-0.8, 0, -1.8]} rotationY={0} />
        <WineBarrel position={[-0.8, 0.72, -1.8]} isLyingDown={true} rotationY={Math.PI / 2} />
      </group>

      {/* 4. HANGING TAVERN WARM LANTERNS */}
      {[-1.6, 1.6].map((lz, li) => (
        <group key={`tav-light-${li}`} position={[4.4, 3.6, lz]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.18, 0.24, 0.6, 8]} />
            <meshStandardMaterial color="#78350f" metalness={0.7} />
          </mesh>
          <pointLight color="#f59e0b" intensity={3.5} distance={8} position={[0.2, 0, 0]} />
        </group>
      ))}
    </group>
  );
};
