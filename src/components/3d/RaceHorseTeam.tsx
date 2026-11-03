import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { ChariotTeamSize } from '../../types/game';
import { getHorseStations } from '../../utils/chariotTeamFormation';

/**
 * Low-draw-call procedural horse team for the mobile race scene.
 *
 * The production horse GLBs are ~15 MB each and their supplied walk/gallop clips
 * barely move the legs. This compact visual uses the already measured fit and
 * formation stations instead of adding those large, inert assets to the app.
 * The local horse axis is +X; +90° yaw points it down the chariot's -Z track.
 */
export const RACE_HORSE_FIT_SCALE = 0.5530;
export const RACE_HORSE_WITHERS_X = 0.42598;
export const RACE_HORSE_YAW = Math.PI / 2;

const coats = [
  new THREE.MeshStandardMaterial({ color: '#68432e', roughness: 0.88 }),
  new THREE.MeshStandardMaterial({ color: '#80553a', roughness: 0.9 }),
  new THREE.MeshStandardMaterial({ color: '#4a3025', roughness: 0.9 }),
  new THREE.MeshStandardMaterial({ color: '#77503a', roughness: 0.9 }),
];
const coat = coats[0];
const darkCoat = new THREE.MeshStandardMaterial({ color: '#35251f', roughness: 0.92 });
const maneCoat = new THREE.MeshStandardMaterial({ color: '#241b18', roughness: 0.96 });
const hoofCoat = new THREE.MeshStandardMaterial({ color: '#282523', roughness: 0.86 });

type LegProps = { x: number; z: number; phase: number; speed: number; hind?: boolean };

const HorseLeg: React.FC<LegProps> = ({ x, z, phase, speed, hind = false }) => {
  const upper = useRef<THREE.Group>(null);
  const lower = useRef<THREE.Group>(null);
  useFrame((state) => {
    const amount = Math.min(1, Math.abs(speed) / 4);
    if (upper.current) upper.current.rotation.z = Math.sin(state.clock.elapsedTime * 8 + phase) * 0.34 * amount;
    if (lower.current) lower.current.rotation.z = Math.max(0, Math.sin(state.clock.elapsedTime * 8 + phase + 1.2)) * 0.32 * amount;
  });
  return (
    <group position={[x, hind ? 0.83 : 0.86, z]} ref={upper}>
      <mesh position={[0, -0.20, 0]} material={coat} castShadow={false}>
        <cylinderGeometry args={[hind ? 0.095 : 0.075, 0.052, 0.42, 6]} />
      </mesh>
      <group ref={lower} position={[0, -0.39, 0]}>
        <mesh position={[0, -0.19, 0]} material={coat} castShadow={false}>
          <cylinderGeometry args={[0.052, 0.034, 0.38, 6]} />
        </mesh>
        <mesh position={[0.035, -0.39, 0]} material={hoofCoat} castShadow={false}>
          <boxGeometry args={[0.16, 0.085, 0.105]} />
        </mesh>
      </group>
    </group>
  );
};

const RaceHorse: React.FC<{ speed: number; coatOffset: number }> = ({ speed, coatOffset }) => {
  const bodyMaterial = coats[coatOffset % coats.length];
  return (
    <group scale={RACE_HORSE_FIT_SCALE} rotation={[0, RACE_HORSE_YAW, 0} dispose={null}>
      {/* Barrel, chest, raised neck and head keep the silhouette readable from the chase camera. */}
      <mesh position={[-0.22, 1.30, 0]} scale={[0.68, 0.39, 0.28]} material={bodyMaterial} castShadow={false}>
        <sphereGeometry args={[1, 10, 7]} />
      </mesh>
      <mesh position={[0.28, 1.31, 0]} scale={[0.31, 0.36, 0.25]} material={bodyMaterial} castShadow={false}>
        <sphereGeometry args={[1, 8, 6]} />
      </mesh>
      <mesh position={[0.48, 1.54, 0]} rotation={[0, 0, -0.28]} material={bodyMaterial} castShadow={false}>
        <capsuleGeometry args={[0.17, 0.48, 3, 7]} />
      </mesh>
      <mesh position={[0.70, 1.78, 0]} rotation={[0, 0, -0.18]} scale={[0.20, 0.29, 0.15]} material={bodyMaterial} castShadow={false}>
        <sphereGeometry args={[1, 8, 6]} />
      </mesh>
      <mesh position={[0.88, 1.66, 0]} scale={[0.16, 0.095, 0.12]} material={darkCoat} castShadow={false}>
        <sphereGeometry args={[1, 7, 5]} />
      </mesh>
      <mesh position={[0.47, 1.78, 0]} rotation={[0, 0, -0.25]} material={maneCoat} castShadow={false}>
        <capsuleGeometry args={[0.07, 0.35, 2, 5]} />
      </mesh>
      <mesh position={[-0.87, 1.33, 0]} rotation={[0, 0, -0.36]} material={maneCoat} castShadow={false}>
        <capsuleGeometry args={[0.055, 0.38, 2, 5]} />
      </mesh>
      {[ -1, 1 ].map((side) => (
        <mesh key={side} position={[0.72, 2.02, side * 0.085]} rotation={[side * -0.1, 0, -0.16]} material={darkCoat} castShadow={false}>
          <coneGeometry args={[0.065, 0.20, 5]} />
        </mesh>
      ))}
      <HorseLeg x={-0.56} z={-0.16} phase={0} speed={speed} hind />
      <HorseLeg x={-0.56} z={0.16} phase={Math.PI} speed={speed} hind />
      <HorseLeg x={0.28} z={-0.15} phase={Math.PI} speed={speed} />
      <HorseLeg x={0.28} z={0.15} phase={0} speed={speed} />
    </group>
  );
};

export const RaceHorseTeam: React.FC<{ teamSize: ChariotTeamSize; speed: number }> = ({ teamSize, speed }) => {
  const stations = useMemo(() => getHorseStations(teamSize), [teamSize]);
  return (
    <group>
      {stations.map((station, index) => (
        <group
          key={station.lane}
          position={[station.x, station.groundY, station.z + RACE_HORSE_WITHERS_X * RACE_HORSE_FIT_SCALE]}
        >
          <RaceHorse speed={speed} coatOffset={index} />
        </group>
      ))}
    </group>
  );
};
