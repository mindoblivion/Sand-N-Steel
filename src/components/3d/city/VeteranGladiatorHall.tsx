import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  RomanGabledRoof,
  ClassicalPediment,
  ClassicalColumn,
  ClassicalDoorway,
  ClassicalWindow,
  CornerQuoins,
  WallCornice,
} from './ClassicalArchitecture';

export const VeteranGladiatorHall: React.FC = () => {
  const bannerLeftRef = useRef<THREE.Group>(null);
  const bannerRightRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    if (bannerLeftRef.current) {
      bannerLeftRef.current.rotation.y = Math.sin(time * 1.4) * 0.07;
      bannerLeftRef.current.rotation.z = Math.cos(time * 1.1) * 0.02;
    }
    if (bannerRightRef.current) {
      bannerRightRef.current.rotation.y = Math.sin(time * 1.6 + 0.5) * 0.07;
      bannerRightRef.current.rotation.z = Math.cos(time * 1.3 + 0.3) * 0.02;
    }
  });

  return (
    <group position={[-16, 0, -16]}>
      {/* 1. TRAVERTINE PLINTH BASE WITH STEPPED GROUND CONTACT */}
      <mesh castShadow receiveShadow position={[0, 0.08, 0]}>
        <boxGeometry args={[6.6, 0.16, 6.1]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.65} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.24, 0]}>
        <boxGeometry args={[6.1, 0.32, 5.6]} />
        <meshStandardMaterial color="#e5d0b1" roughness={0.5} />
      </mesh>

      {/* 2. STUCCO WALLS (SAND/CREAM COLORED STUCCO WITH BRONZE TRIM) */}
      <mesh castShadow receiveShadow position={[0, 1.6, 0]}>
        <boxGeometry args={[5.7, 2.4, 5.2]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.65} />
      </mesh>

      {/* Travertine Corner Quoins */}
      <CornerQuoins height={2.4} buildingSize={[5.7, 5.2]} color="#d4a373" blockHeight={0.4} />

      {/* Eave Cornice Below Roof */}
      <WallCornice size={[5.7, 5.2]} y={2.75} color="#d4a373" height={0.16} projection={0.12} />

      {/* 3. TERRACOTTA GABLED ROOF WITH OVERHANGS & RIDGE CAP */}
      <RomanGabledRoof
        width={5.7}
        depth={5.2}
        height={1.3}
        eaveOverhang={0.35}
        ridgeAlong="z"
        position={[0, 2.8, 0]}
        tileColor="#b45309"
        trimColor="#ebdcb9"
        tympanumColor="#ebdcb9"
      />

      {/* Veteran Hall Windows */}
      <ClassicalWindow
        position={[-2.86, 1.7, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        width={0.7}
        height={0.9}
        stoneColor="#d4a373"
      />

      {/* Recessed Framed Hall Entrance Doorway */}
      <ClassicalDoorway
        position={[0, 0.32, 2.58]}
        width={1.6}
        height={2.2}
        depth={0.35}
        stoneColor="#ebdcb9"
        recessColor="#1c1917"
        hasArchHeader={true}
      />

      {/* 4. ENTRANCE PORTICO FACADE (CRIMSON COLUMNS & CLASSICAL PEDIMENT) */}
      <group position={[0, 0.32, 2.7]}>
        {/* Support Classical Columns with Stepped Bases & Capitals */}
        {[-1.8, 1.8].map((x, i) => (
          <ClassicalColumn
            key={`hall-col-${i}`}
            position={[x, 0, 0]}
            height={2.5}
            radius={0.15}
            stoneColor="#7f1d1d"
            capitalColor="#ebdcb9"
            order="doric"
          />
        ))}

        {/* Classical Monumental Pediment */}
        <ClassicalPediment
          width={4.2}
          depth={0.8}
          height={0.85}
          position={[0, 2.45, 0]}
          stoneColor="#f5ede0"
          trimColor="#b45309"
        />
      </group>

      {/* 5. BRONZE & CRIMSON ACCENTS / VETERAN BANNERS */}
      {/* Veteran Banners hanging on left and right columns with separate wind oscillations */}
      <group position={[-1.8, 1.0, 2.85]} ref={bannerLeftRef}>
        {/* Banner fabric */}
        <mesh castShadow position={[0, 0, 0]}>
          <boxGeometry args={[0.5, 1.2, 0.02]} />
          <meshStandardMaterial color="#7f1d1d" roughness={0.7} />
        </mesh>
        {/* Bronze shield crest center */}
        <mesh position={[0, 0.2, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.02, 8]} />
          <meshStandardMaterial color="#ca8a04" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>
      <group position={[1.8, 1.0, 2.85]} ref={bannerRightRef}>
        {/* Banner fabric */}
        <mesh castShadow position={[0, 0, 0]}>
          <boxGeometry args={[0.5, 1.2, 0.02]} />
          <meshStandardMaterial color="#7f1d1d" roughness={0.7} />
        </mesh>
        {/* Bronze shield crest center */}
        <mesh position={[0, 0.2, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.02, 8]} />
          <meshStandardMaterial color="#ca8a04" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>

      {/* 6. SIMPLE TROPHY SHIELDS & CROSSED WEAPONS (EAST/FRONT WALL) */}
      <group position={[0, 1.6, 2.62]}>
        {/* Golden Bronze Laurel Wreath on Pediment */}
        <mesh position={[0, 1.1, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.35, 0.06, 6, 12]} />
          <meshStandardMaterial color="#ca8a04" metalness={0.7} roughness={0.3} />
        </mesh>

        {/* Left Side Trophy: Crossed Swords and Shield */}
        <group position={[-1.2, 0, 0]}>
          <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.4, 0.4, 0.04, 10]} />
            <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.5} /> {/* Iron Shield */}
          </mesh>
          {/* Gold Trim Rim */}
          <mesh position={[0, 0, 0.02]}>
            <torusGeometry args={[0.39, 0.02, 6, 12]} />
            <meshStandardMaterial color="#ca8a04" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Diagonal weapons behind */}
          <mesh position={[0, 0, -0.02]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.04, 1.1, 0.02]} />
            <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, -0.02]} rotation={[0, 0, -Math.PI / 4]}>
            <boxGeometry args={[0.04, 1.1, 0.02]} />
            <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>

        {/* Right Side Trophy: Crossed Axes and Shield */}
        <group position={[1.2, 0, 0]}>
          <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.4, 0.4, 0.04, 10]} />
            <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0, 0.02]}>
            <torusGeometry args={[0.39, 0.02, 6, 12]} />
            <meshStandardMaterial color="#ca8a04" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, -0.02]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.04, 1.1, 0.02]} />
            <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, -0.02]} rotation={[0, 0, -Math.PI / 4]}>
            <boxGeometry args={[0.04, 1.1, 0.02]} />
            <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      </group>
    </group>
  );
};
