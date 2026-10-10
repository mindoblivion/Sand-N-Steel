import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, createPortal } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import { FighterState } from '../../types/game';

interface GladiatorMeshProps {
  fighter: FighterState;
  overrideAction?: FighterState['action'];
  isLeftyMode?: boolean;
}

// Global cache for GLB file presence & validity check
let glbStatusCache: 'unknown' | 'valid' | 'invalid' = 'unknown';
let glbCheckPromise: Promise<boolean> | null = null;

export async function isRealGlbFile(url: string): Promise<boolean> {
  if (glbStatusCache !== 'unknown') {
    return glbStatusCache === 'valid';
  }
  if (!glbCheckPromise) {
    glbCheckPromise = (async () => {
      try {
        const res = await fetch(url, {
          headers: { Range: 'bytes=0-3' },
          cache: 'no-cache',
        });
        if (!res.ok) {
          glbStatusCache = 'invalid';
          return false;
        }
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          glbStatusCache = 'invalid';
          return false;
        }
        const buf = await res.arrayBuffer();
        if (buf.byteLength < 4) {
          glbStatusCache = 'invalid';
          return false;
        }
        const view = new DataView(buf);
        const isGlb = view.getUint32(0, true) === 0x46546C67;
        glbStatusCache = isGlb ? 'valid' : 'invalid';
        return isGlb;
      } catch {
        glbStatusCache = 'invalid';
        return false;
      }
    })();
  }
  return glbCheckPromise;
}

export function useGlbAvailability(url: string): boolean {
  const [isAvailable, setIsAvailable] = useState<boolean>(() => glbStatusCache === 'valid');

  useEffect(() => {
    if (glbStatusCache === 'valid') {
      setIsAvailable(true);
      return;
    }
    if (glbStatusCache === 'invalid') {
      setIsAvailable(false);
      return;
    }

    let isMounted = true;
    isRealGlbFile(url).then((valid) => {
      if (isMounted) {
        setIsAvailable(valid);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [url]);

  return isAvailable;
}

// Preload the gladiator model asset safely
try {
  useGLTF.preload('/models/arena_roman.glb');
} catch (e) {
  // Silent fallback
}

// Shared Weapon Renderer Component
const WeaponModel: React.FC<{ weaponType: string; goldColor: string }> = ({ weaponType, goldColor }) => {
  return (
    <group position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
      {weaponType === 'spear' ? (
        <>
          <mesh castShadow position={[0, -0.2, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 2.1, 10]} />
            <meshStandardMaterial color="#78350f" roughness={0.7} />
          </mesh>
          <mesh castShadow position={[0, 0.9, 0]}>
            <coneGeometry args={[0.065, 0.45, 8]} />
            <meshStandardMaterial color="#f8fafc" metalness={0.95} roughness={0.1} />
          </mesh>
        </>
      ) : weaponType === 'mace' ? (
        <>
          <mesh castShadow position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.03, 0.035, 0.85, 8]} />
            <meshStandardMaterial color="#451a03" roughness={0.8} />
          </mesh>
          <mesh castShadow position={[0, 0.52, 0]}>
            <sphereGeometry args={[0.1, 12, 12]} />
            <meshStandardMaterial color={goldColor} metalness={0.9} roughness={0.2} />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[0, -0.16, 0]}>
            <sphereGeometry args={[0.045, 12, 12]} />
            <meshStandardMaterial color={goldColor} metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh castShadow position={[0, -0.06, 0]}>
            <cylinderGeometry args={[0.025, 0.028, 0.16, 8]} />
            <meshStandardMaterial color="#78350f" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.04, 0]}>
            <boxGeometry args={[0.16, 0.04, 0.05]} />
            <meshStandardMaterial color={goldColor} metalness={0.9} roughness={0.2} />
          </mesh>
          <mesh castShadow position={[0, 0.44, 0]}>
            <boxGeometry args={[0.075, 0.76, 0.016]} />
            <meshStandardMaterial color="#f8fafc" metalness={0.95} roughness={0.1} />
          </mesh>
          <mesh castShadow position={[0, 0.86, 0]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.053, 0.053, 0.016]} />
            <meshStandardMaterial color="#f8fafc" metalness={0.95} roughness={0.1} />
          </mesh>
        </>
      )}
    </group>
  );
};

// ---------------------------------------------------------------------------
// Gladius GLB Mesh — renders the real weapon asset when the equipped item's
// modelPath matches the gladius. Loaded on demand via useGLTF (drei's own
// URL-keyed cache). The outer group mirrors the procedural WeaponModel's
// [Math.PI / 2, 0, 0] rotation so the blade (local +Y) points forward from the
// hand, matching the verified gladius convention.
// ---------------------------------------------------------------------------
const GLADIUS_MODEL_PATH = '/models/weapons/gladius.glb';

const GladiusMesh: React.FC = () => {
  const gltf = useGLTF(GLADIUS_MODEL_PATH);
  const cloned = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);

  useEffect(() => {
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [cloned]);

  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <primitive object={cloned} />
    </group>
  );
};

// Narrow error boundary for the weapon GLB only — a load failure falls back to
// the procedural WeaponModel without taking down the character or the duel.
class WeaponGLBErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('[GladiatorMesh] Gladius GLB failed to load, falling back to procedural weapon:', err);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

/** Renders the gladius GLB when available; procedural weapon on load/suspend. */
const GladiusWeaponRenderer: React.FC<{ weaponType: string; goldColor: string }> = ({
  weaponType,
  goldColor,
}) => {
  const procedural = <WeaponModel weaponType={weaponType} goldColor={goldColor} />;
  return (
    <WeaponGLBErrorBoundary fallback={procedural}>
      <React.Suspense fallback={procedural}>
        <GladiusMesh />
      </React.Suspense>
    </WeaponGLBErrorBoundary>
  );
};

// Bone-local shield rotations for arena_roman.glb (Euler XYZ, radians).
// The rig's hand_l / hand_r frames are not mirror images, and in Fighting_Idle
// (the rest stance used by creation, city hub and duel) each hand's local +Z —
// the shield's face normal — points 45-66° upward, so spinning about Z cannot
// stand the board up. Each value is the inverse of that hand bone's mean
// model-space rotation over Fighting_Idle, composed with a 45° outward yaw:
// in the idle stance the board stands ~3° off vertical and faces
// forward-outward on the shield side. Other clips move the hand freely.
const SHIELD_ROTATION_LEFT_HAND: [number, number, number] = [-2.42, -0.67, 2.91]; // righty
const SHIELD_ROTATION_RIGHT_HAND: [number, number, number] = [3.02, 1.28, -1.06]; // lefty

// The shield geometry (0.68 x 1.15) was sized for the procedural fallback
// gladiator (~2.10 units tall, 0.55x its height). The rigged GLB character is
// ~0.98 units tall, so the unscaled board is 1.17x the character. Scaling by
// the GLB/procedural height ratio (~0.47) restores the same 0.55x proportion
// and brings the shield top to head level instead of 0.3 units above.
const SHIELD_SCALE_GLB = 0.47;

// --- Phase 111: Animation-Aware Shield Constraint Prototype ---
// Disabled by default. When enabled, corrects the shield's world-space
// orientation in useFrame so the board stays approximately upright during
// idle, walk, and block, while allowing natural movement during attacks,
// hits, and death. No effect on gameplay or saved data.
// Phase 115 replaced the two discontinuous constructions the Phase 114 audit
// flagged — the straight up-vector lerp (180° flip at the ~0.5 pole) and the
// cardinal-axis forward fallback (48-101° jumps at axis-selection ties) — with
// continuous ones. Phase 117 replaced the corrected-up construction itself: the
// Phase 115 axis blend is ill conditioned near the antipode and produced a
// 106.9° single-frame shield swing on the real Roll clip. See the useFrame block
// below. The roll recovery step (5) is unchanged, and its known limits are
// documented in the Phase 117 report.
const SHIELD_CONSTRAINT_ENABLED = false;

// Phase 117: up-correction fade band (radians) for the two-factor construction.
// Below the start the corrected up is the plain great-circle walk of Phase 115;
// above it the board up is carried to world up by a well-conditioned two-factor
// rotation (see step 4 below). The band is deliberately wide: it is the *rate*
// of the fade weight, not its shape, that produced the Phase 116 failure, and a
// wide ramp keeps that rate low where the walk's axis is at its worst.
const SHIELD_UPRIGHT_FADE_START = (30 * Math.PI) / 180;
const SHIELD_UPRIGHT_FADE_END = Math.PI;

// Pre-allocated scratch — module-level to avoid per-frame GC pressure, but none
// of it holds state between frames or between component instances (Phase 115):
// the constraint is a pure function of the current frame's bone transform, so
// the player and the opponent cannot contaminate each other.
const _cHandQ = new THREE.Quaternion();
const _cInvHandQ = new THREE.Quaternion();
const _cUp = new THREE.Vector3();
const _cFwd = new THREE.Vector3();
const _cRight = new THREE.Vector3();
const _cDesUp = new THREE.Vector3();
const _cDesFwd = new THREE.Vector3();
const _cAxis = new THREE.Vector3(); // correction axis: walk axis / factor-1 axis (Phase 117)
const _cTangent = new THREE.Vector3(); // rotation tangent (Phases 115 / 117)
const _cMidAxis = new THREE.Vector3(); // board-frame direction perpendicular to world up (Phase 117)
const _cMidDir = new THREE.Vector3(); // up waypoint between board up and that direction (Phase 117)
const _cMidProj = new THREE.Vector3(); // face normal projected off world up (Phase 117)
const _cMidProjB = new THREE.Vector3(); // board right axis projected off world up (Phase 117)
const _cFinishAxis = new THREE.Vector3(); // factor-2 axis, uMid × world up (Phase 117)
const _cSwingFwd = new THREE.Vector3(); // face normal carried by the no-twist rotation (Phase 115)
const _cBoardQ = new THREE.Quaternion(); // board's current world rotation (Phase 115)
const _cSwingQ = new THREE.Quaternion(); // no-twist rotation candidate (Phase 115)
const _cRollQ = new THREE.Quaternion(); // roll correction about the corrected up (Phase 115)
const _cDesiredQ = new THREE.Quaternion();
const _cWorldUp = new THREE.Vector3(0, 1, 0);

const SHIELD_BASE_Q_RIGHTY = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(-2.42, -0.67, 2.91, 'XYZ'),
);
const SHIELD_BASE_Q_LEFTY = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(3.02, 1.28, -1.06, 'XYZ'),
);

// Constraint strength by action: 0 = no correction (fully follows bone),
// 1 = shield locked upright. Strength interpolates smoothly between values.
const SHIELD_CONSTRAINT_STRENGTH: Record<string, number> = {
  idle: 0.7,
  walk: 0.7,
  block: 0.7,
  attack_light: 0.3,
  attack_heavy: 0.2,
  hit: 0.2,
  dodge: 0.3,
  death: 0.0,
};

// Shared Shield Renderer Component
const ShieldModel = React.forwardRef<THREE.Group, { isLefty: boolean; goldColor: string }>(({ isLefty, goldColor }, ref) => {
  return (
    <group ref={ref} position={[0, 0, 0]} rotation={isLefty ? SHIELD_ROTATION_RIGHT_HAND : SHIELD_ROTATION_LEFT_HAND} scale={SHIELD_SCALE_GLB}>
      {/* Offset the board along its own face-normal (+Z = outward) so the
          hand bone sits behind the board instead of passing through it.
          0.15 pre-scale × 0.47 ≈ 0.071 world units, clearing the forearm
          radius (~0.04) without the shield floating away from the arm. */}
      <group position={[0, 0, 0.15]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.68, 1.15, 0.05]} />
          <meshStandardMaterial color="#881337" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0, 0.028]}>
          <boxGeometry args={[0.7, 1.17, 0.01]} />
          <meshStandardMaterial color={goldColor} metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh castShadow position={[0, 0, 0.06]}>
          <sphereGeometry args={[0.14, 16, 16]} />
          <meshStandardMaterial color={goldColor} metalness={0.9} roughness={0.15} />
        </mesh>
        <mesh position={[0, 0.25, 0.035]}>
          <boxGeometry args={[0.35, 0.05, 0.01]} />
          <meshStandardMaterial color="#fef08a" metalness={0.7} />
        </mesh>
        <mesh position={[0, -0.25, 0.035]}>
          <boxGeometry args={[0.35, 0.05, 0.01]} />
          <meshStandardMaterial color="#fef08a" metalness={0.7} />
        </mesh>
      </group>
    </group>
  );
});

/**
 * 1. High-Detail Rigged GLB Model Loader with Bone-Attached Equipment
 */
const RomanWarriorGLB: React.FC<{
  fighter: FighterState;
  overrideAction?: FighterState['action'];
  isLeftyMode?: boolean;
  onInvalidModel?: () => void;
}> = ({
  fighter,
  overrideAction,
  isLeftyMode,
  onInvalidModel,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const currentActionName = useRef<string>('');
  const flashTimerRef = useRef(0);
  const lastActionRef = useRef<string>('');
  const shieldGroupRef = useRef<THREE.Group>(null);
  const shieldStrengthRef = useRef(0);

  const gltf = useGLTF('/models/arena_roman.glb');

  const hasRiggedCharacter = useMemo(() => {
    if (!gltf || !gltf.scene) return false;
    let meshCount = 0;
    let hasSkinned = false;
    gltf.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) meshCount++;
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh) hasSkinned = true;
    });
    return gltf.animations && gltf.animations.length > 0 && (hasSkinned || meshCount > 6);
  }, [gltf]);

  useEffect(() => {
    if (!hasRiggedCharacter && onInvalidModel) {
      onInvalidModel();
    }
  }, [hasRiggedCharacter, onInvalidModel]);

  const { clonedScene, rightHandBone, leftHandBone } = useMemo(() => {
    const clone = SkeletonUtils.clone(gltf.scene);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const name = child.name.toLowerCase();
        if (name.includes('sword') || name.includes('shield') || name.includes('weapon') || name.includes('gladius')) {
          child.visible = false; // Hide any baked-in duplicate equipment
        }
      }
    });

    let rHand: THREE.Object3D | null = null;
    let lHand: THREE.Object3D | null = null;
    clone.traverse((obj) => {
      if (obj.isBone) {
        const name = obj.name.toLowerCase();
        if ((name.includes('hand') || name.includes('wrist')) && (name.includes('r') || name.includes('right'))) {
          rHand = obj;
        }
        if ((name.includes('hand') || name.includes('wrist')) && (name.includes('l') || name.includes('left'))) {
          lHand = obj;
        }
      }
    });

    return { clonedScene: clone, rightHandBone: rHand, leftHandBone: lHand };
  }, [gltf.scene]);

  const { actions, names } = useAnimations(gltf.animations, groupRef);
  const activeAction = overrideAction || fighter.action;

  const targetClip = useMemo(() => {
    const findClip = (...candidates: string[]) => {
      for (const name of candidates) {
        if (actions && actions[name]) return name;
      }
      return names[0] || '';
    };

    switch (activeAction) {
      case 'walk':
        return findClip('Walk', 'Jog', 'Sprint', 'Crouch_Walk');
      case 'attack_light':
        return findClip('Sword_Attack', 'Sword_Regular_A', 'Sword_Regular_Combo', 'Fighting_Right_Jab');
      case 'attack_heavy':
        return findClip('Sword_Regular_C', 'Sword_Attack_Air_Vertical', 'Attack_Ground_Pound', 'Melee_Hook');
      case 'block':
        return findClip('Defend', 'Sword_Block', 'Idle_Shield', 'Shield_OneShot');
      case 'dodge':
        return findClip('Roll', 'Dodge_back', 'Dodge_left', 'Slide');
      case 'hit':
        return findClip('Hit_Chest', 'Hit_Head', 'Hit_Knockback');
      case 'death':
        return findClip('Death_A', 'Death_B', 'Death_C');
      case 'idle':
      default:
        return findClip('Fighting_Idle', 'Idle_Sword', 'Idle_Shield', 'Idle_A', 'Idle_Subtle');
    }
  }, [activeAction, actions, names]);

  useEffect(() => {
    if (!actions || !targetClip) return;
    const nextAction = actions[targetClip];
    if (!nextAction) return;

    if (currentActionName.current && currentActionName.current !== targetClip) {
      const prev = actions[currentActionName.current];
      if (prev) prev.fadeOut(0.14);
    }

    nextAction.reset();
    if (activeAction === 'death') {
      nextAction.setLoop(THREE.LoopOnce, 1);
      nextAction.clampWhenFinished = true;
    } else if (
      activeAction === 'hit' ||
      activeAction === 'attack_light' ||
      activeAction === 'attack_heavy' ||
      activeAction === 'dodge'
    ) {
      nextAction.setLoop(THREE.LoopOnce, 1);
    } else {
      nextAction.setLoop(THREE.LoopRepeat, Infinity);
    }
    nextAction.fadeIn(0.14).play();
    currentActionName.current = targetClip;
  }, [targetClip, actions, activeAction]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    // Detect a new hit via action transition. hitFlashTimer is set to 0.3 by
    // DuelScene on a hit but never decremented, so it alone can't signal a
    // fresh hit — the action prop transitions to 'hit' and later to 'idle'.
    if (fighter.action === 'hit' && lastActionRef.current !== 'hit') {
      flashTimerRef.current = fighter.hitFlashTimer || 0.3;
    }
    lastActionRef.current = fighter.action;

    if (flashTimerRef.current > 0) {
      flashTimerRef.current = Math.max(0, flashTimerRef.current - delta);
    }

    const isHit = flashTimerRef.current > 0;
    clonedScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (mat) {
          mat.emissive = isHit ? new THREE.Color('#ff0000') : new THREE.Color('#000000');
          mat.emissiveIntensity = isHit ? 0.8 : 0;
        }
      }
    });

    // --- Phase 111: Shield orientation constraint (disabled by default) ---
    // After the AnimationMixer has updated bone transforms (drei's
    // useAnimations runs its own useFrame before this one), read the shield
    // hand bone's current world quaternion and compute a corrected local
    // rotation for the shield group that keeps the board approximately
    // upright. Strength varies by action and interpolates smoothly.
    if (SHIELD_CONSTRAINT_ENABLED && shieldGroupRef.current) {
      const shieldBone = shieldGroupRef.current.parent;
      if (shieldBone) {
        // Interpolate strength toward target (matches 140ms crossfade rate)
        const targetStrength = SHIELD_CONSTRAINT_STRENGTH[activeAction] ?? 0.5;
        shieldStrengthRef.current = THREE.MathUtils.lerp(
          shieldStrengthRef.current, targetStrength, Math.min(1, delta * 8),
        );

        if (shieldStrengthRef.current > 0.01) {
          // 1. Get hand bone's current world quaternion (mixer already updated)
          shieldBone.updateWorldMatrix(true, false);
          shieldBone.getWorldQuaternion(_cHandQ);

          // 2. Compute current shield world rotation: q_hand × q_base
          const baseQ = isLefty ? SHIELD_BASE_Q_LEFTY : SHIELD_BASE_Q_RIGHTY;
          _cBoardQ.copy(_cHandQ).multiply(baseQ);

          // 3. Extract current board up (+Y) and face normal (+Z) in world
          _cUp.set(0, 1, 0).applyQuaternion(_cBoardQ);
          _cFwd.set(0, 0, 1).applyQuaternion(_cBoardQ);

          // 4. Corrected up (Phase 117). Phase 115 walked the great circle from
          //    the board's up toward world up, blending the walk's axis with the
          //    board's face normal where the walk is ill conditioned. Phase 116
          //    measured the consequence on the real asset: near the antipode the
          //    walk's axis turns by (motion / sin θ) and its blend weight moved
          //    far too fast, so one dodge frame (Roll, left-handed, t ≈ 0.783 s,
          //    hand turning 9.04°) swung the board up by 106.9°.
          //    The corrected up is now produced by a two-factor rotation instead:
          //      factor 1 — rotate u toward uMid, a board-frame direction that is
          //                 perpendicular to world up, about the axis u × uMid;
          //      factor 2 — complete the remaining quarter turn about uMid ×
          //                 world up, whose length is 1 by construction because
          //                 uMid is perpendicular to world up.
          //    Both factor axes are built from the pose alone, so neither
          //    inherits the unstable 1/sin θ direction that caused the flip, and
          //    both factor angles are scaled by strength: strength → 0 recovers
          //    the base orientation, and the strength-1 endpoint lands on world
          //    up exactly (measured error < 1e-6°, at every pose including the
          //    antipode). Below the fade start uMid is exactly u, which makes the
          //    whole construction the plain great-circle walk of Phase 115.
          const theta = Math.acos(THREE.MathUtils.clamp(_cUp.dot(_cWorldUp), -1, 1));
          if (theta < 1e-6) {
            // Board already upright: no correction, no axis to degenerate.
            _cDesUp.copy(_cUp);
          } else {
            const upFade = THREE.MathUtils.smoothstep(
              theta, SHIELD_UPRIGHT_FADE_START, SHIELD_UPRIGHT_FADE_END,
            );

            if (upFade > 0) {
              // Stable board-frame direction perpendicular to world up: the
              // board's face normal and its right axis (u × f), each projected
              // off world up and summed. The sum cannot vanish: the two
              // projections are orthogonal, so |sum|² ≥ 2cos²θ, which is
              // non-zero everywhere except exactly θ = 90° — and there the
              // board's own up projection carries the sum, while θ = 90° sits
              // below the fade start anyway.
              _cMidProj.copy(_cFwd).addScaledVector(_cWorldUp, -_cFwd.dot(_cWorldUp));
              _cAxis.crossVectors(_cUp, _cFwd); // board right axis (unit: u ⟂ f)
              _cMidProjB.copy(_cAxis).addScaledVector(_cWorldUp, -_cAxis.dot(_cWorldUp));
              _cMidAxis.copy(_cMidProjB).add(_cMidProj);
              if (_cMidAxis.lengthSq() > 1e-12) _cMidAxis.normalize();
              else _cMidAxis.copy(_cFwd);

              // uMid = slerp(u, that direction, upFade) — arc interpolation, not
              // a chord blend: a chord cancels when the two are far apart and
              // can swing the waypoint past world up (measured: it pushed uMid
              // to 150° from world up and re-introduced a 1/sin amplification).
              const cosArc = THREE.MathUtils.clamp(_cUp.dot(_cMidAxis), -1, 1);
              const sinArc = Math.sqrt(Math.max(0, 1 - cosArc * cosArc));
              if (sinArc > 1e-6) {
                const arc = Math.atan2(sinArc, cosArc);
                _cMidDir.copy(_cUp).multiplyScalar(Math.sin((1 - upFade) * arc) / sinArc)
                  .addScaledVector(_cMidAxis, Math.sin(upFade * arc) / sinArc);
              } else {
                _cMidDir.copy(_cUp);
              }
              if (_cMidDir.lengthSq() > 1e-12) _cMidDir.normalize();
              else _cMidDir.copy(_cUp);
            } else {
              _cMidDir.copy(_cUp);
            }

            // Factor 1 (u → uMid): angle from the two directions directly, so the
            // sign is fixed by |u × uMid| and no atan2 branch cut is involved.
            _cAxis.crossVectors(_cUp, _cMidDir);
            const sinA1 = _cAxis.length();
            const angle1 = Math.atan2(sinA1, THREE.MathUtils.clamp(_cUp.dot(_cMidDir), -1, 1));
            if (sinA1 > 1e-12) _cAxis.multiplyScalar(1 / sinA1);

            // Factor 2 (uMid → world up): axis uMid × world up, unit because uMid
            // is perpendicular to world up once the fade is on.
            _cFinishAxis.crossVectors(_cMidDir, _cWorldUp);
            const sinA2 = _cFinishAxis.length();
            const angle2 = Math.atan2(sinA2, THREE.MathUtils.clamp(_cMidDir.dot(_cWorldUp), -1, 1));
            if (sinA2 > 1e-12) _cFinishAxis.multiplyScalar(1 / sinA2);
            else _cFinishAxis.crossVectors(_cUp, _cWorldUp).normalize();

            // Apply both factors with their angles scaled by strength (Rodrigues;
            // every object here is preallocated, so the per-frame path allocates
            // nothing).
            const phi1 = sinA1 > 1e-12 ? shieldStrengthRef.current * angle1 : 0;
            _cDesUp.copy(_cUp).multiplyScalar(Math.cos(phi1));
            if (phi1 !== 0) {
              _cTangent.crossVectors(_cAxis, _cUp);
              _cDesUp.addScaledVector(_cTangent, Math.sin(phi1));
            }
            const phi2 = shieldStrengthRef.current * angle2;
            const cosPhi2 = Math.cos(phi2);
            const sinPhi2 = Math.sin(phi2);
            const axial2 = _cFinishAxis.dot(_cDesUp);
            _cTangent.crossVectors(_cFinishAxis, _cDesUp);
            _cDesUp.multiplyScalar(cosPhi2).addScaledVector(_cTangent, sinPhi2)
              .addScaledVector(_cFinishAxis, axial2 * (1 - cosPhi2));

            const desUpLenSq = _cDesUp.lengthSq();
            if (desUpLenSq > 1e-12) _cDesUp.multiplyScalar(1 / Math.sqrt(desUpLenSq));
            else _cDesUp.copy(_cWorldUp);
          }

          // 5. Roll recovery, as one continuous construction rather than a blend
          //    of two references. Blending references is not safe: Phase 114's
          //    two projected vectors are exactly antiparallel whenever the
          //    correction angle is 90° (dot = -ab/|projF||projR| = -1 there), so
          //    a 50/50 blend cancels and flips the facing 180°; and interpolating
          //    two *rotations* instead is ambiguous when they are 180° apart,
          //    which also flips. So:
          //      base   = the shortest (no-twist) rotation carrying the board up
          //               onto the corrected up — always well conditioned, since
          //               its angle is the correction angle (≤ 0.7π for every
          //               strength in the map) and never 180°;
          //      roll   = the signed rotation about the corrected up that would
          //               carry that face normal onto the projected one — i.e.
          //               exactly the Phase 113 projection, where the projection
          //               is well conditioned.
          //    The roll is weighted by that projection's conditioning only (Phase
          //    117 removed the extra fade toward the ±π branch cut). Fading the
          //    weight out near the cut was meant to avoid an undefined direction,
          //    but the *destination* is continuous there anyway: a roll of +179°
          //    and one of −179° differ only by the 358° ≡ −2° remainder, so both
          //    land the facing within ~2° of each other. Fading instead made the
          //    applied roll collapse — measured 121.7° → 0.6° over a single 9°
          //    pose step, a ~155° facing snap — which is the Phase 116 "latent
          //    ±π ambiguity" made real. For |roll| ≤ 120° the old weight was
          //    already 1, so every shipped pose (idle, walk, block, attack, hit,
          //    death) behaves exactly as before.
          //    Because the roll is about the corrected up itself, the corrected
          //    up is untouched by this step, whatever the weight.
          _cDesFwd.copy(_cFwd).addScaledVector(_cDesUp, -_cFwd.dot(_cDesUp));
          const faceLenSq = _cDesFwd.lengthSq();
          const faceProjLen = Math.sqrt(faceLenSq);
          if (faceLenSq > 1e-12) _cDesFwd.multiplyScalar(1 / Math.sqrt(faceLenSq));
          else _cDesFwd.set(0, 0, 0); // no direction to offer; its weight is 0 below

          _cSwingQ.setFromUnitVectors(_cUp, _cDesUp);
          _cDesiredQ.copy(_cSwingQ).multiply(_cBoardQ);
          _cSwingFwd.set(0, 0, 1).applyQuaternion(_cDesiredQ);

          const rollCos = _cSwingFwd.dot(_cDesFwd);
          const rollSin = _cRight.crossVectors(_cDesUp, _cSwingFwd).dot(_cDesFwd);
          const rollAngle = Math.atan2(rollSin, rollCos); // (-π, π], 0 when equal

          //    Conditioning: the projection's direction swings by (pose motion /
          //    |projection|) per frame, so it only deserves full weight while it
          //    is long; and drop it again as the two references approach
          //    opposition, where no interpolation direction is defined.
          const cond = THREE.MathUtils.clamp((faceProjLen - 0.2) / 0.3, 0, 1);
          const align = THREE.MathUtils.clamp((Math.PI - Math.abs(rollAngle)) / (Math.PI / 3), 0, 1);
          const rollWeight = (cond * cond * (3 - 2 * cond)) * (align * align * (3 - 2 * align));
          if (rollWeight > 0) {
            _cRollQ.setFromAxisAngle(_cDesUp, rollWeight * rollAngle);
            _cDesiredQ.premultiply(_cRollQ);
          }

          // 6. Convert to shield-local: q_local = q_hand⁻¹ × q_world_desired
          _cInvHandQ.copy(_cHandQ).invert();
          shieldGroupRef.current.quaternion.copy(_cInvHandQ).multiply(_cDesiredQ);
        } else {
          // Issue C: at negligible strength (e.g. death/fall) the correction
          // stops, but the shield's local quaternion would otherwise stay at
          // the last corrected value — frozen against the animated hand.
          // Restore the normal animation-driven orientation by resetting the
          // LOCAL rotation to the Phase 106 handedness base rotation. The hand
          // bone remains the parent, so the shield keeps following the hand
          // naturally; only the stale correction is removed. The correction at
          // strength → 0 reconstructs this same base orientation
          // (up = current up, forward = current forward), so the handoff across
          // the 0.01 gate is continuous.
          const baseQ = isLefty ? SHIELD_BASE_Q_LEFTY : SHIELD_BASE_Q_RIGHTY;
          shieldGroupRef.current.quaternion.copy(baseQ);
        }
      }
    }
  });

  const scale = fighter.meshScale || 1.0;
  const isLefty = isLeftyMode !== undefined ? isLeftyMode : fighter.isLeftyMode || false;
  const weaponItem = fighter.loadout?.weapon;
  const weaponType = weaponItem?.type || 'sword_shield';
  const goldColor = '#f59e0b';

  const useGladiusGLB = weaponItem?.modelPath === GLADIUS_MODEL_PATH;
  const weaponNode = useGladiusGLB
    ? <GladiusWeaponRenderer weaponType={weaponType} goldColor={goldColor} />
    : <WeaponModel weaponType={weaponType} goldColor={goldColor} />;
  const shieldNode = <ShieldModel ref={shieldGroupRef} isLefty={isLefty} goldColor={goldColor} />;

  // Anatomical assignment: Righty = Sword in Right Hand, Shield in Left Hand. Lefty = Reversed.
  const rightHandEquipment = isLefty ? shieldNode : weaponNode;
  const leftHandEquipment = isLefty ? weaponNode : shieldNode;

  return (
    <group
      ref={groupRef}
      position={fighter.position}
      rotation={[0, fighter.rotationY, 0]}
      scale={[scale, scale, scale]}
    >
      <primitive object={clonedScene} />
      {rightHandBone && createPortal(rightHandEquipment, rightHandBone)}
      {leftHandBone && createPortal(leftHandEquipment, leftHandBone)}
    </group>
  );
};


/**
 * 2. High-Fidelity Authentic Roman Gladiator
 * Supports standard Right-Handed mode (default) and Lefty Mode:
 * - Default: Right hand holds Gladius weapon, Left hand holds Scutum shield.
 * - Lefty Mode: Left hand holds Gladius weapon, Right hand holds Scutum shield.
 */
const ProceduralGladiator: React.FC<{
  fighter: FighterState;
  overrideAction?: FighterState['action'];
  isLeftyMode?: boolean;
}> = ({ fighter, overrideAction, isLeftyMode = false }) => {
  const rootRef = useRef<THREE.Group>(null);
  const hipsRef = useRef<THREE.Group>(null);
  const torsoRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftKneeRef = useRef<THREE.Group>(null);
  const rightKneeRef = useRef<THREE.Group>(null);
  const crestRef = useRef<THREE.Group>(null);

  const [flashActive, setFlashActive] = useState(false);
  const flashTimerRef = useRef(0);
  const lastActionRef = useRef(fighter.action);

  const activeAction = overrideAction || fighter.action;
  const isLefty = isLeftyMode || fighter.isLeftyMode || false;

  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();

    if (!hipsRef.current || !torsoRef.current || !headRef.current) return;

    const weaponArm = isLefty ? leftArmRef : rightArmRef;
    const shieldArm = isLefty ? rightArmRef : leftArmRef;

    if (activeAction === 'walk') {
      const walkSpeed = 9.5;
      const cycle = t * walkSpeed;
      const legSwing = Math.sin(cycle) * 0.7;
      const armSwing = Math.sin(cycle) * 0.5;

      if (leftLegRef.current && rightLegRef.current) {
        leftLegRef.current.rotation.x = legSwing;
        rightLegRef.current.rotation.x = -legSwing;
      }
      if (leftKneeRef.current && rightKneeRef.current) {
        leftKneeRef.current.rotation.x = legSwing > 0 ? legSwing * 0.75 : 0;
        rightKneeRef.current.rotation.x = -legSwing > 0 ? -legSwing * 0.75 : 0;
      }

      const bounce = Math.abs(Math.sin(cycle * 2)) * 0.1;
      hipsRef.current.position.y = bounce;
      torsoRef.current.rotation.x = 0.15;
      torsoRef.current.rotation.y = Math.sin(cycle) * (isLefty ? -0.1 : 0.1);

      if (shieldArm.current) {
        shieldArm.current.rotation.x = -0.42 + armSwing * 0.3;
        shieldArm.current.rotation.y = isLefty ? -0.28 : 0.28;
        shieldArm.current.rotation.z = isLefty ? 0.12 : -0.12;
      }
      if (weaponArm.current) {
        weaponArm.current.rotation.x = -0.28 - armSwing * 0.55;
        weaponArm.current.rotation.y = isLefty ? 0.15 : -0.15;
        weaponArm.current.rotation.z = isLefty ? -0.1 : 0.1;
      }

      headRef.current.rotation.x = -0.12;
      headRef.current.rotation.y = -Math.sin(cycle) * 0.06;

      if (crestRef.current) {
        crestRef.current.rotation.z = Math.sin(cycle * 2) * 0.08;
      }
    } else if (activeAction === 'attack_light') {
      const attackProgress = Math.sin(t * 18);
      if (weaponArm.current) {
        weaponArm.current.rotation.x = -Math.PI / 2.2 + attackProgress * 0.8;
        weaponArm.current.rotation.y = (isLefty ? 0.4 : -0.4) + attackProgress * 0.45;
        weaponArm.current.rotation.z = isLefty ? -0.2 : 0.2;
      }
      if (shieldArm.current) {
        shieldArm.current.rotation.x = -0.55;
        shieldArm.current.rotation.y = isLefty ? -0.4 : 0.4;
      }
      torsoRef.current.rotation.y = attackProgress * (isLefty ? 0.35 : -0.35);
      torsoRef.current.rotation.x = 0.14;
    } else if (activeAction === 'attack_heavy') {
      const heavyProgress = Math.sin(t * 14);
      if (weaponArm.current) {
        weaponArm.current.rotation.x = -Math.PI * 0.8 + heavyProgress * 1.4;
        weaponArm.current.rotation.y = isLefty ? 0.1 : -0.1;
        weaponArm.current.rotation.z = isLefty ? -0.1 : 0.1;
      }
      if (shieldArm.current) {
        shieldArm.current.rotation.x = -0.3;
        shieldArm.current.rotation.y = isLefty ? -0.5 : 0.5;
      }
      torsoRef.current.rotation.x = heavyProgress * 0.28;
    } else if (activeAction === 'block') {
      if (shieldArm.current) {
        shieldArm.current.rotation.x = -Math.PI / 2.2;
        shieldArm.current.rotation.y = isLefty ? -0.58 : 0.58;
        shieldArm.current.rotation.z = isLefty ? 0.2 : -0.2;
      }
      if (weaponArm.current) {
        weaponArm.current.rotation.x = -0.38;
        weaponArm.current.rotation.y = isLefty ? 0.2 : -0.2;
      }
      torsoRef.current.rotation.x = 0.18;
      headRef.current.rotation.x = 0.12;
    } else {
      const breath = Math.sin(t * 2.2) * 0.035;
      hipsRef.current.position.y = breath * 0.5;
      torsoRef.current.rotation.x = breath;
      torsoRef.current.rotation.y = Math.sin(t * 1.1) * 0.035;

      if (shieldArm.current) {
        shieldArm.current.rotation.x = -0.32 + breath;
        shieldArm.current.rotation.y = isLefty ? -0.22 : 0.22;
        shieldArm.current.rotation.z = isLefty ? 0.1 : -0.1;
      }
      if (weaponArm.current) {
        weaponArm.current.rotation.x = -0.22 - breath;
        weaponArm.current.rotation.y = isLefty ? 0.12 : -0.12;
        weaponArm.current.rotation.z = isLefty ? -0.1 : 0.1;
      }
      if (leftLegRef.current && rightLegRef.current) {
        leftLegRef.current.rotation.x = -0.06;
        rightLegRef.current.rotation.x = 0.06;
      }
      if (headRef.current) {
        headRef.current.rotation.y = Math.sin(t * 0.8) * 0.05;
      }
    }

    // Hit flash: detect new hit via action transition and auto-clear.
    if (fighter.action === 'hit' && lastActionRef.current !== 'hit') {
      flashTimerRef.current = fighter.hitFlashTimer || 0.3;
      setFlashActive(true);
    }
    lastActionRef.current = fighter.action;
    if (flashTimerRef.current > 0) {
      flashTimerRef.current = Math.max(0, flashTimerRef.current - delta);
      if (flashTimerRef.current <= 0) {
        setFlashActive(false);
      }
    }
  });

  const scale = fighter.meshScale || 1.0;
  const isHit = flashActive;
  const tunicColor = isHit ? '#ef4444' : fighter.tunicColor || '#991b1b';
  const bronzeColor = isHit ? '#f87171' : '#b45309';
  const goldColor = isHit ? '#fca5a5' : '#f59e0b';
  const skinColor = isHit ? '#fca5a5' : fighter.skinColor || '#f6d8b8';
  const crestColor = fighter.crestColor || '#b91c1c';

  const weaponItem = fighter.loadout?.weapon;
  const weaponType = weaponItem?.type || 'sword_shield';
  const hasShield = Boolean(
    weaponType === 'sword_shield' ||
    !weaponItem ||
    (weaponItem.name && weaponItem.name.toLowerCase().includes('shield')) ||
    (weaponItem.id && weaponItem.id.toLowerCase().includes('shield'))
  );

  // Sub-component: Dynamic Weapon Renderer (Gladius, Spear, Mace, etc.)
  const RenderEquippedWeapon = (
    <group position={[0, -0.34, 0.08]} rotation={[Math.PI / 2.8, 0, 0]}>
      {weaponType === 'spear' ? (
        // DORY / PILUM SPEAR
        <>
          <mesh castShadow position={[0, -0.2, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 2.1, 10]} />
            <meshStandardMaterial color="#78350f" roughness={0.7} />
          </mesh>
          <mesh castShadow position={[0, 0.9, 0]}>
            <coneGeometry args={[0.065, 0.45, 8]} />
            <meshStandardMaterial color="#f8fafc" metalness={0.95} roughness={0.1} />
          </mesh>
        </>
      ) : weaponType === 'mace' ? (
        // FLUTED ROMAN MACE
        <>
          <mesh castShadow position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.03, 0.035, 0.85, 8]} />
            <meshStandardMaterial color="#451a03" roughness={0.8} />
          </mesh>
          <mesh castShadow position={[0, 0.52, 0]}>
            <sphereGeometry args={[0.1, 12, 12]} />
            <meshStandardMaterial color={goldColor} metalness={0.9} roughness={0.2} />
          </mesh>
        </>
      ) : (
        // GLADIUS / SPATHA SWORD
        <>
          {/* Pommel */}
          <mesh position={[0, -0.16, 0]}>
            <sphereGeometry args={[0.045, 12, 12]} />
            <meshStandardMaterial color={goldColor} metalness={0.9} roughness={0.2} />
          </mesh>
          {/* Grip */}
          <mesh castShadow position={[0, -0.06, 0]}>
            <cylinderGeometry args={[0.025, 0.028, 0.16, 8]} />
            <meshStandardMaterial color="#78350f" roughness={0.7} />
          </mesh>
          {/* Crossguard */}
          <mesh position={[0, 0.04, 0]}>
            <boxGeometry args={[0.16, 0.04, 0.05]} />
            <meshStandardMaterial color={goldColor} metalness={0.9} roughness={0.2} />
          </mesh>
          {/* Blade */}
          <mesh castShadow position={[0, 0.44, 0]}>
            <boxGeometry args={[0.075, 0.76, 0.016]} />
            <meshStandardMaterial color="#f8fafc" metalness={0.95} roughness={0.1} />
          </mesh>
          {/* Blade Tip */}
          <mesh castShadow position={[0, 0.86, 0]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.053, 0.053, 0.016]} />
            <meshStandardMaterial color="#f8fafc" metalness={0.95} roughness={0.1} />
          </mesh>
        </>
      )}
    </group>
  );

  // Sub-component: Roman Scutum Shield
  const ScutumShield = (
    <group position={[isLefty ? 0.15 : -0.15, -0.12, 0.2]} rotation={[0, isLefty ? -Math.PI / 4 : Math.PI / 4, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.68, 1.15, 0.05]} />
        <meshStandardMaterial color="#881337" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.028]}>
        <boxGeometry args={[0.7, 1.17, 0.01]} />
        <meshStandardMaterial color={goldColor} metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh castShadow position={[0, 0, 0.06]}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial color={goldColor} metalness={0.9} roughness={0.15} />
      </mesh>
      <mesh position={[0, 0.25, 0.035]}>
        <boxGeometry args={[0.35, 0.05, 0.01]} />
        <meshStandardMaterial color="#fef08a" metalness={0.7} />
      </mesh>
      <mesh position={[0, -0.25, 0.035]}>
        <boxGeometry args={[0.35, 0.05, 0.01]} />
        <meshStandardMaterial color="#fef08a" metalness={0.7} />
      </mesh>
    </group>
  );

  return (
    <group
      ref={rootRef}
      position={fighter.position}
      rotation={[0, fighter.rotationY, 0]}
      scale={[scale, scale, scale]}
    >
      <group ref={hipsRef}>
        {/* LOWER TORSO & PTERUGES LEATHER SKIRT */}
        <group position={[0, 1.05, 0]}>
          <mesh castShadow position={[0, 0, 0]}>
            <cylinderGeometry args={[0.34, 0.38, 0.35, 16]} />
            <meshStandardMaterial color={tunicColor} roughness={0.65} />
          </mesh>

          <mesh castShadow position={[0, 0.15, 0]}>
            <cylinderGeometry args={[0.37, 0.37, 0.12, 16]} />
            <meshStandardMaterial color="#78350f" roughness={0.6} />
          </mesh>
          {[0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, (5 * Math.PI) / 4, (3 * Math.PI) / 2, (7 * Math.PI) / 4].map((rad, i) => (
            <mesh key={`stud-${i}`} position={[Math.sin(rad) * 0.38, 0.15, Math.cos(rad) * 0.38]}>
              <sphereGeometry args={[0.025, 8, 8]} />
              <meshStandardMaterial color={goldColor} metalness={0.8} roughness={0.2} />
            </mesh>
          ))}

          {[-0.22, -0.11, 0, 0.11, 0.22].map((xOffset, i) => (
            <group key={`p-front-${i}`} position={[xOffset, -0.15, 0.36]} rotation={[0.12, 0, 0]}>
              <mesh castShadow>
                <boxGeometry args={[0.08, 0.32, 0.02]} />
                <meshStandardMaterial color="#451a03" roughness={0.7} />
              </mesh>
              <mesh position={[0, -0.14, 0.015]}>
                <sphereGeometry args={[0.022, 8, 8]} />
                <meshStandardMaterial color={goldColor} metalness={0.9} roughness={0.2} />
              </mesh>
            </group>
          ))}
        </group>

        {/* CHEST & UPPER BODY (LORICA SEGMENTATA) */}
        <group ref={torsoRef} position={[0, 1.25, 0]}>
          <mesh castShadow position={[0, 0.26, 0]}>
            <cylinderGeometry args={[0.36, 0.33, 0.56, 16]} />
            <meshStandardMaterial color={bronzeColor} metalness={0.85} roughness={0.25} />
          </mesh>

          <mesh castShadow position={[0, 0.34, 0.18]}>
            <boxGeometry args={[0.42, 0.22, 0.14]} />
            <meshStandardMaterial color={bronzeColor} metalness={0.85} roughness={0.25} />
          </mesh>
          <mesh position={[0, 0.36, 0.26]}>
            <boxGeometry args={[0.14, 0.1, 0.02]} />
            <meshStandardMaterial color={goldColor} metalness={0.95} roughness={0.15} />
          </mesh>

          <mesh castShadow position={[-0.38, 0.52, 0]} rotation={[0, 0, 0.25]}>
            <cylinderGeometry args={[0.16, 0.2, 0.18, 12]} />
            <meshStandardMaterial color={bronzeColor} metalness={0.85} roughness={0.25} />
          </mesh>
          <mesh castShadow position={[0.38, 0.52, 0]} rotation={[0, 0, -0.25]}>
            <cylinderGeometry args={[0.16, 0.2, 0.18, 12]} />
            <meshStandardMaterial color={bronzeColor} metalness={0.85} roughness={0.25} />
          </mesh>

          <mesh castShadow position={[0, 0.2, -0.24]} rotation={[-0.05, 0, 0]}>
            <planeGeometry args={[0.7, 0.85]} />
            <meshStandardMaterial color={tunicColor} roughness={0.65} side={THREE.DoubleSide} />
          </mesh>

          {/* HEAD & GALEA HELMET */}
          <group ref={headRef} position={[0, 0.58, 0]}>
            <mesh castShadow position={[0, 0.08, 0]}>
              <cylinderGeometry args={[0.14, 0.16, 0.16, 12]} />
              <meshStandardMaterial color={skinColor} roughness={0.6} />
            </mesh>
            <mesh castShadow position={[0, 0.04, 0.06]}>
              <cylinderGeometry args={[0.18, 0.2, 0.08, 12]} />
              <meshStandardMaterial color={bronzeColor} metalness={0.85} roughness={0.25} />
            </mesh>
            <mesh castShadow position={[0, 0.24, 0.02]}>
              <sphereGeometry args={[0.2, 16, 16]} />
              <meshStandardMaterial color={skinColor} roughness={0.6} />
            </mesh>

            <group position={[0, 0.28, 0.02]}>
              <mesh castShadow position={[0, 0.06, 0]}>
                <sphereGeometry args={[0.23, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.65]} />
                <meshStandardMaterial color={bronzeColor} metalness={0.9} roughness={0.2} />
              </mesh>
              <mesh castShadow position={[0, 0.02, 0.14]} rotation={[0.2, 0, 0]}>
                <boxGeometry args={[0.34, 0.08, 0.16]} />
                <meshStandardMaterial color={goldColor} metalness={0.9} roughness={0.2} />
              </mesh>
              <mesh castShadow position={[0, -0.06, -0.16]} rotation={[-0.45, 0, 0]}>
                <boxGeometry args={[0.38, 0.14, 0.08]} />
                <meshStandardMaterial color={bronzeColor} metalness={0.9} roughness={0.2} />
              </mesh>
              <mesh castShadow position={[-0.18, -0.08, 0.08]} rotation={[0, 0.15, -0.1]}>
                <boxGeometry args={[0.04, 0.22, 0.14]} />
                <meshStandardMaterial color={bronzeColor} metalness={0.85} roughness={0.25} />
              </mesh>
              <mesh castShadow position={[0.18, -0.08, 0.08]} rotation={[0, -0.15, 0.1]}>
                <boxGeometry args={[0.04, 0.22, 0.14]} />
                <meshStandardMaterial color={bronzeColor} metalness={0.85} roughness={0.25} />
              </mesh>

              {/* CRIMSON CREST */}
              <group ref={crestRef} position={[0, 0.26, 0]}>
                <mesh castShadow position={[0, 0, 0]}>
                  <boxGeometry args={[0.08, 0.08, 0.44]} />
                  <meshStandardMaterial color={goldColor} metalness={0.95} roughness={0.15} />
                </mesh>
                <mesh castShadow position={[0, 0.14, 0.02]} rotation={[0.08, 0, 0]}>
                  <boxGeometry args={[0.06, 0.24, 0.48]} />
                  <meshStandardMaterial color={crestColor} roughness={0.7} />
                </mesh>
                <mesh castShadow position={[0, 0.26, -0.04]}>
                  <boxGeometry args={[0.05, 0.12, 0.42]} />
                  <meshStandardMaterial color={crestColor} roughness={0.75} />
                </mesh>
              </group>
            </group>
          </group>

          {/* LEFT ARM */}
          <group ref={leftArmRef} position={[-0.44, 0.45, 0]}>
            {isLefty ? (
              // LEFTY MODE: WEAPON IN LEFT HAND WITH SEGMENTED MANICA ARMOR
              <>
                <mesh castShadow position={[0, -0.12, 0]}>
                  <cylinderGeometry args={[0.12, 0.11, 0.28, 12]} />
                  <meshStandardMaterial color={bronzeColor} metalness={0.85} roughness={0.25} />
                </mesh>
                <group position={[0, -0.28, 0]}>
                  <mesh castShadow position={[0, -0.16, 0]}>
                    <cylinderGeometry args={[0.1, 0.09, 0.32, 12]} />
                    <meshStandardMaterial color={bronzeColor} metalness={0.85} roughness={0.25} />
                  </mesh>
                  <mesh castShadow position={[0, -0.34, 0]}>
                    <sphereGeometry args={[0.07, 10, 10]} />
                    <meshStandardMaterial color={skinColor} roughness={0.6} />
                  </mesh>
                  {RenderEquippedWeapon}
                </group>
              </>
            ) : (
              // DEFAULT (RIGHTY): SHIELD IN ANATOMICAL LEFT HAND
              <>
                <mesh castShadow position={[0, -0.12, 0]}>
                  <cylinderGeometry args={[0.11, 0.1, 0.28, 12]} />
                  <meshStandardMaterial color={skinColor} roughness={0.6} />
                </mesh>
                <group position={[0, -0.28, 0]}>
                  <mesh castShadow position={[0, -0.16, 0]}>
                    <cylinderGeometry args={[0.09, 0.08, 0.32, 12]} />
                    <meshStandardMaterial color="#78350f" roughness={0.7} />
                  </mesh>
                  <mesh castShadow position={[0, -0.34, 0]}>
                    <sphereGeometry args={[0.07, 10, 10]} />
                    <meshStandardMaterial color={skinColor} roughness={0.6} />
                  </mesh>
                  {hasShield && ScutumShield}
                </group>
              </>
            )}
          </group>

          {/* RIGHT ARM */}
          <group ref={rightArmRef} position={[0.44, 0.45, 0]}>
            {isLefty ? (
              // LEFTY MODE: SHIELD IN RIGHT HAND
              <>
                <mesh castShadow position={[0, -0.12, 0]}>
                  <cylinderGeometry args={[0.11, 0.1, 0.28, 12]} />
                  <meshStandardMaterial color={skinColor} roughness={0.6} />
                </mesh>
                <group position={[0, -0.28, 0]}>
                  <mesh castShadow position={[0, -0.16, 0]}>
                    <cylinderGeometry args={[0.09, 0.08, 0.32, 12]} />
                    <meshStandardMaterial color="#78350f" roughness={0.7} />
                  </mesh>
                  <mesh castShadow position={[0, -0.34, 0]}>
                    <sphereGeometry args={[0.07, 10, 10]} />
                    <meshStandardMaterial color={skinColor} roughness={0.6} />
                  </mesh>
                  {hasShield && ScutumShield}
                </group>
              </>
            ) : (
              // DEFAULT (RIGHTY): WEAPON IN ANATOMICAL RIGHT HAND WITH SEGMENTED MANICA ARMOR
              <>
                <mesh castShadow position={[0, -0.12, 0]}>
                  <cylinderGeometry args={[0.12, 0.11, 0.28, 12]} />
                  <meshStandardMaterial color={bronzeColor} metalness={0.85} roughness={0.25} />
                </mesh>
                <group position={[0, -0.28, 0]}>
                  <mesh castShadow position={[0, -0.16, 0]}>
                    <cylinderGeometry args={[0.1, 0.09, 0.32, 12]} />
                    <meshStandardMaterial color={bronzeColor} metalness={0.85} roughness={0.25} />
                  </mesh>
                  <mesh castShadow position={[0, -0.34, 0]}>
                    <sphereGeometry args={[0.07, 10, 10]} />
                    <meshStandardMaterial color={skinColor} roughness={0.6} />
                  </mesh>
                  {RenderEquippedWeapon}
                </group>
              </>
            )}
          </group>
        </group>

        {/* LEGS & CALIGAE SANDALS */}
        <group ref={leftLegRef} position={[-0.2, 0.95, 0]}>
          <mesh castShadow position={[0, -0.22, 0]}>
            <cylinderGeometry args={[0.15, 0.13, 0.42, 12]} />
            <meshStandardMaterial color={skinColor} roughness={0.6} />
          </mesh>
          <group ref={leftKneeRef} position={[0, -0.42, 0]}>
            <mesh castShadow position={[0, 0, 0.04]}>
              <sphereGeometry args={[0.09, 10, 10]} />
              <meshStandardMaterial color={skinColor} roughness={0.6} />
            </mesh>
            <mesh castShadow position={[0, -0.22, 0.02]}>
              <cylinderGeometry args={[0.11, 0.09, 0.42, 12]} />
              <meshStandardMaterial color={bronzeColor} metalness={0.85} roughness={0.25} />
            </mesh>
            <mesh castShadow position={[0, -0.46, 0.08]}>
              <boxGeometry args={[0.14, 0.08, 0.28]} />
              <meshStandardMaterial color="#451a03" roughness={0.8} />
            </mesh>
          </group>
        </group>

        <group ref={rightLegRef} position={[0.2, 0.95, 0]}>
          <mesh castShadow position={[0, -0.22, 0]}>
            <cylinderGeometry args={[0.15, 0.13, 0.42, 12]} />
            <meshStandardMaterial color={skinColor} roughness={0.6} />
          </mesh>
          <group ref={rightKneeRef} position={[0, -0.42, 0]}>
            <mesh castShadow position={[0, 0, 0.04]}>
              <sphereGeometry args={[0.09, 10, 10]} />
              <meshStandardMaterial color={skinColor} roughness={0.6} />
            </mesh>
            <mesh castShadow position={[0, -0.22, 0.02]}>
              <cylinderGeometry args={[0.11, 0.09, 0.42, 12]} />
              <meshStandardMaterial color={bronzeColor} metalness={0.85} roughness={0.25} />
            </mesh>
            <mesh castShadow position={[0, -0.46, 0.08]}>
              <boxGeometry args={[0.14, 0.08, 0.28]} />
              <meshStandardMaterial color="#451a03" roughness={0.8} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
};

// 3. Error Boundary to catch missing GLB assets and fallback cleanly
class GLTFErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode; onError?: () => void },
  { hasError: boolean }
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode; onError?: () => void }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('[GladiatorMesh] GLB model failed to load, falling back to procedural gladiator:', err);
    glbStatusCache = 'invalid';
    if (this.props.onError) {
      this.props.onError();
    }
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// 4. Main GladiatorMesh Component
export const GladiatorMesh: React.FC<GladiatorMeshProps> = ({
  fighter,
  overrideAction,
  isLeftyMode,
}) => {
  const isGlbAvailable = useGlbAvailability('/models/arena_roman.glb');
  const [loadFailed, setLoadFailed] = useState(false);

  const effectiveLefty = isLeftyMode !== undefined ? isLeftyMode : fighter.isLeftyMode;

  if (!isGlbAvailable || loadFailed) {
    return (
      <ProceduralGladiator
        fighter={fighter}
        overrideAction={overrideAction}
        isLeftyMode={effectiveLefty}
      />
    );
  }

  return (
    <GLTFErrorBoundary
      onError={() => setLoadFailed(true)}
      fallback={
        <ProceduralGladiator
          fighter={fighter}
          overrideAction={overrideAction}
          isLeftyMode={effectiveLefty}
        />
      }
    >
      <RomanWarriorGLB
        fighter={fighter}
        overrideAction={overrideAction}
        isLeftyMode={effectiveLefty}
        onInvalidModel={() => setLoadFailed(true)}
      />
    </GLTFErrorBoundary>
  );
};
