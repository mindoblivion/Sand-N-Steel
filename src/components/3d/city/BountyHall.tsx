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
import { TimberCrate, WineBarrel } from './CivicFurnishingProps';

export const BountyHall: React.FC = () => {
  return (
    <group position={[-15, 0, 26]}>
      {/* 0. STEPPED STONE FOUNDATION PODIUM */}
      <BuildingFoundation size={[6.5, 5.5]} height={0.3} projection={0.25} color="#44403c" capColor="#57534e" />

      {/* 1. RUSTIC TIMBER & STONE ADMINISTRATIVE HALL */}
      {/* Stone base plinth */}
      <mesh castShadow receiveShadow position={[0, 0.3, 0]}>
        <boxGeometry args={[6.5, 0.6, 5.5]} />
        <meshStandardMaterial color="#57534e" roughness={0.85} />
      </mesh>

      {/* Rough Pine Timber Walls */}
      <mesh castShadow receiveShadow position={[0, 2.1, 0]}>
        <boxGeometry args={[6.0, 3.0, 5.0]} />
        <meshStandardMaterial color="#854d0e" roughness={0.7} />
      </mesh>

      {/* Heavy Timber Corner Quoins */}
      <CornerQuoins height={3.0} buildingSize={[6.0, 5.0]} color="#451a03" blockHeight={0.5} />

      {/* Eave Cornice Beam */}
      <WallCornice size={[6.0, 5.0]} y={3.55} color="#451a03" height={0.16} projection={0.12} />

      {/* Slate Slanted Roman Roof with Overhangs & Ridge Cap */}
      <RomanGabledRoof
        width={6.0}
        depth={5.0}
        height={1.3}
        eaveOverhang={0.35}
        ridgeAlong="z"
        position={[0, 3.6, 0]}
        tileColor="#44403c"
        trimColor="#57534e"
        tympanumColor="#854d0e"
      />

      {/* Administrative Windows */}
      <ClassicalWindow
        position={[-3.02, 2.2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        width={0.7}
        height={0.9}
        stoneColor="#57534e"
      />

      {/* Heavy Timber Recessed Doorway */}
      <ClassicalDoorway
        position={[-1.2, 0.3, 2.52]}
        width={1.3}
        height={2.2}
        depth={0.35}
        stoneColor="#57534e"
        recessColor="#141210"
      />

      {/* 2. EXTERIOR CONTRACT / NOTICE BOARD (FRONT-RIGHT) */}
      <group position={[1.8, 0.3, 2.6]}>
        {/* Support wood posts */}
        <mesh castShadow position={[-0.8, 1.0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 2.0, 8]} />
          <meshStandardMaterial color="#451a03" roughness={0.9} />
        </mesh>
        <mesh castShadow position={[0.8, 1.0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 2.0, 8]} />
          <meshStandardMaterial color="#451a03" roughness={0.9} />
        </mesh>
        {/* Board panel */}
        <mesh castShadow position={[0, 1.3, 0.04]}>
          <boxGeometry args={[1.8, 1.1, 0.08]} />
          <meshStandardMaterial color="#2d1505" roughness={0.95} />
        </mesh>
        {/* Written papyrus notice leaflets */}
        {[-0.5, 0.4].map((x, i) => (
          <mesh key={`contract-${i}`} position={[x, 1.3, 0.09]} rotation={[0, 0, (i % 2 === 0 ? 0.08 : -0.15)]}>
            <boxGeometry args={[0.45, 0.6, 0.01]} />
            <meshStandardMaterial color="#fef08a" roughness={0.9} />
          </mesh>
        ))}
      </group>

      {/* 3. EXTERIOR DISPLAY WEAPONS & CRATES */}
      <group position={[-1.8, 0.3, 2.7]}>
        {/* Heavy storage wooden crate */}
        <TimberCrate position={[0, 0, 0]} size={[0.9, 0.8, 0.9]} />
        <WineBarrel position={[-1.0, 0, -0.2]} rotationY={0.4} />
        {/* Standing Spear shaft */}
        <mesh castShadow position={[-0.3, 1.6, 0.6]} rotation={[0.15, 0.1, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 2.5, 8]} />
          <meshStandardMaterial color="#451a03" roughness={0.9} />
        </mesh>
        {/* Iron spear tip */}
        <mesh castShadow position={[-0.3, 2.9, 0.6]} rotation={[0.15, 0.1, 0]}>
          <coneGeometry args={[0.08, 0.3, 6]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.15} />
        </mesh>
      </group>

      {/* 4. CHIEF ADMINISTRATOR BANNER (Crimson) */}
      <group position={[-2.8, 1.5, 2.0]}>
        {/* Wood banner rod */}
        <mesh castShadow position={[0, 1.2, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 2.4, 8]} />
          <meshStandardMaterial color="#451a03" roughness={0.9} />
        </mesh>
        {/* Hanging flag cloth */}
        <mesh castShadow position={[0.4, 1.8, 0.04]} rotation={[0, 0, -0.05]}>
          <boxGeometry args={[0.8, 1.1, 0.04]} />
          <meshStandardMaterial color="#991b1b" roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
};
