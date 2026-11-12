import React, { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { applyDeadZone } from '../../utils/joystickDeadZone';

/* ------------------------------------------------------------------ */
/* DOM-free tavern math (mirrors ForgeInterior — unit-testable).        */
/* ------------------------------------------------------------------ */

/** Half-extent of the walkable tavern floor on X; the room is 15 wide. */
export const TAVERN_FLOOR_HALF_X = 6.7;
/** Walkable floor bounds on Z: back wall inner face to the south door. */
export const TAVERN_FLOOR_MIN_Z = -7.4;
export const TAVERN_FLOOR_MAX_Z = 7.3;
/** Raised ceiling: the walls stand 6 high so there is room to look around. */
export const TAVERN_CEILING = 6;
/** Player spawn, just inside the tavern door on the south wall. */
export const TAVERN_SPAWN_X = 0;
export const TAVERN_SPAWN_Z = 6;
/** Door/exit zone on the south wall — walking back through it returns to the city. */
export const TAVERN_EXIT_MIN_Z = 7.3;
export const TAVERN_EXIT_HALF_WIDTH = 1.6;
/** Player body radius used by the furniture push-outs. */
const TAVERN_PLAYER_RADIUS = 0.35;

/** Round furniture blockers (table tops, brazier, cask row, amphorae). */
const TAVERN_CIRCLE_BLOCKERS: { x: number; z: number; r: number }[] = [
  { x: -3.3, z: -2.1, r: 1.15 },
  { x: 1.4, z: -2.4, r: 1.15 },
  { x: -0.8, z: 1.5, r: 1.15 },
  { x: 4.65, z: -0.1, r: 1.05 },
  { x: 3.4, z: -6.3, r: 1.35 },
  { x: -6.2, z: -4.5, r: 0.8 },
  { x: 6.1, z: -3.8, r: 0.8 },
];
/** Service counter (x -2.9..2.9, z -7.1..-6.3), expanded by the player radius. */
const TAVERN_COUNTER = { minX: -3.25, maxX: 3.25, minZ: -7.45, maxZ: -5.95 };

/** Clamp a world position to the walkable tavern floor, pushing out of furniture. */
export function clampToTavernFloor(x: number, z: number): [number, number] {
  let cx = Math.max(-TAVERN_FLOOR_HALF_X, Math.min(TAVERN_FLOOR_HALF_X, x));
  let cz = Math.max(TAVERN_FLOOR_MIN_Z, Math.min(TAVERN_FLOOR_MAX_Z, z));
  for (const b of TAVERN_CIRCLE_BLOCKERS) {
    const dx = cx - b.x;
    const dz = cz - b.z;
    const d = Math.hypot(dx, dz);
    const min = b.r + TAVERN_PLAYER_RADIUS;
    if (d < min) {
      if (d < 1e-6) {
        cz = b.z + min;
      } else {
        cx = b.x + (dx / d) * min;
        cz = b.z + (dz / d) * min;
      }
    }
  }
  if (cx > TAVERN_COUNTER.minX && cx < TAVERN_COUNTER.maxX && cz > TAVERN_COUNTER.minZ && cz < TAVERN_COUNTER.maxZ) {
    // Push out to the nearest reachable edge. The north edge is against the back
    // wall (there is no room to stand behind the counter), so it is never an exit.
    const toWest = cx - TAVERN_COUNTER.minX;
    const toEast = TAVERN_COUNTER.maxX - cx;
    const toSouth = TAVERN_COUNTER.maxZ - cz;
    const m = Math.min(toWest, toEast, toSouth);
    if (m === toWest) cx = TAVERN_COUNTER.minX;
    else if (m === toEast) cx = TAVERN_COUNTER.maxX;
    else cz = TAVERN_COUNTER.maxZ;
  }
  return [cx, cz];
}

/** True when the player walks back through the tavern door (south wall). */
export function isTavernExit(x: number, z: number): boolean {
  return z >= TAVERN_EXIT_MIN_Z && Math.abs(x) <= TAVERN_EXIT_HALF_WIDTH;
}

/* ------------------------------------------------------------------ */
/* Stations — the keeper and the gaming tables (DOM-free, unit-testable). */
/* ------------------------------------------------------------------ */

export type TavernStationId = 'prisca' | 'tables';

export interface TavernStation {
  id: TavernStationId;
  label: string;
  hint: string;
  x: number;
  z: number;
  radius: number;
}

export const TAVERN_STATIONS: TavernStation[] = [
  { id: 'prisca', label: 'Aelia Prisca', hint: 'Keeper of the Bronze Cup', x: 0, z: -5.9, radius: 2.2 },
  { id: 'tables', label: 'Gaming Tables', hint: 'Dice, wine, and wagers', x: -0.8, z: 1.5, radius: 2.2 },
];

/** Nearest station within its interaction radius, or null on open floor. */
export function nearestTavernStation(x: number, z: number): TavernStation | null {
  let best: TavernStation | null = null;
  let bestD = Infinity;
  for (const s of TAVERN_STATIONS) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d <= s.radius && d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}


function TimberBeam({ position, size, rotation = [0, 0, 0] }: {
  position: [number, number, number];
  size: [number, number, number];
  rotation?: [number, number, number];
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color="#49301e" roughness={0.88} />
    </mesh>
  );
}

function Amphora({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.42, 0]} castShadow>
        <latheGeometry args={[[
          new THREE.Vector2(0.12, 0), new THREE.Vector2(0.19, 0.08),
          new THREE.Vector2(0.28, 0.26), new THREE.Vector2(0.3, 0.43),
          new THREE.Vector2(0.22, 0.59), new THREE.Vector2(0.11, 0.68),
          new THREE.Vector2(0.1, 0.76), new THREE.Vector2(0.14, 0.79),
        ], 10]} />
        <meshStandardMaterial color="#a9542e" roughness={0.82} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.22, 0.58, 0]} rotation={[0, 0, side * -0.55]}>
          <torusGeometry args={[0.105, 0.035, 6, 10, Math.PI * 1.25]} />
          <meshStandardMaterial color="#8b4528" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function DrinkingCup({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position} castShadow>
      <cylinderGeometry args={[0.09, 0.065, 0.17, 8]} />
      <meshStandardMaterial color="#b76a43" roughness={0.62} />
    </mesh>
  );
}

function FoodPlate({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.22, 0.045, 20]} />
        <meshStandardMaterial color="#b58a5a" roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.045, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.22, 0.018, 5, 20]} />
        <meshStandardMaterial color="#d2b27b" roughness={0.58} />
      </mesh>
      {/* Rustic bread and a few olives give the gaming tables a lived-in purpose. */}
      <mesh position={[-0.045, 0.11, 0.015]} rotation={[0.12, 0.25, -0.08]} castShadow>
        <sphereGeometry args={[0.105, 10, 8]} />
        <meshStandardMaterial color="#bd8b4b" roughness={0.94} />
      </mesh>
      <mesh position={[0.12, 0.085, -0.09]} castShadow>
        <sphereGeometry args={[0.045, 8, 6]} />
        <meshStandardMaterial color="#4f5b2b" roughness={0.88} />
      </mesh>
      <mesh position={[0.18, 0.085, -0.02]} castShadow>
        <sphereGeometry args={[0.04, 8, 6]} />
        <meshStandardMaterial color="#59652e" roughness={0.88} />
      </mesh>
    </group>
  );
}

function LegionBanner({ position, cloth = '#792f25' }: {
  position: [number, number, number];
  cloth?: string;
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.88, 0]} castShadow>
        <boxGeometry args={[1.28, 0.075, 0.09]} />
        <meshStandardMaterial color="#76502e" roughness={0.78} />
      </mesh>
      <mesh position={[0, 0.02, 0]} castShadow>
        <planeGeometry args={[1.12, 1.62, 1, 5]} />
        <meshStandardMaterial color={cloth} roughness={0.98} side={THREE.DoubleSide} />
      </mesh>
      {/* Narrow gold edging and a simple central military standard motif. */}
      {[-0.54, 0.54].map((x) => (
        <mesh key={x} position={[x, 0.02, 0.012]}>
          <boxGeometry args={[0.035, 1.58, 0.025]} />
          <meshStandardMaterial color="#b18a48" metalness={0.3} roughness={0.62} />
        </mesh>
      ))}
      <mesh position={[0, 0.1, 0.025]}>
        <circleGeometry args={[0.2, 12]} />
        <meshStandardMaterial color="#c49a50" metalness={0.35} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.1, 0.045]}>
        <circleGeometry args={[0.105, 8]} />
        <meshStandardMaterial color="#6a2b20" roughness={0.8} />
      </mesh>
      <mesh position={[0, -0.83, 0]} castShadow>
        <coneGeometry args={[0.13, 0.22, 4]} />
        <meshStandardMaterial color="#b18a48" metalness={0.32} roughness={0.62} />
      </mesh>
    </group>
  );
}

function Bench({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Low round timber stools leave the walkways open around the gaming tables. */}
      <mesh position={[0, 0.53, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.39, 0.39, 0.14, 20]} />
        <meshStandardMaterial color="#54351f" roughness={0.86} />
      </mesh>
      <mesh position={[0, 0.605, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.36, 0.018, 5, 20]} />
        <meshStandardMaterial color="#8b633c" metalness={0.18} roughness={0.72} />
      </mesh>
      {[0, 2.094, 4.188].map((angle) => (
        <mesh key={angle} position={[Math.cos(angle) * 0.24, 0.25, Math.sin(angle) * 0.24]} castShadow>
          <boxGeometry args={[0.09, 0.5, 0.09]} />
          <meshStandardMaterial color="#382519" roughness={0.92} />
        </mesh>
      ))}
    </group>
  );
}
function DicePair() {
  const dice = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!dice.current) return;
    // Occasional tiny settling motion suggests a recent roll without distracting from play.
    const roll = Math.max(0, Math.sin(clock.elapsedTime * 0.34 + 1.2) - 0.88) / 0.12;
    dice.current.rotation.y = Math.sin(clock.elapsedTime * 0.34 + 1.2) * 0.025;
    dice.current.rotation.x = roll * 0.12;
  });
  return (
    <group ref={dice} position={[0.18, 0.99, 0.08]}>
      <mesh rotation={[0.12, 0.35, 0.08]} castShadow>
        <boxGeometry args={[0.16, 0.16, 0.16]} />
        <meshStandardMaterial color="#e8d8b5" roughness={0.78} />
      </mesh>
      <mesh position={[0.28, 0.015, -0.12]} rotation={[0.08, -0.3, 0.12]} castShadow>
        <boxGeometry args={[0.15, 0.15, 0.15]} />
        <meshStandardMaterial color="#cbb58c" roughness={0.82} />
      </mesh>
    </group>
  );
}

function TavernTable({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {/* Round, worn timber gaming top with a restrained bronze edge. */}
      <mesh position={[0, 0.82, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.96, 0.96, 0.16, 32]} />
        <meshStandardMaterial color="#684126" roughness={0.78} />
      </mesh>
      <mesh position={[0, 0.91, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.91, 0.025, 6, 32]} />
        <meshStandardMaterial color="#987044" metalness={0.38} roughness={0.58} />
      </mesh>
      <mesh position={[0, 0.41, 0]} castShadow>
        <cylinderGeometry args={[0.19, 0.25, 0.68, 10]} />
        <meshStandardMaterial color="#49301e" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.09, 0]} castShadow>
        <cylinderGeometry args={[0.43, 0.46, 0.16, 12]} />
        <meshStandardMaterial color="#382519" roughness={0.92} />
      </mesh>
      <DrinkingCup position={[-0.42, 0.99, 0.08]} />
      <DrinkingCup position={[-0.12, 0.99, -0.27]} />
      <DicePair />
      <FoodPlate position={[0.48, 0.99, -0.22]} />
    </group>
  );
}
function Patron({ position, tunic = '#8d3e2c', facing = 0 }: {
  position: [number, number, number];
  tunic?: string;
  facing?: number;
}) {
  return (
    <group position={position} rotation={[0, facing, 0]}>
      {/* Simple full-body silhouette: feet stay on the floor instead of leaving a floating torso. */}
      {[-0.13, 0.13].map((x) => (
        <mesh key={x} position={[x, 0.28, 0.04]} castShadow>
          <capsuleGeometry args={[0.105, 0.34, 3, 6]} />
          <meshStandardMaterial color={tunic} roughness={0.94} />
        </mesh>
      ))}
      <mesh position={[0, 1.12, 0]} castShadow>
        <capsuleGeometry args={[0.27, 0.72, 4, 8]} />
        <meshStandardMaterial color={tunic} roughness={0.92} />
      </mesh>
      <mesh position={[0, 1.84, 0]} castShadow>
        <sphereGeometry args={[0.22, 12, 10]} />
        <meshStandardMaterial color="#b9825b" roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.9, -0.02]}>
        <sphereGeometry args={[0.225, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
        <meshStandardMaterial color="#34251d" roughness={1} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * 0.29, 1.2, -0.08]}
          rotation={[0, 0, side * -0.7]}
          castShadow
        >
          <capsuleGeometry args={[0.09, 0.48, 3, 6]} />
          <meshStandardMaterial color={tunic} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

function SeatedPatron({ position, tunic = '#8d3e2c', facing = 0, phase = 0 }: {
  position: [number, number, number];
  tunic?: string;
  facing?: number;
  phase?: number;
}) {
  const body = useRef<THREE.Group>(null);
  const sippingArm = useRef<THREE.Group>(null);
  const diceArm = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!body.current) return;
    const t = clock.elapsedTime * 1.15 + phase;
    body.current.position.y = position[1] + Math.sin(t) * 0.018;
    body.current.rotation.y = facing + Math.sin(t * 0.42) * 0.025;
    // A slow, staggered toast: lift the cup briefly, then return the forearm to the table.
    if (sippingArm.current) {
      const sip = (Math.sin(clock.elapsedTime * 0.48 + phase * 1.7) + 1) * 0.5;
      const lift = Math.max(0, (sip - 0.76) / 0.24);
      sippingArm.current.rotation.x = -lift * 1.05;
      sippingArm.current.rotation.z = -0.12 - lift * 0.18;
    }
    if (diceArm.current && phase < 1) {
      const roll = (Math.sin(clock.elapsedTime * 0.72 + phase) + 1) * 0.5;
      const reach = Math.max(0, (roll - 0.72) / 0.28);
      diceArm.current.rotation.x = -0.82 - reach * 0.38;
      diceArm.current.rotation.z = 0.16 + reach * 0.2;
    }
  });
  return (
    <group ref={body} position={position} rotation={[0, facing, 0]}>
      {/* Seated hips and torso: lowered head height keeps the figure behind the tabletop. */}
      <mesh position={[0, 0.78, -0.02]} castShadow>
        <capsuleGeometry args={[0.25, 0.48, 4, 8]} />
        <meshStandardMaterial color={tunic} roughness={0.94} />
      </mesh>
      <mesh position={[0, 1.43, -0.04]} castShadow>
        <sphereGeometry args={[0.205, 12, 10]} />
        <meshStandardMaterial color="#b9825b" roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.49, -0.06]}>
        <sphereGeometry args={[0.21, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
        <meshStandardMaterial color="#34251d" roughness={1} />
      </mesh>
      {/* Bent legs project forward toward the table, with knees below its edge. */}
      {[-0.13, 0.13].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.39, 0.22]} rotation={[-Math.PI / 2.8, 0, 0]} castShadow>
            <capsuleGeometry args={[0.09, 0.43, 3, 6]} />
            <meshStandardMaterial color={tunic} roughness={0.95} />
          </mesh>
          <mesh position={[x, 0.16, 0.55]} castShadow>
            <capsuleGeometry args={[0.075, 0.24, 3, 6]} />
            <meshStandardMaterial color="#4b3022" roughness={0.95} />
          </mesh>
        </group>
      ))}
      {/* Forearms angle toward the gaming surface instead of hanging straight down. */}
      <group ref={diceArm} position={[-0.27, 0.93, 0.29]} rotation={[-0.82, 0, 0.16]}>
        <mesh castShadow>
          <capsuleGeometry args={[0.075, 0.36, 3, 6]} />
          <meshStandardMaterial color={tunic} roughness={0.95} />
        </mesh>
      </group>
      <group ref={sippingArm} position={[0.27, 0.93, 0.29]} rotation={[-0.82, 0, -0.16]}>
        <mesh castShadow>
          <capsuleGeometry args={[0.075, 0.36, 3, 6]} />
          <meshStandardMaterial color={tunic} roughness={0.95} />
        </mesh>
        {/* Cup follows the raised hand during the sip gesture. */}
        <group position={[0, -0.27, 0.2]}>
          <DrinkingCup position={[0, 0, 0]} />
        </group>
      </group>
    </group>
  );
}

function TavernKeeper() {
  const keeper = useRef<THREE.Group>(null);
  const servingArm = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (keeper.current) {
      keeper.current.position.y = Math.sin(t * 1.05) * 0.012;
    }
    if (servingArm.current) {
      // A restrained, slow polishing gesture keeps the keeper alive without drawing focus.
      const motion = (Math.sin(t * 0.62 + 0.8) + 1) * 0.5;
      servingArm.current.rotation.x = -0.16 - motion * 0.12;
      servingArm.current.rotation.z = -0.2 - motion * 0.08;
    }
  });
  return (
    <group ref={keeper} position={[0, 0, -7.28]}>
      {/* Keeper stands behind the counter; the counter naturally hides the lower body. */}
      <mesh position={[0, 1.12, 0]} castShadow>
        <capsuleGeometry args={[0.29, 0.82, 4, 8]} />
        <meshStandardMaterial color="#6b3827" roughness={0.94} />
      </mesh>
      <mesh position={[0, 0.98, 0.19]} castShadow>
        <boxGeometry args={[0.42, 0.72, 0.045]} />
        <meshStandardMaterial color="#49301f" roughness={0.98} />
      </mesh>
      <mesh position={[0, 1.88, 0.015]} castShadow>
        <sphereGeometry args={[0.225, 12, 10]} />
        <meshStandardMaterial color="#b9825b" roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.96, -0.045]} castShadow>
        <sphereGeometry args={[0.23, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
        <meshStandardMaterial color="#39271e" roughness={1} />
      </mesh>
      <mesh position={[0, 1.72, 0.12]} castShadow>
        <capsuleGeometry args={[0.11, 0.13, 3, 6]} />
        <meshStandardMaterial color="#60402e" roughness={0.96} />
      </mesh>
      <group position={[-0.31, 1.28, 0.08]} rotation={[-0.3, 0, 0.28]}>
        <mesh castShadow>
          <capsuleGeometry args={[0.09, 0.48, 3, 6]} />
          <meshStandardMaterial color="#6b3827" roughness={0.95} />
        </mesh>
      </group>
      <group ref={servingArm} position={[0.31, 1.28, 0.08]} rotation={[-0.16, 0, -0.2]}>
        <mesh castShadow>
          <capsuleGeometry args={[0.09, 0.48, 3, 6]} />
          <meshStandardMaterial color="#6b3827" roughness={0.95} />
        </mesh>
        <mesh position={[0, -0.28, 0.04]} castShadow>
          <sphereGeometry args={[0.09, 8, 6]} />
          <meshStandardMaterial color="#b9825b" roughness={0.95} />
        </mesh>
      </group>
      {/* A narrow bronze neck ring gives the keeper a distinct silhouette in warm light. */}
      <mesh position={[0, 1.62, 0.015]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.16, 0.025, 5, 12]} />
        <meshStandardMaterial color="#a9854d" metalness={0.42} roughness={0.6} />
      </mesh>
    </group>
  );
}

function WallShield({ position, rotationY = 0 }: {
  position: [number, number, number];
  rotationY?: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.43, 0.43, 0.13, 16]} />
        <meshStandardMaterial color="#762d23" metalness={0.16} roughness={0.74} />
      </mesh>
      <mesh position={[0, 0, 0.085]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.29, 0.29, 0.14, 12]} />
        <meshStandardMaterial color="#b58a42" metalness={0.42} roughness={0.52} />
      </mesh>
      <mesh position={[0, 0, 0.17]} castShadow>
        <sphereGeometry args={[0.09, 10, 8]} />
        <meshStandardMaterial color="#d0ad68" metalness={0.5} roughness={0.45} />
      </mesh>
    </group>
  );
}

function WallTorch({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, -0.15, 0]} rotation={[0.18, 0, 0]} castShadow>
        <cylinderGeometry args={[0.065, 0.09, 0.38, 7]} />
        <meshStandardMaterial color="#5b3822" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <coneGeometry args={[0.13, 0.32, 7]} />
        <meshStandardMaterial color="#ff9d38" emissive="#ff5a12" emissiveIntensity={2.2} roughness={0.5} />
      </mesh>
      <pointLight color="#ff9b42" intensity={2.1} distance={6} decay={2} />
    </group>
  );
}

function CentralBrazier({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.72, 0.82, 0.32, 12]} />
        <meshStandardMaterial color="#55483b" roughness={0.96} />
      </mesh>
      <mesh position={[0, 0.34, 0]} castShadow>
        <cylinderGeometry args={[0.68, 0.68, 0.09, 16]} />
        <meshStandardMaterial color="#29221d" metalness={0.62} roughness={0.58} />
      </mesh>
      <mesh position={[0, 0.53, 0]} rotation={[0, 0, 0.08]}>
        <coneGeometry args={[0.31, 0.62, 7]} />
        <meshStandardMaterial color="#ff9b38" emissive="#d94b12" emissiveIntensity={1.35} roughness={0.55} />
      </mesh>
      <mesh position={[0.12, 0.55, -0.08]} rotation={[0.1, 0.4, -0.18]}>
        <coneGeometry args={[0.19, 0.48, 7]} />
        <meshStandardMaterial color="#ffd078" emissive="#ff741c" emissiveIntensity={1.8} roughness={0.48} />
      </mesh>
      <pointLight position={[0, 0.85, 0]} color="#ff9a45" intensity={1.15} distance={5.5} decay={2} />
    </group>
  );
}

function TavernRoom() {
  return (
    <>
      <color attach="background" args={['#1b100b']} />
      <fog attach="fog" args={['#1b100b', 11, 24]} />
      <ambientLight intensity={0.75} color="#ffdfb2" />
      <hemisphereLight args={['#ffd5a0', '#382015', 1.15]} />
      <directionalLight position={[-3, 7, 4]} intensity={1.25} color="#ffcf91" />
      <pointLight position={[0, 4.6, -2.5]} intensity={1.8} distance={10} color="#ffb35c" />
      <pointLight position={[0, 4, 3.5]} intensity={1.2} distance={8} color="#ffd18a" />

      {/* Packed-earth floor and stone lower courses */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]} receiveShadow>
        <planeGeometry args={[15, 18]} />
        <meshStandardMaterial color="#57402d" roughness={1} />
      </mesh>
      <mesh position={[0, 3, -8]} receiveShadow>
        <boxGeometry args={[15, 6, 0.35]} />
        <meshStandardMaterial color="#76543b" roughness={0.98} />
      </mesh>
      <mesh position={[-7.3, 3, 0]} receiveShadow>
        <boxGeometry args={[0.35, 6, 16]} />
        <meshStandardMaterial color="#624631" roughness={0.98} />
      </mesh>
      <mesh position={[7.3, 3, 0]} receiveShadow>
        <boxGeometry args={[0.35, 6, 16]} />
        <meshStandardMaterial color="#624631" roughness={0.98} />
      </mesh>
      {/* Dark rafters overhead, but warm, readable illumination below */}
      {[-5.8, -3.1, -0.4, 2.3, 5.0].map((z) => (
        <TimberBeam key={z} position={[0, 5.85, z]} size={[15, 0.2, 0.24]} />
      ))}
      {[-6, -3, 0, 3, 6].map((x) => (
        <TimberBeam key={x} position={[x, 5.65, 0]} size={[0.22, 0.38, 16]} />
      ))}
      {/* The keeper is stationed behind the existing service counter. */}
      <TavernKeeper />
      {/* Back bar and shelves of amphorae */}
      <mesh position={[0, 0.75, -6.7]} castShadow receiveShadow>
        <boxGeometry args={[5.8, 1.45, 0.8]} />
        <meshStandardMaterial color="#50311d" roughness={0.78} />
      </mesh>
      <mesh position={[0, 1.8, -7.05]} castShadow>
        <boxGeometry args={[5.7, 0.12, 0.5]} />
        <meshStandardMaterial color="#8a5a32" roughness={0.78} />
      </mesh>
      {[-2.2, -1.1, 0, 1.1, 2.2].map((x, i) => (
        <Amphora key={x} position={[x, 1.88, -7.05]} scale={0.65 + (i % 2) * 0.08} />
      ))}
      {/* A row of stacked casks beside the counter */}
      {[-1, 0, 1].map((x) => (
        <group key={x} position={[x + 3.4, 0, -6.3]}>
          <mesh position={[0, 0.48, 0]} castShadow>
            <cylinderGeometry args={[0.38, 0.43, 0.95, 10]} />
            <meshStandardMaterial color="#5c3b24" roughness={0.9} />
          </mesh>
          {[-0.31, 0, 0.31].map((z) => (
            <mesh key={z} position={[0, 0.48, z]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.39, 0.035, 5, 12]} />
              <meshStandardMaterial color="#9b7446" metalness={0.25} roughness={0.7} />
            </mesh>
          ))}
        </group>
      ))}
      {/* A small communal hearth anchors the open side of the room without blocking the entrance. */}
      <CentralBrazier position={[4.65, 0, -0.1]} />
      {/* Central communal tables, benches, food, and busy patrons */}
      <TavernTable position={[-3.3, 0, -2.1]} rotationY={0.12} />
      <Bench position={[-3.3, 0, -3.42]} />
      <Bench position={[-3.3, 0, -0.78]} rotationY={Math.PI} />
      <TavernTable position={[1.4, 0, -2.4]} rotationY={-0.15} />
      <Bench position={[1.4, 0, -3.72]} />
      <Bench position={[1.4, 0, -1.08]} rotationY={Math.PI} />
      <TavernTable position={[-0.8, 0, 1.5]} rotationY={0.15} />
      <Bench position={[-0.8, 0, 0.25]} />
      <Bench position={[-0.8, 0, 2.75]} rotationY={Math.PI} />
      <SeatedPatron position={[-3.3, 0, -3.42]} tunic="#a44731" facing={0} phase={0.2} />
      <SeatedPatron position={[-3.3, 0, -0.78]} tunic="#b48b42" facing={Math.PI} phase={1.7} />
      <SeatedPatron position={[1.4, 0, -3.72]} tunic="#315d4a" facing={0} phase={3.1} />
      <SeatedPatron position={[1.4, 0, -1.08]} tunic="#8b392d" facing={Math.PI} phase={4.4} />
      <SeatedPatron position={[-0.8, 0, 0.25]} tunic="#7c573d" facing={0} phase={5.6} />
      {/* Earthenware and mounted shields: moved to the side walls so the legion standards remain the back-wall focal point. */}
      <Amphora position={[-6.2, 0, -4.5]} scale={0.9} />
      <Amphora position={[6.1, 0, -3.8]} scale={0.78} />
      <WallShield position={[-7.08, 3.6, -4.65]} rotationY={Math.PI / 2} />
      <WallShield position={[-7.08, 3.6, 1.15]} rotationY={Math.PI / 2} />
      <WallShield position={[7.08, 3.6, -4.65]} rotationY={-Math.PI / 2} />
      <WallShield position={[7.08, 3.6, 1.15]} rotationY={-Math.PI / 2} />
      <WallTorch position={[-6.9, 3.4, -2.4]} />
      <WallTorch position={[6.9, 3.4, -2.4]} />
      <WallTorch position={[-6.9, 3.4, 4.0]} />
      <WallTorch position={[6.9, 3.4, 4.0]} />
      {/* Cloth legion standards break up the bare back wall without adding heavy assets. */}
      <LegionBanner position={[-5.2, 3.4, -7.76]} cloth="#263b58" />
      <LegionBanner position={[0, 3.4, -7.76]} cloth="#762e24" />
      <LegionBanner position={[5.2, 3.4, -7.76]} cloth="#263b58" />
      {/* Entrance lintel and hanging sign seen from inside */}
      <TimberBeam position={[0, 4.4, 7.7]} size={[4.2, 0.24, 0.28]} />
      <mesh position={[0, 3.9, 7.62]} rotation={[0, 0, 0.02]} castShadow>
        <boxGeometry args={[1.4, 0.75, 0.1]} />
        <meshStandardMaterial color="#6c321f" roughness={0.9} />
      </mesh>
      <mesh position={[0, 3.9, 7.53]}>
        <boxGeometry args={[1.12, 0.08, 0.025]} />
        <meshStandardMaterial color="#d4a66a" emissive="#6a3918" emissiveIntensity={0.25} />
      </mesh>
      {/* Warm floor-level bounce keeps faces, tables, and equipment readable on phones. */}
      <pointLight position={[-3.2, 1.1, -1.8]} intensity={0.65} distance={5} color="#ffbd72" />
      <pointLight position={[3.0, 1.15, 1.2]} intensity={0.55} distance={5} color="#ffc982" />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Player rig — camera-relative movement, tavern-floor clamp, door exit. */
/* ------------------------------------------------------------------ */

interface TavernPlayerRigProps {
  onExitRef: React.MutableRefObject<() => void>;
  keysRef: React.MutableRefObject<Record<string, boolean>>;
  stickRef: React.MutableRefObject<{ x: number; y: number }>;
  onPosition: (x: number, z: number) => void;
}

function TavernPlayerRig({ onExitRef, keysRef, stickRef, onPosition }: TavernPlayerRigProps) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const pos = useRef<[number, number]>([TAVERN_SPAWN_X, TAVERN_SPAWN_Z]);
  const yaw = useRef(Math.PI);
  const camYaw = useRef(0);
  const exited = useRef(false);
  const bob = useRef(0);

  useFrame(({ camera }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const keys = keysRef.current;
    const stick = stickRef.current;
    // Keyboard input.
    let kx = 0;
    let kz = 0;
    if (keys['KeyW'] || keys['ArrowUp']) kz -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) kz += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) kx -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) kx += 1;
    // Joystick input (dead-zoned).
    const joystick = applyDeadZone(stick.x, stick.y);
    // Combine; clamp to the unit circle.
    let mx = kx + joystick.x;
    let mz = kz + joystick.z;
    const mLen = Math.hypot(mx, mz);
    if (mLen > 1) {
      mx /= mLen;
      mz /= mLen;
    }
    const speed = 5.2;
    // Camera-relative movement (city pattern): stick/key up is away from the camera.
    const cy = camYaw.current;
    const fx = Math.sin(cy);
    const fz = Math.cos(cy);
    const rx = -Math.cos(cy);
    const rz = Math.sin(cy);
    const wx = mx * rx - mz * fx;
    const wz = mx * rz - mz * fz;
    let px = pos.current[0] + wx * speed * delta;
    let pz = pos.current[1] + wz * speed * delta;
    [px, pz] = clampToTavernFloor(px, pz);
    pos.current = [px, pz];
    onPosition(px, pz);
    // Walk back through the tavern door to leave.
    if (!exited.current && isTavernExit(px, pz)) {
      exited.current = true;
      // Defer unmount to next tick to avoid synchronously unmounting R3F root during update
      setTimeout(() => onExitRef.current(), 0);
      return;
    }
    // Face the movement direction with a smooth turn.
    if (mLen > 0.05) {
      const target = Math.atan2(wx, wz);
      let d = target - yaw.current;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      yaw.current += d * Math.min(1, delta * 10);
      bob.current += delta * 9 * Math.min(1, mLen);
    }
    if (group.current) {
      group.current.position.set(px, 0, pz);
      group.current.rotation.y = yaw.current;
    }
    if (body.current) {
      body.current.position.y = Math.abs(Math.sin(bob.current)) * 0.08;
    }
    // Chase camera, kept inside the room so the raised walls never block the view.
    const camX = Math.max(-6.8, Math.min(6.8, px - Math.sin(cy) * 6.5));
    const camZ = Math.max(-7.4, Math.min(7.4, pz - Math.cos(cy) * 6.5));
    const desired = new THREE.Vector3(camX, 4.2, camZ);
    camera.position.lerp(desired, 1 - Math.exp(-5 * delta));
    camera.lookAt(px, 1.1, pz);
  });

  return (
    <group ref={group} position={[TAVERN_SPAWN_X, 0, TAVERN_SPAWN_Z]}>
      <group ref={body}>
        <mesh position={[0, 0.75, 0]} castShadow>
          <capsuleGeometry args={[0.32, 0.7, 6, 12]} />
          <meshStandardMaterial color="#4a3f55" roughness={0.9} />
        </mesh>
        <mesh position={[0, 1.45, 0]} castShadow>
          <sphereGeometry args={[0.2, 14, 14]} />
          <meshStandardMaterial color="#c9a07a" roughness={0.8} />
        </mesh>
        <mesh position={[0, 1.54, -0.05]}>
          <coneGeometry args={[0.26, 0.35, 10]} />
          <meshStandardMaterial color="#3a3344" roughness={0.95} />
        </mesh>
      </group>
    </group>
  );
}
/* ------------------------------------------------------------------ */
/* Overlay — full-screen while the city stays mounted underneath.      */
/* ------------------------------------------------------------------ */

export function TavernInterior({ onExit, onOpenServices }: { onExit: () => void; onOpenServices: () => void }) {
  const onExitRef = useRef(onExit);
  const onOpenServicesRef = useRef(onOpenServices);
  useEffect(() => {
    onExitRef.current = onExit;
    onOpenServicesRef.current = onOpenServices;
  });

  const keysPressed = useRef<Record<string, boolean>>({});
  const stickRef = useRef({ x: 0, y: 0 });
  const playerPosRef = useRef({ x: TAVERN_SPAWN_X, z: TAVERN_SPAWN_Z });
  const nearStationRef = useRef<TavernStation | null>(null);
  const [nearStation, setNearStation] = useState<TavernStation | null>(null);

  // Proximity polling (cheap: 5 Hz) — drives the station prompt.
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = nearestTavernStation(playerPosRef.current.x, playerPosRef.current.z);
      if (s?.id !== nearStationRef.current?.id) {
        nearStationRef.current = s;
        setNearStation(s);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  const interactWithStation = () => {
    const s = nearStationRef.current;
    if (!s) return;
    onOpenServicesRef.current();
  };
  const interactRef = useRef(interactWithStation);
  useEffect(() => {
    interactRef.current = interactWithStation;
  });

  // Keyboard: WASD/arrows to walk, E to use the nearby station.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keysPressed.current[e.code] = true;
      if (e.code === 'KeyE') interactRef.current();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      keysPressed.current[e.code] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // On-screen joystick (touch).
  const joystickRef = useRef<HTMLDivElement>(null);
  const touchIdRef = useRef<number | null>(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });

  const setStickFromTouch = (clientX: number, clientY: number) => {
    const el = joystickRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const R = rect.width / 2;
    let dx = (clientX - cx) / R;
    let dy = (clientY - cy) / R;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    stickRef.current = { x: dx, y: dy };
    setKnobPos({ x: dx * (R - 20), y: dy * (R - 20) });
  };

  const handleJoystickTouchStart = (e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    touchIdRef.current = t.identifier;
    setStickFromTouch(t.clientX, t.clientY);
  };
  const handleJoystickTouchMove = (e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === touchIdRef.current) setStickFromTouch(t.clientX, t.clientY);
    }
  };
  const handleJoystickTouchEnd = (e: React.TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === touchIdRef.current) {
        touchIdRef.current = null;
        stickRef.current = { x: 0, y: 0 };
        setKnobPos({ x: 0, y: 0 });
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[95] bg-[#1b100b] text-amber-100 overflow-hidden select-none" role="dialog" aria-label="Roman tavern interior">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [TAVERN_SPAWN_X, 4.2, TAVERN_SPAWN_Z - 6.5], fov: 55, near: 0.1, far: 45 }}
        gl={{ antialias: false, powerPreference: 'low-power' }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.22;
        }}
      >
        <TavernRoom />
        <TavernPlayerRig
          onExitRef={onExitRef}
          keysRef={keysPressed}
          stickRef={stickRef}
          onPosition={(x, z) => {
            playerPosRef.current = { x, z };
          }}
        />
      </Canvas>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
        <div className="rounded-xl border border-amber-200/25 bg-stone-950/75 px-5 py-2 text-center shadow-xl backdrop-blur-sm">
          <div className="text-xs uppercase tracking-[0.28em] text-amber-300">Taberna · District of the Arena</div>
          <div className="mt-1 text-lg font-bold tracking-wide sm:text-2xl">The Bronze Cup</div>
          <div className="text-xs text-amber-100/75">Wine, wagers, and stories from the sands</div>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenServices}
        className="absolute left-3 top-3 z-10 min-h-12 rounded-xl border border-amber-200/40 bg-stone-950/90 px-4 text-sm font-bold text-amber-100 shadow-xl hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-300"
        aria-label="Talk to the tavern keeper"
      >
        Rumours &amp; Games
      </button>
      <button
        type="button"
        onClick={() => setTimeout(onExit, 0)}
        className="absolute right-3 top-3 z-10 min-h-12 rounded-xl border border-amber-200/40 bg-stone-950/90 px-4 text-sm font-bold text-amber-100 shadow-xl hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-300"
        aria-label="Leave tavern and return to the city"
      >
        ← Return to City
      </button>
      {/* Nearby-station prompt */}
      {nearStation && (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 flex justify-center p-3">
          <div className="pointer-events-auto rounded-xl border border-amber-200/40 bg-stone-950/90 px-4 py-2.5 flex items-center gap-3 max-w-[92vw] shadow-xl">
            <div className="min-w-0">
              <div className="font-bold text-amber-100 text-sm leading-tight">{nearStation.label}</div>
              <div className="text-[11px] text-amber-100/70 truncate">{nearStation.hint}</div>
            </div>
            <button
              type="button"
              onClick={() => onOpenServicesRef.current()}
              className="min-h-12 px-4 rounded-xl bg-amber-500/90 hover:bg-amber-400 text-stone-950 font-bold text-sm shrink-0"
            >
              {nearStation.id === 'prisca' ? 'Talk' : 'Play'}
            </button>
          </div>
        </div>
      )}
      {/* On-screen joystick */}
      <div className="absolute bottom-5 left-5 z-10 touch-none">
        <div
          ref={joystickRef}
          onTouchStart={handleJoystickTouchStart}
          onTouchMove={handleJoystickTouchMove}
          onTouchEnd={handleJoystickTouchEnd}
          onTouchCancel={handleJoystickTouchEnd}
          aria-label="Move"
          className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-stone-950/60 border-2 border-amber-200/40 relative flex items-center justify-center"
        >
          <div className="absolute top-2 w-1.5 h-1.5 rounded-full bg-amber-300/50" />
          <div className="absolute bottom-2 w-1.5 h-1.5 rounded-full bg-amber-300/50" />
          <div className="absolute left-2 w-1.5 h-1.5 rounded-full bg-amber-300/50" />
          <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-amber-300/50" />
          <div
            className="w-10 h-10 rounded-full bg-gradient-to-b from-amber-400 to-amber-600 border-2 border-amber-200"
            style={{ transform: `translate(${knobPos.x}px, ${knobPos.y}px)` }}
          />
        </div>
        <div className="mt-1 text-center text-[10px] uppercase tracking-wider text-amber-300/80">
          Move
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden justify-center p-3 sm:flex">
        <div className="rounded-lg bg-stone-950/65 px-4 py-2 text-center text-xs text-amber-100/80 backdrop-blur-sm">
          WASD / arrows to walk · E to interact · walk back through the door to leave
        </div>
      </div>
    </div>
  );
}
