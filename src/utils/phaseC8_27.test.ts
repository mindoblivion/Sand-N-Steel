/**
 * Phase C-8.27 — the Colosseum portal bypass, and the C-8.22 test-model audit.
 *
 * ── THE DEFECT (frozen and reproduced below) ────────────────────────────────
 * The tier-1 facade wall collider is a polyline on the rendered facade radius
 * (R_FACADE = 19.3 about the Colosseum root [0, 0, −25]) that stops at the
 * entrance-gap edge θ = ±0.43, i.e. at world (±8.0456, −7.4570).  The portal
 * piers stop at their outer faces, X = ±5.25, front plane Z = −8.1.  Nothing
 * bridged that 2.796-unit strip of the opening's flank, so the player could
 * walk north from Z ≈ −7 into the arena anywhere in X ≈ 5.8 … 7.6 — and the
 * mirror on the west side — without ever passing through the portal doorway.
 *
 * With the runtime resolver, a straight push from (6.6, −7) reached
 * Z = −29.8 (on the arena sand), and a push out of the arena at (6.6, −16)
 * reached the city at Z = +6.8.  Section A replays exactly that against the
 * pre-fix registry (the two closures spliced out of CITY_COLLIDERS, the real
 * resolver run over it, then the registry restored), so the defect stays
 * documented and the fix stays provably effective.
 *
 * ── THE FIX (collisionShapes.ts — collision only, nothing rendered moved) ───
 * Two rects close that strip at ground level: `colo-flank-l` / `colo-flank-r`,
 * spanning the portal's own front plane (the piers' +Z face, Z = −8.1) through
 * to the facade opening's edge line (Z = −7.4570) — the facade wall's radial
 * band (radius 17.70 … 19.30) across the opening's flank.  That strip is
 * already occupied on the ground by the ceremonial steps (steps 2 and 1,
 * X ±6 / ±7) and the flanking spectator bench (X 5.8 … 7.8, Z −7.925 …
 * −7.275), so the closures sit on rendered stonework instead of adding an
 * invisible volume in open ground: 2.55 of the 2.796-unit closure is under the
 * steps or the bench, and the last 0.246 is the piece that must reach the
 * arc's end point (sub-player-width, and bounded by the arc collider itself).
 * The doorway corridor (player centres |X| ≤ 2.2) and every approach path are
 * untouched, and no other collider was moved, resized or renamed.
 *
 * ── WHAT THIS SUITE ASSERTS ────────────────────────────────────────────────
 *   A. the defect reproduces against the pre-fix registry;
 *   B. the shipped registry blocks it — both travel directions, and with no
 *      unsealed column through the portal wall outside the doorway;
 *   C. the intended entrance stays traversable, both directions;
 *   D. the approach in front of both piers still behaves as before;
 *   E. no trap and no snag — wall sliding along the flank/arc seam, the small
 *      inside pocket by the pier, and walking back out from deep inside;
 *   F. the Colosseum collider identities and the unrelated city colliders are
 *      exactly as they were.
 *
 * The companion correction to the C-8.22 geometry suite — its `asBox`
 * world-AABB stand-in for yawed benches replaced by `segObbClearance`, which
 * measures the cylinder in the box's own frame — lives in
 * src/utils/phaseC8_22.test.ts next to the assertions it serves.
 *
 * Run with: bun test src/utils/phaseC8_27.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  PLAYER_RADIUS,
  CITY_COLLIDERS,
  collidesWith,
  type Collider,
  type RectCollider,
  type SegmentCollider,
} from './collisionShapes';
import {
  FAST_TRAVEL_ARRIVALS,
  HUB_LOCATIONS,
  getNearbyHubLocation,
  clearRecoveryHistory,
  resolveCityMovement,
} from './cityCollisions';

// ── Sources ───────────────────────────────────────────────────────────────

const load = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const coloSrc = load('../components/3d/city/GrandColosseum.tsx');

// ── Tiny parsers (same style as the C-8.18 / C-8.19 / C-8.21 / C-8.22 suites) ─

function num(src: string, re: RegExp): number {
  const m = re.exec(src);
  if (!m) throw new Error(`number not found: ${re}`);
  return Number(m[1]);
}
function all(src: string, re: RegExp): RegExpExecArray[] {
  return [...src.matchAll(re)];
}
function findRect(id: string): RectCollider {
  const c = CITY_COLLIDERS.find((c) => c.id === id);
  if (!c || c.type !== 'rect') throw new Error(`Rect collider '${id}' not found`);
  return c;
}
function findSeg(id: string): SegmentCollider {
  const c = CITY_COLLIDERS.find((c) => c.id === id);
  if (!c || c.type !== 'segment') throw new Error(`Segment collider '${id}' not found`);
  return c;
}

// ── The Colosseum's own geometry, read back from its source ───────────────

const COLO_ROOT_Z = num(coloSrc, /<group position=\{\[0, 0, (-?[\d.]+)\]\}>\s*\{\/\* =+/);
const PORTAL_LOCAL_Z = num(coloSrc, /MONUMENTAL ARENA PORTAL ENTRANCE[\s\S]*?<group position=\{\[\s*0,\s*0,\s*([\d.]+)\s*\]\}>/);
const R_FACADE = num(coloSrc, /const R_FACADE = ([\d.]+);/);
const ENTRANCE_MIN = num(coloSrc, /const ENTRANCE_MIN = (-?[\d.]+);/);
const ENTRANCE_MAX = num(coloSrc, /const ENTRANCE_MAX = ([\d.]+);/);

/** Tier-1 portal-stone boxes: the two side piers and the lintel over the gap. */
const PORTAL_STONE = all(
  coloSrc,
  /<mesh material=\{portalStoneMat\} castShadow receiveShadow position=\{\[\s*(-?[\d.]+),\s*([\d.]+),\s*0\s*\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/g,
).map((m) => ({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]), d: Number(m[5]) }));
const PIERS = PORTAL_STONE.filter((b) => Math.abs(b.x) > 1); // the lintel sits at X = 0
const LINTEL = PORTAL_STONE.find((b) => b.x === 0)!;

/** The two flanking spectator benches, and the widest ceremonial tread. */
const PORTAL_BENCHES = all(
  coloSrc,
  /<RomanBench position=\{\[\s*(-?[\d.]+),\s*0,\s*(-?[\d.]+)\s*\]\} rotationY=\{0\} \/>/g,
).map((m) => ({ x: Number(m[1]), z: COLO_ROOT_Z + PORTAL_LOCAL_Z + Number(m[2]) }));
const STEP_TREAD_W = num(coloSrc, /Ceremonial Entrance Steps[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),/);

/** The facade arc, in the collider's own convention (X = R·sin θ, Z = R·cos θ + root). */
const arcPoint = (theta: number): [number, number] => [
  R_FACADE * Math.sin(theta),
  R_FACADE * Math.cos(theta) + COLO_ROOT_Z,
];
const ARC_GAP_EDGE = arcPoint(ENTRANCE_MAX); // 8.0456, −7.4570 — where the wall stops

const PIER_X = Math.abs(PIERS[0].x);
const PIER_HW = PIERS[0].w / 2;
const PIER_HD = PIERS[0].d / 2;
const PIER_WORLD_Z = COLO_ROOT_Z + PORTAL_LOCAL_Z; // −9.8
const PIER_FRONT_Z = PIER_WORLD_Z + PIER_HD; // −8.1 — the piers' +Z face
const PIER_OUTER_X = PIER_X + PIER_HW; // 5.25

/** The closure the fix must have built: pier outer face → facade gap edge. */
const FLANK = {
  cx: (PIER_OUTER_X + ARC_GAP_EDGE[0]) / 2,
  cz: (PIER_FRONT_Z + ARC_GAP_EDGE[1]) / 2,
  hw: (ARC_GAP_EDGE[0] - PIER_OUTER_X) / 2,
  hd: (ARC_GAP_EDGE[1] - PIER_FRONT_Z) / 2,
};

// ── The runtime resolver, wrapped ─────────────────────────────────────────

interface PushResult {
  end: [number, number];
  /** Every resolved position along the way — what "it never got in" is proven on. */
  trail: Array<[number, number]>;
}

/**
 * Straight push through the REAL resolver (`resolveCityMovement`), with the
 * recovery history cleared first so one push cannot steer the next.
 */
function push(startX: number, startZ: number, dx: number, dz: number, steps = 60): PushResult {
  clearRecoveryHistory();
  let pos: [number, number, number] = [startX, 0, startZ];
  const trail: Array<[number, number]> = [[startX, startZ]];
  for (let i = 0; i < steps; i++) {
    pos = resolveCityMovement(pos, dx, dz, 3.8, 0.1);
    trail.push([pos[0], pos[2]]);
  }
  return { end: [pos[0], pos[2]], trail };
}

/** Multi-leg walk: `[dx, dz, steps]` per leg, all through the same resolver. */
function walk(startX: number, startZ: number, legs: Array<[number, number, number]>): PushResult {
  clearRecoveryHistory();
  let pos: [number, number, number] = [startX, 0, startZ];
  const trail: Array<[number, number]> = [[startX, startZ]];
  for (const [dx, dz, n] of legs) {
    for (let i = 0; i < n; i++) {
      pos = resolveCityMovement(pos, dx, dz, 3.8, 0.1);
      trail.push([pos[0], pos[2]]);
    }
  }
  return { end: [pos[0], pos[2]], trail };
}

// ── Position predicates ───────────────────────────────────────────────────
// Radius from the Colosseum root: 19.3 is the facade, 18.0 its inner face,
// 15.3 the arena podium.  The arena floor itself is the r = 15 disc.

const coloRadius = (x: number, z: number) => Math.hypot(x, z - COLO_ROOT_Z);
/** On the arena sand / podium — i.e. genuinely inside the building. */
const onArenaSand = (x: number, z: number) => coloRadius(x, z) < 15.0 - PLAYER_RADIUS;
/** Clear of the facade's outer face — i.e. genuinely back out in the city. */
const outsideColosseum = (x: number, z: number) => coloRadius(x, z) > R_FACADE + PLAYER_RADIUS;

const enteredArena = (r: PushResult) => r.trail.some(([x, z]) => onArenaSand(x, z));
const leftColosseum = (r: PushResult) => r.trail.some(([x, z]) => outsideColosseum(x, z));

// ── The pre-fix registry ──────────────────────────────────────────────────

/**
 * Run `fn` with the two C-8.27 flank closures removed from `CITY_COLLIDERS` —
 * exactly the registry the defect was reported against — then restore the
 * array in place.  The resolver reads that array on every call, so this
 * exercises the real resolver on the real pre-fix configuration rather than a
 * replica of either.
 */
function withPreFixRegistry<T>(fn: () => T): T {
  const snapshot = CITY_COLLIDERS.slice();
  try {
    // The registry this defect was reported against: it predates the two C-8.27
    // closures, the C-8.28 arena podium, and the C-8.31 rear drum (the rear
    // wall and podium quadrants that closed the rear opening around the new
    // axial gate), so all four are spliced out and the replay below is the
    // historical one, unchanged.
    for (let i = CITY_COLLIDERS.length - 1; i >= 0; i--) {
      const id = CITY_COLLIDERS[i].id;
      if (id.startsWith('colo-flank') || id.startsWith('colo-podium')
        || id.startsWith('colo-rearwall') || id.startsWith('colo-rearpodium')) {
        CITY_COLLIDERS.splice(i, 1);
      }
    }
    return fn();
  } finally {
    CITY_COLLIDERS.length = 0;
    CITY_COLLIDERS.push(...snapshot);
  }
}

/** Is there any blocker in the column X = x between Z = −6.5 and Z = −9.5? */
function columnIsSealed(x: number): boolean {
  for (let z = -6.5; z >= -9.5; z -= 0.025) {
    if (collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS)) return true;
  }
  return false;
}

/** X values whose column through the portal wall is wide open — a hole. */
function unsealedColumns(xs: number[]): number[] {
  return xs.filter((x) => !columnIsSealed(x));
}

// The portal-wall band: everything outside the doorway corridor.  Inside it,
// |X| ≤ 2.0, the two piers leave a 4.0-wide corridor of player centres.
const WALL_BAND_X: number[] = [];
for (let x = 2.25; x <= 9.001; x += 0.05) WALL_BAND_X.push(Number(x.toFixed(3)));
const DOORWAY_CENTRES: number[] = [-2.0, -1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5, 2.0];

// ══════════════════════════════════════════════════════════════════════════
// A. The defect, frozen — reproduced against the pre-fix registry
// ══════════════════════════════════════════════════════════════════════════

describe('A. The reported bypass reproduces without the flank closures', () => {
  test('the pre-fix registry is the shipped one minus the later Colosseum colliders', () => {
    const preFix = withPreFixRegistry(() => CITY_COLLIDERS.slice());
    // 2 closures + 16 front podium segments + 4 rear wall + 4 rear podium.
    expect(preFix.length).toBe(CITY_COLLIDERS.length - 26);
    expect(preFix.filter((c) => c.id.startsWith('colo-flank'))).toEqual([]);
    expect(preFix.filter((c) => c.id.startsWith('colo-podium'))).toEqual([]);
    expect(preFix.filter((c) => c.id.startsWith('colo-rear'))).toEqual([]);
    // …and the registry the tests below run against is intact again.
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-flank')).length).toBe(2);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-podium')).length).toBe(16);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-rear')).length).toBe(8);
    expect(CITY_COLLIDERS.length).toBe(preFix.length + 26);
  });

  test('a north-bound push at X = 5.8 … 7.6 walked from the city onto the arena sand', () => {
    withPreFixRegistry(() => {
      for (const x of [5.8, 6.25, 6.7, 7.15, 7.6]) {
        const r = push(x, -7, 0, -1);
        expect(enteredArena(r), `pre-fix bypass at X = ${x} did not reproduce`).toBe(true);
        expect(r.end[1], `pre-fix walk at X = ${x}`).toBeCloseTo(-29.8, 1);
      }
    });
  });

  test('the pre-fix flank was wide open: every column X = 5.70 … 7.60 had no blocker', () => {
    const holes = withPreFixRegistry(() => unsealedColumns(WALL_BAND_X));
    expect(holes.length).toBe(40);
    expect(holes[0]).toBe(5.65);
    expect(holes[holes.length - 1]).toBe(7.6);
  });

  test('a south-bound push out of the arena at the same X reached the city', () => {
    withPreFixRegistry(() => {
      for (const x of [5.8, 6.6, 7.6, -6.6]) {
        const r = push(x, -16, 0, 1);
        expect(leftColosseum(r), `pre-fix exit at X = ${x} did not reproduce`).toBe(true);
        expect(r.end[1], `pre-fix walk at X = ${x}`).toBeCloseTo(6.8, 1);
      }
    });
  });

  test('the pre-fix registry is restored even when an assertion throws', () => {
    const before = CITY_COLLIDERS.length;
    expect(() =>
      withPreFixRegistry(() => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(CITY_COLLIDERS.length).toBe(before);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-flank')).length).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The fix blocks it — both directions, with the real resolver
// ══════════════════════════════════════════════════════════════════════════

describe('B. The shipped registry closes the flank', () => {
  test('north-bound pushes across the whole portal edge never reach the arena', () => {
    // The full opening, every 0.25: the doorway (|X| ≤ 2.0) is asserted
    // separately in C — here the flank, the piers and the arc must all hold.
    const blocked: string[] = [];
    for (let x = -9.0; x <= 9.001; x += 0.25) {
      if (Math.abs(x) <= 2.0) continue; // the intended entrance
      const px = Number(x.toFixed(3));
      const r = push(px, -7, 0, -1);
      if (enteredArena(r)) blocked.push(`X=${px} -> ${r.end[1].toFixed(2)}`);
      if (Math.abs(px) >= 3.0) {
        // The flank band (piers, closures, arc) stops the push on the closure
        // line and never lets it through.
        expect(r.end[1], `X = ${px} ended north of the closure line`).toBeGreaterThan(-7.6);
        expect(r.trail.every(([, z]) => z > -7.6), `X = ${px} crossed the closure line`).toBe(true);
      } else {
        // Immediately beside the doorway the piers' rounded corner lets the
        // player step onto the doorway mouth — but never past the piers' own
        // front plane (Z = −8.1).
        expect(r.end[1], `X = ${px} ended past the piers`).toBeGreaterThan(-8.0);
      }
    }
    expect(blocked).toEqual([]);
  });

  test('south-bound pushes out of the arena never reach the city', () => {
    const escaped: string[] = [];
    for (let x = -9.0; x <= 9.001; x += 0.5) {
      if (Math.abs(x) <= 2.0) continue; // the intended entrance
      const r = push(Number(x.toFixed(3)), -16, 0, 1);
      if (leftColosseum(r)) escaped.push(`X=${x.toFixed(2)} -> ${r.end[1].toFixed(2)}`);
    }
    expect(escaped).toEqual([]);
  });

  test('no column through the portal wall is open outside the doorway', () => {
    for (const x of WALL_BAND_X) {
      expect(columnIsSealed(x), `unsealed column at X = ${x}`).toBe(true);
    }
    // …and the mirror side, which shares the closures' symmetry.
    for (const x of WALL_BAND_X) {
      expect(columnIsSealed(-x), `unsealed column at X = ${-x}`).toBe(true);
    }
    // The doorway corridor itself stays open at every centre width tested.
    for (const x of DOORWAY_CENTRES) {
      expect(columnIsSealed(x), `doorway column at X = ${x} is blocked`).toBe(false);
    }
  });

  test('the closures are the rects the rendered portal implies', () => {
    // Geometry straight from GrandColosseum.tsx: pier outer face → arc gap edge.
    for (const id of ['colo-flank-r', 'colo-flank-l'] as const) {
      const r = findRect(id);
      const sign = id.endsWith('r') ? 1 : -1;
      expect(r.cx).toBeCloseTo(sign * FLANK.cx, 10);
      expect(r.cz).toBeCloseTo(FLANK.cz, 10);
      expect(r.hw).toBeCloseTo(FLANK.hw, 10);
      expect(r.hd).toBeCloseTo(FLANK.hd, 10);
    }
    // Source sanity: the values those closures were derived from.
    expect(COLO_ROOT_Z).toBe(-25);
    expect(PORTAL_LOCAL_Z).toBe(15.2);
    expect(R_FACADE).toBe(19.3);
    expect(ENTRANCE_MIN).toBe(-0.43);
    expect(ENTRANCE_MAX).toBe(0.43);
    expect(PIERS.length).toBe(2);
    expect([PIERS[0].x, PIERS[0].w, PIERS[0].d]).toEqual([-3.925, 2.65, 3.4]);
    expect(PIER_WORLD_Z).toBeCloseTo(-9.8, 10);
    expect(PIER_OUTER_X).toBeCloseTo(5.25, 10);
    expect(ARC_GAP_EDGE[0]).toBeCloseTo(8.04561, 4);
    expect(ARC_GAP_EDGE[1]).toBeCloseTo(-7.45697, 4);
  });

  test('the closure seam touches the pier, the arc end and the flanking stonework', () => {
    const flankR = findRect('colo-flank-r');
    const arc0 = findSeg('colo-wall-r-0');

    // Convention: Z grows toward the city, so the closure's +Z face is its
    // south (city-side) face and its −Z face is its north face.
    // (1) inner face = the pier's outer face; north face = the pier's front plane
    expect(flankR.cx - flankR.hw).toBeCloseTo(PIER_OUTER_X, 10);
    expect(flankR.cz - flankR.hd).toBeCloseTo(PIER_FRONT_Z, 10);
    expect(PIER_FRONT_Z).toBeCloseTo(-8.1, 10); // the piers' +Z face, −PZ from the root
    // (2) south face = the arc's entrance end, and the arc segment starts on it
    expect(flankR.cx + flankR.hw).toBeCloseTo(ARC_GAP_EDGE[0], 10);
    expect(flankR.cz + flankR.hd).toBeCloseTo(ARC_GAP_EDGE[1], 10);
    expect(arc0.x1).toBeCloseTo(ARC_GAP_EDGE[0], 10);
    expect(arc0.z1).toBeCloseTo(ARC_GAP_EDGE[1], 10);
    // (3) the lintel's opening and the closure leave the doorway clear
    expect(LINTEL.w / 2).toBeCloseTo(2.6, 10);
    expect(PIER_OUTER_X).toBeGreaterThan(LINTEL.w / 2);

    // (4) the strip is covered by rendered ground stonework: the widest
    //     ceremonial tread reaches X = 7.0 and the flanking bench spans
    //     5.8 … 7.8 at the closure's own Z line (−7.6), so the closure's south
    //     face runs through the middle of both.
    expect(STEP_TREAD_W / 2).toBe(7.0);
    expect(STEP_TREAD_W / 2).toBeGreaterThan(PIER_OUTER_X);
    expect(PORTAL_BENCHES.length).toBe(2);
    const benchR = PORTAL_BENCHES.find((b) => b.x > 0)!;
    const benchL = PORTAL_BENCHES.find((b) => b.x < 0)!;
    const seatFront = flankR.cz + flankR.hd; // the closure's south (city-side) face
    for (const b of [benchR, benchL]) {
      expect(Math.abs(b.x)).toBeCloseTo(6.8, 10);
      expect(b.z).toBeCloseTo(-7.6, 10);
      // the bench's 0.65 depth straddles the closure's south face
      expect(b.z + 0.325).toBeGreaterThan(seatFront); // reaches south of the wall line
      expect(b.z - 0.325).toBeLessThan(seatFront); // …and north of it
    }
    // Each bench sits inside its own closure's X band (5.8 … 7.8 in 5.25 … 8.0456).
    const innerX = flankR.cx - flankR.hw;
    const outerX = flankR.cx + flankR.hw;
    expect(benchR.x - 1.0).toBeGreaterThan(innerX);
    expect(benchR.x + 1.0).toBeLessThan(outerX);
    expect(benchL.x + 1.0).toBeLessThan(-innerX);
    expect(benchL.x - 1.0).toBeGreaterThan(-outerX);
  });

  test('the closures add no walkable gap of their own', () => {
    // Their inner corner meets the pier's outer corner at (5.25, −8.1); the
    // expanded shapes must overlap there, so no diagonal slot opens up.
    const flankR = findRect('colo-flank-r');
    const pierR = findRect('colo-pier-r');
    const cornerX = flankR.cx - flankR.hw;
    expect(cornerX).toBeCloseTo(pierR.cx + pierR.hw, 10);
    // The closure's north face and the pier's south (+Z) face are the same plane.
    expect(flankR.cz - flankR.hd).toBeCloseTo(pierR.cz + pierR.hd, 10);
    for (const [x, z] of [
      [cornerX + 0.01, -8.11],
      [cornerX + 0.05, -8.05],
      [cornerX + 0.2, -8.2],
      [cornerX, -8.3],
    ] as const) {
      expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS), `gap at (${x}, ${z})`).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. The intended entrance stays traversable — both directions
// ══════════════════════════════════════════════════════════════════════════

describe('C. The portal doorway still works', () => {
  test('north-bound pushes through the doorway reach the arena', () => {
    for (const x of DOORWAY_CENTRES) {
      const r = push(x, -4, 0, -1, 70);
      expect(enteredArena(r), `doorway push at X = ${x} was blocked`).toBe(true);
      expect(r.end[1], `doorway push at X = ${x}`).toBeLessThan(-20);
    }
  });

  test('south-bound pushes through the doorway reach the city', () => {
    for (const x of [-2.0, -1.0, 0, 1.0, 2.0]) {
      const r = push(x, -20, 0, 1, 70);
      expect(leftColosseum(r), `doorway exit at X = ${x} was blocked`).toBe(true);
      expect(r.end[1], `doorway exit at X = ${x}`).toBeGreaterThan(-6);
    }
  });

  test('the doorway corridor is collision-free at every point of the passage', () => {
    for (const x of [-2.0, -1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5, 2.0]) {
      for (const z of [-6.5, -7.0, -7.5, -8.0, -9.0, -9.8, -11.0]) {
        expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS), `(${x}, ${z}) blocked`).toBe(false);
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. The approach immediately outside both piers
// ══════════════════════════════════════════════════════════════════════════

describe('D. The piers keep their approach', () => {
  test('the ground in front of each pier is clear, and stays outside the arena', () => {
    for (const x of [-6.6, -5.0, -4.0, -3.0, 3.0, 4.0, 5.0, 6.6]) {
      for (const z of [-6.5, -7.0]) {
        expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS), `approach (${x}, ${z}) blocked`).toBe(false);
      }
      const r = push(x, -6.0, 0, -1);
      expect(enteredArena(r), `push from (${x}, -6) reached the arena`).toBe(false);
      expect(r.end[1], `push from (${x}, -6)`).toBeGreaterThan(-8.0);
    }
  });

  test('the outer approach along the facade is unchanged on both sides', () => {
    // The avenue approach the collision runner walks (X = 5, Z 16 → −5) and the
    // mirror, plus the arc's own blocking point at θ = 0.5.
    for (let z = 16; z >= -5; z -= 1) {
      expect(collidesWith(5, z, PLAYER_RADIUS, CITY_COLLIDERS), `(5, ${z}) blocked`).toBe(false);
      expect(collidesWith(-5, z, PLAYER_RADIUS, CITY_COLLIDERS), `(-5, ${z}) blocked`).toBe(false);
    }
    const wallPoint = arcPoint(0.5);
    expect(collidesWith(wallPoint[0], wallPoint[1], PLAYER_RADIUS, CITY_COLLIDERS)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. No trap, no snag
// ══════════════════════════════════════════════════════════════════════════

describe('E. Movement neither snags nor traps', () => {
  test('a diagonal push into the flank/arc seam slides along the wall', () => {
    const h = Math.SQRT1_2;
    for (const x of [5.6, 6.6, 7.0, 8.0]) {
      const r = push(x, -6.6, h, -h, 30);
      // It slides east along the facade instead of sticking on the seam.
      expect(r.end[0] - x, `seam push at X = ${x} snagged`).toBeGreaterThan(5);
      // …and sliding along the outside keeps it outside the building.
      expect(outsideColosseum(r.end[0], r.end[1]), `seam push at X = ${x} ended inside`).toBe(true);
    }
    // The west mirror slides east into the doorway — the intended entrance —
    // rather than snagging at its own seam.
    const west = push(-6.6, -6.6, h, -h, 30);
    expect(west.end[0] - -6.6).toBeGreaterThan(5);
  });

  test('the small pocket east of the pier is escapable in two directions', () => {
    // Inside the arena, just north of the closure's north face.
    const start: [number, number] = [5.7, -9.0];
    const north = push(start[0], start[1], 0, -1, 20);
    const east = push(start[0], start[1], 1, 0, 20);
    const south = push(start[0], start[1], 0, 1, 20);
    const west = push(start[0], start[1], -1, 0, 20);
    expect(north.end[1]).toBeLessThan(-10); // out and away
    expect(east.end[0]).toBeGreaterThan(8); // along the wall
    expect(south.end[1]).toBeCloseTo(-8.62, 2); // the closure stops it
    expect(west.end[0]).toBeCloseTo(5.7, 3); // the pier stops it
    // Not trapped: the blocked directions are reversible, the open ones move.
    expect(push(start[0], start[1], 0, -1, 3).end[1]).toBeLessThan(start[1]);
  });

  test('a blocked push can be reversed immediately', () => {
    // Push north into the closure, then step back south.
    const blocked = push(6.6, -6.9, 0, -1, 10);
    expect(blocked.end[1]).toBeGreaterThan(-8.0);
    const back = push(blocked.end[0], blocked.end[1], 0, 1, 4);
    expect(back.end[1]).toBeGreaterThan(blocked.end[1] + 1);
  });

  test('a player deep inside still walks out through the doorway', () => {
    const r1 = walk(7.0, -16, [[-1, 0, 20], [0, 1, 70]]);
    expect(leftColosseum(r1), `escape route 1 ended at (${r1.end.join(', ')})`).toBe(true);
    const r2 = walk(6.6, -14, [[-1, 0, 18], [0, 1, 70]]);
    expect(leftColosseum(r2), `escape route 2 ended at (${r2.end.join(', ')})`).toBe(true);
    // Both exits are through the doorway, so both pass |X| ≤ 2.2 on the way out.
    expect(Math.abs(r1.end[0])).toBeLessThan(2.2);
    expect(Math.abs(r2.end[0])).toBeLessThan(2.2);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. Identities and unrelated invariants
// ══════════════════════════════════════════════════════════════════════════

describe('F. Nothing else about the Colosseum or the city moved', () => {
  const coloIds = CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-')).map((c) => c.id).sort();

  test('the Colosseum holds exactly its old colliders plus the two closures', () => {
    const expected = [
      ...Array.from({ length: 8 }, (_, i) => `colo-wall-l-${i}`),
      ...Array.from({ length: 8 }, (_, i) => `colo-wall-r-${i}`),
      'colo-pier-l',
      'colo-pier-r',
      'colo-flank-l',
      'colo-flank-r',
      // Phase C-8.28 added the arena podium polyline (GrandColosseum.tsx 4a,
      // rendered radius 15.3, the arena-side boundary between sand and stone).
      // Everything this suite pins — the piers, the two facade arcs and the two
      // C-8.27 closures — is still asserted exactly as before, above and below.
      ...Array.from({ length: 8 }, (_, i) => `colo-podium-l-${i}`),
      ...Array.from({ length: 8 }, (_, i) => `colo-podium-r-${i}`),
      // Phase C-8.31 completed the drum around the new rear axial gate: the
      // rear quadrants of both the facade wall and the podium ring.  The two
      // front arcs and the two front podium arcs above keep their own ids and
      // their own exact geometry.
      ...Array.from({ length: 2 }, (_, i) => `colo-rearwall-l-${i}`),
      ...Array.from({ length: 2 }, (_, i) => `colo-rearwall-r-${i}`),
      ...Array.from({ length: 2 }, (_, i) => `colo-rearpodium-l-${i}`),
      ...Array.from({ length: 2 }, (_, i) => `colo-rearpodium-r-${i}`),
    ].sort();
    expect(coloIds).toEqual(expected);
  });

  test('the piers and the sixteen facade arc segments are untouched', () => {
    expect(findRect('colo-pier-l')).toMatchObject({ cx: -3.925, cz: -9.8, hw: 2.65 / 2, hd: 3.4 / 2 });
    expect(findRect('colo-pier-r')).toMatchObject({ cx: 3.925, cz: -9.8, hw: 2.65 / 2, hd: 3.4 / 2 });
    // Both arcs still run from their own end to the entrance gap, 8 segments each.
    for (const [prefix, thetaStart, thetaEnd] of [
      ['colo-wall-l', -Math.PI * 0.85, ENTRANCE_MIN],
      ['colo-wall-r', ENTRANCE_MAX, Math.PI * 0.85],
    ] as const) {
      const segs = CITY_COLLIDERS.filter(
        (c): c is SegmentCollider => c.type === 'segment' && c.id.startsWith(prefix),
      );
      expect(segs.length).toBe(8);
      const from = arcPoint(thetaStart);
      const to = arcPoint(thetaEnd);
      expect(segs[0].x1).toBeCloseTo(from[0], 10);
      expect(segs[0].z1).toBeCloseTo(from[1], 10);
      expect(segs[segs.length - 1].x2).toBeCloseTo(to[0], 10);
      expect(segs[segs.length - 1].z2).toBeCloseTo(to[1], 10);
    }
  });

  test('the closures are the only colliders this phase adds', () => {
    const preFixIds = withPreFixRegistry(() => CITY_COLLIDERS.map((c) => c.id).sort());
    // C-8.28's podium polyline and C-8.31's rear quadrants came later; this
    // suite's own delta is still exactly the two closures.
    const added = CITY_COLLIDERS.map((c) => c.id).sort()
      .filter((id) => !preFixIds.includes(id)
        && !id.startsWith('colo-podium') && !id.startsWith('colo-rear'));
    expect(added).toEqual(['colo-flank-l', 'colo-flank-r']);
    // No collider was removed or renamed either.
    expect(CITY_COLLIDERS.map((c) => c.id).sort()
      .filter((id) => !id.startsWith('colo-flank') && !id.startsWith('colo-podium')
        && !id.startsWith('colo-rearwall') && !id.startsWith('colo-rearpodium')))
      .toEqual(preFixIds);
  });

  test('unrelated city colliders keep their geometry', () => {
    const byId = (id: string): Collider => {
      const c = CITY_COLLIDERS.find((c) => c.id === id);
      if (!c) throw new Error(`collider '${id}' missing`);
      return c;
    };
    expect(byId('fountain')).toMatchObject({ type: 'circle', cx: 0, cz: 0, r: 3.6 });
    expect(byId('smithing-forge')).toMatchObject({ cx: 18, cz: 2.6, hw: 9.5 / 2, hd: 8.0 / 2 });
    expect(byId('general-store')).toMatchObject({ cx: 22, cz: -5, hw: 7.7 / 2, hd: 6.3 / 2 });
    expect(byId('merchant-house')).toMatchObject({ cx: 26, cz: -13, hw: 7.7 / 2, hd: 7.0 / 2 });
    expect(byId('records-library')).toMatchObject({ cx: 23.1, cz: -30, hw: 6.5 / 2, hd: 5.7 / 2 });
    expect(byId('doctore-house')).toMatchObject({ cx: 28, cz: -18.875, hw: 6.0 / 2, hd: 3.75 / 2 });
    // Wall runs elsewhere in the city are unchanged in count.
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('motte-wall')).length).toBe(20);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('fortress-')).length).toBe(5);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('yard-wall')).length).toBe(14);
  });

  test('the Colosseum hub and its fast-travel arrival are unchanged and clear', () => {
    const hub = HUB_LOCATIONS.find((l) => l.id === 'colosseum')!;
    expect([hub.position[0], hub.position[2]]).toEqual([0, -25]);
    expect(hub.radius).toBe(5.5);
    const arrival = FAST_TRAVEL_ARRIVALS.colosseum;
    expect(arrival).toEqual([0, -23]);
    expect(collidesWith(arrival[0], arrival[1], PLAYER_RADIUS, CITY_COLLIDERS)).toBe(false);
    expect(collidesWith(arrival[0], arrival[1], PLAYER_RADIUS + 0.5, CITY_COLLIDERS)).toBe(false);
    expect(getNearbyHubLocation([arrival[0], 0, arrival[1]])?.id).toBe('colosseum');
    // The arrival stays well clear of both closures and can move freely.
    for (const id of ['colo-flank-l', 'colo-flank-r'] as const) {
      const r = findRect(id);
      const dx = Math.max(Math.abs(arrival[0] - r.cx) - r.hw, 0);
      const dz = Math.max(Math.abs(arrival[1] - r.cz) - r.hd, 0);
      expect(Math.hypot(dx, dz)).toBeGreaterThan(4 * PLAYER_RADIUS);
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const moved = push(arrival[0], arrival[1], dx, dz, 2);
      expect(Math.hypot(moved.end[0] - arrival[0], moved.end[1] - arrival[1])).toBeGreaterThan(0.5);
    }
  });

  test('the runner’s own portal assertions still hold on the shipped registry', () => {
    // The exact points scripts/collisionTests.ts checks around the steps and
    // the passage — this phase must not have narrowed any of them.
    for (const px of [-2.0, 0, 2.0]) {
      for (const pz of [-6.5, -7.0, -7.5, -8.0]) {
        expect(collidesWith(px, pz, PLAYER_RADIUS, CITY_COLLIDERS), `step (${px}, ${pz})`).toBe(false);
      }
    }
    for (const px of [-5, 5]) {
      expect(collidesWith(px, -6.5, PLAYER_RADIUS, CITY_COLLIDERS), `step edge (${px}, -6.5)`).toBe(false);
    }
    for (const px of [-2.0, -1.0, 0, 1.0, 2.0]) {
      expect(collidesWith(px, -9.8, PLAYER_RADIUS, CITY_COLLIDERS), `passage (${px}, -9.8)`).toBe(false);
    }
    for (const [px, pz] of [[0, -5.7], [0, -7.0], [0, -9.0]] as const) {
      expect(collidesWith(px, pz, PLAYER_RADIUS, CITY_COLLIDERS), `gap centre (${px}, ${pz})`).toBe(false);
    }
  });
});
