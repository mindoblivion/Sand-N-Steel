import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, Sky, useGLTF } from '@react-three/drei';
import { EastCircusArena } from './city/EastCircusArena';
import { RaceTouchControls } from '../ui/RaceTouchControls';
import { CanvasLoadingFallback } from '../ui/AssetLoadingOverlay';
import { WebGLContextErrorBoundary } from '../ui/WebGLContextErrorBoundary';
import { ThreeComponentErrorBoundary } from '../ui/ThreeComponentErrorBoundary';
import { WebGLReadyGuard } from '../ui/WebGLReadyGuard';
import { CanvasWebGLMonitor } from '../ui/CanvasWebGLMonitor';
import { logCanvasWebGLCreated, setupCanvasContextRestoration } from '../../utils/webglContext';
import { CHARIOT_MODEL_SCALE, CHARIOT_MODEL_URL } from '../../utils/chariotGeometry';
import { CIRCUS_RACE_CAMERA, CIRCUS_RACE_START } from '../../utils/circusDistrictGeometry';
import {
  CHARIOT_MOVEMENT,
  CHARIOT_MODEL_YAW_OFFSET,
  advanceChariot,
  createChariotLaunchState,
  createChariotMotion,
  getChariotGait,
  getChariotPace,
  launchAccelScale,
  mergeChariotInputs,
  trackChariotLaunch,
} from '../../utils/chariotMovement';
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
  formatRaceElapsed,
  getCountdownStep,
  isRaceRunning,
  markCountdownElapsed,
  startRace,
} from '../../utils/raceState';
import type { CountdownStep, RaceState } from '../../utils/raceState';

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
 *   • the player's chariot: `_workspace_chariot_model_RomanChariot.glb` through
 *     the same `CHARIOT_MODEL_URL` / `CHARIOT_MODEL_SCALE` the workshop uses, at
 *     the start line `CIRCUS_RACE_START` on the arena's long axis.  The loaded
 *     scene is CLONED (the workshop's own rule — `useGLTF` caches one scene per
 *     URL and the workshop holds the same entry), and its stock wheels are left
 *     fitted: this slice has no wheel kit, no finish selection, NO HORSES and no
 *     rivals;
 *   • the city hub's own calibrated light rig, value for value (sun, fill,
 *     hemisphere, fog, Sky and the 256 px procedural `Environment`), so the arena
 *     reads here as it reads in the city.
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
 * named config, and the settings row that will offer them attaches through the
 * `chaseDistancePreset` prop — no UI here), and a look point carried
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
 * ── Save safety ───────────────────────────────────────────────────────────
 * READ-ONLY, like Slice 0's panel and Slice 1: this file imports no storage,
 * names no save writer and writes nothing.  Racing, driving or aborting moves no
 * gold, unlock or progression.  The first race of a session teaches the controls
 * with fading labels on the controls themselves; that is a module-level flag in
 * THIS module's memory, never a save, and a reload simply shows the labels again.
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
   * missing or unknown name, so today's callers pass nothing and get Standard.
   * No settings UI exists yet, and no settings module is read: see
   * `utils/chaseCamera.ts`.
   */
  chaseDistancePreset?: ChaseDistancePreset;
}

// Preload the chariot at module import (the EastCircusArena pattern).  The
// arena's own GLB is preloaded by EastCircusArena's module, and both entries are
// already warm when the race is entered from the city.
try {
  useGLTF.preload(CHARIOT_MODEL_URL);
} catch {
  // Silent fallback — useGLTF will load on demand if preload fails.
}

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
 * The static race view, used while the gates are still counting down: the
 * layout module's own camera pose, derived there from the start line.
 */
export const RACE_CAMERA_POSITION: [number, number, number] = [
  CIRCUS_RACE_CAMERA.position[0],
  CIRCUS_RACE_CAMERA.position[1],
  CIRCUS_RACE_CAMERA.position[2],
];
export const RACE_CAMERA_TARGET: [number, number, number] = [
  CIRCUS_RACE_CAMERA.target[0],
  CIRCUS_RACE_CAMERA.target[1],
  CIRCUS_RACE_CAMERA.target[2],
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
}> = ({ motion, input, raceState, preset }) => {
  const { camera: activeCamera } = useThree();
  // r3f types the Canvas camera as the Camera union; this scene mounts the
  // perspective one, whose FOV the survey drives.
  const camera = activeCamera as THREE.PerspectiveCamera;
  const look = useRef({ x: RACE_CAMERA_TARGET[0], y: RACE_CAMERA_TARGET[1], z: RACE_CAMERA_TARGET[2] });
  const pose = useRef(createChasePose());
  const following = useRef(false);

  useEffect(() => {
    if (raceState === 'racing') return;
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
  }, [camera, raceState]);

  useFrame((_state, delta) => {
    if (raceState !== 'racing') return;

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
}> = ({ motion, input, keyboardInput, touchInput, launch, raceState, startedAt }) => {
  const gltf = useGLTF(CHARIOT_MODEL_URL);

  // Clone: `useGLTF` caches one scene per URL and the workshop holds the same
  // entry, so the cached scene is never touched (the workshop's own rule).
  const body = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const group = useRef<THREE.Group>(null);

  useFrame((_state, delta) => {
    mergeChariotInputs(input, keyboardInput, touchInput);

    const elapsedSinceGoMs = startedAt !== null ? performance.now() - startedAt : 0;
    const racing = raceState === 'racing';
    trackChariotLaunch(launch, input.throttle, racing, elapsedSinceGoMs);

    if (racing) {
      advanceChariot(motion, input, delta, launchAccelScale(launch, elapsedSinceGoMs));
    }

    const chassis = group.current;
    if (chassis) {
      chassis.position.set(motion.x, RACE_START_POSITION[1], motion.z);
      chassis.rotation.y = motion.heading + CHARIOT_MODEL_YAW_OFFSET;
    }
  });

  return (
    <group
      ref={group}
      position={RACE_START_POSITION}
      rotation={[0, RACE_START_ROTATION_Y, 0]}
      scale={CHARIOT_MODEL_SCALE}
    >
      <primitive object={body} />
    </group>
  );
};

/**
 * The race clock.  It lives in its own component so its tenth-of-a-second ticks
 * re-render this badge alone and never the canvas subtree, and it derives every
 * reading from the moment `racing` began — the state machine stores no clock, and
 * this is an elapsed-since-the-transition reading, never a sum of frame deltas.
 */
const RaceClock: React.FC<{ startedAt: number }> = ({ startedAt }) => {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const update = () => setElapsedMs(performance.now() - startedAt);
    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [startedAt]);

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
}) => {
  const [raceState, setRaceState] = useState<RaceState>(RACE_INITIAL_STATE);
  const [countdownStep, setCountdownStep] = useState<CountdownStep | null>(COUNTDOWN_STEPS[0]);
  const [showGo, setShowGo] = useState(false);
  const [raceStartedAt, setRaceStartedAt] = useState<number | null>(null);
  const [frameloopMode, setFrameloopMode] = useState<'demand' | 'always'>('demand');
  const [revving, setRevving] = useState(false);
  const [launchQuality, setLaunchQuality] = useState<ChariotLaunchQuality | null>(null);
  const [showHints, setShowHints] = useState(!hasRacedThisSession);

  // The whole simulation: one motion object, three input objects and one launch
  // state, created once and mutated in place by the frame loop.
  const [motion] = useState(() =>
    createChariotMotion(RACE_START_POSITION[0], RACE_START_POSITION[2], RACE_START_ROTATION_Y)
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
  // machine's event, and the race clock starts on the same instant.
  useEffect(() => {
    if (raceState !== 'countdown') return;

    const startedAt = performance.now();
    setCountdownStep(getCountdownStep(0));
    const interval = setInterval(() => {
      const step = getCountdownStep(performance.now() - startedAt);
      if (step === null) {
        clearInterval(interval);
        setCountdownStep(null);
        setRaceStartedAt(performance.now());
        setShowGo(true);
        setRaceState((state) => markCountdownElapsed(state));
        return;
      }
      setCountdownStep(step);
    }, 100);

    return () => clearInterval(interval);
  }, [raceState]);

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

  // The visible rev state, while the gates are still up: it reads the launch
  // state the frame loop is building, on the same 100 ms cadence as everything
  // else in the HUD.
  useEffect(() => {
    if (raceState !== 'countdown') return;
    const update = () => setRevving(launch.revved);
    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [raceState, launch]);

  // How the launch resolved, announced once the release window has closed.
  useEffect(() => {
    if (raceState !== 'racing') return;
    setRevving(false);
    const { releaseWindowMs, cleanDurationMs, boggedDurationMs } = CHARIOT_MOVEMENT.launch;
    const resolved = setTimeout(() => setLaunchQuality(launch.quality), releaseWindowMs + 50);
    const cleared = setTimeout(
      () => setLaunchQuality(null),
      Math.max(cleanDurationMs, boggedDurationMs) + releaseWindowMs + 500
    );
    return () => {
      clearTimeout(resolved);
      clearTimeout(cleared);
    };
  }, [raceState, launch]);

  // The desktop path: W/↑ throttle, S/↓ brake-reverse, A/D or ←/→ steer.  It
  // writes the keyboard's own object, which the frame loop merges with the touch
  // controls' — both paths therefore feed the same throttle/steer values.  A lost
  // focus releases every key, so a tab switch cannot leave the throttle held.
  useEffect(() => {
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
  }, [heldKeys, keyboardInput]);

  /** Abort: dispatch the machine's own event, then let `App` tear the scene down. */
  const handleAbort = useCallback(() => {
    setRaceState((state) => abortRace(state));
    onAbort();
  }, [onAbort]);

  // Esc is a desktop ADDITION to the Abort control, which is the touch path and
  // is always on screen: no gesture depends on this listener.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      handleAbort();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleAbort]);

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
            dpr={[1, 2]}
            camera={{ position: RACE_CAMERA_POSITION, fov: CHARIOT_CHASE_CAMERA.fovAtRest, near: 0.1, far: 160 }}
            gl={{ antialias: false, powerPreference: 'high-performance' }}
            onCreated={(state) => {
              logCanvasWebGLCreated(state.gl, 'CircusRace');
              setupCanvasContextRestoration(state.gl);
            }}
          >
            <CanvasWebGLMonitor sceneName="CircusRace" />

            <fog attach="fog" args={['#e3dbc6', 45, 160]} />
            <Sky sunPosition={[30, 42, 22]} turbidity={7} rayleigh={1.8} mieCoefficient={0.005} />
            <hemisphereLight color="#fef3c7" groundColor="#8a7a5f" intensity={0.45} />
            <directionalLight
              position={[30, 42, 22]}
              intensity={2.15}
              color="#fffbeb"
              castShadow
              shadow-mapSize={[2048, 2048]}
              shadow-camera-left={-70}
              shadow-camera-right={50}
              shadow-camera-top={50}
              shadow-camera-bottom={-50}
              shadow-camera-near={1}
              shadow-camera-far={140}
              shadow-bias={-0.0004}
              shadow-normalBias={0.02}
            />
            <directionalLight position={[-25, 20, -25]} intensity={0.28} color="#7dd3fc" />

            <Environment resolution={256} frames={1} environmentIntensity={0.35}>
              {environmentLightformers}
            </Environment>

            <ThreeComponentErrorBoundary componentName="RaceArenaAndChariot">
              <Suspense fallback={<CanvasLoadingFallback />}>
                <EastCircusArena />
                <RaceChariot
                  motion={motion}
                  input={input}
                  keyboardInput={keyboardInput}
                  touchInput={touchInput}
                  launch={launch}
                  raceState={raceState}
                  startedAt={raceStartedAt}
                />
              </Suspense>
            </ThreeComponentErrorBoundary>

            <RaceCameraRig
              motion={motion}
              input={input}
              raceState={raceState}
              preset={resolveChaseDistancePreset(chaseDistancePreset)}
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
              <RaceClock startedAt={raceStartedAt} />
            )}
            {raceState === 'racing' && <RaceGaitReadout motion={motion} />}
          </div>

          <button
            type="button"
            onClick={handleAbort}
            data-race-action="abort"
            className="pointer-events-auto min-h-[3rem] px-4 rounded-2xl bg-gradient-to-r from-red-700 to-red-900 hover:from-red-600 hover:to-red-800 border-2 border-red-400/70 text-amber-50 font-serif font-black text-xs uppercase tracking-wider shadow-[0_0_25px_rgba(220,38,38,0.45)] active:scale-95 transition-all cursor-pointer touch-manipulation"
          >
            Abort race
            <span className="hidden md:inline ml-2 text-[10px] opacity-70">(Esc)</span>
          </button>
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
