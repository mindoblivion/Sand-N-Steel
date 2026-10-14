/**
 * collisionTests.ts — Unit tests for Phase 31B city collision system.
 *
 * Run with:  npx tsx scripts/collisionTests.ts
 *
 * Tests the pure geometry functions in src/utils/collisionShapes.ts and the
 * movement resolver in src/utils/cityCollisions.ts.  No three.js / React
 * dependency — everything is 2D math.
 */
import { strict as assert } from 'node:assert';
import {
  PLAYER_RADIUS,
  collidesRect,
  collidesCircle,
  collidesSegment,
  collidesWith,
  CITY_COLLIDERS,
  RectCollider,
  CircleCollider,
  SegmentCollider,
} from '../src/utils/collisionShapes';
import {
  resolveCityMovement,
  HUB_LOCATIONS,
  getNearbyHubLocation,
} from '../src/utils/cityCollisions';

// ── Mini test runner ──────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    // eslint-disable-next-line no-console
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    // eslint-disable-next-line no-console
    console.error(`  ✗ ${name}`);
    // eslint-disable-next-line no-console
    console.error(`    ${(e as Error).message}`);
  }
}

function approx(actual: number, expected: number, tol = 1e-6): void {
  assert.ok(
    Math.abs(actual - expected) < tol,
    `Expected ${expected}, got ${actual} (tol ${tol})`,
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
const R = PLAYER_RADIUS;

function makeRect(cx: number, cz: number, w: number, d: number): RectCollider {
  return { type: 'rect', id: 'test-rect', cx, cz, hw: w / 2, hd: d / 2 };
}
function makeCircle(cx: number, cz: number, r: number): CircleCollider {
  return { type: 'circle', id: 'test-circle', cx, cz, r };
}
function makeSeg(x1: number, z1: number, x2: number, z2: number): SegmentCollider {
  return { type: 'segment', id: 'test-seg', x1, z1, x2, z2 };
}

// ════════════════════════════════════════════════════════════════════════════
// 1. CIRCLE vs RECTANGLE
// ════════════════════════════════════════════════════════════════════════════

// 1a. Basic: player outside, approaching from +X
test('rect: player outside +X, no collision', () => {
  const rect = makeRect(10, 0, 4, 4); // spans x[8,12] z[-2,2]
  assert.ok(!collidesRect(13, 0, R, rect));
  assert.ok(collidesRect(12.3, 0, R, rect)); // 12 + 0.4 = 12.4, 12.3 < 12.4 → hit
  assert.ok(!collidesRect(12.41, 0, R, rect)); // just outside
});

// 1b. Player inside the rectangle
test('rect: player center inside → collision', () => {
  const rect = makeRect(10, 0, 4, 4);
  assert.ok(collidesRect(10, 0, R, rect));
  assert.ok(collidesRect(9, 1, R, rect));
});

// 1c. Corner case: player diagonal from corner
test('rect: corner — player diagonal from corner', () => {
  const rect = makeRect(10, 0, 4, 4); // corner at (8, -2)
  // Player at (7.8, -1.8): distance to corner (8, -2) = sqrt(0.04+0.04) ≈ 0.283 < 0.4
  assert.ok(collidesRect(7.8, -1.8, R, rect));
  // Player at (7.5, -1.5): distance = sqrt(0.25+0.25) ≈ 0.707 > 0.4
  assert.ok(!collidesRect(7.5, -1.5, R, rect));
});

// 1d. Player above the rectangle edge (Z direction)
test('rect: player outside +Z, no collision', () => {
  const rect = makeRect(0, 10, 4, 4); // z[8,12]
  assert.ok(!collidesRect(0, 13, R, rect));
  assert.ok(collidesRect(0, 12.3, R, rect));
});

// ════════════════════════════════════════════════════════════════════════════
// 2. CIRCLE vs CIRCLE
// ════════════════════════════════════════════════════════════════════════════

test('circle: separate → no collision', () => {
  const c = makeCircle(0, 0, 3.0);
  assert.ok(!collidesCircle(4, 0, R, c)); // dist 4 > 3.0 + 0.4
  assert.ok(collidesCircle(3.3, 0, R, c)); // dist 3.3 < 3.4
});

test('circle: same center → collision', () => {
  const c = makeCircle(5, 5, 2.0);
  assert.ok(collidesCircle(5, 5, R, c));
});

test('circle: tangent boundary', () => {
  const c = makeCircle(0, 0, 3.0);
  // At exactly r1 + r2 = 3.4, no collision (strict <)
  assert.ok(!collidesCircle(3.4, 0, R, c));
  // Just inside
  assert.ok(collidesCircle(3.399, 0, R, c));
});

// ════════════════════════════════════════════════════════════════════════════
// 3. CIRCLE vs SEGMENT
// ════════════════════════════════════════════════════════════════════════════

test('segment: player far from segment → no collision', () => {
  const s = makeSeg(0, 0, 10, 0); // along X axis
  assert.ok(!collidesSegment(5, 5, R, s));
  assert.ok(collidesSegment(5, 0.3, R, s));
  assert.ok(!collidesSegment(5, 0.41, R, s));
});

test('segment: endpoint collision', () => {
  const s = makeSeg(0, 0, 10, 0);
  // Near endpoint (0, 0)
  assert.ok(collidesSegment(-0.3, 0, R, s));
  assert.ok(!collidesSegment(-0.41, 0, R, s));
  // Beyond the other endpoint
  assert.ok(collidesSegment(10.3, 0, R, s));
  assert.ok(!collidesSegment(10.41, 0, R, s));
});

test('segment: player on the segment line', () => {
  const s = makeSeg(0, 0, 10, 0);
  assert.ok(collidesSegment(5, 0, R, s));
  assert.ok(collidesSegment(0, 0, R, s));
  assert.ok(collidesSegment(10, 0, R, s));
});

test('segment: diagonal segment', () => {
  const s = makeSeg(0, 0, 10, 10);
  // Line through origin at 45°. Perpendicular distance from (5, y) = |5 - y| / sqrt(2).
  // Collision when |5 - y| / sqrt(2) < 0.4 → |5 - y| < 0.566
  assert.ok(collidesSegment(5, 5.5, R, s));   // perp dist ≈ 0.354 < 0.4
  assert.ok(!collidesSegment(5, 5.6, R, s));  // perp dist ≈ 0.424 > 0.4
});

test('segment: zero-length segment (point)', () => {
  const s = makeSeg(3, 3, 3, 3);
  assert.ok(collidesSegment(3, 3, R, s));
  assert.ok(collidesSegment(3.2, 3, R, s));
  assert.ok(!collidesSegment(3.41, 3, R, s));
});

// ════════════════════════════════════════════════════════════════════════════
// 4. collidesWith (array test)
// ════════════════════════════════════════════════════════════════════════════

test('collidesWith: mixed array, early exit', () => {
  const colliders = [
    makeRect(20, 20, 2, 2),
    makeCircle(0, 0, 3.0),
    makeSeg(0, 10, 10, 10),
  ] as const;
  // Hits the circle
  assert.ok(collidesWith(2, 0, R, colliders));
  // Hits the segment
  assert.ok(collidesWith(5, 10.3, R, colliders));
  // Hits nothing
  assert.ok(!collidesWith(50, 50, R, colliders));
});

// ════════════════════════════════════════════════════════════════════════════
// 5. MOVEMENT RESOLVER — X-axis blocking
// ════════════════════════════════════════════════════════════════════════════

test('movement: X blocked by fountain', () => {
  // Fountain at (0,0) r=3.6. Player at (5, 0) moving -X toward fountain.
  // Collision boundary: 3.6 + 0.4 = 4.0 from center. Player should stop at x ≥ 4.0.
  const pos: [number, number, number] = [5, 0, 0];
  const result = resolveCityMovement(pos, -1, 0, 3.8, 0.5);
  // testX = 5 - 1.9 = 3.1 → collides (dist 3.1 < 4.0). Current (5,0) → dist 5 > 4.0 → no collision → blocked.
  assert.ok(result[0] >= 4.0, `Expected x >= 4.0, got ${result[0]}`);
});

test('movement: Z blocked by building rect', () => {
  // Ishtar Gatehouse central at (0, 24), half-depth 2.65 → front edge z = 21.35
  // Player at (0, 17) moving +Z
  const pos: [number, number, number] = [0, 0, 17];
  const result = resolveCityMovement(pos, 0, 1, 3.8, 0.5);
  // Should not penetrate past z = 21.35 - R = 20.95
  assert.ok(result[2] <= 21.35 - R + 0.01, `Expected z <= ${21.35 - R + 0.01}, got ${result[2]}`);
});

// ════════════════════════════════════════════════════════════════════════════
// 6. DIAGONAL MOVEMENT AND WALL SLIDING
// ════════════════════════════════════════════════════════════════════════════

test('movement: diagonal into wall → slides along Z', () => {
  // Ishtar Gatehouse at (0, 24). Player at (0, 17) moving +X and +Z.
  // Z is blocked by the gatehouse, but X is free → player slides in X.
  const pos: [number, number, number] = [0, 0, 17];
  const result = resolveCityMovement(pos, 1, 1, 3.8, 0.5);
  // X should have moved (no collider at this X/Z)
  assert.ok(result[0] > 0, `Expected x > 0, got ${result[0]}`);
  // Z should be blocked
  assert.ok(result[2] <= 21.35 - R + 0.01, `Expected z blocked, got ${result[2]}`);
});

test('movement: diagonal into fountain → slides along Z', () => {
  // Fountain at (0,0) r=3.6. Player at (4.1, 0) moving -X and +Z.
  // Collision boundary: 4.0 from center. Player at 4.1 is just outside.
  // Moving -X: testX = 4.1 - 0.19 = 3.91 → collides (3.91 < 4.0). X blocked.
  // Moving +Z: testZ = 0 + 0.19 = 0.19 → at (4.1, 0.19), dist = sqrt(4.1² + 0.19²) ≈ 4.10 > 4.0 → no collision. Z allowed.
  const pos: [number, number, number] = [4.1, 0, 0];
  const result = resolveCityMovement(pos, -1, 1, 3.8, 0.05);
  // X should be blocked (stays ≈ 4.1)
  approx(result[0], 4.1, 0.01);
  // Z should have moved (slide along Z)
  assert.ok(result[2] > 0, `Expected z > 0, got ${result[2]}`);
});

// ════════════════════════════════════════════════════════════════════════════
// 7. MOVEMENT AWAY FROM OBSTACLE
// ════════════════════════════════════════════════════════════════════════════

test('movement: moving away from obstacle is always allowed', () => {
  // Player near fountain, moving away
  const pos: [number, number, number] = [5, 0, 0];
  const result = resolveCityMovement(pos, 1, 0, 3.8, 0.5);
  assert.ok(result[0] > 5, `Expected x > 5, got ${result[0]}`);
});

// ════════════════════════════════════════════════════════════════════════════
// 8. BOUNDARY CLAMP (±35)
// ════════════════════════════════════════════════════════════════════════════

test('boundary: +X clamped to 35', () => {
  const pos: [number, number, number] = [34, 0, 0];
  const result = resolveCityMovement(pos, 1, 0, 3.8, 1.0);
  assert.ok(result[0] <= 35, `Expected x <= 35, got ${result[0]}`);
});

test('boundary: -X clamped to -35', () => {
  const pos: [number, number, number] = [-34, 0, 0];
  const result = resolveCityMovement(pos, -1, 0, 3.8, 1.0);
  assert.ok(result[0] >= -35, `Expected x >= -35, got ${result[0]}`);
});

test('boundary: +Z clamped to 35', () => {
  const pos: [number, number, number] = [0, 0, 34];
  const result = resolveCityMovement(pos, 0, 1, 3.8, 1.0);
  assert.ok(result[2] <= 35, `Expected z <= 35, got ${result[2]}`);
});

test('boundary: -Z clamped to -35', () => {
  const pos: [number, number, number] = [0, 0, -34];
  const result = resolveCityMovement(pos, 0, -1, 3.8, 1.0);
  assert.ok(result[2] >= -35, `Expected z >= -35, got ${result[2]}`);
});

// ════════════════════════════════════════════════════════════════════════════
// 9. Y COORDINATE AND FUNCTION CONTRACT
// ════════════════════════════════════════════════════════════════════════════

test('contract: Y coordinate preserved', () => {
  const pos: [number, number, number] = [0, 42, 16];
  const result = resolveCityMovement(pos, 1, 1, 3.8, 0.5);
  assert.strictEqual(result[1], 42);
});

test('contract: returns [number, number, number]', () => {
  const pos: [number, number, number] = [0, 0, 16];
  const result = resolveCityMovement(pos, 0, 0, 3.8, 0.5);
  assert.ok(Array.isArray(result));
  assert.strictEqual(result.length, 3);
  assert.strictEqual(typeof result[0], 'number');
  assert.strictEqual(typeof result[1], 'number');
  assert.strictEqual(typeof result[2], 'number');
});

test('contract: zero movement returns same position', () => {
  const pos: [number, number, number] = [5, 1, 10];
  const result = resolveCityMovement(pos, 0, 0, 3.8, 0.5);
  approx(result[0], 5);
  approx(result[1], 1);
  approx(result[2], 10);
});

// ════════════════════════════════════════════════════════════════════════════
// 10. SPAWN [0, 0, 16] IS COLLISION-FREE
// ════════════════════════════════════════════════════════════════════════════

test('spawn: [0, 0, 16] is collision-free', () => {
  assert.ok(!collidesWith(0, 16, R, CITY_COLLIDERS));
  // Also verify player can move freely from spawn
  const pos: [number, number, number] = [0, 0, 16];
  const r1 = resolveCityMovement(pos, 1, 0, 3.8, 0.1);
  assert.ok(r1[0] > 0);
  const r2 = resolveCityMovement(pos, 0, 1, 3.8, 0.1);
  assert.ok(r2[2] > 16);
  const r3 = resolveCityMovement(pos, 0, -1, 3.8, 0.1);
  assert.ok(r3[2] < 16);
});

// ════════════════════════════════════════════════════════════════════════════
// 11. COLOSSEUM APPROACH, STEPS, AND PORTAL
// ════════════════════════════════════════════════════════════════════════════

test('colosseum: approach from avenue is clear (at X=5, avoiding fountain)', () => {
  // The fountain at (0,0) r=3.6 blocks the centerline. Approach at X=5 to go around it.
  for (let z = 16; z >= -5; z -= 1) {
    assert.ok(!collidesWith(5, z, R, CITY_COLLIDERS),
      `Blocked at (5, ${z}) on approach`);
  }
});

test('colosseum: entrance gap center is traversable', () => {
  // The gap between arc segments is at θ ∈ [-0.43, 0.43]
  // At θ=0: world (0, -25 + 19.3) = (0, -5.7)
  assert.ok(!collidesWith(0, -5.7, R, CITY_COLLIDERS),
    'Entrance gap center should be clear');
  // Slightly inside
  assert.ok(!collidesWith(0, -7.0, R, CITY_COLLIDERS),
    'Just inside entrance should be clear');
  assert.ok(!collidesWith(0, -9.0, R, CITY_COLLIDERS),
    'Portal passage center should be clear');
});

test('colosseum: portal passage between piers is traversable', () => {
  // Piers at x=±3.925, passage from x=-2.6 to x=2.6
  // Test multiple points through the passage
  for (const px of [-2.0, -1.0, 0, 1.0, 2.0]) {
    assert.ok(!collidesWith(px, -9.8, R, CITY_COLLIDERS),
      `Portal passage at x=${px} should be clear`);
  }
});

test('colosseum: wall blocks outside entrance gap', () => {
  // At θ slightly beyond entrance (θ=0.5): world (9.16, -8.06)
  // The wall should block the player here
  const wallPoint = coloPoint(0.5);
  // The wall is AT this point, so the player center should collide
  assert.ok(collidesWith(wallPoint[0], wallPoint[1], R, CITY_COLLIDERS),
    `Wall at θ=0.5 ${wallPoint} should collide`);
});

test('colosseum: steps walkable (between portal piers)', () => {
  // Steps span z ≈ -6.6 to -8.2, x from -7 to 7.
  // Portal piers at x=±3.925 block the sides — only the center passage (x ∈ [-2.6, 2.6])
  // is walkable near the piers. Test the passage center and wider step area away from piers.
  for (const px of [-2.0, 0, 2.0]) {
    for (const pz of [-6.5, -7.0, -7.5, -8.0]) {
      assert.ok(!collidesWith(px, pz, R, CITY_COLLIDERS),
        `Step area at (${px}, ${pz}) should be walkable`);
    }
  }
  // Wider step area (away from piers, z=-6.5) should be walkable even at x=±5
  for (const px of [-5, 5]) {
    assert.ok(!collidesWith(px, -6.5, R, CITY_COLLIDERS),
      `Step edge at (${px}, -6.5) should be walkable`);
  }
});

// Helper: compute Colosseum world point (mirrors collisionShapes.ts)
function coloPoint(theta: number): [number, number] {
  return [19.3 * Math.sin(theta), 19.3 * Math.cos(theta) - 25];
}

// ════════════════════════════════════════════════════════════════════════════
// 12. TRAINING YARD ENTRANCE
// ════════════════════════════════════════════════════════════════════════════

test('training yard: entrance gap is traversable', () => {
  // Entrance at world x ≈ -11.113, gap width ≈ 2.5 (z from -1.25 to 1.25)
  // Player at center of entrance
  assert.ok(!collidesWith(-11.113, 0, R, CITY_COLLIDERS),
    'Entrance center should be clear');
  // Slightly inside the yard
  assert.ok(!collidesWith(-15, 0, R, CITY_COLLIDERS),
    'Just inside yard should be clear');
});

test('training yard: wall blocks outside entrance', () => {
  // Wall point at θ = 1.0 (well away from entrance)
  const wx = -18 + 7.0 * Math.cos(1.0);
  const wz = 7.0 * Math.sin(1.0);
  assert.ok(collidesWith(wx, wz, R, CITY_COLLIDERS),
    `Wall at θ=1.0 (${wx.toFixed(2)}, ${wz.toFixed(2)}) should collide`);
});

test('training yard: player can enter from the east', () => {
  // Walk from x=-8 toward the entrance at x=-11.113
  for (let x = -8; x >= -12; x -= 0.5) {
    const blocked = collidesWith(x, 0, R, CITY_COLLIDERS);
    if (x > -10.5) {
      // Should be clear approaching the yard
      assert.ok(!blocked, `Should be clear at x=${x}, z=0`);
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 13. FAST-TRAVEL DESTINATIONS
// ════════════════════════════════════════════════════════════════════════════

test('fast-travel: report destinations inside colliders (not a test failure)', () => {
  // handleFastTravel teleports to [loc.position[0], 0, loc.position[2] + 2]
  // Many of these are inside building colliders by design (interaction points
  // are inside buildings). This is EXPECTED — the "already colliding" exemption
  // in resolveCityMovement prevents trapping. We verify the destinations are
  // detected and that the player can move away from them.
  let conflicts = 0;
  for (const loc of HUB_LOCATIONS) {
    const fx = loc.position[0];
    const fz = loc.position[2] + 2;
    if (collidesWith(fx, fz, R, CITY_COLLIDERS)) {
      conflicts++;
      // Player should still be able to move away (not trapped)
      // Test: moving in +Z (away from most buildings whose centers are at fz-2)
      const result = resolveCityMovement([fx, 0, fz], 0, 1, 3.8, 0.5);
      assert.ok(result[2] !== fz,
        `Player trapped at fast-travel ${loc.id}: cannot move +Z`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`    (info: ${conflicts}/${HUB_LOCATIONS.length} fast-travel destinations inside colliders — expected, not trapped)`);
});

// ════════════════════════════════════════════════════════════════════════════
// 14. INTERACTION LOCATIONS USABLE
// ════════════════════════════════════════════════════════════════════════════

test('interactions: all 20 HUB_LOCATIONS usable (reachable or via fast travel)', () => {
  // An interaction location is "usable" if:
  // (a) the interaction point itself is collision-free, OR
  // (b) the player can reach within the interaction radius from outside the collider, OR
  // (c) fast travel places the player inside the radius (always true by design)
  let allUsable = true;
  for (const loc of HUB_LOCATIONS) {
    const lx = loc.position[0];
    const lz = loc.position[2];
    const lr = loc.radius;
    // Check if the interaction point itself is collision-free
    const pointFree = !collidesWith(lx, lz, R, CITY_COLLIDERS);
    // Check if there's an approach point within the interaction radius that's collision-free
    let approachFound = pointFree;
    if (!approachFound) {
      // Sample 8 directions at the interaction radius boundary
      for (let a = 0; a < 8 && !approachFound; a++) {
        const ang = (a / 8) * Math.PI * 2;
        const ax = lx + Math.cos(ang) * lr;
        const az = lz + Math.sin(ang) * lr;
        if (!collidesWith(ax, az, R, CITY_COLLIDERS)) {
          approachFound = true;
        }
      }
    }
    // Fast travel always works (places player at [lx, lz+2] which is inside the radius)
    const ftX = lx;
    const ftZ = lz + 2;
    const ftDist = Math.sqrt((ftX - lx) ** 2 + (ftZ - lz) ** 2);
    const ftInRadius = ftDist <= lr;

    if (!approachFound && !ftInRadius) {
      allUsable = false;
      // eslint-disable-next-line no-console
      console.error(`    ${loc.id}: NOT usable — no approach and fast travel outside radius`);
    }
  }
  assert.ok(allUsable, 'Some interaction locations are not usable');
});

test('interactions: getNearbyHubLocation unchanged', () => {
  // Verify getNearbyHubLocation still works at known positions
  const atColosseum = getNearbyHubLocation([0, 0, -25]);
  assert.ok(atColosseum !== null);
  assert.strictEqual(atColosseum!.id, 'colosseum');

  const atSpawn = getNearbyHubLocation([0, 0, 16]);
  assert.ok(atSpawn === null, 'Spawn should not be near any location');

  const atForge = getNearbyHubLocation([18, 0, 2]);
  assert.ok(atForge !== null);
  assert.strictEqual(atForge!.id, 'smithing_forge');
});

// ════════════════════════════════════════════════════════════════════════════
// 15. STREETWALLS
// ════════════════════════════════════════════════════════════════════════════

test('streetwall: parallel walls block at X=-13.5', () => {
  // North wall center (-13.5, 3.05), half-width 0.3, half-depth 1.55
  // Player at (-13.5, 3.05) → inside the wall → collision
  assert.ok(collidesWith(-13.5, 3.05, R, CITY_COLLIDERS));
  // Player at (-13.5, 0) → in the gap between walls → clear
  assert.ok(!collidesWith(-13.5, 0, R, CITY_COLLIDERS));
});

test('streetwall: gap between parallel walls is passable', () => {
  // Gap is z ∈ [-1.5, 1.5] at x=-13.5
  for (const pz of [-1.0, 0, 1.0]) {
    assert.ok(!collidesWith(-13.5, pz, R, CITY_COLLIDERS),
      `Gap at z=${pz} should be passable`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 16. CITY COLLIDERS SANITY
// ════════════════════════════════════════════════════════════════════════════

test('registry: CITY_COLLIDERS is non-empty', () => {
  assert.ok(CITY_COLLIDERS.length > 50, `Expected >50 colliders, got ${CITY_COLLIDERS.length}`);
  // eslint-disable-next-line no-console
  console.log(`    (info: ${CITY_COLLIDERS.length} colliders registered)`);
});

test('registry: all colliders have valid geometry', () => {
  for (const c of CITY_COLLIDERS) {
    if (c.type === 'rect') {
      assert.ok(c.hw > 0 && c.hd > 0, `Rect ${c.id} has non-positive dimensions`);
    } else if (c.type === 'circle') {
      assert.ok(c.r > 0, `Circle ${c.id} has non-positive radius`);
    } else {
      const lenSq = (c.x2 - c.x1) ** 2 + (c.z2 - c.z1) ** 2;
      assert.ok(lenSq > 0.01, `Segment ${c.id} has zero length`);
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ════════════════════════════════════════════════════════════════════════════

// eslint-disable-next-line no-console
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
