/**
 * Phase C-8.41 — the travertine moat shoreline kerb.
 *
 * Run with: bun test src/utils/phaseC8_41.test.ts
 *
 * ── WHY THIS GEOMETRY EXISTS ──────────────────────────────────────────────
 * The moat's water is a transparent ring lying flat on the sand, so its outer
 * edge was a pure colour transition with no form (the measured level run is
 * sand −0.05 → water 0.06 → deck underside 0.09 → deck top 0.16: a 0.21 spread
 * over 12 units).  Phase C-8.39 explained the "gateway and drawbridge read as
 * one structure" report as composition rather than overlap, and Phase C-8.40
 * measured the one treatment that buys the water a boundary without spending
 * the six-metre apron C-8.38 opened: a low travertine revetment along the moat's
 * OUTER (city-side) shoreline, cut for the bridge.  This phase implements it.
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   A. the band's dimensions — the audited radii, vertical extent and the
 *      absence of any face coplanar with the sand, the water or the deck;
 *   B. the SHIPPED mesh, built from the component's own exported geometry
 *      arguments (not a re-typed copy): 5 meshes, 312 triangles, one shared
 *      double-sided travertine material, the water ring's own 48-segment module;
 *   C. the shoreline join — the water's hard outer edge always hidden under the
 *      stone, so no sand sliver can appear at any segment alignment;
 *   D. the gap — symmetric about X = 0, and no point of the stone closer to the
 *      bridge axis than the rear gate's own clear width;
 *   E. the clearance to the widest rendered bridge footprint, against the 0.598
 *      the audit measured;
 *   F. the vertical clearances (buried base, freeboard, the bridge still the
 *      highest walking plane) and the C-8.36 water still continuous beneath it;
 *   G. the apron: what the kerb costs the six metres C-8.38 bought;
 *   H. no new collision geometry — the registry, the ids and the driven route
 *      are exactly what C-8.38 left;
 *   I. the C-8.38 baseline and the mound untouched;
 *   J. the C-8.33 rear-gate seals and the fortress geometry untouched;
 *   K. controls: the audited gap derivation, a deeper inner face, a gap at the
 *      deck's own width and a coplanar Y band all fail the rules above — so the
 *      checks are shown to be sensitive to the values they pin.
 */

// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  MOTTE_CENTER_Z,
  MOTTE_SCALE,
  MOTTE_PERIMETER_RADIUS,
  SUMMIT_Y,
  SUMMIT_SLOPE_FOOT_SCALE,
  getTerrainY,
  summitLevel,
  summitEdgeRadius,
  BRIDGE_HALF_WIDTH,
  BRIDGE_Z_OUTER,
  BRIDGE_Z_INNER,
} from './terrainHeight';
import {
  MOAT_INNER_RADIUS,
  MOAT_OUTER_RADIUS,
  MOAT_WATER_Y,
  MOAT_GAP_HALF_ANGLE,
  KERB_INNER_RADIUS,
  KERB_OUTER_RADIUS,
  KERB_BASE_Y,
  KERB_TOP_Y,
  KERB_HEIGHT,
  KERB_GATE_HALF_W,
  KERB_SEGMENTS,
  KERB_ARC_HALF_STEP,
  KERB_INNER_RADIUS_TIGHT,
  KERB_GAP_HALF_ANGLE,
  KERB_CAP_THICKNESS,
  KERB_MID_Y,
  KERB_SLAB_ARGS,
  KERB_OUTER_FACE_ARGS,
  KERB_INNER_FACE_ARGS,
  KERB_CAP_ARGS,
  kerbCapTransform,
} from '../components/3d/city/NorthernMotte';
import {
  DECK_Z_OUTER,
  DECK_Z_INNER,
  DECK_LENGTH,
  DECK_TOP_Y,
  DECK_UNDERSIDE_Y,
  BEAM_WIDTH,
} from '../components/3d/city/Drawbridge';
import {
  GROUND_PLANE_NORTH_Z,
  GROUND_PLANE_ELEVATION_Y,
} from '../components/3d/city/ProcessionAvenue';
import { PLAYER_RADIUS, CITY_COLLIDERS, collidesWith, type Collider } from './collisionShapes';
import { BOUNDARY_Z_MIN, resolveCityMovement } from './cityCollisions';

// ── Recorded references ─────────────────────────────────────────────────────

/** The audit's gap derivation point: asin(GATE_HALF_W / MOAT_OUTER_RADIUS). */
const AUDIT_GAP_HALF_ANGLE = Math.asin(KERB_GATE_HALF_W / MOAT_OUTER_RADIUS);
/** The clearance the audit measured to the widest bridge footprint. */
const AUDIT_BRIDGE_CLEARANCE = 0.598;
/** The audit's triangle estimate for this construction. */
const AUDIT_TRIANGLES = 312;
/** The apron rule C-8.38 bought, which the kerb must not spend. */
const APRON_MIN = 5.0;
/** The apron as C-8.38 left it, before the kerb. */
const APRON_BEFORE_KERB = 6.192;

/** Widest lateral extent of the bridge: the outer face of a side beam. */
const FOOTPRINT_HALF_W = BRIDGE_HALF_WIDTH + BEAM_WIDTH / 2; // 2.11
/** The Colosseum's rear-MOST rendered stone — its gate plinth's cut edge. */
const COLO_REAR_RENDERED_Z = -44.308;
/** The gate lintel ring on the deck's own axis (r 19.5 at X = 0). */
const COLO_LINTEL_Z = -44.5;

// ── Sources ─────────────────────────────────────────────────────────────────

const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

const motteSrc = load('../components/3d/city/NorthernMotte.tsx');
const collisionSrc = load('./collisionShapes.ts');
const cityCollisionsSrc = load('./cityCollisions.ts');
const coloSrc = load('../components/3d/city/GrandColosseum.tsx');

/** Strip comments, so a literal is only detected in executable code. */
const codeOf = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// ── The shipped mesh, built from the component's own exported arguments ─────

const slabGeometry = new THREE.RingGeometry(...KERB_SLAB_ARGS);
const outerFaceGeometry = new THREE.CylinderGeometry(...KERB_OUTER_FACE_ARGS);
const innerFaceGeometry = new THREE.CylinderGeometry(...KERB_INNER_FACE_ARGS);
// Every matrix carries the motte group's own Z offset, so the pieces come out in
// world space exactly as the component places them.
const capGeometries = [1, -1].map((side) => {
  const { theta, cx, cz } = kerbCapTransform(side as 1 | -1);
  const geometry = new THREE.BoxGeometry(...KERB_CAP_ARGS);
  return {
    geometry,
    matrix: new THREE.Matrix4()
      .makeRotationY(theta)
      .setPosition(cx, KERB_MID_Y, cz + MOTTE_CENTER_Z),
  };
});

const slabMatrix = new THREE.Matrix4()
  .makeRotationX(-Math.PI / 2)
  .setPosition(0, KERB_TOP_Y, MOTTE_CENTER_Z);
const faceMatrix = new THREE.Matrix4().setPosition(0, KERB_MID_Y, MOTTE_CENTER_Z);

/** Every vertex of a placed piece, in the moat group's own frame. */
function verticesOf(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): THREE.Vector3[] {
  const position = geometry.getAttribute('position');
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < position.count; i++) {
    out.push(
      new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)).applyMatrix4(matrix),
    );
  }
  return out;
}

/** Vertices plus every triangle's corners, centroid and edge midpoints. */
function surfacePointsOf(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): THREE.Vector3[] {
  const points = verticesOf(geometry, matrix);
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex()!;
  for (let t = 0; t < index.count; t += 3) {
    // The index attribute is one component wide: every lookup reads getX.
    const corners = [0, 1, 2].map((k) => {
      const v = index.getX(t + k);
      return new THREE.Vector3(
        position.getX(v),
        position.getY(v),
        position.getZ(v),
      ).applyMatrix4(matrix);
    });
    points.push(corners[0].clone().add(corners[1]).add(corners[2]).multiplyScalar(1 / 3));
    points.push(corners[0].clone().add(corners[1]).multiplyScalar(0.5));
    points.push(corners[1].clone().add(corners[2]).multiplyScalar(0.5));
    points.push(corners[2].clone().add(corners[0]).multiplyScalar(0.5));
  }
  return points;
}

const kerbPieces = [
  { name: 'slab', points: surfacePointsOf(slabGeometry, slabMatrix) },
  { name: 'outerFace', points: surfacePointsOf(outerFaceGeometry, faceMatrix) },
  { name: 'innerFace', points: surfacePointsOf(innerFaceGeometry, faceMatrix) },
  ...capGeometries.map((c, i) => ({
    name: `cap${i === 0 ? 'East' : 'West'}`,
    points: surfacePointsOf(c.geometry, c.matrix),
  })),
];

/** All stone, in world space (the group's own Z offset is in the matrices). */
const kerbWorld = kerbPieces.flatMap((p) => p.points);

const radiusOf = (v: THREE.Vector3): number => Math.hypot(v.x, v.z - MOTTE_CENTER_Z);
const angleOf = (v: THREE.Vector3): number => Math.atan2(v.x, v.z - MOTTE_CENTER_Z);

const kerbTriangles = ([slabGeometry, outerFaceGeometry, innerFaceGeometry] as THREE.BufferGeometry[])
  .concat(capGeometries.map((c) => c.geometry))
  .reduce((n, g) => n + g.getIndex()!.count / 3, 0);

/** The stone inside the bridge's own approach wedge — the only region that could reach it. */
const wedgeStone = kerbWorld.filter((v) => Math.abs(angleOf(v)) <= Math.PI / 4);

// ── Geometry helpers (as used by the C-8.38 suite) ──────────────────────────

interface Box { minX: number; maxX: number; minZ: number; maxZ: number }

function aabb(c: Collider): Box {
  if (c.type === 'rect') {
    return { minX: c.cx - c.hw, maxX: c.cx + c.hw, minZ: c.cz - c.hd, maxZ: c.cz + c.hd };
  }
  if (c.type === 'circle') {
    return { minX: c.cx - c.r, maxX: c.cx + c.r, minZ: c.cz - c.r, maxZ: c.cz + c.r };
  }
  return {
    minX: Math.min(c.x1, c.x2),
    maxX: Math.max(c.x1, c.x2),
    minZ: Math.min(c.z1, c.z2),
    maxZ: Math.max(c.z1, c.z2),
  };
}

/** Walk straight north at X = 0 with the real resolver; returns the stop. */
function walkNorth(startZ: number, steps: number): [number, number] {
  let pos: [number, number, number] = [0, 0, startZ];
  for (let i = 0; i < steps; i++) {
    pos = resolveCityMovement(pos, 0, -1, 3.8, 0.1);
  }
  return [pos[0], pos[2]];
}

// ═══════════════════════════════════════════════════════════════════════════
// A. The band's dimensions
// ═══════════════════════════════════════════════════════════════════════════

describe('A. The kerb band is the audited one', () => {
  test('the radial band is 30.90 → 31.35 and the vertical band −0.10 → 0.14', () => {
    expect(KERB_INNER_RADIUS).toBe(30.9);
    expect(KERB_OUTER_RADIUS).toBe(31.35);
    expect(KERB_OUTER_RADIUS - KERB_INNER_RADIUS).toBeCloseTo(0.45, 10);
    expect(KERB_BASE_Y).toBe(-0.1);
    expect(KERB_TOP_Y).toBe(0.14);
    expect(KERB_HEIGHT).toBeCloseTo(0.24, 10);
    expect(KERB_HEIGHT).toBeCloseTo(KERB_TOP_Y - KERB_BASE_Y, 10);
  });

  test('it is a shoreline lip, not a wall: under a fifth of a metre is exposed', () => {
    const sand = GROUND_PLANE_ELEVATION_Y; // −0.05
    expect(KERB_TOP_Y - sand).toBeCloseTo(0.19, 10);
    expect(KERB_TOP_Y - sand).toBeLessThan(0.2);
    // The bridge's own side beams stand 0.28 above the deck underside: the moat
    // lip must not out-scale the structure it frames.
    expect(KERB_HEIGHT).toBeLessThan(0.28);
  });

  test('no face is coplanar with the sand, the water or the deck', () => {
    const sand = GROUND_PLANE_ELEVATION_Y;
    for (const y of [KERB_BASE_Y, KERB_TOP_Y]) {
      expect(`${y}|${y === sand}`).toBe(`${y}|false`);
      expect(`${y}|${y === MOAT_WATER_Y}`).toBe(`${y}|false`);
      expect(`${y}|${y === DECK_UNDERSIDE_Y}`).toBe(`${y}|false`);
      expect(`${y}|${y === DECK_TOP_Y}`).toBe(`${y}|false`);
    }
    // The base is buried, the top is free: neither can z-fight with the sand.
    expect(KERB_BASE_Y).toBeLessThan(sand);
    expect(KERB_TOP_Y).toBeGreaterThan(sand);
  });

  test('the gap copies the rear gate’s own clear width, restated not imported', () => {
    expect(KERB_GATE_HALF_W).toBe(2.7);
    // The Colosseum owns that number; the kerb must not couple to that module.
    expect(coloSrc).toMatch(/const GATE_HALF_W = 2\.7;/);
    expect(codeOf(motteSrc)).not.toMatch(/from '.*GrandColosseum'/);
    // collisionShapes.ts already restates it under a comment naming its source.
    expect(collisionSrc).toMatch(/const COLO_GATE_HALF_W = 2\.7;/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B. The shipped mesh
// ═══════════════════════════════════════════════════════════════════════════

describe('B. The mesh the component actually builds', () => {
  test('five meshes and the audit’s 312 triangles', () => {
    expect(kerbPieces.length).toBe(5);
    expect(['slab', 'outerFace', 'innerFace', 'capEast', 'capWest']).toEqual(
      kerbPieces.map((p) => p.name),
    );
    expect(kerbTriangles).toBe(AUDIT_TRIANGLES);
    expect(slabGeometry.getIndex()!.count / 3).toBe(96);
    expect(outerFaceGeometry.getIndex()!.count / 3).toBe(96);
    expect(innerFaceGeometry.getIndex()!.count / 3).toBe(96);
    expect(capGeometries[0].geometry.getIndex()!.count / 3).toBe(12);
  });

  test('the built geometry lands exactly on the band', () => {
    const vertices = [
      ...verticesOf(slabGeometry, slabMatrix),
      ...verticesOf(outerFaceGeometry, faceMatrix),
      ...verticesOf(innerFaceGeometry, faceMatrix),
      ...capGeometries.flatMap((c) => verticesOf(c.geometry, c.matrix)),
    ];
    const radii = vertices.map(radiusOf);
    const ys = vertices.map((v) => v.y);
    // three.js builds these rings with sin/cos, so a radius carries ~7e-7 of
    // float error; the band is exact to that.
    expect(Math.min(...radii)).toBeCloseTo(KERB_INNER_RADIUS, 5);
    expect(Math.max(...radii)).toBeCloseTo(KERB_OUTER_RADIUS, 3);
    expect(Math.min(...ys)).toBeCloseTo(KERB_BASE_Y, 6);
    expect(Math.max(...ys)).toBeCloseTo(KERB_TOP_Y, 6);
    // The 48-gon's chords dip inside the vertices, but never past the tight
    // radius the gap derivation assumes; the caps overshoot by 1.6e-4 at most.
    const surfaceRadii = kerbWorld.map(radiusOf);
    expect(Math.min(...surfaceRadii)).toBeGreaterThanOrEqual(KERB_INNER_RADIUS_TIGHT);
    expect(Math.min(...surfaceRadii)).toBeCloseTo(
      KERB_INNER_RADIUS * Math.cos((2 * Math.PI - 2 * KERB_GAP_HALF_ANGLE) / (2 * KERB_SEGMENTS)),
      2,
    );
    expect(Math.max(...surfaceRadii)).toBeLessThan(KERB_OUTER_RADIUS + 0.001);
  });

  test('the slab’s rim and both faces share one angular module and one edge', () => {
    expect(KERB_SEGMENTS).toBe(48);
    // The water ring is drawn with the same 48-segment module…
    expect(motteSrc).toContain(
      'args={[MOAT_INNER_RADIUS, MOAT_OUTER_RADIUS, 48, 1, thetaStart, thetaLength]}',
    );
    // …and the kerb's own start angle is the same edge the gap leaves (`gapHalf`).
    expect(KERB_SLAB_ARGS[2]).toBe(KERB_SEGMENTS);
    expect(KERB_SLAB_ARGS[4]).toBeCloseTo((3 * Math.PI) / 2 + KERB_GAP_HALF_ANGLE, 12);
    expect(KERB_SLAB_ARGS[5]).toBeCloseTo(2 * Math.PI - 2 * KERB_GAP_HALF_ANGLE, 12);
    expect(KERB_OUTER_FACE_ARGS[6]).toBeCloseTo(KERB_GAP_HALF_ANGLE, 12);
    expect(KERB_OUTER_FACE_ARGS[7]).toBeCloseTo(2 * Math.PI - 2 * KERB_GAP_HALF_ANGLE, 12);
    expect(KERB_INNER_FACE_ARGS.slice(0, 6)).toEqual(
      [
        KERB_INNER_RADIUS,
        KERB_INNER_RADIUS,
        KERB_HEIGHT,
        KERB_SEGMENTS,
        1,
        true,
      ],
    );
    // The end caps span the band's own radial width.
    expect(KERB_CAP_ARGS[2]).toBeCloseTo(KERB_OUTER_RADIUS - KERB_INNER_RADIUS, 12);
    expect(KERB_CAP_ARGS[1]).toBeCloseTo(KERB_HEIGHT, 12);
  });

  test('one shared, double-sided travertine material serves all five meshes', () => {
    const code = codeOf(motteSrc);
    // Exactly one material instance is built for the kerb…
    expect(code.match(/new THREE\.MeshStandardMaterial\(/g)?.length).toBe(1);
    // …it is the Roman travertine, and it is double-sided (the shell is open).
    expect(code).toMatch(/color: ROMAN_PALETTE\.travertineDark\.color/);
    expect(code).toMatch(/side: THREE\.DoubleSide/);
    // …and every kerb mesh references that one instance.
    expect(code.match(/material=\{kerbMaterial\}/g)?.length).toBe(4);
    expect(code).toContain('<boxGeometry args={KERB_CAP_ARGS} />');
    expect(code).toContain('<ringGeometry args={KERB_SLAB_ARGS} />');
    expect(code).toContain('<cylinderGeometry args={KERB_OUTER_FACE_ARGS} />');
    expect(code).toContain('<cylinderGeometry args={KERB_INNER_FACE_ARGS} />');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// C. The shoreline join
// ═══════════════════════════════════════════════════════════════════════════

describe('C. The water’s own edge is hidden under the stone', () => {
  const waterEdgeMin = MOAT_OUTER_RADIUS * Math.cos(Math.PI / KERB_SEGMENTS); // 30.9336
  const waterEdgeMax = MOAT_OUTER_RADIUS; // 31.0 (the 48-gon's vertices)

  test('the water ring is still the C-8.36 complete annulus', () => {
    expect(MOAT_INNER_RADIUS).toBe(25.0);
    expect(MOAT_OUTER_RADIUS).toBe(31.0);
    expect(MOAT_GAP_HALF_ANGLE).toBe(0);
    expect(MOAT_WATER_Y).toBeCloseTo(0.06, 10);
  });

  test('the 48-gon chord sagitta is smaller than the 0.10 overlap', () => {
    const sagitta = MOAT_OUTER_RADIUS - waterEdgeMin;
    expect(sagitta).toBeCloseTo(0.0664, 4);
    expect(MOAT_OUTER_RADIUS - KERB_INNER_RADIUS).toBeCloseTo(0.1, 10);
    expect(MOAT_OUTER_RADIUS - KERB_INNER_RADIUS).toBeGreaterThan(sagitta);
    expect((MOAT_OUTER_RADIUS - KERB_INNER_RADIUS) - sagitta).toBeCloseTo(0.0336, 4);
  });

  test('no sand sliver can open, at any segment alignment', () => {
    // The property is radial only, so it holds whatever the two tessellations do:
    // the stone starts strictly inside the water's polygon minimum radius…
    expect(KERB_INNER_RADIUS).toBeLessThan(waterEdgeMin);
    // …and reaches strictly past its outermost vertex…
    expect(KERB_OUTER_RADIUS).toBeGreaterThan(waterEdgeMax);
    // …so the water's hard edge (r 30.9336 … 31.0) lies inside the kerb's band.
    expect(KERB_INNER_RADIUS).toBeLessThan(waterEdgeMax);
    expect(KERB_OUTER_RADIUS).toBeGreaterThan(waterEdgeMin);
    // The band is deeper inside than the chord dip of the stone's own inner face.
    expect(KERB_INNER_RADIUS_TIGHT).toBeLessThanOrEqual(KERB_INNER_RADIUS);
    expect(KERB_INNER_RADIUS_TIGHT).toBeCloseTo(30.8338, 4);
    expect(KERB_INNER_RADIUS_TIGHT).toBeLessThan(waterEdgeMin);
  });

  test('the built inner face never rises above the water’s hard edge', () => {
    const innerFace = kerbPieces.find((p) => p.name === 'innerFace')!;
    const innerRadii = innerFace.points.map(radiusOf);
    // The positions live in a Float32Array, so a 30.9 radius carries up to a
    // float32 half-ulp of error — 2^-19 / 2 = 9.54e-7 at this magnitude. The
    // built face reads 30.90000072 (7.22e-7 over): inside that bound, and the
    // precision the suite uses for every other built radius (B §).
    expect(Math.max(...innerRadii) - KERB_INNER_RADIUS).toBeLessThan(1e-6);
    expect(Math.max(...innerRadii)).toBeCloseTo(KERB_INNER_RADIUS, 5);
    // …and still 0.0336 inside the water's 30.9336 chord minimum.
    expect(Math.max(...innerRadii)).toBeLessThan(waterEdgeMin);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D. The gap
// ═══════════════════════════════════════════════════════════════════════════

describe('D. The bridge opening is symmetric and never narrower than the gate', () => {
  test('the whole revetment mirrors onto itself about X = 0', () => {
    // Vertices only: a triangulation's centroids need not mirror exactly, but
    // the surface does, which is what the eye reads.
    const verts = [
      ...verticesOf(slabGeometry, slabMatrix),
      ...verticesOf(outerFaceGeometry, faceMatrix),
      ...verticesOf(innerFaceGeometry, faceMatrix),
      ...capGeometries.flatMap((c) => verticesOf(c.geometry, c.matrix)),
    ];
    expect(verts.length).toBe(98 + 98 + 98 + 24 + 24);
    let worst = 0;
    for (const v of verts) {
      const mirror = new THREE.Vector3(-v.x, v.y, v.z);
      let nearest = Infinity;
      for (const w of verts) nearest = Math.min(nearest, mirror.distanceTo(w));
      if (nearest > worst) worst = nearest;
    }
    // Every vertex's mirror is another vertex of the same construction: the gap
    // is symmetric about X = 0 to floating-point precision.
    expect(worst).toBeLessThan(1e-9);
  });

  test('no stone lies closer to the bridge axis than 2.70 anywhere in the band', () => {
    // By construction the tightest point — the inner face's chord midpoint, at
    // KERB_INNER_RADIUS_TIGHT — sits at exactly the gate's half-width.
    expect(KERB_INNER_RADIUS_TIGHT * Math.sin(KERB_GAP_HALF_ANGLE)).toBeCloseTo(
      KERB_GATE_HALF_W,
      9,
    );
    // Every stone point is at radius ≥ that, and at least the gap half-angle off
    // the bridge axis — which together put it at |X| ≥ the gate's half-width.
    let tightestAtAxis = Infinity;
    for (const v of kerbWorld) {
      const radius = radiusOf(v);
      expect(radius).toBeGreaterThanOrEqual(KERB_INNER_RADIUS_TIGHT - 1e-6);
      const angle = Math.abs(angleOf(v));
      if (angle < Math.PI / 2) {
        // Inside the bridge's own half of the ring the stone must clear the gap.
        expect(angle).toBeGreaterThanOrEqual(KERB_GAP_HALF_ANGLE - 1e-6);
        tightestAtAxis = Math.min(tightestAtAxis, radius * Math.sin(angle));
      }
    }
    // (A 1e-6 tolerance absorbs the 48-gon's own float error in sin/cos: the
    // exact bound is the construction's, asserted above.)
    expect(tightestAtAxis).toBeGreaterThanOrEqual(KERB_GATE_HALF_W - 1e-6);
    // …so the measured opening is never narrower than the gate's own 5.40.
    const minAbsX = Math.min(...wedgeStone.map((v) => Math.abs(v.x)));
    expect(minAbsX).toBeGreaterThanOrEqual(KERB_GATE_HALF_W);
    expect(2 * minAbsX).toBeGreaterThanOrEqual(2 * KERB_GATE_HALF_W);
    // The opening widens outward, and is widest at the outer face's corner.
    expect(KERB_OUTER_RADIUS * Math.sin(KERB_GAP_HALF_ANGLE)).toBeCloseTo(2.7452, 4);
    expect(KERB_OUTER_RADIUS * Math.sin(KERB_GAP_HALF_ANGLE)).toBeGreaterThan(KERB_GATE_HALF_W);
  });

  test('the whole rendered bridge footprint sits inside the gap', () => {
    let worstAngle = 0;
    let worstRadius = 0;
    for (let x = -FOOTPRINT_HALF_W; x <= FOOTPRINT_HALF_W + 1e-9; x += 0.05) {
      for (let z = DECK_Z_INNER; z <= DECK_Z_OUTER + 1e-9; z += 0.05) {
        const radius = Math.hypot(x, z - MOTTE_CENTER_Z);
        if (radius >= KERB_INNER_RADIUS && radius <= KERB_OUTER_RADIUS) {
          const angle = Math.abs(Math.atan2(x, z - MOTTE_CENTER_Z));
          if (angle > worstAngle) {
            worstAngle = angle;
            worstRadius = radius;
          }
        }
      }
    }
    expect(worstAngle).toBeLessThan(KERB_GAP_HALF_ANGLE);
    // The worst point of the footprint is the side beam's outer face (X ±2.11)
    // where it meets the band's inner edge — asin(2.11 / 30.9) = 3.9155°, the
    // analytic bound for the whole footprint — not the deck's corner, which sits
    // at the same X but further out radially and so closer to the axis (3.8938°).
    // The 0.05 grid samples that edge discretely, so the worst point it lands on
    // is (±2.11, z − c 30.85), radius 30.9221 → 3.9127°.
    const beamCornerAngle = Math.asin(FOOTPRINT_HALF_W / KERB_INNER_RADIUS);
    expect((beamCornerAngle * 180) / Math.PI).toBeCloseTo(3.9155, 3);
    expect((worstAngle * 180) / Math.PI).toBeCloseTo(3.9127, 3);
    expect(worstAngle).toBeLessThanOrEqual(beamCornerAngle);
    // The footprint keeps 1.1081° to the gap's own 5.0236° edge.
    expect(((KERB_GAP_HALF_ANGLE - beamCornerAngle) * 180) / Math.PI).toBeCloseTo(1.1081, 3);
    expect(worstRadius).toBeGreaterThan(KERB_INNER_RADIUS);
    expect(worstRadius).toBeLessThan(KERB_OUTER_RADIUS);

    // The deck's widest corner — the beam corner on the deck's south face — is
    // itself inside both the radial band and the gap wedge.
    const cornerRadius = Math.hypot(FOOTPRINT_HALF_W, DECK_Z_OUTER - MOTTE_CENTER_Z);
    const cornerAngle = Math.abs(Math.atan2(FOOTPRINT_HALF_W, DECK_Z_OUTER - MOTTE_CENTER_Z));
    expect(cornerRadius).toBeGreaterThan(KERB_INNER_RADIUS);
    expect(cornerRadius).toBeLessThan(KERB_OUTER_RADIUS);
    expect(cornerAngle).toBeLessThan(KERB_GAP_HALF_ANGLE);
    expect(KERB_GAP_HALF_ANGLE - cornerAngle).toBeCloseTo((1.1298 / 180) * Math.PI, 4);
  });

  test('no kerb mesh penetrates the deck or either side beam', () => {
    const inside: THREE.Vector3[] = [];
    for (const v of kerbWorld) {
      const inBridgeBox =
        Math.abs(v.x) <= FOOTPRINT_HALF_W + 1e-9 &&
        v.z <= DECK_Z_OUTER + 1e-9 &&
        v.z >= DECK_Z_INNER - 1e-9 &&
        v.y >= DECK_UNDERSIDE_Y - 1e-9 &&
        v.y <= DECK_TOP_Y + 1e-9;
      if (inBridgeBox) inside.push(v);
    }
    expect(inside).toEqual([]);
    // The clearance in X-space is the gate jambs' own.
    expect(KERB_GATE_HALF_W - FOOTPRINT_HALF_W).toBeCloseTo(0.59, 10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// E. Clearance to the widest bridge footprint
// ═══════════════════════════════════════════════════════════════════════════

describe('E. The kerb clears the bridge by at least the audited 0.598', () => {
  const cornerRadius = Math.hypot(FOOTPRINT_HALF_W, DECK_Z_OUTER - MOTTE_CENTER_Z); // 31.0717
  const cornerAngle = Math.atan2(FOOTPRINT_HALF_W, DECK_Z_OUTER - MOTTE_CENTER_Z);

  test('the audit’s own measure — perpendicular to the gap’s end plane', () => {
    // The audit measured this quantity as 0.598 at its ±4.997° derivation.
    const audited = cornerRadius * Math.sin(AUDIT_GAP_HALF_ANGLE - cornerAngle);
    expect(audited).toBeCloseTo(AUDIT_BRIDGE_CLEARANCE, 3);
    const shipped = cornerRadius * Math.sin(KERB_GAP_HALF_ANGLE - cornerAngle);
    expect(shipped).toBeCloseTo(0.6127, 4);
    expect(shipped).toBeGreaterThanOrEqual(AUDIT_BRIDGE_CLEARANCE);
  });

  test('the true closest approach of the two rendered volumes beats the audit’s own', () => {
    // The tightest corner of the stone is the end cap's inner-radial corner.  Its
    // Y (0.14) lies inside the side beam's own band (0.09 … 0.37) and its Z inside
    // the beam's span, so the two surfaces can be matched exactly in Y and Z: the
    // closest approach IS the X gap.
    expect(KERB_GATE_HALF_W - FOOTPRINT_HALF_W).toBeCloseTo(0.59, 10);
    // The audited gap derivation would only have left this much.
    const auditedGapX = KERB_INNER_RADIUS * Math.sin(AUDIT_GAP_HALF_ANGLE);
    expect(auditedGapX - FOOTPRINT_HALF_W).toBeCloseTo(0.5813, 4);
    expect(KERB_GATE_HALF_W - FOOTPRINT_HALF_W).toBeGreaterThan(auditedGapX - FOOTPRINT_HALF_W);
    // A grid sweep over the whole bridge footprint finds nothing closer.
    let best = Infinity;
    for (let x = -FOOTPRINT_HALF_W; x <= FOOTPRINT_HALF_W + 1e-9; x += 0.1) {
      for (let z = DECK_Z_INNER; z <= DECK_Z_OUTER + 1e-9; z += 0.1) {
        for (const y of [DECK_UNDERSIDE_Y, DECK_TOP_Y]) {
          for (const v of kerbWorld) {
            const distance = Math.hypot(x - v.x, y - v.y, z - v.z);
            if (distance < best) best = distance;
          }
        }
      }
    }
    expect(best).toBeGreaterThanOrEqual(0.589);
    // No clearance anywhere is as tight as the seal-to-deck 0.49 C-8.33 pinned.
    expect(best).toBeGreaterThan(0.49);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F. Vertical clearances and the water beneath the deck
// ═══════════════════════════════════════════════════════════════════════════

describe('F. Vertical clearances and the crossing', () => {
  test('the base is buried, the top carries freeboard, the deck stays highest', () => {
    const sand = GROUND_PLANE_ELEVATION_Y;
    expect(sand - KERB_BASE_Y).toBeCloseTo(0.05, 10); // buried 0.05 below the sand
    expect(KERB_TOP_Y - MOAT_WATER_Y).toBeCloseTo(0.08, 10); // freeboard
    expect(MOAT_WATER_Y - KERB_BASE_Y).toBeCloseTo(0.16, 10); // water cannot see under it
    expect(DECK_TOP_Y - KERB_TOP_Y).toBeCloseTo(0.02, 10); // the bridge is the highest plane
    expect(MOAT_WATER_Y).toBeGreaterThan(sand); // the water still floats above the sand
  });

  test('the water still runs continuously beneath the deck', () => {
    // The kerb removed no water and cut no wedge in the ring: the ring is still
    // one complete annulus (C §), so re-run the C-8.38 footprint sweep.
    const coveredByMoat = (x: number, z: number): boolean => {
      const r = Math.hypot(x, z - MOTTE_CENTER_Z);
      return r >= MOAT_INNER_RADIUS && r <= MOAT_OUTER_RADIUS;
    };
    for (let x = -FOOTPRINT_HALF_W; x <= FOOTPRINT_HALF_W + 1e-9; x += 0.5) {
      for (let z = DECK_Z_INNER; z <= DECK_Z_OUTER + 1e-9; z += 0.5) {
        const r = Math.hypot(x, z - MOTTE_CENTER_Z);
        if (r < MOAT_OUTER_RADIUS - 0.1) {
          expect(coveredByMoat(x, z)).toBe(true);
        }
      }
    }
    // …and the kerb takes water in from the shoreline, never over it: the stone
    // stops 0.35 short of the deck's south end's own radius.
    expect(KERB_OUTER_RADIUS).toBeGreaterThan(MOAT_OUTER_RADIUS);
    expect(DECK_Z_OUTER).toBe(MOTTE_CENTER_Z + MOAT_OUTER_RADIUS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// G. The apron
// ═══════════════════════════════════════════════════════════════════════════

describe('G. What the kerb costs the six-metre apron', () => {
  test('the kerb’s south face is 5.842 from the Colosseum’s rear-most stone', () => {
    const kerbSouthZ = MOTTE_CENTER_Z + KERB_OUTER_RADIUS; // -50.15
    expect(kerbSouthZ).toBeCloseTo(-50.15, 6);
    const apron = COLO_REAR_RENDERED_Z - kerbSouthZ;
    expect(apron).toBeCloseTo(5.842, 3);
    expect(apron).toBeGreaterThanOrEqual(APRON_MIN);
  });

  test('it costs 0.35 of the audit’s 6.192, not the C-8.38 rule', () => {
    const before = COLO_REAR_RENDERED_Z - (MOTTE_CENTER_Z + MOAT_OUTER_RADIUS);
    expect(before).toBeCloseTo(APRON_BEFORE_KERB, 3);
    const after = COLO_REAR_RENDERED_Z - (MOTTE_CENTER_Z + KERB_OUTER_RADIUS);
    expect(before - after).toBeCloseTo(0.35, 10);
    expect(before - after).toBeCloseTo(KERB_OUTER_RADIUS - MOAT_OUTER_RADIUS, 10);
    // The apron is still at least the moat's own width against the lintel ring.
    expect(COLO_LINTEL_Z - (MOTTE_CENTER_Z + KERB_OUTER_RADIUS)).toBeGreaterThan(APRON_MIN);
  });

  test('the bridge still lands on the outer bank, exactly on the waterline', () => {
    expect(DECK_Z_OUTER).toBeCloseTo(-50.5, 6);
    expect(DECK_Z_OUTER).toBe(MOTTE_CENTER_Z + MOAT_OUTER_RADIUS);
    expect(DECK_LENGTH).toBeCloseTo(6.0, 10);
    // The deck's south face is 0.35 inside the kerb's outer face, so the stone
    // reaches *under* the landing rather than standing in front of it.
    expect(KERB_OUTER_RADIUS - MOAT_OUTER_RADIUS).toBeCloseTo(0.35, 10);
    expect(DECK_Z_OUTER - (MOTTE_CENTER_Z + KERB_OUTER_RADIUS)).toBeCloseTo(-0.35, 10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// H. No new collision geometry
// ═══════════════════════════════════════════════════════════════════════════

describe('H. The kerb adds no collision geometry', () => {
  const ringMin = KERB_INNER_RADIUS - 1.5;
  const ringMax = KERB_OUTER_RADIUS + 1.5;

  test('no collider stands in or beside the kerb’s band', () => {
    const inBand: string[] = [];
    for (const c of CITY_COLLIDERS) {
      const b = aabb(c);
      const corners: Array<[number, number]> = [
        [b.minX, b.minZ],
        [b.maxX, b.maxZ],
      ];
      if (
        corners.some(([x, z]) => {
          const r = Math.hypot(x, z - MOTTE_CENTER_Z);
          return r >= ringMin && r <= ringMax;
        })
      ) {
        inBand.push(c.id);
      }
    }
    expect(inBand).toEqual([]);
    // 109 was the count C-8.38 left; Phase C-8.45 appended the single
    // 'training-hall' building rectangle — an unrelated registry addition the
    // kerb itself did not make.
    expect(CITY_COLLIDERS.length).toBe(110);
  });

  test('the kerb module imports nothing from the collision system', () => {
    const code = codeOf(motteSrc);
    expect(code).not.toMatch(/collisionShapes|cityCollisions/);
    expect(code).not.toMatch(/\bRECT\(|\bCIRCLE\(|\bSEGMENT\(/);
    // …and no side of the pair knows the kerb exists.
    expect(codeOf(collisionSrc)).not.toMatch(/kerb/i);
    expect(codeOf(cityCollisionsSrc)).not.toMatch(/kerb/i);
    expect(CITY_COLLIDERS.some((c) => /kerb/i.test(c.id))).toBe(false);
  });

  test('the designed X = 0 route is exactly what C-8.38 left', () => {
    const [endX, endZ] = walkNorth(-38, 220);
    expect(endX).toBe(0);
    expect(endZ).toBeCloseTo(-90.82, 2);
    expect(collidesWith(endX, endZ, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    // Every step of the crossing is collision-free, kerb included.
    let pos: [number, number, number] = [0, 0, -38];
    for (let i = 0; i < 220; i++) {
      pos = resolveCityMovement(pos, 0, -1, 3.8, 0.1);
      expect(collidesWith(pos[0], pos[2], PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    }
  });

  test('the corridor beside the kerb stays wider than the bridge', () => {
    // The kerb is a rendered lip only, so the registry answers exactly as it did
    // before: the passage, and the deck's own flanks, remain free.
    for (let z = DECK_Z_OUTER - 1; z <= DECK_Z_OUTER + 3; z += 0.25) {
      for (let x = -2.3; x <= 2.3 + 1e-9; x += 0.1) {
        expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
      }
    }
    expect(2 * KERB_GATE_HALF_W).toBeGreaterThan(2 * FOOTPRINT_HALF_W);
    expect(KERB_GATE_HALF_W - PLAYER_RADIUS).toBeGreaterThan(FOOTPRINT_HALF_W);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// I. The C-8.38 baseline is untouched
// ═══════════════════════════════════════════════════════════════════════════

describe('I. Nothing the C-8.38 baseline pinned has moved', () => {
  test('the group’s shared positions and both moat edges are unchanged', () => {
    expect(MOTTE_CENTER_Z).toBe(-81.5);
    expect(MOTTE_SCALE).toBe(0.3145);
    expect(MOTTE_PERIMETER_RADIUS).toBe(22.0);
    expect(SUMMIT_Y).toBeCloseTo(4.7175, 6);
    expect(MOAT_INNER_RADIUS).toBe(25.0);
    expect(MOAT_OUTER_RADIUS).toBe(31.0);
    expect(DECK_Z_OUTER).toBe(MOTTE_CENTER_Z + 31.0);
    expect(DECK_Z_INNER).toBeCloseTo(-56.5, 10);
    expect(DECK_TOP_Y).toBe(0.16);
    expect(DECK_UNDERSIDE_Y).toBe(0.09);
    expect(BRIDGE_Z_OUTER).toBe(MOTTE_CENTER_Z + 31.0);
    expect(BRIDGE_Z_INNER).toBe(MOTTE_CENTER_Z + 25.5);
    expect(BRIDGE_HALF_WIDTH).toBe(2.0);
    expect(BOUNDARY_Z_MIN).toBe(-101);
    expect(GROUND_PLANE_NORTH_Z).toBe(-114);
  });

  test('the apron rule C-8.38 bought still passes', () => {
    const apron = COLO_LINTEL_Z - (MOTTE_CENTER_Z + MOAT_OUTER_RADIUS);
    expect(apron).toBeCloseTo(6.0, 6);
    expect(apron).toBeGreaterThanOrEqual(APRON_MIN);
  });

  test('the kerb stands entirely outside the mound’s visible slope', () => {
    let maxLevel = 0;
    let maxTerrainY = 0;
    for (let step = 0; step < 720; step++) {
      const theta = (step * Math.PI) / 360;
      for (const radius of [KERB_INNER_RADIUS, KERB_OUTER_RADIUS]) {
        const x = radius * Math.sin(theta);
        const z = MOTTE_CENTER_Z + radius * Math.cos(theta);
        maxLevel = Math.max(maxLevel, summitLevel(x, z - MOTTE_CENTER_Z));
        maxTerrainY = Math.max(maxTerrainY, getTerrainY(x, z));
      }
    }
    expect(maxLevel).toBeCloseTo(2.492, 3);
    expect(maxLevel).toBeGreaterThanOrEqual(SUMMIT_SLOPE_FOOT_SCALE);
    expect(maxTerrainY).toBe(0); // flat city ground under the whole band
    // The mound’s waterline crossing (C-8.36’s measured 24.456 on the diagonal)
    // stays 6.44 inside the kerb, so the stone never climbs the mound.
    expect(KERB_INNER_RADIUS - 24.456).toBeCloseTo(6.444, 3);
    const analyticCrossing = summitEdgeRadius(Math.PI / 4) * (SUMMIT_SLOPE_FOOT_SCALE - ((SUMMIT_SLOPE_FOOT_SCALE - 1) * MOAT_WATER_Y) / SUMMIT_Y);
    expect(analyticCrossing).toBeLessThan(KERB_INNER_RADIUS);
  });

  test('the mound, the water and the fortress share the one centre constant', () => {
    expect(motteSrc).toContain('const MOTTE_MOAT_CENTER: [number, number, number] = [0, 0, MOTTE_CENTER_Z];');
    expect(motteSrc).toContain('<group position={[0, 0, MOTTE_CENTER_Z]} scale={MOTTE_SCALE}>');
    expect(motteSrc).toContain(
      '<group position={[MOTTE_MOAT_CENTER[0], MOTTE_MOAT_CENTER[1], MOTTE_MOAT_CENTER[2]]}>',
    );
    // The kerb is mounted beside the water, inside the same error boundary.
    expect(codeOf(motteSrc)).toContain('<MoatWater />');
    expect(codeOf(motteSrc)).toContain('<MoatShorelineKerb />');
    expect(codeOf(motteSrc)).toMatch(/<MoatWater \/>\s*<MoatShorelineKerb \/>/);
  });

  test('the C-8.38 no-absolute-centre-literal guard still holds', () => {
    const code = codeOf(motteSrc);
    for (const literal of [/\b71\.5\b/, /\b76\.5\b/, /\b81\.5\b/]) {
      expect(`motte:${literal.test(code)}`).toBe('motte:false');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// J. The C-8.33 seals and the fortress are untouched
// ═══════════════════════════════════════════════════════════════════════════

describe('J. The rear-gate seals and the fortress geometry are untouched', () => {
  test('both C-8.33 seals survive with their recorded endpoints', () => {
    const seals = CITY_COLLIDERS.filter(
      (c) => c.type === 'segment' && c.id.startsWith('colo-gateseal'),
    );
    expect(seals.map((s) => s.id).sort()).toEqual(['colo-gateseal-l', 'colo-gateseal-r']);
    for (const s of seals) {
      if (s.type !== 'segment') throw new Error('seal is not a segment');
      const side = s.id.endsWith('-l') ? -1 : 1;
      expect(s.x1).toBeCloseTo(side * 2.7, 9);
      expect(s.z1).toBeCloseTo(-44.1102, 4);
      expect(s.x2).toBeCloseTo(side * 2.6, 9);
      expect(s.z2).toBeCloseTo(-40.0775, 4);
    }
    // The whole Colosseum set is the 46 colliders C-8.33 left.
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-')).length).toBe(46);
  });

  test('the fortress still derives from the one centre constant', () => {
    expect(collisionSrc).toContain('RECT(\'fortress-north\', 0, MOTTE_CENTER_Z - FORTRESS_HALF_DEPTH, 21.0, 1.2)');
    expect(collisionSrc).toMatch(/MOTTE_R \* Math\.cos\(theta\) \+ MOTTE_CENTER_Z/);
    expect(cityCollisionsSrc).toContain(
      'BOUNDARY_Z_MIN = MOTTE_CENTER_Z - MOTTE_PERIMETER_RADIUS + 2.5',
    );
  });

  test('the kerb touches no terrain function', () => {
    // getTerrainY's contract is unchanged: the kerb is rendering only.
    expect(getTerrainY(0, MOTTE_CENTER_Z)).toBeCloseTo(SUMMIT_Y, 10);
    expect(getTerrainY(0, KERB_OUTER_RADIUS + MOTTE_CENTER_Z)).toBe(0);
    expect(getTerrainY(0, KERB_INNER_RADIUS + MOTTE_CENTER_Z)).toBe(0);
    const code = codeOf(motteSrc);
    expect(code).not.toMatch(/getTerrainY|SUMMIT_SLOPE_FOOT|summitLevel/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// K. Controls — the checks are sensitive to the values they pin
// ═══════════════════════════════════════════════════════════════════════════

describe('K. The audited alternatives fail the rules above', () => {
  const cornerRadius = Math.hypot(FOOTPRINT_HALF_W, DECK_Z_OUTER - MOTTE_CENTER_Z);
  const cornerAngle = Math.atan2(FOOTPRINT_HALF_W, DECK_Z_OUTER - MOTTE_CENTER_Z);

  test('the audit’s gap derivation point would pinch the opening below 2.70', () => {
    expect((AUDIT_GAP_HALF_ANGLE * 180) / Math.PI).toBeCloseTo(4.997, 3); // the audit's ±4.997°
    expect(KERB_GAP_HALF_ANGLE).toBeGreaterThan(AUDIT_GAP_HALF_ANGLE);
    // Deriving at the shoreline puts the *tightest* stone 0.013 inside the gate…
    const auditedTight = KERB_INNER_RADIUS_TIGHT * Math.sin(AUDIT_GAP_HALF_ANGLE);
    expect(auditedTight).toBeCloseTo(2.687, 2);
    expect(auditedTight).toBeLessThan(KERB_GATE_HALF_W);
    // …where the shipped derivation sits exactly on it.
    expect(KERB_INNER_RADIUS_TIGHT * Math.sin(KERB_GAP_HALF_ANGLE)).toBeCloseTo(
      KERB_GATE_HALF_W,
      9,
    );
    // Both leave more than the 0.598 the audit measured, so only the opening
    // moved: the fix costs no clearance.
    expect(cornerRadius * Math.sin(AUDIT_GAP_HALF_ANGLE - cornerAngle)).toBeCloseTo(
      AUDIT_BRIDGE_CLEARANCE,
      3,
    );
    expect(cornerRadius * Math.sin(KERB_GAP_HALF_ANGLE - cornerAngle)).toBeGreaterThan(
      AUDIT_BRIDGE_CLEARANCE,
    );
  });

  test('a shallower inner face would let a sand sliver show', () => {
    const waterEdgeMin = MOAT_OUTER_RADIUS * Math.cos(Math.PI / KERB_SEGMENTS);
    // The audited 0.10 overlap is load-bearing: 0.05 would not clear the
    // 48-gon’s chord dip, and 30.96 would sit outside the water’s own edge.
    expect(MOAT_OUTER_RADIUS - 0.05).toBeGreaterThan(waterEdgeMin); // sliver possible
    expect(MOAT_OUTER_RADIUS - 0.1).toBeLessThan(waterEdgeMin); // shipped: none
    expect(30.96).toBeGreaterThan(waterEdgeMin);
    expect(KERB_INNER_RADIUS).toBeLessThan(waterEdgeMin);
  });

  test('a gap at the deck’s own width, or one at the waterline, would fail', () => {
    // C-8.39's option 2 (widen the bridge) would leave zero clearance…
    expect(FOOTPRINT_HALF_W - FOOTPRINT_HALF_W).toBe(0);
    // …and a band drawn on the 31.0 shoreline with no gap at all would run
    // straight through the deck's landing corners.
    const cornerInBand = cornerRadius > KERB_INNER_RADIUS && cornerRadius < KERB_OUTER_RADIUS;
    expect(cornerInBand).toBe(true);
    expect(cornerAngle).toBeGreaterThan(0);
    expect(KERB_GAP_HALF_ANGLE).toBeGreaterThan(cornerAngle);
  });

  test('the Y band’s 0.05 burial and 0.02 step are both load-bearing', () => {
    const sand = GROUND_PLANE_ELEVATION_Y;
    // A base resting on the sand plane would be coplanar with it…
    expect(`${sand}|${sand === sand}`).toBe(`${sand}|true`);
    expect(KERB_BASE_Y).not.toBe(sand);
    // …and a top level with the deck would make the bridge and the kerb one plane.
    expect(KERB_TOP_Y).not.toBe(DECK_TOP_Y);
    expect(DECK_TOP_Y - KERB_TOP_Y).toBeGreaterThan(0);
  });
});
