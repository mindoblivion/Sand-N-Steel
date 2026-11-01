/**
 * fountainSpec.ts — single source of truth for the plaza fountain's real-world
 * scale (Step D of the fountain brief) and its PBR material breakdown (Step C).
 *
 * Pure data, no three.js / React dependency, so both the rendered build
 * (`components/3d/city/CivicFountain.tsx`) and the 2D collision registry
 * (`utils/collisionShapes.ts`) read the same numbers. Changing the fountain's
 * footprint therefore cannot silently desynchronise the collider from the mesh.
 */

/** Real-world dimensions, metres. Pivot is the base centre, on the ground (Y = 0). */
export const FOUNTAIN_SPEC = {
  /** Base centre → top of the statue's head. */
  totalHeight: 6.5,
  /** The main (bottom) basin, measured across its foundation. */
  baseDiameter: 8.0,
  baseRadius: 4.0,
  /** Height of the base pool wall — the volume the player can collide with. */
  baseWallHeight: 1.0,
  baseWallTop: 1.32,
  /** The emperor statue standing in the upper bowl. */
  statueBaseY: 4.3,
  statueHeight: 2.2,
  /** Water surfaces: one shader plane per basin. */
  water: {
    base: { y: 1.06, radius: 3.45 },
    middle: { y: 3.83, radius: 1.48 },
    top: { y: 4.44, radius: 0.8 },
  },
  /** Upper tiers, recorded for raycasts / future volume use. */
  tiers: {
    middle: { rimY: 3.92, radius: 1.98 },
    top: { rimY: 4.52, radius: 1.08 },
  },
} as const;

/**
 * Collision intent from the brief: one cylinder for the base and a box per
 * tier — never a mesh collider.
 *
 * Only the base cylinder is registered as a city collider. `cityCollisions.ts`
 * resolves movement in 2D (X/Z) at ground level, and both upper tiers sit
 * entirely inside the base cylinder's footprint (radius 1.98 and 1.08 against
 * 4.0), so their boxes could never change a movement result. The tier volumes
 * are kept here so a future height-aware query has them.
 */
export const FOUNTAIN_COLLISION = {
  base: { shape: 'cylinder', radius: FOUNTAIN_SPEC.baseRadius, height: FOUNTAIN_SPEC.baseWallHeight },
  tiers: [
    { id: 'middle-basin', shape: 'box', halfExtent: 1.98, height: 0.46, baseY: 3.46 },
    { id: 'top-basin', shape: 'box', halfExtent: 1.08, height: 0.32, baseY: 4.2 },
  ],
} as const;

/**
 * PBR breakdown from the material reference sheet. Marble and water are
 * dielectrics (metalness 0); only the bronze statue variant is metal.
 */
export const FOUNTAIN_PBR = {
  /** 01 — primary Carrara-white marble with light grey veining. */
  polishedMarble: { color: '#f7f5f0', roughness: 0.3, metalness: 0.0, bumpScale: 0.006 },
  /** 02 — cracked / weathered marble with dirt in the crevices. */
  weatheredMarble: { color: '#e6e2d9', roughness: 0.75, metalness: 0.0, bumpScale: 0.014 },
  /** 04 — aged bronze patina, the alternate statue tone. */
  bronzePatina: { color: '#6d8172', roughness: 0.62, metalness: 1.0 },
  /** 05 — water surface. */
  water: { color: '#3f7f97', roughness: 0.08, metalness: 0.0 },
} as const;
