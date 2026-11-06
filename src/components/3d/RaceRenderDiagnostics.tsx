import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

/**
 * Opt-in race-scene profiler. Mounted only in development when
 * ?devRaceStats=1 is present. Samples the previous completed render's
 * renderer.info counters and frame deltas; it does not alter scene quality,
 * render settings, simulation timing, or user-visible UI.
 */
export function RaceRenderDiagnostics() {
  const { gl } = useThree();
  const elapsed = useRef(0);
  const frameTimes = useRef<number[]>([]);
  const drawCalls = useRef<number[]>([]);
  const triangles = useRef<number[]>([]);

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
    const size = gl.getDrawingBufferSize({ width: 0, height: 0 });

    console.info('[RaceRenderDiagnostics]', {
      windowSeconds: Number(elapsed.current.toFixed(2)),
      fps: Number((frameTimes.current.length / elapsed.current).toFixed(1)),
      frameMsAvg: Number(average(frameTimes.current).toFixed(2)),
      frameMsP95: Number(percentile95.toFixed(2)),
      drawCallsAvg: Number(average(drawCalls.current).toFixed(1)),
      drawCallsPeak: Math.max(0, ...drawCalls.current),
      trianglesAvg: Math.round(average(triangles.current)),
      pixelRatio: gl.getPixelRatio(),
      drawingBuffer: [size.width, size.height],
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    });

    elapsed.current = 0;
    frameTimes.current = [];
    drawCalls.current = [];
    triangles.current = [];
  });

  return null;
}
