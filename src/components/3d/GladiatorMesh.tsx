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

// Shared Shield Renderer Component
const ShieldModel: React.FC<{ isLefty: boolean; goldColor: string }> = ({ isLefty, goldColor }) => {
  return (
    <group position={[0, 0, 0]} rotation={[0, 0, isLefty ? -Math.PI / 2 : Math.PI / 2]}>
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
};

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
  const shieldNode = <ShieldModel isLefty={isLefty} goldColor={goldColor} />;

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
