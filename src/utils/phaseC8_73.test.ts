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

describe('C-8.73 current arena-quarter doorway standoffs', () => {
  test.each(SITES)('$id entrance faces +Z and agrees with its current source transform', (site) => {
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

  test.each(SITES)('$id nominal doorway-plane standoff is blocked, legal collider standoff is clear', (site) => {
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
});
