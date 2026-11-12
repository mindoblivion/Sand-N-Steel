import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { applyDeadZone } from '../../utils/joystickDeadZone';

/* ------------------------------------------------------------------ */
/* DOM-free bounty hall math (mirrors ForgeInterior — unit-testable).   */
/* ------------------------------------------------------------------ */

/** Half-extents of the walkable hall floor (rectangular clamp; v1 has no furniture collision). */
export const BOUNTY_HALL_FLOOR_HALF_X = 9;
export const BOUNTY_HALL_FLOOR_HALF_Z = 6;
/** Player spawn, just inside the hall door on the south wall. */
export const BOUNTY_HALL_SPAWN_X = 0;
export const BOUNTY_HALL_SPAWN_Z = 4.2;
/** Door/exit zone on the south wall — walking back through it returns to the city. */
export const BOUNTY_HALL_EXIT_MIN_Z = 4.9;
export const BOUNTY_HALL_EXIT_HALF_WIDTH = 1.6;

/** Clamp a world position to the walkable hall floor. */
export function clampToBountyHallFloor(x: number, z: number): [number, number] {
  return [
    Math.max(-BOUNTY_HALL_FLOOR_HALF_X, Math.min(BOUNTY_HALL_FLOOR_HALF_X, x)),
    Math.max(-BOUNTY_HALL_FLOOR_HALF_Z, Math.min(BOUNTY_HALL_FLOOR_HALF_Z, z)),
  ];
}

/** True when the player walks back through the hall door (south wall). */
export function isBountyHallExit(x: number, z: number): boolean {
  return z >= BOUNTY_HALL_EXIT_MIN_Z && Math.abs(x) <= BOUNTY_HALL_EXIT_HALF_WIDTH;
}

/* ------------------------------------------------------------------ */
/* Stations + Scribonia dialogue (DOM-free, unit-testable).            */
/* ------------------------------------------------------------------ */

export type BountyHallStationId = 'board' | 'acta' | 'scribonia' | 'redlist' | 'backroom';

export interface BountyHallStation {
  id: BountyHallStationId;
  label: string;
  hint: string;
  x: number;
  z: number;
  radius: number;
}

export const BOUNTY_HALL_STATIONS: BountyHallStation[] = [
  { id: 'board', label: 'The Contract Board', hint: 'Five postings, paid to the copper', x: -5.5, z: -3.5, radius: 2.4 },
  { id: 'acta', label: "Cornelius Felix's Acta", hint: 'Three fresh deeds every morning', x: 5.5, z: -3.5, radius: 2.4 },
  { id: 'scribonia', label: 'Scribonia, the Ledger', hint: 'Clerk of the board, at the paymaster\u2019s cage', x: 6.5, z: 0.8, radius: 2.3 },
  { id: 'redlist', label: 'The Red List', hint: 'High-danger targets — ask Scribonia', x: 0, z: -4.6, radius: 2.2 },
  { id: 'backroom', label: 'The Back Room', hint: 'High-tier contracts — locked for now', x: -6.8, z: -2.0, radius: 2.2 },
];

/**
 * The board wall's names — AUTHORED data (src/data/bountyBoard.ts, STORY-4b),
 * not invented. The five postings in rung order, plus the Deserter's final entry.
 * The 3D board renders these on canvas-texture plates (the interior-designs
 * pattern); the panel itself lists them with prices and twists.
 */
export const BOUNTY_HALL_BOARD_NAMES: Array<{ name: string; lines: [string, string] }> = [
  { name: 'Decimus the Rampart', lines: ['Decimus the', 'Rampart'] },
  { name: 'Sextus Sinister', lines: ['Sextus', 'Sinister'] },
  { name: 'Gaius the Ironclad', lines: ['Gaius the', 'Ironclad'] },
  { name: "Publius the Crowd's Darling", lines: ['Publius the', "Crowd's Darling"] },
  { name: 'Manius the Unscarred', lines: ['Manius the', 'Unscarred'] },
];
export const BOUNTY_HALL_DESERTER_NAME = 'Lucius Cassius, called the Oathbreaker';
export const BOUNTY_HALL_DESERTER_LINES: [string, string] = ['Lucius Cassius', 'the Oathbreaker'];

/** Nearest station within its interaction radius, or null on open floor. */
export function nearestBountyHallStation(x: number, z: number): BountyHallStation | null {
  let best: BountyHallStation | null = null;
  let bestD = Infinity;
  for (const s of BOUNTY_HALL_STATIONS) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d <= s.radius && d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/**
 * Scribonia, called "the Ledger" — first-visit greeting inside the hall.
 * Verbatim from the keeper registry (src/data/keepers.ts, id 'scribonia'):
 * the board panel prints the same line, so the hall and the board agree.
 */
export const SCRIBONIA_HALL_FIRST_VISIT =
  "Read the board; sign nothing you haven't read twice. Five names, five purses — the deserter last, and he pays best taken alive.";

/** Scribonia — repeat line, verbatim from the keeper registry (id 'scribonia'). */
export const SCRIBONIA_HALL_REPEAT =
  'Paid to the copper, as always. The board has a new name, if your sword is bored.';

/** Scribonia — conversation topics: the board, the Deserter, how payment works. */
export const SCRIBONIA_HALL_TOPICS = [
  {
    id: 'board',
    label: 'Ask about the board',
    line: 'Five postings stand at a time. Clear one and the next goes up — the board never sits empty while there are men willing to bleed for coin.',
  },
  {
    id: 'deserter',
    label: 'Ask about the Deserter',
    line: 'The name under the board is a brother of the ludus who broke the sacramentum and runs the northern road with deserters. Taken alive he pays best. Killed outright, he pays less — and I will know the difference.',
  },
  {
    id: 'pay',
    label: 'Ask how payment works',
    line: 'The board pays to the copper, whatever god you keep. A victory that misses the printed rule keeps the ordinary purse and leaves the posting up — so read the twist before you sign.',
  },
] as const;

/* ------------------------------------------------------------------ */
/* 3D set dressing — emissive materials + point lights only (mobile).  */
/* ------------------------------------------------------------------ */

const STONE = '#57534e';
const STONE_DARK = '#44403c';
const TIMBER = '#854d0e';
const TIMBER_DARK = '#451a03';
const PARCHMENT = '#fef08a';
const PARCHMENT_DIM = '#e7d98a';
const ROSE = '#991b1b';

function BountyHallShell() {
  return (
    <group>
      {/* Floor: worn stone flags */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[20, 14]} />
        <meshStandardMaterial color="#2e2a26" roughness={0.95} />
      </mesh>
      {/* Flag seams */}
      {[-6, -3, 0, 3, 6].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.01, 0]}>
          <planeGeometry args={[0.08, 14]} />
          <meshStandardMaterial color="#1d1a17" roughness={1} />
        </mesh>
      ))}
      {/* Walls: stone base + timber above (matches the hall exterior) */}
      <mesh position={[0, 1.6, -6.5]}>
        <boxGeometry args={[20, 3.2, 0.6]} />
        <meshStandardMaterial color={STONE_DARK} roughness={1} />
      </mesh>
      <mesh position={[0, 1.6, 6.5]}>
        <boxGeometry args={[20, 3.2, 0.6]} />
        <meshStandardMaterial color={STONE_DARK} roughness={1} />
      </mesh>
      <mesh position={[-9.5, 1.6, 0]}>
        <boxGeometry args={[0.6, 3.2, 14]} />
        <meshStandardMaterial color={STONE_DARK} roughness={1} />
      </mesh>
      <mesh position={[9.5, 1.6, 0]}>
        <boxGeometry args={[0.6, 3.2, 14]} />
        <meshStandardMaterial color={STONE_DARK} roughness={1} />
      </mesh>
      {/* Timber corner posts */}
      {[
        [-8.9, -5.9],
        [8.9, -5.9],
        [-8.9, 5.9],
        [8.9, 5.9],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 1.6, z]}>
          <boxGeometry args={[0.5, 3.2, 0.5]} />
          <meshStandardMaterial color={TIMBER_DARK} roughness={0.9} />
        </mesh>
      ))}
      {/* Door frame on the south wall */}
      <mesh position={[-1.35, 1.4, 6.35]}>
        <boxGeometry args={[0.5, 2.8, 0.7]} />
        <meshStandardMaterial color={TIMBER_DARK} roughness={0.9} />
      </mesh>
      <mesh position={[1.35, 1.4, 6.35]}>
        <boxGeometry args={[0.5, 2.8, 0.7]} />
        <meshStandardMaterial color={TIMBER_DARK} roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.95, 6.35]}>
        <boxGeometry args={[3.2, 0.5, 0.7]} />
        <meshStandardMaterial color={TIMBER_DARK} roughness={0.9} />
      </mesh>
      {/* Ceiling beams */}
      {[-4.5, 0, 4.5].map((x) => (
        <mesh key={x} position={[x, 3.45, 0]}>
          <boxGeometry args={[0.35, 0.35, 13]} />
          <meshStandardMaterial color="#241a10" roughness={1} />
        </mesh>
      ))}
      {/* Crimson chief-administrator banner (matches the exterior banner) */}
      <mesh position={[-8.9, 2.0, 2.0]} rotation={[0, Math.PI / 2, 0]}>
        <boxGeometry args={[0.9, 1.2, 0.04]} />
        <meshStandardMaterial color={ROSE} roughness={0.7} />
      </mesh>
      <mesh position={[-8.9, 2.75, 2.0]} rotation={[0, Math.PI / 2, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 1.3, 8]} />
        <meshStandardMaterial color={TIMBER_DARK} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** One flickering torch (flame cone + point light share one useFrame). */
function Torch({ position }: { position: [number, number, number] }) {
  const light = useRef<THREE.PointLight>(null);
  const flame = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const t = performance.now() / 1000;
    const flicker = Math.sin(t * 11) * 0.25 + Math.sin(t * 23 + 1.3) * 0.18;
    if (light.current) light.current.intensity = 1.4 + flicker;
    const mat = flame.current?.material as THREE.MeshStandardMaterial | undefined;
    if (mat) mat.emissiveIntensity = 2.0 + flicker;
  });
  return (
    <group position={position}>
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.7, 8]} />
        <meshStandardMaterial color={TIMBER_DARK} roughness={0.9} />
      </mesh>
      <mesh ref={flame} position={[0, 1.55, 0]}>
        <coneGeometry args={[0.14, 0.4, 8]} />
        <meshStandardMaterial color="#7c2d12" emissive="#ff8c1a" emissiveIntensity={2.0} roughness={1} />
      </mesh>
      <pointLight ref={light} position={[0, 1.6, 0.3]} color="#ffb46b" intensity={1.4} distance={12} decay={1.7} />
    </group>
  );
}

/** A name plate drawn on a canvas texture (the interior-designs pattern for
 * poster text — offline-safe, no runtime font fetch). Two lines, dark ink on
 * transparent ground, laid over a parchment slip. */
function NamePlate({
  lines,
  position,
  width = 0.52,
  height = 0.26,
}: {
  lines: readonly [string, string];
  position: [number, number, number];
  width?: number;
  height?: number;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 256, 128);
      ctx.fillStyle = '#3f2a12';
      ctx.font = 'bold 30px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(lines[0], 128, 44);
      ctx.fillText(lines[1], 128, 88);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [lines[0], lines[1]]);
  return (
    <mesh position={position}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}

/** The contract board — the hall's heart: dark board, five posting slips, the Deserter's rose slip. */
function ContractBoard({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Board */}
      <mesh position={[0, 1.5, 0]} castShadow>
        <boxGeometry args={[4.6, 2.2, 0.12]} />
        <meshStandardMaterial color="#2d1505" roughness={0.95} />
      </mesh>
      {/* Five posting slips, each named from the authored board data */}
      {BOUNTY_HALL_BOARD_NAMES.map((entry, i) => {
        const x = [-1.6, -0.8, 0, 0.8, 1.6][i];
        return (
          <group key={entry.name} position={[x, 0, 0]}>
            <mesh position={[0, 1.55, 0.08]} rotation={[0, 0, i % 2 === 0 ? 0.06 : -0.1]}>
              <boxGeometry args={[0.55, 0.75, 0.02]} />
              <meshStandardMaterial color={PARCHMENT} roughness={0.9} />
            </mesh>
            <NamePlate lines={entry.lines} position={[0, 1.55, 0.1]} />
          </group>
        );
      })}
      {/* The Deserter's slip, in rose — below the five, centred */}
      <mesh position={[0, 0.85, 0.08]}>
        <boxGeometry args={[0.7, 0.5, 0.02]} />
        <meshStandardMaterial color="#fca5a5" roughness={0.9} />
      </mesh>
      <NamePlate lines={BOUNTY_HALL_DESERTER_LINES} position={[0, 0.85, 0.1]} width={0.66} height={0.22} />
      {/* Support posts */}
      <mesh position={[-2.1, 0.75, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 1.5, 8]} />
        <meshStandardMaterial color={TIMBER_DARK} roughness={0.9} />
      </mesh>
      <mesh position={[2.1, 0.75, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 1.5, 8]} />
        <meshStandardMaterial color={TIMBER_DARK} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** The Acta board — Cornelius Felix's daily deeds, smaller and plainer than the contract board. */
function ActaBoard({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} rotation={[0, -Math.PI / 2, 0]}>
      <mesh position={[0, 1.4, 0]} castShadow>
        <boxGeometry args={[2.6, 1.8, 0.1]} />
        <meshStandardMaterial color="#3a2a18" roughness={0.95} />
      </mesh>
      {/* Three deed slips */}
      {[-0.7, 0, 0.7].map((x, i) => (
        <mesh key={i} position={[x, 1.45, 0.07]} rotation={[0, 0, i === 1 ? 0 : i === 0 ? 0.08 : -0.08]}>
          <boxGeometry args={[0.5, 0.65, 0.02]} />
          <meshStandardMaterial color={PARCHMENT_DIM} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** The paymaster's cage — barred window with a coin counter beneath it. */
function PaymasterCage({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} rotation={[0, -Math.PI / 2, 0]}>
      {/* Counter */}
      <mesh position={[0, 0.55, 0.3]} castShadow>
        <boxGeometry args={[2.2, 1.1, 0.6]} />
        <meshStandardMaterial color="#5d4128" roughness={0.9} />
      </mesh>
      {/* Coin pouch on the counter */}
      <mesh position={[-0.5, 1.18, 0.3]}>
        <sphereGeometry args={[0.16, 8, 8]} />
        <meshStandardMaterial color="#a16207" roughness={0.8} />
      </mesh>
      {/* Barred window above the counter */}
      <mesh position={[0, 1.9, 0]}>
        <boxGeometry args={[2.0, 1.2, 0.08]} />
        <meshStandardMaterial color="#141210" roughness={1} />
      </mesh>
      {[-0.7, -0.35, 0, 0.35, 0.7].map((x, i) => (
        <mesh key={i} position={[x, 1.9, 0.06]}>
          <cylinderGeometry args={[0.03, 0.03, 1.2, 6]} />
          <meshStandardMaterial color="#43434a" metalness={0.7} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

/** The Red List — a dark board with three red slips: high-danger targets, progression-gated. */
function RedListBoard({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.6, 0]} castShadow>
        <boxGeometry args={[2.4, 1.6, 0.1]} />
        <meshStandardMaterial color="#1c0505" roughness={0.95} />
      </mesh>
      {[-0.7, 0, 0.7].map((x, i) => (
        <mesh key={i} position={[x, 1.6, 0.07]} rotation={[0, 0, i === 1 ? -0.06 : 0.09]}>
          <boxGeometry args={[0.5, 0.7, 0.02]} />
          <meshStandardMaterial color="#dc2626" roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

/** A long mercenary table with benches. */
function MercenaryTable({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.75, 0]} castShadow>
        <boxGeometry args={[3.0, 0.12, 1.1]} />
        <meshStandardMaterial color="#7a5a38" roughness={0.85} />
      </mesh>
      {[[-1.35, -0.45], [1.35, -0.45], [-1.35, 0.45], [1.35, 0.45]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.35, z]}>
          <boxGeometry args={[0.14, 0.7, 0.14]} />
          <meshStandardMaterial color="#5d4128" roughness={0.9} />
        </mesh>
      ))}
      {/* Benches */}
      <mesh position={[0, 0.4, -0.85]}>
        <boxGeometry args={[2.8, 0.1, 0.35]} />
        <meshStandardMaterial color="#5d4128" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.4, 0.85]}>
        <boxGeometry args={[2.8, 0.1, 0.35]} />
        <meshStandardMaterial color="#5d4128" roughness={0.9} />
      </mesh>
      {/* Tankards and a dice cup left on the table */}
      <mesh position={[-0.8, 0.86, 0.2]}>
        <cylinderGeometry args={[0.09, 0.08, 0.18, 8]} />
        <meshStandardMaterial color="#78716c" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0.6, 0.86, -0.15]}>
        <cylinderGeometry args={[0.09, 0.08, 0.18, 8]} />
        <meshStandardMaterial color="#78716c" metalness={0.5} roughness={0.5} />
      </mesh>
    </group>
  );
}

/** Wanted posters pinned to the walls — flavour, instanced planes with a parchment face. */
function WantedPosters() {
  const posters: Array<[number, number, number, number]> = [
    [-8.9, 1.9, -2.5, Math.PI / 2],
    [-8.9, 1.9, 1.5, Math.PI / 2],
    [8.9, 1.9, -1.5, -Math.PI / 2],
    [8.9, 1.9, 3.0, -Math.PI / 2],
  ];
  return (
    <group>
      {posters.map(([x, y, z, ry], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[0, ry, i % 2 === 0 ? 0.05 : -0.07]}>
          <boxGeometry args={[0.5, 0.7, 0.02]} />
          <meshStandardMaterial color={PARCHMENT_DIM} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** The back room's locked door — visible, not enterable in this slice.
 * High-tier contracts live behind it; no key or quest opens it here. */
function BackRoomDoor({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} rotation={[0, Math.PI / 2, 0]}>
      {/* Heavy timber door */}
      <mesh position={[0, 1.1, 0]} castShadow>
        <boxGeometry args={[1.4, 2.2, 0.12]} />
        <meshStandardMaterial color={TIMBER_DARK} roughness={0.95} />
      </mesh>
      {/* Iron bands + lock bar */}
      <mesh position={[0, 1.7, 0.08]}>
        <boxGeometry args={[1.4, 0.1, 0.04]} />
        <meshStandardMaterial color="#43434a" metalness={0.7} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.6, 0.08]}>
        <boxGeometry args={[1.4, 0.1, 0.04]} />
        <meshStandardMaterial color="#43434a" metalness={0.7} roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.1, 0.1]}>
        <boxGeometry args={[0.16, 0.2, 0.06]} />
        <meshStandardMaterial color="#6b7280" metalness={0.8} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** An unnamed mercenary — flavour only, no name, no dialogue, no station.
 * Seated figures at the tables make the hall feel occupied. */
function MercenaryFigure({
  position,
  rotationY = 0,
  robe = '#3f3a35',
}: {
  position: [number, number, number];
  rotationY?: number;
  robe?: string;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.45, 0]}>
        <capsuleGeometry args={[0.3, 0.55, 6, 12]} />
        <meshStandardMaterial color={robe} roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.05, 0]}>
        <sphereGeometry args={[0.19, 14, 14]} />
        <meshStandardMaterial color="#c9a07a" roughness={0.8} />
      </mesh>
      {/* Hood */}
      <mesh position={[0, 1.14, -0.04]}>
        <coneGeometry args={[0.24, 0.3, 10]} />
        <meshStandardMaterial color={robe} roughness={0.95} />
      </mesh>
    </group>
  );
}

/** Scribonia, called "the Ledger" — procedural clerk NPC at the paymaster's cage, with a talk marker. */
function ScriboniaNPC({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
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
      <mesh position={[-0.13, 0.35, 0]}>
        <boxGeometry args={[0.2, 0.7, 0.22]} />
        <meshStandardMaterial color="#2c2620" roughness={1} />
      </mesh>
      <mesh position={[0.13, 0.35, 0]}>
        <boxGeometry args={[0.2, 0.7, 0.22]} />
        <meshStandardMaterial color="#2c2620" roughness={1} />
      </mesh>
      {/* Dark rose robe */}
      <mesh position={[0, 0.95, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.38, 0.75, 10]} />
        <meshStandardMaterial color="#5b2333" roughness={0.9} />
      </mesh>
      {/* Ledger held in front */}
      <mesh position={[0, 0.95, 0.28]}>
        <boxGeometry args={[0.42, 0.3, 0.06]} />
        <meshStandardMaterial color="#fef3c7" roughness={0.9} />
      </mesh>
      <mesh position={[-0.4, 1.05, 0]} rotation={[0, 0, 0.25]}>
        <cylinderGeometry args={[0.09, 0.08, 0.6, 8]} />
        <meshStandardMaterial color="#5b2333" roughness={0.9} />
      </mesh>
      <mesh position={[0.42, 1.1, 0.1]} rotation={[0.5, 0, -0.35]}>
        <cylinderGeometry args={[0.09, 0.08, 0.6, 8]} />
        <meshStandardMaterial color="#5b2333" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.62, 0]} castShadow>
        <sphereGeometry args={[0.21, 14, 14]} />
        <meshStandardMaterial color="#c9a07a" roughness={0.8} />
      </mesh>
      {/* Grey hair bun */}
      <mesh position={[0, 1.78, -0.1]}>
        <sphereGeometry args={[0.11, 10, 10]} />
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
/* Player rig — camera-relative movement, hall-floor clamp, door exit.  */
/* ------------------------------------------------------------------ */

interface BountyHallPlayerRigProps {
  onExitRef: React.MutableRefObject<() => void>;
  keysRef: React.MutableRefObject<Record<string, boolean>>;
  stickRef: React.MutableRefObject<{ x: number; y: number }>;
  onPosition: (x: number, z: number) => void;
}

function BountyHallPlayerRig({ onExitRef, keysRef, stickRef, onPosition }: BountyHallPlayerRigProps) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const pos = useRef<[number, number]>([BOUNTY_HALL_SPAWN_X, BOUNTY_HALL_SPAWN_Z]);
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
    [px, pz] = clampToBountyHallFloor(px, pz);
    pos.current = [px, pz];
    onPosition(px, pz);
    // Walk back through the hall door to leave.
    if (!exited.current && isBountyHallExit(px, pz)) {
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
    <group ref={group} position={[BOUNTY_HALL_SPAWN_X, 0, BOUNTY_HALL_SPAWN_Z]}>
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

interface BountyHallInteriorProps {
  /** Called when the player taps "Return to City" or walks back through the door. */
  onExit: () => void;
  /**
   * Open the existing bounty board panel (BountyBoardPanel — Scribonia's five
   * postings AND Cornelius Felix's Acta section live in that one panel, so the
   * board station and the Acta station both open it). Tavern pattern: App
   * closes this overlay first, then runs the CityHubScene callback that raises
   * the panel. Writes nothing itself.
   */
  onOpenServices: () => void;
  /** Record the keeper's first-visit line (K1 pattern). */
  onRecordKeeperVisit?: (keeperId: string) => void;
}

export function BountyHallInterior({ onExit, onOpenServices, onRecordKeeperVisit }: BountyHallInteriorProps) {
  const onExitRef = useRef(onExit);
  const onOpenServicesRef = useRef(onOpenServices);
  const onRecordKeeperVisitRef = useRef(onRecordKeeperVisit);
  useEffect(() => {
    onExitRef.current = onExit;
    onOpenServicesRef.current = onOpenServices;
    onRecordKeeperVisitRef.current = onRecordKeeperVisit;
  });

  const keysPressed = useRef<Record<string, boolean>>({});
  const stickRef = useRef({ x: 0, y: 0 });
  const playerPosRef = useRef({ x: BOUNTY_HALL_SPAWN_X, z: BOUNTY_HALL_SPAWN_Z });
  const nearStationRef = useRef<BountyHallStation | null>(null);
  const talkingRef = useRef(false);
  const metScriboniaRef = useRef(false);
  const [nearStation, setNearStation] = useState<BountyHallStation | null>(null);
  const [talking, setTalking] = useState(false);
  const [scriboniaLine, setScriboniaLine] = useState<string>(SCRIBONIA_HALL_FIRST_VISIT);

  // Proximity polling (cheap: 5 Hz) — drives the station prompt.
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = nearestBountyHallStation(playerPosRef.current.x, playerPosRef.current.z);
      if (s?.id !== nearStationRef.current?.id) {
        nearStationRef.current = s;
        setNearStation(s);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  const startTalking = () => {
    if (!metScriboniaRef.current) {
      metScriboniaRef.current = true;
      setScriboniaLine(SCRIBONIA_HALL_FIRST_VISIT);
      onRecordKeeperVisitRef.current?.('scribonia');
    } else {
      // A return visit hears the registry's repeat line, not the greeting.
      setScriboniaLine(SCRIBONIA_HALL_REPEAT);
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
    if (s.id === 'scribonia') startTalking();
    else if (s.id === 'board' || s.id === 'acta') onOpenServicesRef.current();
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
      aria-label="The Bounty & Mercenary Hall"
    >
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [BOUNTY_HALL_SPAWN_X, 6.4, BOUNTY_HALL_SPAWN_Z + 8], fov: 55, near: 0.1, far: 120 }}
        gl={{ antialias: false, powerPreference: 'low-power' }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.1;
        }}
      >
        <color attach="background" args={['#0d0908']} />
        <fog attach="fog" args={['#0d0908', 45, 110]} />
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
        <BountyHallShell />
        <Torch position={[-8.5, 0, -5.8]} />
        <Torch position={[8.5, 0, -5.8]} />
        <ContractBoard position={[-5.5, 0, -5.9]} />
        <ActaBoard position={[8.9, 0, -3.5]} />
        <PaymasterCage position={[9.0, 0, 0.8]} />
        <RedListBoard position={[0, 0, -6.2]} />
        <BackRoomDoor position={[-9.2, 0, -2.0]} />
        <MercenaryTable position={[-6.8, 0, 2.6]} />
        <MercenaryTable position={[6.8, 0, 2.6]} rotationY={0.3} />
        <MercenaryFigure position={[-6.8, 0, 3.5]} rotationY={Math.PI} robe="#4a3220" />
        <MercenaryFigure position={[6.8, 0, 1.7]} rotationY={0.4} robe="#374151" />
        <WantedPosters />
        <ScriboniaNPC position={[7.8, 0, 0.8]} rotationY={-Math.PI / 2} />
        <BountyHallPlayerRig
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
          <div className="bg-neutral-950/85 border border-rose-600/50 rounded-2xl px-4 py-2 text-center">
            <div className="font-serif font-black text-rose-100 text-sm tracking-wide">Bounty &amp; Mercenary Hall</div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-rose-400/80">
              Scribonia, the Ledger · contracts
            </div>
          </div>
        </div>
        <div className="absolute top-3 left-3 pointer-events-auto">
          <button
            type="button"
            onClick={() => onExitRef.current()}
            aria-label="Return to City"
            data-bounty-return
            className="min-h-[44px] min-w-[44px] px-4 rounded-2xl bg-neutral-950/85 border border-rose-600/50 text-rose-200 font-serif font-bold text-sm hover:bg-rose-500/20 flex items-center"
          >
            ← Return to City
          </button>
        </div>
        {/* Nearby-station prompt */}
        {nearStation && !talking && (
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2 pointer-events-auto">
            <div className="bg-neutral-950/85 border border-rose-600/50 rounded-2xl px-4 py-2.5 flex items-center gap-3 max-w-[92vw]">
              <div className="min-w-0">
                <div className="font-serif font-bold text-rose-100 text-sm leading-tight">{nearStation.label}</div>
                <div className="text-[11px] text-neutral-400 font-mono truncate">{nearStation.hint}</div>
              </div>
              {nearStation.id === 'scribonia' && (
                <button
                  type="button"
                  onClick={startTalking}
                  className="min-h-[44px] px-4 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-neutral-50 font-serif font-bold text-sm shrink-0"
                >
                  Talk
                </button>
              )}
              {nearStation.id === 'board' && (
                <button
                  type="button"
                  onClick={() => onOpenServicesRef.current()}
                  className="min-h-[44px] px-4 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-neutral-50 font-serif font-bold text-sm shrink-0"
                >
                  View Board
                </button>
              )}
              {nearStation.id === 'acta' && (
                <button
                  type="button"
                  onClick={() => onOpenServicesRef.current()}
                  className="min-h-[44px] px-4 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-neutral-50 font-serif font-bold text-sm shrink-0"
                >
                  Read the Acta
                </button>
              )}
            </div>
          </div>
        )}
        {/* Scribonia dialogue */}
        {talking && (
          <div className="absolute inset-x-3 bottom-24 sm:bottom-28 z-20 flex justify-center pointer-events-none">
            <div className="pointer-events-auto w-[min(94vw,30rem)] rounded-2xl border border-rose-600/50 bg-neutral-950/95 p-4 shadow-2xl">
              <div className="font-serif font-black text-rose-100">Scribonia, the Ledger</div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-rose-400/70">
                Clerk of the bounty board
              </div>
              <p className="mt-2 text-sm leading-relaxed text-neutral-200">&ldquo;{scriboniaLine}&rdquo;</p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                {SCRIBONIA_HALL_TOPICS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setScriboniaLine(t.line)}
                    className="min-h-[44px] rounded-xl border border-rose-600/50 text-rose-200 hover:bg-rose-500/15 font-serif font-bold text-[13px] px-2"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={stopTalking}
                className="mt-2 w-full min-h-[44px] rounded-xl bg-rose-600/90 hover:bg-rose-500 text-neutral-50 font-serif font-bold text-sm"
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
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-neutral-950/60 border-2 border-rose-600/50 relative flex items-center justify-center"
          >
            <div className="absolute top-2 w-1.5 h-1.5 rounded-full bg-rose-500/50" />
            <div className="absolute bottom-2 w-1.5 h-1.5 rounded-full bg-rose-500/50" />
            <div className="absolute left-2 w-1.5 h-1.5 rounded-full bg-rose-500/50" />
            <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-rose-500/50" />
            <div
              className="w-10 h-10 rounded-full bg-gradient-to-b from-rose-500 to-rose-700 border-2 border-rose-300"
              style={{ transform: `translate(${knobPos.x}px, ${knobPos.y}px)` }}
            />
          </div>
          <div className="mt-1 text-center font-mono text-[10px] uppercase tracking-wider text-rose-300/80">
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
