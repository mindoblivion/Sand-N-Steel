import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, Sky, useGLTF } from '@react-three/drei';
import type { FighterState } from '../../../types/game';
import { DEFAULT_PLAYER_WEAPON } from '../../../data/itemsDB';
import { BLUEPRINT_CHECKPOINTS, CITY_LAYOUT_BLUEPRINT } from '../../../data/cityLayoutBlueprint';
import {
  buildBlueprintColliders,
  detectBlueprintLocation,
  resolveBlueprintMovement,
  verifyBlueprintAssetMappings,
  type BlueprintLocationStatus,
} from '../../../utils/cityBlueprintLoader';
import { CORE_3D_ASSETS } from '../../../utils/preloadAssets';
import { applyDeadZone } from '../../../utils/joystickDeadZone';
import { getCityFacingYaw } from '../../../utils/cityFacing';
import { GladiatorMesh } from '../GladiatorMesh';
import { WebGLReadyGuard } from '../../ui/WebGLReadyGuard';
import { WebGLContextErrorBoundary } from '../../ui/WebGLContextErrorBoundary';
import { BlueprintCamera } from './BlueprintCamera';
import {
  BlueprintBuildingsLayer,
  BlueprintGround,
  BlueprintPlaceholderProps,
  BlueprintRoads,
} from './BlueprintBuildings';
import { BlueprintPerimeterWalls } from './BlueprintPerimeterWalls';
import { BlueprintNorthDistricts } from './BlueprintNorthDistricts';

try {
  CORE_3D_ASSETS.forEach((asset) => useGLTF.preload(asset));
} catch {
  // Silent fallback when preloading in headless/non-browser environments
}

const DEFAULT_SPAWN: [number, number, number] = [0, 0, 14];
const DEFAULT_YAW = Math.PI;
const BASE_WALK_SPEED = 5.4;
const SPRINT_SPEED = 11.5;

export const CityBlueprintScene: React.FC = () => {
  const colliders = useMemo(() => buildBlueprintColliders(CITY_LAYOUT_BLUEPRINT), []);
  const mappingReport = useMemo(() => verifyBlueprintAssetMappings(CITY_LAYOUT_BLUEPRINT), []);

  const [playerPos, setPlayerPos] = useState<[number, number, number]>(DEFAULT_SPAWN);
  const [playerRotY, setPlayerRotY] = useState<number>(DEFAULT_YAW);
  const [isMoving, setIsMoving] = useState(false);
  const [isSprinting, setIsSprinting] = useState(false);
  const [showCheckpoints, setShowCheckpoints] = useState(true);
  const [hudStatus, setHudStatus] = useState<BlueprintLocationStatus>(() =>
    detectBlueprintLocation(DEFAULT_SPAWN, CITY_LAYOUT_BLUEPRINT),
  );
  const [hudCoords, setHudCoords] = useState<[number, number, number]>(DEFAULT_SPAWN);
  const [cameraClipped, setCameraClipped] = useState(false);

  const playerPosRef = useRef<[number, number, number]>(DEFAULT_SPAWN);
  const playerRotYRef = useRef<number>(DEFAULT_YAW);
  const cameraYawRef = useRef<number>(DEFAULT_YAW);
  const cameraClippedRef = useRef<boolean>(false);
  const isSprintingRef = useRef<boolean>(false);
  isSprintingRef.current = isSprinting;

  const keysPressed = useRef<Record<string, boolean>>({});
  const isMovingRef = useRef<boolean>(false);
  const lastTimeRef = useRef<number>(performance.now());
  const hudSyncTickRef = useRef<number>(0);

  // Mobile virtual joystick refs
  const joystickRef = useRef<HTMLDivElement>(null);
  const joystickKnobRef = useRef<HTMLDivElement>(null);
  const touchIdRef = useRef<number | null>(null);
  const touchVectorRef = useRef<{ x: number; z: number }>({ x: 0, z: 0 });

  const resetJoystickKnob = useCallback(() => {
    if (joystickKnobRef.current) {
      joystickKnobRef.current.style.transform = 'translate3d(0px, 0px, 0)';
    }
  }, []);

  const handleTeleport = useCallback((pos: [number, number, number], yaw: number) => {
    playerPosRef.current = [...pos] as [number, number, number];
    playerRotYRef.current = yaw;
    setPlayerPos([...pos] as [number, number, number]);
    setPlayerRotY(yaw);
    setHudCoords([...pos] as [number, number, number]);
    setHudStatus(detectBlueprintLocation(pos, CITY_LAYOUT_BLUEPRINT));
  }, []);

  // Keyboard controls (WASD / Arrows + Shift sprint)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      const key = e.key.toLowerCase();
      if (code === 'KeyW' || key === 'w' || code === 'ArrowUp') keysPressed.current['w'] = true;
      if (code === 'KeyS' || key === 's' || code === 'ArrowDown') keysPressed.current['s'] = true;
      if (code === 'KeyA' || key === 'a' || code === 'ArrowLeft') keysPressed.current['a'] = true;
      if (code === 'KeyD' || key === 'd' || code === 'ArrowRight') keysPressed.current['d'] = true;
      if (code === 'ShiftLeft' || code === 'ShiftRight') setIsSprinting(true);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      const key = e.key.toLowerCase();
      if (code === 'KeyW' || key === 'w' || code === 'ArrowUp') keysPressed.current['w'] = false;
      if (code === 'KeyS' || key === 's' || code === 'ArrowDown') keysPressed.current['s'] = false;
      if (code === 'KeyA' || key === 'a' || code === 'ArrowLeft') keysPressed.current['a'] = false;
      if (code === 'KeyD' || key === 'd' || code === 'ArrowRight') keysPressed.current['d'] = false;
      if (code === 'ShiftLeft' || code === 'ShiftRight') setIsSprinting(false);
    };

    const releaseInputs = () => {
      keysPressed.current = {};
      touchIdRef.current = null;
      touchVectorRef.current = { x: 0, z: 0 };
      resetJoystickKnob();
      setIsSprinting(false);
      lastTimeRef.current = performance.now();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        releaseInputs();
      } else {
        lastTimeRef.current = performance.now();
      }
    };
    const onFocus = () => {
      lastTimeRef.current = performance.now();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseInputs);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseInputs);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [resetJoystickKnob]);

  const handleJoystickTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.cancelable) e.preventDefault();
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
        const dist = Math.hypot(dx, dy);
        if (dist > maxDist) {
          dx = (dx / dist) * maxDist;
          dy = (dy / dist) * maxDist;
        }
        if (joystickKnobRef.current) {
          joystickKnobRef.current.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
        }
        const vec = applyDeadZone(dx / maxDist, dy / maxDist);
        touchVectorRef.current = { x: vec.x, z: vec.z };
        break;
      }
    }
  }, []);

  const handleJoystickTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      if (touchIdRef.current !== null) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      touchIdRef.current = touch.identifier;
      handleJoystickTouchMove(e);
    },
    [handleJoystickTouchMove],
  );

  const handleJoystickTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchIdRef.current) {
          touchIdRef.current = null;
          touchVectorRef.current = { x: 0, z: 0 };
          resetJoystickKnob();
          break;
        }
      }
    },
    [resetJoystickKnob],
  );

  // Continuous 60fps movement loop
  useEffect(() => {
    let animId = 0;
    lastTimeRef.current = performance.now();

    const tick = () => {
      const now = performance.now();
      const delta = Math.min(0.08, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      let inputX = 0;
      let inputZ = 0;
      if (keysPressed.current['w']) inputZ -= 1;
      if (keysPressed.current['s']) inputZ += 1;
      if (keysPressed.current['a']) inputX -= 1;
      if (keysPressed.current['d']) inputX += 1;
      if (touchVectorRef.current.x !== 0 || touchVectorRef.current.z !== 0) {
        inputX += touchVectorRef.current.x;
        inputZ += touchVectorRef.current.z;
      }

      if (inputX !== 0 || inputZ !== 0) {
        const rawLen = Math.hypot(inputX, inputZ);
        const normX = inputX / rawLen;
        const normZ = inputZ / rawLen;
        const mag = Math.min(1, rawLen);

        const camYaw = cameraYawRef.current;
        const forwardX = Math.sin(camYaw);
        const forwardZ = Math.cos(camYaw);
        const rightX = -Math.cos(camYaw);
        const rightZ = Math.sin(camYaw);

        const worldDx = normX * rightX - normZ * forwardX;
        const worldDz = normX * rightZ - normZ * forwardZ;
        const speed = (isSprintingRef.current ? SPRINT_SPEED : BASE_WALK_SPEED) * mag;

        const nextPos = resolveBlueprintMovement(
          playerPosRef.current,
          worldDx,
          worldDz,
          speed,
          delta,
          colliders,
        );
        playerPosRef.current = nextPos;

        const targetAngle = getCityFacingYaw(worldDx, worldDz);
        let angleDiff = targetAngle - playerRotYRef.current;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        playerRotYRef.current += angleDiff * Math.min(1, delta * 11.0);

        if (!isMovingRef.current) {
          isMovingRef.current = true;
          setIsMoving(true);
        }
      } else if (isMovingRef.current) {
        isMovingRef.current = false;
        setIsMoving(false);
      }

      // Throttled HUD readout refresh (~5 Hz) to avoid React churn per frame
      if (now - hudSyncTickRef.current > 180) {
        hudSyncTickRef.current = now;
        const pos = playerPosRef.current;
        setHudCoords([
          Math.round(pos[0] * 10) / 10,
          Math.round(pos[1] * 100) / 100,
          Math.round(pos[2] * 10) / 10,
        ]);
        setHudStatus(detectBlueprintLocation(pos, CITY_LAYOUT_BLUEPRINT));
        setCameraClipped(cameraClippedRef.current);
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [colliders]);

  const blueprintPlayerFighter = useMemo<FighterState>(
    () => ({
      id: 'blueprint_explorer',
      name: 'Blueprint Explorer',
      title: 'Tiro',
      isPlayer: true,
      position: playerPos,
      rotationY: playerRotY,
      health: 120,
      stamina: 100,
      action: isMoving ? 'walk' : 'idle',
      actionTimer: 0,
      isBlocking: false,
      isInvulnerable: false,
      hitFlashTimer: 0,
      stats: {
        strength: 12,
        agility: 12,
        stamina: 12,
        staminaMax: 130,
        staminaRegen: 20,
        defense: 10,
        healthMax: 158,
      },
      loadout: { weapon: DEFAULT_PLAYER_WEAPON },
      comboCount: 0,
      skinColor: '#d9a77e',
      hairColor: '#2c1f16',
      tunicColor: '#991b1b',
      crestColor: '#b91c1c',
      clothingStyle: 'roman_tunic',
      characterModel: 'roman_warrior',
    }),
    [playerPos, playerRotY, isMoving],
  );

  const goBackToGame = () => {
    window.location.href = '/';
  };

  return (
    <div className="relative w-full h-full min-h-[100dvh] bg-neutral-950 overflow-hidden select-none">
      <WebGLReadyGuard
        sceneName="CityBlueprint500"
        fallbackTitle="3D City Blueprint Error"
        onFallbackTo2D={goBackToGame}
      >
        <WebGLContextErrorBoundary
          fallbackTitle="3D City Blueprint Error"
          sceneName="CityBlueprint500"
          onFallbackTo2D={goBackToGame}
        >
          <Canvas
            shadows
            dpr={[1, 1.5]}
            camera={{ position: [0, 5, 24], fov: 58, near: 0.1, far: 650 }}
            gl={{ antialias: false, powerPreference: 'high-performance' }}
          >
            <fog attach="fog" args={['#ebd8b7', 145, 520]} />
            <Sky sunPosition={[80, 120, 60]} turbidity={5} rayleigh={1.4} mieCoefficient={0.005} />
            <hemisphereLight color="#dbeafe" groundColor="#8a7a5f" intensity={0.65} />
            <directionalLight
              position={[110, 160, 95]}
              intensity={2.2}
              color="#fff6e0"
              castShadow
              shadow-mapSize={[2048, 2048]}
              shadow-camera-left={-225}
              shadow-camera-right={225}
              shadow-camera-top={225}
              shadow-camera-bottom={-225}
              shadow-camera-near={10}
              shadow-camera-far={480}
              shadow-bias={-0.0005}
              shadow-normalBias={0.02}
            />
            <directionalLight position={[-80, 50, -90]} intensity={0.45} color="#bfdbfe" />

            <Environment resolution={128} frames={1} environmentIntensity={0.35}>
              <Lightformer form="rect" intensity={1.8} color="#fffbeb" position={[80, 120, 60]} scale={[40, 40, 1]} target={[0, 0, 0]} />
              <Lightformer form="rect" intensity={0.4} color="#fef3c7" position={[0, 80, 0]} scale={[120, 120, 1]} target={[0, 0, 0]} />
              <Lightformer form="rect" intensity={0.25} color="#8a7a5f" position={[0, -40, 0]} scale={[120, 120, 1]} target={[0, 0, 0]} />
            </Environment>

            <BlueprintGround />
            <BlueprintRoads />
            <BlueprintPerimeterWalls />
            <BlueprintBuildingsLayer />
            <BlueprintNorthDistricts />
            <BlueprintPlaceholderProps />

            <Suspense fallback={null}>
              <GladiatorMesh
                fighter={blueprintPlayerFighter}
                positionRef={playerPosRef}
                rotationRef={playerRotYRef}
              />
            </Suspense>

            <BlueprintCamera
              targetPosition={playerPos}
              targetPositionRef={playerPosRef}
              targetRotationY={playerRotY}
              isMoving={isMoving}
              cameraYawRef={cameraYawRef}
              colliders={colliders}
              cameraClippedRef={cameraClippedRef}
            />
          </Canvas>
        </WebGLContextErrorBoundary>
      </WebGLReadyGuard>

      {/* TOP-LEFT COMPACT TELEMETRY BAR (no backdrop-blur over WebGL) */}
      <div className="absolute top-3 left-3 z-20 pointer-events-auto max-w-[300px] bg-neutral-950/90 border border-amber-600/50 rounded-xl p-3 text-xs text-amber-100 shadow-xl">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="font-serif font-bold text-amber-300 tracking-wide uppercase text-[11px]">
            500×500 Roman City Blueprint
          </span>
          <button
            type="button"
            onClick={goBackToGame}
            className="px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-[10px] font-mono text-neutral-200 cursor-pointer"
          >
            Exit
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-[10px] text-neutral-300">
          <span>XYZ:</span>
          <span className="text-amber-200">
            {hudCoords[0]}, {hudCoords[1]}, {hudCoords[2]}
          </span>
          <span>District:</span>
          <span className="truncate text-amber-100">{hudStatus.district}</span>
          <span>Road:</span>
          <span className="truncate text-cyan-300">{hudStatus.roadLabel ?? 'Plaza / Verge'}</span>
          <span>Nearest:</span>
          <span className="truncate text-emerald-300">
            {hudStatus.nearestBuilding.name} ({Math.round(hudStatus.nearestBuildingDistance)}u)
          </span>
          <span>Assets / Cam:</span>
          <span className={cameraClipped ? 'text-rose-400' : 'text-emerald-300'}>
            {mappingReport.mappedCount}/{CITY_LAYOUT_BLUEPRINT.buildings.length} ·{' '}
            {cameraClipped ? 'Cam Pulled' : 'Cam Clear'}
          </span>
        </div>

        {hudStatus.nearestShrine && (
          <div className="mt-1.5 px-2 py-1 rounded bg-sky-950/80 border border-sky-600/50 text-[10px] font-mono text-sky-200">
            Near Waypoint: {hudStatus.nearestShrine.label}
          </div>
        )}
      </div>

      {/* TOP-RIGHT COLLAPSIBLE QUICK-CHECK JUMP DOCK */}
      <div className="absolute top-3 right-3 z-20 pointer-events-auto flex flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={() => setShowCheckpoints((prev) => !prev)}
          className="px-3 py-1.5 rounded-lg bg-neutral-950/90 border border-amber-600/50 text-amber-200 font-mono text-[11px] hover:bg-neutral-900 cursor-pointer shadow-lg"
        >
          {showCheckpoints ? '▾ Hide Jump Spots' : '▴ Show Jump Spots'}
        </button>

        {showCheckpoints && (
          <div className="bg-neutral-950/90 border border-amber-600/50 rounded-xl p-2 flex flex-col gap-1 w-48 shadow-xl max-h-[70vh] overflow-y-auto">
            <div className="text-[9px] font-mono uppercase tracking-wider text-amber-400/80 px-1">
              City &amp; Gate Checkpoints
            </div>
            {BLUEPRINT_CHECKPOINTS.map((cp) => (
              <button
                key={cp.id}
                type="button"
                onClick={() => handleTeleport(cp.position, cp.rotationY)}
                className="text-left px-2.5 py-1.5 rounded-lg bg-neutral-900 hover:bg-amber-900/40 border border-neutral-800 hover:border-amber-500/60 text-[11px] font-serif text-amber-100 cursor-pointer transition-colors"
              >
                {cp.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* BOTTOM MOBILE VIRTUAL JOYSTICK & SPRINT BUTTON */}
      <div className="absolute inset-0 pointer-events-none z-20 flex justify-between items-end p-4 sm:p-6">
        <div className="pointer-events-auto touch-none flex flex-col items-center">
          <div
            ref={joystickRef}
            onTouchStart={handleJoystickTouchStart}
            onTouchMove={handleJoystickTouchMove}
            onTouchEnd={handleJoystickTouchEnd}
            onTouchCancel={handleJoystickTouchEnd}
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-neutral-950/75 border-2 border-amber-600/60 relative flex items-center justify-center shadow-2xl select-none"
          >
            <div className="absolute top-2 w-1.5 h-1.5 rounded-full bg-amber-500/50" />
            <div className="absolute bottom-2 w-1.5 h-1.5 rounded-full bg-amber-500/50" />
            <div className="absolute left-2 w-1.5 h-1.5 rounded-full bg-amber-500/50" />
            <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-amber-500/50" />
            <div
              ref={joystickKnobRef}
              className="w-10 h-10 rounded-full bg-amber-600 border-2 border-amber-300 shadow-lg flex items-center justify-center"
              style={{ transform: 'translate3d(0px, 0px, 0)' }}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-amber-100" />
            </div>
          </div>
          <span className="mt-1 font-mono text-[10px] uppercase tracking-wider text-amber-300">
            Move (WASD / Touch)
          </span>
        </div>

        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => setIsSprinting((s) => !s)}
            className={`px-4 py-3 rounded-full border-2 font-serif font-bold text-xs uppercase tracking-wider shadow-xl cursor-pointer transition-colors ${
              isSprinting
                ? 'bg-amber-500 border-amber-200 text-neutral-950'
                : 'bg-neutral-950/85 border-amber-600/60 text-amber-200'
            }`}
          >
            {isSprinting ? 'Sprint: ON [Shift]' : 'Walk [Shift]'}
          </button>
          <span className="font-mono text-[10px] text-neutral-400 hidden sm:block">
            Drag anywhere to orbit camera
          </span>
        </div>
      </div>
    </div>
  );
};
