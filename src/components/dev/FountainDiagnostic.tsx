import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import * as THREE from 'three';
import { ProcessionAvenue } from '../3d/city/ProcessionAvenue';
import { WebGLContextErrorBoundary } from '../ui/WebGLContextErrorBoundary';

/**
 * Plaza fountain diagnostic (DEV only).
 *
 * Mounts the production `ProcessionAvenue` — so the real fountain, plaza paving,
 * Colosseum and lighting — behind fixed cameras, and reports the fountain's
 * measured world bounds and mesh cost. The city hub renders at ~2 fps through
 * SwiftShader in this sandbox, which is too slow to orbit a 6.5 m hero asset;
 * this screen makes the same geometry legible in a handful of frames.
 *
 * Reachable only in a dev build via `?devHarness=fountain`. It reads no save and
 * writes nothing; production geometry and lighting are untouched.
 */

type View = 'plaza' | 'detail' | 'top';

const VIEWS: Array<{ id: View; label: string; camera: [number, number, number]; target: [number, number, number] }> = [
  { id: 'plaza', label: 'Player eye', camera: [0, 3.2, 15], target: [0, 3.0, 0] },
  { id: 'detail', label: 'Hero 3/4', camera: [6.2, 5.4, 7.4], target: [0, 3.2, 0] },
  { id: 'top', label: 'Plan', camera: [0, 13, 9], target: [0, 2.2, 0] },
];

type Report = { height: number; diameterX: number; diameterZ: number; meshes: number; triangles: number };

function Scene({ view, onReport }: { view: View; onReport: (report: Report) => void }) {
  const wrapper = useRef<THREE.Group>(null);
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const pending = useRef(2);
  const target = useMemo(() => new THREE.Vector3(), []);

  useLayoutEffect(() => {
    const configuration = VIEWS.find((option) => option.id === view) ?? VIEWS[0];
    camera.position.set(...configuration.camera);
    camera.lookAt(target.set(...configuration.target));
    camera.updateProjectionMatrix();
    pending.current = 2;
    invalidate();
  }, [view, camera, size.width, size.height, invalidate, target]);

  useFrame(() => {
    if (pending.current <= 0) return;
    pending.current -= 1;
    if (pending.current > 0) {
      invalidate();
      return;
    }
    let root: THREE.Object3D | undefined;
    wrapper.current?.traverse((child) => {
      if (child.name === 'Fountain_Root') root = child;
    });
    if (!root) {
      onReport({ height: 0, diameterX: 0, diameterZ: 0, meshes: 0, triangles: 0 });
      return;
    }
    const box = new THREE.Box3().setFromObject(root);
    let meshes = 0;
    let triangles = 0;
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshes += 1;
      const geometry = mesh.geometry as THREE.BufferGeometry;
      const index = geometry.getIndex();
      const vertices = index ? index.count : geometry.getAttribute('position')?.count ?? 0;
      const instances = (mesh as THREE.InstancedMesh).isInstancedMesh
        ? (mesh as THREE.InstancedMesh).count
        : 1;
      triangles += Math.floor(vertices / 3) * instances;
    });
    onReport({
      height: box.max.y - box.min.y,
      diameterX: box.max.x - box.min.x,
      diameterZ: box.max.z - box.min.z,
      meshes,
      triangles,
    });
  });

  return (
    <>
      <fog attach="fog" args={['#e3dbc6', 45, 160]} />
      <Sky sunPosition={[30, 42, 22]} turbidity={7} rayleigh={1.8} mieCoefficient={0.005} />
      <hemisphereLight color="#fef3c7" groundColor="#8a7a5f" intensity={0.45} />
      <directionalLight
        position={[30, 42, 22]}
        intensity={2.15}
        color="#fffbeb"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={140}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-25, 20, -25]} intensity={0.28} color="#7dd3fc" />
      <group ref={wrapper}>
        <ProcessionAvenue />
      </group>
    </>
  );
}

export function FountainDiagnostic() {
  if (!import.meta.env.DEV) return null;
  const [view, setView] = useState<View>('plaza');
  const [report, setReport] = useState<Report | null>(null);
  const onReport = useCallback((next: Report) => setReport(next), []);
  const ready = report !== null && report.height > 0;

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-200 font-mono text-xs">
      <header className="p-3 sm:p-4 space-y-2 border-b border-neutral-700">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <h1 className="text-base text-amber-200 font-bold">Imperial fountain diagnostic (DEV)</h1>
          <a href="/" className="underline text-cyan-200">Exit diagnostic</a>
        </div>
        <p>Production plaza and fountain, fixed cameras. No save access, no gameplay.</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Fixed camera">
          {VIEWS.map((option) => (
            <button
              key={option.id}
              onClick={() => setView(option.id)}
              aria-pressed={view === option.id}
              className={`rounded-lg border px-3 py-2 cursor-pointer ${view === option.id ? 'bg-amber-900 border-amber-400 text-amber-100' : 'bg-neutral-800 border-neutral-600'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p role="status" data-testid="fountain-status" data-height={report?.height ?? 0} data-diameter={report?.diameterX ?? 0}>
          {ready
            ? `Height ${report!.height.toFixed(2)} m · width ${report!.diameterX.toFixed(2)} × ${report!.diameterZ.toFixed(2)} m · ${report!.meshes} meshes · ${report!.triangles} triangles`
            : 'Measuring the fountain…'}
        </p>
      </header>
      <section aria-label="Fountain viewport" style={{ height: '70dvh', minHeight: 260 }}>
        <WebGLContextErrorBoundary sceneName="FountainDiagnostic" fallbackTitle="Fountain diagnostic unavailable">
          <Canvas
            shadows
            frameloop="demand"
            dpr={[1, 2]}
            camera={{ position: [0, 3.2, 15], fov: 52, near: 0.1, far: 220 }}
          >
            <Scene view={view} onReport={onReport} />
          </Canvas>
        </WebGLContextErrorBoundary>
      </section>
    </main>
  );
}
