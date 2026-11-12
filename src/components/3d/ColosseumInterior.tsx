import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  getArenaSandTexture,
  getArenaRingPaintTexture,
  getPodiumWallTexture,
  getPodiumInscriptionTexture,
  getArenaTierTexture,
  applyArenaTextureAnisotropy,
} from '../../utils/arenaInteriorTextures';
import { applyDeadZone } from '../../utils/joystickDeadZone';

/**
 * COLOSSEUM INTERIOR — the enterable empty arena.
 *
 * Click the Colosseum in the city -> this overlay mounts -> the player stands
 * alone on the sand with 50,000 empty seats around them. No opponent, no
 * combat, no crowd: walk the ellipse, take in the cavea, the podium wall, the
 * imperial box and the two gates, then leave back through the Porta
 * Triumphalis (or the HUD button).
 *
 * Trigger pattern: TavernInterior. The city stays mounted underneath (its
 * input is locked via `movementLocked`), and `onExit` simply unmounts this
 * overlay — the player is back at the Colosseum door where they stood.
 *
 * Performance: ~39 meshes, one 1024px shadow-casting light, DPR capped at
 * 1.5, no post-processing — comfortably under the 50-draw-call mobile budget.
 */

/* -------------------------------------------------------------------------- */
/* Pure arena math — DOM-free, covered by `src/utils/colosseumInterior.test.ts` */
/* -------------------------------------------------------------------------- */

/** Semi-axes of the walkable arena ellipse: ~40 x 25 units of sand. */
export const COLOSSEUM_ARENA_RX = 20;
export const COLOSSEUM_ARENA_RZ = 12.5;
/** Spawn: just inside the Porta Triumphalis (east gate), facing west. */
export const COLOSSEUM_SPAWN_X = 15.5;
export const COLOSSEUM_SPAWN_Z = 0;
/**
 * Spawn yaw. Yaw convention everywhere in this file: forward = (sin(yaw),
 * cos(yaw)) — the same convention the city's movement loop uses. -PI/2 faces
 * west (-X), across the arena from the east gate.
 */
export const COLOSSEUM_SPAWN_YAW = -Math.PI / 2;
/** 3D exit: the mouth of the Porta Triumphalis at the arena's east edge. */
export const COLOSSEUM_EXIT_MIN_X = 18.75;
export const COLOSSEUM_EXIT_HALF_WIDTH = 1.6;

/**
 * Clamp a point to the arena ellipse. Points inside are returned unchanged;
 * points outside are pulled back onto the ellipse boundary.
 */
export function clampToArenaEllipse(x: number, z: number): [number, number] {
  const ex = x / COLOSSEUM_ARENA_RX;
  const ez = z / COLOSSEUM_ARENA_RZ;
  const d2 = ex * ex + ez * ez;
  if (d2 <= 1) return [x, z];
  const d = Math.sqrt(d2);
  return [(ex / d) * COLOSSEUM_ARENA_RX, (ez / d) * COLOSSEUM_ARENA_RZ];
}

/**
 * True while the player stands in the gate mouth. Walking back through the
 * Porta Triumphalis is the 3D exit; the spawn sits outside this zone, so the
 * exit cannot fire on entry.
 */
export function isColosseumExit(x: number, z: number): boolean {
  return x >= COLOSSEUM_EXIT_MIN_X && Math.abs(z) <= COLOSSEUM_EXIT_HALF_WIDTH;
}

/* -------------------------------------------------------------------------- */
/* Geometry constants (DOM-free)                                               */
/* -------------------------------------------------------------------------- */

/** z squash that turns the circular primitives into the arena ellipse. */
const SQUASH = COLOSSEUM_ARENA_RZ / COLOSSEUM_ARENA_RX;

const PODIUM_BASE_RX = 20.4;
const PODIUM_TOP_RX = 21.4;
const PODIUM_H = 2;

const TIER_COUNT = 3;
const TIER_RUN = 4.8;
const TIER_RISE = 2.4;
const TIER_BASE_RX = 21.4;

const FACADE_RX = 35.8;
const FACADE_H = 6.5;

const PLAYER_SPEED = 3.8;
const CAMERA_DISTANCE = 6.4;
const CAMERA_HEIGHT = 3.6;

const TRAVERTINE = '#d3bd97';
const TRAVERTINE_DARK = '#b39a72';

interface ColosseumTextures {
  sand?: THREE.Texture;
  ringPaint?: THREE.Texture;
  podium?: THREE.Texture;
  inscription?: THREE.Texture;
  tier?: THREE.Texture;
}

/**
 * The reused arena-interior textures. Sand / podium / inscription / tier are
 * cloned before tiling: the module cache is shared with DuelArena, and the
 * repeats below belong to this scene alone.
 */
function useColosseumTextures(): ColosseumTextures {
  return useMemo(() => {
    const cloneTiled = (t: THREE.CanvasTexture | null, rx: number, ry: number) => {
      if (!t) return undefined;
      const c = t.clone();
      c.wrapS = THREE.RepeatWrapping;
      c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(rx, ry);
      c.anisotropy = 4;
      c.needsUpdate = true;
      return c;
    };
    return {
      sand: cloneTiled(getArenaSandTexture(), 3, 2),
      ringPaint: getArenaRingPaintTexture() ?? undefined,
      podium: cloneTiled(getPodiumWallTexture(), 10, 1),
      inscription: cloneTiled(getPodiumInscriptionTexture(), 8, 1),
      tier: cloneTiled(getArenaTierTexture(), 12, 1),
    };
  }, []);
}

/** Warm-afternoon sky gradient for the open-air dome (canvas-local, tiny). */
function useSkyDomeTexture(): THREE.CanvasTexture | undefined {
  return useMemo(() => {
    if (typeof document === 'undefined') return undefined;
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const ctx = c.getContext('2d');
    if (!ctx) return undefined;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.0, '#5d8cc2');
    g.addColorStop(0.55, '#a9c7e3');
    g.addColorStop(0.78, '#f4d9a6');
    g.addColorStop(1.0, '#f8e7c2');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

/* -------------------------------------------------------------------------- */
/* The building — sand, podium, 3-tier cavea, facade, box and gates (33 meshes) */
/* -------------------------------------------------------------------------- */

/** Scattered cushions left on the tier-0 bank (rho ~23.6, y on the slope). */
const CUSHIONS: { pos: [number, number, number]; rot: number; color: string }[] = [
  { pos: [-18.08, 3.18, 9.48], rot: 0.5, color: '#8f1f2e' },
  { pos: [18.08, 3.18, 9.48], rot: -0.9, color: '#c9963c' },
];

/** Discarded programs fluttered down onto the sand. */
const PROGRAMS: { pos: [number, number]; rot: number }[] = [
  { pos: [5, 3], rot: 0.4 },
  { pos: [-8, -5], rot: 2.1 },
  { pos: [12, -7], rot: -1.2 },
  { pos: [-3, 9], rot: 1.1 },
  { pos: [0.5, -11], rot: -2.6 },
];

function ArenaShell({ tex }: { tex: ColosseumTextures }) {
  const skyTex = useSkyDomeTexture();
  const tiers = useMemo(
    () =>
      Array.from({ length: TIER_COUNT }, (_, i) => ({
        key: i,
        bottomRx: TIER_BASE_RX + i * TIER_RUN,
        topRx: TIER_BASE_RX + (i + 1) * TIER_RUN,
        y: PODIUM_H + i * TIER_RISE + TIER_RISE / 2,
      })),
    []
  );
  const facadeY = PODIUM_H + TIER_COUNT * TIER_RISE;

  return (
    <group>
      {/* open-air sky dome */}
      <mesh scale={[1, 0.55, 1]}>
        <sphereGeometry args={[220, 24, 16]} />
        <meshBasicMaterial map={skyTex} side={THREE.BackSide} fog={false} depthWrite={false} />
      </mesh>
      {/* outer ground so the horizon is not void */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <circleGeometry args={[220, 48]} />
        <meshStandardMaterial color="#a3906c" roughness={1} />
      </mesh>

      {/* arena sand — the walkable ellipse */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[1, SQUASH, 1]} receiveShadow>
        <circleGeometry args={[COLOSSEUM_ARENA_RX, 72]} />
        <meshStandardMaterial map={tex.sand} roughness={1} />
      </mesh>
      {/* painted red center circle — DuelArena's ring alpha map on a radius-20 disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[20, 72]} />
        <meshStandardMaterial
          color="#b91c1c"
          alphaMap={tex.ringPaint}
          transparent
          depthWrite={false}
          roughness={0.9}
        />
      </mesh>

      {/* podium wall (~2u) separating sand from seats */}
      <mesh position={[0, PODIUM_H / 2, 0]} scale={[1, 1, SQUASH]} receiveShadow castShadow>
        <cylinderGeometry args={[PODIUM_TOP_RX, PODIUM_BASE_RX, PODIUM_H, 72, 1, true]} />
        <meshStandardMaterial map={tex.podium} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {/* inscription band (SPQR ...) around the top of the podium */}
      <mesh position={[0, 1.55, 0]} scale={[1, 1, SQUASH]}>
        <cylinderGeometry args={[PODIUM_TOP_RX + 0.12, PODIUM_TOP_RX + 0.12, 0.8, 72, 1, true]} />
        <meshStandardMaterial map={tex.inscription} roughness={0.85} side={THREE.DoubleSide} />
      </mesh>

      {/* 3-tier cavea — sloped stone banks, EMPTY (no crowd: it is not fight day) */}
      {tiers.map((t) => (
        <mesh key={t.key} position={[0, t.y, 0]} scale={[1, 1, SQUASH]} receiveShadow castShadow>
          <cylinderGeometry args={[t.topRx, t.bottomRx, TIER_RISE, 72, 1, true]} />
          <meshStandardMaterial map={tex.tier} roughness={0.95} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {/* outer facade wall above the top tier, with cornice */}
      <mesh position={[0, facadeY + FACADE_H / 2, 0]} scale={[1, 1, SQUASH]} castShadow>
        <cylinderGeometry args={[FACADE_RX + 0.8, FACADE_RX, FACADE_H, 72, 1, true]} />
        <meshStandardMaterial color={TRAVERTINE} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, facadeY + FACADE_H, 0]}
        scale={[1, SQUASH, 1]}
      >
        <ringGeometry args={[FACADE_RX, FACADE_RX + 1.4, 72]} />
        <meshStandardMaterial color={TRAVERTINE_DARK} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>

      {/* PULVINAR — the imperial box on the north side: dressed box, crimson
          canopy with gold trim, empty throne */}
      <group>
        <mesh position={[0, 4.9, -16.4]} castShadow receiveShadow>
          <boxGeometry args={[6.5, 0.8, 3.6]} />
          <meshStandardMaterial color="#d8cfb8" roughness={0.85} />
        </mesh>
        {[-2.8, 2.8].map((px) => (
          <mesh key={px} position={[px, 6.8, -17.6]} castShadow>
            <cylinderGeometry args={[0.12, 0.12, 3, 8]} />
            <meshStandardMaterial color="#6b5a3e" roughness={0.6} metalness={0.4} />
          </mesh>
        ))}
        <mesh position={[0, 8.35, -17.3]} rotation={[0.08, 0, 0]} castShadow>
          <boxGeometry args={[6.6, 0.12, 3.2]} />
          <meshStandardMaterial color="#8f1f2e" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 8.26, -15.75]}>
          <boxGeometry args={[6.6, 0.14, 0.14]} />
          <meshStandardMaterial color="#d4a017" roughness={0.4} metalness={0.55} />
        </mesh>
        <mesh position={[0, 5.75, -16.9]} castShadow>
          <boxGeometry args={[1.3, 0.9, 1.1]} />
          <meshStandardMaterial color="#e0d6bd" roughness={0.8} />
        </mesh>
        <mesh position={[0, 6.6, -17.4]} castShadow>
          <boxGeometry args={[1.3, 1.3, 0.22]} />
          <meshStandardMaterial color="#e0d6bd" roughness={0.8} />
        </mesh>
      </group>

      {/* PORTA TRIUMPHALIS — east, the great arch; spawn and 3D exit */}
      <group>
        {[-2.65, 2.65].map((pz) => (
          <mesh key={pz} position={[21.5, 2.6, pz]} castShadow receiveShadow>
            <boxGeometry args={[1.7, 5.2, 1.7]} />
            <meshStandardMaterial color={TRAVERTINE} roughness={0.9} />
          </mesh>
        ))}
        <mesh position={[21.5, 5.2, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
          <torusGeometry args={[2.65, 0.85, 12, 24, Math.PI]} />
          <meshStandardMaterial color={TRAVERTINE} roughness={0.9} />
        </mesh>
        <mesh position={[21.5, 7.1, 0]} castShadow>
          <boxGeometry args={[1.9, 1.3, 7]} />
          <meshStandardMaterial color={TRAVERTINE_DARK} roughness={0.9} />
        </mesh>
      </group>

      {/* PORTA LIBITINARIA — west, smaller and darker; flavour only */}
      <group>
        {[-1.85, 1.85].map((pz) => (
          <mesh key={pz} position={[-21.5, 1.9, pz]} castShadow>
            <boxGeometry args={[1.3, 3.8, 1.3]} />
            <meshStandardMaterial color="#57504a" roughness={0.95} />
          </mesh>
        ))}
        <mesh position={[-21.5, 3.8, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
          <torusGeometry args={[1.85, 0.65, 10, 20, Math.PI]} />
          <meshStandardMaterial color="#57504a" roughness={0.95} />
        </mesh>
        <mesh position={[-22.3, 1.8, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[3.2, 3.6]} />
          <meshStandardMaterial color="#0b0b0e" roughness={1} />
        </mesh>
      </group>

      {/* life: cushions on the bank, discarded programs on the sand */}
      {CUSHIONS.map((c, i) => (
        <mesh key={i} position={c.pos} rotation={[0, c.rot, 0]} castShadow>
          <boxGeometry args={[0.55, 0.14, 0.4]} />
          <meshStandardMaterial color={c.color} roughness={0.9} />
        </mesh>
      ))}
      {PROGRAMS.map((p, i) => (
        <mesh key={i} position={[p.pos[0], 0.035, p.pos[1]]} rotation={[0, p.rot, 0]}>
          <boxGeometry args={[0.32, 0.03, 0.42]} />
          <meshStandardMaterial color="#d9c9a8" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Player — third-person figure, WASD/stick movement, chase camera              */
/* -------------------------------------------------------------------------- */

function ColosseumPlayerRig({
  onExitRef,
  keysRef,
  stickRef,
}: {
  onExitRef: { current: () => void };
  keysRef: { current: Record<string, boolean> };
  stickRef: { current: { x: number; z: number } };
}) {
  const rootRef = useRef<THREE.Group>(null);
  const armLRef = useRef<THREE.Group>(null);
  const armRRef = useRef<THREE.Group>(null);
  const posRef = useRef<[number, number]>([COLOSSEUM_SPAWN_X, COLOSSEUM_SPAWN_Z]);
  const yawRef = useRef<number>(COLOSSEUM_SPAWN_YAW);
  const camYawRef = useRef<number>(COLOSSEUM_SPAWN_YAW);
  const exitedRef = useRef(false);
  const walkPhaseRef = useRef(0);
  const camTargetRef = useRef(new THREE.Vector3());
  const { camera } = useThree();

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.08);
    const k = keysRef.current;
    let ix = 0;
    let iz = 0;
    if (k['w']) iz -= 1;
    if (k['s']) iz += 1;
    if (k['a']) ix -= 1;
    if (k['d']) ix += 1;
    const stick = stickRef.current;
    ix += stick.x;
    iz += stick.z;
    const len = Math.hypot(ix, iz);
    const moving = len > 0.05;

    if (moving) {
      const nx = ix / Math.max(1, len);
      const nz = iz / Math.max(1, len);
      const mag = Math.min(1, len);
      // camera-relative, like the city: stick/key up is away from the camera
      const cy = camYawRef.current;
      const fx = Math.sin(cy);
      const fz = Math.cos(cy);
      const rx = -Math.cos(cy);
      const rz = Math.sin(cy);
      const wx = nx * rx - nz * fx;
      const wz = nx * rz - nz * fz;
      const speed = PLAYER_SPEED * mag;
      const [px, pz] = clampToArenaEllipse(
        posRef.current[0] + wx * speed * delta,
        posRef.current[1] + wz * speed * delta
      );
      posRef.current = [px, pz];
      // smooth-turn toward the movement direction
      const targetYaw = Math.atan2(wx, wz);
      let dy = targetYaw - yawRef.current;
      while (dy < -Math.PI) dy += Math.PI * 2;
      while (dy > Math.PI) dy += Math.PI * 2;
      yawRef.current += dy * Math.min(1, delta * 11);
      walkPhaseRef.current += delta * 9 * mag;
      // 3D exit: walking back through the Porta Triumphalis
      if (!exitedRef.current && isColosseumExit(px, pz)) {
        exitedRef.current = true;
        // Defer unmount to next tick to avoid synchronously unmounting R3F root during update
        requestAnimationFrame(() => onExitRef.current());
        return;
      }
    }

    // chase camera eases behind the player's heading
    let cyaw = yawRef.current - camYawRef.current;
    while (cyaw < -Math.PI) cyaw += Math.PI * 2;
    while (cyaw > Math.PI) cyaw += Math.PI * 2;
    camYawRef.current += cyaw * Math.min(1, delta * (moving ? 2.4 : 0.9));

    const [px, pz] = posRef.current;
    const bob = moving ? Math.abs(Math.sin(walkPhaseRef.current)) * 0.07 : 0;
    const root = rootRef.current;
    if (root) {
      root.position.set(px, bob, pz);
      root.rotation.y = yawRef.current;
    }
    const swing = moving ? Math.sin(walkPhaseRef.current) * 0.55 : 0;
    if (armLRef.current) armLRef.current.rotation.x = swing;
    if (armRRef.current) armRRef.current.rotation.x = -swing;

    camTargetRef.current.set(
      px - Math.sin(camYawRef.current) * CAMERA_DISTANCE,
      CAMERA_HEIGHT,
      pz - Math.cos(camYawRef.current) * CAMERA_DISTANCE
    );
    camera.position.lerp(camTargetRef.current, Math.min(1, delta * 5));
    camera.lookAt(px, 1.5, pz);
  });

  return (
    <group
      ref={rootRef}
      position={[COLOSSEUM_SPAWN_X, 0, COLOSSEUM_SPAWN_Z]}
      rotation={[0, COLOSSEUM_SPAWN_YAW, 0]}
    >
      <mesh position={[-0.13, 0.28, 0]} castShadow>
        <boxGeometry args={[0.17, 0.56, 0.17]} />
        <meshStandardMaterial color="#5a3d28" roughness={0.9} />
      </mesh>
      <mesh position={[0.13, 0.28, 0]} castShadow>
        <boxGeometry args={[0.17, 0.56, 0.17]} />
        <meshStandardMaterial color="#5a3d28" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.86, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.3, 0.62, 10]} />
        <meshStandardMaterial color="#9a2b2b" roughness={0.85} />
      </mesh>
      <group ref={armLRef} position={[-0.36, 1.12, 0]}>
        <mesh position={[0, -0.24, 0]} castShadow>
          <boxGeometry args={[0.13, 0.5, 0.13]} />
          <meshStandardMaterial color="#c9986a" roughness={0.8} />
        </mesh>
      </group>
      <group ref={armRRef} position={[0.36, 1.12, 0]}>
        <mesh position={[0, -0.24, 0]} castShadow>
          <boxGeometry args={[0.13, 0.5, 0.13]} />
          <meshStandardMaterial color="#c9986a" roughness={0.8} />
        </mesh>
      </group>
      <mesh position={[0, 1.36, 0]} castShadow>
        <sphereGeometry args={[0.17, 12, 10]} />
        <meshStandardMaterial color="#c9986a" roughness={0.75} />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/* Overlay component                                                           */
/* -------------------------------------------------------------------------- */

export interface ColosseumInteriorProps {
  onExit: () => void;
}

export const ColosseumInterior: React.FC<ColosseumInteriorProps> = ({ onExit }) => {
  const onExitRef = useRef(onExit);
  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  const keysPressed = useRef<Record<string, boolean>>({});
  const stickRef = useRef({ x: 0, z: 0 });
  const joystickRef = useRef<HTMLDivElement>(null);
  const touchIdRef = useRef<number | null>(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });

  const textures = useColosseumTextures();

  // WASD / arrow keys
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const code = e.code;
      const key = e.key.toLowerCase();
      if (
        code === 'ArrowUp' ||
        code === 'ArrowDown' ||
        code === 'ArrowLeft' ||
        code === 'ArrowRight' ||
        code === 'Space'
      ) {
        e.preventDefault();
      }
      if (code === 'KeyW' || key === 'w' || code === 'ArrowUp') keysPressed.current['w'] = true;
      if (code === 'KeyS' || key === 's' || code === 'ArrowDown') keysPressed.current['s'] = true;
      if (code === 'KeyA' || key === 'a' || code === 'ArrowLeft') keysPressed.current['a'] = true;
      if (code === 'KeyD' || key === 'd' || code === 'ArrowRight') keysPressed.current['d'] = true;
    };
    const up = (e: KeyboardEvent) => {
      const code = e.code;
      const key = e.key.toLowerCase();
      if (code === 'KeyW' || key === 'w' || code === 'ArrowUp') keysPressed.current['w'] = false;
      if (code === 'KeyS' || key === 's' || code === 'ArrowDown') keysPressed.current['s'] = false;
      if (code === 'KeyA' || key === 'a' || code === 'ArrowLeft') keysPressed.current['a'] = false;
      if (code === 'KeyD' || key === 'd' || code === 'ArrowRight') keysPressed.current['d'] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // mobile virtual joystick (the city's stick pattern)
  const handleJoystickTouchMove = (e: React.TouchEvent) => {
    if (!joystickRef.current || touchIdRef.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === touchIdRef.current) {
        const rect = joystickRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;
        const maxDist = rect.width * 0.42;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > maxDist) {
          dx = (dx / dist) * maxDist;
          dy = (dy / dist) * maxDist;
        }
        setKnobPos({ x: dx, y: dy });
        const vec = applyDeadZone(dx / maxDist, dy / maxDist);
        stickRef.current = { x: vec.x, z: vec.z };
        break;
      }
    }
  };
  const handleJoystickTouchStart = (e: React.TouchEvent) => {
    if (touchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    touchIdRef.current = touch.identifier;
    handleJoystickTouchMove(e);
  };
  const handleJoystickTouchEnd = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchIdRef.current) {
        touchIdRef.current = null;
        setKnobPos({ x: 0, y: 0 });
        stickRef.current = { x: 0, z: 0 };
        break;
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] bg-neutral-950 overflow-hidden select-none"
      role="dialog"
      aria-modal="true"
      aria-label="The Colosseum — empty arena"
    >
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [21.9, 3.6, 0], fov: 55, near: 0.1, far: 260 }}
        gl={{ antialias: false, powerPreference: 'low-power' }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.06;
          applyArenaTextureAnisotropy(gl);
        }}
      >
        <fog attach="fog" args={['#e9d6ab', 70, 180]} />
        {/* warm afternoon light */}
        <hemisphereLight args={['#bcd7ff', '#8a7a5f', 0.55]} />
        <directionalLight
          position={[-28, 26, 18]}
          intensity={2.4}
          color="#ffdcb0"
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-34}
          shadow-camera-right={34}
          shadow-camera-top={34}
          shadow-camera-bottom={-34}
          shadow-camera-near={1}
          shadow-camera-far={100}
          shadow-bias={-0.0004}
        />
        <directionalLight position={[22, 14, -20]} intensity={0.4} color="#cfe4ff" />
        <ArenaShell tex={textures} />
        <ColosseumPlayerRig onExitRef={onExitRef} keysRef={keysPressed} stickRef={stickRef} />
      </Canvas>

      {/* HUD */}
      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="absolute top-3 left-1/2 -translate-x-1/2">
          <div className="bg-neutral-950/85 border border-amber-600/50 rounded-2xl px-4 py-2 text-center">
            <div className="font-serif font-black text-amber-100 text-sm tracking-wide">The Colosseum</div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400/80">
              Empty arena · walk the sand
            </div>
          </div>
        </div>
        <div className="absolute top-3 left-3 pointer-events-auto">
          <button
            type="button"
            onClick={() => onExitRef.current()}
            aria-label="Return to City"
            className="min-h-[44px] min-w-[44px] px-4 rounded-2xl bg-neutral-950/85 border border-amber-600/50 text-amber-200 font-serif font-bold text-sm hover:bg-amber-500/20 flex items-center"
          >
            ← Return to City
          </button>
        </div>
        <div className="absolute bottom-5 left-5 pointer-events-auto touch-none">
          <div
            ref={joystickRef}
            onTouchStart={handleJoystickTouchStart}
            onTouchMove={handleJoystickTouchMove}
            onTouchEnd={handleJoystickTouchEnd}
            onTouchCancel={handleJoystickTouchEnd}
            aria-label="Move"
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-neutral-950/60 border-2 border-amber-600/50 relative flex items-center justify-center"
          >
            <div className="absolute top-2 w-1.5 h-1.5 rounded-full bg-amber-500/50" />
            <div className="absolute bottom-2 w-1.5 h-1.5 rounded-full bg-amber-500/50" />
            <div className="absolute left-2 w-1.5 h-1.5 rounded-full bg-amber-500/50" />
            <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-amber-500/50" />
            <div
              className="w-10 h-10 rounded-full bg-gradient-to-b from-amber-500 to-amber-700 border-2 border-amber-300"
              style={{ transform: `translate(${knobPos.x}px, ${knobPos.y}px)` }}
            />
          </div>
          <div className="mt-1 text-center font-mono text-[10px] uppercase tracking-wider text-amber-300/80">
            Move
          </div>
        </div>
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 hidden sm:flex">
          <div className="bg-neutral-950/70 border border-neutral-700/60 rounded-xl px-3 py-1.5 text-[11px] font-mono text-neutral-300">
            WASD / arrows to walk · walk back through the east gate to leave
          </div>
        </div>
      </div>
    </div>
  );
};
