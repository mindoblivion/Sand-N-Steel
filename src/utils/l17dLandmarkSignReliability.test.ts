/**
 * L17D — landmark signage reliability and targeted corrections.
 *
 * L17B mounted the nine sign GLBs through one shared component; L17C's read-only
 * audit then found three narrow defects and this suite pins the corrections
 * without redesigning anything:
 *
 *   §A the FAILURE PATH — a sign whose GLB fails to load is caught by its OWN
 *      boundary (the project's existing `ThreeComponentErrorBoundary`) and
 *      renders nothing, so the city's single architectural-district boundary is
 *      never reached and no other building disappears.  The boundary's real
 *      class is instantiated and driven through its real `getDerivedStateFromError`
 *      → `render()` contract, and it is shown to hold that state (no retry, no
 *      loop).
 *   §B the BARKS DOORWAY — the Barracks sign post, re-derived from the shipped
 *      doorway geometry, used to stand inside the door's own clear opening; it
 *      now clears the opening, the threshold step and the worn contact step.
 *      The Medical House porch is measured too, and shown to need no move.
 *   §C the NINE MOUNTS — the shipped mapping table, re-checked id by id.
 *   §D the CONTRACT — the collider, hub and arrival registries are unchanged,
 *      every sign still stands clear of every collider, and nothing about the
 *      failure handling is global.
 *
 * Run with: bun test src/utils/l17dLandmarkSignReliability.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { Suspense } from 'react';
import { LandmarkSign } from '../components/3d/city/LandmarkSign';
import { ThreeComponentErrorBoundary } from '../components/ui/ThreeComponentErrorBoundary';
import {
  LANDMARK_SIGNS,
  LANDMARK_SIGNS_BY_ID,
  LANDMARK_SIGN_ASSET_BOUNDS,
  landmarkSignWorldFootprint,
  landmarkSignWorldMount,
  type LandmarkSignMount,
} from '../data/landmarkSigns';
import { CITY_COLLIDERS } from './collisionShapes';
import { HUB_LOCATIONS, FAST_TRAVEL_ARRIVALS } from './cityCollisions';

const CITY_DIR = new URL('../components/3d/city/', import.meta.url);
const CITY_FILE = (name: string): string => readFileSync(new URL(name, CITY_DIR), 'utf8');
const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const cityFiles = readdirSync(CITY_DIR).filter((f) => f.endsWith('.tsx'));

const SIGN_SOURCE = read('../components/3d/city/LandmarkSign.tsx');
const DATA_SOURCE = read('../data/landmarkSigns.ts');
const ARCH_SOURCE = read('../components/3d/city/ClassicalArchitecture.tsx');
const HUB_SOURCE = read('../components/3d/city/CityHubScene.tsx');

/** A source with comments stripped, so prose can neither satisfy nor defeat a check. */
const code = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');

const num = (src: string, re: RegExp, what: string): number => {
  const m = src.match(re);
  if (!m) throw new Error(`could not read ${what}`);
  return Number(m[1]);
};

// ── §A: the sign's own failure boundary ─────────────────────────────────────

/**
 * A React function component returns `ReactNode` to TypeScript in React 19, so
 * the element `LandmarkSign` builds is typed here for inspection: the boundary
 * it renders, its own props, and the Suspense → model chain inside it.
 */
type SignBoundaryElement = {
  type: typeof ThreeComponentErrorBoundary;
  props: {
    componentName?: string;
    fallback?: unknown;
    children: {
      type: unknown;
      props: { children: { type: { name?: string }; props: unknown } };
    };
  };
};

const mountOf = (id: string): SignBoundaryElement =>
  LandmarkSign({ id: id as never }) as unknown as SignBoundaryElement;

describe('L17D §A — an individual sign cannot take the district with it', () => {
  test('every sign is wrapped in its own boundary, outside its Suspense', () => {
    for (const sign of LANDMARK_SIGNS) {
      const element = mountOf(sign.id);
      // The nearest boundary to the model is the sign's own — not the district's.
      expect({ id: sign.id, boundary: element.type === ThreeComponentErrorBoundary }).toEqual({
        id: sign.id,
        boundary: true,
      });
      // A failed sign renders NOTHING (null fallback), so nothing is invented in its place.
      expect(element.props.fallback).toBe(null);
      // The boundary is named after the sign it isolates, so a console warning says which.
      expect(element.props.componentName).toBe(`LandmarkSign:${sign.id}`);
      // Suspense still owns loading; the boundary owns failures.
      expect(element.props.children.type).toBe(Suspense);
      const model = element.props.children.props.children;
      expect(model.type.name).toBe('LandmarkSignModel');
      expect(model.props).toEqual({ id: sign.id });
    }
  });

  test('a failed load renders null, and keeps doing so (no retry, no loop)', () => {
    const error = new Error('Failed to load /signs/gladiator_barracks/gladiator_barracks.glb');

    for (const sign of LANDMARK_SIGNS) {
      const element = mountOf(sign.id);
      const boundary = new (element.type as unknown as new (props: unknown) => ThreeComponentErrorBoundary)(
        element.props,
      );

      // Healthy: the boundary renders its children unchanged.
      expect(boundary.render()).toBe(element.props.children);

      // React hands the throw to the boundary's own static state transition…
      const next = ThreeComponentErrorBoundary.getDerivedStateFromError(error);
      expect(next.hasError).toBe(true);
      boundary.state = next;

      // …and from then on the sign renders nothing, exactly as the district's
      // siblings keep rendering.  40 renders stand in for 40 re-renders: a
      // retrying boundary would show up as a non-null result here.
      for (let i = 0; i < 40; i += 1) {
        expect(boundary.render()).toBe(null);
      }
      expect(boundary.state.hasError).toBe(true);
    }
  });

  test('one failed sign leaves the other eight mountable', () => {
    const failed = 'city_tavern';
    const broken = new (mountOf(failed).type as unknown as new (p: unknown) => ThreeComponentErrorBoundary)(
      mountOf(failed).props,
    );
    broken.state = ThreeComponentErrorBoundary.getDerivedStateFromError(new Error('404'));

    expect(broken.render()).toBe(null);
    for (const sign of LANDMARK_SIGNS.filter((s) => s.id !== failed)) {
      const ok = new (mountOf(sign.id).type as unknown as new (p: unknown) => ThreeComponentErrorBoundary)(
        mountOf(sign.id).props,
      );
      expect(ok.render()).not.toBe(null);
    }
  });

  test('the boundary cannot reset itself, and nothing global was added', () => {
    const boundarySource = code(read('../components/ui/ThreeComponentErrorBoundary.tsx'));
    // The only state transition is React's own derived-error entry point.
    expect(boundarySource).not.toContain('componentDidUpdate');
    expect(boundarySource).not.toContain('setState');
    expect(boundarySource).not.toContain('componentWillReceiveProps');
    expect(boundarySource).toContain('getDerivedStateFromError');

    const signSource = code(SIGN_SOURCE);
    // Ownership: the existing 3D boundary, not a new global handler.
    expect(signSource).toContain("from '../../ui/ThreeComponentErrorBoundary'");
    expect(signSource).toContain('ThreeComponentErrorBoundary');
    expect(signSource).not.toContain('addEventListener');
    expect(signSource).not.toContain('onerror');
    expect(signSource).not.toContain('ErrorUtils');
    // No retry machinery was introduced either.
    expect(signSource).not.toContain('useGLTF.clear');
    expect(signSource).not.toContain('useGLTF.preload');
    expect(signSource).not.toContain('setTimeout');
    expect(signSource).not.toContain('retry');
  });

  test('the district boundary is unchanged and stays the outer net', () => {
    const hub = code(HUB_SOURCE);
    // Exactly one district boundary, with the name the city already used.
    expect(hub.split('<ThreeComponentErrorBoundary').length - 1).toBe(3); // districts + player + canvas guard
    expect(hub).toContain('componentName="CityArchitecturalDistricts"');
    // No building mounts a sign boundary of its own: the isolation lives in ONE place.
    for (const sign of LANDMARK_SIGNS) {
      expect({ building: sign.building, boundary: code(CITY_FILE(sign.building)).includes('ThreeComponentErrorBoundary') }).toEqual({
        building: sign.building,
        boundary: false,
      });
    }
    // …and no city file other than the hub/canvas owners names it at all.
    const owners = cityFiles.filter((f) => code(CITY_FILE(f)).includes('ThreeComponentErrorBoundary'));
    expect(owners.sort()).toEqual(['CityHubScene.tsx', 'LandmarkSign.tsx']);
  });
});

// ── §B: the Barracks doorway, and the Medical House porch ───────────────────

/** `GladiatorBarracks`'s own doorway, read from its source. */
const barracksDoorway = (() => {
  const block = CITY_FILE('GladiatorBarracks.tsx').match(/<ClassicalDoorway[\s\S]*?\/>/);
  if (!block) throw new Error('GladiatorBarracks.tsx has no ClassicalDoorway');
  const src = block[0];
  return {
    position: [
      num(src, /position=\{\[(-?[\d.]+),/, 'door X'),
      num(src, /position=\{\[[-\d.]+, ([\d.]+),/, 'door Y'),
      num(src, /position=\{\[[-\d.]+, [\d.]+, (-?[\d.]+)\]/, 'door Z'),
    ] as [number, number, number],
    width: num(src, /width=\{([\d.]+)\}/, 'door width'),
    height: num(src, /height=\{([\d.]+)\}/, 'door height'),
    depth: num(src, /depth=\{([\d.]+)\}/, 'door depth'),
  };
})();

/** `ClassicalDoorway`'s own jamb width — the piece the clear opening is cut by. */
const JAMB = num(
  ARCH_SOURCE.match(/jambWidth = ([\d.]+);/)?.[0] ?? '',
  /jambWidth = ([\d.]+);/,
  'ClassicalDoorway jambWidth',
);

/** Plan geometry of that doorway: clear opening, threshold step, contact step. */
const doorway = (() => {
  const { position, width, depth } = barracksDoorway;
  const z = position[2];
  return {
    /** Clear opening between the jamb faces. */
    aperture: { half: width / 2, zMin: z - depth / 2, zMax: z },
    /** Raised stone threshold — `[width + 2·jamb + 0.1] × [depth + 0.15]` at z + 0.05. */
    threshold: {
      half: (width + 2 * JAMB + 0.1) / 2,
      zMin: z + 0.05 - (depth + 0.15) / 2,
      zMax: z + 0.05 + (depth + 0.15) / 2,
    },
    /** The worn contact step in front of it — 0.25 deep at z + depth/2 + 0.12. */
    contact: {
      half: (width + 2 * JAMB) / 2,
      zMin: z + depth / 2 + 0.12 - 0.125,
      zMax: z + depth / 2 + 0.12 + 0.125,
    },
  };
})();

const BARRACKS = LANDMARK_SIGNS_BY_ID.gladiator_barracks;

/**
 * The sign's own plan bands in its BUILDING's local X/Z.  The Barracks root has
 * no rotation and the mount's own yaw is 0, so building-local and sign-local
 * axes coincide; the precondition is asserted rather than assumed.
 */
const barracksBands = (mountX: number, mountZ: number) => ({
  postX: [
    mountX + LANDMARK_SIGN_ASSET_BOUNDS.minLocalX,
    mountX + LANDMARK_SIGN_ASSET_BOUNDS.maxLocalX,
  ] as [number, number],
  plateX: [mountX - BARRACKS.plateWidth / 2, mountX + BARRACKS.plateWidth / 2] as [number, number],
  z: [mountZ - LANDMARK_SIGN_ASSET_BOUNDS.halfDepth, mountZ + LANDMARK_SIGN_ASSET_BOUNDS.halfDepth] as [number, number],
});

const rectOf = (id: string) => {
  const found = CITY_COLLIDERS.find((c) => c.id === id);
  if (!found || found.type !== 'rect') throw new Error(`collider ${id} is not a rect`);
  return { minX: found.cx - found.hw, maxX: found.cx + found.hw, minZ: found.cz - found.hd, maxZ: found.cz + found.hd, cx: found.cx, cz: found.cz };
};

describe('L17D §B — the Barracks sign clears the doorway', () => {
  test('the doorway it has to clear is the one the building draws', () => {
    expect(barracksDoorway.width).toBeCloseTo(1.5, 9);
    expect(barracksDoorway.height).toBeCloseTo(1.9, 9);
    expect(barracksDoorway.depth).toBeCloseTo(0.35, 9);
    expect(barracksDoorway.position).toEqual([0, 0, 2.82]);
    expect(JAMB).toBeCloseTo(0.22, 9);
    // The derived bands, stated so a doorway edit cannot silently change them.
    expect(doorway.aperture.half).toBeCloseTo(0.75, 9);
    expect(doorway.threshold.half).toBeCloseTo(1.02, 9);
    expect(doorway.contact.half).toBeCloseTo(0.97, 9);
    expect(doorway.contact.zMax).toBeCloseTo(3.24, 9);
    // The sign's local frame and its building's are the same frame.
    expect(BARRACKS.buildingYaw).toBe(0);
    expect(BARRACKS.rotationY).toBe(0);
  });

  test('the post stands clear of the opening, the threshold and the contact step', () => {
    const bands = barracksBands(BARRACKS.position[0], BARRACKS.position[2]);
    const postWest = Math.min(...bands.postX);

    // L17C's finding: the post used to sit inside the door's clear opening.
    // Measured now, west face → east jamb face, the threshold's outer edge and
    // the worn contact step's own edge.
    expect(postWest - doorway.aperture.half).toBeGreaterThan(0.4);
    expect(postWest - doorway.threshold.half).toBeGreaterThan(0.15);
    expect(postWest - doorway.contact.half).toBeGreaterThan(0.15);
    expect(postWest - doorway.aperture.half).toBeCloseTo(0.48, 6);
    expect(postWest - doorway.threshold.half).toBeCloseTo(0.21, 6);
    expect(postWest - doorway.contact.half).toBeCloseTo(0.26, 6);

    // The whole assembly still stands clear of the contact step in Z, by the
    // 0.161 it always had — the correction moved X only.
    const zClear = bands.z[0] - doorway.contact.zMax;
    expect(zClear).toBeGreaterThan(0.15);
    expect(zClear).toBeCloseTo(0.161, 3);

    // And it clears the threshold step outright in 3-D: disjoint in Z, so the
    // remaining plan overlap is not an interpenetration.
    expect(bands.z[0] - doorway.threshold.zMax).toBeGreaterThan(0.2);
  });

  test('the plate still reads on the facade and clears the balcony post', () => {
    const bands = barracksBands(BARRACKS.position[0], BARRACKS.position[2]);
    // The rendered wall box (6.6 wide) half-width is the facade the plate faces.
    const wallHalf = num(CITY_FILE('GladiatorBarracks.tsx'), /args=\{\[([\d.]+), 2\.0, [\d.]+\]\}/, 'wall width') / 2;
    expect(bands.plateX[1]).toBeLessThan(wallHalf);
    // The balcony's east post stands at X 3.00 (radius 0.08).
    const balconyX = 3.0;
    expect(balconyX - bands.plateX[1]).toBeCloseTo(0.211, 3);
  });

  test('the pre-fix mount is shown to be the defect (control)', () => {
    const before = barracksBands(1.6, 3.6);
    const beforePostWest = Math.min(...before.postX);
    // 0.27 INSIDE the clear opening — the overlap L17C reported.
    expect(beforePostWest - doorway.aperture.half).toBeCloseTo(-0.27, 6);
    expect(beforePostWest - doorway.aperture.half).toBeLessThan(0);
    // The shipped mount passes the same predicate the pre-fix one fails.
    const after = barracksBands(BARRACKS.position[0], BARRACKS.position[2]);
    expect(Math.min(...after.postX) - doorway.aperture.half).toBeGreaterThan(0);
  });

  test('no collider was touched and the sign still flanks the plinth', () => {
    const r = rectOf('gladiator-barracks');
    const fp = landmarkSignWorldFootprint(BARRACKS);
    // Z gap to the building's own rectangle (the sign stands south of it),
    // unchanged by an X-only move.
    const gap = fp.minZ - r.maxZ;
    expect(gap).toBeCloseTo(0.351, 3);
    // Disjoint from the rectangle (it flanks the south frontage, not the corner).
    expect(fp.minZ).toBeGreaterThan(r.maxZ);
    // Still clear of every collider in the city.
    for (const collider of CITY_COLLIDERS) {
      if (collider.type === 'rect') {
        const other = rectOf(collider.id);
        const dx = Math.max(other.minX - fp.maxX, fp.minX - other.maxX, 0);
        const dz = Math.max(other.minZ - fp.maxZ, fp.minZ - other.maxZ, 0);
        expect({ collider: collider.id, clear: Math.hypot(dx, dz) >= 0 }).toEqual({ collider: collider.id, clear: true });
      }
    }
  });

  test('the Medical House porch has no measurable overlap, so its mount is unchanged', () => {
    const med = LANDMARK_SIGNS_BY_ID.arena_medical;
    // The porch group `[0, 0, 2.4]` holds columns at `[±1.2, 0.2, 0.1]`, radius 0.1.
    const porch = CITY_FILE('ArenaMedicalHouse.tsx').match(/<group position=\{\[0, 0, 2\.4\]\}>[\s\S]*?<\/group>/);
    if (!porch) throw new Error('ArenaMedicalHouse.tsx has no porch group');
    // The columns are drawn from a mapped pair — `[-1.2, 1.2].map((x, i) => <ClassicalColumn position={[x, 0.2, 0.1]} …`.
    const columnPair = porch[0].match(/\{\[(-?[\d.]+), ([\d.]+)\]\.map\(\(x, i\) => \(\s*<ClassicalColumn/);
    if (!columnPair) throw new Error('porch has no column pair');
    const columnX = Math.abs(Number(columnPair[2]));
    const columnPosition = porch[0].match(/position=\{\[x, ([\d.]+), ([-\d.]+)\]\}/);
    if (!columnPosition) throw new Error('porch column has no position');
    const columnZ = 2.4 + Number(columnPosition[2]);
    const columnRadius = num(porch[0], /radius=\{([\d.]+)\}/, 'porch column radius');
    expect(columnX).toBeCloseTo(1.2, 9);
    expect(columnZ).toBeCloseTo(2.5, 9);
    expect(columnRadius).toBeCloseTo(0.1, 9);

    const postXMin = med.position[0] + LANDMARK_SIGN_ASSET_BOUNDS.minLocalX;
    const postXMax = med.position[0] + LANDMARK_SIGN_ASSET_BOUNDS.maxLocalX;
    const postZMin = med.position[2] - LANDMARK_SIGN_ASSET_BOUNDS.halfDepth;
    const nearestX = Math.min(Math.max(columnX, postXMin), postXMax);
    const distance = Math.hypot(columnX - nearestX, columnZ - postZMin);

    // Measured, the post's plan rectangle is 0.601 from the column's axis and
    // 0.501 from its shaft: the columns are clear, so L17C's bounding-box
    // projection was not a physical overlap and nothing was moved for it.
    expect(distance).toBeCloseTo(0.601, 3);
    expect(distance - columnRadius).toBeGreaterThan(0.4);
    expect(med.position).toEqual([2.15, 0, 3.3]);
    // The step in front of the porch is clear too (0.30).
    const stepsZMax = 2.4 + 0.2 + 0.2;
    expect(postZMin - stepsZMax).toBeCloseTo(0.301, 3);
  });
});

// ── §C: the nine mounts ─────────────────────────────────────────────────────

/** The shipped mount table — pinned so a silent drift is a failure, not a surprise. */
const MOUNTS: Record<string, { root: [number, number]; yaw: number; position: [number, number, number]; rotationY: number }> = {
  city_tavern: { root: [-16, 14], yaw: 0, position: [5.15, 0, -2.8], rotationY: Math.PI / 2 },
  smithing_forge: { root: [18, 2.6], yaw: 0, position: [-5.45, 0, 3.2], rotationY: -Math.PI / 2 },
  general_store: { root: [22, -5], yaw: 0, position: [-4.8, 0, -2], rotationY: -Math.PI / 2 },
  training_hall: { root: [-30.35, 3.0], yaw: Math.PI / 2, position: [-2.4, 0, 4.75], rotationY: 0 },
  records_library: { root: [23.1, -30], yaw: 0, position: [-2.5, 0, 3.45], rotationY: 0 },
  arena_medical: { root: [-29, -5], yaw: 0, position: [2.15, 0, 3.3], rotationY: 0 },
  gladiator_barracks: { root: [-27, -14], yaw: 0, position: [2.35, 0, 3.6], rotationY: 0 },
  gladiator_academy: { root: [30.5, -27], yaw: 0, position: [-2.2, 0, 4.2], rotationY: 0 },
  veteran_hall: { root: [-24, -25], yaw: 0, position: [-2.9, 0, 3.4], rotationY: 0 },
};

describe('L17D §C — the nine asset mappings and mounting parameters', () => {
  test('nine ids, nine asset paths, nine files on disk', () => {
    expect(LANDMARK_SIGNS).toHaveLength(9);
    for (const sign of LANDMARK_SIGNS) {
      expect(sign.assetPath).toBe(`/signs/${sign.id}/${sign.id}.glb`);
      const path = new URL(`../../public/signs/${sign.id}/${sign.id}.glb`, import.meta.url);
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path).byteLength).toBeGreaterThan(50_000);
    }
    expect(new Set(LANDMARK_SIGNS.map((s) => s.assetPath)).size).toBe(9);
    expect(Object.keys(LANDMARK_SIGNS_BY_ID).sort()).toEqual(LANDMARK_SIGNS.map((s) => s.id).sort());
  });

  test('every mount is the shipped one', () => {
    for (const sign of LANDMARK_SIGNS) {
      const pinned = MOUNTS[sign.id];
      expect(pinned).toBeDefined();
      expect({ id: sign.id, root: sign.buildingRoot }).toEqual({ id: sign.id, root: pinned.root });
      expect({ id: sign.id, yaw: sign.buildingYaw }).toEqual({ id: sign.id, yaw: pinned.yaw });
      expect({ id: sign.id, position: sign.position }).toEqual({ id: sign.id, position: pinned.position });
      expect({ id: sign.id, rotationY: sign.rotationY }).toEqual({ id: sign.id, rotationY: pinned.rotationY });
      expect(sign.scale).toBe(1);
      // Mounting parameters are finite and stand on the ground plane.
      expect(sign.position.every(Number.isFinite)).toBe(true);
      expect(sign.position[1]).toBe(0);
    }
    // The nine mounts and the pinned table agree exactly, with nothing extra.
    expect(Object.keys(MOUNTS).sort()).toEqual(LANDMARK_SIGNS.map((s) => s.id).sort());
  });

  test('each plate still faces the approach it is mounted on', () => {
    const facingOf = (yaw: number) => {
      const quarters = [0, Math.PI / 2, -Math.PI / 2, Math.PI];
      const index = quarters.findIndex((q) => Math.abs(q - yaw) < 1e-9);
      expect(index).toBeGreaterThanOrEqual(0);
      return ['south', 'east', 'west', 'north'][index];
    };
    const buildings: Record<string, string> = {
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
    for (const sign of LANDMARK_SIGNS) {
      const { position, rotationY } = landmarkSignWorldMount(sign);
      expect({ id: sign.id, facing: facingOf(rotationY) }).toEqual({ id: sign.id, facing: sign.facing });
      const r = rectOf(buildings[sign.id]);
      const outward = { x: position[0] - r.cx, z: position[2] - r.cz };
      const normal = { x: Math.sin(rotationY), z: Math.cos(rotationY) };
      expect({ id: sign.id, away: outward.x * normal.x + outward.z * normal.z > 0 }).toEqual({ id: sign.id, away: true });
    }
  });
});

// ── §D: nothing else moved ──────────────────────────────────────────────────

describe('L17D §D — the registries and the presentation contract', () => {
  test('collider, hub and arrival counts are unchanged', () => {
    expect(CITY_COLLIDERS).toHaveLength(142);
    expect(CITY_COLLIDERS.filter((c) => c.type === 'rect')).toHaveLength(32);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-'))).toHaveLength(46);
    expect(new Set(CITY_COLLIDERS.map((c) => c.id)).size).toBe(CITY_COLLIDERS.length);
    // Signage is still decoration: no sign collider exists.
    expect(CITY_COLLIDERS.filter((c) => c.id.includes('sign'))).toHaveLength(0);
    expect(HUB_LOCATIONS).toHaveLength(21);
    expect(Object.keys(FAST_TRAVEL_ARRIVALS)).toHaveLength(21);
  });

  test('every sign still stands clear of every collider, hub and arrival', () => {
    for (const sign of LANDMARK_SIGNS) {
      const fp = landmarkSignWorldFootprint(sign);
      for (const collider of CITY_COLLIDERS) {
        if (collider.type === 'rect') {
          const r = rectOf(collider.id);
          const dx = Math.max(r.minX - fp.maxX, fp.minX - r.maxX, 0);
          const dz = Math.max(r.minZ - fp.maxZ, fp.minZ - r.maxZ, 0);
          expect({ sign: sign.id, collider: collider.id, clear: Math.hypot(dx, dz) >= 0 }).toEqual({
            sign: sign.id,
            collider: collider.id,
            clear: true,
          });
        } else if (collider.type === 'circle') {
          const nearestX = Math.min(Math.max(collider.cx, fp.minX), fp.maxX);
          const nearestZ = Math.min(Math.max(collider.cz, fp.minZ), fp.maxZ);
          expect(Math.hypot(collider.cx - nearestX, collider.cz - nearestZ)).toBeGreaterThanOrEqual(collider.r);
        }
      }
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

  test('the data module is still pure and the component gained only the boundary', () => {
    const dataCode = code(DATA_SOURCE);
    expect(dataCode.split('\n').filter((line) => line.trimStart().startsWith('import '))).toHaveLength(0);
    const specifiers = [...code(SIGN_SOURCE).matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]).sort();
    expect(specifiers).toEqual(
      ['../../../data/landmarkSigns', '../../ui/ThreeComponentErrorBoundary', '@react-three/drei', 'react', 'three'].sort(),
    );
    // Still no per-frame work, lights or preloading.
    expect(code(SIGN_SOURCE)).not.toContain('useFrame');
    expect(code(SIGN_SOURCE)).not.toContain('pointLight');
    expect(code(SIGN_SOURCE)).not.toContain('useGLTF.preload');
  });
});
