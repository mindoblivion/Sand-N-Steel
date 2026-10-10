import * as THREE from 'three';

export interface GPULimits {
  maxTextureSize: number;
  maxVertexAttribs: number;
  maxVaryingVectors: number;
  maxVertexUniformVectors: number;
  maxFragmentUniformVectors: number;
  supportsFloatTextures: boolean;
  supportsDrawBuffers: boolean;
  isSoftwareRenderer: boolean;
}

export interface WebGLDiagnosticReport {
  isSupported: boolean;
  version: 'WebGL 2.0' | 'WebGL 1.0' | 'None';
  vendor: string;
  renderer: string;
  unmaskedVendor: string;
  unmaskedRenderer: string;
  limits: GPULimits;
  devicePixelRatio: number;
  isSoftwareRasterizer: boolean;
  failureReason?: string;
}

/**
 * Pre-flight WebGL Diagnostic Checker
 * Proactively tests WebGL context creation and inspects hardware limits
 */
export function runWebGLDiagnostics(): WebGLDiagnosticReport {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      isSupported: true,
      version: 'WebGL 2.0',
      vendor: 'Server',
      renderer: 'Headless',
      unmaskedVendor: 'Server',
      unmaskedRenderer: 'Headless',
      limits: {
        maxTextureSize: 4096,
        maxVertexAttribs: 16,
        maxVaryingVectors: 16,
        maxVertexUniformVectors: 256,
        maxFragmentUniformVectors: 256,
        supportsFloatTextures: true,
        supportsDrawBuffers: true,
        isSoftwareRenderer: false,
      },
      devicePixelRatio: 1,
      isSoftwareRasterizer: false,
    };
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;

    const gl2 = canvas.getContext('webgl2', {
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    });

    const gl1 = !gl2
      ? (canvas.getContext('webgl', { powerPreference: 'high-performance' }) as WebGLRenderingContext | null) ||
        (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null)
      : null;

    const gl = gl2 || gl1;

    if (!gl) {
      return {
        isSupported: false,
        version: 'None',
        vendor: 'Unknown',
        renderer: 'Unknown',
        unmaskedVendor: 'Unknown',
        unmaskedRenderer: 'Unknown',
        limits: {
          maxTextureSize: 0,
          maxVertexAttribs: 0,
          maxVaryingVectors: 0,
          maxVertexUniformVectors: 0,
          maxFragmentUniformVectors: 0,
          supportsFloatTextures: false,
          supportsDrawBuffers: false,
          isSoftwareRenderer: true,
        },
        devicePixelRatio: window.devicePixelRatio || 1,
        isSoftwareRasterizer: true,
        failureReason: 'WebGL context creation returned null. Browser hardware acceleration may be disabled or blocked by OS/GPU driver.',
      };
    }

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const unmaskedVendor = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL))
      : String(gl.getParameter(gl.VENDOR));
    const unmaskedRenderer = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));

    const lowerRenderer = unmaskedRenderer.toLowerCase();
    const isSoftwareRasterizer =
      lowerRenderer.includes('swiftshader') ||
      lowerRenderer.includes('llvmpipe') ||
      lowerRenderer.includes('software rasterizer') ||
      lowerRenderer.includes('microsoft basic render') ||
      lowerRenderer.includes('angle (software') ||
      lowerRenderer.includes('mesa');

    const limits: GPULimits = {
      maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 2048,
      maxVertexAttribs: Number(gl.getParameter(gl.MAX_VERTEX_ATTRIBS)) || 8,
      maxVaryingVectors: Number(gl.getParameter(gl.MAX_VARYING_VECTORS)) || 8,
      maxVertexUniformVectors: Number(gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS)) || 128,
      maxFragmentUniformVectors: Number(gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)) || 64,
      supportsFloatTextures: Boolean(gl.getExtension('OES_texture_float') || gl2),
      supportsDrawBuffers: Boolean(gl.getExtension('WEBGL_draw_buffers') || gl2),
      isSoftwareRenderer: isSoftwareRasterizer,
    };

    let failureReason: string | undefined = undefined;
    if (limits.maxTextureSize < 1024) {
      failureReason = `GPU max texture size (${limits.maxTextureSize}px) is below minimum requirement (1024px).`;
    } else if (isSoftwareRasterizer) {
      failureReason = `Software rasterizer detected (${unmaskedRenderer}). Performance may be degraded.`;
    }

    // Clean up temporary context
    const loseContextExt = gl.getExtension('WEBGL_lose_context');
    if (loseContextExt) {
      loseContextExt.loseContext();
    }

    return {
      isSupported: true,
      version: gl2 ? 'WebGL 2.0' : 'WebGL 1.0',
      vendor: String(gl.getParameter(gl.VENDOR)),
      renderer: String(gl.getParameter(gl.RENDERER)),
      unmaskedVendor,
      unmaskedRenderer,
      limits,
      devicePixelRatio: window.devicePixelRatio || 1,
      isSoftwareRasterizer,
      failureReason,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      isSupported: false,
      version: 'None',
      vendor: 'Error',
      renderer: 'Error',
      unmaskedVendor: 'Error',
      unmaskedRenderer: 'Error',
      limits: {
        maxTextureSize: 0,
        maxVertexAttribs: 0,
        maxVaryingVectors: 0,
        maxVertexUniformVectors: 0,
        maxFragmentUniformVectors: 0,
        supportsFloatTextures: false,
        supportsDrawBuffers: false,
        isSoftwareRenderer: true,
      },
      devicePixelRatio: window.devicePixelRatio || 1,
      isSoftwareRasterizer: true,
      failureReason: `WebGL pre-flight error: ${errorMsg}`,
    };
  }
}

export type WebGLHealthStatus = 'healthy' | 'warning' | 'lost' | 'recovering' | 'failed';

export interface WebGLHealthEvent {
  status: WebGLHealthStatus;
  message: string;
  report: WebGLDiagnosticReport;
  timestamp: number;
}

/**
 * Active WebGL Health Monitor for Three.js Canvas Instance
 * Monitors frame heartbeat, context loss, and attempts automatic recovery
 */
export class WebGLHealthMonitor {
  private renderer: THREE.WebGLRenderer;
  private sceneName: string;
  private onStatusChange: (event: WebGLHealthEvent) => void;
  private status: WebGLHealthStatus = 'healthy';
  private frameCount = 0;
  private lastFrameTime = performance.now();
  private heartbeatTimer: number | null = null;
  private report: WebGLDiagnosticReport;
  private cleanupListeners: (() => void) | null = null;

  constructor(
    renderer: THREE.WebGLRenderer,
    sceneName: string,
    onStatusChange: (event: WebGLHealthEvent) => void
  ) {
    this.renderer = renderer;
    this.sceneName = sceneName;
    this.onStatusChange = onStatusChange;
    this.report = runWebGLDiagnostics();

    this.init();
  }

  private init() {
    const canvas = this.renderer.domElement;
    if (!canvas) return;

    const handleContextLost = (e: Event) => {
      e.preventDefault(); // Prevent browser from permanently killing context
      this.status = 'lost';
      console.warn(`[WebGLHealthMonitor - ${this.sceneName}] Context lost event captured. Attempting automatic recovery...`);

      this.notify('lost', 'WebGL Context Lost: GPU reset or driver crash detected. Attempting restoration...');

      // Attempt automatic recovery via extension if supported
      this.attemptAutomaticRecovery();
    };

    const handleContextRestored = () => {
      this.status = 'healthy';
      console.info(`[WebGLHealthMonitor - ${this.sceneName}] Context restored successfully.`);
      this.notify('healthy', 'WebGL Context successfully restored.');
    };

    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

    this.cleanupListeners = () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    };

    // Start heartbeat monitor
    this.startHeartbeat();
  }

  public recordFrame() {
    this.frameCount++;
    this.lastFrameTime = performance.now();
  }

  private startHeartbeat() {
    if (typeof window === 'undefined') return;

    this.heartbeatTimer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - this.lastFrameTime;

      // Check for WebGL errors on active context
      try {
        const glCtx = this.renderer.getContext();
        if (glCtx && !glCtx.isContextLost()) {
          const err = glCtx.getError();
          if (err !== glCtx.NO_ERROR) {
            console.warn(`[WebGLHealthMonitor - ${this.sceneName}] GL Error Flag Detected: 0x${err.toString(16)}`);
            this.notify('warning', `WebGL GL Error Flag: 0x${err.toString(16)}`);
          }
        }
      } catch (e) {
        // Context read error
      }

      // Detect GPU hang (if scene should be rendering but no frames recorded for > 3.5 seconds)
      if (elapsed > 3500 && this.status === 'healthy') {
        console.warn(`[WebGLHealthMonitor - ${this.sceneName}] GPU Stall / Frame Hang detected (>3.5s without frame)`);
        this.status = 'warning';
        this.notify('warning', 'GPU rendering stalled or frame loop interrupted.');
      }
    }, 2000);
  }

  public attemptAutomaticRecovery() {
    this.status = 'recovering';
    this.notify('recovering', 'Attempting GPU context recovery...');

    setTimeout(() => {
      try {
        const glCtx = this.renderer.getContext();
        const loseContextExt = glCtx ? glCtx.getExtension('WEBGL_lose_context') : null;

        if (loseContextExt && typeof loseContextExt.restoreContext === 'function') {
          loseContextExt.restoreContext();
        } else {
          console.warn(`[WebGLHealthMonitor - ${this.sceneName}] WEBGL_lose_context.restoreContext not available. Signaling full scene re-mount.`);
          this.notify('failed', 'Automatic WebGL restoration unavailable. Scene reload required.');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.notify('failed', `Context recovery failed: ${msg}`);
      }
    }, 500);
  }

  private notify(status: WebGLHealthStatus, message: string) {
    this.onStatusChange({
      status,
      message,
      report: this.report,
      timestamp: Date.now(),
    });
  }

  public dispose() {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.cleanupListeners) {
      this.cleanupListeners();
      this.cleanupListeners = null;
    }
  }
}
