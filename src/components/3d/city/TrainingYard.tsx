import React from 'react';
import * as THREE from 'three';
import { ROMAN_PALETTE, NOISE_TEXTURE } from './RomanMaterials';

export const TrainingYard: React.FC = () => {
  return (
    <group position={[-18, 0, 0]}>
      {/* 0. STEPPED TRAVERTINE RETAINING FOUNDATION PLINTH */}
      {/* Lower ground step around sand circle */}
      <mesh receiveShadow castShadow position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[6.9, 7.3, 32]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.travertineDark.color}
          roughness={ROMAN_PALETTE.travertineDark.roughness}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.015}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Upper retaining stone curb */}
      <mesh position={[0, 0.16, 0]}>
        <torusGeometry args={[7.0, 0.12, 8, 32]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.travertine.color}
          roughness={ROMAN_PALETTE.travertine.roughness}
        />
      </mesh>

      {/* 1. SANDY GLADIATOR TRAINING RING (WARM GOLDEN ARENA SAND) */}
      <mesh receiveShadow position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[6.8, 24]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.arenaSand.color}
          roughness={ROMAN_PALETTE.arenaSand.roughness}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.02}
        />
      </mesh>

      {/* 2. TIMBER PALISADE FENCE AROUND RING */}
      {Array.from({ length: 14 }).map((_, i) => {
        const angle = (i / 14) * Math.PI * 2;
        // Leave a gap for entrance
        if (angle > -0.3 && angle < 0.6) return null;
        const radius = 6.9;
        const px = Math.cos(angle) * radius;
        const pz = Math.sin(angle) * radius;
        return (
          <group key={`fence-post-${i}`} position={[px, 0, pz]}>
            {/* Heavy Timber Post */}
            <mesh castShadow position={[0, 1.1, 0]}>
              <cylinderGeometry args={[0.18, 0.22, 2.2, 8]} />
              <meshStandardMaterial
                color={ROMAN_PALETTE.weatheredTimber.color}
                roughness={ROMAN_PALETTE.weatheredTimber.roughness}
              />
            </mesh>
            {/* Pointed Post Top */}
            <mesh castShadow position={[0, 2.3, 0]}>
              <coneGeometry args={[0.18, 0.4, 8]} />
              <meshStandardMaterial
                color={ROMAN_PALETTE.weatheredTimber.color}
                roughness={ROMAN_PALETTE.weatheredTimber.roughness}
              />
            </mesh>
          </group>
        );
      })}

      {/* Horizontal Heavy Rope Barrier */}
      <mesh position={[0, 1.1, 0]}>
        <torusGeometry args={[6.9, 0.06, 8, 32]} />
        <meshStandardMaterial color="#78350f" roughness={0.9} />
      </mesh>

      {/* 3. WOODEN TRAINING PELL DUMMIES (PALLUS) */}
      {[
        [-2.4, 0, -1.8],
        [1.8, 0, -2.2],
        [-1.6, 0, 2.4],
      ].map((pos, di) => (
        <group key={`dummy-${di}`} position={pos as [number, number, number]}>
          {/* Stone Base Anchor */}
          <mesh castShadow position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.6, 0.7, 0.4, 10]} />
            <meshStandardMaterial
              color={ROMAN_PALETTE.ashlarLight.color}
              roughness={ROMAN_PALETTE.ashlarLight.roughness}
            />
          </mesh>
          {/* Heavy Wooden Post Trunk */}
          <mesh castShadow position={[0, 1.3, 0]}>
            <cylinderGeometry args={[0.22, 0.24, 2.2, 8]} />
            <meshStandardMaterial
              color={ROMAN_PALETTE.darkStructuralTimber.color}
              roughness={ROMAN_PALETTE.darkStructuralTimber.roughness}
            />
          </mesh>
          {/* Straw / Rope Wrapping Strike Zone */}
          <mesh castShadow position={[0, 1.4, 0]}>
            <cylinderGeometry args={[0.34, 0.34, 1.1, 10]} />
            <meshStandardMaterial color="#ca8a04" roughness={0.9} />
          </mesh>
          {/* Crossbar Arms for Sword Deflection */}
          <mesh castShadow position={[0, 1.6, 0]} rotation={[0, di * 0.8, 0]}>
            <boxGeometry args={[1.5, 0.16, 0.16]} />
            <meshStandardMaterial
              color={ROMAN_PALETTE.darkStructuralTimber.color}
              roughness={ROMAN_PALETTE.darkStructuralTimber.roughness}
            />
          </mesh>
          {/* Training Straw Head */}
          <mesh castShadow position={[0, 2.4, 0]}>
            <sphereGeometry args={[0.25, 8, 8]} />
            <meshStandardMaterial color="#ca8a04" roughness={0.9} />
          </mesh>
        </group>
      ))}

      {/* 4. WEAPON PRACTICE STORAGE RACK WITH WOODEN RUDIS SWORDS */}
      <group position={[3.6, 0, 1.2]} rotation={[0, -Math.PI / 3, 0]}>
        {/* Timber Rack Frame */}
        <mesh castShadow position={[0, 1.0, 0]}>
          <boxGeometry args={[2.4, 2.0, 0.4]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.weatheredTimber.color}
            roughness={ROMAN_PALETTE.weatheredTimber.roughness}
          />
        </mesh>
        {/* Wooden Rudis Training Swords on Rack */}
        {[-0.6, -0.2, 0.2, 0.6].map((sx, si) => (
          <mesh key={`rudis-${si}`} position={[sx, 1.1, 0.25]}>
            <boxGeometry args={[0.08, 1.1, 0.04]} />
            <meshStandardMaterial color="#ca8a04" roughness={0.7} />
          </mesh>
        ))}
      </group>

      {/* 5. STONE LIFTING WEIGHTS & HALTERES */}
      <group position={[-3.8, 0, 0]}>
        <mesh castShadow position={[0, 0.3, 0]}>
          <sphereGeometry args={[0.35, 10, 10]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.ashlarStone.color}
            roughness={ROMAN_PALETTE.ashlarStone.roughness}
          />
        </mesh>
        <mesh castShadow position={[0.6, 0.25, 0.3]}>
          <sphereGeometry args={[0.28, 10, 10]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.ashlarStone.color}
            roughness={ROMAN_PALETTE.ashlarStone.roughness}
          />
        </mesh>
      </group>

      {/* 6. TRAINING YARD FIRE BRAZIER */}
      <group position={[4.5, 0, -3.2]}>
        <mesh castShadow position={[0, 0.7, 0]}>
          <cylinderGeometry args={[0.45, 0.35, 1.4, 10]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.agedBronze.color}
            metalness={ROMAN_PALETTE.agedBronze.metalness}
            roughness={ROMAN_PALETTE.agedBronze.roughness}
          />
        </mesh>
        <mesh position={[0, 1.5, 0]}>
          <sphereGeometry args={[0.25, 8, 8]} />
          <meshStandardMaterial color="#ff5722" emissive="#f97316" emissiveIntensity={3} />
        </mesh>
        <pointLight color="#f97316" intensity={3.2} distance={8} position={[0, 1.8, 0]} />
      </group>
    </group>
  );
};
