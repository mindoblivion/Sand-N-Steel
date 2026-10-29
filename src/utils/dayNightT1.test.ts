/**
 * Day/Night T1 — one phase table, three scenes. Regression suite.
 *
 * ── WHAT IT PINS ──────────────────────────────────────────────────────────
 *   §A  `PHASE_LIGHT`, value for value: seven rows in cycle order, every field on
 *       every row, and DIRECTOR RULING A in both halves — the two A1 anchor rows keep
 *       their shipped, SEPARATED fog colours, and the five authored rows set
 *       `fogColor = skyHorizon`;
 *   §B  the resolvers (`resolvePhase`, `getPhaseLight`, the legacy A1 map) and the
 *       crossfade's row blend (endpoints exact, clamped, the key never duplicated);
 *   §C  `applyPhaseLight` on a real `THREE.Scene`: fog from the ROW's fog colour, one
 *       gradient dome carrying the star uniform, ONE shadow-casting key light (the
 *       MOON at night), the hemisphere bounce, no ambient, the scene's environment
 *       intensity and the renderer's sRGB / ACES / row exposure;
 *   §D  re-applying replaces rather than stacks, `clearAtmosphere` removes everything,
 *       and the module-level "last applied" record is what the entry crossfade reads;
 *   §E  the DUEL mapping: 25/65 by day, Torchlit 20/55 for a regular night bout,
 *       Night Spectacle 16/50 for a boss bout AT ANY PHASE — and never a night state
 *       over a daytime sky — with the brazier accounting brighter at night;
 *   §F  the RACE override: dusk renders golden, night renders dawn, everything else is
 *       identity, and the canonical phase is unchanged;
 *   §G  the wiring: the city renders the CLOCK's phase (T2 removed `CURRENT_PHASE`), both
 *       other scenes reuse the one
 *       dome and no longer ship drei's `<Sky>`, the settings row is read-only, and the
 *       dynamic-light count of each scene is unchanged;
 *   §H  the dev stepper route, its DEV gate, and the Colosseum rear route untouched;
 *   §I  the save fence: nothing in the slice reads or writes a player save.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

import {
  A1_PHASE_BY_PROFILE,
  DEFAULT_PHASE,
  HEMI_LIGHT_NAME,
  PHASE_CROSSFADE_MS,
  PHASE_LIGHT,
  SKY_DOME_NAME,
  SUN_LIGHT_NAME,
  SUN_TARGET_NAME,
  applyAtmosphere,
  applyPhaseLight,
  clearAtmosphere,
  createAtmosphereRig,
  getLastAppliedPhaseLight,
  getPhaseLight,
  mixPhaseLight,
  resolvePhase,
  sunDirection,
  type PhaseLight,
} from './atmosphere';
import {
  DUEL_BRAZIER_LIGHT,
  DUEL_DAY_FOG,
  DUEL_SPECTACLE_FOG,
  DUEL_TORCHLIT_FOG,
  duelBrazierScale,
  resolveDuelPhaseLight,
} from './duelPhaseLight';
import { RACE_PHASE_OVERRIDES, resolveRacePhase } from './racePhaseLight';
import { CURRENT_PHASE_SOURCE } from './currentPhase';
import { TIME_PHASE_NAMES, TIME_PHASES } from './timeState';

const path = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const load = (rel: string): string => readFileSync(path(rel), 'utf8');
/** Comments are stripped so prose can never satisfy (or defeat) an assertion. */
const code = (rel: string): string =>
  load(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const hexOf = (value: string) => new THREE.Color(value).getHex();
const rendererStub = () => ({ outputColorSpace: '', toneMapping: -1, toneMappingExposure: 0 });

/** Lights on a scene, by kind. */
function lightsOf(scene: THREE.Scene) {
  const lights: THREE.Light[] = [];
  scene.traverse((object) => {
    if ((object as THREE.Light).isLight) lights.push(object as THREE.Light);
  });
  return {
    all: lights,
    ambient: lights.filter((light) => (light as THREE.AmbientLight).isAmbientLight),
    directional: lights.filter((light) => (light as THREE.DirectionalLight).isDirectionalLight),
    hemisphere: lights.filter((light) => (light as THREE.HemisphereLight).isHemisphereLight),
    point: lights.filter((light) => (light as THREE.PointLight).isPointLight),
  };
}

describe('A. PHASE_LIGHT — seven rows, verbatim', () => {
  test('exactly the seven phase ids, in the cycle order', () => {
    expect(Object.keys(PHASE_LIGHT)).toEqual([...TIME_PHASES]);
    expect(Object.keys(PHASE_LIGHT)).toEqual([
      'dawn',
      'morning',
      'midday',
      'afternoon',
      'golden',
      'dusk',
      'night',
    ]);
    expect(DEFAULT_PHASE).toBe('golden');
  });

  test('every row carries every field, with usable values', () => {
    for (const phase of TIME_PHASES) {
      const row = PHASE_LIGHT[phase];
      expect(Object.keys(row).sort()).toEqual(
        [
          'envIntensity',
          'exposure',
          'fogColor',
          'fogFar',
          'fogNear',
          'hemiGround',
          'hemiIntensity',
          'hemiSky',
          'keyLight',
          'lampGlow',
          'skyHorizon',
          'skyMid',
          'skyZenith',
          'starAmount',
          'sunAzimuthDeg',
          'sunColor',
          'sunElevationDeg',
          'sunGlow',
          'sunIntensity',
        ].sort(),
      );
      for (const field of ['skyZenith', 'skyMid', 'skyHorizon', 'sunGlow', 'fogColor', 'sunColor', 'hemiSky', 'hemiGround'] as const) {
        expect(row[field]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
      for (const field of ['fogNear', 'fogFar', 'sunIntensity', 'sunElevationDeg', 'sunAzimuthDeg', 'hemiIntensity', 'exposure', 'envIntensity', 'starAmount', 'lampGlow'] as const) {
        expect(Number.isFinite(row[field])).toBe(true);
      }
      expect(row.fogFar).toBeGreaterThan(row.fogNear);
      expect(row.starAmount).toBeGreaterThanOrEqual(0);
      expect(row.starAmount).toBeLessThanOrEqual(1);
      expect(row.lampGlow).toBeGreaterThanOrEqual(0);
      expect(row.lampGlow).toBeLessThanOrEqual(1);
      expect(['sun', 'moon']).toContain(row.keyLight);
    }
  });

  test('the authored rows carry the design values, exactly (dawn … night)', () => {
    expect(PHASE_LIGHT.dawn).toEqual({
      skyZenith: '#3E5570',
      skyMid: '#A8908F',
      skyHorizon: '#F2C99B',
      sunGlow: '#FFC98F',
      fogColor: '#F2C99B',
      fogNear: 50,
      fogFar: 175,
      sunColor: '#FFD9AE',
      sunIntensity: 2.2,
      sunElevationDeg: 8,
      sunAzimuthDeg: 112.5,
      hemiSky: '#A8B4C4',
      hemiGround: '#B28E62',
      hemiIntensity: 0.42,
      exposure: 1.08,
      envIntensity: 0.3,
      starAmount: 0.15,
      lampGlow: 0.6,
      keyLight: 'sun',
    });
    expect(PHASE_LIGHT.morning.sunElevationDeg).toBe(38);
    expect(PHASE_LIGHT.morning.sunAzimuthDeg).toBe(135);
    expect(PHASE_LIGHT.afternoon.sunElevationDeg).toBe(34);
    expect(PHASE_LIGHT.afternoon.sunAzimuthDeg).toBe(225);
    expect(PHASE_LIGHT.golden.sunAzimuthDeg).toBe(247.5);
    expect(PHASE_LIGHT.dusk).toEqual({
      skyZenith: '#2E3D5E',
      skyMid: '#7A5E6E',
      skyHorizon: '#E88F4E',
      sunGlow: '#FF9E57',
      fogColor: '#E88F4E',
      fogNear: 40,
      fogFar: 140,
      sunColor: '#FF9A4E',
      sunIntensity: 1.5,
      sunElevationDeg: 3,
      sunAzimuthDeg: 270,
      hemiSky: '#6E7FA6',
      hemiGround: '#8A6A4E',
      hemiIntensity: 0.36,
      exposure: 1.06,
      envIntensity: 0.22,
      starAmount: 0.35,
      lampGlow: 0.8,
      keyLight: 'sun',
    });
  });

  test('night is the MOON row: same single light, its own colour and intensity', () => {
    const night = PHASE_LIGHT.night;
    expect(night.keyLight).toBe('moon');
    expect(night.sunColor).toBe('#B9C8E8');
    expect(night.sunIntensity).toBe(0.55);
    expect(night.sunElevationDeg).toBe(40);
    expect(night.sunAzimuthDeg).toBe(45);
    expect(night.skyZenith).toBe('#101C30');
    expect(night.fogNear).toBe(30);
    expect(night.fogFar).toBe(120);
    expect(night.starAmount).toBe(1);
    expect(night.lampGlow).toBe(1);
    expect(night.envIntensity).toBe(0.12);
    expect(night.exposure).toBe(1.02);
    // Every other row is the sun, and not one of them is a moon.
    for (const phase of TIME_PHASES) {
      if (phase === 'night') continue;
      expect(PHASE_LIGHT[phase].keyLight).toBe('sun');
    }
  });

  test('the day ramps the way a day does: key height up to midday, then down', () => {
    const elevation = TIME_PHASES.map((phase) => PHASE_LIGHT[phase].sunElevationDeg);
    const middayIndex = TIME_PHASES.indexOf('midday');
    for (let index = 1; index <= middayIndex; index += 1) {
      expect(elevation[index]).toBeGreaterThan(elevation[index - 1]);
    }
    expect(elevation[middayIndex]).toBe(62);
    expect(elevation[TIME_PHASES.indexOf('afternoon')]).toBeLessThan(62);
    expect(elevation[TIME_PHASES.indexOf('golden')]).toBeLessThan(
      elevation[TIME_PHASES.indexOf('afternoon')],
    );
    expect(elevation[TIME_PHASES.indexOf('dusk')]).toBeLessThan(
      elevation[TIME_PHASES.indexOf('golden')],
    );
    // Stars only rise as the light dies.
    expect(PHASE_LIGHT.midday.starAmount).toBe(0);
    expect(PHASE_LIGHT.golden.starAmount).toBeGreaterThan(0);
    expect(PHASE_LIGHT.dusk.starAmount).toBeGreaterThan(PHASE_LIGHT.golden.starAmount);
    expect(PHASE_LIGHT.night.starAmount).toBe(1);
    // And the lamps burn hardest at night.
    expect(PHASE_LIGHT.midday.lampGlow).toBe(0);
    expect(PHASE_LIGHT.night.lampGlow).toBe(1);
    expect(PHASE_LIGHT.dusk.lampGlow).toBeGreaterThan(PHASE_LIGHT.golden.lampGlow);
  });

  test('DIRECTOR RULING A, both halves — anchors separated, authored rows equal', () => {
    // The anchors are A1's shipped values: these two phases must render identically.
    expect(PHASE_LIGHT.golden.fogColor).toBe('#E8C9A0');
    expect(PHASE_LIGHT.golden.skyHorizon).toBe('#F4C078');
    expect(PHASE_LIGHT.golden.fogColor).not.toBe(PHASE_LIGHT.golden.skyHorizon);
    expect(PHASE_LIGHT.midday.fogColor).toBe('#E3D3AC');
    expect(PHASE_LIGHT.midday.skyHorizon).toBe('#E9DDBE');
    expect(PHASE_LIGHT.midday.fogColor).not.toBe(PHASE_LIGHT.midday.skyHorizon);
    // The five authored rows take their own horizon.
    const authored = TIME_PHASES.filter((phase) => phase !== 'golden' && phase !== 'midday');
    expect(authored).toEqual(['dawn', 'morning', 'afternoon', 'dusk', 'night']);
    for (const phase of authored) {
      expect(PHASE_LIGHT[phase].fogColor).toBe(PHASE_LIGHT[phase].skyHorizon);
    }
  });

  test('the ruling is recorded ON the table, where a future edit will see it', () => {
    const source = load('./atmosphere.ts');
    const rulingAt = source.indexOf('DIRECTOR RULING A (authoritative');
    const tableAt = source.indexOf('export const PHASE_LIGHT');
    expect(rulingAt).toBeGreaterThan(-1);
    expect(tableAt).toBeGreaterThan(-1);
    expect(rulingAt).toBeLessThan(tableAt);
    // And the two anchor rows say it at their own values too.
    expect(source).toContain("// A1's shipped fog (see DIRECTOR RULING A): deliberately NOT #F4C078.");
    expect(source).toContain("// A1's shipped fog (see DIRECTOR RULING A): deliberately NOT #E9DDBE.");
  });
});

describe('B. The resolvers, and the crossfade blend', () => {
  test('every phase id resolves to its own row', () => {
    for (const phase of TIME_PHASES) {
      expect(resolvePhase(phase)).toBe(phase);
      expect(getPhaseLight(phase)).toBe(PHASE_LIGHT[phase]);
    }
  });

  test('an unknown or missing id is the staging default, never undefined', () => {
    expect(resolvePhase()).toBe('golden');
    expect(resolvePhase(null)).toBe('golden');
    expect(resolvePhase('noon')).toBe('golden');
    expect(resolvePhase('')).toBe('golden');
    expect(getPhaseLight('goldenHour')).toBe(PHASE_LIGHT.golden);
  });

  test("A1's two settings names map onto their rows", () => {
    expect(A1_PHASE_BY_PROFILE).toEqual({ goldenHour: 'golden', midday: 'midday' });
    const scene = new THREE.Scene();
    expect(applyAtmosphere(scene, 'goldenHour')).toBe(PHASE_LIGHT.golden);
    expect(applyAtmosphere(scene, 'midday')).toBe(PHASE_LIGHT.midday);
  });

  test('the blend hits both endpoints exactly and is clamped', () => {
    const from = PHASE_LIGHT.golden;
    const to = PHASE_LIGHT.night;
    expect(mixPhaseLight(from, to, 0)).toEqual(from);
    expect(mixPhaseLight(from, to, 1)).toEqual(to);
    expect(mixPhaseLight(from, to, -2)).toEqual(from);
    expect(mixPhaseLight(from, to, 7)).toEqual(to);
    const half = mixPhaseLight(from, to, 0.5);
    expect(half.sunIntensity).toBeCloseTo((from.sunIntensity + to.sunIntensity) / 2, 10);
    expect(half.fogNear).toBeCloseTo((from.fogNear + to.fogNear) / 2, 10);
    expect(half.starAmount).toBeCloseTo((from.starAmount + to.starAmount) / 2, 10);
    expect(['sun', 'moon']).toContain(half.keyLight);
  });
});

describe('C. applyPhaseLight — the row, applied for real', () => {
  const build = (phase: string) => {
    const scene = new THREE.Scene();
    const renderer = rendererStub();
    const profile = applyPhaseLight(scene, phase, renderer);
    return { scene, renderer, profile };
  };

  test("the fog is the ROW's own colour and band (ruling A in the applied rig)", () => {
    const golden = build('golden').scene.fog as THREE.Fog;
    expect(golden).toBeInstanceOf(THREE.Fog);
    expect(golden.color.getHex()).toBe(hexOf('#E8C9A0'));
    expect(golden.near).toBe(45);
    expect(golden.far).toBe(165);
    // The anchor's fog is NOT its horizon, and that is the point.
    expect(golden.color.getHex()).not.toBe(hexOf('#F4C078'));

    const midday = build('midday').scene.fog as THREE.Fog;
    expect(midday.color.getHex()).toBe(hexOf('#E3D3AC'));
    expect(midday.far).toBe(190);

    for (const phase of ['dawn', 'morning', 'afternoon', 'dusk', 'night']) {
      const fog = build(phase).scene.fog as THREE.Fog;
      expect(fog.color.getHex()).toBe(hexOf(PHASE_LIGHT[phase as keyof typeof PHASE_LIGHT].fogColor));
    }
  });

  test('one dome, carrying the star uniform, drawn first and never depth-writing', () => {
    const { scene } = build('night');
    const dome = scene.getObjectByName(SKY_DOME_NAME) as THREE.Mesh;
    expect(dome).toBeInstanceOf(THREE.Mesh);
    expect(dome.renderOrder).toBe(-1);
    expect(scene.children.filter((child) => (child as THREE.Mesh).isMesh)).toHaveLength(1);
    const material = dome.material as THREE.ShaderMaterial;
    expect(material.side).toBe(THREE.BackSide);
    expect(material.fog).toBe(false);
    expect(material.depthWrite).toBe(false);
    expect(material.uniforms.uStarAmount.value).toBe(1);
    // The glow disc is driven from the MOON's own direction and colour.
    const moon = sunDirection(PHASE_LIGHT.night.sunElevationDeg, PHASE_LIGHT.night.sunAzimuthDeg);
    const direction = material.uniforms.uSunDirection.value as THREE.Vector3;
    expect(direction.x).toBeCloseTo(moon[0], 10);
    expect(direction.y).toBeCloseTo(moon[1], 10);
    expect(direction.z).toBeCloseTo(moon[2], 10);
    expect(material.uniforms.uGlow.value.toArray()).toEqual([
      0xd8 / 255,
      0xe4 / 255,
      0xf5 / 255,
    ]);
    expect(build('midday').scene.getObjectByName(SKY_DOME_NAME)).toBeDefined();
    expect(
      ((build('midday').scene.getObjectByName(SKY_DOME_NAME) as THREE.Mesh).material as THREE.ShaderMaterial)
        .uniforms.uStarAmount.value,
    ).toBe(0);
  });

  test('ONE shadow-casting key light — the moon at night — plus the hemisphere bounce', () => {
    const { scene } = build('night');
    const lights = lightsOf(scene);
    expect(lights.all).toHaveLength(2);
    expect(lights.ambient).toHaveLength(0);
    expect(lights.hemisphere).toHaveLength(1);
    expect(lights.directional).toHaveLength(1);
    expect(lights.point).toHaveLength(0);

    const key = scene.getObjectByName(SUN_LIGHT_NAME) as THREE.DirectionalLight;
    expect(key).toBeInstanceOf(THREE.DirectionalLight);
    expect(key.intensity).toBe(0.55);
    expect(key.color.getHex()).toBe(hexOf('#B9C8E8'));
    expect(key.castShadow).toBe(true);
    expect(scene.getObjectByName(SUN_TARGET_NAME)).toBe(key.target);
    const hemi = scene.getObjectByName(HEMI_LIGHT_NAME) as THREE.HemisphereLight;
    expect(hemi.intensity).toBe(0.3);
    expect(hemi.color.getHex()).toBe(hexOf('#33456A'));
    expect(hemi.groundColor.getHex()).toBe(hexOf('#1E2836'));
  });

  test("the row's environment intensity reaches the scene, and the renderer is ACES/exposure", () => {
    const { scene, renderer, profile } = build('golden');
    expect(scene.environmentIntensity).toBe(0.30);
    expect(renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(renderer.toneMappingExposure).toBe(1.1);
    expect(profile).toBe(PHASE_LIGHT.golden);
    expect(build('night').scene.environmentIntensity).toBe(0.12);
    expect(build('night').renderer.toneMappingExposure).toBe(1.02);
  });

  test('an unknown phase applies the default rather than leaving the scene unlit', () => {
    const { profile, scene } = build('noon');
    expect(profile).toBe(PHASE_LIGHT.golden);
    expect((scene.fog as THREE.Fog).far).toBe(165);
  });
});

describe('D. Replace, clear, and the last-applied record', () => {
  test('a phase swap leaves exactly one dome, key light, target and hemisphere', () => {
    const scene = new THREE.Scene();
    applyPhaseLight(scene, 'morning');
    applyPhaseLight(scene, 'night');
    expect(scene.children.filter((c) => c.name === SKY_DOME_NAME)).toHaveLength(1);
    expect(scene.children.filter((c) => c.name === SUN_LIGHT_NAME)).toHaveLength(1);
    expect(scene.children.filter((c) => c.name === SUN_TARGET_NAME)).toHaveLength(1);
    expect(scene.children.filter((c) => c.name === HEMI_LIGHT_NAME)).toHaveLength(1);
    expect(lightsOf(scene).all).toHaveLength(2);
    expect((scene.fog as THREE.Fog).far).toBe(120);
  });

  test('clearAtmosphere removes everything and is idempotent', () => {
    const scene = new THREE.Scene();
    applyPhaseLight(scene, 'dawn');
    clearAtmosphere(scene);
    expect(scene.getObjectByName(SKY_DOME_NAME)).toBeUndefined();
    expect(scene.getObjectByName(SUN_LIGHT_NAME)).toBeUndefined();
    expect(scene.getObjectByName(SUN_TARGET_NAME)).toBeUndefined();
    expect(scene.getObjectByName(HEMI_LIGHT_NAME)).toBeUndefined();
    expect(lightsOf(scene).all).toHaveLength(0);
    expect(() => clearAtmosphere(scene)).not.toThrow();
  });

  test('the module-level record is the row the last entry applied', () => {
    const scene = new THREE.Scene();
    applyPhaseLight(scene, 'dusk');
    expect(getLastAppliedPhaseLight()).toBe(PHASE_LIGHT.dusk);
    const rig = createAtmosphereRig(new THREE.Scene(), 'morning');
    expect(rig.profile).toBe(PHASE_LIGHT.morning);
    // `createAtmosphereRig` alone does not record — the CALLER (CityAtmosphere /
    // PhaseSkyDome) does, so a diagnostic can build a rig without lying about it.
    expect(getLastAppliedPhaseLight()).toBe(PHASE_LIGHT.dusk);
    clearAtmosphere(scene);
  });

  test('the crossfade moves every live value and never builds a second light', () => {
    const scene = new THREE.Scene();
    const rig = createAtmosphereRig(scene, 'night');
    rig.blend(PHASE_LIGHT.golden, 0);
    expect((scene.fog as THREE.Fog).color.getHex()).toBe(hexOf(PHASE_LIGHT.golden.fogColor));
    expect((scene.fog as THREE.Fog).near).toBe(PHASE_LIGHT.golden.fogNear);
    expect(rig.keyLight.intensity).toBe(PHASE_LIGHT.golden.sunIntensity);
    const material = rig.dome.material as THREE.ShaderMaterial;
    expect(material.uniforms.uStarAmount.value).toBe(PHASE_LIGHT.golden.starAmount);

    rig.blend(PHASE_LIGHT.golden, 0.5);
    expect(rig.keyLight.intensity).toBeCloseTo(
      (PHASE_LIGHT.golden.sunIntensity + PHASE_LIGHT.night.sunIntensity) / 2,
      10,
    );

    rig.blend(PHASE_LIGHT.golden, 1);
    expect(rig.keyLight.intensity).toBe(PHASE_LIGHT.night.sunIntensity);
    expect(rig.keyLight.color.getHex()).toBe(hexOf(PHASE_LIGHT.night.sunColor));
    expect(material.uniforms.uStarAmount.value).toBe(1);
    expect(lightsOf(scene).all).toHaveLength(2);
    clearAtmosphere(scene);
  });

  test('the crossfade is bounded and holds no React state', () => {
    const mount = code('../components/3d/city/CityAtmosphere.tsx');
    expect(PHASE_CROSSFADE_MS).toBe(1200);
    expect(mount).toContain('PHASE_CROSSFADE_MS');
    // The one frame loop returns immediately once the fade is done…
    expect(mount.match(/useFrame\(/g) ?? []).toHaveLength(1);
    expect(mount).toContain('if (!fade) return;');
    expect(mount).toContain('fadeRef.current = null;');
    // …and nothing about the fade is React state.
    expect(mount).not.toContain('useState');
    expect(code('./atmosphere.ts')).not.toContain('useFrame');
  });
});

describe('E. The DUEL mapping', () => {
  test('day phases use the ring band 25 / 65', () => {
    for (const phase of ['dawn', 'morning', 'midday', 'afternoon', 'golden', 'dusk'] as const) {
      const duel = resolveDuelPhaseLight(phase, false);
      expect(duel.nightState).toBeNull();
      expect(duel.row).toBe(PHASE_LIGHT[phase]);
      expect([duel.fogNear, duel.fogFar]).toEqual([...DUEL_DAY_FOG]);
      expect([25, 65]).toEqual([duel.fogNear, duel.fogFar]);
      expect(duel.fogColor).toBe(PHASE_LIGHT[phase].fogColor);
    }
  });

  test('a REGULAR bout at night is Torchlit — 20 / 55', () => {
    const duel = resolveDuelPhaseLight('night', false);
    expect(duel.nightState).toBe('torchlit');
    expect([duel.fogNear, duel.fogFar]).toEqual([...DUEL_TORCHLIT_FOG]);
    expect([20, 55]).toEqual([duel.fogNear, duel.fogFar]);
    expect(duel.row).toBe(PHASE_LIGHT.night);
    expect(duel.phase).toBe('night');
  });

  test('a BOSS bout is the Night Spectacle at ANY phase — 16 / 50', () => {
    for (const phase of TIME_PHASES) {
      const duel = resolveDuelPhaseLight(phase, true);
      expect(duel.nightState).toBe('spectacle');
      expect([duel.fogNear, duel.fogFar]).toEqual([...DUEL_SPECTACLE_FOG]);
      expect([16, 50]).toEqual([duel.fogNear, duel.fogFar]);
      expect(duel.phase).toBe('night');
      expect(duel.row).toBe(PHASE_LIGHT.night);
    }
  });

  test('NEVER a duel night over a daytime sky', () => {
    for (const phase of TIME_PHASES) {
      for (const boss of [false, true]) {
        const duel = resolveDuelPhaseLight(phase, boss);
        if (duel.nightState) {
          // A night state always renders the night row: moon, stars, night sky.
          expect(duel.phase).toBe('night');
          expect(duel.row).toBe(PHASE_LIGHT.night);
          expect(duel.row.keyLight).toBe('moon');
          expect(duel.row.starAmount).toBe(1);
          expect(duel.row.skyZenith).toBe('#101C30');
        }
      }
    }
    // The only non-boss night state is the night phase itself.
    for (const phase of TIME_PHASES) {
      if (phase === 'night') continue;
      expect(resolveDuelPhaseLight(phase, false).nightState).toBeNull();
    }
  });

  test('the braziers are brighter at night and dimmer by day (existing lights only)', () => {
    const midday = resolveDuelPhaseLight('midday', false);
    const golden = resolveDuelPhaseLight('golden', false);
    const torchlit = resolveDuelPhaseLight('night', false);
    const spectacle = resolveDuelPhaseLight('night', true);
    expect(midday.brazierIntensity).toBeLessThan(golden.brazierIntensity);
    expect(golden.brazierIntensity).toBeLessThan(torchlit.brazierIntensity);
    expect(torchlit.brazierIntensity).toBeLessThan(spectacle.brazierIntensity);
    expect(spectacle.brazierIntensity).toBeCloseTo(DUEL_BRAZIER_LIGHT * duelBrazierScale(1, 'spectacle'), 10);
    // Ember emissive follows the same accounting, and stays a material property.
    expect(spectacle.emberEmissive).toBeGreaterThan(torchlit.emberEmissive);
    // The fill is dimmer at night: the row's own bounce strength scales it.
    expect(torchlit.fillIntensity).toBeLessThan(golden.fillIntensity);
    // The key light is the row's, standing along the row's own direction.
    expect(spectacle.keyColor).toBe(PHASE_LIGHT.night.sunColor);
    expect(spectacle.keyIntensity).toBe(PHASE_LIGHT.night.sunIntensity);
    const direction = sunDirection(40, 45);
    expect(spectacle.keyPosition[0]).toBeCloseTo(direction[0] * 48, 10);
    expect(spectacle.keyPosition[1]).toBeCloseTo(direction[1] * 48, 10);
    expect(spectacle.keyPosition[2]).toBeCloseTo(direction[2] * 48, 10);
  });

  test('the duel resolves from the ONE table and adds no light of its own', () => {
    const module = code('./duelPhaseLight.ts');
    expect(module).toContain('PHASE_LIGHT');
    expect(module).not.toContain('new THREE');
    expect(module).not.toContain('localStorage');

    const duel = code('../components/duel/DuelScene.tsx');
    const arena = code('../components/3d/DuelArena.tsx');
    // The duel's rig, unchanged in COUNT: 1 ambient + 2 directional.
    expect(duel.match(/<ambientLight/g) ?? []).toHaveLength(1);
    expect(duel.match(/<directionalLight/g) ?? []).toHaveLength(2);
    expect(duel.match(/<hemisphereLight/g) ?? []).toHaveLength(0);
    expect(duel.match(/<pointLight/g) ?? []).toHaveLength(0);
    // The arena's eight braziers are one point light in one map — still eight at run time.
    expect(arena.match(/<pointLight/g) ?? []).toHaveLength(1);
    // AI-2 REBASE: the per-spectator loop is gone; the crowd is two
    // InstancedMeshes of CROWD_COUNT, and still the only point light is one.
    expect(arena).toContain('<instancedMesh');
    expect(arena).toContain('CROWD_COUNT');
    expect(arena).toContain('[0, 1, 2, 3, 4, 5, 6, 7].map');
    // The two sky meshes swapped one for one: drei's `<Sky>` is gone.
    expect(duel).not.toMatch(/<Sky\b/);
    expect(duel).toContain('<PhaseSkyDome phase={duelLight.phase} />');
  });
});

describe('F. The RACE override', () => {
  test('dusk renders golden and night renders dawn; everything else is identity', () => {
    expect(RACE_PHASE_OVERRIDES).toEqual({ dusk: 'golden', night: 'dawn' });
    expect(resolveRacePhase('dusk')).toBe('golden');
    expect(resolveRacePhase('night')).toBe('dawn');
    for (const phase of ['dawn', 'morning', 'midday', 'afternoon', 'golden'] as const) {
      expect(resolveRacePhase(phase)).toBe(phase);
    }
  });

  test('the canonical phase is untouched by the override', () => {
    const canonical = 'night';
    expect(resolveRacePhase(canonical)).toBe('dawn');
    expect(canonical).toBe('night');
    // DAY/NIGHT T2 REBASE: the staging constant this read is gone; the staging DEFAULT
    // (`utils/atmosphere.ts`'s `DEFAULT_PHASE`) is the same hour, and the override still
    // moves nothing but the drawn row.
    expect(DEFAULT_PHASE).toBe('golden');
    const module = code('./racePhaseLight.ts');
    expect(module).not.toContain('localStorage');
    expect(module).not.toContain('CURRENT_PHASE');
  });

  test("the race draws the city's table — no second table, no race-only sun", () => {
    const race = code('../components/3d/RaceScene.tsx');
    // DAY/NIGHT T2 REBASE: the phase is a PROP now (App resolves it from the clock), so the
    // scene names no phase constant of its own; the table read is unchanged.
    expect(race).toContain(
      "import { DEFAULT_PHASE, getPhaseLight, sunDirection } from '../../utils/atmosphere'"
    );
    expect(race).toContain('const racePhase = resolveRacePhase(phase);');
    expect(race).toContain('phase = DEFAULT_PHASE,');
    expect(race).not.toContain('CURRENT_PHASE');
    expect(race).toContain('const raceLight = getPhaseLight(racePhase);');
    expect(race).toContain('args={[raceLight.fogColor, raceLight.fogNear, raceLight.fogFar]}');
    expect(race).toContain('intensity={raceLight.sunIntensity}');
    expect(race).toContain('environmentIntensity={raceLight.envIntensity}');
    expect(race).not.toMatch(/<Sky\b/);
    expect(race).toContain('<PhaseSkyDome phase={racePhase} />');
    // Its light COUNT is unchanged: hemisphere + two directionals, no point light.
    expect(race.match(/<hemisphereLight/g) ?? []).toHaveLength(1);
    expect(race.match(/<directionalLight/g) ?? []).toHaveLength(2);
    expect(race.match(/<pointLight/g) ?? []).toHaveLength(0);
  });
});

describe('G. Wiring, and the dynamic-light / draw-call budget', () => {
  const CITY = code('../components/3d/city/CityHubScene.tsx');
  const MOUNT = code('../components/3d/city/CityAtmosphere.tsx');
  const MODAL = code('../components/hub/SettingsModal.tsx');
  const DOME = code('../components/3d/PhaseSkyDome.tsx');

  test('the city renders the CLOCK’s phase, and the staging constant is gone', () => {
    // DAY/NIGHT T2 REBASE (was "the city renders CURRENT_PHASE and the module-level
    // constant is the seam"): the slice's own instruction was to REMOVE that constant, so
    // this pin moved with it. What it protects is stronger than before — the scene reads
    // the save's clock once, hands the SAME value to the rig and to the dome, and no
    // module-level phase exists anywhere for a surface to fall back to.
    expect(CITY).toContain('import { resolveTimeState }');
    expect(CITY).toContain('const cityPhase = resolveTimeState(playerProfile).phase;');
    expect(CITY).toContain('const cityPhaseLight = getPhaseLight(cityPhase);');
    expect(CITY).toContain('<CityAtmosphere phase={cityPhase} />');
    expect(CITY).not.toContain('CURRENT_PHASE');
    expect(code('./currentPhase.ts')).not.toContain('CURRENT_PHASE:');
    // Still no per-frame state in the seam module: it holds no React and no clock read.
    const current = code('./currentPhase.ts');
    expect(current).not.toContain('useState');
    expect(current).not.toContain('setInterval');
    expect(current).not.toContain('resolveTimeState');
  });

  test('the shared dome is ONE mesh and replaces drei Sky one-for-one', () => {
    expect(DOME).toContain('createSkyDome(profile)');
    expect(DOME).toContain('markPhaseApplied(profile)');
    // It owns exactly one object and frees it: `scene.remove(dome)` + dispose (it must
    // NOT call `clearAtmosphere`, which would rip out the duel's own JSX lights).
    expect(DOME).toContain('scene.remove(dome)');
    expect(DOME).not.toContain('clearAtmosphere(scene)');
    expect(DOME).not.toContain('useFrame');
    // The dome is a single SphereGeometry mesh in the atmosphere module.
    expect(code('./atmosphere.ts')).toContain('new THREE.SphereGeometry(SKY_DOME_RADIUS, 16, 12)');
    // The city's own dome and its key light are the whole city rig.
    const scene = new THREE.Scene();
    applyPhaseLight(scene, DEFAULT_PHASE);
    expect(lightsOf(scene).all).toHaveLength(2);
    expect(scene.children.filter((child) => (child as THREE.Mesh).isMesh)).toHaveLength(1);
    clearAtmosphere(scene);
  });

  test('no scene grew a light: city 2, duel 11 (1 + 2 + 8), race 3', () => {
    const duel = code('../components/duel/DuelScene.tsx');
    const arena = code('../components/3d/DuelArena.tsx');
    const race = code('../components/3d/RaceScene.tsx');
    const duelAmbient = (duel.match(/<ambientLight/g) ?? []).length;
    const duelDirectional = (duel.match(/<directionalLight/g) ?? []).length;
    const arenaPointLights = (arena.match(/<pointLight/g) ?? []).length;
    expect(duelAmbient).toBe(1);
    expect(duelDirectional).toBe(2);
    // One `<pointLight>` inside an 8-entry map = the eight braziers, unchanged.
    expect(arenaPointLights).toBe(1);
    expect(duelAmbient + duelDirectional + 8).toBe(11);
    const raceHemisphere = (race.match(/<hemisphereLight/g) ?? []).length;
    const raceDirectional = (race.match(/<directionalLight/g) ?? []).length;
    expect(raceHemisphere + raceDirectional).toBe(3);
  });

  test('the Settings row reports the phase instead of offering a profile', () => {
    expect(CURRENT_PHASE_SOURCE).toBe('set by the day');
    expect(TIME_PHASE_NAMES[DEFAULT_PHASE]).toBe('Golden Hour');
    expect(MODAL).toContain('label="Lighting"');
    // DAY/NIGHT T2 REBASE: the row reports the phase App hands it (`phase`), not a constant.
    expect(MODAL).toContain('TIME_PHASE_NAMES[phase]');
    expect(MODAL).toContain('phase: TimePhase;');
    expect(MODAL).toContain('CURRENT_PHASE_SOURCE');
    expect(MODAL).not.toContain('lightingOptions');
    expect(MODAL).not.toContain('onChange={(cityLighting) => set({ cityLighting })}');
  });

  test('the stored cityLighting field stays inert, not deleted', () => {
    const settings = code('../services/settings.ts');
    expect(settings).toContain('cityLighting: AtmosphereProfileName;');
    expect(settings).toContain('cityLighting: DEFAULT_ATMOSPHERE,');
    // No renderer reads it any more.
    expect(CITY).not.toContain('settings.cityLighting');
    expect(code('../components/duel/DuelScene.tsx')).not.toContain('cityLighting');
    expect(code('../components/3d/RaceScene.tsx')).not.toContain('cityLighting');
  });
});

describe('H. The dev stepper route', () => {
  const MAIN = code('../main.tsx');
  const HARNESS = code('../components/dev/PhaseLightHarness.tsx');

  test('it is reachable at /__dev/phases and ?devHarness=phases, DEV-gated', () => {
    expect(MAIN).toContain("get('devHarness') === 'phases'");
    expect(MAIN).toContain("window.location.pathname === '/__dev/phases'");
    expect(MAIN).toMatch(/const usePhaseLightHarness =\s*\n\s*import\.meta\.env\.DEV &&/);
    expect(MAIN).toContain("import('./components/dev/PhaseLightHarness')");
    expect(MAIN).toContain('<PhaseLightHarness />');
  });

  test('the stepper shows all seven phases and both duel night states', () => {
    expect(HARNESS).toContain('TIME_PHASES.map');
    expect(HARNESS).toContain('resolveDuelPhaseLight');
    expect(HARNESS).toContain("'torchlit'");
    expect(HARNESS).toContain("'spectacle'");
    // It mounts the REAL rig, not a copy of the values.
    expect(HARNESS).toContain('applyPhaseLight(scene, rowPhase)');
    expect(HARNESS).toContain('clearAtmosphere(scene)');
  });

  test('the Colosseum rear diagnostic route and its A/B/C behaviour are untouched', () => {
    expect(MAIN).toContain("get('devHarness') === 'colosseum-rear'");
    expect(MAIN).toContain("window.location.pathname === '/__dev/colosseum-rear'");
    expect(MAIN).toContain("import('./components/dev/ColosseumRearDiagnostic')");
    const rear = load('../components/dev/ColosseumRearDiagnostic.tsx');
    expect(rear).toContain("type RearMode");
    expect(rear).toContain("id: 'A'");
    expect(rear).toContain("id: 'B'");
    expect(rear).toContain("id: 'C'");
  });
});

describe('I. The save fence', () => {
  test('nothing in this slice reads or writes a player save', () => {
    const sources = [
      './atmosphere.ts',
      './currentPhase.ts',
      './duelPhaseLight.ts',
      './racePhaseLight.ts',
      '../components/3d/PhaseSkyDome.tsx',
      '../components/dev/PhaseLightHarness.tsx',
      '../components/3d/city/CityAtmosphere.tsx',
    ];
    for (const rel of sources) {
      const source = code(rel);
      expect(source).not.toContain('localStorage');
      expect(source).not.toContain('saveProfile');
      expect(source).not.toContain('PROFILE_STORAGE_KEY');
      expect(source).not.toContain('loadSavedProfile');
    }
  });

  test('no post-processing, and no new render target for the cycle', () => {
    const atmosphere = code('./atmosphere.ts');
    expect(atmosphere).not.toContain('EffectComposer');
    expect(atmosphere).not.toContain('WebGLRenderTarget');
    expect(code('../components/3d/PhaseSkyDome.tsx')).not.toContain('WebGLRenderTarget');
  });
});
