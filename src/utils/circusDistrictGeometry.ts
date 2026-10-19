/**
 * circusDistrictGeometry.ts — world footprints of the East Circus District's
 * paved surfaces and of its one solid roadside structure (Phase C-8.64B).
 *
 * Pure module (no three.js, no React), the same convention as
 * `streetGeometry.ts`: the render component
 * (`components/3d/city/EastCircusDistrict.tsx`) and the phase's regression
 * suite both read these numbers, so the pavement that is drawn and the
 * clearances that are asserted can never drift apart.
 *
 * ── The anchors ────────────────────────────────────────────────────────────
 * The arena itself is fixed by Phase C-8.64A and is not restated here: its
 * measured world faces are imported from `collisionShapes.ts`
 * (`CIRCUS_WEST_X` 38.38, `CIRCUS_EAST_X` 66.30, `CIRCUS_SOUTH_Z` 43.80, the
 * carceres block 43.34 … 61.34 at 43.80 … 46.00, axis 52.34).  The district's
 * roads are laid against those faces and against the collider footprints of the
 * buildings that already stand east of the forum — every one of which is a
 * registry rectangle, so these reference faces are the same numbers the
 * movement resolver uses, not approximations read from the meshes:
 *
 *   smithing-forge    east 22.75   north  6.60   (RECT 18, 2.6, 9.5 × 8.0)
 *   armor-workshop    west 23.75   north  4.00   (RECT 28.2, 1.15, 8.9 × 5.7)
 *   caravanserai      —            south  9.95   (RECT 16, 14, 9.1 × 8.1)
 *   imperial-stable   east 29.75   south 11.15   (RECT 26, 15, 7.5 × 7.7)
 *   general-store     west 18.15   south −1.85   (RECT 22, −5, 7.7 × 6.3)
 *   merchant-house    west 22.15   south −9.50   (RECT 26, −13, 7.7 × 7.0)
 *   doctore-house     west 25.00   north −17.00  (RECT 28, −18.875, 6.0 × 3.75)
 *   gladiator-academy east 34.35   north −23.35  (RECT 30.5, −27, 7.7 × 7.3)
 *
 * The forum's own eastern paving is the 16.5-radius plaza circle centred on
 * [0, 0] (`ProcessionAvenue`), which reaches X 13.31 … 15.06 across the west
 * link's Z band.  The link's west terminus is set clear of its closest approach
 * so the two paved surfaces never coincide — and because the plaza is a disc
 * meeting a straight road, that clearance widens across the band and leaves a
 * bare wedge of sand at the link's mouth.  Phase C-8.65 closes it with the
 * link-mouth apron (§8): one flat slab, drawn in the plaza's own stone, that
 * tucks under the plaza's paving and reaches east to the link's west face.
 *
 * ── The layout ─────────────────────────────────────────────────────────────
 * Four paved runs, one paved forecourt, and the link-mouth apron that closes the
 * join between the forum plaza's own paving and the link's (§8).
 * Every run is a rectangle whose long
 * edges are axis-aligned, so its world footprint is exact rather than a
 * conservative bound, and no two paved surfaces overlap (each pair meets flush
 * along a shared edge or is separated by bare ground): overlapping slabs would
 * z-fight, and the shared edges are exactly the junctions the movement tests
 * drive.
 *
 *   circus-approach      east–west   X 22.75 … 38.00   Z  4.50 … 10.50
 *   circus-approach-link east–west   X 15.30 … 22.75   Z  6.75 …  9.75
 *   circus-via           north–south X 35.00 … 38.00   Z 10.50 … 46.10
 *   circus-service-lane  east–west   X 29.75 … 35.00   Z 18.00 … 23.00
 *   circus-forecourt     plaza        X 35.00 … 65.50  Z 46.10 … 54.50
 *
 * The two runs of the primary approach meet along Z 10.50 (X 35 … 38); the west
 * link meets the approach along X 22.75 (Z 6.75 … 9.75); the service lane meets
 * the north–south run along X 35.00 (Z 18 … 23); and the north–south run opens
 * into the forecourt along Z 46.10 (X 35 … 38).
 *
 * The forecourt is a pedestrian gathering space OUTSIDE the arena's closed
 * carceres end: its north edge stops 0.10 short of the carceres' front face
 * (Z 46.00), so it faces the arena without covering its base, and it is bounded
 * on the south by one solid travertine parapet — the district's only new
 * collidable structure, registered in `collisionShapes.ts` as
 * `forecourt-parapet`.  Its east side is deliberately left open to the ground:
 * the perimeter corridor between the arena's east wall (66.30) and the district
 * limit (67.50) runs south into the forecourt there, so the district is a loop
 * rather than a dead end.
 */

import { CIRCUS_EAST_X, CIRCUS_WEST_X } from './collisionShapes';

/** Road characters, structurally the `RoadDistrict` union of RomanStreetPavement. */
export type DistrictRoadCharacter = 'triumphal' | 'civic' | 'commercial';

export interface DistrictPavement {
  id: string;
  label: string;
  /** Centre X / centre Z of the paved rectangle. */
  cx: number;
  cz: number;
  /** Full extent across X / across Z. */
  w: number;
  d: number;
  axis: 'x' | 'z';
  character: DistrictRoadCharacter;
  hasGutters: boolean;
  hasWheelRuts: boolean;
}

// ── Reference faces (collider footprints of the existing east-of-forum buildings) ──
/** Smithing Forge collider east face — the approach's west terminus. */
export const FORGE_EAST_X = 22.75;
/** Smithing Forge collider north face. */
export const FORGE_NORTH_Z = 6.6;
/** Armor & Leather Workshop collider north face. */
export const WORKSHOP_NORTH_Z = 4.0;
/** Caravanserai Inn collider south face. */
export const CARAVANSERAI_SOUTH_Z = 9.95;
/** Imperial Stable collider east face — the service lane's west terminus. */
export const STABLE_EAST_X = 29.75;
/** Imperial Stable collider south face. */
export const STABLE_SOUTH_Z = 11.15;
/** Forum plaza circle: radius about [0, 0] (ProcessionAvenue). */
export const FORUM_PLAZA_RADIUS = 16.5;
/** Forum plaza circle's east reach across the west link's Z band. */
export const FORUM_PLAZA_EAST_IN_LINK_BAND = 15.06;

/** Arena west wall — the north–south run's east frontage. */
export const ARENA_WEST_X = CIRCUS_WEST_X;
/** Arena east wall. */
export const ARENA_EAST_X = CIRCUS_EAST_X;

// ── 1. The primary approach: the wide east–west leg through the only gap ────
/**
 * The city's eastern buildings leave exactly one wide gap for a road to leave
 * the street network: between the Armor & Leather Workshop's north face
 * (Z 4.00) and the Imperial Stable's south face (Z 11.15) — 7.15 of clear
 * ground at X 23.75 … 32.65.  The approach is centred in it, 6.00 wide, so it
 * clears the workshop by 0.50 and the stable by 0.65, and runs from the Smithing
 * Forge's east face (X 22.75, where it terminates against the building line)
 * east to X 38.00 — 0.38 clear of the arena's west wall, which is the junction
 * with the north–south run.
 */
export const CIRCUS_APPROACH: DistrictPavement = {
  id: 'circus-approach',
  label: 'Via Circensis — approach (east–west leg)',
  cx: 30.375,
  cz: 7.5,
  w: 15.25,
  d: 6.0,
  axis: 'x',
  character: 'triumphal',
  hasGutters: true,
  hasWheelRuts: true,
};

// ── 2. The west link: the only eastbound paved corridor out of the forum ────
/**
 * North of the Smithing Forge, the corridor between the forge's north face
 * (Z 6.60) and the Caravanserai Inn's south face (Z 9.95) is 3.35 wide; the
 * link is centred in it, 3.00 wide — the same width as the Via Mercatoria alley
 * — clearing the forge by 0.15 and the inn by 0.20.  It runs from X 15.30 (0.24
 * clear of the forum plaza's own eastern paving across its Z band) east to the
 * approach at X 22.75, and it is the leg that makes the district reachable on
 * pavement from the central forum rather than across bare ground.
 */
export const CIRCUS_APPROACH_LINK: DistrictPavement = {
  id: 'circus-approach-link',
  label: 'Via Circensis — forum link (east–west)',
  cx: 19.025,
  cz: 8.25,
  w: 7.45,
  d: 3.0,
  axis: 'x',
  character: 'commercial',
  hasGutters: false,
  hasWheelRuts: false,
};

// ── 3. The north–south run along the arena's west frontage ─────────────────
/**
 * Between the city square's own eastern limit (X 35, which is where the
 * district band begins south of the city) and the arena's west wall (X 38.38)
 * there are 3.38 units of clear ground, and no other collider stands in that
 * band from Z 10.50 down to the forecourt.  The run is laid 3.00 wide against
 * the wall line, leaving 0.38 to the stone — the arena is its east frontage, so
 * the run needs no kerb on that side — and it starts at the approach's north
 * edge (Z 10.50) and opens into the forecourt at Z 46.10.
 */
export const CIRCUS_VIA: DistrictPavement = {
  id: 'circus-via',
  label: 'Via Circensis — arena frontage (north–south leg)',
  cx: 36.5,
  cz: 28.3,
  w: 3.0,
  d: 35.6,
  axis: 'z',
  character: 'civic',
  hasGutters: false,
  hasWheelRuts: false,
};

// ── 4. The secondary service lane ──────────────────────────────────────────
/**
 * A second, short east–west access from the city's south-east: it leaves the
 * Imperial Stable's east face (X 29.75) and runs 5.00 wide to the north–south
 * run at X 35.00, entirely over open ground (nothing else stands within 3.38 of
 * it).  It is wide and open — no pinch — so it adds a real second route rather
 * than a maze of alleys.
 */
export const CIRCUS_SERVICE_LANE: DistrictPavement = {
  id: 'circus-service-lane',
  label: 'Circus service lane (east–west)',
  cx: 32.375,
  cz: 20.5,
  w: 5.25,
  d: 5.0,
  axis: 'x',
  character: 'commercial',
  hasGutters: true,
  hasWheelRuts: false,
};

export const DISTRICT_ROADS: DistrictPavement[] = [
  CIRCUS_APPROACH,
  CIRCUS_APPROACH_LINK,
  CIRCUS_VIA,
  CIRCUS_SERVICE_LANE,
];

// ── 5. The carceres forecourt ──────────────────────────────────────────────
/**
 * The pedestrian gathering space outside the arena's closed carceres end:
 * 30.50 wide (X 35.00 … 65.50) and 8.40 deep (Z 46.10 … 54.50) — 256 square
 * units of paving, wider than the carceres block itself (43.34 … 61.34) so it
 * frames the closed front rather than merely tracking it.  It clears the
 * carceres' front face by 0.10, the shell's south face by 2.30 and the arena's
 * east wall line by 0.80, and its west edge is the district's own west limit
 * (X 35) — the same line the city square stops at.
 */
export const CIRCUS_FORECOURT = {
  id: 'circus-forecourt',
  label: 'Circus carceres forecourt',
  cx: 50.25,
  cz: 50.3,
  w: 30.5,
  d: 8.4,
  /** Gilded border trims, inset from the north and south edges. */
  trimInset: 0.25,
  trimWidth: 0.15,
} as const;

// ── 6. The forecourt parapet — the district's one solid structure ───────────
/**
 * A low travertine parapet closing the forecourt's south edge — the district's
 * southern limit made visible instead of invisible.  Its rendered body is
 * 0.50 deep and 0.90 high with a 0.10 coping (the same construction as the
 * city's own `StreetWall` boundary walls), and its outer face (Z 55.00) is
 * exactly the district envelope's southern limit (`CIRCUS_ENVELOPE_Z_MAX`).
 * The registry rectangle is the body's own footprint; the coping overhangs
 * 0.05 beyond it, above the player's shoulder line.
 */
export const CIRCUS_FORECOURT_PARAPET = {
  id: 'forecourt-parapet',
  label: 'Circus forecourt parapet (south edge)',
  cx: 50.25,
  cz: 54.75,
  w: 30.5,
  d: 0.5,
  /** Rendered body / coping heights, matching the city's StreetWall. */
  height: 0.9,
  copingHeight: 0.1,
  copingOverhang: 0.05,
} as const;

// ── 7. Roadside kerbs (decorative, 0.16 high — no colliders) ───────────────
/**
 * The district's kerbs follow the city's own curb convention exactly
 * (`CityStreets.tsx` lays 0.16-high curb boxes along the cross streets and
 * registers none of them): a 0.16-high stone is a curb the player steps over,
 * not a wall, so it carries no collider and never blocks a road.  They are laid
 * OUTSIDE the paved rectangles they belong to, so no kerb sits on a slab.
 *
 * The last one is the district's west edge: from Z 10.90 (clear of the
 * approach's own north kerb) south to the parapet's outer face, it marks the
 * line X 35 — the city square's eastern limit, which is also the district's
 * western limit south of the city — so the boundary the player is stopped at is
 * a visible stone kerb rather than nothing at all.
 */
export interface DistrictKerb {
  id: string;
  label: string;
  cx: number;
  cz: number;
  w: number;
  d: number;
}

export const DISTRICT_KERBS: DistrictKerb[] = [
  {
    // Ends exactly at the north–south run's west edge (X 35): a kerb laid
    // across the lane's own junction mouth would sit on its pavement.
    id: 'circus-approach-kerb-n',
    label: 'Approach north kerb (against the Imperial Stable frontage)',
    cx: 28.875,
    cz: 10.7,
    w: 12.25,
    d: 0.4,
  },
  {
    id: 'circus-approach-kerb-s',
    label: 'Approach south kerb (against the Armor Workshop frontage)',
    cx: 30.875,
    cz: 4.3,
    w: 14.25,
    d: 0.4,
  },
  // The west boundary kerb is laid in two runs, because the service lane's own
  // junction with the north–south run (Z 18.00 … 23.00) opens through it: one
  // kerb across that mouth would stand on the lane's pavement.
  {
    id: 'circus-boundary-kerb-w-n',
    label: 'District west boundary kerb, north of the service lane (X 35)',
    cx: 34.8,
    cz: 14.25,
    w: 0.4,
    d: 6.7,
  },
  {
    id: 'circus-boundary-kerb-w-s',
    label: 'District west boundary kerb, south of the service lane (X 35)',
    cx: 34.8,
    cz: 39.2,
    w: 0.4,
    d: 31.6,
  },
];

/** Kerb height and depth, matching the city's street curbs. */
export const KERB_HEIGHT = 0.16;
export const KERB_DEPTH = 0.4;

// ── 8. The forum-link mouth apron (Phase C-8.65) ───────────────────────────
/**
 * The plaza's paving is a disc about [0, 0]; the link's west face is a straight
 * line at X 15.30.  Across the link's own 3.00 Z band the disc's rendered edge
 * — a 36-gon, not a true circle — falls away from that line as Z grows: 0.311
 * clear of it at Z 6.75, and 2.061 at Z 9.75 (the true-circle clearances
 * recorded elsewhere in this module are 0.244 and 1.989; the polygon's chords
 * sit up to 0.063 inside the circle, so the drawn gap is the wider figure).
 * That left 3.295 sq units of bare sand — up to 2.06 of the link's 3.00 width —
 * between the forum's paving and the district's, at the mouth of the only paved
 * route from the forum into the district.
 *
 * One flat slab closes it.  Its east edge is the link's own west face, so the
 * link starts exactly where the slab ends; its west edge is deliberately INSIDE
 * the plaza's paving, where the plaza's disc and its gilded ring — both above
 * it — cover the join.  The slab therefore fills the bare wedge without cutting
 * the ring, moving the link or overlapping any other pavement, and it is drawn
 * in the plaza's own stone, so the forum's paving reads as running unbroken into
 * the Via Circensis' link.  Like the roads, the plaza and the kerbs it carries
 * NO collider: it is pavement the player walks over, not a wall.
 */
export const CIRCUS_LINK_MOUTH_APRON = {
  id: 'circus-link-mouth-apron',
  label: 'Via Circensis — forum link mouth apron',
  /** East edge: the link's own west face (X 15.30). */
  eastX: CIRCUS_APPROACH_LINK.cx - CIRCUS_APPROACH_LINK.w / 2,
  /**
   * West edge: inside the plaza's rendered paving at every Z in the band.  The
   * plaza's 36-gon reaches its most-recessed X (13.2391) at Z 9.75, the band's
   * south edge; 13.10 stays 0.139 inside that, so the slab is covered by the
   * plaza everywhere the two meet.
   */
  westX: 13.1,
  /** The link's own Z band, so both slab edges meet the link flush. */
  z0: CIRCUS_APPROACH_LINK.cz - CIRCUS_APPROACH_LINK.d / 2, // 6.75
  z1: CIRCUS_APPROACH_LINK.cz + CIRCUS_APPROACH_LINK.d / 2, // 9.75
  /**
   * 2 mm under the plaza's own surface (Y 0.005) and 0.053 above the ground
   * plane (Y −0.05): visible in the wedge, hidden wherever the plaza covers it,
   * and far enough apart in depth to never z-fight.
   */
  y: 0.003,
} as const;

/** The apron slab's own centre and extents, in the roads' {cx, cz, w, d} shape. */
export const CIRCUS_LINK_MOUTH_APRON_RECT = {
  cx: (CIRCUS_LINK_MOUTH_APRON.westX + CIRCUS_LINK_MOUTH_APRON.eastX) / 2,
  cz: (CIRCUS_LINK_MOUTH_APRON.z0 + CIRCUS_LINK_MOUTH_APRON.z1) / 2,
  w: CIRCUS_LINK_MOUTH_APRON.eastX - CIRCUS_LINK_MOUTH_APRON.westX,
  d: CIRCUS_LINK_MOUTH_APRON.z1 - CIRCUS_LINK_MOUTH_APRON.z0,
} as const;

// ── 9. The race entry point (Phase C-8.70B) ────────────────────────────────
/**
 * The East Circus District's race entry point: a signed signpost standing on
 * the carceres forecourt, and the world centre of the interaction disc that
 * opens the pre-race panel.
 *
 * Its position is single-sourced here for the same reason every other district
 * footprint is: the signpost mesh (`EastCircusDistrict.tsx`), the interaction
 * trigger and the fast-travel arrival (`cityCollisions.ts`) and the phase's
 * suite all read these numbers, so the stone that is drawn and the trigger that
 * answers cannot drift apart.
 *
 * It stands on open pavement clear of every collider — the carceres' own front
 * face is 4.30 away and the forecourt parapet 4.20 — and it carries no collider
 * of its own: like the city's other signposts (`MerchantHouse`,
 * `GladiatorAcademy`) a sign is walked past, not around.  The disc's west rim
 * reaches X 34.50 at the forecourt's own Z, so the prompt is raised as the
 * player steps off the Via Circensis' frontage run (X 35 … 38, Z 46.10) onto
 * the forecourt.
 */
export const CIRCUS_RACE_ENTRY = {
  id: 'east-circus-race-entry',
  label: 'Circus race entry signpost',
  /** World X of the signpost and of the interaction disc's own centre. */
  x: 40.5,
  /** World Z of the signpost and of the interaction disc's own centre. */
  z: 50.3,
  /** Interaction-disc radius; the forecourt is open ground, so it is a wide disc. */
  radius: 6.0,
} as const;

/** World-space bounds of a pavement rectangle, as [x0, x1, z0, z1]. */
export const pavementBounds = (
  r: Pick<DistrictPavement, 'cx' | 'cz' | 'w' | 'd'>,
): [number, number, number, number] => [
  r.cx - r.w / 2,
  r.cx + r.w / 2,
  r.cz - r.d / 2,
  r.cz + r.d / 2,
];
