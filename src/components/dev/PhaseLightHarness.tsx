import React, { useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  applyPhaseLight,
  clearAtmosphere,
  getPhaseLight,
  type PhaseLight,
} from '../../utils/atmosphere';
import { resolveDuelPhaseLight } from '../../utils/duelPhaseLight';
import { CURRENT_PHASE } from '../../utils/currentPhase';
import { TIME_PHASE_NAMES, TIME_PHASES, type TimePhase } from '../../utils/timeState';

/**
 * Day/Night T1 — the development-only phase stepper (`/__dev/phases`).
 *
 * It is a VIEWER, not a scene: it mounts the real rig (`applyPhaseLight` — the same
 * gradient dome with its star term and moon disc, the same one shadow-casting key
 * light and hemisphere bounce) over a plain sand plane and a few stone blocks, and
 * lets every one of the seven phases plus both duel night states be inspected on a
 * device. The duel states use the duel's own resolver, so the fog band and the
 * brazier accounting shown here are the ones `DuelScene` ships.
 *
 * It reads and writes no save, mounts instead of the game (see `main.tsx`), and is
 * dead-code-eliminated from a production build. Delete this file and its `main.tsx`
 * branch to remove it.
 */

type HarnessMode = 'city' | 'torchlit' | 'spectacle';

const MODES: ReadonlyArray<{ id: HarnessMode; label: string; detail: string }> = [
  { id: 'city', label: 'City table', detail: 'The phase rows exactly as the city renders them.' },
  { id: 'torchlit', label: 'Duel · Torchlit', detail: 'A regular duel at night — fog 20 / 55.' },
  { id: 'spectacle', label: 'Duel · Night Spectacle', detail: 'A boss duel at any phase — fog 16 / 50.' },
];

/** The eight brazier stations, the arena's own layout, drawn here only to read light. */
const BRAZIERS = [0, 1, 2, 3, 4, 5, 6, 7].map((index) => {
  const angle = (index / 8) * Math.PI * 2;
  return [Math.cos(angle) * 13, 2.4, Math.sin(angle) * 13] as [number, number, number];
});

interface StageProps {
  rowPhase: TimePhase;
  fogNear: number;
  fogFar: number;
  /** 0 in the city view (no braziers drawn); the duel's scaled intensity otherwise. */
  brazierIntensity: number;
  emberEmissive: number;
}

/** The rig, applied for real; nothing here is a per-frame effect. */
const Stage: React.FC<StageProps> = ({ rowPhase, fogNear, fogFar, brazierIntensity, emberEmissive }) => {
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    applyPhaseLight(scene, rowPhase);
    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = fogNear;
      fog.far = fogFar;
    }
    return () => clearAtmosphere(scene);
  }, [scene, rowPhase, fogNear, fogFar]);

  const braziers = brazierIntensity > 0 ? BRAZIERS : [];

  return (
    <group>
      {/* Ground: the city's own sand tone, so the fog band reads against it. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[70, 70]} />
        <meshStandardMaterial color="#c9a273" roughness={0.95} />
      </mesh>
      {/* A few masses: one to cast a shadow, one warm, one pale. */}
      {[
        [-6, 1.4, -4, '#d4a373'],
        [5, 2.2, -7, '#b47b48'],
        [8, 1.0, 3, '#ecd9be'],
        [-9, 0.8, 6, '#854d0e'],
      ].map(([x, y, z, color], index) => (
        <mesh key={`mass-${index}`} position={[x as number, y as number, z as number]} castShadow receiveShadow>
          <boxGeometry args={[2.2, (y as number) * 2, 2.2]} />
          <meshStandardMaterial color={color as string} roughness={0.8} />
        </mesh>
      ))}
      {braziers.map((position, index) => (
        <group key={`brazier-${index}`} position={position}>
          <mesh>
            <cylinderGeometry args={[0.5, 0.32, 0.8, 10]} />
            <meshStandardMaterial color="#78350f" metalness={0.7} />
          </mesh>
          <mesh position={[0, 0.45, 0]}>
            <sphereGeometry args={[0.28, 10, 10]} />
            <meshStandardMaterial color="#ff5722" emissive="#f97316" emissiveIntensity={emberEmissive} />
          </mesh>
          {/* Mirrors the arena's own eight point lights so the pool of light reads. */}
          <pointLight color="#f97316" intensity={brazierIntensity} distance={12} position={[0, 0.6, 0]} />
        </group>
      ))}
    </group>
  );
};

interface Readout {
  row: PhaseLight;
  fogNear: number;
  fogFar: number;
  nightState: string;
  brazierIntensity: number;
  emberEmissive: number;
  rowPhase: TimePhase;
  lights: number;
}

function resolveReadout(mode: HarnessMode, phase: TimePhase): Readout {
  if (mode === 'city') {
    const row = getPhaseLight(phase);
    return {
      row,
      fogNear: row.fogNear,
      fogFar: row.fogFar,
      nightState: '—',
      brazierIntensity: 0,
      emberEmissive: 0,
      rowPhase: phase,
      lights: 2, // the key light + the hemisphere bounce, exactly the city's rig
    };
  }
  const duel = resolveDuelPhaseLight(mode === 'spectacle' ? phase : 'night', mode === 'spectacle');
  return {
    row: duel.row,
    fogNear: duel.fogNear,
    fogFar: duel.fogFar,
    nightState: duel.nightState ?? '—',
    brazierIntensity: duel.brazierIntensity,
    emberEmissive: duel.emberEmissive,
    rowPhase: duel.phase,
    lights: 10, // the two rig lights + the arena's eight braziers
  };
}

export const PhaseLightHarness: React.FC = () => {
  const [mode, setMode] = useState<HarnessMode>('city');
  const [phase, setPhase] = useState<TimePhase>(CURRENT_PHASE);
  const readout = useMemo(() => resolveReadout(mode, phase), [mode, phase]);

  return (
    <div className="fixed inset-0 bg-neutral-950 text-amber-100 font-mono">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [10, 6, 14], fov: 50, near: 0.1, far: 200 }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
      >
        <Stage
          rowPhase={readout.rowPhase}
          fogNear={readout.fogNear}
          fogFar={readout.fogFar}
          brazierIntensity={readout.brazierIntensity}
          emberEmissive={readout.emberEmissive}
        />
      </Canvas>

      <div className="absolute left-2 right-2 top-2 sm:left-3 sm:top-3 sm:right-auto sm:w-[360px] max-h-[72vh] overflow-y-auto rounded-2xl bg-neutral-950/90 border border-amber-600/50 p-3 text-[11px] leading-snug">
        <div className="flex items-center justify-between gap-2">
          <span className="font-serif font-black uppercase tracking-wider text-amber-200 text-sm">
            Phase light · dev
          </span>
          <a href="/" className="text-amber-400 underline">
            back
          </a>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1">
          {MODES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setMode(entry.id)}
              aria-pressed={mode === entry.id}
              className={`rounded-lg border px-2 py-1.5 text-left ${
                mode === entry.id
                  ? 'bg-amber-500 text-neutral-950 border-amber-300'
                  : 'bg-neutral-900 border-neutral-700'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-neutral-400">{MODES.find((entry) => entry.id === mode)?.detail}</p>

        <div className="mt-3 flex flex-wrap gap-1">
          {TIME_PHASES.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setPhase(id)}
              aria-pressed={phase === id}
              className={`rounded-lg border px-2 py-1 ${
                phase === id
                  ? 'bg-amber-500 text-neutral-950 border-amber-300'
                  : 'bg-neutral-900 border-neutral-700'
              }`}
            >
              {TIME_PHASE_NAMES[id]}
            </button>
          ))}
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
          <dt className="text-neutral-400">Canonical phase</dt>
          <dd>{TIME_PHASE_NAMES[phase]}</dd>
          <dt className="text-neutral-400">Row</dt>
          <dd>{readout.rowPhase}</dd>
          <dt className="text-neutral-400">Key light</dt>
          <dd>{readout.row.keyLight}</dd>
          <dt className="text-neutral-400">Night state</dt>
          <dd>{readout.nightState}</dd>
          <dt className="text-neutral-400">Fog band</dt>
          <dd>
            {readout.fogNear} / {readout.fogFar}
          </dd>
          <dt className="text-neutral-400">Fog / horizon</dt>
          <dd>
            {readout.row.fogColor} / {readout.row.skyHorizon}
          </dd>
          <dt className="text-neutral-400">Key intensity</dt>
          <dd>{readout.row.sunIntensity.toFixed(2)}</dd>
          <dt className="text-neutral-400">Hemisphere</dt>
          <dd>{readout.row.hemiIntensity.toFixed(2)}</dd>
          <dt className="text-neutral-400">Exposure</dt>
          <dd>{readout.row.exposure.toFixed(2)}</dd>
          <dt className="text-neutral-400">Env intensity</dt>
          <dd>{readout.row.envIntensity.toFixed(2)}</dd>
          <dt className="text-neutral-400">Stars</dt>
          <dd>{readout.row.starAmount.toFixed(2)}</dd>
          <dt className="text-neutral-400">Lamp glow</dt>
          <dd>{readout.row.lampGlow.toFixed(2)}</dd>
          <dt className="text-neutral-400">Brazier light</dt>
          <dd>{readout.brazierIntensity > 0 ? readout.brazierIntensity.toFixed(2) : '—'}</dd>
          <dt className="text-neutral-400">Ember emissive</dt>
          <dd>{readout.emberEmissive > 0 ? readout.emberEmissive.toFixed(2) : '—'}</dd>
          <dt className="text-neutral-400">Dynamic lights</dt>
          <dd>{readout.lights}</dd>
        </dl>
        <p className="mt-2 text-neutral-500">
          A SwiftShader frame proves nothing about look or frame cost — accept on device.
        </p>
      </div>
    </div>
  );
};
