import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';

type HandPose = { right: string; left: string };

type ClipRecord = {
  index: number;
  name: string;
  duration: number;
  trackCount: number;
  keyframeCount: number;
  tracks: string[];
};

const MODEL_URL = '/models/arena_roman.glb';
const CANDIDATE_WORDS = /fall|knock|down|ground|lay|lie|recover|get.?up|stand|stagger|hit|death/i;

const RomanAnimationPreview: React.FC<{
  selectedClip: number | null;
  loop: boolean;
  speed: number;
  onLoaded: (clips: ClipRecord[]) => void;
  onRigBones: (bones: string[]) => void;
  onHandPose: (pose: HandPose) => void;
}> = ({ selectedClip, loop, speed, onLoaded, onRigBones, onHandPose }) => {
  const gltf = useGLTF(MODEL_URL);
  const clonedScene = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);
  const mixer = useMemo(() => new THREE.AnimationMixer(clonedScene), [clonedScene]);
  const activeActionRef = useRef<THREE.AnimationAction | null>(null);
  const handBonesRef = useRef<{ right: THREE.Bone | null; left: THREE.Bone | null }>({ right: null, left: null });
  const poseSampleElapsed = useRef(0);
  const rightHandPosition = useMemo(() => new THREE.Vector3(), []);
  const leftHandPosition = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const candidates: string[] = [];
    let right: THREE.Bone | null = null;
    let left: THREE.Bone | null = null;
    clonedScene.traverse((object) => {
      if (!(object as THREE.Bone).isBone) return;
      const name = object.name.toLowerCase();
      if (name.includes('hand') || name.includes('wrist')) {
        candidates.push(object.name);
        if ((name.includes('right') || /(^|[_ .])r($|[_ .])/.test(name)) && !right) right = object as THREE.Bone;
        if ((name.includes('left') || /(^|[_ .])l($|[_ .])/.test(name)) && !left) left = object as THREE.Bone;
      }
    });
    handBonesRef.current = { right, left };
    onRigBones(candidates);
    const records = gltf.animations.map((clip, index) => ({
      index,
      name: clip.name,
      duration: clip.duration,
      trackCount: clip.tracks.length,
      keyframeCount: clip.tracks.reduce((sum, track) => sum + track.times.length, 0),
      tracks: clip.tracks.map((track) => track.name),
    }));
    onLoaded(records);
  }, [clonedScene, gltf.animations, onLoaded, onRigBones]);

  useEffect(() => {
    mixer.stopAllAction();
    if (selectedClip === null) return;
    const clip = gltf.animations[selectedClip];
    if (!clip) return;

    const action = mixer.clipAction(clip);
    action.reset();
    action.enabled = true;
    action.setEffectiveTimeScale(1);
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    action.play();
    activeActionRef.current = action;

    return () => {
      action.stop();
      mixer.stopAllAction();
      if (activeActionRef.current === action) activeActionRef.current = null;
    };
  }, [gltf.animations, loop, mixer, selectedClip]);

  // Changing playback speed must not recreate the action: doing so resets the
  // clip to frame zero every time the slider moves and makes close inspection hard.
  useEffect(() => {
    activeActionRef.current?.setEffectiveTimeScale(speed);
  }, [speed]);

  useFrame((_, delta) => {
    mixer.update(Math.min(delta, 0.05));
    poseSampleElapsed.current += delta;
    if (poseSampleElapsed.current < 0.12) return;
    poseSampleElapsed.current = 0;
    const { right, left } = handBonesRef.current;
    clonedScene.updateWorldMatrix(true, true);
    const format = (bone: THREE.Bone | null, target: THREE.Vector3) => {
      if (!bone) return 'not detected';
      bone.getWorldPosition(target);
      return `${target.x.toFixed(3)}, ${target.y.toFixed(3)}, ${target.z.toFixed(3)}`;
    };
    onHandPose({
      right: format(right, rightHandPosition),
      left: format(left, leftHandPosition),
    });
  });

  useEffect(() => () => {
    mixer.stopAllAction();
    mixer.uncacheRoot(clonedScene);
  }, [clonedScene, mixer]);

  return <primitive object={clonedScene} />;
};

/**
 * Dev-only inventory and playback viewer for the clips embedded in the
 * production Roman GLB. It is isolated from fighter state, combat, and saves.
 */
export const AnimationInventoryHarness: React.FC = () => {
  const [clips, setClips] = useState<ClipRecord[] | null>(null);
  const [filter, setFilter] = useState('');
  const [candidatesOnly, setCandidatesOnly] = useState(false);
  const [selectedClip, setSelectedClip] = useState<number | null>(null);
  const [loop, setLoop] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [handBones, setHandBones] = useState<string[]>([]);
  const [handPose, setHandPose] = useState<HandPose>({ right: 'waiting for rig', left: 'waiting for rig' });

  const handleLoaded = useCallback((records: ClipRecord[]) => setClips(records), []);
  const handleRigBones = useCallback((bones: string[]) => setHandBones(bones), []);
  const handleHandPose = useCallback((pose: HandPose) => setHandPose(pose), []);
  const visibleClips = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return (clips ?? []).filter((clip) => {
      if (candidatesOnly && !CANDIDATE_WORDS.test(clip.name)) return false;
      if (!query) return true;
      return clip.name.toLowerCase().includes(query) ||
        clip.tracks.some((track) => track.toLowerCase().includes(query));
    });
  }, [clips, filter, candidatesOnly]);
  const selected = clips?.find((clip) => clip.index === selectedClip) ?? null;

  const panel: React.CSSProperties = {
    minHeight: '100vh',
    background: 'radial-gradient(ellipse at top, #34251b 0%, #17120f 55%, #090807 100%)',
    color: '#ead9b8',
    fontFamily: 'Georgia, serif',
    padding: '20px',
    boxSizing: 'border-box',
  };
  const muted: React.CSSProperties = { color: '#b8a58a', fontSize: 13 };
  const inputStyle: React.CSSProperties = {
    background: '#211a15', color: '#f2e6d0', border: '1px solid #70543a',
    borderRadius: 6, padding: '10px 12px', fontSize: 14, width: '100%',
    boxSizing: 'border-box',
  };
  const controlStyle: React.CSSProperties = {
    background: '#302319', color: '#f2e6d0', border: '1px solid #70543a',
    borderRadius: 5, padding: '8px 11px', cursor: 'pointer',
  };

  return (
    <main style={panel}>
      <header style={{ maxWidth: 1200, margin: '0 auto 16px' }}>
        <div style={{ color: '#c69a5a', letterSpacing: 3, fontSize: 11, textTransform: 'uppercase' }}>
          Sand &amp; Steel · Development diagnostics
        </div>
        <h1 style={{ margin: '8px 0', fontSize: 30, fontWeight: 600 }}>Roman animation inventory</h1>
        <p style={muted}>
          Inspect and play the animations embedded in <code>{MODEL_URL}</code>.
          This isolated preview does not alter combat, fighter state, or saved profiles.
        </p>
      </header>

      <section style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ border: '1px solid #60472f', borderRadius: 8, overflow: 'hidden', background: '#100d0b' }}>
          <div style={{ height: 'min(54vh, 480px)', minHeight: 300 }}>
            <Canvas
              camera={{ position: [0, 1.35, 4.2], fov: 38, near: 0.01, far: 100 }}
              dpr={[1, 1.5]}
              gl={{ antialias: true, alpha: false }}
              onCreated={({ gl }) => {
                gl.setClearColor('#17120f');
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.1;
              }}
            >
              <ambientLight intensity={1.5} />
              <hemisphereLight args={['#f4dfc4', '#34251b', 1.1]} />
              <directionalLight position={[3, 6, 4]} intensity={2.4} />
              <directionalLight position={[-4, 3, -3]} intensity={1.1} />
              <Suspense fallback={null}>
                <RomanAnimationPreview
                  selectedClip={selectedClip}
                  loop={loop}
                  speed={speed}
                  onLoaded={handleLoaded}
                  onRigBones={handleRigBones}
                  onHandPose={handleHandPose}
                />
              </Suspense>
              <gridHelper args={[8, 16, '#806348', '#3b2d22']} position={[0, -0.01, 0]} />
              <OrbitControls target={[0, 1, 0]} enablePan={false} minDistance={2} maxDistance={8} />
            </Canvas>
          </div>
          <div style={{ padding: 12, borderTop: '1px solid #60472f', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style={{ color: '#e9b86e', minWidth: 160 }}>
              {selected ? selected.name : 'Select an animation'}
            </strong>
            <button type="button" style={controlStyle} onClick={() => setSelectedClip(null)}>Stop</button>
            <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} />
              Loop
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              Speed
              <input aria-label="Playback speed" type="range" min="0.2" max="2" step="0.1" value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))} />
              {speed.toFixed(1)}×
            </label>
            <span style={{ ...muted, marginLeft: 'auto' }}>
              Drag to orbit · pinch/scroll to zoom
            </span>
          </div>
        </div>

        <aside style={{ marginTop: 16, padding: 14, background: '#211a15', border: '1px solid #60472f', borderRadius: 8 }}>
          <strong style={{ color: '#e9b86e', fontSize: 14 }}>Two-hand grip diagnostics</strong>
          <p style={{ ...muted, margin: '6px 0 10px' }}>Live world-space hand positions after animation-mixer updates. Coordinates are model-space scene units; this panel is diagnostic only and does not alter the rig or equipment.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, fontFamily: 'monospace', fontSize: 12 }}>
            <div>Right hand: <strong>{handPose.right}</strong></div>
            <div>Left hand: <strong>{handPose.left}</strong></div>
          </div>
          <div style={{ ...muted, marginTop: 8 }}>Detected hand / wrist bones: {handBones.length ? handBones.join(' · ') : 'none found'}</div>
          {(!handBones.some((name) => /right|(^|[_ .])r($|[_ .])/i.test(name)) || !handBones.some((name) => /left|(^|[_ .])l($|[_ .])/i.test(name))) && <div style={{ color: '#e9b86e', fontSize: 12, marginTop: 8 }}>One or both sides may need manual bone-name mapping before the two-hand constraint can be implemented.</div>}
        </aside>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', margin: '18px 0 10px' }}>
          <div style={{ flex: '1 1 260px' }}>
            <input
              aria-label="Filter animation names or rig tracks"
              placeholder="Search clip names or rig tracks…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              style={inputStyle}
            />
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={candidatesOnly} onChange={(event) => setCandidatesOnly(event.target.checked)} />
            Potential impact / recovery names
          </label>
        </div>

        <div style={{ ...muted, marginBottom: 10 }}>
          {clips ? `${visibleClips.length} shown · ${clips.length} total clips` : 'Loading Roman GLB metadata…'}
          {' · '}Select any row to preview it above.
        </div>

        <div style={{ border: '1px solid #60472f', borderRadius: 8, overflow: 'hidden' }}>
          {visibleClips.map((clip) => (
            <button
              type="button"
              key={clip.index}
              onClick={() => setSelectedClip(clip.index)}
              aria-pressed={selectedClip === clip.index}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '12px 14px', color: '#ead9b8',
                background: selectedClip === clip.index ? '#49331f' : 'transparent',
                border: 0, borderBottom: '1px solid #3b2d22', cursor: 'pointer',
              }}
            >
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <strong style={{ color: CANDIDATE_WORDS.test(clip.name) ? '#e9b86e' : '#ead9b8' }}>
                  {clip.name}
                </strong>
                <span style={muted}>
                  {clip.duration.toFixed(2)} s · {clip.trackCount} tracks · {clip.keyframeCount} keys
                </span>
              </span>
              <span style={{ ...muted, display: 'block', marginTop: 6, overflowWrap: 'anywhere' }}>
                {clip.tracks.join(' · ')}
              </span>
            </button>
          ))}
          {clips && visibleClips.length === 0 && <div style={{ padding: 18, ...muted }}>No clips match this filter.</div>}
        </div>

        <aside style={{ marginTop: 18, padding: 14, background: '#211a15', borderLeft: '3px solid #b8874d', borderRadius: 4 }}>
          <strong style={{ fontSize: 13 }}>Verification boundary</strong>
          <p style={{ ...muted, marginBottom: 0 }}>
            Playback lets us inspect poses and timing, but clip names alone do not prove a complete
            fall, grounded pose, or get-up. Check the full motion, floor contact, root movement,
            transitions, and whether the rig returns to a stable standing pose before live integration.
          </p>
        </aside>
      </section>
    </main>
  );
};

export default AnimationInventoryHarness;
