/**
 * streetGeometry.ts — World footprints of the paved street MESHES whose slabs
 * must clear building foundations.
 *
 * These meshes are visual only — they carry no collision. The player's walkable
 * space comes exclusively from CITY_COLLIDERS in collisionShapes.ts. Keeping the
 * mesh footprints in a pure module (no three.js / React) lets the street layout
 * be unit-tested against the collision registry, e.g. asserting that a segment
 * visually terminates at a building approach rather than running beneath its
 * foundation.
 */

export interface StreetRect {
  id: string;
  cx: number; // center X (world)
  cz: number; // center Z (world)
  w: number; // full width across X
  d: number; // full depth along Z
}

/**
 * Via Mercatoria alley — General Store south side → Merchant House west entrance.
 *
 * Phase C-8.12: the Merchant House moved south to [26, 0, -13], putting its west
 * foundation edge at X = 22.15. Centring this 3.0-wide, 5.8-deep segment at
 * X = 20.5 keeps its whole footprint (X[19, 22]) west of that edge, and it spans
 * from just south of the General Store's foundation edge (Z = -8.15) down to the
 * entrance approach at Z = -14, covering the merchant_house fast-travel arrival
 * [21, -13].
 *
 * Footprint X[19, 22] Z[-14, -8.2] overlaps no building collider. The 0.05
 * clearance to the General Store foundation edge (Z = -8.15) is deliberate: an
 * exactly abutting edge lands on the wrong side of the -8.15 binary
 * representation (~1.8e-15 overlap), so the mesh stays strictly clear instead.
 */
export const VIA_MERCATORIA_PATH: StreetRect = {
  id: 'via-mercatoria-path',
  cx: 20.5,
  cz: -11.1,
  w: 3,
  d: 5.8,
};
