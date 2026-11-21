import React, { useEffect, useState } from 'react';
import type { CityMovementDiagnosticSnapshot } from '../../utils/cityMovementDiagnostics';

interface CityMovementDiagnosticsPanelProps {
  snapshotRef: React.MutableRefObject<CityMovementDiagnosticSnapshot>;
  onClose: () => void;
}

const n = (value: number): string => Number.isFinite(value) ? value.toFixed(2) : '—';
const degrees = (radians: number): string => Number.isFinite(radians)
  ? `${(radians * 180 / Math.PI).toFixed(0)}°`
  : '—';

export const CityMovementDiagnosticsPanel: React.FC<CityMovementDiagnosticsPanelProps> = ({
  snapshotRef,
  onClose,
}) => {
  const [snapshot, setSnapshot] = useState(snapshotRef.current);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSnapshot({ ...snapshotRef.current });
    }, 150);
    return () => window.clearInterval(timer);
  }, [snapshotRef]);

  const copySnapshot = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  const ratio = snapshot.movementRatio === null ? '—' : `${(snapshot.movementRatio * 100).toFixed(0)}%`;
  const keys = Object.entries(snapshot.keysPressed).filter(([, pressed]) => pressed).map(([key]) => key.toUpperCase()).join('') || '—';

  return (
    <section
      data-city-movement-diagnostics="true"
      aria-label="City movement diagnostics"
      className="fixed z-[80] top-[calc(env(safe-area-inset-top,0px)+5.5rem)] right-2 w-[min(72vw,260px)] max-h-[42vh] overflow-y-auto rounded-xl border border-fuchsia-400/70 bg-neutral-950/95 p-2.5 text-[10px] font-mono leading-relaxed text-fuchsia-100 shadow-2xl pointer-events-auto"
    >
      <header className="mb-2 flex items-center justify-between gap-2 border-b border-fuchsia-900 pb-1.5">
        <strong className="tracking-wider text-fuchsia-300">MOVE DIAGNOSTICS</strong>
        <button type="button" onClick={onClose} className="min-h-8 rounded border border-fuchsia-700 px-2 text-fuchsia-100">Hide</button>
      </header>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <span>Position</span><b>{snapshot.position.map(n).join(', ')}</b>
        <span>Player / camera</span><b>{degrees(snapshot.playerYaw)} / {degrees(snapshot.cameraYaw)}</b>
        <span>Input X / Z</span><b>{n(snapshot.rawInput.x)} / {n(snapshot.rawInput.z)}</b>
        <span>Touch X / Z</span><b>{n(snapshot.touchInput.x)} / {n(snapshot.touchInput.z)}</b>
        <span>Keys / touch</span><b>{keys} / {snapshot.touchActive ? 'held' : 'off'}</b>
        <span>Input locks</span><b>{snapshot.inputLocked ? 'scene' : snapshot.panelLocked ? 'panel' : 'none'}</b>
        <span>Frame delta</span><b>{n(snapshot.frameDeltaMs)} ms</b>
        <span>Stride speed</span><b>{n(snapshot.speed)} m/s</b>
        <span>World direction</span><b>{n(snapshot.worldDirection.x)} / {n(snapshot.worldDirection.z)}</b>
        <span>Expected / actual</span><b>{n(snapshot.expectedDistance)} / {n(snapshot.actualDistance)} m</b>
        <span>Movement ratio</span><b className={snapshot.collisionLimited ? 'text-amber-300' : ''}>{ratio}{snapshot.collisionLimited ? ' · limited' : ''}</b>
      </div>
      <button type="button" onClick={copySnapshot} className="mt-2 min-h-9 w-full rounded border border-fuchsia-700 bg-fuchsia-950/60 px-2 text-fuchsia-100">
        {copyState === 'copied' ? 'Snapshot copied' : copyState === 'failed' ? 'Copy unavailable' : 'Copy diagnostic snapshot'}
      </button>
      <p className="mt-1 text-[9px] text-fuchsia-200/70">Development-only. No save data is read or written by this panel.</p>
    </section>
  );
};
