import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Layers, ShieldAlert, Cpu } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onFallbackTo2D?: () => void;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  errorStack: string;
  isWebGLSupported: boolean;
}

export function checkWebGLAvailability(): { supported: boolean; reason?: string } {
  if (typeof window === 'undefined') return { supported: true };
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

    if (!gl) {
      return {
        supported: false,
        reason: 'WebGL context could not be initialized. Your browser or GPU may have hardware acceleration disabled.',
      };
    }
    return { supported: true };
  } catch (e) {
    return {
      supported: false,
      reason: e instanceof Error ? e.message : 'Unknown WebGL failure',
    };
  }
}

export class WebGLErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
    errorStack: '',
    isWebGLSupported: true,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message || 'Unknown WebGL render pipeline exception',
      errorStack: error.stack || '',
      isWebGLSupported: checkWebGLAvailability().supported,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[WebGLErrorBoundary] WebGL Canvas Exception Caught:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
      errorMessage: '',
      errorStack: '',
      isWebGLSupported: true,
    });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full min-h-[350px] flex flex-col items-center justify-center p-6 bg-neutral-950/95 text-amber-100 border-2 border-red-500/60 rounded-3xl shadow-2xl backdrop-blur-md select-none">
          <div className="max-w-md w-full flex flex-col items-center text-center">
            {/* ALERT ICON */}
            <div className="w-16 h-16 rounded-2xl bg-red-950/80 border-2 border-red-500 flex items-center justify-center mb-4 shadow-[0_0_25px_rgba(239,68,68,0.5)]">
              <AlertTriangle className="w-8 h-8 text-red-400 animate-pulse" />
            </div>

            <h3 className="font-serif font-black text-xl sm:text-2xl text-red-300 uppercase tracking-wider mb-1">
              {this.props.fallbackTitle || '3D WebGL Scene Initialization Error'}
            </h3>

            <p className="text-xs font-serif text-neutral-300 mb-4">
              The 3D graphics pipeline encountered a GPU or WebGL context failure.
            </p>

            {/* ERROR DIAGNOSTICS */}
            <div className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-4 mb-6 text-left font-mono text-xs flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11px] pb-2 border-b border-neutral-800">
                <span className="text-neutral-400 flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  <span>WebGL 2.0 Context:</span>
                </span>
                <span className={this.state.isWebGLSupported ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                  {this.state.isWebGLSupported ? 'Detected' : 'Unavailable'}
                </span>
              </div>

              <div>
                <span className="text-red-400 font-bold">Error: </span>
                <span className="text-neutral-200 break-words">{this.state.errorMessage}</span>
              </div>

              <div className="text-[10px] text-neutral-500 italic mt-1">
                Tip: Ensure Hardware Acceleration is enabled in your browser settings (Chrome: Settings &gt; System &gt; "Use graphics acceleration when available").
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="flex flex-wrap items-center justify-center gap-3 w-full">
              <button
                onClick={this.handleRetry}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-neutral-950 font-serif font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 cursor-pointer flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry 3D WebGL</span>
              </button>

              {this.props.onFallbackTo2D && (
                <button
                  onClick={this.props.onFallbackTo2D}
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

    return this.props.children;
  }
}
