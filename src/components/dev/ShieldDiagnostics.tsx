import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { FighterState } from '../../types/game';
import { DEFAULT_PLAYER_WEAPON } from '../../data/itemsDB';
import { GladiatorMesh, resolveActionClip } from '../3d/GladiatorMesh';
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
//
// Phase 125 (dev-only, temporary): added the hand-centred 'junction' preset.
// The board is centre-gripped, so the hand sits behind it and can only be seen
// from the grip (inner) side; this preset stands there, beside the arm, and
// aims at the palm using named rig joints instead of the board's colour.
//
// Phase 126 (dev-only, temporary, read-only): added IdleRotationProbe, a
// per-frame measurement of the real board's world rotation. It writes nothing
// to the shield, rig, camera or storage (see the probe's own header below).
//
// Phase 129 (dev-only, temporary): the probe gained an explicitly selected Roll
// mode. Roll is the animation under investigation, so a Roll run must not
// invalidate itself merely because the Roll override is active; instead it
// asserts that the override is running, that the shipped picker resolves
// 'dodge' to 'Roll' and that the board hangs from the correct anatomical hand,
// then measures the real board through that override. The idle mode — including
// its 'rolling' invalidation — is unchanged.
// ---------------------------------------------------------------------------

// Grep target for the production-bundle exclusion check (Phase C.2).
const DIAG_MARKER = 'base44-dev-shield-diagnostics';
// Scutum board colour, as rendered by ShieldModel in GladiatorMesh.
const SHIELD_BOARD_COLOR = 0x881337;
// The same two actions the duel uses; 'dodge' maps to the Roll clip.
const IDLE_ACTION: FighterState['action'] = 'idle';
const ROLL_ACTION: FighterState['action'] = 'dodge';

type DiagView = 'grip' | 'junction' | 'macro' | 'wide';
type ViewSpec = { dist: number; az: number; elev: number; anchor: 'grip' | 'board' | 'junction' };

// Phase 123 — explicit framing presets. Each preset is a deterministic camera
// (distance in metres from the grip, azimuth in degrees off the board's
// outward face normal, elevation in degrees) anchored on the rig's own bones,
// so no preset has to guess which way the fighter faces, and none of them ends
// up behind the fighter.
const VIEW_SPECS: Record<DiagView, ViewSpec> = {
  // default: three-quarter grip — board face, gripping hand, wrist and forearm
  // read together, at a mid distance between the old macro and wide views.
  grip: { dist: 1.6, az: 62, elev: 10, anchor: 'grip' },
  // Phase 125: hand-centred. az 130 = 50° off the board's INNER normal, swung
  // laterally (away from the body midline), so the palm, wrist and forearm
  // read against a three-quarter view of the board's grip-side face. The
  // distance sits between 'macro' (0.95) and 'grip' (1.6).
  junction: { dist: 1.2, az: 130, elev: 20, anchor: 'junction' },
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

/**
 * Phase 125 — 'junction' framing from the rig's real joints (66-joint UE
 * skeleton: lowerarm_* → hand_* → middle_01_* …). The shield hand is looked
 * up by bone name using GladiatorMesh's anatomical assignment (righty →
 * hand_l, lefty → hand_r); the wrist is that bone's origin, the palm is the
 * midpoint to its middle_01_* knuckle child, the forearm is its lowerarm_*
 * parent and the board is the non-bone group portaled into that bone. The
 * board's colour is used only to cross-check the attachment in the readout,
 * never to locate the hand.
 */
const frameJunction = (
  scene: THREE.Object3D,
  lefty: boolean,
  spec: ViewSpec,
):
  | {
      position: THREE.Vector3;
      target: THREE.Vector3;
      readout: string;
      checkpoints: Record<string, THREE.Vector3>;
      boardCenter: THREE.Vector3;
      outward: THREE.Vector3;
    }
  | { error: string } => {
  const handName = lefty ? 'hand_r' : 'hand_l';
  const hand = scene.getObjectByName(handName);
  if (!hand || !(hand as THREE.Bone).isBone) return { error: `junction · no ${handName} bone in rig` };
  const forearm = hand.parent && (hand.parent as THREE.Bone).isBone ? hand.parent : null;
  const knuckle = hand.children.find((c) => (c as THREE.Bone).isBone && c.name.startsWith('middle_01'));
  const shield = hand.children.find((c) => !(c as THREE.Bone).isBone);
  if (!forearm || !shield) {
    return { error: `junction · ${handName} has no ${forearm ? 'portaled shield' : 'forearm parent'}` };
  }

  hand.updateWorldMatrix(true, true);
  const wrist = new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld);
  const knuckles = knuckle ? new THREE.Vector3().setFromMatrixPosition(knuckle.matrixWorld) : wrist.clone();
  const elbow = new THREE.Vector3().setFromMatrixPosition(forearm.matrixWorld);
  const palm = wrist.clone().lerp(knuckles, 0.5);
  const boardCenter = new THREE.Box3().setFromObject(shield).getCenter(new THREE.Vector3());
  const outward = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(shield.getWorldQuaternion(new THREE.Quaternion()))
    .normalize();
  if (outward.dot(boardCenter.clone().sub(wrist)) < 0) outward.negate();

  // Lateral = away from the body midline (rig root) within the board plane, so
  // the camera stands beside the arm instead of looking through the torso.
  const root = topBoneAncestor(hand);
  const away = wrist.clone().setY(0);
  if (root) away.sub(new THREE.Vector3().setFromMatrixPosition(root.matrixWorld).setY(0));
  const lateral = away.clone().addScaledVector(outward, -away.dot(outward));
  if (lateral.lengthSq() < 1e-6) {
    lateral.crossVectors(WORLD_UP, outward);
    if (lateral.dot(away) < 0) lateral.negate();
  }
  lateral.normalize();

  const dir = outward
    .clone()
    .multiplyScalar(Math.cos(spec.az * DEG))
    .addScaledVector(lateral, Math.sin(spec.az * DEG))
    .addScaledVector(WORLD_UP, Math.tan(spec.elev * DEG))
    .normalize();

  const boardBone = firstBoneAncestor(findBoard(scene));
  const attach = boardBone === hand ? '✓' : `✗ (${boardBone?.name ?? 'none'})`;
  return {
    position: palm.clone().addScaledVector(dir, spec.dist),
    target: palm,
    readout:
      `junction · palm ${handName}→${knuckle?.name ?? 'wrist only'} · forearm ${forearm.name}` +
      ` · board on ${handName} ${attach}`,
    checkpoints: { wrist, knuckles, elbow, board: boardCenter },
    boardCenter,
    outward,
  };
};

/**
 * Geometry-only frame check for the junction preset: projects the named joints
 * through the harness camera (in frame or not) and reports which board face
 * the camera sees and how far off its normal. Says nothing about occlusion —
 * that still needs eyes on the frame.
 */
const junctionFrameCheck = (
  camera: THREE.Camera,
  checkpoints: Record<string, THREE.Vector3>,
  boardCenter: THREE.Vector3,
  outward: THREE.Vector3,
): string => {
  camera.updateMatrixWorld();
  const marks = Object.entries(checkpoints).map(([name, p]) => {
    const ndc = p.clone().project(camera);
    return `${name} ${Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && ndc.z < 1 ? '✓' : '✗'}`;
  });
  const toCam = camera.position.clone().sub(boardCenter).normalize();
  const cosOut = toCam.dot(outward);
  const face = cosOut >= 0 ? 'outer' : 'grip-side';
  const offNormal = Math.round(Math.acos(Math.min(1, Math.abs(cosOut))) / DEG);
  return `in frame: ${marks.join(' ')} · sees ${face} face ${offNormal}° off normal`;
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
const ShieldFramer: React.FC<{
  view: DiagView;
  reframeToken: number;
  lefty: boolean;
  anchorsRef: React.RefObject<HTMLDivElement | null>;
}> = ({ view, reframeToken, lefty, anchorsRef }) => {
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
    const spec = VIEW_SPECS[view];
    const report = (text: string) => {
      if (anchorsRef.current) anchorsRef.current.textContent = text;
    };
    const aim = (position: THREE.Vector3, target: THREE.Vector3) => {
      camera.position.copy(position);
      camera.lookAt(target);
      const controls = controlsRef.current;
      if (controls) {
        controls.target.copy(target);
        controls.update();
      }
    };

    if (spec.anchor === 'junction') {
      const framed = frameJunction(scene, lefty, spec);
      if ('error' in framed) {
        report(framed.error);
        return;
      }
      aim(framed.position, framed.target);
      report(
        `${framed.readout} · ${junctionFrameCheck(camera, framed.checkpoints, framed.boardCenter, framed.outward)}`,
      );
      return;
    }

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

    report(`${view} · board (colour) → ${handBone?.name ?? 'no bone'}`);
    aim(target.clone().addScaledVector(dir, spec.dist), target);
    // `lefty` re-aims the camera when the board moves to the other hand.
  }, [settled, view, reframeToken, lefty, scene, camera, anchorsRef]);

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

// ---------------------------------------------------------------------------
// Phase 126 — READ-ONLY IDLE ROTATION PROBE (development only, temporary)
//
// Samples the real shield board's world rotation on every rendered frame and
// reports angular statistics. Nothing is written to the shield, the rig, the
// camera or storage; the only hook is the harness board mesh's own
// onAfterRender callback, saved before the run and restored after it.
//
// Ordering: R3F runs every useFrame subscriber (drei's mixer update, then the
// GladiatorMesh constraint) and only then renders; three.js recomputes world
// matrices at the start of render() and calls onAfterRender after drawing the
// mesh, so each sample is the final, displayed transform of that frame. The
// probe's own useFrame (priority -1, ahead of both) snapshots the hand and
// shield-group LOCAL rotations so each run also proves that the mixer and the
// constraint actually wrote them before the sample was taken.
// ---------------------------------------------------------------------------
const PROBE_SETTLE_MS = 1500;
const PROBE_SAMPLE_MS = 8500;
// Mirror of GladiatorMesh's SHIELD_BASE_Q_RIGHTY / SHIELD_BASE_Q_LEFTY (Euler
// XYZ). Used only for the constraint-off counterfactual: with the constraint
// off, the board's world rotation is exactly hand world × this base.
const PROBE_BASE_Q = {
  righty: new THREE.Quaternion().setFromEuler(new THREE.Euler(-2.42, -0.67, 2.91, 'XYZ')),
  lefty: new THREE.Quaternion().setFromEuler(new THREE.Euler(3.02, 1.28, -1.06, 'XYZ')),
};

const _probeRel = new THREE.Quaternion();
/** Angle of the rotation taking a to b, in degrees. Sign-safe: q and −q are 0° apart. */
const quatAngleDeg = (a: THREE.Quaternion, b: THREE.Quaternion) => {
  _probeRel.copy(a).invert().multiply(b);
  return (2 * Math.atan2(Math.hypot(_probeRel.x, _probeRel.y, _probeRel.z), Math.abs(_probeRel.w))) / DEG;
};
const vecAngleDeg = (a: THREE.Vector3, b: THREE.Vector3) =>
  Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1)) / DEG;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Frame-to-frame step and drift-from-start statistics for one rotation series. */
const orientationStats = (
  qs: THREE.Quaternion[],
  ts: number[],
  axes?: { normal: THREE.Vector3; up: THREE.Vector3 },
) => {
  let stepMin = Infinity;
  let stepMax = 0;
  let stepMaxAtMs = 0;
  let devMax = 0;
  for (let i = 0; i < qs.length; i++) {
    devMax = Math.max(devMax, quatAngleDeg(qs[0], qs[i]));
    if (i === 0) continue;
    const step = quatAngleDeg(qs[i - 1], qs[i]);
    stepMin = Math.min(stepMin, step);
    if (step > stepMax) {
      stepMax = step;
      stepMaxAtMs = ts[i];
    }
  }
  const rotation = {
    stepMinDeg: r3(stepMin),
    stepMaxDeg: r3(stepMax),
    stepMaxAtMs: Math.round(stepMaxAtMs),
    devFromStartMaxDeg: r3(devMax),
  };
  if (!axes) return rotation;

  // Face normal / up drift, opposite-hemisphere crossings and tilt from world up.
  const n0 = axes.normal.clone().applyQuaternion(qs[0]);
  const u0 = axes.up.clone().applyQuaternion(qs[0]);
  const n = new THREE.Vector3();
  const u = new THREE.Vector3();
  let normalDevMax = 0;
  let upDevMax = 0;
  let minNormalDot = 1;
  let crossings = 0;
  let side = 1;
  let tiltMin = 180;
  let tiltMax = 0;
  for (const q of qs) {
    n.copy(axes.normal).applyQuaternion(q);
    u.copy(axes.up).applyQuaternion(q);
    const d = n.dot(n0);
    minNormalDot = Math.min(minNormalDot, d);
    const s = d >= 0 ? 1 : -1;
    if (s !== side) crossings++;
    side = s;
    normalDevMax = Math.max(normalDevMax, vecAngleDeg(n, n0));
    upDevMax = Math.max(upDevMax, vecAngleDeg(u, u0));
    const tilt = vecAngleDeg(u, WORLD_UP);
    tiltMin = Math.min(tiltMin, tilt);
    tiltMax = Math.max(tiltMax, tilt);
  }
  return {
    ...rotation,
    normalDevMaxDeg: r3(normalDevMax),
    upDevMaxDeg: r3(upDevMax),
    minNormalDotWithStart: r3(minNormalDot),
    normalHemisphereCrossings: crossings,
    upTiltFromWorldUpDeg: [r3(tiltMin), r3(tiltMax)],
  };
};

type ProbeMode = 'idle' | 'roll';

/** One run's mode label, used in the report line and in the dataset. */
const PROBE_CLIP_LABEL: Record<ProbeMode, string> = {
  idle: 'idle (overrideAction none)',
  roll: "dodge → Roll (overrideAction 'dodge')",
};

/**
 * Phase 129 — sampling-interval statistics. A run can only report per-frame
 * motion while frames are actually being sampled: a stalled preview leaves
 * multi-hundred-millisecond gaps, and the board's "step" across such a gap is
 * not a single-frame motion. `sparse` flags that case so sparse samples are
 * never presented as per-frame data.
 */
const intervalStats = (ts: number[]) => {
  if (ts.length < 2) {
    return {
      minMs: 0,
      meanMs: 0,
      maxMs: 0,
      maxAtMs: 0,
      outlierThresholdMs: 0,
      maxGapOutlier: true,
      lowFrameRate: true,
      sparse: true,
      sparseReason: 'fewer than two samples',
    };
  }
  let min = Infinity;
  let max = 0;
  let maxAt = 0;
  for (let i = 1; i < ts.length; i++) {
    const gap = ts[i] - ts[i - 1];
    if (gap < min) min = gap;
    if (gap > max) {
      max = gap;
      maxAt = ts[i];
    }
  }
  const mean = (ts[ts.length - 1] - ts[0]) / (ts.length - 1);
  // Two distinct ways a step stops being "per-frame": one outlier gap, or a run
  // whose frames are themselves so long (>100 ms, i.e. below 10 fps) that a
  // single step spans a large slice of animation. Both are flagged by name.
  const outlierThresholdMs = Math.max(100, 3 * mean);
  const maxGapOutlier = max > outlierThresholdMs;
  const lowFrameRate = mean > 100;
  return {
    minMs: r3(min),
    meanMs: r3(mean),
    maxMs: r3(max),
    maxAtMs: Math.round(maxAt),
    outlierThresholdMs: r3(outlierThresholdMs),
    maxGapOutlier,
    lowFrameRate,
    sparse: maxGapOutlier || lowFrameRate,
    sparseReason: maxGapOutlier
      ? `large gap ${r3(max)} ms > ${r3(outlierThresholdMs)} ms`
      : lowFrameRate
        ? `low frame rate: mean sample interval ${r3(mean)} ms (~${r3(1000 / mean)} fps)`
        : null,
  };
};

type ProbeRun = {
  hand: THREE.Object3D;
  group: THREE.Object3D;
  lefty: boolean;
  mode: ProbeMode;
  invalid: string | null;
  preHandQ: THREE.Quaternion;
  preGroupQ: THREE.Quaternion;
  preValid: boolean;
  sampling: boolean;
  ticks: number;
  overrideSamples: number;
  offOverrideSamples: number;
  sawOverrideDuringSettle: boolean;
};

/**
 * Phase 126 (idle) / Phase 129 (roll) rotation probe. One component, two
 * explicitly selected modes: `idle` reproduces the Phase 126 behaviour exactly
 * (including its rejection of any sample taken while the Roll override is
 * active), while `roll` expects that override and measures the board through
 * it. The board, the mixer ordering and the statistics are identical; only the
 * pre-flight expectations and the invalidation rules differ.
 */
const ShieldRotationProbe: React.FC<{
  token: number;
  mode: ProbeMode;
  lefty: boolean;
  rolling: boolean;
  /** Clip the shipped picker resolves for 'dodge' (null while clips load). */
  expectedClip: string | null;
  resultRef: React.RefObject<HTMLDivElement | null>;
}> = ({ token, mode, lefty, rolling, expectedClip, resultRef }) => {
  const scene = useThree((state) => state.scene);
  const runRef = useRef<ProbeRun | null>(null);
  const guardRef = useRef({ lefty, rolling });
  useEffect(() => {
    guardRef.current = { lefty, rolling };
  }, [lefty, rolling]);

  // priority -1: ahead of drei's mixer update and the GladiatorMesh constraint
  // (both priority 0); R3F's automatic render still follows (only > 0 stops it).
  useFrame(() => {
    const run = runRef.current;
    if (!run) return;
    // Roll mode EXPECTS the override — that is the animation under test — so
    // only the idle mode rejects a sample taken while it is active, exactly as
    // Phase 126 did.
    if (run.mode === 'idle' && guardRef.current.rolling) run.invalid = 'Roll triggered during the run';
    if (guardRef.current.lefty !== run.lefty) run.invalid = 'handedness changed during the run';
    // Roll mode: did the override run at any point during the settle window?
    // (Checked before the first sample, see the sample hook below.)
    if (run.mode === 'roll' && !run.sampling && guardRef.current.rolling) run.sawOverrideDuringSettle = true;
    if (run.sampling) run.ticks++;
    run.preHandQ.copy(run.hand.quaternion);
    run.preGroupQ.copy(run.group.quaternion);
    run.preValid = true;
  }, -1);

  useEffect(() => {
    if (!token) return;
    const report = (text: string, data?: object) => {
      const el = resultRef.current;
      if (!el) return;
      el.textContent = text;
      if (data) el.dataset.result = JSON.stringify(data);
      else delete el.dataset.result;
    };

    // The real board: shield hand (by bone name) → portaled ShieldModel group →
    // its largest box mesh. No colour lookup.
    const handName = lefty ? 'hand_r' : 'hand_l';
    const hand = scene.getObjectByName(handName);
    const group = hand?.children.find((c) => !(c as THREE.Bone).isBone);
    const boxes: THREE.Mesh[] = [];
    group?.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry instanceof THREE.BoxGeometry) boxes.push(m);
    });
    const volume = (m: THREE.Mesh) => {
      const p = (m.geometry as THREE.BoxGeometry).parameters;
      return p.width * p.height * p.depth;
    };
    const board = boxes.sort((a, b) => volume(b) - volume(a))[0];
    if (!hand || !(hand as THREE.Bone).isBone || !group || !board) {
      report(`measure · blocked: no ${handName} → shield board in the harness rig`);
      return;
    }

    // Phase 129 — Roll mode pre-flight. Nothing is installed (no run created,
    // no frame hook) unless the override that IS the subject of the run is
    // already live and the shipped picker really resolves dodge to 'Roll'.
    if (mode === 'roll') {
      // Liveness of the Roll override is validated across the settle window
      // (below), not at the instant of the click: loop mode re-arms on its own
      // interval, so a click can legitimately land in the brief re-arm gap.
      if (!expectedClip) {
        report('measure · blocked: clip list not loaded yet');
        return;
      }
      if (expectedClip !== 'Roll') {
        report(`measure · blocked: shipped picker resolves dodge to '${expectedClip}', expected 'Roll'`);
        return;
      }
    }

    // Local axes from the geometry itself: thinnest box dimension = face
    // normal, longest = up; the boss sphere marks the outward side.
    const p = (board.geometry as THREE.BoxGeometry).parameters;
    const dims = [p.width, p.height, p.depth];
    const normalIdx = dims.indexOf(Math.min(...dims));
    const upIdx = dims.indexOf(Math.max(...dims));
    const normal = new THREE.Vector3().setComponent(normalIdx, 1);
    const up = new THREE.Vector3().setComponent(upIdx, 1);
    const boss = board.parent?.children.find(
      (c) => (c as THREE.Mesh).isMesh && (c as THREE.Mesh).geometry instanceof THREE.SphereGeometry,
    );
    const bossSide = boss
      ? Math.sign(boss.position.getComponent(normalIdx) - board.position.getComponent(normalIdx))
      : 0;
    if (bossSide < 0) normal.negate();
    board.updateWorldMatrix(true, false);
    const handInBoard = board.worldToLocal(new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld));
    const handSide = Math.sign(handInBoard.getComponent(normalIdx));
    let sameBoxes = 0;
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !(m.geometry instanceof THREE.BoxGeometry)) return;
      const q = m.geometry.parameters;
      if (q.width === p.width && q.height === p.height && q.depth === p.depth) sameBoxes++;
    });

    const run: ProbeRun = {
      hand,
      group,
      lefty,
      mode,
      invalid: null,
      preHandQ: new THREE.Quaternion(),
      preGroupQ: new THREE.Quaternion(),
      preValid: false,
      sampling: false,
      ticks: 0,
      overrideSamples: 0,
      offOverrideSamples: 0,
      sawOverrideDuringSettle: false,
    };
    runRef.current = run;

    const boardQ: THREE.Quaternion[] = [];
    const handQ: THREE.Quaternion[] = [];
    const ts: number[] = [];
    let compared = 0;
    let mixerBefore = 0;
    let constraintBefore = 0;
    let hierarchyResidual = 0;
    let boardScaleSkew = 0;
    let handScaleSkew = 0;
    let maxGap = 0;
    let lastFrame = -1;
    let tStart = 0;
    let done = false;
    const t0 = performance.now();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const skew = (s: THREE.Vector3) => {
      const hi = Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z));
      return hi > 0 ? (hi - Math.min(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z))) / hi : 0;
    };
    const prevHook = board.onAfterRender;

    const finish = () => {
      if (done) return;
      done = true;
      board.onAfterRender = prevHook;
      runRef.current = null;
      if (run.invalid || ts.length < 2) {
        report(`measure · invalid: ${run.invalid ?? 'fewer than two samples'}`);
        return;
      }
      // A Roll run that never sampled while the override was live measured the
      // idle interlude, not the Roll: refuse it rather than mislabel it.
      if (run.mode === 'roll' && run.overrideSamples === 0) {
        report('measure · invalid: Roll override was not active during any sample');
        return;
      }
      const base = PROBE_BASE_Q[lefty ? 'lefty' : 'righty'];
      const axes = { normal, up };
      const sampledMs = ts[ts.length - 1];
      const gaps = intervalStats(ts);
      const data = {
        handedness: lefty ? 'lefty' : 'righty',
        mode: run.mode,
        clip: PROBE_CLIP_LABEL[run.mode],
        // Which anatomical hand carries the board, and which hand the harness
        // located it on (righty → hand_l, lefty → hand_r, per GladiatorMesh).
        anatomicalStance: lefty ? 'lefty (shield in right hand)' : 'righty (shield in left hand)',
        shieldHand: handName,
        expectedClip: run.mode === 'roll' ? 'Roll' : null,
        pickerResolvesDodge: run.mode === 'roll' ? expectedClip : null,
        hierarchy: [
          hand.parent?.name,
          hand.name,
          `${group.type} (portaled ShieldModel)`,
          board.parent?.type,
          `Mesh Box ${p.width}×${p.height}×${p.depth}`,
        ].join(' > '),
        boardMaterialHex: `#${((board.material as THREE.MeshStandardMaterial).color?.getHexString?.() ?? '?')}`,
        sameBoardBoxesInScene: sameBoxes,
        axes: {
          normal: `${normal.getComponent(normalIdx) < 0 ? '-' : '+'}${'xyz'[normalIdx]}`,
          up: `+${'xyz'[upIdx]}`,
          bossSide,
          handSideOfBoard: handSide,
        },
        timing: {
          settleMs: PROBE_SETTLE_MS,
          sampleWindowMs: PROBE_SAMPLE_MS,
          sampledMs: Math.round(sampledMs),
          samples: ts.length,
          probeFrames: run.ticks,
          meanFps: r3(((ts.length - 1) * 1000) / sampledMs),
          maxGapMs: r3(maxGap),
          intervals: gaps,
          overrideSamples: run.mode === 'roll' ? run.overrideSamples : null,
          offOverrideSamples: run.mode === 'roll' ? run.offOverrideSamples : null,
        },
        ordering: {
          framesCompared: compared,
          mixerWroteHandBeforeSample: mixerBefore,
          constraintWroteShieldBeforeSample: constraintBefore,
        },
        scaleSkewMax: { board: r3(boardScaleSkew), hand: r3(handScaleSkew) },
        hierarchyResidualMaxDeg: r3(hierarchyResidual),
        board: orientationStats(boardQ, ts, axes),
        hand: orientationStats(handQ, ts),
        boardRelativeToHand: orientationStats(
          boardQ.map((q, i) => handQ[i].clone().invert().multiply(q)),
          ts,
        ),
        unconstrainedCounterfactual: orientationStats(
          handQ.map((q) => q.clone().multiply(base)),
          ts,
          axes,
        ),
      };
      const b = data.board as ReturnType<typeof orientationStats> & {
        normalHemisphereCrossings: number;
        upTiltFromWorldUpDeg: [number, number];
      };
      const overrideNote =
        run.mode === 'roll' ? ` · override live ${run.overrideSamples}/${ts.length} samples` : '';
      const sparseNote = gaps.sparse ? ` · ⚠ ${gaps.sparseReason} — not per-frame motion` : '';
      report(
        `measure · ${run.mode} · ${ts.length} samples / ${r3(sampledMs / 1000)} s` +
          ` · gaps ${gaps.minMs}/${gaps.meanMs}/${gaps.maxMs} ms` +
          overrideNote +
          ` · board step ${b.stepMinDeg}–${b.stepMaxDeg}° · drift ≤${b.devFromStartMaxDeg}°` +
          ` · up tilt ${b.upTiltFromWorldUpDeg[0]}–${b.upTiltFromWorldUpDeg[1]}°` +
          ` · normal crossings ${b.normalHemisphereCrossings}` +
          ` · hand drift ≤${data.hand.devFromStartMaxDeg}°` +
          sparseNote,
        data,
      );
    };

    board.onAfterRender = (renderer) => {
      const frame = renderer.info.render.frame;
      if (frame === lastFrame) return;
      lastFrame = frame;
      const now = performance.now();
      if (now - t0 < PROBE_SETTLE_MS) {
        run.preValid = false;
        return;
      }
      if (!run.sampling) {
        // Roll mode: refuse the run before a single sample is recorded unless
        // the override was live during the settle window — otherwise this would
        // silently measure the idle interlude and call it Roll.
        if (run.mode === 'roll' && !run.sawOverrideDuringSettle) {
          run.invalid = 'Roll override was not active during the settle window';
          finish();
          return;
        }
        run.sampling = true;
        tStart = now;
      }
      const qb = new THREE.Quaternion();
      board.matrixWorld.decompose(pos, qb, scl);
      boardScaleSkew = Math.max(boardScaleSkew, skew(scl));
      const qh = new THREE.Quaternion();
      hand.matrixWorld.decompose(pos, qh, scl);
      handScaleSkew = Math.max(handScaleSkew, skew(scl));
      // Board rigidly under hand × group-local rotation (offset group and mesh are unrotated).
      hierarchyResidual = Math.max(hierarchyResidual, quatAngleDeg(qh.clone().multiply(group.quaternion), qb));
      const t = now - tStart;
      if (ts.length) maxGap = Math.max(maxGap, t - ts[ts.length - 1]);
      // Roll mode: how much of the run the override was actually live for.
      if (guardRef.current.rolling) run.overrideSamples++;
      else run.offOverrideSamples++;
      boardQ.push(qb);
      handQ.push(qh);
      ts.push(t);
      if (run.preValid) {
        compared++;
        if (!hand.quaternion.equals(run.preHandQ)) mixerBefore++;
        if (!group.quaternion.equals(run.preGroupQ)) constraintBefore++;
      }
      run.preValid = false;
      if (t >= PROBE_SAMPLE_MS) finish();
    };
    report(
      `measure · ${mode} · ${handName} board` +
        (mode === 'roll'
          ? ` · picker dodge → '${expectedClip}' · confirming the override in the settle window`
          : '') +
        ` · settling ${PROBE_SETTLE_MS} ms, then sampling ${PROBE_SAMPLE_MS} ms…`,
    );

    // A culled or unmounted board must never leave the hook installed.
    const watchdog = window.setTimeout(() => {
      if (!done && !run.invalid) run.invalid = 'board stopped rendering before the run completed';
      finish();
    }, PROBE_SETTLE_MS + PROBE_SAMPLE_MS + 4000);
    return () => {
      window.clearTimeout(watchdog);
      if (!done) {
        done = true;
        board.onAfterRender = prevHook;
        runRef.current = null;
      }
    };
    // Each click (token) starts one run with the handedness of that moment.
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
};

/**
 * Phase 129 — reads the clip-name list the harness GLB actually ships and hands
 * it to the panel, so the Roll mode can assert with the *shipped* picker that
 * 'dodge' resolves to 'Roll'. drei's useGLTF is URL-cached, so this reuses the
 * load GladiatorMesh already made — no extra request, nothing written.
 */
const ClipNameReader: React.FC<{ onNames: (names: string[]) => void }> = ({ onNames }) => {
  const gltf = useGLTF('/models/arena_roman.glb');
  useEffect(() => {
    onNames(gltf.animations.map((clip) => clip.name));
  }, [gltf, onNames]);
  return null;
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
  const anchorsRef = useRef<HTMLDivElement>(null);
  const [measureToken, setMeasureToken] = useState(0);
  const [measureMode, setMeasureMode] = useState<ProbeMode>('idle');
  const [clipNames, setClipNames] = useState<string[] | null>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  // The shipped picker's own answer for the dodge action (Phase 129 check):
  // computed with the exported resolveActionClip on the harness GLB's real
  // clip-name list, so the Roll mode asserts against the real picker, not a copy.
  const rollClip = useMemo(
    () => (clipNames ? resolveActionClip('dodge', clipNames) : null),
    [clipNames],
  );

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
            <ShieldFramer view={view} reframeToken={reframeToken} lefty={lefty} anchorsRef={anchorsRef} />
            <Suspense fallback={null}>
              <ClipNameReader onNames={setClipNames} />
            </Suspense>
            <ShieldRotationProbe
              token={measureToken}
              mode={measureMode}
              lefty={lefty}
              rolling={rolling}
              expectedClip={rollClip}
              resultRef={measureRef}
            />
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
          data-testid="diag-view-junction"
          onClick={() => {
            setView('junction');
            setReframeToken((t) => t + 1);
          }}
          className={btn(view === 'junction')}
        >
          junction
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
      <div data-testid="diag-anchors" ref={anchorsRef} className="mt-1 font-mono text-[10px] text-neutral-400" />

      <div className="mt-2 flex items-center gap-1.5">
        <span className="w-16 text-neutral-400">Measure</span>
        <button
          data-testid="diag-measure"
          onClick={() => {
            setMeasureMode('idle');
            setMeasureToken((t) => t + 1);
          }}
          className={btn(measureMode === 'idle')}
        >
          idle rotation · 1.5 s settle + 8.5 s
        </button>
        <button
          data-testid="diag-roll-measure"
          onClick={() => {
            setMeasureMode('roll');
            setMeasureToken((t) => t + 1);
          }}
          className={btn(measureMode === 'roll')}
        >
          roll rotation · dodge → Roll
        </button>
      </div>
      <div data-testid="diag-picker-clip" className="mt-1 font-mono text-[10px] text-neutral-500">
        picker dodge → {rollClip === null ? 'clip list loading…' : `'${rollClip}'`}
      </div>
      <div data-testid="diag-measure-result" ref={measureRef} className="mt-1 font-mono text-[10px] text-neutral-400" />
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
