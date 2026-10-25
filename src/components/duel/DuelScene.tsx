import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sparkles, useGLTF, Sky, Html } from '@react-three/drei';
import * as THREE from 'three';
import { PlayerProfile, OpponentConfig, FighterState, DuelStatistics, DamageNumber } from '../../types/game';
import { DuelArena } from '../3d/DuelArena';
import { GladiatorMesh, type ImpactState } from '../3d/GladiatorMesh';
import { ImpactParticles, type ImpactParticlesHandle } from '../3d/ImpactParticles';
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
  applyPalmaEvent,
  updateHypePeak,
} from '../../utils/combatCalculations';
import {
  buildOpponentModifiers,
  buildPlayerModifiers,
  critChanceFor,
  effectiveBlockReduction,
  hitAgilityFor,
  passiveEvadeChance,
  recordHitType,
  resolveTraitMult,
  staminaCostWithModifiers,
} from '../../utils/combatModifiers';
import {
  canCastNet,
  decrementEntangle,
  entangledHitChance,
  isEntangled,
  netCritBonusModifiers,
  resolveNetCast,
  rollBonusStrike,
  shouldAICastNet,
  twinFangsApplies,
  twinFangsBaseDamage,
  twinFangsComboEvent,
  TWIN_FANGS_LANDED_HYPE,
} from '../../utils/statefulDoctrinae';
import {
  applyPitBellowerDrain,
  applyPyreBrandHeal,
  pitBellowerStaminaDrain,
  pyreBrandHealAmount,
} from '../../utils/bossPalmae';
import { sounds } from '../../audio/soundEffects';
import { crowdHypeTier, detectCrowdHypeCrossing } from '../../utils/crowdHype';
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
import { CoachCard } from '../ui/CoachCard';
import {
  BEAT_EXPIRY_ACTIONS,
  beatDismissesOn,
  evaluateBeats,
  getCoachCard,
  resolveSeenState,
  type CombatSnapshot,
  type PlayerStrikeResult,
  type SeenState,
} from '../../utils/coachMarks';

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
  /**
   * CH-3b — the dimachaerus' Twin Fangs bonus strike. It reuses the light
   * attack's own animation (the attacker is already mid-`attack_light`); this
   * shorter hold is what makes the second bite read as a separate, lighter beat.
   */
  twin: 35,
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

// ── CF-5 — TURN PACING BY ACTION WEIGHT ─────────────────────────────────────
// These numbers are FEEL PACING, NOT GAME LOGIC. Every outcome of a turn —
// damage, hit chance and crits, stamina, combo, hype, entanglement, the purse —
// is already computed before the resolution timer below is scheduled; the timer
// only decides how long the result sits on the sand before the action animations
// reset and the turn is handed over. So the table can be tuned for weight and
// readability without touching a single rule: a heavy blow gets time to land, a
// step or a guard gets just enough to read, and a killing turn gets the longest
// beat of all so the fall is never cut off. Nothing here feeds back into combat.
const TURN_RESOLUTION_MS: Record<CombatActionType, number> = {
  /** Quick attack — the lightest strike, readable but brief. */
  quick_attack: 880,
  /** Power attack — the wind-up and its aftermath need the extra hold. */
  power_attack: 1300,
  /** The boss's announced overhead smash — the longest read in the fight. */
  telegraph: 1450,
  /** Every positional, defensive and utility action shares one short beat. */
  advance: 800,
  retreat: 800,
  shield_block: 800,
  dodge: 800,
  taunt: 800,
  rest: 800,
  /**
   * CH-3b's net throw postdates the CF-5 design, so it carried no weight of its
   * own. Director ruling: it takes the quick_attack weight (880 ms). The throw
   * is an offensive action with a throw animation and a land/miss resolution,
   * not an 800 ms utility beat (advance / retreat / block / dodge / taunt /
   * rest), so it belongs with quick_attack.
   */
  cast_net: 880,
};

/** A turn that leaves a fighter at 0 health holds this long, whatever it was. */
const TURN_RESOLUTION_DEATH_MS = 1600;

/** The resolution hold for one turn: the action's weight, or the death beat. */
export const turnResolutionMs = (actionType: CombatActionType, fightEnded = false): number =>
  fightEnded ? TURN_RESOLUTION_DEATH_MS : TURN_RESOLUTION_MS[actionType];

// The opponent's think time. Unchanged at 750 ms, except on the AI turn that
// follows a resolved telegraphed heavy, which waits 900 ms so that fight's
// heaviest beat can be read before the opponent moves again.
const AI_TURN_DELAY_MS = 750;
const AI_TURN_DELAY_AFTER_TELEGRAPH_MS = 900;

/** The AI's think time for one turn. */
export const aiTurnDelayMs = (afterTelegraphedHeavy: boolean): number =>
  afterTelegraphedHeavy ? AI_TURN_DELAY_AFTER_TELEGRAPH_MS : AI_TURN_DELAY_MS;

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
  /** CL-3 — App's one seen-write (the same `markSeen` path the hub card uses). */
  onMarkCardSeen?: (id: string) => void;
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
    // — inside the shortest 800 ms resolution window (CF-5) — so the rig can only
    // shake during, or in the tail of, a resolution, never on a quiet player turn.
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
  onMarkCardSeen,
}) => {
  const pStats = calculateTotalStats(playerProfile);

  // CH-3a — each fighter's merged armatura/palma block, built ONCE per duel (the
  // profile and the opponent config cannot change mid-fight). `TurnActionPanel`
  // receives these SAME objects through the HUD, so its cost/hit/damage estimates
  // and the resolution below read one block and can never drift apart.
  const playerMods = useMemo(() => buildPlayerModifiers(playerProfile), [playerProfile]);
  const opponentMods = useMemo(() => buildOpponentModifiers(opponent), [opponent]);

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
    // CH-3b — transient duel state only. The net belongs to the retiarius
    // doctrina; the entangle counter starts clear and nothing here is saved.
    netAvailable: playerMods.armaturaId === 'retiarius',
    entangledTurns: 0,
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
    // CH-3b — an AI retiarius carries its net when its own armatura resolves to
    // retiarius (the opponent config lands in CH-4; the read is already here).
    netAvailable: opponentMods.armaturaId === 'retiarius',
    entangledTurns: 0,
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

  // CF-3 — the crowd's celebration counter. UpdateCrowdHype bumps it on every
  // UPWARD tier crossing and DuelArena reads it once per frame; a ref, so a
  // celebration never re-renders the scene.
  const crowdPulseRef = useRef(0);

  const updateCrowdHype = useCallback((updater: (prev: number) => number) => {
    const prev = crowdHypeRef.current;
    const next = updater(prev);
    crowdHypeRef.current = next;
    setCrowdHype(next);
    statsRef.current.crowdHypePeak = updateHypePeak(statsRef.current.crowdHypePeak, next);

    // CF-3 — the one place the crowd reacts to hype. The tier thresholds are
    // CombatHUD's own strict `> 40` / `> 75`, so the crowd and the meter the
    // player is watching change together; the hype numbers above are untouched.
    // An upward crossing is the celebration (level + swell + bounce); a
    // downward one only lowers the bed's level.
    const crossing = detectCrowdHypeCrossing(prev, next);
    if (crossing) {
      sounds.setCrowdLevel(crossing.level);
      if (crossing.upward) {
        sounds.playCrowdSwell();
        crowdPulseRef.current += 1;
      }
    }
  }, []);

  // ── CL-3 — the Doctore's guided beats ───────────────────────────────────────
  // The engine (`evaluateBeats`) is pure: it is handed a snapshot of the state
  // this scene already holds and the profile's resolved `seen` record, and it
  // answers the one beat to show. Nothing here pauses the simulation, blocks an
  // action or intercepts a touch — the card is non-modal by construction.
  const [playerTurnCount, setPlayerTurnCount] = useState(1);
  const [resolvedActionCount, setResolvedActionCount] = useState(0);
  const [lastPlayerStrike, setLastPlayerStrike] = useState<
    { result: PlayerStrikeResult; seq: number } | null
  >(null);
  const strikeSeqRef = useRef(0);
  const [activeBeat, setActiveBeat] = useState<string | null>(null);
  const activeBeatRef = useRef<string | null>(null);
  /** Resolved actions since the card was shown — the 2-action expiry. */
  const beatActionsRef = useRef(0);
  /** This duel's own seen record, seeded from the profile and written on dismissal. */
  const seenBeatsRef = useRef<SeenState>(resolveSeenState(playerProfile));

  /**
   * Record one resolved player strike. The sequence makes two identical outcomes
   * two distinct pieces of state, so a repeated miss still re-runs the evaluator.
   */
  const notePlayerStrike = useCallback((result: PlayerStrikeResult) => {
    strikeSeqRef.current += 1;
    setLastPlayerStrike({ result, seq: strikeSeqRef.current });
  }, []);

  /**
   * Dismiss the card that is actually on screen and record it seen. Called ONLY
   * from a real dismissal (the ✕, the action the beat teaches, or the 2-action
   * expiry), so a beat is never recorded before it has rendered.
   */
  const dismissBeat = useCallback(
    (id: string) => {
      if (activeBeatRef.current !== id) return;
      activeBeatRef.current = null;
      beatActionsRef.current = 0;
      seenBeatsRef.current = { ...seenBeatsRef.current, [id]: true };
      setActiveBeat(null);
      onMarkCardSeen?.(id);
    },
    [onMarkCardSeen],
  );

  const [matchTimer, setMatchTimer] = useState(0);
  const [cameraMode, setCameraMode] = useState<'cinematic' | 'over_shoulder' | 'isometric'>('cinematic');
  const [frameloopMode, setFrameloopMode] = useState<'demand' | 'always'>('demand');

  useEffect(() => {
    const timer = setTimeout(() => {
      setFrameloopMode('always');
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  // CF-3 — the crowd's noise bed lives exactly as long as the duel: started on
  // mount at the tier the opening hype (25) is in — LOW — and stopped on
  // unmount, so leaving the arena never leaves noise behind. The engine itself
  // no-ops while muted and restores the bed when it is unmuted.
  useEffect(() => {
    sounds.startCrowdBed();
    sounds.setCrowdLevel(crowdHypeTier(crowdHypeRef.current));
    return () => sounds.stopCrowdBed();
  }, []);

  const statsRef = useRef<DuelStatistics>({
    damageDealt: 0,
    damageTaken: 0,
    hitsLanded: 0,
    perfectBlocks: 0,
    dodgesPerformed: 0,
    maxCombo: 0,
    // STORY-2 — the stamina low-water mark starts at full: the duel opens on
    // `pStats.staminaMax` (see the player factory above), so nothing has been
    // spent until the first action does.
    lowestStaminaFraction: 1,
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
  // CH-3a — Phoenix Nerves' "once per fight": the event stage reports whether a
  // miss may be shielded, this ref remembers that it already was.
  const comboShieldUsedRef = useRef(false);

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
  // CF-5 — marks that a telegraphed heavy has RESOLVED, so the AI's next turn
  // waits its longer 900 ms beat (see aiTurnDelayMs above). Set beside the
  // landing marker below and cleared as that next AI turn is taken, so the turn
  // after it is back to 750 ms.
  const telegraphAftermathRef = useRef(false);
  // CH-4 — marks the ONE resolution that is Valéria's queued counterattack, so
  // Viper's Patience's +20 % lands on it and on nothing else. Set by the AI
  // branch that resolves `pendingCounterRef`, read-and-cleared beside the
  // telegraph marker above.
  const counterStrikeRef = useRef(false);

  // CF-4 — the impact-particle pool's imperative handle. One pooled THREE.Points
  // lives inside the Canvas below; `burst()` is called from the landed branches of
  // executeCombatTurn. A ref, so a burst re-renders nothing and no timer or combat
  // value is involved.
  const impactParticlesRef = useRef<ImpactParticlesHandle>(null);

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

  // STORY-2 — the stamina low-water mark, tracked exactly the way maxCombo is:
  // a Math.min over the duel, so it only ever falls, and it reads the player's
  // live stamina against the maximum he entered with. A reading of the fight,
  // never a rule of it: no formula above consults this value.
  useEffect(() => {
    const max = player.stats.staminaMax;
    if (!Number.isFinite(max) || max <= 0) return;
    const fraction = Math.max(0, Math.min(1, player.stamina / max));
    statsRef.current.lowestStaminaFraction = Math.min(
      statsRef.current.lowestStaminaFraction,
      fraction
    );
  }, [player.stamina, player.stats.staminaMax]);

  // Distance in 3D arena
  const currentDistance = Math.abs(player.position[2] - opp.position[2]);

  // CL-3 — evaluate after every resolved action (and on the opening turn). One
  // card at a time: while one is up, the evaluator is not consulted, so several
  // coinciding triggers show the lowest-numbered beat first and the rest follow
  // in later evaluations.
  useEffect(() => {
    if (activeBeatRef.current || isMatchOver.current) return;

    const snapshot: CombatSnapshot = {
      phase: 'fight',
      opponentId: opponent.id,
      isBoss: opponent.isBoss === true,
      playerTurn: playerTurnCount,
      playerActing: isPlayerTurn && !isExecuting,
      inReach: currentDistance <= getWeaponRange(player.loadout.weapon),
      playerStamina: player.stamina,
      playerStaminaMax: player.stats.staminaMax,
      quickStaminaCost: staminaCostWithModifiers(
        getStaminaCost(player.loadout.weapon, true),
        true,
        playerMods,
      ),
      powerStaminaCost: staminaCostWithModifiers(
        getStaminaCost(player.loadout.weapon, false),
        false,
        playerMods,
      ),
      lastPlayerStrike: lastPlayerStrike?.result ?? null,
      opponentHealth: opp.health,
      opponentHealthMax: opp.stats.healthMax,
      hype: crowdHype,
      telegraph: Boolean(opp.telegraphText),
    };

    const next = evaluateBeats(snapshot, seenBeatsRef.current);
    if (!next) return;
    activeBeatRef.current = next;
    beatActionsRef.current = 0;
    setActiveBeat(next);
  }, [
    opponent.id,
    opponent.isBoss,
    playerTurnCount,
    isPlayerTurn,
    isExecuting,
    currentDistance,
    player.stamina,
    player.stats.staminaMax,
    player.loadout.weapon,
    playerMods,
    lastPlayerStrike,
    opp.health,
    opp.stats.healthMax,
    opp.telegraphText,
    crowdHype,
    resolvedActionCount,
    activeBeat,
  ]);

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

      // CL-3 — a shown beat is dismissed by the action it teaches, or once
      // BEAT_EXPIRY_ACTIONS further actions have resolved. Either way it is
      // recorded seen here, after it has rendered, never at evaluation time.
      const shownBeat = activeBeatRef.current;
      if (shownBeat) {
        const taughtAction = isActorPlayer && beatDismissesOn(shownBeat, actionType);
        beatActionsRef.current += 1;
        if (taughtAction || beatActionsRef.current >= BEAT_EXPIRY_ACTIONS) {
          dismissBeat(shownBeat);
        }
      }

      // Read-and-clear the telegraphed-heavy marker for THIS resolution, before
      // any branch can return, so a miss, an evade or an out-of-range swing
      // cannot leave it set for a later attack.
      const isTelegraphedHeavy = !isActorPlayer && telegraphLandingRef.current;
      telegraphLandingRef.current = false;
      // CH-4 — the same read-and-clear for Valéria's counterattack.
      const isCounterAttack = !isActorPlayer && counterStrikeRef.current;
      counterStrikeRef.current = false;

      const attacker = isActorPlayer ? player : opp;
      const defender = isActorPlayer ? opp : player;
      // CH-3a — the two blocks every stage below reads, resolved for this turn's
      // actor and defender (the same objects the HUD estimates with).
      const attackerMods = isActorPlayer ? playerMods : opponentMods;
      const defenderMods = isActorPlayer ? opponentMods : playerMods;

      // CF-5 — did this turn's damage leave a fighter at 0? Only the resolution
      // that ends the fight holds for the longest beat (TURN_RESOLUTION_DEATH_MS).
      // The two assignments below READ the same subtraction the damage branches
      // apply; no outcome, formula, stamina value or state changes here.
      let fightEnded = false;

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
        // CH-3a event stage — First Palm of the Crowd adds its hype to a taunt.
        const tauntHype = 20 + applyPalmaEvent(playerMods.block, 'taunt').hypeAdd;
        updateCrowdHype((prev) => Math.min(100, prev + tauntHype));
        addLog(`${attacker.name} flexes & taunts! The arena roars (+${tauntHype}% Hype)!`, isActorPlayer ? 'player' : 'opponent');
        spawnDamageText(`TAUNT! +${tauntHype}% HYPE`, 'hype', attacker.position);
      } else if (actionType === 'rest') {
        // CH-3a event stage — Second Wind: rest restores 40 + `restStaminaAdd`.
        const restGain = 40 + applyPalmaEvent(attackerMods.block, 'rest').staminaAdd;
        if (isActorPlayer) {
          setPlayer((prev) => ({
            ...prev,
            action: 'idle',
            stamina: Math.min(prev.stats.staminaMax, prev.stamina + restGain),
          }));
        } else {
          setOpp((prev) => ({
            ...prev,
            action: 'idle',
            stamina: Math.min(prev.stats.staminaMax, prev.stamina + restGain),
          }));
        }
        addLog(`${attacker.name} catches breath (+${restGain} Stamina).`, isActorPlayer ? 'player' : 'opponent');
        spawnDamageText(`+${restGain} SP`, 'hype', attacker.position);
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
        // CH-4 — Pit Bellower: the bellow behind the wind-up also drains stamina
        // (floored at 0). Palmae ADD to the mechanic — the announce, the pending
        // heavy and its landing below are untouched.
        const bellowerDrain = pitBellowerStaminaDrain(attackerMods);
        if (bellowerDrain > 0) {
          const drainStamina = (prev: FighterState) => ({
            ...prev,
            stamina: applyPitBellowerDrain(prev.stamina, bellowerDrain),
          });
          if (isActorPlayer) {
            setOpp(drainStamina);
          } else {
            setPlayer(drainStamina);
          }
          addLog(
            `${attacker.name}'s pit bellow drains ${bellowerDrain} stamina from ${defender.name}.`,
            'system',
          );
        }
      }

      // 2c. STATEFUL DOCTRINA — CAST THE NET (retiarius, CH-3b)
      // Once per fight, no stamina cost. The net is SPENT by the cast whether it
      // lands, misses or meets a secutor's Snag-Proof Pursuit — that immunity is
      // read at resolution, so `entangledTurns` can never be written to a secutor.
      else if (actionType === 'cast_net') {
        if (!canCastNet(attacker.netAvailable)) {
          addLog(`${attacker.name} has no net left to throw.`, 'system');
        } else {
          if (isActorPlayer) {
            setPlayer((prev) => ({ ...prev, netAvailable: false }));
          } else {
            setOpp((prev) => ({ ...prev, netAvailable: false }));
          }
          // The throw itself: the existing slash hook.
          sounds.playSlash();
          const net = resolveNetCast({ targetArmaturaId: defenderMods.armaturaId });
          if (net.landed) {
            // The snare reads on the dodge hook (the other existing sound).
            sounds.playDodge();
            if (isActorPlayer) {
              setOpp((prev) => ({ ...prev, entangledTurns: net.entangledTurns }));
            } else {
              setPlayer((prev) => ({ ...prev, entangledTurns: net.entangledTurns }));
            }
            addLog(
              `${attacker.name} hurls the net — ${defender.name} is ENTANGLED for ${net.entangledTurns} turns!`,
              isActorPlayer ? 'player' : 'opponent',
            );
            spawnDamageText('ENTANGLED', 'crit', defender.position);
          } else if (net.immune) {
            addLog(
              `${defender.name} is Snag-Proof — the net finds no hold. The cast is spent.`,
              'system',
            );
            spawnDamageText('SNAG-PROOF!', 'blocked', defender.position);
          } else {
            sounds.playDodge();
            addLog(`${attacker.name}'s net flies wide. The cast is spent.`, 'system');
            spawnDamageText('NET MISSED', 'dodge', defender.position);
          }
        }
      }

      // 3. OFFENSIVE ATTACK ACTIONS
      else if (actionType === 'quick_attack' || actionType === 'power_attack') {
        const isQuick = actionType === 'quick_attack';
        // CH-3a weapon stage — the block's staminaCostMult (a POWER-attack
        // discount: secutor 0.85, Heavy Hand 0.90). No multiplier = the base cost.
        const staminaCost = staminaCostWithModifiers(
          getStaminaCost(attacker.loadout.weapon, isQuick),
          isQuick,
          attackerMods,
        );

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
          if (isActorPlayer) notePlayerStrike('missed_out_of_reach');
        } else {
          // Check Evasion / Hit Probability
          // CH-3a hit stage — effective AGI = AGI + hitAgiAdd on both sides.
          // CH-3b — an ENTANGLED attacker loses 25 percentage points off the
          // RESULT, floored at the formula's own clamp (the formula is untouched).
          const hitPct = entangledHitChance(
            calculateHitChance(
              isQuick,
              hitAgilityFor(attacker.stats.agility, attackerMods),
              hitAgilityFor(defender.stats.agility, defenderMods),
            ),
            isQuick,
            isEntangled(attacker.entangledTurns),
          );

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

          // CH-3a evasion stage — the palma/doctrina passive evade (Untouchable's
          // 4 %). It mirrors the counter_dodge passive above: a defender-side
          // branch that applies only while the defender is NOT in a dodge stance,
          // so it never stacks with the stance's own 75 %. The draw is skipped
          // entirely when the chance is 0, so a fighter with no palmae consumes
          // exactly the same random sequence as before this slice.
          const palmaEvadeChance = isActorPlayer
            ? 0
            : passiveEvadeChance(defenderMods, defender.isInvulnerable);
          const isPalmaEvaded =
            !isEvaded && palmaEvadeChance > 0 && Math.random() < palmaEvadeChance;

          if (isEvaded || isPassiveEvaded || isPalmaEvaded) {
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
            // CH-3a hit stage — 0.25 + critChanceAdd, clamped ≤ 0.60. With no
            // crit-chance palma the value IS 0.25, so the draw is unchanged.
            // CH-3b — the net's +0.25 rider is folded into that SAME critChanceAdd
            // while the target stays entangled (see `netCritBonusModifiers`).
            const isCrit =
              !isQuick &&
              Math.random() <
                critChanceFor(netCritBonusModifiers(attackerMods, isEntangled(defender.entangledTurns)));
            const isBlocked = defender.isBlocking;
            const rageMult = (!isActorPlayer && attacker.isRaged) ? RAGE_DAMAGE_MULTIPLIER : 1.0;
            // CH-3a weapon stage — the defender's own blockReduction plus the
            // block's add (capped at 0.90 by applyBlockReduction), less the
            // attacker's class penetration (thraex's Hook the Rim, 0.40).
            const blockReduction = effectiveBlockReduction(
              defender.loadout.weapon.blockReduction,
              defenderMods,
              attackerMods,
              isBlocked,
            );
            // CH-3a damage stage — attacker damageDealtMult ÷ defender
            // damageTakenMult, with every condition (health thresholds, the boss
            // flag, attack type, Mirror Drill's ledger, Spearman's Ground's
            // distance bands) evaluated at this call site.
            const traitMult = resolveTraitMult(attackerMods, defenderMods, {
              isQuick,
              distance: dist,
              effectiveRange,
              attackerHealth: attacker.health,
              attackerHealthMax: attacker.stats.healthMax,
              defenderHealth: defender.health,
              defenderHealthMax: defender.stats.healthMax,
              defenderIsBoss: opponent.isBoss === true,
              defenderTypesHit: defender.mirrorDrillTypes,
              // CH-4 — Viper's Patience reads this: true only on the attack
              // that follows a triggered counter.
              isCounterAttack,
            });
            const rawDamage = calculateAttackDamage(
              baseDmg,
              attacker.stats.strength,
              isCrit,
              defender.stats.defense,
              isBlocked,
              blockReduction,
              rageMult,
              traitMult,
            );

            // CF-5 — the same subtraction the damage branch below applies, read
            // here so the resolution hold can know the fight ended on this blow.
            fightEnded = defender.health - rawDamage <= 0;

            // CF-4 — the impact point and the cone's axis for this landed blow.
            // The fighters only ever separate along Z, so the axis is the sign of
            // that offset: the blow's own direction, from the attacker toward the
            // defender, which makes the spark spray read as away from the attacker.
            const impactPoint: [number, number, number] = [
              defender.position[0],
              defender.position[1] + 1.2,
              defender.position[2],
            ];
            const impactDir: [number, number, number] = [
              0,
              0,
              Math.sign(defender.position[2] - attacker.position[2]) || 1,
            ];

            if (isBlocked) {
              sounds.playBlock();
              if (!isActorPlayer) statsRef.current.perfectBlocks += 1;
              // CH-3a event stage — Fish-Scale Wall: whoever blocks recovers the
              // block's `onBlockStamina` (+6 for a Murmillo), clamped to maximum.
              const blockStamina = applyPalmaEvent(defenderMods.block, 'block').staminaAdd;
              if (blockStamina > 0) {
                if (isActorPlayer) {
                  setOpp((prev) => ({
                    ...prev,
                    stamina: Math.min(prev.stats.staminaMax, prev.stamina + blockStamina),
                  }));
                } else {
                  setPlayer((prev) => ({
                    ...prev,
                    stamina: Math.min(prev.stats.staminaMax, prev.stamina + blockStamina),
                  }));
                }
              }
              addLog(
                `${attacker.name}'s strike was BLOCKED by ${defender.name}'s shield (-${rawDamage} HP)!`,
                'system'
              );
              spawnDamageText(`BLOCKED -${rawDamage}`, 'blocked', defender.position);
              if (isActorPlayer) notePlayerStrike('blocked');
              // CF-4 — a shield stops the blow: sparks, no dust.
              impactParticlesRef.current?.burst('spark', impactPoint, impactDir);
            } else {
              if (isCrit) {
                sounds.playHeavyImpact();
                // CF-3 — a critical blow is the crowd's cue, whoever landed it.
                sounds.playCrowdSwell();
                addLog(`CRITICAL BLOW! ${attacker.name} struck ${defender.name} for ${rawDamage} DAMAGE!`, 'crit');
                spawnDamageText(`-${rawDamage} CRIT!`, 'crit', defender.position);
                // CF-4 — a crit gets the larger spark burst plus the gold flakes,
                // in place of the plain sand dust.
                impactParticlesRef.current?.burst('crit', impactPoint, impactDir);
              } else {
                sounds.playSlash();
                addLog(`${attacker.name} struck ${defender.name} for ${rawDamage} damage.`, isActorPlayer ? 'player' : 'opponent');
                spawnDamageText(`-${rawDamage}`, 'damage', defender.position);
                // CF-4 — an unblocked, non-crit hit kicks up sand.
                impactParticlesRef.current?.burst('sand', impactPoint, impactDir);
              }
              if (isActorPlayer) notePlayerStrike('landed');
              // C-8.70B §SET-1 — the player's blade landed: one short buzz, on the
              // device's own haptics and only when the Vibration row is on.
              if (isActorPlayer) vibrate(HAPTIC_HIT_LANDED_MS);
            }

            // Track stats
            if (isActorPlayer) {
              statsRef.current.hitsLanded += 1;
              statsRef.current.damageDealt += rawDamage;
              // CH-3a event stage — First Palm of the Crowd adds its hype to a
              // crit (taunts and crits only, per its own descriptor).
              const critHype = applyPalmaEvent(playerMods.block, 'crit').hypeAdd;
              updateCrowdHype((prev) => Math.min(100, prev + (isCrit ? 18 + critHype : 8)));
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
                  // CH-3a — the FIRST hit of a type resolved at full damage, so
                  // the type is recorded as taken only now (Mirror Drill).
                  ...(defenderMods.armaturaId === 'provocator'
                    ? { mirrorDrillTypes: recordHitType(prev.mirrorDrillTypes, isQuick) }
                    : {}),
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
                  // CH-3a — Mirror Drill's ledger (see the setOpp branch above).
                  ...(defenderMods.armaturaId === 'provocator'
                    ? { mirrorDrillTypes: recordHitType(prev.mirrorDrillTypes, isQuick) }
                    : {}),
                  comboCount: applyComboEvent(prev.comboCount, 'player_damaged'),
                };
              });
            }

            // ── CH-3b — TWIN FANGS (dimachaerus) ─────────────────────────────
            // After a LANDED quick attack, one bonus strike follows at 50 % of
            // the weapon's light damage. It makes its OWN hit roll against the
            // same hit chance, costs no stamina, can never crit and can never
            // fork into another twin (`twinFangsApplies(..., true)` is false).
            if (twinFangsApplies(attackerMods.armaturaId, isQuick)) {
              const bonusHit = rollBonusStrike(hitPct);
              if (bonusHit) {
                const bonusDamage = calculateAttackDamage(
                  twinFangsBaseDamage(attacker.loadout.weapon.damageLight),
                  attacker.stats.strength,
                  false,
                  defender.stats.defense,
                  isBlocked,
                  blockReduction,
                  rageMult,
                  traitMult,
                );

                // CF-5 — the second blade can be the killing blow.
                fightEnded = fightEnded || defender.health - rawDamage - bonusDamage <= 0;
                sounds.playSlash();
                addLog(
                  `${attacker.name}'s second blade lands for ${bonusDamage} damage!`,
                  isActorPlayer ? 'player' : 'opponent',
                );
                spawnDamageText(`-${bonusDamage} TWIN!`, 'damage', defender.position);
                // The same light-attack animation, on a SHORTER hold.
                impactRef.current.freezeUntil = Math.max(
                  impactRef.current.freezeUntil,
                  performance.now() + HIT_STOP_MS.twin,
                );
                if (isActorPlayer) {
                  setOpp((prev) => {
                    const nextHp = Math.max(0, prev.health - bonusDamage);
                    return {
                      ...prev,
                      health: nextHp,
                      action: nextHp <= 0 ? 'death' : 'hit',
                      hitFlashTimer: 0.3,
                    };
                  });
                  statsRef.current.damageDealt += bonusDamage;
                  setPlayer((prev) => ({
                    ...prev,
                    comboCount: applyComboEvent(prev.comboCount, twinFangsComboEvent(true)),
                  }));
                  updateCrowdHype((prev) => Math.min(100, prev + TWIN_FANGS_LANDED_HYPE));
                } else {
                  setPlayer((prev) => {
                    const nextHp = Math.max(0, prev.health - bonusDamage);
                    return {
                      ...prev,
                      health: nextHp,
                      action: nextHp <= 0 ? 'death' : 'hit',
                      hitFlashTimer: 0.3,
                      comboCount: applyComboEvent(prev.comboCount, 'player_damaged'),
                    };
                  });
                  statsRef.current.damageTaken += bonusDamage;
                }
              } else {
                sounds.playSlash();
                addLog(`${attacker.name}'s second blade whistles past.`, 'system');
                spawnDamageText('TWIN MISS!', 'dodge', defender.position);
                if (isActorPlayer) {
                  setPlayer((prev) => ({
                    ...prev,
                    comboCount: applyComboEvent(prev.comboCount, twinFangsComboEvent(false)),
                  }));
                }
              }
            }
          } else {
            // MISSED
            sounds.playSlash();
            addLog(`${attacker.name}'s attack MISSED!`, 'system');
            spawnDamageText('MISSED!', 'dodge', defender.position);
            // Player missed: reset combo (opponent miss does not affect player combo)
            if (isActorPlayer) {
              // CH-3a event stage — Phoenix Nerves: once per fight, a miss does
              // not reset the combo. The once-per-fight memory is this scene's.
              const comboShield = applyPalmaEvent(playerMods.block, 'miss').comboShield;
              if (comboShield && !comboShieldUsedRef.current) {
                comboShieldUsedRef.current = true;
                addLog(`${attacker.name}'s Phoenix Nerves hold the rhythm — the combo is kept.`, 'player');
              } else {
                setPlayer((prev) => ({ ...prev, comboCount: applyComboEvent(prev.comboCount, 'miss') }));
              }
            }
          }
        }
      }

      // 4. ANIMATION RESOLUTION & TURN TRANSITION (CF-5 — weight-scaled hold)
      // The hold is the ONLY thing this timer decides: every outcome above is
      // already resolved, and the callback below only resets the animations,
      // ticks the entangle and hands the turn over. See TURN_RESOLUTION_MS.
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
            // CH-3b — an entangle ticks down on the entangled fighter's OWN
            // action, AFTER it resolved, so the penalty above applied while it
            // was still live. At 0 the entangle is over (the crit rider with it).
            ...(isEntangled(prev.entangledTurns)
              ? { entangledTurns: decrementEntangle(prev.entangledTurns) }
              : {}),
          }));
        } else {
          setOpp((prev) => ({
            ...prev,
            action: 'idle',
            // isBlocking intentionally NOT cleared here — same lifecycle as
            // the player's block. Consumed via pre-clear at the top of
            // executeCombatTurn when the opponent next acts.
            // CH-3b — the same entangle tick as the player's branch.
            ...(isEntangled(prev.entangledTurns)
              ? { entangledTurns: decrementEntangle(prev.entangledTurns) }
              : {}),
          }));
        }

        setIsExecuting(false);
        setResolvedActionCount((count) => count + 1);

        // Check match end
        if (opp.health <= 0 || player.health <= 0) {
          return;
        }

        // Toggle turn — a completed opponent action opens the player's next turn.
        if (!isActorPlayer) setPlayerTurnCount((count) => count + 1);
        setIsPlayerTurn(!isActorPlayer);
      }, turnResolutionMs(actionType, fightEnded));
    },
    [isExecuting, player, opp, addLog, spawnDamageText, updateCrowdHype, dismissBeat, notePlayerStrike]
  );

  // OPPONENT AI TURN STRATEGY ENGINE
  useEffect(() => {
    if (isPlayerTurn || isExecuting || isMatchOver.current || opp.health <= 0) return;

    // CF-5 — the opponent's think time (aiTurnDelayMs): 750 ms as it has always
    // been, except on the turn that follows a resolved telegraphed heavy, where
    // the fight's heaviest beat gets 900 ms. The marker is read here and cleared
    // as this turn is taken, so the turn after it is back to 750.
    const aiDelayMs = aiTurnDelayMs(telegraphAftermathRef.current);

    const aiTimer = setTimeout(() => {
      telegraphAftermathRef.current = false;
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
        // CF-5 — and mark the fight's heaviest beat as resolved, so the AI's next
        // turn waits aiTurnDelayMs' longer 900 ms (see that helper).
        telegraphAftermathRef.current = true;
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
        // CH-4 — Viper's Patience: mark THIS resolution as the counterattack, so
        // its +20 % lands here and nowhere else. Read-and-cleared at the top of
        // executeCombatTurn, exactly like the telegraph landing marker.
        counterStrikeRef.current = true;
        executeCombatTurn('opponent', 'quick_attack');
        return;
      }

      let chosenAction: CombatActionType = 'quick_attack';

      if (dist > effectiveRange) {
        // Distance is large: Advance or Taunt
        chosenAction = chooseAIOutOfRangeAction();
      } else {
        // Inside strike range: Evaluate tactical options
        // CH-3b — a retiarius throws the net BEFORE the standard tactical ladder:
        // once per fight, while its net is still in hand and the player is not
        // already entangled. The armatura comes from the opponent's own resolved
        // block, so no selection is duplicated here.
        if (
          shouldAICastNet({
            armaturaId: opponentMods.armaturaId,
            netAvailable: opp.netAvailable,
            playerEntangled: isEntangled(player.entangledTurns),
          })
        ) {
          chosenAction = 'cast_net';
        } else if (player.isBlocking) {
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
    }, aiDelayMs);

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
      // CH-4 — Pyre Brand: the phase switch also heals 10 % of maximum health.
      // "Once per fight" is `phaseSwitchedRef` itself: it is set above, before
      // the heal is applied, and this effect returns early while it is set.
      // With no Pyre Brand the heal is 0 and the state update is unchanged.
      const pyreHeal = pyreBrandHealAmount(opponentMods, opp.stats.healthMax);
      setOpp((prev) => ({
        ...prev,
        isPhase2: true,
        ...(pyreHeal > 0
          ? { health: applyPyreBrandHeal(prev.health, prev.stats.healthMax, pyreHeal) }
          : {}),
        loadout: { ...prev.loadout, weapon: getWeaponByType(opponent.phase2WeaponType!) },
      }));
      addLog(`${opp.name} discards their blades and draws a heavy war mace!`, 'system');
      if (pyreHeal > 0) {
        addLog(`${opp.name}'s Pyre Brand flares — ${pyreHeal} health restored.`, 'system');
      }
    }
  }, [
    opp.health,
    opp.stats.healthMax,
    opponent.bossMechanic,
    opponent.phase2WeaponType,
    opp.name,
    opponentMods,
    addLog,
  ]);

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
              shadow-mapSize={[1024, 1024]}
            />
            <directionalLight position={[-15, 10, -15]} intensity={0.5} color="#38bdf8" />
            <Sparkles count={50} scale={[20, 10, 20]} size={2} color="#fef08a" opacity={0.5} />

            <ThreeComponentErrorBoundary componentName="DuelArenaArchitecture">
              <DuelArena crowdPulseRef={crowdPulseRef} />
            </ThreeComponentErrorBoundary>

            <ThreeComponentErrorBoundary componentName="DuelFightersGladiatorMeshes">
              <Suspense fallback={<CanvasLoadingFallback />}>
                <GladiatorMesh fighter={player} isLeftyMode={isLeftyMode} impactRef={impactRef} />
                <GladiatorMesh fighter={opp} impactRef={impactRef} />
                <FloatingDamage3D damages={damageNumbers} />
                {/* CF-4 — one pooled Points, one draw call, mounted only here. */}
                <ImpactParticles ref={impactParticlesRef} />
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
        playerModifiers={playerMods}
        opponentModifiers={opponentMods}
        opponentIsBoss={opponent.isBoss === true}
        onExecuteAction={(action) => executeCombatTurn('player', action)}
      />

      {/* CL-3 — one guided beat at a time, at the action panel's edge. The card's
          wrapper is pointer-transparent and only the card itself is interactive,
          so the fight keeps running and no touch meant for it is intercepted. */}
      {activeBeat && getCoachCard(activeBeat) && (
        <CoachCard
          id={activeBeat}
          card={getCoachCard(activeBeat)!}
          placement="panel"
          onDismiss={() => dismissBeat(activeBeat)}
        />
      )}
    </div>
  );
};
