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

export const MerchantHouse: React.FC = () => {
  return (
    <group position={[26, 0, -12]}>
      {/* 0. STEPPED TRAVERTINE FOUNDATION PODIUM */}
      <BuildingFoundation size={[7.2, 6.5]} height={0.3} projection={0.25} />

      {/* 1. TWO-STORY ROMAN TABERNA STONE WALLS */}
      {/* Ground Floor (Travertine Stone) */}
      <mesh castShadow receiveShadow position={[0, 1.6, 0]}>
        <boxGeometry args={[7.2, 3.2, 6.5]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.6} />
      </mesh>

      {/* Ground Floor Corner Quoins */}
      <CornerQuoins height={3.2} buildingSize={[7.2, 6.5]} color="#d4a373" blockHeight={0.45} />

      {/* Belt Cornice Between Floors */}
      <WallCornice size={[7.2, 6.5]} y={3.2} color="#d4a373" height={0.16} projection={0.12} />

      {/* Second Floor (Lighter Stucco Plaster) */}
      <mesh castShadow receiveShadow position={[0, 4.3, 0]}>
        <boxGeometry args={[6.8, 2.2, 6.1]} />
        <meshStandardMaterial color="#f5ede0" roughness={0.5} />
      </mesh>

      {/* Upper Floor Windows */}
      <ClassicalWindow
        position={[-3.42, 4.3, -1.4]}
        rotation={[0, -Math.PI / 2, 0]}
        width={0.7}
        height={0.9}
        stoneColor="#d4a373"
      />
      <ClassicalWindow
        position={[-3.42, 4.3, 1.4]}
        rotation={[0, -Math.PI / 2, 0]}
        width={0.7}
        height={0.9}
        stoneColor="#d4a373"
      />

      {/* Eave Cornice */}
      <WallCornice size={[6.8, 6.1]} y={5.38} color="#d4a373" height={0.16} projection={0.12} />

      {/* 2. TERRACOTTA GABLED ROOF WITH OVERHANGS & RIDGE CAP */}
      <RomanGabledRoof
        width={6.8}
        depth={6.1}
        height={1.35}
        eaveOverhang={0.35}
        ridgeAlong="z"
        position={[0, 5.4, 0]}
        tileColor="#a64f1e"
        trimColor="#ebdcb9"
        tympanumColor="#ebdcb9"
      />

      {/* 3. ENTRANCE FRONTAL COLONNADE & RECESSED PORTAL */}
      <group position={[-3.62, 0, 0]}>
        <ClassicalDoorway
          position={[0, 0, 0]}
          rotation={[0, -Math.PI / 2, 0]}
          width={1.6}
          height={2.6}
          depth={0.4}
          stoneColor="#d4a373"
          recessColor="#1c1917"
          hasArchHeader={true}
        />
        {/* Fine Entrance Columns with stepped bases & capitals */}
        {[-1.4, 1.4].map((cz, ci) => (
          <ClassicalColumn
            key={`merc-col-${ci}`}
            position={[-0.3, 0, cz]}
            height={3.0}
            radius={0.16}
            stoneColor="#fcf8f2"
            capitalColor="#d4a373"
            order="corinthian"
          />
        ))}
      </group>

      {/* 4. MERCHANT BANNER & SIGNAGE */}
      <group position={[-4.1, 3.4, 0]}>
        {/* Wooden signpost post */}
        <mesh castShadow position={[0.4, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.06, 1.1, 8]} />
          <meshStandardMaterial color="#451a03" roughness={0.8} />
        </mesh>
        {/* Hanging Merchant Fabric Banner (Crimson & Gold) */}
        <mesh castShadow position={[0.4, -0.65, 0]}>
          <boxGeometry args={[0.08, 1.1, 0.8]} />
          <meshStandardMaterial color="#b91c1c" roughness={0.7} />
        </mesh>
        <mesh position={[0.45, -0.65, 0]}>
          <boxGeometry args={[0.02, 0.9, 0.6]} />
          <meshStandardMaterial color="#eab308" roughness={0.5} />
        </mesh>
      </group>

      {/* 5. MARKET DISPLAY ITEMS (TABLES, CRATES, AMPHORAE) */}
      <group position={[-3.5, 0, -2.4]}>
        {/* Wooden display shelf */}
        <mesh castShadow position={[0, 0.4, 0]}>
          <boxGeometry args={[0.9, 0.8, 1.4]} />
          <meshStandardMaterial color="#78350f" roughness={0.8} />
        </mesh>
        {/* Clay Wine Amphora Pot */}
        <mesh position={[0, 0.95, -0.2]}>
          <cylinderGeometry args={[0.14, 0.18, 0.5, 10]} />
          <meshStandardMaterial color="#c2410c" roughness={0.7} />
        </mesh>
        {/* Bronze bowl of exotic spices */}
        <mesh position={[0, 0.85, 0.3]}>
          <cylinderGeometry args={[0.2, 0.1, 0.15, 8]} />
          <meshStandardMaterial color="#ca8a04" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>

      {/* Ambient Brazier Basket */}
      <group position={[-3.5, 0, 2.4]}>
        <mesh castShadow position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.3, 0.2, 1.0, 8]} />
          <meshStandardMaterial color="#4b5563" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, 1.05, 0]}>
          <sphereGeometry args={[0.18, 8, 8]} />
          <meshStandardMaterial color="#ef4444" emissive="#f97316" emissiveIntensity={2.0} />
        </mesh>
        <pointLight color="#f97316" intensity={1.8} distance={7} position={[0, 1.2, 0]} />
      </group>
    </group>
  );
};
