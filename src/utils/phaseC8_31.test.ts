/**
 * Phase C-8.31 — the Colosseum rear axial gate.
 *
 * ── THE DEFECT ─────────────────────────────────────────────────────────────
 * The Colosseum exterior was a 306° partial cylinder (ARC_THETA_START = −0.85π,
 * ARC_THETA_LENGTH = 1.7π): a 54.0° void centred on θ = π (−Z), the axis the
 * Northern Motte's drawbridge runs along.  The C-8.28 phase measured it, found
 * that nothing rendered and nothing collided inside it — the player could walk
 * in and out of the arena around the north side of the building — and, because
 * closing it as-is would have taken a ~10-unit invisible blocker on bare
 * ground, documented it and left it alone (phaseC8_28.test.ts §G).
 *
 * ── THE CHANGE ─────────────────────────────────────────────────────────────
 * The drum is complete now, and it is cut at exactly two places — the two
 * axial openings, both of which sit on the seam between its two arcs:
 *
 *   • the monumental entrance, θ = 0   — ENTRANCE_MIN … ENTRANCE_MAX, 49.26°,
 *     the portal and its 5.2-wide passage, untouched by this phase;
 *   • the rear axial gate,   θ = π     — ±GATE_HALF = ±8.03°, i.e. 16.08°
 *     (5.40 units wide at the facade) on the drawbridge axis.
 *
 * Every band still draws as two meshes (`DRUM_ARCS`) or one (`FRONT_CUT_ARCS`,
 * `GATE_CUT_ARCS`, `FULL_TURN`), so the mesh — and draw-call — count is exactly
 * what it was for a 306° partial cylinder.
 *
 * The gate spans tier 1 only: its clear opening runs from the plinth's top
 * (0.16) to the spandrel band's bottom (7.35), the spandrel band closes its
 * head and the tier-1 cornice (7.8 … 8.6) spans it as its lintel, and tier 2
 * and the attic above are continuous — the real building has no rear notch in
 * its upper storeys.  The arch arcade tiles each arc with 9 bays that end flush
 * with each opening's jamb face, so no bay hangs over either opening.
 *
 * Inside, the bowl (podium + both seating frustums) is cut at both openings on
 * the portal's own 5.2-unit passage line — the same cut C-8.28 made at the
 * doorway, mirrored at the gate — so the bridge axis is the arena's second way
 * in and out.  In collisionShapes.ts the two original 8-segment facade arcs and
 * the two original 8-segment podium arcs are UNCHANGED (same ids, same
 * endpoints, same subdivision, so every measured clearance in the other suites
 * still holds) and the rear quadrants are appended beside them:
 * `colo-rearwall-l/r-0…1` on the facade radius and `colo-rearpodium-l/r-0…1` on
 * the podium radius, each ending on its own gate edge.
 *
 * ── WHAT THIS SUITE ASSERTS ────────────────────────────────────────────────
 *   A. the rendered drum: complete, cut at both openings, bands unchanged in
 *      count; the arcade tiles the arcs exactly;
 *   B. the gate's own geometry, its head and lintel, and that the drawbridge
 *      deck passes through it;
 *   C. the collision registry: the rear drum matches the rendered stone and
 *      both openings are cut where the render cuts them;
 *   D. traversal: the gate works both ways, the bridge corridor to the fortress
 *      is clear, and nothing crosses the drum anywhere else;
 *   E. the drawbridge's own measured placement against the gate;
 *   F. invariants: the entrance, the piers, the C-8.27 closures and every
 *      unrelated collider are exactly as they were.
 *
 * Run with: bun test src/utils/phaseC8_31.test.ts
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
  getNearbyHubLocation,
  clearRecoveryHistory,
  resolveCityMovement,
} from './cityCollisions';
import { BRIDGE_HALF_WIDTH, BRIDGE_Z_INNER, BRIDGE_Z_OUTER } from './terrainHeight';

// ── Sources ───────────────────────────────────────────────────────────────

const load = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const coloSrc = load('../components/3d/city/GrandColosseum.tsx');
const bridgeSrc = load('../components/3d/city/Drawbridge.tsx');

// ── Tiny parsers (same style as the C-8.18 … C-8.28 suites) ───────────────

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
    (c): c is SegmentCollider =>
      c.type === 'segment' && c.id.startsWith(prefix) && !c.id.slice(prefix.length + 1).includes('-'),
  );
}
/** The bodies of every `{<mapCall>.map(…)` band in the component source. */
function bandBlocks(mapCall: string): string[] {
  return all(coloSrc, new RegExp(`\\{${mapCall}\\.map\\(([\\s\\S]*?)\\)\\)`, 'g')).map((m) => m[1]);
}
/** How many of those bodies render `needle`. */
function bandsDrivenBy(mapCall: string, needle: string): number {
  return bandBlocks(mapCall).filter((b) => b.includes(needle)).length;
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
const SILL_TOP = num(coloSrc, /const SILL_TOP = ([\d.]+);/);
const ARCH_R = num(coloSrc, /const ARCH_R = ([\d.]+);/);
const ARCH_SPRING = num(coloSrc, /const ARCH_SPRING = ([\d.]+);/);
const SPANDREL_TOP = num(coloSrc, /const SPANDREL_TOP = ([\d.]+);/);
const T1_CORNICE_Y = num(coloSrc, /const T1_CORNICE_Y = ([\d.]+);/);
const T1_CORNICE_H = num(coloSrc, /const T1_CORNICE_H = ([\d.]+);/);
const T2_BOTTOM = num(coloSrc, /const T2_BOTTOM = ([\d.]+);/);
const BAYS_PER_SIDE = num(coloSrc, /const BAYS_PER_SIDE = (\d+);/);
const R_WALL_MID = (R_FACADE + R_LINER) / 2;
const SPANDREL_BOTTOM = ARCH_SPRING + ARCH_R; // 7.35 — the arch crown

/** Phase C-8.31 — the gate, and the drum's two arcs around it. */
const GATE_HALF_W = num(coloSrc, /const GATE_HALF_W = ([\d.]+);/);
const GATE_HALF = Math.asin(GATE_HALF_W / R_FACADE);
const DRUM_E_START = ENTRANCE_MAX;
const DRUM_E_END = Math.PI - GATE_HALF;
const DRUM_W_START = Math.PI + GATE_HALF;
const DRUM_W_END = 2 * Math.PI + ENTRANCE_MIN;
const REAR_SEAM = Math.PI * 0.85; // where the pre-C-8.31 306° arc ended

/** Phase C-8.28 — the passage both openings are cut on inside. */
const PORTAL_PASSAGE_HALF_W = num(coloSrc, /const PORTAL_PASSAGE_HALF_W = ([\d.]+);/);
const BOWL_GAP_HALF = Math.asin(PORTAL_PASSAGE_HALF_W / R_ARENA_WALL);

/** The 9-bay arcade: pitch from the arc it tiles, jambs flush with its ends. */
const BAY_PITCH = (DRUM_E_END - DRUM_E_START) / BAYS_PER_SIDE;
const JAMB_W = (BAY_PITCH * R_WALL_MID - 2 * ARCH_R) / 2;
const JAMB_OFFSET = (ARCH_R + JAMB_W / 2) / R_WALL_MID;

/** The drawbridge deck, read from its own source. */
const DECK_TOP_Y = num(bridgeSrc, /export const DECK_TOP_Y = ([\d.]+);/);
const BEAM_WIDTH = num(bridgeSrc, /export const BEAM_WIDTH = ([\d.]+);/);
const DECK_HALF_EXTENT = BRIDGE_HALF_WIDTH + BEAM_WIDTH / 2; // 2.11 — deck + beams
const DECK_Z_MOTTE = BRIDGE_Z_INNER - 0.5; // −46.5, the plank's own north end

// ── Geometry helpers, in the collider's own convention ────────────────────

const coloPoint = (r: number, theta: number): [number, number] => [
  r * Math.sin(theta),
  r * Math.cos(theta) + COLO_ROOT_Z,
];
const coloRadius = (x: number, z: number) => Math.hypot(x, z - COLO_ROOT_Z);
/** Angular distance from θ = π, positive and unwrapped. */
const offGate = (x: number, z: number) => {
  const theta = Math.atan2(x, z - COLO_ROOT_Z);
  return Math.abs(Math.atan2(Math.sin(theta - Math.PI), Math.cos(theta - Math.PI)));
};
const deg = (rad: number) => (rad * 180) / Math.PI;
const facadePoint = (theta: number) => coloPoint(R_FACADE, theta);
const podiumPoint = (theta: number) => coloPoint(R_ARENA_WALL, theta);
/** Is θ inside the entrance bay (θ ∈ ±ENTRANCE_MAX)? */
const inEntrance = (theta: number) => Math.abs(theta) < ENTRANCE_MAX;
/** Angular distance of θ from π, positive and unwrapped (0 … π). */
const offPi = (theta: number) =>
  Math.abs(Math.atan2(Math.sin(theta - Math.PI), Math.cos(theta - Math.PI)));
/** Is θ inside the gate (±GATE_HALF about π)? */
const inGate = (theta: number) => offPi(theta) < GATE_HALF;

// ── The runtime resolver, wrapped (same harness as the C-8.27/28 suites) ──

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
const onSand = (x: number, z: number) => coloRadius(x, z) < 15.0 - PLAYER_RADIUS;
const outsideBuilding = (x: number, z: number) => coloRadius(x, z) > R_FACADE + PLAYER_RADIUS;

// ══════════════════════════════════════════════════════════════════════════
// A. The rendered drum
// ══════════════════════════════════════════════════════════════════════════

describe('A. The drum is complete and cut at exactly two openings', () => {
  test('the 306° partial cylinder is gone', () => {
    // The old constants and the render-cost gap they encoded.
    expect(coloSrc).not.toContain('ARC_THETA_START');
    expect(coloSrc).not.toContain('ARC_THETA_LENGTH');
    expect(coloSrc).not.toContain('ARC_END');
    expect(coloSrc).not.toContain('BOWL_SEG1_LEN');
    // …replaced by the drum's two arcs and its two openings.
    expect(coloSrc).toContain('const GATE_HALF_W = 2.7;');
    expect(coloSrc).toContain('const GATE_HALF = Math.asin(GATE_HALF_W / R_FACADE);');
    expect(coloSrc).toContain('const DRUM_E_END = Math.PI - GATE_HALF;');
    expect(coloSrc).toContain('const DRUM_W_END = 2 * Math.PI + ENTRANCE_MIN;');
    expect(GATE_HALF_W).toBe(2.7);
    expect(GATE_HALF).toBeCloseTo(Math.asin(2.7 / 19.3), 10);
  });

  test('the two arcs carry the drum, and both openings sit on their seam', () => {
    // East arc: entrance → gate.  West arc: gate → back to the entrance.
    expect(DRUM_E_START).toBe(ENTRANCE_MAX);
    expect(DRUM_E_END).toBeCloseTo(Math.PI - GATE_HALF, 10);
    expect(DRUM_W_START).toBeCloseTo(Math.PI + GATE_HALF, 10);
    expect(DRUM_W_END).toBeCloseTo(2 * Math.PI + ENTRANCE_MIN, 10);
    // Equal length, so the two openings are mirror images about θ = π: the
    // west arc's own endpoints reflect onto the east arc's.
    expect(DRUM_E_END - DRUM_E_START).toBeCloseTo(DRUM_W_END - DRUM_W_START, 10);
    expect(2 * Math.PI - DRUM_W_START).toBeCloseTo(DRUM_E_END, 10);
    expect(2 * Math.PI - DRUM_W_END).toBeCloseTo(DRUM_E_START, 10);
    // The west arc wraps past 2π, so it ends back on the entrance's own edge.
    expect(DRUM_W_END - 2 * Math.PI).toBeCloseTo(ENTRANCE_MIN, 10);
    // Together they span the whole turn bar the two openings.
    const covered = DRUM_E_END - DRUM_E_START + (DRUM_W_END - DRUM_W_START);
    expect(covered).toBeCloseTo(2 * Math.PI - (ENTRANCE_MAX - ENTRANCE_MIN) - 2 * GATE_HALF, 10);
  });

  test('every band is still one or two meshes — the draw-call count is unchanged', () => {
    // Two bands are cut at both openings: the upper plinth ring and the sill.
    expect(bandBlocks('DRUM_ARCS').length).toBe(2);
    expect(bandsDrivenBy('DRUM_ARCS', '[19.0, 19.2, 0.16')).toBe(1);
    expect(bandsDrivenBy('DRUM_ARCS', '[R_FACADE, R_FACADE, SILL_TOP - 0.3')).toBe(1);

    // …so are the three interior bowl bands (each on its own passage cut).
    expect(bandBlocks('BOWL_ARCS').length).toBe(3);
    expect(bandsDrivenBy('BOWL_ARCS', '[R_ARENA_WALL, R_ARENA_WALL, 1.2')).toBe(1);
    expect(bandsDrivenBy('BOWL_ARCS', '[SEATING_T1_R_OUT, R_ARENA_WALL, 2.5')).toBe(1);
    expect(bandsDrivenBy('BOWL_ARCS', '[SEATING_T2_R_OUT, SEATING_T1_R_OUT, 2.5')).toBe(1);

    // Six bands stop at the entrance only — they run straight over the gate,
    // whose head, lintel ledge, tier-2 drum and window ceiling they are.
    const front = bandBlocks('FRONT_CUT_ARCS');
    expect(front.length).toBe(6);
    for (const needle of [
      'SPANDREL_TOP - SPANDREL_BOTTOM',
      '[T1_CORNICE_R, T1_CORNICE_R, T1_CORNICE_H',
      '<FlatArcRing key={`t1-ledge',
      '[R_LINER_T2, R_LINER_T2',
      '[R_FACADE_T2, R_FACADE_T2, T2_SILL_TOP - T2_BOTTOM',
      '<FlatArcRing key={`t2-window-ceiling',
    ]) {
      const hits = front.filter((b) => b.includes(needle)).length;
      expect(hits, needle).toBe(1);
    }

    // The flared base ring is cut at the gate only (it still runs under the
    // front entrance steps), and the three bands above the gate's lintel are
    // complete rings — one mesh each, as they always were.
    expect(all(coloSrc, /GATE_ARC_START, GATE_ARC_LEN/g).length).toBe(1);
    expect(all(coloSrc, /, 0, FULL_TURN\]/g).length).toBe(3);

    // No band survives from the old 306° build.
    expect(all(coloSrc, /ARC_THETA_START, ARC_THETA_LENGTH/g).length).toBe(0);
    expect(coloSrc).not.toContain('seg1Len');
    expect(coloSrc).not.toContain('seg2Len');
  });

  test('the arcade tiles each arc with 9 bays that end flush with the openings', () => {
    expect(BAYS_PER_SIDE).toBe(9);
    expect(coloSrc).toContain('const BAY_PITCH = (DRUM_E_END - DRUM_E_START) / BAYS_PER_SIDE;');

    // Rebuild the angle list exactly as the component does.
    const angles: number[] = [];
    for (let i = 0; i < BAYS_PER_SIDE; i++) angles.push(DRUM_E_START + (i + 0.5) * BAY_PITCH);
    for (let i = 0; i < BAYS_PER_SIDE; i++) angles.push(DRUM_W_START + (i + 0.5) * BAY_PITCH);
    expect(angles.length).toBe(18);

    // Each arc is tiled edge to edge: bay i spans centre ± pitch/2, and the
    // outermost jambs land exactly on the arc's own ends.
    for (let i = 0; i < BAYS_PER_SIDE; i++) {
      expect(angles[i] - BAY_PITCH / 2, `east bay ${i} overshoots`).toBeGreaterThanOrEqual(DRUM_E_START - 1e-12);
      expect(angles[i] + BAY_PITCH / 2).toBeLessThanOrEqual(DRUM_E_END + 1e-12);
      expect(angles[BAYS_PER_SIDE + i] - BAY_PITCH / 2).toBeGreaterThanOrEqual(DRUM_W_START - 1e-12);
      expect(angles[BAYS_PER_SIDE + i] + BAY_PITCH / 2).toBeLessThanOrEqual(DRUM_W_END + 1e-12);
    }
    expect(DRUM_E_START + BAYS_PER_SIDE * BAY_PITCH).toBeCloseTo(DRUM_E_END, 10);
    expect(DRUM_W_START + BAYS_PER_SIDE * BAY_PITCH).toBeCloseTo(DRUM_W_END, 10);
    // No bay spans either opening.
    for (const a of angles) {
      expect(inEntrance(a), `bay over the doorway at ${deg(a).toFixed(2)}°`).toBe(false);
      expect(inGate(a), `bay over the gate at ${deg(a).toFixed(2)}°`).toBe(false);
    }
    // The jamb geometry: a bay's outer jamb face is exactly its own edge, so
    // the bays flanking an opening end flush with the opening's jamb face.
    expect(coloSrc).toContain('const JAMB_W = (BAY_PITCH * R_WALL_MID - 2 * ARCH_R) / 2;');
    expect(JAMB_OFFSET + JAMB_W / 2 / R_WALL_MID).toBeCloseTo(BAY_PITCH / 2, 10);
    expect(JAMB_W).toBeGreaterThan(ARCH_R / 2); // still a pier, not a sliver
  });

  test('the tier-2 pilasters skip the gate as they skip the doorway', () => {
    expect(coloSrc).toContain('if (pierAngle <= Math.PI - GATE_HALF || pierAngle >= Math.PI + GATE_HALF)');
    // The one midpoint that falls across the gate is the seam between the two
    // arcs, and it is the only one the gate filter has to reject.
    const angles: number[] = [];
    for (let i = 0; i < BAYS_PER_SIDE; i++) angles.push(DRUM_E_START + (i + 0.5) * BAY_PITCH);
    for (let i = 0; i < BAYS_PER_SIDE; i++) angles.push(DRUM_W_START + (i + 0.5) * BAY_PITCH);
    const mids: number[] = [];
    for (let i = 0; i < angles.length - 1; i++) mids.push((angles[i] + angles[i + 1]) / 2);
    expect(mids.length).toBe(17);
    const acrossGate = mids.filter(inGate);
    expect(acrossGate.length).toBe(1);
    expect(acrossGate[0]).toBeCloseTo(Math.PI, 10);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. The gate itself
// ══════════════════════════════════════════════════════════════════════════

describe('B. The rear gate is a designed opening, not a leftover void', () => {
  test('16.08° wide — 5.40 units at the facade, on the bridge axis', () => {
    expect(deg(2 * GATE_HALF)).toBeCloseTo(16.08, 2);
    // The chord is exactly 2 × GATE_HALF_W by construction (sin ∘ asin).
    expect(2 * R_FACADE * Math.sin(GATE_HALF)).toBeCloseTo(2 * GATE_HALF_W, 10);
    expect(2 * GATE_HALF_W).toBeCloseTo(5.4, 10);
    // Its centre is θ = π, exactly the axis the portal faces down at θ = 0.
    expect(Math.cos(Math.PI - GATE_HALF)).toBeCloseTo(Math.cos(Math.PI + GATE_HALF), 10);
    // Much narrower than the 54° void it replaces: that was 18.19 of arc and
    // 17.52 of chord at this radius.
    // The old void was 2π − 2·REAR_SEAM (the 1.7π arc's complement).
    const REAR_VOID = 2 * Math.PI - 2 * REAR_SEAM;
    expect(deg(REAR_VOID)).toBeCloseTo(54, 6);
    expect(R_FACADE * REAR_VOID).toBeCloseTo(18.19, 2);
    expect(2 * R_FACADE * Math.sin(REAR_VOID / 2)).toBeCloseTo(17.52, 2);
  });

  test('it spans tier 1 only — head, lintel and a continuous drum above', () => {
    // Clear opening: the plinth's top to the spandrel band's underside.
    expect(SPANDREL_BOTTOM).toBeCloseTo(ARCH_SPRING + ARCH_R, 10);
    expect(SPANDREL_BOTTOM).toBeCloseTo(7.35, 10);
    expect(SILL_TOP).toBe(2.5); // the sill band's own top, cut away at the gate
    // The spandrel band (7.35 … 8.0) is driven by the entrance-only cut, so it
    // closes the gate's head; the tier-1 cornice above it spans the opening as
    // its lintel; tier 2 and the attic are complete rings.
    expect(bandsDrivenBy('FRONT_CUT_ARCS', 'SPANDREL_TOP - SPANDREL_BOTTOM')).toBe(1);
    expect(bandsDrivenBy('FRONT_CUT_ARCS', '[T1_CORNICE_R, T1_CORNICE_R, T1_CORNICE_H')).toBe(1);
    expect(coloSrc).toContain('const T1_CORNICE_Y = 8.2;');
    expect(coloSrc).toContain('const T1_CORNICE_H = 0.8;');
    expect(T1_CORNICE_Y - T1_CORNICE_H / 2).toBeCloseTo(7.8, 10); // lintel underside
    expect(T1_CORNICE_Y - T1_CORNICE_H / 2).toBeLessThan(SPANDREL_TOP);
    // …and tier 2 starts above all of it.
    expect(T2_BOTTOM).toBeGreaterThan(SPANDREL_TOP);
  });

  test('the drawbridge deck and its beams pass through it with clearance', () => {
    expect(DECK_HALF_EXTENT).toBeCloseTo(2.11, 10);
    expect(GATE_HALF_W - DECK_HALF_EXTENT).toBeGreaterThan(0.5);
    // The opening is 1.3 units narrower than the wall band it pierces, so the
    // deck never touches the jamb faces: at R_LINER the gate's clear half-width
    // is still wider than the deck.
    expect(R_LINER * Math.sin(GATE_HALF)).toBeGreaterThan(DECK_HALF_EXTENT);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. The collision registry
// ══════════════════════════════════════════════════════════════════════════

describe('C. The collision registry matches the completed drum', () => {
  test('the front arcs and the two rear quadrants together close the drum', () => {
    // The originals: unchanged ids, endpoints and subdivision (C-8.27/28).
    for (const [prefix, from, to] of [
      ['colo-wall-l', -Math.PI * 0.85, ENTRANCE_MIN],
      ['colo-wall-r', ENTRANCE_MAX, REAR_SEAM],
      ['colo-podium-l', -Math.PI * 0.85, -BOWL_GAP_HALF],
      ['colo-podium-r', BOWL_GAP_HALF, REAR_SEAM],
    ] as const) {
      const segs = findSegs(prefix);
      expect(segs.length, prefix).toBe(8);
    }
    // …and the appended rear quadrants, 2 segments each, on the rendered radii.
    for (const [prefix, radius, from, to] of [
      ['colo-rearwall-r', R_FACADE, REAR_SEAM, Math.PI - GATE_HALF],
      ['colo-rearwall-l', R_FACADE, Math.PI + GATE_HALF, Math.PI * 1.15],
      ['colo-rearpodium-r', R_ARENA_WALL, REAR_SEAM, Math.PI - BOWL_GAP_HALF],
      ['colo-rearpodium-l', R_ARENA_WALL, Math.PI + BOWL_GAP_HALF, Math.PI * 1.15],
    ] as const) {
      const segs = findSegs(prefix);
      expect(segs.length, prefix).toBe(2);
      const start = coloPoint(radius, from);
      const end = coloPoint(radius, to);
      expect(segs[0].x1, prefix).toBeCloseTo(start[0], 10);
      expect(segs[0].z1, prefix).toBeCloseTo(start[1], 10);
      expect(segs[segs.length - 1].x2, prefix).toBeCloseTo(end[0], 10);
      expect(segs[segs.length - 1].z2, prefix).toBeCloseTo(end[1], 10);
      for (const s of segs) {
        for (const [x, z] of [[s.x1, s.z1], [s.x2, s.z2]] as const) {
          expect(coloRadius(x, z), `${s.id} off the rendered radius`).toBeCloseTo(radius, 6);
        }
      }
    }
  });

  test('the drum is stone at every rendered angle, and open at both passages', () => {
    // Facade radius: stone at every angle outside the two openings.  Inside the
    // doorway bay the portal, the piers and the C-8.27 closures are what stands
    // there, so that bay is sampled by its own suite.
    for (let d = -179; d <= 179; d++) {
      const theta = (d * Math.PI) / 180;
      if (inEntrance(theta)) continue;
      if (inGate(theta)) continue; // the gate: asserted open just below
      // …sampled clear of the openings' edges, where the segment endpoints'
      // own player-radius influence still reaches.
      if (Math.abs(Math.abs(theta) - ENTRANCE_MAX) < 0.06) continue;
      if (Math.abs(offPi(theta) - GATE_HALF) < 0.06) continue;
      const [x, z] = facadePoint(theta);
      expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS), `${d}° should be stone`).toBe(true);
    }
    // The gate's own span is open on the facade radius.
    for (const d of [-176, 180, 176]) {
      const [x, z] = facadePoint((d * Math.PI) / 180);
      expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS), `gate blocked at ${d}°`).toBe(false);
    }
    // Podium radius: stone everywhere except the two 5.2-unit passages.
    for (let d = -179; d <= 179; d++) {
      const theta = (d * Math.PI) / 180;
      const [x, z] = podiumPoint(theta);
      const open = Math.abs(theta) < BOWL_GAP_HALF || offPi(theta) < BOWL_GAP_HALF;
      const nearEdge = Math.abs(Math.abs(theta) - BOWL_GAP_HALF) < 0.06
        || Math.abs(offPi(theta) - BOWL_GAP_HALF) < 0.06;
      if (nearEdge) continue;
      expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS), `podium ${d}° (open=${open})`).toBe(!open);
    }
  });

  test('both passages are clear across the full 1.3-unit wall thickness', () => {
    for (const [label, theta] of [['doorway', 0], ['gate', Math.PI]] as const) {
      for (const r of [R_ARENA_WALL, (R_ARENA_WALL + R_FACADE) / 2, R_LINER, R_FACADE]) {
        for (const x of [-2.0, -1.0, 0, 1.0, 2.0]) {
          const z = COLO_ROOT_Z + Math.sqrt(Math.max(r * r - x * x, 0)) * (theta === 0 ? 1 : -1);
          expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS), `${label} blocked at r=${r}, X=${x}`).toBe(false);
        }
      }
    }
  });

  test('the Colosseum holds its colliders — the front set, eight rear ones and two seals', () => {
    const coloIds = CITY_COLLIDERS.filter((c) => c.id.startsWith('colo-')).map((c) => c.id).sort();
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
      // Phase C-8.33 appended one lateral seal per gate jamb (its own suite,
      // phaseC8_33.test.ts, owns their geometry).  Everything above is the set
      // this phase shipped, unchanged.
      'colo-gateseal-l',
      'colo-gateseal-r',
    ].sort();
    expect(coloIds).toEqual(expected);
    expect(coloIds.length).toBe(46);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. Traversal
// ══════════════════════════════════════════════════════════════════════════

describe('D. The gate is the arena\'s second way in and out', () => {
  test('a radial walk escapes only on the two passages', () => {
    // Outward from the sand: only the doorway (θ = 0) and the gate (θ = π).
    for (const d of [0, 180]) {
      const theta = (d * Math.PI) / 180;
      const outward = push(0, COLO_ROOT_Z, Math.sin(theta), Math.cos(theta), 60);
      expect(outward.trail.some(([x, z]) => outsideBuilding(x, z)), `${d}° should escape`).toBe(true);
    }
    for (const d of [30, 45, 60, 90, 120, 150, 210, 240, 270, 300, 330]) {
      const theta = (d * Math.PI) / 180;
      const outward = push(0, COLO_ROOT_Z, Math.sin(theta), Math.cos(theta), 60);
      expect(outward.trail.some(([x, z]) => outsideBuilding(x, z)), `${d}° should be stopped`).toBe(false);
    }
    // …and inward from the city: only the gate (θ = 180°); the front door is
    // reached from the avenue, not radially.
    for (const d of [90, 120, 150, 165, 195, 210, 240, 270]) {
      const theta = (d * Math.PI) / 180;
      const [sx, sz] = coloPoint(R_FACADE + 2.0, theta);
      const south = push(sx, sz, -Math.sin(theta), -Math.cos(theta), 60);
      expect(south.trail.some(([x, z]) => onSand(x, z)), `${d}° should not admit`).toBe(false);
    }
    const [gx, gz] = coloPoint(R_FACADE + 2.0, Math.PI);
    expect(push(gx, gz, 0, 1, 60).trail.some(([x, z]) => onSand(x, z))).toBe(true);
  });

  test('walking out through the gate reaches the city, and back in reaches the sand', () => {
    for (const x of [-1.5, -0.75, 0, 0.75, 1.5]) {
      const out = push(x, -30, 0, -1, 60);
      expect(out.trail.some(([px, pz]) => outsideBuilding(px, pz)), `gate exit at X = ${x}`).toBe(true);
      const backIn = push(x, -44.0, 0, 1, 60);
      expect(backIn.trail.some(([px, pz]) => onSand(px, pz)), `gate entry at X = ${x}`).toBe(true);
    }
  });

  test('the bridge corridor north of the gate is clear to the motte', () => {
    // The corridor scripts/collisionTests.ts asserts ("fortress: does not
    // overlap Colosseum colliders") — unchanged by the drum closing.
    for (let z = -43; z >= -49; z -= 0.25) {
      expect(collidesWith(0, z, PLAYER_RADIUS, CITY_COLLIDERS), `bridge corridor (0, ${z.toFixed(2)})`).toBe(false);
    }
    // …and it is reachable from the sand in one straight walk.
    const out = push(0, -30, 0, -1, 90);
    expect(out.end[1]).toBeLessThan(-48);
    expect(Math.abs(out.end[0])).toBeLessThan(PLAYER_RADIUS);
  });

  test('nothing crosses the completed drum anywhere else', () => {
    const crossedDrum = (trail: Array<[number, number]>) => trail.some(([x, z]) => (
      coloRadius(x, z) < R_LINER && offGate(x, z) > GATE_HALF
    ));
    for (const x of [3.5, 5, 6.5, 8, 9, 12, -3.5, -5, -6.5, -8, -9, -12]) {
      const south = push(x, -46, 0, 1, 60);
      expect(crossedDrum(south.trail), `crossed the rear drum at X = ${x}`).toBe(false);
      expect(south.trail.some(([px, pz]) => onSand(px, pz)), `reached the sand at X = ${x}`).toBe(false);
      const north = push(x, -33, 0, -1, 60);
      expect(north.trail.some(([px, pz]) => outsideBuilding(px, pz)), `escaped at X = ${x}`).toBe(false);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. The drawbridge, measured against the gate
// ══════════════════════════════════════════════════════════════════════════

describe('E. The drawbridge lines up with the gate', () => {
  test('the deck lands on the outer bank, 6.2 north of the gate face (C-8.38)', () => {
    const facadeZ = COLO_ROOT_Z - R_FACADE; // −44.3
    expect(facadeZ).toBeCloseTo(-44.3, 10);
    // Phases C-8.37 and C-8.38 each moved the northern group — motte, moat,
    // drawbridge and fortress — 5.0 units north.  The deck used to lie inside
    // the gateway by 3.8 (its southern end at Z = −40.5, radius 15.5 inside the
    // bowl); since the group moved while its own 6.0-unit span did not, that
    // southern end is now the moat's outer shoreline, 6.2 north of the gate
    // face (and 6.0 north of the Colosseum's rear-most stone, its gate lintel
    // at −44.5).  The 10.0 units of extra separation appear exactly as this
    // strip of open ground.
    expect(facadeZ - BRIDGE_Z_OUTER).toBeCloseTo(6.2, 6);
    expect(BRIDGE_Z_OUTER).toBe(-50.5);
    // C-8.37's own step measured 1.2 against this same face.
    expect((BRIDGE_Z_OUTER + 5.0) - facadeZ).toBeCloseTo(-1.2, 6);
    expect(BRIDGE_Z_OUTER).toBeLessThan(facadeZ);      // north of the gate face
    expect(DECK_Z_MOTTE).toBeLessThan(BRIDGE_Z_OUTER); // the deck's own direction
    // …and it still spans the moat exactly, as C-8.36 fixed it: south end on
    // the outer shoreline, north end 0.5 past the inner one.
    expect(bridgeSrc).toContain('DECK_Z_OUTER = BRIDGE_Z_OUTER');
    expect(bridgeSrc).toContain('DECK_Z_INNER = BRIDGE_Z_INNER - 0.5');
    // Its width is inside the gate's clear width, with >0.5 either side.
    expect(BRIDGE_HALF_WIDTH).toBe(2.0);
    expect(GATE_HALF_W - (BRIDGE_HALF_WIDTH + BEAM_WIDTH)).toBeGreaterThan(0.45);
  });

  test('the route out of the gate onto the deck is clear end to end', () => {
    const facadeZ = COLO_ROOT_Z - R_FACADE; // −44.3
    // The whole threshold strip between the gate face and the deck's south end
    // is open ground on the bridge axis — no collider of the gate seals, the
    // rear drum, the podium or the motte perimeter reaches the X = 0 line.
    for (let z = facadeZ; z >= BRIDGE_Z_OUTER - 0.001; z -= 0.1) {
      expect(collidesWith(0, z, PLAYER_RADIUS, CITY_COLLIDERS), `threshold (0, ${z})`).toBe(false);
    }
    // The bowl cut is unchanged, so the arena-side passage the deck used to
    // occupy is plain walkable sand — the cavea still never reaches the line.
    const deckSouth = [0, BRIDGE_Z_OUTER] as const;
    const r = coloRadius(...deckSouth);
    expect(r).toBeCloseTo(R_FACADE + 6.2, 6);  // 25.5 — 6.2 outside the wall band
    expect(r).toBeGreaterThan(R_FACADE);
    for (const deckR of [R_ARENA_WALL + 0.1, 15.5, SEATING_T1_R_OUT, SEATING_T2_R_OUT]) {
      expect(deckR * Math.sin(BOWL_GAP_HALF)).toBeGreaterThan(DECK_HALF_EXTENT);
    }
    // The deck's own walking surface is above the moat film and the sand.
    expect(DECK_TOP_Y).toBeCloseTo(0.16, 10);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. Invariants
// ══════════════════════════════════════════════════════════════════════════

describe('F. Nothing else about the Colosseum moved', () => {
  test('the monumental entrance is untouched', () => {
    expect(ENTRANCE_MIN).toBe(-0.43);
    expect(ENTRANCE_MAX).toBe(0.43);
    expect(coloSrc).toContain('const ENTRANCE_MIN = -0.43;');
    expect(coloSrc).toContain('const ENTRANCE_MAX = 0.43;');
    // The portal piers and lintel are still the C-8.27 ones.
    expect(findRect('colo-pier-l')).toMatchObject({ cx: -3.925, cz: -9.8, hw: 2.65 / 2, hd: 3.4 / 2 });
    expect(findRect('colo-pier-r')).toMatchObject({ cx: 3.925, cz: -9.8, hw: 2.65 / 2, hd: 3.4 / 2 });
    expect(findRect('colo-flank-l').cx).toBeCloseTo(-6.6478, 3);
    expect(findRect('colo-flank-l').cz).toBeCloseTo(-7.7785, 3);
    expect(findRect('colo-flank-r').cx).toBeCloseTo(6.6478, 3);
    expect(findRect('colo-flank-r').cz).toBeCloseTo(-7.7785, 3);
    // …and the doorway is still collision-free right through the bowl.
    for (const x of [-2.0, -1.0, 0, 1.0, 2.0]) {
      for (const z of [-6.5, -7.5, -9.925, -12.0]) {
        expect(collidesWith(x, z, PLAYER_RADIUS, CITY_COLLIDERS), `doorway (${x}, ${z})`).toBe(false);
      }
    }
  });

  test('unrelated city colliders keep their geometry and their counts', () => {
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('motte-wall')).length).toBe(20);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('fortress-')).length).toBe(5);
    expect(CITY_COLLIDERS.filter((c) => c.id.startsWith('yard-wall')).length).toBe(14);
    // Imperial fountain replacement: 8 m base diameter → radius 4.0 (was 3.6).
    expect(CITY_COLLIDERS.find((c) => c.id === 'fountain')).toMatchObject({ cx: 0, cz: 0, r: 4.0 });
    expect(CITY_COLLIDERS.find((c) => c.id === 'general-store')).toMatchObject({ cx: 22, cz: -5 });
  });

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
});
