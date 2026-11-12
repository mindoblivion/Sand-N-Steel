import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { applyDeadZone } from '../../utils/joystickDeadZone';
import { getKeeper } from '../../data/keepers';

/* ------------------------------------------------------------------ */
/* DOM-free bathhouse math (mirrors ForgeInterior / BountyHallInterior — */
/* unit-testable).                                                     */
/* ------------------------------------------------------------------ */

/** Half-extents of the walkable thermae floor (rectangular clamp; v1 has no furniture collision). */
export const BATHHOUSE_FLOOR_HALF_X = 12;
export const BATHHOUSE_FLOOR_HALF_Z = 5;
/** Player spawn, just inside the thermae door on the south wall (apodyterium). */
export const BATHHOUSE_SPAWN_X = -9;
export const BATHHOUSE_SPAWN_Z = 4.2;
/** Door/exit zone on the south wall — walking back through it returns to the city. */
export const BATHHOUSE_EXIT_MIN_Z = 4.9;
export const BATHHOUSE_EXIT_CENTER_X = -9;
export const BATHHOUSE_EXIT_HALF_WIDTH = 1.6;

/** Clamp a world position to the walkable thermae floor. */
export function clampToBathhouseFloor(x: number, z: number): [number, number] {
  return [
    Math.max(-BATHHOUSE_FLOOR_HALF_X, Math.min(BATHHOUSE_FLOOR_HALF_X, x)),
    Math.max(-BATHHOUSE_FLOOR_HALF_Z, Math.min(BATHHOUSE_FLOOR_HALF_Z, z)),
  ];
}

/** True when the player walks back through the thermae door (south wall). */
export function isBathhouseExit(x: number, z: number): boolean {
  return z >= BATHHOUSE_EXIT_MIN_Z && Math.abs(x - BATHHOUSE_EXIT_CENTER_X) <= BATHHOUSE_EXIT_HALF_WIDTH;
}

/* ------------------------------------------------------------------ */
/* Stations + Straton dialogue (DOM-free, unit-testable).              */
/* ------------------------------------------------------------------ */

export type BathhouseStationId = 'straton' | 'tepidarium' | 'caldarium' | 'frigidarium';

export interface BathhouseStation {
  id: BathhouseStationId;
  label: string;
  hint: string;
  x: number;
  z: number;
  radius: number;
}

export const BATHHOUSE_STATIONS: BathhouseStation[] = [
  { id: 'straton', label: 'Straton of Corinth', hint: 'The bathkeeper — talk, or hear the steam', x: -9, z: 2.2, radius: 2.3 },
  { id: 'tepidarium', label: 'The Tepidarium', hint: 'Lukewarm water, moderate steam', x: -3, z: -0.5, radius: 2.0 },
  { id: 'caldarium', label: 'The Caldarium', hint: 'Hot water, heavy steam', x: 3, z: -0.3, radius: 2.0 },
  { id: 'frigidarium', label: 'The Frigidarium', hint: 'The cold plunge — veterans swear by it', x: 9, z: -0.5, radius: 2.0 },
];

/** Nearest station within its interaction radius, or null on open floor. */
export function nearestBathhouseStation(x: number, z: number): BathhouseStation | null {
  let best: BathhouseStation | null = null;
  let bestD = Infinity;
  for (const s of BATHHOUSE_STATIONS) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d <= s.radius && d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/**
 * Straton of Corinth — read BY ID from the keeper registry. He is deliberately
 * NOT in SERVICE_BUILDING_KEEPERS (the bathhouse sells no service), so
 * getKeeperForBuilding('bathhouse') returns undefined and priming a greeting
 * through it would prime nothing. The fallbacks are verbatim copies of the
 * registry lines as of Nov 11 2026, so the dialogue survives a registry
 * rename; the suite pins the resolved lines against the registry.
 */
const STRATON = getKeeper('straton_of_corinth');
export const STRATON_BATH_FIRST_VISIT =
  STRATON?.firstVisitLine ??
  "Water's hot, oil's fresh, and everything said in my steam is forgotten by law — mine. Rest your bones; the Thermae ask nothing of you but the dirt.";
export const STRATON_BATH_REPEAT =
  STRATON?.repeatLines[0] ?? 'Heard a thing in the steam about you. Heard three things. Two of them were even true.';

/**
 * Straton — conversation topics: what the steam hears, the city, the regulars.
 * Authored flavour only. NOT the §3C fragment: that content is story-gated,
 * and the interior only ever points at Straton as its source.
 */
export const STRATON_BATH_TOPICS = [
  {
    id: 'steam',
    label: 'Ask what the steam hears',
    line: 'Old men talk in my steam, and I forget it all by law. But between you and me — the ludus master has been buying oil by the barrel, and oil means training, and training means blood on the sand soon.',
  },
  {
    id: 'city',
    label: 'Ask about the city',
    line: 'The city is a body, boy. The arena is the heart, the market the gut, and my thermae — well, my thermae are the skin. Everything passes through here eventually.',
  },
  {
    id: 'regulars',
    label: 'Ask about the regulars',
    line: 'The same faces, every morning. Veterans with scars like maps. They talk about the old days as if the old days were better. They were not. They were only younger.',
  },
] as const;

/** One flavour line per pool — looking is the whole interaction. No transaction, no cure. */
export const BATHHOUSE_POOL_LINES: Record<'tepidarium' | 'caldarium' | 'frigidarium', string> = {
  tepidarium:
    "Lukewarm, the colour of weak tea. A bather's first pool, and the last one the old men leave — the water holds the day's gossip like a cup holds the dregs.",
  caldarium:
    'The water is hot enough to make your skin complain and your shoulders surrender. Steam rises in sheets. Somewhere behind it, an old man is snoring.',
  frigidarium:
    'Cold enough to stop your breath and start your heart. The plunge pool. Veterans swear by it; newcomers swear AT it.',
};

/* ------------------------------------------------------------------ */
/* 3D set dressing — emissive materials + point lights only (mobile).  */
/* ------------------------------------------------------------------ */

const MARBLE = '#b9b2a4';
const MARBLE_DARK = '#8a8378';
const MARBLE_FLOOR = '#cfc9bd';
const MARBLE_SEAM = '#a8a196';
const TIMBER_DARK = '#451a03';
const BRASS = '#a16207';

/** Marble floor, walls, and ceiling beams for the four-room thermae. */
function BathhouseShell() {
  return (
    <group>
      {/* Floor: pale marble flags */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[24, 10]} />
        <meshStandardMaterial color={MARBLE_FLOOR} roughness={0.55} />
      </mesh>
      {/* Flag seams */}
      {[-9, -6, -3, 0, 3, 6, 9].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.01, 0]}>
          <planeGeometry args={[0.07, 10]} />
          <meshStandardMaterial color={MARBLE_SEAM} roughness={1} />
        </mesh>
      ))}
      {/* North wall */}
      <mesh position={[0, 1.6, -5.3]}>
        <boxGeometry args={[24.6, 3.2, 0.6]} />
        <meshStandardMaterial color={MARBLE} roughness={0.8} />
      </mesh>
      {/* South wall — two segments leaving the door gap at x -10.6..-7.4 */}
      <mesh position={[-11.45, 1.6, 5.3]}>
        <boxGeometry args={[1.7, 3.2, 0.6]} />
        <meshStandardMaterial color={MARBLE} roughness={0.8} />
      </mesh>
      <mesh position={[2.45, 1.6, 5.3]}>
        <boxGeometry args={[19.7, 3.2, 0.6]} />
        <meshStandardMaterial color={MARBLE} roughness={0.8} />
      </mesh>
      {/* Door frame on the south wall */}
      <mesh position={[-10.75, 1.4, 5.15]}>
        <boxGeometry args={[0.5, 2.8, 0.7]} />
        <meshStandardMaterial color={TIMBER_DARK} roughness={0.9} />
      </mesh>
      <mesh position={[-7.25, 1.4, 5.15]}>
        <boxGeometry args={[0.5, 2.8, 0.7]} />
        <meshStandardMaterial color={TIMBER_DARK} roughness={0.9} />
      </mesh>
      <mesh position={[-9, 2.95, 5.15]}>
        <boxGeometry args={[4.0, 0.5, 0.7]} />
        <meshStandardMaterial color={TIMBER_DARK} roughness={0.9} />
      </mesh>
      {/* West + east walls */}
      <mesh position={[-12.3, 1.6, 0]}>
        <boxGeometry args={[0.6, 3.2, 10.6]} />
        <meshStandardMaterial color={MARBLE} roughness={0.8} />
      </mesh>
      <mesh position={[12.3, 1.6, 0]}>
        <boxGeometry args={[0.6, 3.2, 10.6]} />
        <meshStandardMaterial color={MARBLE} roughness={0.8} />
      </mesh>
      {/* Partition walls at x -6 / 0 / 6 — open doorways at z -1.1..1.1, lintel above */}
      {[-6, 0, 6].map((x) => (
        <group key={x}>
          <mesh position={[x, 1.6, -3.05]}>
            <boxGeometry args={[0.5, 3.2, 3.9]} />
            <meshStandardMaterial color={MARBLE} roughness={0.8} />
          </mesh>
          <mesh position={[x, 1.6, 3.05]}>
            <boxGeometry args={[0.5, 3.2, 3.9]} />
            <meshStandardMaterial color={MARBLE} roughness={0.8} />
          </mesh>
          <mesh position={[x, 2.75, 0]}>
            <boxGeometry args={[0.5, 0.9, 2.2]} />
            <meshStandardMaterial color={MARBLE_DARK} roughness={0.8} />
          </mesh>
        </group>
      ))}
      {/* Ceiling beams */}
      {[-9, -3, 3, 9].map((x) => (
        <mesh key={x} position={[x, 3.45, 0]}>
          <boxGeometry args={[0.35, 0.35, 10]} />
          <meshStandardMaterial color="#241a10" roughness={1} />
        </mesh>
      ))}
      {/* Apodyterium niches (clothes) on the west wall */}
      {[-3, 0, 3].map((z) => (
        <mesh key={z} position={[-11.85, 1.3, z]}>
          <boxGeometry args={[0.3, 1.4, 0.9]} />
          <meshStandardMaterial color="#3f3a33" roughness={1} />
        </mesh>
      ))}
      {/* Apodyterium shelf with oil flasks */}
      <mesh position={[-11.7, 1.9, -4.2]}>
        <boxGeometry args={[0.4, 0.08, 2.0]} />
        <meshStandardMaterial color={TIMBER_DARK} roughness={0.9} />
      </mesh>
      {[-4.9, -4.2, -3.5].map((z) => (
        <mesh key={z} position={[-11.7, 2.15, z]}>
          <cylinderGeometry args={[0.09, 0.12, 0.35, 8]} />
          <meshStandardMaterial color="#b45309" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/** A pool basin: dark marble rim, basin floor, and an animated water surface. */
function Pool({
  position,
  size,
  waterColor,
  waterY,
}: {
  position: [number, number, number];
  size: [number, number];
  waterColor: string;
  waterY: number;
}) {
  const [w, d] = size;
  return (
    <group position={position}>
      {/* Basin floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#57534e" roughness={0.9} />
      </mesh>
      {/* Rim: four low walls */}
      <mesh position={[0, 0.25, -d / 2]}>
        <boxGeometry args={[w + 0.3, 0.5, 0.3]} />
        <meshStandardMaterial color={MARBLE_DARK} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.25, d / 2]}>
        <boxGeometry args={[w + 0.3, 0.5, 0.3]} />
        <meshStandardMaterial color={MARBLE_DARK} roughness={0.7} />
      </mesh>
      <mesh position={[-w / 2, 0.25, 0]}>
        <boxGeometry args={[0.3, 0.5, d]} />
        <meshStandardMaterial color={MARBLE_DARK} roughness={0.7} />
      </mesh>
      <mesh position={[w / 2, 0.25, 0]}>
        <boxGeometry args={[0.3, 0.5, d]} />
        <meshStandardMaterial color={MARBLE_DARK} roughness={0.7} />
      </mesh>
      <WaterSurface position={[0, waterY, 0]} size={[w - 0.2, d - 0.2]} color={waterColor} />
    </group>
  );
}

/** Animated water: a plane whose opacity breathes and whose surface bobs slightly. */
function WaterSurface({
  position,
  size,
  color,
}: {
  position: [number, number, number];
  size: [number, number];
  color: string;
}) {
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const t = performance.now() / 1000;
    if (mat.current) mat.current.opacity = 0.78 + Math.sin(t * 1.4) * 0.08;
    if (mesh.current) mesh.current.position.y = position[1] + Math.sin(t * 0.9) * 0.015;
  });
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} position={position}>
      <planeGeometry args={size} />
      <meshStandardMaterial ref={mat} color={color} transparent opacity={0.8} roughness={0.15} metalness={0.1} />
    </mesh>
  );
}

/** Cheap steam: a handful of pale wisps that rise, fade, and loop. */
function SteamWisps({
  position,
  count,
  spread = 1.2,
  height = 2.2,
}: {
  position: [number, number, number];
  count: number;
  spread?: number;
  height?: number;
}) {
  const group = useRef<THREE.Group>(null);
  const phases = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: (Math.random() - 0.5) * spread * 2,
        z: (Math.random() - 0.5) * spread,
        phase: Math.random(),
        speed: 0.22 + Math.random() * 0.18,
      })),
    [count, spread]
  );
  useFrame(() => {
    const t = performance.now() / 1000;
    const g = group.current;
    if (!g) return;
    g.children.forEach((child, i) => {
      const p = phases[i % phases.length];
      const cycle = (t * p.speed + p.phase) % 1;
      child.position.set(p.x, 0.3 + cycle * height, p.z);
      const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
      mat.opacity = 0.26 * Math.sin(cycle * Math.PI);
    });
  });
  return (
    <group ref={group} position={position}>
      {phases.map((_, i) => (
        <mesh key={i} position={[0, 0.3, 0]}>
          <sphereGeometry args={[0.22, 8, 8]} />
          <meshStandardMaterial color="#e5e7eb" transparent opacity={0.2} roughness={1} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** A low marble bench with two legs. */
function Bench({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[2.2, 0.12, 0.6]} />
        <meshStandardMaterial color={MARBLE_DARK} roughness={0.75} />
      </mesh>
      <mesh position={[-0.9, 0.2, 0]}>
        <boxGeometry args={[0.16, 0.4, 0.5]} />
        <meshStandardMaterial color={MARBLE_DARK} roughness={0.75} />
      </mesh>
      <mesh position={[0.9, 0.2, 0]}>
        <boxGeometry args={[0.16, 0.4, 0.5]} />
        <meshStandardMaterial color={MARBLE_DARK} roughness={0.75} />
      </mesh>
    </group>
  );
}

/** An unnamed bather — flavour only, no name, no dialogue, no station. */
function BatherFigure({
  position,
  rotationY = 0,
  robe = '#6b7280',
  seated = false,
}: {
  position: [number, number, number];
  rotationY?: number;
  robe?: string;
  seated?: boolean;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, seated ? 0.95 : 0.75, 0]}>
        <capsuleGeometry args={[0.3, 0.5, 6, 12]} />
        <meshStandardMaterial color={robe} roughness={0.95} />
      </mesh>
      <mesh position={[0, seated ? 1.5 : 1.45, 0]}>
        <sphereGeometry args={[0.2, 14, 14]} />
        <meshStandardMaterial color="#c9a07a" roughness={0.8} />
      </mesh>
      {/* Towel over the head, Roman-bather style */}
      <mesh position={[0, seated ? 1.63 : 1.58, 0]}>
        <boxGeometry args={[0.42, 0.08, 0.42]} />
        <meshStandardMaterial color="#f5f5f4" roughness={1} />
      </mesh>
    </group>
  );
}

/** Straton of Corinth, the bathkeeper — barrel belly, towel over one shoulder, with a talk marker. */
function StratonNPC({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  const marker = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const t = performance.now() / 1000;
    if (marker.current) {
      marker.current.position.y = 2.35 + Math.sin(t * 2.4) * 0.12;
      marker.current.rotation.y = t * 1.8;
    }
  });
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[-0.15, 0.35, 0]}>
        <boxGeometry args={[0.22, 0.7, 0.24]} />
        <meshStandardMaterial color="#2c2620" roughness={1} />
      </mesh>
      <mesh position={[0.15, 0.35, 0]}>
        <boxGeometry args={[0.22, 0.7, 0.24]} />
        <meshStandardMaterial color="#2c2620" roughness={1} />
      </mesh>
      {/* Barrel belly */}
      <mesh position={[0, 0.95, 0]} castShadow scale={[1.18, 1, 0.92]}>
        <sphereGeometry args={[0.42, 16, 16]} />
        <meshStandardMaterial color="#7c5a3a" roughness={0.9} />
      </mesh>
      {/* Towel over the left shoulder, hanging front and back */}
      <mesh position={[-0.3, 1.3, 0.12]} rotation={[0.12, 0, 0.18]}>
        <boxGeometry args={[0.2, 0.62, 0.06]} />
        <meshStandardMaterial color="#f5f5f4" roughness={1} />
      </mesh>
      <mesh position={[-0.3, 1.3, -0.14]} rotation={[-0.12, 0, 0.18]}>
        <boxGeometry args={[0.2, 0.5, 0.06]} />
        <meshStandardMaterial color="#e7e5e4" roughness={1} />
      </mesh>
      {/* Arms */}
      <mesh position={[-0.48, 1.05, 0.05]} rotation={[0, 0, 0.25]}>
        <cylinderGeometry args={[0.09, 0.08, 0.6, 8]} />
        <meshStandardMaterial color="#b98a5e" roughness={0.8} />
      </mesh>
      <mesh position={[0.48, 1.05, 0.05]} rotation={[0, 0, -0.25]}>
        <cylinderGeometry args={[0.09, 0.08, 0.6, 8]} />
        <meshStandardMaterial color="#b98a5e" roughness={0.8} />
      </mesh>
      {/* Head — skin like boiled leather */}
      <mesh position={[0, 1.62, 0]} castShadow>
        <sphereGeometry args={[0.21, 14, 14]} />
        <meshStandardMaterial color="#b98a5e" roughness={0.8} />
      </mesh>
      {/* Bald crown with a fringe of grey */}
      <mesh position={[0, 1.76, -0.06]}>
        <sphereGeometry args={[0.12, 10, 10]} />
        <meshStandardMaterial color="#8d8578" roughness={1} />
      </mesh>
      {/* Floating talk marker */}
      <mesh ref={marker} position={[0, 2.35, 0]}>
        <octahedronGeometry args={[0.13]} />
        <meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={1.4} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Player rig — camera-relative movement, thermae-floor clamp, door exit. */
/* ------------------------------------------------------------------ */

interface BathhousePlayerRigProps {
  onExitRef: React.MutableRefObject<() => void>;
  keysRef: React.MutableRefObject<Record<string, boolean>>;
  stickRef: React.MutableRefObject<{ x: number; y: number }>;
  onPosition: (x: number, z: number) => void;
}

function BathhousePlayerRig({ onExitRef, keysRef, stickRef, onPosition }: BathhousePlayerRigProps) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const pos = useRef<[number, number]>([BATHHOUSE_SPAWN_X, BATHHOUSE_SPAWN_Z]);
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
    [px, pz] = clampToBathhouseFloor(px, pz);
    pos.current = [px, pz];
    onPosition(px, pz);
    // Walk back through the thermae door to leave.
    if (!exited.current && isBathhouseExit(px, pz)) {
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
    // Chase camera.
    const desired = new THREE.Vector3(px - Math.sin(cy) * 8, 6.4, pz - Math.cos(cy) * 8);
    camera.position.lerp(desired, 1 - Math.exp(-5 * delta));
    camera.lookAt(px, 1.1, pz);
  });

  return (
    <group ref={group} position={[BATHHOUSE_SPAWN_X, 0, BATHHOUSE_SPAWN_Z]}>
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

interface BathhouseInteriorProps {
  /** Called when the player taps "Return to City" or walks back through the door. */
  onExit: () => void;
  /** Record the keeper's first-visit line (K1 pattern). */
  onRecordKeeperVisit?: (keeperId: string) => void;
  /**
   * Open with Straton's dialogue already up (the door panel's "Hear the Steam"
   * action). The player spawns in the apodyterium, where Straton stands, so the
   * conversation opens over his station.
   */
  startWithRumors?: boolean;
}

export function BathhouseInterior({ onExit, onRecordKeeperVisit, startWithRumors }: BathhouseInteriorProps) {
  const onExitRef = useRef(onExit);
  const onRecordKeeperVisitRef = useRef(onRecordKeeperVisit);
  useEffect(() => {
    onExitRef.current = onExit;
    onRecordKeeperVisitRef.current = onRecordKeeperVisit;
  });

  const keysPressed = useRef<Record<string, boolean>>({});
  const stickRef = useRef({ x: 0, y: 0 });
  const playerPosRef = useRef({ x: BATHHOUSE_SPAWN_X, z: BATHHOUSE_SPAWN_Z });
  const nearStationRef = useRef<BathhouseStation | null>(null);
  const talkingRef = useRef(false);
  const metStratonRef = useRef(false);
  const rumorsOpenedRef = useRef(false);
  const [nearStation, setNearStation] = useState<BathhouseStation | null>(null);
  const [talking, setTalking] = useState(false);
  const [stratonLine, setStratonLine] = useState<string>(STRATON_BATH_FIRST_VISIT);
  const [poolId, setPoolId] = useState<'tepidarium' | 'caldarium' | 'frigidarium' | null>(null);

  // Proximity polling (cheap: 5 Hz) — drives the station prompt.
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = nearestBathhouseStation(playerPosRef.current.x, playerPosRef.current.z);
      if (s?.id !== nearStationRef.current?.id) {
        nearStationRef.current = s;
        setNearStation(s);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  const startTalking = () => {
    if (!metStratonRef.current) {
      metStratonRef.current = true;
      setStratonLine(STRATON_BATH_FIRST_VISIT);
      onRecordKeeperVisitRef.current?.('straton_of_corinth');
    } else {
      // A return visit hears the registry's repeat line, not the greeting.
      setStratonLine(STRATON_BATH_REPEAT);
    }
    talkingRef.current = true;
    setTalking(true);
  };

  const stopTalking = () => {
    talkingRef.current = false;
    setTalking(false);
  };

  // "Hear the Steam" — the door panel's second action opens the conversation on arrival.
  useEffect(() => {
    if (startWithRumors && !rumorsOpenedRef.current) {
      rumorsOpenedRef.current = true;
      startTalking();
    }
    // Runs once on mount; startTalking reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const interactWithStation = () => {
    const s = nearStationRef.current;
    if (!s || talkingRef.current || poolId) return;
    if (s.id === 'straton') startTalking();
    else setPoolId(s.id);
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

  const poolStation = poolId ? BATHHOUSE_STATIONS.find((s) => s.id === poolId) ?? null : null;

  return (
    <div
      className="fixed inset-0 z-[95] bg-neutral-950 overflow-hidden select-none"
      role="dialog"
      aria-modal="true"
      aria-label="The Imperial Bathhouse"
    >
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [BATHHOUSE_SPAWN_X, 6.4, BATHHOUSE_SPAWN_Z + 8], fov: 55, near: 0.1, far: 120 }}
        gl={{ antialias: false, powerPreference: 'low-power' }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.1;
        }}
      >
        <color attach="background" args={['#14100d']} />
        <fog attach="fog" args={['#14100d', 45, 110]} />
        <ambientLight intensity={0.42} color="#f5e6c8" />
        <directionalLight
          position={[6, 10, 4]}
          intensity={0.3}
          color="#dfe8ff"
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-14}
          shadow-camera-right={14}
          shadow-camera-top={12}
          shadow-camera-bottom={-12}
          shadow-camera-near={1}
          shadow-camera-far={40}
          shadow-bias={-0.0004}
        />
        {/* Room lighting — warm in the caldarium, neutral in the tepidarium, cool in the frigidarium */}
        <pointLight position={[-9, 2.6, 0]} color="#fbbf24" intensity={0.7} distance={11} decay={1.7} />
        <pointLight position={[-3, 2.6, -1]} color="#fde68a" intensity={0.8} distance={11} decay={1.7} />
        <pointLight position={[3, 2.6, -1]} color="#fb923c" intensity={1.2} distance={12} decay={1.7} />
        <pointLight position={[9, 2.6, -1]} color="#60a5fa" intensity={0.9} distance={11} decay={1.7} />
        <BathhouseShell />
        <Pool position={[-3, 0, -2.5]} size={[4.5, 2.5]} waterColor="#7dd3fc" waterY={0.32} />
        <Pool position={[3, 0, -2.5]} size={[5, 3]} waterColor="#38bdf8" waterY={0.3} />
        <Pool position={[9, 0, -2.5]} size={[2.5, 2.5]} waterColor="#1d4ed8" waterY={0.28} />
        <SteamWisps position={[-9, 0, 0]} count={3} spread={1.5} height={2.0} />
        <SteamWisps position={[-3, 0, -2.5]} count={5} spread={1.8} height={2.2} />
        <SteamWisps position={[3, 0, -2.5]} count={9} spread={2.0} height={2.6} />
        <SteamWisps position={[9, 0, -2.5]} count={2} spread={1.0} height={1.8} />
        <Bench position={[-11.2, 0, -1.5]} rotationY={Math.PI / 2} />
        <Bench position={[-11.2, 0, 1.5]} rotationY={Math.PI / 2} />
        <Bench position={[-3, 0, 4.2]} />
        <Bench position={[3, 0, 4.2]} />
        <Bench position={[9, 0, 4.2]} />
        {/* Strigils left on the apodyterium bench */}
        <mesh position={[-11.2, 0.52, -1.3]} rotation={[0, 0.4, 0]}>
          <boxGeometry args={[0.3, 0.04, 0.08]} />
          <meshStandardMaterial color={BRASS} metalness={0.7} roughness={0.4} />
        </mesh>
        <mesh position={[-11.2, 0.52, -1.7]} rotation={[0, -0.3, 0]}>
          <boxGeometry args={[0.3, 0.04, 0.08]} />
          <meshStandardMaterial color={BRASS} metalness={0.7} roughness={0.4} />
        </mesh>
        <BatherFigure position={[-3, 0, 4.2]} rotationY={Math.PI} robe="#6b7280" seated />
        <BatherFigure position={[9, 0, 3.6]} rotationY={Math.PI} robe="#475569" />
        <StratonNPC position={[-9, 0, 2.2]} rotationY={Math.PI} />
        <BathhousePlayerRig
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
          <div className="bg-neutral-950/85 border border-sky-600/50 rounded-2xl px-4 py-2 text-center">
            <div className="font-serif font-black text-sky-100 text-sm tracking-wide">The Imperial Bathhouse</div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-sky-400/80">
              Straton of Corinth · the Thermae
            </div>
          </div>
        </div>
        <div className="absolute top-3 left-3 pointer-events-auto">
          <button
            type="button"
            onClick={() => onExitRef.current()}
            aria-label="Return to City"
            data-bathhouse-return
            className="min-h-[44px] min-w-[44px] px-4 rounded-2xl bg-neutral-950/85 border border-sky-600/50 text-sky-200 font-serif font-bold text-sm hover:bg-sky-500/20 flex items-center"
          >
            ← Return to City
          </button>
        </div>
        {/* Nearby-station prompt */}
        {nearStation && !talking && !poolId && (
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2 pointer-events-auto">
            <div className="bg-neutral-950/85 border border-sky-600/50 rounded-2xl px-4 py-2.5 flex items-center gap-3 max-w-[92vw]">
              <div className="min-w-0">
                <div className="font-serif font-bold text-sky-100 text-sm leading-tight">{nearStation.label}</div>
                <div className="text-[11px] text-neutral-400 font-mono truncate">{nearStation.hint}</div>
              </div>
              {nearStation.id === 'straton' && (
                <button
                  type="button"
                  onClick={startTalking}
                  className="min-h-[44px] px-4 rounded-xl bg-sky-600/90 hover:bg-sky-500 text-neutral-50 font-serif font-bold text-sm shrink-0"
                >
                  Talk
                </button>
              )}
              {nearStation.id !== 'straton' && (
                <button
                  type="button"
                  onClick={() => setPoolId(nearStation.id as 'tepidarium' | 'caldarium' | 'frigidarium')}
                  className="min-h-[44px] px-4 rounded-xl bg-sky-600/90 hover:bg-sky-500 text-neutral-50 font-serif font-bold text-sm shrink-0"
                >
                  Look
                </button>
              )}
            </div>
          </div>
        )}
        {/* Pool flavour card — looking is the whole interaction */}
        {poolStation && poolId && (
          <div className="absolute inset-x-3 bottom-24 sm:bottom-28 z-20 flex justify-center pointer-events-none">
            <div className="pointer-events-auto w-[min(94vw,30rem)] rounded-2xl border border-sky-600/50 bg-neutral-950/95 p-4 shadow-2xl">
              <div className="font-serif font-black text-sky-100">{poolStation.label}</div>
              <p className="mt-2 text-sm leading-relaxed text-neutral-200">{BATHHOUSE_POOL_LINES[poolId]}</p>
              <button
                type="button"
                onClick={() => setPoolId(null)}
                className="mt-3 w-full min-h-[44px] rounded-xl bg-sky-600/90 hover:bg-sky-500 text-neutral-50 font-serif font-bold text-sm"
              >
                Step back
              </button>
            </div>
          </div>
        )}
        {/* Straton dialogue */}
        {talking && (
          <div className="absolute inset-x-3 bottom-24 sm:bottom-28 z-20 flex justify-center pointer-events-none">
            <div className="pointer-events-auto w-[min(94vw,30rem)] rounded-2xl border border-sky-600/50 bg-neutral-950/95 p-4 shadow-2xl">
              <div className="font-serif font-black text-sky-100">Straton of Corinth</div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-sky-400/70">
                The bathkeeper
              </div>
              <p className="mt-2 text-sm leading-relaxed text-neutral-200">&ldquo;{stratonLine}&rdquo;</p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                {STRATON_BATH_TOPICS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setStratonLine(t.line)}
                    className="min-h-[44px] rounded-xl border border-sky-600/50 text-sky-200 hover:bg-sky-500/15 font-serif font-bold text-[13px] px-2"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={stopTalking}
                className="mt-2 w-full min-h-[44px] rounded-xl bg-sky-600/90 hover:bg-sky-500 text-neutral-50 font-serif font-bold text-sm"
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
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-neutral-950/60 border-2 border-sky-600/50 relative flex items-center justify-center"
          >
            <div className="absolute top-2 w-1.5 h-1.5 rounded-full bg-sky-500/50" />
            <div className="absolute bottom-2 w-1.5 h-1.5 rounded-full bg-sky-500/50" />
            <div className="absolute left-2 w-1.5 h-1.5 rounded-full bg-sky-500/50" />
            <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-sky-500/50" />
            <div
              className="w-10 h-10 rounded-full bg-gradient-to-b from-sky-500 to-sky-700 border-2 border-sky-300"
              style={{ transform: `translate(${knobPos.x}px, ${knobPos.y}px)` }}
            />
          </div>
          <div className="mt-1 text-center font-mono text-[10px] uppercase tracking-wider text-sky-300/80">
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
