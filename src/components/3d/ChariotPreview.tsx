import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { CanvasLoadingFallback } from '../ui/AssetLoadingOverlay';
import { WebGLContextErrorBoundary } from '../ui/WebGLContextErrorBoundary';
import { ThreeComponentErrorBoundary } from '../ui/ThreeComponentErrorBoundary';
import { WebGLReadyGuard } from '../ui/WebGLReadyGuard';
import { CanvasWebGLMonitor } from '../ui/CanvasWebGLMonitor';
import { logCanvasWebGLCreated, setupCanvasContextRestoration } from '../../utils/webglContext';
import {
  CHARIOT_MODEL_URL,
  CHARIOT_MODEL_SCALE,
  CHARIOT_STOCK_WHEEL_NODES,
  CHARIOT_WHEEL_KIT_URL,
  CHARIOT_WHEEL_VARIANTS,
  applyChariotFinish,
  getChariotWheelPlacement,
} from '../../utils/chariotGeometry';
import {
  ChariotFinishKey,
  ChariotWheelVariantKey,
  getChariotPartByFinish,
} from '../../data/chariotParts';

/**
 * Phase C-8.66B — the Chariot Workshop's live 3D preview.
 *
 * Loads BOTH assets on demand (this component only ever mounts with the
 * workshop subview, and the 304 KB wheel kit is deliberately absent from
 * `utils/preloadAssets.ts`), mounts the model at the measured game scale,
 * replaces the stock wheels with the audited kit variant, and applies the
 * selected finish as material overrides.
 *
 * Two properties are load-bearing:
 *   • **Only clones are touched.** `useGLTF` caches one scene per URL and other
 *     screens may hold it, so the body is a `clone(true)` and any material a
 *     finish recolors is cloned before its colour changes — the cached scene,
 *     its materials and the GLB bytes are never mutated.
 *   • **The two wheels are two separate clones**, each under its own wrapper
 *     group with its own audited transform.  No side shares an object instance
 *     with the other, so no transform can leak from one wheel to the next.
 *
 * The wheels are never lifted off the axle to hide ground contact: both variants'
 * hubs sit on (±0.70, 0.65, 0), and the reinforced rim's extra 0.0175 of radius
 * therefore reaches 0.0175 lower — the recorded fit discrepancy, which the
 * workshop panel states in words rather than hiding.
 */
export interface ChariotPreviewProps {
  /** Wheel variant to show (the preview selection, not necessarily the equipped one). */
  wheelVariant: ChariotWheelVariantKey;
  /** Finish to show. */
  finish: ChariotFinishKey;
}

const ChariotRig: React.FC<ChariotPreviewProps> = ({ wheelVariant, finish }) => {
  const chariotGltf = useGLTF(CHARIOT_MODEL_URL);
  const wheelKitGltf = useGLTF(CHARIOT_WHEEL_KIT_URL);

  // Body: clone, hide the fitted wheels (the kit set replaces them), apply finish.
  const body = useMemo(() => {
    const clone = chariotGltf.scene.clone(true);
    clone.traverse((object) => {
      if ((CHARIOT_STOCK_WHEEL_NODES as readonly string[]).includes(object.name)) {
        object.visible = false;
      }
    });
    applyChariotFinish(clone, getChariotPartByFinish(finish)?.overrides ?? []);
    return clone;
  }, [chariotGltf.scene, finish]);

  // Wheels: ONE CLONE PER SIDE, each with its own wrapper transform.
  const wheels = useMemo(() => {
    const source = wheelKitGltf.scene.getObjectByName(CHARIOT_WHEEL_VARIANTS[wheelVariant].node);
    return (['left', 'right'] as const).map((side) => ({
      side,
      placement: getChariotWheelPlacement(wheelVariant, side),
      object: source ? source.clone(true) : null,
    }));
  }, [wheelKitGltf.scene, wheelVariant]);

  return (
    <>
      {/* Workshop flagstones — the top face is the model's own y = 0 ground plane. */}
      <mesh receiveShadow position={[0, -0.25, 0]}>
        <cylinderGeometry args={[3.4, 3.6, 0.5, 32]} />
        <meshStandardMaterial color="#8a7f6d" roughness={0.95} />
      </mesh>

      <group scale={CHARIOT_MODEL_SCALE}>
        <primitive object={body} />
        {wheels.map(({ side, placement, object }) =>
          object ? (
            <group
              key={`chariot-wheel-${side}`}
              position={placement.position}
              rotation={[0, placement.rotationY, 0]}
            >
              <primitive object={object} />
            </group>
          ) : null
        )}
      </group>
    </>
  );
};

export const ChariotPreview: React.FC<ChariotPreviewProps> = ({ wheelVariant, finish }) => {
  const [frameloopMode, setFrameloopMode] = useState<'demand' | 'always'>('demand');

  useEffect(() => {
    // Warm-up matches the project's other previews: demand first, then the
    // orbiting control loop.  No React state is written from the render loop.
    const timer = setTimeout(() => setFrameloopMode('always'), 150);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="w-full h-full relative">
      <WebGLReadyGuard sceneName="ChariotPreview" fallbackTitle="Chariot Workshop Preview Unavailable">
        <WebGLContextErrorBoundary sceneName="ChariotPreview" fallbackTitle="Chariot Workshop Preview Unavailable">
          <ThreeComponentErrorBoundary
            componentName="ChariotPreviewScene"
            fallback={
              <div className="w-full h-full min-h-[240px] flex items-center justify-center p-6 text-center bg-neutral-950 border border-amber-700/40 rounded-2xl">
                <p className="text-xs font-serif text-amber-200/80 max-w-xs">
                  The chariot model could not be loaded, so the preview is unavailable. You can still browse,
                  buy and equip parts below.
                </p>
              </div>
            }
          >
            <Canvas
              frameloop={frameloopMode}
              camera={{ position: [2.5, 1.6, 3.2], fov: 40, near: 0.1, far: 60 }}
              gl={{ antialias: false, powerPreference: 'high-performance' }}
              onCreated={(state) => {
                logCanvasWebGLCreated(state.gl, 'ChariotPreview');
                setupCanvasContextRestoration(state.gl);
              }}
            >
              <CanvasWebGLMonitor sceneName="ChariotPreview" />
              <ambientLight intensity={0.75} />
              <directionalLight position={[4, 8, 5]} intensity={1.35} />
              <directionalLight position={[-4, 3, -4]} intensity={0.45} color="#f2c98a" />

              <ThreeComponentErrorBoundary componentName="ChariotPreviewMesh">
                <Suspense fallback={<CanvasLoadingFallback />}>
                  <ChariotRig wheelVariant={wheelVariant} finish={finish} />
                </Suspense>
              </ThreeComponentErrorBoundary>

              <OrbitControls
                target={[0, 0.65, 0]}
                enablePan={false}
                enableZoom={false}
                minPolarAngle={Math.PI / 3.4}
                maxPolarAngle={Math.PI / 2.05}
                autoRotate
                autoRotateSpeed={1.2}
              />
            </Canvas>
          </ThreeComponentErrorBoundary>
        </WebGLContextErrorBoundary>
      </WebGLReadyGuard>
    </div>
  );
};
