import React from 'react';
import * as THREE from 'three';
import { BuildingFoundation } from './BuildingFoundation';
import {
  ClassicalPediment,
  ClassicalColumn,
  RomanGabledRoof,
  ClassicalDoorway,
  WallCornice,
} from './ClassicalArchitecture';
import { RomanBench } from './CivicFurnishingProps';

export const RecordsLibrary: React.FC = () => {
  return (
    <group position={[20.5, 0, -28]}>
      {/* 0. STEPPED MARBLE FOUNDATION PLINTH */}
      <BuildingFoundation size={[6.0, 5.2]} height={0.25} projection={0.25} color="#cbd5e1" capColor="#e2e8f0" />

      {/* 1. ELEGANT MARBLE TEMPLE-STYLE STRUCTURE */}
      {/* Polished Marble Foundation Platform */}
      <mesh castShadow receiveShadow position={[0, 0.25, 0]}>
        <boxGeometry args={[6.0, 0.5, 5.2]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.3} />
      </mesh>

      {/* Main Temple Stone Walls */}
      <mesh castShadow receiveShadow position={[0, 2.15, -0.6]}>
        <boxGeometry args={[5.2, 3.3, 3.6]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.4} />
      </mesh>

      {/* Main Cella Eave Cornice */}
      <WallCornice size={[5.2, 3.6]} y={3.8} color="#cbd5e1" height={0.16} projection={0.12} />

      {/* Roman Temple Roof over Cella */}
      <RomanGabledRoof
        width={5.2}
        depth={3.6}
        height={1.1}
        eaveOverhang={0.3}
        ridgeAlong="z"
        position={[0, 3.8, -0.6]}
        tileColor="#94a3b8"
        trimColor="#cbd5e1"
        tympanumColor="#f1f5f9"
      />

      {/* Recessed Library Entrance Portal */}
      <ClassicalDoorway
        position={[0, 0.5, 1.2]}
        width={1.6}
        height={2.4}
        depth={0.4}
        stoneColor="#cbd5e1"
        recessColor="#1c1917"
        hasArchHeader={true}
      />

      {/* 2. TEMPLE COLUMN PORTICO ENTRANCE WITH CLASSICAL PEDIMENT & COLUMNS */}
      <group position={[0, 0.5, 1.6]}>
        {/* Classical Monumental Pediment */}
        <ClassicalPediment
          width={5.6}
          depth={1.4}
          height={1.1}
          position={[0, 2.2, 0]}
          stoneColor="#cbd5e1"
          trimColor="#94a3b8"
        />

        {/* Elegant Marble Columns with stepped bases & capitals */}
        {[-2.2, -0.8, 0.8, 2.2].map((x, i) => (
          <ClassicalColumn
            key={`lib-col-${i}`}
            position={[x, 0, 0]}
            height={2.2}
            radius={0.14}
            stoneColor="#f8fafc"
            capitalColor="#cbd5e1"
            order="corinthian"
          />
        ))}
      </group>

      {/* 3. ROYAL PURPLE LORE & RECORD SCROLL ACCENT BANNERS */}
      <group position={[0, 3.0, 2.35]}>
        {/* Horizontal gold hanging rod */}
        <mesh castShadow position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.04, 2.4, 8]} />
          <meshStandardMaterial color="#eab308" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Royal Purple Banner draping down over column portico */}
        <mesh castShadow position={[0, -0.9, 0.05]}>
          <boxGeometry args={[1.5, 1.8, 0.04]} />
          <meshStandardMaterial color="#581c87" roughness={0.65} />
        </mesh>
        {/* Gilded Roman Laurel Seal */}
        <mesh position={[0, -0.6, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.22, 0.22, 0.05, 10]} />
          <meshStandardMaterial color="#ca8a04" metalness={0.9} roughness={0.2} />
        </mesh>
      </group>

      {/* 4. SCROLL VAULTS & BOOKSHELVES VISIBLE FROM PORTICO */}
      <group position={[0, 0.5, 0.3]}>
        {/* Wooden writing table */}
        <mesh castShadow position={[0, 0.4, 0]}>
          <boxGeometry args={[1.8, 0.8, 1.0]} />
          <meshStandardMaterial color="#451a03" roughness={0.8} />
        </mesh>
        {/* Open parchment roll */}
        <mesh position={[0, 0.82, 0]}>
          <boxGeometry args={[1.0, 0.04, 0.6]} />
          <meshStandardMaterial color="#fef08a" roughness={0.9} />
        </mesh>
      </group>

      {/* 5. SCHOLAR TRAVERTINE READING BENCH (PHASE 26) */}
      <RomanBench position={[0, 0, 3.2]} rotationY={0} stoneColor="#e2e8f0" />
    </group>
  );
};
