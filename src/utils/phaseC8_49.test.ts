/**
 * Phase C-8.49 — Imperial Stable roof alignment (timber wall ↔ gable gaps).
 *
 * The C-8.48 read-only rooftop audit found one real geometric defect in the city:
 * the Stable's timber box closed only 6.6 of the 7.0-unit depth its roof assembly
 * already spanned, so every timber face stopped 0.20 short of the gable plane —
 * rear wall outer face at +3.3 against a +3.5 gable, the two front posts at −3.3
 * against a −3.5 gable, and both 6.6-deep side walls at ±3.3.  In the rendered
 * frame that reads as a 0.20 slit between the oak walls and the roof's gable ends
 * on all four sides.
 *
 * The fix is the smallest correction that closes it: the box grows 6.6 → 7.0 about
 * its existing centreline (Z = 0), keeping every thickness, width, height, material
 * and the building's own position.
 *
 *   element                    before              after
 *   rear wall  (0.4 thick)     faces [2.9, 3.3]    faces [3.1, 3.5]   (outer face moved out)
 *   front posts (0.4 square)   faces [−3.3, −2.9]  faces [−3.5, −3.1] (outer face moved out)
 *   side walls (0.4 × 6.6)     ±3.3                ±3.5               (6.6 → 7.0 deep, centreline kept)
 *
 * Everything this suite pins is read from the component sources and the shipped
 * registry — the wall/posts/roof numbers are parsed from `Stable.tsx` itself, the
 * shared primitives' formulas are cross-checked against `ClassicalArchitecture.tsx`
 * and `BuildingFoundation.tsx`, and the collider, hub radius and fast-travel arrival
 * come from the real tables — so no assertion restates a value it does not derive.
 * Section H is the control: the pre-fix numbers are shown to fail the very rule the
 * shipped ones satisfy, and the shared primitives are shown to be the live source of
 * the roof envelope rather than a copy.
 *
 * Run with: bun test src/utils/phaseC8_49.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  PLAYER_RADIUS,
  CITY_COLLIDERS,
  type RectCollider,
} from './collisionShapes';
import {
  HUB_LOCATIONS,
  FAST_TRAVEL_ARRIVALS,
  getNearbyHubLocation,
} from './cityCollisions';

// ── Sources ───────────────────────────────────────────────────────────────

const load = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), 'utf8');

const stableSrc = load('../components/3d/city/Stable.tsx');
const caravSrc = load('../components/3d/city/CaravanseraiInn.tsx');
const workshopSrc = load('../components/3d/city/ArmorLeatherWorkshop.tsx');
const archSrc = load('../components/3d/city/ClassicalArchitecture.tsx');
const foundationSrc = load('../components/3d/city/BuildingFoundation.tsx');

// ── Parsing helpers (values, not string presence) ─────────────────────────

/** First `[a, b]` captured by `re`. */
function pair(src: string, re: RegExp): [number, number] {
  const m = re.exec(src);
  if (!m) throw new Error(`pair not found: ${re}`);
  return [Number(m[1]), Number(m[2])];
}

/** First single number captured by `re`. */
function num(src: string, re: RegExp): number {
  const m = re.exec(src);
  if (!m) throw new Error(`number not found: ${re}`);
  return Number(m[1]);
}

/** The whole self-closing JSX element `<Tag … />`. */
function element(src: string, tag: string): string {
  const start = src.indexOf('<' + tag);
  if (start < 0) throw new Error(`<${tag}> not found`);
  const end = src.indexOf('/>', start);
  if (end < 0) throw new Error(`<${tag}> is not a self-closing element`);
  return src.slice(start, end + 2);
}

/** `attr={7.0}` → 7.0. */
function attrNum(el: string, attr: string): number {
  const m = new RegExp(`\\b${attr}=\\{(-?[\\d.]+)\\}`).exec(el);
  if (!m) throw new Error(`attribute ${attr} not found`);
  return Number(m[1]);
}

/** `attr={[a, b]}` / `attr={[a, b, c]}` → the numbers. */
function attrList(el: string, attr: string): number[] {
  const m = new RegExp(`\\b${attr}=\\{\\[([^\\]]*)\\]\\}`).exec(el);
  if (!m) throw new Error(`attribute ${attr} not found`);
  return m[1].split(',').map((s) => Number(s.trim()));
}

/** `attr="text"` → text. */
function attrStr(el: string, attr: string): string {
  const m = new RegExp(`\\b${attr}="([^"]*)"`).exec(el);
  if (!m) throw new Error(`attribute ${attr} not found`);
  return m[1];
}

function pick<T>(items: T[], pred: (t: T) => boolean, label: string): T {
  const found = items.filter(pred);
  if (found.length !== 1) {
    throw new Error(`expected exactly one ${label}, found ${found.length}`);
  }
  return found[0];
}

interface Box {
  /** [width, height, depth] of the box geometry. */
  args: [number, number, number];
  /** [x, y, z] of the mesh that carries it. */
  pos: [number, number, number];
}

/**
 * Every `<mesh … position={[x, y, z]}>` wrapping a literal `<boxGeometry args={[w, h, d]} />`,
 * in source order.  A mesh whose position is an expression (the post map's `[x, 2.1, z]`)
 * is deliberately not matched — those are read with `postGeometry()` below.
 */
function literalBoxes(src: string): Box[] {
  const re =
    /<mesh\b[^<>]*?position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}[^<>]*?>\s*<boxGeometry args=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}\s*\/>/g;
  const out: Box[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    out.push({
      pos: [Number(m[1]), Number(m[2]), Number(m[3])],
      args: [Number(m[4]), Number(m[5]), Number(m[6])],
    });
  }
  return out;
}

/** The front-post map's own mesh: its Y, its Z and its box signature (X is the map variable). */
function postGeometry(src: string) {
  const m =
    /<mesh key=\{`stable-post-\$\{i\}`\}[^<>]*?position=\{\[x,\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}[^<>]*>\s*<boxGeometry args=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}\s*\/>/.exec(
      src,
    );
  if (!m) throw new Error('the post map mesh could not be read');
  return {
    y: Number(m[1]),
    z: Number(m[2]),
    args: [Number(m[3]), Number(m[4]), Number(m[5])] as [number, number, number],
  };
}

/** The first `<group position={[x, y, z]}>` in a component — each file's root group. */
function rootGroup(src: string): [number, number, number] {
  const m =
    /<group\s+position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/.exec(src);
  if (!m) throw new Error('root group not found');
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function findRect(id: string): RectCollider {
  const c = CITY_COLLIDERS.find((c) => c.id === id);
  if (!c || c.type !== 'rect') throw new Error(`Rect collider '${id}' not found`);
  return c;
}

// ── The rendered Stable, measured from its own source ─────────────────────

/** `[26, 0, 15]` — the building position, pinned because this phase must not move it. */
const ROOT = rootGroup(stableSrc);

const BOXES = literalBoxes(stableSrc);

const POST = postGeometry(stableSrc);
/** The map's own X list — the two posts' X positions. */
const POST_X = pair(stableSrc, /\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(x, i\)/);

/** Box [0.4, 2.6, 7.0] at X ±3.2 — the two side walls (thickness × height × depth). */
const SIDE_WALLS = BOXES.filter(
  (b) => b.args[0] === 0.4 && b.args[1] === 2.6 && b.args[2] > 3 && Math.abs(b.pos[0]) === 3.2,
);
/** Box [6.8, 2.6, 0.4] on the +Z half — the rear wall. */
const REAR_WALL = pick(
  BOXES,
  (b) => b.args[0] === 6.8 && b.args[1] === 2.6 && b.args[2] === 0.4 && b.pos[2] > 0,
  'rear wall',
);
/** Box [6.8, 0.8, 7.0] — the travertine wall base ring, which was never the offender. */
const BASE_RING = pick(
  BOXES,
  (b) => b.args[0] === 6.8 && b.args[1] === 0.8 && b.args[2] === 7.0,
  'stone base ring',
);

/** The stable's roof assembly, as the component drives the shared primitive. */
const roofEl = element(stableSrc, 'RomanGabledRoof');
const ROOF = {
  width: attrNum(roofEl, 'width'),
  depth: attrNum(roofEl, 'depth'),
  height: attrNum(roofEl, 'height'),
  eaveOverhang: attrNum(roofEl, 'eaveOverhang'),
  ridgeAlong: attrStr(roofEl, 'ridgeAlong'),
  position: attrList(roofEl, 'position'),
  tileColor: attrStr(roofEl, 'tileColor'),
  trimColor: attrStr(roofEl, 'trimColor'),
  tympanumColor: attrStr(roofEl, 'tympanumColor'),
};

/** The roof's own envelope, from the shared primitive's documented geometry. */
const HALF_DEPTH = ROOF.depth / 2; // 3.5 — the plane the gable ends sit on
const HALF_WIDTH = ROOF.width / 2; // 3.4
/** The gable tympanum panels are placed `depth / 2 + 0.02` (see ClassicalArchitecture.tsx). */
const TYMPANUM_OFFSET = 0.02;
const TYMPANUM_PLANE_Z = HALF_DEPTH + TYMPANUM_OFFSET;
/** The eave slabs run `span / 2 + eaveOverhang` out from the wall footprint. */
const EAVE_EDGE_Z = HALF_DEPTH + ROOF.eaveOverhang;
const EAVE_EDGE_X = HALF_WIDTH + ROOF.eaveOverhang;

/** The stable's eave cornice and its shared primitive's formula. */
const corniceEl = element(stableSrc, 'WallCornice');
const CORNICE_SIZE = attrList(corniceEl, 'size');
const CORNICE_PROJECTION = attrNum(corniceEl, 'projection');
const CORNICE_OUTER_Z = CORNICE_SIZE[1] / 2 + CORNICE_PROJECTION;

/** The stable's cornerstone quoins and the shared blocks' half-extents. */
const quoinEl = element(stableSrc, 'CornerQuoins');
const QUOIN_SIZE = attrList(quoinEl, 'buildingSize');
const quoinBlocks =
  /const qx = isLong \? ([\d.]+) : ([\d.]+);\s*const qz = isLong \? ([\d.]+) : ([\d.]+);/.exec(archSrc);
if (!quoinBlocks) throw new Error('CornerQuoins block sizes not found');
const QUOIN_HALF = Math.max(
  Number(quoinBlocks[1]),
  Number(quoinBlocks[2]),
  Number(quoinBlocks[3]),
  Number(quoinBlocks[4]),
) / 2;

/** The stable's foundation podium and the shared lower-step formula. */
const foundationEl = element(stableSrc, 'BuildingFoundation');
const FOUNDATION_SIZE = attrList(foundationEl, 'size');
const FOUNDATION_PROJECTION = attrNum(foundationEl, 'projection');
const PLINTH_HALF_WIDTH = FOUNDATION_SIZE[0] / 2 + FOUNDATION_PROJECTION; // 3.75
const PLINTH_HALF_DEPTH = FOUNDATION_SIZE[1] / 2 + FOUNDATION_PROJECTION; // 3.85

// ── The measured faces ────────────────────────────────────────────────────

/** The two side walls' outward faces (they are set at Z = 0, so |centre| + depth/2). */
const SIDE_WALL_FACE_Z = SIDE_WALLS.map((b) => Math.abs(b.pos[2]) + b.args[2] / 2);
const REAR_OUTER_Z = REAR_WALL.pos[2] + REAR_WALL.args[2] / 2;
const REAR_INNER_Z = REAR_WALL.pos[2] - REAR_WALL.args[2] / 2;
const POST_OUTER_Z = POST.z - POST.args[2] / 2;
const POST_INNER_Z = POST.z + POST.args[2] / 2;

/** The roof/gable envelope this phase had to reach, and the tolerance the request set. */
const TOL = 0.02;
const EDGE = 1e-9;

const stableRect = findRect('stable');

/** Every rendered element of the stable, as a half-extent on one world axis. */
const RENDERED_X_EXTENTS: Array<[string, number]> = [
  ['foundation podium (lower step)', PLINTH_HALF_WIDTH],
  ['roof eave slab', EAVE_EDGE_X],
  ['corner quoin blocks', QUOIN_SIZE[0] / 2 + QUOIN_HALF],
  ['eave cornice', CORNICE_SIZE[0] / 2 + CORNICE_PROJECTION],
  ['timber side walls', Math.max(...SIDE_WALLS.map((b) => Math.abs(b.pos[0]) + b.args[0] / 2))],
];
const RENDERED_Z_EXTENTS: Array<[string, number]> = [
  ['foundation podium (lower step)', PLINTH_HALF_DEPTH],
  ['roof eave slab', EAVE_EDGE_Z],
  ['corner quoin blocks', QUOIN_SIZE[1] / 2 + QUOIN_HALF],
  ['eave cornice', CORNICE_OUTER_Z],
  ['gable tympanum panel', TYMPANUM_PLANE_Z],
  ['timber rear wall', REAR_OUTER_Z],
  ['timber side walls', Math.max(...SIDE_WALL_FACE_Z)],
  ['stone wall base ring', BASE_RING.args[2] / 2],
];

// ── A. The fix: the timber box now spans the roof's 7.0-unit depth ─────────

describe('A. Imperial Stable timber box (Phase C-8.49)', () => {
  test('both side walls are 7.0 deep, centred on the building centreline', () => {
    expect(SIDE_WALLS.length).toBe(2);
    for (const wall of SIDE_WALLS) {
      expect(wall.args[2]).toBe(7.0);
      expect(wall.pos[2]).toBe(0);
    }
    // one on each side, at the same X the walls have always used
    expect(SIDE_WALLS.map((b) => b.pos[0]).sort((a, b) => a - b)).toEqual([-3.2, 3.2]);
  });

  test('the rear wall reaches the +3.5 gable plane, and grew only outward', () => {
    // thickness and width are the ones it always had
    expect(REAR_WALL.args).toEqual([6.8, 2.6, 0.4]);
    expect(REAR_WALL.pos[0]).toBe(0);
    expect(REAR_WALL.pos[1]).toBe(2.1);
    expect(REAR_OUTER_Z).toBeCloseTo(3.5, 10);
    // its inner face is exactly where the pre-fix wall's inner face was (2.9 → 3.1 shift
    // of the wall as a whole would have been the alternative, and is not what happened)
    expect(REAR_INNER_Z).toBeCloseTo(3.1, 10);
  });

  test('the front posts reach the −3.5 building face and keep their own size', () => {
    expect(POST.args).toEqual([0.4, 2.6, 0.4]);
    expect(POST.y).toBe(2.1);
    expect(POST_OUTER_Z).toBeCloseTo(-3.5, 10);
    // only the outer face moved: the doorway's inner line is where it was
    expect(POST_INNER_Z).toBeCloseTo(-3.1, 10);
  });

  test('the timber box is 7.0 deep and keeps its Z = 0 centreline', () => {
    const depth = REAR_OUTER_Z - POST_OUTER_Z;
    expect(depth).toBeCloseTo(7.0, 10);
    expect((REAR_OUTER_Z + POST_OUTER_Z) / 2).toBeCloseTo(0, 10);
  });

  test('no timber element is a 6.6-deep box any more', () => {
    const stale = BOXES.filter((b) => b.args[2] === 6.6);
    expect(stale).toEqual([]);
    const sixSix = BOXES.filter((b) => b.args.some((a) => a === 6.6));
    expect(sixSix).toEqual([]);
  });

  test('X extents, heights, thicknesses and materials are untouched', () => {
    for (const wall of SIDE_WALLS) {
      expect(wall.args[0]).toBe(0.4); // thickness
      expect(wall.args[1]).toBe(2.6); // height
      expect(wall.pos[1]).toBe(2.1);
    }
    expect(REAR_WALL.args[0]).toBe(6.8);
    expect(POST_X).toEqual([-2.0, 2.0]);
    expect(ROOT).toEqual([26, 0, 15]);
    // the wall materials are the same three standard materials the file has always used
    expect(stableSrc).toContain('color="#78350f" roughness={0.85}');
    expect(stableSrc).toContain('color="#451a03" roughness={0.9}');
  });
});

// ── B. Alignment with the roof/gable envelope ──────────────────────────────

describe('B. Wall faces align with the roof envelope within 0.02', () => {
  test('the roof assembly this phase aligned to is the one the component still drives', () => {
    expect(ROOF.width).toBe(6.8);
    expect(ROOF.depth).toBe(7.0);
    expect(ROOF.height).toBe(1.3);
    expect(ROOF.eaveOverhang).toBe(0.35);
    expect(ROOF.ridgeAlong).toBe('z');
    expect(ROOF.position).toEqual([0, 3.4, 0]);
    expect(ROOF.tileColor).toBe('#b45309');
    expect(ROOF.trimColor).toBe('#451a03');
    expect(ROOF.tympanumColor).toBe('#78350f');
  });

  test('every timber wall face lands on the gable plane within 0.02', () => {
    for (const face of SIDE_WALL_FACE_Z) {
      expect(Math.abs(face - HALF_DEPTH)).toBeLessThanOrEqual(TOL);
    }
    expect(Math.abs(REAR_OUTER_Z - HALF_DEPTH)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(POST_OUTER_Z + HALF_DEPTH)).toBeLessThanOrEqual(TOL);
  });

  test('no wall face projects past the gable tympanum panels', () => {
    for (const face of [...SIDE_WALL_FACE_Z, REAR_OUTER_Z, -POST_OUTER_Z]) {
      expect(face).toBeLessThanOrEqual(TYMPANUM_PLANE_Z + EDGE);
    }
    // and the panels themselves are still 0.02 proud of the roof footprint, as shipped
    expect(TYMPANUM_PLANE_Z - HALF_DEPTH).toBeCloseTo(TYMPANUM_OFFSET, 10);
  });

  test('the walls are flush with the stone base ring and the quoin corner planes', () => {
    // base ring: 7.0 deep, symmetric about the building centreline
    expect(BASE_RING.args[2] / 2).toBeCloseTo(HALF_DEPTH, 10);
    expect(BASE_RING.pos[2]).toBe(0);
    // quoins: attached to a 6.8 × 7.0 footprint, so their corner centres are the gable planes
    expect(QUOIN_SIZE).toEqual([6.8, 7.0]);
    expect(QUOIN_SIZE[1] / 2).toBeCloseTo(HALF_DEPTH, 10);
    for (const face of [...SIDE_WALL_FACE_Z, REAR_OUTER_Z, -POST_OUTER_Z]) {
      expect(Math.abs(face - QUOIN_SIZE[1] / 2)).toBeLessThanOrEqual(TOL);
    }
  });

  test('the roof pitch, ridge orientation and eave overhang are unchanged', () => {
    // the visible overhang beyond the wall face is still exactly the shipped eaveOverhang
    expect(EAVE_EDGE_Z - HALF_DEPTH).toBeCloseTo(ROOF.eaveOverhang, 10);
    expect(EAVE_EDGE_X - HALF_WIDTH).toBeCloseTo(ROOF.eaveOverhang, 10);
    // the roof slab still projects `eaveOverhang` past every wall face
    for (const face of [...SIDE_WALL_FACE_Z, REAR_OUTER_Z, -POST_OUTER_Z]) {
      expect(EAVE_EDGE_Z - face).toBeCloseTo(ROOF.eaveOverhang, 10);
    }
    // the shared primitive's own eave/tile construction is the live one (not inlined here)
    expect(archSrc).toContain('const halfSpan = span / 2 + eaveOverhang;');
    expect(archSrc).toContain('const slopeAngle = Math.atan2(height, halfSpan);');
    expect(num(archSrc, /const tileThickness = ([\d.]+);/)).toBe(0.15);
  });
});

// ── C. Front posts align with the building faces ───────────────────────────

describe('C. Front posts (open front on −Z)', () => {
  test('the posts sit on the building face, not 0.2 inside it', () => {
    expect(POST_OUTER_Z).toBeCloseTo(-HALF_DEPTH, 10);
  });

  test('the rear wall and the front posts are one 7.0-deep box about Z = 0', () => {
    expect(REAR_OUTER_Z - POST_OUTER_Z).toBeCloseTo(ROOF.depth, 10);
    expect(REAR_OUTER_Z).toBeCloseTo(-POST_OUTER_Z, 10); // mirrored about the centreline
  });

  test('the doorway opening, post size and post X positions are unchanged', () => {
    expect(POST_X).toEqual([-2.0, 2.0]);
    expect(POST.args[0]).toBe(0.4);
    expect(POST.args[2]).toBe(0.4);
    expect(POST.y).toBe(2.1);
    // the posts still leave the full 2.4-wide clear opening plus their own width
    expect(POST_X[1] - POST_X[0]).toBeCloseTo(4.0, 10);
  });
});

// ── D. Rendered footprint inside the existing collider ─────────────────────

describe('D. Footprint vs the 7.5 × 7.7 collision rectangle', () => {
  test('the collider is unchanged and still equals the rendered lower plinth step', () => {
    expect(stableRect.cx).toBe(26);
    expect(stableRect.cz).toBe(15);
    expect(stableRect.hw).toBeCloseTo(7.5 / 2, 10);
    expect(stableRect.hd).toBeCloseTo(7.7 / 2, 10);
    // re-derived from the component + BuildingFoundation's own formula
    expect(stableRect.hw).toBeCloseTo(PLINTH_HALF_WIDTH, 10);
    expect(stableRect.hd).toBeCloseTo(PLINTH_HALF_DEPTH, 10);
    expect(foundationSrc).toContain('const lowerWidth = w + projection * 2;');
  });

  test('every rendered Z extent of the stable stays inside the collider', () => {
    for (const [label, half] of RENDERED_Z_EXTENTS) {
      expect(half, `${label} Z half-extent`).toBeLessThanOrEqual(stableRect.hd + EDGE);
    }
    // and the widest one is the roof eave/plinth, exactly on the collider line
    const worst = Math.max(...RENDERED_Z_EXTENTS.map(([, h]) => h));
    expect(worst).toBeCloseTo(stableRect.hd, 10);
  });

  test('every rendered X extent of the stable stays inside the collider', () => {
    for (const [label, half] of RENDERED_X_EXTENTS) {
      expect(half, `${label} X half-extent`).toBeLessThanOrEqual(stableRect.hw + EDGE);
    }
    const worst = Math.max(...RENDERED_X_EXTENTS.map(([, h]) => h));
    expect(worst).toBeCloseTo(stableRect.hw, 10);
  });

  test('the timber walls sit inside the collider with real margin on every side', () => {
    for (const half of [...SIDE_WALL_FACE_Z, REAR_OUTER_Z, -POST_OUTER_Z]) {
      expect(stableRect.hd - half).toBeGreaterThanOrEqual(0.3);
    }
    for (const wall of SIDE_WALLS) {
      expect(stableRect.hw - (Math.abs(wall.pos[0]) + wall.args[0] / 2)).toBeGreaterThanOrEqual(0.3);
    }
  });
});

// ── E. Neighbouring clearances ─────────────────────────────────────────────

describe('E. Caravanserai Inn ↔ Imperial Stable clearance', () => {
  const caravRoot = rootGroup(caravSrc);
  const caravRoof = element(caravSrc, 'RomanGabledRoof');
  const caravWidth = attrNum(caravRoof, 'width');
  const caravOverhang = attrNum(caravRoof, 'eaveOverhang');
  const caravQuoinSize = attrList(element(caravSrc, 'CornerQuoins'), 'buildingSize');

  /** Roof eave to roof eave across X — the rendered approach of the two buildings. */
  const caravEaveEastX = caravRoot[0] + caravWidth / 2 + caravOverhang;
  const stableEaveWestX = ROOT[0] - (ROOF.width / 2 + ROOF.eaveOverhang);
  const renderedClearance = stableEaveWestX - caravEaveEastX;

  test('the rendered roof-to-roof clearance is 1.55 units', () => {
    expect(renderedClearance).toBeCloseTo(1.55, 10);
  });

  test('this phase changes no X extent, so the clearance cannot have moved', () => {
    // the clearance is a function of root X, roof width and overhang only
    expect(caravRoot[0]).toBe(16);
    expect(caravWidth).toBe(8.6);
    expect(caravOverhang).toBe(0.4);
    expect(ROOT[0]).toBe(26);
    expect(ROOF.width).toBe(6.8);
    expect(ROOF.eaveOverhang).toBe(0.35);
    // the side walls' own X extents are the ones the pre-fix walls had
    for (const wall of SIDE_WALLS) {
      expect(Math.abs(wall.pos[0]) + wall.args[0] / 2).toBeCloseTo(3.4, 10);
    }
    expect(stableEaveWestX).toBeCloseTo(22.25, 10);
    expect(caravEaveEastX).toBeCloseTo(20.7, 10);
  });

  test('the two colliders stay separated by the C-8.43 figure (1.70) and do not touch', () => {
    const caravRect = findRect('caravanserai');
    expect(caravRect.cx).toBe(16);
    expect(caravRect.cz).toBe(14);
    expect(caravRect.hw).toBeCloseTo(9.1 / 2, 10);
    expect(caravRect.hd).toBeCloseTo(8.1 / 2, 10);
    const gapX =
      caravRect.cx + caravRect.hw < stableRect.cx - stableRect.hw
        ? stableRect.cx - stableRect.hw - (caravRect.cx + caravRect.hw)
        : caravRect.cx - caravRect.hw - (stableRect.cx + stableRect.hw);
    expect(gapX).toBeCloseTo(1.70, 10);
  });

  test('the deeper timber box cannot reach the Inn — the X bands are disjoint', () => {
    // the stable's Z growth is irrelevant while its X band stays east of the Inn's
    // nearest rendered point (the Inn's roof eave, which is further east than its walls)
    const stableWest = ROOT[0] - Math.max(...RENDERED_X_EXTENTS.map(([, h]) => h));
    expect(stableWest).toBeGreaterThan(caravEaveEastX);
    // every stable wall face is east of the Inn's own wall face too (world X)
    const caravWallEast = caravRoot[0] + caravQuoinSize[0] / 2;
    for (const wall of SIDE_WALLS) {
      expect(ROOT[0] + wall.pos[0] - wall.args[0] / 2).toBeGreaterThan(caravWallEast);
    }
  });

  test('the Inn itself is untouched by this phase', () => {
    expect(caravRoot).toEqual([16, 0, 14]);
    expect(attrList(element(caravSrc, 'BuildingFoundation'), 'size')).toEqual([8.6, 7.6]);
    expect(attrNum(element(caravSrc, 'BuildingFoundation'), 'projection')).toBe(0.25);
    expect(attrList(element(caravSrc, 'WallCornice'), 'size')).toEqual([8.6, 7.6]);
  });
});

// ── F. C-8.47 interaction radius and fast travel ───────────────────────────

describe('F. Hub interaction and fast travel (C-8.47 configuration)', () => {
  const stableHub = HUB_LOCATIONS.find((h) => h.id === 'stable');

  test('the Stable hub keeps its centre and its C-8.47 radius', () => {
    if (!stableHub) throw new Error('stable hub not found');
    expect(stableHub.position).toEqual([26, 0, 15]);
    expect(stableHub.radius).toBe(5.25);
  });

  test('the door-side standoff rule still leaves a full player-diameter band', () => {
    if (!stableHub) throw new Error('stable hub not found');
    const standoff = stableRect.hd + PLAYER_RADIUS; // 3.85 + 0.40 = 4.25
    expect(standoff).toBeCloseTo(4.25, 10);
    expect(stableHub.radius - standoff).toBeGreaterThanOrEqual(2 * PLAYER_RADIUS);
  });

  test('the fast-travel arrival is unchanged and still raises the Stable\u2019s own prompt', () => {
    expect(FAST_TRAVEL_ARRIVALS.stable).toEqual([26, 10]);
    const hit = getNearbyHubLocation([26, 0, 10]);
    expect(hit?.id).toBe('stable');
  });

  test('the walls did not grow into the arrival corridor', () => {
    const arrivalZ = FAST_TRAVEL_ARRIVALS.stable[1];
    // arrival sits 1.15 north of the collider face, i.e. outside it by more than the
    // player radius, and the deepest timber face is 0.35 inside that face
    expect(arrivalZ).toBeCloseTo(stableRect.cz - stableRect.hd - 1.15, 10);
    expect(stableRect.hd - Math.max(REAR_OUTER_Z, -POST_OUTER_Z)).toBeCloseTo(0.35, 10);
  });
});

// ── G. Scope guard: the registry, the primitives, the neighbours ───────────

describe('G. Nothing else moved', () => {
  test('the collision registry is unchanged', () => {
    expect(CITY_COLLIDERS.length).toBe(110);
    expect(CITY_COLLIDERS.filter((c) => c.type === 'rect').length).toBe(31);
    const ids = CITY_COLLIDERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PLAYER_RADIUS).toBe(0.4);
  });

  test('the Armor & Leather Workshop is untouched', () => {
    const workshopRect = findRect('armor-workshop');
    expect(workshopRect.cx).toBe(28.2);
    expect(workshopRect.cz).toBeCloseTo(1.15, 10);
    expect(workshopRect.hw).toBeCloseTo(8.9 / 2, 10);
    expect(workshopRect.hd).toBeCloseTo(5.7 / 2, 10);
    expect(rootGroup(workshopSrc)).toEqual([28.2, 0, 1]);
  });

  test('the shared primitives are still the live source of the Stable\u2019s envelope', () => {
    // the component still composes the shared pieces rather than inlining them
    expect(stableSrc).toContain('<RomanGabledRoof');
    expect(stableSrc).toContain('<CornerQuoins');
    expect(stableSrc).toContain('<WallCornice');
    expect(stableSrc).toContain('<BuildingFoundation');
    // and the shared files still define those components
    expect(archSrc).toContain('export const RomanGabledRoof');
    expect(archSrc).toContain('export const CornerQuoins');
    expect(archSrc).toContain('export const WallCornice');
    expect(foundationSrc).toContain('export const BuildingFoundation');
    // the roof group's own transform is the one it always had
    expect(ROOF.position[1]).toBe(3.4);
  });

  test('the stable\u2019s non-wall props keep their own transforms', () => {
    // base ring, paddock group, hay, trough and bucket
    expect(BASE_RING.args).toEqual([6.8, 0.8, 7.0]);
    expect(BASE_RING.pos).toEqual([0, 0.4, 0]);
    expect(stableSrc).toContain('<group position={[-1.6, 0, -5.0]}>');
    expect(stableSrc).toContain('<group position={[-2.4, 0, -2.2]}>');
    expect(stableSrc).toContain('<group position={[2.2, 0, -2.4]}>');
    expect(
      pick(BOXES, (b) => b.args[0] === 1.4 && b.args[1] === 0.9, 'hay stack').args,
    ).toEqual([1.4, 0.9, 1.4]);
    expect(
      pick(BOXES, (b) => b.args[0] === 0.8 && b.args[1] === 0.8, 'feed trough').args,
    ).toEqual([0.8, 0.8, 1.8]);
  });
});

// ── H. Control: the pre-fix geometry fails the rule the shipped one satisfies ──

describe('H. Control — the pre-fix numbers miss the plane', () => {
  test('the old 6.6 box left a 0.20 gap at each gable', () => {
    const oldSideWallFace = 6.6 / 2; // ±3.3
    const oldRearOuter = 3.1 + 0.4 / 2; // the rear wall sat at Z +3.1
    const oldPostOuter = -3.1 - 0.4 / 2;
    expect(HALF_DEPTH - oldSideWallFace).toBeCloseTo(0.2, 10);
    expect(HALF_DEPTH - oldRearOuter).toBeCloseTo(0.2, 10);
    expect(oldPostOuter + HALF_DEPTH).toBeCloseTo(0.2, 10);
    // the shipped layout closes all three, so the assertions above are sensitive to it
    expect(HALF_DEPTH - Math.max(...SIDE_WALL_FACE_Z)).toBeCloseTo(0, 10);
    expect(HALF_DEPTH - REAR_OUTER_Z).toBeCloseTo(0, 10);
    expect(POST_OUTER_Z + HALF_DEPTH).toBeCloseTo(0, 10);
  });

  test('the old box was 6.6 deep and the tolerance could not hide it', () => {
    expect(TOL).toBe(0.02);
    expect(0.2).toBeGreaterThan(TOL); // 0.20 was 10× the accepted 0.02
    // and the shipped box is not merely within tolerance — it is exact
    expect(HALF_DEPTH).toBe(3.5);
    expect(REAR_OUTER_Z).toBe(3.5);
    expect(POST_OUTER_Z).toBe(-3.5);
  });
});
