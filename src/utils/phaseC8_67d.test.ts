/**
 * Phase C-8.67D — the horse-asset audit and the Biga / Triga / Quadra assembly
 * plan.  Focused suite for `src/utils/chariotTeamFormation.ts`.
 *
 * Run with: `bun test src/utils/phaseC8_67d.test.ts`
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   §A  the shipping chariot, re-measured from the file — the yoke bar and its
 *       two pegs, the draught pole, the wheels, the axle and the tub, node by
 *       node, in the rendered Y-up frame, plus the asset's own shape (26 nodes,
 *       23 meshes, 9,768 triangles, no skin, no animation, no textures) and its
 *       audited hash;
 *   §B  every constant in the formation module against that measurement, so a
 *       re-export that moves the yoke, the pole or a wheel fails here rather
 *       than silently invalidating the team layout;
 *   §C  the lanes and stations — Biga's pair exactly on the yoke's own pegs,
 *       Quadra's four lanes symmetric about the axis, Triga's inner pair intact
 *       with one outer trace horse, every station abreast on the yoke line and
 *       every horse's attachment landing on a measured fitting;
 *   §D  the clearances the audit owed (pole, adjacent barrels, the chariot's
 *       widest point, the wheel band, ground contact), for all three teams;
 *   §E  the fit inside the East Circus arena, against the sand track's own
 *       measured world bounds parsed from the component;
 *   §F  the arrangement the single central pole FORBIDS — three abreast with a
 *       horse on the centre line — and the alternative that would need a model
 *       change, both shown to fail the measured geometry;
 *   §G  the horse-asset inventory: the horse-shaped bodies inside the legacy
 *       chariot file, the three uploaded horse GLBs (pinned byte-for-byte since
 *       C-8.68A) and the fact that nothing in src/ references any of them;
 *   §H  scope guards — the module is pure and unconsumed, nothing renders, no
 *       horse file, mesh or animation was added, and the C-8.67B catalogue,
 *       prices and save behaviour are untouched.
 *
 * The suite parses the GLBs with `@gltf-transform/core` (the library the repo's
 * other asset suites already use) and reads component sources as text.  It never
 * writes a file, never touches storage and never mutates an asset.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  CHARIOT_FORWARD_AXIS,
  CHARIOT_GROUND_Y,
  CHARIOT_TYRE_BOTTOM_Y,
  CHARIOT_WIDEST_X,
  CHARIOT_WHEEL_HUB_X,
  CHARIOT_WHEEL_HUB_Y,
  CHARIOT_WHEEL_RIM_INNER_X,
  CHARIOT_WHEEL_LEADING_Z,
  CHARIOT_AXLE_X,
  CHARIOT_POLE_HALF_WIDTH,
  CHARIOT_POLE_TIP_Z,
  CHARIOT_YOKE_LINE_Z,
  CHARIOT_YOKE_UNDERSIDE_Y,
  CHARIOT_YOKE_TOP_Y,
  CHARIOT_YOKE_HALF_WIDTH,
  CHARIOT_YOKE_PEG_X,
  CHARIOT_YOKE_PEG_BASE_Y,
  CHARIOT_YOKE_PEG_TOP_Y,
  CHARIOT_TUB_FRONT_Z,
  INNER_LANE_X,
  OUTER_LANE_X,
  LANE_PITCH,
  LANE_X,
  TRACE_STAPLE_X,
  TEAM_LANES,
  HORSE_STATION_Z,
  HORSE_ENVELOPE,
  HORSE_REAR_CLEARANCE,
  HORSE_MAX_WITHERS_TO_REAR,
  getHorseStations,
  getTeamWidth,
  isTeamSymmetric,
  getTeamClearanceReport,
  describeTeamArrangement,
} from './chariotTeamFormation';
// The workshop's own wheel-fit constant, under its own name: the formation module exports a
// constant of the same name, and the two are deliberately cross-checked below.
import { CHARIOT_MODEL_URL, CHARIOT_WHEEL_HUB_X as WORKSHOP_WHEEL_HUB_X } from './chariotGeometry';

// ── Paths and the asset, loaded once ───────────────────────────────────────
const repo = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const code = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

const CHARIOT_GLB = repo('public/_workspace_chariot_model_RomanChariot.glb');
const WHEEL_KIT_GLB = repo('public/_workspace_chariot_model_RomanChariot_WheelKit.glb');
const LEGACY_CHARIOT_GLB = repo('public/_workspace_chariot.glb');
const ARENA_GLB = repo('public/_workspace_arena.glb');
const ROMAN_GLB = repo('public/models/arena_roman.glb');

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = any;

/** Column-major 4×4 multiply (glTF convention), `a · b`. */
function mul(a: number[], b: number[]): number[] {
  const o = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** A node's own TRS matrix, exactly as three.js composes it. */
function trs(t: number[], r: number[], s: number[]): number[] {
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
const applyM = (m: number[], p: number[]) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

export interface Bounds {
  x: [number, number];
  y: [number, number];
  z: [number, number];
  tris: number;
  verts: number;
}

/**
 * Every mesh's world-space AABB in the RENDERED frame — each node's matrix
 * carried down from the scene root and applied to all eight corners of the
 * primitive's own POSITION accessor bounds, which is what three.js hands a
 * `<group>` (the raw accessor extents are NOT the world extents: both chariot
 * assets export from a Z-up build space through a per-root correction matrix).
 */
function worldBounds(doc: Doc): Map<string, Bounds> {
  const out = new Map<string, Bounds>();
  const walk = (node: Doc, parent: number[]) => {
    const m = mul(parent, trs(node.getTranslation(), node.getRotation(), node.getScale()));
    const mesh = node.getMesh();
    if (mesh) {
      for (const prim of mesh.listPrimitives()) {
        const pa = prim.getAttribute('POSITION');
        if (!pa) continue;
        const mn = pa.getMinNormalized([]);
        const mx = pa.getMaxNormalized([]);
        const idx = prim.getIndices();
        const tris = idx ? idx.getCount() / 3 : pa.getCount() / 3;
        const b = out.get(mesh.getName()) ?? {
          x: [Infinity, -Infinity], y: [Infinity, -Infinity], z: [Infinity, -Infinity],
          tris: 0, verts: 0,
        };
        for (const cx of [mn[0], mx[0]]) for (const cy of [mn[1], mx[1]]) for (const cz of [mn[2], mx[2]]) {
          const w = applyM(m, [cx, cy, cz]);
          b.x[0] = Math.min(b.x[0], w[0]); b.x[1] = Math.max(b.x[1], w[0]);
          b.y[0] = Math.min(b.y[0], w[1]); b.y[1] = Math.max(b.y[1], w[1]);
          b.z[0] = Math.min(b.z[0], w[2]); b.z[1] = Math.max(b.z[1], w[2]);
        }
        b.tris = tris; b.verts = pa.getCount();
        out.set(mesh.getName(), b);
      }
    }
    for (const child of node.listChildren()) walk(child, m);
  };
  for (const scene of doc.getRoot().listScenes()) for (const n of scene.listChildren()) walk(n, IDENTITY);
  return out;
}

const chariotDoc = await io.readBinary(new Uint8Array(readFileSync(CHARIOT_GLB)));
const CHARIOT = worldBounds(chariotDoc);
const box = (name: string): Bounds => {
  const b = CHARIOT.get(name);
  if (!b) throw new Error(`the shipping chariot has no mesh named ${name}`);
  return b;
};

/**
 * The module publishes its anchors at three decimals (the precision C-8.66B
 * recorded them to).  The accessors are float32, so a re-measurement carries
 * ~1e-7, and a published value may sit up to half of its last printed digit from
 * the raw one — 5e-4.  Comparisons against a published constant use this bound,
 * and §B additionally re-derives every clearance from the RAW measurements, so
 * a rounding can never hide a violation.
 */
const PUBLISHED_PRECISION = 5e-4;
const near = (measured: number, constant: number) => Math.abs(measured - constant);

// ── §A — the shipping asset, re-measured ───────────────────────────────────

describe('C-8.67D §A — the shipping chariot, re-measured from the file', () => {
  test('the asset is the one C-8.66B/C-8.66C audited: bytes, hash, shape', () => {
    const bytes = readFileSync(CHARIOT_GLB);
    expect(bytes.length).toBe(202280);
    expect(createHash('sha256').update(bytes).digest('hex').slice(0, 8)).toBe('49e132e6');

    const root = chariotDoc.getRoot();
    expect(root.listNodes().length).toBe(26);
    expect(root.listMeshes().length).toBe(23);
    expect(root.listSkins().length).toBe(0);
    expect(root.listAnimations().length).toBe(0);
    expect(root.listTextures().length).toBe(0);
    expect(root.listMaterials().map((m: Doc) => m.getName()).sort()).toEqual([
      'Bronze', 'DarkWood', 'Leather', 'Wood',
    ]);
    const tris = [...CHARIOT.values()].reduce((n, b) => n + b.tris, 0);
    expect(tris).toBe(9768);
    // It is loaded at world scale 1 by the game (chariotGeometry's own constant).
    expect(CHARIOT_MODEL_URL).toBe('/_workspace_chariot_model_RomanChariot.glb');
  });

  test('the draught pole lies on the centre line, ahead of the axle', () => {
    const pole = box('DraughtPole_geom');
    // Symmetric about X = 0 — that IS the constraint the whole plan turns on.
    expect(pole.x[0]).toBeCloseTo(-pole.x[1], 6);
    expect(near(pole.x[1], CHARIOT_POLE_HALF_WIDTH)).toBeLessThanOrEqual(PUBLISHED_PRECISION);
    expect(near(pole.z[0], CHARIOT_POLE_TIP_Z)).toBeLessThanOrEqual(PUBLISHED_PRECISION);
    expect(pole.z[1]).toBeLessThan(0);
    expect(pole.y[0]).toBeLessThan(pole.y[1]);
    // It rises from the body to the yoke: its tip is at the yoke bar's own top plane.
    expect(pole.y[1]).toBeGreaterThan(CHARIOT_YOKE_UNDERSIDE_Y);
    // Forward really is −Z: the pole is on the axle's −Z side, the footboard on +Z.
    expect(pole.z[0]).toBeLessThan(0);
    expect(box('Footboard_geom').z[0]).toBeGreaterThan(0);
    expect(CHARIOT_FORWARD_AXIS).toBe('-Z');
  });

  test('the yoke bar and its two pegs — the fitting the Biga is built on', () => {
    const yoke = box('Yoke_geom');
    expect(near(yoke.x[1], CHARIOT_YOKE_HALF_WIDTH)).toBeLessThanOrEqual(PUBLISHED_PRECISION);
    expect(yoke.x[0]).toBeCloseTo(-yoke.x[1], 6);
    expect(near(yoke.y[0], CHARIOT_YOKE_UNDERSIDE_Y)).toBeLessThanOrEqual(PUBLISHED_PRECISION);
    expect(near(yoke.y[1], CHARIOT_YOKE_TOP_Y)).toBeLessThanOrEqual(PUBLISHED_PRECISION);
    // The bar is 1.30 wide, 0.09 thick and 0.088 deep — its centre line is the station.
    expect(yoke.y[1] - yoke.y[0]).toBeCloseTo(0.09, 3);
    expect(yoke.z[1] - yoke.z[0]).toBeCloseTo(0.088, 3);
    expect(near((yoke.z[0] + yoke.z[1]) / 2, CHARIOT_YOKE_LINE_Z)).toBeLessThanOrEqual(PUBLISHED_PRECISION);

    // Exactly two pegs, mirror-symmetric, standing ON the bar.
    const left = box('Yoke_Peg_L_geom');
    const right = box('Yoke_Peg_R_geom');
    expect(left.x[0]).toBeCloseTo(-right.x[1], 6);
    expect(left.y[1]).toBeCloseTo(right.y[1], 6);
    expect(near(Math.abs((left.x[0] + left.x[1]) / 2), CHARIOT_YOKE_PEG_X)).toBeLessThanOrEqual(PUBLISHED_PRECISION);
    expect(near(left.y[0], CHARIOT_YOKE_PEG_BASE_Y)).toBeLessThanOrEqual(PUBLISHED_PRECISION);
    expect(near(left.y[1], CHARIOT_YOKE_PEG_TOP_Y)).toBeLessThanOrEqual(PUBLISHED_PRECISION);
    // The peg is rooted IN the bar and rises through its top face — a tenon, not a cap:
    // its base (0.970) sits inside the bar's own band (0.935 … 1.025) and its top is above it.
    expect(left.y[0]).toBeGreaterThan(yoke.y[0]);
    expect(left.y[0]).toBeLessThan(yoke.y[1]);
    expect(left.y[1]).toBeGreaterThan(yoke.y[1]);
    // It also stands above the withers plane by the margin the yoke strap passes through.
    expect(left.y[1] - CHARIOT_YOKE_UNDERSIDE_Y).toBeCloseTo(0.255, 3);
    // No third peg exists — the two-peg yoke is what the asset ships.
    const pegNames = [...CHARIOT.keys()].filter((n) => /^Yoke_Peg/.test(n));
    expect(pegNames.sort()).toEqual(['Yoke_Peg_L_geom', 'Yoke_Peg_R_geom']);
  });

  test('the wheels, the axle and the tub — the clearances the horses must respect', () => {
    const woodL = box('Wheel_L_Wood_geom');
    const bronzeL = box('Wheel_L_Bronze_geom');
    const wheel = box('Wheel_R_Wood_geom');
    const hubCap = box('Wheel_R_Bronze_geom');

    // The disc is 0.070 thick in X and 1.370 across in Y and Z.
    expect(wheel.x[1] - wheel.x[0]).toBeCloseTo(0.07, 3);
    expect(wheel.y[1] - wheel.y[0]).toBeCloseTo(1.37, 3);
    expect(wheel.z[1] - wheel.z[0]).toBeCloseTo(1.37, 3);
    expect(near((wheel.x[0] + wheel.x[1]) / 2, CHARIOT_WHEEL_HUB_X)).toBeLessThanOrEqual(PUBLISHED_PRECISION);
    expect(near((wheel.y[0] + wheel.y[1]) / 2, CHARIOT_WHEEL_HUB_Y)).toBeLessThanOrEqual(PUBLISHED_PRECISION);
    // Its inner face, its leading edge and the tyre's bottom.
    expect(near(woodL.x[1], -CHARIOT_WHEEL_RIM_INNER_X)).toBeLessThanOrEqual(PUBLISHED_PRECISION);
    expect(near(wheel.z[0], CHARIOT_WHEEL_LEADING_Z)).toBeLessThanOrEqual(PUBLISHED_PRECISION);
    expect(near(wheel.y[0], CHARIOT_TYRE_BOTTOM_Y)).toBeLessThanOrEqual(PUBLISHED_PRECISION);
    // The hub caps are the widest thing on the model, mirrored.
    expect(near(hubCap.x[1], CHARIOT_WIDEST_X)).toBeLessThanOrEqual(PUBLISHED_PRECISION);
    expect(bronzeL.x[0]).toBeCloseTo(-hubCap.x[1], 6);

    // The axle, and the tub's bronze front rail behind the horses' station.
    const axle = box('Axle_geom');
    expect(near(axle.x[1], CHARIOT_AXLE_X)).toBeLessThanOrEqual(PUBLISHED_PRECISION);
    expect(near(axle.y[0], 0.605)).toBeLessThanOrEqual(PUBLISHED_PRECISION);
    expect(near(axle.y[1], 0.695)).toBeLessThanOrEqual(PUBLISHED_PRECISION);
    const rail = box('CarBody_Bronze_geom');
    // The tub's front rail is narrower than the two pegs' own span — a horse in an inner
    // lane is therefore outside it in X as well as well ahead of it in Z.
    expect(rail.x[1]).toBeGreaterThan(CHARIOT_POLE_HALF_WIDTH);
    expect(rail.x[1]).toBeLessThan(CHARIOT_YOKE_PEG_X);
    expect(rail.x[1]).toBeLessThan(CHARIOT_WIDEST_X);
    expect(near(rail.z[0], CHARIOT_TUB_FRONT_Z)).toBeLessThanOrEqual(PUBLISHED_PRECISION);
    // The tub is entirely behind every horse's station.
    expect(rail.z[0]).toBeGreaterThan(HORSE_STATION_Z);
    expect(CHARIOT_GROUND_Y).toBe(0);
  });

  test('the handles the driver holds sit behind the station, above the tub', () => {
    const grip = box('Handle_Grip_R_geom');
    expect((grip.x[0] + grip.x[1]) / 2).toBeCloseTo(CHARIOT_YOKE_PEG_X, 6);
    expect(grip.y[1]).toBeGreaterThan(CHARIOT_YOKE_PEG_TOP_Y);
    expect(grip.z[0]).toBeGreaterThan(HORSE_STATION_Z);
  });
});

// ── §B — the module's constants against the measurement ────────────────────

describe('C-8.67D §B — every formation constant is the measured value', () => {
  test('the published anchors are the asset’s measurements at their published precision', () => {
    const rows: [number, number][] = [
      [box('Yoke_geom').x[1], CHARIOT_YOKE_HALF_WIDTH],
      [box('Yoke_geom').y[0], CHARIOT_YOKE_UNDERSIDE_Y],
      [box('Yoke_geom').y[1], CHARIOT_YOKE_TOP_Y],
      [(box('Yoke_geom').z[0] + box('Yoke_geom').z[1]) / 2, CHARIOT_YOKE_LINE_Z],
      [Math.abs((box('Yoke_Peg_L_geom').x[0] + box('Yoke_Peg_L_geom').x[1]) / 2), CHARIOT_YOKE_PEG_X],
      [box('Yoke_Peg_L_geom').y[0], CHARIOT_YOKE_PEG_BASE_Y],
      [box('Yoke_Peg_L_geom').y[1], CHARIOT_YOKE_PEG_TOP_Y],
      [box('DraughtPole_geom').x[1], CHARIOT_POLE_HALF_WIDTH],
      [box('DraughtPole_geom').z[0], CHARIOT_POLE_TIP_Z],
      [box('Axle_geom').x[1], CHARIOT_AXLE_X],
      [(box('Wheel_R_Wood_geom').x[0] + box('Wheel_R_Wood_geom').x[1]) / 2, CHARIOT_WHEEL_HUB_X],
      [(box('Wheel_R_Wood_geom').y[0] + box('Wheel_R_Wood_geom').y[1]) / 2, CHARIOT_WHEEL_HUB_Y],
      [box('Wheel_R_Wood_geom').x[0], CHARIOT_WHEEL_RIM_INNER_X],
      [box('Wheel_R_Wood_geom').z[0], CHARIOT_WHEEL_LEADING_Z],
      [box('Wheel_R_Wood_geom').y[0], CHARIOT_TYRE_BOTTOM_Y],
      [box('Wheel_R_Bronze_geom').x[1], CHARIOT_WIDEST_X],
      [box('CarBody_Bronze_geom').z[0], CHARIOT_TUB_FRONT_Z],
    ];
    for (const [measured, constant] of rows) {
      expect(Number.isFinite(measured)).toBe(true);
      expect(near(measured, constant)).toBeLessThanOrEqual(PUBLISHED_PRECISION);
    }
    // The one cross-module agreement: the workshop's own wheel-fit constant, and the
    // formation module's own copy of it, agree on the axle's hub X.
    expect(WORKSHOP_WHEEL_HUB_X).toBe(0.7);
    expect(WORKSHOP_WHEEL_HUB_X).toBe(CHARIOT_WHEEL_HUB_X);
  });

  test('every clearance re-derived from the RAW asset still passes its rule', () => {
    // The published constants are rounded, so the clearances are recomputed here from the
    // measurements themselves — a rounding can never turn a violation into a pass.
    const half = HORSE_ENVELOPE.barrelHalfWidth;
    const poleHalf = box('DraughtPole_geom').x[1];
    const yokeHalf = box('Yoke_geom').x[1];
    const wheelInnerX = box('Wheel_R_Wood_geom').x[0];
    const wheelLeadingZ = box('Wheel_R_Wood_geom').z[0];
    const widestX = box('Wheel_R_Bronze_geom').x[1];
    const tyreBottom = box('Wheel_R_Wood_geom').y[0];

    // Inner barrel → the pole's own face.
    expect(INNER_LANE_X - half - poleHalf).toBeGreaterThan(0.1);
    // Adjacent barrels.
    expect(LANE_PITCH - 2 * half).toBeGreaterThan(0.15);
    // Outer barrel → the widest point on the model.
    expect(OUTER_LANE_X - half - widestX).toBeGreaterThan(0.15);
    // The inner horse's rear limit → the wheel disc's leading edge.
    expect(wheelLeadingZ - HORSE_ENVELOPE.maxRearZ).toBeGreaterThan(0.05);
    // Ground: the horses stand on the chariot's plane, above the tyres' low point.
    expect(CHARIOT_GROUND_Y - tyreBottom).toBeGreaterThan(0);
    // The rear limit also leaves a real torso budget behind the withers.
    expect(HORSE_ENVELOPE.maxRearZ - HORSE_STATION_Z).toBeGreaterThan(1.0);
    // The staple stays on the bar with an end margin.
    expect(yokeHalf).toBeGreaterThan(TRACE_STAPLE_X);
    expect(yokeHalf - TRACE_STAPLE_X).toBeGreaterThan(0.02);
    // And the wheel-band overlap is real, at the raw measurement: the inner barrel reaches
    // inside the disc's X band, which is exactly why the rear-Z rule exists.
    expect(wheelInnerX).toBeLessThan(INNER_LANE_X + half);
    expect(INNER_LANE_X + half).toBeGreaterThan(wheelInnerX);
    // The outer lane clears the wheel in X instead, so it needs no such rule.
    expect(OUTER_LANE_X - half).toBeGreaterThan(widestX);
  });
});

// ── §C — the three arrangements ────────────────────────────────────────────

describe('C-8.67D §C — Biga, Triga and Quadra', () => {
  test('Biga is the yoked pair, exactly on the asset’s own pegs', () => {
    const stations = getHorseStations(2);
    expect(stations.map((s) => s.lane)).toEqual(['inner-left', 'inner-right']);
    expect(stations.map((s) => s.x)).toEqual([-INNER_LANE_X, INNER_LANE_X]);
    expect(INNER_LANE_X).toBe(CHARIOT_YOKE_PEG_X);
    expect(stations.every((s) => s.yoked)).toBe(true);
    expect(stations.map((s) => s.attachment.kind)).toEqual(['yoke-peg', 'yoke-peg']);
    expect(stations.map((s) => s.attachment.x)).toEqual([-0.5, 0.5]);
    expect(stations.every((s) => s.attachment.y === CHARIOT_YOKE_PEG_TOP_Y)).toBe(true);
    expect(isTeamSymmetric(2)).toBe(true);
    // The Biga needs no chariot change: both its horses stand under pegs the asset has.
    expect(stations.every((s) => s.yoked)).toBe(true);
  });

  test('Quadra adds both outer lanes and stays symmetric', () => {
    const stations = getHorseStations(4);
    expect(stations.map((s) => s.lane)).toEqual(['outer-left', 'inner-left', 'inner-right', 'outer-right']);
    expect(stations.map((s) => s.x)).toEqual([-OUTER_LANE_X, -INNER_LANE_X, INNER_LANE_X, OUTER_LANE_X]);
    expect(stations.map((s) => s.yoked)).toEqual([false, true, true, false]);
    expect(stations.map((s) => s.attachment.kind)).toEqual(['trace-staple', 'yoke-peg', 'yoke-peg', 'trace-staple']);
    expect(isTeamSymmetric(4)).toBe(true);
    // The inner pair is byte-identical to the Biga's.
    expect(getHorseStations(4).filter((s) => s.yoked)).toEqual(getHorseStations(2));
  });

  test('Triga is the same inner pair plus one outer trace horse', () => {
    const stations = getHorseStations(3);
    expect(stations.map((s) => s.lane)).toEqual(['inner-left', 'inner-right', 'outer-right']);
    expect(stations.map((s) => s.yoked)).toEqual([true, true, false]);
    expect(stations[2].attachment.kind).toBe('trace-staple');
    expect(stations[2].x).toBe(OUTER_LANE_X);
    // It is NOT symmetric, and that is the design: an odd team with one central pole cannot be.
    expect(isTeamSymmetric(3)).toBe(false);
    // Its yoked pair is the Biga's, untouched.
    expect(stations.filter((s) => s.yoked)).toEqual(getHorseStations(2));
  });

  test('every horse stands abreast on the yoke line, on the chariot’s own ground plane', () => {
    for (const size of [2, 3, 4] as const) {
      const stations = getHorseStations(size);
      expect(stations.length).toBe(size);
      expect(stations.every((s) => s.z === HORSE_STATION_Z)).toBe(true);
      expect(HORSE_STATION_Z).toBe(CHARIOT_YOKE_LINE_Z);
      expect(stations.every((s) => s.groundY === CHARIOT_GROUND_Y)).toBe(true);
      // Ascending X, unique lanes, no duplicate station.
      expect([...stations].sort((a, b) => a.x - b.x)).toEqual(stations);
      expect(new Set(stations.map((s) => s.lane)).size).toBe(size);
      expect(TEAM_LANES[size].length).toBe(size);
    }
  });

  test('each horse’s harness goes to a fitting that exists on the chariot', () => {
    const yoke = box('Yoke_geom');
    for (const size of [2, 3, 4] as const) {
      for (const s of getHorseStations(size)) {
        // Every attachment lies on the yoke bar's own Z line, on the bar.
        expect(s.attachment.z).toBeCloseTo(CHARIOT_YOKE_LINE_Z, 9);
        if (s.attachment.kind === 'yoke-peg') {
          // Exactly a peg's own centre line and top.
          expect(Math.abs(s.attachment.x)).toBeCloseTo(CHARIOT_YOKE_PEG_X, 9);
          expect(s.attachment.y).toBeCloseTo(box('Yoke_Peg_R_geom').y[1], 6);
        } else {
          // The trace staple sits on the bar's top face, inside its end — the trace then
          // runs out-and-forward to the outer horse's own lane.
          expect(Math.abs(s.attachment.x)).toBe(TRACE_STAPLE_X);
          expect(TRACE_STAPLE_X).toBeLessThan(yoke.x[1]);
          expect(s.attachment.y).toBeCloseTo(CHARIOT_YOKE_TOP_Y, 9);
          expect(Math.abs(s.x)).toBe(OUTER_LANE_X);
          expect(OUTER_LANE_X - TRACE_STAPLE_X).toBeGreaterThan(0.5);
        }
      }
    }
    // The staple is inside the bar with a real end margin, never on its edge.
    expect(CHARIOT_YOKE_HALF_WIDTH - TRACE_STAPLE_X).toBeCloseTo(0.05, 9);
  });

  test('the lane pitch is the design, and the stations follow from it', () => {
    expect(LANE_PITCH).toBe(0.72);
    expect(OUTER_LANE_X).toBeCloseTo(INNER_LANE_X + LANE_PITCH, 12);
    expect(LANE_X['outer-left']).toBeCloseTo(-OUTER_LANE_X, 12);
    expect(LANE_X['outer-right']).toBeCloseTo(OUTER_LANE_X, 12);
    // Horse SPACING: each OUTER (trace) lane sits exactly one pitch outside the inner lane
    // beside it — that is what the pitch is the distance between.  The two yoked lanes are
    // deliberately NOT a pitch apart: they straddle the pole at ±INNER_LANE_X, one lane per
    // yoke peg, which is how an even team takes the pole between it.
    for (const size of [3, 4] as const) {
      const stations = getHorseStations(size);
      const outer = stations.filter((s) => !s.yoked);
      for (const s of outer) {
        const beside = stations.find((o) => o.yoked && Math.sign(o.x) === Math.sign(s.x))!;
        expect(Math.abs(s.x) - Math.abs(beside.x)).toBeCloseTo(LANE_PITCH, 12);
      }
    }
    expect(2 * INNER_LANE_X).toBeGreaterThan(LANE_PITCH);
    // SYMMETRY: for the even teams each station's mirror is another station; for Triga it
    // is not, which is the documented consequence of a single central pole.
    for (const size of [2, 4] as const) {
      for (const s of getHorseStations(size)) {
        expect(getHorseStations(size).some((o) => Math.abs(o.x + s.x) < 1e-12)).toBe(true);
      }
    }
    for (const s of getHorseStations(3)) {
      if (s.lane === 'outer-right') {
        expect(getHorseStations(3).some((o) => Math.abs(o.x + s.x) < 1e-12 && o.lane !== s.lane)).toBe(false);
      }
    }
  });

  test('the plan is deterministic and hands out fresh, unshared objects', () => {
    const first = getHorseStations(4);
    // Same inputs, same plan …
    expect(getHorseStations(4)).toEqual(first);
    // … and a fresh array of fresh objects each call, so a caller cannot corrupt the plan
    // for the next one, or for the clearance report built from it.
    expect(getHorseStations(4)).not.toBe(first);
    first[0].x = 99;
    first[0].attachment.x = 99;
    first.pop();
    const second = getHorseStations(4);
    expect(second.length).toBe(4);
    expect(second.map((s) => s.x)).toEqual([-OUTER_LANE_X, -INNER_LANE_X, INNER_LANE_X, OUTER_LANE_X]);
    expect(second[0].attachment.x).toBe(-TRACE_STAPLE_X);
    expect(getTeamClearanceReport(4).ok).toBe(true);
  });

  test('a description exists for every configuration, and names its own team', () => {
    const names = { 2: 'biga', 3: 'triga', 4: 'quadra' } as const;
    for (const size of [2, 3, 4] as const) {
      const text = describeTeamArrangement(size);
      expect(text.length).toBeGreaterThan(20);
      expect(text.toLowerCase()).toContain(names[size]);
      // Each one states the team's shape in words a player reads: every team fields the
      // yoked pair, and Biga — which is nothing but that pair — says so as the yoke.
      expect(text.toLowerCase()).toContain(size === 2 ? 'yoke' : 'yoked pair');
    }
    // The odd team is the only one the description calls asymmetric.
    expect(describeTeamArrangement(3).toLowerCase()).toContain('trace');
    expect(describeTeamArrangement(4).toLowerCase()).toContain('each side');
  });
});

// ── §D — the clearances ────────────────────────────────────────────────────

describe('C-8.67D §D — wheel clearance, overlap, body interference, ground contact', () => {
  test('every team passes every clearance that applies to it', () => {
    // The chariot-body rule is a TRACE-lane rule: only a lane that runs alongside the
    // chariot can owe the hub-cap clearance.  Biga fields no trace lane — both its horses
    // are yoked, standing between the pole and the wheel, which is the wheel-Z rule's job —
    // so its report carries five rows, not a sixth it could never satisfy.
    const ROWS: Record<2 | 3 | 4, string[]> = {
      2: ['pole', 'adjacent-lanes', 'wheel-z-leading-edge', 'wheel-band', 'ground'],
      3: ['pole', 'adjacent-lanes', 'chariot-body', 'wheel-z-leading-edge', 'wheel-band', 'ground'],
      4: ['pole', 'adjacent-lanes', 'chariot-body', 'wheel-z-leading-edge', 'wheel-band', 'ground'],
    };
    for (const size of [2, 3, 4] as const) {
      const report = getTeamClearanceReport(size);
      expect(report.ok).toBe(true);
      expect(report.clearances.map((c) => c.id)).toEqual(ROWS[size]);
      for (const c of report.clearances) {
        expect(typeof c.description).toBe('string');
        expect(c.ok).toBe(true);
      }
    }
    // The reason the row is absent for Biga, measured: no Biga lane lies outside the
    // chariot's widest point, while every trace team has one that does.
    const outside = (size: 2 | 3 | 4) =>
      getHorseStations(size).filter((s) => Math.abs(s.x) - HORSE_ENVELOPE.barrelHalfWidth > CHARIOT_WIDEST_X);
    expect(outside(2)).toEqual([]);
    expect(outside(3).map((s) => s.lane)).toEqual(['outer-right']);
    expect(outside(4).map((s) => s.lane)).toEqual(['outer-left', 'outer-right']);
  });

  test('the wheel-Z tolerance covers binary rounding only, not a real violation', () => {
    // The rule is satisfied EXACTLY by construction — rear limit = wheel leading edge −
    // clearance — so its own subtraction rounds to 0.09999999999999998.  The tolerance has
    // to cover that and nothing more: it is 1e-9 against a published precision of 5e-4, so a
    // real violation (1e-3 and up) can never hide behind it.
    const row = getTeamClearanceReport(2).clearances.find((c) => c.id === 'wheel-z-leading-edge')!;
    expect(row.limit).toBe(HORSE_REAR_CLEARANCE);
    expect(Math.abs(row.value - row.limit)).toBeLessThan(1e-12);
    expect(1e-9).toBeLessThan(PUBLISHED_PRECISION / 100);
    // And at the RAW accessor the same clearance holds to float32 rounding (the raw leading
    // edge measures −0.685000002…), so the tolerance here is the accessor's own precision,
    // not a relaxation of the rule.
    expect(CHARIOT_WHEEL_LEADING_Z - HORSE_ENVELOPE.maxRearZ).toBeCloseTo(HORSE_REAR_CLEARANCE, 12);
    const rawRearClearance = box('Wheel_R_Wood_geom').z[0] - HORSE_ENVELOPE.maxRearZ;
    expect(Math.abs(rawRearClearance - HORSE_REAR_CLEARANCE)).toBeLessThan(1e-6);
    expect(rawRearClearance).toBeGreaterThan(0.09);
  });

  test('the numbers behind them, re-derived', () => {
    const half = HORSE_ENVELOPE.barrelHalfWidth;
    expect(half).toBe(0.25);
    // Inner barrel → the pole's face.
    expect(INNER_LANE_X - half - CHARIOT_POLE_HALF_WIDTH).toBeCloseTo(0.201, 6);
    // Adjacent barrels.
    expect(LANE_PITCH - 2 * half).toBeCloseTo(0.22, 6);
    // Outer barrel → the chariot's widest point.
    expect(OUTER_LANE_X - half - CHARIOT_WIDEST_X).toBeCloseTo(0.202, 6);
    // The rear rule, and the torso it buys behind the withers.
    expect(HORSE_ENVELOPE.maxRearZ).toBeCloseTo(-0.785, 6);
    expect(CHARIOT_WHEEL_LEADING_Z - HORSE_ENVELOPE.maxRearZ).toBeCloseTo(HORSE_REAR_CLEARANCE, 9);
    expect(HORSE_MAX_WITHERS_TO_REAR).toBeCloseTo(1.235, 6);
    // The horses stand on the chariot's ground plane, 0.035 proud of the tyres' low point.
    expect(HORSE_ENVELOPE.hoofY).toBe(CHARIOT_GROUND_Y);
    expect(CHARIOT_GROUND_Y - CHARIOT_TYRE_BOTTOM_Y).toBeCloseTo(0.035, 9);
  });

  test('the wheel-band rule is load-bearing: an inner horse IS inside the wheel’s X band', () => {
    // Its barrel reaches 0.750, and the wheel disc spans 0.665 … 0.735 — so only the
    // horse's rear limit (Z ≤ −0.785, ahead of the wheel's leading edge) keeps them apart.
    const outerEdge = INNER_LANE_X + HORSE_ENVELOPE.barrelHalfWidth;
    expect(outerEdge).toBeCloseTo(0.75, 9);
    expect(outerEdge).toBeGreaterThan(CHARIOT_WHEEL_RIM_INNER_X);
    expect(HORSE_ENVELOPE.maxRearZ).toBeLessThan(CHARIOT_WHEEL_LEADING_Z);
    // And the outer lanes clear the wheels in X, so they carry no such rule.
    expect(OUTER_LANE_X - HORSE_ENVELOPE.barrelHalfWidth).toBeGreaterThan(CHARIOT_WIDEST_X);
  });

  test('team widths, measured', () => {
    expect(getTeamWidth(2)).toBeCloseTo(1.5, 9);
    expect(getTeamWidth(3)).toBeCloseTo(2 * (OUTER_LANE_X + 0.25), 9);
    expect(getTeamWidth(4)).toBeCloseTo(2 * (OUTER_LANE_X + 0.25), 9);
    expect(getTeamWidth(4)).toBeCloseTo(2.94, 9);
    // The chariot's own full width is 2 × 0.768 = 1.536.  A team with trace horses is much
    // wider than the vehicle it pulls (2.94, ~1.9×), while the yoked pair alone is not: at
    // 1.50 Biga is actually narrower than the chariot, because both its horses stand
    // between the wheels' inner faces.
    expect(getTeamWidth(3)).toBeGreaterThan(2 * CHARIOT_WIDEST_X);
    expect(getTeamWidth(4)).toBeGreaterThan(2 * CHARIOT_WIDEST_X);
    expect(getTeamWidth(2)).toBeLessThan(2 * CHARIOT_WIDEST_X);
  });
});

// ── §E — the fit inside the East Circus arena ──────────────────────────────

describe('C-8.67D §E — the team fits the track the C-8.64A audit measured', () => {
  const arenaSrc = code('../components/3d/city/EastCircusArena.tsx');

  test('the sand track’s world bounds are still what the component documents', () => {
    // C-8.69B added a Y column to the component’s table, so the row is parsed with
    // it — and the Y figures it documents are asserted too: the whole point of this
    // check is that the numbers the team fit relies on are the documented ones.
    const line = arenaSrc.match(
      /sand track\s+X\s+([\d.]+)\s+…\s+([\d.]+)\s+Y\s+(-[\d.]+)\s+…\s+([\d.]+)\s+Z\s+(-[\d.]+)\s+…\s+([\d.]+)/,
    );
    expect(line).not.toBeNull();
    const [, x0, x1, y0, y1, z0, z1] = line!;
    const width = Number(x1) - Number(x0);
    const length = Number(z1) - Number(z0);
    expect(width).toBeCloseTo(16.8, 6);
    expect(length).toBeCloseTo(68.4, 6);
    // The documented floor is the arena’s ground clearance (C-8.69B): the track’s
    // top face sits 0.05 above the city ground plane (-0.05), i.e. at 0.00.
    expect(Number(y1)).toBeCloseTo(0, 6);
    expect(Number(y1) - Number(y0)).toBeCloseTo(0.2, 6);
  });

  test('a four-abreast team fits the track with room to spare', () => {
    const trackWidth = 16.8;
    for (const size of [2, 3, 4] as const) {
      const width = getTeamWidth(size);
      expect(width).toBeLessThan(trackWidth);
      // Even the widest team leaves more than 6 units each side of the track.
      expect((trackWidth - width) / 2).toBeGreaterThan(6);
    }
    // The arena is mounted at 0.20 through the component's own constants.
    expect(arenaSrc).toContain('scale={CIRCUS_ARENA_SCALE}');
    expect(arenaSrc).toMatch(/CIRCUS_ARENA_SCALE\s*=\s*0\.2\b/);
    // And the teams' own length (nose to rump) is a small fraction of the straight.
    expect(HORSE_MAX_WITHERS_TO_REAR * 2).toBeLessThan(16.8);
  });
});

// ── §F — the arrangement the model forbids ─────────────────────────────────

describe('C-8.67D §F — three abreast on the centre line is geometrically impossible', () => {
  test('the pole occupies the centre lane at a horse’s own barrel height', () => {
    const pole = box('DraughtPole_geom');
    const half = HORSE_ENVELOPE.barrelHalfWidth;
    // A centre-lane horse's barrel (X ±0.25 about 0) would swallow the pole's X band (±0.049).
    expect(Math.abs(0) + half).toBeGreaterThan(CHARIOT_POLE_HALF_WIDTH);
    // The pole's Y band sits between the withers plane and a horse's belly — no clearance.
    expect(pole.y[0]).toBeLessThan(CHARIOT_YOKE_UNDERSIDE_Y);
    expect(pole.y[1]).toBeGreaterThan(CHARIOT_YOKE_UNDERSIDE_Y);
    // And it reaches past the yoke, so a centre horse cannot stand under it either.
    expect(pole.z[0]).toBeLessThan(CHARIOT_YOKE_LINE_Z);
  });

  test('the centre-ahead alternative needs the pole to stop short, i.e. a model change', () => {
    // A horse entirely forward of the pole must place its rearmost point past the tip.
    const requiredRearZ = CHARIOT_POLE_TIP_Z - HORSE_REAR_CLEARANCE;
    expect(requiredRearZ).toBeCloseTo(-2.207, 6);
    // That rearmost point is 0.187 ahead of the yoke line, i.e. the horse cannot stand
    // where the others do: its withers must move the whole torso budget (1.235) further
    // forward again, 1.422 ahead of the trace horses' — a detached-looking lead horse.
    expect(HORSE_STATION_Z - requiredRearZ).toBeCloseTo(0.187, 6);
    const stationZ = requiredRearZ - HORSE_MAX_WITHERS_TO_REAR;
    expect(stationZ).toBeLessThan(HORSE_STATION_Z);
    expect(HORSE_STATION_Z - stationZ).toBeCloseTo(1.422, 6);
    // Nothing in the shipped layout does this: no station is off the yoke line.
    for (const size of [2, 3, 4] as const) {
      expect(getHorseStations(size).every((s) => s.z === HORSE_STATION_Z)).toBe(true);
    }
  });

  test('so the odd team is asymmetric, and that is the only option the pole leaves', () => {
    expect(TEAM_LANES[3]).toContain('outer-right');
    expect(TEAM_LANES[3]).not.toContain('outer-left');
    expect(isTeamSymmetric(3)).toBe(false);
    // Both even teams straddle the pole, which is exactly what it is for.
    expect(isTeamSymmetric(2)).toBe(true);
    expect(isTeamSymmetric(4)).toBe(true);
  });
});

// ── §G — the horse-asset inventory ─────────────────────────────────────────

describe('C-8.67D §G — the horse-asset inventory: what exists, and what it is', () => {
  // REBASED by C-8.68A, not weakened.  When this suite was written the repo held no
  // horse file at all, so "there are none" was the true statement.  Three horse GLBs
  // were uploaded afterwards (now `src/assets/dev/horses/_workspace_dist_horse_{weak,better,great}.glb`
  // — moved out of `public/` so a production build stops copying them; see C-8.70c packaging),
  // so the property this section exists to protect is restated exactly: those three
  // are the ONLY horse files in the project, they are byte-identical to the copies the
  // C-8.68A audit measured, and no source file references them — nothing horse-shaped
  // is loaded, rendered or collided with.
  test('the only horse files are the three uploads, and nothing references them', () => {
    const horseish = /horse|equine|stallion|pony|quadruped/i;
    const names: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = `${dir}/${entry}`;
        if (statSync(full).isDirectory()) walk(full);
        else names.push(full);
      }
    };
    walk(repo('public'));
    walk(repo('src'));
    // REBASED by C-8.68C, not weakened.  "A horse file that is named horse-ishly" and "a
    // source file that names a horse asset" are different things, and the sweep separates
    // them: the ASSETS are still exactly the three uploads, and the only SOURCES that
    // mention an upload are C-8.68C's own two prototype files, whose whole purpose is to
    // load one of them behind a dev-only gate.  Every other source file still has to stay
    // silent, which is the property this section was written to protect.
    const C8_68C_PROTOTYPE = [
      'src/components/dev/HorseChariotFitPrototype.tsx',
      'src/utils/horseFitPrototype.ts',
    ];
    // Only the NUMBERS module actually names the file; the component that draws it reads
    // the URL from that module, so the asset path still has exactly one source of truth.
    const C8_68C_NAMES_THE_ASSET = ['src/utils/horseFitPrototype.ts'];
    const matches = names
      .filter((f) => horseish.test(f.replace(repo(''), '')))
      .map((f) => f.replace(repo(''), ''))
      .sort();
    expect(matches).toEqual(
      [
        'src/assets/dev/horses/_workspace_dist_horse_better.glb',
        'src/assets/dev/horses/_workspace_dist_horse_great.glb',
        'src/assets/dev/horses/_workspace_dist_horse_weak.glb',
        ...C8_68C_PROTOTYPE,
      ].sort()
    );
    // Byte-for-byte, so a re-export of a horse model fails here rather than silently
    // invalidating every measurement the C-8.68A audit and the C-8.68B decision report
    // cite (the proportions, the 31-joint rig, the three clip names and durations).
    // C-8.68C reads the same three files and modifies none of them.
    const sha256 = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
    expect(sha256(repo('src/assets/dev/horses/_workspace_dist_horse_weak.glb'))).toBe(
      '0a00300e57892e30a6b5a186a37b1c1a6ec1aeb8b21cd952036d38250e3c9d58'
    );
    expect(sha256(repo('src/assets/dev/horses/_workspace_dist_horse_better.glb'))).toBe(
      '639b75d53607d3560267970507bc4451badb6160cece47a0354eb62dc180fed8'
    );
    expect(sha256(repo('src/assets/dev/horses/_workspace_dist_horse_great.glb'))).toBe(
      'f7e1b698fef8e95e5fd7d7b70a2c5640965b8121f1a0f541bacbaa4b1b6f2aa0'
    );
    // Unreferenced by PRODUCTION: no `.ts`/`.tsx` file that can ship names any of the
    // three.  Suites are excluded because they never ship and this one — and C-8.68C's
    // own — must name the file in order to resolve and hash it; the exact list of
    // shipping files that name an upload is asserted instead of emptiness, which is a
    // stronger statement than the one it replaces.
    const srcFiles: string[] = [];
    const walkSources = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = `${dir}/${entry}`;
        if (statSync(full).isDirectory()) walkSources(full);
        else if (/\.(ts|tsx)$/.test(entry)) srcFiles.push(full);
      }
    };
    walkSources(repo('src'));
    const referencing = srcFiles
      .filter((f) => !f.endsWith('.test.ts'))
      .filter((f) => /_workspace_dist_horse_/.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(repo(''), ''))
      .sort();
    expect(referencing).toEqual(C8_68C_NAMES_THE_ASSET);
    // The model assets in public/ are the character, weapon, sign and city files (the horse
    // uploads moved to src/assets/dev/horses/, where only the dev harness reaches them).
    expect(names.filter((f) => /\.glb$/.test(f)).length).toBeGreaterThan(0);
  });

  test('the one horse-shaped asset is static, unrigged and unreferenced', () => {
    return io.readBinary(new Uint8Array(readFileSync(LEGACY_CHARIOT_GLB))).then((legacy: Doc) => {
      const root = legacy.getRoot();
      // 88 separate meshes, 7 textures, and — the decisive facts — no skeleton and no clips.
      expect(root.listMeshes().length).toBe(88);
      expect(root.listSkins().length).toBe(0);
      expect(root.listAnimations().length).toBe(0);
      expect(root.listTextures().length).toBe(7);
      expect(root.listMaterials().map((m: Doc) => m.getName()).sort()).toEqual([
        'Bronze', 'Hide', 'Iron', 'Leather', 'Mane', 'Wicker', 'Wood',
      ]);
      // Two horse-shaped bodies stand abreast, mirrored about Z, with rigid leg blocks.
      // The counts deserve care, because two different numbers invite confusion: the asset
      // carries 44 meshes wearing Hide/Mane (NOT 22), and 22 is the number of horse
      // components PER BODY — 12 Hide + 10 Mane, the same mix on each side.
      const legacyBounds = worldBounds(legacy);
      const hideMane = [...legacyBounds.keys()].filter((n) => /^(Hide|Mane)_/.test(n));
      expect(hideMane.length).toBe(44);
      expect(hideMane.filter((n) => n.startsWith('Hide')).length).toBe(24);
      expect(hideMane.filter((n) => n.startsWith('Mane')).length).toBe(20);
      const sideOf = (sign: 1 | -1) =>
        hideMane.filter((n) => {
          const b = legacyBounds.get(n)!;
          return ((b.z[0] + b.z[1]) / 2) * sign > 0;
        });
      const leftBody = sideOf(-1);
      const rightBody = sideOf(1);
      expect(leftBody.length).toBe(22);
      expect(rightBody.length).toBe(22);
      expect(leftBody.filter((n) => n.startsWith('Hide')).length).toBe(12);
      expect(leftBody.filter((n) => n.startsWith('Mane')).length).toBe(10);
      // The two bodies are each other's mirror about Z = 0 — same X and Y extents, Z
      // negated and swapped.  Compared as multisets of measured boxes, so no pairing
      // between individual mesh names is assumed.
      const shapes = (names: string[], mirrorZ: boolean) => {
        const counts = new Map<string, number>();
        for (const n of names) {
          const b = legacyBounds.get(n)!;
          const z = mirrorZ ? [-b.z[1], -b.z[0]] : [b.z[0], b.z[1]];
          const key = [b.x[0], b.x[1], b.y[0], b.y[1], z[0], z[1]]
            .map((v) => v.toFixed(4))
            .join('|');
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return counts;
      };
      const mirroredLeft = shapes(leftBody, true);
      const right = shapes(rightBody, false);
      expect(mirroredLeft.size).toBe(22);
      expect([...mirroredLeft.keys()].sort()).toEqual([...right.keys()].sort());
      for (const [key, count] of mirroredLeft) expect(right.get(key)).toBe(count);
      // It is dead weight: no source file references it.
      const srcFiles: string[] = [];
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
          const full = `${dir}/${entry}`;
          if (statSync(full).isDirectory()) walk(full);
          else if (/\.(ts|tsx)$/.test(entry)) srcFiles.push(full);
        }
      };
      walk(repo('src'));
      const referencing = srcFiles.filter((f) =>
        !f.endsWith('phaseC8_67d.test.ts') && readFileSync(f, 'utf8').includes('_workspace_chariot.glb')
      );
      expect(referencing).toEqual([]);
    });
  });

  test('the only rigged model in the project is the humanoid gladiator', () => {
    return io.readBinary(new Uint8Array(readFileSync(ROMAN_GLB))).then((doc: Doc) => {
      const root = doc.getRoot();
      expect(root.listSkins().length).toBe(1);
      expect(root.listSkins()[0].listJoints().length).toBe(66);
      // 178 clips, all humanoid: no gait, trot, canter or gallop anywhere.
      const clips = root.listAnimations().map((a: Doc) => a.getName());
      expect(clips.length).toBe(178);
      expect(clips.filter((n: string) => /trot|canter|gallop|gait|hoof|neigh/i.test(n))).toEqual([]);
    });
  });

  test('the arena asset is static scenery, and the wheel kit ships no horses', () => {
    return Promise.all([
      io.readBinary(new Uint8Array(readFileSync(ARENA_GLB))),
      io.readBinary(new Uint8Array(readFileSync(WHEEL_KIT_GLB))),
    ]).then(([arena, kit]: Doc[]) => {
      for (const doc of [arena, kit]) {
        expect(doc.getRoot().listSkins().length).toBe(0);
        expect(doc.getRoot().listAnimations().length).toBe(0);
      }
      expect(arena.getRoot().listMeshes().length).toBe(76);
      expect(kit.getRoot().listMeshes().length).toBe(15);
      // The kit is the four wheel variants the workshop knows about, and nothing else.
      expect([...worldBounds(kit).keys()].filter((n) => /^Wheel_/.test(n)).length).toBeGreaterThan(0);
      expect(createHash('sha256').update(readFileSync(WHEEL_KIT_GLB)).digest('hex').slice(0, 8)).toBe('d5b36add');
    });
  });
});

// ── §H — scope guards ──────────────────────────────────────────────────────

describe('C-8.67D §H — the module is a plan, and nothing was rendered', () => {
  const MODULE = code('./chariotTeamFormation.ts');
  /** The module's executable text — its comments legitimately discuss these names. */
  const MODULE_CODE = MODULE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  test('the module imports the team-size type and nothing else', () => {
    const imports = MODULE.match(/from '[^']+'/g)?.sort();
    expect(imports).toEqual(["from '../types/game'"]);
    // No renderer, no storage, no catalogue, no progression module — a plan, not a screen.
    for (const forbidden of [
      '@react-three', 'react', 'localStorage', 'sessionStorage', 'saveProfile',
      'chariotParts', 'chariotGeometry', 'racingProgression', 'useGLTF', 'useFrame',
    ]) {
      expect(MODULE_CODE).not.toContain(forbidden);
    }
    // And it renders nothing: no JSX, no mesh, no geometry, no material, no shader, no loader.
    for (const forbidden of ['<mesh', 'geometry', 'material', 'shader', 'Group', 'Mesh', 'fetch(', '.glb', '.gltf']) {
      expect(MODULE_CODE).not.toContain(forbidden);
    }
    // No three.js import of any form (the word appears only inside the module's prose).
    expect(/from\s+'three'/.test(MODULE_CODE)).toBe(false);
  });

  test('nothing in the shipping game consumes the module — only the dev-only C-8.68C prototype', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = `${dir}/${entry}`;
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
      }
    };
    walk(repo('src'));
    const consumers = files
      .filter((f) => {
        const name = f.replace(repo('src/'), '');
        if (name === 'utils/chariotTeamFormation.ts' || name.endsWith('.test.ts')) return false;
        return readFileSync(f, 'utf8').includes('chariotTeamFormation');
      })
      .map((f) => f.replace(repo('src/'), ''))
      .sort();
    // REBASED by C-8.68C, not weakened.  This guard exists to keep the plan out of
    // RENDERING AND GAMEPLAY — no screen, no city file, no arena, no hub — and that still
    // holds: C-8.68C added exactly TWO files — the disposable fit prototype's numbers-only
    // module and the dev-only component that draws it — and both are reached only through
    // `main.tsx`'s `import.meta.env.DEV` branch, which dynamically imports the component
    // (so neither is in a production build; `phaseC8_68c.test.ts` §F pins that).  A
    // gameplay file still cannot start importing the plan without failing here.
    expect(consumers).toEqual([
      'components/dev/HorseChariotFitPrototype.tsx',
      'utils/horseFitPrototype.ts',
    ]);
    // The app's own entry points still name it nowhere.
    expect(code('../App.tsx')).not.toContain('chariotTeamFormation');
    expect(code('../main.tsx')).not.toContain('chariotTeamFormation');
    // …and the one consumer is dev-gated end to end: the module knows no renderer, the
    // component is guarded by `import.meta.env.DEV`, and the gate itself is in main.tsx.
    expect(code('./horseFitPrototype.ts')).not.toContain('@react-three');
    expect(code('../components/dev/HorseChariotFitPrototype.tsx')).toContain('import.meta.env.DEV');
    expect(code('../main.tsx')).toContain("'horsefit'");
  });

  test('no horse asset, mesh, animation or instance was added by this phase', () => {
    // The module declares geometry as NUMBERS only — no buffer, no file, no loader.
    for (const forbidden of ['.glb', '.gltf', 'fetch(', 'load(', 'url(', 'URL']) {
      expect(MODULE_CODE).not.toContain(forbidden);
    }
    // And the public tree gained no model file: the inventory is exactly what it was.
    const models = readdirSync(repo('public/models')).sort();
    expect(models).toEqual([
      'amazonian.glb', 'arena_roman.glb', 'dimachaerus.glb', 'minotaur.glb', 'netfighter.glb', 'weapons',
    ]);
  });

  test('C-8.67B/C-8.67C are untouched: the catalogue, the prices and the save behaviour', async () => {
    const { RACING_CONFIGS, resolveRacingState, purchaseRacingConfig, selectRacingConfig } = await import(
      './racingProgression'
    );
    const { createNewProfile } = await import('../services/storage');
    expect(RACING_CONFIGS.map((c: Doc) => [c.id, c.horses, c.price])).toEqual([
      ['biga', 2, 0],
      ['triga', 3, 750],
      ['quadra', 4, 1500],
    ]);
    // The team size this module consumes is exactly what the progression module resolves.
    const profile = { ...createNewProfile('Tester'), gold: 5000 } as Doc;
    expect(resolveRacingState(profile).horses).toBe(2);
    // Quadra before Triga is refused outright.
    expect(purchaseRacingConfig(profile, 4)).toEqual({ ok: false, reason: 'prerequisite-locked' });
    // BUYING AN UNLOCK IS NOT SELECTING IT — the racing analogue of "buying never equips".
    // The profile still resolves to the Biga until a separate, free selection is made.
    const triga = purchaseRacingConfig(profile, 3);
    expect(triga.ok).toBe(true);
    const afterTriga = triga.ok ? triga.profile : profile;
    expect(resolveRacingState(afterTriga).unlocked).toEqual([2, 3]);
    expect(resolveRacingState(afterTriga).horses).toBe(2);
    const quadra = purchaseRacingConfig(afterTriga, 4);
    expect(quadra.ok).toBe(true);
    const afterQuadra = quadra.ok ? quadra.profile : afterTriga;
    expect(resolveRacingState(afterQuadra).unlocked).toEqual([2, 3, 4]);
    expect(resolveRacingState(afterQuadra).horses).toBe(2);
    // Selecting is that separate free step — and once selected, the four-lane arrangement
    // is what this module is asked for.
    const selected = selectRacingConfig(afterQuadra, 4);
    expect(selected.ok).toBe(true);
    const racingFour = selected.ok ? selected.profile : afterQuadra;
    expect(resolveRacingState(racingFour).horses).toBe(4);
    expect(racingFour.gold).toBe(afterQuadra.gold);
    expect(getHorseStations(resolveRacingState(racingFour).horses).length).toBe(4);
    // Every resolved team size is one this module has a lane set for.
    for (const size of [2, 3, 4] as const) expect(TEAM_LANES[size].length).toBe(size);
  });

  test('the two chariot GLBs are byte-identical to their audited hashes', () => {
    expect(createHash('sha256').update(readFileSync(CHARIOT_GLB)).digest('hex').slice(0, 8)).toBe('49e132e6');
    expect(createHash('sha256').update(readFileSync(WHEEL_KIT_GLB)).digest('hex').slice(0, 8)).toBe('d5b36add');
    // The workshop's own wheel-fit constant is unchanged by this phase.
    expect(WORKSHOP_WHEEL_HUB_X).toBe(0.7);
  });
});
