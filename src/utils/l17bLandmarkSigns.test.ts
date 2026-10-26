/**
 * L17B — landmark signage.
 *
 * The nine delivered landmark signs are integrated into their own city
 * buildings through one shared component (`components/3d/city/LandmarkSign.tsx`)
 * and one typed data map (`src/data/landmarkSigns.ts`).  This suite pins the
 * three things that can silently rot:
 *
 *   §A the DATA — nine ids, nine stable asset paths that really exist, and
 *      mounting parameters that are explicit, finite and face the approach;
 *   §B the ASSETS — every published plate dimension is re-measured from the
 *      shipping GLB with @gltf-transform/core, so a re-export cannot quietly
 *      invalidate the backing panel or a clearance;
 *   §C the MOUNTS — each target building mounts exactly one sign, no city file
 *      mounts more than one, the Colosseum keeps its own sign exactly once, and
 *      the world footprint of each sign stands clear of every collider (nothing
 *      was added to the movement registry) while still flanking its facade;
 *   §D the CONTRACT — signage stays presentation-only: the data module imports
 *      nothing, the component imports nothing from the city's systems, the
 *      collider and hub registries are what C-8.64B/C-8.47 left, and no hub
 *      centre sits inside a sign's footprint.
 *
 * Source reads are used only where the requirement IS a mount (how many
 * `<LandmarkSign>` nodes a component renders); every geometric claim is derived
 * from the data, the shipped registry, or the GLB itself.
 *
 * Run with: bun test src/utils/l17bLandmarkSigns.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  LANDMARK_SIGNS,
  LANDMARK_SIGNS_BY_ID,
  LANDMARK_SIGN_ASSET_BOUNDS,
  LANDMARK_SIGN_BACKING,
  landmarkSignWorldFootprint,
  landmarkSignWorldMount,
} from '../data/landmarkSigns';
import { CITY_COLLIDERS } from './collisionShapes';
// L21B — the unclamped rectangle-separation predicate both sign suites share.
import { rectsClear } from './landmarkSignClearance';
import { HUB_LOCATIONS, FAST_TRAVEL_ARRIVALS, BOUNDARY_X, BOUNDARY_Z_MAX, BOUNDARY_Z_MIN } from './cityCollisions';

const CITY_DIR = new URL('../components/3d/city/', import.meta.url);
const CITY_FILE = (name: string): string => readFileSync(new URL(name, CITY_DIR), 'utf8');
const cityFiles = readdirSync(CITY_DIR).filter((f) => f.endsWith('.tsx'));

/** The collider each sign flanks — the rendered lower plinth step of its building. */
const BUILDING_COLLIDER: Record<string, string> = {
  city_tavern: 'city-tavern',
  smithing_forge: 'smithing-forge',
  general_store: 'general-store',
  training_hall: 'training-hall',
  records_library: 'records-library',
  arena_medical: 'arena-medical',
  gladiator_barracks: 'gladiator-barracks',
  gladiator_academy: 'gladiator-academy',
  veteran_hall: 'veteran-hall',
};

const rectOf = (id: string) => {
  const found = CITY_COLLIDERS.find((c) => c.id === id);
  if (!found || found.type !== 'rect') throw new Error(`collider ${id} is not a rect`);
  return { minX: found.cx - found.hw, maxX: found.cx + found.hw, minZ: found.cz - found.hd, maxZ: found.cz + found.hd, cx: found.cx, cz: found.cz };
};

/** Planar gap between a sign footprint and a building rectangle (0 when they meet). */
const gapBetween = (
  fp: { minX: number; maxX: number; minZ: number; maxZ: number },
  r: { minX: number; maxX: number; minZ: number; maxZ: number },
) => {
  const dx = Math.max(r.minX - fp.maxX, fp.minX - r.maxX, 0);
  const dz = Math.max(r.minZ - fp.maxZ, fp.minZ - r.maxZ, 0);
  return Math.hypot(dx, dz);
};

/** A source with comments stripped, so prose can neither satisfy nor defeat a check. */
const code = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

describe('L17B §A — sign data', () => {
  test('nine non-Colosseum signs, each named once', () => {
    expect(LANDMARK_SIGNS).toHaveLength(9);
    const ids = LANDMARK_SIGNS.map((s) => s.id);
    expect(new Set(ids).size).toBe(9);
    expect(Object.keys(LANDMARK_SIGNS_BY_ID).sort()).toEqual([...ids].sort());
    expect(ids).not.toContain('grand_colosseum');
  });

  test('one building per sign, and one sign per building', () => {
    const buildings = LANDMARK_SIGNS.map((s) => s.building);
    expect(new Set(buildings).size).toBe(9);
  });

  test('every id maps to its own stable asset path', () => {
    for (const sign of LANDMARK_SIGNS) {
      expect(sign.assetPath).toBe(`/signs/${sign.id}/${sign.id}.glb`);
    }
    const paths = LANDMARK_SIGNS.map((s) => s.assetPath);
    expect(new Set(paths).size).toBe(9);
  });

  test('every mounted building is a real city component', () => {
    for (const sign of LANDMARK_SIGNS) {
      expect(cityFiles).toContain(sign.building);
    }
  });

  test('mounting parameters are explicit, finite and non-degenerate', () => {
    for (const sign of LANDMARK_SIGNS) {
      expect(sign.position).toHaveLength(3);
      expect(sign.position.every(Number.isFinite)).toBe(true);
      expect(sign.position[1]).toBe(0); // stands on the city ground plane
      expect(Number.isFinite(sign.rotationY)).toBe(true);
      expect(sign.rotationY).toBeGreaterThanOrEqual(-Math.PI);
      expect(sign.rotationY).toBeLessThanOrEqual(Math.PI);
      expect(sign.buildingRoot.every(Number.isFinite)).toBe(true);
      expect([0, Math.PI / 2, -Math.PI / 2, Math.PI]).toContain(sign.buildingYaw);
      expect(sign.scale).toBe(1); // the asset's authored, human-scaled proportions
      expect(sign.plateWidth).toBeGreaterThan(0.8);
      expect(sign.plateWidth).toBeLessThan(1.4);
      expect(sign.note.length).toBeGreaterThan(0);
      expect(typeof sign.label).toBe('string');
    }
  });

  test('each sign reads from the side it is turned to face', () => {
    // worldYaw 0 → +Z (south); +π/2 → +X (east); −π/2 → −X (west); π → −Z (north).
    const facingOf = (yaw: number) => {
      const quarters = [0, Math.PI / 2, -Math.PI / 2, Math.PI];
      const index = quarters.findIndex((q) => Math.abs(q - yaw) < 1e-9);
      expect(index).toBeGreaterThanOrEqual(0);
      return ['south', 'east', 'west', 'north'][index];
    };
    for (const sign of LANDMARK_SIGNS) {
      const { position, rotationY } = landmarkSignWorldMount(sign);
      expect(facingOf(rotationY)).toBe(sign.facing);
      // The plate's front normal points away from the building it belongs to.
      const r = rectOf(BUILDING_COLLIDER[sign.id]);
      const outward = { x: position[0] - r.cx, z: position[2] - r.cz };
      const normal = { x: Math.sin(rotationY), z: Math.cos(rotationY) };
      expect(outward.x * normal.x + outward.z * normal.z).toBeGreaterThan(0);
    }
  });

  test('the backing panel keeps the Colosseum treatment and no plate is stretched', () => {
    expect(LANDMARK_SIGN_BACKING.margin).toBe(0.03);
    expect(LANDMARK_SIGN_BACKING.depth).toBe(0.015);
    expect(LANDMARK_SIGN_BACKING.centerY).toBe(1.565);
    expect(LANDMARK_SIGN_BACKING.centerZ).toBe(-0.06);
    // Width follows each measured plate, so the nine panels differ with them.
    const widths = LANDMARK_SIGNS.map((s) => s.plateWidth + 2 * LANDMARK_SIGN_BACKING.margin);
    expect(new Set(widths).size).toBe(9);
    for (const w of widths) expect(w).toBeGreaterThan(0.85);
  });
});

describe('L17B §B — the shipping assets', () => {
  for (const sign of LANDMARK_SIGNS) {
    test(`${sign.id}: plate bounds agree with the published dimensions`, async () => {
      const bytes = readFileSync(new URL(`../../public/signs/${sign.id}/${sign.id}.glb`, import.meta.url));
      expect(bytes.byteLength).toBeGreaterThan(50_000);
      const doc = await io.readBinary(new Uint8Array(bytes));
      const root = doc.getRoot();
      const signNode = root.listNodes().find((n) => n.getName() === 'sign');
      const postNode = root.listNodes().find((n) => n.getName() === 'post');
      expect(signNode).toBeDefined();
      expect(postNode).toBeDefined();

      const plate = signNode!.getMesh()!.listPrimitives()[0].getAttribute('POSITION')!;
      const min = plate.getMin([]);
      const max = plate.getMax([]);

      // Plate width: the one dimension that differs per sign (published to 3 dp).
      expect(max[0] - min[0]).toBeCloseTo(sign.plateWidth, 2);
      // Height and the plate's Y band are shared by all nine and reused verbatim.
      expect(min[1]).toBeCloseTo(LANDMARK_SIGN_ASSET_BOUNDS.plateMinY, 3);
      expect(max[1]).toBeCloseTo(LANDMARK_SIGN_ASSET_BOUNDS.plateMaxY, 3);
      expect(max[1] - min[1]).toBeCloseTo(LANDMARK_SIGN_BACKING.plateHeight, 3);
      // The plate hangs centred on the bracket, so the backing needs no X offset.
      expect((min[0] + max[0]) / 2).toBeCloseTo(0, 3);
      // The backing sits behind the plate's own back face.
      expect(min[2]).toBeGreaterThan(LANDMARK_SIGN_BACKING.centerZ + LANDMARK_SIGN_BACKING.depth / 2);

      // Whole-assembly envelope: ground contact, height and depth.
      let bodyMinY = Infinity;
      let bodyMaxY = -Infinity;
      let bodyMaxAbsZ = 0;
      for (const node of root.listNodes()) {
        const mesh = node.getMesh();
        if (!mesh) continue;
        for (const prim of mesh.listPrimitives()) {
          const pos = prim.getAttribute('POSITION');
          if (!pos) continue;
          const pMin = pos.getMin([]);
          const pMax = pos.getMax([]);
          bodyMinY = Math.min(bodyMinY, pMin[1]);
          bodyMaxY = Math.max(bodyMaxY, pMax[1]);
          bodyMaxAbsZ = Math.max(bodyMaxAbsZ, Math.abs(pMin[2]), Math.abs(pMax[2]));
        }
      }
      expect(bodyMinY).toBeCloseTo(0, 3);
      expect(bodyMaxY).toBeCloseTo(LANDMARK_SIGN_ASSET_BOUNDS.height, 2);
      expect(bodyMaxAbsZ).toBeCloseTo(LANDMARK_SIGN_ASSET_BOUNDS.halfDepth, 3);
    });
  }
});

describe('L17B §C — the mounts', () => {
  test('each target building mounts exactly one sign, its own', () => {
    for (const sign of LANDMARK_SIGNS) {
      const source = code(CITY_FILE(sign.building));
      expect(source.split('<LandmarkSign').length - 1).toBe(1);
      expect(source).toContain(`id="${sign.id}"`);
      expect(source).toContain("from './LandmarkSign'");
    }
  });

  test('no city component mounts more than one sign', () => {
    for (const file of cityFiles) {
      const mounts = code(CITY_FILE(file)).split('<LandmarkSign').length - 1;
      expect({ file, mounts }).toEqual({ file, mounts: mounts <= 1 ? mounts : -1 });
    }
  });

  test('the Grand Colosseum keeps its own sign, mounted exactly once', () => {
    let colosseumMounts = 0;
    for (const file of cityFiles) {
      colosseumMounts += code(CITY_FILE(file)).split('<ColosseumSignPrototype').length - 1;
    }
    // The JSX mount itself, in the one component that owns the Colosseum sign.
    expect(colosseumMounts).toBe(1);
    expect(CITY_FILE('GrandColosseum.tsx')).toContain('<ColosseumSignPrototype />');
    // …and it is not one of the nine: nothing double-signs the Colosseum.
    expect(LANDMARK_SIGNS.some((s) => s.building === 'GrandColosseum.tsx')).toBe(false);
  });

  test('every sign stands clear of every collider, and no collider was added', () => {
    expect(CITY_COLLIDERS.filter((c) => c.id.includes('sign'))).toHaveLength(0);
    for (const sign of LANDMARK_SIGNS) {
      const fp = landmarkSignWorldFootprint(sign);
      for (const collider of CITY_COLLIDERS) {
        if (collider.type === 'rect') {
          // L21B — the unclamped separating-axis test.  This used to read
          // `gapBetween(...) >= 0`, i.e. `Math.hypot(dx, dz) >= 0` on clamped (so
          // non-negative) separations: it could not fail, and every overlap read as
          // clear.  Two rectangles are disjoint only when ONE axis is strictly apart.
          expect({ sign: sign.id, collider: collider.id, clear: rectsClear(fp, rectOf(collider.id)) }).toEqual({
            sign: sign.id,
            collider: collider.id,
            clear: true,
          });
        } else if (collider.type === 'circle') {
          const nearestX = Math.min(Math.max(collider.cx, fp.minX), fp.maxX);
          const nearestZ = Math.min(Math.max(collider.cz, fp.minZ), fp.maxZ);
          expect(Math.hypot(collider.cx - nearestX, collider.cz - nearestZ)).toBeGreaterThanOrEqual(collider.r);
        } else {
          // Segment: the footprint must not contain either endpoint' side of the line.
          const inside = (x: number, z: number) => x > fp.minX && x < fp.maxX && z > fp.minZ && z < fp.maxZ;
          expect(inside(collider.x1, collider.z1) || inside(collider.x2, collider.z2)).toBe(false);
        }
      }
    }
  });

  test('each sign flanks its own facade: outside it, overlapping along it, close to it', () => {
    for (const sign of LANDMARK_SIGNS) {
      const fp = landmarkSignWorldFootprint(sign);
      const r = rectOf(BUILDING_COLLIDER[sign.id]);
      const gap = gapBetween(fp, r);
      // Outside the building, and still on its frontage apron.  Measured, the
      // band runs from the Veteran Hall's 0.151 (its plate stands just off the
      // bottom step, which is 0.16 tall) to the Training Hall's 3.201 (its apron
      // is the veranda, and the veranda — like every building's posts, awnings
      // and barrels — carries no collider, so the plate stands 0.55 from the
      // veranda's outer edge instead).
      expect({ sign: sign.id, clear: gap >= 0.15 && gap <= 3.5 }).toEqual({ sign: sign.id, clear: true });
      // It flanks one face rather than floating off a corner: disjoint on one
      // axis, overlapping the building's band on the other.
      const disjointX = fp.maxX <= r.minX || fp.minX >= r.maxX;
      const disjointZ = fp.maxZ <= r.minZ || fp.minZ >= r.maxZ;
      expect({ sign: sign.id, flanks: disjointX !== disjointZ }).toEqual({ sign: sign.id, flanks: true });
    }
  });

  test('each sign is reachable inside the movement boundary', () => {
    for (const sign of LANDMARK_SIGNS) {
      const { position } = landmarkSignWorldMount(sign);
      expect(Math.abs(position[0])).toBeLessThanOrEqual(BOUNDARY_X);
      expect(position[2]).toBeLessThanOrEqual(BOUNDARY_Z_MAX);
      expect(position[2]).toBeGreaterThanOrEqual(BOUNDARY_Z_MIN);
    }
  });

  test('no sign stands on a hub centre or a fast-travel landing point', () => {
    for (const sign of LANDMARK_SIGNS) {
      const { position } = landmarkSignWorldMount(sign);
      for (const hub of HUB_LOCATIONS) {
        const d = Math.hypot(hub.position[0] - position[0], hub.position[2] - position[2]);
        expect({ sign: sign.id, hub: hub.id, clear: d > 1.5 }).toEqual({ sign: sign.id, hub: hub.id, clear: true });
      }
      for (const [id, [ax, az]] of Object.entries(FAST_TRAVEL_ARRIVALS)) {
        const d = Math.hypot(ax - position[0], az - position[2]);
        expect({ sign: sign.id, arrival: id, clear: d > 0.8 }).toEqual({ sign: sign.id, arrival: id, clear: true });
      }
    }
  });
});

describe('L17B §D — presentation only', () => {
  test('the data module imports nothing at all', () => {
    const source = code(readFileSync(new URL('../data/landmarkSigns.ts', import.meta.url), 'utf8'));
    expect(source.split('\n').filter((line) => line.trimStart().startsWith('import '))).toHaveLength(0);
  });

  test('the component imports only react, three, drei, its own data and the shared 3D boundary', () => {
    const source = code(readFileSync(new URL('../components/3d/city/LandmarkSign.tsx', import.meta.url), 'utf8'));
    const specifiers = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    // L17D added the ONE shared 3D error boundary (the project's own
    // `ThreeComponentErrorBoundary`) so a failed GLB stays local to its sign;
    // no city system, no storage and no new global handler came with it.
    expect(specifiers.sort()).toEqual(
      ['../../../data/landmarkSigns', '../../ui/ThreeComponentErrorBoundary', '@react-three/drei', 'react', 'three'].sort(),
    );
    expect(source).toContain('componentName={`LandmarkSign:${id}`}');
    expect(source).toContain('fallback={null}');
    // No per-frame work, no lights, no eager preloading of the other models.
    expect(source).not.toContain('useFrame');
    expect(source).not.toContain('pointLight');
    expect(source).not.toContain('useGLTF.preload');
  });

  test('the movement registry is the one C-8.64B left, with no signage entry', () => {
    expect(CITY_COLLIDERS).toHaveLength(142);
    expect(CITY_COLLIDERS.filter((c) => c.type === 'rect')).toHaveLength(32);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-'))).toHaveLength(46);
    expect(new Set(CITY_COLLIDERS.map((c) => c.id)).size).toBe(CITY_COLLIDERS.length);
  });

  test('the hubs, arrivals and clock contract are untouched by this phase', () => {
    // 21 hubs / 21 arrivals: C-8.47 left 20, C-8.64A added the East Circus race entry.
    expect(HUB_LOCATIONS).toHaveLength(21);
    expect(Object.keys(FAST_TRAVEL_ARRIVALS)).toHaveLength(21);
    // The nine buildings keep the interaction reach C-8.47 derived for them.
    const radii: Record<string, number> = {
      smithing_forge: 6,
      general_store: 5.25,
      tavern: 5.75,
      training_yard: 4.5,
      gladiator_academy: 5.25,
      records_house: 4.5,
      gladiator_barracks: 4.5,
      veteran_gladiator_hall: 4.5,
      arena_medical_house: 4.5,
    };
    for (const [id, radius] of Object.entries(radii)) {
      const hub = HUB_LOCATIONS.find((h) => h.id === id);
      expect({ id, radius: hub?.radius }).toEqual({ id, radius });
    }
  });

  test('no sign footprint covers a hub centre', () => {
    for (const sign of LANDMARK_SIGNS) {
      const fp = landmarkSignWorldFootprint(sign);
      for (const hub of HUB_LOCATIONS) {
        const inside = hub.position[0] > fp.minX && hub.position[0] < fp.maxX && hub.position[2] > fp.minZ && hub.position[2] < fp.maxZ;
        expect({ sign: sign.id, hub: hub.id, inside }).toEqual({ sign: sign.id, hub: hub.id, inside: false });
      }
    }
  });
});
