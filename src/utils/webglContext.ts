import * as THREE from 'three';

/**
 * Diagnostic & recovery utilities for WebGL canvas elements
 */

export interface WebGLDiagnosticReport {
  isSupported: boolean;
  version: 'WebGL 2.0' | 'WebGL 1.0' | 'None';
  vendor: string;
  renderer: string;
  maxTextureSize: number;
  devicePixelRatio: number;
}

/**
 * Proactively inspects browser WebGL capability
 */
export function getWebGLDiagnosticReport(): WebGLDiagnosticReport {
  if (typeof window === 'undefined') {
    return {
      isSupported: true,
      version: 'WebGL 2.0',
      vendor: 'Server',
      renderer: 'Headless',
      maxTextureSize: 4096,
      devicePixelRatio: 1,
    };
  }

  try {
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2', { powerPreference: 'high-performance' });
    const gl1 = !gl2
      ? canvas.getContext('webgl', { powerPreference: 'high-performance' }) ||
        (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null)
      : null;

    const gl = gl2 || gl1;

    if (!gl) {
      return {
        isSupported: false,
        version: 'None',
        vendor: 'Unknown',
        renderer: 'Unknown',
        maxTextureSize: 0,
        devicePixelRatio: window.devicePixelRatio || 1,
      };
    }

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)) : 'Generic';
    const renderer = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : 'Generic GPU';
    const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 2048;

    return {
      isSupported: true,
      version: gl2 ? 'WebGL 2.0' : 'WebGL 1.0',
      vendor,
      renderer,
      maxTextureSize,
      devicePixelRatio: window.devicePixelRatio || 1,
    };
  } catch {
    return {
      isSupported: false,
      version: 'None',
      vendor: 'Error',
      renderer: 'Error',
      maxTextureSize: 0,
      devicePixelRatio: window.devicePixelRatio || 1,
    };
  }
}

/**
 * Logs WebGL initialization parameters and hardware details for debugging
 */
export function logCanvasWebGLCreated(gl: THREE.WebGLRenderer, sceneName: string) {
  try {
    const glCtx = gl.getContext();
    const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && glCtx instanceof WebGL2RenderingContext;
    const debugInfo = glCtx.getExtension('WEBGL_debug_renderer_info');
    const vendor = debugInfo ? glCtx.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'Generic';
    const renderer = debugInfo ? glCtx.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Generic GPU';
    const maxTextureSize = glCtx.getParameter(glCtx.MAX_TEXTURE_SIZE);

    console.info(`[WebGL 3D Context - ${sceneName}]`, {
      version: isWebGL2 ? 'WebGL 2.0' : 'WebGL 1.0',
      vendor,
      renderer,
      maxTextureSize,
      pixelRatio: window.devicePixelRatio || 1,
    });
  } catch (err) {
    console.warn(`[WebGL 3D Context - ${sceneName}] Could not read parameters:`, err);
  }
}

/**
 * Hooks up context lost & restoration event handlers on the actual canvas element.
 * Calling event.preventDefault() is MANDATORY for the browser to trigger webglcontextrestored!
 */
export function setupCanvasContextRestoration(
  gl: THREE.WebGLRenderer,
  onStatusChange?: (status: 'lost' | 'restored') => void
): () => void {
  const canvas = gl.domElement;
  if (!canvas) return () => {};

  const handleContextLost = (event: Event) => {
    // CRITICAL: prevents the browser from permanently destroying the context
    event.preventDefault();
    console.warn('[WebGL Canvas] webglcontextlost event received. GPU resources detached.');
    if (onStatusChange) onStatusChange('lost');
  };

  const handleContextRestored = () => {
    console.info('[WebGL Canvas] webglcontextrestored event received. GPU resources re-established.');
    if (onStatusChange) onStatusChange('restored');
  };

  canvas.addEventListener('webglcontextlost', handleContextLost, false);
  canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

  return () => {
    canvas.removeEventListener('webglcontextlost', handleContextLost);
    canvas.removeEventListener('webglcontextrestored', handleContextRestored);
  };
}
