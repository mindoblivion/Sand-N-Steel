import React from 'react';
import * as THREE from 'three';
import { ClassicalPediment, ClassicalColumn } from './ClassicalArchitecture';
import { ROMAN_PALETTE, NOISE_TEXTURE } from './RomanMaterials';
import { RomanBench, RomanAmphora } from './CivicFurnishingProps';
import { Banner } from './EnvironmentalMotion';

export const GrandColosseum: React.FC = () => {
  return (
    <group position={[0, 0, -20]}>
      {/* 0. STEPPED TRAVERTINE FOUNDATION PODIUM PLINTH */}
      {/* Lower ground step along amphitheater curve */}
      <mesh castShadow receiveShadow position={[0, 0.08, 0]}>
        <cylinderGeometry args={[19.3, 19.5, 0.16, 36, 1, true, -Math.PI * 0.85, Math.PI * 1.7]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.travertineDark.color}
          roughness={0.84}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.018}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Upper plinth curb along amphitheater curve */}
      <mesh castShadow receiveShadow position={[0, 0.22, 0]}>
        <cylinderGeometry args={[19.0, 19.2, 0.16, 36, 1, true, -Math.PI * 0.85, Math.PI * 1.7]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.travertine.color}
          roughness={0.78}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 1. OUTER THREE-TIERED COLOSSEUM CURVED AMPHITHEATER WALL */}
      {/* Tier 1 - Lower Arched Arcade Ring (Heavy Weathered Travertine) */}
      <mesh castShadow receiveShadow position={[0, 4.0, 0]}>
        <cylinderGeometry args={[18, 19, 8, 36, 1, true, -Math.PI * 0.85, Math.PI * 1.7]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.travertineDark.color}
          roughness={0.82}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.015}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Tier 1 Entablature Cornice */}
      <mesh position={[0, 8.2, 0]}>
        <cylinderGeometry args={[18.4, 18.4, 0.6, 36, 1, true, -Math.PI * 0.85, Math.PI * 1.7]} />
        <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.76} side={THREE.DoubleSide} />
      </mesh>

      {/* Tier 2 - Upper Column Arcade Ring */}
      <mesh castShadow receiveShadow position={[0, 11.5, 0]}>
        <cylinderGeometry args={[17.5, 18, 6.5, 36, 1, true, -Math.PI * 0.85, Math.PI * 1.7]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.travertine.color}
          roughness={0.78}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.012}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Tier 2 Golden Attic Cornice */}
      <mesh position={[0, 15.0, 0]}>
        <cylinderGeometry args={[17.8, 17.8, 0.8, 36, 1, true, -Math.PI * 0.85, Math.PI * 1.7]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.goldAccent.color}
          metalness={0.75}
          roughness={0.34}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 2. ARCADE ARCH RECESSES (CLASSIC COLOSSEUM ARCHWAYS) */}
      {[-0.6, -0.4, -0.2, 0.2, 0.4, 0.6].map((radOffset, i) => {
        const angle = Math.PI / 2 + radOffset * 1.2;
        const radius = 18.3;
        const ax = Math.cos(angle) * radius;
        const az = Math.sin(angle) * radius;
        return (
          <group key={`arch-${i}`} position={[ax, 3.8, az]} rotation={[0, -angle + Math.PI / 2, 0]}>
            <mesh castShadow>
              <boxGeometry args={[2.2, 4.4, 0.4]} />
              <meshStandardMaterial color={ROMAN_PALETTE.recessDark.color} roughness={0.96} />
            </mesh>
            {/* Arch Keystone Framing */}
            <mesh position={[0, 2.4, 0.1]}>
              <cylinderGeometry args={[1.2, 1.2, 0.35, 12, 1, false, 0, Math.PI]} />
              <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.75} />
            </mesh>
          </group>
        );
      })}

      {/* 3. MONUMENTAL ARENA PORTAL ENTRANCE (PORTA LIBITINENSIS / TRIUMPHALIS) */}
      <group position={[0, 0, 15.2]}>
        {/* Broader Marble Ceremonial Entrance Steps */}
        <group position={[0, 0, 2.2]}>
          <mesh castShadow receiveShadow position={[0, 0.1, 1.0]}>
            <boxGeometry args={[14.0, 0.2, 1.2]} />
            <meshStandardMaterial color={ROMAN_PALETTE.travertineDark.color} roughness={0.8} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 0.3, 0.2]}>
            <boxGeometry args={[12.0, 0.2, 1.2]} />
            <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.76} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 0.5, -0.6]}>
            <boxGeometry args={[10.2, 0.2, 1.2]} />
            <meshStandardMaterial color={ROMAN_PALETTE.marbleWhite.color} roughness={0.65} />
          </mesh>
          {/* Phase 25: Subtle arena sand drift at entrance step corners */}
          <mesh receiveShadow position={[-7.2, 0.015, 1.2]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.2, 1.0]} />
            <meshStandardMaterial color={ROMAN_PALETTE.arenaSand.color} roughness={0.94} />
          </mesh>
          <mesh receiveShadow position={[7.2, 0.015, 1.2]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.2, 1.0]} />
            <meshStandardMaterial color={ROMAN_PALETTE.arenaSand.color} roughness={0.94} />
          </mesh>
        </group>

        {/* Massive Marble Keystone Archway Structure */}
        <mesh castShadow receiveShadow position={[0, 4.4, 0]}>
          <boxGeometry args={[10.5, 8.8, 3.4]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.travertine.color}
            roughness={0.78}
            bumpMap={NOISE_TEXTURE || undefined}
            bumpScale={0.012}
          />
        </mesh>

        {/* Portal Arch Hollow Passage */}
        <mesh position={[0, 3.2, 0.2]}>
          <boxGeometry args={[5.2, 6.4, 3.6]} />
          <meshStandardMaterial color={ROMAN_PALETTE.recessDark.color} roughness={0.96} />
        </mesh>

        {/* Heavy Iron Portcullis Gate Grille */}
        <mesh position={[0, 3.4, 0.6]}>
          <boxGeometry args={[4.8, 6.0, 0.1]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.darkIron.color}
            metalness={0.82}
            roughness={0.48}
          />
        </mesh>

        {/* Classical Roman Triumphal Pediment Roof */}
        <ClassicalPediment
          width={11.0}
          depth={3.8}
          height={2.2}
          position={[0, 8.8, 0]}
          stoneColor={ROMAN_PALETTE.travertine.color}
          trimColor={ROMAN_PALETTE.terracottaTileDark.color}
        />

        {/* Golden Roman Inscription Arch Frieze: "COLOSSEVM ROMANVM" */}
        <mesh position={[0, 7.8, 1.75]}>
          <boxGeometry args={[8.8, 1.2, 0.2]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.goldAccent.color}
            metalness={0.75}
            roughness={0.34}
          />
        </mesh>

        {/* Gilded Roman Eagle Medallion Relief over Portal */}
        <mesh position={[0, 6.5, 1.78]}>
          <cylinderGeometry args={[0.75, 0.75, 0.1, 16]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.goldAccent.color}
            metalness={0.75}
            roughness={0.34}
          />
        </mesh>

        {/* Flanking Corinthian Columns with Stepped Bases & Capitals */}
        {[-4.2, 4.2].map((cx, ci) => (
          <ClassicalColumn
            key={`col-portal-${ci}`}
            position={[cx, 0, 1.8]}
            height={8.6}
            radius={0.42}
            stoneColor={ROMAN_PALETTE.marbleWhite.color}
            capitalColor={ROMAN_PALETTE.goldAccent.color}
            order="corinthian"
          />
        ))}

        {/* Dynamic Imperial Banners */}
        {[-4.6, 4.6].map((bx, bi) => (
           <Banner key={`banner-${bi}`} position={[bx, 7.0, 1.9]} size={[1.4, 2.8]} color="#991b1b" />
        ))}

        {/* Colossal Entrance Braziers with Fire Light */}
        {[-3.0, 3.0].map((tx, ti) => (
          <group key={`col-torch-${ti}`} position={[tx, 1.2, 2.4]}>
            <mesh castShadow position={[0, 0.6, 0]}>
              <cylinderGeometry args={[0.65, 0.5, 1.2, 12]} />
              <meshStandardMaterial color="#78350f" metalness={0.7} roughness={0.3} />
            </mesh>
            <mesh position={[0, 1.35, 0]}>
              <sphereGeometry args={[0.35, 12, 12]} />
              <meshStandardMaterial color="#ff5722" emissive="#f97316" emissiveIntensity={3} />
            </mesh>
            <pointLight color="#f97316" intensity={4} distance={12} position={[0, 1.8, 0]} />
          </group>
        ))}

        {/* Flanking Spectator Travertine Benches outside monumental steps */}
        <RomanBench position={[-6.8, 0, 2.2]} rotationY={0} />
        <RomanBench position={[6.8, 0, 2.2]} rotationY={0} />

        {/* Ceremonial / Arena Oil Amphorae flanking column plinths */}
        <RomanAmphora position={[-4.8, 0, 2.8]} scale={0.9} tone="terracotta" />
        <RomanAmphora position={[4.8, 0, 2.8]} scale={0.9} tone="terracotta" />
      </group>

      {/* 4. VISIBLE INTERIOR ARENA COMBAT PIT (THROUGH ARCHWAY) */}
      <mesh receiveShadow position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[15, 32]} />
        <meshStandardMaterial color="#eab308" roughness={0.9} />
      </mesh>
    </group>
  );
};
