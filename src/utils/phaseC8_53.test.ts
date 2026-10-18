/**
 * Phase C-8.53 — Armor & Leather Workshop: the lean-to's bearing arrangement.
 *
 * ── THE DEFECT (re-measured here, not restated) ───────────────────────────
 * The C-8.50 audit reported the lean-to roof as "sloping down toward the rear
 * wall while leaving a gap above the front architrave".  Re-derived from the
 * shipped transforms (root [28.2, 0, 1], group [0, 4.25, 0.2] rotation [0.16])
 * the roof's underside ran:
 *
 *   • 4.4695 over the architrave's FRONT edge and 4.4332 over its centre-line
 *     against a beam top of 4.02 — i.e. it floated 0.4132–0.4495 above the beam
 *     it is supposed to bear on (the audit's ~0.414), while
 *   • at the wall's own front face it was 3.9975 and at the wall's rear face
 *     3.8038 against a 4.0 wall top: the brick wall drove THROUGH the slab, its
 *     top rear edge standing 0.0139 proud of the slab's TOP face.
 *
 * So the roof matched neither bearing, and its fall — 0.16 rad, 9.2° — pointed
 * the wrong way: down into the building's own back wall, so its water sheds onto
 * the wall the workshop leans on.
 *
 * ── THE ARRANGEMENT SHIPPED (see AGENTS.md for the full argument) ──────────
 * The lean-to leans against the rear wall: HIGH at the wall, LOW at the open
 * front, draining to the street.  Keeping the author's own 0.16 rad pitch, its
 * underside plane is made to bear on BOTH existing supports:
 *
 *   1. the roof group's rotation flips to −0.16 and its Y is set (4.4218) so the
 *      plane passes exactly through the heavy timber architrave's front-top edge
 *      — world (Z −1.725, Y 4.02), the beam's down-slope bearing line, gap 0.000;
 *   2. the rear wall's top is raised 4.0 → 4.5034, the plane's height at the
 *      wall's front face (Z 1.2).  The wall's top face beds 0.0113 into the slab
 *      there — inside the project's own 0.02 seating tolerance (the architrave
 *      uses 0.02 on the piers, the C-8.52 canopy 0.01545 on its tie-beam) — and
 *      stays 0.1710 below the slab's top face, so nothing pokes through;
 *   3. the "top wall flashing beam" moves from the roof's rear edge (where it
 *      hung 0.4814 past the wall) onto the wall's own top at its rear face, where
 *      it exactly spans that junction: its bottom edge rests on the wall's top
 *      (gap 0.000) and its top edge meets the roof's underside (gap 0.000).
 *      Its box, tilt and material are unchanged.
 *
 * Nothing else moved: the slab (8.6 × 0.18 × 5.4), the eave fascia, the architrave,
 * the piers, every prop, the building's root, its collider and its hub are exactly
 * what they were, and the roof's front edge in fact moved 0.029 AWAY from the
 * General Store's roof.
 *
 * ── HOW THIS SUITE MEASURES IT ────────────────────────────────────────────
 * Nothing here is a copied constant.  The component's own numbers are parsed out
 * of its source, and every plane, edge and seat is built by transforming the real
 * boxes' own corners through the group's own rotation and position — the same way
 * three.js composes them.  Each seat is then stated as a gap against the project's
 * stated 0.02 seating tolerance, and a control replays the pre-fix transform
 * through the identical checks to show they are sensitive to it.
 *
 * SCOPE: this pins geometry, not appearance.  The rendered junction on Android is
 * a device question this suite cannot answer.
 *
 * Run with: bun test src/utils/phaseC8_53.test.ts
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

const load = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const shopSrc = load('../components/3d/city/ArmorLeatherWorkshop.tsx');
const storeSrc = load('../components/3d/city/GeneralStore.tsx');
const forgeSrc = load('../components/3d/city/SmithingForge.tsx');
const stableSrc = load('../components/3d/city/Stable.tsx');
const hallSrc = load('../components/3d/city/TrainingHall.tsx');
const foundationSrc = load('../components/3d/city/BuildingFoundation.tsx');

type Vec3 = [number, number, number];

/** The project's seating tolerance — used by the architrave, the C-8.52 canopy and here. */
const TOL = 0.02;

// ── Tiny parsers (the style of the C-8.18 … C-8.52 suites) ────────────────

function nums(src: string, re: RegExp): number[] {
  const m = re.exec(src);
  if (!m) throw new Error(`not found: ${re}`);
  return m.slice(1).map(Number);
}
const num = (src: string, re: RegExp): number => nums(src, re)[0];
function triple(src: string, re: RegExp): Vec3 {
  const n = nums(src, re);
  return [n[0], n[1], n[2]];
}

const SHOP_ROOT = triple(shopSrc, /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*\{\/\* 0\. STEPPED/);

// the rear brick wall (the lean-to's HIGH bearing)
const WALL_MESH_POS = triple(shopSrc, /Stone foundation & rear solid brick wall[\s\S]*?<mesh castShadow receiveShadow position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/);
const WALL_BOX = triple(shopSrc, /Stone foundation & rear solid brick wall[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);

// the two front piers, their impost caps and the heavy timber architrave
const PIER_X = nums(shopSrc, /\{\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(x, i\) =>/);
const PIER_Z = num(shopSrc, /<group key=\{`arch-post-\$\{i\}`\} position=\{\[x, 0, (-?[\d.]+)\s*\]\}>/);
const PIER_BASE_POS = triple(shopSrc, /<mesh castShadow receiveShadow position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*<boxGeometry args=\{\[\s*0\.95,\s*0\.4/);
const PIER_BASE_BOX = triple(shopSrc, /<mesh castShadow receiveShadow position=\{\[\s*-?[\d.]+,\s*-?[\d.]+,\s*-?[\d.]+\s*\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\} \/>\s*<meshStandardMaterial[\s\S]*?ashlarStone/);
const PIER_SHAFT_POS = triple(shopSrc, /<mesh castShadow receiveShadow position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*<boxGeometry args=\{\[\s*0\.8,/);
const PIER_SHAFT_BOX = triple(shopSrc, /<mesh castShadow receiveShadow position=\{\[\s*-?[\d.]+,\s*-?[\d.]+,\s*-?[\d.]+\s*\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\} \/>\s*<meshStandardMaterial[\s\S]*?romanBrick/);
const PIER_CAP_POS = triple(shopSrc, /<mesh castShadow position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*<boxGeometry args=\{\[\s*0\.95, 0\.2/);
const PIER_CAP_BOX = triple(shopSrc, /<mesh castShadow position=\{\[\s*-?[\d.]+,\s*-?[\d.]+,\s*-?[\d.]+\s*\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\} \/>\s*<meshStandardMaterial[\s\S]*?travertine/);
const ARCH_POS = triple(shopSrc, /Heavy Timber Architrave Tie-Beam[\s\S]*?<mesh castShadow position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/);
const ARCH_BOX = triple(shopSrc, /Heavy Timber Architrave Tie-Beam[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);

// the lean-to group and the three boxes inside it
const ROOF_GROUP = nums(shopSrc, /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\} rotation=\{\[(-?[\d.]+),\s*-?[\d.]+,\s*-?[\d.]+\]\}>/);
const ROOF_GROUP_POS: Vec3 = [ROOF_GROUP[0], ROOF_GROUP[1], ROOF_GROUP[2]];
const ROOF_PITCH = ROOF_GROUP[3];
const SLAB_BOX = triple(shopSrc, /AUTHENTIC LEAN-TO TERRACOTTA SHIELD ROOF[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
const FASCIA_POS = triple(shopSrc, /Front eave fascia board[\s\S]*?<mesh castShadow position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/);
const FASCIA_BOX = triple(shopSrc, /Front eave fascia board[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
const FLASH_POS = triple(shopSrc, /Top wall flashing beam[\s\S]*?<mesh castShadow position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/);
const FLASH_BOX = triple(shopSrc, /Top wall flashing beam[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);

// the props this phase must not disturb
const RACK_GROUP = triple(shopSrc, /<group position=\{\[\s*(-?[\d.]+),\s*0,\s*(-?[\d.]+)\s*\]\}>\s*\{\/\* Dark Timber Frames/);
const DISPLAY_GROUP = triple(shopSrc, /<group position=\{\[\s*(-?[\d.]+),\s*0,\s*(-?[\d.]+)\s*\]\}>\s*\{\/\* Display Rack Wooden Bench/);
const BENCH_GROUP = triple(shopSrc, /<group position=\{\[\s*(-?[\d.]+),\s*0,\s*(-?[\d.]+)\s*\]\}>\s*\{\/\* Oak Workbench Table/);

// ── Transforms (three.js conventions, as the other suites model them) ─────

/** A group's rotation about X turns each child's own centre as well as its extents. */
const rotX = (p: Vec3, t: number): Vec3 => [p[0], p[1] * Math.cos(t) - p[2] * Math.sin(t), p[1] * Math.sin(t) + p[2] * Math.cos(t)];
const add = (p: Vec3, q: Vec3): Vec3 => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
const sub = (p: Vec3, q: Vec3): Vec3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];

type Frame = { group: Vec3; pitch: number };
const SHIPPED: Frame = { group: ROOF_GROUP_POS, pitch: ROOF_PITCH };
// the pre-fix frame, replayed through the identical checks in §G
const PRE_FIX: Frame = { group: [0, 4.25, 0.2], pitch: 0.16 };

/** A point inside the roof group, in world space. */
const childWorld = (frame: Frame, p: Vec3): Vec3 => add(rotX(p, frame.pitch), frame.group);
/** The same, for the whole building. */
const roofWorld = (frame: Frame, p: Vec3): Vec3 => add(childWorld(frame, p), SHOP_ROOT);

/** The group-space z whose underside point lands on a given WORLD Z (root Z included). */
function childZFor(frame: Frame, worldZ: number, halfThickness = SLAB_BOX[1] / 2): number {
  return (worldZ - SHOP_ROOT[2] - frame.group[2] + halfThickness * Math.sin(frame.pitch)) / Math.cos(frame.pitch);
}
/** World Y of the roof's underside plane at a world Z (the slab's own bottom face). */
function undersideAt(frame: Frame, worldZ: number): number {
  const zc = childZFor(frame, worldZ);
  return SHOP_ROOT[1] + frame.group[1] - (SLAB_BOX[1] / 2) * Math.cos(frame.pitch) - zc * Math.sin(frame.pitch);
}
/** World Y of the roof's top plane at a world Z. */
function topsideAt(frame: Frame, worldZ: number): number {
  return undersideAt(frame, worldZ) + (SLAB_BOX[1] / Math.cos(frame.pitch));
}

type Box = { min: Vec3; max: Vec3 };
/** A world-space box for a child of the roof group (position + box args), via its 8 corners. */
function roofBox(frame: Frame, pos: Vec3, size: Vec3): Box {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const w = roofWorld(frame, [pos[0] + (sx * size[0]) / 2, pos[1] + (sy * size[1]) / 2, pos[2] + (sz * size[2]) / 2]);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], w[i]);
      max[i] = Math.max(max[i], w[i]);
    }
  }
  return { min, max };
}
/** A world-space box for an unrotated child of the building root. */
function rootBox(pos: Vec3, size: Vec3): Box {
  const p = add(pos, SHOP_ROOT);
  return {
    min: [p[0] - size[0] / 2, p[1] - size[1] / 2, p[2] - size[2] / 2],
    max: [p[0] + size[0] / 2, p[1] + size[1] / 2, p[2] + size[2] / 2],
  };
}
/** The axis-aligned separation of two boxes (0 on an overlapping axis). */
function sep(a: Box, b: Box): { dx: number; dy: number; dz: number; d: number } {
  const dx = Math.max(0, a.min[0] - b.max[0], b.min[0] - a.max[0]);
  const dy = Math.max(0, a.min[1] - b.max[1], b.min[1] - a.max[1]);
  const dz = Math.max(0, a.min[2] - b.max[2], b.min[2] - a.max[2]);
  return { dx, dy, dz, d: Math.hypot(dx, dy, dz) };
}

// ── The shipped bearings, in world space ─────────────────────────────────

const ROOT: Vec3 = SHOP_ROOT;
const wall = rootBox(WALL_MESH_POS, WALL_BOX);
const WALL_TOP = wall.max[1];
const WALL_FRONT_Z = wall.min[2];
const WALL_REAR_Z = wall.max[2];

const arch = rootBox(ARCH_POS, ARCH_BOX);
const ARCH_TOP = arch.max[1];
const ARCH_FRONT_Z = arch.min[2];
const ARCH_REAR_Z = arch.max[2];

const cap = rootBox([PIER_X[1], PIER_CAP_POS[1], PIER_Z], PIER_CAP_BOX);
const PIER_TOP = cap.max[1];

const slab = roofBox(SHIPPED, [0, 0, 0], SLAB_BOX);
const fascia = roofBox(SHIPPED, FASCIA_POS, FASCIA_BOX);
const flashing = roofBox(SHIPPED, FLASH_POS, FLASH_BOX);

/** The flashing's own bottom/top edges on the wall's rear face plane. */
function flashingRearEdges(frame: Frame) {
  const half = [FLASH_BOX[0] / 2, FLASH_BOX[1] / 2, FLASH_BOX[2] / 2];
  const bottomRear = roofWorld(frame, [0, FLASH_POS[1] - half[1], FLASH_POS[2] + half[2]]);
  const topRear = roofWorld(frame, [0, FLASH_POS[1] + half[1], FLASH_POS[2] + half[2]]);
  return { bottomRear, topRear };
}

// ══════════════════════════════════════════════════════════════════════════
// A. The frame the fix works in
// ══════════════════════════════════════════════════════════════════════════

describe('A. The building, its bearings and the roof frame', () => {
  test('the workshop still stands where C-8.29 measured it', () => {
    expect(SHOP_ROOT).toEqual([28.2, 0, 1]);
    expect(ROOF_GROUP_POS[0]).toBe(0);
    expect(ROOF_GROUP_POS[2]).toBe(0.2);
  });

  test('the lean-to keeps the author’s own 0.16 rad pitch — now falling to the open front', () => {
    expect(ROOF_PITCH).toBeCloseTo(-0.16, 10);
    expect(Math.abs(ROOF_PITCH)).toBeCloseTo(0.16, 10);
  });

  test('the slab, the fascia and the flashing keep their own boxes', () => {
    expect(SLAB_BOX).toEqual([8.6, 0.18, 5.4]);
    expect(FASCIA_BOX).toEqual([8.6, 0.16, 0.12]);
    expect(FLASH_BOX).toEqual([8.6, 0.18, 0.14]);
  });

  test('the front bearing is the architrave on its two piers, untouched by this phase', () => {
    expect(ARCH_POS).toEqual([0, 3.9, -1.5]);
    expect(ARCH_BOX).toEqual([8.2, 0.24, 0.45]);
    expect(ARCH_TOP).toBeCloseTo(4.02, 10);
    // world Z: the root sits at Z 1, so the beam's front face is −0.725 world
    expect(ARCH_FRONT_Z).toBeCloseTo(SHOP_ROOT[2] - 1.725, 10);
    expect(PIER_X).toEqual([-3.6, 3.6]);
    expect(PIER_Z).toBe(-1.5);
    // the beam still beds 0.02 into the impost caps — the project's seat convention
    expect(PIER_TOP).toBeCloseTo(3.8, 10);
    expect(PIER_TOP - (ARCH_TOP - ARCH_BOX[1])).toBeCloseTo(0.02, 10);
  });

  test('the rear wall is the building’s only raised element, and it keeps its footprint', () => {
    expect(WALL_BOX[0]).toBe(8.0);
    expect(WALL_BOX[2]).toBe(1.2);
    expect(WALL_MESH_POS[2]).toBe(1.8);
    expect(wall.min[2]).toBeCloseTo(SHOP_ROOT[2] + 1.2, 10);
    expect(wall.max[2]).toBeCloseTo(SHOP_ROOT[2] + 2.4, 10);
    // the wall stood on the ground before and still does
    expect(wall.min[1]).toBeCloseTo(0, 10);
    expect(WALL_TOP).toBeGreaterThan(4.0);
    expect(WALL_TOP).toBeLessThan(4.6);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The load path — the roof is seated on both bearings
// ══════════════════════════════════════════════════════════════════════════

describe('B. The roof bears on the architrave and on the wall', () => {
  test('the underside is a real plane, falling 0.16 rad toward the open front', () => {
    const dz = 1;
    const slope = (undersideAt(SHIPPED, ARCH_FRONT_Z + dz) - undersideAt(SHIPPED, ARCH_FRONT_Z)) / dz;
    expect(slope).toBeCloseTo(Math.tan(0.16), 10);
    // …i.e. it RISES toward the rear wall: high at the wall, low at the open front
    expect(slope).toBeGreaterThan(0);
    expect(undersideAt(SHIPPED, WALL_FRONT_Z)).toBeGreaterThan(undersideAt(SHIPPED, ARCH_FRONT_Z));
    // and the built corners agree with the plane they are derived from
    const bottomFront = roofWorld(SHIPPED, [0, -SLAB_BOX[1] / 2, -SLAB_BOX[2] / 2]);
    expect(undersideAt(SHIPPED, bottomFront[2])).toBeCloseTo(bottomFront[1], 8);
  });

  test('the front bearing is exact on the architrave’s down-slope edge', () => {
    const gap = undersideAt(SHIPPED, ARCH_FRONT_Z) - ARCH_TOP;
    expect(Math.abs(gap)).toBeLessThanOrEqual(TOL);
    // exact to the 4-dp the group's Y literal is written to (4.4218)
    expect(Math.abs(gap)).toBeLessThan(1e-4);
    // nothing anywhere over the beam’s own footprint is cut into beyond the tolerance
    for (let z = ARCH_FRONT_Z; z <= ARCH_REAR_Z; z += 0.05) {
      expect(undersideAt(SHIPPED, z) - ARCH_TOP).toBeGreaterThan(-TOL);
    }
  });

  test('the wedge the pitch leaves over the beam’s rear half is enclosed, not open', () => {
    // the pocket grows to 0.0726 at the beam's rear edge, but it opens only
    // rearward: at the contact line itself the gap is 0, so no sight line from
    // outside can enter it, and the beam never reaches the slab's top face.
    const pocket = undersideAt(SHIPPED, ARCH_REAR_Z) - ARCH_TOP;
    expect(pocket).toBeCloseTo(0.0726, 3);
    expect(pocket).toBeLessThan(0.45 * Math.tan(0.16) + 1e-9);
    expect(ARCH_TOP).toBeLessThan(topsideAt(SHIPPED, ARCH_REAR_Z));
    expect(undersideAt(SHIPPED, ARCH_REAR_Z)).toBeGreaterThan(ARCH_TOP);
  });

  test('the high bearing is the wall’s top face, bedded inside the tolerance', () => {
    // the plane's height at the wall's front face: the wall's top is that plus its bed
    const planeAtWallFront = undersideAt(SHIPPED, WALL_FRONT_Z);
    const bed = WALL_TOP - planeAtWallFront;
    expect(bed).toBeGreaterThanOrEqual(0);
    expect(bed).toBeLessThanOrEqual(TOL);
    expect(bed).toBeCloseTo(0.0113, 3);
    // the wall's top meets the plane at a single line inside the wall's own depth
    const crossing = WALL_FRONT_Z + bed / Math.tan(0.16);
    expect(crossing).toBeGreaterThan(WALL_FRONT_Z);
    expect(crossing).toBeLessThan(WALL_REAR_Z);
  });

  test('the wall never pokes through the roof it carries', () => {
    expect(WALL_TOP).toBeLessThan(topsideAt(SHIPPED, WALL_FRONT_Z));
    expect(WALL_TOP).toBeLessThan(topsideAt(SHIPPED, WALL_REAR_Z));
    // the void the wall’s level top leaves under the plane, at the wall’s rear face
    expect(undersideAt(SHIPPED, WALL_REAR_Z) - WALL_TOP).toBeCloseTo(0.1823, 3);
  });

  test('the eave overhangs the architrave and clears the pier heads', () => {
    // the fascia is ~0.7 in front of the beam's front face…
    expect(ARCH_FRONT_Z - fascia.min[2]).toBeGreaterThan(0.6);
    // …and hangs above the impost caps it sails past
    expect(fascia.min[1]).toBeGreaterThan(PIER_TOP);
    // the roof itself still spans wider than the wall it covers
    expect(slab.max[0] - slab.min[0]).toBeCloseTo(8.6, 6);
    expect(wall.max[0] - wall.min[0]).toBeCloseTo(8.0, 6);
  });

  test('the building now peaks at the roof’s rear edge, above the wall', () => {
    const rearTop = roofWorld(SHIPPED, [0, SLAB_BOX[1] / 2, SLAB_BOX[2] / 2]);
    const frontTop = roofWorld(SHIPPED, [0, SLAB_BOX[1] / 2, -SLAB_BOX[2] / 2]);
    expect(rearTop[1]).toBeCloseTo(4.9408, 3);
    expect(frontTop[1]).toBeCloseTo(4.0805, 3);
    // the rise across the slab's own length along its top face
    expect(rearTop[1] - frontTop[1]).toBeCloseTo(SLAB_BOX[2] * Math.sin(0.16), 2);
    expect(rearTop[1]).toBeGreaterThan(WALL_TOP);
    expect(undersideAt(SHIPPED, slab.max[2])).toBeGreaterThan(WALL_TOP);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. The flashing — the wall-plate junction, on the wall
// ══════════════════════════════════════════════════════════════════════════

describe('C. The flashing beam closes the junction at the wall', () => {
  const { bottomRear, topRear } = flashingRearEdges(SHIPPED);

  // The component writes its literals to 4 dp, so "exact" here means inside 1e-4 —
  // two orders of magnitude tighter than the 0.02 seating tolerance that governs.
  const EXACT = 1e-4;

  test('its bottom edge rests on the wall’s top at the wall’s rear face', () => {
    expect(Math.abs(bottomRear[2] - WALL_REAR_Z)).toBeLessThan(EXACT);
    expect(Math.abs(bottomRear[1] - WALL_TOP)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(bottomRear[1] - WALL_TOP)).toBeLessThan(EXACT);
  });

  test('its top edge meets the roof’s underside — both exact', () => {
    expect(Math.abs(topRear[1] - undersideAt(SHIPPED, topRear[2]))).toBeLessThanOrEqual(TOL);
    expect(Math.abs(topRear[1] - undersideAt(SHIPPED, topRear[2]))).toBeLessThan(EXACT);
    // the span it fills is the void the wall's level top leaves under the plane
    expect(topRear[1] - bottomRear[1]).toBeCloseTo(FLASH_BOX[1] * Math.cos(0.16), 3);
  });

  test('it no longer overhangs the wall', () => {
    expect(flashing.max[2] - WALL_REAR_Z).toBeLessThanOrEqual(TOL);
    expect(Math.abs(flashing.max[2] - WALL_REAR_Z)).toBeLessThan(EXACT);
    // and it still spans the wall's whole width, plus its own lap each side
    expect(flashing.max[0] - flashing.min[0]).toBeCloseTo(FLASH_BOX[0], 6);
    expect(flashing.min[0]).toBeLessThan(wall.min[0]);
    expect(flashing.max[0]).toBeGreaterThan(wall.max[0]);
  });

  test('the wall’s top is what makes that fit exact', () => {
    // solve the wall's top from the flashing's own box: bottom edge on the wall,
    // top edge on the plane.  The shipped wall must equal that solution.
    const derivedWallTop = undersideAt(SHIPPED, WALL_REAR_Z - FLASH_BOX[1] * Math.abs(Math.sin(0.16))) - FLASH_BOX[1] * Math.cos(0.16);
    expect(Math.abs(WALL_TOP - derivedWallTop)).toBeLessThan(EXACT);
  });

  test('the flashing sits on the wall, not merely against it', () => {
    // its lowest point is its bottom-rear edge; nothing hangs below the wall's top
    const corners: Vec3[] = [];
    for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      corners.push(roofWorld(SHIPPED, [0, FLASH_POS[1] + (sy * FLASH_BOX[1]) / 2, FLASH_POS[2] + (sz * FLASH_BOX[2]) / 2]));
    }
    const lowest = Math.min(...corners.map((c) => c[1]));
    // a seat, never a float: the bottom face beds into the masonry by the tilt's
    // own 0.14 · tan(0.16) = 0.0226 run, hidden below the top plane it bears on
    expect(WALL_TOP - lowest).toBeGreaterThanOrEqual(0);
    expect(WALL_TOP - lowest).toBeLessThan(0.03);
    expect(WALL_TOP - lowest).toBeCloseTo(FLASH_BOX[2] * Math.tan(0.16), 2);
    // and the bedded end is inside the wall's own footprint, not outside it
    for (const c of corners.filter((c) => c[1] < WALL_TOP)) {
      expect(c[2]).toBeLessThanOrEqual(WALL_REAR_Z);
      expect(c[2]).toBeGreaterThan(WALL_FRONT_Z);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. What this phase did not touch
// ══════════════════════════════════════════════════════════════════════════

describe('D. Everything else in the building is the building it was', () => {
  test('the props, the racks and the workbench keep their transforms', () => {
    expect(RACK_GROUP).toEqual([-2.4, 0, -1.0]);
    expect(DISPLAY_GROUP).toEqual([2.6, 0, -1.2]);
    expect(BENCH_GROUP).toEqual([0, 0, -1.2]);
    expect(shopSrc).toContain('<BuildingFoundation size={[8.4, 5.2]} height={0.3} projection={0.25} position={[0, 0, 0.15]} />');
  });

  test('the roof’s front edge did not move toward the General Store', () => {
    const before = roofWorld(PRE_FIX, [0, -SLAB_BOX[1] / 2, -SLAB_BOX[2] / 2]);
    const after = roofWorld(SHIPPED, [0, -SLAB_BOX[1] / 2, -SLAB_BOX[2] / 2]);
    expect(after[2]).toBeGreaterThan(before[2]); // further from the Store, which is at Z -5
    expect(after[2] - before[2]).toBeCloseTo(0.029, 3);
    expect(fascia.min[2]).toBeGreaterThan(before[2]);
  });

  test('the Store, the Forge and the Stable roots are untouched', () => {
    expect(triple(storeSrc, /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/)).toEqual([22, 0, -5]);
    expect(triple(forgeSrc, /return \(\s*<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/)).toEqual([18, 0, 2.6]);
    expect(triple(stableSrc, /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/)).toEqual([26, 0, 15]);
  });

  test('the earlier phases of this workstream are still in place', () => {
    // C-8.49 — the Stable's timber box closing the full 7.0 depth of its roof
    expect(stableSrc).toContain('<boxGeometry args={[0.4, 2.6, 7.0]} />');
    expect(stableSrc).not.toContain('<boxGeometry args={[0.4, 2.6, 6.6]} />');
    // C-8.51 — the bazaar awning seated on its posts
    expect(storeSrc).toContain('<group position={[-2.8, 3.0841, 0]} rotation={[0, 0, 0.2]}');
    // C-8.52 — the Training Hall’s datum-carrying canopy and its trimmed face posts
    expect(hallSrc).toContain('const CANOPY_POS_Y = 0.3 + CANOPY_Y - 0.15;');
    expect(hallSrc).toContain('const FACE_POST_H =');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. No collision or navigation change
// ══════════════════════════════════════════════════════════════════════════

describe('E. Walkability, collision and navigation are untouched', () => {
  const rect = (): RectCollider => {
    const c = CITY_COLLIDERS.find((c) => c.id === 'armor-workshop');
    if (!c || c.type !== 'rect') throw new Error('armor-workshop rect not found');
    return c;
  };

  test('the workshop’s collider is exactly the plinth the foundation formula derives', () => {
    const r = rect();
    // BuildingFoundation: lower step = size + 2 × projection, centred on the root
    const lowerW = 8.4 + 2 * 0.25;
    const lowerD = 5.2 + 2 * 0.25;
    expect(r.hw * 2).toBeCloseTo(lowerW, 6);
    expect(r.hd * 2).toBeCloseTo(lowerD, 6);
    expect(r.cx).toBeCloseTo(SHOP_ROOT[0], 6);
    expect(r.cz).toBeCloseTo(SHOP_ROOT[2] + 0.15, 6);
    expect(foundationSrc).toContain('const lowerWidth = w + projection * 2;');
  });

  test('the registry, the movement constant and the module’s imports are unchanged', () => {
    expect(CITY_COLLIDERS.length).toBe(110);
    expect(CITY_COLLIDERS.filter((c) => c.type === 'rect').length).toBe(31);
    expect(new Set(CITY_COLLIDERS.map((c) => c.id)).size).toBe(CITY_COLLIDERS.length);
    expect(PLAYER_RADIUS).toBe(0.4);
    expect(shopSrc).not.toMatch(/from '\.\.\/\.\.\/utils/);
    expect(shopSrc).not.toMatch(/collisionShapes|cityCollisions/);
  });

  test('the hub, its radius and its arrival are what C-8.47 left', () => {
    const hub = HUB_LOCATIONS.find((h) => h.id === 'armor_workshop');
    expect(hub?.position).toEqual([28.2, 0, 1]);
    expect(hub?.radius).toBe(4.5);
    expect(FAST_TRAVEL_ARRIVALS.armor_workshop).toEqual([28.2, 5.5]);
    // a standable point north of the plinth still raises the workshop's own prompt
    expect(getNearbyHubLocation([28.2, 0, 4.25])?.id).toBe('armor_workshop');
  });

  test('the rendered change is entirely above the player’s plane', () => {
    // every moved face is at or above the architrave’s underside (3.78) — the
    // walkable opening, its piers and its plinth are untouched
    expect(ARCH_TOP - ARCH_BOX[1]).toBeCloseTo(3.78, 10);
    expect(WALL_TOP).toBeGreaterThan(ARCH_TOP - ARCH_BOX[1]);
    expect(slab.min[1]).toBeGreaterThan(ARCH_TOP - ARCH_BOX[1]);
    expect(flashing.min[1]).toBeGreaterThan(ARCH_TOP - ARCH_BOX[1]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. Control — the pre-fix geometry fails the identical rules
// ══════════════════════════════════════════════════════════════════════════

describe('F. Control: the shipped transform is what closes the junctions', () => {
  test('pre-fix, the roof floated 0.38–0.45 above the architrave’s top', () => {
    for (const z of [ARCH_FRONT_Z, (ARCH_FRONT_Z + ARCH_REAR_Z) / 2, ARCH_REAR_Z]) {
      const gap = undersideAt(PRE_FIX, z) - ARCH_TOP;
      expect(gap).toBeGreaterThan(18 * TOL);
      expect(gap).toBeCloseTo(z === -1.5 ? 0.4132 : z === ARCH_FRONT_Z ? 0.4495 : 0.3769, 3);
    }
    // …and the shipped plane passes the very same check on all three
    for (const z of [ARCH_FRONT_Z, ARCH_REAR_Z]) {
      expect(Math.abs(undersideAt(SHIPPED, z) - ARCH_TOP)).toBeLessThanOrEqual(0.45 * Math.tan(0.16) + 1e-9);
    }
  });

  test('pre-fix, the wall drove through the slab’s top face', () => {
    expect(4.0 - topsideAt(PRE_FIX, WALL_REAR_Z)).toBeCloseTo(0.0139, 3);
    expect(4.0).toBeGreaterThan(topsideAt(PRE_FIX, WALL_REAR_Z)); // poking through
    // the shipped wall is below the slab’s top face at both wall faces
    expect(WALL_TOP).toBeLessThan(topsideAt(SHIPPED, WALL_FRONT_Z));
    expect(WALL_TOP).toBeLessThan(topsideAt(SHIPPED, WALL_REAR_Z));
  });

  test('pre-fix, the flashing hung 0.48 past the wall — the shipped one does not', () => {
    const pre = roofBox(PRE_FIX, [0, 0.1, 2.7], FLASH_BOX);
    expect(pre.max[2] - WALL_REAR_Z).toBeCloseTo(0.4814, 3);
    expect(pre.max[2] - WALL_REAR_Z).toBeGreaterThan(20 * TOL);
    expect(flashing.max[2] - WALL_REAR_Z).toBeLessThanOrEqual(TOL);
  });

  test('pre-fix, the roof fell the wrong way', () => {
    const preSlope = (undersideAt(PRE_FIX, ARCH_REAR_Z) - undersideAt(PRE_FIX, ARCH_FRONT_Z)) / (ARCH_REAR_Z - ARCH_FRONT_Z);
    expect(preSlope).toBeLessThan(0); // down toward the rear wall
    const slopeNow = (undersideAt(SHIPPED, ARCH_REAR_Z) - undersideAt(SHIPPED, ARCH_FRONT_Z)) / (ARCH_REAR_Z - ARCH_FRONT_Z);
    expect(slopeNow).toBeGreaterThan(0); // now down toward the open front
  });
});
