import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sparkles, useGLTF, Sky, Html } from '@react-three/drei';
import * as THREE from 'three';
import { PlayerProfile, OpponentConfig, FighterState, DuelStatistics, DamageNumber } from '../../types/game';
import { DuelArena } from '../3d/DuelArena';
import { GladiatorMesh, type ImpactState } from '../3d/GladiatorMesh';
import { CombatHUD } from '../ui/CombatHUD';
import { CombatActionType, CombatLogEntry } from '../ui/TurnActionPanel';
import { CanvasLoadingFallback } from '../ui/AssetLoadingOverlay';
import { WebGLContextErrorBoundary } from '../ui/WebGLContextErrorBoundary';
import { ThreeComponentErrorBoundary } from '../ui/ThreeComponentErrorBoundary';
import { WebGLReadyGuard } from '../ui/WebGLReadyGuard';
import { CanvasWebGLMonitor } from '../ui/CanvasWebGLMonitor';
import { logCanvasWebGLCreated, setupCanvasContextRestoration } from '../../utils/webglContext';
import { calculateTotalStats } from '../../services/storage';
import { resolveTemperLevel, getEffectiveWeaponStats } from '../../utils/tempering';
import { getWeaponByType } from '../../data/itemsDB';
import {
  getWeaponRange,
  getStaminaCost,
  calculateHitChance,
  calculateAttackDamage,
  applyStaminaRegen,
  chooseAIStandardAction,
  chooseAIOutOfRangeAction,
  RAGE_DAMAGE_MULTIPLIER,
  shouldActivateRage,
  applyComboEvent,
  updateHypePeak,
} from '../../utils/combatCalculations';
import { sounds } from '../../audio/soundEffects';
import { CORE_3D_ASSETS } from '../../utils/preloadAssets';
import { useCameraDrag, CAMERA_DRAG_BASE_YAW_SENSITIVITY, CAMERA_DRAG_BASE_PITCH_SENSITIVITY } from '../../hooks/useCameraDrag';
import { SceneBrightness } from '../3d/SceneBrightness';
import { useSettings } from '../../hooks/useSettings';
import {
  getCameraSensitivityScale,
  getCameraShakeMultiplier,
  getSettings,
  subscribeSettings,
} from '../../services/settings';
import { vibrate, HAPTIC_HIT_LANDED_MS, HAPTIC_DEFEAT_PATTERN } from '../../utils/haptics';

// Preload 3D assets for instant duel startup
try {
  CORE_3D_ASSETS.forEach((asset) => useGLTF.preload(asset));
} catch (e) {
  // Silent fallback
}

// ── Impact feedback: hit-stop durations and shake trauma by outcome ───────────
// A landed blow stops the fighters' animation for a few frames (hit-stop) and
// kicks the camera (scaled screen shake), so a hit reads as physical. Both are
// carried on ONE shared ref — `impactRef`, created by DuelScene and read by the
// camera rig and every GladiatorMesh inside its own frame loop — so the feedback
// is refs-only and re-renders nothing. No timer, damage value, hit chance, combo
// or hype outcome is involved.
const HIT_STOP_MS = {
  /** Quick attack. */
  quick: 60,
  /** Power attack. */
  power: 110,
  /** Critical blow (a power attack that crit). */
  crit: 170,
  /** Any strike stopped by a shield — the shortest hold. */
  blocked: 40,
  /** The boss's telegraphed overhead smash — the heaviest impact in the game. */
  telegraphedHeavy: 200,
} as const;

// Shake trauma added at hit resolution, in the very branches that set
// `hitFlashTimer`. The player's own strikes scale with what they landed; a blow
// the player RECEIVES replaces those with one flat value, so being hit always
// reads differently from landing one.
const SHAKE_TRAUMA = {
  quick: 0.25,
  power: 0.45,
  crit: 0.7,
  playerHit: 0.2,
} as const;

// The camera rig's shake response. The rig squares trauma before scaling it, so
// these are the peak offsets at trauma 1. Two incommensurate frequencies keep the
// wobble from settling into a visible loop.
const CAMERA_SHAKE_POSITION_AMPLITUDE = 0.18; // world units
const CAMERA_SHAKE_LOOK_DEGREES = 0.6; // lateral look-at shift, in degrees of view
const CAMERA_SHAKE_TRAUMA_DECAY = 1.6; // trauma units per second
const CAMERA_SHAKE_OMEGA_A = 2 * Math.PI * 31; // ≈31 Hz
const CAMERA_SHAKE_OMEGA_B = 2 * Math.PI * 47; // ≈47 Hz

interface DuelSceneProps {
  playerProfile: PlayerProfile;
  opponent: OpponentConfig;
  onMatchComplete: (stats: DuelStatistics, didWin: boolean) => void;
  onOpenArmory: () => void;
  onOpenHelp: () => void;
  onToggleMute: () => void;
  isMuted: boolean;
  isLeftyMode?: boolean;
  onOpenSettings?: () => void;
}

// Camera controller inside Canvas with hold-and-drag orbit support
const DuelCameraRig: React.FC<{
  playerPos: [number, number, number];
  opponentPos: [number, number, number];
  cameraMode: string;
  impactRef: React.MutableRefObject<ImpactState>;
  shakeMultiplierRef: React.MutableRefObject<number>;
}> = ({ playerPos, opponentPos, cameraMode, impactRef, shakeMultiplierRef }) => {
  const { camera } = useThree();
  // C-8.70B §SET-1 — the Camera Sensitivity row scales this orbit, through the
  // settings subscription (a change re-renders the rig; the frame loop is the same).
  const sensitivityScale = getCameraSensitivityScale(useSettings());
  const { yawOffsetRef, pitchOffsetRef } = useCameraDrag(false, {
    yawSensitivity: CAMERA_DRAG_BASE_YAW_SENSITIVITY * sensitivityScale,
    pitchSensitivity: CAMERA_DRAG_BASE_PITCH_SENSITIVITY * sensitivityScale,
  });

  useFrame((state, delta) => {
    const midX = (playerPos[0] + opponentPos[0]) / 2;
    const midZ = (playerPos[2] + opponentPos[2]) / 2;

    const dragYaw = yawOffsetRef.current;
    const dragPitch = pitchOffsetRef.current;

    let baseDist = 8.5;
    let baseHeight = 5.2;

    if (cameraMode === 'over_shoulder') {
      baseDist = 4.2;
      baseHeight = 2.8;
    } else if (cameraMode === 'isometric') {
      baseDist = 11.0;
      baseHeight = 9.0;
    }

    const currentHeight = Math.max(1.5, Math.min(14, baseHeight + dragPitch));
    const currentDist = Math.max(3.5, Math.min(16, baseDist + dragPitch * 0.4));

    const camX = midX + Math.sin(dragYaw) * currentDist;
    const camZ = midZ + Math.cos(dragYaw) * currentDist;

    const targetCamPos = new THREE.Vector3(camX, currentHeight, camZ);

    camera.position.lerp(targetCamPos, Math.min(1, delta * 6));

    // ── Scaled screen shake ──────────────────────────────────────────────
    // Trauma decays every frame whether or not an offset is applied, so Camera
    // Shake = Off (multiplier 0) still winds the state down instead of leaving it
    // stuck. `trauma²` makes the knock fall away sharply, as a real one does, and
    // the multiplier is the settings module's own reader — read from a ref, so
    // this frame loop touches no React state. Trauma is only ever added while an
    // action is executing, and 1.6/s of decay empties even a crit (0.7) in 0.44s
    // — inside the 1100ms resolution window — so the rig can only shake during, or
    // in the tail of, a resolution, never on a quiet player turn.
    const impact = impactRef.current;
    impact.trauma = Math.max(0, impact.trauma - CAMERA_SHAKE_TRAUMA_DECAY * delta);
    const shake = impact.trauma * impact.trauma * shakeMultiplierRef.current;

    let lookX = midX;
    let lookY = 1.2;
    if (shake > 0) {
      const phase = state.clock.elapsedTime;
      // Two incommensurate frequencies (~31 Hz and ~47 Hz), each axis a bounded
      // sum of the two, so the wobble never settles into a visible loop. The
      // weights sum to 1, so the peak displacement is the amplitude itself.
      const posAmp = shake * CAMERA_SHAKE_POSITION_AMPLITUDE;
      const oscA = Math.sin(phase * CAMERA_SHAKE_OMEGA_A);
      const oscB = Math.cos(phase * CAMERA_SHAKE_OMEGA_B);
      const oscC = Math.cos(phase * CAMERA_SHAKE_OMEGA_A);
      const oscD = Math.sin(phase * CAMERA_SHAKE_OMEGA_B);
      camera.position.x += posAmp * (oscA * 0.6 + oscB * 0.4);
      camera.position.y += posAmp * (oscC * 0.6 + oscD * 0.4);
      camera.position.z += posAmp * oscD * 0.4;
      // Rotational shake: the same energy as a small lateral shift of the look-at
      // target, sized in degrees of view at the current framing distance.
      const viewDistance = Math.hypot(
        camera.position.x - midX,
        camera.position.y - 1.2,
        camera.position.z - midZ,
      );
      const lookShift = shake * Math.tan((CAMERA_SHAKE_LOOK_DEGREES * Math.PI) / 180) * viewDistance;
      lookX = midX + lookShift * oscA;
      lookY = 1.2 + lookShift * 0.6 * oscC;
    }

    camera.lookAt(lookX, lookY, midZ);
  });

  return null;
};

// 3D Floating Combat Damage & Status Overlay
const FloatingDamage3D: React.FC<{ damages: DamageNumber[] }> = ({ damages }) => {
  return (
    <>
      {damages.map((dmg) => (
        <Html key={dmg.id} position={dmg.position} center className="pointer-events-none select-none">
          <div
            className={`font-serif font-black text-sm sm:text-xl animate-bounce drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] whitespace-nowrap ${
              dmg.type === 'crit'
                ? 'text-yellow-300 text-lg sm:text-2xl scale-125 font-mono'
                : dmg.type === 'blocked'
                ? 'text-cyan-300 text-xs sm:text-sm'
                : dmg.type === 'dodge'
                ? 'text-purple-300 text-xs sm:text-sm'
                : dmg.type === 'hype'
                ? 'text-orange-400 text-xs sm:text-sm'
                : 'text-red-500'
            }`}
          >
            {dmg.text}
          </div>
        </Html>
      ))}
    </>
  );
};

export const DuelScene: React.FC<DuelSceneProps> = ({
  playerProfile,
  opponent,
  onMatchComplete,
  onOpenArmory,
  onOpenHelp,
  onToggleMute,
  isMuted,
  isLeftyMode = false,
  onOpenSettings,
}) => {
  const pStats = calculateTotalStats(playerProfile);

  // D1 fix: the opponent fights with ITS OWN configured weapon, never the
  // player's equipped gear. An explicit per-opponent loadout (if one is ever
  // supplied) wins; otherwise the configured `weaponType` is resolved through
  // the canonical weapon registry in data/itemsDB.ts. Either way the result is
  // independent of `playerProfile.equipped`.
  const opponentWeapon = opponent.loadout?.weapon ?? getWeaponByType(opponent.weaponType);

  // P1 tempering: the player fights with the EFFECTIVE stats of their equipped
  // weapon at its current temper level (+8 % damage per level, from
  // `getEffectiveWeaponStats`). The saved item object is never modified — only
  // this in-duel copy carries the bonus, so the attack resolution below and
  // TurnActionPanel's damage preview both read the tempered numbers. The
  // opponent has no save and no temper record, so its weapon stays base.
  const playerWeapon = getEffectiveWeaponStats(
    playerProfile.equipped.weapon,
    resolveTemperLevel(playerProfile, playerProfile.equipped.weapon.id)
  );

  const [player, setPlayer] = useState<FighterState>({
    id: 'player',
    name: playerProfile.name,
    title: playerProfile.title,
    isPlayer: true,
    position: [0, 0, 3.5],
    rotationY: Math.PI,
    health: pStats.healthMax,
    stamina: pStats.staminaMax,
    action: 'idle',
    actionTimer: 0,
    isBlocking: false,
    isInvulnerable: false,
    hitFlashTimer: 0,
    stats: pStats,
    loadout: { weapon: playerWeapon },
    comboCount: 0,
    skinColor: playerProfile.appearance.skinColor,
    hairColor: playerProfile.appearance.hairColor,
    tunicColor: playerProfile.appearance.tunicColor,
    crestColor: playerProfile.appearance.crestColor,
    clothingStyle: playerProfile.appearance.clothingStyle,
    characterModel: playerProfile.appearance.characterModel || 'roman_warrior',
    isLeftyMode: isLeftyMode,
  });

  // Keep player handedness in sync if changed dynamically
  useEffect(() => {
    setPlayer((prev) => ({ ...prev, isLeftyMode }));
  }, [isLeftyMode]);

  const [opp, setOpp] = useState<FighterState>({
    id: opponent.id,
    name: opponent.name,
    title: opponent.title,
    isPlayer: false,
    position: [0, 0, -3.5],
    rotationY: 0,
    health: opponent.stats.healthMax,
    stamina: opponent.stats.staminaMax,
    action: 'idle',
    actionTimer: 0,
    isBlocking: false,
    isInvulnerable: false,
    hitFlashTimer: 0,
    stats: opponent.stats,
    loadout: { ...opponent.loadout, weapon: opponentWeapon },
    comboCount: 0,
    skinColor: opponent.skinColor,
    hairColor: opponent.hairColor,
    tunicColor: opponent.tunicColor,
    meshScale: opponent.meshScale,
    characterModel: opponent.characterModel || 'roman_warrior',
  });

  // Swords & Sandals Turn-Based State Machine
  const [isPlayerTurn, setIsPlayerTurn] = useState<boolean>(true);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [combatLog, setCombatLog] = useState<CombatLogEntry[]>([]);
  const [damageNumbers, setDamageNumbers] = useState<DamageNumber[]>([]);

  const [crowdHype, setCrowdHype] = useState(25);

  // C-8 (Phase 39C): a ref mirrors the committed hype value so the updater can
  // compute the exact next value from an authoritative current value without
  // reading stale React state. The ref is updated synchronously inside
  // updateCrowdHype, so two calls batched in the same React render cycle each
  // see the result of the previous one — no stale-closure bug. The peak is
  // updated outside the state updater, keeping setCrowdHype pure. Under Strict
  // Mode the updater is no longer a function, so double-invocation does not
  // double-mutate the ref or peak.
  const crowdHypeRef = useRef(25);

  const updateCrowdHype = useCallback((updater: (prev: number) => number) => {
    const next = updater(crowdHypeRef.current);
    crowdHypeRef.current = next;
    setCrowdHype(next);
    statsRef.current.crowdHypePeak = updateHypePeak(statsRef.current.crowdHypePeak, next);
  }, []);

  const [matchTimer, setMatchTimer] = useState(0);
  const [cameraMode, setCameraMode] = useState<'cinematic' | 'over_shoulder' | 'isometric'>('cinematic');
  const [frameloopMode, setFrameloopMode] = useState<'demand' | 'always'>('demand');

  useEffect(() => {
    const timer = setTimeout(() => {
      setFrameloopMode('always');
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  const statsRef = useRef<DuelStatistics>({
    damageDealt: 0,
    damageTaken: 0,
    hitsLanded: 0,
    perfectBlocks: 0,
    dodgesPerformed: 0,
    maxCombo: 0,
    crowdHypePeak: 25,
    durationSeconds: 0,
    goldEarned: opponent.rewardGold,
    fameEarned: opponent.rewardFame,
    xpEarned: opponent.rewardXp,
  });

  const isMatchOver = useRef(false);
  const phaseSwitchedRef = useRef(false);
  const pendingHeavyAttackRef = useRef(false);
  const pendingCounterRef = useRef(false);
  const rageActivatedRef = useRef(false);

  // Shared impact feedback (the hit-stop clock and the shake energy) — see the
  // tables at the top of this file. Written once per hit resolution and read
  // every frame by the camera rig and both GladiatorMesh instances, so the
  // feedback costs no re-render and no React state.
  const impactRef = useRef<ImpactState>({ freezeUntil: 0, trauma: 0 });
  // Marks the ONE resolution that is a telegraphed heavy landing, so it can take
  // the longest hit-stop. Set by the AI branch that resolves the telegraph, then
  // read-and-cleared at the top of executeCombatTurn — a miss, an evade or an
  // out-of-range swing therefore cannot leave it set for a later attack.
  const telegraphLandingRef = useRef(false);

  // C-8.70B §SET-1 — the Camera Shake row's consumer contract. The rig reads the
  // multiplier from this ref every frame; it is refreshed through the settings
  // module's own cache and change listener (never React state, never per frame),
  // and it folds in the OS's reduced-motion preference, which the module leaves
  // for the platform to answer. Refs only: the value never re-renders a thing.
  const shakeMultiplierRef = useRef(1);
  useEffect(() => {
    const motionQuery =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    const applyShakeMultiplier = () => {
      shakeMultiplierRef.current = getCameraShakeMultiplier(getSettings(), motionQuery?.matches ?? false);
    };
    applyShakeMultiplier();
    const unsubscribe = subscribeSettings(applyShakeMultiplier);
    motionQuery?.addEventListener('change', applyShakeMultiplier);
    return () => {
      unsubscribe();
      motionQuery?.removeEventListener('change', applyShakeMultiplier);
    };
  }, []);

  // Match timer
  useEffect(() => {
    const timer = setInterval(() => {
      if (!isMatchOver.current) {
        setMatchTimer((prev) => prev + 1);
        statsRef.current.durationSeconds += 1;
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Update maxCombo from the actual player combo count (C-9).
  // Uses Math.max so maxCombo only ever increases, never decreases when
  // the current combo resets. Runs after every comboCount change.
  useEffect(() => {
    statsRef.current.maxCombo = Math.max(statsRef.current.maxCombo, player.comboCount);
  }, [player.comboCount]);

  // Distance in 3D arena
  const currentDistance = Math.abs(player.position[2] - opp.position[2]);

  // Helper: Append log
  const addLog = useCallback((text: string, type: 'player' | 'opponent' | 'system' | 'crit' = 'system') => {
    const entry: CombatLogEntry = {
      id: Math.random().toString(),
      text,
      type,
      timestamp: new Date().toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
    };
    setCombatLog((prev) => [...prev.slice(-12), entry]);
  }, []);

  // Helper: Spawn 3D floating damage text
  const spawnDamageText = useCallback((text: string, type: DamageNumber['type'], pos: [number, number, number]) => {
    const dmgItem: DamageNumber = {
      id: Math.random().toString(),
      text,
      type,
      position: [pos[0], pos[1] + 1.8, pos[2]],
      createdAt: Date.now(),
    };
    setDamageNumbers((prev) => [...prev, dmgItem]);
    setTimeout(() => {
      setDamageNumbers((prev) => prev.filter((d) => d.id !== dmgItem.id));
    }, 1400);
  }, []);

  // Core Turn Execution Function
  const executeCombatTurn = useCallback(
    (actor: 'player' | 'opponent', actionType: CombatActionType) => {
      if (isExecuting || isMatchOver.current) return;

      setIsExecuting(true);
      const isActorPlayer = actor === 'player';

      // Read-and-clear the telegraphed-heavy marker for THIS resolution, before
      // any branch can return, so a miss, an evade or an out-of-range swing
      // cannot leave it set for a later attack.
      const isTelegraphedHeavy = !isActorPlayer && telegraphLandingRef.current;
      telegraphLandingRef.current = false;

      const attacker = isActorPlayer ? player : opp;
      const defender = isActorPlayer ? opp : player;

      // Taking a new action ends any lingering defensive stance (block or
      // dodge invulnerability) from a previous turn. Both stances persist
      // across the turn boundary (see the turn-end reset below) so the
      // opposing attack can interact with them; they are consumed here
      // when the fighter acts again. Returning the same reference when
      // nothing changes lets React bail out of a re-render.
      if (isActorPlayer) {
        setPlayer((prev) =>
          prev.isInvulnerable || prev.isBlocking
            ? { ...prev, isInvulnerable: false, isBlocking: false }
            : prev,
        );
      } else {
        setOpp((prev) =>
          prev.isInvulnerable || prev.isBlocking
            ? { ...prev, isInvulnerable: false, isBlocking: false }
            : prev,
        );
      }

      const dist = Math.abs(player.position[2] - opp.position[2]);
      const effectiveRange = getWeaponRange(attacker.loadout.weapon);

      // 1. MOVEMENT ACTIONS
      if (actionType === 'advance') {
        sounds.playDodge();
        if (isActorPlayer) {
          const targetZ = Math.max(opp.position[2] + 1.2, player.position[2] - 1.8);
          setPlayer((prev) => ({
            ...prev,
            position: [0, 0, targetZ],
            action: 'walk',
            stamina: applyStaminaRegen(prev.stamina, prev.stats.staminaMax, prev.stats.staminaRegen),
          }));
        } else {
          const targetZ = Math.min(player.position[2] - 1.2, opp.position[2] + 1.8);
          setOpp((prev) => ({
            ...prev,
            position: [0, 0, targetZ],
            action: 'walk',
            stamina: applyStaminaRegen(prev.stamina, prev.stats.staminaMax, prev.stats.staminaRegen),
          }));
        }
        addLog(`${attacker.name} advances 1.8m toward their opponent.`, isActorPlayer ? 'player' : 'opponent');
      } else if (actionType === 'retreat') {
        sounds.playDodge();
        if (isActorPlayer) {
          const targetZ = Math.min(7.5, player.position[2] + 1.8);
          setPlayer((prev) => ({
            ...prev,
            position: [0, 0, targetZ],
            action: 'walk',
            stamina: applyStaminaRegen(prev.stamina, prev.stats.staminaMax, prev.stats.staminaRegen),
          }));
        } else {
          const targetZ = Math.max(-7.5, opp.position[2] - 1.8);
          setOpp((prev) => ({
            ...prev,
            position: [0, 0, targetZ],
            action: 'walk',
            stamina: applyStaminaRegen(prev.stamina, prev.stats.staminaMax, prev.stats.staminaRegen),
          }));
        }
        addLog(`${attacker.name} retreats back 1.8m.`, isActorPlayer ? 'player' : 'opponent');
      }

      // 2. DEFENSIVE / UTILITY ACTIONS
      else if (actionType === 'shield_block') {
        sounds.playBlock();
        if (isActorPlayer) {
          setPlayer((prev) => ({
            ...prev,
            action: 'block',
            isBlocking: true,
            stamina: applyStaminaRegen(prev.stamina, prev.stats.staminaMax, prev.stats.staminaRegen),
          }));
        } else {
          setOpp((prev) => ({
            ...prev,
            action: 'block',
            isBlocking: true,
            stamina: applyStaminaRegen(prev.stamina, prev.stats.staminaMax, prev.stats.staminaRegen),
          }));
        }
        addLog(`${attacker.name} braces behind their shield.`, isActorPlayer ? 'player' : 'opponent');
        spawnDamageText('BRACED!', 'blocked', attacker.position);
      } else if (actionType === 'dodge') {
        sounds.playDodge();
        if (isActorPlayer) {
          setPlayer((prev) => ({
            ...prev,
            action: 'dodge',
            isInvulnerable: true,
            stamina: Math.max(0, prev.stamina - 12),
          }));
          statsRef.current.dodgesPerformed += 1;
        } else {
          setOpp((prev) => ({
            ...prev,
            action: 'dodge',
            isInvulnerable: true,
            stamina: Math.max(0, prev.stamina - 12),
          }));
        }
        addLog(`${attacker.name} enters an evasion stance!`, isActorPlayer ? 'player' : 'opponent');
        spawnDamageText('DODGE STANCE', 'dodge', attacker.position);
      } else if (actionType === 'taunt') {
        sounds.playVictory();
        if (isActorPlayer) {
          setPlayer((prev) => ({
            ...prev,
            action: 'idle',
            stamina: Math.min(prev.stats.staminaMax, prev.stamina + 25),
          }));
        } else {
          setOpp((prev) => ({
            ...prev,
            action: 'idle',
            stamina: Math.min(prev.stats.staminaMax, prev.stamina + 25),
          }));
        }
        updateCrowdHype((prev) => Math.min(100, prev + 20));
        addLog(`${attacker.name} flexes & taunts! The arena roars (+20% Hype)!`, isActorPlayer ? 'player' : 'opponent');
        spawnDamageText('TAUNT! +20% HYPE', 'hype', attacker.position);
      } else if (actionType === 'rest') {
        if (isActorPlayer) {
          setPlayer((prev) => ({
            ...prev,
            action: 'idle',
            stamina: Math.min(prev.stats.staminaMax, prev.stamina + 40),
          }));
        } else {
          setOpp((prev) => ({
            ...prev,
            action: 'idle',
            stamina: Math.min(prev.stats.staminaMax, prev.stamina + 40),
          }));
        }
        addLog(`${attacker.name} catches breath (+40 Stamina).`, isActorPlayer ? 'player' : 'opponent');
        spawnDamageText('+40 SP', 'hype', attacker.position);
      }

      // 2b. BOSS TELEGRAPH ACTION (Goliath heavy_telegraph)
      // The boss spends this turn announcing a devastating overhead
      // smash. The player gets a full turn to respond (dodge, block,
      // or reposition) before the attack resolves on the boss's next
      // turn via the AI effect reading pendingHeavyAttackRef.
      else if (actionType === 'telegraph') {
        sounds.playHeavyImpact();
        pendingHeavyAttackRef.current = true;
        setOpp((prev) => ({ ...prev, telegraphText: 'HEAVY ATTACK INCOMING' }));
        addLog(`${attacker.name} winds up a devastating overhead smash!`, 'opponent');
        spawnDamageText('\u26A0 HEAVY!', 'crit', attacker.position);
      }

      // 3. OFFENSIVE ATTACK ACTIONS
      else if (actionType === 'quick_attack' || actionType === 'power_attack') {
        const isQuick = actionType === 'quick_attack';
        const staminaCost = getStaminaCost(attacker.loadout.weapon, isQuick);

        // Deduct stamina & set attack animation
        if (isActorPlayer) {
          setPlayer((prev) => ({
            ...prev,
            action: isQuick ? 'attack_light' : 'attack_heavy',
            stamina: Math.max(0, prev.stamina - staminaCost),
          }));
        } else {
          setOpp((prev) => ({
            ...prev,
            action: isQuick ? 'attack_light' : 'attack_heavy',
            stamina: Math.max(0, prev.stamina - staminaCost),
          }));
        }

        // Check weapon range
        if (dist > effectiveRange) {
          sounds.playSlash();
          addLog(`${attacker.name} strikes with ${isQuick ? 'Quick Slash' : 'Power Slash'}, but is OUT OF RANGE!`, 'system');
          spawnDamageText('OUT OF RANGE!', 'blocked', defender.position);
        } else {
          // Check Evasion / Hit Probability
          const hitPct = calculateHitChance(isQuick, attacker.stats.agility, defender.stats.agility);

          const roll = Math.random() * 100;
          // A dodge sets isInvulnerable; the stance persists across the turn
          // boundary (it is NOT cleared in the end-of-turn reset) so the
          // attacker's strike can be evaded. Reading action === 'dodge' here
          // would always be false — the dodger's action is reset to 'idle'
          // before the opposing turn begins.
          const isEvaded = defender.isInvulnerable && Math.random() < 0.75;

          // Passive evasion (Valéria counter_dodge): when the player
          // attacks a counter_dodge boss who is NOT in an active
          // dodge stance, roll against the boss's configured
          // dodgeChance for a passive evade. Does not stack with
          // the active-dodge evasion above.
          const isPassiveEvaded =
            !isEvaded &&
            isActorPlayer &&
            opponent.bossMechanic === 'counter_dodge' &&
            !defender.isInvulnerable &&
            Math.random() < opponent.dodgeChance;

          if (isEvaded || isPassiveEvaded) {
            sounds.playDodge();
            addLog(`${defender.name} swiftly EVADED ${attacker.name}'s strike!`, 'system');
            spawnDamageText('EVADED!', 'dodge', defender.position);
            // Queue a counterattack for Valéria's next AI turn.
            // Only when the player is the attacker against a
            // counter_dodge boss — a player evading Valéria's own
            // counter must NOT chain into another counter.
            if (isActorPlayer && opponent.bossMechanic === 'counter_dodge') {
              pendingCounterRef.current = true;
            }
          } else if (roll <= hitPct) {
            // HIT LANDED! Calculate damage & crits
            const baseDmg = isQuick
              ? attacker.loadout.weapon.damageLight
              : attacker.loadout.weapon.damageHeavy;
            const isCrit = !isQuick && Math.random() < 0.25;
            const isBlocked = defender.isBlocking;
            const rageMult = (!isActorPlayer && attacker.isRaged) ? RAGE_DAMAGE_MULTIPLIER : 1.0;
            const rawDamage = calculateAttackDamage(
              baseDmg,
              attacker.stats.strength,
              isCrit,
              defender.stats.defense,
              isBlocked,
              defender.loadout.weapon.blockReduction,
              rageMult,
            );

            if (isBlocked) {
              sounds.playBlock();
              if (!isActorPlayer) statsRef.current.perfectBlocks += 1;
              addLog(
                `${attacker.name}'s strike was BLOCKED by ${defender.name}'s shield (-${rawDamage} HP)!`,
                'system'
              );
              spawnDamageText(`BLOCKED -${rawDamage}`, 'blocked', defender.position);
            } else {
              if (isCrit) {
                sounds.playHeavyImpact();
                addLog(`CRITICAL BLOW! ${attacker.name} struck ${defender.name} for ${rawDamage} DAMAGE!`, 'crit');
                spawnDamageText(`-${rawDamage} CRIT!`, 'crit', defender.position);
              } else {
                sounds.playSlash();
                addLog(`${attacker.name} struck ${defender.name} for ${rawDamage} damage.`, isActorPlayer ? 'player' : 'opponent');
                spawnDamageText(`-${rawDamage}`, 'damage', defender.position);
              }
              // C-8.70B §SET-1 — the player's blade landed: one short buzz, on the
              // device's own haptics and only when the Vibration row is on.
              if (isActorPlayer) vibrate(HAPTIC_HIT_LANDED_MS);
            }

            // Track stats
            if (isActorPlayer) {
              statsRef.current.hitsLanded += 1;
              statsRef.current.damageDealt += rawDamage;
              updateCrowdHype((prev) => Math.min(100, prev + (isCrit ? 18 : 8)));
            } else {
              statsRef.current.damageTaken += rawDamage;
            }

            // ── Impact feedback: hit-stop + screen shake ──────────────────
            // The same point that sets `hitFlashTimer` below — every outcome is
            // already known here, and none of it, nor any timer, is touched. A
            // blocked strike is the shortest hold; the boss's telegraphed overhead
            // smash the longest; a crit reads off the power attack that produced it.
            const freezeMs = isBlocked
              ? HIT_STOP_MS.blocked
              : isTelegraphedHeavy
              ? HIT_STOP_MS.telegraphedHeavy
              : isCrit
              ? HIT_STOP_MS.crit
              : isQuick
              ? HIT_STOP_MS.quick
              : HIT_STOP_MS.power;
            // The player's own strikes scale with the blow they landed; a blow the
            // player RECEIVES replaces that with one flat value (never both).
            const trauma = isActorPlayer
              ? isCrit
                ? SHAKE_TRAUMA.crit
                : isQuick
                ? SHAKE_TRAUMA.quick
                : SHAKE_TRAUMA.power
              : SHAKE_TRAUMA.playerHit;
            impactRef.current.freezeUntil = performance.now() + freezeMs;
            impactRef.current.trauma = Math.min(1, impactRef.current.trauma + trauma);

            // Apply HP damage to defender + combo tracking (C-9)
            if (isActorPlayer) {
              setOpp((prev) => {
                const nextHp = Math.max(0, prev.health - rawDamage);
                return {
                  ...prev,
                  health: nextHp,
                  action: nextHp <= 0 ? 'death' : 'hit',
                  hitFlashTimer: 0.3,
                };
              });
              // Player's attack resolved: update combo based on outcome.
              // Not blocked → increment; blocked with chip damage → no change;
              // fully blocked (0 damage, never occurs due to Math.max(1,...))
              // → reset.
              if (!isBlocked) {
                setPlayer((prev) => ({ ...prev, comboCount: applyComboEvent(prev.comboCount, 'landed') }));
              } else if (rawDamage <= 0) {
                setPlayer((prev) => ({ ...prev, comboCount: applyComboEvent(prev.comboCount, 'fully_blocked') }));
              }
            } else {
              // Opponent damaged the player → reset player's combo.
              setPlayer((prev) => {
                const nextHp = Math.max(0, prev.health - rawDamage);
                return {
                  ...prev,
                  health: nextHp,
                  action: nextHp <= 0 ? 'death' : 'hit',
                  hitFlashTimer: 0.3,
                  comboCount: applyComboEvent(prev.comboCount, 'player_damaged'),
                };
              });
            }
          } else {
            // MISSED
            sounds.playSlash();
            addLog(`${attacker.name}'s attack MISSED!`, 'system');
            spawnDamageText('MISSED!', 'dodge', defender.position);
            // Player missed: reset combo (opponent miss does not affect player combo)
            if (isActorPlayer) {
              setPlayer((prev) => ({ ...prev, comboCount: applyComboEvent(prev.comboCount, 'miss') }));
            }
          }
        }
      }

      // 4. ANIMATION RESOLUTION & TURN TRANSITION (1100ms)
      setTimeout(() => {
        // Reset action animations back to idle
        if (isActorPlayer) {
          setPlayer((prev) => ({
            ...prev,
            action: 'idle',
            // Both isBlocking and isInvulnerable are intentionally NOT cleared
            // here: a block or dodge stance must survive into the opponent's
            // turn so the incoming attack can interact with it. Each is
            // consumed when the fighter next acts (pre-clear at the top of
            // executeCombatTurn). This mirrors the isInvulnerable lifecycle
            // and fixes the C-8.5 defect where shield_block was always
            // cleared before the opponent's attack could be blocked.
          }));
        } else {
          setOpp((prev) => ({
            ...prev,
            action: 'idle',
            // isBlocking intentionally NOT cleared here — same lifecycle as
            // the player's block. Consumed via pre-clear at the top of
            // executeCombatTurn when the opponent next acts.
          }));
        }

        setIsExecuting(false);

        // Check match end
        if (opp.health <= 0 || player.health <= 0) {
          return;
        }

        // Toggle turn
        setIsPlayerTurn(!isActorPlayer);
      }, 1100);
    },
    [isExecuting, player, opp, addLog, spawnDamageText, updateCrowdHype]
  );

  // OPPONENT AI TURN STRATEGY ENGINE
  useEffect(() => {
    if (isPlayerTurn || isExecuting || isMatchOver.current || opp.health <= 0) return;

    const aiTimer = setTimeout(() => {
      const dist = Math.abs(player.position[2] - opp.position[2]);
      const effectiveRange = getWeaponRange(opp.loadout.weapon);
      const oppLightCost = getStaminaCost(opp.loadout.weapon, true);
      const oppHeavyCost = getStaminaCost(opp.loadout.weapon, false);

      // Resolve pending heavy-attack telegraph (Goliath). The attack
      // was announced on the previous AI turn; the player has since
      // taken their turn. Clear the telegraph warning and resolve
      // through the standard power_attack pipeline so damage, dodge,
      // and block all use existing code paths.
      //
      // The player's block (if they chose shield_block as their
      // response) persists through the turn-end cleanup (C-8.5 fix):
      // isBlocking is no longer cleared at turn end, so it is active
      // during this power_attack and applies the existing block
      // reduction via calculateAttackDamage. The block is consumed by
      // the pre-clear at the top of executeCombatTurn when the player
      // next acts — no explicit clear is needed here.
      if (opponent.bossMechanic === 'heavy_telegraph' && pendingHeavyAttackRef.current) {
        pendingHeavyAttackRef.current = false;
        setOpp((prev) => ({ ...prev, telegraphText: undefined }));
        // Mark THIS resolution as the wind-up's landing, so it takes the longest
        // hit-stop. Cleared by executeCombatTurn as it resolves.
        telegraphLandingRef.current = true;
        executeCombatTurn('opponent', 'power_attack');
        return;
      }

      // Resolve pending counterattack (Valéria counter_dodge). The
      // counter was queued when Valéria evaded a player attack on the
      // previous turn. Clear the ref before resolving so it cannot fire
      // twice, then resolve through the standard quick_attack pipeline
      // — reusing all existing range, stamina, block, invulnerability,
      // and damage logic.
      if (opponent.bossMechanic === 'counter_dodge' && pendingCounterRef.current) {
        pendingCounterRef.current = false;
        executeCombatTurn('opponent', 'quick_attack');
        return;
      }

      let chosenAction: CombatActionType = 'quick_attack';

      if (dist > effectiveRange) {
        // Distance is large: Advance or Taunt
        chosenAction = chooseAIOutOfRangeAction();
      } else {
        // Inside strike range: Evaluate tactical options
        if (player.isBlocking) {
          // Player is guarding: AI uses Power Attack or Taunt
          const r = Math.random();
          chosenAction = r < 0.45 ? 'power_attack' : r < 0.75 ? 'taunt' : 'shield_block';
        } else if (opp.stamina < oppLightCost) {
          // Low AI stamina: Rest or Shield Block
          chosenAction = Math.random() < 0.6 ? 'shield_block' : 'rest';
        } else if (player.health < 25) {
          // Player low HP: Finish with Quick Attack
          chosenAction = Math.random() < 0.7 ? 'quick_attack' : 'power_attack';
        } else {
          // Standard combat: use the opponent's configured aggression and
          // blockChance to determine the action. See chooseAIStandardAction
          // in combatCalculations.ts for the full probability model. When
          // either value is missing or invalid, the function falls back to
          // the original hardcoded probabilities (46% quick, 26% power, 18%
          // block, 10% dodge).
          chosenAction = chooseAIStandardAction(opponent.aggression, opponent.blockChance);
        }
      }

      // Goliath heavy-attack telegraph: occasionally announce a heavy
      // attack instead of the chosen action. Only when in strike range,
      // with enough stamina for the follow-up power attack (22 SP), and
      // no pending telegraph already queued. ~30% rate keeps the boss
      // threatening without making every turn a telegraph.
      if (
        opponent.bossMechanic === 'heavy_telegraph' &&
        !pendingHeavyAttackRef.current &&
        dist <= effectiveRange &&
        opp.stamina >= oppHeavyCost &&
        Math.random() < 0.30
      ) {
        chosenAction = 'telegraph';
      }

      executeCombatTurn('opponent', chosenAction);
    }, 750);

    return () => clearTimeout(aiTimer);
  }, [isPlayerTurn, isExecuting, player, opp, executeCombatTurn]);

  // Check victory / defeat conditions
  useEffect(() => {
    if (isMatchOver.current) return;

    if (opp.health <= 0) {
      isMatchOver.current = true;
      pendingHeavyAttackRef.current = false;
      pendingCounterRef.current = false;
      setOpp((prev) => ({ ...prev, telegraphText: undefined }));
      sounds.playVictory();
      addLog(`VICTORY! ${player.name} has vanquished ${opp.name}!`, 'crit');
      setTimeout(() => {
        onMatchComplete(statsRef.current, true);
      }, 1400);
    } else if (player.health <= 0) {
      isMatchOver.current = true;
      pendingHeavyAttackRef.current = false;
      pendingCounterRef.current = false;
      setOpp((prev) => ({ ...prev, telegraphText: undefined }));
      // C-8.70B §SET-1 — the player has fallen: the defeat pattern.
      vibrate(HAPTIC_DEFEAT_PATTERN);
      addLog(`DEFEAT! ${player.name} has fallen in the sand.`, 'opponent');
      setTimeout(() => {
        onMatchComplete(statsRef.current, false);
      }, 1400);
    }
  }, [opp.health, player.health, player.name, opp.name, addLog, onMatchComplete]);

  // Boss phase-2 weapon switch (Ignis: dual_blades → mace at 50% health).
  // One-time: guarded by phaseSwitchedRef so the effect cannot re-trigger
  // even if React re-renders before the state update settles. Also guarded
  // against post-match and zero-health states so a killing blow that crosses
  // the threshold does not switch weapons. The guard resets naturally on a
  // fresh DuelScene mount (new ref instance). No phase state is persisted.
  useEffect(() => {
    if (phaseSwitchedRef.current || isMatchOver.current) return;
    if (opponent.bossMechanic !== 'phase_weapon_switch' || !opponent.phase2WeaponType) return;
    const threshold = opp.stats.healthMax * 0.5;
    if (opp.health > 0 && opp.health <= threshold) {
      phaseSwitchedRef.current = true;
      setOpp((prev) => ({
        ...prev,
        isPhase2: true,
        loadout: { ...prev.loadout, weapon: getWeaponByType(opponent.phase2WeaponType!) },
      }));
      addLog(`${opp.name} discards their blades and draws a heavy war mace!`, 'system');
    }
  }, [opp.health, opp.stats.healthMax, opponent.bossMechanic, opponent.phase2WeaponType, opp.name, addLog]);

  // Aurelius rage_mode_colossus: activate rage once when health drops to 50%.
  // Guarded by rageActivatedRef so it fires exactly once per duel. The ref
  // resets naturally on a fresh DuelScene mount. Rage state persists on
  // FighterState.isRaged for the rest of the fight — no save persistence.
  // The 750 ms AI delay ensures rage is active before the opponent's next
  // outgoing attack: setOpp triggers a re-render that recreates
  // executeCombatTurn (which has opp in its deps) before the AI timer fires.
  useEffect(() => {
    if (isMatchOver.current) return;
    if (!shouldActivateRage(opponent.bossMechanic, opp.health, opp.stats.healthMax, rageActivatedRef.current)) return;
    rageActivatedRef.current = true;
    setOpp((prev) => ({ ...prev, isRaged: true }));
    addLog(`${opp.name} enters a devastating RAGE! Attack power surged!`, 'system');
    spawnDamageText('RAGE MODE!', 'crit', opp.position);
  }, [opp.health, opp.stats.healthMax, opponent.bossMechanic, opp.name, addLog, spawnDamageText]);

  return (
    <div className="relative w-full h-full min-h-[100dvh] bg-neutral-950 overflow-hidden select-none">
      {/* 3D WEBGL DUEL CANVAS WRAPPED IN ERROR BOUNDARY & READY GUARD */}
      <WebGLReadyGuard
        sceneName="DuelArena"
        fallbackTitle="Arena Duel WebGL Error"
        onFallbackTo2D={onOpenArmory}
      >
        <WebGLContextErrorBoundary
          fallbackTitle="Arena Duel WebGL Error"
          sceneName="DuelArena"
          onFallbackTo2D={onOpenArmory}
        >
          <Canvas
            shadows
            frameloop={frameloopMode}
            camera={{ position: [0, 6, 12], fov: 45, near: 0.1, far: 80 }}
            gl={{ antialias: false, powerPreference: 'high-performance' }}
            onCreated={(state) => {
              logCanvasWebGLCreated(state.gl, 'DuelArena');
              setupCanvasContextRestoration(state.gl);
            }}
          >
            {/* Active GPU Health & Context Monitor */}
            <CanvasWebGLMonitor sceneName="DuelArena" />
            {/* C-8.70B §SET-1 — the brightness row, applied on creation and live. */}
            <SceneBrightness />

            <Sky sunPosition={[40, 25, 20]} turbidity={7} rayleigh={1.8} mieCoefficient={0.005} />
            <fog attach="fog" args={['#d4a373', 25, 65]} />
            <ambientLight intensity={0.65} color="#fef3c7" />
            <directionalLight
              position={[15, 25, 15]}
              intensity={1.9}
              color="#fffbeb"
              castShadow
              shadow-mapSize={[2048, 2048]}
            />
            <directionalLight position={[-15, 10, -15]} intensity={0.5} color="#38bdf8" />
            <Sparkles count={50} scale={[20, 10, 20]} size={2} color="#fef08a" opacity={0.5} />

            <ThreeComponentErrorBoundary componentName="DuelArenaArchitecture">
              <DuelArena />
            </ThreeComponentErrorBoundary>

            <ThreeComponentErrorBoundary componentName="DuelFightersGladiatorMeshes">
              <Suspense fallback={<CanvasLoadingFallback />}>
                <GladiatorMesh fighter={player} isLeftyMode={isLeftyMode} impactRef={impactRef} />
                <GladiatorMesh fighter={opp} impactRef={impactRef} />
                <FloatingDamage3D damages={damageNumbers} />
              </Suspense>
            </ThreeComponentErrorBoundary>

            <DuelCameraRig
              playerPos={player.position}
              opponentPos={opp.position}
              cameraMode={cameraMode}
              impactRef={impactRef}
              shakeMultiplierRef={shakeMultiplierRef}
            />
          </Canvas>
        </WebGLContextErrorBoundary>
      </WebGLReadyGuard>

      {/* SWORDS & SANDALS COMBAT HUD & TACTICAL DASHBOARD */}
      <CombatHUD
        player={player}
        opponent={opp}
        crowdHype={crowdHype}
        comboCount={player.comboCount}
        matchTimer={matchTimer}
        isMuted={isMuted}
        onToggleMute={onToggleMute}
        onOpenArmory={onOpenArmory}
        onOpenHelp={onOpenHelp}
        cameraMode={cameraMode}
        onCycleCameraMode={() =>
          setCameraMode((prev) =>
            prev === 'cinematic' ? 'over_shoulder' : prev === 'over_shoulder' ? 'isometric' : 'cinematic'
          )
        }
        onOpenSettings={onOpenSettings}
        distance={currentDistance}
        isPlayerTurn={isPlayerTurn}
        isExecuting={isExecuting}
        combatLog={combatLog}
        onExecuteAction={(action) => executeCombatTurn('player', action)}
      />
    </div>
  );
};

