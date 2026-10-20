/**
 * Phase C-8.36 — Water beneath the drawbridge (northern fortress moat).
 *
 * ── THE REPORTED DEFECT ────────────────────────────────────────────────────
 * The moat's visible water stopped dead where the drawbridge crosses it, so the
 * bridge stood over a dry strip of terrain.  The ring
 * (`NorthernMotte` → `<MoatWater>`) was drawn with a south gap of
 * MOAT_GAP_HALF_ANGLE = 0.18 rad — ±10.31° about the +Z axis — which is far
 * wider than the bridge: at the ring's inner edge that gap is 9.24 units across,
 * against a bridge footprint only 4.22 wide (deck ±2.0, side beams to ±2.11).
 * The gap therefore removed the water over the entire crossing, leaving a dry
 * channel under the deck and along both sides of it.  The ring's inner radius
 * (25.8) also stopped 0.8 short of the bridge's north end: the footprint's inner
 * corners sit at radius 25.089, so even the water outside the gap never reached
 * the deck's north end.  §A measures both against the real bridge footprint.
 *
 * ── THE CORRECTION (water mesh only) ───────────────────────────────────────
 * The ring is now a complete annulus reaching in to radius 25.0:
 *   - no gap, so the water passes beneath the deck and both side beams;
 *   - inner radius 25.0, so it reaches under the bridge's north end — exactly at
 *     the centreline (radius 25.0) and by 0.089 at the footprint's inner
 *     corners — leaving no dry strip at either end.
 * The outer shoreline (31.0) and the water elevation (0.06) are unchanged, so
 * nothing is pushed out onto the approach and the water still sits 0.03 below
 * the bridge's underside: it cannot clip the deck (§C).
 *
 * The inner edge had to stay clear of the mound.  §D measures, on the shipping
 * asset with the C-8.35 flange burial applied, where the motte's surface stands
 * above the water plane: 24.456 at the worst (diagonal) azimuth, against which
 * the new inner radius keeps 0.544 of clearance, and the mound's visible
 * silhouette reaches 24.666 — so the water neither cuts nor climbs the motte.
 * §F pins everything that did not move, including the C-8.33 rear-gate seals.
 *
 * Run with: bun test src/utils/phaseC8_36.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { buryMotteFlange } from './motteSurface';
import {
  MOTTE_CENTER_Z,
  MOTTE_SCALE,
  MOTTE_PERIMETER_RADIUS,
  SUMMIT_Y,
  SUMMIT_SUPERELLIPSE_N,
  SUMMIT_SLOPE_FOOT_SCALE,
  SUMMIT_SLOPE_FOOT_RADIUS,
  summitEdgeRadius,
  getTerrainY,
  isOnBridge,
  BRIDGE_HALF_WIDTH,
  BRIDGE_Z_INNER,
  BRIDGE_Z_OUTER,
} from './terrainHeight';
import {
  MOAT_INNER_RADIUS,
  MOAT_OUTER_RADIUS,
  MOAT_WATER_Y,
  MOAT_GAP_HALF_ANGLE,
} from '../components/3d/city/NorthernMotte';
import {
  DECK_TOP_Y,
  DECK_THICKNESS,
  DECK_UNDERSIDE_Y,
  DECK_Y,
  DECK_CENTER_Z,
  DECK_LENGTH,
  DECK_Z_INNER,
  DECK_Z_OUTER,
  BEAM_WIDTH,
  BEAM_HEIGHT,
  HINGE_RAISE,
  HINGE_RADIUS,
} from '../components/3d/city/Drawbridge';
import { GROUND_PLANE_ELEVATION_Y } from '../components/3d/city/ProcessionAvenue';
import { CITY_COLLIDERS } from './collisionShapes';

// ── The shipping asset, loaded once (the harness phaseC8_35 established) ────

const GLB_PATH = new URL('../../public/_workspace_motte_normals.glb', import.meta.url);
const GLB_BYTES = readFileSync(GLB_PATH);

const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(GLB_BYTES));
const grassMesh = doc.getRoot().listMeshes().find((m) => m.getName() === 'Motte_Grass');
if (!grassMesh) throw new Error('Motte_Grass mesh missing from the shipping asset');
const positionAccessor = grassMesh.listPrimitives()[0].getAttribute('POSITION');
if (!positionAccessor) throw new Error('Motte_Grass has no POSITION attribute');
const VERTEX_COUNT = positionAccessor.getCount();

/**
 * Model space is Z-up (X and Y span the ground plane, Z is height) and the GLB
 * interleaves POSITION with NORMAL, so the positions are read through the
 * accessor API into a dense buffer rather than by raw stride.
 */
const MODEL = new Float32Array(VERTEX_COUNT * 3);
{
  const tmp: number[] = [0, 0, 0];
  for (let i = 0; i < VERTEX_COUNT; i++) {
    positionAccessor.getElement(i, tmp);
    MODEL[i * 3] = tmp[0];
    MODEL[i * 3 + 1] = tmp[1];
    MODEL[i * 3 + 2] = tmp[2];
  }
}

/** The mound as it renders: the C-8.35 flange burial applied to a copy. */
const CORRECTED = new Float32Array(MODEL);
buryMotteFlange(CORRECTED);

// ── Bridge footprint (world space, from the component's own constants) ──────

/** Widest lateral extent of the structure: the outer face of a side beam. */
const FOOTPRINT_HALF_W = BRIDGE_HALF_WIDTH + BEAM_WIDTH / 2; // 2.11
/** The deck box and both side beams share this span (DECK_LENGTH deep). */
const FOOTPRINT_Z_MIN = DECK_Z_INNER; // −46.5 (motte side)
const FOOTPRINT_Z_MAX = DECK_Z_OUTER; // −40.5 (approach side)

/**
 * True when (x, z) lies inside the drawbridge's footprint: the deck box plus
 * both side beams, which are the same depth and together span |x| ≤ 2.11.
 */
function inBridgeFootprint(x: number, z: number): boolean {
  return Math.abs(x) <= FOOTPRINT_HALF_W && z >= FOOTPRINT_Z_MIN && z <= FOOTPRINT_Z_MAX;
}

/** World radius of a footprint point about the motte centre. */
const radiusOf = (x: number, z: number) => Math.hypot(x, z - MOTTE_CENTER_Z);

/**
 * True when the water ring covers (x, z).
 *
 * A point is covered when its radius is inside the ring and its azimuth is
 * outside the south gap.  The gap is centred on +Z (south), so the azimuth is
 * measured from +Z.
 */
function waterCovers(
  x: number,
  z: number,
  innerRadius: number,
  outerRadius: number,
  gapHalfAngle: number,
): boolean {
  const r = radiusOf(x, z);
  if (r < innerRadius || r > outerRadius) return false;
  if (gapHalfAngle <= 0) return true;
  const azimuth = Math.atan2(x, z - MOTTE_CENTER_Z);
  return Math.abs(azimuth) > gapHalfAngle;
}

/** Dense samples over the bridge footprint, 0.05 apart. */
const FOOTPRINT_SAMPLES: Array<[number, number]> = (() => {
  const out: Array<[number, number]> = [];
  for (let x = -FOOTPRINT_HALF_W; x <= FOOTPRINT_HALF_W + 1e-9; x += 0.05) {
    for (let z = FOOTPRINT_Z_MIN; z <= FOOTPRINT_Z_MAX + 1e-9; z += 0.05) {
      out.push([Number(x.toFixed(4)), Number(z.toFixed(4))]);
    }
  }
  return out;
})();

/** The ring as Phase 35C … C-8.35 shipped it, for the "before" measurement. */
const PRE_PHASE_INNER_RADIUS = 25.8;
const PRE_PHASE_OUTER_RADIUS = 31.0;
const PRE_PHASE_GAP_HALF_ANGLE = 0.18;

// ── Rendered mound cross-sections, measured from the asset ─────────────────

const NCOL = 360;

/** All rendered mound samples, grouped by azimuth from the motte centre. */
const MOUND_COLUMNS: Array<Array<{ r: number; y: number }>> = (() => {
  const columns: Array<Array<{ r: number; y: number }>> = Array.from({ length: NCOL }, () => []);
  for (let i = 0; i < VERTEX_COUNT; i++) {
    const worldX = CORRECTED[i * 3] * MOTTE_SCALE;
    const worldY = CORRECTED[i * 3 + 2] * MOTTE_SCALE;
    const worldZ = MOTTE_CENTER_Z - CORRECTED[i * 3 + 1] * MOTTE_SCALE;
    let azimuth = Math.atan2(worldX, worldZ - MOTTE_CENTER_Z);
    if (azimuth < 0) azimuth += 2 * Math.PI;
    columns[Math.round((azimuth / (2 * Math.PI)) * NCOL) % NCOL].push({
      r: Math.hypot(worldX, worldZ - MOTTE_CENTER_Z),
      y: worldY,
    });
  }
  return columns;
})();

/**
 * The largest world radius at which the rendered mound surface reaches
 * `targetY`, taken over every azimuth.
 *
 * The surface crosses such a plane between two consecutive superellipse rings,
 * so the crossing is interpolated along each azimuth's own radial samples —
 * this is the radius the water's inner edge has to stay outside of.
 */
function moundRadiusAbove(targetY: number): number {
  let maxR = -Infinity;
  for (const column of MOUND_COLUMNS) {
    if (column.length < 2) continue;
    const sorted = [...column].sort((a, b) => a.r - b.r);
    let last = -Infinity;
    for (let k = 0; k < sorted.length - 1; k++) {
      const a = sorted[k];
      const b = sorted[k + 1];
      if (b.r <= a.r) continue;
      if ((a.y - targetY) * (b.y - targetY) <= 0) {
        const r = a.r + ((targetY - a.y) / (b.y - a.y)) * (b.r - a.r);
        if (r > last) last = r;
      }
    }
    for (const p of sorted) if (p.y > targetY && p.r > last) last = p.r;
    if (last > maxR) maxR = last;
  }
  return maxR;
}

// ══════════════════════════════════════════════════════════════════════════
// A. The wet footprint under the bridge, before and after
// ══════════════════════════════════════════════════════════════════════════

describe('A. Water coverage of the bridge footprint', () => {
  const minFootprintRadius = Math.min(...FOOTPRINT_SAMPLES.map(([x, z]) => radiusOf(x, z)));
  const maxFootprintRadius = Math.max(...FOOTPRINT_SAMPLES.map(([x, z]) => radiusOf(x, z)));

  test('the footprint spans radius 25.0 … 31.07 about the motte centre', () => {
    expect(minFootprintRadius).toBeCloseTo(25.0, 3);
    expect(maxFootprintRadius).toBeCloseTo(31.071, 2);
  });

  test('the pre-phase ring left the whole crossing dry (the defect)', () => {
    const coveredBefore = FOOTPRINT_SAMPLES.filter(([x, z]) =>
      waterCovers(x, z, PRE_PHASE_INNER_RADIUS, PRE_PHASE_OUTER_RADIUS, PRE_PHASE_GAP_HALF_ANGLE),
    ).length;
    expect(coveredBefore).toBe(0);
    // …and why: the gap was far wider than the bridge it sheltered.
    const gapWidthAtInner = 2 * PRE_PHASE_INNER_RADIUS * Math.sin(PRE_PHASE_GAP_HALF_ANGLE);
    expect(gapWidthAtInner).toBeCloseTo(9.238, 2);
    expect(gapWidthAtInner).toBeGreaterThan(FOOTPRINT_HALF_W * 2); // 9.24 vs 4.22
  });

  test('the pre-phase inner edge also stopped short of the north end', () => {
    const shortfall = minFootprintRadius - PRE_PHASE_INNER_RADIUS; // 25.0 − 25.8
    expect(shortfall).toBeCloseTo(-0.8, 3);
    expect(Math.abs(shortfall)).toBeGreaterThan(0.5);
  });

  test('the shipped ring leaves no dry ground under the bridge', () => {
    // Every footprint sample inside the moat's outer shoreline is now covered,
    // and every covered sample lies outside the inner edge — i.e. the water
    // runs under the deck and under both side beams from end to end.
    const inside = FOOTPRINT_SAMPLES.filter(([x, z]) => radiusOf(x, z) <= MOAT_OUTER_RADIUS);
    const covered = FOOTPRINT_SAMPLES.filter(([x, z]) =>
      waterCovers(x, z, MOAT_INNER_RADIUS, MOAT_OUTER_RADIUS, MOAT_GAP_HALF_ANGLE),
    );
    expect(covered.length).toBeGreaterThan(9000);
    expect(covered.length).toBe(inside.length);
    expect(covered.every(([x, z]) => radiusOf(x, z) >= MOAT_INNER_RADIUS)).toBe(true);
  });

  test('the only footprint beyond the water is the approach-end landing', () => {
    // The outer shoreline is a circle while the bridge's approach edge is
    // straight, so its outer corners stand up to 0.072 proud of the water.  The
    // deck rests on the outer bank there — where a bridge belongs — and the
    // uncovered strip is confined to that approach end, so no water is pushed
    // out over the sand to cover it.
    const overshoots = FOOTPRINT_SAMPLES.map(([x, z]) => radiusOf(x, z) - MOAT_OUTER_RADIUS)
      .filter((d) => d > 0);
    expect(overshoots.length).toBeGreaterThan(0);
    expect(Math.max(...overshoots)).toBeLessThan(0.1);
    const beyondShore = FOOTPRINT_SAMPLES.filter(([x, z]) => radiusOf(x, z) > MOAT_OUTER_RADIUS);
    expect(beyondShore.every(([, z]) => z > FOOTPRINT_Z_MAX - 0.1)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The ring itself: complete, and reaching under the north end
// ══════════════════════════════════════════════════════════════════════════

describe('B. The ring runs under the whole bridge', () => {
  test('the south gap is gone', () => {
    expect(MOAT_GAP_HALF_ANGLE).toBe(0);
  });

  test('the inner edge reaches the bridge north end at the centreline', () => {
    const centrelineRadius = radiusOf(0, DECK_Z_INNER);
    expect(centrelineRadius).toBeCloseTo(25.0, 6);
    expect(centrelineRadius).toBeGreaterThanOrEqual(MOAT_INNER_RADIUS);
  });

  test('the inner edge reaches under both side beams at the north end', () => {
    for (const x of [-FOOTPRINT_HALF_W, FOOTPRINT_HALF_W]) {
      const r = radiusOf(x, DECK_Z_INNER);
      expect(r).toBeGreaterThan(MOAT_INNER_RADIUS);
      // Beam outer face: the footprint's true inner corners.
    }
    expect(radiusOf(FOOTPRINT_HALF_W, DECK_Z_INNER)).toBeCloseTo(25.089, 3);
  });

  test('the gap no longer shields anything at the bridge sides', () => {
    // Mid-crossing, a point just outside each side beam must be water.
    const midZ = (DECK_Z_INNER + DECK_Z_OUTER) / 2;
    for (const x of [FOOTPRINT_HALF_W + 0.05, -(FOOTPRINT_HALF_W + 0.05)]) {
      expect(waterCovers(x, midZ, MOAT_INNER_RADIUS, MOAT_OUTER_RADIUS, MOAT_GAP_HALF_ANGLE)).toBe(true);
    }
  });

  test('the deck and beams really do span the moat radially', () => {
    const moatInnerZ = MOTTE_CENTER_Z + MOAT_INNER_RADIUS; // −46.5
    const moatOuterZ = MOTTE_CENTER_Z + MOAT_OUTER_RADIUS; // −40.5
    expect(moatInnerZ).toBeCloseTo(DECK_Z_INNER, 6);
    expect(moatOuterZ).toBeCloseTo(DECK_Z_OUTER, 6);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. Vertical clearance — water stays below every part of the bridge
// ══════════════════════════════════════════════════════════════════════════

describe('C. Water sits below the bridge and above the ground', () => {
  test('the water is above the ground plane, so it does not z-fight with it', () => {
    expect(MOAT_WATER_Y).toBeGreaterThan(GROUND_PLANE_ELEVATION_Y);
    expect(MOAT_WATER_Y - GROUND_PLANE_ELEVATION_Y).toBeCloseTo(0.11, 6);
  });

  test('the deck underside clears the water by 0.03', () => {
    const clearance = DECK_UNDERSIDE_Y - MOAT_WATER_Y;
    expect(clearance).toBeCloseTo(0.03, 6);
    expect(clearance).toBeGreaterThan(0.02);
  });

  test('the side beams and hinges clear the water too', () => {
    const beamBottom = DECK_UNDERSIDE_Y; // beams are flush under the deck
    expect(beamBottom).toBeGreaterThan(MOAT_WATER_Y);
    const beamTop = DECK_UNDERSIDE_Y + BEAM_HEIGHT;
    expect(DECK_TOP_Y).toBeLessThan(beamTop);
    const hingeBottom = DECK_Y + HINGE_RAISE - HINGE_RADIUS;
    expect(hingeBottom).toBeGreaterThan(MOAT_WATER_Y);
  });

  test('the deck box sits inside the drawn span it claims', () => {
    expect(DECK_CENTER_Z - DECK_LENGTH / 2).toBeCloseTo(DECK_Z_INNER, 10);
    expect(DECK_CENTER_Z + DECK_LENGTH / 2).toBeCloseTo(DECK_Z_OUTER, 10);
    expect(DECK_TOP_Y).toBeCloseTo(DECK_UNDERSIDE_Y + DECK_THICKNESS, 10);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. The mound is neither cut by the water nor climbed by it
// ══════════════════════════════════════════════════════════════════════════

describe('D. The wider ring still clears the rendered mound', () => {
  test('the motte stands above the water plane only out to radius 24.456', () => {
    expect(moundRadiusAbove(MOAT_WATER_Y)).toBeCloseTo(24.456, 2);
  });

  test('that measurement matches terrainHeight\u2019s own slope model', () => {
    // getTerrainY descends linearly in the superellipse level from the summit
    // edge (SUMMIT_Y at level 1) to 0 at the visible foot (level 1.55), so the
    // water plane cuts the slope at level
    //   1.55 − 0.55 · MOAT_WATER_Y / SUMMIT_Y,
    // and the widest such radius is on the diagonal, summitEdgeRadius(45°).
    const cutLevel =
      SUMMIT_SLOPE_FOOT_SCALE - (SUMMIT_SLOPE_FOOT_SCALE - 1) * (MOAT_WATER_Y / SUMMIT_Y);
    const analytic = cutLevel * summitEdgeRadius(Math.PI / 4);
    expect(analytic).toBeCloseTo(moundRadiusAbove(MOAT_WATER_Y), 2);
  });

  test('the foot ring still reaches its recorded diagonal radius', () => {
    const diagonalFoot = SUMMIT_SLOPE_FOOT_RADIUS * Math.pow(2, 0.5 - 1 / SUMMIT_SUPERELLIPSE_N);
    expect(moundRadiusAbove(0)).toBeCloseTo(diagonalFoot, 2);
  });

  test('the water inner edge clears the mound waterline with margin', () => {
    const waterline = moundRadiusAbove(MOAT_WATER_Y);
    expect(MOAT_INNER_RADIUS).toBeGreaterThan(waterline);
    expect(MOAT_INNER_RADIUS - waterline).toBeGreaterThan(0.4);
  });

  test('the water never covers any visible part of the mound', () => {
    // The buried C-8.35 skirt is visible only where it is still above the
    // ground plane; the inner edge must stay outside that silhouette.
    const silhouette = moundRadiusAbove(GROUND_PLANE_ELEVATION_Y);
    expect(silhouette).toBeCloseTo(24.666, 2);
    expect(MOAT_INNER_RADIUS - silhouette).toBeGreaterThan(0.3);
  });

  test('the mound silhouette itself was not moved by this phase', () => {
    // The foot ring is the mound's own surface: unchanged by C-8.35 and by
    // this phase's water-only edit.
    expect(moundRadiusAbove(0)).toBeLessThan(moundRadiusAbove(GROUND_PLANE_ELEVATION_Y));
    expect(moundRadiusAbove(GROUND_PLANE_ELEVATION_Y) - moundRadiusAbove(0)).toBeCloseTo(0.1, 2);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. The moat's outer shoreline is untouched — no spill onto the approach
// ══════════════════════════════════════════════════════════════════════════

describe('E. Outer shoreline unchanged', () => {
  test('the outer radius is still 31.0 and still meets the bridge south end', () => {
    expect(MOAT_OUTER_RADIUS).toBe(31.0);
    expect(radiusOf(0, BRIDGE_Z_OUTER)).toBeCloseTo(MOAT_OUTER_RADIUS, 6);
  });

  test('no sample outside the shoreline is covered', () => {
    const outside = FOOTPRINT_SAMPLES.filter(([x, z]) => radiusOf(x, z) > MOAT_OUTER_RADIUS);
    expect(
      outside.every(([x, z]) => !waterCovers(x, z, MOAT_INNER_RADIUS, MOAT_OUTER_RADIUS, 0)),
    ).toBe(true);
  });

  test('the moat is 6.0 wide (was 5.2) — the only dimensional change', () => {
    expect(MOAT_OUTER_RADIUS - MOAT_INNER_RADIUS).toBeCloseTo(6.0, 6);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. Nothing else moved: terrain, bridge, fortress, Colosseum, registry
// ══════════════════════════════════════════════════════════════════════════

describe('F. Everything but the water mesh is untouched', () => {
  test('the terrain contract is unchanged across the moat and the bridge', () => {
    for (let z = BRIDGE_Z_OUTER + 1; z >= BRIDGE_Z_INNER - 2; z -= 0.25) {
      expect(getTerrainY(0, z)).toBe(0);
      expect(getTerrainY(FOOTPRINT_HALF_W, z)).toBe(0);
    }
    expect(getTerrainY(0, MOTTE_CENTER_Z)).toBe(SUMMIT_Y);
    expect(isOnBridge(0, (BRIDGE_Z_OUTER + BRIDGE_Z_INNER) / 2)).toBe(true);
  });

  test('bridge, terrain and bridge-span constants keep their C-8.36 relationships', () => {
    expect(BRIDGE_HALF_WIDTH).toBe(2.0);
    // Phases C-8.37 and C-8.38 each moved the whole northern group 5.0 north
    // (MOTTE_CENTER_Z -71.5 → -76.5 → -81.5) to open separation from the
    // Colosseum.  Every span below keeps the offset from the motte centre that
    // C-8.36 pinned, so the water still meets the deck exactly end for end;
    // only the group's Z moved, and this suite pins the offsets, not the Z.
    expect(BRIDGE_Z_OUTER).toBe(MOTTE_CENTER_Z + 31.0); // -50.5, outer shoreline
    expect(BRIDGE_Z_INNER).toBe(MOTTE_CENTER_Z + 25.5); // -56.0
    expect(DECK_Z_OUTER).toBe(MOTTE_CENTER_Z + 31.0);   // -50.5
    expect(DECK_Z_INNER).toBe(MOTTE_CENTER_Z + 25.0);   // -56.5, inner shoreline
    expect(MOTTE_CENTER_Z).toBe(-81.5);
    expect(DECK_TOP_Y).toBeCloseTo(0.16, 6);
    expect(DECK_THICKNESS).toBeCloseTo(0.07, 6);
    expect(BEAM_WIDTH).toBeCloseTo(0.22, 6);
    expect(BEAM_HEIGHT).toBeCloseTo(0.28, 6);
    expect(SUMMIT_Y).toBeCloseTo(4.7175, 6);
    expect(MOTTE_SCALE).toBe(0.3145);
    expect(MOTTE_PERIMETER_RADIUS).toBe(22.0);
  });

  test('the water is decoration — it still adds no colliders', () => {
    expect(CITY_COLLIDERS.filter((c) => /moat|water/i.test(c.id))).toEqual([]);
    expect(CITY_COLLIDERS.filter((c) => /bridge|draw/i.test(c.id))).toEqual([]);
  });

  test('the verified C-8.33 rear-gate seals and the rest of the registry are intact', () => {
    expect(
      CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-gateseal')).map((c) => c.id).sort(),
    ).toEqual(['colo-gateseal-l', 'colo-gateseal-r']);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-')).length).toBe(46);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('motte-wall')).length).toBe(20);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('fortress-')).length).toBe(5);
  });

  test('the Colosseum gate geometry this crossing passes through is untouched', () => {
    const source = readFileSync(
      new URL('../components/3d/city/GrandColosseum.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toMatch(/const GATE_HALF_W = 2\.7;/);
    expect(source).toMatch(/const R_FACADE = 19\.3;/);
    expect(source).toMatch(/const R_LINER = 18\.0;/);
  });
});
