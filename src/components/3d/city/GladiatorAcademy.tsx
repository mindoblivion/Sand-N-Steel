import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
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

export const GladiatorAcademy: React.FC = () => {
  const bannerRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (bannerRef.current) {
      const time = state.clock.getElapsedTime();
      // Slow gentle sway representing breeze
      bannerRef.current.rotation.y = Math.sin(time * 1.3) * 0.07;
      bannerRef.current.rotation.z = Math.cos(time * 1.1) * 0.02;
    }
  });

  return (
    <group position={[30.5, 0, -27]}>
      {/* 0. STEPPED TRAVERTINE FOUNDATION PODIUM */}
      <BuildingFoundation size={[7.2, 6.8]} height={0.3} projection={0.25} />

      {/* 1. COMPACT TWO-STORY ACADEMY QUAD */}
      {/* Ground Floor (Polished Travertine Stucco) */}
      <mesh castShadow receiveShadow position={[0, 1.45, 0]}>
        <boxGeometry args={[7.2, 2.9, 6.8]} />
        <meshStandardMaterial color="#f5ede0" roughness={0.5} />
      </mesh>
      {/* Corner Stone Quoins for Ground Floor */}
      <CornerQuoins height={2.9} buildingSize={[7.2, 6.8]} color="#d4a373" />

      {/* Belt Cornice Trim Between Floors */}
      <WallCornice size={[7.2, 6.8]} y={2.9} color="#d4a373" height={0.16} projection={0.12} />

      {/* Second Floor (Stately Roman Plaster) */}
      <mesh castShadow receiveShadow position={[0, 4.05, 0]}>
        <boxGeometry args={[6.8, 2.3, 6.4]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.6} />
      </mesh>

      {/* Upper Floor Windows */}
      <ClassicalWindow position={[-3.42, 4.1, -1.6]} rotation={[0, -Math.PI / 2, 0]} width={0.7} height={0.9} stoneColor="#d4a373" />
      <ClassicalWindow position={[-3.42, 4.1, 1.6]} rotation={[0, -Math.PI / 2, 0]} width={0.7} height={0.9} stoneColor="#d4a373" />

      {/* Terracotta Gabled Tiled Roof with Eaves and Ridge Cap */}
      <RomanGabledRoof
        width={6.8}
        depth={6.4}
        height={1.4}
        eaveOverhang={0.4}
        ridgeAlong="z"
        position={[0, 5.2, 0]}
        tileColor="#a64f1e"
        trimColor="#ebdcb9"
        tympanumColor="#ebdcb9"
      />

      {/* 2. OPEN FRONT INNER COURT COLONNADE & RECESSED PORTAL */}
      <group position={[-3.62, 0, 0]}>
        {/* Recessed Framed Portal */}
        <ClassicalDoorway
          position={[0, 0, 0]}
          rotation={[0, -Math.PI / 2, 0]}
          width={1.5}
          height={2.5}
          depth={0.4}
          stoneColor="#d4a373"
          recessColor="#1c1917"
          hasArchHeader={true}
        />
        {/* Classical Columns flanking portico */}
        {[-1.5, 1.5].map((cz, ci) => (
          <ClassicalColumn
            key={`acad-col-${ci}`}
            position={[-0.3, 0, cz]}
            height={2.85}
            radius={0.16}
            stoneColor="#fcf8f2"
            capitalColor="#d4a373"
            order="corinthian"
          />
        ))}
      </group>

      {/* 3. ACADEMY BANNER POST (Crimson & Gold) */}
      <group position={[-3.9, 3.2, 0]}>
        {/* Signpost */}
        <mesh castShadow position={[0.3, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.05, 0.05, 0.9, 8]} />
          <meshStandardMaterial color="#451a03" roughness={0.8} />
        </mesh>
        {/* Animated Banner cloth */}
        <group ref={bannerRef}>
          <mesh castShadow position={[0.3, -0.6, 0]}>
            <boxGeometry args={[0.06, 1.0, 0.7]} />
            <meshStandardMaterial color="#991b1b" roughness={0.75} />
          </mesh>
          <mesh position={[0.34, -0.6, 0]}>
            <boxGeometry args={[0.02, 0.8, 0.5]} />
            <meshStandardMaterial color="#ca8a04" roughness={0.5} />
          </mesh>
        </group>
      </group>

      {/* 4. TRAINING WEAPONS STANDS & SHIELDS OUTSIDE */}
      <group position={[-2.8, 0, 2.5]}>
        {/* Wooden training stand table */}
        <mesh castShadow position={[0, 0.45, 0]}>
          <boxGeometry args={[1.0, 0.9, 1.4]} />
          <meshStandardMaterial color="#5c3f1f" roughness={0.85} />
        </mesh>
        {/* Display training wooden Gladius */}
        <mesh castShadow position={[0, 1.05, 0.2]} rotation={[0.4, 0.5, 0]}>
          <boxGeometry args={[0.08, 0.08, 0.95]} />
          <meshStandardMaterial color="#a16207" roughness={0.9} />
        </mesh>
        {/* Display wooden training shield */}
        <mesh castShadow position={[0, 1.05, -0.3]} rotation={[0.2, -0.3, 0.1]}>
          <boxGeometry args={[0.08, 0.75, 0.5]} />
          <meshStandardMaterial color="#dc2626" roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
};
