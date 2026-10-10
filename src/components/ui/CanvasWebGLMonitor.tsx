import React, { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { WebGLHealthMonitor, WebGLHealthEvent } from '../../utils/webglDebugger';

interface CanvasWebGLMonitorProps {
  sceneName: string;
  onHealthEvent?: (event: WebGLHealthEvent) => void;
}

/**
 * Inner R3F Canvas WebGL Monitor & Heartbeat
 * Placed inside <Canvas> to monitor GPU health, frame renders, and context loss events
 */
export const CanvasWebGLMonitor: React.FC<CanvasWebGLMonitorProps> = ({
  sceneName,
  onHealthEvent,
}) => {
  const { gl } = useThree();
  const monitorRef = useRef<WebGLHealthMonitor | null>(null);

  useEffect(() => {
    if (!gl) return;

    const monitor = new WebGLHealthMonitor(gl, sceneName, (event) => {
      console.info(`[CanvasWebGLMonitor - ${sceneName}] Status: ${event.status} - ${event.message}`);
      if (onHealthEvent) {
        onHealthEvent(event);
      }
    });

    monitorRef.current = monitor;

    return () => {
      monitor.dispose();
      monitorRef.current = null;
    };
  }, [gl, sceneName, onHealthEvent]);

  // Record active frame heartbeat on every rendered frame
  useFrame(() => {
    if (monitorRef.current) {
      monitorRef.current.recordFrame();
    }
  });

  return null;
};
