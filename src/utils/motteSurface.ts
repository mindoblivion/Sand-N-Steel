/**
 * motteSurface.ts — Northern motte rendered-surface correction (Phase C-8.35).
 *
 * ── THE DEFECT ─────────────────────────────────────────────────────────────
 * The shipping asset (public/_workspace_motte_normals.glb) is a trimesh
 * conversion.  `Motte_Grass` is a family of scaled superellipse rings
 * (exponent 6, cardinal radius 40 model units = the summit edge), and the
 * family does not stop at the mound's own foot — it keeps going as an outer
 * flange.  Measured from the asset with the motte's world transform (group
 * position [0, 0, -81.5] (MOTTE_CENTER_Z since Phase C-8.38; the flange
 * levels below are model-space and do not depend on it), scale 0.3145, no
 * extra rotation — the GLB's nodes
 * already carry the Z-up→Y-up matrix):
 *
 *   level s   model Z        world Y   world radius (cardinal … diagonal)
 *   1.1375    11.25           3.538    14.31 … 18.03
 *   1.2750     7.50           2.359    16.04 … 20.21
 *   1.4125     3.75           1.179    17.77 … 22.39
 *   1.5500     0.00           0.000    19.50 … 24.57   ← visible slope foot
 *   1.6250    -1.50          -0.472    20.44 … 25.76   ┐
 *   1.7000    -2.80          -0.881    21.39 … 26.95   │ outer flange
 *   1.7750    -1.50          -0.472    22.33 … 28.13   │ (not the mound)
 *   1.8500     0.00           0.000    23.27 … 29.30   │
 *   2.0000     0.00 … -1.00   0.000    25.16 … 31.70   ┘
 *
 * Past the foot the flange oscillates above and below the city ground plane
 * (ProcessionAvenue, Y = -0.05): its crest rings sit at exactly Y = 0 — 0.05
 * ABOVE the sand — while its trough rings sink below it, where the opaque
 * ground plane hides them.  So the one flat, untextured sage-green `Grass`
 * material renders as concentric ground-level green bands out to 31.7 world
 * units (63.4 across), with the sand showing through between them, all of it
 * flat because the flange is flat.  That is the oversized flat green surface
 * and the abrupt horizontal colour bands reported on the northern approach.
 * The mound itself is not the offender: from the foot (level 1.55, Y = 0) it
 * rises 4.7175 to the summit, and gameplay already mirrors exactly that.
 *
 * ── THE CORRECTION ─────────────────────────────────────────────────────────
 * The flange is a mesh artefact, not terrain.  The mound's contract with
 * gameplay is the slope from the visible foot up to the summit, which
 * terrainHeight.getTerrainY() reproduces; the flange is below and beyond it.
 * So the correction only SINKS the flange under the ground plane — every
 * vertex past the foot is lowered to at most MOTTE_FLANGE_BURIED_WORLD_Y
 * (0.55 below the sand).  The crest rings stop standing proud of the ground,
 * and the whole flange disappears beneath it.
 *
 * Nothing else moves:
 *   - the foot ring (level exactly 1.55) is untouched, so the mound's
 *     silhouette and its Y = 0 foot are unchanged; the skirt between the foot
 *     and the next ring already crossed the ground plane before this change,
 *     so the rendered green/sand junction moves by ~0.02 world units;
 *   - summit, slope, fortress, moat ring, drawbridge, terrain-height function
 *     and the whole collision registry are untouched, so the traversable route
 *     is exactly the one C-8.31 and C-8.33 verified;
 *   - the mesh keeps its vertices and indices, so the shell stays closed (no
 *     holes, no exposed back faces), and no material, no GLB byte and no other
 *     mesh of the asset is affected.
 *
 * Verified 2026-10-18 against the shipping asset: of the mesh's 1410 vertices,
 * 642 belong to the mound (levels 1.0 … 1.55) and 768 to the flange (levels
 * 1.625 … 2.0).  After the correction every flange vertex is at least 0.55
 * below the ground plane and all 642 mound vertices are byte-identical.
 */

import { GROUND_PLANE_ELEVATION_Y } from '../components/3d/city/ProcessionAvenue';
import { MOTTE_SCALE, SUMMIT_SLOPE_FOOT_SCALE, summitLevel } from './terrainHeight';

/**
 * Level above which a ring is flange rather than mound.
 *
 * The foot is exactly `SUMMIT_SLOPE_FOOT_SCALE` (1.55) and the next ring is at
 * 1.625, so the threshold sits midway.  Float slop on the foot ring is measured
 * within ±4e-8 of 1.55 in the asset, so the mound's own foot can never be
 * buried by rounding.
 */
export const MOTTE_FLANGE_LEVEL = SUMMIT_SLOPE_FOOT_SCALE + (1.625 - SUMMIT_SLOPE_FOOT_SCALE) / 2;

/** World Y the flange is pushed down to — 0.55 below the city ground plane. */
export const MOTTE_FLANGE_BURIED_WORLD_Y = GROUND_PLANE_ELEVATION_Y - 0.55;

/** The same depth in the mesh's own model space (the GLB is scaled by 0.3145). */
export const MOTTE_FLANGE_BURIED_MODEL_Z = MOTTE_FLANGE_BURIED_WORLD_Y / MOTTE_SCALE;

/**
 * True when a model-space vertex lies on the flange rather than on the mound.
 *
 * The level is computed with `summitLevel`, the same superellipse the gameplay
 * terrain uses, so the rendered surface and getTerrainY() cannot drift apart.
 */
export function isMotteFlangeVertex(modelX: number, modelY: number): boolean {
  return summitLevel(modelX * MOTTE_SCALE, modelY * MOTTE_SCALE) > MOTTE_FLANGE_LEVEL;
}

/**
 * Sinks every flange vertex of a `Motte_Grass` POSITION buffer to at most
 * `MOTTE_FLANGE_BURIED_MODEL_Z`, leaving the mound itself untouched.
 *
 * `positions` is the mesh's raw position array in model space: the GLB is
 * Z-up, so X and Y span the ground plane the superellipse lives in and Z is
 * height (the node matrix maps model Z → world Y).  `Math.min` never raises a
 * vertex that is already deeper, so the operation is idempotent and safe to
 * re-run on a re-mount that shares the cloned geometry.
 *
 * @returns the number of flange vertices found.
 */
export function buryMotteFlange(positions: Float32Array | number[], stride = 3): number {
  let flangeVertices = 0;
  for (let i = 0; i + stride <= positions.length; i += stride) {
    if (!isMotteFlangeVertex(positions[i], positions[i + 1])) continue;
    flangeVertices++;
    if (positions[i + 2] > MOTTE_FLANGE_BURIED_MODEL_Z) {
      positions[i + 2] = MOTTE_FLANGE_BURIED_MODEL_Z;
    }
  }
  return flangeVertices;
}
