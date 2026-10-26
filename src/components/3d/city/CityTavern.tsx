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
import { RomanAmphora, WineBarrel } from './CivicFurnishingProps';
import { NOISE_TEXTURE } from './RomanMaterials';
import { LandmarkSign } from './LandmarkSign';

export const CityTavern = React.memo(() => {
  return (
    <group position={[-16, 0, 14]}>
      {/* 0. STEPPED TRAVERTINE FOUNDATION PODIUM */}
      <BuildingFoundation size={[8.4, 7.2]} height={0.3} projection={0.25} color="#e5d0b1" capColor="#ecd9be" />

      {/* 1. TWO-STORY ROMAN TABERNA STONE VILLA */}
      <mesh castShadow receiveShadow position={[0, 3.2, 0]}>
        <boxGeometry args={[8.4, 6.4, 7.2]} />
        <meshStandardMaterial color="#78350f" roughness={0.75} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.012} />
      </mesh>

      {/* Masonry Corner Quoins */}
      <CornerQuoins height={6.4} buildingSize={[8.4, 7.2]} color="#d4a373" blockHeight={0.55} />

      {/* Horizontal String Course Cornice between 1st & 2nd floors */}
      <WallCornice size={[8.4, 7.2]} y={3.2} color="#ebdcb9" height={0.16} projection={0.12} />

      {/* Eave Cornice Below Roof */}
      <WallCornice size={[8.4, 7.2]} y={6.35} color="#ebdcb9" height={0.18} projection={0.14} />

      {/* Terracotta Gabled Sloped Roof with Overhangs & Ridge Cap */}
      <RomanGabledRoof
        width={8.4}
        depth={7.2}
        height={1.5}
        eaveOverhang={0.4}
        ridgeAlong="z"
        position={[0, 6.4, 0]}
        tileColor="#b45309"
        trimColor="#ebdcb9"
        tympanumColor="#78350f"
      />

      {/* Upper Floor Windows */}
      <ClassicalWindow
        position={[4.22, 4.8, -2.0]}
        rotation={[0, Math.PI / 2, 0]}
        width={0.75}
        height={1.0}
        stoneColor="#ebdcb9"
      />
      <ClassicalWindow
        position={[4.22, 4.8, 2.0]}
        rotation={[0, Math.PI / 2, 0]}
        width={0.75}
        height={1.0}
        stoneColor="#ebdcb9"
      />

      {/* Arched Tavern Portal Entrance with Deep Recess & Stone Jambs */}
      <ClassicalDoorway
        position={[4.22, 0, 0]}
        rotation={[0, Math.PI / 2, 0]}
        width={2.2}
        height={3.0}
        depth={0.45}
        stoneColor="#ebdcb9"
        recessColor="#1c1917"
        hasArchHeader={true}
      />

      {/* 2. SECOND-STORY WOODEN TIMBER BALCONY */}
      <group position={[4.4, 4.2, 0]}>
        {/* Balcony Floor */}
        <mesh castShadow position={[0.6, 0, 0]}>
          <boxGeometry args={[1.4, 0.2, 4.8]} />
          <meshStandardMaterial color="#451a03" roughness={0.8} />
        </mesh>
        {/* Timber Balustrade Railing */}
        <mesh castShadow position={[1.2, 0.5, 0]}>
          <boxGeometry args={[0.1, 1.0, 4.8]} />
          <meshStandardMaterial color="#593a1c" roughness={0.75} />
        </mesh>
      </group>

      {/* 3. OUTDOOR PATIO TAVERN BENCHES & WINE BARRELS */}
      {/* Phase C-8.24 — the group is re-seated onto the Tavern's north terrace.
          The C-8.23 audit measured the old anchor [3.6, 0, 2.2] *inside* the solid
          8.4 × 6.4 × 7.2 wall box: the table's east face protruded 0.10 through the
          façade above the plinth, both barrels sat wholly inside the wall, and the
          two amphorae stood against the stepped base with their bellies reaching
          0.055 (0.8-scale) and 0.144 (0.75-scale) inside plinth.upper.  No group
          shift fixed that — 0.10 west hid the table but drove the 0.75-scale jar
          into the façade — so the whole group is re-seated instead onto the Golden
          Palm's outside seating/storage strip (the terrace C-8.22 established along
          the north frontage): the pocket between the Tavern's north plinth faces
          (lower step Z = 10.15, upper step Z = 10.25, wall Z = 10.4) and the
          Training Yard's enclosure wall (coping outer radius 7.205 about [-18, 0]),
          west of the C-8.21 cypress and the C-8.22 forecourt props.
          Anchor: [3.6, 0, 2.2] → [-2.8, 0, -5.4] (world [-18.8, 0, 8.6]).
          Each offset is placed from the rendered primitives, never a bounding box;
          world footprints and the gaps that fix them (measured in
          phaseC8_24.test.ts):
            • table    — 1.4 × 0.9 × 1.2 block, X[-19.97,-18.57] Z[8.75,9.95]:
                         0.20 to the lower plinth step (Z = 10.15), 0.30 to the
                         upper step, 0.45 to the wall, 1.56 to the yard wall;
            • cups     — seated on the table top (world Y 0.95), inside its plan,
                         1.08 / 0.99 clear of the plinth;
            • amphorae — the 0.8-scale (belly r 0.208) and 0.75-scale (r 0.195) jars
                         stand on the ground at world X = -18.10: 0.26 / 0.28 east
                         of the table, 0.99 / 0.26 clear of the plinth, and 0.30 /
                         0.32 west of the C-8.22 lying barrel;
            • barrels  — the 0.9-tall upright (r 0.38) at world [-19.17, 0, 8.15],
                         and the lying barrel now rests *on* its rim instead of 0.18
                         inside it (Y 0.72 → 0.90, its underside meeting the
                         upright's 0.90 top), its axis along ±X: the stack spans
                         X[-20.0,-18.34] Z[7.77,8.53], 1.62 / 1.92 clear of the
                         plinth, 0.65 / 0.82 of the yard wall, 0.22 / 0.30 of the
                         table and 1.29 of the C-8.22 lying barrel.
          Tightest gaps after the re-seat: 0.20 (table ↔ lower plinth step), 0.22
          (table ↔ upright barrel), 0.26.  Nothing intersects the wall, the plinth,
          either step, the yard wall, the C-8.21 cypress or any C-8.22 street prop.
          Parts, rotations, colours, materials and the Tavern's root / entrance /
          collider / lighting are unchanged.
          See src/utils/phaseC8_24.test.ts. */}
      <group position={[-2.8, 0, -5.4]}>
        {/* Rustic Oak Table */}
        <mesh castShadow position={[-0.47, 0.5, 0.75]}>
          <boxGeometry args={[1.4, 0.9, 1.2]} />
          <meshStandardMaterial color="#451a03" roughness={0.8} />
        </mesh>
        {/* Clay Wine Cups */}
        <mesh position={[-0.67, 1.02, 0.75]}>
          <cylinderGeometry args={[0.08, 0.06, 0.15, 8]} />
          <meshStandardMaterial color="#c2410c" roughness={0.6} />
        </mesh>
        <mesh position={[-0.27, 1.02, 0.9]}>
          <cylinderGeometry args={[0.08, 0.06, 0.15, 8]} />
          <meshStandardMaterial color="#c2410c" roughness={0.6} />
        </mesh>
        {/* Authentic Roman Wine Amphorae stored on the terrace beside the table */}
        <RomanAmphora position={[0.7, 0, 0.35]} scale={0.8} tone="terracotta" />
        <RomanAmphora position={[0.7, 0, 1.1]} scale={0.75} tone="dark" />
        {/* Wine Barrel Stack */}
        <WineBarrel position={[-0.37, 0, -0.45]} rotationY={0} />
        <WineBarrel position={[-0.37, 0.9, -0.45]} isLyingDown={true} rotationY={0} />
      </group>

      {/* 4. HANGING TAVERN WARM LANTERNS */}
      {[-1.6, 1.6].map((lz, li) => (
        <group key={`tav-light-${li}`} position={[4.4, 3.6, lz]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.18, 0.24, 0.6, 8]} />
            <meshStandardMaterial color="#78350f" metalness={0.7} />
          </mesh>
          <pointLight color="#f59e0b" intensity={3.5} distance={8} position={[0.2, 0, 0]} />
        </group>
      ))}

      {/* L17B — landmark sign on the east (door) apron.  Data: src/data/landmarkSigns.ts */}
      <LandmarkSign id="city_tavern" />
    </group>
  );
});
