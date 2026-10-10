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
import { ForgeSmoke } from './EnvironmentalMotion';

export const SmithingForge: React.FC = () => {
  return (
    <group position={[18, 0, 2]}>
      {/* 0. STEPPED TRAVERTINE FOUNDATION PODIUM */}
      <BuildingFoundation size={[9.5, 7.5]} height={0.3} projection={0.25} wearTone="forge" />

      {/* 1. MAIN ROMAN BRICK FORGE WORKSHOP BUILDING */}
      <mesh castShadow receiveShadow position={[0, 2.8, 0]}>
        <boxGeometry args={[9.5, 5.6, 7.5]} />
        <meshStandardMaterial color="#854d0e" roughness={0.75} />
      </mesh>

      {/* Heavy Rusticated Corner Quoins */}
      <CornerQuoins height={5.6} buildingSize={[9.5, 7.5]} color="#57534e" blockHeight={0.55} />

      {/* Masonry Eave Cornice */}
      <WallCornice size={[9.5, 7.5]} y={5.55} color="#57534e" height={0.2} projection={0.16} />

      {/* Terracotta Sloping Tile Gabled Roof */}
      <RomanGabledRoof
        width={9.5}
        depth={7.5}
        height={1.6}
        eaveOverhang={0.4}
        ridgeAlong="z"
        position={[0, 5.6, 0]}
        tileColor="#b45309"
        trimColor="#57534e"
        tympanumColor="#854d0e"
      />

      {/* High Forge Smoke Clerestory Windows */}
      <ClassicalWindow
        position={[-4.76, 4.2, -1.8]}
        rotation={[0, -Math.PI / 2, 0]}
        width={0.8}
        height={1.0}
        stoneColor="#57534e"
      />
      <ClassicalWindow
        position={[-4.76, 4.2, 1.8]}
        rotation={[0, -Math.PI / 2, 0]}
        width={0.8}
        height={1.0}
        stoneColor="#57534e"
      />

      {/* Workshop Open Colonnade Portal with Arched Keystone */}
      <ClassicalDoorway
        position={[-4.75, 0, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        width={3.4}
        height={3.8}
        depth={0.45}
        stoneColor="#57534e"
        recessColor="#1c1917"
        hasArchHeader={true}
        wearTone="forge"
      />

      {/* 2. BLACKSMITH'S STONE SMELTING FURNACE & CHIMNEY */}
      <group position={[-2.5, 0, -2.2]}>
        {/* Stone Furnace Base */}
        <mesh castShadow receiveShadow position={[0, 1.8, 0]}>
          <cylinderGeometry args={[1.4, 1.7, 3.6, 12]} />
          <meshStandardMaterial color="#57534e" roughness={0.8} />
        </mesh>
        {/* Furnace Chimney Flue */}
        <mesh castShadow position={[0, 4.8, 0]}>
          <cylinderGeometry args={[0.6, 0.9, 3.2, 12]} />
          <meshStandardMaterial color="#44403c" roughness={0.8} />
        </mesh>
        <ForgeSmoke position={[0, 6.4, 0]} />
        {/* Glowing Molten Hearth Opening */}
        <mesh position={[0.8, 1.2, 0]}>
          <boxGeometry args={[0.6, 0.9, 1.1]} />
          <meshStandardMaterial
            color="#ff4500"
            emissive="#ea580c"
            emissiveIntensity={3.5}
            roughness={0.2}
          />
        </mesh>
        <pointLight color="#ea580c" intensity={4} distance={9} position={[1.4, 1.4, 0]} />
      </group>

      {/* 3. HEAVY OAK STUMP & STEEL ANVIL */}
      <group position={[-3.6, 0, 1.2]}>
        {/* Oak Log Base */}
        <mesh castShadow position={[0, 0.45, 0]}>
          <cylinderGeometry args={[0.55, 0.6, 0.9, 10]} />
          <meshStandardMaterial color="#451a03" roughness={0.85} />
        </mesh>
        {/* Polished Steel Anvil */}
        <mesh castShadow position={[0, 1.05, 0]}>
          <boxGeometry args={[0.7, 0.35, 0.35]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.9} roughness={0.2} />
        </mesh>
        <mesh castShadow position={[0.4, 1.05, 0]} rotation={[0, 0, -Math.PI / 4]}>
          <cylinderGeometry args={[0.08, 0.18, 0.45, 8]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.9} roughness={0.2} />
        </mesh>
      </group>

      {/* 4. WATER QUENCHING WOODEN BARREL */}
      <group position={[-2.4, 0, 2.5]}>
        <WineBarrel position={[0, 0, 0]} />
        {/* Metal slag & ingot crate */}
        <TimberCrate position={[-1.0, 0, 0.4]} size={[0.8, 0.7, 0.8]} rotationY={0.3} />
      </group>

      {/* 5. WEAPON & ARMOR DISPLAY RACK (GLADII, SPEARS & SHIELDS) */}
      <group position={[-4.5, 0, -1.8]} rotation={[0, Math.PI / 2, 0]}>
        {/* Timber Stand */}
        <mesh castShadow position={[0, 1.2, 0]}>
          <boxGeometry args={[2.8, 2.4, 0.2]} />
          <meshStandardMaterial color="#593a1c" roughness={0.75} />
        </mesh>
        {/* Gleaming Steel Blades on Display */}
        {[-0.8, -0.3, 0.3, 0.8].map((sx, si) => (
          <mesh key={`rack-sword-${si}`} position={[sx, 1.4, 0.15]}>
            <boxGeometry args={[0.08, 1.2, 0.03]} />
            <meshStandardMaterial color="#f8fafc" metalness={0.95} roughness={0.1} />
          </mesh>
        ))}
        {/* Bronze Shield on Display */}
        <mesh position={[0, 0.8, 0.22]}>
          <cylinderGeometry args={[0.45, 0.45, 0.08, 16]} />
          <meshStandardMaterial color="#d97706" metalness={0.8} roughness={0.2} />
        </mesh>
      </group>

      {/* 6. FORGE ENTRANCE LANTERN */}
      <group position={[-4.8, 3.6, 1.8]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.18, 0.25, 0.6, 8]} />
          <meshStandardMaterial color="#78350f" metalness={0.8} />
        </mesh>
        <pointLight color="#f59e0b" intensity={3} distance={7} position={[0, -0.1, 0]} />
      </group>
    </group>
  );
};
