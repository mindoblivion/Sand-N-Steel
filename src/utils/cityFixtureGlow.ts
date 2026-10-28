/**
 * cityFixtureGlow.ts — Day/Night T3: ONE emissive driver for the city's fixtures.
 *
 * ── WHAT WAS THERE BEFORE THIS MODULE ────────────────────────────────────
 * The city's lamps, braziers and lanterns were built as inline
 * `meshStandardMaterial` literals inside individual building files
 * (`CityStreets`' street lamp, `ProcessionAvenue`'s forum brazier,
 * `GrandColosseum`'s arena torches, `IshtarGatehouse`'s gate torches,
 * `TrainingYard`, `CaravanseraiInn`, `MerchantHouse`, `PublicBathhouse`,
 * `GeneralStore`), each with a fixed `emissiveIntensity`. There was no shared
 * component, no registry and no intensity prop, so nothing could dim a brazier
 * at noon or light it at night without editing every literal by hand.
 *
 * ── THE DRIVER ───────────────────────────────────────────────────────────
 * One registry, keyed by FIXTURE CLASS (`brazier` | `lamp` | `window`), holds a
 * reference to each fixture's own material plus the intensity that material was
 * authored with. `applyCityFixtureGlow(lampGlow)` writes
 * `emissiveIntensity = base × ramp(class, lampGlow)` into every registered
 * material — one call per phase change, never per frame, and no new mesh, no new
 * light and no new draw call.
 *
 * The scale comes from the phase row's own `lampGlow` in `utils/atmosphere.ts`
 * (`PHASE_LIGHT`): 0 at midday = unlit, 1.0 at night = streets lamplit.
 *
 * ── BATCHING / DRAW CALLS ────────────────────────────────────────────────
 * This driver does NOT clone or replace any material: the mesh keeps the material
 * object R3F already gave it, so the draw-call count is exactly what it was.
 *
 * ── WHAT IT WILL NOT DO ──────────────────────────────────────────────────
 * It writes one property — `emissiveIntensity`. No colour, no geometry, no light,
 * no shadow. Nothing here reads or writes a save.
 */
import * as THREE from 'three';
import { PHASE_LIGHT, resolvePhase } from './atmosphere';
import type { TimePhase } from './timeState';

/**
 * The fixture classes the city dresses: a brazier is fire, a lamp is a lamp, a
 * window is a lit room. Each may want its own ramp.
 *
 * `window` ships with no registered fixture — the city's `ClassicalWindow` is
 * unlit stonework — so the class exists for the first pane that needs one rather
 * than to drive anything today.
 */
export type CityFixtureClass = 'brazier' | 'lamp' | 'window';

/** Every class, in the order the driver walks them. */
export const CITY_FIXTURE_CLASSES: readonly CityFixtureClass[] = ['brazier', 'lamp', 'window'];

/** A class's ramp: the share of its authored intensity it keeps at 0 and at 1. */
export interface CityFixtureRamp {
  atZero: number;
  atFull: number;
}

/** The shipped ramps — linear 0 → 1, i.e. the authored intensity is the night value. */
export const CITY_FIXTURE_RAMP: Readonly<Record<CityFixtureClass, CityFixtureRamp>> = {
  brazier: { atZero: 0, atFull: 1 },
  lamp: { atZero: 0, atFull: 1 },
  window: { atZero: 0, atFull: 1 },
};

/** Clamp anything to 0…1 (a malformed row can never over-brighten a fixture). */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** The intensity multiplier a class answers for a `lampGlow` value. */
export function fixtureScale(fixture: CityFixtureClass, lampGlow: number): number {
  const ramp = CITY_FIXTURE_RAMP[fixture] ?? CITY_FIXTURE_RAMP.brazier;
  const glow = clamp01(lampGlow);
  return ramp.atZero + (ramp.atFull - ramp.atZero) * glow;
}

/** One registered fixture: the material itself and the intensity it was authored with. */
interface RegisteredFixture {
  material: THREE.MeshStandardMaterial;
  base: number;
}

const registry: Record<CityFixtureClass, Set<RegisteredFixture>> = {
  brazier: new Set(),
  lamp: new Set(),
  window: new Set(),
};

/**
 * The glow the driver currently holds. It starts at **1** — full dress, the
 * intensity every fixture was authored with — so a fixture mounted outside a
 * phase-driven scene looks exactly as it always has. The city overwrites it from
 * the clock's own row on mount.
 */
let currentCityFixtureGlow = 1;

/** The glow the driver currently holds (0…1). */
export function getCityFixtureGlow(): number {
  return currentCityFixtureGlow;
}

/** The emissive intensity one fixture material should carry at `lampGlow`. */
export function fixtureIntensity(
  fixture: CityFixtureClass,
  base: number,
  lampGlow: number = currentCityFixtureGlow,
): number {
  const authored = Number.isFinite(base) && base > 0 ? base : 0;
  return authored * fixtureScale(fixture, lampGlow);
}

/** The glow a phase id answers — the row's own `lampGlow`. Total; unknown ids take the default row. */
export function phaseFixtureGlow(phaseId?: TimePhase | string | null): number {
  return PHASE_LIGHT[resolvePhase(phaseId)].lampGlow;
}

/** Write one entry's intensity from the current glow. */
function writeFixture(fixture: CityFixtureClass, entry: RegisteredFixture): void {
  entry.material.emissiveIntensity = fixtureIntensity(fixture, entry.base);
}

/**
 * Register one fixture material under its class and apply the current glow at
 * once, so the material is already at the right hour on its first frame. The
 * returned function unregisters it (the component's own cleanup).
 */
export function registerCityFixture(
  fixture: CityFixtureClass,
  material: THREE.MeshStandardMaterial,
  base: number,
): () => void {
  const entry: RegisteredFixture = { material, base };
  registry[fixture].add(entry);
  writeFixture(fixture, entry);
  return () => {
    registry[fixture].delete(entry);
  };
}

/**
 * Drive every registered fixture from a phase row's `lampGlow` — the ONE call a
 * phase change makes. One property write per registered material, nothing per
 * frame.
 */
export function applyCityFixtureGlow(lampGlow: number): void {
  currentCityFixtureGlow = clamp01(lampGlow);
  for (const fixture of CITY_FIXTURE_CLASSES) {
    for (const entry of registry[fixture]) writeFixture(fixture, entry);
  }
}

/** How many fixtures of a class are currently registered (diagnostics and the suite). */
export function registeredFixtureCount(fixture: CityFixtureClass): number {
  return registry[fixture].size;
}

/** Every registered fixture of a class — a read-only view for the suite. */
export function registeredFixtures(
  fixture: CityFixtureClass,
): ReadonlyArray<Readonly<RegisteredFixture>> {
  return Array.from(registry[fixture]);
}
