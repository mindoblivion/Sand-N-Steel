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

/** Via Tabernaria's southeast diagonal avenue toward the Caravanserai. */
export const VIA_TABERNARIA_EAST: RotatedStreetRect = {
  id: 'via-tabernaria-east',
  cx: 11,
  cz: 8,
  w: 7,
  d: 12,
  yaw: -Math.PI / 6,
  beddingYaw: Math.PI / 6,
};


/** Small travertine pedestrian connectors around Forum Socialis. */
export interface RotatedPavingPath extends StreetRect {
  yaw: number;
}
export const TAVERN_TO_FORUM_PATH: RotatedPavingPath = {
  id: 'tavern-to-forum',
  cx: -18.5,
  cz: 17,
  w: 3,
  d: 4.5,
  yaw: -Math.PI / 4,
};
export const FORUM_TO_BATHHOUSE_PATH: RotatedPavingPath = {
  id: 'forum-to-bathhouse',
  cx: -23.5,
  cz: 22.5,
  w: 3.2,
  d: 5,
  yaw: Math.PI / 4,
};
export const FORUM_TO_BOUNTY_HALL_PATH: RotatedPavingPath = {
  id: 'forum-to-bounty-hall',
  cx: -18,
  cz: 23,
  w: 3.2,
  d: 5,
  yaw: -Math.PI / 4,
};
export const FORUM_TO_SHRINE_PATH: RotatedPavingPath = {
  id: 'forum-to-shrine',
  cx: -24,
  cz: 15.5,
  w: 3.2,
  d: 6,
  yaw: Math.PI / 4,
};


/** Travertine pedestrian approaches in the arena-quarter courtyard. */
export const COURTYARD_TO_BARRACKS_PATH: RotatedPavingPath = {
  id: 'courtyard-to-barracks',
  cx: -25,
  cz: -12,
  w: 4,
  d: 5,
  yaw: -Math.PI / 4,
};
export const COURTYARD_TO_VETERAN_HALL_PATH: RotatedPavingPath = {
  id: 'courtyard-to-veteran-hall',
  cx: -21.5,
  cz: -17.5,
  w: 3,
  d: 15,
  yaw: 0,
};
export const COURTYARD_TO_MEDICAL_HOUSE_PATH: RotatedPavingPath = {
  id: 'courtyard-to-medical-house',
  cx: -26,
  cz: -7.5,
  w: 4,
  d: 6,
  yaw: Math.PI / 4,
};


/** Via Socialis civic lane linking the southern avenue to Forum Socialis. */
export const VIA_SOCIALIS: StreetRect = {
  id: 'via-socialis',
  cx: -10.5,
  cz: 20,
  w: 13,
  d: 5,
};


/** Via Triumphalis — central forum to the southern gatehouse. */
export const VIA_TRIUMPHALIS_BED: StreetRect = {
  id: 'via-triumphalis-bed',
  cx: 0,
  cz: 0,
  w: 14,
  d: 72,
};

/** West triumphal carriageway. */
export const VIA_TRIUMPHALIS_WEST: StreetRect = {
  id: 'via-triumphalis-west',
  cx: -4.7,
  cz: 10,
  w: 4.4,
  d: 21,
};

/** East triumphal carriageway. */
export const VIA_TRIUMPHALIS_EAST: StreetRect = {
  id: 'via-triumphalis-east',
  cx: 4.7,
  cz: 10,
  w: 4.4,
  d: 21,
};

/** Imperial mosaic runner between the triumphal carriageways. */
export const VIA_TRIUMPHALIS_RUNNER: StreetRect = {
  id: 'via-triumphalis-runner',
  cx: 0,
  cz: 10,
  w: 5,
  d: 21,
};

/** Via Scholaris academy-quarter decorative paving patches (visual only). */
export interface AcademyPavingRect extends StreetRect {
  yaw: number;
  y: number;
  colorRole: 'main' | 'approach';
}
export const VIA_SCHOLARIS_MAIN: AcademyPavingRect = {
  id: 'via-scholaris-main',
  cx: 21.5,
  cz: -18.5,
  w: 5,
  d: 9,
  yaw: -Math.PI / 4,
  y: -0.012,
  colorRole: 'main',
};
export const VIA_SCHOLARIS_ACADEMY_APPROACH: AcademyPavingRect = {
  id: 'via-scholaris-academy-approach',
  cx: 27.8,
  cz: -24.2,
  w: 4,
  d: 7,
  yaw: Math.PI / 4,
  y: -0.01,
  colorRole: 'approach',
};
export const VIA_SCHOLARIS_LIBRARY_APPROACH: AcademyPavingRect = {
  id: 'via-scholaris-library-approach',
  cx: 24,
  cz: -25.5,
  w: 3.6,
  d: 7,
  yaw: -Math.PI * 0.15,
  y: -0.01,
  colorRole: 'approach',
};
export const VIA_SCHOLARIS_DOCTORE_APPROACH: AcademyPavingRect = {
  id: 'via-scholaris-doctore-approach',
  cx: 26.5,
  cz: -19,
  w: 3.8,
  d: 4.5,
  yaw: Math.PI * 0.12,
  y: -0.01,
  colorRole: 'approach',
};
