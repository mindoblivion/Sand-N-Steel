import { useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';

type RaceDiagnosticsSnapshot = {
  fps: number;
  frameMsAvg: number;
  frameMsP95: number;
  drawCallsAvg: number;
  drawCallsPeak: number;
  trianglesAvg: number;
  pixelRatio: number;
  drawingBuffer: [number, number];
  geometries: number;
  textures: number;
};

/**
 * Opt-in race-scene profiler. Mounted only in development when
 * the development build flag or ?devRaceStats=1 is present. Samples the previous
 * completed render's renderer.info counters and frame deltas. The small DOM
 * overlay is available only in this diagnostic component; it does not alter
 * scene quality, render settings, simulation timing, or production UI.
 */
export function RaceRenderDiagnostics() {
  const { gl } = useThree();
  const elapsed = useRef(0);
  const frameTimes = useRef<number[]>([]);
  const drawCalls = useRef<number[]>([]);
  const triangles = useRef<number[]>([]);
  const [snapshot, setSnapshot] = useState<RaceDiagnosticsSnapshot | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useFrame((_state, delta) => {
    // The renderer's auto-reset info counters describe the last completed frame
    // when read at the beginning of this frame callback.
    elapsed.current += delta;
    frameTimes.current.push(delta * 1000);
    drawCalls.current.push(gl.info.render.calls);
    triangles.current.push(gl.info.render.triangles);

    if (elapsed.current < 2) return;

    const sortedFrameTimes = [...frameTimes.current].sort((a, b) => a - b);
    const percentile95 = sortedFrameTimes[Math.min(
      sortedFrameTimes.length - 1,
      Math.floor(sortedFrameTimes.length * 0.95),
    )] ?? 0;
    const average = (values: number[]) =>
      values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const drawingBuffer: [number, number] = [gl.domElement.width, gl.domElement.height];
    const nextSnapshot: RaceDiagnosticsSnapshot = {
      fps: Number((frameTimes.current.length / elapsed.current).toFixed(1)),
      frameMsAvg: Number(average(frameTimes.current).toFixed(2)),
      frameMsP95: Number(percentile95.toFixed(2)),
      drawCallsAvg: Number(average(drawCalls.current).toFixed(1)),
      drawCallsPeak: Math.max(0, ...drawCalls.current),
      trianglesAvg: Math.round(average(triangles.current)),
      pixelRatio: Number(gl.getPixelRatio().toFixed(2)),
      drawingBuffer,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    };

    console.info('[RaceRenderDiagnostics]', {
      windowSeconds: Number(elapsed.current.toFixed(2)),
      ...nextSnapshot,
    });
    setSnapshot(nextSnapshot);
    setCopyState('idle');

    elapsed.current = 0;
    frameTimes.current = [];
    drawCalls.current = [];
    triangles.current = [];
  });

  const copySnapshot = async () => {
    if (!snapshot) return;
    const report = JSON.stringify({
      capturedAt: new Date().toISOString(),
      sampleWindowSeconds: 2,
      ...snapshot,
    }, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(report);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = report;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('Clipboard copy was not accepted');
      }
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  if (typeof document === 'undefined' || !snapshot) return null;

  return (
    <Html fullscreen zIndexRange={[10000, 10000]} style={{ pointerEvents: 'none' }}>
    <aside
      aria-label="Race performance diagnostics"
      style={{
        position: 'fixed',
        top: 'max(8px, env(safe-area-inset-top))',
        left: 'max(8px, env(safe-area-inset-left))',
        zIndex: 10000,
        pointerEvents: 'auto',
        padding: '7px 9px',
        border: '1px solid rgba(255,255,255,0.24)',
        borderRadius: 6,
        background: 'rgba(8, 10, 12, 0.82)',
        color: '#f4f0e7',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10,
        lineHeight: 1.45,
        letterSpacing: '0.01em',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'pre',
        maxWidth: 'calc(100vw - 16px)',
      }}
    >
      <div style={{ fontWeight: 700, color: '#e7c98b', marginBottom: 3 }}>
        RACE PROFILER · DEVELOPMENT
      </div>
      <div>FPS {snapshot.fps.toFixed(1)}  ·  AVG {snapshot.frameMsAvg.toFixed(1)} ms  ·  P95 {snapshot.frameMsP95.toFixed(1)} ms</div>
      <div>DRAW {snapshot.drawCallsAvg.toFixed(0)} avg / {snapshot.drawCallsPeak} peak  ·  TRI {snapshot.trianglesAvg.toLocaleString()}</div>
      <div>DPR {snapshot.pixelRatio.toFixed(2)}  ·  BUFFER {snapshot.drawingBuffer[0]}×{snapshot.drawingBuffer[1]}</div>
      <div>GEOMETRIES {snapshot.geometries}  ·  TEXTURES {snapshot.textures}</div>
      <div style={{ opacity: 0.7, marginTop: 2 }}>Rolling 2-second sample</div>
      <button
        type="button"
        onClick={copySnapshot}
        aria-label="Copy race performance sample"
        style={{
          display: 'block',
          width: '100%',
          minHeight: 30,
          marginTop: 6,
          padding: '4px 7px',
          border: '1px solid rgba(231,201,139,0.65)',
          borderRadius: 4,
          background: 'rgba(105,75,31,0.45)',
          color: '#f4f0e7',
          font: 'inherit',
          fontWeight: 700,
          pointerEvents: 'auto',
        }}
      >
        {copyState === 'copied' ? 'SAMPLE COPIED' : copyState === 'failed' ? 'COPY FAILED · RETRY' : 'COPY SAMPLE'}
      </button>
    </aside>
    </Html>
  );
}
