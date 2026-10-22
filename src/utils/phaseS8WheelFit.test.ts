/**
 * S8 — spiked & bladed wheels: the measured fit pass, pinned.
 *
 * Run with: `bun test src/utils/phaseS8WheelFit.test.ts`
 *
 * ── WHAT THIS SUITE PINS, AND WHY IT IS A REPORT-ONLY SUITE ────────────────
 * The slice was measurement-gated: the catalogue could change only if the fit
 * numbers passed. They did not, so this suite pins the MEASUREMENTS and the proof
 * that the catalogue was not touched:
 *
 *   §A the measured fit — every figure re-derived from the shipping wheel kit's
 *      own vertices through the shipped mount, with the two SHIPPING variants as
 *      the control that the reader and the transform agree with the workshop;
 *   §B the mirroring seam — the bladed set's per-side mirror, measured on the real
 *      vertices (the blades' rake reverses and nothing else moves);
 *   §C the radius-consumption trace — how a variant's radius reaches production
 *      today (the preview's hub-centred mount and the single stock roll radius),
 *      so an admission could not silently change a shipping variant's ride;
 *   §D the report-only guard — `data/chariotParts.ts` is untouched and still sells
 *      exactly two wheel sets, and the dev-only module is consumed by the dev
 *      harness alone.
 *
 * Every number below is either re-measured from the GLB or derived from the
 * shipped modules — none is copied from the record.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';

import {
  CHARIOT_STOCK_WHEEL_BOTTOM_Y,
  CHARIOT_WHEEL_HUB_X,
  CHARIOT_WHEEL_HUB_Y,
  CHARIOT_WHEEL_KIT_HUB_Y,
  CHARIOT_WHEEL_YAW,
  getChariotWheelPlacement,
} from './chariotGeometry';
import { HORSE_ENVELOPE, HORSE_REAR_CLEARANCE, getTeamClearanceReport } from './chariotTeamFormation';
import { CHARIOT_WHEEL_RADIUS } from './chariotMovement';
import {
  WHEEL_FIT_VARIANTS,
  getFailingWheelFitRules,
  getFormationClearancesAtWheel,
  getWheelFitPlacement,
  getWheelFitReport,
  type WheelFitVariantKey,
} from './chariotWheelFit';
import { CHARIOT_PARTS, chariotPartsBySlot } from '../data/chariotParts';
import type { ChariotTeamSize } from '../types/game';

// ── Sources ────────────────────────────────────────────────────────────────
const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
/** Comments are stripped so prose can never satisfy (or defeat) an assertion. */
const code = (rel: string): string =>
  load(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const WHEEL_KIT = '../../public/_workspace_chariot_model_RomanChariot_WheelKit.glb';
const CATALOGUE_SRC = code('../data/chariotParts.ts');
const GEOMETRY_SRC = code('./chariotGeometry.ts');
const RACE_SCENE_SRC = code('../components/3d/RaceScene.tsx');
const PREVIEW_SRC = code('../components/3d/ChariotPreview.tsx');
const HARNESS_SRC = code('../components/dev/HorseChariotFitPrototype.tsx');

// ── A real glTF reader: the kit's VERTICES, in the rendered Y-up frame ─────
type Mat4 = number[];
const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function matMul(a: Mat4, b: Mat4): Mat4 {
  const out = new Array(16).fill(0);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

function nodeLocal(node: any): Mat4 {
  if (node.matrix) return node.matrix as Mat4;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const r: Mat4 = [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    0, 0, 0, 1,
  ];
  const scaled: Mat4 = [...r];
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) scaled[j * 4 + i] *= [sx, sy, sz][i];
  }
  scaled[12] = tx;
  scaled[13] = ty;
  scaled[14] = tz;
  return scaled;
}

const xf = (m: Mat4, p: number[]): number[] => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

interface KitMesh {
  name: string;
  material: string;
  verts: number[][];
}

interface KitVariant {
  node: string;
  meshes: KitMesh[];
  verts: number[][];
}

const CACHE = new Map<string, KitVariant[]>();

function kitVariants(rel: string): KitVariant[] {
  const cached = CACHE.get(rel);
  if (cached) return cached;

  const bytes = readFileSync(new URL(rel, import.meta.url));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  const bin = bytes.subarray(20 + jsonLength + 8);

  const read = (meshIndex: number): number[][] => {
    const out: number[][] = [];
    for (const prim of json.meshes[meshIndex].primitives ?? []) {
      const accessor = json.accessors[prim.attributes.POSITION];
      const bufferView = json.bufferViews[accessor.bufferView];
      const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      const stride = bufferView.byteStride ?? 12;
      for (let i = 0; i < accessor.count; i += 1) {
        const offset = start + i * stride;
        out.push([bin.readFloatLE(offset), bin.readFloatLE(offset + 4), bin.readFloatLE(offset + 8)]);
      }
    }
    return out;
  };

  const visit = (index: number, parent: Mat4, into: (m: KitMesh) => void): void => {
    const node = json.nodes[index];
    const world = matMul(nodeLocal(node), parent);
    if (node.mesh !== undefined) {
      const material = json.materials?.[json.meshes[node.mesh].primitives[0].material]?.name ?? '';
      into({ name: node.name, material, verts: read(node.mesh).map((v) => xf(world, v)) });
    }
    for (const child of node.children ?? []) visit(child, world, into);
  };

  const variants: KitVariant[] = (json.scenes[json.scene ?? 0].nodes as number[]).map((rootIndex) => {
    const meshes: KitMesh[] = [];
    visit(rootIndex, IDENTITY, (mesh) => meshes.push(mesh));
    return {
      node: json.nodes[rootIndex].name,
      meshes,
      verts: meshes.flatMap((mesh) => mesh.verts),
    };
  });

  CACHE.set(rel, variants);
  return variants;
}

const variantNamed = (node: string): KitVariant => {
  const found = kitVariants(WHEEL_KIT).find((variant) => variant.node === node);
  if (!found) throw new Error(`wheel kit has no ${node}`);
  return found;
};

const bounds = (verts: number[][]) => {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const v of verts) {
    for (let i = 0; i < 3; i += 1) {
      lo[i] = Math.min(lo[i], v[i]);
      hi[i] = Math.max(hi[i], v[i]);
    }
  }
  return { lo, hi };
};

/** The variant's hub and outermost radius, measured from its own vertices. */
function measureKit(node: string) {
  const variant = variantNamed(node);
  const box = bounds(variant.verts);
  const hubX = (box.lo[0] + box.hi[0]) / 2;
  const hubY = (box.lo[1] + box.hi[1]) / 2;
  const radius = variant.verts.reduce(
    (max, v) => Math.max(max, Math.hypot(v[0] - hubX, v[1] - hubY)),
    0
  );
  const bronze = variant.meshes.find((mesh) => mesh.material === 'Bronze');
  const bronzeBox = bronze ? bounds(bronze.verts) : null;
  return {
    hubX,
    hubY,
    radius,
    bottomY: box.lo[1],
    topY: box.hi[1],
    zThickness: box.hi[2] - box.lo[2],
    bronzeCentre: bronzeBox
      ? [(bronzeBox.lo[0] + bronzeBox.hi[0]) / 2, (bronzeBox.lo[1] + bronzeBox.hi[1]) / 2]
      : null,
  };
}

/** The shipped wrapper transform applied to a kit vertex set (yaw, then mirror, then offset). */
function mount(verts: number[][], placement: { position: number[]; rotationY: number; scale: number[] }) {
  const cos = Math.cos(placement.rotationY);
  const sin = Math.sin(placement.rotationY);
  return verts.map((v) => {
    const [sx, sy, sz] = placement.scale;
    const x = v[0] * sx;
    const y = v[1] * sy;
    const z = v[2] * sz;
    // Ry(yaw): x' = x·cos + z·sin, z' = −x·sin + z·cos
    return [
      placement.position[0] + (x * cos + z * sin),
      placement.position[1] + y,
      placement.position[2] + (-x * sin + z * cos),
    ];
  });
}

/**
 * The blades' rake, as a signed number: the covariance of a blade vertex's angle
 * about the hub (in the disc plane) with its axial offset from the mid-plane.  A
 * raked blade sweeps axially as it goes round, so the sign of this reading IS the
 * wheel's chirality — mirroring the wheel reverses it and nothing else.
 */
function rake(chariotVerts: number[][], hub: number[], midPlaneX: number): number {
  let sum = 0;
  let weight = 0;
  for (const v of chariotVerts) {
    const axial = v[0] - midPlaneX;
    if (Math.abs(axial) < 0.04) continue; // the flat wood/iron tyre has no rake to read
    const angle = Math.atan2(v[1] - hub[1], v[2] - hub[2]);
    sum += angle * axial;
    weight += angle * angle;
  }
  return weight === 0 ? 0 : sum / weight;
}

const VARIANT_KEYS: WheelFitVariantKey[] = ['standard', 'reinforced', 'spiked', 'bladed'];

// ══════════════════════════════════════════════════════════════════════════
// A. The measured fit
// ══════════════════════════════════════════════════════════════════════════

describe('A. The measured fit, re-derived from the shipping wheel kit', () => {
  test('each variant’s published spec is what the asset measures', () => {
    for (const key of VARIANT_KEYS) {
      const spec = WHEEL_FIT_VARIANTS[key];
      const measured = measureKit(spec.node);
      // float32 accessors: 1e-4 is four orders below the numbers' own precision.
      expect(measured.radius, `${key} radius`).toBeCloseTo(spec.radius, 4);
      expect(measured.bottomY, `${key} kit bottom`).toBeCloseTo(spec.kitBottomY, 4);
      expect(measured.hubX, `${key} kit hub X`).toBeCloseTo(spec.kitHubX, 4);
      expect(measured.hubY, `${key} kit hub Y`).toBeCloseTo(CHARIOT_WHEEL_KIT_HUB_Y, 4);
      // The hub is the bronze hub, not merely the bounds centre.
      expect(measured.bronzeCentre?.[0], `${key} bronze hub X`).toBeCloseTo(spec.kitHubX, 4);
      expect(measured.bronzeCentre?.[1], `${key} bronze hub Y`).toBeCloseTo(CHARIOT_WHEEL_KIT_HUB_Y, 4);
    }
  });

  test('CONTROL — the transform reproduces the two SHIPPING variants exactly', () => {
    // If the reader, the mount or the arithmetic were wrong, these two would move.
    const standard = getWheelFitPlacement('standard', 'left');
    const reinforced = getWheelFitPlacement('reinforced', 'right');
    const shippingStandard = getChariotWheelPlacement('standard', 'left');
    const shippingReinforced = getChariotWheelPlacement('reinforced', 'right');

    for (const [measured, shipped] of [
      [standard, shippingStandard],
      [reinforced, shippingReinforced],
    ] as const) {
      expect(measured.position[0]).toBeCloseTo(shipped.position[0], 12);
      expect(measured.position[1]).toBeCloseTo(shipped.position[1], 12);
      expect(measured.position[2]).toBeCloseTo(shipped.position[2], 12);
      expect(measured.rotationY).toBe(shipped.rotationY);
      expect(measured.bottomY).toBeCloseTo(shipped.bottomY, 12);
      expect(measured.hub[1]).toBeCloseTo(shipped.hub[1], 12);
      expect(measured.scale).toEqual([1, 1, 1]);
    }

    expect(standard.bottomY).toBeCloseTo(CHARIOT_STOCK_WHEEL_BOTTOM_Y, 12); // −0.035, the authored sink
    expect(reinforced.bottomY).toBeCloseTo(-0.0525, 12); // the recorded fit discrepancy
  });

  test('the mounted wheels are what the asset says, not what the withheld notes guessed', () => {
    const spiked = measureKit('Wheel_Spiked');
    const bladed = measureKit('Wheel_Bladed');
    // The withheld comments in chariotGeometry.ts carried 0.8025 / 0.8429.
    expect(spiked.radius).toBeCloseTo(0.794, 3);
    expect(bladed.radius).toBeCloseTo(1.0947, 3);
    expect(spiked.radius).toBeGreaterThan(0.8025 - 0.01); // and the guess was not a rim figure either
    expect(bladed.radius).toBeGreaterThan(0.8429 + 0.2); // 0.8429 understates it by 0.25
  });

  test('FIT PIN — tyre-to-ground penetration at ride height', () => {
    // ride height: the chariot's own authored ground plane, y = 0.
    const spiked = getWheelFitReport('spiked').sides.right;
    const bladed = getWheelFitReport('bladed').sides.right;

    expect(spiked.bottomY).toBeCloseTo(-0.144, 6); // −0.044 kit bottom − 0.10 mount offset
    expect(bladed.bottomY).toBeCloseTo(-0.2428748, 6);
    expect(spiked.penetration).toBeCloseTo(0.144, 6);
    expect(bladed.penetration).toBeCloseTo(0.2428748, 6);

    // Deeper than the shipping standard by exactly the radius they add.
    expect(spiked.bottomDelta).toBeCloseTo(-0.109, 6);
    expect(bladed.bottomDelta).toBeCloseTo(-0.2078748, 6);

    // THE GATE, read both ways.  `tyre-ground` is the brief's literal "≤ 0 — no
    // penetration"; `tyre-ground-vs-standard` is the same reading against the
    // geometry that already ships.  Neither admits either variant.
    for (const key of ['spiked', 'bladed'] as const) {
      const report = getWheelFitReport(key);
      const literal = report.rules.find((rule) => rule.id === 'tyre-ground')!;
      const versusStock = report.rules.find((rule) => rule.id === 'tyre-ground-vs-standard')!;
      expect(literal.ok, `${key} literal penetration gate`).toBe(false);
      expect(versusStock.ok, `${key} penetration vs the standard set`).toBe(false);
      expect(report.ok).toBe(false);
    }
    // And the literal gate is already failed by the set that ships — recorded, not
    // attributed to these variants.
    expect(getWheelFitReport('standard').rules.find((r) => r.id === 'tyre-ground')!.ok).toBe(false);
  });

  test('FIT PIN — hub/axle alignment against the shipping standard is EXACT', () => {
    for (const key of VARIANT_KEYS) {
      const report = getWheelFitReport(key);
      for (const side of ['left', 'right'] as const) {
        const placement = report.sides[side];
        const hubX = side === 'left' ? -CHARIOT_WHEEL_HUB_X : CHARIOT_WHEEL_HUB_X;
        expect(placement.hub[0], `${key} ${side} hub X`).toBeCloseTo(hubX, 12);
        expect(placement.hub[1], `${key} ${side} hub Y`).toBeCloseTo(CHARIOT_WHEEL_HUB_Y, 12);
        expect(placement.hub[2], `${key} ${side} hub Z`).toBeCloseTo(0, 12);
      }
      expect(report.rules.find((rule) => rule.id === 'hub-axle')!.ok).toBe(true);
    }
  });

  test('FIT PIN — the chariotTeamFormation clearances re-run at each variant’s own radius', () => {
    const rowValue = (teamSize: ChariotTeamSize, radius: number, bottomY: number) => {
      const report = getFormationClearancesAtWheel(teamSize, radius, bottomY);
      return report.clearances.find((row) => row.id === 'wheel-z-leading-edge')!.value;
    };

    // Stock: exactly on the 0.1 rule (the module's own epsilon covers the rounding).
    expect(rowValue(2, 0.685, -0.035)).toBeCloseTo(HORSE_REAR_CLEARANCE, 9);
    expect(getTeamClearanceReport(2).ok).toBe(true);
    expect(getTeamClearanceReport(3).ok).toBe(true);
    expect(getTeamClearanceReport(4).ok).toBe(true);

    // Reinforced: already 0.0175 short — the margin is consumed by the rim's extra radius.
    expect(rowValue(2, 0.7025, -0.0525)).toBeCloseTo(0.0825, 9);

    // The withheld sets, at their own measured radii.
    expect(rowValue(2, 0.794, -0.144)).toBeCloseTo(-0.009, 9);
    expect(rowValue(2, 1.0946984, -0.2428748)).toBeCloseTo(-0.3096984, 9);

    // Red at every team size the circuit's gate runs.
    for (const key of ['spiked', 'bladed'] as const) {
      const report = getWheelFitReport(key);
      expect(report.formation.map((entry) => entry.teamSize)).toEqual([2, 3, 4]);
      for (const entry of report.formation) {
        expect(entry.ok, `${key} ${entry.teamSize}-horse team`).toBe(false);
        const failing = entry.clearances.filter((row) => !row.ok).map((row) => row.id);
        expect(failing).toEqual(['wheel-z-leading-edge']);
      }
      // The radius-independent rows stay green: only the wheel's own leading edge moved.
      for (const teamSize of [2, 3, 4] as ChariotTeamSize[]) {
        const base = getTeamClearanceReport(teamSize).clearances;
        const at = getFormationClearancesAtWheel(teamSize, 0.794, -0.144).clearances;
        for (const row of base) {
          if (row.id === 'wheel-z-leading-edge' || row.id === 'ground') continue;
          expect(at.find((r) => r.id === row.id)!.value, `${teamSize}:${row.id}`).toBeCloseTo(row.value, 12);
          expect(at.find((r) => r.id === row.id)!.ok, `${teamSize}:${row.id}`).toBe(true);
        }
      }
    }
  });

  test('the failing set is exactly the two gates, on both variants', () => {
    expect(getFailingWheelFitRules('spiked')).toEqual([
      'tyre-ground',
      'tyre-ground-vs-standard',
      'formation-wheel-z-leading-edge',
      '2:wheel-z-leading-edge',
      '3:wheel-z-leading-edge',
      '4:wheel-z-leading-edge',
    ]);
    expect(getFailingWheelFitRules('bladed')).toEqual(getFailingWheelFitRules('spiked'));
    // The hub gate passes for both, which is why the STOP is the tyre and the clearance.
    expect(getFailingWheelFitRules('spiked')).not.toContain('hub-axle');
  });

  test('the rear limit is the shipping envelope’s, so the stop is a design decision, not arithmetic', () => {
    // `maxRearZ` is the STOCK wheel's leading edge less the clearance; a larger rim
    // moves the leading edge but not the horse, which is why the rule fails.
    expect(HORSE_ENVELOPE.maxRearZ).toBeCloseTo(-0.785, 12);
    expect(-0.685 - HORSE_REAR_CLEARANCE).toBeCloseTo(HORSE_ENVELOPE.maxRearZ, 12);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The mirroring seam
// ══════════════════════════════════════════════════════════════════════════

describe('B. The bladed set’s per-side mirror', () => {
  test('exactly one variant is mirrored, on exactly one side, with scale.z = −1', () => {
    expect(WHEEL_FIT_VARIANTS.bladed.mirroredSide).toBe('right');
    for (const key of ['standard', 'reinforced', 'spiked'] as const) {
      expect(WHEEL_FIT_VARIANTS[key].mirroredSide, key).toBeNull();
      expect(getWheelFitPlacement(key, 'left').mirrored).toBe(false);
      expect(getWheelFitPlacement(key, 'right').mirrored).toBe(false);
      expect(getWheelFitPlacement(key, 'right').scale).toEqual([1, 1, 1]);
    }
    expect(getWheelFitPlacement('bladed', 'left').scale).toEqual([1, 1, 1]);
    // The mirror is the kit's own Z — the disc's normal, and therefore the axle
    // direction once the yaw has been applied (three composes T·R·S, so a wrapper
    // scale acts in the child's frame, not the rotated one).
    expect(getWheelFitPlacement('bladed', 'right').scale).toEqual([1, 1, -1]);
    expect(getWheelFitPlacement('bladed', 'right').mirrored).toBe(true);
  });

  test('the mirror moves nothing that matters: same hub, same radius, same tyre bottom', () => {
    const left = getWheelFitPlacement('bladed', 'left');
    const right = getWheelFitPlacement('bladed', 'right');
    expect(right.hub[1]).toBeCloseTo(left.hub[1], 12);
    expect(right.hub[2]).toBeCloseTo(left.hub[2], 12);
    expect(right.bottomY).toBeCloseTo(left.bottomY, 12);
    // The mirror is axial, so the offset is the SAME on both sides; only the
    // wrapper's scale differs.  A mirrored mount therefore cannot move a wheel.
    expect(right.position[2]).toBeCloseTo(left.position[2], 12);
    expect(right.position[0]).toBeCloseTo(-left.position[0], 12);
  });

  test('measured on the real vertices: the two sides are mirror images, and only mirroring gives that', () => {
    const variant = variantNamed('Wheel_Bladed');
    const left = mount(variant.verts, getWheelFitPlacement('bladed', 'left'));
    const mirrored = mount(variant.verts, getWheelFitPlacement('bladed', 'right'));
    // The same right-hand mount WITHOUT the mirror: same hub, blades raked the left way.
    const unmirrored = mount(variant.verts, {
      rotationY: getWheelFitPlacement('bladed', 'right').rotationY,
      scale: [1, 1, 1],
      position: getWheelFitPlacement('bladed', 'right').position,
    });

    // 1. The mirrored side IS the left side reflected through the chariot's centre
    //    plane: every right-hand vertex has a left-hand mate at (−x, y, z).
    const key = (v: number[]) => `${v[0].toFixed(4)}|${v[1].toFixed(4)}|${v[2].toFixed(4)}`;
    const leftSet = new Set(left.map(key));
    let matched = 0;
    for (const v of mirrored) {
      if (leftSet.has(key([-v[0], v[1], v[2]]))) matched += 1;
    }
    expect(matched).toBe(mirrored.length);

    // 2. The blades' rake reverses under the mirror, and does not without it.
    const hub = (side: 'left' | 'right') => [
      side === 'left' ? -CHARIOT_WHEEL_HUB_X : CHARIOT_WHEEL_HUB_X,
      CHARIOT_WHEEL_HUB_Y,
      0,
    ];
    const leftRake = rake(left, hub('left'), -CHARIOT_WHEEL_HUB_X);
    const mirroredRake = rake(mirrored, hub('right'), CHARIOT_WHEEL_HUB_X);
    const unmirroredRake = rake(unmirrored, hub('right'), CHARIOT_WHEEL_HUB_X);
    expect(Math.sign(mirroredRake)).toBe(-Math.sign(leftRake));
    expect(Math.abs(mirroredRake)).toBeCloseTo(Math.abs(leftRake), 6);
    expect(Math.sign(unmirroredRake)).toBe(Math.sign(leftRake));
  });

  test('the bladed wheel is genuinely chirally asymmetric, which is why the seam exists', () => {
    // The steel blades have no mirror twin about the wheel's mid-plane; the wood and
    // iron discs of every OTHER variant do.
    const twinCount = (verts: number[][]) => {
      const midZ = (Math.min(...verts.map((v) => v[2])) + Math.max(...verts.map((v) => v[2]))) / 2;
      const set = new Set(verts.map((v) => `${v[0].toFixed(4)}|${v[1].toFixed(4)}|${v[2].toFixed(4)}`));
      return verts.filter((v) =>
        [...set].some((entry) => {
          const [x, y, z] = entry.split('|').map(Number);
          return (
            Math.abs(x - v[0]) < 1e-4 &&
            Math.abs(y - v[1]) < 1e-4 &&
            Math.abs(z - (2 * midZ - v[2])) < 1e-4
          );
        })
      ).length;
    };
    const bladedSteel = variantNamed('Wheel_Bladed').meshes.find((mesh) => mesh.material === 'Steel')!;
    expect(twinCount(bladedSteel.verts)).toBeLessThan(bladedSteel.verts.length);
    // CONTROL — the shipping standard set is fully symmetric about that plane, so
    // the seam would be a no-op there and adding it is the bladed set's alone.
    const standard = variantNamed('Wheel_Standard');
    expect(twinCount(standard.verts)).toBe(standard.verts.length);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. How a variant's radius reaches production today
// ══════════════════════════════════════════════════════════════════════════

describe('C. The radius-consumption trace: nothing variant-aware exists to break', () => {
  test('the roll rule owns ONE radius, the stock wheel’s', () => {
    expect(CHARIOT_WHEEL_RADIUS).toBe(0.685);
    // It equals the stock hub height minus the authored tyre sink — not a variant's
    // radius, and no variant's radius can reach it without editing this constant.
    expect(CHARIOT_WHEEL_RADIUS).toBeCloseTo(CHARIOT_WHEEL_HUB_Y - CHARIOT_STOCK_WHEEL_BOTTOM_Y, 12);
  });

  test('the race mounts the stock model only, and spins its own two wheel nodes', () => {
    expect(RACE_SCENE_SRC).toContain('CHARIOT_MODEL_URL');
    expect(RACE_SCENE_SRC).not.toContain('CHARIOT_WHEEL_KIT_URL');
    expect(RACE_SCENE_SRC).not.toContain('WHEEL_FIT_VARIANTS');
    expect(RACE_SCENE_SRC).not.toContain('getChariotWheelPlacement');
  });

  test('the workshop preview mounts hub-centred with no lift and no variant radius', () => {
    expect(PREVIEW_SRC).toContain('getChariotWheelPlacement(wheelVariant, side)');
    expect(PREVIEW_SRC).not.toContain('radius'); // no ride-height compensation exists
    // The only ride offset in the geometry layer is the hub-height difference.
    expect(0.65 - 0.75).toBeCloseTo(getChariotWheelPlacement('standard', 'left').position[1], 12);
  });

  test('no ship-path module reads a wheel radius at all', () => {
    for (const source of [GEOMETRY_SRC, RACE_SCENE_SRC, PREVIEW_SRC]) {
      expect(source).not.toContain('CHARIOT_WHEEL_RADIUS');
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. Report-only: the catalogue was NOT touched
// ══════════════════════════════════════════════════════════════════════════

describe('D. The catalogue is untouched — this slice stopped', () => {
  test('the wheels slot still sells exactly the two shipping sets, at their own prices', () => {
    const wheels = chariotPartsBySlot('wheels');
    expect(wheels.map((part) => part.id)).toEqual(['wheels_standard', 'wheels_reinforced']);
    expect(wheels.map((part) => part.price)).toEqual([0, 450]);
    expect(wheels.map((part) => part.wheelVariant)).toEqual(['standard', 'reinforced']);
    // The brief's withheld admission prices are nowhere in the catalogue.
    expect(CHARIOT_PARTS.some((part) => part.price === 600)).toBe(false);
    expect(CHARIOT_PARTS.some((part) => part.price === 800)).toBe(false);
  });

  test('no spiked or bladed part id, key or node exists in the catalogue file', () => {
    for (const banned of ['wheels_spiked', 'wheels_bladed', "'spiked'", "'bladed'", 'Wheel_Spiked', 'Wheel_Bladed']) {
      expect(CATALOGUE_SRC, banned).not.toContain(banned);
    }
    // The key union still admits only the two shipping variants.
    expect(CATALOGUE_SRC).toContain("export type ChariotWheelVariantKey = 'standard' | 'reinforced';");
  });

  test('the finishes and the slot shape are exactly as they shipped', () => {
    expect(chariotPartsBySlot('finish').map((part) => part.price)).toEqual([0, 180, 320, 240]);
    // P3 appended nine non-wheel parts; the wheels/finish rows are the same six,
    // and the wheels slot still holds exactly the two shipped sets (no Spiked/Bladed).
    expect(CHARIOT_PARTS).toHaveLength(15);
    expect(CHARIOT_PARTS.filter((part) => part.slot === 'wheels' || part.slot === 'finish')).toHaveLength(6);
    expect(CHARIOT_PARTS.filter((part) => part.slot === 'wheels')).toHaveLength(2);
  });

  test('the dev-only fit module is consumed by the dev harness and the suites alone', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = `${dir}/${entry}`;
        if (statSync(full).isDirectory()) return walk(full);
        return /\.(ts|tsx)$/.test(entry) ? [full] : [];
      });

    const root = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
    const consumers = walk(`${root}/src`)
      .filter((file) => !file.endsWith('chariotWheelFit.ts'))
      .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'))
      .filter((file) => /from '[./]*\/?chariotWheelFit'|chariotWheelFit'/.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(root.length + 1));

    expect(consumers).toEqual(['src/components/dev/HorseChariotFitPrototype.tsx']);
  });

  test('the measuring surface is DEV-gated and cannot reach a save', () => {
    expect(HARNESS_SRC).toContain("if (!import.meta.env.DEV) return null;");
    for (const banned of ['saveProfile', 'localStorage', 'sessionStorage', 'PROFILE_STORAGE_KEY']) {
      expect(HARNESS_SRC, banned).not.toContain(banned);
    }
    expect(HARNESS_SRC).toContain('WHEEL_FIT_VARIANTS');
    expect(HARNESS_SRC).toContain('getWheelFitPlacement');
  });
});
