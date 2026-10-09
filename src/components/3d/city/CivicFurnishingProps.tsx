import React from 'react';
import * as THREE from 'three';
import { ROMAN_PALETTE, NOISE_TEXTURE } from './RomanMaterials';

// -----------------------------------------------------------------------------
// REUSABLE CIVIC & ENVIRONMENTAL STORYTELLING PROPS (PHASE 26)
// Restrained, historically grounded Roman props for lived-in city realism.
// -----------------------------------------------------------------------------

/**
 * Classical Roman Travertine / Marble Public Bench
 * Low backless or curved bench carved from travertine/marble slabs with profiled legs.
 */
export const RomanBench: React.FC<{
  position: [number, number, number];
  rotationY?: number;
  stoneColor?: string;
}> = ({ position, rotationY = 0, stoneColor = ROMAN_PALETTE.travertine.color }) => {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Profilated stone leg pedestals */}
      {[-0.8, 0.8].map((lx, li) => (
        <group key={`bench-leg-${li}`} position={[lx, 0, 0]}>
          {/* Base foot plinth */}
          <mesh castShadow receiveShadow position={[0, 0.08, 0]}>
            <boxGeometry args={[0.34, 0.16, 0.58]} />
            <meshStandardMaterial
              color={ROMAN_PALETTE.travertineDark.color}
              roughness={0.82}
              bumpMap={NOISE_TEXTURE || undefined}
              bumpScale={0.012}
            />
          </mesh>
          {/* Carved support stanchion */}
          <mesh castShadow receiveShadow position={[0, 0.28, 0]}>
            <boxGeometry args={[0.24, 0.26, 0.44]} />
            <meshStandardMaterial
              color={stoneColor}
              roughness={0.78}
              bumpMap={NOISE_TEXTURE || undefined}
              bumpScale={0.012}
            />
          </mesh>
          {/* Capital block under slab */}
          <mesh castShadow receiveShadow position={[0, 0.44, 0]}>
            <boxGeometry args={[0.3, 0.08, 0.52]} />
            <meshStandardMaterial color={stoneColor} roughness={0.76} />
          </mesh>
        </group>
      ))}
      {/* Polished Travertine / Marble Seat Slab */}
      <mesh castShadow receiveShadow position={[0, 0.52, 0]}>
        <boxGeometry args={[2.0, 0.1, 0.65]} />
        <meshStandardMaterial
          color={stoneColor}
          roughness={0.72}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.01}
        />
      </mesh>
    </group>
  );
};

/**
 * Authentic Roman Terracotta Amphora
 * Pointed/tapered base, bulbous body, twin neck handles, clay stopper.
 */
export const RomanAmphora: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  tone?: 'terracotta' | 'dark' | 'sand';
}> = ({
  position,
  rotation = [0, 0, 0],
  scale = 1.0,
  tone = 'terracotta',
}) => {
  const color =
    tone === 'dark'
      ? ROMAN_PALETTE.terracottaTileDark.color
      : tone === 'sand'
      ? ROMAN_PALETTE.stuccoSand.color
      : ROMAN_PALETTE.terracottaTile.color;

  return (
    <group position={position} rotation={rotation} scale={[scale, scale, scale]}>
      {/* Tapered bottom spike / stand */}
      <mesh castShadow position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.18, 0.06, 0.24, 10]} />
        <meshStandardMaterial
          color={color}
          roughness={0.82}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.015}
        />
      </mesh>
      {/* Main Ovoid Amphora Belly */}
      <mesh castShadow position={[0, 0.42, 0]}>
        <sphereGeometry args={[0.26, 12, 10]} />
        <meshStandardMaterial
          color={color}
          roughness={0.8}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.015}
        />
      </mesh>
      {/* Upper Neck */}
      <mesh castShadow position={[0, 0.72, 0]}>
        <cylinderGeometry args={[0.09, 0.14, 0.36, 10]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      {/* Rim Lip */}
      <mesh castShadow position={[0, 0.91, 0]}>
        <torusGeometry args={[0.095, 0.025, 6, 12]} />
        <meshStandardMaterial color={color} roughness={0.78} />
      </mesh>
      {/* Twin Loop Handles */}
      {[-0.13, 0.13].map((hx, hi) => (
        <mesh key={`handle-${hi}`} position={[hx, 0.68, 0]}>
          <boxGeometry args={[0.04, 0.24, 0.05]} />
          <meshStandardMaterial color={color} roughness={0.82} />
        </mesh>
      ))}
    </group>
  );
};

/**
 * Seasoned Timber Storage Crate with Iron Corner Braces
 */
export const TimberCrate: React.FC<{
  position: [number, number, number];
  rotationY?: number;
  size?: [number, number, number];
}> = ({ position, rotationY = 0, size = [0.85, 0.75, 0.85] }) => {
  const [w, h, d] = size;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Planked Wood Box Body */}
      <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.weatheredTimber.color}
          roughness={0.88}
        />
      </mesh>
      {/* Top and Bottom Iron Strapping Bands */}
      <mesh position={[0, h * 0.2, 0]}>
        <boxGeometry args={[w + 0.02, 0.06, d + 0.02]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.darkIron.color}
          metalness={0.78}
          roughness={0.52}
        />
      </mesh>
      <mesh position={[0, h * 0.8, 0]}>
        <boxGeometry args={[w + 0.02, 0.06, d + 0.02]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.darkIron.color}
          metalness={0.78}
          roughness={0.52}
        />
      </mesh>
    </group>
  );
};

/**
 * Iron-Hooped Oak Wine / Olive Oil Barrel
 */
export const WineBarrel: React.FC<{
  position: [number, number, number];
  rotationY?: number;
  isLyingDown?: boolean;
}> = ({ position, rotationY = 0, isLyingDown = false }) => {
  const rot: [number, number, number] = isLyingDown
    ? [0, rotationY, Math.PI / 2]
    : [0, rotationY, 0];
  const yOffset = isLyingDown ? 0.38 : 0.45;

  return (
    <group position={[position[0], position[1] + yOffset, position[2]]} rotation={rot}>
      {/* Bulged Stave Oak Barrel Body */}
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.34, 0.38, 0.9, 12]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.weatheredTimber.color}
          roughness={0.86}
        />
      </mesh>
      {/* Iron Hoops */}
      {[-0.32, -0.15, 0.15, 0.32].map((hy, hi) => (
        <mesh key={`hoop-${hi}`} position={[0, hy, 0]}>
          <cylinderGeometry args={[0.365, 0.365, 0.04, 12]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.darkIron.color}
            metalness={0.8}
            roughness={0.48}
          />
        </mesh>
      ))}
    </group>
  );
};

/**
 * Classical Roman Notice Board / Tabula Actis with Papyrus Notices
 */
export const TabulaNoticeBoard: React.FC<{
  position: [number, number, number];
  rotationY?: number;
}> = ({ position, rotationY = 0 }) => {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Two Timber Support Posts */}
      {[-0.7, 0.7].map((px, pi) => (
        <mesh key={`tabula-post-${pi}`} castShadow position={[px, 1.05, 0]}>
          <boxGeometry args={[0.12, 2.1, 0.12]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.darkStructuralTimber.color}
            roughness={0.9}
          />
        </mesh>
      ))}
      {/* Notice Timber Frame */}
      <mesh castShadow receiveShadow position={[0, 1.45, 0.04]}>
        <boxGeometry args={[1.65, 1.1, 0.08]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.weatheredTimber.color}
          roughness={0.88}
        />
      </mesh>
      {/* Small Pitch Eave Cap on Board */}
      <mesh castShadow position={[0, 2.05, 0.06]}>
        <boxGeometry args={[1.8, 0.12, 0.2]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.terracottaTileDark.color}
          roughness={0.78}
        />
      </mesh>
      {/* Pinned Papyrus Notices */}
      {[-0.45, 0.0, 0.45].map((nx, ni) => (
        <mesh
          key={`notice-${ni}`}
          position={[nx, 1.42 + (ni % 2 === 0 ? 0.06 : -0.06), 0.09]}
          rotation={[0, 0, (ni - 1) * 0.04]}
        >
          <planeGeometry args={[0.34, 0.52]} />
          <meshStandardMaterial
            color={ni === 1 ? '#fef08a' : '#f5e6c8'}
            roughness={0.85}
          />
        </mesh>
      ))}
    </group>
  );
};

/**
 * Roman Merchant / Porter Handcart (Plaustrum)
 * Two solid-spoke wooden wheels, wooden chassis, and bed planks.
 */
export const MerchantCart: React.FC<{
  position: [number, number, number];
  rotationY?: number;
}> = ({ position, rotationY = 0 }) => {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Central Axle */}
      <mesh castShadow position={[0, 0.42, 0]}>
        <boxGeometry args={[1.7, 0.1, 0.1]} />
        <meshStandardMaterial color={ROMAN_PALETTE.darkStructuralTimber.color} roughness={0.9} />
      </mesh>
      {/* Left and Right Timber Wheels with Iron Tyres */}
      {[-0.88, 0.88].map((wx, wi) => (
        <group key={`wheel-${wi}`} position={[wx, 0.42, 0]} rotation={[0, 0, Math.PI / 2]}>
          {/* Wheel rim */}
          <mesh castShadow>
            <cylinderGeometry args={[0.42, 0.42, 0.08, 14]} />
            <meshStandardMaterial color={ROMAN_PALETTE.weatheredTimber.color} roughness={0.88} />
          </mesh>
          {/* Iron tyre band */}
          <mesh position={[0, 0, 0]}>
            <torusGeometry args={[0.42, 0.02, 6, 14]} />
            <meshStandardMaterial color={ROMAN_PALETTE.darkIron.color} metalness={0.8} roughness={0.5} />
          </mesh>
          {/* Hub nave */}
          <mesh position={[0, 0, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.16, 10]} />
            <meshStandardMaterial color={ROMAN_PALETTE.darkIron.color} metalness={0.8} roughness={0.5} />
          </mesh>
        </group>
      ))}
      {/* Wooden Cart Bed Frame */}
      <mesh castShadow receiveShadow position={[0, 0.52, 0.1]}>
        <boxGeometry args={[1.4, 0.1, 1.8]} />
        <meshStandardMaterial color={ROMAN_PALETTE.weatheredTimber.color} roughness={0.88} />
      </mesh>
      {/* Side Slats */}
      {[-0.68, 0.68].map((sx, si) => (
        <mesh key={`slat-${si}`} castShadow position={[sx, 0.72, 0.1]}>
          <boxGeometry args={[0.06, 0.32, 1.8]} />
          <meshStandardMaterial color={ROMAN_PALETTE.darkStructuralTimber.color} roughness={0.88} />
        </mesh>
      ))}
      {/* Front Rest Props (Touching ground resting) */}
      <mesh castShadow position={[0, 0.28, 1.1]}>
        <boxGeometry args={[0.1, 0.55, 0.6]} />
        <meshStandardMaterial color={ROMAN_PALETTE.weatheredTimber.color} roughness={0.9} />
      </mesh>
      {/* Goods inside cart: amphora and small crate */}
      <RomanAmphora position={[-0.3, 0.58, 0.2]} scale={0.7} tone="terracotta" />
      <TimberCrate position={[0.25, 0.58, -0.1]} size={[0.55, 0.45, 0.55]} />
    </group>
  );
};
