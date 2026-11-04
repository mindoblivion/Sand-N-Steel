import React from 'react';
import { BuildingFoundation } from './BuildingFoundation';
import {
  RomanGabledRoof,
  ClassicalColumn,
  ClassicalDoorway,
  ClassicalPediment,
} from './ClassicalArchitecture';
import { NOISE_TEXTURE } from './RomanMaterials';

/**
 * CITY-EXPAND-1 — The Southern District.
 * Five new buildings in the empty southern strip (Z 26→35).
 * Exteriors only. All meshes castShadow. No new lights.
 */

interface StallProps {
  position: [number, number, number];
  awningColor: string;
}

const MarketStall: React.FC<StallProps> = ({ position, awningColor }) => {
  return (
    <group position={position}>
      {/* Stall counter */}
      <mesh castShadow receiveShadow position={[0, 0.5, 0]}>
        <boxGeometry args={[2.2, 1.0, 1.4]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.8} />
      </mesh>
      {/* Awning posts */}
      {[-1, 1].map((x) => (
        <mesh key={x} castShadow position={[x, 1.5, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 2.0, 8]} />
          <meshStandardMaterial color="#6b4423" roughness={0.9} />
        </mesh>
      ))}
      {/* Striped awning */}
      <mesh castShadow position={[0, 2.6, 0]} rotation={[-0.15, 0, 0]}>
        <boxGeometry args={[2.6, 0.08, 1.8]} />
        <meshStandardMaterial color={awningColor} roughness={0.7} />
      </mesh>
    </group>
  );
};

export const ForumFountain = React.memo(() => {
  return (
    <group position={[0, 0,31}>
      {/* Stone plaza */}
      <mesh receiveShadow position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[7, 24]} />
        <meshStandardMaterial color="#d4c4a8" roughness={0.9} />
      </mesh>
      {/* Fountain basin */}
      <mesh castShadow receiveShadow position={[0, 0.6, 0]}>
        <cylinderGeometry args={[2.2, 2.5, 1.2, 16]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.6} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.012} />
      </mesh>
      {/* Water disc */}
      <mesh position={[0, 1.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.9, 16]} />
        <meshStandardMaterial color="#4a90d9" roughness={0.2} metalness={0.3} transparent opacity={0.8} />
      </mesh>
      {/* Central column */}
      <mesh castShadow position={[0, 1.8, 0]}>
        <cylinderGeometry args={[0.3, 0.4, 1.5, 12]} />
        <meshStandardMaterial color="#d4a373" roughness={0.6} />
      </mesh>
      {/* Benches */}
      {[[4, 2], [-4, 2], [4, -2], [-4, -2]].map(([x, z], i) => (
        <mesh key={i} castShadow receiveShadow position={[x, 0.3, z]}>
          <boxGeometry args={[1.8, 0.6, 0.5]} />
          <meshStandardMaterial color="#8b7355" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
});

export const MacellumMarket = React.memo(() => {
  return (
    <group position={[-14, 0, 32]}>
      <BuildingFoundation size={[10, 8]} height={0.25} projection={0.2} />
      {/* Four market stalls with alternating awnings */}
      <MarketStall position={[-3, 0, -2]} awningColor="#991b1b" />
      <MarketStall position={[3, 0, -2]} awningColor="#b45309" />
      <MarketStall position={[-3, 0, 2]} awningColor="#b45309" />
      <MarketStall position={[3, 0, 2]} awningColor="#991b1b" />
      {/* Central counter */}
      <mesh castShadow receiveShadow position={[0, 0.6, 0]}>
        <boxGeometry args={[3, 1.2, 2]} />
        <meshStandardMaterial color="#a0826d" roughness={0.7} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.01} />
      </mesh>
    </group>
  );
});

export const BibliothecaLibrary = React.memo(() => {
  return (
    <group position={[12, 0, 30]}>
      <BuildingFoundation size={[9, 7]} height={0.3} projection={0.25} />
      {/* Main hall */}
      <mesh castShadow receiveShadow position={[0, 1.8, 0]}>
        <boxGeometry args={[9, 3.6, 7]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.6} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.012} />
      </mesh>
      {/* Four Doric columns at front */}
      {[-3, -1, 1, 3].map((x) => (
        <ClassicalColumn
          key={x}
          position={[x, 0, 3.8]}
          height={3.6}
          order="doric"
        />
      ))}
      {/* Pediment and roof */}
      <ClassicalPediment position={[0, 4.2, 3.5]} width={9} />
      <RomanGabledRoof position={[0, 4.8, 0]} size={[9.5, 7.5]} />
      {/* Grand doorway */}
      <ClassicalDoorway position={[0, 0, 3.51]} width={1.6} height={2.8} />
    </group>
  );
});

export const PistrinumBakery = React.memo(() => {
  return (
    <group position={[-24, 0, 31]}>
      <BuildingFoundation size={[7, 6]} height={0.25} projection={0.2} />
      {/* Stone ground floor */}
      <mesh castShadow receiveShadow position={[0, 1.4, 0]}>
        <boxGeometry args={[7, 2.8, 6]} />
        <meshStandardMaterial color="#c9b896" roughness={0.7} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.015} />
      </mesh>
      {/* Timber upper floor */}
      <mesh castShadow receiveShadow position={[0, 3.6, 0]}>
        <boxGeometry args={[6.6, 1.6, 5.6]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.8} />
      </mesh>
      <RomanGabledRoof position={[0, 4.8, 0]} size={[7.2, 6.2]} />
      {/* Millstone */}
      <mesh castShadow receiveShadow position={[2.5, 0.5, 1.5]} rotation={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.9, 0.9, 0.3, 16]} />
        <meshStandardMaterial color="#9a9a9a" roughness={0.9} />
      </mesh>
      {/* Oven glow window */}
      <mesh position={[-2, 1.4, 3.01]}>
        <planeGeometry args={[1.2, 1.0]} />
        <meshStandardMaterial color="#ff8c42" emissive="#ff6b1a" emissiveIntensity={0.8} />
      </mesh>
      <ClassicalDoorway position={[0.5, 0, 3.01]} width={1.2} height={2.2} />
    </group>
  );
});

export const TriumphalArch = React.memo(() => {
  return (
    <group position={[0, 0,35}>
      {/* Two piers — walk-through gap between them */}
      {[-2.5, 2.5].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh castShadow receiveShadow position={[0, 2.5, 0]}>
            <boxGeometry args={[2, 5, 2.5]} />
            <meshStandardMaterial color="#ebdcb9" roughness={0.6} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.012} />
          </mesh>
          {/* Engaged column on outer face */}
          <ClassicalColumn
            position={[x > 0 ? 1.1 : -1.1, 0, 0]}
            height={4.5}
            order="corinthian"
          />
        </group>
      ))}
      {/* Lintel spanning the piers */}
      <mesh castShadow receiveShadow position={[0, 5.8, 0]}>
        <boxGeometry args={[7, 1.6, 2.5]} />
        <meshStandardMaterial color="#d4a373" roughness={0.6} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.012} />
      </mesh>
      {/* Inscription band */}
      <mesh position={[0, 5.8, 1.26]}>
        <planeGeometry args={[5.5, 0.8]} />
        <meshStandardMaterial color="#8b7355" roughness={0.7} />
      </mesh>
      {/* Attic */}
      <mesh castShadow receiveShadow position={[0, 7.2, 0]}>
        <boxGeometry args={[5, 1.2, 2]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.6} />
      </mesh>
    </group>
  );
});

export const SouthernDistrict = React.memo(() => {
  return (
    <group>
      <ForumFountain />
      <MacellumMarket />
      <BibliothecaLibrary />
      <PistrinumBakery />
      <TriumphalArch />
    </group>
  );
});
