import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BuildingFoundation } from './BuildingFoundation';
import { RomanGabledRoof, CornerQuoins, WallCornice } from './ClassicalArchitecture';
import { TimberCrate, RomanAmphora, WineBarrel } from './CivicFurnishingProps';

export const GeneralStore: React.FC = () => {
  const canopyRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (canopyRef.current) {
      const time = state.clock.getElapsedTime();
      // Very tiny flutter representing wind breeze
      canopyRef.current.rotation.x = Math.sin(time * 2.0) * 0.015;
      canopyRef.current.rotation.z = 0.2 + Math.cos(time * 1.8) * 0.01;
    }
  });

  return (
    <group position={[16, 0, -14]}>
      {/* 0. STEPPED TRAVERTINE FOUNDATION PODIUM */}
      <BuildingFoundation size={[7.2, 5.8]} height={0.3} projection={0.25} />

      {/* 1. TIMBER MARKET PAVILION STRUCTURE */}
      <mesh castShadow receiveShadow position={[0, 2.4, 0]}>
        <boxGeometry args={[7.2, 4.8, 5.8]} />
        <meshStandardMaterial color="#854d0e" roughness={0.7} />
      </mesh>

      {/* Rustic Corner Timber Quoins */}
      <CornerQuoins height={4.8} buildingSize={[7.2, 5.8]} color="#5c3f1f" blockHeight={0.6} />

      {/* Eave Cornice Beam */}
      <WallCornice size={[7.2, 5.8]} y={4.75} color="#5c3f1f" height={0.18} projection={0.14} />

      {/* Terracotta Gabled Roof with Overhangs & Ridge Cap */}
      <RomanGabledRoof
        width={7.2}
        depth={5.8}
        height={1.35}
        eaveOverhang={0.35}
        ridgeAlong="z"
        position={[0, 4.8, 0]}
        tileColor="#b45309"
        trimColor="#ebdcb9"
        tympanumColor="#854d0e"
      />

      {/* 2. STRIPED ROMAN CRIMSON & GOLD CANVAS AWNING */}
      <group position={[-2.8, 2.6, 0]} rotation={[0, 0, 0.2]} ref={canopyRef}>
        <mesh castShadow>
          <boxGeometry args={[2.8, 0.08, 5.2]} />
          <meshStandardMaterial color="#991b1b" roughness={0.7} />
        </mesh>
        {/* Striped Trim */}
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={[2.7, 0.02, 5.1]} />
          <meshStandardMaterial color="#fef08a" roughness={0.5} />
        </mesh>
      </group>

      {/* 3. WOODEN TIMBER SUPPORT POSTS */}
      {[-4.0].map((px, pi) =>
        [-2.4, 2.4].map((pz, zi) => (
          <mesh key={`post-${pi}-${zi}`} castShadow position={[px, 1.4, pz]}>
            <cylinderGeometry args={[0.12, 0.14, 2.8, 8]} />
            <meshStandardMaterial color="#451a03" roughness={0.8} />
          </mesh>
        ))
      )}

      {/* 4. MERCHANT DISPLAY COUNTERS WITH CLAY AMPHORAE & POTIONS */}
      <group position={[-3.6, 0, 0]}>
        {/* Timber Counter Table */}
        <mesh castShadow receiveShadow position={[0, 0.65, 0]}>
          <boxGeometry args={[1.2, 1.3, 4.2]} />
          <meshStandardMaterial color="#593a1c" roughness={0.75} />
        </mesh>

        {/* Clay Amphorae Wine Jars & Stacks */}
        <RomanAmphora position={[0, 1.45, -1.2]} scale={0.9} />
        <RomanAmphora position={[0, 1.45, -0.5]} scale={0.85} />
        <RomanAmphora position={[0, 1.45, 0.4]} scale={0.9} />
        <RomanAmphora position={[0, 1.45, 1.2]} scale={0.8} />

        {/* Storefront shipping goods stack */}
        <group position={[-2.4, 0, 2.4]}>
          <TimberCrate position={[0, 0, 0]} size={[0.85, 0.8, 0.85]} />
          <TimberCrate position={[0.9, 0, 0.1]} size={[0.7, 0.65, 0.7]} rotationY={0.2} />
          <WineBarrel position={[-0.8, 0, 0.1]} rotationY={-0.3} />
        </group>

        {/* Glowing Potion Flasks on Counter */}
        <group position={[0.2, 1.38, 0.8]}>
          <mesh castShadow>
            <sphereGeometry args={[0.12, 8, 8]} />
            <meshStandardMaterial color="#06b6d4" emissive="#0891b2" emissiveIntensity={1.5} roughness={0.1} />
          </mesh>
          <pointLight color="#06b6d4" intensity={1.5} distance={4} position={[0, 0.3, 0]} />
        </group>
      </group>

      {/* 5. WARM BAZAAR LANTERN */}
      <group position={[-3.8, 3.2, 1.8]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.16, 0.22, 0.55, 8]} />
          <meshStandardMaterial color="#78350f" metalness={0.7} />
        </mesh>
        <pointLight color="#f59e0b" intensity={3} distance={7} position={[0, -0.1, 0]} />
      </group>
    </group>
  );
};
