import React, { Suspense, useMemo } from 'react';
import * as THREE from 'three';
import {
  BLUEPRINT_BUILDING_ASSETS,
  CITADEL_RAMP_END_Z,
  CITADEL_RAMP_HALF_WIDTH,
  CITADEL_RAMP_START_Z,
  CITADEL_SUMMIT_Y,
  CITY_LAYOUT_BLUEPRINT,
  type BlueprintBuilding,
  type BlueprintProp,
  type BlueprintRoad,
} from '../../../data/cityLayoutBlueprint';
import { computeRoadTransform } from '../../../utils/cityBlueprintLoader';
import { MOTTE_CENTER_Z, SUMMIT_Y } from '../../../utils/terrainHeight';
import { ThreeComponentErrorBoundary } from '../../ui/ThreeComponentErrorBoundary';
import { ROMAN_PALETTE, NOISE_TEXTURE, TRAVERTINE_TEXTURE, SAND_TEXTURE } from './RomanMaterials';
import { ForumFountain } from './SouthernDistrict';
import { GrandColosseum } from './GrandColosseum';
import { GladiatorAcademy } from './GladiatorAcademy';
import { EastCircusArena } from './EastCircusArena';
import { CityTavern } from './CityTavern';
import { SmithingForge } from './SmithingForge';
import { GeneralStore } from './GeneralStore';
import { RecordsLibrary } from './RecordsLibrary';
import { NorthernMotte } from './NorthernMotte';
import { NorthernFortress } from './NorthernFortress';
import { isStep3BuildingId } from './BlueprintNorthDistricts';

/**
 * Extended desert ground plane (760x760) surrounding the 500x500 blueprint grid
 * and extending smoothly beyond the ±200 perimeter walls into horizon fog.
 */
export const BlueprintGround: React.FC = React.memo(() => {
  return (
    <group>
      {/* Main desert sand terrain extending past ±250 into horizon fog */}
      <mesh receiveShadow position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[760, 760]} />
        <meshStandardMaterial
          color="#c8b08a"
          roughness={0.94}
          bumpMap={SAND_TEXTURE || undefined}
          bumpScale={0.025}
        />
      </mesh>
    </group>
  );
});

const BlueprintRoadMesh: React.FC<{ road: BlueprintRoad }> = React.memo(({ road }) => {
  const transform = useMemo(() => computeRoadTransform(road), [road]);
  const isMain = road.type === 'main_artery';
  const curbWidth = 0.45;
  const curbHeight = 0.11;
  const roadColor = isMain ? '#9e907e' : '#b2a18a';

  return (
    <group position={transform.center} rotation={[0, transform.yaw, 0]}>
      {/* Road paver bed */}
      <mesh receiveShadow position={[0, 0.0, 0]}>
        <boxGeometry args={[transform.width, 0.08, transform.length]} />
        <meshStandardMaterial
          color={roadColor}
          roughness={0.86}
          bumpMap={TRAVERTINE_TEXTURE || NOISE_TEXTURE || undefined}
          bumpScale={0.02}
        />
      </mesh>

      {/* Center Roman crown flagstone runner on main 12-unit arteries */}
      {isMain && (
        <mesh receiveShadow position={[0, 0.045, 0]}>
          <boxGeometry args={[1.1, 0.015, transform.length]} />
          <meshStandardMaterial color="#cbb99e" roughness={0.8} />
        </mesh>
      )}

      {/* Left & right raised travertine curbs */}
      {[-1, 1].map((side) => (
        <mesh
          key={`curb-${side}`}
          castShadow
          receiveShadow
          position={[side * (transform.width / 2 + curbWidth / 2), curbHeight / 2 - 0.02, 0]}
        >
          <boxGeometry args={[curbWidth, curbHeight, transform.length]} />
          <meshStandardMaterial
            color={ROMAN_PALETTE.travertine.color}
            roughness={0.78}
          />
        </mesh>
      ))}
    </group>
  );
});

export const BlueprintRoads: React.FC = React.memo(() => {
  return (
    <group name="blueprint-roads">
      {/* 25x25 Central Forum Plaza stone pavement at [0,0,0] */}
      <mesh receiveShadow position={[0, 0.015, 0]}>
        <boxGeometry args={[25, 0.09, 25]} />
        <meshStandardMaterial
          color="#dfd0b8"
          roughness={0.78}
          bumpMap={TRAVERTINE_TEXTURE || undefined}
          bumpScale={0.015}
        />
      </mesh>
      {CITY_LAYOUT_BLUEPRINT.roads.map((road) => (
        <BlueprintRoadMesh key={road.id} road={road} />
      ))}
    </group>
  );
});

/**
 * Walkable Y=0 -> Y=8 Roman Citadel Causeway & Summit Landing for bldg_castle_motte.
 * Spans local Z +47 (world Z -133, road_main_north end) up to local Z +19 (world Z -161).
 */
const CitadelWalkableRamp: React.FC<{ motteCenterZ: number }> = React.memo(({ motteCenterZ }) => {
  const localStartZ = CITADEL_RAMP_START_Z - motteCenterZ; // +47
  const localEndZ = CITADEL_RAMP_END_Z - motteCenterZ; // +19
  const horizontalLen = localStartZ - localEndZ; // 28
  const midZ = (localStartZ + localEndZ) / 2; // +33
  const rampLength = Math.hypot(horizontalLen, CITADEL_SUMMIT_Y);
  const slopeAngle = Math.atan2(CITADEL_SUMMIT_Y, horizontalLen);
  const rampWidth = CITADEL_RAMP_HALF_WIDTH * 2;
  const deckThickness = 0.35;
  const wallWidth = 0.45;

  return (
    <group>
      {/* Sloped stone deck rising cleanly from Y=0 to Y=8 */}
      <mesh
        castShadow
        receiveShadow
        position={[0, CITADEL_SUMMIT_Y / 2 - (deckThickness / 2) * Math.cos(slopeAngle), midZ]}
        rotation={[slopeAngle, 0, 0]}
      >
        <boxGeometry args={[rampWidth, deckThickness, rampLength]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.travertine.color}
          roughness={0.82}
          bumpMap={TRAVERTINE_TEXTURE || undefined}
          bumpScale={0.018}
        />
      </mesh>

      {/* Ramp left/right parapet stone walls */}
      {[-1, 1].map((side) => (
        <mesh
          key={`ramp-parapet-${side}`}
          castShadow
          receiveShadow
          position={[
            side * (CITADEL_RAMP_HALF_WIDTH + wallWidth / 2),
            CITADEL_SUMMIT_Y / 2 + 0.45,
            midZ,
          ]}
          rotation={[slopeAngle, 0, 0]}
        >
          <boxGeometry args={[wallWidth, 1.1, rampLength]} />
          <meshStandardMaterial color={ROMAN_PALETTE.travertineDark.color} roughness={0.84} />
        </mesh>
      ))}

      {/* Viaduct support piers under the incline */}
      {[0.25, 0.5, 0.75].map((t, idx) => {
        const z = localStartZ - t * horizontalLen;
        const h = t * CITADEL_SUMMIT_Y - 0.15;
        return (
          <mesh key={`ramp-pier-${idx}`} castShadow receiveShadow position={[0, h / 2, z]}>
            <boxGeometry args={[rampWidth - 0.4, Math.max(0.4, h), 2.2]} />
            <meshStandardMaterial color="#8c7b66" roughness={0.88} />
          </mesh>
        );
      })}

      {/* Drawbridge gateway stone pillars & chains framing the ramp foot */}
      {[-1, 1].map((side) => (
        <group key={`gate-pylon-${side}`} position={[side * (CITADEL_RAMP_HALF_WIDTH + 0.6), 0, localStartZ - 1.0]}>
          <mesh castShadow receiveShadow position={[0, 2.4, 0]}>
            <boxGeometry args={[1.1, 4.8, 1.1]} />
            <meshStandardMaterial color={ROMAN_PALETTE.ashlarLight.color} roughness={0.8} />
          </mesh>
          <mesh castShadow position={[0, 4.95, 0]}>
            <boxGeometry args={[1.35, 0.35, 1.35]} />
            <meshStandardMaterial color={ROMAN_PALETTE.travertine.color} roughness={0.75} />
          </mesh>
        </group>
      ))}

      {/* Flat paved Y=8 Citadel Summit courtyard between ramp crest (+19) and fortress gate */}
      <mesh receiveShadow position={[0, CITADEL_SUMMIT_Y - 0.12, 11.5]}>
        <boxGeometry args={[28, 0.28, 17]} />
        <meshStandardMaterial
          color={ROMAN_PALETTE.forumPaving.color}
          roughness={0.8}
          bumpMap={TRAVERTINE_TEXTURE || undefined}
          bumpScale={0.014}
        />
      </mesh>
    </group>
  );
});

const BlueprintBuildingAsset: React.FC<{ building: BlueprintBuilding }> = React.memo(({ building }) => {
  const mapping = BLUEPRINT_BUILDING_ASSETS[building.id];
  const [bx, , bz] = building.position;

  if (building.id === 'bldg_castle_motte') {
    const motteScaleY = CITADEL_SUMMIT_Y / SUMMIT_Y;
    return (
      <ThreeComponentErrorBoundary componentName={building.id} fallback={null}>
        <group position={[bx, 0, bz]} rotation={[0, building.rotationY_radians, 0]}>
          {/* Scaled Northern Motte & Moat seated at ground Y=0 rising to Y=8 */}
          <group scale={[mapping.scale[0], motteScaleY, mapping.scale[2]]}>
            <group position={[0, 0, -MOTTE_CENTER_Z]}>
              <NorthernMotte />
            </group>
          </group>

          {/* Northern Fortress seated cleanly on the Y=8 summit plateau */}
          <group position={[0, CITADEL_SUMMIT_Y, -4]} scale={[1.2, 1.2, 1.2]}>
            <group position={[0, -SUMMIT_Y, -MOTTE_CENTER_Z]}>
              <NorthernFortress />
            </group>
          </group>

          {/* Smooth walkable Y=0 -> Y=8 ramp connecting road_main_north to the Y=8 summit */}
          <CitadelWalkableRamp motteCenterZ={bz} />
        </group>
      </ThreeComponentErrorBoundary>
    );
  }

  let legacyNode: React.ReactNode = null;
  switch (building.id) {
    case 'bldg_central_plaza':
      legacyNode = <ForumFountain />;
      break;
    case 'bldg_colosseum':
      legacyNode = <GrandColosseum />;
      break;
    case 'bldg_ludus':
      legacyNode = <GladiatorAcademy />;
      break;
    case 'bldg_circus_maximus':
      legacyNode = (
        <Suspense fallback={null}>
          <EastCircusArena />
        </Suspense>
      );
      break;
    case 'bldg_tavern':
      legacyNode = <CityTavern />;
      break;
    case 'bldg_forge':
      legacyNode = <SmithingForge />;
      break;
    case 'bldg_shop_1':
    case 'bldg_shop_2':
    case 'bldg_shop_3':
      legacyNode = <GeneralStore />;
      break;
    case 'bldg_library':
      legacyNode = <RecordsLibrary />;
      break;
    default:
      legacyNode = null;
  }

  return (
    <ThreeComponentErrorBoundary componentName={building.id} fallback={null}>
      <group position={[bx, building.position[1], bz]} rotation={[0, building.rotationY_radians, 0]}>
        <group scale={mapping.scale} rotation={[0, mapping.localYawToPlusZ, 0]}>
          <group position={mapping.cancelLegacyOffset}>{legacyNode}</group>
        </group>
      </group>
    </ThreeComponentErrorBoundary>
  );
});

export const BlueprintBuildingsLayer: React.FC = React.memo(() => {
  return (
    <group name="blueprint-buildings">
      {CITY_LAYOUT_BLUEPRINT.buildings
        .filter((building) => !isStep3BuildingId(building.id))
        .map((building) => (
          <BlueprintBuildingAsset key={building.id} building={building} />
        ))}
    </group>
  );
});

const PropPlaceholderBox: React.FC<{ prop: BlueprintProp }> = React.memo(({ prop }) => {
  const [w, d] = prop.footprint;
  const h = prop.height;

  const palette =
    prop.kind === 'streetlamp'
      ? { body: '#d97706', cap: '#fde68a', wire: '#f59e0b' }
      : prop.kind === 'market_stall'
        ? { body: '#991b1b', cap: '#f59e0b', wire: '#fca5a5' }
        : { body: '#0ea5e9', cap: '#bae6fd', wire: '#38bdf8' };

  return (
    <group position={prop.position}>
      {/* Grounded solid placeholder bounding-box volume */}
      <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
        <boxGeometry args={[w * 0.85, h, d * 0.85]} />
        <meshStandardMaterial color={palette.body} roughness={0.72} metalness={0.15} />
      </mesh>
      {/* Top cap accent */}
      <mesh position={[0, h + 0.08, 0]}>
        <boxGeometry args={[w * 0.92, 0.16, d * 0.92]} />
        <meshStandardMaterial
          color={palette.cap}
          emissive={prop.kind === 'fast_travel_shrine' || prop.kind === 'streetlamp' ? palette.cap : '#000000'}
          emissiveIntensity={prop.kind === 'fast_travel_shrine' ? 0.55 : prop.kind === 'streetlamp' ? 0.35 : 0}
          roughness={0.45}
        />
      </mesh>
      {/* Crisp wireframe blueprint bounding box */}
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshBasicMaterial color={palette.wire} wireframe transparent opacity={0.35} />
      </mesh>
    </group>
  );
});

export const BlueprintPlaceholderProps: React.FC = React.memo(() => {
  const allProps = useMemo(
    () => [
      ...CITY_LAYOUT_BLUEPRINT.props_and_waypoints.streetlamps,
      ...CITY_LAYOUT_BLUEPRINT.props_and_waypoints.market_stalls,
      ...CITY_LAYOUT_BLUEPRINT.props_and_waypoints.fast_travel_shrines,
    ],
    [],
  );

  return (
    <group name="blueprint-placeholder-props">
      {allProps.map((prop) => (
        <PropPlaceholderBox key={prop.id} prop={prop} />
      ))}
    </group>
  );
});
