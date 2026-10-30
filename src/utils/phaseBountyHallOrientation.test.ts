/**
 * Phase P1 — Bounty Hall orientation correction.
 *
 * Run with: bun test src/utils/phaseBountyHallOrientation.test.ts
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * The hall's root group carried no rotation, so its front — the recessed timber
 * doorway at local Z +2.52, the contract notice board at local Z +2.6, and the
 * crate/spear display — faced +Z, i.e. away from the Forum Socialis and the city
 * centre.  Fast travel landed the player at [-15, 30], 1.0 north of the hall's
 * rear collider face (Z 29.0): the arrival, and every approach from the forum,
 * met a windowless back wall.
 *
 * ── THE FIX (bounded) ─────────────────────────────────────────────────────
 * Only the root group's yaw and the fast-travel arrival move:
 *   - `BountyHall.tsx` — root `[-15, 0, 26]` gains `rotation={[0, Math.PI, 0]}`.
 *   - `cityCollisions.ts` — `FAST_TRAVEL_ARRIVALS.bounty_hall` [-15, 30] -> [-15, 22],
 *     1.0 south of the collider's new front face (Z 23.0).
 * The collider (`RECT('bounty-hall', -15, 26, 7.0, 6.0)`), the interaction hub
 * (centre [-15, 0, 26], radius 4.5), the fountain, and every other building's
 * position and footprint are untouched.  A 180 deg yaw about Y is a rigid motion
 * of a rotationally symmetric massing (6.0 x 5.0 walls, centred ridge roof), so
 * no footprint can grow: only the front-side props change face.
 *
 * ── WHAT THIS SUITE PINS ──────────────────────────────────────────────────
 *   A. the root position and yaw, read from the component's own source;
 *   B. the doorway, notice board and window world positions and facings;
 *   C. the unchanged collider, and that every moved prop stays inside it;
 *   D. the unchanged interaction hub — centre, radius, doorway band;
 *   E. the new arrival: clearance, world boundary, and the prompt it raises;
 *   F. a collision-free approach from the Forum Socialis, driven with the
 *      shipped movement resolver;
 *   G. the fast-travel table: nothing but the bounty hall row moved, and every
 *      arrival is still collision-free with the 0.9 invariant.
 */
// @ts-ignore — bun:test is available at runtime via bun test
import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  PLAYER_RADIUS,
  CITY_COLLIDERS,
  collidesWith,
  type RectCollider,
} from './collisionShapes';
import {
  HUB_LOCATIONS,
  FAST_TRAVEL_ARRIVALS,
  getNearbyHubLocation,
  resolveCityMovement,
  BOUNDARY_X,
  BOUNDARY_Z_MAX,
  BOUNDARY_Z_MIN,
  type InteractiveLocation,
} from './cityCollisions';

// ── Sources ───────────────────────────────────────────────────────────────

const load = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const hallSrc = load('../components/3d/city/BountyHall.tsx');

const R = PLAYER_RADIUS;
/** Documented Phase 31D arrival invariant: player radius + 0.5 safety margin. */
const ARRIVAL_CLEARANCE = R + 0.5; // 0.9

// ── Tiny parsers (same style as phaseC8_18 / phaseC8_19 / phaseC8_21) ─────

const NUM = '(-?\\d+(?:\\.\\d+)?)';

/** First `[a, b, c]` captured by `re`. */
function triple(src: string, re: RegExp, label: string): [number, number, number] {
  const m = re.exec(src);
  if (!m) throw new Error(`not found: ${label}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

const root = triple(
  hallSrc,
  new RegExp(`<group position=\\{\\[${NUM}, ${NUM}, ${NUM}\\]\\} rotation=\\{\\[0, Math\\.PI, 0\\]\\}>`),
  'BountyHall root group with yaw',
);

const doorwayLocal = triple(
  hallSrc,
  new RegExp(`<ClassicalDoorway\\s+position=\\{\\[${NUM}, ${NUM}, ${NUM}\\]\\}`),
  'ClassicalDoorway position',
);

const noticeBoardLocal = triple(
  hallSrc,
  new RegExp(`NOTICE BOARD[\\s\\S]{0,140}?<group position=\\{\\[${NUM}, ${NUM}, ${NUM}\\]\\}>`),
  'notice board group position',
);

const windowLocal = triple(
  hallSrc,
  new RegExp(`<ClassicalWindow\\s+position=\\{\\[${NUM}, ${NUM}, ${NUM}\\]\\}`),
  'ClassicalWindow position',
);

// ── Rigid-body helpers ────────────────────────────────────────────────────

/** The root's own yaw, read off its `rotation={[0, Math.PI, 0]}` declaration. */
const ROOT_YAW = Math.PI;

/** three.js Y-axis rotation of a local offset. */
const rotateY = (
  [x, y, z]: [number, number, number],
  yaw: number,
): [number, number, number] => [
  x * Math.cos(yaw) + z * Math.sin(yaw),
  y,
  -x * Math.sin(yaw) + z * Math.cos(yaw),
];

/** Local point -> world point under the root's position + yaw. */
const toWorld = (local: [number, number, number]): [number, number, number] => {
  const r = rotateY(local, ROOT_YAW);
  return [root[0] + r[0], root[1] + r[1], root[2] + r[2]];
};

/** A local forward axis (the doorway, board and window all face local +Z) -> world. */
const facingWorld = (localYaw = 0): [number, number, number] => {
  const local: [number, number, number] = [Math.sin(localYaw), 0, Math.cos(localYaw)];
  return rotateY(local, ROOT_YAW);
};

const DOOR_WORLD = toWorld(doorwayLocal);
const BOARD_WORLD = toWorld(noticeBoardLocal);
const WINDOW_WORLD = toWorld(windowLocal);
const WINDOW_WORLD_YAW = -Math.PI / 2 + ROOT_YAW;

const hub = (id: string): InteractiveLocation => {
  const found = HUB_LOCATIONS.find((l) => l.id === id);
  if (!found) throw new Error(`no hub ${id}`);
  return found;
};

const rect = (id: string): RectCollider => {
  const found = CITY_COLLIDERS.find((c) => c.id === id);
  if (!found || found.type !== 'rect') throw new Error(`no rect collider ${id}`);
  return found;
};

const hall = rect('bounty-hall');
const bounty = hub('bounty_hall');

/** Closest a 0.4-radius player can stand to the hub centre on its front (-Z) side. */
const FRONT_STANDOFF = hall.hd + R; // 3.0 + 0.4 = 3.4

/**
 * Walk with the *shipped* resolver at the shipped speed (3.8 u/s, 1/60 s steps)
 * and report the first hub prompt passed through.
 */
const walkToPrompt = (
  start: [number, number],
  target: [number, number],
  maxSteps = 400,
): { prompt: string | null; steps: number; blocked: boolean } => {
  let cur: [number, number, number] = [start[0], 0, start[1]];
  const first = getNearbyHubLocation(cur);
  if (first) return { prompt: first.id, steps: 0, blocked: false };
  for (let s = 0; s < maxSteps; s++) {
    const dx = target[0] - cur[0];
    const dz = target[1] - cur[2];
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return { prompt: null, steps: s, blocked: false };
    const bx = cur[0];
    const bz = cur[2];
    cur = resolveCityMovement(cur, dx / len, dz / len, 3.8, 1 / 60);
    if (Math.abs(cur[0] - bx) < 1e-9 && Math.abs(cur[2] - bz) < 1e-9) {
      return { prompt: null, steps: s, blocked: true };
    }
    const hit = getNearbyHubLocation(cur);
    if (hit) return { prompt: hit.id, steps: s + 1, blocked: false };
  }
  return { prompt: null, steps: maxSteps, blocked: false };
};

// ══════════════════════════════════════════════════════════════════════════
// A. Root transform
// ══════════════════════════════════════════════════════════════════════════

describe('A. The root group keeps its position and gains exactly one 180 deg yaw', () => {
  test('position is still [-15, 0, 26]', () => {
    expect(root).toEqual([-15, 0, 26]);
  });

  test('the yaw is 180 deg about Y and is declared exactly once', () => {
    expect(ROOT_YAW).toBe(Math.PI);
    const yawDeclarations = hallSrc.match(/rotation=\{\[0, Math\.PI, 0\]\}/g) ?? [];
    expect(yawDeclarations.length).toBe(1);
  });

  test('the root group carries no other rotation component', () => {
    expect(hallSrc).toContain('<group position={[-15, 0, 26]} rotation={[0, Math.PI, 0]}>');
    // The only other rotation in the file is the window's own -pi/2, unchanged.
    expect(hallSrc).toContain('rotation={[0, -Math.PI / 2, 0]}');
  });

  test('a rotationally symmetric massing: the walls and the roof are centred on the root', () => {
    // 6.0 x 5.0 walls on a 6.5 x 5.5 foundation, ridge roof centred, so a 180 deg
    // yaw maps the footprint onto itself and no dimension can change.
    expect(hallSrc).toContain('<boxGeometry args={[6.0, 3.0, 5.0]} />');
    expect(hallSrc).toContain('size={[6.5, 5.5]} height={0.3}');
    expect(hallSrc).toContain('depth={5.0}');
    expect(hallSrc).toContain('ridgeAlong="z"');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// B. Door, notice board and window
// ══════════════════════════════════════════════════════════════════════════

describe('B. The front elements now face the forum side (-Z)', () => {
  test('the doorway keeps its local offset and lands at [-13.8, 0.6, 23.48]', () => {
    expect(doorwayLocal).toEqual([-1.2, 0.6, 2.52]);
    expect(DOOR_WORLD[0]).toBeCloseTo(-13.8, 10);
    expect(DOOR_WORLD[1]).toBeCloseTo(0.6, 10);
    expect(DOOR_WORLD[2]).toBeCloseTo(23.48, 10);
  });

  test('the doorway faces the forum (-Z), and sits proud of the south wall face', () => {
    const [fx, , fz] = facingWorld(0);
    expect(fx).toBeCloseTo(0, 10);
    expect(fz).toBeCloseTo(-1, 10); // world forward is -Z
    expect(DOOR_WORLD[2]).toBeLessThan(root[2]); // in front of the root, not behind it
    // Wall half-depth 2.5 -> south face at Z 23.50; the doorway is 0.02 proud.
    expect(DOOR_WORLD[2]).toBeCloseTo(root[2] - 2.5 - 0.02, 10);
  });

  test('the notice board lands at [-16.8, 0.3, 23.4] facing the forum', () => {
    expect(noticeBoardLocal).toEqual([1.8, 0.3, 2.6]);
    expect(BOARD_WORLD[0]).toBeCloseTo(-16.8, 10);
    expect(BOARD_WORLD[1]).toBeCloseTo(0.3, 10);
    expect(BOARD_WORLD[2]).toBeCloseTo(23.4, 10);
    const [fx, , fz] = facingWorld(0);
    expect(fx).toBeCloseTo(0, 10);
    expect(fz).toBeCloseTo(-1, 10);
    // 0.10 proud of the wall face, mirroring the pre-rotation 28.6 / 28.5.
    expect(BOARD_WORLD[2]).toBeCloseTo(root[2] - 2.5 - 0.10, 10);
  });

  test('the doorway and the notice board are both on the front face', () => {
    for (const [x, , z] of [DOOR_WORLD, BOARD_WORLD]) {
      expect(x).toBeGreaterThan(hall.cx - hall.hw);
      expect(x).toBeLessThan(hall.cx + hall.hw);
      expect(z).toBeLessThan(hall.cz); // forum side of the building centre
    }
  });

  test('the window moves to the east wall at [-11.98, 2.2, 26] facing +X', () => {
    expect(windowLocal).toEqual([-3.02, 2.2, 0]);
    expect(WINDOW_WORLD[0]).toBeCloseTo(-11.98, 10);
    expect(WINDOW_WORLD[1]).toBeCloseTo(2.2, 10);
    expect(WINDOW_WORLD[2]).toBeCloseTo(26, 10);
    expect(WINDOW_WORLD_YAW).toBeCloseTo(Math.PI / 2, 10);
    const [fx, , fz] = facingWorld(-Math.PI / 2);
    expect(fx).toBeCloseTo(1, 10); // +X
    expect(fz).toBeCloseTo(0, 10);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C. The collider is untouched, and the moved props stay inside it
// ══════════════════════════════════════════════════════════════════════════

describe('C. The collision footprint is unchanged', () => {
  test('RECT("bounty-hall", -15, 26, 7.0, 6.0) is exactly what it was', () => {
    expect(hall.cx).toBe(-15);
    expect(hall.cz).toBe(26);
    expect(hall.hw).toBe(3.5);
    expect(hall.hd).toBe(3.0);
  });

  test('its faces land where the arrival comment says: Z 23.0 ... 29.0, X -18.5 ... -11.5', () => {
    expect(hall.cz - hall.hd).toBeCloseTo(23.0, 10);
    expect(hall.cz + hall.hd).toBeCloseTo(29.0, 10);
    expect(hall.cx - hall.hw).toBeCloseTo(-18.5, 10);
    expect(hall.cx + hall.hw).toBeCloseTo(-11.5, 10);
  });

  test('every prop the yaw moved still lies inside the footprint', () => {
    // The doorway threshold reaches 0.42 past its own origin along the front and
    // the notice board panel 0.08 past its group; both must stay inside the 3.0
    // half-depth and the 3.5 half-width, so no prop can cross a neighbour.
    for (const [x, , z] of [DOOR_WORLD, BOARD_WORLD]) {
      expect(Math.abs(x - hall.cx)).toBeLessThan(hall.hw);
      expect(z).toBeGreaterThan(hall.cz - hall.hd);
    }
    expect(DOOR_WORLD[2] - 0.42).toBeGreaterThan(hall.cz - hall.hd); // threshold step
    expect(BOARD_WORLD[2] - 0.08).toBeGreaterThan(hall.cz - hall.hd); // board panel
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D. The interaction hub is untouched
// ══════════════════════════════════════════════════════════════════════════

describe('D. The interaction hub keeps its centre and radius', () => {
  test('centre [-15, 0, 26]', () => {
    expect([bounty.position[0], bounty.position[1], bounty.position[2]]).toEqual([-15, 0, 26]);
  });

  test('radius 4.5', () => {
    expect(bounty.radius).toBe(4.5);
  });

  test('the disc still reaches its doorway from the new front: 4.5 - 3.4 = 1.10 band', () => {
    expect(FRONT_STANDOFF).toBeCloseTo(3.4, 10);
    expect(bounty.radius - FRONT_STANDOFF).toBeCloseTo(1.1, 10);
    expect(bounty.radius - FRONT_STANDOFF).toBeGreaterThanOrEqual(0.8); // player diameter
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E. The new arrival
// ══════════════════════════════════════════════════════════════════════════

describe('E. The arrival moved to the forum side of the hall', () => {
  const arrival = FAST_TRAVEL_ARRIVALS.bounty_hall;

  test('it is [-15, 22]', () => {
    expect(arrival).toEqual([-15, 22]);
  });

  test('it is 1.0 south of the collider face, clearing the 0.9 invariant', () => {
    const clearance = hall.cz - hall.hd - arrival[1];
    expect(clearance).toBeCloseTo(1.0, 10);
    expect(clearance).toBeGreaterThanOrEqual(ARRIVAL_CLEARANCE);
  });

  test('it is collision-free at the player radius and with the 0.9 clearance', () => {
    expect(collidesWith(arrival[0], arrival[1], R, CITY_COLLIDERS)).toBe(false);
    expect(collidesWith(arrival[0], arrival[1], ARRIVAL_CLEARANCE, CITY_COLLIDERS)).toBe(false);
  });

  test('it is inside the world boundary', () => {
    expect(Math.abs(arrival[0])).toBeLessThanOrEqual(BOUNDARY_X);
    expect(arrival[1]).toBeLessThanOrEqual(BOUNDARY_Z_MAX);
    expect(arrival[1]).toBeGreaterThanOrEqual(BOUNDARY_Z_MIN);
  });

  test('it lands inside the hub radius and raises this hall own prompt', () => {
    const d = Math.hypot(arrival[0] - bounty.position[0], arrival[1] - bounty.position[2]);
    expect(d).toBeCloseTo(4.0, 10);
    expect(d).toBeLessThanOrEqual(bounty.radius);
    expect(getNearbyHubLocation([arrival[0], 0, arrival[1]])?.id).toBe('bounty_hall');
  });

  test('the arrival is in front of the doorway, on the root centre line', () => {
    expect(arrival[1]).toBeLessThan(DOOR_WORLD[2]); // in front of the door
    expect(arrival[0]).toBeCloseTo(root[0], 10);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// F. Reachable approach from the Forum Socialis
// ══════════════════════════════════════════════════════════════════════════

describe('F. The hall is approachable from the Forum Socialis', () => {
  // Forum Socialis floor: plane centre [-21, 20], 8.0 x 8.0 -> X -25..-17, Z 16..24.
  const FORUM_POINT: [number, number] = [-18, 21];

  test('the forum-side start point is standing ground', () => {
    expect(collidesWith(FORUM_POINT[0], FORUM_POINT[1], R, CITY_COLLIDERS)).toBe(false);
  });

  test('walking from the forum to the doorway raises the hall prompt, never blocked', () => {
    const target: [number, number] = [root[0], root[2] - FRONT_STANDOFF];
    const { prompt, blocked } = walkToPrompt(FORUM_POINT, target);
    expect(blocked).toBe(false);
    expect(prompt).toBe('bounty_hall');
  });

  test('the fast-travel arrival already stands inside the disc', () => {
    const { prompt, steps } = walkToPrompt(FAST_TRAVEL_ARRIVALS.bounty_hall, [
      root[0],
      root[2] - FRONT_STANDOFF,
    ]);
    expect(prompt).toBe('bounty_hall');
    expect(steps).toBe(0);
  });

  test('a straight walk from the forum into the front face never enters the footprint', () => {
    let cur: [number, number, number] = [FORUM_POINT[0], 0, FORUM_POINT[1]];
    for (let s = 0; s < 400; s++) {
      cur = resolveCityMovement(cur, 1, 0.35, 3.8, 1 / 60); // east-north-east, into the hall
      expect(collidesWith(cur[0], cur[2], R, CITY_COLLIDERS)).toBe(false);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// G. No regression in the fast-travel destination checks
// ══════════════════════════════════════════════════════════════════════════

describe('G. The fast-travel table: only the bounty hall row moved', () => {
  // Every other row exactly as `scripts/collisionTests.ts` pins it.
  const PINNED: Record<string, [number, number]> = {
    town_gate: [0, 20],
    colosseum: [0, -23],
    training_yard: [-18, 2],
    smithing_forge: [11.5, 2.6],
    general_store: [17, -5],
    tavern: [-10, 14],
    caravanserai: [10, 14],
    merchant_house: [21, -13],
    armor_workshop: [28.2, 5.5],
    stable: [26, 10],
    gladiator_academy: [25.5, -23],
    doctore_house: [23.5, -18.875],
    records_house: [23.1, -26],
    bathhouse: [-21, 25],
    shrine_temple: [-22.5, 11],
    bounty_hall: [-15, 22],
    gladiator_barracks: [-22, -14],
    veteran_gladiator_hall: [-24, -29],
    arena_medical_house: [-29, -9],
  };

  test('every non-northern row matches, and the bounty hall is the only change', () => {
    for (const [id, coords] of Object.entries(PINNED)) {
      expect(FAST_TRAVEL_ARRIVALS[id], id).toEqual(coords);
    }
  });

  test('every hub still has exactly one arrival', () => {
    for (const loc of HUB_LOCATIONS) {
      expect(FAST_TRAVEL_ARRIVALS[loc.id], loc.id).toBeDefined();
    }
    expect(Object.keys(FAST_TRAVEL_ARRIVALS).length).toBe(HUB_LOCATIONS.length);
  });

  test('every arrival is still collision-free with the 0.9 clearance', () => {
    const failures = HUB_LOCATIONS.filter((loc) => {
      const [ax, az] = FAST_TRAVEL_ARRIVALS[loc.id];
      return collidesWith(ax, az, ARRIVAL_CLEARANCE, CITY_COLLIDERS);
    }).map((loc) => loc.id);
    expect(failures).toEqual([]);
  });

  test('the fountain and the neighbouring hubs are untouched', () => {
    // The fountain is a circle collider at the origin; the nearest hubs keep
    // their centres and radii.
    const fountain = CITY_COLLIDERS.find((c) => c.id === 'fountain');
    expect(fountain, 'fountain collider').toBeDefined();
    expect(hub('bathhouse').position).toEqual([-26, 0, 25]);
    expect(hub('shrine_temple').position).toEqual([-27, 0, 11]);
    expect(hub('bounty_hall').position).toEqual([-15, 0, 26]);
    expect([hub('bathhouse').radius, hub('shrine_temple').radius]).toEqual([4.75, 4.5]);
  });
});
