import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Settings as SettingsIcon, XCircle } from 'lucide-react';
import { Environment, Lightformer, useGLTF } from '@react-three/drei';
import { EastCircusArena } from './city/EastCircusArena';
import { CircusCrowd } from './city/CircusCrowd';
// Day/Night T1/T2 — the city's phase table, the circus's display-only override, and the
// shared sky dome that replaces drei's `<Sky>`. T2 hands the phase IN from the clock (the
// `phase` prop); this scene reads no phase constant and no save, and its override stays
// display-only.
import { DEFAULT_PHASE, getPhaseLight, sunDirection } from '../../utils/atmosphere';
import type { TimePhase } from '../../utils/timeState';
import { resolveRacePhase } from '../../utils/racePhaseLight';
import { PhaseSkyDome } from './PhaseSkyDome';
import { RaceTouchControls } from '../ui/RaceTouchControls';
import { WebGLContextErrorBoundary } from '../ui/WebGLContextErrorBoundary';
import { ThreeComponentErrorBoundary } from '../ui/ThreeComponentErrorBoundary';
import { WebGLReadyGuard } from '../ui/WebGLReadyGuard';
import { CanvasWebGLMonitor } from '../ui/CanvasWebGLMonitor';
import { SceneBrightness } from './SceneBrightness';
import { logCanvasWebGLCreated, setupCanvasContextRestoration } from '../../utils/webglContext';
import {
  CHARIOT_MODEL_SCALE,
  CHARIOT_MODEL_URL,
  CHARIOT_STOCK_WHEEL_NODES,
  CHARIOT_WHEEL_KIT_URL,
  CHARIOT_WHEEL_VARIANTS,
  applyChariotFinish,
  getChariotWheelPlacement,
} from '../../utils/chariotGeometry';
import { getChariotPart, getChariotPartByFinish } from '../../data/chariotParts';
import type { ChariotEquippedResolved } from '../../types/game';
import type { RaceCompletionOutcome, RaceCompletionResult } from '../../utils/raceRecords';
import { getLeagueTier } from '../../utils/racingLeague';
import { RaceHorseTeam } from './RaceHorseTeam';
import { RaceRenderDiagnostics } from './RaceRenderDiagnostics';
import { useSettings } from '../../hooks/useSettings';
import { useAdaptiveDpr, CITY_TIERS, POST_TRANSITION_MS, type QualityPreset } from '../../hooks/useAdaptiveDpr';
import type { ChariotTeamSize } from '../../types/game';
import { CIRCUS_FORMATION_CAMERA, CIRCUS_RACE_START } from '../../utils/circusDistrictGeometry';
import {
  CHARIOT_MOVEMENT,
  CHARIOT_WHEEL_RADIUS,
  CHARIOT_MODEL_YAW_OFFSET,
  advanceChariot,
  advanceWheelRoll,
  createChariotLaunchState,
  createChariotMotion,
  getChariotGait,
  getChariotPace,
  launchAccelScale,
  mergeChariotInputs,
  trackChariotLaunch,
} from '../../utils/chariotMovement';

/**
 * The fitted wheels' own nodes in the shipping chariot GLB.  Both are parentless
 * nodes carrying the asset's Z-up → Y-up correction, with their geometry centred
 * on the hub — which is why each is re-parented onto a pivot AT that hub before
 * it is spun (a node whose rotation is applied about the model's origin would
 * swing the wheel around the chariot instead of turning it).
 */
export const RACE_WHEEL_NODE_NAMES = ['Wheel_L', 'Wheel_R'] as const;
import type { ChariotInput, ChariotLaunchQuality, ChariotMotion } from '../../utils/chariotMovement';
import {
  CHARIOT_CHASE_CAMERA,
  chaseFovForSpeed,
  composeChasePose,
  createChasePose,
  resolveChaseDistancePreset,
} from '../../utils/chaseCamera';
import type { ChaseDistancePreset } from '../../utils/chaseCamera';
import {
  COUNTDOWN_STEPS,
  GO_DISPLAY_MS,
  GO_LABEL,
  RACE_INITIAL_STATE,
  abortRace,
  finishRace,
  formatRaceElapsed,
  getCountdownStep,
  isRaceRunning,
  markCountdownElapsed,
  startRace,
} from '../../utils/raceState';
import type { CountdownStep, RaceState } from '../../utils/raceState';
import { advanceRaceLap, createRaceLapTracker, getRaceLapStage } from '../../utils/raceLap';
import type { RaceLapStage } from '../../utils/raceLap';
import { getRaceRivalPose, getRaceRivalSpeed, resolveFieldFinishOrder, resolveRaceRivalFinishMs } from '../../utils/raceRival';
import type { RaceFieldFinishOrder } from '../../utils/raceRival';
import { resolveRaceRungId, resolveRungField } from '../../utils/raceCompetitors';
import type { RaceCompetitor, RaceRungId } from '../../utils/raceCompetitors';
import {
  FORMATION_ROLL_SPEED,
  getRollPathPoseAtDistance,
  resolveFormationRoll,
  resolveRollPhase,
} from '../../utils/raceGrid';
import type { RollPath } from '../../utils/raceGrid';

/**
 * RaceScene.tsx — Phase C-8.70B Stage 1, Slice 1 (the race scene and its state
 * machine) + Slice 2 (driving: movement, touch and keyboard controls, the chase
 * camera and the gait HUD).
 *
 * ── How it is reached, and why this way ───────────────────────────────────
 * It is a SCREEN of the existing screen machine, not a second one: `App.tsx`
 * gains one more value in its `GameScreen` union (`'race'`), one more
 * `React.lazy` import and one more conditional render, exactly the way
 * `CityHubScene` and `DuelScene` are reached.  No router, no scene manager, no
 * parallel navigation: the East Circus District's signpost opens the pre-race
 * panel, its "Start Race" hands `App` the city pose to come back to (in memory
 * only), and `App` swaps the city for this screen.
 *
 * ── What it renders ───────────────────────────────────────────────────────
 *   • the arena: the SHIPPING `EastCircusArena` component — the same GLB, the
 *     same transform (`[52.34, 0.00, 43.80]`, yaw π/2, scale 0.20), the same
 *     static-mesh handling and the same preload as the city hub uses.  It is
 *     reused rather than re-derived, so this scene cannot drift from the district
 *     the player walked in through; the paved district is NOT mounted (roads and
 *     forecourt are a quarter of the city's draw calls and none of them is on
 *     the track);
 *   • the player's chariot: the workshop's `CHARIOT_MODEL_URL` and measured
 *     scale, cloned before use so the cached GLB is never mutated. The equipped
 *     finish is applied to cloned body materials. Standard wheels retain their
 *     measured stock pivots; the reinforced wheel kit is loaded only when that
 *     variant is equipped, mounted at its surveyed axle positions and animated
 *     on its own pivots. The finish is also applied to cloned kit-wheel materials;
 *   • the player's `RaceHorseTeam`, using the selected Biga / Triga / Quadra
 *     horse count, plus one deterministic, presentation-only rival chariot and
 *     its two-horse team. The rival has its own fixed lap clock and cannot finish
 *     the player's lap or award / persist a record;
 *   • the city hub's calibrated light rig (sun, fill, hemisphere, fog, Sky and
 *     procedural `Environment`), with the race Canvas using adaptive DPR and a
 *     quality-scaled key-light shadow map for mobile performance.
 *
 * ── Driving (Slice 2) ─────────────────────────────────────────────────────
 * `utils/chariotMovement.ts` owns the physics: it is PURE, its constants live in
 * one object, and it is unit-tested with no renderer (`chariotMovement.test.ts`).
 * This component only wires it: `RaceChariot` merges the keyboard's and the touch
 * controls' inputs into one throttle/steer pair each frame, advances the motion
 * at the module's fixed 60 Hz timestep while — and ONLY while — the machine is in
 * `racing`, and writes the result onto the model's group (whose yaw needs no
 * correction: the model's forward is local −Z and `CHARIOT_MODEL_YAW_OFFSET` is
 * 0).  The accumulator is clamped at `CHARIOT_MOVEMENT.maxFrameDt` inside the
 * module, so a backgrounded tab freezes the race rather than teleporting the
 * chariot down the track on its return, and the position is projected back inside
 * the arena boundary after every step, so the chariot cannot leave the ring or
 * pass through its perimeter.  During `idle`, `countdown`, `finished` and
 * `aborted` nothing integrates and input is ignored — the chariot does not move
 * during the countdown.
 *
 * Controls are the two bottom corner clusters of `ui/RaceTouchControls` (steering
 * under one thumb, throttle/brake under the other; the whole cluster mirrors as
 * one unit in Lefty Mode) plus the desktop keys W/↑, S/↓ and A/D or ←/→, and the
 * two paths feed the same values.  The HUD reads the speed as a GAIT WORD beside
 * a labelled pace bar — never as bare digits — and the race clock stays Slice 1's
 * mm:ss.t, whose origin is the state machine's own transition into `racing`.
 *
 * ── The chase camera, at the surveyed standard (Slice 2's addendum) ───────
 * Slice 2's rig, following what `utils/chaseCamera.ts` hands it: a 55° vertical
 * FOV at rest widening smoothly to a capped 65° with speed, the Standard
 * distance/height preset behind the chariot (Near and Far are presets of the same
 * named config, and the settings row that offers them attaches through the
 * `chaseDistancePreset` prop — App hands the settings record's own value in), and
 * a look point carried
 * `4 + 0.9 × speed` ahead along the heading, leaned into the active steering
 * input.  At the start line, at rest, that pose IS Slice 1's measured start
 * composition, so the framed start is unchanged and the take-over at GO is
 * continuous with the countdown's static camera; the module holds that framing
 * while the chariot is still at the line and slow, because the Standard framing is
 * measurably blind there — the carceres block stands between an 8.5-behind,
 * 3.4-high camera and the model until the chariot is clear of it.
 *
 * ── Clean Start ───────────────────────────────────────────────────────────
 * A MODIFIER, not a sixth state: holding the throttle during the countdown builds
 * the visible rev on the throttle control, releasing it inside the launch's
 * window after GO is a clean start with a short acceleration boost, and holding
 * through GO bogs the launch.  It is resolved entirely from the throttle and the
 * elapsed time, it adds no transition to Slice 1's table, and it reaches the
 * physics only as the multiplier `advanceChariot` accepts.
 *
 * ── Save boundary ─────────────────────────────────────────────────────────
 * This scene imports no storage service and never writes a profile directly.
 * After raceLap.ts validates the complete north-turn, south-turn and finish-line
 * route, the finish transition calls the optional `onRecordRaceCompletion` callback.
 * App owns the atomic career transaction and its existing save path; the scene
 * receives only the settlement result needed to show the outcome. A completed race
 * records a team-specific best time, career result and (when eligible) a gold purse.
 * The purse is limited to one payment per in-game day; aborting never settles a
 * result. The first-race control hints remain a module-memory flag, never a save,
 * and a reload simply shows the labels again.
 */
export interface RaceSceneProps {
  /** Leave the race and return to the city at the pose captured on entry. */
  onAbort: () => void;
  /** Lefty Mode: the whole touch cluster mirrors as one unit. */
  isLeftyMode?: boolean;
  /**
   * The chase distance preset (the camera addendum): `near`, `standard` or
   * `far`.  **This is where the settings row attaches** — the value goes through
   * `resolveChaseDistancePreset`, which falls back to the config's Standard for a
   * missing or unknown name, so a caller that passes nothing still gets Standard.
   * C-8.70B §SET-1 — the Race Camera Distance row is what passes it now: `App`
   * reads the settings record's own `raceCamDistance` and hands it in.  The
   * camera's module is unread here, exactly as `utils/chaseCamera.ts` records.
   */
  chaseDistancePreset?: ChaseDistancePreset;
  /**
   * C-8.70B §SET-1 — the gear beside Abort.  The race context opens the settings
   * panel over the race; nothing else about the scene changes.
   */
  onOpenSettings?: () => void;
  /**
   * C-8.70B §SET-1 — the settings panel is OPEN over the race.  This is a GATE, not
   * a sixth race state: while `frozen` the movement loop does not advance, the launch
   * does not accrue and the race clock accrues nothing, and the state machine is
   * untouched (`raceState` only ever moves through `utils/raceState.ts`).
   */
  frozen?: boolean;
  /**
   * Day/Night T2 — the phase the player's clock resolves to when the race is entered.
   * Optional: a caller that passes nothing gets the staging default (`golden`), which is
   * exactly the hour T1 drew the circus under.
   */
  phase?: TimePhase;
  /** The profile's already-resolved Biga / Triga / Quadra selection. */
  teamSize?: ChariotTeamSize;
  /** Read-only equipped chariot parts; missing/legacy profiles resolve to stock. */
  chariotLoadout?: ChariotEquippedResolved;
  /**
   * LADDER-1B: the selected rung (`district` | `league`), resolved by the
   * caller through `resolveRaceRungId` (an unknown or missing value fails
   * closed to District). District fields 2 rivals, League 4, from the rung's
   * pool. Session-only — never written to a save.
   */
  rung?: RaceRungId;
  /** App-owned atomic career settlement, called only after a validated lap finish. */
  onRecordRaceCompletion?: (teamSize: ChariotTeamSize, elapsedMs: number, outcome: RaceCompletionOutcome) => RaceCompletionResult | null;
}

// Preload the chariot at module import (the EastCircusArena pattern).  The
// arena's own GLB is preloaded by EastCircusArena's module, and both entries are
// already warm when the race is entered from the city.
try {
  useGLTF.preload(CHARIOT_MODEL_URL);
} catch {
  // Silent fallback — useGLTF will load on demand if preload fails.
}

// Racing uses the same measured pixel budget as the city and duel. The hook
// runs inside the race Canvas; this parent owns the DPR value applied to it.
const RaceAdaptiveDpr: React.FC<{
  tier: QualityPreset;
  suspendedRef: { readonly current: boolean };
  onDprChange: (dpr: number) => void;
}> = ({ tier, suspendedRef, onDprChange }) => {
  useAdaptiveDpr({ tier, suspendedRef, onDprChange });
  return null;
};

/**
 * The start pose, read from the layout module so the line that is drawn and the
 * line the suite asserts can never drift apart.
 */
export const RACE_START_POSITION: [number, number, number] = [
  CIRCUS_RACE_START.x,
  CIRCUS_RACE_START.y,
  CIRCUS_RACE_START.z,
];
export const RACE_START_ROTATION_Y = CIRCUS_RACE_START.rotationY;

/**
 * LADDER-1B: the static camera is the formation camera. It watches the field
 * form up and roll to the line from the sand's east edge. The chase rest
 * framing in `chaseCamera.ts` stays derived from `CIRCUS_RACE_CAMERA` — the
 * chase takes over at the leader's crossing (the clock start), so the
 * formation camera is only ever the pre-race / roll view.
 */
export const RACE_CAMERA_POSITION: [number, number, number] = [
  CIRCUS_FORMATION_CAMERA.position[0],
  CIRCUS_FORMATION_CAMERA.position[1],
  CIRCUS_FORMATION_CAMERA.position[2],
];
export const RACE_CAMERA_TARGET: [number, number, number] = [
  CIRCUS_FORMATION_CAMERA.target[0],
  CIRCUS_FORMATION_CAMERA.target[1],
  CIRCUS_FORMATION_CAMERA.target[2],
];

/** How long the first race's on-control labels stay up before they fade. */
const FIRST_RACE_HINT_MS = 7000;

/**
 * Session-scoped teaching flag, in memory only.  The player's FIRST race of the
 * session shows the labels on the controls; a later race does not, and a reload
 * starts a new session.  Nothing here is written anywhere.
 */
let hasRacedThisSession = false;

/**
 * The chase camera, while racing — the surveyed standard (the camera addendum),
 * and this scene's one camera behaviour.
 *
 * The rig is Slice 2's and its smoothing is unchanged: it takes its pose on the
 * first `racing` frame and then lerps toward the desired one with
 * `1 − e^(−rate·dt)`, so the follow is identical at 30 and 120 fps, and `dt` is
 * clamped at the movement module's own frame limit, so a stalled tab cannot make
 * the camera jump.  What changed is WHAT it follows, and how much of the frame
 * the camera has:
 *
 *   • the FOV is the survey's — `chaseFovForSpeed` reads the chariot's own speed
 *     fraction, widens 55° → a capped 65° as it gets going and settles back as it
 *     slows (see `utils/chaseCamera.ts`);
 *   • the pose is the preset framing behind the chariot (`standard` by default),
 *     with the look point carried `4 + 0.9 × speed` ahead along the heading and
 *     leaned into the active steering input (`input.steer`, +1 the driver's
 *     right — the same merged value the movement module is driven with);
 *   • and at the start line, at rest, that pose IS Slice 1's measured start
 *     composition, so the take-over at GO is continuous with the countdown's
 *     static camera instead of a snap and the chariot and the closed carceres
 *     read exactly as Slice 1 framed them.  The eased hand-over exists because
 *     the Standard framing is measurably blind there: the carceres block sits
 *     between an 8.5-behind, 3.4-high camera and the model until the chariot is
 *     2.18 clear of it.
 *
 * The desired pose is written into one preallocated object, so a frame allocates
 * nothing beyond what the rig already did.
 */
const RaceCameraRig: React.FC<{
  motion: ChariotMotion;
  input: ChariotInput;
  raceState: RaceState;
  preset: ChaseDistancePreset;
  /**
   * LADDER-1B: the chase takes over at the leader's crossing (the race clock
   * start), not at GO. While the field is still rolling the formation camera
   * holds, so the roll reads as one continuous shot; the take-over snaps to
   * `composeChasePose` on the first clock frame, exactly as the shipped GO
   * take-over did.
   */
  clockStarted: boolean;
}> = ({ motion, input, raceState, preset, clockStarted }) => {
  const { camera: activeCamera } = useThree();
  // r3f types the Canvas camera as the Camera union; this scene mounts the
  // perspective one, whose FOV the survey drives.
  const camera = activeCamera as THREE.PerspectiveCamera;
  const look = useRef({ x: RACE_CAMERA_TARGET[0], y: RACE_CAMERA_TARGET[1], z: RACE_CAMERA_TARGET[2] });
  const pose = useRef(createChasePose());
  const following = useRef(false);

  useEffect(() => {
    if (raceState === 'racing' && clockStarted) return;
    camera.position.set(
      RACE_CAMERA_POSITION[0],
      RACE_CAMERA_POSITION[1],
      RACE_CAMERA_POSITION[2]
    );
    camera.fov = CHARIOT_CHASE_CAMERA.fovAtRest;
    camera.updateProjectionMatrix();
    camera.lookAt(RACE_CAMERA_TARGET[0], RACE_CAMERA_TARGET[1], RACE_CAMERA_TARGET[2]);
    look.current.x = RACE_CAMERA_TARGET[0];
    look.current.y = RACE_CAMERA_TARGET[1];
    look.current.z = RACE_CAMERA_TARGET[2];
    following.current = false;
  }, [camera, raceState, clockStarted]);

  useFrame((_state, delta) => {
    if (raceState !== 'racing' || !clockStarted) return;

    const dt = Math.min(delta, CHARIOT_MOVEMENT.maxFrameDt);
    const desired = composeChasePose(pose.current, motion, input.steer, preset);

    // The survey's FOV: a pure reading of the current speed, so it settles back
    // as the chariot slows.  The projection matrix is rebuilt only when it moves.
    const fov = chaseFovForSpeed(motion.speed);
    if (fov !== camera.fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    if (!following.current) {
      camera.position.set(desired.x, desired.y, desired.z);
      look.current.x = desired.lookX;
      look.current.y = desired.lookY;
      look.current.z = desired.lookZ;
      following.current = true;
      camera.lookAt(look.current.x, look.current.y, look.current.z);
      return;
    }

    const alpha = 1 - Math.exp(-CHARIOT_CHASE_CAMERA.followRate * dt);
    camera.position.x += (desired.x - camera.position.x) * alpha;
    camera.position.y += (desired.y - camera.position.y) * alpha;
    camera.position.z += (desired.z - camera.position.z) * alpha;
    look.current.x += (desired.lookX - look.current.x) * alpha;
    look.current.y += (desired.lookY - look.current.y) * alpha;
    look.current.z += (desired.lookZ - look.current.z) * alpha;
    camera.lookAt(look.current.x, look.current.y, look.current.z);
  });

  return null;
};

/**
 * The player's chariot — and, while `racing`, the one place the movement module
 * is driven: merge the two input paths, fold the throttle into the launch state,
 * advance the fixed-timestep motion, and put the result on the group.
 *
 * LADDER-1B: the chariot starts at its formation slot (heading south) and rolls
 * to the line along its precomputed roll path while the race clock has not
 * started; inputs are ignored during the roll. The clock starts at the
 * LEADER's crossing — this chariot detects that instant once and reports it
 * through `onLeaderCrossing`, and the parent owns the exact crossing instant
 * as `startedAt`. The lap tracker is created at the PLAYER's crossing (the
 * first racing frame), with `lastZ` on the line, so the roll can never complete
 * a lap. The Clean Start window is measured from the leader's crossing; the
 * boost / bog duration is measured from the player's own crossing, because the
 * player crosses 1.5–3.0 s after the leader.
 *
 * The motion object, the three input objects and the launch state are all owned
 * by the scene and mutated in place, so a frame allocates nothing.
 */
const RaceChariot: React.FC<{
  motion: ChariotMotion;
  input: ChariotInput;
  keyboardInput: ChariotInput;
  touchInput: ChariotInput;
  launch: ReturnType<typeof createChariotLaunchState>;
  raceState: RaceState;
  startedAt: number | null;
  frozen: boolean;
  teamSize: ChariotTeamSize;
  wheelVariant: 'standard' | 'reinforced';
  finish: 'stock' | 'charred' | 'gilded' | 'oxblood' | 'triumph' | 'ventive';
  onFinish: () => void;
  onLapStageChange: (stage: RaceLapStage) => void;
  /** The player's precomputed formation roll path (formation slot → line). */
  rollPath: RollPath;
  /** The `performance.now()` instant GO fired; null until the countdown elapses. */
  rollStartedAt: number | null;
  /** The leader's crossing, in ms after GO — the race clock origin. */
  leaderCrossingMs: number;
  /** Fired once when the leader's crossing instant arrives. */
  onLeaderCrossing: () => void;
}> = ({ motion, input, keyboardInput, touchInput, launch, raceState, startedAt, frozen, teamSize, wheelVariant, finish, onFinish, onLapStageChange, rollPath, rollStartedAt, leaderCrossingMs, onLeaderCrossing }) => {
  const gltf = useGLTF(CHARIOT_MODEL_URL);

  // Clone: `useGLTF` caches one scene per URL and the workshop holds the same
  // entry, so the cached scene is never touched (the workshop's own rule).
  //
  // C-8.70B Stage 1, Slice 3 — the fitted wheels roll.  Each wheel node is moved
  // onto a pivot placed at its OWN hub, measured from its rendered bounds in the
  // model's frame (the asset's hubs are (±0.700, 0.650, 0.000), but the centre is
  // measured rather than typed in), so a rotation about the pivot's X axis turns
  // the wheel on its axle.  The cached GLB is never mutated: the pivots live on
  // this clone only.
  const body = useMemo(() => {
    const scene = gltf.scene.clone(true);
    const wheels: THREE.Group[] = [];
    scene.updateMatrixWorld(true);
    applyChariotFinish(scene, getChariotPartByFinish(finish)?.overrides ?? []);
    if (wheelVariant !== 'standard') {
      for (const name of CHARIOT_STOCK_WHEEL_NODES) {
        const node = scene.getObjectByName(name);
        if (node) node.visible = false;
      }
    }
    for (const name of RACE_WHEEL_NODE_NAMES) {
      const node = scene.getObjectByName(name);
      if (wheelVariant !== 'standard') continue;
      if (!node) continue;
      const bounds = new THREE.Box3().setFromObject(node);
      if (bounds.isEmpty()) continue;
      const pivot = new THREE.Group();
      bounds.getCenter(pivot.position);
      scene.add(pivot);
      pivot.attach(node);
      wheels.push(pivot);
    }
    return { scene, wheels };
  }, [gltf.scene, wheelVariant, finish]);
  const roll = useRef(0);
  const wheelRadius = wheelVariant === 'reinforced'
    ? CHARIOT_WHEEL_VARIANTS.reinforced.radius
    : CHARIOT_WHEEL_RADIUS;
  const lapTracker = useRef(createRaceLapTracker());
  // LADDER-1B: the tracker is (re)created at the player's crossing, not at
  // mount — the roll must never advance it, so it starts on the line.
  const lapTrackerStartedRef = useRef(false);
  // LADDER-1B: the leader's crossing is reported once (the parent owns the
  // exact instant as `startedAt`); the ref guards against a second frame
  // firing before the parent's state lands.
  const clockStartFiredRef = useRef(false);
  const group = useRef<THREE.Group>(null);

  useFrame((_state, delta) => {
    mergeChariotInputs(input, keyboardInput, touchInput);

    const now = performance.now();
    // The roll clock runs from GO, not from the race clock origin.
    const elapsedSinceGoMs = rollStartedAt !== null ? now - rollStartedAt : 0;
    // The race clock origin is the leader's crossing (`startedAt`); before it
    // the launch window has not opened, so the elapsed is 0.
    const clockStarted = startedAt !== null;
    const elapsedSinceLeaderCrossingMs = clockStarted ? Math.max(0, now - startedAt) : 0;
    // C-8.70B §SET-1 — frozen: the panel is open, so nothing advances and the
    // launch state is left exactly where it was.  The frame still writes the
    // existing pose, so the scene under the panel does not jump.
    const racing = raceState === 'racing' && !frozen;
    if (!frozen) {
      // LADDER-1B: rev builds through the countdown AND the roll (the clock
      // has not started), and resolves on the leader's crossing — so the
      // `racing` argument is the clock, not the state machine.
      trackChariotLaunch(launch, input.throttle, clockStarted, elapsedSinceLeaderCrossingMs);
    }

    // LADDER-1B: the leader's crossing is the clock origin. Detect it once
    // here (the frame loop is the only clock that respects `frozen`); the
    // parent sets `startedAt` to the exact crossing instant.
    if (racing && rollStartedAt !== null && !clockStarted && elapsedSinceGoMs >= leaderCrossingMs && !clockStartFiredRef.current) {
      clockStartFiredRef.current = true;
      onLeaderCrossing();
    }

    if (racing) {
      // LADDER-1B: while the player is still rolling, the motion comes from
      // the precomputed path and inputs are ignored. Once the player crosses,
      // the shipped movement module drives, and the boost / bog duration is
      // measured from the player's own crossing.
      const phase = resolveRollPhase(rollPath, elapsedSinceGoMs);
      if (phase.rolling) {
        const pose = getRollPathPoseAtDistance(rollPath, phase.rollDistance);
        motion.x = pose.x;
        motion.z = pose.z;
        motion.heading = pose.heading;
        motion.speed = FORMATION_ROLL_SPEED;
      } else {
        if (!lapTrackerStartedRef.current) {
          lapTracker.current = createRaceLapTracker();
          lapTrackerStartedRef.current = true;
        }
        advanceChariot(motion, input, delta, launchAccelScale(launch, phase.raceElapsedMs));
        const previousStage = getRaceLapStage(lapTracker.current);
        const lap = advanceRaceLap(lapTracker.current, { x: motion.x, z: motion.z });
        lapTracker.current = lap.tracker;
        const nextStage = getRaceLapStage(lap.tracker);
        // Notify React only when a real checkpoint transition occurs, never per frame.
        if (nextStage !== previousStage) onLapStageChange(nextStage);
        if (lap.finishedNow) setTimeout(() => onFinish(), 0);
      }
    }

    const chassis = group.current;
    if (chassis) {
      chassis.position.set(motion.x, RACE_START_POSITION[1], motion.z);
      chassis.rotation.y = motion.heading + CHARIOT_MODEL_YAW_OFFSET;
    }

    // C-8.70B Stage 1, Slice 3 — the wheels turn with the ground.  The reading is
    // the motion module's own speed, and it advances only while the chariot is
    // actually being driven, so a race frozen behind the settings panel or idling
    // on the start line does not spin its wheels.
    roll.current = advanceWheelRoll(roll.current, racing ? motion.speed : 0, delta, wheelRadius);
    for (const wheel of body.wheels) {
      wheel.rotation.x = roll.current;
    }
  });

  return (
    <group
      ref={group}
      position={[motion.x, RACE_START_POSITION[1], motion.z]}
      rotation={[0, motion.heading + CHARIOT_MODEL_YAW_OFFSET, 0]}
      scale={CHARIOT_MODEL_SCALE}
    >
      <primitive object={body.scene} />
      {wheelVariant === 'reinforced' && <RaceChariotKitWheels wheelVariant={wheelVariant} roll={roll} finish={finish} />}
      <RaceHorseTeam teamSize={teamSize} speed={raceState === 'racing' && !frozen ? motion.speed : 0} />
    </group>
  );
};

/** The optional kit is split out so stock races never request the 304 KB wheel GLB. */
const RaceChariotKitWheels: React.FC<{
  wheelVariant: 'reinforced';
  roll: React.MutableRefObject<number>;
  finish: 'stock' | 'charred' | 'gilded' | 'oxblood' | 'triumph' | 'ventive';
}> = ({ wheelVariant, roll, finish }) => {
  const wheelKit = useGLTF(CHARIOT_WHEEL_KIT_URL);
  const wheelPivots = useRef<(THREE.Group | null)[]>([]);
  const wheels = useMemo(() => {
    const source = wheelKit.scene.getObjectByName(CHARIOT_WHEEL_VARIANTS[wheelVariant].node);
    const overrides = getChariotPartByFinish(finish)?.overrides ?? [];
    return (['left', 'right'] as const).map((side) => {
      const object = source?.clone(true) ?? null;
      // Keep wheel hubs and bindings visually consistent with the equipped body
      // finish without ever mutating the shared useGLTF cache.
      if (object) applyChariotFinish(object, overrides);
      return {
        side,
        placement: getChariotWheelPlacement(wheelVariant, side),
        object,
      };
    });
  }, [wheelKit.scene, wheelVariant, finish]);

  useFrame(() => {
    for (const pivot of wheelPivots.current) {
      if (pivot) pivot.rotation.z = roll.current;
    }
  });

  return (
    <>
      {wheels.map(({ side, placement, object }, index) => object && (
        <group key={side} position={placement.position} rotation={[0, placement.rotationY, 0]}>
          <group ref={(node) => { wheelPivots.current[index] = node; }}>
            <primitive object={object} />
          </group>
        </group>
      ))}
    </>
  );
};

/**
 * One roster rival in the field (LADDER-1B): the scene mounts N of these
 * (2 District, 4 League), one per competitor in the rung's pool. Each rival
 * keeps its own clock in 1B — the shipped deterministic `getRaceRivalPose`
 * pace, with a scripted roll phase added before it: the rival follows its
 * precomputed roll path until its own crossing, then its clock pose. The
 * route's `startSide` comes from the formation slot's flank (the roll ends
 * on that flank's racing lane), not from the roster's `startSide` — the
 * roster value is only a formation-placement preference (which front-row
 * slot the first rival takes).
 */
const RaceRivalChariot: React.FC<{
  raceState: RaceState;
  startedAt: number | null;
  frozen: boolean;
  competitor: RaceCompetitor;
  /** The flank the roll ends on — the route's `startSide` for this rival. */
  startSide: -1 | 1;
  /** This rival's precomputed formation roll path (formation slot → line). */
  rollPath: RollPath;
  /** The `performance.now()` instant GO fired; null until the countdown elapses. */
  rollStartedAt: number | null;
}> = ({ raceState, startedAt, frozen, competitor, startSide, rollPath, rollStartedAt }) => {
  const gltf = useGLTF(CHARIOT_MODEL_URL);
  const group = useRef<THREE.Group>(null);
  const roll = useRef(0);
  const finishedRef = useRef(false);
  const [finished, setFinished] = useState(false);
  // LADDER-1B: the horse team's gait follows the roll speed while this rival
  // is still rolling, then its race pace. Updated only on the phase change.
  const rollingRef = useRef(false);
  const [rolling, setRolling] = useState(false);
  const config = { lapDurationMs: competitor.lapDurationMs, startSide };

  useEffect(() => {
    if (raceState === 'idle' || raceState === 'countdown' || raceState === 'aborted') {
      finishedRef.current = false;
      setFinished(false);
      rollingRef.current = false;
      setRolling(false);
    }
  }, [raceState]);

  const body = useMemo(() => {
    const scene = gltf.scene.clone(true);
    const wheels: THREE.Group[] = [];
    scene.updateMatrixWorld(true);
    applyChariotFinish(scene, getChariotPartByFinish(competitor.finish)?.overrides ?? []);
    for (const name of RACE_WHEEL_NODE_NAMES) {
      const node = scene.getObjectByName(name);
      if (!node) continue;
      const bounds = new THREE.Box3().setFromObject(node);
      if (bounds.isEmpty()) continue;
      const pivot = new THREE.Group();
      bounds.getCenter(pivot.position);
      scene.add(pivot);
      pivot.attach(node);
      wheels.push(pivot);
    }
    return { scene, wheels };
  }, [gltf.scene, competitor.finish]);

  // LADDER-1B: the rival starts at its formation slot, not on the line.
  const initialPose = getRollPathPoseAtDistance(rollPath, 0);
  const rivalSpeed = getRaceRivalSpeed(config);

  useFrame((_state, delta) => {
    if (!group.current || frozen) return;
    const now = performance.now();
    const elapsedSinceGoMs = rollStartedAt !== null ? now - rollStartedAt : 0;
    // Keep the rival on its own race clock after the player finishes.
    const raceClockActive = (raceState === 'racing' || raceState === 'finished') && startedAt !== null;
    const ownCrossingAt = rollStartedAt !== null ? rollStartedAt + rollPath.crossingMs : null;
    const elapsedSinceOwnCrossingMs = raceClockActive && ownCrossingAt !== null
      ? Math.max(0, now - ownCrossingAt)
      : 0;
    // LADDER-1B: the roll phase runs before the clock pose. Once the rig
    // crosses, its route clock starts at zero on the exact line pose — not
    // at the leader's earlier crossing (which would jump it forward).
    const phase = rollStartedAt !== null && raceState === 'racing'
      ? resolveRollPhase(rollPath, elapsedSinceGoMs)
      : null;
    const isRolling = phase !== null && phase.rolling;
    let next: { x: number; z: number; heading: number; finished: boolean };
    if (isRolling) {
      const pose = getRollPathPoseAtDistance(rollPath, phase.rollDistance);
      next = { x: pose.x, z: pose.z, heading: pose.heading, finished: false };
    } else {
      next = getRaceRivalPose(elapsedSinceOwnCrossingMs, config);
    }
    if (isRolling !== rollingRef.current) {
      rollingRef.current = isRolling;
      setRolling(isRolling);
    }
    group.current.position.set(next.x, RACE_START_POSITION[1], next.z);
    group.current.rotation.y = next.heading + CHARIOT_MODEL_YAW_OFFSET;

    const moving = !next.finished && (isRolling || raceClockActive);
    roll.current = advanceWheelRoll(roll.current, moving ? (isRolling ? FORMATION_ROLL_SPEED : rivalSpeed) : 0, delta);
    for (const wheel of body.wheels) wheel.rotation.x = roll.current;

    if (next.finished && !finishedRef.current) {
      finishedRef.current = true;
      setFinished(true);
    }
  });

  return (
    <group
      ref={group}
      position={[initialPose.x, RACE_START_POSITION[1], initialPose.z]}
      rotation={[0, initialPose.heading + CHARIOT_MODEL_YAW_OFFSET, 0]}
      scale={CHARIOT_MODEL_SCALE}
      data-race-competitor={competitor.id}
    >
      <primitive object={body.scene} />
      {/*
        LADDER-1B: the gait follows the roll speed while this rival is still
        rolling — `startedAt` is null until the leader crosses, so the roll
        cannot be gated on the race clock or the horses would stand still
        while the chariot rolls.
      */}
      <RaceHorseTeam teamSize={2} speed={((raceState === 'racing' && (rolling || startedAt !== null)) || (raceState === 'finished' && startedAt !== null)) && !frozen && !finished ? (rolling ? FORMATION_ROLL_SPEED : rivalSpeed) : 0} />
    </group>
  );
};

/**
 * The race clock.  It lives in its own component so its tenth-of-a-second ticks
 * re-render this badge alone and never the canvas subtree, and it derives every
 * reading from the moment `racing` began — the state machine stores no clock, and
 * this is an elapsed-since-the-transition reading, never a sum of frame deltas.
 */
const RaceClock: React.FC<{ startedAt: number; frozen: boolean }> = ({ startedAt, frozen }) => {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const update = () => setElapsedMs(performance.now() - startedAt);
    update();
    // C-8.70B §SET-1 — frozen: the reading is held where it was.  The origin moves
    // forward by the frozen interval when the panel closes (see RaceScene), so the
    // clock picks up where it left off rather than jumping.
    if (frozen) return;
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [startedAt, frozen]);

  const formatted = formatRaceElapsed(elapsedMs);

  return (
    <span
      className="font-mono text-base sm:text-xl font-bold text-amber-200 tabular-nums"
      data-race-timer={formatted}
    >
      {formatted}
    </span>
  );
};

/**
 * The speed readout: a GAIT WORD and a labelled pace bar, never bare digits.  It
 * samples the motion on the same 100 ms cadence as the clock, so the number
 * ticking never re-renders the canvas subtree — and it carries the chariot's own
 * position as a data hook at that same cadence, so a test can tell that driving
 * moved the model without sampling the render loop.
 */
const RaceGaitReadout: React.FC<{ motion: ChariotMotion }> = ({ motion }) => {
  const [readout, setReadout] = useState({ speed: 0, x: 0, z: 0 });

  useEffect(() => {
    const update = () => setReadout({ speed: motion.speed, x: motion.x, z: motion.z });
    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [motion]);

  const gait = getChariotGait(readout.speed);
  const pace = getChariotPace(readout.speed);

  return (
    <span
      className="flex items-center gap-2 sm:gap-3"
      data-race-x={readout.x.toFixed(2)}
      data-race-z={readout.z.toFixed(2)}
    >
      <span
        data-race-gait={gait}
        className="font-serif font-black text-sm sm:text-base uppercase tracking-wider text-amber-200"
      >
        {gait}
      </span>
      <span className="flex items-center gap-1.5" data-race-pace={pace.toFixed(2)}>
        <span className="text-[9px] font-mono uppercase tracking-wider text-neutral-400">Pace</span>
        <span className="block w-14 sm:w-24 h-2 rounded-full bg-neutral-800 border border-amber-600/40 overflow-hidden">
          <span
            className="block h-full bg-gradient-to-r from-amber-500 to-yellow-300"
            style={{ width: `${Math.round(pace * 100)}%` }}
          />
        </span>
      </span>
    </span>
  );
};

export const RaceScene: React.FC<RaceSceneProps> = ({
  onAbort,
  isLeftyMode = false,
  chaseDistancePreset,
  onOpenSettings,
  frozen = false,
  phase = DEFAULT_PHASE,
  teamSize = 2,
  chariotLoadout,
  rung = 'district',
  onRecordRaceCompletion,
}) => {
  const [raceState, setRaceState] = useState<RaceState>(RACE_INITIAL_STATE);
  const [countdownStep, setCountdownStep] = useState<CountdownStep | null>(COUNTDOWN_STEPS[0]);
  const [showGo, setShowGo] = useState(false);
  const [raceStartedAt, setRaceStartedAt] = useState<number | null>(null);
  /**
   * LADDER-1B: the roll clock's origin — the `performance.now()` instant GO
   * fired. The race clock (`raceStartedAt`) is set later, at the leader's
   * crossing, so the two origins are distinct: the roll runs from GO, the
   * race runs from the line.
   */
  const [rollStartedAt, setRollStartedAt] = useState<number | null>(null);
  const [raceFinishElapsed, setRaceFinishElapsed] = useState<number | null>(null);
  const [raceSettlement, setRaceSettlement] = useState<RaceCompletionResult | null>(null);
  /**
   * LADDER-1B: the field's finish order, computed once at the player's
   * finish from the player's elapsed and each rival's scheduled finish
   * time. The finish screen lists the whole field from this; the settlement
   * still takes the single derived outcome.
   */
  const [raceFieldOrder, setRaceFieldOrder] = useState<RaceFieldFinishOrder | null>(null);
  /** LADDER-1B: the player's place in the field order, for the finish screen. */
  const playerPlace = raceFieldOrder?.places.find((place) => place.isPlayer)?.place ?? null;
  // ECON-2 — the highest League tier whose bonus fired on this finish, for the
  // prize line. The totals on the result may cover earlier tiers too on a
  // retroactive finish, so the line names the latest milestone, not the sum.
  const prizeTier = raceSettlement?.tierAdvanced != null ? getLeagueTier(raceSettlement.tierAdvanced) : undefined;
  const [lapStage, setLapStage] = useState<RaceLapStage>('north-turn');
  const [frameloopMode, setFrameloopMode] = useState<'demand' | 'always'>('demand');

  // The player's quality preset governs the race's pixel density and key shadow.
  // A short warm-up window prevents scene compilation from being read as poor FPS.
  const settings = useSettings();
  const qualityPreset = settings.qualityPreset;
  const [raceDpr, setRaceDpr] = useState<number>(() => CITY_TIERS[qualityPreset].dpr.start);
  const raceAdaptationSuspendedRef = useRef(true);

  useEffect(() => {
    setRaceDpr(CITY_TIERS[qualityPreset].dpr.start);
  }, [qualityPreset]);

  useEffect(() => {
    raceAdaptationSuspendedRef.current = true;
    if (frozen) return;
    const timer = setTimeout(() => {
      raceAdaptationSuspendedRef.current = false;
    }, POST_TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [frozen]);
  const [revving, setRevving] = useState(false);
  const [launchQuality, setLaunchQuality] = useState<ChariotLaunchQuality | null>(null);
  const [showHints, setShowHints] = useState(!hasRacedThisSession);
  /**
   * LADDER-1B: the field and its formation. The rung is resolved defensively
   * (an unknown or missing value fails closed to District), the field comes
   * from the rung's pool, and the formation is computed once from the field
   * size and the first rival's `startSide` — the same assignment the standing
   * grid uses, mapped onto the flank columns. The player's roll path is the
   * formation's path at the player's slot; each rival's roll path is the
   * formation's path at that rival's slot, and its route `startSide` is the
   * slot's flank.
   */
  const rungId = resolveRaceRungId(rung);
  const field = useMemo(() => resolveRungField(rungId), [rungId]);
  const formation = useMemo(
    () => resolveFormationRoll(field.length + 1, field[0]?.startSide ?? 1),
    [field],
  );
  const playerRollPath = formation.paths[formation.playerSlot];
  // The player's crossing instant (for the launch banner's clear timer): the
  // roll origin plus the player's own crossing offset.
  const playerCrossingAt = rollStartedAt !== null ? rollStartedAt + formation.playerCrossingMs : null;

  /**
   * Day/Night T1/T2 — the circus draws the CITY's table (no race-only sun), with two
   * DISPLAY-ONLY substitutions: entered at dusk it renders golden, entered at night it
   * renders dawn. The phase arrives as a prop and the substitution is display-only, so the
   * clock itself is untouched by the race.
   */
  const racePhase = resolveRacePhase(phase);
  const raceLight = getPhaseLight(racePhase);
  // The key light stands along the row's own elevation/bearing, 52 units out — the
  // distance the shipped circus sun already stood from the start line.
  const raceKeyDirection = sunDirection(raceLight.sunElevationDeg, raceLight.sunAzimuthDeg);
  const raceKeyPosition: [number, number, number] = [
    raceKeyDirection[0] * 52,
    raceKeyDirection[1] * 52,
    raceKeyDirection[2] * 52,
  ];

  /**
   * C-8.70B §SET-1 — the freeze's own bookkeeping.  While the settings panel is
   * open the clock's origin is left alone and no race time accrues anywhere; the
   * moment it closes, the origin moves forward by exactly the frozen interval, so
   * the race clock resumes at the reading it was showing.
   *
   * LADDER-1B: the roll has its own origin (`rollStartedAt`), and it moves
   * forward by the same interval — a panel opened mid-roll must not let the
   * field roll on behind it. Either origin may be null (the roll before GO,
   * the clock before the leader's crossing), and a null origin stays null.
   */
  const pausedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (frozen) {
      pausedAtRef.current = performance.now();
      return;
    }
    const pausedAt = pausedAtRef.current;
    pausedAtRef.current = null;
    if (pausedAt === null) return;
    const frozenMs = performance.now() - pausedAt;
    setRaceStartedAt((prev) => (prev === null ? prev : prev + frozenMs));
    setRollStartedAt((prev) => (prev === null ? prev : prev + frozenMs));
  }, [frozen]);

  // The whole simulation: one motion object, three input objects and one launch
  // state, created once and mutated in place by the frame loop.
  // LADDER-1B: the motion starts at the player's formation slot (heading
  // south), not on the line — the roll carries it to the line.
  const playerStartPose = getRollPathPoseAtDistance(playerRollPath, 0);
  const [motion] = useState(() =>
    createChariotMotion(playerStartPose.x, playerStartPose.z, playerStartPose.heading)
  );
  const [launch] = useState(createChariotLaunchState);
  const [input] = useState<ChariotInput>(() => ({ throttle: 0, steer: 0 }));
  const [keyboardInput] = useState<ChariotInput>(() => ({ throttle: 0, steer: 0 }));
  const [touchInput] = useState<ChariotInput>(() => ({ throttle: 0, steer: 0 }));
  const [heldKeys] = useState(() => new Set<string>());

  // Stabilize the Environment cubemap's Lightformer children (the city hub's own
  // rig, and the same reason it memoizes them there).
  const environmentLightformers = useMemo(
    () => (
      <>
        <Lightformer form="rect" intensity={2.0} color="#fffbeb" position={[30, 42, 22]} scale={[30, 30, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.35} color="#fef3c7" position={[0, 60, 0]} scale={[100, 100, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.25} color="#8a7a5f" position={[0, -30, 0]} scale={[100, 100, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.2} color="#7dd3fc" position={[-25, 20, -25]} scale={[20, 20, 1]} target={[0, 0, 0]} />
      </>
    ),
    []
  );

  useEffect(() => {
    // Warm-up matches the project's other 3D screens: demand first, then the
    // full loop, so the first frame never waits on the shader/environment warm-up.
    const timer = setTimeout(() => setFrameloopMode('always'), 250);
    return () => clearTimeout(timer);
  }, []);

  // The scene is handed in at `idle` and the race begins by itself: one `start`
  // event.  The machine makes a repeat a no-op, so a StrictMode double-mount
  // cannot start two countdowns.
  useEffect(() => {
    setRaceState((state) => startRace(state));
  }, []);

  // The countdown's own clock.  It exists only while `countdown` holds, and the
  // moment a step is no longer available the countdown has elapsed — that is the
  // machine's event, and the roll starts on the same instant.
  // LADDER-1B: GO starts the ROLL, not the race clock. The clock starts at
  // the leader's crossing (reported by the player's chariot through
  // `onLeaderCrossing`), so `raceStartedAt` is left null here.
  useEffect(() => {
    // Frozen during the countdown: the countdown restarts when the panel closes,
    // which is the one honest reading of "the race does not advance".
    if (raceState !== 'countdown' || frozen) return;

    const startedAt = performance.now();
    setCountdownStep(getCountdownStep(0));
    const interval = setInterval(() => {
      const step = getCountdownStep(performance.now() - startedAt);
      if (step === null) {
        clearInterval(interval);
        setCountdownStep(null);
        setRollStartedAt(performance.now());
        setShowGo(true);
        setRaceState((state) => markCountdownElapsed(state));
        return;
      }
      setCountdownStep(step);
    }, 100);

    return () => clearInterval(interval);
  }, [raceState, frozen]);

  /**
   * LADDER-1B: the leader's crossing starts the race clock. The player's
   * chariot detects the instant (the frame loop is the only clock that
   * respects `frozen`); the origin is the exact crossing instant, not the
   * frame the detection landed on, so the clock is accurate to the roll.
   */
  const handleLeaderCrossing = useCallback(() => {
    // The chariot's own ref guard is the primary once-only protection; this
    // guard covers a stale prop landing after the clock already started.
    if (rollStartedAt === null || raceStartedAt !== null) return;
    setRaceStartedAt(rollStartedAt + formation.leaderCrossingMs);
  }, [rollStartedAt, raceStartedAt, formation.leaderCrossingMs]);

  // The green light is a beat inside `racing`, so it clears itself.
  useEffect(() => {
    if (!showGo) return;
    const timer = setTimeout(() => setShowGo(false), GO_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [showGo]);

  // The first race of the session teaches the controls with labels on the
  // controls themselves; they fade out.  The flag is module memory, never a save.
  useEffect(() => {
    hasRacedThisSession = true;
    if (!showHints) return;
    const timer = setTimeout(() => setShowHints(false), FIRST_RACE_HINT_MS);
    return () => clearTimeout(timer);
  }, [showHints]);

  // The visible rev state, while the gates are still up AND while the field
  // is rolling: it reads the launch state the frame loop is building, on the
  // same 100 ms cadence as everything else in the HUD. Rev builds through the
  // countdown and the roll (the clock has not started), and stops building
  // once the leader crosses.
  useEffect(() => {
    if (raceState !== 'countdown' && !(raceState === 'racing' && raceStartedAt === null)) return;
    const update = () => setRevving(launch.revved);
    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [raceState, raceStartedAt, launch]);

  // How the launch resolved, announced once the release window has closed.
  // LADDER-1B: the window is measured from the LEADER's crossing (the clock
  // origin, `raceStartedAt`), and the banner clears once the boost / bog
  // duration has run from the PLAYER's crossing (`playerCrossingAt`) — the
  // player crosses 1.5–3.0 s after the leader, so a clear timer measured from
  // the leader's crossing would hide the banner before the boost ends.
  useEffect(() => {
    if (raceState !== 'racing' || raceStartedAt === null || playerCrossingAt === null) return;
    setRevving(false);
    const { releaseWindowMs, cleanDurationMs, boggedDurationMs } = CHARIOT_MOVEMENT.launch;
    const resolved = setTimeout(
      () => setLaunchQuality(launch.quality),
      Math.max(0, raceStartedAt + releaseWindowMs + 50 - performance.now()),
    );
    const cleared = setTimeout(
      () => setLaunchQuality(null),
      Math.max(0, playerCrossingAt + Math.max(cleanDurationMs, boggedDurationMs) + 500 - performance.now()),
    );
    return () => {
      clearTimeout(resolved);
      clearTimeout(cleared);
    };
  }, [raceState, raceStartedAt, playerCrossingAt, launch]);

  // The desktop path: W/↑ throttle, S/↓ brake-reverse, A/D or ←/→ steer.  It
  // writes the keyboard's own object, which the frame loop merges with the touch
  // controls' — both paths therefore feed the same throttle/steer values.  A lost
  // focus releases every key, so a tab switch cannot leave the throttle held.
  useEffect(() => {
    // C-8.70B §SET-1 — frozen: the keys are released, so a key held while the panel
    // was open cannot set the chariot moving the moment it closes.
    if (frozen) {
      heldKeys.clear();
      keyboardInput.throttle = 0;
      keyboardInput.steer = 0;
      return;
    }

    const actions: Record<string, string> = {
      KeyW: 'forward',
      w: 'forward',
      ArrowUp: 'forward',
      KeyS: 'backward',
      s: 'backward',
      ArrowDown: 'backward',
      KeyA: 'left',
      a: 'left',
      ArrowLeft: 'left',
      KeyD: 'right',
      d: 'right',
      ArrowRight: 'right',
    };

    const sync = () => {
      const forward = heldKeys.has('forward') !== heldKeys.has('backward');
      const sideways = heldKeys.has('left') !== heldKeys.has('right');
      keyboardInput.throttle = forward ? (heldKeys.has('forward') ? 1 : -1) : 0;
      keyboardInput.steer = sideways ? (heldKeys.has('right') ? 1 : -1) : 0;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const action = actions[event.code] ?? actions[event.key];
      if (!action) return;
      // Arrow keys otherwise scroll the host page while the player is steering.
      event.preventDefault();
      heldKeys.add(action);
      sync();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const action = actions[event.code] ?? actions[event.key];
      if (!action) return;
      heldKeys.delete(action);
      sync();
    };

    const releaseAll = () => {
      heldKeys.clear();
      sync();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', releaseAll);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', releaseAll);
    };
  }, [heldKeys, keyboardInput, frozen]);

  /** Abort: dispatch the machine's own event, then let `App` tear the scene down. */
  const handleAbort = useCallback(() => {
    setRaceState((state) => abortRace(state));
    onAbort();
  }, [onAbort]);

  // Esc is a desktop ADDITION to the Abort control, which is the touch path and
  // is always on screen: no gesture depends on this listener.
  useEffect(() => {
    // C-8.70B §SET-1 — frozen: Esc belongs to the settings panel (Done), never to
    // Abort, so the panel cannot be closed by leaving the race.
    if (frozen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      handleAbort();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleAbort, frozen]);

  return (
    <div
      className="relative w-full h-full min-h-[100dvh] bg-neutral-950 overflow-hidden select-none"
      data-race-state={raceState}
      data-race-rev={revving ? 'true' : 'false'}
    >
      {/* 3D CIRCUS ARENA CANVAS — the city's light rig, the shipping arena, the chariot */}
      <WebGLReadyGuard
        sceneName="CircusRace"
        fallbackTitle="Circus Race WebGL Error"
        onFallbackTo2D={handleAbort}
      >
        <WebGLContextErrorBoundary
          sceneName="CircusRace"
          fallbackTitle="Circus Race WebGL Error"
          onFallbackTo2D={handleAbort}
        >
          <Canvas
            shadows
            frameloop={frameloopMode}
            dpr={raceDpr}
            camera={{ position: RACE_CAMERA_POSITION, fov: CHARIOT_CHASE_CAMERA.fovAtRest, near: 0.1, far: 160 }}
            gl={{ antialias: false, powerPreference: 'high-performance' }}
            onCreated={(state) => {
              logCanvasWebGLCreated(state.gl, 'CircusRace');
              setupCanvasContextRestoration(state.gl);
            }}
          >
            <CanvasWebGLMonitor sceneName="CircusRace" />
            {import.meta.env.DEV && (
              import.meta.env.VITE_DEV_RACE_STATS === '1' ||
              (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('devRaceStats') === '1')
            ) && <RaceRenderDiagnostics />}
            {/* Shared adaptive pixel governor; suspended while race settings are open. */}
            <RaceAdaptiveDpr
              tier={qualityPreset}
              suspendedRef={raceAdaptationSuspendedRef}
              onDprChange={setRaceDpr}
            />
            {/* C-8.70B §SET-1 — the brightness row, applied on creation and live. */}
            <SceneBrightness />

            {/* Day/Night T1 — the circus's hour comes from the city's own table. */}
            <fog attach="fog" args={[raceLight.fogColor, raceLight.fogNear, raceLight.fogFar]} />
            <PhaseSkyDome phase={racePhase} />
            <hemisphereLight
              color={raceLight.hemiSky}
              groundColor={raceLight.hemiGround}
              intensity={raceLight.hemiIntensity}
            />
            <directionalLight
              position={raceKeyPosition}
              intensity={raceLight.sunIntensity}
              color={raceLight.sunColor}
              castShadow
              shadow-mapSize={[CITY_TIERS[qualityPreset].shadows, CITY_TIERS[qualityPreset].shadows]}
              shadow-camera-left={-70}
              shadow-camera-right={50}
              shadow-camera-top={50}
              shadow-camera-bottom={-50}
              shadow-camera-near={1}
              shadow-camera-far={140}
              shadow-bias={-0.0004}
              shadow-normalBias={0.02}
            />
            <directionalLight
              position={[-25, 20, -25]}
              intensity={0.28 * (raceLight.hemiIntensity / 0.45)}
              color={raceLight.hemiSky}
            />

            <Environment resolution={256} frames={1} environmentIntensity={raceLight.envIntensity}>
              {environmentLightformers}
            </Environment>

            <ThreeComponentErrorBoundary componentName="RaceArenaAndChariot">
              <Suspense fallback={null}>
                <EastCircusArena />
        <CircusCrowd />
                <RaceChariot
                  motion={motion}
                  input={input}
                  keyboardInput={keyboardInput}
                  touchInput={touchInput}
                  launch={launch}
                  raceState={raceState}
                  startedAt={raceStartedAt}
                  frozen={frozen}
                  teamSize={teamSize}
                  wheelVariant={getChariotPart(chariotLoadout?.wheels ?? 'wheels_standard')?.wheelVariant ?? 'standard'}
                  finish={getChariotPart(chariotLoadout?.finish ?? 'finish_stock')?.finish ?? 'stock'}
                  onLapStageChange={setLapStage}
                  rollPath={playerRollPath}
                  rollStartedAt={rollStartedAt}
                  leaderCrossingMs={formation.leaderCrossingMs}
                  onLeaderCrossing={handleLeaderCrossing}
                  onFinish={() => {
                    const elapsedMs = raceStartedAt === null ? 0 : Math.max(0, performance.now() - raceStartedAt);
                    setRaceFinishElapsed(elapsedMs);
                    // LADDER-1B: places are read from finish times — the
                    // player's elapsed against each rival's scheduled finish.
                    // The settlement still takes the single derived outcome.
                    const fieldOrder = resolveFieldFinishOrder([
                      { id: 'player', name: 'You', finishMs: elapsedMs, isPlayer: true },
                      ...field.flatMap((rival, index) => {
                        const slot = formation.rivalSlots[index];
                        const finishMs = resolveRaceRivalFinishMs(
                          rival.lapDurationMs,
                          formation.paths[slot].crossingMs - formation.leaderCrossingMs,
                        );
                        return finishMs === null
                          ? []
                          : [{ id: rival.id, name: rival.name, finishMs, isPlayer: false }];
                      }),
                    ]);
                    setRaceFieldOrder(fieldOrder);
                    const outcome = fieldOrder?.outcome ?? 'photo-finish';
                    setRaceSettlement(onRecordRaceCompletion ? onRecordRaceCompletion(teamSize, elapsedMs, outcome) : null);
                    setRaceState((state) => finishRace(state));
                  }}
                />
                {/*
                  LADDER-1B: one mount per rival in the rung's field (2
                  District, 4 League). Each rival's roll path is the
                  formation's path at that rival's slot, and its route
                  `startSide` is the slot's flank — the roll ends on that
                  flank's racing lane.
                */}
                {field.map((rival, index) => {
                  const slot = formation.rivalSlots[index];
                  return (
                    <RaceRivalChariot
                      key={rival.id}
                      raceState={raceState}
                      startedAt={raceStartedAt}
                      frozen={frozen}
                      competitor={rival}
                      startSide={formation.slots[slot].endSide}
                      rollPath={formation.paths[slot]}
                      rollStartedAt={rollStartedAt}
                    />
                  );
                })}
              </Suspense>
            </ThreeComponentErrorBoundary>

            <RaceCameraRig
              motion={motion}
              input={input}
              raceState={raceState}
              preset={resolveChaseDistancePreset(chaseDistancePreset)}
              clockStarted={raceStartedAt !== null}
            />
          </Canvas>
        </WebGLContextErrorBoundary>
      </WebGLReadyGuard>

      {/* RACE HUD — the clock (mm:ss.t), the gait word and pace bar while
          `racing`, and the Abort control in the top corner so the two bottom
          corners belong to the thumbs.  The centre of the screen stays clear. */}
      {isRaceRunning(raceState) && (
        <div className="absolute top-0 left-0 right-0 z-30 flex items-start justify-between gap-2 p-3 sm:p-5 pb-0 pointer-events-none">
          <div className="flex flex-wrap items-center gap-3 bg-neutral-950/85 border border-amber-600/50 px-4 py-2 rounded-2xl backdrop-blur-md shadow-2xl">
            <span className="text-[10px] font-serif font-black uppercase tracking-widest text-amber-400">
              {raceState === 'racing' ? 'Race Clock' : 'Starting Gates'}
            </span>
            {raceState === 'racing' && raceStartedAt !== null && (
              <RaceClock startedAt={raceStartedAt} frozen={frozen} />
            )}
            {raceState === 'racing' && <RaceGaitReadout motion={motion} />}
            {raceState === 'racing' && raceStartedAt === null && (
              <span
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="text-[9px] sm:text-[10px] font-mono uppercase tracking-wider text-amber-300/90 border-l border-amber-700/60 pl-3"
                data-race-checkpoint="formation"
              >
                Rolling to the line
              </span>
            )}
            {raceState === 'racing' && raceStartedAt !== null && (
              <span
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="text-[9px] sm:text-[10px] font-mono uppercase tracking-wider text-amber-300/90 border-l border-amber-700/60 pl-3"
                data-race-checkpoint={lapStage}
              >
                {lapStage === 'north-turn' ? 'Reach far bend' :
                  lapStage === 'south-turn' ? 'Round near bend' :
                    lapStage === 'finish-line' ? 'Return to finish' : 'Lap complete'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* C-8.70B §SET-1 — the gear sits BESIDE Abort in this top bar: never
                inside either bottom touch cluster and never over the clock or the
                gates panel, which are the bar's other two occupants. */}
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                data-race-action="settings"
                className="pointer-events-auto min-h-[3rem] px-4 rounded-2xl bg-neutral-950/85 border-2 border-amber-500/60 text-amber-200 hover:text-amber-50 hover:border-amber-400 font-serif font-black text-xs uppercase tracking-wider shadow-xl active:scale-95 transition-all cursor-pointer touch-manipulation flex items-center gap-2"
              >
                <SettingsIcon className="w-5 h-5" />
                <span>Settings</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleAbort}
              data-race-action="abort"
              className="pointer-events-auto min-h-[3rem] px-4 rounded-2xl bg-gradient-to-r from-red-700 to-red-900 hover:from-red-600 hover:to-red-800 border-2 border-red-400/70 text-amber-50 font-serif font-black text-xs uppercase tracking-wider shadow-[0_0_25px_rgba(220,38,38,0.45)] active:scale-95 transition-all cursor-pointer touch-manipulation flex items-center gap-2"
            >
              {/* UI-1 (B-19) — the icon its label always implied. */}
              <XCircle className="w-4 h-4" />
              <span>Abort race</span>
              <span className="hidden md:inline ml-2 text-[10px] opacity-70">(Esc)</span>
            </button>
          </div>
        </div>
      )}

      {/* TOUCH CONTROLS — steering under one thumb, throttle/brake under the
          other, in the two bottom corners; mirrored as one unit in Lefty Mode. */}
      {isRaceRunning(raceState) && (
        <RaceTouchControls
          input={touchInput}
          isLeftyMode={isLeftyMode}
          showHints={showHints}
          revving={revving}
          frozen={frozen}
        />
      )}

      {/* THE LAUNCH — how the Clean Start resolved, once the window has closed. */}
      {raceState === 'racing' && launchQuality !== null && launchQuality !== 'none' && (
        <div className="absolute top-16 sm:top-20 left-0 right-0 z-20 flex justify-center pointer-events-none">
          <span
            data-race-launch={launchQuality}
            className={`font-serif font-black uppercase tracking-widest text-sm sm:text-lg px-4 py-1 rounded-xl border backdrop-blur-md ${
              launchQuality === 'clean'
                ? 'text-lime-200 border-lime-400/70 bg-lime-900/50'
                : 'text-rose-200 border-rose-400/70 bg-rose-950/50'
            }`}
          >
            {launchQuality === 'clean' ? 'Clean Start' : 'Slow Start'}
          </span>
        </div>
      )}

      {/* COUNTDOWN — one step per second, driven by the machine's own state. */}
      {raceState === 'countdown' && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none bg-neutral-950/35"
          data-race-overlay="countdown"
        >
          <div
            key={countdownStep ?? 'countdown'}
            data-race-countdown-step={countdownStep ?? ''}
            className="animate-fadeIn font-serif font-black text-amber-200 leading-none text-[26vmin] drop-shadow-[0_6px_24px_rgba(0,0,0,0.9)]"
          >
            {countdownStep}
          </div>
        </div>
      )}

      {raceState === 'finished' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-neutral-950/75 p-6" data-race-overlay="finished">
          <div className="w-full max-w-md rounded-3xl border-2 border-amber-500/70 bg-neutral-950/95 p-7 text-center shadow-2xl">
            <p className="font-serif text-xs font-black uppercase tracking-[0.25em] text-amber-400">East Circus · Race Complete</p>
            <h2 className="mt-3 font-serif text-4xl font-black text-amber-100">Race Results</h2>
            <p className="mt-4 text-sm uppercase tracking-widest text-neutral-400">Your time</p>
            <p className="mt-1 font-mono text-4xl font-bold tabular-nums text-lime-300" data-race-finish-time={formatRaceElapsed(raceFinishElapsed ?? 0)}>{formatRaceElapsed(raceFinishElapsed ?? 0)}</p>
            {raceFieldOrder && (
              <div className="mt-5 rounded-2xl border border-amber-700/50 bg-neutral-900/80 px-4 py-3" data-race-result={raceFieldOrder.outcome} data-race-player-place={playerPlace ?? ''}>
                <p className="font-serif text-lg font-black uppercase tracking-wider text-amber-200">
                  {raceFieldOrder.outcome === 'victory' ? `Victory — ${playerPlace === 1 ? '1st' : playerPlace === 2 ? '2nd' : playerPlace === 3 ? '3rd' : `${playerPlace ?? ''}th`} Place` : raceFieldOrder.outcome === 'defeat' ? `Rival Victory — ${playerPlace === 2 ? '2nd' : playerPlace === 3 ? '3rd' : `${playerPlace ?? ''}th`} Place` : 'Photo Finish'}
                </p>
                <p className="mt-1 text-sm text-neutral-400">
                  {raceFieldOrder.outcome === 'photo-finish'
                    ? 'Finishes within one tenth of a second.'
                    : `${raceFieldOrder.outcome === 'victory' ? 'Won by' : 'Beaten by'} ${formatRaceElapsed(raceFieldOrder.marginMs)}`}
                </p>
                <ol className="mt-3 space-y-1 text-left">
                  {raceFieldOrder.places.map((place) => {
                    const rival = place.isPlayer ? null : field.find((entry) => entry.id === place.id);
                    return (
                      <li
                        key={place.id}
                        data-race-place={place.place}
                        data-race-finisher={place.id}
                        className={`flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-sm ${place.isPlayer ? 'bg-amber-950/70 border border-amber-500/50 font-bold text-amber-100' : 'text-neutral-300'}`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-amber-400">{place.place}</span>
                          <span className="font-serif">{place.isPlayer ? 'You' : rival?.name ?? place.id}</span>
                          {rival && <span className="text-[10px] uppercase tracking-widest text-neutral-500">{rival.faction}</span>}
                        </span>
                        <span className="font-mono tabular-nums" data-race-finisher-time={formatRaceElapsed(place.finishMs)}>{formatRaceElapsed(place.finishMs)}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
            {raceSettlement ? (
              <div className="mt-4 rounded-2xl border border-amber-700/40 bg-neutral-900/70 p-4 text-left" data-race-settlement="saved">
                <p className="font-serif text-sm font-black uppercase tracking-wider text-amber-200">Circus purse</p>
                <p className="mt-1 text-2xl font-mono font-bold text-lime-300" data-race-purse={raceSettlement.purseAwarded}>+{raceSettlement.purseAwarded} gold</p>
                <p className="mt-1 text-xs text-neutral-400">{raceSettlement.purseAwarded > 0 ? 'Completion purse settled. One purse is available per in-game day.' : 'Today’s purse has already been collected; this finish still counts.'}</p>
                {raceSettlement.prizeAwarded > 0 && (
                  <div className="mt-3 rounded-xl border border-amber-500/50 bg-amber-950/50 px-3 py-2" data-race-league-prize={raceSettlement.tierAdvanced ?? ''}>
                    <p className="font-serif text-sm font-black uppercase tracking-wider text-amber-200">League bonus</p>
                    <p className="mt-1 text-xl font-mono font-bold text-lime-300">+{raceSettlement.prizeAwarded} gold · +{raceSettlement.fameAwarded} fame</p>
                    <p className="mt-1 text-xs text-neutral-400">
                      {prizeTier ? `${prizeTier.name} milestone reached — a one-time League bonus, paid once.` : 'A one-time League bonus, paid once.'}
                    </p>
                  </div>
                )}
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-neutral-800 pt-3 text-center text-xs">
                  <div><p className="text-neutral-500">Completed</p><p className="font-mono text-amber-200">{raceSettlement.completed}</p></div>
                  <div><p className="text-neutral-500">Wins</p><p className="font-mono text-amber-200">{raceSettlement.wins}</p></div>
                  <div><p className="text-neutral-500">Losses</p><p className="font-mono text-amber-200">{raceSettlement.losses}</p></div>
                </div>
                {raceSettlement.improvedBest && <p className="mt-3 text-sm font-bold text-lime-300" role="status">New personal best saved for this team.</p>}
              </div>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-red-300" role="status" data-race-settlement="failed">Race completed, but the career result could not be saved.</p>
            )}
            <button type="button" onClick={handleAbort} data-race-action="return-city" className="mt-6 min-h-12 w-full rounded-2xl border-2 border-amber-400 bg-amber-700 px-5 py-3 font-serif text-sm font-black uppercase tracking-widest text-amber-50 active:scale-[0.98]">Return to City</button>
          </div>
        </div>
      )}

      {/* GREEN LIGHT — the first beat of `racing`, then gone. */}
      {showGo && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
          data-race-overlay="go"
        >
          <div className="animate-fadeIn font-serif font-black text-lime-300 leading-none text-[26vmin] drop-shadow-[0_6px_28px_rgba(0,0,0,0.95)]">
            {GO_LABEL}
          </div>
        </div>
      )}
    </div>
  );
};
