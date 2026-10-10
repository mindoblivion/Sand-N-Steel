import React from 'react';
import * as THREE from 'three';
import { ROMAN_PALETTE, NOISE_TEXTURE } from './RomanMaterials';
import { CornerSandDrift } from './GroundWearSystem';
import {
  RomanBench,
  TabulaNoticeBoard,
  MerchantCart,
  TimberCrate,
  RomanAmphora,
  WineBarrel,
} from './CivicFurnishingProps';
import { RomanPavedStreet, RomanPedestrianCrossing } from './RomanStreetPavement';

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
        <meshStandardMaterial color="#ff5722" emissive="#f97316" emissiveIntensity={2.2} />
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
export const CityStreets: React.FC = () => {
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

      {/* Via Decumanus East Extension (Forge -> Armor Workshop [27, 0, 1]) */}
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

      {/* 3. VIA MERCATORIA (NORTHEAST BAZAAR DIAGONAL CONNECTOR) */}
      {/* Connects Central Plaza / East Street to General Store [16, 0, -14] */}
      <mesh receiveShadow position={[12, -0.015, -8]} rotation={[-Math.PI / 2, 0, Math.PI / 5]}>
        <planeGeometry args={[8, 14]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.roadFlagstone.color}
          roughness={0.82}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.018}
        />
      </mesh>
      <RomanPavedStreet
        position={[12, 0, -8]}
        rotation={[0, -Math.PI / 5, 0]}
        length={14}
        width={8}
        district="commercial"
        hasWheelRuts={true}
        hasGutters={true}
      />

      {/* Via Mercatoria Extension (General Store -> Merchant House [26, 0, -12]) */}
      <mesh receiveShadow position={[21, -0.015, -13]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10, 6.5]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.roadFlagstone.color}
          roughness={0.82}
          bumpMap={NOISE_TEXTURE || undefined}
          bumpScale={0.018}
        />
      </mesh>
      <RomanPavedStreet
        position={[21, 0, -13]}
        axis="x"
        length={10}
        width={6.5}
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
      <StreetWall position={[-13.5, 0, -4.5]} size={[0.6, 0.9, 6.0]} />
      <StreetWall position={[-13.5, 0, 4.5]} size={[0.6, 0.9, 6.0]} />
      <RomanBench position={[-11.0, 0, -4.8]} rotationY={Math.PI / 2} />

      {/* EAST: Imperial Smithing Forge Courtyard Props */}
      <MerchantPropsCluster position={[13.2, 0, 3.8]} />
      <RomanBench position={[12.5, 0, -3.8]} rotationY={-Math.PI / 2} />

      {/* NORTHEAST: General Store Market Table & Benches */}
      <MerchantPropsCluster position={[13.5, 0, -12.2]} />
      <MerchantCart position={[10.5, 0, -10.5]} rotationY={Math.PI / 4} />
      <TimberCrate position={[14.2, 0, -13.2]} size={[0.8, 0.7, 0.8]} />
      <RomanAmphora position={[14.2, 0, -11.4]} scale={0.8} tone="sand" />

      {/* SOUTHWEST: Golden Palm Tavern Outdoor Terrace Benches */}
      <RomanBench position={[-13.0, 0, 11.2]} rotationY={Math.PI / 4} />
      <WineBarrel position={[-13.8, 0, 10.2]} rotationY={0.3} />
      <WineBarrel position={[-14.4, 0, 10.5]} isLyingDown={true} rotationY={0.5} />

      {/* SOUTHEAST: Caravanserai Inn Courtyard Benches */}
      <RomanBench position={[13.0, 0, 11.2]} rotationY={-Math.PI / 4} />
      <TimberCrate position={[14.0, 0, 12.0]} size={[0.9, 0.8, 0.9]} />
      <RomanAmphora position={[13.6, 0, 10.2]} scale={0.85} tone="terracotta" />

      {/* CIVIC COURTYARD FURNISHINGS (PHASE 26) */}
      {/* Forum Socialis Civic Notice Board & Resting Benches */}
      <TabulaNoticeBoard position={[-17.8, 0, 19.5]} rotationY={-Math.PI / 2} />
      <RomanBench position={[-21.0, 0, 23.5]} rotationY={0} />
      <RomanBench position={[-21.0, 0, 16.5]} rotationY={Math.PI} />

      {/* Minerva Academy Courtyard Resting Benches & Scholar Stone Seat */}
      <RomanBench position={[22.5, 0, -21.0]} rotationY={Math.PI / 2} stoneColor={ROMAN_PALETTE.travertine.color} />
      <RomanBench position={[27.5, 0, -21.0]} rotationY={-Math.PI / 2} stoneColor={ROMAN_PALETTE.travertine.color} />

      {/* Western Combat Services Courtyard Benches & Notice Board */}
      <RomanBench position={[-23.0, 0, -7.5]} rotationY={0} />
      <TabulaNoticeBoard position={[-23.0, 0, -12.5]} rotationY={0} />
      <WineBarrel position={[-25.5, 0, -9.2]} isLyingDown={true} rotationY={0.8} />

      {/* 6. ILLUMINATING STREET LAMPS ALONG MAJOR JUNCTIONS */}
      <StreetLamp position={[-5.8, 0, -6.0]} />
      <StreetLamp position={[5.8, 0, -6.0]} />
      <StreetLamp position={[-5.8, 0, 6.0]} />
      <StreetLamp position={[5.8, 0, 6.0]} />

      {/* 7. FUTURE EXPANSION WAY ROUTE INDICATORS (OPEN STREET ENDS) */}
      {/* North Way (toward Z = -32 Future Royal/Palace District) */}
      <mesh receiveShadow position={[0, -0.015, -28]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8, 10]} />
        <meshStandardMaterial color="#a88960" roughness={0.8} />
      </mesh>

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

      {/* Path to Records Library [20.5, 0, -28] */}
      <mesh receiveShadow position={[22.5, -0.01, -24.8]} rotation={[-Math.PI / 2, 0, -Math.PI * 0.15]}>
        <planeGeometry args={[3.6, 6.5]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.7} />
      </mesh>

      {/* Path to Doctore House [28, 0, -17] */}
      <mesh receiveShadow position={[26.5, -0.01, -19.0]} rotation={[-Math.PI / 2, 0, Math.PI * 0.12]}>
        <planeGeometry args={[3.8, 4.5]} />
        <meshStandardMaterial color="#ebdcb9" roughness={0.7} />
      </mesh>

      {/* Center Academy Monumental Obelisk */}
      <group position={[25, 0, -21]}>
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
      <mesh position={[-23, 0.08, -10]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[3.0, 0.08, 6, 24]} />
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

      {/* Paved Path: Courtyard -> Veteran Gladiator Hall */}
      <mesh receiveShadow position={[-19.5, -0.008, -13.0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7.0, 4.0]} />
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
};
