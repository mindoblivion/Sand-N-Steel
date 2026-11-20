/**
 * D-2 — FERRUM, Marcellin the Beastmaster's lion beside him in the arena.
 *
 * Renders the rigged, textured glTF lion (`/models/lion.glb`) cloned per mount
 * via `SkeletonUtils.clone` with `AnimationMixer` playback driven by Ferrum's
 * existing `BeastPose` transitions (`prowl`, `crouch`, `pounce-resolved`,
 * `fled`). Keeps a local `<Suspense>` + error boundary around the GLB loader
 * using the original low-poly primitive stand-in as a non-blocking fallback so
 * neither loading nor a transient asset failure ever hides or breaks the duel.
 */
import React, { Component, Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import type { BeastPose } from '../../utils/beastHunt';
import { impactAnimationScale, type ImpactState } from './GladiatorMesh';

export const LION_MODEL_URL = '/models/lion.glb' as const;

/**
 * Inspected model bounds at 1.0x are 0.42m W x 0.95m H x 1.90m L (facing +Z).
 * 1.18x matches the arena placeholder footprint (~1.12m H x ~2.24m L) and
 * scales naturally alongside the ~1.8m humanoid gladiators.
 */
export const LION_SCALE = 1.18;

/** Ground lift to keep paw tips flush on the sand plane across Idle/Sneak. */
export const LION_GROUND_Y = 0.015;

export type BeastAnimationBehavior = 'idle' | 'prowl' | 'crouch' | 'pounce' | 'walk' | 'run';

/** Exact embedded glTF animation clip names inside `/models/lion.glb`. */
export const BEAST_ANIMATION_MAP: Record<BeastAnimationBehavior, string> = {
  idle: 'Idle',
  prowl: 'Idle',
  crouch: 'Sneak',
  pounce: 'Bite',
  walk: 'Walk',
  run: 'Run',
};

const LOOPING_CLIPS = new Set<string>(['Idle', 'Sneak', 'Walk', 'Run']);

export interface BeastFigureProps {
  position: [number, number, number];
  rotationY?: number;
  pose: BeastPose;
  wounds?: number;
  impactRef?: React.MutableRefObject<ImpactState>;
}

/**
 * Compute Ferrum's retreat target from its current world pose.
 * The lion model faces +Z, so adding PI turns it directly away from its
 * current heading; the world-space displacement uses the same +Z convention.
 */
export function getBeastFleeTarget(
  currentPosition: readonly [number, number, number],
  currentYaw: number,
  distance = 4.5,
): { position: [number, number, number]; yaw: number } {
  const yaw = currentYaw + Math.PI;
  return {
    position: [
      currentPosition[0] + Math.sin(yaw) * distance,
      currentPosition[1],
      currentPosition[2] + Math.cos(yaw) * distance,
    ],
    yaw,
  };
}

/**
 * Compute world Y rotation for a model whose forward axis is `+Z` so it aims
 * from `beastPos` toward `targetPos`.
 */
/**
 * Keep the flee destination authoritative after Ferrum has entered the
 * terminal retreat pose. Parent renders may provide a fresh spawn-position
 * tuple, but must not pull the retreating lion back toward the arena center.
 */
export function syncBeastTargetPosition(
  target: THREE.Vector3,
  position: readonly [number, number, number],
  pose: BeastPose,
): boolean {
  if (pose === 'fled') return false;
  target.set(position[0], position[1], position[2]);
  return true;
}

export function beastFacingYaw(
  beastPos: readonly [number, number, number],
  targetPos: readonly [number, number, number],
): number {
  const dx = targetPos[0] - beastPos[0];
  const dz = targetPos[2] - beastPos[2];
  if (dx === 0 && dz === 0) return 0;
  return Math.atan2(dx, dz);
}

/** Map Ferrum's duel state (and optional locomotion) to an exact GLB clip name. */
export function clipNameForBeastPose(pose: BeastPose, isMoving = false): string {
  if (pose === 'crouch') return BEAST_ANIMATION_MAP.crouch;
  if (pose === 'pounce-resolved') return BEAST_ANIMATION_MAP.pounce;
  if (pose === 'fled') return BEAST_ANIMATION_MAP.run;
  return isMoving ? BEAST_ANIMATION_MAP.walk : BEAST_ANIMATION_MAP.prowl;
}

/**
 * All clips in `lion.glb` begin at `t = 0.0333s` (frame 1). Clone and shift
 * keyframe times so `t = 0` starts cleanly without a 1-frame freeze at start or
 * loop wraparound.
 */
export function normalizeBeastClipStart(clip: THREE.AnimationClip): THREE.AnimationClip {
  const cloned = clip.clone();
  let minStart = Infinity;
  for (const track of cloned.tracks) {
    if (track.times.length > 0 && track.times[0] < minStart) {
      minStart = track.times[0];
    }
  }
  if (Number.isFinite(minStart) && minStart > 0 && minStart < 0.1) {
    for (const track of cloned.tracks) {
      const shifted = new Float32Array(track.times.length);
      for (let i = 0; i < track.times.length; i++) {
        shifted[i] = Math.max(0, track.times[i] - minStart);
      }
      track.times = shifted;
    }
    cloned.resetDuration();
  }
  return cloned;
}

/** Fallback palette matching the arena sand/hide tone while GLB streams or on load error. */
const HIDE_COLOR = '#a16207';
const MANE_COLOR = '#3f2410';

export const PrimitiveBeastStandIn: React.FC<{
  position: [number, number, number];
  rotationY?: number;
  pose: BeastPose;
}> = ({ position, rotationY = 0, pose }) => {
  const hide = useMemo(
    () => new THREE.MeshStandardMaterial({ color: HIDE_COLOR, roughness: 0.92, metalness: 0 }),
    [],
  );
  const mane = useMemo(
    () => new THREE.MeshStandardMaterial({ color: MANE_COLOR, roughness: 0.98, metalness: 0 }),
    [],
  );

  useEffect(() => {
    return () => {
      hide.dispose();
      mane.dispose();
    };
  }, [hide, mane]);

  // Primitive fallback faces +Z to match the glTF lion's forward convention.
  const crouched = pose === 'crouch';
  const bodyY = crouched ? 0.62 : 0.82;
  const headY = crouched ? 0.66 : 0.98;
  const headZ = crouched ? 0.86 : 0.78;
  const legHeight = crouched ? 0.5 : 0.7;

  return (
    <group position={position} rotation={[0, rotationY, 0]} name="beast-ferrum-fallback">
      <mesh material={hide} position={[0, bodyY, 0]} castShadow>
        <boxGeometry args={[0.42, 0.44, 1.25]} />
      </mesh>
      <mesh material={hide} position={[0, bodyY + 0.06, 0.42]} castShadow>
        <boxGeometry args={[0.5, 0.5, 0.42]} />
      </mesh>
      <mesh material={hide} position={[0, headY, headZ]} castShadow>
        <boxGeometry args={[0.34, 0.32, 0.4]} />
      </mesh>
      <mesh material={mane} position={[0, headY + 0.03, headZ - 0.16]} castShadow>
        <boxGeometry args={[0.46, 0.46, 0.3]} />
      </mesh>
      <mesh material={hide} position={[-0.16, legHeight / 2, 0.4]} castShadow>
        <boxGeometry args={[0.13, legHeight, 0.16]} />
      </mesh>
      <mesh material={hide} position={[0.16, legHeight / 2, 0.4]} castShadow>
        <boxGeometry args={[0.13, legHeight, 0.16]} />
      </mesh>
      <mesh material={hide} position={[-0.16, legHeight / 2, -0.42]} castShadow>
        <boxGeometry args={[0.13, legHeight, 0.16]} />
      </mesh>
      <mesh material={hide} position={[0.16, legHeight / 2, -0.42]} castShadow>
        <boxGeometry args={[0.13, legHeight, 0.16]} />
      </mesh>
      <mesh material={mane} position={[0, bodyY + 0.14, -0.72]} rotation={[-0.5, 0, 0]} castShadow>
        <boxGeometry args={[0.07, 0.62, 0.07]} />
      </mesh>
    </group>
  );
};

interface BoundaryProps {
  fallback: React.ReactNode;
  children: React.ReactNode;
}

interface BoundaryState {
  hasError: boolean;
}

class BeastModelErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(err: unknown): void {
    console.warn('[BeastFigure] Failed to render lion GLB, using fallback stand-in:', err);
  }

  render(): React.ReactNode {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function shortestAngleDiff(from: number, to: number): number {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

const LionGLB: React.FC<BeastFigureProps> = ({
  position,
  rotationY = 0,
  pose,
  wounds = 0,
  impactRef,
}) => {
  const gltf = useGLTF(LION_MODEL_URL);

  const outerGroupRef = useRef<THREE.Group>(null);
  const recoilGroupRef = useRef<THREE.Group>(null);
  const targetPosRef = useRef(new THREE.Vector3(position[0], position[1], position[2]));
  const targetYawRef = useRef(rotationY);
  const poseRef = useRef<BeastPose>(pose);
  const prevPoseRef = useRef<BeastPose | null>(null);
  const prevWoundsRef = useRef(wounds);
  const biteActiveRef = useRef(false);
  const isMovingRef = useRef(false);
  const activeClipRef = useRef<string | null>(null);
  const hitFlashTimerRef = useRef(0);
  const recoilRef = useRef(0);

  useEffect(() => {
    syncBeastTargetPosition(targetPosRef.current, position, pose);
  }, [position[0], position[1], position[2], pose]);

  useEffect(() => {
    targetYawRef.current = rotationY;
  }, [rotationY]);

  poseRef.current = pose;

  const { clonedScene, clonedMaterials, hasSkinnedLion } = useMemo(() => {
    const clone = SkeletonUtils.clone(gltf.scene);
    const materials: THREE.MeshStandardMaterial[] = [];
    let hasSkinned = false;

    clone.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        hasSkinned = true;
      }
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;

        // Clone material wrapper per mount so hit-reaction emissive pulses never
        // mutate shared useGLTF cache state; GPU textures stay shared.
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((mat) => {
            const copy = mat.clone();
            if (copy instanceof THREE.MeshStandardMaterial) materials.push(copy);
            return copy;
          });
        } else if (mesh.material) {
          const copy = mesh.material.clone();
          if (copy instanceof THREE.MeshStandardMaterial) materials.push(copy);
          mesh.material = copy;
        }
      }
    });

    return {
      clonedScene: clone,
      clonedMaterials: materials,
      hasSkinnedLion: hasSkinned,
    };
  }, [gltf.scene]);

  useEffect(() => {
    return () => {
      for (const mat of clonedMaterials) {
        mat.dispose();
      }
    };
  }, [clonedMaterials]);

  const normalizedClips = useMemo(
    () => (gltf.animations ?? []).map(normalizeBeastClipStart),
    [gltf.animations],
  );

  const { mixer, actions } = useMemo(() => {
    const animMixer = new THREE.AnimationMixer(clonedScene);
    const map = new Map<string, THREE.AnimationAction>();
    for (const clip of normalizedClips) {
      const action = animMixer.clipAction(clip);
      if (LOOPING_CLIPS.has(clip.name)) {
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
      } else {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      map.set(clip.name, action);
    }
    return { mixer: animMixer, actions: map };
  }, [clonedScene, normalizedClips]);

  const switchClip = useMemo(() => {
    return (nextName: string, fadeSec = 0.2, forceRestart = false) => {
      const nextAction = actions.get(nextName) ?? actions.get(BEAST_ANIMATION_MAP.idle);
      if (!nextAction) return;
      const resolvedName = nextAction.getClip().name;
      const prevName = activeClipRef.current;

      if (!forceRestart && prevName === resolvedName && nextAction.isRunning()) {
        return;
      }

      const prevAction = prevName ? actions.get(prevName) : undefined;
      nextAction.enabled = true;
      nextAction.setEffectiveTimeScale(1);
      nextAction.setEffectiveWeight(1);
      nextAction.reset();
      nextAction.play();

      if (prevAction && prevAction !== nextAction) {
        prevAction.crossFadeTo(nextAction, fadeSec, false);
      }

      activeClipRef.current = resolvedName;
    };
  }, [actions]);

  useEffect(() => {
    const onFinished = (event: { action: THREE.AnimationAction }) => {
      if (event.action.getClip().name !== BEAST_ANIMATION_MAP.pounce) return;
      biteActiveRef.current = false;
      const desired =
        poseRef.current === 'crouch'
          ? BEAST_ANIMATION_MAP.crouch
          : isMovingRef.current
          ? BEAST_ANIMATION_MAP.walk
          : BEAST_ANIMATION_MAP.idle;
      switchClip(desired, 0.18, false);
    };

    mixer.addEventListener('finished', onFinished);

    // Initialize starting pose immediately without a T-pose frame.
    const initialClip = clipNameForBeastPose(poseRef.current, false);
    prevPoseRef.current = poseRef.current;
    biteActiveRef.current = initialClip === BEAST_ANIMATION_MAP.pounce;
    switchClip(initialClip, 0, true);
    mixer.update(0);

    return () => {
      mixer.removeEventListener('finished', onFinished);
      mixer.stopAllAction();
      mixer.uncacheRoot(clonedScene);
      activeClipRef.current = null;
    };
  }, [mixer, clonedScene, switchClip]);

  // Respond strictly to Ferrum's BeastPose transitions.
  useEffect(() => {
    if (prevPoseRef.current === pose) return;
    prevPoseRef.current = pose;

    if (pose === 'fled') {
      // Ferrum turns away from the player and runs clear of the arena instead
      // of disappearing the instant the hunt state changes to "fled".
      biteActiveRef.current = false;
      const current = outerGroupRef.current?.position ?? targetPosRef.current;
      const retreat = getBeastFleeTarget(
        // targetPosRef stores the unlifted ground height; outerGroupRef already
        // includes LION_GROUND_Y and would otherwise apply the lift twice.
        [current.x, targetPosRef.current.y, current.z],
        outerGroupRef.current?.rotation.y ?? targetYawRef.current,
      );
      targetYawRef.current = retreat.yaw;
      targetPosRef.current.set(...retreat.position);
      isMovingRef.current = true;
      switchClip(BEAST_ANIMATION_MAP.run, 0.12, true);
      return;
    }

    if (pose === 'crouch') {
      biteActiveRef.current = false;
      switchClip(BEAST_ANIMATION_MAP.crouch, 0.2, false);
      return;
    }

    if (pose === 'pounce-resolved') {
      const hasBite = actions.has(BEAST_ANIMATION_MAP.pounce);
      if (hasBite) {
        biteActiveRef.current = true;
        switchClip(BEAST_ANIMATION_MAP.pounce, 0.12, true);
      } else {
        biteActiveRef.current = false;
        switchClip(BEAST_ANIMATION_MAP.idle, 0.2, false);
      }
      return;
    }

    // Returning from pounce-resolved -> prowl lets a live Bite clip finish
    // gracefully; if Bite is already done, transition back to Idle/Walk.
    if (!biteActiveRef.current) {
      switchClip(clipNameForBeastPose(pose, isMovingRef.current), 0.2, false);
    }
  }, [pose, actions, switchClip]);

  // Non-clip fallback hit reaction when wounds increment (no hit clip exists in lion.glb).
  useEffect(() => {
    if (wounds > prevWoundsRef.current) {
      hitFlashTimerRef.current = 0.24;
      recoilRef.current = 1;
    }
    prevWoundsRef.current = wounds;
  }, [wounds]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const animScale = impactAnimationScale(impactRef?.current);

    if (outerGroupRef.current) {
      const currentPos = outerGroupRef.current.position;
      const targetPos = targetPosRef.current;
      const dx = targetPos.x - currentPos.x;
      const dz = targetPos.z - currentPos.z;
      const dist = Math.hypot(dx, dz);

      if (dist > 0.02) {
        const step = Math.min(1, delta * 5.5);
        currentPos.x += dx * step;
        currentPos.z += dz * step;
      } else {
        currentPos.x = targetPos.x;
        currentPos.z = targetPos.z;
      }
      currentPos.y = targetPos.y + LION_GROUND_Y;

      const curYaw = outerGroupRef.current.rotation.y;
      const yawDiff = shortestAngleDiff(curYaw, targetYawRef.current);
      outerGroupRef.current.rotation.y = curYaw + yawDiff * Math.min(1, delta * 8);

      const movingNow = dist > 0.08;
      if (movingNow !== isMovingRef.current) {
        isMovingRef.current = movingNow;
        if (poseRef.current === 'prowl' && !biteActiveRef.current) {
          switchClip(movingNow ? BEAST_ANIMATION_MAP.walk : BEAST_ANIMATION_MAP.idle, 0.18, false);
        } else if (poseRef.current === 'fled') {
          // Finish the retreat cleanly instead of looping the Run clip in place.
          switchClip(movingNow ? BEAST_ANIMATION_MAP.run : BEAST_ANIMATION_MAP.idle, 0.18, false);
        }
      }
    }

    // Fallback hit-reaction flash & subtle recoil decay (never blocks clip transitions).
    if (hitFlashTimerRef.current > 0) {
      hitFlashTimerRef.current = Math.max(0, hitFlashTimerRef.current - delta);
      const intensity = (hitFlashTimerRef.current / 0.24) * 0.75;
      for (const mat of clonedMaterials) {
        mat.emissive.set('#991b1b');
        mat.emissiveIntensity = intensity;
      }
    } else if (clonedMaterials.length > 0 && clonedMaterials[0].emissiveIntensity !== 0) {
      for (const mat of clonedMaterials) {
        mat.emissive.set('#000000');
        mat.emissiveIntensity = 0;
      }
    }

    if (recoilGroupRef.current) {
      if (recoilRef.current > 0.005) {
        recoilRef.current = Math.max(0, recoilRef.current - delta * 6);
        recoilGroupRef.current.position.z = -0.14 * recoilRef.current;
        recoilGroupRef.current.rotation.x = -0.08 * recoilRef.current;
      } else if (recoilGroupRef.current.position.z !== 0 || recoilGroupRef.current.rotation.x !== 0) {
        recoilGroupRef.current.position.z = 0;
        recoilGroupRef.current.rotation.x = 0;
      }
    }

    mixer.update(delta * animScale);
  });

  if (!hasSkinnedLion) {
    return <PrimitiveBeastStandIn position={position} rotationY={rotationY} pose={pose} />;
  }

  return (
    <group
      ref={outerGroupRef}
      position={[position[0], position[1] + LION_GROUND_Y, position[2]]}
      rotation={[0, rotationY, 0]}
      name="beast-ferrum"
    >
      <group ref={recoilGroupRef} scale={[LION_SCALE, LION_SCALE, LION_SCALE]}>
        <primitive object={clonedScene} />
      </group>
    </group>
  );
};

export const BeastFigure: React.FC<BeastFigureProps> = (props) => {
  const fallback = (
    <PrimitiveBeastStandIn
      position={props.position}
      rotationY={props.rotationY}
      pose={props.pose}
    />
  );

  return (
    <BeastModelErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <LionGLB {...props} />
      </Suspense>
    </BeastModelErrorBoundary>
  );
};
