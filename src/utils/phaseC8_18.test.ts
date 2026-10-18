/**
 * Phase C-8.18 — Records Library relocation (Gladiator Academy interpenetration).
 *
 * Phase C-8.17's pairwise audit found the Records Library plinth (east face
 * X = 27.25) interpenetrating the Gladiator Academy's west side: the academy
 * plinth footprint reaches X = 26.65, so the two footprints overlapped by 0.60
 * and the library's plinth and marble platform physically cut through the
 * academy's west doorway (jambs, threshold, foot-worn step) and its portico
 * column bases.
 *
 * This phase moves the library root 0.90 west — [24, 0, -30] → [23.10, 0, -30]
 * — putting its plinth east face at X = 26.35.  The planned results are
 * verified below from the real geometry: a 0.30-unit footprint-to-footprint gap
 * with the academy plinth and a 0.53-unit clearance from the academy's west
 * doorway opening plane (the doorway's own origin plane).
 *
 * Rendered dimensions are read from the component sources and evaluated with
 * the primitives' documented formulas (cross-checked against
 * ClassicalArchitecture.tsx in section B), so every clearance is derived from
 * real numbers rather than restated.  The collider, hub and arrival come from
 * the real registry and tables, and the traversal cases drive the real movement
 * resolver.
 *
 * Footprint, scale, rotation, entrance orientation, architecture, materials and
 * assets are unchanged by this phase, and no other structure moved.
 *
 * Run with: bun test src/utils/phaseC8_18.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  PLAYER_RADIUS,
  CITY_COLLIDERS,
  collidesWith,
  type Collider,
  type RectCollider,
} from './collisionShapes';
import {
  resolveCityMovement,
  FAST_TRAVEL_ARRIVALS,
  HUB_LOCATIONS,
  getNearbyHubLocation,
} from './cityCollisions';

// ── Sources ───────────────────────────────────────────────────────────────

const load = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), 'utf8');

const libSrc = load('../components/3d/city/RecordsLibrary.tsx');
const acadSrc = load('../components/3d/city/GladiatorAcademy.tsx');
const archSrc = load('../components/3d/city/ClassicalArchitecture.tsx');
const foundationSrc = load('../components/3d/city/BuildingFoundation.tsx');
const coloSrc = load('../components/3d/city/GrandColosseum.tsx');

const R = PLAYER_RADIUS;
/** Documented Phase 31D arrival invariant: player radius + 0.5 safety margin. */
const ARRIVAL_CLEARANCE = R + 0.5; // 0.9

/** First `[a, b]` captured by `re`. */
function pair(src: string, re: RegExp): [number, number] {
  const m = re.exec(src);
  if (!m) throw new Error(`pair not found: ${re}`);
  return [Number(m[1]), Number(m[2])];
}

/** First `[a, b, c]` captured by `re`. */
function triple(src: string, re: RegExp): [number, number, number] {
  const m = re.exec(src);
  if (!m) throw new Error(`triple not found: ${re}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** First single number captured by `re`. */
function num(src: string, re: RegExp): number {
  const m = re.exec(src);
  if (!m) throw new Error(`number not found: ${re}`);
  return Number(m[1]);
}

/** First list of numbers captured by `re`. */
function nums(src: string, re: RegExp): number[] {
  const m = re.exec(src);
  if (!m) throw new Error(`list not found: ${re}`);
  return m.slice(1).map(Number);
}

function findRect(id: string): RectCollider {
  const c = CITY_COLLIDERS.find((c) => c.id === id);
  if (!c || c.type !== 'rect') throw new Error(`Rect collider '${id}' not found`);
  return c;
}

// ── Rendered geometry: Records Library (parsed from its own source) ───────

const LIB_ROOT = triple(
  libSrc,
  /<group\s+position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*\{\/\* 0\. STEPPED MARBLE/,
);
const LIB_FOUNDATION = pair(
  libSrc,
  /<BuildingFoundation\s+size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
);
const LIB_FOUNDATION_HEIGHT = num(libSrc, /<BuildingFoundation[\s\S]*?height=\{([\d.]+)\}/);
const LIB_PROJECTION = num(libSrc, /<BuildingFoundation[\s\S]*?projection=\{([\d.]+)\}/);
const LIB_PLATFORM = {
  pos: triple(libSrc, /<mesh[^>]*position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*<boxGeometry/),
  args: triple(libSrc, /<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}\s*\/>\s*<meshStandardMaterial color="#e2e8f0"/),
};
const LIB_WALL = {
  pos: triple(libSrc, /position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*<boxGeometry args=\{\[\s*5\.2/),
  args: triple(libSrc, /<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}\s*\/>\s*<meshStandardMaterial color="#f1f5f9"/),
};
const LIB_CORNICE = {
  size: pair(libSrc, /<WallCornice\s+size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}\s+y=\{([\d.]+)/),
  y: num(libSrc, /<WallCornice\s+size=\{\[\s*[\d.]+,\s*[\d.]+\s*\]\}\s+y=\{([\d.]+)/),
  height: num(libSrc, /<WallCornice[\s\S]*?height=\{([\d.]+)\}/),
  projection: num(libSrc, /<WallCornice[\s\S]*?projection=\{([\d.]+)\}/),
};
const LIB_ROOF = {
  width: num(libSrc, /<RomanGabledRoof[\s\S]*?width=\{([\d.]+)\}/),
  depth: num(libSrc, /<RomanGabledRoof[\s\S]*?depth=\{([\d.]+)\}/),
  height: num(libSrc, /<RomanGabledRoof[\s\S]*?height=\{([\d.]+)\}/),
  overhang: num(libSrc, /<RomanGabledRoof[\s\S]*?eaveOverhang=\{([\d.]+)\}/),
  pos: triple(
    libSrc,
    /<RomanGabledRoof[\s\S]*?position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/,
  ),
};
const LIB_DOOR = {
  pos: triple(
    libSrc,
    /<ClassicalDoorway\s+position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/,
  ),
  width: num(libSrc, /<ClassicalDoorway[\s\S]*?width=\{([\d.]+)\}/),
  height: num(libSrc, /<ClassicalDoorway[\s\S]*?height=\{([\d.]+)\}/),
  depth: num(libSrc, /<ClassicalDoorway[\s\S]*?depth=\{([\d.]+)\}/),
};
const LIB_PORTICO_POS = triple(
  libSrc,
  /<group\s+position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*\{\/\* Classical Monumental Pediment/,
);
const LIB_PEDIMENT = {
  width: num(libSrc, /<ClassicalPediment[\s\S]*?width=\{([\d.]+)\}/),
  depth: num(libSrc, /<ClassicalPediment[\s\S]*?depth=\{([\d.]+)\}/),
  height: num(libSrc, /<ClassicalPediment[\s\S]*?height=\{([\d.]+)\}/),
  y: num(libSrc, /<ClassicalPediment[\s\S]*?position=\{\[0,\s*([\d.]+),/),
};
const LIB_COLUMN = {
  offsets: nums(libSrc, /\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(x, i\)/),
  height: num(libSrc, /<ClassicalColumn[\s\S]*?height=\{([\d.]+)\}/),
  radius: num(libSrc, /<ClassicalColumn[\s\S]*?radius=\{([\d.]+)\}/),
};
const LIB_BENCH = triple(
  libSrc,
  /<RomanBench\s+position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/,
);

// ── Rendered geometry: Gladiator Academy (parsed from its own source) ─────

const ACAD_ROOT = triple(
  acadSrc,
  /<group\s+position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*\{\/\* 0\. STEPPED TRAVERTINE/,
);
const ACAD_FOUNDATION = pair(
  acadSrc,
  /<BuildingFoundation\s+size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
);
const ACAD_FOUNDATION_HEIGHT = num(acadSrc, /<BuildingFoundation[\s\S]*?height=\{([\d.]+)\}/);
const ACAD_PROJECTION = num(acadSrc, /<BuildingFoundation[\s\S]*?projection=\{([\d.]+)\}/);
const ACAD_GROUND_WALL = {
  pos: triple(
    acadSrc,
    /position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*<boxGeometry args=\{\[\s*7\.2/,
  ),
  args: triple(
    acadSrc,
    /<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}\s*\/>\s*<meshStandardMaterial color="#f5ede0"/,
  ),
};
const ACAD_QUOINS = {
  building: pair(
    acadSrc,
    /<CornerQuoins\s+height=\{[\d.]+\}\s+buildingSize=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/,
  ),
  height: num(acadSrc, /<CornerQuoins\s+height=\{([\d.]+)\}/),
};
const ACAD_BELT_CORNICE = {
  size: pair(acadSrc, /<WallCornice\s+size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}\s+y=\{2\.9\}/),
  y: num(acadSrc, /<WallCornice\s+size=\{\[[\d.]+, [\d.]+\]\}\s+y=\{([\d.]+)\}/),
  height: num(acadSrc, /<WallCornice[\s\S]*?height=\{([\d.]+)\}/),
  projection: num(acadSrc, /<WallCornice[\s\S]*?projection=\{([\d.]+)\}/),
};
const ACAD_UPPER_WALL = {
  pos: triple(
    acadSrc,
    /position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*<boxGeometry args=\{\[\s*6\.8/,
  ),
  args: triple(
    acadSrc,
    /<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}\s*\/>\s*<meshStandardMaterial color="#ebdcb9"/,
  ),
};
const ACAD_WINDOW = {
  pos: triple(
    acadSrc,
    /<ClassicalWindow\s+position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/,
  ),
  width: num(acadSrc, /<ClassicalWindow[\s\S]*?width=\{([\d.]+)\}/),
  height: num(acadSrc, /<ClassicalWindow[\s\S]*?height=\{([\d.]+)\}/),
};
/** Z offset of every ClassicalWindow the academy renders (two, west face). */
const ACAD_WINDOW_ZS = (() => {
  const re =
    /<ClassicalWindow\s+position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/g;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(acadSrc)) !== null) out.push(Number(m[3]));
  if (out.length !== 2) throw new Error(`expected 2 academy windows, found ${out.length}`);
  return out;
})();
const ACAD_ROOF = {
  width: num(acadSrc, /<RomanGabledRoof[\s\S]*?width=\{([\d.]+)\}/),
  depth: num(acadSrc, /<RomanGabledRoof[\s\S]*?depth=\{([\d.]+)\}/),
  height: num(acadSrc, /<RomanGabledRoof[\s\S]*?height=\{([\d.]+)\}/),
  overhang: num(acadSrc, /<RomanGabledRoof[\s\S]*?eaveOverhang=\{([\d.]+)\}/),
  pos: triple(
    acadSrc,
    /<RomanGabledRoof[\s\S]*?position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/,
  ),
};
const ACAD_PORTAL_GROUP = triple(
  acadSrc,
  /<group\s+position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*\{\/\* Recessed Framed Portal/,
);
const ACAD_DOOR = {
  pos: triple(
    acadSrc,
    /<ClassicalDoorway\s+position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/,
  ),
  width: num(acadSrc, /<ClassicalDoorway[\s\S]*?width=\{([\d.]+)\}/),
  height: num(acadSrc, /<ClassicalDoorway[\s\S]*?height=\{([\d.]+)\}/),
  depth: num(acadSrc, /<ClassicalDoorway[\s\S]*?depth=\{([\d.]+)\}/),
};
const ACAD_COLUMN = {
  localPos: triple(
    acadSrc,
    /<ClassicalColumn[\s\S]*?position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*cz\]\}/,
  ),
  height: num(acadSrc, /<ClassicalColumn[\s\S]*?height=\{([\d.]+)\}/),
  radius: num(acadSrc, /<ClassicalColumn[\s\S]*?radius=\{([\d.]+)\}/),
  zOffsets: pair(acadSrc, /\{\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(cz, ci\)/),
};

// ── Primitive formulas (verified against ClassicalArchitecture.tsx) ───────

/** BuildingFoundation: lower step projects `p`, upper step 1.2·p; 45/55 split. */
const lowerWidth = (w: number, p: number) => w + 2 * p;
const lowerHeight = (h: number) => h * 0.45;

/** ClassicalDoorway. */
const JAMB_WIDTH = 0.22;
const LINTEL_HEIGHT = 0.28;

/** ClassicalColumn: square plinth base 2.6·r wide; base torus to 1.35·r. */
const columnPlinthHeight = (height: number) => Math.min(0.25, height * 0.07);
const columnCapitalHeight = (height: number) => Math.min(0.32, height * 0.09);
const COLUMN_BASE_SCALE = 2.6;
const COLUMN_TORUS_SCALE = 2.7; // 1.35 radius → 2.7 diameter

/** RomanGabledRoof: roof planes reach halfSpan = span / 2 + eaveOverhang. */
const roofHalfSpan = (span: number, overhang: number) => span / 2 + overhang;
const roofFasciaHalfSpan = (span: number, overhang: number) =>
  (span + overhang * 1.2) / 2;

// ── World-space boxes ─────────────────────────────────────────────────────

interface Box {
  name: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

const box = (
  name: string,
  x: [number, number],
  y: [number, number],
  z: [number, number],
): Box => ({ name, x0: x[0], x1: x[1], y0: y[0], y1: y[1], z0: z[0], z1: z[1] });

/** A box mesh at `pos` (relative to `parent`), `args` = [width, height, depth]. */
const meshBox = (
  name: string,
  parent: [number, number, number],
  pos: [number, number, number],
  args: [number, number, number],
): Box => {
  const cx = parent[0] + pos[0];
  const cy = parent[1] + pos[1];
  const cz = parent[2] + pos[2];
  return box(
    name,
    [cx - args[0] / 2, cx + args[0] / 2],
    [cy - args[1] / 2, cy + args[1] / 2],
    [cz - args[2] / 2, cz + args[2] / 2],
  );
};

/** Strict overlap — touching faces (a gap of 0) is NOT an intersection. */
const intersects = (a: Box, b: Box) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1 && a.z0 < b.z1 && b.z0 < a.z1;

/** Shallowest horizontal (XZ) separation of two boxes; 0 when they overlap. */
const horizontalSeparation = (a: Box, b: Box) =>
  Math.hypot(
    Math.max(0, a.x0 - b.x1, b.x0 - a.x1),
    Math.max(0, a.z0 - b.z1, b.z0 - a.z1),
  );

const bandsOverlap = (a: Box, b: Box) => a.y0 < b.y1 && b.y0 < a.y1;

/** Every structural element of the Records Library, for a given root X. */
function libraryBoxes(lx: number): Box[] {
  const lz = LIB_ROOT[2];
  const [fw, fd] = LIB_FOUNDATION;
  const p = LIB_PROJECTION;
  const h = LIB_FOUNDATION_HEIGHT;
  const lo = lowerHeight(h);
  const up = h;
  const roofPos = LIB_ROOF.pos;
  const roofZ = lz + roofPos[2];
  const roofY = roofPos[1];
  const halfRoof = roofHalfSpan(LIB_ROOF.width, LIB_ROOF.overhang);
  const halfRoofLength = roofHalfSpan(LIB_ROOF.depth, LIB_ROOF.overhang);
  const columnHalf = (LIB_COLUMN.radius * COLUMN_BASE_SCALE) / 2;
  const columnX = Math.max(...LIB_COLUMN.offsets.map(Math.abs));
  // Meshes parented to the root group, so they follow the parameterised root X.
  const root: [number, number, number] = [lx, LIB_ROOT[1], lz];

  return [
    box(
      'library plinth (lower step)',
      [lx - lowerWidth(fw, p) / 2, lx + lowerWidth(fw, p) / 2],
      [0, lo],
      [lz - lowerWidth(fd, p) / 2, lz + lowerWidth(fd, p) / 2],
    ),
    box(
      'library plinth (upper step)',
      [lx - (fw + 1.2 * p) / 2, lx + (fw + 1.2 * p) / 2],
      [lo, up],
      [lz - (fd + 1.2 * p) / 2, lz + (fd + 1.2 * p) / 2],
    ),
    meshBox('library marble platform', root, LIB_PLATFORM.pos, LIB_PLATFORM.args),
    meshBox('library cella wall', root, LIB_WALL.pos, LIB_WALL.args),
    box(
      'library cella eave cornice',
      [
        lx - (LIB_CORNICE.size[0] / 2 + LIB_CORNICE.projection),
        lx + (LIB_CORNICE.size[0] / 2 + LIB_CORNICE.projection),
      ],
      [LIB_CORNICE.y - LIB_CORNICE.height / 2, LIB_CORNICE.y + LIB_CORNICE.height / 2],
      [
        roofZ - (LIB_CORNICE.size[1] / 2 + LIB_CORNICE.projection),
        roofZ + (LIB_CORNICE.size[1] / 2 + LIB_CORNICE.projection),
      ],
    ),
    box(
      'library roof fascia',
      [
        lx - roofFasciaHalfSpan(LIB_ROOF.width, LIB_ROOF.overhang),
        lx + roofFasciaHalfSpan(LIB_ROOF.width, LIB_ROOF.overhang),
      ],
      [roofY - 0.16, roofY],
      [
        roofZ - roofFasciaHalfSpan(LIB_ROOF.depth, LIB_ROOF.overhang),
        roofZ + roofFasciaHalfSpan(LIB_ROOF.depth, LIB_ROOF.overhang),
      ],
    ),
    box(
      'library roof planes',
      [lx - halfRoof, lx + halfRoof],
      [roofY + 0.04, roofY + LIB_ROOF.height + 0.11],
      [roofZ - halfRoofLength, roofZ + halfRoofLength],
    ),
    box(
      'library roof ridge',
      [lx - 0.16, lx + 0.16],
      [roofY + LIB_ROOF.height, roofY + LIB_ROOF.height + 0.3],
      [roofZ - halfRoofLength - 0.04, roofZ + halfRoofLength + 0.04],
    ),
    box(
      'library portico columns',
      [lx - (columnX + columnHalf), lx + (columnX + columnHalf)],
      [LIB_PORTICO_POS[1], LIB_PORTICO_POS[1] + LIB_COLUMN.height],
      [lz + LIB_PORTICO_POS[2] - columnHalf, lz + LIB_PORTICO_POS[2] + columnHalf],
    ),
    box(
      'library portico pediment',
      [lx - (LIB_PEDIMENT.width / 2 + 0.2), lx + (LIB_PEDIMENT.width / 2 + 0.2)],
      [
        LIB_PORTICO_POS[1] + LIB_PEDIMENT.y,
        LIB_PORTICO_POS[1] + LIB_PEDIMENT.y + LIB_PEDIMENT.height + 0.32,
      ],
      [
        lz + LIB_PORTICO_POS[2] - (LIB_PEDIMENT.depth / 2 + 0.175),
        lz + LIB_PORTICO_POS[2] + (LIB_PEDIMENT.depth / 2 + 0.175),
      ],
    ),
    box(
      'library entrance doorway',
      [
        lx - (LIB_DOOR.width / 2 + JAMB_WIDTH + 0.175),
        lx + (LIB_DOOR.width / 2 + JAMB_WIDTH + 0.175),
      ],
      [
        LIB_DOOR.pos[1],
        LIB_DOOR.pos[1] + LIB_DOOR.height + LINTEL_HEIGHT + 0.1,
      ],
      [
        lz + LIB_DOOR.pos[2] - (LIB_DOOR.depth / 2 + 0.02),
        lz + LIB_DOOR.pos[2] + (LIB_DOOR.depth / 2 + 0.02),
      ],
    ),
    box(
      'library reading bench',
      [lx - 1.0, lx + 1.0],
      [0, 0.57],
      [lz + LIB_BENCH[2] - 0.325, lz + LIB_BENCH[2] + 0.325],
    ),
  ];
}

/** Every structural element of the Gladiator Academy's west side. */
function academyBoxes(): Box[] {
  const [ax, , az] = ACAD_ROOT;
  const [fw, fd] = ACAD_FOUNDATION;
  const p = ACAD_PROJECTION;
  const h = ACAD_FOUNDATION_HEIGHT;
  const lo = lowerHeight(h);
  const roofY = ACAD_ROOF.pos[1];
  const halfRoof = roofHalfSpan(ACAD_ROOF.width, ACAD_ROOF.overhang);
  const halfRoofLength = roofHalfSpan(ACAD_ROOF.depth, ACAD_ROOF.overhang);

  // West portal: the colonnade group carries the doorway and its two columns.
  const portalX = ax + ACAD_PORTAL_GROUP[0];
  const portalZ = az + ACAD_PORTAL_GROUP[2];
  const doorX = portalX + ACAD_DOOR.pos[0];
  const doorZ = portalZ + ACAD_DOOR.pos[2];
  const d = ACAD_DOOR.depth;
  // The doorway is rotated [0, -π/2, 0]: local +Z runs to −X, local +X to +Z.
  const doorWorldX = (localZ: number) => doorX - localZ;
  const doorWorldZ = (localX: number) => doorZ + localX;

  const colX = portalX + ACAD_COLUMN.localPos[0];
  const colPlinth = columnPlinthHeight(ACAD_COLUMN.height);
  const colBaseHalf = (ACAD_COLUMN.radius * COLUMN_BASE_SCALE) / 2;
  const colTorusHalf = (ACAD_COLUMN.radius * COLUMN_TORUS_SCALE) / 2;
  const colCapital = columnCapitalHeight(ACAD_COLUMN.height);
  const jambOuter = ACAD_DOOR.width / 2 + JAMB_WIDTH;

  const boxes: Box[] = [
    box(
      'academy plinth (lower step)',
      [ax - lowerWidth(fw, p) / 2, ax + lowerWidth(fw, p) / 2],
      [0, lo],
      [az - lowerWidth(fd, p) / 2, az + lowerWidth(fd, p) / 2],
    ),
    box(
      'academy plinth (upper step)',
      [ax - (fw + 1.2 * p) / 2, ax + (fw + 1.2 * p) / 2],
      [lo, h],
      [az - (fd + 1.2 * p) / 2, az + (fd + 1.2 * p) / 2],
    ),
    meshBox('academy ground-floor wall', ACAD_ROOT, ACAD_GROUND_WALL.pos, ACAD_GROUND_WALL.args),
    box(
      'academy belt cornice',
      [
        ax - (ACAD_BELT_CORNICE.size[0] / 2 + ACAD_BELT_CORNICE.projection),
        ax + (ACAD_BELT_CORNICE.size[0] / 2 + ACAD_BELT_CORNICE.projection),
      ],
      [
        ACAD_BELT_CORNICE.y - ACAD_BELT_CORNICE.height / 2,
        ACAD_BELT_CORNICE.y + ACAD_BELT_CORNICE.height / 2,
      ],
      [
        az - (ACAD_BELT_CORNICE.size[1] / 2 + ACAD_BELT_CORNICE.projection),
        az + (ACAD_BELT_CORNICE.size[1] / 2 + ACAD_BELT_CORNICE.projection),
      ],
    ),
    meshBox('academy upper-floor wall', ACAD_ROOT, ACAD_UPPER_WALL.pos, ACAD_UPPER_WALL.args),
    box(
      'academy roof fascia',
      [
        ax - roofFasciaHalfSpan(ACAD_ROOF.width, ACAD_ROOF.overhang),
        ax + roofFasciaHalfSpan(ACAD_ROOF.width, ACAD_ROOF.overhang),
      ],
      [roofY - 0.16, roofY],
      [
        az - roofFasciaHalfSpan(ACAD_ROOF.depth, ACAD_ROOF.overhang),
        az + roofFasciaHalfSpan(ACAD_ROOF.depth, ACAD_ROOF.overhang),
      ],
    ),
    box(
      'academy roof planes',
      [ax - halfRoof, ax + halfRoof],
      [roofY + 0.04, roofY + ACAD_ROOF.height + 0.11],
      [az - halfRoofLength, az + halfRoofLength],
    ),
    box(
      'academy roof ridge',
      [ax - 0.16, ax + 0.16],
      [roofY + ACAD_ROOF.height, roofY + ACAD_ROOF.height + 0.3],
      [az - halfRoofLength - 0.04, az + halfRoofLength + 0.04],
    ),
    // The recessed dark opening: local Z ∈ [−d/2, 0], local X ∈ ±width/2.
    box(
      'academy west doorway opening',
      [doorWorldX(0), doorWorldX(-d / 2)],
      [0, ACAD_DOOR.height],
      [doorWorldZ(-ACAD_DOOR.width / 2), doorWorldZ(ACAD_DOOR.width / 2)],
    ),
    box(
      'academy west doorway jambs',
      [doorWorldX(d / 2 + 0.02), doorWorldX(-(d / 2 + 0.02))],
      [0, ACAD_DOOR.height],
      [doorWorldZ(-jambOuter), doorWorldZ(jambOuter)],
    ),
    box(
      'academy west doorway threshold',
      [doorWorldX((d + 0.15) / 2 + 0.05), doorWorldX(-((d + 0.15) / 2 - 0.05))],
      [0, 0.12],
      [doorWorldZ(-(jambOuter + 0.05)), doorWorldZ(jambOuter + 0.05)],
    ),
    box(
      'academy west doorway foot-worn step',
      [doorWorldX(d / 2 + 0.245), doorWorldX(d / 2 - 0.005)],
      [0, 0.04],
      [doorWorldZ(-jambOuter), doorWorldZ(jambOuter)],
    ),
    box(
      'academy west doorway lintel',
      [doorWorldX((d + 0.06) / 2 + 0.04), doorWorldX(-((d + 0.06) / 2 - 0.04))],
      [ACAD_DOOR.height, ACAD_DOOR.height + LINTEL_HEIGHT],
      [doorWorldZ(-(jambOuter + 0.1)), doorWorldZ(jambOuter + 0.1)],
    ),
    // Half-disc lunette (radius width·0.55) and its keystone block.
    box(
      'academy west doorway lunette',
      [
        doorWorldX(ACAD_DOOR.width * 0.55 + 0.02),
        doorWorldX(-(ACAD_DOOR.width * 0.55 - 0.02)),
      ],
      [ACAD_DOOR.height + LINTEL_HEIGHT + 0.25, ACAD_DOOR.height + LINTEL_HEIGHT + 0.65],
      [doorWorldZ(0), doorWorldZ(ACAD_DOOR.width * 0.55)],
    ),
    box(
      'academy west doorway keystone',
      [doorWorldX(0.04 + (d + 0.08) / 2), doorWorldX(0.04 - (d + 0.08) / 2)],
      [ACAD_DOOR.height + LINTEL_HEIGHT + 0.605, ACAD_DOOR.height + LINTEL_HEIGHT + 0.955],
      [doorWorldZ(-0.13), doorWorldZ(0.13)],
    ),
  ];

  // Corner quoins project 0.175 (0.35 / 2) along X at each corner.
  const quoinTop = Math.floor(ACAD_QUOINS.height / 0.5) * 0.5; // 2.5 + one block
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    boxes.push(
      box(
        `academy corner quoins (${sx > 0 ? 'east' : 'west'}-${sz > 0 ? 'south' : 'north'})`,
        [
          ax + (sx * ACAD_QUOINS.building[0]) / 2 - 0.175,
          ax + (sx * ACAD_QUOINS.building[0]) / 2 + 0.175,
        ],
        [0, quoinTop],
        [
          az + (sz * ACAD_QUOINS.building[1]) / 2 - 0.11,
          az + (sz * ACAD_QUOINS.building[1]) / 2 + 0.11,
        ],
      ),
    );
  }

  // Upper-floor windows on the west face (rotation [0, -π/2, 0]).
  for (const wz of ACAD_WINDOW_ZS) {
    boxes.push(
      box(
        `academy west window (z ${az + wz})`,
        [ACAD_WINDOW.pos[0] - 0.17, ACAD_WINDOW.pos[0] + 0.13],
        [
          ACAD_WINDOW.pos[1] - ACAD_WINDOW.height / 2 - 0.085,
          ACAD_WINDOW.pos[1] + ACAD_WINDOW.height / 2 + 0.085,
        ],
        [
          az + wz - (ACAD_WINDOW.width + 0.4) / 2,
          az + wz + (ACAD_WINDOW.width + 0.4) / 2,
        ],
      ),
    );
  }

  // Portico columns flanking the west doorway: base plinth, torus, shaft, capital.
  for (const cz of ACAD_COLUMN.zOffsets) {
    const zc = az + cz;
    boxes.push(
      box(
        `academy portico column base plinth (z ${zc})`,
        [colX - colBaseHalf, colX + colBaseHalf],
        [0, colPlinth],
        [zc - colBaseHalf, zc + colBaseHalf],
      ),
      box(
        `academy portico column torus (z ${zc})`,
        [colX - colTorusHalf, colX + colTorusHalf],
        [colPlinth, colPlinth + 0.08],
        [zc - colTorusHalf, zc + colTorusHalf],
      ),
      box(
        `academy portico column shaft (z ${zc})`,
        [colX - ACAD_COLUMN.radius, colX + ACAD_COLUMN.radius],
        [colPlinth + 0.08, ACAD_COLUMN.height - colCapital],
        [zc - ACAD_COLUMN.radius, zc + ACAD_COLUMN.radius],
      ),
      box(
        `academy portico column capital (z ${zc})`,
        [colX - ACAD_COLUMN.radius * 1.5, colX + ACAD_COLUMN.radius * 1.5],
        [ACAD_COLUMN.height - colCapital, ACAD_COLUMN.height],
        [zc - ACAD_COLUMN.radius * 1.5, zc + ACAD_COLUMN.radius * 1.5],
      ),
    );
  }

  return boxes;
}

const plinthEast = (lx: number) => lx + lowerWidth(LIB_FOUNDATION[0], LIB_PROJECTION) / 2; // 26.35
const plinthSouthFace = LIB_ROOT[2] + lowerWidth(LIB_FOUNDATION[1], LIB_PROJECTION) / 2; // −27.15
/** West face of the academy doorway's own opening (its origin plane). */
const DOOR_OPENING_PLANE_X =
  ACAD_ROOT[0] + ACAD_PORTAL_GROUP[0] + ACAD_DOOR.pos[0]; // 26.88

const library = findRect('records-library');
const academy = findRect('gladiator-academy');
const LIB_HUB = HUB_LOCATIONS.find((l) => l.id === 'records_house');
const LIB_ARRIVAL = FAST_TRAVEL_ARRIVALS.records_house;

// ── Movement helpers (drive the real resolver) ────────────────────────────

const SPEED = 3.8;
const DT = 1 / 60;

function walk(
  start: [number, number, number],
  dx: number,
  dz: number,
  steps: number,
): Array<[number, number, number]> {
  const traj: Array<[number, number, number]> = [start];
  let p = start;
  for (let i = 0; i < steps; i++) {
    p = resolveCityMovement(p, dx, dz, SPEED, DT);
    traj.push(p);
  }
  return traj;
}

const everInside = (traj: Array<[number, number, number]>): boolean =>
  traj.some((p) => collidesWith(p[0], p[2], R, CITY_COLLIDERS));

function distanceTo(c: Collider, x: number, z: number): number {
  if (c.type === 'rect') {
    const dx = Math.max(c.cx - c.hw - x, 0, x - (c.cx + c.hw));
    const dz = Math.max(c.cz - c.hd - z, 0, z - (c.cz + c.hd));
    return Math.hypot(dx, dz);
  }
  if (c.type === 'circle') return Math.max(0, Math.hypot(x - c.cx, z - c.cz) - c.r);
  const vx = c.x2 - c.x1;
  const vz = c.z2 - c.z1;
  const t = Math.max(0, Math.min(1, ((x - c.x1) * vx + (z - c.z1) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(x - (c.x1 + t * vx), z - (c.z1 + t * vz));
}

function nearestColliderDistance(x: number, z: number): number {
  let best = Infinity;
  for (const c of CITY_COLLIDERS) best = Math.min(best, distanceTo(c, x, z));
  return best;
}

// ── A. Root, collider, hub and arrival ───────────────────────────────────

describe('A. Rendered root, collider, hub and arrival stay synchronised', () => {
  test('the library root is the planned C-8.18 position, footprint unchanged', () => {
    expect(LIB_ROOT).toEqual([23.1, 0, -30]);
    expect(LIB_FOUNDATION).toEqual([6.0, 5.2]);
    expect(LIB_PROJECTION).toBe(0.25);
    // No rotation was added: the entrance still faces +Z.
    expect(libSrc).not.toMatch(/<group\s+position=\{\[23\.1, 0, -30\]\}\s+rotation/);
    expect(LIB_DOOR.pos).toEqual([0, 0.5, 1.2]);
  });

  test('the collider equals the rendered plinth footprint at the new centre', () => {
    expect(library.cx).toBe(LIB_ROOT[0]);
    expect(library.cz).toBe(LIB_ROOT[2]);
    expect(library.hw * 2).toBeCloseTo(lowerWidth(LIB_FOUNDATION[0], LIB_PROJECTION), 10); // 6.5
    expect(library.hd * 2).toBeCloseTo(lowerWidth(LIB_FOUNDATION[1], LIB_PROJECTION), 10); // 5.7
    // Dimensions preserved: only the centre X moved.
    expect(library.hw).toBeCloseTo(3.25, 10);
    expect(library.hd).toBeCloseTo(2.85, 10);
    expect(plinthEast(LIB_ROOT[0])).toBeCloseTo(26.35, 10);
    expect(plinthSouthFace).toBeCloseTo(-27.15, 10);
  });

  test('hub and fast-travel arrival follow the root and keep the 1.15 offset', () => {
    expect(LIB_HUB?.position).toEqual([23.1, 0, -30]);
    expect(LIB_HUB?.radius).toBe(4.5);
    expect(HUB_LOCATIONS.filter((l) => l.id === 'records_house')).toHaveLength(1);
    expect(LIB_ARRIVAL).toEqual([23.1, -26]);
    // Still on the root's centre line, 1.15 from the plinth face.
    expect(LIB_ARRIVAL[0]).toBe(LIB_ROOT[0]);
    expect(LIB_ARRIVAL[1] - plinthSouthFace).toBeCloseTo(1.15, 10);
  });

  test('the library stays inside the world movement boundary', () => {
    expect(library.cx - library.hw).toBeGreaterThanOrEqual(-35);
    expect(library.cx + library.hw).toBeLessThanOrEqual(35);
    expect(library.cz - library.hd).toBeGreaterThanOrEqual(-91);
    expect(library.cz + library.hd).toBeLessThanOrEqual(35);
  });
});

// ── B. Mesh-layer interpenetration removed ───────────────────────────────

describe('B. Academy and Records Library no longer interpenetrate', () => {
  test('the primitives apply the formulas used here', () => {
    expect(foundationSrc).toContain('const lowerWidth = w + projection * 2;');
    expect(foundationSrc).toContain('const upperWidth = w + projection * 1.2;');
    expect(foundationSrc).toContain('const lowerHeight = height * 0.45;');
    expect(foundationSrc).toContain('const upperHeight = height * 0.55;');
    expect(archSrc).toContain('const jambWidth = 0.22;');
    expect(archSrc).toContain('const lintelHeight = 0.28;');
    expect(archSrc).toContain('const plinthHeight = Math.min(0.25, height * 0.07);');
    expect(archSrc).toContain('<boxGeometry args={[radius * 2.6, plinthHeight, radius * 2.6]} />');
    expect(archSrc).toContain('<cylinderGeometry args={[radius * 1.25, radius * 1.35, 0.08, 12]} />');
    expect(archSrc).toContain('const qx = isLong ? 0.35 : 0.22;');
    expect(archSrc).toContain('const halfSpan = span / 2 + eaveOverhang;');
    expect(archSrc).toContain('<boxGeometry args={[width + eaveOverhang * 1.2, 0.16, depth + eaveOverhang * 1.2]} />');
  });

  test('no pair of library and academy elements intersects', () => {
    const bad: string[] = [];
    for (const a of libraryBoxes(LIB_ROOT[0])) {
      for (const b of academyBoxes()) {
        if (intersects(a, b)) bad.push(`${a.name} ↔ ${b.name}`);
      }
    }
    expect(bad).toEqual([]);
  });

  test('the pre-move placement is exactly what this removes', () => {
    const bad = new Set<string>();
    for (const a of libraryBoxes(24)) {
      for (const b of academyBoxes()) {
        if (intersects(a, b)) bad.add(`${a.name} ↔ ${b.name}`);
      }
    }
    const names = [...bad];
    expect(names.length).toBeGreaterThan(0);
    // At X = 24 the plinth cut through the academy's west portal at ground
    // level and the marble platform sat inside the doorway and its columns.
    expect(names.some((s) => s.includes('plinth (lower step)') && s.includes('doorway jambs'))).toBe(true);
    expect(names.some((s) => s.includes('plinth (lower step)') && s.includes('column base plinth'))).toBe(true);
    expect(names.some((s) => s.includes('marble platform') && s.includes('doorway jambs'))).toBe(true);
    expect(names.some((s) => s.includes('marble platform') && s.includes('doorway opening'))).toBe(true);
    expect(names.some((s) => s.includes('marble platform') && s.includes('column shaft'))).toBe(true);
  });

  test('footprint-to-footprint clearance is the planned 0.30', () => {
    const gap = academy.cx - academy.hw - (library.cx + library.hw); // 26.65 − 26.35
    expect(gap).toBeCloseTo(0.3, 10);
    expect(gap).toBeGreaterThan(0);
  });

  test('the tightest band-sharing clearance is positive and localised', () => {
    let min = Infinity;
    let who = '';
    for (const a of libraryBoxes(LIB_ROOT[0])) {
      for (const b of academyBoxes()) {
        if (!bandsOverlap(a, b)) continue;
        const sep = horizontalSeparation(a, b);
        if (sep < min) {
          min = sep;
          who = `${a.name} ↔ ${b.name}`;
        }
      }
    }
    // The academy's own doorstep stonework projects into the 0.30 footprint
    // band; the tightest shared-band pair is the column base plinth at 0.022.
    expect(who).toContain('academy portico column base plinth');
    expect(min).toBeCloseTo(0.022, 3);
    expect(min).toBeGreaterThan(0);
  });

  test('named clearances around the academy west side', () => {
    const lib = libraryBoxes(LIB_ROOT[0]);
    const acad = academyBoxes();
    const findL = (n: string) => lib.find((b) => b.name === n)!;
    const findA = (n: string) => acad.find((b) => b.name.startsWith(n))!;

    const lower = findL('library plinth (lower step)');
    const platform = findL('library marble platform');
    const wall = findL('library cella wall');
    const cornice = findL('library cella eave cornice');
    const roof = findL('library roof planes');

    const acadPlinth = findA('academy plinth (lower step)');
    const groundWall = findA('academy ground-floor wall');
    const beltCornice = findA('academy belt cornice');
    const acadRoof = findA('academy roof planes');
    const shaft = findA('academy portico column shaft');
    const basePlinth = findA('academy portico column base plinth');
    const threshold = findA('academy west doorway threshold');
    const step = findA('academy west doorway foot-worn step');
    const jambs = findA('academy west doorway jambs');

    // Structure: plinths, walls, cornices and roofs.
    expect(horizontalSeparation(lower, acadPlinth)).toBeCloseTo(0.3, 10);
    expect(horizontalSeparation(lower, findA('academy corner quoins (west-north)'))).toBeCloseTo(0.375, 10);
    expect(horizontalSeparation(wall, groundWall)).toBeCloseTo(1.2, 10); // 26.9 − 25.7
    expect(horizontalSeparation(platform, groundWall)).toBeCloseTo(0.8, 10); // 26.9 − 26.1
    expect(horizontalSeparation(cornice, beltCornice)).toBeCloseTo(0.96, 10); // 26.78 − 25.82
    expect(horizontalSeparation(roof, acadRoof)).toBeCloseTo(0.7, 10); // 26.7 − 26.0
    expect(horizontalSeparation(findL('library roof fascia'), findA('academy roof fascia'))).toBeCloseTo(0.98, 10);
    // The library's own portico columns sit 0.89 clear of the academy's.
    expect(horizontalSeparation(findL('library portico columns'), basePlinth)).toBeCloseTo(0.89, 10);

    // The academy's ground-level west portal stonework is the tightest.
    expect(horizontalSeparation(platform, shaft)).toBeCloseTo(0.32, 10); // 26.42 − 26.10
    expect(horizontalSeparation(lower, jambs)).toBeCloseTo(0.31, 10); // 26.66 − 26.35
    expect(horizontalSeparation(lower, threshold)).toBeCloseTo(0.205, 10); // 26.555 − 26.35
    expect(horizontalSeparation(lower, step)).toBeCloseTo(0.085, 10); // 26.435 − 26.35
    expect(horizontalSeparation(lower, basePlinth)).toBeCloseTo(0.022, 10); // 26.372 − 26.35
  });
});

// ── C. West entrance clearance ───────────────────────────────────────────

describe('C. The academy west entrance and threshold are unobstructed', () => {
  test('the doorway opening plane keeps ≥ 0.50 units from the library plinth', () => {
    const clearance = DOOR_OPENING_PLANE_X - plinthEast(LIB_ROOT[0]); // 26.88 − 26.35
    expect(clearance).toBeCloseTo(0.53, 10);
    expect(clearance).toBeGreaterThanOrEqual(0.5);
  });

  test('nothing in the library reaches the doorway opening plane', () => {
    const lib = libraryBoxes(LIB_ROOT[0]);
    const westmost = Math.max(...lib.map((b) => b.x1));
    expect(westmost).toBeCloseTo(plinthEast(LIB_ROOT[0]), 10);
    expect(westmost).toBeLessThan(DOOR_OPENING_PLANE_X);
    // The doorway opening band itself (X ≥ the opening plane) stays empty.
    const openingBand = box('opening band', [DOOR_OPENING_PLANE_X, 27.2], [-1, 4], [-28.3, -25.7]);
    for (const b of lib) {
      expect(intersects(b, openingBand), `${b.name} enters the opening band`).toBe(false);
    }
  });

  test('the threshold, jambs, doorstep and column bases stay west of the plinth face', () => {
    const plinthEastFace = plinthEast(LIB_ROOT[0]);
    const acad = academyBoxes();
    const westOf = (n: string) =>
      Math.min(...acad.filter((b) => b.name.startsWith(n)).map((b) => b.x0));
    expect(westOf('academy west doorway jambs')).toBeGreaterThan(plinthEastFace);
    expect(westOf('academy west doorway threshold')).toBeGreaterThan(plinthEastFace);
    expect(westOf('academy west doorway foot-worn step')).toBeGreaterThan(plinthEastFace);
    expect(westOf('academy portico column base plinth')).toBeGreaterThan(plinthEastFace);
    // Exact values for the record: jambs 0.31, threshold 0.205, step 0.085,
    // column base plinth 0.022 — all positive, none touching.
    expect(westOf('academy west doorway jambs') - plinthEastFace).toBeCloseTo(0.31, 10);
    expect(westOf('academy portico column base plinth') - plinthEastFace).toBeCloseTo(0.022, 10);
  });

  test('the free apron in front of the doorway is walkable and un-penetrated', () => {
    // Walking east from the arrival is stopped by the academy plinth (26.65),
    // exactly as before: the library no longer obstructs the approach.
    const traj = walk([LIB_ARRIVAL[0], 0, LIB_ARRIVAL[1]], 1, 0, 60);
    const end = traj[traj.length - 1];
    expect(end[0]).toBeGreaterThan(26.15);
    expect(end[0]).toBeLessThan(26.26);
    expect(end[2]).toBeCloseTo(LIB_ARRIVAL[1], 10);
    expect(everInside(traj)).toBe(false);
  });
});

// ── D. Arrival behaviour and hub resolution ──────────────────────────────

describe('D. Arrival behaviour and nearby-hub resolution', () => {
  test('the arrival is collision-free with the documented clearance', () => {
    const best = nearestColliderDistance(LIB_ARRIVAL[0], LIB_ARRIVAL[1]);
    expect(best).toBeCloseTo(1.15, 10);
    expect(best).toBeGreaterThanOrEqual(ARRIVAL_CLEARANCE);
    expect(collidesWith(LIB_ARRIVAL[0], LIB_ARRIVAL[1], R, CITY_COLLIDERS)).toBe(false);
  });

  test('nearby-hub resolution at the arrival selects records_house and nothing else', () => {
    const covering = HUB_LOCATIONS.filter(
      (l) => Math.hypot(LIB_ARRIVAL[0] - l.position[0], LIB_ARRIVAL[1] - l.position[2]) <= l.radius,
    ).map((l) => l.id);
    expect(covering).toEqual(['records_house']);
    expect(getNearbyHubLocation([LIB_ARRIVAL[0], 0, LIB_ARRIVAL[1]])?.id).toBe('records_house');
  });

  test('walking to the library front stops on the plinth face without penetrating', () => {
    const traj = walk([LIB_ARRIVAL[0], 0, LIB_ARRIVAL[1]], 0, -1, 40);
    const end = traj[traj.length - 1];
    expect(end[2] - plinthSouthFace).toBeGreaterThanOrEqual(R);
    expect(end[2] - plinthSouthFace).toBeLessThan(R + SPEED * DT);
    expect(everInside(traj)).toBe(false);
    expect(getNearbyHubLocation(end)?.id).toBe('records_house');
  });

  test('the arrival is not a movement trap', () => {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const moved = resolveCityMovement(
        [LIB_ARRIVAL[0], 0, LIB_ARRIVAL[1]],
        dx,
        dz,
        SPEED,
        DT,
      );
      expect(
        Math.hypot(moved[0] - LIB_ARRIVAL[0], moved[2] - LIB_ARRIVAL[1]),
        `stuck pushing [${dx}, ${dz}]`,
      ).toBeGreaterThan(SPEED * DT * 0.9);
    }
  });
});

// ── E. Colosseum, academy and scope invariants ───────────────────────────

describe('E. Colosseum clearance, academy geometry and phase scope hold', () => {
  test('the academy geometry and collider are untouched', () => {
    expect(ACAD_ROOT).toEqual([30.5, 0, -27]);
    expect(ACAD_FOUNDATION).toEqual([7.2, 6.8]);
    expect(academy).toMatchObject({ cx: 30.5, cz: -27, hw: 3.85, hd: 3.65 });
  });

  test('the library clears the Colosseum collision ring and its rendered base ring', () => {
    // Collision ring: arc segments at radius 19.3 around the Colosseum root.
    let ringGap = Infinity;
    for (const c of CITY_COLLIDERS) {
      if (!c.id.startsWith('colo-wall')) continue;
      for (const [x, z] of [
        [library.cx - library.hw, library.cz - library.hd],
        [library.cx - library.hw, library.cz + library.hd],
      ] as const) {
        ringGap = Math.min(ringGap, distanceTo(c, x, z));
      }
    }
    expect(ringGap).toBeGreaterThan(0.8);
    expect(ringGap).toBeLessThan(0.9);

    // Rendered tier-1 base moulding (flared ring at ground level).
    const coloRootZ = num(coloSrc, /return \(\s*<group position=\{\[\s*0,\s*0,\s*(-?[\d.]+)\s*\]\}>/);
    const baseRingR = num(
      coloSrc,
      /0\. STEPPED TRAVERTINE FOUNDATION PODIUM PLINTH[\s\S]{0,400}?cylinderGeometry args=\{\[\s*[\d.]+,\s*([\d.]+),/,
    );
    expect(coloRootZ).toBe(-25);
    expect(baseRingR).toBe(19.5);
    const cornerDistance = Math.hypot(
      library.cx - library.hw,
      plinthSouthFace - coloRootZ,
    );
    expect(cornerDistance - baseRingR).toBeCloseTo(0.466, 3);
    expect(cornerDistance - baseRingR).toBeGreaterThan(0);
  });

  test('no new walkable passage opens between the library and the Colosseum', () => {
    // The west-side slot (library west face 19.85 vs the ring) is at most
    // 0.85 wide, so the resolver cannot thread it; the plinth blocks instead.
    for (const x of [19.7, 19.9, 20.3]) {
      const traj = walk([x, 0, -24.5], 0, -1, 240);
      const end = traj[traj.length - 1];
      expect(end[2]).toBeGreaterThan(plinthSouthFace);
      expect(everInside(traj)).toBe(false);
    }
  });

  test('every registry arrival is still collision-free, in bounds and ≥ 0.9 clear', () => {
    for (const loc of HUB_LOCATIONS) {
      const [ax, az] = FAST_TRAVEL_ARRIVALS[loc.id];
      expect(
        nearestColliderDistance(ax, az),
        `${loc.id} arrival clearance`,
      ).toBeGreaterThanOrEqual(ARRIVAL_CLEARANCE);
      expect(collidesWith(ax, az, R, CITY_COLLIDERS), `${loc.id} arrival collision`).toBe(false);
      expect(Math.abs(ax)).toBeLessThanOrEqual(35);
      expect(az).toBeGreaterThanOrEqual(-91);
      expect(az).toBeLessThanOrEqual(35);
    }
  });

  test('the Smithing Forge ↔ General Store overlap is untouched by this phase', () => {
    const forge = findRect('smithing-forge');
    const store = findRect('general-store');
    expect(forge).toMatchObject({ cx: 18, cz: 2, hw: 4.75, hd: 4.0 });
    expect(store).toMatchObject({ cx: 22, cz: -5, hw: 3.85, hd: 3.15 });
    // The pre-existing (unchanged) interpenetration, pinned so this phase
    // cannot silently widen or "fix" it.
    const overlapX = Math.min(forge.cx + forge.hw, store.cx + store.hw) -
      Math.max(forge.cx - forge.hw, store.cx - store.hw);
    const overlapZ = Math.min(forge.cz + forge.hd, store.cz + store.hd) -
      Math.max(forge.cz - forge.hd, store.cz - store.hd);
    expect(overlapX).toBeCloseTo(4.6, 10);
    expect(overlapZ).toBeCloseTo(0.15, 10);
  });

  test('unrelated neighbouring colliders and arrivals are unchanged', () => {
    expect(findRect('merchant-house')).toMatchObject({ cx: 26, cz: -13, hw: 3.85, hd: 3.5 });
    expect(findRect('doctore-house')).toMatchObject({ cx: 28, cz: -18.875, hw: 3.0, hd: 1.875 });
    expect(FAST_TRAVEL_ARRIVALS.doctore_house).toEqual([23.5, -18.875]);
    expect(FAST_TRAVEL_ARRIVALS.gladiator_academy).toEqual([25.5, -23]);
  });
});
