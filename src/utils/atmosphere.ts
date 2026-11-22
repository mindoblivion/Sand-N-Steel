import * as THREE from 'three';
import type { TimePhase } from './timeState';
import {
  A1_PHASE_BY_PROFILE,
  DEFAULT_ATMOSPHERE,
  DEFAULT_PHASE,
  getPhaseLight,
  resolveAtmosphere,
  sunDirection,
  type AtmosphereProfileName,
  type PhaseLight,
} from './atmosphereData';

// Preserve the original public API for scene code and existing consumers.
export * from './atmosphereData';

/** How far from the shadow target the key light is placed — a direction, not a distance. */
export const ATMOSPHERE_SUN_DISTANCE = 120;

/**
 * The shadow target: the middle of the city's own extent (X ±90, Z −100…40), so the
 * key light's orthographic frustum fits the city instead of the camera's current view.
 */
export const ATMOSPHERE_SHADOW_TARGET: [number, number, number] = [0, 0, -30];

/** The city's half-extent along X, and the half-depth of its Z band. */
export const ATMOSPHERE_SHADOW_HALF_EXTENT = 90;
export const ATMOSPHERE_SHADOW_HALF_DEPTH = 70;

/** The shadow map's edge, in pixels (A1 raises the old 1024). */
export const ATMOSPHERE_SHADOW_MAP_SIZE = 2048;

/** The one dome this module builds, and the names it marks its objects with. */
export const SKY_DOME_RADIUS = 400;
export const SKY_DOME_NAME = 'atmosphere-sky';
/**
 * The single directional key light's object name. It is the sun by day and the
 * MOON at night — one light, never two — so the name is kept from A1.
 */
export const SUN_LIGHT_NAME = 'atmosphere-sun';
export const SUN_TARGET_NAME = 'atmosphere-sun-target';
export const HEMI_LIGHT_NAME = 'atmosphere-hemi';

/** How long a scene's entry crossfade lasts, in milliseconds (visual only). */
export const PHASE_CROSSFADE_MS = 1200;

/** The renderer fields this module writes. Structural, so a stub works in tests. */
export interface AtmosphereRenderer {
  outputColorSpace: string;
  toneMapping: number;
  toneMappingExposure: number;
}

/**
 * A hex colour as the 0…1 sRGB numbers a raw `ShaderMaterial` writes to the
 * sRGB drawing buffer. Deliberately NOT `THREE.Color`: that converts to the linear
 * working space, and a shader without three's colour-space chunk would then write
 * linear values into an sRGB buffer (the dome would render far too dark).
 */
function srgbColour(hex: string): THREE.Vector3 {
  const value = parseInt(hex.replace('#', ''), 16);
  return new THREE.Vector3(
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  );
}

/** Mix two `#rrggbb` colours in sRGB — the crossfade's colour blend. */
function mixHex(from: string, to: string, t: number): string {
  const channel = (hex: string, offset: number): number =>
    parseInt(hex.slice(offset, offset + 2), 16);
  const mixed = [1, 3, 5].map((offset) => {
    const value = Math.round(
      channel(from, offset) + (channel(to, offset) - channel(from, offset)) * t,
    );
    return value.toString(16).padStart(2, '0');
  });
  return `#${mixed.join('')}`;
}

const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;

/** A whole row blended from `from` toward `to` at `t` (0 = from, 1 = to). */
export function mixPhaseLight(from: PhaseLight, to: PhaseLight, t: number): PhaseLight {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  // Both endpoints are the rows THEMSELVES, bit for bit: a fade that has finished
  // must leave exactly the target row behind, and `from + (to - from) * 1` drifts by
  // an ulp (0.55 → 0.5500000000000003) which would then persist in the rig.
  if (clamped === 0) return { ...from };
  if (clamped === 1) return { ...to };
  return {
    skyZenith: mixHex(from.skyZenith, to.skyZenith, clamped),
    skyMid: mixHex(from.skyMid, to.skyMid, clamped),
    skyHorizon: mixHex(from.skyHorizon, to.skyHorizon, clamped),
    sunGlow: mixHex(from.sunGlow, to.sunGlow, clamped),
    fogColor: mixHex(from.fogColor, to.fogColor, clamped),
    fogNear: lerp(from.fogNear, to.fogNear, clamped),
    fogFar: lerp(from.fogFar, to.fogFar, clamped),
    sunColor: mixHex(from.sunColor, to.sunColor, clamped),
    sunIntensity: lerp(from.sunIntensity, to.sunIntensity, clamped),
    sunElevationDeg: lerp(from.sunElevationDeg, to.sunElevationDeg, clamped),
    sunAzimuthDeg: lerp(from.sunAzimuthDeg, to.sunAzimuthDeg, clamped),
    hemiSky: mixHex(from.hemiSky, to.hemiSky, clamped),
    hemiGround: mixHex(from.hemiGround, to.hemiGround, clamped),
    hemiIntensity: lerp(from.hemiIntensity, to.hemiIntensity, clamped),
    exposure: lerp(from.exposure, to.exposure, clamped),
    envIntensity: lerp(from.envIntensity, to.envIntensity, clamped),
    starAmount: lerp(from.starAmount, to.starAmount, clamped),
    lampGlow: lerp(from.lampGlow, to.lampGlow, clamped),
    // Discrete: the key is one body or the other; the fainter one is the blend's.
    keyLight: clamped < 0.5 ? from.keyLight : to.keyLight,
  };
}

/**
 * The dome's vertex shader. `gl_Position.z = w` parks every fragment on the far
 * plane, which is what lets a 400-unit sphere survive a camera whose far plane is
 * 180 (the city Canvas's) or 80 (the duel's) — the same trick drei's `<Sky>` uses.
 * Depth writing is off, so the dome never occludes anything.
 */
const SKY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldDirection;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldDirection = worldPosition.xyz - cameraPosition;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
    gl_Position.z = gl_Position.w;
  }
`;

/**
 * The dome's fragment shader: a three-stop vertical gradient (horizon → mid →
 * zenith), the horizon tone carried under the horizon so the dome closes on dust
 * rather than on a hard edge, a procedural star field (T1 — a hash of the view
 * direction, NO texture, no new draw call), and the key light's disc and halo
 * painted from that row's own direction and glow colour. At night the same disc
 * is the MOON: nothing about the term changes with the body.
 */
const SKY_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vWorldDirection;
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  uniform vec3 uSunDirection;
  uniform float uStarAmount;

  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  // One star per cell, from a hash of the cell itself — deterministic, no texture.
  vec3 starField(vec3 direction, float amount) {
    if (amount <= 0.0) return vec3(0.0);
    vec3 p = direction * 180.0;
    float present = step(0.982, hash13(floor(p)));
    float falloff = smoothstep(0.45, 0.0, length(fract(p) - 0.5));
    float aboveHorizon = smoothstep(0.02, 0.35, direction.y);
    return vec3(0.86, 0.90, 1.0) * (present * falloff * aboveHorizon * amount);
  }

  void main() {
    vec3 direction = normalize(vWorldDirection);
    float height = clamp(direction.y, 0.0, 1.0);

    vec3 sky = mix(uHorizon, uMid, smoothstep(0.0, 0.32, height));
    sky = mix(sky, uZenith, smoothstep(0.22, 0.95, height));

    // Below the horizon: close on a dimmed horizon tone, never a hard seam.
    float below = clamp(-direction.y * 4.0, 0.0, 1.0);
    sky = mix(sky, uHorizon * 0.82, below);

    sky += starField(direction, uStarAmount);

    float sun = max(dot(direction, normalize(uSunDirection)), 0.0);
    sky += uGlow * (pow(sun, 12.0) * 0.35 + pow(sun, 220.0) * 2.5);

    gl_FragColor = vec4(sky, 1.0);
  }
`;

/** The gradient dome for one row — one mesh, one material, one draw call. */
export function createSkyDome(profile: PhaseLight): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: srgbColour(profile.skyZenith) },
      uMid: { value: srgbColour(profile.skyMid) },
      uHorizon: { value: srgbColour(profile.skyHorizon) },
      uGlow: { value: srgbColour(profile.sunGlow) },
      uSunDirection: {
        value: new THREE.Vector3(
          ...sunDirection(profile.sunElevationDeg, profile.sunAzimuthDeg),
        ),
      },
      uStarAmount: { value: profile.starAmount },
    },
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  material.toneMapped = false;

  const dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_DOME_RADIUS, 16, 12), material);
  dome.name = SKY_DOME_NAME;
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  dome.matrixAutoUpdate = false;
  dome.updateMatrix();
  return dome;
}

/**
 * The row's key light — the sun by day, the MOON at night, the same single
 * shadow-casting directional light either way — with the frustum fitted to the city.
 */
export function createSunLight(profile: PhaseLight): THREE.DirectionalLight {
  const sun = new THREE.DirectionalLight(profile.sunColor, profile.sunIntensity);
  sun.name = SUN_LIGHT_NAME;

  const direction = sunDirection(profile.sunElevationDeg, profile.sunAzimuthDeg);
  const [targetX, targetY, targetZ] = ATMOSPHERE_SHADOW_TARGET;
  sun.position.set(
    targetX + direction[0] * ATMOSPHERE_SUN_DISTANCE,
    targetY + direction[1] * ATMOSPHERE_SUN_DISTANCE,
    targetZ + direction[2] * ATMOSPHERE_SUN_DISTANCE,
  );
  sun.target.name = SUN_TARGET_NAME;
  sun.target.position.set(targetX, targetY, targetZ);
  sun.target.updateMatrixWorld();

  sun.castShadow = true;
  sun.shadow.mapSize.set(ATMOSPHERE_SHADOW_MAP_SIZE, ATMOSPHERE_SHADOW_MAP_SIZE);
  sun.shadow.camera.left = -ATMOSPHERE_SHADOW_HALF_EXTENT;
  sun.shadow.camera.right = ATMOSPHERE_SHADOW_HALF_EXTENT;
  sun.shadow.camera.top = ATMOSPHERE_SHADOW_HALF_DEPTH;
  sun.shadow.camera.bottom = -ATMOSPHERE_SHADOW_HALF_DEPTH;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 320;
  sun.shadow.camera.updateProjectionMatrix();
  // The bias pair the city's old key light already used, kept so shadow acne does
  // not return at the larger map.
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  return sun;
}

/** The row's hemisphere bounce — the sky's fill and the ground's warmth. */
export function createHemisphereLight(profile: PhaseLight): THREE.HemisphereLight {
  const hemi = new THREE.HemisphereLight(profile.hemiSky, profile.hemiGround, profile.hemiIntensity);
  hemi.name = HEMI_LIGHT_NAME;
  return hemi;
}

/**
 * Remove everything the rig added. Idempotent: a scene that never had a rig is left
 * alone, so cleanup after an unmount or before a re-apply is safe.
 */
export function clearAtmosphere(scene: THREE.Scene): void {
  const dome = scene.getObjectByName(SKY_DOME_NAME) as THREE.Mesh | undefined;
  if (dome) {
    scene.remove(dome);
    dome.geometry.dispose();
    (dome.material as THREE.Material).dispose();
  }
  const sun = scene.getObjectByName(SUN_LIGHT_NAME) as THREE.DirectionalLight | undefined;
  if (sun) {
    if (sun.shadow?.map) {
      sun.shadow.map.dispose();
      sun.shadow.map = null;
    }
    scene.remove(sun);
  }
  const target = scene.getObjectByName(SUN_TARGET_NAME);
  if (target) scene.remove(target);
  const hemi = scene.getObjectByName(HEMI_LIGHT_NAME);
  if (hemi) scene.remove(hemi);
}

/** Write the renderer's colour space / tone-mapping curve (and optionally exposure). */
export function configureAtmosphereRenderer(
  renderer: AtmosphereRenderer,
  exposure?: number,
): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  if (exposure !== undefined) renderer.toneMappingExposure = exposure;
}

/** The live objects one mounted rig owns, so a fade can drive them in place. */
export interface AtmosphereRig {
  profile: PhaseLight;
  fog: THREE.Fog;
  dome: THREE.Mesh;
  keyLight: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /**
   * Blend every live value from `from` toward this rig's own row (0…1). Visual only:
   * it writes uniforms, the fog and the two lights — never React state.
   */
  blend(from: PhaseLight, progress: number): void;
}

/** Apply a whole row onto an existing rig's objects (also the fade's final frame). */
function writeRig(rig: AtmosphereRig, row: PhaseLight): void {
  const material = rig.dome.material as THREE.ShaderMaterial;
  (material.uniforms.uZenith.value as THREE.Vector3).copy(srgbColour(row.skyZenith));
  (material.uniforms.uMid.value as THREE.Vector3).copy(srgbColour(row.skyMid));
  (material.uniforms.uHorizon.value as THREE.Vector3).copy(srgbColour(row.skyHorizon));
  (material.uniforms.uGlow.value as THREE.Vector3).copy(srgbColour(row.sunGlow));
  (material.uniforms.uSunDirection.value as THREE.Vector3).set(
    ...sunDirection(row.sunElevationDeg, row.sunAzimuthDeg),
  );
  material.uniforms.uStarAmount.value = row.starAmount;

  rig.fog.color.set(row.fogColor);
  rig.fog.near = row.fogNear;
  rig.fog.far = row.fogFar;

  rig.keyLight.color.set(row.sunColor);
  rig.keyLight.intensity = row.sunIntensity;
  const direction = sunDirection(row.sunElevationDeg, row.sunAzimuthDeg);
  const [targetX, targetY, targetZ] = ATMOSPHERE_SHADOW_TARGET;
  rig.keyLight.position.set(
    targetX + direction[0] * ATMOSPHERE_SUN_DISTANCE,
    targetY + direction[1] * ATMOSPHERE_SUN_DISTANCE,
    targetZ + direction[2] * ATMOSPHERE_SUN_DISTANCE,
  );

  rig.hemi.color.set(row.hemiSky);
  rig.hemi.groundColor.set(row.hemiGround);
  rig.hemi.intensity = row.hemiIntensity;
}

/**
 * Build one phase's rig on a scene and hand back its live objects. The caller owns
 * cleanup (`clearAtmosphere`) and, if it wants an entry fade, calls `blend`.
 */
export function createAtmosphereRig(
  scene: THREE.Scene,
  phaseId: TimePhase | string = DEFAULT_PHASE,
): AtmosphereRig {
  const profile = getPhaseLight(phaseId);

  const fog = new THREE.Fog(profile.fogColor, profile.fogNear, profile.fogFar);
  scene.fog = fog;

  const dome = createSkyDome(profile);
  scene.add(dome);
  const keyLight = createSunLight(profile);
  scene.add(keyLight);
  scene.add(keyLight.target);
  const hemi = createHemisphereLight(profile);
  scene.add(hemi);

  scene.environmentIntensity = profile.envIntensity;

  const rig: AtmosphereRig = {
    profile,
    fog,
    dome,
    keyLight,
    hemi,
    blend(from: PhaseLight, progress: number) {
      const mixed = mixPhaseLight(from, profile, progress);
      writeRig(rig, mixed);
      scene.environmentIntensity = mixed.envIntensity;
    },
  };
  return rig;
}

/** The phase the LAST entry applied — the entry crossfade's `from` row. */
let lastAppliedPhaseLight: PhaseLight | null = null;

/** The row the last applied entry left behind (module-level, survives remounts). */
export function getLastAppliedPhaseLight(): PhaseLight | null {
  return lastAppliedPhaseLight;
}

/** Record that a scene entry applied `profile` (city, duel and race all do). */
export function markPhaseApplied(profile: PhaseLight): void {
  lastAppliedPhaseLight = profile;
}

/**
 * Apply one phase row to a scene — the ONE call a scene makes on entry.
 *
 * Sets the fog (colour from the row, per DIRECTOR RULING A), builds and adds the
 * dome, the key light (with its shadow frustum) and the hemisphere bounce, writes
 * the scene's environment intensity, and — when a renderer is handed in — the
 * renderer's output colour space (sRGB), tone-mapping curve (ACES Filmic) and the
 * row's exposure. Re-applying clears the previous rig first, so phases swap with no
 * duplicate sky or lights.
 */
export function applyPhaseLight(
  scene: THREE.Scene,
  phaseId: TimePhase | string = DEFAULT_PHASE,
  renderer?: AtmosphereRenderer,
): PhaseLight {
  clearAtmosphere(scene);
  const rig = createAtmosphereRig(scene, phaseId);
  if (renderer) configureAtmosphereRenderer(renderer, rig.profile.exposure);
  markPhaseApplied(rig.profile);
  return rig.profile;
}

/**
 * Atmosphere A1's entry point, kept as a thin wrapper for A1-era call sites: maps
 * its two settings names onto their phase rows and delegates to `applyPhaseLight`.
 * `goldenHour → golden`, `midday → midday`. New code calls `applyPhaseLight`.
 */
export function applyAtmosphere(
  scene: THREE.Scene,
  profileName: AtmosphereProfileName | string = DEFAULT_ATMOSPHERE,
  renderer?: AtmosphereRenderer,
): PhaseLight {
  return applyPhaseLight(scene, A1_PHASE_BY_PROFILE[resolveAtmosphere(profileName)], renderer);
}
