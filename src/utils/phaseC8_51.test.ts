/**
 * Phase C-8.51 — General Store awning seat (canopy underside ↔ support-post tops).
 *
 * The C-8.50 read-only rooftop audit found the bazaar's crimson canvas awning
 * standing 0.4841 INSIDE its two timber support posts: the awning group sat at
 * local Y 2.6, but the canopy is pitched 0.2 rad about Z, so its underside at the
 * posts' own axis (local X −4.0) lies 0.2841 below the group's origin — 2.3159
 * against the 2.8-high post tops.
 *
 * The fix is one number, building-specific and purely vertical: the awning group
 * rides 2.6 → 3.0841 (= 2.8 + 0.2841), the lift that puts the underside exactly on
 * the post tops.  The bazaar lantern that hangs over the same canvas rides with it
 * by the same 0.4841, so its clearance above the awning is byte-identical to what
 * it was — lifting is the only way to keep a fixture out of a canopy that has moved
 * up into it.  Pitch, width, depth, materials, wall attachment and the posts are
 * untouched.
 *
 * Every number here is parsed from the component sources — the root group, the
 * awning group's own position and rotation, the canopy box, the post map's four
 * literals, the lantern group, the counter/amphora props and both flutter
 * amplitudes — and the seating is measured by actually transforming the canopy's
 * own corners through the group's Z rotation, not by asserting a copied constant.
 * Section F is the control: the pre-fix 2.6 fails the very rule the shipped 3.0841
 * satisfies, and the lift is shown to be the minimum the seat requires.
 *
 * SCOPE: this pins geometry, not appearance.  The seating is the STATIC transform;
 * the canopy's own wind flutter (±0.015 roll, ±0.01 pitch — unchanged by this phase
 * and pinned in §A/§B) is an animation on top of it, and its roll pivot at the
 * group origin swings the canvas at the post line by 2.4·sin(0.015) ≈ 0.036 — a
 * pre-existing animation property, not a seating figure.  The rendered junction on
 * Android is a device question this suite cannot answer.
 *
 * Run with: bun test src/utils/phaseC8_51.test.ts
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

const generalSrc = load('../components/3d/city/GeneralStore.tsx');
const propsSrc = load('../components/3d/city/CivicFurnishingProps.tsx');
const foundationSrc = load('../components/3d/city/BuildingFoundation.tsx');
const archSrc = load('../components/3d/city/ClassicalArchitecture.tsx');

/** The `RomanAmphora` component's own body — its geometry, not some other prop's. */
const ampSrc = propsSrc.slice(
  propsSrc.indexOf('export const RomanAmphora'),
  propsSrc.indexOf('export const TimberCrate'),
);

// ── Parsing helpers (values, not string presence) ─────────────────────────

type Vec3 = [number, number, number];

/** First single number captured by `re`. */
function num(src: string, re: RegExp): number {
  const m = re.exec(src);
  if (!m) throw new Error(`number not found: ${re}`);
  return Number(m[1]);
}

/** First `[a, b]` captured by `re`. */
function pair(src: string, re: RegExp): [number, number] {
  const m = re.exec(src);
  if (!m) throw new Error(`pair not found: ${re}`);
  return [Number(m[1]), Number(m[2])];
}

/** `attr={[a, b, c]}` / `attr={[a, b]}` → the numbers. */
function attrList(el: string, attr: string): number[] {
  const m = new RegExp(`\\b${attr}=\\{\\[([^\\]]*)\\]\\}`).exec(el);
  if (!m) throw new Error(`attribute ${attr} not found`);
  return m[1].split(',').map((s) => Number(s.trim()));
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

/** The first `<group position={[x, y, z]}>` in a component — its root group. */
function rootGroup(src: string): Vec3 {
  const m =
    /<group\s+position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/.exec(src);
  if (!m) throw new Error('root group not found');
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * The `<group …>` tag carrying `marker`, with its own body (everything up to the
 * first `</group>` — the groups this suite reads contain meshes only).
 */
function taggedGroup(src: string, marker: string) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error(`marker ${marker} not found`);
  const openStart = src.lastIndexOf('<group', at);
  const openEnd = src.indexOf('>', at);
  const close = src.indexOf('</group>', openEnd);
  if (openStart < 0 || openEnd < 0 || close < 0) {
    throw new Error(`group ${marker} could not be read`);
  }
  return {
    open: src.slice(openStart, openEnd + 1),
    body: src.slice(openEnd + 1, close),
  };
}

interface BoxMesh {
  /** [width, height, depth] of the box geometry. */
  args: Vec3;
  /** The mesh's own local position — [0, 0, 0] when the tag carries none. */
  pos: Vec3;
}

/** Every `<mesh …><boxGeometry args={[…]} /></mesh>` in a source slice. */
function boxMeshes(src: string): BoxMesh[] {
  const re =
    /<mesh\b([^<>]*)>\s*<boxGeometry args=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}\s*\/>/g;
  const out: BoxMesh[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const p = /position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/.exec(m[1]);
    out.push({
      args: [Number(m[2]), Number(m[3]), Number(m[4])],
      pos: p ? [Number(p[1]), Number(p[2]), Number(p[3])] : [0, 0, 0],
    });
  }
  return out;
}

function pick<T>(items: T[], pred: (t: T) => boolean, label: string): T {
  const found = items.filter(pred);
  if (found.length !== 1) {
    throw new Error(`expected exactly one ${label}, found ${found.length}`);
  }
  return found[0];
}

function findRect(id: string): RectCollider {
  const c = CITY_COLLIDERS.find((c) => c.id === id);
  if (!c || c.type !== 'rect') throw new Error(`Rect collider '${id}' not found`);
  return c;
}

// ── The rendered bazaar, measured from its own source ─────────────────────

/** `[22, 0, −5]` — the building position, pinned because this phase must not move it. */
const ROOT = rootGroup(generalSrc);

/** The awning group — the only `<group … ref={canopyRef}>` in the file. */
const AWNING = taggedGroup(generalSrc, 'ref={canopyRef}');
const AWNING_POS = attrList(AWNING.open, 'position') as Vec3;
const AWNING_ROT = attrList(AWNING.open, 'rotation') as Vec3;
const PITCH = AWNING_ROT[2];

/** The canopy box and the striped trim sheet inside the awning group. */
const CANOPY = boxMeshes(AWNING.body)[0];
const TRIM = boxMeshes(AWNING.body)[1];
const HALF = {
  w: CANOPY.args[0] / 2,
  h: CANOPY.args[1] / 2,
  d: CANOPY.args[2] / 2,
};

/** The post map: one X in the outer list, two Z in the inner one, one mesh each. */
const POST_X = [num(generalSrc, /\[\s*(-?[\d.]+)\s*\]\.map\(\(px,\s*pi\)/)];
const POST_Z = pair(generalSrc, /\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(pz,\s*zi\)/);
const POST_MESH =
  /position=\{\[px,\s*(-?[\d.]+),\s*pz\]\}>\s*<cylinderGeometry args=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+),\s*\d+\s*\]\}/.exec(
    generalSrc,
  );
if (!POST_MESH) throw new Error('the post map mesh could not be read');
const POST_Y = Number(POST_MESH[1]);
const POST_R_TOP = Number(POST_MESH[2]);
const POST_R_BOTTOM = Number(POST_MESH[3]);
const POST_H = Number(POST_MESH[4]);

/** The lantern group that hangs over the same canopy. */
const LANTERN = new RegExp(
  '<group position=\\{\\[\\s*(-?[\\d.]+),\\s*(-?[\\d.]+),\\s*(-?[\\d.]+)\\s*\\]\\}>' +
    '\\s*<mesh castShadow>\\s*<cylinderGeometry args=\\{\\[\\s*(-?[\\d.]+),\\s*(-?[\\d.]+),\\s*(-?[\\d.]+),\\s*\\d+\\s*\\]\\}',
).exec(generalSrc);
if (!LANTERN) throw new Error('the lantern group could not be read');
const LANTERN_POS: Vec3 = [Number(LANTERN[1]), Number(LANTERN[2]), Number(LANTERN[3])];
const LANTERN_H = Number(LANTERN[6]);
const LANTERN_R_BOTTOM = Number(LANTERN[5]);

/** The wind flutter's amplitudes and its base, as the component's own frame callback sets them. */
const FLUTTER = {
  rollAmp: num(generalSrc, /rotation\.x = Math\.sin\(time \* [\d.]+\) \* (-?[\d.]+)/),
  pitchBase: num(generalSrc, /rotation\.z = (-?[\d.]+) \+ Math\.cos\(time \* [\d.]+\) \* -?[\d.]+/),
  pitchAmp: num(generalSrc, /rotation\.z = -?[\d.]+ \+ Math\.cos\(time \* [\d.]+\) \* (-?[\d.]+)/),
};

/** The bazaar's own timber pavilion wall, its eave cornice and its foundation. */
const WALL = new RegExp(
  '<mesh castShadow receiveShadow position=\\{\\[\\s*(-?[\\d.]+),\\s*(-?[\\d.]+),\\s*(-?[\\d.]+)\\s*\\]\\}>' +
    '\\s*<boxGeometry args=\\{\\[\\s*(-?[\\d.]+),\\s*(-?[\\d.]+),\\s*(-?[\\d.]+)\\s*\\]\\}',
).exec(generalSrc);
if (!WALL) throw new Error('the pavilion wall could not be read');
const WALL_POS: Vec3 = [Number(WALL[1]), Number(WALL[2]), Number(WALL[3])];
const WALL_ARGS: Vec3 = [Number(WALL[4]), Number(WALL[5]), Number(WALL[6])];

const corniceEl = element(generalSrc, 'WallCornice');
const CORNICE = {
  size: attrList(corniceEl, 'size'),
  y: attrNum(corniceEl, 'y'),
  height: attrNum(corniceEl, 'height'),
  projection: attrNum(corniceEl, 'projection'),
};

const foundationEl = element(generalSrc, 'BuildingFoundation');
const FOUNDATION = {
  size: attrList(foundationEl, 'size'),
  projection: attrNum(foundationEl, 'projection'),
};

/** The display counter — its group, its table, and the amphora stack it carries. */
const COUNTER_GROUP = '<group position={[-3.6, 0, 0]}>';
const COUNTER_X = attrList(taggedGroup(generalSrc, 'Timber Counter Table').open, 'position')[0];
const TABLE = pick(
  boxMeshes(generalSrc),
  (b) => b.args[0] === 1.2 && b.args[1] === 1.3,
  'counter table',
);
const AMPHORAE = [
  ...generalSrc.matchAll(
    /<RomanAmphora\s+position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}\s+scale=\{(-?[\d.]+)\}/g,
  ),
].map((m) => ({ y: Number(m[2]), scale: Number(m[4]) }));

/** The amphora's own tallest part (its rim lip) and its widest (its belly). */
const AMPHORA_TOP_LOCAL =
  num(ampSrc, /<mesh castShadow position=\{\[0,\s*(-?[\d.]+),\s*0\]\}>\s*<torusGeometry/) +
  num(ampSrc, /<torusGeometry args=\{\[\s*-?[\d.]+,\s*(-?[\d.]+)/);
const AMPHORA_BELLY_R = num(ampSrc, /<sphereGeometry args=\{\[\s*(-?[\d.]+),\s*\d+,\s*\d+\s*\]\}/);

/** The two historical values this phase replaced (the C-8.50 audit's measurements). */
const PRE_FIX_AWNING_Y = 2.6;
const PRE_FIX_LANTERN_Y = 3.2;

// ── The transform ─────────────────────────────────────────────────────────

/** Rotate `p` about the Z axis by `rotZ`, then translate by `origin` — three.js order (R, then T). */
function place(p: Vec3, origin: Vec3, rotZ: number): Vec3 {
  const c = Math.cos(rotZ);
  const s = Math.sin(rotZ);
  return [
    origin[0] + p[0] * c - p[1] * s,
    origin[1] + p[0] * s + p[1] * c,
    origin[2] + p[2],
  ];
}

/** Root-local → world (the root group carries no rotation). */
const world = (p: Vec3): Vec3 => [ROOT[0] + p[0], ROOT[1] + p[1], ROOT[2] + p[2]];

/** A canopy-local point (signs on the half-extents) → the building's own frame. */
function canopyLocal(
  p: Vec3,
  groupY: number = AWNING_POS[1],
  pitch: number = PITCH,
): Vec3 {
  return place(
    [
      CANOPY.pos[0] + p[0] * HALF.w,
      CANOPY.pos[1] + p[1] * HALF.h,
      CANOPY.pos[2] + p[2] * HALF.d,
    ],
    [AWNING_POS[0], groupY, AWNING_POS[2]],
    pitch,
  );
}

/** The same point in world space. */
function canopyPoint(
  p: Vec3,
  groupY: number = AWNING_POS[1],
  pitch: number = PITCH,
): Vec3 {
  return world(canopyLocal(p, groupY, pitch));
}

/**
 * The canopy's underside and top faces as Y(X) lines, each through its own two
 * along-X corners — derived from the actual transform, so a change to the group's
 * position, rotation or the box's dimensions moves these numbers.
 */
function faces(groupY: number = AWNING_POS[1], pitch: number = PITCH) {
  const underA = canopyPoint([-1, -1, -1], groupY, pitch);
  const underB = canopyPoint([+1, -1, -1], groupY, pitch);
  const topA = canopyPoint([-1, +1, -1], groupY, pitch);
  const topB = canopyPoint([+1, +1, -1], groupY, pitch);
  const line = (a: Vec3, b: Vec3) => (x: number) =>
    a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0]);
  return {
    underA,
    underB,
    topA,
    topB,
    underside: line(underA, underB),
    top: line(topA, topB),
  };
}

/** Every canopy corner in world space — for extents, the lowest and the highest point. */
const CORNERS: Vec3[] = ([-1, 1] as const).flatMap((sx) =>
  ([-1, 1] as const).flatMap((sy) =>
    ([-1, 1] as const).map((sz) => canopyPoint([sx, sy, sz])),
  ),
);
const X_SPAN: [number, number] = [
  Math.min(...CORNERS.map((c) => c[0])),
  Math.max(...CORNERS.map((c) => c[0])),
];
const Z_SPAN: [number, number] = [
  Math.min(...CORNERS.map((c) => c[2])),
  Math.max(...CORNERS.map((c) => c[2])),
];
const LOWEST_Y = Math.min(...CORNERS.map((c) => c[1]));
const HIGHEST_Y = Math.max(...CORNERS.map((c) => c[1]));

/** The same corners in the building's own frame (the root group carries no rotation). */
const LOCAL_CORNERS: Vec3[] = ([-1, 1] as const).flatMap((sx) =>
  ([-1, 1] as const).flatMap((sy) =>
    ([-1, 1] as const).map((sz) => canopyLocal([sx, sy, sz])),
  ),
);
const LOCAL_X_SPAN: [number, number] = [
  Math.min(...LOCAL_CORNERS.map((c) => c[0])),
  Math.max(...LOCAL_CORNERS.map((c) => c[0])),
];
const LOCAL_Z_SPAN: [number, number] = [
  Math.min(...LOCAL_CORNERS.map((c) => c[2])),
  Math.max(...LOCAL_CORNERS.map((c) => c[2])),
];

/** The posts' world X positions and the height their flat tops sit at. */
const POST_WORLD_X = POST_X.map((x) => world([x, 0, 0])[0]);
const POST_TOP_Y = world([0, POST_Y + POST_H / 2, 0])[1];

const SHIPPED = faces();
const TOL = 0.02;
const EDGE = 1e-9;

/** How far the canopy underside sits above (+) or below (−) the post tops at world X. */
const seatOffset = (x: number, f = SHIPPED) => f.underside(x) - POST_TOP_Y;

const storeRect = findRect('general-store');

// ── A. What the component renders (the frame the fix had to work in) ───────

describe('A. The rendered bazaar (Phase C-8.51)', () => {
  test('the root group and the awning group are the ones the audit measured', () => {
    expect(ROOT).toEqual([22, 0, -5]);
    expect(AWNING_POS[0]).toBe(-2.8);
    expect(AWNING_POS[2]).toBe(0);
    expect(AWNING_ROT).toEqual([0, 0, 0.2]);
    expect(PITCH).toBe(0.2);
  });

  test('the canopy sits at the group origin and keeps its box, its trim and its colours', () => {
    expect(CANOPY.args).toEqual([2.8, 0.08, 5.2]);
    expect(CANOPY.pos).toEqual([0, 0, 0]);
    expect(TRIM.args).toEqual([2.7, 0.02, 5.1]);
    expect(TRIM.pos).toEqual([0, 0.05, 0]);
    expect(generalSrc).toContain('color="#991b1b" roughness={0.7}');
    expect(generalSrc).toContain('color="#fef08a" roughness={0.5}');
  });

  test('the post map is still two 2.8-high posts standing on the ground', () => {
    expect(POST_X).toEqual([-4.0]);
    expect(POST_Z).toEqual([-2.4, 2.4]);
    expect(POST_Y).toBe(1.4);
    expect(POST_R_TOP).toBe(0.12);
    expect(POST_R_BOTTOM).toBe(0.14);
    expect(POST_H).toBe(2.8);
    // a plain cylinder centred at half its height: it stands from the ground to 2.8
    expect(POST_Y - POST_H / 2).toBeCloseTo(0, 10);
    expect(POST_TOP_Y).toBeCloseTo(2.8, 10);
    // one X in the outer map × the two Z in the inner one = the two posts
    expect(POST_X.length * POST_Z.length).toBe(2);
    expect(POST_WORLD_X).toEqual([18]);
    expect(generalSrc).toContain('color="#451a03" roughness={0.8}');
  });

  test('the canopy wind flutter is exactly the one it always had', () => {
    expect(generalSrc).toContain('Math.sin(time * 2.0) * 0.015');
    expect(generalSrc).toContain('0.2 + Math.cos(time * 1.8) * 0.01');
    expect(FLUTTER.rollAmp).toBe(0.015);
    expect(FLUTTER.pitchAmp).toBe(0.01);
    // the flutter is centred on the declared pitch, so the pitch is the animation's own base
    expect(FLUTTER.pitchBase).toBe(PITCH);
  });
});

// ── B. The seat: the canopy's underside on the post tops ───────────────────

describe('B. Underside seated on the post tops within 0.02', () => {
  test('the pitched underside is a slope, not a level plane', () => {
    const slope =
      (SHIPPED.underB[1] - SHIPPED.underA[1]) / (SHIPPED.underB[0] - SHIPPED.underA[0]);
    // rises toward the wall (world +X) by exactly the pitch's tangent
    expect(slope).toBeCloseTo(Math.tan(PITCH), 12);
    expect(slope).toBeCloseTo(0.20271, 5);
    expect(slope).toBeGreaterThan(0);
  });

  test('the underside meets both post tops within 0.02, resting on them', () => {
    expect(POST_X.length * POST_Z.length).toBe(2); // both posts, which share their X
    for (const x of POST_WORLD_X) {
      const offset = seatOffset(x);
      expect(Math.abs(offset)).toBeLessThanOrEqual(TOL);
      // a seat, not a penetration: the underside is never below the flat top it rests on
      expect(offset).toBeGreaterThan(-EDGE);
    }
  });

  test('the seat is measured at the post axis, which centres the tilt across the post top', () => {
    for (const x of POST_WORLD_X) {
      const west = seatOffset(x - POST_R_TOP);
      const east = seatOffset(x + POST_R_TOP);
      // equal and opposite, so the axis is the centre of the post's own top face: the
      // flat-topped post cannot follow a 0.2-rad pitch better than this ±0.0243 spread
      expect(west + east).toBeCloseTo(2 * seatOffset(x), 10);
      expect(Math.abs(west + east)).toBeLessThan(1e-3);
      expect(Math.abs(west)).toBeLessThanOrEqual(0.025);
      expect(Math.abs(east)).toBeLessThanOrEqual(0.025);
      // and the spread is exactly the pitch's run across the post's top radius
      expect(east - west).toBeCloseTo(2 * POST_R_TOP * Math.tan(PITCH), 10);
    }
  });

  test('both posts stand under the canopy, near its outer edge', () => {
    for (const x of POST_WORLD_X) {
      expect(x).toBeGreaterThan(SHIPPED.underA[0]);
      expect(x).toBeLessThan(SHIPPED.underB[0]);
    }
    for (const z of POST_Z) {
      const worldZ = world([0, 0, z])[2];
      expect(worldZ).toBeGreaterThan(Z_SPAN[0]);
      expect(worldZ).toBeLessThan(Z_SPAN[1]);
    }
  });

  test("the seat survives the canopy's own pitch trim (the flutter stays inside tolerance)", () => {
    for (const pitch of [PITCH - FLUTTER.pitchAmp, PITCH, PITCH + FLUTTER.pitchAmp]) {
      const swept = faces(AWNING_POS[1], pitch);
      for (const x of POST_WORLD_X) {
        expect(Math.abs(seatOffset(x, swept))).toBeLessThanOrEqual(TOL);
      }
    }
  });
});

// ── C. What the fix preserved ──────────────────────────────────────────────

describe('C. Pitch, size, materials and wall attachment preserved', () => {
  test('the canopy geometry, the pitch and the materials are the pre-fix ones', () => {
    expect(CANOPY.args).toEqual([2.8, 0.08, 5.2]);
    expect(AWNING_ROT).toEqual([0, 0, 0.2]);
    expect(CANOPY.args[1] / 2).toBeCloseTo(0.04, 10);
    expect(HALF.w * 2).toBe(2.8);
    expect(HALF.d * 2).toBe(5.2);
  });

  test('the awning still runs into the wall — the attachment is unchanged', () => {
    const wallX: [number, number] = [
      WALL_POS[0] - WALL_ARGS[0] / 2,
      WALL_POS[0] + WALL_ARGS[0] / 2,
    ];
    const wallY: [number, number] = [
      WALL_POS[1] - WALL_ARGS[1] / 2,
      WALL_POS[1] + WALL_ARGS[1] / 2,
    ];
    const wallZ: [number, number] = [
      WALL_POS[2] - WALL_ARGS[2] / 2,
      WALL_POS[2] + WALL_ARGS[2] / 2,
    ];
    expect(WALL_ARGS).toEqual([7.2, 4.8, 5.8]);
    expect(wallX).toEqual([-3.6, 3.6]);
    expect(wallY).toEqual([0, 4.8]);

    // the canopy's inner end is embedded in the wall by ≥ 2.0, inside its height band
    // (both in the building's own frame — the root group carries no rotation)
    const innerTop = canopyLocal([+1, +1, 0]);
    expect(wallX[1] - innerTop[0]).toBeGreaterThanOrEqual(2.0);
    expect(innerTop[1]).toBeGreaterThan(wallY[0]);
    expect(wallY[1] - innerTop[1]).toBeGreaterThanOrEqual(1.0);
    // its Z span sits inside the wall's own Z band
    expect(LOCAL_Z_SPAN[0]).toBeGreaterThanOrEqual(wallZ[0] - EDGE);
    expect(LOCAL_Z_SPAN[1]).toBeLessThanOrEqual(wallZ[1] + EDGE);
    // and its outer end still juts past the wall's west face over the market
    expect(wallX[0] - LOCAL_X_SPAN[0]).toBeGreaterThanOrEqual(0.5);
  });

  test('the raised canopy clears the eave cornice, and the roof assembly is untouched', () => {
    expect(CORNICE.size).toEqual([7.2, 5.8]);
    expect(CORNICE.y).toBe(4.75);
    expect(CORNICE.height).toBe(0.18);
    expect(CORNICE.projection).toBe(0.14);
    expect(CORNICE.y - CORNICE.height / 2 - HIGHEST_Y).toBeGreaterThanOrEqual(1.0);
    // the roof, foundation and primitives the awning hangs beneath are the ones they were
    expect(attrNum(element(generalSrc, 'RomanGabledRoof'), 'height')).toBe(1.35);
    expect(FOUNDATION.size).toEqual([7.2, 5.8]);
    expect(FOUNDATION.projection).toBe(0.25);
    expect(generalSrc).toContain('<RomanGabledRoof');
    expect(generalSrc).toContain('<CornerQuoins');
    expect(archSrc).toContain('export const RomanGabledRoof');
    expect(foundationSrc).toContain('const lowerWidth = w + projection * 2;');
  });
});

// ── D. No new interpenetration ─────────────────────────────────────────────

describe('D. The raised canopy and the lantern over it', () => {
  /** The tallest amphora stack and its own X band, both derived from the two sources. */
  const stackTopY = Math.max(
    ...AMPHORAE.map((a) => world([0, a.y + a.scale * AMPHORA_TOP_LOCAL, 0])[1]),
  );
  const stackMaxScale = Math.max(...AMPHORAE.map((a) => a.scale));
  const stackWestX = world([COUNTER_X, 0, 0])[0] - stackMaxScale * AMPHORA_BELLY_R;

  test('the counter goods this must clear are the ones the component mounts', () => {
    expect(AMPHORAE.length).toBe(4);
    expect(world([COUNTER_X, 0, 0])[0]).toBeCloseTo(18.4, 10);
    expect(TABLE.args).toEqual([1.2, 1.3, 4.2]);
    expect(TABLE.pos).toEqual([0, 0.65, 0]);
    expect(AMPHORA_TOP_LOCAL).toBeCloseTo(0.91 + 0.025, 10);
    expect(stackTopY).toBeCloseTo(1.45 + 0.9 * (0.91 + 0.025), 10);
    expect(stackWestX).toBeCloseTo(18.4 - 0.9 * 0.26, 10);
  });

  test('the canopy underside over the counter goods gained clearance rather than losing it', () => {
    const before = faces(PRE_FIX_AWNING_Y).underside(stackWestX);
    const after = SHIPPED.underside(stackWestX);
    expect(after - stackTopY).toBeGreaterThanOrEqual(0.4);
    expect(after).toBeGreaterThan(before);
    // the pre-fix canopy also cleared them (tightly), so this phase fixed the posts
    // without introducing — or needing to introduce — a counter collision
    expect(before - stackTopY).toBeGreaterThan(0);
    expect(after - before).toBeCloseTo(0.4841, 3);
  });

  test('the lantern above the canvas rides with it, keeping its clearance exactly', () => {
    const lift = AWNING_POS[1] - PRE_FIX_AWNING_Y;
    expect(lift).toBeCloseTo(0.4841, 10);
    expect(LANTERN_POS[1] - PRE_FIX_LANTERN_Y).toBeCloseTo(lift, 12);
    // the lantern's clearance above the canvas is a function of that one shared lift:
    // unchanged, and positive
    const rimEastX = world([LANTERN_POS[0] + LANTERN_R_BOTTOM, 0, 0])[0];
    const lanternBottom = (y: number) => world([0, y - LANTERN_H / 2, 0])[1];
    const after = lanternBottom(LANTERN_POS[1]) - SHIPPED.top(rimEastX);
    const before = lanternBottom(PRE_FIX_LANTERN_Y) - faces(PRE_FIX_AWNING_Y).top(rimEastX);
    expect(after).toBeGreaterThan(0.4);
    expect(after - before).toBeCloseTo(0, 12);
    // and it still hangs clear of the eave cornice above it
    const lanternTop = world([0, LANTERN_POS[1] + LANTERN_H / 2, 0])[1];
    expect(CORNICE.y - CORNICE.height / 2 - lanternTop).toBeGreaterThanOrEqual(0.5);
  });
});

// ── E. Collision, hub and scope guard ──────────────────────────────────────

describe('E. Nothing else moved', () => {
  test('the collision registry is untouched and the store still owns its plinth rectangle', () => {
    // 110 before Phase C-8.64A; the +31 are its own `circus-*` segments, and
    // Phase C-8.64B's `forecourt-parapet` is its +1 rectangle.
    expect(CITY_COLLIDERS.length).toBe(142);
    expect(CITY_COLLIDERS.filter((c) => c.type === 'rect').length).toBe(32);
    const ids = CITY_COLLIDERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PLAYER_RADIUS).toBe(0.4);
    expect(storeRect).toMatchObject({ cx: 22, cz: -5, hw: 7.7 / 2, hd: 6.3 / 2 });
    // re-derived from the component + BuildingFoundation's own formula
    expect(storeRect.hw).toBeCloseTo(FOUNDATION.size[0] / 2 + FOUNDATION.projection, 10);
    expect(storeRect.hd).toBeCloseTo(FOUNDATION.size[1] / 2 + FOUNDATION.projection, 10);
  });

  test('the awning stays over the building footprint, well above the market', () => {
    expect(Z_SPAN[0]).toBeGreaterThanOrEqual(storeRect.cz - storeRect.hd - EDGE);
    expect(Z_SPAN[1]).toBeLessThanOrEqual(storeRect.cz + storeRect.hd + EDGE);
    // the lowest canvas corner is more than a metre above the counter's own table top
    expect(LOWEST_Y - (TABLE.pos[1] + TABLE.args[1] / 2)).toBeGreaterThan(1.0);
  });

  test('the bazaar hub keeps its centre, its C-8.47 radius and its arrival', () => {
    const hub = HUB_LOCATIONS.find((h) => h.id === 'general_store');
    if (!hub) throw new Error('general_store hub not found');
    expect(hub.position).toEqual([22, 0, -5]);
    expect(hub.radius).toBe(5.25);
    expect(FAST_TRAVEL_ARRIVALS.general_store).toEqual([17, -5]);
    expect(getNearbyHubLocation([17, 0, -5])?.id).toBe('general_store');
  });

  test("the bazaar's other props keep their own transforms", () => {
    expect(generalSrc).toContain(COUNTER_GROUP);
    expect(generalSrc).toContain('<group position={[-2.4, 0, 2.4]}>');
    expect(generalSrc).toContain('<group position={[0.2, 1.38, 0.8]}>');
    expect(LANTERN_POS[0]).toBe(-3.8);
    expect(LANTERN_POS[2]).toBe(1.8);
    expect(TRIM.pos).toEqual([0, 0.05, 0]);
    expect(generalSrc).toContain('<TimberCrate');
    expect(generalSrc).toContain('<WineBarrel');
  });
});

// ── F. Control: the pre-fix values fail the rule the shipped ones satisfy ──

describe('F. Control — the pre-fix awning misses the post tops', () => {
  test('at group Y 2.6 the canopy stood 0.4841 inside the posts', () => {
    const before = faces(PRE_FIX_AWNING_Y);
    for (const x of POST_WORLD_X) {
      const offset = before.underside(x) - POST_TOP_Y;
      expect(offset).toBeCloseTo(-0.4841, 3);
      expect(Math.abs(offset)).toBeGreaterThan(TOL); // 24× the tolerance this phase accepted
    }
    // and the shipped geometry passes the identical check
    for (const x of POST_WORLD_X) {
      expect(Math.abs(SHIPPED.underside(x) - POST_TOP_Y)).toBeLessThanOrEqual(TOL);
      expect(SHIPPED.underside(x)).toBeGreaterThan(POST_TOP_Y);
    }
  });

  test('the lift is the minimum the seat requires — nothing else changed to escape it', () => {
    const required = POST_TOP_Y - faces(PRE_FIX_AWNING_Y).underside(POST_WORLD_X[0]);
    const lift = AWNING_POS[1] - PRE_FIX_AWNING_Y;
    expect(lift).toBeCloseTo(required, 3);
    expect(lift).toBeGreaterThan(0.48);
    expect(lift).toBeLessThan(0.49);
    // the escape is vertical only: X, Z and the pitch are exactly what they were
    expect(AWNING_POS[0]).toBe(-2.8);
    expect(AWNING_POS[2]).toBe(0);
    expect(AWNING_ROT[2]).toBe(0.2);
    expect(CANOPY.args).toEqual([2.8, 0.08, 5.2]);
    expect(POST_H).toBe(2.8);
  });
});
