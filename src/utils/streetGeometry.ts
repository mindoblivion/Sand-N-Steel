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

/**
 * Via Decumanus west segment — existing military cross-street slab.
 * The footprint is shared by the bedding plane and rendered paved street.
 */
export const VIA_DECUMANUS_WEST: StreetRect = {
  id: 'via-decumanus-west',
  cx: -11,
  cz: 0,
  w: 14,
  d: 8,
};

/** Via Decumanus east segment — existing commercial cross-street slab. */
export const VIA_DECUMANUS_EAST: StreetRect = {
  id: 'via-decumanus-east',
  cx: 11,
  cz: 0,
  w: 14,
  d: 8,
};

/** Via Decumanus east extension — existing forge/workshop approach slab. */
export const VIA_DECUMANUS_EAST_EXTENSION: StreetRect = {
  id: 'via-decumanus-east-extension',
  cx: 22.5,
  cz: 1,
  w: 9,
  d: 7,
};

/** Via Mercatoria north-south connector between the east extension and market. */
export const VIA_MERCATORIA_CONNECTOR: StreetRect = {
  id: 'via-mercatoria-connector',
  cx: 22,
  cz: -2,
  w: 4,
  d: 6,
};

/** Caravan Bypass between the Caravanserai Inn and Stable. */
export const CARAVAN_BYPASS: StreetRect = {
  id: 'caravan-bypass',
  cx: 21,
  cz: 14.5,
  w: 10,
  d: 6,
};

/** Via Tabernaria's authored diagonal street and bedding-plane footprint. */
export interface RotatedStreetRect extends StreetRect {
  yaw: number;
  beddingYaw: number;
}
export const VIA_TABERNARIA: RotatedStreetRect = {
  id: 'via-tabernaria',
  cx: -11,
  cz: 8,
  w: 7,
  d: 12,
  yaw: Math.PI / 6,
  beddingYaw: -Math.PI / 6,
};
