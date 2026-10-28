/**
 * atmosphere.ts — the city's sky, sun and haze, as named profiles.
 *
 * ── WHY THIS MODULE EXISTS ───────────────────────────────────────────────
 * The city's presentation was a stack of unrelated literals: a drei `<Sky>` box, a
 * `<fog>` band, a hemisphere fill, two directional lights and whatever ambient they
 * implied. Atmosphere A1 replaces that stack — for the CITY scene only — with one
 * matched trio: a gradient sky dome, dust fog whose colour and band are the
 * profile's, and a single shadow-casting sun with a hemisphere bounce, all under
 * ACES at the profile's exposure. This module is the one place those numbers live.
 *
 * ── TWO PROFILES, ONE TABLE ──────────────────────────────────────────────
 * `goldenHour` is the default: a low western sun, warm dust, long shadows. `midday`
 * is the alternate: a high southern sun, a paler sky and a longer fog band. Both ship
 * complete — every field is present in each, so a consumer never merges two profiles.
 *
 * ── DIRECTOR NOTE: FOG IS NOT THE HORIZON ────────────────────────────────
 * The design's one-line brief said "dust fog matched to the horizon", but its own
 * table gives every profile a fog colour that is NOT its horizon colour
 * (goldenHour fog #E8C9A0 vs horizon #F4C078; midday fog #E3D3AC vs horizon
 * #E9DDBE). The table is the authority: `fogColor` drives `scene.fog` and
 * `skyHorizon` drives the dome's horizon stop, and no value was adjusted to make
 * them agree. A single-field "fog derived from horizon" rule is deferred to a
 * design ruling.
 *
 * ── WHAT `applyAtmosphere` OWNS ──────────────────────────────────────────
 * The sky dome, the fog, the sun and the hemisphere light — created imperatively on
 * the scene so the whole trio is applied by ONE call, and removed again by
 * `clearAtmosphere` so a profile change or an unmount cannot leave two skies behind.
 * The renderer's output colour space, tone-mapping curve and exposure are set by the
 * same call when a renderer is handed in.
 *
 * ── THE OATH BEAT IS NOT MIGRATED ────────────────────────────────────────
 * `cityLightProfile.ts`'s `oathDawn` rig still draws the gladiator's oath, because
 * this table has no dawn profile and inventing one would fabricate values the design
 * never gave. `CityHubScene` renders A1 for the city's own presentation and the
 * untouched `cityLightProfile` rig while the oath owns the screen.
 */

import * as THREE from 'three';

/** The rigs Atmosphere A1 ships. */
export type AtmosphereProfileName = 'goldenHour' | 'midday';

/** The two profile names, in the settings order (default first). */
export const ATMOSPHERE_NAMES: readonly AtmosphereProfileName[] = ['goldenHour', 'midday'];

/** The profile a missing or unknown name resolves to. */
export const DEFAULT_ATMOSPHERE: AtmosphereProfileName = 'goldenHour';

/** One complete rig: sky, haze, sun, bounce and exposure. */
export interface AtmosphereProfile {
  /** The dome's three gradient stops, and the glow the sun paints around itself. */
  skyZenith: string;
  skyMid: string;
  skyHorizon: string;
  sunGlow: string;
  /** The haze: its colour and its near/far band. Deliberately NOT `skyHorizon`. */
  fogColor: string;
  fogNear: number;
  fogFar: number;
  /** The sun: colour, intensity and where it stands. */
  sunColor: string;
  sunIntensity: number;
  /** Degrees above the horizon. */
  sunElevationDeg: number;
  /**
   * Compass bearing in degrees, clockwise from north (+north is −Z), so 247.5 is
   * WSW and 202.5 is SSW. `sunDirection()` turns a pair into a vector.
   */
  sunAzimuthDeg: number;
  /** The hemisphere bounce: sky colour, ground colour, intensity. */
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  /** The tone-mapping exposure the rig is drawn at. */
  exposure: number;
}

/**
 * The shipped table. Every value is the design's, verbatim.
 *
 * Azimuths: WSW = 247.5°, SSW = 202.5° (compass bearings, clockwise from north).
 */
export const ATMOSPHERE_PROFILES: Record<AtmosphereProfileName, AtmosphereProfile> = {
  goldenHour: {
    skyZenith: '#3D5A86',
    skyMid: '#C99A6B',
    skyHorizon: '#F4C078',
    sunGlow: '#FFD9A0',
    fogColor: '#E8C9A0',
    fogNear: 45,
    fogFar: 165,
    sunColor: '#FFBE78',
    sunIntensity: 2.6,
    sunElevationDeg: 14,
    sunAzimuthDeg: 247.5,
    hemiSky: '#93A7C8',
    hemiGround: '#B98A5E',
    hemiIntensity: 0.45,
    exposure: 1.1,
  },
  midday: {
    skyZenith: '#3A6EA8',
    skyMid: '#7FA8CC',
    skyHorizon: '#E9DDBE',
    sunGlow: '#FFF3D6',
    fogColor: '#E3D3AC',
    fogNear: 55,
    fogFar: 190,
    sunColor: '#FFF2DC',
    sunIntensity: 3.0,
    sunElevationDeg: 62,
    sunAzimuthDeg: 202.5,
    hemiSky: '#BFD6E8',
    hemiGround: '#C2A878',
    hemiIntensity: 0.55,
    exposure: 1.1,
  },
};

/** Total resolver: anything unrecognised is the default profile. */
export function resolveAtmosphere(profileName?: string | null): AtmosphereProfileName {
  return (ATMOSPHERE_NAMES as readonly string[]).includes(profileName ?? '')
    ? (profileName as AtmosphereProfileName)
    : DEFAULT_ATMOSPHERE;
}

/**
 * The sun's own direction from its elevation and bearing — a unit vector pointing
 * FROM the city TOWARD the sun. North is −Z, so bearing 90° (east) is +X.
 */
export function sunDirection(
  elevationDeg: number,
  azimuthDeg: number,
): [number, number, number] {
  const elevation = THREE.MathUtils.degToRad(elevationDeg);
  const bearing = THREE.MathUtils.degToRad(azimuthDeg);
  const horizontal = Math.cos(elevation);
  return [Math.sin(bearing) * horizontal, Math.sin(elevation), -Math.cos(bearing) * horizontal];
}

/** How far from the shadow target the sun's light is placed — a direction, not a distance. */
export const ATMOSPHERE_SUN_DISTANCE = 120;

/**
 * The shadow target: the middle of the city's own extent (X ±90, Z −100…40), so the
 * sun's orthographic frustum fits the city instead of the camera's current view.
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
export const SUN_LIGHT_NAME = 'atmosphere-sun';
export const SUN_TARGET_NAME = 'atmosphere-sun-target';
export const HEMI_LIGHT_NAME = 'atmosphere-hemi';

/** The renderer fields `applyAtmosphere` writes. Structural, so a stub works in tests. */
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

/**
 * The dome's vertex shader. `gl_Position.z = w` parks every fragment on the far
 * plane, which is what lets a 400-unit sphere survive a camera whose far plane is
 * 180 (the city Canvas's) — the same trick drei's `<Sky>` uses. Depth writing is
 * off, so the dome never occludes anything.
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
 * rather than on a hard edge, and the sun's disc and halo painted from the
 * profile's own direction and glow colour.
 */
const SKY_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vWorldDirection;
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  uniform vec3 uSunDirection;

  void main() {
    vec3 direction = normalize(vWorldDirection);
    float height = clamp(direction.y, 0.0, 1.0);

    vec3 sky = mix(uHorizon, uMid, smoothstep(0.0, 0.32, height));
    sky = mix(sky, uZenith, smoothstep(0.22, 0.95, height));

    // Below the horizon: close on a dimmed horizon tone, never a hard seam.
    float below = clamp(-direction.y * 4.0, 0.0, 1.0);
    sky = mix(sky, uHorizon * 0.82, below);

    float sun = max(dot(direction, normalize(uSunDirection)), 0.0);
    sky += uGlow * (pow(sun, 12.0) * 0.35 + pow(sun, 220.0) * 2.5);

    gl_FragColor = vec4(sky, 1.0);
  }
`;

/** The gradient dome for one profile — one mesh, one material, one draw call. */
export function createSkyDome(profile: AtmosphereProfile): THREE.Mesh {
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

/** The profile's sun, shadow-casting, with the orthographic frustum fitted to the city. */
export function createSunLight(profile: AtmosphereProfile): THREE.DirectionalLight {
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

/** The profile's hemisphere bounce — the sky's fill and the ground's warmth. */
export function createHemisphereLight(profile: AtmosphereProfile): THREE.HemisphereLight {
  const hemi = new THREE.HemisphereLight(profile.hemiSky, profile.hemiGround, profile.hemiIntensity);
  hemi.name = HEMI_LIGHT_NAME;
  return hemi;
}

/**
 * Remove everything `applyAtmosphere` added. Idempotent: a scene that never had a
 * rig is left alone, so cleanup after an unmount or before a re-apply is safe.
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

/**
 * Apply one profile to a scene — the ONE call a city scene makes, on mount and again
 * whenever the player changes the Lighting setting.
 *
 * Sets the fog, builds and adds the dome, the sun (with its shadow frustum) and the
 * hemisphere bounce, and — when a renderer is handed in — writes the renderer's
 * output colour space (sRGB), tone-mapping curve (ACES Filmic) and the profile's
 * exposure. Re-applying clears the previous rig first, so profiles swap live with no
 * duplicate sky or lights.
 */
export function applyAtmosphere(
  scene: THREE.Scene,
  profileName: AtmosphereProfileName | string = DEFAULT_ATMOSPHERE,
  renderer?: AtmosphereRenderer,
): AtmosphereProfile {
  const profile = ATMOSPHERE_PROFILES[resolveAtmosphere(profileName)];

  clearAtmosphere(scene);

  scene.fog = new THREE.Fog(profile.fogColor, profile.fogNear, profile.fogFar);

  scene.add(createSkyDome(profile));
  const sun = createSunLight(profile);
  scene.add(sun);
  scene.add(sun.target);
  scene.add(createHemisphereLight(profile));

  if (renderer) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = profile.exposure;
  }

  return profile;
}
