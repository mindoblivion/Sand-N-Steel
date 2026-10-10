import React from 'react';
import * as THREE from 'three';
import { BuildingFoundation } from './BuildingFoundation';
import {
  RomanGabledRoof,
  ClassicalColumn,
  ClassicalDoorway,
  ClassicalWindow,
  CornerQuoins,
  WallCornice,
} from './ClassicalArchitecture';

export const CaravanseraiInn: React.FC = () => {
  return (
    <group position={[16, 0, 14]}>
      {/* 0. STEPPED TRAVERTINE FOUNDATION PODIUM */}
      <BuildingFoundation size={[8.6, 7.6]} height={0.3} projection={0.25} color="#e5d0b1" capColor="#ebdcb9" />

      {/* 1. ROMAN INN & REST QUARTERS (CARAVANSERAI) */}
      <mesh castShadow receiveShadow position={[0, 3.0, 0]}>
        <boxGeometry args={[8.6, 6.0, 7.6]} />
        <meshStandardMaterial color="#854d0e" roughness={0.7} />
      </mesh>

      {/* Masonry Corner Quoins */}
      <CornerQuoins height={6.0} buildingSize={[8.6, 7.6]} color="#d4a373" blockHeight={0.6} />

      {/* Mid-Floor String Course */}
      <WallCornice size={[8.6, 7.6]} y={3.0} color="#ebdcb9" height={0.16} projection={0.12} />

      {/* Eave Cornice Below Roof */}
      <WallCornice size={[8.6, 7.6]} y={5.95} color="#ebdcb9" height={0.18} projection={0.14} />

      {/* Terracotta Gabled Sloped Roof with Overhangs & Ridge Cap */}
      <RomanGabledRoof
        width={8.6}
        depth={7.6}
        height={1.5}
        eaveOverhang={0.4}
        ridgeAlong="z"
        position={[0, 6.0, 0]}
        tileColor="#b45309"
        trimColor="#ebdcb9"
        tympanumColor="#854d0e"
      />

      {/* Upper Story Guest Quarters Windows */}
      <ClassicalWindow
        position={[-4.32, 4.5, -2.0]}
        rotation={[0, -Math.PI / 2, 0]}
        width={0.75}
        height={1.0}
        stoneColor="#ebdcb9"
      />
      <ClassicalWindow
        position={[-4.32, 4.5, 2.0]}
        rotation={[0, -Math.PI / 2, 0]}
        width={0.75}
        height={1.0}
        stoneColor="#ebdcb9"
      />

      {/* Colonnade Arched Portico on Front with Classical Columns & Framed Doorway */}
      <group position={[-4.32, 0, 0]}>
        <ClassicalDoorway
          position={[0, 0, 0]}
          rotation={[0, -Math.PI / 2, 0]}
          width={2.2}
          height={3.2}
          depth={0.45}
          stoneColor="#ebdcb9"
          recessColor="#1c1917"
          hasArchHeader={true}
        />
        {/* Flanking Entrance Columns with stepped bases & capitals */}
        {[-1.8, 1.8].map((cz, ci) => (
          <ClassicalColumn
            key={`inn-col-${ci}`}
            position={[-0.4, 0, cz]}
            height={3.4}
            radius={0.22}
            stoneColor="#f5ede0"
            capitalColor="#ebdcb9"
            order="tuscan"
          />
        ))}
      </group>

      {/* 2. ENTRANCE RESTING BENCH & LUGGAGE CHEST */}
      <group position={[-3.8, 0, 2.6]}>
        <mesh castShadow position={[0, 0.35, 0]}>
          <boxGeometry args={[1.2, 0.7, 1.8]} />
          <meshStandardMaterial color="#451a03" roughness={0.8} />
        </mesh>
        {/* Clay Water Pitcher */}
        <mesh position={[0, 0.85, 0]}>
          <cylinderGeometry args={[0.12, 0.16, 0.35, 8]} />
          <meshStandardMaterial color="#c2410c" roughness={0.6} />
        </mesh>
      </group>

      {/* 3. WELCOMING INN BRAZIER */}
      <group position={[-4.6, 0, -2.4]}>
        <mesh castShadow position={[0, 0.6, 0]}>
          <cylinderGeometry args={[0.4, 0.3, 1.2, 10]} />
          <meshStandardMaterial color="#78350f" roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.3, 0]}>
          <sphereGeometry args={[0.25, 8, 8]} />
          <meshStandardMaterial color="#ff5722" emissive="#f97316" emissiveIntensity={3} />
        </mesh>
        <pointLight color="#f97316" intensity={3.5} distance={9} position={[0, 1.5, 0]} />
      </group>
    </group>
  );
};
