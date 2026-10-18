/**
 * Phase C-8.28 — Colosseum perimeter and portal boundary audit.
 *
 * ── THE THREE REPORTED CONDITIONS (audited against the real resolver) ───────
 *
 * 1. PODIUM CROSSING THE PORTAL.  CONFIRMED.  GrandColosseum.tsx section 4a
 *    renders the arena boundary wall (the podium) as a 1.2-unit-high cylinder
 *    at R_ARENA_WALL = 15.3 about the root, world Y 0.05 … 1.25 — so it stands
 *    at Z = −9.7 across the monumental doorway.  Nothing collided with it: the
 *    registry only modelled the facade (radius 19.3) and the portal piers.  A
 *    straight north-bound push from (0, −4) through the resolver crossed the
 *    podium shell and reached the sand, i.e. the player walked THROUGH the
 *    rendered wall.  Behind it the cavea (seating radius 15.3 … 17.8) also
 *    crossed the doorway, so the walk-in clipped two rendered surfaces.
 *
 * 2. FACADE-BAND WALKABILITY.  CONFIRMED.  With no bowl collider, a radial
 *    push from the arena centre ran through the podium AND the cavea and came
 *    to rest on the facade collider's own line, i.e. inside the rendered wall
 *    band (radius 18.0 … 19.3): east/west ended at r = 18.62, the diagonals at
 *    18.81 — the player standing in the arch/wall stonework.
 *
 * 3. REAR FACADE GAP.  It is neither intended architecture nor an intended
 *    traversal route: the exterior was a 306° partial cylinder (ARC_THETA_LENGTH
 *    = 1.7π, i.e. a 54° opening centred on θ = π) — a documented render-cost
 *    choice ("invisible from the player's normal viewing position").  Walking
 *    around the building therefore led in and out through an opening with no
 *    stone in it at all.  Closing it as-is would have needed a ~10-unit
 *    invisible blocker on bare ground, so this phase DOCUMENTED it and left it
 *    untouched (§G).  It no longer exists: Phase C-8.31 completed the drum
 *    around a designed 16° axial gate on the bridge axis, and §G now asserts
 *    the closed drum and the gate in its place.
 *
 * ── THE FIX ────────────────────────────────────────────────────────────────
 *   • GrandColosseum.tsx: the interior bowl (podium + both seating frustums)
 *     stops at the entrance like every other band in that file (plinth, sill,
 *     spandrel, cornices, ledge), cut over the portal's own 5.2-unit passage
 *     (|X| ≤ 2.6 at the podium — the lintel half-width and the piers' inner
 *     faces).  The cut edge lands on the pier's inner-face line, so the
 *     vestibule wall runs unbroken from the pier into the podium.
 *   • collisionShapes.ts: `colo-podium-l/r-*`, a 16-segment polyline on the
 *     rendered podium radius (15.3, same 306° arc), with that same passage gap.
 *     It is the missing boundary between sand and stone: it stops the player at
 *     the rendered podium and keeps the facade band unreachable from inside.
 *     No collider moved, resized or renamed; the piers, the flank closures and
 *     both facade arcs are untouched.
 *
 * Sections: A the cut-through render, B the podium/collider agreement,
 * C resolver: the podium stops the player, D resolver: the doorway both ways,
 * E the C-8.27 closures re-tested, F the facade band is sealed, G the rear gap
 * (documented, unchanged), H city invariants.
 *
 * Run with: bun test src/utils/phaseC8_28.test.ts
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

// ── Tiny parsers (same style as the C-8.18 … C-8.27 suites) ───────────────

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
function findSegs(prefix: string): SegmentCollider[] {
  return CITY_COLLIDERS.filter(
    (c): c is SegmentCollider => c.type === 'segment' && c.id.startsWith(prefix) && !c.id.slice(prefix.length + 1).includes('-'),
  );
}

// ── The rendered Colosseum, read back from its source ─────────────────────

const COLO_ROOT_Z = num(coloSrc, /<group position=\{\[0, 0, (-?[\d.]+)\]\}>\s*\{\/\* =+/);
const R_FACADE = num(coloSrc, /const R_FACADE = ([\d.]+);/);
const R_LINER = num(coloSrc, /const R_LINER = ([\d.]+);/);
const R_ARENA_WALL = num(coloSrc, /const R_ARENA_WALL = ([\d.]+);/);
const SEATING_T1_R_OUT = num(coloSrc, /const SEATING_T1_R_OUT = ([\d.]+);/);
const SEATING_T2_R_OUT = num(coloSrc, /const SEATING_T2_R_OUT = ([\d.]+);/);
const ENTRANCE_MIN = num(coloSrc, /const ENTRANCE_MIN = (-?[\d.]+);/);
const ENTRANCE_MAX = num(coloSrc, /const ENTRANCE_MAX = ([\d.]+);/);
/** Phase C-8.31 — the drum is complete; both openings sit on the arc seam. */
const GATE_HALF_W = num(coloSrc, /const GATE_HALF_W = ([\d.]+);/);
const GATE_HALF = Math.asin(GATE_HALF_W / R_FACADE);
const DRUM_E_START = ENTRANCE_MAX;
const DRUM_E_END = Math.PI - GATE_HALF;
const DRUM_W_START = Math.PI + GATE_HALF;
const DRUM_W_END = 2 * Math.PI + ENTRANCE_MIN;
/** Where the pre-C-8.31 306° drum ended — the rear seam of both front arcs. */
const REAR_SEAM = Math.PI * 0.85;
const PORTAL_PASSAGE_HALF_W = num(coloSrc, /const PORTAL_PASSAGE_HALF_W = ([\d.]+);/);
const BOWL_GAP_HALF = Math.asin(PORTAL_PASSAGE_HALF_W / R_ARENA_WALL);

/** Tier-1 portal-stone boxes: the two side piers and the lintel over the gap. */
const PORTAL_STONE = all(
  coloSrc,
  /<mesh material=\{portalStoneMat\} castShadow receiveShadow position=\{\[\s*(-?[\d.]+),\s*([\d.]+),\s*0\s*\]\}>\s*<boxGeometry args=\{\[\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\]\}/g,
).map((m) => ({ x: Number(m[1]), w: Number(m[3]), d: Number(m[5]) }));
const PIERS = PORTAL_STONE.filter((b) => Math.abs(b.x) > 1);
const LINTEL = PORTAL_STONE.find((b) => b.x === 0)!;
const PIER_WORLD_Z = -9.8; // portal group local [0, 0, 15.2] + root −25

/** Widest ceremonial tread and the two flanking spectator benches. */
const STEP_TREAD_HALF_W = num(coloSrc, /Ceremonial Entrance Steps[\s\S]*?<boxGeometry args=\{\[\s*([\d.]+),/) / 2;
const PORTAL_BENCH_X = all(
  coloSrc,
  /<RomanBench position=\{\[\s*(-?[\d.]+),\s*0,\s*(-?[\d.]+)\s*\]\} rotationY=\{0\} \/>/g,
).map((m) => Math.abs(Number(m[1])));

/** The bowl cut, in the collider's own convention (X = R·sin θ, Z = R·cos θ + root). */
const bowlPoint = (r: number, theta: number): [number, number] => [
  r * Math.sin(theta),
  r * Math.cos(theta) + COLO_ROOT_Z,
];
const ARC_END_POINT = bowlPoint(R_FACADE, REAR_SEAM);
const PODIUM_GAP_EDGE = bowlPoint(R_ARENA_WALL, BOWL_GAP_HALF);

// ── The runtime resolver, wrapped (same harness as the C-8.27 suite) ──────

interface PushResult {
  end: [number, number];
  trail: Array<[number, number]>;
}

function push(startX: number, startZ: number, dx: number, dz: number, steps = 80): PushResult {
  clearRecoveryHistory();
  let pos: [number, number, number] = [startX, 0, startZ];
  const trail: Array<[number, number]> = [[startX, startZ]];
  for (let i = 0; i < steps; i++) {
    pos = resolveCityMovement(pos, dx, dz, 3.8, 0.1);
    trail.push([pos[0], pos[2]]);
  }
  return { end: [pos[0], pos[2]], trail };
}

const coloRadius = (x: number, z: number) => Math.hypot(x, z - COLO_ROOT_Z);
const onSand = (x: number, z: number) => coloRadius(x, z) < 15.0 - PLAYER_RADIUS;
const outsideBuilding = (x: number, z: number) => coloRadius(x, z) > R_FACADE + PLAYER_RADIUS;
const inWallBand = (x: number, z: number) => {
  const r = coloRadius(x, z);
  return r > R_LINER && r < R_FACADE;
};
const maxTrailRadius = (r: PushResult) => Math.max(...r.trail.map(([x, z]) => coloRadius(x, z)));

/** Podium arc point at a given angle, in world space. */
const podiumPoint = (theta: number) => bowlPoint(R_ARENA_WALL, theta);

const H = Math.SQRT1_2;
/**
 * Radial directions out of the arena that the podium ring bounds.  The two
 * openings are the doorway at θ = 0 (asserted in D) and the rear gate at
 * θ = π (asserted in G) — neither is part of the ring.
 */
const RADIAL_DIRS: Array<[string, number, number]> = [
  ['NE', H, -H], ['E', 1, 0], ['SE', H, H],
  ['W', -1, 0], ['NW', -H, -H], ['SW', -H, H],
];

// ══════════════════════════════════════════════════════════════════════════
// A. The entrance passage is cut through the rendered bowl
// ══════════════════════════════════════════════════════════════════════════

describe('A. The rendered bowl stops at the entrance', () => {
  test('the podium and both seating tiers are built as two arcs, not one full arc', () => {
    // No interior band spans the whole turn: all three are cut.
    for (const args of [
      '[R_ARENA_WALL, R_ARENA_WALL, 1.2, 32, 1, true, 0, FULL_TURN]',
      '[SEATING_T1_R_OUT, R_ARENA_WALL, 2.5, 32, 1, true, 0, FULL_TURN]',
      '[SEATING_T2_R_OUT, SEATING_T1_R_OUT, 2.5, 32, 1, true, 0, FULL_TURN]',
    ]) {
      expect(coloSrc).not.toContain(args);
    }

    // …and all three are driven by the shared two-entry cut (one per opening).
    const cuts = all(coloSrc, /BOWL_ARCS\.map/g);
    expect(cuts.length).toBe(3);
    // One source occurrence each (the map produces both arcs at runtime).
    for (const args of [
      '[R_ARENA_WALL, R_ARENA_WALL, 1.2, 32, 1, true, start, len]',
      '[SEATING_T1_R_OUT, R_ARENA_WALL, 2.5, 32, 1, true, start, len]',
      '[SEATING_T2_R_OUT, SEATING_T1_R_OUT, 2.5, 32, 1, true, start, len]',
    ]) {
      expect(all(coloSrc, new RegExp(args.replace(/[[\]()]/g, '\\$&'), 'g')).length, args).toBe(1);
    }

    // The cut geometry itself: the two arcs are mirror images, each opening a
    // passage cut on the portal's own 5.2-unit line (C-8.31 mirrors the second
    // one at the rear gate, on the drum's other seam).
    expect(coloSrc).toContain('const BOWL_GAP_HALF = Math.asin(PORTAL_PASSAGE_HALF_W / R_ARENA_WALL);');
    expect(BOWL_GAP_HALF).toBeCloseTo(Math.asin(2.6 / 15.3), 10);
    expect(REAR_SEAM).toBeCloseTo(Math.PI * 0.85, 10);
    expect(ENTRANCE_MAX).toBe(0.43);
    expect(ENTRANCE_MIN).toBe(-0.43);
    // Each opening is cut on its own seam: θ = 0 for the entrance, π ± GATE_HALF
    // for the gate, both over the same BOWL_GAP_HALF passage.
    const bowlE = [BOWL_GAP_HALF, Math.PI - BOWL_GAP_HALF];
    const bowlW = [Math.PI + BOWL_GAP_HALF, 2 * Math.PI - BOWL_GAP_HALF];
    expect(bowlE[1] - bowlE[0]).toBeCloseTo(bowlW[1] - bowlW[0], 10);
    expect(2 * Math.PI - bowlW[1]).toBeCloseTo(bowlE[0], 10);
    // Each opening is a 2·BOWL_GAP_HALF wedge — the 5.2-unit passage line.
    expect(bowlW[0] - bowlE[1]).toBeCloseTo(2 * BOWL_GAP_HALF, 10);
    expect(2 * R_ARENA_WALL * Math.sin(BOWL_GAP_HALF)).toBeCloseTo(5.2, 10);
  });

  test('the cut is the portal’s own passage width, inside the facade entrance bay', () => {
    expect(PORTAL_PASSAGE_HALF_W).toBe(2.6);
    // Sources of the value: the lintel over the doorway and the piers' inner faces.
    expect(LINTEL.w / 2).toBeCloseTo(PORTAL_PASSAGE_HALF_W, 10);
    expect(Math.abs(PIERS[0].x) - PIERS[0].w / 2).toBeCloseTo(PORTAL_PASSAGE_HALF_W, 10);
    // A doorway-width cut, not the whole 49° entrance bay (which the facade uses).
    expect(BOWL_GAP_HALF).toBeGreaterThan(0.15);
    expect(BOWL_GAP_HALF).toBeLessThan(ENTRANCE_MAX);
    expect(ENTRANCE_MAX).toBe(0.43);
    expect(ENTRANCE_MIN).toBe(-0.43);
  });

  test('the cut edge lands on the pier inner-face line, inside the piers’ own Z span', () => {
    expect(PODIUM_GAP_EDGE[0]).toBeCloseTo(PORTAL_PASSAGE_HALF_W, 10); // X = 2.6
    // Z from the same construction the collider uses: R·cos(gap) + root.
    expect(PODIUM_GAP_EDGE[1]).toBeCloseTo(R_ARENA_WALL * Math.cos(BOWL_GAP_HALF) + COLO_ROOT_Z, 10);
    expect(PODIUM_GAP_EDGE[1]).toBeCloseTo(-9.923, 2);
    const pierFrontZ = PIER_WORLD_Z + PIERS[0].d / 2; // −8.1
    const pierBackZ = PIER_WORLD_Z - PIERS[0].d / 2; // −11.5
    expect(pierFrontZ).toBeCloseTo(-8.1, 10);
    expect(PODIUM_GAP_EDGE[1]).toBeLessThan(pierFrontZ); // north of the pier front
    expect(PODIUM_GAP_EDGE[1]).toBeGreaterThan(pierBackZ); // south of the pier back
  });

  test('the podium keeps every other rendered property (radius, height, material)', () => {
    expect(R_ARENA_WALL).toBe(15.3);
    expect(coloSrc).toContain('args={[R_ARENA_WALL, R_ARENA_WALL, 1.2, 32, 1, true, start, len]}');
    expect(coloSrc).toContain('position={[0, (0.05 + 1.25) / 2, 0]}');
    expect(SEATING_T1_R_OUT).toBe(16.8);
    expect(SEATING_T2_R_OUT).toBe(17.8);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The podium collider sits on the rendered podium
// ══════════════════════════════════════════════════════════════════════════

describe('B. Podium collision matches the rendered podium', () => {
  test('20 segments on the rendered radius, meeting both axial passages', () => {
    const right = findSegs('colo-podium-r');
    const left = findSegs('colo-podium-l');
    const rearR = findSegs('colo-rearpodium-r');
    const rearL = findSegs('colo-rearpodium-l');
    expect(right.length).toBe(8);
    expect(left.length).toBe(8);
    expect(rearR.length).toBe(2);
    expect(rearL.length).toBe(2);
    for (const s of [...right, ...left, ...rearR, ...rearL]) {
      for (const [x, z] of [[s.x1, s.z1], [s.x2, s.z2]] as const) {
        expect(coloRadius(x, z), `segment ${s.id} endpoint off the rendered podium`).toBeCloseTo(R_ARENA_WALL, 6);
      }
    }
    // The front arcs are the C-8.28 ones, untouched: from the old 306° arc's
    // own end to the entrance cut, 8 segments each.
    expect(left[0].x1).toBeCloseTo(podiumPoint(-Math.PI * 0.85)[0], 10);
    expect(left[0].z1).toBeCloseTo(podiumPoint(-Math.PI * 0.85)[1], 10);
    expect(right[right.length - 1].x2).toBeCloseTo(podiumPoint(REAR_SEAM)[0], 10);
    expect(right[right.length - 1].z2).toBeCloseTo(podiumPoint(REAR_SEAM)[1], 10);
    // Its inner ends are the entrance cut, mirrored.
    expect(right[0].x1).toBeCloseTo(PODIUM_GAP_EDGE[0], 10);
    expect(right[0].z1).toBeCloseTo(PODIUM_GAP_EDGE[1], 10);
    expect(left[left.length - 1].x2).toBeCloseTo(-PODIUM_GAP_EDGE[0], 10);
    expect(left[left.length - 1].z2).toBeCloseTo(PODIUM_GAP_EDGE[1], 10);
    // …and C-8.31's rear quadrants carry the ring on, each ending on the gate's
    // own passage edge, mirroring the entrance cut.
    expect(rearR[0].x1).toBeCloseTo(podiumPoint(REAR_SEAM)[0], 10);
    expect(rearR[0].z1).toBeCloseTo(podiumPoint(REAR_SEAM)[1], 10);
    expect(rearR[rearR.length - 1].x2).toBeCloseTo(podiumPoint(Math.PI - BOWL_GAP_HALF)[0], 10);
    expect(rearR[rearR.length - 1].z2).toBeCloseTo(podiumPoint(Math.PI - BOWL_GAP_HALF)[1], 10);
    expect(rearL[0].x1).toBeCloseTo(podiumPoint(Math.PI + BOWL_GAP_HALF)[0], 10);
    expect(rearL[0].z1).toBeCloseTo(podiumPoint(Math.PI + BOWL_GAP_HALF)[1], 10);
    expect(rearL[rearL.length - 1].x2).toBeCloseTo(podiumPoint(Math.PI * 1.15)[0], 10);
    expect(rearL[rearL.length - 1].z2).toBeCloseTo(podiumPoint(Math.PI * 1.15)[1], 10);
    // The two rear quadrants are mirror images about X = 0: each runs from its
    // own outer seam to the gate, so one's first endpoint mirrors the other's
    // last.
    expect(rearR[0].x1).toBeCloseTo(-rearL[rearL.length - 1].x2, 10);
    expect(rearR[0].z1).toBeCloseTo(rearL[rearL.length - 1].z2, 10);
    expect(rearR[rearR.length - 1].x2).toBeCloseTo(-rearL[0].x1, 10);
    expect(rearR[rearR.length - 1].z2).toBeCloseTo(rearL[0].z1, 10);
  });

  test('no segment lets the player squeeze through (sagitta < player radius)', () => {
    for (const [prefix, span] of [
      ['colo-podium-r', REAR_SEAM - BOWL_GAP_HALF],
      ['colo-rearpodium-r', Math.PI - BOWL_GAP_HALF - REAR_SEAM],
    ] as const) {
      const segs = findSegs(prefix);
      const dTheta = span / segs.length;
      const sagitta = R_ARENA_WALL * (1 - Math.cos(dTheta / 2));
      expect(sagitta, prefix).toBeLessThan(PLAYER_RADIUS);
    }
    // …and the front arcs are a real polyline, as on the facade.
    const front = findSegs('colo-podium-r');
    const frontSagitta = R_ARENA_WALL * (1 - Math.cos((REAR_SEAM - BOWL_GAP_HALF) / front.length / 2));
    expect(frontSagitta).toBeGreaterThan(0.1);
  });

  test('collision agrees with the rendered stone everywhere on the ring', () => {
    let mismatches: string[] = [];
    for (let deg = -152; deg <= 152; deg += 2) {
      const theta = (deg * Math.PI) / 180;
      if (Math.abs(theta) < BOWL_GAP_HALF) continue; // evaluated separately below
      const [x, z] = podiumPoint(theta);
      if (!collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS)) mismatches.push(`${deg}°`);
    }
    expect(mismatches).toEqual([]);
    // …and the entrance cut is genuinely open: stone is absent across the cut
    // arc, and the whole doorway corridor is clear at player radius.  (At
    // player radius the useful mouth is the piers' inner faces, |X| ≤ 2.2 —
    // exactly the corridor the piers themselves leave, section D.)
    for (const theta of [0, 0.05, -0.05]) {
      const [x, z] = podiumPoint(theta);
      expect(collidesWith(x, z, 0.05, CITY_COLLIDERS), `stone across the cut at θ=${theta}`).toBe(false);
    }
    for (const x of [-2.1, -1.05, 0, 1.05, 2.1]) {
      const z = COLO_ROOT_Z + Math.sqrt(R_ARENA_WALL * R_ARENA_WALL - x * x);
      expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS), `cut too narrow at X = ${x}`).toBe(false);
    }
  });

  test('the podium stops at the rear gate’s passage, on the portal’s own line', () => {
    // θ = π is the rear gate (Phase C-8.31): the ring is cut there over the
    // same 5.2-unit passage the doorway uses, so the corridor inside the cut
    // edges (|X| ≤ 2.6 at the podium radius) is open…
    for (const x of [-2.0, 0, 2.0]) {
      const z = COLO_ROOT_Z - Math.sqrt(R_ARENA_WALL * R_ARENA_WALL - x * x);
      expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS), `gate passage blocked at X = ${x}`).toBe(false);
    }
    // …and the ring stands immediately either side of it, outside the cut.
    for (const x of [-3.4, 3.4]) {
      const z = COLO_ROOT_Z - Math.sqrt(R_ARENA_WALL * R_ARENA_WALL - x * x);
      expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS), `podium missing at X = ${x}`).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. The podium stops the player — no walk-through, no clip
// ══════════════════════════════════════════════════════════════════════════

describe('C. From the arena, the podium is solid and the player is not trapped', () => {
  test('radial pushes out of the arena stop at the rendered podium', () => {
    for (const [name, dx, dz] of RADIAL_DIRS) {
      const r = push(0, -25, dx, dz);
      const maxR = maxTrailRadius(r);
      // Never crosses the rendered podium radius (this is the C-8.28 defect).
      expect(maxR, `${name} push crossed the rendered podium`).toBeLessThan(R_ARENA_WALL);
      expect(r.trail.every(([x, z]) => !inWallBand(x, z)), `${name} push entered the facade wall band`).toBe(true);
      // …and it is stopped by the podium, not somewhere short of it.
      expect(coloRadius(...r.end), `${name} push stopped early`).toBeGreaterThan(14.0);
    }
  });

  test('the fix reproduces the audit’s defect against a podium-less registry', () => {
    // Exactly the pre-C-8.28 registry: the podium polyline spliced out.
    const snapshot = CITY_COLLIDERS.slice();
    try {
      for (let i = CITY_COLLIDERS.length - 1; i >= 0; i--) {
        if (CITY_COLLIDERS[i].id.startsWith('colo-podium')) CITY_COLLIDERS.splice(i, 1);
      }
      const east = push(0, -25, 1, 0);
      const northEast = push(0, -25, H, -H);
      // The audit's numbers: the player crossed the podium and the cavea and
      // came to rest inside the facade wall band (18.0 … 19.3).
      expect(coloRadius(...east.end)).toBeCloseTo(18.62, 1);
      expect(coloRadius(...northEast.end)).toBeCloseTo(18.81, 1);
      expect(east.trail.some(([x, z]) => coloRadius(x, z) > R_ARENA_WALL)).toBe(true);
      expect(push(0, -4, 0, -1, 40).trail.some(([x, z]) => onSand(x, z))).toBe(true);
    } finally {
      CITY_COLLIDERS.length = 0;
      CITY_COLLIDERS.push(...snapshot);
    }
    // …and the shipped registry is intact again.
    expect(findSegs('colo-podium-r').length).toBe(8);
    expect(findSegs('colo-podium-l').length).toBe(8);
  });

  test('the player on the sand can still move freely (not boxed in)', () => {
    const arrival = FAST_TRAVEL_ARRIVALS.colosseum; // [0, −23], inside the arena
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const moved = push(arrival[0], arrival[1], dx, dz, 3);
      const dist = Math.hypot(moved.end[0] - arrival[0], moved.end[1] - arrival[1]);
      expect(dist, `no room to move in direction (${dx}, ${dz})`).toBeGreaterThan(0.5);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. The intended entrance still works, both directions
// ══════════════════════════════════════════════════════════════════════════

const DOORWAY_CENTRES = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2];

describe('D. The central portal traversal is unchanged', () => {
  test('walking in: north-bound pushes through the doorway reach the sand', () => {
    for (const x of DOORWAY_CENTRES) {
      const r = push(x, -4, 0, -1, 90);
      expect(r.trail.some(([px, pz]) => onSand(px, pz)), `doorway push at X = ${x} never reached the sand`).toBe(true);
      expect(coloRadius(...r.end), `doorway push at X = ${x}`).toBeLessThan(14.0);
    }
  });

  test('walking out: south-bound pushes from the sand reach the city', () => {
    for (const x of DOORWAY_CENTRES) {
      const r = push(x, -20, 0, 1, 90);
      expect(r.trail.some(([px, pz]) => outsideBuilding(px, pz)), `doorway exit at X = ${x} never left the building`).toBe(true);
    }
  });

  test('the passage corridor is collision-free right through the bowl', () => {
    // From the steps, through the piers, across the podium line, onto the sand.
    for (const x of [-2.0, -1.0, 0, 1.0, 2.0]) {
      for (const z of [-6.5, -7.0, -8.0, -9.0, -9.7, -9.925, -10.5, -12.0]) {
        expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS), `passage point (${x}, ${z}) blocked`).toBe(false);
      }
    }
  });

  test('the arena-side mouth of the passage is exactly the pier span', () => {
    // Just inside the cut edge: clear. Just outside it: the podium stands.
    for (const x of [2.1, -2.1]) {
      expect(collidesWith(x, PODIUM_GAP_EDGE[1], PLAYER_RADIUS, CITY_COLLIDERS), `(${x}, ${PODIUM_GAP_EDGE[1]}) blocked`).toBe(false);
    }
    for (const x of [3.2, -3.2]) {
      const z = -25 + Math.sqrt(R_ARENA_WALL * R_ARENA_WALL - x * x);
      expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS), `podium missing at X = ${x}`).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. The C-8.27 flank closures, re-tested
// ══════════════════════════════════════════════════════════════════════════

describe('E. The C-8.27 flank closures: no snag, no false blocking', () => {
  const flankR = findRect('colo-flank-r');
  const innerCorner: [number, number] = [flankR.cx - flankR.hw, flankR.cz - flankR.hd]; // (5.25, −8.1)
  const outerCorner: [number, number] = [flankR.cx + flankR.hw, flankR.cz + flankR.hd]; // (8.0456, −7.457)

  test('the bypass is still blocked, both directions', () => {
    expect(innerCorner[0]).toBeCloseTo(5.25, 10);
    expect(outerCorner[0]).toBeCloseTo(8.0456, 3);
    for (const x of [5.8, 6.25, 6.7, 7.15, 7.6, -6.6]) {
      const north = push(x, -7, 0, -1);
      expect(north.trail.some(([px, pz]) => onSand(px, pz)), `bypass reproduced at X = ${x}`).toBe(false);
      const south = push(x, -16, 0, 1);
      expect(south.trail.some(([px, pz]) => outsideBuilding(px, pz)), `exit reproduced at X = ${x}`).toBe(false);
    }
  });

  test('no snag at the inner endpoint — the player slides, never sticks', () => {
    const r = push(5.35, -6.9, H, -H, 30);
    expect(r.end[0], 'snagged on the pier/flank corner').toBeGreaterThan(9.5);
    expect(r.trail.some(([x, z]) => onSand(x, z))).toBe(false);
    // …and the blocked direction is immediately reversible.
    const blocked = push(5.6, -7.0, 0, -1, 10);
    const back = push(blocked.end[0], blocked.end[1], 0, 1, 4);
    expect(back.end[1]).toBeGreaterThan(blocked.end[1] + 1);
  });

  test('no snag at the outer endpoint — the player slides along the facade', () => {
    const r = push(7.6, -6.7, H, -H, 30);
    expect(r.end[0], 'snagged at the arc/flank seam').toBeGreaterThan(9.5);
    expect(r.trail.some(([x, z]) => onSand(x, z))).toBe(false);
    // A straight north push at the seam endpoint is stopped, and reversible.
    for (const x of [7.9, 8.0, 8.0456]) {
      const n = push(x, -6.7, 0, -1, 20);
      expect(n.trail.some(([px, pz]) => onSand(px, pz)), `seam open at X = ${x}`).toBe(false);
      expect(n.end[1]).toBeGreaterThan(outerCorner[1] - 0.5);
      expect(push(n.end[0], n.end[1], 0, 1, 4).end[1]).toBeGreaterThan(n.end[1] + 1);
    }
  });

  test('no collision on the open ground in front of the portal', () => {
    // Everything south of the facade's own opening line (−7.457) is open ground:
    // the steps, the two benches and the avenue.
    for (let x = -9; x <= 9.001; x += 0.5) {
      const px = Number(x.toFixed(3));
      for (const z of [-6.0, -6.5, -7.0]) {
        expect(collidesWith(px, z, PLAYER_RADIUS, CITY_COLLIDERS), `open ground (${px}, ${z})`).toBe(false);
      }
    }
    for (const px of [-5, 5]) {
      for (let z = 16; z >= -5; z -= 1) {
        expect(collidesWith(px, z, PLAYER_RADIUS, CITY_COLLIDERS), `avenue (${px}, ${z})`).toBe(false);
      }
    }
  });

  test('the closure sits on rendered stonework bar the documented sub-player-width tip', () => {
    // Rendered ground coverage across the closure's X band (5.25 … 8.0456):
    // the widest ceremonial tread reaches X = 7.0, the bench spans 5.8 … 7.8.
    expect(PORTAL_BENCH_X.length).toBe(2);
    const widest = Math.max(STEP_TREAD_HALF_W, Math.max(...PORTAL_BENCH_X) + 1.0); // 7.0 vs 7.8
    expect(widest).toBeCloseTo(7.8, 10);
    const covered = widest - innerCorner[0];
    const uncovered = outerCorner[0] - widest;
    expect(covered).toBeCloseTo(2.55, 2);
    expect(uncovered).toBeLessThan(0.25); // the piece that must reach the arc's end
    expect(uncovered).toBeLessThan(PLAYER_RADIUS);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. The facade band is sealed from the arena interior
// ══════════════════════════════════════════════════════════════════════════

describe('F. The rendered facade wall band is no longer reachable from the sand', () => {
  test('the audit’s wall-band end points (18.62 / 18.81) are unreachable now', () => {
    for (const [name, dx, dz] of RADIAL_DIRS) {
      const r = push(0, -25, dx, dz, 90);
      expect(r.trail.some(([x, z]) => inWallBand(x, z)), `${name} push ended in the wall band`).toBe(false);
    }
    // The one legitimate way out — the doorway — leaves through the vestibule,
    // which is south of the facade wall band; its wall-band points are all
    // inside the doorway corridor (the piers' inner faces at |X| = 2.6).
    const out = push(0, -12, 0, 1, 90);
    expect(out.trail.some(([x, z]) => outsideBuilding(x, z))).toBe(true);
    for (const [x, z] of out.trail) {
      if (inWallBand(x, z)) expect(Math.abs(x), 'doorway exit left the corridor').toBeLessThan(2.6);
    }
  });

  test('the facade arc collider itself is untouched (C-8.31 appended to it)', () => {
    for (const [prefix, from, to] of [
      ['colo-wall-l', -Math.PI * 0.85, ENTRANCE_MIN],
      ['colo-wall-r', ENTRANCE_MAX, REAR_SEAM],
    ] as const) {
      const segs = findSegs(prefix);
      expect(segs.length).toBe(8);
      expect(segs[0].x1).toBeCloseTo(bowlPoint(R_FACADE, from)[0], 10);
      expect(segs[0].z1).toBeCloseTo(bowlPoint(R_FACADE, from)[1], 10);
      expect(segs[segs.length - 1].x2).toBeCloseTo(bowlPoint(R_FACADE, to)[0], 10);
      expect(segs[segs.length - 1].z2).toBeCloseTo(bowlPoint(R_FACADE, to)[1], 10);
    }
    expect(ARC_END_POINT[0]).toBeCloseTo(8.762, 2);
    // C-8.31's rear drum: appended, two segments per quadrant, from the old
    // 306° arc's own ends to the gate's jamb faces.
    for (const [prefix, from, to] of [
      ['colo-rearwall-r', REAR_SEAM, Math.PI - GATE_HALF],
      ['colo-rearwall-l', Math.PI + GATE_HALF, Math.PI * 1.15],
    ] as const) {
      const segs = findSegs(prefix);
      expect(segs.length).toBe(2);
      expect(segs[0].x1).toBeCloseTo(bowlPoint(R_FACADE, from)[0], 10);
      expect(segs[0].z1).toBeCloseTo(bowlPoint(R_FACADE, from)[1], 10);
      expect(segs[segs.length - 1].x2).toBeCloseTo(bowlPoint(R_FACADE, to)[0], 10);
      expect(segs[segs.length - 1].z2).toBeCloseTo(bowlPoint(R_FACADE, to)[1], 10);
      for (const [x, z] of [[segs[0].x1, segs[0].z1], [segs[0].x2, segs[0].z2]] as const) {
        expect(coloRadius(x, z)).toBeCloseTo(R_FACADE, 6);
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// G. The rear opening — closed by C-8.31 around its axial gate
// ══════════════════════════════════════════════════════════════════════════
//
// The C-8.28 report documented this opening as a bare render gap and left it
// alone.  C-8.31 has since completed the drum around a designed rear gate, so
// what this section used to assert as "unchanged" is now asserted the other
// way round: the 54° void is gone, its 2 × 19° flanks are solid stone, and the
// 16° middle is the gate on the bridge axis.

describe('G. The rear drum is closed around the axial gate', () => {
  const GATE_ARC_HALF = GATE_HALF; // the gate's own half-angle at R_FACADE

  test('the drum is complete and the gate is the only opening in it', () => {
    // Rendered: the drum bands run the whole turn or stop at the gate.
    expect(coloSrc).toContain('const FULL_TURN = 2 * Math.PI;');
    expect(coloSrc).toContain('const GATE_HALF = Math.asin(GATE_HALF_W / R_FACADE);');
    expect(GATE_HALF_W).toBeCloseTo(2.7, 10);
    expect((2 * GATE_ARC_HALF * 180) / Math.PI).toBeCloseTo(16.08, 2);
    // …and the 54° void that used to be here is stone now: every 2° of the old
    // opening, except the gate's own 16°, collides on the facade radius.
    for (let deg = 154; deg <= 206; deg += 2) {
      const theta = (deg * Math.PI) / 180;
      if (Math.abs(theta - Math.PI) < GATE_ARC_HALF) continue; // the gate itself
      const [x, z] = bowlPoint(R_FACADE, theta);
      expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS), `rear drum missing at ${deg}°`).toBe(true);
    }
    // …and the front facade still stands everywhere outside the entrance bay.
    for (let deg = -152; deg <= 152; deg += 2) {
      const theta = (deg * Math.PI) / 180;
      if (Math.abs(theta) < ENTRANCE_MAX) continue; // the facade's own 49° bay
      const [x, z] = bowlPoint(R_FACADE, theta);
      expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS), `facade arc missing at ${deg}°`).toBe(true);
    }
    // The arena-side ring is complete in the same way, on its own radius.
    for (let deg = 154; deg <= 206; deg += 2) {
      const theta = (deg * Math.PI) / 180;
      if (Math.abs(theta - Math.PI) < GATE_ARC_HALF + BOWL_GAP_HALF) continue;
      const [x, z] = podiumPoint(theta);
      expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS), `rear podium missing at ${deg}°`).toBe(true);
    }
  });

  test('the gate is the bridge axis, traversable in both directions', () => {
    // The corridor scripts/collisionTests.ts asserts is clear, from the city
    // side up to the sand — and it is the only way through the rear wall.
    for (let z = -43; z >= -49; z -= 1) {
      expect(collidesWith(0, z, PLAYER_RADIUS, CITY_COLLIDERS), `bridge corridor (0, ${z}) blocked`).toBe(false);
    }
    const out = push(0, -25, 0, -1, 90);
    expect(out.trail.some(([x, z]) => outsideBuilding(x, z)), 'gate no longer lets the player out').toBe(true);
    const backIn = push(0, -46, 0, 1, 90);
    expect(backIn.trail.some(([x, z]) => onSand(x, z)), 'gate no longer lets the player in').toBe(true);
  });

  test('the gate is wide enough for the deck and narrower than the void it replaces', () => {
    const gateEdgeX = R_FACADE * Math.sin(GATE_ARC_HALF); // 2.7
    expect(gateEdgeX).toBeCloseTo(2.7, 3);
    expect(2 * gateEdgeX).toBeCloseTo(5.4, 2);
    // The drawbridge deck (X ±2.0, ±2.22 across its beams) passes through.
    for (const x of [-2.2, 0, 2.2]) {
      expect(collidesWith(x, -44.3, PLAYER_RADIUS, CITY_COLLIDERS), `gate corridor (${x}, −44.3)`).toBe(false);
    }
    // Just outside the gate's clear width at the same Z, there is stone.
    for (const x of [-3.2, 3.2]) {
      expect(collidesWith(x, -44.3, PLAYER_RADIUS, CITY_COLLIDERS), `rear drum missing at X = ${x}`).toBe(true);
    }
  });

  test('no push crosses the completed rear drum outside the gate', () => {
    // "Crossed" = reached past the wall's inner face (R_LINER) at an angle the
    // gate does not cover.  The wall itself is a shell, so a step-quantised
    // push can come to rest a fraction inside its outer radius; what must not
    // happen is walking through the 1.3-unit thickness and out the far side.
    const crossedDrum = (trail: Array<[number, number]>) => trail.some(([x, z]) => {
      const r = coloRadius(x, z);
      if (r >= R_LINER) return false;
      const theta = Math.atan2(x, z - COLO_ROOT_Z);
      const offGate = Math.abs(Math.atan2(Math.sin(theta - Math.PI), Math.cos(theta - Math.PI)));
      return offGate > GATE_ARC_HALF;
    });
    for (const x of [3.5, 5, 6.5, 8, 9, -3.5, -5, -6.5, -8, -9]) {
      // City side → arena: stopped by the drum short of the sand.
      const south = push(x, -46, 0, 1, 60);
      expect(crossedDrum(south.trail), `crossed the rear drum at X = ${x}`).toBe(false);
      expect(south.trail.some(([px, pz]) => onSand(px, pz)), `reached the sand at X = ${x}`).toBe(false);
      expect(coloRadius(...south.end), `stopped short of the drum at X = ${x}`).toBeGreaterThan(R_FACADE);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// H. City invariants
// ══════════════════════════════════════════════════════════════════════════

describe('H. Nothing else about the Colosseum or the city moved', () => {
  const coloIds = CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-')).map((c) => c.id).sort();

  test('the Colosseum holds its C-8.27 colliders plus the podium polyline', () => {
    const expected = [
      ...Array.from({ length: 8 }, (_, i) => `colo-wall-l-${i}`),
      ...Array.from({ length: 8 }, (_, i) => `colo-wall-r-${i}`),
      ...Array.from({ length: 8 }, (_, i) => `colo-podium-l-${i}`),
      ...Array.from({ length: 8 }, (_, i) => `colo-podium-r-${i}`),
      // Phase C-8.31 completed the drum around the rear axial gate.
      ...Array.from({ length: 2 }, (_, i) => `colo-rearwall-l-${i}`),
      ...Array.from({ length: 2 }, (_, i) => `colo-rearwall-r-${i}`),
      ...Array.from({ length: 2 }, (_, i) => `colo-rearpodium-l-${i}`),
      ...Array.from({ length: 2 }, (_, i) => `colo-rearpodium-r-${i}`),
      // Phase C-8.33 sealed the rear gate's lateral escape (one segment per
      // jamb, on the θ = π axis).  The podium polyline this suite pins — its
      // two front arcs, its cuts and its radii — is unchanged.
      'colo-gateseal-l',
      'colo-gateseal-r',
      'colo-pier-l',
      'colo-pier-r',
      'colo-flank-l',
      'colo-flank-r',
    ].sort();
    expect(coloIds).toEqual(expected);
  });

  test('the piers and the flank closures are exactly as C-8.27 left them', () => {
    expect(findRect('colo-pier-l')).toMatchObject({ cx: -3.925, cz: -9.8, hw: 2.65 / 2, hd: 3.4 / 2 });
    expect(findRect('colo-pier-r')).toMatchObject({ cx: 3.925, cz: -9.8, hw: 2.65 / 2, hd: 3.4 / 2 });
    for (const id of ['colo-flank-l', 'colo-flank-r'] as const) {
      const f = findRect(id);
      expect(f.cx).toBeCloseTo((id.endsWith('r') ? 1 : -1) * 6.6478, 3);
      expect(f.cz).toBeCloseTo(-7.7785, 3);
      expect(f.hw).toBeCloseTo(2.7956 / 2, 3);
      expect(f.hd).toBeCloseTo(0.6430 / 2, 3);
    }
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
    expect(byId('doctore-house')).toMatchObject({ cx: 28, cz: -18.875, hw: 6.0 / 2, hd: 3.75 / 2 });
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('motte-wall')).length).toBe(20);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('fortress-')).length).toBe(5);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('yard-wall')).length).toBe(14);
  });

  test('every fast-travel arrival is still clear and reachable', () => {
    for (const loc of HUB_LOCATIONS) {
      const [ax, az] = FAST_TRAVEL_ARRIVALS[loc.id];
      expect(collidesWith(ax, az, PLAYER_RADIUS, CITY_COLLIDERS), `${loc.id} arrival inside a collider`).toBe(false);
      const moved = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([dx, dz]) => {
        clearRecoveryHistory();
        const res = resolveCityMovement([ax, 0, az], dx, dz, 3.8, 0.3);
        return res[0] !== ax || res[2] !== az;
      });
      expect(moved, `${loc.id} arrival [${ax}, ${az}] is trapped`).toBe(true);
    }
  });

  test('the Colosseum hub still resolves at its arrival point', () => {
    const hub = HUB_LOCATIONS.find((l) => l.id === 'colosseum')!;
    expect([hub.position[0], hub.position[2]]).toEqual([0, -25]);
    expect(hub.radius).toBe(5.5);
    expect(FAST_TRAVEL_ARRIVALS.colosseum).toEqual([0, -23]);
    expect(getNearbyHubLocation([0, 0, -23])?.id).toBe('colosseum');
  });
});
