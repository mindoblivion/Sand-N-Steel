import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { applyDeadZone } from '../../utils/joystickDeadZone';

/* ------------------------------------------------------------------ */
/* DOM-free forge math (mirrors ColosseumInterior — unit-testable).     */
/* ------------------------------------------------------------------ */

/** Half-extents of the walkable forge floor (rectangular clamp; v1 has no furniture collision). */
export const FORGE_FLOOR_HALF_X = 8;
export const FORGE_FLOOR_HALF_Z = 6;
/** Player spawn, just inside the forge door on the south wall. */
export const FORGE_SPAWN_X = 0;
export const FORGE_SPAWN_Z = 4.2;
/** Door/exit zone on the south wall — walking back through it returns to the city. */
export const FORGE_EXIT_MIN_Z = 4.9;
export const FORGE_EXIT_HALF_WIDTH = 1.6;

/** Clamp a world position to the walkable forge floor. */
export function clampToForgeFloor(x: number, z: number): [number, number] {
  return [
    Math.max(-FORGE_FLOOR_HALF_X, Math.min(FORGE_FLOOR_HALF_X, x)),
    Math.max(-FORGE_FLOOR_HALF_Z, Math.min(FORGE_FLOOR_HALF_Z, z)),
  ];
}

/** True when the player walks back through the forge door (south wall). */
export function isForgeExit(x: number, z: number): boolean {
  return z >= FORGE_EXIT_MIN_Z && Math.abs(x) <= FORGE_EXIT_HALF_WIDTH;
}

/* ------------------------------------------------------------------ */
/* Stations + Sextus Ferratus dialogue (DOM-free, unit-testable).      */
/* ------------------------------------------------------------------ */

export type ForgeStationId = 'furnace' | 'anvil' | 'workbench' | 'quench' | 'sextus' | 'racks';

export interface ForgeStation {
  id: ForgeStationId;
  label: string;
  hint: string;
  x: number;
  z: number;
  radius: number;
}

export const FORGE_STATIONS: ForgeStation[] = [
  { id: 'furnace', label: 'The Great Furnace', hint: 'The heart of the forge', x: 0, z: -4.2, radius: 2.8 },
  { id: 'anvil', label: 'Anvil', hint: 'Temper a weapon', x: -3.4, z: -2.9, radius: 2.1 },
  { id: 'workbench', label: "Smith's Workbench", hint: 'Browse the forge shop', x: 4.4, z: -1.6, radius: 2.3 },
  { id: 'quench', label: 'Quench Barrel', hint: 'Steam and hot steel', x: 3.4, z: 2.8, radius: 2.1 },
  { id: 'sextus', label: 'Sextus Ferratus', hint: 'Keeper of the forge', x: 4.4, z: 0.6, radius: 2.3 },
  { id: 'racks', label: 'Weapon Racks', hint: 'Fresh blades, still warm', x: -6.6, z: 0.6, radius: 2.2 },
];

/** Nearest station within its interaction radius, or null on open floor. */
export function nearestForgeStation(x: number, z: number): ForgeStation | null {
  let best: ForgeStation | null = null;
  let bestD = Infinity;
  for (const s of FORGE_STATIONS) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d <= s.radius && d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/** Sextus Ferratus — first-visit greeting inside the forge. */
export const SEXTUS_FORGE_FIRST_VISIT =
  'Well met, traveler. I am Sextus Ferratus — I keep this forge, and the fire keeps me. Mind the sparks; they bite.';

/** Sextus Ferratus — conversation topics: repair offers, forge lore, tempering hints. */
export const SEXTUS_FORGE_TOPICS = [
  {
    id: 'lore',
    label: 'Ask about the forge',
    line: 'This furnace has burned since the legions first marched. Iron remembers every hammer it has ever met — treat it with respect, and it will remember you kindly.',
  },
  {
    id: 'repair',
    label: 'Ask about repairs',
    line: 'Bring me a tired blade and I will true its edge at my anvil. Steel is patient, traveler, but it is not free — good work costs coin, and the fire costs coal.',
  },
  {
    id: 'temper',
    label: 'Ask about tempering',
    line: 'Tempering is the soul of the blade. Quench in oil for hardness, in water for mercy — but never skip the quench. An untempered blade is a promise unkept.',
  },
] as const;
/* ------------------------------------------------------------------ */
/* 3D set dressing — emissive materials + point lights only (mobile).  */
/* ------------------------------------------------------------------ */

const STONE = '#4a4038';
const STONE_DARK = '#2e2620';
const WOOD = '#6b4a2f';
const WOOD_DARK = '#4e3520';
const STEEL = '#8f959c';
const IRON_DARK = '#333336';

function ForgeShell() {
  return (
    <group>
      {/* Floor: dark soot-stained stone */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[18, 14]} />
        <meshStandardMaterial color="#241d18" roughness={0.95} />
      </mesh>
      {/* Soot stains on the floor */}
      {[
        [0, -4.2, 3.6],
        [-4.5, 1.5, 2.2],
        [5.5, 2.8, 2.6],
        [0.5, 3.8, 2.0],
      ].map(([x, z, r], i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.01, z]}>
          <circleGeometry args={[r, 20]} />
          <meshStandardMaterial color="#100c09" roughness={1} transparent opacity={0.55} depthWrite={false} />
        </mesh>
      ))}
      {/* Walls */}
      <mesh position={[0, 1.6, -6.5]}>
        <boxGeometry args={[18, 3.2, 0.6]} />
        <meshStandardMaterial color={STONE_DARK} roughness={1} />
      </mesh>
      <mesh position={[0, 1.6, 6.5]}>
        <boxGeometry args={[18, 3.2, 0.6]} />
        <meshStandardMaterial color={STONE_DARK} roughness={1} />
      </mesh>
      <mesh position={[-8.5, 1.6, 0]}>
        <boxGeometry args={[0.6, 3.2, 14]} />
        <meshStandardMaterial color={STONE_DARK} roughness={1} />
      </mesh>
      <mesh position={[8.5, 1.6, 0]}>
        <boxGeometry args={[0.6, 3.2, 14]} />
        <meshStandardMaterial color={STONE_DARK} roughness={1} />
      </mesh>
      {/* Soot stains above the furnace, on the north wall */}
      <mesh position={[-2.2, 2.2, -6.18]}>
        <planeGeometry args={[3.2, 1.8]} />
        <meshStandardMaterial color="#0f0b08" roughness={1} transparent opacity={0.7} depthWrite={false} />
      </mesh>
      <mesh position={[2.4, 2.4, -6.18]}>
        <planeGeometry args={[2.4, 1.4]} />
        <meshStandardMaterial color="#0f0b08" roughness={1} transparent opacity={0.6} depthWrite={false} />
      </mesh>
      {/* Door frame on the south wall */}
      <mesh position={[-1.35, 1.4, 6.35]}>
        <boxGeometry args={[0.5, 2.8, 0.7]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.9} />
      </mesh>
      <mesh position={[1.35, 1.4, 6.35]}>
        <boxGeometry args={[0.5, 2.8, 0.7]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.95, 6.35]}>
        <boxGeometry args={[3.2, 0.5, 0.7]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.9} />
      </mesh>
      {/* Ceiling beams */}
      {[-4, 0, 4].map((x) => (
        <mesh key={x} position={[x, 3.45, 0]}>
          <boxGeometry args={[0.35, 0.35, 13]} />
          <meshStandardMaterial color="#241a10" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/** Flickering furnace light + glowing coals (one useFrame for both). */
function FurnaceGlow() {
  const light = useRef<THREE.PointLight>(null);
  const coals = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const t = performance.now() / 1000;
    const flicker =
      Math.sin(t * 13) * 0.35 + Math.sin(t * 31 + 1.7) * 0.25 + Math.sin(t * 7.3 + 0.5) * 0.15;
    if (light.current) light.current.intensity = 2.6 + flicker;
    const mat = coals.current?.material as THREE.MeshStandardMaterial | undefined;
    if (mat) mat.emissiveIntensity = 1.8 + flicker * 0.9;
  });
  return (
    <group>
      <pointLight
        ref={light}
        position={[0, 1.6, 2.4]}
        color="#ff7a1a"
        intensity={2.6}
        distance={26}
        decay={1.6}
      />
      {/* Coal bed inside the firebox */}
      <mesh ref={coals} position={[0, 0.35, 0.95]}>
        <boxGeometry args={[1.6, 0.4, 0.6]} />
        <meshStandardMaterial color="#2a1406" emissive="#ff6a00" emissiveIntensity={1.8} roughness={1} />
      </mesh>
      {/* Ember lumps */}
      {[[-0.5, 0.62, 0.9], [0.15, 0.66, 1.05], [0.55, 0.6, 0.85]].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]}>
          <sphereGeometry args={[0.14, 8, 8]} />
          <meshStandardMaterial color="#3a1c08" emissive="#ff8c1a" emissiveIntensity={2.2} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

const SPARK_ORIGIN: [number, number, number] = [0, 1.0, 1.7];
const SPARK_COUNT = 36;
const SPARK_RISE = 3.0;

/** One cheap spark emitter above the furnace mouth (rising orange dots). */
function Sparks({ origin }: { origin: [number, number, number] }) {
  const ref = useRef<THREE.Points>(null);
  const data = useMemo(() => {
    const positions = new Float32Array(SPARK_COUNT * 3);
    const speeds = new Float32Array(SPARK_COUNT);
    const seeds = new Float32Array(SPARK_COUNT);
    for (let i = 0; i < SPARK_COUNT; i++) {
      positions[i * 3] = origin[0] + (Math.random() - 0.5) * 1.4;
      positions[i * 3 + 1] = origin[1] + Math.random() * SPARK_RISE;
      positions[i * 3 + 2] = origin[2] + (Math.random() - 0.5) * 0.8;
      speeds[i] = 0.9 + Math.random() * 1.5;
      seeds[i] = Math.random() * Math.PI * 2;
    }
    return { positions, speeds, seeds };
  }, [origin]);
  useFrame((_, delta) => {
    const pts = ref.current;
    if (!pts) return;
    const attr = pts.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const t = performance.now() / 1000;
    for (let i = 0; i < SPARK_COUNT; i++) {
      let y = arr[i * 3 + 1] + data.speeds[i] * delta;
      if (y > origin[1] + SPARK_RISE) {
        y = origin[1];
        arr[i * 3] = origin[0] + (Math.random() - 0.5) * 1.4;
        arr[i * 3 + 2] = origin[2] + (Math.random() - 0.5) * 0.8;
      }
      arr[i * 3 + 1] = y;
      arr[i * 3] += Math.sin(t * 3 + data.seeds[i]) * delta * 0.35;
    }
    attr.needsUpdate = true;
  });
  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#ffb347"
        size={0.09}
        sizeAttenuation
        transparent
        opacity={0.95}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}
/** The great furnace — stone body, arched firebox, glowing coals, sparks. */
function Furnace() {
  return (
    <group position={[0, 0, -4.2]}>
      {/* Stone body */}
      <mesh position={[0, 1.25, 0]} castShadow>
        <boxGeometry args={[4.4, 2.5, 2.6]} />
        <meshStandardMaterial color={STONE} roughness={1} />
      </mesh>
      {/* Firebox: jambs + lintel + dark back, coals glowing inside */}
      <mesh position={[-1.0, 0.65, 1.15]} castShadow>
        <boxGeometry args={[0.35, 1.3, 0.4]} />
        <meshStandardMaterial color={STONE_DARK} roughness={1} />
      </mesh>
      <mesh position={[1.0, 0.65, 1.15]} castShadow>
        <boxGeometry args={[0.35, 1.3, 0.4]} />
        <meshStandardMaterial color={STONE_DARK} roughness={1} />
      </mesh>
      <mesh position={[0, 1.45, 1.15]}>
        <boxGeometry args={[2.35, 0.35, 0.4]} />
        <meshStandardMaterial color={STONE_DARK} roughness={1} />
      </mesh>
      <mesh position={[0, 0.65, 0.72]}>
        <boxGeometry args={[2.0, 1.3, 0.2]} />
        <meshStandardMaterial color="#0d0805" roughness={1} />
      </mesh>
      {/* Mantel slab + chimney */}
      <mesh position={[0, 2.65, 0]} castShadow>
        <boxGeometry args={[4.8, 0.3, 3.0]} />
        <meshStandardMaterial color={STONE_DARK} roughness={1} />
      </mesh>
      <mesh position={[0, 4.2, -0.4]}>
        <cylinderGeometry args={[0.9, 1.3, 3.4, 10]} />
        <meshStandardMaterial color={STONE_DARK} roughness={1} />
      </mesh>
      {/* Side pillars */}
      <mesh position={[-2.5, 1.0, 0.6]} castShadow>
        <boxGeometry args={[0.7, 2.0, 1.6]} />
        <meshStandardMaterial color={STONE} roughness={1} />
      </mesh>
      <mesh position={[2.5, 1.0, 0.6]} castShadow>
        <boxGeometry args={[0.7, 2.0, 1.6]} />
        <meshStandardMaterial color={STONE} roughness={1} />
      </mesh>
      <FurnaceGlow />
      <Sparks origin={SPARK_ORIGIN} />
    </group>
  );
}

/** An anvil on a wooden stump. */
function Anvil({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.58, 0.7, 10]} />
        <meshStandardMaterial color={WOOD} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.82, 0]} castShadow>
        <boxGeometry args={[0.7, 0.25, 0.55]} />
        <meshStandardMaterial color={IRON_DARK} metalness={0.7} roughness={0.45} />
      </mesh>
      <mesh position={[0, 1.05, 0]} castShadow>
        <boxGeometry args={[0.45, 0.25, 0.4]} />
        <meshStandardMaterial color={IRON_DARK} metalness={0.7} roughness={0.45} />
      </mesh>
      <mesh position={[-0.15, 1.28, 0]} castShadow>
        <boxGeometry args={[1.1, 0.28, 0.5]} />
        <meshStandardMaterial color="#43434a" metalness={0.75} roughness={0.4} />
      </mesh>
      <mesh position={[0.72, 1.28, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
        <coneGeometry args={[0.22, 0.7, 10]} />
        <meshStandardMaterial color="#43434a" metalness={0.75} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** Wall weapon rack with sword silhouettes (simple boxes, not detailed models). */
function WeaponRack({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  const swords = [-0.9, -0.45, 0, 0.45, 0.9];
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[-1.15, 0.9, 0]} castShadow>
        <boxGeometry args={[0.12, 1.8, 0.12]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.9} />
      </mesh>
      <mesh position={[1.15, 0.9, 0]} castShadow>
        <boxGeometry args={[0.12, 1.8, 0.12]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.55, 0]}>
        <boxGeometry args={[2.5, 0.1, 0.12]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[2.5, 0.1, 0.12]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.9} />
      </mesh>
      {swords.map((x, i) => (
        <group key={i} position={[x, 0, 0.04]}>
          <mesh position={[0, 1.05, 0]}>
            <boxGeometry args={[0.09, 1.0, 0.03]} />
            <meshStandardMaterial color={STEEL} metalness={0.8} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.52, 0]}>
            <boxGeometry args={[0.34, 0.06, 0.05]} />
            <meshStandardMaterial color="#5a4a2f" metalness={0.4} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.42, 0]}>
            <boxGeometry args={[0.07, 0.16, 0.05]} />
            <meshStandardMaterial color={WOOD} roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
/** Quench barrel: wooden barrel, animated water, rising steam wisps. */
function QuenchBarrel({ position }: { position: [number, number, number] }) {
  const water = useRef<THREE.Mesh>(null);
  const steam = useRef<THREE.Group>(null);
  useFrame(() => {
    const t = performance.now() / 1000;
    const wmat = water.current?.material as THREE.MeshStandardMaterial | undefined;
    if (wmat) wmat.opacity = 0.6 + Math.sin(t * 2.2) * 0.12;
    steam.current?.children.forEach((s, i) => {
      const ph = (t * 0.35 + i / 3) % 1;
      s.position.y = 1.1 + ph * 1.1;
      s.position.x = Math.sin(t * 1.5 + i * 2.1) * 0.12;
      const smat = (s as THREE.Mesh).material as THREE.MeshStandardMaterial;
      smat.opacity = 0.28 * (1 - ph);
      const sc = 0.5 + ph * 0.9;
      s.scale.set(sc, sc, sc);
    });
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.62, 0.55, 1.1, 12]} />
        <meshStandardMaterial color="#5d4128" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.88, 0]}>
        <cylinderGeometry args={[0.64, 0.64, 0.07, 12]} />
        <meshStandardMaterial color={IRON_DARK} metalness={0.7} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.6, 0.6, 0.07, 12]} />
        <meshStandardMaterial color={IRON_DARK} metalness={0.7} roughness={0.5} />
      </mesh>
      <mesh ref={water} rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.02, 0]}>
        <circleGeometry args={[0.52, 20]} />
        <meshStandardMaterial color="#3f6d9e" transparent opacity={0.65} roughness={0.25} />
      </mesh>
      <group ref={steam}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[(i - 1) * 0.2, 1.1, 0]}>
            <sphereGeometry args={[0.16, 8, 8]} />
            <meshStandardMaterial color="#cfd6dd" transparent opacity={0.25} depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** The smith's workbench with half-finished blades. */
function Workbench({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.85, 0]} castShadow>
        <boxGeometry args={[2.8, 0.14, 1.2]} />
        <meshStandardMaterial color="#7a5a38" roughness={0.85} />
      </mesh>
      {[[-1.25, -0.5], [1.25, -0.5], [-1.25, 0.5], [1.25, 0.5]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.4, z]} castShadow>
          <boxGeometry args={[0.14, 0.8, 0.14]} />
          <meshStandardMaterial color="#5d4128" roughness={0.9} />
        </mesh>
      ))}
      {/* Half-finished blades */}
      <mesh position={[-0.5, 0.95, 0.1]} rotation={[0, 0.25, 0]}>
        <boxGeometry args={[1.0, 0.035, 0.14]} />
        <meshStandardMaterial color={STEEL} metalness={0.8} roughness={0.4} />
      </mesh>
      <mesh position={[0.45, 0.95, -0.15]} rotation={[0, -0.35, 0]}>
        <boxGeometry args={[0.85, 0.035, 0.12]} />
        <meshStandardMaterial color="#6f747b" metalness={0.7} roughness={0.5} />
      </mesh>
      {/* Hammer */}
      <mesh position={[1.0, 0.98, 0.25]} rotation={[0, 0, Math.PI / 2.3]}>
        <cylinderGeometry args={[0.035, 0.035, 0.7, 8]} />
        <meshStandardMaterial color={WOOD} roughness={0.9} />
      </mesh>
      <mesh position={[1.2, 1.04, 0.25]}>
        <boxGeometry args={[0.22, 0.16, 0.16]} />
        <meshStandardMaterial color={IRON_DARK} metalness={0.7} roughness={0.5} />
      </mesh>
    </group>
  );
}

/** Sextus Ferratus — procedural keeper NPC by the workbench, with a talk marker. */
function SextusNPC({ position }: { position: [number, number, number] }) {
  const marker = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const t = performance.now() / 1000;
    if (marker.current) {
      marker.current.position.y = 2.35 + Math.sin(t * 2.4) * 0.12;
      marker.current.rotation.y = t * 1.8;
    }
  });
  return (
    <group position={position} rotation={[0, -0.6, 0]}>
      <mesh position={[-0.13, 0.35, 0]}>
        <boxGeometry args={[0.2, 0.7, 0.22]} />
        <meshStandardMaterial color="#2c2620" roughness={1} />
      </mesh>
      <mesh position={[0.13, 0.35, 0]}>
        <boxGeometry args={[0.2, 0.7, 0.22]} />
        <meshStandardMaterial color="#2c2620" roughness={1} />
      </mesh>
      <mesh position={[0, 0.95, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.38, 0.75, 10]} />
        <meshStandardMaterial color="#7a2e1d" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.9, 0.27]}>
        <boxGeometry args={[0.5, 0.7, 0.08]} />
        <meshStandardMaterial color="#4a3220" roughness={0.95} />
      </mesh>
      <mesh position={[-0.4, 1.05, 0]} rotation={[0, 0, 0.25]}>
        <cylinderGeometry args={[0.09, 0.08, 0.6, 8]} />
        <meshStandardMaterial color="#7a2e1d" roughness={0.9} />
      </mesh>
      <mesh position={[0.42, 1.1, 0.1]} rotation={[0.5, 0, -0.35]}>
        <cylinderGeometry args={[0.09, 0.08, 0.6, 8]} />
        <meshStandardMaterial color="#7a2e1d" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.62, 0]} castShadow>
        <sphereGeometry args={[0.21, 14, 14]} />
        <meshStandardMaterial color="#c9a07a" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.5, 0.15]}>
        <boxGeometry args={[0.26, 0.18, 0.1]} />
        <meshStandardMaterial color="#8d8578" roughness={1} />
      </mesh>
      {/* Floating talk marker */}
      <mesh ref={marker} position={[0, 2.35, 0]}>
        <octahedronGeometry args={[0.13]} />
        <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={1.4} />
      </mesh>
    </group>
  );
}
/* ------------------------------------------------------------------ */
/* Player rig — camera-relative movement, forge-floor clamp, door exit. */
/* ------------------------------------------------------------------ */

interface ForgePlayerRigProps {
  onExitRef: React.MutableRefObject<() => void>;
  keysRef: React.MutableRefObject<Record<string, boolean>>;
  stickRef: React.MutableRefObject<{ x: number; y: number }>;
  onPosition: (x: number, z: number) => void;
}

function ForgePlayerRig({ onExitRef, keysRef, stickRef, onPosition }: ForgePlayerRigProps) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const pos = useRef<[number, number]>([FORGE_SPAWN_X, FORGE_SPAWN_Z]);
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
    [px, pz] = clampToForgeFloor(px, pz);
    pos.current = [px, pz];
    onPosition(px, pz);
    // Walk back through the forge door to leave.
    if (!exited.current && isForgeExit(px, pz)) {
      exited.current = true;
      onExitRef.current();
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
    // Chase camera.
    const desired = new THREE.Vector3(px - Math.sin(cy) * 8, 6.4, pz - Math.cos(cy) * 8);
    camera.position.lerp(desired, 1 - Math.exp(-5 * delta));
    camera.lookAt(px, 1.1, pz);
  });

  return (
    <group ref={group} position={[FORGE_SPAWN_X, 0, FORGE_SPAWN_Z]}>
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

interface ForgeInteriorProps {
  /** Called when the player taps "Return to City" or walks back through the door. */
  onExit: () => void;
  /** Open the existing forge weapon storefront (from the workbench station). */
  onOpenShop: () => void;
  /** Open the existing tempering UI (from the anvil station). */
  onOpenTemper: () => void;
  /** Record the keeper's first-visit line (K1 pattern). */
  onRecordKeeperVisit?: (keeperId: string) => void;
}

export function ForgeInterior({ onExit, onOpenShop, onOpenTemper, onRecordKeeperVisit }: ForgeInteriorProps) {
  const onExitRef = useRef(onExit);
  const onOpenShopRef = useRef(onOpenShop);
  const onOpenTemperRef = useRef(onOpenTemper);
  const onRecordKeeperVisitRef = useRef(onRecordKeeperVisit);
  useEffect(() => {
    onExitRef.current = onExit;
    onOpenShopRef.current = onOpenShop;
    onOpenTemperRef.current = onOpenTemper;
    onRecordKeeperVisitRef.current = onRecordKeeperVisit;
  });

  const keysPressed = useRef<Record<string, boolean>>({});
  const stickRef = useRef({ x: 0, y: 0 });
  const playerPosRef = useRef({ x: FORGE_SPAWN_X, z: FORGE_SPAWN_Z });
  const nearStationRef = useRef<ForgeStation | null>(null);
  const talkingRef = useRef(false);
  const metSextusRef = useRef(false);
  const [nearStation, setNearStation] = useState<ForgeStation | null>(null);
  const [talking, setTalking] = useState(false);
  const [sextusLine, setSextusLine] = useState<string>(SEXTUS_FORGE_FIRST_VISIT);

  // Proximity polling (cheap: 5 Hz) — drives the station prompt.
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = nearestForgeStation(playerPosRef.current.x, playerPosRef.current.z);
      if (s?.id !== nearStationRef.current?.id) {
        nearStationRef.current = s;
        setNearStation(s);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  const startTalking = () => {
    if (!metSextusRef.current) {
      metSextusRef.current = true;
      setSextusLine(SEXTUS_FORGE_FIRST_VISIT);
      onRecordKeeperVisitRef.current?.('sextus_ferratus');
    }
    talkingRef.current = true;
    setTalking(true);
  };

  const stopTalking = () => {
    talkingRef.current = false;
    setTalking(false);
  };

  const interactWithStation = () => {
    const s = nearStationRef.current;
    if (!s || talkingRef.current) return;
    if (s.id === 'sextus') startTalking();
    else if (s.id === 'anvil') onOpenTemperRef.current();
    else if (s.id === 'workbench') onOpenShopRef.current();
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
    <div
      className="fixed inset-0 z-[95] bg-neutral-950 overflow-hidden select-none"
      role="dialog"
      aria-modal="true"
      aria-label="The Smithing Forge"
    >
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [FORGE_SPAWN_X, 6.4, FORGE_SPAWN_Z + 8], fov: 55, near: 0.1, far: 120 }}
        gl={{ antialias: false, powerPreference: 'low-power' }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.1;
        }}
      >
        <color attach="background" args={['#0b0705']} />
        <fog attach="fog" args={['#0b0705', 45, 110]} />
        <ambientLight intensity={0.32} color="#6b5a44" />
        <directionalLight
          position={[6, 10, 4]}
          intensity={0.35}
          color="#cfd8ff"
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-12}
          shadow-camera-right={12}
          shadow-camera-top={12}
          shadow-camera-bottom={-12}
          shadow-camera-near={1}
          shadow-camera-far={40}
          shadow-bias={-0.0004}
        />
        {/* Warm lantern over the workbench */}
        <pointLight position={[4.4, 2.4, -1.6]} color="#ffb46b" intensity={0.8} distance={11} decay={1.7} />
        <ForgeShell />
        <Furnace />
        <Anvil position={[-3.4, 0, -2.9]} rotationY={0.5} />
        <Anvil position={[3.4, 0, -2.9]} rotationY={-0.5} />
        <WeaponRack position={[-7.9, 0, 0.6]} rotationY={Math.PI / 2} />
        <WeaponRack position={[7.9, 0, -2.0]} rotationY={-Math.PI / 2} />
        <QuenchBarrel position={[3.4, 0, 2.8]} />
        <Workbench position={[4.4, 0, -1.6]} rotationY={-0.15} />
        <SextusNPC position={[4.4, 0, 0.6]} />
        <ForgePlayerRig
          onExitRef={onExitRef}
          keysRef={keysPressed}
          stickRef={stickRef}
          onPosition={(x, z) => {
            playerPosRef.current = { x, z };
          }}
        />
      </Canvas>

      {/* HUD */}
      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="absolute top-3 left-1/2 -translate-x-1/2">
          <div className="bg-neutral-950/85 border border-orange-600/50 rounded-2xl px-4 py-2 text-center">
            <div className="font-serif font-black text-orange-100 text-sm tracking-wide">The Smithing Forge</div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-orange-400/80">
              Sextus Ferratus · weaponsmith
            </div>
          </div>
        </div>
        <div className="absolute top-3 left-3 pointer-events-auto">
          <button
            type="button"
            onClick={() => onExitRef.current()}
            aria-label="Return to City"
            data-forge-return
            className="min-h-[44px] min-w-[44px] px-4 rounded-2xl bg-neutral-950/85 border border-orange-600/50 text-orange-200 font-serif font-bold text-sm hover:bg-orange-500/20 flex items-center"
          >
            ← Return to City
          </button>
        </div>
        {/* Nearby-station prompt */}
        {nearStation && !talking && (
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2 pointer-events-auto">
            <div className="bg-neutral-950/85 border border-orange-600/50 rounded-2xl px-4 py-2.5 flex items-center gap-3 max-w-[92vw]">
              <div className="min-w-0">
                <div className="font-serif font-bold text-orange-100 text-sm leading-tight">{nearStation.label}</div>
                <div className="text-[11px] text-neutral-400 font-mono truncate">{nearStation.hint}</div>
              </div>
              {nearStation.id === 'sextus' && (
                <button
                  type="button"
                  onClick={startTalking}
                  className="min-h-[44px] px-4 rounded-xl bg-orange-600/90 hover:bg-orange-500 text-neutral-950 font-serif font-bold text-sm shrink-0"
                >
                  Talk
                </button>
              )}
              {nearStation.id === 'anvil' && (
                <button
                  type="button"
                  onClick={() => onOpenTemperRef.current()}
                  className="min-h-[44px] px-4 rounded-xl bg-orange-600/90 hover:bg-orange-500 text-neutral-950 font-serif font-bold text-sm shrink-0"
                >
                  Temper
                </button>
              )}
              {nearStation.id === 'workbench' && (
                <button
                  type="button"
                  onClick={() => onOpenShopRef.current()}
                  className="min-h-[44px] px-4 rounded-xl bg-orange-600/90 hover:bg-orange-500 text-neutral-950 font-serif font-bold text-sm shrink-0"
                >
                  Shop
                </button>
              )}
            </div>
          </div>
        )}
        {/* Sextus Ferratus dialogue */}
        {talking && (
          <div className="absolute inset-x-3 bottom-24 sm:bottom-28 z-20 flex justify-center pointer-events-none">
            <div className="pointer-events-auto w-[min(94vw,30rem)] rounded-2xl border border-orange-600/50 bg-neutral-950/95 p-4 shadow-2xl">
              <div className="font-serif font-black text-orange-100">Sextus Ferratus</div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-orange-400/70">
                Keeper of the forge
              </div>
              <p className="mt-2 text-sm leading-relaxed text-neutral-200">&ldquo;{sextusLine}&rdquo;</p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                {SEXTUS_FORGE_TOPICS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSextusLine(t.line)}
                    className="min-h-[44px] rounded-xl border border-orange-600/50 text-orange-200 hover:bg-orange-500/15 font-serif font-bold text-[13px] px-2"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={stopTalking}
                className="mt-2 w-full min-h-[44px] rounded-xl bg-orange-600/90 hover:bg-orange-500 text-neutral-950 font-serif font-bold text-sm"
              >
                Farewell
              </button>
            </div>
          </div>
        )}
        {/* On-screen joystick */}
        <div className="absolute bottom-5 left-5 pointer-events-auto touch-none">
          <div
            ref={joystickRef}
            onTouchStart={handleJoystickTouchStart}
            onTouchMove={handleJoystickTouchMove}
            onTouchEnd={handleJoystickTouchEnd}
            onTouchCancel={handleJoystickTouchEnd}
            aria-label="Move"
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-neutral-950/60 border-2 border-orange-600/50 relative flex items-center justify-center"
          >
            <div className="absolute top-2 w-1.5 h-1.5 rounded-full bg-orange-500/50" />
            <div className="absolute bottom-2 w-1.5 h-1.5 rounded-full bg-orange-500/50" />
            <div className="absolute left-2 w-1.5 h-1.5 rounded-full bg-orange-500/50" />
            <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-orange-500/50" />
            <div
              className="w-10 h-10 rounded-full bg-gradient-to-b from-orange-500 to-orange-700 border-2 border-orange-300"
              style={{ transform: `translate(${knobPos.x}px, ${knobPos.y}px)` }}
            />
          </div>
          <div className="mt-1 text-center font-mono text-[10px] uppercase tracking-wider text-orange-300/80">
            Move
          </div>
        </div>
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 hidden sm:flex">
          <div className="bg-neutral-950/70 border border-neutral-700/60 rounded-xl px-3 py-1.5 text-[11px] font-mono text-neutral-300">
            WASD / arrows to walk · E to interact · walk back through the door to leave
          </div>
        </div>
      </div>
    </div>
  );
}
