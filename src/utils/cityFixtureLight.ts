/**
 * cityFixtureLight.ts — Day/Night T3-F: the city's WARM POINT LIGHTS follow the same
 * `lampGlow` its emissives already read.
 *
 * ── WHY THIS IS A SECOND REGISTRY, NOT A WIDER FIRST ONE ─────────────────
 * `utils/cityFixtureGlow.ts` writes ONE property — `emissiveIntensity` on a
 * `MeshStandardMaterial` — and its suite pins that ("it writes ONE property: no
 * colour, no geometry, no light, no clone"). This slice moves `intensity` on a
 * `PointLight` instead, so it keeps that fence intact and adds a COMPANION registry
 * beside it: same classes, same ramp, same one-call-per-phase-change discipline,
 * applied from the city's existing single write point.
 *
 * ── WHAT IT DOES ────────────────────────────────────────────────────────
 * A registered light's `intensity` becomes `authored × fixtureScale(class, lampGlow)`
 * — literally the same `fixtureIntensity()` the emissive driver uses, so a brazier's
 * light and its coals dim together. At `lampGlow` 0 (midday) every registered light is
 * 0; at 1 (night) it reads exactly as authored. Nothing is added or removed: the light
 * count, the draw calls and the shadow casters are unchanged, and no light ever gains
 * `castShadow`.
 *
 * ── THE PINNED EXCLUSIONS ───────────────────────────────────────────────
 * `SmithingForge`'s two point lights (4.0 and 3.0) and `GeneralStore`'s cyan 1.5 do NOT
 * register here. Forge fire is live heat, not a lamp, and it must burn at every hour;
 * the store's cyan light is neither flame nor lamp. Both stay exactly as authored at
 * every phase, and T3-F's suite pins that they are still raw `<pointLight>` elements.
 *
 * ── WHAT IT WILL NOT DO ─────────────────────────────────────────────────
 * It writes one property — `intensity`. No colour, no distance, no geometry, no mesh,
 * no shadow. Nothing here reads or writes a save.
 */
import * as THREE from 'three';
import {
  CITY_FIXTURE_CLASSES,
  fixtureIntensity,
  getCityFixtureGlow,
  type CityFixtureClass,
} from './cityFixtureGlow';

/** One registered light: the light itself and the intensity it was authored with. */
interface RegisteredLight {
  light: THREE.PointLight;
  base: number;
}

const registry: Record<CityFixtureClass, Set<RegisteredLight>> = {
  brazier: new Set(),
  lamp: new Set(),
  window: new Set(),
};

/**
 * The intensity one point light should carry at `lampGlow` — the authored value times
 * the SAME class ramp the fixture materials use (`fixtureIntensity`), so light and
 * emissive can never diverge.
 */
export function fixtureLightIntensity(
  fixture: CityFixtureClass,
  base: number,
  lampGlow: number = getCityFixtureGlow(),
): number {
  return fixtureIntensity(fixture, base, lampGlow);
}

/** Write one entry's intensity from the current glow. */
function writeLight(fixture: CityFixtureClass, entry: RegisteredLight): void {
  entry.light.intensity = fixtureLightIntensity(fixture, entry.base);
}

/**
 * Register one point light under its class and apply the current glow at once, so the
 * light is already at the right hour on its first frame. The returned function
 * unregisters it (the component's own cleanup).
 */
export function registerCityFixtureLight(
  fixture: CityFixtureClass,
  light: THREE.PointLight,
  base: number,
): () => void {
  const entry: RegisteredLight = { light, base };
  registry[fixture].add(entry);
  writeLight(fixture, entry);
  return () => {
    registry[fixture].delete(entry);
  };
}

/**
 * Drive every registered light from a phase row's `lampGlow` — the ONE call a phase
 * change makes, beside `applyCityFixtureGlow`. One property write per registered
 * light, nothing per frame.
 */
export function applyCityFixtureLightGlow(lampGlow: number): void {
  for (const fixture of CITY_FIXTURE_CLASSES) {
    for (const entry of registry[fixture]) {
      entry.light.intensity = fixtureLightIntensity(fixture, entry.base, lampGlow);
    }
  }
}

/** How many lights of a class are currently registered (diagnostics and the suite). */
export function registeredFixtureLightCount(fixture: CityFixtureClass): number {
  return registry[fixture].size;
}

/** Every registered light of a class — a read-only view for the suite. */
export function registeredFixtureLights(
  fixture: CityFixtureClass,
): ReadonlyArray<Readonly<RegisteredLight>> {
  return Array.from(registry[fixture]);
}
