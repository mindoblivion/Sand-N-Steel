import React from 'react';
import * as THREE from 'three';
import { BuildingFoundation } from './BuildingFoundation';
import { RomanGabledRoof, CornerQuoins, WallCornice } from './ClassicalArchitecture';

export const Stable: React.FC = () => {
  return (
    <group position={[26, 0, 15]}>
      {/* 0. STEPPED TRAVERTINE FOUNDATION PODIUM */}
      <BuildingFoundation size={[7.0, 7.2]} height={0.3} projection={0.25} color="#57534e" capColor="#78716c" />

      {/* 1. STABLE TIMBER BARN BUILDING */}
      {/* Stone wall base ring */}
      <mesh castShadow receiveShadow position={[0, 0.4, 0]}>
        <boxGeometry args={[6.8, 0.8, 7.0]} />
        <meshStandardMaterial color="#57534e" roughness={0.8} />
      </mesh>

      {/* Rough Oak Wood Walls with Open Doorways */}
      <mesh castShadow receiveShadow position={[0, 2.1, 3.1]}>
        <boxGeometry args={[6.8, 2.6, 0.4]} />
        <meshStandardMaterial color="#78350f" roughness={0.85} />
      </mesh>
      {/* Side walls */}
      <mesh castShadow receiveShadow position={[-3.2, 2.1, 0]}>
        <boxGeometry args={[0.4, 2.6, 6.6]} />
        <meshStandardMaterial color="#78350f" roughness={0.85} />
      </mesh>
      <mesh castShadow receiveShadow position={[3.2, 2.1, 0]}>
        <boxGeometry args={[0.4, 2.6, 6.6]} />
        <meshStandardMaterial color="#78350f" roughness={0.85} />
      </mesh>

      {/* Heavy Timber Corner Posts */}
      <CornerQuoins height={3.4} buildingSize={[6.8, 7.0]} color="#451a03" blockHeight={0.6} />

      {/* Front Entrance Open Cutout Support Posts */}
      {[-2.0, 2.0].map((x, i) => (
        <mesh key={`stable-post-${i}`} castShadow position={[x, 2.1, -3.1]}>
          <boxGeometry args={[0.4, 2.6, 0.4]} />
          <meshStandardMaterial color="#451a03" roughness={0.9} />
        </mesh>
      ))}

      {/* Eave Tie-Beam */}
      <WallCornice size={[6.8, 7.0]} y={3.35} color="#451a03" height={0.18} projection={0.14} />

      {/* Terracotta Gabled Sloped Roof with Overhangs & Ridge Cap */}
      <RomanGabledRoof
        width={6.8}
        depth={7.0}
        height={1.3}
        eaveOverhang={0.35}
        ridgeAlong="z"
        position={[0, 3.4, 0]}
        tileColor="#b45309"
        trimColor="#451a03"
        tympanumColor="#78350f"
      />

      {/* 2. COMPACT WOODEN PADDOCK FENCING (Left & Front enclosure) */}
      <group position={[-1.6, 0, -5.0]}>
        {/* Horizontal rail */}
        <mesh castShadow position={[0, 0.75, 0]}>
          <boxGeometry args={[4.2, 0.1, 0.1]} />
          <meshStandardMaterial color="#78350f" roughness={0.9} />
        </mesh>
        <mesh castShadow position={[0, 1.25, 0]}>
          <boxGeometry args={[4.2, 0.1, 0.1]} />
          <meshStandardMaterial color="#78350f" roughness={0.9} />
        </mesh>
        {/* Vertical posts */}
        {[-2.0, 0, 2.0].map((x, i) => (
          <mesh key={`paddock-fence-${i}`} castShadow position={[x, 0.75, 0]}>
            <boxGeometry args={[0.15, 1.5, 0.15]} />
            <meshStandardMaterial color="#451a03" roughness={0.9} />
          </mesh>
        ))}
      </group>

      {/* 3. STRAW, HAY & FEED TROUGH PROPS */}
      {/* Hay Stack Pile */}
      <group position={[-2.4, 0, -2.2]}>
        <mesh castShadow position={[0, 0.45, 0]}>
          <boxGeometry args={[1.4, 0.9, 1.4]} />
          <meshStandardMaterial color="#eab308" roughness={0.95} />
        </mesh>
        {/* Top extra bundle */}
        <mesh position={[0.15, 0.95, -0.1]}>
          <boxGeometry args={[1.0, 0.5, 1.0]} />
          <meshStandardMaterial color="#ca8a04" roughness={0.95} />
        </mesh>
      </group>

      {/* Timber Feed Trough */}
      <group position={[2.2, 0, -2.4]}>
        <mesh castShadow position={[0, 0.4, 0]}>
          <boxGeometry args={[0.8, 0.8, 1.8]} />
          <meshStandardMaterial color="#593a1c" roughness={0.85} />
        </mesh>
        {/* Feed grass inside */}
        <mesh position={[0, 0.82, 0]}>
          <boxGeometry args={[0.6, 0.1, 1.6]} />
          <meshStandardMaterial color="#84cc16" roughness={0.9} />
        </mesh>
      </group>

      {/* Water Bucket */}
      <mesh castShadow position={[2.2, 0.3, -0.8]}>
        <cylinderGeometry args={[0.25, 0.20, 0.6, 8]} />
        <meshStandardMaterial color="#6b7280" metalness={0.5} roughness={0.5} />
      </mesh>
    </group>
  );
};
