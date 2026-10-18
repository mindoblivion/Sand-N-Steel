/**
 * Phase C-8.29 — General Store ↔ Armor & Leather Workshop clearance audit.
 *
 * ── THE REPORTED CONDITION ─────────────────────────────────────────────────
 * A previous audit flagged a "remaining potential conflict" between the two
 * buildings, quoting General Store plinth max Z ≈ −1.85, Armor Workshop plinth
 * min Z ≈ −1.70, "Z clearance 0.15", "X overlap 2.10".
 *
 * ── WHAT THE GEOMETRY ACTUALLY IS (re-derived here, not restated) ──────────
 *   • Both buildings are UNROTATED (the only rotations anywhere in them are the
 *     Store's roof slabs about Z and the Workshop's lean-to roof group about X),
 *     so their world-axis footprints are exact, not conservative bounds.
 *   • The 0.15 is a GAP, not an overlap: the two plinth lower steps do not
 *     touch.  2.10 is the X overlap of two diagonal neighbours whose Z bands
 *     are separate — which is why the pair ever looked suspicious.
 *   • Widening the check to every visible solid of both buildings (plinth
 *     steps, walls, quoins, cornices, both roof assemblies, awning, counters,
 *     crates, lantern, piers, racks) yields ZERO interpenetrations.  The
 *     closest approach in 3D is exactly that 0.150 plinth gap; the next
 *     closest pair (Store roof slab ↔ Workshop eave fascia) clears in both Z
 *     (0.203) and Y (0.060).  The extreme overhangs — Store ridge cap at
 *     Z = −1.710, Workshop plinth at Z = −1.700 — pass over each other in
 *     disjoint vertical bands (6.16 … 6.33 against 0.00 … 0.14).
 *   • The collision registry is NOT mismatched: both rects equal their
 *     rendered plinth lower steps to machine precision, including the
 *     Workshop's +0.15 plinth offset (collider centre Z = 1.15).
 *
 * ── OUTCOME ────────────────────────────────────────────────────────────────
 * No production transform changed and no collider moved.  A collider is never
 * moved to solve a mesh problem, and here there is no mesh problem to solve.
 * This suite pins the measured geometry so a future move of either building
 * (or a width/depth edit) that closes, opens or re-opens the junction fails
 * loudly, and it proves with the real movement resolver that the 0.15 band is
 * a dead pocket no player can enter or snag in.
 *
 * Run with: bun test src/utils/phaseC8_29.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  PLAYER_RADIUS,
  CITY_COLLIDERS,
  collidesWith,
  overlappingColliderIds,
  type RectCollider,
} from './collisionShapes';
import { resolveCityMovement, clearRecoveryHistory } from './cityCollisions';

// ── Sources ───────────────────────────────────────────────────────────────

const load = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const storeSrc = load('../components/3d/city/GeneralStore.tsx');
const shopSrc = load('../components/3d/city/ArmorLeatherWorkshop.tsx');
const foundationSrc = load('../components/3d/city/BuildingFoundation.tsx');
const propsSrc = load('../components/3d/city/CivicFurnishingProps.tsx');

const R = PLAYER_RADIUS;
/** Movement step used by the production resolver defaults. */
const SPEED = 3.8;
const DT = 1 / 60;

// ── Tiny parsers (same style as the C-8.18 … C-8.28 suites) ───────────────

function nums(src: string, re: RegExp): number[] {
  const m = re.exec(src);
  if (!m) throw new Error(`not found: ${re}`);
  return m.slice(1).map(Number);
}
const num = (src: string, re: RegExp): number => nums(src, re)[0];
function pair(src: string, re: RegExp): [number, number] {
  const n = nums(src, re);
  return [n[0], n[1]];
}
function triple(src: string, re: RegExp): [number, number, number] {
  const n = nums(src, re);
  return [n[0], n[1], n[2]];
}
function findRect(id: string): RectCollider {
  const c = CITY_COLLIDERS.find((c) => c.id === id);
  if (!c || c.type !== 'rect') throw new Error(`Rect collider '${id}' not found`);
  return c;
}

// ── Box / transform helpers ───────────────────────────────────────────────
//
// three.js composes a child as parent(T·R) · child(T·R): an object's OWN
// rotation turns only its half-extents (its position is the final centre),
// whereas a PARENT group's rotation turns each child's centre as well.  Both
// cases occur below and are modelled separately.

interface Box { cx: number; cy: number; cz: number; hx: number; hy: number; hz: number }
interface AABB { name: string; min: [number, number, number]; max: [number, number, number] }

const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): Box => ({ cx, cy, cz, hx, hy, hz });
const shift = (b: Box, dx: number, dy: number, dz: number): Box => ({ ...b, cx: b.cx + dx, cy: b.cy + dy, cz: b.cz + dz });

/** Half-extents of a box after a rotation about its OWN Z axis. */
function ownRotZ(b: Box, th: number): Box {
  const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
  return { ...b, hx: b.hx * c + b.hy * s, hy: b.hx * s + b.hy * c };
}
/** Centre and half-extents of a child box carried by a parent group's X rotation. */
function groupRotX(b: Box, th: number): Box {
  const c = Math.cos(th), s = Math.sin(th);
  return {
    cx: b.cx,
    cy: b.cy * c - b.cz * s,
    cz: b.cy * s + b.cz * c,
    hx: b.hx,
    hy: Math.abs(b.hy * c) + Math.abs(b.hz * s),
    hz: Math.abs(b.hy * s) + Math.abs(b.hz * c),
  };
}
const toWorld = (name: string, b: Box, root: [number, number, number]): AABB => ({
  name,
  min: [b.cx - b.hx + root[0], b.cy - b.hy + root[1], b.cz - b.hz + root[2]],
  max: [b.cx + b.hx + root[0], b.cy + b.hy + root[1], b.cz + b.hz + root[2]],
});
/** Per-axis separation; negative means the two bands overlap on that axis. */
const axisGap = (a: AABB, b: AABB, i: number) => Math.max(a.min[i] - b.max[i], b.min[i] - a.max[i]);
const gap3 = (a: AABB, b: AABB) => Math.max(0, ...[0, 1, 2].map((i) => axisGap(a, b, i)));
const intersects = (a: AABB, b: AABB) =>
  a.min.every((v, i) => v <= b.max[i]) && b.min.every((v, i) => v <= a.max[i]);

// ── The two buildings, as their sources render them ───────────────────────

const ROOT_RE = /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*\{\/\* 0\. STEPPED TRAVERTINE/;
const GS_ROOT = triple(storeSrc, ROOT_RE);
const SHOP_ROOT = triple(shopSrc, ROOT_RE);

const FOUNDATION_RE = /<BuildingFoundation\s+size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/;
const GS_FOUNDATION = pair(storeSrc, FOUNDATION_RE);
const SHOP_FOUNDATION = pair(shopSrc, FOUNDATION_RE);
const GS_PROJECTION = num(storeSrc, /<BuildingFoundation[\s\S]*?projection=\{([\d.]+)\}/);
const SHOP_PROJECTION = num(shopSrc, /<BuildingFoundation[\s\S]*?projection=\{([\d.]+)\}/);
const SHOP_FOUNDATION_OFFSET = triple(shopSrc, /<BuildingFoundation[\s\S]*?position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/);

/** The stepped plinth, exactly as `BuildingFoundation` builds it. */
function plinth(size: [number, number], height: number, projection: number, offset: [number, number, number]) {
  const [w, d] = size;
  const lowerH = height * 0.45, upperH = height * 0.55;
  return {
    lower: shift(box(0, lowerH / 2, 0, (w + projection * 2) / 2, lowerH / 2, (d + projection * 2) / 2), ...offset),
    upper: shift(
      box(0, lowerH + upperH / 2, 0, (w + projection * 1.2) / 2, upperH / 2, (d + projection * 1.2) / 2),
      ...offset,
    ),
  };
}

// GeneralStore -----------------------------------------------------------------
const GS_WALL_Y = num(storeSrc, /<mesh castShadow receiveShadow position=\{\[0, ([\d.]+), 0\]\}>/);
const GS_WALL = triple(storeSrc, /<mesh castShadow receiveShadow position=\{\[0, [\d.]+, 0\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
const GS_QUOIN_H = num(storeSrc, /<CornerQuoins height=\{([\d.]+)\}/);
const GS_QUOIN_SIZE = pair(storeSrc, /<CornerQuoins height=\{[\d.]+\} buildingSize=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
const GS_CORNICE_SIZE = pair(storeSrc, /<WallCornice size=\{\[\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
const GS_CORNICE_Y = num(storeSrc, /<WallCornice[\s\S]*?y=\{([\d.]+)\}/);
const GS_CORNICE_H = num(storeSrc, /<WallCornice[\s\S]*?height=\{([\d.]+)\}/);
const GS_CORNICE_PROJ = num(storeSrc, /<WallCornice[\s\S]*?projection=\{([\d.]+)\}/);
const GS_ROOF = {
  width: num(storeSrc, /<RomanGabledRoof[\s\S]*?width=\{([\d.]+)\}/),
  depth: num(storeSrc, /<RomanGabledRoof[\s\S]*?depth=\{([\d.]+)\}/),
  height: num(storeSrc, /<RomanGabledRoof[\s\S]*?height=\{([\d.]+)\}/),
  overhang: num(storeSrc, /<RomanGabledRoof[\s\S]*?eaveOverhang=\{([\d.]+)\}/),
  pos: triple(storeSrc, /<RomanGabledRoof[\s\S]*?position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/),
};
const GS_AWNING = nums(storeSrc, /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\} rotation=\{\[\s*0,\s*0,\s*(-?[\d.]+)\s*\]\} ref=\{canopyRef\}>/);
const GS_AWNING_BOX = triple(storeSrc, /ref=\{canopyRef\}>[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\} \/>/);
const GS_POST = nums(storeSrc, /\{\[(-?[\d.]+)\]\.map\(\(px, pi\) =>\s*\[(-?[\d.]+),\s*(-?[\d.]+)\]\.map/); // [x, z-, z+]
const GS_POST_R = Math.max(...nums(storeSrc, /<cylinderGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*2\.8,\s*8\]\}/));
const GS_COUNTER_X = num(storeSrc, /<group position=\{\[\s*(-?[\d.]+),\s*0,\s*0\s*\]\}>\s*\{\/\* Timber Counter Table/);
const GS_COUNTER_BOX = triple(storeSrc, /<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\} \/>\s*<meshStandardMaterial color="#593a1c"/);
const GS_COUNTER_Y = num(storeSrc, /<mesh castShadow receiveShadow position=\{\[0,\s*([\d.]+),\s*0\]\}>\s*<boxGeometry args=\{\[\s*1\.2,/);
const GS_GOODS = pair(storeSrc, /<group position=\{\[\s*(-?[\d.]+),\s*0,\s*(-?[\d.]+)\s*\]\}>\s*<TimberCrate position=\{\[0, 0, 0\]\}/); // [x, z]
const GS_CRATE = triple(storeSrc, /<TimberCrate position=\{\[0, 0, 0\]\} size=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
const GS_CRATE2 = nums(storeSrc, /<TimberCrate position=\{\[\s*(-?[\d.]+),\s*-?[\d.]+,\s*(-?[\d.]+)\s*\]\} size=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\} rotationY=\{(-?[\d.]+)\}/);
const GS_BARREL = triple(storeSrc, /<WineBarrel position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}/);
// The barrel and its hoops are built by the shared prop primitive, not the store.
const GS_BARREL_R = Math.max(...nums(propsSrc, /Bulged Stave[\s\S]{0,160}?<cylinderGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*0\.9, 12\]\}/));
const GS_LANTERN = nums(storeSrc, /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*<mesh castShadow>\s*<cylinderGeometry args=\{\[0\.16,\s*([\d.]+),\s*([\d.]+), 8\]\}/);

// ArmorLeatherWorkshop ---------------------------------------------------------
const SHOP_WALL_POS = triple(shopSrc, /<mesh castShadow receiveShadow position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*<boxGeometry args=\{\[\s*8\.0,/);
const SHOP_WALL = triple(shopSrc, /<mesh castShadow receiveShadow position=\{\[\s*-?[\d.]+,\s*-?[\d.]+,\s*-?[\d.]+\s*\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
const SHOP_PIER_X = pair(shopSrc, /\{\[\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\.map\(\(x, i\) =>/);
const SHOP_PIER_BOX = triple(shopSrc, /<mesh castShadow receiveShadow position=\{\[0,\s*[\d.]+,\s*0\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
const SHOP_PIER_TOP = num(shopSrc, /<mesh castShadow position=\{\[0,\s*([\d.]+),\s*0\]\}>\s*<boxGeometry args=\{\[\s*0\.95, 0\.2/);
const SHOP_ARCHITRAVE_POS = triple(shopSrc, /<mesh castShadow position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>\s*<boxGeometry args=\{\[\s*8\.2,/);
const SHOP_ARCHITRAVE = triple(shopSrc, /<mesh castShadow position=\{\[\s*-?[\d.]+,\s*-?[\d.]+,\s*-?[\d.]+\s*\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
const SHOP_ROOF_GROUP = nums(shopSrc, /<group position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\} rotation=\{\[([\d.]+),/); // [x, y, z, theta]
const SHOP_ROOF_PLANE = triple(shopSrc, /LEAN-TO TERRACOTTA SHIELD ROOF[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
const SHOP_EAVE_POS = triple(shopSrc, /Front eave fascia board[\s\S]*?<mesh castShadow position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/);
const SHOP_EAVE_BOX = triple(shopSrc, /Front eave fascia board[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
const SHOP_FLASH_POS = triple(shopSrc, /Top wall flashing beam[\s\S]*?<mesh castShadow position=\{\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]\}>/);
const SHOP_FLASH_BOX = triple(shopSrc, /Top wall flashing beam[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
const SHOP_RACK_POS = pair(shopSrc, /<group position=\{\[\s*(-?[\d.]+),\s*0,\s*(-?[\d.]+)\s*\]\}>\s*\{\/\* Dark Timber Frames/);
const SHOP_RACK_FRAME_X = num(shopSrc, /<mesh castShadow position=\{\[\s*(-?[\d.]+),\s*1\.5,\s*0\]\}>/);
const SHOP_RACK_BOX = triple(shopSrc, /<mesh castShadow position=\{\[\s*-?[\d.]+,\s*1\.5,\s*0\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/);
const SHOP_DISPLAY_POS = pair(shopSrc, /<group position=\{\[\s*(-?[\d.]+),\s*0,\s*(-?[\d.]+)\s*\]\}>\s*\{\/\* Display Rack Wooden Bench/);
const SHOP_DISPLAY_BOX = triple(shopSrc, /<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\} \/>\s*<meshStandardMaterial color="#451a03"/);
const SHOP_TARGET_R = num(shopSrc, /rotation=\{\[0\.2, -0\.2, 0\]\}>\s*<cylinderGeometry args=\{\[\s*([\d.]+),/);
const SHOP_BENCH_Z = num(shopSrc, /<group position=\{\[0, 0, (-?[\d.]+)\]\}>\s*\{\/\* Oak Workbench Table/);
const SHOP_BENCH_BOX = triple(shopSrc, /<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\} \/>\s*<meshStandardMaterial color="#5c3f1f"/);

// ── Every visible solid of each building, in world space ──────────────────

const gsPlinth = plinth(GS_FOUNDATION, 0.3, GS_PROJECTION, [0, 0, 0]);
const gsHalfSpan = GS_ROOF.width / 2 + GS_ROOF.overhang;
const gsFullLength = GS_ROOF.depth + GS_ROOF.overhang * 2;
const gsSlope = Math.atan2(GS_ROOF.height, gsHalfSpan);
const gsRafter = Math.hypot(gsHalfSpan, GS_ROOF.height);
const gsGoodsX = GS_COUNTER_X + GS_GOODS[0];
const gsCrate2Projection = Math.cos(GS_CRATE2[5]) + Math.sin(GS_CRATE2[5]);

const GS_PIECES: AABB[] = [
  toWorld('store.plinth-lower', gsPlinth.lower, GS_ROOT),
  toWorld('store.plinth-upper', gsPlinth.upper, GS_ROOT),
  toWorld('store.wall', box(0, GS_WALL_Y, 0, GS_WALL[0] / 2, GS_WALL[1] / 2, GS_WALL[2] / 2), GS_ROOT),
  // Corner quoins: the widest block of each pair (0.35) is centred on the footprint corner.
  toWorld('store.quoins', box(0, GS_QUOIN_H / 2, 0, GS_QUOIN_SIZE[0] / 2 + 0.175, GS_QUOIN_H / 2, GS_QUOIN_SIZE[1] / 2 + 0.175), GS_ROOT),
  toWorld('store.cornice', box(0, GS_CORNICE_Y, 0, GS_CORNICE_SIZE[0] / 2 + GS_CORNICE_PROJ, GS_CORNICE_H / 2, GS_CORNICE_SIZE[1] / 2 + GS_CORNICE_PROJ), GS_ROOT),
  toWorld('store.roof-fascia', box(0, GS_ROOF.pos[1] - 0.08, 0, (GS_ROOF.width + GS_ROOF.overhang * 1.2) / 2, 0.16 / 2, (GS_ROOF.depth + GS_ROOF.overhang * 1.2) / 2), GS_ROOT),
  toWorld('store.roof-plane-L', shift(ownRotZ(box(-gsHalfSpan / 2, GS_ROOF.height / 2 + 0.04, 0, gsRafter / 2, 0.15 / 2, gsFullLength / 2), gsSlope), 0, GS_ROOF.pos[1], 0), GS_ROOT),
  toWorld('store.roof-plane-R', shift(ownRotZ(box(gsHalfSpan / 2, GS_ROOF.height / 2 + 0.04, 0, gsRafter / 2, 0.15 / 2, gsFullLength / 2), -gsSlope), 0, GS_ROOF.pos[1], 0), GS_ROOT),
  toWorld('store.ridge-cap', box(0, GS_ROOF.pos[1] + GS_ROOF.height + 0.095, 0, 0.32 / 2, 0.18 / 2, (gsFullLength + 0.08) / 2), GS_ROOT),
  toWorld('store.tympanum-front', box(0, GS_ROOF.pos[1] + GS_ROOF.height / 2, GS_ROOF.depth / 2 + 0.02, GS_ROOF.width / 2, GS_ROOF.height / 2, 0.01), GS_ROOT),
  toWorld('store.tympanum-rear', box(0, GS_ROOF.pos[1] + GS_ROOF.height / 2, -(GS_ROOF.depth / 2 + 0.02), GS_ROOF.width / 2, GS_ROOF.height / 2, 0.01), GS_ROOT),
  toWorld('store.awning', shift(ownRotZ(box(0, 0, 0, GS_AWNING_BOX[0] / 2, GS_AWNING_BOX[1] / 2, GS_AWNING_BOX[2] / 2), GS_AWNING[3]), GS_AWNING[0], GS_AWNING[1], GS_AWNING[2]), GS_ROOT),
  toWorld('store.post-front', box(GS_POST[0], 1.4, GS_POST[2], GS_POST_R, 1.4, GS_POST_R), GS_ROOT),
  toWorld('store.post-rear', box(GS_POST[0], 1.4, GS_POST[1], GS_POST_R, 1.4, GS_POST_R), GS_ROOT),
  toWorld('store.counter', shift(box(0, GS_COUNTER_Y, 0, GS_COUNTER_BOX[0] / 2, GS_COUNTER_BOX[1] / 2, GS_COUNTER_BOX[2] / 2), GS_COUNTER_X, 0, 0), GS_ROOT),
  toWorld('store.crate', shift(box(0, GS_CRATE[1] / 2, 0, GS_CRATE[0] / 2 + 0.01, GS_CRATE[1] / 2, GS_CRATE[2] / 2 + 0.01), gsGoodsX, 0, GS_GOODS[1]), GS_ROOT),
  // Second crate is rotated about Y: its axis-aligned half-width is r·(cos+sin).
  toWorld('store.crate2', shift(box(GS_CRATE2[0], GS_CRATE2[3] / 2, GS_CRATE2[1], (GS_CRATE2[2] / 2) * gsCrate2Projection, GS_CRATE2[3] / 2, (GS_CRATE2[4] / 2) * gsCrate2Projection), gsGoodsX, 0, GS_GOODS[1]), GS_ROOT),
  toWorld('store.goods-barrel', shift(box(GS_BARREL[0], GS_BARREL[1] + 0.45, GS_BARREL[2], GS_BARREL_R, 0.45, GS_BARREL_R), gsGoodsX, 0, GS_GOODS[1]), GS_ROOT),
  toWorld('store.lantern', box(GS_LANTERN[0], GS_LANTERN[1], GS_LANTERN[2], GS_LANTERN[3], GS_LANTERN[4] / 2, GS_LANTERN[3]), GS_ROOT),
];

const shopPlinth = plinth(SHOP_FOUNDATION, 0.3, SHOP_PROJECTION, SHOP_FOUNDATION_OFFSET);
const shopRoofRot = SHOP_ROOF_GROUP[3];
const roofChild = (pos: [number, number, number], size: [number, number, number]): Box =>
  shift(
    groupRotX(box(pos[0], pos[1], pos[2], size[0] / 2, size[1] / 2, size[2] / 2), shopRoofRot),
    SHOP_ROOF_GROUP[0], SHOP_ROOF_GROUP[1], SHOP_ROOF_GROUP[2],
  );

const SHOP_PIECES: AABB[] = [
  toWorld('shop.plinth-lower', shopPlinth.lower, SHOP_ROOT),
  toWorld('shop.plinth-upper', shopPlinth.upper, SHOP_ROOT),
  toWorld('shop.rear-wall', box(SHOP_WALL_POS[0], SHOP_WALL_POS[1], SHOP_WALL_POS[2], SHOP_WALL[0] / 2, SHOP_WALL[1] / 2, SHOP_WALL[2] / 2), SHOP_ROOT),
  // Both piers: stepped base 0.2 … shaft … impost cap, so the full column is 0 … top.
  ...SHOP_PIER_X.map((px, i) =>
    toWorld(`shop.pier-${i === 0 ? 'L' : 'R'}`, box(px, SHOP_PIER_TOP / 2, -1.5, SHOP_PIER_BOX[0] / 2, SHOP_PIER_TOP / 2, SHOP_PIER_BOX[2] / 2), SHOP_ROOT),
  ),
  toWorld('shop.architrave', box(SHOP_ARCHITRAVE_POS[0], SHOP_ARCHITRAVE_POS[1], SHOP_ARCHITRAVE_POS[2], SHOP_ARCHITRAVE[0] / 2, SHOP_ARCHITRAVE[1] / 2, SHOP_ARCHITRAVE[2] / 2), SHOP_ROOT),
  toWorld('shop.roof-plane', roofChild([0, 0, 0], SHOP_ROOF_PLANE), SHOP_ROOT),
  toWorld('shop.roof-eave-fascia', roofChild(SHOP_EAVE_POS, SHOP_EAVE_BOX), SHOP_ROOT),
  toWorld('shop.roof-flashing', roofChild(SHOP_FLASH_POS, SHOP_FLASH_BOX), SHOP_ROOT),
  toWorld('shop.tanning-rack', shift(box(0, SHOP_RACK_BOX[1] / 2, 0, Math.abs(SHOP_RACK_FRAME_X) + SHOP_RACK_BOX[0] / 2, SHOP_RACK_BOX[1] / 2, SHOP_RACK_BOX[2] / 2 + 0.04), SHOP_RACK_POS[0], 0, SHOP_RACK_POS[1]), SHOP_ROOT),
  // Display rack: bench + scutum + bronze target together, one conservative solid.
  toWorld('shop.display-rack', shift(box(0, 0.9, 0, SHOP_DISPLAY_BOX[0] / 2 + SHOP_TARGET_R, 0.9, SHOP_DISPLAY_BOX[2] / 2), SHOP_DISPLAY_POS[0], 0, SHOP_DISPLAY_POS[1]), SHOP_ROOT),
  toWorld('shop.workbench', shift(box(0, SHOP_BENCH_BOX[1] / 2, 0, SHOP_BENCH_BOX[0] / 2, SHOP_BENCH_BOX[1] / 2, SHOP_BENCH_BOX[2] / 2), 0, 0, SHOP_BENCH_Z), SHOP_ROOT),
];

const gsPlinthLower = GS_PIECES[0];
const shopPlinthLower = SHOP_PIECES[0];

/** Ascending 3D AABB separation between every Store solid and every Shop solid. */
const separations = GS_PIECES.flatMap((a) =>
  SHOP_PIECES.map((b) => ({ a: a.name, b: b.name, d: gap3(a, b), dx: axisGap(a, b, 0), dy: axisGap(a, b, 1), dz: axisGap(a, b, 2) })),
).sort((p, q) => p.d - q.d);
const separationOf = (a: string, b: string) => {
  const s = separations.find((p) => p.a === a && p.b === b);
  if (!s) throw new Error(`no separation recorded for ${a} ↔ ${b}`);
  return s;
};

// ── Movement harness (the real resolver) ──────────────────────────────────

interface PushResult { end: [number, number]; trail: Array<[number, number]> }

function push(x: number, z: number, dx: number, dz: number, steps = 240): PushResult {
  clearRecoveryHistory();
  let p: [number, number, number] = [x, 0, z];
  const trail: Array<[number, number]> = [[x, z]];
  for (let i = 0; i < steps; i++) {
    p = resolveCityMovement(p, dx, dz, SPEED, DT);
    trail.push([p[0], p[2]]);
  }
  return { end: [p[0], p[2]], trail };
}
const everInside = (r: PushResult) => r.trail.some(([x, z]) => collidesWith(x, z, R, CITY_COLLIDERS));

// ══════════════════════════════════════════════════════════════════════════
// A. The reported figures, re-derived from the source geometry
// ══════════════════════════════════════════════════════════════════════════

describe('A. Store ↔ Workshop footprints, re-measured from source', () => {
  test('both roots are the audited ones and neither building is rotated', () => {
    expect(GS_ROOT).toEqual([22, 0, -5]);
    expect(SHOP_ROOT).toEqual([28.2, 0, 1]);
    expect(storeSrc).toContain('<group position={[22, 0, -5]}>');
    expect(shopSrc).toContain('<group position={[28.2, 0, 1]}>');
    expect(storeSrc).not.toContain('<group position={[22, 0, -5]} rotation=');
    expect(shopSrc).not.toContain('<group position={[28.2, 0, 1]} rotation=');
  });

  test('the plinths are the foundation footprints the audit quoted', () => {
    expect(GS_FOUNDATION).toEqual([7.2, 5.8]);
    expect(GS_PROJECTION).toBe(0.25);
    expect(SHOP_FOUNDATION).toEqual([8.4, 5.2]);
    expect(SHOP_PROJECTION).toBe(0.25);
    expect(SHOP_FOUNDATION_OFFSET).toEqual([0, 0, 0.15]); // the Workshop plinth is offset +0.15 in Z

    // BuildingFoundation's documented lower-step formula: size + 2·projection.
    expect(gsPlinthLower.min[0]).toBeCloseTo(18.15, 10);
    expect(gsPlinthLower.max[0]).toBeCloseTo(25.85, 10);
    expect(gsPlinthLower.min[2]).toBeCloseTo(-8.15, 10);
    expect(gsPlinthLower.max[2]).toBeCloseTo(-1.85, 10); // audit figure: −1.85

    expect(shopPlinthLower.min[0]).toBeCloseTo(23.75, 10);
    expect(shopPlinthLower.max[0]).toBeCloseTo(32.65, 10);
    expect(shopPlinthLower.min[2]).toBeCloseTo(-1.70, 10); // audit figure: −1.70
    expect(shopPlinthLower.max[2]).toBeCloseTo(4.00, 10);
  });

  test('the reported 0.15 is a Z GAP and the 2.10 is an X overlap of neighbours', () => {
    const zGap = axisGap(gsPlinthLower, shopPlinthLower, 2);
    const xOverlap = -axisGap(gsPlinthLower, shopPlinthLower, 0);
    expect(zGap).toBeCloseTo(0.15, 10);     // audit figure: 0.15 clearance
    expect(zGap).toBeGreaterThan(0);        // …and it is separation, not interpenetration
    expect(xOverlap).toBeCloseTo(2.10, 10); // audit figure: 2.10 X overlap
  });

  test('BuildingFoundation really is the source of that formula', () => {
    expect(foundationSrc).toContain('const lowerWidth = w + projection * 2;');
    expect(foundationSrc).toContain('const lowerDepth = d + projection * 2;');
    expect(foundationSrc).toContain('const lowerHeight = height * 0.45;');
    expect(foundationSrc).toContain('const upperHeight = height * 0.55;');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. Every visible solid: no interpenetration anywhere
// ══════════════════════════════════════════════════════════════════════════

describe('B. The full rendered extents (roofs, eaves, quoins included) do not intersect', () => {
  test('the piece lists are what the two components render', () => {
    expect(new Set(GS_PIECES.map((p) => p.name)).size).toBe(GS_PIECES.length);
    expect(new Set(SHOP_PIECES.map((p) => p.name)).size).toBe(SHOP_PIECES.length);
    expect(GS_PIECES.length).toBe(19);
    expect(SHOP_PIECES.length).toBe(12);
    // Spot-check the parsed roof so a source edit cannot silently empty a list.
    expect(GS_ROOF.width).toBe(7.2);
    expect(GS_ROOF.depth).toBe(5.8);
    expect(GS_ROOF.overhang).toBe(0.35);
    expect(GS_ROOF.pos).toEqual([0, 4.8, 0]);
    expect(SHOP_ROOF_PLANE).toEqual([8.6, 0.18, 5.4]);
    expect(SHOP_EAVE_BOX).toEqual([8.6, 0.16, 0.12]);
    expect(shopRoofRot).toBe(0.16);
  });

  test('no Store solid intersects any Workshop solid', () => {
    const hits: string[] = [];
    for (const a of GS_PIECES) for (const b of SHOP_PIECES) if (intersects(a, b)) hits.push(`${a.name} ∩ ${b.name}`);
    expect(hits).toEqual([]);
  });

  test('the closest approach in 3D is exactly the 0.150 plinth gap', () => {
    expect(separations[0].a).toBe('store.plinth-lower');
    expect(separations[0].b).toBe('shop.plinth-lower');
    expect(separations[0].d).toBeCloseTo(0.15, 10);
    expect(separations[0].dx).toBeLessThan(0);        // X bands do overlap…
    expect(separations[0].dz).toBeCloseTo(0.15, 10);  // …so the separation is entirely in Z
  });

  test('the next closest pair clears in both Z and Y', () => {
    const next = separationOf('store.roof-plane-R', 'shop.roof-eave-fascia');
    expect(next.d).toBeCloseTo(0.203, 3);
    expect(next.dz).toBeGreaterThan(0.2); // the Store roof stops short of the eave board…
    expect(next.dy).toBeGreaterThan(0.05); // …and the two sit in different height bands
    // Nothing anywhere in the pair comes closer than the plinth gap.
    expect(separations.filter((s) => s.d < 0.15 - 1e-9)).toEqual([]);
  });

  test('the extreme overhangs pass over each other, never through', () => {
    const storeNorth = GS_PIECES.reduce((m, p) => (p.max[2] > m.max[2] ? p : m));
    const shopSouth = SHOP_PIECES.reduce((m, p) => (p.min[2] < m.min[2] ? p : m));
    expect(storeNorth.name).toBe('store.ridge-cap');
    expect(shopSouth.name).toBe('shop.plinth-lower');
    expect(storeNorth.max[2]).toBeCloseTo(-1.710, 3);
    expect(shopSouth.min[2]).toBeCloseTo(-1.700, 3);
    // Only 0.010 apart in Z — but in disjoint vertical bands (a ~6 m roof cap
    // against a ground plinth), so they cannot touch.
    expect(storeNorth.min[1]).toBeGreaterThan(shopSouth.max[1] + 5.5);
    expect(intersects(storeNorth, shopSouth)).toBe(false);
    // The Store's roof slabs likewise clear the Workshop's plinth band by height.
    const storeRoof = GS_PIECES.find((p) => p.name === 'store.roof-plane-L')!;
    expect(storeRoof.min[1]).toBeGreaterThan(4.7);
    expect(storeRoof.max[2]).toBeCloseTo(-1.75, 10);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. The registry models the rendered plinths — no collider/render mismatch
// ══════════════════════════════════════════════════════════════════════════

describe('C. The collision registry matches the rendered plinths exactly', () => {
  test('general-store and armor-workshop rects equal their lower steps', () => {
    for (const [id, rendered] of [
      ['general-store', gsPlinthLower],
      ['armor-workshop', shopPlinthLower],
    ] as const) {
      const c = findRect(id);
      expect(c.cx - c.hw, `${id} west face`).toBeCloseTo(rendered.min[0], 10);
      expect(c.cx + c.hw, `${id} east face`).toBeCloseTo(rendered.max[0], 10);
      expect(c.cz - c.hd, `${id} south face`).toBeCloseTo(rendered.min[2], 10);
      expect(c.cz + c.hd, `${id} north face`).toBeCloseTo(rendered.max[2], 10);
    }
    // The Workshop's collider carries the same +0.15 plinth offset (centre Z = 1.15).
    expect(findRect('armor-workshop').cz).toBeCloseTo(SHOP_ROOT[2] + SHOP_FOUNDATION_OFFSET[2], 10);
    expect(findRect('general-store')).toMatchObject({ cx: 22, cz: -5, hw: 3.85, hd: 3.15 });
    expect(findRect('armor-workshop')).toMatchObject({ cx: 28.2, cz: 1.15, hw: 4.45, hd: 2.85 });
  });

  test('the two buildings are the only colliders deciding this junction', () => {
    const nearTheJunction = CITY_COLLIDERS.filter(
      (c) => c.type === 'rect' && Math.abs(c.cz - -1.775) < 4 && Math.abs(c.cx - 24.5) < 4,
    ).map((c) => c.id).sort();
    expect(nearTheJunction).toEqual(['armor-workshop', 'general-store']);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. The gap is real, but narrower than the player
// ══════════════════════════════════════════════════════════════════════════

describe('D. The 0.15 band between the buildings is a dead pocket', () => {
  const zMid = (gsPlinthLower.max[2] + shopPlinthLower.min[2]) / 2; // −1.775

  test('a 0.05 probe passes clean through — it is a gap, not an overlap', () => {
    for (let x = 23.8; x <= 25.8; x += 0.25) {
      const px = Number(x.toFixed(3));
      expect(collidesWith(px, zMid, 0.05, CITY_COLLIDERS), `stone across the gap at X = ${px}`).toBe(false);
    }
  });

  test('a player-sized probe cannot stand anywhere in it', () => {
    for (let x = 23.75; x <= 25.95; x += 0.25) {
      const px = Number(x.toFixed(3));
      const ids = overlappingColliderIds(px, zMid, R, CITY_COLLIDERS);
      expect(ids.has('general-store'), `Store not in contact at X = ${px}`).toBe(true);
      expect(ids.has('armor-workshop'), `Workshop not in contact at X = ${px}`).toBe(true);
    }
    // The band is narrower than the player's 0.80 diameter by construction.
    expect(axisGap(gsPlinthLower, shopPlinthLower, 2)).toBeLessThan(2 * R);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. The real resolver leaves no route and no snag through the pair
// ══════════════════════════════════════════════════════════════════════════

describe('E. The movement resolver cannot enter or snag on the gap', () => {
  const zMid = (gsPlinthLower.max[2] + shopPlinthLower.min[2]) / 2;
  const shopSouthFace = shopPlinthLower.min[2]; // −1.70

  test('a north-bound push at the junction is stopped at the Workshop face', () => {
    // East of the Store (X > 25.85 + R) is the only open ground that reaches the
    // junction at ground level; there the Workshop's south face is the wall.
    for (const x of [26.5, 27.0]) {
      const r = push(x, -3.2, 0, 1);
      expect(everInside(r), `push at X = ${x} ended inside a collider`).toBe(false);
      expect(r.end[1], `push at X = ${x} entered the gap band`).toBeLessThan(zMid);
      expect(r.end[1]).toBeLessThanOrEqual(shopSouthFace - R + 1e-6);
      // …and it is stopped AT the face, not somewhere short of it.
      expect(r.end[1], `push at X = ${x} stopped early`).toBeGreaterThan(shopSouthFace - R - SPEED * DT);
    }
  });

  test('the blocked direction is immediately reversible (no pocket snag)', () => {
    const fwd = push(26.4, -3.2, 0, 1);
    const back = push(fwd.end[0], fwd.end[1], 0, -1, 40);
    expect(back.end[1]).toBeLessThan(fwd.end[1] - 1);
    expect(everInside(back)).toBe(false);
  });

  test('the Store’s north plinth edge, not the gap, is the boundary the player meets', () => {
    // From the Forge–Workshop passage (west of the Workshop, north of the
    // Store) a southbound push stops one radius out of the Store's plinth edge
    // and never puts the player centre into the 0.15 band.
    const r = push(23.25, -1.2, 0, -1);
    expect(everInside(r)).toBe(false);
    expect(r.trail.every(([, pz]) => pz > shopSouthFace), 'centre entered the gap band').toBe(true);
    // It stops within one resolver step of the rendered plinth edge + radius.
    expect(Math.abs(r.end[1] - (gsPlinthLower.max[2] + R))).toBeLessThan(SPEED * DT + 1e-6);
    // …and it never slips sideways into the Workshop's band either.
    expect(r.end[0]).toBeLessThan(shopPlinthLower.min[0] - R + 1e-6);
  });
});
