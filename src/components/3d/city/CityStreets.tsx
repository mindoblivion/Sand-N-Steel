import React from 'react';
import * as THREE from 'three';
import { ROMAN_PALETTE, NOISE_TEXTURE } from './RomanMaterials';
import { CornerSandDrift } from './GroundWearSystem';
import { VIA_MERCATORIA_PATH } from '../../../utils/streetGeometry';
import {
  RomanBench,
  TabulaNoticeBoard,
  MerchantCart,
  TimberCrate,
  RomanAmphora,
  WineBarrel,
} from './CivicFurnishingProps';
import { RomanPavedStreet, RomanPedestrianCrossing } from './RomanStreetPavement';
import { CityFixtureMaterial } from './CityFixtureMaterial';

/**
 * Roman Street Lamp / Torch Brazier
 */
const StreetLamp: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  return (
    <group position={position}>
      {/* Stone Base */}
      <mesh castShadow receiveShadow position={[0, 0.25, 0]}>
        <boxGeometry args={[0.7, 0.5, 0.7]} />
        <meshStandardMaterial color="#e5d0b1" roughness={0.6} />
      </mesh>
      {/* Fluted Column Post */}
      <mesh castShadow position={[0, 1.3, 0]}>
        <cylinderGeometry args={[0.18, 0.22, 1.6, 8]} />
        <meshStandardMaterial color="#f5ede0" roughness={0.5} />
      </mesh>
      {/* Bronze Fire Basin */}
      <mesh castShadow position={[0, 2.2, 0]}>
        <cylinderGeometry args={[0.42, 0.25, 0.3, 10]} />
        <meshStandardMaterial color="#78350f" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Emissive Fire Coals */}
      <mesh position={[0, 2.32, 0]}>
        <sphereGeometry args={[0.22, 8, 8]} />
        <CityFixtureMaterial fixture="brazier" base={2.2} color="#ff5722" emissive="#f97316" />
      </mesh>
      <pointLight color="#f97316" intensity={2.2} distance={8} position={[0, 2.5, 0]} />
    </group>
  );
};

/**
 * Low Travertine Street Curb / Border Wall
 */
const StreetWall: React.FC<{
  position: [number, number, number];
  size: [number, number, number];
  rotationY?: number;
}> = ({ position, size, rotationY = 0 }) => {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh castShadow receiveShadow position={[0, size[1] / 2, 0]}>
        <boxGeometry args={size} />
        <meshStandardMaterial color="#e2d4c0" roughness={0.6} />
      </mesh>
      {/* Wall Coping Cap */}
      <mesh position={[0, size[1] + 0.05, 0]}>
        <boxGeometry args={[size[0] + 0.1, 0.1, size[2] + 0.1]} />
        <meshStandardMaterial color="#f5ede0" roughness={0.5} />
      </mesh>
    </group>
  );
};

/**
 * Low-Poly Roman Street Bench
 */
const StreetBench: React.FC<{ position: [number, number, number]; rotationY?: number }> = ({
  position,
  rotationY = 0,
}) => {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Stone Supports */}
      {[-0.8, 0.8].map((x, i) => (
        <mesh key={`bench-leg-${i}`} castShadow position={[x, 0.25, 0]}>
          <boxGeometry args={[0.3, 0.5, 0.6]} />
          <meshStandardMaterial color="#d4a373" roughness={0.7} />
        </mesh>
      ))}
      {/* Marble Seat Slab */}
      <mesh castShadow receiveShadow position={[0, 0.55, 0]}>
        <boxGeometry args={[2.0, 0.12, 0.7]} />
        <meshStandardMaterial color="#ecd9be" roughness={0.4} />
      </mesh>
    </group>
  );
};

/**
 * Low-Poly Merchant Barrel / Pottery Cluster
 */
const MerchantPropsCluster: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  return (
    <group position={position}>
      {/* Storage Barrels */}
      <mesh castShadow position={[-0.4, 0.45, 0]}>
        <cylinderGeometry args={[0.35, 0.38, 0.9, 10]} />
        <meshStandardMaterial color="#78350f" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0.3, 0.4, 0.2]}>
        <cylinderGeometry args={[0.3, 0.32, 0.8, 10]} />
        <meshStandardMaterial color="#854d0e" roughness={0.8} />
      </mesh>
      {/* Roman Terra Cotta Amphora Pot */}
      <mesh castShadow position={[0.1, 0.35, -0.3]}>
        <cylinderGeometry args={[0.22, 0.15, 0.7, 10]} />
        <meshStandardMaterial color="#b45309" roughness={0.7} />
      </mesh>
    </group>
  );
};

/**
 * CityStreets Component
 * Builds the Roman urban street network connecting the Central Plaza to all 4 cardinal districts.
 */
export const CityStreets = React.memo(() => {
  return (
    <group>
      {/* 1. VIA DECUMANUS (EAST-WEST CROSS STREET) */}
      {/* Sub-bedding mortar plane (Statumen layer) */}
      <mesh receiveShadow position={[-11, -0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[14, 8]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.roadFlagstone.color}
          roughness={0.82}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.018}
        />
      </mesh>
      {/* PHASE 27: Authentic Roman Military Paved Street with Cart Wheel Grooves & Curb Gutters */}
      <RomanPavedStreet
        position={[-11, 0, 0]}
        axis="x"
        length={14}
        width={8}
        district="military"
        hasWheelRuts={true}
        hasGutters={true}
        gutterWidth={0.35}
      />
      {/* Pompeian Pedestrian Stepping Crossing Stones at Western Forum Exit */}
      <RomanPedestrianCrossing position={[-5.8, 0, 0]} rotationY={Math.PI / 2} width={7.2} />

      {/* Travertine East Street Sub-bedding (Plaza -> Smithing Forge [18, 0, 2]) */}
      <mesh receiveShadow position={[11, -0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[14, 8]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.roadFlagstone.color}
          roughness={0.82}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.018}
        />
      </mesh>
      {/* PHASE 27: Authentic Roman Commercial Paved Street with Cart Wheel Grooves & Curb Gutters */}
      <RomanPavedStreet
        position={[11, 0, 0]}
        axis="x"
        length={14}
        width={8}
        district="commercial"
        hasWheelRuts={true}
        hasGutters={true}
        gutterWidth={0.35}
      />
      {/* Pompeian Pedestrian Stepping Crossing Stones at Eastern Forum Exit */}
      <RomanPedestrianCrossing position={[5.8, 0, 0]} rotationY={Math.PI / 2} width={7.2} />

      {/* Via Decumanus East Extension (Forge -> Armor Workshop [28.2, 0, 1]) */}
      <mesh receiveShadow position={[22.5, -0.015, 1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[9, 7]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.roadFlagstone.color}
          roughness={0.82}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.018}
        />
      </mesh>
      <RomanPavedStreet
        position={[22.5, 0, 1]}
        axis="x"
        length={9}
        width={7}
        district="commercial"
        hasGutters={true}
      />

      {/* Side Curbs along East/West Cross Street */}
      {[-4.1, 4.1].map((cz, ci) => (
        <mesh key={`w-curb-${ci}`} receiveShadow castShadow position={[-11, 0.08, cz]}>
          <boxGeometry args={[14, 0.16, 0.4]} />
          <meshStandardMaterial color={ROMAN_PALETTE.roadKerb.color} roughness={0.76} />
        </mesh>
      ))}
      {[-4.1, 4.1].map((cz, ci) => (
        <mesh key={`e-curb-${ci}`} receiveShadow castShadow position={[11, 0.08, cz]}>
          <boxGeometry args={[14, 0.16, 0.4]} />
          <meshStandardMaterial color={ROMAN_PALETTE.roadKerb.color} roughness={0.76} />
        </mesh>
      ))}

      {/* Phase 25: Subtle Sand/Dust accumulations at street curb terminations and transitions */}
      {/* West curb transition toward Training Yard (sand drift) */}
      <CornerSandDrift position={[-17.5, 0, -3.9]} size={[1.0, 0.8]} tone="sand" />
      <CornerSandDrift position={[-17.5, 0, 3.9]} size={[1.0, 0.8]} tone="sand" />
      {/* East curb transition toward Smithing Forge & Armor Workshop (forge soot & street dust) */}
      <CornerSandDrift position={[17.5, 0, -3.9]} size={[1.0, 0.8]} tone="dust" />
      <CornerSandDrift position={[17.5, 0, 3.9]} size={[1.0, 0.8]} tone="forge" />
      <CornerSandDrift position={[26.5, 0, 4.2]} size={[1.1, 0.8]} tone="dust" />

      {/* 3. VIA MERCATORIA — Phase 25.9: Re-routed from diagonal (which crossed the
            Colosseum footprint) to a north-south connector from the East Street
            Extension down to the relocated General Store [22, 0, -5], then south
            toward the Merchant House [26, 0, -13] entrance on its west face. */}
      {/* Connector: East Extension [22.5, 0, 1] → General Store [22, 0, -5] */}
      <mesh receiveShadow position={[22, -0.015, -2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4, 6]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.roadFlagstone.color}
          roughness={0.82}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.018}
        />
      </mesh>
      <RomanPavedStreet
        position={[22, 0, -2]}
        axis="z"
        length={6}
        width={4}
        district="commercial"
        hasGutters={true}
      />

      {/* Path: General Store south side → Merchant House west entrance.
            Phase C-8.12: the Merchant House moved to [26, 0, -13] and its west
            foundation edge sits at X = 22.15. The former segment (centre X = 22)
            ran beneath BOTH foundations (9.45 sq under the General Store, 2.03 sq
            under the Merchant House) rather than terminating at an approach point.
            It is re-laid as an alley centred at X = 20.5 — entirely west of the
            Merchant House foundation — spanning the General Store's south
            foundation edge (Z = -8.15) down to the entrance approach (Z = -14),
            covering the merchant_house fast-travel arrival [21, -13].
            Mesh footprint X[19, 22] Z[-14, -8.2] keeps a 0.05 clearance to the
            General Store foundation and overlaps no building collider. */}
      <mesh receiveShadow position={[VIA_MERCATORIA_PATH.cx, -0.015, VIA_MERCATORIA_PATH.cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[VIA_MERCATORIA_PATH.w, VIA_MERCATORIA_PATH.d]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.roadFlagstone.color}
          roughness={0.82}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.018}
        />
      </mesh>
      <RomanPavedStreet
        position={[VIA_MERCATORIA_PATH.cx, 0, VIA_MERCATORIA_PATH.cz]}
        axis="z"
        length={VIA_MERCATORIA_PATH.d}
        width={VIA_MERCATORIA_PATH.w}
        district="commercial"
        hasGutters={true}
      />

      {/* 4. VIA TABERNARIA (SOUTHWEST & SOUTHEAST CONNECTOR STREETS) */}
      {/* Connects Central Plaza to Golden Palm Tavern [-16, 0, 14] */}
      <mesh receiveShadow position={[-11, -0.015, 8]} rotation={[-Math.PI / 2, 0, -Math.PI / 6]}>
        <planeGeometry args={[7, 12]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.roadFlagstone.color}
          roughness={0.82}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.018}
        />
      </mesh>
      <RomanPavedStreet
        position={[-11, 0, 8]}
        rotation={[0, Math.PI / 6, 0]}
        length={12}
        width={7}
        district="rustic"
        hasGutters={true}
      />

      {/* 9. FORUM SOCIALIS & VIA SOCIALIS (PHASE 5 SOUTHERN CIVIC) */}
      {/* Forum Socialis Public Square Floor (Paved Travertine) */}
      <mesh receiveShadow position={[-21, 0.005, 20]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8.0, 8.0]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.forumPaving.color}
          roughness={0.68}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.012}
        />
      </mesh>
      {/* Gold Border Trims */}
      {[-4.0, 4.0].map((offset, i) => (
        <mesh key={`fs-trim-x-${i}`} receiveShadow position={[-21, 0.007, 20 + offset]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[8.2, 0.15]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.goldAccent.color}
            metalness={0.75}
            roughness={0.34}
          />
        </mesh>
      ))}
      {[-4.0, 4.0].map((offset, i) => (
        <mesh key={`fs-trim-z-${i}`} receiveShadow position={[-21 + offset, 0.007, 20]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.15, 8.2]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.goldAccent.color}
            metalness={0.75}
            roughness={0.34}
          />
        </mesh>
      ))}

      {/* Via Socialis Connecting Lane (Southern Avenue -> Forum Socialis) */}
      <mesh receiveShadow position={[-10.5, -0.015, 20]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[13.0, 5.0]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.roadFlagstone.color}
          roughness={0.82}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.018}
        />
      </mesh>
      <RomanPavedStreet
        position={[-10.5, 0, 20]}
        axis="x"
        length={13.0}
        width={5.0}
        district="civic"
        hasGutters={true}
      />

      {/* Path: Tavern -> Forum Socialis */}
      <mesh receiveShadow position={[-18.5, -0.008, 17.0]} rotation={[-Math.PI / 2, 0, -Math.PI / 4]}>
        <planeGeometry args={[3.0, 4.5]} />
        <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.78} />
      </mesh>

      {/* Path: Forum Socialis -> Public Bathhouse [-26, 0, 25] */}
      <mesh receiveShadow position={[-23.5, -0.008, 22.5]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <planeGeometry args={[3.2, 5.0]} />
        <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.78} />
      </mesh>

      {/* Path: Forum Socialis -> Bounty Hall [-15, 0, 26] */}
      <mesh receiveShadow position={[-18.0, -0.008, 23.0]} rotation={[-Math.PI / 2, 0, -Math.PI / 4]}>
        <planeGeometry args={[3.2, 5.0]} />
        <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.78} />
      </mesh>

      {/* Path: Forum Socialis -> Roman Shrine [-27, 0, 11] */}
      <mesh receiveShadow position={[-24.0, -0.008, 15.5]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <planeGeometry args={[3.2, 6.0]} />
        <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.78} />
      </mesh>

      {/* Connects Central Plaza to Caravanserai Inn [16, 0, 14] */}
      <mesh receiveShadow position={[11, -0.015, 8]} rotation={[-Math.PI / 2, 0, Math.PI / 6]}>
        <planeGeometry args={[7, 12]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.roadFlagstone.color}
          roughness={0.82}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.018}
        />
      </mesh>
      <RomanPavedStreet
        position={[11, 0, 8]}
        rotation={[0, -Math.PI / 6, 0]}
        length={12}
        width={7}
        district="commercial"
        hasWheelRuts={true}
        hasGutters={true}
      />

      {/* Caravan Bypass (Inn [16,0,14] -> Stable [26,0,15]) */}
      <mesh receiveShadow position={[21, -0.015, 14.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10, 6.0]} />
        <meshStandardMaterial color={ROMAN_PALETTE.travertineDark.color} roughness={0.85} />
      </mesh>
      <RomanPavedStreet
        position={[21, 0, 14.5]}
        axis="x"
        length={10}
        width={6.0}
        district="rustic"
        hasGutters={true}
      />

      {/* 5. DISTRICT LANDMARK SURROUNDINGS & CONTEXTUAL ELEMENTS */}
      {/* WEST: Training Yard Boundary Wall & Benches */}
      {/* Phase 28.6: Straight wall sections (unchanged). Shortened from
           Z=±7.5 to Z=±4.60 to resolve S-01 intersection with Training
           Yard wall ring segments i=1/i=12. Inner endpoints (Z=±1.5)
           preserved to frame the entrance corridor. */}
      {/* Phase 29.0: Added 45° mitred inward returns (Candidate A) at the
           outer ends. The return body extends past the corner centerline
           by (T/2)·tan(π/8) ≈ 0.124 on each end, overlapping with the
           straight wall body to form a clean mitre line. Straight wall
           geometry is unchanged. Return visible length L_r = 1.0.
           Min 3D SAT clearance: 0.0286 (return body vs yard seg 1/12
           coping). South pier k=12 clearance: 0.133. Coping Y-range
           [0.9, 1.0] has no overlap with any yard object Y-range, so
           coping length is unconstrained by clearance. */}
      <StreetWall position={[-13.5, 0, -3.05]} size={[0.6, 0.9, 3.1]} />
      <StreetWall position={[-13.5, 0, 3.05]} size={[0.6, 0.9, 3.1]} />
      {/* North return: 45° turn to the northwest, mitred joint at Z=4.6 */}
      <StreetWall
        position={[-13.5 - Math.SQRT1_2 / 2, 0, 4.6 + Math.SQRT1_2 / 2]}
        size={[0.6, 0.9, 1.0 + 0.6 * Math.tan(Math.PI / 8)]}
        rotationY={-Math.PI / 4}
      />
      {/* South return: 45° turn to the southwest, mitred joint at Z=-4.6 */}
      <StreetWall
        position={[-13.5 - Math.SQRT1_2 / 2, 0, -4.6 - Math.SQRT1_2 / 2]}
        size={[0.6, 0.9, 1.0 + 0.6 * Math.tan(Math.PI / 8)]}
        rotationY={-3 * Math.PI / 4}
      />
      <RomanBench position={[-11.0, 0, -4.8]} rotationY={Math.PI / 2} />

      {/* EAST: Imperial Smithing Forge Courtyard Props */}
      {/* Phase C-8.22: the barrel/amphora cluster stood at [13.2, 0, 3.8], where the
          full cluster (X 12.42–13.82, Z 3.28–4.32) reached inside the Forge plinth
          (west face X = 13.0) and wall (X = 13.25) — worst pair barrelB ↔ wall −0.57,
          plinth.lower −0.39 — straddled the north kerb of the Via Decumanus
          (Z 3.9–4.3, −0.40) and also intruded into the west doorway corridor
          (Z 0.9–4.3, −0.42). It moves 1.3 west and 1.4 north to [11.9, 0, 5.2]: the
          complete cluster now clears the plinth by 0.48, and the kerb and the doorway
          corridor — which share the Z = 4.3 edge — by 0.38, while the forge arrival
          [11.5, 2.6] keeps 2.13 of room (2.4 × player radius). The Forge root, its
          collider and the west portal itself are untouched.
          See src/utils/phaseC8_22.test.ts. */}
      <MerchantPropsCluster position={[11.9, 0, 5.2]} />
      <RomanBench position={[12.5, 0, -3.8]} rotationY={-Math.PI / 2} />

      {/* NORTHEAST: General Store Market Table & Benches — Phase 25.9: relocated
            from inside the Colosseum footprint to the new General Store [22, 0, -5]
            entrance area on its west side. */}
      <MerchantPropsCluster position={[17, 0, -4]} />
      {/* Phase C-8.21: the handcart's 45°-rotated body and cargo used to sit inside the
          General Store [22, 0, -5] (plinth 0.14, counter 0.17, wall — worst
          penetration 0.58) and inside the Smithing Forge [18, 0, 2.6]
          wall (0.36). It is re-parked 7.2 west on the Via Decumanus carriageway at
          [10.8, 0, -1.7]; the full rotated cart (2.28 × 2.28 footprint) now clears the
          Store by 2.72, the Forge plinth by 0.99 and the nearest street prop — the
          bench at [12.5, 0, -3.8] — by 0.79. Rotation, parts and cargo are unchanged,
          and the cart still stands on the paved street, its 2.28-wide footprint
          leaving 1.23 to the north kerb and 4.49 to the south kerb of the 8-wide
          carriageway.
          See src/utils/phaseC8_21.test.ts. */}
      <MerchantCart position={[10.8, 0, -1.7]} rotationY={Math.PI / 4} />
      <TimberCrate position={[17.5, 0, -6]} size={[0.8, 0.7, 0.8]} />
      <RomanAmphora position={[18, 0, -3.5]} scale={0.8} tone="sand" />

      {/* SOUTHWEST: Golden Palm Tavern Outdoor Terrace Benches */}
      {/* Phase C-8.22: all three props stood inside the Tavern — the bench at
          [-13.0, 0, 11.2] reached 0.57 into the north wall and 0.15 into the plinth
          step, the barrels at [-13.8, 0, 10.2] / [-14.4, 0, 10.5] reached 0.43 and
          0.70 (they also interpenetrated each other by 0.54). The Tavern's north
          plinth face is Z = 10.15 and the C-8.21 cypress stands at [-11.5, 0, 8.55]
          (planter radius 0.8925), so the forecourt strip between them is only 0.71
          deep at the cypress — too narrow for the 1.87-deep bench, and the audit's
          Z = 9.2 candidate would have hit the planter (nearest approach 0.59 <
          0.8925). Each prop therefore also steps 0.8 outward in X to clear the tree:
          the bench to [-13.8, 0, 8.4] (nearest cypress approach 1.30, plinth 0.61),
          the barrels to [-15.5, 0, 9.1] and [-16.9, 0, 9.1]. Rotation, parts and
          cargo are unchanged; tightest pair of the whole group is the two barrels at
          +0.27. See src/utils/phaseC8_22.test.ts. */}
      <RomanBench position={[-13.8, 0, 8.4]} rotationY={Math.PI / 4} />
      <WineBarrel position={[-15.5, 0, 9.1]} rotationY={0.3} />
      <WineBarrel position={[-16.9, 0, 9.1]} isLyingDown={true} rotationY={0.5} />

      {/* SOUTHEAST: Caravanserai Inn Courtyard Benches */}
      {/* Phase C-8.22: the same audit finding on the Inn — the bench at
          [13.0, 0, 11.2] reached 0.57 into the north wall, the crate at
          [14.0, 0, 12.0] was buried 0.80 deep in it, and the amphora at
          [13.6, 0, 10.2] reached 0.30 into the plinth step; the bench and the crate
          also interpenetrated each other by 0.33. The Inn's north plinth face is
          Z = 9.95 (0.20 further out than the Tavern's 10.15) and its C-8.21 cypress
          is the mirrored [-11.5 → +11.5, 0, 8.55], so the props take the mirrored
          move: bench to [13.8, 0, 8.4] (nearest cypress approach 1.30, plinth 0.61),
          crate to [15.5, 0, 9.1] (plinth 0.40) and amphora to [16.9, 0, 9.1]
          (plinth 0.63). Sizes, scales, tones and rotations are unchanged; tightest
          pair of the group is bench ↔ crate at +0.31.
          See src/utils/phaseC8_22.test.ts. */}
      <RomanBench position={[13.8, 0, 8.4]} rotationY={-Math.PI / 4} />
      <TimberCrate position={[15.5, 0, 9.1]} size={[0.9, 0.8, 0.9]} />
      <RomanAmphora position={[16.9, 0, 9.1]} scale={0.85} tone="terracotta" />

      {/* CIVIC COURTYARD FURNISHINGS (PHASE 26) */}
      {/* Forum Socialis Civic Notice Board & Resting Benches */}
      <TabulaNoticeBoard position={[-17.8, 0, 19.5]} rotationY={-Math.PI / 2} />
      <RomanBench position={[-21.0, 0, 23.5]} rotationY={0} />
      <RomanBench position={[-21.0, 0, 16.5]} rotationY={Math.PI} />

      {/* Minerva Academy Courtyard Resting Benches & Scholar Stone Seat */}
      <RomanBench position={[22.5, 0, -21.0]} rotationY={Math.PI / 2} stoneColor={ROMAN_PALETTE.travertine.color} />
      {/* Phase C-8.22: this Doctore House bench reached 0.50 into the house's north
          wall (Z = -20.5) and 0.14 into the plinth (Z = -20.75). It moves 1.0 north
          to [27.5, 0, -22.0] — 0.28 clear of the plinth step, 0.35 clear of the
          Gladiator Academy plinth at Z = -23.35 — and stays in the house's north
          practice lane, 1.4 east of the C-8.19 practice rack and 2.0 west of the
          straw dummy. Rotation, colour and size are unchanged.
          See src/utils/phaseC8_22.test.ts. */}
      <RomanBench position={[27.5, 0, -22.0]} rotationY={-Math.PI / 2} stoneColor={ROMAN_PALETTE.travertine.color} />

      {/* Western Combat Services Courtyard Benches & Notice Board */}
      {/* Phase C-8.25: two of these props sat on the C-8.23 trimmed border ring and
          are re-seated clear of it.  The bench's east foot (the 0.34 × 0.16 × 0.58
          base plinth the RomanBench puts at local x ±0.8) reached plan radius 2.954
          about the ring's centre (-23, -10) — 0.046 inside the tube's 3.0 centreline
          — so its inner corners clipped the 0.08 tube by 0.026 at azimuth ≈ 70.8° /
          109.2°, the two feet grazing symmetrically.  The lying barrel at
          [-25.5, 0, -9.2] was worse: its 0.9-long horizontal axis
          (yaw 0.8) crossed radius 3.0, so the ring ran straight through the barrel
          body (azimuth ≈ 154°–165°, deepest 0.106 inside the solid).
          Each prop therefore steps a small, plausible distance inward, off the ring:
          the bench 0.25 toward the courtyard centre (Z −7.5 → −7.75; both feet now
          0.201 from the tube at azimuth 69.1° / 110.9°) and the barrel 0.5 east and
          0.2 south ([-25.0, 0, -9.4]; clearance 0.324 at azimuth 163.9°).  Rotation,
          parts, colour and pose are unchanged, and both keep their footing on the
          courtyard's paving (bench max plan radius 2.762, barrel 2.918 against the
          3.0 floor) while clearing the central obelisk, the notice board, the
          Gladiator Barracks plinth and the Arena Medical House by ≥ 0.87.
          The ring itself — centre, radius, tube, height and 292.55° arc — is
          untouched, so the C-8.23 trim as the courtyard's border stands.
          See src/utils/phaseC8_25.test.ts. */}
      <RomanBench position={[-23.0, 0, -7.75]} rotationY={0} />
      <TabulaNoticeBoard position={[-23.0, 0, -12.5]} rotationY={0} />
      <WineBarrel position={[-25.0, 0, -9.4]} isLyingDown={true} rotationY={0.8} />

      {/* 6. ILLUMINATING STREET LAMPS ALONG MAJOR JUNCTIONS */}
      {/* Phase 25.9: North-side lamps moved from z=-6 (inside the Colosseum
           footprint, distance 15.1 from Colosseum center) to z=2 (outside
           the Colosseum, distance 22.8). They still light the north side of
           the cross-street junction and the Colosseum approach. */}
      <StreetLamp position={[-5.8, 0, 2.0]} />
      <StreetLamp position={[5.8, 0, 2.0]} />
      <StreetLamp position={[-5.8, 0, 6.0]} />
      <StreetLamp position={[5.8, 0, 6.0]} />

      {/* 7. FUTURE EXPANSION WAY ROUTE INDICATORS (OPEN STREET ENDS) */}
      {/* Phase 25.1: Removed redundant North Way ground plane at [0, -0.015, -28].
          It was entirely hidden under the Colosseum arena floor (r=15 circle at
          world [0, -20]) and foundation podium (r=19.3 partial cylinder), causing
          a coplanar overlap / z-fighting risk. No other roads or surfaces moved. */}

      {/* 8. VIA SCHOLARIS & MINERVA ACADEMY COURTYARD (PHASE 4 NORTHERN ACADEMY) */}
      {/* Minerva Courtyard Floor (Circular Travertine) */}
      <mesh receiveShadow position={[25, 0.005, -21]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[5.2, 16]} />
        <meshStandardMaterial color="#e8dacb" roughness={0.6} />
      </mesh>
      {/* Outer Decorative Bronze Border Ring */}
      <mesh receiveShadow position={[25, 0.007, -21]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.9, 5.2, 16]} />
        <meshStandardMaterial color="#ca8a04" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Via Scholaris Main Academy Avenue */}
      <mesh receiveShadow position={[21.5, -0.012, -18.5]} rotation={[-Math.PI / 2, 0, -Math.PI / 4]}>
        <planeGeometry args={[5.0, 9.0]} />
        <meshStandardMaterial color="#c29b6f" roughness={0.7} />
      </mesh>

      {/* Path to Gladiator Academy [30.5, 0, -27] */}
      <mesh receiveShadow position={[27.8, -0.01, -24.2]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <planeGeometry args={[4.0, 7.0]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.7} />
      </mesh>

      {/* Phase 25.9: Path to Records Library [23.10, 0, -30] — shifted south to
           reach the relocated library, clearing the Colosseum footprint.
           Phase C-8.18: the library root moved 0.90 west; this paving patch is
           decorative (no collision) and its 6.4 × 7.9 XZ span still covers the
           library's front, so the mesh itself was left in place. */}
      <mesh receiveShadow position={[24, -0.01, -25.5]} rotation={[-Math.PI / 2, 0, -Math.PI * 0.15]}>
        <planeGeometry args={[3.6, 7.0]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.7} />
      </mesh>

      {/* Path to Doctore House [28, 0, -18] — the paving patch itself is
           decorative (no collision) and already spans the house's south and
           west approach, so Phase C-8.13 left this mesh in place. */}
      <mesh receiveShadow position={[26.5, -0.01, -19.0]} rotation={[-Math.PI / 2, 0, Math.PI * 0.12]}>
        <planeGeometry args={[3.8, 4.5]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.7} />
      </mesh>

      {/* Center Academy Monumental Obelisk */}
      {/* Phase C-8.22: the obelisk base (0.9 × 0.9) at [25, 0, -21] overlapped the
          Doctore House plinth — its Z −20.55 face is 0.20 inside the plinth's Z =
          -20.75 face, and its X band 24.55–25.45 is 0.45 inside the plinth's west
          face X = 25.0 — reaching 0.135 into plinth.lower and 0.125 into the north-
          west quoin stack. The smallest safe move for a 0.20 Z-gap is 0.40 north
          (Z = -21.40; 0.45 already buys 0.25); the shipped 0.6 north (Z = -21.6)
          clears the plinth by 0.40, the plinth step by 0.50 and the quoin stack by
          0.475. The whole group
          (base + spire, with its π/4 spire rotation) moves together; X, the
          courtyard floor, the doctore_house arrival [23.5, -18.875] and the west
          doorway's approach corridor are untouched. It keeps its 0.15 clearance to
          the C-8.19 practice rack (unchanged from before the move — the rack's X band
          starts at 25.6); C-8.23 later steps the group a further 0.10 west, below.
          See src/utils/phaseC8_22.test.ts. */}
      {/* Phase C-8.23: that 0.15 rack gap was still the only pair in the city below
          the 0.2 floor the neighbouring phases hold, so the group steps a further
          0.10 west (X 25 → 24.9). The pair shares both its Y band (0–0.4 against
          0–0.8) and its Z band (−22.05…−21.15 against −22.175…−20.975), so 0.15 was
          the exact X separation and 0.25 is the new one (the spire clears by 0.42).
          The move is X-only, so every Z-governed gap is unchanged: Doctore House
          plinth.lower 0.40, plinth.upper 0.50, the west quoin stack 0.475, the wall
          0.65, and the Gladiator Academy plinth 1.30. The group's internal
          transform, its π/4 spire rotation, the 5.2 m paved courtyard circle and the
          doctore_house arrival [23.5, −18.875] are untouched.
          See src/utils/phaseC8_23.test.ts. */}
      <group position={[24.9, 0, -21.6]}>
        {/* Square Marble base plinth */}
        <mesh castShadow receiveShadow position={[0, 0.2, 0]}>
          <boxGeometry args={[0.9, 0.4, 0.9]} />
          <meshStandardMaterial color="#e5d0b1" roughness={0.5} />
        </mesh>
        {/* Tapered Obelisk Spire */}
        <mesh castShadow position={[0, 1.4, 0]} rotation={[0, Math.PI / 4, 0]}>
          <cylinderGeometry args={[0.15, 0.28, 2.0, 4]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.6} />
        </mesh>
      </group>

      {/* Northwest Way (toward [-28, -28] Future Temple District) */}
      <mesh receiveShadow position={[-24, -0.015, -24]} rotation={[-Math.PI / 2, 0, -Math.PI / 4]}>
        <planeGeometry args={[7, 10]} />
        <meshStandardMaterial color="#a88960" roughness={0.8} />
      </mesh>

      {/* Southeast Way (toward [28, 28] Future Crafting Expansion) */}
      <mesh receiveShadow position={[24, -0.015, 24]} rotation={[-Math.PI / 2, 0, -Math.PI / 4]}>
        <planeGeometry args={[7, 10]} />
        <meshStandardMaterial color="#a88960" roughness={0.8} />
      </mesh>

      {/* Southwest Way (toward [-28, 28] Future Guild/Criminal District) */}
      <mesh receiveShadow position={[-24, -0.015, 24]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <planeGeometry args={[7, 10]} />
        <meshStandardMaterial color="#a88960" roughness={0.8} />
      </mesh>

      {/* 10. WESTERN COMBAT & GLADIATOR SERVICES DISTRICT COURTYARD & PATHS */}
      {/* Circular Combat Courtyard Paved Floor */}
      <mesh receiveShadow position={[-23, 0.005, -10]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.0, 24]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.7} />
      </mesh>

      {/* Low Stone Border around Courtyard */}
      {/* Phase C-8.23: the C-8.20 audit's ring-vs-barracks finding is real. The
          Gladiator Barracks' plinth (root [-27, 0, -14]) puts its north-east corner
          at (-23.45, -10.95) — only 1.051 from this courtyard's centre (-23, -10) —
          and spans X ≤ -23.45 with Z ≤ -10.95, so the r = 3.0 border entered the
          plinth's north face at (-25.85, -10.95) and left through its east face at
          (-23.45, -12.97). That ~62° arc — about 31% of the ring's tube surface —
          sat inside the plinth and inside the barracks wall behind it, leaving only
          the two face crossings outside the solid, where the ring visually stabbed
          through the corner. Neither alternative works: every boundary-scale radius
          meets that corner (clearing it needs r < 0.97, which no longer borders the
          3.0-radius paved circle) and re-centring needs 2.63 east or 2.13 north,
          which would decouple the ring from the floor it edges.
          The affected arc is therefore trimmed: centre, radius, tube, height,
          segment count and material are unchanged, and the ring now runs 292.55°
          (arc 5.106 rad) rotated 163.975° in-plane, removing the arc between
          azimuth 196.03° and 263.47°. Both ends stop with the tube surface 0.10
          clear of the plinth's north (Z = -10.95) and east (X = -23.45) faces, so
          the border terminates at the barracks instead of passing through it.
          Measured on the real TorusGeometry: 0 vertices inside the plinth or wall and
          a minimum surface clearance of 0.0997, where about 31% of the untrimmed
          ring's sampled surface points lie inside them.
          The courtyard's own furniture lies outside the removed arc and is
          untouched: the central obelisk, the notice board (posts
          at plan radius 2.670, 0.25 clear of the tube), the walkways, the entrances
          and every fast-travel arrival. Two pre-existing grazes of that furniture on
          the ring were measured here and left in place — both lie outside the removed
          arc: the west bench's east foot overlapped the tube by 0.026 at azimuth 71°,
          and the lying barrel at [-25.5, 0, -9.2] enclosed it (the ring ran through
          the barrel body, azimuth ≈ 153.9°–163.5°).  Phase C-8.25 later re-seated
          both props clear of the ring; the prop transforms below are C-8.23's.
          See src/utils/phaseC8_23.test.ts. */}
      <mesh position={[-23, 0.08, -10]} rotation={[-Math.PI / 2, 0, 2.8619]}>
        <torusGeometry args={[3.0, 0.08, 6, 24, 5.106]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.6} />
      </mesh>

      {/* Central Courtyard Monumental Obelisk */}
      <group position={[-23, 0, -10]}>
        {/* Square base plinth */}
        <mesh castShadow receiveShadow position={[0, 0.15, 0]}>
          <boxGeometry args={[0.7, 0.3, 0.7]} />
          <meshStandardMaterial color="#ebdcb9" roughness={0.6} />
        </mesh>
        {/* Tapered spire */}
        <mesh castShadow position={[0, 1.0, 0]}>
          <cylinderGeometry args={[0.1, 0.18, 1.4, 4]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.5} />
        </mesh>
      </group>

      {/* Diagonal Paved Path connecting Central West Street to Courtyard */}
      <mesh receiveShadow position={[-19.0, -0.008, -6.0]} rotation={[-Math.PI / 2, 0, -Math.PI / 4]}>
        <planeGeometry args={[4.0, 11.0]} />
        <meshStandardMaterial color="#c29b6f" roughness={0.65} />
      </mesh>

      {/* Paved Path: Courtyard -> Gladiator Barracks */}
      <mesh receiveShadow position={[-25.0, -0.008, -12.0]} rotation={[-Math.PI / 2, 0, -Math.PI / 4]}>
        <planeGeometry args={[4.0, 5.0]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.7} />
      </mesh>

      {/* Phase 25.9: Paved Path: Courtyard [-23, -10] → Veteran Gladiator Hall
           [-24, -25]. Re-routed south along the east side of the Gladiator
           Barracks (x=-21.5, clear of barracks east edge x=-23.45) to the
           relocated VGH. Min clearance from Colosseum: 1.1 m at path's
           northeast corner. */}
      <mesh receiveShadow position={[-21.5, -0.008, -17.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.0, 15.0]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.7} />
      </mesh>

      {/* Paved Path: Courtyard -> Arena Medical House */}
      <mesh receiveShadow position={[-26.0, -0.008, -7.5]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <planeGeometry args={[4.0, 6.0]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.7} />
      </mesh>

      {/* Phase 25: Subtle Western Courtyard ground dust at path junctions */}
      <CornerSandDrift position={[-20.8, 0, -8.2]} size={[1.1, 0.9]} tone="dust" />
      <CornerSandDrift position={[-25.2, 0, -10.5]} size={[0.9, 0.9]} tone="dust" />
    </group>
  );
});
