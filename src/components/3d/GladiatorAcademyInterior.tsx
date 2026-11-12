/**
 * ACADEMY-INTERIOR — the Gladiator Ludus Academy, enterable.
 *
 * The elite school, a step above the training yard: a mosaic atrium, an
 * advanced training hall (mirrors, marked drill lanes), a trophy room
 * (champion gear on stands, laurel, busts) and the headmaster's office —
 * with Aulus Galerius Rufus, the Doctore, running it.
 *
 * What the Academy IS (canon: interior-designs.md §10, building-keepers.md
 * §2.9, Shops §1.8):
 * - The Intensive Course: +2 to one stat at 3x the yard session's price,
 *   gated at level 3+ (see utils/intensiveTraining.ts). The yard session
 *   itself is unchanged — this is the Academy's harder, dearer version, run
 *   on the same deterministic timetable (a drill resting today rests here too).
 * - Study champion techniques: the trophy room's station opens the Codex
 *   (the gladiators and bosses pages — the champions' ways), in-world.
 * - Talk to the headmaster: Rufus, read BY ID (he is NOT in
 *   SERVICE_BUILDING_KEEPERS — that map holds only buildings whose counter
 *   sells a service through a city panel; the Academy sells its course in
 *   the hall). His first-visit line at the Academy is the yard line for
 *   those below level 3, and names the hard course only to those who qualify.
 *
 * What the Academy is NOT: it invents no new currency, no new save field,
 * no new schedule. The Intensive writes gold, baseStats and the physique
 * record — all existing fields. §J is untouched.
 *
 * Pattern: BathhouseInterior (floor math, rig, HUD, dialogue) + ForgeInterior
 * (App wiring). The door panel is GladiatorAcademyDoorPanel; the hub branch
 * sits before the generic `tabKey` branch (the old `training` tabKey stays in
 * the hub data, the bounty precedent).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { applyDeadZone } from '../../utils/joystickDeadZone';
import { getKeeper } from '../../data/keepers';
import { TRAINING_ACTIONS } from '../../data/training';
import { isTrainingActionScheduled } from '../../utils/trainingSchedule';
import { canDebitGold } from '../../utils/goldTransactions';
import {
  INTENSIVE_LEVEL_MIN,
  intensiveCourseCost,
} from '../../utils/intensiveTraining';
import type { PhysicalTrainingStat } from '../../utils/physicalDevelopment';
import type { PlayerProfile } from '../../types/game';

/* ------------------------------------------------------------------ */
/* DOM-free academy math (mirrors BathhouseInterior — unit-testable).  */
/* ------------------------------------------------------------------ */

/** Half-extents of the walkable academy floor (rectangular clamp; v1 has no furniture collision). */
export const ACADEMY_FLOOR_HALF_X = 12;
export const ACADEMY_FLOOR_HALF_Z = 5;
/** Player spawn, just inside the academy door on the south wall (atrium). */
export const ACADEMY_SPAWN_X = -9;
export const ACADEMY_SPAWN_Z = 4.2;
/** Door/exit zone on the south wall — walking back through it returns to the city. */
export const ACADEMY_EXIT_MIN_Z = 4.9;
export const ACADEMY_EXIT_CENTER_X = -9;
export const ACADEMY_EXIT_HALF_WIDTH = 1.6;

/** Clamp a world position to the walkable academy floor. */
export function clampToAcademyFloor(x: number, z: number): [number, number] {
  return [
    Math.max(-ACADEMY_FLOOR_HALF_X, Math.min(ACADEMY_FLOOR_HALF_X, x)),
    Math.max(-ACADEMY_FLOOR_HALF_Z, Math.min(ACADEMY_FLOOR_HALF_Z, z)),
  ];
}

/** True when the player walks back through the academy door (south wall). */
export function isAcademyExit(x: number, z: number): boolean {
  return z >= ACADEMY_EXIT_MIN_Z && Math.abs(x - ACADEMY_EXIT_CENTER_X) <= ACADEMY_EXIT_HALF_WIDTH;
}

/* ------------------------------------------------------------------ */
/* Stations + Rufus dialogue (DOM-free, unit-testable).                */
/* ------------------------------------------------------------------ */

export type AcademyStationId = 'atrium' | 'intensive' | 'techniques' | 'rufus';

export interface AcademyStation {
  id: AcademyStationId;
  label: string;
  hint: string;
  x: number;
  z: number;
  radius: number;
}

export const ACADEMY_STATIONS: AcademyStation[] = [
  { id: 'atrium', label: 'The Mosaic Atrium', hint: 'The champions\u2019 floor — look', x: -9, z: -2.5, radius: 2.0 },
  { id: 'intensive', label: 'The Intensive Course', hint: 'Rufus\u2019s hard course — +2, three times the price', x: 0, z: -0.5, radius: 2.2 },
  { id: 'techniques', label: 'Champion Techniques', hint: 'Study the champions\u2019 ways — the Codex', x: 6, z: -0.5, radius: 2.0 },
  { id: 'rufus', label: 'Aulus Galerius Rufus', hint: 'The Doctore — talk', x: 10, z: 2.0, radius: 2.3 },
];

/** Nearest station within its interaction radius, or null on open floor. */
export function nearestAcademyStation(x: number, z: number): AcademyStation | null {
  let best: AcademyStation | null = null;
  let bestD = Infinity;
  for (const s of ACADEMY_STATIONS) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d <= s.radius && d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Rufus — read by id, never primed.                                  */
/* ------------------------------------------------------------------ */

/**
 * Aulus Galerius Rufus is NOT in SERVICE_BUILDING_KEEPERS (that map holds
 * only buildings whose counter sells a service through a city panel), so
 * `primeKeeperGreeting('gladiator_academy')` would prime nothing and
 * `getKeeperForBuilding('gladiator_academy')` returns undefined. The
 * interior reads him BY ID, with verbatim fallbacks taken from the registry.
 */
const RUFUS_ID = 'aulus_galerius_rufus';
const RUFUS_YARD_FIRST_VISIT =
  "I am Rufus. I don't train names I expect to bury — so we will learn what you are. A session costs 25 times your level, and buys one point of strength, speed, or staying power.";
const RUFUS_REPEAT =
  'Again. The sand remembers your feet better than your head remembers my lessons.';

export function rufusFirstVisitLine(): string {
  return getKeeper(RUFUS_ID)?.firstVisitLine ?? RUFUS_YARD_FIRST_VISIT;
}

export function rufusRepeatLine(): string {
  return getKeeper(RUFUS_ID)?.repeatLines?.[0] ?? RUFUS_REPEAT;
}

/**
 * The Academy first-visit line, level-gated (§2.9): below level 3 Rufus
 * speaks the yard line — he names the hard course only to those who
 * qualify. At level 3+ the variant names it.
 */
export const RUFUS_ACADEMY_FIRST_VISIT_QUALIFIED =
  "I am Rufus. I don't train names I expect to bury — so we will learn what you are. A session costs 25 times your level, and buys one point of strength, speed, or staying power. You have earned the hard course: three times the price, twice the gain. Choose your drill.";

export function rufusAcademyFirstVisitLine(level: number): string {
  return level >= INTENSIVE_LEVEL_MIN ? RUFUS_ACADEMY_FIRST_VISIT_QUALIFIED : rufusFirstVisitLine();
}

export type RufusTopicId = 'course' | 'yard' | 'champions';

export const RUFUS_TOPICS: { id: RufusTopicId; label: string; line: string }[] = [
  {
    id: 'course',
    label: 'Ask about the Intensive Course',
    line: 'Three times the price, twice the gain, and only for gladiators who have bled three levels\u2019 worth. The hall does not forgive soft hands — that is the point.',
  },
  {
    id: 'yard',
    label: 'Ask about the yard',
    line: 'The yard is where you learn not to die. The hall is where you learn to win. Same sand, different lesson.',
  },
  {
    id: 'champions',
    label: 'Ask about the champions',
    line: 'The gear on those stands belonged to men who won. Study how they stood, not how they fell — the Codex keeps their ways, and my hall keeps their steel.',
  },
];

export const ATRIUM_LOOK_LINE =
  'A mosaic of champions under your feet — a murmillo, a retiarius, a secutor, each caught mid-stance in terracotta, cream and navy. Rufus makes every recruit cross it on the way in. "Walk where winners walked," he says, "or do not walk at all."';

/* ------------------------------------------------------------------ */
/* Materials + the mosaic.                                             */
/* ------------------------------------------------------------------ */

const MARBLE = '#d9d4c8';
const MARBLE_DARK = '#8d8578';
const BRONZE = '#b45309';
const GOLD = '#d4af37';
const WOOD = '#7c4a21';
const WOOD_DARK = '#5d3416';
const WALL = '#cbb89a';
const WALL_DARK = '#a08b6d';

/**
 * The atrium mosaic, drawn once on a canvas (offline-safe, no asset): a
 * terracotta field, a cream border, and navy diamonds — the champions'
 * floor the design asks for. Repeats 3x2 across the atrium.
 */
export function makeMosaicTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b45309';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#f5f5f4';
  g.lineWidth = 6;
  g.strokeRect(10, 10, 236, 236);
  g.strokeStyle = '#1e3a8a';
  g.lineWidth = 3;
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      const cx = 48 + i * 56;
      const cy = 48 + j * 56;
      g.beginPath();
      g.moveTo(cx, cy - 16);
      g.lineTo(cx + 16, cy);
      g.lineTo(cx, cy + 16);
      g.lineTo(cx - 16, cy);
      g.closePath();
      g.stroke();
    }
  }
  g.fillStyle = '#f5f5f4';
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      g.beginPath();
      g.arc(48 + i * 56, 48 + j * 56, 4, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------------ */
/* Shell — floor, walls, partitions, beams.                            */
/* ------------------------------------------------------------------ */

/**
 * Four rooms in a row: atrium [-12,-6], training hall [-6,4], trophy room
 * [4,8], office [8,12]. Partitions at x = -6 / 4 / 8 with open doorways
 * (z -1.1..1.1) and a lintel above each.
 */
function AcademyShell() {
  const mosaic = useMemo(() => makeMosaicTexture(), []);
  return (
    <group>
      {/* Marble floor, the whole academy */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[24, 10]} />
        <meshStandardMaterial color={MARBLE} roughness={0.85} />
      </mesh>
      {/* The mosaic, laid over the atrium floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-9, 0.02, 0]} receiveShadow>
        <planeGeometry args={[6, 10]} />
        <meshStandardMaterial map={mosaic} roughness={0.8} />
      </mesh>
      {/* Perimeter walls — the south wall leaves the door gap at x -10.6..-7.4 */}
      <mesh position={[0, 1.6, -5]} castShadow>
        <boxGeometry args={[24.4, 3.2, 0.4]} />
        <meshStandardMaterial color={WALL} roughness={0.95} />
      </mesh>
      <mesh position={[-12, 1.6, 0]}>
        <boxGeometry args={[0.4, 3.2, 10.4]} />
        <meshStandardMaterial color={WALL} roughness={0.95} />
      </mesh>
      <mesh position={[12, 1.6, 0]}>
        <boxGeometry args={[0.4, 3.2, 10.4]} />
        <meshStandardMaterial color={WALL} roughness={0.95} />
      </mesh>
      <mesh position={[-11.3, 1.6, 5]} castShadow>
        <boxGeometry args={[1.4, 3.2, 0.4]} />
        <meshStandardMaterial color={WALL} roughness={0.95} />
      </mesh>
      <mesh position={[2.3, 1.6, 5]} castShadow>
        <boxGeometry args={[19.4, 3.2, 0.4]} />
        <meshStandardMaterial color={WALL} roughness={0.95} />
      </mesh>
      <mesh position={[-9, 2.9, 5]}>
        <boxGeometry args={[3.2, 0.6, 0.4]} />
        <meshStandardMaterial color={WALL_DARK} roughness={0.95} />
      </mesh>
      {/* Partitions at x = -6 / 4 / 8 — two segments + a lintel over the doorway */}
      {[-6, 4, 8].map((x) => (
        <group key={x}>
          <mesh position={[x, 1.6, -3.05]} castShadow>
            <boxGeometry args={[0.5, 3.2, 3.9]} />
            <meshStandardMaterial color={WALL} roughness={0.95} />
          </mesh>
          <mesh position={[x, 1.6, 3.05]} castShadow>
            <boxGeometry args={[0.5, 3.2, 3.9]} />
            <meshStandardMaterial color={WALL} roughness={0.95} />
          </mesh>
          <mesh position={[x, 2.75, 0]}>
            <boxGeometry args={[0.5, 0.9, 2.2]} />
            <meshStandardMaterial color={WALL_DARK} roughness={0.95} />
          </mesh>
        </group>
      ))}
      {/* Ceiling beams across the hall */}
      {[-9, -3, 3, 9].map((x) => (
        <mesh key={x} position={[x, 3.3, 0]}>
          <boxGeometry args={[0.35, 0.3, 10]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** A polished-bronze mirror on the hall's north wall (a bright plane — the design's mirrors, not a real reflection). */
function Mirror({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <boxGeometry args={[1.4, 2.4, 0.08]} />
      <meshStandardMaterial color="#e5e7eb" metalness={1} roughness={0.08} />
    </mesh>
  );
}

/** Marked drill lanes on the hall floor — thin dark lines the recruits run. */
function DrillLanes() {
  return (
    <group>
      {[-2, 0, 2].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.03, 0]}>
          <planeGeometry args={[0.18, 8]} />
          <meshStandardMaterial color="#44403c" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/** A training dummy — post, torso, head, arms — for the hall. */
function TrainingDummy({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.12, 1.8, 8]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[0.32, 0.38, 0.7, 10]} />
        <meshStandardMaterial color="#a8a29e" roughness={1} />
      </mesh>
      <mesh position={[0, 2.05, 0]}>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshStandardMaterial color="#d6d3d1" roughness={1} />
      </mesh>
      <mesh position={[0, 1.65, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.07, 0.07, 0.9, 8]} />
        <meshStandardMaterial color={WOOD} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** A champion's gear stand — pedestal, sword and shield — in the trophy room. */
function GearStand({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.35, 0.45, 1, 12]} />
        <meshStandardMaterial color={MARBLE_DARK} roughness={0.85} />
      </mesh>
      <mesh position={[0, 1.35, 0]} castShadow>
        <boxGeometry args={[0.1, 0.9, 0.04]} />
        <meshStandardMaterial color={BRONZE} metalness={0.8} roughness={0.35} />
      </mesh>
      <mesh position={[0, 1.75, 0]}>
        <boxGeometry args={[0.3, 0.08, 0.06]} />
        <meshStandardMaterial color={GOLD} metalness={0.8} roughness={0.35} />
      </mesh>
      <mesh position={[0.35, 1.2, 0]} rotation={[0, 0, 0.3]}>
        <cylinderGeometry args={[0.28, 0.28, 0.06, 16]} />
        <meshStandardMaterial color={BRONZE} metalness={0.8} roughness={0.35} />
      </mesh>
    </group>
  );
}

/** A laurel wreath on the trophy room's wall — gold, the champions' prize. */
function LaurelWreath({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position} rotation={[0, 0, 0]}>
      <torusGeometry args={[0.5, 0.09, 10, 24]} />
      <meshStandardMaterial color={GOLD} metalness={0.9} roughness={0.3} />
    </mesh>
  );
}

/** A champion bust — head on a pedestal — in the trophy room. */
function Bust({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.32, 0.9, 10]} />
        <meshStandardMaterial color={MARBLE_DARK} roughness={0.85} />
      </mesh>
      <mesh position={[0, 1.15, 0]} castShadow>
        <sphereGeometry args={[0.22, 14, 14]} />
        <meshStandardMaterial color="#c9a07a" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.32, 0]}>
        <sphereGeometry args={[0.16, 10, 10]} />
        <meshStandardMaterial color={GOLD} metalness={0.7} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** Rufus's desk in the office — scarred wood, scrolls on top, a stool beside it. */
function OfficeDesk({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.75, 0]} castShadow>
        <boxGeometry args={[2, 0.12, 0.9]} />
        <meshStandardMaterial color={WOOD} roughness={0.85} />
      </mesh>
      {[
        [-0.85, -0.35],
        [0.85, -0.35],
        [-0.85, 0.35],
        [0.85, 0.35],
      ].map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, 0.35, z]}>
          <boxGeometry args={[0.12, 0.7, 0.12]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.9} />
        </mesh>
      ))}
      {/* Scrolls on the desk */}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-0.5 + i * 0.45, 0.86, 0.1]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.06, 0.5, 8]} />
          <meshStandardMaterial color="#e7d8b8" roughness={1} />
        </mesh>
      ))}
      <mesh position={[1.6, 0.4, 0.4]}>
        <boxGeometry args={[0.5, 0.8, 0.5]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** An unnamed trainee — flavour only, no name, no dialogue, no station. */
function TraineeFigure({
  position,
  rotationY = 0,
}: {
  position: [number, number, number];
  rotationY?: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.75, 0]} castShadow>
        <capsuleGeometry args={[0.3, 0.5, 6, 12]} />
        <meshStandardMaterial color="#7c2d12" roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.45, 0]}>
        <sphereGeometry args={[0.2, 14, 14]} />
        <meshStandardMaterial color="#c9a07a" roughness={0.8} />
      </mesh>
      {/* Wooden practice sword held at the side */}
      <mesh position={[0.45, 0.9, 0.1]} rotation={[0, 0, 0.2]}>
        <boxGeometry args={[0.08, 0.9, 0.04]} />
        <meshStandardMaterial color={WOOD} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Aulus Galerius Rufus, the Doctore — grey cropped close, a chest like a barrel gone slightly to seed, a practice rudis worn glass-smooth carried the way other men carry a stylus. */
function RufusNPC({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
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
      {/* Barrel chest, gone slightly to seed */}
      <mesh position={[0, 0.95, 0]} castShadow scale={[1.22, 1, 0.95]}>
        <sphereGeometry args={[0.42, 16, 16]} />
        <meshStandardMaterial color="#6b4a2f" roughness={0.9} />
      </mesh>
      {/* Arms */}
      <mesh position={[-0.5, 1.05, 0.05]} rotation={[0, 0, 0.25]}>
        <cylinderGeometry args={[0.09, 0.08, 0.6, 8]} />
        <meshStandardMaterial color="#b98a5e" roughness={0.8} />
      </mesh>
      <mesh position={[0.5, 1.05, 0.05]} rotation={[0, 0, -0.25]}>
        <cylinderGeometry args={[0.09, 0.08, 0.6, 8]} />
        <meshStandardMaterial color="#b98a5e" roughness={0.8} />
      </mesh>
      {/* The practice rudis, worn glass-smooth, in his right hand */}
      <mesh position={[0.55, 0.85, 0.15]} rotation={[0.15, 0, -0.15]}>
        <boxGeometry args={[0.09, 1.1, 0.04]} />
        <meshStandardMaterial color="#a16207" roughness={0.6} />
      </mesh>
      {/* Head — grey cropped close */}
      <mesh position={[0, 1.62, 0]} castShadow>
        <sphereGeometry args={[0.21, 14, 14]} />
        <meshStandardMaterial color="#b98a5e" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.76, 0]}>
        <sphereGeometry args={[0.15, 10, 10]} />
        <meshStandardMaterial color="#9ca3af" roughness={1} />
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
/* Player rig — camera-relative movement, academy-floor clamp, door exit. */
/* ------------------------------------------------------------------ */

interface AcademyPlayerRigProps {
  onExitRef: React.MutableRefObject<() => void>;
  keysRef: React.MutableRefObject<Record<string, boolean>>;
  stickRef: React.MutableRefObject<{ x: number; y: number }>;
  onPosition: (x: number, z: number) => void;
}

function AcademyPlayerRig({ onExitRef, keysRef, stickRef, onPosition }: AcademyPlayerRigProps) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const pos = useRef<[number, number]>([ACADEMY_SPAWN_X, ACADEMY_SPAWN_Z]);
  const yaw = useRef(Math.PI);
  const camYaw = useRef(0);
  const exited = useRef(false);
  const bob = useRef(0);

  useFrame(({ camera }, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const keys = keysRef.current;
    const stick = stickRef.current;
    let kx = 0;
    let kz = 0;
    if (keys['KeyW'] || keys['ArrowUp']) kz -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) kz += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) kx -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) kx += 1;
    const joystick = applyDeadZone(stick.x, stick.y);
    let mx = kx + joystick.x;
    let mz = kz + joystick.z;
    const mLen = Math.hypot(mx, mz);
    if (mLen > 1) {
      mx /= mLen;
      mz /= mLen;
    }
    const speed = 5.2;
    const cy = camYaw.current;
    const fx = Math.sin(cy);
    const fz = Math.cos(cy);
    const rx = -Math.cos(cy);
    const rz = Math.sin(cy);
    const wx = mx * rx - mz * fx;
    const wz = mx * rz - mz * fz;
    let px = pos.current[0] + wx * speed * delta;
    let pz = pos.current[1] + wz * speed * delta;
    [px, pz] = clampToAcademyFloor(px, pz);
    pos.current = [px, pz];
    onPosition(px, pz);
    if (!exited.current && isAcademyExit(px, pz)) {
      exited.current = true;
      onExitRef.current();
      return;
    }
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
    const desired = new THREE.Vector3(px - Math.sin(cy) * 8, 6.4, pz - Math.cos(cy) * 8);
    camera.position.lerp(desired, 1 - Math.exp(-5 * delta));
    camera.lookAt(px, 1.1, pz);
  });

  return (
    <group ref={group} position={[ACADEMY_SPAWN_X, 0, ACADEMY_SPAWN_Z]}>
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

interface GladiatorAcademyInteriorProps {
  /** Called when the player taps "Return to City" or walks back through the door. */
  onExit: () => void;
  /** The live profile — the course panel reads gold, level and stats from it. Null while loading. */
  profile: PlayerProfile | null;
  /**
   * Run one Intensive Course for a stat. App performs the transaction
   * (the module's pure check, then the time step and the one save) and
   * returns the line Rufus speaks — success or refusal — for the panel.
   */
  onTrainIntensive: (stat: PhysicalTrainingStat) => string;
  /** Open the Codex (the champions' ways) — App closes the overlay and opens the library's Codex page. */
  onOpenCodex: () => void;
  /** Record the keeper's first-visit line (K1 pattern). */
  onRecordKeeperVisit?: (keeperId: string) => void;
  /**
   * Open with Rufus's dialogue already up (the door panel's "See Rufus"
   * action). The player spawns in the atrium, so the conversation opens
   * over his office — the walk to him is the first lesson.
   */
  startWithTalk?: boolean;
}

export function GladiatorAcademyInterior({
  onExit,
  profile,
  onTrainIntensive,
  onOpenCodex,
  onRecordKeeperVisit,
  startWithTalk,
}: GladiatorAcademyInteriorProps) {
  const onExitRef = useRef(onExit);
  const onTrainIntensiveRef = useRef(onTrainIntensive);
  const onOpenCodexRef = useRef(onOpenCodex);
  const onRecordKeeperVisitRef = useRef(onRecordKeeperVisit);
  useEffect(() => {
    onExitRef.current = onExit;
    onTrainIntensiveRef.current = onTrainIntensive;
    onOpenCodexRef.current = onOpenCodex;
    onRecordKeeperVisitRef.current = onRecordKeeperVisit;
  });

  const keysPressed = useRef<Record<string, boolean>>({});
  const stickRef = useRef({ x: 0, y: 0 });
  const playerPosRef = useRef({ x: ACADEMY_SPAWN_X, z: ACADEMY_SPAWN_Z });
  const nearStationRef = useRef<AcademyStation | null>(null);
  const talkingRef = useRef(false);
  const metRufusRef = useRef(false);
  const talkOpenedRef = useRef(false);
  const [nearStation, setNearStation] = useState<AcademyStation | null>(null);
  const [talking, setTalking] = useState(false);
  const [rufusLine, setRufusLine] = useState<string>(RUFUS_YARD_FIRST_VISIT);
  const [courseOpen, setCourseOpen] = useState(false);
  const [courseResult, setCourseResult] = useState<string | null>(null);
  const [atriumCard, setAtriumCard] = useState(false);

  // Proximity polling (cheap: 5 Hz) — drives the station prompt.
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = nearestAcademyStation(playerPosRef.current.x, playerPosRef.current.z);
      if (s?.id !== nearStationRef.current?.id) {
        nearStationRef.current = s;
        setNearStation(s);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  const startTalking = () => {
    if (!metRufusRef.current) {
      metRufusRef.current = true;
      // The first-visit line is level-gated: below level 3 Rufus speaks the
      // yard line; at 3+ he names the hard course. The repeat line is the
      // registry's, never re-taught.
      setRufusLine(rufusAcademyFirstVisitLine(profile?.level ?? 1));
      onRecordKeeperVisitRef.current?.('aulus_galerius_rufus');
    } else {
      setRufusLine(rufusRepeatLine());
    }
    talkingRef.current = true;
    setTalking(true);
  };

  const stopTalking = () => {
    talkingRef.current = false;
    setTalking(false);
  };

  // "See Rufus" — the door panel's second action opens the conversation on arrival.
  useEffect(() => {
    if (startWithTalk && !talkOpenedRef.current) {
      talkOpenedRef.current = true;
      startTalking();
    }
    // Runs once on mount; startTalking reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCourse = () => {
    setCourseResult(null);
    setCourseOpen(true);
  };

  const trainStat = (stat: PhysicalTrainingStat) => {
    const line = onTrainIntensiveRef.current(stat);
    setCourseResult(line);
  };

  const interactWithStation = () => {
    const s = nearStationRef.current;
    if (!s || talkingRef.current || courseOpen || atriumCard) return;
    if (s.id === 'rufus') startTalking();
    else if (s.id === 'intensive') openCourse();
    else if (s.id === 'techniques') onOpenCodexRef.current();
    else setAtriumCard(true);
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

  // The course panel, from the live profile (read-only here — App owns the transaction).
  const level = profile?.level ?? 1;
  const qualified = level >= INTENSIVE_LEVEL_MIN;
  const courseCost = profile ? intensiveCourseCost(profile) : 0;
  // The yard session's price, derived from the course's — the interior reads
  // ONE price helper (the course's) and never reaches past the module.
  const sessionCost = courseCost / 3;

  return (
    <div
      className="fixed inset-0 z-[95] bg-neutral-950 overflow-hidden select-none"
      role="dialog"
      aria-modal="true"
      aria-label="The Gladiator Ludus Academy"
    >
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [ACADEMY_SPAWN_X, 6.4, ACADEMY_SPAWN_Z + 8], fov: 55, near: 0.1, far: 120 }}
        gl={{ antialias: false, powerPreference: 'low-power' }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.1;
        }}
      >
        <color attach="background" args={['#171310']} />
        <fog attach="fog" args={['#171310', 45, 110]} />
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
        {/* Room lighting — warm atrium, bright hall, lamplight in the office */}
        <pointLight position={[-9, 2.6, 0]} color="#fde68a" intensity={0.8} distance={11} decay={1.7} />
        <pointLight position={[-1, 2.6, 0]} color="#f5f5f4" intensity={1.0} distance={14} decay={1.7} />
        <pointLight position={[6, 2.6, 0]} color="#fbbf24" intensity={0.7} distance={10} decay={1.7} />
        <pointLight position={[10, 2.6, -1]} color="#fbbf24" intensity={0.9} distance={10} decay={1.7} />
        <AcademyShell />
        <DrillLanes />
        <Mirror position={[-4, 1.4, -4.7]} />
        <Mirror position={[2, 1.4, -4.7]} />
        <TrainingDummy position={[-3, 0, -2.5]} rotationY={Math.PI} />
        <TrainingDummy position={[3, 0, -2.5]} rotationY={Math.PI} />
        <GearStand position={[5.2, 0, -3.5]} rotationY={Math.PI / 6} />
        <GearStand position={[6.8, 0, -3.5]} rotationY={-Math.PI / 6} />
        <GearStand position={[6, 0, 3.5]} rotationY={Math.PI} />
        <LaurelWreath position={[6, 2.2, -4.75]} />
        <Bust position={[4.8, 0, 3.8]} />
        <Bust position={[7.2, 0, 3.8]} />
        <OfficeDesk position={[10, 0, -2.5]} />
        <TraineeFigure position={[2, 0, 1.5]} rotationY={Math.PI} />
        <TraineeFigure position={[-3, 0, 2.0]} rotationY={Math.PI} />
        <RufusNPC position={[10, 0, 2.0]} rotationY={Math.PI} />
        <AcademyPlayerRig
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
          <div className="bg-neutral-950/85 border border-red-600/50 rounded-2xl px-4 py-2 text-center">
            <div className="font-serif font-black text-red-100 text-sm tracking-wide">Gladiator Ludus Academy</div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-red-400/80">
              Aulus Galerius Rufus · the Doctore
            </div>
          </div>
        </div>
        <div className="absolute top-3 left-3 pointer-events-auto">
          <button
            type="button"
            onClick={() => onExitRef.current()}
            aria-label="Return to City"
            data-academy-return
            className="min-h-[44px] min-w-[44px] px-4 rounded-2xl bg-neutral-950/85 border border-red-600/50 text-red-200 font-serif font-bold text-sm hover:bg-red-500/20 flex items-center"
          >
            ← Return to City
          </button>
        </div>

        {/* Station prompt */}
        {nearStation && !talking && !courseOpen && !atriumCard && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-auto">
            <button
              type="button"
              onClick={() => interactRef.current()}
              className="min-h-[44px] px-5 rounded-2xl bg-red-600 text-neutral-950 font-serif font-black text-sm uppercase tracking-wider shadow-lg hover:bg-red-500"
            >
              {nearStation.id === 'techniques' ? 'Study' : nearStation.id === 'rufus' ? 'Talk' : nearStation.id === 'intensive' ? 'Train' : 'Look'}
              {' — '}
              {nearStation.label}
            </button>
            <div className="text-center text-[11px] font-serif text-neutral-300 mt-1">{nearStation.hint}</div>
          </div>
        )}

        {/* Rufus dialogue */}
        {talking && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-[min(92vw,560px)] pointer-events-auto">
            <div className="bg-neutral-950/90 border border-red-600/50 rounded-2xl p-4 shadow-xl">
              <div className="font-serif font-black text-red-100 text-base">Aulus Galerius Rufus</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-red-400/80 mb-2">
                the Doctore · Gladiator Academy
              </div>
              <p className="text-sm font-serif text-neutral-200 leading-relaxed mb-3">{rufusLine}</p>
              <div className="flex flex-col gap-2">
                {RUFUS_TOPICS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setRufusLine(t.line)}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-neutral-900 border border-red-700/40 text-left text-sm font-serif text-red-100 hover:bg-red-500/10"
                  >
                    {t.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    stopTalking();
                    openCourse();
                  }}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-red-600 text-neutral-950 font-serif font-black text-sm uppercase tracking-wider hover:bg-red-500"
                >
                  The Intensive Course
                </button>
                <button
                  type="button"
                  onClick={stopTalking}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-sm font-serif text-neutral-300 hover:bg-neutral-800"
                >
                  Farewell
                </button>
              </div>
            </div>
          </div>
        )}

        {/* The Intensive Course panel */}
        {courseOpen && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-[min(92vw,560px)] pointer-events-auto">
            <div className="bg-neutral-950/90 border border-red-600/50 rounded-2xl p-4 shadow-xl">
              <div className="font-serif font-black text-red-100 text-base">The Intensive Course</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-red-400/80 mb-2">
                Three times the price, twice the gain — {courseCost} gold a session
              </div>
              {!profile && (
                <p className="text-sm font-serif text-neutral-300 mb-3">Rufus waits for your record to catch up.</p>
              )}
              {profile && !qualified && (
                <p className="text-sm font-serif text-neutral-200 leading-relaxed mb-3">
                  Rufus shakes his head. &ldquo;Three levels of blood first. The hard course is not for
                  beginners.&rdquo; The course opens at level 3 — you are level {level}. The yard session
                  ({sessionCost} gold, +1) is open to you as ever.
                </p>
              )}
              {profile && qualified && (
                <div className="flex flex-col gap-2 mb-3">
                  {TRAINING_ACTIONS.map((action) => {
                    const stat = action.id as PhysicalTrainingStat;
                    const scheduled = isTrainingActionScheduled(profile, stat);
                    const affordable = canDebitGold(profile.gold, courseCost);
                    const disabled = !scheduled || !affordable;
                    const label = !scheduled
                      ? 'Resting today'
                      : !affordable
                        ? `Need ${courseCost} gold`
                        : `Train +2 — ${courseCost} gold`;
                    return (
                      <div
                        key={action.id}
                        className="p-3 rounded-xl bg-neutral-900 border border-red-700/40 flex flex-col gap-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-serif font-bold text-sm text-red-100">{action.name}</span>
                          <span className="text-xs font-mono text-neutral-400">
                            {stat.toUpperCase()} {profile.baseStats[stat]}
                          </span>
                        </div>
                        <p className="text-xs font-serif text-neutral-400">{action.description}</p>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => trainStat(stat)}
                          className="min-h-[44px] px-3 py-2 rounded-xl bg-red-600 text-neutral-950 font-serif font-black text-xs sm:text-sm uppercase tracking-wider hover:bg-red-500 disabled:opacity-40"
                        >
                          {label}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {courseResult && (
                <p className="text-sm font-serif text-amber-200 leading-relaxed mb-3">{courseResult}</p>
              )}
              <button
                type="button"
                onClick={() => setCourseOpen(false)}
                className="min-h-[44px] w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-sm font-serif text-neutral-300 hover:bg-neutral-800"
              >
                Step back
              </button>
            </div>
          </div>
        )}

        {/* The atrium card */}
        {atriumCard && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-[min(92vw,560px)] pointer-events-auto">
            <div className="bg-neutral-950/90 border border-red-600/50 rounded-2xl p-4 shadow-xl">
              <div className="font-serif font-black text-red-100 text-base">The Mosaic Atrium</div>
              <p className="text-sm font-serif text-neutral-200 leading-relaxed mb-3 mt-1">{ATRIUM_LOOK_LINE}</p>
              <button
                type="button"
                onClick={() => setAtriumCard(false)}
                className="min-h-[44px] w-full px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-sm font-serif text-neutral-300 hover:bg-neutral-800"
              >
                Step back
              </button>
            </div>
          </div>
        )}

        {/* Hint bar */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 hidden sm:block">
          <div className="text-[11px] font-mono text-neutral-400 bg-neutral-950/70 rounded-full px-3 py-1">
            WASD / arrows to walk · E to use a station · walk back through the south door to leave
          </div>
        </div>

        {/* Joystick (touch) */}
        <div
          ref={joystickRef}
          className="pointer-events-auto absolute bottom-6 left-4 w-28 h-28 rounded-full bg-neutral-950/60 border border-red-600/40 touch-none"
          onTouchStart={handleJoystickTouchStart}
          onTouchMove={handleJoystickTouchMove}
          onTouchEnd={handleJoystickTouchEnd}
          onTouchCancel={handleJoystickTouchEnd}
        >
          <div
            className="absolute w-12 h-12 rounded-full bg-red-500/70 border border-red-300/60"
            style={{
              left: `calc(50% - 24px + ${knobPos.x}px)`,
              top: `calc(50% - 24px + ${knobPos.y}px)`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
