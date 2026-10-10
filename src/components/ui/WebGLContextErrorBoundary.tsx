import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Layers, Cpu, Smartphone } from 'lucide-react';
import { getWebGLDiagnosticReport, WebGLDiagnosticReport } from '../../utils/webglContext';

interface WebGLContextErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  sceneName?: string;
  onFallbackTo2D?: () => void;
}

interface WebGLContextErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  errorStack: string;
  report: WebGLDiagnosticReport;
  retryCount: number;
}

export class WebGLContextErrorBoundary extends Component<
  WebGLContextErrorBoundaryProps,
  WebGLContextErrorBoundaryState
> {
  public state: WebGLContextErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
    errorStack: '',
    report: getWebGLDiagnosticReport(),
    retryCount: 0,
  };

  public static getDerivedStateFromError(error: Error): Partial<WebGLContextErrorBoundaryState> {
    const report = getWebGLDiagnosticReport();
    console.error(
      '[WebGLContextErrorBoundary] WebGL initialization failure caught:',
      error.message,
      '\nDiagnostic Report:',
      report
    );
    return {
      hasError: true,
      errorMessage: error.message || 'WebGL Context / GPU initialization failed',
      errorStack: error.stack || '',
      report,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[WebGLContextErrorBoundary${this.props.sceneName ? ` - ${this.props.sceneName}` : ''}] Component Stack Trace:`,
      errorInfo.componentStack
    );
  }

  public triggerContextLost = (reason = 'GPU context loss event') => {
    console.warn(`[WebGLContextErrorBoundary] Context lost event triggered: ${reason}`);
    this.setState({
      hasError: true,
      errorMessage: `WebGL Context Lost: ${reason}`,
      report: getWebGLDiagnosticReport(),
    });
  };

  public triggerContextRestored = () => {
    console.info('[WebGLContextErrorBoundary] Context restoration signal received. Reloading scene...');
    this.handleRetry();
  };

  private handleRetry = () => {
    console.info(
      `[WebGLContextErrorBoundary] Retrying scene initialization (Attempt #${this.state.retryCount + 1})...`
    );
    this.setState((prev) => ({
      hasError: false,
      errorMessage: '',
      errorStack: '',
      report: getWebGLDiagnosticReport(),
      retryCount: prev.retryCount + 1,
    }));
  };

  public render() {
    if (this.state.hasError) {
      const { report, errorMessage } = this.state;
      return (
        <div className="w-full h-full min-h-[360px] flex flex-col items-center justify-center p-6 bg-neutral-950/95 text-amber-100 border-2 border-red-500/60 rounded-3xl shadow-2xl backdrop-blur-md select-none">
          <div className="max-w-md w-full flex flex-col items-center text-center">
            {/* ALERT ICON */}
            <div className="w-16 h-16 rounded-2xl bg-red-950/80 border-2 border-red-500 flex items-center justify-center mb-4 shadow-[0_0_25px_rgba(239,68,68,0.5)]">
              <AlertTriangle className="w-8 h-8 text-red-400 animate-pulse" />
            </div>

            <h3 className="font-serif font-black text-xl sm:text-2xl text-red-300 uppercase tracking-wider mb-1">
              {this.props.fallbackTitle || '3D Scene Initialization Failure'}
            </h3>

            <p className="text-xs font-serif text-neutral-300 mb-4">
              The 3D canvas could not initialize due to GPU restrictions, hardware acceleration settings, or WebGL context loss.
            </p>

            {/* DIAGNOSTIC LOG & HARDWARE INFO */}
            <div className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-4 mb-6 text-left font-mono text-xs flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11px] pb-2 border-b border-neutral-800">
                <span className="text-neutral-400 flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  <span>WebGL Status:</span>
                </span>
                <span className={report.isSupported ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                  {report.isSupported ? `${report.version} Supported` : 'Not Supported'}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] pb-2 border-b border-neutral-800">
                <span className="text-neutral-400 flex items-center gap-1">
                  <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                  <span>GPU Driver:</span>
                </span>
                <span className="text-neutral-200 truncate max-w-[200px]" title={report.renderer}>
                  {report.renderer}
                </span>
              </div>

              <div className="pt-1">
                <span className="text-red-400 font-bold">Debug Log: </span>
                <span className="text-neutral-300 break-words">{errorMessage}</span>
              </div>

              <div className="text-[10px] text-neutral-500 italic mt-1">
                Check browser console for full stack trace. If on mobile, disable low-power mode or enable hardware acceleration.
              </div>
            </div>

            {/* ACTIONS */}
            <div className="flex flex-wrap items-center justify-center gap-3 w-full">
              <button
                onClick={this.handleRetry}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-neutral-950 font-serif font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 cursor-pointer flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry Scene</span>
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

    return <React.Fragment key={this.state.retryCount}>{this.props.children}</React.Fragment>;
  }
}
