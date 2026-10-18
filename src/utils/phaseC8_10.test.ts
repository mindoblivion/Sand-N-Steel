/**
 * Phase C-8.10 — Forge-to-Workshop Passage Navigability tests.
 *
 * Verifies that narrowing the SmithingForge collider width from 10.0 to 9.5
 * opens the intended passage between the Forge and the ArmorLeatherWorkshop,
 * without compromising any other collision boundary.
 *
 * Tests use the actual collision API (collidesWith, resolveCityMovement)
 * and the real CITY_COLLIDERS registry — no mocks.
 *
 * Run with: bun test src/utils/phaseC8_10.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import {
  PLAYER_RADIUS,
  CITY_COLLIDERS,
  collidesWith,
  type RectCollider,
} from './collisionShapes';
import { resolveCityMovement } from './cityCollisions';

// ── Helpers ────────────────────────────────────────────────────────────────

const R = PLAYER_RADIUS;

/** Find a rect collider by ID from the live CITY_COLLIDERS registry. */
function findRectCollider(id: string): RectCollider {
  const c = CITY_COLLIDERS.find((c) => c.id === id);
  if (!c || c.type !== 'rect') throw new Error(`Rect collider '${id}' not found`);
  return c;
}

const forge = findRectCollider('smithing-forge');
const workshop = findRectCollider('armor-workshop');

// ── Computed boundary edges (from the live collider objects) ────────────────
// collidesRect uses strict `<`, so at distance == r the circle does NOT
// collide — the boundary is exclusive.  The clear corridor for the player
// center is [edge + r, otherEdge - r].

const forgeEast  = forge.cx + forge.hw;   // 18 + 4.75 = 22.75
const forgeWest  = forge.cx - forge.hw;   // 18 - 4.75 = 13.25
// Phase C-8.19 moved the Forge root/collider Z centre 2 → 2.6 (same dimensions).
const forgeNorth = forge.cz + forge.hd;   // 2.6 + 4.0 = 6.6
const forgeSouth = forge.cz - forge.hd;   // 2.6 - 4.0 = -1.4

const workshopWest  = workshop.cx - workshop.hw;  // 28.2 - 4.45 = 23.75
const workshopEast  = workshop.cx + workshop.hw;  // 28.2 + 4.45 = 32.65
const workshopNorth = workshop.cz + workshop.hd;  // 1.15 + 2.85 = 4.0
const workshopSouth = workshop.cz - workshop.hd; // 1.15 - 2.85 = -1.7

// The gap between the two buildings (player-center navigable corridor)
const gapWest  = forgeEast + R;     // 22.75 + 0.4 = 23.15
const gapEast  = workshopWest - R;   // 23.75 - 0.4 = 23.35
const gapCenter = (gapWest + gapEast) / 2; // ≈ 23.25

// Movement step used by resolveCityMovement (matching production defaults)
const SPEED = 3.8;
const DT = 1 / 60;
const STEP = SPEED * DT; // ≈ 0.0633

// Starting Z positions for traversal tests.
// The GeneralStore (center [22,-5], hw 3.85, hd 3.15) extends to Z = -1.85,
// so Z = -1.0 is just north of it and clear of all three buildings at X = gapCenter.
const Z_SOUTH_START = -1.0;
const Z_NORTH_START = 8.0;   // north of both Forge (Z≤6) and Workshop (Z≤4)

// ── A. PLAYER_RADIUS unchanged ─────────────────────────────────────────────

describe('A. Player radius', () => {
  test('PLAYER_RADIUS is 0.4', () => {
    expect(R).toBe(0.4);
  });
});

// ── B. Forge boundary integrity ───────────────────────────────────────────

describe('B. Forge collision boundaries after width narrowing', () => {
  test('Forge center is (18, 2.6) — C-8.19 shifted Z 2 → 2.6, X unchanged', () => {
    expect(forge.cx).toBe(18);
    expect(forge.cz).toBe(2.6);
  });

  test('Forge half-width is 4.75 (width 9.5)', () => {
    expect(forge.hw).toBe(4.75);
  });

  test('Forge half-depth is unchanged at 4.0 (depth 8.0)', () => {
    expect(forge.hd).toBe(4.0);
  });

  test('Forge east edge is at X = 22.75', () => {
    expect(forgeEast).toBeCloseTo(22.75, 10);
  });

  test('Forge west edge is at X = 13.25 (unchanged center, reduced width)', () => {
    expect(forgeWest).toBeCloseTo(13.25, 10);
  });

  test('Forge north edge follows the C-8.19 shift to Z = 6.6', () => {
    expect(forgeNorth).toBeCloseTo(6.6, 10);
  });

  test('Forge south edge follows the C-8.19 shift to Z = -1.4', () => {
    expect(forgeSouth).toBeCloseTo(-1.4, 10);
  });
});

// ── C. Workshop boundary integrity ────────────────────────────────────────

describe('C. ArmorLeatherWorkshop collider unchanged', () => {
  test('Workshop center is unchanged at (28.2, 1.15)', () => {
    expect(workshop.cx).toBe(28.2);
    expect(workshop.cz).toBe(1.15);
  });

  test('Workshop width is unchanged at 8.9 (hw 4.45)', () => {
    expect(workshop.hw).toBe(4.45);
  });

  test('Workshop depth is unchanged at 5.7 (hd 2.85)', () => {
    expect(workshop.hd).toBe(2.85);
  });

  test('Workshop west edge is at X = 23.75 (unchanged)', () => {
    expect(workshopWest).toBeCloseTo(23.75, 10);
  });
});

// ── D. Passage gap geometry ───────────────────────────────────────────────

describe('D. Passage gap between Forge and Workshop', () => {
  test('Gap between building edges is 1.0 units', () => {
    expect(workshopWest - forgeEast).toBeCloseTo(1.0, 10);
  });

  test('Navigable corridor for player center is ≥ 0.2 units wide', () => {
    const corridor = gapEast - gapWest;
    expect(corridor).toBeGreaterThanOrEqual(0.2);
  });

  test('Corridor width exceeds movement step size (no stuck-at-wall)', () => {
    expect(gapEast - gapWest).toBeGreaterThan(STEP);
  });

  test('Gap center is collision-free at Z = 1 (within both buildings)', () => {
    expect(collidesWith(gapCenter, 1, R, CITY_COLLIDERS)).toBe(false);
  });

  test('Gap center is collision-free at Z = -1 (south approach)', () => {
    expect(collidesWith(gapCenter, Z_SOUTH_START, R, CITY_COLLIDERS)).toBe(false);
  });

  test('Gap center is collision-free at Z = 8 (north of both)', () => {
    expect(collidesWith(gapCenter, Z_NORTH_START, R, CITY_COLLIDERS)).toBe(false);
  });
});

// ── E. Northward traversal through the passage ─────────────────────────────

describe('E. Northward traversal (south → north through gap)', () => {
  test('Player walks from south of the passage to north through the gap', () => {
    // Start just south of the passage, north of the GeneralStore, at gap center X
    let pos: [number, number, number] = [gapCenter, 0, Z_SOUTH_START];

    // Walk north (+Z) through the gap
    for (let i = 0; i < 500; i++) {
      pos = resolveCityMovement(pos, 0, 1, SPEED, DT);
    }

    // Should be north of the Forge (north edge Z=6)
    expect(pos[2]).toBeGreaterThan(forgeNorth);
  });

  test('Player never entered the Forge or Workshop during northward traversal', () => {
    let pos: [number, number, number] = [gapCenter, 0, Z_SOUTH_START];
    let enteredForge = false;
    let enteredWorkshop = false;

    for (let i = 0; i < 500; i++) {
      pos = resolveCityMovement(pos, 0, 1, SPEED, DT);
      if (collidesWith(pos[0], pos[2], R, [forge])) enteredForge = true;
      if (collidesWith(pos[0], pos[2], R, [workshop])) enteredWorkshop = true;
    }

    expect(enteredForge).toBe(false);
    expect(enteredWorkshop).toBe(false);
  });
});

// ── F. Southward traversal (reverse direction) ────────────────────────────

describe('F. Southward traversal (north → south through gap)', () => {
  test('Player walks from north of the passage to south through the gap', () => {
    // Start north of both buildings, at the gap center X
    let pos: [number, number, number] = [gapCenter, 0, Z_NORTH_START];

    // Walk south (-Z) through the gap
    for (let i = 0; i < 500; i++) {
      pos = resolveCityMovement(pos, 0, -1, SPEED, DT);
    }

    // Should be past the passage area (south of the Workshop's south edge).
    // The GeneralStore (north edge Z=-1.85) limits further southward progress,
    // but the player should at least get to Z < -1.0 (past the passage).
    expect(pos[2]).toBeLessThan(Z_SOUTH_START);
  });

  test('Player never entered the Forge or Workshop during southward traversal', () => {
    let pos: [number, number, number] = [gapCenter, 0, Z_NORTH_START];
    let enteredForge = false;
    let enteredWorkshop = false;

    for (let i = 0; i < 500; i++) {
      pos = resolveCityMovement(pos, 0, -1, SPEED, DT);
      if (collidesWith(pos[0], pos[2], R, [forge])) enteredForge = true;
      if (collidesWith(pos[0], pos[2], R, [workshop])) enteredWorkshop = true;
    }

    expect(enteredForge).toBe(false);
    expect(enteredWorkshop).toBe(false);
  });
});

// ── G. West-to-east traversal via north side ───────────────────────────────

describe('G. West-to-east traversal (west of Forge → east of Workshop)', () => {
  test('Player rounds the Forge north side and reaches east of the Workshop', () => {
    // Start west of the Forge, at Z = 8 (north of all buildings)
    let pos: [number, number, number] = [10, 0, Z_NORTH_START];

    // Walk east along the north side (Z=8 is clear of all buildings)
    for (let i = 0; i < 600; i++) {
      pos = resolveCityMovement(pos, 1, 0, SPEED, DT);
    }
    // Should be east of the Workshop (east edge X=32.65)
    expect(pos[0]).toBeGreaterThan(workshopEast);

    // Walk south to descend to the passage Z level, still east of Workshop
    for (let i = 0; i < 200; i++) {
      pos = resolveCityMovement(pos, 0, -1, SPEED, DT);
    }
    // Should still be east of the Workshop and have moved south
    expect(pos[0]).toBeGreaterThan(workshopEast);
    expect(pos[2]).toBeLessThan(Z_NORTH_START);
  });

  test('Player never entered the Forge or Workshop during west-to-east traversal', () => {
    let pos: [number, number, number] = [10, 0, Z_NORTH_START];
    let enteredForge = false;
    let enteredWorkshop = false;

    for (let i = 0; i < 600; i++) {
      pos = resolveCityMovement(pos, 1, 0, SPEED, DT);
      if (collidesWith(pos[0], pos[2], R, [forge])) enteredForge = true;
      if (collidesWith(pos[0], pos[2], R, [workshop])) enteredWorkshop = true;
    }
    for (let i = 0; i < 200; i++) {
      pos = resolveCityMovement(pos, 0, -1, SPEED, DT);
      if (collidesWith(pos[0], pos[2], R, [forge])) enteredForge = true;
      if (collidesWith(pos[0], pos[2], R, [workshop])) enteredWorkshop = true;
    }

    expect(enteredForge).toBe(false);
    expect(enteredWorkshop).toBe(false);
  });
});

// ── H. East-to-west traversal (reverse) ───────────────────────────────────

describe('H. East-to-west traversal (east of Workshop → west of Forge)', () => {
  test('Player rounds the Workshop north side and reaches west of the Forge', () => {
    // Start east of the Workshop, at Z = 8 (north of all buildings)
    let pos: [number, number, number] = [35, 0, Z_NORTH_START];

    // Walk west along the north side
    for (let i = 0; i < 600; i++) {
      pos = resolveCityMovement(pos, -1, 0, SPEED, DT);
    }
    // Should be west of the Forge (west edge X=13.25)
    expect(pos[0]).toBeLessThan(forgeWest);

    // Walk south to descend to the passage Z level, still west of Forge
    for (let i = 0; i < 200; i++) {
      pos = resolveCityMovement(pos, 0, -1, SPEED, DT);
    }
    expect(pos[0]).toBeLessThan(forgeWest);
    expect(pos[2]).toBeLessThan(Z_NORTH_START);
  });

  test('Player never entered the Forge or Workshop during east-to-west traversal', () => {
    let pos: [number, number, number] = [35, 0, Z_NORTH_START];
    let enteredForge = false;
    let enteredWorkshop = false;

    for (let i = 0; i < 600; i++) {
      pos = resolveCityMovement(pos, -1, 0, SPEED, DT);
      if (collidesWith(pos[0], pos[2], R, [forge])) enteredForge = true;
      if (collidesWith(pos[0], pos[2], R, [workshop])) enteredWorkshop = true;
    }
    for (let i = 0; i < 200; i++) {
      pos = resolveCityMovement(pos, 0, -1, SPEED, DT);
      if (collidesWith(pos[0], pos[2], R, [forge])) enteredForge = true;
      if (collidesWith(pos[0], pos[2], R, [workshop])) enteredWorkshop = true;
    }

    expect(enteredForge).toBe(false);
    expect(enteredWorkshop).toBe(false);
  });
});

// ── I. No collision bypass around the Forge ────────────────────────────────

describe('I. No collision bypass around the Forge', () => {
  test('Forge west wall blocks player at Z = 1 (inside building Z range)', () => {
    // Player approaching from the west at Z=1 should be blocked by the Forge
    let pos: [number, number, number] = [10, 0, 1];
    for (let i = 0; i < 200; i++) {
      pos = resolveCityMovement(pos, 1, 0, SPEED, DT);
    }
    // Should not have entered the Forge (stayed west of west wall + radius)
    expect(pos[0]).toBeLessThanOrEqual(forgeWest + R + 0.01);
    expect(collidesWith(pos[0], pos[2], R, [forge])).toBe(false);
  });

  test('Forge north wall blocks player at X = 18 (building center X)', () => {
    // Player approaching from the north at X=18 should be blocked
    let pos: [number, number, number] = [18, 0, 15];
    for (let i = 0; i < 200; i++) {
      pos = resolveCityMovement(pos, 0, -1, SPEED, DT);
    }
    // Should not have entered the Forge
    expect(pos[2]).toBeGreaterThanOrEqual(forgeNorth + R - 0.01);
    expect(collidesWith(pos[0], pos[2], R, [forge])).toBe(false);
  });

  test('Forge south wall blocks player at X = 18 (building center X)', () => {
    // Player approaching from the south at X=18 should be blocked
    let pos: [number, number, number] = [18, 0, -10];
    for (let i = 0; i < 200; i++) {
      pos = resolveCityMovement(pos, 0, 1, SPEED, DT);
    }
    // Should not have entered the Forge
    expect(pos[2]).toBeLessThanOrEqual(forgeSouth - R + 0.01);
    expect(collidesWith(pos[0], pos[2], R, [forge])).toBe(false);
  });

  test('Forge east wall still blocks at Z = 5 (within building, north of gap)', () => {
    // At Z=5 (within Forge Z range but north of Workshop), player
    // approaching from east should still be blocked by the Forge
    let pos: [number, number, number] = [30, 0, 5];
    for (let i = 0; i < 200; i++) {
      pos = resolveCityMovement(pos, -1, 0, SPEED, DT);
    }
    // Should not have penetrated past the Forge east edge
    expect(pos[0]).toBeGreaterThanOrEqual(forgeEast - R - 0.01);
    expect(collidesWith(pos[0], pos[2], R, [forge])).toBe(false);
  });
});
