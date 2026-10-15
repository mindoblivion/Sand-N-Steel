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
import { NOISE_TEXTURE } from './RomanMaterials';

export const DoctoreHouse = React.memo(() => {
  return (
    // Phase C-8.13: moved south 1.0 (Z: -17 → -18) to undo the C-8.12 side
    // effect — the Merchant House shift had doubled the two footprints' Z
    // overlap (1.25 → 2.25) and cut this house's fast-travel arrival clearance
    // to the Merchant House south edge from 1.5 to 0.5.
    <group position={[28, 0, -18]}>
      {/* 0. STEPPED TRAVERTINE FOUNDATION PODIUM */}
      <BuildingFoundation size={[5.5, 5.0]} height={0.3} projection={0.25} color="#57534e" capColor="#78716c" />

      {/* 1. COMPACT ROMAN STONE INSTRUCTOR'S HOUSE */}
      {/* Solid Stone Walls */}
      <mesh castShadow receiveShadow position={[0, 1.8, 0]}>
        <boxGeometry args={[5.5, 3.6, 5.0]} />
        <meshStandardMaterial color="#78716c" roughness={0.7} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.012} />
      </mesh>

      {/* Dark Stone Corner Quoins */}
      <CornerQuoins height={3.6} buildingSize={[5.5, 5.0]} color="#57534e" blockHeight={0.45} />

      {/* Eave Cornice Below Roof */}
      <WallCornice size={[5.5, 5.0]} y={3.55} color="#57534e" height={0.16} projection={0.12} />

      {/* Sloping Terracotta Roof with Overhangs & Ridge Cap */}
      <RomanGabledRoof
        width={5.5}
        depth={5.0}
        height={1.2}
        eaveOverhang={0.35}
        ridgeAlong="z"
        position={[0, 3.6, 0]}
        tileColor="#b45309"
        trimColor="#57534e"
        tympanumColor="#78716c"
      />

      {/* Phase C-8.16: Doctore Instructor Window moved from the west face to the
          EAST face (local +X) so the west wall is free for the new entrance.
          +Math.PI / 2 rotates the primitive's local +Z outward normal onto
          world +X (east), mirroring the -Math.PI / 2 west-face convention used
          by SmithingForge. Local X 2.76 keeps the original 0.01 outward offset
          from the 2.75 wall face. */}
      <ClassicalWindow
        position={[2.76, 2.2, 0]}
        rotation={[0, Math.PI / 2, 0]}
        width={0.7}
        height={0.9}
        stoneColor="#57534e"
      />

      {/* Phase C-8.16: WEST-FACING ENTRANCE.
          The C-8.15 audit found the south doorway (local Z 2.52 → world
          [28, -15.48]) buried inside the MerchantHouse collider
          (x[22.15,29.85] z[-16.5,-9.5]), so an approach there is unreachable
          and getNearbyHubLocation selects the Merchant House instead of the
          Doctore House. The doorway moves to the WEST face (local -X) using the
          established west-door convention (SmithingForge), where rotation
          [0, -Math.PI / 2, 0] turns the primitive's local +Z outward normal
          onto world -X. Local X 2.77 = wall half-width 2.75 + the same 0.02
          outward offset the old south doorway used on Z. Recess, leaf-less
          opening, jambs, lintel, cap and threshold all carry through the same
          group transform. Collider, hub, arrival, foundation and street
          geometry are unchanged. */}
      <ClassicalDoorway
        position={[-2.77, 0, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        width={1.4}
        height={2.2}
        depth={0.35}
        stoneColor="#57534e"
        recessColor="#141210"
      />

      {/* 2. EXTERIOR WEAPON RACKS & TRAINING PROPS */}
      {/* Wooden Rack Bench */}
      <group position={[-2.2, 0, 1.8]}>
        <mesh castShadow position={[0, 0.4, 0]}>
          <boxGeometry args={[1.0, 0.8, 1.2]} />
          <meshStandardMaterial color="#5c3f1f" roughness={0.8} />
        </mesh>
        {/* Practice Wooden Swords */}
        {[-0.3, 0.3].map((z, i) => (
          <mesh key={`p-gladius-${i}`} castShadow position={[0, 0.85, z]} rotation={[0.5, 0.1, 0.2]}>
            <boxGeometry args={[0.06, 0.06, 0.7]} />
            <meshStandardMaterial color="#78350f" roughness={0.8} />
          </mesh>
        ))}
      </group>

      {/* 3. STRAW PRACTICE TARGET / SHIELD DUMMY */}
      <group position={[-2.2, 0, -1.5]}>
        {/* Wooden Post */}
        <mesh castShadow position={[0, 0.8, 0]}>
          <cylinderGeometry args={[0.08, 0.1, 1.6, 8]} />
          <meshStandardMaterial color="#451a03" roughness={0.9} />
        </mesh>
        {/* Round Straw Target */}
        <mesh castShadow position={[0, 1.2, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.45, 0.45, 0.22, 10]} />
          <meshStandardMaterial color="#ca8a04" roughness={0.95} />
        </mesh>
      </group>

      {/* 4. DOCTORE CLASS BANNER (Crimson) */}
      <group position={[2.0, 0, 2.7]}>
        {/* Wooden vertical banner pole */}
        <mesh castShadow position={[0, 1.8, 0]}>
          <cylinderGeometry args={[0.06, 0.08, 3.6, 8]} />
          <meshStandardMaterial color="#451a03" roughness={0.9} />
        </mesh>
        {/* Crimson flag cloth */}
        <mesh castShadow position={[0.4, 2.8, 0.02]} rotation={[0, 0, 0.1]}>
          <boxGeometry args={[0.8, 1.0, 0.06]} />
          <meshStandardMaterial color="#991b1b" roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
});
