/**
 * Phase C-8.65 — East Circus District: forum-link mouth apron
 * (visual audit of the C-8.64B district, and the one refinement it justified).
 *
 * Run with: bun test src/utils/phaseC8_65.test.ts
 *
 * ── WHAT THE AUDIT FOUND ──────────────────────────────────────────────────
 * C-8.64B measured one seam and deliberately left it: the forum's plaza paving
 * is a disc about [0, 0] while the district link's west face is a straight line
 * at X 15.30, so across the link's own 3.00 Z band the plaza's *rendered* edge
 * (a 36-gon, not a true circle) falls away from the link and leaves bare sand
 * between the two paved surfaces.  Re-measured here from the plaza's own source:
 *
 *   | Z (band) | plaza edge X | gap to the link — drawn (36-gon) | true circle |
 *   |----------|--------------|-----------------------------------|-------------|
 *   | 6.75     | 14.9889      | 0.311                             | 0.244       |
 *   | 8.25     | 14.2894      | 1.011                             | 1.011       |
 *   | 9.75     | 13.2391      | 2.061                             | 1.989       |
 *
 * That is 3.295 sq units of bare sand — up to 2.06 of the link's 3.00 width, on
 * the only paved route from the forum into the district — and the city ground
 * plane sits 0.055 below the plaza's surface, so it reads as a paved break with
 * a lip.  It is a *visible gap*; it is not a bottleneck (the ground is walkable)
 * and it confuses no route.  So this phase fills it with one flat slab instead
 * of moving the link: the road plan is preserved exactly, the arena is
 * untouched, and the movement envelope is unchanged.
 *
 * ── WHAT SHIPPED ──────────────────────────────────────────────────────────
 * `CIRCUS_LINK_MOUTH_APRON` + `CIRCUS_LINK_MOUTH_APRON_RECT` in
 * `utils/circusDistrictGeometry.ts`, and ONE plane mesh in
 * `components/3d/city/EastCircusDistrict.tsx` (20 → 21 static meshes).  Its east
 * edge IS the link's west face, its Z band IS the link's band, and its west edge
 * (13.10) sits inside the plaza's rendered paving at every Z in the band, so the
 * plaza's disc and its gilded ring — both above it — cover the join.  It is
 * drawn in the plaza's own `forumPaving` stone and at Y 0.003, 2 mm under the
 * plaza's 0.005 plane: the wedge is paved, the ring is not notched, no slab
 * z-fights, and no collider is added — it is pavement the player walks over,
 * exactly like the four runs, the plaza and the kerbs.
 *
 * ── HOW IT IS VERIFIED ────────────────────────────────────────────────────
 *   • every figure is re-derived from the plaza's own source (the 36-gon is
 *     parsed out of `ProcessionAvenue.tsx`) and from the shipped layout module
 *     and registry — never restated from a comment;
 *   • §C drives the seam with the real `resolveCityMovement` (3.8 u/s, 0.1 s
 *     steps = 0.38/step) in both directions, across the apron's whole width, and
 *     re-checks that the arena's closed ring still refuses entry;
 *   • §E is the control: the pre-fix pavement set (everything but the apron)
 *     leaves every wedge sample bare, and the shipped set covers each of them.
 *
 * ── NOT VERIFIED HERE ─────────────────────────────────────────────────────
 * Appearance.  The sandbox has no GPU (SwiftShader, ~2 fps in the city hub) and
 * the district stands 26+ units east of the plaza the player spawns in, so no
 * frame of it was obtained — the limit C-8.36/C-8.37/C-8.55/C-8.64A/C-8.64B all
 * recorded.  Nothing in this suite is visual acceptance: the apron's *look* —
 * forum stone running unbroken into the link's slabs, the gilded ring stopping
 * at the plaza's own edge — needs the on-device (Android) check.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  PLAYER_RADIUS,
  CITY_COLLIDERS,
  collidesWith,
  CIRCUS_CARCERES_FRONT_Z,
  CIRCUS_WEST_OUTLINE,
  type Collider,
  type RectCollider,
  type SegmentCollider,
} from './collisionShapes';
import {
  resolveCityMovement,
  BOUNDARY_X,
  CIRCUS_ENVELOPE_X_EAST,
  CIRCUS_ENVELOPE_Z_MAX,
  clampBoundaryX,
  clampBoundaryZ,
} from './cityCollisions';
import {
  CIRCUS_APPROACH,
  CIRCUS_APPROACH_LINK,
  CIRCUS_FORECOURT,
  CIRCUS_FORECOURT_PARAPET,
  CIRCUS_LINK_MOUTH_APRON,
  CIRCUS_LINK_MOUTH_APRON_RECT,
  CIRCUS_SERVICE_LANE,
  CIRCUS_VIA,
  DISTRICT_KERBS,
  DISTRICT_ROADS,
  FORGE_EAST_X,
  FORGE_NORTH_Z,
  CARAVANSERAI_SOUTH_Z,
  FORUM_PLAZA_RADIUS,
  FORUM_PLAZA_EAST_IN_LINK_BAND,
  KERB_HEIGHT,
  STABLE_EAST_X,
} from './circusDistrictGeometry';
import {
  GROUND_PLANE_EAST_X,
  GROUND_PLANE_ELEVATION_Y,
  GROUND_PLANE_SOUTH_Z,
  GROUND_PLANE_WEST_X,
} from '../components/3d/city/ProcessionAvenue';

// ── Sources ────────────────────────────────────────────────────────────────
const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const districtSrc = load('../components/3d/city/EastCircusDistrict.tsx');
const arenaSrc = load('../components/3d/city/EastCircusArena.tsx');
const sceneSrc = load('../components/3d/city/CityHubScene.tsx');
const geometrySrc = load('./circusDistrictGeometry.ts');
const plazaSrc = load('../components/3d/city/ProcessionAvenue.tsx');

/** The arena's source asset — byte-identical through C-8.64A, C-8.64B and this phase. */
const GLB_BYTES = readFileSync(new URL('../../public/_workspace_arena.glb', import.meta.url));

// ── The forum plaza, parsed from its own component ─────────────────────────
/**
 * `ProcessionAvenue` draws the plaza hub floor as `<circleGeometry args={[r, n]}>`
 * on a flat mesh at `position={[0, y, 0]}` rotated −π/2 about X.  The rendered
 * edge is therefore a regular n-gon, and that polygon — not the true circle — is
 * what the link's west face actually meets.
 */
const plazaMatch = /<mesh receiveShadow position=\{\[\s*0,\s*([\d.]+),\s*0\]\} rotation=\{\[-Math\.PI \/ 2, 0, 0\]\}>\s*<circleGeometry args=\{\[\s*([\d.]+),\s*(\d+)\]\}\s*\/>/.exec(
  plazaSrc,
);
if (!plazaMatch) throw new Error('the plaza hub floor could not be parsed from ProcessionAvenue.tsx');
const PLAZA_Y = Number(plazaMatch[1]);
const PLAZA_R = Number(plazaMatch[2]);
const PLAZA_SEGMENTS = Number(plazaMatch[3]);

/** The polygon's own +X boundary at world Z (z ≥ 0), exactly as three draws it. */
const plazaEdgeX = (z: number, r = PLAZA_R, n = PLAZA_SEGMENTS): number => {
  const step = (2 * Math.PI) / n;
  const verts = Array.from({ length: n }, (_, k) => [r * Math.cos(k * step), r * Math.sin(k * step)] as const);
  for (let k = 0; k < n; k++) {
    const [x1, z1] = verts[k];
    const [x2, z2] = verts[(k + 1) % n];
    const lo = Math.min(z1, z2);
    const hi = Math.max(z1, z2);
    if (z >= lo - 1e-12 && z <= hi + 1e-12 && Math.abs(z2 - z1) > 1e-12) {
      const t = (z - z1) / (z2 - z1);
      return x1 + t * (x2 - x1);
    }
  }
  return NaN;
};

// ── Geometry helpers ───────────────────────────────────────────────────────
interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const boxOf = (r: { cx: number; cz: number; w: number; d: number }): Box => ({
  x0: r.cx - r.w / 2,
  x1: r.cx + r.w / 2,
  z0: r.cz - r.d / 2,
  z1: r.cz + r.d / 2,
});

const rectBox = (c: RectCollider): Box => ({
  x0: c.cx - c.hw,
  x1: c.cx + c.hw,
  z0: c.cz - c.hd,
  z1: c.cz + c.hd,
});

/** Overlap of two boxes, per axis (negative = separated). */
const overlapBetween = (a: Box, b: Box): { x: number; z: number } => ({
  x: Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0),
  z: Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0),
});

const inBox = (b: Box, x: number, z: number): boolean =>
  x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;

const rects = CITY_COLLIDERS.filter((c): c is RectCollider => c.type === 'rect');
const isCircus = (c: Collider): boolean => c.id.startsWith('circus-');
const circusPerimeter = CITY_COLLIDERS.filter(isCircus) as SegmentCollider[];

/** Does any collider actually run THROUGH this pavement box? (C-8.64B's test.) */
const blocked = (b: Box): string[] => {
  const hits: string[] = [];
  for (const c of CITY_COLLIDERS) {
    if (c.type === 'rect') {
      const o = overlapBetween(b, rectBox(c));
      if (o.x > 1e-9 && o.z > 1e-9) hits.push(c.id);
      continue;
    }
    if (c.type === 'circle') {
      const nx = Math.max(b.x0, Math.min(c.cx, b.x1));
      const nz = Math.max(b.z0, Math.min(c.cz, b.z1));
      if (Math.hypot(c.cx - nx, c.cz - nz) < c.r) hits.push(c.id);
      continue;
    }
    const len = Math.hypot(c.x2 - c.x1, c.z2 - c.z1);
    const steps = Math.max(2, Math.ceil(len / 0.05));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = c.x1 + (c.x2 - c.x1) * t;
      const z = c.z1 + (c.z2 - c.z1) * t;
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) {
        hits.push(c.id);
        break;
      }
    }
  }
  return hits;
};

/** The shipped walk: 3.8 u/s in 0.1 s steps, stopping after 6 blocked steps. */
const driven = (
  start: [number, number, number],
  dir: [number, number],
  steps: number,
): [number, number, number][] => {
  const path: [number, number, number][] = [start];
  let pos = start;
  let stuck = 0;
  for (let i = 0; i < steps; i++) {
    const next = resolveCityMovement(pos, dir[0], dir[1], 3.8, 0.1);
    stuck = next[0] === pos[0] && next[2] === pos[2] ? stuck + 1 : 0;
    pos = next;
    path.push(pos);
    if (stuck > 5) break;
  }
  return path;
};

const last = (p: [number, number, number][]): [number, number, number] => p[p.length - 1];

const clearOf = (path: [number, number, number][]): void => {
  for (const p of path) {
    expect(collidesWith(p[0], p[2], PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
  }
};

const insideEnvelope = (path: [number, number, number][]): void => {
  for (const p of path) {
    expect(clampBoundaryX(p[0], p[2])).toBeCloseTo(p[0], 9);
    expect(clampBoundaryZ(p[0], p[2])).toBeCloseTo(p[2], 9);
  }
};

// ── The two faces the seam is measured between ─────────────────────────────
const LINK_WEST_X = CIRCUS_APPROACH_LINK.cx - CIRCUS_APPROACH_LINK.w / 2; // 15.30
const LINK_Z0 = CIRCUS_APPROACH_LINK.cz - CIRCUS_APPROACH_LINK.d / 2; // 6.75
const LINK_Z1 = CIRCUS_APPROACH_LINK.cz + CIRCUS_APPROACH_LINK.d / 2; // 9.75

/** Every pavement C-8.64B shipped (the four runs and the forecourt). */
const C64B_SURFACES: Array<{ id: string; box: Box }> = [
  ...DISTRICT_ROADS.map((r) => ({ id: r.id, box: boxOf(r) })),
  { id: CIRCUS_FORECOURT.id, box: boxOf(CIRCUS_FORECOURT) },
];

const APRON_BOX = boxOf(CIRCUS_LINK_MOUTH_APRON_RECT);

/** Is this point on the forum's own plaza paving, as drawn? */
const onPlazaPaving = (x: number, z: number): boolean =>
  Math.abs(z) <= PLAZA_R && Math.abs(x) <= plazaEdgeX(Math.abs(z));

/** Is this point paved by the surfaces C-8.64B shipped (the apron excluded)? */
const pavedBefore = (x: number, z: number): boolean =>
  onPlazaPaving(x, z) || C64B_SURFACES.some((s) => inBox(s.box, x, z));

/** Is this point paved as shipped (the apron included)? */
const pavedNow = (x: number, z: number): boolean => pavedBefore(x, z) || inBox(APRON_BOX, x, z);

// ══════════════════════════════════════════════════════════════════════════
// A. The seam, re-measured from the plaza's own source
// ══════════════════════════════════════════════════════════════════════════

describe('A. The forum-link seam as measured', () => {
  test('the plaza is the 36-gon the module records, and the link is a straight line', () => {
    expect(PLAZA_R).toBeCloseTo(FORUM_PLAZA_RADIUS, 9);
    expect(PLAZA_SEGMENTS).toBe(36);
    expect(PLAZA_Y).toBeCloseTo(0.005, 9);
    // The link's west face, derived from the shipped footprint.
    expect(LINK_WEST_X).toBeCloseTo(15.3, 9);
    expect(LINK_Z0).toBeCloseTo(6.75, 9);
    expect(LINK_Z1).toBeCloseTo(9.75, 9);
    // The module's recorded east reach is the *true circle*, and it is the
    // polygon's chords that the link actually meets.
    expect(FORUM_PLAZA_EAST_IN_LINK_BAND).toBeCloseTo(Math.sqrt(PLAZA_R ** 2 - LINK_Z0 ** 2), 2);
    expect(plazaEdgeX(LINK_Z0)).toBeLessThan(Math.sqrt(PLAZA_R ** 2 - LINK_Z0 ** 2));
  });

  test('the drawn gap widens across the band: 0.311 → 1.011 → 2.061', () => {
    expect(LINK_WEST_X - plazaEdgeX(LINK_Z0)).toBeCloseTo(0.311, 2); // 0.3111
    expect(LINK_WEST_X - plazaEdgeX(CIRCUS_APPROACH_LINK.cz)).toBeCloseTo(1.011, 2); // 1.0106
    expect(LINK_WEST_X - plazaEdgeX(LINK_Z1)).toBeCloseTo(2.061, 2); // 2.0609
    // The true-circle clearances C-8.64B recorded, restated as the smaller pair.
    const circle = (z: number): number => LINK_WEST_X - Math.sqrt(PLAZA_R ** 2 - z ** 2);
    expect(circle(LINK_Z0)).toBeCloseTo(0.244, 2);
    expect(circle(LINK_Z1)).toBeCloseTo(1.989, 2);
    // The drawn gap is never smaller than the true-circle one (a polygon's
    // chords sit inside its circle), and they coincide at the vertex Z 8.25.
    for (let z = LINK_Z0; z <= LINK_Z1 + 1e-9; z += 0.05) {
      expect(LINK_WEST_X - plazaEdgeX(z)).toBeGreaterThanOrEqual(circle(z) - 1e-9);
    }
    expect(plazaEdgeX(CIRCUS_APPROACH_LINK.cz)).toBeCloseTo(Math.sqrt(PLAZA_R ** 2 - 8.25 ** 2), 9);
  });

  test('the wedge is 3.295 sq units of bare sand under the city ground plane', () => {
    let area = 0;
    const ds = 0.001;
    let prev: number | null = null;
    for (let z = LINK_Z0; z <= LINK_Z1 + 1e-9; z += ds) {
      const gap = LINK_WEST_X - plazaEdgeX(z);
      if (prev !== null) area += ((gap + prev) / 2) * ds;
      prev = gap;
    }
    expect(area).toBeGreaterThan(3.29);
    expect(area).toBeLessThan(3.3);
    // What the player saw in that wedge was the city's own sand, 0.055 below
    // the plaza's surface — a paved break with a lip, not a continuation.
    expect(GROUND_PLANE_ELEVATION_Y).toBeCloseTo(-0.05, 9);
    expect(PLAZA_Y - GROUND_PLANE_ELEVATION_Y).toBeCloseTo(0.055, 9);
    expect(GROUND_PLANE_EAST_X).toBeGreaterThan(LINK_WEST_X + 1);
    expect(GROUND_PLANE_WEST_X).toBeLessThan(LINK_WEST_X - 1);
    expect(GROUND_PLANE_SOUTH_Z).toBeGreaterThan(LINK_Z1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The apron that closes it
// ══════════════════════════════════════════════════════════════════════════

describe('B. The link-mouth apron', () => {
  test('its east edge IS the link’s west face and its band IS the link’s band', () => {
    expect(CIRCUS_LINK_MOUTH_APRON.eastX).toBeCloseTo(LINK_WEST_X, 9);
    expect(CIRCUS_LINK_MOUTH_APRON.z0).toBeCloseTo(LINK_Z0, 9);
    expect(CIRCUS_LINK_MOUTH_APRON.z1).toBeCloseTo(LINK_Z1, 9);
    expect(APRON_BOX.x1).toBeCloseTo(LINK_WEST_X, 9);
    expect(APRON_BOX.x0).toBeCloseTo(CIRCUS_LINK_MOUTH_APRON.westX, 9);
    expect(APRON_BOX.z0).toBeCloseTo(LINK_Z0, 9);
    expect(APRON_BOX.z1).toBeCloseTo(LINK_Z1, 9);
    expect(CIRCUS_LINK_MOUTH_APRON_RECT.w).toBeCloseTo(LINK_WEST_X - CIRCUS_LINK_MOUTH_APRON.westX, 9);
    expect(CIRCUS_LINK_MOUTH_APRON_RECT.d).toBeCloseTo(LINK_Z1 - LINK_Z0, 9);
  });

  test('its west edge is inside the plaza’s rendered paving at every Z in the band', () => {
    let minMargin = Infinity;
    for (let z = LINK_Z0; z <= LINK_Z1 + 1e-9; z += 0.01) {
      minMargin = Math.min(minMargin, plazaEdgeX(z) - CIRCUS_LINK_MOUTH_APRON.westX);
    }
    // 0.1391 at the band's south edge — the plaza covers the join, so the slab
    // can never show a gap or a notch against the plaza's own edge.
    expect(minMargin).toBeGreaterThan(0.13);
    expect(minMargin).toBeCloseTo(0.14, 2);
  });

  test('it sits 2 mm under the plaza’s plane and well above the ground plane', () => {
    const y = CIRCUS_LINK_MOUTH_APRON.y;
    expect(y).toBeLessThan(PLAZA_Y);
    expect(PLAZA_Y - y).toBeCloseTo(0.002, 9);
    expect(y).toBeGreaterThan(GROUND_PLANE_ELEVATION_Y);
    expect(y - GROUND_PLANE_ELEVATION_Y).toBeCloseTo(0.053, 9);
    // The gilded ring (Y 0.008) and the plaza plane (0.005) both stand above it.
    expect(y).toBeLessThan(0.005);
  });

  test('it interpenetrates no other pavement — it only abuts the link', () => {
    const linkBox = boxOf(CIRCUS_APPROACH_LINK);
    const o = overlapBetween(APRON_BOX, linkBox);
    expect(o.x).toBeCloseTo(0, 9); // touching, not overlapping
    expect(o.z).toBeGreaterThan(0); // …across the link's own band
    for (const s of C64B_SURFACES) {
      const ov = overlapBetween(APRON_BOX, s.box);
      expect({ id: s.id, interpenetrates: ov.x > 1e-9 && ov.z > 1e-9 })
        .toMatchObject({ interpenetrates: false });
    }
  });

  test('it is pavement, not a wall: no collider is added or blocked', () => {
    expect(CITY_COLLIDERS.some((c) => c.id === CIRCUS_LINK_MOUTH_APRON.id)).toBe(false);
    expect(blocked(APRON_BOX)).toEqual([]);
    // The four runs and the plaza reach the same verdict for their own boxes.
    for (const s of C64B_SURFACES) {
      expect(blocked(s.box)).toEqual([]);
    }
  });

  test('the district draws it exactly once, in the plaza’s own stone', () => {
    expect(geometrySrc.includes('CIRCUS_LINK_MOUTH_APRON')).toBe(true);
    expect(districtSrc.includes("from '../../../utils/circusDistrictGeometry'")).toBe(true);
    // One mesh, one apron: the position reads the module's own numbers.
    expect(districtSrc.split('CIRCUS_LINK_MOUTH_APRON.y').length - 1).toBe(1);
    expect(districtSrc.split('CIRCUS_LINK_MOUTH_APRON_RECT').length - 1).toBe(5);
    // No literal footprint in the component, and the plaza's material is reused.
    expect(districtSrc.includes('13.1')).toBe(false);
    expect(districtSrc.includes('ROMAN_PALETTE.forumPaving')).toBe(true);
    // Nothing new beyond the mesh (the C-8.64B cost guard, re-checked).
    expect(districtSrc.includes('pointLight')).toBe(false);
    expect(districtSrc.includes('spotLight')).toBe(false);
    expect(districtSrc.includes('useState')).toBe(false);
    expect(districtSrc.includes('useFrame')).toBe(false);
    expect(districtSrc.includes('useGLTF')).toBe(false);
    const code = districtSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');
    expect(code.split('clone(').length - 1).toBe(1); // still only the forecourt bump map
    expect(code).toContain('NOISE_TEXTURE.clone()');
    expect(geometrySrc.includes("from 'three'")).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. The seam is walkable, in both directions, and the ring still refuses
// ══════════════════════════════════════════════════════════════════════════

describe('C. Driven routes across the seam', () => {
  test('the plaza → link route runs across the seam to the approach, collision-free', () => {
    // Starts ON the plaza's own paving, south of its centre, and walks east: the
    // whole wedge — which C-8.64B's suite could not cover, because its link walk
    // began at X 16.0, already east of the seam — is now crossed on pavement.
    const path = driven([13.0, 0, CIRCUS_APPROACH_LINK.cz], [1, 0], 40);
    expect(last(path)[0]).toBeGreaterThan(22.0);
    const xs = path.map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(13.0, 9);
    expect(Math.max(...xs)).toBeGreaterThan(LINK_WEST_X); // the seam was crossed
    clearOf(path);
    insideEnvelope(path);
  });

  test('the link → plaza route runs in reverse, collision-free', () => {
    const path = driven([17.0, 0, CIRCUS_APPROACH_LINK.cz], [-1, 0], 20);
    expect(last(path)[0]).toBeLessThan(13.6);
    clearOf(path);
    insideEnvelope(path);
  });

  test('every centre across the apron’s usable band is standable', () => {
    let samples = 0;
    for (let x = 13.15; x <= LINK_WEST_X - 0.05 + 1e-9; x += 0.1) {
      for (let z = 7.05; z <= 9.5 + 1e-9; z += 0.1) {
        expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
        samples++;
      }
    }
    expect(samples).toBeGreaterThan(500);
  });

  test('a walk across the apron at three Z values stays collision-free', () => {
    for (const z of [7.1, 8.25, 9.4]) {
      const east = driven([13.3, 0, z], [1, 0], 18);
      expect(last(east)[0]).toBeGreaterThan(17.0);
      clearOf(east);
      insideEnvelope(east);
      const west = driven([17.2, 0, z], [-1, 0], 18);
      expect(last(west)[0]).toBeLessThan(13.8);
      clearOf(west);
      insideEnvelope(west);
    }
  });

  test('the arena’s closed ring still refuses entry through the carceres end', () => {
    // Northward out of the forecourt, across the whole carceres width.
    for (const x of [45.0, 50.25, 55.0, 60.0]) {
      const path = driven([x, 0, 52.5], [0, -1], 30);
      const end = last(path);
      expect(end[2]).toBeGreaterThan(CIRCUS_CARCERES_FRONT_Z);
      // Stopped on the last clear 0.38 step outside the block's own face plane.
      expect(end[2]).toBeLessThan(CIRCUS_CARCERES_FRONT_Z + 1.0);
      clearOf(path);
      insideEnvelope(path);
    }
    // The ring is still C-8.64A's closed 31-segment perimeter.
    expect(circusPerimeter.length).toBe(31);
    expect(circusPerimeter.every((c) => c.type === 'segment')).toBe(true);
    expect(CIRCUS_WEST_OUTLINE.length).toBe(13);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. What did not move
// ══════════════════════════════════════════════════════════════════════════

describe('D. Preservation', () => {
  test('the registry is unchanged by this phase', () => {
    expect(CITY_COLLIDERS.length).toBe(142);
    expect(rects.length).toBe(32);
    expect(circusPerimeter.length).toBe(31);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-')).length).toBe(46);
    expect(new Set(CITY_COLLIDERS.map((c) => c.id)).size).toBe(CITY_COLLIDERS.length);
  });

  test('the four runs, the forecourt, the parapet and the kerbs are C-8.64B’s', () => {
    expect(DISTRICT_ROADS.length).toBe(4);
    const app = boxOf(CIRCUS_APPROACH);
    expect(app.x0).toBeCloseTo(FORGE_EAST_X, 9);
    expect(app.x1).toBeCloseTo(38.0, 9);
    expect(app.z0).toBeCloseTo(4.5, 9);
    expect(app.z1).toBeCloseTo(10.5, 9);
    expect(boxOf(CIRCUS_APPROACH_LINK).x0).toBeCloseTo(LINK_WEST_X, 9);
    expect(boxOf(CIRCUS_APPROACH_LINK).z0).toBeCloseTo(FORGE_NORTH_Z + 0.15, 9);
    expect(boxOf(CIRCUS_APPROACH_LINK).z1).toBeCloseTo(CARAVANSERAI_SOUTH_Z - 0.2, 9);
    expect(boxOf(CIRCUS_VIA).x0).toBeCloseTo(BOUNDARY_X, 9);
    expect(boxOf(CIRCUS_SERVICE_LANE).x0).toBeCloseTo(STABLE_EAST_X, 9);
    expect(boxOf(CIRCUS_FORECOURT).x0).toBeCloseTo(BOUNDARY_X, 9);
    expect(CIRCUS_FORECOURT_PARAPET.cx).toBeCloseTo(50.25, 9);
    expect(CIRCUS_FORECOURT_PARAPET.cz + CIRCUS_FORECOURT_PARAPET.d / 2).toBeCloseTo(CIRCUS_ENVELOPE_Z_MAX, 9);
    expect(DISTRICT_KERBS.length).toBe(4);
    expect(KERB_HEIGHT).toBeCloseTo(0.16, 9);
  });

  test('the movement envelope is exactly C-8.64B’s', () => {
    expect(CIRCUS_ENVELOPE_Z_MAX).toBeCloseTo(55.0, 9);
    expect(CIRCUS_ENVELOPE_X_EAST).toBeCloseTo(67.5, 9);
    // The apron changes no limit: it is inside the city square's own Z range and
    // its east edge is far west of both the city and the district limit.
    expect(APRON_BOX.x1).toBeLessThan(BOUNDARY_X);
    expect(APRON_BOX.z1).toBeLessThan(CIRCUS_ENVELOPE_Z_MAX);
    expect(APRON_BOX.x0).toBeGreaterThan(GROUND_PLANE_WEST_X);
  });

  test('the arena asset, its transform and its ring are untouched', () => {
    const blob = createHash('sha1')
      .update(`blob ${GLB_BYTES.length}\0`, 'utf8')
      .update(GLB_BYTES)
      .digest('hex');
    expect(blob).toBe('d701424aab906c0b6af850cb7874505efe3d4809');
    expect(arenaSrc).toContain('[52.34, -0.05, 43.8]');
    expect(arenaSrc).toContain('Math.PI / 2');
    expect(arenaSrc).toContain('0.2');
    expect(districtSrc.includes('_workspace_arena.glb')).toBe(false);
    expect(sceneSrc.split('<EastCircusDistrict').length - 1).toBe(1);
    expect(sceneSrc.split('<EastCircusArena').length - 1).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. The control — the wedge was bare, and the apron is what covers it
// ══════════════════════════════════════════════════════════════════════════

describe('E. Control: the apron is load-bearing', () => {
  /**
   * Every sample of the bare wedge the plaza's drawn edge leaves: from just east
   * of the polygon's own boundary to just inside the link's west face, across
   * the link's whole Z band.  Both ends are kept strictly inside the wedge so
   * the set is the same in both frames.
   */
  const wedgeSamples = (): Array<[number, number]> => {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= 60; i++) {
      const z = Math.min(LINK_Z0 + i * 0.05, LINK_Z1 - 1e-6);
      const edge = plazaEdgeX(z);
      for (let j = 0; j <= 42; j++) {
        pts.push([Math.min(edge + 0.01 + j * 0.05, LINK_WEST_X - 1e-3), z]);
      }
    }
    return pts;
  };

  test('the pre-fix pavement set leaves every wedge sample bare', () => {
    const pts = wedgeSamples();
    expect(pts.length).toBeGreaterThan(1000);
    for (const [x, z] of pts) {
      expect(pavedBefore(x, z)).toBe(false);
    }
  });

  test('the shipped pavement set covers every one of those samples', () => {
    const pts = wedgeSamples();
    expect(pts.length).toBeGreaterThan(1000);
    for (const [x, z] of pts) {
      expect(pavedNow(x, z)).toBe(true);
    }
  });

  test('the gilded ring lies wholly on the plaza’s own paving, so the apron cannot notch it', () => {
    const ring = /<ringGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*(\d+)\]\}\s*\/>/.exec(plazaSrc);
    expect(ring).not.toBeNull();
    const innerR = Number(ring![1]);
    const outerR = Number(ring![2]);
    const ringSegments = Number(ring![3]);
    expect(innerR).toBeCloseTo(15.8, 9);
    expect(outerR).toBeCloseTo(PLAZA_R, 9); // the ring's outer polygon IS the plaza's own
    expect(ringSegments).toBe(PLAZA_SEGMENTS);
    expect(PLAZA_Y).toBeLessThan(0.008); // the ring stands above the plaza's plane
    // A polar sweep of the ring's own annulus, safely inside both of its polygon
    // boundaries: the plaza's paving lies under every sample, so the apron —
    // 2 mm below the plaza and 5 mm below the ring — can never notch the gold.
    let samples = 0;
    for (let i = 0; i <= 180; i++) {
      const theta = (i / 180) * Math.PI;
      for (let rr = innerR + 0.15; rr <= outerR - 0.2 + 1e-9; rr += 0.15) {
        expect(onPlazaPaving(rr * Math.cos(theta), rr * Math.sin(theta))).toBe(true);
        samples++;
      }
    }
    expect(samples).toBeGreaterThan(400);
  });
});
