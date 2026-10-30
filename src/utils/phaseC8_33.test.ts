/**
 * Phase C-8.33 — Rear gate lateral escape (sealed).
 *
 * ── THE DEFECT ─────────────────────────────────────────────────────────────
 * C-8.31 completed the drum around the rear axial gate and cut the bowl on the
 * doorway's own 5.2-unit passage line, so the gate became the arena's second
 * way in and out.  The passage's *sides* were never collidable, though: the
 * registry models the facade (r 19.3) and the podium (r 15.3) as thin
 * polylines and has nothing at all in the 15.3 → 19.3 band between them — the
 * band the cavea and the arcade occupy in the render.
 *
 * Walked with the real resolver: 11 steps north from (0, −38) end at
 * (0, −42.18), r 17.18, inside the passage.  Pushing +X from there leaves the
 * passage at the eighth step — (3.04, −42.18), |X| > 2.6, past the 9.784° bowl
 * cut — and the same push runs on to (7.60, −42.18), r 18.79, where the player
 * is standing inside the rendered arcade pier (r ∈ 18.0 … 19.3 is the tier-1
 * wall band).  Everything mirrors on the west.  A −12 … +12 X sweep at
 * z = −40.5 is entirely free, i.e. the whole rear band is open ground to the
 * resolver once the player is past the podium's cut edge.
 *
 * It is a movement-boundary gap, not a mesh defect: the rendered gate is
 * exactly what C-8.31 built.  §B below replays it against a registry with the
 * two seals spliced back out (the real resolver on the real pre-fix
 * configuration) and shows it closing with them in.
 *
 * ── THE SEAL ───────────────────────────────────────────────────────────────
 * The C-8.27 remedy for the doorway's flank strip, applied to the gate: bridge
 * the strip between the two structures that already end there.  Both endpoints
 * of each seal ARE existing collider endpoints — the podium ring stops at
 * `podiumPoint(π ∓ COLO_PODIUM_GAP)` (2.600, −40.077) and the rear facade drum
 * at `coloPoint(π ∓ COLO_GATE_HALF)` (2.700, −44.110) — so no new corner and
 * no slit appears.  Two colliders total (`colo-gateseal-l` / `-r`); the render,
 * the gate's dimensions, the podium/cavea cuts and every other collider are
 * untouched.
 *
 * ── WHAT THIS SUITE ASSERTS ────────────────────────────────────────────────
 *   A. the registry: the two seals, their endpoints, and the exact delta;
 *   B. the escape, frozen — reproduced without them, gone with them;
 *   C. traversal: the gate still works both ways, wide enough for the player;
 *   D. the drawbridge deck and its side beams stay clear through the gate;
 *   E. the front portal and the C-8.27 flank closures are unchanged;
 *   F. fast-travel arrivals and the Store ↔ Workshop junction are untouched.
 *
 * Run with: bun test src/utils/phaseC8_33.test.ts
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  PLAYER_RADIUS,
  CITY_COLLIDERS,
  collidesWith,
  type RectCollider,
  type SegmentCollider,
} from './collisionShapes';
import {
  FAST_TRAVEL_ARRIVALS,
  HUB_LOCATIONS,
  clearRecoveryHistory,
  getNearbyHubLocation,
  resolveCityMovement,
} from './cityCollisions';
import { BRIDGE_HALF_WIDTH, BRIDGE_Z_OUTER } from './terrainHeight';

// ── Sources ───────────────────────────────────────────────────────────────

const load = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const coloSrc = load('../components/3d/city/GrandColosseum.tsx');
const bridgeSrc = load('../components/3d/city/Drawbridge.tsx');

function num(src: string, re: RegExp): number {
  const m = re.exec(src);
  if (!m) throw new Error(`number not found: ${re}`);
  return Number(m[1]);
}

const COLO_ROOT_Z = num(coloSrc, /<group position=\{\[0, 0, (-?[\d.]+)\]\}>\s*\{\/\* =+/);
const R_FACADE = num(coloSrc, /const R_FACADE = ([\d.]+);/);
const R_ARENA_WALL = num(coloSrc, /const R_ARENA_WALL = ([\d.]+);/);
const R_LINER = num(coloSrc, /const R_LINER = ([\d.]+);/);
const GATE_HALF_W = num(coloSrc, /const GATE_HALF_W = ([\d.]+);/);
const PORTAL_PASSAGE_HALF_W = num(coloSrc, /const PORTAL_PASSAGE_HALF_W = ([\d.]+);/);
const ENTRANCE_MIN = num(coloSrc, /const ENTRANCE_MIN = (-?[\d.]+);/);
const ENTRANCE_MAX = num(coloSrc, /const ENTRANCE_MAX = ([\d.]+);/);
const GATE_HALF = Math.asin(GATE_HALF_W / R_FACADE);          // ≈ 0.1404 rad (8.04°)
const BOWL_GAP_HALF = Math.asin(PORTAL_PASSAGE_HALF_W / R_ARENA_WALL); // ≈ 0.1716 rad (9.83°)
const BEAM_WIDTH = num(bridgeSrc, /export const BEAM_WIDTH = ([\d.]+);/);
const DECK_HALF_EXTENT = BRIDGE_HALF_WIDTH + BEAM_WIDTH / 2;  // 2.11 — deck + side beams

// ── Geometry helpers, in the collider's own convention ────────────────────

const coloPoint = (r: number, theta: number): [number, number] => [
  r * Math.sin(theta),
  r * Math.cos(theta) + COLO_ROOT_Z,
];
const facadePoint = (theta: number) => coloPoint(R_FACADE, theta);
const podiumPoint = (theta: number) => coloPoint(R_ARENA_WALL, theta);
const coloRadius = (x: number, z: number) => Math.hypot(x, z - COLO_ROOT_Z);
const deg = (rad: number) => (rad * 180) / Math.PI;
/** Angular distance of θ from π (or from 0 when `about` is 0), positive. */
const offAxis = (x: number, z: number, about: number) => {
  const t = Math.atan2(x, z - COLO_ROOT_Z) - about;
  return Math.abs(Math.atan2(Math.sin(t), Math.cos(t)));
};
const offGate = (x: number, z: number) => offAxis(x, z, Math.PI);
const offFront = (x: number, z: number) => offAxis(x, z, 0);

/** The gate passage's own two corners — what the renders cut to. */
const GATE_FACADE_EDGE = coloPoint(R_FACADE, Math.PI - GATE_HALF);       // (2.700, −44.110)
const GATE_BOWL_EDGE = podiumPoint(Math.PI - BOWL_GAP_HALF);             // (2.600, −40.077)

/** The concealed interior band: podium ring → facade, outside both passages. */
const inConcealedBand = (x: number, z: number) => {
  const r = coloRadius(x, z);
  return r > R_ARENA_WALL + 1e-6 && r < R_FACADE
    && offGate(x, z) > BOWL_GAP_HALF && offFront(x, z) > BOWL_GAP_HALF;
};
const onSand = (x: number, z: number) => coloRadius(x, z) < R_ARENA_WALL - PLAYER_RADIUS;
const outsideBuilding = (x: number, z: number) => coloRadius(x, z) > R_FACADE + PLAYER_RADIUS;

function findSeg(id: string): SegmentCollider {
  const c = CITY_COLLIDERS.find((c) => c.id === id);
  if (!c || c.type !== 'segment') throw new Error(`Segment collider '${id}' not found`);
  return c;
}
function findRect(id: string): RectCollider {
  const c = CITY_COLLIDERS.find((c) => c.id === id);
  if (!c || c.type !== 'rect') throw new Error(`Rect collider '${id}' not found`);
  return c;
}

// ── The runtime resolver, wrapped (same harness as C-8.27/28/31) ──────────

interface PushResult {
  end: [number, number];
  trail: Array<[number, number]>;
}
function push(
  startX: number, startZ: number, dx: number, dz: number,
  steps = 80, delta = 0.1,
): PushResult {
  clearRecoveryHistory();
  let pos: [number, number, number] = [startX, 0, startZ];
  const trail: Array<[number, number]> = [[startX, startZ]];
  for (let i = 0; i < steps; i++) {
    pos = resolveCityMovement(pos, dx, dz, 3.8, delta);
    trail.push([pos[0], pos[2]]);
  }
  return { end: [pos[0], pos[2]], trail };
}

/**
 * Run `fn` with the two C-8.33 gate seals spliced out of `CITY_COLLIDERS` —
 * exactly the registry the escape was reproduced against — then restore the
 * array in place.  The resolver reads that array on every call, so this drives
 * the real resolver on the real pre-fix configuration.
 */
function withoutGateSeals<T>(fn: () => T): T {
  const snapshot = CITY_COLLIDERS.slice();
  try {
    for (let i = CITY_COLLIDERS.length - 1; i >= 0; i--) {
      if (CITY_COLLIDERS[i].id.startsWith('colo-gateseal')) CITY_COLLIDERS.splice(i, 1);
    }
    return fn();
  } finally {
    CITY_COLLIDERS.length = 0;
    CITY_COLLIDERS.push(...snapshot);
  }
}

// The entry walk the reproduction uses, straight out of the measurements
// above: 11 steps north from (0, −38) land at (0, −42.18), r 17.18, mid-passage.
const entryPoint = () => push(0, -38, 0, -1, 11).end;

/**
 * Exhaustive reachability over the gate's own neighbourhood: a flood fill from
 * seeds on both sides of the passage (sand side and bridge side), using
 * realistic strides — `resolveCityMovement` with 3 × 0.19 per edge, under one
 * player diameter, so no edge can tunnel a segment pair — confined to
 * r ∈ [14, 21] and |θ − π| ≤ 0.6 rad so it stays the gate's own region.
 */
function floodGateNeighbourhood(): { cells: number; enteredBand: string | null } {
  const inWindow = (x: number, z: number) =>
    coloRadius(x, z) >= 14 && coloRadius(x, z) <= 21 && offGate(x, z) <= 0.6;
  const seeds: Array<[number, number]> = [];
  for (const x of [-2, -1, 0, 1, 2]) {
    for (const z of [-38, -40, -42, -44, -46]) {
      if (!collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS)) seeds.push([x, z]);
    }
  }
  const dirs: Array<[number, number]> = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2],
    [-Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2],
  ];
  const seen = new Set<string>();
  const queue: Array<[number, number]> = [...seeds];
  for (const [x, z] of seeds) seen.add(`${x.toFixed(1)},${z.toFixed(1)}`);
  while (queue.length) {
    const [x, z] = queue.shift()!;
    if (inConcealedBand(x, z)) return { cells: seen.size, enteredBand: `(${x.toFixed(2)}, ${z.toFixed(2)})` };
    for (const [dx, dz] of dirs) {
      clearRecoveryHistory();
      let p: [number, number, number] = [x, 0, z];
      for (let i = 0; i < 3; i++) p = resolveCityMovement(p, dx, dz, 3.8, 0.05);
      const nx = p[0];
      const nz = p[2];
      if (!inWindow(nx, nz)) continue;
      const key = `${nx.toFixed(1)},${nz.toFixed(1)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push([nx, nz]);
    }
  }
  return { cells: seen.size, enteredBand: null };
}

// ══════════════════════════════════════════════════════════════════════════
// A. The registry
// ══════════════════════════════════════════════════════════════════════════

describe('A. Two lateral seals, drawn from the gate\'s own cut faces', () => {
  test('both seals exist, one per jamb, mirrored in X', () => {
    const east = findSeg('colo-gateseal-r');
    const west = findSeg('colo-gateseal-l');
    expect(east.id).toBe('colo-gateseal-r');
    expect(west.id).toBe('colo-gateseal-l');
    // The east seal runs from the facade jamb in to the bowl cut edge…
    expect(east.x1).toBeCloseTo(GATE_FACADE_EDGE[0], 10);
    expect(east.z1).toBeCloseTo(GATE_FACADE_EDGE[1], 10);
    expect(east.x2).toBeCloseTo(GATE_BOWL_EDGE[0], 10);
    expect(east.z2).toBeCloseTo(GATE_BOWL_EDGE[1], 10);
    // …and the west one is its exact mirror.
    expect(west.x1).toBeCloseTo(-east.x1, 10);
    expect(west.z1).toBeCloseTo(east.z1, 10);
    expect(west.x2).toBeCloseTo(-east.x2, 10);
    expect(west.z2).toBeCloseTo(east.z2, 10);
  });

  test('their endpoints are exactly the existing cut-face endpoints — no slit', () => {
    // The podium ring's last east segment ends on the bowl cut edge…
    const podiumR = CITY_COLLIDERS.filter(
      (c): c is SegmentCollider => c.type === 'segment' && c.id.startsWith('colo-rearpodium-r'),
    );
    const podiumEnd = podiumR[podiumR.length - 1];
    expect(podiumEnd.x2).toBeCloseTo(GATE_BOWL_EDGE[0], 10);
    expect(podiumEnd.z2).toBeCloseTo(GATE_BOWL_EDGE[1], 10);
    expect(findSeg('colo-gateseal-r').x2).toBeCloseTo(podiumEnd.x2, 10);
    expect(findSeg('colo-gateseal-r').z2).toBeCloseTo(podiumEnd.z2, 10);

    // …and the rear facade drum's last east segment ends on the gate jamb.
    const wallR = CITY_COLLIDERS.filter(
      (c): c is SegmentCollider => c.type === 'segment' && c.id.startsWith('colo-rearwall-r'),
    );
    const wallEnd = wallR[wallR.length - 1];
    expect(wallEnd.x2).toBeCloseTo(GATE_FACADE_EDGE[0], 10);
    expect(wallEnd.z2).toBeCloseTo(GATE_FACADE_EDGE[1], 10);
    expect(findSeg('colo-gateseal-r').x1).toBeCloseTo(wallEnd.x2, 10);
    expect(findSeg('colo-gateseal-r').z1).toBeCloseTo(wallEnd.z2, 10);

    // Same on the west, where the seals start on the drum and end on the podium.
    const podiumL = CITY_COLLIDERS.filter(
      (c): c is SegmentCollider => c.type === 'segment' && c.id.startsWith('colo-rearpodium-l'),
    );
    expect(podiumL[0].x1).toBeCloseTo(-GATE_BOWL_EDGE[0], 10);
    expect(podiumL[0].z1).toBeCloseTo(GATE_BOWL_EDGE[1], 10);
    const wallL = CITY_COLLIDERS.filter(
      (c): c is SegmentCollider => c.type === 'segment' && c.id.startsWith('colo-rearwall-l'),
    );
    expect(wallL[0].x1).toBeCloseTo(-GATE_FACADE_EDGE[0], 10);
    expect(wallL[0].z1).toBeCloseTo(GATE_FACADE_EDGE[1], 10);
    expect(findSeg('colo-gateseal-l').x1).toBeCloseTo(wallL[0].x1, 10);
    expect(findSeg('colo-gateseal-l').x2).toBeCloseTo(podiumL[0].x1, 10);
  });

  test('the seals are the only colliders this phase adds, and every id is intact', () => {
    // Exactly two new ids, and they are the seals.
    const sealIds = CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-gateseal')).map((c) => c.id).sort();
    expect(sealIds).toEqual(['colo-gateseal-l', 'colo-gateseal-r']);
    // The whole Colosseum set: the C-8.31 forty-four plus these two.
    const coloIds = CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-')).map((c) => c.id).sort();
    expect(coloIds.length).toBe(46);
    const expected = [
      ...Array.from({ length: 8 }, (_, i) => `colo-wall-l-${i}`),
      ...Array.from({ length: 8 }, (_, i) => `colo-wall-r-${i}`),
      ...Array.from({ length: 8 }, (_, i) => `colo-podium-l-${i}`),
      ...Array.from({ length: 8 }, (_, i) => `colo-podium-r-${i}`),
      ...Array.from({ length: 2 }, (_, i) => `colo-rearwall-l-${i}`),
      ...Array.from({ length: 2 }, (_, i) => `colo-rearwall-r-${i}`),
      ...Array.from({ length: 2 }, (_, i) => `colo-rearpodium-l-${i}`),
      ...Array.from({ length: 2 }, (_, i) => `colo-rearpodium-r-${i}`),
      'colo-pier-l',
      'colo-pier-r',
      'colo-flank-l',
      'colo-flank-r',
      'colo-gateseal-l',
      'colo-gateseal-r',
    ].sort();
    expect(coloIds).toEqual(expected);
  });

  test('nothing else in the registry changed', () => {
    const noSeals = withoutGateSeals(() => CITY_COLLIDERS.map((c) => c.id).sort());
    const withSeals = CITY_COLLIDERS.map((c) => c.id).sort();
    // The shipped registry is the pre-fix one plus exactly the two seals.
    expect(withSeals.filter((id) => !id.startsWith('colo-gateseal'))).toEqual(noSeals);
    expect(withSeals.length).toBe(noSeals.length + 2);
    // The gate's own stone is untouched: the rear quadrants still end where
    // C-8.31 put them and each is still two segments on its rendered radius.
    expect(withoutGateSeals(() => CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-')).length)).toBe(44);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The escape, frozen
// ══════════════════════════════════════════════════════════════════════════

describe('B. The lateral escape reproduces without the seals and is closed with them', () => {
  test('the passage really is entered (the reproduction starts where the audit did)', () => {
    const p = entryPoint();
    expect(p[0]).toBeCloseTo(0, 10);
    expect(p[1]).toBeCloseTo(-42.18, 6);
    expect(coloRadius(p[0], p[1])).toBeCloseTo(17.18, 1);
    expect(inConcealedBand(p[0], p[1])).toBe(false); // still in the passage
    expect(offGate(p[0], p[1])).toBeLessThan(BOWL_GAP_HALF);
  });

  test('WITHOUT the seals the player leaves the passage into the concealed band', () => {
    const [px, pz] = entryPoint();
    for (const side of [1, -1] as const) {
      const { end, trail } = withoutGateSeals(() => push(px, pz, side, 0, 200, 0.02));
      // The eighth-ish step already carries the player past the bowl cut…
      const firstBand = trail.findIndex(([x, z]) => inConcealedBand(x, z));
      expect(firstBand, `side ${side} never entered the band`).toBeGreaterThan(0);
      // …and the push runs on deep into the facade wall band (r 18.0 … 19.3),
      // exactly the C-8.28 symptom: standing inside the rendered stone.
      expect(inConcealedBand(end[0], end[1])).toBe(true);
      expect(coloRadius(end[0], end[1])).toBeGreaterThan(R_LINER);
      expect(Math.abs(end[0])).toBeGreaterThan(GATE_HALF_W);
      expect(Math.abs(Math.abs(end[0]) - 7.6)).toBeLessThan(0.4); // the audit's resting |X|
    }
  });

  test('WITH the seals the same push never leaves the passage', () => {
    const [px, pz] = entryPoint();
    for (const side of [1, -1] as const) {
      const { end, trail } = push(px, pz, side, 0, 200, 0.02);
      expect(trail.some(([x, z]) => inConcealedBand(x, z)), `side ${side} escaped`).toBe(false);
      // It stops on the seal: the full-jamb push no longer reaches |X| = 2.6,
      // and the player is still inside the passage the whole way.
      expect(Math.abs(end[0])).toBeLessThan(2.4);
      expect(Math.abs(end[0])).toBeGreaterThan(2.0);
      expect(offGate(end[0], end[1])).toBeLessThan(BOWL_GAP_HALF);
      expect(coloRadius(end[0], end[1])).toBeLessThan(R_LINER);
    }
  });

  test('no straight or diagonal push out of the passage reaches the band', () => {
    const [px, pz] = entryPoint();
    for (const dx of [1, -1] as const) {
      for (const dz of [1, -1] as const) {
        const { trail } = push(px, pz, dx, dz, 200, 0.02);
        expect(trail.some(([x, z]) => inConcealedBand(x, z)), `dir (${dx}, ${dz})`).toBe(false);
      }
    }
  });

  test('an exhaustive walk of the gate neighbourhood never reaches the band', () => {
    // Not just the pushes above: every cell of the gate's own neighbourhood
    // that is walkable with realistic strides, entered from seeds on both
    // sides of the passage.
    const { cells, enteredBand } = floodGateNeighbourhood();
    expect(cells, 'the flood explored far too little to be meaningful').toBeGreaterThan(2000);
    expect(enteredBand).toBeNull();
  });

  test('…and the same exhaustive walk does reach it once the seals are removed', () => {
    const { enteredBand } = withoutGateSeals(() => floodGateNeighbourhood());
    expect(enteredBand).not.toBeNull();
  });

  test('walking in from the sand and from the bridge cannot reach the band either', () => {
    // From the sand, every approach angle that a player could steer.
    for (const x of [0, 1, 2, 2.4, -1, -2, -2.4]) {
      for (const dx of [-1, 0, 1] as const) {
        const { trail } = push(x, -30, dx, -1, 120, 0.05);
        expect(trail.some(([cx, cz]) => inConcealedBand(cx, cz)), `from sand (${x}, dir ${dx})`).toBe(false);
      }
    }
    // From the drawbridge, walking south into the gate and leaning sideways.
    for (const x of [0, 1, 2, 2.4, -1, -2, -2.4]) {
      for (const dx of [-1, 0, 1] as const) {
        const { trail } = push(x, -47, dx, 1, 120, 0.05);
        expect(trail.some(([cx, cz]) => inConcealedBand(cx, cz)), `from bridge (${x}, dir ${dx})`).toBe(false);
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. The gate still works
// ══════════════════════════════════════════════════════════════════════════

describe('C. The gate still admits the player, both ways', () => {
  test('sand → city, through the gate, for the whole usable width', () => {
    for (const x of [-2.0, -1.5, -0.75, 0, 0.75, 1.5, 2.0]) {
      const out = push(x, -30, 0, -1, 80);
      expect(out.trail.some(([px2, pz2]) => outsideBuilding(px2, pz2)), `exit at X = ${x}`).toBe(true);
      expect(out.end[1]).toBeLessThan(-45);
    }
  });

  test('city → sand, back through the gate', () => {
    for (const x of [-2.0, -1.5, -0.75, 0, 0.75, 1.5, 2.0]) {
      const backIn = push(x, -44.2, 0, 1, 80);
      expect(backIn.trail.some(([px2, pz2]) => onSand(px2, pz2)), `entry at X = ${x}`).toBe(true);
    }
  });

  test('the passage stays clear across the whole 1.3-unit wall thickness', () => {
    for (const r of [R_ARENA_WALL, (R_ARENA_WALL + R_FACADE) / 2, R_LINER, R_FACADE]) {
      for (const x of [-2.0, -1.0, 0, 1.0, 2.0]) {
        const z = COLO_ROOT_Z - Math.sqrt(Math.max(r * r - x * x, 0));
        expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS), `gate blocked at r=${r}, X=${x}`).toBe(false);
      }
    }
  });

  test('the passage is wide enough for the player at every depth', () => {
    for (let z = -40.25; z >= -44.25; z -= 0.25) {
      let firstBlockedEast: number | null = null;
      let firstBlockedWest: number | null = null;
      for (let x = 0; x <= 6; x += 0.01) {
        if (firstBlockedEast === null && collidesWith(Number(x.toFixed(3)), z, PLAYER_RADIUS, CITY_COLLIDERS)) {
          firstBlockedEast = Number(x.toFixed(3));
        }
        if (firstBlockedWest === null && collidesWith(Number((-x).toFixed(3)), z, PLAYER_RADIUS, CITY_COLLIDERS)) {
          firstBlockedWest = Number((-x).toFixed(3));
        }
      }
      // Every pushable centre within this half-width clears the stone — and it
      // is wider than the deck and its side beams together (±2.11), so the
      // whole crossing stays walkable.
      expect(firstBlockedEast, `east edge at z=${z}`).toBeGreaterThan(DECK_HALF_EXTENT + 0.05);
      expect(firstBlockedWest, `west edge at z=${z}`).toBeLessThan(-(DECK_HALF_EXTENT + 0.05));
    }
  });

  test('the seals do not touch the doorway, the piers or the bowls of the passages', () => {
    // Every collider the seals are made of is on the gate axis, well away
    // from the front portal: their Z span is the gate's own.
    for (const id of ['colo-gateseal-l', 'colo-gateseal-r'] as const) {
      const s = findSeg(id);
      // Both seals are laid out facade jamb → bowl edge, so the larger Z is
      // the bowl cut edge and the smaller is the facade gate jamb.
      expect(Math.max(s.z1, s.z2)).toBeCloseTo(GATE_BOWL_EDGE[1], 6);
      expect(Math.min(s.z1, s.z2)).toBeCloseTo(GATE_FACADE_EDGE[1], 6);
      expect(Math.abs(s.x1)).toBeGreaterThan(PORTAL_PASSAGE_HALF_W);
      // …and the two seals sit on opposite sides of the gate axis.
      expect(Math.sign(s.x1)).toBe(id.endsWith('-r') ? 1 : -1);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. The drawbridge route
// ══════════════════════════════════════════════════════════════════════════

describe('D. The drawbridge route stays clear in both directions', () => {
  test('the deck corridor and both side beams are collision-free', () => {
    for (let z = BRIDGE_Z_OUTER; z >= -46.5; z -= 0.25) {
      for (const x of [0, -BRIDGE_HALF_WIDTH, BRIDGE_HALF_WIDTH, -DECK_HALF_EXTENT, DECK_HALF_EXTENT]) {
        expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS), `deck blocked at (${x}, ${z.toFixed(2)})`).toBe(false);
      }
    }
  });

  test('sand → motte in one straight walk, and back', () => {
    const out = push(0, -30, 0, -1, 120);
    expect(out.end[1]).toBeLessThan(-48);
    expect(Math.abs(out.end[0])).toBeLessThan(PLAYER_RADIUS);
    const back = push(0, -49, 0, 1, 120);
    expect(back.end[1]).toBeGreaterThan(-40);
    expect(back.trail.some(([x, z]) => onSand(x, z))).toBe(true);
  });

  test('the deck edge the seal comes closest to still clears the player radius', () => {
    // The tightest approach between a seal and the deck's own outer edge.
    let closest = Infinity;
    for (const id of ['colo-gateseal-l', 'colo-gateseal-r'] as const) {
      const s = findSeg(id);
      for (const sign of [-1, 1] as const) {
        for (let z = Math.max(s.z1, s.z2); z >= Math.min(s.z1, s.z2); z -= 0.01) {
          const t = (z - s.z1) / (s.z2 - s.z1);
          const sx = s.x1 + t * (s.x2 - s.x1);
          const px2 = sign * DECK_HALF_EXTENT;
          closest = Math.min(closest, Math.abs(sx - px2));
        }
      }
    }
    expect(closest).toBeGreaterThan(PLAYER_RADIUS + 0.05);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. The front portal is untouched
// ══════════════════════════════════════════════════════════════════════════

describe('E. The front portal and the C-8.27 closures are exactly as they were', () => {
  test('the piers and both flank closures keep their C-8.27 geometry', () => {
    expect(findRect('colo-pier-l')).toMatchObject({ cx: -3.925, cz: -9.8, hw: 2.65 / 2, hd: 3.4 / 2 });
    expect(findRect('colo-pier-r')).toMatchObject({ cx: 3.925, cz: -9.8, hw: 2.65 / 2, hd: 3.4 / 2 });
    const flankR = findRect('colo-flank-r');
    const flankL = findRect('colo-flank-l');
    expect(flankR.cx).toBeCloseTo(6.6478, 3);
    expect(flankR.cz).toBeCloseTo(-7.7785, 3);
    expect(flankL.cx).toBeCloseTo(-6.6478, 3);
    expect(flankL.cz).toBeCloseTo(-7.7785, 3);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-flank')).length).toBe(2);
  });

  test('the courtyard doorway is still collision-free right through the bowl', () => {
    for (const x of [-2.0, -1.0, 0, 1.0, 2.0]) {
      // Sample starts at z = -4.5, not -4.0: the plaza fountain was replaced with the
      // 8 m-diameter imperial fountain (base radius 4.0, was 3.6), so its blocked edge
      // moved 0.4 north and the old -4.0 samples now sit inside its own footprint.
      // The doorway corridor itself is unchanged and still 1.3 m of clear walking
      // between that edge (-4.4) and the portal face (-5.7).
      for (const z of [-4.5, -6.5, -7.5, -9.925, -12.0, -16.0]) {
        expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS), `doorway (${x}, ${z})`).toBe(false);
      }
    }
  });

  test('the doorway bay is still a designed opening, not a wall', () => {
    // A radial walk out from the sand escapes on the doorway (θ = 0)…
    const out = push(0, COLO_ROOT_Z, 0, 1, 60);
    expect(out.trail.some(([x, z]) => outsideBuilding(x, z))).toBe(true);
    // …and the front facade is still open across its own ±ENTRANCE span.
    for (const d of [-20, -10, 0, 10, 20]) {
      const theta = (d * Math.PI) / 180;
      const [x, z] = facadePoint(theta);
      expect(theta).toBeGreaterThan(ENTRANCE_MIN);
      expect(theta).toBeLessThan(ENTRANCE_MAX);
      expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS), `doorway facade at ${d}°`).toBe(false);
    }
  });

  test('the front flanks are still sealed against the C-8.27 bypass', () => {
    // Any column through the portal-wall band (|X| ≥ 2.25) is blocked from
    // Z = −6.5 to Z = −9.5 — the strip C-8.27 closed.
    for (let x = 2.25; x <= 9.0; x += 0.25) {
      let sealed = false;
      for (let z = -6.5; z >= -9.5; z -= 0.025) {
        if (collidesWith(Number(x.toFixed(3)), z, PLAYER_RADIUS, CITY_COLLIDERS)) { sealed = true; break; }
      }
      expect(sealed, `column X = ${x.toFixed(2)} is open`).toBe(true);
    }
  });

  test('the seals are nowhere near the front portal', () => {
    for (const id of ['colo-gateseal-l', 'colo-gateseal-r'] as const) {
      const s = findSeg(id);
      // Both endpoints are on the gate, θ = π; the doorway is at θ = 0.
      expect(offGate(s.x1, s.z1)).toBeLessThan(GATE_HALF + 1e-9);
      expect(offGate(s.x2, s.z2)).toBeLessThan(BOWL_GAP_HALF + 1e-9);
      expect(s.z1).toBeLessThan(-40);
      expect(s.z2).toBeLessThan(-40);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. Unrelated invariants
// ══════════════════════════════════════════════════════════════════════════

describe('F. Arrivals and the Store ↔ Workshop junction are untouched', () => {
  test('every fast-travel arrival stays clear and usable', () => {
    for (const loc of HUB_LOCATIONS) {
      const [ax, az] = FAST_TRAVEL_ARRIVALS[loc.id];
      expect(collidesWith(ax, az, PLAYER_RADIUS, CITY_COLLIDERS), `${loc.id} arrival inside a collider`).toBe(false);
      const moved = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([dx, dz]) => {
        clearRecoveryHistory();
        const res = resolveCityMovement([ax, 0, az], dx, dz, 3.8, 0.3);
        return res[0] !== ax || res[2] !== az;
      });
      expect(moved, `${loc.id} arrival is trapped`).toBe(true);
    }
    expect(getNearbyHubLocation([0, 0, -23])?.id).toBe('colosseum');
  });

  test('the arena remains reachable and the Colosseum hub still detects', () => {
    const arrival = FAST_TRAVEL_ARRIVALS.colosseum; // [0, −23] — on the sand
    expect(coloRadius(arrival[0], arrival[1])).toBeLessThan(R_ARENA_WALL - PLAYER_RADIUS);
    const out = push(arrival[0], arrival[1], 0, -1, 60);
    expect(out.trail.some(([x, z]) => outsideBuilding(x, z))).toBe(true);
  });

  test('the General Store and the Armor & Leather Workshop keep their C-8.29 geometry', () => {
    expect(findRect('general-store')).toMatchObject({ cx: 22, cz: -5, hw: 3.85, hd: 3.15 });
    expect(findRect('armor-workshop')).toMatchObject({ cx: 28.2, cz: 1.15, hw: 4.45, hd: 2.85 });
    // The measured 0.150 plinth-to-plinth gap is still a dead pocket: neither
    // rect's own band is reachable, and the two do not overlap in Z.
    const gs = findRect('general-store');
    const shop = findRect('armor-workshop');
    expect((shop.cz - shop.hd) - (gs.cz + gs.hd)).toBeCloseTo(0.15, 6);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('motte-wall')).length).toBe(20);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('fortress-')).length).toBe(5);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('yard-wall')).length).toBe(14);
  });
});
