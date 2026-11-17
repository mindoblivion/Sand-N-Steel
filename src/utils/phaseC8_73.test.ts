/**
 * Phase C-8.73 — current arena-quarter doorway/collider standoffs.
 *
 * The C-8.47 table is a historical hub-interaction audit. This suite independently
 * derives the current Medical House and Veteran Hall doorway planes from their
 * rendered component transforms, then checks those planes against the live
 * movement-collision registry and PLAYER_RADIUS.
 *
 * This is a source-geometry regression, not proof of a continuous paved route
 * or rendered/device acceptance.
 *
 * Run with: bun test src/utils/phaseC8_73.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { CITY_COLLIDERS, PLAYER_RADIUS, collidesWith } from './collisionShapes';

type Vec3 = [number, number, number];

const load = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

function vector(source: string, pattern: RegExp, label: string): Vec3 {
  const match = pattern.exec(source);
  if (!match) throw new Error(`Could not derive ${label} from component source`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function rect(id: string) {
  const found = CITY_COLLIDERS.find((item) => item.id === id);
  if (!found || found.type !== 'rect') throw new Error(`Missing rectangular collider: ${id}`);
  return found;
}

interface DoorSite {
  id: string;
  colliderId: string;
  root: Vec3;
  porch: Vec3;
  doorway: Vec3;
}

const MEDICAL_SOURCE = load('../components/3d/city/ArenaMedicalHouse.tsx');
const VETERAN_SOURCE = load('../components/3d/city/VeteranGladiatorHall.tsx');

const SITES: DoorSite[] = [
  {
    id: 'Arena Medical House',
    colliderId: 'arena-medical',
    root: vector(MEDICAL_SOURCE, /<group position=\{\[(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\]\}>/, 'Medical House root'),
    porch: vector(MEDICAL_SOURCE.slice(MEDICAL_SOURCE.indexOf('/* 3. FRONT RECESSED')), /<group position=\{\[(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\]\}>/, 'Medical House porch'),
    doorway: vector(MEDICAL_SOURCE, /<ClassicalDoorway\s+position=\{\[(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\]\}/, 'Medical House doorway'),
  },
  {
    id: 'Veteran Gladiator Hall',
    colliderId: 'veteran-hall',
    root: vector(VETERAN_SOURCE, /<group position=\{\[(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\]\}>/, 'Veteran Hall root'),
    porch: [0, 0, 0],
    doorway: vector(VETERAN_SOURCE, /<ClassicalDoorway\s+position=\{\[(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\]\}/, 'Veteran Hall doorway'),
  },
];


interface Point2 {
  x: number;
  z: number;
}

function insideRotatedPaving(
  point: Point2,
  center: Point2,
  width: number,
  depth: number,
  yaw: number,
  margin: number,
): boolean {
  const dx = point.x - center.x;
  const dz = point.z - center.z;
  // CityStreets lays PlaneGeometry flat with Euler [-PI/2, 0, yaw].
  // Its in-plane width axis is (cos(yaw), -sin(yaw)); project onto that
  // axis and the perpendicular depth axis (sign is immaterial for bounds).
  const localX = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const localZ = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  return (
    Math.abs(localX) <= width / 2 - margin &&
    Math.abs(localZ) <= depth / 2 - margin
  );
}


function expectSweptClearOfRect(
  points: Point2[],
  center: Point2,
  halfWidth: number,
  halfDepth: number,
  label: string,
  playerRadius = PLAYER_RADIUS,
): void {
  for (let segment = 0; segment < points.length - 1; segment += 1) {
    const from = points[segment];
    const to = points[segment + 1];
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    const samples = Math.ceil(length / 0.05);
    for (let i = 0; i <= samples; i += 1) {
      const t = samples === 0 ? 0 : i / samples;
      const x = from.x + (to.x - from.x) * t;
      const z = from.z + (to.z - from.z) * t;
      const dx = Math.max(Math.abs(x - center.x) - halfWidth, 0);
      const dz = Math.max(Math.abs(z - center.z) - halfDepth, 0);
      expect(
        dx * dx + dz * dz >= playerRadius * playerRadius,
        `${label}: player circle intersects source-derived prop at [${x.toFixed(3)}, ${z.toFixed(3)}]`,
      ).toBe(true);
    }
  }
}


function expectSweptClearOfCircle(
  points: Point2[],
  center: Point2,
  obstacleRadius: number,
  label: string,
  playerRadius = PLAYER_RADIUS,
): void {
  for (let segment = 0; segment < points.length - 1; segment += 1) {
    const from = points[segment];
    const to = points[segment + 1];
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    const samples = Math.ceil(length / 0.05);
    for (let i = 0; i <= samples; i += 1) {
      const t = samples === 0 ? 0 : i / samples;
      const x = from.x + (to.x - from.x) * t;
      const z = from.z + (to.z - from.z) * t;
      expect(
        Math.hypot(x - center.x, z - center.z) >= playerRadius + obstacleRadius,
        `${label}: player circle intersects source-derived envelope at [${x.toFixed(3)}, ${z.toFixed(3)}]`,
      ).toBe(true);
    }
  }
}

function expectSweptClear(points: Point2[], label: string, playerRadius = PLAYER_RADIUS): void {
  for (let segment = 0; segment < points.length - 1; segment += 1) {
    const from = points[segment];
    const to = points[segment + 1];
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    const samples = Math.ceil(length / 0.05);
    for (let i = 0; i <= samples; i += 1) {
      const t = samples === 0 ? 0 : i / samples;
      const x = from.x + (to.x - from.x) * t;
      const z = from.z + (to.z - from.z) * t;
      expect(
        collidesWith(x, z, playerRadius, CITY_COLLIDERS),
        `${label}: swept player center collides at [${x.toFixed(3)}, ${z.toFixed(3)}]`,
      ).toBe(false);
    }
  }
}

describe('C-8.73 current arena-quarter doorway standoffs', () => {
  test.each(SITES)('$id entrance faces +Z and agrees with its current source transform', (site: DoorSite) => {
    const worldDoorZ = site.root[2] + site.porch[2] + site.doorway[2];
    expect(worldDoorZ).toBeGreaterThan(site.root[2]);
    if (site.id === 'Arena Medical House') {
      expect(site.porch[2]).toBe(2.4);
      expect(site.doorway[2]).toBe(-0.1);
      expect(worldDoorZ).toBeCloseTo(-2.7, 10);
    } else {
      expect(site.doorway[2]).toBe(2.5);
      expect(worldDoorZ).toBeCloseTo(-22.5, 10);
    }
  });

  test.each(SITES)('$id nominal doorway-plane standoff is blocked, legal collider standoff is clear', (site: DoorSite) => {
    const footprint = rect(site.colliderId);
    const worldDoorZ = site.root[2] + site.porch[2] + site.doorway[2];
    const nominalCenterZ = worldDoorZ + PLAYER_RADIUS;
    const legalCenterZ = footprint.cz + footprint.hd + PLAYER_RADIUS + 0.01;

    // The rendered doorway is recessed relative to the full lower-step collider.
    // Standing one player radius from the door plane is therefore still inside
    // the registered building footprint at both locations.
    expect(
      collidesWith(site.root[0], nominalCenterZ, PLAYER_RADIUS, CITY_COLLIDERS),
      `${site.id} nominal doorway standoff must not be mistaken for a legal center`,
    ).toBe(true);

    expect(
      collidesWith(site.root[0], legalCenterZ, PLAYER_RADIUS, CITY_COLLIDERS),
      `${site.id} legal +Z collider standoff`,
    ).toBe(false);
    expect(legalCenterZ).toBeGreaterThan(worldDoorZ);
  });
  test('candidate Medical House east-flank/frontage sweep clears the live collider registry', () => {
    // The Training Yard's west wall constrains this passage, so the Medical
    // bypass is a 1 m-wide corridor (0.5 m player-center radius), not 2 m.
    // The start retains 0.5 m of full-circle support on the existing paving.
    const start = { x: -25.5757359313, z: -5.9443650814 };
    expect(
      insideRotatedPaving(start, { x: -26, z: -7.5 }, 4, 6, Math.PI / 4, 0.5),
      'Medical House route must begin with a full 1 m corridor supported by existing paving',
    ).toBe(true);

    // Stay east of the foundation and Training Yard wall, then turn west along
    // the +Z frontage. All colliders and source-derived porch/prop envelopes
    // are swept at 5 cm intervals using the full 0.5 m corridor radius.
    const route = [start, { x: -25.7, z: -1.6 }, { x: -29, z: -1.6 }];
    expectSweptClear(route, 'Medical House 1 m candidate bypass', 0.5);

    // The step is rendered geometry, not a CITY_COLLIDERS entry. Derive its
    // local transform and box dimensions from the porch source and test it
    // independently so the route cannot skim within PLAYER_RADIUS of its edge.
    const porchSource = MEDICAL_SOURCE.slice(MEDICAL_SOURCE.indexOf('/* 3. FRONT RECESSED'));
    const stepPosition = vector(porchSource, /<mesh[^>]*position=\{\[(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\]\}>[\s\S]*?<boxGeometry args=\{\[([\d.]+),\s*[\d.]+,\s*([\d.]+)\]\}/, 'Medical House step');
    const stepGeometry = /<mesh[^>]*position=\{\[(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\]\}>[\s\S]*?<boxGeometry args=\{\[([\d.]+),\s*[\d.]+,\s*([\d.]+)\]\}/.exec(porchSource);
    if (!stepGeometry) throw new Error('Could not derive Medical House step dimensions');
    const stepCenter = {
      x: SITES[0].root[0] + stepPosition[0],
      z: SITES[0].root[2] + SITES[0].porch[2] + stepPosition[2],
    };
    expectSweptClearOfRect(route, stepCenter, Number(stepGeometry[4]) / 2, Number(stepGeometry[5]) / 2, 'Medical House porch step', 0.5);

    // ClassicalColumn's square plinth is 2.6 × its radius. Both rendered
    // columns sit on the same frontage; verify their ground-level envelopes.
    expect(MEDICAL_SOURCE).toContain('[-1.2, 1.2]');
    expect(MEDICAL_SOURCE).toContain('radius={0.1}');
    for (const localX of [-1.2, 1.2]) {
      expectSweptClearOfRect(
        route,
        { x: SITES[0].root[0] + localX, z: SITES[0].root[2] + SITES[0].porch[2] + 0.1 },
        0.13,
        0.13,
        'Medical House column plinth',
        0.5,
      );
    }

    // Conservative plan-view envelopes for the external medical table and
    // amphora. The table's circumscribed radius encloses its rotated 1.0 ×
    // 0.6 top and legs; the amphora uses its 0.25 m maximum body radius.
    expect(MEDICAL_SOURCE).toContain('position={[-1.2, 0.45, 1.4]}');
    expect(MEDICAL_SOURCE).toContain('<boxGeometry args={[1.0, 0.08, 0.6]} />');
    expectSweptClearOfCircle(
      route,
      { x: SITES[0].root[0] - 1.2, z: SITES[0].root[2] + 1.4 },
      Math.hypot(0.5, 0.3),
      'Medical House table',
      0.5,
    );
    expect(MEDICAL_SOURCE).toContain('position={[1.4, 0.35, 1.6]}');
    expect(MEDICAL_SOURCE).toContain('<cylinderGeometry args={[0.15, 0.25, 0.6, 8]} />');
    expectSweptClearOfCircle(
      route,
      { x: SITES[0].root[0] + 1.4, z: SITES[0].root[2] + 1.6 },
      0.25,
      'Medical House amphora',
      0.5,
    );
  });

  test('candidate Veteran Hall north/frontage sweep clears the live collider registry', () => {
    // A 2 m-wide north/frontage spur, joined to the existing paving.
    const start = { x: -22, z: -20.9 };
    expect(
      insideRotatedPaving(start, { x: -21.5, z: -17.5 }, 3, 15, 0, 1.0),
      'Veteran Hall route must begin with a full 2 m corridor supported by existing paving',
    ).toBe(true);

    const route = [start, { x: -24, z: -20.9 }];
    expectSweptClear(route, 'Veteran Hall 2 m candidate frontage', 1.0);

    // The two Doric column plinths are not registered movement colliders.
    // Source dimensions: radius .15 × 2.6 gives a .39 m square base.
    expect(VETERAN_SOURCE).toContain('[-1.8, 1.8]');
    expect(VETERAN_SOURCE).toContain('radius={0.15}');
    for (const localX of [-1.8, 1.8]) {
      expectSweptClearOfRect(
        route,
        { x: SITES[1].root[0] + localX, z: SITES[1].root[2] + 2.82 },
        0.195,
        0.195,
        'Veteran Hall column plinth',
        1.0,
      );
    }
  });

});
