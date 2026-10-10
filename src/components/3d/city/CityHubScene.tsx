import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Sparkles as DreiSparkles, Sky, useGLTF } from '@react-three/drei';
import { PlayerProfile, OpponentConfig, FighterState } from '../../../types/game';
import { IshtarGatehouse } from './IshtarGatehouse';
import { ProcessionAvenue } from './ProcessionAvenue';
import { CityStreets } from './CityStreets';
import { SmithingForge } from './SmithingForge';
import { TrainingYard } from './TrainingYard';
import { CityTavern } from './CityTavern';
import { GeneralStore } from './GeneralStore';
import { CaravanseraiInn } from './CaravanseraiInn';
import { GrandColosseum } from './GrandColosseum';
import { MerchantHouse } from './MerchantHouse';
import { ArmorLeatherWorkshop } from './ArmorLeatherWorkshop';
import { Stable } from './Stable';
import { PublicBathhouse } from './PublicBathhouse';
import { RomanShrine } from './RomanShrine';
import { BountyHall } from './BountyHall';
import { GladiatorAcademy } from './GladiatorAcademy';
import { DoctoreHouse } from './DoctoreHouse';
import { RecordsLibrary } from './RecordsLibrary';
import { GladiatorBarracks } from './GladiatorBarracks';
import { VeteranGladiatorHall } from './VeteranGladiatorHall';
import { ArenaMedicalHouse } from './ArenaMedicalHouse';
import { CityCamera } from './CityCamera';
import { GladiatorMesh } from '../GladiatorMesh';
import { AMBIENT_CHARACTERS } from '../../../data/ambientCharacters';
import { CORE_3D_ASSETS } from '../../../utils/preloadAssets';
import { Banner, SteamParticles, ForgeSmoke, SandDrift } from './EnvironmentalMotion';

// Preload 3D models for instant, seamless city rendering
try {
  CORE_3D_ASSETS.forEach((asset) => useGLTF.preload(asset));
} catch (e) {
  // Silent fallback
}
import {
  resolveCityMovement,
  getNearbyHubLocation,
  HUB_LOCATIONS,
  InteractiveLocation,
} from '../../../utils/cityCollisions';
import { DEFAULT_PLAYER_WEAPON } from '../../../data/itemsDB';
import { calculateTotalStats } from '../../../services/storage';
import { sounds } from '../../../audio/soundEffects';
import { CanvasLoadingFallback } from '../../ui/AssetLoadingOverlay';
import { WebGLContextErrorBoundary } from '../../ui/WebGLContextErrorBoundary';
import { ThreeComponentErrorBoundary } from '../../ui/ThreeComponentErrorBoundary';
import { WebGLReadyGuard } from '../../ui/WebGLReadyGuard';
import { CanvasWebGLMonitor } from '../../ui/CanvasWebGLMonitor';
import { logCanvasWebGLCreated, setupCanvasContextRestoration } from '../../../utils/webglContext';
import {
  Swords,
  Dumbbell,
  ShoppingCart,
  Layers,
  BarChart2,
  Beer,
  Home,
  Shield,
  Coins,
  Trophy,
  Volume2,
  VolumeX,
  Compass,
  MapPin,
  ChevronRight,
  Menu,
  Sparkles as SparklesIcon,
  Cloud,
  Zap,
  Settings,
} from 'lucide-react';

interface CityHubSceneProps {
  playerProfile: PlayerProfile;
  activeOpponent: OpponentConfig;
  onOpenTab: (tabKey: 'tournament' | 'training' | 'shop' | 'gear' | 'stats') => void;
  onEnterDuel: (opponent: OpponentConfig) => void;
  onOpenDriveSync: () => void;
  onToggleMute: () => void;
  isMuted: boolean;
  onReturnToMainMenu: () => void;
  isLeftyMode: boolean;
  onToggleLeftyMode: () => void;
  onOpenSettings?: () => void;
}

export const CityHubScene: React.FC<CityHubSceneProps> = ({
  playerProfile,
  activeOpponent,
  onOpenTab,
  onEnterDuel,
  onOpenDriveSync,
  onToggleMute,
  isMuted,
  onReturnToMainMenu,
  isLeftyMode,
  onToggleLeftyMode,
  onOpenSettings,
}) => {
  // Spawn gracefully in front of the Monumental Town Gate on the open avenue
  const [playerPos, setPlayerPos] = useState<[number, number, number]>([0, 0, 16]);
  const [playerRotY, setPlayerRotY] = useState(Math.PI);
  const [isMoving, setIsMoving] = useState(false);
  const [isAttacking, setIsAttacking] = useState(false);
  const [nearbyLoc, setNearbyLoc] = useState<InteractiveLocation | null>(null);
  const [showNavDrawer, setShowNavDrawer] = useState(false);
  const [frameloopMode, setFrameloopMode] = useState<'demand' | 'always'>('demand');
  const [stableNotice, setStableNotice] = useState<string | null>(null);

  useEffect(() => {
    // Start with frameloop="demand" initially, switching to "always" after core 3D assets & context are warm
    const timer = setTimeout(() => {
      setFrameloopMode('always');
    }, 250);
    return () => clearTimeout(timer);
  }, []);

  // Mutable refs for silky smooth 60fps movement without React re-render cancellation
  const playerPosRef = useRef<[number, number, number]>([0, 0, 16]);
  const playerRotYRef = useRef<number>(Math.PI);
  const cameraYawRef = useRef<number>(Math.PI);
  const lastNearbyIdRef = useRef<string | null>(null);

  // Mobile Virtual Joystick State
  const joystickRef = useRef<HTMLDivElement>(null);
  const [knobPos, setKnobPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchIdRef = useRef<number | null>(null);
  const touchVectorRef = useRef<{ x: number; z: number }>({ x: 0, z: 0 });

  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const lastTimeRef = useRef<number>(performance.now());

  // Interact with nearby landmark or update ambient audio
  useEffect(() => {
    if (nearbyLoc) {
      sounds.playAmbientLoop(nearbyLoc.district.toLowerCase() as any);
    } else {
      sounds.stopAmbient();
    }
    return () => sounds.stopAmbient(); // Cleanup on unmount
  }, [nearbyLoc]);

  // Handle interaction with nearby landmark
  const handleInteract = useCallback(() => {
    if (!nearbyLoc) return;
    sounds.playClick();
    if (nearbyLoc.tabKey === 'tournament') {
      onEnterDuel(activeOpponent);
    } else if (nearbyLoc.tabKey) {
      onOpenTab(nearbyLoc.tabKey);
    } else {
      // Elegant immersive fallback notification for locations with no immediate tab key
      if (nearbyLoc.id === 'doctore_house') {
        setStableNotice(
          "Doctore Tactical House: Chief Doctore is currently supervising advanced conditioning. Advanced tactics and special combat stances will be unlocked soon!"
        );
      } else if (nearbyLoc.id === 'shrine_temple') {
        setStableNotice(
          "Shrine of Fortuna: You offer a quiet prayer at the ancient shrine. The sacred precinct remains still and watchful."
        );
      } else if (nearbyLoc.id === 'gladiator_barracks') {
        setStableNotice(
          "Gladiator Barracks: Recruits rest here between training sessions, keeping their equipment prepared for the arena."
        );
      } else if (nearbyLoc.id === 'veteran_gladiator_hall') {
        setStableNotice(
          "Veteran Gladiator Hall: Old trophies and worn shields line the walls, honoring fighters who survived the arena."
        );
      } else if (nearbyLoc.id === 'arena_medical_house') {
        setStableNotice(
          "Arena Medical House: Bandages, ceramic vessels, and surgical tools are prepared for the arena's wounded."
        );
      } else {
        setStableNotice(
          "Imperial Horse Stable: Under construction by order of the Emperor! Battle mounts, transport carriages, and trade caravan routes are currently being prepared."
        );
      }
      // Auto dismiss after 4 seconds
      setTimeout(() => {
        setStableNotice(null);
      }, 4000);
    }
  }, [nearbyLoc, onEnterDuel, activeOpponent, onOpenTab]);

  // Attack weapon strike
  const handleAttack = useCallback(() => {
    if (isAttacking) return;
    sounds.playSlash();
    setIsAttacking(true);
    setTimeout(() => {
      setIsAttacking(false);
    }, 420);
  }, [isAttacking]);

  // 2-in-1 Dual Action: Interact if near a landmark, Attack if not!
  const handlePrimaryAction = useCallback(() => {
    if (nearbyLoc) {
      handleInteract();
    } else {
      handleAttack();
    }
  }, [nearbyLoc, handleInteract, handleAttack]);

  // Cross-platform PC Keyboard input listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      const key = e.key.toLowerCase();

      if (code === 'KeyW' || key === 'w' || code === 'ArrowUp') keysPressed.current['w'] = true;
      if (code === 'KeyS' || key === 's' || code === 'ArrowDown') keysPressed.current['s'] = true;
      if (code === 'KeyA' || key === 'a' || code === 'ArrowLeft') keysPressed.current['a'] = true;
      if (code === 'KeyD' || key === 'd' || code === 'ArrowRight') keysPressed.current['d'] = true;

      if (code === 'KeyE' || key === 'e' || code === 'Space') {
        e.preventDefault();
        handlePrimaryAction();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      const key = e.key.toLowerCase();

      if (code === 'KeyW' || key === 'w' || code === 'ArrowUp') keysPressed.current['w'] = false;
      if (code === 'KeyS' || key === 's' || code === 'ArrowDown') keysPressed.current['s'] = false;
      if (code === 'KeyA' || key === 'a' || code === 'ArrowLeft') keysPressed.current['a'] = false;
      if (code === 'KeyD' || key === 'd' || code === 'ArrowRight') keysPressed.current['d'] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handlePrimaryAction]);

  // Mobile Virtual Joystick Touch Handlers
  const handleJoystickTouchStart = (e: React.TouchEvent) => {
    if (touchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    touchIdRef.current = touch.identifier;
    handleJoystickTouchMove(e);
  };

  const handleJoystickTouchMove = (e: React.TouchEvent) => {
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
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > maxDist) {
          dx = (dx / dist) * maxDist;
          dy = (dy / dist) * maxDist;
        }

        setKnobPos({ x: dx, y: dy });

        // Normalize direction (Left is negative x, Right is positive x)
        touchVectorRef.current = {
          x: dx / maxDist,
          z: dy / maxDist,
        };
        break;
      }
    }
  };

  const handleJoystickTouchEnd = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchIdRef.current) {
        touchIdRef.current = null;
        setKnobPos({ x: 0, y: 0 });
        touchVectorRef.current = { x: 0, z: 0 };
        break;
      }
    }
  };

  // Continuous, non-stuttering 60fps Movement Loop
  useEffect(() => {
    let animId: number;

    const loop = () => {
      const now = performance.now();
      const delta = Math.min(0.08, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      let inputX = 0;
      let inputZ = 0;

      // Keyboard input
      if (keysPressed.current['w']) inputZ -= 1;
      if (keysPressed.current['s']) inputZ += 1;
      if (keysPressed.current['a']) inputX -= 1;
      if (keysPressed.current['d']) inputX += 1;

      // Mobile joystick input
      if (touchVectorRef.current.x !== 0 || touchVectorRef.current.z !== 0) {
        inputX += touchVectorRef.current.x;
        inputZ += touchVectorRef.current.z;
      }

      if (inputX !== 0 || inputZ !== 0) {
        const rawLen = Math.sqrt(inputX * inputX + inputZ * inputZ);
        const normX = inputX / rawLen;
        const normZ = inputZ / rawLen;
        const mag = Math.min(1, rawLen);

        // Compute camera-relative forward and right vectors based on active camera yaw
        const camYaw = cameraYawRef.current;
        const forwardX = Math.sin(camYaw);
        const forwardZ = Math.cos(camYaw);
        const rightX = -Math.cos(camYaw);
        const rightZ = Math.sin(camYaw);

        // Transform screen/joystick direction into 3D world space
        // normZ < 0 is joystick UP (Forward into screen), normX > 0 is joystick RIGHT
        const worldDx = normX * rightX - normZ * forwardX;
        const worldDz = normX * rightZ - normZ * forwardZ;

        // Grounded, controlled gladiator stride speed with analog control
        const speed = 3.8 * mag;
        const nextPos = resolveCityMovement(playerPosRef.current, worldDx, worldDz, speed, delta);
        playerPosRef.current = nextPos;

        // Smooth angle rotation towards target movement direction
        const targetAngle = Math.atan2(worldDx, worldDz);
        let angleDiff = targetAngle - playerRotYRef.current;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        playerRotYRef.current += angleDiff * Math.min(1, delta * 11.0);

        setPlayerPos([nextPos[0], nextPos[1], nextPos[2]]);
        setPlayerRotY(playerRotYRef.current);
        setIsMoving(true);
      } else {
        setIsMoving(false);
      }

      // Check proximity to landmarks (only update state when changed)
      const found = getNearbyHubLocation(playerPosRef.current);
      const foundId = found ? found.id : null;
      if (foundId !== lastNearbyIdRef.current) {
        lastNearbyIdRef.current = foundId;
        setNearbyLoc(found);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Fast Travel teleport
  const handleFastTravel = (loc: InteractiveLocation) => {
    sounds.playClick();
    const newPos: [number, number, number] = [loc.position[0], 0, loc.position[2] + 2];
    playerPosRef.current = newPos;
    setPlayerPos(newPos);
    setShowNavDrawer(false);
  };

  const calculatedStats = calculateTotalStats(playerProfile);

  const cityPlayerFighter: FighterState = {
    id: 'city_player',
    name: playerProfile.name,
    title: playerProfile.title,
    isPlayer: true,
    position: playerPos,
    rotationY: playerRotY,
    health: calculatedStats.healthMax,
    stamina: calculatedStats.staminaMax,
    action: isAttacking ? 'attack_light' : isMoving ? 'walk' : 'idle',
    actionTimer: 0,
    isBlocking: false,
    isInvulnerable: false,
    hitFlashTimer: 0,
    stats: calculatedStats,
    loadout: { weapon: playerProfile.equipped.weapon || DEFAULT_PLAYER_WEAPON },
    comboCount: 0,
    skinColor: playerProfile.appearance.skinColor,
    hairColor: playerProfile.appearance.hairColor,
    tunicColor: playerProfile.appearance.tunicColor,
    crestColor: playerProfile.appearance.crestColor,
    clothingStyle: playerProfile.appearance.clothingStyle,
    characterModel: playerProfile.appearance.characterModel || 'roman_warrior',
    isLeftyMode: isLeftyMode,
  };

  return (
    <div className="relative w-full h-full min-h-screen bg-neutral-950 overflow-hidden select-none">
      {/* 3D WEBGL 3RD-PERSON CITY CANVAS WITH EXPANDED FOV */}
      <WebGLReadyGuard
        sceneName="CityHubMetropolis"
        fallbackTitle="3D Metropolis WebGL Error"
        onFallbackTo2D={() => onOpenTab('tournament')}
      >
        <WebGLContextErrorBoundary
          fallbackTitle="3D Metropolis WebGL Error"
          sceneName="CityHubMetropolis"
          onFallbackTo2D={() => onOpenTab('tournament')}
        >
          <Canvas
            shadows
            frameloop={frameloopMode}
            camera={{ position: [0, 5, 24], fov: 58, near: 0.1, far: 180 }}
            gl={{ antialias: false, powerPreference: 'high-performance' }}
            onCreated={(state) => {
              logCanvasWebGLCreated(state.gl, 'CityHubMetropolis');
              setupCanvasContextRestoration(state.gl);
            }}
          >
            {/* Active GPU Health & Context Monitor */}
            <CanvasWebGLMonitor sceneName="CityHubMetropolis" />

            {/* Atmospheric Mediterranean Horizon Fog */}
            <fog attach="fog" args={['#e0a96d', 35, 115]} />

            <Sky sunPosition={[45, 30, 25]} turbidity={7} rayleigh={1.8} mieCoefficient={0.005} />
            {/* Phase 24 — Calibrated Mediterranean Sunlight & Contrast */}
            <ambientLight intensity={0.42} color="#fef3c7" />
            <directionalLight
              position={[30, 42, 22]}
              intensity={2.15}
              color="#fffbeb"
              castShadow
              shadow-mapSize={[2048, 2048]}
            />
            <directionalLight position={[-25, 20, -25]} intensity={0.28} color="#7dd3fc" />

            {/* Distant Roman Hills & Aqueduct Backdrop */}
            <ThreeComponentErrorBoundary componentName="CityBackdrop">
              <group position={[0, 0, -65]}>
                {/* Distant Rolling Tuscan Hills */}
                {[-45, -15, 15, 45].map((hx, hi) => (
                  <mesh key={`hill-${hi}`} position={[hx, 8 + (hi % 2) * 4, 0]}>
                    <sphereGeometry args={[26, 16, 12]} />
                    <meshStandardMaterial color="#b45309" roughness={0.9} />
                  </mesh>
                ))}
                {/* Distant Roman Aqueduct Arches on Horizon */}
                {Array.from({ length: 12 }).map((_, ai) => (
                  <group key={`aq-${ai}`} position={[-50 + ai * 9, 7, 12]}>
                    <mesh position={[0, 3, 0]}>
                      <boxGeometry args={[1.4, 7.5, 1.4]} />
                      <meshStandardMaterial color="#ca8a04" roughness={0.8} />
                    </mesh>
                    <mesh position={[4.5, 7.2, 0]}>
                      <boxGeometry args={[9.5, 1.4, 1.6]} />
                      <meshStandardMaterial color="#d97706" roughness={0.8} />
                    </mesh>
                  </group>
                ))}
              </group>
            </ThreeComponentErrorBoundary>

            {/* Floating Atmospheric Desert Dust Particles */}
            <DreiSparkles count={90} scale={[80, 20, 80]} size={2.8} speed={0.35} color="#fef08a" opacity={0.65} />
            <SandDrift />

            {/* 3D Architectural City Components Wrapped in Error Boundary */}
            <ThreeComponentErrorBoundary componentName="CityArchitecturalDistricts">
              <IshtarGatehouse />
              <ProcessionAvenue />
              <CityStreets />
              <SmithingForge />
              <TrainingYard />
              <CityTavern />
              <GeneralStore />
              <CaravanseraiInn />
              <GrandColosseum />
              <MerchantHouse />
              <ArmorLeatherWorkshop />
              <Stable />
              <GladiatorAcademy />
              <DoctoreHouse />
              <RecordsLibrary />
              <PublicBathhouse />
              <RomanShrine />
              <BountyHall />
              <GladiatorBarracks />
              <VeteranGladiatorHall />
              <ArenaMedicalHouse />
            </ThreeComponentErrorBoundary>

            {/* 3D Player Gladiator Model Wrapped in Error Boundary */}
            <ThreeComponentErrorBoundary componentName="CityPlayerGladiator">
              <Suspense fallback={<CanvasLoadingFallback />}>
                <GladiatorMesh fighter={cityPlayerFighter} isLeftyMode={isLeftyMode} />
                {/* Ambient Characters */}
                {AMBIENT_CHARACTERS.map(fighter => (
                    <GladiatorMesh key={fighter.id} fighter={fighter} />
                ))}
              </Suspense>
            </ThreeComponentErrorBoundary>

          {/* ELEVATED 3RD-PERSON CHASE CAMERA WITH HOLD-AND-DRAG ORBIT & PITCH */}
          <CityCamera targetPosition={playerPos} targetRotationY={playerRotY} isMoving={isMoving} cameraYawRef={cameraYawRef} />
        </Canvas>
      </WebGLContextErrorBoundary>
    </WebGLReadyGuard>

      {/* TOP STATUS HEADER BAR */}
      <header className="absolute top-0 left-0 right-0 p-3 sm:p-5 pointer-events-none flex justify-between items-start z-10">
        <div className="flex items-center gap-2 pointer-events-auto bg-neutral-950/85 border border-amber-600/50 p-2 sm:p-3 rounded-2xl backdrop-blur-md shadow-2xl">
          <button
            onClick={() => setShowNavDrawer(!showNavDrawer)}
            className="p-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 cursor-pointer active:scale-95 transition-all"
            title="City Map & Navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <div className="font-serif font-black text-xs sm:text-sm text-amber-100 flex items-center gap-1.5">
              <span>{playerProfile.name}</span>
              <span className="text-[10px] text-amber-400 font-mono bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-700/50">
                LVL {playerProfile.level}
              </span>
            </div>
            <div className="text-[10px] text-neutral-400 font-serif truncate max-w-[130px] sm:max-w-[200px]">
              {playerProfile.title}
            </div>
          </div>
        </div>

        {/* GOLD, FAME, GOOGLE DRIVE & AUDIO */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="flex items-center gap-3 bg-neutral-950/85 border border-amber-600/50 px-3 py-1.5 rounded-2xl backdrop-blur-md shadow-2xl">
            <div className="flex items-center gap-1 text-xs font-bold text-amber-300">
              <Coins className="w-4 h-4 text-yellow-400" />
              <span>{playerProfile.gold}</span>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-purple-300">
              <Trophy className="w-4 h-4 text-purple-400" />
              <span>{playerProfile.fame}</span>
            </div>
          </div>

          {/* SWITCHABLE LEFTY MODE BUTTON */}
          <button
            onClick={onToggleLeftyMode}
            className={`px-3 py-2 rounded-2xl border backdrop-blur-md cursor-pointer active:scale-95 shadow-xl transition-all flex items-center gap-1.5 text-xs font-serif font-bold ${
              isLeftyMode
                ? 'bg-amber-600/90 border-amber-300 text-neutral-950 shadow-[0_0_15px_rgba(245,158,11,0.5)]'
                : 'bg-neutral-950/85 border-amber-600/50 text-amber-300 hover:text-amber-100'
            }`}
            title={isLeftyMode ? 'Lefty Mode: ON (Weapon in Left Hand, Shield in Right)' : 'Lefty Mode: OFF (Weapon in Right Hand, Shield in Left)'}
          >
            <Shield className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isLeftyMode ? 'Lefty Mode: ON' : 'Lefty Mode: OFF'}</span>
            <span className="sm:hidden">{isLeftyMode ? 'Lefty' : 'Righty'}</span>
          </button>

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="p-2.5 rounded-2xl bg-neutral-950/85 border border-amber-500/50 text-amber-300 hover:text-amber-100 backdrop-blur-md cursor-pointer active:scale-95 shadow-xl transition-all"
              title="Game Settings (Lefty Mode, Audio, Controls)"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onOpenDriveSync}
            className="p-2.5 rounded-2xl bg-neutral-950/85 border border-cyan-500/50 text-cyan-300 hover:text-cyan-100 backdrop-blur-md cursor-pointer active:scale-95 shadow-xl transition-all"
            title="Google Drive Cloud Saves"
          >
            <Cloud className="w-4 h-4" />
          </button>

          <button
            onClick={onToggleMute}
            className="p-2.5 rounded-2xl bg-neutral-950/85 border border-amber-600/50 text-amber-300 hover:text-amber-100 backdrop-blur-md cursor-pointer active:scale-95 shadow-xl transition-all"
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
          </button>

          <button
            onClick={onReturnToMainMenu}
            className="px-3 py-2 rounded-2xl bg-neutral-900/90 border border-neutral-700 hover:border-amber-500/60 text-neutral-300 hover:text-amber-200 text-xs font-serif font-bold backdrop-blur-md cursor-pointer active:scale-95 transition-all shadow-xl"
          >
            Main Menu
          </button>
        </div>
      </header>

        {/* MOBILE & PC TOUCH CONTROLS OVERLAY */}
        <div className="absolute inset-0 pointer-events-none z-20 flex justify-between items-end p-4 sm:p-6 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:pb-[calc(env(safe-area-inset-bottom)+1.5rem)] flex-row">
          {/* MOBILE VIRTUAL JOYSTICK */}
          <div className="pointer-events-auto touch-none flex flex-col items-center ml-[env(safe-area-inset-left)] mr-[env(safe-area-inset-right)]">
            <div
              ref={joystickRef}
              onTouchStart={handleJoystickTouchStart}
              onTouchMove={handleJoystickTouchMove}
              onTouchEnd={handleJoystickTouchEnd}
              onTouchCancel={handleJoystickTouchEnd}
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-neutral-950/60 border-2 border-amber-600/50 relative flex items-center justify-center backdrop-blur-md shadow-2xl active:border-amber-400 select-none"
            >
              {/* Direction markers */}
              <div className="absolute top-2 w-1.5 h-1.5 rounded-full bg-amber-500/50"></div>
              <div className="absolute bottom-2 w-1.5 h-1.5 rounded-full bg-amber-500/50"></div>
              <div className="absolute left-2 w-1.5 h-1.5 rounded-full bg-amber-500/50"></div>
              <div className="absolute right-2 w-1.5 h-1.5 rounded-full bg-amber-500/50"></div>

              {/* Inner draggable knob */}
              <div
                className="w-10 h-10 rounded-full bg-gradient-to-b from-amber-500 to-amber-700 border-2 border-amber-300 shadow-lg flex items-center justify-center transition-transform"
                style={{
                  transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
                }}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-amber-200/90"></div>
              </div>
            </div>
          </div>

          {/* 2-IN-1 ATTACK / INTERACT ACTION BUTTON */}
          <div className="pointer-events-auto flex flex-col items-end gap-1.5 mr-[env(safe-area-inset-right)] ml-[env(safe-area-inset-left)]">
            <button
              onTouchStart={(e) => {
                e.preventDefault();
                handlePrimaryAction();
              }}
              onClick={handlePrimaryAction}
              className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full border-2 flex flex-col items-center justify-center shadow-2xl active:scale-90 transition-all cursor-pointer ${
                nearbyLoc
                  ? 'bg-gradient-to-br from-amber-500 via-amber-600 to-yellow-600 border-yellow-300 text-neutral-950 shadow-[0_0_25px_rgba(245,158,11,0.8)] animate-pulse'
                  : 'bg-gradient-to-br from-red-600 via-rose-700 to-red-900 border-red-300 text-white shadow-[0_0_20px_rgba(225,29,72,0.6)]'
              }`}
              title={nearbyLoc ? `Interact with ${nearbyLoc.name} [E / Space]` : 'Attack with Weapon [Space / E]'}
            >
              {nearbyLoc ? (
                <>
                  <SparklesIcon className="w-6 h-6 sm:w-8 sm:h-8 fill-neutral-950 text-neutral-950" />
                  <span className="text-[9px] sm:text-xs font-serif font-black uppercase tracking-wider mt-0.5">
                    ENTER [E]
                  </span>
                </>
              ) : (
                <>
                  <Swords className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                  <span className="text-[9px] sm:text-xs font-serif font-black uppercase tracking-wider mt-0.5">
                    ATTACK
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

      {/* PROXIMITY INTERACTION BANNER (CENTER DESKTOP POPUP) */}
      {nearbyLoc && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-auto animate-bounce hidden sm:block">
          <button
            onClick={handleInteract}
            className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-neutral-950 font-serif font-black text-xs sm:text-sm uppercase tracking-wider shadow-[0_0_25px_rgba(245,158,11,0.7)] border-2 border-amber-200 transition-all active:scale-95 cursor-pointer flex items-center gap-2"
          >
            <SparklesIcon className="w-4 h-4 fill-neutral-950 text-neutral-950" />
            <span>{nearbyLoc.actionPrompt} [E / Space]</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* IMMERSIVE LANDMARK / STABLE NOTICE BANNER */}
      {stableNotice && (
        <div className="absolute top-36 left-1/2 -translate-x-1/2 z-30 pointer-events-auto max-w-sm sm:max-w-md w-[90%] bg-neutral-950/95 border-2 border-amber-500/80 p-4 rounded-2xl backdrop-blur-md shadow-[0_0_30px_rgba(245,158,11,0.4)] animate-fadeIn">
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1">
              <h4 className="font-serif font-black text-amber-200 text-xs sm:text-sm uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-amber-400" />
                <span>Imperial Announcement</span>
              </h4>
              <p className="text-[11px] sm:text-xs text-neutral-300 font-sans leading-relaxed">
                {stableNotice}
              </p>
            </div>
            <button
              onClick={() => setStableNotice(null)}
              className="text-neutral-400 hover:text-amber-200 font-bold text-sm cursor-pointer select-none"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* DESKTOP CONTROLS HELPER BAR */}
      <div className="absolute bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 pointer-events-none hidden md:flex items-center gap-3 text-[11px] font-mono text-amber-200/85 bg-neutral-950/80 py-1.5 px-4 rounded-xl border border-amber-800/60 backdrop-blur-sm z-10 shadow-lg">
        <span><kbd className="bg-neutral-800 text-amber-300 px-1 py-0.5 rounded border border-neutral-700">W A S D / Arrows</kbd> Move</span>
        <span><kbd className="bg-neutral-800 text-amber-300 px-1 py-0.5 rounded border border-neutral-700">Space / E</kbd> 2-in-1 Attack &amp; Interact</span>
      </div>

      {/* BOTTOM DISTRICT FAST-TRAVEL & TAB SHORTCUT BAR */}
      <footer className="absolute bottom-2 left-2 right-2 sm:bottom-4 sm:left-6 sm:right-6 pointer-events-auto z-10">
        <div className="max-w-3xl mx-auto bg-neutral-950/90 border border-amber-600/50 rounded-2xl p-1.5 sm:p-2 backdrop-blur-md shadow-2xl flex flex-wrap items-center justify-between gap-1">
          {[
            { id: 'tournament', label: 'Colosseum', icon: Swords, color: 'text-red-400' },
            { id: 'training', label: 'Training Yard', icon: Dumbbell, color: 'text-orange-400' },
            { id: 'shop', label: 'Smith & Bazaar', icon: ShoppingCart, color: 'text-yellow-400' },
            { id: 'gear', label: 'Armory', icon: Layers, color: 'text-cyan-400' },
            { id: 'stats', label: 'Gladiator Stats', icon: BarChart2, color: 'text-purple-400' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => {
                  sounds.playClick();
                  onOpenTab(item.id as 'tournament' | 'training' | 'shop' | 'gear' | 'stats');
                }}
                className="flex-1 min-w-[54px] py-1.5 sm:py-2 px-1 rounded-xl hover:bg-amber-500/20 text-neutral-300 hover:text-amber-200 flex flex-col items-center justify-center gap-0.5 sm:gap-1 transition-all active:scale-95 cursor-pointer"
              >
                <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${item.color}`} />
                <span className="text-[9px] sm:text-[11px] font-serif font-bold tracking-tight truncate">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </footer>

      {/* QUICK TRAVEL DRAWER */}
      {showNavDrawer && (
        <div className="absolute inset-0 bg-neutral-950/80 backdrop-blur-md z-30 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border-2 border-amber-500/80 rounded-3xl p-5 sm:p-7 max-w-md w-full shadow-2xl animate-fadeIn">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-serif font-black text-amber-200 text-lg flex items-center gap-2">
                <Compass className="w-5 h-5 text-amber-400" />
                <span>City Map &amp; Settings</span>
              </h3>
              <button
                onClick={() => setShowNavDrawer(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-amber-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* HANDEDNESS SETTING (LEFTY MODE) */}
            <div className="mb-3 p-3 rounded-2xl bg-neutral-950/90 border border-amber-600/40 flex items-center justify-between">
              <div>
                <div className="font-serif font-bold text-xs sm:text-sm text-amber-100 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-amber-400" />
                  <span>Lefty Mode</span>
                </div>
                <div className="text-[10px] text-neutral-400 font-sans">
                  {isLeftyMode
                    ? 'Left Hand: Weapon • Right Hand: Shield'
                    : 'Right Hand: Weapon • Left Hand: Shield (Default)'}
                </div>
              </div>
              <button
                onClick={onToggleLeftyMode}
                className={`px-3 py-1.5 rounded-xl font-serif text-xs font-bold transition-all cursor-pointer ${
                  isLeftyMode
                    ? 'bg-amber-500 text-neutral-950 shadow-[0_0_12px_rgba(245,158,11,0.6)]'
                    : 'bg-neutral-800 text-neutral-300 hover:text-amber-200 border border-neutral-700'
                }`}
              >
                {isLeftyMode ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="text-[10px] font-mono uppercase tracking-wider text-amber-400/80 mb-2">
              Districts &amp; Fast Travel
            </div>

            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {HUB_LOCATIONS.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => handleFastTravel(loc)}
                  className="flex items-center justify-between p-3 rounded-xl bg-neutral-950/80 hover:bg-amber-950/60 border border-neutral-800 hover:border-amber-500/60 text-left transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <div className="font-serif font-bold text-xs sm:text-sm text-amber-100 group-hover:text-amber-300">
                        {loc.name}
                      </div>
                      <div className="text-[10px] text-neutral-400 flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] font-mono font-bold text-amber-400/90 bg-amber-950/80 px-1.5 rounded border border-amber-800/60 uppercase">
                          {loc.district}
                        </span>
                        <span className="truncate">{loc.subtitle}</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-500 group-hover:text-amber-300 transition-transform group-hover:translate-x-1" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
