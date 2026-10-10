import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { FighterState } from '../../types/game';
import { DEFAULT_PLAYER_WEAPON } from '../../data/itemsDB';
import { GladiatorMesh } from '../3d/GladiatorMesh';
import { CanvasLoadingFallback } from '../ui/AssetLoadingOverlay';
import { ThreeComponentErrorBoundary } from '../ui/ThreeComponentErrorBoundary';

// ---------------------------------------------------------------------------
// Phase 121 — REVERSIBLE SHIELD DIAGNOSTIC HARNESS (development only)
//
// Purpose: inspect the rigged shield at close range in both handedness modes
// and through the mapped dodge/Roll clip, without touching gameplay code, the
// gameplay cameras, the shield math, or the saved profile.
//
// How it stays isolated:
//   * this module is reachable only through the `import.meta.env.DEV` branch in
//     App.tsx, so `vite build` tree-shakes it out of the production bundle;
//   * the exported component additionally returns null when DEV is false;
//   * it renders its own <Canvas> with its own OrbitControls camera — the duel,
//     city and creation cameras are never touched;
//   * handedness and the Roll trigger are component-local state only: no
//     saveProfile(), no localStorage/sessionStorage writes, no URL parameter,
//     no window global. Nothing here can reach the player's profile.
//
// Removal path: delete this file and the two lines in App.tsx (the import and
// the `{import.meta.env.DEV && <ShieldDiagnostics />}` element).
//
// Phase 123 (dev-only): the framing presets were reworked so the default view
// shows the board face together with the gripping hand, wrist and forearm in
// one frame, and the panel viewport is larger. The shield model, its
// constraint, the gameplay cameras and the saved profile are all untouched.
// ---------------------------------------------------------------------------

// Grep target for the production-bundle exclusion check (Phase C.2).
const DIAG_MARKER = 'base44-dev-shield-diagnostics';
// Scutum board colour, as rendered by ShieldModel in GladiatorMesh.
const SHIELD_BOARD_COLOR = 0x881337;
// The same two actions the duel uses; 'dodge' maps to the Roll clip.
const IDLE_ACTION: FighterState['action'] = 'idle';
const ROLL_ACTION: FighterState['action'] = 'dodge';

type DiagView = 'grip' | 'macro' | 'wide';

// Phase 123 — explicit framing presets. Each preset is a deterministic camera
// (distance in metres from the grip, azimuth in degrees off the board's
// outward face normal, elevation in degrees) anchored on the rig's own bones,
// so no preset has to guess which way the fighter faces, and none of them ends
// up behind the fighter.
const VIEW_SPECS: Record<
  DiagView,
  { dist: number; az: number; elev: number; anchor: 'grip' | 'board' }
> = {
  // default: three-quarter grip — board face, gripping hand, wrist and forearm
  // read together, at a mid distance between the old macro and wide views.
  grip: { dist: 1.6, az: 62, elev: 10, anchor: 'grip' },
  // straight-on close-up of the board's outward face (face-orientation check).
  macro: { dist: 0.95, az: 0, elev: 0, anchor: 'board' },
  // same three-quarter angle, pulled back for whole-body context.
  wide: { dist: 2.5, az: 64, elev: 10, anchor: 'grip' },
};
const DEG = Math.PI / 180;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
// OrbitControls' initial target; hoisted so its identity is stable and drei
// re-applies it only on mount — the framer owns the target afterwards.
const INITIAL_TARGET: [number, number, number] = [0, 0.55, 0];

/** The scutum board mesh rendered by ShieldModel (identified by its colour). */
const findBoard = (scene: THREE.Object3D): THREE.Object3D | null => {
  let found: THREE.Object3D | null = null;
  scene.traverse((obj) => {
    if (found) return;
    const mesh = obj as THREE.Mesh;
    const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
    if (mesh.isMesh && mat && mat.color && mat.color.getHex() === SHIELD_BOARD_COLOR) found = obj;
  });
  return found;
};

/** Nearest bone ancestor — the board is portaled into the gripping hand bone. */
const firstBoneAncestor = (obj: THREE.Object3D | null): THREE.Object3D | null => {
  let cur = obj ? obj.parent : null;
  while (cur) {
    if ((cur as THREE.Bone).isBone) return cur;
    cur = cur.parent;
  }
  return null;
};

/** Topmost bone of the chain — the rig root, used as the body anchor. */
const topBoneAncestor = (bone: THREE.Object3D | null): THREE.Object3D | null => {
  let cur = bone;
  while (cur && firstBoneAncestor(cur)) cur = firstBoneAncestor(cur);
  return cur;
};

const btn = (active: boolean) =>
  `rounded border px-1.5 py-0.5 font-mono text-[10px] ${
    active
      ? 'border-amber-400 bg-amber-500/20 text-amber-200'
      : 'border-neutral-600 bg-neutral-900 text-neutral-300 hover:bg-neutral-800'
  }`;

/**
 * Frames the harness camera on the rig's own grip rather than on a guess about
 * the fighter's facing: the board is located by colour, its gripping hand and
 * forearm are read from the bone chain the shield is portaled into, and the
 * selected preset (VIEW_SPECS) then places the camera deterministically. The
 * default 'grip' preset sits on the board's outward side, swung off the face
 * normal toward a side axis perpendicular to the forearm, so the board face,
 * the gripping hand, the wrist and the forearm all read in one view.
 * OrbitControls stays available for manual nudge/zoom.
 */
const ShieldFramer: React.FC<{ view: DiagView; reframeToken: number; lefty: boolean }> = ({
  view,
  reframeToken,
  lefty,
}) => {
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const controlsRef = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const [settled, setSettled] = useState(false);

  // The GLB clone (and the bone-attached board) mount asynchronously. Poll
  // until the board actually exists instead of trusting one fixed delay, so a
  // preset always lands on the rig rather than on an empty scene.
  useEffect(() => {
    const started = performance.now();
    const id = window.setInterval(() => {
      if (findBoard(scene) || performance.now() - started > 8000) {
        window.clearInterval(id);
        setSettled(true);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [scene]);

  useEffect(() => {
    if (!settled) return;
    const board = findBoard(scene);
    if (!board) return;

    // Fresh ancestor matrices (the mixer has already written this frame's pose).
    board.updateWorldMatrix(true, false);

    const boardCenter = new THREE.Vector3();
    const boardQuat = new THREE.Quaternion();
    board.getWorldPosition(boardCenter);
    board.getWorldQuaternion(boardQuat);
    const outward = new THREE.Vector3(0, 0, 1).applyQuaternion(boardQuat).normalize();

    // Walk the same bone chain the shield is portaled into, so the framing
    // follows the actual grip rather than a hard-coded position.
    const handBone = firstBoneAncestor(board);
    const handCenter = handBone
      ? new THREE.Vector3().setFromMatrixPosition(handBone.matrixWorld)
      : boardCenter.clone();
    // The board's outer face must point away from the gripping hand.
    if (outward.dot(handCenter.clone().sub(boardCenter)) > 0) outward.negate();

    const spec = VIEW_SPECS[view];
    const target =
      spec.anchor === 'grip' ? boardCenter.clone().lerp(handCenter, 0.5) : boardCenter.clone();

    // Start from the outward face normal and swing the azimuth toward a side
    // axis perpendicular to the forearm, so the limb reads side-on beside the
    // board instead of disappearing behind it.
    const dir = outward.clone();
    if (spec.az !== 0) {
      const forearm = handBone ? firstBoneAncestor(handBone) : null;
      const armAxis = forearm
        ? new THREE.Vector3().setFromMatrixPosition(forearm.matrixWorld).sub(handCenter)
        : new THREE.Vector3();
      const side = new THREE.Vector3();
      if (armAxis.lengthSq() > 1e-6) side.crossVectors(armAxis.normalize(), outward);
      if (side.lengthSq() < 1e-8) side.crossVectors(WORLD_UP, outward);
      if (side.lengthSq() < 1e-8) side.set(0, 0, 1);
      side.normalize();
      // Swing toward the side the shield hand actually sits on, so the camera
      // clears the torso instead of looking through it.
      const lateral = handCenter.clone().setY(0);
      const rootBone = handBone ? topBoneAncestor(handBone) : null;
      if (rootBone) lateral.sub(new THREE.Vector3().setFromMatrixPosition(rootBone.matrixWorld).setY(0));
      if (lateral.lengthSq() < 1e-6) lateral.copy(handCenter).setY(0);
      if (lateral.lengthSq() < 1e-6) lateral.copy(side);
      if (side.dot(lateral) < 0) side.negate();
      dir.multiplyScalar(Math.cos(spec.az * DEG)).addScaledVector(side, Math.sin(spec.az * DEG));
    }
    dir.addScaledVector(WORLD_UP, Math.tan(spec.elev * DEG)).normalize();

    camera.position.copy(target).addScaledVector(dir, spec.dist);
    camera.lookAt(target);

    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(target);
      controls.update();
    }
    // `lefty` re-aims the camera when the board moves to the other hand.
  }, [settled, view, reframeToken, lefty, scene, camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan
      enableZoom
      minDistance={0.1}
      maxDistance={4}
      target={INITIAL_TARGET}
    />
  );
};

const ShieldDiagnosticsPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  // Diagnostic-local handedness: never read from, or written to, the profile.
  const [lefty, setLefty] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [holdMs, setHoldMs] = useState(1200);
  const [loop, setLoop] = useState(false);
  const [loopMs, setLoopMs] = useState(1400);
  const [view, setView] = useState<DiagView>('grip');
  const [reframeToken, setReframeToken] = useState(0);

  const rollStartRef = useRef(0);
  const rollTimerRef = useRef<number | null>(null);
  const rearmRef = useRef<number | null>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);

  const fighter = useMemo<FighterState>(
    () => ({
      id: 'shield_diagnostic',
      name: 'Diagnostic Subject',
      title: 'Harness',
      isPlayer: true,
      position: [0, 0, 0],
      rotationY: 0,
      health: 100,
      stamina: 100,
      action: IDLE_ACTION,
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
      skinColor: '#f6d8b8',
      hairColor: '#3b2412',
      tunicColor: '#991b1b',
    }),
    [],
  );

  useEffect(
    () => () => {
      if (rollTimerRef.current !== null) window.clearTimeout(rollTimerRef.current);
      if (rearmRef.current !== null) window.clearTimeout(rearmRef.current);
    },
    [],
  );

  const triggerRoll = () => {
    if (rollTimerRef.current !== null) window.clearTimeout(rollTimerRef.current);
    rollStartRef.current = performance.now();
    setRolling(true);
    rollTimerRef.current = window.setTimeout(() => {
      rollTimerRef.current = null;
      setRolling(false);
    }, holdMs);
  };

  // Loop mode re-arms the Roll on an interval. A headless capture can lag the
  // trigger by seconds, so a single one-shot Roll may already have finished
  // before the frame is taken; re-arming keeps a playable Run inside every
  // capture window while leaving the release (transition out) to unchecking.
  useEffect(() => {
    if (!loop) return;
    const interval = window.setInterval(() => {
      setRolling(false);
      if (rearmRef.current !== null) window.clearTimeout(rearmRef.current);
      rearmRef.current = window.setTimeout(() => {
        rearmRef.current = null;
        rollStartRef.current = performance.now();
        setRolling(true);
      }, 60);
    }, Math.max(200, loopMs));
    return () => {
      window.clearInterval(interval);
      if (rearmRef.current !== null) {
        window.clearTimeout(rearmRef.current);
        rearmRef.current = null;
      }
      setRolling(false);
    };
  }, [loop, loopMs]);

  // Live elapsed readout, written straight to the DOM so the canvas subtree is
  // never re-rendered by it.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (readoutRef.current) {
        readoutRef.current.textContent = rolling
          ? `roll +${Math.round(performance.now() - rollStartRef.current)}ms`
          : 'idle';
      }
      raf = window.requestAnimationFrame(tick);
    };
    tick();
    return () => window.cancelAnimationFrame(raf);
  }, [rolling]);

  if (!open) {
    return (
      <button
        data-testid="diag-open"
        onClick={() => setOpen(true)}
        className="fixed bottom-3 left-3 z-[9999] rounded border border-amber-500/60 bg-neutral-900/90 px-2 py-1 font-mono text-[10px] text-amber-300 hover:bg-neutral-800"
      >
        shield diag (dev)
      </button>
    );
  }

  return (
    <div
      data-diag={DIAG_MARKER}
      className="fixed bottom-3 left-3 z-[9999] max-h-[calc(100dvh-1.5rem)] w-[min(92vw,560px)] overflow-y-auto rounded-lg border border-amber-500/50 bg-neutral-950/95 p-2 text-[11px] text-amber-100 shadow-xl"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wide text-amber-400">
          Shield diagnostics · dev only · local state
        </span>
        <button
          data-testid="diag-close"
          onClick={() => setOpen(false)}
          className="rounded border border-neutral-700 px-1.5 text-neutral-300 hover:bg-neutral-800"
        >
          ×
        </button>
      </div>

      <div className="mb-2 h-[min(56vh,420px)] w-full overflow-hidden rounded border border-neutral-700 bg-black">
        <ThreeComponentErrorBoundary
          componentName="ShieldDiagnostics"
          fallback={
            <div className="flex h-full items-center justify-center font-mono text-[10px] text-red-400">
              harness canvas failed
            </div>
          }
        >
          <Canvas
            camera={{ position: [0.55, 0.6, 0.75], fov: 34, near: 0.01, far: 20 }}
            gl={{ antialias: true }}
            frameloop="always"
          >
            <ambientLight intensity={0.9} />
            <directionalLight position={[2, 4, 3]} intensity={1.6} />
            <directionalLight position={[-3, 1, -2]} intensity={0.6} color="#38bdf8" />
            <Suspense fallback={<CanvasLoadingFallback />}>
              <GladiatorMesh
                fighter={fighter}
                isLeftyMode={lefty}
                overrideAction={rolling ? ROLL_ACTION : undefined}
              />
            </Suspense>
            <ShieldFramer view={view} reframeToken={reframeToken} lefty={lefty} />
          </Canvas>
        </ThreeComponentErrorBoundary>
      </div>

      <div className="mb-1 flex items-center gap-1.5">
        <span className="w-16 text-neutral-400">Hands</span>
        <button data-testid="diag-righty" onClick={() => setLefty(false)} className={btn(!lefty)}>
          righty · shield left hand
        </button>
        <button data-testid="diag-lefty" onClick={() => setLefty(true)} className={btn(lefty)}>
          lefty · shield right hand
        </button>
      </div>
      <div data-testid="diag-handedness" className="mb-2 font-mono text-[10px] text-neutral-400">
        {lefty ? 'lefty' : 'righty'} · isLeftyMode prop only (no profile write)
      </div>

      <div className="mb-1 flex items-center gap-1.5">
        <span className="w-16 text-neutral-400">Roll</span>
        <button data-testid="diag-roll" onClick={triggerRoll} className={btn(rolling)}>
          trigger dodge
        </button>
        <label className="flex items-center gap-1 font-mono text-[10px] text-neutral-400">
          hold
          <input
            data-testid="diag-hold-ms"
            type="number"
            min={100}
            step={100}
            value={holdMs}
            onChange={(event) => setHoldMs(Math.max(100, Number(event.target.value) || 100))}
            className="w-14 rounded border border-neutral-700 bg-neutral-900 px-1 font-mono text-[10px] text-amber-100"
          />
          ms
        </label>
      </div>

      <div className="mb-1 flex items-center gap-1.5">
        <label className="flex items-center gap-1 font-mono text-[10px] text-neutral-400">
          <input
            data-testid="diag-loop"
            type="checkbox"
            checked={loop}
            onChange={(event) => setLoop(event.target.checked)}
          />
          loop roll · re-arm every
        </label>
        <input
          data-testid="diag-loop-ms"
          type="number"
          min={200}
          step={100}
          value={loopMs}
          onChange={(event) => setLoopMs(Math.max(200, Number(event.target.value) || 200))}
          className="w-14 rounded border border-neutral-700 bg-neutral-900 px-1 font-mono text-[10px] text-amber-100"
        />
        <span className="font-mono text-[10px] text-neutral-400">ms</span>
      </div>

      <div className="mb-2 font-mono text-[10px] text-neutral-400">
        clip <span data-testid="diag-roll-state" ref={readoutRef} /> · overrideAction{' '}
        {rolling ? "'dodge' → Roll" : 'none → fighter idle'}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="w-16 text-neutral-400">Camera</span>
        <button
          data-testid="diag-view-grip"
          onClick={() => {
            setView('grip');
            setReframeToken((t) => t + 1);
          }}
          className={btn(view === 'grip')}
        >
          grip
        </button>
        <button
          data-testid="diag-view-macro"
          onClick={() => {
            setView('macro');
            setReframeToken((t) => t + 1);
          }}
          className={btn(view === 'macro')}
        >
          macro
        </button>
        <button
          data-testid="diag-view-wide"
          onClick={() => {
            setView('wide');
            setReframeToken((t) => t + 1);
          }}
          className={btn(view === 'wide')}
        >
          wide
        </button>
        <button
          data-testid="diag-reframe"
          onClick={() => setReframeToken((t) => t + 1)}
          className={btn(false)}
        >
          reframe
        </button>
      </div>
      <div className="mt-1 font-mono text-[10px] text-neutral-500">drag = orbit · wheel = zoom</div>
    </div>
  );
};

/**
 * Development-only diagnostic surface. Renders nothing outside a Vite dev
 * build, so no diagnostic control can reach a production bundle.
 */
export const ShieldDiagnostics: React.FC = () =>
  import.meta.env.DEV ? <ShieldDiagnosticsPanel /> : null;

export default ShieldDiagnostics;
