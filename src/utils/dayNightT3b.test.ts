/**
 * Day/Night T3-F — night coherence: the city's warm point lights and its windows follow
 * the SAME `lampGlow` the T3 fixture driver already uses.
 *
 * Run with: bun test src/utils/dayNightT3b.test.ts
 *
 * §A the companion point-light driver · §B the eleven warm lights as mounted · §C the
 * window pane · §D the pinned exclusions · §E the light count, the scope fence and the
 * save fence. The T3 suite (`dayNightT3.test.ts`), `timeState.test.ts` §G's consumer
 * list and `keepers.test.ts` §G's plate assertion are untouched by this slice and are
 * NOT restated here — they must keep passing exactly as they were.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

import {
  applyCityFixtureLightGlow,
  fixtureLightIntensity,
  registerCityFixtureLight,
  registeredFixtureLightCount,
  registeredFixtureLights,
} from './cityFixtureLight';
import { applyCityFixtureGlow, registerCityFixture } from './cityFixtureGlow';

const load = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const code = (rel: string): string =>
  load(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const CITY = '../components/3d/city';
const CITY_DIR = fileURLToPath(new URL(`${CITY}/`, import.meta.url));

/** The eleven warm city lights, exactly as authored in the tree (verified file by file). */
const WARM_LIGHTS: ReadonlyArray<{
  file: string;
  fixture: 'brazier' | 'lamp';
  base: number;
  tag: string;
}> = [
  {
    file: 'CaravanseraiInn',
    fixture: 'brazier',
    base: 3.5,
    tag: '<CityFixtureLight fixture="brazier" base={3.5} color="#f97316" distance={9} position={[0, 1.5, 0]} />',
  },
  {
    file: 'CityStreets',
    fixture: 'lamp',
    base: 2.2,
    tag: '<CityFixtureLight fixture="lamp" base={2.2} color="#f97316" distance={8} position={[0, 2.5, 0]} />',
  },
  {
    file: 'CityTavern',
    fixture: 'lamp',
    base: 3.5,
    tag: '<CityFixtureLight fixture="lamp" base={3.5} color="#f59e0b" distance={8} position={[0.2, 0, 0]} />',
  },
  {
    file: 'GeneralStore',
    fixture: 'lamp',
    base: 3,
    tag: '<CityFixtureLight fixture="lamp" base={3} color="#f59e0b" distance={7} position={[0, -0.1, 0]} />',
  },
  {
    file: 'GrandColosseum',
    fixture: 'brazier',
    base: 4,
    tag: '<CityFixtureLight fixture="brazier" base={4} color="#f97316" distance={12} position={[0, 1.8, 0]} />',
  },
  {
    file: 'IshtarGatehouse',
    fixture: 'brazier',
    base: 3.5,
    tag: '<CityFixtureLight fixture="brazier" base={3.5} color="#f97316" distance={10} position={[0, -0.2, 0]} />',
  },
  {
    file: 'IshtarGatehouse',
    fixture: 'brazier',
    base: 3,
    tag: '<CityFixtureLight fixture="brazier" base={3} color="#f97316" distance={8} position={[0, 0.6, 0]} />',
  },
  {
    file: 'MerchantHouse',
    fixture: 'lamp',
    base: 1.8,
    tag: '<CityFixtureLight fixture="lamp" base={1.8} color="#f97316" distance={7} position={[0, 1.2, 0]} />',
  },
  {
    file: 'ProcessionAvenue',
    fixture: 'brazier',
    base: 2.8,
    tag: '<CityFixtureLight fixture="brazier" base={2.8} color="#f97316" distance={9} position={[0, 1.6, 0]} />',
  },
  {
    file: 'PublicBathhouse',
    fixture: 'lamp',
    base: 1.5,
    tag: '<CityFixtureLight fixture="lamp" base={1.5} color="#f97316" distance={7} position={[0, 1.2, 0]} />',
  },
  {
    file: 'TrainingYard',
    fixture: 'brazier',
    base: 3.2,
    tag: '<CityFixtureLight fixture="brazier" base={3.2} color="#f97316" distance={8} position={[0, 1.8, 0]} />',
  },
];

/** The ten building files this slice touched (one of them twice). */
const TOUCHED_BUILDINGS = Array.from(new Set(WARM_LIGHTS.map((light) => light.file)));

// ── §A the companion point-light driver ───────────────────────────────────
describe('A. The warm point lights read the same ramp as the emissive driver', () => {
  test('a brazier light is 0 at midday, half at 0.5, exactly authored at night', () => {
    applyCityFixtureGlow(0);
    applyCityFixtureLightGlow(0);
    const light = new THREE.PointLight('#f97316', 3.5);
    const release = registerCityFixtureLight('brazier', light, 3.5);
    // Registered AT the current hour — no first-frame flash.
    expect(light.intensity).toBe(0);

    applyCityFixtureLightGlow(0.5);
    expect(light.intensity).toBeCloseTo(1.75, 12);

    applyCityFixtureLightGlow(1);
    expect(light.intensity).toBe(3.5);

    applyCityFixtureLightGlow(0);
    expect(light.intensity).toBe(0);

    release();
    applyCityFixtureLightGlow(1);
  });

  test('a lamp light follows the identical curve', () => {
    applyCityFixtureGlow(0);
    applyCityFixtureLightGlow(0);
    const light = new THREE.PointLight('#f97316', 2.2);
    const release = registerCityFixtureLight('lamp', light, 2.2);
    expect(light.intensity).toBe(0);

    applyCityFixtureLightGlow(0.5);
    expect(light.intensity).toBeCloseTo(1.1, 12);

    applyCityFixtureLightGlow(1);
    expect(light.intensity).toBe(2.2);

    release();
  });

  test('a clamped, total reading: junk input never over-brightens or throws', () => {
    expect(fixtureLightIntensity('brazier', 3.5, 0)).toBe(0);
    expect(fixtureLightIntensity('brazier', 3.5, 0.5)).toBeCloseTo(1.75, 12);
    expect(fixtureLightIntensity('brazier', 3.5, 1)).toBe(3.5);
    expect(fixtureLightIntensity('brazier', 3.5, -5)).toBe(0);
    expect(fixtureLightIntensity('brazier', 3.5, 9)).toBe(3.5);
    expect(fixtureLightIntensity('brazier', Number.NaN, 1)).toBe(0);

    const light = new THREE.PointLight('#f97316', 4);
    applyCityFixtureLightGlow(1);
    const release = registerCityFixtureLight('brazier', light, Number.NaN);
    expect(light.intensity).toBe(0);
    release();
  });

  test('registration writes at once, and an unregistered light is left where it was', () => {
    applyCityFixtureGlow(1);
    applyCityFixtureLightGlow(1);
    const before = registeredFixtureLightCount('lamp');
    const light = new THREE.PointLight('#f59e0b', 3.5);
    const release = registerCityFixtureLight('lamp', light, 3.5);
    expect(light.intensity).toBe(3.5);
    expect(registeredFixtureLightCount('lamp')).toBe(before + 1);
    expect(registeredFixtureLights('lamp').some((entry) => entry.light === light && entry.base === 3.5)).toBe(true);

    release();
    expect(registeredFixtureLightCount('lamp')).toBe(before);
    applyCityFixtureLightGlow(0);
    expect(light.intensity).toBe(3.5);
  });

  test('it writes ONE property on the light and nothing per frame', () => {
    const source = code('./cityFixtureLight.ts');
    expect(source).toContain('intensity');
    expect(source).toContain('fixtureIntensity');
    expect(source).not.toContain('useFrame');
    expect(source).not.toContain('castShadow');
    expect(source).not.toContain('new THREE.PointLight');
    expect(source).not.toContain('.clone()');
    expect(source).not.toContain('emissive');

    // The component draws exactly one point light, with no shadow and no frame hook.
    const component = code(`${CITY}/CityFixtureLight.tsx`);
    expect(component.match(/<pointLight\b/g) ?? []).toHaveLength(1);
    expect(component).toContain('useLayoutEffect');
    expect(component).toContain('registerCityFixtureLight');
    expect(component).not.toContain('useFrame');
    expect(component).not.toContain('castShadow');

    // The city's ONE write point applies both drivers from the one row.
    const city = code(`${CITY}/CityHubScene.tsx`);
    expect(city).toContain('applyCityFixtureGlow(cityPhaseLight.lampGlow)');
    expect(city).toContain('applyCityFixtureLightGlow(cityPhaseLight.lampGlow)');
  });
});

// ── §B the eleven warm lights, as mounted ─────────────────────────────────
describe('B. The eleven warm city lights go through the driver at their authored values', () => {
  test('every authored light is mounted through CityFixtureLight, unchanged but for the driver', () => {
    expect(WARM_LIGHTS).toHaveLength(11);
    for (const light of WARM_LIGHTS) {
      const source = code(`${CITY}/${light.file}.tsx`);
      expect(source, `${light.file}: ${light.tag}`).toContain(light.tag);
      expect(source).toContain("import { CityFixtureLight } from './CityFixtureLight';");
    }
    // The authored intensities are the design list's own.
    expect(WARM_LIGHTS.map((light) => light.base)).toEqual([3.5, 2.2, 3.5, 3, 4, 3.5, 3, 1.8, 2.8, 1.5, 3.2]);
    // Braziers use 'brazier', lamps use 'lamp'.
    expect(WARM_LIGHTS.filter((light) => light.fixture === 'brazier')).toHaveLength(6);
    expect(WARM_LIGHTS.filter((light) => light.fixture === 'lamp')).toHaveLength(5);
  });

  test('no warm light is left as a raw pointLight', () => {
    for (const file of TOUCHED_BUILDINGS) {
      if (file === 'GeneralStore') continue; // its cyan lamp is pinned below, by design
      expect(code(`${CITY}/${file}.tsx`), file).not.toContain('<pointLight');
    }
  });
});

// ── §C the window pane ────────────────────────────────────────────────────
describe('C. ClassicalWindow — the `window` class finally drives a pane', () => {
  const arch = code(`${CITY}/ClassicalArchitecture.tsx`);
  const glowLiteral = arch.match(/export const WINDOW_PANE_GLOW = ([0-9.]+);/);
  const emissiveLiteral = arch.match(/export const WINDOW_PANE_EMISSIVE = '(#[0-9a-f]{6})';/);

  test('the authored night glow is a stated, warm value', () => {
    expect(glowLiteral?.[1]).toBe('1.2');
    expect(emissiveLiteral?.[1]).toBe('#f59e0b');
  });

  test('a window pane reads 0 at lampGlow 0 and its authored warm value at lampGlow 1', () => {
    const base = Number(glowLiteral![1]);
    applyCityFixtureGlow(1);
    const material = new THREE.MeshStandardMaterial({ emissive: emissiveLiteral![1] });
    const release = registerCityFixture('window', material, base);
    expect(material.emissiveIntensity).toBe(base);

    applyCityFixtureGlow(0);
    expect(material.emissiveIntensity).toBe(0);

    applyCityFixtureGlow(0.5);
    expect(material.emissiveIntensity).toBeCloseTo(base / 2, 12);

    applyCityFixtureGlow(1);
    expect(material.emissiveIntensity).toBe(1.2);

    release();
    applyCityFixtureGlow(1);
  });

  test('the pane is the registered mesh, per instance, and nothing else about the window moved', () => {
    // The pane registers through the shared component under the `window` class.
    expect(arch).toMatch(
      /<CityFixtureMaterial\s+fixture="window"\s+base=\{WINDOW_PANE_GLOW\}\s+color=\{recessColor\}\s+emissive=\{WINDOW_PANE_EMISSIVE\}\s+roughness=\{0\.96\}\s*\/>/,
    );
    expect(arch.match(/<CityFixtureMaterial\b/g) ?? []).toHaveLength(1);

    // Geometry, stone colours and the recess tone are untouched.
    expect(arch).toContain('<boxGeometry args={[width, height, 0.14]} />');
    expect(arch).toContain('<meshStandardMaterial color="#3d352a" roughness={0.92} />');
    for (const stone of [
      '<meshStandardMaterial color={stoneColor} roughness={0.8} />',
      '<meshStandardMaterial color={stoneColor} roughness={0.78} />',
    ]) {
      expect(arch).toContain(stone);
    }
    // No shared window material: the component renders its own material per instance.
    expect(arch).not.toMatch(/const\s+\w*WINDOW\w*MATERIAL\s*=/);
  });
});

// ── §D the pinned exclusions ──────────────────────────────────────────────
describe('D. The pinned exclusions never scale', () => {
  test("the forge's two lights keep their authored intensities at every hour", () => {
    const forge = code(`${CITY}/SmithingForge.tsx`);
    expect(forge).toContain('<pointLight color="#ea580c" intensity={4} distance={9} position={[1.4, 1.4, 0]} />');
    expect(forge).toContain('<pointLight color="#f59e0b" intensity={3} distance={7} position={[0, -0.1, 0]} />');
    expect(forge.match(/<pointLight\b/g) ?? []).toHaveLength(2);
    expect(forge).not.toContain('CityFixtureLight');
    expect(forge).not.toContain('lampGlow');
  });

  test("the store's cyan lamp stays raw — not a flame, not a lamp", () => {
    const store = code(`${CITY}/GeneralStore.tsx`);
    expect(store).toContain('<pointLight color="#06b6d4" intensity={1.5} distance={4} position={[0, 0.3, 0]} />');
    expect(store.match(/<pointLight\b/g) ?? []).toHaveLength(1);
    // Its amber lamp IS driven, and only that one.
    expect(store.match(/<CityFixtureLight\b/g) ?? []).toHaveLength(1);
    expect(store).toContain('<CityFixtureLight fixture="lamp" base={3} color="#f59e0b"');
  });
});

// ── §E the light count, the scope fence and the save fence ────────────────
describe('E. No light added or removed, no save, no new profile field', () => {
  test('the city light count is unchanged: eleven driven + three raw = fourteen', () => {
    const files = readdirSync(CITY_DIR).filter((file) => file.endsWith('.tsx') && file !== 'CityFixtureLight.tsx');
    let driven = 0;
    let raw = 0;
    for (const file of files) {
      const source = code(`${CITY}/${file}`);
      driven += (source.match(/<CityFixtureLight\b/g) ?? []).length;
      raw += (source.match(/<pointLight\b/g) ?? []).length;
    }
    expect(driven).toBe(11);
    expect(raw).toBe(3); // SmithingForge 4.0 + 3.0, GeneralStore cyan 1.5
    // …and all eleven are drawn by ONE component that holds exactly one <pointLight>.
    const component = code(`${CITY}/CityFixtureLight.tsx`);
    expect(component.match(/<pointLight\b/g) ?? []).toHaveLength(1);
  });

  test('no file in this slice reads or writes a player save', () => {
    const slice = [
      './cityFixtureLight.ts',
      `${CITY}/CityFixtureLight.tsx`,
      `${CITY}/ClassicalArchitecture.tsx`,
      ...TOUCHED_BUILDINGS.map((file) => `${CITY}/${file}.tsx`),
    ];
    for (const rel of slice) {
      const source = code(rel);
      for (const token of ['saveProfile', 'localStorage', 'PROFILE_STORAGE_KEY', 'loadSavedProfile']) {
        expect(source, `${rel} must not name ${token}`).not.toContain(token);
      }
    }
  });

  test('the light driver reads the fixture ramp, never the clock model', () => {
    const source = code('./cityFixtureLight.ts');
    expect(source).not.toContain('timeState');
    expect(source).not.toContain('PHASE_PROFILES');
    expect(source).not.toContain('getPhaseProfile');
    expect(source).toContain("from './cityFixtureGlow'");
    // The T3 driver's own fence still holds: the emissive module writes no light.
    expect(code('./cityFixtureGlow.ts')).not.toContain('PointLight');
  });

  test('no profile field and no save-format change is introduced', () => {
    const types = code('../types/game.ts');
    for (const token of ['lampGlow', 'fixtureGlow', 'windowPane', 'cityFixtureLight']) {
      expect(types).not.toContain(token);
    }
  });
});
