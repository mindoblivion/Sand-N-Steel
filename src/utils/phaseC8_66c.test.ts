/**
 * Phase C-8.66C — Chariot Workshop transaction and visual-fit audit.
 *
 * Run with: `bun test src/utils/phaseC8_66c.test.ts`
 *
 * ── WHY THIS SUITE EXISTS ─────────────────────────────────────────────────
 * The C-8.66C audit re-measured the shipped C-8.66B feature and found two real
 * coverage gaps, both of them properties the implementation already satisfies:
 *
 *   §A  **Body and rim clearance of the MOUNTED wheel.** C-8.66B pins the wheel's
 *       hub, its bottom and its own disc, but nothing checked that the wheel a
 *       player actually fits still clears the chariot's body: the tub/rail, the
 *       handles and the footboard.  Both variants are put through the shipped
 *       transform as REAL vertex sets here, and the numbers below are measured
 *       from the two shipping GLBs — never restated.
 *   §B  **Material leakage through the shared cached GLB.** C-8.66B only asserted
 *       the source text contains `material.clone()`.  Here the shipped
 *       `applyChariotFinish` runs against real `THREE` objects that share
 *       materials the way `Object3D.clone()` makes them share, so the property
 *       (the cached scene's materials are never touched, and two finishes cannot
 *       leak into one another) is exercised rather than grepped.
 *   §C  **The disposable-profile harness added by this phase is isolated.** The
 *       transaction path the harness drives is the shipping one, and it provably
 *       cannot read or write the player's save.
 *
 * The transaction rules themselves (one deduction, no duplicates, refusals,
 * equip never moving gold) are already pinned by `phaseC8_66b.test.ts` and are
 * deliberately NOT restated here.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

import {
  CHARIOT_STOCK_WHEEL_BOTTOM_Y,
  CHARIOT_STOCK_WHEEL_NODES,
  CHARIOT_WHEEL_HUB_X,
  CHARIOT_WHEEL_HUB_Y,
  CHARIOT_WHEEL_KIT_HUB_Y,
  CHARIOT_WHEEL_VARIANTS,
  CHARIOT_WHEEL_YAW,
  applyChariotFinish,
  getChariotWheelPlacement,
} from './chariotGeometry';
import { getChariotPartByFinish } from '../data/chariotParts';

// ── Sources ────────────────────────────────────────────────────────────────
const load = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
/** Comments are stripped so prose can never satisfy (or defeat) an assertion. */
const code = (rel: string): string =>
  load(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const harnessSrc = code('../components/dev/ChariotWorkshopHarness.tsx');
const mainSrc = code('../main.tsx');
const storageSrc = code('../services/storage.ts');

const CHARIOT = '../../public/_workspace_chariot_model_RomanChariot.glb';
const WHEEL_KIT = '../../public/_workspace_chariot_model_RomanChariot_WheelKit.glb';

// ── A minimal, real glTF reader that yields VERTICES, not just bounds ──────
type Mat4 = number[];
const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** glTF matrices are column-major; `a` then `b` means "apply a, then b". */
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

interface GlbPart {
  name: string;
  parentName: string | null;
  /** World-space vertices in the asset's own Y-up frame (node matrices applied). */
  verts: number[][];
}

const CACHE = new Map<string, GlbPart[]>();

function chariotParts(rel: string): GlbPart[] {
  const cached = CACHE.get(rel);
  if (cached) return cached;

  const bytes = readFileSync(new URL(rel, import.meta.url));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const total = view.getUint32(8, true);
  let offset = 12;
  let json: any = null;
  let bin: Buffer | null = null;
  while (offset < total) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (chunkType === 0x4e4f534a) {
      json = JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + chunkLength)));
    }
    if (chunkType === 0x004e4942) bin = bytes.subarray(start, start + chunkLength);
    offset = start + chunkLength;
  }
  if (!json || !bin) throw new Error(`unreadable GLB: ${rel}`);
  const binary: Buffer = bin;

  const world: Mat4[] = json.nodes.map(() => IDENTITY);
  const parentOf = new Map<number, number>();
  const walk = (index: number, parent: Mat4, seen: Set<number>) => {
    if (seen.has(index)) return;
    seen.add(index);
    world[index] = matMul(nodeLocal(json.nodes[index]), parent);
    for (const child of json.nodes[index].children ?? []) {
      parentOf.set(child, index);
      walk(child, world[index], seen);
    }
  };
  for (const root of json.scenes[0].nodes ?? []) walk(root, IDENTITY, new Set<number>());

  const parts: GlbPart[] = [];
  json.nodes.forEach((node: any, index: number) => {
    if (node.mesh === undefined) return;
    const verts: number[][] = [];
    for (const prim of json.meshes[node.mesh].primitives) {
      const accessor = json.accessors[prim.attributes.POSITION];
      const bufferView = json.bufferViews[accessor.bufferView];
      const stride: number = bufferView.byteStride ?? 12;
      const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      for (let i = 0; i < accessor.count; i += 1) {
        const at = base + i * stride;
        verts.push(xf(world[index], [
          binary.readFloatLE(at),
          binary.readFloatLE(at + 4),
          binary.readFloatLE(at + 8),
        ]));
      }
    }
    parts.push({
      name: node.name,
      parentName: parentOf.has(index) ? json.nodes[parentOf.get(index) as number].name : null,
      verts,
    });
  });
  CACHE.set(rel, parts);
  return parts;
}

const axisBounds = (verts: number[][]) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const v of verts) {
    for (let k = 0; k < 3; k += 1) {
      if (v[k] < min[k]) min[k] = v[k];
      if (v[k] > max[k]) max[k] = v[k];
    }
  }
  return { min, max };
};

/** Ry(θ) — the rotation convention the geometry module documents. */
const ry = (p: number[], theta: number): number[] => [
  p[0] * Math.cos(theta) + p[2] * Math.sin(theta),
  p[1],
  -p[0] * Math.sin(theta) + p[2] * Math.cos(theta),
];

const CHARIOT_PARTS_GLB = chariotParts(CHARIOT);
const KIT_PARTS_GLB = chariotParts(WHEEL_KIT);

/** The chariot's own body: every mesh outside the two stock wheel subtrees. */
const BODY_PARTS = CHARIOT_PARTS_GLB.filter(
  (p) => !(CHARIOT_STOCK_WHEEL_NODES as readonly string[]).includes(p.parentName ?? '')
);
const STOCK_WHEEL_PARTS = CHARIOT_PARTS_GLB.filter((p) =>
  (CHARIOT_STOCK_WHEEL_NODES as readonly string[]).includes(p.parentName ?? '')
);

/** The kit variant's own vertices, mounted through the SHIPPED transform. */
function mountedWheel(variant: 'standard' | 'reinforced', side: 'left' | 'right'): number[][] {
  const node = CHARIOT_WHEEL_VARIANTS[variant].node;
  const source = KIT_PARTS_GLB.filter((p) => p.parentName === node).flatMap((p) => p.verts);
  const placement = getChariotWheelPlacement(variant, side);
  return source.map((p) => {
    const r = ry(p, placement.rotationY);
    return [
      r[0] + placement.position[0],
      r[1] + placement.position[1],
      r[2] + placement.position[2],
    ];
  });
}

const nearestTo = (wheel: number[][], partNames: (name: string) => boolean) => {
  let best = Infinity;
  let part: string | null = null;
  for (const body of BODY_PARTS) {
    if (!partNames(body.name)) continue;
    for (const a of wheel) {
      for (const b of body.verts) {
        const dx = a[0] - b[0];
        const dy = a[1] - b[1];
        const dz = a[2] - b[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < best) {
          best = d2;
          part = body.name;
        }
      }
    }
  }
  return { distance: Math.sqrt(best), part };
};

const overlaps = (a: { min: number[]; max: number[] }, b: { min: number[]; max: number[] }) =>
  [0, 1, 2].every((k) => a.min[k] <= b.max[k] && b.min[k] <= a.max[k]);

// ══════════════════════════════════════════════════════════════════════════
describe('C-8.66C §A — the MOUNTED wheel still clears the chariot body', () => {
  for (const variant of ['standard', 'reinforced'] as const) {
    for (const side of ['left', 'right'] as const) {
      const label = `${variant} / ${side}`;

      test(`${label}: the mounted wheel sits in exactly the stock wheel's X band`, () => {
        const stock = STOCK_WHEEL_PARTS.filter((p) => p.parentName === `Wheel_${side === 'left' ? 'L' : 'R'}`);
        const stockBounds = axisBounds(stock.flatMap((p) => p.verts));
        const wheelBounds = axisBounds(mountedWheel(variant, side));

        // The disc plane — and therefore the whole mounting interface with the
        // axle and the body's flanks — is the original one, to float32 precision.
        expect(wheelBounds.min[0]).toBeCloseTo(stockBounds.min[0], 6);
        expect(wheelBounds.max[0]).toBeCloseTo(stockBounds.max[0], 6);
        // The disc keeps the stock thickness, the same X centre, and its hub
        // centre is the axle's own axis height.
        const thickness = wheelBounds.max[0] - wheelBounds.min[0];
        const stockThickness = stockBounds.max[0] - stockBounds.min[0];
        expect(thickness).toBeCloseTo(stockThickness, 6);
        const midX = (wheelBounds.min[0] + wheelBounds.max[0]) / 2;
        const midY = (wheelBounds.min[1] + wheelBounds.max[1]) / 2;
        const midZ = (wheelBounds.min[2] + wheelBounds.max[2]) / 2;
        expect(midX).toBeCloseTo(side === 'left' ? -CHARIOT_WHEEL_HUB_X : CHARIOT_WHEEL_HUB_X, 6);
        expect(midY).toBeCloseTo(CHARIOT_WHEEL_HUB_Y, 6);
        expect(midZ).toBeCloseTo(0, 6);
      });

      test(`${label}: no chariot body part overlaps the wheel except the axle it mounts on`, () => {
        const wheelBounds = axisBounds(mountedWheel(variant, side));
        const overlapping = BODY_PARTS.filter((p) => overlaps(axisBounds(p.verts), wheelBounds)).map(
          (p) => p.name
        );

        // The hub is carried by the axle — that contact is the mounting, and the
        // stock wheel occupies the same volume there.  Anything else overlapping
        // would be the rim fouling the body.
        const allowed = new Set(['Axle', side === 'left' ? 'Axle_Cap_L' : 'Axle_Cap_R']);
        for (const name of overlapping) expect(allowed.has(name)).toBe(true);
        expect(overlapping).toContain('Axle');
      });

      test(`${label}: the rim clears the tub, the handles and the floor`, () => {
        const wheel = mountedWheel(variant, side);
        const wheelBounds = axisBounds(wheel);
        const bodyVerts = BODY_PARTS.flatMap((p) => p.verts);
        const bodyBounds = axisBounds(bodyVerts);

        const tub = nearestTo(wheel, (name) => name.startsWith('CarBody'));
        const handle = nearestTo(wheel, (name) => name.startsWith('Handle'));

        // Measured vertex-to-vertex clearances (an upper bound on the true
        // surface distance): the tub at ~0.173 and the handle grips at ~0.116
        // (reinforced) / ~0.133 (standard), i.e. no contact anywhere.
        expect(tub.distance).toBeGreaterThan(0.17);
        expect(handle.distance).toBeGreaterThan(0.11);
        expect(tub.part).not.toBeNull();
        expect(handle.part).not.toBeNull();

        // The rim stands clear ABOVE the tub's own top rail, and the wheel — not
        // any body part — is the model's lowest point, so ground contact is the
        // tyre's alone.
        expect(wheelBounds.max[1]).toBeGreaterThan(bodyBounds.max[1]);
        expect(wheelBounds.min[1]).toBeLessThan(bodyBounds.min[1]);
        expect(wheelBounds.min[1]).toBeCloseTo(
          CHARIOT_WHEEL_HUB_Y + CHARIOT_WHEEL_KIT_HUB_Y * -1 + CHARIOT_WHEEL_VARIANTS[variant].kitBottomY,
          6
        );
      });
    }
  }

  test('the reinforced rim is the closer of the two to the handle, by its own extra radius', () => {
    for (const side of ['left', 'right'] as const) {
      const standard = nearestTo(mountedWheel('standard', side), (n) => n.startsWith('Handle'));
      const reinforced = nearestTo(mountedWheel('reinforced', side), (n) => n.startsWith('Handle'));

      // The reinforced rim is 0.0175 larger, so its circumference passes that
      // much nearer the grip at the same hub; the tub is unaffected because the
      // disc keeps the stock wheel's X band, which is where the tub clearance is
      // measured.
      expect(reinforced.distance).toBeLessThan(standard.distance);
      expect(standard.distance - reinforced.distance).toBeCloseTo(0.0172, 3);

      const tubStandard = nearestTo(mountedWheel('standard', side), (n) => n.startsWith('CarBody'));
      const tubReinforced = nearestTo(mountedWheel('reinforced', side), (n) => n.startsWith('CarBody'));
      expect(tubReinforced.distance).toBeCloseTo(tubStandard.distance, 2);
    }
  });

  test('the kit wheels are mounted as two independent instances of the kit nodes', () => {
    // Distinct vertex sets per side: a shared instance could not produce them.
    const left = mountedWheel('reinforced', 'left');
    const right = mountedWheel('reinforced', 'right');
    expect(left.length).toBe(right.length);
    expect(left[0][0]).toBeCloseTo(-right[0][0], 6);
    // ...and both sides are mirrored about X = 0, on the hub ±CHARIOT_WHEEL_HUB_X.
    const leftHub = getChariotWheelPlacement('reinforced', 'left');
    const rightHub = getChariotWheelPlacement('reinforced', 'right');
    expect(leftHub.hub[0]).toBeCloseTo(-CHARIOT_WHEEL_HUB_X, 9);
    expect(rightHub.hub[0]).toBeCloseTo(CHARIOT_WHEEL_HUB_X, 9);
    expect(leftHub.rotationY).toBeCloseTo(CHARIOT_WHEEL_YAW, 9);
    expect(rightHub.rotationY).toBeCloseTo(CHARIOT_WHEEL_YAW, 9);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('C-8.66C §B — a finish never leaks through the shared cached GLB', () => {
  /** A cached scene and a clone of it, sharing materials the way three.js does. */
  const makePair = () => {
    const shared = new THREE.MeshStandardMaterial({ name: 'Wood' });
    const sharedBronze = new THREE.MeshStandardMaterial({ name: 'Bronze' });
    const cached = new THREE.Group();
    cached.add(new THREE.Mesh(new THREE.BoxGeometry(), shared));
    cached.add(new THREE.Mesh(new THREE.BoxGeometry(), sharedBronze));
    const clone = cached.clone(true);
    return { cached, clone, shared, sharedBronze };
  };

  test('the cached scene keeps its own material objects and colours', () => {
    const { cached, clone, shared, sharedBronze } = makePair();
    const beforeWood = shared.color.getHexString();
    const beforeBronze = sharedBronze.color.getHexString();

    applyChariotFinish(clone, getChariotPartByFinish('charred')!.overrides ?? []);

    expect(shared.color.getHexString()).toBe(beforeWood);
    expect(sharedBronze.color.getHexString()).toBe(beforeBronze);
    // The clone's meshes no longer point at the cached materials at all.
    const cloneMaterials: THREE.Material[] = [];
    clone.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) cloneMaterials.push(m.material as THREE.Material);
    });
    expect(cloneMaterials).not.toContain(shared as THREE.Material);
    const recoloured = cloneMaterials.filter((m) => m.name === 'Wood') as THREE.MeshStandardMaterial[];
    expect(recoloured).toHaveLength(1);
    expect(recoloured[0].color.getHexString()).toBe('241a12');
    // The untouched material is still the SHARED one (only matches are cloned).
    expect(cloneMaterials.filter((m) => m.name === 'Bronze')).toContain(sharedBronze as THREE.Material);
  });

  test('two different finishes never bleed into one another or the cache', () => {
    const { cached, shared } = makePair();
    const a = cached.clone(true);
    const b = cached.clone(true);
    applyChariotFinish(a, getChariotPartByFinish('charred')!.overrides ?? []);
    applyChariotFinish(b, getChariotPartByFinish('oxblood')!.overrides ?? []);

    const colourOf = (root: THREE.Object3D, name: string) => {
      let hex: string | null = null;
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && (m.material as THREE.Material).name === name) {
          hex = (m.material as THREE.MeshStandardMaterial).color.getHexString();
        }
      });
      return hex;
    };

    // 'charred' recolours Wood, 'oxblood' recolours Wood too — to a different tone.
    expect(colourOf(a, 'Wood')).toBe('241a12');
    expect(colourOf(b, 'Wood')).toBe('c9a86b');
    expect(colourOf(a, 'Wood')).not.toBe(colourOf(b, 'Wood'));
    // ...and neither touched the cache they were cloned from.
    expect(shared.color.getHexString()).toBe('ffffff');
  });

  test('the stock finish is a no-op: it changes nothing, not even on a clone', () => {
    const { cached, clone, shared } = makePair();
    const overrides = getChariotPartByFinish('stock')!.overrides;
    expect(overrides).toBeUndefined();
    applyChariotFinish(clone, overrides ?? []);

    let usedShared = false;
    clone.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.Material).name === 'Wood') {
        if ((m.material as THREE.Material) === (shared as THREE.Material)) usedShared = true;
      }
    });
    expect(usedShared).toBe(true);
    expect(shared.color.getHexString()).toBe('ffffff');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('C-8.66C §C — the disposable-profile harness cannot reach the real save', () => {
  test('the harness declares its own key and never names the player save', () => {
    expect(harnessSrc).toContain('HARNESS_PROFILE_KEY');
    expect(harnessSrc).toContain("'sand_and_steel_chariot_workshop_harness_v1'");
    // No reference to the real key, and no use of the persisting storage helpers.
    expect(harnessSrc).not.toContain('PROFILE_STORAGE_KEY');
    expect(harnessSrc).not.toContain('sand_and_steel_gladiator_save_v2');
    expect(harnessSrc).not.toContain('saveProfile');
    expect(harnessSrc).not.toContain('loadSavedProfile');
    expect(harnessSrc).not.toContain('clearSavedProfile');
    // ...while the real save key is exactly the one the harness avoids.
    expect(storageSrc).toContain("'sand_and_steel_gladiator_save_v2'");
    // The disposable profile lives in per-tab scratch storage, so it can never
    // sit in a persisted browser profile.
    expect(harnessSrc).toContain('sessionStorage');
    expect(harnessSrc).toContain('scratchStorage');
  });

  test('the harness drives the REAL workshop UI and the shipping helpers', () => {
    expect(harnessSrc).toContain("from '../hub/GearTab'");
    expect(harnessSrc).toContain('<GearTab');
    expect(harnessSrc).toContain('gearView="chariot"');
    expect(harnessSrc).toContain('purchaseChariotPart');
    expect(harnessSrc).toContain('equipChariotPart');
    expect(harnessSrc).toContain('resolveChariotLoadout');
    // Its profile is seeded from a query parameter, so affordability is never
    // forced by editing a stored save.
    expect(harnessSrc).toContain("get('gold')");
  });

  test('main.tsx mounts it only in a dev build, behind the exact parameter', () => {
    expect(mainSrc).toContain("import.meta.env.DEV &&");
    expect(mainSrc).toContain("new URLSearchParams(window.location.search).get('devHarness') === 'chariot'");
    expect(mainSrc).toContain("import('./components/dev/ChariotWorkshopHarness')");
    // A preview browser that cannot deliver a query parameter on a reload uses
    // the equivalent dev-only flag, which is read under the same DEV gate.
    expect(mainSrc).toContain('sand_and_steel_dev_harness');
    expect(mainSrc).toContain('readDevHarnessFlag');
    // The character harness keeps its own branch — this phase added a branch, it
    // did not replace one.
    expect(mainSrc).toContain("get('devHarness') === 'character'");
    expect(mainSrc).toContain("import('./components/dev/CharacterTestHarness')");
  });

  test('the workshop UI is unchanged by this phase — no new mutation path in it', () => {
    const workshopSrc = code('../components/hub/ChariotWorkshopTab.tsx');
    // Preview/reset touch component state only; buying and equipping go out
    // through the two callbacks.
    expect(workshopSrc).not.toContain('saveProfile');
    expect(workshopSrc).not.toContain('localStorage');
    expect(workshopSrc).not.toContain('purchaseChariotPart');
    expect(workshopSrc).toContain('onBuyPart');
    expect(workshopSrc).toContain('onEquipPart');
  });
});
