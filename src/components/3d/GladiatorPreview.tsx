import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { PlayerAppearance, FighterState } from '../../types/game';
import { DEFAULT_PLAYER_WEAPON } from '../../data/itemsDB';
import { GladiatorMesh } from './GladiatorMesh';
import { CanvasLoadingFallback } from '../ui/AssetLoadingOverlay';
import { WebGLContextErrorBoundary } from '../ui/WebGLContextErrorBoundary';
import { ThreeComponentErrorBoundary } from '../ui/ThreeComponentErrorBoundary';
import { WebGLReadyGuard } from '../ui/WebGLReadyGuard';
import { CanvasWebGLMonitor } from '../ui/CanvasWebGLMonitor';
import { SceneBrightness } from './SceneBrightness';
import { logCanvasWebGLCreated, setupCanvasContextRestoration } from '../../utils/webglContext';
import { CORE_3D_ASSETS } from '../../utils/preloadAssets';

// Ensure assets are preloaded for preview
try {
  CORE_3D_ASSETS.forEach((asset) => useGLTF.preload(asset));
} catch (e) {
  // Silent fallback
}

interface GladiatorPreviewProps {
  appearance: PlayerAppearance;
  isLeftyMode?: boolean;
  /** Called once the preview model has resolved its GLTF dependencies and mounted. */
  onReady?: () => void;
  /** Called when the selected model fails to load or render. */
  onError?: (error: Error) => void;
}

const PreviewReadySignal: React.FC<{ onReady?: () => void }> = ({ onReady }) => {
  const readyCallbackRef = useRef(onReady);
  const didScheduleRef = useRef(false);
  const frameRequestRef = useRef<number | null>(null);

  // Keep the latest callback without restarting readiness when the parent
  // recreates its inline callback during a render.
  useEffect(() => {
    readyCallbackRef.current = onReady;
  }, [onReady]);

  // This mounts only after the selected GLTF model resolves. Wait for the first
  // R3F frame, then one browser frame, before dismissing the loading cover.
  useFrame(() => {
    if (didScheduleRef.current) return;
    didScheduleRef.current = true;
    frameRequestRef.current = requestAnimationFrame(() => {
      frameRequestRef.current = null;
      readyCallbackRef.current?.();
    });
  });

  useEffect(() => () => {
    if (frameRequestRef.current !== null) {
      cancelAnimationFrame(frameRequestRef.current);
      frameRequestRef.current = null;
    }
  }, []);

  return null;
};

export const GladiatorPreview: React.FC<GladiatorPreviewProps> = ({ appearance, isLeftyMode = false, onReady, onError }) => {
  const previewFighter: FighterState = {
    id: 'preview',
    name: 'Preview',
    title: 'Warrior',
    isPlayer: true,
    position: [0, -1.0, 0],
    rotationY: 0,
    health: 100,
    stamina: 100,
    action: 'idle',
    actionTimer: 0,
    isBlocking: false,
    isInvulnerable: false,
    hitFlashTimer: 0,
    stats: {
      strength: 10,
      agility: 10,
      staminaMax: 100,
      staminaRegen: 20,
      defense: 5,
      healthMax: 100,
    },
    loadout: { weapon: DEFAULT_PLAYER_WEAPON },
    comboCount: 0,
    bodyWeightLb: appearance.bodyWeightLb,
    physique: appearance.physique,
    skinColor: appearance.skinColor,
    hairColor: appearance.hairColor,
    tunicColor: appearance.tunicColor,
    crestColor: appearance.crestColor,
    clothingStyle: appearance.clothingStyle,
    characterModel: appearance.characterModel || 'roman_warrior',
    isLeftyMode: isLeftyMode,
  };

  const [frameloopMode, setFrameloopMode] = useState<'demand' | 'always'>('demand');

  useEffect(() => {
    // Start with frameloop="demand" initially, switching to "always" after core 3D assets & context are warm
    const timer = setTimeout(() => {
      setFrameloopMode('always');
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="w-full h-full relative">
      <WebGLReadyGuard sceneName="GladiatorPreview" fallbackTitle="Gladiator Preview WebGL Error">
        <WebGLContextErrorBoundary fallbackTitle="Gladiator Preview WebGL Error" sceneName="GladiatorPreview">
          <Canvas
            shadows
            frameloop={frameloopMode}
            camera={{ position: [0, 1.2, 3.2], fov: 42, near: 0.1, far: 50 }}
            gl={{ antialias: false, powerPreference: 'high-performance' }}
            onCreated={(state) => {
              logCanvasWebGLCreated(state.gl, 'GladiatorPreview');
              setupCanvasContextRestoration(state.gl);
            }}
          >
            <CanvasWebGLMonitor sceneName="GladiatorPreview" />
            {/* C-8.70B §SET-1 — the brightness row, applied on creation and live. */}
            <SceneBrightness />
            <ambientLight intensity={0.7} />
            <directionalLight position={[5, 8, 5]} intensity={1.4} castShadow />
            <directionalLight position={[-4, 3, -4]} intensity={0.5} color="#38bdf8" />

            {/* Roman Carved Marble Plinth Pedestal */}
            <mesh receiveShadow position={[0, -1.05, 0]}>
              <cylinderGeometry args={[1.4, 1.6, 0.2, 24]} />
              <meshStandardMaterial color="#ecd9be" roughness={0.4} />
            </mesh>

            <ThreeComponentErrorBoundary
              key={appearance.characterModel || 'roman_warrior'}
              resetKey={appearance.characterModel || 'roman_warrior'}
              componentName="GladiatorPreviewMesh"
              onError={(error) => onError?.(error)}
            >
              <Suspense fallback={<CanvasLoadingFallback />}>
                <GladiatorMesh
                  key={appearance.characterModel || 'roman_warrior'}
                  fighter={previewFighter}
                  isLeftyMode={isLeftyMode}
                  onError={onError}
                />
                <PreviewReadySignal
                  key={appearance.characterModel || 'roman_warrior'}
                  onReady={onReady}
                />
              </Suspense>
            </ThreeComponentErrorBoundary>
          <OrbitControls
            enablePan={false}
            enableZoom={false}
            minPolarAngle={Math.PI / 3}
            maxPolarAngle={Math.PI / 2}
            autoRotate
            autoRotateSpeed={1.5}
          />
        </Canvas>
      </WebGLContextErrorBoundary>
    </WebGLReadyGuard>
    </div>
  );
};
