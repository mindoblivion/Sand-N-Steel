import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, Lightformer, Sky, useGLTF } from '@react-three/drei';
import { EastCircusArena } from './city/EastCircusArena';
import { CanvasLoadingFallback } from '../ui/AssetLoadingOverlay';
import { WebGLContextErrorBoundary } from '../ui/WebGLContextErrorBoundary';
import { ThreeComponentErrorBoundary } from '../ui/ThreeComponentErrorBoundary';
import { WebGLReadyGuard } from '../ui/WebGLReadyGuard';
import { CanvasWebGLMonitor } from '../ui/CanvasWebGLMonitor';
import { logCanvasWebGLCreated, setupCanvasContextRestoration } from '../../utils/webglContext';
import { CHARIOT_MODEL_SCALE, CHARIOT_MODEL_URL } from '../../utils/chariotGeometry';
import { CIRCUS_RACE_CAMERA, CIRCUS_RACE_START } from '../../utils/circusDistrictGeometry';
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
 * RaceScene.tsx — Phase C-8.70B Stage 1, Slice 1: the race scene.
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
 *     opponents;
 *   • the city hub's own calibrated light rig, value for value (sun, fill,
 *     hemisphere, fog, Sky and the 256 px procedural `Environment`), so the arena
 *     reads here as it reads in the city.
 *
 * ── The countdown, the clock and the abort ────────────────────────────────
 * The state machine (`utils/raceState.ts`) owns the five states; this component
 * owns the two clocks it is allowed to have.  It mounts in `idle` and starts the
 * countdown at once; a one-second-per-step interval reads `getCountdownStep`,
 * and the moment that answers `null` (three seconds) it dispatches
 * `countdown-elapsed` — so `racing` begins exactly when the green light does, and
 * the race clock's origin is that instant.  `GO` is a `GO_DISPLAY_MS` beat inside
 * `racing`, not a sixth state.  Abort is an oversized touch target AND (on
 * desktop) the Esc key; either one dispatches `abort` and hands control back to
 * `App`, which tears this scene down and returns the player to the city at the
 * pose captured on entry.
 *
 * ── Save safety ───────────────────────────────────────────────────────────
 * READ-ONLY, like Slice 0's panel: this file imports no storage, names no save
 * writer and writes nothing.  Racing, aborting or (later) finishing moves no
 * gold, unlock or progression.
 */
export interface RaceSceneProps {
  /** Leave the race and return to the city at the pose captured on entry. */
  onAbort: () => void;
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
 * line the suites assert can never drift apart.
 */
export const RACE_START_POSITION: [number, number, number] = [
  CIRCUS_RACE_START.x,
  CIRCUS_RACE_START.y,
  CIRCUS_RACE_START.z,
];
export const RACE_START_ROTATION_Y = CIRCUS_RACE_START.rotationY;

/**
 * The race camera pose, derived in the layout module from the start line
 * (`CIRCUS_RACE_CAMERA`, where the measurement is recorded): the carceres block
 * stands BEHIND the start line and is 2.18 high, so it would hide the whole
 * chariot from any camera placed there — the camera therefore stands north-east
 * of the model, on the track, looking back at it with the gates as the backdrop.
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

/** Fixed chase view — set once, never per frame (nothing in this slice moves). */
const RaceCameraRig: React.FC = () => {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(
      RACE_CAMERA_POSITION[0],
      RACE_CAMERA_POSITION[1],
      RACE_CAMERA_POSITION[2]
    );
    camera.lookAt(RACE_CAMERA_TARGET[0], RACE_CAMERA_TARGET[1], RACE_CAMERA_TARGET[2]);
  }, [camera]);

  return null;
};

/** The player's chariot, on the start line, facing down the arena's long axis. */
const RaceChariot: React.FC = () => {
  const gltf = useGLTF(CHARIOT_MODEL_URL);

  // Clone: `useGLTF` caches one scene per URL and the workshop holds the same
  // entry, so the cached scene is never touched (the workshop's own rule).
  const body = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  return (
    <group
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
 * reading from the moment `racing` began — the state machine stores no clock.
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

export const RaceScene: React.FC<RaceSceneProps> = ({ onAbort }) => {
  const [raceState, setRaceState] = useState<RaceState>(RACE_INITIAL_STATE);
  const [countdownStep, setCountdownStep] = useState<CountdownStep | null>(COUNTDOWN_STEPS[0]);
  const [showGo, setShowGo] = useState(false);
  const [raceStartedAt, setRaceStartedAt] = useState<number | null>(null);
  const [frameloopMode, setFrameloopMode] = useState<'demand' | 'always'>('demand');

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
            camera={{ position: RACE_CAMERA_POSITION, fov: 50, near: 0.1, far: 160 }}
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
                <RaceChariot />
              </Suspense>
            </ThreeComponentErrorBoundary>

            <RaceCameraRig />
          </Canvas>
        </WebGLContextErrorBoundary>
      </WebGLReadyGuard>

      {/* RACE HUD — the state-derived race clock while `racing`, and the state
          name while the gates are still counting down. */}
      {isRaceRunning(raceState) && (
        <div className="absolute top-0 left-0 right-0 z-20 flex justify-center p-3 sm:p-5 pointer-events-none">
          <div className="flex items-center gap-3 bg-neutral-950/85 border border-amber-600/50 px-4 py-2 rounded-2xl backdrop-blur-md shadow-2xl">
            <span className="text-[10px] font-serif font-black uppercase tracking-widest text-amber-400">
              {raceState === 'racing' ? 'Race Clock' : 'Starting Gates'}
            </span>
            {raceState === 'racing' && raceStartedAt !== null && (
              <RaceClock startedAt={raceStartedAt} />
            )}
          </div>
        </div>
      )}

      {/* ABORT — an oversized touch target, live in both running states, with Esc
          as the desktop extra. */}
      {isRaceRunning(raceState) && (
        <div className="absolute bottom-0 left-0 right-0 z-20 flex justify-end p-4 sm:p-6 pb-[calc(env(safe-area-inset-bottom)+1rem)] pointer-events-none">
          <button
            type="button"
            onClick={handleAbort}
            data-race-action="abort"
            className="pointer-events-auto min-h-[3.5rem] px-6 rounded-2xl bg-gradient-to-r from-red-700 to-red-900 hover:from-red-600 hover:to-red-800 border-2 border-red-400/70 text-amber-50 font-serif font-black text-sm uppercase tracking-wider shadow-[0_0_25px_rgba(220,38,38,0.45)] active:scale-95 transition-all cursor-pointer touch-manipulation"
          >
            Abort race
            <span className="hidden md:inline ml-2 text-[10px] opacity-70">(Esc)</span>
          </button>
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
