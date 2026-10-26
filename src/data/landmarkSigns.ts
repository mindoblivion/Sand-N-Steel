/**
 * L17B — Landmark signage: the data half of the shared `LandmarkSign` component.
 *
 * The ten sign assets under `public/signs/` share ONE authored construction: a
 * floor-standing iron post (local X −1.12 … −0.72) carrying a bracket arm at
 * Y 2.53 … 2.63, from which a cut-out metal plate hangs at Y 0.79 … 2.34 on six
 * chain links.  Nothing is textured: the lettering is the plate's own
 * silhouette, which only reads against something dark behind it — hence the
 * walnut backing panel the Grand Colosseum sign already carries (Phase 29.3D).
 * L17B reuses that exact backing treatment per sign.
 *
 * Measured plate bounds (every GLB, node `sign`, POSITION accessor, parsed with
 * @gltf-transform/core):
 *   Y 0.790 … 2.340  (height 1.55)   Z −0.025 … 0.061   X −half … +half
 * Only the X half-extent differs per sign — the plates widen or narrow with the
 * name — so `plateWidth` is the single measured per-sign dimension.
 *
 * ── COORDINATE FRAME ───────────────────────────────────────────────────────
 * `position` and `rotationY` are LOCAL to the building's own root group, which
 * is where each sign is mounted, so a sign moves with its building.  World
 * placement is derivable and is what the tests check:
 *
 *   world = root + R_y(buildingYaw) · local        worldYaw = yaw + rotationY
 *
 * with three.js' own R_y (x' = x·cosθ + z·sinθ, z' = −x·sinθ + z·cosθ).
 * In this city +X is east, −X west, +Z south and −Z north.
 *
 * ── MOUNTING RULE ──────────────────────────────────────────────────────────
 * Every non-Colosseum sign stands on the apron of the facade the player uses to
 * enter — the door / awning / portico face — turned so the plate's readable
 * front (local +Z, the thick side at Z 0.061) faces that approach, and offset
 * along the facade so the doorway's own walking line stays clear.  The post
 * stands clear of the building's collider, so no collider changed and none was
 * added: the signs are decoration, exactly like the buildings' barrels, crates
 * and benches.
 *
 * The Grand Colosseum keeps its own `ColosseumSignPrototype` mount (Phase
 * 29.3D) — it is plate-only at scale 1.35 on the entrance steps, has no post,
 * and is not re-mounted here.
 */

export type LandmarkSignId =
  | 'city_tavern'
  | 'smithing_forge'
  | 'general_store'
  | 'training_hall'
  | 'records_library'
  | 'arena_medical'
  | 'gladiator_barracks'
  | 'gladiator_academy'
  | 'veteran_hall';

/** Which side of the building the sign reads from (for audit + tests). */
export type LandmarkSignFacing = 'north' | 'south' | 'east' | 'west';

export interface LandmarkSignMount {
  /** Asset folder / file stem under `public/signs/`. */
  id: LandmarkSignId;
  /** The city component that mounts it (one mount per building). */
  building: string;
  /** Readable name of the building, for tests and audit output. */
  label: string;
  /** Served path of the delivered GLB. */
  assetPath: string;
  /** Measured X extent of the plate accessor, world units at scale 1. */
  plateWidth: number;
  /** World XZ of the building's root group (see the header's frame note). */
  buildingRoot: [number, number];
  /** World yaw of that root group, radians. */
  buildingYaw: number;
  /** Mount position, LOCAL to the building root group. */
  position: [number, number, number];
  /** Mount yaw, LOCAL to the building root group. */
  rotationY: number;
  /** Uniform scale; 1 keeps the asset's authored, human-scaled proportions. */
  scale: number;
  facing: LandmarkSignFacing;
  /** Where the sign stands, for audit. */
  note: string;
}

/**
 * Backing panel — the Colosseum sign's own values, reused verbatim
 * (`ColosseumSignPrototype.tsx`, Phase 29.3D):
 *   margin 0.03 around the plate silhouette,
 *   depth 0.015,
 *   centre Y (0.79 + 2.34) / 2 = 1.565,
 *   centre Z −0.060, so the panel's front face (−0.0525) sits 6.5 mm behind the
 *   chain back faces (Z −0.046) and 35 mm behind the plate's own back (−0.025).
 * Width is per sign: `plateWidth + 2 × margin`, so no plate is stretched.
 */
export const LANDMARK_SIGN_BACKING = {
  margin: 0.03,
  depth: 0.015,
  centerY: 1.565,
  centerZ: -0.06,
  plateHeight: 1.55,
} as const;

/** The assembly's own envelope, used for footprints and audit. */
export const LANDMARK_SIGN_ASSET_BOUNDS = {
  /** Post base + plate thickness: the assembly's local Z extent. */
  halfDepth: 0.199,
  /** Outermost post edge in local X (the post side of the bracket). */
  minLocalX: -1.12,
  /** Plate Y range — the part that has to read at a distance. */
  plateMinY: 0.79,
  plateMaxY: 2.34,
  /** Arm / post-cap top: the whole assembly's height at scale 1. */
  height: 2.86,
} as const;

export const LANDMARK_SIGNS: LandmarkSignMount[] = [
  {
    // World [−10.85, 11.20].  Door on the east face (local X +4.22 → X −11.78,
    // opening Z 12.90 … 15.10); plinth east face X −11.55.  The plate stands
    // 0.50 east of the plinth and 2.1 south of the door's centre; its post
    // (world Z 12.17 ± 0.20) stays 0.53 clear of the south jamb.  The balcony
    // is at Y 4.10 … 4.30 and the lanterns at 3.30 … 3.90, so the 2.86-tall
    // sign passes under both with ≥ 0.44 to spare.
    id: 'city_tavern',
    building: 'CityTavern.tsx',
    label: 'The Golden Palm Tavern',
    assetPath: '/signs/city_tavern/city_tavern.glb',
    plateWidth: 1.265,
    buildingRoot: [-16, 14],
    buildingYaw: 0,
    position: [5.15, 0, -2.8],
    rotationY: Math.PI / 2,
    scale: 1,
    facing: 'east',
    note: 'East (door) apron, south of the arched portal',
  },
  {
    // World [12.55, 5.80].  Colonnade doorway on the west face (X 13.25,
    // opening Z 0.90 … 4.30); plinth west face X 13.00.  The plate stands
    // 0.25 west of the plinth at the north end of the frontage, its post
    // (world Z 4.83 ± 0.20) 0.33 clear of the north jamb and clear of the
    // weapon rack that hugs the wall at Z −0.60 … 2.20.
    id: 'smithing_forge',
    building: 'SmithingForge.tsx',
    label: 'Imperial Smithing Forge',
    assetPath: '/signs/smithing_forge/smithing_forge.glb',
    plateWidth: 0.974,
    buildingRoot: [18, 2.6],
    buildingYaw: 0,
    position: [-5.45, 0, 3.2],
    rotationY: -Math.PI / 2,
    scale: 1,
    facing: 'west',
    note: 'West (colonnade) apron, north of the doorway',
  },
  {
    // World [17.20, −7.00].  Open front, west face; the awning's outer edge is
    // X 17.80 and its posts X 18.00 at Z −7.40 / −2.60, the plinth face is
    // X 18.15.  The plate stands 0.40 west of the awning edge at the south end
    // of the storefront, 2.0 south of its centre, clear of the goods crates at
    // [16.00, −2.60] and of the [17, −5] fast-travel arrival.
    id: 'general_store',
    building: 'GeneralStore.tsx',
    label: 'Bazaar & General Store',
    assetPath: '/signs/general_store/general_store.glb',
    plateWidth: 1.116,
    buildingRoot: [22, -5],
    buildingYaw: 0,
    position: [-4.8, 0, -2],
    rotationY: -Math.PI / 2,
    scale: 1,
    facing: 'west',
    note: 'West (awning) frontage, south of the counter',
  },
  {
    // World [−25.60, 5.40].  TrainingHall's root group sits inside TrainingYard
    // at yard-local [−12.35, 0, 3.00] with yaw +π/2, so its own frame turns
    // local +Z into world +X: the sign's LOCAL rotationY is 0 and it reads
    // east, the way the hall's doorway (world X −29.25, opening Z 2.10 … 3.90)
    // and veranda (outer edge X −26.35, posts at Z 1.50 / 4.50) face the yard.
    // The plate stands 0.75 east of the veranda edge, 0.41 north of its north
    // post, and outside the yard's enclosure coping (r 7.205 about [−18, 0]).
    id: 'training_hall',
    building: 'TrainingHall.tsx',
    label: 'Ludus Training Hall',
    assetPath: '/signs/training_hall/training_hall.glb',
    plateWidth: 0.976,
    buildingRoot: [-30.35, 3.0],
    buildingYaw: Math.PI / 2,
    position: [-2.4, 0, 4.75],
    rotationY: 0,
    scale: 1,
    facing: 'east',
    note: 'East (veranda) apron, north of the courtyard posts',
  },
  {
    // World [20.60, −26.55].  Portico doorway on the south face (opening
    // X 22.30 … 23.90; columns X 20.90 … 25.30 at Z −28.40); plinth south face
    // Z −27.15; reading bench at [23.10, −26.80].  The plate's near face stands
    // 0.40 south of the plinth (group origin 0.60) at the portico's west end,
    // 1.10 west of the bench and 2.0 west of the walk line from the [23.1, −26]
    // arrival.
    id: 'records_library',
    building: 'RecordsLibrary.tsx',
    label: 'Records & Lore Library',
    assetPath: '/signs/records_library/records_library.glb',
    plateWidth: 0.914,
    buildingRoot: [23.1, -30],
    buildingYaw: 0,
    position: [-2.5, 0, 3.45],
    rotationY: 0,
    scale: 1,
    facing: 'south',
    note: 'South (portico) apron, west of the reading bench',
  },
  {
    // World [−26.85, −1.70].  Porch doorway faces south at Z ≈ −2.40 (columns
    // X −30.20 / −27.80, steps X −30.40 … −27.60 at Z −2.60 … −2.20); plinth
    // south face Z −2.25.  The plate's near face stands 0.35 south of the
    // plinth (group origin 0.55) east of the porch, 0.30 south of the step edge
    // and 0.60 clear of the east column.
    id: 'arena_medical',
    building: 'ArenaMedicalHouse.tsx',
    label: 'Arena Medical House',
    assetPath: '/signs/arena_medical/arena_medical.glb',
    plateWidth: 1.166,
    buildingRoot: [-29, -5],
    buildingYaw: 0,
    position: [2.15, 0, 3.3],
    rotationY: 0,
    scale: 1,
    facing: 'south',
    note: 'South (porch) apron, east of the infirmary steps',
  },
  {
    // World [−25.40, −10.40].  Door faces south at Z −11.18 (opening
    // X −27.75 … −26.25) under the timber balcony (rail Z −11.30, posts at
    // X −30.00 / −24.00); plinth south face Z −10.95.  The plate stands 0.35
    // south of the plinth (near face 0.35) east of the door, its post 0.13
    // clear of the east jamb and 0.96 west of the balcony's east post.  The [−22, −14] arrival
    // is on the east side, so the sign is met rounding the south-east corner.
    id: 'gladiator_barracks',
    building: 'GladiatorBarracks.tsx',
    label: 'Gladiator Barracks',
    assetPath: '/signs/gladiator_barracks/gladiator_barracks.glb',
    plateWidth: 0.878,
    buildingRoot: [-27, -14],
    buildingYaw: 0,
    position: [1.6, 0, 3.6],
    rotationY: 0,
    scale: 1,
    facing: 'south',
    note: 'South (door) apron, east of the timber doorway',
  },
  {
    // World [28.30, −22.80].  The academy's own portal faces west off its
    // forecourt, but that front is a 3.9-wide pocket between two columns
    // (X 26.58, Z −28.50 / −25.50), the [25.5, −23] arrival sits on its
    // south-west corner and a sign there would stand on the walk line into the
    // portal.  The sign therefore reads SOUTH off the undecorated south
    // frontage, its near face 0.35 south of the plinth face (−23.35) and 2.8
    // east of the arrival — the face the arriving player looks at first.
    id: 'gladiator_academy',
    building: 'GladiatorAcademy.tsx',
    label: 'Gladiator Ludus Academy',
    assetPath: '/signs/gladiator_academy/gladiator_academy.glb',
    plateWidth: 0.879,
    buildingRoot: [30.5, -27],
    buildingYaw: 0,
    position: [-2.2, 0, 4.2],
    rotationY: 0,
    scale: 1,
    facing: 'south',
    note: 'South frontage, east of the south-west corner',
  },
  {
    // World [−26.90, −21.60].  Portico doorway faces south at Z −22.50
    // (opening X −24.80 … −23.20; crimson columns X −25.80 / −22.20 at
    // Z −22.18); lower step Z −21.95 / upper step −22.28.  The plate's near face
    // stands 0.15 south of the lower step (group origin 0.35, the step itself is
    // 0.16 tall) west of the door, 0.23 south of the west column and 0.52 west
    // of its shaft.  The [−24, −29] fast-travel arrival
    // is BEHIND the hall (north); the sign stays on the entrance face rather
    // than on a blank rear wall, so it is read approaching on foot.
    id: 'veteran_hall',
    building: 'VeteranGladiatorHall.tsx',
    label: 'Veteran Gladiator Hall',
    assetPath: '/signs/veteran_hall/veteran_hall.glb',
    plateWidth: 1.17,
    buildingRoot: [-24, -25],
    buildingYaw: 0,
    position: [-2.9, 0, 3.4],
    rotationY: 0,
    scale: 1,
    facing: 'south',
    note: 'South (portico) apron, west of the ceremonial doorway',
  },
];

export const LANDMARK_SIGNS_BY_ID: Record<LandmarkSignId, LandmarkSignMount> = Object.fromEntries(
  LANDMARK_SIGNS.map((sign) => [sign.id, sign]),
) as Record<LandmarkSignId, LandmarkSignMount>;

/** World transform of a mount: `world = root + R_y(buildingYaw) · local`. */
export function landmarkSignWorldMount(sign: LandmarkSignMount): {
  position: [number, number, number];
  rotationY: number;
} {
  const [lx, ly, lz] = sign.position;
  const cos = Math.cos(sign.buildingYaw);
  const sin = Math.sin(sign.buildingYaw);
  return {
    position: [sign.buildingRoot[0] + lx * cos + lz * sin, ly, sign.buildingRoot[1] - lx * sin + lz * cos],
    rotationY: sign.buildingYaw + sign.rotationY,
  };
}

/**
 * World XZ footprint of the whole assembly (post base … far plate edge).
 * Both the post and the plate share the ±0.199 depth envelope, so the local
 * rectangle is [minLocalX, plateWidth / 2] × ±halfDepth, rotated by the world
 * yaw and re-boxed.  Used to prove no sign reaches a collider.
 */
export function landmarkSignWorldFootprint(sign: LandmarkSignMount): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  const { position, rotationY } = landmarkSignWorldMount(sign);
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const localX: [number, number] = [LANDMARK_SIGN_ASSET_BOUNDS.minLocalX, sign.plateWidth / 2];
  const halfDepth = LANDMARK_SIGN_ASSET_BOUNDS.halfDepth;
  const corners: Array<[number, number]> = [];
  for (const x of localX) {
    for (const z of [-halfDepth, halfDepth]) {
      corners.push([position[0] + x * cos + z * sin, position[2] - x * sin + z * cos]);
    }
  }
  const xs = corners.map((c) => c[0]);
  const zs = corners.map((c) => c[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}
