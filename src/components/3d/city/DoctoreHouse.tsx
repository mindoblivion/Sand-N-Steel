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

export const DoctoreHouse: React.FC = () => {
  return (
    <group position={[28, 0, -17]}>
      {/* 0. STEPPED TRAVERTINE FOUNDATION PODIUM */}
      <BuildingFoundation size={[5.5, 5.0]} height={0.3} projection={0.25} color="#57534e" capColor="#78716c" />

      {/* 1. COMPACT ROMAN STONE INSTRUCTOR'S HOUSE */}
      {/* Solid Stone Walls */}
      <mesh castShadow receiveShadow position={[0, 1.8, 0]}>
        <boxGeometry args={[5.5, 3.6, 5.0]} />
        <meshStandardMaterial color="#78716c" roughness={0.7} />
      </mesh>

      {/* Dark Stone Corner Quoins */}
      <CornerQuoins height={3.6} buildingSize={[5.5, 5.0]} color="#57534e" blockHeight={0.45} />

      {/* Eave Cornice Below Roof */}
      <WallCornice size={[5.5, 5.0]} y={3.55} color="#57534e" height={0.16} projection={0.12} />

      {/* Sloping Terracotta Roof with Overhangs & Ridge Cap */}
      <RomanGabledRoof
        width={5.5}
        depth={5.0}
        height={1.2}
        eaveOverhang={0.35}
        ridgeAlong="z"
        position={[0, 3.6, 0]}
        tileColor="#b45309"
        trimColor="#57534e"
        tympanumColor="#78716c"
      />

      {/* Doctore Instructor Windows */}
      <ClassicalWindow
        position={[-2.76, 2.2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        width={0.7}
        height={0.9}
        stoneColor="#57534e"
      />

      {/* Framed Heavy Oak Entrance Doorway */}
      <ClassicalDoorway
        position={[0, 0, 2.52]}
        width={1.4}
        height={2.2}
        depth={0.35}
        stoneColor="#57534e"
        recessColor="#141210"
      />

      {/* 2. EXTERIOR WEAPON RACKS & TRAINING PROPS */}
      {/* Wooden Rack Bench */}
      <group position={[-2.2, 0, 1.8]}>
        <mesh castShadow position={[0, 0.4, 0]}>
          <boxGeometry args={[1.0, 0.8, 1.2]} />
          <meshStandardMaterial color="#5c3f1f" roughness={0.8} />
        </mesh>
        {/* Practice Wooden Swords */}
        {[-0.3, 0.3].map((z, i) => (
          <mesh key={`p-gladius-${i}`} castShadow position={[0, 0.85, z]} rotation={[0.5, 0.1, 0.2]}>
            <boxGeometry args={[0.06, 0.06, 0.7]} />
            <meshStandardMaterial color="#78350f" roughness={0.8} />
          </mesh>
        ))}
      </group>

      {/* 3. STRAW PRACTICE TARGET / SHIELD DUMMY */}
      <group position={[-2.2, 0, -1.5]}>
        {/* Wooden Post */}
        <mesh castShadow position={[0, 0.8, 0]}>
          <cylinderGeometry args={[0.08, 0.1, 1.6, 8]} />
          <meshStandardMaterial color="#451a03" roughness={0.9} />
        </mesh>
        {/* Round Straw Target */}
        <mesh castShadow position={[0, 1.2, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.45, 0.45, 0.22, 10]} />
          <meshStandardMaterial color="#ca8a04" roughness={0.95} />
        </mesh>
      </group>

      {/* 4. DOCTORE CLASS BANNER (Crimson) */}
      <group position={[2.0, 0, 2.7]}>
        {/* Wooden vertical banner pole */}
        <mesh castShadow position={[0, 1.8, 0]}>
          <cylinderGeometry args={[0.06, 0.08, 3.6, 8]} />
          <meshStandardMaterial color="#451a03" roughness={0.9} />
        </mesh>
        {/* Crimson flag cloth */}
        <mesh castShadow position={[0.4, 2.8, 0.02]} rotation={[0, 0, 0.1]}>
          <boxGeometry args={[0.8, 1.0, 0.06]} />
          <meshStandardMaterial color="#991b1b" roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
};
