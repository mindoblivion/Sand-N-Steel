import React, { useState, useEffect, ReactNode } from 'react';
import { Shield, RefreshCw, AlertTriangle, Cpu, Layers, Sparkles, CheckCircle2 } from 'lucide-react';
import { runWebGLDiagnostics, WebGLDiagnosticReport, WebGLHealthEvent } from '../../utils/webglDebugger';
import { sounds } from '../../audio/soundEffects';

interface WebGLReadyGuardProps {
  children: ReactNode;
  sceneName: string;
  fallbackTitle?: string;
  onFallbackTo2D?: () => void;
}

/**
 * Lazy-Loading WebGL Scene Guard Wrapper
 * Verifies WebGL context health before mounting the 3D scene,
 * preventing 'black screen' issues caused by premature rendering on unstable GPUs.
 */
export const WebGLReadyGuard: React.FC<WebGLReadyGuardProps> = ({
  children,
  sceneName,
  fallbackTitle,
  onFallbackTo2D,
}) => {
  const [stage, setSetStage] = useState<'verifying' | 'ready' | 'error'>('verifying');
  const [report, setReport] = useState<WebGLDiagnosticReport | null>(null);
  const [healthEvent, setHealthEvent] = useState<WebGLHealthEvent | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    setSetStage('verifying');

    // Run pre-flight WebGL check on a slight tick to allow DOM layout to settle
    const timer = setTimeout(() => {
      const diag = runWebGLDiagnostics();
      if (!isMounted) return;

      setReport(diag);

      if (diag.isSupported) {
        setSetStage('ready');
      } else {
        console.warn(`[WebGLReadyGuard - ${sceneName}] Pre-flight verification failed:`, diag.failureReason);
        setSetStage('error');
      }
    }, 120);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [sceneName, attemptCount]);

  const handleRetry = () => {
    sounds.playClick();
    setAttemptCount((prev) => prev + 1);
  };

  const handleHealthEvent = (event: WebGLHealthEvent) => {
    setHealthEvent(event);
    if (event.status === 'failed' || event.status === 'lost') {
      console.warn(`[WebGLReadyGuard - ${sceneName}] Received critical health event:`, event.message);
    }
  };

  // 1. PRE-FLIGHT VERIFICATION LOADING STATE
  if (stage === 'verifying') {
    return (
      <div className="w-full h-full min-h-[380px] flex flex-col items-center justify-center p-6 bg-neutral-950 text-amber-100 select-none relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.08)_0%,transparent_70%)] pointer-events-none"></div>

        <div className="flex flex-col items-center gap-4 text-center z-10 max-w-sm">
          {/* ROMAN SHIELD SPINNER */}
          <div className="relative w-16 h-16 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-2 border-amber-500/20 border-t-amber-400 animate-spin"></div>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-600 to-yellow-600 border border-amber-300 flex items-center justify-center shadow-lg">
              <Shield className="w-5 h-5 text-neutral-950" />
            </div>
          </div>

          <div>
            <h4 className="font-serif font-black text-sm uppercase tracking-wider text-amber-200">
              Initializing 3D World Context
            </h4>
            <p className="text-[11px] font-mono text-amber-400/70 mt-1">
              Verifying GPU Acceleration &amp; WebGL 2.0 Pipelines ({sceneName})...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. HARDWARE INCOMPATIBILITY OR CONTEXT CREATION FAILURE STATE
  if (stage === 'error' || (healthEvent && healthEvent.status === 'failed')) {
    const activeReport = report || runWebGLDiagnostics();
    const reason = healthEvent ? healthEvent.message : activeReport.failureReason || 'WebGL context lost or rejected by browser.';

    return (
      <div className="w-full h-full min-h-[380px] flex flex-col items-center justify-center p-6 bg-neutral-950/95 text-amber-100 border-2 border-red-500/60 rounded-3xl shadow-2xl backdrop-blur-md select-none">
        <div className="max-w-md w-full flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-950/80 border-2 border-red-500 flex items-center justify-center mb-4 shadow-[0_0_25px_rgba(239,68,68,0.5)]">
            <AlertTriangle className="w-8 h-8 text-red-400 animate-pulse" />
          </div>

          <h3 className="font-serif font-black text-xl sm:text-2xl text-red-300 uppercase tracking-wider mb-1">
            {fallbackTitle || 'WebGL Context Initialization Failure'}
          </h3>

          <p className="text-xs font-serif text-neutral-300 mb-4">
            The 3D graphics pipeline could not establish a stable WebGL context on this device.
          </p>

          <div className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-4 mb-6 text-left font-mono text-xs flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px] pb-2 border-b border-neutral-800">
              <span className="text-neutral-400 flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>GPU Renderer:</span>
              </span>
              <span className="text-neutral-200 truncate max-w-[200px]" title={activeReport.unmaskedRenderer}>
                {activeReport.unmaskedRenderer}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] pb-2 border-b border-neutral-800">
              <span className="text-neutral-400">WebGL Version:</span>
              <span className={activeReport.isSupported ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                {activeReport.version}
              </span>
            </div>

            <div className="pt-1">
              <span className="text-red-400 font-bold">Diagnostic Log: </span>
              <span className="text-neutral-300 break-words">{reason}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 w-full">
            <button
              onClick={handleRetry}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-neutral-950 font-serif font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry WebGL</span>
            </button>

            {onFallbackTo2D && (
              <button
                onClick={onFallbackTo2D}
                className="flex-1 py-3 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-600 font-serif font-bold text-xs uppercase tracking-wider active:scale-95 cursor-pointer flex items-center justify-center gap-2"
              >
                <Layers className="w-4 h-4 text-cyan-400" />
                <span>2D Gladiator Hub</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 3. READY STATE: LAZY-LOAD 3D SCENE ARCHITECTURE
  return (
    <React.Fragment key={attemptCount}>
      {children}
    </React.Fragment>
  );
};
