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
import { calculateDuelGold } from '../../utils/duelRewards';
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
  isAttackInRange,
  shieldGuardStaminaGain,
  DODGE_STAMINA_COST,
  applyDefensiveAction,
  clearDefensiveStance,
} from '../../utils/combatCalculations';
import { createPendingStrike, type PendingStrike } from '../../utils/pendingStrike';
import {
  isCounterDodgeOpponent,
  queuesCounterOnEvade,
  rollsPassiveEvade,
} from '../../utils/counterDodge';
import {
  createPlayerStrike,
  canResolveStrikeImpact,
  type PlayerStrike,
  type PlayerStrikeAction,
} from '../../utils/playerStrike';
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

  // C-8.70B §R1 — the announced enemy strike. `pendingEnemyAttack` is the
  // readable cue (the HUD banner + the wind-up log line); the damage itself is
  // only ever resolved when the wind-up timer ends and calls the SAME
  // executeCombatTurn the attack always went through, so no formula, hit chance
  // or boss value moves. `reactionTaken` records that the player spent their one
  // reaction (Shield Guard or Dodge) inside the window.
  const [pendingEnemyAttack, setPendingEnemyAttack] = useState<'quick_attack' | 'power_attack' | null>(null);
  const [reactionTaken, setReactionTaken] = useState(false);
  // C-8.73B — the player's OWN wind-up cue. This is a mirror of
  // `playerStrikeRef.current.pending`, written only by the controller's
  // `onPendingChange` (commit, impact, cancellation), so there is no second
  // timer and no second source of truth to drift from the actual strike.
  const [pendingPlayerAttack, setPendingPlayerAttack] = useState<PlayerStrikeAction | null>(null);

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

  // ── Combat responsiveness §R1 — pending enemy strike bookkeeping ───────────
  // `strikeRef` owns the announced action, its ONE scheduled impact and the
  // player's ONE reaction (utils/pendingStrike), so a doubled announcement, a
  // callback that fires after a cancel, or a second reaction cannot resolve a
  // strike twice. `resolutionTimerRef` is the existing 1100 ms turn-end timeout,
  // now tracked so it can be cleared too. Both are dropped when the fight ends or
  // the scene unmounts, which is what stops a delayed hit after the player has
  // left. `resolvingRef` is the synchronous re-entrancy guard (React state is one
  // render behind, so two calls in the same tick used to be able to slip past
  // `isExecuting`).
  const strikeRef = useRef<PendingStrike | null>(null);
  if (strikeRef.current === null) strikeRef.current = createPendingStrike();
  const resolutionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvingRef = useRef(false);
  // The wind-up timer must call the LATEST executeCombatTurn, not the closure it
  // was scheduled with — otherwise a block raised during the cue would resolve
  // against a stale `player` and be ignored.
  const executeTurnRef = useRef<(actor: 'player' | 'opponent', action: CombatActionType) => void>(() => {});

  // C-8.71B — the PLAYER's own strike now has the readable wind-up the enemy's
  // has had since §R1: the swing and its telegraph are committed at the tap, and
  // the blow lands one PLAYER_ATTACK_WINDUP_MS later. `playerStrikeRef` owns that
  // ONE scheduled impact (so a second tap cannot queue a second blow), and
  // `fightersRef` is the state the impact validates itself against, so a stale
  // closure can never resolve damage into a fight that has moved on.
  const playerStrikeRef = useRef<PlayerStrike | null>(null);
  if (playerStrikeRef.current === null) {
    playerStrikeRef.current = createPlayerStrike({ onPendingChange: setPendingPlayerAttack });
  }
  const fightersRef = useRef({ player, opp });
  useEffect(() => {
    fightersRef.current = { player, opp };
  }, [player, opp]);

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
      // Synchronous guard: `resolvingRef` flips in the same tick, so a doubled
      // click or a repeated direct call cannot resolve twice (the state-based
      // check alone was one render behind).
      if (resolvingRef.current || isMatchOver.current) return;

      const isActorPlayer = actor === 'player';
      const attackerNow = isActorPlayer ? player : opp;

      // Read-and-clear the telegraphed-heavy marker for THIS resolution, before
      // ANY branch can return, so a miss, an evade or a refused swing cannot
      // leave it set for a later attack. C-8.71A moved this above the range
      // guard: the guard's own refusal used to return first, so a telegraph the
      // player stepped out of left the marker set and the boss's next ordinary
      // landing took the telegraphed heavy's 200 ms hit-stop.
      const isTelegraphedHeavy = !isActorPlayer && telegraphLandingRef.current;
      telegraphLandingRef.current = false;

      // C-8.70B §R3 — the authoritative range guard. It runs BEFORE any stamina
      // is spent, any animation starts, any damage is rolled or the turn is
      // committed, so a stale UI or a direct call cannot cost stamina or a turn
      // on a swing that cannot land. The tactic panel disables the same buttons
      // through the same shared rule.
      const isAttackAction = actionType === 'quick_attack' || actionType === 'power_attack';
      if (isAttackAction) {
        const gap = Math.abs(player.position[2] - opp.position[2]);
        if (!isAttackInRange(gap, attackerNow.loadout.weapon)) {
          addLog(
            `${attackerNow.name} is out of range — Advance before striking.`,
            'system',
          );
          // C-8.71A — a refused strike never holds the turn. The one call that
          // can arrive here with the panel already locked is the landing of an
          // announced opponent strike (announcing it sets `isExecuting`), and no
          // turn-end timer was ever scheduled for it; the refusal must release
          // that lock and hand the turn back, or the HUD stays locked with no
          // turn to take. A player action is never affected: while a resolution
          // or an announcement is in flight its controls are disabled, and
          // `resolvingRef` refuses the call above.
          if (!isActorPlayer && isExecuting) {
            setIsExecuting(false);
            setIsPlayerTurn(true);
          }
          return;
        }
      }

      resolvingRef.current = true;
      setIsExecuting(true);

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
        // C-8.70B §R2 — raising the guard recovers no stamina by itself. The
        // `staminaRegen` this branch used to apply unconditionally made Shield
        // Guard strictly better than Dodge (damage reduction AND free recovery,
        // where Dodge pays 12 SP); the regen now happens only in the resolution's
        // `isBlocked` branch, i.e. when the guard actually stops a blow.
        if (isActorPlayer) {
          setPlayer((prev) => ({
            ...prev,
            action: 'block',
            isBlocking: true,
          }));
        } else {
          setOpp((prev) => ({
            ...prev,
            action: 'block',
            isBlocking: true,
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
            stamina: Math.max(0, prev.stamina - DODGE_STAMINA_COST),
          }));
          statsRef.current.dodgesPerformed += 1;
        } else {
          setOpp((prev) => ({
            ...prev,
            action: 'dodge',
            isInvulnerable: true,
            stamina: Math.max(0, prev.stamina - DODGE_STAMINA_COST),
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

        // Range was validated by the authoritative guard at the top of this
        // function (C-8.70B §R3), before a single point of stamina was spent, so
        // there is no separate out-of-range path left to reach here.
        //
        // C-8.71B — this is the IMPACT, not the commit. For the player it runs at
        // the end of the wind-up (one PLAYER_ATTACK_WINDUP_MS later); for an
        // announced enemy strike it runs at the end of ITS wind-up, exactly as
        // before. Both read the same formulas.
        const resolveImpact = () => {
          // Re-read the fight at the impact point rather than trusting the
          // commit's closure: a duel already decided, a downed attacker or
          // target, or (after any future movement change) a target out of reach
          // resolves NOTHING, so a stale strike can never damage an obsolete
          // target. Nothing in the shipped lifecycle can move state inside the
          // window — every action is locked by `resolvingRef`/`isExecuting` — so
          // this is the same defence-in-depth guarantee C-8.71A gave the range
          // guard. The turn still ends through the timer below, so a dropped
          // blow can never leave the fight locked.
          const live = fightersRef.current;
          const gapNow = Math.abs(live.player.position[2] - live.opp.position[2]);
          const attackerHealth = isActorPlayer ? live.player.health : live.opp.health;
          const defenderHealth = isActorPlayer ? live.opp.health : live.player.health;
          if (
            !canResolveStrikeImpact({
              isMatchOver: isMatchOver.current,
              attackerHealth,
              defenderHealth,
              distance: gapNow,
              weapon: attacker.loadout.weapon,
            })
          ) {
            // The fight is over (its own outcome effect owns the settlement), so
            // stay silent; otherwise the target has left the weapon's reach and
            // the swing is spent on air.
            if (!isMatchOver.current && attackerHealth > 0 && defenderHealth > 0) {
              addLog(`${defender.name} slips out of reach — ${attacker.name}'s strike lands on air.`, 'system');
            }
            return;
          }

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
          //
          // C-8.75B — the mechanic gate and the rate now come from the one
          // shared reader (`utils/counterDodge`), so only a counter_dodge boss
          // can passively evade and the rate has a single answer. The roll, its
          // ordering and its short-circuits are unchanged: exactly one
          // `Math.random()` is consumed, and only when the earlier conditions
          // already hold, so no other opponent's RNG stream moves.
          const isPassiveEvaded =
            !isEvaded &&
            isActorPlayer &&
            isCounterDodgeOpponent(opponent) &&
            !defender.isInvulnerable &&
            rollsPassiveEvade(opponent, Math.random());

          if (isEvaded || isPassiveEvaded) {
            sounds.playDodge();
            addLog(`${defender.name} swiftly EVADED ${attacker.name}'s strike!`, 'system');
            spawnDamageText('EVADED!', 'dodge', defender.position);
            // Queue a counterattack for Valéria's next AI turn.
            // Only when the player is the attacker against a
            // counter_dodge boss — a player evading Valéria's own
            // counter must NOT chain into another counter.
            if (queuesCounterOnEvade(isActorPlayer, opponent)) {
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
              // C-8.70B §R2 — Shield Guard's ONLY recovery: the guard stopped a
              // blow. Applied here (and only here) so raising a shield that
              // nothing hits recovers nothing, and so one blocked strike can
              // never credit the regen twice.
              const guardGain = shieldGuardStaminaGain(true, defender.stats.staminaRegen);
              if (isActorPlayer) {
                setOpp((prev) => ({
                  ...prev,
                  stamina: applyStaminaRegen(prev.stamina, prev.stats.staminaMax, guardGain),
                }));
              } else {
                setPlayer((prev) => ({
                  ...prev,
                  stamina: applyStaminaRegen(prev.stamina, prev.stats.staminaMax, guardGain),
                }));
              }
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
        };

        // C-8.71B — the player's blow lands at the END of the anticipation
        // window, not in the commit that started the swing. The animation above
        // is the telegraph (it is driven for the whole window), stamina was spent
        // once, at that commit, and is deliberately NOT refunded if the swing is
        // dropped — the same rule a miss or an evade already follows. The
        // opponent's strike has worked this way since §R1 (announce → 700 ms →
        // resolve), so both fighters now read with one anticipation rule. The
        // 1100 ms turn timer below is unchanged and still owns the turn: the
        // impact is scheduled first (700 < 1100), so it cannot run after the
        // turn has passed, and the opponent cannot answer before it lands.
        if (isActorPlayer) {
          if (playerStrikeRef.current?.strike(actionType, resolveImpact)) {
            addLog(
              `${attacker.name} winds up a ${isQuick ? 'quick strike' : 'power slash'}…`,
              'player',
            );
          }
        } else {
          // The AI's strike resolves through the same block, at the end of its
          // own announced wind-up, exactly as it always has.
          resolveImpact();
        }
      }

      // 4. ANIMATION RESOLUTION & TURN TRANSITION (1100ms)
      // Tracked so the scene can cancel it on unmount or at the end of the
      // fight: a turn that lands after the player has left must not toggle a
      // turn or re-open the resolution guard.
      resolutionTimerRef.current = setTimeout(() => {
        resolutionTimerRef.current = null;
        // C-8.71B — a wind-up that has not fired by the end of the resolution
        // window is dropped rather than landing after the turn has passed (it
        // already cleared itself at impact, so this is inert on the normal path).
        playerStrikeRef.current?.cancel();
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
        resolvingRef.current = false;

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

  // Keeps the wind-up timer pointed at the CURRENT resolution closure, so the
  // delayed hit reads the health/stance state as it stands at the impact point
  // rather than the state captured when the attack was announced.
  useEffect(() => {
    executeTurnRef.current = executeCombatTurn;
  }, [executeCombatTurn]);

  // ── Combat responsiveness §R1 — the announced enemy strike ─────────────────
  // The AI selects an action; when it is a strike, this announces it and holds
  // the damage for ENEMY_ATTACK_WINDUP_MS so the HUD's cue can be read and
  // answered. The strike itself still resolves through the SAME
  // executeCombatTurn the attack always went through, so no formula, hit chance,
  // weapon value or boss mechanic moves.
  const cancelPendingEnemyAttack = useCallback(() => {
    strikeRef.current?.cancel();
    setPendingEnemyAttack(null);
    setReactionTaken(false);
  }, []);

  const announceEnemyAttack = useCallback(
    (actionType: 'quick_attack' | 'power_attack') => {
      if (isMatchOver.current) return;

      // One announcement at a time: `announce` refuses while a strike is pending,
      // so a second call inside the window cannot queue the strike — or its
      // damage — twice. The impact reads the LATEST resolution closure, so a
      // stance raised during the cue (or any other state written while it was up)
      // is what the blow meets.
      const announced = strikeRef.current?.announce(actionType, (landing) => {
        setPendingEnemyAttack(null);
        setReactionTaken(false);
        if (isMatchOver.current) return;
        executeTurnRef.current('opponent', landing);
      });
      if (!announced) return;

      setPendingEnemyAttack(actionType);
      setReactionTaken(false);
      // Locks the normal actions for the whole announcement + resolution window.
      setIsExecuting(true);
      // The opponent's swing animation starts HERE, so the blow lands mid-swing at
      // the resolution point — and re-setting the same action when the resolution
      // runs does NOT restart the clip, because GladiatorMesh only resets a clip
      // when the action it is driven with changes. That is the animation/timing
      // synchronization: no new clip, no new mixer and no combat formula change.
      setOpp((prev) => ({
        ...prev,
        action: actionType === 'quick_attack' ? 'attack_light' : 'attack_heavy',
      }));
      addLog(
        `${opp.name} winds up a ${actionType === 'quick_attack' ? 'quick strike' : 'power slash'} — brace or dodge!`,
        'opponent',
      );
    },
    [opp.name, addLog],
  );

  /**
   * The player's one answer to an announced strike: raise the shield or dodge.
   * A reaction is NOT a turn — it writes the same stance flags the fighter's own
   * turn would, and the pending attack then resolves through the existing rules
   * (block reduction from the weapon, or the 75 % evade roll). The two stances
   * replace each other, so mashing both cannot stack a guaranteed block with an
   * evade, and only one reaction is accepted per announcement.
   */
  const reactToPendingAttack = useCallback(
    (action: 'shield_block' | 'dodge') => {
      if (isMatchOver.current) return;
      // The stamina check runs BEFORE the claim, so a failed dodge does not
      // consume the announcement's one reaction.
      if (action === 'dodge' && player.stamina < DODGE_STAMINA_COST) return;
      // One reaction per announcement: `claimReaction` is what stops mashing both
      // buttons from stacking a guaranteed block with an evade.
      if (!strikeRef.current?.claimReaction()) return;

      setReactionTaken(true);

      if (action === 'dodge') {
        sounds.playDodge();
        statsRef.current.dodgesPerformed += 1;
        setPlayer((prev) => ({
          ...prev,
          action: 'dodge',
          ...applyDefensiveAction(clearDefensiveStance(prev), 'dodge'),
          stamina: Math.max(0, prev.stamina - DODGE_STAMINA_COST),
        }));
        addLog(`${player.name} throws themselves into a dodge!`, 'player');
        spawnDamageText('DODGE!', 'dodge', player.position);
      } else {
        sounds.playBlock();
        setPlayer((prev) => ({
          ...prev,
          action: 'block',
          ...applyDefensiveAction(clearDefensiveStance(prev), 'shield_block'),
        }));
        addLog(`${player.name} snaps the shield up!`, 'player');
        spawnDamageText('GUARD!', 'blocked', player.position);
      }
    },
    [player.stamina, player.name, player.position, addLog, spawnDamageText],
  );

  // No blow may outlive the scene: an unmount (leaving the arena, a reload, the
  // result screen) drops the pending strike and the turn-end timeout, so no
  // delayed hit can land and no second resolution can start after the player has
  // gone. The 1400 ms result settlement is deliberately NOT dropped here: the
  // fight is already decided, so its purse (or its defeat) has been earned and is
  // kept even if the player leaves through the HUD's Armory shortcut first. That
  // settlement cannot run twice — the outcome effect latches `isMatchOver` before
  // scheduling it and nothing ever clears the latch.
  useEffect(
    () => () => {
      if (resolutionTimerRef.current !== null) clearTimeout(resolutionTimerRef.current);
      resolutionTimerRef.current = null;
      // Drops the announcement and makes its scheduled callback inert, so a hit
      // can never land in a scene that has gone.
      strikeRef.current?.cancel();
      // C-8.71B — the player's own pending swing is dropped for the same reason:
      // leaving the arena (or the HUD's Armory shortcut unmounting the scene)
      // must not let a delayed blow land afterwards.
      playerStrikeRef.current?.cancel();
    },
    [],
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
      // previous turn.
      //
      // C-8.75B — the counter is an ENEMY STRIKE, so it is announced through
      // the same 700 ms telegraph/reaction lifecycle every other enemy strike
      // uses (`announceEnemyAttack` → `pendingStrike` → the existing
      // `executeCombatTurn('opponent', 'quick_attack')` resolution) instead of
      // resolving the instant it is reached. Before this phase it called
      // `executeCombatTurn` directly, so the player was hit by a strike they
      // were never shown and could never answer. The trigger, the action, the
      // damage, the range guard, the stamina cost and every evade rule are
      // unchanged: only WHEN the blow is announced and whether it can be
      // answered changed.
      //
      // The latch is consumed BEFORE announcing, so this one queued counter can
      // never be spent twice, and `announce` itself refuses a second strike
      // while one is pending (and does nothing once the fight is decided), so
      // the counter cannot resolve twice or survive into a stale turn.
      if (isCounterDodgeOpponent(opponent) && pendingCounterRef.current) {
        pendingCounterRef.current = false;
        announceEnemyAttack('quick_attack');
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

      // A strike is ANNOUNCED, not resolved: it becomes visible intent for
      // ENEMY_ATTACK_WINDUP_MS and only then meets the existing resolution. The
      // non-attack actions (advance, retreat, taunt, rest, shield block, dodge,
      // telegraph) resolve immediately exactly as before.
      if (chosenAction === 'quick_attack' || chosenAction === 'power_attack') {
        announceEnemyAttack(chosenAction);
        return;
      }

      executeCombatTurn('opponent', chosenAction);
    }, 750);

    return () => clearTimeout(aiTimer);
  }, [isPlayerTurn, isExecuting, player, opp, executeCombatTurn, announceEnemyAttack]);

  // Check victory / defeat conditions
  useEffect(() => {
    if (isMatchOver.current) return;

    if (opp.health <= 0) {
      isMatchOver.current = true;
      pendingHeavyAttackRef.current = false;
      pendingCounterRef.current = false;
      // The fight is over: drop any announced strike so no delayed hit can land
      // after the result, and no duplicate payout can follow.
      cancelPendingEnemyAttack();
      // C-8.71B — and the player's own pending swing, so nothing resolves into a
      // decided fight. (Inert today: only the player's impact can end a fight.)
      playerStrikeRef.current?.cancel();
      setOpp((prev) => ({ ...prev, telegraphText: undefined }));
      sounds.playVictory();
      addLog(`VICTORY! ${player.name} has vanquished ${opp.name}!`, 'crit');
      // The purse the crowd actually pays for this fight: the opponent's own
      // bounty plus performance bonuses read off the fight's statistics. It is
      // written onto the ONE stats object App credits, so the result screen and
      // the gold in the purse can never disagree.
      const purse = calculateDuelGold({
        baseGold: opponent.rewardGold,
        didWin: true,
        crowdHypePeak: statsRef.current.crowdHypePeak,
        perfectBlocks: statsRef.current.perfectBlocks,
        damageTaken: statsRef.current.damageTaken,
      });
      statsRef.current.goldEarned = purse.total;
      statsRef.current.goldBreakdown = purse;
      addLog(`The crowd pays out ${purse.total} gold.`, 'system');
      setTimeout(() => {
        onMatchComplete(statsRef.current, true);
      }, 1400);
    } else if (player.health <= 0) {
      isMatchOver.current = true;
      pendingHeavyAttackRef.current = false;
      pendingCounterRef.current = false;
      cancelPendingEnemyAttack();
      playerStrikeRef.current?.cancel();
      setOpp((prev) => ({ ...prev, telegraphText: undefined }));
      // C-8.70B §SET-1 — the player has fallen: the defeat pattern.
      vibrate(HAPTIC_DEFEAT_PATTERN);
      addLog(`DEFEAT! ${player.name} has fallen in the sand.`, 'opponent');
      // The arena only feeds a winner: a defeat pays no purse at all.
      statsRef.current.goldEarned = 0;
      setTimeout(() => {
        onMatchComplete(statsRef.current, false);
      }, 1400);
    }
  }, [opp.health, player.health, player.name, opp.name, addLog, onMatchComplete, cancelPendingEnemyAttack]);

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
            // C-8.74B — duel pixel budget.  Without a `dpr` prop the buffer
            // follows window.devicePixelRatio with no cap, so a 3x phone shades
            // 9x the CSS pixel count.  React Three Fiber clamps an array range as
            // min(max(min, devicePixelRatio), max), so [1, 2] leaves a 1x or 2x
            // device untouched and caps a 3x device at 2.  Fragment resolution
            // only: no light, shadow, material, geometry, camera or combat change.
            dpr={[1, 2]}
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
              shadow-mapSize={[1024, 1024]}
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
        pendingEnemyAttack={pendingEnemyAttack}
        pendingPlayerAttack={pendingPlayerAttack}
        reactionTaken={reactionTaken}
        onReactToPendingAttack={reactToPendingAttack}
        onExecuteAction={(action) => executeCombatTurn('player', action)}
      />
    </div>
  );
};
