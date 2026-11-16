// @ts-ignore — bun:test is available at runtime via bun test
import { describe, expect, test } from 'bun:test';
import {
  COURTYARD_TO_MEDICAL_HOUSE_PATH,
  COURTYARD_TO_MEDICAL_HOUSE_BYPASS_LEG,
  MEDICAL_HOUSE_FRONTAGE_APPROACH,
  COURTYARD_TO_VETERAN_HALL_PATH,
  COURTYARD_TO_VETERAN_HALL_SPUR,
  type RotatedPavingPath,
} from './streetGeometry';
import { CITY_COLLIDERS, collidesWith } from './collisionShapes';

type Point = { x: number; z: number };

const MEDICAL_START = { x: -25.5757359313, z: -5.9443650814 };
const MEDICAL_TURN = { x: -25.7, z: -1.6 };
const MEDICAL_END = { x: -29, z: -1.6 };
const VETERAN_START = { x: -22, z: -20.9 };
const VETERAN_END = { x: -24, z: -20.9 };

function pointAtLocalZ(path: RotatedPavingPath, localZ: number): Point {
  return {
    x: path.cx + Math.sin(path.yaw) * localZ,
    z: path.cz + Math.cos(path.yaw) * localZ,
  };
}

function expectPoint(actual: Point, expected: Point, label: string): void {
  expect(Math.hypot(actual.x - expected.x, actual.z - expected.z), label).toBeLessThan(0.0001);
}

function insideRotatedPaving(
  point: Point,
  path: RotatedPavingPath,
  margin: number,
): boolean {
  const dx = point.x - path.cx;
  const dz = point.z - path.cz;
  // Match the rendered PlaneGeometry Euler [-PI/2, 0, yaw] used in CityStreets.
  const localX = dx * Math.cos(path.yaw) - dz * Math.sin(path.yaw);
  const localZ = dx * Math.sin(path.yaw) + dz * Math.cos(path.yaw);
  return (
    Math.abs(localX) <= path.w / 2 - margin &&
    Math.abs(localZ) <= path.d / 2 - margin
  );
}

function expectSweptClear(points: Point[], radius: number, label: string): void {
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
        collidesWith(x, z, radius, CITY_COLLIDERS),
        `${label}: swept center collides at [${x.toFixed(3)}, ${z.toFixed(3)}]`,
      ).toBe(false);
    }
  }
}

describe('C-8.74 arena-quarter doorway paving', () => {
  test('Medical House bypass meshes meet at the surveyed join and porch frontage', () => {
    expectPoint(
      pointAtLocalZ(COURTYARD_TO_MEDICAL_HOUSE_BYPASS_LEG, -COURTYARD_TO_MEDICAL_HOUSE_BYPASS_LEG.d / 2),
      MEDICAL_START,
      'Medical bypass begins inside the existing paving',
    );
    expectPoint(
      pointAtLocalZ(COURTYARD_TO_MEDICAL_HOUSE_BYPASS_LEG, COURTYARD_TO_MEDICAL_HOUSE_BYPASS_LEG.d / 2),
      MEDICAL_TURN,
      'Medical bypass reaches the frontage turn',
    );
    expectPoint(
      pointAtLocalZ(MEDICAL_HOUSE_FRONTAGE_APPROACH, -MEDICAL_HOUSE_FRONTAGE_APPROACH.d / 2),
      MEDICAL_TURN,
      'Medical frontage starts at the bypass turn',
    );
    expectPoint(
      pointAtLocalZ(MEDICAL_HOUSE_FRONTAGE_APPROACH, MEDICAL_HOUSE_FRONTAGE_APPROACH.d / 2),
      MEDICAL_END,
      'Medical frontage terminates at the legal porch standoff',
    );
    expect(COURTYARD_TO_MEDICAL_HOUSE_BYPASS_LEG.w).toBe(1);
    expect(MEDICAL_HOUSE_FRONTAGE_APPROACH.w).toBe(1);
    expect(
      insideRotatedPaving(MEDICAL_START, COURTYARD_TO_MEDICAL_HOUSE_PATH, 0.5),
      'the full 1 m bypass width overlaps existing Medical House paving',
    ).toBe(true);
  });

  test('Veteran Hall spur joins existing paving and terminates at the surveyed standoff', () => {
    expectPoint(
      pointAtLocalZ(COURTYARD_TO_VETERAN_HALL_SPUR, -COURTYARD_TO_VETERAN_HALL_SPUR.d / 2),
      VETERAN_START,
      'Veteran spur begins on the existing path',
    );
    expectPoint(
      pointAtLocalZ(COURTYARD_TO_VETERAN_HALL_SPUR, COURTYARD_TO_VETERAN_HALL_SPUR.d / 2),
      VETERAN_END,
      'Veteran spur terminates at the legal frontage standoff',
    );
    expect(COURTYARD_TO_VETERAN_HALL_SPUR.w).toBe(2);
    expect(
      insideRotatedPaving(VETERAN_START, COURTYARD_TO_VETERAN_HALL_PATH, 1),
      'the full 2 m spur width overlaps existing Veteran Hall paving',
    ).toBe(true);
  });

  test('both new paving centerlines clear the live city collider registry at full corridor radii', () => {
    expectSweptClear([MEDICAL_START, MEDICAL_TURN, MEDICAL_END], 0.5, 'Medical House 1 m paving');
    expectSweptClear([VETERAN_START, VETERAN_END], 1, 'Veteran Hall 2 m paving');
  });
});
