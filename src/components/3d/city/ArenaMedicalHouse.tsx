import React from 'react';
import * as THREE from 'three';
import {
  ClassicalColumn,
  ClassicalDoorway,
  ClassicalWindow,
  CornerQuoins,
  WallCornice,
} from './ClassicalArchitecture';

export const ArenaMedicalHouse: React.FC = () => {
  return (
    <group position={[-29, 0, -5]}>
      {/* 1. MAIN INFIRMARY STONE & STUCCO HALL */}
      {/* Travertine stepped foundation */}
      <mesh castShadow receiveShadow position={[0, 0.08, 0]}>
        <boxGeometry args={[5.7, 0.16, 5.7]} />
        <meshStandardMaterial color="#d4a373" roughness={0.7} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.24, 0]}>
        <boxGeometry args={[5.2, 0.32, 5.2]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.65} />
      </mesh>
      {/* Stucco Walls */}
      <mesh castShadow receiveShadow position={[0, 1.4, 0]}>
        <boxGeometry args={[4.9, 2.0, 4.9]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.7} />
      </mesh>

      {/* Travertine Corner Quoins */}
      <CornerQuoins height={2.0} buildingSize={[4.9, 4.9]} color="#d4a373" blockHeight={0.4} />

      {/* Eave Cornice Below Roof */}
      <WallCornice size={[4.9, 4.9]} y={2.35} color="#d4a373" height={0.16} projection={0.12} />

      {/* Infirmary Windows */}
      <ClassicalWindow
        position={[-2.46, 1.5, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        width={0.7}
        height={0.85}
        stoneColor="#d4a373"
      />

      {/* 2. TERRACOTTA PYRAMIDAL ROOF WITH EAVE OVERHANG */}
      <mesh castShadow position={[0, 3.3, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[4.0, 1.8, 4]} />
        <meshStandardMaterial color="#b45309" roughness={0.6} />
      </mesh>

      {/* 3. FRONT RECESSED ALCOVE PORCH WITH CLASSICAL COLUMNS & FRAMED DOORWAY */}
      <group position={[0, 0, 2.4]}>
        {/* Stone steps */}
        <mesh castShadow receiveShadow position={[0, 0.1, 0.2]}>
          <boxGeometry args={[2.8, 0.2, 0.4]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.6} />
        </mesh>
        {/* Recessed Infirmary Doorway */}
        <ClassicalDoorway
          position={[0, 0.2, -0.1]}
          width={1.4}
          height={1.8}
          depth={0.3}
          stoneColor="#d4a373"
          recessColor="#1c1917"
        />
        {/* Support Classical Columns with Stepped Bases & Capitals */}
        {[-1.2, 1.2].map((x, i) => (
          <ClassicalColumn
            key={`med-col-${i}`}
            position={[x, 0.2, 0.1]}
            height={1.85}
            radius={0.1}
            stoneColor="#f8fafc"
            capitalColor="#cbd5e1"
            order="tuscan"
          />
        ))}
        {/* Architrave Beam */}
        <mesh castShadow position={[0, 2.1, 0.1]}>
          <boxGeometry args={[2.8, 0.15, 0.3]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
        </mesh>
      </group>

      {/* 4. VISUAL MEDICAL PROPS (INFIRMARY PORCH) */}
      {/* Simple Medical Table outside */}
      <group position={[-1.2, 0.45, 1.4]} rotation={[0, Math.PI / 4, 0]}>
        {/* Wood tabletop */}
        <mesh castShadow>
          <boxGeometry args={[1.0, 0.08, 0.6]} />
          <meshStandardMaterial color="#78350f" roughness={0.8} />
        </mesh>
        {/* Four table legs */}
        {[[-0.42, -0.22], [0.42, -0.22], [-0.42, 0.22], [0.42, 0.22]].map((coords, i) => (
          <mesh key={`med-leg-${i}`} castShadow position={[coords[0], -0.22, coords[1]]}>
            <cylinderGeometry args={[0.02, 0.02, 0.44, 4]} />
            <meshStandardMaterial color="#78350f" roughness={0.8} />
          </mesh>
        ))}
        {/* Ceramic container & Bandage roll silhouettes on the table */}
        <mesh castShadow position={[-0.2, 0.12, 0]}>
          <cylinderGeometry args={[0.08, 0.06, 0.18, 6]} />
          <meshStandardMaterial color="#ea580c" roughness={0.6} /> {/* Orange-red ceramic pot */}
        </mesh>
        <mesh castShadow position={[0.2, 0.06, 0.05]} rotation={[0, 0.4, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 0.1, 8]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.9} /> {/* White rolled bandage */}
        </mesh>
      </group>

      {/* Additional Ceramic Amphora containers for healing salves */}
      <group position={[1.4, 0.35, 1.6]}>
        <mesh castShadow position={[0, 0, 0]}>
          <cylinderGeometry args={[0.15, 0.25, 0.6, 8]} />
          <meshStandardMaterial color="#c2410c" roughness={0.6} />
        </mesh>
        {/* Amphora neck and handles */}
        <mesh position={[0, 0.35, 0]}>
          <cylinderGeometry args={[0.08, 0.06, 0.15, 8]} />
          <meshStandardMaterial color="#c2410c" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.44, 0]}>
          <torusGeometry args={[0.08, 0.02, 6, 8]} />
          <meshStandardMaterial color="#c2410c" roughness={0.6} />
        </mesh>
      </group>

      {/* 5. SUBTLE RED MEDICAL / ADMINISTRATIVE MARKINGS */}
      {/* Crimson Greek/Roman cross symbol on front wall above entrance */}
      <group position={[0, 1.8, 2.47]}>
        {/* Horizontal bar */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.8, 0.18, 0.02]} />
          <meshStandardMaterial color="#b91c1c" roughness={0.5} />
        </mesh>
        {/* Vertical bar */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.18, 0.8, 0.02]} />
          <meshStandardMaterial color="#b91c1c" roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
};
