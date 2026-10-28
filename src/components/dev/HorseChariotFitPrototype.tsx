import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CanvasLoadingFallback } from '../ui/AssetLoadingOverlay';
import { WebGLContextErrorBoundary } from '../ui/WebGLContextErrorBoundary';
import { ThreeComponentErrorBoundary } from '../ui/ThreeComponentErrorBoundary';
import { WebGLReadyGuard } from '../ui/WebGLReadyGuard';
import { CanvasWebGLMonitor } from '../ui/CanvasWebGLMonitor';
import { logCanvasWebGLCreated, setupCanvasContextRestoration } from '../../utils/webglContext';
import {
  CHARIOT_MODEL_SCALE,
  CHARIOT_MODEL_URL,
  CHARIOT_STOCK_WHEEL_NODES,
  CHARIOT_WHEEL_KIT_URL,
} from '../../utils/chariotGeometry';
import {
  WHEEL_FIT_VARIANTS,
  getFailingWheelFitRules,
  getWheelFitPlacement,
  getWheelFitReport,
  type WheelFitVariantKey,
} from '../../utils/chariotWheelFit';
import { HORSE_STATION_Z, INNER_LANE_X } from '../../utils/chariotTeamFormation';
import {
  BESIDE_STAGING_X,
  BESIDE_STAGING_Z,
  HORSE_FIT_ASSET_URL,
  HORSE_FIT_MEASURED,
  HORSE_FIT_ROTATION_Y,
  HORSE_FIT_SCALE,
  HORSE_FIT_SCALE_MAX,
  HORSE_FIT_SCALE_MIN,
  HORSE_FIT_SCALE_PRESETS,
  HORSE_FIT_TARGET,
  HORSE_FIT_VIEWS,
  HORSE_FIT_VIEW_HALF_HEIGHT,
  HORSE_FIT_VIEW_HALF_WIDTH,
  clampFitScale,
  getChariotGuideSegments,
  getGuideCircles,
  getHorseFitPlacement,
  getHorseFitReadout,
  getHorseGuideSegments,
  type GuideSegment,
  type HorseFitViewId,
} from '../../utils/horseFitPrototype';

/**
 * Horse ↔ chariot fit prototype — DEVELOPMENT-ONLY (Phase C-8.68C).
 *
 * Reachable ONLY when `src/main.tsx` detects the exact `?devHarness=horsefit`
 * query parameter (or the equivalent dev-only scratch flag) in a Vite dev build
 * (`import.meta.env.DEV`).  In that mode main mounts this component INSTEAD OF
 * `<App />`, so the title screen, the real save loader, the city hub, the arena
 * and every normal navigation path never run.
 *
 * WHAT IT IS: a disposable scale-and-alignment viewer.  It loads the *real*
 * weak horse GLB (its own skeleton and materials) and the *real* chariot model,
 * yaws the horse +90° about Y so its forward +X matches the chariot's −Z, and
 * shows one horse in the plan's Biga station plus one in a diagnostic staging
 * lane beside the chariot, at the C-8.68B `Alternative A` scale — with a slider
 * for nearby scales.  Reference guides mark the wheel radius, the yoke height,
 * the draught pole, the ground plane and the horse's withers.
 *
 * WHAT IT IS NOT: racing.  There is no harness, no trace, no yoke pad, no girth
 * and no gait.  The only alignment markers are thin coloured guide LINES, drawn
 * over the model, that cannot be mistaken for a fitting.  The supplied clips are
 * playable for inspection and are labelled with what they actually do (C-8.68A
 * measured 0.000° of leg rotation in both `Walk` and `Gallop`, so neither is a
 * gait); nothing here authors, replaces or edits a clip, and the GLB bytes are
 * untouched.  Nothing is saved, nothing is written, and the player's real save is
 * never read.
 *
 * C-8.68D — the Android visual-fit review's preparation, and nothing beyond it:
 * the two named three-quarter views (`front-` ahead of the horses' heads, `rear-`
 * behind the chariot's wheels) and one fixed framing all three fixed views share,
 * so A (0.5530) / B (0.70) / C (1.00) / D (chariot alone) are compared under the
 * same camera; an exploratory 0.70 preset, labelled as not validated; the horse
 * guides following the horses toggle; and a collapsible panel, because the control
 * box otherwise covers the ground line and the wheel contact.  No scale is chosen
 * here, no geometry, formation constant or asset changes, and the harness still
 * cannot touch a save.  Android visual acceptance remains the user's to make.
 *
 * S8 — the withheld wheel variants' MEASURING SURFACE, and nothing else.  The
 * screen can now mount any of the wheel kit's four variants in place of the
 * model's own fitted wheels, both sides, through `chariotWheelFit`'s audited
 * transform — including the per-side mirror the bladed set needs — and prints
 * that variant's measured fit (radius, tyre bottom, deeper-than-stock, hub, the
 * wheel-Z clearance at its own radius, and which gates fail).  It admits nothing:
 * no catalogue entry, price or slot changed, and the wheel kit is loaded on
 * demand here only, exactly as the workshop preview loads it.
 *
 * Removal: delete this file, `src/utils/horseFitPrototype.ts`,
 * `src/utils/chariotWheelFit.ts` and their suites, and revert the
 * `?devHarness=horsefit` branch in `src/main.tsx`.
 */

/**
 * The prototype's view control: the module's three named comparison views
 * (C-8.68D), plus the free orbit camera, which is the close-inspection path when
 * the fixed framing is too wide to read a detail.
 */
type FitView = HorseFitViewId | 'free';
type FitClip = 'rest' | 'Idle' | 'Walk' | 'Gallop';

/**
 * S8 — which wheel set the measuring surface mounts.  `stock` is the model's own
 * fitted wheels (the screen's original state); every other value mounts a kit
 * variant through `chariotWheelFit`'s audited transform, which is the same
 * arithmetic the workshop preview uses, plus the per-side mirror.
 */
type FitWheel = WheelFitVariantKey | 'stock';

const WHEEL_OPTIONS: Array<{ id: FitWheel; label: string }> = [
  { id: 'stock', label: 'stock' },
  { id: 'standard', label: 'standard' },
  { id: 'reinforced', label: 'reinforced' },
  { id: 'spiked', label: 'spiked (S8)' },
  { id: 'bladed', label: 'bladed (S8)' },
];

/** Every view option the row renders, in comparison order. */
const VIEW_OPTIONS: Array<{ id: FitView; label: string }> = [
  ...HORSE_FIT_VIEWS.map((view) => ({ id: view.id as FitView, label: view.label })),
  { id: 'free', label: 'free (orbit)' },
];

/**
 * Holds the camera on a fixed view.  The distance is solved per viewport so a
 * narrow (phone) canvas still frames the whole chariot and both horses; the free
 * view leaves the camera to OrbitControls.
 */
const CameraRig: React.FC<{ view: FitView }> = ({ view }) => {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const size = useThree((state) => state.size);

  useEffect(() => {
    const preset = HORSE_FIT_VIEWS.find((candidate) => candidate.id === view);
    if (!preset) return;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const distance = Math.max(
      HORSE_FIT_VIEW_HALF_HEIGHT / Math.tan(vFov / 2),
      HORSE_FIT_VIEW_HALF_WIDTH / (Math.tan(vFov / 2) * camera.aspect)
    );
    const dir = new THREE.Vector3(...preset.dir).normalize().multiplyScalar(distance);
    camera.position.set(
      HORSE_FIT_TARGET[0] + dir.x,
      HORSE_FIT_TARGET[1] + dir.y,
      HORSE_FIT_TARGET[2] + dir.z
    );
    camera.lookAt(new THREE.Vector3(...HORSE_FIT_TARGET));
    camera.updateProjectionMatrix();
  }, [view, camera, size.width, size.height]);

  return null;
};

/** One thin diagnostic line.  `depthTest` off, so a guide is never hidden by the model. */
const GuideLine: React.FC<{ segment: GuideSegment }> = ({ segment }) => {
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...segment.from),
      new THREE.Vector3(...segment.to),
    ]);
    return new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({
        color: segment.colour,
        depthTest: false,
        transparent: true,
        opacity: 0.9,
      })
    );
  }, [segment]);

  useEffect(() => () => line.geometry.dispose(), [line]);

  return <primitive object={line} renderOrder={2} name={segment.id} />;
};

/**
 * The guides: the chariot's own references, the wheel discs, and — only while the
 * horses are shown — the horse's stations.  Hiding the horses therefore leaves the
 * wheel radius, the yoke height, the draught pole and the ground plane as the
 * chariot-alone reference the comparison's view D is read against.
 */
const FitGuides: React.FC<{ scale: number; laneX: number; showHorses: boolean }> = ({
  scale,
  laneX,
  showHorses,
}) => {
  const segments = useMemo(
    () => [
      ...getChariotGuideSegments(),
      ...(showHorses ? getHorseGuideSegments(scale, laneX) : []),
    ],
    [scale, laneX, showHorses]
  );
  const circles = useMemo(() => getGuideCircles(), []);

  const circleObjects = useMemo(
    () =>
      circles.map((circle) => {
        const points: THREE.Vector3[] = [];
        for (let i = 0; i <= 64; i++) {
          const angle = (i / 64) * Math.PI * 2;
          points.push(
            new THREE.Vector3(
              circle.centre[0],
              circle.centre[1] + Math.cos(angle) * circle.radius,
              circle.centre[2] + Math.sin(angle) * circle.radius
            )
          );
        }
        return new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({
            color: circle.colour,
            depthTest: false,
            transparent: true,
            opacity: 0.9,
          })
        );
      }),
    [circles]
  );

  useEffect(() => () => circleObjects.forEach((object) => object.geometry.dispose()), [
    circleObjects,
  ]);

  return (
    <group name="fit-guides">
      {segments.map((segment) => (
        <GuideLine key={segment.id} segment={segment} />
      ))}
      {circleObjects.map((object, index) => (
        <primitive key={circles[index].id} object={object} renderOrder={2} name={circles[index].id} />
      ))}
    </group>
  );
};

/**
 * One horse, cloned from the loaded scene with its OWN skeleton (a plain
 * `clone()` would share the original bones, so an animation on one instance
 * would drive them all).  Geometry and materials are shared by reference, which
 * is why three instances cost three skeletons rather than three models.
 */
const HorseInstance: React.FC<{
  source: THREE.Object3D;
  position: [number, number, number];
  scale: number;
  clip: THREE.AnimationClip | null;
  name: string;
}> = ({ source, position, scale, clip, name }) => {
  const root = useMemo(() => cloneSkinned(source), [source]);
  const mixer = useMemo(() => (clip ? new THREE.AnimationMixer(root) : null), [root, clip]);

  useEffect(() => {
    if (!mixer || !clip) return;
    mixer.clipAction(clip).play();
    return () => {
      mixer.stopAllAction();
    };
  }, [mixer, clip]);

  useFrame((_, delta) => {
    mixer?.update(delta);
  });

  return (
    <group name={name} position={position} rotation={[0, HORSE_FIT_ROTATION_Y, 0]} scale={scale}>
      <primitive object={root} />
    </group>
  );
};

const FitScene: React.FC<{
  scale: number;
  view: FitView;
  clip: FitClip;
  showChariot: boolean;
  showHorses: boolean;
  showGuides: boolean;
  showPair: boolean;
  wheelVariant: FitWheel;
  onLoaded: (report: {
    horse: boolean;
    chariot: boolean;
    joints: number;
    meshes: number;
    clips: string[];
  }) => void;
}> = ({
  scale,
  view,
  clip,
  showChariot,
  showHorses,
  showGuides,
  showPair,
  wheelVariant,
  onLoaded,
}) => {
  const horseGltf = useGLTF(HORSE_FIT_ASSET_URL);
  const chariotGltf = useGLTF(CHARIOT_MODEL_URL);
  const wheelKitGltf = useGLTF(CHARIOT_WHEEL_KIT_URL);

  // The chariot as the game ships it: its own fitted wheels, no finish overrides.
  // A kit variant hides them, exactly as the workshop preview does.
  const chariot = useMemo(() => {
    const clone = chariotGltf.scene.clone(true);
    if (wheelVariant !== 'stock') {
      clone.traverse((object) => {
        if ((CHARIOT_STOCK_WHEEL_NODES as readonly string[]).includes(object.name)) {
          object.visible = false;
        }
      });
    }
    return clone;
  }, [chariotGltf.scene, wheelVariant]);

  // S8 — the variant's two wheels, each under its own wrapper: the audited
  // position and yaw, plus the per-side mirror (`scale.x = −1` on the bladed
  // set's right wheel).  One clone per side, so no transform can leak across.
  const wheels = useMemo(() => {
    if (wheelVariant === 'stock') return [];
    const source = wheelKitGltf.scene.getObjectByName(WHEEL_FIT_VARIANTS[wheelVariant].node);
    if (!source) return [];
    return (['left', 'right'] as const).map((side) => ({
      side,
      placement: getWheelFitPlacement(wheelVariant, side),
      object: source.clone(true),
    }));
  }, [wheelKitGltf.scene, wheelVariant]);

  // What the loaded horse actually carries — the evidence the harness reports.
  const horseFacts = useMemo(() => {
    let meshes = 0;
    let joints = 0;
    horseGltf.scene.traverse((object) => {
      const skinned = object as THREE.SkinnedMesh;
      if (!skinned.isSkinnedMesh) return;
      meshes += 1;
      joints = Math.max(joints, skinned.skeleton?.bones.length ?? 0);
    });
    return { meshes, joints, clips: horseGltf.animations.map((animation) => animation.name) };
  }, [horseGltf]);

  useEffect(() => {
    onLoaded({ horse: true, chariot: true, ...horseFacts });
  }, [horseFacts, onLoaded]);

  const activeClip = useMemo(() => {
    if (clip === 'rest') return null;
    return horseGltf.animations.find((animation) => animation.name === clip) ?? null;
  }, [horseGltf.animations, clip]);

  const biga = getHorseFitPlacement(scale, INNER_LANE_X, HORSE_STATION_Z);
  const bigaPair = getHorseFitPlacement(scale, -INNER_LANE_X, HORSE_STATION_Z);
  const beside = getHorseFitPlacement(scale, BESIDE_STAGING_X, BESIDE_STAGING_Z);

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 8, 5]} intensity={1.35} />
      <directionalLight position={[-4, 3, -4]} intensity={0.45} color="#f2c98a" />

      <gridHelper args={[12, 12, '#3f3f46', '#27272a']} position={[0, 0, -1]} name="ground-grid" />

      {showChariot && (
        <group scale={CHARIOT_MODEL_SCALE} name="chariot">
          <primitive object={chariot} />
          {wheels.map(({ side, placement, object }) => (
            <group
              key={`fit-wheel-${side}`}
              name={`fit-wheel-${wheelVariant}-${side}`}
              position={placement.position}
              rotation={[0, placement.rotationY, 0]}
              scale={placement.scale}
            >
              <primitive object={object} />
            </group>
          ))}
        </group>
      )}

      {showHorses && (
        <>
          <HorseInstance
            source={horseGltf.scene}
            position={biga.position}
            scale={biga.scale}
            clip={activeClip}
            name="horse-biga-right"
          />
          {showPair && (
            <HorseInstance
              source={horseGltf.scene}
              position={bigaPair.position}
              scale={bigaPair.scale}
              clip={activeClip}
              name="horse-biga-left"
            />
          )}
          <HorseInstance
            source={horseGltf.scene}
            position={beside.position}
            scale={beside.scale}
            clip={activeClip}
            name="horse-staging"
          />
        </>
      )}

      {showGuides && <FitGuides scale={scale} laneX={INNER_LANE_X} showHorses={showHorses} />}

      <CameraRig view={view} />
      {view === 'free' && <OrbitControls target={HORSE_FIT_TARGET} enablePan />}
    </>
  );
};

const CLIP_LABELS: Record<FitClip, string> = {
  rest: 'rest pose (no animation)',
  Idle: 'Idle — the supplied idle clip (4.0417 s)',
  Walk: 'Walk — supplied clip; legs static (C-8.68A: 0.000° leg rotation) — NOT a gait',
  Gallop: 'Gallop — supplied clip; legs static (C-8.68A: 0.000° leg rotation) — NOT a gait',
};

export const HorseChariotFitPrototype: React.FC = () => {
  // Self-guard: belt-and-suspenders, so a stale import can never render in prod.
  if (!import.meta.env.DEV) return null;

  const [scale, setScale] = useState(HORSE_FIT_SCALE);
  const [view, setView] = useState<FitView>('side');
  const [clip, setClip] = useState<FitClip>('rest');
  const [showChariot, setShowChariot] = useState(true);
  const [showHorses, setShowHorses] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  const [showPair, setShowPair] = useState(false);
  // S8 — the wheel variant this measuring surface mounts (`stock` = the model's own).
  const [wheelVariant, setWheelVariant] = useState<FitWheel>('stock');
  const [frameloopMode, setFrameloopMode] = useState<'demand' | 'always'>('demand');
  // The readout opens with the screen and can be hidden: the control box would
  // otherwise cover the ground line and the wheel contact in the fixed views.
  const [panelOpen, setPanelOpen] = useState(true);
  const [loaded, setLoaded] = useState<{
    horse: boolean;
    chariot: boolean;
    joints: number;
    meshes: number;
    clips: string[];
  }>({ horse: false, chariot: false, joints: 0, meshes: 0, clips: [] });

  useEffect(() => {
    const timer = setTimeout(() => setFrameloopMode('always'), 150);
    return () => clearTimeout(timer);
  }, []);

  const onLoaded = useRef((report: typeof loaded) => setLoaded(report)).current;
  const readout = getHorseFitReadout(scale);
  const placement = getHorseFitPlacement(scale);
  const wheelReport = wheelVariant === 'stock' ? null : getWheelFitReport(wheelVariant);
  const wheelFailing = wheelVariant === 'stock' ? [] : getFailingWheelFitRules(wheelVariant);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 flex flex-col">
      <div className="px-3 pt-3 sm:px-5 sm:pt-4">
        <div className="rounded-2xl border border-cyan-700/60 bg-cyan-950/30 p-3 font-mono text-[11px] leading-relaxed">
          <div className="text-cyan-300 font-bold uppercase tracking-wider mb-1">
            Dev harness — horse ↔ chariot fit prototype (disposable)
          </div>
          <div data-testid="fit-asset">
            asset:{' '}
            <span className="text-amber-200">
              {HORSE_FIT_ASSET_URL} — {HORSE_FIT_MEASURED.joints} joints,{' '}
              {HORSE_FIT_MEASURED.clips.length} clips
            </span>
          </div>
          <div data-testid="fit-loaded">
            loaded: horse={String(loaded.horse)} ({loaded.meshes} skinned meshes, {loaded.joints}{' '}
            joints, clips [{loaded.clips.join(', ')}]) chariot={String(loaded.chariot)}
          </div>
          <div className="text-neutral-400">
            The player’s real save is not read or written; this screen mounts instead of the game.
            No harness, no racing — thin coloured guide lines only.
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-[320px] relative">
        <WebGLReadyGuard sceneName="HorseChariotFitPrototype" fallbackTitle="Fit Prototype Unavailable">
          <WebGLContextErrorBoundary
            sceneName="HorseChariotFitPrototype"
            fallbackTitle="Fit Prototype Unavailable"
          >
            <ThreeComponentErrorBoundary
              componentName="HorseChariotFitScene"
              fallback={
                <div className="w-full h-full min-h-[240px] flex items-center justify-center p-6 text-center bg-neutral-950 border border-amber-700/40 rounded-2xl">
                  <p className="text-xs font-serif text-amber-200/80 max-w-xs">
                    The horse or chariot model could not be loaded, so the fit prototype is
                    unavailable.
                  </p>
                </div>
              }
            >
              <Canvas
                frameloop={frameloopMode}
                camera={{ position: [6.5, 1.2, -1.0], fov: 40, near: 0.1, far: 60 }}
                gl={{ antialias: false, powerPreference: 'high-performance' }}
                onCreated={(state) => {
                  logCanvasWebGLCreated(state.gl, 'HorseChariotFitPrototype');
                  setupCanvasContextRestoration(state.gl);
                }}
              >
                <CanvasWebGLMonitor sceneName="HorseChariotFitPrototype" />
                <ThreeComponentErrorBoundary componentName="HorseChariotFitModels">
                  <Suspense fallback={<CanvasLoadingFallback />}>
                    <FitScene
                      scale={scale}
                      view={view}
                      wheelVariant={wheelVariant}
                      clip={clip}
                      showChariot={showChariot}
                      showHorses={showHorses}
                      showGuides={showGuides}
                      showPair={showPair}
                      onLoaded={onLoaded}
                    />
                  </Suspense>
                </ThreeComponentErrorBoundary>
              </Canvas>
            </ThreeComponentErrorBoundary>
          </WebGLContextErrorBoundary>
        </WebGLReadyGuard>

        <div className="absolute left-3 right-3 bottom-3 sm:left-5 sm:right-5 max-h-[46%] overflow-y-auto rounded-2xl border border-neutral-700/70 bg-neutral-950/90 backdrop-blur p-3 font-mono text-[11px] leading-relaxed">
          <div className="flex flex-wrap gap-2 items-center mb-2">
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.id}
                data-testid={`fit-view-${option.id}`}
                onClick={() => setView(option.id)}
                className={`px-3 py-1.5 rounded-xl border font-bold uppercase tracking-wider cursor-pointer active:scale-95 ${
                  view === option.id
                    ? 'bg-cyan-800/70 border-cyan-400/70 text-cyan-100'
                    : 'bg-neutral-800 border-neutral-600/60 text-neutral-300'
                }`}
              >
                {option.label}
              </button>
            ))}
            {(
              [
                ['chariot', showChariot, setShowChariot],
                ['horses', showHorses, setShowHorses],
                ['guides', showGuides, setShowGuides],
                ['biga pair', showPair, setShowPair],
              ] as const
            ).map(([label, value, setter]) => (
              <label
                key={label}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-neutral-800/70 border border-neutral-600/50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  data-testid={`fit-toggle-${label.replace(' ', '-')}`}
                  checked={value}
                  onChange={(event) => setter(event.target.checked)}
                />
                <span className="uppercase tracking-wider text-neutral-300">{label}</span>
              </label>
            ))}
            <button
              data-testid="fit-panel-toggle"
              onClick={() => setPanelOpen((open) => !open)}
              className="px-2.5 py-1 rounded-lg bg-neutral-800 border border-neutral-600/60 text-neutral-400 uppercase tracking-wider cursor-pointer active:scale-95"
            >
              {panelOpen ? 'hide readout' : 'show readout'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="uppercase tracking-wider text-neutral-400">wheel set (S8)</span>
            {WHEEL_OPTIONS.map((option) => (
              <button
                key={option.id}
                data-testid={`fit-wheel-${option.id}`}
                onClick={() => setWheelVariant(option.id)}
                className={`px-2.5 py-1 rounded-lg border cursor-pointer active:scale-95 ${
                  wheelVariant === option.id
                    ? 'bg-cyan-800/70 border-cyan-400/70 text-cyan-100'
                    : 'bg-neutral-800 border-neutral-600/60 text-neutral-300'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-2">
            <label className="flex items-center gap-2">
              <span className="uppercase tracking-wider text-neutral-400">scale</span>
              <input
                type="range"
                data-testid="fit-scale-slider"
                min={HORSE_FIT_SCALE_MIN}
                max={HORSE_FIT_SCALE_MAX}
                step={0.005}
                value={scale}
                onChange={(event) => setScale(clampFitScale(Number(event.target.value)))}
                className="w-40"
              />
              <span data-testid="fit-scale" className="text-amber-200 font-bold">
                {readout.scale.toFixed(4)}
              </span>
            </label>
            {HORSE_FIT_SCALE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                data-testid={`fit-preset-${preset.id}`}
                onClick={() => setScale(clampFitScale(preset.scale))}
                className="px-2.5 py-1 rounded-lg bg-neutral-800 border border-amber-700/50 text-amber-200 cursor-pointer active:scale-95"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="uppercase tracking-wider text-neutral-400">
              supplied clips (inspection only)
            </span>
            {(['rest', 'Idle', 'Walk', 'Gallop'] as FitClip[]).map((option) => (
              <button
                key={option}
                data-testid={`fit-clip-${option}`}
                onClick={() => setClip(option)}
                className={`px-2.5 py-1 rounded-lg border cursor-pointer active:scale-95 ${
                  clip === option
                    ? 'bg-amber-800/60 border-amber-400/70 text-amber-100'
                    : 'bg-neutral-800 border-neutral-600/60 text-neutral-300'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <div data-testid="fit-clip-label" className="text-neutral-400 mb-2">
            {CLIP_LABELS[clip]}
          </div>

          <div
            data-testid="fit-readout"
            className={`grid sm:grid-cols-2 gap-x-6 gap-y-1 ${panelOpen ? '' : 'hidden'}`}
          >
            <div data-testid="fit-withers">
              withers <span className="text-cyan-300">{readout.withersY.toFixed(4)}</span> vs yoke
              underside 0.9350 — seat{' '}
              <span className={Math.abs(readout.yokeSeat) < 0.02 ? 'text-emerald-300' : 'text-red-300'}>
                {readout.yokeSeat >= 0 ? '+' : ''}
                {readout.yokeSeat.toFixed(4)}
              </span>
            </div>
            <div data-testid="fit-ear">
              ear tip <span className="text-cyan-300">{readout.earTipY.toFixed(4)}</span> vs wheel
              top 1.3350
            </div>
            <div data-testid="fit-barrel">
              barrel ±{readout.barrelHalfWidth.toFixed(4)} · mane ±
              {readout.maneHalfWidth.toFixed(4)} · envelope 0.2500
            </div>
            <div data-testid="fit-length">
              nose→rump {readout.bodyLength.toFixed(4)} · nose Z {readout.noseZ.toFixed(4)} · tail Z{' '}
              {readout.tailTipZ.toFixed(4)}
            </div>
            <div data-testid="fit-pole">
              pole clearance{' '}
              <span className={readout.poleClearance >= 0.1 ? 'text-emerald-300' : 'text-red-300'}>
                {readout.poleClearance.toFixed(4)}
              </span>{' '}
              (rule ≥ 0.1000)
            </div>
            <div data-testid="fit-lane-air">
              lane air (manes){' '}
              <span className={readout.laneAirManes >= 0.15 ? 'text-emerald-300' : 'text-red-300'}>
                {readout.laneAirManes.toFixed(4)}
              </span>{' '}
              (rule ≥ 0.1500)
            </div>
            <div data-testid="fit-rear">
              rear clearance{' '}
              <span className={readout.rearClearance >= 0.1 ? 'text-emerald-300' : 'text-red-300'}>
                {readout.rearClearance.toFixed(4)}
              </span>{' '}
              (rule ≥ 0.1000)
            </div>
            <div data-testid="fit-wheel-band">
              barrel reaches into the wheel band:{' '}
              <span className="text-amber-200">{String(readout.wheelBandOverlap)}</span> — the rear
              rule is what keeps them apart
            </div>
            <div data-testid="fit-team-width">
              Biga width {readout.teamWidth.toFixed(4)} (plan envelope{' '}
              {readout.planTeamWidth.toFixed(4)})
            </div>
            <div data-testid="fit-placement">
              station [{placement.position.map((v) => v.toFixed(4)).join(', ')}] yaw +
              {((HORSE_FIT_ROTATION_Y * 180) / Math.PI).toFixed(0)}° (+X → −Z)
            </div>
          </div>

          <div
            data-testid="fit-status"
            className={`mt-2 font-bold uppercase tracking-wider ${
              readout.ok ? 'text-emerald-300' : 'text-red-300'
            }`}
          >
            {readout.ok
              ? 'every measured rule passes at this scale'
              : `rule(s) failing: ${readout.rules
                  .filter((rule) => !rule.ok)
                  .map((rule) => rule.id)
                  .join(', ')}`}
          </div>
          {wheelReport && (
            <div
              data-testid="fit-wheel-readout"
              className={`mt-2 border-t border-neutral-700/60 pt-2 ${panelOpen ? '' : 'hidden'}`}
            >
              <div>
                wheel <span className="text-amber-200">{wheelVariant}</span> · radius{' '}
                <span className="text-cyan-300">{wheelReport.radius.toFixed(4)}</span> · tyre bottom{' '}
                <span className="text-cyan-300">{wheelReport.sides.right.bottomY.toFixed(4)}</span> ·
                deeper than stock{' '}
                <span
                  className={
                    wheelReport.sides.right.bottomDelta < 0 ? 'text-red-300' : 'text-emerald-300'
                  }
                >
                  {wheelReport.sides.right.bottomDelta.toFixed(4)}
                </span>
              </div>
              <div>
                hub [{wheelReport.sides.right.hub.map((v) => v.toFixed(4)).join(', ')}] · mirror{' '}
                <span className="text-amber-200">
                  {wheelReport.sides.right.mirrored ? 'right wheel (scale.z −1)' : 'none'}
                </span>{' '}
                · wheel-Z clearance at this radius{' '}
                <span className="text-cyan-300">
                  {wheelReport.formation[0].clearances
                    .find((row) => row.id === 'wheel-z-leading-edge')
                    ?.value.toFixed(4)}
                </span>{' '}
                (rule ≥ 0.1000)
              </div>
              <div
                data-testid="fit-wheel-status"
                className={`font-bold uppercase tracking-wider ${
                  wheelReport.ok ? 'text-emerald-300' : 'text-red-300'
                }`}
              >
                {wheelReport.ok
                  ? 'every wheel fit gate passes'
                  : `wheel fit gate(s) failing: ${wheelFailing.join(', ')}`}
              </div>
            </div>
          )}

          <div className={`text-neutral-500 mt-1 ${panelOpen ? '' : 'hidden'}`}>
            <span className="text-neutral-300">side</span> is the exact profile,{' '}
            <span className="text-neutral-300">front ¾</span> stands ahead of the horses’ heads and{' '}
            <span className="text-neutral-300">rear ¾</span> behind the chariot’s wheels — one fixed
            camera for every scale, and{' '}
            <span className="text-neutral-300">chariot</span> alone gives the wheel and yoke
            proportions. Guides: amber = wheel radius/hub, green = yoke height + pegs, orange =
            draught pole, white = ground plane (Y = 0), cyan = horse withers/rear, red = the station
            line, the wheel’s leading edge and the plan’s rear limit.{' '}
            <span className="text-amber-200">
              B (0.70) is an exploratory comparison, not a validated fit
            </span>{' '}
            — the rule line above is its evidence. Asset loading success is not visual acceptance.
          </div>
        </div>
      </div>
    </div>
  );
};
