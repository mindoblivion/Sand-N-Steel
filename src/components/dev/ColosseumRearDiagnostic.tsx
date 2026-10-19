import React, { Suspense, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, Sky } from '@react-three/drei';
import * as THREE from 'three';
import { GrandColosseum } from '../3d/city/GrandColosseum';
import { ProcessionAvenue } from '../3d/city/ProcessionAvenue';
import { WebGLContextErrorBoundary } from '../ui/WebGLContextErrorBoundary';
import { applyRearNeutral, probeRear, surfaceSignature, type RearMode } from './colosseumRearMaterials';

type RearView = 'overview' | 'approach';
type Report = {
  mode: RearMode; view: RearView; signature: string; unchanged: boolean;
  camera: number[]; quaternion: number[]; fill: boolean;
  probes: ReturnType<typeof probeRear>;
};

const MODES: Array<{ id: RearMode; label: string; detail: string }> = [
  { id: 'A', label: 'A · Production', detail: 'Original materials, city lights, environment and fog.' },
  { id: 'B', label: 'B · Neutral rear', detail: 'Unlit grey on rear exterior triangles only; no bump, environment, tone mapping or fog on grey stone. Openings stay open.' },
  { id: 'C', label: 'C · Rear fill', detail: 'Original materials + temporary white north fill (1.5); all production light settings unchanged.' },
];

/** Exact city light/sky/environment settings; deliberately dev-only, drift-tested. */
function ProductionLighting() {
  const lightformers = useMemo(() => <>
    <Lightformer form="rect" intensity={2.0} color="#fffbeb" position={[30, 42, 22]} scale={[30, 30, 1]} target={[0, 0, 0]} />
    <Lightformer form="rect" intensity={0.35} color="#fef3c7" position={[0, 60, 0]} scale={[100, 100, 1]} target={[0, 0, 0]} />
    <Lightformer form="rect" intensity={0.25} color="#b08968" position={[0, -30, 0]} scale={[100, 100, 1]} target={[0, 0, 0]} />
    <Lightformer form="rect" intensity={0.2} color="#7dd3fc" position={[-25, 20, -25]} scale={[20, 20, 1]} target={[0, 0, 0]} />
  </>, []);
  return <>
    <fog attach="fog" args={['#e0a96d', 35, 115]} />
    <Sky sunPosition={[30, 42, 22]} turbidity={7} rayleigh={1.8} mieCoefficient={0.005} />
    <hemisphereLight color="#fef3c7" groundColor="#b08968" intensity={0.45} />
    <directionalLight position={[30, 42, 22]} intensity={2.15} color="#fffbeb" castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-70} shadow-camera-right={50}
      shadow-camera-top={50} shadow-camera-bottom={-50} shadow-camera-near={1}
      shadow-camera-far={140} shadow-bias={-0.0004} shadow-normalBias={0.02} />
    <directionalLight position={[-25, 20, -25]} intensity={0.28} color="#7dd3fc" />
    <Environment resolution={256} frames={1} environmentIntensity={0.35}>{lightformers}</Environment>
  </>;
}

function RearScene({ mode, view, onReport }: { mode: RearMode; view: RearView; onReport: (report: Report) => void }) {
  const wrapper = useRef<THREE.Group>(null);
  const baseline = useRef('');
  const pending = useRef(0);
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const fillTarget = useMemo(() => {
    const target = new THREE.Object3D();
    target.position.set(0, 8, -25);
    return target;
  }, []);

  // Neither camera depends on mode: A/B/C compare the exact same projection.
  useLayoutEffect(() => {
    if (view === 'overview') {
      const distance = Math.max(45, 22 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
      camera.position.set(0, 8, -25 - distance);
      camera.lookAt(0, 8, -25);
    } else {
      camera.position.set(0, 3.6, -68.7);
      camera.lookAt(0, 3.6 - Math.tan(THREE.MathUtils.degToRad(11.9)) * 10, -58.7);
    }
    camera.updateProjectionMatrix();
    pending.current = 2;
    invalidate();
  }, [view, camera, size.width, size.height, invalidate]);

  useLayoutEffect(() => {
    const root = wrapper.current?.children[0];
    if (!root) return;
    if (!baseline.current) baseline.current = surfaceSignature(root);
    const undo = mode === 'B' ? applyRearNeutral(root) : undefined;
    pending.current = 2;
    invalidate();
    return () => undo?.();
  }, [mode, invalidate]);

  // Publish after at least one completed render, not merely a React mode change.
  useFrame(() => {
    if (pending.current <= 0) return;
    pending.current -= 1;
    if (pending.current > 0) { invalidate(); return; }
    const root = wrapper.current?.children[0];
    if (!root) return;
    const signature = surfaceSignature(root);
    onReport({ mode, view, signature, unchanged: signature === baseline.current,
      camera: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
      fill: mode === 'C', probes: probeRear(root) });
  });

  return <>
    <ProductionLighting />
    <primitive object={fillTarget} />
    {mode === 'C' && <directionalLight name="temporary-rear-fill" position={[0, 18, -65]} target={fillTarget} intensity={1.5} color="#ffffff" />}
    <ProcessionAvenue />
    <group ref={wrapper}><GrandColosseum /></group>
  </>;
}

/** Standalone DEV entry: the game, save loader and collision system never mount. */
export function ColosseumRearDiagnostic() {
  if (!import.meta.env.DEV) return null;
  const [mode, setMode] = useState<RearMode>('A');
  const [view, setView] = useState<RearView>('overview');
  const [report, setReport] = useState<Report | null>(null);
  const [renderer, setRenderer] = useState('initializing');
  const [contextLost, setContextLost] = useState(false);
  const onReport = useCallback((next: Report) => setReport(next), []);
  const ready = report?.mode === mode && report?.view === view;

  return <main className="min-h-screen bg-neutral-950 text-neutral-200 font-mono text-xs">
    <header className="p-3 sm:p-4 space-y-2 border-b border-neutral-700">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h1 className="text-base text-amber-200 font-bold">C-8.69D · Colosseum rear diagnostic (DEV)</h1>
        <a href="/" className="underline text-cyan-200">Exit diagnostic</a>
      </div>
      <p>No save access or gameplay. One real Colosseum, unchanged world transform. Android acceptance pending.</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Comparison mode">
        {MODES.map((option) => <button key={option.id} onClick={() => setMode(option.id)}
          aria-pressed={mode === option.id} className={`rounded-lg border px-3 py-2 cursor-pointer ${mode === option.id ? 'bg-amber-900 border-amber-400 text-amber-100' : 'bg-neutral-800 border-neutral-600'}`}>
          {option.label}
        </button>)}
      </div>
      <p className="text-neutral-300 min-h-8">{MODES.find((option) => option.id === mode)?.detail}</p>
      <div className="flex flex-wrap gap-2 items-center">
        <span>Fixed camera:</span>
        <button aria-pressed={view === 'overview'} onClick={() => setView('overview')} className="border border-neutral-600 rounded-lg px-3 py-2 cursor-pointer">Rear overview</button>
        <button aria-pressed={view === 'approach'} onClick={() => setView('approach')} className="border border-neutral-600 rounded-lg px-3 py-2 cursor-pointer">Rear approach</button>
        <span role="status" data-testid="rear-status">{contextLost ? 'Context lost — reload this diagnostic' : ready ? `Ready · ${mode} · ${view}` : 'Rendering comparison…'}</span>
      </div>
    </header>
    <section aria-label="Rear comparison viewport" style={{ height: '60dvh', minHeight: 280 }}>
      <WebGLContextErrorBoundary sceneName="ColosseumRearDiagnostic" fallbackTitle="Rear diagnostic unavailable">
        <Canvas shadows frameloop="demand" dpr={[1, 2]}
          camera={{ position: [0, 8, -70], fov: 58, near: 0.1, far: 180 }}
          gl={{ antialias: false, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            const context = gl.getContext();
            const extension = context.getExtension('WEBGL_debug_renderer_info');
            setRenderer(extension ? String(context.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : String(context.getParameter(context.RENDERER)));
            gl.domElement.addEventListener('webglcontextlost', () => setContextLost(true), { once: true });
          }}>
          <Suspense fallback={null}><RearScene mode={mode} view={view} onReport={onReport} /></Suspense>
        </Canvas>
      </WebGLContextErrorBoundary>
    </section>
    <section className="p-3 sm:p-4 space-y-3 border-t border-neutral-700 break-words">
      <p data-testid="rear-renderer">Renderer: {renderer}</p>
      <p>Isolated scene: production Colosseum + avenue + exact city light rig; other buildings, NPCs and their shadows are not mounted. No device conclusion from this view alone.</p>
      <p>θ = 0° front, 180° rear; y is building-local height. Neutral applies only to exterior θ 90–270°; bowl, floor and front portal keep their materials.</p>
      <output data-testid="rear-report" className="block text-emerald-200" data-report={report ? JSON.stringify(report) : ''}>
        {report ? `Surface signature ${report.signature} · buffers/transforms ${report.unchanged ? 'unchanged' : 'CHANGED — comparison invalid'} · camera [${report.camera.map((n) => n.toFixed(2)).join(', ')}]` : 'Waiting for first rendered comparison…'}
      </output>
      <details>
        <summary className="cursor-pointer text-amber-200 py-2">Exact radial probes and interpretation</summary>
        <div className="overflow-x-auto py-2">
          <table className="text-left border-collapse w-full">
            <caption className="text-left pb-2">Actual exterior ray hits, not GPU visibility proof. An opening is not a missing wall.</caption>
            <thead><tr><th className="p-2">θ / y</th>{report?.probes[0]?.bands.map(({ y }) => <th key={y} className="p-2">{y}</th>)}</tr></thead>
            <tbody>{report?.probes.map(({ theta, bands }) => <tr key={theta} className="border-t border-neutral-700"><th className="p-2">{theta}°</th>{bands.map(({ y, surface }) => <td key={y} className="p-2">{surface}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <p>A/B/C missing solid stone → investigate geometry/transforms or GPU buffers. B reveals stone → material/render path. C reveals shaded stone → lighting/contrast. All modes show the interior through arches → architectural openness, not missing meshes.</p>
        <p className="mt-2">Capture A, B and C without switching camera or orientation. Include device/browser/GPU, θ and y band. This diagnostic does not select or apply a fix.</p>
      </details>
    </section>
  </main>;
}
