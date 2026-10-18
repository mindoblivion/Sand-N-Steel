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

/**
 * Doctore House — the Chief Doctore's compact instructor's house.
 *
 * Phase C-8.19 — depth reduction (Merchant House interpenetration).
 * The 5.0 m depth interpenetrated the Merchant House: with the root at Z = -18
 * the plinth reached Z = -15.25, i.e. 1.25 m *inside* the Merchant House plinth
 * (south face X[22.15, 29.85] Z >= -16.5). The C-8.18 audit's consistent
 * shallower variant keeps the north foundation face pinned at Z = -20.75 and
 * cuts the footprint depth 5.0 -> 3.25 (plinth 5.5 -> 3.75). That moves the
 * root south to Z = -18.875 and leaves a 0.50 m plinth-to-plinth gap.
 *
 * Only the Z footprint changes. The 5.5 m width, the 3.6 m wall height, the
 * 0.45 m quoin course, the eave cornice, and the roof (0.35 m eave overhang,
 * 1.2 m ridge over a 5.5 m span, ridge along Z, same tiles/trim/tympanum)
 * are untouched, so pitch, gable proportions, materials and style are
 * preserved. The west doorway and east window stay centred on their faces
 * (local Z 0) with their C-8.16 orientations.
 *
 * Props: the practice rack and straw dummy used to sit inside the old, deeper
 * footprint; both are re-seated in the north lane (2.6 m of clear ground
 * between the north plinth face at Z = -20.75 and the Gladiator Academy plinth
 * at Z = -23.35). The class banner moves to the south wall's east end, where
 * the Merchant House plinth (X <= 29.85) does not reach, so it stands against
 * the building instead of inside the Merchant House.
 */
export const DoctoreHouse = React.memo(() => {
  return (
    // Phase C-8.13: moved south 1.0 (Z: -17 → -18) to undo the C-8.12 side
    // effect — the Merchant House shift had doubled the two footprints' Z
    // overlap (1.25 → 2.25) and cut this house's fast-travel arrival clearance
    // to the Merchant House south edge from 1.5 to 0.5.
    // Phase C-8.19: root Z = -18.875 keeps the north foundation face at
    // Z = -20.75 (-18.875 - 3.75/2) while the shallower plinth ends at
    // Z = -17.0, 0.50 clear of the Merchant House plinth.
    <group position={[28, 0, -18.875]}>
      {/* 0. STEPPED TRAVERTINE FOUNDATION PODIUM */}
      <BuildingFoundation size={[5.5, 3.25]} height={0.3} projection={0.25} color="#57534e" capColor="#78716c" />

      {/* 1. COMPACT ROMAN STONE INSTRUCTOR'S HOUSE */}
      {/* Solid Stone Walls */}
      <mesh castShadow receiveShadow position={[0, 1.8, 0]}>
        <boxGeometry args={[5.5, 3.6, 3.25]} />
        <meshStandardMaterial color="#78716c" roughness={0.7} bumpMap={NOISE_TEXTURE || undefined} bumpScale={0.012} />
      </mesh>

      {/* Dark Stone Corner Quoins */}
      <CornerQuoins height={3.6} buildingSize={[5.5, 3.25]} color="#57534e" blockHeight={0.45} />

      {/* Eave Cornice Below Roof */}
      <WallCornice size={[5.5, 3.25]} y={3.55} color="#57534e" height={0.16} projection={0.12} />

      {/* Sloping Terracotta Roof with Overhangs & Ridge Cap */}
      <RomanGabledRoof
        width={5.5}
        depth={3.25}
        height={1.2}
        eaveOverhang={0.35}
        ridgeAlong="z"
        position={[0, 3.6, 0]}
        tileColor="#b45309"
        trimColor="#57534e"
        tympanumColor="#78716c"
      />

      {/* Phase C-8.16: Doctore Instructor Window moved from the west face to the
          EAST face (local +X) so the west wall is free for the entrance.
          +Math.PI / 2 rotates the primitive's local +Z outward normal onto
          world +X (east), mirroring the -Math.PI / 2 west-face convention used
          by SmithingForge. Local X 2.76 keeps the original 0.01 outward offset
          from the 2.75 wall face. Unchanged by C-8.19: the window is centred on
          the (narrower) east face. */}
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
          Doctore House. The doorway moved to the WEST face (local -X) using the
          established west-door convention (SmithingForge), where rotation
          [0, -Math.PI / 2, 0] turns the primitive's local +Z outward normal
          onto world -X. Local X 2.77 = wall half-width 2.75 + the same 0.02
          outward offset the old south doorway used on Z. Recess, leaf-less
          opening, jambs, lintel, cap and threshold all carry through the same
          group transform. Unchanged by C-8.19: the doorway stays centred on the
          west face (local Z 0), so it lands at world Z = -18.875 with the same
          0.70 m of wall on each side of its 1.84 m-wide opening. */}
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
      {/* Phase C-8.19: the rack used to sit at local [-2.2, 0, 1.8], inside the
          old 5.0 m-deep wall (and 0.225 m into the wall face once the depth was
          cut). It is re-seated in the NORTH lane against the back wall, 0.225
          clear of the north plinth face (world Z = -20.75) and 1.175 clear of
          the Gladiator Academy plinth (Z = -23.35) — the practice lane between
          the Doctore's house and the ludus. */}
      {/* Wooden Rack Bench */}
      <group position={[-1.9, 0, -2.7]}>
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
      {/* Phase C-8.19: moved from local [-2.2, 0, -1.5] (inside the old wall) to
          the same north practice lane as the rack. The straw disc's south edge
          is 0.415 clear of the north plinth face and 0.665 clear of the wall
          face, so nothing is buried and the dummy still reads as the house's. */}
      <group position={[1.5, 0, -2.5]}>
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
      {/* Phase C-8.19: moved from local [2.0, 0, 2.7] (which the shallower
          building would have left floating 1.08 south of the wall, inside the
          Merchant House) to the south wall's east end at local [2.1, 0, 2.3].
          The pole now stands 0.375 off the plinth face and 0.575 off the wall
          face, west of the Merchant House plinth corner (X = 29.85, Z = -16.5),
          and the flag flies east over open ground. Pole top (Y = 3.6) clears the
          south roof eave (world Z = -16.90) by 0.245. */}
      <group position={[2.1, 0, 2.3]}>
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
