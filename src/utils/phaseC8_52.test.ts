/**
 * Phase C-8.52 — Training Hall veranda: the canopy's foundation datum and its seat.
 *
 * ── THE DEFECT (measured, not assumed) ────────────────────────────────────
 * The veranda canopy was the only element in `TrainingHall`'s group measured
 * WITHOUT the foundation's 0.30 top step — the walls, the eave cornice, the
 * quoins, all four posts, the front tie-beam and every prop under the veranda
 * are all placed `0.3 + …`, the canopy alone sat at `CANOPY_Y - 0.15`
 * (component-local Y 2.85).  The 0.30 therefore hung the slab below the
 * structure it shades, and — because the slab is pitched 0.12 rad about X —
 * it sat skewed within the veranda:
 *
 *   • the underside crossed the four posts by 0.66513 at the building face
 *     (local Z 1.1) and 0.31545 at the courtyard (local Z 4.0), i.e. both
 *     post tops stood through the canvas;
 *   • the slab's top face floated 0.13487 clear of the front tie-beam's
 *     underside (3.2) — it touched nothing at all along the beam it belongs to.
 *
 * ── THE FIX ───────────────────────────────────────────────────────────────
 *   1. the slab carries the datum: `CANOPY_POS_Y = 0.3 + CANOPY_Y - 0.15`
 *      (2.85 → 3.15), the author's own drop measured from the top of the
 *      foundation like everything else in the file.  That seats its underside
 *      on the front tie-beam's top face (0.01545 inside the slab, inside the
 *      0.02 seating tolerance) and leaves the building-face pair 0.36513
 *      through the canvas;
 *   2. those two building-face posts are trimmed to the underside they carry
 *      (`FACE_POST_H`, 3.0 → 2.63487), which is the same relationship the
 *      courtyard pair now has with the slab above it.  Pitch, slab, materials,
 *      wall attachment, the tie-beam and the courtyard pair are untouched.
 *
 * ── HOW THIS SUITE MEASURES IT ────────────────────────────────────────────
 * Nothing here is a copied constant: the component's own `const` declarations
 * are read and evaluated (its `canopyUndersideAt` helper included), the canopy
 * slab's underside and top faces are built by transforming the box's own
 * corners through the mesh's own rotation, the posts are read from the post
 * map's tuples, the tie-beam from its own mesh, and the world placement from
 * the hall's group and the yard's root group.  The seat is then measured at
 * every support axis, in world space, against a stated 0.02 tolerance.
 *
 * SCOPE: this pins geometry, not appearance.  The rendered junction on Android
 * is a device question this suite cannot answer.
 *
 * Run with: bun test src/utils/phaseC8_52.test.ts
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
  BOUNDARY_X,
  HUB_LOCATIONS,
  FAST_TRAVEL_ARRIVALS,
  getNearbyHubLocation,
} from './cityCollisions';

// ── Sources ───────────────────────────────────────────────────────────────

const load = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const hallSrc = load('../components/3d/city/TrainingHall.tsx');
const yardSrc = load('../components/3d/city/TrainingYard.tsx');
const storeSrc = load('../components/3d/city/GeneralStore.tsx');
const stableSrc = load('../components/3d/city/Stable.tsx');
const collisionSrc = load('./collisionShapes.ts');

type Vec3 = [number, number, number];

// ── Reading the component's own numbers (its declarations, evaluated) ─────

/** Every `const` this suite has resolved so far, by the component's own names. */
const SCOPE: Record<string, number> = {};

/** The raw right-hand side of one `const NAME = …;` declaration. */
function rawConst(name: string): string {
  const m = new RegExp(`const ${name} = ([^;]+);`).exec(hallSrc);
  if (!m) throw new Error(`const ${name} not found in TrainingHall.tsx`);
  return m[1].trim();
}

/** Evaluate an expression against the resolved constants. */
function evalInScope(expr: string): number {
  const value = Function(
    'Math',
    ...Object.keys(SCOPE),
    `return (${expr});`,
  )(Math, ...Object.values(SCOPE));
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`could not evaluate: ${expr}`);
  }
  return value;
}

/** The component's own `canopyUndersideAt(z)` helper, evaluated on its own body. */
function componentUndersideAt(z: number): number {
  const body = /const canopyUndersideAt = \(z: number\) =>\s*([^;]+);/.exec(hallSrc)?.[1];
  if (!body) throw new Error('the canopyUndersideAt helper was not found');
  const value = Number(
    Function('z', 'Math', ...Object.keys(SCOPE), `return (${body});`)(
      z,
      Math,
      ...Object.values(SCOPE),
    ),
  );
  if (!Number.isFinite(value)) throw new Error('canopyUndersideAt did not evaluate');
  return value;
}

/**
 * Resolve a `const` declaration of the component, with its own helper call
 * substituted by that helper's evaluated value — so a declaration such as
 * `const FACE_POST_H = canopyUndersideAt(HALL_D / 2) - 0.3;` yields the height
 * the component actually renders, from the component's own formula.
 */
function def(name: string): number {
  if (name in SCOPE) return SCOPE[name];
  const expr = rawConst(name).replace(
    /canopyUndersideAt\(([^()]*)\)/g,
    (_, arg: string) => String(componentUndersideAt(evalInScope(arg))),
  );
  SCOPE[name] = evalInScope(expr);
  return SCOPE[name];
}

/** `attr={[a, b, c]}` / `attr={[a, b]}` on a JSX element → the evaluated numbers. */
function attrVals(block: string, attr: string): number[] {
  const m = new RegExp(`\\b${attr}=\\{\\[([^\\]]*)\\]\\}`).exec(block);
  if (!m) throw new Error(`attribute ${attr} not found`);
  return m[1].split(',').map((s) => evalInScope(s.trim()));
}

/** The slice of the source from `marker` up to the end of its own `<mesh>`. */
function meshBlock(marker: string): string {
  const at = hallSrc.indexOf(marker);
  if (at < 0) throw new Error(`marker ${marker} not found`);
  const end = hallSrc.indexOf('</mesh>', at);
  if (end < 0) throw new Error(`mesh at ${marker} was not closed`);
  return hallSrc.slice(at, end);
}

// ── The rendered veranda, measured from those declarations ────────────────

const HALL_W = def('HALL_W');
const HALL_D = def('HALL_D');
const WALL_H = def('WALL_H');
const VERANDA_HALF_W = def('VERANDA_HALF_W');
const VERANDA_SOUTH_Z = def('VERANDA_SOUTH_Z');
const CANOPY_Y = def('CANOPY_Y');           // = WALL_H: the courtyard posts' height
const POST_R = def('POST_R');
const CANOPY_PITCH = def('CANOPY_PITCH');
const CANOPY_T = def('CANOPY_T');
const CANOPY_Z = def('CANOPY_Z');
const CANOPY_POS_Y = def('CANOPY_POS_Y');
const CANOPY_HALF_T = def('CANOPY_HALF_T');
const FACE_POST_H = def('FACE_POST_H');

/** The foundation's own height and step, as the hall passes them to `BuildingFoundation`. */
const FOUNDATION_H = Number(
  /<BuildingFoundation[\s\S]*?height=\{([\d.]+)\}/.exec(hallSrc)?.[1],
);
const HALL_PROJECTION = Number(
  /<BuildingFoundation[\s\S]*?projection=\{([\d.]+)\}/.exec(hallSrc)?.[1],
);
/** The wall's own height band (the hall's body sits on the foundation top). */
const WALL_BASE_Y = FOUNDATION_H;
const WALL_TOP_Y = FOUNDATION_H + WALL_H;

/** The canopy slab element: its transform and its box. */
const CANOPY_BLOCK = meshBlock('4a. Veranda canopy');
const CANOPY_POS_SRC = attrVals(CANOPY_BLOCK, 'position') as Vec3;
const CANOPY_ROT_SRC = attrVals(CANOPY_BLOCK, 'rotation') as Vec3;
const CANOPY_BOX = attrVals(CANOPY_BLOCK, 'boxGeometry args');
const CANOPY_W = CANOPY_BOX[0];
const CANOPY_DEPTH = CANOPY_BOX[2];
/** The slab's Z span in component-local coordinates. */
const CANOPY_Z_SPAN: [number, number] = [
  CANOPY_Z - CANOPY_DEPTH / 2,
  CANOPY_Z + CANOPY_DEPTH / 2,
];

/** The four posts, read from the post map's own tuples (px, pz, height). */
const POSTS_BLOCK = hallSrc.slice(
  hallSrc.indexOf('4b. Veranda timber posts'),
  hallSrc.indexOf('].map(([px, pz, postH]'),
);
const POSTS = POSTS_BLOCK
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => /^\[-?[A-Z0-9]/.test(line))
  .map((line) => {
    const parts = line.replace(/^\[/, '').replace(/\],?$/, '').split(',');
    return parts.map((p) => evalInScope(p.trim())) as Vec3;
  });

/** The post mesh's own placement expression, which states the datum the posts rise from. */
const POST_MESH_SRC = /position=\{\[px, ([^,]+), pz\]\}>/.exec(hallSrc)?.[1].trim();

const FACE_ROW_Z = HALL_D / 2;          // posts against the hall's face
const YARD_ROW_Z = VERANDA_SOUTH_Z;     // posts at the courtyard edge
const FACE_POSTS = POSTS.filter((p) => Math.abs(p[1] - FACE_ROW_Z) < 1e-9);
const YARD_POSTS = POSTS.filter((p) => Math.abs(p[1] - YARD_ROW_Z) < 1e-9);

/** The front tie-beam, from its own mesh. */
const BEAM_BLOCK = meshBlock('4c.');
const BEAM_POS = attrVals(BEAM_BLOCK, 'position') as Vec3;
const BEAM_BOX = attrVals(BEAM_BLOCK, 'boxGeometry args');
const BEAM_BAND: [number, number] = [
  BEAM_POS[1] - BEAM_BOX[1] / 2,
  BEAM_POS[1] + BEAM_BOX[1] / 2,
];
const BEAM_Z_SPAN: [number, number] = [
  BEAM_POS[2] - BEAM_BOX[2] / 2,
  BEAM_POS[2] + BEAM_BOX[2] / 2,
];

/** The eave cornice above the veranda, from the primitive's own props. */
const CORNICE_BLOCK = /<WallCornice[^>]*\/>/.exec(hallSrc)?.[0] ?? '';
const CORNICE = {
  y: evalInScope(/y=\{([^}]+)\}/.exec(CORNICE_BLOCK)?.[1] ?? ''),
  height: Number(/height=\{([\d.]+)\}/.exec(CORNICE_BLOCK)?.[1]),
  projection: Number(/projection=\{([\d.]+)\}/.exec(CORNICE_BLOCK)?.[1]),
};

/** The doorway's own head height (the opening the veranda shades). */
const DOORWAY = {
  y: evalInScope(/<ClassicalDoorway[\s\S]*?position=\{\[(?:[^,]+), ([^,]+),/.exec(hallSrc)?.[1] ?? ''),
  height: Number(/<ClassicalDoorway[\s\S]*?height=\{([\d.]+)\}/.exec(hallSrc)?.[1]),
};

/** The banner hung on the gable above the veranda, and its fabric box. */
const BANNER_GROUP_Y = evalInScope(
  /<group ref=\{bannerRef\} position=\{\[0, ([^,]+), ([^\]]+)\]\}>/.exec(hallSrc)?.[1] ?? '',
);
const BANNER_FABRIC_H = Number(
  /<group ref=\{bannerRef\}[\s\S]*?<boxGeometry args=\{\[[\d.]+, ([\d.]+),/.exec(hallSrc)?.[1],
);
const BANNER_BOTTOM = BANNER_GROUP_Y - BANNER_FABRIC_H / 2;

/** World root: the yard group the hall is mounted in, plus the hall's own group. */
const YARD_ROOT = /<group position=\{\[(-?[\d.]+),\s*0,\s*(-?[\d.]+)\]\}>/.exec(yardSrc);
const HALL_GROUP = /<group position=\{\[(-?[\d.]+),\s*0,\s*(-?[\d.]+)\]\} rotation=\{\[0,\s*Math\.PI \/ 2,\s*0\]\}>/.exec(
  hallSrc,
);
const WORLD_ROOT = [
  Number(YARD_ROOT?.[1]) + Number(HALL_GROUP?.[1]),
  0,
  Number(YARD_ROOT?.[2]) + Number(HALL_GROUP?.[2]),
] as Vec3;

// ── The transform: the pitched slab's own faces ───────────────────────────

const TOL = 0.02;
const EDGE = 1e-9;

/**
 * A point of the slab's box, in component-local (y, z): rotate it about the
 * mesh's own X rotation and add the mesh's own position — three.js order.
 */
function localPoint(posY: number, dy: number, dz: number): [number, number] {
  const c = Math.cos(CANOPY_PITCH);
  const s = Math.sin(CANOPY_PITCH);
  return [posY + dy * c - dz * s, CANOPY_Z + dy * s + dz * c];
}

/** One face of the pitched slab as a height-at-Z line, through its own corners. */
function faceLine(posY: number, dy: number): (z: number) => number {
  const back = localPoint(posY, dy, -CANOPY_DEPTH / 2);
  const front = localPoint(posY, dy, +CANOPY_DEPTH / 2);
  const slope = (front[0] - back[0]) / (front[1] - back[1]);
  return (z: number) => back[0] + (z - back[1]) * slope;
}

const SHIPPED_UNDER = faceLine(CANOPY_POS_Y, -CANOPY_T / 2);
const SHIPPED_TOP = faceLine(CANOPY_POS_Y, +CANOPY_T / 2);
/** The pre-fix slab (component-local Y 2.85), for the control section. */
const PRE_FIX_POS_Y = CANOPY_Y - 0.15;
const PRE_FIX_UNDER = faceLine(PRE_FIX_POS_Y, -CANOPY_T / 2);
const PRE_FIX_TOP = faceLine(PRE_FIX_POS_Y, +CANOPY_T / 2);

/** The closed-form slope of those faces: the pitch's own tangent. */
const FACE_SLOPE = (SHIPPED_TOP(3) - SHIPPED_TOP(2)) / 1;

/** Every post, with the height it is rendered at and the top it reaches. */
const POST_TOP_Y = (h: number) => WALL_BASE_Y + h;
const seatOf = (under: (z: number) => number, pz: number, h: number) =>
  under(pz) - POST_TOP_Y(h);

const rectById = (id: string): RectCollider => {
  const c = CITY_COLLIDERS.find((c) => c.id === id);
  if (!c || c.type !== 'rect') throw new Error(`rect collider '${id}' not found`);
  return c;
};
const hallRect = rectById('training-hall');
const yardHub = HUB_LOCATIONS.find((h) => h.id === 'training_yard');

// ── A. The veranda the fix had to work in ─────────────────────────────────

describe('A. The rendered veranda (Phase C-8.52)', () => {
  test('the hall stands in the western yard, its veranda facing world +X', () => {
    expect(WORLD_ROOT).toEqual([-30.35, 0, 3]);
    expect(HALL_GROUP?.[3] ?? 'Math.PI / 2').toBe('Math.PI / 2');
    // the +π/2 yaw maps local +Z onto world +X, so the veranda runs east into the yard
    expect(VERANDA_SOUTH_Z).toBeGreaterThan(HALL_D / 2);
  });

  test('the component dimensions are the ones the audit measured', () => {
    expect([HALL_W, HALL_D, WALL_H]).toEqual([7, 2.2, 3]);
    expect(FOUNDATION_H).toBe(0.3);
    expect([VERANDA_HALF_W, VERANDA_SOUTH_Z, POST_R]).toEqual([1.5, 4, 0.09]);
    expect(CANOPY_Y).toBe(WALL_H);
  });

  test('the canopy is a 3.3-wide slab, pitched 0.12 rad about X, centred at Z 2.55', () => {
    expect(CANOPY_BOX).toEqual([3.3, 0.08, 3.05]);
    expect(CANOPY_PITCH).toBe(-0.12);
    expect(CANOPY_Z).toBeCloseTo(HALL_D / 2 + (VERANDA_SOUTH_Z - HALL_D / 2) / 2, 12);
    expect(CANOPY_Z).toBeCloseTo(2.55, 12);
    expect(CANOPY_POS_SRC[0]).toBe(0);
    expect(CANOPY_ROT_SRC).toEqual([CANOPY_PITCH, 0, 0]);
    // it spans from just inside the wall face to just past the courtyard posts
    expect(CANOPY_Z_SPAN[0]).toBeCloseTo(1.025, 12);
    expect(CANOPY_Z_SPAN[1]).toBeCloseTo(4.075, 12);
    expect(FACE_ROW_Z - CANOPY_Z_SPAN[0]).toBeCloseTo(0.075, 12);
    expect(CANOPY_Z_SPAN[1] - YARD_ROW_Z).toBeCloseTo(0.075, 12);
  });

  test('four posts stand on the foundation top, two rows of two', () => {
    expect(POSTS.length).toBe(4);
    expect(FACE_POSTS.length).toBe(2);
    expect(YARD_POSTS.length).toBe(2);
    expect(FACE_POSTS.map((p) => p[0]).sort()).toEqual([-VERANDA_HALF_W, VERANDA_HALF_W]);
    expect(YARD_POSTS.map((p) => p[0]).sort()).toEqual([-VERANDA_HALF_W, VERANDA_HALF_W]);
    // each is a hex cylinder of POST_R standing from the foundation's top step
    expect(POST_MESH_SRC).toBe(`${FOUNDATION_H} + postH / 2`);
    expect(hallSrc).toContain('<cylinderGeometry args={[POST_R, POST_R, postH, 6]} />');
    expect(hallSrc).toContain(`color: '#451a03'`); // the shared timber material
    for (const [, , h] of POSTS) expect(h).toBeGreaterThan(2.5);
  });

  test('the front tie-beam cap sits flush with the courtyard posts’ tops', () => {
    expect(BEAM_POS).toEqual([0, 3.25, VERANDA_SOUTH_Z]);
    expect(BEAM_BOX).toEqual([3.2, 0.1, 0.08]);
    expect(BEAM_BAND).toEqual([3.2, 3.3]);
    for (const [, , h] of YARD_POSTS) expect(POST_TOP_Y(h)).toBeCloseTo(BEAM_BAND[1], 12);
  });

  test('the reference surfaces above the veranda are the ones it must clear', () => {
    expect(CORNICE.y).toBe(WALL_TOP_Y);
    expect(CORNICE.height).toBe(0.16);
    expect(CORNICE.projection).toBe(0.12);
    // the cornice strip hangs over the wall face: band Y 3.22 … 3.38, Z 1.1 … 1.22
    expect(CORNICE.y - CORNICE.height / 2).toBeCloseTo(3.22, 12);
    expect(DOORWAY.y).toBe(FOUNDATION_H);
    expect(DOORWAY.height).toBe(2.2);
  });
});

// ── B. The restored foundation datum (the fix) ────────────────────────────

describe('B. The canopy carries the foundation’s 0.30 datum', () => {
  test('the slab is placed from the datum, at the author’s own drop below the wall top', () => {
    // the pre-fix expression, and the 0.30 the fix restored
    expect(CANOPY_POS_Y).toBeCloseTo(FOUNDATION_H + CANOPY_Y - 0.15, 12);
    expect(CANOPY_POS_Y).toBeCloseTo(3.15, 12);
    expect(CANOPY_POS_Y - PRE_FIX_POS_Y).toBeCloseTo(FOUNDATION_H, 12);
    // the drop the author wrote is unchanged: still 0.15 below the wall-top line
    expect(WALL_TOP_Y - CANOPY_POS_Y).toBeCloseTo(0.15, 12);
    expect(CANOPY_POS_SRC[1]).toBe(CANOPY_POS_Y);
    expect(CANOPY_POS_SRC[2]).toBe(CANOPY_Z);
  });

  test('every other veranda element is measured from the same datum', () => {
    // the canopy is no longer the odd one out: the posts, the beam, the wall,
    // the cornice and the roof all still carry the `0.3 + …` offset
    expect(hallSrc).toContain(`position={[px, ${FOUNDATION_H} + postH / 2, pz]}`);
    expect(hallSrc).toContain(`position={[0, ${FOUNDATION_H} + CANOPY_Y - 0.05, VERANDA_SOUTH_Z]}`);
    expect(hallSrc).toContain(`position={[0, ${FOUNDATION_H} + WALL_H / 2, 0]}`);
    expect(hallSrc).toContain(`y={${FOUNDATION_H} + WALL_H}`);
    expect(hallSrc).toContain(`position={[0, ${FOUNDATION_H} + WALL_H + 0.16, 0]}`);
  });

  test('pitch, slab, materials and horizontal placement are untouched', () => {
    expect(CANOPY_PITCH).toBe(-0.12);
    expect(CANOPY_T).toBe(0.08);
    expect(CANOPY_HALF_T).toBeCloseTo(CANOPY_T / 2 / Math.cos(CANOPY_PITCH), 12);
    expect(CANOPY_BOX).toEqual([3.3, 0.08, 3.05]);
    expect(CANOPY_Z).toBeCloseTo(2.55, 12);
    expect(hallSrc).toContain('const canopyMat = new THREE.MeshStandardMaterial({');
    expect(hallSrc).toContain('color: ROMAN_PALETTE.terracottaTile.color');
    expect(hallSrc).toContain('bumpScale: 0.015');
    expect(hallSrc).toContain('const CANOPY_PITCH = -0.12;');
    expect(hallSrc).toContain('const CANOPY_T = 0.08;');
  });

  test('the component’s own underside helper agrees with the slab’s real faces', () => {
    // two independent derivations of the same surface: the helper's own body
    // (evaluated on the component's constants) and the box corners rotated
    for (const z of [CANOPY_Z_SPAN[0], FACE_ROW_Z, CANOPY_Z, YARD_ROW_Z, CANOPY_Z_SPAN[1]]) {
      expect(componentUndersideAt(z)).toBeCloseTo(SHIPPED_UNDER(z), 12);
    }
  });
});

// ── C. The seat at every support axis ─────────────────────────────────────

describe('C. Every post meets the canopy within 0.02, with no gap', () => {
  test('the underside is a real slope, rising toward the courtyard by tan|pitch|', () => {
    expect(FACE_SLOPE).toBeCloseTo(Math.tan(-CANOPY_PITCH), 12);
    expect(FACE_SLOPE).toBeCloseTo(0.12058, 5);
    expect(FACE_SLOPE).toBeGreaterThan(0);
    // and the top face is parallel to it, one slab thickness above
    expect(SHIPPED_TOP(YARD_ROW_Z) - SHIPPED_UNDER(YARD_ROW_Z)).toBeCloseTo(
      CANOPY_T / Math.cos(CANOPY_PITCH),
      12,
    );
  });

  test('each of the four posts is seated on the underside within 0.02', () => {
    for (const [, pz, h] of POSTS) {
      const offset = seatOf(SHIPPED_UNDER, pz, h);
      expect(Math.abs(offset)).toBeLessThanOrEqual(TOL);
    }
  });

  test('no post stands clear of the canopy — the slab always reaches the top', () => {
    for (const [, pz, h] of POSTS) {
      expect(seatOf(SHIPPED_UNDER, pz, h)).toBeLessThanOrEqual(EDGE);
    }
  });

  test('the building-face pair is trimmed to the underside it now carries', () => {
    const expected = SHIPPED_UNDER(FACE_ROW_Z) - WALL_BASE_Y;
    for (const [, pz, h] of FACE_POSTS) {
      expect(h).toBeCloseTo(expected, 12);
      expect(pz).toBe(FACE_ROW_Z);
      expect(POST_TOP_Y(h)).toBeCloseTo(SHIPPED_UNDER(FACE_ROW_Z), 12);
      expect(seatOf(SHIPPED_UNDER, pz, h)).toBeCloseTo(0, 12);
    }
    // the trim is the pitch's own drop plus the courtyard seat's 0.01545
    const drop = (YARD_ROW_Z - FACE_ROW_Z) * FACE_SLOPE;
    expect(drop).toBeCloseTo(0.34968, 5);
    expect(CANOPY_Y - FACE_POST_H).toBeCloseTo(drop + (POST_TOP_Y(CANOPY_Y) - SHIPPED_UNDER(YARD_ROW_Z)), 9);
  });

  test('the courtyard pair keeps its full height and seats 0.01545 into the slab', () => {
    for (const [, , h] of YARD_POSTS) {
      expect(h).toBe(CANOPY_Y);
      expect(POST_TOP_Y(h)).toBeCloseTo(WALL_TOP_Y, 12);
    }
    const offset = seatOf(SHIPPED_UNDER, YARD_ROW_Z, CANOPY_Y);
    expect(offset).toBeCloseTo(-0.01545, 5);
    expect(Math.abs(offset)).toBeLessThanOrEqual(TOL);
    // the post top stays inside the slab, so no stub pokes out of the canopy
    expect(POST_TOP_Y(CANOPY_Y)).toBeLessThan(SHIPPED_TOP(YARD_ROW_Z));
  });

  test('a flat post top cannot follow the pitch — the spread is the pitch’s own run', () => {
    // the best a 0.18-wide flat top can do under a 0.12-rad pitch: ±0.01085 about
    // the axis its seat is measured at, i.e. 0.0217 of unavoidable range end to end
    const spread = POST_R * FACE_SLOPE;
    expect(spread).toBeCloseTo(0.01085, 5);
    expect(spread).toBeLessThanOrEqual(TOL);
    expect(2 * spread).toBeCloseTo(0.0217, 4);
    for (const [, pz, h] of POSTS) {
      // measured across each post's own top face, the axis-centred seat is the best it can do
      const west = SHIPPED_UNDER(pz - POST_R) - POST_TOP_Y(h);
      const east = SHIPPED_UNDER(pz + POST_R) - POST_TOP_Y(h);
      expect(east - west).toBeCloseTo(2 * spread, 12);
      // equal and opposite about the post's own axis, which is its top face's centre
      expect(west + east).toBeCloseTo(2 * seatOf(SHIPPED_UNDER, pz, h), 12);
    }
  });

  test('the four posts are the only supports, and all four are under the slab', () => {
    for (const [, pz] of POSTS) {
      expect(pz).toBeGreaterThan(CANOPY_Z_SPAN[0]);
      expect(pz).toBeLessThan(CANOPY_Z_SPAN[1]);
    }
    for (const [px] of POSTS) {
      expect(Math.abs(px)).toBeLessThanOrEqual((CANOPY_W - 0.3) / 2 + EDGE);
    }
  });
});

// ── D. The front tie-beam ─────────────────────────────────────────────────

describe('D. The canopy rests on the front tie-beam instead of floating below it', () => {
  test('the beam itself is untouched', () => {
    expect(BEAM_POS).toEqual([0, 3.25, 4]);
    expect(BEAM_BOX).toEqual([3.2, 0.1, 0.08]);
    expect(BEAM_BAND).toEqual([3.2, 3.3]);
    expect(BEAM_Z_SPAN).toEqual([3.96, 4.04]);
    expect(hallSrc).toContain('0.3 + CANOPY_Y - 0.05');
  });

  test('the beam’s top face is carried inside the slab, all along its own footprint', () => {
    for (const z of [BEAM_Z_SPAN[0], BEAM_POS[2], BEAM_Z_SPAN[1]]) {
      expect(BEAM_BAND[1]).toBeGreaterThan(SHIPPED_UNDER(z));   // no gap above the underside
      expect(BEAM_BAND[1]).toBeLessThan(SHIPPED_TOP(z));        // and no stub through the top face
    }
    // the deepest the beam reaches into the slab is its top face at its rear end:
    // the courtyard seat plus the pitch's own run over the beam's half-depth
    const seat = POST_TOP_Y(CANOPY_Y) - SHIPPED_UNDER(YARD_ROW_Z);
    const deepest = seat + (YARD_ROW_Z - BEAM_Z_SPAN[0]) * FACE_SLOPE;
    expect(BEAM_BAND[1] - SHIPPED_UNDER(BEAM_Z_SPAN[0])).toBeCloseTo(deepest, 12);
    expect(deepest).toBeCloseTo(0.02027, 5);
    expect(deepest).toBeLessThan(3 * TOL);
  });

  test('the slab’s own front edge still overhangs the beam', () => {
    expect(CANOPY_Z_SPAN[1]).toBeGreaterThan(BEAM_Z_SPAN[1]);
    expect(CANOPY_Z_SPAN[1] - BEAM_Z_SPAN[1]).toBeCloseTo(0.035, 12);
  });
});

// ── E. What the seat preserved, and what it must not touch ────────────────

describe('E. No new interpenetration, and the veranda is unchanged around the slab', () => {
  test('the wall attachment is the same — the slab is still embedded 0.075 in the face', () => {
    expect(FACE_ROW_Z - CANOPY_Z_SPAN[0]).toBeCloseTo(0.075, 12);
    expect(CANOPY_Z_SPAN[0]).toBeLessThan(FACE_ROW_Z);
    // and the wall is what it was
    expect(hallSrc).toContain('<boxGeometry args={[HALL_W, WALL_H, HALL_D]} />');
    expect(hallSrc).toContain('color: \'#ebdcb9\'');
  });

  test('the raised slab still clears the eave cornice above it', () => {
    const corniceUnderside = CORNICE.y - CORNICE.height / 2;
    for (const z of [FACE_ROW_Z, FACE_ROW_Z + CORNICE.projection]) {
      expect(corniceUnderside - SHIPPED_TOP(z)).toBeGreaterThan(0.15);
    }
    expect(corniceUnderside - SHIPPED_TOP(FACE_ROW_Z + CORNICE.projection)).toBeCloseTo(0.19, 2);
  });

  test('the slab still clears the doorway it shades and the banner above it', () => {
    const doorHead = DOORWAY.y + DOORWAY.height;
    expect(SHIPPED_UNDER(FACE_ROW_Z) - doorHead).toBeGreaterThan(0.4);
    expect(SHIPPED_UNDER(FACE_ROW_Z) - doorHead).toBeCloseTo(0.435, 3);
    // the crimson banner hangs on the gable, above the canvas
    expect(BANNER_BOTTOM - SHIPPED_TOP(FACE_ROW_Z)).toBeGreaterThan(0.2);
  });

  test('the equipment under the veranda stays well below the canvas', () => {
    // the bench's seat slab tops out at 0.45 + 0.12/2, the leaning shields at ≈0.53
    const benchTop = 0.45 + 0.12 / 2;
    const lowestCorner = Math.min(SHIPPED_UNDER(CANOPY_Z_SPAN[0]), SHIPPED_UNDER(CANOPY_Z_SPAN[1]));
    expect(lowestCorner - benchTop).toBeGreaterThan(2.0);
    expect(lowestCorner).toBeCloseTo(2.9258, 4);
  });

  test('the veranda is walk-under-able and stands on the yard side of the hall', () => {
    const lowest = Math.min(SHIPPED_UNDER(CANOPY_Z_SPAN[0]), SHIPPED_UNDER(CANOPY_Z_SPAN[1]));
    expect(lowest).toBeGreaterThan(2.5); // comfortably above a gladiator's head
    // world X of the two post rows and of the slab's own span
    const worldX = (localZ: number) => WORLD_ROOT[0] + localZ;
    expect(worldX(FACE_ROW_Z)).toBeCloseTo(-29.25, 12);
    expect(worldX(YARD_ROW_Z)).toBeCloseTo(-26.35, 12);
    expect(worldX(CANOPY_Z_SPAN[0])).toBeCloseTo(-29.325, 12);
    expect(worldX(CANOPY_Z_SPAN[1])).toBeCloseTo(-26.275, 12);
    // world Z of the two posts in each row (both parent groups carry no yaw of
    // their own, so the hall's π/2 maps local X onto world −Z)
    const worldZ = (localX: number) => WORLD_ROOT[2] - localX;
    expect(POSTS.map(([px]) => worldZ(px)).sort()).toEqual([1.5, 1.5, 4.5, 4.5]);
    // and both parents sit on the ground plane, so world Y is local Y
    expect(WORLD_ROOT[1]).toBe(0);
  });
});

// ── F. Scope guard — nothing else moved ───────────────────────────────────

describe('F. Nothing else moved', () => {
  test('the collision registry is exactly the one C-8.45 left, plus C-8.64A\'s segments', () => {
    // 110 was the C-8.45 count; Phase C-8.64A appended its 31 `circus-*`
    // perimeter segments, and Phase C-8.64B the `forecourt-parapet` rectangle.
    expect(CITY_COLLIDERS.length).toBe(142);
    expect(CITY_COLLIDERS.filter((c) => c.type === 'rect').length).toBe(32);
    const ids = CITY_COLLIDERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PLAYER_RADIUS).toBe(0.4);
    expect(BOUNDARY_X).toBe(35);
    // the hall's own rectangle, untouched: the veranda is not collidable, as no
    // building's props are.  BuildingFoundation's lower step is `size + projection`,
    // and the hall's π/2 yaw swaps the axes onto the world ones.
    expect(hallRect.cx).toBe(WORLD_ROOT[0]);
    expect(hallRect.cz).toBe(WORLD_ROOT[2]);
    expect(hallRect.hw).toBeCloseTo((HALL_D + 2 * HALL_PROJECTION) / 2, 12);
    expect(hallRect.hd).toBeCloseTo((HALL_W + 2 * HALL_PROJECTION) / 2, 12);
    expect([hallRect.hw, hallRect.hd]).toEqual([1.35, 3.75]);
  });

  test('the veranda adds no collision and imports nothing from the collision system', () => {
    expect(CITY_COLLIDERS.some((c) => /veranda|canopy|post|beam/i.test(c.id))).toBe(false);
    expect(CITY_COLLIDERS.filter((c) => /training/i.test(c.id)).map((c) => c.id)).toEqual([
      'training-hall',
    ]);
    expect(hallSrc).not.toContain('collisionShapes');
    expect(hallSrc).not.toContain('cityCollisions');
    expect(collisionSrc).not.toContain('FACE_POST_H');
    expect(collisionSrc).not.toContain('CANOPY_POS_Y');
  });

  test('the training-yard hub, its arrival and its radius are untouched', () => {
    expect(yardHub?.position).toEqual([-18, 0, 0]);
    expect(yardHub?.radius).toBe(4.5);
    expect(FAST_TRAVEL_ARRIVALS.training_yard).toEqual([-18, 2]);
    expect(getNearbyHubLocation([-18, 0, 2])?.id).toBe('training_yard');
  });

  test('the rest of the hall is the building it was', () => {
    expect(hallSrc).toContain('<CornerQuoins height={WALL_H + 0.3}');
    expect(hallSrc).toContain('ridgeAlong="x"');
    expect(hallSrc).toContain('height={1.4}');
    expect(hallSrc).toContain('eaveOverhang={0.25}');
    expect(hallSrc).toContain('<RomanGabledRoof');
    expect(hallSrc).toContain('<ClassicalWindow');
    expect(hallSrc).toContain('bannerRef.current.rotation.z = Math.sin(t * 1.2) * 0.03;');
    expect(hallSrc).toContain('<group position={[0, 0, HALL_D / 2 + 1.2]}>'); // the bench
    expect(hallSrc).toContain('<group position={[-1.2, 0, HALL_D / 2 + 0.4]}>'); // the shields
    expect(FACE_POSTS.length + YARD_POSTS.length).toBe(4);
  });

  test('the phases before this one are still in place', () => {
    // C-8.51 — the bazaar awning seated on its posts
    expect(storeSrc).toContain('<group position={[-2.8, 3.0841, 0]} rotation={[0, 0, 0.2]} ref={canopyRef}>');
    // C-8.49 — the Stable's timber box closing the full 7.0 depth of its roof
    expect(stableSrc).toContain('<boxGeometry args={[0.4, 2.6, 7.0]} />');
    expect(stableSrc).not.toContain('<boxGeometry args={[0.4, 2.6, 6.6]} />');
  });
});

// ── G. Control — the pre-fix geometry fails the identical rules ───────────

describe('G. Control: the 0.30 the slab was missing', () => {
  test('at component-local Y 2.85 the slab crossed the posts by 0.3–0.7', () => {
    // pre-fix, all four posts stood on the same CANOPY_Y height
    for (const [, pz] of FACE_POSTS) {
      const offset = seatOf(PRE_FIX_UNDER, pz, CANOPY_Y);
      expect(offset).toBeCloseTo(-0.66513, 5);
      expect(Math.abs(offset)).toBeGreaterThan(30 * TOL);
    }
    for (const [, pz] of YARD_POSTS) {
      const offset = seatOf(PRE_FIX_UNDER, pz, CANOPY_Y);
      expect(offset).toBeCloseTo(-0.31545, 5);
      expect(Math.abs(offset)).toBeGreaterThan(15 * TOL);
    }
    // and the shipped slab passes the very same check on all four
    for (const [, pz, h] of POSTS) {
      expect(Math.abs(seatOf(SHIPPED_UNDER, pz, h))).toBeLessThanOrEqual(TOL);
    }
  });

  test('and it floated clear of the front tie-beam instead of resting on it', () => {
    expect(BEAM_BAND[0] - PRE_FIX_TOP(YARD_ROW_Z)).toBeCloseTo(0.13487, 5);
    expect(BEAM_BAND[0]).toBeGreaterThan(PRE_FIX_TOP(BEAM_Z_SPAN[0]));
    // the shipped slab is in contact everywhere along the beam
    expect(SHIPPED_TOP(BEAM_Z_SPAN[0])).toBeGreaterThan(BEAM_BAND[0]);
  });

  test('the trim is required: an untrimmed face pair still fails by 0.36513', () => {
    for (const [, pz] of FACE_POSTS) {
      const offset = seatOf(SHIPPED_UNDER, pz, CANOPY_Y);
      expect(offset).toBeCloseTo(-0.36513, 5);
      expect(Math.abs(offset)).toBeGreaterThan(18 * TOL);
    }
    // the shipped height is exactly the underside at that row, minus the datum —
    // no other number seats those two posts
    expect(FACE_POST_H).toBeCloseTo(SHIPPED_UNDER(FACE_ROW_Z) - WALL_BASE_Y, 12);
    expect(CANOPY_Y - FACE_POST_H).toBeCloseTo(0.36513, 5);
  });

  test('the correction is vertical only — X, Z, pitch, slab and courtyard pair held', () => {
    expect(CANOPY_POS_SRC[0]).toBe(0);
    expect(CANOPY_POS_SRC[2]).toBe(CANOPY_Z);
    expect(CANOPY_ROT_SRC[2]).toBe(0);
    expect(CANOPY_ROT_SRC[0]).toBe(CANOPY_PITCH);
    expect(CANOPY_BOX).toEqual([3.3, 0.08, 3.05]);
    for (const [, , h] of YARD_POSTS) expect(h).toBe(CANOPY_Y);
    // the only two numbers this phase moved
    expect(CANOPY_POS_Y - PRE_FIX_POS_Y).toBeCloseTo(0.3, 12);
    expect(FACE_POST_H).toBeCloseTo(2.63487, 5);
  });
});
