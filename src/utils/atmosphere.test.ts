/**
 * Atmosphere A1 — the city's sky, sun and fog foundation. Regression suite.
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A  the table, value for value — both profiles complete, and the fog/horizon
 *       discrepancy the design's own numbers contain left exactly as written;
 *   §B  the total resolver — an unknown or missing name is the golden-hour default;
 *   §C  the sun's direction from elevation + compass bearing (north is −Z, so the
 *       golden-hour sun stands west and slightly south, the midday sun high and SSW);
 *   §D  `applyAtmosphere` on a real `THREE.Scene` — the fog, the one gradient dome
 *       (SphereGeometry 400/16/12, BackSide, unlit by fog, no depth write, drawn
 *       first), the one shadow-casting directional sun (2048 map, city-fitted
 *       frustum, its target in the scene), the hemisphere bounce, NO ambient, and the
 *       renderer's sRGB / ACES / exposure;
 *   §E  re-applying a profile replaces the rig instead of stacking it, and
 *       `clearAtmosphere` removes every object it added;
 *   §F  the wiring — one `applyAtmosphere` call site in `CityAtmosphere`, mounted
 *       from `CityHubScene` alone, with the oath beat's `cityLightProfile` rig kept
 *       untouched and no other scene importing the module; and the settings record
 *       that carries the player's choice.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

import {
  ATMOSPHERE_NAMES,
  ATMOSPHERE_PROFILES,
  ATMOSPHERE_SHADOW_HALF_DEPTH,
  ATMOSPHERE_SHADOW_HALF_EXTENT,
  ATMOSPHERE_SHADOW_MAP_SIZE,
  DEFAULT_ATMOSPHERE,
  HEMI_LIGHT_NAME,
  SKY_DOME_NAME,
  SKY_DOME_RADIUS,
  SUN_LIGHT_NAME,
  SUN_TARGET_NAME,
  applyAtmosphere,
  clearAtmosphere,
  resolveAtmosphere,
  sunDirection,
} from './atmosphere';
import { DEFAULT_SETTINGS, resolveSettings } from '../services/settings';

const path = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const load = (rel: string): string => readFileSync(path(rel), 'utf8');
/** Comments are stripped so prose can never satisfy (or defeat) an assertion. */
const code = (rel: string): string =>
  load(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const GOLDEN = ATMOSPHERE_PROFILES.goldenHour;
const MIDDAY = ATMOSPHERE_PROFILES.midday;

const rendererStub = () => ({ outputColorSpace: '', toneMapping: -1, toneMappingExposure: 0 });
const hexOf = (value: string) => new THREE.Color(value).getHex();

describe('A. The table — the design values, verbatim', () => {
  test('exactly two profiles, goldenHour first (the settings order)', () => {
    expect([...ATMOSPHERE_NAMES]).toEqual(['goldenHour', 'midday']);
    expect(Object.keys(ATMOSPHERE_PROFILES).sort()).toEqual(['goldenHour', 'midday']);
    expect(DEFAULT_ATMOSPHERE).toBe('goldenHour');
  });

  test('goldenHour carries every field the brief lists, at its value', () => {
    expect(GOLDEN).toEqual({
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
    });
  });

  test('midday carries every field the brief lists, at its value', () => {
    expect(MIDDAY).toEqual({
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
    });
  });

  test('both profiles are complete, and both are drawn at exposure 1.10', () => {
    expect(Object.keys(GOLDEN).sort()).toEqual(Object.keys(MIDDAY).sort());
    expect(GOLDEN.exposure).toBe(1.1);
    expect(MIDDAY.exposure).toBe(1.1);
  });

  test('the fog colour is NOT forced onto the horizon colour (the design table governs)', () => {
    // The brief's "fog matched to the horizon" sentence is contradicted by its own
    // table; the table won, and no value was bent to make the two agree.
    expect(GOLDEN.fogColor).not.toBe(GOLDEN.skyHorizon);
    expect(MIDDAY.fogColor).not.toBe(MIDDAY.skyHorizon);
    expect(GOLDEN.skyHorizon).toBe('#F4C078');
    expect(GOLDEN.fogColor).toBe('#E8C9A0');
  });
});

describe('B. The resolver — total, and never unlit', () => {
  test('a named profile resolves to itself', () => {
    expect(resolveAtmosphere('goldenHour')).toBe('goldenHour');
    expect(resolveAtmosphere('midday')).toBe('midday');
  });

  test('anything else — missing, null, junk — resolves to the default', () => {
    expect(resolveAtmosphere()).toBe('goldenHour');
    expect(resolveAtmosphere(null)).toBe('goldenHour');
    expect(resolveAtmosphere('noon')).toBe('goldenHour');
    expect(resolveAtmosphere('')).toBe('goldenHour');
  });
});

describe('C. The sun’s direction from elevation and bearing', () => {
  const length = (v: [number, number, number]) => Math.hypot(v[0], v[1], v[2]);

  test('golden hour: a low sun in the west-southwest (bearing 247.5°)', () => {
    const [x, y, z] = sunDirection(GOLDEN.sunElevationDeg, GOLDEN.sunAzimuthDeg);
    expect(length([x, y, z])).toBeCloseTo(1, 10);
    expect(y).toBeCloseTo(Math.sin(THREE.MathUtils.degToRad(14)), 10);
    expect(x).toBeLessThan(0); // west
    expect(z).toBeGreaterThan(0); // south (+Z is south; north is −Z)
    expect(Math.abs(x)).toBeGreaterThan(Math.abs(z)); // westerly, not southerly
  });

  test('midday: a high sun in the south-southwest (bearing 202.5°)', () => {
    const [x, y, z] = sunDirection(MIDDAY.sunElevationDeg, MIDDAY.sunAzimuthDeg);
    expect(length([x, y, z])).toBeCloseTo(1, 10);
    expect(y).toBeCloseTo(Math.sin(THREE.MathUtils.degToRad(62)), 10);
    expect(y).toBeGreaterThan(0.8); // high
    expect(x).toBeLessThan(0);
    expect(z).toBeGreaterThan(0);
    expect(Math.abs(z)).toBeGreaterThan(Math.abs(x)); // southerly, not westerly
  });

  test('bearing 0 is north (−Z) and bearing 90 is east (+X)', () => {
    const north = sunDirection(0, 0);
    expect(north[0]).toBeCloseTo(0, 10);
    expect(north[2]).toBeCloseTo(-1, 10);
    const east = sunDirection(0, 90);
    expect(east[0]).toBeCloseTo(1, 10);
    expect(east[2]).toBeCloseTo(0, 10);
  });
});

describe('D. applyAtmosphere — one call builds the whole trio', () => {
  const build = (name: 'goldenHour' | 'midday', renderer = rendererStub()) => {
    const scene = new THREE.Scene();
    const profile = applyAtmosphere(scene, name, renderer);
    return { scene, profile, renderer };
  };

  test('the fog is a THREE.Fog of the profile’s own colour and band', () => {
    const { scene } = build('goldenHour');
    expect(scene.fog).toBeInstanceOf(THREE.Fog);
    const fog = scene.fog as THREE.Fog;
    expect(fog.color.getHex()).toBe(hexOf(GOLDEN.fogColor));
    expect(fog.near).toBe(45);
    expect(fog.far).toBe(165);
    expect((build('midday').scene.fog as THREE.Fog).far).toBe(190);
  });

  test('the sky dome is ONE mesh: SphereGeometry(400, 16, 12), BackSide, fog-free, no depth write, drawn first', () => {
    const { scene } = build('goldenHour');
    const dome = scene.getObjectByName(SKY_DOME_NAME) as THREE.Mesh;
    expect(dome).toBeDefined();
    expect(dome).toBeInstanceOf(THREE.Mesh);
    expect(dome.name).toBe(SKY_DOME_NAME);
    expect(dome.renderOrder).toBe(-1);

    const geometry = dome.geometry as THREE.SphereGeometry;
    expect(geometry).toBeInstanceOf(THREE.SphereGeometry);
    expect(geometry.parameters.radius).toBe(SKY_DOME_RADIUS);
    expect(geometry.parameters.widthSegments).toBe(16);
    expect(geometry.parameters.heightSegments).toBe(12);

    const material = dome.material as THREE.ShaderMaterial;
    expect(material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(material.side).toBe(THREE.BackSide);
    expect(material.fog).toBe(false);
    expect(material.depthWrite).toBe(false);
    // The three gradient stops and the sun disc/halo are all uniforms of the profile.
    expect(material.uniforms.uZenith.value.toArray()).toEqual([0x3d / 255, 0x5a / 255, 0x86 / 255]);
    expect(material.uniforms.uHorizon.value.toArray()).toEqual([0xf4 / 255, 0xc0 / 255, 0x78 / 255]);
    expect(material.uniforms.uGlow.value.toArray()).toEqual([0xff / 255, 0xd9 / 255, 0xa0 / 255]);
    const sunDir = material.uniforms.uSunDirection.value as THREE.Vector3;
    expect(sunDir.length()).toBeCloseTo(1, 10);
  });

  test('the dome is the scene’s only sky: one mesh, one draw call', () => {
    const { scene } = build('midday');
    expect(scene.children.filter((child) => child.name === SKY_DOME_NAME)).toHaveLength(1);
    expect(scene.children.filter((child) => (child as THREE.Mesh).isMesh)).toHaveLength(1);
  });

  test('one shadow-casting sun: profile colour/intensity, 2048 map, a city-fitted orthographic frustum', () => {
    const { scene } = build('goldenHour');
    const sun = scene.getObjectByName(SUN_LIGHT_NAME) as THREE.DirectionalLight;
    expect(sun).toBeInstanceOf(THREE.DirectionalLight);
    expect(sun.intensity).toBe(2.6);
    expect(sun.color.getHex()).toBe(hexOf(GOLDEN.sunColor));
    expect(sun.castShadow).toBe(true);
    expect(sun.shadow.mapSize.x).toBe(ATMOSPHERE_SHADOW_MAP_SIZE);
    expect(sun.shadow.mapSize.y).toBe(ATMOSPHERE_SHADOW_MAP_SIZE);
    expect(ATMOSPHERE_SHADOW_MAP_SIZE).toBe(2048);

    const camera = sun.shadow.camera as THREE.OrthographicCamera;
    expect(camera.left).toBe(-ATMOSPHERE_SHADOW_HALF_EXTENT);
    expect(camera.right).toBe(ATMOSPHERE_SHADOW_HALF_EXTENT);
    expect(camera.top).toBe(ATMOSPHERE_SHADOW_HALF_DEPTH);
    expect(camera.bottom).toBe(-ATMOSPHERE_SHADOW_HALF_DEPTH);
    // ~[-90..90] in x, and a 140-deep z band (z −100…40) about the target.
    expect(ATMOSPHERE_SHADOW_HALF_EXTENT).toBe(90);
    expect(ATMOSPHERE_SHADOW_HALF_DEPTH).toBe(70);

    // The light stands ~120 from its target, along the profile's own direction, and
    // its target is in the scene (three only updates a shadow from a present target).
    const targetName = sun.target.name;
    expect(targetName).toBe(SUN_TARGET_NAME);
    expect(scene.getObjectByName(SUN_TARGET_NAME)).toBe(sun.target);
    const distance = sun.position.distanceTo(sun.target.position);
    expect(distance).toBeCloseTo(120, 6);
  });

  test('midday’s sun is the profile’s, not a constant', () => {
    const sun = build('midday').scene.getObjectByName(SUN_LIGHT_NAME) as THREE.DirectionalLight;
    expect(sun.intensity).toBe(3.0);
    expect(sun.color.getHex()).toBe(hexOf(MIDDAY.sunColor));
    expect((sun.shadow.camera as THREE.OrthographicCamera).left).toBe(-90);
  });

  test('one hemisphere bounce, and NO ambient light (the hemisphere is the fill)', () => {
    const { scene } = build('goldenHour');
    const hemi = scene.getObjectByName(HEMI_LIGHT_NAME) as THREE.HemisphereLight;
    expect(hemi).toBeInstanceOf(THREE.HemisphereLight);
    expect(hemi.intensity).toBe(0.45);
    expect(hemi.color.getHex()).toBe(hexOf(GOLDEN.hemiSky));
    expect(hemi.groundColor.getHex()).toBe(hexOf(GOLDEN.hemiGround));

    const lights: THREE.Light[] = [];
    scene.traverse((object) => {
      if ((object as THREE.Light).isLight) lights.push(object as THREE.Light);
    });
    expect(lights.filter((light) => (light as THREE.AmbientLight).isAmbientLight)).toHaveLength(0);
    expect(lights.filter((light) => (light as THREE.DirectionalLight).isDirectionalLight)).toHaveLength(1);
    expect(lights.filter((light) => (light as THREE.HemisphereLight).isHemisphereLight)).toHaveLength(1);
    expect(lights).toHaveLength(2); // the city’s dynamic lights: sun + hemisphere bounce
  });

  test('the renderer gets sRGB, ACES Filmic and the profile’s exposure', () => {
    const { renderer } = build('goldenHour');
    expect(renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(renderer.toneMappingExposure).toBe(1.1);
    expect(THREE.SRGBColorSpace).toBe('srgb');
  });

  test('no renderer is fine — the scene half still applies', () => {
    const scene = new THREE.Scene();
    expect(() => applyAtmosphere(scene, 'midday')).not.toThrow();
    expect(scene.fog).toBeInstanceOf(THREE.Fog);
    expect(scene.getObjectByName(SKY_DOME_NAME)).toBeDefined();
  });

  test('an unknown profile name applies the default rather than leaving the city unlit', () => {
    const scene = new THREE.Scene();
    const profile = applyAtmosphere(scene, 'noon' as never);
    expect(profile).toBe(GOLDEN);
    expect((scene.fog as THREE.Fog).far).toBe(165);
  });
});

describe('E. Re-applying replaces the rig instead of stacking it', () => {
  test('a profile swap leaves exactly one dome, sun, target and hemisphere light', () => {
    const scene = new THREE.Scene();
    applyAtmosphere(scene, 'goldenHour');
    applyAtmosphere(scene, 'midday');

    expect(scene.children.filter((c) => c.name === SKY_DOME_NAME)).toHaveLength(1);
    expect(scene.children.filter((c) => c.name === SUN_LIGHT_NAME)).toHaveLength(1);
    expect(scene.children.filter((c) => c.name === SUN_TARGET_NAME)).toHaveLength(1);
    expect(scene.children.filter((c) => c.name === HEMI_LIGHT_NAME)).toHaveLength(1);
    expect((scene.fog as THREE.Fog).far).toBe(190);
  });

  test('clearAtmosphere removes every object the helper added, and is idempotent', () => {
    const scene = new THREE.Scene();
    applyAtmosphere(scene, 'goldenHour');
    clearAtmosphere(scene);
    expect(scene.getObjectByName(SKY_DOME_NAME)).toBeUndefined();
    expect(scene.getObjectByName(SUN_LIGHT_NAME)).toBeUndefined();
    expect(scene.getObjectByName(SUN_TARGET_NAME)).toBeUndefined();
    expect(scene.getObjectByName(HEMI_LIGHT_NAME)).toBeUndefined();
    expect(() => clearAtmosphere(scene)).not.toThrow();
  });
});

describe('F. The wiring, and the settings record that carries the choice', () => {
  const CITY = code('../components/3d/city/CityHubScene.tsx');
  const MOUNT = code('../components/3d/city/CityAtmosphere.tsx');
  const MODAL = code('../components/hub/SettingsModal.tsx');
  const DUEL = code('../components/duel/DuelScene.tsx');
  const RACE = code('../components/3d/RaceScene.tsx');

  test('the city mounts CityAtmosphere, driven by the Lighting setting', () => {
    expect(CITY).toContain("import { CityAtmosphere } from './CityAtmosphere';");
    expect(CITY).toContain('<CityAtmosphere profile={cityLighting} />');
    expect(CITY).toContain('const cityLighting = settings.cityLighting;');
    expect(CITY).toContain("const isOathRig = lightProfile === 'oathDawn';");
  });

  test('the oath beat keeps its own cityLightProfile rig, untouched', () => {
    // A1 ships no dawn profile; the oath still reads the named rig through the one
    // resolver it always did, so `gladiatorOath`'s source pins still hold.
    expect(CITY).toContain('const lights = resolveCityLightProfile(lightProfile);');
    expect(CITY).toContain('{isOathRig ? (');
    expect(CITY).toContain('<Sky');
    expect(CITY).toContain('args={[lights.fogColor, lights.fogNear, lights.fogFar]}');
    expect(CITY).toContain('<hemisphereLight');
  });

  test('the PBR environment rig survives the migration — the metals are untouched', () => {
    // A1 replaced the SKY, not the reflections: the PMREM Lightformer rig the city has
    // used since Phase 2B is mounted for both rigs, so no material's specular response
    // moved. (`environmentLightformers` is memoised against the day rig's own values.)
    expect(CITY).toContain(
      '<Environment resolution={256} frames={1} environmentIntensity={lights.environmentIntensity}>',
    );
    expect(CITY).toContain('{environmentLightformers}');
    expect(CITY).toContain('const environmentLightformers = useMemo(');
  });

  test('applyAtmosphere is called from exactly one place', () => {
    const calls = MOUNT.match(/applyAtmosphere\(/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(MOUNT).toContain('applyAtmosphere(scene, profile, gl)');
    expect(MOUNT).toContain('clearAtmosphere(scene)');
    // The scene itself never calls the helper directly — the component is the seam.
    expect(CITY).not.toContain('applyAtmosphere(');
  });

  test('no other scene imports the atmosphere module', () => {
    expect(DUEL).not.toContain('atmosphere');
    expect(RACE).not.toContain('atmosphere');
    expect(code('../components/3d/city/CityCamera.tsx')).not.toContain('atmosphere');
  });

  test('the settings record carries the choice, defaulting to golden hour', () => {
    expect(DEFAULT_SETTINGS.cityLighting).toBe('goldenHour');
    expect(resolveSettings({}).cityLighting).toBe('goldenHour');
    expect(resolveSettings({ cityLighting: 'midday' }).cityLighting).toBe('midday');
    // A damaged or unknown value falls back to the default rather than blanking it.
    expect(resolveSettings({ cityLighting: 'dusk' }).cityLighting).toBe('goldenHour');
    expect(resolveSettings({ cityLighting: 7 }).cityLighting).toBe('goldenHour');
  });

  test('the settings panel offers Lighting: Golden Hour / Midday and writes it', () => {
    expect(MODAL).toContain('label="Lighting"');
    expect(MODAL).toContain("value: 'goldenHour', label: 'Golden Hour'");
    expect(MODAL).toContain("value: 'midday', label: 'Midday'");
    expect(MODAL).toContain('value={settings.cityLighting}');
    expect(MODAL).toContain('onChange={(cityLighting) => set({ cityLighting })}');
  });

  test('the settings path never touches the player save', () => {
    // A1 is a settings write, not a save write: the record and the profile are
    // separate keys and this slice adds nothing to the profile.
    const SETTINGS = code('../services/settings.ts');
    expect(SETTINGS).not.toContain('saveProfile');
    expect(SETTINGS).not.toContain('PROFILE_STORAGE_KEY');
    expect(code('../utils/atmosphere.ts')).not.toContain('localStorage');
  });

  test('the sky dome budget is one draw call and the shadow map is the only new render target', () => {
    // No post-processing, no second mesh, no per-frame React work.
    expect(MOUNT).not.toContain('useFrame');
    expect(MOUNT).not.toContain('setState');
    expect(code('../utils/atmosphere.ts')).not.toContain('EffectComposer');
    expect(code('../utils/atmosphere.ts')).not.toContain('WebGLRenderTarget');
  });
});
